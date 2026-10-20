const express = require('express');
const Doc = require('../utils/documento');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');

const router = express.Router();

const CAMPOS_EMPRESA = [
  'razao_social', 'nome_fantasia', 'cnpj', 'ie', 'telefone', 'email',
  'endereco', 'bairro', 'municipio', 'uf', 'cep', 'modulos',
];
const MODULOS = ['ambos', 'transportadora', 'embarcador'];

// GET /api/empresa
router.get('/', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os dados da empresa.' });
  }
});

// PUT /api/empresa  (cria se não existir, atualiza se já existir — só admin)
router.put('/', autenticar, apenasAdmin, async (req, res) => {
  try {
    if (req.body.modulos !== undefined && !MODULOS.includes(req.body.modulos)) return res.status(400).json({ erro: 'Módulos inválidos.' });
    const campos = CAMPOS_EMPRESA.filter((c) => req.body[c] !== undefined);
    // CNPJ só com os dígitos (a tela mostra com pontuação).
    const valores = campos.map((c) => (c === 'cnpj' ? Doc.limpar(req.body[c]) : req.body[c] || null));

    const colunas = ['id', ...campos];
    const placeholders = ['1', ...campos.map((_, i) => `$${i + 1}`)];
    const atualizacoes = campos.map((c, i) => `${c} = $${i + 1}`);

    const { rows } = await pool.query(
      `INSERT INTO empresa (${colunas.join(', ')}) VALUES (${placeholders.join(', ')})
       ON CONFLICT (id) DO UPDATE SET ${atualizacoes.join(', ')}, atualizado_em = NOW()
       RETURNING *`,
      valores
    );
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_empresa',
      detalhes: 'Atualizou os dados cadastrais da empresa',
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar os dados da empresa.' });
  }
});

// ---------- Logo da empresa (cabeçalho dos relatórios impressos) ----------
// Guardada no banco como data URL (vai junto no backup). PNG, JPG ou WEBP, até 1 MB.
const multer = require('multer');
const uploadLogo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

// POST /api/empresa/logo  (campo "logo")
router.post('/logo', autenticar, apenasAdmin, (req, res, next) => uploadLogo.single('logo')(req, res, (err) => {
  if (err) return res.status(400).json({ erro: err.code === 'LIMIT_FILE_SIZE' ? 'A imagem passa de 1 MB — reduza o tamanho e tente de novo.' : 'Não consegui receber a imagem.' });
  return next();
}), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Escolha a imagem da logo.' });
    if (!/^image\/(png|jpeg|webp)$/.test(req.file.mimetype)) return res.status(400).json({ erro: 'Use uma imagem PNG, JPG ou WEBP.' });
    const logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await pool.query(
      `INSERT INTO empresa (id, logo) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET logo = EXCLUDED.logo, atualizado_em = NOW()`, [logo]);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_empresa', detalhes: 'Atualizou a logo da empresa' });
    res.json({ ok: true, logo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar a logo.' });
  }
});

// DELETE /api/empresa/logo
router.delete('/logo', autenticar, apenasAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE empresa SET logo = NULL, atualizado_em = NOW() WHERE id = 1');
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_empresa', detalhes: 'Removeu a logo da empresa' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover a logo.' });
  }
});

module.exports = router;
