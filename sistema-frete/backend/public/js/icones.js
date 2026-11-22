// =====================================================================
// Ícones de linha (traço, no estilo do Lucide — licença ISC) no lugar dos emojis do menu e dos títulos das telas,
// e a trilha no topo de cada tela ("Finanças › Financeiro › Contas a receber").
//  - Icones.svg(nome): o <svg> do ícone (cor do texto). O menu (js/menuRecolher.js) usa nos grupos e itens do alto.
//  - Títulos das telas: o emoji do começo sai e entra o ícone do grupo do menu de onde a tela foi aberta.
//  - Abas (.cte-aba): o emoji do começo sai (texto mais limpo).
// =====================================================================
(() => {
  const P = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12M6 14h12"/><rect width="12" height="12" x="6" y="10"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11"/>',
    calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8M16 14v4M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    idcard: '<rect width="20" height="14" x="2" y="5" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M14 10h4M14 14h4M5 17c.5-1.5 1.7-2 3-2s2.5.5 3 2"/>',
    sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  };
  // Grupos do menu e itens do alto → ícone.
  const MAPA = {
    operacao: 'truck', fretes: 'package', patio: 'warehouse', auditoria: 'scale', clientes: 'users', financeiro: 'wallet', faturamento: 'receipt',
    fiscal: 'calculator', frota: 'wrench', transportadoras: 'trophy', paineis: 'chart', cadastros: 'idcard', config: 'sliders',
    hoje: 'home', inicio: 'home', 'visao-geral': 'inbox', mensagens: 'mail', agenda: 'calendar', buscar: 'search',
  };
  const svg = (nome, tam = 18) => {
    const d = P[MAPA[nome] || nome];
    return d ? `<svg class="ic" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>` : '';
  };
  const EMOJI = /^\s*(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:️|‍|\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*/u;
  window.Icones = { svg, tem: (nome) => !!(nome && (P[MAPA[nome]] || P[nome])), semEmoji: (t) => String(t || '').replace(EMOJI, '') };

  // Tira o emoji do começo do primeiro texto de um elemento (sem mexer no resto).
  function tirarEmoji(el) {
    const no = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (no && EMOJI.test(no.textContent)) no.textContent = no.textContent.replace(EMOJI, '');
  }
  // Grupo do menu da tela aberta: o do item marcado; senão o primeiro item que abre a página.
  function grupoDa(pagina) {
    const ativo = document.querySelector('.barra-lateral .nav-tsub.ativo');
    const el = ativo && ativo.dataset.ir === pagina ? ativo : document.querySelector(`.barra-lateral .nav-tsub[data-ir="${pagina}"]`);
    return { item: el, grupo: el?.closest('.nav-sub')?.dataset.grupo || null };
  }
  const rotulo = (el) => (el ? (el.querySelector('.nav-rotulo, .nav-txt')?.textContent || el.textContent).replace(/[▸▾]/g, '').replace(/\s*\d{3}\s*$/, '').replace(EMOJI, '').trim() : '');

  // Título de cada tela: ícone do grupo no lugar do emoji.
  function decorarTitulo(secao) {
    const h2 = secao?.querySelector(':scope > .cabecalho-pagina h2');
    if (!h2) return;
    tirarEmoji(h2);
    const pagina = secao.id.slice(7);
    const { grupo } = grupoDa(pagina);
    const chave = grupo || pagina;
    let ic = h2.querySelector(':scope > .titulo-ic');
    if (!Icones.tem(chave)) { ic?.remove(); return; }
    if (!ic) { ic = document.createElement('span'); ic.className = 'titulo-ic'; h2.prepend(ic); }
    if (ic.dataset.chave !== chave) { ic.innerHTML = svg(chave, 20); ic.dataset.chave = chave; }
  }
  // Trilha no topo: Bloco › Grupo › Tela.
  function trilha() {
    const main = document.querySelector('main.conteudo'); if (!main) return;
    let t = document.getElementById('trilhaTopo');
    if (!t) { t = document.createElement('nav'); t.id = 'trilhaTopo'; t.className = 'trilha-topo'; t.setAttribute('aria-label', 'Onde você está'); main.prepend(t); }
    const secao = document.querySelector('main > section[id^="pagina-"]:not(.oculto)');
    if (!secao) { t.innerHTML = ''; return; }
    const pagina = secao.id.slice(7);
    const { item, grupo } = grupoDa(pagina);
    const partes = [];
    if (grupo) {
      const cab = document.querySelector(`.barra-lateral .nav-grupo[data-grupo="${grupo}"]`);
      let b = cab?.previousElementSibling; while (b && !b.classList.contains('nav-bloco')) b = b.previousElementSibling;
      if (b) partes.push(b.textContent.trim());
      partes.push(rotulo(cab));
      partes.push(rotulo(item));
    } else {
      const it = document.querySelector(`.barra-lateral .nav-item[data-pagina="${pagina}"], .barra-lateral .nav-tsub.nav-inicio[data-ir="${pagina}"]`);
      partes.push('Início', rotulo(it) || secao.querySelector('.cabecalho-pagina h2')?.textContent.trim() || '');
    }
    const ps = partes.filter(Boolean);
    t.innerHTML = ps.map((x, i) => `<span${i === ps.length - 1 ? ' class="atual"' : ''}>${x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</span>`).join('<span class="sep">›</span>');
  }
  // Emojis dos botões e dos cartões que têm um ícone de linha equivalente (os outros ficam como estão).
  const POR_EMOJI = { '⬇': 'download', '📥': 'download', '📤': 'upload', '🖨': 'printer', '📄': 'file', '🧾': 'receipt', '📊': 'chart', '📈': 'trend', '🔎': 'search', '🔍': 'search',
    '✏': 'pencil', '🗑': 'trash', '📋': 'clipboard', '⚙': 'sliders', '⟳': 'refresh', '🔄': 'refresh', '📷': 'camera', '📺': 'monitor', '✅': 'check', '✔': 'check', '✖': 'x',
    '↗': 'external', '🔗': 'link', '💬': 'message', '🏷': 'tag', '📅': 'calendar', '📦': 'package', '💵': 'wallet', '🚨': 'alert', '⏰': 'clock', '➕': 'plus', '⛶': 'expand', '📧': 'mail', '✉': 'mail', '📨': 'send', '🗜': 'archive', '🗂': 'archive' };
  const INICIO = new RegExp(`^\\s*(${Object.keys(POR_EMOJI).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\uFE0F?\\s*`, 'u');
  function iconizar(el, tam) {
    // Vale toda vez que o texto do botão muda (as telas trocam o texto de alguns botões depois).
    if (el.firstElementChild?.classList.contains('btn-ic') && el.firstChild === el.firstElementChild) return;
    const no = [...el.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim());
    const m = no && INICIO.exec(no.textContent);
    if (!m) return;
    no.textContent = no.textContent.slice(m[0].length);
    const s = document.createElement('span'); s.className = 'btn-ic'; s.innerHTML = svg(POR_EMOJI[m[1]], tam);
    el.insertBefore(s, no);
  }
  function iconizarTudo(raiz = document) {
    raiz.querySelectorAll?.('main .btn, main button.btn-secundario, .modal-overlay .btn').forEach((b) => iconizar(b, 15));
    raiz.querySelectorAll?.('.kpi-header > span:last-child').forEach((s) => { if (!s.dataset.icOk && POR_EMOJI[s.textContent.trim().replace(/\uFE0F/g, '')]) { s.innerHTML = svg(POR_EMOJI[s.textContent.trim().replace(/\uFE0F/g, '')], 18); s.classList.add('kpi-ic'); } s.dataset.icOk = '1'; });
  }
  let agenda = null;
  new MutationObserver(() => { clearTimeout(agenda); agenda = setTimeout(() => iconizarTudo(), 60); }).observe(document.body, { childList: true, subtree: true });

  function atualizar() {
    iconizarTudo();
    document.querySelectorAll('.cte-aba').forEach(tirarEmoji);
    const secao = document.querySelector('main > section[id^="pagina-"]:not(.oculto)');
    decorarTitulo(secao);
    trilha();
  }
  // O item "Início" do embarcador (texto trocado pelo menu): ícone na frente.
  window.Icones.decorarInicio = () => {
    const el = document.getElementById('navInicioEmb'); if (!el) return;
    const rot = el.querySelector('.nav-rotulo'); if (!rot) return;
    rot.textContent = Icones.semEmoji(rot.textContent);
    const chave = /Fretes contratados/.test(rot.textContent) ? 'visao-geral' : 'inicio';
    let ic = el.querySelector(':scope > .nav-ic'); if (!ic) { ic = document.createElement('span'); ic.className = 'nav-ic nav-ic-svg'; el.prepend(ic); }
    if (ic.dataset.chave !== chave) { ic.innerHTML = svg(chave); ic.dataset.chave = chave; }
  };
  document.addEventListener('tela-mudou', () => setTimeout(atualizar, 0));
  window.addEventListener('DOMContentLoaded', () => { setTimeout(atualizar, 0); window.Icones.decorarInicio(); });
  window.Icones.atualizar = atualizar;
})();
