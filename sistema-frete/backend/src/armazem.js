// Armazenagem (armazém geral, estilo SSW): a mercadoria do cliente (depositante)
// entra pela NF-e (XML) ou à mão, fica em lotes com endereço no armazém e sai
// por pedido (do portal ou da equipe), com lista de separação. No fim do mês a
// cobrança sai pela ocupação de cada dia (palete, m³, tonelada ou volume),
// taxas de entrada e saída, ad valorem e mínimo do contrato, numa NFS-e.
const pool = require('./db');
const Doc = require('./utils/documento');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const arred = (v, c = 4) => Math.round((Number(v) || 0) * 10 ** c) / 10 ** c;
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
const num = (v) => { if (v === '' || v == null) return 0; const n = typeof v === 'number' ? v : Number(String(v).includes(',') ? String(v).replace(/\./g, '').replace(',', '.') : v); return Number.isFinite(n) ? n : NaN; };
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const DIA = `(m.data AT TIME ZONE 'America/Sao_Paulo')::date`;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Unidade da diária e das taxas do contrato: qual medida do lote ela usa.
const BASES = {
  palete: { nome: 'posição-palete', curto: 'palete', campo: 'paletes', fator: 1 },
  m3: { nome: 'm³', curto: 'm³', campo: 'volume_m3', fator: 1 },
  ton: { nome: 'tonelada', curto: 'tonelada', campo: 'peso_kg', fator: 0.001 },
  volume: { nome: 'volume (caixa)', curto: 'volume', campo: 'volumes', fator: 1 },
};
const MEDIDAS = ['peso_kg', 'volume_m3', 'volumes', 'paletes', 'valor'];

