// Caixa e bancos: contas, saldo, movimentação, extrato OFX, conciliação e
// fluxo de caixa.
//  • O saldo de cada conta = saldo inicial + recebimentos de faturas − pagamentos
//    de contas + lançamentos avulsos (tarifa, rendimento, transferência...).
//  • O extrato do banco (OFX) entra linha a linha; cada linha é conciliada com
//    um recebimento/pagamento já lançado, ou vira a baixa de uma fatura/conta,
//    ou um lançamento avulso — e "desfazer" reverte o que a conciliação criou.
const pool = require('../db');
const { lerOfx } = require('./ofx');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somarDias = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dias = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const lerValor = (v) => {
  if (typeof v === 'number') return centavos(v);
  const t = String(v ?? '').trim(); if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? centavos(n) : null;
};
const { digitos: soDigitos } = require('../utils/documento');
// Texto para comparar nomes: maiúsculo, sem acento nem pontuação.
const normal = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const GENERICAS = new Set(['LTDA', 'EIRELI', 'EPP', 'COMERCIO', 'INDUSTRIA', 'SERVICOS', 'TRANSPORTES', 'TRANSPORTE', 'LOGISTICA', 'BRASIL', 'DISTRIBUIDORA', 'COMERCIAL', 'GRUPO', 'CIA', 'DO', 'DA', 'DE', 'DOS', 'DAS', 'E']);
// O histórico do banco cita o cliente/fornecedor? (nome ou raiz do CNPJ)
function citaParticipante(descricao, nome, doc) {
  const d = normal(descricao);
  const raiz = soDigitos(doc).slice(0, 8);
  if (raiz.length === 8 && soDigitos(descricao).includes(raiz)) return true;
  const palavras = normal(nome).split(' ').filter((p) => p.length >= 4 && !GENERICAS.has(p));
  return palavras.some((p) => d.split(' ').includes(p));
}

const CATEGORIAS = {
  tarifa: 'Tarifa bancária', juros_pagos: 'Juros e multas pagos', rendimento: 'Rendimento / juros recebidos', transferencia: 'Transferência entre contas',
  aporte: 'Aporte dos sócios', retirada: 'Retirada dos sócios', outros: 'Outros',
};
const TIPOS = { banco: 'Conta bancária', caixa: 'Caixa (dinheiro)' };

// ---------- Contas ----------
// Somas da conta até a data (inclusive), a partir da data do saldo inicial.
async function saldoEm(conta, ate, cliente = pool) {
  const { rows: [s] } = await cliente.query(
    `SELECT (SELECT COALESCE(SUM(valor), 0) FROM faturas_transporte_pagamentos WHERE conta_bancaria_id = $1 AND data >= $2::date AND data <= $3::date)
          - (SELECT COALESCE(SUM(valor), 0) FROM contas_pagar_pagamentos WHERE conta_bancaria_id = $1 AND data >= $2::date AND data <= $3::date)
          + (SELECT COALESCE(SUM(valor), 0) FROM movimentos_bancarios WHERE conta_id = $1 AND data >= $2::date AND data <= $3::date) AS mov`,
    [conta.id, conta.saldo_inicial_data, ate]);
  return ate < conta.saldo_inicial_data ? 0 : centavos(Number(conta.saldo_inicial) + Number(s.mov));
}

const COLS = `id, nome, tipo, banco_codigo, agencia, numero, saldo_inicial::float, saldo_inicial_data::text, padrao, conta_contabil, ativo`;

