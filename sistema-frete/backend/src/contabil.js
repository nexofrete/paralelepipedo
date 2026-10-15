// Fiscal e contabilidade: o que o contador precisa todo mês.
//  • Pacote do contador: XML de todos os CT-e (autorizados, cancelados e os
//    eventos), MDF-e e NFS-e do mês num .zip — o sistema do contador importa
//    os XML e gera o SPED/EFD junto com as notas de entrada da empresa.
//  • Livro de saídas e apuração: CT-e por CFOP, CST e alíquota, ICMS a
//    recolher (débitos), NFS-e e ISS do mês.
//  • Lançamentos contábeis (débito, crédito, valor, histórico) pelo plano de
//    contas do contador, em planilha que os sistemas contábeis importam.
//  • Envio automático do pacote por e-mail, todo mês.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');

const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const diaBr = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const dataLocal = (v) => (v ? (v instanceof Date ? new Date(v.getTime() - 3 * 3600000).toISOString() : String(v)).slice(0, 10) : null);
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Período padrão: o mês anterior (é o que o contador fecha).
function mesAnterior(hoje = new Date(Date.now() - 3 * 3600000)) {
  const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0));
  return { de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
}
function periodo({ de, ate } = {}) {
  const p = iso(de) && iso(ate) ? { de, ate } : mesAnterior();
  if (p.de > p.ate) throw falha('A data inicial é depois da final.');
  if ((Date.parse(p.ate) - Date.parse(p.de)) / 86400000 > 366) throw falha('Período máximo: 1 ano.');
  return p;
}

// ---------- Configuração ----------
// Plano de contas: a conta de cada lançamento (o contador informa os códigos dele).
const CONTAS_PADRAO = {
  clientes: '1.1.2.01', caixa: '1.1.1.01', banco: '1.1.1.02', iss_retido: '1.1.3.05', fornecedores: '2.1.1.01', icms_recolher: '2.1.3.01', iss_recolher: '2.1.3.02',
  receita_frete: '3.1.1.01', receita_frete_municipal: '3.1.1.02', icms_sobre_frete: '3.1.2.01', iss_sobre_servico: '3.1.2.02',
  despesa_combustivel: '4.1.1.01', despesa_pedagio: '4.1.1.02', despesa_manutencao: '4.1.1.03', despesa_pneus: '4.1.1.04', despesa_frete_terceiro: '4.1.1.05',
  despesa_adiantamento: '1.1.3.10', despesa_salarios: '4.2.1.01', despesa_impostos: '4.2.2.01', despesa_seguro: '4.2.3.01', despesa_aluguel: '4.2.4.01',
  despesa_administrativo: '4.2.5.01', despesa_outros: '4.2.9.01',
  despesa_tarifas: '4.3.1.01', despesa_juros: '4.3.1.02', receita_financeira: '3.2.1.01', receita_outras: '3.2.9.01', socios: '2.4.1.01',
};
const NOMES_CONTAS = {
  clientes: 'Clientes (duplicatas a receber)', caixa: 'Caixa', banco: 'Banco (conta movimento)', iss_retido: 'ISS retido pelo tomador (a compensar)',
  fornecedores: 'Fornecedores', icms_recolher: 'ICMS a recolher', iss_recolher: 'ISS a recolher', receita_frete: 'Receita de fretes (CT-e)',
  receita_frete_municipal: 'Receita de fretes municipais (NFS-e)', icms_sobre_frete: 'ICMS sobre fretes (dedução da receita)', iss_sobre_servico: 'ISS sobre serviços (dedução da receita)',
  despesa_combustivel: 'Combustível', despesa_pedagio: 'Pedágio', despesa_manutencao: 'Manutenção de veículos', despesa_pneus: 'Pneus', despesa_frete_terceiro: 'Fretes de terceiros (agregados)',
  despesa_adiantamento: 'Adiantamentos de viagem', despesa_salarios: 'Salários e encargos', despesa_impostos: 'Impostos e taxas', despesa_seguro: 'Seguros',
  despesa_aluguel: 'Aluguel', despesa_administrativo: 'Despesas administrativas', despesa_outros: 'Outras despesas',
  despesa_tarifas: 'Tarifas bancárias', despesa_juros: 'Juros e multas pagos', receita_financeira: 'Receitas financeiras (rendimentos)', receita_outras: 'Outras receitas',
  socios: 'Sócios (aportes e retiradas)',
};
const CONFIG_PADRAO = { contador_nome: '', contador_email: '', contador_crc: '', regime: 'competencia', separador: ';', envio_ativo: false, envio_dia: 5, contas: CONTAS_PADRAO, ultimo_envio: null };

