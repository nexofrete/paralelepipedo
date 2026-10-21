// Controle de paletes (vale-palete, estilo SSW). Na coleta o remetente entrega os
// paletes carregados e recebe vazios em troca; na entrega o motorista deixa os
// paletes com a carga e recebe vazios. O que não volta na hora vira VALE-PALETE
// (documento que quem recebeu assina), com prazo para devolver. O saldo é por
// cliente/parceiro (CNPJ) e tipo de palete: saídas da empresa menos entradas.
// Vale não devolvido no prazo é cobrado por NOTA DE DÉBITO, que entra na fatura.
const pool = require('./db');
const Doc = require('./utils/documento');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
const inteiro = (v) => { const n = Number(String(v ?? '').trim()); return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null; };
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TIPOS = { pbr: 'PBR (madeira 1,00 × 1,20)', chep: 'CHEP (locado)', plastico: 'Plástico', outro: 'Outro' };
const ORIGENS = { entrega: 'Troca na entrega', coleta: 'Troca na coleta', devolucao: 'Devolução', envio: 'Envio/retorno de paletes', ajuste: 'Ajuste', cobranca: 'Cobrado (nota de débito)', cancelamento: 'Vale cancelado' };
const STATUS_VALE = { aberto: 'Aberto', devolvido: 'Devolvido', cobrado: 'Cobrado', cancelado: 'Cancelado' };
const CONFIG_PADRAO = { prazo_dias: 30, gerar_vale: true, valores: { pbr: 0, chep: 0, plastico: 0, outro: 0 } };

async function config() {
  const { rows } = await pool.query('SELECT paletes_config FROM empresa WHERE id = 1');
  const c = rows[0]?.paletes_config || {};
  return { ...CONFIG_PADRAO, ...c, valores: { ...CONFIG_PADRAO.valores, ...(c.valores || {}) } };
}
async function salvarConfig(b = {}) {
  const atual = await config();
  const prazo = inteiro(b.prazo_dias);
  const valor = (v, padrao) => { if (v === undefined) return padrao; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); if (!Number.isFinite(n) || n < 0 || n > 100000) throw falha(`Valor inválido: ${v}`); return centavos(n); };
  const c = { prazo_dias: prazo && prazo <= 365 ? prazo : atual.prazo_dias, gerar_vale: b.gerar_vale !== false,
    valores: Object.fromEntries(Object.keys(TIPOS).map((t) => [t, valor(b.valores?.[t], atual.valores[t])])) };
  await pool.query('UPDATE empresa SET paletes_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return c;
}

// ---------- Regras (sem banco) ----------
// Troca: o que saiu da empresa e o que voltou; o que falta vira vale (quando a empresa entregou mais do que recebeu).
function troca(saiu, voltou) {
  const s = inteiro(saiu) || 0; const v = inteiro(voltou) || 0;
  return { saida: s, entrada: v, falta: Math.max(0, s - v), sobra: Math.max(0, v - s) };
}
// Devolução de paletes: baixa os vales abertos do mais antigo para o mais novo (o escolhido primeiro).
function distribuir(vales, qtd, preferido = null) {
  let resta = qtd;
  const ordem = [...vales].sort((a, b) => (a.id === preferido ? -1 : b.id === preferido ? 1 : String(a.vencimento).localeCompare(String(b.vencimento)) || a.id - b.id));
  const aplicado = [];
  for (const v of ordem) {
    if (resta <= 0) break;
    const pendente = v.quantidade - v.devolvidos - v.cobrados;
    if (pendente <= 0) continue;
    const q = Math.min(pendente, resta);
    aplicado.push({ vale_id: v.id, qtd: q });
    resta -= q;
  }
  return { aplicado, sobra: resta };
}

// Quem recebe a carga: o recebedor do CT-e, senão o destinatário.
function parteDaEntrega(d = {}) {
  const p = d.recebedor?.xNome ? d.recebedor : d.destinatario || {};
  return { doc: Doc.limpar(p.cnpj || p.cpf) || null, nome: p.xNome || 'Destinatário' };
}
const tipoOk = (t) => { if (!TIPOS[t]) throw falha('Escolha o tipo de palete.'); return t; };

