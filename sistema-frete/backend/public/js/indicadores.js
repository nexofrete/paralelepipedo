// =====================================================================
// Relatórios » Indicadores: o painel com tudo numa tela só (contratado,
// pago e a pagar; por transportadora, cliente, região, estado, modalidade e
// mês; entregas e pontualidade; ocorrências; economia da auditoria), com
// exportação para Excel (.xlsx, uma aba por bloco) e PDF (impressão).
// Também o "⬇ Excel" do alto de Relatórios, que exporta as tabelas e os
// gráficos da aba aberta. Usa do dashboard.js: apiFetch, mostrarAlerta,
// chamarGrafico, desenharBarras, desenharLinha, desenharRosca, desenharBarrasEmpilhadas.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const brlCurto = (v) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v));
  const num = (v, c = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const pct = (v) => (v == null ? '—' : `${num(v, 1)}%`);
  const mesBr = (m) => (m && /^\d{4}-\d{2}$/.test(m) ? `${m.slice(5)}/${m.slice(0, 4)}` : m || '—');
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

  // ---------- Excel (.xlsx) ----------
  async function exportarExcel(nome, abas) {
    const r = await apiFetch('/api/indicadores/xlsx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, abas }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || 'Erro ao gerar a planilha.'); }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${nome}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  window.exportarExcel = exportarExcel;
  // "R$ 1.234,56", "12,5%", "1.234" → número; o resto fica texto.
  const valorCelula = (t) => {
    const s = String(t ?? '').replace(/\s+/g, ' ').trim();
    const m = /^(-|−)?\s*(R\$\s*)?([\d.]+(?:,\d+)?)\s*(%)?$/.exec(s);
    if (!m || (!m[2] && !m[4] && /^0\d/.test(m[3]))) return s;   // número com zero à esquerda (NF, CEP) fica texto
    const n = Number(m[3].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? (m[1] ? -n : n) : s;
  };
  const tituloDe = (el) => el.closest('.painel')?.querySelector('h3, h4')?.textContent.trim() || el.closest('[id^="subaba"]')?.querySelector('h3, h4')?.textContent.trim() || '';
  function tabelaParaAba(t, i) {
    const linhas = [...t.querySelectorAll('tr')].filter((tr) => tr.offsetParent !== null || !t.offsetParent);
    const cab = linhas.find((tr) => tr.querySelector('th'));
    const colunas = cab ? [...cab.children].map((c) => c.textContent.trim()) : [];
    const corpo = linhas.filter((tr) => tr !== cab && tr.querySelector('td')).map((tr) => [...tr.children].map((c) => valorCelula(c.textContent)));
    return corpo.length ? { nome: tituloDe(t) || `Tabela ${i + 1}`, colunas, linhas: corpo } : null;
  }
  function graficoParaAba(canvas) {
    const d = window.graficosDados?.[canvas.id];
    if (!d || !Array.isArray(d.labels) || !Array.isArray(d.valores)) return null;
    const series = d.valores.length && typeof d.valores[0] === 'object' && d.valores[0] && Array.isArray(d.valores[0].valores);
    const colunas = series ? ['Item', ...d.valores.map((s) => s.nome)] : ['Item', 'Valor'];
    const linhas = d.labels.map((l, i) => [String(l), ...(series ? d.valores.map((s) => Number(s.valores[i]) || 0) : [Number(d.valores[i]) || 0])]);
    return linhas.length ? { nome: tituloDe(canvas) || canvas.id, colunas, linhas } : null;
  }
  // "⬇ Excel" do alto de Relatórios: tudo o que está visível na aba aberta.
  $('btnExcelRelatorios')?.addEventListener('click', async () => {
    const aba = [...document.querySelectorAll('#pagina-relatorios [id^="subaba"]')].find((x) => !x.classList.contains('oculto'));
    if (!aba) return;
    if (aba.id === 'subabaIndicadores') { $('indExcel')?.click(); return; }
    const abas = [...[...aba.querySelectorAll('table')].filter((t) => t.offsetParent !== null).map(tabelaParaAba),
      ...[...aba.querySelectorAll('canvas')].filter((c) => c.offsetParent !== null).map(graficoParaAba)].filter(Boolean);
    if (!abas.length) { mostrarAlerta('Nada para exportar nesta aba (abra o relatório e espere carregar).', { tipo: 'aviso' }); return; }
    const nome = `relatorio-${aba.id.replace('subaba', '').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
    try { await exportarExcel(nome, abas); } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
  });

  // ---------- Painel ----------
  const cont = $('subabaIndicadores');
  if (!cont) return;
  let dados = null;
  let montado = false;
  function montar() {
    montado = true;
    cont.innerHTML = `<div class="painel" style="display:flex; gap:10px; align-items:end; flex-wrap:wrap; margin-bottom:14px;">
        <div><label style="font-size:12px; color:var(--texto-fraco);">Período (emissão do CT-e)</label><div style="display:flex; gap:6px; align-items:center;">${Periodo.html('ind')}</div></div>
        <div><label for="indTransp" style="font-size:12px; color:var(--texto-fraco);">Transportadora</label><select id="indTransp" class="cte-entrada" style="min-width:200px;"><option value="">Todas</option></select></div>
        <span style="flex:1;"></span>
        <button class="btn btn-secundario" id="indExcel" style="width:auto;">⬇ Excel</button>
        <button class="btn btn-secundario" id="indPdf" style="width:auto;">🖨 PDF</button></div>
      <div id="indCorpo"><div class="kanban-vazio">Carregando…</div></div>`;
    Periodo.ligar({ select: $('indPer'), de: $('indDe'), ate: $('indAte'), chave: 'indicadores', padrao: 'mes', opcoes: ['mes', 'mes_passado', '30d', '3m', 'ano', '12m', 'tudo', 'custom'], aoMudar: () => carregar() });
    $('indTransp').addEventListener('change', () => carregar());
    $('indExcel').addEventListener('click', () => excel().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })));
    $('indPdf').addEventListener('click', () => window.print());
  }
  async function carregar() {
    const de = $('indDe').value || '2000-01-01';
    const ate = $('indAte').value || '';
    const t = $('indTransp').value;
    const r = await apiFetch(`/api/indicadores?de=${de}&ate=${ate}${t ? `&transportadora=${encodeURIComponent(t)}` : ''}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('indCorpo').innerHTML = `<div class="kanban-vazio">${esc(j.erro || 'Erro ao carregar.')}</div>`; return; }
    dados = j;
    if (!t) {
      const sel = $('indTransp');
      const nomes = j.por_transportadora.map((x) => x.chave);
      sel.innerHTML = `<option value="">Todas</option>${nomes.map((n) => `<option>${esc(n)}</option>`).join('')}`;
    }
    desenhar();
  }
  window.carregarIndicadores = () => { if (!montado) montar(); carregar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })); };

  const cartao = (rotulo, valor, sub, cor, alvo) => `<div${alvo ? ` data-ind-ir="${alvo}" style="cursor:pointer;" title="Abrir"` : ''}>${rotulo}<b${cor ? ` style="color:${cor};"` : ''}>${valor}</b><span>${sub || ''}</span></div>`;
  const painel = (titulo, corpo, extra = '') => `<div class="painel" style="${extra}"><h3 style="margin-top:0; font-size:14px;">${titulo}</h3>${corpo}</div>`;
  const tabelaGasto = (linhas, rotulo, comNf = true) => (linhas.length ? `<div class="edi-rolagem" style="max-height:340px;"><table class="edi-tabela"><thead><tr><th>${rotulo}</th><th class="n">CT-e</th><th class="n">Contratado</th><th class="n">Pago</th><th class="n">A pagar</th>${comNf ? '<th class="n">% s/ NF</th><th class="n">R$/kg</th>' : ''}</tr></thead><tbody>
    ${linhas.map((l) => `<tr><td><b>${esc(rotulo === 'Mês' ? mesBr(l.chave) : l.chave)}</b></td><td class="n">${num(l.ctes)}</td><td class="n">${brl(l.contratado)}</td><td class="n" style="color:var(--verde);">${brl(l.pago)}</td><td class="n" style="color:${l.pendente ? '#d97706' : 'inherit'};">${brl(l.pendente)}</td>
      ${comNf ? `<td class="n">${pct(l.percentual_nf)}</td><td class="n">${l.por_kg == null ? '—' : num(l.por_kg, 2)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="kanban-vazio">Sem fretes no período.</div>');
  const corPont = (v) => (v == null ? 'inherit' : v >= 95 ? 'var(--verde)' : v >= 85 ? '#d97706' : 'var(--vermelho)');

  function desenhar() {
    const d = dados; const f = d.financeiro; const e = d.entregas; const o = d.ocorrencias; const ec = d.economia;
    $('indCorpo').innerHTML = `
      <h3 style="margin:4px 0 8px;">💰 Fretes — ${dia(d.de)} a ${dia(d.ate)}${d.transportadora ? ` · ${esc(d.transportadora)}` : ''}</h3>
      <div class="oc-resumo">${cartao('Fretes contratados', brlCurto(f.contratado), `${num(f.ctes)} CT-e${f.percentual_nf != null ? ` · ${pct(f.percentual_nf)} do valor das notas` : ''}`)}
        ${cartao('Fretes pagos', brlCurto(f.pago), `${num(f.qtd_pago)} CT-e em faturas pagas`, 'var(--verde)', 'financeiro')}
        ${cartao('A pagar (pendentes)', brlCurto(f.pendente), `faturado ${brlCurto(f.faturado)} · liberado ${brlCurto(f.liberado)}`, '#d97706', 'financeiro')}
        ${cartao('Em conferência / retido', brlCurto(f.conferencia + f.retido), `${num(f.qtd_conferencia)} em conferência · ${num(f.qtd_retido)} retido(s)`, f.retido ? 'var(--vermelho)' : '', 'auditoria-frete')}
        ${cartao('Economia da auditoria', brlCurto(ec.economizado), `${pct(ec.percentual)} do que foi cobrado · em apuração ${brlCurto(ec.em_apuracao)}`, 'var(--verde)')}</div>
      <h3 style="margin:16px 0 8px;">🚚 Entregas e pontualidade</h3>
      <div class="oc-resumo">${cartao('Entregues no período', num(e.entregues), `${num(e.no_prazo)} no prazo`, '', 'r:entregas')}
        ${cartao('Pontualidade', pct(e.pontualidade), e.atraso_medio ? `atraso médio ${num(e.atraso_medio, 1)} dia(s)` : 'das entregues com prazo', corPont(e.pontualidade))}
        ${cartao('Pendentes', num(e.pendentes), `${num(e.sem_previsao)} sem previsão`, '', 'r:entregas')}
        ${cartao('Atrasadas', num(e.atrasadas), 'previsão já passou', e.atrasadas ? 'var(--vermelho)' : '', 'r:entregas')}
        ${cartao('Previstas para hoje', num(e.hoje), dia(d.hoje), '', 'r:entregas')}
        ${cartao('Próximos 7 dias', num(e.proximos_7), 'a entregar na semana', '', 'r:entregas')}
        ${cartao('Ocorrências', num(o.total), `${num(o.reentregas)} reentrega(s) · ${num(o.sinistros)} sinistro(s)`, o.total ? '#d97706' : '')}</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(440px, 1fr)); gap:16px; margin-top:14px; align-items:start;">
        ${painel('📈 Contratado e pago por mês', '<canvas id="indGrafMes"></canvas>')}
        ${painel('💸 Pago × a pagar', '<div style="max-width:300px; margin:0 auto;"><canvas id="indGrafPago"></canvas></div>')}
        ${painel('🚛 Por transportadora', `<canvas id="indGrafTransp"></canvas>`)}
        ${painel('🗺 Por região', '<div style="max-width:320px; margin:0 auto;"><canvas id="indGrafRegiao"></canvas></div>')}
        ${painel('📍 Por estado de destino', '<canvas id="indGrafUf"></canvas>')}
        ${painel('🚚 Por modalidade', `<div class="cte-abas" style="margin-bottom:8px;">${[['modal', 'Modal'], ['carga', 'Lotação × fracionada'], ['cif_fob', 'CIF × FOB'], ['entrega', 'Direta × redespacho'], ['servico', 'Tipo de serviço']].map(([k, t], i) => `<div class="cte-aba ${i ? '' : 'ativo'}" data-ind-mod="${k}">${t}</div>`).join('')}</div><div style="max-width:320px; margin:0 auto;"><canvas id="indGrafMod"></canvas></div><div id="indTabMod"></div>`)}
        ${painel('⚠ Ocorrências por tipo', '<canvas id="indGrafOc"></canvas>')}
        ${painel('🛡 Economia da auditoria por mês', '<canvas id="indGrafEco"></canvas>')}
      </div>
      ${painel('🚛 Transportadoras', d.por_transportadora.length ? `<div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Transportadora</th><th class="n">CT-e</th><th class="n">Contratado</th><th class="n">Pago</th><th class="n">A pagar</th><th class="n">% s/ NF</th><th class="n">Entregues</th><th class="n">Pontualidade</th><th class="n">Pendentes</th><th class="n">Atrasadas</th><th class="n">Ocorrências</th><th class="n">Economia</th></tr></thead><tbody>
        ${d.por_transportadora.map((t) => `<tr><td><b>${esc(t.chave)}</b></td><td class="n">${num(t.ctes)}</td><td class="n">${brl(t.contratado)}</td><td class="n" style="color:var(--verde);">${brl(t.pago)}</td><td class="n">${brl(t.pendente)}</td><td class="n">${pct(t.percentual_nf)}</td>
          <td class="n">${num(t.entregues)}</td><td class="n" style="color:${corPont(t.pontualidade)};"><b>${pct(t.pontualidade)}</b></td><td class="n">${num(t.pendentes)}</td><td class="n" style="color:${t.atrasadas ? 'var(--vermelho)' : 'inherit'};">${num(t.atrasadas)}</td><td class="n">${num(t.ocorrencias)}</td><td class="n" style="color:var(--verde);">${brl(t.economizado)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="kanban-vazio">Sem fretes no período.</div>', 'margin-top:16px;')}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(440px, 1fr)); gap:16px; margin-top:16px; align-items:start;">
        ${painel('👥 Por cliente', tabelaGasto(d.por_cliente.slice(0, 100), 'Cliente'))}
        ${painel('🗺 Por região e estado', tabelaGasto([...d.por_regiao.map((x) => ({ ...x, chave: `▸ ${x.chave}` })), ...d.por_uf], 'Região / UF'))}
        ${painel('📅 Por mês', tabelaGasto(d.por_mes, 'Mês'))}
        ${painel('🛡 Economia da auditoria', `<div class="oc-resumo" style="margin-bottom:8px;">${cartao('Glosas', brl(ec.glosas), `${num(ec.qtd_glosas)} CT-e`)}${cartao('CT-e barrados', brl(ec.barrados), `${num(ec.qtd_barrados)} recusado(s) / não levou`)}${cartao('Em apuração', brl(ec.em_apuracao), `${num(ec.qtd_retidos)} retido(s)`)}</div>
          ${ec.por_transportadora.length ? `<table class="edi-tabela"><thead><tr><th>Transportadora</th><th class="n">Glosas</th><th class="n">Barrados</th><th class="n">Economizado</th><th class="n">Em apuração</th></tr></thead><tbody>${ec.por_transportadora.map((x) => `<tr><td>${esc(x.chave)}</td><td class="n">${brl(x.glosas)}</td><td class="n">${brl(x.barrados)}</td><td class="n" style="color:var(--verde);"><b>${brl(x.economizado)}</b></td><td class="n">${brl(x.em_apuracao)}</td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nenhuma glosa ou CT-e barrado no período.</div>'}
          <p class="edi-dica">Economizado = glosas (desconto no CT-e) + CT-e barrados (recusados na conferência, da transportadora que não levou a carga). Em apuração = o que os CT-e retidos cobram acima da tabela.</p>`)}
        ${painel('⚠ Ocorrências', `<div class="oc-resumo" style="margin-bottom:8px;">${cartao('Do rastreio', num(o.total), 'problemas registrados')}${cartao('Reentregas', num(o.reentregas), 'CT-e de reentrega/complementar')}${cartao('Sinistros', num(o.sinistros), o.sinistros ? `${brl(o.sinistros_prejuizo)} de prejuízo · ${brl(o.sinistros_ressarcido)} ressarcido` : '')}${cartao('Com problema agora', num(o.com_problema_agora), 'no rastreio, ainda não entregues')}</div>
          ${o.por_transportadora.length ? `<table class="edi-tabela"><thead><tr><th>Transportadora</th><th class="n">Ocorrências</th></tr></thead><tbody>${o.por_transportadora.map((x) => `<tr><td>${esc(x.chave)}</td><td class="n">${num(x.qtd)}</td></tr>`).join('')}</tbody></table>` : ''}`)}
      </div>
      <p class="edi-dica" style="margin-top:10px;">Contratado: CT-e do período (emissão), sem os cancelados, os que não são cobrados da empresa e os barrados pela auditoria. Pago: CT-e de faturas com o pagamento registrado (Auditoria de Frete » Conferir Fatura). A pagar: faturado e ainda não pago, liberado sem fatura, em conferência e retido. Entregas e pontualidade: notas entregues no período (no prazo = até a data prevista); pendentes, atrasadas, hoje e 7 dias são a situação de agora.</p>`;

    const mes = d.por_mes;
    chamarGrafico(desenharBarrasEmpilhadas, 'indGrafMes', mes.map((m) => mesBr(m.chave)), [{ nome: 'Pago', cor: '#22c55e', valores: mes.map((m) => m.pago) }, { nome: 'A pagar', cor: '#f59e0b', valores: mes.map((m) => m.pendente) }], brlCurto);
    chamarGrafico(desenharRosca, 'indGrafPago', ['Pago', 'Faturado (a pagar)', 'Liberado sem fatura', 'Em conferência', 'Retido'], [f.pago, f.faturado, f.liberado, f.conferencia, f.retido], ['#22c55e', '#f59e0b', '#4d7cff', '#a855f7', '#ef4444'], brl);
    const tp = d.por_transportadora.slice(0, 12);
    chamarGrafico(desenharBarras, 'indGrafTransp', tp.map((x) => x.chave), tp.map((x) => x.contratado), '#4d7cff', true, undefined, brlCurto);
    chamarGrafico(desenharRosca, 'indGrafRegiao', d.por_regiao.map((x) => x.chave), d.por_regiao.map((x) => x.contratado), ['#4d7cff', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#94a3b8'], brl);
    const ufs = d.por_uf.slice(0, 15);
    chamarGrafico(desenharBarras, 'indGrafUf', ufs.map((x) => x.chave), ufs.map((x) => x.contratado), '#06b6d4', false, undefined, brlCurto);
    const oc = o.por_tipo.slice(0, 10);
    chamarGrafico(desenharBarras, 'indGrafOc', oc.map((x) => x.chave), oc.map((x) => x.qtd), '#f59e0b', true);
    chamarGrafico(desenharBarrasEmpilhadas, 'indGrafEco', ec.por_mes.map((m) => mesBr(m.chave)), [{ nome: 'Glosas', cor: '#22c55e', valores: ec.por_mes.map((m) => m.glosas) }, { nome: 'Barrados', cor: '#4d7cff', valores: ec.por_mes.map((m) => m.barrados) }], brlCurto);
    const modalidade = (k) => {
      const l = d.modalidade[k];
      document.querySelectorAll('[data-ind-mod]').forEach((a) => a.classList.toggle('ativo', a.dataset.indMod === k));
      chamarGrafico(desenharRosca, 'indGrafMod', l.map((x) => x.chave), l.map((x) => x.contratado), ['#4d7cff', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ef4444'], brl);
      $('indTabMod').innerHTML = tabelaGasto(l, 'Modalidade', false);
    };
    document.querySelectorAll('[data-ind-mod]').forEach((a) => a.addEventListener('click', () => modalidade(a.dataset.indMod)));
    modalidade('modal');
    document.querySelectorAll('[data-ind-ir]').forEach((c) => c.addEventListener('click', () => {
      const alvo = c.dataset.indIr;
      if (alvo.startsWith('r:')) window.mostrarSubabaRelatorio?.(alvo.slice(2)); else window.irParaPagina?.(alvo);
    }));
  }

  // Planilha com uma aba por bloco do painel.
  async function excel() {
    if (!dados) return;
    const d = dados; const f = d.financeiro; const e = d.entregas; const ec = d.economia; const o = d.ocorrencias;
    const gasto = (nome, linhas, rotulo, fmt = (k) => k) => ({ nome, colunas: [rotulo, 'CT-e', 'Contratado', 'Pago', 'A pagar', 'Valor das NF', '% s/ NF', 'Peso (kg)', 'R$/kg'],
      linhas: linhas.map((l) => [fmt(l.chave), l.ctes, l.contratado, l.pago, l.pendente, l.valor_nf, l.percentual_nf, l.peso, l.por_kg]) });
    const abas = [
      { nome: 'Resumo', colunas: ['Indicador', 'Valor'], linhas: [
        ['Período', `${dia(d.de)} a ${dia(d.ate)}`], ['Transportadora', d.transportadora || 'Todas'],
        ['Fretes contratados (R$)', f.contratado], ['CT-e', f.ctes], ['Fretes pagos (R$)', f.pago], ['A pagar (R$)', f.pendente], ['  Faturado, não pago (R$)', f.faturado],
        ['  Liberado sem fatura (R$)', f.liberado], ['  Em conferência (R$)', f.conferencia], ['  Retido (R$)', f.retido], ['% do frete sobre as notas', f.percentual_nf],
        ['Entregues no período', e.entregues], ['Entregues no prazo', e.no_prazo], ['Pontualidade (%)', e.pontualidade], ['Atraso médio (dias)', e.atraso_medio],
        ['Pendentes (agora)', e.pendentes], ['Atrasadas (agora)', e.atrasadas], ['Previstas para hoje', e.hoje], ['Próximos 7 dias', e.proximos_7],
        ['Ocorrências do rastreio', o.total], ['Reentregas', o.reentregas], ['Sinistros', o.sinistros],
        ['Economia da auditoria (R$)', ec.economizado], ['  Glosas (R$)', ec.glosas], ['  CT-e barrados (R$)', ec.barrados], ['Em apuração (R$)', ec.em_apuracao]] },
      { nome: 'Por transportadora', colunas: ['Transportadora', 'CT-e', 'Contratado', 'Pago', 'A pagar', '% s/ NF', 'Entregues', 'Pontualidade (%)', 'Pendentes', 'Atrasadas', 'Ocorrências', 'Economia'],
        linhas: d.por_transportadora.map((t) => [t.chave, t.ctes, t.contratado, t.pago, t.pendente, t.percentual_nf, t.entregues, t.pontualidade, t.pendentes, t.atrasadas, t.ocorrencias, t.economizado]) },
      gasto('Por cliente', d.por_cliente, 'Cliente'), gasto('Por região', d.por_regiao, 'Região'), gasto('Por estado', d.por_uf, 'UF'), gasto('Por mês', d.por_mes, 'Mês', mesBr),
      gasto('Modal', d.modalidade.modal, 'Modal'), gasto('Lotação x fracionada', d.modalidade.carga, 'Carga'), gasto('CIF x FOB', d.modalidade.cif_fob, 'Frete'),
      gasto('Direta x redespacho', d.modalidade.entrega, 'Entrega'), gasto('Tipo de serviço', d.modalidade.servico, 'Serviço'),
      { nome: 'Ocorrências', colunas: ['Ocorrência', 'Quantidade'], linhas: o.por_tipo.map((x) => [x.chave, x.qtd]) },
      { nome: 'Ocorrências por transp.', colunas: ['Transportadora', 'Quantidade'], linhas: o.por_transportadora.map((x) => [x.chave, x.qtd]) },
      { nome: 'Economia', colunas: ['Transportadora', 'Glosas', 'Qtd glosas', 'CT-e barrados', 'Qtd barrados', 'Economizado', 'Em apuração'],
        linhas: ec.por_transportadora.map((x) => [x.chave, x.glosas, x.qtd_glosas, x.barrados, x.qtd_barrados, x.economizado, x.em_apuracao]) },
      { nome: 'Economia por mês', colunas: ['Mês', 'Glosas', 'CT-e barrados', 'Economizado', 'Em apuração'], linhas: ec.por_mes.map((x) => [mesBr(x.chave), x.glosas, x.barrados, x.economizado, x.em_apuracao]) },
    ];
    await exportarExcel(`indicadores-${d.de}-a-${d.ate}`, abas);
  }
})();
