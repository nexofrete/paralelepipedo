// Segurança das contas dos usuários do sistema:
//  • Sessões: cada login vira uma sessão guardada no banco (aparelho, IP, último uso). Sair, encerrar
//    pela tela, trocar a senha ou desativar o usuário derruba a sessão na hora.
//  • Política de senha (Manutenção » Segurança): tamanho mínimo, letras e números, bloqueio depois de
//    várias tentativas erradas (com aviso aos administradores) e troca periódica.
//  • Esqueci a senha: código de 8 números por e-mail, vale 30 minutos, uma vez só, 5 tentativas.
//  • Dois fatores por aplicativo autenticador (TOTP, RFC 6238), com códigos de recuperação; e a
//    obrigatoriedade (ninguém, administradores ou todos).
const crypto = require('crypto');
const pool = require('./db');
const { criptografar, descriptografar } = require('./rastreioLonngren');

const falha = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

// ---------- Política ----------
const PADRAO = { senha_min: 8, senha_variedade: true, bloqueio_tentativas: 5, bloqueio_minutos: 15, senha_validade_dias: 0, exigir_2fa: 'nao' };
let cache = null; let cacheEm = 0;
async function politica() {
  if (cache && Date.now() - cacheEm < 30000) return cache;
  const { rows: [c] } = await pool.query('SELECT * FROM configuracao_seguranca WHERE id = 1');
  cache = { ...PADRAO, ...Object.fromEntries(Object.keys(PADRAO).filter((k) => c?.[k] != null).map((k) => [k, c[k]])) };
  cacheEm = Date.now();
  return cache;
}
const limparCache = () => { cache = null; };
// Texto do erro, ou null se a senha serve.
function problemaDaSenha(senha, pol) {
  const s = String(senha || '');
  const min = Math.max(8, Number(pol.senha_min) || 8);
  if (s.length < min) return `A senha precisa ter pelo menos ${min} caracteres.`;
  if (pol.senha_variedade && !(/[A-Za-zÀ-ÿ]/.test(s) && /\d/.test(s))) return 'A senha precisa ter letras e números.';
  return null;
}
async function validarSenha(senha) {
  const p = problemaDaSenha(senha, await politica());
  if (p) throw falha(p);
}
const senhaVencida = (u, pol) => Number(pol.senha_validade_dias) > 0 && u.senha_alterada_em
  && Date.now() - new Date(u.senha_alterada_em).getTime() > Number(pol.senha_validade_dias) * 86400000;
// 2FA obrigatório e o usuário ainda não tem nenhum (nem por e-mail, nem por aplicativo)?
async function precisaConfigurar2fa(u) {
  if (u.totp_ativo || u.dois_fatores_ativo) return false;
  const p = await politica();
  return p.exigir_2fa === 'todos' || (p.exigir_2fa === 'admins' && u.perfil === 'admin');
}

// ---------- Tentativas erradas e bloqueio ----------
async function registrarFalha(u) {
  const p = await politica();
  const limite = Number(p.bloqueio_tentativas) || 0;
  const { rows: [r] } = await pool.query(
    `UPDATE usuarios SET tentativas_falhas = tentativas_falhas + 1,
            bloqueado_ate = CASE WHEN $2 > 0 AND tentativas_falhas + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval ELSE bloqueado_ate END
      WHERE id = $1 RETURNING tentativas_falhas, bloqueado_ate`, [u.id, limite, String(Number(p.bloqueio_minutos) || 15)]);
  const bloqueou = limite > 0 && r.tentativas_falhas === limite;
  if (bloqueou) {
    require('./auditoria').registrar({ usuarioId: u.id, usuarioNome: u.nome, acao: 'conta_bloqueada',
      detalhes: `Conta bloqueada por ${p.bloqueio_minutos} minuto(s) depois de ${limite} senhas erradas` });
    avisarAdmins(u, p).catch((e) => console.error('[segurança] aviso de bloqueio:', e.message));
  }
  return { bloqueou, minutos: Number(p.bloqueio_minutos) || 15 };
}
async function avisarAdmins(u, p) {
  const { rows } = await pool.query("SELECT nome, email FROM usuarios WHERE perfil = 'admin' AND ativo AND email IS NOT NULL AND id <> $1", [u.id]);
  const email = require('./email');
  for (const a of rows) {
    await email.enviarAvisoSeguranca({ destinatarioEmail: a.email, destinatarioNome: a.nome, assunto: `Conta de ${u.nome} bloqueada`,
      texto: `A conta de ${u.nome} (${u.email}) foi bloqueada por ${p.bloqueio_minutos} minuto(s) depois de ${p.bloqueio_tentativas} senhas erradas seguidas. Se não foi a própria pessoa, alguém pode estar tentando entrar. Para liberar antes: Cadastros » Usuários » Editar » Desbloquear.` }).catch(() => {});
  }
}
const limparFalhas = (id) => pool.query('UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = $1', [id]);

