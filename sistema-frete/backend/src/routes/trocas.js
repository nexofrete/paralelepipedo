// Devolução / troca de nota informada por e-mail.
const express = require('express');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar: log } = require('../auditoria');
const { lerEmailTroca } = require('../leitorEmailTroca');
const trocas = require('../trocasNota');

const router = express.Router();

// POST /api/trocas/ler  { texto } -> o que o sistema entendeu do e-mail (não grava nada)
router.post('/ler', autenticar, permitir('pode_editar_registros'), (req, res) => {
  const texto = String(req.body?.texto || '');
  if (!texto.trim()) return res.status(400).json({ erro: 'Cole o texto do e-mail.' });
  res.json(lerEmailTroca(texto));
});

// POST /api/trocas  { campos conferidos na tela + texto } -> grava e aplica nas notas
router.post('/', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  try {
    const d = req.body || {};
    const soNumero = (v) => (String(v || '').match(/\d+/) || [null])[0];
    const dados = { ...d, nf_original: soNumero(d.nf_original), nf_substituta: soNumero(d.nf_substituta), nf_retorno: soNumero(d.nf_retorno), pedido: soNumero(d.pedido) };
    if (!dados.nf_original) return res.status(400).json({ erro: 'Informe ao menos a NF original.' });
    const r = await trocas.registrar(dados, req.usuario);
    const partes = [
      `NF ${dados.nf_original}: ${r.feito.original ? 'marcada como devolvida' : 'ainda não está no sistema (aplica quando chegar)'}`,
      dados.nf_substituta ? `NF substituta ${dados.nf_substituta}: ${r.feito.substituta ? 'ligada à original' : 'ainda não está no sistema (liga quando chegar)'}` : null,
      dados.nf_retorno ? `nota de retorno ${dados.nf_retorno}: ${r.feito.retorno ? 'marcada sem frete' : 'ainda não está no sistema (marca quando chegar)'}` : null,
    ].filter(Boolean);
    log({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'registrar_troca_nota',
      detalhes: `${dados.tipo === 'troca' ? 'Troca' : 'Devolução'} da NF ${dados.nf_original}${dados.nf_substituta ? ` -> ${dados.nf_substituta}` : ''}: ${partes.join('; ')}` });
    res.json({ ok: true, id: r.troca.id, mensagem: `${partes.join('. ')}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao registrar. Detalhe técnico: ${err.message}` });
  }
});

// GET /api/trocas -> últimas registradas
router.get('/', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  try { res.json(await trocas.listar()); } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao listar.' }); }
});

module.exports = router;
