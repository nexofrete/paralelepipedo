// Modelos de planilha por ERP — para a empresa cujo ERP só troca planilha.
//  • Importação: a pessoa sobe uma planilha de exemplo, o sistema sugere qual
//    coluna é qual (pelo nome) e ela confirma. O modelo guarda esse "de-para" e
//    a importação (manual ou automática pela pasta) usa o modelo escolhido.
//    Sem modelo, vale o formato de sempre (importacaoErp.mapearPlanilha).
//  • Exportação: CT-e, fretes (notas) ou faturas do período, com as colunas,
//    títulos e ordem que o ERP da empresa espera (CSV ou Excel).
const XLSX = require('xlsx');
const pool = require('../db');
const { celula } = require('../utils/csv');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const normal = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

// ======================= Importação =======================
// Campos que a planilha pode preencher; "nomes" = como costumam vir nos ERPs (para a sugestão).
const CAMPOS_IMPORTACAO = [
  { campo: 'numero_pedido', rotulo: 'Nº do pedido', tipo: 'texto', nomes: ['NR_PEDIDO', 'PEDIDO', 'NUM_PEDIDO', 'NUMERO_PEDIDO', 'NRO_PEDIDO', 'COD_PEDIDO', 'ORDEM_VENDA', 'OV', 'DOCUMENTO_VENDA'] },
  { campo: 'numero_nf', rotulo: 'Nº da nota fiscal', tipo: 'texto', nomes: ['NR_NF', 'NR_NOTA', 'NF', 'NOTA', 'NOTA_FISCAL', 'NUMERO_NF', 'NUM_NF', 'NUMERO_NOTA', 'NFE', 'NRO_NF', 'N_NF'] },
  { campo: 'chave_nfe', rotulo: 'Chave da NF-e (44 dígitos)', tipo: 'chave', nomes: ['CHAVE_NFE', 'CHAVE', 'CHAVE_ACESSO', 'CHAVE_DE_ACESSO', 'CDCHAVEACESSONFELETRONICA', 'CHAVE_NF'] },
  { campo: 'data_emissao_nf', rotulo: 'Emissão da NF', tipo: 'data', nomes: ['DT_EMISSAO_NF', 'DATA_EMISSAO', 'EMISSAO', 'DT_EMISSAO', 'DATA_NF', 'DATA_NOTA', 'DATA_FATURAMENTO'] },
  { campo: 'data_pedido', rotulo: 'Data do pedido', tipo: 'data', nomes: ['DT_PEDIDO_LIBERADO', 'DATA_PEDIDO', 'DT_PEDIDO', 'DATA_LIBERACAO'] },
  { campo: 'cliente', rotulo: 'Cliente (destinatário)', tipo: 'texto', nomes: ['NM_CLIENTE', 'CLIENTE', 'NOME_CLIENTE', 'RAZAO_SOCIAL', 'DESTINATARIO', 'NOME_DESTINATARIO'] },
  { campo: 'cliente_documento', rotulo: 'CNPJ/CPF do cliente', tipo: 'documento', nomes: ['CDCPF_CGC', 'CNPJ', 'CPF_CNPJ', 'CNPJ_CPF', 'CNPJ_CLIENTE', 'DOCUMENTO_CLIENTE', 'CGC'] },
  { campo: 'cidade', rotulo: 'Cidade de entrega', tipo: 'texto', nomes: ['CIDADE', 'MUNICIPIO', 'CIDADE_ENTREGA', 'CIDADE_DESTINO'] },
  { campo: 'bairro', rotulo: 'Bairro', tipo: 'texto', nomes: ['BAIRRO', 'BAIRRO_ENTREGA'] },
  { campo: 'uf', rotulo: 'UF', tipo: 'uf', nomes: ['UF', 'ESTADO', 'UF_ENTREGA', 'UF_DESTINO'] },
  { campo: 'transportadora', rotulo: 'Transportadora', tipo: 'texto', nomes: ['TRANSPORTADORA', 'TRANSPORTADOR', 'NOME_TRANSPORTADORA'] },
  { campo: 'frete_cif_fob', rotulo: 'Frete CIF/FOB', tipo: 'cif', nomes: ['FRETE_CIF_FOB', 'CIF_FOB', 'TIPO_FRETE', 'MODALIDADE_FRETE', 'FRETE'] },
  { campo: 'redespacho', rotulo: 'Redespacho (transportadora)', tipo: 'texto', nomes: ['REDESPACHO', 'TRANSPORTADORA_REDESPACHO'] },
  { campo: 'cidade_redespacho', rotulo: 'Cidade do redespacho', tipo: 'texto', nomes: ['CIDADE_REDESPACHO'] },
  { campo: 'valor_faturado', rotulo: 'Valor da nota (R$)', tipo: 'numero', nomes: ['VALOR_FATURADO', 'VLDOCUMENTO', 'VALOR_NF', 'VALOR_NOTA', 'VALOR_TOTAL', 'VALOR', 'VL_NF', 'TOTAL_NF'] },
  { campo: 'qtd_volumes', rotulo: 'Volumes', tipo: 'numero', nomes: ['QTD_CAIXAS', 'QTD_VOLUMES', 'VOLUMES', 'QTDE_VOLUMES', 'CAIXAS', 'QTD_VOL'] },
  { campo: 'peso_kg', rotulo: 'Peso (kg)', tipo: 'numero', nomes: ['PESO_KG', 'PESO_BRUTO_KG', 'PESO_BRUTO', 'PESO_TOTAL', 'PESO'] },
  { campo: 'cubagem_m3', rotulo: 'Cubagem (m³)', tipo: 'numero', nomes: ['CUBAGEM_M3', 'CUBAGEM', 'VOLUME_M3', 'M3', 'METROS_CUBICOS'] },
  { campo: 'pedido_mercus', rotulo: 'Pedido do cliente', tipo: 'texto', nomes: ['PEDIDO_CLIENTE', 'PEDIDO_DO_CLIENTE', 'OC', 'ORDEM_COMPRA', 'PEDIDO_COMPRA'] },
  { campo: 'numero_mapa', rotulo: 'Nº do mapa de carregamento', tipo: 'texto', nomes: ['NR_MAPA_CARREGAMENTO', 'MAPA', 'MAPA_CARREGAMENTO', 'NUMERO_MAPA', 'ROMANEIO', 'CARGA'] },
  { campo: 'observacoes', rotulo: 'Observação', tipo: 'texto', nomes: ['OBSERVACAO_PEDIDO', 'OBSERVACAO', 'OBS', 'OBSERVACOES'] },
  { campo: 'pedido_cancelado', rotulo: 'Pedido cancelado? (coluna)', tipo: 'sim_nao', nomes: ['ESTATUS_PEDIDO', 'STATUS_PEDIDO', 'PEDIDO_CANCELADO', 'CANCELADO', 'SITUACAO_PEDIDO'] },
  { campo: 'nf_cancelada', rotulo: 'NF cancelada? (coluna)', tipo: 'sim_nao', nomes: ['NF_CANCELADA', 'NOTA_CANCELADA', 'SITUACAO_NF', 'STATUS_NF'] },
];
const CAMPO = Object.fromEntries(CAMPOS_IMPORTACAO.map((c) => [c.campo, c]));

