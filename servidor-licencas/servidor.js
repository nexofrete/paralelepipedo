// Servidor de licenças do Nexofrete: as instalações com licença "conferida
// pela internet" perguntam aqui, a cada 6 horas, se continuam valendo.
// Daqui o dono bloqueia, desbloqueia e renova clientes à distância.
//
// - Sem dependências (só Node 18+). Guarda tudo num JSON em DADOS_DIR.
// - Confere a chave do cliente com a chave PÚBLICA das licenças e responde
//   assinado com a chave PRIVADA do servidor (outro par, só daqui). Quem não
//   tem essa chave privada não consegue fingir ser este servidor.
// - Painel em "/" protegido pela senha ADMIN_SENHA (usuário: admin).
//
// Variáveis de ambiente:
//   ADMIN_SENHA                 senha do painel (obrigatória, 12+ caracteres)
//   CHAVE_PRIVADA_SERVIDOR      conteúdo do servidor-chave-privada.pem
//     ou CHAVE_PRIVADA_SERVIDOR_ARQUIVO  caminho do .pem
//   PORT (padrão 8080), DADOS_DIR (padrão ./dados), CONFIAR_PROXY=1 atrás de proxy/HTTPS
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CHAVE_PUBLICA_LICENCAS = process.env.CHAVE_PUBLICA_LICENCAS || `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAaK8m3ODzBJgrl9Jj3RI1SvIhvaOwJChkKjBBiMy90jg=
-----END PUBLIC KEY-----
`;
const CHAVE_PUBLICA_SERVIDOR = process.env.CHAVE_PUBLICA_SERVIDOR || `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEArg7FyNY0lvj/CTU7dRWffcMFZDcBeSYWVR5ltqwPIGo=
-----END PUBLIC KEY-----
`;

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const normalizarCodigo = (v) => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/(.{5})(?=.)/g, '$1-');

function lerChaveLicenca(texto) {
  const m = /^NXF1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(texto || '').replace(/\s+/g, ''));
  if (!m) return null;
  const buf = deB64u(m[1]);
  try { if (!crypto.verify(null, buf, crypto.createPublicKey(CHAVE_PUBLICA_LICENCAS), deB64u(m[2]))) return null; } catch { return null; }
  try { return JSON.parse(buf.toString('utf8')); } catch { return null; }
}

