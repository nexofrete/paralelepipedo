// Ticket de download: links que abrem em outra aba (DACTE, XML, boleto, planilhas...)
// não conseguem mandar o cabeçalho Authorization, então levam ?token= na URL. Para a
// senha de acesso (o token da sessão) não ficar no histórico do navegador, em proxies
// e em logs, a tela pede na hora do clique um ticket que:
//  • vale só para aquele caminho (o arquivo pedido) e só para GET;
//  • vence em 2 minutos (o mapa da roteirização: 8 horas, só para as imagens do mapa);
//  • não serve como sessão: a API recusa ticket no cabeçalho e token de sessão na URL.
const jwt = require('jsonwebtoken');
const config = require('./config');

const MINUTOS = 2;
// Caminhos que valem por prefixo (muitas imagens pedidas pelo próprio componente).
const PREFIXOS = { '/api/roteirizacao/mapa/': 8 * 60 };

const caminhoDe = (req) => String(req.originalUrl || req.url || '').split('?')[0];

function caminhoOk(caminho) {
  const c = String(caminho || '');
  return c.length <= 500 && /^\/api\/[A-Za-z0-9\-._~%@!$&'()*+,;=:/]*$/.test(c) && !c.includes('..') && !c.includes('//');
}

// dono: { id } (usuário do sistema) ou { pid, v } (usuário do portal do cliente).
function emitir(dono, caminho) {
  if (!caminhoOk(caminho)) throw Object.assign(new Error('Caminho de download inválido.'), { status: 400 });
  const prefixo = Object.prototype.hasOwnProperty.call(PREFIXOS, caminho);
  const minutos = prefixo ? PREFIXOS[caminho] : MINUTOS;
  const tipo = dono.pid ? 'dl-portal' : 'dl';
  return jwt.sign({ ...dono, tipo, p: caminho, pre: prefixo || undefined }, config.jwtSecret, { expiresIn: `${minutos}m` });
}

// Confere o ticket da URL: tipo certo, GET e o mesmo arquivo. Devolve o conteúdo ou null.
function conferir(token, req, tipo) {
  let p;
  try { p = jwt.verify(String(token), config.jwtSecret); } catch { return null; }
  if (p.tipo !== tipo || !['GET', 'HEAD'].includes(req.method)) return null;
  const c = caminhoDe(req);
  return (p.pre ? c.startsWith(p.p) : c === p.p) ? p : null;
}

const ERRO_LINK = 'Este link de download venceu ou não é deste arquivo. Volte ao sistema e clique de novo no botão.';

module.exports = { emitir, conferir, caminhoOk, ERRO_LINK, MINUTOS };
