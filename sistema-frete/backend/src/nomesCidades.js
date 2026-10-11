// Padroniza nomes de cidade digitados à mão (ex: cidade do redespacho vinda do
// ERP), pra mesma cidade não aparecer várias vezes nos relatórios:
//   "São Paulo" / "SAO PAULO"                          → "SAO PAULO"
//   "SAO PAULO FRETE POR CONTA DO DESTINO EM RELACAO…" → "SAO PAULO"
//   "SAO PAULO - SP" / "SAO PAULO/SP"                  → "SAO PAULO"
//   "GARULHOS" (erro de digitação)                     → "GUARULHOS" (se for parecida com uma cidade conhecida)

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

function normalizarCidade(texto) {
  let t = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  // Corta textos que vêm grudados no nome (observações do ERP).
  t = t.split(/\s+(FRETE|FRETES|POR CONTA|CONFORME|OBS|REDESPACHO|ENTREGA|A\/C)\b/)[0];
  t = t.split(/\s[-–]\s|\(|;/)[0];
  t = t.replace(/[^A-Z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Tira a UF no fim ("SAO PAULO SP").
  const partes = t.split(' ');
  if (partes.length > 1 && UFS.has(partes[partes.length - 1])) partes.pop();
  return partes.join(' ').trim();
}

// Distância de edição (quantas letras mudam de uma palavra pra outra).
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length];
}

// Se o nome não é uma cidade conhecida mas é quase igual a uma (1 letra de
// diferença, ou 2 em nomes compridos), troca pela conhecida.
function corrigirPelaLista(nome, conhecidas) {
  if (!nome || conhecidas.has(nome) || nome.length < 5) return nome;
  let melhor = null;
  let menor = 99;
  for (const c of conhecidas) {
    const d = distancia(nome, c);
    if (d < menor) { menor = d; melhor = c; }
  }
  const limite = nome.length >= 9 ? 2 : 1;
  return menor <= limite ? melhor : nome;
}

module.exports = { normalizarCidade, corrigirPelaLista };
