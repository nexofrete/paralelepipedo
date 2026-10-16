// Frota (estilo SSW): abastecimentos com consumo km/l, manutenções
// preventivas e corretivas (peças e serviços), planos de manutenção
// preventiva por km e/ou por tempo, e o custo por km de cada veículo.
// O que é pago entra em Contas a pagar; o que o motorista pagou na viagem
// entra como despesa no acerto de viagem.
const pool = require('./db');
const contas = require('./contasPagar');

const COMBUSTIVEIS = { diesel_s10: 'Diesel S10', diesel_s500: 'Diesel S500', arla32: 'ARLA 32', gasolina: 'Gasolina', etanol: 'Etanol', gnv: 'GNV' };
const PAGAMENTOS = { a_vista: 'Pago à vista', a_prazo: 'A prazo (contas a pagar)', motorista: 'Motorista pagou (acerto de viagem)', nenhum: 'Já lançado / cartão frota' };
const STATUS_MANUT = { agendada: 'Agendada', em_andamento: 'Na oficina', concluida: 'Concluída', cancelada: 'Cancelada' };
// Planos preventivos sugeridos (a empresa ajusta pelo manual do fabricante).
const MODELOS_PLANO = [
  { item: 'Troca de óleo do motor e filtro de óleo', a_cada_km: 20000, a_cada_dias: 180 },
  { item: 'Filtros de combustível e de ar', a_cada_km: 40000, a_cada_dias: 365 },
  { item: 'Lubrificação (graxa) do chassi', a_cada_km: 10000, a_cada_dias: 60 },
  { item: 'Revisão de freios (lonas/pastilhas)', a_cada_km: 30000, a_cada_dias: 180 },
  { item: 'Rodízio e calibragem dos pneus', a_cada_km: 15000, a_cada_dias: null },
  { item: 'Óleo da caixa e do diferencial', a_cada_km: 100000, a_cada_dias: 730 },
  { item: 'Licenciamento (CRLV)', a_cada_km: null, a_cada_dias: 365, aviso_dias: 30 },
  { item: 'Aferição do tacógrafo (Inmetro)', a_cada_km: null, a_cada_dias: 730, aviso_dias: 30 },
];

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
// Km e contagens: só os dígitos ("120.500" é 120500 km).
// Km/inteiro digitado: "123.456" (milhar) = 123456; "123,5" e "123.5" (decimal) = 124.
const inteiro = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const t = String(v ?? '').trim();
  if (/^\d+\.\d{1,2}$/.test(t)) return Math.round(Number(t));
  const [int, dec] = t.split(',');
  const d = int.replace(/\D/g, '');
  return d ? Number(d) + (/^\d/.test(dec || '') && Number(dec[0]) >= 5 ? 1 : 0) : null;
};
const decimal = (v, casas = 3) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).includes(',') ? String(v).replace(/\./g, '').replace(',', '.') : v);
  return Number.isFinite(n) ? Math.round(n * 10 ** casas) / 10 ** casas : null;
};
const { centavos, hojeBr } = contas;
const doc = (v) => String(v || '').replace(/\D/g, '').slice(0, 14) || null;
const diaBr = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10).split('-').reverse().join('/') : '');
const isoDe = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const somarDias = (dataIso, dias) => new Date(Date.parse(`${dataIso}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

async function comTransacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

async function veiculo(id, cliente = pool) {
  const { rows } = await cliente.query('SELECT * FROM veiculos WHERE id = $1', [id]);
  if (!rows[0]) throw falha('Veículo não encontrado.', 404);
  return rows[0];
}

// O hodômetro não anda para trás: o km tem que ficar entre o do registro anterior e o do seguinte.
async function conferirKm(cliente, veiculoId, km, data, { ignorarAbast = 0, ignorarManut = 0 } = {}) {
  if (km == null) return;
  if (km < 0 || km > 9999999) throw falha('Km inválido.');
  const { rows } = await cliente.query(
    `SELECT data, km, 'abastecimento' AS origem FROM abastecimentos WHERE veiculo_id = $1 AND km IS NOT NULL AND id <> $2
     UNION ALL SELECT COALESCE(data_saida, data), km, 'manutenção' FROM manutencoes WHERE veiculo_id = $1 AND km IS NOT NULL AND id <> $3 AND status <> 'cancelada'`,
    [veiculoId, ignorarAbast, ignorarManut]);
  const antes = rows.filter((r) => isoDe(r.data) < data && r.km > km).sort((a, b) => b.km - a.km)[0];
  if (antes) throw falha(`O km ${km.toLocaleString('pt-BR')} é menor que o do ${antes.origem} de ${diaBr(antes.data)} (${Number(antes.km).toLocaleString('pt-BR')} km). Confira o hodômetro ou a data.`);
  const depois = rows.filter((r) => isoDe(r.data) > data && r.km < km).sort((a, b) => a.km - b.km)[0];
  if (depois) throw falha(`O km ${km.toLocaleString('pt-BR')} é maior que o do ${depois.origem} de ${diaBr(depois.data)} (${Number(depois.km).toLocaleString('pt-BR')} km), que é depois. Confira o hodômetro ou a data.`);
}

async function atualizarKm(cliente, veiculoId, km, data) {
  if (km == null) return;
  await cliente.query(`UPDATE veiculos SET km_atual = GREATEST(COALESCE(km_atual, 0), $2), km_atualizado_em = CASE WHEN $2 >= COALESCE(km_atual, 0) THEN $3::date ELSE km_atualizado_em END
    WHERE id = $1`, [veiculoId, km, data]);
}

// Lança o custo no financeiro. a_vista: conta já paga; a_prazo: conta em aberto (parcelada ou não).
async function lancarConta(cliente, { pagamento, descricao, categoria, fornecedor_nome, fornecedor_doc, documento, data, vencimento, valor, parcelas, forma, observacao, veiculo_id }, usuarioNome) {
  if (!['a_vista', 'a_prazo'].includes(pagamento) || !(valor > 0)) return [];
  const criadas = await contas.criar({
    descricao, categoria, fornecedor_nome, fornecedor_doc, documento, observacao, valor, veiculo_id,
    vencimento: pagamento === 'a_vista' ? data : (iso(vencimento) || data), parcelas: pagamento === 'a_prazo' ? parcelas || 1 : 1,
  }, usuarioNome, { cliente });
  if (pagamento === 'a_vista') await contas.pagar(criadas[0].id, { data, forma: contas.FORMAS.includes(forma) ? forma : 'pix' }, usuarioNome, cliente);
  return criadas;
}

// Desfaz as contas geradas: some se não tem pagamento manual (a "à vista" foi paga pelo próprio lançamento).
async function desfazerContas(cliente, ids, pagamento) {
  if (!ids.length) return;
  const { rows } = await cliente.query('SELECT id, valor_pago, status FROM contas_pagar WHERE id = ANY($1::int[]) FOR UPDATE', [ids]);
  if (pagamento !== 'a_vista' && rows.some((c) => Number(c.valor_pago) > 0)) throw falha('Já tem pagamento lançado na conta a pagar deste registro. Estorne o pagamento em Contas a pagar antes de excluir.', 409);
  // À vista: só o pagamento automático do lançamento pode sair junto; outro pagamento lançado à mão não.
  if (pagamento === 'a_vista') {
    const { rows: pgs } = await cliente.query('SELECT conta_id, COUNT(*)::int AS n FROM contas_pagar_pagamentos WHERE conta_id = ANY($1::int[]) GROUP BY 1 HAVING COUNT(*) > 1', [ids]);
    if (pgs[0]) throw falha('A conta deste registro tem outro pagamento além do automático. Estorne-o em Contas a pagar antes de excluir.', 409);
  }
  // Pagamento já conferido com o extrato do banco não some junto: desfaça a conciliação primeiro.
  const { rows: conc } = await cliente.query(`SELECT 1 FROM contas_pagar_pagamentos p JOIN extrato_linhas e ON e.conciliado_tipo = 'pagamento' AND e.conciliado_id = p.id
    WHERE p.conta_id = ANY($1::int[]) LIMIT 1`, [ids]);
  if (conc[0]) throw falha('O pagamento deste registro já foi conciliado com o extrato do banco. Desfaça a conciliação em Caixa e bancos antes de excluir.', 409);
  await cliente.query('DELETE FROM contas_pagar WHERE id = ANY($1::int[])', [ids]);
}

// ======================= Abastecimentos =======================
function lerAbastecimento(b = {}) {
  const a = {
    veiculo_id: Number(b.veiculo_id) || null, data: iso(b.data) || hojeBr(), km: inteiro(b.km), combustivel: COMBUSTIVEIS[b.combustivel] ? b.combustivel : 'diesel_s10',
    litros: decimal(b.litros), valor_total: centavos(contas.valor(b.valor_total)), tanque_cheio: b.tanque_cheio !== false && b.tanque_cheio !== 'false',
    posto_nome: texto(b.posto_nome, 150), posto_doc: doc(b.posto_doc), documento: texto(b.documento, 60), motorista_nome: texto(b.motorista_nome, 120),
    pagamento: PAGAMENTOS[b.pagamento] ? b.pagamento : 'a_vista', observacao: texto(b.observacao, 2000),
  };
  if (!a.veiculo_id) throw falha('Escolha o veículo.');
  if (!(a.litros > 0) || a.litros > 5000) throw falha('Informe os litros abastecidos.');
  if (!(a.valor_total > 0)) throw falha('Informe o valor pago.');
  const preco = a.valor_total / a.litros;
  if (preco < 0.5 || preco > 30) throw falha(`Preço por litro fora do normal (R$ ${preco.toFixed(2)}). Confira litros e valor.`);
  if (a.data > hojeBr()) throw falha('A data do abastecimento é no futuro.');
  if (a.combustivel !== 'arla32' && a.km == null) throw falha('Informe o km do hodômetro (sem ele não dá para calcular o consumo).');
  if (a.posto_doc && ![11, 14].includes(a.posto_doc.length)) throw falha('CNPJ do posto inválido.');
  return a;
}

async function criarAbastecimento(b, usuarioNome) {
  const a = lerAbastecimento(b);
  return comTransacao(async (cliente) => {
    const v = await veiculo(a.veiculo_id, cliente);
    await conferirKm(cliente, a.veiculo_id, a.km, a.data);
    let acertoId = null; let lancId = null; let contaId = null;
    const desc = `${COMBUSTIVEIS[a.combustivel]} ${v.placa} — ${String(a.litros).replace('.', ',')} L${a.km != null ? ` (km ${a.km.toLocaleString('pt-BR')})` : ''}`;
    if (a.pagamento === 'motorista') {
      acertoId = Number(b.acerto_id) || null;
      if (!acertoId) throw falha('Escolha o acerto de viagem em que o motorista lança a despesa.');
      const { rows } = await cliente.query('SELECT tipo, status FROM acertos WHERE id = $1 FOR UPDATE', [acertoId]);
      if (!rows[0]) throw falha('Acerto não encontrado.', 404);
      if (rows[0].status !== 'aberto') throw falha('O acerto já foi fechado: reabra ou escolha outro.', 409);
      if (rows[0].tipo !== 'proprio') throw falha('No acerto de terceiro o combustível é dele: lance como desconto no acerto, se for o caso.');
      const { rows: l } = await cliente.query(
        `INSERT INTO acerto_lancamentos (acerto_id, tipo, categoria, descricao, valor, data) VALUES ($1, 'despesa', 'combustivel', $2, $3, $4) RETURNING id`,
        [acertoId, `${desc}${a.posto_nome ? ` · ${a.posto_nome}` : ''}`.slice(0, 200), a.valor_total, a.data]);
      lancId = l[0].id;
    } else {
      const criadas = await lancarConta(cliente, { pagamento: a.pagamento, descricao: desc, categoria: 'combustivel', fornecedor_nome: a.posto_nome, fornecedor_doc: a.posto_doc,
        documento: a.documento, data: a.data, vencimento: b.vencimento, valor: a.valor_total, forma: b.forma, observacao: a.motorista_nome ? `Motorista: ${a.motorista_nome}` : null, veiculo_id: a.veiculo_id }, usuarioNome);
      contaId = criadas[0]?.id || null;
    }
    const { rows } = await cliente.query(
      `INSERT INTO abastecimentos (veiculo_id, data, km, combustivel, litros, valor_total, tanque_cheio, posto_nome, posto_doc, documento, motorista_nome, pagamento,
                                   conta_pagar_id, acerto_id, acerto_lancamento_id, observacao, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [a.veiculo_id, a.data, a.km, a.combustivel, a.litros, a.valor_total, a.tanque_cheio, a.posto_nome, a.posto_doc, a.documento, a.motorista_nome, a.pagamento,
        contaId, acertoId, lancId, a.observacao, usuarioNome]);
    await atualizarKm(cliente, a.veiculo_id, a.km, a.data);
    return { ...rows[0], placa: v.placa };
  });
}

