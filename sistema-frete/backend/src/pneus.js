// Pneus (estilo SSW): cada pneu pelo número de fogo, a posição no veículo,
// montagem/desmontagem com o km do veículo (km rodados por pneu), rodízio,
// recapagem (vidas), medição de sulco, sucata e o custo por km de cada pneu.
const pool = require('./db');
const contasPagar = require('./contasPagar');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
const inteiro = (v) => { const d = String(v ?? '').split(',')[0].replace(/\D/g, ''); return d ? Number(d) : null; };
const decimal = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const STATUS = { estoque: 'Em estoque', montado: 'Montado', recapagem: 'Na recapagem', sucata: 'Sucata' };
const SULCO_MINIMO = 1.6;   // limite legal (Contran)
const SULCO_ALERTA = 3;     // hora de programar a troca/recapagem
const DESTINOS = ['estoque', 'recapagem', 'sucata'];

// Posições do veículo: tração com o 1º eixo simples (1E, 1D) e os outros duplos; reboque todo duplo; mais o estepe.
// Duplo: EE (esquerdo externo), EI (esquerdo interno), DI, DE.
function posicoes(v) {
  const eixos = Math.min(Math.max(Number(v?.eixos) || 3, 1), 9);
  const r = [];
  for (let e = 1; e <= eixos; e += 1) {
    if (e === 1 && v?.tipo !== 'reboque') r.push({ eixo: e, lados: [`${e}E`, `${e}D`] });
    else r.push({ eixo: e, lados: [`${e}EE`, `${e}EI`, `${e}DI`, `${e}DE`] });
  }
  return { eixos: r, estepe: ['EST1', 'EST2'], todas: [...r.flatMap((x) => x.lados), 'EST1', 'EST2'] };
}
const nomePosicao = (p) => {
  const m = /^(\d)(E|D)(E|I)?$/.exec(p || '');
  if (!m) return p === 'EST1' ? 'Estepe 1' : p === 'EST2' ? 'Estepe 2' : p || '';
  return `Eixo ${m[1]} ${m[2] === 'E' ? 'esquerdo' : 'direito'}${m[3] ? (m[3] === 'E' ? ' externo' : ' interno') : ''}`;
};

