// Sequência de entregas: simula a viagem (tempo de cada trecho, descarga,
// restrições de circulação e pausas do motorista) e procura a ordem que
// termina mais cedo — vizinho mais próximo e depois melhorias 2-opt e
// "mover uma parada", sempre medindo pela viagem simulada.
const { avaliar, relogio } = require('./restricoes');

// Horário em que o cliente recebe: { inicio: '08:00', fim: '18:00', dias: [1..5] }.
// Chegou antes, espera abrir; chegou depois (ou em dia sem recebimento), o próximo dia que recebe.
function proximoAtendimento(ms, rec) {
  if (!rec) return ms;
  const [hi, mi] = String(rec.inicio || '00:00').split(':').map(Number); const [hf, mf] = String(rec.fim || '23:59').split(':').map(Number);
  const abre = hi * 60 + mi; const fecha = hf * 60 + mf;
  const dias = (rec.dias && rec.dias.length ? rec.dias : [0, 1, 2, 3, 4, 5, 6]).map(Number);
  for (let k = 0; k < 8; k += 1) {
    const { dia, minuto } = relogio(ms);
    const inicioDoDia = ms - minuto * 60000;
    if (dias.includes(dia) && minuto < fecha) return minuto >= abre ? ms : inicioDoDia + abre * 60000;
    ms = inicioDoDia + 1440 * 60000;   // meia-noite do dia seguinte
  }
  return ms;
}

// Lei 13.103/2015: no máximo 5h30 de direção contínua, depois 30 min de descanso.
const DIRECAO_CONTINUA_MAX = 330; const PAUSA_MIN = 30;
const JORNADA_ALERTA = 600;   // 8h + 2h extras
const DESCANSO_ENTRE_JORNADAS = 660;   // 11h de descanso (pernoite)
const PENALIDADE_AVISO_MIN = 20;   // cada aviso de restrição "pesa" como 20 min, para evitar quando der

