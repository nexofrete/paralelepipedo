const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');

const router = express.Router();

const PASTA_ANEXOS = path.join(__dirname, '..', '..', 'dados', 'anexos');
fs.mkdirSync(PASTA_ANEXOS, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: PASTA_ANEXOS,
    filename: (req, file, cb) => {
      const nomeUnico = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
      cb(null, nomeUnico);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB por arquivo
});

// GET /api/mensagens/destinatarios  (lista simples de usuários pra escolher, qualquer um logado pode ver)
router.get('/destinatarios', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome FROM usuarios WHERE ativo = TRUE AND id != $1 ORDER BY nome ASC',
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar usuários.' });
  }
});

// GET /api/mensagens/nao-lidas
router.get('/nao-lidas', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM mensagens WHERE destinatario_id = $1 AND lida = FALSE',
      [req.usuario.id]
    );
    res.json({ total: rows[0].total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao contar mensagens não lidas.' });
  }
});

// GET /api/mensagens/recebidas
router.get('/recebidas', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, (SELECT COUNT(*) FROM mensagens_anexos a WHERE a.mensagem_id = m.id)::int AS total_anexos
       FROM mensagens m WHERE destinatario_id = $1 ORDER BY criado_em DESC LIMIT 200`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar mensagens recebidas.' });
  }
});

// GET /api/mensagens/enviadas
router.get('/enviadas', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, (SELECT COUNT(*) FROM mensagens_anexos a WHERE a.mensagem_id = m.id)::int AS total_anexos
       FROM mensagens m WHERE remetente_id = $1 ORDER BY criado_em DESC LIMIT 200`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar mensagens enviadas.' });
  }
});

// GET /api/mensagens/:id  (detalhe + anexos; marca como lida se você for o destinatário)
router.get('/:id', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM mensagens WHERE id = $1', [req.params.id]);
    const mensagem = rows[0];
    if (!mensagem) return res.status(404).json({ erro: 'Mensagem não encontrada.' });

    if (mensagem.destinatario_id !== req.usuario.id && mensagem.remetente_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Você não tem acesso a essa mensagem.' });
    }

    if (mensagem.destinatario_id === req.usuario.id && !mensagem.lida) {
      await pool.query('UPDATE mensagens SET lida = TRUE WHERE id = $1', [req.params.id]);
      mensagem.lida = true;
    }

    const { rows: anexos } = await pool.query(
      'SELECT id, nome_original, tamanho, tipo_mime FROM mensagens_anexos WHERE mensagem_id = $1',
      [req.params.id]
    );
    res.json({ ...mensagem, anexos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar a mensagem.' });
  }
});

// POST /api/mensagens  (multipart/form-data: destinatario_id, assunto, corpo, anexos[])
router.post('/', autenticar, upload.array('anexos', 5), async (req, res) => {
  try {
    const { destinatario_id, assunto, corpo } = req.body;
    if (!destinatario_id || (!corpo && (!req.files || req.files.length === 0))) {
      return res.status(400).json({ erro: 'Escolha o destinatário e escreva uma mensagem ou anexe um arquivo.' });
    }

    const destino = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [destinatario_id]);
    if (!destino.rows[0]) return res.status(404).json({ erro: 'Destinatário não encontrado.' });

    const { rows } = await pool.query(
      `INSERT INTO mensagens (remetente_id, remetente_nome, destinatario_id, destinatario_nome, assunto, corpo)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.usuario.id, req.usuario.nome, destinatario_id, destino.rows[0].nome, assunto || null, corpo || null]
    );

    if (req.files) {
      for (const arquivo of req.files) {
        await pool.query(
          `INSERT INTO mensagens_anexos (mensagem_id, nome_original, nome_arquivo, tamanho, tipo_mime)
           VALUES ($1,$2,$3,$4,$5)`,
          [rows[0].id, arquivo.originalname, arquivo.filename, arquivo.size, arquivo.mimetype]
        );
      }
    }

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'enviar_mensagem',
      detalhes: `Enviou mensagem para "${destino.rows[0].nome}"${req.files?.length ? ` com ${req.files.length} anexo(s)` : ''}`,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
});

// GET /api/mensagens/anexos/:id/download
router.get('/anexos/:id/download', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, m.remetente_id, m.destinatario_id FROM mensagens_anexos a
       JOIN mensagens m ON m.id = a.mensagem_id WHERE a.id = $1`,
      [req.params.id]
    );
    const anexo = rows[0];
    if (!anexo) return res.status(404).json({ erro: 'Anexo não encontrado.' });
    if (anexo.remetente_id !== req.usuario.id && anexo.destinatario_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Você não tem acesso a esse anexo.' });
    }
    const caminho = path.join(PASTA_ANEXOS, anexo.nome_arquivo);
    if (!fs.existsSync(caminho)) return res.status(404).json({ erro: 'Arquivo não encontrado no servidor.' });
    res.download(caminho, anexo.nome_original);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao baixar anexo.' });
  }
});

module.exports = router;
