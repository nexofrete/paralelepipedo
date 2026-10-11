const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const pool = require('./db');

// Arquiva os logs de auditoria de dias JÁ FECHADOS (ontem pra trás) em
// arquivos JSON dentro de dados/logs-auditoria/AAAA-MM/AAAA-MM-DD.json, e
// tira eles do banco — assim a tela de "Auditoria e Logs" só mostra o que é
// recente, sem ficar poluída com meses de histórico.
const PASTA_LOGS = path.join(__dirname, '..', 'dados', 'logs-auditoria');

async function arquivarLogsAntigos() {
  try {
    // Pega todos os dias (já fechados) que ainda têm log no banco.
    const { rows: dias } = await pool.query(
      `SELECT DISTINCT DATE(criado_em) AS dia FROM auditoria
       WHERE criado_em < DATE_TRUNC('day', NOW())
       ORDER BY dia ASC`
    );

    let arquivados = 0;
    for (const { dia } of dias) {
      const diaTexto = dia.toISOString().slice(0, 10); // AAAA-MM-DD
      const pastaMes = path.join(PASTA_LOGS, diaTexto.slice(0, 7)); // AAAA-MM
      const arquivo = path.join(pastaMes, `${diaTexto}.json`);

      const { rows: logsDoDia } = await pool.query(
        `SELECT * FROM auditoria WHERE DATE(criado_em) = $1 ORDER BY criado_em ASC`,
        [diaTexto]
      );
      if (logsDoDia.length === 0) continue;

      fs.mkdirSync(pastaMes, { recursive: true });

      // Se já existe um arquivo desse dia (ex: rodou duas vezes), junta com
      // o que já tinha em vez de sobrescrever.
      let logsExistentes = [];
      if (fs.existsSync(arquivo)) {
        try { logsExistentes = JSON.parse(fs.readFileSync(arquivo, 'utf-8')); } catch { logsExistentes = []; }
      }
      const idsJaSalvos = new Set(logsExistentes.map((l) => l.id));
      const logsFinal = [...logsExistentes, ...logsDoDia.filter((l) => !idsJaSalvos.has(l.id))];
      fs.writeFileSync(arquivo, JSON.stringify(logsFinal, null, 2), 'utf-8');

      await pool.query(`DELETE FROM auditoria WHERE DATE(criado_em) = $1`, [diaTexto]);
      arquivados += logsDoDia.length;
    }
    if (arquivados > 0) console.log(`[logs-auditoria] ${arquivados} log(s) arquivado(s) em ${PASTA_LOGS}`);
  } catch (err) {
    console.error('Falha ao arquivar logs de auditoria:', err.message);
  }
}

// Roda uma vez por dia, de madrugada (não atrapalha ninguém usando o sistema).
function agendarArquivamentoDiario() {
  cron.schedule('30 2 * * *', arquivarLogsAntigos);
  // Roda uma vez já na inicialização também, pra não depender de o servidor
  // ficar ligado até de madrugada todo dia.
  arquivarLogsAntigos();
}

// Lê os arquivos arquivados de um período, pra quem quiser consultar logs
// antigos (não fica escondido pra sempre, só sai da tela principal).
function listarDiasArquivados() {
  if (!fs.existsSync(PASTA_LOGS)) return [];
  const dias = [];
  for (const pastaMes of fs.readdirSync(PASTA_LOGS)) {
    const caminhoMes = path.join(PASTA_LOGS, pastaMes);
    if (!fs.statSync(caminhoMes).isDirectory()) continue;
    for (const arquivo of fs.readdirSync(caminhoMes)) {
      if (arquivo.endsWith('.json')) dias.push(arquivo.replace('.json', ''));
    }
  }
  return dias.sort().reverse();
}

function lerLogsDoDia(diaTexto) {
  const arquivo = path.join(PASTA_LOGS, diaTexto.slice(0, 7), `${diaTexto}.json`);
  if (!fs.existsSync(arquivo)) return null;
  return JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
}

module.exports = { arquivarLogsAntigos, agendarArquivamentoDiario, listarDiasArquivados, lerLogsDoDia };
