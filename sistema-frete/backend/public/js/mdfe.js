// =====================================================================
// MDF-e (modelo 58, rodoviário) e cadastro de veículos/motoristas, nas
// abas "MDF-e" e "Veículos e motoristas" da Emissão de CT-e. Usa do
// dashboard.js: token, usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const painel = document.getElementById('cte-aba-mdfe');
  const painelFrota = document.getElementById('cte-aba-frota');
  if (!pode || !painel) return;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const numero = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isNaN(n) ? null : n; };
  const fmt = (v, c = 2) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const digitos = (v) => String(v ?? '').replace(/\D/g, '');
  const cpfFmt = (v) => { const d = digitos(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; };
  const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const STATUS = { rascunho: 'Rascunho', enviando: 'Enviando', autorizado: 'Autorizado — em viagem', rejeitado: 'Rejeitado', erro: 'Sem resposta', encerrado: 'Encerrado', cancelado: 'Cancelado' };
  const modal = $('modalMdfe');
  let tabelas = { tiposCarga: {}, tiposRodado: {}, tiposCarroceria: {} };
  let veiculos = []; let motoristas = [];

  async function json(r) {
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  }
  const api = (caminho, opcoes = {}) => apiFetch(`/api/mdfe${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) } }).then(json);
  const post = (caminho, corpo = {}) => api(caminho, { method: 'POST', body: JSON.stringify(corpo) });
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const fechar = () => modal.classList.add('oculto');
  const opcoes = (mapa, atual) => Object.entries(mapa).map(([k, t]) => `<option value="${k}" ${String(atual) === k ? 'selected' : ''}>${k} - ${esc(t)}</option>`).join('');
  const campo = (id, rotulo, valor = '', { tipo = 'text', classe = '', ph = '', extra = '' } = {}) => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input type="${tipo}" id="${id}" class="cte-entrada" value="${esc(valor)}" placeholder="${esc(ph)}" ${extra} /></div>`;
  const selUf = (id, rotulo, atual) => `<div class="campo"><label for="${id}">${rotulo}</label><select id="${id}" class="cte-entrada"><option value=""></option>${UFS.map((u) => `<option ${u === atual ? 'selected' : ''}>${u}</option>`).join('')}</select></div>`;

  async function carregarCadastros() {
    [veiculos, motoristas] = await Promise.all([api('/veiculos'), api('/motoristas')]);
  }

  // Abre a aba quando o usuário clica nela.
  document.querySelectorAll('.cte-aba').forEach((aba) => aba.addEventListener('click', () => {
    if (aba.dataset.cteAba === 'mdfe') montarPainel().catch(erro);
    if (aba.dataset.cteAba === 'frota') montarFrota().catch(erro);
  }));

  // ======================= Lista de MDF-e =======================
  async function montarPainel() {
    if (!painel.dataset.pronto) {
      painel.dataset.pronto = '1';
      painel.innerHTML = `<div class="painel">
        <div class="cte-aviso" style="font-size:12.5px;">O <b>MDF-e</b> acompanha o caminhão: um por UF de descarregamento, com os CT-e da viagem.
          Ao chegar, <b>encerre</b> o MDF-e — enquanto houver um aberto, a SEFAZ não autoriza outro para a mesma placa.</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; align-items:center;">
          <button class="btn btn-primario" id="mdfeNovo" style="width:auto;">+ MDF-e dos CT-e autorizados</button>
          <button class="btn btn-secundario" id="mdfeAbertos" style="width:auto;">🔎 Não encerrados na SEFAZ</button>
          <button class="btn btn-secundario" id="mdfeTestar" style="width:auto;">📡 Testar conexão</button>
          <select id="mdfeFiltro" class="cte-entrada" style="width:auto; margin-left:auto;"><option value="">Todos</option>${Object.entries(STATUS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
        </div>
        <div style="overflow-x:auto;"><table class="edi-tabela" id="tabelaMdfe"><thead><tr><th>Nº</th><th>Situação</th><th>Veículo / motorista</th><th>Percurso</th><th style="text-align:right;">Docs</th><th style="text-align:right;">Valor da carga</th><th></th></tr></thead><tbody></tbody></table></div>
      </div>`;
      $('mdfeNovo').addEventListener('click', () => escolherCtes().catch(erro));
      $('mdfeAbertos').addEventListener('click', (e) => verNaoEncerrados(e.currentTarget).catch(erro));
      $('mdfeTestar').addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { const r = await post('/testar-conexao'); mostrarAlerta(`${r.cStat} - ${r.xMotivo}`, { tipo: r.cStat === '107' ? 'sucesso' : 'aviso', titulo: 'SEFAZ do MDF-e (SVRS)' }); } catch (err) { erro(err); }
        b.disabled = false;
      });
      $('mdfeFiltro').addEventListener('change', () => carregarLista());
      $('tabelaMdfe').addEventListener('click', acaoDaLista);
      api('/tabelas').then((t) => { tabelas = t; }).catch(() => {});
    }
    await carregarLista();
  }

  async function carregarLista() {
    const corpo = document.querySelector('#tabelaMdfe tbody');
    try {
      const filtro = $('mdfeFiltro').value;
      const lista = (await api('/')).filter((m) => !filtro || m.status === filtro);
      corpo.innerHTML = lista.length ? lista.map(linha).join('')
        : '<tr><td colspan="7" style="text-align:center; color:var(--texto-fraco); padding:24px;">Nenhum MDF-e. Clique em “+ MDF-e dos CT-e autorizados” ou monte a partir de um romaneio (Ocorrências → Romaneios).</td></tr>';
    } catch (e) { corpo.innerHTML = `<tr><td colspan="7" style="color:var(--vermelho);">${esc(e.message)}</td></tr>`; }
  }

  function linha(m) {
    const b = (acao, texto) => `<button class="btn btn-secundario" data-mdfe-acao="${acao}" data-id="${m.id}">${texto}</button>`;
    const acoes = [];
    if (['rascunho', 'rejeitado', 'erro'].includes(m.status)) acoes.push(b('editar', '✏️ Editar'));
    if (['rascunho', 'rejeitado'].includes(m.status)) acoes.push(b('transmitir', '📤 Transmitir'));
    if (['erro', 'enviando'].includes(m.status)) acoes.push(b('transmitir', '🔁 Tentar de novo'), b('consultar', '🔎 Consultar'));
    if (['autorizado', 'encerrado'].includes(m.status) && m.averbacao_status !== 'averbado') acoes.push(b('averbar', '🛡 Declarar ao seguro'));
    if (m.status === 'autorizado') acoes.push(b('encerrar', '🏁 Encerrar'), b('condutor', '👤 + Motorista'), b('consultar', '🔎 Consultar'), b('cancelar', '⛔ Cancelar'));
    acoes.push(b('damdfe', ['autorizado', 'encerrado', 'cancelado'].includes(m.status) ? '🖨 DAMDFE' : '👁 Prévia'));
    if (m.chave) acoes.push(b('xml', '⬇ XML'));
    if (m.status === 'rascunho' && !m.numero) acoes.push(b('excluir', '🗑'));
    const motivo = m.motivo && ['rejeitado', 'erro', 'cancelado'].includes(m.status)
      ? `<div style="font-size:11.5px; color:${m.status === 'cancelado' ? 'var(--texto-fraco)' : 'var(--vermelho)'}; max-width:280px;">${esc(m.cstat && m.status !== 'cancelado' ? `${m.cstat} - ` : '')}${esc(m.motivo)}</div>` : '';
    return `<tr>
      <td style="white-space:nowrap;"><b>${m.numero ? `${m.serie}/${m.numero}` : '—'}</b><div style="font-size:11px; color:var(--texto-fraco);">${dataHora(m.autorizado_em || m.criado_em)}</div>
        ${m.demonstracao ? '<div style="font-size:10.5px; color:var(--azul);">demonstração</div>' : Number(m.ambiente) === 2 ? '<div style="font-size:10.5px; color:var(--amarelo);">homologação</div>' : ''}
        ${m.romaneio_id ? `<div style="font-size:10.5px; color:var(--texto-fraco);">romaneio ${m.romaneio_id}</div>` : ''}</td>
      <td><span class="badge badge-cte-${esc(m.status)}">${esc(STATUS[m.status] || m.status)}</span>${motivo}${m.encerrado_em ? `<div style="font-size:11px; color:var(--texto-fraco);">encerrado ${dataHora(m.encerrado_em)}</div>` : ''}
        ${m.averbacao_status === 'averbado' ? `<div class="cte-tipo" title="${esc(m.averbacao_mensagem || '')}">🛡 Declarado · ${esc(m.averbacao_protocolo || '')}</div>` : m.averbacao_status === 'erro' ? `<div class="cte-tipo alerta">⚠ Declaração ao seguro falhou: ${esc(String(m.averbacao_mensagem || '').slice(0, 60))}</div>` : ''}</td>
      <td><b>${esc(m.placa || 'sem placa')}</b><br><span style="font-size:12px; color:var(--texto-fraco);">${esc(m.motorista || 'sem motorista')}</span></td>
      <td>${esc(m.uf_ini || '?')} → ${esc(m.uf_fim || '?')}</td>
      <td style="text-align:right;">${m.qtd_documentos || 0}</td>
      <td style="text-align:right; white-space:nowrap;">${moeda(m.valor_carga)}</td>
      <td><div class="cte-acoes">${acoes.join('')}</div></td></tr>`;
  }

  async function acaoDaLista(ev) {
    const btn = ev.target.closest('[data-mdfe-acao]');
    if (!btn) return;
    const { id } = btn.dataset; const acao = btn.dataset.mdfeAcao;
    const tk = encodeURIComponent(token);
    try {
      if (acao === 'editar') return abrirFormulario(id);
      if (acao === 'damdfe') return window.open(`/api/mdfe/${id}/damdfe?token=${tk}`, '_blank');
      if (acao === 'xml') { LinkSeguro.ir(`/api/mdfe/${id}/xml?token=${tk}`); return null; }
      if (acao === 'excluir') {
        if (!await confirmar('Excluir este rascunho de MDF-e?', { tipo: 'perigo', textoOk: 'Excluir' })) return null;
        await api(`/${id}`, { method: 'DELETE' }); return carregarLista();
      }
      if (acao === 'transmitir') {
        btn.disabled = true;
        const r = await post(`/${id}/transmitir`);
        if (r.status === 'autorizado') mostrarAlerta(`MDF-e ${r.serie}/${r.numero} autorizado. Protocolo ${r.protocolo}.\nImprima o DAMDFE e entregue ao motorista. Ao terminar a viagem, encerre o MDF-e.`, { tipo: 'sucesso' });
        else mostrarAlerta(`A SEFAZ não autorizou: ${r.cstat || ''} - ${r.motivo || ''}${r.cstat === '686' ? '\n\nJá existe MDF-e aberto para essa placa. Encerre o anterior (botão "Não encerrados na SEFAZ") e transmita de novo.' : ''}`, { tipo: 'erro' });
        if (r.status === 'autorizado') window.open(`/api/mdfe/${id}/damdfe?token=${tk}`, '_blank');
        return carregarLista();
      }
      if (acao === 'consultar') {
        btn.disabled = true;
        const r = await post(`/${id}/consultar`);
        mostrarAlerta(`${r.consulta.cStat} - ${r.consulta.xMotivo}`, { tipo: ['100', '132', '101'].includes(r.consulta.cStat) ? 'sucesso' : 'aviso', titulo: 'Consulta na SEFAZ' });
        return carregarLista();
      }
      if (acao === 'encerrar') return encerrar(id);
      if (acao === 'cancelar') {
        const j = await pedirTexto('Justificativa do cancelamento (mínimo 15 letras). Só cancela se o caminhão ainda não saiu; se já viajou, use “Encerrar”.', { tipo: 'aviso', titulo: 'Cancelar o MDF-e?', textoOk: 'Cancelar o MDF-e', multilinha: true });
        if (j == null) return null;
        if (j.trim().length < 15) return mostrarAlerta('A justificativa precisa ter pelo menos 15 caracteres.', { tipo: 'aviso' });
        btn.disabled = true;
        await post(`/${id}/cancelar`, { justificativa: j.trim() });
        mostrarAlerta('MDF-e cancelado na SEFAZ.', { tipo: 'sucesso' });
        return carregarLista();
      }
      if (acao === 'condutor') return incluirCondutor(id);
      if (acao === 'averbar') {
        btn.disabled = true;
        const r = await post(`/${id}/averbar`);
        mostrarAlerta(r.status === 'averbado' ? `MDF-e declarado à averbadora. Protocolo ${r.protocolo}.` : `A averbadora recusou: ${r.mensagem}`, { tipo: r.status === 'averbado' ? 'sucesso' : 'erro' });
        return carregarLista();
      }
    } catch (e) { erro(e); carregarLista(); }
    return null;
  }

  // Encerramento: data e município (padrão: hoje, último descarregamento).
  async function encerrar(id) {
    const m = await api(`/${id}`);
    const descargas = m.dados?.descargas || [];
    modal.querySelector('#mdfeModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🏁 Encerrar o MDF-e ${m.serie}/${m.numero}</h3><span style="cursor:pointer; font-size:18px;" data-mdfe-fechar>✕</span></div>
      <p style="font-size:13px; color:var(--texto-fraco);">Encerre quando a viagem terminar (descarga feita). Depois de encerrado não dá para cancelar nem incluir motorista.</p>
      <div class="cte-grade">${campo('encData', 'Data do encerramento', hoje(), { tipo: 'date' })}
        <div class="campo largo"><label for="encMun">Município onde terminou</label><select id="encMun" class="cte-entrada">
          ${descargas.map((d, i) => `<option value="${esc(d.cMun)}" ${i === descargas.length - 1 ? 'selected' : ''}>${esc(d.xMun)} / ${esc(m.dados.ufFim)} (${esc(d.cMun)})</option>`).join('')}
          <option value="outro">Outro município…</option></select></div>
        ${selUf('encUf', 'UF', m.dados?.ufFim)}${campo('encCMun', 'Código IBGE (outro município)', '', { ph: '7 dígitos', extra: 'maxlength="7"' })}</div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;"><button class="btn btn-secundario" data-mdfe-fechar style="width:auto;">Voltar</button><button class="btn btn-primario" id="encOk" style="width:auto;">Encerrar na SEFAZ</button></div>`;
    modal.classList.remove('oculto');
    $('encOk').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const cMun = $('encMun').value === 'outro' ? digitos($('encCMun').value) : $('encMun').value;
      try {
        await post(`/${id}/encerrar`, { dtEnc: $('encData').value, cMun, uf: $('encUf').value });
        fechar(); mostrarAlerta('MDF-e encerrado. A placa já pode receber um novo MDF-e.', { tipo: 'sucesso' }); carregarLista();
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  async function incluirCondutor(id) {
    await carregarCadastros();
    const ativos = motoristas.filter((x) => x.ativo);
    modal.querySelector('#mdfeModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">👤 Incluir motorista no MDF-e</h3><span style="cursor:pointer; font-size:18px;" data-mdfe-fechar>✕</span></div>
      <p style="font-size:13px; color:var(--texto-fraco);">Troca de motorista durante a viagem: a SEFAZ registra o novo condutor (evento 110114).</p>
      <div class="cte-grade"><div class="campo largo"><label for="icCad">Do cadastro</label><select id="icCad" class="cte-entrada"><option value="">— digitar —</option>${ativos.map((x) => `<option value="${x.id}">${esc(x.nome)} (${cpfFmt(x.cpf)})</option>`).join('')}</select></div>
        ${campo('icNome', 'Nome', '', { classe: 'largo' })}${campo('icCpf', 'CPF')}</div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;"><button class="btn btn-secundario" data-mdfe-fechar style="width:auto;">Voltar</button><button class="btn btn-primario" id="icOk" style="width:auto;">Incluir</button></div>`;
    modal.classList.remove('oculto');
    $('icCad').addEventListener('change', () => { const x = ativos.find((y) => String(y.id) === $('icCad').value); if (x) { $('icNome').value = x.nome; $('icCpf').value = cpfFmt(x.cpf); } });
    $('icOk').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const xNome = $('icNome').value.trim(); const cpf = digitos($('icCpf').value);
      if (!xNome || cpf.length !== 11) return mostrarAlerta('Informe o nome e o CPF (11 dígitos).', { tipo: 'aviso' });
      b.disabled = true;
      try { await post(`/${id}/incluir-condutor`, { xNome, cpf }); fechar(); mostrarAlerta('Motorista incluído no MDF-e.', { tipo: 'sucesso' }); carregarLista(); } catch (err) { erro(err); b.disabled = false; }
      return null;
    });
  }

  async function verNaoEncerrados(btn) {
    btn.disabled = true;
    try {
      const r = await api('/nao-encerrados');
      if (!r.mdfes.length) return mostrarAlerta(`${r.cStat} - ${r.xMotivo}`, { tipo: 'sucesso', titulo: 'Nenhum MDF-e aberto na SEFAZ' });
      modal.querySelector('#mdfeModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">MDF-e não encerrados na SEFAZ</h3><span style="cursor:pointer; font-size:18px;" data-mdfe-fechar>✕</span></div>
        <p style="font-size:13px; color:var(--texto-fraco);">Enquanto estiverem abertos, a SEFAZ recusa novo MDF-e para a mesma placa (rejeição 686).</p>
        <table class="edi-tabela"><thead><tr><th>MDF-e</th><th>Placa</th><th>Chave</th><th>Protocolo</th><th></th></tr></thead><tbody>
        ${r.mdfes.map((x) => `<tr><td>${x.numero ? `${x.serie}/${x.numero}` : 'não está neste sistema'}</td><td>${esc(x.placa || '')}</td><td style="font-family:monospace; font-size:11px;">${esc(x.chave)}</td><td>${esc(x.nProt || '')}</td>
          <td>${x.id ? `<button class="btn btn-secundario" data-encerrar="${x.id}" style="width:auto; font-size:12px;">🏁 Encerrar</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
      modal.classList.remove('oculto');
      modal.querySelectorAll('[data-encerrar]').forEach((b) => b.addEventListener('click', () => encerrar(b.dataset.encerrar).catch(erro)));
    } finally { btn.disabled = false; }
    return null;
  }

  // Escolhe CT-e autorizados e monta os rascunhos (um por UF de destino).
  async function escolherCtes() {
    // O complementar não leva carga: não entra no MDF-e.
    const ctes = (await apiFetch('/api/cte-emissao/?status=autorizado').then(json)).filter((c) => c.tp_cte !== '1');
    modal.querySelector('#mdfeModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">Novo MDF-e — escolha os CT-e da viagem</h3><span style="cursor:pointer; font-size:18px;" data-mdfe-fechar>✕</span></div>
      <p style="font-size:13px; color:var(--texto-fraco);">Sai um MDF-e para cada UF de descarregamento. Veículo e motorista você escolhe no rascunho (ou monte pelo romaneio, que já traz os dois).</p>
      <input type="text" id="mdfeBuscaCte" class="cte-entrada" placeholder="Filtrar por número, cidade, destinatário…" style="margin-bottom:8px;" />
      <div style="max-height:52vh; overflow:auto;"><table class="edi-tabela"><thead><tr><th><input type="checkbox" id="mdfeTodos" /></th><th>CT-e</th><th>Destinatário</th><th>Destino</th><th style="text-align:right;">Frete</th></tr></thead><tbody id="mdfeListaCtes">
      ${ctes.map((c) => `<tr data-busca="${esc(`${c.numero} ${c.destinatario_nome} ${c.cidade_fim} ${c.uf_fim}`.toLowerCase())}"><td><input type="checkbox" value="${c.id}" /></td><td>${esc(c.serie)}/${esc(c.numero)}</td><td>${esc(c.destinatario_nome || '—')}</td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td><td style="text-align:right;">${moeda(c.valor_total)}</td></tr>`).join('')
        || '<tr><td colspan="5" style="text-align:center; color:var(--texto-fraco);">Nenhum CT-e autorizado.</td></tr>'}</tbody></table></div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;"><span id="mdfeQtd" style="margin-right:auto; align-self:center; color:var(--texto-fraco);"></span>
        <button class="btn btn-secundario" data-mdfe-fechar style="width:auto;">Voltar</button><button class="btn btn-primario" id="mdfeMontar" style="width:auto;">Montar MDF-e</button></div>`;
    modal.classList.remove('oculto');
    const marcados = () => [...modal.querySelectorAll('#mdfeListaCtes input:checked')].map((i) => Number(i.value));
    const contar = () => { $('mdfeQtd').textContent = `${marcados().length} CT-e marcado(s)`; };
    $('mdfeListaCtes').addEventListener('change', contar);
    $('mdfeTodos').addEventListener('change', (e) => { modal.querySelectorAll('#mdfeListaCtes tr:not([hidden]) input').forEach((i) => { i.checked = e.target.checked; }); contar(); });
    $('mdfeBuscaCte').addEventListener('input', (e) => { const t = e.target.value.toLowerCase(); modal.querySelectorAll('#mdfeListaCtes tr[data-busca]').forEach((tr) => { tr.hidden = !tr.dataset.busca.includes(t); }); });
    $('mdfeMontar').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const ids = marcados();
      if (!ids.length) return mostrarAlerta('Marque os CT-e da viagem.', { tipo: 'aviso' });
      b.disabled = true;
      try { await montarDosCtes({ cteIds: ids }); } catch (err) { erro(err); b.disabled = false; }
      return null;
    });
  }

  // Também chamado pelo romaneio (ocorrencias.js).
  async function montarDosCtes(corpo) {
    const r = await post('/dos-ctes', corpo);
    await abrirAba();
    if (r.ids.length === 1) return abrirFormulario(r.ids[0]);
    fechar();
    mostrarAlerta(`Foram montados ${r.ids.length} MDF-e, um por UF de descarregamento (${r.porUf.join(', ')}). Confira cada um e transmita.`, { tipo: 'sucesso' });
    return null;
  }
  async function abrirAba() {
    $('navEmissaoCte')?.click();
    document.querySelector('.cte-aba[data-cte-aba="mdfe"]')?.click();
    await montarPainel();
  }
  window.nexoMdfe = { montarDosCtes, abrirAba };

  // ======================= Formulário =======================
  async function abrirFormulario(id) {
    const [m] = await Promise.all([api(`/${id}`), carregarCadastros(), tabelas.tiposCarga && Object.keys(tabelas.tiposCarga).length ? null : api('/tabelas').then((t) => { tabelas = t; })]);
    const d = m.dados || {};
    const v = d.veiculo || {}; const seg = (d.seguros || [])[0] || {}; const ciot = (d.ciot || [])[0] || {}; const vp = (d.valePedagio || [])[0] || {};
    const cond = d.condutores || [];
    const reboques = d.reboques || [];
    const tracoes = veiculos.filter((x) => x.ativo && x.tipo === 'tracao'); const carretas = veiculos.filter((x) => x.ativo && x.tipo === 'reboque');
    const docs = (d.descargas || []).map((x) => `<tr><td><b>${esc(x.xMun)}</b> <small style="color:var(--texto-fraco);">${esc(x.cMun)}</small></td><td>${(x.ctes || []).length} CT-e${(x.nfes || []).length ? ` · ${x.nfes.length} NF-e` : ''}</td>
      <td style="font-family:monospace; font-size:10.5px;">${[...(x.ctes || []), ...(x.nfes || [])].map(esc).join('<br>')}</td></tr>`).join('');
    const sec = (titulo, corpo) => `<div class="cte-secao"><h4>${titulo}</h4>${corpo}</div>`;
    modal.querySelector('#mdfeModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">📋 MDF-e ${m.numero ? `${m.serie}/${m.numero}` : '(rascunho)'} <span class="badge badge-cte-${esc(m.status)}" style="vertical-align:middle;">${esc(STATUS[m.status])}</span></h3><span style="cursor:pointer; font-size:18px;" data-mdfe-fechar>✕</span></div>
      ${m.motivo && ['rejeitado', 'erro'].includes(m.status) ? `<div class="cte-aviso erro" style="margin-top:10px;">${esc(m.cstat ? `${m.cstat} - ` : '')}${esc(m.motivo)}</div>` : ''}
      ${sec('Percurso', `<div class="cte-grade">${selUf('mfUfIni', 'UF de carregamento', d.ufIni)}${selUf('mfUfFim', 'UF de descarregamento', d.ufFim)}
        ${campo('mfPercurso', 'UFs no caminho (entre a origem e o destino)', (d.percurso || []).join(' '), { classe: 'largo', ph: 'ex.: PR SC' })}
        ${campo('mfCarreg', 'Município(s) de carregamento — código IBGE e nome', (d.carregamento || []).map((x) => `${x.cMun} ${x.xMun}`).join('; '), { classe: 'inteiro', ph: '3550308 SAO PAULO; 3518800 GUARULHOS' })}</div>`)}
      ${sec('Documentos por descarregamento', `<table class="edi-tabela"><thead><tr><th>Município</th><th>Docs</th><th>Chaves</th></tr></thead><tbody>${docs || '<tr><td colspan="3">Nenhum documento.</td></tr>'}</tbody></table>`)}
      ${sec('Veículo', `<div class="cte-grade">
        <div class="campo largo"><label for="mfVeic">Cavalo / caminhão (do cadastro)</label><select id="mfVeic" class="cte-entrada"><option value="">— escolha —</option>
          ${tracoes.map((x) => `<option value="${esc(x.placa)}" ${x.placa === v.placa ? 'selected' : ''}>${esc(x.placa)}${x.descricao ? ` — ${esc(x.descricao)}` : ''}</option>`).join('')}
          ${v.placa && !tracoes.some((x) => x.placa === v.placa) ? `<option value="${esc(v.placa)}" selected>${esc(v.placa)} (não cadastrado)</option>` : ''}</select></div>
        <div class="campo largo"><label for="mfReboque">Carreta / reboque</label><select id="mfReboque" class="cte-entrada" multiple size="${Math.min(4, Math.max(2, carretas.length))}">
          ${carretas.map((x) => `<option value="${esc(x.placa)}" ${reboques.some((r) => r.placa === x.placa) ? 'selected' : ''}>${esc(x.placa)}${x.descricao ? ` — ${esc(x.descricao)}` : ''}</option>`).join('')}</select></div>
        <div class="campo inteiro" style="font-size:12px; color:var(--texto-fraco);">Falta veículo? Cadastre na aba “🚛 Veículos e motoristas” (placa, RENAVAM, tara e capacidade).</div></div>`)}
      ${sec('Motorista(s)', `<div class="cte-grade"><div class="campo largo"><label for="mfCond">Motoristas (do cadastro; segure Ctrl para mais de um)</label><select id="mfCond" class="cte-entrada" multiple size="${Math.min(5, Math.max(2, motoristas.length))}">
          ${motoristas.filter((x) => x.ativo || cond.some((c) => c.cpf === x.cpf)).map((x) => `<option value="${x.cpf}" ${cond.some((c) => c.cpf === x.cpf) ? 'selected' : ''}>${esc(x.nome)} (${cpfFmt(x.cpf)})</option>`).join('')}
          ${cond.filter((c) => !motoristas.some((x) => x.cpf === c.cpf)).map((c) => `<option value="${esc(c.cpf)}" data-nome="${esc(c.xNome)}" selected>${esc(c.xNome)} (${cpfFmt(c.cpf)})</option>`).join('')}</select></div></div>`)}
      ${sec('Carga', `<div class="cte-grade">
        <div class="campo"><label for="mfTpCarga">Tipo de carga</label><select id="mfTpCarga" class="cte-entrada">${opcoes(tabelas.tiposCarga, d.prodPred?.tpCarga || '05')}</select></div>
        ${campo('mfProd', 'Produto predominante', d.prodPred?.xProd || '', { classe: 'largo' })}${campo('mfNcm', 'NCM (opcional)', d.prodPred?.NCM || '', { extra: 'maxlength="8"' })}
        ${campo('mfValor', 'Valor total da carga (R$)', fmt(d.tot?.vCarga))}
        <div class="campo"><label for="mfUnid">Unidade do peso</label><select id="mfUnid" class="cte-entrada"><option value="01" ${String(d.tot?.cUnid) !== '02' ? 'selected' : ''}>KG</option><option value="02" ${String(d.tot?.cUnid) === '02' ? 'selected' : ''}>TON</option></select></div>
        ${campo('mfPeso', 'Peso bruto total', fmt(d.tot?.qCarga, 4))}${campo('mfLacres', 'Lacres (separe por espaço)', (d.lacres || []).join(' '), { classe: 'largo' })}</div>`)}
      ${sec('Seguro da carga', `<div class="cte-grade">
        <div class="campo"><label for="mfRespSeg">Responsável</label><select id="mfRespSeg" class="cte-entrada"><option value="1" ${String(seg.respSeg || '1') === '1' ? 'selected' : ''}>Emitente (transportadora)</option><option value="2" ${String(seg.respSeg) === '2' ? 'selected' : ''}>Contratante</option></select></div>
        ${campo('mfSegNome', 'Seguradora', seg.xSeg || '', { classe: 'largo' })}${campo('mfSegCnpj', 'CNPJ da seguradora', Doc.formatar(seg.cnpjSeg || ''))}${campo('mfApolice', 'Nº da apólice', seg.nApol || '')}
        ${campo('mfAverb', 'Nº(s) de averbação (separe por espaço)', (seg.nAver || []).join(' '), { classe: 'largo' })}${campo('mfRespDoc', 'CNPJ/CPF do contratante (se ele contratou)', Doc.formatar(seg.respDoc || ''))}</div>`)}
      ${sec('CIOT, vale-pedágio e contratante (quando houver)', `<div class="cte-grade">
        ${campo('mfCiot', 'CIOT', ciot.ciot || '', { extra: 'maxlength="12"' })}${campo('mfCiotDoc', 'CPF/CNPJ do contratado (CIOT)', Doc.formatar(ciot.doc || ''))}
        ${campo('mfVpForn', 'CNPJ fornecedora vale-pedágio', Doc.formatar(vp.cnpjForn || ''))}${campo('mfVpDoc', 'CPF/CNPJ do pagador', Doc.formatar(vp.docPg || ''))}${campo('mfVpCompra', 'Nº do comprovante', vp.nCompra || '')}${campo('mfVpValor', 'Valor do vale-pedágio', fmt(vp.vValePed))}
        ${campo('mfContrNome', 'Contratante do frete (nome)', d.contratantes?.[0]?.xNome || '', { classe: 'largo' })}${campo('mfContrDoc', 'CNPJ/CPF do contratante', Doc.formatar(d.contratantes?.[0]?.doc || ''))}</div>`)}
      ${sec('Observações', `<textarea id="mfObs" class="cte-entrada" rows="2" style="width:100%;">${esc(d.infCpl || '')}</textarea>`)}
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:16px;">
        <button class="btn btn-secundario" data-mdfe-fechar style="width:auto;">Fechar</button>
        <button class="btn btn-secundario" id="mfPrevia" style="width:auto;">👁 Prévia do DAMDFE</button>
        <button class="btn btn-secundario" id="mfSalvar" style="width:auto;">💾 Salvar rascunho</button>
        <button class="btn btn-primario" id="mfTransmitir" style="width:auto;">📤 Salvar e transmitir</button></div>`;
    modal.classList.remove('oculto');

    const ler = () => {
      const placa = $('mfVeic').value;
      const cad = veiculos.find((x) => x.placa === placa);
      const doCadastro = (x) => ({ placa: x.placa, renavam: x.renavam || '', tara: x.tara, capKG: x.cap_kg, capM3: x.cap_m3, tpRod: x.tp_rod, tpCar: x.tp_car, uf: x.uf, prop: x.proprietario || undefined });
      const veiculo = cad ? doCadastro(cad) : placa === v.placa ? v : { ...v, placa };
      const nomeOpt = (o) => o.dataset.nome || motoristas.find((x) => x.cpf === o.value)?.nome;
      const lista = (s) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      return {
        ...d,
        ufIni: $('mfUfIni').value, ufFim: $('mfUfFim').value,
        percurso: lista($('mfPercurso').value.toUpperCase()).filter((u) => UFS.includes(u)),
        carregamento: $('mfCarreg').value.split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const [, cMun, xMun] = /^(\d{7})\s*-?\s*(.*)$/.exec(s) || [null, '', s]; return { cMun, xMun: xMun.trim().toUpperCase() }; }),
        veiculo,
        reboques: [...$('mfReboque').selectedOptions].map((o) => doCadastro(veiculos.find((x) => x.placa === o.value))),
        condutores: [...$('mfCond').selectedOptions].map((o) => ({ xNome: nomeOpt(o), cpf: o.value })),
        prodPred: { tpCarga: $('mfTpCarga').value, xProd: $('mfProd').value.trim(), NCM: digitos($('mfNcm').value) || undefined },
        tot: { vCarga: numero($('mfValor').value), cUnid: $('mfUnid').value, qCarga: numero($('mfPeso').value) },
        lacres: lista($('mfLacres').value),
        seguros: [{ respSeg: $('mfRespSeg').value, respDoc: digitos($('mfRespDoc').value), xSeg: $('mfSegNome').value.trim(), cnpjSeg: digitos($('mfSegCnpj').value), nApol: $('mfApolice').value.trim(), nAver: lista($('mfAverb').value) }],
        ciot: $('mfCiot').value.trim() ? [{ ciot: digitos($('mfCiot').value), doc: digitos($('mfCiotDoc').value) }] : [],
        valePedagio: $('mfVpForn').value.trim() ? [{ cnpjForn: digitos($('mfVpForn').value), docPg: digitos($('mfVpDoc').value), nCompra: $('mfVpCompra').value.trim(), vValePed: numero($('mfVpValor').value) }] : [],
        contratantes: $('mfContrDoc').value.trim() ? [{ xNome: $('mfContrNome').value.trim(), doc: digitos($('mfContrDoc').value) }] : [],
        infCpl: $('mfObs').value.trim(),
      };
    };
    const salvar = () => api(`/${id}`, { method: 'PUT', body: JSON.stringify({ dados: ler() }) });
    $('mfSalvar').addEventListener('click', async () => { try { await salvar(); mostrarAlerta('Rascunho salvo.', { tipo: 'sucesso' }); carregarLista(); } catch (e) { erro(e); } });
    $('mfPrevia').addEventListener('click', async () => { try { await salvar(); window.open(`/api/mdfe/${id}/damdfe?token=${encodeURIComponent(token)}`, '_blank'); } catch (e) { erro(e); } });
    $('mfTransmitir').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        await salvar();
        const r = await post(`/${id}/transmitir`);
        if (r.status === 'autorizado') {
          fechar();
          mostrarAlerta(`MDF-e ${r.serie}/${r.numero} autorizado. Protocolo ${r.protocolo}.\nImprima o DAMDFE e entregue ao motorista. Ao terminar a viagem, encerre o MDF-e.`, { tipo: 'sucesso' });
          window.open(`/api/mdfe/${id}/damdfe?token=${encodeURIComponent(token)}`, '_blank');
        } else {
          mostrarAlerta(`A SEFAZ não autorizou: ${r.cstat || ''} - ${r.motivo || ''}${r.cstat === '686' ? '\n\nJá existe MDF-e aberto para essa placa. Encerre o anterior e transmita de novo.' : ''}`, { tipo: 'erro' });
          abrirFormulario(id);
        }
      } catch (err) { erro(err); b.disabled = false; }
      carregarLista();
    });
  }

  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-mdfe-fechar]')) fechar(); });

  // ======================= Veículos e motoristas =======================
  async function montarFrota() {
    await Promise.all([carregarCadastros(), Object.keys(tabelas.tiposRodado).length ? null : api('/tabelas').then((t) => { tabelas = t; })]);
    painelFrota.innerHTML = `<div class="cte-duas" style="display:grid; grid-template-columns:1.4fr 1fr; gap:16px;">
      <div class="painel"><div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🚛 Veículos</h3><button class="btn btn-primario" id="frNovoVeic" style="width:auto;">+ Veículo</button></div>
        <table class="edi-tabela" style="margin-top:10px;"><thead><tr><th>Placa</th><th>Tipo</th><th>Tara / capacidade</th><th>Rodado / carroceria</th><th></th></tr></thead><tbody>
        ${veiculos.map((x) => `<tr style="${x.ativo ? '' : 'opacity:.5;'}"><td><b>${esc(x.placa)}</b><br><small style="color:var(--texto-fraco);">${esc(x.descricao || '')}${x.proprietario?.doc ? ' · terceiro' : ''}</small></td>
          <td>${x.tipo === 'reboque' ? 'Reboque' : 'Tração'}</td><td>${fmt(x.tara, 0)} kg${x.cap_kg ? ` / ${fmt(x.cap_kg, 0)} kg` : ''}</td>
          <td style="font-size:12px;">${esc(tabelas.tiposRodado[x.tp_rod] || '')}${x.tipo === 'reboque' ? '' : ' / '}${esc(tabelas.tiposCarroceria[x.tp_car] || '')}</td>
          <td><div class="cte-acoes"><button class="btn btn-secundario" data-fr-veic="${x.id}">✏️</button>${x.ativo ? `<button class="btn btn-secundario" data-fr-desat-veic="${x.id}">Desativar</button>` : ''}</div></td></tr>`).join('')
          || '<tr><td colspan="5" style="color:var(--texto-fraco);">Nenhum veículo cadastrado.</td></tr>'}</tbody></table></div>
      <div class="painel"><div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">👤 Motoristas</h3><button class="btn btn-primario" id="frNovoMot" style="width:auto;">+ Motorista</button></div>
        <table class="edi-tabela" style="margin-top:10px;"><thead><tr><th>Nome</th><th>CPF</th><th>CNH</th><th></th></tr></thead><tbody>
        ${motoristas.map((x) => { const venc = x.cnh_validade && new Date(x.cnh_validade) < new Date(); return `<tr style="${x.ativo ? '' : 'opacity:.5;'}"><td><b>${esc(x.nome)}</b><br><small style="color:var(--texto-fraco);">${esc(x.telefone || '')}</small></td><td>${cpfFmt(x.cpf)}</td>
          <td style="${venc ? 'color:var(--vermelho);' : ''}">${esc(x.cnh || '')}${x.cnh_validade ? `<br><small>${venc ? 'vencida ' : 'vence '}${new Date(x.cnh_validade).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</small>` : ''}</td>
          <td><div class="cte-acoes"><button class="btn btn-secundario" data-fr-mot="${x.id}">✏️</button>${x.ativo ? `<button class="btn btn-secundario" data-fr-desat-mot="${x.id}">Desativar</button>` : ''}</div></td></tr>`; }).join('')
          || '<tr><td colspan="4" style="color:var(--texto-fraco);">Nenhum motorista cadastrado.</td></tr>'}</tbody></table></div></div>`;
    $('frNovoVeic').addEventListener('click', () => formVeiculo({}));
    $('frNovoMot').addEventListener('click', () => formMotorista({}));
    painelFrota.querySelectorAll('[data-fr-veic]').forEach((b) => b.addEventListener('click', () => formVeiculo(veiculos.find((x) => String(x.id) === b.dataset.frVeic))));
    painelFrota.querySelectorAll('[data-fr-mot]').forEach((b) => b.addEventListener('click', () => formMotorista(motoristas.find((x) => String(x.id) === b.dataset.frMot))));
    painelFrota.querySelectorAll('[data-fr-desat-veic]').forEach((b) => b.addEventListener('click', async () => { try { await api(`/veiculos/${b.dataset.frDesatVeic}`, { method: 'DELETE' }); montarFrota(); } catch (e) { erro(e); } }));
    painelFrota.querySelectorAll('[data-fr-desat-mot]').forEach((b) => b.addEventListener('click', async () => { try { await api(`/motoristas/${b.dataset.frDesatMot}`, { method: 'DELETE' }); montarFrota(); } catch (e) { erro(e); } }));
  }

  function formVeiculo(x) {
    const p = x.proprietario || {};
    modal.querySelector('#mdfeModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🚛 ${x.id ? `Veículo ${esc(x.placa)}` : 'Novo veículo'}</h3><span style="cursor:pointer; font-size:18px;" data-mdfe-fechar>✕</span></div>
      <div class="cte-secao"><div class="cte-grade">
        ${campo('vePlaca', 'Placa', x.placa || '', { ph: 'ABC1D23', extra: 'maxlength="8" style="text-transform:uppercase;"' })}
        <div class="campo"><label for="veTipo">Tipo</label><select id="veTipo" class="cte-entrada"><option value="tracao">Tração (caminhão/cavalo)</option><option value="reboque" ${x.tipo === 'reboque' ? 'selected' : ''}>Reboque / semirreboque</option></select></div>
        ${campo('veDesc', 'Descrição', x.descricao || '', { ph: 'ex.: VW 24.280 truck baú', classe: 'largo' })}
        ${campo('veRenavam', 'RENAVAM', x.renavam || '', { extra: 'maxlength="11"' })}${selUf('veUf', 'UF do licenciamento', x.uf)}
        ${campo('veTara', 'Tara (kg)', x.tara || '', { tipo: 'number' })}${campo('veCapKg', 'Capacidade (kg)', x.cap_kg || '', { tipo: 'number' })}${campo('veCapM3', 'Capacidade (m³)', x.cap_m3 || '', { tipo: 'number' })}
        <div class="campo"><label for="veRod">Tipo de rodado</label><select id="veRod" class="cte-entrada">${opcoes(tabelas.tiposRodado, x.tp_rod || '01')}</select></div>
        <div class="campo"><label for="veCar">Carroceria</label><select id="veCar" class="cte-entrada">${opcoes(tabelas.tiposCarroceria, x.tp_car || '02')}</select></div></div></div>
      <details ${p.doc ? 'open' : ''}><summary style="cursor:pointer;">Veículo de terceiro (agregado / TAC)</summary><div class="cte-grade" style="margin-top:8px;">
        ${campo('vePropDoc', 'CPF/CNPJ do proprietário', Doc.formatar(p.doc || ''))}${campo('vePropNome', 'Nome do proprietário', p.xNome || '', { classe: 'largo' })}${campo('vePropRntrc', 'RNTRC', p.rntrc || '', { extra: 'maxlength="8"' })}
        ${campo('vePropIe', 'IE (ou ISENTO)', p.ie || '')}${selUf('vePropUf', 'UF', p.uf)}
        <div class="campo"><label for="vePropTp">Tipo</label><select id="vePropTp" class="cte-entrada"><option value="0">TAC agregado</option><option value="1" ${String(p.tpProp) === '1' ? 'selected' : ''}>TAC independente</option><option value="2" ${String(p.tpProp) === '2' ? 'selected' : ''}>Outros</option></select></div></div></details>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;"><button class="btn btn-secundario" data-mdfe-fechar style="width:auto;">Voltar</button><button class="btn btn-primario" id="veSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('veSalvar').addEventListener('click', async () => {
      const doc = digitos($('vePropDoc').value);
      try {
        await post('/veiculos', { placa: $('vePlaca').value, tipo: $('veTipo').value, descricao: $('veDesc').value, renavam: $('veRenavam').value, uf: $('veUf').value,
          tara: Number($('veTara').value), cap_kg: Number($('veCapKg').value), cap_m3: Number($('veCapM3').value), tp_rod: $('veRod').value, tp_car: $('veCar').value,
          proprietario: doc ? { doc, xNome: $('vePropNome').value.trim(), rntrc: digitos($('vePropRntrc').value), ie: $('vePropIe').value.trim(), uf: $('vePropUf').value, tpProp: $('vePropTp').value } : null });
        fechar(); montarFrota();
      } catch (e) { erro(e); }
    });
  }

  function formMotorista(x) {
    modal.querySelector('#mdfeModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">👤 ${x.id ? esc(x.nome) : 'Novo motorista'}</h3><span style="cursor:pointer; font-size:18px;" data-mdfe-fechar>✕</span></div>
      <div class="cte-secao"><div class="cte-grade">${campo('moNome', 'Nome completo', x.nome || '', { classe: 'largo' })}${campo('moCpf', 'CPF', cpfFmt(x.cpf || ''))}
        ${campo('moTel', 'Telefone / WhatsApp', x.telefone || '')}${campo('moCnh', 'Nº da CNH', x.cnh || '')}${campo('moCnhVal', 'Validade da CNH', x.cnh_validade ? String(x.cnh_validade).slice(0, 10) : '', { tipo: 'date' })}</div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;"><button class="btn btn-secundario" data-mdfe-fechar style="width:auto;">Voltar</button><button class="btn btn-primario" id="moSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('moSalvar').addEventListener('click', async () => {
      try { await post('/motoristas', { nome: $('moNome').value, cpf: $('moCpf').value, telefone: $('moTel').value, cnh: $('moCnh').value, cnh_validade: $('moCnhVal').value }); fechar(); montarFrota(); } catch (e) { erro(e); }
    });
  }
})();
