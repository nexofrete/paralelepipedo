// =====================================================================
// Relatórios » 💸 Cobranças indevidas: no período, o que as transportadoras
// cobraram a mais por componente (frete peso, ad valorem, GRIS, pedágio, TDE,
// TDA, TRT, despacho, descarga), as taxas que a tabela não prevê e os
// apontamentos de peso, volumes e ICMS; por transportadora e mês, com Excel.
// Usa do dashboard.js: apiFetch, mostrarAlerta, abrirDetalheFrete (se houver);
// do indicadores.js: exportarExcel.
// =====================================================================
(() => {
  const cont = document.getElementById('subabaCobIndevidas');
  if (!cont) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const mesBr = (m) => (m ? `${m.slice(5)}/${m.slice(0, 4)}` : '—');
  const TIPOS = { COMPONENTE_A_MAIS: 'Componente a mais', TAXA_NAO_PREVISTA: 'Taxa não prevista', PESO: 'Peso diferente', VOLUMES: 'Volumes diferentes', ICMS_BASE: 'Base do ICMS', ICMS_VALOR: 'Valor do ICMS', ICMS_ALIQUOTA: 'Alíquota do ICMS', CFOP: 'CFOP' };
  let dados = null;
  function montar() {
    cont.innerHTML = `<div class="painel"><div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <div><h3 style="margin:0; font-size:14px;">💸 Cobranças indevidas</h3><p style="font-size:11.5px; color:var(--texto-fraco); margin:2px 0 0;">Cada CT-e conferido componente por componente com a tabela de preço (pela emissão do CT-e).</p></div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">${Periodo.html('ci')}<input type="text" id="ciTransp" class="cte-entrada" placeholder="Transportadora" style="width:180px;" />
          <button class="btn btn-secundario" id="ciExcel" style="width:auto;">⬇ Excel</button></div></div>
      <div id="ciCorpo" style="margin-top:12px;"><div style="color:var(--texto-fraco);">Carregando…</div></div></div>`;
    Periodo.ligar({ select: $('ciPer'), de: $('ciDe'), ate: $('ciAte'), chave: 'cobrancas-indevidas', padrao: '3m', aoMudar: () => carregar() });
    let t = null;
    $('ciTransp').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => carregar(), 400); });
    $('ciExcel').addEventListener('click', excel);
  }
  async function carregar() {
    if (!$('ciCorpo')) montar();
    const q = new URLSearchParams({ de: $('ciDe').value || '2000-01-01', ate: $('ciAte').value || '', transportadora: $('ciTransp').value.trim() });
    const r = await apiFetch(`/api/fretes/relatorios/cobrancas-indevidas?${q}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('ciCorpo').innerHTML = `<div style="color:var(--vermelho);">${esc(j.erro || 'Erro.')}</div>`; return; }
    dados = j; desenhar();
  }
  window.carregarCobIndevidas = () => carregar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
  const tabela = (cab, linhas) => `<table style="width:100%; font-size:12.5px;"><thead><tr>${cab.map((c, i) => `<th style="text-align:${i ? 'right' : 'left'};">${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table>`;
  function desenhar() {
    const d = dados;
    $('ciCorpo').innerHTML = `<div class="oc-resumo"><div>Cobrado a mais<b style="color:${d.total_a_mais ? 'var(--vermelho)' : 'inherit'};">${moeda(d.total_a_mais)}</b><span>componentes acima da tabela e taxas não previstas</span></div>
        <div>CT-e com apontamento<b>${d.com_apontamento}</b><span>de ${d.analisados} conferidos</span></div>
        ${Object.entries(TIPOS).filter(([k]) => d.por_tipo[k]).map(([k, t]) => `<div>${t}<b>${d.por_tipo[k]}</b><span>CT-e</span></div>`).join('')}</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(380px, 1fr)); gap:12px; margin:12px 0; align-items:start;">
        <div class="painel" style="padding:10px 12px;"><b>Por componente</b>${d.por_componente.length ? tabela(['Componente', 'CT-e', 'Cobrado a mais'], d.por_componente.map((c) => `<tr><td>${esc(c.nome)}</td><td style="text-align:right;">${c.qtd}</td><td style="text-align:right; color:var(--vermelho);">${moeda(c.valor)}</td></tr>`)) : '<p style="color:var(--texto-fraco);">Nada cobrado a mais.</p>'}</div>
        <div class="painel" style="padding:10px 12px;"><b>Por transportadora</b>${d.por_transportadora.length ? tabela(['Transportadora', 'CT-e', 'Apontamentos', 'Cobrado a mais'], d.por_transportadora.map((c) => `<tr><td>${esc(c.chave)}</td><td style="text-align:right;">${c.ctes}</td><td style="text-align:right;">${c.apontamentos}</td><td style="text-align:right; color:var(--vermelho);">${moeda(c.valor)}</td></tr>`)) : '<p style="color:var(--texto-fraco);">—</p>'}</div>
        <div class="painel" style="padding:10px 12px;"><b>Por mês</b>${d.por_mes.length ? tabela(['Mês', 'CT-e', 'Cobrado a mais'], d.por_mes.map((c) => `<tr><td>${mesBr(c.chave)}</td><td style="text-align:right;">${c.ctes}</td><td style="text-align:right; color:var(--vermelho);">${moeda(c.valor)}</td></tr>`)) : '<p style="color:var(--texto-fraco);">—</p>'}</div></div>
      ${d.itens.length ? `<div style="overflow-x:auto;"><table style="width:100%;"><thead><tr><th>CT-e</th><th>NF</th><th>Transportadora</th><th>Emissão</th><th style="text-align:right;">CT-e</th><th style="text-align:right;">Tabela</th><th style="text-align:right;">A mais</th><th>Apontamentos</th><th>Status</th></tr></thead><tbody>
        ${d.itens.slice(0, 1500).map((i) => `<tr><td><b>${esc(i.numero_cte)}</b></td><td>${esc(i.numero_nf || '—')}</td><td>${esc(i.transportadora)}</td><td>${dia(i.data)}</td><td style="text-align:right;">${moeda(i.valor_cte)}</td><td style="text-align:right;">${moeda(i.valor_tabela)}</td>
          <td style="text-align:right; color:${i.a_mais > 0 ? 'var(--vermelho)' : 'inherit'}; font-weight:700;">${i.a_mais > 0 ? moeda(i.a_mais) : '—'}</td><td style="max-width:420px;">${i.apontamentos.map((p) => `<span class="badge badge-retido" style="display:inline-block; margin:2px; white-space:normal; text-align:left;">${esc(p.texto)}</span>`).join('')}</td><td><small>${esc(i.status || '')}</small></td></tr>`).join('')}</tbody></table></div>`
    : '<div style="padding:20px; text-align:center; color:var(--texto-fraco);">Nenhuma cobrança indevida no período. 👍</div>'}
      <p style="font-size:11.5px; color:var(--texto-fraco); margin-top:8px;">Cobrado a mais = a soma dos componentes do CT-e acima da tabela (fora da tolerância da auditoria) e das taxas que a tabela não prevê, até o quanto o total do CT-e passa do total da tabela: quando o total confere e só a divisão entre as parcelas está diferente ("parcelas trocadas"), aparece o apontamento mas não conta como cobrado a mais. CT-e sem componentes detalhados é conferido só pelo total, na Auditoria de Frete.</p>`;
  }
  function excel() {
    if (!dados) return;
    const d = dados;
    window.exportarExcel(`cobrancas-indevidas-${d.de}-a-${d.ate}`, [
      { nome: 'CT-e', colunas: ['CT-e', 'NF', 'Cliente', 'Transportadora', 'Emissão', 'Valor CT-e', 'Valor tabela', 'Cobrado a mais', 'Apontamentos', 'Status'],
        linhas: d.itens.map((i) => [i.numero_cte, i.numero_nf || '', i.cliente || '', i.transportadora, dia(i.data), i.valor_cte, i.valor_tabela, i.a_mais, i.apontamentos.map((p) => p.texto).join(' | '), i.status || '']) },
      { nome: 'Por componente', colunas: ['Componente', 'CT-e', 'Cobrado a mais'], linhas: d.por_componente.map((c) => [c.nome, c.qtd, c.valor]) },
      { nome: 'Por transportadora', colunas: ['Transportadora', 'CT-e', 'Apontamentos', 'Cobrado a mais'], linhas: d.por_transportadora.map((c) => [c.chave, c.ctes, c.apontamentos, c.valor]) },
      { nome: 'Por mês', colunas: ['Mês', 'CT-e', 'Cobrado a mais'], linhas: d.por_mes.map((c) => [mesBr(c.chave), c.ctes, c.valor]) },
    ]).catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
  }
})();
