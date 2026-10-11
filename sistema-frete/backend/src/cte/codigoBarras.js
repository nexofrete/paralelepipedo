// Código de barras Code 128 em SVG (chave de acesso do DACTE).
// Só dígitos em quantidade par → conjunto C (mais compacto); senão, conjunto B.
const PADROES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const INICIO_B = 104; const INICIO_C = 105; const FIM = 106;

function codigos(texto) {
  const s = String(texto);
  if (/^\d+$/.test(s) && s.length % 2 === 0) {
    const c = [INICIO_C];
    for (let i = 0; i < s.length; i += 2) c.push(Number(s.slice(i, i + 2)));
    return c;
  }
  return [INICIO_B, ...[...s].map((ch) => ch.charCodeAt(0) - 32)];
}

function code128Svg(texto, { altura = 50, modulo = 1 } = {}) {
  const c = codigos(texto);
  const soma = c.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0);
  const seq = [...c, soma % 103, FIM].map((v) => PADROES[v]).join('');
  let x = 10 * modulo; // zona de silêncio
  let barras = '';
  [...seq].forEach((larg, i) => {
    const w = Number(larg) * modulo;
    if (i % 2 === 0) barras += `<rect x="${x}" y="0" width="${w}" height="${altura}"/>`;
    x += w;
  });
  const largura = x + 10 * modulo;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="100%" height="${altura}" preserveAspectRatio="none" fill="#000">${barras}</svg>`;
}

module.exports = { code128Svg };