// ---------- Movimentos ----------
async function inserirMov(cliente, m) {
  const { rows: [r] } = await cliente.query(
    `INSERT INTO paletes_movimentos (data, parte_doc, parte_nome, tipo_palete, sentido, quantidade, origem, cte_id, coleta_id, romaneio_id, ocorrencia_id, vale_id, nota_debito_id, aplicado, observacao, usuario_nome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *, data::text AS data`,
    [m.data || hojeBr(), m.parte_doc || null, m.parte_nome, m.tipo, m.sentido, m.quantidade, m.origem, m.cte_id || null, m.coleta_id || null, m.romaneio_id || null,
      m.ocorrencia_id || null, m.vale_id || null, m.nota_debito_id || null, m.aplicado ? JSON.stringify(m.aplicado) : null, texto(m.observacao, 500), m.usuario_nome || null]);
  return r;
}
async function atualizarVale(cliente, id) {
  await cliente.query(`UPDATE vales_palete SET status = CASE WHEN status = 'cancelado' THEN 'cancelado' WHEN devolvidos + cobrados < quantidade THEN 'aberto'
      WHEN cobrados > 0 THEN 'cobrado' ELSE 'devolvido' END WHERE id = $1`, [id]);
}
// Paletes que voltaram da parte: baixam os vales dela. Devolve o que foi aplicado.
async function aplicarDevolucao(cliente, { parte_doc: doc, tipo, quantidade, preferido = null }) {
  if (!doc || quantidade <= 0) return [];
  const { rows: vales } = await cliente.query(
    `SELECT id, quantidade, devolvidos, cobrados, vencimento::text FROM vales_palete WHERE parte_doc = $1 AND tipo_palete = $2 AND status = 'aberto' FOR UPDATE`, [doc, tipo]);
  const { aplicado } = distribuir(vales, quantidade, preferido);
  for (const a of aplicado) {
    await cliente.query('UPDATE vales_palete SET devolvidos = devolvidos + $2 WHERE id = $1', [a.vale_id, a.qtd]);
    await atualizarVale(cliente, a.vale_id);
  }
  return aplicado;
}
async function desaplicar(cliente, aplicado) {
  for (const a of aplicado || []) {
    await cliente.query('UPDATE vales_palete SET devolvidos = GREATEST(0, devolvidos - $2) WHERE id = $1', [a.vale_id, a.qtd]);
    await atualizarVale(cliente, a.vale_id);
  }
}

async function emitirVale(cliente, v) {
  const c = await config();
  await cliente.query('LOCK TABLE vales_palete IN SHARE ROW EXCLUSIVE MODE');
  const { rows: [n] } = await cliente.query('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM vales_palete');
  const emissao = v.data || hojeBr();
  const { rows: [r] } = await cliente.query(
    `INSERT INTO vales_palete (numero, emissao, vencimento, parte_doc, parte_nome, tipo_palete, quantidade, cte_id, romaneio_id, recebedor_nome, recebedor_documento, observacao, usuario_nome, ocorrencia_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *, vencimento::text AS vencimento`,
    [n.n, emissao, somarDias(emissao, c.prazo_dias), v.parte_doc || null, v.parte_nome, v.tipo, v.quantidade, v.cte_id || null, v.romaneio_id || null,
      texto(v.recebedor_nome, 150), texto(v.recebedor_documento, 30), texto(v.observacao, 500), v.usuario_nome || null, v.ocorrencia_id || null]);
  return r;
}

// Troca na entrega (dentro da transação da baixa). b: { paletes_tipo, paletes_entregues, paletes_recebidos }
async function naEntrega(cliente, { cteId, b, romaneioId = null, ocorrenciaId = null, usuarioNome }) {
  const entregues = inteiro(b.paletes_entregues); const recebidos = inteiro(b.paletes_recebidos);
  if (!entregues && !recebidos) return null;
  if (entregues === null && b.paletes_entregues !== undefined && b.paletes_entregues !== '') throw falha('Quantidade de paletes inválida.');
  const tipo = tipoOk(b.paletes_tipo || 'pbr');
  const { rows: [cte] } = await cliente.query('SELECT id, numero, dados FROM ctes_emitidos WHERE id = $1', [cteId]);
  const parte = parteDaEntrega(cte?.dados);
  const t = troca(entregues, recebidos);
  const base = { parte_doc: parte.doc, parte_nome: parte.nome, tipo, origem: 'entrega', cte_id: cteId, romaneio_id: romaneioId, ocorrencia_id: ocorrenciaId, usuario_nome: usuarioNome };
  if (t.saida) await inserirMov(cliente, { ...base, sentido: 'saida', quantidade: t.saida, observacao: `Deixados com a carga do CT-e ${cte?.numero || ''}` });
  let aplicado = [];
  if (t.sobra) aplicado = await aplicarDevolucao(cliente, { parte_doc: parte.doc, tipo, quantidade: t.sobra });
  if (t.entrada) await inserirMov(cliente, { ...base, sentido: 'entrada', quantidade: t.entrada, aplicado: aplicado.length ? aplicado : null, observacao: 'Vazios recebidos em troca' });
  let vale = null;
  if (t.falta && (await config()).gerar_vale) {
    vale = await emitirVale(cliente, { ...base, quantidade: t.falta, recebedor_nome: b.recebedor_nome, recebedor_documento: b.recebedor_documento,
      observacao: `Troca na entrega do CT-e ${cte?.numero || ''}: ${t.saida} entregue(s), ${t.entrada} devolvido(s)` });
  }
  return { ...t, tipo, parte, vale: vale ? { id: vale.id, numero: vale.numero, quantidade: vale.quantidade, vencimento: vale.vencimento } : null };
}

