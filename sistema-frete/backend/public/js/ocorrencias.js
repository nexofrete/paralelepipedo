// =====================================================================
// Ocorrências de entrega dos CT-e emitidos (estilo SSW): painel com
// previsão e situação, lançamento (um a um ou em lote) com comprovante,
// histórico e link de rastreio para o cliente.
// Usa do dashboard.js: usuario, token, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const nav = document.getElementById('navOcorrencias');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
  const diaSemana = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—');
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const p2 = (n) => String(n).padStart(2, '0');
  const agoraLocal = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const api = async (caminho, opcoes = {}) => {
    const formulario = opcoes.body instanceof FormData;
    const r = await apiFetch(`/api/ocorrencias${caminho}`, { ...opcoes, headers: formulario ? (opcoes.headers || {}) : { 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  };
  const COR_TIPO = { transito: '#4d7cff', em_rota: '#06b6d4', agendada: '#a855f7', entrega: '#22c55e', problema: '#f59e0b', devolucao: '#ef4444', informativo: '#8a94a6' };

  let catalogo = []; let situacoes = {};
  let estado = { filtro: 'abertos', dados: null };
  const FILTROS = [
    ['abertos', 'Em aberto'], ['atrasados', 'Atrasados', 'perigo'], ['hoje', 'Previsão hoje'], ['em_rota', 'Saiu para entrega'],
    ['ocorrencia', 'Com ocorrência', 'perigo'], ['entregues', 'Entregues'], ['devolvidos', 'Devolvidos'], ['todos', 'Todos'],
  ];

  async function iniciar() {
    if (!catalogo.length) {
      const c = await api('/catalogo');
      catalogo = c.catalogo; situacoes = c.situacoes;
      $('ocLoteTipo').innerHTML = opcoesCatalogo();
      const hoje = new Date(); $('ocAte').value = `${hoje.getFullYear()}-${p2(hoje.getMonth() + 1)}-${p2(hoje.getDate())}`;
      $('ocDe').value = `${hoje.getFullYear()}-${p2(hoje.getMonth() + 1)}-01`;
    }
    await carregar();
  }
  nav.addEventListener('click', () => iniciar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })));

  const opcoesCatalogo = (selecionado = '') => {
    const grupos = [...new Set(catalogo.map((c) => c.grupo))];
    return `<option value="">Escolha a ocorrência...</option>${grupos.map((g) => `<optgroup label="${esc(g)}">${catalogo.filter((c) => c.grupo === g)
      .map((c) => `<option value="${c.id}" ${c.id === selecionado ? 'selected' : ''}>${esc(c.rotulo)}</option>`).join('')}</optgroup>`).join('')}`;
  };

  let temporizador = null;
  $('ocBusca').addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(carregar, 350); });
  ['ocDe', 'ocAte'].forEach((id) => $(id).addEventListener('change', carregar));

  async function carregar() {
    const q = new URLSearchParams({ filtro: estado.filtro, busca: $('ocBusca').value.trim(), de: $('ocDe').value, ate: $('ocAte').value });
    estado.dados = await api(`/painel?${q}`);
    desenhar();
  }

  function previsaoHtml(l, hoje) {
    if (!l.previsao_entrega) return '<span class="oc-prev">—</span>';
    if (l.situacao_entrega === 'entregue') {
      const atraso = l.previsao_original && l.data_entrega && String(l.data_entrega).slice(0, 10) > String(l.previsao_original).slice(0, 10);
      return `<span class="oc-prev ${atraso ? 'atraso' : ''}">${dia(l.previsao_entrega)}<small>${atraso ? 'entregue com atraso' : 'no prazo'}</small></span>`;
    }
    if (l.situacao_entrega === 'devolvido') return `<span class="oc-prev">${dia(l.previsao_entrega)}</span>`;
    const p = String(l.previsao_entrega).slice(0, 10);
    const dias = Math.round((new Date(`${p}T12:00:00`) - new Date(`${hoje}T12:00:00`)) / 86400000);
    if (dias < 0) return `<span class="oc-prev atraso">${diaSemana(p)}<small>${-dias} dia${dias < -1 ? 's' : ''} de atraso</small></span>`;
    if (dias === 0) return `<span class="oc-prev hoje">${diaSemana(p)}<small>é hoje</small></span>`;
    return `<span class="oc-prev">${diaSemana(p)}<small style="color:var(--texto-fraco);">em ${dias} dia${dias > 1 ? 's' : ''}</small></span>`;
  }

  function desenhar() {
    const d = estado.dados; const c = d.contagens;
    const pctPrazo = c.entregues_30 ? Math.round((c.no_prazo_30 / c.entregues_30) * 100) : null;
    $('ocResumo').innerHTML = `
      <div><b>${c.abertos}</b>em aberto</div>
      <div><b style="color:${c.atrasados ? '#ef4444' : 'inherit'};">${c.atrasados}</b>atrasados</div>
      <div><b>${c.hoje}</b>previsão para hoje</div>
      <div><b style="color:${c.ocorrencia ? '#d97706' : 'inherit'};">${c.ocorrencia}</b>com ocorrência</div>
      <div><b>${c.entregues_hoje}</b>entregues hoje</div>
      <div><b>${pctPrazo == null ? '—' : `${pctPrazo}%`}</b>entregues no prazo (30 dias)</div>`;
    const cont = { abertos: c.abertos, atrasados: c.atrasados, hoje: c.hoje, em_rota: c.em_rota, ocorrencia: c.ocorrencia };
    $('ocFiltros').innerHTML = FILTROS.map(([k, t, cls]) => `<button class="oc-filtro ${cls || ''} ${estado.filtro === k ? 'ativo' : ''}" data-oc-filtro="${k}">${t}${cont[k] != null ? `<span class="n">${cont[k]}</span>` : ''}</button>`).join('');
    $('ocPeriodo').classList.toggle('oculto', !['entregues', 'devolvidos', 'todos'].includes(estado.filtro));
    if (!d.linhas.length) {
      $('ocTabela').innerHTML = `<div class="kanban-vazio">${estado.filtro === 'atrasados' ? 'Nenhuma entrega atrasada. 👏' : 'Nenhum CT-e aqui.'}</div>`;
      atualizarLote();
      return;
    }
    const marcavel = (l) => !['entregue', 'devolvido'].includes(l.situacao_entrega);
    $('ocTabela').innerHTML = `<table class="edi-tabela"><thead><tr>
        <th><input type="checkbox" id="ocTodos" title="Marcar todos" /></th><th>CT-e</th><th>NF</th><th>Destinatário</th><th>Emissão</th><th>Previsão</th><th>Situação</th><th></th></tr></thead><tbody>
      ${d.linhas.map((l) => `<tr>
        <td>${marcavel(l) ? `<input type="checkbox" data-oc-marca="${l.id}" />` : ''}</td>
        <td><b>${esc(l.serie)}/${esc(l.numero)}</b>${l.demonstracao ? '<br><small style="color:var(--azul);">demonstração</small>' : ''}</td>
        <td>${esc(l.nfs.join(', ') || '—')}</td>
        <td>${esc(l.destinatario_nome || '—')}<br><small style="color:var(--texto-fraco);">${esc(l.cidade_fim || '')}${l.uf_fim ? `/${esc(l.uf_fim)}` : ''}</small></td>
        <td>${dia(l.autorizado_em)}</td>
        <td>${previsaoHtml(l, d.hoje)}</td>
        <td><span class="oc-sit ${esc(l.situacao_entrega)}">${esc(situacoes[l.situacao_entrega] || l.situacao_entrega)}</span>
          ${l.situacao_entrega === 'entregue' ? `<br><small style="color:var(--texto-fraco);">${dataHora(l.data_entrega)}${l.recebedor_nome ? ` · ${esc(l.recebedor_nome)}` : ''}</small>`
    : l.ultima ? `<br><small style="color:var(--texto-fraco);">${esc(l.ultima.descricao)} · ${dataHora(l.ultima.data_hora)}</small>` : ''}</td>
        <td><div class="oc-linha-acoes">
          ${marcavel(l) ? `<button class="primario" data-oc-lancar="${l.id}">+ Ocorrência</button>` : ''}
          <button data-oc-ver="${l.id}">Histórico${l.qtd_ocorrencias ? ` (${l.qtd_ocorrencias})` : ''}</button></div></td></tr>`).join('')}
      </tbody></table>${d.linhas.length >= 1000 ? '<p class="edi-dica">Mostrando os primeiros 1000. Use a busca para achar os outros.</p>' : ''}`;
    $('ocTodos').addEventListener('change', (e) => { document.querySelectorAll('[data-oc-marca]').forEach((x) => { x.checked = e.target.checked; }); atualizarLote(); });
    atualizarLote();
  }

  $('ocFiltros').addEventListener('click', (e) => {
    const b = e.target.closest('[data-oc-filtro]');
    if (!b) return;
    estado.filtro = b.dataset.ocFiltro;
    carregar().catch((err) => mostrarAlerta(err.message, { tipo: 'erro' }));
  });
  $('ocTabela').addEventListener('change', (e) => { if (e.target.matches('[data-oc-marca]')) atualizarLote(); });
  $('ocTabela').addEventListener('click', (e) => {
    const lancarB = e.target.closest('[data-oc-lancar]');
    if (lancarB) { abrirLancamento(Number(lancarB.dataset.ocLancar)); return; }
    const ver = e.target.closest('[data-oc-ver]');
    if (ver) abrirHistorico(Number(ver.dataset.ocVer));
  });

  // ---------------- Lote ----------------
  const marcados = () => [...document.querySelectorAll('[data-oc-marca]:checked')].map((x) => Number(x.dataset.ocMarca));
  function atualizarLote() {
    const n = marcados().length;
    $('ocLote').classList.toggle('oculto', !n);
    $('ocLoteQtd').textContent = `${n} CT-e marcado${n > 1 ? 's' : ''}:`;
    if (!$('ocLoteData').value) $('ocLoteData').value = agoraLocal();
  }
  $('ocLoteTipo').addEventListener('change', () => {
    const item = catalogo.find((c) => c.id === $('ocLoteTipo').value);
    $('ocLoteRecebedor').classList.toggle('oculto', !(item?.tipo === 'entrega'));
    $('ocLotePrevisao').classList.toggle('oculto', !item?.pedePrevisao);
  });
  $('ocLoteAplicar').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    const ids = marcados(); const item = catalogo.find((c) => c.id === $('ocLoteTipo').value);
    if (!item) { mostrarAlerta('Escolha a ocorrência.', { tipo: 'erro' }); return; }
    if (!await confirmar(`Lançar "${item.rotulo}" em ${ids.length} CT-e?`, { textoOk: 'Lançar' })) return;
    b.disabled = true;
    try {
      const r = await api('/lote', { method: 'POST', body: JSON.stringify({ ids, tipo_id: item.id, data_hora: $('ocLoteData').value,
        recebedor_nome: $('ocLoteRecebedor').value, nova_previsao: $('ocLotePrevisao').value }) });
      mostrarAlerta(`"${item.rotulo}" lançado em ${r.lancadas} CT-e.`, { tipo: 'sucesso' });
      $('ocLoteRecebedor').value = ''; $('ocLoteData').value = '';
      await carregar();
    } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); } finally { b.disabled = false; }
  });

  // ---------------- Modal: lançar e histórico ----------------
  const modal = $('painelOcorrencia');
  const fecharModal = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-oc-fechar]')) fecharModal(); });

  function cabecalhoCte(c) {
    return `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
      <div><h3 style="margin:0;">CT-e ${esc(c.serie)}/${esc(c.numero)} <span class="oc-sit ${esc(c.situacao_entrega)}" style="vertical-align:middle;">${esc(situacoes[c.situacao_entrega] || c.situacao_entrega)}</span></h3>
        <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:4px;">${esc(c.destinatario_nome || '')} · ${esc(c.destino || '')}${c.nfs?.length ? ` · NF ${esc(c.nfs.join(', '))}` : ''}<br>
        ${c.endereco ? `${esc(c.endereco)} · ` : ''}Previsão: <b>${c.previsao_entrega ? diaSemana(c.previsao_entrega) : '—'}</b>${c.previsao_original && c.previsao_original !== c.previsao_entrega ? ` (original ${dia(c.previsao_original)})` : ''}${c.prazo_dias != null ? ` · prazo ${c.prazo_dias} dia(s) útil(eis)` : ''}</div></div>
      <span style="cursor:pointer; font-size:18px;" data-oc-fechar>✕</span></div>`;
  }

  async function abrirLancamento(id) {
    const c = await api(`/${id}`);
    $('ocModalConteudo').innerHTML = `${cabecalhoCte(c)}
      <div class="oc-form" style="margin-top:16px;">
        <div class="campo inteiro"><label for="ocTipo">Ocorrência</label><select id="ocTipo">${opcoesCatalogo()}</select></div>
        <div class="campo"><label for="ocData">Data e hora</label><input type="datetime-local" id="ocData" value="${agoraLocal()}" /></div>
        <div class="campo"><label for="ocCidade">Local (cidade)</label><input type="text" id="ocCidade" placeholder="${esc((c.destino || '').split('/')[0])}" /></div>
        <div class="campo oc-receb oculto"><label for="ocRecebedor">Recebido por</label><input type="text" id="ocRecebedor" maxlength="120" placeholder="Nome de quem recebeu" /></div>
        <div class="campo oc-receb oculto"><label for="ocDoc">Documento (RG/CPF)</label><input type="text" id="ocDoc" maxlength="30" /></div>
        <div class="campo oc-prevcampo oculto"><label for="ocPrevisao">Nova previsão de entrega</label><input type="date" id="ocPrevisao" /></div>
        <div class="campo inteiro"><label for="ocObs">Observação (fica só aqui dentro)</label><textarea id="ocObs" rows="2" maxlength="500"></textarea></div>
        <div class="campo inteiro"><label for="ocFoto">Comprovante (foto do canhoto ou PDF) — opcional</label><input type="file" id="ocFoto" accept="image/*,application/pdf" capture="environment" /></div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:6px;">
        <button class="btn btn-secundario" data-oc-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="ocSalvar" style="width:auto;">Lançar ocorrência</button></div>`;
    modal.classList.remove('oculto');
    $('ocTipo').addEventListener('change', () => {
      const item = catalogo.find((x) => x.id === $('ocTipo').value);
      document.querySelectorAll('.oc-receb').forEach((x) => x.classList.toggle('oculto', !item?.pedeRecebedor));
      document.querySelector('.oc-prevcampo').classList.toggle('oculto', !item?.pedePrevisao);
      $('ocObs').placeholder = item?.pedeObservacao ? 'Obrigatório: descreva o que aconteceu' : '';
    });
    $('ocSalvar').addEventListener('click', async (e) => {
      const fd = new FormData();
      fd.append('tipo_id', $('ocTipo').value); fd.append('data_hora', $('ocData').value); fd.append('cidade', $('ocCidade').value);
      fd.append('recebedor_nome', $('ocRecebedor').value); fd.append('recebedor_documento', $('ocDoc').value);
      fd.append('nova_previsao', $('ocPrevisao').value); fd.append('observacao', $('ocObs').value);
      if ($('ocFoto').files[0]) fd.append('comprovante', $('ocFoto').files[0]);
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await api(`/${id}`, { method: 'POST', body: fd });
        fecharModal();
        mostrarAlerta(`"${r.descricao}" lançado no CT-e ${r.numero}.`, { tipo: 'sucesso' });
        await carregar();
      } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); b.disabled = false; }
    });
  }

  async function abrirHistorico(id) {
    const c = await api(`/${id}`);
    const itens = [...c.ocorrencias.map((o) => `<li style="--cor-ev:${COR_TIPO[o.tipo] || '#8a94a6'};"><b>${esc(o.descricao)}</b>
        <small>${dataHora(o.data_hora)}${o.cidade ? ` · ${esc(o.cidade)}${o.uf ? `/${esc(o.uf)}` : ''}` : ''} · lançado por ${esc(o.usuario_nome || '—')}</small>
        ${o.recebedor_nome ? `<small>Recebido por ${esc(o.recebedor_nome)}${o.recebedor_documento ? ` (${esc(o.recebedor_documento)})` : ''}</small>` : ''}
        ${o.nova_previsao ? `<small>Nova previsão: ${diaSemana(o.nova_previsao)}</small>` : ''}
        ${o.observacao ? `<small style="white-space:pre-wrap;">${esc(o.observacao)}</small>` : ''}
        <small>${o.origem === 'motorista' ? '📱 pelo app do motorista · ' : ''}${o.romaneio_id ? `romaneio ${o.romaneio_id} · ` : ''}${o.tem_comprovante ? `<a href="/api/ocorrencias/ocorrencia/${o.id}/comprovante?token=${encodeURIComponent(token)}" target="_blank" rel="noopener">📎 Ver comprovante</a> · ` : ''}${o.tem_assinatura ? `<a href="/api/ocorrencias/ocorrencia/${o.id}/comprovante?tipo=assinatura&token=${encodeURIComponent(token)}" target="_blank" rel="noopener">✍ Assinatura</a> · ` : ''}${o.latitude != null ? `<a href="https://www.google.com/maps?q=${o.latitude},${o.longitude}" target="_blank" rel="noopener">📍 Local</a> · ` : ''}
          <a href="#" data-oc-apagar="${o.id}" style="color:var(--vermelho);">apagar</a>${o.enviada_edi_em ? ' · enviada no OCOREN' : ''}</small></li>`),
    `<li style="--cor-ev:#8a94a6;"><b>CT-e emitido</b><small>${dataHora(c.autorizado_em)} · ${esc(c.origem || '')}</small></li>`].join('');
    $('ocModalConteudo').innerHTML = `${cabecalhoCte(c)}<ul class="oc-tempo">${itens}</ul>
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        ${c.chave ? `<button class="btn btn-secundario" id="ocCopiarLink" style="width:auto;">🔗 Copiar link de rastreio</button>` : ''}
        ${!['entregue', 'devolvido'].includes(c.situacao_entrega) && c.status === 'autorizado' ? `<button class="btn btn-primario" id="ocNova" style="width:auto;">+ Ocorrência</button>` : ''}</div>`;
    modal.classList.remove('oculto');
    $('ocNova')?.addEventListener('click', () => abrirLancamento(id));
    $('ocCopiarLink')?.addEventListener('click', () => copiar(`${location.origin}/rastreio.html?chave=${c.chave}`));
    document.querySelectorAll('[data-oc-apagar]').forEach((a) => a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      if (!await confirmar('Apagar esta ocorrência? A situação do CT-e é refeita com as que sobrarem.', { tipo: 'perigo', textoOk: 'Apagar' })) return;
      try { await api(`/ocorrencia/${a.dataset.ocApagar}`, { method: 'DELETE' }); await abrirHistorico(id); carregar(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    }));
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); mostrarAlerta(`Link copiado:\n${texto}`, { tipo: 'sucesso' }); } catch { mostrarAlerta(texto); }
  }
  // ---------------- Romaneios ----------------
  const apiRom = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/romaneios${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  };
  const STATUS_ROM = { aberto: ['Aguardando saída', 'pendente'], em_rota: ['Em rota', 'em_rota'], fechado: ['Fechado', 'entregue'] };
  const linkMotorista = (codigo) => `${location.origin}/motorista.html${codigo ? `?c=${codigo}` : ''}`;
  document.querySelectorAll('[data-oc-aba]').forEach((a) => a.addEventListener('click', () => {
    document.querySelectorAll('[data-oc-aba]').forEach((x) => x.classList.toggle('ativo', x === a));
    $('ocAbaEntregas').classList.toggle('oculto', a.dataset.ocAba !== 'entregas');
    $('ocAbaRomaneios').classList.toggle('oculto', a.dataset.ocAba !== 'romaneios');
    if (a.dataset.ocAba === 'romaneios') carregarRomaneios().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
    else carregar().catch(() => {});
  }));

  async function carregarRomaneios() {
    const lista = await apiRom('');
    $('ocRomaneios').innerHTML = lista.length ? `<table class="edi-tabela"><thead><tr><th>Nº</th><th>Data</th><th>Motorista</th><th>Placa</th><th class="n">CT-e</th><th>Andamento</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((r) => `<tr><td><b>${r.id}</b></td><td>${dia(r.data)}</td><td>${esc(r.motorista_nome)}</td><td>${esc(r.placa || '—')}${r.veiculo ? `<br><small style="color:var(--texto-fraco);">${esc(r.veiculo)}</small>` : ''}</td>
        <td class="n">${r.ctes}</td><td>${r.entregues} entregue(s)${r.com_ocorrencia ? ` · <span style="color:#d97706;">${r.com_ocorrencia} com ocorrência</span>` : ''}
          <div style="height:5px; background:var(--bg-elevado); border-radius:3px; margin-top:4px; max-width:160px;"><div style="height:5px; border-radius:3px; background:var(--verde); width:${r.ctes ? Math.round((r.entregues / r.ctes) * 100) : 0}%;"></div></div></td>
        <td><span class="oc-sit ${STATUS_ROM[r.status][1]}">${STATUS_ROM[r.status][0]}</span></td>
        <td><div class="oc-linha-acoes"><button class="primario" data-rom-abrir="${r.id}">Abrir</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhum romaneio ainda. Marque os CT-e na aba Entregas e clique em "Montar romaneio".</div>';
  }
  $('ocRomaneios').addEventListener('click', (e) => { const b = e.target.closest('[data-rom-abrir]'); if (b) abrirRomaneio(Number(b.dataset.romAbrir)); });
  $('ocLinkMotorista').addEventListener('click', () => copiar(linkMotorista()));

  function formRomaneio(r = {}) {
    return `<div class="oc-form" style="margin-top:14px;">
      <div class="campo"><label for="rmMotorista">Motorista</label><input type="text" id="rmMotorista" maxlength="120" value="${esc(r.motorista_nome || '')}" /></div>
      <div class="campo"><label for="rmDoc">Documento (CPF/CNH)</label><input type="text" id="rmDoc" maxlength="30" value="${esc(r.motorista_documento || '')}" /></div>
      <div class="campo"><label for="rmFone">Celular do motorista</label><input type="text" id="rmFone" maxlength="30" value="${esc(r.motorista_telefone || '')}" /></div>
      <div class="campo"><label for="rmData">Data</label><input type="date" id="rmData" value="${esc(String(r.data || '').slice(0, 10) || new Date().toISOString().slice(0, 10))}" /></div>
      <div class="campo"><label for="rmPlaca">Placa</label><input type="text" id="rmPlaca" maxlength="8" value="${esc(r.placa || '')}" /></div>
      <div class="campo"><label for="rmVeiculo">Veículo</label><input type="text" id="rmVeiculo" maxlength="60" placeholder="Ex: VUC, 3/4, Truck" value="${esc(r.veiculo || '')}" /></div>
      <div class="campo inteiro"><label for="rmObs">Observação</label><input type="text" id="rmObs" value="${esc(r.observacao || '')}" /></div></div>`;
  }
  const lerFormRomaneio = () => ({ motorista_nome: $('rmMotorista').value, motorista_documento: $('rmDoc').value, motorista_telefone: $('rmFone').value,
    data: $('rmData').value, placa: $('rmPlaca').value, veiculo: $('rmVeiculo').value, observacao: $('rmObs').value });

  $('ocMontarRomaneio').addEventListener('click', () => {
    const ids = marcados();
    const linhas = (estado.dados?.linhas || []).filter((l) => ids.includes(l.id));
    $('ocModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🚚 Novo romaneio — ${ids.length} CT-e</h3><span style="cursor:pointer; font-size:18px;" data-oc-fechar>✕</span></div>
      ${formRomaneio()}
      <p class="edi-dica">Ordem de entrega (sugerida por cidade; mude com as setas):</p>
      <ol id="rmOrdem" class="rm-ordem">${linhas.sort((a, b) => `${a.cidade_fim}`.localeCompare(`${b.cidade_fim}`)).map((l) => `<li data-id="${l.id}"><span>CT-e ${esc(l.numero)} · ${esc(l.destinatario_nome || '')} · ${esc(l.cidade_fim || '')}</span>
        <span><button type="button" data-rm-sobe>▲</button><button type="button" data-rm-desce>▼</button></span></li>`).join('')}</ol>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-oc-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="rmCriar" style="width:auto;">Montar romaneio</button></div>`;
    modal.classList.remove('oculto');
    $('rmOrdem').addEventListener('click', (e) => {
      const li = e.target.closest('li'); if (!li) return;
      if (e.target.matches('[data-rm-sobe]') && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
      if (e.target.matches('[data-rm-desce]') && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
    });
    $('rmCriar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const ctes = [...document.querySelectorAll('#rmOrdem li')].map((li) => Number(li.dataset.id));
        const r = await apiRom('', { method: 'POST', body: JSON.stringify({ ...lerFormRomaneio(), ctes }) });
        await carregar();
        abrirRomaneio(r.id);
      } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); b.disabled = false; }
    });
  });

  async function abrirRomaneio(id) {
    const r = await apiRom(`/${id}`);
    const entregues = r.itens.filter((i) => i.situacao === 'entregue').length;
    $('ocModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div><h3 style="margin:0;">🚚 Romaneio ${r.id} <span class="oc-sit ${STATUS_ROM[r.status][1]}" style="vertical-align:middle;">${STATUS_ROM[r.status][0]}</span></h3>
        <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:4px;">${dia(r.data)} · ${esc(r.motorista_nome)}${r.placa ? ` · ${esc(r.placa)}` : ''}${r.veiculo ? ` · ${esc(r.veiculo)}` : ''} · ${entregues}/${r.itens.length} entregue(s)
        ${r.saiu_em ? ` · saiu ${dataHora(r.saiu_em)}` : ''}</div></div><span style="cursor:pointer; font-size:18px;" data-oc-fechar>✕</span></div>
      ${r.status !== 'fechado' ? `<div class="cte-aviso" style="margin:12px 0;">📱 App do motorista: <b>${esc(linkMotorista())}</b> · código <b style="font-size:15px; letter-spacing:2px;">${esc(r.codigo_acesso)}</b>
        <a href="#" id="rmCopiarLink">copiar link direto</a> · <a href="#" id="rmNovoCodigo">trocar código</a></div>` : ''}
      <table class="edi-tabela" style="margin-top:8px;"><thead><tr><th>#</th><th>CT-e</th><th>Destinatário</th><th>Cidade</th><th>Situação</th></tr></thead><tbody>
      ${r.itens.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.serie)}/${esc(i.numero)}<br><small style="color:var(--texto-fraco);">NF ${esc(i.nfs.join(', '))}</small></td>
        <td>${esc(i.destinatario)}<br><small style="color:var(--texto-fraco);">${esc(i.endereco)}${i.bairro ? ` — ${esc(i.bairro)}` : ''}</small></td><td>${esc(i.cidade)}/${esc(i.uf)}</td>
        <td><span class="oc-sit ${esc(i.situacao)}">${esc(situacoes[i.situacao] || i.situacao)}</span>${i.situacao === 'entregue' && i.recebedor ? `<br><small>${esc(i.recebedor)}</small>` : i.ultima ? `<br><small style="color:var(--texto-fraco);">${esc(i.ultima.descricao)}</small>` : ''}</td></tr>`).join('')}
      </tbody></table>
      ${r.status === 'aberto' ? `<details style="margin-top:12px;"><summary style="cursor:pointer;">Editar motorista / veículo</summary>${formRomaneio(r)}<button class="btn btn-secundario" id="rmSalvar" style="width:auto;">Salvar</button></details>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:16px;">
        ${r.status === 'aberto' ? '<button class="btn btn-secundario" id="rmExcluir" style="width:auto; color:var(--vermelho);">Excluir</button>' : ''}
        <a class="btn btn-secundario" href="/api/romaneios/${r.id}/imprimir?token=${encodeURIComponent(token)}" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">🖨 Imprimir</a>
        ${r.status === 'aberto' ? '<button class="btn btn-primario" id="rmSaida" style="width:auto;">▶ Dar saída (saiu para entrega)</button>' : ''}
        ${r.status === 'em_rota' ? '<button class="btn btn-primario" id="rmFechar" style="width:auto;">✓ Fechar romaneio (retorno)</button>' : ''}</div>`;
    modal.classList.remove('oculto');
    const recarregar = async () => { await abrirRomaneio(id); carregarRomaneios().catch(() => {}); carregar().catch(() => {}); };
    $('rmCopiarLink')?.addEventListener('click', (e) => { e.preventDefault(); copiar(linkMotorista(r.codigo_acesso)); });
    $('rmNovoCodigo')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!await confirmar('Trocar o código? O código antigo para de funcionar no celular do motorista.', { textoOk: 'Trocar' })) return;
      try { await apiRom(`/${id}/novo-codigo`, { method: 'POST' }); recarregar(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
    $('rmSalvar')?.addEventListener('click', async () => { try { await apiRom(`/${id}`, { method: 'PUT', body: JSON.stringify(lerFormRomaneio()) }); recarregar(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); } });
    $('rmExcluir')?.addEventListener('click', async () => {
      if (!await confirmar('Excluir este romaneio? Os CT-e voltam a ficar livres.', { tipo: 'perigo', textoOk: 'Excluir' })) return;
      try { await apiRom(`/${id}`, { method: 'DELETE' }); fecharModal(); carregarRomaneios(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
    $('rmSaida')?.addEventListener('click', async (e) => {
      const botao = e.currentTarget;   // depois do await o evento perde o currentTarget
      if (!await confirmar(`Dar saída? Os ${r.itens.length} CT-e ficam como "Saiu para entrega".`, { textoOk: 'Dar saída' })) return;
      botao.disabled = true;
      try { const x = await apiRom(`/${id}/saida`, { method: 'POST' }); mostrarAlerta(`Saída registrada: ${x.ctes} CT-e em "Saiu para entrega".`, { tipo: 'sucesso' }); recarregar(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
    $('rmFechar')?.addEventListener('click', async () => {
      const pendentes = r.itens.filter((i) => i.situacao === 'em_rota').length;
      if (!await confirmar(pendentes ? `Fechar o romaneio? ${pendentes} CT-e ainda estão "saiu para entrega" e vão ficar como "Voltou para a base sem entregar".` : 'Fechar o romaneio?', { textoOk: 'Fechar' })) return;
      try { const x = await apiRom(`/${id}/fechar`, { method: 'POST', body: '{}' }); mostrarAlerta(`Romaneio fechado.${x.voltaram ? ` ${x.voltaram} CT-e voltaram para a base.` : ''}`, { tipo: 'sucesso' }); recarregar(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
  }

  // ---------------- Feriados ----------------
  async function abrirFeriados(ano = new Date().getFullYear()) {
    const f = await api(`/feriados?ano=${ano}`);
    const UFS = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
    $('ocModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">📅 Feriados</h3><span style="cursor:pointer; font-size:18px;" data-oc-fechar>✕</span></div>
      <p class="edi-dica" style="margin-top:6px;">A previsão de entrega pula sábados, domingos, estes feriados nacionais e os que você cadastrar para a UF ou a cidade de destino.</p>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
        <button class="btn btn-secundario" data-oc-ano="${f.ano - 1}" style="width:auto; padding:4px 10px;">‹</button><b>${f.ano}</b>
        <button class="btn btn-secundario" data-oc-ano="${f.ano + 1}" style="width:auto; padding:4px 10px;">›</button></div>
      <table class="edi-tabela"><tbody>${f.nacionais.map((x) => `<tr><td style="white-space:nowrap;">${diaSemana(x.data)}</td><td>${esc(x.descricao)}</td><td><small style="color:var(--texto-fraco);">${esc(x.tipo)}</small></td></tr>`).join('')}</tbody></table>
      <h4 style="margin:18px 0 6px;">Estaduais, municipais e folgas</h4>
      ${f.cadastrados.length ? `<table class="edi-tabela"><tbody>${f.cadastrados.map((x) => `<tr><td style="white-space:nowrap;">${x.anual ? `${x.data.slice(8, 10)}/${x.data.slice(5, 7)} <small>(todo ano)</small>` : dia(x.data) + `/${x.data.slice(0, 4)}`}</td>
          <td>${esc(x.descricao)}</td><td>${esc([x.cidade, x.uf].filter(Boolean).join('/') || 'todo o país')}</td>
          <td><a href="#" data-oc-feriado-apagar="${x.id}" style="color:var(--vermelho);">apagar</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="edi-dica">Nenhum cadastrado.</p>'}
      <div class="oc-form" style="margin-top:12px;">
        <div class="campo"><label for="ofData">Data</label><input type="date" id="ofData" /></div>
        <div class="campo"><label for="ofNome">Nome</label><input type="text" id="ofNome" maxlength="120" placeholder="Ex: Aniversário da cidade" /></div>
        <div class="campo"><label for="ofUf">UF (vazio = todo o país)</label><select id="ofUf">${UFS.map((u) => `<option value="${u}">${u || '—'}</option>`).join('')}</select></div>
        <div class="campo"><label for="ofCidade">Cidade (vazio = a UF toda)</label><input type="text" id="ofCidade" maxlength="120" /></div>
        <label class="ag-check inteiro" style="margin-bottom:10px;"><input type="checkbox" id="ofAnual" checked /> Repete todo ano no mesmo dia</label>
      </div>
      <div style="display:flex; justify-content:flex-end;"><button class="btn btn-primario" id="ofSalvar" style="width:auto;">+ Cadastrar feriado</button></div>`;
    modal.classList.remove('oculto');
    document.querySelectorAll('[data-oc-ano]').forEach((b) => b.addEventListener('click', () => abrirFeriados(Number(b.dataset.ocAno))));
    document.querySelectorAll('[data-oc-feriado-apagar]').forEach((a) => a.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await api(`/feriados/${a.dataset.ocFeriadoApagar}`, { method: 'DELETE' }); abrirFeriados(f.ano); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    }));
    $('ofSalvar').addEventListener('click', async () => {
      try {
        await api('/feriados', { method: 'POST', body: JSON.stringify({ data: $('ofData').value, descricao: $('ofNome').value, uf: $('ofUf').value, cidade: $('ofCidade').value, anual: $('ofAnual').checked }) });
        abrirFeriados(f.ano);
      } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
  }
  $('ocFeriados').addEventListener('click', () => abrirFeriados().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })));

  $('ocLinkRastreio').addEventListener('click', () => copiar(`${location.origin}/rastreio.html`));
})();
