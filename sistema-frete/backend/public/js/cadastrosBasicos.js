// =====================================================================
// Configuração » 🗂 Cadastros básicos (código 907): fornecedores, ajudantes, conjuntos (cavalo +
// carretas), produtos, tipos de mercadoria, departamentos, regiões de atendimento, tipos de
// operação e condições de pagamento. A tela é montada pelas definições do servidor
// (src/cadastrosBasicos.js): uma aba por cadastro, lista com busca e o formulário de cada um.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar; do documento.js: Doc.
// =====================================================================
window.CadastrosBasicos = (() => {
  const nav = document.getElementById('navCadastrosBasicos');
  const cont = document.getElementById('cbConteudo');
  if (!nav || !cont) return null;
  if (usuario?.perfil === 'cliente') { nav.classList.add('oculto'); return null; }
  nav.classList.remove('oculto');
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const json = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro || 'Erro.'); return d; };
  const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let defs = null; let atual = null; let lista = []; const opcoesCache = {};

  async function opcoes(fonte) {
    if (!opcoesCache[fonte]) opcoesCache[fonte] = apiFetch(`/api/cadastros-basicos/opcoes/${fonte}`).then(json).catch(() => []);
    return opcoesCache[fonte];
  }
  const mostrar = async (c, r) => {
    const v = r[c.nome];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
    if (c.tipo === 'bool') return v ? 'Sim' : 'Não';
    if (c.tipo === 'doc') return esc(window.Doc ? Doc.formatar(v) : v);
    if (c.tipo === 'select') return esc(c.opcoes[v] ?? v);
    if (c.tipo === 'ref') { const o = (await opcoes(c.fonte)).find((x) => x.id === v); return esc(o?.nome || `#${v}`); }
    if (c.tipo === 'refs') { const os = await opcoes(c.fonte); return esc(v.map((id) => os.find((x) => x.id === id)?.nome || `#${id}`).join(', ')); }
    if (c.tipo === 'semana') return v.map((d) => SEMANA[d]).join(', ');
    if (c.tipo === 'dias') return v.map((d) => (d === 0 ? 'à vista' : `${d}d`)).join(' / ');
    if (c.tipo === 'lista') return esc(v.length > 4 ? `${v.slice(0, 4).join(', ')} e mais ${v.length - 4}` : v.join(', '));
    if (c.tipo === 'numero') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    return esc(v);
  };

  async function montar() {
    defs = await apiFetch('/api/cadastros-basicos').then(json);
    cont.innerHTML = `<div class="cte-abas" id="cbAbas" style="flex-wrap:wrap;">${Object.entries(defs).map(([k, d]) => `<div class="cte-aba" data-cb-aba="${k}">${d.icone} ${esc(d.titulo)}</div>`).join('')}</div>
      <p id="cbAjuda" style="font-size:12.5px; color:var(--texto-fraco); margin-top:-6px;"></p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;"><input type="search" id="cbBusca" placeholder="🔍 Buscar" style="flex:1; min-width:220px;" />
        <label class="ac-opcao" style="font-size:12.5px;"><input type="checkbox" id="cbSoAtivos" checked /> só ativos</label>
        <button class="btn btn-secundario oculto" id="cbImportar" style="width:auto;" title="Os fornecedores que já aparecem nas contas a pagar e nas notas de entrada">⬇ Trazer dos lançamentos</button>
        <button class="btn btn-primario" id="cbNovo" style="width:auto;">＋ Novo</button></div>
      <div class="painel" style="overflow-x:auto;"><div id="cbTabela"></div></div>`;
    $('cbAbas').addEventListener('click', (e) => { const a = e.target.closest('[data-cb-aba]'); if (a) abrirAba(a.dataset.cbAba); });
    let t; $('cbBusca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 300); });
    $('cbSoAtivos').addEventListener('change', carregar);
    $('cbNovo').addEventListener('click', () => formulario(null));
    $('cbImportar').addEventListener('click', async () => {
      try { const r = await apiFetch('/api/cadastros-basicos/fornecedores/importar', { method: 'POST' }).then(json); mostrarAlerta(`${r.novos} fornecedor(es) trazidos dos lançamentos; ${r.contas_ligadas} conta(s) a pagar ligadas a eles.`, { tipo: 'sucesso' }); carregar(); }
      catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    });
    abrirAba(atual || Object.keys(defs)[0]);
  }
  function abrirAba(tipo) {
    atual = tipo;
    document.querySelectorAll('[data-cb-aba]').forEach((a) => a.classList.toggle('ativo', a.dataset.cbAba === tipo));
    $('cbAjuda').textContent = defs[tipo].ajuda;
    $('cbNovo').classList.toggle('oculto', !defs[tipo].pode_editar);
    $('cbImportar').classList.toggle('oculto', tipo !== 'fornecedores' || !defs[tipo].pode_editar);
    $('cbBusca').value = '';
    carregar();
  }
  async function carregar() {
    const d = defs[atual];
    try { lista = await apiFetch(`/api/cadastros-basicos/${atual}?${new URLSearchParams({ busca: $('cbBusca').value.trim(), ativos: $('cbSoAtivos').checked ? '1' : '' })}`).then(json); }
    catch (e) { $('cbTabela').innerHTML = `<p style="color:var(--vermelho);">${esc(e.message)}</p>`; return; }
    const colunas = d.campos.filter((c) => !['observacoes', 'pix', 'email', 'cep', 'logradouro', 'numero', 'bairro', 'ie', 'nome_fantasia', 'descricao', 'onu', 'classe_risco', 'altura_cm', 'largura_cm', 'comprimento_cm', 'cliente_documento', 'embalagem', 'valor_unitario', 'categoria_padrao'].includes(c.nome) || c.nome === d.nome).slice(0, 7);
    if (!lista.length) { $('cbTabela').innerHTML = '<p style="color:var(--texto-fraco); padding:14px;">Nenhum cadastro ainda.</p>'; return; }
    const linhas = await Promise.all(lista.map(async (r) => `<tr style="${r.ativo ? '' : 'opacity:.55;'}">${(await Promise.all(colunas.map((c) => mostrar(c, r)))).map((v) => `<td>${v}</td>`).join('')}
      <td>${r.ativo ? '' : '<span class="oc-sit cancelado">inativo</span>'}</td>
      <td style="white-space:nowrap; text-align:right;">${d.pode_editar ? `<button class="btn btn-secundario" data-cb-editar="${r.id}" style="width:auto; padding:4px 10px; font-size:12px;">Editar</button>` : ''}
        <button class="btn btn-secundario" data-cb-hist="${r.id}" style="width:auto; padding:4px 10px; font-size:12px;" title="Alterações deste cadastro">🕘</button></td></tr>`));
    $('cbTabela').innerHTML = `<table style="width:100%; font-size:13px;"><thead><tr>${colunas.map((c) => `<th style="text-align:left;">${esc(c.rotulo.replace(/\s*\(.*\)$/, ''))}</th>`).join('')}<th></th><th></th></tr></thead><tbody>${linhas.join('')}</tbody></table>`;
    $('cbTabela').querySelectorAll('[data-cb-editar]').forEach((b) => b.addEventListener('click', () => formulario(lista.find((x) => x.id === Number(b.dataset.cbEditar)))));
    $('cbTabela').querySelectorAll('[data-cb-hist]').forEach((b) => b.addEventListener('click', () => {
      const r = lista.find((x) => x.id === Number(b.dataset.cbHist));
      window.Alteracoes?.abrir({ tabela: atual, registro_id: String(r.id), titulo: `${d.titulo}: ${r[d.nome] || r.codigo || `#${r.id}`}` });
    }));
  }

  async function campoHtml(c, r) {
    const v = r?.[c.nome];
    const id = `cbf_${c.nome}`;
    const rot = `<label for="${id}">${esc(c.rotulo)}${c.obrig ? ' *' : ''}</label>`;
    if (c.tipo === 'bool') return `<label class="ac-opcao" style="grid-column:span 1; padding-top:22px;"><input type="checkbox" id="${id}" data-cb-campo="${c.nome}" ${v ? 'checked' : ''} /> ${esc(c.rotulo)}</label>`;
    if (c.tipo === 'select' || c.tipo === 'ref' || c.tipo === 'uf') {
      const ops = c.tipo === 'select' ? Object.entries(c.opcoes).map(([k, n]) => [k, n]) : c.tipo === 'uf' ? ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'].map((u) => [u, u]) : (await opcoes(c.fonte)).map((o) => [o.id, o.nome]);
      return `<div class="campo" style="margin:0;">${rot}<select id="${id}" data-cb-campo="${c.nome}"><option value="">—</option>${ops.map(([k, n]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
    }
    if (c.tipo === 'refs') {
      const ops = await opcoes(c.fonte);
      return `<div class="campo" style="margin:0; grid-column:1 / -1;">${rot}<div style="display:flex; flex-wrap:wrap; gap:4px 14px;">${ops.length ? ops.map((o) => `<label class="ac-opcao"><input type="checkbox" data-cb-refs="${c.nome}" value="${o.id}" ${(v || []).includes(o.id) ? 'checked' : ''} /> ${esc(o.nome)}</label>`).join('') : '<small style="color:var(--texto-fraco);">Nenhuma carreta cadastrada (Veículos e motoristas, tipo reboque).</small>'}</div></div>`;
    }
    if (c.tipo === 'semana') return `<div class="campo" style="margin:0; grid-column:1 / -1;">${rot}<div style="display:flex; gap:12px; flex-wrap:wrap;">${SEMANA.map((n, i) => `<label class="ac-opcao"><input type="checkbox" data-cb-semana="${c.nome}" value="${i}" ${(v || (r ? [] : [1, 2, 3, 4, 5])).includes(i) ? 'checked' : ''} /> ${n}</label>`).join('')}</div></div>`;
    if (c.tipo === 'lista') {
      const txt = (v || []).map((x) => (c.formato === 'cep' ? x.replace(/^(\d{5})(\d{3})-(\d{5})(\d{3})$/, '$1-$2 a $3-$4') : x)).join(c.formato === 'uf' ? ', ' : '\n');
      return `<div class="campo" style="margin:0; grid-column:1 / -1;">${rot}${c.formato === 'uf' ? `<input id="${id}" data-cb-campo="${c.nome}" value="${esc(txt)}" />` : `<textarea id="${id}" data-cb-campo="${c.nome}" rows="3">${esc(txt)}</textarea>`}</div>`;
    }
    if (c.tipo === 'dias') return `<div class="campo" style="margin:0;">${rot}<input id="${id}" data-cb-campo="${c.nome}" value="${esc((v || [0]).join(', '))}" /></div>`;
    const tipoInput = c.tipo === 'numero' || c.tipo === 'inteiro' ? `type="number" step="${c.tipo === 'inteiro' ? '1' : 'any'}"` : 'type="text"';
    return `<div class="campo" style="margin:0; ${c.nome === 'observacoes' ? 'grid-column:1 / -1;' : ''}">${rot}<input ${tipoInput} id="${id}" data-cb-campo="${c.nome}" ${c.tipo === 'doc' ? 'data-doc' : ''} value="${esc(c.tipo === 'doc' && v && window.Doc ? Doc.formatar(v) : v ?? '')}" ${c.max && c.tipo === 'texto' ? `maxlength="${c.max}"` : ''} /></div>`;
  }

  async function formulario(r) {
    const d = defs[atual];
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card cb-form" style="max-width:860px; width:100%; max-height:92vh; overflow-y:auto; padding:20px 22px;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">${d.icone} ${r ? 'Editar' : 'Novo'} — ${esc(d.titulo)}</h3><span style="cursor:pointer; font-size:18px;" data-cb-fechar>✕</span></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px 14px; margin-top:14px;">${(await Promise.all(d.campos.map((c) => campoHtml(c, r)))).join('')}</div>
      ${r ? `<label class="ac-opcao" style="margin-top:12px;"><input type="checkbox" id="cbAtivo" ${r.ativo ? 'checked' : ''} /> Ativo (desmarque para tirar das listas sem apagar)</label>` : ''}
      <div id="cbErro" class="mensagem-erro" style="margin-top:10px;"></div>
      <div style="display:flex; justify-content:space-between; gap:8px; margin-top:14px;">
        <div>${r ? '<button class="btn btn-secundario" id="cbExcluir" style="width:auto; color:var(--vermelho);">Excluir</button>' : ''}</div>
        <div style="display:flex; gap:8px;"><button class="btn btn-secundario" data-cb-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="cbSalvar" style="width:auto;">Salvar</button></div></div></div>`;
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-cb-fechar]')) fundo.remove(); });
    // Fornecedor: CNPJ completo busca os dados na Receita (os campos vazios).
    if (atual === 'fornecedores' && window.Doc?.registrar && !CadastrosBasicos.docRegistrado) {
      Doc.registrar('.cb-form #cbf_documento', { razao_social: '#cbf_razao_social', nome_fantasia: '#cbf_nome_fantasia', ie: '#cbf_ie', logradouro: '#cbf_logradouro', numero: '#cbf_numero',
        bairro: '#cbf_bairro', municipio: '#cbf_municipio', uf: '#cbf_uf', cep: '#cbf_cep', telefone: '#cbf_telefone', email: '#cbf_email' });
      CadastrosBasicos.docRegistrado = true;
    }
    fundo.querySelector('#cbSalvar').addEventListener('click', async () => {
      const corpo = {};
      d.campos.forEach((c) => {
        if (c.tipo === 'refs') corpo[c.nome] = [...fundo.querySelectorAll(`[data-cb-refs="${c.nome}"]:checked`)].map((x) => Number(x.value));
        else if (c.tipo === 'semana') corpo[c.nome] = [...fundo.querySelectorAll(`[data-cb-semana="${c.nome}"]:checked`)].map((x) => Number(x.value));
        else { const el = fundo.querySelector(`[data-cb-campo="${c.nome}"]`); corpo[c.nome] = c.tipo === 'bool' ? el.checked : el.value; }
      });
      if (r) corpo.ativo = fundo.querySelector('#cbAtivo').checked;
      try {
        await apiFetch(r ? `/api/cadastros-basicos/${atual}/${r.id}` : `/api/cadastros-basicos/${atual}`, { method: r ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(json);
        fundo.remove(); Object.keys(opcoesCache).forEach((k) => delete opcoesCache[k]);
        mostrarAlerta('Salvo.', { tipo: 'sucesso' }); carregar();
      } catch (e) { const er = fundo.querySelector('#cbErro'); er.textContent = e.message; er.classList.add('visivel'); }
    });
    fundo.querySelector('#cbExcluir')?.addEventListener('click', async () => {
      if (!(await confirmar('Excluir este cadastro? Se ele já estiver em uso, o sistema pede para desativar em vez de excluir.'))) return;
      try { await apiFetch(`/api/cadastros-basicos/${atual}/${r.id}`, { method: 'DELETE' }).then(json); fundo.remove(); Object.keys(opcoesCache).forEach((k) => delete opcoesCache[k]); carregar(); }
      catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    });
  }

  nav.addEventListener('click', () => { (defs ? carregar() : montar()).catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })); });
  // Outras telas usam as listas (fornecedores nas contas a pagar, conjuntos no MDF-e...).
  return { opcoes, abrirAba: (tipo) => { atual = tipo; if (defs) abrirAba(tipo); } };
})();
