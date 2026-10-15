// Coletas: pedido, programação no romaneio, baixa e geração do CT-e.
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const coletas = require('../coletas');
const rom = require('./romaneios');

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, fields: 20 } });
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'coleta', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[coletas]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };

const FILTROS = {
  abertas: `c.status IN ('pendente', 'programada', 'em_coleta', 'nao_coletada')`,
  pendente: `c.status IN ('pendente', 'nao_coletada')`,
  programada: `c.status IN ('programada', 'em_coleta')`,
  sem_cte: `c.status = 'coletada' AND c.cte_id IS NULL`,
  coletada: `c.status = 'coletada'`,
  cancelada: `c.status = 'cancelada'`,
  todas: 'TRUE',
};

router.get('/catalogo', autenticar, emitir, (req, res) => res.json({ status: coletas.STATUS, canais: coletas.CANAIS, motivos: coletas.MOTIVOS }));

// Lista com o resumo do dia. ?filtro=abertas&busca=&de=&ate=
router.get('/', autenticar, emitir, async (req, res) => {
  try {
    const filtro = FILTROS[req.query.filtro] ? req.query.filtro : 'abertas';
    const valores = []; const onde = [FILTROS[filtro]];
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      valores.push(`%${busca}%`, busca.replace(/\D/g, '') || '__nada__');
      onde.push(`(c.remetente_nome ILIKE $1 OR c.destinatario_nome ILIKE $1 OR c.cidade ILIKE $1 OR c.bairro ILIKE $1 OR c.notas ILIKE $1
                 OR c.solicitante_nome ILIKE $1 OR c.remetente_doc LIKE '%' || $2 || '%' OR c.id::text = $2)`);
    }
    // Período só nas que já terminaram (as abertas aparecem todas).
    if (!['abertas', 'pendente', 'programada', 'sem_cte'].includes(filtro)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '')) { valores.push(req.query.de); onde.push(`c.data_coleta >= $${valores.length}`); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '')) { valores.push(req.query.ate); onde.push(`c.data_coleta <= $${valores.length}`); }
    }
    const { rows } = await pool.query(
      `SELECT c.*, r.motorista_nome, r.placa, r.status AS romaneio_status, ct.numero AS cte_numero, ct.serie AS cte_serie, ct.status AS cte_status,
              (c.foto_arquivo IS NOT NULL) AS tem_foto, (c.assinatura_arquivo IS NOT NULL) AS tem_assinatura
         FROM coletas c LEFT JOIN romaneios r ON r.id = c.romaneio_id LEFT JOIN ctes_emitidos ct ON ct.id = c.cte_id
        WHERE ${onde.join(' AND ')}
        ORDER BY CASE c.status WHEN 'nao_coletada' THEN 0 WHEN 'pendente' THEN 1 WHEN 'programada' THEN 2 WHEN 'em_coleta' THEN 3 ELSE 4 END,
                 c.data_coleta ${['abertas', 'pendente', 'programada'].includes(filtro) ? 'ASC' : 'DESC'}, c.hora_de NULLS LAST, c.id DESC
        LIMIT 500`, valores);
    const { rows: resumo } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('pendente', 'nao_coletada'))::int AS a_programar,
              COUNT(*) FILTER (WHERE status IN ('pendente', 'nao_coletada') AND data_coleta < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS atrasadas,
              COUNT(*) FILTER (WHERE status IN ('programada', 'em_coleta'))::int AS programadas,
              COUNT(*) FILTER (WHERE status = 'coletada' AND coletado_em >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo')::int AS coletadas_hoje,
              COUNT(*) FILTER (WHERE status = 'coletada' AND cte_id IS NULL)::int AS sem_cte
         FROM coletas`);
    res.json({ coletas: rows, resumo: resumo[0] });
  } catch (err) { erro(res, err, 'Erro ao listar as coletas.'); }
});

// Remetentes para o autocompletar: cadastro de clientes + coletas anteriores.
router.get('/clientes', autenticar, emitir, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const d = q.replace(/\D/g, '');
    const { rows } = await pool.query(
      `SELECT documento, razao_social AS nome, ie, logradouro, numero, complemento, bairro, municipio AS cidade, uf, cep, cod_municipio, telefone, email
         FROM clientes WHERE razao_social ILIKE $1 OR nome_fantasia ILIKE $1 OR ($2 <> '' AND documento LIKE $2 || '%')
        ORDER BY ultima_nf_em DESC NULLS LAST LIMIT 12`, [`%${q}%`, d]);
    res.json(rows);
  } catch (err) { erro(res, err, 'Erro na busca.'); }
});

router.get('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, r.motorista_nome, r.placa, r.status AS romaneio_status, ct.numero AS cte_numero, ct.serie AS cte_serie, ct.status AS cte_status
         FROM coletas c LEFT JOIN romaneios r ON r.id = c.romaneio_id LEFT JOIN ctes_emitidos ct ON ct.id = c.cte_id WHERE c.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Coleta não encontrada.' });
    res.json(rows[0]);
  } catch (err) { erro(res, err, 'Erro ao abrir a coleta.'); }
});

router.post('/', autenticar, emitir, async (req, res) => {
  try {
    const c = await coletas.criar(req.body || {}, req.usuario.nome);
    log(req, `Registrou a coleta ${c.id} (${c.remetente_nome}, ${c.cidade}/${c.uf}, ${c.data_coleta.toISOString?.().slice(0, 10) || c.data_coleta})`);
    res.status(201).json(c);
  } catch (err) { erro(res, err, 'Erro ao registrar a coleta.'); }
});

router.put('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const c = await coletas.alterar(Number(req.params.id), req.body || {});
    log(req, `Alterou a coleta ${c.id}`);
    res.json(c);
  } catch (err) { erro(res, err, 'Erro ao salvar a coleta.'); }
});

router.post('/:id(\\d+)/cancelar', autenticar, emitir, async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '').trim().slice(0, 250);
    if (!motivo) throw Object.assign(new Error('Informe o motivo do cancelamento.'), { status: 400 });
    const { rows } = await pool.query(
      `UPDATE coletas SET status = 'cancelada', motivo = $2, romaneio_id = CASE WHEN status IN ('programada', 'em_coleta') THEN NULL ELSE romaneio_id END, atualizado_em = NOW()
        WHERE id = $1 AND status IN ('pendente', 'programada', 'em_coleta', 'nao_coletada') RETURNING id`, [req.params.id, motivo]);
    if (!rows[0]) return res.status(409).json({ erro: 'Esta coleta não pode ser cancelada.' });
    log(req, `Cancelou a coleta ${req.params.id}: ${motivo}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao cancelar.'); }
});