async function config() {
  const { rows } = await pool.query('SELECT contabil_config FROM empresa WHERE id = 1');
  const c = rows[0]?.contabil_config || {};
  return { ...CONFIG_PADRAO, ...c, contas: { ...CONTAS_PADRAO, ...(c.contas || {}) } };
}
async function salvarConfig(b = {}) {
  const atual = await config();
  const email = String(b.contador_email || '').trim();
  if (email && !email.split(/[;,]/).every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))) throw falha('E-mail do contador inválido.');
  const contas = {};
  Object.keys(CONTAS_PADRAO).forEach((k) => { contas[k] = String(b.contas?.[k] ?? atual.contas[k] ?? '').trim().slice(0, 40); });
  const c = {
    ...atual, contador_nome: String(b.contador_nome || '').trim().slice(0, 120), contador_email: email.slice(0, 250), contador_crc: String(b.contador_crc || '').trim().slice(0, 30),
    regime: b.regime === 'caixa' ? 'caixa' : 'competencia', separador: b.separador === ',' ? ',' : b.separador === 'tab' ? 'tab' : ';',
    envio_ativo: !!b.envio_ativo, envio_dia: Math.min(Math.max(parseInt(b.envio_dia, 10) || 5, 1), 28), contas,
  };
  if (c.envio_ativo && !c.contador_email) throw falha('Informe o e-mail do contador para ligar o envio automático.');
  await pool.query('UPDATE empresa SET contabil_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return c;
}

// ---------- Livro de saídas e apuração ----------
async function livroSaidas(p) {
  const { de, ate } = periodo(p);
  const { rows } = await pool.query(
    `SELECT id, serie, numero, chave, status, autorizado_em, valor_total, dados, demonstracao, cidade_fim, uf_fim, tomador_nome, eventos
       FROM ctes_emitidos WHERE status IN ('autorizado', 'cancelado', 'substituido') AND chave IS NOT NULL
        AND (autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date ORDER BY serie, numero`, [de, ate]);
  const docs = rows.map((c) => {
    const d = c.dados || {};
    const i = d.icms || {};
    const valor = centavos(d.valores?.vTPrest ?? c.valor_total);
    // Cancelado e substituído ficam no livro, mas fora das somas (o substituto é que vale).
    const cancelado = c.status === 'cancelado' || c.status === 'substituido';
    const tributado = ['00', '20', '90', 'OUTRAUF'].includes(String(i.cst || ''));
    const bc = cancelado || !tributado ? 0 : centavos(i.vBC);
    const icms = cancelado || !tributado ? 0 : centavos(i.vICMS);
    const toma = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {};
    return {
      id: c.id, serie: c.serie, numero: c.numero, chave: c.chave, data: dataLocal(c.autorizado_em), situacao: c.status,
      tipo: { 0: 'normal', 1: 'complementar', 3: 'substituto' }[String(d.tpCTe ?? '0')] || 'normal', demonstracao: c.demonstracao,
      cfop: String(d.cfop || ''), cst: String(i.cst || (Number(d.crt) === 1 ? 'SN' : '')), aliquota: tributado ? Number(i.pICMS) || 0 : 0,
      uf_ini: d.inicio?.UF || null, uf_fim: d.fim?.UF || c.uf_fim || null, mun_ini: d.inicio?.xMun || null, mun_fim: d.fim?.xMun || c.cidade_fim || null,
      tomador_doc: String(toma.cnpj || toma.cpf || '').replace(/\D/g, ''), tomador_nome: toma.xNome || c.tomador_nome || '',
      valor: cancelado ? 0 : valor, valor_original: valor, base: bc, icms, isentas_outras: cancelado ? 0 : centavos(valor - bc),
      sem_base: !cancelado && tributado && Number(i.pICMS) > 0 && !(Number(i.vBC) > 0),
    };
  });
  const validos = docs.filter((d) => d.situacao === 'autorizado');
  const agrupar = (chave) => {
    const m = new Map();
    validos.forEach((d) => {
      const k = chave(d);
      const g = m.get(k) || { chave: k, qtd: 0, valor: 0, base: 0, icms: 0, isentas_outras: 0 };
      g.qtd += 1; g.valor = centavos(g.valor + d.valor); g.base = centavos(g.base + d.base); g.icms = centavos(g.icms + d.icms); g.isentas_outras = centavos(g.isentas_outras + d.isentas_outras);
      m.set(k, g);
    });
    return [...m.values()].sort((a, b) => String(a.chave).localeCompare(String(b.chave)));
  };
  const { rows: nf } = await pool.query(
    `SELECT id, numero_nfse, chave, status, autorizada_em, cancelada_em, valor, iss_aliquota, iss_valor, iss_retido, tomador_doc, tomador_nome, demonstracao
       FROM nfse_emitidas WHERE status IN ('autorizada', 'cancelada') AND (autorizada_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date
      ORDER BY numero_nfse`, [de, ate]);
  const nfse = nf.map((n) => ({ ...n, data: dataLocal(n.autorizada_em), cancelada: n.status === 'cancelada' }));
  const nfValidas = nfse.filter((n) => !n.cancelada);
  const soma = (l, k) => centavos(l.reduce((s, x) => s + Number(x[k] || 0), 0));
  return {
    periodo: { de, ate }, ctes: docs, nfse,
    por_cfop: agrupar((d) => d.cfop || '—'), por_cst: agrupar((d) => `${d.cst || '—'} · ${d.aliquota ? `${d.aliquota}%` : 'sem ICMS'}`), por_uf: agrupar((d) => `${d.uf_ini || '?'} → ${d.uf_fim || '?'}`),
    totais: {
      ctes: validos.length, cancelados: docs.filter((d) => d.situacao === 'cancelado').length, substituidos: docs.filter((d) => d.situacao === 'substituido').length, valor: soma(validos, 'valor'), base: soma(validos, 'base'), icms: soma(validos, 'icms'),
      isentas_outras: soma(validos, 'isentas_outras'), nfse: nfValidas.length, nfse_canceladas: nfse.length - nfValidas.length, nfse_valor: soma(nfValidas, 'valor'),
      iss: soma(nfValidas, 'iss_valor'), iss_retido: soma(nfValidas.filter((n) => n.iss_retido), 'iss_valor'), demonstracao: docs.some((d) => d.demonstracao) || nfse.some((n) => n.demonstracao),
    },
  };
}

