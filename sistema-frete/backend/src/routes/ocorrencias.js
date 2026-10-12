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

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const PASTA = path.join(__dirname, '..', '..', 'dados', 'comprovantes-cte');
const log = (req, acao, detalhes, registroId) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes, registroId });
const erro = (res, err, padrao) => { console.error('[ocorrencias]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
// Número da NF dentro da chave (posições 26–34).
const nfDaChave = (c) => (String(c).length === 44 ? String(Number(String(c).slice(25, 34))) : null);

router.get('/catalogo', autenticar, emitir, (req, res) => res.json({ catalogo: oc.CATALOGO, situacoes: oc.SITUACOES }));

// CT-e autorizados sem previsão (emitidos antes deste recurso): calcula agora.
async function completarPrevisoes() {
  const { rows } = await pool.query(`SELECT id FROM ctes_emitidos WHERE status = 'autorizado' AND previsao_entrega IS NULL AND autorizado_em IS NOT NULL LIMIT 300`);
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
    const cond = ["c.status = 'autorizado'", '$1::date IS NOT NULL', FILTROS[filtro].replace(/\$HOJE/g, '$1::date')];
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
              (SELECT COUNT(*)::int FROM cte_ocorrencias o WHERE o.cte_id = c.id) AS qtd_ocorrencias
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
              COUNT(*) FILTER (WHERE situacao_entrega = 'entregue' AND data_entrega::date >= $1::date - 30 AND data_entrega::date <= previsao_original)::int AS no_prazo_30
         FROM ctes_emitidos WHERE status = 'autorizado'`, [hoje]);
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
      ocorrencias: ocs.map((o) => ({ ...o, tem_comprovante: !!o.comprovante_arquivo, comprovante_arquivo: undefined })),
    });
  } catch (err) { erro(res, err, 'Erro ao buscar o CT-e.'); }
});

// Valida e grava uma ocorrência (dentro da transação "cliente").
async function lancar(cliente, req, cteId, corpo, arquivo) {
  const item = oc.PORID.get(corpo.tipo_id);
  if (!item) throw falha('Escolha a ocorrência.');
  const { rows } = await cliente.query(`SELECT id, numero, status, autorizado_em, dados FROM ctes_emitidos WHERE id = $1 FOR UPDATE`, [cteId]);
  const cte = rows[0];
  if (!cte) throw falha('CT-e não encontrado.', 404);
  if (cte.status !== 'autorizado') throw falha(`O CT-e ${cte.numero || ''} não está autorizado (${cte.status}).`);
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/.exec(String(corpo.data_hora || ''));
  if (!m) throw falha('Informe a data e a hora da ocorrência.');
  // A hora digitada é a de Brasília; não aceita data no futuro.
  if (Date.parse(`${m[1]}T${m[2]}:00-03:00`) > Date.now() + 10 * 60000) throw falha('A data da ocorrência está no futuro.');
  const recebedor = String(corpo.recebedor_nome || '').trim();
  if (item.pedeRecebedor && item.tipo === 'entrega' && !recebedor) throw falha('Informe quem recebeu a mercadoria.');
  const obs = String(corpo.observacao || '').trim();
  if (item.pedeObservacao && !obs) throw falha('Descreva a ocorrência na observação.');
  const novaPrevisao = item.pedePrevisao ? dataIso(corpo.nova_previsao) : null;
  if (item.tipo === 'agendada' && !novaPrevisao) throw falha('Informe a data agendada para a entrega.');
  let nomeArquivo = null;
  if (arquivo) {
    if (!/^image\/|^application\/pdf$/.test(arquivo.mimetype)) throw falha('O comprovante deve ser uma foto ou um PDF.');
    fs.mkdirSync(PASTA, { recursive: true });
    nomeArquivo = `cte-${cteId}-${Date.now()}${(path.extname(arquivo.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '')}`;
    fs.writeFileSync(path.join(PASTA, nomeArquivo), arquivo.buffer);
  }
  const fim = cte.dados?.fim || {};
  const cidade = String(corpo.cidade || '').trim() || (['entrega', 'em_rota', 'problema'].includes(item.tipo) ? fim.xMun : null) || null;
  const uf = String(corpo.uf || '').trim().toUpperCase().slice(0, 2) || (cidade === fim.xMun ? fim.UF : null) || null;
  const { rows: novo } = await cliente.query(
    `INSERT INTO cte_ocorrencias (cte_id, tipo_id, codigo, descricao, tipo, data_hora, cidade, uf, recebedor_nome, recebedor_documento, nova_previsao, observacao, comprovante_arquivo, usuario_nome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [cteId, item.id, item.codigo, item.rotulo, item.tipo, `${m[1]} ${m[2]}`, cidade, uf, recebedor || null,
      String(corpo.recebedor_documento || '').trim() || null, novaPrevisao, obs || null, nomeArquivo, req.usuario.nome]);
  const situacao = await oc.recalcularSituacao(cteId, cliente);
  return { id: novo[0].id, numero: cte.numero, situacao, descricao: item.rotulo };
}

// POST /api/ocorrencias/:id  (multipart: campos + "comprovante" opcional)
router.post('/:id(\\d+)', autenticar, emitir, upload.single('comprovante'), async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await lancar(cliente, req, Number(req.params.id), req.body || {}, req.file);
    await cliente.query('COMMIT');
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
    log(req, 'cte_ocorrencia_lote', `Lançou "${feitos[0].descricao}" em ${feitos.length} CT-e: ${feitos.map((f) => f.numero).join(', ')}`);
    res.status(201).json({ lancadas: feitos.length });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao lançar em lote.'); } finally { cliente.release(); }
});

// Apaga uma ocorrência lançada errada (fica no log quem apagou).
router.delete('/ocorrencia/:id(\\d+)', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
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

router.get('/ocorrencia/:id(\\d+)/comprovante', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT comprovante_arquivo FROM cte_ocorrencias WHERE id = $1', [req.params.id]);
    const nome = rows[0]?.comprovante_arquivo;
    if (!nome || nome.includes('/') || nome.includes('\\')) return res.status(404).send('Sem comprovante.');
    const caminho = path.join(PASTA, nome);
    if (!fs.existsSync(caminho)) return res.status(404).send('Arquivo não encontrado.');
    res.sendFile(caminho);
  } catch (err) { res.status(500).send('Erro ao buscar o comprovante.'); }
});

module.exports = router;