// Troca na coleta (dentro da transação da baixa da coleta). b: { paletes_tipo, paletes_carregados, paletes_deixados }
async function naColeta(cliente, { coleta, b, romaneioId = null, usuarioNome }) {
  const carregados = inteiro(b.paletes_carregados); const deixados = inteiro(b.paletes_deixados);
  if (!carregados && !deixados) return null;
  const tipo = tipoOk(b.paletes_tipo || 'pbr');
  const base = { parte_doc: Doc.limpar(coleta.remetente_doc) || null, parte_nome: coleta.remetente_nome, tipo, origem: 'coleta', coleta_id: coleta.id, romaneio_id: romaneioId, usuario_nome: usuarioNome };
  const t = troca(deixados, carregados);   // a empresa deixou vazios; voltaram (vieram) os carregados
  if (t.saida) await inserirMov(cliente, { ...base, sentido: 'saida', quantidade: t.saida, observacao: `Vazios deixados na coleta ${coleta.id}` });
  let aplicado = [];
  if (t.sobra) aplicado = await aplicarDevolucao(cliente, { parte_doc: base.parte_doc, tipo, quantidade: t.sobra });
  if (t.entrada) await inserirMov(cliente, { ...base, sentido: 'entrada', quantidade: t.entrada, aplicado: aplicado.length ? aplicado : null, observacao: `Carregados na coleta ${coleta.id}` });
  return { ...t, tipo };
}

// Ocorrência de entrega apagada (lançada errada): desfaz a troca de paletes dela.
async function aoApagarOcorrencia(cliente, ocorrenciaId) {
  const { rows: vs } = await cliente.query('SELECT * FROM vales_palete WHERE ocorrencia_id = $1 FOR UPDATE', [ocorrenciaId]);
  const mexido = vs.find((v) => v.status !== 'cancelado' && (v.devolvidos > 0 || v.cobrados > 0));
  if (mexido) throw falha(`A entrega gerou o vale-palete ${mexido.numero}, que já teve devolução ou cobrança: desfaça antes em Paletes.`, 409);
  const { rows: movs } = await cliente.query('SELECT * FROM paletes_movimentos WHERE ocorrencia_id = $1', [ocorrenciaId]);
  for (const m of movs) await desaplicar(cliente, m.aplicado);
  await cliente.query('DELETE FROM paletes_movimentos WHERE ocorrencia_id = $1', [ocorrenciaId]);
  // Vale cancelado tinha um ajuste de saída do saldo: sai junto.
  if (vs.length) await cliente.query(`DELETE FROM paletes_movimentos WHERE vale_id = ANY($1::int[]) AND origem = 'cancelamento'`, [vs.map((v) => v.id)]);
  await cliente.query('DELETE FROM vales_palete WHERE ocorrencia_id = $1', [ocorrenciaId]);
}