// Lê .xlsx/.xls/.csv. CSV com ";" (o comum no Brasil) ou ",". Devolve cabeçalhos e linhas (objetos pelo cabeçalho).
function lerArquivo(buffer, nome = '') {
  if (!buffer?.length) throw falha('Arquivo vazio.');
  let wb;
  const texto = /\.(csv|txt)$/i.test(nome) || (!/^PK/.test(buffer.slice(0, 2).toString('latin1')) && !/^\xD0\xCF/.test(buffer.slice(0, 2).toString('latin1')));
  if (texto) {
    let t = buffer.toString('utf8');
    if (t.includes('�')) t = buffer.toString('latin1');                    // CSV salvo pelo Excel em ANSI
    t = t.replace(/^﻿/, '');
    const primeira = t.split(/\r?\n/)[0] || '';
    const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : primeira.includes('\t') ? '\t' : ',';
    wb = XLSX.read(t, { type: 'string', FS: sep, raw: true });
  } else {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  }
  const aba = wb.Sheets[wb.SheetNames[0]];
  if (!aba) throw falha('A planilha não tem nenhuma aba.');
  const matriz = XLSX.utils.sheet_to_json(aba, { header: 1, defval: null, raw: !texto, blankrows: false });
  const cab = (matriz[0] || []).map((c, i) => String(c ?? '').trim() || `Coluna ${i + 1}`);
  if (!cab.length) throw falha('Não achei o cabeçalho (os nomes das colunas na 1ª linha).');
  // Nomes repetidos ganham sufixo, para não perder coluna.
  const vistos = new Map();
  const cabecalhos = cab.map((c) => { const n = (vistos.get(c) || 0) + 1; vistos.set(c, n); return n > 1 ? `${c} (${n})` : c; });
  const linhas = matriz.slice(1).filter((l) => l.some((v) => v != null && String(v).trim() !== ''))
    .map((l) => Object.fromEntries(cabecalhos.map((c, i) => [c, l[i] ?? null])));
  return { cabecalhos, linhas };
}

