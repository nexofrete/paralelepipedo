const express = require('express');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');

const router = express.Router();

// GET /api/seguranca/configuracao
// Qualquer usuário logado pode ler (o navegador de cada um precisa saber
// o tempo configurado pra aplicar o logout automático por inatividade).
router.get('/configuracao', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM configuracao_seguranca WHERE id = 1');
    if (rows[0]) return res.json(rows[0]);
    const inserido = await pool.query('INSERT INTO configuracao_seguranca (id) VALUES (1) RETURNING *');
    res.json(inserido.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração de segurança.' });
  }
});

// PUT /api/seguranca/configuracao  (só admin)
router.put('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    const minutos = req.body.tempo_inatividade_minutos;
    const valor = minutos === '' || minutos == null ? null : Number(minutos);

    await pool.query('INSERT INTO configuracao_seguranca (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    const { rows } = await pool.query(
      'UPDATE configuracao_seguranca SET tempo_inatividade_minutos = $1 WHERE id = 1 RETURNING *',
      [valor]
    );

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_seguranca_config',
      detalhes: valor ? `Definiu logout automático após ${valor} minuto(s) de inatividade` : 'Desativou o logout automático por inatividade',
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração de segurança.' });
  }
});

// GET /api/seguranca/https  (só admin) -> situação do HTTPS
router.get('/https', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT https_ativo, https_porta FROM configuracao_seguranca WHERE id = 1');
    res.json({ configurado: !!rows[0]?.https_ativo, porta: rows[0]?.https_porta || 3443, ...require('../servidorHttps').status() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar a situação do HTTPS.' });
  }
});

// PUT /api/seguranca/https  { ativo, porta }  (só admin) -> liga/desliga na hora
router.put('/https', autenticar, apenasAdmin, async (req, res) => {
  try {
    const porta = Math.min(Math.max(parseInt(req.body.porta, 10) || 3443, 1024), 65535);
    await pool.query('INSERT INTO configuracao_seguranca (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    await pool.query('UPDATE configuracao_seguranca SET https_ativo = $1, https_porta = $2 WHERE id = 1', [!!req.body.ativo, porta]);
    const st = await require('../servidorHttps').aplicar();
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_seguranca_config',
      detalhes: req.body.ativo ? `Ligou o HTTPS na porta ${porta}${st.erro ? ` (falhou: ${st.erro})` : ''}` : 'Desligou o HTTPS' });
    res.json(st);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao configurar o HTTPS: ${err.message}` });
  }
});

module.exports = router;
