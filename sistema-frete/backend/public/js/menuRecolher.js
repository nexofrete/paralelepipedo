// =====================================================================
// Menu lateral recolhível: a seta na borda do menu deixa só os ícones (mais
// espaço para a tela) e abre de novo. Recolhido, passar o mouse abre o menu
// por cima do conteúdo, sem empurrar a tela. A escolha fica lembrada neste
// navegador (tema.js aplica antes de desenhar, para não "piscar").
// No celular (até 800px) vale a gaveta de sempre.
// =====================================================================
(() => {
  const barra = document.querySelector('.barra-lateral');
  if (!barra) return;
  const raiz = document.documentElement;

  // Separa o ícone (emoji do começo) do texto de cada item, para o modo recolhido mostrar só o ícone.
  const EMOJI = /^\s*((?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:️|‍|\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*([\s\S]*)$/u;
  function separar(el) {
    if (el.dataset.separado) return;
    // O texto pode estar direto no item ou num <span> simples (Mensagens, Agenda, "Ir para").
    const primeiro = [...el.childNodes].find((n) => (n.nodeType === 3 ? n.textContent.trim() : n.nodeType === 1));
    if (!primeiro) return;
    let no = primeiro;
    if (primeiro.nodeType === 1) {
      if (primeiro.tagName !== 'SPAN' || primeiro.className || primeiro.id || primeiro.children.length) return;
      no = primeiro.firstChild;
      if (!no || no.nodeType !== 3) return;
    }
    const m = EMOJI.exec(no.textContent);
    const ic = document.createElement('span'); ic.className = 'nav-ic';
    const tx = document.createElement('span'); tx.className = 'nav-txt';
    if (m) { ic.textContent = m[1]; tx.textContent = m[2]; } else { ic.textContent = no.textContent.trim().slice(0, 1).toUpperCase(); tx.textContent = no.textContent.trim(); ic.classList.add('nav-ic-letra'); }
    no.replaceWith(ic, tx);
    el.dataset.separado = '1';
    // Recolhido, o nome aparece ao parar o mouse em cima do ícone.
    if (!el.title) el.title = tx.textContent.replace(/\s+\d{3}$/, '').trim();
  }
  const separarTodos = () => barra.querySelectorAll('.nav-item, .nav-grupo, .nav-tsub, .ir-botao').forEach(separar);
  separarTodos();
  // Itens que os outros scripts criam ou mostram depois (ex.: "Ir para", permissões).
  new MutationObserver(separarTodos).observe(barra, { childList: true, subtree: true });

  const botao = document.createElement('button');
  botao.type = 'button'; botao.id = 'btnRecolherMenu'; botao.className = 'btn-recolher-menu';
  // Dentro do menu: com o menu aberto pelo mouse, ir até a seta não fecha o menu.
  barra.appendChild(botao);
  const desenhar = () => {
    const rec = raiz.classList.contains('menu-recolhido');
    botao.innerHTML = rec ? '&#8250;' : '&#8249;';
    botao.title = rec ? 'Abrir o menu' : 'Recolher o menu (mais espaço para a tela)';
    botao.setAttribute('aria-label', botao.title);
    botao.setAttribute('aria-expanded', String(!rec));
  };
  botao.addEventListener('click', () => {
    const rec = raiz.classList.toggle('menu-recolhido');
    try { localStorage.setItem('menuRecolhido', rec ? '1' : '0'); } catch { /* sem armazenamento */ }
    desenhar();
    // Gráficos e mapas recalculam a largura.
    setTimeout(() => window.dispatchEvent(new Event('resize')), 230);
  });
  desenhar();
})();