// ctx: { dur (min), dist (km) — matrizes com a origem no índice 0; paradas (índice 0 = origem);
//        saidaMs; regras; veiculo; voltar (volta à origem no fim);
//        pernoite (padrão true: ao completar 10h de jornada, para 11h) }
function simular(ordem, ctx) {
  let t = ctx.saidaMs;
  let direcaoContinua = 0; let dirigindo = 0; let km = 0; let avisos = 0; let pausasTotal = 0; let pernoitesTotal = 0; let conflitos = 0;
  let inicioJornada = ctx.saidaMs;
  const comPernoite = ctx.pernoite !== false;
  let atual = 0;
  const passos = [];
  const jornada = () => (t - inicioJornada) / 60000;
  const dirigir = (min) => {
    // Divide o trecho para encaixar as pausas de 30 min e, se preciso, o pernoite.
    let resto = min; let pausas = 0; let pernoites = 0;
    while (resto > 0) {
      const ateJornada = comPernoite ? JORNADA_ALERTA - jornada() : Infinity;
      const atePausa = DIRECAO_CONTINUA_MAX - direcaoContinua;
      if (comPernoite && ateJornada <= 0) {
        t += DESCANSO_ENTRE_JORNADAS * 60000; pernoites += 1; direcaoContinua = 0; inicioJornada = t;
        continue;
      }
      const agora = Math.min(resto, atePausa, ateJornada);
      t += agora * 60000; resto -= agora; dirigindo += agora; direcaoContinua += agora;
      if (resto > 0 && direcaoContinua >= DIRECAO_CONTINUA_MAX) { t += PAUSA_MIN * 60000; pausas += 1; direcaoContinua = 0; }
    }
    pausasTotal += pausas; pernoitesTotal += pernoites;
    return { pausas, pernoites };
  };
  const destinos = ctx.voltar ? [...ordem, 0] : ordem;
  for (const i of destinos) {
    const p = ctx.paradas[i];
    const legMin = ctx.dur[atual][i]; const legKm = ctx.dist[atual][i];
    const { pausas, pernoites } = dirigir(legMin);
    km += legKm;
    const chegada = t;
    let espera = 0; let alertas = [];
    if (i !== 0) {
      // Restrição de circulação e horário de recebimento, até os dois deixarem descarregar.
      let liberado = chegada; let esperouRecebimento = false;
      const esperas = []; let avisosAqui = [];
      for (let volta = 0; volta < 6; volta += 1) {
        const r = avaliar(ctx.regras, p, ctx.veiculo, liberado);
        esperas.push(...r.alertas.filter((a) => a.tipo === 'espera'));
        const aberto = proximoAtendimento(r.liberadoMs, ctx.recebimento);
        if (aberto !== r.liberadoMs) esperouRecebimento = true;
        if (aberto === liberado) { avisosAqui = r.alertas.filter((a) => a.tipo === 'aviso'); break; }
        liberado = aberto;
      }
      const estavel = avaliar(ctx.regras, p, ctx.veiculo, liberado).liberadoMs === liberado && proximoAtendimento(liberado, ctx.recebimento) === liberado;
      if (!estavel || liberado - chegada > 3 * 1440 * 60000) {
        // A restrição cobre todo o horário de recebimento: não há horário possível.
        // Entrega quando a restrição libera e avisa para combinar com o cliente.
        const r = avaliar(ctx.regras, p, ctx.veiculo, chegada);
        liberado = r.liberadoMs;
        alertas = [...r.alertas, { tipo: 'conflito', texto: `A restrição de circulação cobre todo o horário de recebimento do cliente (${ctx.recebimento?.inicio}–${ctx.recebimento?.fim}): só dá para entregar fora do horário (combine com o cliente) ou com um veículo menor (VUC).` }];
        conflitos += 1;
      } else {
        alertas = [...esperas.filter((a, k, todas) => todas.findIndex((x) => x.regraId === a.regraId) === k),
          ...(esperouRecebimento ? [{ tipo: 'espera', texto: `Fora do horário de recebimento do cliente (${ctx.recebimento.inicio}–${ctx.recebimento.fim}): descarrega ${relogio(liberado).texto}` }] : []),
          ...avisosAqui];
      }
      espera = Math.round((liberado - chegada) / 60000); t = liberado;
      avisos += alertas.filter((a) => a.tipo === 'aviso').length;
      if (espera >= PAUSA_MIN) direcaoContinua = 0;   // parado esperando também descansa
      if (comPernoite && espera >= DESCANSO_ENTRE_JORNADAS) inicioJornada = t;   // esperou a noite toda
      t += (Number(p.servicoMin) || 0) * 60000;
    }
    passos.push({ indice: i, legKm, legMin, pausas, pernoites, chegadaMs: chegada, esperaMin: espera, saidaMs: t, alertas,
      chegada: relogio(chegada).texto, saida: relogio(t).texto });
    atual = i;
  }
  const jornadaMin = Math.round((t - ctx.saidaMs) / 60000);
  const alertasJornada = [];
  if (pernoitesTotal) alertasJornada.push(`A viagem tem ${pernoitesTotal} pernoite(s): a cada 10h de jornada o motorista para 11h (Lei 13.103). Com dois motoristas o caminhão chega antes.`);
  else if (!comPernoite && jornadaMin > JORNADA_ALERTA) {
    alertasJornada.push(`A viagem leva ${Math.floor(jornadaMin / 60)}h${String(jornadaMin % 60).padStart(2, '0')} — passa da jornada de 10h (8h + 2h extras): planeje pernoite ou um segundo motorista.`);
  }
  return { passos, fimMs: t, km, dirigindoMin: Math.round(dirigindo), jornadaMin, pausas: pausasTotal, pernoites: pernoitesTotal, avisos,
    // Conflito sem horário possível pesa muito: o otimizador evita se outra ordem resolver.
    custo: t + avisos * PENALIDADE_AVISO_MIN * 60000 + conflitos * 1440 * 60000, conflitos, alertasJornada };
}

function otimizar(ctx) {
  const n = ctx.paradas.length - 1;
  if (n <= 1) return [1].slice(0, n);
  // 1) Vizinho mais próximo, pelo tempo de viagem.
  const resto = new Set(Array.from({ length: n }, (_, k) => k + 1));
  let atual = 0; const ordem = [];
  while (resto.size) {
    let melhor = null;
    for (const j of resto) if (melhor == null || ctx.dur[atual][j] < ctx.dur[atual][melhor]) melhor = j;
    ordem.push(melhor); resto.delete(melhor); atual = melhor;
  }
  // 2) Melhorias medidas pela viagem simulada (inclui esperas e pausas).
  let melhorOrdem = ordem; let melhorCusto = simular(ordem, ctx).custo;
  for (let rodada = 0, melhorou = true; melhorou && rodada < 50; rodada += 1) {
    melhorou = false;
    for (let a = 0; a < n - 1; a += 1) {
      for (let b = a + 1; b < n; b += 1) {
        // 2-opt: inverte o pedaço a..b
        const inv = [...melhorOrdem.slice(0, a), ...melhorOrdem.slice(a, b + 1).reverse(), ...melhorOrdem.slice(b + 1)];
        const c1 = simular(inv, ctx).custo;
        if (c1 < melhorCusto - 1000) { melhorOrdem = inv; melhorCusto = c1; melhorou = true; }
        // mover a parada "a" para a posição "b"
        const mov = [...melhorOrdem]; const [x] = mov.splice(a, 1); mov.splice(b, 0, x);
        const c2 = simular(mov, ctx).custo;
        if (c2 < melhorCusto - 1000) { melhorOrdem = mov; melhorCusto = c2; melhorou = true; }
      }
    }
  }
  return melhorOrdem;
}

module.exports = { simular, otimizar, proximoAtendimento, DIRECAO_CONTINUA_MAX, PAUSA_MIN };
