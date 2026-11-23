// Pátio e portaria (embarcador): quem vem carregar (transportadora que coleta as notas) ou descarregar (recebimento)
// agenda uma janela, chega com o QR Code, entra na fila do pátio, é chamado para uma doca, opera e sai.
//   agendado → aguardando (check-in na portaria) → chamado (doca escolhida) → em_doca → liberado → saiu
//   (cancelado e nao_compareceu saem do fluxo; o check-in sem agendamento já entra como "aguardando").
// Alocação inteligente: a doca tem a operação (carga, descarga ou ambas) e os tipos de veículo que aceita; cada
// caminhão da fila vai para a doca compatível que fica livre primeiro, na ordem de prioridade (quem chegou dentro da
// janela agendada passa na frente de quem atrasou ou veio sem agendamento). O tempo de cada operação é a média real
// daquela doca nos últimos 60 dias (ou o padrão da doca). Com a alocação automática, quando uma doca fica livre o
// próximo da fila já é chamado. A mesma simulação dá a previsão do painel: quando cada um entra e sai da doca.
// Na saída de um carregamento, as notas da visita ganham a data de saída (fretes.data_saida).
const crypto = require('crypto');
const pool = require('./db');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O e 1/I
const novoCodigo = () => Array.from(crypto.randomBytes(8), (b) => ALFABETO[b % ALFABETO.length]).join('');
const OPERACOES = { carga: 'Carregamento', descarga: 'Descarga', outro: 'Outro (serviço, visita)' };
const VEICULOS = { utilitario: 'Utilitário / VUC', toco: 'Toco', truck: 'Truck', carreta: 'Carreta', bitrem: 'Bitrem / rodotrem', container: 'Contêiner' };
const STATUS = { agendado: 'Agendado', aguardando: 'No pátio (aguardando doca)', chamado: 'Chamado para a doca', em_doca: 'Em operação na doca', liberado: 'Liberado (indo para a saída)',
  saiu: 'Saiu', cancelado: 'Cancelado', nao_compareceu: 'Não compareceu' };
const NO_PATIO = ['aguardando', 'chamado', 'em_doca', 'liberado'];
const DESLOCAMENTO_MIN = 5;   // do chamado até encostar na doca
const texto = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const placaLimpa = (v) => (texto(v, 12) || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) || null;
const ms = (d) => (d ? new Date(d).getTime() : null);
const MIN = 60000;

// ======================= Regras (sem banco) =======================
function compativel(doca, v) {
  if (!doca.ativa) return false;
  if (v.operacao !== 'outro' && doca.operacao !== 'ambas' && doca.operacao !== v.operacao) return false;
  return !(doca.veiculos || []).length || !v.tipo_veiculo || doca.veiculos.includes(v.tipo_veiculo);
}
// Prioridade na fila: [grupo, hora]. Grupo 0: agendado que chegou até o fim da janela + tolerância (pela hora agendada);
// grupo 1: atrasado ou sem agendamento (pela hora de chegada).
function prioridade(v, tolMin) {
  const prev = ms(v.previsto_em); const cheg = ms(v.chegada_em) ?? Date.now();
  if (prev != null && !v.sem_agendamento && cheg <= prev + ((v.janela_min || 0) + tolMin) * MIN) return [0, prev];
  return [1, cheg];
}
const ordenarFila = (fila, tolMin) => [...fila].sort((a, b) => { const x = prioridade(a, tolMin); const y = prioridade(b, tolMin); return x[0] - y[0] || x[1] - y[1] || a.id - b.id; });
function minutosDe(v, doca, medias) {
  return Number(v.minutos_previstos) || medias?.[`${doca.id}|${v.operacao}`] || medias?.[`*|${v.operacao}`] || Number(doca.minutos_padrao) || 60;
}
// Simula o pátio a partir de agora. Devolve, por doca, quando fica livre e quem está nela; e, por visita da fila,
// a doca prevista, o início e o fim (e a espera).
function simular({ docas, visitas, agora = Date.now(), tolMin = 15, medias = {} }) {
  const livre = {}; const atual = {};
  const ativas = docas.filter((d) => d.ativa);
  for (const d of ativas) livre[d.id] = agora;
  for (const v of visitas) {
    const d = ativas.find((x) => x.id === v.doca_id);
    if (!d) continue;
    const min = minutosDe(v, d, medias);
    if (v.status === 'em_doca') {
      const fim = ms(v.inicio_doca_em) + min * MIN;
      livre[d.id] = Math.max(livre[d.id], fim > agora ? fim : agora + DESLOCAMENTO_MIN * MIN);
      atual[d.id] = { visita: v, fim_previsto: fim, atrasada: fim < agora };
    } else if (v.status === 'chamado') {
      const inicio = Math.max(agora, ms(v.chamado_em) + DESLOCAMENTO_MIN * MIN);
      livre[d.id] = Math.max(livre[d.id], inicio + min * MIN);
      atual[d.id] = { visita: v, fim_previsto: inicio + min * MIN, chamado: true };
    }
  }
  const previsoes = {};
  for (const v of ordenarFila(visitas.filter((x) => x.status === 'aguardando'), tolMin)) {
    const cands = ativas.filter((d) => compativel(d, v));
    if (!cands.length) { previsoes[v.id] = { sem_doca: true }; continue; }
    cands.sort((a, b) => livre[a.id] - livre[b.id] || (a.ordem || 0) - (b.ordem || 0) || a.id - b.id);
    const d = cands[0];
    const inicio = livre[d.id]; const min = minutosDe(v, d, medias);
    previsoes[v.id] = { doca_id: d.id, doca: d.nome, inicio, fim: inicio + min * MIN, espera_min: Math.max(0, Math.round((inicio - agora) / MIN)), minutos: min, livre_agora: inicio <= agora };
    livre[d.id] = inicio + min * MIN;
  }
  return { livre, atual, previsoes };
}