// Sugestão: cada campo pega a coluna com nome igual (ou muito parecido) a um dos nomes conhecidos.
function sugerir(cabecalhos) {
  const norm = cabecalhos.map((c) => ({ c, n: normal(c) }));
  const usadas = new Set();
  const colunas = {};
  for (const f of CAMPOS_IMPORTACAO) {
    const nomes = f.nomes.map(normal);
    let achou = norm.find((x) => !usadas.has(x.c) && nomes.includes(x.n));
    if (!achou) achou = norm.find((x) => !usadas.has(x.c) && x.n.length >= 4 && nomes.some((n) => n.length >= 4 && (x.n.startsWith(n) || n.startsWith(x.n))));
    if (achou) { colunas[f.campo] = achou.c; usadas.add(achou.c); }
  }
  return { colunas };
}

const paraTexto = (v) => { if (v == null) return null; const t = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim(); return t || null; };
function paraNumero(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!t) return null;
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');                    // 1.234,56
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');              // 1.234 (milhar)
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function paraData(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(v.getTime() + 12 * 3600000).toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  const t = String(v).trim();
  const br = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) { const a = br[3].length === 2 ? `20${br[3]}` : br[3]; const s = `${a}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`; return Number.isNaN(Date.parse(`${s}T12:00:00Z`)) ? null : s; }
  const isoM = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return isoM ? `${isoM[1]}-${isoM[2]}-${isoM[3]}` : null;
}
const SIM = /^(S|SIM|Y|YES|C|CANCELAD[OA]|X|1|TRUE|VERDADEIRO)$/i;
function converter(tipo, v) {
  switch (tipo) {
    case 'numero': return paraNumero(v);
    case 'data': return paraData(v);
    case 'chave': { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 44 ? d : null; }
    case 'documento': return String(v ?? '').replace(/\D/g, '') || null;
    case 'uf': { const u = String(v ?? '').trim().toUpperCase(); return /^[A-Z]{2}$/.test(u) ? u : null; }
    case 'cif': {
      const t = normal(v);
      if (!t) return null;
      if (/^(C|CIF|E|EMITENTE|REMETENTE|0|POR CONTA DO REMETENTE)$/.test(t) || t.startsWith('CIF')) return 'CIF';
      if (/^(F|FOB|D|DESTINATARIO|1)$/.test(t) || t.startsWith('FOB')) return 'FOB';
      return paraTexto(v);
    }
    case 'sim_nao': return SIM.test(String(v ?? '').trim());
    default: return paraTexto(v);
  }
}

