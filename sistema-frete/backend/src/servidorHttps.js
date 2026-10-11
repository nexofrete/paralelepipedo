// HTTPS na rede da empresa (cadeado no navegador), opcional.
//
// O sistema cria uma "autoridade certificadora" (AC) só da empresa e, com
// ela, o certificado deste servidor — válido para o nome do computador,
// "localhost" e todos os IPs dele. Cada computador instala a AC UMA vez
// (instalador baixado em Manutenção » Segurança); a partir daí o navegador
// confia no endereço https:// do servidor, sem alerta.
//
// Arquivos em backend/dados/certificado/. Se o IP do servidor mudar, ou o
// certificado estiver perto de vencer, o do servidor é refeito sozinho com a
// mesma AC — os computadores não precisam reinstalar nada.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const pool = require('./db');

const PASTA = path.join(__dirname, '..', 'dados', 'certificado');
// A CHAVE da autoridade (o "carimbo do cartório") fica FORA da pasta do
// sistema: copiar a pasta sistema-frete (pendrive, outro computador) não leva
// o carimbo junto. Fica em C:\ProgramData\Nexofrete\certificado, com acesso
// só do usuário que roda o servidor.
const PASTA_CHAVE_AC = path.join(process.env.PROGRAMDATA || process.env.ALLUSERSPROFILE || os.homedir(), 'Nexofrete', 'certificado');
const ARQ = {
  acChave: path.join(PASTA_CHAVE_AC, 'ac-empresa.key.pem'), acCert: path.join(PASTA, 'ac-empresa.cert.pem'),
  chave: path.join(PASTA, 'servidor.key.pem'), cert: path.join(PASTA, 'servidor.cert.pem'),
};
// Tira a herança de permissões do arquivo e deixa só o usuário atual (Windows).
function protegerArquivo(arquivo) {
  if (process.platform !== 'win32') return;
  try {
    require('child_process').execFileSync('icacls', [arquivo, '/inheritance:r', '/grant:r', `${os.userInfo().username}:F`], { stdio: 'ignore' });
  } catch { /* sem icacls: segue com a permissão padrão */ }
}
let servidor = null;
let appRef = null;
let estado = { ativo: false, porta: 3443, erro: null, nomes: [] };

const forge = () => require('node-forge');
function novaChave() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return forge().pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }));
}
function serial() { return '01' + crypto.randomBytes(15).toString('hex'); }

// Faixas de rede interna que a autoridade pode atestar (e nada além delas).
const REDES_INTERNAS = [['10.0.0.0', '255.0.0.0'], ['172.16.0.0', '255.240.0.0'], ['192.168.0.0', '255.255.0.0'], ['127.0.0.0', '255.0.0.0']];
const ipNum = (ip) => ip.split('.').reduce((a, b) => (a * 256) + Number(b), 0);
const ehRedeInterna = (ip) => REDES_INTERNAS.some(([rede, mascara]) => (ipNum(ip) & ipNum(mascara)) >>> 0 === ipNum(rede) >>> 0);

// Nomes e IPs pelos quais o servidor é acessado na rede (só IPs de rede interna:
// a autoridade não pode atestar IP de internet).
function nomesDoServidor() {
  const ips = new Set(['127.0.0.1']);
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) if ((i.family === 'IPv4' || i.family === 4) && ehRedeInterna(i.address)) ips.add(i.address);
  }
  const nomes = new Set(['localhost', os.hostname(), os.hostname().toLowerCase()]);
  return { ips: [...ips], nomes: [...nomes] };
}

// NameConstraints (RFC 5280): permitted = nome deste computador + localhost + redes internas.
function restricaoDeNomes() {
  const { asn1 } = forge();
  const C = asn1.Class; const T = asn1.Type;
  const subarvore = (nomeGeral) => asn1.create(C.UNIVERSAL, T.SEQUENCE, true, [nomeGeral]);
  const dns = (nome) => subarvore(asn1.create(C.CONTEXT_SPECIFIC, 2, false, nome));
  const ip = (rede, mascara) => subarvore(asn1.create(C.CONTEXT_SPECIFIC, 7, false,
    String.fromCharCode(...rede.split('.').map(Number), ...mascara.split('.').map(Number))));
  const nomes = [...new Set([os.hostname(), os.hostname().toLowerCase(), 'localhost'])];
  return asn1.create(C.UNIVERSAL, T.SEQUENCE, true, [
    asn1.create(C.CONTEXT_SPECIFIC, 0, true, [...nomes.map(dns), ...REDES_INTERNAS.map(([r, m]) => ip(r, m))]),
  ]);
}

