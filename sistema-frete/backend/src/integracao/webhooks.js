// Avisos automáticos para o ERP (webhooks).
//  • Os gatilhos do banco (schema.sql) põem cada mudança em webhook_eventos:
//    cte.autorizado, cte.cancelado, cte.substituido, cte.entregue,
//    fatura.criada, fatura.paga, fatura.cancelada.
//  • A cada 20 s: cada evento ganha uma entrega para cada webhook que o assina
//    (com o CT-e/fatura no formato da API), e as entregas pendentes são enviadas.
//  • POST JSON com a assinatura no cabeçalho:
//      X-Nexofrete-Assinatura: t=<unix>,v1=<HMAC-SHA256(segredo, "<t>.<corpo>") em hex>
//    Resposta 2xx = entregue. Senão tenta de novo: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h, 24 h.
//  • Segurança: só https e só endereços públicos (nada de rede interna, localhost
//    ou 169.254.x — o IP é conferido na hora da conexão). Para um ERP na rede da
//    empresa, ligue WEBHOOK_REDE_INTERNA=1 no servidor.
const crypto = require('crypto');
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const pool = require('../db');
const { criptografar, descriptografar } = require('../rastreioLonngren');
const recursos = require('./recursos');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const EVENTOS = {
  'cte.autorizado': 'CT-e autorizado', 'cte.cancelado': 'CT-e cancelado', 'cte.substituido': 'CT-e substituído', 'cte.entregue': 'Entrega registrada',
  'fatura.criada': 'Fatura criada', 'fatura.paga': 'Fatura paga', 'fatura.cancelada': 'Fatura cancelada',
};
const ESPERAS_MIN = [1, 5, 15, 60, 180, 360, 720, 1440];
const LIMITE_FALHAS_SEGUIDAS = 200;
const redeInterna = () => process.env.WEBHOOK_REDE_INTERNA === '1';

// ---------- Endereço seguro ----------
function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const x = String(ip).toLowerCase();
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  if (v4) return ipPrivado(v4[1]);
  return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x);
}

function lerUrl(texto) {
  let u;
  try { u = new URL(String(texto || '').trim()); } catch { throw falha('Endereço inválido. Ex.: https://erp.suaempresa.com.br/nexofrete/webhook'); }
  if (u.protocol !== 'https:' && !(redeInterna() && u.protocol === 'http:')) throw falha('O endereço precisa começar com https://');
  if (u.username || u.password) throw falha('Não coloque usuário e senha no endereço.');
  if (!redeInterna() && (ipPrivado(u.hostname.replace(/^\[|\]$/g, '')) || /^localhost$|\.local$|\.internal$/i.test(u.hostname))) {
    throw falha('Esse endereço é da rede interna. Use o endereço público do ERP.');
  }
  return u.toString().slice(0, 500);
}

// Resolve o nome e recusa IP interno na hora de conectar (vale também contra DNS que muda de IP).
function lookupSeguro(hostname, opcoes, cb) {
  dns.lookup(hostname, { ...opcoes, all: true }, (err, enderecos) => {
    if (err) return cb(err);
    const lista = Array.isArray(enderecos) ? enderecos : [{ address: enderecos, family: net.isIPv6(enderecos) ? 6 : 4 }];
    if (!redeInterna() && lista.some((e) => ipPrivado(e.address))) return cb(Object.assign(new Error('endereço da rede interna recusado'), { code: 'EENDERECOINTERNO' }));
    if (opcoes?.all) return cb(null, lista);
    return cb(null, lista[0].address, lista[0].family);
  });
}

