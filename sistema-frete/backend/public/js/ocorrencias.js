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
    const ids = marcados(); const item = catalogo.find((c) => c.id === $('ocLoteTipo').value);
    if (!item) { mostrarAlerta('Escolha a ocorrência.', { tipo: 'erro' }); return; }
    if (!await confirmar(`Lançar "${item.rotulo}" em ${ids.length} CT-e?`, { textoOk: 'Lançar' })) return;
    const b = e.currentTarget; b.disabled = true;
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
        <small>${o.tem_comprovante ? `<a href="/api/ocorrencias/ocorrencia/${o.id}/comprovante?token=${encodeURIComponent(token)}" target="_blank" rel="noopener">📎 Ver comprovante</a> · ` : ''}
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
  $('ocLinkRastreio').addEventListener('click', () => copiar(`${location.origin}/rastreio.html`));
})();
