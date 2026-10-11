const express = require('express');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const arquivarLogsAuditoria = require('../arquivarLogsAuditoria');

const router = express.Router();

// GET /api/auditoria — só quem gerencia usuários (ou admin) pode ver os logs.
// Só mostra os logs de HOJE em diante — os de dias anteriores já foram
// arquivados em disco (pasta dados/logs-auditoria), pra não poluir a tela.
router.get('/', autenticar, permitir('pode_gerenciar_usuarios'), async (req, res) => {
  try {
    const { usuario_id, acao } = req.query;
    const condicoes = [];
    const valores = [];

    if (usuario_id) {
      valores.push(usuario_id);
      condicoes.push(`usuario_id = $${valores.length}`);
    }
    if (acao) {
      valores.push(acao);
      condicoes.push(`acao = $${valores.length}`);
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM auditoria ${where} ORDER BY criado_em DESC LIMIT 300`,
      valores
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os logs de auditoria.' });
  }
});

// GET /api/auditoria/arquivados — lista os dias que já foram arquivados em disco.
router.get('/arquivados', autenticar, permitir('pode_gerenciar_usuarios'), (req, res) => {
  try {
    res.json(arquivarLogsAuditoria.listarDiasArquivados());
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar dias arquivados.' });
  }
});

// GET /api/auditoria/arquivados/:dia — lê os logs de um dia específico já arquivado.
router.get('/arquivados/:dia', autenticar, permitir('pode_gerenciar_usuarios'), (req, res) => {
  try {
    const logs = arquivarLogsAuditoria.lerLogsDoDia(req.params.dia);
    if (!logs) return res.status(404).json({ erro: 'Nenhum log arquivado pra esse dia.' });
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao ler logs arquivados.' });
  }
});

module.exports = router;