async function excluirAbastecimento(id) {
  return comTransacao(async (cliente) => {
    const { rows } = await cliente.query('SELECT a.*, v.placa FROM abastecimentos a JOIN veiculos v ON v.id = a.veiculo_id WHERE a.id = $1 FOR UPDATE OF a', [id]);
    const a = rows[0];
    if (!a) throw falha('Abastecimento não encontrado.', 404);
    if (a.acerto_lancamento_id) {
      const { rows: ac } = await cliente.query('SELECT status FROM acertos WHERE id = $1', [a.acerto_id]);
      if (ac[0] && ac[0].status !== 'aberto') throw falha('O acerto de viagem deste abastecimento já foi fechado: reabra o acerto antes.', 409);
      await cliente.query('DELETE FROM acerto_lancamentos WHERE id = $1', [a.acerto_lancamento_id]);
    }
    if (a.conta_pagar_id) await desfazerContas(cliente, [a.conta_pagar_id], a.pagamento);
    await cliente.query('DELETE FROM abastecimentos WHERE id = $1', [id]);
    return a;
  });
}

// Consumo (km/l) de tanque cheio a tanque cheio: km rodados ÷ litros colocados
// depois do tanque cheio anterior (inclusive o atual). ARLA não entra.
function calcularConsumo(lista) {
  const porVeiculo = new Map();
  lista.forEach((a) => { if (!porVeiculo.has(a.veiculo_id)) porVeiculo.set(a.veiculo_id, []); porVeiculo.get(a.veiculo_id).push(a); });
  const resultado = new Map();
  for (const itens of porVeiculo.values()) {
    const comb = itens.filter((a) => a.combustivel !== 'arla32' && a.km != null)
      .sort((x, y) => Number(x.km) - Number(y.km) || isoDe(x.data).localeCompare(isoDe(y.data)) || x.id - y.id);
    let base = null; let litros = 0;
    for (const a of comb) {
      if (base) litros += Number(a.litros);
      if (a.tanque_cheio) {
        if (base && litros > 0 && Number(a.km) > Number(base.km)) {
          const km = Number(a.km) - Number(base.km);
          resultado.set(a.id, { km_rodados: km, litros_trecho: Math.round(litros * 1000) / 1000, consumo: Math.round((km / litros) * 100) / 100 });
        }
        base = a; litros = 0;
      }
    }
  }
  return resultado;
}

