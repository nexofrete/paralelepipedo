// =====================================================================
// Contas a pagar e acerto de viagem (motorista próprio e terceiro/agregado).
// Usa do dashboard.js: usuario, token, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const admin = usuario?.perfil === 'admin';
  const podeFinanceiro = admin || !!usuario?.pode_ver_financeiro;
  const podeAcerto = podeFinanceiro || !!usuario?.pode_emitir_cte;
  const nav = document.getElementById('navPagar');
  if (!podeAcerto || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num2 = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const p2 = (n) => String(n).padStart(2, '0');
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const json = async (url, opcoes = {}) => {
    const r = await apiFetch(url, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const modal = $('modalPagar');
  const fecharModal = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-cp-fechar]')) fecharModal(); });
  const titulo = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-cp-fechar>✕</span></div>`;

  let aba = podeFinanceiro ? 'contas' : 'acertos';
  let cat = null;
  let filtro = 'abertas'; let filtroAc = 'abertos'; let catAc = null;
  let centrosCc = null;   // centros de custo (campo da conta)
  if (!podeFinanceiro) { document.querySelector('[data-cp-aba="contas"]').classList.add('oculto'); $('cpNova').classList.add('oculto'); }
  const abasMap = { contas: 'cpAbaContas', acertos: 'cpAbaAcertos' };
  function mostrarAba(nome) {
    aba = nome;
    document.querySelectorAll('[data-cp-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.cpAba === nome));
    Object.entries(abasMap).forEach(([k, id]) => $(id).classList.toggle('oculto', k !== nome));
  }
  document.querySelectorAll('[data-cp-aba]').forEach((a) => a.addEventListener('click', () => { mostrarAba(a.dataset.cpAba); carregar().catch(erro); }));
  nav.addEventListener('click', () => { mostrarAba(aba); carregar().catch(erro); });
  const carregar = async () => {
    if (!cat && podeFinanceiro) cat = await json('/api/contas-pagar/categorias');
    if (!centrosCc && podeFinanceiro) centrosCc = (await json('/api/centros-custo').catch(() => ({ centros: [] }))).centros;
    if (!catAc) catAc = await json('/api/acertos/categorias');
    return aba === 'contas' ? telaContas() : telaAcertos();
  };
  $('cpNova').addEventListener('click', () => carregar().then(() => formConta()).catch(erro));
  $('axNovo').addEventListener('click', () => carregar().then(() => formAcerto()).catch(erro));

  // ======================= Contas a pagar =======================
  const FILTROS = [['abertas', 'Em aberto'], ['vencidas', 'Vencidas', 'perigo'], ['semana', 'Próximos 7 dias'], ['pagas', 'Pagas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']];
  async function telaContas() {
    const busca = $('cpBusca')?.value || ''; const categoria = $('cpCat')?.value || '';
    const r = await json(`/api/contas-pagar?${new URLSearchParams({ filtro, busca, categoria })}`);
    const s = r.resumo; const f = s.fluxo30 || {};
    $('cpAbaContas').innerHTML = `<div class="oc-resumo">
        <div>Vencidas<b style="${s.vencidas ? 'color:#ef4444;' : ''}">${brl(s.vencidas)}</b><span>${s.vencidas_qtd} conta(s)</span></div>
        <div>Vence hoje<b>${brl(s.hoje)}</b></div><div>Próximos 7 dias<b>${brl(s.semana)}</b></div>
        <div>Pago no mês<b>${brl(s.pago_mes)}</b></div>
        ${f.receber != null ? `<div>Próximos 30 dias<b style="color:${f.receber - f.pagar >= 0 ? 'var(--verde)' : '#ef4444'};">${brl(f.receber - f.pagar)}</b><span>entra ${brl(f.receber)} (faturas) · sai ${brl(f.pagar)}</span></div>` : ''}
      </div>
      <div class="painel oc-painel">
        <div class="oc-barra"><div class="oc-filtros">${FILTROS.map(([id, nome, cls]) => `<button class="oc-filtro ${filtro === id ? 'ativo' : ''} ${cls || ''}" data-cp-filtro="${id}">${nome}</button>`).join('')}</div>
          <div class="oc-busca"><select id="cpCat" class="cte-entrada" aria-label="Categoria"><option value="">Todas as categorias</option>${Object.entries(cat.categorias).map(([k, n]) => `<option value="${k}" ${k === categoria ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
            <input type="text" id="cpBusca" class="cte-entrada" placeholder="Descrição, fornecedor ou documento" value="${esc(busca)}" /></div></div>
        ${r.contas.length ? `<div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th class="n">Valor</th><th class="n">Falta</th><th>Situação</th><th></th></tr></thead><tbody>
          ${r.contas.map((c) => {
            const vencida = c.status === 'aberta' && String(c.vencimento).slice(0, 10) < hoje();
            return `<tr><td style="${vencida ? 'color:#ef4444; font-weight:600;' : ''}">${dia(c.vencimento)}</td>
              <td style="white-space:normal; min-width:220px; max-width:360px;">${esc(c.descricao)}${c.parcela ? ` <small>(${esc(c.parcela)})</small>` : ''}${c.documento ? `<br><small style="color:var(--texto-fraco);">doc. ${esc(c.documento)}</small>` : ''}</td>
              <td style="white-space:normal; max-width:200px;">${esc(c.fornecedor_nome || '')}</td><td><small>${esc(cat.categorias[c.categoria] || c.categoria)}</small></td>
              <td class="n">${brl(c.valor)}</td><td class="n">${c.status === 'aberta' ? `<b>${brl(c.falta)}</b>` : '—'}</td>
              <td><span class="oc-sit ${c.status === 'paga' ? 'entregue' : c.status === 'cancelada' ? 'cancelado' : vencida ? 'ocorrencia' : Number(c.valor_pago) > 0 ? 'em_transito' : 'pendente'}">${c.status === 'paga' ? `Paga ${dia(c.pago_em)}` : c.status === 'cancelada' ? 'Cancelada' : vencida ? 'Vencida' : Number(c.valor_pago) > 0 ? 'Parcial' : 'Em aberto'}</span></td>
              <td><div class="oc-linha-acoes">${c.status === 'aberta' ? `<button class="primario" data-cp-pagar="${c.id}">Pagar</button>` : ''}<button data-cp-abrir="${c.id}">Abrir</button></div></td></tr>`;
          }).join('')}
          <tr><th colspan="4">${r.contas.length} conta(s)</th><th class="n">${brl(r.contas.reduce((t, c) => t + Number(c.valor), 0))}</th><th class="n">${brl(r.contas.filter((c) => c.status === 'aberta').reduce((t, c) => t + Number(c.falta), 0))}</th><th colspan="2"></th></tr></tbody></table></div>`
          : '<div class="kanban-vazio">Nenhuma conta neste filtro.</div>'}</div>`;
    $('cpAbaContas').querySelectorAll('[data-cp-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.cpFiltro; telaContas().catch(erro); }));
    let t = null;
    $('cpBusca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => telaContas().then(() => { const i = $('cpBusca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }).catch(erro), 400); });
    $('cpCat').addEventListener('change', () => telaContas().catch(erro));
    $('cpAbaContas').querySelectorAll('[data-cp-pagar]').forEach((b) => b.addEventListener('click', () => abrirConta(Number(b.dataset.cpPagar), true).catch(erro)));
    $('cpAbaContas').querySelectorAll('[data-cp-abrir]').forEach((b) => b.addEventListener('click', () => abrirConta(Number(b.dataset.cpAbrir)).catch(erro)));
  }

  function formConta(c = null) {
    const v = (k) => esc(c?.[k] ?? '');
    $('cpModalConteudo').innerHTML = `${titulo(c ? `Conta ${c.id}` : '＋ Conta a pagar')}
      <div class="cte-grade" style="margin-top:12px;">
        <div class="campo largo"><label for="cpDesc">Descrição</label><input id="cpDesc" maxlength="200" value="${v('descricao')}" placeholder="Ex.: Diesel posto Rodovia, aluguel do galpão" /></div>
        <div class="campo"><label for="cpCategoria">Categoria</label><select id="cpCategoria">${Object.entries(cat.categorias).map(([k, n]) => `<option value="${k}" ${c?.categoria === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="campo"><label for="cpCentro">Centro de custo</label><select id="cpCentro"><option value="">${c ? '— nenhum —' : '— automático (veículo/filial) —'}</option>${(centrosCc || []).map((x) => `<option value="${x.id}" ${Number(c?.centro_custo_id) === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo largo"><label for="cpForn">Fornecedor</label><input id="cpForn" maxlength="200" value="${v('fornecedor_nome')}" /></div>
        <div class="campo"><label for="cpFornDoc">CNPJ / CPF</label><input id="cpFornDoc" maxlength="18" value="${v('fornecedor_doc')}" /></div>
        <div class="campo"><label for="cpDoc">Documento (NF, boleto)</label><input id="cpDoc" maxlength="60" value="${v('documento')}" /></div>
        <div class="campo"><label for="cpValor">${c ? 'Valor' : 'Valor (total)'}</label><input id="cpValor" inputmode="decimal" value="${c ? esc(num2(c.valor)) : ''}" /></div>
        <div class="campo"><label for="cpVenc">${c ? 'Vencimento' : '1º vencimento'}</label><input id="cpVenc" type="date" value="${c ? esc(String(c.vencimento).slice(0, 10)) : hoje()}" /></div>
        ${c ? '' : `<div class="campo"><label for="cpParcelas">Parcelas (mensais)</label><input id="cpParcelas" type="number" min="1" max="60" value="1" /></div>
          <div class="campo"><label for="cpDividir">O valor é</label><select id="cpDividir"><option value="true">o total (divide nas parcelas)</option><option value="false">de cada parcela (ex.: aluguel)</option></select></div>`}
        <div class="campo inteiro"><label for="cpObs">Observação</label><input id="cpObs" maxlength="2000" value="${v('observacao')}" /></div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-cp-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="cpSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('cpDesc').focus();
    $('cpSalvar').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const corpo = { descricao: $('cpDesc').value, categoria: $('cpCategoria').value, fornecedor_nome: $('cpForn').value, fornecedor_doc: $('cpFornDoc').value, documento: $('cpDoc').value,
          valor: $('cpValor').value, vencimento: $('cpVenc').value, observacao: $('cpObs').value, centro_custo_id: $('cpCentro').value || null, ...(c ? {} : { parcelas: $('cpParcelas').value, dividir: $('cpDividir').value }) };
        if (c) await json(`/api/contas-pagar/${c.id}`, { method: 'PUT', body: JSON.stringify(corpo) });
        else { const r = await json('/api/contas-pagar', { method: 'POST', body: JSON.stringify(corpo) }); if (r.length > 1) mostrarAlerta(`${r.length} parcelas lançadas.`, { tipo: 'sucesso' }); }
        fecharModal(); telaContas().catch(erro);
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  async function abrirConta(id, pagarJa = false) {
    const contasBx = await apiFetch('/api/bancos/contas/opcoes').then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const c = await json(`/api/contas-pagar/${id}`);
    const falta = Number(c.valor) - Number(c.valor_pago);
    $('cpModalConteudo').innerHTML = `${titulo(`💸 ${esc(c.descricao)}${c.parcela ? ` <small>(${esc(c.parcela)})</small>` : ''}`)}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px 18px; margin-top:12px; font-size:13.5px;">
        <div><span style="color:var(--texto-fraco); font-size:12px;">Fornecedor</span><br>${esc(c.fornecedor_nome || '—')}${c.fornecedor_doc ? `<br><small>${esc(c.fornecedor_doc)}</small>` : ''}</div>
        <div><span style="color:var(--texto-fraco); font-size:12px;">Categoria</span><br>${esc(cat.categorias[c.categoria] || c.categoria)}</div>
        <div><span style="color:var(--texto-fraco); font-size:12px;">Centro de custo</span><br>${esc((centrosCc || []).find((x) => x.id === Number(c.centro_custo_id))?.nome || '—')}</div>
        <div><span style="color:var(--texto-fraco); font-size:12px;">Vencimento</span><br><b>${dia(c.vencimento)}</b></div>
        <div><span style="color:var(--texto-fraco); font-size:12px;">Valor / pago / falta</span><br>${brl(c.valor)} · ${brl(c.valor_pago)} · <b>${brl(falta)}</b></div>
        ${c.documento ? `<div><span style="color:var(--texto-fraco); font-size:12px;">Documento</span><br>${esc(c.documento)}</div>` : ''}
        ${c.acerto_id ? `<div><span style="color:var(--texto-fraco); font-size:12px;">Origem</span><br><a href="#" id="cpVerAcerto">acerto de viagem ${c.acerto_id}</a></div>` : ''}
      </div>
      ${c.observacao ? `<p style="font-size:13px; white-space:pre-line;">${esc(c.observacao)}</p>` : ''}
      ${c.pagamentos.length ? `<h4 style="margin:14px 0 6px;">Pagamentos</h4><table class="edi-tabela"><tbody>${c.pagamentos.map((p) => `<tr><td>${dia(p.data)}</td><td>${esc(p.forma)}</td><td class="n">${brl(p.valor)}</td><td><small>${esc(p.observacao || '')} · ${esc(p.usuario_nome || '')}</small></td>
        <td><button class="btn btn-secundario" data-cp-estornar="${p.id}" style="width:auto; padding:3px 8px; font-size:12px;">estornar</button></td></tr>`).join('')}</tbody></table>` : ''}
      ${c.parcelas.length > 1 ? `<h4 style="margin:14px 0 6px;">Parcelas</h4><div style="display:flex; gap:6px; flex-wrap:wrap;">${c.parcelas.map((p) => `<span class="oc-sit ${p.status === 'paga' ? 'entregue' : p.status === 'cancelada' ? 'cancelado' : 'pendente'}" style="${p.id === c.id ? 'outline:2px solid var(--azul);' : ''}">${esc(p.parcela)} · ${dia(p.vencimento)} · ${brl(p.valor)}</span>`).join('')}</div>` : ''}
      ${c.status === 'aberta' ? `<div class="cte-secao" style="margin-top:14px;"><h4>Registrar pagamento</h4><div class="cte-grade">
          <div class="campo"><label for="cpPgData">Data</label><input id="cpPgData" type="date" value="${hoje()}" /></div>
          <div class="campo"><label for="cpPgValor">Valor</label><input id="cpPgValor" inputmode="decimal" value="${esc(num2(falta))}" /></div>
          <div class="campo"><label for="cpPgForma">Forma</label><select id="cpPgForma">${cat.formas.map((f) => `<option>${f}</option>`).join('')}</select></div>
          ${contasBx.length ? `<div class="campo"><label for="cpPgConta">Conta</label><select id="cpPgConta">${contasBx.map((x) => `<option value="${x.id}" ${x.padrao ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>` : ''}
          <div class="campo"><label for="cpPgObs">Observação</label><input id="cpPgObs" maxlength="255" /></div></div>
          <button class="btn btn-primario" id="cpPgOk" style="width:auto;">✓ Pagar</button></div>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:14px;">
        ${c.status === 'aberta' && !Number(c.valor_pago) ? '<button class="btn btn-secundario" id="cpCancelar" style="width:auto; color:var(--vermelho);">Cancelar conta</button>' : ''}
        ${c.status === 'aberta' && !c.acerto_id ? '<button class="btn btn-secundario" id="cpEditar" style="width:auto;">Editar</button>' : ''}</div>`;
    modal.classList.remove('oculto');
    if (pagarJa) $('cpPgValor')?.focus();
    const depois = async () => { await abrirConta(id); telaContas().catch(() => {}); };
    $('cpPgForma')?.addEventListener('change', (e) => { const sel = $('cpPgConta'); if (!sel) return; const alvo = contasBx.find((x) => (e.target.value === 'dinheiro' ? x.tipo === 'caixa' : x.padrao)) || contasBx.find((x) => x.tipo === 'banco'); if (alvo) sel.value = alvo.id; });
    $('cpPgOk')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { await json(`/api/contas-pagar/${id}/pagar`, { method: 'POST', body: JSON.stringify({ data: $('cpPgData').value, valor: $('cpPgValor').value, forma: $('cpPgForma').value, observacao: $('cpPgObs').value, conta_bancaria_id: $('cpPgConta')?.value || undefined }) }); await depois(); } catch (err) { erro(err); b.disabled = false; }
    });
    $('cpModalConteudo').querySelectorAll('[data-cp-estornar]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Estornar este pagamento? A conta volta a ficar em aberto.', { tipo: 'perigo', textoOk: 'Estornar' })) return;
      try { await json(`/api/contas-pagar/${id}/pagamentos/${b.dataset.cpEstornar}`, { method: 'DELETE' }); await depois(); } catch (err) { erro(err); }
    }));
    $('cpCancelar')?.addEventListener('click', async () => {
      const motivo = await pedirTexto('Por que cancelar esta conta?', { titulo: 'Cancelar conta', textoOk: 'Cancelar conta' });
      if (motivo == null) return;
      try { await json(`/api/contas-pagar/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) }); await depois(); } catch (err) { erro(err); }
    });
    $('cpEditar')?.addEventListener('click', () => formConta(c));
    $('cpVerAcerto')?.addEventListener('click', (e) => { e.preventDefault(); mostrarAba('acertos'); abrirAcerto(c.acerto_id).catch(erro); });
  }

  // ======================= Acertos de viagem =======================
  async function telaAcertos() {
    const lista = await json(`/api/acertos?filtro=${filtroAc}`);
    const abertos = lista.filter((a) => a.status === 'aberto');
    $('cpAbaAcertos').innerHTML = `<div class="painel oc-painel">
      <div class="oc-barra"><div class="oc-filtros">${[['abertos', 'Em aberto'], ['acertados', 'Acertados'], ['todos', 'Todos']].map(([id, n]) => `<button class="oc-filtro ${filtroAc === id ? 'ativo' : ''}" data-ax-filtro="${id}">${n}</button>`).join('')}</div>
        ${filtroAc === 'abertos' && abertos.length ? `<span style="font-size:13px; color:var(--texto-fraco);">${abertos.length} viagem(ns) aguardando acerto · adiantado ${brl(abertos.reduce((s, a) => s + Number(a.adiantamento), 0))}</span>` : ''}</div>
      ${lista.length ? `<table class="edi-tabela"><thead><tr><th>Nº</th><th>Saída</th><th>Motorista</th><th>Tipo</th><th>Viagem</th><th class="n">Frete / despesas</th><th class="n">Adiantamento</th><th class="n">Saldo</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lista.map((a) => `<tr><td><b>${a.id}</b></td><td>${dia(a.data_saida)}</td><td>${esc(a.motorista_nome)}${a.placa ? `<br><small>${esc(a.placa)}</small>` : ''}</td>
          <td>${a.tipo === 'terceiro' ? 'Terceiro' : 'Próprio'}</td><td><small>${esc(a.descricao || '')}${a.mdfe_numero ? ` · MDF-e ${esc(a.mdfe_numero)}` : ''}</small></td>
          <td class="n">${a.tipo === 'terceiro' ? brl(a.valor_frete) : brl(a.totais.despesas)}</td><td class="n">${brl(a.adiantamento)}</td>
          <td class="n" style="font-weight:600; color:${a.totais.saldo < 0 ? '#d97706' : 'inherit'};">${brl(Math.abs(a.totais.saldo))}<br><small style="font-weight:400;">${a.totais.saldo > 0 ? 'a pagar' : a.totais.saldo < 0 ? 'a devolver' : ''}</small></td>
          <td><span class="oc-sit ${a.status === 'acertado' ? 'entregue' : a.status === 'cancelado' ? 'cancelado' : 'pendente'}">${{ aberto: 'Em aberto', acertado: 'Acertado', cancelado: 'Cancelado' }[a.status]}</span></td>
          <td><div class="oc-linha-acoes"><button class="primario" data-ax-abrir="${a.id}">Abrir</button></div></td></tr>`).join('')}</tbody></table>`
        : '<div class="kanban-vazio">Nenhum acerto neste filtro. Abra um acerto quando o motorista sair para a viagem (com o adiantamento) e feche quando ele voltar.</div>'}</div>`;
    $('cpAbaAcertos').querySelectorAll('[data-ax-filtro]').forEach((b) => b.addEventListener('click', () => { filtroAc = b.dataset.axFiltro; telaAcertos().catch(erro); }));
    $('cpAbaAcertos').querySelectorAll('[data-ax-abrir]').forEach((b) => b.addEventListener('click', () => abrirAcerto(Number(b.dataset.axAbrir)).catch(erro)));
  }

  async function formAcerto(a = null) {
    const [mdfes, motoristas] = await Promise.all([json('/api/acertos/mdfes').catch(() => []), json('/api/mdfe/motoristas').catch(() => [])]);
    const v = (k) => esc(a?.[k] ?? '');
    const terceiro = a?.tipo === 'terceiro';
    $('cpModalConteudo').innerHTML = `${titulo(a ? `🧾 Acerto ${a.id}` : '🧾 Novo acerto de viagem')}
      <div style="display:flex; gap:16px; margin:12px 0;"><label class="ag-check"><input type="radio" name="axTipo" value="proprio" ${terceiro ? '' : 'checked'} /> Motorista próprio</label>
        <label class="ag-check"><input type="radio" name="axTipo" value="terceiro" ${terceiro ? 'checked' : ''} /> Terceiro / agregado</label></div>
      <div class="cte-secao"><h4>Viagem</h4><div class="cte-grade">
        <div class="campo largo"><label for="axMdfe">MDF-e da viagem (opcional)</label><select id="axMdfe"><option value="">— sem MDF-e —</option>${mdfes.map((m) => `<option value="${m.id}" ${Number(a?.mdfe_id) === m.id ? 'selected' : ''}>${m.numero ? `${esc(m.serie)}/${esc(m.numero)}` : `rascunho #${m.id}`} · ${esc(m.placa || '')} · ${esc(m.uf_ini || '')}→${esc(m.uf_fim || '')} · ${esc(m.status)}</option>`).join('')}</select></div>
        <div class="campo"><label for="axData">Saída</label><input id="axData" type="date" value="${a ? esc(String(a.data_saida).slice(0, 10)) : hoje()}" /></div>
        <div class="campo largo"><label for="axDesc">Rota / descrição</label><input id="axDesc" maxlength="200" value="${v('descricao')}" placeholder="Campinas → Curitiba" /></div>
        <div class="campo"><label for="axMot">Motorista</label><input id="axMot" list="axMotLista" maxlength="120" value="${v('motorista_nome')}" /><datalist id="axMotLista">${(Array.isArray(motoristas) ? motoristas : []).map((m) => `<option value="${esc(m.nome)}"></option>`).join('')}</datalist></div>
        <div class="campo"><label for="axCpf">CPF do motorista</label><input id="axCpf" maxlength="14" value="${v('motorista_cpf')}" /></div>
        <div class="campo"><label for="axPlaca">Placa</label><input id="axPlaca" maxlength="8" style="text-transform:uppercase;" value="${v('placa')}" /></div>
        <div class="campo"><label for="axAdiant">Adiantamento (R$)</label><input id="axAdiant" inputmode="decimal" value="${a ? esc(num2(a.adiantamento)) : ''}" /></div>
      </div></div>
      <div class="cte-secao" id="axTerceiro"><h4>Contratação do terceiro</h4><div class="cte-grade">
        <div class="campo largo"><label for="axProp">Contratado (quem recebe o frete)</label><input id="axProp" maxlength="200" value="${v('proprietario_nome')}" placeholder="o próprio motorista, se for autônomo" /></div>
        <div class="campo"><label for="axPropDoc">CPF / CNPJ</label><input id="axPropDoc" maxlength="18" value="${v('proprietario_doc')}" /></div>
        <div class="campo"><label for="axRntrc">RNTRC</label><input id="axRntrc" maxlength="20" value="${v('rntrc')}" /></div>
        <div class="campo"><label for="axFrete">Frete contratado (R$)</label><input id="axFrete" inputmode="decimal" value="${a ? esc(num2(a.valor_frete)) : ''}" /></div>
        <div class="campo"><label for="axPrazo">Saldo pago em (dias após o acerto)</label><input id="axPrazo" type="number" min="0" max="120" value="${a?.prazo_saldo_dias ?? 0}" /></div>
        <div class="campo inteiro"><label class="ag-check" style="display:flex;"><input type="checkbox" id="axReter" ${a?.reter_impostos ? 'checked' : ''} /> Autônomo pessoa física (TAC): reter INSS (11%) e SEST/SENAT (2,5%) sobre 20% do frete</label></div>
        <div class="campo"><label for="axInss">INSS retido</label><input id="axInss" inputmode="decimal" value="${a ? esc(num2(a.inss)) : ''}" /></div>
        <div class="campo"><label for="axSest">SEST/SENAT retido</label><input id="axSest" inputmode="decimal" value="${a ? esc(num2(a.sest_senat)) : ''}" /></div>
        <div class="campo"><label for="axIrrf">IRRF retido (tabela do mês)</label><input id="axIrrf" inputmode="decimal" value="${a ? esc(num2(a.irrf)) : ''}" /></div>
        <div class="campo"><label for="axCiot">CIOT</label><input id="axCiot" maxlength="12" value="${v('ciot')}" /></div>
      </div></div>
      <div class="cte-secao"><h4>Vale-pedágio (pago pelo contratante)</h4><div class="cte-grade">
        <div class="campo"><label for="axVpValor">Valor</label><input id="axVpValor" inputmode="decimal" value="${a && Number(a.vale_pedagio_valor) ? esc(num2(a.vale_pedagio_valor)) : ''}" /></div>
        <div class="campo"><label for="axVpCnpj">CNPJ da fornecedora</label><input id="axVpCnpj" maxlength="18" value="${v('vale_pedagio_cnpj')}" /></div>
        <div class="campo"><label for="axVpCompra">Nº do comprovante</label><input id="axVpCompra" maxlength="30" value="${v('vale_pedagio_compra')}" /></div>
      </div><p class="edi-dica" style="margin:0;">Com MDF-e ainda não transmitido, o CIOT e o vale-pedágio já vão para ele.</p></div>
      <div class="campo"><label for="axObs">Observação</label><input id="axObs" maxlength="2000" value="${v('observacao')}" /></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-cp-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="axSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    const tipo = () => document.querySelector('[name=axTipo]:checked').value;
    const ajustar = () => { $('axTerceiro').classList.toggle('oculto', tipo() !== 'terceiro'); };
    document.querySelectorAll('[name=axTipo]').forEach((r) => r.addEventListener('change', ajustar)); ajustar();
    // MDF-e escolhido: traz placa e motorista.
    $('axMdfe').addEventListener('change', () => {
      const m = mdfes.find((x) => x.id === Number($('axMdfe').value)); if (!m) return;
      if (!$('axPlaca').value && m.placa) $('axPlaca').value = m.placa;
      const cond = (m.condutores || [])[0];
      if (cond && !$('axMot').value) { $('axMot').value = cond.xNome || cond.nome || ''; $('axCpf').value = cond.cpf || cond.CPF || ''; }
      if (!$('axDesc').value) $('axDesc').value = `${m.uf_ini || ''} → ${m.uf_fim || ''}`;
    });
    $('axMot').addEventListener('change', () => { const m = (Array.isArray(motoristas) ? motoristas : []).find((x) => x.nome === $('axMot').value); if (m && !$('axCpf').value) $('axCpf').value = m.cpf || ''; });
    // Retenção do TAC: calcula ao marcar ou mudar o frete (dá para corrigir à mão).
    const calcImpostos = async () => {
      if (!$('axReter').checked) return;
      const r = await json(`/api/acertos/impostos?frete=${encodeURIComponent($('axFrete').value)}`).catch(() => null);
      if (r) { $('axInss').value = num2(r.inss); $('axSest').value = num2(r.sest_senat); }
    };
    $('axReter').addEventListener('change', calcImpostos); $('axFrete').addEventListener('change', calcImpostos);
    $('axSalvar').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const corpo = { tipo: tipo(), mdfe_id: $('axMdfe').value, data_saida: $('axData').value, descricao: $('axDesc').value, motorista_nome: $('axMot').value, motorista_cpf: $('axCpf').value,
          placa: $('axPlaca').value, adiantamento: $('axAdiant').value, proprietario_nome: $('axProp').value, proprietario_doc: $('axPropDoc').value, rntrc: $('axRntrc').value,
          valor_frete: $('axFrete').value, prazo_saldo_dias: $('axPrazo').value, reter_impostos: $('axReter').checked, inss: $('axInss').value, sest_senat: $('axSest').value, irrf: $('axIrrf').value,
          ciot: $('axCiot').value, vale_pedagio_valor: $('axVpValor').value, vale_pedagio_cnpj: $('axVpCnpj').value, vale_pedagio_compra: $('axVpCompra').value, observacao: $('axObs').value };
        const r = a ? await json(`/api/acertos/${a.id}`, { method: 'PUT', body: JSON.stringify(corpo) }) : await json('/api/acertos', { method: 'POST', body: JSON.stringify(corpo) });
        if (r.ciot_no_mdfe) mostrarAlerta('CIOT e vale-pedágio colocados no MDF-e.', { tipo: 'sucesso' });
        await abrirAcerto(r.id); telaAcertos().catch(() => {});
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  async function abrirAcerto(id) {
    const a = await json(`/api/acertos/${id}`);
    const t = a.totais; const aberto = a.status === 'aberto';
    const linha = (rot, v, cls = '') => `<tr class="${cls}"><td>${rot}</td><td class="n">${brl(v)}</td></tr>`;
    $('cpModalConteudo').innerHTML = `${titulo(`🧾 Acerto ${a.id} · ${esc(a.motorista_nome)} <span class="oc-sit ${a.status === 'acertado' ? 'entregue' : a.status === 'cancelado' ? 'cancelado' : 'pendente'}" style="vertical-align:middle;">${{ aberto: 'Em aberto', acertado: 'Acertado', cancelado: 'Cancelado' }[a.status]}</span>`)}
      <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:4px;">${a.tipo === 'terceiro' ? `Terceiro: ${esc(a.proprietario_nome || '')}${a.rntrc ? ` · RNTRC ${esc(a.rntrc)}` : ''}` : 'Motorista próprio'} · saída ${dia(a.data_saida)}${a.placa ? ` · ${esc(a.placa)}` : ''}${a.descricao ? ` · ${esc(a.descricao)}` : ''}${a.mdfe_numero ? ` · MDF-e ${esc(a.mdfe_serie)}/${esc(a.mdfe_numero)}` : ''}${a.ciot ? ` · CIOT ${esc(a.ciot)}` : ''}</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:18px; margin-top:14px;">
        <div><h4 style="margin:0 0 6px;">${a.tipo === 'terceiro' ? 'Descontos e acréscimos' : 'Despesas da viagem'}</h4>
          ${a.lancamentos.length ? `<table class="edi-tabela"><tbody>${a.lancamentos.map((l) => `<tr><td>${dia(l.data)}</td><td>${{ despesa: '', desconto: '(−) ', acrescimo: '(+) ' }[l.tipo]}${esc(catAc[l.categoria] || l.categoria)}${l.descricao ? `<br><small>${esc(l.descricao)}</small>` : ''}</td><td class="n">${brl(l.valor)}</td>
            <td>${aberto ? `<button class="btn btn-secundario" data-ax-tirar="${l.id}" style="width:auto; padding:2px 7px; font-size:12px;">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p style="font-size:13px; color:var(--texto-fraco);">Nada lançado.</p>'}
          ${aberto ? `<div class="cte-grade" style="margin-top:8px;">
            <div class="campo"><label for="axLTipo">Tipo</label><select id="axLTipo">${a.tipo === 'terceiro' ? '' : '<option value="despesa">Despesa</option>'}<option value="desconto">Desconto</option><option value="acrescimo">Acréscimo</option></select></div>
            <div class="campo"><label for="axLCat">Categoria</label><select id="axLCat">${Object.entries(catAc).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
            <div class="campo"><label for="axLValor">Valor</label><input id="axLValor" inputmode="decimal" /></div>
            <div class="campo"><label for="axLData">Data</label><input id="axLData" type="date" value="${hoje()}" /></div>
            <div class="campo largo"><label for="axLDesc">Descrição / comprovante</label><input id="axLDesc" maxlength="200" /></div></div>
            <button class="btn btn-secundario" id="axLancar" style="width:auto;">＋ Lançar</button>` : ''}</div>
        <div><h4 style="margin:0 0 6px;">Acerto</h4><table class="edi-tabela"><tbody>
          ${a.tipo === 'terceiro' ? `${linha('Frete contratado', t.frete)}${t.acrescimos ? linha('(+) Acréscimos', t.acrescimos) : ''}${t.descontos ? linha('(−) Descontos', t.descontos) : ''}
            ${Number(a.inss) ? linha('(−) INSS retido', a.inss) : ''}${Number(a.sest_senat) ? linha('(−) SEST/SENAT retido', a.sest_senat) : ''}${Number(a.irrf) ? linha('(−) IRRF retido', a.irrf) : ''}${linha('(−) Adiantamento', t.adiantamento)}`
            : `${linha('Despesas comprovadas', t.despesas)}${t.acrescimos ? linha('(+) Acréscimos', t.acrescimos) : ''}${t.descontos ? linha('(−) Descontos', t.descontos) : ''}${linha('(−) Adiantamento', t.adiantamento)}`}
          <tr><th>${t.saldo > 0 ? `A pagar ao ${a.tipo === 'terceiro' ? 'contratado' : 'motorista'}` : t.saldo < 0 ? 'O motorista devolve' : 'Saldo'}</th><th class="n" style="font-size:17px; color:${t.saldo < 0 ? '#d97706' : 'inherit'};">${brl(Math.abs(t.saldo))}</th></tr></tbody></table>
          ${Number(a.vale_pedagio_valor) ? `<p style="font-size:12.5px;">Vale-pedágio: ${brl(a.vale_pedagio_valor)} (pago pela empresa à fornecedora; não entra no frete).</p>` : ''}
          ${a.contas.length ? `<h4 style="margin:12px 0 6px;">Em contas a pagar</h4>${a.contas.map((c) => `<div style="font-size:12.5px;">• ${esc(c.descricao.split(' — ')[0])}: ${brl(c.valor)} · venc. ${dia(c.vencimento)} · <b>${{ aberta: Number(c.valor_pago) ? 'parcial' : 'em aberto', paga: 'paga', cancelada: 'cancelada' }[c.status]}</b></div>`).join('')}` : ''}
        </div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:16px;">
        ${aberto ? '<button class="btn btn-secundario" id="axCancelar" style="width:auto; color:var(--vermelho);">Cancelar acerto</button><button class="btn btn-secundario" id="axEditar" style="width:auto;">Editar</button>' : ''}
        ${a.status === 'acertado' ? '<button class="btn btn-secundario" id="axReabrir" style="width:auto;">Reabrir</button>' : ''}
        <a class="btn btn-secundario" href="/api/acertos/${a.id}/imprimir?token=${encodeURIComponent(token)}" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">🖨 Demonstrativo</a>
        ${aberto ? '<button class="btn btn-primario" id="axAcertar" style="width:auto;">✓ Fechar o acerto</button>' : ''}</div>`;
    modal.classList.remove('oculto');
    const depois = async () => { await abrirAcerto(id); telaAcertos().catch(() => {}); };
    $('axLancar')?.addEventListener('click', async () => {
      try { await json(`/api/acertos/${id}/lancamentos`, { method: 'POST', body: JSON.stringify({ tipo: $('axLTipo').value, categoria: $('axLCat').value, valor: $('axLValor').value, data: $('axLData').value, descricao: $('axLDesc').value }) }); await depois(); $('axLValor')?.focus(); } catch (err) { erro(err); }
    });
    $('cpModalConteudo').querySelectorAll('[data-ax-tirar]').forEach((b) => b.addEventListener('click', async () => { try { await json(`/api/acertos/${id}/lancamentos/${b.dataset.axTirar}`, { method: 'DELETE' }); await depois(); } catch (err) { erro(err); } }));
    $('axEditar')?.addEventListener('click', () => formAcerto(a).catch(erro));
    $('axAcertar')?.addEventListener('click', async () => {
      const msg = t.saldo > 0 ? `Fechar o acerto? ${brl(t.saldo)} vão para Contas a pagar.` : t.saldo < 0 ? `Fechar o acerto? O motorista devolve ${brl(-t.saldo)}.` : 'Fechar o acerto?';
      if (!await confirmar(`${msg}${a.mdfe_id ? ' O custo da viagem vai para o painel (resultado por viagem).' : ''}`, { textoOk: 'Fechar acerto' })) return;
      try { await json(`/api/acertos/${id}/acertar`, { method: 'POST' }); await depois(); } catch (err) { erro(err); }
    });
    $('axReabrir')?.addEventListener('click', async () => { try { await json(`/api/acertos/${id}/reabrir`, { method: 'POST' }); await depois(); } catch (err) { erro(err); } });
    $('axCancelar')?.addEventListener('click', async () => {
      if (!await confirmar('Cancelar este acerto? O adiantamento lançado em contas a pagar também é cancelado.', { tipo: 'perigo', textoOk: 'Cancelar acerto' })) return;
      try { await json(`/api/acertos/${id}/cancelar`, { method: 'POST' }); fecharModal(); telaAcertos().catch(() => {}); } catch (err) { erro(err); }
    });
  }
})();
