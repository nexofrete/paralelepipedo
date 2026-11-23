// =====================================================================
// Pedidos (405) e Pré-notas fiscais (406), fretes contratados (regras em src/pedidos.js): os pedidos da planilha do
// ERP com a situação até a entrega, e as pré-notas (o pedido antes da NF-e) esperando faturamento ou já faturadas.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta; abre a nota com window.abrirNotaDetalhe (js/notasFiscais.js).
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
  const COR = { 'Aguardando nota': 'pendente', Faturado: 'em_transito', 'Em embarque': 'em_transito', 'Coleta pedida': 'em_transito', 'Coletado / em trânsito': 'em_transito', Entregue: 'entregue', Cancelado: 'cancelado',
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

  async function desenharPedidos() {
    const st = estado.pedidos;
    const d = await api(`/?${new URLSearchParams({ situacao: st.situacao, busca: st.busca, de: st.de, ate: st.ate })}`);
    const r = d.resumo;
    cont.innerHTML = `<div class="nf-resumo">
        <div>Pedidos no período<b>${num(r.pedidos)}</b><span>${moeda(r.valor)} · ${num(r.peso, 1)} kg</span></div>
        <div>Aguardando nota<b>${num(r.aguardando_nota)}</b><span>${r.aguardando_mais_dias ? `${r.aguardando_mais_dias} há mais de 3 dias` : '&nbsp;'}</span></div>
        <div>Faturados<b>${num(d.contagem.Faturado)}</b><span>sem embarque nem coleta pedida</span></div>
        <div>Em embarque / coleta pedida<b>${num(d.contagem['Em embarque'] + d.contagem['Coleta pedida'])}</b><span>&nbsp;</span></div>
        <div>Em trânsito<b>${num(d.contagem['Coletado / em trânsito'])}</b><span>&nbsp;</span></div>
        <div>Entregues<b>${num(d.contagem.Entregue)}</b><span>&nbsp;</span></div></div>
      <div class="pa-topo" style="margin-top:12px;">${chips(d, st)}<span style="flex:1;"></span>
        <label style="font-size:13px;">De <input type="date" id="pdDe" value="${esc(d.de)}"></label><label style="font-size:13px;">até <input type="date" id="pdAte" value="${esc(d.ate)}"></label>
        <input id="pdBusca" placeholder="Pedido, cliente, NF, cidade" value="${esc(st.busca)}" style="max-width:240px;"></div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:10px;"><table class="tabela"><thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Destino</th><th>Vol.</th><th>Peso</th><th>Valor</th><th>Transportadora</th><th>NF-e</th><th>CT-e</th><th>Situação</th></tr></thead><tbody>
      ${d.pedidos.length ? d.pedidos.slice(0, 1000).map((p) => `<tr><td><b>${esc(p.pedido)}</b>${p.pedido_cliente ? `<br><small style="color:var(--texto-fraco);">cliente: ${esc(p.pedido_cliente)}</small>` : ''}</td>
        <td>${dia(p.data_pedido)}${p.situacao === 'Aguardando nota' && p.dias > 3 ? ` <small class="pa-alerta">${p.dias} d</small>` : ''}</td><td>${esc(p.cliente)}</td><td>${esc(p.destino)}</td><td>${num(p.volumes)}</td><td>${num(p.peso, 1)}</td><td>${moeda(p.valor)}</td>
        <td>${esc(p.transportadora || '—')}</td><td>${p.id && p.nf ? `<a href="#" data-pd-nota="${p.id}">${esc(p.nf)}</a><br><small>${dia(p.emissao_nf)}</small>` : esc(p.nf || '—')}</td><td>${esc(p.numero_cte || '—')}</td>
        <td>${sit(p.situacao)}${p.embarque_id ? `<br><small>embarque ${p.embarque_id}</small>` : ''}${p.ordem_id ? `<br><small>ordem ${p.ordem_id}</small>` : ''}${p.data_entrega ? `<br><small>${dia(p.data_entrega)}</small>` : ''}</td></tr>`).join('')
        : '<tr><td colspan="11" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum pedido no período. Os pedidos entram pela planilha do ERP (Importação do ERP).</td></tr>'}
      </tbody></table>${d.pedidos.length > 1000 ? '<p style="font-size:12px; padding:0 10px;">Mostrando os 1.000 mais recentes.</p>' : ''}</div>`;
    ligar(st, desenharPedidos);
    ['pdDe', 'pdAte'].forEach((id) => $(id).addEventListener('change', () => { st.de = $('pdDe').value; st.ate = $('pdAte').value; desenharPedidos().catch(erro); }));
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
