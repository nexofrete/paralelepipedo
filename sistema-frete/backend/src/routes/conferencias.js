// Etiquetas de volume e conferência por código de barras (bipagem):
//  - carga: confere os volumes de um romaneio antes do caminhão sair
//    (o que falta e o que sobra — volume de outro CT-e);
//  - descarga: recebimento no armazém (o que chegou de cada CT-e).
const express = require('express');
const pool = require('../db');
const { autenticar, permitir, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const et = require('../etiquetas');

const etiquetas = express.Router();
const conferencias = express.Router();
const emitir = permitir('pode_emitir_cte');
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const erro = (res, err, padrao) => { if (!err.status) console.error('[conferencias]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'conferencia', detalhes });
const empresa = async () => (await pool.query('SELECT razao_social, nome_fantasia, etiqueta_formato FROM empresa WHERE id = 1')).rows[0] || {};
const idsDaQuery = (v) => String(v || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);

// ---------------- Etiquetas ----------------
etiquetas.get('/config', autenticar, emitir, async (req, res) => {
  try { res.json({ formato: (await empresa()).etiqueta_formato || '100x100', formatos: Object.keys(et.FORMATOS) }); } catch (err) { erro(res, err, 'Erro.'); }
});
etiquetas.put('/config', autenticar, apenasAdmin, async (req, res) => {
  try {
    if (!et.FORMATOS[req.body?.formato]) throw falha('Formato inválido.');
    await pool.query('UPDATE empresa SET etiqueta_formato = $1 WHERE id = 1', [req.body.formato]);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});

// CT-e autorizados para escolher (busca por nº, NF, cliente ou cidade).
etiquetas.get('/ctes', autenticar, emitir, async (req, res) => {
  try {
    const valores = []; const onde = [`status = 'autorizado'`];
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      valores.push(`%${busca}%`, busca.replace(/\D/g, '') || '__nada__');
      onde.push(`(destinatario_nome ILIKE $1 OR remetente_nome ILIKE $1 OR cidade_fim ILIKE $1 OR numero::text = $2 OR chave = $2 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(dados->'nfes') n WHERE ltrim(substr(n, 26, 9), '0') = ltrim($2, '0')))`);
    } else onde.push(`autorizado_em >= NOW() - INTERVAL '10 days'`);
    const { rows } = await pool.query(
      `SELECT id, serie, numero, dados, destinatario_nome, remetente_nome, cidade_fim, uf_fim, autorizado_em FROM ctes_emitidos
        WHERE ${onde.join(' AND ')} ORDER BY autorizado_em DESC NULLS LAST LIMIT 200`, valores);
    res.json(rows.map(({ dados, ...c }) => ({ ...c, volumes: et.volumesDoCte(dados), nfs: (dados?.nfes || []).map((k) => String(Number(String(k).slice(25, 34)))) })));
  } catch (err) { erro(res, err, 'Erro ao listar os CT-e.'); }
});

// ?ctes=1,2,3&formato=100x100[&volumes=2,5] (volumes: reimprimir só alguns, de um CT-e só)
etiquetas.get('/imprimir', autenticar, emitir, async (req, res) => {
  try {
    const e = await empresa();
    const lista = await et.etiquetasDosCtes(idsDaQuery(req.query.ctes), { volumes: req.query.volumes ? idsDaQuery(req.query.volumes) : null });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(et.html(lista, { formato: req.query.formato || e.etiqueta_formato, empresa: e }));
  } catch (err) { res.status(err.status || 500).send(String(err.message || 'Erro ao montar as etiquetas.')); }
});
etiquetas.get('/zpl', autenticar, emitir, async (req, res) => {
  try {
    const e = await empresa();
    const lista = await et.etiquetasDosCtes(idsDaQuery(req.query.ctes), { volumes: req.query.volumes ? idsDaQuery(req.query.volumes) : null });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="etiquetas-${Date.now()}.zpl"`);
    res.send(et.zpl(lista, { formato: req.query.formato || e.etiqueta_formato, empresa: e }));
  } catch (err) { res.status(err.status || 500).send(String(err.message || 'Erro ao gerar o ZPL.')); }
});

// ---------------- Conferência ----------------
async function cabecalhoCtes(ids) {
  if (!ids.length) return [];
  const { rows } = await pool.query('SELECT id, serie, numero, dados, destinatario_nome, cidade_fim, uf_fim FROM ctes_emitidos WHERE id = ANY($1::int[])', [ids]);
  return rows.map((c) => ({ cte_id: c.id, serie: c.serie, numero: c.numero, destinatario: c.destinatario_nome || c.dados?.destinatario?.xNome || '', cidade: c.cidade_fim, uf: c.uf_fim, total: et.volumesDoCte(c.dados) }));
}

// Situação da conferência: o que se esperava, o que foi lido, faltas e sobras.
async function situacao(id) {
  const { rows } = await pool.query(
    `SELECT c.*, r.motorista_nome, r.placa, r.status AS romaneio_status FROM conferencias c LEFT JOIN romaneios r ON r.id = c.romaneio_id WHERE c.id = $1`, [id]);
  const conf = rows[0];
  if (!conf) throw falha('Conferência não encontrada.', 404);
  const { rows: leituras } = await pool.query('SELECT * FROM conferencia_leituras WHERE conferencia_id = $1 ORDER BY lido_em DESC, id DESC', [id]);
  let esperadosIds = [];
  if (conf.tipo === 'carga' && conf.romaneio_id) {
    esperadosIds = (await pool.query('SELECT cte_id FROM romaneio_itens WHERE romaneio_id = $1 ORDER BY ordem', [conf.romaneio_id])).rows.map((r) => r.cte_id);
  }
  const lidosIds = [...new Set(leituras.map((l) => l.cte_id).filter(Boolean))];
  const ctes = await cabecalhoCtes([...new Set([...esperadosIds, ...lidosIds])]);
  const porCte = new Map(ctes.map((c) => [c.cte_id, c]));
  const itens = (conf.tipo === 'carga' ? esperadosIds : lidosIds).map((cid) => {
    const c = porCte.get(cid);
    const minhas = leituras.filter((l) => l.cte_id === cid && l.resultado === 'ok');
    const inteiro = minhas.some((l) => l.volume === 0);
    const vols = new Set(minhas.map((l) => l.volume).filter((v) => v > 0));
    const faltam = inteiro ? [] : Array.from({ length: c.total }, (_, i) => i + 1).filter((v) => !vols.has(v));
    return { ...c, lidos: inteiro ? c.total : vols.size, faltam, inteiro };
  });
  const sobras = leituras.filter((l) => l.resultado === 'sobra').map((l) => ({ ...l, cte: porCte.get(l.cte_id) || null }));
  const esperado = itens.reduce((s, i) => s + i.total, 0);
  const lido = itens.reduce((s, i) => s + i.lidos, 0);
  return { ...conf, itens, sobras, leituras: leituras.slice(0, 50), totais: { esperado, lido, faltam: esperado - lido, sobras: sobras.length } };
}

conferencias.get('/', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.tipo, c.romaneio_id, c.status, c.usuario_nome, c.criado_em, c.concluida_em, c.resumo, r.motorista_nome, r.placa,
              (SELECT COUNT(*)::int FROM conferencia_leituras l WHERE l.conferencia_id = c.id) AS leituras
         FROM conferencias c LEFT JOIN romaneios r ON r.id = c.romaneio_id
        WHERE c.status = 'aberta' OR c.criado_em > NOW() - INTERVAL '30 days' ORDER BY (c.status = 'concluida'), c.criado_em DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { erro(res, err, 'Erro ao listar.'); }
});

// { tipo: 'carga', romaneio_id } ou { tipo: 'descarga' }. Carga: reaproveita a aberta do mesmo romaneio.
conferencias.post('/', autenticar, emitir, async (req, res) => {
  try {
    const tipo = req.body?.tipo === 'descarga' ? 'descarga' : 'carga';
    let romaneioId = null;
    if (tipo === 'carga') {
      romaneioId = Number(req.body?.romaneio_id) || null;
      const { rows: r } = await pool.query('SELECT id, status FROM romaneios WHERE id = $1', [romaneioId]);
      if (!r[0]) throw falha('Escolha o romaneio a conferir.');
      const { rows: aberta } = await pool.query(`SELECT id FROM conferencias WHERE romaneio_id = $1 AND tipo = 'carga' AND status = 'aberta'`, [romaneioId]);
      if (aberta[0]) return res.json({ id: aberta[0].id, existente: true });
    }
    const { rows } = await pool.query('INSERT INTO conferencias (tipo, romaneio_id, usuario_nome) VALUES ($1, $2, $3) RETURNING id', [tipo, romaneioId, req.usuario.nome]);
    log(req, tipo === 'carga' ? `Começou a conferência de carga do romaneio ${romaneioId}` : 'Começou uma conferência de descarga');
    res.status(201).json({ id: rows[0].id });
  } catch (err) { erro(res, err, 'Erro ao começar a conferência.'); }
});

conferencias.get('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try { res.json(await situacao(Number(req.params.id))); } catch (err) { erro(res, err, 'Erro ao abrir.'); }
});

// Leitura do leitor (ou digitada): { codigo }. Responde o que aconteceu, para o som e a cor da tela.
conferencias.post('/:id(\\d+)/ler', autenticar, emitir, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query('SELECT * FROM conferencias WHERE id = $1', [id]);
    const conf = rows[0];
    if (!conf) throw falha('Conferência não encontrada.', 404);
    if (conf.status !== 'aberta') throw falha('Esta conferência já foi concluída. Reabra para ler mais volumes.', 409);
    const codigo = String(req.body?.codigo || '').trim().slice(0, 60);
    const lido = et.lerCodigo(codigo);
    const resposta = (resultado, mensagem, extra = {}) => res.json({ resultado, mensagem, codigo, ...extra });
    if (!lido) return resposta('invalido', 'Código não reconhecido: não é etiqueta de volume nem chave de CT-e.');
    const { rows: ct } = await pool.query(
      lido.chave ? 'SELECT id, serie, numero, status, dados, destinatario_nome, cidade_fim FROM ctes_emitidos WHERE chave = $1' : 'SELECT id, serie, numero, status, dados, destinatario_nome, cidade_fim FROM ctes_emitidos WHERE id = $1',
      [lido.chave || lido.cteId]);
    const cte = ct[0];
    if (!cte) return resposta('invalido', 'CT-e não encontrado neste sistema.');
    const total = et.volumesDoCte(cte.dados);
    const volume = lido.chave ? 0 : lido.volume;
    const rotulo = `CT-e ${cte.serie}/${cte.numero} · ${cte.destinatario_nome || ''} · ${cte.cidade_fim || ''}`;
    if (cte.status !== 'autorizado') return resposta('invalido', `${rotulo}: está ${cte.status}.`);
    if (volume > total) return resposta('invalido', `${rotulo}: o volume ${volume} não existe (o CT-e tem ${total}).`);
    const { rowCount: repetido } = await pool.query(
      `SELECT 1 FROM conferencia_leituras WHERE conferencia_id = $1 AND cte_id = $2 AND (volume = $3 OR volume = 0)`, [id, cte.id, volume]);
    if (repetido) return resposta('repetido', `${rotulo}: ${volume ? `volume ${volume}/${total}` : 'CT-e'} já foi lido.`, { cte_id: cte.id, volume });
    let resultado = 'ok';
    if (conf.tipo === 'carga') {
      const { rowCount: noRomaneio } = await pool.query('SELECT 1 FROM romaneio_itens WHERE romaneio_id = $1 AND cte_id = $2', [conf.romaneio_id, cte.id]);
      if (!noRomaneio) resultado = 'sobra';
    }
    await pool.query('INSERT INTO conferencia_leituras (conferencia_id, codigo, cte_id, volume, resultado, usuario_nome) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, codigo, cte.id, volume, resultado, req.usuario.nome]);
    if (resultado === 'sobra') return resposta('sobra', `${rotulo}: NÃO é deste romaneio. Separe o volume ${volume || ''}.`, { cte_id: cte.id, volume });
    return resposta('ok', volume ? `${rotulo} · volume ${volume}/${total}` : `${rotulo} · CT-e inteiro (${total} vol.) pela chave`, { cte_id: cte.id, volume, total });
  } catch (err) { erro(res, err, 'Erro na leitura.'); }
});

conferencias.delete('/:id(\\d+)/leituras/:lid(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM conferencia_leituras l USING conferencias c WHERE l.id = $2 AND l.conferencia_id = $1 AND c.id = l.conferencia_id AND c.status = 'aberta'`, [req.params.id, req.params.lid]);
    if (!rowCount) return res.status(409).json({ erro: 'Não dá para desfazer esta leitura.' });
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});

conferencias.post('/:id(\\d+)/concluir', autenticar, emitir, async (req, res) => {
  try {
    const s = await situacao(Number(req.params.id));
    if (s.status !== 'aberta') throw falha('Já está concluída.', 409);
    const faltas = s.itens.filter((i) => i.faltam.length).map((i) => ({ cte_id: i.cte_id, numero: i.numero, faltam: i.faltam }));
    const resumo = { ...s.totais, faltas, sobras: s.sobras.map((x) => ({ cte_id: x.cte_id, numero: x.cte?.numero, volume: x.volume })) };
    await pool.query(`UPDATE conferencias SET status = 'concluida', concluida_em = NOW(), resumo = $2, observacao = $3 WHERE id = $1`,
      [s.id, resumo, String(req.body?.observacao || '').slice(0, 1000) || null]);
    log(req, `Concluiu a conferência ${s.id} (${s.tipo}${s.romaneio_id ? `, romaneio ${s.romaneio_id}` : ''}): ${s.totais.lido}/${s.totais.esperado} volume(s)${faltas.length ? `, faltando em ${faltas.length} CT-e` : ''}${resumo.sobras.length ? `, ${resumo.sobras.length} sobra(s)` : ''}`);
    res.json({ ok: true, resumo });
  } catch (err) { erro(res, err, 'Erro ao concluir.'); }
});

conferencias.post('/:id(\\d+)/reabrir', autenticar, emitir, async (req, res) => {
  try {
    const { rowCount } = await pool.query(`UPDATE conferencias SET status = 'aberta', concluida_em = NULL WHERE id = $1 AND status = 'concluida'`, [req.params.id]);
    if (!rowCount) return res.status(409).json({ erro: 'Não está concluída.' });
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});

module.exports = { etiquetas, conferencias, situacao };
