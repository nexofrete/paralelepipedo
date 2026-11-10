// Piso mínimo de frete da ANTT (Lei 13.703/2018, Política Nacional de Pisos Mínimos do Transporte
// Rodoviário de Cargas). O piso de uma viagem é:
//     piso = distância (km) × CCD  +  CC        (+ retorno vazio: fator × km de volta × CCD)
// CCD = coeficiente de custo de deslocamento (R$/km) e CC = coeficiente de carga e descarga (R$),
// da tabela da operação (A lotação, B só o veículo automotor, C lotação de alto desempenho,
// D só o veículo de alto desempenho), do tipo de carga e do número de eixos.
// A ANTT muda os coeficientes por resolução (todo ano e quando o diesel varia além do gatilho), por
// isso eles são CADASTRADOS aqui (Tabelas de preço » Piso ANTT), com o número da resolução e a
// vigência; cada gravação fica no histórico. O sistema não traz números prontos.
const XLSX = require('xlsx');
const pool = require('./db');

const TABELAS = {
  A: 'A — Lotação (veículo e implemento)',
  B: 'B — Só o veículo automotor (cavalo)',
  C: 'C — Lotação de alto desempenho',
  D: 'D — Só o veículo automotor, alto desempenho',
};
const TIPOS = {
  granel_solido: 'Granel sólido',
  granel_liquido: 'Granel líquido',
  frigorificada: 'Frigorificada ou aquecida',
  conteinerizada: 'Conteinerizada',
  carga_geral: 'Carga geral',
  neogranel: 'Neogranel',
  perigosa_granel_solido: 'Perigosa (granel sólido)',
  perigosa_granel_liquido: 'Perigosa (granel líquido)',
  perigosa_frigorificada: 'Perigosa (frigorificada ou aquecida)',
  perigosa_conteinerizada: 'Perigosa (conteinerizada)',
  perigosa_carga_geral: 'Perigosa (carga geral)',
  granel_pressurizada: 'Carga granel pressurizada',
};
const EIXOS = [2, 3, 4, 5, 6, 7, 9];
const PADRAO = { resolucao: null, vigencia: null, fator_retorno: 0.92, bloquear_ciot: true, atualizado_em: null, atualizado_por: null };

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const numero = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// "Perigosa - granel líquido", "carga geral", "CARGA_GERAL"... → código do tipo.
function lerTipo(v) {
  const t = norm(v);
  if (!t) return null;
  if (TIPOS[t.replace(/ /g, '_')]) return t.replace(/ /g, '_');
  const perigosa = /perigos/.test(t);
  const base = /pressuriz/.test(t) ? 'granel_pressurizada'
    : /frigor|aquecid|refriger/.test(t) ? 'frigorificada'
      : /conte[i]?ner/.test(t) ? 'conteinerizada'
        : /neogranel/.test(t) ? 'neogranel'
          : /granel/.test(t) && /liquid/.test(t) ? 'granel_liquido'
            : /granel/.test(t) && /solid/.test(t) ? 'granel_solido'
              : /geral/.test(t) ? 'carga_geral' : null;
  if (!base) return null;
  if (base === 'granel_pressurizada' || base === 'neogranel') return perigosa ? null : base;
  return perigosa ? `perigosa_${base}` : base;
}
const lerTabela = (v) => { const t = String(v || '').trim().toUpperCase().replace(/^TABELA\s*/, '').slice(0, 1); return TABELAS[t] ? t : null; };

// ---------- Configuração e coeficientes ----------
async function config() {
  const { rows } = await pool.query('SELECT antt_piso_config FROM empresa WHERE id = 1');
  return { ...PADRAO, ...(rows[0]?.antt_piso_config || {}) };
}
async function coeficientes() {
  const { rows } = await pool.query('SELECT tabela, tipo_carga, eixos, ccd, cc FROM antt_piso_coeficientes ORDER BY tabela, tipo_carga, eixos');
  return rows.map((r) => ({ tabela: r.tabela, tipo_carga: r.tipo_carga, eixos: r.eixos, ccd: Number(r.ccd), cc: Number(r.cc) }));
}
async function situacao() {
  const [cfg, lista] = await Promise.all([config(), coeficientes()]);
  return { config: cfg, coeficientes: lista, tabelas: TABELAS, tipos: TIPOS, eixos: EIXOS, total: lista.length };
}

