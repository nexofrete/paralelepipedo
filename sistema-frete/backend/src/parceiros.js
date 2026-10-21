// Parceiros e redespacho (estilo SSW): agentes e transportadoras que entregam
// onde a empresa não tem filial. Cadastro com a área atendida (UFs e cidades)
// e a tabela de custo; repasse das cargas num "romaneio de redespacho" (o
// parceiro dá baixa pelo app do motorista, com o código); conta-corrente com
// o custo de cada CT-e, ajustes, pagamentos e o acerto que vira conta a pagar.
// O CT-e do parceiro lançado em Notas de entrada baixa o custo dos CT-e dele.
const pool = require('./db');
const Doc = require('./utils/documento');
const contasPagar = require('./contasPagar');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => { if (v === '' || v == null) return 0; const n = typeof v === 'number' ? v : Number(String(v).includes(',') ? String(v).replace(/\./g, '').replace(',', '.') : v); return Number.isFinite(n) ? n : 0; };
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
// "São Paulo/sp" → "SAO PAULO/SP"
const cidadeChave = (cidade, uf) => `${String(cidade || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()}/${String(uf || '').toUpperCase().trim()}`;
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const TIPOS = {
  custo: { nome: 'Custo do redespacho', sinal: 1 },
  frete_recebido: { nome: 'Frete recebido pelo parceiro (fica com ele)', sinal: -1 },
  pagamento: { nome: 'Pagamento ao parceiro', sinal: -1 },
  recebimento: { nome: 'Recebido do parceiro', sinal: 1 },
  ajuste: { nome: 'Ajuste', sinal: 0 },
};