// ======================= Banco =======================
async function config() {
  const { rows: [c] } = await pool.query('SELECT * FROM patio_config WHERE id = 1');
  return c || { alocacao_automatica: true, tolerancia_min: 15, nao_compareceu_min: 240 };
}
async function salvarConfig(b) {
  const n = (v, a, z, p) => Math.min(z, Math.max(a, parseInt(v, 10) || p));
  await pool.query(`UPDATE patio_config SET alocacao_automatica = $1, tolerancia_min = $2, nao_compareceu_min = $3, atualizado_em = NOW() WHERE id = 1`,
    [b.alocacao_automatica !== false, n(b.tolerancia_min, 0, 240, 15), n(b.nao_compareceu_min, 30, 1440, 240)]);
  return config();
}
async function docas({ todas = false } = {}) {
  const { rows } = await pool.query(`SELECT * FROM patio_docas ${todas ? '' : 'WHERE ativa'} ORDER BY ordem, nome`);
  return rows;
}
async function salvarDoca(id, b) {
  const nome = texto(b.nome, 40);
  if (!nome) throw falha('Informe o nome da doca.');
  const operacao = ['carga', 'descarga', 'ambas'].includes(b.operacao) ? b.operacao : 'ambas';
  const veiculos = (Array.isArray(b.veiculos) ? b.veiculos : []).filter((x) => VEICULOS[x]);
  const minutos = Math.min(720, Math.max(5, parseInt(b.minutos_padrao, 10) || 60));
  const vals = [nome, operacao, veiculos, minutos, parseInt(b.ordem, 10) || 0, b.ativa !== false, texto(b.observacao, 300)];
  if (id) {
    const { rows: [d] } = await pool.query(`UPDATE patio_docas SET nome = $1, operacao = $2, veiculos = $3, minutos_padrao = $4, ordem = $5, ativa = $6, observacao = $7 WHERE id = $8 RETURNING *`, [...vals, id]);
    if (!d) throw falha('Doca não encontrada.', 404);
    return d;
  }
  const { rows: [d] } = await pool.query(`INSERT INTO patio_docas (nome, operacao, veiculos, minutos_padrao, ordem, ativa, observacao) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, vals);
  return d;
}
async function excluirDoca(id) {
  const { rows: [u] } = await pool.query(`SELECT COUNT(*)::int AS n FROM patio_visitas WHERE doca_id = $1`, [id]);
  if (u.n) { await pool.query('UPDATE patio_docas SET ativa = FALSE WHERE id = $1', [id]); return { desativada: true }; }
  await pool.query('DELETE FROM patio_docas WHERE id = $1', [id]);
  return { excluida: true };
}
// Tempo médio real de operação (início → fim na doca) dos últimos 60 dias, por doca e por operação (mínimo 3 visitas).
async function medias() {
  const { rows } = await pool.query(`SELECT COALESCE(doca_id::text, '*') AS doca, operacao, ROUND(AVG(EXTRACT(EPOCH FROM fim_doca_em - inicio_doca_em) / 60))::int AS min, COUNT(*)::int AS n
    FROM patio_visitas WHERE fim_doca_em IS NOT NULL AND inicio_doca_em IS NOT NULL AND fim_doca_em > inicio_doca_em AND fim_doca_em >= NOW() - INTERVAL '60 days'
    GROUP BY GROUPING SETS ((doca_id, operacao), (operacao))`);
  const m = {};
  rows.filter((r) => r.n >= 3 && r.min > 0).forEach((r) => { m[`${r.doca}|${r.operacao}`] = r.min; });
  return m;
}
async function evento(cliente, visitaId, tipo, detalhe, usuario) {
  await cliente.query('INSERT INTO patio_eventos (visita_id, tipo, detalhe, usuario_nome) VALUES ($1, $2, $3, $4)', [visitaId, tipo, detalhe || null, usuario || null]);
}

const CAMPOS_VISITA = `v.*, d.nome AS doca_nome,
  to_char(v.previsto_em, 'YYYY-MM-DD"T"HH24:MI') AS previsto_local`;
async function visita(id) {
  const { rows: [v] } = await pool.query(`SELECT ${CAMPOS_VISITA} FROM patio_visitas v LEFT JOIN patio_docas d ON d.id = v.doca_id WHERE v.id = $1`, [id]);
  if (!v) throw falha('Visita não encontrada.', 404);
  return v;
}
// Lista do dia (ou de um período), com os filtros da tela.
async function listar(q = {}) {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.data || '') ? q.data : null;
  const params = []; const cond = [];
  if (dia) { params.push(dia); cond.push(`(v.previsto_em::date = $${params.length}::date OR v.chegada_em::date = $${params.length}::date OR (v.status = ANY('{aguardando,chamado,em_doca,liberado}') AND $${params.length}::date = CURRENT_DATE))`); }
  if (q.status && STATUS[q.status]) { params.push(q.status); cond.push(`v.status = $${params.length}`); }
  if (String(q.busca || '').trim()) {
    params.push(`%${String(q.busca).trim()}%`);
    cond.push(`(v.placa ILIKE $${params.length} OR v.transportadora ILIKE $${params.length} OR v.motorista_nome ILIKE $${params.length} OR v.codigo ILIKE $${params.length} OR array_to_string(v.notas, ',') ILIKE $${params.length})`);
  }
  const { rows } = await pool.query(`SELECT ${CAMPOS_VISITA} FROM patio_visitas v LEFT JOIN patio_docas d ON d.id = v.doca_id
    ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY COALESCE(v.previsto_em, v.chegada_em) NULLS LAST, v.id LIMIT 1000`, params);
  return rows;
}

// Notas para a visita: pelo número (as mais recentes, sem as canceladas). Devolve os números achados e os ids.
async function notasDaVisita(req, numeros) {
  const lista = [...new Set((numeros || []).map((n) => String(n).replace(/\D/g, '').replace(/^0+(?=\d)/, '')).filter(Boolean))].slice(0, 200);
  if (!lista.length) return { notas: [], ids: [], achadas: [] };
  const { consultaCliente } = require('./permissoes');
  const { rows } = await consultaCliente(req, `SELECT DISTINCT ON (LTRIM(f.numero_nf, '0')) f.id, LTRIM(f.numero_nf, '0') AS numero, f.cliente, f.cidade, f.uf, f.qtd_volumes, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso,
      COALESCE(f.transportadora_cte, f.transportadora, f.transportadora_nfe) AS transportadora, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, f.data_saida
    FROM fretes f WHERE f.frete_principal_id IS NULL AND f.nf_cancelada IS NOT TRUE AND LTRIM(f.numero_nf, '0') = ANY($1::text[])
    ORDER BY LTRIM(f.numero_nf, '0'), f.data_emissao_nf DESC NULLS LAST, f.id DESC`, [lista]);
  return { notas: lista, ids: rows.map((r) => r.id), achadas: rows, faltam: lista.filter((n) => !rows.some((r) => r.numero === n)) };
}

function dadosDaVisita(b) {
  const operacao = OPERACOES[b.operacao] ? b.operacao : 'carga';
  const previsto = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(b.previsto_em || '')) ? String(b.previsto_em).slice(0, 16) : null;
  return {
    operacao, previsto_em: previsto, janela_min: Math.min(720, Math.max(0, parseInt(b.janela_min ?? 60, 10) || 0)),
    transportadora: texto(b.transportadora, 160), fornecedor: texto(b.fornecedor, 160), placa: placaLimpa(b.placa), placa_carreta: placaLimpa(b.placa_carreta),
    tipo_veiculo: VEICULOS[b.tipo_veiculo] ? b.tipo_veiculo : null, motorista_nome: texto(b.motorista_nome, 120), motorista_documento: texto(b.motorista_documento, 20),
    motorista_telefone: texto(b.motorista_telefone, 20), pedido: texto(b.pedido, 60), volumes: parseInt(b.volumes, 10) || null,
    peso_kg: Number(String(b.peso_kg ?? '').replace(',', '.')) || null, minutos_previstos: parseInt(b.minutos_previstos, 10) || null, observacao: texto(b.observacao, 2000),
  };
}
const COLS = ['operacao', 'previsto_em', 'janela_min', 'transportadora', 'fornecedor', 'placa', 'placa_carreta', 'tipo_veiculo', 'motorista_nome', 'motorista_documento',
  'motorista_telefone', 'pedido', 'volumes', 'peso_kg', 'minutos_previstos', 'observacao'];

// Agendar (ou check-in sem agendamento: semAgendamento = true, já entra no pátio).
async function criar(req, b, usuario, { semAgendamento = false } = {}) {
  const d = dadosDaVisita(b);
  if (!semAgendamento && !d.previsto_em) throw falha('Informe a data e a hora previstas.');
  if (!d.placa && !d.transportadora && !d.fornecedor) throw falha('Informe a placa, a transportadora ou o fornecedor.');
  const n = await notasDaVisita(req, String(b.notas || '').split(/[\s,;]+/));
  // Peso e volumes das notas, quando não foram informados.
  if (n.achadas.length) {
    if (!d.volumes) d.volumes = n.achadas.reduce((s, x) => s + (Number(x.qtd_volumes) || 0), 0) || null;
    if (!d.peso_kg) d.peso_kg = Math.round(n.achadas.reduce((s, x) => s + (Number(x.peso) || 0), 0) * 100) / 100 || null;
    if (!d.transportadora && d.operacao === 'carga') d.transportadora = n.achadas.find((x) => x.transportadora)?.transportadora || null;
  }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    let codigo = novoCodigo();
    while ((await cliente.query('SELECT 1 FROM patio_visitas WHERE codigo = $1', [codigo])).rows.length) codigo = novoCodigo();
    const vals = COLS.map((c) => d[c]);
    const { rows: [v] } = await cliente.query(`INSERT INTO patio_visitas (${COLS.join(', ')}, codigo, notas, frete_ids, sem_agendamento, status, chegada_em, criado_por_nome)
      VALUES (${COLS.map((_, i) => `$${i + 1}`).join(', ')}, $${COLS.length + 1}, $${COLS.length + 2}, $${COLS.length + 3}, $${COLS.length + 4}, $${COLS.length + 5}, $${COLS.length + 6}, $${COLS.length + 7}) RETURNING id`,
    [...vals, codigo, n.notas, n.ids, semAgendamento, semAgendamento ? 'aguardando' : 'agendado', semAgendamento ? new Date() : null, usuario]);
    await evento(cliente, v.id, semAgendamento ? 'checkin' : 'agendado', semAgendamento ? 'Entrada sem agendamento' : `Agendado para ${d.previsto_em.replace('T', ' ')}`, usuario);
    await cliente.query('COMMIT');
    if (semAgendamento) await alocarFila(usuario).catch(() => {});
    return { ...(await visita(v.id)), notas_faltando: n.faltam };
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}
async function atualizar(req, id, b, usuario) {
  const atual = await visita(id);
  if (['saiu', 'cancelado'].includes(atual.status)) throw falha('Esta visita já foi encerrada.', 409);
  const d = dadosDaVisita({ ...atual, previsto_em: atual.previsto_local, ...b });
  const n = b.notas !== undefined ? await notasDaVisita(req, String(b.notas || '').split(/[\s,;]+/)) : { notas: atual.notas, ids: atual.frete_ids, faltam: [] };
  await pool.query(`UPDATE patio_visitas SET ${COLS.map((c, i) => `${c} = $${i + 1}`).join(', ')}, notas = $${COLS.length + 1}, frete_ids = $${COLS.length + 2}, atualizado_em = NOW() WHERE id = $${COLS.length + 3}`,
    [...COLS.map((c) => d[c]), n.notas, n.ids, id]);
  await evento(pool, id, 'alterado', 'Dados da visita alterados', usuario);
  return { ...(await visita(id)), notas_faltando: n.faltam };
}

// Muda o status conferindo de onde pode sair.
async function mudar(id, de, para, extra, tipo, detalhe, usuario) {
  const cols = Object.keys(extra);
  const { rows: [v] } = await pool.query(`UPDATE patio_visitas SET status = $2, ${cols.map((c, i) => `${c} = $${i + 4}`).join(', ')}${cols.length ? ', ' : ''}atualizado_em = NOW()
    WHERE id = $1 AND status = ANY($3::text[]) RETURNING id`, [id, para, de, ...cols.map((c) => extra[c])]);
  if (!v) {
    const atual = await visita(id);
    throw falha(`Não dá: a visita está "${STATUS[atual.status] || atual.status}".`, 409);
  }
  await evento(pool, id, tipo, detalhe, usuario);
  return visita(id);
}

// Check-in na portaria: pelo código do QR (ou o link), ou pela placa de um agendamento de hoje.
async function checkin(req, b, usuario) {
  const bruto = String(b.codigo || '').trim();
  const codigo = (bruto.match(/[?&]c=([A-Z0-9]{8})/i)?.[1] || bruto.replace(/^NEXOPATIO[:-]?/i, '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let v = null;
  if (codigo.length === 8) v = (await pool.query('SELECT id, status FROM patio_visitas WHERE codigo = $1', [codigo])).rows[0];
  if (!v) {
    const placa = placaLimpa(b.placa || (codigo.length === 7 ? codigo : ''));
    if (placa) {
      v = (await pool.query(`SELECT id, status FROM patio_visitas WHERE placa = $1 AND status = 'agendado' AND previsto_em::date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1
        ORDER BY ABS(EXTRACT(EPOCH FROM previsto_em - NOW())) LIMIT 1`, [placa])).rows[0];
    }
  }
  if (!v) throw falha('Nenhum agendamento com esse código ou placa (de ontem a amanhã). Faça a entrada sem agendamento.', 404);
  if (v.status !== 'agendado') {
    const a = await visita(v.id);
    return { ...a, ja_estava: true };
  }
  const extra = { chegada_em: new Date() };
  if (b.placa) extra.placa = placaLimpa(b.placa);
  if (b.lacre) extra.lacre = texto(b.lacre, 60);
  const r = await mudar(v.id, ['agendado'], 'aguardando', extra, 'checkin', 'Entrada na portaria', usuario);
  await alocarFila(usuario).catch(() => {});
  return visita(r.id);
}

// Chamar para a doca: a escolhida ou a sugerida pela alocação.
async function chamar(id, docaId, usuario) {
  const [ds, vs, cfg, med] = await Promise.all([docas(), emAndamento(), config(), medias()]);
  const v = vs.find((x) => x.id === Number(id));
  if (!v) throw falha('A visita não está no pátio.', 409);
  let doca = docaId ? ds.find((d) => d.id === Number(docaId)) : null;
  if (docaId && !doca) throw falha('Doca não encontrada ou inativa.');
  if (!doca) {
    const sim = simular({ docas: ds, visitas: vs, tolMin: cfg.tolerancia_min, medias: med });
    const p = sim.previsoes[v.id];
    if (!p || p.sem_doca) throw falha('Nenhuma doca aceita esta operação ou este veículo. Cadastre ou ajuste as docas.');
    doca = ds.find((d) => d.id === p.doca_id);
  }
  const ocupada = vs.find((x) => x.doca_id === doca.id && ['chamado', 'em_doca'].includes(x.status) && x.id !== v.id);
  if (ocupada && !docaId) throw falha(`A ${doca.nome} ainda está ocupada (${ocupada.placa || ocupada.codigo}).`, 409);
  return mudar(v.id, ['aguardando', 'chamado'], 'chamado', { doca_id: doca.id, chamado_em: new Date() }, 'chamado',
    `Chamado para a ${doca.nome}${ocupada ? ` (ainda ocupada por ${ocupada.placa || ocupada.codigo})` : ''}`, usuario);
}
const iniciar = (id, usuario) => mudar(id, ['chamado', 'aguardando'], 'em_doca', { inicio_doca_em: new Date() }, 'inicio', 'Início da operação na doca', usuario);
async function finalizar(id, b, usuario) {
  const v = await mudar(id, ['em_doca'], 'liberado', { fim_doca_em: new Date(), ...(b?.lacre ? { lacre: texto(b.lacre, 60) } : {}) }, 'fim', `Fim da operação${b?.lacre ? ` · lacre ${b.lacre}` : ''}`, usuario);
  await alocarFila(usuario).catch(() => {});
  return v;
}
// Saída pela portaria. Carregamento: as notas da visita ganham a data de saída.
async function saida(id, usuario) {
  const v = await mudar(id, ['liberado', 'em_doca', 'chamado', 'aguardando'], 'saiu', { saida_em: new Date() }, 'saida', 'Saída pela portaria', usuario);
  if (v.operacao === 'carga' && (v.frete_ids || []).length) {
    await pool.query(`UPDATE fretes SET data_saida = COALESCE(data_saida, $2::date), atualizado_em = NOW() WHERE id = ANY($1::int[])`, [v.frete_ids, new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)]);
  }
  if (v.fim_doca_em == null && v.inicio_doca_em) await pool.query('UPDATE patio_visitas SET fim_doca_em = saida_em WHERE id = $1', [id]);
  await alocarFila(usuario).catch(() => {});
  return visita(id);
}
const cancelar = (id, motivo, usuario) => mudar(id, ['agendado', 'aguardando', 'chamado'], 'cancelado', { motivo_cancelamento: texto(motivo, 300) }, 'cancelado', motivo ? `Cancelado: ${motivo}` : 'Cancelado', usuario);
const naoCompareceu = (id, usuario) => mudar(id, ['agendado'], 'nao_compareceu', {}, 'nao_compareceu', 'Não compareceu', usuario);
async function voltarFila(id, usuario) {
  const v = await mudar(id, ['chamado'], 'aguardando', { doca_id: null, chamado_em: null }, 'devolvido', 'Voltou para a fila', usuario);
  await alocarFila(usuario).catch(() => {});
  return v;
}

async function emAndamento() {
  const { rows } = await pool.query(`SELECT ${CAMPOS_VISITA} FROM patio_visitas v LEFT JOIN patio_docas d ON d.id = v.doca_id WHERE v.status = ANY($1::text[]) ORDER BY v.chegada_em, v.id`, [NO_PATIO]);
  return rows;
}

// Alocação automática: cada doca livre agora chama o próximo compatível da fila.
let alocando = false;
async function alocarFila(usuario = 'Alocação automática') {
  if (alocando) return [];
  alocando = true;
  try {
    const cfg = await config();
    if (!cfg.alocacao_automatica) return [];
    const [ds, vs, med] = await Promise.all([docas(), emAndamento(), medias()]);
    const sim = simular({ docas: ds, visitas: vs, tolMin: cfg.tolerancia_min, medias: med });
    const ocupadas = new Set(vs.filter((v) => ['chamado', 'em_doca'].includes(v.status)).map((v) => v.doca_id));
    const chamados = [];
    for (const [vid, p] of Object.entries(sim.previsoes)) {
      if (!p.livre_agora || ocupadas.has(p.doca_id)) continue;
      ocupadas.add(p.doca_id);
      await mudar(Number(vid), ['aguardando'], 'chamado', { doca_id: p.doca_id, chamado_em: new Date() }, 'chamado', `Chamado automaticamente para a ${p.doca}`, usuario).catch(() => null);
      chamados.push(Number(vid));
    }
    return chamados;
  } finally { alocando = false; }
}

// Painel em tempo real: docas, fila com a previsão, próximas chegadas e os números do dia.
async function painel() {
  const agora = Date.now();
  const [ds, vs, cfg, med] = await Promise.all([docas(), emAndamento(), config(), medias()]);
  const sim = simular({ docas: ds, visitas: vs, agora, tolMin: cfg.tolerancia_min, medias: med });
  const { rows: proximas } = await pool.query(`SELECT ${CAMPOS_VISITA} FROM patio_visitas v LEFT JOIN patio_docas d ON d.id = v.doca_id
    WHERE v.status = 'agendado' AND v.previsto_em < NOW() + INTERVAL '24 hours' AND v.previsto_em > NOW() - INTERVAL '24 hours' ORDER BY v.previsto_em LIMIT 200`);
  const { rows: [ind] } = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE previsto_em::date = CURRENT_DATE AND NOT sem_agendamento AND status <> 'cancelado')::int AS agendados_hoje,
      COUNT(*) FILTER (WHERE chegada_em::date = CURRENT_DATE)::int AS chegaram_hoje,
      COUNT(*) FILTER (WHERE saida_em::date = CURRENT_DATE)::int AS sairam_hoje,
      COUNT(*) FILTER (WHERE chegada_em::date = CURRENT_DATE AND sem_agendamento)::int AS sem_agendamento_hoje,
      COUNT(*) FILTER (WHERE previsto_em::date = CURRENT_DATE AND NOT sem_agendamento AND chegada_em IS NOT NULL)::int AS agendados_chegaram,
      COUNT(*) FILTER (WHERE previsto_em::date = CURRENT_DATE AND NOT sem_agendamento AND chegada_em <= previsto_em + ((janela_min + $1) || ' minutes')::interval)::int AS pontuais,
      COUNT(*) FILTER (WHERE status = 'nao_compareceu' AND previsto_em::date = CURRENT_DATE)::int AS nao_compareceram,
      ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM COALESCE(inicio_doca_em, chamado_em) - chegada_em) / 60)) FILTER (WHERE chegada_em::date = CURRENT_DATE AND COALESCE(inicio_doca_em, chamado_em) IS NOT NULL))::int AS espera_media,
      ROUND(AVG(EXTRACT(EPOCH FROM fim_doca_em - inicio_doca_em) / 60) FILTER (WHERE fim_doca_em::date = CURRENT_DATE))::int AS doca_media,
      ROUND(AVG(EXTRACT(EPOCH FROM saida_em - chegada_em) / 60) FILTER (WHERE saida_em::date = CURRENT_DATE AND chegada_em IS NOT NULL))::int AS permanencia_media
    FROM patio_visitas`, [String(cfg.tolerancia_min)]);
  const tol = cfg.tolerancia_min;
  const situacaoChegada = (v) => {
    const prev = ms(v.previsto_em); const fim = prev + ((v.janela_min || 0) + tol) * MIN;
    if (agora > prev + cfg.nao_compareceu_min * MIN) return 'nao_compareceu';
    if (agora > fim) return 'atrasado';
    if (agora >= prev - 15 * MIN) return 'chegando';
    return 'previsto';
  };
  const fila = ordenarFila(vs.filter((v) => v.status === 'aguardando'), tol).map((v, i) => ({ ...v, posicao: i + 1, previsao: sim.previsoes[v.id] || null,
    espera_ate_agora: Math.round((agora - ms(v.chegada_em)) / MIN), prioridade: prioridade(v, tol)[0] === 0 ? 'na_janela' : v.sem_agendamento ? 'sem_agendamento' : 'atrasado' }));
  return {
    agora: new Date(agora).toISOString(), config: cfg,
    docas: ds.map((d) => {
      const a = sim.atual[d.id];
      const prox = fila.find((f) => f.previsao?.doca_id === d.id);
      return { ...d, estado: a ? (a.chamado ? 'chamado' : 'ocupada') : 'livre', visita: a?.visita || null, fim_previsto: a ? new Date(a.fim_previsto).toISOString() : null,
        atrasada: !!a?.atrasada, minutos_em_doca: a?.visita?.inicio_doca_em ? Math.round((agora - ms(a.visita.inicio_doca_em)) / MIN) : null,
        livre_em: new Date(sim.livre[d.id] ?? agora).toISOString(), proximo: prox ? { id: prox.id, placa: prox.placa, codigo: prox.codigo } : null, media_min: med[`${d.id}|carga`] || med[`${d.id}|descarga`] || null };
    }),
    fila: fila.map((v) => ({ ...v, previsao: v.previsao ? { ...v.previsao, inicio: v.previsao.inicio ? new Date(v.previsao.inicio).toISOString() : null, fim: v.previsao.fim ? new Date(v.previsao.fim).toISOString() : null } : null })),
    liberados: vs.filter((v) => v.status === 'liberado'),
    proximas: proximas.map((v) => ({ ...v, situacao_chegada: situacaoChegada(v) })),
    indicadores: { ...ind, no_patio: vs.length, aguardando: fila.length, em_doca: vs.filter((v) => v.status === 'em_doca').length, chamados: vs.filter((v) => v.status === 'chamado').length,
      docas_livres: ds.filter((d) => !sim.atual[d.id]).length, docas: ds.length, pontualidade: ind.agendados_chegaram ? ind.pontuais / ind.agendados_chegaram : null,
      espera_prevista_max: fila.reduce((m, f) => Math.max(m, f.previsao?.espera_min || 0), 0) },
  };
}

