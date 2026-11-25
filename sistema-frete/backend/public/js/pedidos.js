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
  const COR = { 'Aguardando nota': 'pendente', 'Em separação': 'ocorrencia', Separado: 'em_transito', Faturado: 'em_transito', 'Em embarque': 'em_transito', 'Coleta pedida': 'em_transito', 'Coletado / em trânsito': 'em_transito', Entregue: 'entregue', Cancelado: 'cancelado',
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

  async function desenharPedidos() {
    const st = estado.pedidos;
    const d = await api(`/?${new URLSearchParams({ situacao: st.situacao, busca: st.busca, de: st.de, ate: st.ate })}`);
    const r = d.resumo;
    ultimaLista = d.pedidos;
    cont.innerHTML = `<div class="nf-resumo">
        <div>Pedidos no período<b>${num(r.pedidos)}</b><span>${num(r.peso, 1)} kg${r.etiquetas ? ` · ${num(r.etiquetas)} etiquetas` : ''}</span></div>
        <div>Aguardando nota<b>${num(r.aguardando_nota)}</b><span>${r.aguardando_mais_dias ? `${r.aguardando_mais_dias} há mais de 3 dias` : 'ainda não separados'}</span></div>
        <div>Em separação<b>${num(r.em_separacao)}</b><span>no WMS</span></div>
        <div>Separados<b>${num(r.separados)}</b><span>esperando a nota</span></div>
        <div>Faturados<b>${num(d.contagem.Faturado + d.contagem['Em embarque'] + d.contagem['Coleta pedida'])}</b><span>ainda não saíram</span></div>
        <div>Em trânsito / entregues<b>${num(d.contagem['Coletado / em trânsito'] + d.contagem.Entregue)}</b><span>${num(d.contagem.Entregue)} entregues</span></div></div>
      ${r.com_wms ? '' : `<p class="cte-aviso" style="margin-top:10px;">Os campos do WMS (status, data inicial, usuário, etiquetas, separação e cancelamento) ainda estão vazios: importe a planilha do WMS no botão "Planilha do WMS".</p>`}
      <div class="pa-topo" style="margin-top:12px;">${chips(d, st)}<span style="flex:1;"></span>
        <label style="font-size:13px;">De <input type="date" id="pdDe" value="${esc(d.de)}"></label><label style="font-size:13px;">até <input type="date" id="pdAte" value="${esc(d.ate)}"></label>
        <input id="pdBusca" placeholder="Pedido, cliente, NF, usuário" value="${esc(st.busca)}" style="max-width:220px;">
        ${podeImportar() ? '<button class="btn btn-secundario" id="pdWms" style="width:auto;" title="Planilha exportada do WMS com Número Pedido, Status/WMS, Data Inicial, Usuário, Data/Imp. Etq, Qtd. Etiquetas, Data Início, Data Finalização e Cancelado Wms">⬆ Planilha do WMS</button><input type="file" id="pdWmsArq" accept=".xlsx,.xls,.csv" class="oculto">' : ''}
        <button class="btn btn-secundario" id="pdExcel" style="width:auto;">⬇ Excel</button>
        ${usuario?.perfil === 'admin' ? '<button class="btn btn-secundario" id="pdWmsCfg" style="width:auto;" title="Endereço, usuário e senha do WMS e o teste da conexão">⚙ Ligação com o WMS</button>' : ''}</div>
      <div id="pdWmsRes" style="font-size:12.5px; margin-top:6px;"></div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:10px;"><table class="tabela" style="font-size:12.5px;"><thead><tr>
        <th>Pedido</th><th>Situação</th><th>Cliente</th><th>Liberação / expedição</th><th>Peso / cub.</th><th>Status WMS</th><th>Etiquetas</th><th>Separação</th><th>NF-e</th></tr></thead><tbody>
      ${d.pedidos.length ? d.pedidos.slice(0, 1000).map((p) => `<tr>
        <td><b>${esc(p.pedido)}</b>${p.pedido_cliente ? fraco(`Mercus ${esc(p.pedido_cliente)}`) : ''}</td>
        <td style="white-space:nowrap;">${sit(p.situacao)}${p.embarque_id ? fraco(`embarque ${p.embarque_id}`) : ''}${p.ordem_id ? fraco(`ordem ${p.ordem_id}`) : ''}${p.data_entrega ? fraco(dia(p.data_entrega)) : ''}</td>
        <td style="max-width:220px; min-width:200px; white-space:normal;">${esc(p.cliente || '—')}${fraco([p.nome_curto, cnpjF(p.cnpj)].filter(Boolean).map(esc).join(' · ') || '&nbsp;')}</td>
        <td style="white-space:nowrap;">${dh(p.liberado_em || p.data_pedido)}${p.situacao === 'Aguardando nota' && p.dias > 3 ? ` <small class="pa-alerta">${p.dias} d</small>` : ''}${fraco(esc(p.expedicao || '—'))}</td>
        <td style="white-space:nowrap;">${num(p.peso, 1)} kg${fraco(p.cubagem == null ? '—' : `${num(p.cubagem, 3)} m³`)}</td>
        <td>${esc(p.status_wms || '—')}${p.data_inicial || p.usuario ? fraco([p.data_inicial ? `desde ${dh(p.data_inicial)}` : '', p.usuario ? `👤 ${esc(p.usuario)}` : ''].filter(Boolean).join(' · ')) : ''}${p.cancelado_wms ? '<br><span class="oc-sit cancelado">cancelado no WMS</span>' : ''}</td>
        <td style="white-space:nowrap;">${p.qtd_etiquetas == null ? '—' : `${num(p.qtd_etiquetas)} etq.`}${p.etiquetas_em ? fraco(`impressas ${dh(p.etiquetas_em)}`) : ''}</td>
        <td style="white-space:nowrap;">${p.sep_inicio ? `${dh(p.sep_inicio)}${fraco(p.sep_fim ? `até ${dh(p.sep_fim)}${p.sep_minutos != null ? ` (${duracao(p.sep_minutos)})` : ''}` : 'em andamento')}` : '—'}</td>
        <td style="white-space:nowrap;">${p.id && p.nf ? `<a href="#" data-pd-nota="${p.id}">${esc(p.nf)}</a>${fraco(dia(p.emissao_nf))}` : esc(p.nf || '—')}</td>
        </tr>`).join('')
        : '<tr><td colspan="9" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum pedido no período. Os pedidos entram pela planilha do ERP (Timeline de pedidos).</td></tr>'}
      </tbody></table>${d.pedidos.length > 1000 ? '<p style="font-size:12px; padding:0 10px;">Mostrando os 1.000 mais recentes (o Excel leva todos).</p>' : ''}</div>`;
    ligar(st, desenharPedidos);
    ['pdDe', 'pdAte'].forEach((id) => $(id).addEventListener('change', () => { st.de = $('pdDe').value; st.ate = $('pdAte').value; desenharPedidos().catch(erro); }));
    $('pdExcel').addEventListener('click', () => {
      window.exportarExcel?.(`pedidos-${d.de}-a-${d.ate}`, [{ nome: 'Pedidos', colunas: ['Número Pedido', 'CNPJ', 'Cliente', 'Nome Curto', 'Pedido Mercus', 'Liberação', 'Peso (kg)', 'Cubagem (m³)',
        'Status/WMS', 'Data Inicial', 'Expedição', 'Usuário', 'Data/Imp. Etq', 'Qtd. Etiquetas', 'Data Início', 'Data Finalização', 'Cancelado Wms', 'Nota Fiscal', 'Data de Emissão',
        'Situação', 'Destino', 'Transportadora', 'CT-e'],
      linhas: ultimaLista.map((p) => [p.pedido, cnpjF(p.cnpj), p.cliente || '', p.nome_curto || '', p.pedido_cliente || '', dh(p.liberado_em || p.data_pedido).replace('—', ''), p.peso, p.cubagem,
        p.status_wms || '', dh(p.data_inicial).replace('—', ''), p.expedicao || '', p.usuario || '', dh(p.etiquetas_em).replace('—', ''), p.qtd_etiquetas, dh(p.sep_inicio).replace('—', ''),
        dh(p.sep_fim).replace('—', ''), p.cancelado_wms ? 'S' : (p.tem_wms ? 'N' : ''), p.nf || '', p.emissao_nf ? dia(p.emissao_nf) : '', p.situacao, p.destino || '', p.transportadora || '', p.numero_cte || ''])}]).catch(erro);
    });
    $('pdWmsCfg')?.addEventListener('click', () => abrirWms().catch(erro));
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
      <p style="font-size:12.5px; color:var(--texto-fraco); margin-top:0;">O Nexofrete vai consultar o WMS sozinho (só leitura) para preencher status, expedição, conferência, placa e motorista dos pedidos.
        Esta primeira etapa guarda o acesso e testa a conexão a partir do servidor (o WMS fica na rede da empresa). Use um <b>usuário só de consulta</b>, criado para o Nexofrete.</p>
      <label style="display:block; font-size:13px;">Endereço do WMS<input style="display:block; width:100%; margin-top:3px;" id="wmsUrl" value="${esc(c.url || '')}" placeholder="http://10.150.15.66/auth/login"></label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <label style="display:block; font-size:13px; margin-top:8px;">Usuário<input style="display:block; width:100%; margin-top:3px;" id="wmsUsuario" value="${esc(c.usuario || '')}" autocomplete="off"></label>
        <label style="display:block; font-size:13px; margin-top:8px;">Senha<input style="display:block; width:100%; margin-top:3px;" id="wmsSenha" type="password" autocomplete="new-password" placeholder="${c.tem_senha ? 'senha cadastrada (deixe em branco para manter)' : ''}"></label></div>
      <label style="display:block; font-size:13px; margin-top:8px;">Endereço da tela Expedição Mercadorias <small style="color:var(--texto-fraco);">(no navegador, abra a tela, busque uma Carga e copie o endereço da barra)</small>
        <input style="display:block; width:100%; margin-top:3px;" id="wmsTela" value="${esc(c.url_expedicao || '')}" placeholder="http://10.150.15.66/..."></label>
      <p style="font-size:12px; color:var(--texto-fraco);">A senha é guardada criptografada e não aparece de novo para ninguém.${c.ultimo_teste_em ? ` Último teste: ${dh(String(c.ultimo_teste_em).replace('T', ' '))} — ${c.ultimo_teste_ok ? 'respondeu' : 'falhou'}.` : ''}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-primario" id="wmsSalvar" style="width:auto;">Salvar</button>
        <button class="btn btn-secundario" id="wmsTestar" style="width:auto;">🔌 Salvar e testar conexão</button>
        <button class="btn btn-secundario" id="wmsTestarTela" style="width:auto;" title="Faz o login no WMS e abre a tela Expedição Mercadorias">🔐 Testar login e tela de expedição</button></div>
      <div id="wmsRes" style="margin-top:12px;"></div>`;
    const salvar = () => pedir('/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: $('wmsUrl').value, usuario: $('wmsUsuario').value, senha: $('wmsSenha').value, url_expedicao: $('wmsTela').value }) });
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
