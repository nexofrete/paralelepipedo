// Cobrança de serviços extras (estilo SSW): reentrega, devolução, estadia,
// armazenagem e descarga. Preço padrão da empresa e por cliente (quem paga o
// frete). As ocorrências de entrega e o "cheguei" do app do motorista geram
// as cobranças pendentes; o financeiro aprova, ajusta o valor e gera o
// documento: CT-e complementar (serviço de transporte) ou NFS-e (armazenagem).
const pool = require('./db');
const Doc = require('./utils/documento');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => { if (v === '' || v == null) return null; const n = typeof v === 'number' ? v : Number(String(v).includes(',') ? String(v).replace(/\./g, '').replace(',', '.') : v); return Number.isFinite(n) ? n : null; };

const SERVICOS = {
  reentrega: { nome: 'Reentrega', componente: 'REENTREGA', documento: 'cte', modos: ['percentual', 'fixo'], padrao: { modo: 'percentual', valor: 50 } },
  devolucao: { nome: 'Devolução', componente: 'DEVOLUCAO', documento: 'cte', modos: ['percentual', 'fixo'], padrao: { modo: 'percentual', valor: 100 } },
  estadia: { nome: 'Estadia (veículo parado)', componente: 'ESTADIA', documento: 'cte', modos: ['por_hora', 'fixo'], padrao: { modo: 'por_hora', valor: 0, franquia: 5 } },
  armazenagem: { nome: 'Armazenagem', componente: 'ARMAZENAGEM', documento: 'nfse', modos: ['por_dia', 'mercadoria_dia', 'fixo'], padrao: { modo: 'por_dia', valor: 0, franquia: 3 } },
  descarga: { nome: 'Descarga / ajudante', componente: 'DESCARGA', documento: 'cte', modos: ['fixo', 'percentual'], padrao: { modo: 'fixo', valor: 0 } },
};
const MODOS = { percentual: '% do frete', fixo: 'Valor fixo', por_hora: 'R$ por hora (depois da franquia)', por_dia: 'R$ por dia (depois da franquia)', mercadoria_dia: '% da mercadoria por dia (depois da franquia)' };
const STATUS = { pendente: 'Para aprovar', aprovada: 'Aprovada (a cobrar)', cobrada: 'Cobrada', cancelada: 'Cancelada' };
// Falha na entrega por motivo do cliente: a nova tentativa é cobrada como reentrega.
const MOTIVOS_REENTREGA = ['fechado', 'ausente', 'horario', 'reentrega_cliente', 'balanco', 'endereco', 'mudou'];

