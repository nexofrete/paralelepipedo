// MDF-e (modelo 58, rodoviário): rascunhos (montados à mão, dos CT-e ou do
// romaneio), transmissão, consulta, cancelamento, encerramento, inclusão de
// motorista, MDF-e não encerrados, DAMDFE e XML. E os cadastros de veículos
// e motoristas que o MDF-e e o romaneio usam.
const express = require('express');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const emissao = require('../mdfe/emissaoMdfe');
const { gerarDamdfe } = require('../mdfe/damdfe');
const { TIPOS_CARGA, TIPOS_RODADO, TIPOS_CARROCERIA } = require('../mdfe/montarMdfe');
const { carregarEmitente } = require('../cte/emissao');

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const log = (req, acao, detalhes, registroId) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes, registroId });
const erro = (res, err, padrao) => { console.error('[mdfe]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const placaLimpa = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

router.get('/tabelas', autenticar, emitir, (req, res) => res.json({ tiposCarga: TIPOS_CARGA, tiposRodado: TIPOS_RODADO, tiposCarroceria: TIPOS_CARROCERIA }));

// ---------- Lista e rascunhos ----------
router.get('/', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ambiente, serie, numero, chave, status, protocolo, autorizado_em, encerrado_em, cstat, motivo, placa, uf_ini, uf_fim, qtd_documentos,
              valor_carga, demonstracao, romaneio_id, criado_por_nome, criado_em,
              dados->'condutores'->0->>'xNome' AS motorista
         FROM mdfes ORDER BY (status = 'autorizado') DESC, criado_em DESC LIMIT 300`);
    res.json(rows);
  } catch (err) { erro(res, err, 'Erro ao listar os MDF-e.'); }
});

router.get('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const r = await emissao.carregar(req.params.id);
    if (!r) return res.status(404).json({ erro: 'MDF-e não encontrado.' });
    const { xml_assinado: _a, xml_autorizado: _b, ...resto } = r;
    res.json({ ...resto, eventos: (r.eventos || []).map(({ xml: _x, ...ev }) => ev) });
  } catch (err) { erro(res, err, 'Erro ao abrir o MDF-e.'); }
});

async function inserir(req, dados, romaneioId = null) {
  const { rows: emp } = await pool.query('SELECT cte_ambiente FROM empresa WHERE id = 1');
  const r = emissao.resumo(dados);
  const { rows } = await pool.query(
    `INSERT INTO mdfes (ambiente, dados, placa, uf_ini, uf_fim, qtd_documentos, valor_carga, romaneio_id, criado_por_nome) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [emp[0]?.cte_ambiente || 2, dados, r.placa, r.uf_ini, r.uf_fim, r.qtd_documentos, r.valor_carga, romaneioId, req.usuario.nome]);
  return rows[0].id;
}

router.post('/', autenticar, emitir, async (req, res) => {
  try {
    const id = await inserir(req, req.body?.dados || {});
    log(req, 'mdfe', `Criou o rascunho de MDF-e #${id}`);
    res.status(201).json(await emissao.carregar(id));
  } catch (err) { erro(res, err, 'Erro ao criar o MDF-e.'); }
});

// Rascunhos a partir dos CT-e (ou de um romaneio): um MDF-e por UF de descarregamento.
router.post('/dos-ctes', autenticar, emitir, async (req, res) => {
  try {
    let ids = (req.body?.cteIds || []).map(Number).filter(Number.isInteger);
    let romaneio = null;
    if (req.body?.romaneioId) {
      ({ rows: [romaneio] } = await pool.query('SELECT * FROM romaneios WHERE id = $1', [req.body.romaneioId]));
      if (!romaneio) return res.status(404).json({ erro: 'Romaneio não encontrado.' });
      const { rows } = await pool.query('SELECT cte_id FROM romaneio_itens WHERE romaneio_id = $1 ORDER BY ordem', [romaneio.id]);
      ids = rows.map((r) => r.cte_id);
    }
    if (!ids.length) return res.status(400).json({ erro: 'Escolha os CT-e do MDF-e.' });
    // CT-e que já estão num MDF-e autorizado e não encerrado.
    const { rows: ja } = await pool.query(
      `SELECT DISTINCT c.numero, m.numero AS mdfe FROM ctes_emitidos c JOIN mdfes m ON m.status = 'autorizado'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(m.dados->'descargas') d, jsonb_array_elements_text(d->'ctes') ch WHERE ch = c.chave)
        WHERE c.id = ANY($1::int[])`, [ids]);
    if (ja.length) return res.status(409).json({ erro: `CT-e já em MDF-e aberto: ${ja.map((x) => `${x.numero} (MDF-e ${x.mdfe})`).join(', ')}. Encerre o MDF-e antes.` });
    const lista = await emissao.dadosDosCtes(ids, { romaneio });
    const criados = [];
    for (const d of lista) criados.push(await inserir(req, d, romaneio?.id || null));
    log(req, 'mdfe', `Montou ${criados.length} rascunho(s) de MDF-e com ${ids.length} CT-e${romaneio ? ` do romaneio ${romaneio.id}` : ''}`);
    res.status(201).json({ ids: criados, porUf: lista.map((d) => d.ufFim) });
  } catch (err) { erro(res, err, 'Erro ao montar o MDF-e.'); }
});

router.put('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    if (!reg) return res.status(404).json({ erro: 'MDF-e não encontrado.' });
    if (!['rascunho', 'rejeitado', 'erro'].includes(reg.status)) return res.status(409).json({ erro: `MDF-e ${reg.status} não pode ser alterado.` });
    const dados = req.body?.dados || {};
    const r = emissao.resumo(dados);
    await pool.query(`UPDATE mdfes SET dados = $2, placa = $3, uf_ini = $4, uf_fim = $5, qtd_documentos = $6, valor_carga = $7, atualizado_em = NOW() WHERE id = $1`,
      [reg.id, dados, r.placa, r.uf_ini, r.uf_fim, r.qtd_documentos, r.valor_carga]);
    res.json(await emissao.carregar(reg.id));
  } catch (err) { erro(res, err, 'Erro ao salvar o MDF-e.'); }
});

