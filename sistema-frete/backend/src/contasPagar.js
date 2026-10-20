// Contas a pagar: lançamento (com parcelas), baixa total ou parcial,
// estorno e cancelamento. O acerto de viagem também lança aqui.
const crypto = require('crypto');
const Doc = require('./utils/documento');
const pool = require('./db');

const CATEGORIAS = {
  combustivel: 'Combustível', pedagio: 'Pedágio', manutencao: 'Manutenção', pneus: 'Pneus', frete_terceiro: 'Frete de terceiro',
  adiantamento: 'Adiantamento de viagem', salarios: 'Salários e encargos', impostos: 'Impostos', seguro: 'Seguro', aluguel: 'Aluguel',
  administrativo: 'Administrativo', comissao: 'Comissão de vendedores', outros: 'Outros',
};
const FORMAS = ['pix', 'boleto', 'transferencia', 'dinheiro', 'cartao', 'cheque', 'outro'];
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const valor = (v) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).includes(',') ? String(v).replace(/\./g, '').replace(',', '.') : v);
  return Number.isFinite(n) ? centavos(n) : null;
};
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
// Mesmo dia nos meses seguintes (31/jan → 28/fev).
function somarMeses(dataIso, meses) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

// { descricao, categoria, fornecedor_nome, fornecedor_doc, documento, competencia, vencimento, valor, parcelas, dividir, observacao }
// parcelas > 1: mensais a partir do vencimento; dividir = o valor é o total (senão, cada parcela tem o valor).
// competencia: dia da despesa para a contabilidade (vazio = hoje). Compra parcelada: todas as parcelas na
// mesma competência; conta que se repete (sem dividir): cada parcela no seu mês.
function lerConta(b = {}) {
  const c = {
    descricao: texto(b.descricao, 200), categoria: CATEGORIAS[b.categoria] ? b.categoria : 'outros', fornecedor_nome: texto(b.fornecedor_nome, 200),
    fornecedor_doc: Doc.limpar(b.fornecedor_doc), documento: texto(b.documento, 60),
    competencia: iso(b.competencia), vencimento: iso(b.vencimento), valor: valor(b.valor), observacao: texto(b.observacao, 2000), unidade_id: Number(b.unidade_id) || null, centro_custo_id: Number(b.centro_custo_id) || null,
    parcelas: Math.min(Math.max(parseInt(b.parcelas, 10) || 1, 1), 60), dividir: b.dividir !== false && b.dividir !== 'false',
  };
  if (!c.descricao) throw falha('Informe a descrição da conta.');
  if (!c.vencimento) throw falha('Informe o vencimento.');
  if (!(c.valor > 0)) throw falha('Informe o valor.');
  if (c.fornecedor_doc && ![11, 14].includes(c.fornecedor_doc.length)) throw falha('CNPJ/CPF do fornecedor inválido.');
  return c;
}

// Divide em parcelas sem perder centavos (a diferença vai na primeira).
function parcelar(c) {
  if (c.parcelas === 1) return [{ vencimento: c.vencimento, valor: c.valor, parcela: null, competencia: c.competencia }];
  const cada = c.dividir ? Math.floor((c.valor / c.parcelas) * 100) / 100 : c.valor;
  const resto = c.dividir ? centavos(c.valor - cada * c.parcelas) : 0;
  const competencia = (i) => (c.dividir || !c.competencia ? c.competencia : somarMeses(c.competencia, i));
  return Array.from({ length: c.parcelas }, (_, i) => ({ vencimento: somarMeses(c.vencimento, i), valor: centavos(cada + (i === 0 ? resto : 0)), parcela: `${i + 1}/${c.parcelas}`, competencia: competencia(i) }));
}

// Centro de custo da conta: o escolhido; sem ele, o do veículo (abastecimento, manutenção,
// acerto com placa) ou o da filial.
async function centroDaConta(c, b, cliente = pool) {
  if (c.centro_custo_id) {
    const { rows } = await cliente.query('SELECT id FROM centros_custo WHERE id = $1 AND ativo', [c.centro_custo_id]);
    if (!rows[0]) throw falha('Centro de custo não encontrado ou inativo.');
    return c.centro_custo_id;
  }
  const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { rows } = await cliente.query(
    `SELECT id FROM centros_custo WHERE ativo AND (
       ($1::int IS NOT NULL AND veiculo_id = $1) OR ($2 <> '' AND veiculo_id = (SELECT id FROM veiculos WHERE upper(placa) = $2 LIMIT 1)) OR ($3::int IS NOT NULL AND unidade_id = $3))
     ORDER BY (veiculo_id IS NOT NULL) DESC LIMIT 1`, [Number(b.veiculo_id) || null, placa, c.unidade_id]);
  return rows[0]?.id || null;
}