function criarServidor({ senha, chavePrivada, dadosDir, confiarProxy = false, agora = () => Date.now() }) {
  if (!senha || String(senha).length < 12) throw new Error('Defina ADMIN_SENHA com pelo menos 12 caracteres.');
  const privada = crypto.createPrivateKey(chavePrivada);
  const teste = Buffer.from('nexofrete-servidor');
  if (!crypto.verify(null, teste, crypto.createPublicKey(CHAVE_PUBLICA_SERVIDOR), crypto.sign(null, teste, privada))) {
    throw new Error('A chave privada do servidor não é o par da chave pública que vai dentro do sistema.');
  }
  fs.mkdirSync(dadosDir, { recursive: true });
  const ARQ = path.join(dadosDir, 'licencas.json');
  let banco = {};
  try { banco = JSON.parse(fs.readFileSync(ARQ, 'utf8')); } catch { banco = {}; }
  const salvar = () => { const tmp = `${ARQ}.tmp`; fs.writeFileSync(tmp, JSON.stringify(banco, null, 2)); fs.renameSync(tmp, ARQ); };

  const assinar = (dados) => { const buf = Buffer.from(JSON.stringify(dados), 'utf8'); return `NXR1.${b64u(buf)}.${b64u(crypto.sign(null, buf, privada))}`; };

  function registrar(d) {
    if (!banco[d.id]) {
      banco[d.id] = { id: d.id, cliente: d.cliente, cnpj: d.cnpj, maquina: d.maquina, emitida: d.emitida, validadeOriginal: d.validade || null,
        validade: d.validade || null, status: 'ativa', mensagem: '', nota: '', criadoEm: agora(), contatos: 0 };
    }
    return banco[d.id];
  }

  // Limite simples por IP (memória): evita abuso do /api/verificar e chute de senha.
  const janelas = new Map();
  function limitar(chave, max, janelaMs) {
    const t = agora(); const j = janelas.get(chave);
    if (!j || t - j.inicio > janelaMs) { janelas.set(chave, { inicio: t, n: 1 }); return true; }
    j.n += 1; return j.n <= max;
  }
  setInterval(() => { const t = agora(); for (const [k, j] of janelas) if (t - j.inicio > 3600000) janelas.delete(k); }, 600000).unref();

  const ipDe = (req) => (confiarProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '';
  const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const lerCorpo = (req) => new Promise((ok, falha) => {
    let n = 0; const partes = [];
    req.on('data', (c) => { n += c.length; if (n > 65536) { falha(new Error('corpo grande demais')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch { falha(new Error('JSON inválido')); } });
    req.on('error', falha);
  });

  const senhaHash = crypto.createHash('sha256').update(String(senha)).digest();
  function autorizado(req) {
    const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return false;
    const [, s = ''] = /^[^:]*:(.*)$/s.exec(Buffer.from(m[1], 'base64').toString('utf8')) || [];
    return crypto.timingSafeEqual(crypto.createHash('sha256').update(s).digest(), senhaHash);
  }

  async function verificar(req, res) {
    const ip = ipDe(req);
    if (!limitar(`v:${ip}`, 120, 3600000)) return json(res, 429, { erro: 'Muitas consultas deste endereço.' });
    let corpo;
    try { corpo = await lerCorpo(req); } catch (e) { return json(res, 400, { erro: e.message }); }
    const d = lerChaveLicenca(corpo.chave);
    if (!d || !d.id) return json(res, 400, { erro: 'Chave de licença inválida.' });
    const codigo = normalizarCodigo(corpo.codigo);
    if (codigo !== normalizarCodigo(d.maquina)) return json(res, 400, { erro: 'Esta licença é de outro computador.' });
    const r = registrar(d);
    Object.assign(r, { ultimoContato: agora(), ip, versao: String(corpo.versao || '').slice(0, 20), contatos: (r.contatos || 0) + 1 });
    salvar();
    return json(res, 200, { resposta: assinar({ id: d.id, maquina: codigo, status: r.status, validade: r.validade, mensagem: r.status === 'bloqueada' ? r.mensagem || null : null, ts: agora() }) });
  }

  async function admin(req, res, url) {
    const ip = ipDe(req);
    if (!autorizado(req)) {
      if (req.headers.authorization && !limitar(`a:${ip}`, 10, 900000)) return json(res, 429, { erro: 'Tentativas demais. Espere 15 minutos.' });
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Licencas Nexofrete", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Senha necessária.');
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY' });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', 'painel.html')));
    }
    if (req.method === 'GET' && url.pathname === '/painel.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', 'painel.js')));
    }
    if (req.method === 'GET' && url.pathname === '/admin/licencas') {
      return json(res, 200, Object.values(banco).sort((a, b) => (b.ultimoContato || b.criadoEm) - (a.ultimoContato || a.criadoEm)));
    }
    let corpo;
    try { corpo = await lerCorpo(req); } catch (e) { return json(res, 400, { erro: e.message }); }
    // Cadastrar antes do primeiro contato (colando a chave emitida).
    if (req.method === 'POST' && url.pathname === '/admin/licencas') {
      const d = lerChaveLicenca(corpo.chave);
      if (!d || !d.id) return json(res, 400, { erro: 'Chave de licença inválida.' });
      const r = registrar(d); salvar();
      return json(res, 200, r);
    }
    const m = /^\/admin\/licencas\/([A-Za-z0-9_-]{1,40})$/.exec(url.pathname);
    if (m && req.method === 'POST') {
      const r = banco[m[1]];
      if (!r) return json(res, 404, { erro: 'Licença não encontrada.' });
      if (corpo.status !== undefined) { if (!['ativa', 'bloqueada'].includes(corpo.status)) return json(res, 400, { erro: 'Situação inválida.' }); r.status = corpo.status; }
      if (corpo.validade !== undefined) {
        if (corpo.validade !== null && !/^\d{4}-\d{2}-\d{2}$/.test(corpo.validade)) return json(res, 400, { erro: 'Validade inválida.' });
        r.validade = corpo.validade;
      }
      if (corpo.mensagem !== undefined) r.mensagem = String(corpo.mensagem || '').slice(0, 300);
      if (corpo.nota !== undefined) r.nota = String(corpo.nota || '').slice(0, 500);
      r.alteradoEm = agora(); salvar();
      return json(res, 200, r);
    }
    if (m && req.method === 'DELETE') { delete banco[m[1]]; salvar(); return json(res, 200, { ok: true }); }
    return json(res, 404, { erro: 'Não encontrado.' });
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const feito = url.pathname === '/api/verificar' && req.method === 'POST' ? verificar(req, res)
      : url.pathname === '/saude' ? Promise.resolve(json(res, 200, { ok: true }))
        : admin(req, res, url);
    feito.catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { erro: 'Erro interno.' }); });
  });
}

if (require.main === module) {
  const chave = process.env.CHAVE_PRIVADA_SERVIDOR
    || (process.env.CHAVE_PRIVADA_SERVIDOR_ARQUIVO && fs.readFileSync(process.env.CHAVE_PRIVADA_SERVIDOR_ARQUIVO, 'utf8'));
  if (!chave) { console.error('Defina CHAVE_PRIVADA_SERVIDOR (conteúdo do .pem) ou CHAVE_PRIVADA_SERVIDOR_ARQUIVO.'); process.exit(1); }
  try {
    const s = criarServidor({ senha: process.env.ADMIN_SENHA, chavePrivada: chave.replace(/\\n/g, '\n'),
      dadosDir: process.env.DADOS_DIR || path.join(__dirname, 'dados'), confiarProxy: process.env.CONFIAR_PROXY === '1' });
    const porta = Number(process.env.PORT) || 8080;
    s.listen(porta, () => console.log(`Servidor de licenças na porta ${porta}`));
  } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { criarServidor, lerChaveLicenca };
