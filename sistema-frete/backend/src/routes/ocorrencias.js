// Acompanhamento das entregas dos CT-e emitidos (estilo SSW): painel com
// previsão e situação, lançamento de ocorrências (uma a uma ou em lote, com
// foto do comprovante) e o histórico de cada CT-e.
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const oc = require('../cte/ocorrencias');
const ag = require('../cte/agendamento');

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const { PASTA } = oc;
const log = (req, acao, detalhes, registroId) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes, registroId });
const erro = (res, err, padrao) => { console.error('[ocorrencias]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
// Número da NF dentro da chave (posições 26–34).
const nfDaChave = (c) => (String(c).length === 44 ? String(Number(String(c).slice(25, 34))) : null);

router.get('/catalogo', autenticar, emitir, (req, res) => res.json({ catalogo: oc.CATALOGO, situacoes: oc.SITUACOES }));

// ---------- Feriados (previsão de entrega) ----------
router.get('/feriados', autenticar, emitir, async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const { rows } = await pool.query(`SELECT id, TO_CHAR(data, 'YYYY-MM-DD') AS data, descricao, uf, cidade, anual FROM feriados ORDER BY TO_CHAR(data, 'MM-DD'), uf NULLS FIRST, cidade NULLS FIRST`);
    res.json({ ano, nacionais: require('../cte/feriados').feriadosNacionais(ano), cadastrados: rows });
  } catch (err) { erro(res, err, 'Erro ao listar os feriados.'); }
});
router.post('/feriados', autenticar, emitir, async (req, res) => {
  try {
    const { data, descricao, uf, cidade, anual } = req.body || {};
    if (!dataIso(data)) throw falha('Informe a data do feriado.');
    if (!String(descricao || '').trim()) throw falha('Dê um nome ao feriado.');
    if (cidade && !uf) throw falha('Feriado municipal: informe também a UF.');
    const { rows } = await pool.query('INSERT INTO feriados (data, descricao, uf, cidade, anual) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [data, String(descricao).trim().slice(0, 120), String(uf || '').trim().toUpperCase().slice(0, 2) || null, String(cidade || '').trim().toUpperCase().slice(0, 120) || null, anual !== false]);
    log(req, 'feriado', `Cadastrou o feriado "${descricao}" (${data}${uf ? ` · ${uf}` : ''}${cidade ? ` · ${cidade}` : ''})`);
    res.status(201).json({ id: rows[0].id });
  } catch (err) { erro(res, err, 'Erro ao cadastrar o feriado.'); }
});
router.delete('/feriados/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM feriados WHERE id = $1 RETURNING descricao', [req.params.id]);
    if (rows[0]) log(req, 'feriado', `Apagou o feriado "${rows[0].descricao}"`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao apagar o feriado.'); }
});

// CT-e autorizados sem previsão (emitidos antes deste recurso): calcula agora.
async function completarPrevisoes() {
  const { rows } = await pool.query(`SELECT id FROM ctes_emitidos WHERE status = 'autorizado' AND previsao_entrega IS NULL AND autorizado_em IS NOT NULL AND COALESCE(dados->>'tpCTe', '0') <> '1' LIMIT 300`);
  for (const r of rows) await oc.definirPrevisao(r.id).catch(() => null);
}

const FILTROS = {
  abertos: "situacao_entrega NOT IN ('entregue', 'devolvido')",
  atrasados: "situacao_entrega NOT IN ('entregue', 'devolvido') AND previsao_entrega < $HOJE",
  hoje: "situacao_entrega NOT IN ('entregue', 'devolvido') AND previsao_entrega = $HOJE",
  ocorrencia: "situacao_entrega = 'ocorrencia'",
  em_rota: "situacao_entrega = 'em_rota'",
  entregues: "situacao_entrega = 'entregue'",
  devolvidos: "situacao_entrega = 'devolvido'",
  agendar: `situacao_entrega NOT IN ('entregue', 'devolvido') AND ${ag.SQL_EXIGE('c')} AND NOT ${ag.SQL_ATIVO('c')}`,
  agendados: `situacao_entrega NOT IN ('entregue', 'devolvido') AND ${ag.SQL_ATIVO('c')}`,
  todos: 'TRUE',
};

