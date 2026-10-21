// Romaneio (manifesto de saída para entrega): junta os CT-e de um caminhão,
// imprime a folha para o motorista, dá "saiu para entrega" em todos de uma
// vez e, no fim do dia, fecha — o que não foi entregue volta como ocorrência.
// O motorista acompanha e dá baixa pelo app (/motorista.html) com o código.
const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const oc = require('../cte/ocorrencias');
const coletas = require('../coletas');
const ag = require('../cte/agendamento');

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const log = (req, acao, detalhes, registroId) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes, registroId });
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const erro = (res, err, padrao) => { console.error('[romaneios]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O e 1/I para não confundir
const novoCodigo = () => Array.from(crypto.randomBytes(8), (b) => ALFABETO[b % ALFABETO.length]).join('');
const nfDaChave = (c) => (String(c).length === 44 ? String(Number(String(c).slice(25, 34))) : null);

// Resumo de um CT-e para o romaneio e para o app do motorista.
function itemDoCte(c) {
  const d = c.dados || {};
  const dest = d.destinatario || {}; const e = dest.endereco || {};
  const q = (re) => (d.carga?.quantidades || []).filter((x) => re.test(x.tpMed || '') || (re.source === 'PESO' && String(x.cUnid) === '01')).reduce((s, x) => s + (Number(x.qCarga) || 0), 0);
  return {
    cte_id: c.id, serie: c.serie, numero: c.numero, chave: c.chave, ordem: c.ordem,
    destinatario: dest.xNome || c.destinatario_nome || '', documento: dest.cnpj || dest.cpf || '', telefone: dest.fone || e.fone || '',
    endereco: [e.xLgr, e.nro, e.xCpl].filter(Boolean).join(', '), bairro: e.xBairro || '', cidade: d.fim?.xMun || e.xMun || '', uf: d.fim?.UF || e.UF || '', cep: e.CEP || '',
    nfs: (d.nfes || []).map(nfDaChave).filter(Boolean), volumes: q(/VOLUME/i), peso: q(/PESO/), valor_carga: Number(d.carga?.vCarga) || 0, valor_frete: Number(c.valor_total) || 0,
    previsao: c.previsao_entrega, situacao: c.situacao_entrega, data_entrega: c.data_entrega, recebedor: c.recebedor_nome,
    ultima: c.ultima || null,
    agendamento: c.agendamento || null, exige_agendamento: !!c.exige_agendamento, chegada_em: c.chegada_em || null,
  };
}

async function itensDoRomaneio(id, cliente = pool) {
  const { rows } = await cliente.query(
    `SELECT c.id, c.serie, c.numero, c.chave, c.dados, c.valor_total, c.destinatario_nome, c.previsao_entrega, c.situacao_entrega, c.data_entrega, c.recebedor_nome, i.ordem, i.chegada_em,
            (SELECT json_build_object('descricao', o.descricao, 'data_hora', o.data_hora, 'tipo', o.tipo) FROM cte_ocorrencias o
              WHERE o.cte_id = c.id ORDER BY o.data_hora DESC, o.id DESC LIMIT 1) AS ultima,
            ${ag.SQL_JSON('c')} AS agendamento, ${ag.SQL_EXIGE('c')} AS exige_agendamento
       FROM romaneio_itens i JOIN ctes_emitidos c ON c.id = i.cte_id WHERE i.romaneio_id = $1 ORDER BY i.ordem, c.numero`, [id]);
  return rows.map(itemDoCte);
}

// Confere e grava a lista de CT-e do romaneio (na ordem recebida).
async function gravarItens(cliente, romaneioId, ids) {
  const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) throw falha('Escolha pelo menos um CT-e.');
  const { rows } = await cliente.query(
    `SELECT c.id, c.numero, c.status, c.situacao_entrega,
            (SELECT r.id FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id
              WHERE ri.cte_id = c.id AND r.status <> 'fechado' AND r.id <> $2 LIMIT 1) AS outro_romaneio
       FROM ctes_emitidos c WHERE c.id = ANY($1::int[])`, [lista, romaneioId]);
  const porId = new Map(rows.map((r) => [r.id, r]));
  for (const id of lista) {
    const c = porId.get(id);
    if (!c || c.status !== 'autorizado') throw falha(`O CT-e #${id} não está autorizado.`);
    if (['entregue', 'devolvido'].includes(c.situacao_entrega)) throw falha(`O CT-e ${c.numero} já está ${c.situacao_entrega}.`);
    if (c.outro_romaneio) throw falha(`O CT-e ${c.numero} já está no romaneio ${c.outro_romaneio}, que ainda não foi fechado.`);
  }
  await cliente.query('DELETE FROM romaneio_itens WHERE romaneio_id = $1', [romaneioId]);
  await cliente.query(`INSERT INTO romaneio_itens (romaneio_id, cte_id, ordem) SELECT $1, x, o FROM unnest($2::int[]) WITH ORDINALITY AS t(x, o)`, [romaneioId, lista]);
}

function lerCabecalho(b) {
  const nome = String(b.motorista_nome || '').trim();
  if (!nome) throw falha('Informe o motorista.');
  return {
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(b.data || '')) ? b.data : oc.hojeBrasilia(),
    motorista_nome: nome.slice(0, 120), motorista_documento: String(b.motorista_documento || '').trim().slice(0, 30) || null,
    motorista_telefone: String(b.motorista_telefone || '').trim().slice(0, 30) || null, placa: String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || null,
    veiculo: String(b.veiculo || '').trim().slice(0, 60) || null, observacao: String(b.observacao || '').trim() || null,
  };
}

