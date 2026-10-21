// =====================================================================
// Controle de paletes (vale-palete): saldo por cliente/parceiro, vales
// abertos e vencidos, devolução, ajuste, cobrança por nota de débito.
// A troca em si é lançada na baixa da entrega/coleta (app do motorista
// ou Ocorrências). Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto, token.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro;
  const financeiro = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navPaletes');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/paletes${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const abrirPagina = (c) => window.open(`/api/paletes${c}?token=${encodeURIComponent(token)}`, '_blank');
  const modal = $('modalPaletes');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-pl-fechar]')) fechar(); });
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-pl-fechar>✕</span></div>`;
  const COR_VALE = { aberto: 'ocorrencia', devolvido: 'entregue', cobrado: 'em_transito', cancelado: 'cancelado' };
  const NOME_VALE = { aberto: 'Aberto', devolvido: 'Devolvido', cobrado: 'Cobrado', cancelado: 'Cancelado' };
  const est = { aba: 'saldos', vfiltro: 'abertos', busca: '' };
  let tipos = {};
  // CNPJ no lançamento: formata e traz o nome.
  window.Doc?.registrar('#plDoc', { razao_social: '#plNome' });

  const saldoTxt = (s) => (s > 0 ? `<b style="color:#d97706;">${s}</b><br><small style="color:var(--texto-fraco);">com o cliente (nos deve)</small>`
    : s < 0 ? `<b style="color:#ef4444;">${-s}</b><br><small style="color:var(--texto-fraco);">devemos a ele</small>` : '<b>0</b><br><small style="color:var(--texto-fraco);">zerado</small>');

  async function carregar() {
    const d = await api(`?busca=${encodeURIComponent(est.busca)}`);
    tipos = d.tipos;
    const t = d.totais;
    const abas = [['saldos', 'Saldos por cliente'], ['vales', 'Vales-palete'], ['notas', 'Notas de débito']];
    $('plConteudo').innerHTML = `
      <div class="oc-resumo">
        <div>Paletes com clientes<b>${t.com_clientes}</b><span>saldo a nosso favor</span></div>
        <div>Devemos a clientes<b>${t.devemos}</b><span>paletes deles conosco</span></div>
        <div>Em vale-palete<b>${t.em_vale}</b><span>assinados, a devolver</span></div>
        <div data-pl-vfiltro="vencidos" style="cursor:pointer;" title="Ver os vales vencidos">Vales vencidos<b style="color:${t.vencidos ? '#ef4444' : 'inherit'};">${t.vencidos}</b><span>passaram do prazo: cobre</span></div>
      </div>
      <div class="oc-barra" style="align-items:center;">
        <div class="oc-filtros">${abas.map(([k, n]) => `<button class="oc-filtro ${est.aba === k ? 'ativo' : ''}" data-pl-aba="${k}">${n}</button>`).join('')}</div>
        <input type="text" id="plBusca" class="cte-entrada" placeholder="Cliente, CNPJ, nº do vale ou CT-e" value="${esc(est.busca)}" style="max-width:260px;" />
      </div>
      <div id="plAba"></div>`;
    document.querySelectorAll('[data-pl-aba]').forEach((b) => b.addEventListener('click', () => { est.aba = b.dataset.plAba; carregar().catch(erro); }));
    document.querySelector('.oc-resumo [data-pl-vfiltro]').addEventListener('click', () => { est.aba = 'vales'; est.vfiltro = 'vencidos'; carregar().catch(erro); });
    let tm = null;
    $('plBusca').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(() => { est.busca = e.target.value.trim(); carregar().then(() => { const x = $('plBusca'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }).catch(erro); }, 400); });
    if (est.aba === 'saldos') abaSaldos(d);
    else if (est.aba === 'vales') await abaVales();
    else await abaNotas();
  }
  nav.addEventListener('click', () => carregar().catch(erro));

  function abaSaldos(d) {
    $('plAba').innerHTML = `<div class="painel oc-painel"><div class="edi-rolagem">${d.saldos.length ? `<table class="edi-tabela"><thead><tr><th>Cliente / parceiro</th><th>Tipo</th><th class="n">Saldo</th><th class="n">Em vale</th><th class="n">Saíram / voltaram</th><th>Último movimento</th><th></th></tr></thead><tbody>
      ${d.saldos.map((s) => `<tr><td><b>${esc(s.parte_nome)}</b><br><small style="color:var(--texto-fraco);">${esc(docFmt(s.parte_doc) || 'sem CNPJ')}</small></td><td>${esc(s.tipo_nome)}</td>
        <td class="n">${saldoTxt(s.saldo)}</td>
        <td class="n">${s.em_vale ? `${s.em_vale}<br><small style="color:${s.vencidos ? '#ef4444' : 'var(--texto-fraco)'};">${s.vales} vale(s)${s.vencidos ? `, ${s.vencidos} vencido(s)` : ''}</small>` : '—'}</td>
        <td class="n">${s.saidas || 0} / ${s.entradas || 0}</td><td>${dia(s.ultimo)}</td>
        <td><div class="oc-linha-acoes"><button class="primario" data-pl-extrato="${esc(s.chave)}">Extrato</button><button data-pl-devol="${s.chave}" data-tipo="${s.tipo_palete}">Devolução</button></div></td></tr>`).join('')}</tbody></table>`
    : '<div class="kanban-vazio">Nenhum palete fora de casa. A troca é lançada na baixa da entrega ou da coleta (app do motorista ou Ocorrências): o que não voltou vira vale-palete e aparece aqui.</div>'}</div></div>
      <p class="edi-dica" style="margin-top:10px;">Saldo = paletes que saíram da empresa para o cliente (deixados com a carga, vazios entregues na coleta) menos os que vieram dele. Positivo: o cliente nos deve paletes; negativo: devemos a ele.</p>`;
    document.querySelectorAll('[data-pl-extrato]').forEach((b) => b.addEventListener('click', () => extrato(b.dataset.plExtrato).catch(erro)));
    document.querySelectorAll('[data-pl-devol]').forEach((b) => b.addEventListener('click', () => {
      const s = d.saldos.find((x) => x.chave === b.dataset.plDevol && x.tipo_palete === b.dataset.tipo);
      lancamento({ origem: 'devolucao', parte_doc: s.parte_doc, parte_nome: s.parte_nome, tipo: s.tipo_palete, quantidade: Math.max(0, s.saldo) || '' });
    }));
  }

  async function abaVales() {
    const d = await api(`/vales?filtro=${est.vfiltro}&busca=${encodeURIComponent(est.busca)}`);
    const k = d.contagens;
    const filtros = [['abertos', 'Abertos'], ['vencidos', 'Vencidos'], ['devolvidos', 'Devolvidos'], ['cobrados', 'Cobrados'], ['cancelados', 'Cancelados'], ['todos', 'Todos']];
    $('plAba').innerHTML = `
      <div class="oc-filtros" style="margin-bottom:10px;">${filtros.map(([f, n]) => `<button class="oc-filtro ${est.vfiltro === f ? 'ativo' : ''} ${f === 'vencidos' ? 'perigo' : ''}" data-pl-vfiltro="${f}">${n}<span class="n">${k[f] ?? 0}</span></button>`).join('')}</div>
      <div class="oc-lote oculto" id="plLote"><b id="plLoteQtd"></b>${financeiro ? '<button class="btn btn-primario" id="plCobrar" style="width:auto;">💰 Cobrar (nota de débito)</button>' : '<small>Cobrar: pede o financeiro.</small>'}</div>
      <div class="painel oc-painel"><div class="edi-rolagem">${d.vales.length ? `<table class="edi-tabela"><thead><tr><th><input type="checkbox" id="plTodos" /></th><th>Vale</th><th>Cliente</th><th>Tipo</th><th class="n">Qtd</th><th class="n">Pendente</th><th>Devolver até</th><th>Situação</th><th></th></tr></thead><tbody>
        ${d.vales.map((v) => `<tr><td>${v.status === 'aberto' ? `<input type="checkbox" data-pl-marca="${v.id}" />` : ''}</td>
          <td><b>Nº ${v.numero}</b><br><small style="color:var(--texto-fraco);">${dia(v.emissao)}${v.cte_numero ? ` · CT-e ${esc(v.cte_serie)}/${esc(v.cte_numero)}` : ''}${v.recebedor_nome ? `<br>${esc(v.recebedor_nome)}` : ''}</small></td>
          <td>${esc(v.parte_nome)}<br><small style="color:var(--texto-fraco);">${esc(docFmt(v.parte_doc))}</small></td><td title="${esc(v.tipo_nome)}">${esc(v.tipo_nome.split(' ')[0])}</td>
          <td class="n">${v.quantidade}</td><td class="n"><b>${v.pendente}</b>${v.devolvidos ? `<br><small>${v.devolvidos} devolvido(s)</small>` : ''}${v.status === 'aberto' && v.valor_unitario ? `<br><small style="color:var(--texto-fraco);">${brl(v.pendente * v.valor_unitario)}</small>` : ''}</td>
          <td><span style="${v.vencido ? 'color:#ef4444; font-weight:600;' : ''}">${dia(v.vencimento)}${v.vencido ? ' · vencido' : ''}</span></td>
          <td><span class="oc-sit ${COR_VALE[v.status]}">${NOME_VALE[v.status]}</span>${v.motivo_cancelamento ? `<br><small>${esc(v.motivo_cancelamento)}</small>` : ''}</td>
          <td><div class="oc-linha-acoes"><button data-pl-imp="${v.id}" title="Imprimir para o cliente assinar">🖨</button>${v.status === 'aberto' ? `<button data-pl-vdev="${v.id}">Devolução</button><button data-pl-vcanc="${v.id}" title="Contagem errada ou cortesia: o pendente sai do saldo">Cancelar</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : `<div class="kanban-vazio">${est.vfiltro === 'abertos' ? 'Nenhum vale aberto. O vale sai sozinho na baixa da entrega quando voltam menos vazios do que os paletes deixados.' : 'Nada aqui.'}</div>`}</div></div>
      <p class="edi-dica" style="margin-top:10px;">O vale é o documento que quem recebeu a carga assina, reconhecendo os paletes que ficaram. Na devolução os vales são baixados do mais antigo para o mais novo. Vencido e não devolvido: marque e clique em <b>Cobrar</b>; sai uma <b>nota de débito</b> (valor do palete em ⚙) que entra na próxima fatura do cliente.</p>`;
    document.querySelectorAll('#plAba [data-pl-vfiltro]').forEach((b) => b.addEventListener('click', () => { est.vfiltro = b.dataset.plVfiltro; abaVales().catch(erro); }));
    const marcados = () => [...document.querySelectorAll('[data-pl-marca]:checked')].map((x) => Number(x.dataset.plMarca));
    const atualizar = () => {
      const ids = marcados(); $('plLote').classList.toggle('oculto', !ids.length);
      const vs = d.vales.filter((v) => ids.includes(v.id));
      $('plLoteQtd').textContent = `${ids.length} vale(s) · ${vs.reduce((t, v) => t + v.pendente, 0)} palete(s) · ${brl(vs.reduce((t, v) => t + v.pendente * v.valor_unitario, 0))}`;
    };
    document.querySelectorAll('[data-pl-marca]').forEach((x) => x.addEventListener('change', atualizar));
    $('plTodos')?.addEventListener('change', (e) => { document.querySelectorAll('[data-pl-marca]').forEach((x) => { x.checked = e.target.checked; }); atualizar(); });
    $('plCobrar')?.addEventListener('click', async (e) => {
      const ids = marcados();
      const b = e.currentTarget;
      if (!await confirmar(`Cobrar ${ids.length} vale(s)? Sai uma nota de débito por cliente, com o valor do palete configurado; ela entra na fatura do cliente (Faturamento → A faturar).`, { textoOk: 'Cobrar' })) return;
      b.disabled = true;
      try {
        const r = await enviar('/cobrar', 'POST', { ids });
        mostrarAlerta(`Nota(s) de débito: ${r.notas.map((n) => `nº ${n.numero} — ${n.tomador_nome} (${brl(n.valor)})`).join('; ')}. Fature em Faturamento → A faturar.`, { tipo: 'sucesso' });
        carregar().catch(erro);
      } catch (err) { b.disabled = false; erro(err); }
    });
    document.querySelectorAll('[data-pl-imp]').forEach((b) => b.addEventListener('click', () => abrirPagina(`/vales/${b.dataset.plImp}/imprimir`)));
    document.querySelectorAll('[data-pl-vdev]').forEach((b) => b.addEventListener('click', () => {
      const v = d.vales.find((x) => x.id === Number(b.dataset.plVdev));
      lancamento({ origem: 'devolucao', parte_doc: v.parte_doc, parte_nome: v.parte_nome, tipo: v.tipo_palete, quantidade: v.pendente, vale_id: v.id, vale_numero: v.numero });
    }));
    document.querySelectorAll('[data-pl-vcanc]').forEach((b) => b.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo do cancelamento (o pendente do vale sai do saldo do cliente):', { titulo: 'Cancelar vale-palete' });
      if (!motivo) return;
      try { await enviar(`/vales/${b.dataset.plVcanc}/cancelar`, 'POST', { motivo }); mostrarAlerta('Vale cancelado.', { tipo: 'sucesso' }); carregar().catch(erro); } catch (err) { erro(err); }
    }));
  }

  async function abaNotas() {
    const ns = await api('/notas');
    $('plAba').innerHTML = `<div class="painel oc-painel"><div class="edi-rolagem">${ns.length ? `<table class="edi-tabela"><thead><tr><th>Nota</th><th>Cliente</th><th>Descrição</th><th class="n">Valor</th><th>Fatura</th><th></th></tr></thead><tbody>
      ${ns.map((n) => `<tr${n.status === 'cancelada' ? ' style="opacity:.55;"' : ''}><td><b>Nº ${n.numero}</b><br><small style="color:var(--texto-fraco);">${dia(n.emissao)}</small></td>
        <td>${esc(n.tomador_nome)}<br><small style="color:var(--texto-fraco);">${esc(docFmt(n.tomador_doc))}</small></td><td><small>${esc(n.descricao)}</small></td><td class="n"><b>${brl(n.valor)}</b></td>
        <td>${n.status === 'cancelada' ? `<span class="oc-sit cancelado">Cancelada</span>${n.motivo_cancelamento ? `<br><small>${esc(n.motivo_cancelamento)}</small>` : ''}` : n.fatura_numero && n.fatura_status !== 'cancelada' ? `Fatura ${n.fatura_numero}<br><small>${esc(n.fatura_status)}</small>` : '<small style="color:#d97706;">a faturar</small>'}</td>
        <td><div class="oc-linha-acoes"><button data-pl-nimp="${n.id}">🖨</button>${financeiro && n.status !== 'cancelada' && !(n.fatura_numero && n.fatura_status !== 'cancelada') ? `<button data-pl-ncanc="${n.id}">Cancelar</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
    : '<div class="kanban-vazio">Nenhuma nota de débito. Elas saem da cobrança dos vales vencidos.</div>'}</div></div>
      <p class="edi-dica" style="margin-top:10px;">A nota de débito é cobrança de ressarcimento (não é nota fiscal) e entra na fatura do cliente junto com os CT-e. Cancelar a nota reabre os vales (cancele antes a fatura, se já faturou).</p>`;
    document.querySelectorAll('[data-pl-nimp]').forEach((b) => b.addEventListener('click', () => abrirPagina(`/notas/${b.dataset.plNimp}/imprimir`)));
    document.querySelectorAll('[data-pl-ncanc]').forEach((b) => b.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo do cancelamento da nota de débito (os vales voltam a ficar abertos):', { titulo: 'Cancelar nota de débito' });
      if (!motivo) return;
      try { await enviar(`/notas/${b.dataset.plNcanc}/cancelar`, 'POST', { motivo }); mostrarAlerta('Nota cancelada; os vales voltaram a ficar abertos.', { tipo: 'sucesso' }); carregar().catch(erro); } catch (err) { erro(err); }
    }));
  }

  async function extrato(chave) {
    const d = await api(`/extrato/${encodeURIComponent(chave)}`);
    const saldo = Object.entries(d.saldo).filter(([, v]) => v !== 0).map(([t, v]) => `${esc(tipos[t] || t)}: ${v > 0 ? `${v} com o cliente` : `devemos ${-v}`}`).join(' · ') || 'zerado';
    modal.classList.remove('oculto');
    $('plModal').innerHTML = `${cab(`🟫 ${esc(d.parte_nome)}`)}
      <p style="margin:0 0 10px;">${esc(docFmt(d.parte_doc) || '')} · <b>Saldo:</b> ${saldo}</p>
      <div class="edi-rolagem" style="max-height:52vh;"><table class="edi-tabela"><thead><tr><th>Data</th><th>Movimento</th><th>Tipo</th><th class="n">Saiu</th><th class="n">Voltou</th><th class="n">Saldo</th><th>Documento</th><th></th></tr></thead><tbody>
      ${d.movimentos.map((m) => `<tr><td>${dia(m.data)}</td><td>${esc(m.origem_nome)}${m.observacao ? `<br><small style="color:var(--texto-fraco);">${esc(m.observacao)}</small>` : ''}</td><td>${esc(m.tipo_nome)}</td>
        <td class="n">${m.sentido === 'saida' ? m.quantidade : ''}</td><td class="n">${m.sentido === 'entrada' ? m.quantidade : ''}</td><td class="n"><b>${m.saldo}</b></td>
        <td><small>${m.cte_numero ? `CT-e ${esc(m.cte_serie)}/${esc(m.cte_numero)}` : m.coleta_id ? `Coleta ${m.coleta_id}` : m.nota_numero ? `ND ${m.nota_numero}` : ''}${m.usuario_nome ? `<br>${esc(m.usuario_nome)}` : ''}</small></td>
        <td>${['devolucao', 'envio', 'ajuste'].includes(m.origem) ? `<div class="oc-linha-acoes"><button data-pl-mexc="${m.id}" title="Excluir este lançamento">✕</button></div>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${d.vales.length ? `<h4 style="margin:14px 0 6px;">Vales</h4><p style="margin:0; font-size:13px;">${d.vales.map((v) => `Nº ${v.numero}: ${v.quantidade} ${esc(v.tipo_nome.split(' ')[0])}, ${NOME_VALE[v.status].toLowerCase()}${v.status === 'aberto' ? ` (pendente ${v.pendente}, até ${dia(v.vencimento)})` : ''}`).join(' · ')}</p>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;"><button class="btn btn-secundario" data-pl-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="plExtLancar" style="width:auto;">＋ Lançar</button></div>`;
    $('plExtLancar').addEventListener('click', () => lancamento({ origem: 'devolucao', parte_doc: d.parte_doc, parte_nome: d.parte_nome }));
    document.querySelectorAll('[data-pl-mexc]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Excluir este lançamento? Se ele baixou vales, eles voltam a ficar abertos.', { textoOk: 'Excluir' })) return;
      try { await api(`/movimentos/${b.dataset.plMexc}`, { method: 'DELETE' }); await extrato(chave); carregar().catch(() => {}); } catch (err) { erro(err); }
    }));
  }

  // Devolução (o cliente devolveu), envio/retorno (a empresa mandou paletes) ou ajuste.
  function lancamento(v = {}) {
    modal.classList.remove('oculto');
    $('plModal').innerHTML = `${cab('＋ Lançar movimento de paletes')}
      <div class="oc-form">
        <div class="campo"><label for="plOrigem">Movimento</label><select id="plOrigem">
          <option value="devolucao" ${v.origem === 'devolucao' ? 'selected' : ''}>Devolução: o cliente devolveu paletes</option>
          <option value="envio" ${v.origem === 'envio' ? 'selected' : ''}>Envio/retorno: a empresa entregou paletes a ele</option>
          <option value="ajuste" ${v.origem === 'ajuste' ? 'selected' : ''}>Ajuste de saldo (inventário)</option></select></div>
        <div class="campo oculto" id="plSentidoCampo"><label for="plSentido">Ajuste</label><select id="plSentido"><option value="entrada">Diminuir o que ele nos deve</option><option value="saida">Aumentar o que ele nos deve</option></select></div>
        <div class="campo"><label for="plDoc">CNPJ/CPF</label><input id="plDoc" class="cte-entrada" value="${esc(v.parte_doc || '')}" /></div>
        <div class="campo"><label for="plNome">Nome</label><input id="plNome" class="cte-entrada" value="${esc(v.parte_nome || '')}" /></div>
        <div class="campo"><label for="plTipo">Tipo de palete</label><select id="plTipo">${Object.entries(tipos).map(([k, n]) => `<option value="${k}" ${k === (v.tipo || 'pbr') ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="campo"><label for="plQtd">Quantidade</label><input id="plQtd" type="number" min="1" class="cte-entrada" value="${esc(v.quantidade ?? '')}" /></div>
        <div class="campo"><label for="plData">Data</label><input id="plData" type="date" class="cte-entrada" value="${hoje()}" max="${hoje()}" /></div>
        <div class="campo"><label for="plObs">Observação</label><input id="plObs" class="cte-entrada" maxlength="500" placeholder="Ex.: retirado pelo motorista Carlos" /></div>
      </div>
      ${v.vale_numero ? `<p class="edi-dica">Baixa primeiro o vale nº ${v.vale_numero}; o que passar, os outros vales abertos dele.</p>` : '<p class="edi-dica">Na devolução, os vales abertos do cliente são baixados do mais antigo para o mais novo.</p>'}
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-pl-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="plSalvar" style="width:auto;">Lançar</button></div>`;
    const ajustarSentido = () => $('plSentidoCampo').classList.toggle('oculto', $('plOrigem').value !== 'ajuste');
    $('plOrigem').addEventListener('change', ajustarSentido); ajustarSentido();
    $('plSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await enviar('/movimentos', 'POST', { origem: $('plOrigem').value, sentido: $('plSentido').value, parte_doc: $('plDoc').value, parte_nome: $('plNome').value, tipo: $('plTipo').value,
          quantidade: $('plQtd').value, data: $('plData').value, observacao: $('plObs').value, vale_id: v.vale_id || null });
        fechar();
        mostrarAlerta(`Lançado.${r.vales_baixados.length ? ` Baixou ${r.vales_baixados.reduce((t, x) => t + x.qtd, 0)} palete(s) em ${r.vales_baixados.length} vale(s).` : ''}`, { tipo: 'sucesso' });
        carregar().catch(erro);
      } catch (err) { b.disabled = false; erro(err); }
    });
  }
  $('plLancar').addEventListener('click', () => (Object.keys(tipos).length ? Promise.resolve() : api('/config').then((c) => { tipos = c.tipos; })).then(() => lancamento({ origem: 'devolucao' })).catch(erro));

  $('plConfig').addEventListener('click', async () => {
    let c;
    try { c = await api('/config'); } catch (err) { erro(err); return; }
    modal.classList.remove('oculto');
    $('plModal').innerHTML = `${cab('⚙ Valores e prazo dos paletes')}
      <div class="oc-form">
        <div class="campo"><label for="pcPrazo">Prazo para devolver (dias após a entrega)</label><input id="pcPrazo" type="number" min="1" max="365" class="cte-entrada" value="${c.prazo_dias}" /></div>
        <label class="ag-check" style="align-self:end; margin-bottom:16px;"><input type="checkbox" id="pcVale" ${c.gerar_vale ? 'checked' : ''} /> Gerar o vale-palete sozinho na baixa</label>
        ${Object.entries(c.tipos).map(([k, n]) => `<div class="campo"><label for="pcV_${k}">Valor de cobrança: ${esc(n)} (R$)</label><input id="pcV_${k}" data-pc-valor="${k}" class="cte-entrada" value="${String(c.valores[k] || 0).replace('.', ',')}" /></div>`).join('')}
      </div>
      <p class="edi-dica">O valor é o que vai na nota de débito por palete não devolvido (ex.: PBR novo). Só o financeiro altera.</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-pl-fechar style="width:auto;">Fechar</button>${financeiro ? '<button class="btn btn-primario" id="pcSalvar" style="width:auto;">Salvar</button>' : ''}</div>`;
    $('pcSalvar')?.addEventListener('click', async () => {
      const valores = {};
      document.querySelectorAll('[data-pc-valor]').forEach((i) => { valores[i.dataset.pcValor] = i.value; });
      try { await enviar('/config', 'PUT', { prazo_dias: $('pcPrazo').value, gerar_vale: $('pcVale').checked, valores }); fechar(); mostrarAlerta('Salvo.', { tipo: 'sucesso' }); } catch (err) { erro(err); }
    });
  });
})();