async function listarAbastecimentos({ veiculo_id, de, ate, combustivel } = {}) {
  const val = []; const onde = ['TRUE'];
  if (Number(veiculo_id)) { val.push(Number(veiculo_id)); onde.push(`a.veiculo_id = $${val.length}`); }
  // Busca o histórico inteiro dos veículos (o consumo depende do abastecimento anterior) e filtra o período depois.
  const { rows } = await pool.query(
    `SELECT a.*, v.placa, v.descricao AS veiculo_descricao, v.consumo_referencia, c.status AS conta_status, ac.status AS acerto_status
       FROM abastecimentos a JOIN veiculos v ON v.id = a.veiculo_id LEFT JOIN contas_pagar c ON c.id = a.conta_pagar_id LEFT JOIN acertos ac ON ac.id = a.acerto_id
      WHERE ${onde.join(' AND ')} ORDER BY a.data DESC, a.km DESC NULLS LAST, a.id DESC LIMIT 20000`, val);
  const consumo = calcularConsumo(rows);
  return rows
    .filter((a) => (!iso(de) || isoDe(a.data) >= de) && (!iso(ate) || isoDe(a.data) <= ate) && (!COMBUSTIVEIS[combustivel] || a.combustivel === combustivel))
    .slice(0, 1000)
    .map((a) => {
      const c = consumo.get(a.id) || {};
      const ref = Number(a.consumo_referencia) || null;
      return { ...a, preco_litro: Math.round((Number(a.valor_total) / Number(a.litros)) * 1000) / 1000, ...c,
        alerta_consumo: !!(c.consumo && ref && c.consumo < ref * 0.85) };
    });
}