// Lista (abertos e em rota primeiro).
router.get('/', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.data, r.motorista_nome, r.placa, r.veiculo, r.status, r.codigo_acesso, r.saiu_em, r.fechado_em, r.criado_em,
              COUNT(i.cte_id)::int AS ctes,
              COUNT(i.cte_id) FILTER (WHERE c.situacao_entrega = 'entregue')::int AS entregues,
              COUNT(i.cte_id) FILTER (WHERE c.situacao_entrega IN ('ocorrencia', 'devolvido'))::int AS com_ocorrencia,
              (SELECT COUNT(*)::int FROM coletas k WHERE k.romaneio_id = r.id) AS coletas,
              (SELECT COUNT(*)::int FROM coletas k WHERE k.romaneio_id = r.id AND k.status = 'coletada') AS coletadas
         FROM romaneios r LEFT JOIN romaneio_itens i ON i.romaneio_id = r.id LEFT JOIN ctes_emitidos c ON c.id = i.cte_id
        WHERE r.status <> 'fechado' OR r.data >= CURRENT_DATE - 30
        GROUP BY r.id ORDER BY (r.status = 'fechado'), r.data DESC, r.id DESC LIMIT 200`);
    res.json(rows);
  } catch (err) { erro(res, err, 'Erro ao listar os romaneios.'); }
});

router.get('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM romaneios WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Romaneio não encontrado.' });
    const { rows: conf } = await pool.query(
      `SELECT id, status, resumo, concluida_em FROM conferencias WHERE romaneio_id = $1 AND tipo = 'carga' ORDER BY id DESC LIMIT 1`, [rows[0].id]);
    // Documentos vencidos do caminhão e do motorista (Frota › Documentos): aviso na tela.
    const vencidos = await require('../frotaDocumentos').vencidosDe({ placas: [rows[0].placa], cpfs: [rows[0].motorista_documento] }).catch(() => []);
    res.json({ ...rows[0], itens: await itensDoRomaneio(rows[0].id), coletas: await coletas.coletasDoRomaneio(rows[0].id), conferencia: conf[0] || null, documentos_vencidos: vencidos });
  } catch (err) { erro(res, err, 'Erro ao abrir o romaneio.'); }
});

router.post('/', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    const cab = lerCabecalho(req.body || {});
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO romaneios (data, motorista_nome, motorista_documento, motorista_telefone, placa, veiculo, observacao, codigo_acesso, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [cab.data, cab.motorista_nome, cab.motorista_documento, cab.motorista_telefone, cab.placa, cab.veiculo, cab.observacao, novoCodigo(), req.usuario.nome]);
    await gravarItens(cliente, rows[0].id, req.body.ctes);
    await cliente.query('COMMIT');
    log(req, 'romaneio', `Montou o romaneio ${rows[0].id} (${cab.motorista_nome}${cab.placa ? ` · ${cab.placa}` : ''}) com ${req.body.ctes.length} CT-e`);
    res.status(201).json({ id: rows[0].id });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao montar o romaneio.'); } finally { cliente.release(); }
});

router.put('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT status FROM romaneios WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows[0]) throw falha('Romaneio não encontrado.', 404);
    if (rows[0].status === 'fechado') throw falha('O romaneio já foi fechado.');
    const cab = lerCabecalho(req.body || {});
    await cliente.query(`UPDATE romaneios SET data = $2, motorista_nome = $3, motorista_documento = $4, motorista_telefone = $5, placa = $6, veiculo = $7, observacao = $8 WHERE id = $1`,
      [req.params.id, cab.data, cab.motorista_nome, cab.motorista_documento, cab.motorista_telefone, cab.placa, cab.veiculo, cab.observacao]);
    if (Array.isArray(req.body.ctes)) {
      if (rows[0].status !== 'aberto') throw falha('O caminhão já saiu: não dá para mudar os CT-e. Feche este romaneio e monte outro.');
      await gravarItens(cliente, Number(req.params.id), req.body.ctes);
    }
    await cliente.query('COMMIT');
    log(req, 'romaneio', `Alterou o romaneio ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao salvar o romaneio.'); } finally { cliente.release(); }
});