router.delete('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM mdfes WHERE id = $1 AND status = 'rascunho' AND numero IS NULL RETURNING id`, [req.params.id]);
    if (!rows[0]) return res.status(409).json({ erro: 'Só dá para excluir rascunho que ainda não recebeu número.' });
    log(req, 'mdfe', `Excluiu o rascunho de MDF-e #${req.params.id}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao excluir.'); }
});

// ---------- SEFAZ ----------
const acao = (nome, fn, msg) => router.post(`/:id(\\d+)/${nome}`, autenticar, emitir, async (req, res) => {
  try {
    let r = await fn(Number(req.params.id), req.body || {});
    if (r && typeof r === 'object') {   // não manda os XML (grandes) para a tela
      const { xml: _x, xml_assinado: _a, xml_autorizado: _b, ...resto } = r;
      r = resto.mdfe ? { ...resto, mdfe: { ...resto.mdfe, xml_assinado: undefined, xml_autorizado: undefined } } : resto;
    }
    const reg = await emissao.carregar(req.params.id);
    log(req, `mdfe_${nome}`, `${msg} o MDF-e ${reg?.serie || ''}/${reg?.numero || req.params.id}${reg?.status ? ` (${reg.status})` : ''}`, Number(req.params.id));
    res.json(r);
  } catch (err) { erro(res, err, `Erro ao ${nome}.`); }
});
acao('transmitir', (id) => emissao.transmitir(id), 'Transmitiu');
acao('consultar', (id) => emissao.consultar(id), 'Consultou');
acao('cancelar', (id, b) => emissao.cancelar(id, b.justificativa), 'Cancelou');
acao('encerrar', (id, b) => emissao.encerrar(id, b), 'Encerrou');
acao('incluir-condutor', (id, b) => emissao.incluirCondutor(id, b), 'Incluiu motorista no');

router.get('/nao-encerrados', autenticar, emitir, async (req, res) => {
  try {
    const r = await emissao.naoEncerrados();
    const chaves = r.mdfes.map((x) => x.chave);
    const { rows } = chaves.length ? await pool.query('SELECT id, serie, numero, chave, placa FROM mdfes WHERE chave = ANY($1)', [chaves]) : { rows: [] };
    res.json({ ...r, mdfes: r.mdfes.map((x) => ({ ...x, ...(rows.find((y) => y.chave === x.chave) || {}) })) });
  } catch (err) { erro(res, err, 'Erro ao consultar os não encerrados.'); }
});
router.post('/testar-conexao', autenticar, emitir, async (req, res) => {
  try { res.json(await emissao.testarConexao()); } catch (err) { erro(res, err, 'Falha ao testar a conexão.'); }
});

router.get('/:id(\\d+)/damdfe', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    if (!reg) return res.status(404).send('MDF-e não encontrado.');
    const e = await carregarEmitente();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(await gerarDamdfe(emissao.dadosParaXml(reg, e), reg));
  } catch (err) { console.error(err); res.status(500).send(`Erro ao gerar o DAMDFE: ${err.message}`); }
});
router.get('/:id(\\d+)/xml', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    const xml = reg?.xml_autorizado || reg?.xml_assinado;
    if (!xml) return res.status(404).send('MDF-e ainda sem XML.');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reg.chave || `mdfe-${reg.id}`}-mdfe.xml"`);
    res.send(`<?xml version="1.0" encoding="UTF-8"?>${xml}`);
  } catch (err) { res.status(500).send('Erro ao baixar o XML.'); }
});

