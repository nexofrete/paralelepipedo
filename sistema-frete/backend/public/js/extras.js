// =====================================================================
// Cobrança de serviços extras (Faturamento › Serviços extras): reentrega,
// devolução, estadia, armazenagem e descarga. As ocorrências e o "cheguei"
// do app criam as cobranças pendentes; aqui se aprova e gera o CT-e
// complementar (ou a NFS-e da armazenagem). Preços padrão e por cliente.
// Usa do dashboard.js: apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v, c = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/servicos-extras${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const post = (c, corpo) => api(c, { method: 'POST', body: JSON.stringify(corpo || {}) });
  const COR = { pendente: 'ocorrencia', aprovada: 'em_transito', cobrada: 'entregue', cancelada: 'cancelado' };
  const ORIGEM = { ocorrencia: '📍 ocorrência', app: '📱 app do motorista', manual: '✍ lançado à mão' };
  const est = { status: 'pendente', busca: '' };
  let raiz = null;
  // CNPJ do cliente no preço por cliente: formata, confere e traz o nome.
  window.Doc?.registrar('#rgDoc', { razao_social: '#rgNome' });

  function modal(html) {
    let m = document.getElementById('modalExtras');
    if (!m) {
      m = document.createElement('div'); m.id = 'modalExtras'; m.className = 'modal-overlay oculto';
      m.innerHTML = '<div class="painel modal-card" style="max-width:900px; width:100%; max-height:94vh; overflow-y:auto; padding:22px 24px;" id="exModal"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-ex-fechar]')) m.classList.add('oculto'); });
    }
    document.getElementById('exModal').innerHTML = html;
    m.classList.remove('oculto');
    return { fechar: () => m.classList.add('oculto'), $: (id) => document.getElementById(id) };
  }
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-ex-fechar>✕</span></div>`;

  async function tela(el) {
    raiz = el || raiz;
    const d = await api(`?status=${est.status}&busca=${encodeURIComponent(est.busca)}`);
    const c = d.contagens;
    const filtros = [['pendente', 'Para aprovar'], ['aprovada', 'Aprovadas (a cobrar)'], ['cobrada', 'Cobradas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']];
    const marcavel = (x) => ['pendente', 'aprovada'].includes(x.status);
    raiz.innerHTML = `
      <div class="oc-resumo">
        <div>Para aprovar<b>${brl(c.pendente_valor)}</b><span>${c.pendente} cobrança(s)</span></div>
        <div>Aprovadas, a cobrar<b>${brl(c.aprovada_valor)}</b><span>${c.aprovada} cobrança(s)</span></div>
        <div>Cobradas<b>${brl(c.cobrada_valor)}</b><span>${c.cobrada} cobrança(s)</span></div>
        <div>Canceladas<b>${brl(c.cancelada_valor)}</b><span>${c.cancelada} (cortesia, falha nossa...)</span></div>
      </div>
      <div class="oc-barra" style="flex-wrap:wrap; gap:8px; align-items:center;">
        <div class="oc-filtros">${filtros.map(([k, t]) => `<button class="oc-filtro ${est.status === k ? 'ativo' : ''}" data-ex-filtro="${k}">${t}${c[k] != null ? `<span class="n">${c[k]}</span>` : ''}</button>`).join('')}</div>
        <input type="text" id="exBusca" class="cte-entrada" placeholder="Cliente ou nº do CT-e" value="${esc(est.busca)}" style="max-width:220px;" />
        <span style="flex:1;"></span>
        <button class="btn btn-secundario" id="exPrecos" style="width:auto;">⚙ Preços</button>
        <button class="btn btn-primario" id="exNovo" style="width:auto;">＋ Lançar serviço</button>
      </div>
      <div class="oc-lote oculto" id="exLote"><b id="exLoteQtd"></b>
        ${est.status === 'pendente' || est.status === 'todas' ? '<button class="btn btn-primario" id="exAprovar" style="width:auto;">✓ Aprovar</button>' : ''}
        ${est.status === 'aprovada' || est.status === 'todas' ? '<button class="btn btn-primario" id="exCobrar" style="width:auto;">💰 Gerar CT-e complementar / NFS-e</button>' : ''}
        <button class="btn btn-secundario" id="exCancelar" style="width:auto; color:var(--vermelho);">Cancelar</button></div>
      <div class="painel oc-painel"><div class="edi-rolagem">${d.cobrancas.length ? `<table class="edi-tabela"><thead><tr><th><input type="checkbox" id="exTodos" /></th><th>CT-e</th><th>Cliente (paga o frete)</th><th>Serviço</th><th>Origem</th><th class="n">Qtd</th><th class="n">Calculado</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
        ${d.cobrancas.map((x) => `<tr><td>${marcavel(x) ? `<input type="checkbox" data-ex-marca="${x.id}" />` : ''}</td>
          <td><b>${esc(x.serie)}/${esc(x.numero)}</b><br><small style="color:var(--texto-fraco);">frete ${brl(x.frete)}</small></td>
          <td>${esc(x.tomador_nome || '')}<br><small style="color:var(--texto-fraco);">entrega: ${esc(x.destinatario_nome || '')} · ${esc(x.cidade_fim || '')}</small></td>
          <td><b>${esc(x.servico_nome)}</b>${x.descricao ? `<br><small style="color:var(--texto-fraco);">${esc(x.descricao)}</small>` : ''}</td>
          <td><small>${ORIGEM[x.origem] || x.origem}<br>${quando(x.ocorrencia_em || x.criado_em)}</small></td>
          <td class="n">${x.quantidade != null ? `${num(x.quantidade)} ${x.servico === 'estadia' ? 'h' : 'dia(s)'}` : ''}</td>
          <td class="n">${brl(x.valor_calculado)}</td><td class="n"><b>${brl(x.valor)}</b></td>
          <td><span class="oc-sit ${COR[x.status]}">${esc(x.status_nome)}</span>${x.status === 'cobrada' && x.documento ? `<br><small>${x.documento_tipo === 'cte' ? `CT-e compl. ${x.documento.numero ? `${esc(x.documento.serie)}/${esc(x.documento.numero)}` : '(rascunho)'}` : `NFS-e ${esc(x.documento.numero || '(rascunho)')}`} · ${esc(x.documento.status)}</small>` : ''}
            ${x.status === 'cobrada' && !x.documento ? '<br><small style="color:var(--vermelho);">documento excluído</small>' : ''}${x.motivo_cancelamento ? `<br><small>${esc(x.motivo_cancelamento)}</small>` : ''}</td>
          <td><div class="oc-linha-acoes">${marcavel(x) ? `<button data-ex-editar="${x.id}">Ajustar</button>` : ''}${x.status === 'cobrada' && (!x.documento || ['cancelado', 'cancelada', 'rejeitado', 'rejeitada', 'erro'].includes(x.documento.status)) ? `<button data-ex-reabrir="${x.id}" title="O documento não vale: volta para aprovada">Reabrir</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
    : `<div class="kanban-vazio">${est.status === 'pendente' ? 'Nada para aprovar. As reentregas e devoluções entram aqui sozinhas pelas ocorrências; a estadia, pelo "Cheguei" do app do motorista.' : 'Nada aqui.'}</div>`}</div></div>
      <p class="edi-dica" style="margin-top:10px;">Reentrega, devolução, estadia e descarga são cobradas em <b>CT-e complementar</b> do CT-e original (um por CT-e, com um componente por serviço, e o ICMS na mesma alíquota). Armazenagem sai em <b>NFS-e</b> (serviço com ISS). Os documentos saem como rascunho: confira e transmita em CT-e ou NFS-e, e fature como os outros.</p>`;
    ligar(d);
  }

  function ligar(d) {
    const $ = (id) => document.getElementById(id);
    raiz.querySelectorAll('[data-ex-filtro]').forEach((b) => b.addEventListener('click', () => { est.status = b.dataset.exFiltro; tela().catch(erro); }));
    let tm = null;
    $('exBusca').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(() => { est.busca = e.target.value.trim(); tela().then(() => { const x = $('exBusca'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }).catch(erro); }, 400); });
    const marcados = () => [...raiz.querySelectorAll('[data-ex-marca]:checked')].map((x) => Number(x.dataset.exMarca));
    const atualizar = () => { const n = marcados().length; $('exLote').classList.toggle('oculto', !n); $('exLoteQtd').textContent = `${n} marcada(s) · ${brl(d.cobrancas.filter((x) => marcados().includes(x.id)).reduce((s, x) => s + x.valor, 0))}`; };
    raiz.querySelectorAll('[data-ex-marca]').forEach((x) => x.addEventListener('change', atualizar));
    $('exTodos')?.addEventListener('change', (e) => { raiz.querySelectorAll('[data-ex-marca]').forEach((x) => { x.checked = e.target.checked; }); atualizar(); });
    $('exAprovar')?.addEventListener('click', async () => {
      try { const r = await post('/aprovar', { ids: marcados() }); mostrarAlerta(`${r.aprovadas} aprovada(s).${r.sem_valor ? ` ${r.sem_valor} ficou(aram) sem aprovar por estar com valor zero: ajuste o valor (ou o preço em ⚙ Preços).` : ''}`, { tipo: r.sem_valor ? 'aviso' : 'sucesso' }); tela().catch(erro); } catch (err) { erro(err); }
    });
    $('exCobrar')?.addEventListener('click', async (e) => {
      const ids = marcados().filter((id) => d.cobrancas.find((x) => x.id === id)?.status === 'aprovada');
      if (!ids.length) { mostrarAlerta('Marque cobranças aprovadas.', { tipo: 'aviso' }); return; }
      if (!await confirmar(`Gerar os documentos de ${ids.length} cobrança(s)? Sai um CT-e complementar por CT-e (e uma NFS-e para armazenagem), como rascunho.`, { textoOk: 'Gerar' })) return;
      e.currentTarget.disabled = true;
      try {
        const r = await post('/cobrar', { ids });
        mostrarAlerta(`${r.feitos.map((f) => `• ${f.tipo === 'cte' ? 'CT-e complementar' : 'NFS-e'} do CT-e ${f.cte}: ${brl(f.valor)}`).join('\n')}${r.erros.length ? `\n\nNão gerou:\n${r.erros.map((x) => `• CT-e #${x.cte_id}: ${x.erro}`).join('\n')}` : ''}\n\nConfira e transmita em CT-e (filtro Rascunho) ou NFS-e.`, { tipo: r.erros.length ? 'aviso' : 'sucesso', titulo: 'Cobranças geradas' });
      } catch (err) { erro(err); }
      tela().catch(erro);
    });
    $('exCancelar')?.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo (fica registrado): cortesia, falha nossa, cliente não aceitou...', { titulo: 'Cancelar cobrança', textoOk: 'Cancelar cobrança' });
      if (!motivo) return;
      try { await post('/cancelar', { ids: marcados(), motivo }); tela().catch(erro); } catch (err) { erro(err); }
    });
    raiz.querySelectorAll('[data-ex-editar]').forEach((b) => b.addEventListener('click', () => ajustar(d.cobrancas.find((x) => x.id === Number(b.dataset.exEditar)))));
    raiz.querySelectorAll('[data-ex-reabrir]').forEach((b) => b.addEventListener('click', async () => { try { await post(`/${b.dataset.exReabrir}/reabrir`); tela().catch(erro); } catch (err) { erro(err); } }));
    $('exNovo').addEventListener('click', () => lancar(d));
    $('exPrecos').addEventListener('click', () => precos().catch(erro));
  }

  function ajustar(x) {
    const temQtd = ['estadia', 'armazenagem'].includes(x.servico);
    const m = modal(`${cab(`Ajustar — ${esc(x.servico_nome)} do CT-e ${esc(x.serie)}/${esc(x.numero)}`)}
      <div class="oc-form">${temQtd ? `<div class="campo"><label for="exQtd">${x.servico === 'estadia' ? 'Horas de espera' : 'Dias armazenado'}</label><input id="exQtd" class="cte-entrada" value="${x.quantidade != null ? num(x.quantidade) : ''}" /></div>` : ''}
        <div class="campo"><label for="exValor">Valor (vazio = pelo preço: ${brl(x.valor_calculado)})</label><input id="exValor" class="cte-entrada" value="${num(x.valor)}" /></div>
        <div class="campo inteiro"><label for="exDesc">Descrição (vai no documento)</label><input id="exDesc" class="cte-entrada" maxlength="300" value="${esc(x.descricao || '')}" /></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ex-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="exSalvar" style="width:auto;">Salvar</button></div>`);
    if (temQtd) m.$('exQtd').addEventListener('input', () => { m.$('exValor').value = ''; });
    m.$('exSalvar').addEventListener('click', async () => {
      try { await api(`/${x.id}`, { method: 'PUT', body: JSON.stringify({ quantidade: temQtd ? m.$('exQtd').value : undefined, valor: m.$('exValor').value, descricao: m.$('exDesc').value }) }); m.fechar(); tela().catch(erro); } catch (err) { erro(err); }
    });
  }

  function lancar(d) {
    const m = modal(`${cab('＋ Lançar serviço extra')}
      <div class="oc-form">
        <div class="campo"><label for="exCte">Nº do CT-e</label><input id="exCte" class="cte-entrada" inputmode="numeric" /></div>
        <div class="campo"><label for="exServ">Serviço</label><select id="exServ" class="cte-entrada">${Object.entries(d.servicos).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
        <div class="campo"><label for="exQtd2">Horas / dias (estadia e armazenagem)</label><input id="exQtd2" class="cte-entrada" /></div>
        <div class="campo"><label for="exValor2">Valor (vazio = pelo preço cadastrado)</label><input id="exValor2" class="cte-entrada" /></div>
        <div class="campo inteiro"><label for="exDesc2">Descrição</label><input id="exDesc2" class="cte-entrada" maxlength="300" placeholder="Ex.: caminhão esperou das 8h às 15h na doca" /></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ex-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="exCriar" style="width:auto;">Lançar</button></div>`);
    m.$('exCriar').addEventListener('click', async () => {
      try {
        const x = await post('', { cte: m.$('exCte').value, servico: m.$('exServ').value, quantidade: m.$('exQtd2').value, valor: m.$('exValor2').value, descricao: m.$('exDesc2').value });
        m.fechar(); mostrarAlerta(`Lançado: ${brl(x.valor)} (fica em "Para aprovar").`, { tipo: 'sucesso' }); est.status = 'pendente'; tela().catch(erro);
      } catch (err) { erro(err); }
    });
  }

  async function precos() {
    const r = await api('/regras');
    const linhaRegra = (g, pre) => `<tr><td><b>${esc(r.servicos[g.servico].nome)}</b><br><small style="color:var(--texto-fraco);">${r.servicos[g.servico].documento === 'cte' ? 'CT-e complementar' : 'NFS-e'}</small></td>
      <td><select class="cte-entrada" data-rg="${pre}modo">${r.servicos[g.servico].modos.map((mo) => `<option value="${mo}" ${mo === g.modo ? 'selected' : ''}>${esc(r.modos[mo])}</option>`).join('')}</select></td>
      <td><input class="cte-entrada" data-rg="${pre}valor" value="${num(g.valor, g.modo === 'mercadoria_dia' ? 3 : 2)}" style="width:100px;" /></td>
      <td><input class="cte-entrada" data-rg="${pre}minimo" value="${num(g.minimo)}" style="width:90px;" /></td>
      <td>${['estadia', 'armazenagem'].includes(g.servico) ? `<input class="cte-entrada" data-rg="${pre}franquia" value="${num(g.franquia, 0)}" style="width:70px;" /> ${g.servico === 'estadia' ? 'h' : 'dias'}` : ''}</td>`;
    const m = modal(`${cab('⚙ Preços dos serviços extras')}
      <p class="edi-dica" style="margin-top:0;">Preço padrão da empresa; o cliente com preço próprio (quem paga o frete) usa o dele. Valor zero não cobra. Exemplos: reentrega 50% do frete, devolução 100%, estadia R$ 80/h depois de 5h, armazenagem R$ 30/dia depois de 3 dias.</p>
      <h4 style="margin:6px 0;">Padrão da empresa</h4>
      <div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Serviço</th><th>Como cobra</th><th>Valor</th><th>Mínimo (R$)</th><th>Franquia</th></tr></thead><tbody>
        ${Object.values(r.padrao).map((g) => linhaRegra(g, `p|${g.servico}|`)).join('')}</tbody></table></div>
      <div style="display:flex; justify-content:flex-end; margin:8px 0 16px;"><button class="btn btn-primario" id="rgSalvarPadrao" style="width:auto;">Salvar preços padrão</button></div>
      <h4 style="margin:6px 0;">Preço por cliente</h4>
      ${r.clientes.length ? `<div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Cliente</th><th>Serviço</th><th>Como cobra</th><th class="n">Valor</th><th class="n">Mínimo</th><th class="n">Franquia</th><th></th></tr></thead><tbody>
        ${r.clientes.map((g) => `<tr><td>${esc(g.cliente_nome || g.cliente_doc)}<br><small>${esc(g.cliente_doc)}</small></td><td>${esc(r.servicos[g.servico].nome)}</td><td>${esc(r.modos[g.modo])}</td><td class="n">${num(g.valor, g.modo === 'mercadoria_dia' ? 3 : 2)}</td><td class="n">${num(g.minimo)}</td><td class="n">${g.franquia ? num(g.franquia, 0) : ''}</td>
          <td><a href="#" data-rg-apagar="${g.id}" style="color:var(--vermelho);">apagar</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="edi-dica">Nenhum cliente com preço próprio.</p>'}
      <div class="oc-form" style="margin-top:8px;">
        <div class="campo"><label for="rgDoc">CNPJ/CPF do cliente</label><input id="rgDoc" class="cte-entrada" /></div>
        <div class="campo"><label for="rgNome">Nome</label><input id="rgNome" class="cte-entrada" /></div>
        <div class="campo"><label for="rgServ">Serviço</label><select id="rgServ" class="cte-entrada">${Object.entries(r.servicos).map(([k, s]) => `<option value="${k}">${esc(s.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="rgModo">Como cobra</label><select id="rgModo" class="cte-entrada"></select></div>
        <div class="campo"><label for="rgValor">Valor</label><input id="rgValor" class="cte-entrada" /></div>
        <div class="campo"><label for="rgMin">Mínimo (R$)</label><input id="rgMin" class="cte-entrada" /></div>
        <div class="campo"><label for="rgFranq">Franquia (h ou dias)</label><input id="rgFranq" class="cte-entrada" /></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ex-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="rgSalvarCliente" style="width:auto;">＋ Preço do cliente</button></div>`);
    const modosDe = () => { m.$('rgModo').innerHTML = r.servicos[m.$('rgServ').value].modos.map((mo) => `<option value="${mo}">${esc(r.modos[mo])}</option>`).join(''); };
    m.$('rgServ').addEventListener('change', modosDe); modosDe();
    const lerCampo = (chave) => document.querySelector(`[data-rg="${chave}"]`)?.value;
    m.$('rgSalvarPadrao').addEventListener('click', async () => {
      try {
        for (const g of Object.values(r.padrao)) {
          const pre = `p|${g.servico}|`;
          await post('/regras', { servico: g.servico, modo: lerCampo(`${pre}modo`), valor: lerCampo(`${pre}valor`), minimo: lerCampo(`${pre}minimo`), franquia: lerCampo(`${pre}franquia`) || 0 });
        }
        mostrarAlerta('Preços padrão salvos. Valem para as próximas cobranças (as pendentes podem ser ajustadas).', { tipo: 'sucesso' }); precos().catch(erro);
      } catch (err) { erro(err); }
    });
    m.$('rgSalvarCliente').addEventListener('click', async () => {
      try { await post('/regras', { cliente_doc: m.$('rgDoc').value, cliente_nome: m.$('rgNome').value, servico: m.$('rgServ').value, modo: m.$('rgModo').value, valor: m.$('rgValor').value, minimo: m.$('rgMin').value, franquia: m.$('rgFranq').value }); precos().catch(erro); } catch (err) { erro(err); }
    });
    document.querySelectorAll('[data-rg-apagar]').forEach((a) => a.addEventListener('click', async (e) => { e.preventDefault(); try { await api(`/regras/${a.dataset.rgApagar}`, { method: 'DELETE' }); precos().catch(erro); } catch (err) { erro(err); } }));
  }

  window.telaExtras = (el) => tela(el);
})();
