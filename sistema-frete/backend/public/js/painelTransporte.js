// =====================================================================
// Painel gerencial da transportadora: indicadores do período (com o período
// anterior para comparar), faturamento mês a mês, clientes, rotas, entregas
// no prazo e o resultado por viagem (MDF-e: receita dos CT-e − custos).
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro || !!usuario?.pode_ver_relatorios;
  const nav = document.getElementById('navPainelTransporte');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const moedaCurta = (v) => { const n = Number(v) || 0; return n >= 1e6 ? `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : n >= 1e3 ? `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`; };
  const inteiro = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR'));
  const peso = (kg) => (kg == null ? '—' : kg >= 10000 ? `${(kg / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t` : `${Number(kg).toLocaleString('pt-BR')} kg`);
  const pct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nomeMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = (c, o = {}) => apiFetch(`/api/painel-transporte${c}`, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.'); return j; });
  let aba = 'geral';
  let ultimo = null;

  // ---------- Período (js/periodo.js: igual em todas as telas, lembra a última escolha) ----------
  Periodo.ligar({ select: $('ptPeriodo'), de: $('ptDe'), ate: $('ptAte'), chave: 'painel-transporte', padrao: 'mes', aoMudar: () => carregar() });
  const periodo = () => `?de=${$('ptDe').value}&ate=${$('ptAte').value}`;

  nav.addEventListener('click', () => carregar());
  document.querySelectorAll('[data-pt-aba]').forEach((a) => a.addEventListener('click', () => {
    aba = a.dataset.ptAba;
    document.querySelectorAll('[data-pt-aba]').forEach((x) => x.classList.toggle('ativo', x === a));
    $('pt-aba-geral').classList.toggle('oculto', aba !== 'geral'); $('pt-aba-viagens').classList.toggle('oculto', aba !== 'viagens');
    $('pt-aba-resultado').classList.toggle('oculto', aba !== 'resultado');
    carregar();
  }));
  // A aba de margem fica em js/resultado.js (window.nexoResultado).
  function carregar() { (aba === 'geral' ? geral() : aba === 'viagens' ? viagens() : (window.nexoResultado?.carregar($('ptDe').value, $('ptAte').value) || Promise.resolve())).catch(erro); }

  // ---------- Visão geral ----------
  function delta(atual, anterior, { inverso = false } = {}) {
    if (atual == null || anterior == null || !Number(anterior)) return '<span class="kpi-subtext neutral">sem base no período anterior</span>';
    const v = ((atual - anterior) / Math.abs(anterior)) * 100;
    if (Math.abs(v) < 0.05) return '<span class="kpi-subtext neutral">= igual ao período anterior</span>';
    const bom = inverso ? v < 0 : v > 0;
    // Base muito pequena no período anterior: mostra "mais de 10x" em vez de um percentual sem sentido.
    const texto = Math.abs(v) >= 1000 ? `${v > 0 ? 'mais de' : 'menos de'} ${v > 0 ? '10×' : '1/10'}` : `${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    return `<span class="pt-delta ${bom ? 'positive' : 'negative'}">${v > 0 ? '▲' : '▼'} ${texto}</span> <span class="kpi-subtext neutral">vs período anterior</span>`;
  }
  const kpi = (titulo, icone, valor, sub) => `<div class="mini-card kpi-card"><div class="kpi-header"><span>${titulo}</span><span aria-hidden="true">${icone}</span></div><div class="kpi-value">${valor}</div><div>${sub}</div></div>`;

  async function geral() {
    const d = await api(`/${periodo()}`);
    ultimo = d;
    const a = d.atual; const b = d.anterior;
    $('ptComparacao').textContent = `comparando com ${dia(d.periodo.anterior.de)} a ${dia(d.periodo.anterior.ate)}`;
    const maiorCliente = Math.max(1, ...d.clientes.map((c) => c.faturamento));
    const maiorRota = Math.max(1, ...d.rotas.map((r) => r.faturamento));
    const barra = (v, max) => `<div class="pt-barra-celula"><div class="trilho"><div class="cheia" style="width:${Math.max(1, (v / max) * 100)}%;"></div></div></div>`;
    $('pt-aba-geral').innerHTML = `
      ${d.demonstracao ? '<div class="cte-aviso" style="font-size:12.5px;">Há CT-e de demonstração no período: os números incluem esses testes.</div>' : ''}
      <div class="kpi-grid">
        ${kpi('Faturamento', '💵', moeda(a.faturamento), delta(a.faturamento, b.faturamento))}
        ${kpi('CT-e emitidos', '📄', inteiro(a.ctes), `${delta(a.ctes, b.ctes)}${a.complementares ? `<div class="kpi-subtext neutral">+ ${a.complementares} complementar(es)</div>` : ''}`)}
        ${kpi('Peso transportado', '⚖️', peso(a.peso_kg), delta(a.peso_kg, b.peso_kg))}
        ${kpi('Frete por kg', '📦', a.frete_kg == null ? '—' : `R$ ${a.frete_kg.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`, delta(a.frete_kg, b.frete_kg))}
        ${kpi('Ticket médio por CT-e', '🎫', moeda(a.ticket), delta(a.ticket, b.ticket))}
        ${kpi('Frete sobre a mercadoria', '🧮', pct(a.frete_sobre_carga), '<span class="kpi-subtext neutral">frete ÷ valor da carga transportada</span>')}
        ${kpi('Entregas no prazo', '⏱️', pct(a.pct_no_prazo), `<span class="kpi-subtext neutral">${a.no_prazo} de ${a.entregues} entregue(s) no período</span>${d.entregas_atrasadas ? `<div class="kpi-subtext negative">⚠ ${d.entregas_atrasadas} em aberto já atrasada(s)</div>` : ''}`)}
        ${kpi('A receber', '🧾', moeda(d.a_receber), Number(d.vencido) > 0 ? `<span class="kpi-subtext negative">⚠ ${moeda(d.vencido)} vencido</span>` : '<span class="kpi-subtext neutral">nada vencido</span>')}
      </div>
      <div class="painel" style="padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap;"><h3 style="margin:0;">Faturamento por mês</h3>
          <span style="font-size:12px; color:var(--texto-fraco);">últimos 12 meses até ${dia(d.periodo.ate)} · passe o mouse nas barras</span></div>
        <div class="pt-grafico" id="ptGraficoMensal" style="margin-top:10px;"></div>
        <details style="margin-top:8px;"><summary style="cursor:pointer; font-size:12.5px; color:var(--texto-fraco);">Ver em tabela</summary>
          <table class="edi-tabela" style="margin-top:6px;"><thead><tr><th>Mês</th><th style="text-align:right;">Faturamento</th><th style="text-align:right;">CT-e</th><th style="text-align:right;">Peso</th></tr></thead><tbody>
          ${d.mensal.map((m) => `<tr><td>${nomeMes(m.mes)}</td><td style="text-align:right;">${moeda(m.faturamento)}</td><td style="text-align:right;">${inteiro(m.ctes)}</td><td style="text-align:right;">${peso(m.peso_kg)}</td></tr>`).join('')}</tbody></table></details>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 620px), 1fr)); gap:16px;">
        <div class="painel" style="padding:16px; overflow-x:auto;"><h3 style="margin:0 0 10px;">Clientes <small style="font-weight:400; color:var(--texto-fraco);">(quem paga o frete · ${d.total_clientes} no período)</small></h3>
          <table class="edi-tabela"><thead><tr><th>Cliente</th><th style="text-align:right;">CT-e</th><th style="text-align:right;">Faturamento</th><th style="width:22%;"></th><th style="text-align:right;">R$/kg</th><th style="text-align:right;">No prazo</th></tr></thead><tbody>
          ${d.clientes.map((c) => `<tr><td><b>${esc(c.nome)}</b></td><td style="text-align:right;">${inteiro(c.ctes)}</td><td style="text-align:right; white-space:nowrap;">${moeda(c.faturamento)}</td><td>${barra(c.faturamento, maiorCliente)}</td>
            <td style="text-align:right;">${c.frete_kg == null ? '—' : c.frete_kg.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td><td style="text-align:right;">${pct(c.pct_no_prazo)}</td></tr>`).join('')
            || '<tr><td colspan="6" style="color:var(--texto-fraco);">Nenhum CT-e no período.</td></tr>'}</tbody></table></div>
        <div class="painel" style="padding:16px; overflow-x:auto;"><h3 style="margin:0 0 10px;">Rotas <small style="font-weight:400; color:var(--texto-fraco);">(origem → destino)</small></h3>
          <table class="edi-tabela"><thead><tr><th>Rota</th><th style="text-align:right;">CT-e</th><th style="text-align:right;">Peso</th><th style="text-align:right;">Faturamento</th><th style="width:20%;"></th><th style="text-align:right;">R$/kg</th></tr></thead><tbody>
          ${d.rotas.map((r) => `<tr><td>${esc(r.origem_cidade ? `${r.origem_cidade}/${r.origem}` : r.origem)} → <b>${esc(r.destino)}/${esc(r.uf)}</b></td><td style="text-align:right;">${inteiro(r.ctes)}</td><td style="text-align:right; white-space:nowrap;">${peso(r.peso_kg)}</td>
            <td style="text-align:right; white-space:nowrap;">${moeda(r.faturamento)}</td><td>${barra(r.faturamento, maiorRota)}</td><td style="text-align:right;">${r.frete_kg == null ? '—' : r.frete_kg.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`).join('')
            || '<tr><td colspan="6" style="color:var(--texto-fraco);">Nenhum CT-e no período.</td></tr>'}</tbody></table></div>
      </div>`;
    graficoMensal(d.mensal, d.periodo);
  }

  // Colunas: uma série (faturamento), barras finas com topo arredondado, grade discreta e dica no mouse.
  function graficoMensal(dados, per) {
    const caixa = $('ptGraficoMensal');
    if (!caixa) return;
    const L = Math.max(320, caixa.clientWidth || 800); const A = 230; const m = { t: 12, r: 8, b: 26, l: 64 };
    const w = L - m.l - m.r; const h = A - m.t - m.b;
    const max = Math.max(...dados.map((x) => x.faturamento), 1);
    const passo = (() => { const bruto = max / 4; const p10 = 10 ** Math.floor(Math.log10(bruto)); return [1, 2, 2.5, 5, 10].map((k) => k * p10).find((k) => k >= bruto); })();
    const topo = passo * Math.ceil(max / passo);
    const y = (v) => m.t + h - (v / topo) * h;
    const faixa = w / dados.length; const larg = Math.min(34, faixa * 0.56);
    const noPeriodo = (mes) => mes >= per.de.slice(0, 7) && mes <= per.ate.slice(0, 7);
    let svg = `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Faturamento por mês nos últimos 12 meses">`;
    for (let v = 0; v <= topo + 0.001; v += passo) {
      svg += `<line x1="${m.l}" x2="${L - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--pt-grade)" stroke-width="1"/>`;
      svg += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--pt-eixo)">${moedaCurta(v)}</text>`;
    }
    dados.forEach((x, i) => {
      const cx = m.l + faixa * i + faixa / 2;
      const alt = Math.max(0, y(0) - y(x.faturamento));
      const r = Math.min(4, alt / 2, larg / 2);
      const x0 = cx - larg / 2; const yb = y(0);
      // Barra ancorada na base, só o topo arredondado (4px).
      const caminho = alt > 0 ? `M${x0},${yb} V${yb - alt + r} Q${x0},${yb - alt} ${x0 + r},${yb - alt} H${x0 + larg - r} Q${x0 + larg},${yb - alt} ${x0 + larg},${yb - alt + r} V${yb} Z` : '';
      svg += `<rect class="alvo" data-i="${i}" x="${m.l + faixa * i}" y="${m.t}" width="${faixa}" height="${h}" fill="transparent"/>`;
      if (caminho) svg += `<path class="barra" data-barra="${i}" d="${caminho}" ${noPeriodo(x.mes) ? '' : 'fill-opacity="0.45"'}/>`;
      svg += `<text x="${cx}" y="${A - 8}" text-anchor="middle" font-size="11" fill="var(--pt-eixo)" ${noPeriodo(x.mes) ? 'font-weight="600"' : ''}>${nomeMes(x.mes)}</text>`;
    });
    svg += `<line x1="${m.l}" x2="${L - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--pt-eixo)" stroke-opacity=".5" stroke-width="1"/></svg><div class="pt-dica oculto" id="ptDica"></div>`;
    caixa.innerHTML = svg;
    const dica = $('ptDica');
    caixa.querySelectorAll('.alvo').forEach((alvo) => {
      const i = Number(alvo.dataset.i); const x = dados[i];
      alvo.addEventListener('mouseenter', () => {
        caixa.querySelector(`[data-barra="${i}"]`)?.classList.add('ativa');
        const escala = caixa.clientWidth / L;
        dica.innerHTML = `<b>${nomeMes(x.mes)}</b>${moeda(x.faturamento)}<br>${inteiro(x.ctes)} CT-e · ${peso(x.peso_kg)}`;
        dica.style.left = `${(m.l + faixa * i + faixa / 2) * escala}px`;
        dica.style.top = `${Math.max(0, y(x.faturamento) * escala - 8)}px`;
        dica.classList.remove('oculto');
      });
      alvo.addEventListener('mouseleave', () => { caixa.querySelector(`[data-barra="${i}"]`)?.classList.remove('ativa'); dica.classList.add('oculto'); });
    });
  }
  let redesenho = null;
  window.addEventListener('resize', () => { clearTimeout(redesenho); redesenho = setTimeout(() => { if (ultimo && !$('pagina-painel-transporte').classList.contains('oculto') && aba === 'geral') graficoMensal(ultimo.mensal, ultimo.periodo); }, 250); });

  // ---------- Resultado por viagem ----------
  const CUSTOS = [['combustivel', 'Combustível'], ['pedagio', 'Pedágio'], ['motorista', 'Motorista (diárias/comissão)'], ['terceiro', 'Frete de terceiro/agregado'], ['outros', 'Outros']];
  async function viagens() {
    const lista = await api(`/viagens${periodo()}`);
    $('ptComparacao').textContent = '';
    const comCusto = lista.filter((v) => v.margem != null);
    const tot = (k, l = lista) => l.reduce((s, v) => s + (Number(v[k]) || 0), 0);
    $('pt-aba-viagens').innerHTML = `
      <div class="kpi-grid">
        ${kpi('Viagens (MDF-e)', '🚛', inteiro(lista.length), `<span class="kpi-subtext neutral">${comCusto.length} com custos lançados</span>`)}
        ${kpi('Receita das viagens', '💵', moeda(tot('receita')), '<span class="kpi-subtext neutral">soma dos CT-e de cada MDF-e</span>')}
        ${kpi('Custos lançados', '⛽', moeda(tot('custo')), '<span class="kpi-subtext neutral">combustível, pedágio, motorista…</span>')}
        ${kpi('Margem (viagens com custo)', '📈', comCusto.length ? moeda(tot('margem', comCusto)) : '—', comCusto.length && tot('receita', comCusto) > 0 ? `<span class="kpi-subtext neutral">${pct((tot('margem', comCusto) / tot('receita', comCusto)) * 100)} da receita</span>` : '<span class="kpi-subtext neutral">lance os custos de cada viagem</span>')}
      </div>
      <div class="painel" style="padding:16px; overflow-x:auto;">
        <div class="cte-aviso" style="font-size:12.5px;">A receita vem dos CT-e de cada MDF-e. Clique em <b>Lançar custos</b> para informar combustível, pedágio, motorista e terceiros e ver a margem da viagem.</div>
        <table class="edi-tabela"><thead><tr><th>MDF-e</th><th>Veículo / motorista</th><th>Percurso</th><th style="text-align:right;">CT-e</th><th style="text-align:right;">Peso</th><th style="text-align:right;">Receita</th><th style="text-align:right;">Custos</th><th style="text-align:right;">Margem</th><th></th></tr></thead><tbody>
        ${lista.map((v) => `<tr><td><b>${v.serie}/${v.numero}</b><br><small style="color:var(--texto-fraco);">${dia(v.autorizado_em)}${v.status === 'encerrado' ? ' · encerrado' : ' · em viagem'}${v.demonstracao ? ' · demo' : ''}</small></td>
          <td><b>${esc(v.placa || '')}</b><br><small style="color:var(--texto-fraco);">${esc(v.motorista || '')}</small></td><td>${esc(v.uf_ini || '')} → ${esc(v.uf_fim || '')}</td>
          <td style="text-align:right;">${v.ctes}</td><td style="text-align:right; white-space:nowrap;">${peso(v.peso_kg)}</td><td style="text-align:right; white-space:nowrap;">${moeda(v.receita)}</td>
          <td style="text-align:right; white-space:nowrap;">${v.custo ? moeda(v.custo) : '—'}</td>
          <td style="text-align:right; white-space:nowrap;">${v.margem == null ? '<span style="color:var(--texto-fraco);">sem custos</span>' : `${moeda(v.margem)}<br><small>${v.margem < 0 ? '<span class="negative">⚠ prejuízo</span> · ' : ''}${pct(v.margem_pct)}</small>`}</td>
          <td><button class="btn btn-secundario" data-pt-custos="${v.id}" style="width:auto; font-size:12px;">${v.custo ? '✏️ Custos' : '⛽ Lançar custos'}</button></td></tr>`).join('')
          || '<tr><td colspan="9" style="text-align:center; color:var(--texto-fraco); padding:20px;">Nenhum MDF-e autorizado no período.</td></tr>'}</tbody></table></div>`;
    document.querySelectorAll('[data-pt-custos]').forEach((b) => b.addEventListener('click', () => lancarCustos(lista.find((v) => String(v.id) === b.dataset.ptCustos))));
  }

  // Janela própria (compacta) para os custos da viagem.
  function janela() {
    let modal = $('modalPainelTransporte');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay oculto'; modal.id = 'modalPainelTransporte';
      modal.innerHTML = '<div class="painel modal-card" style="padding:20px 24px; max-width:760px; width:94%;" id="ptModalConteudo"></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-fat-fechar]')) modal.classList.add('oculto'); });
    }
    return modal;
  }
  function lancarCustos(v) {
    const modal = janela();
    $('ptModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">⛽ Custos da viagem — MDF-e ${v.serie}/${v.numero}</h3><span style="cursor:pointer; font-size:18px;" data-fat-fechar>✕</span></div>
      <p style="font-size:13px; color:var(--texto-fraco);">${esc(v.placa || '')} · ${esc(v.motorista || '')} · ${esc(v.uf_ini)} → ${esc(v.uf_fim)} · receita dos CT-e: <b>${moeda(v.receita)}</b></p>
      <div class="cte-grade">${CUSTOS.map(([k, t]) => `<div class="campo"><label for="ptc_${k}">${t}</label><input type="text" id="ptc_${k}" inputmode="decimal" value="${Number(v.custos?.[k]) ? Number(v.custos[k]).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}" placeholder="0,00" /></div>`).join('')}</div>
      <div id="ptcResultado" style="margin:8px 0; font-size:14px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fat-fechar style="width:auto;">Voltar</button><button class="btn btn-primario" id="ptcSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    const num = (s) => Number(String(s || '').replace(/\./g, '').replace(',', '.')) || 0;
    const ler = () => Object.fromEntries(CUSTOS.map(([k]) => [k, num($(`ptc_${k}`).value)]));
    const mostrar = () => {
      const c = Object.values(ler()).reduce((s, x) => s + x, 0); const mg = v.receita - c;
      $('ptcResultado').innerHTML = `Custos ${moeda(c)} · margem <b>${moeda(mg)}</b>${v.receita > 0 ? ` (${pct((mg / v.receita) * 100)})` : ''}${mg < 0 ? ' <span class="negative">⚠ prejuízo</span>' : ''}`;
    };
    CUSTOS.forEach(([k]) => $(`ptc_${k}`).addEventListener('input', mostrar));
    mostrar();
    $('ptcSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await api(`/viagens/${v.id}/custos`, { method: 'PUT', body: JSON.stringify(ler()) }); modal.classList.add('oculto'); viagens().catch(erro); } catch (err) { erro(err); b.disabled = false; }
    });
  }
})();