// ---------- Sessões ----------
function aparelho(ua) {
  const s = String(ua || '');
  const nav = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'Navegador';
  const so = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Mac OS/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : '';
  return `${nav}${so ? ` no ${so}` : ''}`;
}
async function criarSessao(usuarioId, req) {
  const id = crypto.randomUUID();
  await pool.query('INSERT INTO sessoes (id, usuario_id, ip, aparelho) VALUES ($1, $2, $3, $4)',
    [id, usuarioId, String(req?.ip || '').slice(0, 60) || null, aparelho(req?.get?.('user-agent')).slice(0, 120)]);
  return id;
}
// Confere a sessão do token e marca o uso (no máximo a cada minuto). false = encerrada ou inexistente.
async function sessaoAtiva(id, usuarioId) {
  const { rows } = await pool.query(
    `UPDATE sessoes SET ultimo_uso = CASE WHEN ultimo_uso < NOW() - INTERVAL '1 minute' THEN NOW() ELSE ultimo_uso END
      WHERE id = $1 AND usuario_id = $2 AND encerrada_em IS NULL RETURNING id`, [id, usuarioId]);
  return !!rows[0];
}
async function encerrarSessao(id, motivo) {
  await pool.query('UPDATE sessoes SET encerrada_em = NOW(), motivo = $2 WHERE id = $1 AND encerrada_em IS NULL', [id, motivo]);
}
// Todas as sessões do usuário (menos uma, se informada). Também invalida os tokens antigos, sem sessão.
async function encerrarTodas(usuarioId, motivo, exceto = null) {
  const { rowCount } = await pool.query('UPDATE sessoes SET encerrada_em = NOW(), motivo = $2 WHERE usuario_id = $1 AND encerrada_em IS NULL AND id IS DISTINCT FROM $3',
    [usuarioId, motivo, exceto]);
  await pool.query('UPDATE usuarios SET sessoes_invalidadas_em = NOW() WHERE id = $1', [usuarioId]);
  return rowCount;
}
async function sessoesDo(usuarioId) {
  const { rows } = await pool.query(
    `SELECT id, criado_em, ultimo_uso, ip, aparelho FROM sessoes WHERE usuario_id = $1 AND encerrada_em IS NULL
        AND ultimo_uso > NOW() - INTERVAL '8 hours' ORDER BY ultimo_uso DESC LIMIT 50`, [usuarioId]);
  return rows;
}
// Limpeza: sessões velhas (o token dura 8 horas) e códigos vencidos.
async function limparVelhas() {
  await pool.query("DELETE FROM sessoes WHERE COALESCE(encerrada_em, ultimo_uso) < NOW() - INTERVAL '30 days'");
  await pool.query("DELETE FROM senha_redefinicoes WHERE expira_em < NOW() - INTERVAL '1 day'");
}

