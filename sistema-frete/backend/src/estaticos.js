// Arquivos das telas (public/) mais leves e rápidos de abrir:
// - comprimidos (brotli ou gzip, o que o navegador aceitar), feito uma vez e guardado em memória;
// - nas páginas .html, cada script/estilo/imagem do próprio sistema ganha "?v=<impressão do conteúdo>",
//   e esses arquivos vão com cache longo: o navegador guarda e não pergunta de novo a cada abertura.
//   Quando o arquivo muda (atualização do sistema), a impressão muda e o navegador baixa a versão nova.
// O resto (fotos, arquivos sem ?v=) segue com o express.static de sempre.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
const UM_ANO = 'public, max-age=31536000, immutable';
// Referências relativas às pastas do sistema (js/, css/, vendor/, img/), sem "?" ainda.
const REFERENCIA = /\b(src|href)="((?:js|css|vendor|img)\/[^"?#]+\.(?:js|css|svg|png|ico|webp|jpg))"/g;

function criar(raiz) {
  const base = path.resolve(raiz);
  const cache = new Map();   // caminho → { mtimeMs, tamanho, corpo, hash, br, gzip }

  // Arquivo dentro de public/ (nunca fora dela) e o estado atual dele, ou null.
  function localizar(urlPath) {
    let rel;
    try { rel = decodeURIComponent(urlPath); } catch { return null; }
    if (rel.includes('\0')) return null;
    const arq = path.resolve(base, `.${path.posix.normalize(`/${rel}`)}`);
    if (!arq.startsWith(base + path.sep)) return null;
    let st;
    try { st = fs.statSync(arq); } catch { return null; }
    return st.isFile() ? { arq, st } : null;
  }
  function ler(arq, st) {
    const c = cache.get(arq);
    if (c && c.mtimeMs === st.mtimeMs && c.tamanho === st.size) return c;
    const corpo = fs.readFileSync(arq);
    const novo = { mtimeMs: st.mtimeMs, tamanho: st.size, corpo, hash: crypto.createHash('sha256').update(corpo).digest('hex').slice(0, 12) };
    cache.set(arq, novo);
    return novo;
  }
  const impressao = (rel) => { const l = localizar(rel); return l ? ler(l.arq, l.st).hash : null; };
  // Página .html com as referências versionadas (refeita quando a página ou um arquivo dela muda).
  function paginaVersionada(arq, st) {
    const item = ler(arq, st);
    const texto = item.corpo.toString('utf8').replace(REFERENCIA, (tudo, atr, rel) => {
      const h = impressao(rel);
      return h ? `${atr}="${rel}?v=${h}"` : tudo;
    });
    const hash = crypto.createHash('sha256').update(texto).digest('hex').slice(0, 16);
    if (item.versao?.hash !== hash) item.versao = { hash, corpo: Buffer.from(texto, 'utf8') };
    return item.versao;
  }
  function comprimido(obj, codificacao) {
    if (obj.corpo.length < 1024) return null;
    if (codificacao === 'br') {
      obj.br = obj.br || zlib.brotliCompressSync(obj.corpo, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: obj.corpo.length } });
      return obj.br;
    }
    obj.gzip = obj.gzip || zlib.gzipSync(obj.corpo, { level: 9 });
    return obj.gzip;
  }

  return function servir(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const urlPath = req.path === '/' ? null : req.path;
    if (!urlPath) return next();
    const ext = path.extname(urlPath).toLowerCase();
    if (!TIPOS[ext]) return next();
    const achado = localizar(urlPath);
    if (!achado) return next();
    const html = ext === '.html';
    const obj = html ? paginaVersionada(achado.arq, achado.st) : ler(achado.arq, achado.st);
    const etag = `"${obj.hash}"`;
    res.set('Content-Type', TIPOS[ext]);
    res.set('Vary', 'Accept-Encoding');
    res.set('ETag', etag);
    // Com ?v= (a página pediu esta versão exata): guarda por um ano. Sem: confere a cada abertura.
    res.set('Cache-Control', !html && req.query.v ? UM_ANO : 'no-cache');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    const aceita = String(req.headers['accept-encoding'] || '');
    const cod = /\bbr\b/.test(aceita) ? 'br' : /\bgzip\b/.test(aceita) ? 'gzip' : null;
    const corpo = cod ? comprimido(obj, cod) : null;
    if (corpo) res.set('Content-Encoding', cod);
    res.set('Content-Length', String((corpo || obj.corpo).length));
    return req.method === 'HEAD' ? res.end() : res.end(corpo || obj.corpo);
  };
}

// Respostas JSON da API comprimidas (as listas grandes caem para um quarto ou menos).
function comprimirJson(req, res, next) {
  const aceita = String(req.headers['accept-encoding'] || '');
  const cod = /\bgzip\b/.test(aceita) ? 'gzip' : null;
  if (!cod) return next();
  const original = res.json.bind(res);
  res.json = (obj) => {
    const texto = JSON.stringify(obj);
    if (texto === undefined || texto.length < 2048 || res.headersSent) return original(obj);
    const corpo = zlib.gzipSync(Buffer.from(texto, 'utf8'), { level: 6 });
    if (!res.get('Content-Type')) res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Encoding', cod);
    res.append('Vary', 'Accept-Encoding');
    res.set('Content-Length', String(corpo.length));
    return res.end(req.method === 'HEAD' ? undefined : corpo);
  };
  return next();
}

module.exports = { criar, comprimirJson, REFERENCIA };
