// =====================================================================
// Faturamento e contas a receber (transportadora): resumo, faturas,
// CT-e a faturar e configuração da cobrança (PIX e banco).
// Usa do dashboard.js: usuario, token, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navFaturamento');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isNaN(n) ? null : n; };
  const iso = (v) => String(v instanceof Date ? v.toISOString() : v || '').slice(0, 10);
  const dia = (v) => (v ? new Date(`${iso(v)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
  const hojeIso = (dias = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const docFmt = (v) => { const d = String(v || ''); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; };
  const STATUS = { aberta: ['Em aberto', 'badge-cte-enviando'], parcial: ['Recebida em parte', 'badge-cte-rascunho'], paga: ['Paga', 'badge-cte-autorizado'], cancelada: ['Cancelada', 'badge-cte-cancelado'] };
  const FORMAS = { pix: 'PIX', boleto: 'Boleto', deposito: 'Depósito/TED', dinheiro: 'Dinheiro', cheque: 'Cheque', outro: 'Outro' };
  const modal = $('modalFatura');
  const fechar = () => modal.classList.add('oculto');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = (caminho, opcoes = {}) => apiFetch(`/api/faturamento${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) } })
    .then(async (r) => { const c = await r.json().catch(() => ({})); if (!r.ok) throw new Error(c.erro || 'Erro ao falar com o servidor.'); return c; });
  const post = (c, corpo = {}) => api(c, { method: 'POST', body: JSON.stringify(corpo) });
  const imprimir = (id) => window.open(`/api/faturamento/${id}/imprimir?token=${encodeURIComponent(token)}`, '_blank');
  let abaAtual = 'resumo';
  let filtroTomador = null;

  nav.addEventListener('click', () => abrirAba(abaAtual));
  document.querySelectorAll('[data-fat-aba]').forEach((a) => a.addEventListener('click', () => abrirAba(a.dataset.fatAba)));
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-fat-fechar]')) fechar(); });

  function abrirAba(nome) {
    abaAtual = nome;
    document.querySelectorAll('[data-fat-aba]').forEach((a) => a.classList.toggle('ativo', a.dataset.fatAba === nome));
    ['resumo', 'faturas', 'afaturar', 'config'].forEach((n) => $(`fat-aba-${n}`).classList.toggle('oculto', n !== nome));
    ({ resumo: resumo, faturas: faturas, afaturar: aFaturar, config: configuracao })[nome]().catch(erro);
  }

  // ---------------- Contas a receber ----------------
  async function resumo() {
    const r = await api('/resumo');
    const a = r.aging || {};
    const faixas = [['a_vencer', 'A vencer', 'var(--azul)'], ['ate_30', 'Vencido até 30 dias', 'var(--amarelo)'], ['ate_60', '31 a 60 dias', '#e8873a'], ['ate_90', '61 a 90 dias', 'var(--vermelho)'], ['mais_90', 'Mais de 90 dias', '#a01d22']];
    const maior = Math.max(1, ...faixas.map(([k]) => a[k]?.valor || 0));
    const kpi = (titulo, icone, valor, sub, classe = 'neutral') => `<div class="mini-card kpi-card"><div class="kpi-header"><span>${titulo}</span><span>${icone}</span></div>
      <div class="kpi-value">${valor}</div><div class="kpi-subtext ${classe}">${sub}</div></div>`;
    $('fat-aba-resumo').innerHTML = `
      <div class="kpi-grid">
        ${kpi('A receber', '💵', moeda(r.a_receber), `${r.qtd_abertas} fatura(s) em aberto`)}
        ${kpi('Vencido', '🚨', moeda(r.vencido), `${r.qtd_vencidas} fatura(s) vencida(s)`, Number(r.vencido) > 0 ? 'negative' : 'neutral')}
        ${kpi('Vence em 7 dias', '⏰', moeda(r.vence_7_dias), 'para cobrar esta semana')}
        ${kpi('Recebido no mês', '✅', moeda(r.recebido_mes), 'baixas lançadas neste mês', 'positive')}
        ${kpi('A faturar', '➕', moeda(r.a_faturar.valor), `${r.a_faturar.qtd} CT-e autorizado(s) sem fatura`, r.a_faturar.qtd ? 'negative' : 'neutral')}
      </div>
      <div class="cte-duas" style="display:grid; grid-template-columns:1fr 1.3fr; gap:16px;">
        <div class="painel" style="padding:16px;"><h3 style="margin:0 0 12px;">Por tempo de atraso</h3>
          ${faixas.map(([k, t, cor]) => `<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; font-size:13px;"><span>${t}</span><b>${moeda(a[k]?.valor)} <small style="color:var(--texto-fraco); font-weight:400;">(${a[k]?.qtd || 0})</small></b></div>
            <div style="height:8px; background:var(--borda); border-radius:4px; margin-top:4px;"><div style="height:8px; width:${((a[k]?.valor || 0) / maior) * 100}%; background:${cor}; border-radius:4px;"></div></div></div>`).join('')}</div>
        <div class="painel" style="padding:16px;"><h3 style="margin:0 0 12px;">Clientes com mais a receber</h3>
          <table class="edi-tabela"><thead><tr><th>Cliente</th><th style="text-align:right;">Saldo</th><th style="text-align:right;">Vencido</th><th>Mais antiga</th></tr></thead><tbody>
          ${(r.devedores || []).map((d) => `<tr style="cursor:pointer;" data-fat-tomador="${esc(d.tomador_doc)}"><td><b>${esc(d.tomador_nome)}</b><br><small style="color:var(--texto-fraco);">${esc(docFmt(d.tomador_doc))} · ${d.faturas} fatura(s)</small></td>
            <td style="text-align:right;">${moeda(d.saldo)}</td><td style="text-align:right; color:${Number(d.vencido) > 0 ? 'var(--vermelho)' : 'inherit'};">${moeda(d.vencido)}</td><td>${dia(d.mais_antiga)}</td></tr>`).join('')
            || '<tr><td colspan="4" style="color:var(--texto-fraco);">Nada a receber.</td></tr>'}</tbody></table></div>
      </div>`;
    document.querySelectorAll('[data-fat-tomador]').forEach((tr) => tr.addEventListener('click', () => { filtroTomador = tr.dataset.fatTomador; abrirAba('faturas'); }));
  }

  // ---------------- Faturas ----------------
  async function faturas() {
    const painel = $('fat-aba-faturas');
    if (!painel.dataset.pronto) {
      painel.dataset.pronto = '1';
      painel.innerHTML = `<div class="painel" style="padding:16px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; align-items:center;">
          <input type="text" id="fatBusca" class="cte-entrada" placeholder="Nº da fatura, cliente ou CNPJ" style="flex:1; min-width:200px;" />
          <select id="fatStatus" class="cte-entrada" style="width:auto;"><option value="abertas">Em aberto</option><option value="vencidas">Vencidas</option><option value="paga">Pagas</option><option value="cancelada">Canceladas</option><option value="">Todas</option></select>
          <span id="fatFiltroTomador"></span>
        </div>
        <div style="overflow-x:auto;"><table class="edi-tabela" id="fatTabela"><thead><tr><th>Nº</th><th>Cliente</th><th>Emissão</th><th>Vencimento</th><th style="text-align:right;">Valor</th><th style="text-align:right;">Saldo</th><th>Situação</th><th></th></tr></thead><tbody></tbody></table></div></div>`;
      let t = null;
      $('fatBusca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => carregarFaturas().catch(erro), 300); });
      $('fatStatus').addEventListener('change', () => carregarFaturas().catch(erro));
      $('fatTabela').addEventListener('click', acaoFatura);
    }
    await carregarFaturas();
  }
  async function carregarFaturas() {
    const p = new URLSearchParams({ status: $('fatStatus').value, busca: $('fatBusca').value.trim() });
    if (filtroTomador) { p.set('tomador', filtroTomador); p.set('status', ''); $('fatStatus').value = ''; }
    $('fatFiltroTomador').innerHTML = filtroTomador ? `<span class="cte-chip">cliente ${esc(docFmt(filtroTomador))}<button type="button" id="fatTirarTomador">✕</button></span>` : '';
    $('fatTirarTomador')?.addEventListener('click', () => { filtroTomador = null; $('fatStatus').value = 'abertas'; carregarFaturas().catch(erro); });
    const lista = await api(`/?${p}`);
    const b = (acao, texto, id) => `<button class="btn btn-secundario" data-fat-acao="${acao}" data-id="${id}">${texto}</button>`;
    document.querySelector('#fatTabela tbody').innerHTML = lista.map((f) => `<tr>
      <td><b>${f.numero}</b>${f.demonstracao ? '<div style="font-size:10.5px; color:var(--azul);">demonstração</div>' : ''}</td>
      <td><b>${esc(f.tomador_nome)}</b><br><small style="color:var(--texto-fraco);">${esc(docFmt(f.tomador_doc))} · ${f.qtd_ctes} CT-e</small></td>
      <td>${dia(f.emissao)}</td>
      <td style="${f.vencida ? 'color:var(--vermelho); font-weight:600;' : ''}">${dia(f.vencimento)}${f.vencida ? `<br><small>${f.dias_atraso} dia(s) de atraso</small>` : ''}</td>
      <td style="text-align:right;">${moeda(f.valor_liquido)}</td><td style="text-align:right;">${f.status === 'cancelada' ? '—' : moeda(f.saldo)}</td>
      <td><span class="badge ${STATUS[f.status][1]}">${STATUS[f.status][0]}</span>${f.enviada_em ? '<div style="font-size:11px; color:var(--texto-fraco);">✉ enviada</div>' : ''}</td>
      <td><div class="cte-acoes">${b('abrir', '📂 Abrir', f.id)}${b('imprimir', '🖨', f.id)}${['aberta', 'parcial'].includes(f.status) ? b('receber', '💵 Receber', f.id) : ''}</div></td></tr>`).join('')
      || '<tr><td colspan="8" style="text-align:center; color:var(--texto-fraco); padding:24px;">Nenhuma fatura. Vá em “➕ A faturar” para juntar os CT-e em faturas.</td></tr>';
  }
  async function acaoFatura(ev) {
    const b = ev.target.closest('[data-fat-acao]');
    if (!b) return;
    const { id } = b.dataset;
    try {
      if (b.dataset.fatAcao === 'abrir') await abrirFatura(id);
      if (b.dataset.fatAcao === 'imprimir') imprimir(id);
      if (b.dataset.fatAcao === 'receber') { await abrirFatura(id); $('fatRecValor')?.focus(); }
    } catch (e) { erro(e); }
  }

  async function abrirFatura(id) {
    const f = await api(`/${id}`);
    const aberta = ['aberta', 'parcial'].includes(f.status);
    $('fatModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div><h3 style="margin:0;">🧾 Fatura ${f.numero} <span class="badge ${STATUS[f.status][1]}" style="vertical-align:middle;">${STATUS[f.status][0]}</span></h3>
        <div style="font-size:13px; color:var(--texto-fraco); margin-top:4px;">${esc(f.tomador_nome)} · ${esc(docFmt(f.tomador_doc))} · emitida ${dia(f.emissao)}${f.enviada_em ? ` · enviada por e-mail ${new Date(f.enviada_em).toLocaleString('pt-BR')}` : ''}${f.motivo_cancelamento ? ` · cancelada: ${esc(f.motivo_cancelamento)}` : ''}</div></div>
        <span style="cursor:pointer; font-size:18px;" data-fat-fechar>✕</span></div>
      <div class="kpi-grid" style="margin:14px 0;">
        <div class="mini-card"><div class="rotulo">Valor</div><div class="valor">${moeda(f.valor_liquido)}</div>${Number(f.desconto) > 0 ? `<small>desconto ${moeda(f.desconto)}</small>` : ''}</div>
        <div class="mini-card"><div class="rotulo">Recebido</div><div class="valor" style="color:var(--verde);">${moeda(f.valor_pago)}</div></div>
        <div class="mini-card"><div class="rotulo">Saldo</div><div class="valor">${moeda(f.status === 'cancelada' ? 0 : f.saldo)}</div></div>
        <div class="mini-card"><div class="rotulo">Vencimento</div><div class="valor" style="${f.vencida ? 'color:var(--vermelho);' : ''}">${dia(f.vencimento)}</div>
          ${aberta ? `<div style="display:flex; gap:4px; margin-top:6px;"><input type="date" id="fatNovoVenc" class="cte-entrada" value="${iso(f.vencimento)}" style="padding:4px 6px;" /><button class="btn btn-secundario" id="fatProrrogar" style="width:auto; font-size:12px;">Prorrogar</button></div>` : ''}</div>
      </div>
      ${aberta ? `<div class="cte-secao"><h4>Registrar recebimento</h4><div class="cte-grade">
        <div class="campo"><label for="fatRecData">Data</label><input type="date" id="fatRecData" value="${hojeIso()}" /></div>
        <div class="campo"><label for="fatRecValor">Valor recebido</label><input type="text" id="fatRecValor" value="${Number(f.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}" /></div>
        <div class="campo"><label for="fatRecForma">Forma</label><select id="fatRecForma">${Object.entries(FORMAS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
        <div class="campo largo"><label for="fatRecObs">Observação</label><input type="text" id="fatRecObs" placeholder="ex.: com juros de 2 dias" /></div>
        <div class="campo" style="display:flex; align-items:flex-end;"><button class="btn btn-primario" id="fatReceber" style="width:auto;">💵 Dar baixa</button></div></div></div>` : ''}
      ${f.pagamentos.length ? `<div class="cte-secao"><h4>Recebimentos</h4><table class="edi-tabela"><tbody>${f.pagamentos.map((p) => `<tr><td>${dia(p.data)}</td><td>${moeda(p.valor)}</td><td>${FORMAS[p.forma] || p.forma}</td><td>${esc(p.observacao || '')}</td><td style="color:var(--texto-fraco);">${esc(p.usuario_nome || '')}</td>
        <td><button class="btn btn-secundario" data-estornar="${p.id}" style="width:auto; font-size:12px;">Estornar</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="cte-secao"><h4>CT-e da fatura (${f.itens.length})</h4><div style="max-height:34vh; overflow:auto;"><table class="edi-tabela"><thead><tr><th>CT-e</th><th>Emissão</th><th>NF</th><th>Destinatário</th><th>Destino</th><th style="text-align:right;">Valor</th></tr></thead><tbody>
        ${f.itens.map((c) => `<tr><td>${esc(c.serie)}/${esc(c.numero)}${c.tp_cte === '1' ? ' <small>(compl.)</small>' : ''}</td><td>${dia(c.autorizado_em)}</td><td>${esc(c.nfs.filter(Boolean).join(', '))}</td><td>${esc(c.destinatario_nome || '')}</td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td><td style="text-align:right;">${moeda(c.valor)}</td></tr>`).join('')}</tbody></table></div></div>
      ${f.status !== 'cancelada' ? `<div class="cte-secao"><h4>Enviar ao cliente</h4><div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
        <input type="email" id="fatEmail" class="cte-entrada" value="${esc(f.tomador_email || '')}" placeholder="e-mail do financeiro do cliente" style="flex:1; min-width:220px;" />
        <button class="btn btn-primario" id="fatEnviar" style="width:auto;">✉ Enviar fatura por e-mail</button></div>
        ${f.pix ? '<div style="font-size:12px; color:var(--texto-fraco);">A fatura vai com o QR Code e o PIX copia e cola do saldo.</div>' : '<div style="font-size:12px; color:var(--amarelo);">Cadastre a chave PIX em “⚙️ Cobrança” para a fatura sair com o QR Code de pagamento.</div>'}</div>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:12px;">
        ${aberta && !f.pagamentos.length ? '<button class="btn btn-secundario" id="fatCancelar" style="width:auto; color:var(--vermelho);">Cancelar fatura</button>' : ''}
        ${f.pix ? '<button class="btn btn-secundario" id="fatCopiarPix" style="width:auto;">📋 Copiar PIX copia e cola</button>' : ''}
        <a class="btn btn-secundario" href="/api/faturamento/${f.id}/doccob?token=${encodeURIComponent(token)}" style="width:auto; text-decoration:none;">⬇ DOCCOB (EDI)</a>
        <button class="btn btn-primario" id="fatImprimir" style="width:auto;">🖨 Imprimir fatura</button></div>`;
    modal.classList.remove('oculto');
    const recarregar = async () => { await abrirFatura(id); carregarFaturas().catch(() => {}); };
    $('fatImprimir').addEventListener('click', () => imprimir(id));
    $('fatCopiarPix')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(f.pix); mostrarAlerta('PIX copia e cola copiado.', { tipo: 'sucesso' }); } catch { await pedirTexto('Copie o PIX copia e cola:', { valor: f.pix, multilinha: true }); } });
    $('fatReceber')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const r = await post(`/${id}/receber`, { data: $('fatRecData').value, valor: num($('fatRecValor').value), forma: $('fatRecForma').value, observacao: $('fatRecObs').value });
        mostrarAlerta(r.status === 'paga' ? `Fatura ${r.numero} quitada.` : `Recebimento lançado. Falta ${moeda(r.saldo)}.`, { tipo: 'sucesso' });
        await recarregar();
      } catch (err) { erro(err); btn.disabled = false; }
    });
    $('fatProrrogar')?.addEventListener('click', async () => { try { await api(`/${id}`, { method: 'PUT', body: JSON.stringify({ vencimento: $('fatNovoVenc').value }) }); await recarregar(); } catch (err) { erro(err); } });
    document.querySelectorAll('[data-estornar]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!await confirmar('Estornar este recebimento? A fatura volta a ficar em aberto pelo valor.', { tipo: 'perigo', textoOk: 'Estornar' })) return;
      try { await api(`/${id}/pagamentos/${btn.dataset.estornar}`, { method: 'DELETE' }); await recarregar(); } catch (err) { erro(err); }
    }));
    $('fatEnviar')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { const r = await post(`/${id}/email`, { para: $('fatEmail').value.trim() }); mostrarAlerta(`Fatura enviada para ${r.para}.`, { tipo: 'sucesso' }); await recarregar(); } catch (err) { erro(err); btn.disabled = false; }
    });
    $('fatCancelar')?.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo do cancelamento. Os CT-e voltam para “A faturar”.', { titulo: 'Cancelar fatura', tipo: 'aviso', textoOk: 'Cancelar fatura' });
      if (motivo == null) return;
      try { await post(`/${id}/cancelar`, { motivo }); await recarregar(); } catch (err) { erro(err); }
    });
  }

  // ---------------- A faturar ----------------
  async function aFaturar() {
    const painel = $('fat-aba-afaturar');
    if (!painel.dataset.pronto) {
      painel.dataset.pronto = '1';
      painel.innerHTML = `<div class="painel" style="padding:16px;">
        <div class="cte-aviso" style="font-size:12.5px;">CT-e autorizados que ainda não estão em nenhuma fatura, separados por cliente (quem paga o frete). Marque e gere a fatura, ou fature o período inteiro de uma vez.</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px;">
          <div class="campo" style="margin:0;"><label for="afDe">Emitidos de</label><input type="date" id="afDe" class="cte-entrada" /></div>
          <div class="campo" style="margin:0;"><label for="afAte">até</label><input type="date" id="afAte" class="cte-entrada" value="${hojeIso()}" /></div>
          <div class="campo" style="margin:0;"><label for="afVenc">Vencimento</label><input type="date" id="afVenc" class="cte-entrada" /></div>
          <button class="btn btn-secundario" id="afFiltrar" style="width:auto;">Filtrar</button>
          <button class="btn btn-primario" id="afPeriodo" style="width:auto; margin-left:auto;">🧾 Faturar tudo (uma fatura por cliente)</button>
        </div>
        <div id="afLista"></div></div>`;
      $('afFiltrar').addEventListener('click', () => carregarAFaturar().catch(erro));
      $('afPeriodo').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const grupos = window.__afGrupos || [];
        if (!grupos.length) return mostrarAlerta('Nada a faturar nesse período.', { tipo: 'aviso' });
        if (!await confirmar(`Gerar ${grupos.length} fatura(s), uma por cliente, com ${grupos.reduce((s, g) => s + g.ctes.length, 0)} CT-e (${moeda(grupos.reduce((s, g) => s + g.valor, 0))})?`, { textoOk: 'Faturar' })) return null;
        btn.disabled = true;
        try {
          const r = await post('/periodo', { de: $('afDe').value || null, ate: $('afAte').value || null, vencimento: $('afVenc').value || null });
          mostrarAlerta(`${r.length} fatura(s) gerada(s): ${r.map((f) => `nº ${f.numero} (${f.tomador})`).join(', ')}.`, { tipo: 'sucesso' });
          abrirAba('faturas');
        } catch (err) { erro(err); }
        btn.disabled = false;
        return null;
      });
    }
    await carregarAFaturar();
  }
  async function carregarAFaturar() {
    const p = new URLSearchParams();
    if ($('afDe').value) p.set('de', $('afDe').value);
    if ($('afAte').value) p.set('ate', $('afAte').value);
    const grupos = await api(`/a-faturar?${p}`);
    window.__afGrupos = grupos.filter((g) => g.doc);
    $('afLista').innerHTML = grupos.map((g, i) => `<details class="cte-secao" ${grupos.length <= 3 ? 'open' : ''} data-grupo="${i}"><summary style="cursor:pointer; display:flex; justify-content:space-between; gap:10px; align-items:center; padding:2px 0 10px;">
        <span><b>${esc(g.nome || 'Sem tomador')}</b> <small style="color:var(--texto-fraco);">${esc(docFmt(g.doc))}</small></span>
        <span><b>${moeda(g.valor)}</b> · ${g.ctes.length} CT-e</span></summary>
      ${g.doc ? '' : '<div class="cte-aviso erro">Esses CT-e estão sem o CNPJ/CPF do tomador e não podem ser faturados.</div>'}
      <table class="edi-tabela"><thead><tr><th><input type="checkbox" data-af-todos="${i}" checked /></th><th>CT-e</th><th>Emissão</th><th>Destinatário</th><th>Destino</th><th style="text-align:right;">Valor</th></tr></thead><tbody>
      ${g.ctes.map((c) => `<tr><td><input type="checkbox" data-af-cte="${c.id}" data-grupo="${i}" checked /></td><td>${esc(c.serie)}/${esc(c.numero)}${c.tp_cte === '1' ? ' <small>(compl.)</small>' : ''}${c.demonstracao ? ' <small style="color:var(--azul);">demo</small>' : ''}</td>
        <td>${dia(c.autorizado_em)}</td><td>${esc(c.destinatario_nome || '')}</td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td><td style="text-align:right;">${moeda(c.valor)}</td></tr>`).join('')}</tbody></table>
      ${g.doc ? `<div style="display:flex; justify-content:flex-end; gap:8px; align-items:center; margin:10px 0 6px;"><span style="font-size:12px; color:var(--texto-fraco);">${g.email ? `e-mail: ${esc(g.email)}` : 'sem e-mail no CT-e'}</span>
        <button class="btn btn-primario" data-af-gerar="${i}" style="width:auto;">🧾 Gerar fatura dos marcados</button></div>` : ''}</details>`).join('')
      || '<div style="text-align:center; color:var(--texto-fraco); padding:24px;">Nada a faturar: todos os CT-e autorizados já estão em faturas.</div>';
    document.querySelectorAll('[data-af-todos]').forEach((cx) => cx.addEventListener('change', () => document.querySelectorAll(`[data-af-cte][data-grupo="${cx.dataset.afTodos}"]`).forEach((c) => { c.checked = cx.checked; })));
    document.querySelectorAll('[data-af-gerar]').forEach((btn) => btn.addEventListener('click', async () => {
      const ids = [...document.querySelectorAll(`[data-af-cte][data-grupo="${btn.dataset.afGerar}"]:checked`)].map((c) => Number(c.dataset.afCte));
      if (!ids.length) return mostrarAlerta('Marque os CT-e da fatura.', { tipo: 'aviso' });
      btn.disabled = true;
      try {
        const f = await post('/', { cteIds: ids, vencimento: $('afVenc').value || null });
        await carregarAFaturar();
        abrirAba('faturas');
        await abrirFatura(f.id);
      } catch (err) { erro(err); btn.disabled = false; }
      return null;
    }));
  }

  // ---------------- Configuração da cobrança ----------------
  async function configuracao() {
    const c = await api('/config');
    const campo = (id, rotulo, valor, extra = '', classe = '') => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input type="text" id="${id}" value="${esc(valor ?? '')}" ${extra} /></div>`;
    $('fat-aba-config').innerHTML = `<div class="painel" style="padding:20px;">
      <div class="cte-secao"><h4>PIX (QR Code na fatura)</h4><div class="cte-grade">
        ${campo('fcPix', 'Chave PIX da empresa', c.pix_chave, 'placeholder="CNPJ, e-mail, +55 celular ou chave aleatória"', 'largo')}
        ${campo('fcPixCidade', 'Cidade do recebedor', c.pix_cidade || c.municipio)}
        <div class="campo inteiro" style="font-size:12px; color:var(--texto-fraco);">O QR Code é o PIX estático do Banco Central, já com o valor e a identificação da fatura (FAT + número): funciona em qualquer banco e não precisa de contrato. O nome do recebedor é a razão social (${esc(c.razao_social || '')}). Celular: digite com +55.</div>
      </div></div>
      <div class="cte-secao"><h4>Depósito / TED (aparece na fatura e no DOCCOB)</h4><div class="cte-grade">
        ${campo('fcBanco', 'Banco', c.banco_nome)}${campo('fcBancoCod', 'Código do banco', c.banco_codigo, 'maxlength="3" placeholder="ex.: 341"')}${campo('fcAgencia', 'Agência', c.banco_agencia)}${campo('fcConta', 'Conta', c.banco_conta)}
      </div></div>
      <div class="cte-secao"><h4>Faturas</h4><div class="cte-grade">
        ${campo('fcPrazo', 'Prazo padrão de vencimento (dias)', c.fatura_prazo_dias, 'inputmode="numeric"')}${campo('fcNumero', 'Próximo número de fatura', c.fatura_proximo_numero, 'inputmode="numeric"')}
        <div class="campo inteiro"><label for="fcInstr">Instruções (rodapé da fatura)</label><textarea id="fcInstr" rows="2" style="width:100%;">${esc(c.fatura_instrucoes || '')}</textarea></div>
      </div></div>
      <div style="display:flex; justify-content:flex-end;"><button class="btn btn-primario" id="fcSalvar" style="width:auto;">💾 Salvar</button></div></div>`;
    $('fcSalvar').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await api('/config', { method: 'PUT', body: JSON.stringify({ pix_chave: $('fcPix').value, pix_cidade: $('fcPixCidade').value, banco_nome: $('fcBanco').value, banco_codigo: $('fcBancoCod').value,
          banco_agencia: $('fcAgencia').value, banco_conta: $('fcConta').value, fatura_prazo_dias: $('fcPrazo').value, fatura_proximo_numero: $('fcNumero').value, fatura_instrucoes: $('fcInstr').value }) });
        mostrarAlerta('Configuração da cobrança salva.', { tipo: 'sucesso' });
      } catch (err) { erro(err); }
      btn.disabled = false;
    });
  }
})();
