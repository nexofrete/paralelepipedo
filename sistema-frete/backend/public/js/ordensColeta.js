// =====================================================================
// Ordens de coleta (Pátio e portaria » Ordens de coleta, tela 424; regras em src/ordensColeta.js).
// A expedição escolhe as notas que a transportadora vai buscar, gera a ordem e manda por e-mail com o link; a
// transportadora aceita (data, placa, motorista: vira agendamento no pátio) ou recusa pelo link. Aqui fica o
// acompanhamento por situação. O js/patio.js chama window.OrdensColeta.desenhar() na aba "Ordens de coleta".
// Usa do dashboard.js: apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v, c = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const diaHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/ordens-coleta${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const post = (c, corpo, metodo = 'POST') => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const COR = { Rascunho: '', 'Aguardando confirmação': 'pendente', 'Sem resposta': 'ocorrencia', Confirmada: 'em_transito', Atrasada: 'cancelado', 'No pátio': 'em_transito',
    Coletada: 'entregue', 'Não compareceu': 'cancelado', Recusada: 'cancelado', Cancelada: 'cancelado' };
  const sit = (s) => `<span class="oc-sit ${COR[s] || ''}">${esc(s)}</span>`;
  let filtro = ''; let cont = null; let dados = null;

  async function desenhar(alvo) {
    cont = alvo || cont;
    dados = await api(`/?situacao=${encodeURIComponent(filtro)}`);
    const chips = dados.situacoes.filter((s) => dados.contagem[s] || s === filtro).map((s) => `<button type="button" class="btn btn-secundario oc-chip${s === filtro ? ' ativo' : ''}" data-oc-filtro="${esc(s)}" style="width:auto;">${esc(s)} <b>${dados.contagem[s]}</b></button>`).join('');
    cont.innerHTML = `<div class="painel" style="padding:14px 16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; gap:6px; flex-wrap:wrap;"><button type="button" class="btn btn-secundario oc-chip${!filtro ? ' ativo' : ''}" data-oc-filtro="" style="width:auto;">Todas</button>${chips}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;"><button type="button" class="btn btn-primario" id="ocNova" style="width:auto;">＋ Ordem de coleta</button>
            <button type="button" class="btn btn-primario" id="ocNovaDesc" style="width:auto;">＋ Ordem de descarga</button></div></div>
        <p style="margin:10px 0 0; font-size:13px; color:var(--texto-fraco);"><b>Coleta</b>: as notas de venda que a transportadora vai buscar. <b>Descarga</b>: as NF-e de compra que estão para chegar. Mande a ordem por e-mail ou pelo link: quem vem confirma a data, a placa e o motorista, e a confirmação já vira agendamento no pátio.</p></div>
      <div class="painel" style="padding:0; overflow-x:auto;"><table class="tabela"><thead><tr><th>Nº</th><th>Tipo</th><th>Transportadora</th><th>Notas</th><th>Volumes</th><th>Peso (kg)</th><th>Pronta em</th><th>Situação</th><th>Resposta</th><th></th></tr></thead><tbody>
      ${dados.ordens.length ? dados.ordens.map((o) => `<tr data-oc-id="${o.id}">
        <td><b>${o.id}</b></td><td>${o.tipo === 'descarga' ? '📥 Descarga' : '📦 Coleta'}</td><td>${esc(o.transportadora)}${o.tipo === 'descarga' && o.fornecedor && o.fornecedor !== o.transportadora ? `<br><small>Forn.: ${esc(o.fornecedor)}</small>` : ''}<br><small style="color:var(--texto-fraco);">${esc(o.email_para || 'sem e-mail')}</small></td>
        <td title="${esc(o.notas.join(', '))}">${o.notas.length}<br><small style="color:var(--texto-fraco);">${esc(o.notas.slice(0, 4).join(', '))}${o.notas.length > 4 ? '…' : ''}</small></td>
        <td>${num(o.volumes)}</td><td>${num(o.peso_kg, 1)}</td><td>${diaHora(o.coletar_em)}</td><td>${sit(o.situacao)}${o.enviada_em ? `<br><small style="color:var(--texto-fraco);">enviada ${diaHora(o.enviada_em)}${o.aberta_em ? ' · aberta' : ''}</small>` : ''}</td>
        <td>${o.status === 'aceita' ? `${esc(o.placa || '')} ${esc(o.motorista_nome || '')}<br><small style="color:var(--texto-fraco);">chega ${diaHora(o.previsto_em)}</small>` : o.status === 'recusada' ? `<small>${esc(o.motivo_recusa || '')}</small>` : '—'}</td>
        <td style="white-space:nowrap;"><button type="button" class="btn btn-secundario" data-oc-acao="abrir" style="width:auto;">Abrir</button></td></tr>`).join('')
    : '<tr><td colspan="10" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhuma ordem aqui.</td></tr>'}</tbody></table></div>`;
    cont.querySelectorAll('[data-oc-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.ocFiltro; desenhar().catch(erro); }));
    $('ocNova').addEventListener('click', () => formulario(null, 'coleta').catch(erro));
    $('ocNovaDesc').addEventListener('click', () => formulario(null, 'descarga').catch(erro));
    cont.querySelectorAll('[data-oc-acao="abrir"]').forEach((b) => b.addEventListener('click', () => abrir(Number(b.closest('tr').dataset.ocId)).catch(erro)));
  }

  // Janela própria (o modal do pátio é do js/patio.js).
  function janela(html, largura = 980) {
    let m = $('modalOrdemColeta');
    if (!m) {
      m = document.createElement('div'); m.className = 'modal-overlay'; m.id = 'modalOrdemColeta';
      m.innerHTML = `<div class="painel modal-card" style="width:100%; max-height:94vh; overflow-y:auto; padding:22px 24px;" id="ocModal"></div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-oc-fechar]')) m.classList.add('oculto'); });
    }
    m.classList.remove('oculto'); $('ocModal').style.maxWidth = `${largura}px`; $('ocModal').innerHTML = html;
    return $('ocModal');
  }
  const fecharJanela = () => $('modalOrdemColeta')?.classList.add('oculto');
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-oc-fechar>✕</span></div>`;
  const agoraMais = (h) => { const d = new Date(Date.now() + h * 3600000 - new Date().getTimezoneOffset() * 60000); d.setUTCMinutes(0); return d.toISOString().slice(0, 16); };

  async function formulario(o, tipoNovo = 'coleta') {
    const tipo = o?.tipo || tipoNovo; const desc = tipo === 'descarga'; const campoIds = desc ? 'dfe_ids' : 'frete_ids';
    const [notas, opcoes] = await Promise.all([api(`/candidatas?tipo=${tipo}`), apiFetch('/api/patio/opcoes').then((r) => r.json()).catch(() => ({ veiculos: {} }))]);
    // As notas já desta ordem também aparecem (marcadas) ao alterar.
    const marcadas = new Set(o?.[campoIds] || []);
    const lista = [...notas];
    if (o) (o[campoIds] || []).forEach((id, i) => { if (!lista.some((n) => n.id === id)) lista.unshift({ id, numero: o.notas[i], cliente: desc ? o.fornecedor : '', transportadora: o.transportadora }); });
    const transps = [...new Set(lista.flatMap((n) => (desc ? [n.transportadora, n.cliente] : [n.transportadora])).filter(Boolean))].sort();
    const caixa = janela(`${cab(o ? `Ordem de ${tipo} nº ${o.id}` : `Nova ordem de ${tipo}`)}
      <div class="cte-grade" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px 14px;">
        <div class="campo"><label for="ocTransp">${desc ? 'Quem entrega (transportadora ou fornecedor)' : 'Transportadora'}</label><input id="ocTransp" list="ocTranspLista" value="${esc(o?.transportadora || '')}" placeholder="Filtra as notas"><datalist id="ocTranspLista">${transps.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
        <div class="campo"><label for="ocEmail">E-mail de ${desc ? 'quem entrega' : 'transportadora'}</label><input id="ocEmail" type="email" value="${esc(o?.email_para || '')}"></div>
        <div class="campo"><label for="ocColetar">${desc ? 'Receber a partir de' : 'Pronta para coleta em'}</label><input id="ocColetar" type="datetime-local" value="${esc(o?.coletar_local || agoraMais(3))}"></div>
        <div class="campo"><label for="ocJanela">Janela (horas)</label><input id="ocJanela" type="number" min="0" max="24" step="0.5" value="${o ? o.janela_min / 60 : 2}"></div>
        <div class="campo"><label for="ocVeiculo">Veículo</label><select id="ocVeiculo"><option value="">Qualquer</option>${Object.entries(opcoes.veiculos || {}).map(([k, v]) => `<option value="${k}"${k === o?.tipo_veiculo ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="campo" style="grid-column:1 / -1;"><label for="ocObsF">Observação para ${desc ? 'quem entrega' : 'a transportadora'}</label><input id="ocObsF" maxlength="2000" value="${esc(o?.observacao || '')}"></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin:12px 0 6px; flex-wrap:wrap;"><b>${desc ? 'NF-e de compra a receber' : 'Notas para coletar'}</b>
        <input id="ocBusca" placeholder="Buscar NF, cliente, cidade" style="max-width:260px;"><span id="ocTot" style="font-size:13px; color:var(--texto-fraco);"></span></div>
      <div style="max-height:44vh; overflow:auto; border:1px solid var(--borda); border-radius:8px;"><table class="tabela"><thead><tr><th><input type="checkbox" id="ocTodas" title="Marcar as visíveis"></th><th>NF-e</th><th>Emissão</th><th>${desc ? 'Fornecedor' : 'Cliente'}</th><th>${desc ? 'Origem' : 'Destino'}</th><th>Vol.</th><th>Peso</th><th>Valor</th><th>Transportadora</th></tr></thead>
        <tbody id="ocLista">${lista.map((n) => ` <tr data-n="${n.id}" data-t="${esc(desc ? `${n.transportadora || ''} ${n.cliente || ''}` : n.transportadora || '')}" data-b="${esc(`${n.numero} ${n.cliente} ${n.cidade} ${n.pedido || ''}`.toLowerCase())}">
          <td><input type="checkbox" class="ocMarca" value="${n.id}"${marcadas.has(n.id) ? ' checked' : ''}></td><td>${esc(n.numero)}</td><td>${n.emissao ? new Date(`${n.emissao}T12:00:00`).toLocaleDateString('pt-BR') : ''}</td>
          <td>${esc(n.cliente)}</td><td>${esc([n.cidade, n.uf].filter(Boolean).join('/'))}${n.redespacho ? ' <small>(redesp.)</small>' : ''}</td><td data-v="${n.volumes || 0}">${num(n.volumes)}</td><td data-p="${n.peso || 0}">${num(n.peso, 1)}</td>
          <td>${num(n.valor, 2)}</td><td>${esc(n.transportadora || '—')}</td></tr>`).join('') || `<tr><td colspan="9" style="text-align:center; padding:16px;">${desc ? 'Nenhuma NF-e de compra a receber (NF-e contra o CNPJ dos últimos 60 dias, ainda não lançadas na entrada). Confira em Fiscal, NF-e contra o CNPJ.' : 'Nenhuma nota esperando coleta (CIF, sem CT-e, sem saída, dos últimos 45 dias).'}</td></tr>`}</tbody></table></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secundario" data-oc-fechar style="width:auto;">Fechar</button>
        <button type="button" class="btn btn-secundario" id="ocSalvar" style="width:auto;">Salvar rascunho</button>
        <button type="button" class="btn btn-primario" id="ocSalvarEnviar" style="width:auto;">Salvar e mandar ${desc ? 'a quem entrega' : 'à transportadora'}</button></div>`);
    const linhas = [...caixa.querySelectorAll('#ocLista tr[data-n]')];
    const filtrar = () => {
      const t = $('ocTransp').value.trim().toLowerCase(); const b = $('ocBusca').value.trim().toLowerCase();
      linhas.forEach((tr) => { const marcada = tr.querySelector('.ocMarca').checked; tr.classList.toggle('oculto', !marcada && ((t && !tr.dataset.t.toLowerCase().includes(t)) || (b && !tr.dataset.b.includes(b)))); });
    };
    const totais = () => {
      const m = linhas.filter((tr) => tr.querySelector('.ocMarca').checked);
      $('ocTot').textContent = `${m.length} nota(s) · ${num(m.reduce((s, tr) => s + Number(tr.querySelector('[data-v]').dataset.v), 0))} vol. · ${num(m.reduce((s, tr) => s + Number(tr.querySelector('[data-p]').dataset.p), 0), 1)} kg`;
    };
    $('ocTransp').addEventListener('input', filtrar); $('ocBusca').addEventListener('input', filtrar);
    $('ocTransp').addEventListener('change', async () => {
      if ($('ocEmail').value.trim() || !$('ocTransp').value.trim()) return;
      const r = await api(`/email-transportadora?nome=${encodeURIComponent($('ocTransp').value)}`).catch(() => ({}));
      if (r.email && !$('ocEmail').value.trim()) $('ocEmail').value = r.email;
    });
    caixa.querySelectorAll('.ocMarca').forEach((c) => c.addEventListener('change', totais));
    $('ocTodas').addEventListener('change', (e) => { linhas.filter((tr) => !tr.classList.contains('oculto')).forEach((tr) => { tr.querySelector('.ocMarca').checked = e.target.checked; }); totais(); });
    filtrar(); totais();
    const salvar = async (enviar) => {
      const corpo = { transportadora: $('ocTransp').value, email_para: $('ocEmail').value, coletar_em: $('ocColetar').value, janela_min: Math.round(Number($('ocJanela').value || 0) * 60),
        tipo_veiculo: $('ocVeiculo').value, observacao: $('ocObsF').value, tipo, [campoIds]: linhas.filter((tr) => tr.querySelector('.ocMarca').checked).map((tr) => Number(tr.dataset.n)), enviar };
      const r = o ? await post(`/${o.id}`, corpo, 'PUT') : await post('/', corpo);
      fecharJanela();
      if (r.aviso) mostrarAlerta(`Ordem de ${tipo} nº ${r.id} salva, mas não foi mandada. ${r.aviso}`, { tipo: 'erro' });
      else mostrarAlerta(enviar ? `Ordem de ${tipo} nº ${r.id} mandada para ${r.email_para}.` : `Ordem de ${tipo} nº ${r.id} salva como rascunho.`, { tipo: 'sucesso' });
      await desenhar();
    };
    $('ocSalvar').addEventListener('click', () => salvar(false).catch(erro));
    $('ocSalvarEnviar').addEventListener('click', () => salvar(true).catch(erro));
  }

  async function abrir(id) {
    const o = await api(`/${id}`);
    const pode = { alterar: ['rascunho', 'enviada'].includes(o.status), enviar: ['rascunho', 'enviada', 'aceita'].includes(o.status), cancelar: !['cancelada', 'recusada'].includes(o.status) && !['aguardando', 'chamado', 'em_doca', 'liberado', 'saiu'].includes(o.visita_status) };
    const caixa = janela(`${cab(`Ordem de ${o.tipo === 'descarga' ? 'descarga' : 'coleta'} nº ${o.id}`)}
      <p>${sit(o.situacao)} &nbsp; <b>${esc(o.transportadora)}</b> · ${esc(o.email_para || 'sem e-mail')}</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:8px 14px; font-size:14px;">
        <div><small style="color:var(--texto-fraco);">${o.tipo === 'descarga' ? 'Receber a partir de' : 'Pronta para coleta'}</small><br><b>${diaHora(o.coletar_em)}</b></div>${o.fornecedor ? `<div><small style="color:var(--texto-fraco);">Fornecedor</small><br><b>${esc(o.fornecedor)}</b></div>` : ''}
        <div><small style="color:var(--texto-fraco);">Notas</small><br><b>${o.notas.length}</b> · ${num(o.volumes)} vol. · ${num(o.peso_kg, 1)} kg</div>
        <div><small style="color:var(--texto-fraco);">Enviada</small><br><b>${diaHora(o.enviada_em)}</b>${o.aberta_em ? '<br><small>link aberto pela transportadora</small>' : ''}</div>
        <div><small style="color:var(--texto-fraco);">Resposta</small><br>${o.respondida_em ? `<b>${diaHora(o.respondida_em)}</b> por ${esc(o.resposta_nome || '')}` : '—'}</div>
        ${o.status === 'aceita' ? `<div><small style="color:var(--texto-fraco);">Chegada confirmada</small><br><b>${diaHora(o.previsto_em)}</b> · ${esc(o.placa || '')} ${esc(o.motorista_nome || '')}</div>` : ''}
        ${o.motivo_recusa ? `<div><small style="color:var(--texto-fraco);">Motivo</small><br>${esc(o.motivo_recusa)}</div>` : ''}
      </div>
      <p style="font-size:13px;"><b>NF-e:</b> ${esc(o.notas.join(', '))}</p>
      ${o.observacao ? `<p style="font-size:13px;"><b>Observação:</b> ${esc(o.observacao)}</p>` : ''}
      <p style="font-size:13px;"><b>Link da transportadora:</b> <span style="word-break:break-all;">${esc(o.link)}</span></p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:14px;">
        ${pode.cancelar ? '<button type="button" class="btn btn-secundario" id="ocCancelar" style="width:auto; color:var(--vermelho);">Cancelar a ordem</button>' : ''}
        <button type="button" class="btn btn-secundario" id="ocCopiar" style="width:auto;">Copiar o link</button>
        <button type="button" class="btn btn-secundario" id="ocDoc" style="width:auto;">Imprimir a ordem</button>
        ${pode.alterar ? '<button type="button" class="btn btn-secundario" id="ocAlterar" style="width:auto;">Alterar</button>' : ''}
        ${pode.enviar ? `<button type="button" class="btn btn-primario" id="ocEnviar" style="width:auto;">${o.enviada_em ? 'Mandar de novo' : o.tipo === 'descarga' ? 'Mandar a quem entrega' : 'Mandar à transportadora'}</button>` : ''}</div>`, 760);
    $('ocCopiar').addEventListener('click', () => navigator.clipboard?.writeText(o.link).then(() => mostrarAlerta('Link copiado.', { tipo: 'sucesso' })).catch(() => mostrarAlerta(o.link)));
    $('ocDoc').addEventListener('click', async () => {
      const w = window.open('', '_blank');
      try { const r = await apiFetch(`/api/ordens-coleta/${o.id}/documento`); const html = await r.text(); if (w) { w.document.write(html); w.document.close(); } } catch (e) { w?.close(); erro(e); }
    });
    $('ocAlterar')?.addEventListener('click', () => formulario(o).catch(erro));
    $('ocEnviar')?.addEventListener('click', async () => {
      try {
        const para = o.email_para || await pedirTexto('E-mail da transportadora:');
        if (!para) return;
        const r = await post(`/${o.id}/enviar`, { para });
        mostrarAlerta(`Ordem mandada para ${r.email_para}.`, { tipo: 'sucesso' }); fecharJanela(); await desenhar();
      } catch (e) { erro(e); }
    });
    $('ocCancelar')?.addEventListener('click', async () => {
      if (!await confirmar('Cancelar esta ordem? Se já houver agendamento no pátio, ele também é cancelado.', { textoOk: 'Cancelar a ordem' })) return;
      try { await post(`/${o.id}/cancelar`, {}); fecharJanela(); await desenhar(); } catch (e) { erro(e); }
    });
    return caixa;
  }

  window.OrdensColeta = { desenhar: (alvo) => desenhar(alvo) };
})();
