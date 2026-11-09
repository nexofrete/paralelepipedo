// =====================================================================
// Acesso por usuário (Cadastros » Usuários):
//  • Módulos da transportadora bloqueados: somem do menu (e a API do módulo não responde).
//  • Filiais: o usuário limitado a filiais só vê os documentos delas (CT-e, romaneios,
//    contas a pagar, onde está a mercadoria).
//  • Perfis de acesso com nome: aplicam permissões e módulos de uma vez; mudar o perfil
//    atualiza todos os usuários dele.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar.
// As telas de cada módulo seguem src/permissoes.js (MODULOS).
// =====================================================================
window.Acessos = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MODULOS = {
    operacao: ['Operação (CT-e, MDF-e, coletas, cotações, entregas, parceiros)', ['emissao-cte', 'coletas', 'cotacoes', 'conferencia', 'ocorrencias', 'monitoramento', 'paletes', 'parceiros', 'filiais']],
    frota: ['Frota', ['frota']],
    armazem: ['Armazém', ['armazem']],
    faturamento: ['Faturamento e contas a receber', ['faturamento']],
    pagar: ['Contas a pagar, acerto de viagem e comissões', ['pagar', 'comissoes']],
    bancos: ['Caixa e bancos', ['bancos']],
    fiscal: ['Fiscal e contabilidade', ['contabil']],
    sac: ['SAC (chamados)', ['sac']],
    gerencial: ['Painel gerencial, margem e centros de custo', ['painel-transporte', 'centros']],
  };
  // Chave de permissão de cada interruptor do formulário de usuário.
  const PERMISSOES = { pVerTodos: 'pode_ver_todos', pEnviarXml: 'pode_enviar_xml', pEditar: 'pode_editar_registros', pExcluir: 'pode_excluir_registros',
    pGerenciarUsuarios: 'pode_gerenciar_usuarios', pGerenciarTransportadoras: 'pode_gerenciar_transportadoras', pGerenciarTabelasPreco: 'pode_gerenciar_tabelas_preco',
    pAprovarPagamento: 'pode_aprovar_pagamento', pAprovarValoresAltos: 'pode_aprovar_valores_altos', pVerAuditoria: 'pode_ver_auditoria', pVerFinanceiro: 'pode_ver_financeiro',
    pVerRelatorios: 'pode_ver_relatorios', pVerSinistros: 'pode_ver_sinistros', pConferirFatura: 'pode_conferir_fatura', pEmitirCte: 'pode_emitir_cte' };
  const nomePermissao = (id) => $(id)?.closest('.permissao-item')?.querySelector('.permissao-nome')?.textContent.trim() || PERMISSOES[id];

  // ---------- Menu: esconde as telas dos módulos bloqueados ----------
  const bloqueados = () => (usuario?.perfil === 'admin' ? [] : (usuario?.modulos_bloqueados || []));
  const paginasBloqueadas = () => bloqueados().flatMap((m) => MODULOS[m]?.[1] || []);
  function esconder() {
    paginasBloqueadas().forEach((p) => {
      const item = document.querySelector(`.barra-lateral .nav-item[data-pagina="${p}"]`);
      if (!item || item.dataset.bloqueadoModulo) return;
      item.dataset.bloqueadoModulo = '1';
      item.classList.add('oculto');
      // Os scripts das telas tiram o "oculto" quando o usuário tem a permissão: aqui ele volta.
      new MutationObserver(() => { if (!item.classList.contains('oculto')) item.classList.add('oculto'); }).observe(item, { attributes: true, attributeFilter: ['class'] });
    });
  }
  esconder();

  // ---------- Acesso por tela (src/acessoTelas.js) ----------
  let catalogo = null;
  const usaGrade = () => usuario?.perfil === 'interno' && usuario?.acesso_telas && typeof usuario.acesso_telas === 'object';
  const nivel = (id) => (usaGrade() ? (usuario.acesso_telas[id] || 'nenhum') : 'opera');
  // O menu escreve "p:tela" e o catálogo "t:tela:" para a mesma tela sem aba.
  const formas = (d) => { const m = /^p:([^:]+)$/.exec(d) || /^t:([^:]+):$/.exec(d); return m ? [`p:${m[1]}`, `t:${m[1]}:`] : [d]; };
  const telaDoDestino = (dest) => catalogo?.telas.find((t) => formas(dest).some((f) => t.menu.includes(f)));
  // Para o js/familias.js (Navegar.acessivel) e o "Ir para": destino de uma tela que este usuário não vê.
  const destinoBloqueado = (dest) => { const t = telaDoDestino(dest); return !!t && nivel(t.id) === 'nenhum'; };
  function aplicarTelas() {
    if (!catalogo || !usaGrade()) return;
    catalogo.telas.filter((t) => nivel(t.id) === 'nenhum').forEach((t) => {
      t.menu.flatMap(formas).forEach((d) => document.querySelectorAll(`.barra-lateral .nav-tsub[data-destino="${d}"]`).forEach((el) => { el.classList.add('oculto'); el.dataset.bloqueadoTela = '1'; }));
      (t.abas || []).forEach(([attr, val]) => document.querySelectorAll(`[${attr}="${val}"]`).forEach((el) => { el.classList.add('oculto'); el.dataset.bloqueadoTela = '1'; }));
    });
    document.dispatchEvent(new Event('modulos-mudou'));
  }
  // Aviso discreto quando a tela aberta é "só consulta".
  function avisoConsulta() {
    if (!catalogo || !usaGrade() || !window.Navegar) return;
    const t = catalogo.telas.find((x) => nivel(x.id) === 'consulta' && x.menu.flatMap(formas).some((d) => window.Navegar.ehAtual(d)));
    let el = $('acAvisoConsulta');
    if (!t) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'acAvisoConsulta'; el.style.cssText = 'position:fixed; right:16px; bottom:16px; z-index:50; background:var(--fundo-card, #fff); border:1px solid var(--borda); border-left:4px solid #f59e0b; border-radius:8px; padding:8px 12px; font-size:12.5px; box-shadow:0 4px 14px rgba(0,0,0,.12); max-width:320px;'; document.body.appendChild(el); }
    el.innerHTML = `👁 <b>${esc(t.nome)}</b>: o seu usuário só consulta esta tela (não altera nada).`;
  }
  if (usaGrade()) {
    apiFetch('/api/acesso/catalogo').then((r) => (r.ok ? r.json() : null)).then((c) => {
      catalogo = c; aplicarTelas(); avisoConsulta();
      // Os scripts das telas tiram o "oculto" quando o usuário tem a permissão antiga: aqui ele volta.
      new MutationObserver((ms) => ms.forEach((m) => { if (m.target.dataset?.bloqueadoTela && !m.target.classList.contains('oculto')) m.target.classList.add('oculto'); }))
        .observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    }).catch(() => {});
    document.addEventListener('tela-mudou', () => setTimeout(avisoConsulta, 50));
  }

  // ---------- Formulário de usuário: perfil, telas e filiais ----------
  let perfis = []; let unidades = null;
  async function carregarListas() {
    try { const r = await apiFetch('/api/perfis-acesso'); if (r.ok) { const j = await r.json(); perfis = j.perfis; catalogo = catalogo || j.catalogo; } } catch { /* sem permissão */ }
    if (unidades === null) {
      try { const r = await apiFetch('/api/unidades'); unidades = r.ok ? await r.json() : []; if (!Array.isArray(unidades)) unidades = unidades.unidades || []; } catch { unidades = []; }
    }
  }
  function montarSecao() {
    if ($('acSecao')) return;
    const alvo = $('campoPermissoes');
    if (!alvo) return;
    const div = document.createElement('div');
    div.id = 'acSecao';
    div.style.cssText = 'grid-column:1 / -1; margin-top:14px; border-top:1px solid var(--borda); padding-top:12px;';
    div.innerHTML = `<div class="campo" style="margin-bottom:10px;"><label>Departamento</label><select id="acDepartamento"><option value="">—</option></select></div>
      <div class="campo" style="margin-bottom:10px;"><label>Perfil de acesso</label>
        <select id="acPerfil"><option value="">Sem perfil (permissões marcadas à mão)</option></select>
        <small style="color:var(--texto-fraco);">Escolher um perfil marca as permissões e os módulos dele. Quem segue um perfil é atualizado quando o perfil muda.</small></div>
      <div id="acGrade"></div>
      <div id="acFiliaisBloco"><div style="font-size:13px; font-weight:600; margin:8px 0 4px;">Filiais que este usuário enxerga</div>
      <small style="color:var(--texto-fraco);">Nenhuma marcada = todas. Marcadas: CT-e, romaneios, contas a pagar e "onde está a mercadoria" só das filiais escolhidas (e os documentos sem filial).</small>
      <div id="acFiliais" style="display:flex; flex-wrap:wrap; gap:6px 16px; margin-top:6px;"></div></div>`;
    alvo.appendChild(div);
    $('acPerfil').addEventListener('change', () => aplicarPerfil(Number($('acPerfil').value)));
  }
  // Grade: uma linha por tela (Não vê / Só consulta / Opera), por área, e as ações sensíveis.
  const NIVEL_COR = { nenhum: 'var(--texto-fraco)', consulta: '#f59e0b', opera: 'var(--verde)' };
  function htmlGrade(prefixo, telas, acoes) {
    if (!catalogo) return '<small>Carregando as telas…</small>';
    const areas = [...new Set(catalogo.telas.map((t) => t.area))];
    const sel = (t) => `<select data-${prefixo}-tela="${t.id}" style="width:auto; padding:3px 6px; font-size:12.5px; color:${NIVEL_COR[telas?.[t.id] || 'nenhum']};">
      ${Object.entries(catalogo.niveis).map(([k, n]) => `<option value="${k}" ${(telas?.[t.id] || 'nenhum') === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    return `<div style="font-size:13px; font-weight:600; margin:10px 0 2px;">Telas que este usuário usa</div>
      <small style="color:var(--texto-fraco);"><b>Não vê</b>: a tela some do menu e o servidor recusa. <b>Só consulta</b>: vê, mas não altera. <b>Opera</b>: vê e altera. Cadastros: a leitura das listas é livre (as outras telas usam).</small>
      ${areas.map((a) => `<div style="margin-top:8px; border:1px solid var(--borda); border-radius:8px; padding:6px 10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;"><b style="font-size:12.5px;">${esc(a)}</b>
          <span style="font-size:11.5px;">Todas: ${Object.entries(catalogo.niveis).map(([k, n]) => `<a href="#" data-${prefixo}-area="${esc(a)}" data-nivel="${k}">${n}</a>`).join(' · ')}</span></div>
        ${catalogo.telas.filter((t) => t.area === a).map((t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:3px 0; border-top:1px dashed var(--borda);">
          <span style="font-size:12.5px;">${esc(t.nome)}<br><small style="color:var(--texto-fraco);">${esc(t.desc)}</small></span>${sel(t)}</div>`).join('')}</div>`).join('')}
      <div style="font-size:13px; font-weight:600; margin:12px 0 4px;">Ações sensíveis</div>
      <small style="color:var(--texto-fraco);">Mesmo operando a tela, estas só com a chave marcada.</small>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:4px 14px; margin-top:6px;">
        ${Object.entries(catalogo.acoes).map(([k, n]) => `<label class="ac-opcao"><input type="checkbox" data-${prefixo}-acao="${k}" ${(acoes || []).includes(k) ? 'checked' : ''} /> ${esc(n)}</label>`).join('')}</div>`;
  }
  function ligarGrade(raiz, prefixo) {
    raiz.querySelectorAll(`[data-${prefixo}-tela]`).forEach((s) => s.addEventListener('change', () => { s.style.color = NIVEL_COR[s.value]; }));
    raiz.querySelectorAll(`[data-${prefixo}-area]`).forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      catalogo.telas.filter((t) => t.area === a.getAttribute(`data-${prefixo}-area`)).forEach((t) => { const s = raiz.querySelector(`[data-${prefixo}-tela="${t.id}"]`); s.value = a.dataset.nivel; s.style.color = NIVEL_COR[s.value]; });
    }));
  }
  const lerGrade = (raiz, prefixo) => ({
    telas: Object.fromEntries([...raiz.querySelectorAll(`[data-${prefixo}-tela]`)].map((s) => [s.getAttribute(`data-${prefixo}-tela`), s.value])),
    acoes: [...raiz.querySelectorAll(`[data-${prefixo}-acao]:checked`)].map((c) => c.getAttribute(`data-${prefixo}-acao`)),
  });
  // As chaves antigas das telas agora saem da grade: escondidas no formulário.
  const CHAVES_DA_GRADE = ['pEmitirCte', 'pVerFinanceiro', 'pVerAuditoria', 'pVerRelatorios', 'pVerSinistros'];
  function esconderChavesDaGrade(sim) {
    CHAVES_DA_GRADE.forEach((id) => $(id)?.closest('.permissao-item')?.classList.toggle('oculto', sim));
    document.querySelectorAll('.grupo-permissoes').forEach((g) => { const itens = [...g.querySelectorAll('.permissao-item')]; g.classList.toggle('oculto', sim && itens.length && itens.every((i) => i.classList.contains('oculto'))); });
  }
  function aplicarPerfil(id) {
    const p = perfis.find((x) => x.id === id);
    if (!p) return;
    Object.entries(PERMISSOES).forEach(([el, campo]) => { if ($(el)) $(el).checked = !!p.permissoes?.[campo]; });
    if ($('acGrade') && catalogo) { $('acGrade').innerHTML = htmlGrade('ac', p.telas || {}, p.acoes || []); ligarGrade($('acGrade'), 'ac'); }
  }
  async function preencherFormulario(u) {
    montarSecao();
    if (!$('acSecao')) return;
    await carregarListas();
    if (!catalogo) catalogo = await apiFetch('/api/acesso/catalogo').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    // Usuário novo ou sem grade: tudo "Opera" nas telas que as permissões marcadas abririam fica para o servidor; aqui começa vazio.
    $('acGrade').innerHTML = htmlGrade('ac', u?.acesso_telas || {}, u?.acesso_acoes || (u ? [] : []));
    ligarGrade($('acGrade'), 'ac');
    esconderChavesDaGrade(true);
    $('acPerfil').innerHTML = `<option value="">Sem perfil (permissões marcadas à mão)</option>${perfis.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}`;
    $('acPerfil').value = u?.perfil_acesso_id ? String(u.perfil_acesso_id) : '';
    const deptos = await apiFetch('/api/cadastros-basicos/opcoes/departamentos').then((r) => (r.ok ? r.json() : [])).catch(() => []);
    $('acDepartamento').innerHTML = `<option value="">—</option>${deptos.map((d) => `<option value="${d.id}" ${Number(u?.departamento_id) === d.id ? 'selected' : ''}>${esc(d.nome)}</option>`).join('')}`;
    const perm = (u?.unidades_permitidas || []).map(Number);
    $('acFiliaisBloco').classList.toggle('oculto', !unidades.length);
    $('acFiliais').innerHTML = unidades.map((x) => `<label class="ac-opcao"><input type="checkbox" data-ac-filial="${x.id}" ${perm.includes(x.id) ? 'checked' : ''} /> ${esc(x.sigla ? `${x.sigla} — ${x.nome}` : x.nome)}</label>`).join('');
  }
  function valoresDoFormulario() {
    if (!$('acSecao')) return {};
    return {
      perfil_acesso_id: Number($('acPerfil').value) || null,
      departamento_id: Number($('acDepartamento').value) || null,
      modulos_bloqueados: [],   // a grade de telas substitui o bloqueio por módulo
      ...(() => { const g = lerGrade($('acGrade'), 'ac'); return { acesso_telas: g.telas, acesso_acoes: g.acoes }; })(),
      unidades_permitidas: [...document.querySelectorAll('[data-ac-filial]:checked')].map((c) => Number(c.dataset.acFilial)),
    };
  }
  // Texto curto para a lista de usuários.
  function resumo(u) {
    if (u.perfil === 'admin') return '';
    const partes = [];
    const p = perfis.find((x) => x.id === u.perfil_acesso_id);
    if (p) partes.push(`Perfil: ${p.nome}`);
    if (u.acesso_telas && catalogo) {
      const n = Object.values(u.acesso_telas);
      partes.push(`${n.filter((x) => x === 'opera').length} tela(s) operando, ${n.filter((x) => x === 'consulta').length} só consulta`);
    }
    if ((u.unidades_permitidas || []).length) {
      const nomes = (unidades || []).filter((x) => u.unidades_permitidas.includes(x.id)).map((x) => x.sigla || x.nome);
      partes.push(`filiais: ${nomes.join(', ') || u.unidades_permitidas.length}`);
    }
    return partes.join(' · ');
  }

  // ---------- Perfis de acesso (janela) ----------
  function botaoPerfis() {
    const novo = $('btnNovoUsuario');
    if (!novo || $('btnPerfisAcesso')) return;
    const b = document.createElement('button');
    b.id = 'btnPerfisAcesso'; b.className = 'btn btn-secundario'; b.style.cssText = 'width:auto; margin-right:8px;';
    b.textContent = '🧩 Perfis de acesso';
    b.addEventListener('click', abrirPerfis);
    novo.parentNode.insertBefore(b, novo);
  }
  botaoPerfis();

  async function abrirPerfis() {
    await carregarListas();
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay'; fundo.id = 'acJanelaPerfis';
    fundo.innerHTML = '<div class="painel modal-card" style="max-width:820px; width:100%; max-height:92vh; overflow-y:auto; padding:20px 22px;" id="acPerfisCorpo"></div>';
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-ac-fechar]')) fundo.remove(); });
    listaPerfis();
  }
  function listaPerfis() {
    const corpo = $('acPerfisCorpo'); if (!corpo) return;
    corpo.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🧩 Perfis de acesso</h3><span style="cursor:pointer; font-size:18px;" data-ac-fechar>✕</span></div>
      <p style="font-size:13px; color:var(--texto-fraco);">Um perfil junta as permissões e os módulos de uma função (ex.: Faturamento, Operador de CT-e, Auditor). Ao escolher o perfil no cadastro do usuário, tudo é marcado de uma vez; mudar o perfil aqui atualiza na hora todos os usuários que o seguem (administradores não mudam).</p>
      ${perfis.length ? `<table style="width:100%; font-size:13px;"><thead><tr><th style="text-align:left;">Perfil</th><th style="text-align:left;">Permissões</th><th style="text-align:right;">Usuários</th><th></th></tr></thead><tbody>
        ${perfis.map((p) => `<tr><td><b>${esc(p.nome)}</b>${p.descricao ? `<br><small style="color:var(--texto-fraco);">${esc(p.descricao)}</small>` : ''}</td>
          <td style="font-size:12px;">${esc(Object.entries(PERMISSOES).filter(([, c]) => p.permissoes?.[c]).map(([el]) => nomePermissao(el)).join(', ') || 'nenhuma')}${(p.modulos_bloqueados || []).length ? `<br><small style="color:var(--vermelho);">sem: ${esc(p.modulos_bloqueados.map((m) => (MODULOS[m]?.[0] || m).split(' (')[0]).join(', '))}</small>` : ''}</td>
          <td style="text-align:right;">${p.usuarios}</td>
          <td style="white-space:nowrap; text-align:right;"><button class="btn btn-secundario" data-ac-editar="${p.id}" style="width:auto; padding:4px 10px; font-size:12px;">Editar</button>
            <button class="btn btn-secundario" data-ac-excluir="${p.id}" style="width:auto; padding:4px 10px; font-size:12px;">Excluir</button></td></tr>`).join('')}</tbody></table>`
        : '<p style="color:var(--texto-fraco);">Nenhum perfil ainda.</p>'}
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;"><button class="btn btn-primario" id="acNovoPerfil" style="width:auto;">＋ Novo perfil</button><button class="btn btn-secundario" data-ac-fechar style="width:auto;">Fechar</button></div>`;
    $('acNovoPerfil').addEventListener('click', () => formPerfil(null));
    corpo.querySelectorAll('[data-ac-editar]').forEach((b) => b.addEventListener('click', () => formPerfil(perfis.find((p) => p.id === Number(b.dataset.acEditar)))));
    corpo.querySelectorAll('[data-ac-excluir]').forEach((b) => b.addEventListener('click', async () => {
      const p = perfis.find((x) => x.id === Number(b.dataset.acExcluir));
      if (!(await confirmar(`Excluir o perfil "${p.nome}"? Os ${p.usuarios} usuário(s) dele continuam com as permissões que já têm, só deixam de seguir o perfil.`))) return;
      const r = await apiFetch(`/api/perfis-acesso/${p.id}`, { method: 'DELETE' });
      if (!r.ok) { mostrarAlerta((await r.json().catch(() => ({}))).erro || 'Erro ao excluir.', { tipo: 'erro' }); return; }
      await carregarListas(); listaPerfis();
    }));
  }
  function formPerfil(p) {
    const corpo = $('acPerfisCorpo');
    corpo.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">${p ? `Editar perfil "${esc(p.nome)}"` : 'Novo perfil de acesso'}</h3><span style="cursor:pointer; font-size:18px;" data-ac-fechar>✕</span></div>
      <div style="display:grid; grid-template-columns:1fr 2fr; gap:10px; margin-top:12px;">
        <div class="campo" style="margin:0;"><label>Nome</label><input id="acPNome" maxlength="80" value="${esc(p?.nome || '')}" placeholder="Ex.: Faturamento" /></div>
        <div class="campo" style="margin:0;"><label>Descrição (opcional)</label><input id="acPDesc" maxlength="300" value="${esc(p?.descricao || '')}" /></div></div>
      <div style="font-size:13px; font-weight:600; margin:14px 0 6px;">Permissões</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:4px 14px;">
        ${Object.entries(PERMISSOES).map(([el, c]) => `<label class="ac-opcao"><input type="checkbox" data-ac-perm="${c}" ${p?.permissoes?.[c] ? 'checked' : ''} ${c === 'pode_gerenciar_usuarios' && usuario?.perfil !== 'admin' ? 'disabled' : ''} /> ${esc(nomePermissao(el))}</label>`).join('')}</div>
      <div id="acPGrade">${htmlGrade('acp', p?.telas || {}, p?.acoes || [])}</div>
      <div id="acPErro" class="mensagem-erro" style="margin-top:10px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;"><button class="btn btn-secundario" id="acPVoltar" style="width:auto;">Voltar</button><button class="btn btn-primario" id="acPSalvar" style="width:auto;">Salvar perfil</button></div>`;
    ligarGrade($('acPGrade'), 'acp');
    corpo.querySelectorAll('[data-ac-perm]').forEach((c) => { if (['pode_emitir_cte', 'pode_ver_financeiro', 'pode_ver_auditoria', 'pode_ver_relatorios', 'pode_ver_sinistros'].includes(c.dataset.acPerm)) c.closest('label').classList.add('oculto'); });
    $('acPVoltar').addEventListener('click', listaPerfis);
    $('acPSalvar').addEventListener('click', async () => {
      const corpoReq = {
        nome: $('acPNome').value.trim(), descricao: $('acPDesc').value.trim(),
        permissoes: Object.fromEntries([...document.querySelectorAll('[data-ac-perm]')].map((c) => [c.dataset.acPerm, c.checked])),
        modulos_bloqueados: [],
        ...(() => { const g = lerGrade($('acPGrade'), 'acp'); return { telas: g.telas, acoes: g.acoes }; })(),
      };
      const r = await apiFetch(p ? `/api/perfis-acesso/${p.id}` : '/api/perfis-acesso', { method: p ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoReq) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { $('acPErro').textContent = j.erro || 'Erro ao salvar.'; $('acPErro').classList.add('visivel'); return; }
      if (p && j.usuarios_atualizados) mostrarAlerta(`Perfil salvo: ${j.usuarios_atualizados} usuário(s) atualizado(s).`, { tipo: 'sucesso' });
      await carregarListas(); listaPerfis();
      if (typeof carregarUsuarios === 'function') carregarUsuarios();
    });
  }

  // A lista de usuários já pode mostrar perfil, módulos e filiais.
  if (usuario?.perfil === 'admin' || usuario?.pode_gerenciar_usuarios) carregarListas().catch(() => {});
  return { preencherFormulario, valoresDoFormulario, resumo, paginasBloqueadas, MODULOS, destinoBloqueado, nivel, esconderChavesDaGrade };
})();