// GET /api/ocorrencias/painel?filtro=abertos&busca=&de=&ate=
router.get('/painel', autenticar, emitir, async (req, res) => {
  try {
    await completarPrevisoes();
    const hoje = oc.hojeBrasilia();
    const filtro = FILTROS[req.query.filtro] ? req.query.filtro : 'abertos';
    const val = [hoje];
    // $1 (hoje) entra sempre, mesmo nos filtros que não usam a data.
    // O CT-e complementar só cobra valor: a entrega é acompanhada pelo original.
    const cond = ["c.status = 'autorizado'", "COALESCE(c.dados->>'tpCTe', '0') <> '1'", '$1::date IS NOT NULL', FILTROS[filtro].replace(/\$HOJE/g, '$1::date')];
    // Período (emissão) só vale para entregues/devolvidos/todos; os abertos aparecem sempre.
    if (['entregues', 'devolvidos', 'todos'].includes(filtro)) {
      const de = dataIso(req.query.de) || `${hoje.slice(0, 8)}01`;   // padrão: desde o dia 1º do mês
      const ate = dataIso(req.query.ate) || hoje;
      val.push(de, ate);
      cond.push(`COALESCE(c.data_entrega, c.autorizado_em)::date BETWEEN $${val.length - 1}::date AND $${val.length}::date`);
    }
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      val.push(`%${busca}%`);
      const n = val.length;
      cond.push(`(CAST(c.numero AS TEXT) = $${n + 1} OR c.chave ILIKE $${n} OR COALESCE(c.destinatario_nome, c.dados->'destinatario'->>'xNome') ILIKE $${n} OR c.remetente_nome ILIKE $${n}
              OR c.tomador_nome ILIKE $${n} OR c.cidade_fim ILIKE $${n}
              OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.dados->'nfes', '[]'::jsonb)) k WHERE LTRIM(SUBSTRING(k FROM 26 FOR 9), '0') = LTRIM($${n + 1}, '0')))`);
      val.push(busca.replace(/\D/g, '') || '-');
    }
    const { rows } = await pool.query(
      `SELECT c.id, c.serie, c.numero, c.chave, c.autorizado_em, c.valor_total, c.tomador_nome, c.remetente_nome,
              COALESCE(c.destinatario_nome, c.dados->'destinatario'->>'xNome') AS destinatario_nome,
              COALESCE(c.cidade_fim, c.dados->'fim'->>'xMun') AS cidade_fim, COALESCE(c.uf_fim, c.dados->'fim'->>'UF') AS uf_fim,
              c.previsao_entrega, c.previsao_original, c.situacao_entrega, c.data_entrega, c.recebedor_nome, c.demonstracao,
              c.dados->'nfes' AS nfes, c.dados->'fim' AS fim,
              (SELECT json_build_object('descricao', o.descricao, 'data_hora', o.data_hora, 'tipo', o.tipo, 'cidade', o.cidade)
                 FROM cte_ocorrencias o WHERE o.cte_id = c.id ORDER BY o.data_hora DESC, o.id DESC LIMIT 1) AS ultima,
              (SELECT COUNT(*)::int FROM cte_ocorrencias o WHERE o.cte_id = c.id) AS qtd_ocorrencias,
              ${ag.SQL_JSON('c')} AS agendamento, ${ag.SQL_EXIGE('c')} AS exige_agendamento
         FROM ctes_emitidos c WHERE ${cond.join(' AND ')}
        ORDER BY ${filtro === 'entregues' || filtro === 'devolvidos' ? 'c.data_entrega DESC NULLS LAST' : 'c.previsao_entrega NULLS LAST, c.numero'} LIMIT 1000`, val);
    const { rows: cont } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE situacao_entrega NOT IN ('entregue', 'devolvido'))::int AS abertos,
              COUNT(*) FILTER (WHERE situacao_entrega NOT IN ('entregue', 'devolvido') AND previsao_entrega < $1::date)::int AS atrasados,
              COUNT(*) FILTER (WHERE situacao_entrega NOT IN ('entregue', 'devolvido') AND previsao_entrega = $1::date)::int AS hoje,
              COUNT(*) FILTER (WHERE situacao_entrega = 'ocorrencia')::int AS ocorrencia,
              COUNT(*) FILTER (WHERE situacao_entrega = 'em_rota')::int AS em_rota,
              COUNT(*) FILTER (WHERE situacao_entrega = 'entregue' AND data_entrega::date = $1::date)::int AS entregues_hoje,
              COUNT(*) FILTER (WHERE situacao_entrega = 'entregue' AND data_entrega::date >= $1::date - 30)::int AS entregues_30,
              COUNT(*) FILTER (WHERE situacao_entrega = 'entregue' AND data_entrega::date >= $1::date - 30 AND data_entrega::date <= previsao_original)::int AS no_prazo_30,
              COUNT(*) FILTER (WHERE ${FILTROS.agendar})::int AS agendar,
              COUNT(*) FILTER (WHERE ${FILTROS.agendados})::int AS agendados
         FROM ctes_emitidos c WHERE status = 'autorizado' AND COALESCE(dados->>'tpCTe', '0') <> '1'`, [hoje]);
    res.json({
      hoje, filtro, contagens: cont[0],
      linhas: rows.map((r) => ({ ...r, nfs: (r.nfes || []).map(nfDaChave).filter(Boolean), nfes: undefined })),
    });
  } catch (err) { erro(res, err, 'Erro ao montar o painel de entregas.'); }
});

// Histórico de um CT-e.
router.get('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, serie, numero, chave, status, autorizado_em, valor_total, tomador_nome, remetente_nome, destinatario_nome, cidade_fim, uf_fim,
              previsao_entrega, previsao_original, prazo_dias, situacao_entrega, data_entrega, recebedor_nome, recebedor_documento, demonstracao, dados
         FROM ctes_emitidos WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'CT-e não encontrado.' });
    const r = rows[0];
    const { rows: ocs } = await pool.query('SELECT * FROM cte_ocorrencias WHERE cte_id = $1 ORDER BY data_hora DESC, id DESC', [r.id]);
    const d = r.dados || {};
    res.json({
      ...r, destinatario_nome: r.destinatario_nome || d.destinatario?.xNome || null, dados: undefined, nfs: (d.nfes || []).map(nfDaChave).filter(Boolean),
      origem: d.inicio ? `${d.inicio.xMun}/${d.inicio.UF}` : null, destino: d.fim ? `${d.fim.xMun}/${d.fim.UF}` : null,
      endereco: d.destinatario?.endereco ? [d.destinatario.endereco.xLgr, d.destinatario.endereco.nro, d.destinatario.endereco.xBairro].filter(Boolean).join(', ') : null,
      ocorrencias: ocs.map((o) => ({ ...o, tem_comprovante: !!o.comprovante_arquivo, tem_assinatura: !!o.assinatura_arquivo, comprovante_arquivo: undefined, assinatura_arquivo: undefined })),
      agendamentos: await ag.doCte(r.id), regra_agendamento: await ag.exigeDoCte(r.id),
      contato: { nome: d.destinatario?.xNome || null, telefone: d.destinatario?.fone || d.destinatario?.endereco?.fone || null, email: d.destinatario?.email || null },
    });
  } catch (err) { erro(res, err, 'Erro ao buscar o CT-e.'); }
});

// ---------- Agendamento de entrega (regras em src/cte/agendamento.js) ----------
// POST /api/ocorrencias/:id/agendamento { data, hora_de, hora_ate, senha, doca, contato, observacao }
router.post('/:id(\\d+)/agendamento', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await ag.agendar(cliente, { cteId: Number(req.params.id), corpo: req.body || {}, usuarioNome: req.usuario.nome });
    await cliente.query('COMMIT');
    oc.depoisDeLancar([r.lancada]);
    log(req, 'cte_agendamento', `${r.reagendamento ? 'Reagendou' : 'Agendou'} a entrega do CT-e ${r.numero}: ${r.resumo}`, Number(req.params.id));
    res.status(201).json({ id: r.id, reagendamento: r.reagendamento, numero: r.numero });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao agendar a entrega.'); } finally { cliente.release(); }
});
// POST /api/ocorrencias/agendamento/:id/cancelar { motivo }
router.post('/agendamento/:id(\\d+)/cancelar', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await ag.cancelar(cliente, { id: Number(req.params.id), motivo: req.body?.motivo });
    await cliente.query('COMMIT');
    log(req, 'cte_agendamento', `Cancelou o agendamento da entrega do CT-e ${r.numero}: ${String(req.body?.motivo || '').slice(0, 200)}`, r.cteId);
    res.json({ ok: true });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao cancelar o agendamento.'); } finally { cliente.release(); }
});

// Grava uma ocorrência (regras em src/cte/ocorrencias.js).
const lancar = (cliente, req, cteId, corpo, arquivo) => oc.lancarOcorrencia(cliente, { cteId, corpo, arquivo, usuarioNome: req.usuario.nome });

// POST /api/ocorrencias/:id  (multipart: campos + "comprovante" opcional)
router.post('/:id(\\d+)', autenticar, emitir, upload.single('comprovante'), async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await lancar(cliente, req, Number(req.params.id), req.body || {}, req.file);
    await cliente.query('COMMIT');
    oc.depoisDeLancar([r]);
    log(req, 'cte_ocorrencia', `Lançou "${r.descricao}" no CT-e ${r.numero}`, Number(req.params.id));
    res.status(201).json(r);
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao lançar a ocorrência.'); } finally { cliente.release(); }
});

// POST /api/ocorrencias/lote  { ids: [...], tipo_id, data_hora, recebedor_nome, ... } — tudo ou nada.
router.post('/lote', autenticar, emitir, async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return res.status(400).json({ erro: 'Marque pelo menos um CT-e.' });
  if (ids.length > 500) return res.status(400).json({ erro: 'No máximo 500 CT-e por vez.' });
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const feitos = [];
    for (const id of ids) {
      try { feitos.push(await lancar(cliente, req, id, req.body, null)); } catch (e) { throw falha(`CT-e #${id}: ${e.message}`, e.status); }
    }
    await cliente.query('COMMIT');
    oc.depoisDeLancar(feitos);
    log(req, 'cte_ocorrencia_lote', `Lançou "${feitos[0].descricao}" em ${feitos.length} CT-e: ${feitos.map((f) => f.numero).join(', ')}`);
    res.status(201).json({ lancadas: feitos.length });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao lançar em lote.'); } finally { cliente.release(); }
});

