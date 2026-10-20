// Acerto de viagem (estilo SSW):
//  - motorista PRÓPRIO: leva um adiantamento, volta com os comprovantes das
//    despesas (combustível, pedágio, alimentação...). Saldo = despesas −
//    adiantamento (positivo: a empresa reembolsa; negativo: o motorista devolve).
//  - TERCEIRO / agregado: frete contratado − adiantamento − impostos retidos
//    (autônomo pessoa física: INSS e SEST/SENAT sobre 20% do frete, e IRRF)
//    − descontos (avaria, falta) + acréscimos (estadia, descarga) = saldo a pagar.
// O adiantamento e o saldo viram contas a pagar; o CIOT e o vale-pedágio vão
// para o MDF-e (se ainda não foi transmitido); o custo vai para o "resultado
// por viagem" do painel.
const pool = require('./db');
const Doc = require('./utils/documento');
const contas = require('./contasPagar');

const { centavos, valor } = contas;
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const digitos = (v, max) => String(v || '').replace(/\D/g, '').slice(0, max) || null;
const CATEGORIAS = {
  combustivel: 'Combustível', pedagio: 'Pedágio', alimentacao: 'Alimentação', hospedagem: 'Hospedagem', manutencao: 'Manutenção',
  avaria: 'Avaria / falta', estadia: 'Estadia', descarga: 'Descarga', outros: 'Outros',
};
// Despesa do motorista próprio → custo da viagem no painel.
const CUSTO_DA_CATEGORIA = { combustivel: 'combustivel', pedagio: 'pedagio', alimentacao: 'motorista', hospedagem: 'motorista' };

// Retenções do autônomo (TAC pessoa física): base de 20% do frete.
// INSS 11% e SEST/SENAT 2,5% sobre a base. O IRRF depende da tabela do mês
// (base de 10% do frete) e dos outros pagamentos ao mesmo autônomo: lançado à mão.
function impostosTac(frete) {
  const base = centavos((Number(frete) || 0) * 0.2);
  return { base, inss: centavos(base * 0.11), sest_senat: centavos(base * 0.025) };
}

function lerAcerto(b = {}) {
  const a = {
    tipo: b.tipo === 'terceiro' ? 'terceiro' : 'proprio',
    motorista_nome: texto(b.motorista_nome, 120), motorista_cpf: digitos(b.motorista_cpf, 11),
    proprietario_nome: texto(b.proprietario_nome, 200), proprietario_doc: Doc.limpar(b.proprietario_doc), rntrc: digitos(b.rntrc, 20),
    placa: texto(b.placa, 10)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null, descricao: texto(b.descricao, 200),
    data_saida: /^\d{4}-\d{2}-\d{2}$/.test(String(b.data_saida || '')) ? b.data_saida : contas.hojeBr(),
    mdfe_id: Number(b.mdfe_id) || null, romaneio_id: Number(b.romaneio_id) || null, transferencia_id: Number(b.transferencia_id) || null,
    valor_frete: valor(b.valor_frete) || 0, adiantamento: valor(b.adiantamento) || 0,
    reter_impostos: b.reter_impostos === true || b.reter_impostos === 'true',
    inss: valor(b.inss) || 0, sest_senat: valor(b.sest_senat) || 0, irrf: valor(b.irrf) || 0,
    ciot: digitos(b.ciot, 12), vale_pedagio_valor: valor(b.vale_pedagio_valor) || 0, vale_pedagio_cnpj: Doc.limpar(b.vale_pedagio_cnpj), vale_pedagio_compra: texto(b.vale_pedagio_compra, 30),
    prazo_saldo_dias: Math.min(Math.max(parseInt(b.prazo_saldo_dias, 10) || 0, 0), 120), observacao: texto(b.observacao, 2000),
  };
  if (!a.motorista_nome) throw falha('Informe o motorista.');
  if (a.motorista_cpf && a.motorista_cpf.length !== 11) throw falha('CPF do motorista inválido.');
  if (a.tipo === 'terceiro') {
    if (!(a.valor_frete > 0)) throw falha('Informe o valor do frete contratado.');
    if (!a.proprietario_nome) a.proprietario_nome = a.motorista_nome;
    if (a.proprietario_doc && ![11, 14].includes(a.proprietario_doc.length)) throw falha('CPF/CNPJ do contratado inválido.');
    if (a.adiantamento > a.valor_frete) throw falha('O adiantamento é maior que o frete contratado.');
    // Autônomo PF com retenção: INSS e SEST/SENAT calculados se não vierem preenchidos.
    if (a.reter_impostos) {
      const t = impostosTac(a.valor_frete);
      if (!(valor(b.inss) > 0)) a.inss = t.inss;
      if (!(valor(b.sest_senat) > 0)) a.sest_senat = t.sest_senat;
    } else { a.inss = 0; a.sest_senat = 0; a.irrf = 0; }
  } else {
    a.valor_frete = 0; a.reter_impostos = false; a.inss = 0; a.sest_senat = 0; a.irrf = 0;
  }
  if (a.vale_pedagio_valor > 0 && a.vale_pedagio_cnpj && a.vale_pedagio_cnpj.length !== 14) throw falha('CNPJ da fornecedora do vale-pedágio inválido.');
  return a;
}
const CAMPOS = Object.keys(lerAcerto({ motorista_nome: 'x' }));

