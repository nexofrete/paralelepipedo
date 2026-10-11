const express = require('express');
const pool = require('../db');
const { freteDoCliente, bloquearCteCancelado } = require('../permissoes');
const { autenticar, apenasAdmin, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const email = require('../email');

const router = express.Router();

// Traduz os erros mais comuns do servidor de email pra algo que dê pra resolver.
function mensagemErroEmail(err) {
  const texto = String(err?.message || '');
  if (err?.code === 'EAUTH' || /Invalid login|Username and Password not accepted|535/i.test(texto)) {
    return 'O servidor de email recusou o usuário ou a senha. No Gmail, use uma "senha de app" (Conta Google → Segurança → Senhas de app), não a senha normal da conta.';
  }
  if (/wrong version number|ssl3_get_record|ERR_SSL/i.test(texto)) {
    return 'Conexão segura incompatível com a porta. Use a porta 587 (sem SSL) ou 465 (com SSL).';
  }
  if (err?.code === 'ECONNECTION' || err?.code === 'ETIMEDOUT' || err?.code === 'ESOCKET' || /ENOTFOUND|ECONNREFUSED|timeout/i.test(texto)) {
    return 'Não consegui conectar ao servidor de email. Confira o servidor SMTP, a porta e se a internet deste computador está funcionando.';
  }
  return texto || 'Erro ao enviar o email.';
}

// GET /api/email/configuracao  (admin)
router.get('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    const config = await email.buscarConfiguracao();
    delete config.smtp_senha; // nunca devolve a senha pra tela
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração de email.' });
  }
});

// PUT /api/email/configuracao  (admin)
router.put('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    const config = await email.salvarConfiguracao(req.body);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_email_config',
      detalhes: `Configurou o envio de email (${config.ativo ? 'ativado' : 'desativado'})`,
    });
    delete config.smtp_senha;
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração de email.' });
  }
});

// POST /api/email/enviar-espelho/:freteId
// Manda o espelho do cálculo (valores + taxas) pro email da transportadora.
router.post('/enviar-espelho/:freteId', autenticar, permitir('pode_aprovar_pagamento'), freteDoCliente('freteId'), bloquearCteCancelado('freteId'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM fretes WHERE id = $1', [req.params.freteId]);
    const frete = rows[0];
    if (!frete) return res.status(404).json({ erro: 'Registro não encontrado.' });

    const transp = await pool.query('SELECT razao_social, email FROM transportadoras WHERE razao_social = $1', [frete.transportadora]);
    const emailDestino = req.body.email || transp.rows[0]?.email;
    if (!emailDestino) {
      return res.status(400).json({ erro: 'Essa transportadora não tem email cadastrado. Cadastre em Transportadoras, ou informe um email manualmente.' });
    }

    await email.enviarEspelhoCalculo({
      destinatarioEmail: emailDestino,
      destinatarioNome: transp.rows[0]?.razao_social || frete.transportadora,
      frete,
      taxas: req.body.taxas || [],
    });

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'enviar_espelho_email',
      detalhes: `Enviou o espelho de cálculo por email (${emailDestino}) do frete #${frete.id} (pedido ${frete.numero_pedido || '—'})`,
      registroId: frete.id,
    });
    res.json({ mensagem: `Email enviado para ${emailDestino} ✓` });
  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: mensagemErroEmail(err) });
  }
});

// POST /api/email/enviar-resumo-semanal-agora — dispara na hora, pra testar.
router.post('/enviar-resumo-semanal-agora', autenticar, apenasAdmin, async (req, res) => {
  try {
    const config = await email.buscarConfiguracao();
    // Usa o email que está na tela (mesmo que ainda não tenha clicado em Salvar).
    const destino = String(req.body?.email || config.resumo_semanal_email || '').trim();
    if (!destino) return res.status(400).json({ erro: 'Informe o email de destino.' });
    if (!config.ativo || !config.smtp_host || !config.smtp_usuario) {
      return res.status(400).json({ erro: 'O envio de email está desativado ou sem servidor configurado. Marque "Ativar envio de email" e salve a configuração acima.' });
    }
    const resumoSemanal = require('../resumoSemanal');
    const dados = await resumoSemanal.montarDadosResumo();
    await email.enviarResumoSemanal({ destinatarioEmail: destino, dados });
    res.json({ mensagem: `Resumo enviado para ${destino} ✓` });
  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: mensagemErroEmail(err) });
  }
});

module.exports = router;
