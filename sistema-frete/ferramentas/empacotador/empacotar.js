// Gera o .zip do Nexofrete para instalar ou atualizar (Manutenção → Atualizar
// o sistema) com o código do servidor OFUSCADO: quem abrir os arquivos vê um
// código embaralhado, difícil de entender e de alterar (por exemplo, para
// tirar a licença). O código original continua só com você.
//
// Uso (no seu computador, na pasta ferramentas/empacotador):
//   npm install        (só da primeira vez)
//   npm run empacotar  → saida/Nexofrete-<versão>.zip
//   node empacotar.js --sem-ofuscar   (pacote comum, para comparar)
//
// Fica fora do pacote: node_modules, backend/dados (licença, certificados,
// backups), backend/.env, os testes e esta pasta do empacotador.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { EscritorZip } = require('../../backend/src/utils/zip');

const RAIZ = path.resolve(__dirname, '..', '..');        // pasta sistema-frete
const SAIDA = path.join(__dirname, 'saida');
const ofuscar = !process.argv.includes('--sem-ofuscar');

const FORA = [
  /(^|\/)node_modules(\/|$)/, /(^|\/)\.git(\/|$)/, /^backend\/dados(\/|$)/, /^backend\/\.env/, /^backend\/test(\/|$)/,
  /^ferramentas\/empacotador(\/|$)/, /\.log$/i, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/i, /\.pem$/i,
];
// Ofusca o código do servidor (backend), não as telas (public), que o navegador baixa.
const deveOfuscar = (rel) => ofuscar && rel.startsWith('backend/') && !rel.startsWith('backend/public/') && rel.endsWith('.js');

const OPCOES = {
  target: 'node',
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,            // nomes globais e exports ficam (o sistema depende deles)
  stringArray: true,               // textos (inclusive a chave pública da licença) vão para uma tabela codificada
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  splitStrings: false,
  controlFlowFlattening: true,     // embaralha o fluxo; só em parte do código para não pesar
  controlFlowFlatteningThreshold: 0.3,
  deadCodeInjection: false,
  selfDefending: false,            // quebra fácil com antivírus/formatadores; não usar
  debugProtection: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  simplify: true,
  sourceMap: false,
};

function listar(pasta, rel = '') {
  const out = [];
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const r = rel ? `${rel}/${item.name}` : item.name;
    if (FORA.some((x) => x.test(r))) continue;
    if (item.isDirectory()) out.push(...listar(path.join(pasta, item.name), r));
    else if (item.isFile()) out.push(r);
  }
  return out;
}

function conferirSintaxe(codigo, nome) {
  const tmp = path.join(SAIDA, '.conferir.js');
  fs.writeFileSync(tmp, codigo);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (e) { throw new Error(`${nome}: o código ofuscado ficou inválido\n${e.stderr}`); } finally { fs.rmSync(tmp, { force: true }); }
}

function main() {
  const versao = require(path.join(RAIZ, 'backend', 'package.json')).version;
  fs.mkdirSync(SAIDA, { recursive: true });
  const destino = path.join(SAIDA, `Nexofrete-${versao}${ofuscar ? '' : '-sem-ofuscar'}.zip`);
  const arquivos = listar(RAIZ);
  // Nada sensível pode ir junto.
  for (const r of arquivos) {
    if (/\.(js|json|txt|pem|key)$/i.test(r) && /-----BEGIN (ENCRYPTED |RSA |EC )?PRIVATE KEY-----/.test(fs.readFileSync(path.join(RAIZ, r), 'utf8'))) {
      throw new Error(`O arquivo ${r} tem uma chave privada. Tire-o da pasta antes de empacotar.`);
    }
  }
  const zip = new EscritorZip(destino);
  let n = 0; let ofuscados = 0;
  try {
    for (const r of arquivos) {
      let conteudo = fs.readFileSync(path.join(RAIZ, r));
      if (r === 'backend/pacote.json') conteudo = Buffer.from(JSON.stringify({ gerado_em: new Date().toISOString() }));
      if (deveOfuscar(r)) {
        const original = conteudo.toString('utf8');
        // Mantém a primeira linha "#!" (se houver), que o ofuscador não aceita.
        const shebang = original.startsWith('#!') ? original.slice(0, original.indexOf('\n') + 1) : '';
        const codigo = shebang + JavaScriptObfuscator.obfuscate(original.slice(shebang.length), OPCOES).getObfuscatedCode();
        conferirSintaxe(codigo, r);
        conteudo = Buffer.from(codigo, 'utf8'); ofuscados += 1;
      }
      zip.adicionar(`sistema-frete/${r}`, conteudo); n += 1;
      if (n % 50 === 0) process.stdout.write(`  ${n}/${arquivos.length} arquivos...\n`);
    }
  } catch (e) { zip.fechar(); fs.rmSync(destino, { force: true }); throw e; }
  const r = zip.fechar();
  console.log(`\nPronto: ${destino}\n  ${n} arquivos (${ofuscados} ofuscados), ${(r.tamanho / 1048576).toFixed(1)} MB`);
  console.log('  Use este .zip para instalar no cliente ou em Manutenção → Atualizar o sistema.');
}

try { main(); } catch (e) { console.error(`\nErro: ${e.message}`); process.exit(1); }
