// =====================================================================
// Pedidos (405) e Pré-notas fiscais (406), fretes contratados (regras em src/pedidos.js): os pedidos da planilha do
// ERP com a situação até a entrega, e as pré-notas (o pedido antes da NF-e) esperando faturamento ou já faturadas.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta; abre a nota com window.abrirNotaDetalhe (js/notasFiscais.js);
// window.exportarExcel (js/indicadores.js). Os campos do WMS vêm de pedidos_wms (planilha do WMS; src/pedidosWms.js).
// =====================================================================
(() => {
  const nav = document.getElementById('navPedidos');
  const cont = document.getElementById('pdConteudo');
  if (!nav || !cont) return;
  nav.classList.remove('oculto');
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v, c = 0) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const moeda = (v) => (v == null ? '—' : `R$ ${num(v, 2)}`);
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (c) => { const r = await apiFetch(`/api/pedidos${c}`); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro ao carregar.'); return j; };
  const COR = { 'Aguardando nota': 'pendente', Integrado: 'integrado', 'Em separação': 'ocorrencia', 'Em conferência': 'ocorrencia', Separado: 'em_transito', Faturado: 'em_transito', 'Em embarque': 'em_transito', 'Coleta pedida': 'em_transito', 'Coletado / em trânsito': 'em_transito', Entregue: 'entregue', Cancelado: 'cancelado',
    'A faturar': 'pendente', 'Parada sem faturar': 'ocorrencia', 'NF sem XML': 'ocorrencia', 'Faturada, confere': 'entregue', 'Faturada, mudou': 'cancelado', 'Cancelada no ERP': 'cancelado' };
  const sit = (s) => `<span class="oc-sit ${COR[s] || ''}">${esc(s)}</span>`;
  let aba = 'pedidos'; const estado = { pedidos: { situacao: '', busca: '', de: '', ate: '' }, prenotas: { situacao: '', busca: '' } };

  document.querySelectorAll('[data-pd-aba]').forEach((a) => a.addEventListener('click', () => { aba = a.dataset.pdAba; document.querySelectorAll('[data-pd-aba]').forEach((x) => x.classList.toggle('ativo', x === a)); carregar().catch(erro); }));
  nav.addEventListener('click', () => carregar().catch(erro));
  // Buscador do topo (mesmo modelo da Visão geral): filtra a aba aberta enquanto digita; Esc limpa.
  const buscaTopo = $('pdBuscaTopo');
  if (buscaTopo) {
    let t = null;
    const aplicar = () => { clearTimeout(t); t = setTimeout(() => { estado[aba].busca = buscaTopo.value.trim(); carregar().catch(erro); }, 350); };
    buscaTopo.addEventListener('input', aplicar);
    buscaTopo.addEventListener('keydown', (e) => { if (e.key === 'Escape' && buscaTopo.value) { buscaTopo.value = ''; aplicar(); } if (e.key === 'Enter') { clearTimeout(t); estado[aba].busca = buscaTopo.value.trim(); carregar().catch(erro); } });
    document.querySelectorAll('[data-pd-aba]').forEach((a) => a.addEventListener('click', () => { buscaTopo.value = estado[a.dataset.pdAba]?.busca || ''; }));
  }
  const carregar = () => (aba === 'prenotas' ? desenharPrenotas() : desenharPedidos());
  const chips = (d, st) => `<div class="pd-chips"><button class="pd-chip${!st.situacao ? ' ativo' : ''}" data-pd-sit="">Todos</button>
    ${d.situacoes.filter((s) => d.contagem[s] || s === st.situacao).map((s) => `<button class="pd-chip${s === st.situacao ? ' ativo' : ''}" data-pd-sit="${esc(s)}">${esc(s)} <b>${d.contagem[s]}</b></button>`).join('')}</div>`;
  const ligar = (st, recarregar) => {
    cont.querySelectorAll('[data-pd-sit]').forEach((b) => b.addEventListener('click', () => { st.situacao = b.dataset.pdSit; recarregar().catch(erro); }));
    cont.querySelectorAll('[data-pd-nota]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); window.abrirNotaDetalhe?.(Number(a.dataset.pdNota)); }));
  };

  // Data e hora "AAAA-MM-DD HH:MM" → "dd/mm/aa hh:mm".
  const dh = (v) => (v ? `${dia(v)} ${String(v).slice(11, 16)}`.trim() : '—');
  const duracao = (min) => (min == null || min < 0 ? '' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
  const fraco = (t) => `<br><small style="color:var(--texto-fraco);">${t}</small>`;
  const podeImportar = () => !!(usuario?.perfil === 'admin' || usuario?.pode_editar_registros);
  const cnpjF = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(v || ''); };
  let ultimaLista = [];

  // A tabela rola dentro da tela: a altura vai até o pé da janela, então as barras de rolagem (a de lado também)
  // ficam sempre à vista, sem ir até o fim da lista.
  function ajustarRolagem() {
    const el = cont.querySelector('.nf-rolagem'); if (!el || !el.offsetParent) return;
    el.style.maxHeight = `${Math.max(260, window.innerHeight - el.getBoundingClientRect().top - 18)}px`;
  }
  window.addEventListener('resize', () => ajustarRolagem());

  // Visão da tabela: "planilha" (cada campo numa coluna, na ordem da planilha de pedidos) ou "resumida" (agrupada).
  let visao = (() => { try { return localStorage.getItem('nexofretePedidosVisao') || 'planilha'; } catch (e) { return 'planilha'; } })();
  const nw = (t) => `<td style="white-space:nowrap;">${t}</td>`;
  // Observação do pedido; ✏ edita (quem edita registros).
  const obsCel = (p) => `${p.obs ? `<span title="${esc(`${p.obs_por || ''}${p.obs_em ? ` em ${dh(p.obs_em)}` : ''}`)}">${esc(p.obs)}</span>` : '<span style="color:var(--texto-fraco);">—</span>'}`
    + (podeImportar() ? ` <a href="#" data-pd-obs="${esc(p.pedido)}" data-valor="${esc(p.obs || '')}" title="Editar a observação" style="text-decoration:none;">✏</a>` : '');
  // Liberação comercial (do e-mail em PDF ou digitada); ✏ edita (quem edita registros).
  const libCom = (p) => `${p.lib_comercial ? `<span title="${esc(p.lib_comercial_origem === 'manual' ? `Digitada por ${p.lib_comercial_de || '?'}` : `Do e-mail de ${p.lib_comercial_de || '?'}`)}">${dh(p.lib_comercial)}${p.lib_comercial_origem === 'manual' ? ' <small>(manual)</small>' : ''}</span>` : '—'}`
    + (podeImportar() ? ` <a href="#" data-pd-libcom="${esc(p.pedido)}" data-valor="${esc(p.lib_comercial || '')}" title="Editar a liberação comercial" style="text-decoration:none;">✏</a>` : '');
  // Pedido sem dados do WMS: "🔎 buscar" consulta só ele, na hora.
  const buscarWms = (p) => (!p.tem_wms && podeImportar() && /^\d+$/.test(String(p.pedido || ''))
    ? ` <a href="#" data-pd-wmsbuscar="${esc(p.pedido)}" style="font-size:11.5px; white-space:nowrap;" title="Procura este pedido no WMS agora">🔎 buscar</a>` : '');
  function tabelaPedidos(d) {
    if (visao === 'resumida') return `<div class="painel nf-rolagem-painel" style="margin-top:10px;"><div class="nf-rolagem" style="max-height:calc(100vh - 240px);"><table class="tabela" style="font-size:12.5px; width:100%;"><thead><tr>
        <th>Pedido</th><th>Situação</th><th>Cliente</th><th>Liberação / expedição</th><th>Peso / cub.</th><th>Status WMS</th><th>Etiquetas / separação</th><th>NF-e</th></tr></thead><tbody>
      ${d.pedidos.length ? d.pedidos.slice(0, 1000).map((p) => `<tr>
        <td><b>${esc(p.pedido)}</b>${p.pedido_cliente ? fraco(`Mercus ${esc(p.pedido_cliente)}`) : ''}</td>
        <td style="white-space:nowrap;">${sit(p.situacao)}${p.obs || podeImportar() ? `<br><small style="white-space:normal; display:inline-block; max-width:200px;">📝 ${obsCel(p)}</small>` : ''}${p.embarque_id ? fraco(`embarque ${p.embarque_id}`) : ''}${p.ordem_id ? fraco(`ordem ${p.ordem_id}`) : ''}${p.data_entrega ? fraco(dia(p.data_entrega)) : ''}</td>
        <td style="max-width:220px; min-width:200px; white-space:normal;">${esc(p.cliente || '—')}${fraco([p.nome_curto, cnpjF(p.cnpj)].filter(Boolean).map(esc).join(' · ') || '&nbsp;')}</td>
        <td style="white-space:nowrap;">${dh(p.liberado_em || p.data_pedido)}${['Aguardando nota', 'Integrado'].includes(p.situacao) && p.dias > 3 ? ` <small class="pa-alerta">${p.dias} d</small>` : ''}${fraco(esc(p.expedicao || '—'))}${p.lib_comercial || podeImportar() ? fraco(`comercial: ${libCom(p)}`) : ''}</td>
        <td style="white-space:nowrap;">${num(p.peso, 1)} kg${fraco(p.cubagem == null ? '—' : `${num(p.cubagem, 3)} m³`)}</td>
        <td>${esc(p.status_wms || '—')}${buscarWms(p)}${p.conferencia_pct != null ? ` <small>${num(p.conferencia_pct, 0)}% conf.</small>` : ''}${p.data_inicial || p.usuario || p.exp_wms ? fraco([p.exp_wms ? `exp. ${esc(p.exp_wms)}` : '', p.data_inicial ? `desde ${dh(p.data_inicial)}` : '', p.usuario ? `👤 ${esc(p.usuario)}` : ''].filter(Boolean).join(' · ')) : ''}${p.placa || p.motorista ? fraco(`🚚 ${[p.placa, p.motorista].filter(Boolean).map(esc).join(' · ')}`) : ''}${p.cancelado_wms ? '<br><span class="oc-sit cancelado">cancelado no WMS</span>' : ''}</td>
        <td style="white-space:nowrap;">${[
          p.qtd_etiquetas != null ? `${num(p.qtd_etiquetas)} etq.${p.etiquetas_em ? ` · ${dh(p.etiquetas_em)}` : ''}` : '',
          p.sep_inicio ? `separação ${dh(p.sep_inicio)}${p.sep_fim ? ` → ${String(p.sep_fim).slice(11, 16)}${p.sep_minutos != null ? ` (${duracao(p.sep_minutos)})` : ''}` : ' (em andamento)'}${p.separador ? ` · 👤 ${esc(p.separador)}` : ''}` : (p.separador ? `separador ${esc(p.separador)}` : ''),
          p.conferente || p.conf_inicio ? `conferência ${dh(p.conf_inicio)}${p.conf_fim ? ` → ${String(p.conf_fim).slice(11, 16)}${p.conf_minutos != null ? ` (${duracao(p.conf_minutos)})` : ''}` : ' (em andamento)'}${p.conferente ? ` · 👤 ${esc(p.conferente)}` : ''}` : '',
          !p.sep_inicio && p.exp_fim ? `fim ${dh(p.exp_fim)}` : '',
        ].filter(Boolean).map((t, i) => (i ? fraco(t) : t)).join('') || '—'}</td>
        <td style="white-space:nowrap;">${p.id && p.nf ? `<a href="#" data-pd-nota="${p.id}">${esc(p.nf)}</a>${fraco(dia(p.emissao_nf))}` : esc(p.nf || '—')}</td>
        </tr>`).join('')
        : '<tr><td colspan="8" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum pedido no período. Os pedidos entram pela planilha do ERP (Timeline de pedidos).</td></tr>'}
      </tbody></table></div>${d.pedidos.length > 1000 ? '<p style="font-size:12px; padding:6px 10px; margin:0;">Mostrando os 1.000 mais recentes (o Excel leva todos).</p>' : ''}</div>`;
    const sim = (b) => (b == null ? '—' : b ? 'S' : 'N');
    return `<div class="painel nf-rolagem-painel" style="margin-top:10px;"><div class="nf-rolagem" style="max-height:calc(100vh - 240px);"><table class="tabela pd-compacta"><thead><tr>
        <th class="pd-fixa">Número Pedido</th><th>Situação</th><th>Observações</th><th>CNPJ</th><th>Cliente</th><th>Nome Curto</th><th>Pedido Mercus</th><th>Liberação</th><th>Liberação comercial</th><th>Peso</th><th>Cubagem</th>
        <th>Status/WMS</th><th>Data Inicial</th><th>Expedição</th><th>Usuário</th><th>Data/Imp. Etq</th><th>Qtd. Etiquetas</th><th>Separador</th><th>Data Início</th><th>Data Finalização</th><th>Conferente</th><th>Início Conferência</th><th>Fim Conferência</th>
        <th>Cancelado Wms</th><th>Nota Fiscal</th><th>Data de Emissão</th></tr></thead><tbody>
      ${d.pedidos.length ? d.pedidos.slice(0, 1000).map((p) => `<tr>
        <td class="pd-fixa"><b>${esc(p.pedido)}</b></td>${nw(sit(p.situacao))}<td title="${esc(p.obs || '')}"><div class="pd-flex" style="max-width:220px;">${obsCel(p)}</div></td>${nw(esc(cnpjF(p.cnpj) || '—'))}
        <td class="pd-corta" style="max-width:240px;" title="${esc(p.cliente || '')}">${esc(p.cliente || '—')}</td>
        ${nw(esc(p.nome_curto || '—'))}${nw(esc(p.pedido_cliente || '—'))}
        ${nw(`${dh(p.liberado_em || p.data_pedido)}${['Aguardando nota', 'Integrado'].includes(p.situacao) && p.dias > 3 ? ` <small class="pa-alerta">${p.dias} d</small>` : ''}`)}${nw(libCom(p))}
        ${nw(p.peso == null ? '—' : `${num(p.peso, 1)} kg`)}${nw(p.cubagem == null ? '—' : `${num(p.cubagem, 3)} m³`)}
        ${nw(`${esc(p.status_wms || '—')}${p.conferencia_pct != null ? ` <small>${num(p.conferencia_pct, 0)}%</small>` : ''}${buscarWms(p)}`)}${nw(dh(p.data_inicial))}${nw(esc(p.expedicao || '—'))}
        ${nw(esc(p.usuario || '—'))}${nw(dh(p.etiquetas_em))}${nw(p.qtd_etiquetas == null ? '—' : num(p.qtd_etiquetas))}${nw(esc(p.separador || '—'))}${nw(dh(p.sep_inicio))}${nw(dh(p.sep_fim))}${nw(esc(p.conferente || '—'))}${nw(dh(p.conf_inicio))}${nw(dh(p.conf_fim))}
        ${nw(p.tem_wms ? (p.cancelado_wms ? '<span class="oc-sit cancelado">S</span>' : 'N') : '—')}
        ${nw(p.id && p.nf ? `<a href="#" data-pd-nota="${p.id}">${esc(p.nf)}</a>` : esc(p.nf || '—'))}${nw(dia(p.emissao_nf))}</tr>`).join('')
        : '<tr><td colspan="26" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum pedido no período. Os pedidos entram pela planilha do ERP (Timeline de pedidos).</td></tr>'}
      </tbody></table></div>${d.pedidos.length > 1000 ? '<p style="font-size:12px; padding:6px 10px; margin:0;">Mostrando os 1.000 mais recentes (o Excel leva todos).</p>' : ''}</div>`;
  }

  // Janela do filtro da tela pelo status/tipo do pedido no ERP.
  async function filtroErp(cfg) {
    let m = $('modalPdFiltro');
    if (!m) {
      m = document.createElement('div'); m.className = 'modal-overlay'; m.id = 'modalPdFiltro';
      m.innerHTML = '<div class="painel modal-card" style="width:100%; max-width:480px; padding:22px 24px;" id="pdFiltroCard"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-pf-fechar]')) m.classList.add('oculto'); });
    }
    m.classList.remove('oculto');
    $('pdFiltroCard').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><h3 style="margin:0;">Quais pedidos a tela mostra</h3><span style="cursor:pointer; font-size:18px;" data-pf-fechar>✕</span></div>
      <p style="font-size:12.5px; color:var(--texto-fraco); margin-top:0;">Pelos campos ESTATUS_PEDIDO e TIPO_PEDIDO da planilha Timeline de pedidos. A planilha continua sendo importada inteira (ela completa as notas); isto só muda o que aparece nesta tela.</p>
      <label style="font-size:13px; display:flex; gap:6px; align-items:center;"><input type="checkbox" id="pfFiltrar" ${cfg.filtrar !== false ? 'checked' : ''} style="width:auto;"> Mostrar só os pedidos com estes valores</label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px; font-size:13px;">
        <label>Status (ESTATUS_PEDIDO)<input id="pfEstatus" value="${esc((cfg.estatus || ['A']).join(', '))}" placeholder="A" style="display:block; width:100%; margin-top:3px;"></label>
        <label>Tipo (TIPO_PEDIDO)<input id="pfTipos" value="${esc((cfg.tipos || ['P']).join(', '))}" placeholder="P (vazio = todos)" style="display:block; width:100%; margin-top:3px;"></label></div>
      <p style="font-size:12px; color:var(--texto-fraco);">Mais de um: separe por vírgula (ex.: A, T). Tipo vazio aceita qualquer tipo.${cfg.usuario_nome ? ` Última mudança: ${esc(cfg.usuario_nome)}${cfg.atualizado_em ? ` em ${esc(dh(cfg.atualizado_em))}` : ''}.` : ''}</p>
      <div style="display:flex; gap:8px; justify-content:flex-end;"><button class="btn btn-primario" id="pfSalvar" style="width:auto;">Salvar</button></div>`;
    $('pfSalvar').addEventListener('click', async () => {
      try {
        const r2 = await apiFetch('/api/pedidos/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filtrar: $('pfFiltrar').checked, estatus: $('pfEstatus').value, tipos: $('pfTipos').value }) });
        const j = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j.erro || 'Erro ao salvar.');
        m.classList.add('oculto'); await desenharPedidos();
      } catch (err) { erro(err); }
    });
  }

  // Janela da observação do pedido (com atalhos para as mais usadas).
  const OBS_PRONTAS = ['Pedido agendando', 'Entrega agendada', 'Aguardando pagamento', 'Aguardando o cliente', 'Cliente vai retirar', 'Pedido bloqueado', 'Faturar junto com outro pedido'];
  async function editarObs(pedido, valor) {
    let m = $('modalPdObs');
    if (!m) {
      m = document.createElement('div'); m.className = 'modal-overlay'; m.id = 'modalPdObs';
      m.innerHTML = '<div class="painel modal-card" style="width:100%; max-width:480px; padding:22px 24px;" id="pdObsCard"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-po-fechar]')) m.classList.add('oculto'); });
    }
    m.classList.remove('oculto');
    $('pdObsCard').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><h3 style="margin:0;">Observação · pedido ${esc(pedido)}</h3><span style="cursor:pointer; font-size:18px;" data-po-fechar>✕</span></div>
      <textarea id="poTexto" maxlength="500" rows="3" style="width:100%;" placeholder="Ex.: pedido agendando para 02/12">${esc(valor || '')}</textarea>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:8px 0;">${OBS_PRONTAS.map((t) => `<button class="btn btn-secundario" data-po-pronta="${esc(t)}" style="width:auto; padding:3px 9px; font-size:12px;">${esc(t)}</button>`).join('')}</div>
      <div style="display:flex; gap:8px; justify-content:flex-end;"><button class="btn btn-secundario" id="poApagar" style="width:auto;">Apagar</button><button class="btn btn-primario" id="poSalvar" style="width:auto;">Salvar</button></div>`;
    $('poTexto').focus();
    $('pdObsCard').querySelectorAll('[data-po-pronta]').forEach((b) => b.addEventListener('click', () => { const t = $('poTexto'); t.value = t.value.trim() ? `${t.value.trim()} · ${b.dataset.poPronta}` : b.dataset.poPronta; t.focus(); }));
    const enviar = async (texto) => {
      const r2 = await apiFetch(`/api/pedidos/observacao/${encodeURIComponent(pedido)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
      const j = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(j.erro || 'Erro ao salvar.');
      m.classList.add('oculto'); await desenharPedidos();
    };
    $('poSalvar').addEventListener('click', () => enviar($('poTexto').value).catch(erro));
    $('poApagar').addEventListener('click', () => enviar('').catch(erro));
    $('poTexto').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar($('poTexto').value).catch(erro); });
  }

  // Janela para digitar (ou apagar) a liberação comercial de um pedido.
  async function editarLibCom(pedido, valor) {
    let m = $('modalLibCom');
    if (!m) {
      m = document.createElement('div'); m.className = 'modal-overlay'; m.id = 'modalLibCom';
      m.innerHTML = '<div class="painel modal-card" style="width:100%; max-width:420px; padding:22px 24px;" id="libComCard"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-lc-fechar]')) m.classList.add('oculto'); });
    }
    m.classList.remove('oculto');
    $('libComCard').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><h3 style="margin:0;">Liberação comercial · pedido ${esc(pedido)}</h3><span style="cursor:pointer; font-size:18px;" data-lc-fechar>✕</span></div>
      <label style="display:block; font-size:13px;">Data e hora em que o comercial liberou<input type="datetime-local" id="lcValor" value="${esc(String(valor || '').replace(' ', 'T'))}" style="display:block; width:100%; margin-top:4px;"></label>
      <p style="font-size:12px; color:var(--texto-fraco);">A data digitada fica como manual e não é trocada pelos e-mails importados depois. Apagar faz o pedido voltar a esperar o e-mail.</p>
      <div style="display:flex; gap:8px; justify-content:flex-end;"><button class="btn btn-secundario" id="lcApagar" style="width:auto;">Apagar</button><button class="btn btn-primario" id="lcSalvar" style="width:auto;">Salvar</button></div>`;
    const enviar = async (v) => {
      const r2 = await apiFetch(`/api/pedidos/liberacao-comercial/${encodeURIComponent(pedido)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liberado_em: v }) });
      const j = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(j.erro || 'Erro ao salvar.');
      m.classList.add('oculto'); await desenharPedidos();
    };
    $('lcSalvar').addEventListener('click', () => { if (!$('lcValor').value) { erro(new Error('Informe a data e a hora.')); return; } enviar($('lcValor').value).catch(erro); });
    $('lcApagar').addEventListener('click', () => enviar('').catch(erro));
  }

  async function desenharPedidos() {
    const st = estado.pedidos;
    const d = await api(`/?${new URLSearchParams({ situacao: st.situacao, busca: st.busca, de: st.de, ate: st.ate })}`);
    const r = d.resumo;
    ultimaLista = d.pedidos;
    const pode = podeImportar(); const admin = usuario?.perfil === 'admin';
    const filtroTxt = d.filtro_erp?.filtrar
      ? `Status ERP <b>${esc(d.filtro_erp.estatus.join(', '))}</b>${d.filtro_erp.tipos.length ? ` · tipo <b>${esc(d.filtro_erp.tipos.join(', '))}</b>` : ''}`
      : 'Todos os pedidos do ERP';
    cont.innerHTML = `<div class="nf-resumo pd-cartoes">
        <div>Pedidos no período<b>${num(r.pedidos)}</b><span>${num(r.peso, 1)} kg${r.etiquetas ? ` · ${num(r.etiquetas)} etiquetas` : ''}</span></div>
        <div>Aguardando nota<b>${num(r.aguardando_nota)}</b><span>${r.aguardando_mais_dias ? `${r.aguardando_mais_dias} há mais de 3 dias` : 'ainda não estão no WMS'}</span></div>
        <div>Integrados<b>${num(r.integrados)}</b><span>${r.integrados_mais_dias ? `${r.integrados_mais_dias} há mais de 3 dias` : 'no WMS, a separar'}</span></div>
        <div>Em separação / conferência<b>${num(r.em_separacao)}</b><span>no WMS</span></div>
        <div>Separados<b>${num(r.separados)}</b><span>esperando a nota</span></div>
        <div>Faturados<b>${num(d.contagem.Faturado + d.contagem['Em embarque'] + d.contagem['Coleta pedida'])}</b><span>ainda não saíram</span></div>
        <div>Em trânsito / entregues<b>${num(d.contagem['Coletado / em trânsito'] + d.contagem.Entregue)}</b><span>${num(d.contagem.Entregue)} entregues</span></div></div>
      <div class="pd-barra">
        ${chips(d, st)}
        <div class="pd-acoes">
          <span class="pd-periodo" title="Período (data do pedido)"><input type="date" id="pdDe" value="${esc(d.de)}"><span>até</span><input type="date" id="pdAte" value="${esc(d.ate)}"></span>
          <span class="pd-visao" title="Planilha: cada campo numa coluna. Resumida: campos agrupados.">
            <button class="${visao === 'planilha' ? 'ativo' : ''}" data-pd-visao="planilha">▦ Planilha</button><button class="${visao === 'resumida' ? 'ativo' : ''}" data-pd-visao="resumida">☰ Resumida</button></span>
          ${pode ? '<button class="btn btn-secundario pd-btn" id="pdWmsAgora" title="Procura no WMS só os pedidos da lista (período, situação e busca da tela)">⟳ Atualizar do WMS</button>' : ''}
          <button class="btn btn-secundario pd-btn" id="pdExcel" title="Todos os pedidos da lista, com todas as colunas">⬇ Excel</button>
          ${pode || admin ? `<div class="pd-mais"><button class="btn btn-secundario pd-btn" id="pdMaisBtn" title="Mais ações">⋯ Mais</button>
            <div class="pd-menu oculto" id="pdMenu">
              ${pode ? '<button id="pdLibPdf" title="E-mails de liberação do comercial impressos em PDF: a data do e-mail vira a liberação comercial dos pedidos listados nele">📧 Liberação comercial (PDF)</button>' : ''}
              ${pode ? '<button id="pdWms" title="Planilha exportada do WMS (Número Pedido, Status/WMS, Data Inicial...)">⬆ Importar planilha do WMS</button>' : ''}
              ${pode ? '<button id="pdWmsTodos" class="oculto" title="Procura no WMS, um por vez, todos os pedidos dos últimos 60 dias sem dados ou não finalizados">🔎 Buscar todos sem dados no WMS</button>' : ''}
              ${pode ? '<button id="pdWmsPausar" class="oculto"></button>' : ''}
              <hr>
              ${pode ? '<button id="pdFiltroErp" title="Quais status e tipos do ERP aparecem nesta tela">🔎 Filtro de status do ERP</button>' : ''}
              ${admin ? '<button id="pdWmsCfg" title="Endereço, usuário e senha do WMS, consulta automática e testes">⚙ Ligação com o WMS</button>' : ''}
            </div></div>` : ''}
          ${pode ? '<input type="file" id="pdLibArq" accept=".pdf,application/pdf" multiple class="oculto"><input type="file" id="pdWmsArq" accept=".xlsx,.xls,.csv" class="oculto">' : ''}
        </div>
      </div>
      <div class="pd-info"><span>${filtroTxt}</span><span id="pdWmsSit"></span></div>
      <div id="pdWmsRes" style="font-size:12.5px; margin-top:6px;"></div>
      ${tabelaPedidos(d)}`;
    ligar(st, desenharPedidos);
    ajustarRolagem();
    const menu = $('pdMenu');
    $('pdMaisBtn')?.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('oculto'); });
    menu?.addEventListener('click', () => menu.classList.add('oculto'));
    if (!window.__pdMenuFora) { window.__pdMenuFora = true; document.addEventListener('click', (e) => { if (!e.target.closest('.pd-mais')) $('pdMenu')?.classList.add('oculto'); }); }
    // Clique na linha: fica destacada (como na lista do ERP), para não se perder ao rolar para o lado.
    cont.querySelectorAll('table.pd-compacta tbody tr').forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('a, button, input')) return;
      cont.querySelectorAll('table.pd-compacta tr.pd-selecionada').forEach((x) => x.classList.remove('pd-selecionada'));
      tr.classList.add('pd-selecionada');
    }));
    cont.querySelectorAll('[data-pd-wmsbuscar]').forEach((a) => a.addEventListener('click', async (e) => {
      e.preventDefault(); a.textContent = 'buscando...';
      try {
        const r2 = await apiFetch('/api/wms/consultar-carga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ carga: a.dataset.pdWmsbuscar }) });
        const j = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j.erro || 'Erro ao buscar no WMS.');
        if (!j.achou) { a.replaceWith(Object.assign(document.createElement('small'), { textContent: ' não está no WMS', title: j.msg })); return; }
        await desenharPedidos();
      } catch (err) { a.textContent = '🔎 buscar'; erro(err); }
    }));
    cont.querySelectorAll('[data-pd-visao]').forEach((b) => b.addEventListener('click', () => { visao = b.dataset.pdVisao; try { localStorage.setItem('nexofretePedidosVisao', visao); } catch (e) { /* sem armazenamento */ } desenharPedidos().catch(erro); }));
    ['pdDe', 'pdAte'].forEach((id) => $(id).addEventListener('change', () => { st.de = $('pdDe').value; st.ate = $('pdAte').value; desenharPedidos().catch(erro); }));
    $('pdExcel').addEventListener('click', () => {
      window.exportarExcel?.(`pedidos-${d.de}-a-${d.ate}`, [{ nome: 'Pedidos', colunas: ['Número Pedido', 'CNPJ', 'Cliente', 'Nome Curto', 'Pedido Mercus', 'Liberação', 'Liberação comercial', 'Peso (kg)', 'Cubagem (m³)',
        'Status/WMS', 'Data Inicial', 'Expedição', 'Usuário', 'Data/Imp. Etq', 'Qtd. Etiquetas', 'Separador', 'Data Início', 'Data Finalização', 'Conferente', 'Início Conferência', 'Fim Conferência', 'Cancelado Wms', 'Nota Fiscal', 'Data de Emissão',
        'Situação', 'Observações', 'Destino', 'Transportadora', 'CT-e', 'Expedição WMS', 'Tipo Pedido', 'Placa', 'Motorista', 'Itinerário', 'Data Final (WMS)', '% Conferência', 'Imprimir'],
      linhas: ultimaLista.map((p) => [p.pedido, cnpjF(p.cnpj), p.cliente || '', p.nome_curto || '', p.pedido_cliente || '', dh(p.liberado_em || p.data_pedido).replace('—', ''), dh(p.lib_comercial).replace('—', ''), p.peso, p.cubagem,
        p.status_wms || '', dh(p.data_inicial).replace('—', ''), p.expedicao || '', p.usuario || '', dh(p.etiquetas_em).replace('—', ''), p.qtd_etiquetas, p.separador || '', dh(p.sep_inicio).replace('—', ''),
        dh(p.sep_fim).replace('—', ''), p.conferente || '', dh(p.conf_inicio).replace('—', ''), dh(p.conf_fim).replace('—', ''), p.cancelado_wms ? 'S' : (p.tem_wms ? 'N' : ''), p.nf || '', p.emissao_nf ? dia(p.emissao_nf) : '', p.situacao, p.obs || '', p.destino || '', p.transportadora || '', p.numero_cte || '',
        p.exp_wms || '', p.tipo_pedido || '', p.placa || '', p.motorista || '', p.itinerario || '', dh(p.exp_fim).replace('—', ''), p.conferencia_pct, p.imprimir == null ? '' : (p.imprimir ? 'SIM' : 'NÃO')])}]).catch(erro);
    });
    $('pdWmsCfg')?.addEventListener('click', () => abrirWms().catch(erro));
    $('pdFiltroErp')?.addEventListener('click', (e) => { e.preventDefault(); filtroErp(d.filtro_erp || {}).catch(erro); });
    // Situação da consulta ao WMS e o "Atualizar do WMS".
    apiFetch('/api/wms/situacao').then((x) => x.json()).then((w) => {
      const el = $('pdWmsSit'); if (!el) return;
      if (!w?.configurado) { el.innerHTML = `WMS: não configurado${usuario?.perfil === 'admin' ? ' (⋯ Mais › Ligação com o WMS)' : ''}`; return; }
      el.innerHTML = `WMS: ${w.ativo ? '<span style="color:var(--verde);">● ligado</span>' : '<span style="color:var(--vermelho);">● pausado</span>'}`
        + (w.ultima_consulta_em ? ` · última consulta ${dh(w.ultima_consulta_em)} ${w.ultima_consulta_ok ? '<span style="color:var(--verde);">✓</span>' : `<span style="color:var(--vermelho);" title="${esc(w.ultima_consulta_msg || '')}">✗ falhou</span>`}` : '')
        + (w.busca?.rodando ? ` · <span id="pdWmsProg" style="color:var(--azul);">⏳ Buscando pedidos no WMS: ${num(w.busca.feitas)} de ${num(w.busca.total)} (${num(w.busca.achadas)} achados)</span>` : '');
      el.title = w.ativo ? `Consulta automática a cada ${w.intervalo_min} min, das ${w.hora_inicio}h às ${w.hora_fim}h` : 'O Nexofrete não consulta o WMS enquanto estiver pausado';
      const bp = $('pdWmsPausar');
      if (bp) { bp.classList.remove('oculto'); bp.textContent = w.ativo ? 'Pausar integração com o WMS' : '▶ Retomar integração com o WMS'; bp.classList.toggle('perigo', !!w.ativo); }
      if (w.ativo && !w.busca?.rodando) $('pdWmsTodos')?.classList.remove('oculto');
      // Busca completa em andamento: acompanha e redesenha a lista quando terminar.
      // Só o texto do andamento é atualizado (a lista não pisca nem perde a rolagem); no fim, a lista é redesenhada.
      const acompanhar = () => { clearTimeout(window.__pdWmsBusca); window.__pdWmsBusca = setTimeout(async () => {
        const prog = document.getElementById('pdWmsProg'); if (!prog) return;
        const x = await apiFetch('/api/wms/situacao').then((y) => y.json()).catch(() => null);
        if (x?.busca?.rodando) { prog.textContent = `⏳ Buscando pedidos no WMS: ${num(x.busca.feitas)} de ${num(x.busca.total)} (${num(x.busca.achadas)} achados)`; acompanhar(); } else desenharPedidos().catch(() => null);
      }, 5000); };
      if (w.busca?.rodando) acompanhar();
      $('pdWmsTodos')?.addEventListener('click', async () => {
        if (!await confirmar('O Nexofrete vai procurar no WMS, um por vez (1 segundo entre cada um), todos os pedidos dos últimos 60 dias que estão sem dados ou não finalizados. Pode levar alguns minutos; o andamento aparece aqui e Pausar integração interrompe.', { titulo: 'Buscar todos os pedidos sem dados?', textoOk: 'Buscar' })) return;
        try {
          const r2 = await apiFetch('/api/wms/buscar-todos', { method: 'POST' });
          const j = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(j.erro || 'Erro ao iniciar a busca.');
          await desenharPedidos();
        } catch (err) { erro(err); }
      });
      const agora = $('pdWmsAgora');
      if (agora && !w.ativo) { agora.disabled = true; agora.title = 'A integração com o WMS está pausada'; }
      if (agora && w.busca?.rodando) { agora.disabled = true; agora.title = 'Já tem uma atualização do WMS em andamento'; }
      $('pdWmsPausar')?.addEventListener('click', async () => {
        if (w.ativo && !await confirmar('O Nexofrete para de consultar o WMS (a consulta automática e o botão Atualizar do WMS) até alguém clicar em Retomar integração.', { titulo: 'Pausar a integração com o WMS?', textoOk: 'Pausar', tipo: 'perigo' })) return;
        try {
          const r2 = await apiFetch('/api/wms/pausar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !w.ativo }) });
          const j = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(j.erro || 'Não consegui mudar a integração.');
          await desenharPedidos();
        } catch (err) { erro(err); }
      });
    }).catch(() => null);
    // "Atualizar do WMS": só os pedidos que estão na lista (período, situação e busca da tela), em segundo plano.
    $('pdWmsAgora')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;   // guardado antes de esperar a confirmação (depois o evento já não aponta para o botão)
      const nums = [...new Set(ultimaLista.map((p) => String(p.pedido || '')).filter((x) => /^\d+$/.test(x)))];
      if (!nums.length) { mostrarAlerta('Nenhum pedido na lista para atualizar.', { tipo: 'aviso' }); return; }
      const min = Math.max(1, Math.round(nums.length * 1.5 / 60));
      if (!await confirmar(`Procurar no WMS os ${nums.length.toLocaleString('pt-BR')} pedido(s) da lista (${dia(d.de)} a ${dia(d.ate)}${st.situacao ? `, ${st.situacao}` : ''}${st.busca ? `, "${st.busca}"` : ''}), um por vez: status, quem imprimiu e o separador. Leva cerca de ${min} min; o andamento aparece na linha do WMS.`,
        { titulo: 'Atualizar estes pedidos do WMS?', textoOk: 'Atualizar' })) return;
      b.disabled = true;
      try {
        const r2 = await apiFetch('/api/wms/atualizar-pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidos: nums }) });
        const j = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j.erro || 'Erro ao atualizar do WMS.');
        await desenharPedidos();
      } catch (err) { erro(err); b.disabled = false; }
    });
    $('pdLibPdf')?.addEventListener('click', () => $('pdLibArq').click());
    $('pdLibArq')?.addEventListener('change', async (e) => {
      const arqs = [...e.target.files]; if (!arqs.length) return;
      const res = $('pdWmsRes'); res.textContent = `Lendo ${arqs.length} e-mail(s) de liberação...`;
      const fd = new FormData(); arqs.forEach((a) => fd.append('arquivos', a));
      try {
        const r2 = await apiFetch('/api/pedidos/liberacao-comercial/pdf', { method: 'POST', body: fd });
        const j = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j.erro || 'Erro ao ler os PDFs.');
        await desenharPedidos();
        $('pdWmsRes').innerHTML = (j.resultados || []).map((x) => (x.erro ? `<span style="color:var(--vermelho);">✗ ${esc(x.arquivo)}: ${esc(x.erro)}</span>`
          : `<span style="color:var(--verde);">✓</span> ${esc(x.arquivo || 'e-mail')}: liberação de <b>${esc(dh(x.data))}</b>${x.de ? ` (${esc(x.de.replace(/\s*-\s*Comercial.*$/i, ''))})` : ''}: ${num(x.pedidos)} pedido(s), ${num(x.gravados)} gravado(s)`
            + `${x.ja_mais_antigos ? `, ${num(x.ja_mais_antigos)} já tinham liberação igual ou mais antiga` : ''}${x.manuais ? `, ${num(x.manuais)} com data manual (mantida)` : ''}`)).join('<br>');
      } catch (err) { res.innerHTML = `<span style="color:var(--vermelho);">${esc(err.message)}</span>`; } finally { e.target.value = ''; }
    });
    cont.querySelectorAll('[data-pd-obs]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); editarObs(a.dataset.pdObs, a.dataset.valor).catch(erro); }));
    cont.querySelectorAll('[data-pd-libcom]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); editarLibCom(a.dataset.pdLibcom, a.dataset.valor).catch(erro); }));
    $('pdWms')?.addEventListener('click', () => $('pdWmsArq').click());
    $('pdWmsArq')?.addEventListener('change', async (e) => {
      const arq = e.target.files[0]; if (!arq) return;
      const res = $('pdWmsRes'); res.textContent = 'Lendo a planilha do WMS...';
      const fd = new FormData(); fd.append('arquivo', arq);
      try {
        const r2 = await apiFetch('/api/pedidos/wms', { method: 'POST', body: fd });
        const j = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j.erro || 'Erro ao importar a planilha do WMS.');
        const NOMES = { status: 'Status/WMS', data_inicial: 'Data Inicial', usuario: 'Usuário', etiquetas_impressas_em: 'Data/Imp. Etq', qtd_etiquetas: 'Qtd. Etiquetas', separacao_inicio: 'Data Início',
          separacao_fim: 'Data Finalização', cancelado: 'Cancelado Wms', liberacao: 'Liberação', expedicao: 'Expedição' };
        const inv = Object.entries(j.invalidos || {}).map(([c, n]) => `${NOMES[c] || c}: ${num(n)}`);
        await desenharPedidos();
        $('pdWmsRes').innerHTML = `<span style="color:var(--verde);">✓</span> ${num(j.pedidos)} pedido(s) do WMS gravados (${num(j.total)} linhas). Colunas lidas: ${(j.colunas || []).map((c) => esc(c.coluna)).join(', ')}.`
          + (inv.length ? `<br><span style="color:var(--vermelho);">Valores que não são do tipo da coluna (ficaram vazios): ${esc(inv.join(' · '))}. Confira se as colunas da planilha não estão deslocadas.</span>` : '');
      } catch (err) { res.innerHTML = `<span style="color:var(--vermelho);">${esc(err.message)}</span>`; } finally { e.target.value = ''; }
    });
  }

  // ---------- Ligação com o WMS (administrador): cadastro e diagnóstico da conexão (src/wms.js) ----------
  async function abrirWms() {
    const pedir = async (c, op = {}) => { const r = await apiFetch(`/api/wms${c}`, op); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro na ligação com o WMS.'); return j; };
    const c = await pedir('/config');
    let m = $('modalWms');
    if (!m) {
      m = document.createElement('div'); m.className = 'modal-overlay'; m.id = 'modalWms';
      m.innerHTML = '<div class="painel modal-card" style="width:100%; max-width:760px; max-height:94vh; overflow-y:auto; padding:22px 24px;" id="wmsModal"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-wms-fechar]')) m.classList.add('oculto'); });
    }
    m.classList.remove('oculto');
    $('wmsModal').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><h3 style="margin:0;">⚙ Ligação com o WMS</h3><span style="cursor:pointer; font-size:18px;" data-wms-fechar>✕</span></div>
      <p style="font-size:12.5px; color:var(--texto-fraco); margin-top:0;">O Nexofrete consulta o WMS sozinho (só leitura), a partir do servidor (o WMS fica na rede da empresa), e preenche status, expedição, conferência,
        placa e motorista dos pedidos (Carga = pedido do ERP). Use um <b>usuário só de consulta</b>, criado para o Nexofrete.</p>
      <label style="display:block; font-size:13px;">Endereço do WMS<input style="display:block; width:100%; margin-top:3px;" id="wmsUrl" value="${esc(c.url || '')}" placeholder="http://10.150.15.66/auth/login"></label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <label style="display:block; font-size:13px; margin-top:8px;">Usuário<input style="display:block; width:100%; margin-top:3px;" id="wmsUsuario" value="${esc(c.usuario || '')}" autocomplete="off"></label>
        <label style="display:block; font-size:13px; margin-top:8px;">Senha<input style="display:block; width:100%; margin-top:3px;" id="wmsSenha" type="password" autocomplete="new-password" placeholder="${c.tem_senha ? 'senha cadastrada (deixe em branco para manter)' : ''}"></label></div>
      <label style="display:block; font-size:13px; margin-top:8px;">Endereço da tela Expedição Mercadorias <small style="color:var(--texto-fraco);">(no navegador, abra a tela, busque uma Carga e copie o endereço da barra)</small>
        <input style="display:block; width:100%; margin-top:3px;" id="wmsTela" value="${esc(c.url_expedicao || '')}" placeholder="http://10.150.15.66/..."></label>
      <fieldset style="border:1px solid var(--borda); border-radius:8px; padding:10px 12px; margin-top:12px;"><legend style="font-size:13px; padding:0 6px;">Consulta automática</legend>
        <label style="font-size:13px; display:flex; gap:6px; align-items:center;"><input type="checkbox" id="wmsAtivo" ${c.ativo ? 'checked' : ''} style="width:auto;"> Ligada (pausar desmarca na hora)</label>
        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:10px; margin-top:6px; font-size:13px;">
          <label>A cada<select id="wmsIntervalo" style="display:block; width:100%; margin-top:3px;">${[30, 60, 120, 240].map((m) => `<option value="${m}" ${Number(c.intervalo_min || 60) === m ? 'selected' : ''}>${m < 60 ? `${m} min` : `${m / 60} h`}</option>`).join('')}</select></label>
          <label>Das (hora)<input id="wmsHoraIni" type="number" min="0" max="23" value="${c.hora_inicio ?? 7}" style="display:block; width:100%; margin-top:3px;"></label>
          <label>Até (hora)<input id="wmsHoraFim" type="number" min="1" max="24" value="${c.hora_fim ?? 19}" style="display:block; width:100%; margin-top:3px;"></label>
          <label>Dias para trás<input id="wmsDias" type="number" min="1" max="31" value="${c.dias ?? 7}" style="display:block; width:100%; margin-top:3px;"></label>
          <label title="Depois da busca por período, quantos pedidos procurar pela Carga em cada rodada (os sem dados do WMS ou não finalizados)">Por carga (máx.)<input id="wmsPorCarga" type="number" min="0" max="200" value="${c.por_carga_max ?? 40}" style="display:block; width:100%; margin-top:3px;"></label></div>
        <p style="font-size:12px; color:var(--texto-fraco); margin:6px 0 0;">Uma busca por período (Data Inicial da expedição) na tela Expedição Mercadorias e, depois, os pedidos que ela não trouxe (sem dados do WMS ou não finalizados) procurados pela Carga, um por vez, até o máximo por rodada. Depois de uma falha, espera o dobro do intervalo.
          ${c.ultima_consulta_em ? `Última consulta: ${dh(c.ultima_consulta_em)} — ${c.ultima_consulta_ok ? 'ok' : 'falhou'}: ${esc(c.ultima_consulta_msg || '')}` : ''}</p>
        <button class="btn btn-secundario" id="wmsConsultar" style="width:auto; margin-top:8px;">⟳ Salvar e consultar agora</button></fieldset>
      <p style="font-size:12px; color:var(--texto-fraco);">A senha é guardada criptografada e não aparece de novo para ninguém.${c.ultimo_teste_em ? ` Último teste: ${dh(String(c.ultimo_teste_em).replace('T', ' '))} — ${c.ultimo_teste_ok ? 'respondeu' : 'falhou'}.` : ''}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-primario" id="wmsSalvar" style="width:auto;">Salvar</button>
        <button class="btn btn-secundario" id="wmsTestar" style="width:auto;">🔌 Salvar e testar conexão</button>
        <button class="btn btn-secundario" id="wmsTestarTela" style="width:auto;" title="Faz o login no WMS e abre a tela Expedição Mercadorias">🔐 Testar login e tela de expedição</button></div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap; font-size:13px;">Testar a OS da expedição nº
        <input id="wmsOsExp" placeholder="83383" style="width:110px;"><button class="btn btn-secundario" id="wmsTestarOs" style="width:auto;" title="Abre a OS da expedição no WMS e mostra quem imprimiu as etiquetas e quando">🏷 Testar OS (quem imprimiu)</button>
        <button class="btn btn-secundario" id="wmsTestarSep" style="width:auto;" title="Busca a expedição na tela Definir Equipe de Separação (apontamento) e mostra o separador e as datas">👷 Testar separador</button></div>
      <div id="wmsRes" style="margin-top:12px;"></div>`;
    const salvar = () => pedir('/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: $('wmsUrl').value, usuario: $('wmsUsuario').value, senha: $('wmsSenha').value, url_expedicao: $('wmsTela').value,
      ativo: $('wmsAtivo').checked, intervalo_min: $('wmsIntervalo').value, hora_inicio: $('wmsHoraIni').value, hora_fim: $('wmsHoraFim').value, dias: $('wmsDias').value, por_carga_max: $('wmsPorCarga').value }) });
    $('wmsSalvar').addEventListener('click', async () => { try { await salvar(); $('wmsSenha').value = ''; mostrarAlerta('Ligação com o WMS salva.', { tipo: 'sucesso' }); } catch (e) { erro(e); } });
    const testarCom = (caminho, msgOk, msgErro) => async () => {
      const res = $('wmsRes'); res.innerHTML = '<p style="font-size:13px;">Testando a partir do servidor...</p>';
      try {
        await salvar(); $('wmsSenha').value = '';
        const t = await pedir(caminho, { method: 'POST' });
        res.innerHTML = `<p style="font-size:13px;">${t.ok ? `<span style="color:var(--verde);">✓ ${msgOk}</span>` : `<span style="color:var(--vermelho);">✗ ${msgErro}</span>`}
          Copie o diagnóstico abaixo e envie para quem está montando a integração (ele não tem senha nem dados).</p>
          <textarea id="wmsDiag" readonly style="width:100%; height:260px; font-family:monospace; font-size:11.5px;">${esc(t.texto)}</textarea>
          <button class="btn btn-secundario" id="wmsCopiar" style="width:auto; margin-top:6px;">📋 Copiar diagnóstico</button>`;
        $('wmsCopiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('wmsDiag').value); mostrarAlerta('Diagnóstico copiado.', { tipo: 'sucesso' }); } catch (e) { $('wmsDiag').select(); document.execCommand('copy'); } });
      } catch (e) { res.innerHTML = `<p style="color:var(--vermelho); font-size:13px;">${esc(e.message)}</p>`; }
    };
    $('wmsTestar').addEventListener('click', testarCom('/testar', 'O servidor alcançou o WMS.', 'O servidor não conseguiu abrir a página do WMS.'));
    $('wmsTestarTela').addEventListener('click', testarCom('/testar-tela', 'Login feito e tela de expedição aberta.', 'Não consegui abrir a tela de expedição.'));
    $('wmsTestarOs').addEventListener('click', async () => {
      const res = $('wmsRes'); res.innerHTML = '<p style="font-size:13px;">Abrindo a OS no WMS...</p>';
      try {
        await salvar(); $('wmsSenha').value = '';
        const t = await pedir('/testar-os', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expedicao: $('wmsOsExp').value }) });
        res.innerHTML = `<p style="font-size:13px;">${t.ok ? `<span style="color:var(--verde);">✓ Quem imprimiu: <b>${esc(t.os.usuario)}</b> em ${esc(dh(t.os.impresso_em))}</span>` : '<span style="color:var(--vermelho);">✗ Não achei quem imprimiu na OS.</span>'} Copie e envie o diagnóstico se algo estiver errado.</p>
          <textarea readonly style="width:100%; height:180px; font-family:monospace; font-size:11.5px;">${esc(t.texto)}</textarea>`;
      } catch (e) { res.innerHTML = `<p style="color:var(--vermelho); font-size:13px;">${esc(e.message)}</p>`; }
    });
    $('wmsTestarSep').addEventListener('click', async () => {
      const res = $('wmsRes'); res.innerHTML = '<p style="font-size:13px;">Buscando a separação no WMS...</p>';
      try {
        await salvar(); $('wmsSenha').value = '';
        const t = await pedir('/testar-separacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expedicao: $('wmsOsExp').value }) });
        res.innerHTML = `<p style="font-size:13px;">${t.ok ? `<span style="color:var(--verde);">✓ Separador: <b>${esc(t.separacao.separador || '?')}</b> · ${esc(dh(t.separacao.sep_inicio))} → ${esc(dh(t.separacao.sep_fim))}</span>` : '<span style="color:var(--vermelho);">✗ Não achei a separação desta expedição.</span>'} Copie e envie o diagnóstico se algo estiver errado.</p>
          <textarea readonly style="width:100%; height:150px; font-family:monospace; font-size:11.5px;">${esc(t.texto)}</textarea>`;
      } catch (e) { res.innerHTML = `<p style="color:var(--vermelho); font-size:13px;">${esc(e.message)}</p>`; }
    });
    $('wmsConsultar').addEventListener('click', async () => {
      const res = $('wmsRes'); res.innerHTML = '<p style="font-size:13px;">Consultando o WMS a partir do servidor...</p>';
      try {
        await salvar(); $('wmsSenha').value = '';
        const t = await pedir('/consultar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teste: true }) });
        res.innerHTML = `<p style="font-size:13px;"><span style="color:var(--verde);">✓</span> ${esc(t.msg)}</p>`;
        desenharPedidos().catch(() => null);
      } catch (e) { res.innerHTML = `<p style="color:var(--vermelho); font-size:13px;">${esc(e.message)}</p>`; }
    });
  }

  async function desenharPrenotas() {
    const st = estado.prenotas;
    const d = await api(`/pre-notas?${new URLSearchParams({ situacao: st.situacao, busca: st.busca })}`);
    const r = d.resumo;
    cont.innerHTML = `<div class="nf-resumo">
        <div>Esperando faturamento<b>${num(r.abertas)}</b><span>${moeda(r.valor_aberto)}</span></div>
        <div class="${r.paradas ? 'ex-alerta' : ''}">Paradas sem faturar<b>${num(r.paradas)}</b><span>há mais de ${d.dias_parada} dias</span></div>
        <div>Faturadas com diferença<b>${num(r.com_diferenca)}</b><span>últimos 60 dias</span></div>
        <div>Do pedido à nota (média)<b>${r.dias_ate_faturar == null ? '—' : `${num(r.dias_ate_faturar, 1)} d`}</b><span>&nbsp;</span></div></div>
      <div class="pa-topo" style="margin-top:12px;">${chips(d, st)}</div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:10px;"><table class="tabela"><thead><tr><th>Pedido</th><th>Data do pedido</th><th>Recebida em</th><th>Cliente</th><th>Destino</th><th>Valor</th><th>Vol. / peso</th><th>Transportadora</th><th>NF-e</th><th>Dias</th><th>Situação</th></tr></thead><tbody>
      ${d.prenotas.length ? d.prenotas.slice(0, 1000).map((p) => `<tr><td><b>${esc(p.pedido || '—')}</b>${p.pedido_cliente ? `<br><small style="color:var(--texto-fraco);">cliente: ${esc(p.pedido_cliente)}</small>` : ''}</td><td>${dia(p.data_pedido)}</td><td>${dia(p.recebida_em)}</td>
        <td>${esc(p.cliente)}</td><td>${esc(p.destino)}</td><td>${moeda(p.valor)}${p.faturada && p.valor_nf != null && p.valor != null && Math.abs(p.valor_nf - p.valor) > 0.01 ? `<br><small>NF: ${moeda(p.valor_nf)}</small>` : ''}</td><td>${num(p.volumes)} vol.<br><small>${num(p.peso, 1)} kg</small></td>
        <td>${esc(p.transportadora || '—')}</td><td>${p.id ? `<a href="#" data-pd-nota="${p.id}">${esc(p.numero_nf)}</a><br><small>${dia(p.emissao_nf)}</small>` : esc(p.numero_nf || '—')}</td>
        <td>${p.dias == null ? '—' : num(p.dias)}</td><td>${sit(p.situacao)}${p.divergencias?.length ? `<br><small>mudou: ${esc(p.divergencias.join(', '))}</small>` : ''}</td></tr>`).join('')
        : '<tr><td colspan="11" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhuma pré-nota. Elas entram pela planilha do ERP (Importação do ERP).</td></tr>'}
      </tbody></table></div>
      <p style="font-size:12px; color:var(--texto-fraco);">Faturadas: "Dias" é do pedido até a nota. Esperando: "Dias" é desde o pedido (ou desde que a planilha chegou). A comparação completa está no relatório 87 (Controle operacional).</p>`;
    ligar(st, desenharPrenotas);
  }
})();
