// Pedidos (405) e Pré-notas fiscais (406), fretes contratados: tudo sai da planilha do ERP (src/importacaoErp.js).
//  - Pedido: cada nota com número de pedido (fretes) mais os pedidos da planilha que ainda não viraram nota
//    (erp_pendentes). Situação: aguardando nota → faturado → em embarque / coleta pedida → coletado (em trânsito) →
//    entregue; cancelado quando o ERP, o WMS ou a nota cancelam. Antes da nota, o WMS diz se está em separação ou
//    já separado (pedidos_wms: status, separação, etiquetas, usuário; src/pedidosWms.js).
//  - Pré-nota: a linha da planilha (o pedido antes da NF-e). As que ainda esperam faturamento (com a idade e o alerta de
//    parada) e as já faturadas, com a comparação com a NF-e (relatório 87, divergencias()).
const pool = require('./db');
const { consultaCliente, vePotudo } = require('./permissoes');
const { divergencias } = require('./relatoriosOperacional');

const DIAS_PARADA = 3;
const hojeSP = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const dataOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const dias = (de, ate = hojeSP()) => (de ? Math.round((Date.parse(`${String(ate).slice(0, 10)}T12:00:00Z`) - Date.parse(`${String(de).slice(0, 10)}T12:00:00Z`)) / 86400000) : null);
const numero = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const semZeros = (v) => (v == null ? null : String(v).replace(/^0+(?=\d)/, ''));
const SITUACOES_PEDIDO = ['Aguardando nota', 'Em separação', 'Em conferência', 'Separado', 'Faturado', 'Em embarque', 'Coleta pedida', 'Coletado / em trânsito', 'Entregue', 'Cancelado'];

// Situação do pedido (sem banco).
function situacaoPedido(r) {
  if (r.cancelado || r.cancelado_wms) return 'Cancelado';
  if (!r.tem_nota) {
    // Status do WMS (Imperium): INTEGRADO → EM SEPARACAO → (1ª/2ª) CONFERENCIA → CONFERIDO → FINALIZADO.
    const st = String(r.status_wms || '').toUpperCase();
    if (r.sep_fim || /CONFERIDO|FINALIZ/.test(st)) return 'Separado';
    if (/CONFERENCIA|CONFERÊNCIA/.test(st)) return 'Em conferência';
    if (r.sep_inicio || /SEPARA/.test(st)) return 'Em separação';
    return 'Aguardando nota';
  }
  if (r.data_entrega) return 'Entregue';
  if (r.data_saida || r.chave_cte) return 'Coletado / em trânsito';
  if (r.ordem_id) return 'Coleta pedida';
  if (r.embarque_id) return 'Em embarque';
  return 'Faturado';
}
// Situação da pré-nota (sem banco).
function situacaoPrenota(p) {
  if (p.cancelada) return 'Cancelada no ERP';
  if (p.faturada) return p.divergencias?.length ? 'Faturada, mudou' : 'Faturada, confere';
  if (p.numero_nf) return 'NF sem XML';
  return (p.dias ?? 0) > DIAS_PARADA ? 'Parada sem faturar' : 'A faturar';
}

// Pedidos da planilha que ainda não viraram nota (ou cuja nota ainda não chegou).
async function pendentes(req) {
  const { rows } = await pool.query(`SELECT p.numero_pedido, p.numero_nf, p.dados, p.recebido_em FROM erp_pendentes p
    WHERE NOT EXISTS (SELECT 1 FROM fretes f WHERE f.frete_principal_id IS NULL AND f.numero_pedido = p.numero_pedido)`).catch(() => ({ rows: [] }));
  const cliente = vePotudo(req) ? null : String(req.usuario?.cliente_nome || '').trim().toUpperCase();
  return rows.filter((r) => !cliente || String(r.dados?.cliente || '').trim().toUpperCase() === cliente);
}

