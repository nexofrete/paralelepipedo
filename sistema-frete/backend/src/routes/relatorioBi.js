// Montar relatório (BI): src/relatorioBi.js. Montado em /api/fretes/bi (antes das rotas de fretes).
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const bi = require('../relatorioBi');

const router = express.Router();
const relatorios = permitirAlguma('pode_ver_relatorios');
const erro = (res, err, padrao) => { if (!err.status) console.error('[bi]', err); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };

// Fontes que o usuário pode usar, com os grupos de campos (id, rótulo, tipo) e os filtros de cada uma.
router.get('/fontes', autenticar, relatorios, (req, res) => res.json(bi.fontesDo(req.usuario)));
// Compatibilidade: tipo de cada campo dos fretes.
router.get('/campos', autenticar, relatorios, (req, res) => {
  res.json(Object.fromEntries(Object.entries(bi.FONTES.fretes.campos).map(([c, d]) => [c, d.tipo])));
});
router.get('/situacoes', autenticar, relatorios, async (req, res) => {
  try { res.json(await bi.situacoes(req.usuario, req.query.fonte)); } catch (err) { erro(res, err, 'Erro ao ler as situações.'); }
});

// GET /api/fretes/bi?fonte=&campos=a,b,c&<filtros>&ordem=&dir=&agrupar=&agrupar2=&periodo=&total=&rotulos={id:rótulo}[&formato=xlsx&nome=]
router.get('/', autenticar, relatorios, async (req, res) => {
  try {
    const xlsx = req.query.formato === 'xlsx';
    const r = await bi.gerar(req.usuario, req.query, { iso: xlsx });
    if (xlsx) {
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${bi.nomeArquivo(req.query.nome)}"`);
      res.set('X-Total-Linhas', String(r.linhas.length));
      res.set('X-Cortado', r.cortado ? String(r.limite) : '');
      return res.send(bi.planilha(r));
    }
    res.json({ ...r, campos: r.colunas.map((c) => c.id), tipos: Object.fromEntries(r.colunas.map((c) => [c.id, c.tipo])) });
  } catch (err) { erro(res, err, 'Erro ao gerar o relatório personalizado.'); }
});

