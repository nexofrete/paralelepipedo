// =====================================================================
// Notas e fretes » 🧾 Notas fiscais: consulta das NF-e com filtros (número,
// chave, emitente, destinatário, série, cidade/UF, período de emissão ou
// saída, situação), os dados completos de cada nota, o XML (um ou .zip),
// o DANFE e o Excel. Usa do dashboard.js: apiFetch, mostrarAlerta, token;
// do indicadores.js: exportarExcel; do linkSeguro.js: LinkSeguro.
// =====================================================================
(() => {
  const nav = document.querySelector('.nav-item[data-pagina="notas-fiscais"]');
  const cont = document.getElementById('nfConteudo');
  if (!nav || !cont) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const kg = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`);
  const dia = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10).split('-').reverse().join('/') : '—');
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const doc = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; };
  const SIT = { autorizada: ['entregue', 'Autorizada'], cancelada: ['devolvido', 'Cancelada'], denegada: ['ocorrencia', 'Denegada'] };
  // De onde veio o endereço de entrega (src/enderecoEntrega.js).
  const ORIGEM = { redespacho: 'Redespacho', xml_entrega: 'Local de entrega (XML)', dados_adicionais: 'Dados adicionais', destinatario: 'Destinatário', manual: 'Corrigido à mão' };
  const json = (v) => { if (typeof v !== 'string') return v || null; try { return JSON.parse(v); } catch { return null; } };
  const endTexto = (e) => (e ? [[e.logradouro, e.numero, e.complemento].filter(Boolean).join(', '), e.bairro, e.cidade || e.uf ? `${e.cidade || ''}/${e.uf || ''}` : '',
    e.cep ? `CEP ${String(e.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : ''].filter(Boolean).join(' — ') : '');
  const podeCorrigir = () => usuario?.perfil === 'admin' || !!usuario?.pode_editar_registros;
  let dados = null; let montado = false;
  const marcadas = new Set();   // notas marcadas para imprimir o DANFE em lote
  const link = (caminho) => `${caminho}${caminho.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;

  function montar() {
    montado = true;
    // Botões que vieram da antiga "Todos os registros", conforme a permissão.
    const adm = usuario?.perfil === 'admin';
    document.getElementById('nfNovoRegistro')?.classList.toggle('oculto', !(adm || usuario?.pode_editar_registros));
    document.getElementById('nfExcluir')?.classList.toggle('oculto', !(adm || usuario?.pode_excluir_registros));
    const sel = (id, opcoes) => `<select id="${id}" class="cte-entrada">${opcoes}</select>`;
    cont.innerHTML = `<div class="painel nf-filtros">
        <div class="nf-linha-filtros">
          <label class="nf-f nf-f-busca"><span>Buscar</span><input id="nfBusca" class="cte-entrada" placeholder="NF, chave, CT-e, pedido, cliente ou transportadora" /></label>
          <label class="nf-f"><span>Transportadora</span><input id="nfTransp" class="cte-entrada" placeholder="Todas" /></label>
          <label class="nf-f"><span>Entrega</span>${sel('nfEntrega', '<option value="">Todas</option><option value="entregue">✓ Entregues</option><option value="pendente">Não entregues</option><option value="atrasada">⚠ Atrasadas</option>')}</label>
          <label class="nf-f"><span>Situação da NF-e</span>${sel('nfSit', '<option value="">Todas</option><option value="autorizada">Autorizada</option><option value="cancelada">Cancelada</option><option value="denegada">Denegada</option><option value="sem_cte">Sem CT-e</option>')}</label>
        </div>
        <div class="nf-linha-filtros">
          <div class="nf-f nf-f-periodo"><span>Período</span>${Periodo.html('nf')}</div>
          <label class="nf-f"><span>Período pela</span>${sel('nfData', '<option value="emissao">Emissão</option><option value="saida">Saída</option>')}</label>
          <label class="nf-f"><span>Ordem</span>${sel('nfOrdem', '<option value="numero">Sequência (número)</option><option value="numero_desc">Sequência, maior primeiro</option><option value="recentes">Mais recentes primeiro</option>')}</label>
        </div>
        <details id="nfMaisFiltros" class="nf-mais"><summary>Mais filtros <small>(emitente, destinatário, série, cidade, UF, endereço de entrega)</small></summary>
          <div class="nf-linha-filtros">
            <label class="nf-f"><span>Emitente (nome ou CNPJ)</span><input id="nfEmit" class="cte-entrada" /></label>
            <label class="nf-f"><span>Destinatário (nome ou CNPJ)</span><input id="nfDest" class="cte-entrada" /></label>
            <label class="nf-f nf-f-curto"><span>Série</span><input id="nfSerie" class="cte-entrada" maxlength="3" /></label>
            <label class="nf-f"><span>Cidade</span><input id="nfCidade" class="cte-entrada" /></label>
            <label class="nf-f nf-f-curto"><span>UF</span><input id="nfUf" class="cte-entrada" maxlength="2" /></label>
            <label class="nf-f"><span>Endereço de entrega</span>${sel('nfEnd', '<option value="">Todos</option><option value="conferir">⚠ A conferir</option><option value="redespacho">Com redespacho</option><option value="local">Local de entrega diferente</option><option value="manual">Corrigidos à mão</option>')}</label>
          </div></details>
      </div>
      <div id="nfResumo" class="nf-resumo"></div>
      <div class="painel nf-rolagem-painel"><div id="nfTabela" class="nf-rolagem"></div></div>`;
    Periodo.ligar({ select: $('nfPer'), de: $('nfDe'), ate: $('nfAte'), chave: 'notas-fiscais', padrao: '30d', opcoes: ['7d', '30d', 'mes', 'mes_passado', '3m', 'ano', '12m', 'tudo', 'custom'], aoMudar: () => carregar() });
    let t = null;
    ['nfBusca', 'nfEmit', 'nfDest', 'nfSerie', 'nfCidade', 'nfUf', 'nfTransp'].forEach((id) => $(id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 400); }));
    try { const o = localStorage.getItem('notas.ordem'); if (o && [...$('nfOrdem').options].some((x) => x.value === o)) $('nfOrdem').value = o; } catch { /* sem armazenamento */ }
    $('nfOrdem').addEventListener('change', () => { try { localStorage.setItem('notas.ordem', $('nfOrdem').value); } catch { /* sem armazenamento */ } });
    ['nfData', 'nfSit', 'nfEnd', 'nfOrdem', 'nfEntrega'].forEach((id) => $(id).addEventListener('change', carregar));
    // Ações que vieram da antiga "Todos os registros".
    $('nfNovoRegistro')?.addEventListener('click', () => document.getElementById('btnNovoRegistro')?.click());
    $('nfExcluir')?.addEventListener('click', excluirMarcadas);
    $('nfTelaCheia')?.addEventListener('click', () => { const ativo = document.querySelector('.app-shell').classList.toggle('tela-cheia'); $('nfTelaCheia').textContent = ativo ? '✕ Sair da tela cheia' : '⛶ Tela cheia'; });
    // Dois cliques na linha: abre o documento.
    $('nfTabela').addEventListener('dblclick', (e) => {
      if (e.target.closest('input, button, a')) return;
      const tr = e.target.closest('tr[data-nf-id]'); if (tr) detalhe(Number(tr.dataset.nfId));
    });
    $('nfTabela').addEventListener('click', (e) => {
      const b = e.target.closest('[data-nf-ver]'); if (b) { detalhe(Number(b.dataset.nfVer)); return; }
      const c = e.target.closest('[data-nf-chave]');
      if (c) {
        const v = c.dataset.nfChave; const ok = () => mostrarAlerta('Chave da NF-e copiada.', { tipo: 'sucesso' });
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(v).then(ok).catch(() => mostrarAlerta(v)); else mostrarAlerta(v);
      }
    });
    $('nfTabela').addEventListener('change', (e) => {
      const c = e.target.closest('[data-nf-marca]');
      if (c) { if (c.checked) marcadas.add(Number(c.dataset.nfMarca)); else marcadas.delete(Number(c.dataset.nfMarca)); botaoDanfes(); return; }
      if (e.target.id === 'nfMarcaTodas') {
        dados.notas.forEach((n) => { if (e.target.checked) marcadas.add(n.id); else marcadas.delete(n.id); });
        $('nfTabela').querySelectorAll('[data-nf-marca]').forEach((x) => { x.checked = e.target.checked; });
        botaoDanfes();
      }
    });
  }
  const filtros = () => new URLSearchParams({ busca: $('nfBusca').value.trim(), emitente: $('nfEmit').value.trim(), destinatario: $('nfDest').value.trim(), serie: $('nfSerie').value.trim(),
    cidade: $('nfCidade').value.trim(), uf: $('nfUf').value.trim(), data: $('nfData').value, de: $('nfDe').value, ate: $('nfAte').value, situacao: $('nfSit').value, endereco: $('nfEnd').value, ordem: $('nfOrdem').value, entrega: $('nfEntrega').value, transportadora: $('nfTransp').value.trim() });
  async function carregar() {
    const r = await apiFetch(`/api/notas?${filtros()}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('nfTabela').innerHTML = `<div style="color:var(--vermelho);">${esc(j.erro || 'Erro.')}</div>`; return; }
    dados = j;
    const t = j.totais;
    $('nfResumo').innerHTML = `<div>Notas<b>${Number(t.notas).toLocaleString('pt-BR')}</b><span>${j.limite ? 'mostrando as 2000 mais recentes' : 'no filtro'}</span></div><div>Valor das notas<b>${moeda(t.valor)}</b><span>produtos ${moeda(t.produtos)}</span></div>
      <div>Peso<b>${Number(t.peso || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg</b><span>${Number(t.volumes || 0).toLocaleString('pt-BR')} volume(s)</span></div><div>Canceladas<b style="color:${t.canceladas ? 'var(--vermelho)' : 'inherit'};">${t.canceladas}</b><span>denegadas: ${t.denegadas}</span></div>
      <div style="cursor:pointer;" id="nfResumoConferir" title="Mostrar só as notas com endereço a conferir">Endereço a conferir<b style="color:${t.conferir_endereco ? '#d97706' : 'inherit'};">${t.conferir_endereco || 0}</b><span>lido do texto sem certeza</span></div>`;
    $('nfResumo').insertAdjacentHTML('afterbegin', `<div style="cursor:pointer;" data-nf-filtro-entrega="entregue" title="Mostrar só as entregues">Entregues<b style="color:var(--verde);">${t.entregues || 0}</b><span>com data de entrega</span></div>
      <div style="cursor:pointer;" data-nf-filtro-entrega="pendente" title="Mostrar só as não entregues">Não entregues<b>${t.nao_entregues || 0}</b><span>sem data de entrega</span></div>
      <div style="cursor:pointer;" data-nf-filtro-entrega="atrasada" title="Mostrar só as atrasadas">Atrasadas<b style="color:${t.atrasadas ? 'var(--vermelho)' : 'inherit'};">${t.atrasadas || 0}</b><span>passou da previsão</span></div>`);
    $('nfResumo').querySelectorAll('[data-nf-filtro-entrega]').forEach((el) => el.addEventListener('click', () => { $('nfEntrega').value = el.dataset.nfFiltroEntrega; carregar(); }));
    if (j.faltando) {
      $('nfResumo').insertAdjacentHTML('beforeend', `<div title="${esc(j.faltando.faixas.slice(0, 15).map((f) => `${f.emitente || ''} série ${f.serie || '—'}: ${f.de === f.ate ? f.de : `${f.de} a ${f.ate}`}`).join('\n'))}">Faltando na sequência<b style="color:${j.faltando.total ? '#d97706' : 'var(--verde)'};">${j.faltando.total}</b><span>${j.faltando.total ? 'números pulados (veja na lista)' : 'sem números pulados'}</span></div>`);
    }
    $('nfResumoConferir')?.addEventListener('click', () => { $('nfEnd').value = 'conferir'; $('nfMaisFiltros').open = true; carregar(); });
    $('nfTabela').innerHTML = j.notas.length ? `<table style="width:100%;"><thead><tr><th style="width:24px;"><input type="checkbox" id="nfMarcaTodas" title="Marcar todas (para imprimir o DANFE)" /></th><th>NF / série</th><th>Emissão</th><th>Saída</th><th>Emitente</th><th>Destinatário</th><th>Destino</th><th>Transportadora / CT-e</th><th>Entrega</th><th style="text-align:right;">Produtos</th><th style="text-align:right;">Total</th><th style="text-align:right;">Peso bruto</th><th style="text-align:right;">Vol.</th><th>Situação</th><th></th></tr></thead><tbody>
      ${j.notas.map((n) => `${linhaFaltando(n, j)}<tr data-nf-id="${n.id}" class="nf-linha" title="Dois cliques para ver o documento"><td><input type="checkbox" data-nf-marca="${n.id}" ${marcadas.has(n.id) ? 'checked' : ''} /></td><td><b>${esc(n.numero_nf)}</b>${n.nf_serie ? ` <small style="color:var(--texto-fraco);">série ${esc(n.nf_serie)}</small>` : ''}${n.numero_cte ? `<br><small style="color:var(--texto-fraco);">CT-e ${esc(n.numero_cte)}</small>` : ''}${n.chave_nfe ? `<br><button type="button" class="ep-chave-cte" data-nf-chave="${esc(n.chave_nfe)}" title="Chave de acesso: ${esc(String(n.chave_nfe).replace(/(\d{4})(?=\d)/g, '$1 '))} — clique para copiar">🔑 ${esc(String(n.chave_nfe).slice(0, 4))}…${esc(String(n.chave_nfe).slice(-8).replace(/(\d{4})(?=\d)/, '$1 '))} <span class="ep-chave-copiar">copiar</span></button>` : ''}</td>
        <td>${dia(n.data_emissao_nf)}</td><td>${n.data_saida ? dataHora(n.data_saida) : '—'}</td><td>${esc(n.emitente_nome || '—')}<br><small style="color:var(--texto-fraco);">${doc(n.emitente_cnpj)}</small></td>
        <td>${esc(n.cliente || '—')}<br><small style="color:var(--texto-fraco);">${doc(n.cliente_documento)}</small></td><td>${celulaEntrega(n)}</td><td>${celulaTransp(n)}</td><td>${celulaSituacaoEntrega(n)}</td>
        <td style="text-align:right;">${moeda(n.valor_produtos)}</td><td style="text-align:right;">${moeda(n.valor_faturado)}</td><td style="text-align:right;">${kg(n.peso_bruto ?? n.peso_kg)}</td><td style="text-align:right;">${n.qtd_volumes ?? '—'}</td>
        <td><span class="oc-sit ${SIT[n.situacao][0]}">${SIT[n.situacao][1]}</span></td>
        <td style="white-space:nowrap;"><button class="btn btn-secundario" data-nf-ver="${n.id}" style="width:auto; padding:4px 9px; font-size:11.5px;">Abrir</button>
          ${n.tem_xml ? `<a class="btn btn-secundario" href="${link(`/api/notas/${n.id}/danfe`)}" target="_blank" rel="noopener" style="width:auto; padding:4px 9px; font-size:11.5px;" title="Gerar o DANFE desta nota (imprimir ou salvar em PDF)">📄 DANFE</a>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div style="padding:20px; text-align:center; color:var(--texto-fraco);">Nenhuma nota com esses filtros.</div>';
    botaoDanfes();
  }
  // Na ordem da sequência: antes da nota, uma linha avisando os números pulados (mesmo emitente e série).
  function linhaFaltando(n, j) {
    if (!j.faltando?.faixas?.length) return '';
    const num = Number(String(n.numero_nf || '').replace(/\D/g, ''));
    const f = j.faltando.faixas.find((x) => x.emitente_cnpj === n.emitente_cnpj && (x.serie || null) === (n.nf_serie || null) && (j.ordem === 'numero' ? x.ate + 1 === num : x.de - 1 === num));
    if (!f) return '';
    return `<tr class="nf-faltando"><td colspan="15">⚠ ${f.qtd === 1 ? `Falta a nota <b>${f.de}</b>` : `Faltam <b>${f.qtd}</b> notas: <b>${f.de}</b> a <b>${f.ate}</b>`} na sequência (série ${esc(f.serie || '—')}) — ${f.qtd === 1 ? 'não entrou no sistema ou foi inutilizada' : 'não entraram no sistema ou foram inutilizadas'}.</td></tr>`;
  }
  // Coluna Entrega: para onde a transportadora leva (redespacho ou local de entrega) e de onde veio.
  function celulaEntrega(n) {
    const r = json(n.redespacho_endereco); const e = json(n.entrega_endereco);
    const alvo = r || e;
    const cid = alvo?.cidade ? `${alvo.cidade}/${alvo.uf || ''}` : `${n.cidade || ''}/${n.uf || ''}`;
    const origem = n.endereco_origem || alvo?.origem;
    const aviso = n.endereco_conferir ? ` <span title="Conferir: ${esc(n.endereco_conferir_motivo || 'leitura sem certeza')}" style="color:#d97706; cursor:help;">⚠</span>` : '';
    return `${esc(cid)}${aviso}${origem && origem !== 'destinatario' ? `<br><small style="color:var(--texto-fraco);">${esc(ORIGEM[origem] || origem)}${r?.nome ? `: ${esc(r.nome)}` : ''}</small>` : ''}`;
  }
  const hojeIso = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const ORIGEM_ENTREGA = { ssw: 'SSW', portal: 'portal da transportadora', manual: 'lançada à mão', sefaz: 'comprovante na SEFAZ', comprovante: 'comprovante', edi: 'EDI', motorista: 'app do motorista' };
  function celulaTransp(n) {
    if (!n.numero_cte && !n.chave_cte) return `<span style="color:var(--texto-fraco);">${esc(n.transportadora_nfe || '—')}</span><br><small style="color:#d97706;">sem CT-e</small>`;
    return `${esc(n.transportadora || '—')}<br><small style="color:var(--texto-fraco);">CT-e ${esc(n.numero_cte || '—')}${n.data_emissao_cte ? ` · ${dia(n.data_emissao_cte)}` : ''}${n.valor_total_cte != null ? ` · ${moeda(n.valor_total_cte)}` : ''}</small>`;
  }
  // Situação da entrega: entregue (data e origem), atrasada, em trânsito (previsão) ou aguardando o CT-e.
  function celulaSituacaoEntrega(n) {
    if (n.data_entrega) return `<span class="oc-sit entregue">✓ Entregue ${dia(n.data_entrega)}</span>${n.data_entrega_origem || n.canhoto_recebido_por ? `<br><small style="color:var(--texto-fraco);">${esc([ORIGEM_ENTREGA[n.data_entrega_origem] || n.data_entrega_origem, n.canhoto_recebido_por ? `recebido por ${n.canhoto_recebido_por}` : ''].filter(Boolean).join(' · '))}</small>` : ''}`;
    if (n.situacao !== 'autorizada' || n.nf_devolvida) return '<span style="color:var(--texto-fraco);">—</span>';
    if (!n.numero_cte && !n.chave_cte) return '<span class="oc-sit pendente">Aguardando CT-e</span>';
    const prev = n.data_entrega_prevista ? String(n.data_entrega_prevista).slice(0, 10) : null;
    const ult = n.rastreio_ultima_ocorrencia ? `<br><small style="color:${n.rastreio_problema ? 'var(--vermelho)' : 'var(--texto-fraco)'};" title="${esc(n.rastreio_ultima_ocorrencia)}">${esc(String(n.rastreio_ultima_ocorrencia).replace(/^\[Redespacho[^\]]*\]\s*/, '').split(' — ')[0].slice(0, 40))}</small>` : '';
    if (prev && prev < hojeIso()) {
      const dias = Math.round((Date.parse(hojeIso()) - Date.parse(prev)) / 86400000);
      return `<span class="oc-sit ocorrencia">Atrasada ${dias} dia(s)</span><br><small style="color:var(--texto-fraco);">previsão ${dia(prev)}</small>${ult}`;
    }
    return `<span class="oc-sit em_transito">Em trânsito</span>${prev ? `<br><small style="color:var(--texto-fraco);">previsão ${dia(prev)}</small>` : ''}${ult}`;
  }
  // Excluir as notas marcadas (o mesmo da antiga "Todos os registros").
  async function excluirMarcadas() {
    if (!marcadas.size) { mostrarAlerta('Marque as notas que quer excluir (caixas à esquerda).', { tipo: 'aviso' }); return; }
    if (!await confirmar(`Excluir ${marcadas.size} nota(s) e os fretes ligados a elas? Isso não pode ser desfeito.`, { titulo: 'Excluir notas', tipo: 'perigo', textoOk: 'Excluir' })) return;
    const r = await apiFetch('/api/fretes/excluir-lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...marcadas] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { mostrarAlerta(j.erro || 'Não foi possível excluir.', { tipo: 'erro' }); return; }
    marcadas.clear(); mostrarAlerta(`${j.excluidos ?? 'As'} nota(s) excluída(s).`, { tipo: 'sucesso' }); carregar();
  }
  function botaoDanfes() {
    const b = $('nfDanfes'); if (!b) return;
    b.textContent = marcadas.size ? `🖨 Imprimir DANFE (${marcadas.size} marcada${marcadas.size > 1 ? 's' : ''})` : '🖨 Imprimir DANFE (notas do filtro)';
  }
  nav.addEventListener('click', () => { if (!montado) montar(); carregar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })); });
  // Fechou a janela do registro do frete (editado a partir daqui): atualiza a lista.
  const formReg = document.getElementById('painelFormRegistro');
  if (formReg) new MutationObserver(() => { if (formReg.classList.contains('oculto') && montado && !document.getElementById('pagina-notas-fiscais')?.classList.contains('oculto')) carregar().catch(() => {}); })
    .observe(formReg, { attributes: true, attributeFilter: ['class'] });
  // Abrir a consulta já filtrada (ex.: "Aguardando CT-e" da Visão geral).
  window.abrirConsultaNotas = (f = {}) => {
    if (!montado) montar();
    if (f.situacao != null) $('nfSit').value = f.situacao;
    if (f.entrega != null) $('nfEntrega').value = f.entrega;
    // Notas de um dia (Faturamento do dia da Visão geral): só as autorizadas da data, e do estado se escolhido.
    if (f.de) {
      ['nfBusca', 'nfEmit', 'nfDest', 'nfSerie', 'nfCidade', 'nfTransp'].forEach((id) => { $(id).value = ''; });
      $('nfEntrega').value = ''; $('nfEnd').value = ''; $('nfSit').value = 'autorizada'; $('nfData').value = 'emissao';
      $('nfUf').value = f.uf || ''; if (f.uf) $('nfMaisFiltros').open = true;
      $('nfPer').value = 'custom'; $('nfPer').closest('.periodo')?.classList.remove('periodo-tudo');
      $('nfDe').value = f.de; $('nfAte').value = f.ate || f.de;
    }
    if (f.abrir) { nav.click(); return; }   // abre a tela, que carrega com esses filtros
    carregar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
  };

  // Consulta rápida na Visão geral: digita NF, chave, CT-e, pedido, cliente ou transportadora e vê as notas
  // na hora (sem período), com a entrega; clique abre a nota; Enter (ou "ver todas") abre a Consulta de notas.
  (() => {
    const campo = $('vgBuscaNota'); const caixa = $('vgBuscaRes');
    if (!campo || !caixa) return;
    let t; let seq = 0; let achadas = [];
    const fechar = () => caixa.classList.add('oculto');
    const abrirConsulta = () => {
      fechar();
      if (!montado) montar();
      // A busca vale para todas as datas (só nesta abertura; o período escolhido fica guardado como estava).
      $('nfBusca').value = campo.value.trim(); $('nfPer').value = 'tudo'; $('nfPer').closest('.periodo')?.classList.add('periodo-tudo'); $('nfDe').value = ''; $('nfAte').value = '';
      nav.click();   // abre a tela e carrega com a busca
    };
    async function buscar() {
      const termo = campo.value.trim();
      if (termo.length < 2) { fechar(); return; }
      const meu = ++seq;
      caixa.innerHTML = '<div class="vg-busca-vazio">Procurando…</div>'; caixa.classList.remove('oculto');
      const r = await apiFetch(`/api/notas?${new URLSearchParams({ busca: termo, rapida: '1', limite: '8', ordem: 'recentes' })}`).catch(() => null);
      if (meu !== seq) return;
      const j = r && r.ok ? await r.json().catch(() => ({})) : {};
      achadas = j.notas || [];
      caixa.innerHTML = achadas.length ? `${achadas.map((n, i) => `<div class="vg-busca-item" data-i="${i}" tabindex="-1">
          <div class="vg-busca-nf"><b>NF ${esc(n.numero_nf)}</b>${n.nf_serie ? ` <small>série ${esc(n.nf_serie)}</small>` : ''}<br><small>${dia(n.data_emissao_nf)}</small></div>
          <div class="vg-busca-cli">${esc(n.cliente || '—')}<br><small>${esc([n.cidade, n.uf].filter(Boolean).join('/'))}${n.numero_pedido ? ` · pedido ${esc(n.numero_pedido)}` : ''}</small></div>
          <div class="vg-busca-tr">${celulaTransp(n)}</div>
          <div class="vg-busca-ent">${n.situacao !== 'autorizada' ? `<span class="oc-sit ocorrencia">${SIT[n.situacao][1]}</span>` : celulaSituacaoEntrega(n)}</div></div>`).join('')}
        <div class="vg-busca-rodape"><span>${j.mais ? 'Mostrando as 8 mais recentes.' : `${achadas.length} nota(s).`} Clique para ver a nota.</span><a href="#" data-vg-todas>Abrir na Consulta de notas (Enter) »</a></div>`
        : `<div class="vg-busca-vazio">Nenhuma nota com “${esc(termo)}”.</div>`;
    }
    campo.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => buscar().catch(() => {}), 300); });
    campo.addEventListener('focus', () => { if (caixa.innerHTML && campo.value.trim().length >= 2) caixa.classList.remove('oculto'); });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { fechar(); campo.blur(); }
      if (e.key === 'Enter' && campo.value.trim()) { e.preventDefault(); abrirConsulta(); }
    });
    caixa.addEventListener('mousedown', (e) => e.preventDefault());   // não perde o foco ao clicar
    caixa.addEventListener('click', (e) => {
      if (e.target.closest('[data-vg-todas]')) { e.preventDefault(); abrirConsulta(); return; }
      const it = e.target.closest('.vg-busca-item');
      if (!it) return;
      const n = achadas[Number(it.dataset.i)];
      if (!n) return;
      fechar();
      if (!montado) montar();
      detalhe(n.id, n);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.vg-busca')) fechar(); });
  })();

  function detalhe(id, nota) {
    const n = nota || (dados?.notas || []).find((x) => x.id === id);
    if (!n) return;
    const e = json(n.entrega_endereco); const r = json(n.redespacho_endereco);
    const blocoEnd = (titulo, x, qual) => `<tr><td style="color:var(--texto-fraco); width:38%; vertical-align:top; white-space:normal;">${titulo}</td><td style="white-space:normal; word-break:break-word;"><b>${x ? esc([x.nome, endTexto(x)].filter(Boolean).join(' — ')) || '—' : '—'}</b>
      ${x?.origem ? `<br><small style="color:var(--texto-fraco);">Origem: ${esc(ORIGEM[x.origem] || x.origem)}${x.cnpj ? ` · CNPJ ${doc(x.cnpj)}` : ''}${x.do_cadastro ? ' · endereço completado pelo cadastro do CNPJ (a nota só trazia o nome e o CNPJ)' : ''}${x.cidade_pelo_cep ? ' · cidade achada pelo CEP (o texto não dizia a cidade)' : ''}</small>` : ''}
      ${x?.conferir ? `<br><small style="color:#d97706;">⚠ Conferir: ${esc((x.motivos || []).join('; ') || n.endereco_conferir_motivo || 'leitura sem certeza')}</small>` : ''}
      ${x?.texto && x.origem !== 'manual' ? `<br><small style="color:var(--texto-fraco);">Lido do texto: “${esc(x.texto)}”</small>` : ''}
      ${podeCorrigir() ? `<br><button class="btn btn-secundario" data-nf-corrigir="${qual}" style="width:auto; padding:3px 9px; font-size:11.5px; margin-top:4px;">✏ Corrigir</button>` : ''}</td></tr>`;
    const linha = (r, v) => `<tr><td style="color:var(--texto-fraco); width:38%; white-space:normal;">${r}</td><td style="white-space:normal; word-break:break-word;"><b>${v}</b></td></tr>`;
    const corpo = `<table style="width:100%; font-size:13px;"><tbody>
      ${linha('Chave de acesso', `<span style="font-family:monospace;">${esc(String(n.chave_nfe || '—').replace(/(.{4})/g, '$1 '))}</span>`)}
      ${linha('Número / série', `${esc(n.numero_nf)} / ${esc(n.nf_serie || '—')}`)}${linha('Situação', SIT[n.situacao][1])}
      ${linha('Emitente', `${esc(n.emitente_nome || '—')} · ${doc(n.emitente_cnpj)}`)}${linha('Destinatário', `${esc(n.cliente || '—')} · ${doc(n.cliente_documento)}`)}
      ${r || n.redespacho ? blocoEnd('Redespacho (para onde a transportadora leva)', r || { nome: n.redespacho, cidade: n.cidade_redespacho }, 'redespacho') : ''}
      ${blocoEnd(e?.local_diferente ? 'Local de entrega (diferente do destinatário)' : 'Endereço de entrega', e, 'entrega')}
      ${linha('Emissão / saída', `${dia(n.data_emissao_nf)} / ${n.data_saida ? dataHora(n.data_saida) : '—'}`)}
      ${linha('Valor dos produtos / total da nota', `${moeda(n.valor_produtos)} / ${moeda(n.valor_faturado)}`)}
      ${linha('Peso bruto / líquido', `${kg(n.peso_bruto)} / ${kg(n.peso_liquido)}`)}${linha('Volumes', n.qtd_volumes ?? '—')}
      ${linha('Pedido / transportadora da nota', `${esc(n.numero_pedido || '—')} / ${esc(n.transportadora_nfe || '—')}`)}
      ${linha('Transportadora do CT-e / CT-e', n.numero_cte || n.chave_cte ? `${esc(n.transportadora || '—')} / CT-e ${esc(n.numero_cte || '—')}${n.data_emissao_cte ? ` de ${dia(n.data_emissao_cte)}` : ''}${n.valor_total_cte != null ? ` · ${moeda(n.valor_total_cte)}` : ''}` : 'sem CT-e')}
      ${linha('Entrega', celulaSituacaoEntrega(n))}
      ${n.data_entrega_prevista ? linha('Previsão de entrega', dia(n.data_entrega_prevista)) : ''}</tbody></table>`;
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:760px; width:100%; max-height:92vh; overflow-y:auto; padding:20px 22px;">
      <div style="display:flex; justify-content:space-between;"><h3 style="margin:0;">🧾 NF-e ${esc(n.numero_nf)}</h3><span style="cursor:pointer; font-size:18px;" data-nf-fechar>✕</span></div>
      <div style="margin-top:12px;">${corpo}</div>
      <div id="nfEventos" style="margin-top:12px; font-size:12.5px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
        ${n.tem_xml ? `<a class="btn btn-secundario" style="width:auto;" href="/api/notas/${n.id}/danfe?token=${encodeURIComponent(token)}" target="_blank" rel="noopener">📄 DANFE (imprimir / PDF)</a>
        <a class="btn btn-secundario" style="width:auto;" href="/api/notas/${n.id}/xml?token=${encodeURIComponent(token)}">⬇ XML</a>` : '<span style="color:var(--texto-fraco); align-self:center;">Nota sem XML (entrou pela planilha do ERP)</span>'}
        ${n.qtd_ocorrencias ? '<button class="btn btn-secundario" data-nf-rastreio style="width:auto;">🚚 Histórico de rastreamento</button>' : ''}
        <button class="btn btn-secundario" data-nf-registro style="width:auto;" title="O registro completo do frete: valores, cálculo pela tabela, aprovação, comprovante de entrega">✏ Abrir o registro do frete</button>
        <button class="btn btn-primario" data-nf-fechar style="width:auto;">Fechar</button></div></div>`;
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (ev) => {
      if (ev.target === fundo || ev.target.closest('[data-nf-fechar]')) { fundo.remove(); return; }
      if (ev.target.closest('[data-nf-rastreio]')) { if (typeof epVerOcorrencias === 'function') epVerOcorrencias(id); return; }
      if (ev.target.closest('[data-nf-registro]')) { fundo.remove(); if (typeof epAbrirRegistro === 'function') epAbrirRegistro(id); return; }
      const c = ev.target.closest('[data-nf-corrigir]');
      if (c) corrigir(n, c.dataset.nfCorrigir, c.dataset.nfCorrigir === 'redespacho' ? (r || { nome: n.redespacho, cidade: n.cidade_redespacho }) : e, () => { fundo.remove(); carregar().then(() => detalhe(id)); });
    });
    // Eventos da nota (cancelamento, Carta de Correção, Comprovante de Entrega...), com o XML de cada um.
    apiFetch(`/api/notas/${id}/eventos`).then((r) => (r.ok ? r.json() : [])).then((evs) => {
      const alvo = fundo.querySelector('#nfEventos');
      if (!alvo) return;
      alvo.innerHTML = `<p style="margin:0 0 6px;"><strong>🕘 Eventos da nota</strong></p>${evs.length ? `<table style="width:100%; font-size:12px;"><tbody>${evs.map((e) => `<tr>
        <td style="white-space:nowrap; vertical-align:top; color:var(--texto-fraco);">${dia(e.dh_evento || e.criado_em)}${e.usuario_nome ? `<br><small>${esc(e.usuario_nome)}</small>` : ''}</td>
        <td>${esc(e.descricao || 'Evento')}${e.detalhe ? ` — ${esc(e.detalhe)}` : ''}${e.protocolo ? ` <small style="color:var(--texto-fraco);">(protocolo ${esc(e.protocolo)})</small>` : ''}
          <a href="${link(`/api/notas/${id}/eventos/${e.id}/xml`)}" style="white-space:nowrap;">⬇ XML do evento</a></td></tr>`).join('')}</tbody></table>`
        : '<span style="color:var(--texto-fraco);">Nenhum evento importado para esta nota (cancelamento, Carta de Correção, Comprovante de Entrega). Os XML de evento entram pelo Enviar XML.</span>'}`;
    }).catch(() => {});
  }

  // Corrigir à mão (a cidade é conferida no IBGE; no redespacho ela vira a Cidade do Redespacho do cálculo).
  function corrigir(n, qual, x, depois) {
    x = x || {};
    const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay'; fundo.style.zIndex = '1200';
    const campo = (id, r, v, extra = '') => `<div class="campo"><label for="nc${id}">${r}</label><input id="nc${id}" value="${esc(v || '')}" ${extra} /></div>`;
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:620px; width:100%; padding:20px 22px;">
      <h3 style="margin-top:0;">✏ ${qual === 'redespacho' ? 'Endereço do redespacho' : 'Endereço de entrega'} — NF ${esc(n.numero_nf)}</h3>
      ${x.texto ? `<p style="font-size:12px; color:var(--texto-fraco);">Texto da nota: “${esc(x.texto)}”</p>` : ''}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:0 10px;">
        ${campo('Nome', qual === 'redespacho' ? 'Transportadora / local' : 'Nome do local', x.nome)}${campo('Cnpj', 'CNPJ (opcional)', x.cnpj ? doc(x.cnpj) : '')}
        ${campo('Log', 'Rua / avenida', x.logradouro)}${campo('Num', 'Número', x.numero)}${campo('Comp', 'Complemento', x.complemento)}${campo('Bairro', 'Bairro', x.bairro)}
        ${campo('Cidade', 'Cidade', x.cidade)}<div class="campo"><label for="ncUf">UF</label><select id="ncUf"><option value=""></option>${UFS.map((u) => `<option ${u === x.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        ${campo('Cep', 'CEP', x.cep, 'maxlength="9"')}</div>
      ${qual === 'redespacho' ? '<p style="font-size:12px; color:var(--texto-fraco);">A cidade também vira a Cidade do Redespacho, que é a usada no cálculo do frete. Depois de salvar, use "Recalcular" no registro se a cidade mudou.</p>' : ''}
      <div id="ncErro" class="mensagem-erro"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px;"><button class="btn btn-secundario" data-nc-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="ncSalvar" style="width:auto;">Salvar</button></div></div>`;
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-nc-fechar]')) fundo.remove(); });
    const v = (id) => fundo.querySelector(`#nc${id}`).value;
    fundo.querySelector('#ncSalvar').addEventListener('click', async () => {
      const erroEl = fundo.querySelector('#ncErro'); erroEl.classList.remove('visivel');
      try {
        const resp = await apiFetch(`/api/notas/${n.id}/endereco`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qual, nome: v('Nome'), cnpj: v('Cnpj'), logradouro: v('Log'), numero: v('Num'), complemento: v('Comp'), bairro: v('Bairro'), cidade: v('Cidade'), uf: v('Uf'), cep: v('Cep') }) });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(j.erro || 'Erro ao salvar.');
        fundo.remove();
        mostrarAlerta(`Endereço corrigido.${j.mudouCidadeRedespacho ? ' A Cidade do Redespacho mudou: use "Recalcular" no registro para refazer o frete pela tabela.' : ''}`, { tipo: j.mudouCidadeRedespacho ? 'aviso' : 'sucesso' });
        depois();
      } catch (err) { erroEl.textContent = err.message; erroEl.classList.add('visivel'); }
    });
  }

  $('nfExcel')?.addEventListener('click', () => {
    if (!dados) return;
    window.exportarExcel(`notas-fiscais-${new Date().toISOString().slice(0, 10)}`, [{ nome: 'Notas fiscais',
      colunas: ['NF', 'Série', 'Chave', 'Emissão', 'Saída', 'Emitente', 'CNPJ emitente', 'Destinatário', 'CNPJ/CPF destinatário', 'Cidade', 'UF', 'Endereço de entrega', 'Origem do endereço', 'Redespacho', 'Endereço do redespacho', 'Conferir endereço',
        'Valor produtos', 'Valor total', 'Peso bruto', 'Peso líquido', 'Volumes', 'Pedido', 'CT-e', 'Situação'],
      linhas: dados.notas.map((n) => { const e = json(n.entrega_endereco); const r = json(n.redespacho_endereco); return [n.numero_nf, n.nf_serie || '', n.chave_nfe || '', dia(n.data_emissao_nf), n.data_saida ? dataHora(n.data_saida) : '', n.emitente_nome || '', doc(n.emitente_cnpj), n.cliente || '', doc(n.cliente_documento),
        n.cidade || '', n.uf || '', endTexto(e), ORIGEM[n.endereco_origem] || '', r?.nome || n.redespacho || '', endTexto(r), n.endereco_conferir ? `Sim: ${n.endereco_conferir_motivo || ''}` : 'Não',
        n.valor_produtos, n.valor_faturado, n.peso_bruto ?? n.peso_kg, n.peso_liquido, n.qtd_volumes, n.numero_pedido || '', n.numero_cte || '', SIT[n.situacao][1]]; }) }]).catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
  });
  // DANFE em lote: as marcadas ou, sem nenhuma marcada, as do filtro (numa aba nova, um DANFE por folha).
  $('nfDanfes')?.addEventListener('click', () => {
    if (!montado || !dados) return;
    if (!marcadas.size && !dados.notas.some((n) => n.tem_xml)) { mostrarAlerta('Nenhuma nota com XML para imprimir neste filtro.', { tipo: 'info' }); return; }
    const q = marcadas.size ? new URLSearchParams({ ids: [...marcadas].join(',') }) : filtros();
    window.open(link(`/api/notas/danfes?${q}`), '_blank');
  });
  $('nfZip')?.addEventListener('click', () => {
    if (!montado) return;
    const url = `/api/notas/zip?${filtros()}&token=${encodeURIComponent(token)}`;
    if (window.LinkSeguro?.ir) window.LinkSeguro.ir(url); else location.href = url;
  });
})();