async function listarContas({ todas = false } = {}) {
  const { rows } = await pool.query(`SELECT ${COLS} FROM contas_bancarias ${todas ? '' : 'WHERE ativo'} ORDER BY ativo DESC, padrao DESC, tipo, nome`);
  const h = hoje();
  for (const c of rows) {
    c.saldo = await saldoEm(c, h);
    const { rows: [imp] } = await pool.query(
      `SELECT id, arquivo, saldo_banco::float, saldo_banco_data::text, criado_em, ate::text FROM extrato_importacoes WHERE conta_id = $1 ORDER BY COALESCE(saldo_banco_data, ate) DESC NULLS LAST, id DESC LIMIT 1`, [c.id]);
    c.ultimo_extrato = imp || null;
    if (imp?.saldo_banco != null && imp.saldo_banco_data) {
      c.saldo_sistema_na_data = await saldoEm(c, imp.saldo_banco_data);
      c.diferenca = centavos(imp.saldo_banco - c.saldo_sistema_na_data);
    }
    const { rows: [p] } = await pool.query('SELECT COUNT(*)::int AS n, COALESCE(SUM(valor), 0)::float AS v FROM extrato_linhas WHERE conta_id = $1 AND conciliado_tipo IS NULL', [c.id]);
    c.pendentes = p.n; c.pendentes_valor = p.v;
  }
  const { rows: [sem] } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM faturas_transporte_pagamentos WHERE conta_bancaria_id IS NULL)::int + (SELECT COUNT(*) FROM contas_pagar_pagamentos WHERE conta_bancaria_id IS NULL)::int AS n`);
  return { contas: rows, total: centavos(rows.filter((c) => c.ativo).reduce((s, c) => s + c.saldo, 0)), sem_conta: sem.n, categorias: CATEGORIAS, tipos: TIPOS };
}

function lerConta(b = {}) {
  const nome = texto(b.nome, 80);
  if (!nome) throw falha('Dê um nome à conta (ex.: Itaú 12345-6, Caixa da matriz).');
  const tipo = b.tipo === 'caixa' ? 'caixa' : 'banco';
  const saldo = lerValor(b.saldo_inicial) ?? 0;
  return {
    nome, tipo, banco_codigo: tipo === 'banco' ? texto(soDigitos(b.banco_codigo), 5) : null, agencia: tipo === 'banco' ? texto(b.agencia, 12) : null,
    numero: tipo === 'banco' ? texto(b.numero, 25) : null, saldo_inicial: saldo, saldo_inicial_data: iso(b.saldo_inicial_data) || hoje(),
    padrao: !!b.padrao, conta_contabil: texto(b.conta_contabil, 40),
  };
}

// Primeira conta de cada tipo: os recebimentos/pagamentos antigos sem conta
// (a partir da data do saldo inicial) passam a ser dela — dinheiro no caixa,
// o resto no banco.
async function adotarSemConta(cliente, c) {
  const cond = c.tipo === 'caixa' ? "forma = 'dinheiro'" : "forma <> 'dinheiro'";
  const a = await cliente.query(`UPDATE faturas_transporte_pagamentos SET conta_bancaria_id = $1 WHERE conta_bancaria_id IS NULL AND ${cond} AND data >= $2::date`, [c.id, c.saldo_inicial_data]);
  const b = await cliente.query(`UPDATE contas_pagar_pagamentos SET conta_bancaria_id = $1 WHERE conta_bancaria_id IS NULL AND ${cond} AND data >= $2::date`, [c.id, c.saldo_inicial_data]);
  return a.rowCount + b.rowCount;
}

async function transacao(fn) {
  const cliente = await pool.connect();
  try { await cliente.query('BEGIN'); const r = await fn(cliente); await cliente.query('COMMIT'); return r; } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

async function criarConta(b) {
  const c = lerConta(b);
  return transacao(async (cl) => {
    const { rows: [ja] } = await cl.query('SELECT COUNT(*) FILTER (WHERE tipo = $1)::int AS mesmo, COUNT(*) FILTER (WHERE padrao AND ativo)::int AS padrao FROM contas_bancarias WHERE ativo', [c.tipo]);
    if (!ja.padrao && c.tipo === 'banco') c.padrao = true;   // a primeira conta bancária vira a padrão
    if (c.padrao) await cl.query('UPDATE contas_bancarias SET padrao = FALSE WHERE padrao');
    const { rows: [nova] } = await cl.query(
      `INSERT INTO contas_bancarias (nome, tipo, banco_codigo, agencia, numero, saldo_inicial, saldo_inicial_data, padrao, conta_contabil) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLS}`,
      [c.nome, c.tipo, c.banco_codigo, c.agencia, c.numero, c.saldo_inicial, c.saldo_inicial_data, c.padrao, c.conta_contabil]);
    nova.adotados = ja.mesmo ? 0 : await adotarSemConta(cl, nova);
    return nova;
  });
}

async function alterarConta(id, b) {
  const c = lerConta(b);
  return transacao(async (cl) => {
    if (c.padrao) await cl.query('UPDATE contas_bancarias SET padrao = FALSE WHERE padrao AND id <> $1', [id]);
    const { rows: [r] } = await cl.query(
      `UPDATE contas_bancarias SET nome = $2, banco_codigo = $3, agencia = $4, numero = $5, saldo_inicial = $6, saldo_inicial_data = $7, padrao = $8, conta_contabil = $9,
         ativo = COALESCE($10, ativo) WHERE id = $1 RETURNING ${COLS}`,
      [id, c.nome, c.banco_codigo, c.agencia, c.numero, c.saldo_inicial, c.saldo_inicial_data, c.padrao, c.conta_contabil, b.ativo == null ? null : !!b.ativo]);
    if (!r) throw falha('Conta não encontrada.', 404);
    return r;
  });
}

async function carregarConta(id, cliente = pool) {
  const { rows: [c] } = await cliente.query(`SELECT ${COLS} FROM contas_bancarias WHERE id = $1`, [Number(id)]);
  if (!c) throw falha('Conta bancária não encontrada.', 404);
  return c;
}

// ---------- Movimentação (com saldo dia a dia) ----------
async function movimentos(contaId, { de, ate } = {}) {
  const c = await carregarConta(contaId);
  const h = hoje();
  const fim = iso(ate) || h;
  const ini = iso(de) || somarDias(fim, -30);
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT 'recebimento' AS origem, p.id, p.data::text AS data, p.valor::float AS valor, p.forma,
              'Recebimento da fatura ' || f.numero || ' — ' || COALESCE(f.tomador_nome, '') AS descricao, 'FAT ' || f.numero AS documento, f.id AS ref_id
         FROM faturas_transporte_pagamentos p JOIN faturas_transporte f ON f.id = p.fatura_id WHERE p.conta_bancaria_id = $1
       UNION ALL
       SELECT 'pagamento', p.id, p.data::text, -p.valor::float, p.forma, 'Pagamento: ' || c.descricao || COALESCE(' — ' || c.fornecedor_nome, ''), COALESCE(c.documento, 'CP ' || c.id), c.id
         FROM contas_pagar_pagamentos p JOIN contas_pagar c ON c.id = p.conta_id WHERE p.conta_bancaria_id = $1
       UNION ALL
       SELECT 'movimento', m.id, m.data::text, m.valor::float, m.categoria, COALESCE(m.descricao, ''), NULL, m.transferencia_id FROM movimentos_bancarios m WHERE m.conta_id = $1
     ) x WHERE data >= GREATEST($2::date, $4::date)::text AND data <= $3 ORDER BY data, valor < 0, origem, id`, [c.id, ini, fim, c.saldo_inicial_data]);
  const { rows: conc } = await pool.query(`SELECT conciliado_tipo, conciliado_id FROM extrato_linhas WHERE conta_id = $1 AND conciliado_id IS NOT NULL`, [c.id]);
  const ligado = new Set(conc.map((x) => `${x.conciliado_tipo}:${x.conciliado_id}`));
  let saldo = ini <= c.saldo_inicial_data ? Number(c.saldo_inicial) : await saldoEm(c, somarDias(ini, -1));
  const anterior = centavos(saldo);
  const linhas = rows.map((r) => { saldo = centavos(saldo + r.valor); return { ...r, saldo, conciliado: ligado.has(`${r.origem}:${r.id}`), categoria_nome: r.origem === 'movimento' ? CATEGORIAS[r.forma] || r.forma : null }; });
  return {
    conta: c, de: ini, ate: fim, saldo_anterior: anterior, saldo_final: centavos(saldo), linhas,
    entradas: centavos(linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0)), saidas: centavos(linhas.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0)),
  };
}