// Kanban gerencial dos veículos (aba Kanban, tela 426): uma coluna por etapa, com o tempo de cada um na etapa e o alerta
// de quem passou do tempo: agendado (próximas 24 h e os atrasados), aguardando doca, chamado, na doca, liberado, saiu hoje.
const LIMITES_MIN = { aguardando: 60, chamado: 15, liberado: 20 };
function etapaKanban(v, agora, { tolMin = 15, naoCompareceuMin = 240, minutosDoca = 60 } = {}) {
  const desde = { agendado: v.previsto_em, aguardando: v.chegada_em, chamado: v.chamado_em, em_doca: v.inicio_doca_em, liberado: v.fim_doca_em, saiu: v.chegada_em }[v.status];
  const fim = v.status === 'saiu' ? ms(v.saida_em) : agora;
  const minutos = desde ? Math.round((fim - ms(desde)) / MIN) : null;
  let alerta = null;
  if (v.status === 'agendado') {
    if (minutos > naoCompareceuMin) alerta = 'Não veio';
    else if (minutos > (v.janela_min || 0) + tolMin) alerta = 'Atrasado';
  } else if (v.status === 'em_doca') { if (minutos > (v.minutos_previstos || minutosDoca)) alerta = 'Passou do tempo na doca'; }
  else if (LIMITES_MIN[v.status] && minutos > LIMITES_MIN[v.status]) alerta = { aguardando: 'Esperando há muito tempo', chamado: 'Chamado e não encostou', liberado: 'Ainda não saiu' }[v.status];
  return { minutos, alerta };
}
async function kanban() {
  const agora = Date.now();
  const [cfg, med] = await Promise.all([config(), medias()]);
  const { rows } = await pool.query(`SELECT ${CAMPOS_VISITA}, d.minutos_padrao FROM patio_visitas v LEFT JOIN patio_docas d ON d.id = v.doca_id
    WHERE (v.status = 'agendado' AND v.previsto_em < NOW() + INTERVAL '24 hours' AND v.previsto_em > NOW() - INTERVAL '24 hours')
       OR v.status IN ('aguardando', 'chamado', 'em_doca', 'liberado') OR (v.status = 'saiu' AND v.saida_em::date = CURRENT_DATE)
    ORDER BY COALESCE(v.chegada_em, v.previsto_em) LIMIT 500`);
  const COLUNAS = ['agendado', 'aguardando', 'chamado', 'em_doca', 'liberado', 'saiu'];
  const cartoes = rows.map((v) => {
    const md = (v.doca_id && (med[`${v.doca_id}|${v.operacao}`] || v.minutos_padrao)) || 60;
    return { id: v.id, codigo: v.codigo, status: v.status, operacao: v.operacao, placa: v.placa, transportadora: v.transportadora, fornecedor: v.fornecedor, motorista: v.motorista_nome,
      doca: v.doca_nome, notas: v.notas || [], volumes: v.volumes, previsto_em: v.previsto_em, chegada_em: v.chegada_em, saida_em: v.saida_em, sem_agendamento: v.sem_agendamento,
      ...etapaKanban(v, agora, { tolMin: cfg.tolerancia_min, naoCompareceuMin: cfg.nao_compareceu_min, minutosDoca: md }) };
  });
  const colunas = COLUNAS.map((c) => {
    const cs = cartoes.filter((k) => k.status === c);
    const com = cs.filter((k) => k.minutos != null && (c !== 'agendado' || k.minutos > 0));
    return { chave: c, titulo: c === 'saiu' ? 'Saiu hoje' : STATUS[c], total: cs.length, alertas: cs.filter((k) => k.alerta).length,
      media_min: c === 'agendado' ? null : com.length ? Math.round(com.reduce((t, k) => t + k.minutos, 0) / com.length) : null, cartoes: cs };
  });
  return { agora: new Date(agora).toISOString(), colunas };
}

