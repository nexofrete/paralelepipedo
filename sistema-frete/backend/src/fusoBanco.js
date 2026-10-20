// Fuso do banco: conferência e correção dos horários gravados com o fuso errado.
// Até a versão que fixou o fuso de Brasília em toda conexão (db.js), as colunas de data e hora sem
// fuso (autorização do CT-e/MDF-e, criação dos registros...) eram gravadas no fuso padrão do
// PostgreSQL. Num servidor em UTC, ficavam 3 horas adiantadas: um CT-e autorizado às 22h do dia 31
// caía no dia 1º do mês seguinte (livro de saídas, contabilidade, filtros por período).
//  • diagnosticar(): o fuso do servidor e da sessão, o relógio do banco e — o que vale — a comparação
//    da hora de autorização gravada com a hora do protocolo da SEFAZ (dhRecbto, que vem com o fuso
//    no XML autorizado). Diferença de 3h = CT-e/MDF-e gravado no fuso errado.
//  • corrigir(): acerta a hora de autorização desses CT-e/MDF-e pela hora do próprio protocolo
//    (exata, documento por documento; os demais não mudam).
const pool = require('./db');

const FUSO = 'America/Sao_Paulo';
const TOLERANCIA_MIN = 5;
const TABELAS = [['ctes_emitidos', 'CT-e', 'dhRecbto'], ['mdfes', 'MDF-e', 'dhRecbto']];

// Hora do protocolo (com fuso) no horário de Brasília, sem fuso — o que deveria estar gravado.
const horaProtocolo = (tag) => `(substring(xml_autorizado from '<${tag}>([^<]+)</${tag}>')::timestamptz AT TIME ZONE '${FUSO}')`;

async function conferirTabela([tabela, nome, tag]) {
  const certo = horaProtocolo(tag);
  const { rows: [r] } = await pool.query(
    `WITH d AS (
       SELECT id, autorizado_em, ${certo} AS certo, EXTRACT(EPOCH FROM (autorizado_em - ${certo})) / 60 AS dif
         FROM ${tabela} WHERE xml_autorizado ~ '<${tag}>[^<]+</${tag}>' AND autorizado_em IS NOT NULL)
     SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ABS(dif) <= ${TOLERANCIA_MIN})::int AS certos,
            COUNT(*) FILTER (WHERE ABS(dif) > ${TOLERANCIA_MIN})::int AS errados,
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY dif) FILTER (WHERE ABS(dif) > ${TOLERANCIA_MIN}))::int AS diferenca_min,
            MIN(autorizado_em) FILTER (WHERE ABS(dif) > ${TOLERANCIA_MIN})::text AS primeiro,
            MAX(autorizado_em) FILTER (WHERE ABS(dif) > ${TOLERANCIA_MIN})::text AS ultimo,
            COUNT(*) FILTER (WHERE ABS(dif) > ${TOLERANCIA_MIN} AND autorizado_em::date <> certo::date)::int AS dia_trocado,
            COUNT(*) FILTER (WHERE ABS(dif) > ${TOLERANCIA_MIN} AND date_trunc('month', autorizado_em) <> date_trunc('month', certo))::int AS mes_trocado
       FROM d`);
  return { tabela, documento: nome, ...r };
}

async function diagnosticar() {
  const [{ rows: [s] }, padrao] = await Promise.all([
    pool.query(`SELECT current_setting('TimeZone') AS sessao, NOW() AS agora, LOCALTIMESTAMP::text AS hora_banco`),
    pool.fusoPadraoServidor().catch((err) => `não consegui ler (${err.message})`),
  ]);
  const relogio = Math.round((new Date(s.agora).getTime() - Date.now()) / 1000);
  const docs = [];
  for (const t of TABELAS) docs.push(await conferirTabela(t));
  const errados = docs.reduce((n, d) => n + d.errados, 0);
  // Fuso do servidor com o mesmo horário de Brasília hoje (sem horário de verão desde 2019).
  const { rows: [z] } = await pool.query(
    `SELECT (NOW() AT TIME ZONE $1) = (NOW() AT TIME ZONE '${FUSO}') AS igual`, [String(padrao)]).catch(() => ({ rows: [{ igual: null }] }));
  const situacao = errados ? 'corrigir' : z.igual === false ? 'protegido' : 'ok';
  return {
    situacao, fuso_servidor: padrao, fuso_servidor_igual_brasilia: z.igual, fuso_sessao: s.sessao, hora_banco: s.hora_banco,
    relogio_diferenca_s: relogio, documentos: docs, errados,
    mensagem: {
      corrigir: `${errados} documento(s) com a hora de autorização gravada no fuso errado (diferença típica de ${Math.round((docs.find((d) => d.errados)?.diferenca_min || 0) / 60)}h). Corrija pelo botão abaixo — a hora certa vem do protocolo da SEFAZ de cada documento.`,
      protegido: `O PostgreSQL deste servidor está em ${padrao}, mas o sistema grava sempre no horário de Brasília (fuso fixado em cada conexão). Nenhum documento com hora errada.`,
      ok: 'Tudo certo: o banco e os documentos estão no horário de Brasília.',
    }[situacao],
  };
}

async function corrigir() {
  const cliente = await pool.connect();
  const resultado = [];
  try {
    await cliente.query('BEGIN');
    for (const [tabela, nome, tag] of TABELAS) {
      const certo = horaProtocolo(tag);
      const { rowCount } = await cliente.query(
        `UPDATE ${tabela} SET autorizado_em = ${certo}
          WHERE xml_autorizado ~ '<${tag}>[^<]+</${tag}>' AND autorizado_em IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (autorizado_em - ${certo})) / 60) > ${TOLERANCIA_MIN}`);
      resultado.push({ documento: nome, corrigidos: rowCount });
    }
    await cliente.query('COMMIT');
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
  return resultado;
}

// Ao ligar: se houver documento com hora errada, avisa no console (e no sino, pelos avisos de segurança).
let pendente = null;
async function verificarAoLigar() {
  try {
    const d = await diagnosticar();
    pendente = d.situacao === 'corrigir' ? d.mensagem : null;
    if (pendente) console.warn(`[fuso] ⚠ ${pendente} (Manutenção » Fuso do banco)`);
  } catch (err) { console.error('[fuso]', err.message); }
}
const aviso = () => pendente;

module.exports = { diagnosticar, corrigir, verificarAoLigar, aviso };