// Lançamento avulso ou transferência: { conta_id, data, valor, sentido: entrada|saida, categoria, descricao, destino_id }
async function lancar(b, usuarioNome, cliente = null) {
  const exec = async (cl) => {
    const conta = await carregarConta(b.conta_id, cl);
    if (!conta.ativo) throw falha('Conta inativa.');
    const v = lerValor(b.valor);
    if (!(v > 0)) throw falha('Informe o valor.');
    const data = iso(b.data) || hoje();
    if (data < conta.saldo_inicial_data) throw falha(`A conta ${conta.nome} começa em ${conta.saldo_inicial_data.split('-').reverse().join('/')} (data do saldo inicial): lance a partir dela.`);
    const descricao = texto(b.descricao, 200);
    if (b.categoria === 'transferencia') {
      const destino = await carregarConta(b.destino_id, cl);
      if (destino.id === conta.id) throw falha('Escolha uma conta de destino diferente.');
      if (!destino.ativo) throw falha('Conta de destino inativa.');
      const { rows: [s] } = await cl.query(`INSERT INTO movimentos_bancarios (conta_id, data, valor, categoria, descricao, usuario_nome) VALUES ($1,$2,$3,'transferencia',$4,$5) RETURNING id`,
        [conta.id, data, -v, descricao || `Transferência para ${destino.nome}`, usuarioNome]);
      const { rows: [e] } = await cl.query(`INSERT INTO movimentos_bancarios (conta_id, data, valor, categoria, descricao, usuario_nome, transferencia_id) VALUES ($1,$2,$3,'transferencia',$4,$5,$6) RETURNING id`,
        [destino.id, data, v, descricao || `Transferência de ${conta.nome}`, usuarioNome, s.id]);
      await cl.query('UPDATE movimentos_bancarios SET transferencia_id = $1 WHERE id = $1', [s.id]);
      return { id: s.id, par_id: e.id, conta, destino, valor: v, data, categoria: 'transferencia' };
    }
    const categoria = CATEGORIAS[b.categoria] ? b.categoria : 'outros';
    const sinal = b.sentido === 'entrada' || ['rendimento', 'aporte'].includes(categoria) ? 1 : -1;
    const { rows: [m] } = await cl.query(`INSERT INTO movimentos_bancarios (conta_id, data, valor, categoria, descricao, usuario_nome) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [conta.id, data, sinal * v, categoria, descricao || CATEGORIAS[categoria], usuarioNome]);
    return { id: m.id, conta, valor: sinal * v, data, categoria };
  };
  return cliente ? exec(cliente) : transacao(exec);
}

async function excluirMovimento(id, cliente = null) {
  const exec = async (cl) => {
    const { rows: [m] } = await cl.query('SELECT * FROM movimentos_bancarios WHERE id = $1', [id]);
    if (!m) throw falha('Lançamento não encontrado.', 404);
    const ids = m.transferencia_id ? (await cl.query('SELECT id FROM movimentos_bancarios WHERE transferencia_id = $1', [m.transferencia_id])).rows.map((r) => r.id) : [m.id];
    await cl.query(`UPDATE extrato_linhas SET conciliado_tipo = NULL, conciliado_id = NULL, conciliado_acao = NULL, conciliado_em = NULL, conciliado_por = NULL
      WHERE conciliado_tipo = 'movimento' AND conciliado_id = ANY($1::int[])`, [ids]);
    await cl.query('DELETE FROM movimentos_bancarios WHERE id = ANY($1::int[])', [ids]);
    return { ...m, valor: Number(m.valor), apagados: ids.length };
  };
  return cliente ? exec(cliente) : transacao(exec);
}

// ---------- Extrato (OFX) ----------
async function importarOfx(contaId, conteudo, { arquivo, usuarioNome }) {
  const conta = await carregarConta(contaId);
  if (conta.tipo !== 'banco') throw falha('Extrato OFX é de conta bancária, não do caixa.');
  const ex = lerOfx(conteudo);
  if (ex.conta.cartao) throw falha('Este OFX é de cartão de crédito. Importe o extrato da conta corrente.');
  // Conta do arquivo × conta escolhida (compara só os dígitos, sem o DV).
  const doArq = soDigitos(ex.conta.numero); const daConta = soDigitos(conta.numero);
  if (doArq && daConta && !doArq.includes(daConta.slice(0, -1) || daConta) && !daConta.includes(doArq.slice(0, -1) || doArq)) {
    throw falha(`Este extrato é da conta ${ex.conta.numero}${ex.conta.agencia ? ` (agência ${ex.conta.agencia})` : ''}, e não da ${conta.nome}. Escolha a conta certa.`);
  }
  if (!ex.lancamentos.length) throw falha('O extrato não tem lançamentos no período.');
  return transacao(async (cl) => {
    const { rows: [imp] } = await cl.query(
      `INSERT INTO extrato_importacoes (conta_id, arquivo, de, ate, saldo_banco, saldo_banco_data, linhas, usuario_nome) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [conta.id, texto(arquivo, 200), ex.de, ex.ate, ex.saldo, ex.saldo_data || ex.ate, ex.lancamentos.length, usuarioNome]);
    let novas = 0; let antes = 0;
    for (const l of ex.lancamentos) {
      if (l.data < conta.saldo_inicial_data) { antes += 1; continue; }
      const r = await cl.query(`INSERT INTO extrato_linhas (conta_id, importacao_id, fitid, data, valor, tipo, descricao, documento) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (conta_id, fitid) DO NOTHING`,
        [conta.id, imp.id, l.fitid, l.data, l.valor, l.tipo, l.descricao, l.documento]);
      novas += r.rowCount;
    }
    await cl.query('UPDATE extrato_importacoes SET novas = $2 WHERE id = $1', [imp.id, novas]);
    // Completa os dados da conta que vieram no arquivo.
    if (!conta.numero && ex.conta.numero) await cl.query('UPDATE contas_bancarias SET numero = $2, agencia = COALESCE(agencia, $3), banco_codigo = COALESCE(banco_codigo, $4) WHERE id = $1', [conta.id, ex.conta.numero, ex.conta.agencia, ex.conta.banco]);
    return { importacao_id: imp.id, conta, de: ex.de, ate: ex.ate, saldo_banco: ex.saldo, linhas: ex.lancamentos.length, novas, repetidas: ex.lancamentos.length - novas - antes, antes_do_inicio: antes };
  });
}