function assinatura(segredo, corpo, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac('sha256', segredo).update(`${t}.${corpo}`).digest('hex')}`;
}

// Um POST, sem seguir redirecionamento, com limite de tempo e de resposta.
function postar(url, corpo, cabecalhos) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'POST', lookup: lookupSeguro, timeout: 10000,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo), 'User-Agent': 'Nexofrete-Webhooks/1', ...cabecalhos },
    }, (res) => {
      let lido = 0; const partes = [];
      res.on('data', (p) => { if (lido < 2000) { partes.push(p); lido += p.length; } });
      res.on('end', () => resolve({ status: res.statusCode, resposta: Buffer.concat(partes).toString('utf8').slice(0, 300) }));
      res.on('error', (e) => resolve({ status: null, erro: e.message }));
    });
    req.on('timeout', () => req.destroy(new Error('o ERP não respondeu em 10 segundos')));
    req.on('error', (e) => resolve({ status: null, erro: e.code === 'EENDERECOINTERNO' ? 'endereço da rede interna recusado' : e.message }));
    req.end(corpo);
  });
}

// ---------- Cadastro ----------
async function listar() {
  const { rows } = await pool.query(
    `SELECT w.id, w.nome, w.url, w.eventos, w.ativo, w.falhas_seguidas, w.ultimo_envio_em, w.ultimo_status, w.ultimo_erro, w.criado_por_nome, w.criado_em,
            (SELECT COUNT(*) FROM webhook_entregas e WHERE e.webhook_id = w.id AND e.status = 'pendente')::int AS pendentes,
            (SELECT COUNT(*) FROM webhook_entregas e WHERE e.webhook_id = w.id AND e.status = 'falhou')::int AS falharam
       FROM webhooks w ORDER BY w.ativo DESC, w.nome`);
  return rows;
}

function lerEventos(lista) {
  const ev = [...new Set((Array.isArray(lista) ? lista : []).filter((e) => e === '*' || EVENTOS[e]))];
  if (!ev.length) throw falha('Escolha pelo menos um evento.');
  return ev.includes('*') ? ['*'] : ev;
}

async function criar(b = {}, usuarioNome) {
  const nome = String(b.nome || '').trim().slice(0, 80) || 'ERP';
  const url = lerUrl(b.url);
  const segredo = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const { rows: [w] } = await pool.query('INSERT INTO webhooks (nome, url, segredo, eventos, criado_por_nome) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, url, eventos, ativo',
    [nome, url, criptografar(segredo), lerEventos(b.eventos || ['*']), usuarioNome || null]);
  return { ...w, segredo };
}

async function alterar(id, b = {}) {
  const atual = (await pool.query('SELECT * FROM webhooks WHERE id = $1', [id])).rows[0];
  if (!atual) throw falha('Webhook não encontrado.', 404);
  const { rows: [w] } = await pool.query(
    `UPDATE webhooks SET nome = $2, url = $3, eventos = $4, ativo = $5, falhas_seguidas = CASE WHEN $5 AND NOT ativo THEN 0 ELSE falhas_seguidas END
      WHERE id = $1 RETURNING id, nome, url, eventos, ativo`,
    [id, String(b.nome ?? atual.nome).trim().slice(0, 80) || atual.nome, b.url != null ? lerUrl(b.url) : atual.url,
      b.eventos ? lerEventos(b.eventos) : atual.eventos, b.ativo == null ? atual.ativo : !!b.ativo]);
  return w;
}

async function novoSegredo(id) {
  const segredo = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const { rowCount } = await pool.query('UPDATE webhooks SET segredo = $2 WHERE id = $1', [id, criptografar(segredo)]);
  if (!rowCount) throw falha('Webhook não encontrado.', 404);
  return { segredo };
}

async function excluir(id) {
  const { rowCount } = await pool.query('DELETE FROM webhooks WHERE id = $1', [id]);
  if (!rowCount) throw falha('Webhook não encontrado.', 404);
}

async function entregas({ webhookId = null, limite = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT e.id, e.webhook_id, w.nome AS webhook, v.evento, v.recurso, v.recurso_id, e.status, e.tentativas, e.proxima_em, e.http_status, e.erro, e.enviado_em, e.criado_em
       FROM webhook_entregas e JOIN webhook_eventos v ON v.id = e.evento_id JOIN webhooks w ON w.id = e.webhook_id
      WHERE ($1::int IS NULL OR e.webhook_id = $1) ORDER BY e.id DESC LIMIT $2`, [webhookId, Math.min(Number(limite) || 50, 200)]);
  return rows;
}

// Manda de novo (entrega que falhou de vez, ou adianta a próxima tentativa).
async function reenviar(entregaId) {
  const { rowCount } = await pool.query(`UPDATE webhook_entregas SET status = 'pendente', proxima_em = NOW(), tentativas = 0 WHERE id = $1 AND status <> 'enviado'`, [entregaId]);
  if (!rowCount) throw falha('Essa entrega já foi enviada (ou não existe).', 409);
}

// ---------- Envio ----------
function corpoDo(eventoId, evento, criadoEm, dados) {
  return JSON.stringify({ id: `evt_${eventoId}`, evento, criado_em: criadoEm instanceof Date ? criadoEm.toISOString() : criadoEm, dados });
}

async function enviarUm(w, eventoId, evento, criadoEm, dados) {
  const corpo = corpoDo(eventoId, evento, criadoEm, dados);
  const segredo = descriptografar(w.segredo);
  if (!segredo) return { status: null, erro: 'segredo do webhook ilegível (gere um novo)' };
  return postar(w.url, corpo, { 'X-Nexofrete-Evento': evento, 'X-Nexofrete-Entrega': `evt_${eventoId}`, 'X-Nexofrete-Assinatura': assinatura(segredo, corpo) });
}

async function enviarTeste(id) {
  const { rows: [w] } = await pool.query('SELECT * FROM webhooks WHERE id = $1', [id]);
  if (!w) throw falha('Webhook não encontrado.', 404);
  try { lerUrl(w.url); } catch (e) { return { ok: false, erro: e.message }; }
  const r = await enviarUm(w, `teste_${Date.now()}`, 'teste', new Date(), { mensagem: 'Teste do Nexofrete: se este aviso chegou e a assinatura confere, está tudo certo.' });
  const ok = r.status >= 200 && r.status < 300;
  return { ok, http_status: r.status, erro: ok ? null : r.erro || `o ERP respondeu HTTP ${r.status}${r.resposta ? `: ${r.resposta.slice(0, 120)}` : ''}` };
}

