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
// Chave pública do SERVIDOR de licenças (outro par de chaves): confere que a
// resposta "ativa/bloqueada" veio mesmo do servidor do dono.
const CHAVE_PUBLICA_SERVIDOR = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEArg7FyNY0lvj/CTU7dRWffcMFZDcBeSYWVR5ltqwPIGo=
-----END PUBLIC KEY-----
`;
const ARQUIVO_ONLINE = path.join(PASTA_DADOS, 'licenca-online.json');
const CONFIG_LICENCIADOR = path.join(PASTA_LICENCIADOR, 'config.json');
const AVISO_DIAS = 15;
const TOLERANCIA_DIAS = 7;
// Licença com conferência pela internet: sem confirmar por mais de 10 dias, só consulta.
const OFFLINE_AVISO_DIAS = 3;
const OFFLINE_LIMITE_DIAS = 10;
const DIA_MS = 86400000;

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
  let validade = d.validade || null;
  let avisoOnline = '';
  if (d.online) {
    // O servidor do dono manda: bloqueio, renovação (validade nova) e a última confirmação.
    const o = estadoOnline(d.id);
    info.online = { servidor: d.servidor, confirmadoEm: o.confirmadoEm || null, ultimoErro: o.ultimoErro || null, status: o.status || null };
    if (o.status === 'bloqueada') {
      return { ...info, ativo: true, emissao: false, situacao: 'bloqueada', mensagem: o.mensagem || 'A licença foi suspensa pelo fornecedor do sistema. O sistema está só para consulta.' };
    }
    if (o.validade !== undefined) { validade = o.validade; info.validade = validade; }
    // Conta da última confirmação; nunca confirmada, da emissão da chave (colar a
    // chave de novo não reinicia o prazo).
    const referencia = o.confirmadoEm || Date.parse(`${d.emitida}T03:00:00Z`) || 0;
    const agora = Date.now();
    if (referencia && agora < referencia - DIA_MS) {
      return { ...info, ativo: true, emissao: false, situacao: 'sem_confirmacao', mensagem: 'O relógio deste computador está atrasado em relação à última conferência da licença. Acerte a data e a hora.' };
    }
    const dias = Math.floor((agora - referencia) / DIA_MS);
    if (!referencia || dias > OFFLINE_LIMITE_DIAS) {
      return { ...info, ativo: true, emissao: false, situacao: 'sem_confirmacao',
        mensagem: `Não consegui conferir a licença pela internet há ${referencia ? `${dias} dias` : 'muito tempo'}. O sistema está só para consulta: verifique a internet deste computador.` };
    }
    if (dias >= OFFLINE_AVISO_DIAS) avisoOnline = ` Não consegui conferir a licença pela internet há ${dias} dias (o limite é ${OFFLINE_LIMITE_DIAS}): verifique a internet.`;
  }
  if (validade) {
    const dias = diasEntre(hoje(), validade);
    if (dias < -TOLERANCIA_DIAS) {
      return { ...info, ativo: true, emissao: false, situacao: 'vencida', diasRestantes: dias,
        mensagem: `A licença venceu em ${validade.split('-').reverse().join('/')}. O sistema está só para consulta: renove para voltar a emitir.` };
    }
    if (dias < 0) {
      return { ...info, ativo: true, emissao: true, situacao: 'tolerancia', diasRestantes: dias,
        mensagem: `A licença venceu em ${validade.split('-').reverse().join('/')}. Faltam ${TOLERANCIA_DIAS + dias} dia(s) de tolerância: renove para não parar.${avisoOnline}` };
    }
    if (dias <= AVISO_DIAS) return { ...info, ativo: true, emissao: true, situacao: 'vencendo', diasRestantes: dias, mensagem: `A licença vence em ${dias} dia(s) (${validade.split('-').reverse().join('/')}).${avisoOnline}` };
  }
  if (avisoOnline) return { ...info, ativo: true, emissao: true, situacao: 'confirmar', mensagem: avisoOnline.trim() };
  return { ...info, ativo: true, emissao: true, situacao: 'ativa', mensagem: validade ? `Licença válida até ${validade.split('-').reverse().join('/')}.` : 'Licença sem vencimento.' };
}

// ---------- Conferência pela internet ----------
function estadoOnline(id) {
  try { const o = JSON.parse(fs.readFileSync(ARQUIVO_ONLINE, 'utf8')); return o.id === id ? o : {}; } catch { return {}; }
}
function gravarOnline(o) { fs.mkdirSync(PASTA_DADOS, { recursive: true }); fs.writeFileSync(ARQUIVO_ONLINE, JSON.stringify(o, null, 2)); estadoEmCache = null; }

// Resposta do servidor = NXR1.<dados>.<assinatura com a chave do servidor>.
function lerResposta(texto, publica = CHAVE_PUBLICA_SERVIDOR) {
  const m = /^NXR1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(texto || '').trim());
  if (!m) return null;
  const buf = deB64u(m[1]);
  try { if (!crypto.verify(null, buf, crypto.createPublicKey(publica), deB64u(m[2]))) return null; } catch { return null; }
  try { return JSON.parse(buf.toString('utf8')); } catch { return null; }
}

// Pergunta ao servidor do dono se a licença continua valendo (bloqueio/renovação).
async function conferirOnline() {
  const conteudo = fs.existsSync(ARQUIVO_LICENCA) ? fs.readFileSync(ARQUIVO_LICENCA, 'utf8') : '';
  const l = lerChave(conteudo);
  if (!l.ok || !l.dados.online || !l.dados.servidor || temLicenciador()) return { conferida: false };
  const d = l.dados; const antes = estadoOnline(d.id);
  try {
    const versao = require('../package.json').version;
    const r = await fetch(`${String(d.servidor).replace(/\/+$/, '')}/api/verificar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ chave: l.texto, codigo: codigoDaMaquina(), versao }),
    });
    const j = await r.json().catch(() => ({}));
    const resp = lerResposta(j.resposta);
    if (!resp) throw new Error(j.erro || `o servidor de licenças respondeu ${r.status} sem resposta válida`);
    if (resp.id !== d.id || normalizarCodigo(resp.maquina) !== codigoDaMaquina()) throw new Error('resposta do servidor não é desta licença');
    if (antes.confirmadoEm && resp.ts < antes.confirmadoEm) throw new Error('resposta antiga do servidor');
    if (Math.abs(resp.ts - Date.now()) > 2 * DIA_MS) throw new Error('o relógio deste computador está errado (confira a data e a hora)');
    gravarOnline({ id: d.id, confirmadoEm: resp.ts, status: resp.status, validade: resp.validade === undefined ? d.validade || null : resp.validade, mensagem: resp.mensagem || null, ultimoErro: null });
    return { conferida: true, status: resp.status };
  } catch (err) {
    const motivo = /fetch failed|timeout|abort/i.test(err.message) ? 'sem resposta do servidor de licenças (internet ou servidor fora do ar)' : err.message;
    gravarOnline({ ...antes, id: d.id, ultimoErro: `${new Date().toLocaleString('pt-BR')}: ${motivo}` });
    return { conferida: false, erro: motivo };
  }
}