// Candidatos para as linhas pendentes da conta (em lote).
async function sugestoesPara(linhas, conta) {
  if (!linhas.length) return new Map();
  const datas = linhas.map((l) => l.data).sort();
  const de = somarDias(datas[0], -7); const ate = somarDias(datas[datas.length - 1], 7);
  const [{ rows: recs }, { rows: pags }, { rows: movs }, { rows: faturas }, { rows: contas }] = await Promise.all([
    pool.query(`SELECT p.id, p.data::text AS data, p.valor::float AS valor, p.conta_bancaria_id, f.numero, f.tomador_nome, f.tomador_doc FROM faturas_transporte_pagamentos p
      JOIN faturas_transporte f ON f.id = p.fatura_id WHERE p.data BETWEEN $1 AND $2 AND (p.conta_bancaria_id IS NULL OR p.conta_bancaria_id = $3)
      AND NOT EXISTS (SELECT 1 FROM extrato_linhas e WHERE e.conciliado_tipo = 'recebimento' AND e.conciliado_id = p.id)`, [de, ate, conta.id]),
    pool.query(`SELECT p.id, p.data::text AS data, p.valor::float AS valor, p.conta_bancaria_id, c.descricao, c.fornecedor_nome, c.fornecedor_doc FROM contas_pagar_pagamentos p
      JOIN contas_pagar c ON c.id = p.conta_id WHERE p.data BETWEEN $1 AND $2 AND (p.conta_bancaria_id IS NULL OR p.conta_bancaria_id = $3)
      AND NOT EXISTS (SELECT 1 FROM extrato_linhas e WHERE e.conciliado_tipo = 'pagamento' AND e.conciliado_id = p.id)`, [de, ate, conta.id]),
    pool.query(`SELECT m.id, m.data::text AS data, m.valor::float AS valor, m.categoria, m.descricao FROM movimentos_bancarios m WHERE m.conta_id = $3 AND m.data BETWEEN $1 AND $2
      AND NOT EXISTS (SELECT 1 FROM extrato_linhas e WHERE e.conciliado_tipo = 'movimento' AND e.conciliado_id = m.id)`, [de, ate, conta.id]),
    pool.query(`SELECT id, numero, tomador_nome, tomador_doc, vencimento::text AS vencimento, (valor_bruto - desconto - valor_pago)::float AS saldo FROM faturas_transporte
      WHERE status IN ('aberta', 'parcial')`),
    pool.query(`SELECT id, descricao, fornecedor_nome, fornecedor_doc, documento, parcela, vencimento::text AS vencimento, (valor - valor_pago)::float AS falta FROM contas_pagar WHERE status = 'aberta'`),
  ]);
  const igual = (a, b) => Math.abs(a - b) < 0.005;
  const mapa = new Map();
  for (const l of linhas) {
    const v = Number(l.valor); const a = Math.abs(v); const c = [];
    const perto = (d) => Math.abs(dias(d, l.data));
    if (v > 0) {
      recs.filter((r) => igual(r.valor, a) && perto(r.data) <= 5).forEach((r) => c.push({ acao: 'vincular', tipo: 'recebimento', id: r.id, score: 95 - perto(r.data) * 3 + (r.conta_bancaria_id === conta.id ? 3 : 0),
        rotulo: `Recebimento já lançado: fatura ${r.numero} — ${r.tomador_nome || ''} (${r.data.split('-').reverse().join('/')})` }));
      faturas.forEach((f) => {
        const cita = citaParticipante(l.descricao, f.tomador_nome, f.tomador_doc);
        if (igual(f.saldo, a)) c.push({ acao: 'baixar_fatura', id: f.id, score: 60 + (cita ? 30 : 0) - Math.min(Math.abs(dias(f.vencimento, l.data)), 30) / 3, rotulo: `Baixar a fatura ${f.numero} — ${f.tomador_nome || ''} (saldo ${a.toFixed(2).replace('.', ',')}, vence ${f.vencimento.split('-').reverse().join('/')})` });
        else if (cita && f.saldo > 0) c.push({ acao: 'baixar_fatura', id: f.id, score: 45, rotulo: `Baixa ${a < f.saldo ? 'parcial' : 'com juros'} da fatura ${f.numero} — ${f.tomador_nome || ''} (saldo ${f.saldo.toFixed(2).replace('.', ',')})` });
      });
      if (/RENDIMENTO|REND\b|REMUNERACAO|JUROS/.test(normal(l.descricao))) c.push({ acao: 'lancar', categoria: 'rendimento', score: 55, rotulo: 'Lançar como rendimento / juros recebidos' });
    } else {
      pags.filter((p) => igual(p.valor, a) && perto(p.data) <= 5).forEach((p) => c.push({ acao: 'vincular', tipo: 'pagamento', id: p.id, score: 95 - perto(p.data) * 3 + (p.conta_bancaria_id === conta.id ? 3 : 0),
        rotulo: `Pagamento já lançado: ${p.descricao}${p.fornecedor_nome ? ` — ${p.fornecedor_nome}` : ''} (${p.data.split('-').reverse().join('/')})` }));
      contas.forEach((x) => {
        const cita = citaParticipante(l.descricao, x.fornecedor_nome, x.fornecedor_doc);
        if (igual(x.falta, a)) c.push({ acao: 'pagar_conta', id: x.id, score: 60 + (cita ? 30 : 0) - Math.min(Math.abs(dias(x.vencimento, l.data)), 30) / 3, rotulo: `Pagar a conta: ${x.descricao}${x.fornecedor_nome ? ` — ${x.fornecedor_nome}` : ''}${x.parcela ? ` (${x.parcela})` : ''}, vence ${x.vencimento.split('-').reverse().join('/')}` });
      });
      const n = normal(l.descricao);
      if (/TARIFA|TAR |CESTA|PACOTE|MANUT|ANUIDADE|IOF|TAXA/.test(n)) c.push({ acao: 'lancar', categoria: 'tarifa', score: 70, rotulo: 'Lançar como tarifa bancária' });
      else if (/JUROS|MULTA|ENCARGO/.test(n)) c.push({ acao: 'lancar', categoria: 'juros_pagos', score: 60, rotulo: 'Lançar como juros e multas pagos' });
    }
    movs.filter((m) => igual(m.valor, v) && perto(m.data) <= 3).forEach((m) => c.push({ acao: 'vincular', tipo: 'movimento', id: m.id, score: 92 - perto(m.data) * 3,
      rotulo: `Lançamento já feito: ${CATEGORIAS[m.categoria] || m.categoria}${m.descricao ? ` — ${m.descricao}` : ''}` }));
    mapa.set(l.id, c.sort((x, y) => y.score - x.score).slice(0, 5).map((x) => ({ ...x, score: Math.round(x.score) })));
  }
  return mapa;
}

