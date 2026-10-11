const https = require('https');
const pool = require('./db');

async function buscarConfiguracao() {
  const { rows } = await pool.query('SELECT * FROM configuracao_whatsapp WHERE id = 1');
  return rows[0] || {};
}

async function salvarConfiguracao(dados) {
  const campos = ['ativo', 'twilio_account_sid', 'twilio_auth_token', 'twilio_numero_whatsapp', 'numero_destino'];
  const presentes = campos.filter((c) => dados[c] !== undefined);
  if (presentes.length === 0) return buscarConfiguracao();

  await pool.query('INSERT INTO configuracao_whatsapp (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const sets = presentes.map((c, i) => `${c} = $${i + 1}`);
  const valores = presentes.map((c) => dados[c]);
  const { rows } = await pool.query(
    `UPDATE configuracao_whatsapp SET ${sets.join(', ')} WHERE id = 1 RETURNING *`,
    valores
  );
  return rows[0];
}

// Manda uma mensagem de WhatsApp usando a API REST do Twilio (sem precisar
// instalar nenhum pacote novo — só uma chamada HTTPS simples).
function enviarMensagem(mensagem) {
  return new Promise(async (resolve, reject) => {
    const config = await buscarConfiguracao();
    if (!config.ativo || !config.twilio_account_sid || !config.twilio_auth_token || !config.numero_destino) {
      return reject(new Error('WhatsApp não está configurado.'));
    }

    const corpo = new URLSearchParams({
      From: `whatsapp:${config.twilio_numero_whatsapp}`,
      To: `whatsapp:${config.numero_destino}`,
      Body: mensagem,
    }).toString();

    const auth = Buffer.from(`${config.twilio_account_sid}:${config.twilio_auth_token}`).toString('base64');

    const req = https.request({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${config.twilio_account_sid}/Messages.json`,
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(corpo),
      },
    }, (res) => {
      let resposta = '';
      res.on('data', (chunk) => { resposta += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(resposta));
        } else {
          reject(new Error(`Twilio recusou o envio (${res.statusCode}): ${resposta}`));
        }
      });
    });
    req.on('error', reject);
    req.write(corpo);
    req.end();
  });
}

module.exports = { buscarConfiguracao, salvarConfiguracao, enviarMensagem };
