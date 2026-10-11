const express = require('express');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const whatsapp = require('../whatsapp');

const router = express.Router();

// GET /api/whatsapp/configuracao  (admin)
router.get('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    const config = await whatsapp.buscarConfiguracao();
    delete config.twilio_auth_token; // nunca devolve o token pra tela
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração do WhatsApp.' });
  }
});

// PUT /api/whatsapp/configuracao  (admin)
router.put('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    const config = await whatsapp.salvarConfiguracao(req.body);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_whatsapp_config',
      detalhes: `Configurou o WhatsApp (${config.ativo ? 'ativado' : 'desativado'})`,
    });
    delete config.twilio_auth_token;
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração do WhatsApp.' });
  }
});

// POST /api/whatsapp/testar  (admin) — manda uma mensagem de teste na hora.
router.post('/testar', autenticar, apenasAdmin, async (req, res) => {
  try {
    await whatsapp.enviarMensagem('✅ Teste do Nexofrete — se você recebeu essa mensagem, o WhatsApp está configurado certinho!');
    res.json({ mensagem: 'Mensagem de teste enviada ✓' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: err.message || 'Erro ao enviar a mensagem de teste.' });
  }
});

module.exports = router;
