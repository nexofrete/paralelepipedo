// =====================================================================
// Navegação comum do menu e "famílias" de telas parecidas.
// Destino de uma tela, em texto:
//   "p:<página>"          → item de página (ex.: p:auditoria-frete)
//   "t:<página>:<aba>"    → página com a aba escolhida (ex.: t:emissao-cte:mdfe)
//   "r:<subaba>"          → uma das telas de Relatórios (ex.: r:cobIndevidas)
// Família: telas que tratam do mesmo assunto (antes ficavam espalhadas em menus diferentes).
// O menu mostra um item só para a família; no alto de cada tela dela aparece uma barra
// para trocar entre as outras. A pessoa só vê o que tem permissão de abrir.
// Usa do dashboard.js: SUBABAS_RELATORIO, mostrarSubabaRelatorio, irParaPagina.
// =====================================================================
window.Navegar = (() => {
  const ATRIBUTO_ABA = {
    'emissao-cte': 'data-cte-aba', ocorrencias: 'data-oc-aba', faturamento: 'data-fat-aba', 'painel-transporte': 'data-pt-aba', conferencia: 'data-bp-aba',
    filiais: 'data-fl-aba', pagar: 'data-cp-aba', frota: 'data-fv-aba', contabil: 'data-cbl-aba', bancos: 'data-bx-aba', comissoes: 'data-cm-aba', centros: 'data-ccu-aba',
    cadastros: 'data-subpagina', 'cadastros-basicos': 'data-cb-aba',
  };
  const FAMILIAS = {
    indicadores: { titulo: '📊 Painel de indicadores', membros: [
      ['t:painel-transporte:geral', '🚛 Operação própria (CT-e emitidos)'],
      ['r:indicadores', '🎯 Fretes contratados (KPIs)'],
      ['r:graficos', '📈 Gráficos'],
    ] },
    auditoria: { titulo: '⚖️ Auditoria de frete', membros: [
      ['p:auditoria-frete', '⚖️ Fretes auditados'],
      ['r:auditoriaFrete', '🔎 Conferência de CT-e'],
      ['r:cobIndevidas', '💸 Cobranças indevidas'],
    ] },
    nfecte: { titulo: '🔗 NF-e × CT-e', membros: [
      ['r:nfeCteInc', '🔗 Inconsistências e vínculos'],
      ['r:nfeCte', '📦 Notas e seus CT-e'],
    ] },
    transportadoras: { titulo: '🏆 Parceiros e transportadoras', membros: [
      ['t:parceiros:', '🤝 Parceiros e redespacho'],
      ['r:scorecard', '🏆 Scorecard das transportadoras'],
      ['r:melhorTransp', '🏷️ Melhor transportadora por destino'],
    ] },
  };

  const $ = (id) => document.getElementById(id);
  // SUBABAS_RELATORIO é const do dashboard.js (global, mas não fica em window).
  const subabas = () => (typeof SUBABAS_RELATORIO !== 'undefined' ? SUBABAS_RELATORIO : {});
  const partes = (dest) => {
    const [tipo, a = '', b = ''] = String(dest).split(':');
    if (tipo === 'r') return { tipo, pagina: 'relatorios', subaba: a };
    return { tipo, pagina: a, aba: b };
  };
  const itemDa = (pagina) => document.querySelector(`.barra-lateral .nav-item[data-pagina="${pagina}"]`);
  const aberto = (pagina) => !!$(`pagina-${pagina}`) && !$(`pagina-${pagina}`).classList.contains('oculto');

  // O usuário pode abrir? (item da página não escondido e da parte que a empresa usa)
  function acessivel(dest) {
    if (String(dest).startsWith('f:')) return membrosDe(dest.slice(2)).some(acessivel);
    const { pagina, subaba } = partes(dest);
    const item = itemDa(pagina);
    if (!item || item.classList.contains('oculto') || window.Modulos?.fora(item, { empresa: true })) return false;
    // Aba que a tela esconde deste usuário (ex.: Usuários sem a permissão de gerenciar).
    const { aba } = partes(dest);
    if (aba && ATRIBUTO_ABA[pagina]) { const el = document.querySelector(`[${ATRIBUTO_ABA[pagina]}="${aba}"]`); if (el && el.classList.contains('oculto')) return false; }
    return subaba ? !!subabas()[subaba] : true;
  }
  const membrosDe = (familia) => (FAMILIAS[familia]?.membros || []).map(([d]) => d);

  function ir(dest) {
    if (String(dest).startsWith('f:')) { const m = membrosDe(dest.slice(2)).find(acessivel); if (m) ir(m); return; }
    if (!acessivel(dest)) return;
    const { pagina, aba, subaba } = partes(dest);
    if (!aberto(pagina)) (typeof irParaPagina === 'function' ? irParaPagina(pagina) : itemDa(pagina)?.click());
    if (subaba) mostrarSubabaRelatorio(subaba);
    else if (aba && ATRIBUTO_ABA[pagina]) clicarAba(ATRIBUTO_ABA[pagina], aba);
    avisar();
  }
  // Algumas telas montam as abas depois de abrir (Cadastros básicos): espera a aba aparecer.
  function clicarAba(atributo, aba, tentativa = 0) {
    const el = document.querySelector(`[${atributo}="${aba}"]`);
    if (el) { el.click(); if (tentativa) avisar(); return; }
    if (tentativa < 40) setTimeout(() => clicarAba(atributo, aba, tentativa + 1), 100);
  }

  // A tela aberta agora é este destino?
  function ehAtual(dest) {
    if (String(dest).startsWith('f:')) return membrosDe(dest.slice(2)).some(ehAtual);
    const { pagina, aba, subaba } = partes(dest);
    if (!aberto(pagina)) return false;
    if (subaba) { const id = subabas()[subaba]; return !!id && !!$(id) && !$(id).classList.contains('oculto'); }
    if (aba && ATRIBUTO_ABA[pagina]) { const el = document.querySelector(`[${ATRIBUTO_ABA[pagina]}="${aba}"]`); return !el || el.classList.contains('ativo'); }
    return true;
  }
  const familiaAtual = () => Object.keys(FAMILIAS).find((f) => membrosDe(f).some(ehAtual)) || null;

  // ---------- Barra da família no alto da tela ----------
  const barras = new Map();   // página → elemento da barra
  function barraDa(pagina) {
    if (barras.has(pagina)) return barras.get(pagina);
    const sec = $(`pagina-${pagina}`);
    if (!sec) return null;
    const b = document.createElement('div');
    b.className = 'familia-barra oculto';
    b.setAttribute('role', 'tablist');
    b.addEventListener('click', (e) => { const t = e.target.closest('[data-fam-ir]'); if (t) ir(t.dataset.famIr); });
    sec.insertBefore(b, sec.firstChild);
    barras.set(pagina, b);
    return b;
  }
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function desenharBarras() {
    const fam = familiaAtual();
    const membros = fam ? FAMILIAS[fam].membros.filter(([d]) => acessivel(d)) : [];
    const pagAtual = fam ? partes(membros.find(([d]) => ehAtual(d))?.[0] || '').pagina : null;
    barras.forEach((b, p) => { if (p !== pagAtual) b.classList.add('oculto'); });
    if (!fam || membros.length < 2 || !pagAtual) return;
    const b = barraDa(pagAtual);
    if (!b) return;
    b.innerHTML = `<span class="familia-titulo">${esc(FAMILIAS[fam].titulo)}</span>${membros.map(([d, r]) => {
      const sim = ehAtual(d);
      return `<button type="button" role="tab" aria-selected="${sim}" class="familia-aba${sim ? ' ativo' : ''}" data-fam-ir="${esc(d)}">${esc(r)}</button>`;
    }).join('')}`;
    b.classList.remove('oculto');
  }

  // ---------- Aviso de "a tela mudou" (menu, atalhos, notificações) ----------
  let pendente = false;
  function avisar() {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => { pendente = false; desenharBarras(); document.dispatchEvent(new CustomEvent('tela-mudou')); });
  }
  function vigiar() {
    const obs = new MutationObserver(avisar);
    const alvos = [...document.querySelectorAll('main > section[id^="pagina-"]')];
    Object.values(subabas()).forEach((id) => { if ($(id)) alvos.push($(id)); });
    Object.values(ATRIBUTO_ABA).forEach((a) => document.querySelectorAll(`[${a}]`).forEach((el) => alvos.push(el)));
    alvos.forEach((el) => obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
    avisar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vigiar); else vigiar();

  return { ir, acessivel, ehAtual, familiaAtual, membrosDe, partes, FAMILIAS, ATRIBUTO_ABA, avisar };
})();