// Lançamento manual: devolução (entrada), envio/retorno (saída) ou ajuste.
async function lancar(b, usuario) {
  const tipo = tipoOk(b.tipo);
  const quantidade = inteiro(b.quantidade);
  if (!quantidade) throw falha('Informe a quantidade de paletes.');
  const origem = ['devolucao', 'envio', 'ajuste'].includes(b.origem) ? b.origem : 'ajuste';
  const sentido = origem === 'devolucao' ? 'entrada' : origem === 'envio' ? 'saida' : (b.sentido === 'saida' ? 'saida' : 'entrada');
  const doc = Doc.limpar(b.parte_doc) || null;
  if (doc && ![11, 14].includes(doc.length)) throw falha('CNPJ/CPF inválido.');
  let nome = texto(b.parte_nome, 200);
  if (doc && !nome) {
    const { rows } = await pool.query(`SELECT nome FROM (SELECT 1 AS o, parte_nome AS nome FROM (SELECT parte_nome FROM paletes_movimentos WHERE parte_doc = $1 ORDER BY id DESC LIMIT 1) m
      UNION ALL SELECT 2, razao_social FROM clientes WHERE documento = $1 UNION ALL SELECT 3, nome FROM parceiros WHERE documento = $1) x WHERE nome IS NOT NULL ORDER BY o LIMIT 1`, [doc]);
    nome = rows[0]?.nome || null;
  }
  if (!nome) throw falha('Informe com quem foi a movimentação (CNPJ/CPF ou nome).');
  const data = dataIso(b.data) || hojeBr();
  if (data > hojeBr()) throw falha('A data está no futuro.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const aplicado = sentido === 'entrada' ? await aplicarDevolucao(cliente, { parte_doc: doc, tipo, quantidade, preferido: Number(b.vale_id) || null }) : [];
    const m = await inserirMov(cliente, { data, parte_doc: doc, parte_nome: nome, tipo, sentido, quantidade, origem, aplicado: aplicado.length ? aplicado : null,
      observacao: b.observacao, usuario_nome: usuario?.nome });
    await cliente.query('COMMIT');
    return { ...m, vales_baixados: aplicado };
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}
// Desfaz um lançamento manual (os da coleta/entrega saem pela própria baixa; a cobrança, cancelando a nota).
async function excluirMovimento(id) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [m] } = await cliente.query('SELECT * FROM paletes_movimentos WHERE id = $1 FOR UPDATE', [id]);
    if (!m) throw falha('Lançamento não encontrado.', 404);
    if (!['devolucao', 'envio', 'ajuste'].includes(m.origem)) throw falha('Só dá para excluir lançamento manual (devolução, envio ou ajuste).', 409);
    await desaplicar(cliente, m.aplicado);
    await cliente.query('DELETE FROM paletes_movimentos WHERE id = $1', [id]);
    await cliente.query('COMMIT');
    return m;
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

// ---------- Consultas ----------
const SALDO = `SUM(CASE WHEN m.sentido = 'saida' THEN m.quantidade ELSE -m.quantidade END)::int`;
async function saldos({ busca = '', todos = false } = {}) {
  const val = [hojeBr()];
  let cond = '';
  const b = String(busca || '').trim();
  if (b) { val.push(`%${b}%`, b.replace(/\D/g, '') || '-'); cond = `WHERE (x.parte_nome ILIKE $2 OR x.parte_doc LIKE $3 || '%')`; }
  const { rows } = await pool.query(
    `WITH m AS (SELECT COALESCE(parte_doc, 'nome:' || parte_nome) AS chave, parte_doc, parte_nome, tipo_palete, sentido, quantidade, data FROM paletes_movimentos m),
          s AS (SELECT chave, MAX(parte_doc) AS parte_doc, (ARRAY_AGG(parte_nome ORDER BY data DESC))[1] AS parte_nome, tipo_palete, ${SALDO} AS saldo, MAX(data)::text AS ultimo,
                       SUM(quantidade) FILTER (WHERE sentido = 'saida')::int AS saidas, SUM(quantidade) FILTER (WHERE sentido = 'entrada')::int AS entradas
                  FROM m GROUP BY chave, tipo_palete),
          v AS (SELECT COALESCE(parte_doc, 'nome:' || parte_nome) AS chave, tipo_palete, SUM(quantidade - devolvidos - cobrados)::int AS em_vale,
                       COUNT(*)::int AS vales, COUNT(*) FILTER (WHERE vencimento < $1::date)::int AS vencidos
                  FROM vales_palete WHERE status = 'aberto' GROUP BY 1, 2)
     SELECT * FROM (SELECT s.*, COALESCE(v.em_vale, 0) AS em_vale, COALESCE(v.vales, 0) AS vales, COALESCE(v.vencidos, 0) AS vencidos FROM s LEFT JOIN v USING (chave, tipo_palete)) x
     ${cond} ORDER BY x.vencidos DESC, ABS(x.saldo) DESC, x.parte_nome LIMIT 1000`, val);
  const lista = todos ? rows : rows.filter((r) => r.saldo !== 0 || r.vales > 0);
  const tot = (f) => lista.reduce((t, r) => t + f(r), 0);
  return {
    saldos: lista.map((r) => ({ ...r, tipo_nome: TIPOS[r.tipo_palete] || r.tipo_palete })),
    totais: { com_clientes: tot((r) => Math.max(0, r.saldo)), devemos: tot((r) => Math.max(0, -r.saldo)), em_vale: tot((r) => r.em_vale), vencidos: tot((r) => r.vencidos) },
  };
}

