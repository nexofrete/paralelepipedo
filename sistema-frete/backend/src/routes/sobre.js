// "Sobre o sistema": proposta, versão instalada, novidades de cada versão e o manual.
const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');

const router = express.Router();

// GET /api/sobre
router.get('/', autenticar, async (req, res) => {
  try {
    const versao = require('../../package.json').version;
    let pacote = null;
    try { pacote = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'pacote.json'), 'utf8')).gerado_em || null; } catch { /* sem carimbo */ }
    let conteudo = { proposta: '', versoes: [] };
    try { conteudo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'novidades.json'), 'utf8')); } catch { /* sem arquivo */ }
    const { rows } = await pool.query('SELECT razao_social, nome_fantasia FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
    const manual = fs.existsSync(path.join(__dirname, '..', '..', '..', 'Manual_Sistema_de_Fretes.pdf'));
    res.json({ versao, pacote: pacote ? new Date(pacote).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null, empresa: rows[0]?.nome_fantasia || rows[0]?.razao_social || null, proposta: conteudo.proposta, versoes: conteudo.versoes || [], manual });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar as informações do sistema.' });
  }
});

// GET /api/sobre/manual -> o PDF do manual
router.get('/manual', autenticar, (req, res) => {
  const arquivo = path.join(__dirname, '..', '..', '..', 'Manual_Sistema_de_Fretes.pdf');
  if (!fs.existsSync(arquivo)) return res.status(404).json({ erro: 'O manual não está na pasta do sistema.' });
  res.download(arquivo, 'Manual_Nexofrete.pdf');
});

module.exports = router;