// ---------- Modelos salvos (campos, filtros, ordem, agrupamento e envio por e-mail) ----------
// Cada usuário vê os seus e os compartilhados; só o dono (ou o administrador) altera, apaga ou agenda envio.
function lerModelo(b = {}) {
  const nome = String(b.nome || '').trim().slice(0, 100);
  if (!nome) return { erro: 'Dê um nome ao modelo.' };
  const fonte = bi.FONTES[b.fonte] ? b.fonte : 'fretes';
  const campos = [...new Set((Array.isArray(b.campos) ? b.campos : []).filter((c) => bi.FONTES[fonte].campos[c]))];
  const filtros = {};
  bi.FILTROS.forEach((k) => { const v = String(b.filtros?.[k] ?? '').trim().slice(0, 100); if (v) filtros[k] = v; });
  if (!campos.length && !filtros.agrupar) return { erro: 'Escolha pelo menos um campo antes de salvar.' };
  const envio = bi.lerEnvio(b.envio);
  if (envio.erro) return envio;
  return { nome, fonte, campos, filtros, compartilhado: b.compartilhado === true, envio };
}
const visivel = (req, m) => m.usuario_id === req.usuario.id || m.compartilhado || req.usuario.perfil === 'admin';
router.get('/modelos', autenticar, relatorios, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, fonte, campos, filtros, compartilhado, usuario_id, usuario_nome, atualizado_em, envio, proximo_envio, ultimo_envio, ultimo_envio_status,
              (usuario_id = $1) AS meu
         FROM bi_modelos WHERE usuario_id = $1 OR compartilhado ORDER BY (usuario_id = $1) DESC, LOWER(nome)`, [req.usuario.id]);
    // Só aparecem os modelos de fontes que o usuário pode ver.
    res.json(rows.filter((m) => bi.podeFonte(req.usuario, m.fonte || 'fretes')));
  } catch (err) { erro(res, err, 'Erro ao ler os modelos.'); }
});
router.post('/modelos', autenticar, relatorios, async (req, res) => {
  try {
    const m = lerModelo(req.body);
    if (m.erro) return res.status(400).json(m);
    if (!bi.podeFonte(req.usuario, m.fonte)) return res.status(403).json({ erro: 'Seu usuário não pode ver esta fonte de dados.' });
    const { rows: ja } = await pool.query('SELECT id FROM bi_modelos WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2)', [req.usuario.id, m.nome]);
    if (ja[0]) return res.status(409).json({ erro: `Você já tem um modelo "${m.nome}". Escolha-o e use "Salvar alterações", ou dê outro nome.`, id: ja[0].id });
    const { rows } = await pool.query(
      `INSERT INTO bi_modelos (nome, fonte, campos, filtros, compartilhado, envio, proximo_envio, usuario_id, usuario_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [m.nome, m.fonte, m.campos, m.filtros, m.compartilhado, m.envio, bi.proximoEnvio(m.envio), req.usuario.id, req.usuario.nome]);
    if (m.envio.ativo) registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'bi_envio', detalhes: `Agendou o envio do relatório "${m.nome}" para ${m.envio.para}` });
    res.status(201).json(rows[0]);
  } catch (err) { erro(res, err, 'Erro ao salvar o modelo.'); }
});
async function doDono(req, id) {
  const { rows } = await pool.query('SELECT * FROM bi_modelos WHERE id = $1', [id]);
  if (!rows[0]) return { status: 404, erro: 'Modelo não encontrado.' };
  if (rows[0].usuario_id !== req.usuario.id && req.usuario.perfil !== 'admin') return { status: 403, erro: `Este modelo é de ${rows[0].usuario_nome || 'outro usuário'}: salve uma cópia com outro nome.` };
  return { modelo: rows[0] };
}
router.put('/modelos/:id(\\d+)', autenticar, relatorios, async (req, res) => {
  try {
    const d = await doDono(req, Number(req.params.id));
    if (d.erro) return res.status(d.status).json({ erro: d.erro });
    const m = lerModelo(req.body);
    if (m.erro) return res.status(400).json(m);
    if (!bi.podeFonte(req.usuario, m.fonte)) return res.status(403).json({ erro: 'Seu usuário não pode ver esta fonte de dados.' });
    const mudouEnvio = JSON.stringify(d.modelo.envio || {}) !== JSON.stringify(m.envio);
    const { rows } = await pool.query(
      `UPDATE bi_modelos SET nome = $2, fonte = $3, campos = $4, filtros = $5, compartilhado = $6, envio = $7,
              proximo_envio = $8, atualizado_em = NOW() WHERE id = $1 RETURNING *`,
      [d.modelo.id, m.nome, m.fonte, m.campos, m.filtros, m.compartilhado, m.envio, mudouEnvio ? bi.proximoEnvio(m.envio) : (m.envio.ativo ? d.modelo.proximo_envio || bi.proximoEnvio(m.envio) : null)]);
    if (mudouEnvio) registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'bi_envio', detalhes: m.envio.ativo ? `Agendou o envio do relatório "${m.nome}" para ${m.envio.para}` : `Desligou o envio do relatório "${m.nome}"` });
    res.json(rows[0]);
  } catch (err) { erro(res, err, 'Erro ao salvar o modelo.'); }
});
router.delete('/modelos/:id(\\d+)', autenticar, relatorios, async (req, res) => {
  try {
    const d = await doDono(req, Number(req.params.id));
    if (d.erro) return res.status(d.status).json({ erro: d.erro });
    await pool.query('DELETE FROM bi_modelos WHERE id = $1', [d.modelo.id]);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao apagar o modelo.'); }
});
// Envia agora (para testar o e-mail), sem mudar o próximo envio agendado.
router.post('/modelos/:id(\\d+)/enviar', autenticar, relatorios, async (req, res) => {
  try {
    const d = await doDono(req, Number(req.params.id));
    if (d.erro) return res.status(d.status).json({ erro: d.erro });
    if (!d.modelo.envio?.ativo) return res.status(400).json({ erro: 'Ligue o envio por e-mail e salve o modelo antes.' });
    const r = await bi.enviarModelo(d.modelo, { manual: true });
    const status = `Enviado agora para ${d.modelo.envio.para} (${r.linhas} linha(s)${r.cortado ? ', cortado no limite' : ''})`;
    await pool.query('UPDATE bi_modelos SET ultimo_envio = NOW(), ultimo_envio_status = $2 WHERE id = $1', [d.modelo.id, status]);
    res.json({ ok: true, status });
  } catch (err) {
    await pool.query('UPDATE bi_modelos SET ultimo_envio_status = $2 WHERE id = $1', [Number(req.params.id), `Erro: ${err.message}`.slice(0, 300)]).catch(() => {});
    res.status(err.status || 400).json({ erro: err.message || 'Não consegui enviar.' });
  }
});

module.exports = router;