// ======================= Manutenções =======================
function lerItens(lista) {
  return (Array.isArray(lista) ? lista : []).map((i) => ({
    tipo: i.tipo === 'servico' ? 'servico' : 'peca', descricao: texto(i.descricao, 150), qtd: decimal(i.qtd, 3) || 1, valor_unit: centavos(contas.valor(i.valor_unit)),
  })).filter((i) => i.descricao && i.valor_unit >= 0).slice(0, 100);
}

function lerManutencao(b = {}) {
  const itens = lerItens(b.itens);
  const somaItens = centavos(itens.reduce((s, i) => s + i.qtd * i.valor_unit, 0));
  const m = {
    veiculo_id: Number(b.veiculo_id) || null, tipo: b.tipo === 'preventiva' ? 'preventiva' : 'corretiva',
    status: STATUS_MANUT[b.status] && b.status !== 'cancelada' ? b.status : 'concluida',
    data: iso(b.data) || hojeBr(), data_saida: iso(b.data_saida), km: inteiro(b.km), descricao: texto(b.descricao, 250), itens,
    valor_total: itens.length ? somaItens : centavos(contas.valor(b.valor_total)), oficina_nome: texto(b.oficina_nome, 150), oficina_doc: doc(b.oficina_doc),
    documento: texto(b.documento, 60), planos: [...new Set((Array.isArray(b.planos) ? b.planos : []).map(Number).filter(Number.isInteger))],
    pagamento: ['a_vista', 'a_prazo', 'nenhum'].includes(b.pagamento) ? b.pagamento : 'a_vista', vencimento: iso(b.vencimento),
    parcelas: Math.min(Math.max(parseInt(b.parcelas, 10) || 1, 1), 24), observacao: texto(b.observacao, 2000),
  };
  if (!m.veiculo_id) throw falha('Escolha o veículo.');
  if (!m.descricao) throw falha('Descreva a manutenção (ex.: troca de óleo e filtros).');
  if (m.data_saida && m.data_saida < m.data) throw falha('A data de saída da oficina é antes da entrada.');
  if (m.status === 'concluida' && (m.data_saida || m.data) > hojeBr()) throw falha('Manutenção concluída não pode ter data no futuro.');
  if (m.oficina_doc && ![11, 14].includes(m.oficina_doc.length)) throw falha('CNPJ/CPF da oficina inválido.');
  if (m.pagamento === 'a_prazo' && m.status === 'concluida' && !m.vencimento) throw falha('Informe o vencimento da conta a pagar.');
  return m;
}
const CAMPOS_MANUT = ['veiculo_id', 'tipo', 'status', 'data', 'data_saida', 'km', 'descricao', 'itens', 'valor_total', 'oficina_nome', 'oficina_doc', 'documento',
  'planos', 'pagamento', 'vencimento', 'parcelas', 'observacao'];
