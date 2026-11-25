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
  const COR = { 'Aguardando nota': 'pendente', 'Em separação': 'ocorrencia', 'Em conferência': 'ocorrencia', Separado: 'em_transito', Faturado: 'em_transito', 'Em embarque': 'em_transito', 'Coleta pedida': 'em_transito', 'Coletado / em trânsito': 'em_transito', Entregue: 'entregue', Cancelado: 'cancelado',
    'A faturar': 'pendente', 'Parada sem faturar': 'ocorrencia', 'NF sem XML': 'ocorrencia', 'Faturada, confere': 'entregue', 'Faturada, mudou': 'cancelado', 'Cancelada no ERP': 'cancelado' };
  const sit = (s) => `<span class="oc-sit ${COR[s] || ''}">${esc(s)}</span>`;
  let aba = 'pedidos'; const estado = { pedidos: { situacao: '', busca: '', de: '', ate: '' }, prenotas: { situacao: '', busca: '' } };

  document.querySelectorAll('[data-pd-aba]').forEach((a) => a.addEventListener('click', () => { aba = a.dataset.pdAba; document.querySelectorAll('[data-pd-aba]').forEach((x) => x.classList.toggle('ativo', x === a)); carregar().catch(erro); }));
  nav.addEventListener('click', () => carregar().catch(erro));
  const carregar = () => (aba === 'prenotas' ? desenharPrenotas() : desenharPedidos());
  const chips = (d, st, recarregar) => `<div style="display:flex; gap:6px; flex-wrap:wrap;"><button class="btn btn-secundario" style="width:auto;${!st.situacao ? ' outline:2px solid var(--azul);' : ''}" data-pd-sit="">Todos</button>
    ${d.situacoes.filter((s) => d.contagem[s] || s === st.situacao).map((s) => `<button class="btn btn-secundario" style="width:auto;${s === st.situacao ? ' outline:2px solid var(--azul);' : ''}" data-pd-sit="${esc(s)}">${esc(s)} <b>${d.contagem[s]}</b></button>`).join('')}</div>`;
  const ligar = (st, recarregar) => {
    cont.querySelectorAll('[data-pd-sit]').forEach((b) => b.addEventListener('click', () => { st.situacao = b.dataset.pdSit; recarregar().catch(erro); }));
    let t = null; $('pdBusca')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.busca = e.target.value; recarregar().catch(erro); }, 400); });
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
  function tabelaPedidos(d) {
    if (visao === 'resumida') return `<div class="painel nf-rolagem-painel" style="margin-top:10px;"><div class="nf-rolagem" style="max-height:calc(100vh - 240px);"><table class="tabela" style="font-size:12.5px; width:100%;"><thead><tr>
        <th>Pedido</th><th>Situação</th><th>Cliente</th><th>Liberação / expedição</th><th>Peso / cub.</th><th>Status WMS</th><th>Etiquetas / separação</th><th>NF-e</th></tr></thead><tbody>
      ${d.pedidos.length ? d.pedidos.slice(0, 1000).map((p) => `<tr>
        <td><b>${esc(p.pedido)}</b>${p.pedido_cliente ? fraco(`Mercus ${esc(p.pedido_cliente)}`) : ''}</td>
        <td style="white-space:nowrap;">${sit(p.situacao)}${p.embarque_id ? fraco(`embarque ${p.embarque_id}`) : ''}${p.ordem_id ? fraco(`ordem ${p.ordem_id}`) : ''}${p.data_entrega ? fraco(dia(p.data_entrega)) : ''}</td>
        <td style="max-width:220px; min-width:200px; white-space:normal;">${esc(p.cliente || '—')}${fraco([p.nome_curto, cnpjF(p.cnpj)].filter(Boolean).map(esc).join(' · ') || '&nbsp;')}</td>
        <td style="white-space:nowrap;">${dh(p.liberado_em || p.data_pedido)}${p.situacao === 'Aguardando nota' && p.dias > 3 ? ` <small class="pa-alerta">${p.dias} d</small>` : ''}${fraco(esc(p.expedicao || '—'))}</td>
        <td style="white-space:nowrap;">${num(p.peso, 1)} kg${fraco(p.cubagem == null ? '—' : `${num(p.cubagem, 3)} m³`)}</td>
        <td>${esc(p.status_wms || '—')}${p.conferencia_pct != null ? ` <small>${num(p.conferencia_pct, 0)}% conf.</small>` : ''}${p.data_inicial || p.usuario || p.exp_wms ? fraco([p.exp_wms ? `exp. ${esc(p.exp_wms)}` : '', p.data_inicial ? `desde ${dh(p.data_inicial)}` : '', p.usuario ? `👤 ${esc(p.usuario)}` : ''].filter(Boolean).join(' · ')) : ''}${p.placa || p.motorista ? fraco(`🚚 ${[p.placa, p.motorista].filter(Boolean).map(esc).join(' · ')}`) : ''}${p.cancelado_wms ? '<br><span class="oc-sit cancelado">cancelado no WMS</span>' : ''}</td>
        <td style="white-space:nowrap;">${[
          p.qtd_etiquetas != null ? `${num(p.qtd_etiquetas)} etq.${p.etiquetas_em ? ` · ${dh(p.etiquetas_em)}` : ''}` : '',
          p.sep_inicio ? `separação ${dh(p.sep_inicio)}${p.sep_fim ? ` → ${String(p.sep_fim).slice(11, 16)}${p.sep_minutos != null ? ` (${duracao(p.sep_minutos)})` : ''}` : ' (em andamento)'}` : '',
          !p.sep_inicio && p.exp_fim ? `fim ${dh(p.exp_fim)}` : '',
        ].filter(Boolean).map((t, i) => (i ? fraco(t) : t)).join('') || '—'}</td>
        <td style="white-space:nowrap;">${p.id && p.nf ? `<a href="#" data-pd-nota="${p.id}">${esc(p.nf)}</a>${fraco(dia(p.emissao_nf))}` : esc(p.nf || '—')}</td>
        </tr>`).join('')
        : '<tr><td colspan="8" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum pedido no período. Os pedidos entram pela planilha do ERP (Timeline de pedidos).</td></tr>'}
      </tbody></table></div>${d.pedidos.length > 1000 ? '<p style="font-size:12px; padding:6px 10px; margin:0;">Mostrando os 1.000 mais recentes (o Excel leva todos).</p>' : ''}</div>`;
    const sim = (b) => (b == null ? '—' : b ? 'S' : 'N');
    return `<div class="painel nf-rolagem-painel" style="margin-top:10px;"><div class="nf-rolagem" style="max-height:calc(100vh - 240px);"><table class="tabela" style="font-size:12.5px;"><thead><tr>
        <th style="position:sticky; left:0; z-index:3; background:var(--bg-card); box-shadow:inset -1px -1px 0 var(--borda);">Número Pedido</th><th>Situação</th><th>CNPJ</th><th>Cliente</th><th>Nome Curto</th><th>Pedido Mercus</th><th>Liberação</th><th>Peso</th><th>Cubagem</th>
        <th>Status/WMS</th><th>Data Inicial</th><th>Expedição</th><th>Usuário</th><th>Data/Imp. Etq</th><th>Qtd. Etiquetas</th><th>Data Início</th><th>Data Finalização</th>
        <th>Cancelado Wms</th><th>Nota Fiscal</th><th>Data de Emissão</th></tr></thead><tbody>
      ${d.pedidos.length ? d.pedidos.slice(0, 1000).map((p) => `<tr>
        <td style="white-space:nowrap; position:sticky; left:0; z-index:1; background:var(--bg-card); box-shadow:inset -1px 0 0 var(--borda);"><b>${esc(p.pedido)}</b></td>${nw(sit(p.situacao))}${nw(esc(cnpjF(p.cnpj) || '—'))}
        <td style="min-width:200px; max-width:260px; white-space:normal;">${esc(p.cliente || '—')}</td>
        ${nw(esc(p.nome_curto || '—'))}${nw(esc(p.pedido_cliente || '—'))}
        ${nw(`${dh(p.liberado_em || p.data_pedido)}${p.situacao === 'Aguardando nota' && p.dias > 3 ? ` <small class="pa-alerta">${p.dias} d</small>` : ''}`)}
        ${nw(p.peso == null ? '—' : `${num(p.peso, 1)} kg`)}${nw(p.cubagem == null ? '—' : `${num(p.cubagem, 3)} m³`)}
        ${nw(`${esc(p.status_wms || '—')}${p.conferencia_pct != null ? ` <small>${num(p.conferencia_pct, 0)}%</small>` : ''}`)}${nw(dh(p.data_inicial))}${nw(esc(p.expedicao || '—'))}
        ${nw(esc(p.usuario || '—'))}${nw(dh(p.etiquetas_em))}${nw(p.qtd_etiquetas == null ? '—' : num(p.qtd_etiquetas))}${nw(dh(p.sep_inicio))}${nw(dh(p.sep_fim))}
        ${nw(p.tem_wms ? (p.cancelado_wms ? '<span class="oc-sit cancelado">S</span>' : 'N') : '—')}
        ${nw(p.id && p.nf ? `<a href="#" data-pd-nota="${p.id}">${esc(p.nf)}</a>` : esc(p.nf || '—'))}${nw(dia(p.emissao_nf))}</tr>`).join('')
        : '<tr><td colspan="20" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum pedido no período. Os pedidos entram pela planilha do ERP (Timeline de pedidos).</td></tr>'}
      </tbody></table></div>${d.pedidos.length > 1000 ? '<p style="font-size:12px; padding:6px 10px; margin:0;">Mostrando os 1.000 mais recentes (o Excel leva todos).</p>' : ''}</div>`;
  }

  async function desenharPedidos() {
    const st = estado.pedidos;
    const d = await api(`/?${new URLSearchParams({ situacao: st.situacao, busca: st.busca, de: st.de, ate: st.ate })}`);
    const r = d.resumo;
    ultimaLista = d.pedidos;
    cont.innerHTML = `<div class="nf-resumo">
        <div>Pedidos no período<b>${num(r.pedidos)}</b><span>${num(r.peso, 1)} kg${r.etiquetas ? ` · ${num(r.etiquetas)} etiquetas` : ''}</span></div>
        <div>Aguardando nota<b>${num(r.aguardando_nota)}</b><span>${r.aguardando_mais_dias ? `${r.aguardando_mais_dias} há mais de 3 dias` : 'ainda não separados'}</span></div>
        <div>Em separação / conferência<b>${num(r.em_separacao)}</b><span>no WMS</span></div>
        <div>Separados<b>${num(r.separados)}</b><span>esperando a nota</span></div>
        <div>Faturados<b>${num(d.contagem.Faturado + d.contagem['Em embarque'] + d.contagem['Coleta pedida'])}</b><span>ainda não saíram</span></div>
        <div>Em trânsito / entregues<b>${num(d.contagem['Coletado / em trânsito'] + d.contagem.Entregue)}</b><span>${num(d.contagem.Entregue)} entregues</span></div></div>
      <div id="pdWmsSit" style="font-size:12.5px; color:var(--texto-fraco); margin-top:8px;"></div>
      ${r.com_wms ? '' : `<p class="cte-aviso" style="margin-top:10px;">Os campos do WMS ainda estão vazios: ligue a consulta automática em "Ligação com o WMS" ou importe a planilha do WMS.</p>`}
      <div class="pa-topo" style="margin-top:12px;">${chips(d, st)}<span style="flex:1;"></span>
        <label style="font-size:13px;">De <input type="date" id="pdDe" value="${esc(d.de)}"></label><label style="font-size:13px;">até <input type="date" id="pdAte" value="${esc(d.ate)}"></label>
        <input id="pdBusca" placeholder="Pedido, cliente, NF, usuário" value="${esc(st.busca)}" style="max-width:220px;">
        ${podeImportar() ? '<button class="btn btn-secundario" id="pdWmsAgora" style="width:auto;" title="Consulta o WMS agora (no máximo 1 vez a cada 2 minutos)">⟳ Atualizar do WMS</button>' : ''}
        ${podeImportar() ? '<button class="btn btn-secundario" id="pdWms" style="width:auto;" title="Planilha exportada do WMS com Número Pedido, Status/WMS, Data Inicial, Usuário, Data/Imp. Etq, Qtd. Etiquetas, Data Início, Data Finalização e Cancelado Wms">⬆ Planilha do WMS</button><input type="file" id="pdWmsArq" accept=".xlsx,.xls,.csv" class="oculto">' : ''}
        <span style="display:inline-flex; border:1px solid var(--borda); border-radius:8px; overflow:hidden;" title="Planilha: cada campo numa coluna, como a planilha de pedidos. Resumida: campos agrupados, cabe na tela.">
          <button class="btn btn-secundario" data-pd-visao="planilha" style="width:auto; border:0; border-radius:0;${visao === 'planilha' ? ' background:var(--azul); color:#fff;' : ''}">▦ Planilha</button>
          <button class="btn btn-secundario" data-pd-visao="resumida" style="width:auto; border:0; border-radius:0;${visao === 'resumida' ? ' background:var(--azul); color:#fff;' : ''}">☰ Resumida</button></span>
        <button class="btn btn-secundario" id="pdExcel" style="width:auto;">⬇ Excel</button>
        ${usuario?.perfil === 'admin' ? '<button class="btn btn-secundario" id="pdWmsCfg" style="width:auto;" title="Endereço, usuário e senha do WMS e o teste da conexão">⚙ Ligação com o WMS</button>' : ''}</div>
      <div id="pdWmsRes" style="font-size:12.5px; margin-top:6px;"></div>
      ${tabelaPedidos(d)}`;
    ligar(st, desenharPedidos);
    ajustarRolagem();
    cont.querySelectorAll('[data-pd-visao]').forEach((b) => b.addEventListener('click', () => { visao = b.dataset.pdVisao; try { localStorage.setItem('nexofretePedidosVisao', visao); } catch (e) { /* sem armazenamento */ } desenharPedidos().catch(erro); }));
    ['pdDe', 'pdAte'].forEach((id) => $(id).addEventListener('change', () => { st.de = $('pdDe').value; st.ate = $('pdAte').value; desenharPedidos().catch(erro); }));
    $('pdExcel').addEventListener('click', () => {
      window.exportarExcel?.(`pedidos-${d.de}-a-${d.ate}`, [{ nome: 'Pedidos', colunas: ['Número Pedido', 'CNPJ', 'Cliente', 'Nome Curto', 'Pedido Mercus', 'Liberação', 'Peso (kg)', 'Cubagem (m³)',
        'Status/WMS', 'Data Inicial', 'Expedição', 'Usuário', 'Data/Imp. Etq', 'Qtd. Etiquetas', 'Data Início', 'Data Finalização', 'Cancelado Wms', 'Nota Fiscal', 'Data de Emissão',
        'Situação', 'Destino', 'Transportadora', 'CT-e', 'Expedição WMS', 'Tipo Pedido', 'Placa', 'Motorista', 'Itinerário', 'Data Final (WMS)', '% Conferência', 'Imprimir'],
      linhas: ultimaLista.map((p) => [p.pedido, cnpjF(p.cnpj), p.cliente || '', p.nome_curto || '', p.pedido_cliente || '', dh(p.liberado_em || p.data_pedido).replace('—', ''), p.peso, p.cubagem,
        p.status_wms || '', dh(p.data_inicial).replace('—', ''), p.expedicao || '', p.usuario || '', dh(p.etiquetas_em).replace('—', ''), p.qtd_etiquetas, dh(p.sep_inicio).replace('—', ''),
        dh(p.sep_fim).replace('—', ''), p.cancelado_wms ? 'S' : (p.tem_wms ? 'N' : ''), p.nf || '', p.emissao_nf ? dia(p.emissao_nf) : '', p.situacao, p.destino || '', p.transportadora || '', p.numero_cte || '',
        p.exp_wms || '', p.tipo_pedido || '', p.placa || '', p.motorista || '', p.itinerario || '', dh(p.exp_fim).replace('—', ''), p.conferencia_pct, p.imprimir == null ? '' : (p.imprimir ? 'SIM' : 'NÃO')])}]).catch(erro);
    });
    $('pdWmsCfg')?.addEventListener('click', () => abrirWms().catch(erro));
    // Situação da consulta ao WMS e o "Atualizar do WMS".
    apiFetch('/api/wms/situacao').then((x) => x.json()).then((w) => {
      const el = $('pdWmsSit'); if (!el || !w?.configurado) return;
      el.style.cssText = 'font-size:12.5px; margin-top:8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; color:var(--texto-fraco);';
      el.innerHTML = `<span>WMS: ${w.ativo ? `<span style="color:var(--verde);">● integração ligada</span> (consulta a cada ${w.intervalo_min} min, das ${w.hora_inicio}h às ${w.hora_fim}h)` : '<span style="color:var(--vermelho);">● integração pausada</span> (o Nexofrete não consulta o WMS)'}`
        + (w.ultima_consulta_em ? ` · última: ${dh(w.ultima_consulta_em)} ${w.ultima_consulta_ok ? '<span style="color:var(--verde);">✓</span>' : `<span style="color:var(--vermelho);">✗ ${esc(w.ultima_consulta_msg || '')}</span>`}` : '') + '</span>'
        + (podeImportar() ? (w.ativo
          ? '<button class="btn btn-secundario" id="pdWmsPausar" style="width:auto; padding:4px 10px; font-size:12px; border-color:var(--vermelho); color:var(--vermelho);" title="Para na hora a consulta automática e o Atualizar do WMS">Pausar integração</button>'
          : '<button class="btn btn-secundario" id="pdWmsPausar" style="width:auto; padding:4px 10px; font-size:12px;" title="Volta a consultar o WMS no intervalo configurado">Retomar integração</button>') : '');
      const agora = $('pdWmsAgora');
      if (agora && !w.ativo) { agora.disabled = true; agora.title = 'A integração com o WMS está pausada'; }
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
    $('pdWmsAgora')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; const t0 = b.textContent; b.textContent = 'Consultando o WMS...';
      try {
        const r2 = await apiFetch('/api/wms/consultar', { method: 'POST' });
        const j = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j.erro || 'Erro ao consultar o WMS.');
        await desenharPedidos();
        mostrarAlerta(`WMS: ${j.msg}`, { tipo: j.incompleto ? 'aviso' : 'sucesso' });
      } catch (err) { erro(err); b.disabled = false; b.textContent = t0; }
    });
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
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-top:6px; font-size:13px;">
          <label>A cada<select id="wmsIntervalo" style="display:block; width:100%; margin-top:3px;">${[30, 60, 120, 240].map((m) => `<option value="${m}" ${Number(c.intervalo_min || 60) === m ? 'selected' : ''}>${m < 60 ? `${m} min` : `${m / 60} h`}</option>`).join('')}</select></label>
          <label>Das (hora)<input id="wmsHoraIni" type="number" min="0" max="23" value="${c.hora_inicio ?? 7}" style="display:block; width:100%; margin-top:3px;"></label>
          <label>Até (hora)<input id="wmsHoraFim" type="number" min="1" max="24" value="${c.hora_fim ?? 19}" style="display:block; width:100%; margin-top:3px;"></label>
          <label>Dias para trás<input id="wmsDias" type="number" min="1" max="31" value="${c.dias ?? 7}" style="display:block; width:100%; margin-top:3px;"></label></div>
        <p style="font-size:12px; color:var(--texto-fraco); margin:6px 0 0;">Uma busca por período (Data Inicial da expedição) na tela Expedição Mercadorias, como uma pessoa clicando em Buscar. Depois de uma falha, espera o dobro do intervalo.
          ${c.ultima_consulta_em ? `Última consulta: ${dh(c.ultima_consulta_em)} — ${c.ultima_consulta_ok ? 'ok' : 'falhou'}: ${esc(c.ultima_consulta_msg || '')}` : ''}</p>
        <button class="btn btn-secundario" id="wmsConsultar" style="width:auto; margin-top:8px;">⟳ Salvar e consultar agora</button></fieldset>
      <p style="font-size:12px; color:var(--texto-fraco);">A senha é guardada criptografada e não aparece de novo para ninguém.${c.ultimo_teste_em ? ` Último teste: ${dh(String(c.ultimo_teste_em).replace('T', ' '))} — ${c.ultimo_teste_ok ? 'respondeu' : 'falhou'}.` : ''}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-primario" id="wmsSalvar" style="width:auto;">Salvar</button>
        <button class="btn btn-secundario" id="wmsTestar" style="width:auto;">🔌 Salvar e testar conexão</button>
        <button class="btn btn-secundario" id="wmsTestarTela" style="width:auto;" title="Faz o login no WMS e abre a tela Expedição Mercadorias">🔐 Testar login e tela de expedição</button></div>
      <div id="wmsRes" style="margin-top:12px;"></div>`;
    const salvar = () => pedir('/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: $('wmsUrl').value, usuario: $('wmsUsuario').value, senha: $('wmsSenha').value, url_expedicao: $('wmsTela').value,
      ativo: $('wmsAtivo').checked, intervalo_min: $('wmsIntervalo').value, hora_inicio: $('wmsHoraIni').value, hora_fim: $('wmsHoraFim').value, dias: $('wmsDias').value }) });
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
      <div class="pa-topo" style="margin-top:12px;">${chips(d, st)}<span style="flex:1;"></span><input id="pdBusca" placeholder="Pedido, cliente, NF, cidade" value="${esc(st.busca)}" style="max-width:240px;"></div>
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
