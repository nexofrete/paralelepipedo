const express = require('express');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');

const router = express.Router();

// GET /api/auditoria-config  (qualquer usuário logado pode ler — o navegador
// de todo mundo precisa saber a tolerância pra conferir as taxas igual ao servidor)
router.get('/', autenticar, async (req, res) => {
  try {
    const tol = require('../toleranciaAuditoria');
    const extra = async () => ({ tolerancias: (await tol.carregar()).lista, componentes: tol.COMPONENTES });
    const { rows } = await pool.query('SELECT * FROM configuracao_auditoria WHERE id = 1');
    if (rows[0]) return res.json({ ...rows[0], ...(await extra()) });
    const inserido = await pool.query('INSERT INTO configuracao_auditoria (id) VALUES (1) RETURNING *');
    res.json({ ...inserido.rows[0], ...(await extra()) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração de auditoria.' });
  }
});

// PUT /api/auditoria-config  (só admin)
router.put('/', autenticar, apenasAdmin, async (req, res) => {
  try {
    const valor = Number(req.body.tolerancia_valor) || 0;
    const percentual = Number(req.body.tolerancia_percentual) || 0;
    const limiteAlcada = req.body.limite_alcada_aprovacao ? Number(req.body.limite_alcada_aprovacao) : null;
    const limiteFatura = req.body.limite_alcada_fatura ? Number(req.body.limite_alcada_fatura) : null;
    const pctReentrega = req.body.percentual_reentrega === undefined || req.body.percentual_reentrega === ''
      ? 50 : Math.min(200, Math.max(0, Number(req.body.percentual_reentrega) || 0));

    await pool.query('INSERT INTO configuracao_auditoria (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    const { rows } = await pool.query(
      'UPDATE configuracao_auditoria SET tolerancia_valor = $1, tolerancia_percentual = $2, limite_alcada_aprovacao = $3, percentual_reentrega = $4, limite_alcada_fatura = $5 WHERE id = 1 RETURNING *',
      [valor, percentual, limiteAlcada, pctReentrega, Number.isFinite(limiteFatura) && limiteFatura > 0 ? limiteFatura : null]
    );

    // Mudou o % da reentrega/devolução: refaz o esperado das que ainda não foram decididas.
    await pool.query(
      `UPDATE fretes f SET valor_total_calculado = ROUND(COALESCE(p.valor_total_cte, p.valor_frete_negociado) * $1 / 100, 2), atualizado_em = NOW()
         FROM fretes p
        WHERE f.frete_principal_id = p.id AND f.vinculo_cte IN ('reentrega', 'devolucao')
          AND COALESCE(f.status, 'Pendente') NOT IN ('Faturado', 'Cancelado')
          AND (f.status_aprovacao IS DISTINCT FROM 'Aprovado' OR f.aprovado_por_nome LIKE 'Sistema%')`,
      [pctReentrega]
    );

    // A tolerância geral mudou: refaz a conferência automática dos fretes ainda não decididos.
    const tol = require('../toleranciaAuditoria');
    tol.limpar();
    const reconferidos = await tol.reconferir().catch((e) => { console.error('[auditoria] reconferir:', e.message); return 0; });
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_auditoria_config',
      detalhes: `Definiu a margem de tolerância da auditoria (${reconferidos} frete(s) reconferidos): R$ ${valor.toFixed(2)} ou ${percentual}%, limite de alçada: ${limiteAlcada != null ? `R$ ${limiteAlcada.toFixed(2)}` : 'sem limite'}, reentrega/devolução: ${pctReentrega}% do CT-e original`,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração de auditoria.' });
  }
});

// PUT /api/auditoria-config/tolerancias  (só admin) — a lista inteira de regras por transportadora/componente.
router.put('/tolerancias', autenticar, apenasAdmin, async (req, res) => {
  try {
    const tol = require('../toleranciaAuditoria');
    const n = await tol.salvar(req.body?.tolerancias);
    const reconferidos = await tol.reconferir();
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_auditoria_config',
      detalhes: `Gravou ${n} regra(s) de tolerância por transportadora/componente (${reconferidos} frete(s) reconferidos)` });
    res.json({ regras: n, reconferidos, tolerancias: (await tol.carregar(true)).lista });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar as tolerâncias.' });
  }
});