// Totais e saldo. Saldo positivo = a empresa paga; negativo = o motorista/contratado devolve.
function calcular(a, lancamentos = []) {
  const soma = (tipo) => centavos(lancamentos.filter((l) => l.tipo === tipo).reduce((s, l) => s + Number(l.valor), 0));
  const despesas = soma('despesa'); const descontos = soma('desconto'); const acrescimos = soma('acrescimo');
  if (a.tipo === 'terceiro') {
    const impostos = centavos(Number(a.inss) + Number(a.sest_senat) + Number(a.irrf));
    const bruto = centavos(Number(a.valor_frete) + acrescimos - descontos);
    return { tipo: 'terceiro', frete: Number(a.valor_frete), acrescimos, descontos, impostos, bruto, adiantamento: Number(a.adiantamento), despesas,
      saldo: centavos(bruto - impostos - Number(a.adiantamento)), custo_viagem: bruto };
  }
  return { tipo: 'proprio', despesas, descontos, acrescimos, adiantamento: Number(a.adiantamento), saldo: centavos(despesas + acrescimos - descontos - Number(a.adiantamento)), custo_viagem: despesas };
}

// Custos da viagem no formato do painel (mdfes.custos).
function custosDoMdfe(a, lancamentos) {
  const c = { combustivel: 0, pedagio: 0, motorista: 0, terceiro: 0, outros: 0 };
  if (a.tipo === 'terceiro') {
    c.terceiro = calcular(a, lancamentos).bruto;
    c.pedagio = centavos(Number(a.vale_pedagio_valor) || 0);
  } else {
    lancamentos.filter((l) => l.tipo === 'despesa').forEach((l) => { const k = CUSTO_DA_CATEGORIA[l.categoria] || 'outros'; c[k] = centavos(c[k] + Number(l.valor)); });
    c.pedagio = centavos(c.pedagio + (Number(a.vale_pedagio_valor) || 0));
  }
  return c;
}

// CIOT e vale-pedágio no MDF-e que ainda não foi transmitido.
async function levarAoMdfe(cliente, a) {
  if (!a.mdfe_id || (!a.ciot && !(a.vale_pedagio_valor > 0))) return false;
  const { rows } = await cliente.query(`SELECT dados FROM mdfes WHERE id = $1 AND status IN ('rascunho', 'rejeitado', 'erro')`, [a.mdfe_id]);
  if (!rows[0]) return false;
  const d = rows[0].dados || {};
  if (a.ciot) d.ciot = [{ ciot: a.ciot, doc: a.proprietario_doc || a.motorista_cpf || '' }];
  if (a.vale_pedagio_valor > 0 && a.vale_pedagio_cnpj) {
    const { rows: e } = await cliente.query('SELECT cnpj FROM empresa WHERE id = 1');
    d.valePedagio = [{ cnpjForn: a.vale_pedagio_cnpj, docPg: String(e[0]?.cnpj || '').replace(/\D/g, ''), nCompra: a.vale_pedagio_compra || '', vValePed: Number(a.vale_pedagio_valor) }];
  }
  await cliente.query('UPDATE mdfes SET dados = $2 WHERE id = $1', [a.mdfe_id, d]);
  return true;
}

const quemRecebe = (a) => (a.tipo === 'terceiro' ? { fornecedor_nome: a.proprietario_nome, fornecedor_doc: a.proprietario_doc } : { fornecedor_nome: a.motorista_nome, fornecedor_doc: a.motorista_cpf });
const rotulo = (a) => `${a.descricao || `viagem de ${String(a.data_saida).slice(0, 10).split('-').reverse().join('/')}`}${a.placa ? ` · ${a.placa}` : ''}`;