// ---------- Lançamentos contábeis ----------
// Partidas dobradas: { data, debito, credito, valor, historico, documento, participante }.
async function lancamentos(p) {
  const { de, ate } = periodo(p);
  const cfg = await config(); const c = cfg.contas;
  const linhas = [];
  const lanc = (data, debito, credito, valor, historico, documento = '', participante = '') => {
    const v = centavos(valor);
    if (v > 0) linhas.push({ data, debito, credito, valor: v, historico: String(historico).slice(0, 200), documento, participante });
  };
  const livro = await livroSaidas({ de, ate });
  // Receita: CT-e autorizados (o substituído sai; o substituto entra).
  livro.ctes.filter((d) => d.situacao === 'autorizado').forEach((d) => {
    const doc = `CT-e ${d.serie}/${d.numero}`;
    lanc(d.data, c.clientes, c.receita_frete, d.valor, `Prestação de serviço de transporte ${doc}${d.tipo !== 'normal' ? ` (${d.tipo})` : ''} — ${d.tomador_nome}`, doc, d.tomador_doc);
    lanc(d.data, c.icms_sobre_frete, c.icms_recolher, d.icms, `ICMS s/ frete ${doc} (${d.aliquota}%)`, doc, d.tomador_doc);
  });
  livro.nfse.filter((n) => !n.cancelada).forEach((n) => {
    const doc = `NFS-e ${n.numero_nfse}`;
    lanc(n.data, c.clientes, c.receita_frete_municipal, n.valor, `Frete municipal ${doc} — ${n.tomador_nome}`, doc, n.tomador_doc);
    lanc(n.data, c.iss_sobre_servico, c.iss_recolher, n.iss_valor, `ISS s/ serviço ${doc}`, doc, n.tomador_doc);
    // ISS retido: o cliente paga menos e recolhe o ISS; sai do a receber e do a recolher.
    if (n.iss_retido) lanc(n.data, c.iss_recolher, c.clientes, n.iss_valor, `ISS retido pelo tomador ${doc}`, doc, n.tomador_doc);
  });
  // Recebimentos das faturas.
  const { rows: rec } = await pool.query(
    `SELECT p.data::text AS data, p.valor, p.forma, f.numero, f.tomador_doc, f.tomador_nome, b.tipo AS conta_tipo, b.conta_contabil FROM faturas_transporte_pagamentos p
      JOIN faturas_transporte f ON f.id = p.fatura_id LEFT JOIN contas_bancarias b ON b.id = p.conta_bancaria_id
      WHERE p.data BETWEEN $1::date AND $2::date ORDER BY p.data, p.id`, [de, ate]);
  // Conta do dinheiro: a conta contábil da conta bancária; sem ela, caixa ou banco.
  const disponivel = (x) => x.conta_contabil || (x.conta_tipo ? (x.conta_tipo === 'caixa' ? c.caixa : c.banco) : (x.forma === 'dinheiro' ? c.caixa : c.banco));
  rec.forEach((r) => lanc(dataLocal(r.data), disponivel(r), c.clientes, r.valor, `Recebimento da fatura ${r.numero} — ${r.tomador_nome} (${r.forma})`, `FAT ${r.numero}`, r.tomador_doc));
  // Contas a pagar: competência (despesa no lançamento, fornecedor no pagamento) ou caixa (despesa no pagamento).
  const contaDespesa = (cat) => c[`despesa_${cat}`] || c.despesa_outros;
  if (cfg.regime === 'competencia') {
    const { rows: cp } = await pool.query(
      `SELECT id, descricao, categoria, fornecedor_nome, fornecedor_doc, documento, valor, (criado_em AT TIME ZONE 'America/Sao_Paulo')::date::text AS data FROM contas_pagar
        WHERE status <> 'cancelada' AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date ORDER BY criado_em, id`, [de, ate]);
    cp.forEach((x) => lanc(dataLocal(x.data), contaDespesa(x.categoria), c.fornecedores, x.valor, `${x.descricao}${x.fornecedor_nome ? ` — ${x.fornecedor_nome}` : ''}`, x.documento || `CP ${x.id}`, x.fornecedor_doc || ''));
  }
  const { rows: pg } = await pool.query(
    `SELECT p.data::text AS data, p.valor, p.forma, c.id, c.descricao, c.categoria, c.fornecedor_nome, c.fornecedor_doc, c.documento, b.tipo AS conta_tipo, b.conta_contabil FROM contas_pagar_pagamentos p
       JOIN contas_pagar c ON c.id = p.conta_id LEFT JOIN contas_bancarias b ON b.id = p.conta_bancaria_id WHERE p.data BETWEEN $1::date AND $2::date ORDER BY p.data, p.id`, [de, ate]);
  pg.forEach((x) => lanc(dataLocal(x.data), cfg.regime === 'competencia' ? c.fornecedores : contaDespesa(x.categoria), disponivel(x), x.valor,
    `Pagamento: ${x.descricao}${x.fornecedor_nome ? ` — ${x.fornecedor_nome}` : ''}`, x.documento || `CP ${x.id}`, x.fornecedor_doc || ''));
  // Caixa e bancos: tarifa, rendimento, sócios, transferência (uma partida só, pela ponta que entra).
  const { rows: mv } = await pool.query(
    `SELECT m.id, m.data::text AS data, m.valor, m.categoria, m.descricao, m.transferencia_id, b.tipo AS conta_tipo, b.conta_contabil, b.nome AS conta_nome,
            o.tipo AS outra_tipo, o.conta_contabil AS outra_contabil, o.nome AS outra_nome
       FROM movimentos_bancarios m JOIN contas_bancarias b ON b.id = m.conta_id
       LEFT JOIN movimentos_bancarios t ON t.transferencia_id = m.transferencia_id AND t.id <> m.id LEFT JOIN contas_bancarias o ON o.id = t.conta_id
      WHERE m.data BETWEEN $1::date AND $2::date ORDER BY m.data, m.id`, [de, ate]);
  mv.forEach((m) => {
    const v = Number(m.valor); const aqui = disponivel(m);
    if (m.categoria === 'transferencia') {
      if (v > 0 && m.outra_tipo) lanc(dataLocal(m.data), aqui, disponivel({ conta_tipo: m.outra_tipo, conta_contabil: m.outra_contabil }), v, `Transferência de ${m.outra_nome} para ${m.conta_nome}`, `MOV ${m.id}`);
      return;
    }
    const contra = { tarifa: c.despesa_tarifas, juros_pagos: c.despesa_juros, rendimento: c.receita_financeira, aporte: c.socios, retirada: c.socios }[m.categoria] || (v > 0 ? c.receita_outras : c.despesa_outros);
    const hist = `${m.descricao || m.categoria} (${m.conta_nome})`;
    if (v > 0) lanc(dataLocal(m.data), aqui, contra, v, hist, `MOV ${m.id}`); else lanc(dataLocal(m.data), contra, aqui, -v, hist, `MOV ${m.id}`);
  });
  linhas.sort((a, b) => a.data.localeCompare(b.data));
  const totais = { linhas: linhas.length, valor: centavos(linhas.reduce((s, l) => s + l.valor, 0)) };
  // Resumo por conta (débitos, créditos, saldo do período): confere antes de mandar.
  const contas = new Map();
  linhas.forEach((l) => {
    [[l.debito, 'debito'], [l.credito, 'credito']].forEach(([conta, lado]) => {
      const g = contas.get(conta) || { conta, nome: Object.entries(c).find(([, v]) => v === conta)?.[0], debito: 0, credito: 0 };
      g[lado] = centavos(g[lado] + l.valor); contas.set(conta, g);
    });
  });
  return { periodo: { de, ate }, regime: cfg.regime, linhas, totais, por_conta: [...contas.values()].map((g) => ({ ...g, nome: NOMES_CONTAS[g.nome] || g.nome || '', saldo: centavos(g.debito - g.credito) })).sort((a, b) => a.conta.localeCompare(b.conta)) };
}

