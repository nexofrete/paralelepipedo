const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { podeVerCliente, freteDoCliente, bloquearCteCancelado } = require('../permissoes');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const PASTA_CANHOTOS = path.join(__dirname, '..', '..', 'dados', 'canhotos');

// POST /api/fretes/:id/canhoto
// Salva o comprovante de entrega digital: assinatura (desenhada na tela,
// vem como imagem base64) + foto da carga (opcional) + quem recebeu.
router.post('/:id/canhoto', autenticar, permitir('pode_editar_registros'), freteDoCliente(), bloquearCteCancelado(), upload.single('foto'), async (req, res) => {
  try {
    const { assinatura, recebido_por } = req.body;
    // O canhoto confirma a entrega: grava a Data de Entrega (a informada, ou hoje).
    const dataEntrega = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.data_entrega || '')) ? req.body.data_entrega : null;
    if (!assinatura && !req.file) {
      return res.status(400).json({ erro: 'Informe a assinatura ou uma foto.' });
    }

    let nomeArquivoFoto = null;
    if (req.file) {
      const tipo = require('../utils/arquivoSeguro').detectarTipo(req.file.buffer, { pdf: false });
      if (!tipo) return res.status(400).json({ erro: 'A foto do canhoto tem que ser uma imagem (JPG, PNG, WEBP ou HEIC).' });
      fs.mkdirSync(PASTA_CANHOTOS, { recursive: true });
      const extensao = tipo.ext;
      nomeArquivoFoto = `frete-${req.params.id}-${Date.now()}${extensao}`;
      fs.writeFileSync(path.join(PASTA_CANHOTOS, nomeArquivoFoto), req.file.buffer);
    }

    const { rows } = await pool.query(
      `UPDATE fretes SET
         canhoto_assinatura = COALESCE($1, canhoto_assinatura),
         canhoto_foto_arquivo = COALESCE($2, canhoto_foto_arquivo),
         canhoto_recebido_por = $3,
         canhoto_registrado_em = NOW(),
         data_entrega_origem = CASE WHEN $5::date IS NOT NULL OR data_entrega IS NULL THEN 'manual' ELSE data_entrega_origem END,
         data_entrega = COALESCE($5::date, data_entrega, CURRENT_DATE),
         atualizado_em = NOW()
       WHERE id = $4 RETURNING id, numero_pedido`,
      [assinatura || null, nomeArquivoFoto, recebido_por || null, req.params.id, dataEntrega]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'registrar_canhoto',
      detalhes: `Registrou o comprovante de entrega do frete #${rows[0].id} (pedido ${rows[0].numero_pedido || '—'}), recebido por ${recebido_por || '—'}`,
      registroId: rows[0].id,
    });
    res.json({ mensagem: 'Comprovante registrado ✓' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar o comprovante.' });
  }
});

// GET /api/fretes/:id/canhoto/foto — mostra a foto salva.
router.get('/:id/canhoto/foto', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT cliente, canhoto_foto_arquivo FROM fretes WHERE id = $1', [req.params.id]);
    if (rows[0] && !podeVerCliente(req, rows[0].cliente)) return res.status(403).send('Você não tem acesso a esse registro.');
    if (!rows[0]?.canhoto_foto_arquivo) return res.status(404).send('Sem foto.');
    const caminho = path.join(PASTA_CANHOTOS, rows[0].canhoto_foto_arquivo);
    if (!fs.existsSync(caminho)) return res.status(404).send('Arquivo não encontrado.');
    require('../utils/arquivoSeguro').servir(res, caminho);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao buscar a foto.');
  }
});

module.exports = router;