async function criar(b, usuarioNome, { cliente = pool, acertoId = null } = {}) {
  const c = lerConta(b);
  c.centro_custo_id = await centroDaConta(c, b, cliente);
  const grupo = c.parcelas > 1 ? crypto.randomBytes(6).toString('hex') : null;
  const criadas = [];
  for (const p of parcelar(c)) {
    const { rows } = await cliente.query(
      `INSERT INTO contas_pagar (descricao, categoria, fornecedor_nome, fornecedor_doc, documento, vencimento, valor, parcela, grupo, acerto_id, unidade_id, observacao, criado_por_nome, centro_custo_id, competencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [c.descricao, c.categoria, c.fornecedor_nome, c.fornecedor_doc, c.documento, p.vencimento, p.valor, p.parcela, grupo, acertoId, c.unidade_id, c.observacao, usuarioNome, c.centro_custo_id, p.competencia]);
    criadas.push(rows[0]);
  }
  return criadas;
}

async function alterar(id, b) {
  const c = lerConta({ ...b, parcelas: 1 });
  if (c.centro_custo_id) c.centro_custo_id = await centroDaConta(c, {});
  // Centro de custo só muda quando vem no pedido (senão a edição apagaria o do veículo/filial).
  const mudaCentro = Object.prototype.hasOwnProperty.call(b, 'centro_custo_id');
  const { rows } = await pool.query(
    `UPDATE contas_pagar SET descricao = $2, categoria = $3, fornecedor_nome = $4, fornecedor_doc = $5, documento = $6, vencimento = $7, valor = $8, observacao = $9, unidade_id = $10,
            centro_custo_id = CASE WHEN $12 THEN $11 ELSE centro_custo_id END, competencia = COALESCE($13::date, competencia),
            status = CASE WHEN valor_pago >= $8 - 0.001 THEN 'paga' ELSE status END, pago_em = CASE WHEN valor_pago >= $8 - 0.001 THEN COALESCE(pago_em, CURRENT_DATE) ELSE pago_em END
      WHERE id = $1 AND status = 'aberta' AND valor_pago <= $8 RETURNING *`,
    [id, c.descricao, c.categoria, c.fornecedor_nome, c.fornecedor_doc, c.documento, c.vencimento, c.valor, c.observacao, c.unidade_id, c.centro_custo_id, mudaCentro, c.competencia]);
  if (!rows[0]) throw falha('Só dá para alterar conta em aberto (e o valor não pode ficar menor que o já pago).', 409);
  return rows[0];
}

// Baixa: { data, valor (vazio = o que falta), forma, observacao }.
async function pagar(id, b, usuarioNome, cliente = pool) {
  const { rows } = await cliente.query('SELECT * FROM contas_pagar WHERE id = $1 FOR UPDATE', [id]);
  const c = rows[0];
  if (!c) throw falha('Conta não encontrada.', 404);
  if (c.status !== 'aberta') throw falha(`Esta conta está ${c.status}.`, 409);
  const falta = centavos(Number(c.valor) - Number(c.valor_pago));
  const v = valor(b.valor) ?? falta;
  if (!(v > 0)) throw falha('Informe o valor pago.');
  if (v > falta + 0.001) throw falha(`O valor passa do que falta pagar (${falta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`);
  const data = iso(b.data) || hojeBr();
  const forma = FORMAS.includes(b.forma) ? b.forma : 'pix';
  const banco = await require('./bancos/padrao').contaDoLancamento(b.conta_bancaria_id, forma, cliente);
  const { rows: [pg] } = await cliente.query('INSERT INTO contas_pagar_pagamentos (conta_id, data, valor, forma, observacao, usuario_nome, conta_bancaria_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [id, data, v, forma, texto(b.observacao, 255), usuarioNome, banco]);
  const pago = centavos(Number(c.valor_pago) + v);
  const quitada = pago >= Number(c.valor) - 0.001;
  const { rows: depois } = await cliente.query(
    `UPDATE contas_pagar SET valor_pago = $2, status = $3, pago_em = $4 WHERE id = $1 RETURNING *`, [id, pago, quitada ? 'paga' : 'aberta', quitada ? data : null]);
  return { ...depois[0], pagamento_id: pg.id };
}

async function estornar(contaId, pagamentoId) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('DELETE FROM contas_pagar_pagamentos WHERE id = $1 AND conta_id = $2 RETURNING valor', [pagamentoId, contaId]);
    if (!rows[0]) throw falha('Pagamento não encontrado.', 404);
    await cliente.query(`UPDATE extrato_linhas SET conciliado_tipo = NULL, conciliado_id = NULL, conciliado_acao = NULL, conciliado_em = NULL, conciliado_por = NULL
      WHERE conciliado_tipo = 'pagamento' AND conciliado_id = $1`, [pagamentoId]);
    await cliente.query(
      `UPDATE contas_pagar SET valor_pago = GREATEST(valor_pago - $2, 0), status = CASE WHEN status = 'cancelada' THEN status ELSE 'aberta' END, pago_em = NULL WHERE id = $1`,
      [contaId, rows[0].valor]);
    await cliente.query('COMMIT');
    return Number(rows[0].valor);
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

module.exports = { CATEGORIAS, FORMAS, lerConta, parcelar, somarMeses, criar, alterar, pagar, estornar, hojeBr, centavos, valor };