// Linhas da planilha → mesmo formato que a importação de sempre usa (importarLinhas).
function mapear(linhas, config = {}) {
  const col = config.colunas || {};
  const pega = (l, campo) => (col[campo] && Object.prototype.hasOwnProperty.call(l, col[campo]) ? converter(CAMPO[campo].tipo, l[col[campo]]) : null);
  return linhas.map((l) => {
    const o = {};
    for (const f of CAMPOS_IMPORTACAO) if (!['pedido_cancelado', 'nf_cancelada'].includes(f.campo)) o[f.campo] = pega(l, f.campo);
    if (!o.numero_nf && o.chave_nfe) o.numero_nf = String(Number(o.chave_nfe.slice(25, 34)));
    if (o.numero_nf) o.numero_nf = String(o.numero_nf).replace(/\.0+$/, '');
    // ERP sem nº de pedido: a nota faz esse papel (é a chave da linha).
    if (!o.numero_pedido) o.numero_pedido = o.numero_nf || null;
    if (o.qtd_volumes != null) o.qtd_volumes = Math.round(o.qtd_volumes);
    if (o.pedido_mercus) o.pedido_mercus = (String(o.pedido_mercus).match(/\d+/) || [null])[0];
    o._estatus_pedido = pega(l, 'pedido_cancelado') ? 'C' : null;
    o._nf_cancelada = pega(l, 'nf_cancelada') ? 'S' : null;
    o._nr_nf = o.numero_nf; o._nr_nota = null;
    o.itens_sem_medida = null;
    return o.numero_pedido ? o : null;
  }).filter(Boolean);
}

function lerConfigImportacao(b = {}) {
  const colunas = {};
  for (const [campo, coluna] of Object.entries(b.colunas || {})) {
    if (CAMPO[campo] && coluna && String(coluna).trim()) colunas[campo] = String(coluna).slice(0, 120);
  }
  if (!colunas.numero_pedido && !colunas.numero_nf && !colunas.chave_nfe) throw falha('Indique pelo menos a coluna do nº do pedido, do nº da NF ou da chave da NF-e.');
  return { colunas };
}

// Prévia: lê o arquivo e mostra as primeiras linhas já convertidas.
function previa(buffer, nome, config) {
  const { cabecalhos, linhas } = lerArquivo(buffer, nome);
  const cfg = config?.colunas ? config : sugerir(cabecalhos);
  const mapeadas = mapear(linhas, cfg);
  return { cabecalhos, amostra: linhas.slice(0, 5), sugestao: cfg, total: linhas.length, validas: mapeadas.length, convertidas: mapeadas.slice(0, 5), campos: CAMPOS_IMPORTACAO.map(({ campo, rotulo }) => ({ campo, rotulo })) };
}