const valoresManut = (m) => CAMPOS_MANUT.map((k) => (k === 'itens' ? JSON.stringify(m[k]) : m[k]));

// Conclusão: lança o custo, dá baixa nos planos preventivos e atualiza o km.
async function aoConcluir(cliente, m, id, usuarioNome) {
  const v = await veiculo(m.veiculo_id, cliente);
  const data = m.data_saida || m.data;
  const criadas = await lancarConta(cliente, { pagamento: m.pagamento, descricao: `Manutenção ${v.placa}: ${m.descricao}`.slice(0, 200),
    categoria: /pneu/i.test(m.descricao) ? 'pneus' : 'manutencao', fornecedor_nome: m.oficina_nome, fornecedor_doc: m.oficina_doc, documento: m.documento,
    data, vencimento: m.vencimento, valor: m.valor_total, parcelas: m.parcelas, forma: m.forma, veiculo_id: m.veiculo_id }, usuarioNome);
  if (m.planos.length) {
    const { rows: antes } = await cliente.query('SELECT id, ultima_km, ultima_data FROM manutencao_planos WHERE id = ANY($1::int[]) AND veiculo_id = $2', [m.planos, m.veiculo_id]);
    await cliente.query('UPDATE manutencoes SET planos_antes = $2 WHERE id = $1', [id, JSON.stringify(antes.map((p) => ({ ...p, ultima_data: isoDe(p.ultima_data) })))]);
    await cliente.query(`UPDATE manutencao_planos SET ultima_km = COALESCE($3, ultima_km), ultima_data = $4 WHERE id = ANY($2::int[]) AND veiculo_id = $1`,
      [m.veiculo_id, m.planos, m.km, data]);
  }
  await atualizarKm(cliente, m.veiculo_id, m.km, data);
  await cliente.query('UPDATE manutencoes SET contas_ids = $2 WHERE id = $1', [id, criadas.map((c) => c.id)]);
}

async function criarManutencao(b, usuarioNome) {
  const m = { ...lerManutencao(b), forma: b.forma };
  return comTransacao(async (cliente) => {
    await veiculo(m.veiculo_id, cliente);
    if (m.status === 'concluida') await conferirKm(cliente, m.veiculo_id, m.km, m.data_saida || m.data);
    const { rows } = await cliente.query(
      `INSERT INTO manutencoes (${CAMPOS_MANUT.join(', ')}, criado_por_nome) VALUES (${CAMPOS_MANUT.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPOS_MANUT.length + 1}) RETURNING *`,
      [...valoresManut(m), usuarioNome]);
    if (m.status === 'concluida') await aoConcluir(cliente, m, rows[0].id, usuarioNome);
    return rows[0];
  });
}

