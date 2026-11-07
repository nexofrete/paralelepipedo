// Auditoria de frete em detalhe (embarcador): além do total do CT-e × tabela,
//  - cada componente lado a lado (frete peso, ad valorem, GRIS, pedágio, TDE, TDA, TRT,
//    despacho, descarga), com a diferença e o que foi cobrado a mais;
//  - taxa cobrada que a tabela não prevê ("não autorizada");
//  - peso e volumes do CT-e × os das notas;
//  - ICMS completo: base, alíquota (pela rota), valor, CST e CFOP (dentro/fora do estado);
//  - o histórico de cada frete (importação, cálculo, liberação, aprovação, glosa, fatura, pagamento);
//  - o relatório de cobranças indevidas (por componente, transportadora e mês).
const pool = require('./db');
const { extrairComposicaoCTe } = require('./utils/xmlParser');
const icmsCte = require('./icmsCte');

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const plano = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\./g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const COMPONENTES = {
  frete_peso: 'Frete peso', ad_valorem: 'Ad valorem / frete valor', gris: 'GRIS', pedagio: 'Pedágio', tde: 'TDE', tda: 'TDA', trt: 'TRT',
  despacho: 'Despacho / taxa de emissão', descarga: 'Descarga', outros: 'Outras taxas',
};
// O nome que cada transportadora dá ao componente no CT-e (texto livre) → a parcela da tabela.
const REGRAS = [
  ['pedagio', /PEDAG/], ['gris', /\bGRIS\b|GERENC.*RISCO/], ['tde', /\bTDE\b|DIFICULDADE DE ENTREGA/], ['tda', /\bTDA\b|DIFICIL ACESSO|DIFICULDADE DE ACESSO/],
  ['trt', /\bTRT\b|RESTRICAO DE TRANSITO/], ['descarga', /DESCARGA|CHAPA|AJUDANTE|PALETIZ/],
  ['despacho', /DESPACHO|SEC CAT|\bSEC\b|\bCAT\b|TAXA DE COLETA|COLETA|EMISSAO|\bTAS\b|TAXA ADM|DOCUMENT/],
  ['ad_valorem', /AD VAL|ADVAL|AD VALOREM|FRETE VALOR|SEGURO|\bFV\b/], ['icms', /ICMS|IMPOSTO/],
  ['frete_peso', /FRETE|PESO|TARIFA|PRESTA|SERVICO|TRANSPORTE|^VALOR$|^TOTAL/],
];
function classificar(nome) {
  const n = plano(nome);
  const r = REGRAS.find(([, re]) => re.test(n));
  return r ? r[0] : 'outros';
}

let cacheCfg = { em: 0, v: null };
async function tolerancia() {
  if (Date.now() - cacheCfg.em < 60000 && cacheCfg.v) return cacheCfg.v;
  const { rows: [c] } = await pool.query('SELECT tolerancia_valor, tolerancia_percentual FROM configuracao_auditoria WHERE id = 1');
  cacheCfg = { em: Date.now(), v: { valor: Math.max(Number(c?.tolerancia_valor) || 0, 0.5), pct: Number(c?.tolerancia_percentual) || 0 } };
  return cacheCfg.v;
}
const foraTol = (dif, base, t) => Math.abs(dif) > Math.max(t.valor, (Math.abs(base) * t.pct) / 100);