// ======================= Exportação =======================
const dataBr = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const RECURSOS = {
  ctes: {
    rotulo: 'CT-e emitidos (transportadora)',
    data: 'Emissão do CT-e',
    campos: [
      ['chave', 'Chave do CT-e', 'texto'], ['serie', 'Série', 'texto'], ['numero', 'Número', 'texto'], ['data_emissao', 'Emissão', 'data'], ['status', 'Situação', 'texto'],
      ['tipo', 'Tipo', 'texto'], ['cfop', 'CFOP', 'texto'], ['valor', 'Valor da prestação', 'numero'], ['valor_a_receber', 'Valor a receber', 'numero'],
      ['tomador_documento', 'CNPJ/CPF do tomador', 'texto'], ['tomador_nome', 'Tomador', 'texto'], ['remetente_documento', 'CNPJ/CPF do remetente', 'texto'], ['remetente_nome', 'Remetente', 'texto'],
      ['destinatario_documento', 'CNPJ/CPF do destinatário', 'texto'], ['destinatario_nome', 'Destinatário', 'texto'], ['destino_cidade', 'Cidade de destino', 'texto'], ['destino_uf', 'UF de destino', 'texto'],
      ['nfes', 'Chaves das NF-e', 'texto'], ['nfs', 'Números das NF', 'texto'], ['previsao_entrega', 'Previsão de entrega', 'data'], ['data_entrega', 'Data da entrega', 'data'],
      ['recebedor', 'Recebedor', 'texto'], ['fatura_numero', 'Nº da fatura', 'texto'],
    ],
  },
  fretes: {
    rotulo: 'Notas e fretes (embarcador: custo do frete por nota)',
    data: 'Emissão da NF',
    campos: [
      ['numero_pedido', 'Nº do pedido', 'texto'], ['numero_nf', 'Nº da NF', 'texto'], ['chave_nfe', 'Chave da NF-e', 'texto'], ['data_emissao_nf', 'Emissão da NF', 'data'],
      ['cliente', 'Cliente', 'texto'], ['cidade', 'Cidade', 'texto'], ['uf', 'UF', 'texto'], ['valor_faturado', 'Valor da NF', 'numero'], ['peso_kg', 'Peso (kg)', 'numero'],
      ['qtd_volumes', 'Volumes', 'numero'], ['transportadora', 'Transportadora', 'texto'], ['transportadora_cnpj', 'CNPJ da transportadora', 'texto'], ['numero_cte', 'Nº do CT-e', 'texto'],
      ['chave_cte', 'Chave do CT-e', 'texto'], ['data_emissao_cte', 'Emissão do CT-e', 'data'], ['valor_frete', 'Valor do frete (CT-e)', 'numero'], ['valor_tabelado', 'Frete pela tabela', 'numero'],
      ['percent_frete', '% frete sobre a NF', 'numero'], ['numero_fatura', 'Nº da fatura da transportadora', 'texto'], ['data_vencimento', 'Vencimento', 'data'],
      ['data_coleta', 'Data da coleta', 'data'], ['data_entrega', 'Data da entrega', 'data'], ['status', 'Situação', 'texto'],
    ],
  },
  faturas: {
    rotulo: 'Faturas de frete (contas a receber)',
    data: 'Emissão da fatura',
    campos: [
      ['numero', 'Nº da fatura', 'texto'], ['emissao', 'Emissão', 'data'], ['vencimento', 'Vencimento', 'data'], ['status', 'Situação', 'texto'],
      ['tomador_documento', 'CNPJ/CPF do cliente', 'texto'], ['tomador_nome', 'Cliente', 'texto'], ['valor_bruto', 'Valor bruto', 'numero'], ['desconto', 'Desconto', 'numero'],
      ['valor_liquido', 'Valor líquido', 'numero'], ['valor_pago', 'Valor pago', 'numero'], ['saldo', 'Saldo', 'numero'], ['data_pagamento', 'Data do último pagamento', 'data'],
      ['linha_digitavel', 'Linha digitável do boleto', 'texto'], ['documentos', 'CT-e/NFS-e da fatura (chaves)', 'texto'],
    ],
  },
};