function validarLinhas(linhas) {
  const ok = []; const erros = []; const vistos = new Set();
  linhas.forEach((l, i) => {
    const tabela = lerTabela(l.tabela); const tipo = lerTipo(l.tipo_carga); const eixos = parseInt(l.eixos, 10);
    const ccd = numero(l.ccd); const cc = numero(l.cc);
    if (ccd == null && cc == null) return;   // linha em branco do modelo
    const onde = `linha ${l.linha || i + 1}`;
    if (!tabela) { erros.push(`${onde}: tabela "${l.tabela}" (use A, B, C ou D)`); return; }
    if (!tipo) { erros.push(`${onde}: tipo de carga "${l.tipo_carga}" não reconhecido`); return; }
    if (!EIXOS.includes(eixos)) { erros.push(`${onde}: eixos "${l.eixos}" (use 2, 3, 4, 5, 6, 7 ou 9)`); return; }
    if (!(ccd > 0) || ccd > 100) { erros.push(`${onde}: CCD (R$/km) inválido`); return; }
    if (cc == null || cc < 0 || cc > 100000) { erros.push(`${onde}: CC (R$) inválido`); return; }
    const chave = `${tabela}|${tipo}|${eixos}`;
    if (vistos.has(chave)) { erros.push(`${onde}: repetida (tabela ${tabela}, ${TIPOS[tipo]}, ${eixos} eixos)`); return; }
    vistos.add(chave);
    ok.push({ tabela, tipo_carga: tipo, eixos, ccd: Math.round(ccd * 10000) / 10000, cc: centavos(cc) });
  });
  return { ok, erros };
}

// Grava a lista inteira (substitui a anterior) e guarda no histórico.
async function salvar({ linhas, resolucao, vigencia, fator_retorno, bloquear_ciot }, usuarioNome) {
  const { ok, erros } = validarLinhas(Array.isArray(linhas) ? linhas : []);
  if (erros.length) throw falha(`Corrija antes de gravar: ${erros.slice(0, 6).join('; ')}${erros.length > 6 ? ` (e mais ${erros.length - 6})` : ''}.`);
  const res = String(resolucao || '').trim().slice(0, 80);
  if (ok.length && !res) throw falha('Informe a resolução da ANTT de onde vieram os coeficientes (ex.: Resolução ANTT nº 6.xxx/2026).');
  const vig = /^\d{4}-\d{2}-\d{2}$/.test(String(vigencia || '')) ? vigencia : null;
  if (ok.length && !vig) throw falha('Informe a data de início da vigência dos coeficientes.');
  const fator = numero(fator_retorno);
  const atual = await config();
  const cfg = { ...atual, resolucao: res || null, vigencia: vig, fator_retorno: fator != null && fator >= 0 && fator <= 2 ? fator : atual.fator_retorno,
    bloquear_ciot: bloquear_ciot !== false, atualizado_em: new Date().toISOString(), atualizado_por: usuarioNome || null };
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    await db.query('DELETE FROM antt_piso_coeficientes');
    for (const l of ok) {
      await db.query('INSERT INTO antt_piso_coeficientes (tabela, tipo_carga, eixos, ccd, cc) VALUES ($1,$2,$3,$4,$5)', [l.tabela, l.tipo_carga, l.eixos, l.ccd, l.cc]);
    }
    await db.query('UPDATE empresa SET antt_piso_config = $1 WHERE id = 1', [cfg]);
    await db.query('INSERT INTO antt_piso_historico (usuario_nome, resolucao, vigencia, fator_retorno, coeficientes) VALUES ($1,$2,$3,$4,$5)',
      [usuarioNome || null, cfg.resolucao, vig, cfg.fator_retorno, JSON.stringify(ok)]);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { db.release(); }
  return { gravados: ok.length, config: cfg };
}

