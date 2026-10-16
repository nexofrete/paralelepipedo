// =====================================================================
// Margem por CT-e e por cliente (aba do Painel gerencial): receita − impostos
// − seguro − custo da viagem e da frota rateados = margem, com o
// demonstrativo do período e a lista de clientes abaixo da meta.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, token.
// =====================================================================
(() => {
  const painel = document.getElementById('pt-aba-resultado');
  if (!painel) return;
  const admin = usuario?.perfil === 'admin';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const pct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  const n = (v, c = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const api = async (c, o = {}) => {
    const r = await apiFetch(`/api/painel-transporte${c}`, { ...o, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const corMargem = (p, meta) => (p == null ? '' : p < 0 ? 'color:#ef4444; font-weight:700;' : p < meta ? 'color:#d97706; font-weight:700;' : 'color:#16a34a; font-weight:700;');
  const estado = { dados: null, filtro: 'todos', busca: '', ordem: 'margem', de: '', ate: '' };

  async function carregar(de, ate) {
    estado.de = de; estado.ate = ate;
    painel.innerHTML = '<div class="kanban-vazio">Calculando a margem de cada CT-e…</div>';
    estado.dados = await api(`/resultado?de=${de}&ate=${ate}`);
    desenhar();
  }

  function desenhar() {
    const r = estado.dados; const d = r.demonstrativo; const meta = r.config.meta_margem_pct;
    const linha = (rotulo, valor, { forte = false, menos = false, sub = '' } = {}) => `<tr${forte ? ' style="font-weight:700; border-top:1px solid var(--borda);"' : ''}>
      <td style="white-space:normal;">${rotulo}${sub ? `<br><small style="color:var(--texto-fraco); font-weight:400;">${sub}</small>` : ''}</td><td class="n" style="white-space:nowrap;">${menos && valor ? '− ' : ''}${brl(valor)}</td>
      <td class="n" style="color:var(--texto-fraco);">${d.receita ? pct((valor / d.receita) * 100) : ''}</td></tr>`;
    const avisos = [
      d.sem_custo ? `<b>${d.sem_custo} de ${d.ctes_carga} CT-e sem custo de viagem nem de frota.</b> A margem deles está maior do que a real: lance os custos no MDF-e (aba "Resultado por viagem"), feche o acerto do romaneio ou da transferência, ou registre os abastecimentos e manutenções do caminhão.` : '',
      d.seguro_em_dobro ? `Seguro: a configuração já calcula o seguro da carga em cada documento (${String(r.config?.seguro_pct ?? '').replace('.', ',')}%) e há ${brl(d.seguro_em_dobro)} em contas "Seguro" no período. Se essas contas forem do seguro de carga (e não do veículo), o seguro está contado duas vezes.` : '',
      ...d.duplicidade.map((x) => `Possível custo em dobro: o ${esc(x.viagem)} (${esc(x.placa)}) tem ${brl(x.combustivel)} de combustível lançado à mão, e o caminhão também tem abastecimentos no período. Deixe o combustível em um lugar só.`),
      d.nao_rateado ? `${brl(d.nao_rateado)} de custo sem CT-e para dividir (viagem sem CT-e ou caminhão próprio sem viagem no período): entra no resultado, mas não na margem dos CT-e.` : '',
      !r.config.impostos_pct && admin ? 'Os impostos sobre o faturamento (PIS/COFINS/IR/CSLL) estão em 0%. Peça o percentual ao contador e informe em ⚙ Percentuais.' : '',
      d.demonstracao ? 'Há CT-e de demonstração no período (sem valor fiscal).' : '',
    ].filter(Boolean);
    painel.innerHTML = `<div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        ${admin ? '<button class="btn btn-secundario" id="rsConfig" style="width:auto;">⚙ Percentuais e meta</button>' : ''}
        <a class="btn btn-secundario" href="/api/painel-transporte/resultado.csv?de=${estado.de}&ate=${estado.ate}&token=${encodeURIComponent(token)}" style="width:auto; text-decoration:none;">⬇ Planilha (Excel)</a></div>
      <div class="oc-resumo">
        <div>Receita do frete<b>${brl(d.receita)}</b><span>${d.documentos} documento(s)</span></div>
        <div>Margem de contribuição<b style="${corMargem(d.margem_contribuicao_pct, meta)}">${brl(d.margem_contribuicao)}</b><span>${pct(d.margem_contribuicao_pct)} da receita · meta ${pct(meta)}</span></div>
        <div>Resultado do período<b style="${corMargem(d.resultado_pct, 0)}">${brl(d.resultado)}</b><span>${pct(d.resultado_pct)} depois das despesas da empresa</span></div>
        <div>Clientes abaixo da meta<b style="${r.clientes.some((c) => c.abaixo_meta) ? 'color:#d97706;' : ''}">${r.clientes.filter((c) => c.abaixo_meta).length}</b><span>de ${r.clientes.length} cliente(s)</span></div>
      </div>
      ${avisos.length ? `<div class="cte-aviso" style="margin-bottom:12px;"><ul style="margin:0; padding-left:18px; line-height:1.6;">${avisos.map((a) => `<li>${a}</li>`).join('')}</ul></div>` : ''}
      <div style="display:grid; grid-template-columns:minmax(340px, 470px) minmax(0, 1fr); gap:14px; align-items:start;" class="rs-grade">
        <div class="painel" style="padding:14px 18px; min-width:0;"><h4 style="margin:0 0 8px;">Demonstrativo do período</h4><table class="edi-tabela" style="width:100%;"><tbody>
          ${linha('Receita do frete (CT-e + NFS-e)', d.receita, { forte: true })}
          ${linha('ICMS', d.icms, { menos: true })}${d.iss ? linha('ISS (NFS-e)', d.iss, { menos: true }) : ''}
          ${linha('Outros impostos', d.outros_impostos, { menos: true, sub: `${pct(r.config.impostos_pct)} sobre a receita` })}
          ${d.seguro ? linha('Seguro da carga', d.seguro, { menos: true, sub: `${pct(r.config.seguro_pct)} do valor da mercadoria` }) : ''}
          ${d.comissao ? linha('Comissão de vendedores', d.comissao, { menos: true, sub: 'percentual de cada vendedor/cliente sobre a receita (Comissões)' }) : ''}
          ${linha('Custos das viagens', d.viagem, { menos: true, sub: 'MDF-e, romaneios e transferências, divididos pelo peso' })}
          ${linha('Frota própria', d.frota, { menos: true, sub: 'combustível e manutenção do período, pelo peso que cada caminhão levou' })}
          ${linha('= Margem de contribuição', d.margem_contribuicao, { forte: true })}
          ${d.nao_rateado ? linha('Custos sem CT-e para dividir', d.nao_rateado, { menos: true }) : ''}
          ${linha('Despesas da empresa', d.despesas, { menos: true, sub: Object.keys(d.despesas_detalhe).length ? Object.entries(d.despesas_detalhe).map(([k, v]) => `${k}: ${brl(v)}`).join(' · ') : 'salários, aluguel, administrativo, seguro e outros (Contas a pagar)' })}
          ${linha('= Resultado', d.resultado, { forte: true })}</tbody></table></div>
        <div class="painel oc-painel" style="padding:14px 18px; min-width:0;"><div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;"><h4 style="margin:0;">Por cliente (quem paga o frete)</h4>
          <select id="rsOrdem" class="cte-entrada" style="width:auto;"><option value="margem">Maior margem em R$</option><option value="pct" ${estado.ordem === 'pct' ? 'selected' : ''}>Menor margem %</option><option value="receita" ${estado.ordem === 'receita' ? 'selected' : ''}>Maior receita</option></select></div>
          <div class="edi-rolagem" style="max-height:440px;"><table class="edi-tabela"><thead><tr><th>Cliente</th><th class="n">Docs</th><th class="n">Receita</th><th class="n" title="Impostos + seguro + viagem + frota">Custos</th><th class="n">Margem</th><th class="n">%</th><th class="n">Frete/kg</th></tr></thead><tbody>
          ${ordenar(r.clientes).map((c) => `<tr data-rs-cliente="${esc(c.doc)}" style="cursor:pointer;" title="Ver os CT-e deste cliente"><td style="white-space:normal; min-width:180px;"><b>${esc(c.nome)}</b><br><small style="color:var(--texto-fraco);">${esc(docFmt(c.doc))}${c.sem_custo ? ` · ${c.sem_custo} sem custo` : ''}</small></td>
            <td class="n">${c.documentos}</td><td class="n">${brl(c.receita)}</td><td class="n" title="Impostos ${brl(c.impostos)} · viagem ${brl(c.viagem)} · frota ${brl(c.frota)}${c.seguro ? ` · seguro ${brl(c.seguro)}` : ''}${c.comissao ? ` · comissão ${brl(c.comissao)}` : ''}">${brl(c.custo)}</td>
            <td class="n" style="${corMargem(c.margem_pct, meta)}">${brl(c.margem)}</td><td class="n" style="${corMargem(c.margem_pct, meta)}">${pct(c.margem_pct)}</td>
            <td class="n">${c.frete_kg != null ? `${brl(c.frete_kg)}` : '—'}${c.custo_kg != null ? `<br><small style="color:var(--texto-fraco);">custo ${brl(c.custo_kg)}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center; color:var(--texto-fraco);">Nada no período.</td></tr>'}</tbody></table></div></div>
      </div>
      <div class="painel oc-painel" style="margin-top:14px; padding:14px 18px;">
        <div class="oc-barra" style="flex-wrap:wrap; gap:8px;"><h4 style="margin:0;">Margem de cada documento</h4><span style="flex:1;"></span>
          <div class="oc-filtros" id="rsFiltros">${[['todos', 'Todos'], ['negativa', 'Margem negativa'], ['meta', 'Abaixo da meta'], ['sem_custo', 'Sem custo lançado']]
            .map(([k, t]) => `<button class="oc-filtro ${estado.filtro === k ? 'ativo' : ''}" data-rs-filtro="${k}">${t}</button>`).join('')}</div>
          <div class="oc-busca"><input id="rsBusca" class="cte-entrada" placeholder="Cliente, CT-e ou destino" value="${esc(estado.busca)}" /></div></div>
        <div class="edi-rolagem" id="rsDocs"></div></div>`;
    tabelaDocs();
    $('rsOrdem').addEventListener('change', () => { estado.ordem = $('rsOrdem').value; desenhar(); });
    $('rsFiltros').addEventListener('click', (e) => { const b = e.target.closest('[data-rs-filtro]'); if (!b) return; estado.filtro = b.dataset.rsFiltro; $('rsFiltros').querySelectorAll('[data-rs-filtro]').forEach((x) => x.classList.toggle('ativo', x === b)); tabelaDocs(); });
    let t = null;
    $('rsBusca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estado.busca = $('rsBusca').value; tabelaDocs(); }, 250); });
    painel.querySelectorAll('[data-rs-cliente]').forEach((tr) => tr.addEventListener('click', () => {
      const c = estado.dados.clientes.find((x) => x.doc === tr.dataset.rsCliente);
      estado.busca = c?.nome || ''; $('rsBusca').value = estado.busca; tabelaDocs(); $('rsDocs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    $('rsConfig')?.addEventListener('click', configurar);
  }

  function ordenar(lista) {
    const l = [...lista];
    if (estado.ordem === 'pct') return l.sort((a, b) => (a.margem_pct ?? 999) - (b.margem_pct ?? 999));
    if (estado.ordem === 'receita') return l.sort((a, b) => b.receita - a.receita);
    return l.sort((a, b) => b.margem - a.margem);
  }

  function tabelaDocs() {
    const r = estado.dados; const meta = r.config.meta_margem_pct;
    const b = estado.busca.trim().toLowerCase();
    const lista = r.documentos.filter((x) => (estado.filtro === 'negativa' ? x.margem < 0 : estado.filtro === 'meta' ? x.margem_pct != null && x.margem_pct < meta : estado.filtro === 'sem_custo' ? x.sem_custo_operacional : true)
      && (!b || [x.tomador_nome, x.documento, x.destino, x.tomador_doc].some((v) => String(v || '').toLowerCase().includes(b))));
    $('rsDocs').innerHTML = lista.length ? `<table class="edi-tabela"><thead><tr><th>Data</th><th>Documento</th><th>Cliente</th><th>Destino</th><th class="n">Peso</th><th class="n">Receita</th>
      <th class="n">Impostos</th><th class="n">Viagem</th><th class="n">Frota</th><th class="n">Margem</th><th class="n">%</th></tr></thead><tbody>
      ${lista.slice(0, 500).map((x) => `<tr><td>${dia(x.data)}</td><td><b>${esc(x.documento)}</b>${x.complementar ? ' <small>(compl.)</small>' : ''}${x.viagens.length ? `<br><small style="color:var(--texto-fraco);">${esc(x.viagens.join(', '))}</small>` : ''}${x.sem_custo_operacional ? '<br><small style="color:#d97706;">sem custo lançado</small>' : ''}</td>
        <td>${esc(x.tomador_nome)}</td><td><small>${esc(x.destino || '')}</small></td><td class="n">${x.peso ? `${n(x.peso)} kg` : '—'}</td><td class="n">${brl(x.receita)}</td>
        <td class="n">${brl(x.impostos)}</td><td class="n">${x.viagem ? brl(x.viagem) : '—'}</td><td class="n">${x.frota ? brl(x.frota) : '—'}</td>
        <td class="n" style="${corMargem(x.margem_pct, meta)}">${brl(x.margem)}</td><td class="n" style="${corMargem(x.margem_pct, meta)}">${pct(x.margem_pct)}</td></tr>`).join('')}</tbody></table>
      ${lista.length > 500 ? `<p style="font-size:12px; color:var(--texto-fraco);">Mostrando 500 de ${lista.length}. A planilha traz todos.</p>` : ''}`
      : '<div class="kanban-vazio">Nenhum documento neste filtro.</div>';
  }

  async function configurar() {
    const c = await api('/resultado/config');
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="painel modal-card" style="max-width:520px; width:100%; padding:22px 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">⚙ Percentuais do resultado</h3><span style="cursor:pointer; font-size:18px;" data-rs-fechar>✕</span></div>
      <div class="cte-grade" style="margin-top:12px;">
        <div class="campo"><label for="rsImp">Impostos sobre o faturamento (%)</label><input id="rsImp" class="cte-entrada" inputmode="decimal" value="${esc(String(c.impostos_pct).replace('.', ','))}" /></div>
        <div class="campo"><label for="rsSeg">Seguro da carga (% da mercadoria)</label><input id="rsSeg" class="cte-entrada" inputmode="decimal" value="${esc(String(c.seguro_pct).replace('.', ','))}" /></div>
        <div class="campo"><label for="rsMeta">Meta de margem (%)</label><input id="rsMeta" class="cte-entrada" inputmode="decimal" value="${esc(String(c.meta_margem_pct).replace('.', ','))}" /></div></div>
      <p style="font-size:12.5px; color:var(--texto-fraco);">Impostos: PIS, COFINS, IRPJ e CSLL somados (o contador informa; no Simples Nacional, a alíquota efetiva do DAS sem o ICMS). O ICMS de cada CT-e e o ISS da NFS-e já entram pelo valor do documento.
        Seguro: o custo da averbação (RCTR-C/RCF-DC) sobre o valor da mercadoria — deixe 0 se ele já entra em Contas a pagar como "Seguro".</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-rs-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="rsSalvar" style="width:auto;">Salvar</button></div></div>`;
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-rs-fechar]')) fechar(); });
    $('rsSalvar').addEventListener('click', async () => {
      try {
        await api('/resultado/config', { method: 'PUT', body: JSON.stringify({ impostos_pct: $('rsImp').value, seguro_pct: $('rsSeg').value, meta_margem_pct: $('rsMeta').value }) });
        fechar(); await carregar(estado.de, estado.ate); mostrarAlerta('Percentuais salvos.', { tipo: 'sucesso' });
      } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
  }

  window.nexoResultado = { carregar };
})();
