const pool = require('./db');

/**
 * Registra uma ação no log de auditoria. Nunca lança erro para não quebrar
 * a operação principal (ex: se o log falhar, o upload/edição continua valendo).
 */
async function registrar({ usuarioId, usuarioNome, acao, detalhes, registroId }) {
  try {
    await pool.query(
      `INSERT INTO auditoria (usuario_id, usuario_nome, acao, detalhes, registro_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuarioId || null, usuarioNome || null, acao, detalhes || null, registroId || null]
    );
  } catch (err) {
    console.error('Falha ao registrar log de auditoria:', err.message);
  }
}

module.exports = { registrar };
