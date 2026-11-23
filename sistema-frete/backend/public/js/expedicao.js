// =====================================================================
// Painel de expedição (Pátio e portaria » Expedição, tela 425; regras em src/expedicao.js): as notas a expedir e as
// expedidas hoje, por etapa (sem ordem de coleta, ordem enviada, confirmada, atrasada, no pátio, expedida) e por
// transportadora, com os alertas. Atualiza sozinho (o js/patio.js chama window.Expedicao.desenhar() a cada 20 s).
// Clicar numa etapa ou numa transportadora filtra as notas; "Pedir coleta" abre a ordem de coleta já com as notas.
// Usa do dashboard.js: apiFetch, mostrarAlerta.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v, c = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const moeda = (v) => `R$ ${num(v, 2)}`;
  const hora = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  const diaHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  // Cor de cada etapa (mesmas classes de situação das outras telas).
  const COR = { 'Sem ordem de coleta': 'ocorrencia', 'Ordem em rascunho': '', 'Ordem enviada': 'pendente', 'Sem resposta': 'ocorrencia', 'Coleta confirmada': 'em_transito',
    'Coleta atrasada': 'cancelado', 'No pátio': 'em_transito', 'Expedida hoje': 'entregue' };
  let cont = null; let dados = null; let filtro = { etapa: '', transportadora: '' }; let fob = false;

  async function desenhar(alvo) {
    cont = alvo || cont;
    const r = await apiFetch(`/api/ordens-coleta/expedicao${fob ? '?fob=1' : ''}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível montar o painel de expedição.');
    dados = j; render();
  }

  function render() {
    const d = dados; const i = d.indicadores;
    const card = (rot, v, extra = '', etapa = null, alerta = false) => `<div${etapa != null ? ` data-ex-etapa="${esc(etapa)}" style="cursor:pointer;${filtro.etapa && filtro.etapa === etapa ? ' outline:2px solid var(--azul);' : ''}"` : ''}${alerta ? ' class="ex-alerta"' : ''}>${esc(rot)}<b>${v}</b><span>${extra || '&nbsp;'}</span></div>`;
    const notas = d.notas.filter((n) => (!filtro.etapa || n.etapa === filtro.etapa) && (!filtro.transportadora || n.transportadora === filtro.transportadora));
    // Colunas por transportadora ("Aguardando" junta ordem enviada e sem resposta; o rascunho conta como sem ordem enviada).
    const COLS = [['Sem ordem', ['Sem ordem de coleta', 'Ordem em rascunho'], 'Sem ordem de coleta'], ['Aguardando', ['Ordem enviada', 'Sem resposta'], 'Sem resposta'],
      ['Confirmada', ['Coleta confirmada'], 'Coleta confirmada'], ['Atrasada', ['Coleta atrasada'], 'Coleta atrasada'], ['No pátio', ['No pátio'], 'No pátio'], ['Expedida hoje', ['Expedida hoje'], 'Expedida hoje']];
    cont.innerHTML = `
      <div class="pa-topo"><span>Atualizado às ${hora(d.agora)} · atualiza sozinho a cada 20 s · notas dos últimos 45 dias ainda não expedidas e as expedidas hoje</span>
        <span style="flex:1;"></span><label style="font-size:13px; display:flex; gap:6px; align-items:center;"><input type="checkbox" id="exFob"${fob ? ' checked' : ''}> incluir FOB</label>
        <button class="btn btn-secundario" style="width:auto;" id="exTelaCheia">📺 Tela cheia</button><button class="btn btn-secundario" style="width:auto;" id="exAtualizar">⟳ Atualizar</button></div>
      <div class="nf-resumo">
        ${card('A expedir', num(i.a_expedir), `${num(i.volumes)} vol. · ${num(i.peso, 1)} kg · ${moeda(i.valor)}`, '')}
        ${card('Sem ordem de coleta', num(i.sem_ordem), i.paradas ? `${i.paradas} parada(s) há mais de ${d.dias_parada} dias` : '', 'Sem ordem de coleta', i.paradas > 0)}
        ${card('Aguardando a transportadora', num(i.aguardando), i.sem_resposta ? `${i.sem_resposta} sem resposta` : '', 'Ordem enviada', i.sem_resposta > 0)}
        ${card('Coleta confirmada', num(i.confirmadas), '', 'Coleta confirmada')}
        ${card('Coleta atrasada', num(i.atrasadas), '', 'Coleta atrasada', i.atrasadas > 0)}
        ${card('No pátio / na doca', num(i.no_patio), '', 'No pátio')}
        ${card('Expedidas hoje', num(i.expedidas_hoje), `${num(i.expedidas_volumes)} vol. · ${num(i.expedidas_peso, 1)} kg · ${moeda(i.expedidas_valor)}`, 'Expedida hoje')}
      </div>
      <div style="display:flex; flex-direction:column; gap:12px; margin:12px 0;">
        <div class="painel"><h4>Por transportadora</h4>${d.transportadoras.length ? `<div style="overflow-x:auto;"><table class="re-tab"><thead><tr><th>Transportadora</th>${COLS.map(([rot]) => `<th style="text-align:right;">${esc(rot)}</th>`).join('')}<th>Mais antiga</th><th>Próxima coleta</th><th></th></tr></thead><tbody>
          ${d.transportadoras.map((t) => `<tr${filtro.transportadora === t.transportadora ? ' style="background:color-mix(in srgb, var(--azul) 8%, transparent);"' : ''}>
            <td><a href="#" data-ex-transp="${esc(t.transportadora)}"><b>${esc(t.transportadora)}</b></a><br><small style="color:var(--texto-fraco);">${t.notas} a expedir · ${num(t.volumes)} vol. · ${num(t.peso, 1)} kg</small></td>
            ${COLS.map(([, etapas, cor]) => { const v = etapas.reduce((x, e) => x + (t.etapas[e] || 0), 0); return `<td style="text-align:right;">${v ? `<span class="oc-sit ${COR[cor] || ''}">${v}</span>` : '<span style="color:var(--texto-fraco);">·</span>'}</td>`; }).join('')}
            <td>${t.mais_antiga ? `${dia(t.mais_antiga)}<br><small style="color:var(--texto-fraco);">há ${t.dias_mais_antiga} dia(s)</small>` : '—'}</td>
            <td>${t.proxima_coleta ? diaHora(t.proxima_coleta) : '—'}</td>
            <td style="white-space:nowrap;">${t.etapas['Sem ordem de coleta'] && window.OrdensColeta ? `<button class="btn btn-primario pa-mini" data-ex-pedir="${esc(t.transportadora)}">Pedir coleta</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="kanban-vazio">Nenhuma nota a expedir.</div>'}</div>
        <div class="painel"><h4>Alertas (${d.alertas.length})</h4>${d.alertas.length ? `<table class="re-tab"><tbody>${d.alertas.map((a) => `<tr>
            <td><span class="oc-sit ${a.tipo === 'atrasada' ? 'cancelado' : 'ocorrencia'}">${{ parada: 'Parada', sem_resposta: 'Sem resposta', atrasada: 'Atrasada' }[a.tipo]}</span></td>
            <td>${esc(a.texto)}<br><small style="color:var(--texto-fraco);">${esc(a.transportadora)}</small></td>
            <td style="white-space:nowrap;">${a.ordem_id ? `<button class="btn btn-secundario pa-mini" data-ex-ordem="${a.ordem_id}">Abrir ordem</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nada atrasado. 👍</div>'}</div>
      </div>
      <div class="painel"><div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;"><h4 style="margin:0;">Notas (${notas.length})</h4>
          ${filtro.etapa || filtro.transportadora ? `<span style="font-size:13px;">Filtro: <b>${esc([filtro.etapa, filtro.transportadora].filter(Boolean).join(' · '))}</b> <a href="#" id="exLimpar">limpar</a></span>` : '<span style="font-size:13px; color:var(--texto-fraco);">Clique numa etapa ou numa transportadora para filtrar.</span>'}
          <span style="flex:1;"></span>${notas.some((n) => n.etapa === 'Sem ordem de coleta') && window.OrdensColeta ? `<button class="btn btn-primario" style="width:auto;" id="exPedirFiltro">Pedir coleta destas notas</button>` : ''}</div>
        <div style="overflow-x:auto; margin-top:8px;"><table class="re-tab"><thead><tr><th>NF-e</th><th>Emissão</th><th>Cliente</th><th>Destino</th><th>Transportadora</th><th style="text-align:right;">Vol.</th><th style="text-align:right;">Peso</th><th style="text-align:right;">Valor</th><th>Etapa</th><th>Ordem / veículo</th></tr></thead><tbody>
        ${notas.slice(0, 500).map((n) => `<tr><td><b>${esc(n.numero)}</b>${n.fob ? ' <small>(FOB)</small>' : ''}</td><td>${dia(n.emissao)}${n.dias > d.dias_parada && n.etapa === 'Sem ordem de coleta' ? ` <small class="pa-alerta">${n.dias} d</small>` : ''}</td>
          <td>${esc(n.cliente)}</td><td>${esc(n.destino)}</td><td>${esc(n.transportadora)}</td><td style="text-align:right;">${num(n.volumes)}</td><td style="text-align:right;">${num(n.peso, 1)}</td><td style="text-align:right;">${num(n.valor, 2)}</td>
          <td><span class="oc-sit ${COR[n.etapa] || ''}">${esc(n.etapa)}</span></td>
          <td>${n.ordem ? `<a href="#" data-ex-ordem="${n.ordem.id}">Ordem ${n.ordem.id}</a>${n.ordem.placa ? ` · ${esc(n.ordem.placa)}` : ''}${n.ordem.previsto_em ? `<br><small>chega ${diaHora(n.ordem.previsto_em)}</small>` : ''}` : n.etapa === 'Expedida hoje' ? `${n.saida_em ? `saiu ${hora(n.saida_em)}` : ''}${n.numero_cte ? ` CT-e ${esc(n.numero_cte)}` : ''}` : '—'}</td></tr>`).join('') || '<tr><td colspan="10" style="text-align:center; padding:16px; color:var(--texto-fraco);">Nenhuma nota aqui.</td></tr>'}
        </tbody></table>${notas.length > 500 ? '<p style="font-size:12px; color:var(--texto-fraco);">Mostrando as 500 primeiras.</p>' : ''}</div></div>`;
    cont.querySelectorAll('[data-ex-etapa]').forEach((c) => c.addEventListener('click', () => { const e = c.dataset.exEtapa; filtro.etapa = filtro.etapa === e ? '' : e; render(); }));
    cont.querySelectorAll('[data-ex-transp]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); const t = a.dataset.exTransp; filtro.transportadora = filtro.transportadora === t ? '' : t; render(); }));
    $('exLimpar')?.addEventListener('click', (ev) => { ev.preventDefault(); filtro = { etapa: '', transportadora: '' }; render(); });
    $('exAtualizar').addEventListener('click', () => desenhar().catch(erro));
    $('exFob').addEventListener('change', (ev) => { fob = ev.target.checked; desenhar().catch(erro); });
    $('exTelaCheia').addEventListener('click', () => { const el = $('pagina-patio'); (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.())?.catch?.(() => {}); });
    const depois = () => desenhar();
    const pedir = (transportadora, lista) => window.OrdensColeta?.nova('coleta', { transportadora, ids: lista.map((n) => n.id), depois });
    cont.querySelectorAll('[data-ex-pedir]').forEach((b) => b.addEventListener('click', () => {
      const t = b.dataset.exPedir; pedir(t === '(sem transportadora)' ? '' : t, d.notas.filter((n) => n.transportadora === t && n.etapa === 'Sem ordem de coleta' && !n.fob));
    }));
    $('exPedirFiltro')?.addEventListener('click', () => {
      const ls = notas.filter((n) => n.etapa === 'Sem ordem de coleta');
      const ts = [...new Set(ls.map((n) => n.transportadora))];
      pedir(ts.length === 1 && ts[0] !== '(sem transportadora)' ? ts[0] : '', ls);
    });
    cont.querySelectorAll('[data-ex-ordem]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); window.OrdensColeta?.abrir(Number(a.dataset.exOrdem), depois); }));
  }

  window.Expedicao = { desenhar: (alvo) => desenhar(alvo) };
})();