async function linhasDoRecurso(recurso, de, ate) {
  const recursos = require('./recursos');
  if (recurso === 'ctes') {
    const { rows } = await pool.query(
      `SELECT ${recursos.COLUNAS_CTE}, ft.numero AS fatura_numero FROM ctes_emitidos c LEFT JOIN faturas_transporte ft ON ft.id = c.fatura_id
        WHERE c.chave IS NOT NULL AND c.status IN ('autorizado', 'cancelado', 'substituido') AND c.autorizado_em::date BETWEEN $1::date AND $2::date ORDER BY c.autorizado_em, c.id LIMIT 20000`, [de, ate]);
    return rows.map((r) => {
      const c = recursos.cte(r);
      return { ...c, tomador_documento: c.tomador.documento, tomador_nome: c.tomador.nome, remetente_documento: c.remetente?.documento, remetente_nome: c.remetente?.nome,
        destinatario_documento: c.destinatario?.documento, destinatario_nome: c.destinatario?.nome, destino_cidade: c.destino.cidade, destino_uf: c.destino.uf,
        nfes: c.nfes.join(' '), nfs: c.nfes.map((k) => String(Number(k.slice(25, 34)))).join(' '), previsao_entrega: c.entrega.previsao, data_entrega: c.entrega.data,
        recebedor: c.entrega.recebedor?.nome || '', fatura_numero: r.fatura_numero ?? '' };
    });
  }
  if (recurso === 'fretes') {
    const { rows } = await pool.query(
      `SELECT numero_pedido, numero_nf, chave_nfe, data_emissao_nf::text, cliente, cidade, uf, valor_faturado::float, peso_kg::float, qtd_volumes,
              COALESCE(transportadora_cte, transportadora) AS transportadora, transportadora_cnpj_cte AS transportadora_cnpj, numero_cte, chave_cte, data_emissao_cte::text,
              COALESCE(valor_total_frete, valor_total_cte, valor_frete_negociado)::float AS valor_frete, valor_frete_tabelado::float AS valor_tabelado, percent_frete::float,
              numero_fatura, data_vencimento::text, data_coleta::text, data_entrega::text, status
         FROM fretes WHERE frete_principal_id IS NULL AND data_emissao_nf BETWEEN $1::date AND $2::date ORDER BY data_emissao_nf, id LIMIT 20000`, [de, ate]);
    return rows;
  }
  const { rows } = await pool.query(`SELECT ${recursos.COLUNAS_FATURA} FROM faturas_transporte f WHERE f.emissao BETWEEN $1::date AND $2::date ORDER BY f.emissao, f.numero LIMIT 20000`, [de, ate]);
  return (await recursos.faturasCompletas(rows)).map((f) => ({
    ...f, tomador_documento: f.tomador.documento, tomador_nome: f.tomador.nome, linha_digitavel: f.boleto?.linha_digitavel || '',
    data_pagamento: f.pagamentos.length ? f.pagamentos[f.pagamentos.length - 1].data : '', documentos: f.documentos.map((d) => d.chave).filter(Boolean).join(' '),
  }));
}

function lerConfigExportacao(b = {}) {
  const r = RECURSOS[b.recurso];
  if (!r) throw falha('Escolha o que exportar (CT-e, fretes ou faturas).');
  const validos = new Map(r.campos.map(([c, t]) => [c, t]));
  const colunas = (Array.isArray(b.colunas) ? b.colunas : []).filter((x) => validos.has(x?.campo)).slice(0, 60)
    .map((x) => ({ campo: x.campo, titulo: String(x.titulo || validos.get(x.campo)).trim().slice(0, 60) || validos.get(x.campo) }));
  if (!colunas.length) throw falha('Escolha pelo menos uma coluna.');
  return {
    recurso: b.recurso, colunas,
    formato: b.formato === 'xlsx' ? 'xlsx' : 'csv',
    separador: [';', ',', 'tab'].includes(b.separador) ? b.separador : ';',
    decimal: b.decimal === '.' ? '.' : ',',
    data: b.data === 'iso' ? 'iso' : 'br',
    cabecalho: b.cabecalho !== false,
  };
}

async function exportar(cfg, { de, ate }) {
  if (!iso(de) || !iso(ate) || de > ate) throw falha('Informe o período.');
  if ((Date.parse(ate) - Date.parse(de)) / 86400000 > 370) throw falha('Período de até 1 ano.');
  const tipos = new Map(RECURSOS[cfg.recurso].campos.map(([c, , t]) => [c, t]));
  const linhas = await linhasDoRecurso(cfg.recurso, de, ate);
  const valor = (l, campo) => {
    const v = l[campo]; const t = tipos.get(campo);
    if (v == null || v === '') return t === 'numero' && cfg.formato === 'xlsx' ? null : '';
    if (t === 'data') return cfg.data === 'iso' ? String(v).slice(0, 10) : dataBr(v);
    if (t === 'numero') { const n = Number(v); return cfg.formato === 'xlsx' ? n : (cfg.decimal === ',' ? String(n).replace('.', ',') : String(n)); }
    return String(v);
  };
  const titulos = cfg.colunas.map((c) => c.titulo);
  const dados = linhas.map((l) => cfg.colunas.map((c) => valor(l, c.campo)));
  const nome = `${cfg.recurso}-${de}-a-${ate}`;
  if (cfg.formato === 'xlsx') {
    const aba = XLSX.utils.aoa_to_sheet(cfg.cabecalho ? [titulos, ...dados] : dados);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, aba, cfg.recurso.slice(0, 30));
    return { conteudo: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), nome: `${nome}.xlsx`, tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', linhas: linhas.length };
  }
  const sep = cfg.separador === 'tab' ? '\t' : cfg.separador;
  const texto = [...(cfg.cabecalho ? [titulos] : []), ...dados].map((l) => l.map((v) => celula(v, sep)).join(sep)).join('\r\n');
  return { conteudo: Buffer.from(`﻿${texto}\r\n`, 'utf8'), nome: `${nome}.csv`, tipo: 'text/csv; charset=utf-8', linhas: linhas.length };
}

