// Reajuste de tabelas de preço em lote (Cadastros » Tabelas de preço » 📈 Reajuste em lote).
// Filtra as tabelas, mostra a prévia (antes → depois), aplica agora ou agenda para a data de
// vigência, e guarda o histórico com "Desfazer" / "Cancelar".
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
  const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const num = (v, casas = 2) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  const pctTxt = (p) => `${Number(p) > 0 ? '+' : ''}${String(Number(p)).replace('.', ',')}%`;
  const STATUS = { agendado: ['🕒 Agendado', 'badge-pendente'], aplicado: ['✓ Aplicado', 'badge-faturado'], desfeito: ['↩ Desfeito', 'badge-cancelado'], cancelado: ['✕ Cancelado', 'badge-cancelado'] };
  const NOMES_CAMPOS = { frete: 'frete peso', minimos: 'mínimos', taxas: 'taxas em R$', percentuais: 'ad valorem/GRIS %' };

  function botao() {
    const ref = $('btnImprimirTabelasPreco');
    if (!ref || $('btnReajusteTabelas')) return;
    const b = document.createElement('button');
    b.id = 'btnReajusteTabelas'; b.className = 'btn btn-secundario'; b.style.width = 'auto';
    b.title = 'Aplicar um % de reajuste (ou desconto) em várias tabelas de uma vez, agora ou numa data';
    b.textContent = '📈 Reajuste em lote';
    b.addEventListener('click', abrir);
    ref.parentNode.insertBefore(b, ref);
  }

  function abrir() {
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.id = 'modalReajuste';
    const opcoesTransp = $('filtroTransportadoraTabela')?.innerHTML || '<option value="">Todas as transportadoras</option>';
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:1080px; width:100%; max-height:92vh; overflow-y:auto; padding:22px 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">📈 Reajuste de tabelas em lote</h3><span style="cursor:pointer; font-size:18px;" title="Fechar (Esc)" data-rj-fechar>✕</span></div>
      <div style="display:flex; gap:6px; margin:12px 0;">
        <button class="btn btn-primario" data-rj-aba="novo" style="width:auto;">Novo reajuste</button>
        <button class="btn btn-secundario" data-rj-aba="historico" style="width:auto;">Histórico</button></div>
      <div id="rjNovo">
        <p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 10px;">Escolha quais tabelas, o percentual e a data. Antes de mudar, o sistema guarda como cada tabela estava (Histórico da tabela) e dá para desfazer o reajuste inteiro.</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
          <div class="campo"><label for="rjTransp">Transportadora</label><select id="rjTransp">${opcoesTransp}</select></div>
          <div class="campo"><label for="rjTipo">Tabelas</label><select id="rjTipo"><option value="">Gerais e de clientes</option><option value="gerais">Só as gerais</option><option value="clientes">Só as de clientes ⭐</option></select></div>
          <div class="campo" style="position:relative;"><label for="rjClienteNome">Só de um cliente (opcional)</label><input id="rjClienteNome" placeholder="Nome ou CNPJ do cliente" autocomplete="off" />
            <input type="hidden" id="rjClienteDoc" />
            <div id="rjClienteSug" class="oculto" style="position:absolute; z-index:20; left:0; right:0; top:100%; background:var(--bg-card); border:1px solid var(--borda); border-radius:8px; max-height:220px; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.25);"></div></div>
          <div class="campo"><label for="rjUf">UF de destino (opcional)</label><input id="rjUf" maxlength="2" placeholder="Ex.: SP" style="text-transform:uppercase;" /></div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
          <div class="campo"><label for="rjPct">Reajuste em % (− para desconto)</label><input id="rjPct" inputmode="decimal" placeholder="Ex.: 6,5 ou -3" /></div>
          <div class="campo"><label for="rjIndice">Índice / motivo (opcional)</label><input id="rjIndice" maxlength="80" list="rjIndices" placeholder="Ex.: IPCA 12 meses" />
            <datalist id="rjIndices"><option value="IPCA 12 meses"><option value="IGP-M 12 meses"><option value="INPC 12 meses"><option value="INCT-F (NTC)"><option value="Diesel"><option value="Reajuste anual do contrato"><option value="Negociação comercial"></datalist></div>
          <div class="campo"><label for="rjVigencia">Vale a partir de</label><input type="date" id="rjVigencia" value="${hoje()}" min="${hoje()}" /></div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px 18px; font-size:13px; margin:2px 0 8px;">
          <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="rjFrete" checked style="width:auto;" /> Frete peso (R$/kg dos trechos e excedente)</label>
          <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="rjMinimos" checked style="width:auto;" /> Fretes mínimos</label>
          <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="rjTaxas" checked style="width:auto;" /> Taxas em R$ (pedágio, TDE, TDA, TRT, despacho, GRIS mínimo, pallet, descarga)</label>
          <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="rjPercentuais" style="width:auto;" /> Ad valorem e GRIS em %</label>
          <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="rjRenovar" checked style="width:auto;" /> Renovar a validade (conta de novo a partir da data)</label>
          <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="rjInativas" style="width:auto;" /> Incluir tabelas inativas</label>
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end;"><button class="btn btn-secundario" id="rjVerPrevia" style="width:auto;">Ver prévia</button></div>
        <div id="rjPrevia" style="margin-top:12px;"></div>
      </div>
      <div id="rjHistorico" class="oculto"></div>
    </div>`;
    document.body.appendChild(fundo);
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc_);
    fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
    fundo.addEventListener('click', (e) => { if (e.target.closest('[data-rj-fechar]')) fechar(); });
    $('rjTransp').value = $('filtroTransportadoraTabela')?.value || '';
    $('rjTipo').value = $('filtroTipoTabela')?.value || '';
    if (typeof ligarBuscaClienteTabela === 'function') ligarBuscaClienteTabela($('rjClienteNome'), $('rjClienteDoc'), $('rjClienteSug'));
    $('rjClienteNome').addEventListener('input', () => { if (!$('rjClienteNome').value.trim()) $('rjClienteDoc').value = ''; });
    fundo.querySelectorAll('[data-rj-aba]').forEach((b) => b.addEventListener('click', () => {
      fundo.querySelectorAll('[data-rj-aba]').forEach((x) => { x.className = `btn ${x === b ? 'btn-primario' : 'btn-secundario'}`; });
      $('rjNovo').classList.toggle('oculto', b.dataset.rjAba !== 'novo');
      $('rjHistorico').classList.toggle('oculto', b.dataset.rjAba !== 'historico');
      if (b.dataset.rjAba === 'historico') historico();
    }));
    // Mudou o filtro ou os valores: a prévia velha não vale mais.
    fundo.querySelectorAll('#rjNovo input, #rjNovo select').forEach((el) => el.addEventListener('change', () => { if ($('rjPrevia').innerHTML) $('rjPrevia').innerHTML = '<p style="font-size:12.5px; color:var(--texto-fraco);">Os dados mudaram: clique em <b>Ver prévia</b> de novo.</p>'; }));
    $('rjVerPrevia').addEventListener('click', () => previa().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })));
    $('rjPct').focus();
  }

  function parametros() {
    return {
      percentual: $('rjPct').value,
      indice: $('rjIndice').value,
      vigencia: $('rjVigencia').value,
      renovar_validade: $('rjRenovar').checked,
      campos: { frete: $('rjFrete').checked, minimos: $('rjMinimos').checked, taxas: $('rjTaxas').checked, percentuais: $('rjPercentuais').checked },
      filtros: { transportadora_id: $('rjTransp').value, tipo: $('rjTipo').value, cliente_doc: $('rjClienteDoc').value, uf: $('rjUf').value, incluir_inativas: $('rjInativas').checked },
    };
  }

  async function previa() {
    const corpo = parametros();
    const r = await apiFetch('/api/tabelas-preco/reajustes/previa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || 'Erro ao montar a prévia.');
    if (!d.tabelas.length) { $('rjPrevia').innerHTML = '<p style="color:var(--texto-fraco);">Nenhuma tabela de preço com esse filtro.</p>'; return; }
    const par = (x, casas, sufixo = '') => (x ? (x.antes === x.depois ? `${num(x.antes, casas)}${sufixo}` : `${num(x.antes, casas)}${sufixo} → <b>${num(x.depois, casas)}${sufixo}</b>`) : '—');
    const agora = d.vigencia <= hoje();
    $('rjPrevia').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px;">
        <b>${pctTxt(d.percentual)} em <span id="rjQtd">${d.tabelas.length}</span> tabela(s) · ${agora ? 'aplica agora' : `vale a partir de ${dataBr(d.vigencia)}`}</b>
        <small style="color:var(--texto-fraco);">Reajusta: ${Object.entries(d.campos).filter(([, v]) => v).map(([k]) => NOMES_CAMPOS[k]).join(', ')}. Desmarque as tabelas que ficam de fora.</small></div>
      <div style="overflow:auto; max-height:46vh; border:1px solid var(--borda); border-radius:8px;">
      <table class="edi-tabela" style="font-size:12.5px; width:100%;"><thead><tr>
        <th style="width:30px;"><input type="checkbox" id="rjTodas" checked style="width:auto;" title="Marcar / desmarcar todas" /></th><th style="text-align:left;">Tabela</th><th style="text-align:left;">Transportadora</th><th>UF</th><th>Trechos</th>
        <th>1º trecho R$/kg</th><th>Frete mínimo R$</th><th>Pedágio R$</th><th>Ad valorem</th></tr></thead>
      <tbody>${d.tabelas.map((t) => `<tr>
        <td><input type="checkbox" data-rj-tab="${t.id}" checked style="width:auto;" /></td>
        <td>${esc(t.nome)}${t.cliente ? `<br><span class="badge badge-pendente">⭐ ${esc(t.cliente)}</span>` : ''}${t.ativa ? '' : ' <span class="badge badge-cancelado">Inativa</span>'}</td>
        <td>${esc(t.transportadora)}</td><td style="text-align:center;">${esc(t.uf || 'Todas')}</td><td style="text-align:center;">${t.trechos}</td>
        <td style="text-align:right;">${par(t.kg, 4)}</td><td style="text-align:right;">${par(t.minimo, 2)}</td><td style="text-align:right;">${par(t.pedagio, 2)}</td><td style="text-align:right;">${par(t.ad_valorem, 3, '%')}</td></tr>`).join('')}</tbody></table></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
        <button class="btn btn-primario" id="rjAplicar" style="width:auto;">${agora ? 'Aplicar reajuste agora' : `Agendar para ${dataBr(d.vigencia)}`}</button></div>`;
    const marcadas = () => [...document.querySelectorAll('[data-rj-tab]')];
    const contar = () => { $('rjQtd').textContent = marcadas().filter((c) => c.checked).length; };
    $('rjTodas').addEventListener('change', () => { marcadas().forEach((c) => { c.checked = $('rjTodas').checked; }); contar(); });
    marcadas().forEach((c) => c.addEventListener('change', contar));
    $('rjAplicar').addEventListener('click', async () => {
      const excluir = marcadas().filter((c) => !c.checked).map((c) => Number(c.dataset.rjTab));
      const qtd = marcadas().length - excluir.length;
      if (!qtd) { mostrarAlerta('Marque pelo menos uma tabela.', { tipo: 'aviso' }); return; }
      const texto = agora ? `Aplicar ${pctTxt(d.percentual)} em ${qtd} tabela(s) agora?\n\nO cálculo dos próximos fretes já usa o preço novo. Dá para desfazer no Histórico.`
        : `Agendar ${pctTxt(d.percentual)} em ${qtd} tabela(s) para ${dataBr(d.vigencia)}?\n\nAté lá vale o preço atual. Dá para cancelar no Histórico.`;
      if (!window.confirm(texto)) return;
      $('rjAplicar').disabled = true;
      try {
        const r2 = await apiFetch('/api/tabelas-preco/reajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, excluir }) });
        const j = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j.erro || 'Erro ao aplicar o reajuste.');
        mostrarAlerta(j.status === 'aplicado' ? `Reajuste aplicado em ${j.aplicadas} tabela(s).` : `Reajuste agendado: ${j.previstas} tabela(s) a partir de ${dataBr(j.vigencia)}.`, { tipo: 'sucesso' });
        $('rjPrevia').innerHTML = '';
        if (typeof carregarTabelasPreco === 'function') carregarTabelasPreco();
        document.querySelector('[data-rj-aba="historico"]')?.click();
      } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); $('rjAplicar').disabled = false; }
    });
  }

  async function historico() {
    const caixa = $('rjHistorico');
    caixa.innerHTML = '<p style="color:var(--texto-fraco);">Carregando…</p>';
    const r = await apiFetch('/api/tabelas-preco/reajustes');
    const lista = await r.json().catch(() => []);
    if (!r.ok) { caixa.innerHTML = `<p class="mensagem-erro visivel">${esc(lista.erro || 'Erro ao carregar o histórico.')}</p>`; return; }
    if (!lista.length) { caixa.innerHTML = '<p style="color:var(--texto-fraco);">Nenhum reajuste em lote ainda.</p>'; return; }
    const alcance = (x) => {
      const f = x.filtros || {};
      return [x.transportadora_nome || 'Todas as transportadoras', f.tipo === 'gerais' ? 'só gerais' : f.tipo === 'clientes' ? 'só de clientes' : '', f.cliente_doc ? `cliente ${f.cliente_doc}` : '', f.uf ? `UF ${f.uf}` : ''].filter(Boolean).join(' · ');
    };
    caixa.innerHTML = `<div style="overflow:auto;"><table class="edi-tabela" style="font-size:12.5px; width:100%;"><thead><tr>
      <th>#</th><th>Reajuste</th><th style="text-align:left;">Alcance</th><th>Vale a partir de</th><th>Tabelas</th><th>Situação</th><th style="text-align:left;">Quem</th><th></th></tr></thead><tbody>
      ${lista.map((x) => { const [st, cls] = STATUS[x.status] || [x.status, '']; return `<tr>
        <td>${x.id}</td>
        <td style="text-align:center;"><b>${pctTxt(x.percentual)}</b>${x.indice ? `<br><small>${esc(x.indice)}</small>` : ''}</td>
        <td>${esc(alcance(x))}<br><small style="color:var(--texto-fraco);">${Object.entries(x.campos || {}).filter(([, v]) => v).map(([k]) => NOMES_CAMPOS[k]).join(', ')}${x.renovar_validade ? ' · renova a validade' : ''}</small></td>
        <td style="text-align:center;">${dataBr(x.vigencia)}</td>
        <td style="text-align:center;">${x.status === 'agendado' ? `${x.previstas} previstas` : x.aplicadas}</td>
        <td style="text-align:center;"><span class="badge ${cls}">${st}</span>${x.desfeito_por ? `<br><small>${esc(x.desfeito_por)}</small>` : ''}</td>
        <td>${esc(x.usuario_nome || '')}<br><small style="color:var(--texto-fraco);">${new Date(x.criado_em).toLocaleString('pt-BR')}</small></td>
        <td>${x.status === 'aplicado' ? `<button class="btn btn-secundario" data-rj-desfazer="${x.id}" style="width:auto; padding:4px 10px;">↩ Desfazer</button>` : ''}
            ${x.status === 'agendado' ? `<button class="btn btn-secundario" data-rj-cancelar="${x.id}" style="width:auto; padding:4px 10px;">✕ Cancelar</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    caixa.querySelectorAll('[data-rj-desfazer]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm(`Desfazer o reajuste #${b.dataset.rjDesfazer}? As tabelas voltam aos valores de antes (as que foram editadas depois ficam como estão).`)) return;
      const r2 = await apiFetch(`/api/tabelas-preco/reajustes/${b.dataset.rjDesfazer}/desfazer`, { method: 'POST' });
      const j = await r2.json().catch(() => ({}));
      if (!r2.ok) { mostrarAlerta(j.erro || 'Erro ao desfazer.', { tipo: 'erro' }); return; }
      mostrarAlerta(`${j.voltaram} tabela(s) voltaram aos valores de antes.${j.puladas?.length ? ` Editadas depois do reajuste (confira à mão): ${j.puladas.join(', ')}.` : ''}`, { tipo: j.puladas?.length ? 'aviso' : 'sucesso' });
      if (typeof carregarTabelasPreco === 'function') carregarTabelasPreco();
      historico();
    }));
    caixa.querySelectorAll('[data-rj-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm(`Cancelar o reajuste agendado #${b.dataset.rjCancelar}?`)) return;
      const r2 = await apiFetch(`/api/tabelas-preco/reajustes/${b.dataset.rjCancelar}`, { method: 'DELETE' });
      const j = await r2.json().catch(() => ({}));
      if (!r2.ok) { mostrarAlerta(j.erro || 'Erro ao cancelar.', { tipo: 'erro' }); return; }
      mostrarAlerta('Reajuste agendado cancelado.', { tipo: 'sucesso' });
      historico();
    }));
  }

  botao();
})();