function csvLancamentos(r, separador = ';') {
  const sep = separador === 'tab' ? '\t' : separador;
  const campo = (v) => { const t = String(v ?? ''); return t.includes(sep) || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t; };
  const valor = (v) => (sep === ',' ? v.toFixed(2) : v.toFixed(2).replace('.', ','));
  const linhas = [['Data', 'Conta débito', 'Conta crédito', 'Valor', 'Histórico', 'Documento', 'CNPJ/CPF'].join(sep)];
  r.linhas.forEach((l) => linhas.push([diaBr(l.data), l.debito, l.credito, valor(l.valor), l.historico, l.documento, l.participante].map(campo).join(sep)));
  return `﻿${linhas.join('\r\n')}\r\n`;
}

function csvLivro(l) {
  const n = (v) => Number(v || 0).toFixed(2).replace('.', ',');
  const linhas = [['Data', 'Série', 'Número', 'Chave', 'Situação', 'Tipo', 'CFOP', 'CST', 'Alíquota', 'UF início', 'UF fim', 'Tomador', 'CNPJ/CPF', 'Valor', 'Base ICMS', 'ICMS', 'Isentas/outras'].join(';')];
  l.ctes.forEach((d) => linhas.push([diaBr(d.data), d.serie, d.numero, d.chave, d.situacao, d.tipo, d.cfop, d.cst, n(d.aliquota), d.uf_ini, d.uf_fim, `"${String(d.tomador_nome).replace(/"/g, '""')}"`,
    d.tomador_doc, n(d.valor), n(d.base), n(d.icms), n(d.isentas_outras)].join(';')));
  return `﻿${linhas.join('\r\n')}\r\n`;
}