function criarAc() {
  const f = forge();
  const chave = novaChave();
  const cert = f.pki.createCertificate();
  cert.publicKey = f.pki.setRsaPublicKey(chave.n, chave.e);
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 86400000);
  const sujeito = [{ name: 'commonName', value: `Nexofrete - Autoridade da empresa (${os.hostname()})` }, { name: 'organizationName', value: 'Nexofrete' }];
  cert.setSubject(sujeito);
  cert.setIssuer(sujeito);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true, pathLenConstraint: 0 },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
    // Restrição de nomes: este "cartório" só vale para o nome deste computador
    // e endereços de rede interna. Mesmo que o carimbo vazasse, não serviria
    // pra imitar banco, Google ou qualquer site da internet.
    { id: '2.5.29.30', critical: true, value: restricaoDeNomes() },
  ]);
  cert.sign(chave, f.md.sha256.create());
  fs.mkdirSync(PASTA_CHAVE_AC, { recursive: true });
  fs.writeFileSync(ARQ.acChave, f.pki.privateKeyToPem(chave), { mode: 0o600 });
  protegerArquivo(ARQ.acChave);
  fs.writeFileSync(ARQ.acCert, f.pki.certificateToPem(cert));
}

function criarCertServidor() {
  const f = forge();
  const acChave = f.pki.privateKeyFromPem(fs.readFileSync(ARQ.acChave, 'utf8'));
  const acCert = f.pki.certificateFromPem(fs.readFileSync(ARQ.acCert, 'utf8'));
  const { ips, nomes } = nomesDoServidor();
  const chave = novaChave();
  const cert = f.pki.createCertificate();
  cert.publicKey = f.pki.setRsaPublicKey(chave.n, chave.e);
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 825 * 86400000);
  cert.setSubject([{ name: 'commonName', value: os.hostname() }, { name: 'organizationName', value: 'Nexofrete' }]);
  cert.setIssuer(acCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [...nomes.map((n) => ({ type: 2, value: n })), ...ips.map((ip) => ({ type: 7, ip }))] },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: acCert.generateSubjectKeyIdentifier().getBytes() },
  ]);
  cert.sign(acChave, f.md.sha256.create());
  fs.writeFileSync(ARQ.chave, f.pki.privateKeyToPem(chave), { mode: 0o600 });
  protegerArquivo(ARQ.chave);
  fs.writeFileSync(ARQ.cert, f.pki.certificateToPem(cert));
}

// A autoridade atual já tem a restrição de nomes? (autoridade de versão anterior
// do sistema, sem restrição, é refeita — ninguém instalou ainda.)
function acTemRestricao() {
  try {
    const raw = new crypto.X509Certificate(fs.readFileSync(ARQ.acCert)).raw;
    return raw.includes(Buffer.from([0x06, 0x03, 0x55, 0x1d, 0x1e]));   // OID 2.5.29.30
  } catch { return false; }
}

// "Impressão digital" (SHA-256) do certificado da empresa — o código que se
// confere na instalação. Formato: AB:CD:EF:...
function impressaoDigital() {
  try { return new crypto.X509Certificate(fs.readFileSync(ARQ.acCert)).fingerprint256; } catch { return null; }
}