// Página do motorista (pelo código): sem dados internos, só o que ele precisa ver.
async function publico(codigo) {
  const c = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { rows: [v] } = await pool.query(`SELECT v.id, v.codigo, v.status, v.operacao, v.placa, v.previsto_em, v.janela_min, v.chegada_em, v.chamado_em, v.inicio_doca_em, v.fim_doca_em, v.saida_em,
      v.motorista_nome, d.nome AS doca FROM patio_visitas v LEFT JOIN patio_docas d ON d.id = v.doca_id WHERE v.codigo = $1`, [c]);
  if (!v) throw falha('Código não encontrado.', 404);
  const { rows: [emp] } = await pool.query('SELECT nome_fantasia, razao_social FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
  let posicao = null; let previsao = null;
  if (v.status === 'aguardando') {
    const p = await painel();
    const f = p.fila.find((x) => x.id === v.id);
    posicao = f?.posicao ?? null; previsao = f?.previsao ? { inicio: f.previsao.inicio, espera_min: f.previsao.espera_min, doca: f.previsao.doca } : null;
  }
  return { codigo: v.codigo, status: v.status, status_txt: STATUS[v.status], operacao: OPERACOES[v.operacao], placa: v.placa, previsto_em: v.previsto_em, janela_min: v.janela_min,
    doca: ['chamado', 'em_doca'].includes(v.status) ? v.doca : null, chegada_em: v.chegada_em, saida_em: v.saida_em, motorista: v.motorista_nome ? v.motorista_nome.split(' ')[0] : null,
    posicao, previsao, empresa: emp?.nome_fantasia || emp?.razao_social || '' };
}
async function eventos(id) {
  const { rows } = await pool.query('SELECT tipo, detalhe, usuario_nome, em FROM patio_eventos WHERE visita_id = $1 ORDER BY em, id', [id]);
  return rows;
}

module.exports = { kanban, etapaKanban, OPERACOES, VEICULOS, STATUS, compativel, prioridade, ordenarFila, simular, config, salvarConfig, docas, salvarDoca, excluirDoca, medias, visita, listar,
  notasDaVisita, criar, atualizar, checkin, chamar, iniciar, finalizar, saida, cancelar, naoCompareceu, voltarFila, alocarFila, painel, publico, eventos, novoCodigo };
