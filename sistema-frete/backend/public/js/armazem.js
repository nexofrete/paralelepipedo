// =====================================================================
// Armazém: estoque por depositante (lotes com endereço), entrada pela NF-e
// ou à mão, saída com lista de separação, inventário, pedidos de saída do
// portal, cobrança mensal (NFS-e) e os contratos de armazenagem.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto, token.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro;
  const financeiro = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navArmazem');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const n = (v, c = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: c });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const diaTs = (v) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const mesPassado = () => { const d = new Date(); d.setDate(0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/armazem${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const imprimir = (id) => window.open(`/api/armazem/movimentos/${id}/imprimir?token=${encodeURIComponent(token)}`, '_blank');
  const modal = $('modalArmazem');
  const fechar = () => modal.classList.add('oculto');
  const abrirModal = (html) => { $('arModal').innerHTML = html; modal.classList.remove('oculto'); };
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-ar-fechar]')) fechar(); });
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-ar-fechar>✕</span></div>`;
  const TIPO = { entrada: ['Entrada', 'entregue'], saida: ['Saída', 'em_transito'], ajuste: ['Ajuste', 'ocorrencia'] };
  const est = { aba: 'estoque', dep: '', busca: '', competencia: mesPassado(), pstatus: 'pendente' };
  let geral = null;
  // CNPJ do depositante: formata, confere e traz o nome (registrado uma vez; os campos são recriados a cada abertura).
  window.Doc?.registrar('#enDoc', { razao_social: '#enNome' });
  window.Doc?.registrar('#ctDoc', { razao_social: '#ctNome' });

  async function carregar() {
    geral = await api('');
    const p = geral.pendencias;
    const tot = (k) => geral.depositantes.reduce((s, d) => s + (d[k] || 0), 0);
    const abas = [['estoque', 'Estoque'], ['movimentos', 'Entradas e saídas'], ['pedidos', `Pedidos de saída${p.pedidos ? ` (${p.pedidos})` : ''}`], ['cobranca', 'Cobrança mensal'], ['contratos', 'Contratos']];
    $('arConteudo').innerHTML = `
      <div class="oc-resumo">
        <div>Depositantes<b>${geral.depositantes.length}</b><span>com mercadoria guardada</span></div>
        <div>Paletes ocupados<b>${n(tot('paletes'), 1)}</b><span>${n(tot('m3'), 2)} m³ · ${n(tot('peso') / 1000, 2)} t</span></div>
        <div>Valor guardado<b style="font-size:18px;">${brl(tot('valor'))}</b><span>pelas notas de entrada</span></div>
        <div>Pedidos de saída<b style="color:${p.pedidos ? '#d97706' : 'inherit'};">${p.pedidos}</b><span>pedidos pelo portal</span></div>
        <div>Validade em 30 dias<b style="color:${p.vencendo ? '#d97706' : 'inherit'};">${p.vencendo}</b><span>lote(s) vencendo</span></div>
      </div>
      <div class="oc-barra" style="align-items:center;"><div class="oc-filtros">${abas.map(([k, t]) => `<button class="oc-filtro ${est.aba === k ? 'ativo' : ''}" data-ar-aba="${k}">${t}</button>`).join('')}</div></div>
      <div id="arAba"></div>`;
    document.querySelectorAll('[data-ar-aba]').forEach((b) => b.addEventListener('click', () => { est.aba = b.dataset.arAba; carregar().catch(erro); }));
    await ({ estoque: abaEstoque, movimentos: abaMovimentos, pedidos: abaPedidos, cobranca: abaCobranca, contratos: abaContratos }[est.aba])();
  }
  nav.addEventListener('click', () => carregar().catch(erro));
  const opcoesDep = (sel, todos = true) => `${todos ? '<option value="">Todos os depositantes</option>' : '<option value="">Escolha...</option>'}${geral.depositantes.map((d) => `<option value="${d.depositante_doc}" ${d.depositante_doc === sel ? 'selected' : ''}>${esc(d.depositante_nome)}</option>`).join('')}`;

  // ---------- Estoque ----------
  async function abaEstoque() {
    const lotes = await api(`/estoque?depositante=${est.dep}&busca=${encodeURIComponent(est.busca)}`);
    const resumo = !est.dep && !est.busca && geral.depositantes.length > 1;
    $('arAba').innerHTML = `
      <div class="oc-barra" style="align-items:center;"><select id="arDep" class="cte-entrada" style="max-width:320px;">${opcoesDep(est.dep)}</select>
        <input id="arBusca" class="cte-entrada" placeholder="Produto, código, endereço, lote ou NF" value="${esc(est.busca)}" style="max-width:280px;" /></div>
      ${resumo ? `<div class="painel oc-painel" style="margin-bottom:12px;"><table class="edi-tabela"><thead><tr><th>Depositante</th><th class="n">Produtos</th><th class="n">Paletes</th><th class="n">m³</th><th class="n">Peso (kg)</th><th class="n">Valor</th><th>Desde</th><th>Contrato</th></tr></thead><tbody>
        ${geral.depositantes.map((d) => `<tr data-ar-dep="${d.depositante_doc}" style="cursor:pointer;"><td><b>${esc(d.depositante_nome)}</b><br><small style="color:var(--texto-fraco);">${esc(docFmt(d.depositante_doc))}</small></td><td class="n">${d.produtos}</td><td class="n">${n(d.paletes, 1)}</td><td class="n">${n(d.m3, 3)}</td><td class="n">${n(d.peso, 0)}</td><td class="n">${brl(d.valor)}</td><td>${dia(d.mais_antigo)}</td>
          <td>${d.contrato ? (d.contrato.ativo ? `por ${esc(geral.bases[d.contrato.base]?.nome || d.contrato.base)}` : 'inativo') : '<small style="color:#ef4444;">sem contrato</small>'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="painel oc-painel"><div class="edi-rolagem">${lotes.length ? `<table class="edi-tabela"><thead><tr><th>Endereço</th><th>Produto</th><th>Lote / validade</th><th class="n">Saldo</th><th class="n">Paletes</th><th class="n">Peso (kg)</th><th class="n">Valor</th><th>Entrada</th><th></th></tr></thead><tbody>
        ${lotes.map((l) => `<tr><td><b>${esc(l.endereco || '—')}</b></td><td><b>${esc(l.descricao)}</b><br><small style="color:var(--texto-fraco);">${esc(l.produto_codigo || '')}${est.dep ? '' : ` · ${esc(l.depositante_nome || '')}`}</small></td>
          <td>${esc(l.lote || '—')}${l.validade ? `<br><small style="${l.validade <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) ? 'color:#d97706; font-weight:600;' : 'color:var(--texto-fraco);'}">val. ${dia(l.validade)}</small>` : ''}</td>
          <td class="n"><b>${n(l.saldo, 4)}</b> ${esc(l.unidade || '')}${l.saldo !== l.quantidade ? `<br><small style="color:var(--texto-fraco);">de ${n(l.quantidade, 4)}</small>` : ''}</td>
          <td class="n">${n(l.paletes_atual, 2)}</td><td class="n">${n(l.peso_atual, 1)}</td><td class="n">${brl(l.valor_atual)}</td>
          <td>${diaTs(l.entrada_em)}${l.entrada_nf ? `<br><small>NF ${esc(l.entrada_nf)}</small>` : ''}<br><small style="color:var(--texto-fraco);">${l.dias} dia(s)</small></td>
          <td><div class="oc-linha-acoes"><button data-ar-inv="${l.id}" title="Contagem física: a diferença vira ajuste">Inventário</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nada guardado. Dê entrada pela NF-e (＋ Entrada) para começar.</div>'}</div></div>`;
    $('arDep').addEventListener('change', (e) => { est.dep = e.target.value; carregar().catch(erro); });
    document.querySelectorAll('[data-ar-dep]').forEach((r) => r.addEventListener('click', () => { est.dep = r.dataset.arDep; carregar().catch(erro); }));
    let tm = null;
    $('arBusca').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(() => { est.busca = e.target.value.trim(); carregar().then(() => { const x = $('arBusca'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }).catch(erro); }, 400); });
    document.querySelectorAll('[data-ar-inv]').forEach((b) => b.addEventListener('click', () => inventario(lotes.find((l) => l.id === Number(b.dataset.arInv)))));
  }
  function inventario(l) {
    abrirModal(`${cab(`Inventário — ${esc(l.descricao)}`)}
      <p>Endereço <b>${esc(l.endereco || '—')}</b>${l.lote ? ` · lote ${esc(l.lote)}` : ''} · saldo no sistema: <b>${n(l.saldo, 4)} ${esc(l.unidade || '')}</b></p>
      <div class="oc-form"><div class="campo"><label for="ivCont">Quantidade contada</label><input id="ivCont" type="number" min="0" step="any" class="cte-entrada" /></div>
        <div class="campo"><label for="ivMot">Motivo</label><input id="ivMot" class="cte-entrada" maxlength="300" placeholder="Avaria, contagem, extravio..." /></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ar-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="ivSalvar" style="width:auto;">Ajustar</button></div>`);
    $('ivSalvar').addEventListener('click', async () => {
      try { await enviar('/ajuste', 'POST', { lote_id: l.id, contado: $('ivCont').value, motivo: $('ivMot').value }); fechar(); mostrarAlerta('Inventário ajustado.', { tipo: 'sucesso' }); carregar().catch(erro); } catch (err) { erro(err); }
    });
  }

  // ---------- Entradas e saídas ----------
  async function abaMovimentos() {
    const ms = await api(`/movimentos?depositante=${est.dep}`);
    $('arAba').innerHTML = `<div class="oc-barra"><select id="arDep" class="cte-entrada" style="max-width:320px;">${opcoesDep(est.dep)}</select></div>
      <div class="painel oc-painel"><div class="edi-rolagem">${ms.length ? `<table class="edi-tabela"><thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Depositante</th><th>NF / destino</th><th class="n">Itens</th><th class="n">Paletes</th><th class="n">Peso (kg)</th><th></th></tr></thead><tbody>
        ${ms.map((m) => `<tr${m.status === 'cancelado' ? ' style="opacity:.5;"' : ''}><td>${m.id}</td><td>${diaTs(m.data)}</td><td><span class="oc-sit ${TIPO[m.tipo][1]}">${TIPO[m.tipo][0]}</span>${m.status === 'cancelado' ? '<br><small>cancelado</small>' : ''}</td>
          <td>${esc(m.depositante_nome || docFmt(m.depositante_doc))}</td><td>${m.nf_numero ? `NF ${esc(m.nf_numero)}` : ''}${m.destinatario ? `<br><small>→ ${esc(m.destinatario)}</small>` : ''}${m.cte_numero ? `<br><small>CT-e ${esc(m.cte_serie)}/${esc(m.cte_numero)}</small>` : ''}${m.observacao ? `<br><small style="color:var(--texto-fraco);">${esc(m.observacao)}</small>` : ''}</td>
          <td class="n">${m.linhas}</td><td class="n">${n(Math.abs(m.paletes), 2)}</td><td class="n">${n(Math.abs(m.peso), 1)}</td>
          <td><div class="oc-linha-acoes"><button data-ar-imp="${m.id}" title="${m.tipo === 'saida' ? 'Lista de separação' : 'Recibo'}">🖨</button>${m.status === 'confirmado' ? `<button data-ar-canc="${m.id}">Cancelar</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhum movimento.</div>'}</div></div>`;
    $('arDep').addEventListener('change', (e) => { est.dep = e.target.value; carregar().catch(erro); });
    document.querySelectorAll('[data-ar-imp]').forEach((b) => b.addEventListener('click', () => imprimir(b.dataset.arImp)));
    document.querySelectorAll('[data-ar-canc]').forEach((b) => b.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo do cancelamento (o estoque volta como estava):', { titulo: 'Cancelar movimento' });
      if (!motivo) return;
      try { await enviar(`/movimentos/${b.dataset.arCanc}/cancelar`, 'POST', { motivo }); mostrarAlerta('Cancelado.', { tipo: 'sucesso' }); carregar().catch(erro); } catch (err) { erro(err); }
    }));
  }

  // Entrada: lê o XML da NF-e ou à mão.
  function linhaItem(i = {}) {
    return `<tr><td><input class="cte-entrada" data-k="codigo" value="${esc(i.codigo || '')}" style="width:80px;" /></td><td><input class="cte-entrada" data-k="descricao" value="${esc(i.descricao || '')}" /></td>
      <td><input class="cte-entrada" data-k="unidade" value="${esc(i.unidade || 'UN')}" style="width:50px;" /></td><td><input class="cte-entrada" data-k="quantidade" value="${esc(i.quantidade ?? '')}" style="width:80px;" /></td>
      <td><input class="cte-entrada" data-k="valor" value="${esc(i.valor ?? '')}" style="width:90px;" /></td><td><input class="cte-entrada" data-k="lote" value="${esc(i.lote || '')}" style="width:70px;" /></td>
      <td><input class="cte-entrada" type="date" data-k="validade" value="${esc(i.validade || '')}" /></td><td><input class="cte-entrada" data-k="endereco" value="${esc(i.endereco || '')}" placeholder="padrão" style="width:80px;" /></td>
      <td><button class="btn btn-secundario" data-ar-tira style="width:auto; padding:4px 8px;">✕</button><input type="hidden" data-k="ncm" value="${esc(i.ncm || '')}" /></td></tr>`;
  }
  function formEntrada(p = {}) {
    abrirModal(`${cab('＋ Entrada no armazém')}
      <div class="campo"><label for="enXml">XML da NF-e (remessa para armazenagem ou compra entregue aqui) — preenche tudo</label><input type="file" id="enXml" accept=".xml,text/xml" /></div>
      ${p.ja_lancada ? '<div class="cte-aviso erro">Esta NF-e já deu entrada no armazém.</div>' : ''}${p.depositante_doc && !p.tem_contrato ? '<div class="cte-aviso">Este depositante ainda não tem contrato de armazenagem: cadastre em Contratos para a cobrança mensal.</div>' : ''}
      <div class="oc-form">
        <div class="campo"><label for="enDoc">CNPJ/CPF do depositante</label><input id="enDoc" class="cte-entrada" value="${esc(p.depositante_doc || '')}" /></div>
        <div class="campo"><label for="enNome">Depositante</label><input id="enNome" class="cte-entrada" value="${esc(p.depositante_nome || '')}" /></div>
        <div class="campo"><label for="enNf">Nº da NF</label><input id="enNf" class="cte-entrada" value="${esc(p.nf_numero || '')}" /></div>
        <div class="campo"><label for="enData">Data da entrada</label><input id="enData" type="date" class="cte-entrada" value="${hoje()}" max="${hoje()}" /></div>
        <div class="campo"><label for="enEnd">Endereço no armazém (padrão)</label><input id="enEnd" class="cte-entrada" placeholder="Rua-prédio-nível, ex.: A-01-02" /></div>
        <div class="campo"><label for="enObs">Observação</label><input id="enObs" class="cte-entrada" maxlength="500" /></div>
        <div class="campo"><label for="enPeso">Peso total (kg)</label><input id="enPeso" class="cte-entrada" value="${esc(p.peso_kg || '')}" /></div>
        <div class="campo"><label for="enVol">Volumes (caixas)</label><input id="enVol" class="cte-entrada" value="${esc(p.volumes || '')}" /></div>
        <div class="campo"><label for="enPal">Paletes</label><input id="enPal" class="cte-entrada" /></div>
        <div class="campo"><label for="enM3">m³</label><input id="enM3" class="cte-entrada" /></div>
      </div>
      <p class="edi-dica">Peso, volumes, paletes e m³ são da nota inteira: o sistema reparte entre os produtos pelo valor.</p>
      <div class="edi-rolagem"><table class="edi-tabela" id="enItens"><thead><tr><th>Código</th><th>Produto</th><th>Un.</th><th>Qtd</th><th>Valor R$</th><th>Lote</th><th>Validade</th><th>Endereço</th><th></th></tr></thead>
        <tbody>${(p.itens?.length ? p.itens : [{}]).map(linhaItem).join('')}</tbody></table></div>
      <button class="btn btn-secundario" id="enMais" style="width:auto; margin-top:6px;">＋ Produto</button>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;"><button class="btn btn-secundario" data-ar-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="enSalvar" style="width:auto;">Dar entrada</button></div>`);
    const tb = $('enItens').querySelector('tbody');
    tb.addEventListener('click', (e) => { if (e.target.closest('[data-ar-tira]') && tb.rows.length > 1) e.target.closest('tr').remove(); });
    $('enMais').addEventListener('click', () => tb.insertAdjacentHTML('beforeend', linhaItem()));
    $('enXml').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const prev = await api('/entrada/xml', { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: await f.text() }); formEntrada(prev); } catch (err) { erro(err); }
    });
    $('enSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const itens = [...tb.rows].map((r) => Object.fromEntries([...r.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value]))).filter((i) => i.descricao.trim() || i.quantidade);
      b.disabled = true;
      try {
        const m = await enviar('/entrada', 'POST', { depositante_doc: $('enDoc').value, depositante_nome: $('enNome').value, nf_numero: $('enNf').value, nf_chave: p.nf_chave || '', data: $('enData').value,
          endereco: $('enEnd').value, observacao: $('enObs').value, peso_kg: $('enPeso').value, volumes: $('enVol').value, paletes: $('enPal').value, volume_m3: $('enM3').value, itens });
        fechar(); mostrarAlerta(`Entrada nº ${m.id} registrada.`, { tipo: 'sucesso' }); imprimir(m.id); carregar().catch(erro);
      } catch (err) { b.disabled = false; erro(err); }
    });
  }
  $('arEntrada').addEventListener('click', () => (geral ? Promise.resolve() : api('').then((g) => { geral = g; })).then(() => formEntrada()).catch(erro));

  // Saída: escolhe o depositante e as quantidades de cada lote (ou vem do pedido do portal).
  async function formSaida(doc = '', pedido = null) {
    if (!geral) geral = await api('');
    const lotes = doc ? await api(`/estoque?depositante=${doc}`) : [];
    const pedidoQtd = new Map((pedido?.itens || []).map((i) => [i.lote_id, i.quantidade]));
    abrirModal(`${cab(pedido ? `Atender o pedido de saída nº ${pedido.id}` : '− Saída do armazém')}
      <div class="oc-form">
        <div class="campo inteiro"><label for="saDep">Depositante</label><select id="saDep" class="cte-entrada" ${pedido ? 'disabled' : ''}>${opcoesDep(doc, false)}</select></div>
        <div class="campo"><label for="saDest">Destinatário</label><input id="saDest" class="cte-entrada" value="${esc(pedido?.destinatario || '')}" /></div>
        <div class="campo"><label for="saNf">NF de saída (do depositante)</label><input id="saNf" class="cte-entrada" value="${esc(pedido?.nf_numero || '')}" /></div>
        <div class="campo"><label for="saCte">CT-e do transporte (opcional)</label><input id="saCte" class="cte-entrada" placeholder="nº ou chave" /></div>
        <div class="campo"><label for="saData">Data</label><input id="saData" type="date" class="cte-entrada" value="${hoje()}" max="${hoje()}" /></div>
        <div class="campo inteiro"><label for="saObs">Observação</label><input id="saObs" class="cte-entrada" maxlength="500" value="${esc(pedido?.observacao || '')}" /></div>
      </div>
      ${doc ? (lotes.length ? `<div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Endereço</th><th>Produto</th><th>Lote / validade</th><th class="n">Saldo</th><th class="n">Sai</th></tr></thead><tbody>
        ${lotes.map((l) => `<tr><td><b>${esc(l.endereco || '—')}</b></td><td>${esc(l.descricao)}<br><small style="color:var(--texto-fraco);">${esc(l.produto_codigo || '')}</small></td><td>${esc(l.lote || '—')}${l.validade ? `<br><small>val. ${dia(l.validade)}</small>` : ''}</td>
          <td class="n">${n(l.saldo, 4)} ${esc(l.unidade || '')}</td><td class="n"><input class="cte-entrada" data-sa-lote="${l.id}" type="number" min="0" max="${l.saldo}" step="any" value="${pedidoQtd.get(l.id) ?? ''}" style="width:90px;" /></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="kanban-vazio">Esse depositante não tem mercadoria guardada.</div>') : '<p class="edi-dica">Escolha o depositante para ver o estoque.</p>'}
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;"><button class="btn btn-secundario" data-ar-fechar style="width:auto;">Fechar</button>${doc ? '<button class="btn btn-primario" id="saSalvar" style="width:auto;">Dar saída e imprimir a separação</button>' : ''}</div>`);
    $('saDep').addEventListener('change', (e) => formSaida(e.target.value).catch(erro));
    $('saSalvar')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const m = await enviar('/saida', 'POST', { depositante_doc: doc, destinatario: $('saDest').value, nf_numero: $('saNf').value, cte: $('saCte').value, data: $('saData').value, observacao: $('saObs').value,
          pedido_id: pedido?.id || null, itens: [...document.querySelectorAll('[data-sa-lote]')].filter((i) => Number(i.value) > 0).map((i) => ({ lote_id: Number(i.dataset.saLote), quantidade: i.value })) });
        fechar(); mostrarAlerta(`Saída nº ${m.id} registrada.`, { tipo: 'sucesso' }); imprimir(m.id); carregar().catch(erro);
      } catch (err) { b.disabled = false; erro(err); }
    });
  }
  $('arSaida').addEventListener('click', () => formSaida(est.dep).catch(erro));

  // ---------- Pedidos do portal ----------
  async function abaPedidos() {
    const ps = await api(`/pedidos?status=${est.pstatus}`);
    $('arAba').innerHTML = `<div class="oc-filtros" style="margin-bottom:10px;">${[['pendente', 'Pendentes'], ['atendido', 'Atendidos'], ['cancelado', 'Cancelados'], ['todos', 'Todos']].map(([k, t]) => `<button class="oc-filtro ${est.pstatus === k ? 'ativo' : ''}" data-ar-ps="${k}">${t}</button>`).join('')}</div>
      <div class="painel oc-painel"><div class="edi-rolagem">${ps.length ? `<table class="edi-tabela"><thead><tr><th>Nº</th><th>Pedido em</th><th>Depositante</th><th>Itens</th><th>Destino / NF</th><th>Situação</th><th></th></tr></thead><tbody>
        ${ps.map((p) => `<tr><td>${p.id}</td><td>${diaTs(p.criado_em)}<br><small>${esc(p.solicitante || '')}</small></td><td>${esc(p.depositante_nome || docFmt(p.depositante_doc))}</td>
          <td><small>${p.itens.map((i) => `${n(i.quantidade, 4)} ${esc(i.unidade || '')} ${esc(i.descricao)}`).join('<br>')}</small></td><td>${esc(p.destinatario || '')}${p.nf_numero ? `<br><small>NF ${esc(p.nf_numero)}</small>` : ''}${p.observacao ? `<br><small style="color:var(--texto-fraco);">${esc(p.observacao)}</small>` : ''}</td>
          <td><span class="oc-sit ${p.status === 'pendente' ? 'ocorrencia' : p.status === 'atendido' ? 'entregue' : 'cancelado'}">${esc(p.status)}</span>${p.motivo ? `<br><small>${esc(p.motivo)}</small>` : ''}${p.movimento_id ? `<br><small>saída nº ${p.movimento_id}</small>` : ''}</td>
          <td><div class="oc-linha-acoes">${p.status === 'pendente' ? `<button class="primario" data-ar-atender="${p.id}">Atender</button><button data-ar-pcanc="${p.id}">Recusar</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhum pedido aqui. O cliente pede a saída pelo portal (aba Armazém).</div>'}</div></div>`;
    document.querySelectorAll('[data-ar-ps]').forEach((b) => b.addEventListener('click', () => { est.pstatus = b.dataset.arPs; abaPedidos().catch(erro); }));
    document.querySelectorAll('[data-ar-atender]').forEach((b) => b.addEventListener('click', () => { const p = ps.find((x) => x.id === Number(b.dataset.arAtender)); formSaida(p.depositante_doc, p).catch(erro); }));
    document.querySelectorAll('[data-ar-pcanc]').forEach((b) => b.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo (o cliente vê no portal):', { titulo: 'Recusar o pedido de saída' });
      if (!motivo) return;
      try { await enviar(`/pedidos/${b.dataset.arPcanc}/cancelar`, 'POST', { motivo }); carregar().catch(erro); } catch (err) { erro(err); }
    }));
  }

  // ---------- Cobrança mensal ----------
  async function abaCobranca() {
    const lista = await api(`/cobranca?competencia=${est.competencia}`);
    const total = lista.reduce((s, x) => s + (x.cobranca ? x.cobranca.valor : x.medicao.total || 0), 0);
    $('arAba').innerHTML = `<div class="oc-barra" style="align-items:center;"><label style="display:flex; gap:8px; align-items:center;">Mês <input type="month" id="arComp" class="cte-entrada" value="${est.competencia}" max="${hoje().slice(0, 7)}" style="width:auto;" /></label>
        <span>Total do mês: <b>${brl(total)}</b></span></div>
      <div class="painel oc-painel"><div class="edi-rolagem">${lista.length ? `<table class="edi-tabela"><thead><tr><th>Depositante</th><th class="n">Armazenagem</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Ad valorem</th><th class="n">Total</th><th>NFS-e</th><th></th></tr></thead><tbody>
        ${lista.map((x) => { const m = x.medicao; const c = x.contrato; return `<tr><td><b>${esc(c.depositante_nome)}</b><br><small style="color:var(--texto-fraco);">${esc(geral.bases[c.base]?.nome || c.base)}: ${brl(c.preco_dia)}/dia${c.minimo_mes ? ` · mín. ${brl(c.minimo_mes)}` : ''}</small></td>
          ${m.erro ? `<td colspan="5"><small>${esc(m.erro)}</small></td>` : `<td class="n">${brl(m.armazenagem)}<br><small style="color:var(--texto-fraco);">${n(m.unidades_dia, 2)} ${esc(geral.bases[c.base]?.curto || '')}-dia · pico ${n(m.pico, 2)}</small></td>
          <td class="n">${brl(m.taxa_entrada)}<br><small style="color:var(--texto-fraco);">${n(m.entradas, 2)}</small></td><td class="n">${brl(m.taxa_saida)}<br><small style="color:var(--texto-fraco);">${n(m.saidas, 2)}</small></td>
          <td class="n">${brl(m.ad_valorem)}<br><small style="color:var(--texto-fraco);">s/ ${brl(m.valor_medio)}</small></td><td class="n"><b>${brl(x.cobranca ? x.cobranca.valor : m.total)}</b>${m.total > m.soma && m.soma > 0 ? '<br><small>mínimo</small>' : ''}${m.fechado ? '' : '<br><small style="color:#d97706;">mês em andamento</small>'}</td>`}
          <td>${x.cobranca ? `NFS-e ${esc(x.cobranca.nfse_numero || '')} <small>${esc(x.cobranca.nfse_status || 'excluída')}</small>` : '—'}</td>
          <td><div class="oc-linha-acoes">${!m.erro ? `<button data-ar-dia="${c.id}">Dia a dia</button>` : ''}${financeiro && !x.cobranca && m.fechado && m.total > 0 ? `<button class="primario" data-ar-gerar="${c.id}">Gerar NFS-e</button>` : ''}${financeiro && x.cobranca ? `<button data-ar-ccanc="${x.cobranca.id}">Cancelar</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhum contrato ativo. Cadastre em Contratos.</div>'}</div></div>
      <p class="edi-dica" style="margin-top:10px;">Armazenagem = soma, dia a dia, do que estava guardado no fim de cada dia (na unidade do contrato) × preço por dia. Entradas e saídas pelas taxas do contrato. Ad valorem = % ao mês sobre o valor médio guardado. Abaixo do mínimo, cobra o mínimo. A NFS-e sai como rascunho (serviço 11.04.01): confira, transmita e fature como as outras.</p>`;
    $('arComp').addEventListener('change', (e) => { est.competencia = e.target.value || mesPassado(); abaCobranca().catch(erro); });
    document.querySelectorAll('[data-ar-gerar]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { const r = await enviar('/cobranca', 'POST', { contrato_id: Number(b.dataset.arGerar), competencia: est.competencia }); mostrarAlerta(`NFS-e de ${brl(r.valor)} criada como rascunho: transmita em NFS-e.`, { tipo: 'sucesso' }); abaCobranca().catch(erro); } catch (err) { b.disabled = false; erro(err); }
    }));
    document.querySelectorAll('[data-ar-ccanc]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Cancelar a cobrança deste mês? O rascunho da NFS-e é excluído (NFS-e já autorizada precisa ser cancelada antes).', { textoOk: 'Cancelar cobrança' })) return;
      try { await api(`/cobranca/${b.dataset.arCcanc}/cancelar`, { method: 'POST' }); abaCobranca().catch(erro); } catch (err) { erro(err); }
    }));
    document.querySelectorAll('[data-ar-dia]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const c = lista.find((x) => x.contrato.id === Number(b.dataset.arDia)).contrato;
        const m = await api(`/cobranca/${c.id}/medicao?competencia=${est.competencia}`);
        abrirModal(`${cab(`Ocupação dia a dia — ${esc(c.depositante_nome)}`)}<div class="edi-rolagem" style="max-height:60vh;"><table class="edi-tabela"><thead><tr><th>Dia</th><th class="n">Ocupação (${esc(geral.bases[c.base]?.curto || '')})</th><th class="n">Valor guardado</th><th class="n">Diária</th></tr></thead><tbody>
          ${m.diario.map((d) => `<tr><td>${dia(d.dia)}</td><td class="n">${n(d.ocupacao, 3)}</td><td class="n">${brl(d.valor)}</td><td class="n">${brl(Math.max(0, d.ocupacao) * c.preco_dia)}</td></tr>`).join('')}</tbody></table></div>
          <p style="margin-top:8px;"><b>${n(m.unidades_dia, 3)}</b> ${esc(geral.bases[c.base]?.curto || '')}-dia × ${brl(c.preco_dia)} = <b>${brl(m.armazenagem)}</b></p>`);
      } catch (err) { erro(err); }
    }));
  }

  // ---------- Contratos ----------
  async function abaContratos() {
    const cs = await api('/contratos');
    $('arAba').innerHTML = `<div class="oc-barra">${financeiro ? '<button class="btn btn-primario" id="arNovoCt" style="width:auto;">＋ Contrato</button>' : '<small>Contratos: o financeiro cadastra.</small>'}</div>
      <div class="painel oc-painel"><div class="edi-rolagem">${cs.length ? `<table class="edi-tabela"><thead><tr><th>Depositante</th><th>Cobra por</th><th class="n">Diária</th><th class="n">Entrada</th><th class="n">Saída</th><th class="n">Ad valorem</th><th class="n">Mínimo/mês</th><th></th></tr></thead><tbody>
        ${cs.map((c) => `<tr${c.ativo ? '' : ' style="opacity:.55;"'}><td><b>${esc(c.depositante_nome)}</b><br><small style="color:var(--texto-fraco);">${esc(docFmt(c.depositante_doc))}${c.observacao ? ` · ${esc(c.observacao)}` : ''}</small></td>
          <td>${esc(geral.bases[c.base]?.nome || c.base)}</td><td class="n">${brl(c.preco_dia)}</td><td class="n">${brl(c.taxa_entrada)}</td><td class="n">${brl(c.taxa_saida)}</td><td class="n">${n(c.ad_valorem, 4)}%</td><td class="n">${brl(c.minimo_mes)}</td>
          <td>${financeiro ? `<div class="oc-linha-acoes"><button data-ar-ct="${c.id}">Editar</button></div>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhum contrato. Cadastre o preço de armazenagem de cada depositante.</div>'}</div></div>`;
    $('arNovoCt')?.addEventListener('click', () => formContrato());
    document.querySelectorAll('[data-ar-ct]').forEach((b) => b.addEventListener('click', () => formContrato(cs.find((c) => c.id === Number(b.dataset.arCt)))));
  }
  function formContrato(c = null) {
    const v = c || { base: 'palete', ativo: true };
    const campo = (id, rot, val, extra = '') => `<div class="campo"><label for="${id}">${rot}</label><input id="${id}" class="cte-entrada" value="${esc(val ?? '')}" ${extra} /></div>`;
    const fmt = (x) => (x != null ? String(x).replace('.', ',') : '');
    abrirModal(`${cab(c ? `Contrato — ${esc(c.depositante_nome)}` : '＋ Contrato de armazenagem')}
      <div class="oc-form">${campo('ctDoc', 'CNPJ/CPF do depositante', v.depositante_doc)}${campo('ctNome', 'Depositante', v.depositante_nome)}
        <div class="campo"><label for="ctBase">Cobra por</label><select id="ctBase" class="cte-entrada">${Object.entries(geral.bases).map(([k, b]) => `<option value="${k}" ${k === v.base ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></div>
        ${campo('ctDia', 'Diária (R$ por unidade por dia)', fmt(v.preco_dia))}${campo('ctEnt', 'Taxa de entrada (R$ por unidade)', fmt(v.taxa_entrada))}${campo('ctSai', 'Taxa de saída (R$ por unidade)', fmt(v.taxa_saida))}
        ${campo('ctAdv', 'Ad valorem (% ao mês sobre o valor guardado)', fmt(v.ad_valorem))}${campo('ctMin', 'Mínimo por mês (R$)', fmt(v.minimo_mes))}
        <label class="ag-check" style="align-self:end; margin-bottom:16px;"><input type="checkbox" id="ctAtivo" ${v.ativo ? 'checked' : ''} /> Ativo</label>
        <div class="campo inteiro"><label for="ctObs">Observação</label><input id="ctObs" class="cte-entrada" value="${esc(v.observacao || '')}" /></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ar-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="ctSalvar" style="width:auto;">Salvar</button></div>`);
    $('ctSalvar').addEventListener('click', async () => {
      const corpo = { depositante_doc: $('ctDoc').value, depositante_nome: $('ctNome').value, base: $('ctBase').value, preco_dia: $('ctDia').value, taxa_entrada: $('ctEnt').value, taxa_saida: $('ctSai').value,
        ad_valorem: $('ctAdv').value, minimo_mes: $('ctMin').value, ativo: $('ctAtivo').checked, observacao: $('ctObs').value };
      try { await (c ? enviar(`/contratos/${c.id}`, 'PUT', corpo) : enviar('/contratos', 'POST', corpo)); fechar(); mostrarAlerta('Contrato salvo.', { tipo: 'sucesso' }); carregar().catch(erro); } catch (err) { erro(err); }
    });
  }
})();