router.post('/:id(\\d+)/reabrir', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE coletas SET status = 'pendente', romaneio_id = NULL, motivo = NULL, atualizado_em = NOW() WHERE id = $1 AND status = 'cancelada' RETURNING id`, [req.params.id]);
    if (!rows[0]) return res.status(409).json({ erro: 'Só dá para reabrir coleta cancelada.' });
    log(req, `Reabriu a coleta ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao reabrir.'); }
});

// Programar: { coletas: [ids], romaneio_id } ou { coletas, novo: { motorista_nome, placa, ... } }.
router.post('/programar', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    const b = req.body || {};
    await cliente.query('BEGIN');
    let romaneioId = Number(b.romaneio_id) || null;
    if (!romaneioId) {
      const cab = rom.lerCabecalho(b.novo || {});
      const { rows } = await cliente.query(
        `INSERT INTO romaneios (data, motorista_nome, motorista_documento, motorista_telefone, placa, veiculo, observacao, codigo_acesso, criado_por_nome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [cab.data, cab.motorista_nome, cab.motorista_documento, cab.motorista_telefone, cab.placa, cab.veiculo, cab.observacao, rom.novoCodigo(), req.usuario.nome]);
      romaneioId = rows[0].id;
    }
    const n = await coletas.programar(cliente, romaneioId, b.coletas);
    await cliente.query('COMMIT');
    log(req, `Programou ${n} coleta(s) no romaneio ${romaneioId}`);
    res.json({ ok: true, romaneio_id: romaneioId, coletas: n });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao programar.'); } finally { cliente.release(); }
});

router.post('/:id(\\d+)/desprogramar', autenticar, emitir, async (req, res) => {
  try {
    await coletas.desprogramar(Number(req.params.id));
    log(req, `Tirou a coleta ${req.params.id} do romaneio`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao tirar do romaneio.'); }
});

// Baixa pelo escritório (o motorista avisou por telefone, por exemplo).
router.post('/:id(\\d+)/baixa', autenticar, emitir, upload.single('foto'), async (req, res) => {
  try {
    const c = await coletas.baixar(Number(req.params.id), req.body || {}, { foto: req.file, usuarioNome: req.usuario.nome });
    log(req, c.status === 'coletada' ? `Baixou a coleta ${c.id}: ${c.volumes_coletados} volume(s)` : `Coleta ${c.id} não coletada: ${c.motivo}`);
    res.json(c);
  } catch (err) { erro(res, err, 'Erro ao dar baixa.'); }
});

router.post('/:id(\\d+)/gerar-cte', autenticar, emitir, async (req, res) => {
  try {
    const r = await coletas.gerarCte(Number(req.params.id), req.usuario.nome);
    if (!r.existente) log(req, `Gerou o rascunho de CT-e #${r.id} da coleta ${req.params.id}`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao gerar o CT-e.'); }
});

// Foto ou assinatura da baixa (?tipo=assinatura).
router.get('/:id(\\d+)/arquivo', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT foto_arquivo, assinatura_arquivo FROM coletas WHERE id = $1', [req.params.id]);
    const nome = req.query.tipo === 'assinatura' ? rows[0]?.assinatura_arquivo : rows[0]?.foto_arquivo;
    if (!nome) return res.status(404).send('Sem arquivo.');
    const arquivo = path.join(coletas.PASTA, path.basename(nome));
    if (!fs.existsSync(arquivo)) return res.status(404).send('Arquivo não encontrado.');
    res.sendFile(arquivo);
  } catch (err) { res.status(500).send('Erro.'); }
});

module.exports = router;