async function historico() {
  const { rows } = await pool.query(`SELECT id, criado_em, usuario_nome, resolucao, to_char(vigencia, 'YYYY-MM-DD') AS vigencia, fator_retorno,
    jsonb_array_length(coeficientes) AS total FROM antt_piso_historico ORDER BY id DESC LIMIT 50`);
  return rows;
}

// ---------- Planilha (modelo e importação) ----------
const COLUNAS = ['Tabela', 'Tipo de carga', 'Eixos', 'CCD (R$/km)', 'CC (R$)'];
async function modelo() {
  const atuais = Object.fromEntries((await coeficientes()).map((c) => [`${c.tabela}|${c.tipo_carga}|${c.eixos}`, c]));
  const linhas = [COLUNAS];
  for (const t of Object.keys(TABELAS)) {
    for (const [tipo, nome] of Object.entries(TIPOS)) {
      for (const e of EIXOS) { const c = atuais[`${t}|${tipo}|${e}`]; linhas.push([t, nome, e, c ? c.ccd : null, c ? c.cc : null]); }
    }
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = [{ wch: 8 }, { wch: 38 }, { wch: 7 }, { wch: 13 }, { wch: 11 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Coeficientes');
  const ajuda = XLSX.utils.aoa_to_sheet([
    ['Piso mínimo de frete da ANTT — coeficientes'],
    ['Copie os valores da resolução da ANTT em vigor (ou da calculadora oficial da ANTT). Deixe em branco o que não usa.'],
    ['Tabela: A = lotação; B = só o veículo automotor; C = lotação de alto desempenho; D = só o veículo, alto desempenho.'],
    ['CCD = custo de deslocamento (R$ por km). CC = carga e descarga (R$ por viagem). Use vírgula ou ponto nos decimais.'],
    ['Piso = km × CCD + CC. Depois de importar, informe na tela o número da resolução e a vigência e grave.'],
  ]);
  ajuda['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, ajuda, 'Como preencher');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Lê .xlsx/.csv (ou o texto colado do Excel) e devolve as linhas para conferir na tela, sem gravar.
function lerPlanilha({ buffer, texto }) {
  let matriz;
  if (buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  } else {
    matriz = String(texto || '').split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(l.includes('\t') ? '\t' : ';'));
  }
  const cab = (matriz[0] || []).map((c) => norm(c));
  const tem = cab.some((c) => /tabela|tipo|eixo|ccd/.test(c));
  const idx = (re, padrao) => { const i = cab.findIndex((c) => re.test(c)); return tem && i >= 0 ? i : padrao; };
  const iT = idx(/^tabela/, 0); const iTipo = idx(/tipo|carga/, 1); const iE = idx(/eixo/, 2); const iCcd = idx(/ccd|desloc/, 3); const iCc = idx(/^cc\b|carga e descarga|descarga/, 4);
  const linhas = matriz.slice(tem ? 1 : 0).map((l, k) => ({ linha: k + (tem ? 2 : 1), tabela: l[iT], tipo_carga: l[iTipo], eixos: l[iE], ccd: l[iCcd], cc: l[iCc] }));
  const { ok, erros } = validarLinhas(linhas);
  return { linhas: ok, erros };
}

// ---------- Cálculo ----------
// p: { tabela, tipo_carga, eixos, km, retorno_vazio, km_retorno }
async function calcular(p = {}) {
  const tabela = lerTabela(p.tabela); const tipo = lerTipo(p.tipo_carga); const eixos = parseInt(p.eixos, 10);
  const km = numero(p.km);
  if (!tabela || !tipo || !EIXOS.includes(eixos)) return { erro: 'Escolha a tabela, o tipo de carga e o número de eixos.' };
  if (!(km > 0)) return { erro: 'Informe a distância em km.' };
  const cfg = await config();
  const { rows: [c] } = await pool.query('SELECT ccd, cc FROM antt_piso_coeficientes WHERE tabela = $1 AND tipo_carga = $2 AND eixos = $3', [tabela, tipo, eixos]);
  if (!c) {
    return { erro: `Sem coeficiente da ANTT cadastrado para a tabela ${tabela}, ${TIPOS[tipo].toLowerCase()}, ${eixos} eixos. Cadastre em Tabelas de preço » Piso ANTT.`, sem_coeficiente: true };
  }
  const ccd = Number(c.ccd); const cc = Number(c.cc);
  const ida = centavos(km * ccd + cc);
  const kmRet = p.retorno_vazio ? (numero(p.km_retorno) || km) : 0;
  const retorno = kmRet ? centavos(Number(cfg.fator_retorno) * kmRet * ccd) : 0;
  return {
    tabela, tipo_carga: tipo, eixos, km, ccd, cc, ida, km_retorno: kmRet || null, fator_retorno: Number(cfg.fator_retorno), retorno,
    piso: centavos(ida + retorno), resolucao: cfg.resolucao, vigencia: cfg.vigencia,
    explicacao: `${km.toLocaleString('pt-BR')} km × R$ ${ccd.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} + R$ ${cc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      + (retorno ? ` + retorno vazio ${Number(cfg.fator_retorno).toLocaleString('pt-BR')} × ${kmRet.toLocaleString('pt-BR')} km × R$ ${ccd.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}` : ''),
  };
}

// Distância pela rota (serviço de mapas da roteirização; sem internet, estimativa).
async function distancia({ origem_cidade, origem_uf, destino_cidade, destino_uf }) {
  const { municipio } = require('./roteirizacao/municipios');
  const mapa = require('./roteirizacao/servicosMapa');
  const o = municipio({ cidade: origem_cidade, uf: origem_uf }); const d = municipio({ cidade: destino_cidade, uf: destino_uf });
  if (!o) throw falha('Cidade de origem não encontrada.');
  if (!d) throw falha('Cidade de destino não encontrada.');
  const r = await mapa.matriz([o, d], await mapa.configuracao());
  return { km: r.dist[0][1], fonte: r.fonte, origem: `${o.nome}/${o.uf}`, destino: `${d.nome}/${d.uf}` };
}

// Piso do acerto com terceiro: grava junto os coeficientes usados (o que valia no dia).
async function doAcerto(a) {
  const vazio = { piso_valor: null, piso_ccd: null, piso_cc: null, piso_resolucao: null };
  if (a.tipo !== 'terceiro' || !a.piso_tabela || !a.piso_tipo_carga || !a.piso_eixos || !(Number(a.piso_km) > 0)) return { ...vazio, piso: null };
  const r = await calcular({ tabela: a.piso_tabela, tipo_carga: a.piso_tipo_carga, eixos: a.piso_eixos, km: a.piso_km, retorno_vazio: a.piso_retorno_vazio, km_retorno: a.piso_km_retorno });
  if (r.erro) return { ...vazio, piso: r };
  return { piso_valor: r.piso, piso_ccd: r.ccd, piso_cc: r.cc, piso_resolucao: r.resolucao, piso: r };
}
// Situação do frete contratado frente ao piso gravado.
function conferirFrete(a) {
  if (a.tipo !== 'terceiro') return null;
  if (a.piso_valor == null) return { situacao: 'nao_conferido' };
  const frete = Number(a.valor_frete) || 0; const piso = Number(a.piso_valor);
  return { situacao: frete + 0.004 < piso ? 'abaixo' : 'ok', piso, frete, diferenca: centavos(frete - piso) };
}

module.exports = { TABELAS, TIPOS, EIXOS, lerTipo, lerTabela, validarLinhas, config, coeficientes, situacao, salvar, historico, modelo, lerPlanilha, calcular, distancia, doAcerto, conferirFrete };
