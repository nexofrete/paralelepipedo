const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const agenda = require('../agenda');

// Agenda compartilhada: cada um vê os eventos que criou e os que foi
// convidado. Só quem criou (ou o admin) edita ou cancela.
const router = express.Router();

const CORES = ['azul', 'verde', 'laranja', 'roxo', 'vermelho', 'ciano'];

const SELECT_EVENTO = `
  SELECT e.*,
         COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('id', u.id, 'nome', u.nome) ORDER BY u.nome)
                     FROM agenda_participantes p JOIN usuarios u ON u.id = p.usuario_id
                    WHERE p.evento_id = e.id), '[]'::json) AS participantes
    FROM agenda_eventos e`;

// Eventos que o usuário enxerga: criou ou foi convidado.
const VISIVEL = `(e.criado_por_id = $1 OR EXISTS (SELECT 1 FROM agenda_participantes p WHERE p.evento_id = e.id AND p.usuario_id = $1))`;

const ehDono = (req, evento) => req.usuario.perfil === 'admin' || evento.criado_por_id === req.usuario.id;
const comDono = (req, e) => ({ ...e, eh_dono: ehDono(req, e) });

// Valida e normaliza o que veio da tela.
function lerCorpo(body) {
  const titulo = String(body.titulo || '').trim();
  if (!titulo) return { erro: 'Dê um título ao evento.' };
  if (titulo.length > 200) return { erro: 'O título pode ter no máximo 200 caracteres.' };
  const diaInteiro = !!body.dia_inteiro;
  const inicio = String(body.inicio || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(inicio)) return { erro: 'Informe a data (e a hora) do evento.' };
  const fim = body.fim ? String(body.fim).trim() : null;
  if (fim && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(fim)) return { erro: 'O horário de término está inválido.' };
  if (fim && fim < inicio) return { erro: 'O término não pode ser antes do início.' };
  const participantes = Array.isArray(body.participantes) ? [...new Set(body.participantes.map(Number).filter(Number.isInteger))] : [];
  return {
    titulo,
    descricao: String(body.descricao || '').trim() || null,
    local: String(body.local || '').trim().slice(0, 200) || null,
    inicio: diaInteiro ? inicio.slice(0, 10) : inicio,
    fim: diaInteiro ? null : fim,
    dia_inteiro: diaInteiro,
    cor: CORES.includes(body.cor) ? body.cor : 'azul',
    lembrete_1dia: !!body.lembrete_1dia,
    lembrete_1hora: !!body.lembrete_1hora,
    participantes,
  };
}

// GET /api/agenda/usuarios — com quem dá pra compartilhar (usuários ativos).
router.get('/usuarios', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, funcao FROM usuarios WHERE ativo = TRUE AND id <> $1 ORDER BY nome', [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os usuários.' });
  }
});

