// =====================================================================
// Ocorrências » ⚠ Em tratamento: os problemas (avaria, extravio, falta,
// recusa, não entregue) até o encerramento — responsável, prazo, culpa,
// justificativa, fotos, solução, prejuízo e histórico — e o relatório.
// Usa do dashboard.js: usuario, token, apiFetch, mostrarAlerta, confirmar,
// pedirTexto; do indicadores.js: exportarExcel. Modal: o das Ocorrências.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const cont = document.getElementById('ocAbaTratamento');
  if (!pode || !cont) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const formulario = opcoes.body instanceof FormData;
    const r = await apiFetch(`/api/ocorrencias${caminho}`, { ...opcoes, headers: formulario ? {} : { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, corpo) => api(c, { method: 'POST', body: JSON.stringify(corpo) });
  const COR_ST = { aberta: 'ocorrencia', tratamento: 'em_transito', aguardando: 'agendada', resolvida: 'entregue' };
  const FILTROS = [['pendentes', 'Pendentes'], ['vencidas', 'Prazo vencido', 'perigo'], ['sem_responsavel', 'Sem responsável', 'perigo'], ['aberta', 'Abertas'], ['tratamento', 'Em tratamento'],
    ['aguardando', 'Aguardando'], ['resolvida', 'Resolvidas'], ['todas', 'Todas']];
  const estado = { status: 'pendentes', minhas: false, culpa: '', busca: '', modo: 'lista', dados: null, responsaveis: null };

  function montar() {
    cont.innerHTML = `<div class="painel oc-painel">
      <div class="oc-barra" style="flex-wrap:wrap;">
        <div class="oc-filtros" id="trFiltros"></div>
        <div class="oc-busca" style="gap:8px;">
          <label style="font-size:12.5px; display:flex; gap:5px; align-items:center;"><input type="checkbox" id="trMinhas" /> Só as minhas</label>
          <select id="trCulpa" class="cte-entrada" style="width:auto;"><option value="">Qualquer culpa</option></select>
          <input type="text" id="trBusca" class="cte-entrada" placeholder="CT-e, cliente, ocorrência ou responsável" />
          <button class="btn btn-secundario" id="trRelatorio" style="width:auto;">📊 Relatório</button>
        </div></div>
      <div class="edi-rolagem" id="trTabela"></div></div>`;
    let t = null;
    $('trBusca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estado.busca = $('trBusca').value.trim(); carregar().catch(erro); }, 350); });
    $('trMinhas').addEventListener('change', () => { estado.minhas = $('trMinhas').checked; carregar().catch(erro); });
    $('trCulpa').addEventListener('change', () => { estado.culpa = $('trCulpa').value; carregar().catch(erro); });
    $('trRelatorio').addEventListener('click', () => relatorio().catch(erro));
    $('trFiltros').addEventListener('click', (e) => { const b = e.target.closest('[data-tr-filtro]'); if (b) { estado.status = b.dataset.trFiltro; carregar().catch(erro); } });
    $('trTabela').addEventListener('click', (e) => { const b = e.target.closest('[data-tr-abrir]'); if (b) abrir(Number(b.dataset.trAbrir)).catch(erro); });
  }

  async function carregar() {
    if (!$('trTabela')) montar();
    const q = new URLSearchParams({ status: estado.status, culpa: estado.culpa, busca: estado.busca, ...(estado.minhas ? { responsavel: 'eu' } : {}) });
    const d = await api(`/tratamento?${q}`);
    estado.dados = d;
    if ($('trCulpa').options.length === 1) $('trCulpa').innerHTML += Object.entries(d.culpas).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('');
    const p = d.pendencias;
    const badge = $('ocTratBadge'); if (badge) { badge.textContent = p.vencidas || ''; badge.classList.toggle('oculto', !p.vencidas); }
    const n = { pendentes: p.abertas, vencidas: p.vencidas, sem_responsavel: p.sem_responsavel };
    $('trFiltros').innerHTML = FILTROS.map(([k, t, cls]) => `<button class="oc-filtro ${cls || ''} ${estado.status === k ? 'ativo' : ''}" data-tr-filtro="${k}">${t}${n[k] != null ? `<span class="n">${n[k]}</span>` : ''}</button>`).join('');
    $('trTabela').innerHTML = d.linhas.length ? `<table class="edi-tabela"><thead><tr><th>CT-e</th><th>Ocorrência</th><th>Destinatário</th><th>Quando</th><th>Prazo</th><th>Culpa</th><th>Responsável</th><th>Situação</th><th></th></tr></thead><tbody>
      ${d.linhas.map((o) => {
        const vencida = o.tratamento_status !== 'resolvida' && o.prazo_tratamento && o.prazo_tratamento < d.hoje;
        return `<tr><td><b>${esc(o.serie)}/${esc(o.numero)}</b>${o.parceiro ? `<br><small style="color:var(--texto-fraco);">🤝 ${esc(o.parceiro)}</small>` : ''}</td>
        <td><b>${esc(o.descricao)}</b>${o.volumes_faltantes ? ` <small>(${o.volumes_faltantes} vol.)</small>` : ''}${o.justificativa ? `<br><small style="color:var(--texto-fraco);">${esc(o.justificativa.slice(0, 90))}</small>` : ''}</td>
        <td>${esc(o.destinatario_nome || '')}<br><small style="color:var(--texto-fraco);">${esc(o.cidade_fim || '')}/${esc(o.uf_fim || '')}</small></td>
        <td>${dataHora(o.data_hora)}<br><small style="color:var(--texto-fraco);">${o.origem === 'motorista' ? '📱 motorista' : o.origem === 'edi' ? 'EDI' : esc(o.usuario_nome || '')}</small></td>
        <td style="color:${vencida ? 'var(--vermelho)' : 'inherit'};">${dia(o.prazo_tratamento)}${vencida ? '<br><small>vencido</small>' : ''}</td>
        <td><small>${esc(d.culpas[o.culpa] || '—')}</small></td>
        <td>${o.responsavel_nome ? esc(o.responsavel_nome) : '<small style="color:var(--vermelho);">ninguém</small>'}</td>
        <td><span class="oc-sit ${COR_ST[o.tratamento_status]}">${esc(d.status[o.tratamento_status])}</span>${o.solucao ? `<br><small>${esc(d.solucoes[o.solucao] || o.solucao)}${o.prejuizo ? ` · ${brl(o.prejuizo)}` : ''}</small>` : ''}${o.fotos ? `<br><small>📷 ${o.fotos}</small>` : ''}</td>
        <td><div class="oc-linha-acoes"><button class="primario" data-tr-abrir="${o.id}">Abrir</button></div></td></tr>`;
      }).join('')}</tbody></table>` : `<div class="kanban-vazio">${estado.status === 'pendentes' ? 'Nenhum problema pendente. 👏' : 'Nada aqui.'}</div>`;
  }
  window.carregarTratamento = () => carregar().catch(erro);

  // ---------- Detalhe e ações ----------
  async function abrir(id) {
    if (!estado.dados) await carregar();
    let o = estado.dados.linhas.find((x) => x.id === id);
    if (!o) {   // veio do histórico do CT-e: busca em todas
      const d = await api(`/tratamento?status=todas&busca=`);
      o = d.linhas.find((x) => x.id === id);
      if (!o) { mostrarAlerta('Esta ocorrência não é um problema a tratar.', { tipo: 'aviso' }); return; }
    }
    const d = estado.dados;
    const det = await api(`/ocorrencia/${id}/tratamento`);
    estado.responsaveis = estado.responsaveis || await api('/tratamento/responsaveis');
    const resolvida = o.tratamento_status === 'resolvida';
    const ACOES = { aberta: '🆕 Aberta', responsavel: '🙋 Responsável', status: '🔧 Situação', culpa: '⚖ Culpa', prazo: '📅 Prazo', comentario: '💬 Comentário', fotos: '📷 Fotos', resolvida: '✅ Resolvida', reaberta: '↩ Reaberta' };
    $('ocModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div><h3 style="margin:0;">⚠ ${esc(o.descricao)} — CT-e ${esc(o.serie)}/${esc(o.numero)} <span class="oc-sit ${COR_ST[o.tratamento_status]}" style="vertical-align:middle;">${esc(d.status[o.tratamento_status])}</span></h3>
        <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:4px;">${esc(o.destinatario_nome || '')} · ${esc(o.cidade_fim || '')}/${esc(o.uf_fim || '')} · tomador ${esc(o.tomador_nome || '—')} · frete ${brl(o.valor_total)}${o.parceiro ? ` · parceiro ${esc(o.parceiro)}` : ''}<br>
          Em ${dataHora(o.data_hora)}${o.cidade ? ` em ${esc(o.cidade)}` : ''} · prazo ${dia(o.prazo_tratamento)} · responsável <b>${esc(o.responsavel_nome || 'ninguém')}</b> · culpa <b>${esc(d.culpas[o.culpa] || '—')}</b>${o.volumes_faltantes ? ` · <b>${o.volumes_faltantes} volume(s) faltando</b>` : ''}</div>
        ${o.justificativa ? `<div class="cte-aviso" style="margin-top:8px;">📝 ${esc(o.justificativa)}</div>` : ''}
        ${resolvida ? `<div class="cte-aviso ok" style="margin-top:8px;">✅ ${esc(d.solucoes[o.solucao] || o.solucao || '')}: ${esc(o.solucao_texto || '')}${o.prejuizo ? ` · prejuízo ${brl(o.prejuizo)}` : ''} · por ${esc(o.resolvida_por || '')} em ${dataHora(o.resolvida_em)}</div>` : ''}</div>
        <span style="cursor:pointer; font-size:18px;" data-oc-fechar>✕</span></div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;">
        ${resolvida ? '<button class="btn btn-secundario" id="trReabrir" style="width:auto;">↩ Reabrir</button>' : `
        ${o.responsavel_id !== usuario.id ? '<button class="btn btn-secundario" id="trAssumir" style="width:auto;">🙋 Assumir</button>' : ''}
        <select id="trRepassar" class="cte-entrada" style="width:auto;"><option value="">Repassar para…</option>${estado.responsaveis.filter((u) => u.id !== o.responsavel_id).map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select>
        <button class="btn btn-secundario" data-tr-status="tratamento" style="width:auto;">🔧 Em tratamento</button>
        <button class="btn btn-secundario" data-tr-status="aguardando" style="width:auto;">⏳ Aguardando terceiro</button>
        <button class="btn btn-secundario" id="trPrazo" style="width:auto;">📅 Prazo</button>`}
        <button class="btn btn-secundario" id="trCulpaBtn" style="width:auto;">⚖ Culpa / justificativa</button>
        <button class="btn btn-secundario" id="trComentar" style="width:auto;">💬 Comentar</button>
        <label class="btn btn-secundario" style="width:auto; cursor:pointer;">📷 Anexar fotos<input type="file" id="trFotos" accept="image/*" multiple style="display:none;" /></label></div>
      ${det.fotos.length || o.tem_comprovante ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
        ${o.tem_comprovante ? `<a href="/api/ocorrencias/ocorrencia/${o.id}/comprovante?token=${encodeURIComponent(token)}" target="_blank" rel="noopener" style="font-size:12px; align-self:center;">📎 comprovante</a>` : ''}
        ${det.fotos.map((f) => `<div style="position:relative;"><a href="/api/ocorrencias/foto/${f.id}?token=${encodeURIComponent(token)}" target="_blank" rel="noopener"><img data-tr-miniatura="${f.id}" alt="foto" style="width:110px; height:84px; object-fit:cover; border-radius:6px; border:1px solid var(--borda);" /></a>
          <button data-tr-apagar-foto="${f.id}" title="Apagar foto" style="position:absolute; top:2px; right:2px; border:0; border-radius:4px; background:rgba(0,0,0,.6); color:#fff; cursor:pointer;">✕</button></div>`).join('')}</div>` : ''}
      ${resolvida ? '' : `<div class="painel" style="padding:12px 14px;"><h4 style="margin:0 0 8px;">✅ Encerrar</h4>
        <div class="oc-form"><div class="campo"><label for="trSolucao">Solução</label><select id="trSolucao"><option value="">Escolha…</option>${Object.entries(d.solucoes).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
          <div class="campo"><label for="trCulpaFim">Culpa</label><select id="trCulpaFim">${Object.entries(d.culpas).map(([k, t]) => `<option value="${k}" ${o.culpa === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
          <div class="campo"><label for="trPrejuizo">Prejuízo (R$), se houve</label><input type="text" id="trPrejuizo" placeholder="0,00" /></div>
          <div class="campo inteiro"><label for="trSolTexto">Como foi resolvido</label><textarea id="trSolTexto" rows="2" maxlength="2000" placeholder="Ex.: reentregue em 12/11 com agendamento; cliente aceitou com desconto de R$ 50 no frete"></textarea></div></div>
        <div style="display:flex; justify-content:flex-end;"><button class="btn btn-primario" id="trResolver" style="width:auto;">✅ Encerrar a ocorrência</button></div></div>`}
      <h4 style="margin:14px 0 6px;">🕘 Histórico</h4>
      <ul class="oc-tempo">${det.historico.slice().reverse().map((h) => `<li style="--cor-ev:${h.acao === 'resolvida' ? '#22c55e' : h.acao === 'aberta' ? '#f59e0b' : '#4d7cff'};"><b>${esc(ACOES[h.acao] || h.acao)}</b><small>${dataHora(h.criado_em)} · ${esc(h.usuario_nome || '')}</small>${h.detalhe ? `<small style="white-space:pre-wrap;">${esc(h.detalhe)}</small>` : ''}</li>`).join('') || '<li><small>Sem histórico (ocorrência lançada antes desta versão).</small></li>'}</ul>`;
    $('painelOcorrencia').classList.remove('oculto');
    // Miniaturas: a imagem vem com a sessão (o <img> não manda o cabeçalho de login).
    document.querySelectorAll('[data-tr-miniatura]').forEach(async (img) => {
      try { const r = await apiFetch(`/api/ocorrencias/foto/${img.dataset.trMiniatura}`); if (r.ok) img.src = URL.createObjectURL(await r.blob()); } catch { /* fica sem miniatura */ }
    });
    const acao = async (corpo, msg) => { try { await enviar(`/ocorrencia/${id}/tratamento`, corpo); if (msg) mostrarAlerta(msg, { tipo: 'sucesso' }); await carregar(); await abrir(id); } catch (e) { erro(e); } };
    $('trAssumir')?.addEventListener('click', () => acao({ acao: 'assumir' }));
    $('trRepassar')?.addEventListener('change', async (e) => {
      if (!e.target.value) return;
      const motivo = await pedirTexto('Recado para quem vai tratar (opcional):', { titulo: 'Repassar a ocorrência', valor: '', textoOk: 'Repassar' });
      if (motivo == null) { e.target.value = ''; return; }
      acao({ acao: 'repassar', responsavel_id: Number(e.target.value), motivo });
    });
    document.querySelectorAll('[data-tr-status]').forEach((b) => b.addEventListener('click', async () => {
      const detalhe = await pedirTexto(b.dataset.trStatus === 'aguardando' ? 'Aguardando o quê? (ex.: retorno do cliente, laudo da seguradora)' : 'O que está sendo feito? (opcional)', { titulo: 'Situação', valor: '', textoOk: 'Salvar' });
      if (detalhe == null) return;
      acao({ acao: 'status', status: b.dataset.trStatus, detalhe });
    }));
    $('trPrazo')?.addEventListener('click', async () => {
      const prazo = await pedirTexto('Novo prazo (AAAA-MM-DD):', { titulo: 'Prazo do tratamento', valor: o.prazo_tratamento || '', textoOk: 'Continuar' });
      if (!prazo) return;
      const motivo = await pedirTexto('Por que mudar o prazo?', { titulo: 'Prazo do tratamento', valor: '', textoOk: 'Salvar' });
      if (motivo == null) return;
      acao({ acao: 'prazo', prazo, motivo });
    });
    $('trCulpaBtn').addEventListener('click', () => culpa(id, o));
    $('trComentar').addEventListener('click', async () => {
      const c = await pedirTexto('Comentário (fica no histórico):', { titulo: 'Comentar', valor: '', textoOk: 'Comentar', multilinha: true });
      if (c) acao({ acao: 'comentar', comentario: c });
    });
    $('trReabrir')?.addEventListener('click', async () => {
      const motivo = await pedirTexto('Por que reabrir?', { titulo: 'Reabrir a ocorrência', valor: '', textoOk: 'Reabrir' });
      if (motivo) acao({ acao: 'reabrir', motivo });
    });
    $('trResolver')?.addEventListener('click', () => acao({ acao: 'resolver', solucao: $('trSolucao').value, culpa: $('trCulpaFim').value, prejuizo: $('trPrejuizo').value, solucao_texto: $('trSolTexto').value }, 'Ocorrência encerrada.'));
    $('trFotos').addEventListener('change', async (e) => {
      const fd = new FormData(); [...e.target.files].slice(0, 10).forEach((f) => fd.append('fotos', f));
      try { const r = await api(`/ocorrencia/${id}/fotos`, { method: 'POST', body: fd }); mostrarAlerta(`${r.fotos} foto(s) anexada(s).`, { tipo: 'sucesso' }); await carregar(); await abrir(id); } catch (err) { erro(err); }
    });
    document.querySelectorAll('[data-tr-apagar-foto]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Apagar esta foto?', { tipo: 'perigo', textoOk: 'Apagar' })) return;
      try { await api(`/foto/${b.dataset.trApagarFoto}`, { method: 'DELETE' }); await abrir(id); } catch (err) { erro(err); }
    }));
  }
  window.abrirTratamentoOcorrencia = (id) => abrir(id).catch(erro);

  async function culpa(id, o) {
    const d = estado.dados;
    $('ocModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="margin:0;">⚖ Culpa e justificativa — ${esc(o.descricao)}</h3><span style="cursor:pointer; font-size:18px;" data-oc-fechar>✕</span></div>
      <div class="oc-form" style="margin-top:12px;"><div class="campo"><label for="tcCulpa">De quem foi a culpa</label><select id="tcCulpa">${Object.entries(d.culpas).map(([k, t]) => `<option value="${k}" ${o.culpa === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="campo inteiro"><label for="tcJust">Justificativa</label><textarea id="tcJust" rows="3" maxlength="2000">${esc(o.justificativa || '')}</textarea></div></div>
      <p class="edi-dica">Culpa do cliente ou de terceiros (força maior) não conta contra o desempenho dos parceiros.</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" id="tcVoltar" style="width:auto;">Voltar</button><button class="btn btn-primario" id="tcSalvar" style="width:auto;">Salvar</button></div>`;
    $('tcVoltar').addEventListener('click', () => abrir(id).catch(erro));
    $('tcSalvar').addEventListener('click', async () => {
      try { await enviar(`/ocorrencia/${id}/tratamento`, { acao: 'culpa', culpa: $('tcCulpa').value, justificativa: $('tcJust').value }); await carregar(); await abrir(id); } catch (e) { erro(e); }
    });
  }

  // ---------- Relatório ----------
  async function relatorio(de = '', ate = '') {
    const r = await api(`/tratamento/relatorio?de=${de}&ate=${ate}`);
    const g = r.geral;
    const tabela = (titulo, linhas, rotulo) => `<div class="painel" style="padding:12px 14px;"><h4 style="margin:0 0 6px;">${titulo}</h4>${linhas.length ? `<table class="edi-tabela"><thead><tr><th>${rotulo}</th><th class="n">Ocorrências</th><th class="n">Resolvidas</th><th class="n">Abertas</th><th class="n">Vencidas</th><th class="n">Tempo médio</th><th class="n">Prejuízo</th></tr></thead><tbody>
      ${linhas.map((l) => `<tr><td><b>${esc(l.chave)}</b></td><td class="n">${l.qtd}</td><td class="n">${l.resolvidas}</td><td class="n">${l.abertas}</td><td class="n" style="color:${l.vencidas ? 'var(--vermelho)' : 'inherit'};">${l.vencidas || '—'}</td><td class="n">${l.tempo_medio == null ? '—' : `${l.tempo_medio.toLocaleString('pt-BR')} dia(s)`}</td><td class="n">${brl(l.prejuizo)}</td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nada no período.</div>'}</div>`;
    $('ocModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px;"><h3 style="margin:0;">📊 Relatório de ocorrências</h3><span style="cursor:pointer; font-size:18px;" data-oc-fechar>✕</span></div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:12px 0;">De <input type="date" id="trDe" class="cte-entrada" value="${r.de}" style="width:auto;" /> até <input type="date" id="trAte" class="cte-entrada" value="${r.ate}" style="width:auto;" />
        <button class="btn btn-secundario" id="trVer" style="width:auto;">Ver</button><span style="flex:1;"></span><button class="btn btn-secundario" id="trExcel" style="width:auto;">⬇ Excel</button></div>
      <div class="oc-resumo"><div>Ocorrências<b>${g.qtd}</b><span>problemas no período</span></div><div>Resolvidas<b style="color:var(--verde);">${g.resolvidas}</b><span>${r.no_prazo} dentro do prazo</span></div>
        <div>Em aberto<b style="color:${g.abertas ? '#d97706' : 'inherit'};">${g.abertas}</b><span>${g.vencidas} com prazo vencido</span></div><div>Tempo médio<b>${g.tempo_medio == null ? '—' : g.tempo_medio.toLocaleString('pt-BR')}</b><span>dias para resolver</span></div>
        <div>Prejuízo<b>${brl(g.prejuizo)}</b><span>informado no encerramento</span></div></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:12px; align-items:start;">
        ${tabela('Por tipo', r.por_tipo, 'Ocorrência')}${tabela('Por culpa', r.por_culpa, 'Culpa')}${tabela('Por responsável', r.por_responsavel, 'Responsável')}
        ${tabela('Por solução', r.por_solucao, 'Solução')}${tabela('Por cliente (tomador)', r.por_cliente, 'Cliente')}${tabela('Por parceiro', r.por_parceiro, 'Parceiro')}</div>`;
    $('painelOcorrencia').classList.remove('oculto');
    $('trVer').addEventListener('click', () => relatorio($('trDe').value, $('trAte').value).catch(erro));
    $('trExcel').addEventListener('click', async () => {
      const aba = (nome, linhas) => ({ nome, colunas: [nome.replace('Por ', ''), 'Ocorrências', 'Resolvidas', 'Abertas', 'Vencidas', 'Tempo médio (dias)', 'Prejuízo'], linhas: linhas.map((l) => [l.chave, l.qtd, l.resolvidas, l.abertas, l.vencidas, l.tempo_medio, l.prejuizo]) });
      try {
        await window.exportarExcel(`ocorrencias-${r.de}-a-${r.ate}`, [
          { nome: 'Resumo', colunas: ['Indicador', 'Valor'], linhas: [['Período', `${dia(r.de)} a ${dia(r.ate)}`], ['Ocorrências', g.qtd], ['Resolvidas', g.resolvidas], ['Resolvidas no prazo', r.no_prazo], ['Em aberto', g.abertas], ['Prazo vencido', g.vencidas], ['Tempo médio (dias)', g.tempo_medio], ['Prejuízo (R$)', g.prejuizo]] },
          aba('Por tipo', r.por_tipo), aba('Por culpa', r.por_culpa), aba('Por responsável', r.por_responsavel), aba('Por solução', r.por_solucao), aba('Por cliente', r.por_cliente), aba('Por parceiro', r.por_parceiro)]);
      } catch (e) { erro(e); }
    });
  }
})();
