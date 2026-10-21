// App do motorista (/motorista.html): entra com o código do romaneio (sem
// login), vê as entregas na ordem, liga para o cliente, abre o mapa e dá
// baixa com foto, assinatura na tela e a localização do celular.
// O código só vale enquanto o romaneio não for fechado.
const express = require('express');
const multer = require('multer');
const pool = require('../db');
const oc = require('../cte/ocorrencias');
const { itensDoRomaneio, darSaida } = require('./romaneios');
const { registrar } = require('../auditoria');
const coletas = require('../coletas');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, fields: 20 } });
const erro = (res, err, padrao) => { console.error('[motorista]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
// O que o motorista pode lançar na rua.
const DO_MOTORISTA = ['entregue', 'retirou', 'fechado', 'ausente', 'endereco', 'mudou', 'horario', 'reentrega_cliente', 'sem_pedido', 'desacordo', 'embalagem', 'negociacao',
  'avaria_parcial', 'avaria_total', 'extravio_parcial', 'roubo', 'veiculo', 'interditada', 'devolvido', 'outros'];

async function romaneioDoCodigo(codigo) {
  const c = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 6) throw falha('Código inválido.', 404);
  const { rows } = await pool.query('SELECT * FROM romaneios WHERE codigo_acesso = $1', [c]);
  if (!rows[0]) throw falha('Código não encontrado. Confira com a expedição.', 404);
  if (rows[0].status === 'fechado') throw falha('Este romaneio já foi fechado.', 410);
  return rows[0];
}

router.get('/:codigo', async (req, res) => {
  try {
    const r = await romaneioDoCodigo(req.params.codigo);
    const { rows: emp } = await pool.query('SELECT razao_social, nome_fantasia, telefone FROM empresa WHERE id = 1');
    const itens = (await itensDoRomaneio(r.id)).map(({ valor_frete: _v, valor_carga: _c, chave: _k, ...i }) => i);   // sem valores no celular
    res.json({
      romaneio: { id: r.id, data: r.data, motorista: r.motorista_nome, placa: r.placa, veiculo: r.veiculo, status: r.status, observacao: r.observacao, parceiro: !!r.parceiro_id },
      empresa: { nome: emp[0]?.nome_fantasia || emp[0]?.razao_social || '', telefone: emp[0]?.telefone || '' },
      ocorrencias: oc.CATALOGO.filter((c) => DO_MOTORISTA.includes(c.id)).map(({ id, rotulo, tipo, grupo, pedeRecebedor, pedeObservacao, pedePrevisao }) => ({ id, rotulo, tipo, grupo, pedeRecebedor, pedeObservacao, pedePrevisao })),
      itens,
      // Coletas do mesmo caminhão (sem valor da mercadoria no celular).
      coletas: (await coletas.coletasDoRomaneio(r.id)).filter((c) => c.status !== 'cancelada').map((c) => ({
        id: c.id, status: c.status, remetente: c.remetente_nome, endereco: [c.logradouro, c.numero, c.complemento].filter(Boolean).join(', '), bairro: c.bairro,
        cidade: c.cidade, uf: c.uf, cep: c.cep, contato: c.contato_nome, telefone: c.contato_telefone, hora_de: c.hora_de, hora_ate: c.hora_ate,
        volumes: c.volumes, peso: c.peso_kg != null ? Number(c.peso_kg) : null, notas: c.notas, observacao: c.observacao, destino: [c.destino_cidade, c.destino_uf].filter(Boolean).join('/'),
        volumes_coletados: c.volumes_coletados, entregue_por: c.entregue_por, motivo: c.motivo,
      })),
      motivos_coleta: coletas.MOTIVOS,
      // Posição do celular durante a rota (monitoramento): de quanto em quanto tempo mandar.
      rastreio: { intervalo_s: (await require('../monitoramento').config()).intervalo_s },
    });
  } catch (err) { erro(res, err, 'Erro ao abrir o romaneio.'); }
});

// O motorista avisa que saiu (quando a expedição ainda não deu a saída).
router.post('/:codigo/saida', async (req, res) => {
  try {
    const r = await romaneioDoCodigo(req.params.codigo);
    const n = await darSaida(r.id, `Motorista ${r.motorista_nome}`);
    registrar({ usuarioId: null, usuarioNome: `Motorista ${r.motorista_nome}`, acao: 'romaneio', detalhes: `Saída do romaneio ${r.id} pelo app do motorista (${n} CT-e)` });
    res.json({ ok: true, ctes: n });
  } catch (err) { erro(res, err, 'Erro ao dar saída.'); }
});

// Baixa de uma entrega: multipart com tipo_id, recebedor_nome, recebedor_documento,
// observacao, nova_previsao, latitude, longitude, foto (arquivo) e assinatura (PNG em data URL).
router.post('/:codigo/entregas/:cteId(\\d+)', upload.single('foto'), async (req, res) => {
  const cliente = await pool.connect();
  try {
    const r = await romaneioDoCodigo(req.params.codigo);
    const corpo = req.body || {};
    if (!DO_MOTORISTA.includes(corpo.tipo_id)) throw falha('Escolha o que aconteceu.');
    const { rowCount } = await pool.query('SELECT 1 FROM romaneio_itens WHERE romaneio_id = $1 AND cte_id = $2', [r.id, req.params.cteId]);
    if (!rowCount) throw falha('Essa entrega não é deste romaneio.', 404);
    let assinatura = null;
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(corpo.assinatura || ''));
    if (m) {
      assinatura = Buffer.from(m[1], 'base64');
      if (assinatura.length > 1024 * 1024 || assinatura.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw falha('Assinatura inválida.');
    }
    const item = oc.PORID.get(corpo.tipo_id);
    if (item.tipo === 'entrega' && !req.file && !assinatura) throw falha('Na entrega, tire a foto do canhoto ou colete a assinatura.');
    await cliente.query('BEGIN');
    const lancada = await oc.lancarOcorrencia(cliente, {
      cteId: Number(req.params.cteId), corpo: { ...corpo, data_hora: oc.agoraBrasilia() }, arquivo: req.file, assinaturaPng: assinatura,
      usuarioNome: `Motorista ${r.motorista_nome}`, origem: 'motorista', romaneioId: r.id,
    });
    await cliente.query('COMMIT');
    oc.depoisDeLancar([lancada]);
    // Marcou "cheguei" antes: a espera acima da franquia vira estadia a cobrar.
    if (['entrega', 'problema', 'devolucao'].includes(lancada.tipo)) require('../servicosExtras').estadiaNaBaixa(r.id, Number(req.params.cteId)).catch(() => {});
    res.status(201).json(lancada);
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao registrar.'); } finally { cliente.release(); }
});

// Baixa de uma coleta: multipart com coletado (true/false), volumes, peso,
// entregue_por, motivo, observacao, latitude, longitude, foto e assinatura (PNG em data URL).
router.post('/:codigo/coletas/:id(\\d+)', upload.single('foto'), async (req, res) => {
  try {
    const r = await romaneioDoCodigo(req.params.codigo);
    const corpo = req.body || {};
    let assinatura = null;
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(corpo.assinatura || ''));
    if (m) {
      assinatura = Buffer.from(m[1], 'base64');
      if (assinatura.length > 1024 * 1024 || assinatura.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw falha('Assinatura inválida.');
    }
    const coletado = corpo.coletado === 'true';
    if (coletado && !req.file && !assinatura) throw falha('Colete a assinatura de quem entregou ou tire uma foto da mercadoria.');
    const c = await coletas.baixar(Number(req.params.id), corpo, { foto: req.file, assinaturaPng: assinatura, usuarioNome: `Motorista ${r.motorista_nome}`, romaneioId: r.id });
    registrar({ usuarioId: null, usuarioNome: `Motorista ${r.motorista_nome}`, acao: 'coleta',
      detalhes: c.status === 'coletada' ? `Coleta ${c.id} feita pelo app (${c.volumes_coletados} vol.)` : `Coleta ${c.id} não coletada pelo app: ${c.motivo}` });
    res.status(201).json({ id: c.id, status: c.status });
  } catch (err) { erro(res, err, 'Erro ao registrar a coleta.'); }
});

// Posições do celular (monitoramento): { pontos: [{ lat, lon, vel, prec, t }] }, só com o romaneio em rota.
router.post('/:codigo/posicao', express.json({ limit: '200kb' }), async (req, res) => {
  try {
    const r = await romaneioDoCodigo(req.params.codigo);
    res.json(await require('../monitoramento').registrar(r, req.body?.pontos));
  } catch (err) { erro(res, err, 'Erro ao gravar a posição.'); }
});

// "Cheguei no cliente": começa a contar a espera (estadia) desta entrega.
router.post('/:codigo/chegada/:cteId(\\d+)', async (req, res) => {
  try {
    const r = await romaneioDoCodigo(req.params.codigo);
    await require('../servicosExtras').marcarChegada(r.id, Number(req.params.cteId));
    res.json({ ok: true, chegada_em: new Date().toISOString() });
  } catch (err) { erro(res, err, 'Erro ao marcar a chegada.'); }
});

// Jornada (Lei 13.103): o motorista do romaneio marca o que está fazendo (src/jornada.js).
const jornada = require('../jornada');
const motoristaDo = (r) => ({ cpf: r.motorista_documento, nome: r.motorista_nome });
router.get('/:codigo/jornada', async (req, res) => {
  try { res.json(await jornada.estado(motoristaDo(await romaneioDoCodigo(req.params.codigo)))); } catch (err) { erro(res, err, 'Erro ao ler a jornada.'); }
});
router.post('/:codigo/jornada', express.json(), async (req, res) => {
  try {
    const r = await romaneioDoCodigo(req.params.codigo);
    const b = req.body || {};
    await jornada.marcar(motoristaDo(r), { tipo: b.tipo, latitude: b.latitude, longitude: b.longitude, origem: 'app', usuario: `Motorista ${r.motorista_nome}`, romaneio_id: r.id, placa: r.placa });
    res.status(201).json(await jornada.estado(motoristaDo(r)));
  } catch (err) { erro(res, err, 'Erro ao marcar a jornada.'); }
});

module.exports = router;
