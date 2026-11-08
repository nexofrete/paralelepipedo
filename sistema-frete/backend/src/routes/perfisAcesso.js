// Perfis de acesso (Cadastros » Usuários » Perfis de acesso): um nome (ex.: "Faturamento") com as
// permissões e os módulos bloqueados. Aplicar o perfil num usuário copia tudo para ele; mudar o
// perfil atualiza na hora todos os usuários que usam esse perfil (menos administradores).
const express = require('express');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const { CAMPOS_PERMISSAO, MODULOS, limparModulos } = require('../permissoes');

const router = express.Router();
const gerenciar = permitir('pode_gerenciar_usuarios');
// O 2FA é de cada pessoa (precisa do e-mail dela), não do perfil.
const CAMPOS_PERFIL = CAMPOS_PERMISSAO.filter((c) => c !== 'dois_fatores_ativo');
const falha = (res, err, padrao) => { if (!err.status) console.error('[perfis]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

function lerCorpo(req) {
  const nome = String(req.body?.nome || '').trim().slice(0, 80);
  if (!nome) throw erro('Dê um nome ao perfil.');
  const permissoes = Object.fromEntries(CAMPOS_PERFIL.map((c) => [c, !!req.body?.permissoes?.[c]]));
  // Só o administrador dá a permissão de gerenciar usuários (a mesma regra do cadastro de usuário).
  if (permissoes.pode_gerenciar_usuarios && req.usuario.perfil !== 'admin') throw erro('Apenas o administrador pode criar um perfil que gerencia usuários.', 403);
  return { nome, descricao: String(req.body?.descricao || '').trim().slice(0, 300) || null, permissoes, modulos_bloqueados: limparModulos(req.body?.modulos_bloqueados) };
}
// Copia o perfil para os usuários dele (menos administradores).
async function aplicarAosUsuarios(cliente, id) {
  const { rows: [p] } = await cliente.query('SELECT permissoes, modulos_bloqueados FROM perfis_acesso WHERE id = $1', [id]);
  if (!p) return 0;
  const vals = CAMPOS_PERFIL.map((c) => !!p.permissoes?.[c]);
  const { rowCount } = await cliente.query(
    `UPDATE usuarios SET ${CAMPOS_PERFIL.map((c, i) => `${c} = $${i + 2}`).join(', ')}, modulos_bloqueados = $${CAMPOS_PERFIL.length + 2}
      WHERE perfil_acesso_id = $1 AND perfil <> 'admin'`, [id, ...vals, p.modulos_bloqueados]);
  return rowCount;
}

router.get('/', autenticar, gerenciar, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT p.*, (SELECT COUNT(*)::int FROM usuarios u WHERE u.perfil_acesso_id = p.id) AS usuarios FROM perfis_acesso p ORDER BY p.nome`);
    res.json({ perfis: rows, modulos: Object.fromEntries(Object.entries(MODULOS).map(([k, m]) => [k, m.nome])), campos: CAMPOS_PERFIL });
  } catch (err) { falha(res, err, 'Erro ao listar os perfis.'); }
});

router.post('/', autenticar, gerenciar, async (req, res) => {
  try {
    const d = lerCorpo(req);
    const { rows: [p] } = await pool.query('INSERT INTO perfis_acesso (nome, descricao, permissoes, modulos_bloqueados) VALUES ($1, $2, $3, $4) RETURNING *',
      [d.nome, d.descricao, d.permissoes, d.modulos_bloqueados]);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'perfil_acesso', detalhes: `Criou o perfil de acesso "${p.nome}"` });
    res.status(201).json(p);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um perfil com esse nome.' });
    falha(res, err, 'Erro ao criar o perfil.');
  }
});

router.put('/:id(\\d+)', autenticar, gerenciar, async (req, res) => {
  const cliente = await pool.connect();
  try {
    const d = lerCorpo(req);
    await cliente.query('BEGIN');
    const { rows: [p] } = await cliente.query(`UPDATE perfis_acesso SET nome = $2, descricao = $3, permissoes = $4, modulos_bloqueados = $5, atualizado_em = NOW()
      WHERE id = $1 RETURNING *`, [req.params.id, d.nome, d.descricao, d.permissoes, d.modulos_bloqueados]);
    if (!p) throw erro('Perfil não encontrado.', 404);
    const n = await aplicarAosUsuarios(cliente, p.id);
    await cliente.query('COMMIT');
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'perfil_acesso', detalhes: `Alterou o perfil de acesso "${p.nome}" (${n} usuário(s) atualizado(s))` });
    res.json({ ...p, usuarios_atualizados: n });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um perfil com esse nome.' });
    falha(res, err, 'Erro ao salvar o perfil.');
  } finally { cliente.release(); }
});

// Excluir: os usuários ficam com as permissões que já têm (só deixam de seguir o perfil).
router.delete('/:id(\\d+)', autenticar, gerenciar, async (req, res) => {
  try {
    const { rows: [p] } = await pool.query('DELETE FROM perfis_acesso WHERE id = $1 RETURNING nome', [req.params.id]);
    if (!p) return res.status(404).json({ erro: 'Perfil não encontrado.' });
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'perfil_acesso', detalhes: `Excluiu o perfil de acesso "${p.nome}"` });
    res.json({ ok: true });
  } catch (err) { falha(res, err, 'Erro ao excluir o perfil.'); }
});

module.exports = router;
module.exports.CAMPOS_PERFIL = CAMPOS_PERFIL;
