// Jornada do motorista (Lei 13.103/2015): o motorista marca no app o que está
// fazendo (trabalho, direção, pausa, refeição, espera, fim) e o sistema soma
// os tempos, as horas extras e avisa: direção contínua acima de 5h30 sem 30
// min de descanso, jornada acima de 10h (8h + 2h extras), sem 1h de refeição,
// menos de 11h de descanso entre jornadas. Espelho do mês por motorista.
// O tempo de espera (carga/descarga, fiscalização) não conta como jornada.
const pool = require('./db');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const TIPOS = { trabalho: 'Trabalho (carga, descarga, outros)', direcao: 'Direção', pausa: 'Pausa / descanso', refeicao: 'Refeição', espera: 'Tempo de espera', fim: 'Fim da jornada' };
const LIMITES = { jornada: 8 * 60, extras: 2 * 60, direcao_continua: 5 * 60 + 30, descanso_direcao: 30, refeicao: 60, jornada_para_refeicao: 6 * 60, interjornada: 11 * 60, aberta_demais: 14 * 60 };
const min = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
const hhmm = (m) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`;

// eventos: [{ tipo, em }] em ordem. agora: fim das contas da jornada aberta. fimAnterior: fim da jornada anterior do motorista.
function calcular(eventos, { agora = new Date(), fimAnterior = null } = {}) {
  const ev = [...eventos].sort((a, b) => new Date(a.em) - new Date(b.em));
  const tot = { trabalho: 0, direcao: 0, pausa: 0, refeicao: 0, espera: 0 };
  let continua = 0; let descanso = 0; let maxContinua = 0;
  const fimEv = ev.find((e) => e.tipo === 'fim');
  for (let i = 0; i < ev.length; i += 1) {
    const e = ev[i];
    if (e.tipo === 'fim') break;
    const ate = ev[i + 1]?.em || (fimEv ? fimEv.em : agora);
    const m = min(e.em, ate);
    if (tot[e.tipo] != null) tot[e.tipo] += m;
    if (e.tipo === 'direcao') {
      continua += m;
      maxContinua = Math.max(maxContinua, continua);
    } else if (['pausa', 'refeicao', 'espera'].includes(e.tipo)) {
      // O descanso pode ser fracionado (art. 67-C): as paradas somam e, ao chegar a 30 min, zeram a direção contínua.
      descanso += m;
      if (descanso >= LIMITES.descanso_direcao) { continua = 0; descanso = 0; }
    }
  }
  const inicio = ev[0]?.em || null;
  const fim = fimEv?.em || null;
  const jornada = tot.direcao + tot.trabalho;
  const extras = Math.max(0, jornada - LIMITES.jornada);
  const alertas = [];
  if (maxContinua > LIMITES.direcao_continua) alertas.push({ codigo: 'direcao_continua', texto: `Direção contínua de ${hhmm(maxContinua)} (máximo 5h30 sem 30 min de descanso)` });
  if (jornada > LIMITES.jornada + LIMITES.extras) alertas.push({ codigo: 'excesso_jornada', texto: `Jornada de ${hhmm(jornada)} (máximo 8h + 2h extras)` });
  if (jornada > LIMITES.jornada_para_refeicao && tot.refeicao < LIMITES.refeicao && fim) alertas.push({ codigo: 'refeicao', texto: `Refeição de ${hhmm(tot.refeicao)} (mínimo 1h em jornada acima de 6h)` });
  if (fimAnterior && inicio) {
    const intervalo = min(fimAnterior, inicio);
    if (intervalo < LIMITES.interjornada) alertas.push({ codigo: 'interjornada', texto: `Descanso entre jornadas de ${hhmm(intervalo)} (mínimo 11h)` });
  }
  if (!fim && inicio && min(inicio, agora) > LIMITES.aberta_demais) alertas.push({ codigo: 'aberta', texto: `Jornada aberta há ${hhmm(min(inicio, agora))}: encerre no app ou ajuste aqui` });
  const ultimo = ev[ev.length - 1];
  return {
    inicio, fim, totais: tot, jornada, extras, direcao_continua_max: maxContinua, direcao_continua_atual: fim ? 0 : continua, alertas,
    estado: fim ? 'fim' : ultimo?.tipo || null, desde: ultimo?.em || null,
  };
}

async function comTransacao(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}

// Quem é o motorista: o CPF (se houver) e o cadastro dele.
async function identificar({ cpf, nome }) {
  const c = String(cpf || '').replace(/\D/g, '');
  const cpfOk = c.length === 11 ? c : null;
  const { rows } = cpfOk ? await pool.query('SELECT id, nome, cpf FROM motoristas WHERE cpf = $1', [cpfOk]) : { rows: [] };
  const n = String(rows[0]?.nome || nome || '').trim();
  if (!n) throw falha('Motorista sem nome.');
  return { motorista_id: rows[0]?.id || null, nome: n.slice(0, 120), cpf: cpfOk };
}
const chave = (m) => m.cpf || m.nome;
const condMotorista = (m, i = 1) => (m.cpf ? `motorista_cpf = $${i}` : `motorista_cpf IS NULL AND motorista_nome = $${i}`);

async function eventosDe(jornadaId, cliente = pool) {
  const { rows } = await cliente.query('SELECT id, tipo, em, latitude, longitude, origem, usuario_nome, observacao FROM jornada_eventos WHERE jornada_id = $1 ORDER BY em, id', [jornadaId]);
  return rows;
}
async function fimAnteriorDe(j, cliente = pool) {
  const { rows } = await cliente.query(
    `SELECT MAX(fim) AS fim FROM jornadas WHERE ${j.motorista_cpf ? 'motorista_cpf = $1' : 'motorista_cpf IS NULL AND motorista_nome = $1'} AND status = 'fechada' AND fim <= $2 AND id <> $3`,
    [j.motorista_cpf || j.motorista_nome, j.inicio, j.id]);
  return rows[0]?.fim || null;
}
async function comCalculo(j, cliente = pool) {
  const eventos = await eventosDe(j.id, cliente);
  return { ...j, eventos, calculo: calcular(eventos, { fimAnterior: await fimAnteriorDe(j, cliente) }) };
}

// Estado atual do motorista (para o app): a jornada aberta com as contas, ou a última fechada.
async function estado(motorista) {
  const m = await identificar(motorista);
  const { rows } = await pool.query(`SELECT * FROM jornadas WHERE ${condMotorista(m)} ORDER BY (status = 'aberta') DESC, inicio DESC LIMIT 1`, [chave(m)]);
  const j = rows[0] ? await comCalculo(rows[0]) : null;
  return { motorista: m, aberta: j?.status === 'aberta' ? j : null, ultima: j?.status === 'fechada' ? { id: j.id, inicio: j.inicio, fim: j.fim, calculo: j.calculo } : null, tipos: TIPOS };
}

// Marca um evento. Sem jornada aberta, o primeiro evento abre uma. em: agora (app) ou o informado (sistema).
async function marcar(motorista, { tipo, em, latitude, longitude, origem = 'app', usuario = null, romaneio_id = null, placa = null, observacao = null }) {
  if (!TIPOS[tipo]) throw falha('Escolha o que está fazendo.');
  const m = await identificar(motorista);
  const quando = em ? new Date(em) : new Date();
  if (Number.isNaN(quando.getTime())) throw falha('Data e hora inválidas.');
  if (quando > new Date(Date.now() + 5 * 60000)) throw falha('A hora está no futuro.');
  const coord = (v, max) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) && Math.abs(n) <= max ? n : null; };
  return comTransacao(async (c) => {
    const { rows } = await c.query(`SELECT * FROM jornadas WHERE ${condMotorista(m)} AND status = 'aberta' FOR UPDATE`, [chave(m)]);
    let j = rows[0];
    if (!j) {
      if (tipo === 'fim') throw falha('Não há jornada aberta para encerrar.');
      const { rows: ult } = await c.query(`SELECT MAX(fim) AS fim FROM jornadas WHERE ${condMotorista(m)}`, [chave(m)]);
      if (ult[0]?.fim && quando < new Date(ult[0].fim)) throw falha('Este horário é antes do fim da jornada anterior.');
      ({ rows: [j] } = await c.query(
        `INSERT INTO jornadas (motorista_id, motorista_nome, motorista_cpf, inicio, romaneio_id, placa) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [m.motorista_id, m.nome, m.cpf, quando, romaneio_id, placa]));
    } else {
      const evs = await eventosDe(j.id, c);
      const ultimo = evs[evs.length - 1];
      if (ultimo && quando < new Date(ultimo.em)) throw falha('Este horário é antes da última marcação.');
      if (ultimo?.tipo === tipo) throw falha(`Já está marcado: ${TIPOS[tipo].toLowerCase()}.`);
    }
    await c.query(`INSERT INTO jornada_eventos (jornada_id, tipo, em, latitude, longitude, origem, usuario_nome, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [j.id, tipo, quando, coord(latitude, 90), coord(longitude, 180), origem, usuario, String(observacao || '').slice(0, 300) || null]);
    if (tipo === 'fim') await c.query(`UPDATE jornadas SET fim = $2, status = 'fechada' WHERE id = $1`, [j.id, quando]);
    const { rows: [atual] } = await c.query('SELECT * FROM jornadas WHERE id = $1', [j.id]);
    return comCalculo(atual, c);
  });
}

// Ajuste pelo escritório: inclui uma marcação no meio (com a hora) ou apaga uma (fica no log quem fez).
async function incluirEvento(jornadaId, { tipo, em, observacao }, usuario) {
  if (!TIPOS[tipo]) throw falha('Escolha o tipo da marcação.');
  const quando = new Date(em);
  if (!em || Number.isNaN(quando.getTime())) throw falha('Informe a data e a hora.');
  if (quando > new Date(Date.now() + 5 * 60000)) throw falha('A hora está no futuro.');
  return comTransacao(async (c) => {
    const { rows: [j] } = await c.query('SELECT * FROM jornadas WHERE id = $1 FOR UPDATE', [jornadaId]);
    if (!j) throw falha('Jornada não encontrada.', 404);
    if (quando < new Date(j.inicio) && tipo === 'fim') throw falha('O fim não pode ser antes do início.');
    if (j.status === 'fechada' && tipo === 'fim') throw falha('A jornada já tem fim: apague a marcação de fim antes de lançar outra.');
    if (j.status === 'fechada' && quando > new Date(j.fim)) throw falha('A marcação é depois do fim da jornada.');
    await c.query(`INSERT INTO jornada_eventos (jornada_id, tipo, em, origem, usuario_nome, observacao) VALUES ($1, $2, $3, 'sistema', $4, $5)`,
      [j.id, tipo, quando, usuario, String(observacao || '').slice(0, 300) || null]);
    await c.query(`UPDATE jornadas SET inicio = LEAST(inicio, $2)${tipo === 'fim' ? `, fim = $2, status = 'fechada'` : ''} WHERE id = $1`, [j.id, quando]);
    const { rows: [atual] } = await c.query('SELECT * FROM jornadas WHERE id = $1', [j.id]);
    return comCalculo(atual, c);
  });
}
async function excluirEvento(eventoId) {
  return comTransacao(async (c) => {
    const { rows: [e] } = await c.query('DELETE FROM jornada_eventos WHERE id = $1 RETURNING jornada_id, tipo, em', [eventoId]);
    if (!e) throw falha('Marcação não encontrada.', 404);
    const restam = await eventosDe(e.jornada_id, c);
    if (!restam.length) { await c.query('DELETE FROM jornadas WHERE id = $1', [e.jornada_id]); return { apagou_jornada: true, ...e }; }
    const fim = restam.find((x) => x.tipo === 'fim');
    // Reabrir só se o motorista não tiver outra jornada aberta.
    await c.query(`UPDATE jornadas SET inicio = $2, fim = $3, status = CASE WHEN $3::timestamptz IS NULL THEN 'aberta' ELSE 'fechada' END WHERE id = $1`, [e.jornada_id, restam[0].em, fim?.em || null])
      .catch((err) => { if (err.code === '23505') throw falha('O motorista já tem outra jornada aberta: não dá para reabrir esta.', 409); throw err; });
    return e;
  });
}

async function listar({ de, ate, motorista } = {}) {
  const val = [de || '1900-01-01', ate || '2999-12-31'];
  let filtro = '';
  if (String(motorista || '').trim()) { val.push(String(motorista).trim()); filtro = ` AND (motorista_cpf = $3 OR motorista_nome = $3)`; }
  const { rows } = await pool.query(
    `SELECT * FROM jornadas WHERE ((inicio AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date OR status = 'aberta')${filtro} ORDER BY status = 'aberta' DESC, inicio DESC LIMIT 500`, val);
  const lista = [];
  for (const j of rows) { const x = await comCalculo(j); delete x.eventos; lista.push(x); }
  const { rows: mots } = await pool.query(`SELECT DISTINCT COALESCE(motorista_cpf, motorista_nome) AS chave, motorista_nome AS nome FROM jornadas ORDER BY nome`);
  return { jornadas: lista, motoristas: mots, tipos: TIPOS };
}
async function detalhe(id) {
  const { rows: [j] } = await pool.query('SELECT * FROM jornadas WHERE id = $1', [id]);
  if (!j) throw falha('Jornada não encontrada.', 404);
  return { ...(await comCalculo(j)), tipos: TIPOS };
}

// Espelho do mês (HTML para imprimir e o motorista assinar).
async function espelho({ motorista, mes }, empresa = {}) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) throw falha('Informe o mês (AAAA-MM).');
  if (!String(motorista || '').trim()) throw falha('Escolha o motorista.');
  const de = `${mes}-01`; const ate = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const { jornadas } = await listar({ de, ate, motorista });
  const doMes = jornadas.filter((j) => j.status === 'fechada').sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const hora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const soma = (k) => doMes.reduce((s, j) => s + (k === 'jornada' || k === 'extras' ? j.calculo[k] : j.calculo.totais[k]), 0);
  const nome = doMes[0]?.motorista_nome || jornadas[0]?.motorista_nome || motorista;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Espelho de jornada ${esc(nome)} ${mes}</title>
  <style>@page { size: A4 landscape; margin: 10mm; } body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 14px; } h1 { font-size: 16px; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border-bottom: 1px solid #ccc; padding: 4px 5px; text-align: left; } th { background: #eef0f4; } .n { text-align: right; }
  .alerta { color: #b91c1c; } .ass { margin-top: 40px; display: flex; gap: 80px; } .ass div { border-top: 1px solid #333; padding-top: 4px; width: 280px; text-align: center; }
  .acoes { margin-bottom: 10px; } @media print { .acoes { display: none; } }</style></head><body>
  <div class="acoes"><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
  <h1>Espelho de jornada — ${esc(nome)}</h1>
  <div>${esc(empresa.razao_social || '')}${empresa.cnpj ? ` · CNPJ ${esc(empresa.cnpj)}` : ''} · mês ${mes.slice(5, 7)}/${mes.slice(0, 4)} · Lei 13.103/2015 (jornada de 8h, até 2h extras; tempo de espera não é jornada)</div>
  <table><thead><tr><th>Início</th><th>Fim</th><th class="n">Direção</th><th class="n">Trabalho</th><th class="n">Espera</th><th class="n">Refeição</th><th class="n">Pausas</th><th class="n">Jornada</th><th class="n">Extras</th><th>Ocorrências</th></tr></thead><tbody>
  ${doMes.map((j) => `<tr><td>${hora(j.inicio)}</td><td>${hora(j.fim)}</td><td class="n">${hhmm(j.calculo.totais.direcao)}</td><td class="n">${hhmm(j.calculo.totais.trabalho)}</td><td class="n">${hhmm(j.calculo.totais.espera)}</td>
    <td class="n">${hhmm(j.calculo.totais.refeicao)}</td><td class="n">${hhmm(j.calculo.totais.pausa)}</td><td class="n">${hhmm(j.calculo.jornada)}</td><td class="n">${hhmm(j.calculo.extras)}</td>
    <td class="alerta">${j.calculo.alertas.map((a) => esc(a.texto)).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="10">Nenhuma jornada fechada no mês.</td></tr>'}
  <tr><th colspan="2">${doMes.length} jornada(s)</th><th class="n">${hhmm(soma('direcao'))}</th><th class="n">${hhmm(soma('trabalho'))}</th><th class="n">${hhmm(soma('espera'))}</th><th class="n">${hhmm(soma('refeicao'))}</th><th class="n">${hhmm(soma('pausa'))}</th>
    <th class="n">${hhmm(soma('jornada'))}</th><th class="n">${hhmm(soma('extras'))}</th><th></th></tr></tbody></table>
  <div class="ass"><div>${esc(nome)}</div><div>${esc(empresa.razao_social || 'Empresa')}</div></div></body></html>`;
}

async function pendencias() {
  const { rows } = await pool.query(`SELECT * FROM jornadas WHERE status = 'aberta'`);
  let alerta = 0;
  for (const j of rows) { const x = await comCalculo(j); if (x.calculo.alertas.length) alerta += 1; }
  return { abertas: rows.length, com_alerta: alerta };
}

module.exports = { TIPOS, LIMITES, calcular, hhmm, identificar, estado, marcar, incluirEvento, excluirEvento, listar, detalhe, espelho, pendencias };
