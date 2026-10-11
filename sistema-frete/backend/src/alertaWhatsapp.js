const cron = require('node-cron');
const pool = require('./db');
const whatsapp = require('./whatsapp');

// Roda uma vez por dia (não fica mandando mensagem toda hora) — só avisa se
// tiver algo realmente urgente: frete retido ou pagamento vencido.
async function enviarAlertaDiarioSeConfigurado() {
  try {
    const config = await whatsapp.buscarConfiguracao();
    if (!config.ativo) return;

    const { rows: retidos } = await pool.query(`SELECT COUNT(*)::int AS qtd FROM fretes WHERE status = 'Frete Retido'`);
    const { rows: vencidos } = await pool.query(
      `SELECT COUNT(*)::int AS qtd FROM fretes WHERE status = 'Liberado p/ Pagamento' AND data_vencimento < CURRENT_DATE`
    );

    if (retidos[0].qtd === 0 && vencidos[0].qtd === 0) return; // nada urgente, não manda nada

    const linhas = ['🚚 *Nexofrete* — alerta do dia:'];
    if (retidos[0].qtd > 0) linhas.push(`🔶 ${retidos[0].qtd} frete(s) retido(s) aguardando resolução`);
    if (vencidos[0].qtd > 0) linhas.push(`🚨 ${vencidos[0].qtd} pagamento(s) VENCIDO(S)`);

    await whatsapp.enviarMensagem(linhas.join('\n'));
    console.log('[whatsapp] Alerta diário enviado.');
  } catch (err) {
    console.error('[whatsapp] Falha ao enviar alerta diário:', err.message);
  }
}

// Toda manhã, 8h.
function agendarAlertaDiario() {
  cron.schedule('0 8 * * *', enviarAlertaDiarioSeConfigurado);
}

module.exports = { agendarAlertaDiario, enviarAlertaDiarioSeConfigurado };