const tomadorDoc = (d = {}) => { const p = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {}; return Doc.limpar(p.cnpj || p.cpf) || null; };
const tomadorNome = (d = {}) => ({ 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {}).xNome || '';

// ---------- Preços ----------
async function regras() {
  const { rows } = await pool.query('SELECT * FROM servicos_extras_regras ORDER BY cliente_doc NULLS FIRST, cliente_nome, servico');
  const padrao = Object.fromEntries(Object.entries(SERVICOS).map(([k, s]) => {
    const r = rows.find((x) => !x.cliente_doc && x.servico === k);
    return [k, r ? lerRegra(r) : { servico: k, ...s.padrao, minimo: 0, franquia: s.padrao.franquia || 0, ativo: true, sem_cadastro: true }];
  }));
  return { servicos: Object.fromEntries(Object.entries(SERVICOS).map(([k, s]) => [k, { nome: s.nome, documento: s.documento, modos: s.modos }])), modos: MODOS, padrao, clientes: rows.filter((r) => r.cliente_doc).map(lerRegra) };
}
const lerRegra = (r) => ({ id: r.id, cliente_doc: r.cliente_doc, cliente_nome: r.cliente_nome, servico: r.servico, modo: r.modo, valor: Number(r.valor), minimo: Number(r.minimo), franquia: Number(r.franquia), ativo: r.ativo });

async function salvarRegra(b) {
  const s = SERVICOS[b.servico];
  if (!s) throw falha('Escolha o serviço.');
  if (!s.modos.includes(b.modo)) throw falha(`Para ${s.nome.toLowerCase()}, escolha: ${s.modos.map((m) => MODOS[m]).join(', ')}.`);
  const valor = num(b.valor); const minimo = num(b.minimo) || 0; const franquia = num(b.franquia) || 0;
  if (valor == null || valor < 0) throw falha('Informe o valor (0 para não cobrar).');
  if (['percentual'].includes(b.modo) && valor > 500) throw falha('Percentual alto demais.');
  const doc = b.cliente_doc ? Doc.limpar(b.cliente_doc) : null;
  if (b.cliente_doc && !Doc.valido(doc)) throw falha('CNPJ/CPF do cliente inválido.');
  let nome = null;
  if (doc) {
    const { rows } = await pool.query('SELECT razao_social FROM clientes WHERE documento = $1', [doc]);
    nome = String(b.cliente_nome || rows[0]?.razao_social || '').trim().slice(0, 200) || null;
  }
  const { rows } = await pool.query(
    `INSERT INTO servicos_extras_regras (cliente_doc, cliente_nome, servico, modo, valor, minimo, franquia, ativo, atualizado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (COALESCE(cliente_doc, ''), servico) DO UPDATE SET cliente_nome = COALESCE(EXCLUDED.cliente_nome, servicos_extras_regras.cliente_nome), modo = EXCLUDED.modo,
       valor = EXCLUDED.valor, minimo = EXCLUDED.minimo, franquia = EXCLUDED.franquia, ativo = EXCLUDED.ativo, atualizado_em = NOW() RETURNING *`,
    [doc, nome, b.servico, b.modo, valor, minimo, franquia, b.ativo !== false]);
  return lerRegra(rows[0]);
}
async function excluirRegra(id) {
  const { rowCount } = await pool.query('DELETE FROM servicos_extras_regras WHERE id = $1 AND cliente_doc IS NOT NULL', [id]);
  if (!rowCount) throw falha('Preço não encontrado (o padrão da empresa não se apaga: zere o valor).', 404);
}

// Preço que vale para o CT-e: o do cliente (quem paga o frete) ou o padrão.
async function regraPara(servico, d, cliente = pool) {
  const doc = tomadorDoc(d);
  const { rows } = await cliente.query(
    `SELECT * FROM servicos_extras_regras WHERE servico = $1 AND ativo AND (cliente_doc = $2 OR cliente_doc IS NULL) ORDER BY cliente_doc NULLS LAST LIMIT 1`, [servico, doc]);
  return rows[0] ? lerRegra(rows[0]) : { servico, ...SERVICOS[servico].padrao, minimo: 0, franquia: SERVICOS[servico].padrao.franquia || 0, ativo: true, sem_cadastro: true };
}

// Valor pela regra. base: { frete, mercadoria }; quantidade: horas ou dias.
function calcular(regra, { frete = 0, mercadoria = 0, quantidade = null } = {}) {
  const v = Number(regra.valor) || 0;
  const alem = Math.max(0, (Number(quantidade) || 0) - (Number(regra.franquia) || 0));
  let valor = 0;
  if (regra.modo === 'percentual') valor = (Number(frete) * v) / 100;
  else if (regra.modo === 'fixo') valor = v;
  else if (regra.modo === 'por_hora' || regra.modo === 'por_dia') valor = alem * v;
  else if (regra.modo === 'mercadoria_dia') valor = (alem * Number(mercadoria) * v) / 100;
  if (valor > 0 && Number(regra.minimo) > valor) valor = Number(regra.minimo);
  return centavos(valor);
}

// ---------- Cobranças ----------
async function cteBase(cteId, cliente = pool) {
  const { rows } = await cliente.query('SELECT id, serie, numero, status, dados, valor_total, demonstracao FROM ctes_emitidos WHERE id = $1', [cteId]);
  const c = rows[0];
  if (!c) throw falha('CT-e não encontrado.', 404);
  if (c.status !== 'autorizado') throw falha(`O CT-e ${c.numero || ''} não está autorizado.`);
  if (String(c.dados?.tpCTe ?? '0') === '1') throw falha('Serviço extra é cobrado sobre o CT-e original, não sobre o complementar.');
  return { ...c, frete: Number(c.dados?.valores?.vTPrest ?? c.valor_total) || 0, mercadoria: Number(c.dados?.carga?.vCarga) || 0 };
}

// Cria a cobrança pendente com o valor da regra.
async function criar({ cteId, servico, quantidade = null, origem = 'manual', ocorrenciaId = null, descricao = null, valor = null, usuario = null }, cliente = pool) {
  if (!SERVICOS[servico]) throw falha('Escolha o serviço.');
  const c = await cteBase(cteId, cliente);
  const regra = await regraPara(servico, c.dados, cliente);
  const calc = calcular(regra, { frete: c.frete, mercadoria: c.mercadoria, quantidade });
  const final = valor != null && num(valor) != null ? centavos(num(valor)) : calc;
  const { rows } = await cliente.query(
    `INSERT INTO cobrancas_extras (cte_id, servico, origem, ocorrencia_id, quantidade, valor_calculado, valor, descricao, criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (ocorrencia_id) DO NOTHING RETURNING *`,
    [cteId, servico, origem, ocorrenciaId, quantidade, calc, final, descricao ? String(descricao).slice(0, 300) : null, usuario]);
  return rows[0] || null;
}

// Depois das ocorrências lançadas: reentrega (falha por motivo do cliente) e devolução viram cobrança pendente.
async function aoLancarOcorrencias(lancadas) {
  for (const l of lancadas || []) {
    try {
      const { rows } = await pool.query('SELECT id, tipo_id, descricao FROM cte_ocorrencias WHERE id = $1', [l.id]);
      const o = rows[0];
      if (!o) continue;
      const servico = MOTIVOS_REENTREGA.includes(o.tipo_id) ? 'reentrega' : o.tipo_id === 'devolvido' ? 'devolucao' : null;
      if (!servico) continue;
      await criar({ cteId: l.cteId, servico, origem: 'ocorrencia', ocorrenciaId: o.id, descricao: o.descricao, usuario: 'automático' }).catch((e) => {
        if (!/não está autorizado|complementar/.test(e.message)) throw e;
      });
    } catch (e) { console.error('[servicos extras]', e.message); }
  }
}

// App do motorista: "cheguei no cliente" e, na baixa, a espera acima da franquia vira estadia pendente.
async function marcarChegada(romaneioId, cteId) {
  const { rowCount } = await pool.query('UPDATE romaneio_itens SET chegada_em = COALESCE(chegada_em, NOW()) WHERE romaneio_id = $1 AND cte_id = $2', [romaneioId, cteId]);
  if (!rowCount) throw falha('Essa entrega não é deste romaneio.', 404);
}
async function estadiaNaBaixa(romaneioId, cteId) {
  try {
    const { rows } = await pool.query('SELECT chegada_em FROM romaneio_itens WHERE romaneio_id = $1 AND cte_id = $2', [romaneioId, cteId]);
    if (!rows[0]?.chegada_em) return null;
    const horas = Math.round(((Date.now() - new Date(rows[0].chegada_em)) / 3600000) * 100) / 100;
    const c = await cteBase(cteId);
    const regra = await regraPara('estadia', c.dados);
    if (horas <= (Number(regra.franquia) || 0)) return null;
    const { rows: ja } = await pool.query(`SELECT 1 FROM cobrancas_extras WHERE cte_id = $1 AND servico = 'estadia' AND origem = 'app' AND status <> 'cancelada'`, [cteId]);
    if (ja[0]) return null;
    return criar({ cteId, servico: 'estadia', quantidade: horas, origem: 'app', descricao: `Esperou ${String(horas).replace('.', ',')} h no cliente (marcado no app)`, usuario: 'app do motorista' });
  } catch (e) { console.error('[servicos extras] estadia', e.message); return null; }
}

async function listar({ status = 'pendente', busca = '' } = {}) {
  const val = []; const cond = [];
  if (STATUS[status]) { val.push(status); cond.push(`x.status = $${val.length}`); }
  const b = String(busca || '').trim();
  if (b) { val.push(`%${b}%`, b.replace(/\D/g, '') || '-'); cond.push(`(c.tomador_nome ILIKE $${val.length - 1} OR c.destinatario_nome ILIKE $${val.length - 1} OR c.numero::text = $${val.length})`); }
  const { rows } = await pool.query(
    `SELECT x.*, x.valor::float, x.valor_calculado::float, x.quantidade::float, c.serie, c.numero, c.tomador_nome, c.destinatario_nome, c.cidade_fim, c.uf_fim, c.dados->'valores'->>'vTPrest' AS frete,
            o.data_hora AS ocorrencia_em,
            CASE x.documento_tipo WHEN 'cte' THEN (SELECT json_build_object('status', d.status, 'serie', d.serie, 'numero', d.numero) FROM ctes_emitidos d WHERE d.id = x.documento_id)
                                  WHEN 'nfse' THEN (SELECT json_build_object('status', n.status, 'numero', n.numero_nfse) FROM nfse_emitidas n WHERE n.id = x.documento_id) END AS documento
       FROM cobrancas_extras x JOIN ctes_emitidos c ON c.id = x.cte_id LEFT JOIN cte_ocorrencias o ON o.id = x.ocorrencia_id
      ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY x.criado_em DESC LIMIT 500`, val);
  const { rows: [cont] } = await pool.query(`SELECT ${Object.keys(STATUS).map((s) => `COUNT(*) FILTER (WHERE status = '${s}')::int AS ${s}, COALESCE(SUM(valor) FILTER (WHERE status = '${s}'), 0)::float AS ${s}_valor`).join(', ')} FROM cobrancas_extras`);
  return { cobrancas: rows.map((r) => ({ ...r, servico_nome: SERVICOS[r.servico]?.nome, status_nome: STATUS[r.status] })), contagens: cont, status: STATUS, servicos: Object.fromEntries(Object.entries(SERVICOS).map(([k, s]) => [k, s.nome])) };
}

async function alterar(id, b) {
  const { rows: [x] } = await pool.query('SELECT * FROM cobrancas_extras WHERE id = $1', [id]);
  if (!x) throw falha('Cobrança não encontrada.', 404);
  if (!['pendente', 'aprovada'].includes(x.status)) throw falha('Só dá para alterar cobrança ainda não cobrada.', 409);
  const valor = b.valor != null ? num(b.valor) : Number(x.valor);
  if (!(valor >= 0)) throw falha('Valor inválido.');
  let calc = Number(x.valor_calculado); let qtd = x.quantidade;
  // Mudou a quantidade (horas/dias): recalcula pela regra; se o valor não foi digitado, vale o novo cálculo.
  if (b.quantidade != null && num(b.quantidade) !== Number(x.quantidade)) {
    qtd = num(b.quantidade);
    const c = await cteBase(x.cte_id);
    calc = calcular(await regraPara(x.servico, c.dados), { frete: c.frete, mercadoria: c.mercadoria, quantidade: qtd });
  }
  const final = b.valor != null && b.valor !== '' ? centavos(valor) : calc;
  const { rows } = await pool.query(`UPDATE cobrancas_extras SET valor = $2, valor_calculado = $3, quantidade = $4, descricao = COALESCE($5, descricao), atualizado_em = NOW() WHERE id = $1 RETURNING *`,
    [id, final, calc, qtd, b.descricao != null ? String(b.descricao).slice(0, 300) : null]);
  return rows[0];
}

async function aprovar(ids, usuario) {
  const lista = (ids || []).map(Number).filter(Number.isInteger);
  const { rows } = await pool.query(`UPDATE cobrancas_extras SET status = 'aprovada', aprovado_por = $2, atualizado_em = NOW() WHERE id = ANY($1::int[]) AND status = 'pendente' AND valor > 0 RETURNING id`, [lista, usuario]);
  const { rows: zeradas } = await pool.query(`SELECT COUNT(*)::int AS n FROM cobrancas_extras WHERE id = ANY($1::int[]) AND status = 'pendente' AND valor <= 0`, [lista]);
  return { aprovadas: rows.length, sem_valor: zeradas[0].n };
}
async function cancelar(ids, motivo) {
  const m = String(motivo || '').trim().slice(0, 200);
  if (!m) throw falha('Diga o motivo (ex.: cortesia, falha nossa, cliente não aceitou).');
  const { rows } = await pool.query(`UPDATE cobrancas_extras SET status = 'cancelada', motivo_cancelamento = $2, atualizado_em = NOW() WHERE id = ANY($1::int[]) AND status IN ('pendente', 'aprovada') RETURNING id`,
    [(ids || []).map(Number).filter(Number.isInteger), m]);
  return { canceladas: rows.length };
}

// Gera os documentos das cobranças aprovadas: um CT-e complementar por CT-e (com um componente por serviço)
// e uma NFS-e por CT-e para a armazenagem. Os documentos saem como rascunho para conferir e transmitir.
async function cobrar(ids, usuario) {
  const lista = (ids || []).map(Number).filter(Number.isInteger);
  const { rows } = await pool.query(`SELECT * FROM cobrancas_extras WHERE id = ANY($1::int[]) AND status = 'aprovada' ORDER BY cte_id, id`, [lista]);
  if (!rows.length) throw falha('Escolha cobranças aprovadas.');
  const emissao = require('./cte/emissao');
  const grupos = new Map();
  rows.forEach((x) => { const k = `${x.cte_id}|${SERVICOS[x.servico].documento}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(x); });
  const feitos = []; const erros = [];
  for (const [k, itens] of grupos) {
    const [cteId, tipo] = k.split('|');
    try {
      const c = await cteBase(Number(cteId));
      const total = centavos(itens.reduce((s, x) => s + Number(x.valor), 0));
      const textos = itens.map((x) => `${SERVICOS[x.servico].nome}${x.quantidade ? ` (${String(Number(x.quantidade)).replace('.', ',')} ${x.servico === 'estadia' ? 'h' : 'dia(s)'})` : ''}${x.descricao ? ` — ${x.descricao}` : ''}`);
      let docId;
      if (tipo === 'cte') {
        const novo = await emissao.rascunhoDerivado(Number(cteId), 'complementar', usuario);
        const d = novo.dados;
        const porComp = new Map();
        itens.forEach((x) => porComp.set(SERVICOS[x.servico].componente, centavos((porComp.get(SERVICOS[x.servico].componente) || 0) + Number(x.valor))));
        d.valores = { vTPrest: total, vRec: total, componentes: [...porComp].map(([xNome, vComp]) => ({ xNome, vComp })) };
        const cst = String(d.icms?.cst || '');
        const aliq = Number(d.icms?.pICMS) || 0;
        if (['00', '20', '90', 'OUTRAUF'].includes(cst) && aliq) d.icms = { ...d.icms, vBC: total, vICMS: centavos((total * aliq) / 100) };
        d.observacoes = `Complemento do CT-e ${c.serie}/${c.numero}: ${textos.join('; ')}.`.slice(0, 2000);
        await pool.query('UPDATE ctes_emitidos SET dados = $2, valor_total = $3 WHERE id = $1', [novo.id, d, total]);
        docId = novo.id;
      } else {
        const d = c.dados || {};
        const p = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {};
        const e = p.endereco || {};
        const nf = await require('./nfse/nfse').criar({
          tomador: { doc: p.cnpj || p.cpf, nome: p.xNome, email: p.email, fone: p.fone, end: { cep: e.CEP, xLgr: e.xLgr, nro: e.nro, xCpl: e.xCpl, xBairro: e.xBairro, cMun: e.cMun, xMun: e.xMun, uf: e.UF } },
          servico: { descricao: `Armazenagem de mercadoria (CT-e ${c.serie}/${c.numero}): ${textos.join('; ')}`, cTribNac: '110401', notas: d.nfes || [] },
          valores: { vServ: total }, cte_origem: c.id,
        }, usuario);
        docId = nf.id;
      }
      await pool.query(`UPDATE cobrancas_extras SET status = 'cobrada', documento_tipo = $2, documento_id = $3, atualizado_em = NOW() WHERE id = ANY($1::int[])`, [itens.map((x) => x.id), tipo, docId]);
      feitos.push({ cte: `${c.serie}/${c.numero}`, tipo, documento_id: docId, valor: total, itens: itens.length });
    } catch (e) { erros.push({ cte_id: Number(cteId), erro: e.message }); }
  }
  return { feitos, erros };
}

// Documento excluído/cancelado/rejeitado: a cobrança volta para "aprovada" para gerar de novo.
async function reabrir(id) {
  const { rows: [x] } = await pool.query('SELECT * FROM cobrancas_extras WHERE id = $1', [id]);
  if (!x || x.status !== 'cobrada') throw falha('Só dá para reabrir cobrança já cobrada.', 409);
  const tabela = x.documento_tipo === 'cte' ? 'ctes_emitidos' : 'nfse_emitidas';
  const { rows } = await pool.query(`SELECT status FROM ${tabela} WHERE id = $1`, [x.documento_id]);
  if (rows[0] && !['cancelado', 'cancelada', 'rejeitado', 'rejeitada', 'erro'].includes(rows[0].status)) throw falha(`O documento da cobrança está ${rows[0].status}: cancele ou exclua o documento antes.`, 409);
  await pool.query(`UPDATE cobrancas_extras SET status = 'aprovada', documento_tipo = NULL, documento_id = NULL, atualizado_em = NOW() WHERE id = $1`, [id]);
}

async function pendencias() {
  const { rows: [r] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes, COUNT(*) FILTER (WHERE status = 'aprovada')::int AS aprovadas,
    COALESCE(SUM(valor) FILTER (WHERE status IN ('pendente', 'aprovada')), 0)::float AS valor FROM cobrancas_extras`);
  return r;
}

module.exports = { SERVICOS, MODOS, STATUS, MOTIVOS_REENTREGA, regras, salvarRegra, excluirRegra, regraPara, calcular, criar, aoLancarOcorrencias, marcarChegada, estadiaNaBaixa, listar, alterar, aprovar, cancelar, cobrar, reabrir, pendencias, tomadorDoc, tomadorNome };