// Livro em HTML para imprimir/PDF (vai também no pacote).
function livroHtml(l, e) {
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const m = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const t = l.totais;
  const grupo = (titulo, lista) => `<h3>${titulo}</h3><table><thead><tr><th></th><th class="n">Qtd</th><th class="n">Valor</th><th class="n">Base ICMS</th><th class="n">ICMS</th><th class="n">Isentas/outras</th></tr></thead><tbody>
    ${lista.map((g) => `<tr><td>${esc(g.chave)}</td><td class="n">${g.qtd}</td><td class="n">${m(g.valor)}</td><td class="n">${m(g.base)}</td><td class="n">${m(g.icms)}</td><td class="n">${m(g.isentas_outras)}</td></tr>`).join('')}</tbody></table>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Livro de saídas ${diaBr(l.periodo.de)} a ${diaBr(l.periodo.ate)}</title>
  <style>@page { size: A4 landscape; margin: 10mm; } body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 14px; } h1 { font-size: 16px; margin: 0; } h3 { font-size: 13px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #ccc; padding: 3px 5px; text-align: left; } th { background: #eef0f4; } .n { text-align: right; }
  .resumo { display: flex; gap: 18px; flex-wrap: wrap; margin: 10px 0; } .resumo div { border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; } .resumo b { display: block; font-size: 14px; }
  .acoes { margin-bottom: 10px; } @media print { .acoes { display: none; } }</style></head><body>
  <div class="acoes"><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
  <h1>Registro de saídas — prestações de serviço de transporte</h1>
  <div>${esc(e.razao_social || '')} · CNPJ ${esc(e.cnpj || '')} · IE ${esc(e.ie || '')} · período ${diaBr(l.periodo.de)} a ${diaBr(l.periodo.ate)}${t.demonstracao ? ' · <b>contém documentos de demonstração (sem valor fiscal)</b>' : ''}</div>
  <div class="resumo"><div>CT-e válidos<b>${t.ctes}</b>${[t.cancelados ? `${t.cancelados} cancelado(s)` : '', t.substituidos ? `${t.substituidos} substituído(s)` : ''].filter(Boolean).join(' · ')}</div><div>Valor das prestações<b>R$ ${m(t.valor)}</b></div><div>Base de cálculo<b>R$ ${m(t.base)}</b></div>
    <div>ICMS (débitos)<b>R$ ${m(t.icms)}</b></div><div>Isentas / outras<b>R$ ${m(t.isentas_outras)}</b></div>
    ${t.nfse ? `<div>NFS-e<b>${t.nfse}</b>R$ ${m(t.nfse_valor)}</div><div>ISS<b>R$ ${m(t.iss)}</b>${t.iss_retido ? `retido: R$ ${m(t.iss_retido)}` : ''}</div>` : ''}</div>
  <p style="font-size:10.5px; color:#555;">Cancelados e substituídos aparecem na lista, mas não entram nas somas (vale o CT-e substituto). Apuração do ICMS: estes são os débitos das saídas. Os créditos (entradas: combustível, peças, CT-e de subcontratação) e o saldo a recolher são apurados pelo contador no SPED, com as notas de entrada.</p>
  ${grupo('Resumo por CFOP', l.por_cfop)}${grupo('Resumo por CST e alíquota', l.por_cst)}${grupo('Resumo por UF de início → fim', l.por_uf)}
  <h3>Documentos</h3><table><thead><tr><th>Data</th><th>Série/nº</th><th>Situação</th><th>CFOP</th><th>CST</th><th class="n">Alíq.</th><th>Trajeto</th><th>Tomador</th><th class="n">Valor</th><th class="n">Base</th><th class="n">ICMS</th></tr></thead><tbody>
  ${l.ctes.map((d) => `<tr><td>${diaBr(d.data)}</td><td>${d.serie}/${d.numero}</td><td>${d.situacao}${d.tipo !== 'normal' ? ` (${d.tipo})` : ''}</td><td>${esc(d.cfop)}</td><td>${esc(d.cst)}</td><td class="n">${d.aliquota ? m(d.aliquota) : ''}</td>
    <td>${esc(d.uf_ini)} → ${esc(d.uf_fim)}</td><td>${esc(d.tomador_nome)}</td><td class="n">${m(d.valor_original)}</td><td class="n">${m(d.base)}</td><td class="n">${m(d.icms)}</td></tr>`).join('')}</tbody></table>
  ${l.nfse.length ? `<h3>NFS-e (frete municipal)</h3><table><thead><tr><th>Data</th><th>Número</th><th>Situação</th><th>Tomador</th><th class="n">Valor</th><th class="n">Alíq. ISS</th><th class="n">ISS</th><th>Retido</th></tr></thead><tbody>
  ${l.nfse.map((n) => `<tr><td>${diaBr(n.data)}</td><td>${esc(n.numero_nfse)}</td><td>${n.cancelada ? 'cancelada' : 'autorizada'}</td><td>${esc(n.tomador_nome)}</td><td class="n">${m(n.valor)}</td>
    <td class="n">${n.iss_aliquota != null ? m(n.iss_aliquota) : ''}</td><td class="n">${m(n.iss_valor)}</td><td>${n.iss_retido ? 'sim' : ''}</td></tr>`).join('')}</tbody></table>` : ''}
  </body></html>`;
}