// ---------- Esqueci a senha ----------
async function pedirRedefinicao(email) {
  const { rows: [u] } = await pool.query('SELECT id, nome, email FROM usuarios WHERE LOWER(email) = LOWER($1) AND ativo = TRUE', [String(email || '').trim()]);
  if (!u) return;   // não conta se o e-mail existe
  const { rows: [recente] } = await pool.query("SELECT 1 FROM senha_redefinicoes WHERE usuario_id = $1 AND criado_em > NOW() - INTERVAL '1 minute'", [u.id]);
  if (recente) return;
  const codigo = String(crypto.randomInt(10000000, 100000000));
  await pool.query('UPDATE senha_redefinicoes SET usado_em = NOW() WHERE usuario_id = $1 AND usado_em IS NULL', [u.id]);
  await pool.query("INSERT INTO senha_redefinicoes (usuario_id, hash, expira_em) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')", [u.id, hash(codigo)]);
  await require('./email').enviarCodigoRedefinicao({ destinatarioEmail: u.email, destinatarioNome: u.nome, codigo });
  require('./auditoria').registrar({ usuarioId: u.id, usuarioNome: u.nome, acao: 'esqueci_senha', detalhes: 'Pediu o código para redefinir a senha' });
}
async function redefinir(email, codigo, novaSenha) {
  const { rows: [u] } = await pool.query('SELECT id, nome FROM usuarios WHERE LOWER(email) = LOWER($1) AND ativo = TRUE', [String(email || '').trim()]);
  const { rows: [r] } = u ? await pool.query(
    'SELECT id, hash, tentativas FROM senha_redefinicoes WHERE usuario_id = $1 AND usado_em IS NULL AND expira_em > NOW() ORDER BY id DESC LIMIT 1', [u.id]) : { rows: [] };
  if (!u || !r) throw falha('Código vencido ou inválido. Peça um código novo.');
  if (r.hash !== hash(String(codigo || '').replace(/\D/g, ''))) {
    const t = r.tentativas + 1;
    await pool.query(`UPDATE senha_redefinicoes SET tentativas = $2${t >= 5 ? ', usado_em = NOW()' : ''} WHERE id = $1`, [r.id, t]);
    throw falha(t >= 5 ? 'Código errado demais vezes. Peça um código novo.' : 'Código incorreto.');
  }
  await validarSenha(novaSenha);
  const bcrypt = require('bcryptjs');
  await pool.query(`UPDATE usuarios SET senha_hash = $2, trocar_senha = FALSE, senha_alterada_em = NOW(), tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = $1`,
    [u.id, await bcrypt.hash(novaSenha, 10)]);
  await pool.query('UPDATE senha_redefinicoes SET usado_em = NOW() WHERE id = $1', [r.id]);
  await encerrarTodas(u.id, 'senha redefinida');
  require('./auditoria').registrar({ usuarioId: u.id, usuarioNome: u.nome, acao: 'redefinir_senha', detalhes: 'Redefiniu a senha pelo código enviado por e-mail (sessões abertas encerradas)' });
}

