// Célula de planilha (CSV) segura: texto que começa com = + - @ (ou tab/CR) vira
// texto puro para o Excel não executar como fórmula (nome de cliente "=HYPERLINK(...)").
// Números ("-12,50") ficam como estão. Aspas, separador e quebras de linha vão entre aspas.
const PERIGO = /^[=+\-@\t\r]/;
const NUMERO = /^-?\d+([.,]\d+)?$/;

function celula(v, sep = ';', { aspas = false } = {}) {
  let t = String(v ?? '');
  if (PERIGO.test(t) && !NUMERO.test(t)) t = `'${t}`;
  return aspas || t.includes(sep) || /["\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

module.exports = { celula };