// Confere 30 s depois de ligar e a cada 6 horas.
function agendarConferencia() {
  setTimeout(() => conferirOnline().catch(() => {}), 30000).unref?.();
  setInterval(() => conferirOnline().catch(() => {}), 6 * 3600000).unref?.();
}

let estadoEmCache = null; let estadoEm = 0;
function estado() {
  // Recalcula a cada 10 minutos (a data muda; a licença pode ser trocada).
  // Sem ativação, a cada 5 s: pôr a chave privada do licenciador na pasta
  // dados/licenciador já libera, sem reiniciar.
  const validoPor = estadoEmCache && !estadoEmCache.ativo ? 5000 : 600000;
  if (!estadoEmCache || Date.now() - estadoEm > validoPor) { estadoEmCache = avaliar(); estadoEm = Date.now(); }
  return estadoEmCache;
}

function ativar(texto) {
  const r = avaliar(String(texto || ''));
  if (r.situacao === 'licenciador') return r;
  if (!['ativa', 'vencendo', 'tolerancia'].includes(r.situacao)) throw new Error(r.mensagem);
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  const l = lerChave(texto);
  fs.writeFileSync(ARQUIVO_LICENCA, l.texto);
  // Licença com conferência pela internet: já confere agora.
  if (l.dados.online) conferirOnline().catch(() => {});
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
// Aceita o arquivo salvo pelo Bloco de Notas: "chave-privada.pem.txt", com
// espaços, linhas em branco ou BOM. Remonta o PEM só com o miolo base64.
function lerPem(texto) {
  const m = /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/.exec(String(texto).replace(/^\uFEFF/, ''));
  if (!m) return null;
  const miolo = m[1].replace(/[^A-Za-z0-9+/=]/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${miolo.match(/.{1,64}/g)?.join('\n') || ''}\n-----END PRIVATE KEY-----\n`;
}
function chavePrivada() {
  const arquivo = [CHAVE_PRIVADA, `${CHAVE_PRIVADA}.txt`].find((a) => fs.existsSync(a));
  if (!arquivo) return null;
  try {
    const pem = lerPem(fs.readFileSync(arquivo, 'utf8'));
    if (!pem) return null;
    const k = crypto.createPrivateKey(pem);
    // Só vale se for o par da chave pública do sistema.
    const teste = Buffer.from('nexofrete');
    return crypto.verify(null, teste, crypto.createPublicKey(CHAVE_PUBLICA), crypto.sign(null, teste, k)) ? k : null;
  } catch { return null; }
}
function temLicenciador() { return !!chavePrivada(); }

function configLicenciador() { try { return JSON.parse(fs.readFileSync(CONFIG_LICENCIADOR, 'utf8')); } catch { return {}; } }
function salvarConfigLicenciador(c) { fs.mkdirSync(PASTA_LICENCIADOR, { recursive: true }); fs.writeFileSync(CONFIG_LICENCIADOR, JSON.stringify({ ...configLicenciador(), ...c }, null, 2)); }

function emitir({ cliente, cnpj, maquina, validade, observacao, online, servidor }) {
  const k = chavePrivada();
  if (!k) throw new Error('Este computador não é o licenciador.');
  const codigo = normalizarCodigo(maquina);
  if (codigo.replace(/-/g, '').length !== 20) throw new Error('Código da máquina inválido (são 20 letras/números, em 4 grupos).');
  if (!String(cliente || '').trim()) throw new Error('Informe o nome do cliente.');
  if (raizCnpj(cnpj).length !== 8) throw new Error('Informe o CNPJ do cliente.');
  if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) throw new Error('Validade inválida.');
  const dados = { v: 1, id: crypto.randomBytes(6).toString('hex'), cliente: String(cliente).trim().slice(0, 80), cnpj: String(cnpj).replace(/[^0-9A-Za-z]/g, '').toUpperCase(),
    maquina: codigo, emitida: hoje(), validade: validade || null };
  if (online) {
    const url = String(servidor || configLicenciador().servidor || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[^\s/]+/.test(url)) throw new Error('Para conferir pela internet, informe o endereço do servidor de licenças (https://...).');
    dados.online = true; dados.servidor = url;
    salvarConfigLicenciador({ servidor: url });
  }
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

module.exports = { conferirOnline, agendarConferencia, lerResposta, configLicenciador, montarChave, codigoDaMaquina, estado, ativar, avaliar, conferirEmpresa, emitir, listarEmitidas, temLicenciador, contato, lerChave, normalizarCodigo, CHAVE_PRIVADA };
