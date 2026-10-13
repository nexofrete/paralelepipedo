// Licença de uso do Nexofrete: cada instalação só funciona ativada por uma
// chave emitida pelo dono do sistema.
//
// - A instalação mostra o CÓDIGO DA MÁQUINA (tirado do identificador do
//   Windows, que não muda ao copiar a pasta do sistema).
// - O dono gera a CHAVE DE ATIVAÇÃO com a chave privada, que fica só no
//   computador dele (backend/dados/licenciador/chave-privada.pem — a pasta
//   dados nunca vai nos pacotes nem no Git). A chave é assinada (Ed25519): não
//   dá para inventar uma nem mudar o que está nela.
// - A chave vale para aquela máquina e aquela empresa (CNPJ): copiar o sistema
//   para outro computador ou usar com outro CNPJ não funciona.
// - Pode ter validade (assinatura mensal/anual): avisa 15 dias antes; depois
//   de vencida, 7 dias de tolerância e então o sistema fica só para consulta
//   (os documentos fiscais do cliente continuam acessíveis; não emite nada).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PASTA_DADOS = path.join(__dirname, '..', 'dados');
const ARQUIVO_LICENCA = path.join(PASTA_DADOS, 'licenca.txt');
const PASTA_LICENCIADOR = path.join(PASTA_DADOS, 'licenciador');
const CHAVE_PRIVADA = path.join(PASTA_LICENCIADOR, 'chave-privada.pem');
const EMITIDAS = path.join(PASTA_LICENCIADOR, 'emitidas.json');
const CHAVE_PUBLICA = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAaK8m3ODzBJgrl9Jj3RI1SvIhvaOwJChkKjBBiMy90jg=
-----END PUBLIC KEY-----
`;
const AVISO_DIAS = 15;
const TOLERANCIA_DIAS = 7;

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const raizCnpj = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

// ---------- Código da máquina ----------
function identificadorDoSistema() {
  try {
    if (process.platform === 'win32') {
      const saida = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const m = /MachineGuid\s+REG_\w+\s+([0-9a-f-]+)/i.exec(saida);
      if (m) return `win:${m[1].toLowerCase()}`;
    } else if (process.platform === 'darwin') {
      const saida = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 5000 });
      const m = /"IOPlatformUUID" = "([^"]+)"/.exec(saida);
      if (m) return `mac:${m[1].toLowerCase()}`;
    } else {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        const id = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
        if (id) return `linux:${id}`;
      }
    }
  } catch { /* cai no plano B */ }
  return `host:${os.hostname()}|${os.cpus()[0]?.model || ''}|${os.platform()}`;
}
let codigoEmCache = null;
function codigoDaMaquina() {
  if (!codigoEmCache) {
    const h = crypto.createHash('sha256').update(`nexofrete-maquina|${identificadorDoSistema()}`).digest('hex').toUpperCase().slice(0, 20);
    codigoEmCache = h.match(/.{5}/g).join('-');
  }
  return codigoEmCache;
}
const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 20).match(/.{1,5}/g)?.join('-') || '';

// ---------- Chave de ativação ----------
function lerChave(texto, publica = CHAVE_PUBLICA) {
  const t = String(texto || '').replace(/\s+/g, '');
  const m = /^NXF1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) return { ok: false, motivo: 'Chave de ativação em formato inválido. Copie a chave inteira (começa com NXF1.).' };
  const dadosBuf = deB64u(m[1]);
  let valida = false;
  try { valida = crypto.verify(null, dadosBuf, crypto.createPublicKey(publica), deB64u(m[2])); } catch { valida = false; }
  if (!valida) return { ok: false, motivo: 'Chave de ativação inválida (não foi emitida pelo dono do sistema ou foi alterada).' };
  let dados;
  try { dados = JSON.parse(dadosBuf.toString('utf8')); } catch { return { ok: false, motivo: 'Chave de ativação corrompida.' }; }
  return { ok: true, dados, texto: t };
}

// Situação da licença desta instalação.
function avaliar(texto = null) {
  const base = { codigo: codigoDaMaquina(), licenciador: temLicenciador() };
  // O computador do dono (com a chave privada certa) não precisa de licença.
  if (base.licenciador) return { ...base, ativo: true, emissao: true, situacao: 'licenciador', mensagem: 'Computador do licenciador.' };
  const conteudo = texto ?? (fs.existsSync(ARQUIVO_LICENCA) ? fs.readFileSync(ARQUIVO_LICENCA, 'utf8') : '');
  if (!conteudo.trim()) return { ...base, ativo: false, emissao: false, situacao: 'sem_licenca', mensagem: 'Sistema não ativado.' };
  const l = lerChave(conteudo);
  if (!l.ok) return { ...base, ativo: false, emissao: false, situacao: 'invalida', mensagem: l.motivo };
  const d = l.dados;
  const info = { ...base, cliente: d.cliente, cnpj: d.cnpj, validade: d.validade || null, emitida: d.emitida, id: d.id };
  if (normalizarCodigo(d.maquina) !== codigoDaMaquina()) {
    return { ...info, ativo: false, emissao: false, situacao: 'maquina_diferente', mensagem: 'Esta chave de ativação é de outro computador. Peça uma chave para este computador.' };
  }
  if (d.validade) {
    const dias = diasEntre(hoje(), d.validade);
    if (dias < -TOLERANCIA_DIAS) {
      return { ...info, ativo: true, emissao: false, situacao: 'vencida', diasRestantes: dias,
        mensagem: `A licença venceu em ${d.validade.split('-').reverse().join('/')}. O sistema está só para consulta: renove para voltar a emitir.` };
    }
    if (dias < 0) {
      return { ...info, ativo: true, emissao: true, situacao: 'tolerancia', diasRestantes: dias,
        mensagem: `A licença venceu em ${d.validade.split('-').reverse().join('/')}. Faltam ${TOLERANCIA_DIAS + dias} dia(s) de tolerância: renove para não parar.` };
    }
    if (dias <= AVISO_DIAS) return { ...info, ativo: true, emissao: true, situacao: 'vencendo', diasRestantes: dias, mensagem: `A licença vence em ${dias} dia(s) (${d.validade.split('-').reverse().join('/')}).` };
  }
  return { ...info, ativo: true, emissao: true, situacao: 'ativa', mensagem: d.validade ? `Licença válida até ${d.validade.split('-').reverse().join('/')}.` : 'Licença sem vencimento.' };
}

let estadoEmCache = null; let estadoEm = 0;
function estado() {
  // Recalcula a cada 10 minutos (a data muda; a licença pode ser trocada).
  if (!estadoEmCache || Date.now() - estadoEm > 600000) { estadoEmCache = avaliar(); estadoEm = Date.now(); }
  return estadoEmCache;
}

function ativar(texto) {
  const r = avaliar(String(texto || ''));
  if (r.situacao === 'licenciador') return r;
  if (!['ativa', 'vencendo', 'tolerancia'].includes(r.situacao)) throw new Error(r.mensagem);
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  fs.writeFileSync(ARQUIVO_LICENCA, lerChave(texto).texto);
  estadoEmCache = null;
  return estado();
}

// A empresa da Configuração fiscal tem que ser a da licença (mesma raiz de CNPJ).
function conferirEmpresa(cnpjEmpresa) {
  const e = estado();
  if (e.situacao === 'licenciador' || !e.cnpj) return;
  if (raizCnpj(cnpjEmpresa) && raizCnpj(cnpjEmpresa) !== raizCnpj(e.cnpj)) {
    throw Object.assign(new Error(`Esta licença é da empresa ${e.cliente} (CNPJ ${e.cnpj}). O CNPJ da Configuração fiscal é de outra empresa: peça uma licença para ela.`), { status: 423 });
  }
  if (!e.emissao) throw Object.assign(new Error(e.mensagem), { status: 423 });
}

// ---------- Licenciador (só no computador do dono) ----------
function chavePrivada() {
  if (!fs.existsSync(CHAVE_PRIVADA)) return null;
  try {
    const k = crypto.createPrivateKey(fs.readFileSync(CHAVE_PRIVADA));
    // Só vale se for o par da chave pública do sistema.
    const teste = Buffer.from('nexofrete');
    return crypto.verify(null, teste, crypto.createPublicKey(CHAVE_PUBLICA), crypto.sign(null, teste, k)) ? k : null;
  } catch { return null; }
}
function temLicenciador() { return !!chavePrivada(); }

function emitir({ cliente, cnpj, maquina, validade, observacao }) {
  const k = chavePrivada();
  if (!k) throw new Error('Este computador não é o licenciador.');
  const codigo = normalizarCodigo(maquina);
  if (codigo.replace(/-/g, '').length !== 20) throw new Error('Código da máquina inválido (são 20 letras/números, em 4 grupos).');
  if (!String(cliente || '').trim()) throw new Error('Informe o nome do cliente.');
  if (raizCnpj(cnpj).length !== 8) throw new Error('Informe o CNPJ do cliente.');
  if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) throw new Error('Validade inválida.');
  const dados = { v: 1, id: crypto.randomBytes(6).toString('hex'), cliente: String(cliente).trim().slice(0, 80), cnpj: String(cnpj).replace(/[^0-9A-Za-z]/g, '').toUpperCase(),
    maquina: codigo, emitida: hoje(), validade: validade || null };
  const chave = montarChave(dados, k);
  const lista = listarEmitidas();
  lista.unshift({ ...dados, observacao: String(observacao || '').slice(0, 200), chave });
  fs.writeFileSync(EMITIDAS, JSON.stringify(lista.slice(0, 2000), null, 2));
  return { chave, ...dados };
}
// Chave = NXF1.<dados em base64url>.<assinatura Ed25519 dos dados>
function montarChave(dados, chavePrivadaKey) {
  const buf = Buffer.from(JSON.stringify(dados), 'utf8');
  return `NXF1.${b64u(buf)}.${b64u(crypto.sign(null, buf, chavePrivadaKey))}`;
}
function listarEmitidas() {
  try { return JSON.parse(fs.readFileSync(EMITIDAS, 'utf8')); } catch { return []; }
}

// Contato do dono para o cliente pedir a ativação (aparece na tela de ativação).
function contato() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'licenca-contato.json'), 'utf8')); } catch { return {}; }
}

module.exports = { montarChave, codigoDaMaquina, estado, ativar, avaliar, conferirEmpresa, emitir, listarEmitidas, temLicenciador, contato, lerChave, normalizarCodigo, CHAVE_PRIVADA };