// Confere um frete. r: linha de fretes com xml_cte_original, auditoria_calculo, peso_kg, qtd_volumes e os campos de icmsCte.camposSql;
// soma: { peso, volumes } das notas cobertas pelo mesmo CT-e (opcional).
function conferirFrete(r, t, soma = {}) {
  if (!r.xml_cte_original) return null;
  let c;
  try { c = extrairComposicaoCTe(r.xml_cte_original); } catch { return null; }
  let calc = r.auditoria_calculo;
  if (typeof calc === 'string') { try { calc = JSON.parse(calc); } catch { calc = null; } }
  const tab = calc?.componentes || null;
  const apontamentos = [];

  // ---------- Componentes ----------
  const cobrado = {}; const nomesCte = {};
  for (const comp of c.componentes) {
    const k = classificar(comp.nome);
    if (k === 'icms') continue;   // ICMS destacado como componente: conferido no bloco do imposto
    cobrado[k] = r2((cobrado[k] || 0) + (Number(comp.valor) || 0));
    (nomesCte[k] = nomesCte[k] || []).push(comp.nome);
  }
  // CT-e sem componentes detalhados: só dá para conferir o total (o relatório de auditoria já faz).
  const semDetalhe = !c.componentes.length;
  const tabela = tab ? {
    frete_peso: r2(calc.valor_resultado), ad_valorem: r2(tab.adValorem), gris: r2(tab.gris), pedagio: r2(tab.pedagio), tde: r2(tab.tde), tda: r2(tab.tda),
    trt: r2(tab.trt), despacho: r2(tab.despacho), descarga: r2(tab.descarga), outros: 0,
  } : null;
  const componentes = semDetalhe ? [] : Object.keys(COMPONENTES).filter((k) => (cobrado[k] || 0) || (tabela?.[k] || 0)).map((k) => {
    const cob = r2(cobrado[k] || 0); const tb = tabela ? r2(tabela[k] || 0) : null;
    const dif = tb == null ? null : r2(cob - tb);
    let situacao = 'ok';
    if (tb == null) situacao = 'sem_tabela';
    else if (cob > 0 && tb === 0 && foraTol(cob, 0, t)) situacao = 'nao_autorizada';
    else if (dif != null && foraTol(dif, tb, t)) situacao = dif > 0 ? 'a_mais' : 'a_menos';
    return { chave: k, nome: COMPONENTES[k], cobrado: cob, tabela: tb, diferenca: dif, situacao, nomes_cte: nomesCte[k] || [] };
  });
  // Componente "a mais" que só existe porque a transportadora juntou duas parcelas num nome só
  // (ex.: "FRETE" com o ad valorem dentro) aparece com a "a menos" do outro: o total é que vale.
  for (const x of componentes) {
    if (x.situacao === 'nao_autorizada') apontamentos.push({ codigo: 'TAXA_NAO_PREVISTA', texto: `${x.nome} cobrado (R$ ${x.cobrado.toFixed(2)}${x.nomes_cte.length ? ` — "${x.nomes_cte.join('", "')}"` : ''}) e a tabela não prevê` });
    if (x.situacao === 'a_mais') apontamentos.push({ codigo: 'COMPONENTE_A_MAIS', texto: `${x.nome}: cobrado R$ ${x.cobrado.toFixed(2)}, tabela R$ ${x.tabela.toFixed(2)} (+R$ ${x.diferenca.toFixed(2)})` });
  }
  // Cobrado a mais = o que as parcelas passam da tabela, mas nunca mais que o total do CT-e passa do total da tabela
  // (transportadora que só distribuiu diferente entre as parcelas, com o total certo, não cobrou a mais).
  const aMaisParcelas = r2(componentes.filter((x) => ['a_mais', 'nao_autorizada'].includes(x.situacao)).reduce((s, x) => s + (x.tabela == null ? 0 : x.diferenca), 0));
  const totalTabela = calc?.valor_total_calculado != null ? Number(calc.valor_total_calculado) : null;
  const excessoTotal = totalTabela != null && c.vTPrest != null ? r2(c.vTPrest - totalTabela) : null;
  const totalConfere = excessoTotal != null && !foraTol(excessoTotal, totalTabela, t);
  const aMais = excessoTotal == null ? aMaisParcelas : totalConfere ? 0 : r2(Math.max(0, Math.min(aMaisParcelas, excessoTotal)));
  if (aMaisParcelas > 0 && totalConfere) {
    apontamentos.forEach((p) => { if (['COMPONENTE_A_MAIS', 'TAXA_NAO_PREVISTA'].includes(p.codigo)) p.texto += ' — o total do CT-e confere com a tabela (parcelas trocadas)'; });
  }

  // ---------- Peso e volumes ----------
  const q = c.quantidades || [];
  const pesoCte = (q.find((x) => x.unidade === '01' || /PESO/i.test(x.tipo)) || {}).qtd ?? null;
  const ton = q.find((x) => x.unidade === '02');
  const pesoCteKg = pesoCte != null ? pesoCte : ton ? ton.qtd * 1000 : null;
  const volCte = (q.find((x) => x.unidade === '03' || /VOLUME|UNIDADE|CAIXA|QTD|QUANT/i.test(x.tipo)) || {}).qtd ?? null;
  const pesoNota = r.peso_kg != null || soma.peso ? r2(Number(r.peso_kg || 0) + Number(soma.peso || 0)) : null;
  const volNota = r.qtd_volumes != null || soma.volumes ? Number(r.qtd_volumes || 0) + Number(soma.volumes || 0) : null;
  const peso = { cte: pesoCteKg, nota: pesoNota, ok: true };
  if (pesoCteKg > 0 && pesoNota > 0 && Math.abs(pesoCteKg - pesoNota) > Math.max(1, pesoNota * 0.05)) {
    peso.ok = false;
    apontamentos.push({ codigo: 'PESO', texto: `Peso no CT-e ${pesoCteKg.toLocaleString('pt-BR')} kg × nota ${pesoNota.toLocaleString('pt-BR')} kg${pesoCteKg > pesoNota ? ' (frete calculado com peso maior?)' : ''}` });
  }
  const volumes = { cte: volCte, nota: volNota, ok: true };
  if (volCte > 0 && volNota > 0 && Math.round(volCte) !== Math.round(volNota)) {
    volumes.ok = false;
    apontamentos.push({ codigo: 'VOLUMES', texto: `Volumes no CT-e ${volCte} × nota ${volNota}` });
  }

  // ---------- ICMS ----------
  const i = c.icms || {};
  const cst = i.cst != null ? String(i.cst).padStart(2, '0') : null;
  const icms = { cst, base: i.vBC, aliquota: i.pICMS, valor: i.vICMS, reducao: i.pRedBC, cfop: c.cfop, uf_ini: c.ufIni, uf_fim: c.ufFim, checagens: [] };
  if (['00', '20'].includes(cst) && c.vTPrest != null) {
    const baseEsperada = r2(c.vTPrest * (1 - (Number(i.pRedBC) || 0) / 100));
    if (i.vBC != null && Math.abs(i.vBC - baseEsperada) > 0.05) {
      icms.checagens.push('base');
      apontamentos.push({ codigo: 'ICMS_BASE', texto: `Base do ICMS R$ ${Number(i.vBC).toFixed(2)} × esperada R$ ${baseEsperada.toFixed(2)} (valor da prestação${i.pRedBC ? ` com redução de ${i.pRedBC}%` : ''})` });
    }
    if (i.vBC != null && i.pICMS != null && i.vICMS != null) {
      const valorEsperado = r2((i.vBC * i.pICMS) / 100);
      icms.valor_esperado = valorEsperado;
      if (Math.abs(i.vICMS - valorEsperado) > 0.05) {
        icms.checagens.push('valor');
        apontamentos.push({ codigo: 'ICMS_VALOR', texto: `Valor do ICMS R$ ${Number(i.vICMS).toFixed(2)} × base × alíquota = R$ ${valorEsperado.toFixed(2)}` });
      }
    }
    const rota = icmsCte.conferirIcms({ ...r, impostos_cte: JSON.stringify({ cst, pICMS: i.pICMS }) });
    if (rota) { icms.aliquota_esperada = rota.esperada; icms.rota = `${rota.ini}→${rota.fim}`; }
    if (rota?.divergente) {
      icms.checagens.push('aliquota');
      apontamentos.push({ codigo: 'ICMS_ALIQUOTA', texto: `Alíquota ${rota.cobrada}% — esperada ${rota.esperada}% (${rota.ini}→${rota.fim}${rota.motivo ? ', trecho até o redespacho' : ''})` });
    }
  }
  if (c.cfop && c.ufIni && c.ufFim) {
    const esperado = c.ufIni === c.ufFim ? '5' : '6';
    if (!['5', '6', '7'].includes(c.cfop[0]) || (c.cfop[0] !== '7' && c.cfop[0] !== esperado)) {
      icms.checagens.push('cfop');
      apontamentos.push({ codigo: 'CFOP', texto: `CFOP ${c.cfop} para transporte ${c.ufIni === c.ufFim ? 'dentro do estado (esperado 5xxx)' : 'entre estados (esperado 6xxx)'} ${c.ufIni}→${c.ufFim}` });
    }
  }
  return { componentes, sem_detalhe: semDetalhe, a_mais: aMais, a_mais_parcelas: aMaisParcelas, total_confere: totalConfere, vTPrest: c.vTPrest, total_tabela: calc?.valor_total_calculado ?? null, peso, volumes, icms, apontamentos, tem_tabela: !!tab };
}

