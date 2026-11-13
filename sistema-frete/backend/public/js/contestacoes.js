// =====================================================================
// Auditoria de Frete » 📨 Contestações: um e-mail por transportadora com todas
// as cobranças acima da tabela do período (planilha anexa), a resposta item a
// item (aceito / recusado) e o crédito que cai sozinho na próxima fatura.
// Aba "Glosas por motivo": o que mais gera glosa, por transportadora.
// Usa do dashboard.js: apiFetch, mostrarAlerta, confirmar, podeAprovarPagamento.
// Servidor: src/contestacoes.js, rotas /api/contestacoes.
// =====================================================================
(() => {
  const botao = document.getElementById('btnContestacoes');
  const modal = document.getElementById('modalContestacoes');
  if (!botao || !modal) return;
  const caixa = document.getElementById('ctConteudo');
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const num = (v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
  const pode = typeof podeAprovarPagamento !== 'undefined' && podeAprovarPagamento;
  const COR = { rascunho: '#6b7280', enviada: '#2563eb', aceita: '#16a34a', parcial: '#ca8a04', recusada: '#dc2626', abatida: '#0d9488', cancelada: '#9ca3af' };
  let MOTIVOS = {}; let SITUACOES = {};
  let aba = 'lista';
  const selo = (st) => `<span class="ct-selo" style="--c:${COR[st] || '#6b7280'}">${esc(SITUACOES[st] || st)}</span>`;
  const json = async (url, op) => {
    const r = await apiFetch(url, op);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro.');
    return j;
  };
  const post = (url, corpo) => json(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('oculto') && !document.querySelector('.dlg-fundo')) fechar(); });

  const topo = (titulo, extra = '') => `<div class="ct-topo"><h3>${titulo}</h3><div style="display:flex; gap:8px; align-items:center;">${extra}<button class="btn btn-secundario" data-ct="fechar" style="width:auto;">✕</button></div></div>`;
  const abas = () => `<div class="cte-abas" style="margin-bottom:12px;"><div class="cte-aba ${aba === 'lista' ? 'ativo' : ''}" data-ct-aba="lista">📨 Contestações</div><div class="cte-aba ${aba === 'motivos' ? 'ativo' : ''}" data-ct-aba="motivos">📊 Glosas por motivo</div><div class="cte-aba ${aba === 'padroes' ? 'ativo' : ''}" data-ct-aba="padroes">🔁 Diferenças que se repetem</div><div class="cte-aba ${aba === 'resultado' ? 'ativo' : ''}" data-ct-aba="resultado">📈 Resultado</div></div>`;
  function ligarComuns() {
    caixa.querySelector('[data-ct="fechar"]')?.addEventListener('click', fechar);
    caixa.querySelectorAll('[data-ct-aba]').forEach((el) => el.addEventListener('click', () => { aba = el.dataset.ctAba; ({ lista, motivos, padroes, resultado }[aba])().catch(erro); }));
  }
  const erro = (e) => mostrarAlerta(e.message || String(e), { tipo: 'erro' });

  // ---------- Lista ----------
  async function lista() {
    caixa.innerHTML = `${topo('📨 Contestações de frete', pode ? '<button class="btn btn-primario" data-ct="nova" style="width:auto;">＋ Nova contestação</button>' : '')}${abas()}<div id="ctLista">Carregando…</div>`;
    ligarComuns();
    caixa.querySelector('[data-ct="nova"]')?.addEventListener('click', () => nova());
    const itens = await json('/api/contestacoes');
    const el = document.getElementById('ctLista');
    if (!itens.length) { el.innerHTML = '<p style="color:var(--texto-fraco);">Nenhuma contestação ainda. Clique em "Nova contestação", escolha a transportadora e o período: o sistema junta os CT-e cobrados acima da tabela.</p>'; return; }
    el.innerHTML = `<table class="ct-tabela"><thead><tr><th>Nº</th><th>Transportadora</th><th>Período</th><th class="n">CT-e</th><th class="n">Contestado</th><th class="n">Aceito</th><th>Situação</th><th>Enviada</th></tr></thead><tbody>
      ${itens.map((c) => `<tr data-ct-abrir="${c.id}" class="ct-linha"><td>${c.id}</td><td>${esc(c.transportadora)}</td><td>${c.de || c.ate ? `${dia(c.de)} a ${dia(c.ate)}` : '—'}</td><td class="n">${c.qtd}</td>
        <td class="n">${moeda(c.valor_contestado)}</td><td class="n">${c.valor_aceito != null ? moeda(c.valor_aceito) : '—'}</td>
        <td>${selo(c.status)}${c.status === 'enviada' && c.portal_respondida_em ? ' <span class="ct-selo" style="--c:#7c3aed">Respondida pelo link — confirmar</span>' : ''}${c.credito_pendente > 0 ? ` <span class="ct-dica" title="Aceito depois de faturado: abate na próxima fatura conferida">crédito ${moeda(c.credito_pendente)} a abater</span>` : ''}</td><td>${dia(c.enviada_em)}${c.dias_vencida != null ? `<br><span style="color:var(--vermelho); font-size:11.5px; font-weight:600;">sem resposta, prazo vencido há ${c.dias_vencida} dia(s)</span>` : c.status === 'enviada' && c.prazo_resposta ? `<br><span class="ct-dica">responder até ${dia(c.prazo_resposta)}</span>` : ''}</td></tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('[data-ct-abrir]').forEach((tr) => tr.addEventListener('click', () => detalhe(Number(tr.dataset.ctAbrir)).catch(erro)));
  }

  // ---------- Nova ----------
  function transportadoras() {
    const sel = document.getElementById('afFiltroTransportadora');
    return sel ? [...sel.options].map((o) => o.value).filter(Boolean) : [];
  }
  // pre: { transportadora, ids, de, ate, titulo } — vindo de um padrão de "Diferenças que se repetem".
  let soIds = null;
  async function nova(pre = null) {
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const ini = pre?.de || `${hoje.slice(0, 7)}-01`;
    const atual = pre?.transportadora || document.getElementById('afFiltroTransportadora')?.value || '';
    soIds = pre?.ids?.length ? pre.ids : null;
    caixa.innerHTML = `${topo('＋ Nova contestação')}${pre?.titulo ? `<div class="ct-resumo">🔁 ${esc(pre.titulo)} <a href="#" id="ctTodosCte" style="font-size:12px;">ver todos os CT-e do período</a></div>` : ''}
      <div class="ct-filtros"><label>Transportadora<input id="ctTransp" list="ctTranspLista" value="${esc(atual)}" placeholder="Nome da transportadora"><datalist id="ctTranspLista">${transportadoras().map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
        <label>CT-e emitidos de<input type="date" id="ctDe" value="${ini}"></label><label>até<input type="date" id="ctAte" value="${pre?.ate || hoje}"></label>
        <button class="btn btn-secundario" id="ctBuscar" style="width:auto; align-self:end;">🔎 Buscar CT-e</button></div>
      <div id="ctCand" style="margin-top:12px; color:var(--texto-fraco);">Escolha a transportadora e o período e clique em "Buscar CT-e".</div>`;
    ligarComuns();
    document.getElementById('ctBuscar').addEventListener('click', () => buscar().catch(erro));
    document.getElementById('ctTodosCte')?.addEventListener('click', (e) => { e.preventDefault(); soIds = null; e.target.closest('.ct-resumo').remove(); buscar().catch(erro); });
    if (atual) buscar().catch(erro);
  }
  async function buscar() {
    const transportadora = document.getElementById('ctTransp').value.trim();
    if (!transportadora) { mostrarAlerta('Escolha a transportadora.'); return; }
    const de = document.getElementById('ctDe').value; const ate = document.getElementById('ctAte').value;
    const el = document.getElementById('ctCand');
    el.textContent = 'Buscando…';
    const j = await json(`/api/contestacoes/candidatos?${new URLSearchParams({ transportadora, de, ate, ...(soIds ? { ids: soIds.join(',') } : {}) })}`);
    if (!j.itens.length) { el.innerHTML = '<p>Nenhum CT-e dessa transportadora cobrado acima da tabela (fora da tolerância) no período, sem glosa e fora de outra contestação.</p>'; return; }
    const opc = (sel) => Object.entries(MOTIVOS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
    el.innerHTML = `<div class="ct-dica" style="margin-bottom:8px;">Marque os CT-e, ajuste o valor e o motivo se quiser. CT-e já faturado: se aceito, vira crédito na próxima fatura.</div>
      <div class="ct-rolagem"><table class="ct-tabela"><thead><tr><th><input type="checkbox" id="ctTodos" checked></th><th>CT-e</th><th>NF</th><th>Emissão</th><th class="n">Valor CT-e</th><th class="n">Tabela</th><th class="n">Contestar</th><th>Motivo</th><th>Detalhe</th></tr></thead><tbody>
      ${j.itens.map((i, n) => `<tr data-n="${n}"><td><input type="checkbox" class="ctMarca" checked></td><td>${esc(i.numero_cte)}${i.faturado ? ` <span class="ct-dica" title="Já está na fatura ${esc(i.numero_fatura || '')}">faturado</span>` : ''}</td><td>${esc(i.numero_nf || '')}</td><td>${dia(i.data)}</td>
        <td class="n">${moeda(i.valor_cte)}</td><td class="n">${moeda(i.valor_tabela)}</td><td class="n"><input class="ctValor" value="${Number(i.valor_contestado).toFixed(2).replace('.', ',')}" style="width:86px; text-align:right;"></td>
        <td><select class="ctMotivo">${opc(i.motivo_codigo)}</select></td><td><input class="ctTexto" value="${esc(i.motivo_texto)}" style="width:240px;"></td></tr>`).join('')}</tbody></table></div>
      <div class="ct-filtros" style="margin-top:12px;"><label>Enviar para (e-mail)<input id="ctEmail" value="${esc(j.email || '')}" placeholder="e-mail da transportadora"></label>
        <label style="flex:0 0 150px; min-width:130px;">Prazo para responder (dias)<input id="ctPrazo" type="number" min="1" max="90" value="10"></label>
        <label style="flex:2;">Observação no e-mail<input id="ctObs" placeholder="Opcional"></label></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; gap:10px; flex-wrap:wrap;"><b id="ctTotal"></b>
        <button class="btn btn-primario" id="ctCriar" style="width:auto;">Criar contestação</button></div>`;
    const total = () => {
      let s = 0; let q = 0;
      el.querySelectorAll('tbody tr').forEach((tr) => { if (tr.querySelector('.ctMarca').checked) { s += num(tr.querySelector('.ctValor').value); q += 1; } });
      document.getElementById('ctTotal').textContent = `${q} CT-e — ${moeda(s)} a contestar`;
    };
    el.addEventListener('input', total); el.addEventListener('change', total);
    document.getElementById('ctTodos').addEventListener('change', (e) => { el.querySelectorAll('.ctMarca').forEach((c) => { c.checked = e.target.checked; }); total(); });
    total();
    document.getElementById('ctCriar').addEventListener('click', async () => {
      const itens = [...el.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector('.ctMarca').checked).map((tr) => ({
        frete_id: j.itens[Number(tr.dataset.n)].frete_id, valor_contestado: num(tr.querySelector('.ctValor').value),
        motivo_codigo: tr.querySelector('.ctMotivo').value, motivo_texto: tr.querySelector('.ctTexto').value,
      }));
      try {
        const c = await post('/api/contestacoes', { transportadora: j.transportadora, de, ate, email_para: document.getElementById('ctEmail').value, observacao: document.getElementById('ctObs').value, prazo_dias: document.getElementById('ctPrazo').value, itens });
        detalhe(c.id, c);
      } catch (e) { erro(e); }
    });
  }

  // ---------- Detalhe ----------
  async function detalhe(id, dados = null) {
    const c = dados || await json(`/api/contestacoes/${id}`);
    const aberta = ['rascunho', 'enviada'].includes(c.status);
    const sitItem = (i) => (i.situacao === 'aceito' ? `<span style="color:var(--verde);">Aceito ${moeda(i.valor_aceito)}</span>${i.credito ? (i.abatido_fatura_id ? ` <span class="ct-dica">abatido na fatura ${esc(i.fatura_abatida || '')}</span>` : ' <span class="ct-dica">crédito a abater</span>') : ' <span class="ct-dica">glosa no frete</span>'}`
      : i.situacao === 'recusado' ? '<span style="color:var(--vermelho);">Recusado</span>' : 'Pendente');
    caixa.innerHTML = `${topo(`📨 Contestação nº ${c.id} — ${esc(c.transportadora)}`, '<button class="btn btn-secundario" data-ct="voltar" style="width:auto;">← Lista</button>')}
      <div class="ct-resumo"><div>${selo(c.status)}</div><div>Contestado <b>${moeda(c.valor_contestado)}</b></div><div>Aceito <b>${c.valor_aceito != null ? moeda(c.valor_aceito) : '—'}</b></div>
        <div>Período ${c.de || c.ate ? `${dia(c.de)} a ${dia(c.ate)}` : '—'}</div><div>Para ${esc(c.email_para || '—')}</div><div>Criada por ${esc(c.criado_por || '—')} em ${dia(c.criado_em)}</div>${c.enviada_em ? `<div>Enviada em ${dia(c.enviada_em)}</div>` : ''}${c.status === 'enviada' && c.prazo_resposta ? `<div style="${c.prazo_resposta.slice(0, 10) < new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10) ? 'color:var(--vermelho); font-weight:600;' : ''}">Responder até ${dia(c.prazo_resposta)}${c.lembretes ? ` · ${c.lembretes} lembrete(s)` : ''}</div>` : ''}</div>
      ${aberta && c.portal_respondida_em ? `<div class="ct-resumo" style="border-color:#7c3aed; display:block;">📨 <b>A transportadora respondeu pelo link</b> (${esc(c.portal_nome || '')}, ${new Date(c.portal_respondida_em).toLocaleString('pt-BR')}). A resposta dela já está preenchida abaixo: confira e clique em <b>Registrar resposta</b>.${c.portal_comentario ? `<br>Comentário: ${esc(c.portal_comentario)}` : ''}</div>` : aberta && c.status === 'enviada' && c.portal_aberta_em ? `<div class="ct-dica" style="margin-bottom:8px;">A transportadora abriu o link em ${new Date(c.portal_aberta_em).toLocaleString('pt-BR')}, mas ainda não respondeu.</div>` : ''}
      <div class="ct-rolagem"><table class="ct-tabela"><thead><tr><th>CT-e</th><th>NF</th><th>Cliente</th><th class="n">Valor CT-e</th><th class="n">Tabela</th><th class="n">Contestado</th><th>Motivo</th><th>Situação</th>${aberta && pode ? '<th>Resposta</th>' : ''}</tr></thead><tbody>
      ${c.itens.map((i) => `<tr data-item="${i.id}"><td>${esc(i.numero_cte)}</td><td>${esc(i.numero_nf || '')}</td><td>${esc(i.cliente || '')}</td><td class="n">${moeda(i.valor_cte)}</td><td class="n">${moeda(i.valor_tabela)}</td>
        <td class="n"><b>${moeda(i.valor_contestado)}</b></td><td title="${esc(i.motivo_texto || '')}">${esc(MOTIVOS[i.motivo_codigo] || i.motivo_codigo)}</td><td>${sitItem(i)}</td>
        ${aberta && pode ? `<td style="white-space:nowrap;"><select class="ctResp"><option value="aceito">Aceito</option><option value="recusado" ${i.portal_situacao === 'recusado' ? 'selected' : ''}>Recusado</option></select> <input class="ctAceito" value="${Number(i.portal_situacao === 'aceito' && i.portal_valor != null ? i.portal_valor : i.valor_contestado).toFixed(2).replace('.', ',')}" ${i.portal_situacao === 'recusado' ? 'disabled' : ''} style="width:80px; text-align:right;">${i.portal_comentario ? `<div class="ct-dica" style="white-space:normal; max-width:260px;">“${esc(i.portal_comentario)}”</div>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      ${c.observacao ? `<p class="ct-dica">Observação: ${esc(c.observacao)}</p>` : ''}${c.resposta ? `<p class="ct-dica" style="white-space:pre-line;">Resposta: ${esc(c.resposta)}</p>` : ''}
      ${aberta && pode ? '<label class="ct-filtros" style="display:block; margin-top:10px;">Resposta da transportadora (opcional)<input id="ctRespTexto" style="width:100%;" placeholder="Ex.: aceitou por e-mail em 12/11, recusou o CT-e 123 porque..."></label>' : ''}
      <div class="ct-acoes">
        <button class="btn btn-secundario" data-ct="planilha" style="width:auto;">⬇ Planilha</button>
        ${aberta && pode ? '<button class="btn btn-secundario" data-ct="link" style="width:auto;" title="Link para a transportadora responder sem login (vai também no e-mail)">🔗 Link de resposta</button>' : ''}
        ${aberta && pode ? `<button class="btn btn-secundario" data-ct="enviar" style="width:auto;">✉️ ${c.status === 'enviada' ? 'Reenviar como lembrete' : 'Enviar'} por e-mail</button>` : ''}
        ${c.status === 'rascunho' && pode ? '<button class="btn btn-secundario" data-ct="marcar" style="width:auto;">Marcar como enviada</button>' : ''}
        ${aberta && pode ? '<button class="btn btn-secundario" data-ct="cancelar" style="width:auto;">Cancelar contestação</button><button class="btn btn-primario" data-ct="responder" style="width:auto;">✔ Registrar resposta</button>' : ''}
      </div>`;
    ligarComuns();
    const acao = (k, fn) => caixa.querySelector(`[data-ct="${k}"]`)?.addEventListener('click', () => fn().catch(erro));
    acao('voltar', lista);
    // Resposta pelo link: já preenche o texto da resposta.
    if (aberta && c.portal_respondida_em && document.getElementById('ctRespTexto')) {
      document.getElementById('ctRespTexto').value = `Respondida pelo link por ${c.portal_nome || 'transportadora'} em ${new Date(c.portal_respondida_em).toLocaleString('pt-BR')}${c.portal_comentario ? `: ${c.portal_comentario}` : ''}`.slice(0, 2000);
    }
    acao('link', async () => {
      const j = await json(`/api/contestacoes/${c.id}/link`);
      const admin = typeof usuario !== 'undefined' && usuario?.perfil === 'admin';
      const r = await abrirDialogo({ tipo: 'info', titulo: 'Link para a transportadora responder',
        mensagem: 'Quem tiver o link vê esta contestação e responde CT-e por CT-e, sem login. Ele já vai no e-mail; dá para mandar também por WhatsApp.',
        corpoHtml: `<div class="glosa-form"><label>Link<input class="dlg-campo-livre" readonly value="${esc(j.link)}"></label>
          ${j.local ? `<div class="dlg-erro" style="display:block;">Este endereço (${esc(j.base)}) só abre dentro da rede da empresa. ${admin ? 'Informe abaixo o endereço público do sistema (o mesmo do link de rastreio).' : 'Peça ao administrador para informar o endereço público do sistema.'}</div>` : ''}
          ${admin ? `<label>Endereço público do sistema<input name="endereco" class="dlg-campo-livre" placeholder="https://nexofrete.suaempresa.com.br" value="${j.local ? '' : esc(j.base)}"></label>` : ''}</div>`,
        botoes: [{ texto: 'Fechar', valor: null, estilo: 'secundario' }, ...(admin ? [{ texto: 'Salvar endereço', valor: true, estilo: 'secundario' }] : []), { texto: '📋 Copiar link', valor: 'copiar', estilo: 'primario' }] });
      if (r === 'copiar') { try { await navigator.clipboard.writeText(j.link); mostrarAlerta('Link copiado.', { tipo: 'sucesso' }); } catch { mostrarAlerta(j.link); } }
      else if (r && typeof r === 'object') {
        await json('/api/contestacoes/endereco-publico', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endereco: r.endereco }) });
        caixa.querySelector('[data-ct="link"]').click();
      }
    });
    acao('planilha', async () => {
      const r = await apiFetch(`/api/contestacoes/${c.id}/planilha`);
      if (!r.ok) throw new Error('Não foi possível gerar a planilha.');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `contestacao-${c.id}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    acao('enviar', async () => {
      const email = await pedirTexto('E-mail da transportadora (separe vários com vírgula).', { titulo: 'Enviar contestação', valor: c.email_para || '', textoOk: 'Enviar' });
      if (email === null) return;
      detalhe(c.id, await post(`/api/contestacoes/${c.id}/enviar`, { email }));
      mostrarAlerta('Contestação enviada por e-mail, com a planilha anexa.', { tipo: 'sucesso' });
    });
    acao('marcar', async () => detalhe(c.id, await post(`/api/contestacoes/${c.id}/marcar-enviada`)));
    acao('cancelar', async () => {
      if (!(await confirmar('Cancelar esta contestação? Os CT-e voltam a poder ser contestados.', { titulo: 'Cancelar contestação', tipo: 'perigo', textoOk: 'Cancelar contestação', textoCancelar: 'Voltar' }))) return;
      await post(`/api/contestacoes/${c.id}/cancelar`); lista();
    });
    caixa.querySelectorAll('.ctResp').forEach((s) => s.addEventListener('change', () => { const inp = s.parentElement.querySelector('.ctAceito'); inp.disabled = s.value === 'recusado'; }));
    acao('responder', async () => {
      const itens = [...caixa.querySelectorAll('tbody tr[data-item]')].map((tr) => ({ id: Number(tr.dataset.item), situacao: tr.querySelector('.ctResp').value, valor_aceito: num(tr.querySelector('.ctAceito').value) }));
      const ac = itens.filter((i) => i.situacao === 'aceito');
      const soma = ac.reduce((s, i) => s + i.valor_aceito, 0);
      if (!(await confirmar(`${ac.length} de ${itens.length} CT-e aceitos, ${moeda(soma)}. O aceito vira glosa no frete (ou crédito na próxima fatura, se o CT-e já foi faturado).`, { titulo: 'Registrar resposta', textoOk: 'Registrar' }))) return;
      detalhe(c.id, await post(`/api/contestacoes/${c.id}/resposta`, { itens, resposta: document.getElementById('ctRespTexto')?.value || '' }));
      if (typeof carregarAuditoriaFrete === 'function') carregarAuditoriaFrete();
    });
  }

  // ---------- Glosas por motivo ----------
  async function motivos() {
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const ini = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    caixa.innerHTML = `${topo('📊 Glosas por motivo')}${abas()}
      <div class="ct-filtros"><label>Glosa registrada de<input type="date" id="cmDe" value="${ini}"></label><label>até<input type="date" id="cmAte" value="${hoje}"></label></div><div id="cmCorpo" style="margin-top:12px;">Carregando…</div>`;
    ligarComuns();
    const carregar = async () => {
      const j = await json(`/api/contestacoes/resumo-motivos?${new URLSearchParams({ de: document.getElementById('cmDe').value, ate: document.getElementById('cmAte').value })}`);
      const el = document.getElementById('cmCorpo');
      if (!j.por_motivo.length) { el.innerHTML = '<p style="color:var(--texto-fraco);">Nenhuma glosa no período.</p>'; return; }
      const max = Math.max(...j.por_motivo.map((m) => m.valor), 1);
      const usados = j.por_motivo.map((m) => m.motivo);
      const nome = (k) => MOTIVOS[k] || 'Sem motivo informado';
      el.innerHTML = `<div class="ct-resumo"><div>Total glosado <b>${moeda(j.por_motivo.reduce((s, m) => s + m.valor, 0))}</b></div><div>Créditos de contestação a abater <b>${moeda(j.credito_pendente)}</b></div><div>Já abatidos em fatura <b>${moeda(j.credito_abatido)}</b></div></div>
        <h4 style="margin:14px 0 6px;">Por motivo</h4>
        ${j.por_motivo.map((m) => `<div class="ct-barra"><span>${esc(m.nome)}</span><div><i style="width:${Math.max(2, (m.valor / max) * 100)}%"></i></div><b>${moeda(m.valor)}</b><small>${m.qtd} glosa(s)</small></div>`).join('')}
        <h4 style="margin:16px 0 6px;">Por transportadora</h4>
        <div class="ct-rolagem"><table class="ct-tabela"><thead><tr><th>Transportadora</th><th class="n">Glosas</th><th class="n">Total</th>${usados.map((k) => `<th class="n">${esc(nome(k))}</th>`).join('')}</tr></thead><tbody>
        ${j.por_transportadora.map((t) => `<tr><td>${esc(t.transportadora || '—')}</td><td class="n">${t.qtd}</td><td class="n"><b>${moeda(t.valor)}</b></td>${usados.map((k) => `<td class="n">${t.motivos[k] ? moeda(t.motivos[k]) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    };
    ['cmDe', 'cmAte'].forEach((id) => document.getElementById(id).addEventListener('change', () => carregar().catch(erro)));
    await carregar();
  }

  // ---------- Resultado da auditoria ----------
  async function resultado() {
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    caixa.innerHTML = `${topo('📈 Resultado da auditoria')}${abas()}
      <div class="ct-filtros"><label>CT-e emitidos de<input type="date" id="crDe"></label><label>até<input type="date" id="crAte" value="${hoje}"></label>
        <label>Transportadora<input id="crTransp" placeholder="Todas"></label><button class="btn btn-secundario" id="crBuscar" style="width:auto; align-self:end;">Atualizar</button>
        <button class="btn btn-secundario" id="crCsv" style="width:auto; align-self:end;">⬇ Planilha (CSV)</button></div>
      <div id="crCorpo" style="margin-top:12px;">Carregando…</div>`;
    ligarComuns();
    let j = null;
    const pct = (v) => (v == null ? '—' : `${String(v).replace('.', ',')}%`);
    const carregar = async () => {
      const el = document.getElementById('crCorpo'); el.textContent = 'Carregando…';
      j = await json(`/api/contestacoes/resultado?${new URLSearchParams({ de: document.getElementById('crDe').value, ate: document.getElementById('crAte').value, transportadora: document.getElementById('crTransp').value.trim() })}`);
      document.getElementById('crDe').value = j.de;
      const t = j.total;
      if (!t.ctes) { el.innerHTML = '<p style="color:var(--texto-fraco);">Nenhum CT-e no período.</p>'; return; }
      const cartao = (rotulo, valor, sub, cor = '') => `<div class="cr-cartao"><div class="cr-rot">${rotulo}</div><div class="cr-val" style="${cor ? `color:${cor};` : ''}">${valor}</div><div class="ct-dica">${sub}</div></div>`;
      const max = Math.max(...j.por_mes.map((m) => Math.max(m.cobrado_a_mais, m.recuperado)), 1);
      el.innerHTML = `<div class="cr-cartoes">
          ${cartao('Cobrado a mais', moeda(t.cobrado_a_mais), `${t.divergentes} de ${t.ctes} CT-e acima da tabela (fora da tolerância)`, 'var(--vermelho)')}
          ${cartao('Recuperado', moeda(t.recuperado), `${pct(t.pct_recuperado)} do cobrado a mais em glosas e créditos, mais ${moeda(t.barrados)} de CT-e barrados`, 'var(--verde)')}
          ${cartao('Aprovado mesmo divergente', moeda(t.aprovado_divergente), `${moeda(t.aprovado_divergente_pessoa)} por pessoas · ${moeda(t.aprovado_divergente_regra)} por regra automática`)}
          ${cartao('Em apuração', moeda(t.em_apuracao), `${t.qtd_em_apuracao} CT-e ainda retido(s)`, '#ca8a04')}
          ${cartao('Decididos por regra automática', String(t.decididos_regra), 'fretes aprovados ou glosados sem ninguém precisar abrir')}
        </div>
        <div class="cr-duas">
          <div><h4>De onde veio o recuperado</h4>
            ${[['Glosas feitas na auditoria', t.glosas_manual], ['Glosas por regra automática', t.glosas_regra], ['Glosas por contestação aceita', t.glosas_contestacao], ['Créditos de contestação abatidos em fatura', t.creditos], ['CT-e barrados (reprovados / não levou)', t.barrados]]
              .map(([n, v]) => `<div class="ct-barra"><span>${n}</span><div><i style="width:${t.recuperado ? Math.max(1, (v / t.recuperado) * 100) : 0}%; background:var(--verde);"></i></div><b>${moeda(v)}</b><small></small></div>`).join('')}</div>
          <div><h4>Principais causas (glosas por motivo)</h4>
            ${t.motivos.length ? t.motivos.slice(0, 6).map((m) => `<div class="ct-barra"><span>${esc(m.nome)}</span><div><i style="width:${Math.max(1, (m.valor / t.motivos[0].valor) * 100)}%"></i></div><b>${moeda(m.valor)}</b><small></small></div>`).join('') : '<p class="ct-dica">Nenhuma glosa no período.</p>'}</div>
        </div>
        <h4 style="margin:16px 0 6px;">Por mês <span class="ct-dica">(<i class="cr-leg" style="background:var(--vermelho);"></i> cobrado a mais · <i class="cr-leg" style="background:var(--verde);"></i> recuperado)</span></h4>
        <div class="cr-meses">${j.por_mes.map((m) => `<div class="cr-mes" title="${m.chave.slice(5)}/${m.chave.slice(0, 4)}: cobrado a mais ${moeda(m.cobrado_a_mais)}, recuperado ${moeda(m.recuperado)}">
            <div class="cr-colunas"><i style="height:${(m.cobrado_a_mais / max) * 100}%; background:var(--vermelho);"></i><i style="height:${(m.recuperado / max) * 100}%; background:var(--verde);"></i></div>
            <small>${m.chave.slice(5)}/${m.chave.slice(2, 4)}</small></div>`).join('')}</div>
        <h4 style="margin:16px 0 6px;">Por transportadora</h4>
        <div class="ct-rolagem"><table class="ct-tabela"><thead><tr><th>Transportadora</th><th class="n">CT-e</th><th class="n">Divergentes</th><th class="n">Cobrado a mais</th><th class="n">Recuperado</th><th class="n">% recuperado</th><th class="n">Aprovado divergente</th><th class="n">Em apuração</th><th>Principal causa</th></tr></thead><tbody>
          ${j.por_transportadora.map((r) => `<tr><td>${esc(r.chave)}</td><td class="n">${r.ctes}</td><td class="n">${r.divergentes} (${r.ctes ? Math.round((r.divergentes / r.ctes) * 100) : 0}%)</td><td class="n">${moeda(r.cobrado_a_mais)}</td><td class="n"><b>${moeda(r.recuperado)}</b></td><td class="n">${pct(r.pct_recuperado)}</td><td class="n">${moeda(r.aprovado_divergente)}</td><td class="n">${moeda(r.em_apuracao)}</td><td>${esc(r.motivos[0]?.nome || '—')}</td></tr>`).join('')}</tbody></table></div>
        <p class="ct-dica" style="margin-top:8px;">Pela emissão do CT-e. "% recuperado" = glosas e créditos ÷ cobrado a mais. Recuperado também soma os CT-e barrados (o mesmo critério da Economia da auditoria nos indicadores).</p>`;
    };
    document.getElementById('crBuscar').addEventListener('click', () => carregar().catch(erro));
    document.getElementById('crCsv').addEventListener('click', () => {
      if (!j) return;
      const n = (v) => String(v ?? '').replace('.', ',');
      const cab = ['Grupo', 'Chave', 'CT-e', 'Divergentes', 'Cobrado a mais', 'Glosas na auditoria', 'Glosas por regra', 'Glosas por contestação', 'Créditos abatidos', 'CT-e barrados', 'Recuperado', '% recuperado', 'Aprovado divergente (pessoas)', 'Aprovado divergente (regra)', 'Em apuração'];
      const linha = (g, r) => [g, r.chave || 'Total', r.ctes, r.divergentes, n(r.cobrado_a_mais), n(r.glosas_manual), n(r.glosas_regra), n(r.glosas_contestacao), n(r.creditos), n(r.barrados), n(r.recuperado), n(r.pct_recuperado), n(r.aprovado_divergente_pessoa), n(r.aprovado_divergente_regra), n(r.em_apuracao)];
      const linhas = [cab, linha('Total', j.total), ...j.por_mes.map((m) => linha('Mês', m)), ...j.por_transportadora.map((r) => linha('Transportadora', r))];
      const csv = '\ufeff' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `resultado-auditoria-${j.de}-a-${j.ate}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    await carregar();
  }

  // ---------- Diferenças que se repetem ----------
  async function padroes() {
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const ini = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    caixa.innerHTML = `${topo('🔁 Diferenças que se repetem')}${abas()}
      <div class="ct-filtros"><label>CT-e emitidos de<input type="date" id="cpDe" value="${ini}"></label><label>até<input type="date" id="cpAte" value="${hoje}"></label>
        <label>Transportadora<input id="cpTransp" placeholder="Todas"></label><button class="btn btn-secundario" id="cpBuscar" style="width:auto; align-self:end;">🔎 Analisar</button></div>
      <div id="cpCorpo" style="margin-top:12px;">Analisando…</div>`;
    ligarComuns();
    const carregar = async () => {
      const el = document.getElementById('cpCorpo'); el.textContent = 'Analisando…';
      const q = { de: document.getElementById('cpDe').value, ate: document.getElementById('cpAte').value, transportadora: document.getElementById('cpTransp').value.trim() };
      const j = await json(`/api/contestacoes/padroes?${new URLSearchParams(q)}`);
      if (!j.padroes.length) { el.innerHTML = `<p style="color:var(--texto-fraco);">Nenhuma diferença que se repete em ${j.analisados} CT-e do período. Um padrão precisa de pelo menos 3 CT-e e de aparecer na maioria dos CT-e daquela transportadora (ou cliente, ou trecho).</p>`; return; }
      el.innerHTML = `<p class="ct-dica" style="margin:0 0 10px;">${j.analisados} CT-e analisados. Quando a diferença é sempre a mesma, o mais provável é a <b>tabela estar desatualizada</b>; quando varia, é <b>erro de cobrança</b>.</p>
        ${j.padroes.map((p, n) => `<div class="cp-cartao">
          <div class="cp-cab"><b>${esc(p.texto)}</b><span class="ct-selo" style="--c:${p.sugestao === 'tabela' ? '#ca8a04' : '#dc2626'}">${p.sugestao === 'tabela' ? 'Corrigir a tabela?' : 'Contestar'}</span></div>
          <div class="ct-dica">${esc(p.transportadora)} · ${p.ctes} de ${p.total_ctes} CT-e (${p.frequencia}%) · ${moeda(p.valor)} a mais no período${p.contestaveis < p.ctes ? ` · ${p.contestaveis} ainda sem glosa nem contestação` : ''}</div>
          <div class="ct-dica" style="margin-top:2px;">${esc(p.motivo_sugestao)}</div>
          <div class="ct-acoes" style="justify-content:flex-start; margin-top:8px;">
            ${pode && p.contestaveis ? `<button class="btn ${p.sugestao === 'contestar' ? 'btn-primario' : 'btn-secundario'}" data-cp-contestar="${n}" style="width:auto;">📨 Contestar ${p.contestaveis} CT-e</button>` : ''}
            ${p.tabela_preco_id ? `<button class="btn ${p.sugestao === 'tabela' ? 'btn-primario' : 'btn-secundario'}" data-cp-tabela="${p.tabela_preco_id}" style="width:auto;">📋 Abrir a tabela de preço</button>` : ''}
          </div></div>`).join('')}`;
      el.querySelectorAll('[data-cp-contestar]').forEach((b) => b.addEventListener('click', () => {
        const p = j.padroes[Number(b.dataset.cpContestar)];
        nova({ transportadora: p.transportadora, ids: p.ids, de: j.de, ate: j.ate, titulo: p.texto }).catch(erro);
      }));
      el.querySelectorAll('[data-cp-tabela]').forEach((b) => b.addEventListener('click', () => {
        fechar();
        if (typeof abrirTabelaPrecoParaEdicao === 'function') abrirTabelaPrecoParaEdicao(Number(b.dataset.cpTabela));
      }));
    };
    document.getElementById('cpBuscar').addEventListener('click', () => carregar().catch(erro));
    await carregar();
  }

  botao.addEventListener('click', async () => {
    modal.classList.remove('oculto');
    try {
      if (!Object.keys(MOTIVOS).length) ({ motivos: MOTIVOS, situacoes: SITUACOES } = await json('/api/contestacoes/motivos'));
      aba = 'lista'; await lista();
    } catch (e) { erro(e); }
  });
  window.abrirContestacoes = () => botao.click();

  // Conferência de fatura: avisa o crédito que vai ser abatido e o que está contestado sem resposta.
  window.avisoContestacoesFatura = async (transportadora) => {
    const el = document.getElementById('cfAvisoContestacoes');
    if (!el) return;
    el.classList.add('oculto');
    if (!transportadora) return;
    try {
      const s = await json(`/api/contestacoes/situacao?${new URLSearchParams({ transportadora })}`);
      const partes = [];
      if (s.credito > 0) partes.push(`💰 <b>${moeda(s.credito)}</b> de crédito de contestação aceita vai ser descontado nesta fatura (ela deveria vir com esse desconto).`);
      if (s.abertas > 0) partes.push(`📨 <b>${moeda(s.valor_aberto)}</b> contestados com esta transportadora ainda sem resposta (contestação nº ${s.ids.join(', ')})${s.vencidas ? `, <b style="color:var(--vermelho);">${s.vencidas} com o prazo vencido</b>` : ''}. Cobre a resposta antes de aprovar a fatura.`);
      if (!partes.length) return;
      el.innerHTML = `${partes.join('<br>')} <a href="#" id="cfVerContestacoes">ver contestações</a>`;
      el.classList.remove('oculto');
      el.querySelector('#cfVerContestacoes').addEventListener('click', (e) => { e.preventDefault(); botao.click(); });
    } catch { /* sem permissão para ver contestações: sem aviso */ }
  };
})();