// ---------- Cadastro ----------
function lerParceiro(b = {}) {
  const documento = Doc.limpar(b.documento);
  if (!Doc.valido(documento)) throw falha('CNPJ/CPF do parceiro inválido.');
  const nome = texto(b.nome, 200);
  if (!nome) throw falha('Informe o nome do parceiro.');
  const ufs = [...new Set((Array.isArray(b.ufs) ? b.ufs : String(b.ufs || '').split(/[\s,;]+/)).map((u) => String(u).toUpperCase().trim()).filter((u) => UFS.includes(u)))];
  // Cidades: uma por linha, "Cidade/UF" ou "Cidade - UF".
  const cidades = [...new Set((Array.isArray(b.cidades) ? b.cidades : String(b.cidades || '').split(/\n|;/)).map((c) => {
    const m = /^(.+?)\s*[/-]\s*([A-Za-z]{2})\s*$/.exec(String(c).trim());
    return m && UFS.includes(m[2].toUpperCase()) ? cidadeChave(m[1], m[2]) : null;
  }).filter(Boolean))];
  const p = {
    documento, nome, fantasia: texto(b.fantasia, 120), rntrc: texto(b.rntrc, 20), contato_nome: texto(b.contato_nome, 120), telefone: texto(b.telefone, 30), email: texto(b.email, 250), pix: texto(b.pix, 120),
    ufs, cidades, custo_percentual: num(b.custo_percentual), custo_kg: num(b.custo_kg), custo_fixo: num(b.custo_fixo), custo_minimo: num(b.custo_minimo),
    prazo_dias: Math.max(0, parseInt(b.prazo_dias, 10) || 0), observacao: texto(b.observacao, 2000), ativo: b.ativo !== false,
  };
  if (p.custo_percentual < 0 || p.custo_percentual > 100) throw falha('Percentual do frete de 0 a 100.');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw falha('E-mail inválido.');
  return p;
}
const CAMPOS = ['documento', 'nome', 'fantasia', 'rntrc', 'contato_nome', 'telefone', 'email', 'pix', 'ufs', 'cidades', 'custo_percentual', 'custo_kg', 'custo_fixo', 'custo_minimo', 'prazo_dias', 'observacao', 'ativo'];
async function salvar(id, b) {
  const p = lerParceiro(b);
  try {
    if (id) {
      const { rows } = await pool.query(`UPDATE parceiros SET ${CAMPOS.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...CAMPOS.map((c) => p[c])]);
      if (!rows[0]) throw falha('Parceiro não encontrado.', 404);
      return rows[0];
    }
    const { rows } = await pool.query(`INSERT INTO parceiros (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, CAMPOS.map((c) => p[c]));
    return rows[0];
  } catch (e) { if (e.code === '23505') throw falha('Já existe parceiro com este CNPJ/CPF.', 409); throw e; }
}

// Saldo e pendências de cada parceiro.
async function listar() {
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE((SELECT SUM(valor) FROM parceiro_lancamentos l WHERE l.parceiro_id = p.id AND l.status = 'aberto'), 0)::float AS saldo,
            (SELECT COUNT(*)::int FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
              WHERE r.parceiro_id = p.id AND c.situacao_entrega NOT IN ('entregue', 'devolvido') AND c.status = 'autorizado') AS em_aberto,
            (SELECT COUNT(*)::int FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
              WHERE r.parceiro_id = p.id AND c.situacao_entrega NOT IN ('entregue', 'devolvido') AND c.status = 'autorizado' AND c.previsao_entrega < $1::date) AS atrasados
       FROM parceiros p ORDER BY p.ativo DESC, p.nome`, [hojeBr()]);
  return rows.map((p) => ({ ...p, custo_percentual: Number(p.custo_percentual), custo_kg: Number(p.custo_kg), custo_fixo: Number(p.custo_fixo), custo_minimo: Number(p.custo_minimo) }));
}

// Quem atende a cidade: primeiro quem tem a cidade na lista, depois quem atende a UF inteira.
async function sugerir(cidade, uf) {
  const { rows } = await pool.query(
    `SELECT id, nome, prazo_dias, ($1 = ANY(cidades)) AS pela_cidade FROM parceiros WHERE ativo AND ($1 = ANY(cidades) OR $2 = ANY(ufs)) ORDER BY ($1 = ANY(cidades)) DESC, nome`,
    [cidadeChave(cidade, uf), String(uf || '').toUpperCase()]);
  return rows;
}

// Custo previsto do CT-e pela tabela do parceiro.
function custoPrevisto(p, { frete = 0, peso = 0 } = {}) {
  const v = Number(p.custo_fixo || 0) + (Number(frete) * Number(p.custo_percentual || 0)) / 100 + Number(peso) * Number(p.custo_kg || 0);
  return centavos(Math.max(v, Number(p.custo_minimo || 0)));
}
const pesoKg = (d = {}) => {
  const q = d.carga?.quantidades || [];
  const kg = q.find((x) => String(x.cUnid).padStart(2, '0') === '01');
  if (kg) return Number(kg.qCarga) || 0;
  const t = q.find((x) => String(x.cUnid).padStart(2, '0') === '02');
  return t ? (Number(t.qCarga) || 0) * 1000 : 0;
};

// ---------- Repasse ao parceiro (romaneio de redespacho) ----------
// Monta o romaneio com o parceiro, dá a saída ("Entregue ao redespacho") e lança o custo previsto de cada CT-e.
async function repassar(parceiroId, ctes, usuario) {
  const { rows: [p] } = await pool.query('SELECT * FROM parceiros WHERE id = $1 AND ativo', [parceiroId]);
  if (!p) throw falha('Escolha um parceiro ativo.');
  const lista = [...new Set((ctes || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) throw falha('Marque os CT-e.');
  const romaneios = require('./routes/romaneios');
  const cliente = await pool.connect();
  let id;
  try {
    await cliente.query('BEGIN');
    const codigo = romaneios.novoCodigo();
    ({ rows: [{ id }] } = await cliente.query(
      `INSERT INTO romaneios (data, motorista_nome, motorista_documento, motorista_telefone, observacao, codigo_acesso, criado_por_nome, parceiro_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [hojeBr(), p.fantasia || p.nome, p.documento, p.telefone, `Redespacho por ${p.nome}`, codigo, usuario, p.id]));
    await romaneios.gravarItens(cliente, id, lista);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  await romaneios.darSaida(id, usuario);
  const { rows: cs } = await pool.query('SELECT id, serie, numero, dados, valor_total, previsao_entrega FROM ctes_emitidos WHERE id = ANY($1::int[])', [lista]);
  let total = 0;
  for (const c of cs) {
    const valor = custoPrevisto(p, { frete: Number(c.dados?.valores?.vTPrest ?? c.valor_total) || 0, peso: pesoKg(c.dados) });
    total += valor;
    if (valor > 0) {
      await pool.query(`INSERT INTO parceiro_lancamentos (parceiro_id, data, tipo, valor, cte_id, romaneio_id, descricao, usuario_nome) VALUES ($1, $2, 'custo', $3, $4, $5, $6, $7)`,
        [p.id, hojeBr(), valor, c.id, id, `Redespacho do CT-e ${c.serie}/${c.numero} (previsto pela tabela)`, usuario]);
    }
    // O parceiro tem prazo próprio: a ocorrência do redespacho leva a nova previsão (previsão + dias dele).
    if (p.prazo_dias > 0 && c.previsao_entrega) {
      await pool.query(`UPDATE cte_ocorrencias SET nova_previsao = $3::date + $4::int WHERE romaneio_id = $1 AND cte_id = $2 AND tipo_id = 'redespacho'`, [id, c.id, c.previsao_entrega, p.prazo_dias]);
      await require('./cte/ocorrencias').recalcularSituacao(c.id);
    }
  }
  const { rows: [r] } = await pool.query('SELECT codigo_acesso FROM romaneios WHERE id = $1', [id]);
  return { romaneio_id: id, codigo: r.codigo_acesso, ctes: cs.length, custo_previsto: centavos(total), parceiro: p.nome };
}

// ---------- Conta-corrente ----------
async function extrato(parceiroId, { status = 'aberto' } = {}) {
  const { rows: [p] } = await pool.query('SELECT * FROM parceiros WHERE id = $1', [parceiroId]);
  if (!p) throw falha('Parceiro não encontrado.', 404);
  const { rows } = await pool.query(
    `SELECT l.*, l.data::text, l.valor::float, c.serie, c.numero, c.situacao_entrega, c.destinatario_nome, c.cidade_fim, c.uf_fim, n.numero AS nota_numero
       FROM parceiro_lancamentos l LEFT JOIN ctes_emitidos c ON c.id = l.cte_id LEFT JOIN notas_entrada n ON n.id = l.nota_entrada_id
      WHERE l.parceiro_id = $1 ${status === 'aberto' ? `AND l.status = 'aberto'` : ''} ORDER BY l.data DESC, l.id DESC LIMIT 1000`, [p.id]);
  const abertos = status === 'aberto' ? rows : rows.filter((l) => l.status === 'aberto');
  const { rows: acertos } = await pool.query(
    `SELECT a.*, a.ate::text, a.saldo::float, cp.status AS conta_status, cp.vencimento::text AS conta_vencimento FROM parceiro_acertos a LEFT JOIN contas_pagar cp ON cp.id = a.conta_pagar_id
      WHERE a.parceiro_id = $1 ORDER BY a.id DESC LIMIT 50`, [p.id]);
  const { rows: cargas } = await pool.query(
    `SELECT c.id, c.serie, c.numero, c.destinatario_nome, c.cidade_fim, c.uf_fim, c.situacao_entrega, c.previsao_entrega::text, c.data_entrega, r.id AS romaneio_id, r.codigo_acesso, r.status AS romaneio_status
       FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
      WHERE r.parceiro_id = $1 AND (c.situacao_entrega NOT IN ('entregue', 'devolvido') OR c.data_entrega > NOW() - INTERVAL '30 days') ORDER BY c.situacao_entrega IN ('entregue', 'devolvido'), c.previsao_entrega`, [p.id]);
  return { parceiro: p, lancamentos: rows.map((l) => ({ ...l, tipo_nome: TIPOS[l.tipo]?.nome || l.tipo })), saldo: centavos(abertos.reduce((s, l) => s + l.valor, 0)), acertos, cargas, tipos: Object.fromEntries(Object.entries(TIPOS).map(([k, t]) => [k, t.nome])) };
}

// Lançamento à mão: { tipo, valor (positivo), data, descricao, cte (número) }. O sinal sai do tipo (ajuste: o sinal digitado).
async function lancar(parceiroId, b, usuario) {
  const t = TIPOS[b.tipo];
  if (!t) throw falha('Escolha o tipo do lançamento.');
  let v = num(b.valor);
  if (!v) throw falha('Informe o valor.');
  if (t.sinal) v = Math.abs(v) * t.sinal;
  const descricao = texto(b.descricao, 300);
  if (b.tipo === 'ajuste' && !descricao) throw falha('Diga o motivo do ajuste.');
  let cteId = null;
  if (String(b.cte || '').trim()) {
    const { rows } = await pool.query(`SELECT id FROM ctes_emitidos WHERE numero::text = $1 AND status = 'autorizado' ORDER BY id DESC LIMIT 1`, [String(b.cte).replace(/\D/g, '')]);
    if (!rows[0]) throw falha('CT-e não encontrado.');
    cteId = rows[0].id;
  }
  const { rows } = await pool.query(
    `INSERT INTO parceiro_lancamentos (parceiro_id, data, tipo, valor, cte_id, descricao, usuario_nome) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [parceiroId, iso(b.data) || hojeBr(), b.tipo, centavos(v), cteId, descricao || t.nome, usuario]);
  return rows[0];
}
async function alterarValor(id, valor, motivo) {
  const v = num(valor);
  const { rows } = await pool.query(`UPDATE parceiro_lancamentos SET valor = $2, descricao = COALESCE(descricao, '') || $3 WHERE id = $1 AND status = 'aberto' RETURNING *`,
    [id, centavos(v), motivo ? ` · ajustado: ${String(motivo).slice(0, 100)}` : '']);
  if (!rows[0]) throw falha('Só dá para alterar lançamento em aberto.', 409);
  return rows[0];
}
async function excluirLancamento(id) {
  const { rowCount } = await pool.query(`DELETE FROM parceiro_lancamentos WHERE id = $1 AND status = 'aberto'`, [id]);
  if (!rowCount) throw falha('Só dá para apagar lançamento em aberto.', 409);
}

// Acerto: fecha os lançamentos em aberto até a data. Saldo a favor do parceiro vira conta a pagar.
async function acertar(parceiroId, { ate, vencimento }, usuario) {
  const fim = iso(ate) || hojeBr();
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [p] } = await cliente.query('SELECT * FROM parceiros WHERE id = $1 FOR UPDATE', [parceiroId]);
    if (!p) throw falha('Parceiro não encontrado.', 404);
    const { rows: abertos } = await cliente.query(`SELECT id, valor FROM parceiro_lancamentos WHERE parceiro_id = $1 AND status = 'aberto' AND data <= $2::date FOR UPDATE`, [p.id, fim]);
    if (!abertos.length) throw falha('Nada em aberto até esta data.');
    const saldo = centavos(abertos.reduce((s, l) => s + Number(l.valor), 0));
    let contaId = null;
    if (saldo > 0) {
      if (!iso(vencimento)) throw falha('Informe o vencimento do pagamento ao parceiro.');
      const [c] = await contasPagar.criar({ descricao: `Acerto de redespacho — ${p.nome} (até ${fim.split('-').reverse().join('/')})`, categoria: 'frete_terceiro',
        fornecedor_nome: p.nome, fornecedor_doc: p.documento, competencia: fim, vencimento, valor: saldo, parcelas: 1, observacao: p.pix ? `PIX do parceiro: ${p.pix}` : null }, usuario, { cliente });
      contaId = c.id;
    }
    const { rows: [a] } = await cliente.query('INSERT INTO parceiro_acertos (parceiro_id, ate, saldo, conta_pagar_id, usuario_nome) VALUES ($1, $2, $3, $4, $5) RETURNING id', [p.id, fim, saldo, contaId, usuario]);
    await cliente.query(`UPDATE parceiro_lancamentos SET status = 'acertado', acerto_id = $2 WHERE id = ANY($1::int[])`, [abertos.map((l) => l.id), a.id]);
    await cliente.query('COMMIT');
    return { acerto_id: a.id, saldo, conta_pagar_id: contaId, lancamentos: abertos.length, parceiro: p.nome };
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

// ---------- CT-e do parceiro em Notas de entrada ----------
// O parceiro emite o CT-e de redespacho contra a empresa (tomadora), citando o nosso CT-e (docAnt) ou as NF-e.
// Os custos em aberto desses CT-e saem da conta-corrente (a nota já gerou a conta a pagar).
async function aoLancarNotaEntrada(notaId, { emitenteDoc, xml }) {
  if (!xml) return null;
  const { rows: [p] } = await pool.query('SELECT id, nome FROM parceiros WHERE documento = $1', [Doc.limpar(emitenteDoc)]);
  if (!p) return null;
  const chaves = [...new Set((String(xml).match(/<(?:chCTe|chave|chNFe)>(\d{44})<\/(?:chCTe|chave|chNFe)>/g) || []).map((x) => x.replace(/\D/g, '')))];
  if (!chaves.length) return null;
  const { rows } = await pool.query(
    `UPDATE parceiro_lancamentos l SET status = 'acertado', nota_entrada_id = $2, descricao = COALESCE(l.descricao, '') || ' · confirmado pelo CT-e do parceiro'
      FROM ctes_emitidos c WHERE l.cte_id = c.id AND l.parceiro_id = $1 AND l.tipo = 'custo' AND l.status = 'aberto'
        AND (c.chave = ANY($3::text[]) OR c.dados->'nfes' ?| $3::text[]) RETURNING l.id`, [p.id, notaId, chaves]);
  return { parceiro: p.nome, custos: rows.length };
}

async function pendencias() {
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*)::int AS atrasados FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
      WHERE r.parceiro_id IS NOT NULL AND r.status <> 'fechado' AND c.status = 'autorizado' AND c.situacao_entrega NOT IN ('entregue', 'devolvido') AND c.previsao_entrega < $1::date`, [hojeBr()]);
  return r;
}

module.exports = { UFS, TIPOS, cidadeChave, lerParceiro, salvar, listar, sugerir, custoPrevisto, repassar, extrato, lancar, alterarValor, excluirLancamento, acertar, aoLancarNotaEntrada, pendencias };
