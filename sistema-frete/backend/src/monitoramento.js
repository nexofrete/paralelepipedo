// Monitoramento de veículos (estilo SSW): o app do motorista manda a posição do
// celular enquanto o romaneio está em rota. Aqui ficam o mapa da frota, a
// previsão de chegada em cada entrega que falta (pela distância e a velocidade
// média, mais o tempo de descarga) e os alertas: parado fora de um cliente,
// sem sinal, fora da rota planejada e entrega que vai chegar depois do prazo.
const pool = require('./db');
const { distanciaKm } = require('./roteirizacao/municipios');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const CONFIG_PADRAO = { intervalo_s: 60, parada_min: 30, sem_sinal_min: 20, desvio_km: 3, atendimento_min: 15, guardar_dias: 90 };
const LIMITES = { intervalo_s: [20, 600], parada_min: [5, 240], sem_sinal_min: [5, 240], desvio_km: [0.5, 50], atendimento_min: [0, 180], guardar_dias: [7, 730] };
const RAIO_PARADO_KM = 0.3;   // andou menos que isso: está parado
const RAIO_CLIENTE_KM = 0.5;  // tão perto de uma entrega: está no cliente

async function config() {
  const { rows } = await pool.query('SELECT monitor_config FROM empresa WHERE id = 1');
  return { ...CONFIG_PADRAO, ...(rows[0]?.monitor_config || {}) };
}
async function salvarConfig(b = {}) {
  const atual = await config();
  const c = Object.fromEntries(Object.entries(LIMITES).map(([k, [min, max]]) => {
    const n = Number(String(b[k] ?? '').replace(',', '.'));
    return [k, Number.isFinite(n) && n >= min && n <= max ? n : atual[k]];
  }));
  await pool.query('UPDATE empresa SET monitor_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return c;
}

// ---------- Regras (sem banco) ----------
// Distância (km) de um ponto até a linha da rota (lista de [lat, lon]).
function distanciaAteLinha(p, linha) {
  if (!linha?.length) return null;
  if (linha.length === 1) return distanciaKm(p, { lat: linha[0][0], lon: linha[0][1] });
  // Projeção plana local (bom para poucos km): x = lon·cos(lat), y = lat, em km.
  const k = 111.32; const cos = Math.cos((p.lat * Math.PI) / 180);
  const xy = (lat, lon) => [(lon - p.lon) * k * cos, (lat - p.lat) * k];
  let menor = Infinity;
  for (let i = 1; i < linha.length; i += 1) {
    const [ax, ay] = xy(linha[i - 1][0], linha[i - 1][1]); const [bx, by] = xy(linha[i][0], linha[i][1]);
    const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    menor = Math.min(menor, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return Math.round(menor * 100) / 100;
}
// Desde quando está parado: posições da mais nova para a mais antiga; volta enquanto
// todas ficam perto da última. Devolve o horário (ms) da mais antiga do trecho parado.
function paradoDesde(posicoes, raioKm = RAIO_PARADO_KM) {
  if (!posicoes.length) return null;
  const ultima = posicoes[0];
  let desde = new Date(ultima.registrado_em).getTime();
  for (const p of posicoes.slice(1)) {
    if (distanciaKm(ultima, p) > raioKm) break;
    desde = new Date(p.registrado_em).getTime();
  }
  return desde;
}
// Tempo de viagem (min) pela distância: ruas não são em linha reta (× 1,3) e a velocidade cai na cidade.
function minutosAte(a, b, velocidade = 55) {
  const km = distanciaKm(a, b) * 1.3;
  if (km < 0.2) return 0;
  const vel = km < 10 ? 25 : km < 50 ? 40 : velocidade;
  return Math.round((km / vel) * 60 + 3);
}
// Chegada prevista (ms) em cada parada que falta, na ordem, a partir da posição atual.
function estimarChegadas(origem, agoraMs, paradas, { atendimento_min: atend = 15, velocidade = 55 } = {}) {
  let t = agoraMs; let de = origem;
  return paradas.map((p, i) => {
    if (!p.lat) return null;
    t += minutosAte(de, p, velocidade) * 60000;
    const chegada = t;
    t += (i < paradas.length - 1 ? atend : 0) * 60000;
    de = p;
    return chegada;
  });
}
const diaBrasilia = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
// DATE do banco (Date à meia-noite de Brasília) ou texto → "AAAA-MM-DD".
const diaDe = (v) => (!v ? null : v instanceof Date ? diaBrasilia(v.getTime()) : String(v).slice(0, 10));
// A chegada prevista passa do combinado? (janela do agendamento ou o dia da previsão)
function atrasoPrevisto(chegadaMs, { agendamento, previsao }) {
  if (!chegadaMs) return null;
  if (agendamento?.data) {
    const limite = Date.parse(`${agendamento.data}T${agendamento.hora_ate || '23:59'}:00-03:00`);
    if (chegadaMs > limite) return `chega depois do agendamento (${agendamento.data.split('-').reverse().join('/')}${agendamento.hora_ate ? ` até ${agendamento.hora_ate}` : ''})`;
    return null;
  }
  const prev = diaDe(previsao);
  // Já atrasada (a previsão passou) aparece em Entregas atrasadas; aqui só a que vai atrasar por causa da rota.
  if (prev && prev >= diaBrasilia(Date.now()) && diaBrasilia(chegadaMs) > prev) return `chega depois da previsão (${prev.split('-').reverse().join('/')})`;
  return null;
}
// Estado do veículo e os alertas.
// enderecosPrecisos: as entregas foram achadas pelo endereço (senão, só o centro da cidade: não dá para dizer se está no cliente).
function situacao({ ultima, agoraMs, desdeParadoMs, cfg, noCliente, foraDaRotaKm, atrasos = [], enderecosPrecisos = true }) {
  const alertas = [];
  if (!ultima) return { estado: 'sem_posicao', alertas: [{ tipo: 'sem_posicao', texto: 'O app ainda não mandou a posição (o motorista abriu o app com a localização ligada?)' }] };
  const idade = (agoraMs - new Date(ultima.registrado_em).getTime()) / 60000;
  let estado = 'em_movimento';
  if (idade > cfg.sem_sinal_min) {
    estado = 'sem_sinal';
    alertas.push({ tipo: 'sem_sinal', texto: `Sem sinal há ${Math.round(idade)} min (celular sem internet, sem bateria ou o app fechado)` });
  } else if (desdeParadoMs && (agoraMs - desdeParadoMs) / 60000 >= 5) {
    const min = Math.round((agoraMs - desdeParadoMs) / 60000);
    estado = noCliente ? 'no_cliente' : 'parado';
    if (!noCliente && min >= cfg.parada_min) alertas.push({ tipo: 'parado', texto: `Parado há ${min} min${enderecosPrecisos ? ' fora de um ponto de entrega' : ''}` });
    if (noCliente && min >= cfg.parada_min * 2) alertas.push({ tipo: 'parado', texto: `No cliente há ${min} min (${noCliente})` });
  }
  if (foraDaRotaKm != null && foraDaRotaKm > cfg.desvio_km && estado !== 'sem_sinal') alertas.push({ tipo: 'desvio', texto: `Fora da rota planejada: a ${String(foraDaRotaKm).replace('.', ',')} km do caminho` });
  atrasos.forEach((a) => alertas.push({ tipo: 'atraso', texto: a }));
  return { estado, alertas };
}

// ---------- Posições (app do motorista) ----------
// pontos: [{ lat, lon, vel (m/s), prec (m), t (ms) }] — o app junta e manda de tempos em tempos (e o que ficou sem internet).
async function registrar(romaneio, pontos) {
  if (romaneio.status !== 'em_rota') return { gravados: 0, motivo: 'romaneio não está em rota' };
  const agora = Date.now();
  const validos = (Array.isArray(pontos) ? pontos : []).slice(0, 500).map((p) => ({
    lat: Number(p.lat), lon: Number(p.lon), vel: Number(p.vel), prec: Number(p.prec), t: Number(p.t) || agora,
  })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && (p.lat || p.lon)
    && p.t > agora - 24 * 3600000 && p.t < agora + 5 * 60000 && !(p.prec > 2000))
    .sort((a, b) => a.t - b.t);
  if (!validos.length) return { gravados: 0 };
  const { rows: [ult] } = await pool.query('SELECT registrado_em FROM veiculo_posicoes WHERE romaneio_id = $1 ORDER BY registrado_em DESC LIMIT 1', [romaneio.id]);
  let ultimoT = ult ? new Date(ult.registrado_em).getTime() : 0;
  const novos = [];
  for (const p of validos) {
    if (p.t - ultimoT < 15000) continue;   // no máximo um ponto a cada 15 s
    novos.push(p); ultimoT = p.t;
  }
  if (!novos.length) return { gravados: 0 };
  await pool.query(
    `INSERT INTO veiculo_posicoes (romaneio_id, placa, motorista_nome, lat, lon, velocidade, precisao, registrado_em)
     SELECT $1, $2, $3, x.lat, x.lon, x.vel, x.prec, to_timestamp(x.t / 1000.0) FROM jsonb_to_recordset($4::jsonb) AS x(lat numeric, lon numeric, vel numeric, prec int, t bigint)`,
    [romaneio.id, romaneio.placa, romaneio.motorista_nome, JSON.stringify(novos.map((p) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6,
      vel: Number.isFinite(p.vel) && p.vel >= 0 ? Math.round(p.vel * 3.6 * 10) / 10 : null, prec: Number.isFinite(p.prec) ? Math.round(p.prec) : null, t: p.t })))]);
  preparar(romaneio.id).catch((e) => console.error('[monitoramento]', e.message));
  limparDeVezEmQuando();
  return { gravados: novos.length };
}
let ultimaLimpeza = 0;
function limparDeVezEmQuando() {
  if (Date.now() - ultimaLimpeza < 6 * 3600000) return;
  ultimaLimpeza = Date.now();
  config().then((c) => pool.query(`DELETE FROM veiculo_posicoes WHERE registrado_em < NOW() - ($1 || ' days')::interval`, [String(c.guardar_dias)])).catch(() => {});
}

// ---------- Paradas e rota planejada ----------
const preparando = new Set();
// Localiza no mapa as entregas do romaneio (endereço do destinatário) e desenha a rota
// a partir da primeira posição do caminhão. Fica guardado no romaneio; refaz se mudarem as entregas.
async function preparar(romaneioId) {
  if (preparando.has(romaneioId)) return;
  preparando.add(romaneioId);
  try {
    const { itensDoRomaneio } = require('./routes/romaneios');
    const mapa = require('./roteirizacao/servicosMapa');
    const { rows: [r] } = await pool.query('SELECT id, rota_planejada FROM romaneios WHERE id = $1', [romaneioId]);
    if (!r) return;
    const itens = await itensDoRomaneio(romaneioId);
    const chave = itens.map((i) => i.cte_id).join(',');
    const atual = r.rota_planejada || {};
    if (atual.chave === chave && atual.geometria !== undefined) return;
    const cfg = await mapa.configuracao();
    const { rows: ctes } = await pool.query('SELECT id, dados FROM ctes_emitidos WHERE id = ANY($1::int[])', [itens.map((i) => i.cte_id)]);
    const porId = new Map(ctes.map((c) => [c.id, c.dados || {}]));
    const paradas = {};
    for (const it of itens) {
      if (atual.paradas?.[it.cte_id]) { paradas[it.cte_id] = atual.paradas[it.cte_id]; continue; }
      const d = porId.get(it.cte_id) || {};
      const quem = d.recebedor?.endereco ? d.recebedor : d.destinatario || {};
      const e = { ...(quem.endereco || {}), xMun: d.fim?.xMun || quem.endereco?.xMun, UF: d.fim?.UF || quem.endereco?.UF, cMun: d.fim?.cMun || quem.endereco?.cMun };
      const g = await mapa.geocodificar(e, cfg).catch(() => null);
      paradas[it.cte_id] = g ? { lat: g.lat, lon: g.lon, precisao: g.precisao } : null;
    }
    const { rows: [inicio] } = await pool.query('SELECT lat::float, lon::float FROM veiculo_posicoes WHERE romaneio_id = $1 ORDER BY registrado_em LIMIT 1', [romaneioId]);
    const pontos = itens.map((i) => paradas[i.cte_id]).filter(Boolean);
    const geometria = inicio && pontos.length ? await mapa.geometria([inicio, ...pontos], cfg) : null;
    await pool.query('UPDATE romaneios SET rota_planejada = $2 WHERE id = $1', [romaneioId, JSON.stringify({ chave, paradas, geometria: inicio ? geometria : undefined, fonte: cfg.provedor })]);
  } finally { preparando.delete(romaneioId); }
}

// ---------- Painel ----------
async function posicoesRecentes(romaneioId, minutos) {
  const { rows } = await pool.query(`SELECT lat::float, lon::float, velocidade::float, precisao, registrado_em FROM veiculo_posicoes
    WHERE romaneio_id = $1 AND registrado_em > NOW() - ($2 || ' minutes')::interval ORDER BY registrado_em DESC LIMIT 600`, [romaneioId, String(minutos)]);
  if (rows.length) return rows;
  const { rows: ult } = await pool.query(`SELECT lat::float, lon::float, velocidade::float, precisao, registrado_em FROM veiculo_posicoes
    WHERE romaneio_id = $1 ORDER BY registrado_em DESC LIMIT 1`, [romaneioId]);
  return ult;
}
// Monta o estado de um romaneio em rota: posição, situação, entregas com a chegada prevista e alertas.
async function montar(r, cfg, agoraMs, velocidade) {
  const { itensDoRomaneio } = require('./routes/romaneios');
  const itens = await itensDoRomaneio(r.id);
  const pos = await posicoesRecentes(r.id, Math.max(cfg.parada_min * 3, 90));
  const ultima = pos[0] || null;
  const rp = r.rota_planejada || {};
  if (!rp.paradas || rp.chave !== itens.map((i) => i.cte_id).join(',') || (ultima && rp.geometria === undefined)) preparar(r.id).catch(() => {});
  const paradas = itens.map((i) => ({ ...i, ponto: rp.paradas?.[i.cte_id] || null, feita: ['entregue', 'devolvido'].includes(i.situacao) || i.ultima?.tipo === 'problema' }));
  const faltam = paradas.filter((p) => !p.feita);
  const chegadas = ultima ? estimarChegadas(ultima, Math.max(agoraMs, new Date(ultima.registrado_em).getTime()), faltam.map((p) => p.ponto || {}), { atendimento_min: cfg.atendimento_min, velocidade }) : [];
  const atrasos = [];
  faltam.forEach((p, i) => {
    p.chegada_prevista = chegadas[i] ? new Date(chegadas[i]).toISOString() : null;
    p.atraso = atrasoPrevisto(chegadas[i], { agendamento: p.agendamento, previsao: p.previsao });
    if (p.atraso) atrasos.push(`CT-e ${p.numero} (${p.destinatario}): ${p.atraso}`);
  });
  const perto = ultima && paradas.find((p) => p.ponto?.precisao === 'endereco' && distanciaKm(ultima, p.ponto) <= RAIO_CLIENTE_KM);
  const enderecosPrecisos = faltam.some((p) => p.ponto?.precisao === 'endereco');
  const fora = ultima && rp.geometria?.length && faltam.length ? distanciaAteLinha(ultima, rp.geometria) : null;
  const s = situacao({ ultima, agoraMs, desdeParadoMs: paradoDesde(pos), cfg, noCliente: perto ? perto.destinatario : null, foraDaRotaKm: fora, atrasos, enderecosPrecisos });
  return {
    id: r.id, placa: r.placa, veiculo: r.veiculo, motorista: r.motorista_nome, telefone: r.motorista_telefone, parceiro: !!r.parceiro_id, saiu_em: r.saiu_em,
    posicao: ultima ? { lat: ultima.lat, lon: ultima.lon, velocidade: ultima.velocidade, precisao: ultima.precisao, em: ultima.registrado_em } : null,
    estado: s.estado, alertas: s.alertas, parado_desde: s.estado === 'parado' || s.estado === 'no_cliente' ? new Date(paradoDesde(pos)).toISOString() : null,
    no_cliente: perto ? perto.destinatario : null, fora_da_rota_km: fora,
    entregas: { total: paradas.length, feitas: paradas.length - faltam.length },
    proxima: faltam[0] ? { cte_id: faltam[0].cte_id, numero: faltam[0].numero, destinatario: faltam[0].destinatario, cidade: faltam[0].cidade, chegada_prevista: faltam[0].chegada_prevista } : null,
    paradas: paradas.map((p) => ({ cte_id: p.cte_id, serie: p.serie, numero: p.numero, destinatario: p.destinatario, endereco: p.endereco, cidade: p.cidade, uf: p.uf,
      situacao: p.situacao, feita: p.feita, ponto: p.ponto, chegada_prevista: p.chegada_prevista || null, atraso: p.atraso || null, data_entrega: p.data_entrega,
      agendamento: p.agendamento ? { data: p.agendamento.data, hora_de: p.agendamento.hora_de, hora_ate: p.agendamento.hora_ate } : null, previsao: diaDe(p.previsao) })),
    rota: rp.geometria || null,
  };
}
async function velocidadeMedia() {
  try { return (await require('./roteirizacao/servicosMapa').configuracao()).velocidade_estimada || 55; } catch { return 55; }
}
async function emRota() {
  const { rows } = await pool.query(`SELECT * FROM romaneios WHERE status = 'em_rota' ORDER BY saiu_em NULLS LAST, id LIMIT 200`);
  return rows;
}
async function painel() {
  const cfg = await config();
  const agora = Date.now(); const vel = await velocidadeMedia();
  const veiculos = [];
  for (const r of await emRota()) veiculos.push(await montar(r, cfg, agora, vel));
  // Primeiro os com alerta, depois os que andam; sem posição por último.
  const ordem = { em_movimento: 1, no_cliente: 2, parado: 2, sem_sinal: 3, sem_posicao: 4 };
  const peso = (v) => (v.alertas.some((a) => a.tipo !== 'sem_posicao' && a.tipo !== 'atraso') ? 0 : ordem[v.estado] || 5);
  veiculos.sort((a, b) => peso(a) - peso(b) || a.id - b.id);
  const conta = (e) => veiculos.filter((v) => v.estado === e).length;
  return {
    veiculos: veiculos.map(({ rota: _r, paradas, ...v }) => ({ ...v, paradas: paradas.map((p) => ({ cte_id: p.cte_id, numero: p.numero, destinatario: p.destinatario, feita: p.feita, ponto: p.ponto, chegada_prevista: p.chegada_prevista })) })),
    resumo: { em_rota: veiculos.length, em_movimento: conta('em_movimento'), parados: conta('parado') + conta('no_cliente'), sem_sinal: conta('sem_sinal') + conta('sem_posicao'),
      com_alerta: veiculos.filter((v) => v.alertas.some((a) => a.tipo !== 'sem_posicao')).length },
    config: cfg,
  };
}
async function detalhe(id) {
  const { rows: [r] } = await pool.query('SELECT * FROM romaneios WHERE id = $1', [id]);
  if (!r) throw falha('Romaneio não encontrado.', 404);
  const cfg = await config();
  const v = await montar(r, cfg, Date.now(), await velocidadeMedia());
  // Trajeto do dia (no máximo ~800 pontos).
  const { rows: [n] } = await pool.query('SELECT COUNT(*)::int AS n FROM veiculo_posicoes WHERE romaneio_id = $1', [id]);
  const passo = Math.max(1, Math.ceil(n.n / 800));
  const { rows: trajeto } = await pool.query(`SELECT lat::float, lon::float, velocidade::float, registrado_em FROM (
      SELECT *, ROW_NUMBER() OVER (ORDER BY registrado_em) AS rn, COUNT(*) OVER () AS total FROM veiculo_posicoes WHERE romaneio_id = $1) x
     WHERE (rn - 1) % $2 = 0 OR rn = total ORDER BY registrado_em`, [id, passo]);
  const { rows: baixas } = await pool.query(`SELECT o.cte_id, o.descricao, o.tipo, o.data_hora, o.latitude::float AS lat, o.longitude::float AS lon FROM cte_ocorrencias o
    WHERE o.romaneio_id = $1 AND o.latitude IS NOT NULL ORDER BY o.data_hora`, [id]);
  const km = trajeto.reduce((t, p, i) => (i ? t + distanciaKm(trajeto[i - 1], p) : 0), 0);
  return { ...v, status: r.status, trajeto: trajeto.map((p) => [p.lat, p.lon]), inicio: trajeto[0]?.registrado_em || null, km_rodados: Math.round(km * 10) / 10, baixas, config: cfg };
}

// Chegada prevista de um CT-e (portal e rastreio): só com o caminhão em rota e a posição recente.
async function previsaoDoCte(cteId) {
  const { rows: [r] } = await pool.query(`SELECT r.* FROM romaneio_itens i JOIN romaneios r ON r.id = i.romaneio_id
    WHERE i.cte_id = $1 AND r.status = 'em_rota' AND r.parceiro_id IS NULL ORDER BY r.id DESC LIMIT 1`, [cteId]);
  if (!r) return null;
  const cfg = await config();
  const v = await montar(r, cfg, Date.now(), await velocidadeMedia());
  if (!v.posicao || ['sem_sinal', 'sem_posicao'].includes(v.estado)) return null;
  const faltam = v.paradas.filter((p) => !p.feita);
  const i = faltam.findIndex((p) => p.cte_id === Number(cteId));
  if (i < 0 || !faltam[i].chegada_prevista) return null;
  return { chegada_prevista: faltam[i].chegada_prevista, entregas_antes: i, km: faltam[i].ponto ? Math.round(distanciaKm(v.posicao, faltam[i].ponto) * 1.3) : null, atualizado_em: v.posicao.em };
}

async function pendencias() {
  const p = await painel();
  const com = (t) => p.veiculos.filter((v) => v.alertas.some((a) => a.tipo === t)).length;
  return { parados: com('parado'), sem_sinal: com('sem_sinal'), desvio: com('desvio'), atraso: com('atraso') };
}

module.exports = { CONFIG_PADRAO, config, salvarConfig, distanciaAteLinha, paradoDesde, minutosAte, estimarChegadas, atrasoPrevisto, situacao, registrar, preparar, painel, detalhe, previsaoDoCte, pendencias };