async function comTransacao(fn) {
  const cliente = await pool.connect();
  try { await cliente.query('BEGIN'); const r = await fn(cliente); await cliente.query('COMMIT'); return r; } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

// O adiantamento vira conta a pagar (vencendo na saída); muda junto se o acerto mudar.
async function sincronizarAdiantamento(cliente, id, a, usuarioNome) {
  const { rows } = await cliente.query(`SELECT id, status, valor_pago FROM contas_pagar WHERE acerto_id = $1 AND categoria = 'adiantamento' AND status <> 'cancelada'`, [id]);
  const atual = rows[0];
  if (atual && Number(atual.valor_pago) > 0) {
    if (Number(a.adiantamento) < Number(atual.valor_pago)) throw falha('O adiantamento já foi pago com valor maior: estorne o pagamento em Contas a pagar antes de diminuir.');
    await cliente.query('UPDATE contas_pagar SET valor = $2, status = CASE WHEN valor_pago >= $2 THEN \'paga\' ELSE \'aberta\' END WHERE id = $1', [atual.id, a.adiantamento]);
    return;
  }
  if (atual) {
    if (a.adiantamento > 0) await cliente.query('UPDATE contas_pagar SET valor = $2, vencimento = $3, fornecedor_nome = $4, fornecedor_doc = $5 WHERE id = $1', [atual.id, a.adiantamento, a.data_saida, quemRecebe(a).fornecedor_nome, quemRecebe(a).fornecedor_doc]);
    else await cliente.query(`UPDATE contas_pagar SET status = 'cancelada' WHERE id = $1`, [atual.id]);
    return;
  }
  if (a.adiantamento > 0) {
    await contas.criar({ descricao: `Adiantamento ${a.tipo === 'terceiro' ? 'de frete' : 'de viagem'} — acerto ${id} (${rotulo(a)})`, categoria: 'adiantamento', ...quemRecebe(a),
      vencimento: a.data_saida, valor: a.adiantamento, placa: a.placa }, usuarioNome, { cliente, acertoId: id });
  }
}

async function criar(b, usuarioNome) {
  const a = lerAcerto(b);
  return comTransacao(async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO acertos (${CAMPOS.join(', ')}, criado_por_nome) VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPOS.length + 1}) RETURNING *`,
      [...CAMPOS.map((k) => a[k]), usuarioNome]);
    await sincronizarAdiantamento(cliente, rows[0].id, a, usuarioNome);
    const mdfe = await levarAoMdfe(cliente, a);
    return { ...rows[0], ciot_no_mdfe: mdfe };
  });
}

async function alterar(id, b, usuarioNome) {
  const a = lerAcerto(b);
  return comTransacao(async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE acertos SET ${CAMPOS.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 AND status = 'aberto' RETURNING *`, [id, ...CAMPOS.map((k) => a[k])]);
    if (!rows[0]) throw falha('Só dá para alterar acerto em aberto (reabra o acerto antes).', 409);
    await sincronizarAdiantamento(cliente, id, a, usuarioNome);
    const mdfe = await levarAoMdfe(cliente, a);
    return { ...rows[0], ciot_no_mdfe: mdfe };
  });
}

async function detalhe(id) {
  const { rows } = await pool.query(
    `SELECT a.*, m.serie AS mdfe_serie, m.numero AS mdfe_numero, m.status AS mdfe_status FROM acertos a LEFT JOIN mdfes m ON m.id = a.mdfe_id WHERE a.id = $1`, [id]);
  if (!rows[0]) throw falha('Acerto não encontrado.', 404);
  const { rows: lanc } = await pool.query('SELECT * FROM acerto_lancamentos WHERE acerto_id = $1 ORDER BY data NULLS LAST, id', [id]);
  const { rows: cps } = await pool.query('SELECT id, descricao, categoria, vencimento, valor, valor_pago, status FROM contas_pagar WHERE acerto_id = $1 ORDER BY id', [id]);
  return { ...rows[0], lancamentos: lanc, contas: cps, totais: calcular(rows[0], lanc) };
}