async function dadosWms(pedidosLista) {
  const ids = [...new Set(pedidosLista.filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const { rows } = await pool.query(`SELECT numero_pedido, status, usuario, qtd_etiquetas, cancelado, expedicao,
      to_char(data_inicial, 'YYYY-MM-DD HH24:MI') AS data_inicial, to_char(etiquetas_impressas_em, 'YYYY-MM-DD HH24:MI') AS etiquetas_impressas_em,
      to_char(separacao_inicio, 'YYYY-MM-DD HH24:MI') AS separacao_inicio, to_char(separacao_fim, 'YYYY-MM-DD HH24:MI') AS separacao_fim,
      to_char(liberacao, 'YYYY-MM-DD HH24:MI') AS liberacao, expedicao_numero, tipo_pedido, placa, motorista, itinerario, conferencia_pct::float AS conferencia_pct, imprimir, separador,
      to_char(expedicao_fim, 'YYYY-MM-DD HH24:MI') AS expedicao_fim, origem, to_char(atualizado_em, 'YYYY-MM-DD HH24:MI') AS wms_atualizado_em
    FROM pedidos_wms WHERE numero_pedido = ANY($1::text[])`, [ids]).catch(() => ({ rows: [] }));
  return new Map(rows.map((r) => [r.numero_pedido, r]));
}

// Observações dos pedidos (anotação livre da equipe, editável na tela).
async function observacoes(numeros) {
  const ids = [...new Set((numeros || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const { rows } = await pool.query(`SELECT numero_pedido, texto, usuario_nome, to_char(atualizado_em, 'YYYY-MM-DD HH24:MI') AS atualizado_em
    FROM pedidos_observacoes WHERE numero_pedido = ANY($1::text[])`, [ids]).catch(() => ({ rows: [] }));
  return new Map(rows.map((r) => [r.numero_pedido, r]));
}
// Grava (ou apaga, com texto vazio) a observação de um pedido.
async function salvarObservacao(numero, texto, usuario) {
  const n = String(numero || '').trim();
  if (!/^[\w.\-/]{1,50}$/.test(n)) throw Object.assign(new Error('Pedido inválido.'), { status: 400 });
  const t = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!t) { await pool.query('DELETE FROM pedidos_observacoes WHERE numero_pedido = $1', [n]); return { numero_pedido: n, texto: null }; }
  await pool.query(`INSERT INTO pedidos_observacoes (numero_pedido, texto, usuario_nome, atualizado_em) VALUES ($1, $2, $3, NOW())
    ON CONFLICT (numero_pedido) DO UPDATE SET texto = EXCLUDED.texto, usuario_nome = EXCLUDED.usuario_nome, atualizado_em = NOW()`, [n, t, usuario?.nome || null]);
  return { numero_pedido: n, texto: t };
}

// Filtro da tela Pedidos pelo status e tipo do pedido no ERP (padrão: status A, tipo P = liberados pelo comercial).
// Só os pedidos com esses valores aparecem; sem o status (planilha antiga ou de outro ERP), só com o filtro desligado.
const letras = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z0-9]{1,10}$/.test(x)))];
async function config() {
  const { rows: [c] } = await pool.query('SELECT filtrar, estatus, tipos, usuario_nome, to_char(atualizado_em, \'YYYY-MM-DD HH24:MI\') AS atualizado_em FROM pedidos_config WHERE id = 1').catch(() => ({ rows: [] }));
  return c || { filtrar: true, estatus: ['A'], tipos: ['P'] };
}
async function salvarConfig(b = {}, usuario) {
  const estatus = letras(b.estatus); const tipos = letras(b.tipos);
  if (b.filtrar !== false && !estatus.length) throw Object.assign(new Error('Informe pelo menos um status (ex.: A).'), { status: 400 });
  await pool.query(`INSERT INTO pedidos_config (id, filtrar, estatus, tipos, atualizado_em, usuario_nome) VALUES (1, $1, $2, $3, NOW(), $4)
    ON CONFLICT (id) DO UPDATE SET filtrar = $1, estatus = $2, tipos = $3, atualizado_em = NOW(), usuario_nome = $4`, [b.filtrar !== false, estatus.length ? estatus : ['A'], tipos, usuario?.nome || null]);
  return config();
}
const passaFiltro = (cfg, estatus, tipo) => !cfg.filtrar || (!!estatus && cfg.estatus.includes(String(estatus).toUpperCase()) && (!cfg.tipos.length || (!!tipo && cfg.tipos.includes(String(tipo).toUpperCase()))));