// ---------- Pacote do contador (.zip) ----------
async function montarPacote(p) {
  const { de, ate } = periodo(p);
  const { rows: [e] } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  const { EscritorZip } = require('./utils/zip');
  const arquivo = path.join(os.tmpdir(), `contador-${de}-${crypto.randomBytes(5).toString('hex')}.zip`);
  const zip = new EscritorZip(arquivo);
  const cont = { cte: 0, eventos: 0, mdfe: 0, nfse: 0 };
  const { rows: ctes } = await pool.query(
    `SELECT chave, status, xml_autorizado, eventos, autorizado_em FROM ctes_emitidos WHERE chave IS NOT NULL AND xml_autorizado IS NOT NULL
      AND (autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date ORDER BY autorizado_em`, [de, ate]);
  for (const c of ctes) {
    zip.adicionar(`CT-e/${c.status === 'autorizado' ? 'autorizados' : c.status}/${c.chave}-procCTe.xml`, Buffer.from(c.xml_autorizado, 'utf8'), { data: new Date(c.autorizado_em) });
    cont.cte += 1;
    (Array.isArray(c.eventos) ? c.eventos : []).filter((ev) => ev?.ok && ev.xml).forEach((ev, i) => {
      const tipo = (/<tpEvento>(\d+)<\/tpEvento>/.exec(ev.xml) || [])[1] || 'evento';
      zip.adicionar(`CT-e/eventos/${c.chave}-${tipo}-${i + 1}-procEventoCTe.xml`, Buffer.from(ev.xml, 'utf8')); cont.eventos += 1;
    });
  }
  const { rows: mdfes } = await pool.query(
    `SELECT chave, status, xml_autorizado, autorizado_em FROM mdfes WHERE chave IS NOT NULL AND xml_autorizado IS NOT NULL
      AND (autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date`, [de, ate]);
  mdfes.forEach((m) => { zip.adicionar(`MDF-e/${m.chave}-procMDFe.xml`, Buffer.from(m.xml_autorizado, 'utf8'), { data: new Date(m.autorizado_em) }); cont.mdfe += 1; });
  const { rows: nf } = await pool.query(
    `SELECT chave, numero_nfse, status, xml_nfse, xml_cancelamento FROM nfse_emitidas WHERE xml_nfse IS NOT NULL
      AND (autorizada_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date`, [de, ate]);
  nf.forEach((n) => {
    zip.adicionar(`NFS-e/${n.chave || n.numero_nfse}-nfse.xml`, Buffer.from(n.xml_nfse, 'utf8')); cont.nfse += 1;
    if (n.xml_cancelamento) zip.adicionar(`NFS-e/${n.chave || n.numero_nfse}-cancelamento.xml`, Buffer.from(n.xml_cancelamento, 'utf8'));
  });
  const livro = await livroSaidas({ de, ate });
  const lanc = await lancamentos({ de, ate });
  const cfg = await config();
  zip.adicionar('livro-de-saidas.html', Buffer.from(livroHtml(livro, e), 'utf8'));
  zip.adicionar('livro-de-saidas.csv', Buffer.from(csvLivro(livro), 'utf8'));
  zip.adicionar('lancamentos-contabeis.csv', Buffer.from(csvLancamentos(lanc, cfg.separador), 'utf8'));
  zip.adicionar('LEIA-ME.txt', Buffer.from([
    `Pacote do contador — ${e.razao_social || ''} (CNPJ ${e.cnpj || ''})`, `Período: ${diaBr(de)} a ${diaBr(ate)}`, '',
    `CT-e: ${cont.cte} XML (${livro.totais.ctes} válidos, ${livro.totais.cancelados} cancelados, ${livro.totais.substituidos} substituídos) + ${cont.eventos} evento(s)`, `MDF-e: ${cont.mdfe} XML`, `NFS-e: ${cont.nfse} XML`, '',
    `Valor das prestações (CT-e): R$ ${livro.totais.valor.toFixed(2)} · base ICMS R$ ${livro.totais.base.toFixed(2)} · ICMS R$ ${livro.totais.icms.toFixed(2)}`,
    livro.totais.nfse ? `NFS-e: R$ ${livro.totais.nfse_valor.toFixed(2)} · ISS R$ ${livro.totais.iss.toFixed(2)} (retido R$ ${livro.totais.iss_retido.toFixed(2)})` : '',
    '', 'livro-de-saidas.html/.csv: registro de saídas com resumo por CFOP, CST/alíquota e UF.',
    `lancamentos-contabeis.csv: ${lanc.totais.linhas} lançamento(s) (regime de ${lanc.regime === 'caixa' ? 'caixa' : 'competência'}) — data, conta débito, conta crédito, valor, histórico, documento, CNPJ/CPF.`,
    'Os XML importam direto nos sistemas contábeis/fiscais para gerar o SPED (EFD ICMS/IPI e Contribuições) junto com as notas de entrada.',
    livro.totais.demonstracao ? '\nATENÇÃO: há documentos do modo demonstração (sem valor fiscal) neste período.' : '',
  ].join('\r\n'), 'utf8'));
  zip.fechar();
  return { arquivo, nome: `contador-${(e.razao_social || 'empresa').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30)}-${de}-a-${ate}.zip`, contagem: cont, livro: livro.totais, lancamentos: lanc.totais };
}

