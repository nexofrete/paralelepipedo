// =====================================================================
// Kanban gerencial (Pátio e portaria » Kanban, tela 426) e tela da doca para tablet (Pátio e portaria » Minha doca, 427).
//  - Kanban, dois quadros: "Veículos" (agendado → aguardando doca → chamado → na doca → liberado → saiu hoje; regras em
//    src/patio.js, kanban()) e "Notas" (as etapas do painel de expedição, src/expedicao.js). Cada coluna tem a contagem,
//    os alertas e o tempo médio na etapa; cada cartão, o tempo na etapa, o alerta e o botão do próximo passo.
//  - Minha doca: o conferente escolhe a doca (o navegador lembra) e vê só o caminhão da doca e o próximo, com botões grandes.
// Os botões usam os mesmos data-* do js/patio.js (data-checkin, data-chamar, data-iniciar, data-finalizar, data-saida),
// tratados lá; depois de cada ação o patio.js redesenha a aba aberta.
// Usa do dashboard.js: apiFetch, mostrarAlerta.
// =====================================================================
(() => {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v, c = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const hora = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  const minTxt = (m) => (m == null ? '—' : Math.abs(m) < 60 ? `${Math.abs(m)} min` : `${Math.floor(Math.abs(m) / 60)} h ${String(Math.abs(m) % 60).padStart(2, '0')}`);
  const dias = (iso) => (iso ? Math.round((Date.now() - new Date(`${String(iso).slice(0, 10)}T12:00:00`).getTime()) / 86400000) : null);
  const ler = (k, padrao) => { try { return localStorage.getItem(k) || padrao; } catch { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  const buscar = async (url) => { const r = await apiFetch(url); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Não foi possível carregar.'); return j; };
  const COR = { agendado: '#64748b', aguardando: '#d97706', chamado: '#7c3aed', em_doca: '#2563eb', liberado: '#0891b2', saiu: '#16a34a',
    'Sem ordem de coleta': '#d97706', Aguardando: '#64748b', 'Coleta confirmada': '#2563eb', 'Coleta atrasada': '#dc2626', 'No pátio': '#7c3aed', 'Expedida hoje': '#16a34a' };
  const OP = { carga: 'Carregamento', descarga: 'Descarga', outro: 'Outro' };

  // ---------- Kanban ----------
  let modo = ler('patioKanbanModo', 'veiculos');
  const coluna = (chave, titulo, itens, extra, cartoes) => `<div class="kanban-coluna" style="--cor-coluna:${COR[chave] || '#94a3b8'}; min-width:180px; padding:10px;">
      <div class="kanban-coluna-cabecalho"><div><div class="kanban-coluna-titulo">${esc(titulo)}</div><div class="kanban-coluna-total">${extra}</div></div><span class="kanban-coluna-contagem">${itens}</span></div>
      <div class="kanban-cartoes">${cartoes || '<div style="color:var(--texto-fraco); font-size:12px; text-align:center; padding:10px;">—</div>'}</div></div>`;

  function cartaoVeiculo(k) {
    const prox = { agendado: `<button class="btn btn-primario pa-mini" data-checkin="${k.id}">Chegou</button>`, aguardando: `<button class="btn btn-primario pa-mini" data-chamar="${k.id}">Chamar</button>`,
      chamado: `<button class="btn btn-primario pa-mini" data-iniciar="${k.id}">Encostou</button>`, em_doca: `<button class="btn btn-primario pa-mini" data-finalizar="${k.id}">Terminou</button>`,
      liberado: `<button class="btn btn-primario pa-mini" data-saida="${k.id}">Saída</button>` }[k.status] || '';
    const tempo = k.status === 'agendado' ? (k.minutos < 0 ? `chega às ${hora(k.previsto_em)}` : `${hora(k.previsto_em)} · ${minTxt(k.minutos)} de atraso`)
      : k.status === 'saiu' ? `saiu ${hora(k.saida_em)} · ${minTxt(k.minutos)} no pátio` : `há ${minTxt(k.minutos)}`;
    return `<div class="kanban-cartao${k.alerta ? ' kanban-liberado-alerta' : ''}">
      <div class="kanban-cartao-topo"><span class="kanban-cartao-id">${esc(k.placa || k.codigo)}</span><small>${esc(OP[k.operacao] || '')}</small></div>
      <div class="kanban-cartao-transp">${esc(k.transportadora || k.fornecedor || 'sem transportadora')}${k.motorista ? ` · ${esc(k.motorista)}` : ''}</div>
      <div style="font-size:12px;">${esc(tempo)}${k.doca ? ` · <b>${esc(k.doca)}</b>` : ''}${k.notas.length ? `<br><small style="color:var(--texto-fraco);">NF ${esc(k.notas.slice(0, 4).join(', '))}${k.notas.length > 4 ? '…' : ''}</small>` : ''}</div>
      ${k.alerta ? `<div class="pa-alerta" style="margin-top:6px; display:inline-block;">${esc(k.alerta)}</div>` : ''}
      <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:8px;">${prox}<button class="btn btn-secundario pa-mini" data-abrir="${k.id}">…</button></div></div>`;
  }
  function cartaoNota(n) {
    const d = dias(n.emissao);
    return `<div class="kanban-cartao">
      <div class="kanban-cartao-topo"><span class="kanban-cartao-id">NF ${esc(n.numero)}</span><small>${d != null ? `${d} d` : ''}</small></div>
      <div class="kanban-cartao-transp">${esc(n.cliente)} · ${esc(n.destino)}</div>
      <div style="font-size:12px;">${esc(n.transportadora)}<br><small style="color:var(--texto-fraco);">${num(n.volumes)} vol. · ${num(n.peso, 1)} kg${n.ordem ? ` · ordem ${n.ordem.id}${n.ordem.placa ? ` (${esc(n.ordem.placa)})` : ''}` : ''}</small></div></div>`;
  }

  async function desenharKanban(cont) {
    let corpo = '';
    if (modo === 'veiculos') {
      const k = await buscar('/api/patio/kanban');
      corpo = k.colunas.map((c) => coluna(c.chave, c.titulo, c.total,
        [c.media_min != null ? `média ${minTxt(c.media_min)}` : '', c.alertas ? `<span style="color:var(--vermelho); font-weight:700;">${c.alertas} com alerta</span>` : ''].filter(Boolean).join(' · ') || '&nbsp;',
        c.cartoes.map(cartaoVeiculo).join(''))).join('');
    } else {
      const e = await buscar('/api/ordens-coleta/expedicao');
      const COLS = [['Sem ordem de coleta', ['Sem ordem de coleta', 'Ordem em rascunho']], ['Aguardando', ['Ordem enviada', 'Sem resposta']], ['Coleta confirmada', ['Coleta confirmada']],
        ['Coleta atrasada', ['Coleta atrasada']], ['No pátio', ['No pátio']], ['Expedida hoje', ['Expedida hoje']]];
      corpo = COLS.map(([t, etapas]) => {
        const ns = e.notas.filter((n) => etapas.includes(n.etapa));
        const ds = ns.map((n) => dias(n.emissao)).filter((x) => x != null);
        const vol = ns.reduce((s, n) => s + (Number(n.volumes) || 0), 0);
        return coluna(t, t === 'Aguardando' ? 'Aguardando a transportadora' : t, ns.length,
          `${num(vol)} vol.${ds.length && t !== 'Expedida hoje' ? ` · idade média ${Math.round(ds.reduce((a, b) => a + b, 0) / ds.length)} d` : ''}`,
          ns.slice(0, 80).map(cartaoNota).join('') + (ns.length > 80 ? `<div style="font-size:12px; color:var(--texto-fraco); text-align:center;">+ ${ns.length - 80} nota(s)</div>` : ''));
      }).join('');
    }
    cont.innerHTML = `<div class="pa-topo"><div style="display:flex; gap:6px;">
        <button class="btn ${modo === 'veiculos' ? 'btn-primario' : 'btn-secundario'}" style="width:auto;" data-kb-modo="veiculos">Veículos (pátio)</button>
        <button class="btn ${modo === 'notas' ? 'btn-primario' : 'btn-secundario'}" style="width:auto;" data-kb-modo="notas">Notas (expedição)</button></div>
        <span style="flex:1;"></span><span>Atualizado às ${hora(new Date())} · atualiza sozinho a cada 20 s</span>
        <button class="btn btn-secundario" style="width:auto;" data-kb-cheia>📺 Tela cheia</button></div>
      <div class="kanban-auditoria" style="grid-template-columns:repeat(6, minmax(180px, 1fr)); gap:10px; margin-top:12px;">${corpo}</div>`;
    cont.querySelectorAll('[data-kb-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.kbModo; gravar('patioKanbanModo', modo); desenharKanban(cont).catch((err) => mostrarAlerta(err.message, { tipo: 'erro' })); }));
    cont.querySelector('[data-kb-cheia]').addEventListener('click', () => { const el = document.getElementById('pagina-patio'); (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.())?.catch?.(() => {}); });
  }

  // ---------- Minha doca (tablet) ----------
  async function desenharDoca(cont) {
    const p = await buscar('/api/patio/painel');
    let id = Number(ler('patioMinhaDoca', '0'));
    if (!p.docas.some((d) => d.id === id)) id = p.docas[0]?.id || 0;
    const d = p.docas.find((x) => x.id === id);
    const fila = p.fila.filter((f) => f.previsao?.doca_id === id);
    const grande = 'style="width:100%; font-size:22px; padding:18px; border-radius:12px; margin-top:10px;"';
    const v = d?.visita;
    let atual = '';
    if (!d) atual = '<div class="kanban-vazio">Cadastre as docas na aba Docas e regras.</div>';
    else if (v) {
      atual = `<div style="font-size:15px; color:var(--texto-fraco);">${d.estado === 'chamado' ? `Chamado às ${hora(v.chamado_em)}, a caminho da doca` : `Na doca há ${minTxt(d.minutos_em_doca)} · fim previsto ${hora(d.fim_previsto)}`}</div>
        <div style="font-size:44px; font-weight:800; letter-spacing:1px; margin:6px 0;">${esc(v.placa || v.codigo)}</div>
        <div style="font-size:18px;">${esc(OP[v.operacao] || '')} · ${esc(v.transportadora || v.fornecedor || '')}${v.motorista_nome ? ` · ${esc(v.motorista_nome)}` : ''}</div>
        <div style="font-size:16px; margin-top:6px;">${(v.notas || []).length ? `NF ${esc(v.notas.join(', '))}` : 'Sem notas informadas'}${v.volumes ? ` · ${num(v.volumes)} volume(s)` : ''}${v.peso_kg ? ` · ${num(v.peso_kg, 1)} kg` : ''}</div>
        ${d.atrasada ? '<div class="pa-alerta" style="margin-top:8px; display:inline-block; font-size:15px;">Passou do tempo previsto</div>' : ''}
        ${d.estado === 'chamado' ? `<button class="btn btn-primario" ${grande} data-iniciar="${v.id}">▶ Encostou, iniciar a operação</button><button class="btn btn-secundario" ${grande} data-voltar="${v.id}">↩ Não veio, voltar à fila</button>`
          : `<button class="btn btn-primario" ${grande} data-finalizar="${v.id}">✔ Terminou a operação</button>`}`;
    } else {
      atual = `<div style="font-size:38px; font-weight:800; color:var(--verde); margin:10px 0;">Livre</div>
        ${d.proximo ? `<div style="font-size:18px;">Próximo da fila: <b>${esc(d.proximo.placa || d.proximo.codigo)}</b></div><button class="btn btn-primario" ${grande} data-chamar="${d.proximo.id}" data-doca="${d.id}">📣 Chamar o próximo</button>`
          : '<div style="font-size:16px; color:var(--texto-fraco);">Ninguém na fila para esta doca.</div>'}`;
    }
    cont.innerHTML = `<div class="pa-topo"><label style="display:flex; gap:8px; align-items:center; font-size:15px;">Minha doca
        <select id="mdDoca" class="cte-entrada" style="font-size:16px; padding:8px;">${p.docas.map((x) => `<option value="${x.id}"${x.id === id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
        <span style="flex:1;"></span><span>Atualizado às ${hora(p.agora)} · atualiza sozinho</span>
        <button class="btn btn-secundario" style="width:auto;" data-kb-cheia>📺 Tela cheia</button></div>
      <div style="display:grid; grid-template-columns:minmax(0, 2fr) minmax(0, 1fr); gap:14px; margin-top:12px;">
        <div class="painel" style="padding:22px; text-align:center;">${d ? `<div style="font-size:14px; text-transform:uppercase; letter-spacing:1px; color:var(--texto-fraco);">${esc(d.nome)}</div>` : ''}${atual}</div>
        <div class="painel"><h4 style="margin-top:0;">Fila para esta doca (${fila.length})</h4>${fila.length ? fila.map((f) => `<div style="padding:10px 0; border-bottom:1px solid var(--borda);">
            <b style="font-size:18px;">${esc(f.placa || f.codigo)}</b> <small>${esc(OP[f.operacao] || '')}</small><br>
            <small>${esc(f.transportadora || f.fornecedor || '')} · esperando há ${minTxt(f.espera_ate_agora)}${f.previsao?.inicio ? ` · entra às ${hora(f.previsao.inicio)}` : ''}</small></div>`).join('')
            : '<div style="color:var(--texto-fraco);">Vazia.</div>'}</div></div>`;
    cont.querySelector('#mdDoca').addEventListener('change', (e) => { gravar('patioMinhaDoca', e.target.value); desenharDoca(cont).catch((err) => mostrarAlerta(err.message, { tipo: 'erro' })); });
    cont.querySelector('[data-kb-cheia]').addEventListener('click', () => { const el = document.getElementById('pagina-patio'); (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.())?.catch?.(() => {}); });
  }

  window.PatioKanban = { desenhar: desenharKanban, doca: desenharDoca };
})();