const COLS_VALE = `v.*, v.emissao::text AS emissao, v.vencimento::text AS vencimento, (v.quantidade - v.devolvidos - v.cobrados) AS pendente,
  (v.status = 'aberto' AND v.vencimento < CURRENT_DATE) AS vencido, c.serie AS cte_serie, c.numero AS cte_numero`;
const FILTROS_VALE = { abertos: `v.status = 'aberto'`, vencidos: `v.status = 'aberto' AND v.vencimento < $1::date`, devolvidos: `v.status = 'devolvido'`, cobrados: `v.status = 'cobrado'`, cancelados: `v.status = 'cancelado'`, todos: 'TRUE' };
async function vales({ filtro = 'abertos', busca = '', parte = null } = {}) {
  const f = FILTROS_VALE[filtro] ? filtro : 'abertos';
  const val = [];
  const cond = [FILTROS_VALE[f].includes('$1') ? FILTROS_VALE[f].replace('$1', `$${val.push(hojeBr())}`) : FILTROS_VALE[f]];
  if (parte) { val.push(parte); cond.push(`v.parte_doc = $${val.length}`); }
  const b = String(busca || '').trim();
  if (b) { val.push(`%${b}%`, b.replace(/\D/g, '') || '-'); cond.push(`(v.parte_nome ILIKE $${val.length - 1} OR v.parte_doc LIKE $${val.length} || '%' OR v.numero::text = $${val.length} OR c.numero::text = $${val.length})`); }
  const { rows } = await pool.query(`SELECT ${COLS_VALE} FROM vales_palete v LEFT JOIN ctes_emitidos c ON c.id = v.cte_id WHERE ${cond.join(' AND ')}
    ORDER BY (v.status = 'aberto') DESC, v.vencimento, v.id DESC LIMIT 500`, val);
  const { rows: [k] } = await pool.query(`SELECT ${Object.entries(FILTROS_VALE).map(([n, w]) => `COUNT(*) FILTER (WHERE ${w})::int AS ${n}`).join(', ')} FROM vales_palete v`, [hojeBr()]);
  const c = await config();
  return { vales: rows.map((v) => ({ ...v, tipo_nome: TIPOS[v.tipo_palete], valor_unitario: c.valores[v.tipo_palete] || 0 })), contagens: k };
}

async function extrato(ref) {
  const porDoc = /^\d{11}$|^[0-9A-Z]{14}$/.test(ref);
  const chave = porDoc ? ref : String(ref).replace(/^nome:/, '');
  const { rows } = await pool.query(
    `SELECT m.*, m.data::text AS data, c.serie AS cte_serie, c.numero AS cte_numero, n.numero AS nota_numero FROM paletes_movimentos m
       LEFT JOIN ctes_emitidos c ON c.id = m.cte_id LEFT JOIN notas_debito n ON n.id = m.nota_debito_id
      WHERE ${porDoc ? 'm.parte_doc = $1' : 'm.parte_doc IS NULL AND m.parte_nome = $1'} ORDER BY m.data, m.id`, [chave]);
  const saldo = {};
  const movimentos = rows.map((m) => {
    saldo[m.tipo_palete] = (saldo[m.tipo_palete] || 0) + (m.sentido === 'saida' ? m.quantidade : -m.quantidade);
    return { ...m, saldo: saldo[m.tipo_palete], origem_nome: ORIGENS[m.origem] || m.origem, tipo_nome: TIPOS[m.tipo_palete] };
  }).reverse();
  const { rows: vs } = await pool.query(`SELECT ${COLS_VALE} FROM vales_palete v LEFT JOIN ctes_emitidos c ON c.id = v.cte_id
    WHERE ${porDoc ? 'v.parte_doc = $1' : 'v.parte_doc IS NULL AND v.parte_nome = $1'} ORDER BY v.id DESC LIMIT 200`, [chave]);
  return { parte_doc: porDoc ? chave : null, parte_nome: rows[rows.length - 1]?.parte_nome || vs[0]?.parte_nome || chave, saldo, movimentos, vales: vs.map((v) => ({ ...v, tipo_nome: TIPOS[v.tipo_palete] })) };
}

