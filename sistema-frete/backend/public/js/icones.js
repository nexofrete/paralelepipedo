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
    cloud: '<path d="M12 13v8l-4-4M12 21l4-4"/><path d="M4.39 15.39A5 5 0 0 1 7 6.1 7 7 0 0 1 20 10a4.5 4.5 0 0 1 .5 8.97"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    pin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    map: '<path d="M14.11 5.53a2 2 0 0 0 1.78 0l3.66-1.83A1 1 0 0 1 21 4.6v12.78a1 1 0 0 1-.55.9l-4.56 2.27a2 2 0 0 1-1.78 0l-4.22-2.11a2 2 0 0 0-1.78 0l-3.66 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9l4.56-2.27a2 2 0 0 1 1.78 0z"/><path d="M15 5.76v15M9 3.24v15"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
    key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    rows: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  };
  // Grupos do menu e itens do alto → ícone.
  const MAPA = {
    operacao: 'truck', fretes: 'package', patio: 'warehouse', auditoria: 'scale', clientes: 'users', financeiro: 'wallet', faturamento: 'receipt',
    fiscal: 'calculator', frota: 'wrench', transportadoras: 'trophy', planejamento: 'target', paineis: 'chart', cadastros: 'idcard', config: 'sliders',
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
    '↗': 'external', '🔗': 'link', '💬': 'message', '🏷': 'tag', '📅': 'calendar', '📦': 'package', '💵': 'wallet', '🚨': 'alert', '⏰': 'clock', '➕': 'plus', '⛶': 'expand', '📧': 'mail', '✉': 'mail', '📨': 'send', '🗜': 'archive', '🗂': 'archive',
    '📡': 'cloud', '🛡': 'shield', '🕘': 'clock', '🕒': 'clock', '⏱': 'clock', '💾': 'save', '👁': 'eye', '👤': 'user', '👥': 'users', '📌': 'pin', '📍': 'pin',
    '🔒': 'lock', '🔐': 'lock', '📱': 'phone', '🗺': 'map', '⚡': 'zap', '📁': 'folder', '📂': 'folder', '🌐': 'globe', '🔑': 'key', '🔌': 'plug', '🧮': 'calculator',
    '⚖': 'scale', '💸': 'wallet', '💰': 'wallet', '🚚': 'truck', '🚛': 'truck', '🔶': 'alert', '⚠': 'alert', '⬆': 'upload', '🎫': 'tag', '🎯': 'target', '🏆': 'trophy',
    '🏠': 'home', '🔁': 'refresh', '🤝': 'users', '🧩': 'idcard', '🧾': 'receipt', '📑': 'file' };
  const INICIO = new RegExp(`^\\s*(${Object.keys(POR_EMOJI).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\uFE0F?\\s*`, 'u');
  function iconizar(el, tam) {
    // Vale toda vez que o texto do botão muda (as telas trocam o texto de alguns botões depois).
    if (el.querySelector('.btn-ic')) return;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let no = w.nextNode(); while (no && !no.textContent.trim()) no = w.nextNode();
    if (!no) return;
    const m = INICIO.exec(no.textContent);
    if (m) {
      no.textContent = no.textContent.slice(m[0].length);
      const s = document.createElement('span'); s.className = 'btn-ic'; s.innerHTML = svg(POR_EMOJI[m[1]], tam);
      no.parentNode.insertBefore(s, no);
      return;
    }
    // Emoji sem ícone equivalente: sai, se o botão tiver texto além dele.
    const e = EMOJI.exec(no.textContent);
    if (e && no.textContent.slice(e[0].length).trim()) no.textContent = no.textContent.slice(e[0].length);
  }
  function iconizarTudo(raiz = document) {
    raiz.querySelectorAll?.('main .btn, main button.btn-secundario, .modal-overlay .btn').forEach((b) => iconizar(b, 15));
    // Ícones dos cartões de resumo: emoji → ícone de linha num quadradinho.
    raiz.querySelectorAll?.('.kpi-header > span:last-child, .vg-fat-kpi-ic, .vg-etapa-topo > span, .dropzone .icone, .search-box > span').forEach((s) => {
      if (s.querySelector('.ic')) return;
      const k = s.textContent.trim().replace(/\uFE0F/g, '');
      if (POR_EMOJI[k]) { s.innerHTML = svg(POR_EMOJI[k], 18); s.classList.add('kpi-ic'); }
    });
    // Títulos de seção, colunas e barras: só o texto.
    raiz.querySelectorAll?.('main h2, main h3, main h4, main .vg-titulo, main .vg-fat-sub, main .kanban-coluna-titulo, main summary, main .cr-titulo, main .campo > label, .familia-titulo, .familia-aba, .modal-overlay h3, .modal-overlay h4')
      .forEach(tirarEmoji);
    rodape();
  }
  // Rodapé do menu: Tema, Modo compacto, Minha segurança, Sobre e Sair numa barra de ícones (o nome aparece ao parar o mouse).
  function rodape() {
    const sair = document.getElementById('btnSair'); if (!sair) return;
    const caixa = sair.parentElement; caixa.classList.add('rodape-menu');
    const botoes = [['btnAlternarTema', null], ['irCompacto', 'rows'], ['btnMinhaSeguranca', 'lock'], ['btnSobre', 'info'], ['btnSair', 'logout']];
    for (const [id, ic] of botoes) {
      const b = document.getElementById(id); if (!b) continue;
      b.classList.add('rodape-btn');
      if (!b.title) b.title = b.textContent.trim();
      let s = b.querySelector(':scope > .rodape-ic');
      if (!s) { s = document.createElement('span'); s.className = 'rodape-ic'; b.prepend(s); }
      const nome = id === 'btnAlternarTema' ? (/claro/i.test(document.getElementById('textoTema')?.textContent || '') ? 'sun' : 'moon') : ic;
      if (s.dataset.ic !== nome) { s.innerHTML = svg(nome, 18); s.dataset.ic = nome; }
      const rot = id === 'btnAlternarTema' ? document.getElementById('textoTema')?.textContent : b.querySelector('span:not(.rodape-ic):not(.nav-badge):not(#iconeTema):last-of-type')?.textContent || b.textContent;
      if (rot && rot.trim()) b.setAttribute('aria-label', rot.trim());
      if (id !== 'btnSair' && rot) b.title = rot.trim();
    }
    if (sair.parentElement.lastElementChild !== document.getElementById('versaoSistema')) { /* ordem original mantida */ }
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