// Cria o que faltar; refaz o do servidor se o IP mudou ou se está perto de vencer.
function garantirCertificados() {
  fs.mkdirSync(PASTA, { recursive: true });
  // Chave antiga dentro da pasta do sistema (versão anterior): a autoridade é refeita do jeito novo.
  const chaveAntiga = path.join(PASTA, 'ac-empresa.key.pem');
  if (fs.existsSync(chaveAntiga)) { try { fs.unlinkSync(chaveAntiga); } catch { /* segue */ } }
  if (!fs.existsSync(ARQ.acChave) || !fs.existsSync(ARQ.acCert) || !acTemRestricao()) {
    criarAc();
    if (fs.existsSync(ARQ.cert)) fs.unlinkSync(ARQ.cert);
  }
  let refazer = !fs.existsSync(ARQ.cert) || !fs.existsSync(ARQ.chave);
  if (!refazer) {
    const atual = new crypto.X509Certificate(fs.readFileSync(ARQ.cert));
    const san = String(atual.subjectAltName || '');
    const { ips } = nomesDoServidor();
    const faltaIp = ips.some((ip) => !san.includes(`IP Address:${ip}`));
    const venceLogo = new Date(atual.validTo).getTime() - Date.now() < 30 * 86400000;
    refazer = faltaIp || venceLogo;
  }
  if (refazer) criarCertServidor();
  const atual = new crypto.X509Certificate(fs.readFileSync(ARQ.cert));
  estado.nomes = String(atual.subjectAltName || '').split(',').map((x) => x.trim().replace(/^(DNS:|IP Address:)/, ''));
  estado.validade = atual.validTo;
}

async function buscarConfiguracao() {
  const { rows } = await pool.query('SELECT https_ativo, https_porta FROM configuracao_seguranca WHERE id = 1');
  return { ativo: !!rows[0]?.https_ativo, porta: Number(rows[0]?.https_porta) || 3443 };
}

// Liga/desliga o HTTPS conforme a configuração (sem reiniciar o sistema).
async function aplicar(app = appRef) {
  if (app) appRef = app;
  const cfg = await buscarConfiguracao();
  estado.porta = cfg.porta;
  if (!cfg.ativo) {
    if (servidor) { servidor.close(); servidor = null; }
    estado = { ...estado, ativo: false, erro: null };
    return estado;
  }
  try {
    garantirCertificados();
    const opcoes = { key: fs.readFileSync(ARQ.chave), cert: fs.readFileSync(ARQ.cert) };
    if (servidor) { servidor.setSecureContext(opcoes); estado = { ...estado, ativo: true, erro: null }; return estado; }
    await new Promise((resolve, reject) => {
      servidor = https.createServer(opcoes, appRef);
      servidor.once('error', reject);
      servidor.listen(cfg.porta, () => resolve());
    });
    estado = { ...estado, ativo: true, erro: null };
    console.log(`HTTPS ligado: https://${os.hostname()}:${cfg.porta}  (e https://<IP-do-servidor>:${cfg.porta})`);
  } catch (err) {
    servidor = null;
    estado = { ...estado, ativo: false, erro: err.code === 'EADDRINUSE' ? `a porta ${cfg.porta} já está em uso` : err.message };
    console.error('[https] Não consegui ligar o HTTPS:', estado.erro);
  }
  return estado;
}

// Confere 1x por dia se o IP mudou / se o certificado está perto de vencer.
function vigiar() {
  setInterval(() => {
    if (!servidor) return;
    try {
      const antes = fs.readFileSync(ARQ.cert, 'utf8');
      garantirCertificados();
      if (fs.readFileSync(ARQ.cert, 'utf8') !== antes) servidor.setSecureContext({ key: fs.readFileSync(ARQ.chave), cert: fs.readFileSync(ARQ.cert) });
    } catch (err) { console.error('[https]', err.message); }
  }, 24 * 3600 * 1000);
}

// Certificado da AC (público — é ele que cada computador instala).
function certificadoDaEmpresa() {
  fs.mkdirSync(PASTA, { recursive: true });
  if (!fs.existsSync(ARQ.acCert)) garantirCertificados();
  return fs.readFileSync(ARQ.acCert, 'utf8');
}

const status = () => ({ ...estado, impressaoDigital: fs.existsSync(ARQ.acCert) ? impressaoDigital() : null });

module.exports = { aplicar, vigiar, status, certificadoDaEmpresa, impressaoDigital };