async function extrato(contaId, { situacao = 'pendentes', de, ate } = {}) {
  const conta = await carregarConta(contaId);
  const filtros = ['conta_id = $1']; const vals = [conta.id];
  if (situacao === 'pendentes') filtros.push('conciliado_tipo IS NULL');
  else if (situacao === 'conciliadas') filtros.push('conciliado_tipo IS NOT NULL');
  if (iso(de)) { vals.push(de); filtros.push(`data >= $${vals.length}`); }
  if (iso(ate)) { vals.push(ate); filtros.push(`data <= $${vals.length}`); }
  const { rows } = await pool.query(`SELECT id, fitid, data::text AS data, valor::float AS valor, tipo, descricao, documento, conciliado_tipo, conciliado_id, conciliado_acao, conciliado_em, conciliado_por
    FROM extrato_linhas WHERE ${filtros.join(' AND ')} ORDER BY data, id LIMIT 1000`, vals);
  const pend = rows.filter((r) => !r.conciliado_tipo);
  const sug = await sugestoesPara(pend, conta);
  // O que cada conciliada virou (para mostrar e desfazer).
  for (const r of rows.filter((x) => x.conciliado_id)) r.vinculo = await descreverVinculo(r.conciliado_tipo, r.conciliado_id);
  const { rows: [t] } = await pool.query('SELECT COUNT(*) FILTER (WHERE conciliado_tipo IS NULL)::int AS pendentes, COUNT(*)::int AS total FROM extrato_linhas WHERE conta_id = $1', [conta.id]);
  return { conta, totais: t, linhas: rows.map((r) => ({ ...r, sugestoes: sug.get(r.id) || [] })), categorias: CATEGORIAS };
}