async function comTransacao(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}
async function pneuPara(cliente, id) {
  const { rows } = await cliente.query('SELECT * FROM pneus WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw falha('Pneu não encontrado.', 404);
  return rows[0];
}
const movimento = (cliente, m) => cliente.query(
  `INSERT INTO pneu_movimentos (pneu_id, data, tipo, veiculo_id, posicao, km_veiculo, km_rodados, sulco_mm, valor, fornecedor, observacao, usuario_nome)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [m.pneu_id, m.data || hojeBr(), m.tipo, m.veiculo_id || null, m.posicao || null, m.km_veiculo ?? null, m.km_rodados ?? null, m.sulco_mm ?? null, m.valor ?? null, m.fornecedor || null, m.observacao || null, m.usuario || null]);

// ---------- Cadastro ----------
async function cadastrar(b, usuario) {
  const fogo = String(b.numero_fogo || '').trim().toUpperCase().slice(0, 20);
  if (!fogo) throw falha('Informe o número de fogo (a marcação do pneu).');
  const sulco = decimal(b.sulco_mm);
  return comTransacao(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO pneus (numero_fogo, marca, modelo, medida, dot, vida, valor_compra, data_compra, fornecedor, sulco_mm, sulco_em, observacao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [fogo, texto(b.marca, 60), texto(b.modelo, 60), texto(b.medida, 30), texto(b.dot, 10), Math.min(Math.max(parseInt(b.vida, 10) || 0, 0), 9),
        contasPagar.valor(b.valor_compra), iso(b.data_compra), texto(b.fornecedor, 150), sulco, sulco != null ? (iso(b.data_compra) || hojeBr()) : null, texto(b.observacao, 300)]).catch((e) => {
      if (e.code === '23505') throw falha(`Já existe pneu com o número de fogo ${fogo}.`, 409);
      throw e;
    });
    await movimento(c, { pneu_id: rows[0].id, data: iso(b.data_compra) || hojeBr(), tipo: 'cadastro', valor: contasPagar.valor(b.valor_compra), fornecedor: texto(b.fornecedor, 150), sulco_mm: sulco, usuario });
    return rows[0];
  });
}

async function alterar(id, b) {
  const { rows } = await pool.query(
    `UPDATE pneus SET marca = $2, modelo = $3, medida = $4, dot = $5, valor_compra = $6, data_compra = $7, fornecedor = $8, observacao = $9 WHERE id = $1 RETURNING *`,
    [id, texto(b.marca, 60), texto(b.modelo, 60), texto(b.medida, 30), texto(b.dot, 10), contasPagar.valor(b.valor_compra), iso(b.data_compra), texto(b.fornecedor, 150), texto(b.observacao, 300)]);
  if (!rows[0]) throw falha('Pneu não encontrado.', 404);
  return rows[0];
}

// ---------- Movimentos ----------
async function kmDoVeiculo(cliente, veiculoId, km) {
  const { rows } = await cliente.query('SELECT id, placa, tipo, eixos, km_atual FROM veiculos WHERE id = $1', [veiculoId]);
  if (!rows[0]) throw falha('Veículo não encontrado.', 404);
  const k = km ?? rows[0].km_atual;
  if (k == null) throw falha(`Informe o km do veículo ${rows[0].placa} (ele ainda não tem km registrado).`);
  return { v: rows[0], km: k };
}

// Monta o pneu (do estoque) numa posição livre do veículo.
async function montarCom(c, p, { veiculo_id, posicao, km, data, usuario }) {
  if (p.status !== 'estoque') throw falha(`O pneu ${p.numero_fogo} está ${STATUS[p.status].toLowerCase()}: só monta pneu que está no estoque.`);
  const { v, km: kmV } = await kmDoVeiculo(c, Number(veiculo_id), km);
  if (!posicoes(v).todas.includes(posicao)) throw falha(`Posição ${posicao} não existe no ${v.placa} (${v.eixos || 3} eixos).`);
  const { rows: ocup } = await c.query(`SELECT numero_fogo FROM pneus WHERE veiculo_id = $1 AND posicao = $2 AND status = 'montado' AND id <> $3`, [v.id, posicao, p.id]);
  if (ocup[0]) throw falha(`A posição ${nomePosicao(posicao)} do ${v.placa} já tem o pneu ${ocup[0].numero_fogo}: desmonte antes (ou use o rodízio, que troca os dois).`, 409);
  await c.query(`UPDATE pneus SET status = 'montado', veiculo_id = $2, posicao = $3, km_montagem = $4 WHERE id = $1`, [p.id, v.id, posicao, kmV]);
  await movimento(c, { pneu_id: p.id, data, tipo: 'montagem', veiculo_id: v.id, posicao, km_veiculo: kmV, usuario });
  return { placa: v.placa, posicao, km: kmV };
}
// Tira o pneu do veículo, somando os km rodados nesta montagem.
async function desmontarCom(c, p, { km, destino = 'estoque', sulco, data, observacao, usuario }) {
  if (p.status !== 'montado') throw falha(`O pneu ${p.numero_fogo} não está montado.`);
  const { km: kmV } = await kmDoVeiculo(c, p.veiculo_id, km);
  if (p.km_montagem != null && kmV < p.km_montagem) throw falha(`O km informado (${kmV}) é menor que o da montagem (${p.km_montagem}).`);
  const rodados = p.km_montagem != null ? kmV - p.km_montagem : 0;
  const s = decimal(sulco);
  await c.query(`UPDATE pneus SET status = $2, veiculo_id = NULL, posicao = NULL, km_montagem = NULL, km_acumulado = km_acumulado + $3,
      sulco_mm = COALESCE($4, sulco_mm), sulco_em = CASE WHEN $4 IS NULL THEN sulco_em ELSE $5::date END WHERE id = $1`, [p.id, destino, rodados, s, data || hojeBr()]);
  await movimento(c, { pneu_id: p.id, data, tipo: 'desmontagem', veiculo_id: p.veiculo_id, posicao: p.posicao, km_veiculo: kmV, km_rodados: rodados, sulco_mm: s, observacao, usuario });
  if (destino !== 'estoque') await movimento(c, { pneu_id: p.id, data, tipo: destino, observacao, usuario });
  return { rodados };
}

async function montar(id, b, usuario) {
  return comTransacao(async (c) => montarCom(c, await pneuPara(c, id), { veiculo_id: b.veiculo_id, posicao: String(b.posicao || ''), km: inteiro(b.km), data: iso(b.data), usuario }));
}
async function desmontar(id, b, usuario) {
  const destino = DESTINOS.includes(b.destino) ? b.destino : 'estoque';
  if (destino === 'sucata' && !texto(b.observacao, 300)) throw falha('Diga o motivo da sucata (ex.: corte lateral, desgaste irregular).');
  return comTransacao(async (c) => desmontarCom(c, await pneuPara(c, id), { km: inteiro(b.km), destino, sulco: b.sulco_mm, data: iso(b.data), observacao: texto(b.observacao, 300), usuario }));
}
// Rodízio: leva o pneu para outra posição (do mesmo ou de outro veículo). Se a posição tiver pneu, os dois trocam de lugar.
async function rodizio(id, b, usuario) {
  return comTransacao(async (c) => {
    const p = await pneuPara(c, id);
    if (p.status !== 'montado') throw falha('Rodízio é para pneu montado. Para pneu do estoque, use "Montar".');
    const destinoVeic = Number(b.veiculo_id) || p.veiculo_id; const destinoPos = String(b.posicao || '');
    if (destinoVeic === p.veiculo_id && destinoPos === p.posicao) throw falha('Escolha uma posição diferente da atual.');
    const kmOrigem = inteiro(b.km); const kmDestino = destinoVeic === p.veiculo_id ? kmOrigem : inteiro(b.km_destino);
    const data = iso(b.data);
    const { rows: outro } = await c.query(`SELECT * FROM pneus WHERE veiculo_id = $1 AND posicao = $2 AND status = 'montado' FOR UPDATE`, [destinoVeic, destinoPos]);
    const origem = { veiculo_id: p.veiculo_id, posicao: p.posicao };
    await desmontarCom(c, p, { km: kmOrigem, destino: 'estoque', data, observacao: 'rodízio', usuario });
    if (outro[0]) await desmontarCom(c, outro[0], { km: kmDestino, destino: 'estoque', data, observacao: 'rodízio', usuario });
    const r = await montarCom(c, await pneuPara(c, p.id), { veiculo_id: destinoVeic, posicao: destinoPos, km: kmDestino, data, usuario });
    if (outro[0]) await montarCom(c, await pneuPara(c, outro[0].id), { ...origem, km: kmOrigem, data, usuario });
    return { ...r, trocou_com: outro[0]?.numero_fogo || null };
  });
}
// Volta da recapagem: mais uma vida, o custo soma no pneu e pode virar conta a pagar.
async function retornoRecapagem(id, b, usuario) {
  const valor = contasPagar.valor(b.valor);
  if (!(valor > 0)) throw falha('Informe o valor da recapagem.');
  return comTransacao(async (c) => {
    const p = await pneuPara(c, id);
    if (p.status !== 'recapagem') throw falha(`O pneu ${p.numero_fogo} não está na recapagem.`);
    const s = decimal(b.sulco_mm); const data = iso(b.data) || hojeBr();
    await c.query(`UPDATE pneus SET status = 'estoque', vida = vida + 1, custo_recapagens = custo_recapagens + $2, sulco_mm = COALESCE($3, sulco_mm), sulco_em = CASE WHEN $3 IS NULL THEN sulco_em ELSE $4::date END WHERE id = $1`,
      [p.id, valor, s, data]);
    await movimento(c, { pneu_id: p.id, data, tipo: 'retorno', valor, fornecedor: texto(b.fornecedor, 150), sulco_mm: s, observacao: `recapagem — ${p.vida + 1}ª vida`, usuario });
    let conta = null;
    if (iso(b.vencimento)) {
      const [cp] = await contasPagar.criar({ descricao: `Recapagem do pneu ${p.numero_fogo}`, categoria: 'pneus', fornecedor_nome: texto(b.fornecedor, 150), documento: texto(b.documento, 60),
        competencia: data, vencimento: b.vencimento, valor, parcelas: 1 }, usuario, { cliente: c });
      conta = cp.id;
    }
    return { vida: p.vida + 1, conta };
  });
}
async function sucata(id, b, usuario) {
  const motivo = texto(b.observacao, 300);
  if (!motivo) throw falha('Diga o motivo da sucata.');
  return comTransacao(async (c) => {
    const p = await pneuPara(c, id);
    if (p.status === 'montado') return desmontarCom(c, p, { km: inteiro(b.km), destino: 'sucata', data: iso(b.data), observacao: motivo, usuario });
    if (p.status === 'sucata') throw falha('Este pneu já está na sucata.');
    await c.query(`UPDATE pneus SET status = 'sucata' WHERE id = $1`, [p.id]);
    await movimento(c, { pneu_id: p.id, data: iso(b.data), tipo: 'sucata', observacao: motivo, usuario });
    return { ok: true };
  });
}
async function enviarRecapagem(id, b, usuario) {
  return comTransacao(async (c) => {
    const p = await pneuPara(c, id);
    if (p.status === 'montado') return desmontarCom(c, p, { km: inteiro(b.km), destino: 'recapagem', sulco: b.sulco_mm, data: iso(b.data), observacao: texto(b.fornecedor, 150), usuario });
    if (p.status !== 'estoque') throw falha(`O pneu ${p.numero_fogo} está ${STATUS[p.status].toLowerCase()}.`);
    await c.query(`UPDATE pneus SET status = 'recapagem' WHERE id = $1`, [p.id]);
    await movimento(c, { pneu_id: p.id, data: iso(b.data), tipo: 'recapagem', fornecedor: texto(b.fornecedor, 150), usuario });
    return { ok: true };
  });
}
async function medir(id, b, usuario) {
  const s = decimal(b.sulco_mm);
  if (s == null || s < 0 || s > 30) throw falha('Informe o sulco em mm (ex.: 8,5).');
  const data = iso(b.data) || hojeBr();
  return comTransacao(async (c) => {
    const p = await pneuPara(c, id);
    await c.query('UPDATE pneus SET sulco_mm = $2, sulco_em = $3 WHERE id = $1', [p.id, s, data]);
    await movimento(c, { pneu_id: p.id, data, tipo: 'medicao', veiculo_id: p.veiculo_id, posicao: p.posicao, sulco_mm: s, usuario });
    return { sulco_mm: s };
  });
}

// ---------- Consultas ----------
// km total (acumulado + o que rodou na montagem atual), custo total (compra + recapagens) e custo por km.
function resumir(p, kmVeiculo) {
  const atual = p.status === 'montado' && p.km_montagem != null && kmVeiculo != null ? Math.max(0, kmVeiculo - p.km_montagem) : 0;
  const km = Number(p.km_acumulado || 0) + atual;
  const custo = Number(p.valor_compra || 0) + Number(p.custo_recapagens || 0);
  const sulco = p.sulco_mm != null ? Number(p.sulco_mm) : null;
  return {
    ...p, valor_compra: p.valor_compra != null ? Number(p.valor_compra) : null, custo_recapagens: Number(p.custo_recapagens || 0), sulco_mm: sulco,
    km_total: km, km_montagem_atual: atual, custo_total: custo, custo_km: km > 0 && custo > 0 ? Math.round((custo / km) * 10000) / 10000 : null,
    status_texto: STATUS[p.status], posicao_texto: nomePosicao(p.posicao),
    alerta: sulco != null && p.status !== 'sucata' ? (sulco < SULCO_MINIMO ? 'ilegal' : sulco <= SULCO_ALERTA ? 'baixo' : null) : null,
  };
}

async function listar({ status, veiculo_id, busca } = {}) {
  const val = []; const cond = [];
  if (STATUS[status]) { val.push(status); cond.push(`p.status = $${val.length}`); } else if (status !== 'todos') cond.push(`p.status <> 'sucata'`);
  if (Number(veiculo_id)) { val.push(Number(veiculo_id)); cond.push(`p.veiculo_id = $${val.length}`); }
  if (String(busca || '').trim()) { val.push(`%${String(busca).trim()}%`); cond.push(`(p.numero_fogo ILIKE $${val.length} OR p.marca ILIKE $${val.length} OR p.medida ILIKE $${val.length})`); }
  const { rows } = await pool.query(
    `SELECT p.*, v.placa, v.km_atual AS km_veiculo,
            (SELECT MAX(data) FROM pneu_movimentos m WHERE m.pneu_id = p.id AND m.tipo IN ('recapagem', 'desmontagem')) AS desde
       FROM pneus p LEFT JOIN veiculos v ON v.id = p.veiculo_id ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY p.status = 'montado' DESC, v.placa NULLS LAST, p.posicao, p.numero_fogo`, val);
  const pneus = rows.map((p) => resumir(p, p.km_veiculo));
  const { rows: [c] } = await pool.query(`SELECT ${Object.keys(STATUS).map((s) => `COUNT(*) FILTER (WHERE status = '${s}')::int AS ${s}`).join(', ')} FROM pneus`);
  return { pneus, contagens: c, status: STATUS, sulco_alerta: SULCO_ALERTA, sulco_minimo: SULCO_MINIMO };
}

// Mapa do veículo: cada posição com o pneu montado nela.
async function mapa(veiculoId) {
  const { rows: [v] } = await pool.query('SELECT id, placa, tipo, eixos, km_atual, descricao FROM veiculos WHERE id = $1', [veiculoId]);
  if (!v) throw falha('Veículo não encontrado.', 404);
  const { rows } = await pool.query(`SELECT * FROM pneus WHERE veiculo_id = $1 AND status = 'montado'`, [v.id]);
  const porPos = Object.fromEntries(rows.map((p) => [p.posicao, resumir(p, v.km_atual)]));
  const pos = posicoes(v);
  return { veiculo: { ...v, eixos: v.eixos || 3 }, eixos: pos.eixos.map((e) => ({ ...e, lados: e.lados.map((l) => ({ posicao: l, nome: nomePosicao(l), pneu: porPos[l] || null })) })),
    estepe: pos.estepe.map((l) => ({ posicao: l, nome: nomePosicao(l), pneu: porPos[l] || null })) };
}

async function historico(id) {
  const { rows: [p] } = await pool.query('SELECT p.*, v.placa, v.km_atual AS km_veiculo FROM pneus p LEFT JOIN veiculos v ON v.id = p.veiculo_id WHERE p.id = $1', [id]);
  if (!p) throw falha('Pneu não encontrado.', 404);
  const { rows } = await pool.query(
    `SELECT m.*, m.data::text, v.placa FROM pneu_movimentos m LEFT JOIN veiculos v ON v.id = m.veiculo_id WHERE m.pneu_id = $1 ORDER BY m.data DESC, m.id DESC`, [id]);
  return { pneu: resumir(p, p.km_veiculo), movimentos: rows.map((m) => ({ ...m, posicao_texto: nomePosicao(m.posicao) })) };
}

async function definirEixos(veiculoId, eixos) {
  const n = parseInt(eixos, 10);
  if (!(n >= 1 && n <= 9)) throw falha('Eixos: de 1 a 9.');
  const { rows: [v] } = await pool.query('SELECT id, tipo FROM veiculos WHERE id = $1', [veiculoId]);
  if (!v) throw falha('Veículo não encontrado.', 404);
  const validas = posicoes({ ...v, eixos: n }).todas;
  const { rows } = await pool.query(`SELECT numero_fogo, posicao FROM pneus WHERE veiculo_id = $1 AND status = 'montado' AND NOT (posicao = ANY($2::text[]))`, [veiculoId, validas]);
  if (rows.length) throw falha(`Desmonte antes os pneus das posições que deixam de existir: ${rows.map((r) => `${r.numero_fogo} (${nomePosicao(r.posicao)})`).join(', ')}.`, 409);
  await pool.query('UPDATE veiculos SET eixos = $2 WHERE id = $1', [veiculoId, n]);
}

async function pendencias() {
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'montado' AND sulco_mm IS NOT NULL AND sulco_mm <= $1)::int AS sulco_baixo,
            COUNT(*) FILTER (WHERE status = 'recapagem' AND COALESCE((SELECT MAX(data) FROM pneu_movimentos m WHERE m.pneu_id = pneus.id AND m.tipo IN ('recapagem', 'desmontagem')), CURRENT_DATE) < CURRENT_DATE - 30)::int AS recapagem_parada
       FROM pneus`, [SULCO_ALERTA]);
  return r;
}

module.exports = { STATUS, SULCO_ALERTA, SULCO_MINIMO, posicoes, nomePosicao, resumir, cadastrar, alterar, montar, desmontar, rodizio, enviarRecapagem, retornoRecapagem, sucata, medir, listar, mapa, historico, definirEixos, pendencias };
