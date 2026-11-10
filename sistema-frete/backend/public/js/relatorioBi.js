// =====================================================================
// Relatórios » Montar relatório (BI). Regras no servidor: src/relatorioBi.js.
// Fonte dos dados (fretes contratados, CT-e emitidos, faturas, contas a pagar, acertos), campos na
// ordem das colunas, filtros, ordenação, agrupar e totalizar, modelos salvos, Excel (.xlsx) e envio
// automático por e-mail. Usa do dashboard.js: apiFetch, mostrarAlerta, confirmarExclusao, usuario.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('subabaBI')) return;
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const json = async (url, opcoes = {}) => {
    const r = await apiFetch(url, opcoes.body ? { ...opcoes, headers: { 'Content-Type': 'application/json' } } : opcoes);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };

  let fontes = []; let fonte = null;   // fonte escolhida: { id, nome, grupos, datas, situacao, busca }
  let ROTULO = {}; let TIPO = {};
  let ordem = [];                       // campos marcados, na ordem das colunas
  const ehNumero = (c) => ['numero', 'inteiro'].includes(TIPO[c]);
  const ehData = (c) => ['data', 'datahora'].includes(TIPO[c]);

  // ---------------- Fonte e lista de campos ----------------
  async function desenharFonte(id) {
    fonte = fontes.find((f) => f.id === id) || fontes[0];
    $('biFonte').value = fonte.id;
    ROTULO = {}; TIPO = {};
    fonte.grupos.forEach((g) => g.campos.forEach(([c, r, t]) => { ROTULO[c] = r; TIPO[c] = t; }));
    $('listaCamposBI').innerHTML = fonte.grupos.map((g) => `
      <div class="bi-grupo" data-grupo="${esc(g.grupo)}" style="grid-column: 1 / -1; font-size:10.5px; color:var(--texto-fraco); text-transform:uppercase; margin-top:8px;">${esc(g.grupo)}</div>
      ${g.campos.map(([c, r]) => `<label class="bi-campo" data-grupo="${esc(g.grupo)}" data-busca="${esc(semAcento(`${r} ${g.grupo}`))}" style="display:flex; align-items:center; gap:6px; font-size:12.5px; cursor:pointer;">
        <input type="checkbox" class="campo-bi-checkbox" value="${c}" data-rotulo="${esc(r)}" /> ${esc(r)}</label>`).join('')}`).join('');
    $('biBuscaCampo').value = '';
    ordem = [];
    // Agrupar: os campos que não são número.
    const opcoesGrupo = (vazio) => `<option value="">${vazio}</option>${fonte.grupos.map((g) => {
      const cs = g.campos.filter(([c]) => !ehNumero(c));
      return cs.length ? `<optgroup label="${esc(g.grupo)}">${cs.map(([c, r]) => `<option value="${c}">${esc(r)}</option>`).join('')}</optgroup>` : '';
    }).join('')}`;
    $('biAgrupar').innerHTML = opcoesGrupo('— não agrupar (uma linha por registro) —');
    $('biAgrupar2').innerHTML = opcoesGrupo('— só um nível —');
    // Filtros: os dos fretes ou os genéricos (período, situação e busca).
    const fretes = fonte.id === 'fretes';
    $('biFiltrosFretes').classList.toggle('oculto', !fretes);
    $('biFiltrosOutros').classList.toggle('oculto', fretes);
    $('biFiltroPeriodoCampo').innerHTML = (fonte.datas || []).map(([c, r]) => `<option value="${c}">${esc(r)}</option>`).join('');
    $('biFiltroSituacaoCampo').classList.toggle('oculto', !fonte.situacao);
    $('biFiltroBuscaCampo').classList.toggle('oculto', !fonte.busca);
    $('biFiltroSituacao').innerHTML = '<option value="">Todas</option>';
    if (fonte.situacao) {
      const lista = await json(`/api/fretes/bi/situacoes?fonte=${fonte.id}`).catch(() => []);
      $('biFiltroSituacao').innerHTML = `<option value="">Todas</option>${lista.map((v) => `<option value="${esc(v)}">${esc(String(v).replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()))}</option>`).join('')}`;
    }
    aplicarFiltros({}); aplicarConfig({});
    contar();
    limparResultado('Escolha os campos e clique em "Ver prévia".');
  }
  $('biFonte').addEventListener('change', () => { $('biModelo').value = ''; ajustarBotoesModelo(); desenharFonte($('biFonte').value).catch(erro); });
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  function limparResultado(texto) {
    $('cabecalhoTabelaBI').innerHTML = ''; document.querySelector('#tabelaBI tbody').innerHTML = ''; $('rodapeTabelaBI').innerHTML = '';
    $('biResultadoInfo').textContent = texto;
  }

  // ---------------- Marcar, procurar e ordem das colunas ----------------
  const visiveis = () => Array.from(document.querySelectorAll('.bi-campo')).filter((l) => l.style.display !== 'none').map((l) => l.querySelector('.campo-bi-checkbox'));
  function contar() {
    const n = document.querySelectorAll('.campo-bi-checkbox:checked').length;
    $('biContagemCampos').textContent = n ? `(${n} marcado${n > 1 ? 's' : ''})` : '';
    sincronizar();
  }
  function sincronizar() {
    const marcados = Array.from(document.querySelectorAll('.campo-bi-checkbox:checked')).map((c) => c.value);
    ordem = ordem.filter((c) => marcados.includes(c));
    marcados.forEach((c) => { if (!ordem.includes(c)) ordem.push(c); });
    desenharColunas();
  }
  function desenharColunas() {
    $('biColunas').innerHTML = ordem.length ? ordem.map((c, i) => `<span class="bi-chip" draggable="true" data-col="${c}" style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:14px; background:var(--bg-elevado, rgba(127,127,127,.1)); border:1px solid var(--borda); font-size:12px; cursor:grab;">
        <b style="color:var(--texto-fraco); font-weight:600;">${i + 1}</b> ${esc(ROTULO[c] || c)}
        <a data-bi-mover="-1" title="Para a esquerda" style="cursor:pointer; padding:0 2px;">◀</a><a data-bi-mover="1" title="Para a direita" style="cursor:pointer; padding:0 2px;">▶</a><a data-bi-tirar title="Tirar a coluna" style="cursor:pointer; padding:0 2px; color:var(--vermelho);">✕</a></span>`).join('')
      : '<span style="font-size:12.5px; color:var(--texto-fraco);">Marque os campos acima: eles aparecem aqui, na ordem das colunas.</span>';
    atualizarSelects();
  }
  function mover(c, destino) {
    const i = ordem.indexOf(c); if (i < 0) return;
    ordem.splice(i, 1); ordem.splice(Math.max(0, Math.min(destino, ordem.length)), 0, c);
    desenharColunas();
  }
  let arrastando = null;
  $('biColunas').addEventListener('click', (e) => {
    const chip = e.target.closest('.bi-chip'); if (!chip) return;
    const c = chip.dataset.col;
    if (e.target.closest('[data-bi-tirar]')) { const cb = document.querySelector(`.campo-bi-checkbox[value="${c}"]`); if (cb) cb.checked = false; contar(); return; }
    const m = e.target.closest('[data-bi-mover]'); if (m) mover(c, ordem.indexOf(c) + Number(m.dataset.biMover));
  });
  $('biColunas').addEventListener('dragstart', (e) => { arrastando = e.target.closest('.bi-chip')?.dataset.col || null; e.dataTransfer.effectAllowed = 'move'; });
  $('biColunas').addEventListener('dragover', (e) => { if (arrastando) e.preventDefault(); });
  $('biColunas').addEventListener('drop', (e) => {
    e.preventDefault();
    const alvo = e.target.closest('.bi-chip');
    if (arrastando && alvo && alvo.dataset.col !== arrastando) mover(arrastando, ordem.indexOf(alvo.dataset.col));
    arrastando = null;
  });
  $('btnBiMarcarTodos').addEventListener('click', () => { visiveis().forEach((c) => { c.checked = true; }); contar(); });
  $('btnBiDesmarcarTodos').addEventListener('click', () => { visiveis().forEach((c) => { c.checked = false; }); contar(); });
  $('listaCamposBI').addEventListener('change', contar);
  $('biBuscaCampo').addEventListener('input', (e) => {
    const termos = semAcento(e.target.value).split(/\s+/).filter(Boolean);
    const grupos = new Set();
    document.querySelectorAll('.bi-campo').forEach((l) => {
      const ok = termos.every((t) => l.dataset.busca.includes(t));
      l.style.display = ok ? '' : 'none';
      if (ok) grupos.add(l.dataset.grupo);
    });
    document.querySelectorAll('.bi-grupo').forEach((g) => { g.style.display = grupos.has(g.dataset.grupo) ? '' : 'none'; });
  });

  // ---------------- Ordenar, agrupar e totalizar ----------------
  function atualizarSelects() {
    const g1 = $('biAgrupar'); const g2 = $('biAgrupar2');
    if (!g1.value) g2.value = '';
    g2.disabled = !g1.value;
    const grupos = [g1.value, g2.value].filter(Boolean);
    $('biPeriodoCampo').classList.toggle('oculto', !grupos.some(ehData));
    const ord = $('biOrdem'); const vo = ord.value;
    const opcoes = grupos.length
      ? [...grupos.map((c) => [c, ROTULO[c]]), ['qtd', 'Qtd. de registros'], ...ordem.filter(ehNumero).map((c) => [c, `Total de ${ROTULO[c]}`])]
      : ordem.map((c) => [c, ROTULO[c] || c]);
    ord.innerHTML = `<option value="">${grupos.length ? 'Padrão (datas em ordem; senão, mais registros primeiro)' : 'Padrão (mais recentes primeiro)'}</option>${opcoes.map(([v, r]) => `<option value="${v}">${esc(r)}</option>`).join('')}`;
    ord.value = opcoes.some(([v]) => v === vo) ? vo : '';
    const valores = ordem.filter(ehNumero).map((c) => ROTULO[c]);
    $('biDicaAgrupar').textContent = grupos.length
      ? `Agrupado: uma linha por ${grupos.map((c) => ROTULO[c]).join(' e ')}, com a quantidade de registros${valores.length ? ` e o total de ${valores.join(', ')}` : ' (marque campos de valor para totalizar)'}, e o total geral no fim. Os outros campos marcados não entram.`
      : '';
  }
  ['biAgrupar', 'biAgrupar2'].forEach((id) => $(id).addEventListener('change', atualizarSelects));

  // ---------------- Filtros e configuração ----------------
  const FILTROS = { transportadora: 'biFiltroTransportadora', cliente: 'biFiltroCliente', uf: 'biFiltroUf', status: 'biFiltroStatus', aprovacao: 'biFiltroAprovacao',
    data_de: 'biFiltroDataDe', data_ate: 'biFiltroDataAte', cte_de: 'biFiltroCteDe', cte_ate: 'biFiltroCteAte', entrega_de: 'biFiltroEntregaDe', entrega_ate: 'biFiltroEntregaAte',
    divergencia: 'biFiltroDivergencia', glosa: 'biFiltroGlosa',
    periodo_campo: 'biFiltroPeriodoCampo', de: 'biFiltroDe', ate: 'biFiltroAte', situacao: 'biFiltroSituacao', busca: 'biFiltroBusca' };
  const DOS_FRETES = ['transportadora', 'cliente', 'uf', 'status', 'aprovacao', 'data_de', 'data_ate', 'cte_de', 'cte_ate', 'entrega_de', 'entrega_ate', 'divergencia', 'glosa'];
  const CONFIG = { ordem: ['biOrdem', ''], dir: ['biDir', 'desc'], agrupar: ['biAgrupar', ''], agrupar2: ['biAgrupar2', ''], periodo: ['biPeriodo', 'mes'], total: ['biTotal', 'auto'] };
  function lerFiltros() {
    const f = {};
    Object.entries(FILTROS).forEach(([k, id]) => {
      if ((fonte?.id === 'fretes') !== DOS_FRETES.includes(k)) return;   // só os filtros da fonte escolhida
      const el = $(id);
      const v = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value.trim();
      if (v) f[k] = v;
    });
    return f;
  }
  function aplicarFiltros(f = {}) {
    Object.entries(FILTROS).forEach(([k, id]) => {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = f[k] === '1';
      else if (el.tagName === 'SELECT' && k === 'periodo_campo') el.value = f[k] || el.options[0]?.value || '';
      else el.value = f[k] || '';
    });
  }
  const lerConfig = () => { const f = {}; Object.entries(CONFIG).forEach(([k, [id]]) => { const v = $(id).value; if (v) f[k] = v; }); return f; };
  function aplicarConfig(f = {}) {
    ['agrupar', 'agrupar2', 'periodo', 'total', 'dir'].forEach((k) => { const [id, padrao] = CONFIG[k]; $(id).value = f[k] || padrao; if ($(id).selectedIndex < 0) $(id).value = padrao; });
    atualizarSelects();
    $('biOrdem').value = f.ordem || '';
    if ($('biOrdem').selectedIndex < 0) $('biOrdem').value = '';
  }
  $('btnBiLimparFiltros').addEventListener('click', () => aplicarFiltros({}));
  function parametros() {
    sincronizar();
    const config = lerConfig();
    const usados = [...ordem, config.agrupar, config.agrupar2].filter(Boolean);
    const params = new URLSearchParams({ fonte: fonte.id, campos: ordem.join(','), ...lerFiltros(), ...config, rotulos: JSON.stringify(Object.fromEntries(usados.map((c) => [c, ROTULO[c] || c]))) });
    return { params, agrupado: !!config.agrupar };
  }

  // ---------------- Prévia e Excel ----------------
  const avisoCorte = (d) => (d.cortado ? ` ⚠ Parou no limite de ${Number(d.limite).toLocaleString('pt-BR')} ${d.agrupado ? 'grupos' : 'linhas'}: há mais registros. Use filtros (ex.: um período menor) ou agrupe para ver tudo.` : '');
  $('btnBiGerarPrevia').addEventListener('click', async () => {
    const info = $('biResultadoInfo');
    const { params, agrupado } = parametros();
    if (!ordem.length && !agrupado) { mostrarAlerta('Escolha pelo menos um campo primeiro.'); return; }
    info.textContent = 'Gerando prévia...';
    let d;
    try { d = await json(`/api/fretes/bi?${params}`); } catch (e) { info.textContent = ''; erro(e); return; }
    const cols = d.colunas;
    const alinhar = (c) => (c.tipo === 'numero' || c.tipo === 'inteiro' ? ' style="text-align:right;"' : '');
    const cel = (c, v) => {
      if (v == null || v === '') return '—';
      if (c.tipo === 'numero') return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      if (c.tipo === 'inteiro') return Number(v).toLocaleString('pt-BR');
      return esc(v);
    };
    $('cabecalhoTabelaBI').innerHTML = cols.map((c) => `<th${alinhar(c)}>${esc(c.rotulo)}</th>`).join('');
    const primeiras = d.linhas.slice(0, d.agrupado ? 1000 : 200);
    document.querySelector('#tabelaBI tbody').innerHTML = primeiras.map((l) => `<tr>${cols.map((c) => `<td${alinhar(c)}>${cel(c, l[c.id])}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${cols.length}" style="color:var(--texto-fraco);">Nenhum registro encontrado com esses filtros.</td></tr>`;
    $('rodapeTabelaBI').innerHTML = d.agrupado && d.total
      ? `<tr style="font-weight:700; border-top:2px solid var(--borda);">${cols.map((c, i) => `<td${alinhar(c)}>${i === 0 ? 'TOTAL GERAL' : c.papel === 'grupo' ? '' : cel(c, d.total[c.id])}</td>`).join('')}</tr>` : '';
    info.innerHTML = esc(d.agrupado
      ? `${d.linhas.length} grupo(s), ${Number(d.total?.qtd || 0).toLocaleString('pt-BR')} registro(s)${d.linhas.length > primeiras.length ? ` — mostrando os primeiros ${primeiras.length} grupos (a exportação leva todos)` : ''}.`
      : `${d.linhas.length.toLocaleString('pt-BR')} registro(s) encontrado(s)${d.linhas.length > 200 ? ' — mostrando os primeiros 200 na prévia (a exportação leva todos)' : ''}.`)
      + (d.cortado ? `<b style="color:#b45309;">${esc(avisoCorte(d))}</b>` : '');
  });
  $('btnBiExportarExcel').addEventListener('click', async () => {
    const info = $('biResultadoInfo');
    const { params, agrupado } = parametros();
    if (!ordem.length && !agrupado) { mostrarAlerta('Escolha pelo menos um campo primeiro.'); return; }
    info.textContent = 'Gerando a planilha...';
    params.set('formato', 'xlsx'); params.set('nome', `${modeloAtual()?.nome || 'relatorio-personalizado'}-${new Date().toISOString().slice(0, 10)}`);
    try {
      const r = await apiFetch(`/api/fretes/bi?${params}`);
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || 'Erro ao gerar a planilha.'); }
      const total = r.headers.get('X-Total-Linhas'); const corte = r.headers.get('X-Cortado');
      const arquivo = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'relatorio.xlsx';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob()); a.download = arquivo;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      info.textContent = `${Number(total || 0).toLocaleString('pt-BR')} ${agrupado ? 'grupo(s)' : 'registro(s)'} exportado(s) para o Excel.${corte ? avisoCorte({ cortado: true, limite: corte, agrupado }) : ''}`;
      if (corte) mostrarAlerta(`A planilha parou no limite de ${Number(corte).toLocaleString('pt-BR')} ${agrupado ? 'grupos' : 'linhas'}: há mais registros. Use filtros (ex.: um período menor) para ver tudo.`, { tipo: 'aviso' });
    } catch (e) { info.textContent = ''; erro(e); }
  });

  // ---------------- Modelos salvos ----------------
  let modelos = [];
  const modeloAtual = () => modelos.find((m) => String(m.id) === $('biModelo').value);
  const NOMES_FREQ = { diaria: 'todo dia', semanal: 'toda semana', mensal: 'todo mês' };
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function ajustarBotoesModelo() {
    const m = modeloAtual();
    const pode = !!m && (m.meu || usuario?.perfil === 'admin');
    ['btnBiAtualizarModelo', 'btnBiExcluirModelo', 'btnBiEnvio'].forEach((id) => $(id).classList.toggle('oculto', !pode));
    const e = m?.envio;
    $('biEnvioInfo').classList.toggle('oculto', !e?.ativo);
    if (e?.ativo) {
      $('biEnvioInfo').textContent = `✉ Envio automático ${NOMES_FREQ[e.frequencia]}${e.frequencia === 'semanal' ? ` (${DIAS[e.dia_semana]})` : e.frequencia === 'mensal' ? ` (dia ${e.dia_mes})` : e.dias_uteis ? ' (dias úteis)' : ''} às ${e.hora} para ${e.para}.`
        + `${m.proximo_envio ? ` Próximo: ${new Date(m.proximo_envio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}${m.ultimo_envio_status ? ` Último: ${m.ultimo_envio_status}` : ''}`;
    }
  }
  async function carregarModelos(selecionar) {
    modelos = await json('/api/fretes/bi/modelos').catch(() => []);
    const nomeFonte = (id) => fontes.find((f) => f.id === id)?.nome.split(' (')[0] || id;
    const opt = (m) => `<option value="${m.id}">${esc(m.nome)}${(m.fonte || 'fretes') !== 'fretes' ? ` · ${esc(nomeFonte(m.fonte))}` : ''}${m.compartilhado ? ' 👥' : ''}${m.envio?.ativo ? ' ✉' : ''}${m.meu ? '' : ` — de ${esc(m.usuario_nome || '')}`}</option>`;
    const meus = modelos.filter((m) => m.meu); const outros = modelos.filter((m) => !m.meu);
    $('biModelo').innerHTML = `<option value="">— novo relatório —</option>${meus.length ? `<optgroup label="Meus modelos">${meus.map(opt).join('')}</optgroup>` : ''}${outros.length ? `<optgroup label="Compartilhados">${outros.map(opt).join('')}</optgroup>` : ''}`;
    if (selecionar) $('biModelo').value = String(selecionar);
    ajustarBotoesModelo();
  }
  $('biModelo').addEventListener('change', async () => {
    const m = modeloAtual();
    ajustarBotoesModelo();
    if (!m) return;
    try {
      if ((m.fonte || 'fretes') !== fonte.id) { await desenharFonte(m.fonte || 'fretes'); $('biModelo').value = String(m.id); ajustarBotoesModelo(); }
      const marcados = new Set(m.campos);
      document.querySelectorAll('.campo-bi-checkbox').forEach((c) => { c.checked = marcados.has(c.value); });
      ordem = [...m.campos];
      aplicarFiltros(m.filtros || {});
      contar();
      aplicarConfig(m.filtros || {});
      $('btnBiGerarPrevia').click();
    } catch (e) { erro(e); }
  });
  const corpoModelo = (m, extra = {}) => ({ nome: m.nome, fonte: m.fonte || 'fretes', campos: m.campos, filtros: m.filtros, compartilhado: m.compartilhado, envio: m.envio, ...extra });
  $('btnBiSalvarModelo').addEventListener('click', () => {
    sincronizar();
    if (!ordem.length && !$('biAgrupar').value) { mostrarAlerta('Marque os campos do relatório antes de salvar o modelo.'); return; }
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:460px; width:100%; padding:22px 24px;">
      <h3 style="margin-top:0;">💾 Salvar como modelo</h3>
      <div class="campo"><label for="biModeloNome">Nome do modelo</label><input id="biModeloNome" maxlength="100" placeholder="Ex.: Fretes do mês por transportadora" /></div>
      <label style="display:flex; gap:8px; align-items:center; font-size:13px; margin:4px 0 6px;"><input type="checkbox" id="biModeloComp" style="width:auto;" /> Compartilhar com os outros usuários (eles usam, só você altera)</label>
      <p style="font-size:12px; color:var(--texto-fraco);">Guarda a fonte (${esc(fonte.nome)}), os ${ordem.length} campo(s) na ordem das colunas, os filtros, a ordenação e o agrupamento. Depois dá para ligar o envio por e-mail.</p>
      <div id="biModeloErro" class="mensagem-erro"></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-bi-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="biModeloOk" style="width:auto;">Salvar</button></div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-bi-fechar]')) fechar(); });
    const nomeEl = fundo.querySelector('#biModeloNome'); nomeEl.focus();
    const salvar = async () => {
      const erroEl = fundo.querySelector('#biModeloErro'); erroEl.classList.remove('visivel');
      try {
        const m = await json('/api/fretes/bi/modelos', { method: 'POST', body: JSON.stringify({ nome: nomeEl.value, fonte: fonte.id, campos: ordem, filtros: { ...lerFiltros(), ...lerConfig() }, compartilhado: fundo.querySelector('#biModeloComp').checked }) });
        fechar();
        await carregarModelos(m.id);
        mostrarAlerta(`Modelo "${m.nome}" salvo. Escolha-o em "Modelo salvo" para abrir com um clique.`, { tipo: 'sucesso' });
      } catch (e) { erroEl.textContent = e.message; erroEl.classList.add('visivel'); }
    };
    fundo.querySelector('#biModeloOk').addEventListener('click', salvar);
    nomeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
  });
  $('btnBiAtualizarModelo').addEventListener('click', async () => {
    const m = modeloAtual(); if (!m) return;
    sincronizar();
    try {
      await json(`/api/fretes/bi/modelos/${m.id}`, { method: 'PUT', body: JSON.stringify(corpoModelo(m, { fonte: fonte.id, campos: ordem, filtros: { ...lerFiltros(), ...lerConfig() } })) });
      await carregarModelos(m.id);
      mostrarAlerta(`Modelo "${m.nome}" atualizado com os campos, filtros e agrupamento de agora.`, { tipo: 'sucesso' });
    } catch (e) { erro(e); }
  });
  $('btnBiExcluirModelo').addEventListener('click', async () => {
    const m = modeloAtual(); if (!m) return;
    if (!await confirmarExclusao(`Excluir o modelo "${m.nome}"?${m.compartilhado ? ' Ele some também para quem usa o compartilhado.' : ''}${m.envio?.ativo ? ' O envio por e-mail para.' : ''}`)) return;
    try { await json(`/api/fretes/bi/modelos/${m.id}`, { method: 'DELETE' }); await carregarModelos(); mostrarAlerta('Modelo excluído.', { tipo: 'sucesso' }); } catch (e) { erro(e); }
  });

  // ---------------- Envio por e-mail ----------------
  const PERIODOS_ENVIO = [['salvo', 'O período salvo no modelo'], ['ontem', 'Ontem'], ['ultimos7', 'Últimos 7 dias (até ontem)'], ['semana_anterior', 'Semana anterior (segunda a domingo)'],
    ['ultimos30', 'Últimos 30 dias (até ontem)'], ['mes_atual', 'Mês atual (até hoje)'], ['mes_anterior', 'Mês anterior']];
  $('btnBiEnvio').addEventListener('click', () => {
    const m = modeloAtual(); if (!m) return;
    const e = m.envio?.ativo ? m.envio : { frequencia: 'semanal', dia_semana: 1, dia_mes: 1, hora: '07:30', periodo: 'semana_anterior', para: usuario?.email || '' };
    const campoData = (m.fonte || 'fretes') === 'fretes' ? 'emissão da NF' : (fontes.find((f) => f.id === m.fonte)?.datas.find(([c]) => c === m.filtros?.periodo_campo) || fontes.find((f) => f.id === m.fonte)?.datas[0] || [, 'data'])[1].toLowerCase();
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:560px; width:100%; padding:22px 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">✉ Envio por e-mail — ${esc(m.nome)}</h3><span style="cursor:pointer; font-size:18px;" data-bi-fechar>✕</span></div>
      <p style="font-size:12.5px; color:var(--texto-fraco);">O sistema monta este relatório sozinho e manda por e-mail, com a planilha anexa e as primeiras linhas no corpo. Usa o e-mail configurado em Configurações » E-mail.</p>
      <label style="display:flex; gap:8px; align-items:center; font-size:13.5px; margin-bottom:10px;"><input type="checkbox" id="beAtivo" style="width:auto;" ${m.envio?.ativo ? 'checked' : ''} /> <b>Enviar automaticamente</b></label>
      <div class="campo"><label for="bePara">Para (um ou mais e-mails, separados por vírgula)</label><input id="bePara" value="${esc(e.para || '')}" placeholder="gerente@empresa.com.br, diretoria@empresa.com.br" /></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px;">
        <div class="campo"><label for="beFreq">Frequência</label><select id="beFreq"><option value="diaria">Todo dia</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option></select></div>
        <div class="campo" id="beDiaSemCampo"><label for="beDiaSem">Dia da semana</label><select id="beDiaSem">${DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
        <div class="campo" id="beDiaMesCampo"><label for="beDiaMes">Dia do mês</label><input id="beDiaMes" type="number" min="1" max="28" value="${esc(e.dia_mes || 1)}" /></div>
        <div class="campo"><label for="beHora">Hora</label><input id="beHora" type="time" value="${esc(e.hora || '07:30')}" /></div>
      </div>
      <label id="beUteisCampo" style="display:flex; gap:8px; align-items:center; font-size:13px; margin:0 0 8px;"><input type="checkbox" id="beUteis" style="width:auto;" ${e.dias_uteis ? 'checked' : ''} /> Só em dias úteis (segunda a sexta)</label>
      <div class="campo"><label for="bePeriodo">Período do relatório em cada envio (pela data de ${esc(campoData)})</label><select id="bePeriodo">${PERIODOS_ENVIO.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
      ${m.ultimo_envio_status ? `<p style="font-size:12.5px;">Último envio: ${esc(m.ultimo_envio_status)}${m.ultimo_envio ? ` (${new Date(m.ultimo_envio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})` : ''}</p>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:6px;">
        <button class="btn btn-secundario" id="beTestar" style="width:auto;" ${m.envio?.ativo ? '' : 'disabled title="Salve com o envio ligado antes"'}>Enviar agora (teste)</button>
        <button class="btn btn-secundario" data-bi-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="beSalvar" style="width:auto;">Salvar</button></div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-bi-fechar]')) fechar(); });
    const q = (id) => fundo.querySelector(`#${id}`);
    q('beFreq').value = e.frequencia || 'semanal'; q('beDiaSem').value = String(e.dia_semana ?? 1); q('bePeriodo').value = e.periodo || 'salvo';
    const ajustar = () => {
      q('beDiaSemCampo').classList.toggle('oculto', q('beFreq').value !== 'semanal');
      q('beDiaMesCampo').classList.toggle('oculto', q('beFreq').value !== 'mensal');
      q('beUteisCampo').classList.toggle('oculto', q('beFreq').value !== 'diaria');
    };
    q('beFreq').addEventListener('change', ajustar); ajustar();
    q('beSalvar').addEventListener('click', async () => {
      const envio = { ativo: q('beAtivo').checked, para: q('bePara').value, frequencia: q('beFreq').value, dia_semana: q('beDiaSem').value, dia_mes: q('beDiaMes').value, hora: q('beHora').value, dias_uteis: q('beUteis').checked, periodo: q('bePeriodo').value };
      try {
        const salvo = await json(`/api/fretes/bi/modelos/${m.id}`, { method: 'PUT', body: JSON.stringify(corpoModelo(m, { envio })) });
        fechar();
        await carregarModelos(m.id);
        mostrarAlerta(envio.ativo ? `Envio ligado. Próximo: ${new Date(salvo.proximo_envio).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}.` : 'Envio por e-mail desligado.', { tipo: 'sucesso' });
      } catch (err) { erro(err); }
    });
    q('beTestar').addEventListener('click', async (ev) => {
      ev.currentTarget.disabled = true;
      try { const r = await json(`/api/fretes/bi/modelos/${m.id}/enviar`, { method: 'POST', body: '{}' }); mostrarAlerta(r.status, { tipo: 'sucesso' }); fechar(); await carregarModelos(m.id); } catch (err) { erro(err); ev.currentTarget.disabled = false; }
    });
  });

  // ---------------- Início ----------------
  (async () => {
    fontes = await json('/api/fretes/bi/fontes').catch(() => []);
    if (!fontes.length) return;
    $('biFonte').innerHTML = fontes.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('');
    $('biFonte').closest('.campo').classList.toggle('oculto', fontes.length < 2);
    await desenharFonte('fretes');
    await carregarModelos();
  })().catch(() => {});
})();