async function descreverVinculo(tipo, id) {
  if (tipo === 'recebimento') {
    const { rows: [r] } = await pool.query('SELECT f.id AS fatura_id, f.numero, f.tomador_nome FROM faturas_transporte_pagamentos p JOIN faturas_transporte f ON f.id = p.fatura_id WHERE p.id = $1', [id]);
    return r ? `Fatura ${r.numero} — ${r.tomador_nome || ''}` : null;
  }
  if (tipo === 'pagamento') {
    const { rows: [r] } = await pool.query('SELECT c.descricao, c.fornecedor_nome FROM contas_pagar_pagamentos p JOIN contas_pagar c ON c.id = p.conta_id WHERE p.id = $1', [id]);
    return r ? `${r.descricao}${r.fornecedor_nome ? ` — ${r.fornecedor_nome}` : ''}` : null;
  }
  if (tipo === 'movimento') {
    const { rows: [r] } = await pool.query('SELECT categoria, descricao FROM movimentos_bancarios WHERE id = $1', [id]);
    return r ? `${CATEGORIAS[r.categoria] || r.categoria}${r.descricao ? ` — ${r.descricao}` : ''}` : null;
  }
  return null;
}

// Forma de pagamento pelo histórico do banco.
function formaDoHistorico(desc) {
  const n = normal(desc);
  if (/\bPIX\b/.test(n)) return 'pix';
  if (/BOLETO|COBRANCA|LIQUIDACAO|TITULO/.test(n)) return 'boleto';
  if (/CHEQUE|CHQ/.test(n)) return 'cheque';
  return 'deposito';
}

// Concilia uma linha: { acao: vincular|baixar_fatura|pagar_conta|lancar|ignorar, tipo, id, categoria, descricao }
async function conciliar(linhaId, b, usuarioNome) {
  const { rows: [l] } = await pool.query('SELECT id, conta_id, data::text AS data, valor::float AS valor, descricao, conciliado_tipo FROM extrato_linhas WHERE id = $1', [linhaId]);
  if (!l) throw falha('Linha do extrato não encontrada.', 404);
  if (l.conciliado_tipo) throw falha('Esta linha já foi conciliada. Desfaça antes de conciliar de outro jeito.', 409);
  const a = Math.abs(l.valor);
  const marcar = (cl, tipo, id, acao) => cl.query(
    `UPDATE extrato_linhas SET conciliado_tipo = $2, conciliado_id = $3, conciliado_acao = $4, conciliado_em = NOW(), conciliado_por = $5 WHERE id = $1 AND conciliado_tipo IS NULL`,
    [l.id, tipo, id, acao, usuarioNome]).then((r) => { if (!r.rowCount) throw falha('Esta linha acabou de ser conciliada por outra pessoa.', 409); });
  const usado = (e) => { if (e.code === '23505') throw falha('Esse lançamento já está conciliado com outra linha do extrato.', 409); throw e; };
  try {
    if (b.acao === 'ignorar') { await transacao((cl) => marcar(cl, 'ignorado', null, null)); return { acao: 'ignorar' }; }
    if (b.acao === 'vincular') {
      const tipo = { recebimento: 'faturas_transporte_pagamentos', pagamento: 'contas_pagar_pagamentos', movimento: 'movimentos_bancarios' }[b.tipo];
      if (!tipo) throw falha('Tipo de vínculo inválido.');
      return await transacao(async (cl) => {
        const { rows: [x] } = await cl.query(`SELECT id, valor::float AS valor FROM ${tipo} WHERE id = $1 FOR UPDATE`, [Number(b.id)]);
        if (!x) throw falha('Lançamento não encontrado.', 404);
        const esperado = b.tipo === 'pagamento' ? -x.valor : x.valor;
        if (Math.abs(esperado - l.valor) > 0.005) throw falha(`Os valores não batem: extrato ${l.valor.toFixed(2)}, lançamento ${esperado.toFixed(2)}.`);
        if (b.tipo === 'movimento') {
          const { rows: [m] } = await cl.query('SELECT conta_id FROM movimentos_bancarios WHERE id = $1', [x.id]);
          if (m.conta_id !== l.conta_id) throw falha('Esse lançamento é de outra conta.');
        } else await cl.query(`UPDATE ${tipo} SET conta_bancaria_id = $2 WHERE id = $1`, [x.id, l.conta_id]);   // o banco diz em que conta caiu
        await marcar(cl, b.tipo, x.id, 'vinculou');
        return { acao: 'vincular', tipo: b.tipo, id: x.id };
      });
    }
    if (b.acao === 'baixar_fatura') {
      if (!(l.valor > 0)) throw falha('Só crédito no extrato baixa fatura.');
      const fat = require('../faturamento/faturamento');
      // Pela tela dá para informar o número da fatura em vez do id.
      if (!b.id && b.numero) {
        const { rows: [x] } = await pool.query('SELECT id FROM faturas_transporte WHERE numero = $1', [parseInt(b.numero, 10) || 0]);
        if (!x) throw falha(`Fatura ${b.numero} não encontrada.`, 404);
        b.id = x.id;
      }
      const forma = formaDoHistorico(l.descricao);
      const f = await fat.receber(Number(b.id), { data: l.data, valor: a, forma, conta_bancaria_id: l.conta_id, usuarioNome,
        observacao: `Conciliação bancária: ${String(l.descricao || '').slice(0, 200)}` });
      try { await transacao((cl) => marcar(cl, 'recebimento', f.pagamento_id, 'baixou')); } catch (e) {
        // Não marcou a linha: desfaz a baixa (e avisa no log se nem isso der certo).
        await fat.estornar(f.id, f.pagamento_id).catch((e2) => console.error(`[conciliação] não consegui desfazer a baixa ${f.pagamento_id} da fatura ${f.numero}:`, e2.message));
        throw e;
      }
      // Pago por PIX/TED com boleto no banco: pede a baixa do boleto (senão o cliente pode pagar de novo).
      if (f.status === 'paga' && forma !== 'boleto') await require('../boleto/cobranca').pedirBaixa(f.id).catch((e) => console.error('[conciliação] baixa do boleto:', e.message));
      return { acao: 'baixar_fatura', fatura: f.numero, status: f.status, saldo: f.saldo };
    }
    if (b.acao === 'pagar_conta') {
      if (!(l.valor < 0)) throw falha('Só débito no extrato paga conta.');
      const cp = require('../contasPagar');
      return await transacao(async (cl) => {
        const c = await cp.pagar(Number(b.id), { data: l.data, valor: a, forma: formaDoHistorico(l.descricao) === 'deposito' ? 'transferencia' : formaDoHistorico(l.descricao), conta_bancaria_id: l.conta_id,
          observacao: `Conciliação bancária: ${String(l.descricao || '').slice(0, 200)}` }, usuarioNome, cl);
        await marcar(cl, 'pagamento', c.pagamento_id, 'baixou');
        return { acao: 'pagar_conta', conta: c.descricao, status: c.status };
      });
    }
    if (b.acao === 'lancar') {
      return await transacao(async (cl) => {
        const categoria = CATEGORIAS[b.categoria] && b.categoria !== 'transferencia' ? b.categoria : 'outros';
        const m = await lancar({ conta_id: l.conta_id, data: l.data, valor: a, sentido: l.valor > 0 ? 'entrada' : 'saida', categoria, descricao: texto(b.descricao, 200) || texto(l.descricao, 200) }, usuarioNome, cl);
        if (Math.sign(m.valor) !== Math.sign(l.valor)) await cl.query('UPDATE movimentos_bancarios SET valor = $2 WHERE id = $1', [m.id, l.valor]);
        await marcar(cl, 'movimento', m.id, 'lancou');
        return { acao: 'lancar', categoria };
      });
    }
    throw falha('Ação inválida.');
  } catch (e) { return usado(e); }
}