async function enviarPacote(p, { para } = {}) {
  const cfg = await config();
  const destino = String(para || cfg.contador_email || '').trim();
  if (!destino) throw falha('Informe o e-mail do contador (Fiscal e contabilidade → Configuração).');
  const pac = await montarPacote(p);
  try {
    const tamanho = fs.statSync(pac.arquivo).size;
    if (tamanho > 20 * 1024 * 1024) throw falha(`O pacote ficou com ${(tamanho / 1048576).toFixed(1)} MB, grande demais para e-mail. Baixe e mande por outro meio.`);
    const { rows: [e] } = await pool.query('SELECT razao_social, nome_fantasia FROM empresa WHERE id = 1');
    const { de, ate } = periodo(p);
    await require('./email').enviarFatura({
      destinatarioEmail: destino, assunto: `${e.nome_fantasia || e.razao_social} — documentos fiscais de ${diaBr(de)} a ${diaBr(ate)}`,
      html: `<div style="font-family:Arial,sans-serif;">${cfg.contador_nome ? `<p>Olá, ${cfg.contador_nome.replace(/[<>&]/g, '')}.</p>` : ''}
        <p>Segue o pacote fiscal de <b>${diaBr(de)} a ${diaBr(ate)}</b> da ${String(e.razao_social || '').replace(/[<>&]/g, '')}:</p>
        <ul><li>${pac.contagem.cte} XML de CT-e (${pac.livro.ctes} válidos, ${pac.livro.cancelados} cancelados) e ${pac.contagem.eventos} evento(s)</li><li>${pac.contagem.mdfe} XML de MDF-e</li>
        <li>${pac.contagem.nfse} XML de NFS-e</li><li>Livro de saídas (HTML e planilha) — ICMS das saídas: R$ ${pac.livro.icms.toFixed(2).replace('.', ',')}${pac.livro.nfse ? ` · ISS: R$ ${pac.livro.iss.toFixed(2).replace('.', ',')}` : ''}</li>
        <li>${pac.lancamentos.linhas} lançamentos contábeis (planilha)</li></ul><p style="color:#667085; font-size:12px;">Enviado pelo Nexofrete.</p></div>`,
      anexos: [{ filename: pac.nome, path: pac.arquivo, contentType: 'application/zip' }],
    });
    return { para: destino, ...pac, arquivo: undefined };
  } finally { fs.rm(pac.arquivo, { force: true }, () => {}); }
}

