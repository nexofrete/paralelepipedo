// =====================================================================
// Cargas (embarcador; regras em src/cargas.js): Embarques (430), Pré-conhecimentos (431), Cargas fracionadas (432) e
// Capacidade das transportadoras (433). Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const nav = document.getElementById('navCargas');
  const cont = document.getElementById('cgConteudo');
  if (!nav || !cont || usuario?.perfil === 'cliente') return;
  nav.classList.remove('oculto');
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v, c = 0) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const moeda = (v) => (v == null ? '—' : `R$ ${num(v, 2)}`);
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
  const hojeIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (c, op = {}) => { const r = await apiFetch(`/api/cargas${c}`, { ...op, headers: { 'Content-Type': 'application/json' } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.'); return j; };
  const post = (c, b, m = 'POST') => api(c, { method: m, body: JSON.stringify(b || {}) });
  const abrirHtml = async (url) => { const w = window.open('', '_blank'); try { const r = await apiFetch(url); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não foi possível montar.'); const h = await r.text(); if (w) { w.document.write(h); w.document.close(); } } catch (e) { w?.close(); erro(e); } };
  const ocBarra = (v) => (v == null ? '—' : `<div style="display:flex; align-items:center; gap:6px;"><div style="flex:1; min-width:60px; height:8px; background:var(--borda); border-radius:6px; overflow:hidden;"><div style="height:100%; width:${Math.min(100, Math.round(v * 100))}%; background:${v > 1 ? 'var(--vermelho)' : v >= 0.7 ? 'var(--verde)' : v >= 0.4 ? 'var(--azul)' : '#d97706'};"></div></div><b style="font-size:12px;">${pct(v)}</b></div>`);
  const sit = (s, cor) => `<span class="oc-sit ${cor || ''}">${esc(s)}</span>`;
  let VEIC = {}; let aba = 'embarques';

  // Janela própria.
  function janela(html, largura = 980) {
    let m = $('modalCargas');
    if (!m) {
      m = document.createElement('div'); m.className = 'modal-overlay'; m.id = 'modalCargas';
      m.innerHTML = '<div class="painel modal-card" style="width:100%; max-height:94vh; overflow-y:auto; padding:22px 24px;" id="cgModal"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-cg-fechar]')) m.classList.add('oculto'); });
    }
    m.classList.remove('oculto'); $('cgModal').style.maxWidth = `${largura}px`; $('cgModal').innerHTML = html; return $('cgModal');
  }
  const fechar = () => $('modalCargas')?.classList.add('oculto');
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-cg-fechar>✕</span></div>`;

  document.querySelectorAll('[data-cg-aba]').forEach((a) => a.addEventListener('click', () => { aba = a.dataset.cgAba; document.querySelectorAll('[data-cg-aba]').forEach((x) => x.classList.toggle('ativo', x === a)); carregar().catch(erro); }));
  nav.addEventListener('click', async () => { if (!Object.keys(VEIC).length) VEIC = await api('/veiculos').catch(() => ({})); carregar().catch(erro); });
  async function carregar() {
    if (aba === 'embarques') return desenharEmbarques();
    if (aba === 'pre') return desenharPre();
    if (aba === 'fracionadas') return desenharFracionadas();
    if (aba === 'capacidade') return desenharCapacidade();
  }

  // ================= Embarques =================
  const COR_EMB = { 'Em montagem': 'pendente', Fechado: 'em_transito', Saiu: 'entregue', Cancelado: 'cancelado' };
  async function desenharEmbarques() {
    const lista = await api('/embarques');
    cont.innerHTML = `<div class="pa-topo"><span>Monte a carga (notas, transportadora, veículo e data), veja a ocupação e o frete previsto; ao fechar, saem os pré-conhecimentos e dá para pedir a coleta.</span><span style="flex:1;"></span>
        <button class="btn btn-primario" style="width:auto;" id="cgNovoEmb">＋ Montar embarque</button></div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:12px;"><table class="tabela"><thead><tr><th>Nº</th><th>Data</th><th>Transportadora</th><th>Modalidade / veículo</th><th>Notas</th><th>Peso</th><th>m³</th><th>Ocupação</th><th>Frete previsto</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.length ? lista.map((e) => `<tr><td><b>${e.id}</b></td><td>${dia(e.data)}</td><td>${esc(e.transportadora)}</td><td>${e.modalidade === 'lotacao' ? 'Lotação' : 'Fracionada'}<br><small style="color:var(--texto-fraco);">${esc(VEIC[e.tipo_veiculo]?.nome || '')}</small></td>
        <td title="${esc(e.notas.join(', '))}">${e.notas.length}</td><td>${num(e.peso_kg, 1)} kg</td><td>${num(e.cubagem_m3, 2)}</td><td style="min-width:120px;">${ocBarra(e.ocupacao)}</td><td>${moeda(e.frete_previsto)}</td>
        <td>${sit(e.situacao, COR_EMB[e.situacao] || (e.situacao.startsWith('Coleta') ? 'em_transito' : ''))}${e.ordem_id ? `<br><small>ordem ${e.ordem_id}</small>` : ''}</td>
        <td><button class="btn btn-secundario pa-mini" data-cg-emb="${e.id}">Abrir</button></td></tr>`).join('') : '<tr><td colspan="11" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum embarque. Monte o primeiro ou use a aba Cargas fracionadas para ver o que dá para juntar.</td></tr>'}
      </tbody></table></div>`;
    $('cgNovoEmb').addEventListener('click', () => formEmbarque(null).catch(erro));
    cont.querySelectorAll('[data-cg-emb]').forEach((b) => b.addEventListener('click', () => abrirEmbarque(Number(b.dataset.cgEmb)).catch(erro)));
  }

  async function formEmbarque(e, pre = {}) {
    const [notas, lots] = await Promise.all([api(`/candidatas?exceto=${e?.id || 0}`), api('/lotacoes')]);
    const marcadas = new Set(e?.frete_ids || pre.ids || []);
    const transps = [...new Set(notas.map((n) => n.transportadora).filter(Boolean))].sort();
    const modalidade = e?.modalidade || pre.modalidade || 'fracionada';
    const caixa = janela(`${cab(e ? `Embarque nº ${e.id}` : 'Montar embarque')}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px 14px;">
        <div class="campo"><label for="emTransp">Transportadora</label><input id="emTransp" list="emTranspL" value="${esc(e?.transportadora || pre.transportadora || '')}" placeholder="Filtra as notas"><datalist id="emTranspL">${transps.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
        <div class="campo"><label for="emData">Data do embarque</label><input id="emData" type="date" value="${esc(e?.data || pre.data || hojeIso())}"></div>
        <div class="campo"><label for="emModal">Modalidade</label><select id="emModal"><option value="fracionada"${modalidade === 'fracionada' ? ' selected' : ''}>Fracionada (frete da tabela)</option><option value="lotacao"${modalidade === 'lotacao' ? ' selected' : ''}>Lotação (veículo exclusivo)</option></select></div>
        <div class="campo"><label for="emVeic">Veículo</label><select id="emVeic"><option value="">—</option>${Object.entries(VEIC).map(([k, v]) => `<option value="${k}"${k === (e?.tipo_veiculo || pre.tipo_veiculo) ? ' selected' : ''}>${esc(v.nome)} (${num(v.kg)} kg · ${v.m3} m³)</option>`).join('')}</select></div>
        <div class="campo" id="emLotCampo"><label for="emLot">Tabela de lotação</label><select id="emLot"><option value="">—</option>${lots.filter((l) => l.ativa).map((l) => `<option value="${l.id}"${l.id === (e?.lotacao_id || pre.lotacao_id) ? ' selected' : ''}>${esc(l.transportadora)} · ${esc([l.cidade_destino, l.uf_destino].filter(Boolean).join('/'))} · ${esc(VEIC[l.tipo_veiculo]?.nome || '')} · ${moeda(l.valor_viagem)}</option>`).join('')}</select></div>
        <div class="campo" style="grid-column:1 / -1;"><label for="emObs">Observação</label><input id="emObs" maxlength="2000" value="${esc(e?.observacao || '')}"></div>
      </div>
      <div class="painel" style="margin:12px 0; padding:10px 14px; display:flex; gap:18px; flex-wrap:wrap; align-items:center;" id="emTot"></div>
      <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:6px; flex-wrap:wrap;"><b>Notas esperando embarque</b><input id="emBusca" placeholder="Buscar NF, cliente, cidade" style="max-width:260px;"></div>
      <div style="max-height:40vh; overflow:auto; border:1px solid var(--borda); border-radius:8px;"><table class="tabela"><thead><tr><th><input type="checkbox" id="emTodas"></th><th>NF-e</th><th>Cliente</th><th>Destino</th><th>Vol.</th><th>Peso</th><th>m³</th><th>Frete (tabela)</th><th>Transportadora</th></tr></thead><tbody>
      ${notas.map((n) => `<tr data-n="${n.id}" data-t="${esc(n.transportadora || '')}" data-b="${esc(`${n.numero} ${n.cliente} ${n.cidade} ${n.uf}`.toLowerCase())}" data-p="${n.peso || 0}" data-m="${n.m3 || 0}" data-f="${n.frete_previsto || 0}" data-v="${n.volumes || 0}">
        <td><input type="checkbox" class="emMarca"${marcadas.has(n.id) ? ' checked' : ''}></td><td>${esc(n.numero)}</td><td>${esc(n.cliente)}</td><td>${esc([n.cidade, n.uf].filter(Boolean).join('/'))}</td><td>${num(n.volumes)}</td><td>${num(n.peso, 1)}</td><td>${num(n.m3, 2)}</td><td>${moeda(n.frete_previsto)}</td><td>${esc(n.transportadora || '—')}</td></tr>`).join('')
        || '<tr><td colspan="9" style="text-align:center; padding:16px;">Nenhuma nota esperando embarque (CIF, sem CT-e, sem saída, dos últimos 45 dias).</td></tr>'}</tbody></table></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;"><button class="btn btn-secundario" data-cg-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="emSalvar" style="width:auto;">Salvar embarque</button></div>`);
    const linhas = [...caixa.querySelectorAll('tr[data-n]')];
    const filtrar = () => {
      const t = $('emTransp').value.trim().toLowerCase(); const b = $('emBusca').value.trim().toLowerCase();
      linhas.forEach((tr) => { const m = tr.querySelector('.emMarca').checked; tr.classList.toggle('oculto', !m && ((t && !tr.dataset.t.toLowerCase().includes(t)) || (b && !tr.dataset.b.includes(b)))); });
    };
    const totais = () => {
      const m = linhas.filter((tr) => tr.querySelector('.emMarca').checked);
      const s = (k) => m.reduce((t, tr) => t + Number(tr.dataset[k] || 0), 0);
      const lot = lots.find((l) => l.id === Number($('emLot').value));
      const v = VEIC[$('emVeic').value] || (lot ? VEIC[lot.tipo_veiculo] : null);
      const capKg = lot?.cap_kg || v?.kg; const capM3 = lot?.cap_m3 || v?.m3;
      const occ = capKg || capM3 ? Math.max(capKg ? s('p') / capKg : 0, capM3 ? s('m') / capM3 : 0) : null;
      const lotacao = $('emModal').value === 'lotacao';
      $('emLotCampo').style.display = lotacao ? '' : 'none';
      $('emTot').innerHTML = `<span><b>${m.length}</b> nota(s)</span><span><b>${num(s('v'))}</b> vol.</span><span><b>${num(s('p'), 1)}</b> kg</span><span><b>${num(s('m'), 2)}</b> m³</span>
        <span style="min-width:200px;">Ocupação ${capKg ? `(${num(capKg)} kg · ${num(capM3)} m³)` : '(escolha o veículo)'} ${ocBarra(occ)}</span>
        <span>Frete previsto: <b>${lotacao ? moeda(lot?.valor_viagem) : moeda(s('f'))}</b>${lotacao && s('f') ? ` <small>(fracionado seria ${moeda(s('f'))})</small>` : ''}</span>`;
    };
    ['emTransp', 'emBusca'].forEach((id) => $(id).addEventListener('input', filtrar));
    ['emVeic', 'emLot', 'emModal'].forEach((id) => $(id).addEventListener('change', totais));
    caixa.querySelectorAll('.emMarca').forEach((c) => c.addEventListener('change', totais));
    $('emTodas').addEventListener('change', (ev) => { linhas.filter((tr) => !tr.classList.contains('oculto')).forEach((tr) => { tr.querySelector('.emMarca').checked = ev.target.checked; }); totais(); });
    filtrar(); totais();
    $('emSalvar').addEventListener('click', async () => {
      try {
        const corpo = { transportadora: $('emTransp').value, data_prevista: $('emData').value, modalidade: $('emModal').value, tipo_veiculo: $('emVeic').value,
          lotacao_id: $('emModal').value === 'lotacao' ? Number($('emLot').value) || null : null, observacao: $('emObs').value,
          frete_ids: linhas.filter((tr) => tr.querySelector('.emMarca').checked).map((tr) => Number(tr.dataset.n)) };
        const r = e ? await post(`/embarques/${e.id}`, corpo, 'PUT') : await post('/embarques', corpo);
        fechar(); mostrarAlerta(r.aviso ? `Embarque nº ${r.id} salvo. Atenção: ${r.aviso}` : `Embarque nº ${r.id} salvo.`, { tipo: r.aviso ? 'erro' : 'sucesso' });
        if (aba !== 'embarques') document.querySelector('[data-cg-aba="embarques"]').click(); else await carregar();
      } catch (err) { erro(err); }
    });
  }

  async function abrirEmbarque(id) {
    const e = await api(`/embarques/${id}`);
    janela(`${cab(`Embarque nº ${e.id}`)}
      <p>${sit(e.situacao, COR_EMB[e.situacao] || 'em_transito')} &nbsp; <b>${esc(e.transportadora)}</b> · ${dia(e.data)} · ${e.modalidade === 'lotacao' ? 'Lotação' : 'Fracionada'} · ${esc(VEIC[e.tipo_veiculo]?.nome || 'veículo não informado')}</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px 14px; font-size:14px;">
        <div><small style="color:var(--texto-fraco);">Notas</small><br><b>${e.notas.length}</b> · ${num(e.volumes)} vol.</div><div><small style="color:var(--texto-fraco);">Peso / m³</small><br><b>${num(e.peso_kg, 1)} kg</b> · ${num(e.cubagem_m3, 2)} m³</div>
        <div><small style="color:var(--texto-fraco);">Ocupação</small><br>${ocBarra(e.ocupacao)}</div><div><small style="color:var(--texto-fraco);">Frete previsto</small><br><b>${moeda(e.frete_previsto)}</b></div>
        <div><small style="color:var(--texto-fraco);">Valor das notas</small><br><b>${moeda(e.valor)}</b></div></div>
      <p style="font-size:13px;"><b>NF-e:</b> ${esc(e.notas.join(', '))}</p>${e.observacao ? `<p style="font-size:13px;"><b>Observação:</b> ${esc(e.observacao)}</p>` : ''}
      <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:14px;">
        ${e.status !== 'cancelado' ? '<button class="btn btn-secundario" id="ebCancelar" style="width:auto; color:var(--vermelho);">Cancelar</button>' : ''}
        <button class="btn btn-secundario" id="ebDoc" style="width:auto;">Imprimir o espelho</button>
        ${e.status === 'fechado' ? '<button class="btn btn-secundario" id="ebPre" style="width:auto;">Pré-conhecimentos</button>' : ''}
        ${e.status === 'montagem' ? '<button class="btn btn-secundario" id="ebAlterar" style="width:auto;">Alterar</button><button class="btn btn-primario" id="ebFechar" style="width:auto;">Fechar o embarque</button>' : ''}
        ${e.status === 'fechado' && (!e.ordem_id || ['Cancelada', 'Recusada'].includes(e.ordem_situacao)) ? '<button class="btn btn-primario" id="ebOrdem" style="width:auto;">Pedir a coleta</button>' : ''}
        ${e.ordem_id && window.OrdensColeta ? '<button class="btn btn-secundario" id="ebVerOrdem" style="width:auto;">Ver a ordem de coleta</button>' : ''}</div>`, 760);
    const depois = async () => { fechar(); await carregar(); };
    $('ebDoc').addEventListener('click', () => abrirHtml(`/api/cargas/embarques/${e.id}/documento`));
    $('ebAlterar')?.addEventListener('click', () => formEmbarque(e).catch(erro));
    $('ebFechar')?.addEventListener('click', async () => {
      if (!await confirmar('Fechar o embarque? Saem os pré-conhecimentos de cada nota e as notas ficam presas a ele.', { textoOk: 'Fechar' })) return;
      try { const r = await post(`/embarques/${e.id}/fechar`); mostrarAlerta(`Embarque fechado: ${r.pre_gerados} pré-conhecimento(s).${r.aviso ? ` Atenção: ${r.aviso}` : ''}`, { tipo: r.aviso ? 'erro' : 'sucesso' }); await abrirEmbarque(e.id); await carregar(); } catch (err) { erro(err); }
    });
    $('ebOrdem')?.addEventListener('click', async () => {
      if (!await confirmar('Gerar a ordem de coleta deste embarque?', { textoOk: 'Gerar a ordem' })) return;
      const enviar = await confirmar('Mandar a ordem agora à transportadora por e-mail? (Dá para mandar depois, pela ordem.)', { textoOk: 'Mandar agora' });
      try { const r = await post(`/embarques/${e.id}/ordem`, { enviar }); mostrarAlerta(`Ordem de coleta nº ${r.ordem} gerada.${r.aviso ? ` Não foi mandada: ${r.aviso}` : ''}`, { tipo: r.aviso ? 'erro' : 'sucesso' }); await abrirEmbarque(e.id); await carregar(); } catch (err) { erro(err); }
    });
    $('ebVerOrdem')?.addEventListener('click', () => { fechar(); window.OrdensColeta.abrir(e.ordem_id, () => carregar()); });
    $('ebPre')?.addEventListener('click', () => { fechar(); preFiltro = { embarque: e.id }; document.querySelector('[data-cg-aba="pre"]').click(); });
    $('ebCancelar')?.addEventListener('click', async () => {
      if (!await confirmar('Cancelar o embarque? Os pré-conhecimentos dele são cancelados e a ordem de coleta também (se o caminhão ainda não chegou).', { textoOk: 'Cancelar embarque' })) return;
      try { await post(`/embarques/${e.id}/cancelar`); await depois(); } catch (err) { erro(err); }
    });
  }

  // ================= Pré-conhecimentos =================
  let preFiltro = {}; let preSit = '';
  const COR_PRE = { 'Aguardando CT-e': 'pendente', 'Enviado, aguardando CT-e': 'pendente', 'Sem frete calculado': 'ocorrencia', 'CT-e confere': 'entregue', 'CT-e divergente': 'cancelado', 'CT-e recebido': 'em_transito', Cancelado: 'cancelado' };
  async function desenharPre() {
    const q = new URLSearchParams({ ...(preFiltro.embarque ? { embarque: preFiltro.embarque } : {}), situacao: preSit });
    const d = await api(`/pre?${q}`);
    cont.innerHTML = `<div class="pa-topo"><div style="display:flex; gap:6px; flex-wrap:wrap;"><button class="btn btn-secundario${!preSit ? ' ativo' : ''}" style="width:auto;" data-pre-sit="">Todos</button>
        ${d.situacoes.filter((s) => d.contagem[s] || s === preSit).map((s) => `<button class="btn btn-secundario" style="width:auto;${s === preSit ? ' outline:2px solid var(--azul);' : ''}" data-pre-sit="${esc(s)}">${esc(s)} <b>${d.contagem[s]}</b></button>`).join('')}</div>
        <span style="flex:1;"></span>${preFiltro.embarque ? `<span>Embarque nº ${preFiltro.embarque} <a href="#" id="preTodos">ver todos</a></span>` : ''}
        <button class="btn btn-secundario" style="width:auto;" id="preGerar">＋ Gerar para notas sem CT-e</button></div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:12px;"><table class="tabela"><thead><tr><th><input type="checkbox" id="preTodas"></th><th>Nº</th><th>NF-e</th><th>Cliente</th><th>Destino</th><th>Transportadora</th><th>Previsto</th><th>CT-e</th><th>Cobrado</th><th>Diferença</th><th>Situação</th><th></th></tr></thead><tbody>
      ${d.lista.length ? d.lista.map((p) => `<tr data-pre="${p.id}" data-t="${esc(p.transportadora || '')}"><td>${p.status !== 'cancelado' ? '<input type="checkbox" class="preMarca">' : ''}</td><td><b>${p.id}</b>${p.embarque_id ? `<br><small>emb. ${p.embarque_id}</small>` : ''}</td><td>${esc(p.numero)}</td><td>${esc(p.cliente)}</td><td>${esc([p.cidade, p.uf].filter(Boolean).join('/'))}</td>
        <td>${esc(p.transportadora || '—')}</td><td><b>${moeda(p.valor_previsto)}</b><br><small style="color:var(--texto-fraco);">${esc(p.origem === 'lotacao' ? 'rateio da lotação' : p.tabela || '')}</small></td><td>${esc(p.numero_cte || '—')}</td><td>${moeda(p.valor_cte)}</td>
        <td>${p.diferenca == null ? '—' : `<span class="re-var ${p.diferenca > 0.004 ? 'ruim' : p.diferenca < -0.004 ? 'bom' : ''}">${p.diferenca > 0 ? '+' : ''}${moeda(p.diferenca)}</span>`}</td>
        <td>${sit(p.situacao, COR_PRE[p.situacao])}${p.enviado_em ? `<br><small>enviado ${dia(p.enviado_em)}</small>` : ''}</td>
        <td>${p.status !== 'cancelado' && !p.chave_cte ? `<button class="btn btn-secundario pa-mini" data-pre-cancelar="${p.id}">Cancelar</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="12" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum pré-conhecimento. Eles saem ao fechar um embarque ou pelo botão "Gerar".</td></tr>'}
      </tbody></table></div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;"><button class="btn btn-secundario" id="preImprimir" style="width:auto;">Imprimir os marcados</button><button class="btn btn-primario" id="preEnviar" style="width:auto;">Mandar os marcados à transportadora</button></div>`;
    cont.querySelectorAll('[data-pre-sit]').forEach((b) => b.addEventListener('click', () => { preSit = b.dataset.preSit; desenharPre().catch(erro); }));
    $('preTodos')?.addEventListener('click', (ev) => { ev.preventDefault(); preFiltro = {}; desenharPre().catch(erro); });
    $('preTodas').addEventListener('change', (ev) => cont.querySelectorAll('.preMarca').forEach((c) => { c.checked = ev.target.checked; }));
    const marcados = () => [...cont.querySelectorAll('.preMarca:checked')].map((c) => c.closest('tr'));
    $('preImprimir').addEventListener('click', () => { const ls = marcados(); if (!ls.length) return mostrarAlerta('Marque os pré-conhecimentos.'); abrirHtml(`/api/cargas/pre/documento?ids=${ls.map((tr) => tr.dataset.pre).join(',')}`); });
    $('preEnviar').addEventListener('click', async () => {
      const ls = marcados(); if (!ls.length) return mostrarAlerta('Marque os pré-conhecimentos.');
      const ts = [...new Set(ls.map((tr) => tr.dataset.t))];
      if (ts.length > 1) return mostrarAlerta('Marque os de uma transportadora só.', { tipo: 'erro' });
      const sug = await apiFetch(`/api/ordens-coleta/email-transportadora?nome=${encodeURIComponent(ts[0])}`).then((x) => x.json()).catch(() => ({}));
      const para = await pedirTexto(`E-mail de ${ts[0] || 'a transportadora'}:`, { valor: sug.email || '', textoOk: 'Mandar' });
      if (!para) return;
      try { const r = await post('/pre/enviar', { ids: ls.map((tr) => Number(tr.dataset.pre)), para }); mostrarAlerta(`${r.enviados} pré-conhecimento(s) mandado(s).`, { tipo: 'sucesso' }); await desenharPre(); } catch (err) { erro(err); }
    });
    cont.querySelectorAll('[data-pre-cancelar]').forEach((b) => b.addEventListener('click', async () => { try { await post(`/pre/${b.dataset.preCancelar}/cancelar`); await desenharPre(); } catch (err) { erro(err); } }));
    $('preGerar').addEventListener('click', async () => {
      const ns = await api('/pre/sem');
      const caixa = janela(`${cab('Gerar pré-conhecimentos')}<p style="font-size:13px;">Notas CIF esperando o CT-e, ainda sem pré-conhecimento. O valor é o frete calculado pela tabela, parcela por parcela.</p>
        <div style="max-height:50vh; overflow:auto; border:1px solid var(--borda); border-radius:8px;"><table class="tabela"><thead><tr><th><input type="checkbox" id="pgTodas"></th><th>NF-e</th><th>Cliente</th><th>Destino</th><th>Transportadora</th><th>Frete (tabela)</th></tr></thead><tbody>
        ${ns.map((n) => `<tr data-n="${n.id}"><td><input type="checkbox" class="pgMarca"></td><td>${esc(n.numero)}</td><td>${esc(n.cliente)}</td><td>${esc([n.cidade, n.uf].filter(Boolean).join('/'))}</td><td>${esc(n.transportadora || '—')}</td><td>${moeda(n.frete_previsto)}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center; padding:14px;">Nenhuma nota sem pré-conhecimento.</td></tr>'}</tbody></table></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" data-cg-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="pgOk" style="width:auto;">Gerar</button></div>`, 820);
      $('pgTodas').addEventListener('change', (ev) => caixa.querySelectorAll('.pgMarca').forEach((c) => { c.checked = ev.target.checked; }));
      $('pgOk').addEventListener('click', async () => {
        const ids = [...caixa.querySelectorAll('.pgMarca:checked')].map((c) => Number(c.closest('tr').dataset.n));
        if (!ids.length) return mostrarAlerta('Marque as notas.');
        try { const r = await post('/pre', { frete_ids: ids }); fechar(); mostrarAlerta(`${r.gerados} pré-conhecimento(s) gerado(s).`, { tipo: 'sucesso' }); await desenharPre(); } catch (err) { erro(err); }
      });
    });
  }

  // ================= Cargas fracionadas e tabelas de lotação =================
  async function desenharFracionadas() {
    const [d, lots] = await Promise.all([api('/fracionadas'), api('/lotacoes')]);
    const r = d.resumo;
    const corSug = { 'Virar lotação': 'entregue', 'Manter fracionada': 'em_transito', 'Sem tabela de lotação para o destino': '', 'Notas sem frete calculado: confira': 'ocorrencia' };
    cont.innerHTML = `<div class="nf-resumo">
        <div>Destinos com notas esperando<b>${num(r.destinos)}</b><span>${num(r.notas)} nota(s) · ${num(r.peso, 1)} kg</span></div>
        <div>Frete fracionado (tabela)<b>${moeda(r.fracionado)}</b><span>&nbsp;</span></div>
        <div>Dá para virar lotação<b>${num(r.virar_lotacao)}</b><span>destino(s)</span></div>
        <div>Economia possível<b>${moeda(r.economia)}</b><span>fracionado − lotação</span></div></div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:12px;"><table class="tabela"><thead><tr><th>Destino</th><th>Notas</th><th>Peso</th><th>m³</th><th>Frete fracionado</th><th>Melhor lotação</th><th>Ocupação</th><th>Economia</th><th>Sugestão</th><th></th></tr></thead><tbody>
      ${d.destinos.length ? d.destinos.map((x, i) => `<tr><td><b>${esc(x.destino)}</b><br><small style="color:var(--texto-fraco);">${esc(x.transportadoras.join(', '))}</small></td><td>${x.notas}</td><td>${num(x.peso, 1)} kg</td><td>${num(x.m3, 2)}</td>
        <td>${moeda(x.fracionado)}${x.sem_calculo ? `<br><small class="pa-alerta">${x.sem_calculo} sem cálculo</small>` : ''}</td>
        <td>${x.lotacao ? `${moeda(x.lotacao.valor)}<br><small>${esc(x.lotacao.transportadora)} · ${esc(x.lotacao.veiculo)}</small>` : '—'}</td><td style="min-width:110px;">${ocBarra(x.ocupacao)}</td>
        <td>${x.economia == null ? '—' : `<span class="re-var ${x.economia > 0 ? 'bom' : 'ruim'}">${moeda(x.economia)}</span>`}</td><td>${sit(x.sugestao, corSug[x.sugestao])}</td>
        <td><button class="btn btn-${x.sugestao === 'Virar lotação' ? 'primario' : 'secundario'} pa-mini" data-fr-montar="${i}">Montar embarque</button></td></tr>`).join('') : '<tr><td colspan="10" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhuma nota esperando embarque.</td></tr>'}
      </tbody></table></div>
      <div class="painel" style="margin-top:14px;"><div style="display:flex; align-items:center; gap:10px;"><h4 style="margin:0;">Tabelas de lotação (preço por viagem)</h4><span style="flex:1;"></span><button class="btn btn-secundario" style="width:auto;" id="lotNova">＋ Nova tabela de lotação</button></div>
        <table class="tabela" style="margin-top:8px;"><thead><tr><th>Transportadora</th><th>Destino</th><th>Veículo</th><th>Capacidade</th><th>Valor da viagem</th><th>Prazo</th><th>Ativa</th><th></th></tr></thead><tbody>
        ${lots.length ? lots.map((l) => `<tr><td>${esc(l.transportadora)}</td><td>${esc(l.cidade_destino || 'Todo o estado')}/${esc(l.uf_destino)}</td><td>${esc(VEIC[l.tipo_veiculo]?.nome || '—')}</td><td>${num(l.cap_kg)} kg · ${num(l.cap_m3)} m³</td><td>${moeda(l.valor_viagem)}</td><td>${l.prazo_dias ? `${l.prazo_dias} d` : '—'}</td><td>${l.ativa ? 'Sim' : 'Não'}</td>
          <td style="white-space:nowrap;"><button class="btn btn-secundario pa-mini" data-lot-ed="${l.id}">Editar</button> <button class="btn btn-secundario pa-mini" data-lot-ex="${l.id}">Excluir</button></td></tr>`).join('') : '<tr><td colspan="8" style="text-align:center; padding:14px; color:var(--texto-fraco);">Cadastre o preço por viagem (veículo fechado) de cada transportadora e destino para o sistema comparar com o fracionado.</td></tr>'}
        </tbody></table></div>`;
    cont.querySelectorAll('[data-fr-montar]').forEach((b) => b.addEventListener('click', () => {
      const x = d.destinos[Number(b.dataset.frMontar)];
      formEmbarque(null, { ids: x.frete_ids, modalidade: x.sugestao === 'Virar lotação' ? 'lotacao' : 'fracionada', transportadora: x.sugestao === 'Virar lotação' ? x.lotacao.transportadora : (x.transportadoras.length === 1 ? x.transportadoras[0] : ''),
        tipo_veiculo: x.lotacao?.tipo_veiculo, lotacao_id: x.sugestao === 'Virar lotação' ? x.lotacao.id : null }).catch(erro);
    }));
    const formLot = (l) => {
      janela(`${cab(l ? 'Tabela de lotação' : 'Nova tabela de lotação')}<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px 14px;">
        <div class="campo"><label>Transportadora</label><input id="lTr" value="${esc(l?.transportadora || '')}"></div><div class="campo"><label>UF de destino</label><input id="lUf" maxlength="2" value="${esc(l?.uf_destino || '')}"></div>
        <div class="campo"><label>Cidade (vazio = o estado todo)</label><input id="lCid" value="${esc(l?.cidade_destino || '')}"></div>
        <div class="campo"><label>Veículo</label><select id="lVe"><option value="">—</option>${Object.entries(VEIC).map(([k, v]) => `<option value="${k}"${k === l?.tipo_veiculo ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label>Valor da viagem (R$)</label><input id="lVa" value="${l ? num(l.valor_viagem, 2) : ''}"></div><div class="campo"><label>Capacidade (kg)</label><input id="lKg" value="${l?.cap_kg ?? ''}" placeholder="padrão do veículo"></div>
        <div class="campo"><label>Capacidade (m³)</label><input id="lM3" value="${l?.cap_m3 ?? ''}" placeholder="padrão do veículo"></div><div class="campo"><label>Prazo (dias)</label><input id="lPr" type="number" value="${l?.prazo_dias ?? ''}"></div>
        <div class="campo"><label><input type="checkbox" id="lAt"${!l || l.ativa ? ' checked' : ''}> Ativa</label></div></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" data-cg-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="lOk" style="width:auto;">Salvar</button></div>`, 720);
      $('lOk').addEventListener('click', async () => {
        const b = { transportadora: $('lTr').value, uf_destino: $('lUf').value, cidade_destino: $('lCid').value, tipo_veiculo: $('lVe').value, valor_viagem: $('lVa').value,
          cap_kg: $('lKg').value, cap_m3: $('lM3').value, prazo_dias: $('lPr').value, ativa: $('lAt').checked };
        try { if (l) await post(`/lotacoes/${l.id}`, b, 'PUT'); else await post('/lotacoes', b); fechar(); await desenharFracionadas(); } catch (err) { erro(err); }
      });
    };
    $('lotNova').addEventListener('click', () => formLot(null));
    cont.querySelectorAll('[data-lot-ed]').forEach((b) => b.addEventListener('click', () => formLot(lots.find((l) => l.id === Number(b.dataset.lotEd)))));
    cont.querySelectorAll('[data-lot-ex]').forEach((b) => b.addEventListener('click', async () => { if (!await confirmar('Excluir esta tabela de lotação?', { textoOk: 'Excluir' })) return; try { await api(`/lotacoes/${b.dataset.lotEx}`, { method: 'DELETE' }); await desenharFracionadas(); } catch (err) { erro(err); } }));
  }

  // ================= Capacidade das transportadoras =================
  async function desenharCapacidade() {
    const d = await api('/capacidade');
    const cor = (o, acima) => (acima ? 'var(--vermelho)' : o == null ? 'transparent' : o >= 0.8 ? '#d97706' : 'var(--verde)');
    cont.innerHTML = `<div class="pa-topo"><span>O que cada transportadora aguenta por dia × o que está programado para ela (embarques e ordens de coleta). Vermelho = passou da capacidade.</span></div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:12px;"><table class="tabela"><thead><tr><th>Transportadora</th><th>Capacidade por dia</th>${d.dias.map((x) => `<th style="text-align:center;">${new Date(`${x}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</th>`).join('')}</tr></thead><tbody>
      ${d.linhas.length ? d.linhas.map((l) => `<tr><td><b>${esc(l.transportadora)}</b></td><td>${l.capacidade ? [l.capacidade.veiculos_dia ? `${l.capacidade.veiculos_dia} veíc.` : '', l.capacidade.peso_dia_kg ? `${num(l.capacidade.peso_dia_kg)} kg` : '', l.capacidade.m3_dia ? `${num(l.capacidade.m3_dia)} m³` : ''].filter(Boolean).join(' · ') : '<small style="color:var(--texto-fraco);">não cadastrada</small>'}</td>
        ${l.dias.map((x) => `<td style="text-align:center; ${x.veiculos ? `border-bottom:3px solid ${cor(x.ocupacao, x.acima)};` : ''}">${x.veiculos ? `<b>${x.veiculos}</b> veíc.<br><small>${num(x.peso)} kg${x.ocupacao != null ? ` · ${pct(x.ocupacao)}` : ''}</small>` : '<span style="color:var(--texto-fraco);">·</span>'}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${d.dias.length + 2}" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nada programado e nenhuma capacidade cadastrada.</td></tr>`}
      </tbody></table></div>
      <div class="painel" style="margin-top:14px;"><div style="display:flex; align-items:center; gap:10px;"><h4 style="margin:0;">Capacidade cadastrada</h4><span style="flex:1;"></span><button class="btn btn-secundario" style="width:auto;" id="capNova">＋ Cadastrar capacidade</button></div>
        <table class="tabela" style="margin-top:8px;"><thead><tr><th>Transportadora</th><th>Região</th><th>Veículos/dia</th><th>Peso/dia</th><th>m³/dia</th><th>Ativa</th><th></th></tr></thead><tbody>
        ${d.capacidades.length ? d.capacidades.map((c) => `<tr><td>${esc(c.transportadora)}</td><td>${esc(c.regiao || 'Todas')}</td><td>${num(c.veiculos_dia)}</td><td>${c.peso_dia_kg ? `${num(c.peso_dia_kg)} kg` : '—'}</td><td>${num(c.m3_dia)}</td><td>${c.ativa ? 'Sim' : 'Não'}</td>
          <td style="white-space:nowrap;"><button class="btn btn-secundario pa-mini" data-cap-ed="${c.id}">Editar</button> <button class="btn btn-secundario pa-mini" data-cap-ex="${c.id}">Excluir</button></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center; padding:14px; color:var(--texto-fraco);">Cadastre quantos veículos, kg e m³ cada transportadora atende por dia para o sistema avisar quando passar.</td></tr>'}
        </tbody></table></div>`;
    const formCap = (c) => {
      janela(`${cab(c ? 'Capacidade' : 'Cadastrar capacidade')}<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px 14px;">
        <div class="campo"><label>Transportadora</label><input id="cTr" value="${esc(c?.transportadora || '')}"></div><div class="campo"><label>Região (informativo)</label><input id="cRe" value="${esc(c?.regiao || '')}" placeholder="vazio = todas"></div>
        <div class="campo"><label>Veículos por dia</label><input id="cVe" type="number" value="${c?.veiculos_dia ?? ''}"></div><div class="campo"><label>Peso por dia (kg)</label><input id="cKg" value="${c?.peso_dia_kg ?? ''}"></div>
        <div class="campo"><label>m³ por dia</label><input id="cM3" value="${c?.m3_dia ?? ''}"></div><div class="campo"><label><input type="checkbox" id="cAt"${!c || c.ativa ? ' checked' : ''}> Ativa</label></div></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" data-cg-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="cOk" style="width:auto;">Salvar</button></div>`, 680);
      $('cOk').addEventListener('click', async () => {
        const b = { transportadora: $('cTr').value, regiao: $('cRe').value, veiculos_dia: $('cVe').value, peso_dia_kg: $('cKg').value, m3_dia: $('cM3').value, ativa: $('cAt').checked };
        try { if (c) await post(`/capacidades/${c.id}`, b, 'PUT'); else await post('/capacidades', b); fechar(); await desenharCapacidade(); } catch (err) { erro(err); }
      });
    };
    $('capNova').addEventListener('click', () => formCap(null));
    cont.querySelectorAll('[data-cap-ed]').forEach((b) => b.addEventListener('click', () => formCap(d.capacidades.find((c) => c.id === Number(b.dataset.capEd)))));
    cont.querySelectorAll('[data-cap-ex]').forEach((b) => b.addEventListener('click', async () => { if (!await confirmar('Excluir esta capacidade?', { textoOk: 'Excluir' })) return; try { await api(`/capacidades/${b.dataset.capEx}`, { method: 'DELETE' }); await desenharCapacidade(); } catch (err) { erro(err); } }));
  }
})();