// Vale cancelado: o que estava pendente sai do saldo (perdão, contagem errada) com um ajuste.
async function cancelarVale(id, motivo, usuario) {
  const m = texto(motivo, 250);
  if (!m) throw falha('Informe o motivo do cancelamento.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [v] } = await cliente.query('SELECT * FROM vales_palete WHERE id = $1 FOR UPDATE', [id]);
    if (!v) throw falha('Vale não encontrado.', 404);
    if (v.status !== 'aberto') throw falha(`O vale está ${STATUS_VALE[v.status].toLowerCase()}.`, 409);
    const pendente = v.quantidade - v.devolvidos - v.cobrados;
    if (pendente > 0) await inserirMov(cliente, { parte_doc: v.parte_doc, parte_nome: v.parte_nome, tipo: v.tipo_palete, sentido: 'entrada', quantidade: pendente, origem: 'cancelamento',
      vale_id: v.id, observacao: `Vale ${v.numero} cancelado: ${m}`, usuario_nome: usuario?.nome });
    await cliente.query(`UPDATE vales_palete SET status = 'cancelado', motivo_cancelamento = $2 WHERE id = $1`, [id, m]);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

// ---------- Cobrança: nota de débito ----------
async function cobrar(ids, usuario) {
  const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) throw falha('Marque os vales a cobrar.');
  const c = await config();
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: vs } = await cliente.query(`SELECT * FROM vales_palete WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [lista]);
    if (vs.length !== lista.length) throw falha('Algum vale não foi encontrado.');
    const ruim = vs.find((v) => v.status !== 'aberto');
    if (ruim) throw falha(`O vale ${ruim.numero} está ${STATUS_VALE[ruim.status].toLowerCase()}.`, 409);
    const semDoc = vs.find((v) => !v.parte_doc);
    if (semDoc) throw falha(`O vale ${semDoc.numero} não tem CNPJ/CPF de quem deve: a nota de débito precisa dele.`);
    const semValor = vs.find((v) => !(c.valores[v.tipo_palete] > 0));
    if (semValor) throw falha(`Informe o valor do palete ${TIPOS[semValor.tipo_palete]} em "Valores e prazo".`);
    const porParte = new Map();
    vs.forEach((v) => porParte.set(v.parte_doc, [...(porParte.get(v.parte_doc) || []), v]));
    await cliente.query('LOCK TABLE notas_debito IN SHARE ROW EXCLUSIVE MODE');
    const notas = [];
    for (const [doc, grupo] of porParte) {
      const linhas = grupo.map((v) => { const q = v.quantidade - v.devolvidos - v.cobrados; return { v, q, valor: centavos(q * c.valores[v.tipo_palete]) }; });
      const total = centavos(linhas.reduce((t, l) => t + l.valor, 0));
      const { rows: [n] } = await cliente.query('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM notas_debito');
      const { rows: cad } = await cliente.query('SELECT email FROM clientes WHERE documento = $1', [doc]);
      const descricao = `Paletes não devolvidos: ${linhas.map((l) => `vale ${l.v.numero} (${l.q} ${TIPOS[l.v.tipo_palete].split(' ')[0]} × R$ ${c.valores[l.v.tipo_palete].toFixed(2).replace('.', ',')})`).join('; ')}`;
      const { rows: [nota] } = await cliente.query(
        `INSERT INTO notas_debito (numero, emissao, tomador_doc, tomador_nome, tomador_email, descricao, valor, origem, criado_por_nome) VALUES ($1,$2,$3,$4,$5,$6,$7,'palete',$8) RETURNING *`,
        [n.n, hojeBr(), doc, grupo[0].parte_nome, cad[0]?.email || null, descricao, total, usuario?.nome || null]);
      for (const l of linhas) {
        await inserirMov(cliente, { parte_doc: doc, parte_nome: l.v.parte_nome, tipo: l.v.tipo_palete, sentido: 'entrada', quantidade: l.q, origem: 'cobranca', vale_id: l.v.id, nota_debito_id: nota.id,
          observacao: `Vale ${l.v.numero} cobrado na nota de débito ${nota.numero}`, usuario_nome: usuario?.nome });
        await cliente.query('UPDATE vales_palete SET cobrados = cobrados + $2 WHERE id = $1', [l.v.id, l.q]);
        await atualizarVale(cliente, l.v.id);
      }
      notas.push({ id: nota.id, numero: nota.numero, tomador_nome: nota.tomador_nome, valor: Number(nota.valor), vales: linhas.length });
    }
    await cliente.query('COMMIT');
    return notas;
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}
// Cancela a nota (fora de fatura): os vales voltam a ficar abertos e o saldo volta.
async function cancelarNota(id, motivo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [n] } = await cliente.query('SELECT * FROM notas_debito WHERE id = $1 FOR UPDATE', [id]);
    if (!n) throw falha('Nota de débito não encontrada.', 404);
    if (n.status === 'cancelada') throw falha('A nota já está cancelada.', 409);
    if (n.fatura_id) {
      const { rows: [f] } = await cliente.query('SELECT numero, status FROM faturas_transporte WHERE id = $1', [n.fatura_id]);
      if (f && f.status !== 'cancelada') throw falha(`A nota está na fatura ${f.numero}: cancele a fatura antes.`, 409);
    }
    const { rows: movs } = await cliente.query(`SELECT * FROM paletes_movimentos WHERE nota_debito_id = $1 AND origem = 'cobranca'`, [id]);
    for (const m of movs) {
      await cliente.query('UPDATE vales_palete SET cobrados = GREATEST(0, cobrados - $2) WHERE id = $1', [m.vale_id, m.quantidade]);
      await atualizarVale(cliente, m.vale_id);
    }
    await cliente.query(`DELETE FROM paletes_movimentos WHERE nota_debito_id = $1 AND origem = 'cobranca'`, [id]);
    await cliente.query(`UPDATE notas_debito SET status = 'cancelada', motivo_cancelamento = $2, fatura_id = NULL WHERE id = $1`, [id, texto(motivo, 250)]);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}
async function notas() {
  const { rows } = await pool.query(`SELECT n.*, n.emissao::text AS emissao, n.valor::float, f.numero AS fatura_numero, f.status AS fatura_status FROM notas_debito n
    LEFT JOIN faturas_transporte f ON f.id = n.fatura_id ORDER BY n.id DESC LIMIT 300`);
  return rows;
}

// ---------- Documentos impressos ----------
async function empresa() {
  const { rows } = await pool.query('SELECT razao_social, nome_fantasia, cnpj, telefone, endereco, numero, bairro, municipio, uf FROM empresa WHERE id = 1');
  return rows[0] || {};
}
const fmtDoc = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
const diaBr = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const pagina = (titulo, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
  body{font-family:Arial,sans-serif;color:#111;max-width:760px;margin:24px auto;padding:0 16px;font-size:13px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin:12px 0}
  td,th{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eee}.cab{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
  .assin{display:flex;gap:40px;margin-top:60px}.assin div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center}.n{text-align:right}.via{margin-top:28px;border-top:1px dashed #999;padding-top:18px}
  @media print{button{display:none}}</style></head><body><button onclick="print()" style="float:right">Imprimir</button>${corpo}</body></html>`;
async function valeHtml(id) {
  const { rows: [v] } = await pool.query(`SELECT ${COLS_VALE}, c.chave FROM vales_palete v LEFT JOIN ctes_emitidos c ON c.id = v.cte_id WHERE v.id = $1`, [id]);
  if (!v) throw falha('Vale não encontrado.', 404);
  const e = await empresa();
  const via = (qual) => `<div class="cab"><div><h1>VALE-PALETE Nº ${v.numero}</h1><div>${esc(qual)}</div></div><div style="text-align:right"><b>${esc(e.razao_social || '')}</b><br>CNPJ ${esc(fmtDoc(e.cnpj))}<br>${esc([e.municipio, e.uf].filter(Boolean).join('/'))} ${esc(e.telefone || '')}</div></div>
    <p>Reconheço que fiquei com <b>${v.quantidade} palete(s) ${esc(TIPOS[v.tipo_palete])}</b> de propriedade/responsabilidade de <b>${esc(e.razao_social || '')}</b>,
    recebidos com a mercadoria${v.cte_numero ? ` do CT-e ${esc(v.cte_serie)}/${esc(v.cte_numero)}` : ''}, e me comprometo a devolvê-los até <b>${diaBr(v.vencimento)}</b>. Os paletes não devolvidos no prazo poderão ser cobrados por nota de débito.</p>
    <table><tr><th>Emitido em</th><th>Devolver até</th><th>Tipo</th><th class="n">Quantidade</th></tr><tr><td>${diaBr(v.emissao)}</td><td>${diaBr(v.vencimento)}</td><td>${esc(TIPOS[v.tipo_palete])}</td><td class="n">${v.quantidade}</td></tr></table>
    <p><b>Devedor:</b> ${esc(v.parte_nome)}${v.parte_doc ? ` — CNPJ/CPF ${esc(fmtDoc(v.parte_doc))}` : ''}</p>${v.observacao ? `<p>${esc(v.observacao)}</p>` : ''}
    <div class="assin"><div>${esc(v.recebedor_nome || 'Nome de quem recebeu')}${v.recebedor_documento ? ` — ${esc(v.recebedor_documento)}` : ''}<br>Assinatura</div><div>${esc(e.nome_fantasia || e.razao_social || '')}<br>Motorista / conferente</div></div>`;
  return pagina(`Vale-palete ${v.numero}`, `${via('Via da transportadora')}<div class="via">${via('Via do cliente')}</div>`);
}
async function notaHtml(id) {
  const { rows: [n] } = await pool.query('SELECT *, emissao::text AS emissao FROM notas_debito WHERE id = $1', [id]);
  if (!n) throw falha('Nota de débito não encontrada.', 404);
  const e = await empresa();
  return pagina(`Nota de débito ${n.numero}`, `<div class="cab"><div><h1>NOTA DE DÉBITO Nº ${n.numero}</h1><div>Emitida em ${diaBr(n.emissao)}${n.status === 'cancelada' ? ' — <b style="color:#c00">CANCELADA</b>' : ''}</div></div>
    <div style="text-align:right"><b>${esc(e.razao_social || '')}</b><br>CNPJ ${esc(fmtDoc(e.cnpj))}<br>${esc([e.endereco, e.numero, e.bairro].filter(Boolean).join(', '))}<br>${esc([e.municipio, e.uf].filter(Boolean).join('/'))}</div></div>
    <p><b>Debitamos a:</b> ${esc(n.tomador_nome || '')} — CNPJ/CPF ${esc(fmtDoc(n.tomador_doc))}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr><tr><td>${esc(n.descricao)}</td><td class="n">R$ ${Number(n.valor).toFixed(2).replace('.', ',')}</td></tr></table>
    <p style="color:#555">Documento de cobrança de ressarcimento (não é nota fiscal: paletes não devolvidos não são prestação de serviço). O valor entra na fatura e pode ser pago pelo boleto/PIX dela.</p>`);
}

// ---------- Portal e tela Hoje ----------
async function doPortal(u) {
  const { rows } = await pool.query(
    `SELECT tipo_palete, ${SALDO} AS saldo, MAX(data)::text AS ultimo FROM paletes_movimentos m WHERE parte_doc = ANY($1::text[]) GROUP BY tipo_palete`, [u.documentos]);
  const { rows: vs } = await pool.query(`SELECT ${COLS_VALE} FROM vales_palete v LEFT JOIN ctes_emitidos c ON c.id = v.cte_id
    WHERE v.parte_doc = ANY($1::text[]) AND v.status <> 'cancelado' ORDER BY (v.status = 'aberto') DESC, v.id DESC LIMIT 100`, [u.documentos]);
  return {
    saldos: rows.filter((r) => r.saldo !== 0).map((r) => ({ tipo: r.tipo_palete, tipo_nome: TIPOS[r.tipo_palete], saldo: r.saldo, ultimo: r.ultimo })),
    vales: vs.map((v) => ({ id: v.id, numero: v.numero, emissao: v.emissao, vencimento: v.vencimento, tipo_nome: TIPOS[v.tipo_palete], quantidade: v.quantidade, pendente: v.pendente,
      status: v.status, status_nome: STATUS_VALE[v.status], vencido: v.vencido, cte: v.cte_numero ? `${v.cte_serie}/${v.cte_numero}` : null })),
  };
}
async function pendencias() {
  const { rows: [r] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE vencimento < $1::date)::int AS vencidos, COALESCE(SUM(quantidade - devolvidos - cobrados) FILTER (WHERE vencimento < $1::date), 0)::int AS paletes_vencidos
    FROM vales_palete WHERE status = 'aberto'`, [hojeBr()]);
  return r;
}

module.exports = { TIPOS, ORIGENS, STATUS_VALE, config, salvarConfig, troca, distribuir, parteDaEntrega, naEntrega, naColeta, aoApagarOcorrencia, lancar, excluirMovimento, saldos, vales, extrato,
  cancelarVale, cobrar, cancelarNota, notas, valeHtml, notaHtml, doPortal, pendencias };