async function lancar(id, b) {
  const tipo = ['despesa', 'desconto', 'acrescimo'].includes(b.tipo) ? b.tipo : null;
  if (!tipo) throw falha('Tipo de lançamento inválido.');
  const v = valor(b.valor);
  if (!(v > 0)) throw falha('Informe o valor.');
  const { rows: a } = await pool.query('SELECT tipo, status FROM acertos WHERE id = $1', [id]);
  if (!a[0]) throw falha('Acerto não encontrado.', 404);
  if (a[0].status !== 'aberto') throw falha('O acerto já foi fechado: reabra para lançar.', 409);
  if (tipo === 'despesa' && a[0].tipo === 'terceiro') throw falha('No terceiro, as despesas são dele: use desconto ou acréscimo.');
  const { rows } = await pool.query(
    'INSERT INTO acerto_lancamentos (acerto_id, tipo, categoria, descricao, valor, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, tipo, CATEGORIAS[b.categoria] ? b.categoria : 'outros', texto(b.descricao, 200), v, /^\d{4}-\d{2}-\d{2}$/.test(String(b.data || '')) ? b.data : null]);
  return rows[0];
}

// Fecha o acerto: lança o saldo em contas a pagar e o custo da viagem no painel.
async function acertar(id, usuarioNome) {
  return comTransacao(async (cliente) => {
    const { rows } = await cliente.query('SELECT * FROM acertos WHERE id = $1 FOR UPDATE', [id]);
    const a = rows[0];
    if (!a) throw falha('Acerto não encontrado.', 404);
    if (a.status !== 'aberto') throw falha('Este acerto já foi fechado.', 409);
    const { rows: lanc } = await cliente.query('SELECT * FROM acerto_lancamentos WHERE acerto_id = $1', [id]);
    const t = calcular(a, lanc);
    let conta = null;
    if (t.saldo > 0) {
      const venc = contas.somarMeses(contas.hojeBr(), 0);
      const vencimento = new Date(Date.parse(`${venc}T12:00:00Z`) + a.prazo_saldo_dias * 86400000).toISOString().slice(0, 10);
      [conta] = await contas.criar({
        descricao: a.tipo === 'terceiro' ? `Saldo de frete — acerto ${id} (${rotulo(a)})` : `Reembolso de despesas de viagem — acerto ${id} (${rotulo(a)})`,
        categoria: a.tipo === 'terceiro' ? 'frete_terceiro' : 'outros', ...quemRecebe(a), vencimento, valor: t.saldo, placa: a.placa,
        observacao: a.tipo === 'terceiro' && t.impostos ? `Retidos: INSS R$ ${Number(a.inss).toFixed(2)}, SEST/SENAT R$ ${Number(a.sest_senat).toFixed(2)}, IRRF R$ ${Number(a.irrf).toFixed(2)}.` : null,
      }, usuarioNome, { cliente, acertoId: id });
    }
    let custos = null;
    if (a.mdfe_id) {
      custos = custosDoMdfe(a, lanc);
      await cliente.query(`UPDATE mdfes SET custos = $2 WHERE id = $1 AND status IN ('autorizado', 'encerrado')`, [a.mdfe_id, custos]);
    }
    await cliente.query(`UPDATE acertos SET status = 'acertado', saldo = $2, acertado_em = NOW(), acertado_por_nome = $3 WHERE id = $1`, [id, t.saldo, usuarioNome]);
    return { totais: t, conta, custos };
  });
}

// Reabre: cancela o saldo lançado (se ainda não foi pago).
async function reabrir(id) {
  return comTransacao(async (cliente) => {
    const { rows } = await cliente.query(`SELECT id FROM acertos WHERE id = $1 AND status = 'acertado' FOR UPDATE`, [id]);
    if (!rows[0]) throw falha('Este acerto não está fechado.', 409);
    const { rows: pagos } = await cliente.query(
      `SELECT id FROM contas_pagar WHERE acerto_id = $1 AND categoria <> 'adiantamento' AND status <> 'cancelada' AND valor_pago > 0`, [id]);
    if (pagos.length) throw falha('O saldo deste acerto já foi pago (total ou parcial): estorne o pagamento em Contas a pagar antes de reabrir.', 409);
    await cliente.query(`UPDATE contas_pagar SET status = 'cancelada' WHERE acerto_id = $1 AND categoria <> 'adiantamento' AND status = 'aberta'`, [id]);
    await cliente.query(`UPDATE acertos SET status = 'aberto', saldo = NULL, acertado_em = NULL, acertado_por_nome = NULL WHERE id = $1`, [id]);
  });
}

module.exports = { CATEGORIAS, impostosTac, lerAcerto, calcular, custosDoMdfe, criar, alterar, detalhe, lancar, acertar, reabrir };