const CAMPOS = `f.id, f.numero_cte, f.numero_nf, f.cliente, f.data_emissao_cte, f.transportadora_cte, f.xml_cte_original, f.auditoria_calculo, f.peso_kg, f.qtd_volumes,
  f.valor_total_cte, f.valor_total_frete, f.status, f.frete_principal_id, f.vinculo_cte, f.tipo_cte, ${icmsCte.camposSql('f')}`;
async function somasCobertas(ids) {
  if (!ids.length) return new Map();
  const { rows } = await pool.query('SELECT cte_coberto_por AS id, SUM(peso_kg)::float AS peso, SUM(qtd_volumes)::int AS volumes FROM fretes WHERE cte_coberto_por = ANY($1::int[]) GROUP BY 1', [ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

async function doFrete(id) {
  const { rows: [r] } = await pool.query(`SELECT ${CAMPOS} FROM fretes f WHERE f.id = $1`, [id]);
  if (!r) return null;
  const somas = await somasCobertas([r.id]);
  return conferirFrete(r, await tolerancia(), somas.get(r.id));
}

// ---------- Histórico do frete ----------
async function historico(id) {
  const { rows: [f] } = await pool.query(
    `SELECT id, criado_em, chave_cte, numero_cte, data_emissao_cte, aprovado_por_nome, aprovado_em, status_aprovacao, motivo_rejeicao, justificativa_aprovacao,
            glosa_valor, glosa_motivo, glosa_registrada_por, glosa_registrada_em, cte_cancelado, cte_cancelado_em, cte_cancelado_motivo, fatura_id, auditoria_calculo
       FROM fretes WHERE id = $1`, [id]);
  if (!f) return null;
  const ev = [];
  ev.push({ quando: f.criado_em, tipo: 'importacao', texto: 'Registro criado (importação)', quem: null });
  let calc = f.auditoria_calculo;
  if (typeof calc === 'string') { try { calc = JSON.parse(calc); } catch { calc = null; } }
  if (calc?.calculado_em) ev.push({ quando: calc.calculado_em, tipo: 'calculo', texto: `Calculado pela tabela ${calc.tabela_nome || ''}: R$ ${Number(calc.valor_total_calculado || 0).toFixed(2)} (${calc.origem_recalculo || 'cálculo'})`, quem: 'Sistema' });
  if (f.aprovado_em && f.aprovado_por_nome) {
    ev.push({ quando: f.aprovado_em, tipo: f.status_aprovacao === 'Rejeitado' ? 'reprovacao' : 'aprovacao',
      texto: f.status_aprovacao === 'Rejeitado' ? `Reprovado${f.motivo_rejeicao ? `: ${f.motivo_rejeicao}` : ''}` : f.aprovado_por_nome.startsWith('Sistema') ? 'Liberado pela conferência automática (dentro da tolerância)' : `Aprovado${f.justificativa_aprovacao ? `: ${f.justificativa_aprovacao}` : ''}`,
      quem: f.aprovado_por_nome });
  }
  if (f.glosa_registrada_em) ev.push({ quando: f.glosa_registrada_em, tipo: 'glosa', texto: `Glosa de R$ ${Number(f.glosa_valor || 0).toFixed(2)}${f.glosa_motivo ? `: ${f.glosa_motivo}` : ''}`, quem: f.glosa_registrada_por });
  if (f.cte_cancelado && f.cte_cancelado_em) ev.push({ quando: f.cte_cancelado_em, tipo: 'cancelamento', texto: `CT-e cancelado${f.cte_cancelado_motivo ? `: ${f.cte_cancelado_motivo}` : ''}`, quem: null });
  // O que ficou no registro de atividades ligado a este frete.
  const { rows: log } = await pool.query('SELECT criado_em, acao, detalhes, usuario_nome FROM auditoria WHERE registro_id = $1 ORDER BY criado_em LIMIT 500', [id]);
  log.forEach((l) => ev.push({ quando: l.criado_em, tipo: 'registro', texto: l.detalhes || l.acao, quem: l.usuario_nome }));
  // A fatura do CT-e: conferência, aprovação, liberação e pagamento.
  if (f.fatura_id) {
    const { rows: [ff] } = await pool.query('SELECT numero, conferido_em, conferido_por_nome FROM faturas_frete WHERE id = $1', [f.fatura_id]);
    if (ff) ev.push({ quando: ff.conferido_em, tipo: 'fatura', texto: `Entrou na fatura ${ff.numero} (conferida)`, quem: ff.conferido_por_nome });
    const { rows: fh } = await pool.query('SELECT criado_em, acao, detalhe, usuario_nome FROM faturas_frete_historico WHERE fatura_id = $1 AND acao <> $2 ORDER BY id', [f.fatura_id, 'conferida']);
    fh.forEach((h) => ev.push({ quando: h.criado_em, tipo: 'fatura', texto: `Fatura ${ff?.numero || ''}: ${h.acao}${h.detalhe ? ` — ${h.detalhe}` : ''}`, quem: h.usuario_nome }));
  }
  return ev.filter((e) => e.quando).sort((a, b) => new Date(a.quando) - new Date(b.quando));
}

// ---------- Relatório de cobranças indevidas ----------
async function cobrancasIndevidas(req, q = {}) {
  const { consultaCliente } = require('./permissoes');
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(q.ate || '') ? q.ate : new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const ini = /^\d{4}-\d{2}-\d{2}$/.test(q.de || '') ? q.de : `${fim.slice(0, 7)}-01`;
  const params = [ini, fim];
  let extra = '';
  if (String(q.transportadora || '').trim()) { params.push(`%${String(q.transportadora).trim()}%`); extra = ` AND f.transportadora_cte ILIKE $${params.length}`; }
  const { rows } = await consultaCliente(req,
    `SELECT ${CAMPOS} FROM fretes f
      WHERE f.chave_cte IS NOT NULL AND f.xml_cte_original IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND COALESCE(f.status, '') NOT IN ('Não cobrado', 'Cancelado')
        AND COALESCE(f.vinculo_cte, '') <> 'complementar' AND f.data_emissao_cte BETWEEN $1::date AND $2::date${extra}
      ORDER BY f.data_emissao_cte DESC LIMIT 5000`, params);
  const t = await tolerancia();
  const somas = await somasCobertas(rows.map((r) => r.id));
  const itens = []; const porComp = {}; const porTransp = new Map(); const porMes = new Map(); const porTipo = {};
  for (const r of rows) {
    const a = conferirFrete(r, t, somas.get(r.id));
    if (!a || !a.apontamentos.length) continue;
    // Parcelas trocadas com o total certo não entram no "cobrado a mais" por componente.
    const indevidos = a.a_mais > 0 ? a.componentes.filter((x) => ['a_mais', 'nao_autorizada'].includes(x.situacao) && x.tabela != null) : [];
    for (const x of indevidos) { const p = porComp[x.chave] || (porComp[x.chave] = { chave: x.chave, nome: x.nome, qtd: 0, valor: 0 }); p.qtd += 1; p.valor = r2(p.valor + x.diferenca); }
    a.apontamentos.forEach((p) => { porTipo[p.codigo] = (porTipo[p.codigo] || 0) + 1; });
    const tr = r.transportadora_cte || '—';
    const pt = porTransp.get(tr) || { chave: tr, ctes: 0, valor: 0, apontamentos: 0 };
    pt.ctes += 1; pt.valor = r2(pt.valor + a.a_mais); pt.apontamentos += a.apontamentos.length; porTransp.set(tr, pt);
    const mes = String(r.data_emissao_cte instanceof Date ? r.data_emissao_cte.toISOString() : r.data_emissao_cte).slice(0, 7);
    const pm = porMes.get(mes) || { chave: mes, ctes: 0, valor: 0 }; pm.ctes += 1; pm.valor = r2(pm.valor + a.a_mais); porMes.set(mes, pm);
    itens.push({ id: r.id, numero_cte: r.numero_cte, numero_nf: r.numero_nf, cliente: r.cliente, transportadora: tr, data: r.data_emissao_cte, valor_cte: Number(r.valor_total_cte) || 0,
      valor_tabela: a.total_tabela, a_mais: a.a_mais, status: r.status, apontamentos: a.apontamentos, componentes: indevidos });
  }
  itens.sort((x, y) => y.a_mais - x.a_mais);
  return {
    de: ini, ate: fim, analisados: rows.length, com_apontamento: itens.length, total_a_mais: r2(itens.reduce((s, x) => s + x.a_mais, 0)),
    por_componente: Object.values(porComp).sort((a, b) => b.valor - a.valor), por_tipo: porTipo,
    por_transportadora: [...porTransp.values()].sort((a, b) => b.valor - a.valor), por_mes: [...porMes.values()].sort((a, b) => a.chave.localeCompare(b.chave)), itens,
  };
}

module.exports = { COMPONENTES, classificar, conferirFrete, doFrete, historico, cobrancasIndevidas, tolerancia, CAMPOS, somasCobertas };