// ======================= Cadastro dos modelos =======================
async function listar() {
  const { rows } = await pool.query('SELECT id, nome, tipo, config, ativo, criado_por_nome, criado_em, atualizado_em FROM erp_modelos ORDER BY tipo, nome');
  return rows;
}
async function carregar(id) {
  const { rows: [m] } = await pool.query('SELECT * FROM erp_modelos WHERE id = $1', [id]);
  if (!m) throw falha('Modelo não encontrado.', 404);
  return m;
}
function lerModelo(b = {}) {
  const nome = String(b.nome || '').trim().slice(0, 80);
  if (!nome) throw falha('Dê um nome ao modelo (ex.: "ERP Alterdata — pedidos").');
  if (!['importacao', 'exportacao'].includes(b.tipo)) throw falha('Tipo de modelo inválido.');
  return { nome, tipo: b.tipo, config: b.tipo === 'importacao' ? lerConfigImportacao(b.config) : lerConfigExportacao(b.config) };
}
async function criar(b, usuarioNome) {
  const m = lerModelo(b);
  const { rows: [r] } = await pool.query('INSERT INTO erp_modelos (nome, tipo, config, criado_por_nome) VALUES ($1,$2,$3,$4) RETURNING *', [m.nome, m.tipo, JSON.stringify(m.config), usuarioNome || null]);
  return r;
}
async function alterar(id, b) {
  const atual = await carregar(id);
  const m = lerModelo({ ...b, tipo: atual.tipo });
  const { rows: [r] } = await pool.query('UPDATE erp_modelos SET nome = $2, config = $3, atualizado_em = NOW() WHERE id = $1 RETURNING *', [id, m.nome, JSON.stringify(m.config)]);
  return r;
}
async function excluir(id) {
  const { rowCount } = await pool.query('DELETE FROM erp_modelos WHERE id = $1', [id]);
  if (!rowCount) throw falha('Modelo não encontrado.', 404);
  await pool.query('UPDATE configuracao_importacao_erp SET modelo_id = NULL WHERE modelo_id = $1', [id]);
}

// Importa um arquivo com o modelo (ou com o formato de sempre, se não houver modelo).
async function importarComModelo(buffer, nome, modeloId, usuarioId) {
  const imp = require('../importacaoErp');
  if (!modeloId) {
    const r = await imp.importarBuffer(buffer, usuarioId);
    // Planilha com linhas, mas nenhuma reconhecida no formato padrão: é de outro ERP.
    if (!r.total) {
      let linhas = 0; try { linhas = lerArquivo(buffer, nome).linhas.length; } catch { linhas = 0; }
      if (linhas) r.aviso = `A planilha tem ${linhas} linha(s), mas nenhuma está no formato padrão (coluna NR_PEDIDO). Crie um modelo para as colunas deste ERP em Configuração → Integração → Modelos de planilha.`;
    }
    return r;
  }
  const m = await carregar(modeloId);
  if (m.tipo !== 'importacao') throw falha('Esse modelo é de exportação.');
  const { linhas } = lerArquivo(buffer, nome);
  return imp.importarLinhasMapeadas(mapear(linhas, m.config), usuarioId);
}

module.exports = {
  CAMPOS_IMPORTACAO, RECURSOS, lerArquivo, sugerir, mapear, previa, converter, paraNumero, paraData,
  lerConfigExportacao, exportar, listar, carregar, criar, alterar, excluir, importarComModelo,
};