// Desfaz: o que a conciliação criou (baixa, lançamento) é revertido; o vínculo só se solta.
async function desfazer(linhaId) {
  const { rows: [l] } = await pool.query('SELECT * FROM extrato_linhas WHERE id = $1', [linhaId]);
  if (!l) throw falha('Linha do extrato não encontrada.', 404);
  if (!l.conciliado_tipo) throw falha('Esta linha não está conciliada.');
  if (l.conciliado_acao === 'baixou' && l.conciliado_tipo === 'recebimento') {
    const { rows: [p] } = await pool.query('SELECT fatura_id FROM faturas_transporte_pagamentos WHERE id = $1', [l.conciliado_id]);
    if (p) await require('../faturamento/faturamento').estornar(p.fatura_id, l.conciliado_id);
  } else if (l.conciliado_acao === 'baixou' && l.conciliado_tipo === 'pagamento') {
    const { rows: [p] } = await pool.query('SELECT conta_id FROM contas_pagar_pagamentos WHERE id = $1', [l.conciliado_id]);
    if (p) await require('../contasPagar').estornar(p.conta_id, l.conciliado_id);
  } else if (l.conciliado_acao === 'lancou' && l.conciliado_tipo === 'movimento') {
    await excluirMovimento(l.conciliado_id).catch(() => {});
  }
  await pool.query(`UPDATE extrato_linhas SET conciliado_tipo = NULL, conciliado_id = NULL, conciliado_acao = NULL, conciliado_em = NULL, conciliado_por = NULL WHERE id = $1`, [l.id]);
  return { desfeito: l.conciliado_acao || l.conciliado_tipo };
}