async function pedidos(req, q = {}) {
  const hoje = hojeSP();
  // Sem data escolhida: os últimos 30 dias; buscando por texto, o último ano.
  const de = dataOk(q.de) || (() => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (String(q.busca || '').trim() ? 365 : 30)); return d.toISOString().slice(0, 10); })();
  const ate = dataOk(q.ate) || hoje;
  const cfg = await config();
  const { rows } = await consultaCliente(req, `SELECT f.id, f.numero_pedido AS pedido, f.pedido_mercus AS pedido_cliente, to_char(COALESCE(f.data_pedido, f.data_emissao_nf, f.criado_em::date), 'YYYY-MM-DD') AS data_pedido,
      f.cliente, f.cliente_documento AS cnpj, f.cliente_nome_curto AS nome_curto, f.cubagem_m3::float AS cubagem, f.expedicao,
      to_char(f.pedido_liberado_em, 'YYYY-MM-DD HH24:MI') AS liberado_em, f.cidade, f.uf, f.qtd_volumes AS volumes, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso, f.valor_faturado::float AS valor,
      COALESCE(f.transportadora_cte, f.transportadora, f.transportadora_nfe) AS transportadora, LTRIM(f.numero_nf, '0') AS nf, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao_nf,
      f.chave_nfe IS NOT NULL AS tem_nota, f.numero_cte, f.chave_cte, to_char(f.data_saida, 'YYYY-MM-DD') AS data_saida, to_char(f.data_entrega, 'YYYY-MM-DD') AS data_entrega,
      (f.nf_cancelada IS TRUE OR COALESCE(f.status, '') = 'Cancelado') AS cancelado,
      (SELECT e.id FROM embarques e WHERE f.id = ANY(e.frete_ids) AND e.status <> 'cancelado' ORDER BY e.id DESC LIMIT 1) AS embarque_id,
      (SELECT o.id FROM ordens_coleta o WHERE f.id = ANY(o.frete_ids) AND o.status IN ('rascunho', 'enviada', 'aceita') ORDER BY o.id DESC LIMIT 1) AS ordem_id
    FROM fretes f WHERE f.frete_principal_id IS NULL AND NULLIF(TRIM(f.numero_pedido), '') IS NOT NULL AND f.nf_entrada IS NOT TRUE
      AND COALESCE(f.data_pedido, f.data_emissao_nf, f.criado_em::date) BETWEEN $1::date AND $2::date
      AND (NOT $3::boolean OR (UPPER(f.erp_estatus_pedido) = ANY($4::text[]) AND (cardinality($5::text[]) = 0 OR UPPER(f.erp_tipo_pedido) = ANY($5::text[]))))
    ORDER BY COALESCE(f.data_pedido, f.data_emissao_nf, f.criado_em::date) DESC, f.numero_pedido DESC LIMIT 5000`, [de, ate, cfg.filtrar, cfg.estatus, cfg.tipos]).catch(() => ({ rows: [] }));
  const lista = rows.map((r) => ({ ...r, origem: 'nota' }));
  const pend = await pendentes(req);
  for (const p of pend) {
    const d = p.dados || {};
    const data = d.data_pedido || (p.recebido_em ? new Date(p.recebido_em).toISOString().slice(0, 10) : null);
    if (data && (data < de || data > ate)) continue;
    if (!passaFiltro(cfg, d.estatus_pedido || d._estatus_pedido, d.tipo_pedido)) continue;
    lista.push({ id: null, pedido: p.numero_pedido, pedido_cliente: d.pedido_mercus || null, data_pedido: data, cliente: d.cliente || null, cidade: d.cidade || null, uf: d.uf || null,
      cnpj: d.cliente_documento || null, nome_curto: d.cliente_nome_curto || null, cubagem: numero(d.cubagem_m3), expedicao: d.expedicao || null,
      liberado_em: d.pedido_liberado_em ? String(d.pedido_liberado_em).slice(0, 16) : null,
      volumes: numero(d.qtd_volumes), peso: numero(d.peso_kg), valor: numero(d.valor_faturado), transportadora: d.transportadora || null, nf: semZeros(p.numero_nf || d.numero_nf),
      emissao_nf: d.data_emissao_nf || null, tem_nota: false, cancelado: d._estatus_pedido === 'C' || d._nf_cancelada === 'S', origem: 'planilha' });
  }
  // WMS: status, separação, etiquetas, usuário, cancelamento (e a liberação/expedição, quando o WMS traz).
  const wms = await dadosWms(lista.map((r) => r.pedido));
  const libs = await require('./liberacaoComercial').dosPedidos(lista.map((r) => r.pedido));
  const obs = await observacoes(lista.map((r) => r.pedido));
  for (const r of lista) {
    const w = wms.get(String(r.pedido)) || {};
    Object.assign(r, {
      status_wms: w.status || null, data_inicial: w.data_inicial || null, usuario: w.usuario || null, etiquetas_em: w.etiquetas_impressas_em || null,
      qtd_etiquetas: w.qtd_etiquetas ?? null, sep_inicio: w.separacao_inicio || null, sep_fim: w.separacao_fim || null, cancelado_wms: w.cancelado === true,
      liberado_em: w.liberacao || r.liberado_em || null, expedicao: w.expedicao || r.expedicao || null, tem_wms: !!w.numero_pedido,
      separador: w.separador || null, exp_wms: w.expedicao_numero || null,
      obs: obs.get(String(r.pedido))?.texto || null, obs_por: obs.get(String(r.pedido))?.usuario_nome || null, obs_em: obs.get(String(r.pedido))?.atualizado_em || null,
      lib_comercial: libs.get(String(r.pedido))?.liberado_em || null, lib_comercial_origem: libs.get(String(r.pedido))?.origem || null,
      lib_comercial_de: libs.get(String(r.pedido))?.email_de || libs.get(String(r.pedido))?.usuario_nome || null, tipo_pedido: w.tipo_pedido || null, placa: w.placa || null, motorista: w.motorista || null, itinerario: w.itinerario || null,
      conferencia_pct: w.conferencia_pct ?? null, imprimir: w.imprimir ?? null, exp_fim: w.expedicao_fim || null, wms_origem: w.origem || null, wms_atualizado_em: w.wms_atualizado_em || null,
    });
    r.sep_minutos = r.sep_inicio && r.sep_fim ? Math.round((Date.parse(r.sep_fim.replace(' ', 'T')) - Date.parse(r.sep_inicio.replace(' ', 'T'))) / 60000) : null;
  }
  const busca = String(q.busca || '').trim().toUpperCase();
  const todos = lista.map((r) => ({ ...r, situacao: situacaoPedido(r), dias: dias(r.data_pedido, hoje), destino: [r.cidade, r.uf].filter(Boolean).join('/') }))
    // CNPJ digitado com pontuação também acha (compara só os números).
    .filter((r) => !busca || (busca.replace(/\D/g, '').length >= 8 && String(r.cnpj || '').includes(busca.replace(/\D/g, ''))) || [r.pedido, r.pedido_cliente, r.cliente, r.nome_curto, r.cnpj, r.nf, r.cidade, r.transportadora, r.status_wms, r.usuario, r.placa, r.motorista, r.exp_wms, r.obs].some((x) => String(x || '').toUpperCase().includes(busca)))
    .sort((a, b) => String(b.data_pedido || '').localeCompare(String(a.data_pedido || '')));
  const contagem = Object.fromEntries(SITUACOES_PEDIDO.map((s) => [s, todos.filter((r) => r.situacao === s).length]));
  const filtro = String(q.situacao || '');
  const ativos = todos.filter((r) => r.situacao !== 'Cancelado');
  return {
    de, ate, filtro_erp: cfg, situacoes: SITUACOES_PEDIDO, contagem, pedidos: filtro ? todos.filter((r) => r.situacao === filtro) : todos,
    resumo: { pedidos: ativos.length, valor: Math.round(ativos.reduce((t, r) => t + (r.valor || 0), 0) * 100) / 100, peso: Math.round(ativos.reduce((t, r) => t + (r.peso || 0), 0) * 10) / 10,
      aguardando_nota: contagem['Aguardando nota'], aguardando_mais_dias: todos.filter((r) => r.situacao === 'Aguardando nota' && r.dias > DIAS_PARADA).length,
      em_separacao: contagem['Em separação'] + contagem['Em conferência'], separados: contagem.Separado, com_wms: todos.filter((r) => r.tem_wms).length,
      etiquetas: todos.reduce((t, r) => t + (r.qtd_etiquetas || 0), 0) },
  };
}