// Alterar só enquanto não concluiu (depois o custo já está no financeiro). Concluir = alterar com status concluida.
async function alterarManutencao(id, b, usuarioNome) {
  const m = { ...lerManutencao(b), forma: b.forma };
  return comTransacao(async (cliente) => {
    const { rows: atual } = await cliente.query('SELECT status FROM manutencoes WHERE id = $1 FOR UPDATE', [id]);
    if (!atual[0]) throw falha('Manutenção não encontrada.', 404);
    if (!['agendada', 'em_andamento'].includes(atual[0].status)) throw falha('Manutenção concluída ou cancelada não muda mais (exclua e lance de novo, se precisar).', 409);
    if (m.status === 'concluida') await conferirKm(cliente, m.veiculo_id, m.km, m.data_saida || m.data, { ignorarManut: id });
    const { rows } = await cliente.query(`UPDATE manutencoes SET ${CAMPOS_MANUT.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...valoresManut(m)]);
    if (m.status === 'concluida') await aoConcluir(cliente, m, id, usuarioNome);
    return rows[0];
  });
}

async function cancelarManutencao(id) {
  const { rows } = await pool.query(`UPDATE manutencoes SET status = 'cancelada' WHERE id = $1 AND status IN ('agendada', 'em_andamento') RETURNING *`, [id]);
  if (!rows[0]) throw falha('Só dá para cancelar manutenção agendada ou na oficina.', 409);
  return rows[0];
}

async function excluirManutencao(id) {
  return comTransacao(async (cliente) => {
    const { rows } = await cliente.query('SELECT * FROM manutencoes WHERE id = $1 FOR UPDATE', [id]);
    const m = rows[0];
    if (!m) throw falha('Manutenção não encontrada.', 404);
    if (m.status === 'concluida') await desfazerContas(cliente, m.contas_ids || [], m.pagamento);
    await cliente.query('DELETE FROM manutencoes WHERE id = $1', [id]);
    // Os planos que ela cumpria voltam para a manutenção anterior que os cumpriu, ou para como estavam antes dela.
    if (m.status === 'concluida') {
      for (const p of m.planos || []) {
        const { rows: ant } = await cliente.query(
          // (a anterior sem km fica com o km da última que tinha, como no "concluir")
          `SELECT COALESCE(km, (SELECT x.km FROM manutencoes x WHERE x.status = 'concluida' AND $1 = ANY(x.planos) AND x.km IS NOT NULL ORDER BY COALESCE(x.data_saida, x.data) DESC, x.id DESC LIMIT 1)) AS km,
                  COALESCE(data_saida, data) AS data FROM manutencoes WHERE status = 'concluida' AND $1 = ANY(planos) ORDER BY COALESCE(data_saida, data) DESC, id DESC LIMIT 1`, [p]);
        const antes = (m.planos_antes || []).find((x) => x.id === p);
        if (ant[0]) await cliente.query('UPDATE manutencao_planos SET ultima_km = $2, ultima_data = $3 WHERE id = $1', [p, ant[0].km, ant[0].data]);
        else if (antes) await cliente.query('UPDATE manutencao_planos SET ultima_km = $2, ultima_data = $3 WHERE id = $1', [p, antes.ultima_km, antes.ultima_data]);
      }
    }
    return m;
  });
}

async function listarManutencoes({ veiculo_id, de, ate, status } = {}) {
  const val = []; const onde = ['TRUE'];
  if (Number(veiculo_id)) { val.push(Number(veiculo_id)); onde.push(`m.veiculo_id = $${val.length}`); }
  if (STATUS_MANUT[status]) { val.push(status); onde.push(`m.status = $${val.length}`); } else if (status === 'abertas') onde.push(`m.status IN ('agendada', 'em_andamento')`);
  if (iso(de)) { val.push(de); onde.push(`(m.status IN ('agendada', 'em_andamento') OR COALESCE(m.data_saida, m.data) >= $${val.length}::date)`); }
  if (iso(ate)) { val.push(ate); onde.push(`(m.status IN ('agendada', 'em_andamento') OR m.data <= $${val.length}::date)`); }
  const { rows } = await pool.query(
    `SELECT m.*, v.placa, v.descricao AS veiculo_descricao,
            (SELECT COALESCE(SUM(c.valor_pago), 0) FROM contas_pagar c WHERE c.id = ANY(m.contas_ids))::float AS valor_pago_contas
       FROM manutencoes m JOIN veiculos v ON v.id = m.veiculo_id WHERE ${onde.join(' AND ')}
      ORDER BY CASE m.status WHEN 'em_andamento' THEN 0 WHEN 'agendada' THEN 1 ELSE 2 END, m.data DESC, m.id DESC LIMIT 1000`, val);
  return rows;
}

// ======================= Planos preventivos =======================
function lerPlano(b = {}) {
  const p = {
    item: texto(b.item, 120), a_cada_km: inteiro(b.a_cada_km) || null, a_cada_dias: inteiro(b.a_cada_dias) || null,
    aviso_km: inteiro(b.aviso_km) ?? 1000, aviso_dias: inteiro(b.aviso_dias) ?? 15, ultima_km: inteiro(b.ultima_km), ultima_data: iso(b.ultima_data), ativo: b.ativo !== false,
  };
  if (!p.item) throw falha('Informe o item (ex.: troca de óleo).');
  if (!p.a_cada_km && !p.a_cada_dias) throw falha('Informe a cada quantos km e/ou a cada quantos dias.');
  return p;
}

// Situação: vencido, vencendo (dentro do aviso), em dia, ou sem base (nunca feito).
function situacaoPlano(p, kmAtual, hoje = hojeBr()) {
  const proximaKm = p.a_cada_km && p.ultima_km != null ? Number(p.ultima_km) + Number(p.a_cada_km) : null;
  const proximaData = p.a_cada_dias && p.ultima_data ? somarDias(isoDe(p.ultima_data), Number(p.a_cada_dias)) : null;
  const faltaKm = proximaKm != null && kmAtual != null ? proximaKm - Number(kmAtual) : null;
  const faltaDias = proximaData ? diasEntre(hoje, proximaData) : null;
  let situacao = 'em_dia';
  if (proximaKm == null && proximaData == null) situacao = 'sem_base';
  else if ((faltaKm != null && faltaKm <= 0) || (faltaDias != null && faltaDias <= 0)) situacao = 'vencido';
  else if ((faltaKm != null && faltaKm <= Number(p.aviso_km)) || (faltaDias != null && faltaDias <= Number(p.aviso_dias))) situacao = 'vencendo';
  return { proxima_km: proximaKm, proxima_data: proximaData, falta_km: faltaKm, falta_dias: faltaDias, situacao };
}

async function listarPlanos({ veiculo_id } = {}) {
  const val = []; const onde = ['v.ativo'];
  if (Number(veiculo_id)) { val.push(Number(veiculo_id)); onde.push(`p.veiculo_id = $${val.length}`); }
  const { rows } = await pool.query(
    `SELECT p.*, v.placa, v.descricao AS veiculo_descricao, v.km_atual FROM manutencao_planos p JOIN veiculos v ON v.id = p.veiculo_id
      WHERE ${onde.join(' AND ')} AND p.ativo ORDER BY v.placa, p.item`, val);
  const ordem = { vencido: 0, vencendo: 1, sem_base: 2, em_dia: 3 };
  return rows.map((p) => ({ ...p, ...situacaoPlano(p, p.km_atual) })).sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.placa.localeCompare(b.placa));
}

// Cria o plano num veículo ou em vários (veiculos: [ids]).
async function criarPlano(b) {
  const p = lerPlano(b);
  const ids = [...new Set((Array.isArray(b.veiculos) ? b.veiculos : [b.veiculo_id]).map(Number).filter(Boolean))];
  if (!ids.length) throw falha('Escolha o veículo.');
  const criados = [];
  for (const vid of ids) {
    const v = await veiculo(vid);
    // O mesmo item duas vezes no mesmo veículo só confunde: num veículo só, avisa; em vários, pula.
    const { rows: ja } = await pool.query('SELECT 1 FROM manutencao_planos WHERE veiculo_id = $1 AND LOWER(item) = LOWER($2) AND ativo', [vid, p.item]);
    if (ja[0]) { if (ids.length === 1) throw falha(`${v.placa} já tem "${p.item}" no plano.`, 409); continue; }
    const { rows } = await pool.query(
      `INSERT INTO manutencao_planos (veiculo_id, item, a_cada_km, a_cada_dias, aviso_km, aviso_dias, ultima_km, ultima_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [vid, p.item, p.a_cada_km, p.a_cada_dias, p.aviso_km, p.aviso_dias, p.ultima_km ?? (ids.length > 1 ? v.km_atual : null), p.ultima_data || (ids.length > 1 && v.km_atual != null ? hojeBr() : null)]);
    criados.push(rows[0]);
  }
  return criados;
}
async function alterarPlano(id, b) {
  const p = lerPlano(b);
  const { rows } = await pool.query(
    `UPDATE manutencao_planos SET item = $2, a_cada_km = $3, a_cada_dias = $4, aviso_km = $5, aviso_dias = $6, ultima_km = $7, ultima_data = $8, ativo = $9 WHERE id = $1 RETURNING *`,
    [id, p.item, p.a_cada_km, p.a_cada_dias, p.aviso_km, p.aviso_dias, p.ultima_km, p.ultima_data, p.ativo]);
  if (!rows[0]) throw falha('Plano não encontrado.', 404);
  return rows[0];
}
async function excluirPlano(id) { await pool.query('DELETE FROM manutencao_planos WHERE id = $1', [id]); }

// ======================= Painel (custo por km) =======================
async function painel({ de, ate } = {}) {
  const hoje = hojeBr();
  const fim = iso(ate) || hoje; const ini = iso(de) || `${fim.slice(0, 8)}01`;
  const { rows: veics } = await pool.query('SELECT * FROM veiculos WHERE ativo ORDER BY tipo, placa');
  const abast = await listarAbastecimentos({});
  const { rows: manut } = await pool.query(`SELECT * FROM manutencoes WHERE status = 'concluida' AND COALESCE(data_saida, data) BETWEEN $1::date AND $2::date`, [ini, fim]);
  const { rows: kms } = await pool.query(
    `SELECT veiculo_id, data, km FROM abastecimentos WHERE km IS NOT NULL UNION ALL SELECT veiculo_id, COALESCE(data_saida, data), km FROM manutencoes WHERE km IS NOT NULL AND status = 'concluida'`);
  const dentro = (d) => isoDe(d) >= ini && isoDe(d) <= fim;
  const linhas = veics.map((v) => {
    const ab = abast.filter((a) => a.veiculo_id === v.id && dentro(a.data));
    const ma = manut.filter((m) => m.veiculo_id === v.id);
    const meus = kms.filter((k) => k.veiculo_id === v.id);
    const noPeriodo = meus.filter((k) => dentro(k.data)).map((k) => Number(k.km));
    const antes = meus.filter((k) => isoDe(k.data) < ini).map((k) => Number(k.km));
    const kmFim = noPeriodo.length ? Math.max(...noPeriodo) : null;
    const kmIni = antes.length ? Math.max(...antes) : (noPeriodo.length ? Math.min(...noPeriodo) : null);
    const kmRodados = kmFim != null && kmIni != null ? Math.max(kmFim - kmIni, 0) : 0;
    const comConsumo = ab.filter((a) => a.consumo);
    const kmTrechos = comConsumo.reduce((s, a) => s + a.km_rodados, 0);
    const litrosTrechos = comConsumo.reduce((s, a) => s + a.litros_trecho, 0);
    const media = litrosTrechos ? Math.round((kmTrechos / litrosTrechos) * 100) / 100 : null;
    const combustivel = centavos(ab.reduce((s, a) => s + Number(a.valor_total), 0));
    const manutencao = centavos(ma.reduce((s, m) => s + Number(m.valor_total), 0));
    const ref = Number(v.consumo_referencia) || null;
    return {
      veiculo_id: v.id, placa: v.placa, descricao: v.descricao, tipo: v.tipo, km_atual: v.km_atual, consumo_referencia: ref,
      km_rodados: kmRodados, litros: Math.round(ab.filter((a) => a.combustivel !== 'arla32').reduce((s, a) => s + Number(a.litros), 0) * 10) / 10,
      consumo_medio: media, combustivel, manutencao, total: centavos(combustivel + manutencao),
      custo_km: kmRodados ? Math.round(((combustivel + manutencao) / kmRodados) * 1000) / 1000 : null,
      combustivel_km: kmRodados ? Math.round((combustivel / kmRodados) * 1000) / 1000 : null,
      alerta_consumo: !!(media && ref && media < ref * 0.85), abastecimentos: ab.length, manutencoes: ma.length,
    };
  });
  const planos = await listarPlanos({});
  const { rows: oficina } = await pool.query(
    `SELECT m.id, m.descricao, m.data, m.status, m.oficina_nome, v.placa FROM manutencoes m JOIN veiculos v ON v.id = m.veiculo_id
      WHERE m.status = 'em_andamento' OR (m.status = 'agendada' AND m.data <= $1::date + 7) ORDER BY m.status DESC, m.data`, [hoje]);
  const { rows: cnh } = await pool.query(
    `SELECT nome, cnh_validade FROM motoristas WHERE ativo AND cnh_validade IS NOT NULL AND cnh_validade <= $1::date + 30 ORDER BY cnh_validade`, [hoje]);
  const usados = linhas.filter((l) => l.total > 0 || l.km_rodados > 0);
  const tot = usados.reduce((s, l) => ({ km: s.km + l.km_rodados, combustivel: s.combustivel + l.combustivel, manutencao: s.manutencao + l.manutencao, litros: s.litros + l.litros }),
    { km: 0, combustivel: 0, manutencao: 0, litros: 0 });
  return {
    periodo: { de: ini, ate: fim }, veiculos: linhas,
    totais: { ...tot, combustivel: centavos(tot.combustivel), manutencao: centavos(tot.manutencao), total: centavos(tot.combustivel + tot.manutencao),
      custo_km: tot.km ? Math.round(((tot.combustivel + tot.manutencao) / tot.km) * 1000) / 1000 : null },
    alertas: {
      planos_vencidos: planos.filter((p) => p.situacao === 'vencido'), planos_vencendo: planos.filter((p) => p.situacao === 'vencendo'),
      oficina: oficina.map((o) => ({ ...o, status_texto: STATUS_MANUT[o.status] })), cnh: cnh.map((c) => ({ ...c, vencida: isoDe(c.cnh_validade) < hoje })),
      consumo: linhas.filter((l) => l.alerta_consumo),
    },
  };
}

module.exports = {
  COMBUSTIVEIS, PAGAMENTOS, STATUS_MANUT, MODELOS_PLANO, lerAbastecimento, criarAbastecimento, excluirAbastecimento, calcularConsumo, listarAbastecimentos,
  lerManutencao, criarManutencao, alterarManutencao, cancelarManutencao, excluirManutencao, listarManutencoes, lerPlano, situacaoPlano, listarPlanos, criarPlano,
  alterarPlano, excluirPlano, painel,
};