// ---------- Responsáveis por transportadora e resumo diário (src/responsaveisAuditoria.js, src/resumoAuditoria.js) ----------
router.get('/responsaveis', autenticar, async (req, res) => {
  try { res.json(await require('../responsaveisAuditoria').listar()); } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao ler os responsáveis.' }); }
});
router.put('/responsaveis', autenticar, apenasAdmin, async (req, res) => {
  try {
    const r = await require('../responsaveisAuditoria').salvar(req.body || {});
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_auditoria_config',
      detalhes: `Responsáveis da auditoria: ${r.transportadoras.filter((t) => t.auditor_id).length} transportadora(s) com responsável; resumo diário para ${r.usuarios.filter((u) => u.resumo_auditoria).length} usuário(s) às ${r.resumo_hora}h` });
    res.json(r);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao salvar os responsáveis.' }); }
});
// Como fica o resumo de quem está usando (sem enviar) e o envio de teste para o próprio e-mail.
router.get('/resumo/previa', autenticar, async (req, res) => {
  try { const r = await require('../resumoAuditoria').html(req.usuario); res.json({ html: r.html, vazio: r.vazio }); } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao montar o resumo.' }); }
});
router.post('/resumo/teste', autenticar, async (req, res) => {
  try {
    const { rows: [emp] } = await pool.query('SELECT endereco_publico FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
    await require('../resumoAuditoria').enviarPara(req.usuario, emp?.endereco_publico ? String(emp.endereco_publico).replace(/\/+$/, '') : null);
    res.json({ ok: true, para: req.usuario.email });
  } catch (err) {
    if (/configurado|SMTP|mail/i.test(err.message || '')) return res.status(400).json({ erro: `Não foi possível enviar: ${err.message}` });
    console.error(err); res.status(500).json({ erro: 'Erro ao enviar o resumo.' });
  }
});

// ---------- Regras automáticas (src/regrasAuditoria.js) ----------
const regrasAud = require('../regrasAuditoria');
const erroRegra = (res, err, msg) => { if (err.status) return res.status(err.status).json({ erro: err.message }); console.error(err); res.status(500).json({ erro: msg }); };
router.get('/regras', autenticar, async (req, res) => {
  try { res.json({ regras: await regrasAud.listar(), tipos: regrasAud.TIPOS, acoes: regrasAud.ACOES }); } catch (err) { erroRegra(res, err, 'Erro ao ler as regras.'); }
});
// Simula as regras do corpo (ainda não salvas) ou as gravadas: o que seria decidido agora, sem gravar.
router.post('/regras/simular', autenticar, apenasAdmin, async (req, res) => {
  try {
    const teste = Array.isArray(req.body?.regras) ? req.body.regras.map((r) => ({ ...r, valor: r.valor === '' ? null : r.valor, percentual: r.percentual === '' ? null : r.percentual, transportadora_id: Number(r.transportadora_id) || null })) : null;
    const r = await regrasAud.rodar({ aplicar: false, regrasTeste: teste });
    res.json({ ...r, decididos: r.decididos.slice(0, 300), total: r.decididos.length });
  } catch (err) { erroRegra(res, err, 'Erro ao simular.'); }
});
router.put('/regras', autenticar, apenasAdmin, async (req, res) => {
  try {
    const regras = await regrasAud.salvar(req.body?.regras, req.usuario.nome);
    const r = await regrasAud.rodar({ aplicar: true });
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_auditoria_config',
      detalhes: `Gravou ${regras.length} regra(s) automática(s) da auditoria; ${r.decididos.length} frete(s) decididos na hora` });
    res.json({ regras: await regrasAud.listar(), decididos: r.decididos.length });
  } catch (err) { erroRegra(res, err, 'Erro ao salvar as regras.'); }
});
router.post('/regras/aplicar', autenticar, apenasAdmin, async (req, res) => {
  try {
    const r = await regrasAud.rodar({ aplicar: true });
    if (r.decididos.length) registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'aplicar_regras_auditoria', detalhes: `Regras automáticas decidiram ${r.decididos.length} frete(s)` });
    res.json({ decididos: r.decididos.length, por_regra: r.por_regra, regras: await regrasAud.listar() });
  } catch (err) { erroRegra(res, err, 'Erro ao aplicar as regras.'); }
});
router.post('/regras/:id(\\d+)/desfazer', autenticar, apenasAdmin, async (req, res) => {
  try {
    const r = await regrasAud.desfazer(Number(req.params.id));
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'desfazer_regra_auditoria', detalhes: `Desfez a regra "${r.regra}" (${r.desfeitos} frete(s) voltaram para a fila) e a desligou` });
    res.json({ ...r, regras: await regrasAud.listar() });
  } catch (err) { erroRegra(res, err, 'Erro ao desfazer.'); }
});

module.exports = router;