async function prenotas(req, q = {}) {
  const hoje = hojeSP();
  const lista = [];
  for (const p of await pendentes(req)) {
    const d = p.dados || {};
    const recebida = p.recebido_em ? new Date(p.recebido_em).toISOString().slice(0, 10) : null;
    const desde = d.data_pedido || recebida;
    const x = { pedido: p.numero_pedido, pedido_cliente: d.pedido_mercus || null, data_pedido: d.data_pedido || null, recebida_em: recebida, cliente: d.cliente || null,
      destino: [d.cidade, d.uf].filter(Boolean).join('/'), transportadora: d.transportadora || null, valor: numero(d.valor_faturado), volumes: numero(d.qtd_volumes), peso: numero(d.peso_kg),
      cubagem: numero(d.cubagem_m3), numero_nf: semZeros(p.numero_nf || d.numero_nf), cancelada: d._estatus_pedido === 'C' || d._nf_cancelada === 'S', faturada: false, dias: dias(desde, hoje),
      cif_fob: d.frete_cif_fob || null };
    lista.push({ ...x, situacao: situacaoPrenota(x) });
  }
  // As já faturadas (a pré-nota guardada na nota), dos últimos 60 dias.
  const { rows } = await consultaCliente(req, `SELECT f.id, f.pre_nota, LTRIM(f.numero_nf, '0') AS nf, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao_nf, f.cliente, f.cliente_documento,
      f.valor_faturado::float AS valor_nf, f.qtd_volumes AS volumes_nf, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso_nf, COALESCE(f.transportadora_cte, f.transportadora) AS transportadora_nf,
      f.cidade, f.uf FROM fretes f WHERE f.pre_nota IS NOT NULL AND f.data_emissao_nf >= CURRENT_DATE - 60 ORDER BY f.data_emissao_nf DESC LIMIT 3000`, []).catch(() => ({ rows: [] }));
  for (const r of rows) {
    const pn = r.pre_nota || {};
    const div = divergencias({ valor: r.valor_nf, volumes: r.volumes_nf, peso: r.peso_nf, transportadora: r.transportadora_nf, cidade: r.cidade, uf: r.uf, cliente_documento: r.cliente_documento }, pn);
    const x = { id: r.id, pedido: pn.numero_pedido || null, data_pedido: pn.data_pedido || null, recebida_em: pn.recebido_em ? String(pn.recebido_em).slice(0, 10) : null, cliente: pn.cliente || r.cliente,
      destino: [pn.cidade || r.cidade, pn.uf || r.uf].filter(Boolean).join('/'), transportadora: pn.transportadora || null, valor: numero(pn.valor_faturado), volumes: numero(pn.qtd_volumes),
      peso: numero(pn.peso_kg), numero_nf: r.nf, emissao_nf: r.emissao_nf, valor_nf: r.valor_nf, faturada: true, divergencias: div,
      dias: pn.data_pedido && r.emissao_nf ? dias(pn.data_pedido, r.emissao_nf) : null };
    lista.push({ ...x, situacao: situacaoPrenota(x) });
  }
  const SIT = ['A faturar', 'Parada sem faturar', 'NF sem XML', 'Faturada, confere', 'Faturada, mudou', 'Cancelada no ERP'];
  const busca = String(q.busca || '').trim().toUpperCase();
  const todos = lista.filter((r) => !busca || [r.pedido, r.pedido_cliente, r.cliente, r.numero_nf, r.destino, r.transportadora].some((x) => String(x || '').toUpperCase().includes(busca)));
  const contagem = Object.fromEntries(SIT.map((s) => [s, todos.filter((r) => r.situacao === s).length]));
  const filtro = String(q.situacao || '');
  const abertas = todos.filter((r) => !r.faturada && !r.cancelada);
  const fat = todos.filter((r) => r.faturada && r.dias != null);
  return {
    situacoes: SIT, contagem, dias_parada: DIAS_PARADA,
    prenotas: (filtro ? todos.filter((r) => r.situacao === filtro) : todos).sort((a, b) => Number(a.faturada) - Number(b.faturada) || (b.dias ?? 0) - (a.dias ?? 0)),
    resumo: { abertas: abertas.length, valor_aberto: Math.round(abertas.reduce((t, r) => t + (r.valor || 0), 0) * 100) / 100, paradas: contagem['Parada sem faturar'],
      com_diferenca: contagem['Faturada, mudou'], dias_ate_faturar: fat.length ? Math.round((fat.reduce((t, r) => t + r.dias, 0) / fat.length) * 10) / 10 : null },
  };
}

module.exports = { config, salvarConfig, passaFiltro, salvarObservacao, situacaoPedido, situacaoPrenota, pedidos, prenotas, SITUACOES_PEDIDO, DIAS_PARADA };