// ---------- Cadastros: veículos e motoristas ----------
router.get('/veiculos', autenticar, emitir, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM veiculos ORDER BY ativo DESC, tipo, placa')).rows); } catch (err) { erro(res, err, 'Erro ao listar os veículos.'); }
});
router.post('/veiculos', autenticar, emitir, async (req, res) => {
  try {
    const b = req.body || {};
    const placa = placaLimpa(b.placa);
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return res.status(400).json({ erro: 'Placa inválida (ex.: ABC1D23 ou ABC1234).' });
    if (!(Number(b.tara) > 0)) return res.status(400).json({ erro: 'Informe a tara (kg).' });
    const v = [placa, b.tipo === 'reboque' ? 'reboque' : 'tracao', soDigitos(b.renavam) || null, Math.round(b.tara), Number(b.cap_kg) ? Math.round(b.cap_kg) : null,
      Number(b.cap_m3) ? Math.round(b.cap_m3) : null, TIPOS_RODADO[b.tp_rod] ? b.tp_rod : '01', TIPOS_CARROCERIA[b.tp_car] ? b.tp_car : '02',
      String(b.uf || '').toUpperCase().slice(0, 2) || null, String(b.descricao || '').trim().slice(0, 60) || null, b.proprietario?.doc ? b.proprietario : null, b.ativo !== false];
    const { rows } = await pool.query(
      `INSERT INTO veiculos (placa, tipo, renavam, tara, cap_kg, cap_m3, tp_rod, tp_car, uf, descricao, proprietario, ativo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (placa) DO UPDATE SET tipo = $2, renavam = $3, tara = $4, cap_kg = $5, cap_m3 = $6, tp_rod = $7, tp_car = $8, uf = $9, descricao = $10, proprietario = $11, ativo = $12 RETURNING *`, v);
    log(req, 'veiculo', `Salvou o veículo ${placa}`);
    res.json(rows[0]);
  } catch (err) { erro(res, err, 'Erro ao salvar o veículo.'); }
});
router.delete('/veiculos/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try { await pool.query('UPDATE veiculos SET ativo = FALSE WHERE id = $1', [req.params.id]); res.json({ ok: true }); } catch (err) { erro(res, err, 'Erro ao desativar.'); }
});
router.get('/motoristas', autenticar, emitir, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM motoristas ORDER BY ativo DESC, nome')).rows); } catch (err) { erro(res, err, 'Erro ao listar os motoristas.'); }
});
router.post('/motoristas', autenticar, emitir, async (req, res) => {
  try {
    const b = req.body || {};
    const cpf = soDigitos(b.cpf);
    if (!String(b.nome || '').trim()) return res.status(400).json({ erro: 'Informe o nome do motorista.' });
    if (cpf.length !== 11) return res.status(400).json({ erro: 'CPF do motorista inválido.' });
    const { rows } = await pool.query(
      `INSERT INTO motoristas (nome, cpf, telefone, cnh, cnh_validade, ativo) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (cpf) DO UPDATE SET nome = $1, telefone = $3, cnh = $4, cnh_validade = $5, ativo = $6 RETURNING *`,
      [String(b.nome).trim().toUpperCase().slice(0, 120), cpf, String(b.telefone || '').trim() || null, String(b.cnh || '').trim() || null,
        /^\d{4}-\d{2}-\d{2}$/.test(b.cnh_validade || '') ? b.cnh_validade : null, b.ativo !== false]);
    log(req, 'motorista', `Salvou o motorista ${rows[0].nome}`);
    res.json(rows[0]);
  } catch (err) { erro(res, err, 'Erro ao salvar o motorista.'); }
});
router.delete('/motoristas/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try { await pool.query('UPDATE motoristas SET ativo = FALSE WHERE id = $1', [req.params.id]); res.json({ ok: true }); } catch (err) { erro(res, err, 'Erro ao desativar.'); }
});

module.exports = router;
