// =====================================================================
// Configuração → Integração (API e ERP): chaves de API, webhooks (avisos
// automáticos) e o resumo da API para mandar ao fornecedor do ERP.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const nav = document.getElementById('navIntegracao');
  if (!nav || usuario?.perfil !== 'admin') return;
  nav.classList.remove('oculto');
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (c, o = {}) => {
    const r = await apiFetch(c, { ...o, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const modal = $('modalItg');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-itg-fechar]')) fechar(); });
  const abrirModal = (titulo, corpo) => {
    $('itgModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;"><h3 style="margin:0;">${titulo}</h3><span style="cursor:pointer; font-size:18px;" data-itg-fechar>✕</span></div>${corpo}`;
    modal.classList.remove('oculto');
  };
  const copiar = async (texto, botao) => {
    try { await navigator.clipboard.writeText(texto); if (botao) { const t = botao.textContent; botao.textContent = '✓ Copiado'; setTimeout(() => { botao.textContent = t; }, 1500); } }
    catch { mostrarAlerta('Não consegui copiar: selecione o texto e copie à mão.', { tipo: 'aviso' }); }
  };
  // Mostra um segredo uma vez só, com botão de copiar.
  const mostrarSegredo = (titulo, rotulo, valor, aviso) => {
    abrirModal(titulo, `<p style="margin:0 0 10px;">${aviso}</p>
      <label style="font-size:12px; color:var(--texto-fraco);">${rotulo}</label>
      <div style="display:flex; gap:8px; align-items:center; margin:4px 0 14px;"><input class="cte-entrada" id="itgSegredo" readonly value="${esc(valor)}" style="font-family:monospace; flex:1;" />
        <button class="btn btn-primario" id="itgCopiar" style="width:auto;">📋 Copiar</button></div>
      <div class="cte-aviso">⚠ Guarde agora: por segurança, ele <b>não aparece de novo</b>. Se perder, crie outro.</div>
      <div style="text-align:right; margin-top:14px;"><button class="btn btn-secundario" data-itg-fechar style="width:auto;">Já guardei</button></div>`);
    $('itgCopiar').addEventListener('click', (e) => copiar(valor, e.currentTarget));
    $('itgSegredo').addEventListener('focus', (e) => e.target.select());
  };

  let dados = null;
  async function carregar() {
    dados = await api('/api/integracao');
    const ent = await api('/api/integracao/entregas').catch(() => []);
    desenhar(ent);
  }
  const recarregar = () => carregar().catch(erro);
  nav.addEventListener('click', recarregar);

  function desenhar(entregas) {
    const base = `${location.origin}/api/v1`;
    const ev = dados.eventos;
    const chavesHtml = dados.chaves.length ? `<div class="tabela-container"><table><thead><tr><th>Nome</th><th>Chave</th><th>Pode</th><th>Último uso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${dados.chaves.map((k) => `<tr${k.ativo ? '' : ' style="opacity:.55;"'}><td><b>${esc(k.nome)}</b><br><small style="color:var(--texto-fraco);">criada ${quando(k.criado_em)}${k.criado_por_nome ? ` por ${esc(k.criado_por_nome)}` : ''}</small></td>
        <td><code>${esc(k.prefixo)}…</code></td><td>${k.escopos.map((e) => esc(dados.escopos[e] || e)).join('<br>')}</td>
        <td>${quando(k.ultimo_uso_em)}${k.ultimo_ip ? `<br><small style="color:var(--texto-fraco);">${esc(k.ultimo_ip)}</small>` : ''}</td>
        <td>${k.ativo ? '<span class="oc-sit entregue">Ativa</span>' : `<span class="oc-sit cancelado">Revogada</span><br><small>${quando(k.revogada_em)}</small>`}</td>
        <td>${k.ativo ? `<button class="btn btn-secundario" data-itg-revogar="${k.id}" style="width:auto; padding:4px 10px;">Revogar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p style="color:var(--texto-fraco); margin:0;">Nenhuma chave ainda. Crie uma para o ERP (uma por sistema, para poder revogar só aquela).</p>';
    const whHtml = dados.webhooks.length ? `<div class="tabela-container"><table><thead><tr><th>Nome / endereço</th><th>Eventos</th><th>Último envio</th><th>Fila</th><th></th></tr></thead><tbody>
      ${dados.webhooks.map((w) => `<tr${w.ativo ? '' : ' style="opacity:.6;"'}><td><b>${esc(w.nome)}</b> ${w.ativo ? '' : '<span class="oc-sit cancelado">Desligado</span>'}<br><small style="color:var(--texto-fraco); word-break:break-all;">${esc(w.url)}</small></td>
        <td style="white-space:normal; max-width:240px;">${w.eventos.includes('*') ? 'Todos' : w.eventos.map((e) => esc(ev[e] || e)).join(', ')}</td>
        <td>${w.ultimo_envio_em ? `${quando(w.ultimo_envio_em)}<br>${w.ultimo_status >= 200 && w.ultimo_status < 300 ? `<span style="color:var(--verde);">✓ HTTP ${w.ultimo_status}</span>` : `<span style="color:var(--vermelho);">✗ ${esc(w.ultimo_erro || `HTTP ${w.ultimo_status}`)}</span>`}` : '—'}</td>
        <td>${w.pendentes ? `${w.pendentes} na fila` : ''}${w.falharam ? `<br><span style="color:var(--vermelho);">${w.falharam} falharam</span>` : ''}${!w.pendentes && !w.falharam ? '—' : ''}</td>
        <td style="white-space:nowrap;"><button class="btn btn-secundario" data-itg-testar="${w.id}" style="width:auto; padding:4px 10px;">🔌 Testar</button>
          <button class="btn btn-secundario" data-itg-editar="${w.id}" style="width:auto; padding:4px 10px;">✏️</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p style="color:var(--texto-fraco); margin:0;">Nenhum webhook. Com um, o Nexofrete avisa o ERP na hora em que o CT-e é autorizado, a entrega acontece ou a fatura é paga.</p>';
    const entHtml = entregas.length ? `<div class="tabela-container" style="max-height:340px; overflow:auto;"><table><thead><tr><th>Quando</th><th>Evento</th><th>Webhook</th><th>Situação</th><th></th></tr></thead><tbody>
      ${entregas.map((e) => `<tr><td>${quando(e.criado_em)}</td><td>${esc(ev[e.evento] || e.evento)} <small style="color:var(--texto-fraco);">${esc(e.recurso)} ${e.recurso_id}</small></td><td>${esc(e.webhook)}</td>
        <td>${e.status === 'enviado' ? `<span class="oc-sit entregue">Enviado</span> <small>HTTP ${e.http_status}</small>` : e.status === 'falhou' ? `<span class="oc-sit cancelado">Falhou</span> <small>${esc(e.erro || '')}</small>`
          : `<span class="oc-sit pendente">Na fila</span> <small>${e.tentativas ? `${e.tentativas} tentativa(s) · ${esc(e.erro || '')} · próxima ${quando(e.proxima_em)}` : ''}</small>`}</td>
        <td>${e.status !== 'enviado' ? `<button class="btn btn-secundario" data-itg-reenviar="${e.id}" style="width:auto; padding:3px 9px;">Reenviar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p style="color:var(--texto-fraco); margin:0;">Nenhum aviso enviado ainda.</p>';
    $('itgConteudo').innerHTML = `
      <div class="painel" style="padding:14px 16px; margin-bottom:14px;"><h4 style="margin:0 0 10px;">🔑 Chaves de API</h4>${chavesHtml}</div>
      <div class="painel" style="padding:14px 16px; margin-bottom:14px;"><h4 style="margin:0 0 10px;">📣 Webhooks (avisos automáticos para o ERP)</h4>${whHtml}</div>
      <div class="painel" style="padding:14px 16px; margin-bottom:14px;"><h4 style="margin:0 0 10px;">📬 Últimos avisos</h4>${entHtml}</div>
      <div class="painel" style="padding:14px 16px; margin-bottom:14px;" id="itgModelos"></div>
      <div class="painel" style="padding:14px 16px;"><div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;"><h4 style="margin:0;">📘 Como o ERP usa (mande para o fornecedor do ERP)</h4>
        <button class="btn btn-secundario" id="itgCopiarDoc" style="width:auto;">📋 Copiar instruções</button></div>
        <pre id="itgDoc" style="white-space:pre-wrap; font-size:12.5px; line-height:1.5; background:var(--fundo-sutil, rgba(127,127,127,.08)); padding:12px; border-radius:8px; margin:10px 0 0;">${esc(documentacao(base))}</pre></div>`;
    document.querySelectorAll('[data-itg-revogar]').forEach((b) => b.addEventListener('click', () => revogar(Number(b.dataset.itgRevogar))));
    document.querySelectorAll('[data-itg-testar]').forEach((b) => b.addEventListener('click', () => testar(Number(b.dataset.itgTestar), b)));
    document.querySelectorAll('[data-itg-editar]').forEach((b) => b.addEventListener('click', () => formWebhook(dados.webhooks.find((w) => w.id === Number(b.dataset.itgEditar)))));
    document.querySelectorAll('[data-itg-reenviar]').forEach((b) => b.addEventListener('click', () => enviar(`/api/integracao/entregas/${b.dataset.itgReenviar}/reenviar`, 'POST').then(() => { mostrarAlerta('Vai de novo em até 20 segundos.', { tipo: 'sucesso' }); recarregar(); }).catch(erro)));
    $('itgCopiarDoc').addEventListener('click', (e) => copiar($('itgDoc').textContent, e.currentTarget));
    carregarModelos().catch(erro);
  }

  // ---------------- Modelos de planilha (ERP que só troca planilha) ----------------
  let mod = null;
  const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  async function carregarModelos() {
    mod = await api('/api/integracao/modelos');
    const imp = mod.modelos.filter((m) => m.tipo === 'importacao');
    const exp = mod.modelos.filter((m) => m.tipo === 'exportacao');
    const rotCampo = Object.fromEntries(mod.campos_importacao.map((c) => [c.campo, c.rotulo]));
    const hoje = hojeBr();
    $('itgModelos').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
        <h4 style="margin:0;">📄 Modelos de planilha (para o ERP que só troca planilha)</h4>
        <div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-secundario" id="itgNovoImp" style="width:auto;">📥 Modelo de importação</button>
          <button class="btn btn-secundario" id="itgNovoExp" style="width:auto;">📤 Modelo de exportação</button></div></div>
      <p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 10px;">Cada empresa usa um ERP: aqui você diz quais são as colunas da planilha <b>que o ERP gera</b> (para importar as notas e pedidos) e monta a planilha <b>que o ERP lê</b> (custo do frete, CT-e, faturas).</p>
      <div style="font-size:12.5px; font-weight:600; margin:8px 0 4px;">Importação — planilha do ERP → Nexofrete</div>
      ${imp.length ? `<div class="tabela-container"><table><thead><tr><th>Modelo</th><th>Colunas usadas</th><th>Situação</th><th></th></tr></thead><tbody>
        ${imp.map((m) => { const em = mod.modelo_importacao_id === m.id; const cols = Object.entries(m.config.colunas || {});
          return `<tr><td><b>${esc(m.nome)}</b><br><small style="color:var(--texto-fraco);">criado ${quando(m.criado_em)}</small></td>
          <td style="white-space:normal; max-width:420px; font-size:12px;">${cols.map(([c, col]) => `${esc(rotCampo[c] || c)} ← <code>${esc(col)}</code>`).join(' · ')}</td>
          <td>${em ? '<span class="oc-sit entregue">Em uso na importação</span>' : '—'}</td>
          <td style="white-space:nowrap;"><button class="btn btn-secundario" data-itg-usar="${em ? '' : m.id}" style="width:auto; padding:4px 10px;">${em ? 'Voltar ao padrão' : 'Usar na importação'}</button>
            <button class="btn btn-secundario" data-itg-mod-editar="${m.id}" style="width:auto; padding:4px 10px;">✏️</button></td></tr>`; }).join('')}</tbody></table></div>`
        : '<p style="color:var(--texto-fraco); margin:0; font-size:12.5px;">Nenhum modelo: a importação usa o formato padrão (colunas NR_PEDIDO, NR_NF, NM_CLIENTE…).</p>'}
      <div style="font-size:12.5px; font-weight:600; margin:14px 0 4px;">Exportação — Nexofrete → planilha para o ERP</div>
      ${exp.length ? `<div class="tabela-container"><table><thead><tr><th>Modelo</th><th>O quê</th><th>Formato</th><th>Período</th><th></th></tr></thead><tbody>
        ${exp.map((m) => `<tr><td><b>${esc(m.nome)}</b><br><small style="color:var(--texto-fraco);">${m.config.colunas.length} coluna(s)</small></td>
          <td>${esc(mod.recursos[m.config.recurso]?.rotulo || m.config.recurso)}</td>
          <td>${m.config.formato === 'xlsx' ? 'Excel (.xlsx)' : `CSV (${m.config.separador === 'tab' ? 'tab' : m.config.separador}, decimal ${m.config.decimal})`}</td>
          <td style="white-space:nowrap;"><input type="date" data-itg-de="${m.id}" value="${hoje.slice(0, 8)}01" style="width:132px; padding:4px 6px;" /> a <input type="date" data-itg-ate="${m.id}" value="${hoje}" style="width:132px; padding:4px 6px;" /></td>
          <td style="white-space:nowrap;"><button class="btn btn-primario" data-itg-exportar="${m.id}" style="width:auto; padding:4px 10px;">⬇ Exportar</button>
            <button class="btn btn-secundario" data-itg-mod-editar="${m.id}" style="width:auto; padding:4px 10px;">✏️</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p style="color:var(--texto-fraco); margin:0; font-size:12.5px;">Nenhum modelo de exportação.</p>'}`;
    $('itgNovoImp').addEventListener('click', () => formImportacao());
    $('itgNovoExp').addEventListener('click', () => formExportacao());
    document.querySelectorAll('[data-itg-usar]').forEach((b) => b.addEventListener('click', () => enviar('/api/integracao/modelo-importacao', 'PUT', { modelo_id: Number(b.dataset.itgUsar) || null })
      .then(() => carregarModelos()).catch(erro)));
    document.querySelectorAll('[data-itg-mod-editar]').forEach((b) => b.addEventListener('click', () => {
      const m = mod.modelos.find((x) => x.id === Number(b.dataset.itgModEditar));
      (m.tipo === 'importacao' ? formImportacao : formExportacao)(m);
    }));
    document.querySelectorAll('[data-itg-exportar]').forEach((b) => b.addEventListener('click', () => exportar(Number(b.dataset.itgExportar), b)));
  }

  async function exportar(id, botao) {
    const de = document.querySelector(`[data-itg-de="${id}"]`).value; const ate = document.querySelector(`[data-itg-ate="${id}"]`).value;
    botao.disabled = true;
    try {
      const r = await apiFetch(`/api/integracao/modelos/${id}/exportar?de=${de}&ate=${ate}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Erro ao exportar.');
      const nome = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'exportacao';
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { erro(e); } finally { botao.disabled = false; }
  }

  async function excluirModelo(m) {
    if (!(await confirmar(`Excluir o modelo "${m.nome}"?`, { tipo: 'perigo', titulo: 'Excluir modelo', textoOk: 'Excluir' }))) return;
    enviar(`/api/integracao/modelos/${m.id}`, 'DELETE').then(() => { fechar(); carregarModelos(); }).catch(erro);
  }

  // Importação: sobe a planilha de exemplo → o sistema sugere qual coluna é qual → confere e salva.
  function formImportacao(m = null) {
    let cabecalhos = m ? [...new Set(Object.values(m.config.colunas || {}))] : [];
    let amostra = [];
    let colunas = { ...(m?.config.colunas || {}) };
    abrirModal(m ? '✏️ Modelo de importação' : '📥 Novo modelo de importação', `
      <div class="campo"><label for="itgMNome">Nome do modelo</label><input id="itgMNome" class="cte-entrada" value="${esc(m?.nome || '')}" placeholder="Ex.: ERP Alterdata — pedidos" maxlength="80" /></div>
      <div style="margin:10px 0;"><label style="display:block; margin-bottom:4px;">Planilha de exemplo do ERP (.xlsx, .xls ou .csv)</label>
        <input type="file" id="itgMArquivo" accept=".xlsx,.xls,.csv" />
        <small style="display:block; color:var(--texto-fraco); margin-top:4px;">A 1ª linha precisa ter os nomes das colunas. O Nexofrete sugere qual é qual pelo nome; confira abaixo.</small></div>
      <div id="itgMMapa"></div>
      <div style="display:flex; justify-content:space-between; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <div>${m ? '<button class="btn btn-secundario" id="itgMExcluir" style="width:auto; color:var(--vermelho);">Excluir</button>' : ''}</div>
        <div style="display:flex; gap:8px;"><button class="btn btn-secundario" data-itg-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="itgMOk" style="width:auto;">Salvar modelo</button></div></div>`);
    const exemplo = (col) => { const v = amostra.find((l) => l[col] != null && String(l[col]).trim() !== '')?.[col]; return v == null ? '' : String(v).slice(0, 40); };
    const desenharMapa = (resumo = '') => {
      if (!cabecalhos.length) { $('itgMMapa').innerHTML = ''; return; }
      $('itgMMapa').innerHTML = `${resumo}<div class="tabela-container" style="max-height:46vh; overflow:auto;"><table><thead><tr><th>No Nexofrete</th><th>Coluna da planilha</th><th>Exemplo</th></tr></thead><tbody>
        ${mod.campos_importacao.map((c) => `<tr><td>${esc(c.rotulo)}${['numero_pedido', 'numero_nf', 'chave_nfe'].includes(c.campo) ? ' <small style="color:var(--texto-fraco);">(identifica a linha)</small>' : ''}</td>
          <td><select data-itg-col="${c.campo}" style="width:100%;"><option value="">— não tem —</option>${cabecalhos.map((h) => `<option value="${esc(h)}" ${colunas[c.campo] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></td>
          <td style="color:var(--texto-fraco); font-size:12px;" data-itg-ex="${c.campo}">${esc(colunas[c.campo] ? exemplo(colunas[c.campo]) : '')}</td></tr>`).join('')}</tbody></table></div>
        <small style="color:var(--texto-fraco); display:block; margin-top:6px;">Sem nº de pedido, a nota fiscal identifica a linha. As colunas "cancelado" entendem S/SIM/X/1/C como sim.</small>`;
      document.querySelectorAll('[data-itg-col]').forEach((sel) => sel.addEventListener('change', () => {
        colunas[sel.dataset.itgCol] = sel.value || undefined;
        document.querySelector(`[data-itg-ex="${sel.dataset.itgCol}"]`).textContent = sel.value ? exemplo(sel.value) : '';
      }));
    };
    desenharMapa(m ? '<p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 8px;">Para ver exemplos e trocar colunas novas, escolha de novo uma planilha do ERP.</p>' : '');
    $('itgMArquivo').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('arquivo', f);
      if (m) fd.append('config', JSON.stringify({ colunas }));
      try {
        const r = await apiFetch('/api/integracao/modelos/previa', { method: 'POST', body: fd });
        const j = await r.json(); if (!r.ok) throw new Error(j.erro || 'Não consegui ler a planilha.');
        cabecalhos = j.cabecalhos; amostra = j.amostra;
        colunas = m ? Object.fromEntries(Object.entries(colunas).filter(([, v]) => cabecalhos.includes(v))) : { ...j.sugestao.colunas };
        desenharMapa(`<p style="font-size:12.5px; margin:0 0 8px;">${j.total} linha(s) na planilha, ${cabecalhos.length} coluna(s). ${m ? '' : `Sugeri ${Object.keys(colunas).length} coluna(s) pelo nome — confira.`}</p>`);
      } catch (err) { erro(err); }
    });
    $('itgMOk').addEventListener('click', async () => {
      try {
        const corpo = { nome: $('itgMNome').value, tipo: 'importacao', config: { colunas: Object.fromEntries(Object.entries(colunas).filter(([, v]) => v)) } };
        if (m) await enviar(`/api/integracao/modelos/${m.id}`, 'PUT', corpo); else await enviar('/api/integracao/modelos', 'POST', corpo);
        fechar(); carregarModelos();
        if (!m) mostrarAlerta('Modelo salvo. Para a importação passar a usá-lo, clique em "Usar na importação".', { tipo: 'sucesso' });
      } catch (err) { erro(err); }
    });
    $('itgMExcluir')?.addEventListener('click', () => excluirModelo(m));
  }

  // Exportação: o quê, quais colunas (com o título e a ordem que o ERP quer) e o formato.
  function formExportacao(m = null) {
    const c = m?.config || { recurso: 'fretes', formato: 'csv', separador: ';', decimal: ',', data: 'br', cabecalho: true, colunas: [] };
    let recurso = c.recurso;
    let escolhidas = c.colunas.map((x) => ({ ...x }));
    abrirModal(m ? '✏️ Modelo de exportação' : '📤 Novo modelo de exportação', `
      <div class="campo"><label for="itgENome">Nome do modelo</label><input id="itgENome" class="cte-entrada" value="${esc(m?.nome || '')}" placeholder="Ex.: Custo de frete para o ERP" maxlength="80" /></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:8px; margin:10px 0;">
        <div class="campo"><label for="itgERec">O que exportar</label><select id="itgERec" ${m ? 'disabled' : ''}>${Object.entries(mod.recursos).map(([k, r]) => `<option value="${k}" ${k === recurso ? 'selected' : ''}>${esc(r.rotulo)}</option>`).join('')}</select></div>
        <div class="campo"><label for="itgEFmt">Formato</label><select id="itgEFmt"><option value="csv" ${c.formato === 'csv' ? 'selected' : ''}>CSV</option><option value="xlsx" ${c.formato === 'xlsx' ? 'selected' : ''}>Excel (.xlsx)</option></select></div>
        <div class="campo"><label for="itgESep">Separador (CSV)</label><select id="itgESep">${[[';', 'Ponto e vírgula ;'], [',', 'Vírgula ,'], ['tab', 'Tabulação']].map(([v, t]) => `<option value="${v}" ${c.separador === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="campo"><label for="itgEDec">Decimal</label><select id="itgEDec"><option value="," ${c.decimal === ',' ? 'selected' : ''}>Vírgula (1234,56)</option><option value="." ${c.decimal === '.' ? 'selected' : ''}>Ponto (1234.56)</option></select></div>
        <div class="campo"><label for="itgEData">Datas</label><select id="itgEData"><option value="br" ${c.data === 'br' ? 'selected' : ''}>dd/mm/aaaa</option><option value="iso" ${c.data === 'iso' ? 'selected' : ''}>aaaa-mm-dd</option></select></div>
      </div>
      <label style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><input type="checkbox" id="itgECab" ${c.cabecalho !== false ? 'checked' : ''} /> 1ª linha com os títulos das colunas</label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div><div style="font-size:12.5px; font-weight:600; margin-bottom:4px;">Colunas disponíveis</div><div id="itgEDisp" style="max-height:40vh; overflow:auto;"></div></div>
        <div><div style="font-size:12.5px; font-weight:600; margin-bottom:4px;">Na planilha (nesta ordem) — título editável</div><div id="itgEEsc" style="max-height:40vh; overflow:auto;"></div></div>
      </div>
      <div style="display:flex; justify-content:space-between; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <div>${m ? '<button class="btn btn-secundario" id="itgEExcluir" style="width:auto; color:var(--vermelho);">Excluir</button>' : ''}</div>
        <div style="display:flex; gap:8px;"><button class="btn btn-secundario" data-itg-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="itgEOk" style="width:auto;">Salvar modelo</button></div></div>`);
    const desenharCols = () => {
      const campos = mod.recursos[recurso].campos;
      const usados = new Set(escolhidas.map((x) => x.campo));
      $('itgEDisp').innerHTML = campos.filter((f) => !usados.has(f.campo)).map((f) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:6px; padding:3px 0; border-bottom:1px solid var(--borda);">
        <span style="font-size:12.5px;">${esc(f.titulo)}</span><button class="btn btn-secundario" data-itg-add="${f.campo}" style="width:auto; padding:2px 8px;">＋</button></div>`).join('') || '<small style="color:var(--texto-fraco);">Todas já estão na planilha.</small>';
      $('itgEEsc').innerHTML = escolhidas.map((x, i) => `<div style="display:flex; gap:4px; align-items:center; padding:3px 0;">
        <input class="cte-entrada" data-itg-tit="${i}" value="${esc(x.titulo || campos.find((f) => f.campo === x.campo)?.titulo || x.campo)}" style="flex:1; padding:4px 6px; font-size:12.5px;" title="${esc(campos.find((f) => f.campo === x.campo)?.titulo || '')}" />
        <button class="btn btn-secundario" data-itg-sobe="${i}" style="width:auto; padding:2px 7px;" ${i ? '' : 'disabled'}>↑</button>
        <button class="btn btn-secundario" data-itg-desce="${i}" style="width:auto; padding:2px 7px;" ${i < escolhidas.length - 1 ? '' : 'disabled'}>↓</button>
        <button class="btn btn-secundario" data-itg-tira="${i}" style="width:auto; padding:2px 7px;">✕</button></div>`).join('') || '<small style="color:var(--texto-fraco);">Escolha as colunas à esquerda.</small>';
      document.querySelectorAll('[data-itg-add]').forEach((b) => b.addEventListener('click', () => { const f = campos.find((x) => x.campo === b.dataset.itgAdd); escolhidas.push({ campo: f.campo, titulo: f.titulo }); desenharCols(); }));
      document.querySelectorAll('[data-itg-tit]').forEach((inp) => inp.addEventListener('input', () => { escolhidas[Number(inp.dataset.itgTit)].titulo = inp.value; }));
      const mover = (i, d) => { const [x] = escolhidas.splice(i, 1); escolhidas.splice(i + d, 0, x); desenharCols(); };
      document.querySelectorAll('[data-itg-sobe]').forEach((b) => b.addEventListener('click', () => mover(Number(b.dataset.itgSobe), -1)));
      document.querySelectorAll('[data-itg-desce]').forEach((b) => b.addEventListener('click', () => mover(Number(b.dataset.itgDesce), 1)));
      document.querySelectorAll('[data-itg-tira]').forEach((b) => b.addEventListener('click', () => { escolhidas.splice(Number(b.dataset.itgTira), 1); desenharCols(); }));
    };
    desenharCols();
    $('itgERec').addEventListener('change', (e) => { recurso = e.target.value; escolhidas = []; desenharCols(); });
    $('itgEOk').addEventListener('click', async () => {
      try {
        const corpo = { nome: $('itgENome').value, tipo: 'exportacao', config: { recurso, formato: $('itgEFmt').value, separador: $('itgESep').value, decimal: $('itgEDec').value, data: $('itgEData').value, cabecalho: $('itgECab').checked, colunas: escolhidas } };
        if (m) await enviar(`/api/integracao/modelos/${m.id}`, 'PUT', corpo); else await enviar('/api/integracao/modelos', 'POST', corpo);
        fechar(); carregarModelos();
      } catch (err) { erro(err); }
    });
    $('itgEExcluir')?.addEventListener('click', () => excluirModelo(m));
  }

  function documentacao(base) {
    return `API do Nexofrete (v1) — ${base}
Autenticação: cabeçalho  Authorization: Bearer <chave>   (a chave começa com nxf_)
Formato: JSON (UTF-8). Datas AAAA-MM-DD (dia em Brasília); momentos em ISO 8601. Limite: 120 chamadas por minuto.

CONSULTAS (chave com "Consultar")
  GET ${base}/status                       → confere a chave
  GET ${base}/ctes?alterado_desde=2026-10-01T00:00:00-03:00&limite=100
        CT-e autorizados/cancelados/substituídos que mudaram depois da data, do mais antigo para o mais novo.
        Próxima página: repita com os valores de "proxima" (alterado_desde e depois_de).
        Filtro opcional: status=autorizado | cancelado | substituido
  GET ${base}/ctes/<chave de 44 dígitos>       → um CT-e (tomador, remetente, destinatário, NF-e, valor, entrega, fatura)
  GET ${base}/ctes/<chave>/xml                 → XML autorizado (procCTe)
  GET ${base}/entregas?desde=2026-10-01&ate=2026-10-31   → CT-e entregues no período (data, hora e recebedor)
  GET ${base}/faturas?alterado_desde=...&status=paga      → faturas (documentos, pagamentos, saldo, boleto)
  GET ${base}/faturas/<id>

LANÇAMENTO (chave com "Enviar NF-e")
  POST ${base}/nfe   corpo: {"xml": "<nfeProc ...>...</nfeProc>"}   ou   {"xmls": ["...", "..."]}
        → cada NF-e (destinada a esta transportadora) vira rascunho de CT-e, com o frete da tabela; a equipe confere e transmite.

AVISOS AUTOMÁTICOS (webhooks)
  O Nexofrete faz POST no endereço cadastrado com:
    {"id": "evt_123", "evento": "cte.entregue", "criado_em": "...", "dados": {"cte": {...}}}
  Eventos: cte.autorizado, cte.cancelado, cte.substituido, cte.entregue, fatura.criada, fatura.paga, fatura.cancelada
  (dados.cte ou dados.fatura no mesmo formato das consultas).
  Responda HTTP 2xx em até 10 s. Sem 2xx, tenta de novo em 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h e 24 h.
  O mesmo evento pode chegar mais de uma vez: use o "id" para ignorar repetidos.
  Assinatura (confira sempre):  X-Nexofrete-Assinatura: t=<unix>,v1=<hex>
    v1 = HMAC-SHA256(segredo do webhook, "<t>.<corpo exato recebido>") em hexadecimal.
    Recuse se v1 não conferir ou se t tiver mais de 5 minutos.
  Exemplo (Node.js):
    const [t, v1] = cab.split(',').map((p) => p.split('=')[1]);
    const ok = crypto.timingSafeEqual(Buffer.from(v1, 'hex'),
      crypto.createHmac('sha256', segredo).update(t + '.' + corpoBruto).digest());`;
  }

  async function revogar(id) {
    const k = dados.chaves.find((x) => x.id === id);
    if (!(await confirmar(`Revogar a chave "${k?.nome}"? O sistema que usa esta chave para de acessar na hora.`, { tipo: 'perigo', titulo: 'Revogar chave', textoOk: 'Revogar' }))) return;
    enviar(`/api/integracao/chaves/${id}/revogar`, 'POST').then(recarregar).catch(erro);
  }

  async function testar(id, botao) {
    botao.disabled = true; const t = botao.textContent; botao.textContent = 'Enviando…';
    try {
      const r = await enviar(`/api/integracao/webhooks/${id}/testar`, 'POST');
      mostrarAlerta(r.ok ? `O ERP recebeu o aviso de teste (HTTP ${r.http_status}).` : `O aviso de teste não chegou: ${r.erro}`, { tipo: r.ok ? 'sucesso' : 'aviso', titulo: r.ok ? 'Funcionou' : 'Não funcionou' });
    } catch (e) { erro(e); } finally { botao.disabled = false; botao.textContent = t; }
  }

  $('itgNovaChave').addEventListener('click', () => {
    abrirModal('🔑 Nova chave de API', `
      <div class="campo"><label for="itgKNome">Nome (para saber quem usa)</label><input id="itgKNome" class="cte-entrada" placeholder="Ex.: ERP Bapx" maxlength="80" /></div>
      <div style="margin:10px 0;"><label style="display:block; margin-bottom:4px;">O que a chave pode fazer</label>
        ${Object.entries(dados?.escopos || {}).map(([k, v]) => `<label style="display:flex; gap:8px; align-items:center; margin:4px 0;"><input type="checkbox" data-itg-escopo="${k}" ${k === 'ler' ? 'checked' : ''} /> ${esc(v)}</label>`).join('')}</div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;"><button class="btn btn-secundario" data-itg-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="itgKOk" style="width:auto;">Criar chave</button></div>`);
    $('itgKNome').focus();
    $('itgKOk').addEventListener('click', async () => {
      try {
        const escopos = [...document.querySelectorAll('[data-itg-escopo]:checked')].map((x) => x.dataset.itgEscopo);
        const r = await enviar('/api/integracao/chaves', 'POST', { nome: $('itgKNome').value, escopos });
        mostrarSegredo('🔑 Chave criada', `Chave de API — ${esc(r.nome)}`, r.chave, 'Passe esta chave para o ERP (no cabeçalho <code>Authorization: Bearer …</code>).');
        recarregar();
      } catch (e) { erro(e); }
    });
  });

  function formWebhook(w = null) {
    const ev = dados?.eventos || {};
    const marcados = w ? w.eventos : ['*'];
    abrirModal(w ? '✏️ Webhook' : '📣 Novo webhook', `
      <div class="campo"><label for="itgWNome">Nome</label><input id="itgWNome" class="cte-entrada" value="${esc(w?.nome || '')}" placeholder="Ex.: ERP Bapx" maxlength="80" /></div>
      <div class="campo" style="margin-top:8px;"><label for="itgWUrl">Endereço que o ERP deu para receber os avisos</label><input id="itgWUrl" class="cte-entrada" value="${esc(w?.url || '')}" placeholder="https://erp.suaempresa.com.br/nexofrete/webhook" maxlength="500" />
        <small style="color:var(--texto-fraco);">${dados?.rede_interna ? 'Aceita também endereço da rede interna (http://).' : 'Precisa ser https:// e público (endereços da rede interna são recusados por segurança).'}</small></div>
      <div style="margin:10px 0;"><label style="display:block; margin-bottom:4px;">Avisar quando</label>
        <label style="display:flex; gap:8px; align-items:center; margin:4px 0;"><input type="checkbox" id="itgWTodos" ${marcados.includes('*') ? 'checked' : ''} /> <b>Todos os eventos</b> (inclusive os que vierem em versões futuras)</label>
        <div id="itgWLista" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:2px 10px; padding-left:22px;">
        ${Object.entries(ev).map(([k, v]) => `<label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" data-itg-ev="${k}" ${marcados.includes('*') || marcados.includes(k) ? 'checked' : ''} /> ${esc(v)}</label>`).join('')}</div></div>
      ${w ? `<label style="display:flex; gap:8px; align-items:center; margin:8px 0;"><input type="checkbox" id="itgWAtivo" ${w.ativo ? 'checked' : ''} /> Ligado</label>` : ''}
      <div style="display:flex; justify-content:space-between; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <div style="display:flex; gap:8px;">${w ? `<button class="btn btn-secundario" id="itgWSegredo" style="width:auto;">🔁 Novo segredo</button><button class="btn btn-secundario" id="itgWExcluir" style="width:auto; color:var(--vermelho);">Excluir</button>` : ''}</div>
        <div style="display:flex; gap:8px;"><button class="btn btn-secundario" data-itg-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="itgWOk" style="width:auto;">Salvar</button></div></div>`);
    const todos = $('itgWTodos');
    const sincronizar = () => document.querySelectorAll('[data-itg-ev]').forEach((x) => { x.disabled = todos.checked; if (todos.checked) x.checked = true; });
    todos.addEventListener('change', sincronizar); sincronizar();
    $('itgWOk').addEventListener('click', async () => {
      try {
        const eventos = todos.checked ? ['*'] : [...document.querySelectorAll('[data-itg-ev]:checked')].map((x) => x.dataset.itgEv);
        const corpo = { nome: $('itgWNome').value, url: $('itgWUrl').value, eventos };
        if (w) {
          await enviar(`/api/integracao/webhooks/${w.id}`, 'PUT', { ...corpo, ativo: $('itgWAtivo').checked });
          fechar(); recarregar();
        } else {
          const r = await enviar('/api/integracao/webhooks', 'POST', corpo);
          mostrarSegredo('📣 Webhook criado', 'Segredo da assinatura', r.segredo, 'Passe este segredo para o ERP: com ele o ERP confere que o aviso veio mesmo do Nexofrete (cabeçalho <code>X-Nexofrete-Assinatura</code>).');
          recarregar();
        }
      } catch (e) { erro(e); }
    });
    $('itgWSegredo')?.addEventListener('click', async () => {
      if (!(await confirmar('Gerar um novo segredo? O ERP precisa receber o novo; até lá, ele vai recusar os avisos.', { titulo: 'Novo segredo', textoOk: 'Gerar' }))) return;
      enviar(`/api/integracao/webhooks/${w.id}/segredo`, 'POST').then((r) => mostrarSegredo('🔁 Novo segredo', 'Segredo da assinatura', r.segredo, 'Atualize no ERP.')).catch(erro);
    });
    $('itgWExcluir')?.addEventListener('click', async () => {
      if (!(await confirmar(`Excluir o webhook "${w.nome}"? Os avisos na fila também somem.`, { tipo: 'perigo', titulo: 'Excluir webhook', textoOk: 'Excluir' }))) return;
      enviar(`/api/integracao/webhooks/${w.id}`, 'DELETE').then(() => { fechar(); recarregar(); }).catch(erro);
    });
  }
  $('itgNovoWebhook').addEventListener('click', () => (dados ? Promise.resolve() : carregar()).then(() => formWebhook()).catch(erro));
})();
