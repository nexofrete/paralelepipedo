// =====================================================================
// Filiais (unidades), onde está a mercadoria e transferências entre filiais.
// Usa do dashboard.js: usuario, token, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const nav = document.getElementById('navFiliais');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');
  const admin = usuario?.perfil === 'admin';

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
  const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const num = (v, c = 0) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: c });
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const json = async (url, opcoes = {}) => {
    const r = await apiFetch(url, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const modal = $('modalFilial');
  const fecharModal = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-fl-fechar]')) fecharModal(); });
  const SIT = { pendente: 'Aguardando', em_transito: 'Em trânsito', em_rota: 'Saiu para entrega', agendada: 'Agendado', ocorrencia: 'Com ocorrência' };
  const STATUS_T = { aberta: ['Carregando', 'pendente'], em_transito: ['Em trânsito', 'em_rota'], recebida: ['Recebida', 'entregue'] };
  let aba = 'estoque'; let filtroUnidade = null; let unidades = [];

  const abas = { estoque: 'flAbaEstoque', transferencias: 'flAbaTransferencias', unidades: 'flAbaUnidades' };
  document.querySelectorAll('[data-fl-aba]').forEach((a) => a.addEventListener('click', () => {
    aba = a.dataset.flAba;
    document.querySelectorAll('[data-fl-aba]').forEach((x) => x.classList.toggle('ativo', x === a));
    Object.entries(abas).forEach(([k, id]) => $(id).classList.toggle('oculto', k !== aba));
    carregar().catch(erro);
  }));
  if (!admin) document.querySelector('[data-fl-aba="unidades"]').classList.add('oculto');
  nav.addEventListener('click', () => carregar().catch(erro));
  $('flNovaTransf').addEventListener('click', () => novaTransferencia().catch(erro));
  const carregar = () => (aba === 'estoque' ? telaEstoque() : aba === 'transferencias' ? telaTransferencias() : telaUnidades());
  const sigla = (id) => unidades.find((u) => u.id === id)?.sigla || '—';

  // ---------------- Onde está a mercadoria ----------------
  async function telaEstoque() {
    const e = await json('/api/unidades/estoque');
    unidades = e.unidades;
    const emTransito = e.ctes.filter((c) => c.em_transferencia_id);
    const lista = e.ctes.filter((c) => (filtroUnidade === 'transito' ? c.em_transferencia_id : filtroUnidade ? c.unidade_atual_id === filtroUnidade : true));
    $('flAbaEstoque').innerHTML = `<div class="oc-resumo" style="grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));">
        ${e.unidades.filter((u) => u.ativa).map((u) => `<div data-fl-un="${u.id}" style="cursor:pointer; ${filtroUnidade === u.id ? 'outline:2px solid var(--azul);' : ''}">
          <span style="font-weight:700; color:var(--texto);">${esc(u.sigla)}</span> · ${esc(u.nome)}${u.matriz ? ' <small>(matriz)</small>' : ''}
          <b>${u.a_entregar + u.a_transferir} CT-e</b>
          <span>${u.a_entregar} a entregar · <span style="${u.a_transferir ? 'color:#d97706; font-weight:600;' : ''}">${u.a_transferir} a transferir</span>${u.chegando ? ` · ${u.chegando} chegando` : ''}<br>${num(u.volumes)} vol. · ${num(u.peso / 1000, 1)} t</span></div>`).join('')}
        <div data-fl-un="transito" style="cursor:pointer; ${filtroUnidade === 'transito' ? 'outline:2px solid var(--azul);' : ''}"><span style="font-weight:700; color:var(--texto);">🔀 Em trânsito</span><b>${emTransito.length} CT-e</b><span>no caminhão entre filiais</span></div>
      </div>
      <div class="painel oc-painel">
        <div class="oc-barra"><div class="oc-filtros">${filtroUnidade ? `<button class="oc-filtro" id="flTodas">✕ Mostrar todas as unidades</button>` : '<span style="font-size:13px; color:var(--texto-fraco);">Clique numa unidade para filtrar.</span>'}</div>
          <button class="btn btn-primario oculto" id="flTransfMarcados" style="width:auto;">🔀 Transferir os marcados</button></div>
        ${lista.length ? `<div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th style="width:28px;"></th><th>CT-e</th><th>Destinatário</th><th>Cidade de entrega</th><th class="n">Vol.</th><th>Está em</th><th>Entrega por</th><th>Previsão</th><th>Situação</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
          ${lista.map((c) => {
            const transferir = c.unidade_atual_id && c.unidade_destino_id && c.unidade_atual_id !== c.unidade_destino_id;
            return `<tr><td>${transferir && !c.transferencia_aberta && !c.romaneio_id ? `<input type="checkbox" data-fl-marca="${c.id}" data-origem="${c.unidade_atual_id}" data-destino="${c.unidade_destino_id}" aria-label="Marcar CT-e ${esc(c.numero)}" />` : ''}</td>
            <td><b>${esc(c.serie)}/${esc(c.numero)}</b></td><td>${esc(c.destinatario_nome || '')}</td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td><td class="n">${num(c.volumes)}</td>
            <td>${c.em_transferencia_id ? `<a href="#" data-fl-transf="${c.em_transferencia_id}">🔀 transf. ${c.em_transferencia_id}</a>` : `<b>${esc(sigla(c.unidade_atual_id))}</b>`}</td>
            <td>${esc(sigla(c.unidade_destino_id))}${transferir ? ` <span class="oc-sit ocorrencia">${c.transferencia_aberta ? `na transf. ${c.transferencia_aberta}` : 'a transferir'}</span>` : ''}</td>
            <td>${dia(c.previsao_entrega)}</td><td><small>${c.romaneio_id ? `🚚 romaneio ${c.romaneio_id}` : esc(SIT[c.situacao_entrega] || c.situacao_entrega || '')}</small></td>
            ${admin ? `<td><button class="btn btn-secundario" data-fl-acertar="${c.id}" style="width:auto; padding:3px 8px; font-size:12px;" title="Corrigir onde a mercadoria está ou quem entrega">acertar</button></td>` : ''}</tr>`;
          }).join('')}</tbody></table></div>` : '<div class="kanban-vazio">Nenhuma mercadoria aqui.</div>'}</div>`;
    $('flAbaEstoque').querySelectorAll('[data-fl-un]').forEach((d) => d.addEventListener('click', () => {
      const v = d.dataset.flUn; filtroUnidade = v === 'transito' ? 'transito' : Number(v); telaEstoque().catch(erro);
    }));
    $('flTodas')?.addEventListener('click', () => { filtroUnidade = null; telaEstoque().catch(erro); });
    $('flAbaEstoque').querySelectorAll('[data-fl-transf]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); abrirTransferencia(Number(a.dataset.flTransf)).catch(erro); }));
    $('flAbaEstoque').querySelectorAll('[data-fl-acertar]').forEach((b) => b.addEventListener('click', () => acertar(e.ctes.find((c) => c.id === Number(b.dataset.flAcertar)))));
    const marcadas = () => [...document.querySelectorAll('[data-fl-marca]:checked')];
    $('flAbaEstoque').addEventListener('change', () => $('flTransfMarcados').classList.toggle('oculto', !marcadas().length));
    $('flTransfMarcados').addEventListener('click', () => {
      const m = marcadas();
      const rotas = new Set(m.map((x) => `${x.dataset.origem}>${x.dataset.destino}`));
      if (rotas.size > 1) { mostrarAlerta('Marque CT-e da mesma origem para o mesmo destino (uma transferência por rota).', { tipo: 'aviso' }); return; }
      novaTransferencia({ origem: Number(m[0].dataset.origem), destino: Number(m[0].dataset.destino), ids: m.map((x) => Number(x.dataset.flMarca)) }).catch(erro);
    });
  }

  async function acertar(c) {
    const opcoes = (sel) => unidades.filter((u) => u.ativa).map((u) => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.sigla)} — ${esc(u.nome)}</option>`).join('');
    $('flModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">Acertar CT-e ${esc(c.serie)}/${esc(c.numero)}</h3><span style="cursor:pointer; font-size:18px;" data-fl-fechar>✕</span></div>
      <p class="edi-dica">Use quando a mercadoria chegou por outro caminho ou a unidade de entrega está errada. Fica registrado na auditoria.</p>
      <div class="oc-form">${c.em_transferencia_id ? '<p>Este CT-e está numa transferência: receba a transferência no destino.</p>' : `<div class="campo"><label for="flAcAtual">A mercadoria está em</label><select id="flAcAtual">${opcoes(c.unidade_atual_id)}</select></div>`}
        <div class="campo"><label for="flAcDest">Quem entrega</label><select id="flAcDest">${opcoes(c.unidade_destino_id)}</select></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fl-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="flAcSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('flAcSalvar').addEventListener('click', async () => {
      try {
        await json(`/api/unidades/ctes/${c.id}/local`, { method: 'POST', body: JSON.stringify({ ...($('flAcAtual') ? { unidade_atual_id: $('flAcAtual').value } : {}), unidade_destino_id: $('flAcDest').value }) });
        fecharModal(); telaEstoque().catch(erro);
      } catch (err) { erro(err); }
    });
  }

  // ---------------- Transferências ----------------
  async function telaTransferencias() {
    const lista = await json('/api/transferencias');
    $('flAbaTransferencias').innerHTML = `<div class="painel oc-painel">${lista.length ? `<table class="edi-tabela"><thead><tr><th>Nº</th><th>Rota</th><th>Motorista / placa</th><th class="n">CT-e</th><th>Saída</th><th>Chegada</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((t) => `<tr><td><b>${t.id}</b></td><td><b>${esc(t.origem_sigla)} → ${esc(t.destino_sigla)}</b></td><td>${esc(t.motorista_nome || '—')}${t.placa ? ` · ${esc(t.placa)}` : ''}</td>
        <td class="n">${t.ctes}</td><td>${quando(t.saiu_em)}</td><td>${quando(t.chegou_em)}</td>
        <td><span class="oc-sit ${STATUS_T[t.status][1]}">${STATUS_T[t.status][0]}</span>${t.resumo_chegada?.faltas?.length ? '<br><small style="color:#d97706;">chegou com faltas</small>' : ''}</td>
        <td><div class="oc-linha-acoes"><button class="primario" data-fl-abrir="${t.id}">Abrir</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhuma transferência ainda. Em "Onde está a mercadoria", marque os CT-e "a transferir" ou clique em "＋ Nova transferência".</div>'}</div>`;
    $('flAbaTransferencias').querySelectorAll('[data-fl-abrir]').forEach((b) => b.addEventListener('click', () => abrirTransferencia(Number(b.dataset.flAbrir)).catch(erro)));
  }

  async function novaTransferencia(pre = {}) {
    if (!unidades.length) unidades = await json('/api/unidades');
    const ativas = unidades.filter((u) => u.ativa);
    if (ativas.length < 2) { mostrarAlerta('Cadastre pelo menos duas unidades (a matriz e uma filial) em "⚙ Filiais" para transferir mercadoria entre elas.', { tipo: 'aviso' }); return; }
    const motoristas = await json('/api/mdfe/motoristas').catch(() => []);
    const op = (sel) => ativas.map((u) => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.sigla)} — ${esc(u.nome)}</option>`).join('');
    const origem0 = pre.origem || ativas.find((u) => u.matriz)?.id || ativas[0].id;
    const destino0 = pre.destino || ativas.find((u) => u.id !== origem0).id;
    $('flModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🔀 Nova transferência</h3><span style="cursor:pointer; font-size:18px;" data-fl-fechar>✕</span></div>
      <div class="cte-grade" style="margin-top:12px;">
        <div class="campo"><label for="flOrigem">De (origem)</label><select id="flOrigem">${op(origem0)}</select></div>
        <div class="campo"><label for="flDestino">Para (destino)</label><select id="flDestino">${op(destino0)}</select></div>
        <div class="campo"><label for="flMot">Motorista</label><input id="flMot" list="flMotLista" maxlength="120" /><datalist id="flMotLista">${(Array.isArray(motoristas) ? motoristas : []).filter((m) => m.ativo !== false).map((m) => `<option value="${esc(m.nome)}"></option>`).join('')}</datalist></div>
        <div class="campo"><label for="flPlaca">Placa</label><input id="flPlaca" maxlength="8" style="text-transform:uppercase;" /></div>
        <div class="campo"><label for="flLacre">Lacre</label><input id="flLacre" maxlength="60" /></div>
        <div class="campo largo"><label for="flObs">Observação</label><input id="flObs" maxlength="500" /></div>
      </div>
      <h4 style="margin:6px 0;">CT-e na origem <small id="flQtd" style="font-weight:400; color:var(--texto-fraco);"></small></h4>
      <div id="flDisp" class="edi-rolagem" style="max-height:320px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;"><button class="btn btn-secundario" data-fl-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="flCriar" style="width:auto;">Montar transferência</button></div>`;
    modal.classList.remove('oculto');
    const contar = () => { const m = [...document.querySelectorAll('[data-fl-disp]:checked')]; $('flQtd').textContent = `${m.length} marcado(s) · ${num(m.reduce((s, x) => s + Number(x.dataset.vol), 0))} volume(s)`; };
    const carregarDisp = async () => {
      const l = await json(`/api/transferencias/disponiveis?origem=${$('flOrigem').value}&destino=${$('flDestino').value}`);
      const ordem = l.sort((a, b) => Number(b.sugerido) - Number(a.sugerido));
      $('flDisp').innerHTML = ordem.length ? `<table class="edi-tabela"><thead><tr><th style="width:28px;"></th><th>CT-e</th><th>Destinatário</th><th>Cidade</th><th class="n">Vol.</th><th>Entrega por</th></tr></thead><tbody>
        ${ordem.map((c) => `<tr><td><input type="checkbox" data-fl-disp="${c.id}" data-vol="${c.volumes}" ${(pre.ids ? pre.ids.includes(c.id) : c.sugerido) ? 'checked' : ''} aria-label="Marcar CT-e ${esc(c.numero)}" /></td>
          <td>${esc(c.serie)}/${esc(c.numero)}</td><td>${esc(c.destinatario_nome || '')}</td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td><td class="n">${num(c.volumes)}</td>
          <td>${esc(sigla(c.unidade_destino_id))}${c.sugerido ? ' ✓' : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nenhum CT-e livre nesta unidade.</div>';
      contar();
    };
    $('flDisp').addEventListener('change', contar);
    ['flOrigem', 'flDestino'].forEach((id) => $(id).addEventListener('change', () => { pre = {}; carregarDisp().catch(erro); }));
    await carregarDisp();
    $('flCriar').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const r = await json('/api/transferencias', { method: 'POST', body: JSON.stringify({ origem_id: Number($('flOrigem').value), destino_id: Number($('flDestino').value),
          ctes: [...document.querySelectorAll('[data-fl-disp]:checked')].map((x) => Number(x.dataset.flDisp)), motorista_nome: $('flMot').value, placa: $('flPlaca').value, lacre: $('flLacre').value, observacao: $('flObs').value }) });
        await abrirTransferencia(r.id);
        carregar().catch(() => {});
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  async function abrirTransferencia(id) {
    const t = await json(`/api/transferencias/${id}`);
    const confCarga = t.conferencias.filter((c) => c.tipo === 'carga').pop(); const confCheg = t.conferencias.filter((c) => c.tipo === 'descarga').pop();
    const resumoConf = (c) => (!c ? 'não conferida' : c.status === 'aberta' ? 'conferência em andamento' : `${c.resumo.lido}/${c.resumo.esperado} vol.${c.resumo.faltam ? ` · faltaram ${c.resumo.faltam}` : ' ✓'}${(c.resumo.sobras || []).length ? ` · ${c.resumo.sobras.length} sobra(s)` : ''}`);
    const pendentes = t.itens.filter((i) => i.pendente);
    const tot = t.itens.reduce((s, i) => ({ vol: s.vol + i.volumes, peso: s.peso + i.peso }), { vol: 0, peso: 0 });
    const link = (url, texto) => `<a class="btn btn-secundario" href="${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">${texto}</a>`;
    $('flModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div><h3 style="margin:0;">🔀 Transferência ${t.id}: ${esc(t.origem_sigla)} → ${esc(t.destino_sigla)} <span class="oc-sit ${STATUS_T[t.status][1]}" style="vertical-align:middle;">${STATUS_T[t.status][0]}</span></h3>
        <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:4px;">${esc(t.motorista_nome || 'sem motorista')}${t.placa ? ` · ${esc(t.placa)}` : ''}${t.lacre ? ` · lacre ${esc(t.lacre)}` : ''} · ${t.itens.length} CT-e · ${num(tot.vol)} vol. · ${num(tot.peso)} kg
          · saída ${quando(t.saiu_em)} · chegada ${quando(t.chegou_em)}${t.recebido_por_nome ? ` por ${esc(t.recebido_por_nome)}` : ''}</div></div>
        <span style="cursor:pointer; font-size:18px;" data-fl-fechar>✕</span></div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; font-size:13px;">
        <div class="cte-aviso" style="margin:0;">🔎 Carregamento: ${resumoConf(confCarga)}</div>
        ${t.status !== 'aberta' ? `<div class="cte-aviso ${t.resumo_chegada?.faltas?.length ? 'erro' : ''}" style="margin:0;">📥 Chegada: ${t.status === 'recebida' && !t.resumo_chegada ? 'recebida sem bipagem' : resumoConf(confCheg)}</div>` : ''}
      </div>
      ${pendentes.length && t.status === 'recebida' ? `<div class="cte-aviso erro" style="margin-top:10px;">⚠ ${pendentes.length} CT-e não chegaram com esta transferência e continuam "em trânsito". Quando chegarem, use "chegou depois".</div>` : ''}
      <table class="edi-tabela" style="margin-top:12px;"><thead><tr><th>CT-e</th><th>NF</th><th>Destinatário</th><th>Cidade</th><th class="n">Vol.</th><th class="n">Peso</th><th></th></tr></thead><tbody>
        ${t.itens.map((i) => `<tr><td><b>${esc(i.serie)}/${esc(i.numero)}</b></td><td><small>${esc(i.nfs.join(', '))}</small></td><td>${esc(i.destinatario_nome || '')}</td><td>${esc(i.cidade_fim || '')}/${esc(i.uf_fim || '')}</td>
          <td class="n">${num(i.volumes)}</td><td class="n">${num(i.peso)}</td>
          <td>${i.pendente && t.status === 'recebida' ? `<button class="btn btn-secundario" data-fl-depois="${i.cte_id}" style="width:auto; padding:3px 8px; font-size:12px;">chegou depois</button>` : i.pendente && t.status === 'em_transito' ? '<small>no caminhão</small>' : ''}</td></tr>`).join('')}</tbody></table>
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:16px;">
        ${t.status === 'aberta' ? '<button class="btn btn-secundario" id="flExcluir" style="width:auto; color:var(--vermelho);">Excluir</button>' : ''}
        ${link(`/api/transferencias/${t.id}/imprimir`, '🖨 Manifesto')}
        ${link(`/api/etiquetas/imprimir?ctes=${t.itens.map((i) => i.cte_id).join(',')}`, '🏷 Etiquetas')}
        ${t.status === 'aberta' && window.nexoMdfe ? '<button class="btn btn-secundario" id="flMdfe" style="width:auto;">📋 Emitir MDF-e</button>' : ''}
        ${t.status === 'aberta' && window.nexoConferencia ? '<button class="btn btn-secundario" id="flConfCarga" style="width:auto;">🔎 Conferir carregamento</button>' : ''}
        ${t.status === 'aberta' ? '<button class="btn btn-primario" id="flSaida" style="width:auto;">▶ Dar saída</button>' : ''}
        ${t.status === 'em_transito' && window.nexoConferencia ? '<button class="btn btn-secundario" id="flConfCheg" style="width:auto;">🔎 Conferir chegada (bipar)</button>' : ''}
        ${t.status === 'em_transito' ? '<button class="btn btn-primario" id="flReceber" style="width:auto;">✓ Receber</button>' : ''}</div>`;
    modal.classList.remove('oculto');
    const depois = async () => { await abrirTransferencia(id); carregar().catch(() => {}); };
    $('flExcluir')?.addEventListener('click', async () => {
      if (!await confirmar('Excluir esta transferência? Os CT-e continuam na origem.', { tipo: 'perigo', textoOk: 'Excluir' })) return;
      try { await json(`/api/transferencias/${id}`, { method: 'DELETE' }); fecharModal(); carregar(); } catch (err) { erro(err); }
    });
    $('flMdfe')?.addEventListener('click', async () => { try { fecharModal(); await window.nexoMdfe.montarDosCtes({ cteIds: t.itens.map((i) => i.cte_id) }); } catch (err) { erro(err); } });
    $('flConfCarga')?.addEventListener('click', () => { fecharModal(); window.nexoConferencia.conferirTransferencia(id, 'carga').catch(erro); });
    $('flConfCheg')?.addEventListener('click', () => { fecharModal(); window.nexoConferencia.conferirTransferencia(id, 'descarga').catch(erro); });
    $('flSaida')?.addEventListener('click', async () => {
      const aviso = !confCarga ? ' A carga ainda não foi conferida.' : confCarga.status === 'aberta' ? ' A conferência da carga não foi concluída.' : confCarga.resumo.faltam ? ` A conferência apontou ${confCarga.resumo.faltam} volume(s) faltando.` : '';
      if (!await confirmar(`Dar saída na transferência ${id} (${t.itens.length} CT-e ficam "em transferência")?${aviso}`, { textoOk: 'Dar saída', tipo: aviso ? 'perigo' : undefined })) return;
      try { await json(`/api/transferencias/${id}/saida`, { method: 'POST' }); await depois(); } catch (err) { erro(err); }
    });
    $('flReceber')?.addEventListener('click', async () => {
      const usar = confCheg && confCheg.status === 'concluida' ? confCheg.id : null;
      if (confCheg && confCheg.status === 'aberta') { mostrarAlerta('A conferência da chegada está em andamento: conclua a conferência e registre a chegada por ela.', { tipo: 'aviso' }); return; }
      if (!usar && !await confirmar('Receber sem bipar? Todos os CT-e passam a estar na unidade de destino. (Para conferir volume a volume, use "Conferir chegada".)', { textoOk: 'Receber tudo' })) return;
      try {
        const r = await json(`/api/transferencias/${id}/receber`, { method: 'POST', body: JSON.stringify({ conferencia_id: usar }) });
        mostrarAlerta(`Chegada registrada: ${r.ctes} CT-e na unidade.${r.nao_chegaram ? ` ${r.nao_chegaram} não chegaram.` : ''}`, { tipo: r.nao_chegaram ? 'aviso' : 'sucesso' });
        await depois();
      } catch (err) { erro(err); }
    });
    $('flModalConteudo').querySelectorAll('[data-fl-depois]').forEach((b) => b.addEventListener('click', async () => {
      try { await json(`/api/transferencias/${id}/chegou-depois`, { method: 'POST', body: JSON.stringify({ cte_id: Number(b.dataset.flDepois) }) }); await depois(); } catch (err) { erro(err); }
    }));
  }

  // ---------------- Cadastro de unidades ----------------
  async function telaUnidades() {
    unidades = await json('/api/unidades');
    $('flAbaUnidades').innerHTML = `<div class="painel oc-painel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><p class="edi-dica" style="margin:0;">Cada unidade entrega as cidades da lista dela. O CT-e nasce na unidade que atende a cidade de início (ou na matriz) e mostra qual unidade vai entregar.</p>
        <button class="btn btn-primario" id="flNovaUn" style="width:auto;">＋ Nova filial</button></div>
      <table class="edi-tabela"><thead><tr><th>Sigla</th><th>Nome</th><th>Cidade</th><th>Cidades que entrega</th><th>Situação</th><th></th></tr></thead><tbody>
      ${unidades.map((u) => `<tr><td><b>${esc(u.sigla)}</b></td><td>${esc(u.nome)}${u.matriz ? ' <small>(matriz)</small>' : ''}</td><td>${esc(u.cidade || '')}/${esc(u.uf || '')}</td>
        <td><small>${esc(String(u.cidades || '').split(/[\n,;]+/).filter((x) => x.trim()).slice(0, 8).join(', '))}${String(u.cidades || '').split(/[\n,;]+/).filter((x) => x.trim()).length > 8 ? '…' : ''}</small></td>
        <td>${u.ativa ? 'Ativa' : 'Inativa'}</td><td><button class="btn btn-secundario" data-fl-editar="${u.id}" style="width:auto; padding:4px 10px; font-size:12px;">Editar</button></td></tr>`).join('')}</tbody></table></div>`;
    $('flNovaUn').addEventListener('click', () => formUnidade());
    $('flAbaUnidades').querySelectorAll('[data-fl-editar]').forEach((b) => b.addEventListener('click', () => formUnidade(unidades.find((u) => u.id === Number(b.dataset.flEditar)))));
  }
  function formUnidade(u = null) {
    const v = (k) => esc(u?.[k] ?? '');
    $('flModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">${u ? `Filial ${v('sigla')}` : 'Nova filial'}</h3><span style="cursor:pointer; font-size:18px;" data-fl-fechar>✕</span></div>
      <div class="cte-grade" style="margin-top:12px;">
        <div class="campo"><label for="flUnSigla">Sigla</label><input id="flUnSigla" maxlength="6" style="text-transform:uppercase;" placeholder="RJO" value="${v('sigla')}" /></div>
        <div class="campo largo"><label for="flUnNome">Nome</label><input id="flUnNome" maxlength="120" placeholder="Filial Rio de Janeiro" value="${v('nome')}" /></div>
        <div class="campo"><label for="flUnCidade">Cidade</label><input id="flUnCidade" maxlength="120" value="${v('cidade')}" /></div>
        <div class="campo"><label for="flUnUf">UF</label><input id="flUnUf" maxlength="2" style="text-transform:uppercase;" value="${v('uf')}" /></div>
        <div class="campo largo"><label for="flUnEnd">Endereço</label><input id="flUnEnd" maxlength="250" value="${v('endereco')}" /></div>
        <div class="campo"><label for="flUnFone">Telefone</label><input id="flUnFone" maxlength="30" value="${v('telefone')}" /></div>
        <div class="campo"><label for="flUnResp">Responsável</label><input id="flUnResp" maxlength="120" value="${v('responsavel')}" /></div>
        <div class="campo inteiro"><label for="flUnCidades">Cidades que esta filial entrega (uma por linha, ex.: Niterói/RJ)</label><textarea id="flUnCidades" rows="6">${v('cidades')}</textarea></div>
        ${u?.matriz ? '' : `<div class="campo"><label class="ag-check" style="display:flex;"><input type="checkbox" id="flUnAtiva" ${!u || u.ativa ? 'checked' : ''} /> Ativa</label></div>`}
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fl-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="flUnSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('flUnSalvar').addEventListener('click', async () => {
      try {
        const corpo = { sigla: $('flUnSigla').value, nome: $('flUnNome').value, cidade: $('flUnCidade').value, uf: $('flUnUf').value, endereco: $('flUnEnd').value,
          telefone: $('flUnFone').value, responsavel: $('flUnResp').value, cidades: $('flUnCidades').value, ativa: $('flUnAtiva') ? $('flUnAtiva').checked : true };
        const r = u ? await json(`/api/unidades/${u.id}`, { method: 'PUT', body: JSON.stringify(corpo) }) : await json('/api/unidades', { method: 'POST', body: JSON.stringify(corpo) });
        fecharModal(); await telaUnidades();
        mostrarAlerta(`Filial ${r.sigla} salva.${r.ctes_recalculados ? ` ${r.ctes_recalculados} CT-e em andamento mudaram a unidade que entrega.` : ''}`, { tipo: 'sucesso' });
      } catch (err) { erro(err); }
    });
  }
})();