// ---------- Regras (sem banco) ----------
// Reparte um total entre as linhas na proporção dos pesos (a soma fecha certinho).
function repartir(total, pesos, casas = 2) {
  const t = Number(total) || 0;
  const soma = pesos.reduce((s, p) => s + (Number(p) || 0), 0);
  if (!t || !pesos.length) return pesos.map(() => 0);
  const base = soma > 0 ? pesos.map((p) => (Number(p) || 0) / soma) : pesos.map(() => 1 / pesos.length);
  const f = 10 ** casas;
  const partes = base.map((b) => Math.floor(t * b * f) / f);
  let resto = Math.round((t - partes.reduce((s, x) => s + x, 0)) * f);
  for (let i = 0; resto > 0; i = (i + 1) % partes.length, resto -= 1) partes[i] = Math.round((partes[i] + 1 / f) * f) / f;
  return partes;
}
// Saída por produto: pega dos lotes que vencem antes (FEFO) e, sem validade, dos mais antigos (FIFO).
function alocar(lotes, quantidade) {
  let resta = Number(quantidade) || 0;
  const ordem = [...lotes].sort((a, b) => (a.validade && b.validade ? String(a.validade).localeCompare(String(b.validade)) : a.validade ? -1 : b.validade ? 1 : 0) || a.id - b.id);
  const itens = [];
  for (const l of ordem) {
    if (resta <= 0) break;
    const q = Math.min(Number(l.saldo), resta);
    if (q > 0) { itens.push({ lote_id: l.id, quantidade: arred(q) }); resta = arred(resta - q); }
  }
  return { itens, falta: Math.max(0, arred(resta)) };
}
// Medidas que saem junto com uma quantidade (proporcionais ao que entrou no lote).
function proporcional(lote, qtd) {
  const f = Number(lote.quantidade) ? qtd / Number(lote.quantidade) : 0;
  return { peso_kg: arred(lote.peso_kg * f, 3), volume_m3: arred(lote.volume_m3 * f, 4), volumes: arred(lote.volumes * f, 2), paletes: arred(lote.paletes * f, 2), valor: centavos(lote.valor * f) };
}
const diasDoMes = (comp) => { const [a, m] = comp.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
// Valor do mês pelo contrato. ocupacao: [{ dia, ocupacao (na base), valor (R$ da mercadoria) }].
function calcular(contrato, { ocupacao, entradas = 0, saidas = 0, competencia }) {
  const b = BASES[contrato.base] || BASES.palete;
  const unidadesDia = arred(ocupacao.reduce((s, d) => s + Math.max(0, d.ocupacao), 0), 3);
  const armazenagem = centavos(unidadesDia * Number(contrato.preco_dia));
  const taxaEntrada = centavos(entradas * Number(contrato.taxa_entrada));
  const taxaSaida = centavos(saidas * Number(contrato.taxa_saida));
  const valorMedio = ocupacao.length ? centavos(ocupacao.reduce((s, d) => s + Math.max(0, d.valor), 0) / ocupacao.length) : 0;
  const adValorem = centavos((valorMedio * Number(contrato.ad_valorem)) / 100 * (ocupacao.length / diasDoMes(competencia)));
  const soma = centavos(armazenagem + taxaEntrada + taxaSaida + adValorem);
  const minimo = Number(contrato.minimo_mes) || 0;
  return {
    base: contrato.base, base_nome: b.nome, dias: ocupacao.length, unidades_dia: unidadesDia, pico: arred(Math.max(0, ...ocupacao.map((d) => d.ocupacao)), 3),
    armazenagem, entradas: arred(entradas, 3), taxa_entrada: taxaEntrada, saidas: arred(saidas, 3), taxa_saida: taxaSaida,
    valor_medio: valorMedio, ad_valorem: adValorem, soma, minimo, complemento_minimo: soma > 0 && soma < minimo ? centavos(minimo - soma) : 0,
    total: soma > 0 ? Math.max(soma, minimo) : (minimo && ocupacao.some((d) => d.ocupacao > 0) ? minimo : 0),
  };
}

// ---------- Contratos ----------
async function contratos() {
  const { rows } = await pool.query(`SELECT c.*, c.preco_dia::float, c.taxa_entrada::float, c.taxa_saida::float, c.ad_valorem::float, c.minimo_mes::float FROM armazem_contratos c ORDER BY c.ativo DESC, c.depositante_nome`);
  return rows;
}
async function salvarContrato(id, b) {
  const doc = Doc.limpar(b.depositante_doc);
  if (!doc || ![11, 14].includes(doc.length)) throw falha('Informe o CNPJ/CPF do depositante.');
  const nome = texto(b.depositante_nome, 200);
  if (!nome) throw falha('Informe o nome do depositante.');
  if (!BASES[b.base]) throw falha('Escolha a unidade de cobrança.');
  const v = (k, max = 100000) => { const n = num(b[k]); if (!Number.isFinite(n) || n < 0 || n > max) throw falha(`Valor inválido em ${k.replace('_', ' ')}.`); return n; };
  const val = [doc, nome, b.base, v('preco_dia'), v('taxa_entrada'), v('taxa_saida'), v('ad_valorem', 100), v('minimo_mes', 10000000), b.ativo !== false, texto(b.observacao, 500)];
  try {
    const { rows } = id
      ? await pool.query(`UPDATE armazem_contratos SET depositante_doc=$1, depositante_nome=$2, base=$3, preco_dia=$4, taxa_entrada=$5, taxa_saida=$6, ad_valorem=$7, minimo_mes=$8, ativo=$9, observacao=$10 WHERE id=$11 RETURNING *`, [...val, id])
      : await pool.query(`INSERT INTO armazem_contratos (depositante_doc, depositante_nome, base, preco_dia, taxa_entrada, taxa_saida, ad_valorem, minimo_mes, ativo, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, val);
    if (!rows[0]) throw falha('Contrato não encontrado.', 404);
    return rows[0];
  } catch (e) { if (e.code === '23505') throw falha('Esse depositante já tem contrato.', 409); throw e; }
}

// ---------- Entrada ----------
// Lê a NF-e de remessa para armazenagem (ou de compra entregue no armazém).
async function previaXml(xml) {
  const nf = require('./entradas').lerXml(xml);
  if (nf.modelo !== '55') throw falha('Envie o XML da NF-e da mercadoria (não o do CT-e).');
  const { XMLParser } = require('fast-xml-parser');
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false }).parse(String(xml));
  const inf = (doc.nfeProc?.NFe || doc.NFe)?.infNFe || {};
  const vols = [].concat(inf.transp?.vol || []);
  const peso = vols.reduce((s, x) => s + (Number(x.pesoB || x.pesoL) || 0), 0);
  const volumes = vols.reduce((s, x) => s + (Number(x.qVol) || 0), 0);
  const { rows: [e] } = await pool.query('SELECT cnpj FROM empresa WHERE id = 1');
  const minha = Doc.limpar(e?.cnpj);
  // Remessa para armazenagem: o depositante emite a nota para o armazém. Compra entregue aqui: o depositante é o destinatário.
  const depEmitente = nf.destinatario_doc === minha || /armazen|dep[oó]sito/i.test(nf.natureza);
  const depDoc = depEmitente ? nf.emitente.doc : nf.destinatario_doc;
  const nomeDest = inf.dest?.xNome || '';
  const { rows: ja } = await pool.query(`SELECT id FROM armazem_movimentos WHERE nf_chave = $1 AND tipo = 'entrada' AND status = 'confirmado'`, [nf.chave]);
  const { rows: ct } = await pool.query('SELECT id FROM armazem_contratos WHERE depositante_doc = $1 AND ativo', [depDoc]);
  return {
    depositante_doc: depDoc, depositante_nome: depEmitente ? nf.emitente.nome : nomeDest, nf_numero: nf.numero, nf_chave: nf.chave, emissao: nf.emissao, natureza: nf.natureza,
    peso_kg: arred(peso, 3), volumes, valor_total: nf.valor_produtos, ja_lancada: ja[0]?.id || null, tem_contrato: !!ct[0],
    itens: nf.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, ncm: i.ncm, quantidade: i.quantidade, valor: i.valor })),
  };
}
// b: { depositante_doc, depositante_nome, nf_numero, nf_chave, data, observacao, endereco, peso_kg, volume_m3, volumes, paletes (totais), itens: [...] }
async function registrarEntrada(b, usuario) {
  const doc = Doc.limpar(b.depositante_doc);
  if (!doc || ![11, 14].includes(doc.length)) throw falha('Informe o CNPJ/CPF do depositante.');
  const itens = (Array.isArray(b.itens) ? b.itens : []).map((i) => ({ ...i, quantidade: num(i.quantidade), valor: num(i.valor) })).filter((i) => i.quantidade > 0 || String(i.descricao || '').trim());
  if (!itens.length) throw falha('Informe os produtos que entraram.');
  const ruim = itens.find((i) => !(i.quantidade > 0) || !String(i.descricao || '').trim() || !Number.isFinite(i.valor) || i.valor < 0);
  if (ruim) throw falha(`Confira o produto "${ruim.descricao || ruim.codigo || '?'}": descrição e quantidade maior que zero.`);
  // Totais da nota (peso, m³, volumes, paletes) repartidos pelo valor de cada produto (sem valor: pela quantidade).
  const pesos = itens.map((i) => (itens.some((x) => x.valor > 0) ? i.valor : i.quantidade));
  const tot = {};
  for (const k of ['peso_kg', 'volume_m3', 'volumes', 'paletes']) {
    const t = num(b[k]);
    if (!Number.isFinite(t) || t < 0) throw falha(`Total inválido: ${k}.`);
    tot[k] = itens.some((i) => num(i[k]) > 0) ? itens.map((i) => num(i[k]) || 0) : repartir(t, pesos, k === 'volume_m3' ? 4 : k === 'peso_kg' ? 3 : 2);
  }
  const data = dataIso(b.data);
  if (data && data > hojeBr()) throw falha('A data da entrada está no futuro.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [m] } = await cliente.query(
      `INSERT INTO armazem_movimentos (tipo, data, depositante_doc, depositante_nome, nf_numero, nf_chave, observacao, usuario_nome)
       VALUES ('entrada', COALESCE($1::date + LOCALTIME, NOW()), $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data, doc, texto(b.depositante_nome, 200), texto(b.nf_numero, 20), (String(b.nf_chave || '').replace(/\D/g, '').length === 44 ? String(b.nf_chave).replace(/\D/g, '') : null), texto(b.observacao, 500), usuario?.nome]);
    for (const [k, i] of itens.entries()) {
      const medidas = { peso_kg: tot.peso_kg[k], volume_m3: tot.volume_m3[k], volumes: tot.volumes[k], paletes: tot.paletes[k], valor: centavos(i.valor) };
      const { rows: [l] } = await cliente.query(
        `INSERT INTO armazem_lotes (entrada_id, depositante_doc, produto_codigo, descricao, unidade, ncm, lote, validade, endereco, quantidade, peso_kg, volume_m3, volumes, paletes, valor, saldo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$10) RETURNING id`,
        [m.id, doc, texto(i.codigo, 60), texto(i.descricao, 250), texto(i.unidade, 10), texto(i.ncm, 10), texto(i.lote, 40), dataIso(i.validade), texto(i.endereco || b.endereco, 40)?.toUpperCase() || null,
          arred(i.quantidade), medidas.peso_kg, medidas.volume_m3, medidas.volumes, medidas.paletes, medidas.valor]);
      await cliente.query(`INSERT INTO armazem_mov_itens (movimento_id, lote_id, quantidade, peso_kg, volume_m3, volumes, paletes, valor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [m.id, l.id, arred(i.quantidade), medidas.peso_kg, medidas.volume_m3, medidas.volumes, medidas.paletes, medidas.valor]);
    }
    await cliente.query('COMMIT');
    return m;
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') throw falha('Essa NF-e já deu entrada no armazém.', 409);
    throw e;
  } finally { cliente.release(); }
}

// ---------- Saída e ajuste ----------
// b: { depositante_doc, itens: [{ lote_id, quantidade } | { produto_codigo, quantidade }], destinatario, nf_numero, nf_chave, cte, pedido_id, observacao, data }
async function registrarSaida(b, usuario, tipo = 'saida') {
  const doc = Doc.limpar(b.depositante_doc);
  if (!doc) throw falha('Informe o depositante.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const data = dataIso(b.data);
    if (data && data > hojeBr()) throw falha('A data está no futuro.');
    // Só os lotes que já tinham entrado na data da saída (saída com data passada não leva o que chegou depois).
    const { rows: lotes } = await cliente.query(
      `SELECT l.*, l.validade::text AS validade, (e.data AT TIME ZONE 'America/Sao_Paulo')::date::text AS entrou FROM armazem_lotes l JOIN armazem_movimentos e ON e.id = l.entrada_id
        WHERE l.depositante_doc = $1 AND e.status = 'confirmado' AND (l.saldo > 0 OR $2) ORDER BY l.id FOR UPDATE OF l`, [doc, tipo === 'ajuste']);
    const naData = (l) => !data || l.entrou <= data;
    const porId = new Map(lotes.map((l) => [l.id, l]));
    const linhas = [];
    for (const i of Array.isArray(b.itens) ? b.itens : []) {
      const q = arred(num(i.quantidade));
      if (!Number.isFinite(q) || (tipo === 'saida' ? q <= 0 : q === 0)) continue;
      if (i.lote_id) {
        const l = porId.get(Number(i.lote_id));
        if (!l) throw falha('Lote não encontrado neste depositante.', 404);
        if (!naData(l)) throw falha(`${l.descricao}${l.lote ? ` (lote ${l.lote})` : ''} só entrou em ${l.entrou.split('-').reverse().join('/')}, depois da data da saída.`);
        if (q > Number(l.saldo)) throw falha(`${l.descricao}${l.lote ? ` (lote ${l.lote})` : ''}: só há ${Number(l.saldo)} ${l.unidade || ''} no armazém.`);
        if (Number(l.saldo) - q > Number(l.quantidade) * 10) throw falha('Ajuste grande demais para este lote.');
        linhas.push({ l, q });
      } else {
        const cod = String(i.produto_codigo || '').trim();
        const doProduto = lotes.filter((l) => (l.produto_codigo || l.descricao) === cod && Number(l.saldo) > 0 && naData(l));
        const { itens, falta } = alocar(doProduto.map((l) => ({ id: l.id, saldo: Number(l.saldo), validade: l.validade })), q);
        if (falta > 0) throw falha(`${cod}: faltam ${falta} no armazém para esta saída.`);
        itens.forEach((x) => linhas.push({ l: porId.get(x.lote_id), q: x.quantidade }));
      }
    }
    if (!linhas.length) throw falha(tipo === 'saida' ? 'Informe o que sai (quantidade maior que zero).' : 'Informe a diferença do inventário.');
    let cteId = null;
    if (String(b.cte || '').trim()) {
      const { rows: [c] } = await cliente.query(`SELECT id FROM ctes_emitidos WHERE status = 'autorizado' AND (numero::text = $1 OR chave = $1) ORDER BY id DESC LIMIT 1`, [String(b.cte).replace(/\D/g, '')]);
      if (!c) throw falha('CT-e da saída não encontrado.');
      cteId = c.id;
    }
    const { rows: [m] } = await cliente.query(
      `INSERT INTO armazem_movimentos (tipo, data, depositante_doc, depositante_nome, nf_numero, nf_chave, destinatario, cte_id, pedido_id, observacao, usuario_nome)
       VALUES ($1, COALESCE($2::date + LOCALTIME, NOW()), $3::varchar, (SELECT depositante_nome FROM armazem_movimentos WHERE depositante_doc = $3::varchar AND tipo = 'entrada' ORDER BY id DESC LIMIT 1), $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [tipo, data, doc, texto(b.nf_numero, 20), (String(b.nf_chave || '').replace(/\D/g, '').length === 44 ? String(b.nf_chave).replace(/\D/g, '') : null), texto(b.destinatario, 200), cteId,
        Number(b.pedido_id) || null, texto(b.observacao, 500), usuario?.nome]);
    for (const { l, q } of linhas) {
      const md = proporcional(l, q);
      await cliente.query(`INSERT INTO armazem_mov_itens (movimento_id, lote_id, quantidade, peso_kg, volume_m3, volumes, paletes, valor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [m.id, l.id, q, md.peso_kg, md.volume_m3, md.volumes, md.paletes, md.valor]);
      await cliente.query('UPDATE armazem_lotes SET saldo = saldo - $2 WHERE id = $1', [l.id, q]);
      l.saldo = Number(l.saldo) - q;
    }
    if (b.pedido_id) {
      const { rowCount } = await cliente.query(`UPDATE armazem_pedidos SET status = 'atendido', movimento_id = $2, atualizado_em = NOW() WHERE id = $1 AND depositante_doc = $3 AND status = 'pendente'`, [b.pedido_id, m.id, doc]);
      if (!rowCount) throw falha('O pedido de saída não está pendente.', 409);
    }
    await cliente.query('COMMIT');
    return { ...m, itens: linhas.length };
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}
// Inventário: informa quanto há de fato no lote; a diferença vira um ajuste.
async function ajustar(b, usuario) {
  const { rows: [l] } = await pool.query('SELECT * FROM armazem_lotes WHERE id = $1', [Number(b.lote_id)]);
  if (!l) throw falha('Lote não encontrado.', 404);
  const contado = num(b.contado);
  if (!Number.isFinite(contado) || contado < 0) throw falha('Informe a quantidade contada.');
  const dif = arred(Number(l.saldo) - contado);
  if (!dif) throw falha('A contagem bate com o saldo: nada a ajustar.');
  if (!texto(b.motivo, 500)) throw falha('Informe o motivo do ajuste (avaria, contagem, extravio...).');
  return registrarSaida({ depositante_doc: l.depositante_doc, itens: [{ lote_id: l.id, quantidade: dif }], observacao: `Inventário: contado ${contado}, saldo era ${Number(l.saldo)}. ${b.motivo}` }, usuario, 'ajuste');
}

async function cancelarMovimento(id, motivo, usuario) {
  const m0 = texto(motivo, 250);
  if (!m0) throw falha('Informe o motivo.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [m] } = await cliente.query('SELECT * FROM armazem_movimentos WHERE id = $1 FOR UPDATE', [id]);
    if (!m) throw falha('Movimento não encontrado.', 404);
    if (m.status === 'cancelado') throw falha('Já está cancelado.', 409);
    const { rows: [cob] } = await cliente.query(`SELECT competencia FROM armazem_cobrancas WHERE depositante_doc = $1 AND status = 'gerada' AND competencia >= TO_CHAR(($2::timestamptz AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')`, [m.depositante_doc, m.data]);
    if (cob) throw falha(`O mês ${cob.competencia} já foi cobrado: cancele a cobrança antes de mexer no movimento.`, 409);
    const { rows: itens } = await cliente.query('SELECT i.*, l.saldo, l.quantidade AS recebido FROM armazem_mov_itens i JOIN armazem_lotes l ON l.id = i.lote_id WHERE i.movimento_id = $1 FOR UPDATE OF l', [id]);
    if (m.tipo === 'entrada') {
      const mexido = itens.find((i) => Number(i.saldo) !== Number(i.recebido));
      if (mexido) throw falha('Já saiu mercadoria desta entrada: cancele as saídas antes.', 409);
      await cliente.query('UPDATE armazem_lotes SET saldo = 0 WHERE entrada_id = $1', [id]);
    } else {
      for (const i of itens) await cliente.query('UPDATE armazem_lotes SET saldo = saldo + $2 WHERE id = $1', [i.lote_id, i.quantidade]);
      if (m.pedido_id) await cliente.query(`UPDATE armazem_pedidos SET status = 'pendente', movimento_id = NULL, atualizado_em = NOW() WHERE id = $1`, [m.pedido_id]);
    }
    await cliente.query(`UPDATE armazem_movimentos SET status = 'cancelado', motivo_cancelamento = $2 WHERE id = $1`, [id, `${m0} (${usuario?.nome || ''})`]);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

// ---------- Consultas ----------
const SALDO_LOTE = `l.*, l.validade::text AS validade, l.saldo::float AS saldo, l.quantidade::float AS quantidade,
  ROUND(l.peso_kg * l.saldo / NULLIF(l.quantidade, 0), 3)::float AS peso_atual, ROUND(l.volume_m3 * l.saldo / NULLIF(l.quantidade, 0), 4)::float AS m3_atual,
  ROUND(l.volumes * l.saldo / NULLIF(l.quantidade, 0), 2)::float AS volumes_atual, ROUND(l.paletes * l.saldo / NULLIF(l.quantidade, 0), 2)::float AS paletes_atual,
  ROUND(l.valor * l.saldo / NULLIF(l.quantidade, 0), 2)::float AS valor_atual,
  e.data AS entrada_em, e.nf_numero AS entrada_nf, (CURRENT_DATE - (e.data AT TIME ZONE 'America/Sao_Paulo')::date) AS dias`;
async function estoque({ depositante = null, busca = '' } = {}) {
  const val = []; const cond = ['l.saldo > 0', `e.status = 'confirmado'`];
  if (depositante) { val.push(Doc.limpar(depositante)); cond.push(`l.depositante_doc = $${val.length}`); }
  const b = String(busca || '').trim();
  if (b) { val.push(`%${b}%`); cond.push(`(l.descricao ILIKE $${val.length} OR l.produto_codigo ILIKE $${val.length} OR l.endereco ILIKE $${val.length} OR l.lote ILIKE $${val.length} OR e.nf_numero = $${val.length + 1})`); val.push(b); }
  const { rows } = await pool.query(`SELECT ${SALDO_LOTE}, e.depositante_nome FROM armazem_lotes l JOIN armazem_movimentos e ON e.id = l.entrada_id WHERE ${cond.join(' AND ')}
    ORDER BY e.depositante_nome, l.descricao, l.validade NULLS LAST, l.id LIMIT 3000`, val);
  return rows;
}
async function resumo() {
  const { rows } = await pool.query(
    `SELECT l.depositante_doc, MAX(e.depositante_nome) AS depositante_nome, COUNT(*)::int AS lotes, COUNT(DISTINCT COALESCE(l.produto_codigo, l.descricao))::int AS produtos,
            SUM(l.peso_kg * l.saldo / NULLIF(l.quantidade, 0))::float AS peso, SUM(l.volume_m3 * l.saldo / NULLIF(l.quantidade, 0))::float AS m3,
            SUM(l.paletes * l.saldo / NULLIF(l.quantidade, 0))::float AS paletes, SUM(l.volumes * l.saldo / NULLIF(l.quantidade, 0))::float AS volumes,
            SUM(l.valor * l.saldo / NULLIF(l.quantidade, 0))::float AS valor, MIN((e.data AT TIME ZONE 'America/Sao_Paulo')::date)::text AS mais_antigo,
            COUNT(*) FILTER (WHERE l.validade IS NOT NULL AND l.validade <= CURRENT_DATE + 30)::int AS vencendo
       FROM armazem_lotes l JOIN armazem_movimentos e ON e.id = l.entrada_id WHERE l.saldo > 0 AND e.status = 'confirmado' GROUP BY l.depositante_doc ORDER BY 2`);
  const { rows: ct } = await pool.query('SELECT depositante_doc, base, ativo FROM armazem_contratos');
  const contrato = new Map(ct.map((c) => [c.depositante_doc, c]));
  return rows.map((r) => ({ ...r, contrato: contrato.get(r.depositante_doc) || null }));
}
async function movimentos({ depositante = null, tipo = '', de, ate } = {}) {
  const val = []; const cond = ['TRUE'];
  if (depositante) { val.push(Doc.limpar(depositante)); cond.push(`m.depositante_doc = $${val.length}`); }
  if (['entrada', 'saida', 'ajuste'].includes(tipo)) { val.push(tipo); cond.push(`m.tipo = $${val.length}`); }
  if (dataIso(de)) { val.push(de); cond.push(`${DIA} >= $${val.length}::date`); }
  if (dataIso(ate)) { val.push(ate); cond.push(`${DIA} <= $${val.length}::date`); }
  const { rows } = await pool.query(
    `SELECT m.*, c.serie AS cte_serie, c.numero AS cte_numero, COUNT(i.id)::int AS linhas, SUM(i.quantidade)::float AS quantidade, SUM(i.peso_kg)::float AS peso,
            SUM(i.paletes)::float AS paletes, SUM(i.volume_m3)::float AS m3, SUM(i.valor)::float AS valor
       FROM armazem_movimentos m LEFT JOIN armazem_mov_itens i ON i.movimento_id = m.id LEFT JOIN ctes_emitidos c ON c.id = m.cte_id
      WHERE ${cond.join(' AND ')} GROUP BY m.id, c.serie, c.numero ORDER BY m.data DESC, m.id DESC LIMIT 500`, val);
  return rows;
}
async function movimento(id) {
  const { rows: [m] } = await pool.query('SELECT m.*, c.serie AS cte_serie, c.numero AS cte_numero FROM armazem_movimentos m LEFT JOIN ctes_emitidos c ON c.id = m.cte_id WHERE m.id = $1', [id]);
  if (!m) throw falha('Movimento não encontrado.', 404);
  const { rows: itens } = await pool.query(`SELECT i.*, i.quantidade::float, l.produto_codigo, l.descricao, l.unidade, l.lote, l.validade::text AS validade, l.endereco
    FROM armazem_mov_itens i JOIN armazem_lotes l ON l.id = i.lote_id WHERE i.movimento_id = $1 ORDER BY l.endereco NULLS LAST, l.descricao`, [id]);
  return { ...m, itens };
}

// ---------- Ocupação e cobrança mensal ----------
async function ocupacao(doc, de, ate, campo) {
  const { rows } = await pool.query(
    `SELECT d::date::text AS dia,
            COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN i.${campo} ELSE -i.${campo} END), 0)::float AS ocupacao,
            COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN i.valor ELSE -i.valor END), 0)::float AS valor
       FROM generate_series($2::date, $3::date, INTERVAL '1 day') d
       LEFT JOIN armazem_movimentos m ON m.depositante_doc = $1 AND m.status = 'confirmado' AND ${DIA} <= d::date
       LEFT JOIN armazem_mov_itens i ON i.movimento_id = m.id
      GROUP BY d ORDER BY d`, [doc, de, ate]);
  return rows;
}
async function medicao(contrato, competencia) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(competencia))) throw falha('Mês inválido (AAAA-MM).');
  const b = BASES[contrato.base] || BASES.palete;
  const de = `${competencia}-01`;
  const fimMes = `${competencia}-${String(diasDoMes(competencia)).padStart(2, '0')}`;
  const ate = fimMes < hojeBr() ? fimMes : hojeBr();
  if (de > ate) throw falha('Mês ainda não começou.');
  const oc = (await ocupacao(contrato.depositante_doc, de, ate, b.campo)).map((d) => ({ ...d, ocupacao: arred(d.ocupacao * b.fator, 4) }));
  const { rows: [mv] } = await pool.query(
    `SELECT COALESCE(SUM(i.${b.campo}) FILTER (WHERE m.tipo = 'entrada'), 0)::float AS entradas, COALESCE(SUM(i.${b.campo}) FILTER (WHERE m.tipo = 'saida'), 0)::float AS saidas
       FROM armazem_movimentos m JOIN armazem_mov_itens i ON i.movimento_id = m.id WHERE m.depositante_doc = $1 AND m.status = 'confirmado' AND ${DIA} BETWEEN $2::date AND $3::date`,
    [contrato.depositante_doc, de, ate]);
  return { de, ate, fechado: fimMes < hojeBr(), ...calcular(contrato, { ocupacao: oc, entradas: mv.entradas * b.fator, saidas: mv.saidas * b.fator, competencia }), diario: oc };
}
async function cobrancas(competencia) {
  const lista = [];
  for (const c of (await contratos()).filter((x) => x.ativo)) {
    const { rows: [cob] } = await pool.query(`SELECT a.*, n.status AS nfse_status, n.numero_nfse FROM armazem_cobrancas a LEFT JOIN nfse_emitidas n ON n.id = a.nfse_id
      WHERE a.depositante_doc = $1 AND a.competencia = $2 AND a.status = 'gerada'`, [c.depositante_doc, competencia]);
    let m = null;
    try { m = await medicao(c, competencia); } catch (e) { m = { erro: e.message }; }
    if (m.diario) m.diario = undefined;
    lista.push({ contrato: c, medicao: m, cobranca: cob ? { id: cob.id, valor: Number(cob.valor), nfse_id: cob.nfse_id, nfse_status: cob.nfse_status, nfse_numero: cob.numero_nfse, criado_em: cob.criado_em } : null });
  }
  return lista;
}
async function gerarCobranca(contratoId, competencia, usuario) {
  const { rows: [c] } = await pool.query('SELECT * FROM armazem_contratos WHERE id = $1', [contratoId]);
  if (!c) throw falha('Contrato não encontrado.', 404);
  const m = await medicao(c, competencia);
  if (!m.fechado) throw falha('O mês ainda não acabou: a cobrança sai a partir do dia 1º do mês seguinte.');
  if (!(m.total > 0)) throw falha('Nada a cobrar neste mês (sem ocupação nem movimento).');
  const { rows: [cl] } = await pool.query('SELECT * FROM clientes WHERE documento = $1', [c.depositante_doc]);
  const fmt = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [a, mes] = competencia.split('-');
  const partes = [`Armazenagem ${mes}/${a}: ${String(m.unidades_dia).replace('.', ',')} ${m.base_nome}-dia × R$ ${fmt(c.preco_dia)} = R$ ${fmt(m.armazenagem)}`];
  if (m.taxa_entrada) partes.push(`entrada de ${String(m.entradas).replace('.', ',')} ${BASES[c.base].curto}(s) = R$ ${fmt(m.taxa_entrada)}`);
  if (m.taxa_saida) partes.push(`saída de ${String(m.saidas).replace('.', ',')} ${BASES[c.base].curto}(s) = R$ ${fmt(m.taxa_saida)}`);
  if (m.ad_valorem) partes.push(`ad valorem ${String(c.ad_valorem).replace('.', ',')}% s/ R$ ${fmt(m.valor_medio)} = R$ ${fmt(m.ad_valorem)}`);
  if (m.total > m.soma) partes.push(`mínimo mensal R$ ${fmt(c.minimo_mes)}`);
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [cob] } = await cliente.query(
      `INSERT INTO armazem_cobrancas (depositante_doc, depositante_nome, competencia, memoria, valor, usuario_nome) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [c.depositante_doc, c.depositante_nome, competencia, JSON.stringify({ ...m, diario: undefined, contrato: c }), m.total, usuario?.nome]);
    const nf = await require('./nfse/nfse').criar({
      tomador: { doc: c.depositante_doc, nome: cl?.razao_social || c.depositante_nome, email: cl?.email, fone: cl?.telefone,
        end: { cep: cl?.cep, xLgr: cl?.logradouro, nro: cl?.numero, xCpl: cl?.complemento, xBairro: cl?.bairro, cMun: cl?.cod_municipio, xMun: cl?.municipio, uf: cl?.uf } },
      servico: { descricao: `${partes.join('; ')}.`.slice(0, 2000), cTribNac: '110401', notas: [] },
      valores: { vServ: m.total },
    }, usuario?.nome);
    await cliente.query('UPDATE armazem_cobrancas SET nfse_id = $2 WHERE id = $1', [cob.id, nf.id]);
    await cliente.query('COMMIT');
    return { id: cob.id, nfse_id: nf.id, valor: m.total };
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') throw falha('Esse mês já foi cobrado deste depositante.', 409);
    throw e;
  } finally { cliente.release(); }
}
async function cancelarCobranca(id) {
  const { rows: [c] } = await pool.query(`SELECT a.*, n.status AS nfse_status FROM armazem_cobrancas a LEFT JOIN nfse_emitidas n ON n.id = a.nfse_id WHERE a.id = $1`, [id]);
  if (!c || c.status !== 'gerada') throw falha('Cobrança não encontrada.', 404);
  if (c.nfse_status && !['rascunho', 'rejeitada', 'cancelada'].includes(c.nfse_status)) throw falha(`A NFS-e está ${c.nfse_status}: cancele a NFS-e antes.`, 409);
  if (c.nfse_status === 'rascunho') await require('./nfse/nfse').excluir(c.nfse_id).catch(() => {});
  await pool.query(`UPDATE armazem_cobrancas SET status = 'cancelada' WHERE id = $1`, [id]);
}

// ---------- Pedidos de saída (portal) ----------
async function pedidos({ status = 'pendente' } = {}) {
  const { rows } = await pool.query(`SELECT * FROM armazem_pedidos WHERE ($1 = 'todos' OR status = $1) ORDER BY (status = 'pendente') DESC, id DESC LIMIT 300`, [status]);
  return rows;
}
async function pedirPeloPortal(u, b) {
  const doc = Doc.limpar(b.depositante_doc) || u.documentos[0];
  if (!u.documentos.includes(doc)) throw falha('Depositante não é do seu acesso.', 403);
  const itens = (Array.isArray(b.itens) ? b.itens : []).map((i) => ({ lote_id: Number(i.lote_id), quantidade: arred(num(i.quantidade)) })).filter((i) => i.lote_id && i.quantidade > 0);
  if (!itens.length) throw falha('Informe a quantidade de pelo menos um produto.');
  const { rows: lotes } = await pool.query('SELECT id, descricao, lote, saldo::float, unidade FROM armazem_lotes WHERE id = ANY($1::int[]) AND depositante_doc = $2', [itens.map((i) => i.lote_id), doc]);
  const porId = new Map(lotes.map((l) => [l.id, l]));
  for (const i of itens) {
    const l = porId.get(i.lote_id);
    if (!l) throw falha('Produto não encontrado no seu estoque.', 404);
    if (i.quantidade > l.saldo) throw falha(`${l.descricao}: o saldo é ${l.saldo} ${l.unidade || ''}.`);
    i.descricao = `${l.descricao}${l.lote ? ` (lote ${l.lote})` : ''}`; i.unidade = l.unidade;
  }
  const { rows: [p] } = await pool.query(
    `INSERT INTO armazem_pedidos (depositante_doc, depositante_nome, portal_usuario_id, solicitante, itens, destinatario, nf_numero, observacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [doc, u.cliente_nome || null, u.id, u.nome, JSON.stringify(itens), texto(b.destinatario, 200), texto(b.nf_numero, 20), texto(b.observacao, 1000)]);
  return p;
}
async function cancelarPedido(id, motivo, doPortal = null) {
  const { rowCount } = await pool.query(`UPDATE armazem_pedidos SET status = 'cancelado', motivo = $2, atualizado_em = NOW() WHERE id = $1 AND status = 'pendente' ${doPortal ? 'AND depositante_doc = ANY($3::text[])' : ''}`,
    doPortal ? [id, texto(motivo, 250), doPortal.documentos] : [id, texto(motivo, 250)]);
  if (!rowCount) throw falha('O pedido não está pendente.', 409);
}
async function doPortal(u) {
  const { rows: lotes } = await pool.query(`SELECT ${SALDO_LOTE} FROM armazem_lotes l JOIN armazem_movimentos e ON e.id = l.entrada_id
    WHERE l.depositante_doc = ANY($1::text[]) AND l.saldo > 0 AND e.status = 'confirmado' ORDER BY l.descricao, l.validade NULLS LAST, l.id`, [u.documentos]);
  const { rows: movs } = await pool.query(`SELECT m.id, m.tipo, m.data, m.nf_numero, m.destinatario, COUNT(i.id)::int AS linhas, SUM(i.quantidade)::float AS quantidade
    FROM armazem_movimentos m LEFT JOIN armazem_mov_itens i ON i.movimento_id = m.id WHERE m.depositante_doc = ANY($1::text[]) AND m.status = 'confirmado'
    GROUP BY m.id ORDER BY m.data DESC LIMIT 60`, [u.documentos]);
  const { rows: peds } = await pool.query('SELECT id, status, itens, destinatario, nf_numero, motivo, criado_em FROM armazem_pedidos WHERE depositante_doc = ANY($1::text[]) ORDER BY id DESC LIMIT 40', [u.documentos]);
  return {
    lotes: lotes.map((l) => ({ id: l.id, codigo: l.produto_codigo, descricao: l.descricao, unidade: l.unidade, lote: l.lote, validade: l.validade, saldo: l.saldo, peso: l.peso_atual,
      paletes: l.paletes_atual, entrada_em: l.entrada_em, entrada_nf: l.entrada_nf, dias: l.dias })),
    movimentos: movs, pedidos: peds,
  };
}

// ---------- Documento impresso ----------
async function documentoHtml(id) {
  const m = await movimento(id);
  const { rows: [e] } = await pool.query('SELECT razao_social, cnpj FROM empresa WHERE id = 1');
  const titulo = { entrada: 'RECIBO DE ENTRADA NO ARMAZÉM', saida: 'LISTA DE SEPARAÇÃO / SAÍDA DO ARMAZÉM', ajuste: 'AJUSTE DE INVENTÁRIO' }[m.tipo];
  const n = (v, c = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: c });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} ${m.id}</title><style>
    body{font-family:Arial,sans-serif;font-size:12.5px;max-width:900px;margin:20px auto;padding:0 14px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #999;padding:5px 7px;text-align:left}th{background:#eee}.n{text-align:right}.ass{display:flex;gap:40px;margin-top:50px}.ass div{flex:1;border-top:1px solid #000;text-align:center;padding-top:4px}
    .cab{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:6px}.ok{width:22px}@media print{button{display:none}}</style></head><body>
    <button onclick="print()" style="float:right">Imprimir</button>
    <div class="cab"><div><h1>${esc(titulo)} Nº ${m.id}${m.status === 'cancelado' ? ' — CANCELADO' : ''}</h1><div>${new Date(m.data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div></div>
      <div style="text-align:right"><b>${esc(e?.razao_social || '')}</b><br>CNPJ ${esc(e?.cnpj || '')}</div></div>
    <p><b>Depositante:</b> ${esc(m.depositante_nome || '')} — ${esc(m.depositante_doc)}${m.nf_numero ? ` · <b>NF</b> ${esc(m.nf_numero)}` : ''}${m.destinatario ? ` · <b>Destino:</b> ${esc(m.destinatario)}` : ''}${m.cte_numero ? ` · <b>CT-e</b> ${esc(m.cte_serie)}/${esc(m.cte_numero)}` : ''}</p>
    ${m.observacao ? `<p>${esc(m.observacao)}</p>` : ''}
    <table><tr>${m.tipo === 'saida' ? '<th class="ok">✓</th>' : ''}<th>Endereço</th><th>Código</th><th>Produto</th><th>Lote / validade</th><th class="n">Quantidade</th><th class="n">Peso (kg)</th><th class="n">Paletes</th></tr>
    ${m.itens.map((i) => `<tr>${m.tipo === 'saida' ? '<td></td>' : ''}<td><b>${esc(i.endereco || '—')}</b></td><td>${esc(i.produto_codigo || '')}</td><td>${esc(i.descricao)}</td>
      <td>${esc(i.lote || '')}${i.validade ? ` · ${esc(i.validade.split('-').reverse().join('/'))}` : ''}</td><td class="n">${n(i.quantidade, 4)} ${esc(i.unidade || '')}</td><td class="n">${n(i.peso_kg, 3)}</td><td class="n">${n(i.paletes)}</td></tr>`).join('')}</table>
    <div class="ass"><div>${m.tipo === 'entrada' ? 'Conferente (recebimento)' : 'Separado por'}</div><div>${m.tipo === 'entrada' ? 'Motorista / entregador' : 'Conferido / retirado por'}</div></div></body></html>`;
}

async function pendencias() {
  const { rows: [r] } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM armazem_pedidos WHERE status = 'pendente')::int AS pedidos,
            (SELECT COUNT(*) FROM armazem_lotes l JOIN armazem_movimentos e ON e.id = l.entrada_id WHERE l.saldo > 0 AND e.status = 'confirmado' AND l.validade IS NOT NULL AND l.validade <= CURRENT_DATE + 30)::int AS vencendo`);
  // Mês passado sem cobrança, para quem teve mercadoria no armazém.
  const d = new Date(`${hojeBr()}T12:00:00Z`); d.setUTCDate(0);
  const comp = d.toISOString().slice(0, 7);
  const { rows: [c] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM armazem_contratos c WHERE c.ativo
       AND NOT EXISTS (SELECT 1 FROM armazem_cobrancas a WHERE a.depositante_doc = c.depositante_doc AND a.competencia = $1 AND a.status = 'gerada')
       AND EXISTS (SELECT 1 FROM armazem_movimentos m WHERE m.depositante_doc = c.depositante_doc AND m.status = 'confirmado' AND ${DIA} <= ($1 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')`, [comp]);
  return { ...r, a_cobrar: c.n, competencia: comp };
}

module.exports = { BASES, repartir, alocar, proporcional, calcular, diasDoMes, contratos, salvarContrato, previaXml, registrarEntrada, registrarSaida, ajustar, cancelarMovimento,
  estoque, resumo, movimentos, movimento, medicao, cobrancas, gerarCobranca, cancelarCobranca, pedidos, pedirPeloPortal, cancelarPedido, doPortal, documentoHtml, pendencias };