// GET /api/agenda/eventos?de=AAAA-MM-DD&ate=AAAA-MM-DD
router.get('/eventos', autenticar, async (req, res) => {
  try {
    const de = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '') ? req.query.de : null;
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : null;
    const { rows } = await pool.query(
      `${SELECT_EVENTO}
        WHERE ${VISIVEL}
          AND ($2::date IS NULL OR COALESCE(e.fim, e.inicio) >= $2::date)
          AND ($3::date IS NULL OR e.inicio < $3::date + INTERVAL '1 day')
        ORDER BY e.inicio`,
      [req.usuario.id, de, ate]
    );
    res.json(rows.map((e) => comDono(req, e)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os eventos.' });
  }
});

// GET /api/agenda/proximos — os próximos eventos (a partir de agora).
router.get('/proximos', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${SELECT_EVENTO}
        WHERE ${VISIVEL}
          AND COALESCE(e.fim, CASE WHEN e.dia_inteiro THEN e.inicio + INTERVAL '1 day' ELSE e.inicio END) >= LOCALTIMESTAMP
        ORDER BY e.inicio LIMIT 8`,
      [req.usuario.id]
    );
    res.json(rows.map((e) => comDono(req, e)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os próximos eventos.' });
  }
});

// POST /api/agenda/eventos
router.post('/eventos', autenticar, async (req, res) => {
  const dados = lerCorpo(req.body || {});
  if (dados.erro) return res.status(400).json({ erro: dados.erro });
  const participantes = dados.participantes.filter((id) => id !== req.usuario.id);
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO agenda_eventos (titulo, descricao, local, inicio, fim, dia_inteiro, cor, lembrete_1dia, lembrete_1hora, criado_por_id, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [dados.titulo, dados.descricao, dados.local, dados.inicio, dados.fim, dados.dia_inteiro, dados.cor,
       dados.lembrete_1dia, dados.lembrete_1hora, req.usuario.id, req.usuario.nome]
    );
    const evento = rows[0];
    if (participantes.length) {
      await cliente.query(
        `INSERT INTO agenda_participantes (evento_id, usuario_id)
         SELECT $1, u.id FROM usuarios u WHERE u.id = ANY($2) AND u.ativo = TRUE`,
        [evento.id, participantes]
      );
    }
    await cliente.query('COMMIT');

    await agenda.notificar(participantes, 'convite', evento, req.usuario.nome);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'agenda_criar',
      detalhes: `Criou o evento "${evento.titulo}" com ${participantes.length} participante(s)`,
    });
    const { rows: completo } = await pool.query(`${SELECT_EVENTO} WHERE e.id = $1`, [evento.id]);
    res.status(201).json(comDono(req, completo[0]));
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar o evento.' });
  } finally {
    cliente.release();
  }
});

// PUT /api/agenda/eventos/:id — só quem criou (ou o admin).
router.put('/eventos/:id', autenticar, async (req, res) => {
  const dados = lerCorpo(req.body || {});
  if (dados.erro) return res.status(400).json({ erro: dados.erro });
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: atual } = await cliente.query('SELECT * FROM agenda_eventos WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!atual[0]) { await cliente.query('ROLLBACK'); return res.status(404).json({ erro: 'Evento não encontrado.' }); }
    if (!ehDono(req, atual[0])) { await cliente.query('ROLLBACK'); return res.status(403).json({ erro: 'Só quem criou o evento pode alterar.' }); }

    const dono = atual[0].criado_por_id;
    const participantes = dados.participantes.filter((id) => id !== dono);
    const { rows: antes } = await cliente.query('SELECT usuario_id FROM agenda_participantes WHERE evento_id = $1', [req.params.id]);
    const idsAntes = antes.map((r) => r.usuario_id);

    const { rows } = await cliente.query(
      `UPDATE agenda_eventos SET titulo = $1, descricao = $2, local = $3, inicio = $4, fim = $5, dia_inteiro = $6,
              cor = $7, lembrete_1dia = $8, lembrete_1hora = $9, atualizado_em = NOW()
        WHERE id = $10 RETURNING *`,
      [dados.titulo, dados.descricao, dados.local, dados.inicio, dados.fim, dados.dia_inteiro, dados.cor,
       dados.lembrete_1dia, dados.lembrete_1hora, req.params.id]
    );
    await cliente.query('DELETE FROM agenda_participantes WHERE evento_id = $1', [req.params.id]);
    if (participantes.length) {
      await cliente.query(
        `INSERT INTO agenda_participantes (evento_id, usuario_id)
         SELECT $1, u.id FROM usuarios u WHERE u.id = ANY($2) AND u.ativo = TRUE`,
        [req.params.id, participantes]
      );
    }
    await cliente.query('COMMIT');
    const evento = rows[0];

    // Avisa: quem entrou recebe convite; quem saiu, que foi tirado; quem
    // continua, só se mudou algo que importa (título, horário ou local).
    const novos = participantes.filter((id) => !idsAntes.includes(id));
    const removidos = idsAntes.filter((id) => !participantes.includes(id));
    const mantidos = participantes.filter((id) => idsAntes.includes(id));
    const mudouAlgo = ['titulo', 'local', 'dia_inteiro'].some((c) => String(atual[0][c] ?? '') !== String(evento[c] ?? ''))
      || new Date(atual[0].inicio).getTime() !== new Date(evento.inicio).getTime()
      || String(atual[0].fim ?? '') !== String(evento.fim ?? '');
    const autor = req.usuario.nome;
    await agenda.notificar(novos, 'convite', evento, autor);
    await agenda.notificar(removidos, 'removido', evento, autor);
    if (mudouAlgo) {
      // Se quem alterou foi o admin (e não o dono), o dono também fica sabendo.
      const avisar = [...mantidos, ...(dono && dono !== req.usuario.id ? [dono] : [])];
      await agenda.notificar(avisar, 'alterado', evento, autor);
    }

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'agenda_editar',
      detalhes: `Alterou o evento "${evento.titulo}"`,
    });
    const { rows: completo } = await pool.query(`${SELECT_EVENTO} WHERE e.id = $1`, [evento.id]);
    res.json(comDono(req, completo[0]));
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ erro: 'Erro ao alterar o evento.' });
  } finally {
    cliente.release();
  }
});

// DELETE /api/agenda/eventos/:id — cancela e avisa todo mundo.
router.delete('/eventos/:id', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM agenda_eventos WHERE id = $1', [req.params.id]);
    const evento = rows[0];
    if (!evento) return res.status(404).json({ erro: 'Evento não encontrado.' });
    if (!ehDono(req, evento)) return res.status(403).json({ erro: 'Só quem criou o evento pode cancelar.' });

    const { rows: part } = await pool.query('SELECT usuario_id FROM agenda_participantes WHERE evento_id = $1', [evento.id]);
    await pool.query('DELETE FROM agenda_eventos WHERE id = $1', [evento.id]);

    const avisar = [...part.map((p) => p.usuario_id), ...(evento.criado_por_id && evento.criado_por_id !== req.usuario.id ? [evento.criado_por_id] : [])];
    await agenda.notificar(avisar, 'cancelado', evento, req.usuario.nome);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'agenda_cancelar',
      detalhes: `Cancelou o evento "${evento.titulo}"`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cancelar o evento.' });
  }
});

// GET /api/agenda/notificacoes — avisos ainda não lidos do usuário.
router.get('/notificacoes', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.evento_id, n.tipo, n.titulo, n.texto, n.criado_em, e.inicio, e.dia_inteiro
         FROM agenda_notificacoes n LEFT JOIN agenda_eventos e ON e.id = n.evento_id
        WHERE n.usuario_id = $1 AND n.lida = FALSE AND n.texto IS NOT NULL
        ORDER BY n.criado_em DESC LIMIT 50`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os avisos da agenda.' });
  }
});

// POST /api/agenda/notificacoes/lidas  { ids?: [...] } — sem ids, marca todas.
router.post('/notificacoes/lidas', autenticar, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
    await pool.query(
      `UPDATE agenda_notificacoes SET lida = TRUE
        WHERE usuario_id = $1 AND lida = FALSE AND ($2::int[] IS NULL OR id = ANY($2))`,
      [req.usuario.id, ids]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao marcar os avisos.' });
  }
});

module.exports = router;