// Concilia sozinho só o que é certeza: o recebimento/pagamento/lançamento já
// feito com o mesmo valor, em até 2 dias, e sem outro candidato igual.
async function conciliarAutomatico(contaId, usuarioNome) {
  const conta = await carregarConta(contaId);
  const { rows: linhas } = await pool.query(`SELECT id, data::text AS data, valor::float AS valor, descricao FROM extrato_linhas WHERE conta_id = $1 AND conciliado_tipo IS NULL ORDER BY data, id`, [conta.id]);
  const sug = await sugestoesPara(linhas, conta);
  const usados = new Set(); const feitasIds = new Set(); let feitas = 0;
  for (const l of linhas) {
    const c = (sug.get(l.id) || []).filter((x) => x.acao === 'vincular' && x.score >= 89 && !usados.has(`${x.tipo}:${x.id}`));
    if (!c.length) continue;
    // Linhas gêmeas (mesmo valor e dia) com o mesmo número de lançamentos gêmeos
    // são intercambiáveis: casa uma com cada. Fora isso, só se o melhor for único.
    const gemeas = linhas.filter((o) => !feitasIds.has(o.id) && Math.abs(o.valor - l.valor) < 0.005 && o.data === l.data).length;
    const empatados = c.filter((x) => x.score === c[0].score).length;
    if (empatados > 1 && empatados !== gemeas) continue;
    // Outra linha parecida (mesmo valor, dias diferentes) disputa o lançamento: só com data exata.
    const disputa = linhas.filter((o) => o.id !== l.id && !feitasIds.has(o.id) && o.data !== l.data && Math.abs(o.valor - l.valor) < 0.005 && Math.abs(dias(o.data, l.data)) <= 5).length;
    if (disputa && c[0].score < 95) continue;
    try { await conciliar(l.id, { acao: 'vincular', tipo: c[0].tipo, id: c[0].id }, `${usuarioNome} (automático)`); usados.add(`${c[0].tipo}:${c[0].id}`); feitasIds.add(l.id); feitas += 1; } catch { /* segue */ }
  }
  return { conciliadas: feitas };
}

// ---------- Fluxo de caixa ----------
async function fluxo({ dias: n = 30 } = {}) {
  const total = Math.min(Math.max(parseInt(n, 10) || 30, 7), 180);
  const h = hoje(); const fim = somarDias(h, total);
  const { contas, total: saldo } = await listarContas();
  const { rows: rec } = await pool.query(
    `SELECT 'fatura' AS tipo, id, 'Fatura ' || numero || ' — ' || COALESCE(tomador_nome, '') AS descricao, vencimento::text AS data, (valor_bruto - desconto - valor_pago)::float AS valor
       FROM faturas_transporte WHERE status IN ('aberta', 'parcial') AND vencimento <= $1 ORDER BY vencimento`, [fim]);
  const { rows: pag } = await pool.query(
    `SELECT 'conta' AS tipo, id, descricao || COALESCE(' — ' || fornecedor_nome, '') || COALESCE(' (' || parcela || ')', '') AS descricao, vencimento::text AS data, (valor - valor_pago)::float AS valor
       FROM contas_pagar WHERE status = 'aberta' AND vencimento <= $1 ORDER BY vencimento`, [fim]);
  const { rows: [af] } = await pool.query(
    `SELECT COUNT(*)::int AS qtd, COALESCE(SUM(COALESCE((dados->'valores'->>'vRec')::numeric, (dados->'valores'->>'vTPrest')::numeric, valor_total)), 0)::float AS valor
       FROM ctes_emitidos WHERE status = 'autorizado' AND fatura_id IS NULL AND NOT demonstracao`).catch(() => ({ rows: [{ qtd: 0, valor: 0 }] }));
  const vencidos = { receber: centavos(rec.filter((r) => r.data < h).reduce((s, r) => s + r.valor, 0)), pagar: centavos(pag.filter((r) => r.data < h).reduce((s, r) => s + r.valor, 0)) };
  // Semanas a partir de hoje; o vencido entra na primeira (é o que precisa resolver já).
  const semanas = [];
  let saldoCorrente = saldo;
  for (let ini = h; ini <= fim; ini = somarDias(ini, 7)) {
    const ate = somarDias(ini, 6) > fim ? fim : somarDias(ini, 6);
    const naSemana = (r) => (semanas.length === 0 ? r.data <= ate : r.data >= ini && r.data <= ate);
    const ent = rec.filter(naSemana); const sai = pag.filter(naSemana);
    const entradas = centavos(ent.reduce((s, r) => s + r.valor, 0)); const saidas = centavos(sai.reduce((s, r) => s + r.valor, 0));
    saldoCorrente = centavos(saldoCorrente + entradas - saidas);
    semanas.push({ de: ini, ate, entradas, saidas, saldo: saldoCorrente, itens: [...ent.map((r) => ({ ...r, sentido: 'entrada', vencido: r.data < h })), ...sai.map((r) => ({ ...r, sentido: 'saida', vencido: r.data < h }))].sort((a, b) => a.data.localeCompare(b.data)) });
  }
  const menor = semanas.reduce((m, s) => (s.saldo < m.saldo ? s : m), { saldo: Infinity });
  return {
    hoje: h, ate: fim, dias: total, saldo_atual: saldo, contas: contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo: c.saldo })), vencidos, a_faturar: af,
    entradas: centavos(semanas.reduce((s, x) => s + x.entradas, 0)), saidas: centavos(semanas.reduce((s, x) => s + x.saidas, 0)), saldo_final: saldoCorrente,
    menor_saldo: semanas.length ? { valor: menor.saldo, semana: menor.de } : null, semanas,
  };
}

module.exports = {
  CATEGORIAS, TIPOS, listarContas, criarConta, alterarConta, carregarConta, saldoEm, movimentos, lancar, excluirMovimento,
  importarOfx, extrato, sugestoesPara, conciliar, desfazer, conciliarAutomatico, fluxo, citaParticipante, formaDoHistorico, normal,
};
