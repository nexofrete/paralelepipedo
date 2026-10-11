const express = require('express');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');

const router = express.Router();

// GET /api/avisos/atual  (qualquer usuário logado consulta pra ver se tem aviso ativo)
router.get('/atual', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM avisos
       WHERE ativo = TRUE AND (expira_em IS NULL OR expira_em > NOW())
       ORDER BY criado_em DESC LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar aviso atual.' });
  }
});

// GET /api/avisos  (histórico, só admin)
router.get('/', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM avisos ORDER BY criado_em DESC LIMIT 30');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar histórico de avisos.' });
  }
});

// POST /api/avisos  (dispara um novo aviso pra todo mundo, só admin)
router.post('/', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { mensagem, tipo, minutos_expira } = req.body;
    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({ erro: 'Escreva a mensagem do aviso.' });
    }

    // Só um aviso ativo por vez — encerra os anteriores automaticamente.
    await pool.query('UPDATE avisos SET ativo = FALSE WHERE ativo = TRUE');

    const expiraEm = minutos_expira ? `NOW() + interval '${Number(minutos_expira)} minutes'` : 'NULL';
    const { rows } = await pool.query(
      `INSERT INTO avisos (mensagem, tipo, criado_por_nome, expira_em)
       VALUES ($1, $2, $3, ${expiraEm})
       RETURNING *`,
      [mensagem.trim(), tipo || 'info', req.usuario.nome]
    );

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'enviar_aviso',
      detalhes: `Enviou aviso a todos os usuários: "${rows[0].mensagem}"`,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar aviso.' });
  }
});

// PUT /api/avisos/:id/encerrar  (encerra o aviso antes da hora, só admin)
router.put('/:id/encerrar', autenticar, apenasAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE avisos SET ativo = FALSE WHERE id = $1', [req.params.id]);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'encerrar_aviso',
      detalhes: `Encerrou o aviso #${req.params.id} manualmente`,
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao encerrar aviso.' });
  }
});

module.exports = router;
