// Restrições de circulação de caminhões por cidade: janelas de dia/horário em
// que um tipo de veículo não pode circular (ex.: ZMRC de São Paulo) e rodízio
// por final de placa. Horários sempre no horário de Brasília (UTC−3, sem
// horário de verão desde 2019).
const { norm } = require('./municipios');

const FUSO_MS = 3 * 3600 * 1000;
const CATEGORIAS = {
  utilitario: 'Utilitário (Fiorino, Kangoo)', vuc: 'VUC', tres_quartos: '3/4', toco: 'Toco', truck: 'Truck', carreta: 'Carreta',
};
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// "2026-10-13T07:30" (horário de Brasília) → milissegundos.
const deBrasilia = (texto) => Date.parse(`${String(texto).slice(0, 16)}:00-03:00`);
// Milissegundos → { dia da semana, minuto do dia, texto "seg 13/10 07:30" } em Brasília.
function relogio(ms) {
  const d = new Date(ms - FUSO_MS);
  const dia = d.getUTCDay();
  const minuto = d.getUTCHours() * 60 + d.getUTCMinutes();
  const p2 = (n) => String(n).padStart(2, '0');
  return { dia, minuto, texto: `${DIAS[dia]} ${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`,
    hora: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` };
}
const minutos = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const lista = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean);

// A regra vale para essa parada e esse veículo?
function aplica(regra, parada, veiculo) {
  if (regra.ativo === false) return false;
  if (norm(regra.cidade) !== norm(parada.cidade) || String(regra.uf || '').toUpperCase() !== String(parada.uf || '').toUpperCase()) return false;
  const bairros = lista(regra.bairros).map(norm);
  if (bairros.length && !bairros.includes(norm(parada.bairro))) return false;
  const cats = lista(regra.categorias);
  if (cats.length && !cats.includes(veiculo.categoria)) return false;
  return true;
}

// Se a regra está valendo no instante "ms", devolve quando a janela acaba; senão null.
function fimDaJanela(regra, ms, veiculo) {
  const { dia, minuto } = relogio(ms);
  const dias = lista(regra.dias).map(Number);
  const ini = minutos(regra.inicio); const fim = minutos(regra.fim);
  const inicioDoDia = ms - minuto * 60000;
  let fimMs = null;
  if (ini < fim) {
    if (dias.includes(dia) && minuto >= ini && minuto < fim) fimMs = inicioDoDia + fim * 60000;
  } else if (dias.includes(dia) && minuto >= ini) fimMs = inicioDoDia + (1440 + fim) * 60000;   // atravessa a meia-noite
  else if (dias.includes((dia + 6) % 7) && minuto < fim) fimMs = inicioDoDia + fim * 60000;
  if (fimMs == null) return null;
  if (regra.tipo === 'rodizio') {
    // Rodízio: só vale para os finais de placa do dia (ex.: {"1":"1,2", "2":"3,4"}).
    const finais = lista((regra.finais || {})[String(dia)]);
    if (veiculo.placaFinal == null || veiculo.placaFinal === '' || !finais.includes(String(veiculo.placaFinal))) return null;
  }
  return fimMs;
}

function descrever(regra) {
  const dias = lista(regra.dias).map((d) => DIAS[Number(d)]).join(', ');
  return `${regra.descricao || 'Restrição'} (${regra.cidade}/${regra.uf}${lista(regra.bairros).length ? ` — ${lista(regra.bairros).join(', ')}` : ''}: ${dias} ${regra.inicio}–${regra.fim})`;
}

// Chegada numa parada: espera o fim das janelas de "esperar" e junta os avisos
// das regras de "avisar". Devolve { liberadoMs, esperaMin, alertas }.
function avaliar(regras, parada, veiculo, chegadaMs) {
  let t = chegadaMs;
  const alertas = [];
  const aplicaveis = (regras || []).filter((r) => aplica(r, parada, veiculo));
  for (let volta = 0; volta < 10; volta += 1) {
    let adiou = false;
    for (const r of aplicaveis.filter((x) => x.efeito !== 'avisar')) {
      const fim = fimDaJanela(r, t, veiculo);
      if (fim != null && fim > t) {
        alertas.push({ tipo: 'espera', regraId: r.id, texto: `${descrever(r)}: chegada ${relogio(t).hora} — espera até ${relogio(fim).texto}` });
        t = fim; adiou = true;
      }
    }
    if (!adiou) break;
  }
  for (const r of aplicaveis.filter((x) => x.efeito === 'avisar')) {
    if (fimDaJanela(r, t, veiculo) != null) alertas.push({ tipo: 'aviso', regraId: r.id, texto: `${descrever(r)}: atenção na chegada às ${relogio(t).hora}` });
  }
  return { liberadoMs: t, esperaMin: Math.round((t - chegadaMs) / 60000), alertas };
}

module.exports = { CATEGORIAS, DIAS, deBrasilia, relogio, aplica, fimDaJanela, avaliar, descrever };