router.delete('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(`SELECT id FROM romaneios WHERE id = $1 AND status = 'aberto' FOR UPDATE`, [req.params.id]);
    if (!rows[0]) throw falha('Só dá para excluir romaneio que ainda não saiu.', 409);
    await coletas.soltarColetas(cliente, rows[0].id);   // as coletas voltam para "a programar"
    await cliente.query('DELETE FROM romaneios WHERE id = $1', [rows[0].id]);
    await cliente.query('COMMIT');
    log(req, 'romaneio', `Excluiu o romaneio ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao excluir.'); } finally { cliente.release(); }
});

// Saída: "Saiu para entrega" em todos os CT-e que ainda não foram entregues.
async function darSaida(id, usuarioNome) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM romaneios WHERE id = $1 FOR UPDATE', [id]);
    const r = rows[0];
    if (!r) throw falha('Romaneio não encontrado.', 404);
    if (r.status !== 'aberto') throw falha(r.status === 'em_rota' ? 'O caminhão já saiu.' : 'O romaneio já foi fechado.');
    const itens = await itensDoRomaneio(id, cliente);
    const agora = oc.agoraBrasilia();
    const lancadas = [];
    // Romaneio de redespacho (parceiro): a carga é entregue ao parceiro, que dá baixa pelo app.
    const tipoId = r.parceiro_id ? 'redespacho' : 'saiu';
    for (const it of itens.filter((x) => !['entregue', 'devolvido'].includes(x.situacao))) {
      lancadas.push(await oc.lancarOcorrencia(cliente, { cteId: it.cte_id, corpo: { tipo_id: tipoId, data_hora: agora,
        observacao: r.parceiro_id ? `Entregue ao parceiro ${r.motorista_nome} (romaneio de redespacho ${id})` : `Romaneio ${id} · ${r.motorista_nome}${r.placa ? ` · ${r.placa}` : ''}` }, usuarioNome, romaneioId: id }));
    }
    await coletas.sairComColetas(cliente, id);
    await cliente.query(`UPDATE romaneios SET status = 'em_rota', saiu_em = NOW() WHERE id = $1`, [id]);
    await cliente.query('COMMIT');
    oc.depoisDeLancar(lancadas);
    return lancadas.length;
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

router.post('/:id(\\d+)/saida', autenticar, emitir, async (req, res) => {
  try {
    const n = await darSaida(Number(req.params.id), req.usuario.nome);
    log(req, 'romaneio', `Deu saída no romaneio ${req.params.id}: ${n} CT-e em "Saiu para entrega"`);
    res.json({ ok: true, ctes: n });
  } catch (err) { erro(res, err, 'Erro ao dar saída.'); }
});

// Fecha: o que ainda está "saiu para entrega" vira "Voltou para a base sem entregar".
router.post('/:id(\\d+)/fechar', autenticar, emitir, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM romaneios WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows[0]) throw falha('Romaneio não encontrado.', 404);
    if (rows[0].status === 'fechado') throw falha('O romaneio já foi fechado.');
    const itens = await itensDoRomaneio(rows[0].id, cliente);
    const voltaram = itens.filter((x) => x.situacao === 'em_rota');
    const agora = oc.agoraBrasilia();
    const lancadas = [];
    for (const it of rows[0].status === 'em_rota' ? voltaram : []) {
      lancadas.push(await oc.lancarOcorrencia(cliente, { cteId: it.cte_id, corpo: { tipo_id: 'retorno_base', data_hora: agora,
        nova_previsao: req.body?.nova_previsao, observacao: `Romaneio ${rows[0].id} fechado` }, usuarioNome: req.usuario.nome, romaneioId: rows[0].id }));
    }
    const { rows: semBaixa } = await coletas.fecharColetas(cliente, rows[0].id);
    await cliente.query(`UPDATE romaneios SET status = 'fechado', fechado_em = NOW() WHERE id = $1`, [rows[0].id]);
    await cliente.query('COMMIT');
    oc.depoisDeLancar(lancadas);
    log(req, 'romaneio', `Fechou o romaneio ${rows[0].id}: ${itens.filter((x) => x.situacao === 'entregue').length} entregue(s), ${lancadas.length} voltou(aram) para a base`);
    res.json({ ok: true, voltaram: lancadas.length, coletas_sem_baixa: semBaixa.length });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao fechar o romaneio.'); } finally { cliente.release(); }
});

router.post('/:id(\\d+)/novo-codigo', autenticar, emitir, async (req, res) => {
  try {
    const codigo = novoCodigo();
    const { rowCount } = await pool.query(`UPDATE romaneios SET codigo_acesso = $2 WHERE id = $1 AND status <> 'fechado'`, [req.params.id, codigo]);
    if (!rowCount) return res.status(409).json({ erro: 'Romaneio fechado não tem acesso do motorista.' });
    log(req, 'romaneio', `Trocou o código do motorista do romaneio ${req.params.id}`);
    res.json({ codigo });
  } catch (err) { erro(res, err, 'Erro ao trocar o código.'); }
});

// Folha do romaneio para imprimir (abre em outra aba: ?token=...).
router.get('/:id(\\d+)/imprimir', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM romaneios WHERE id = $1', [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).send('Romaneio não encontrado.');
    const itens = await itensDoRomaneio(r.id);
    const cols = (await coletas.coletasDoRomaneio(r.id)).filter((c) => c.status !== 'cancelada');
    const { rows: emp } = await pool.query('SELECT razao_social, nome_fantasia, cnpj, telefone, logo, endereco_publico FROM empresa WHERE id = 1');
    const e = emp[0] || {};
    const base = String(e.endereco_publico || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const linkMotorista = `${base}/motorista.html?c=${r.codigo_acesso}`;
    const qr = r.status !== 'fechado' && r.codigo_acesso ? await QRCode.toString(linkMotorista, { type: 'svg', margin: 0, width: 110 }) : '';
    const n = (v, c = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
    const dia = (v) => { const d = v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T12:00:00`); return d.toLocaleDateString('pt-BR'); };
    const tot = itens.reduce((s, i) => ({ vol: s.vol + i.volumes, peso: s.peso + i.peso, carga: s.carga + i.valor_carga }), { vol: 0, peso: 0, carga: 0 });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Romaneio ${r.id}</title><style>
      @page { size: A4 landscape; margin: 10mm; } body { font: 11px Arial, sans-serif; color: #000; margin: 0; }
      .topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
      .topo img.logo { max-height: 46px; max-width: 160px; } h1 { font-size: 18px; margin: 0 0 4px; } .dados { display: grid; grid-template-columns: repeat(4, auto); gap: 2px 18px; }
      .dados b { font-size: 12px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #555; padding: 4px 5px; vertical-align: top; }
      th { background: #eee; font-size: 10px; text-align: left; } td.n { text-align: right; white-space: nowrap; } .ass { height: 30px; min-width: 150px; }
      .qr { text-align: center; font-size: 10px; } .qr svg { width: 96px; height: 96px; } .rodape { margin-top: 18px; display: flex; gap: 60px; }
      .rodape div { border-top: 1px solid #000; padding-top: 3px; min-width: 220px; text-align: center; } button { margin: 10px; padding: 8px 16px; }
      @media print { button { display: none; } }</style></head><body>
      <button onclick="window.print()">Imprimir</button>
      <div class="topo"><div>${e.logo ? `<img class="logo" src="${esc(e.logo)}" alt="">` : ''}<h1>Romaneio ${itens.length && cols.length ? 'de entrega e coleta' : cols.length ? 'de coleta' : 'de entrega'} nº ${r.id}</h1>
        <div>${esc(e.razao_social || '')}${e.cnpj ? ` · CNPJ ${esc(e.cnpj)}` : ''}${e.telefone ? ` · ${esc(e.telefone)}` : ''}</div></div>
        <div class="dados"><span>Data</span><span>Motorista</span><span>Placa / veículo</span><span>Situação</span>
          <b>${dia(r.data)}</b><b>${esc(r.motorista_nome)}${r.motorista_documento ? ` (${esc(r.motorista_documento)})` : ''}</b><b>${esc(r.placa || '—')}${r.veiculo ? ` · ${esc(r.veiculo)}` : ''}</b>
          <b>${{ aberto: 'Aguardando saída', em_rota: 'Em rota', fechado: 'Fechado' }[r.status]}</b></div>
        ${qr ? `<div class="qr">${qr}<div>App do motorista<br>código <b>${esc(r.codigo_acesso)}</b></div></div>` : ''}</div>
      ${itens.length || !cols.length ? `<table><thead><tr><th>#</th><th>CT-e</th><th>NF</th><th>Destinatário</th><th>Endereço</th><th>Cidade</th><th class="n">Vol.</th><th class="n">Peso (kg)</th><th class="n">Valor carga</th><th>Recebido por (nome legível / documento / data e hora)</th></tr></thead><tbody>
      ${itens.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.serie)}/${esc(i.numero)}</td><td>${esc(i.nfs.join(', '))}</td><td>${esc(i.destinatario)}${i.telefone ? `<br>${esc(i.telefone)}` : ''}${i.agendamento ? `<br><b>AGENDADO ${esc(ag.resumo(i.agendamento))}</b>` : ''}</td>
        <td>${esc(i.endereco)}${i.bairro ? ` — ${esc(i.bairro)}` : ''}${i.cep ? `<br>CEP ${esc(i.cep)}` : ''}</td><td>${esc(i.cidade)}/${esc(i.uf)}</td>
        <td class="n">${n(i.volumes)}</td><td class="n">${n(i.peso, 1)}</td><td class="n">${n(i.valor_carga, 2)}</td>
        <td class="ass">${i.situacao === 'entregue' ? `Entregue · ${esc(i.recebedor || '')}` : ''}</td></tr>`).join('')}
      <tr><th colspan="6">${itens.length} CT-e</th><th class="n">${n(tot.vol)}</th><th class="n">${n(tot.peso, 1)}</th><th class="n">${n(tot.carga, 2)}</th><th></th></tr></tbody></table>` : ''}
      ${cols.length ? `<h2 style="font-size:14px; margin:14px 0 6px;">Coletas (${cols.length})</h2>
      <table><thead><tr><th>Nº</th><th>Remetente</th><th>Endereço</th><th>Cidade</th><th>Horário</th><th>Contato</th><th class="n">Vol. previsto</th><th class="n">Peso previsto</th><th>NF / observação</th><th>Vol. coletados · entregue por (nome legível) · hora</th></tr></thead><tbody>
      ${cols.map((c) => `<tr><td>${c.id}</td><td>${esc(c.remetente_nome)}</td><td>${esc([c.logradouro, c.numero, c.complemento].filter(Boolean).join(', '))}${c.bairro ? ` — ${esc(c.bairro)}` : ''}</td>
        <td>${esc(c.cidade)}/${esc(c.uf)}</td><td>${c.hora_de || c.hora_ate ? `${esc(c.hora_de || '')}–${esc(c.hora_ate || '')}` : ''}</td>
        <td>${esc(c.contato_nome || '')}${c.contato_telefone ? `<br>${esc(c.contato_telefone)}` : ''}</td><td class="n">${c.volumes ?? ''}</td><td class="n">${c.peso_kg != null ? n(c.peso_kg, 1) : ''}</td>
        <td>${esc(c.notas || '')}${c.observacao ? `<br>${esc(c.observacao)}` : ''}</td>
        <td class="ass">${c.status === 'coletada' ? `Coletada · ${c.volumes_coletados} vol. · ${esc(c.entregue_por || '')}` : c.status === 'nao_coletada' ? `Não coletada: ${esc(c.motivo || '')}` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      ${r.observacao ? `<p><b>Observação:</b> ${esc(r.observacao)}</p>` : ''}
      <div class="rodape"><div>Conferente (saída)</div><div>Motorista</div><div>Conferente (retorno)</div></div>
      </body></html>`);
  } catch (err) { console.error(err); res.status(500).send('Erro ao montar o romaneio.'); }
});

module.exports = { router, itensDoRomaneio, darSaida, itemDoCte, lerCabecalho, novoCodigo, gravarItens };
