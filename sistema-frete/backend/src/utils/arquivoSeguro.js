// Fotos e PDFs enviados por motorista/usuário (comprovante, canhoto, coleta).
// O tipo vem do CONTEÚDO do arquivo (assinatura dos primeiros bytes), nunca do
// nome nem do que o navegador diz — senão um "x.html" disfarçado de foto seria
// aberto como página do sistema e rodaria código com a sessão de quem abrisse.
const path = require('path');

const TIPOS = {
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.pdf': 'application/pdf',
};

// { ext, mime } ou null quando não é foto/PDF.
function detectarTipo(buf, { pdf = true } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const ini = (s) => buf.slice(0, s.length).equals(Buffer.from(s, 'latin1'));
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', mime: TIPOS['.jpg'] };
  if (ini('\x89PNG\r\n\x1a\n')) return { ext: '.png', mime: TIPOS['.png'] };
  if (ini('RIFF') && buf.slice(8, 12).toString('latin1') === 'WEBP') return { ext: '.webp', mime: TIPOS['.webp'] };
  if (ini('GIF87a') || ini('GIF89a')) return { ext: '.gif', mime: TIPOS['.gif'] };
  if (buf.slice(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|mif1|msf1|heim|heis)$/.test(buf.slice(8, 12).toString('latin1'))) return { ext: '.heic', mime: TIPOS['.heic'] };
  if (pdf && ini('%PDF-')) return { ext: '.pdf', mime: TIPOS['.pdf'] };
  return null;
}

// Manda o arquivo com o tipo certo e sem poder virar página: imagem e PDF abrem
// no navegador (isolados), qualquer outra coisa (arquivo antigo) só baixa.
function servir(res, caminho) {
  const ext = path.extname(caminho).toLowerCase();
  const mime = TIPOS[ext === '.jpeg' ? '.jpg' : ext];
  res.set('X-Content-Type-Options', 'nosniff');
  if (!mime) {
    res.set('Content-Type', 'application/octet-stream');
    return res.download(caminho, `arquivo${ext.replace(/[^.a-z0-9]/g, '').slice(0, 6)}`);
  }
  res.set('Content-Type', mime);
  // Imagem: nada roda (sandbox). PDF: o leitor do navegador precisa de script próprio, então só o tipo fixo.
  if (mime.startsWith('image/')) res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  return res.sendFile(caminho, { headers: { 'Content-Type': mime } });
}

module.exports = { detectarTipo, servir, TIPOS };