// Envio automático: no dia escolhido, manda o mês anterior (uma vez por mês).
let agendado = null;
function agendar() {
  if (agendado) return;
  const verificar = async () => {
    try {
      const cfg = await config();
      if (!cfg.envio_ativo || !cfg.contador_email) return;
      const hoje = new Date(Date.now() - 3 * 3600000);
      if (hoje.getUTCDate() < cfg.envio_dia) return;
      const p = mesAnterior(hoje);
      if (cfg.ultimo_envio?.de === p.de && cfg.ultimo_envio?.ok) return;
      // Falhou: tenta de novo a cada 6 horas, não a cada hora.
      if (cfg.ultimo_envio?.de === p.de && Date.now() - Date.parse(cfg.ultimo_envio.em || 0) < 6 * 3600000) return;
      const r = await enviarPacote(p).then((x) => ({ ok: true, ...x })).catch((err) => ({ ok: false, erro: err.message }));
      const atual = await config();
      await pool.query('UPDATE empresa SET contabil_config = $1 WHERE id = 1', [JSON.stringify({ ...atual, ultimo_envio: { de: p.de, ate: p.ate, ok: r.ok, erro: r.erro || null, em: new Date().toISOString(), para: r.para || atual.contador_email } })]);
      if (!r.ok) console.error('[contabil] envio automático ao contador falhou:', r.erro);
    } catch (err) { console.error('[contabil]', err.message); }
  };
  agendado = setInterval(verificar, 60 * 60 * 1000);
  setTimeout(verificar, 90 * 1000);
}

module.exports = { CONTAS_PADRAO, NOMES_CONTAS, config, salvarConfig, livroSaidas, lancamentos, csvLancamentos, csvLivro, livroHtml, montarPacote, enviarPacote, agendar, mesAnterior, periodo };
