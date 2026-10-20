// CNPJ/CPF no servidor — com o CNPJ alfanumérico (Receita, a partir de 07/2026):
// as 12 primeiras posições podem ter letras (A-Z); os 2 dígitos verificadores são números.
//  • limpar(v): o documento só com os caracteres que valem — letras maiúsculas e números
//    no CNPJ alfanumérico; só números nos demais (CPF, CNPJ numérico, lixo digitado).
//  • cnpjValido / cpfValido / valido: conferem o dígito verificador (no CNPJ, cada
//    caractere vale o código ASCII − 48, que é a regra nova e também vale para o numérico).
const chars = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const ehCnpjAlfanumerico = (c) => /^[0-9A-Z]{12}\d{2}$/.test(c) && /[A-Z]/.test(c);

function limpar(v, max = 14) {
  const c = chars(v);
  const d = ehCnpjAlfanumerico(c) ? c : c.replace(/\D/g, '');
  return d.slice(0, max) || null;
}

// Só os números (CEP, telefone, IBGE, código de barras... e documentos que só podem ser numéricos, como o CPF).
const digitos = (v) => String(v ?? '').replace(/\D/g, '');

// Os 2 dígitos verificadores do CNPJ a partir das 12 primeiras posições (numéricas ou com letras).
function dvCnpj(base12) {
  const b = chars(base12).slice(0, 12);
  const val = (ch) => ch.charCodeAt(0) - 48;
  const calc = (txt, pesos) => { const r = pesos.reduce((s, p, i) => s + val(txt[i]) * p, 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = calc(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(`${b}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d1}${d2}`;
}
function cnpjValido(v) {
  const d = chars(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  return dvCnpj(d.slice(0, 12)) === d.slice(12);
}
function cpfValido(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (n) => { let s = 0; for (let i = 0; i < n; i += 1) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}
const valido = (v) => { const d = limpar(v) || ''; return d.length === 14 ? cnpjValido(d) : d.length === 11 ? cpfValido(d) : false; };
// Tamanho de CNPJ (14) ou CPF (11), sem conferir o dígito (dados que vêm de nota/planilha antiga).
const formatoOk = (v) => [11, 14].includes((limpar(v) || '').length);

function formatar(v) {
  const d = limpar(v) || '';
  if (d.length === 14) return d.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v == null ? '' : String(v);
}

module.exports = { chars, digitos, dvCnpj, limpar, ehCnpjAlfanumerico, cnpjValido, cpfValido, valido, formatoOk, formatar };
