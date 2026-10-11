const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const backup = require('./backup');

// Atualização do sistema pela tela (Manutenção):
//  1) guarda o zip, 2) faz backup do banco, 3) extrai o zip numa pasta
//  temporária, 4) confere se é mesmo o Nexofrete, 5) copia por cima da pasta
//  do sistema (sem tocar no .env, na pasta dados e no node_modules), 6) se as
//  dependências mudaram, roda o npm install, 7) reinicia o servidor.

const RAIZ = path.join(__dirname, '..', '..');            // pasta sistema-frete
const PASTA_TRAB = path.join(__dirname, '..', 'dados', 'atualizacoes');
// Nunca sobrescrever: configuração, dados, dependências e os .bat que estão rodando agora.
const IGNORAR = [/^backend[\\/]\.env/i, /^backend[\\/]dados([\\/]|$)/i, /node_modules/i, /^iniciar(-teste)?\.bat$/i];

const rodar = (cmd, args, opcoes = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 1024 * 1024 * 32, ...opcoes }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
});

// Acha, dentro do que foi extraído, a pasta que tem backend/package.json.
function acharRaizExtraida(pasta, profundidade = 0) {
  if (fs.existsSync(path.join(pasta, 'backend', 'package.json'))) return pasta;
  if (profundidade > 2) return null;
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    if (item.isDirectory()) {
      const achou = acharRaizExtraida(path.join(pasta, item.name), profundidade + 1);
      if (achou) return achou;
    }
  }
  return null;
}

function copiarPorCima(origem, destino, relativo = '') {
  let copiados = 0;
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const rel = relativo ? path.join(relativo, item.name) : item.name;
    if (IGNORAR.some((r) => r.test(rel))) continue;
    const de = path.join(origem, item.name);
    const para = path.join(destino, item.name);
    if (item.isDirectory()) {
      fs.mkdirSync(para, { recursive: true });
      copiados += copiarPorCima(de, para, rel);
    } else {
      fs.copyFileSync(de, para);
      copiados += 1;
    }
  }
  return copiados;
}

async function aplicarAtualizacao(bufferZip, nomeArquivo) {
  const versaoAtual = require('../package.json').version;
  fs.rmSync(PASTA_TRAB, { recursive: true, force: true });
  fs.mkdirSync(PASTA_TRAB, { recursive: true });
  const zip = path.join(PASTA_TRAB, 'atualizacao.zip');
  fs.writeFileSync(zip, bufferZip);

  // Backup de segurança antes de mexer em qualquer arquivo. (Usava
  // executarBackupAgora, que o backup.js não exporta — a atualização parava aqui.)
  const seguranca = await backup.executarBackupComTratamentoDeErro();

  const extraido = path.join(PASTA_TRAB, 'extraido');
  fs.mkdirSync(extraido, { recursive: true });
  // O "tar" do Windows 10/11 abre .zip; no Linux/Mac usa o unzip.
  try {
    await rodar('tar', ['-xf', zip, '-C', extraido]);
  } catch (err) {
    await rodar('unzip', ['-q', '-o', zip, '-d', extraido]);
  }

  const raizNova = acharRaizExtraida(extraido);
  if (!raizNova) throw new Error('Esse arquivo não parece ser uma versão do Nexofrete (não achei backend/package.json dentro dele).');
  const pacoteNovo = JSON.parse(fs.readFileSync(path.join(raizNova, 'backend', 'package.json'), 'utf-8'));
  const pacoteAtual = JSON.parse(fs.readFileSync(path.join(RAIZ, 'backend', 'package.json'), 'utf-8'));
  const dependenciasMudaram = JSON.stringify(pacoteNovo.dependencies || {}) !== JSON.stringify(pacoteAtual.dependencies || {});

  const copiados = copiarPorCima(raizNova, RAIZ);

  if (dependenciasMudaram) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await rodar(npm, ['install', '--omit=dev'], { cwd: path.join(RAIZ, 'backend'), shell: process.platform === 'win32' });
  }

  fs.rmSync(PASTA_TRAB, { recursive: true, force: true });
  return { versaoAnterior: versaoAtual, versaoNova: pacoteNovo.version, copiados, seguranca: seguranca.arquivo, dependenciasMudaram, arquivo: nomeArquivo };
}

module.exports = { aplicarAtualizacao };
