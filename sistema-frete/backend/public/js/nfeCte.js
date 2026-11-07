// =====================================================================
// Relatórios » 🔗 Inconsistências NF-e × CT-e: pesquisa por NF/CT-e/chave,
// a lista única de problemas (nota sem CT-e, CT-e sem nota, valor, peso,
// destinatário e cidade diferentes, transportadora diferente, CT-e
// cancelado cobrado, cobrança em dobro), com religar, desligar e aceitar.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, pedirTexto,
// formatoMoeda, formatoData; do indicadores.js: exportarExcel.
// =====================================================================
(() => {
  const cont = document.getElementById('subabaNfeCteInc');
  if (!cont) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const podeMexer = usuario?.perfil === 'admin' || !!usuario?.pode_editar_registros || !!usuario?.pode_aprovar_pagamento;
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/nfe-cte${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, corpo) => api(c, { method: 'POST', body: JSON.stringify(corpo) });
  const COR = { NF_SEM_CTE: '#f59e0b', CTE_SEM_NF: '#f59e0b', VALOR: '#ef4444', PESO: '#ef4444', DESTINATARIO: '#ef4444', CIDADE: '#ef4444', TRANSPORTADORA: '#a855f7', CTE_CANCELADO: '#ef4444', COBRANCA_DUPLA: '#ef4444' };
  const estado = { tipo: '', dias: 3, busca: '', aceitas: false, dados: null };
  const modal = $('modalNfCte');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-nc-fechar]')) fechar(); });

  function montar() {
    cont.innerHTML = `<div class="painel" style="margin-bottom:14px;">
        <h3 style="margin-top:0; font-size:14px;">🔎 Pesquisar nota ou CT-e</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;"><input type="text" id="ncTermo" class="cte-entrada" placeholder="Número da NF, do CT-e ou a chave de 44 dígitos" style="max-width:420px;" />
          <button class="btn btn-primario" id="ncPesquisar" style="width:auto;">Pesquisar</button></div>
        <div id="ncResultado" style="margin-top:10px;"></div></div>
      <div class="painel">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div><h3 style="margin:0; font-size:14px;">🔗 Inconsistências NF-e × CT-e</h3>
            <p style="font-size:11.5px; color:var(--texto-fraco); margin:2px 0 0;">Cada CT-e é conferido com as notas dele: valor da mercadoria (tolerância 0,5% ou R$ 1), peso (5% ou 1 kg), destinatário (CNPJ) e cidade de destino.</p></div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <label style="font-size:12px;">Nota sem CT-e há <select id="ncDias" style="width:auto;">${[0, 1, 3, 5, 7, 15, 30].map((d) => `<option value="${d}" ${d === estado.dias ? 'selected' : ''}>${d ? `${d}+ dias` : 'qualquer tempo'}</option>`).join('')}</select></label>
            <input type="text" id="ncBusca" class="cte-entrada" placeholder="Filtrar NF, CT-e, cliente..." style="width:200px;" />
            <label style="font-size:12px; display:flex; gap:4px; align-items:center;"><input type="checkbox" id="ncAceitas" /> Ver as aceitas</label>
            <button class="btn btn-secundario" id="ncExcel" style="width:auto;">⬇ Excel</button></div></div>
        <div id="ncChips" style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;"></div>
        <div style="overflow-x:auto;" id="ncTabela"></div></div>`;
    $('ncPesquisar').addEventListener('click', () => pesquisar().catch(erro));
    $('ncTermo').addEventListener('keydown', (e) => { if (e.key === 'Enter') pesquisar().catch(erro); });
    $('ncDias').addEventListener('change', () => { estado.dias = Number($('ncDias').value); carregar().catch(erro); });
    $('ncAceitas').addEventListener('change', () => { estado.aceitas = $('ncAceitas').checked; carregar().catch(erro); });
    let t = null;
    $('ncBusca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estado.busca = $('ncBusca').value.trim(); desenhar(); }, 250); });
    $('ncChips').addEventListener('click', (e) => { const b = e.target.closest('[data-nc-tipo]'); if (b) { estado.tipo = b.dataset.ncTipo === estado.tipo ? '' : b.dataset.ncTipo; desenhar(); } });
    $('ncTabela').addEventListener('click', (e) => {
      const b = e.target.closest('[data-nc-acao]');
      if (!b) return;
      const item = estado.dados.itens[Number(b.dataset.i)];
      ({ religar: () => religar(item), desligar: () => desligar(item), aceitar: () => aceitar(item), desfazer: () => desfazerAceite(item), ver: () => { $('ncTermo').value = item.numero_cte || item.numero_nf; pesquisar().catch(erro); window.scrollTo({ top: 0, behavior: 'smooth' }); } })[b.dataset.ncAcao]?.();
    });
    $('ncExcel').addEventListener('click', () => {
      const l = visiveis();
      window.exportarExcel?.(`inconsistencias-nfe-cte-${new Date().toISOString().slice(0, 10)}`, [{ nome: 'Inconsistências', colunas: ['Tipo', 'NF', 'CT-e', 'Cliente', 'Transportadora', 'Data', 'Destino', 'Valor CT-e', 'Detalhe', 'Aceita (motivo)'],
        linhas: l.map((i) => [i.nome, i.numero_nf || '', i.numero_cte || '', i.cliente || '', i.transportadora || '', dia(i.data), [i.cidade, i.uf].filter(Boolean).join('/'), i.valor, i.texto, i.aceite ? `${i.aceite.motivo} (${i.aceite.usuario_nome})` : ''])}]).catch(erro);
    });
  }

  async function carregar() {
    if (!$('ncTabela')) montar();
    $('ncTabela').innerHTML = '<div style="color:var(--texto-fraco); padding:14px;">Conferindo…</div>';
    estado.dados = await api(`/inconsistencias?dias=${estado.dias}${estado.aceitas ? '&aceitas=1' : ''}`);
    desenhar();
  }
  window.carregarNfeCteInc = () => carregar().catch(erro);

  const visiveis = () => {
    const b = estado.busca.toUpperCase();
    return estado.dados.itens.map((i, idx) => ({ ...i, idx })).filter((i) => (!estado.tipo || i.codigo === estado.tipo)
      && (!b || [i.numero_nf, i.numero_cte, i.cliente, i.transportadora].some((v) => String(v || '').toUpperCase().includes(b))));
  };
  function desenhar() {
    const d = estado.dados;
    $('ncChips').innerHTML = Object.entries(d.nomes).map(([k, t]) => `<button class="oc-filtro ${estado.tipo === k ? 'ativo' : ''}" data-nc-tipo="${k}" style="border-left:3px solid ${COR[k]};">${esc(t)}<span class="n">${d.resumo[k] || 0}</span></button>`).join('')
      + `<span style="align-self:center; font-size:12px; color:var(--texto-fraco);">${estado.aceitas ? 'mostrando as aceitas' : `${d.aceitas} aceita(s) fora da lista`}</span>`;
    const l = visiveis();
    $('ncTabela').innerHTML = l.length ? `<table style="width:100%;"><thead><tr><th>Problema</th><th>NF</th><th>CT-e</th><th>Cliente</th><th>Transportadora</th><th>Data</th><th>Detalhe</th><th></th></tr></thead><tbody>
      ${l.slice(0, 1500).map((i) => `<tr><td><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${COR[i.codigo]}; margin-right:6px;"></span><b>${esc(i.nome)}</b></td>
        <td>${esc(i.numero_nf || '—')}</td><td>${esc(i.numero_cte || '—')}</td><td>${esc(i.cliente || '—')}<br><small style="color:var(--texto-fraco);">${esc([i.cidade, i.uf].filter(Boolean).join('/'))}</small></td>
        <td>${esc(i.transportadora || '—')}</td><td>${dia(i.data)}</td><td style="max-width:340px;"><small>${esc(i.texto)}</small>${i.aceite ? `<br><small style="color:var(--verde);">✓ aceita: ${esc(i.aceite.motivo)} — ${esc(i.aceite.usuario_nome || '')}</small>` : ''}</td>
        <td style="white-space:nowrap;"><button class="btn btn-secundario" data-nc-acao="ver" data-i="${i.idx}" style="width:auto; padding:4px 9px; font-size:11.5px;">🔎</button>
          ${podeMexer && ['CTE_SEM_NF', 'DESTINATARIO', 'CIDADE', 'VALOR', 'PESO'].includes(i.codigo) ? `<button class="btn btn-secundario" data-nc-acao="religar" data-i="${i.idx}" style="width:auto; padding:4px 9px; font-size:11.5px;">🔗 Religar</button>` : ''}
          ${podeMexer && ['DESTINATARIO', 'CIDADE'].includes(i.codigo) ? `<button class="btn btn-secundario" data-nc-acao="desligar" data-i="${i.idx}" style="width:auto; padding:4px 9px; font-size:11.5px;">✂ Desligar</button>` : ''}
          ${podeMexer ? (i.aceite ? `<button class="btn btn-secundario" data-nc-acao="desfazer" data-i="${i.idx}" style="width:auto; padding:4px 9px; font-size:11.5px;">↩ Desfazer aceite</button>` : `<button class="btn btn-secundario" data-nc-acao="aceitar" data-i="${i.idx}" style="width:auto; padding:4px 9px; font-size:11.5px;">✓ Aceitar</button>`) : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div style="padding:20px; text-align:center; color:var(--texto-fraco);">Nenhuma inconsistência aqui. 👍</div>';
  }

  async function aceitar(i) {
    const motivo = await pedirTexto(`Por que "${i.nome}" está certo (NF ${i.numero_nf || '—'} / CT-e ${i.numero_cte || '—'})?`, { titulo: 'Aceitar a inconsistência', valor: '', textoOk: 'Aceitar' });
    if (!motivo) return;
    try { await enviar(`/${i.frete_id}/aceitar`, { codigo: i.codigo, motivo }); mostrarAlerta('Aceita: saiu da lista (fica em "Ver as aceitas").', { tipo: 'sucesso' }); await carregar(); } catch (e) { erro(e); }
  }
  async function desfazerAceite(i) {
    try { await api(`/${i.frete_id}/aceitar/${i.codigo}`, { method: 'DELETE' }); await carregar(); } catch (e) { erro(e); }
  }
  async function desligar(i) {
    const motivo = await pedirTexto(`O CT-e ${i.numero_cte} não é da NF ${i.numero_nf}? Ele sai da nota e vira um "CT-e sem nota" (a nota volta a esperar CT-e). Motivo:`, { titulo: 'Desligar o CT-e da nota', valor: '', textoOk: 'Desligar' });
    if (!motivo) return;
    try { await enviar(`/${i.frete_id}/desligar`, { motivo }); mostrarAlerta('CT-e desligado da nota.', { tipo: 'sucesso' }); await carregar(); } catch (e) { erro(e); }
  }
  async function religar(i) {
    const c = await api(`/${i.frete_id}/candidatas`);
    const x = c.cte;
    $('ncModal').innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="margin:0;">🔗 Religar o CT-e ${esc(x.numero || i.numero_cte)}</h3><span style="cursor:pointer; font-size:18px;" data-nc-fechar>✕</span></div>
      <p style="font-size:12.5px; color:var(--texto-fraco);">No CT-e: destinatário <b>${esc(x.destinatario || '—')}</b> ${esc(x.destinatario_doc || '')} · destino <b>${esc(x.cidade || '—')}/${esc(x.uf || '')}</b> · mercadoria ${moeda(x.valor_carga)} · ${x.peso != null ? `${Number(x.peso).toLocaleString('pt-BR')} kg` : 'sem peso'}${x.nfs_citadas.length ? ` · cita a NF ${esc(x.nfs_citadas.join(', '))}` : ''}${i.numero_nf ? `<br>Hoje está na NF <b>${esc(i.numero_nf)}</b>.` : ''}</p>
      ${c.notas.length ? `<table style="width:100%;"><thead><tr><th></th><th>NF</th><th>Cliente</th><th>Destino</th><th style="text-align:right;">Valor</th><th style="text-align:right;">Peso</th><th>Emissão</th></tr></thead><tbody>
      ${c.notas.map((n) => { const ok = !n.tem_cte && !n.cte_coberto_por; return `<tr${ok ? '' : ' style="opacity:.5;"'}><td><input type="radio" name="ncNota" value="${n.id}" ${ok ? '' : 'disabled'} /></td><td><b>${esc(n.numero_nf)}</b>${n.citada ? ' <span class="badge badge-liberado">citada no CT-e</span>' : ''}${n.tem_cte ? '<br><small>já tem CT-e</small>' : n.cte_coberto_por ? '<br><small>já coberta por CT-e</small>' : ''}</td>
        <td>${esc(n.cliente || '')}<br><small style="color:var(--texto-fraco);">${esc(n.cliente_documento || '')}</small></td><td>${esc(n.cidade || '')}/${esc(n.uf || '')}</td><td style="text-align:right;">${moeda(n.valor_faturado)}</td><td style="text-align:right;">${n.peso_kg != null ? `${Number(n.peso_kg).toLocaleString('pt-BR')} kg` : '—'}</td><td>${dia(n.data_emissao_nf)}</td></tr>`; }).join('')}</tbody></table>`
    : '<div style="padding:12px; color:var(--texto-fraco);">Nenhuma nota candidata (citada pelo CT-e ou do mesmo destinatário e ainda sem CT-e).</div>'}
      <div class="campo" style="margin-top:12px;"><label for="ncMotivo">Por que o vínculo estava errado</label><input id="ncMotivo" class="cte-entrada" maxlength="300" placeholder="Ex.: a transportadora citou a NF errada no CT-e" /></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-nc-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="ncReligar" style="width:auto;">Religar à nota marcada</button></div>`;
    modal.classList.remove('oculto');
    $('ncReligar').addEventListener('click', async () => {
      const marcada = document.querySelector('[name="ncNota"]:checked');
      if (!marcada) { mostrarAlerta('Marque a nota certa.', { tipo: 'aviso' }); return; }
      try { const r = await enviar(`/${i.frete_id}/religar`, { nota_id: Number(marcada.value), motivo: $('ncMotivo').value }); fechar(); mostrarAlerta(`CT-e religado à NF ${r.nota}.`, { tipo: 'sucesso' }); await carregar(); } catch (e) { erro(e); }
    });
  }

  async function pesquisar() {
    const termo = $('ncTermo').value.trim();
    if (!termo) return;
    const r = await api(`/pesquisa?termo=${encodeURIComponent(termo)}`);
    const linhaNota = (n) => `<tr><td><b>${esc(n.numero_nf || '—')}</b></td><td>${esc(n.cliente || '—')}</td><td>${esc(n.cidade || '')}/${esc(n.uf || '')}</td><td style="text-align:right;">${moeda(n.valor_faturado)}</td><td style="text-align:right;">${n.peso_kg != null ? `${Number(n.peso_kg).toLocaleString('pt-BR')} kg` : '—'}</td><td style="text-align:right;">${n.frete_rateado != null ? moeda(n.frete_rateado) : '—'}</td><td>${n.data_entrega ? `entregue ${dia(n.data_entrega)}` : esc(n.status || '')}</td></tr>`;
    $('ncResultado').innerHTML = r.grupos.length ? r.grupos.map((g) => `<div class="painel" style="padding:10px 12px; margin-top:8px;">
        ${g.cte ? `<b>🚚 CT-e ${esc(g.cte.numero_cte)}</b> · ${esc(g.cte.transportadora_cte || '')} · ${moeda(g.cte.valor_total_cte)} · ${dia(g.cte.data_emissao_cte)}${g.cte.cte_cancelado ? ' · <span style="color:var(--vermelho);">cancelado</span>' : ''} · ${g.notas.length} nota(s)${g.cte.numero_nf ? '' : ' · <span style="color:#d97706;">sem nota no sistema</span>'}`
    : '<b style="color:#d97706;">📄 Nota sem CT-e</b>'}
        ${g.notas.length ? `<table style="width:100%; margin-top:6px; font-size:12px;"><thead><tr><th>NF</th><th>Cliente</th><th>Destino</th><th style="text-align:right;">Valor NF</th><th style="text-align:right;">Peso</th><th style="text-align:right;">Parte do frete</th><th>Situação</th></tr></thead><tbody>${g.notas.map(linhaNota).join('')}</tbody></table>` : ''}
        ${g.adicionais.length ? `<div style="font-size:12px; margin-top:6px;">CT-e a mais desta nota: ${g.adicionais.map((a) => `<b>${esc(a.numero_cte)}</b> (${esc(a.vinculo_cte || '')}, ${moeda(a.valor_total_cte)})`).join(' · ')}</div>` : ''}</div>`).join('')
      : '<div style="color:var(--texto-fraco);">Nada encontrado.</div>';
  }
})();