// ---------- TOTP (aplicativo autenticador) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0; let valor = 0; let out = '';
  for (const b of buf) { valor = (valor << 8) | b; bits += 8; while (bits >= 5) { out += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(valor << (5 - bits)) & 31];
  return out;
}
function deBase32(txt) {
  let bits = 0; let valor = 0; const out = [];
  for (const ch of String(txt).toUpperCase().replace(/[^A-Z2-7]/g, '')) { valor = (valor << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function codigoTotp(segredo, passo) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(passo));
  const h = crypto.createHmac('sha1', deBase32(segredo)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
}
// Aceita o código do passo atual e um antes/depois (relógio do celular um pouco fora). Devolve o passo usado.
function verificarTotp(segredo, codigo, agora = Date.now()) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length !== 6) return null;
  const passo = Math.floor(agora / 30000);
  for (const d of [0, -1, 1]) {
    const a = Buffer.from(codigoTotp(segredo, passo + d)); const b = Buffer.from(c);
    if (crypto.timingSafeEqual(a, b)) return passo + d;
  }
  return null;
}
async function iniciarTotp(u) {
  const segredo = base32(crypto.randomBytes(20));
  await pool.query('UPDATE usuarios SET totp_pendente = $2 WHERE id = $1', [u.id, criptografar(segredo)]);
  const { rows: [e] } = await pool.query('SELECT COALESCE(nome_fantasia, razao_social) AS nome FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
  const emissor = `Nexofrete${e?.nome ? ` - ${String(e.nome).slice(0, 30)}` : ''}`;
  const uri = `otpauth://totp/${encodeURIComponent(`${emissor}:${u.email || u.nome}`)}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
  const qr = await require('qrcode').toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { segredo: segredo.replace(/(.{4})/g, '$1 ').trim(), qr };
}
function novosCodigosRecuperacao() {
  return Array.from({ length: 8 }, () => `${crypto.randomInt(0, 100000).toString().padStart(5, '0')}-${crypto.randomInt(0, 100000).toString().padStart(5, '0')}`);
}
async function confirmarTotp(u, codigo) {
  const { rows: [x] } = await pool.query('SELECT totp_pendente FROM usuarios WHERE id = $1', [u.id]);
  const segredo = x?.totp_pendente ? descriptografar(x.totp_pendente) : null;
  if (!segredo) throw falha('Comece de novo: clique em "Ativar aplicativo autenticador".');
  const passo = verificarTotp(segredo, codigo);
  if (passo == null) throw falha('Código incorreto. Confira se o relógio do celular está certo e digite o código que aparece agora.');
  const codigos = novosCodigosRecuperacao();
  await pool.query(`UPDATE usuarios SET totp_segredo = $2, totp_pendente = NULL, totp_ativo = TRUE, totp_ultimo_passo = $3, totp_recuperacao = $4 WHERE id = $1`,
    [u.id, x.totp_pendente, passo, codigos.map((c) => hash(c.replace(/\D/g, '')))]);
  return codigos;
}
async function novosCodigos(u) {
  const codigos = novosCodigosRecuperacao();
  await pool.query('UPDATE usuarios SET totp_recuperacao = $2 WHERE id = $1 AND totp_ativo', [u.id, codigos.map((c) => hash(c.replace(/\D/g, '')))]);
  return codigos;
}
async function desligarTotp(usuarioId) {
  await pool.query('UPDATE usuarios SET totp_ativo = FALSE, totp_segredo = NULL, totp_pendente = NULL, totp_recuperacao = NULL, totp_ultimo_passo = NULL WHERE id = $1', [usuarioId]);
}
// Login: código do aplicativo (não aceita o mesmo código duas vezes) ou um código de recuperação (usa e descarta).
async function conferirSegundoFator(usuarioId, codigo) {
  const { rows: [u] } = await pool.query('SELECT totp_segredo, totp_ultimo_passo, totp_recuperacao FROM usuarios WHERE id = $1', [usuarioId]);
  if (!u?.totp_segredo) return false;
  const passo = verificarTotp(descriptografar(u.totp_segredo), codigo);
  if (passo != null) {
    if (u.totp_ultimo_passo != null && passo <= Number(u.totp_ultimo_passo)) return false;
    await pool.query('UPDATE usuarios SET totp_ultimo_passo = $2 WHERE id = $1', [usuarioId, passo]);
    return true;
  }
  const h = hash(String(codigo || '').replace(/\D/g, ''));
  if ((u.totp_recuperacao || []).includes(h)) {
    await pool.query('UPDATE usuarios SET totp_recuperacao = array_remove(totp_recuperacao, $2) WHERE id = $1', [usuarioId, h]);
    return 'recuperacao';
  }
  return false;
}

module.exports = {
  PADRAO, politica, limparCache, problemaDaSenha, validarSenha, senhaVencida, precisaConfigurar2fa,
  registrarFalha, limparFalhas, criarSessao, sessaoAtiva, encerrarSessao, encerrarTodas, sessoesDo, limparVelhas, aparelho,
  pedirRedefinicao, redefinir, base32, deBase32, codigoTotp, verificarTotp, iniciarTotp, confirmarTotp, novosCodigos, desligarTotp, conferirSegundoFator,
};
