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
    const b = req.body || {};
    const inteiro = (v, min, max, padrao) => (v === undefined || v === '' || v === null ? padrao : Math.min(max, Math.max(min, Math.round(Number(v) || 0))));
    const atual = await require('../segurancaContas').politica();
    // Quem liga a exigência precisa ter a própria verificação em duas etapas (senão fica preso fora do sistema).
    if (['admins', 'todos'].includes(b.exigir_2fa) && b.exigir_2fa !== atual.exigir_2fa && !req.usuario.totp_ativo && !req.usuario.dois_fatores_ativo) {
      return res.status(400).json({ erro: 'Antes de exigir a verificação em duas etapas, ligue a sua: menu » 🔐 Minha segurança » Ativar aplicativo autenticador.' });
    }

    await pool.query('INSERT INTO configuracao_seguranca (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    const { rows } = await pool.query(
      `UPDATE configuracao_seguranca SET tempo_inatividade_minutos = $1, senha_min = $2, senha_variedade = $3, bloqueio_tentativas = $4,
              bloqueio_minutos = $5, senha_validade_dias = $6, exigir_2fa = $7 WHERE id = 1 RETURNING *`,
      [valor, inteiro(b.senha_min, 8, 64, atual.senha_min), b.senha_variedade === undefined ? atual.senha_variedade : !!b.senha_variedade,
        inteiro(b.bloqueio_tentativas, 0, 50, atual.bloqueio_tentativas), inteiro(b.bloqueio_minutos, 1, 1440, atual.bloqueio_minutos),
        inteiro(b.senha_validade_dias, 0, 3650, atual.senha_validade_dias), ['nao', 'admins', 'todos'].includes(b.exigir_2fa) ? b.exigir_2fa : atual.exigir_2fa]
    );
    require('../segurancaContas').limparCache();

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_seguranca_config',
      detalhes: `${valor ? `Logout após ${valor} min de inatividade` : 'Sem logout por inatividade'}; senha mínima ${rows[0].senha_min}${rows[0].senha_variedade ? ' com letras e números' : ''}; `
        + `${rows[0].bloqueio_tentativas ? `bloqueio após ${rows[0].bloqueio_tentativas} erros por ${rows[0].bloqueio_minutos} min` : 'sem bloqueio'}; `
        + `${rows[0].senha_validade_dias ? `senha vence em ${rows[0].senha_validade_dias} dias` : 'senha não vence'}; 2FA obrigatório: ${rows[0].exigir_2fa}`,
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