async function dadosDoEvento(ev) {
  if (ev.recurso === 'cte') return { cte: await recursos.ctePorId(ev.recurso_id) };
  if (ev.recurso === 'fatura') return { fatura: await recursos.faturaPorId(ev.recurso_id) };
  return {};
}

// Evento novo → uma entrega para cada webhook ativo que o assina (com os dados de agora).
async function distribuir() {
  const cliente = await pool.connect();
  let n = 0;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM webhook_eventos WHERE NOT processado ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED');
    for (const ev of rows) {
      const dados = await dadosDoEvento(ev);
      await cliente.query('UPDATE webhook_eventos SET dados = $2, processado = TRUE WHERE id = $1', [ev.id, JSON.stringify(dados)]);
      const r = await cliente.query(
        `INSERT INTO webhook_entregas (webhook_id, evento_id) SELECT id, $1 FROM webhooks WHERE ativo AND (eventos && ARRAY['*', $2]::text[]) ON CONFLICT DO NOTHING`, [ev.id, ev.evento]);
      n += r.rowCount;
    }
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  return n;
}

async function enviarPendentes() {
  // Reserva as entregas (outro processo não pega as mesmas).
  const { rows } = await pool.query(
    `UPDATE webhook_entregas SET proxima_em = NOW() + INTERVAL '2 minutes' WHERE id IN (
       SELECT id FROM webhook_entregas WHERE status = 'pendente' AND proxima_em <= NOW() ORDER BY id LIMIT 30 FOR UPDATE SKIP LOCKED)
     RETURNING id, webhook_id, evento_id, tentativas`);
  let enviados = 0;
  for (const en of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
    const { rows: [w] } = await pool.query('SELECT * FROM webhooks WHERE id = $1', [en.webhook_id]);
    const { rows: [ev] } = await pool.query('SELECT * FROM webhook_eventos WHERE id = $1', [en.evento_id]);
    if (!w || !ev) continue;
    if (!w.ativo) { await pool.query(`UPDATE webhook_entregas SET status = 'falhou', erro = 'webhook desligado' WHERE id = $1`, [en.id]); continue; }
    const r = await enviarUm(w, ev.id, ev.evento, ev.criado_em, ev.dados || {});
    const ok = r.status >= 200 && r.status < 300;
    const tentativas = en.tentativas + 1;
    const erro = ok ? null : String(r.erro || `HTTP ${r.status}${r.resposta ? `: ${r.resposta}` : ''}`).slice(0, 300);
    if (ok) {
      enviados += 1;
      await pool.query(`UPDATE webhook_entregas SET status = 'enviado', tentativas = $2, http_status = $3, erro = NULL, enviado_em = NOW() WHERE id = $1`, [en.id, tentativas, r.status]);
    } else {
      const desistir = tentativas >= ESPERAS_MIN.length;
      await pool.query(`UPDATE webhook_entregas SET status = $2, tentativas = $3, http_status = $4, erro = $5, proxima_em = NOW() + ($6 || ' minutes')::interval WHERE id = $1`,
        [en.id, desistir ? 'falhou' : 'pendente', tentativas, r.status, erro, String(ESPERAS_MIN[Math.min(tentativas - 1, ESPERAS_MIN.length - 1)])]);
    }
    await pool.query(
      `UPDATE webhooks SET ultimo_envio_em = NOW(), ultimo_status = $2, ultimo_erro = $3, falhas_seguidas = CASE WHEN $4 THEN 0 ELSE falhas_seguidas + 1 END,
              ativo = CASE WHEN NOT $4 AND falhas_seguidas + 1 >= $5 THEN FALSE ELSE ativo END WHERE id = $1`,
      [w.id, r.status, erro, ok, LIMITE_FALHAS_SEGUIDAS]);
  }
  return { tentados: rows.length, enviados };
}

let agendado = null; let rodando = false; let ultimaLimpeza = 0;
async function rodada() {
  if (rodando) return; rodando = true;
  try {
    await distribuir();
    await enviarPendentes();
    if (Date.now() - ultimaLimpeza > 6 * 3600000) {
      ultimaLimpeza = Date.now();
      await pool.query(`DELETE FROM webhook_eventos WHERE processado AND criado_em < NOW() - INTERVAL '30 days'`);
    }
  } catch (err) { console.error('[webhooks]', err.message); } finally { rodando = false; }
}
function agendar() {
  if (agendado) return;
  agendado = setInterval(rodada, 20 * 1000);
  setTimeout(rodada, 15 * 1000);
}

module.exports = { postar, EVENTOS, listar, criar, alterar, novoSegredo, excluir, entregas, reenviar, enviarTeste, distribuir, enviarPendentes, rodada, agendar, assinatura, ipPrivado, lerUrl };