// Apaga uma ocorrência lançada errada (fica no log quem apagou).
router.delete('/ocorrencia/:id(\\d+)', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await ag.aoApagarOcorrencia(cliente, Number(req.params.id));
    const { rows } = await cliente.query(
      `DELETE FROM cte_ocorrencias o USING ctes_emitidos c WHERE o.id = $1 AND c.id = o.cte_id RETURNING o.cte_id, o.descricao, o.data_hora, o.comprovante_arquivo, c.numero`, [req.params.id]);
    if (!rows[0]) { await cliente.query('ROLLBACK'); return res.status(404).json({ erro: 'Ocorrência não encontrada.' }); }
    await oc.recalcularSituacao(rows[0].cte_id, cliente);
    await cliente.query('COMMIT');
    if (rows[0].comprovante_arquivo) fs.rm(path.join(PASTA, rows[0].comprovante_arquivo), { force: true }, () => {});
    log(req, 'cte_ocorrencia_excluir', `Apagou a ocorrência "${rows[0].descricao}" de ${new Date(rows[0].data_hora).toLocaleString('pt-BR')} do CT-e ${rows[0].numero}`, rows[0].cte_id);
    res.json({ ok: true });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao apagar a ocorrência.'); } finally { cliente.release(); }
});

// Foto do comprovante ou assinatura (?tipo=assinatura) de uma ocorrência.
router.get('/ocorrencia/:id(\\d+)/comprovante', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT comprovante_arquivo, assinatura_arquivo FROM cte_ocorrencias WHERE id = $1', [req.params.id]);
    const nome = req.query.tipo === 'assinatura' ? rows[0]?.assinatura_arquivo : rows[0]?.comprovante_arquivo;
    if (!nome || nome.includes('/') || nome.includes('\\')) return res.status(404).send('Sem comprovante.');
    const caminho = path.join(PASTA, nome);
    if (!fs.existsSync(caminho)) return res.status(404).send('Arquivo não encontrado.');
    require('../utils/arquivoSeguro').servir(res, caminho);
  } catch (err) { res.status(500).send('Erro ao buscar o comprovante.'); }
});

module.exports = router;
