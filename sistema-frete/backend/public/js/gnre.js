// =====================================================================
// GNRE (aba de Fiscal e contabilidade): CT-e com ICMS devido a outra UF que
// precisam de guia, os dados para gerar a guia no Portal GNRE, o registro da
// guia (linha digitável conferida, PDF) e as guias com a situação do pagamento.
// Usa do dashboard.js: apiFetch, mostrarAlerta, confirmar, pedirTexto, token.
// =====================================================================
window.telaGnre = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const diaTs = (v) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
  const docFmt = (d) => String(d || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const linhaFmt = (l) => (l ? l.match(/.{12}/g).map((b) => `${b.slice(0, 11)}-${b[11]}`).join(' ') : '');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/gnre${caminho}`, { ...opcoes, headers: opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const abrir = (c) => window.open(`/api/gnre${c}${c.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`, '_blank');
  const SIT = { a_pagar: ['A pagar', 'ocorrencia'], vencida: ['Vencida', 'cancelado'], paga: ['Paga', 'entregue'], cancelada: ['Cancelada', 'pendente'] };
  const est = { filtro: 'abertas' };
  let raiz = null;

  // Modal próprio (a aba vive dentro de Fiscal e contabilidade).
  function modal(html) {
    let m = $('modalGnre');
    if (!m) {
      m = document.createElement('div'); m.id = 'modalGnre'; m.className = 'modal-overlay';
      m.innerHTML = '<div class="painel modal-card" style="max-width:820px; width:100%; max-height:94vh; overflow-y:auto; padding:22px 24px;" id="gnModal"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-gn-fechar]')) m.classList.add('oculto'); });
    }
    $('gnModal').innerHTML = html; m.classList.remove('oculto');
    return m;
  }
  const fechar = () => $('modalGnre')?.classList.add('oculto');
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-gn-fechar>✕</span></div>`;
  const copiar = (t) => navigator.clipboard?.writeText(t).then(() => mostrarAlerta('Copiado.', { tipo: 'sucesso' })).catch(() => {});

  async function tela(el) {
    raiz = el || raiz;
    const [p, gs] = await Promise.all([api(''), api(`/guias?filtro=${est.filtro}`)]);
    const semGuia = p.por_uf.reduce((s, u) => s + u.ctes.length, 0);
    const total = p.por_uf.reduce((s, u) => s + u.total, 0);
    const abertas = gs.filter((g) => ['a_pagar', 'vencida'].includes(g.situacao));
    raiz.innerHTML = `
      <div class="oc-resumo">
        <div>CT-e sem guia<b style="color:${semGuia ? '#ef4444' : 'inherit'};">${semGuia}</b><span>${brl(total)} de ICMS de outra UF</span></div>
        <div>Guias a pagar<b>${abertas.length}</b><span>${brl(abertas.reduce((s, g) => s + g.valor, 0))}</span></div>
        <div>Vencidas<b style="color:${abertas.some((g) => g.situacao === 'vencida') ? '#ef4444' : 'inherit'};">${abertas.filter((g) => g.situacao === 'vencida').length}</b><span>pague em Contas a pagar</span></div>
        <div>UFs com inscrição<b style="font-size:16px;">${esc(p.config.ufs_ie.join(', ') || '—')}</b><span>lá o ICMS é apurado no mês, sem GNRE</span></div>
      </div>
      <div class="oc-barra" style="align-items:center;"><span class="edi-dica" style="margin:0;">CT-e com <b>ICMS devido a outra UF</b> (CST 90, ICMSOutraUF): o imposto vai por GNRE para a UF de início do frete, paga antes da carga sair.</span>
        <span style="flex:1;"></span><a class="btn btn-secundario" href="https://www.gnre.pe.gov.br/gnre/portal/GNRE_Principal.jsp" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">↗ Portal GNRE</a>
        <button class="btn btn-secundario" id="gnConfig" style="width:auto;">⚙ UFs com inscrição</button></div>
      ${p.por_uf.length ? p.por_uf.map((u) => `<div class="painel oc-painel" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;"><h4 style="margin:0;">${esc(u.uf)} · ${u.ctes.length} CT-e · ${brl(u.total)}</h4>
          <div style="display:flex; gap:8px;"><button class="btn btn-secundario" data-gn-ficha="${u.uf}" style="width:auto;">📋 Dados para a guia</button><button class="btn btn-primario" data-gn-registrar="${u.uf}" style="width:auto;">🧾 Registrar a guia</button></div></div>
        <div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th><input type="checkbox" data-gn-todos="${u.uf}" checked /></th><th>CT-e</th><th>Emissão</th><th>Início → destino</th><th>Tomador</th><th class="n">Base</th><th class="n">ICMS</th><th>Carga</th></tr></thead><tbody>
        ${u.ctes.map((c) => `<tr><td><input type="checkbox" data-gn-cte="${c.id}" data-uf="${u.uf}" checked /></td><td><b>${esc(c.serie)}/${esc(c.numero)}</b></td><td>${diaTs(c.emissao)}</td>
          <td>${esc(c.origem)} → ${esc(c.destino)}</td><td>${esc(c.tomador)}</td><td class="n">${brl(c.base)}<br><small style="color:var(--texto-fraco);">${c.aliquota ?? ''}%</small></td><td class="n"><b>${brl(c.icms)}</b></td>
          <td>${c.ja_saiu ? '<small style="color:#ef4444; font-weight:600;">já saiu sem guia</small>' : c.romaneio_id ? `<small>romaneio ${c.romaneio_id}</small>` : '<small style="color:var(--texto-fraco);">no pátio</small>'}</td></tr>`).join('')}</tbody></table></div></div>`).join('')
    : '<div class="kanban-vazio">Nenhum CT-e esperando GNRE. 👍</div>'}
      ${p.apuracao_na_uf.length ? `<p class="edi-dica">${p.apuracao_na_uf.length} CT-e de ICMS de outra UF em UFs onde a empresa tem inscrição (${esc([...new Set(p.apuracao_na_uf.map((c) => c.uf))].join(', '))}): entram na apuração mensal daquela UF, sem GNRE.</p>` : ''}
      <h4 style="margin:18px 0 8px;">Guias registradas</h4>
      <div class="oc-filtros" style="margin-bottom:10px;">${[['abertas', 'A pagar'], ['pagas', 'Pagas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']].map(([k, t]) => `<button class="oc-filtro ${est.filtro === k ? 'ativo' : ''}" data-gn-filtro="${k}">${t}</button>`).join('')}</div>
      <div class="painel oc-painel"><div class="edi-rolagem">${gs.length ? `<table class="edi-tabela"><thead><tr><th>UF</th><th>CT-e</th><th class="n">Valor</th><th>Vencimento</th><th>Linha digitável</th><th>Situação</th><th></th></tr></thead><tbody>
        ${gs.map((g) => `<tr><td><b>${esc(g.uf_favorecida)}</b><br><small style="color:var(--texto-fraco);">ref. ${esc(g.referencia.split('-').reverse().join('/'))}</small></td>
          <td><small>${(g.ctes || []).map((c) => `${esc(c.serie)}/${esc(c.numero)}${c.status === 'cancelado' ? ' (cancelado)' : ''}`).join(', ')}</small>${g.cte_cancelado && g.situacao === 'paga' ? '<br><small style="color:#d97706;">CT-e cancelado: peça a restituição à SEFAZ</small>' : ''}</td>
          <td class="n"><b>${brl(g.valor)}</b></td><td>${dia(g.vencimento)}${g.pago_em ? `<br><small>paga ${dia(g.pago_em)}</small>` : ''}</td>
          <td><small style="font-family:monospace;">${esc(linhaFmt(g.linha_digitavel))}</small>${g.numero_controle ? `<br><small>controle ${esc(g.numero_controle)}</small>` : ''}</td>
          <td><span class="oc-sit ${SIT[g.situacao][1]}">${SIT[g.situacao][0]}</span>${g.motivo_cancelamento ? `<br><small>${esc(g.motivo_cancelamento)}</small>` : ''}</td>
          <td><div class="oc-linha-acoes">${g.linha_digitavel ? `<button data-gn-copiar="${g.linha_digitavel}" title="Copiar a linha digitável">📋</button>` : ''}${g.arquivo ? `<button data-gn-arq="${g.id}" title="Ver a guia">📄</button>` : ''}
            ${g.comprovante ? `<button data-gn-comp="${g.id}" title="Ver o comprovante">✅</button>` : ''}${g.situacao !== 'cancelada' ? `<button data-gn-anexo="${g.id}" title="Anexar a guia ou o comprovante de pagamento">📎</button>` : ''}
            ${['a_pagar', 'vencida'].includes(g.situacao) ? `<button data-gn-cancelar="${g.id}">Cancelar</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhuma guia aqui.</div>'}</div></div>
      <p class="edi-dica" style="margin-top:10px;">Ao registrar, a guia vira uma conta a pagar (categoria "ICMS de outra UF (GNRE)", fornecedor SEFAZ-UF): pague em Financeiro » Contas a pagar e anexe o comprovante aqui. Na contabilidade, a guia baixa o "ICMS devido a outra UF" lançado com o CT-e. O romaneio avisa o CT-e que vai sair sem a guia paga.</p>`;
    ligar(p);
  }

  const marcados = (uf) => [...raiz.querySelectorAll(`[data-gn-cte][data-uf="${uf}"]:checked`)].map((x) => Number(x.dataset.gnCte));
  function ligar(p) {
    raiz.querySelectorAll('[data-gn-todos]').forEach((cx) => cx.addEventListener('change', () => raiz.querySelectorAll(`[data-gn-cte][data-uf="${cx.dataset.gnTodos}"]`).forEach((x) => { x.checked = cx.checked; })));
    raiz.querySelectorAll('[data-gn-filtro]').forEach((b) => b.addEventListener('click', () => { est.filtro = b.dataset.gnFiltro; tela().catch(erro); }));
    raiz.querySelectorAll('[data-gn-ficha]').forEach((b) => b.addEventListener('click', () => ficha(marcados(b.dataset.gnFicha)).catch(erro)));
    raiz.querySelectorAll('[data-gn-registrar]').forEach((b) => b.addEventListener('click', () => registrar(marcados(b.dataset.gnRegistrar)).catch(erro)));
    raiz.querySelectorAll('[data-gn-copiar]').forEach((b) => b.addEventListener('click', () => copiar(b.dataset.gnCopiar)));
    raiz.querySelectorAll('[data-gn-arq]').forEach((b) => b.addEventListener('click', () => abrir(`/guias/${b.dataset.gnArq}/arquivo`)));
    raiz.querySelectorAll('[data-gn-comp]').forEach((b) => b.addEventListener('click', () => abrir(`/guias/${b.dataset.gnComp}/arquivo?campo=comprovante`)));
    raiz.querySelectorAll('[data-gn-anexo]').forEach((b) => b.addEventListener('click', () => anexar(Number(b.dataset.gnAnexo))));
    raiz.querySelectorAll('[data-gn-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo do cancelamento (a conta a pagar da guia também é cancelada):', { titulo: 'Cancelar a GNRE' });
      if (!motivo) return;
      try { await api(`/guias/${b.dataset.gnCancelar}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) }); mostrarAlerta('Guia cancelada.', { tipo: 'sucesso' }); tela().catch(erro); } catch (err) { erro(err); }
    }));
    $('gnConfig').addEventListener('click', () => config().catch(erro));
  }

  // Dados da guia, campo a campo, com botão de copiar (para o Portal GNRE).
  async function ficha(ids) {
    if (!ids.length) { mostrarAlerta('Marque os CT-e da guia.', { tipo: 'aviso' }); return; }
    const f = await api(`/ficha?ctes=${ids.join(',')}`);
    const campo = (rot, v, copia = v) => `<tr><th style="width:36%;">${rot}</th><td>${esc(v)}</td><td style="width:40px;">${copia ? `<button class="btn btn-secundario" data-gn-c="${esc(copia)}" style="width:auto; padding:3px 8px;">📋</button>` : ''}</td></tr>`;
    modal(`${cab(`📋 Dados para a GNRE — ${esc(f.uf_favorecida)}`)}
      <table class="edi-tabela">${campo('UF favorecida', f.uf_favorecida)}${campo('Receita', `${f.receita} — ${f.receita_nome}`, f.receita)}
        ${campo('CNPJ do emitente', docFmt(f.emitente.cnpj), f.emitente.cnpj)}${campo('Razão social', f.emitente.razao_social)}${campo('Endereço', f.emitente.endereco)}
        ${campo('Município / UF', `${f.emitente.municipio || ''}/${f.emitente.uf || ''}`, '')}${campo('CEP', f.emitente.cep || '')}${campo('Telefone', f.emitente.telefone || '')}
        ${f.ctes.length === 1 ? `${campo('Documento de origem (nº CT-e)', f.ctes[0].numero, String(f.ctes[0].numero))}${campo('Chave do CT-e', f.ctes[0].chave)}` : campo('Documentos de origem', f.ctes.map((c) => c.numero).join(', '))}
        ${campo('Período de referência', f.referencia.split('-').reverse().join('/'), `${f.referencia.slice(5, 7)}/${f.referencia.slice(0, 4)}`)}${campo('Vencimento / pagamento', dia(f.vencimento))}
        ${campo('Valor principal', brl(f.valor), f.valor.toFixed(2).replace('.', ','))}</table>
      <p class="edi-dica" style="margin-top:8px;">No portal: Gerar GNRE → UF ${esc(f.uf_favorecida)} → receita ${f.receita}. Cada UF pode pedir campos extras (tipo de documento de origem, detalhamento, produto); o portal mostra quais. Depois de gerar e pagar, use <b>Registrar a guia</b>.</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" id="gnImprimir" style="width:auto;">🖨 Imprimir</button><a class="btn btn-secundario" href="https://www.gnre.pe.gov.br/gnre/portal/GNRE_Principal.jsp" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">↗ Portal GNRE</a><button class="btn btn-primario" id="gnIrRegistrar" style="width:auto;">🧾 Registrar a guia</button></div>`);
    $('gnModal').querySelectorAll('[data-gn-c]').forEach((b) => b.addEventListener('click', () => copiar(b.dataset.gnC)));
    $('gnImprimir').addEventListener('click', () => abrir(`/ficha/imprimir?ctes=${ids.join(',')}`));
    $('gnIrRegistrar').addEventListener('click', () => registrar(ids).catch(erro));
  }

  async function registrar(ids) {
    if (!ids.length) { mostrarAlerta('Marque os CT-e da guia.', { tipo: 'aviso' }); return; }
    const f = await api(`/ficha?ctes=${ids.join(',')}`);
    modal(`${cab(`🧾 Registrar a GNRE — ${esc(f.uf_favorecida)}`)}
      <p>CT-e ${f.ctes.map((c) => `${esc(c.serie)}/${esc(c.numero)}`).join(', ')} · ICMS <b>${brl(f.valor)}</b></p>
      <div class="oc-form">
        <div class="campo inteiro"><label for="gnLinha">Linha digitável da guia (ou código de barras)</label><input id="gnLinha" class="cte-entrada" inputmode="numeric" placeholder="8xxxxxxxxxx-x xxxxxxxxxxx-x ..." /><small id="gnLinhaInfo" style="color:var(--texto-fraco);"></small></div>
        <div class="campo"><label for="gnControle">Nº de controle da guia (opcional)</label><input id="gnControle" class="cte-entrada" maxlength="30" /></div>
        <div class="campo"><label for="gnVenc">Vencimento</label><input id="gnVenc" type="date" class="cte-entrada" value="${f.vencimento}" /></div>
        <div class="campo inteiro"><label for="gnArq">PDF da guia (opcional, para imprimir e mandar com a carga)</label><input id="gnArq" type="file" accept="application/pdf,image/*" /></div>
        <label class="ag-check oculto" id="gnDifCampo"><input type="checkbox" id="gnDif" /> O valor da guia é diferente do ICMS dos CT-e (multa, juros ou outro motivo) e está certo</label>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-gn-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="gnSalvar" style="width:auto;">Registrar e lançar no contas a pagar</button></div>`);
    let tm = null;
    $('gnLinha').addEventListener('input', (e) => {
      clearTimeout(tm);
      tm = setTimeout(async () => {
        const v = e.target.value.replace(/\D/g, '');
        if (v.length < 44) { $('gnLinhaInfo').textContent = v ? `${v.length} números` : ''; return; }
        try {
          const r = await api(`/linha?linha=${v}`);
          $('gnLinhaInfo').innerHTML = r.erro ? `<span style="color:#ef4444;">✗ ${esc(r.erro)}</span>` : `<span style="color:var(--verde);">✓ Linha confere${r.valor != null ? ` · valor ${brl(r.valor)}` : ''}</span>`;
          $('gnDifCampo').classList.toggle('oculto', !(r.valor != null && Math.abs(r.valor - f.valor) > 0.009));
        } catch { /* confere ao salvar */ }
      }, 300);
    });
    $('gnSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const fd = new FormData();
      fd.append('cte_ids', ids.join(',')); fd.append('linha', $('gnLinha').value); fd.append('numero_controle', $('gnControle').value); fd.append('vencimento', $('gnVenc').value);
      fd.append('valor_diferente', String($('gnDif').checked));
      if ($('gnArq').files[0]) fd.append('arquivo', $('gnArq').files[0]);
      try { await api('/guias', { method: 'POST', body: fd }); fechar(); mostrarAlerta('Guia registrada e lançada no contas a pagar.', { tipo: 'sucesso' }); tela().catch(erro); } catch (err) { b.disabled = false; erro(err); }
    });
  }

  function anexar(id) {
    modal(`${cab('📎 Anexar à GNRE')}
      <div class="oc-form"><div class="campo"><label for="gnCampo">O que é</label><select id="gnCampo" class="cte-entrada"><option value="comprovante">Comprovante de pagamento</option><option value="arquivo">PDF da guia</option></select></div>
        <div class="campo"><label for="gnAnexo">Arquivo (PDF ou foto)</label><input id="gnAnexo" type="file" accept="application/pdf,image/*" /></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-gn-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="gnAnexar" style="width:auto;">Anexar</button></div>`);
    $('gnAnexar').addEventListener('click', async () => {
      if (!$('gnAnexo').files[0]) { mostrarAlerta('Escolha o arquivo.', { tipo: 'aviso' }); return; }
      const fd = new FormData(); fd.append('campo', $('gnCampo').value); fd.append('arquivo', $('gnAnexo').files[0]);
      try { await api(`/guias/${id}/anexo`, { method: 'POST', body: fd }); fechar(); mostrarAlerta('Anexado.', { tipo: 'sucesso' }); tela().catch(erro); } catch (err) { erro(err); }
    });
  }

  async function config() {
    const c = await api('/config');
    modal(`${cab('⚙ UFs onde a empresa tem inscrição estadual')}
      <p class="edi-dica">Nas UFs marcadas a transportadora é inscrita (IE própria ou de substituto): o ICMS do frete que começa lá entra na apuração mensal daquela UF e não precisa de GNRE a cada CT-e.</p>
      <div class="pa-ufs" style="display:flex; flex-wrap:wrap; gap:8px 14px;">${c.ufs.map((u) => `<label><input type="checkbox" data-gn-uf="${u}" ${c.ufs_ie.includes(u) ? 'checked' : ''} /> ${u}</label>`).join('')}</div>
      <div class="campo" style="margin-top:12px; max-width:320px;"><label for="gnDias">Vencimento da guia (dias depois da emissão do CT-e)</label><input id="gnDias" type="number" min="0" max="30" class="cte-entrada" value="${c.vencimento_dias}" /></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-gn-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="gnCfgSalvar" style="width:auto;">Salvar</button></div>`);
    $('gnCfgSalvar').addEventListener('click', async () => {
      try {
        await api('/config', { method: 'PUT', body: JSON.stringify({ ufs_ie: [...document.querySelectorAll('[data-gn-uf]:checked')].map((x) => x.dataset.gnUf), vencimento_dias: Number($('gnDias').value) || 0 }) });
        fechar(); mostrarAlerta('Salvo.', { tipo: 'sucesso' }); tela().catch(erro);
      } catch (err) { erro(err); }
    });
  }

  return tela;
})();
