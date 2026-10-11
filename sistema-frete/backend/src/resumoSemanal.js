const cron = require('node-cron');
const pool = require('./db');
const email = require('./email');

// Junta os números da semana (e da meta do mês), pra mandar no resumo.
async function montarDadosResumo() {
  const { rows: semana } = await pool.query(
    `SELECT COUNT(*)::int AS qtd, COALESCE(SUM(valor_total_frete), 0)::float AS gasto
     FROM fretes WHERE data_emissao_nf >= NOW() - INTERVAL '7 days'`
  );
  const { rows: retidos } = await pool.query(`SELECT COUNT(*)::int AS qtd FROM fretes WHERE status = 'Frete Retido'`);
  const { rows: liberado } = await pool.query(
    `SELECT COALESCE(SUM(valor_total_frete), 0)::float AS total FROM fretes WHERE status = 'Liberado p/ Pagamento'`
  );
  const { rows: vencendo } = await pool.query(
    `SELECT COALESCE(SUM(valor_total_frete), 0)::float AS total FROM fretes
     WHERE status = 'Liberado p/ Pagamento' AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`
  );

  const mesAtual = new Date().toISOString().slice(0, 7);
  const { rows: metaRows } = await pool.query(
    `SELECT valor_meta FROM metas_frete WHERE mes_referencia = $1 AND transportadora IS NULL`,
    [`${mesAtual}-01`]
  );
  let metaGeral = null, realizadoMes = 0, percentualMeta = 0;
  if (metaRows[0]) {
    metaGeral = Number(metaRows[0].valor_meta);
    const { rows: realizadoRows } = await pool.query(
      `SELECT COALESCE(SUM(valor_total_frete), 0)::float AS total FROM fretes
       WHERE data_emissao_nf >= $1 AND data_emissao_nf < ($1::date + INTERVAL '1 month')`,
      [`${mesAtual}-01`]
    );
    realizadoMes = realizadoRows[0].total;
    percentualMeta = (realizadoMes / metaGeral) * 100;
  }

  return {
    qtdFretesSemana: semana[0].qtd, gastoSemana: semana[0].gasto,
    qtdRetidos: retidos[0].qtd, valorLiberado: liberado[0].total,
    vencendo7dias: vencendo[0].total, metaGeral, realizadoMes, percentualMeta,
  };
}

async function enviarResumoSemanalSeConfigurado() {
  try {
    const config = await email.buscarConfiguracao();
    if (!config.resumo_semanal_ativo || !config.resumo_semanal_email) return;
    const dados = await montarDadosResumo();
    await email.enviarResumoSemanal({ destinatarioEmail: config.resumo_semanal_email, dados });
    console.log('[resumo-semanal] Email enviado com sucesso.');
  } catch (err) {
    console.error('[resumo-semanal] Falha ao enviar:', err.message);
  }
}

// Toda segunda-feira, 7h da manhã.
function agendarResumoSemanal() {
  cron.schedule('0 7 * * 1', enviarResumoSemanalSeConfigurado);
}

module.exports = { agendarResumoSemanal, enviarResumoSemanalSeConfigurado, montarDadosResumo };
