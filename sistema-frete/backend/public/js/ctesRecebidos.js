// =====================================================================
// Documentos » 🚛 CT-e recebidos: consulta dos CT-e das transportadoras com filtros
// (número/chave, transportadora, tomador, remetente, destinatário, origem e destino,
// modal, serviço, CFOP, período, situação), totais de frete e ICMS, os dados
// completos de cada CT-e, o XML (um ou .zip), o DACTE, os eventos e o histórico.
// Usa do dashboard.js: apiFetch, mostrarAlerta, token; do indicadores.js: exportarExcel;
// do linkSeguro.js: LinkSeguro; do periodo.js: Periodo.
// =====================================================================
(() => {
  const nav = document.querySelector('.nav-item[data-pagina="ctes-recebidos"]');
  const cont = document.getElementById('ctrConteudo');
  if (!nav || !cont) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const doc = (v) => { const d = String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; };
  const link = (caminho) => `${caminho}${caminho.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  const SIT = { normal: ['entregue', 'Normal'], cancelado: ['cancelado', 'Cancelado'], complementar: ['em_transito', 'Complementar'], anulacao: ['ocorrencia', 'Anulação'], substituto: ['agendada', 'Substituto'] };
  const PAPEL = { remetente: 'Remetente', expedidor: 'Expedidor', recebedor: 'Recebedor', 'destinatário': 'Destinatário', outros: 'Outros' };
  const MODAIS = { '01': 'Rodoviário', '02': 'Aéreo', '03': 'Aquaviário', '04': 'Ferroviário', '05': 'Dutoviário', '06': 'Multimodal' };
  const SERVICOS = { 0: 'Normal', 1: 'Subcontratação', 2: 'Redespacho', 3: 'Redespacho intermediário', 4: 'Vinculado a multimodal' };
  let dados = null; let montado = false;
  const campo = (id, rotulo, extra = '') => `<div class="campo" style="margin:0;"><label>${rotulo}</label><input id="${id}" class="cte-entrada" ${extra} /></div>`;

  function montar() {
    montado = true;
    cont.innerHTML = `<div class="painel" style="margin-bottom:12px;"><div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:10px; align-items:end;">
        ${campo('ctrBusca', 'Número, chave, NF ou pedido')}${campo('ctrTransp', 'Transportadora (nome ou CNPJ)')}${campo('ctrToma', 'Tomador (nome ou CNPJ)')}
        ${campo('ctrRem', 'Remetente (nome ou CNPJ)')}${campo('ctrDest', 'Destinatário (nome ou CNPJ)')}
        ${campo('ctrCidIni', 'Município de origem')}${campo('ctrUfIni', 'UF de origem', 'maxlength="2"')}${campo('ctrCidFim', 'Município de destino')}${campo('ctrUfFim', 'UF de destino', 'maxlength="2"')}
        <div class="campo" style="margin:0;"><label>Modal</label><select id="ctrModal" class="cte-entrada"><option value="">Todos</option>${Object.entries(MODAIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="campo" style="margin:0;"><label>Tipo de serviço</label><select id="ctrServ" class="cte-entrada"><option value="">Todos</option>${Object.entries(SERVICOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        ${campo('ctrCfop', 'CFOP', 'maxlength="4"')}
        <div class="campo" style="margin:0; grid-column:span 2;"><label>Período (emissão do CT-e)</label><div style="display:flex; gap:6px; align-items:center;">${Periodo.html('ctr')}</div></div>
        <div class="campo" style="margin:0;"><label>Situação</label><select id="ctrSit" class="cte-entrada"><option value="">Todas</option>${Object.entries(SIT).map(([k, [, v]]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      </div></div>
      <div id="ctrResumo" class="oc-resumo"></div>
      <div class="painel" style="overflow-x:auto;"><div id="ctrTabela"></div></div>`;
    Periodo.ligar({ select: $('ctrPer'), de: $('ctrDe'), ate: $('ctrAte'), chave: 'ctes-recebidos', padrao: '30d', opcoes: ['7d', '30d', 'mes', 'mes_passado', '3m', 'ano', '12m', 'tudo', 'custom'], aoMudar: () => carregar() });
    let t = null;
    ['ctrBusca', 'ctrTransp', 'ctrToma', 'ctrRem', 'ctrDest', 'ctrCidIni', 'ctrUfIni', 'ctrCidFim', 'ctrUfFim', 'ctrCfop'].forEach((id) => $(id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 400); }));
    ['ctrModal', 'ctrServ', 'ctrSit'].forEach((id) => $(id).addEventListener('change', carregar));
    $('ctrTabela').addEventListener('click', (e) => { const b = e.target.closest('[data-ctr-ver]'); if (b) detalhe(Number(b.dataset.ctrVer)); });
  }
  const filtros = () => new URLSearchParams({ busca: $('ctrBusca').value.trim(), transportadora: $('ctrTransp').value.trim(), tomador: $('ctrToma').value.trim(),
    remetente: $('ctrRem').value.trim(), destinatario: $('ctrDest').value.trim(), cidade_inicio: $('ctrCidIni').value.trim(), uf_inicio: $('ctrUfIni').value.trim(),
    cidade_fim: $('ctrCidFim').value.trim(), uf_fim: $('ctrUfFim').value.trim(), modal: $('ctrModal').value, servico: $('ctrServ').value, cfop: $('ctrCfop').value.trim(),
    de: $('ctrDe').value, ate: $('ctrAte').value, situacao: $('ctrSit').value });
  const pequeno = (v) => (v ? `<br><small style="color:var(--texto-fraco);">${v}</small>` : '');
  async function carregar() {
    const r = await apiFetch(`/api/ctes-recebidos?${filtros()}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('ctrTabela').innerHTML = `<div style="color:var(--vermelho);">${esc(j.erro || 'Erro.')}</div>`; return; }
    dados = j;
    const t = j.totais;
    $('ctrResumo').innerHTML = `<div>CT-e<b>${t.ctes}</b><span>${j.limite ? 'mostrando os 2000 mais recentes' : `de ${t.transportadoras} transportadora(s)`}</span></div>
      <div>Valor do frete<b>${moeda(t.frete)}</b><span>sem os cancelados</span></div>
      <div>ICMS<b>${moeda(t.icms)}</b><span>base ${moeda(t.base_icms)}</span></div>
      <div>Cancelados<b style="color:${t.cancelados ? 'var(--vermelho)' : 'inherit'};">${t.cancelados}</b><span>no filtro</span></div>`;
    $('ctrTabela').innerHTML = j.ctes.length ? `<table style="width:100%;"><thead><tr><th>CT-e / série</th><th>Emissão</th><th>Transportadora</th><th>Tomador</th><th>Remetente</th><th>Destinatário</th><th>Origem → destino</th><th>Modal / serviço</th><th style="text-align:right;">Frete</th><th style="text-align:right;">ICMS</th><th>Situação</th><th></th></tr></thead><tbody>
      ${j.ctes.map((c) => `<tr><td><b>${esc(c.numero_cte)}</b>${c.cte_serie ? ` <small style="color:var(--texto-fraco);">série ${esc(c.cte_serie)}</small>` : ''}${pequeno(c.numero_nf ? `NF ${esc(c.numero_nf)}` : '')}</td>
        <td>${dia(c.data_emissao_cte)}</td><td>${esc(c.transportadora_cte || '—')}${pequeno(doc(c.transportadora_cnpj_cte))}</td>
        <td>${esc(c.tomador_cte_nome || PAPEL[c.tomador_cte_papel] || '—')}${pequeno(PAPEL[c.tomador_cte_papel] || '')}</td>
        <td>${esc(c.cte_remetente_nome || '—')}${pequeno(doc(c.cte_remetente_doc))}</td><td>${esc(c.cte_destinatario_nome || '—')}${pequeno(doc(c.cte_destinatario_doc))}</td>
        <td>${esc(c.cte_cidade_inicio || '')}/${esc(c.uf_inicio_cte || '')}<br>→ ${esc(c.cte_cidade_fim || '')}/${esc(c.uf_fim_cte || '')}</td>
        <td>${esc(MODAIS[c.cte_modal] || '—')}${pequeno(esc(SERVICOS[c.tp_serv_cte] || ''))}</td>
        <td style="text-align:right;">${moeda(c.valor_frete)}</td><td style="text-align:right;">${moeda(c.cte_icms_valor)}${pequeno(c.cte_icms_aliquota != null ? `${String(c.cte_icms_aliquota).replace('.', ',')}%` : '')}</td>
        <td><span class="oc-sit ${SIT[c.situacao][0]}">${SIT[c.situacao][1]}</span>${c.eventos ? pequeno(`${c.eventos} evento(s)`) : ''}</td>
        <td style="white-space:nowrap;"><button class="btn btn-secundario" data-ctr-ver="${c.id}" style="width:auto; padding:4px 9px; font-size:11.5px;">Abrir</button></td></tr>`).join('')}</tbody></table>`
      : '<div style="padding:20px; text-align:center; color:var(--texto-fraco);">Nenhum CT-e com esses filtros.</div>';
  }
  nav.addEventListener('click', () => { if (!montado) montar(); carregar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })); });

  async function detalhe(id) {
    const c = dados.ctes.find((x) => x.id === id);
    if (!c) return;
    const linha = (r, v) => `<tr><td style="color:var(--texto-fraco); width:34%;">${r}</td><td><b>${v}</b></td></tr>`;
    const quem = (nome, d) => `${esc(nome || '—')}${d ? ` · ${doc(d)}` : ''}`;
    const corpo = `<table style="width:100%; font-size:13px;"><tbody>
      ${linha('Chave de acesso', `<span style="font-family:monospace;">${esc(String(c.chave_cte || '—').replace(/(.{4})/g, '$1 '))}</span>`)}
      ${linha('Número / série / emissão', `${esc(c.numero_cte)} / ${esc(c.cte_serie || '—')} / ${dia(c.data_emissao_cte)}`)}
      ${linha('Situação', `${SIT[c.situacao][1]}${c.cte_cancelado_motivo ? ` — ${esc(c.cte_cancelado_motivo)}` : ''}`)}${linha('Protocolo de autorização', esc(c.cte_protocolo || '—'))}
      ${linha('Emitente (transportadora)', quem(c.transportadora_cte, c.transportadora_cnpj_cte))}
      ${linha('Tomador (quem paga)', `${quem(c.tomador_cte_nome, c.tomador_cte_cnpj)}${c.tomador_cte_papel ? ` (${esc(PAPEL[c.tomador_cte_papel] || c.tomador_cte_papel)})` : ''}`)}
      ${linha('Remetente', quem(c.cte_remetente_nome, c.cte_remetente_doc))}${linha('Destinatário', quem(c.cte_destinatario_nome, c.cte_destinatario_doc))}
      ${linha('Origem', `${esc(c.cte_cidade_inicio || '—')} / ${esc(c.uf_inicio_cte || '—')}`)}${linha('Destino', `${esc(c.cte_cidade_fim || '—')} / ${esc(c.uf_fim_cte || '—')}`)}
      ${linha('Modal / tipo de serviço', `${esc(MODAIS[c.cte_modal] || '—')} / ${esc(SERVICOS[c.tp_serv_cte] || '—')}`)}${linha('CFOP', esc(c.cte_cfop || '—'))}
      ${linha('Valor total do frete', moeda(c.valor_frete))}
      ${linha('ICMS', `${c.cte_icms_cst ? `CST ${esc(c.cte_icms_cst)} · ` : ''}base ${moeda(c.cte_icms_base)} · alíquota ${c.cte_icms_aliquota != null ? `${String(c.cte_icms_aliquota).replace('.', ',')}%` : '—'} · valor ${moeda(c.cte_icms_valor)}`)}
      ${linha('Nota / pedido', `${esc(c.numero_nf || '—')} / ${esc(c.numero_pedido || '—')}`)}</tbody></table>`;
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:820px; width:100%; max-height:92vh; overflow-y:auto; padding:20px 22px;">
      <div style="display:flex; justify-content:space-between;"><h3 style="margin:0;">🚛 CT-e ${esc(c.numero_cte)}</h3><span style="cursor:pointer; font-size:18px;" data-ctr-fechar>✕</span></div>
      <div style="margin-top:12px;">${corpo}</div>
      <div id="ctrHist" style="margin-top:14px; font-size:12.5px; color:var(--texto-fraco);">Carregando o histórico…</div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px; flex-wrap:wrap;">
        ${c.tem_xml ? `<a class="btn btn-secundario" style="width:auto;" href="${link(`/api/ctes-recebidos/${c.id}/dacte`)}" target="_blank" rel="noopener">📄 DACTE (imprimir / PDF)</a>
        <a class="btn btn-secundario" style="width:auto;" href="${link(`/api/ctes-recebidos/${c.id}/xml`)}">⬇ XML do CT-e</a>` : '<span style="color:var(--texto-fraco); align-self:center;">CT-e sem XML guardado</span>'}
        <button class="btn btn-primario" data-ctr-fechar style="width:auto;">Fechar</button></div></div>`;
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-ctr-fechar]')) fundo.remove(); });
    // Histórico: eventos (com o XML de cada um), auditoria, fatura e pagamento.
    try {
      const r = await apiFetch(`/api/fretes/${id}/historico`);
      const h = await r.json();
      const ev = h?.historico || [];
      const alvo = fundo.querySelector('#ctrHist');
      if (!alvo) return;
      alvo.innerHTML = ev.length ? `<p style="margin:0 0 6px; color:var(--texto);"><strong>🕘 Histórico do documento</strong></p>
        <table style="width:100%; font-size:12px;"><tbody>${ev.map((e) => `<tr><td style="white-space:nowrap; vertical-align:top;">${dataHora(e.quando)}</td><td style="color:var(--texto);">${esc(e.texto)}${e.evento_id ? ` <a href="${link(`/api/ctes-recebidos/${id}/eventos/${e.evento_id}/xml`)}" title="XML do evento" style="white-space:nowrap;">⬇ XML do evento</a>` : ''}</td>
          <td style="vertical-align:top;">${esc(e.quem || '')}</td></tr>`).join('')}</tbody></table>`
        : 'Sem histórico registrado.';
    } catch { const a = fundo.querySelector('#ctrHist'); if (a) a.textContent = ''; }
  }

  $('ctrExcel')?.addEventListener('click', () => {
    if (!dados) return;
    window.exportarExcel(`ctes-recebidos-${new Date().toISOString().slice(0, 10)}`, [{ nome: 'CT-e recebidos',
      colunas: ['CT-e', 'Série', 'Chave', 'Emissão', 'Transportadora', 'CNPJ transportadora', 'Tomador', 'CNPJ tomador', 'Remetente', 'CNPJ/CPF remetente', 'Destinatário', 'CNPJ/CPF destinatário',
        'Município origem', 'UF origem', 'Município destino', 'UF destino', 'Modal', 'Tipo de serviço', 'CFOP', 'Valor do frete', 'Base ICMS', 'Alíquota ICMS', 'Valor ICMS', 'NF', 'Pedido', 'Situação'],
      linhas: dados.ctes.map((c) => [c.numero_cte, c.cte_serie || '', c.chave_cte || '', dia(c.data_emissao_cte), c.transportadora_cte || '', doc(c.transportadora_cnpj_cte), c.tomador_cte_nome || '', doc(c.tomador_cte_cnpj),
        c.cte_remetente_nome || '', doc(c.cte_remetente_doc), c.cte_destinatario_nome || '', doc(c.cte_destinatario_doc), c.cte_cidade_inicio || '', c.uf_inicio_cte || '', c.cte_cidade_fim || '', c.uf_fim_cte || '',
        MODAIS[c.cte_modal] || '', SERVICOS[c.tp_serv_cte] || '', c.cte_cfop || '', c.valor_frete, c.cte_icms_base, c.cte_icms_aliquota, c.cte_icms_valor, c.numero_nf || '', c.numero_pedido || '', SIT[c.situacao][1]]) }])
      .catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
  });
  // CT-e na SEFAZ (distribuição DF-e): busca agora, busca automática e o que veio.
  const RESULTADOS = { importado: ['entregue', 'Importado'], ja_existia: ['em_transito', 'Já estava no sistema'], proprio: ['agendada', 'Emitido pela empresa'],
    evento: ['entregue', 'Evento aplicado'], ignorado: ['em_transito', 'Só resumo'], erro: ['ocorrencia', 'Não importado'], antigo: ['em_transito', 'Antigo (pulado)'] };
  async function abrirSefaz() {
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-ctr-fechar]')) fundo.remove(); });
    const ehAdmin = usuario?.perfil === 'admin';
    const podeBuscar = ehAdmin || !!usuario?.pode_enviar_xml;
    const desenhar = async () => {
      const r = await apiFetch('/api/sefaz/ctes');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Erro ao ler a situação.');
      const e = j.estado || {};
      const prox = e.proxima_consulta && Date.parse(e.proxima_consulta) > Date.now() ? new Date(e.proxima_consulta) : null;
      const u = e.ultimo_resultado;
      fundo.innerHTML = `<div class="painel modal-card" style="max-width:860px; width:100%; max-height:92vh; overflow-y:auto; padding:20px 22px;">
        <div style="display:flex; justify-content:space-between;"><h3 style="margin:0;">📡 CT-e na SEFAZ</h3><span style="cursor:pointer; font-size:18px;" data-ctr-fechar>✕</span></div>
        <p style="font-size:13px; color:var(--texto-fraco); margin:8px 0 12px;">Os CT-e em que a sua empresa aparece (tomadora, remetente, destinatária, expedidora, recebedora ou autorizada a baixar o XML)
          são buscados no Ambiente Nacional com o certificado digital da Configuração fiscal e entram aqui sozinhos, com os eventos (cancelamento, carta de correção).
          A SEFAZ só aceita uma nova consulta 1 hora depois de responder "nenhum documento novo".${j.demo ? ' <b>Modo demonstração:</b> a SEFAZ é simulada.' : ''}</p>
        <div class="oc-resumo" style="margin-bottom:12px;">
          <div>Última consulta<b style="font-size:15px;">${e.ultima_consulta ? dataHora(e.ultima_consulta) : 'nunca'}</b><span>${e.ultimo_cstat ? `${esc(e.ultimo_cstat)} — ${esc(e.ultimo_motivo || '')}` : '—'}</span></div>
          <div>Resultado<b style="font-size:15px;">${u ? `${u.importados} novo(s)` : '—'}</b><span>${u ? `${u.documentos} documento(s) · ${u.ja_existiam} já existia(m) · ${u.eventos} evento(s)${u.erros ? ` · ${u.erros} com erro` : ''}` : ''}</span></div>
          <div>Próxima consulta<b style="font-size:15px;">${prox ? prox.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'liberada'}</b><span>último NSU ${esc(e.ult_nsu ?? 0)}</span></div>
        </div>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
          ${podeBuscar ? `<button class="btn btn-primario" id="ctrSefazBuscar" style="width:auto;" ${prox && !j.demo ? 'disabled' : ''}>🔄 Buscar agora</button>` : ''}
          <label style="display:flex; gap:6px; align-items:center; font-size:13px;"><input type="checkbox" id="ctrSefazAuto" ${j.config?.ativo ? 'checked' : ''} ${ehAdmin ? '' : 'disabled'} style="width:auto;" />
            Buscar sozinho (a cada hora)${ehAdmin ? '' : ' — só o administrador muda'}</label>
          ${ehAdmin ? `<label style="display:flex; gap:6px; align-items:center; font-size:13px;" title="A próxima busca traz os documentos que vêm DEPOIS deste número (0 = tudo o que a SEFAZ ainda guarda, uns 3 meses). Os que já estão no sistema não duplicam.">Começar a partir do NSU
            <input id="ctrSefazNsu" inputmode="numeric" class="cte-entrada" style="width:150px; padding:5px 8px;" placeholder="atual: ${esc(e.ult_nsu ?? 0)}" /></label>
          <button class="btn btn-secundario" id="ctrSefazNsuUsar" style="width:auto;">Usar este NSU</button>
        </div>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
          <button class="btn btn-secundario" id="ctrSefazSoNovos" style="width:auto;" title="Pula todos os CT-e que a SEFAZ já tem e passa a trazer só os emitidos daqui pra frente">⏭ Só os novos daqui pra frente</button>
          <label style="display:flex; gap:6px; align-items:center; font-size:13px;" title="CT-e emitidos antes desta data são pulados (não entram no sistema). Vazio = importa todos.">Importar só os emitidos desde
            <input type="date" id="ctrSefazDesde" class="cte-entrada" style="width:160px; padding:5px 8px;" value="${esc(j.config?.importar_desde || '')}" /></label>
          <button class="btn btn-secundario" id="ctrSefazDesdeSalvar" style="width:auto;">Salvar data</button>` : ''}
        </div>
        <table class="edi-tabela"><thead><tr><th>NSU</th><th>Quando</th><th>CT-e / emitente</th><th>Resultado</th></tr></thead><tbody>
        ${(j.docs || []).map((d) => `<tr><td>${esc(d.nsu)}</td><td>${dataHora(d.criado_em)}</td>
          <td>${d.chave ? `<span style="font-family:monospace; font-size:11px;">${esc(d.chave)}</span>` : '—'}${pequeno(esc([d.emitente_nome, doc(d.emitente_doc)].filter(Boolean).join(' · ')))}</td>
          <td><span class="oc-sit ${(RESULTADOS[d.resultado] || RESULTADOS.erro)[0]}">${(RESULTADOS[d.resultado] || [0, d.resultado])[1]}</span>${pequeno(esc(d.mensagem || ''))}
            ${d.frete_id && d.chave ? `<br><a href="#" data-ctr-chave="${esc(d.chave)}">ver o CT-e</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--texto-fraco);">Nenhum documento buscado ainda.</td></tr>'}
        </tbody></table></div>`;
      fundo.querySelector('#ctrSefazSoNovos')?.addEventListener('click', async () => {
        if (!await confirmar('Pular todos os CT-e que a SEFAZ já tem para a empresa? Eles NÃO serão importados; a busca passa a trazer só os emitidos daqui pra frente. (Faz uma consulta à SEFAZ só para saber até onde pular; a próxima busca segue a espera de 1 hora da SEFAZ.)', { titulo: 'Só os novos daqui pra frente', textoOk: 'Pular os antigos' })) return;
        try {
          const rr = await apiFetch('/api/sefaz/ctes/so-novos', { method: 'POST' });
          const jj = await rr.json().catch(() => ({}));
          if (!rr.ok) throw new Error(jj.erro || 'Erro ao pular os antigos.');
          mostrarAlerta(`Pronto: ${jj.pulados} documento(s) antigo(s) pulado(s). A busca agora começa no NSU ${jj.ult_nsu} e traz só os CT-e novos.`, { tipo: 'sucesso' });
          desenhar().catch((err) => mostrarAlerta(err.message, { tipo: 'erro' }));
        } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
      });
      fundo.querySelector('#ctrSefazDesdeSalvar')?.addEventListener('click', async () => {
        const desde = fundo.querySelector('#ctrSefazDesde').value || null;
        try {
          const rr = await apiFetch('/api/sefaz/ctes/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ importar_desde: desde }) });
          const jj = await rr.json().catch(() => ({}));
          if (!rr.ok) throw new Error(jj.erro || 'Erro ao salvar.');
          mostrarAlerta(desde ? `Pronto: CT-e emitidos antes de ${desde.split('-').reverse().join('/')} serão pulados.` : 'Pronto: todos os CT-e serão importados.', { tipo: 'sucesso' });
        } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
      });
      fundo.querySelector('#ctrSefazNsuUsar')?.addEventListener('click', async () => {
        const nsu = fundo.querySelector('#ctrSefazNsu').value.trim();
        if (!/^\d+$/.test(nsu)) { mostrarAlerta('Informe o NSU só com números (0 = tudo o que a SEFAZ ainda guarda).', { tipo: 'aviso' }); return; }
        if (!await confirmar(`A próxima busca de CT-e vai trazer os documentos que vêm depois do NSU ${nsu}${Number(nsu) === 0 ? ' (tudo o que a SEFAZ ainda guarda, uns 3 meses)' : ''}. Hoje a busca está no NSU ${e.ult_nsu ?? 0}. Os CT-e que já estão no sistema não duplicam. Continuar?`, { titulo: 'Começar a partir do NSU', textoOk: 'Usar este NSU' })) return;
        try {
          const rr = await apiFetch('/api/sefaz/ctes/nsu', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nsu }) });
          const jj = await rr.json().catch(() => ({}));
          if (!rr.ok) throw new Error(jj.erro || 'Erro ao mudar o NSU.');
          mostrarAlerta(`Pronto: a próxima busca começa depois do NSU ${jj.ult_nsu}.${jj.liberada ? ' Já pode clicar em "Buscar agora".' : ' A SEFAZ só libera a próxima consulta no horário mostrado.'}`, { tipo: 'sucesso' });
          desenhar().catch((err) => mostrarAlerta(err.message, { tipo: 'erro' }));
        } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
      });
      fundo.querySelector('#ctrSefazBuscar')?.addEventListener('click', async (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = 'Buscando…';
        try {
          const rr = await apiFetch('/api/sefaz/ctes/consultar', { method: 'POST' });
          const jj = await rr.json().catch(() => ({}));
          if (!rr.ok) throw new Error(jj.erro || 'Erro ao buscar.');
          mostrarAlerta(`SEFAZ: ${jj.importados} CT-e novo(s), ${jj.ja_existiam} já existia(m), ${jj.eventos} evento(s)${jj.antigos ? `, ${jj.antigos} antigo(s) pulado(s)` : ''}${jj.erros ? `, ${jj.erros} com erro` : ''}.`, { tipo: jj.erros ? 'aviso' : 'sucesso' });
          if (montado) carregar();
        } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
        await desenhar().catch(() => {});
      });
      fundo.querySelector('#ctrSefazAuto')?.addEventListener('change', async (ev) => {
        const rr = await apiFetch('/api/sefaz/ctes/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: ev.target.checked }) });
        if (!rr.ok) { ev.target.checked = !ev.target.checked; mostrarAlerta('Não consegui salvar.', { tipo: 'erro' }); return; }
        mostrarAlerta(ev.target.checked ? 'Busca automática ligada: a cada hora o sistema pergunta à SEFAZ.' : 'Busca automática desligada.', { tipo: 'sucesso' });
      });
      fundo.querySelectorAll('[data-ctr-chave]').forEach((a) => a.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const rr = await apiFetch(`/api/ctes-recebidos?${new URLSearchParams({ busca: a.dataset.ctrChave })}`);
        const jj = await rr.json().catch(() => ({}));
        const c = (jj.ctes || []).find((x) => x.chave_cte === a.dataset.ctrChave);
        if (!c) { mostrarAlerta('CT-e não encontrado (ou fora das suas permissões).', { tipo: 'aviso' }); return; }
        if (!dados) dados = { ctes: [] };
        if (!dados.ctes.some((x) => x.id === c.id)) dados.ctes.push(c);
        detalhe(c.id);
      }));
    };
    fundo.innerHTML = '<div class="painel modal-card" style="padding:20px;">Carregando…</div>';
    try { await desenhar(); } catch (err) { fundo.remove(); mostrarAlerta(err.message, { tipo: 'erro' }); }
  }
  $('ctrSefaz')?.addEventListener('click', () => abrirSefaz());

  $('ctrZip')?.addEventListener('click', () => {
    if (!montado) return;
    const url = link(`/api/ctes-recebidos/zip?${filtros()}`);
    if (window.LinkSeguro?.ir) window.LinkSeguro.ir(url); else location.href = url;
  });
})();
