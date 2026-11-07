// =====================================================================
// Menu único, por área (Operação, Transportadoras, Documentos, Auditoria,
// Financeiro, Frota, Gestão, Clientes, Configuração), com os mesmos números do "Ir para".
// Cada grupo abre/fecha; o grupo da tela aberta fica sempre aberto e os que a
// pessoa abriu à mão continuam abertos (lembrado neste navegador).
// Subitens ".nav-tsub":
//   data-ir="<página>" [data-aba]  → abre a página (o item escondido guarda a permissão) e a aba
//   data-subaba="<nome>"           → uma tela de Relatórios
//   data-familia="<nome>"          → telas parecidas juntas (js/familias.js); abre a primeira que o usuário pode
// =====================================================================
(() => {
  const grupos = [...document.querySelectorAll('.barra-lateral .nav-grupo[data-grupo]')].map((cab) => ({
    chave: cab.dataset.grupo, cab, sub: document.querySelector(`.barra-lateral .nav-sub[data-grupo="${cab.dataset.grupo}"]`),
  })).filter((g) => g.sub);
  // Celular: botão ☰ abre/fecha o menu; escolher uma tela fecha.
  const marca = document.querySelector('.barra-lateral .marca');
  if (marca && !document.getElementById('btnMenuCelular')) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'btnMenuCelular'; b.className = 'btn-menu-celular'; b.textContent = '☰ Menu';
    b.addEventListener('click', () => { const ab = document.body.classList.toggle('menu-aberto'); b.textContent = ab ? '✕ Fechar' : '☰ Menu'; });
    marca.insertBefore(b, marca.lastElementChild);
    document.querySelector('.barra-lateral').addEventListener('click', (e) => {
      if (e.target.closest('.nav-tsub, .nav-item')) { document.body.classList.remove('menu-aberto'); b.textContent = '☰ Menu'; }
    });
  }
  const N = window.Navegar;
  if (!grupos.length || !N) return;
  const ehAdmin = usuario?.perfil === 'admin';
  // Destino do subitem, no formato do js/familias.js.
  const destino = (el) => {
    if (el.dataset.familia) return `f:${el.dataset.familia}`;
    if (el.dataset.subaba) return `r:${el.dataset.subaba}`;
    return el.dataset.aba ? `t:${el.dataset.ir}:${el.dataset.aba}` : `p:${el.dataset.ir}`;
  };
  const tsubs = [...document.querySelectorAll('.barra-lateral .nav-tsub')];
  tsubs.forEach((el) => { el.dataset.destino = destino(el); });

  // Só aparece o que o usuário pode abrir.
  const navHoje = document.getElementById('navHoje');
  const inicioEmb = document.getElementById('navInicioEmb');
  const temHoje = () => !!navHoje && !navHoje.classList.contains('oculto') && !window.Modulos?.fora(navHoje);
  const visivel = (el) => !el.classList.contains('oculto') && !window.Modulos?.fora(el);
  const itensDo = (g) => [...g.sub.querySelectorAll('.nav-tsub, .nav-item')];
  function atualizarVisiveis() {
    tsubs.forEach((el) => el.classList.toggle('oculto', !N.acessivel(el.dataset.destino) || (!!el.dataset.soAdmin && !ehAdmin)));
    // Com a tela Hoje (transportadora), a visão geral do embarcador vira um item comum, logo abaixo.
    const rot = inicioEmb?.querySelector('.nav-rotulo');
    if (rot) rot.textContent = temHoje() ? '📥 Fretes contratados (visão geral)' : '🏠 Início';
    grupos.forEach((g) => { g.cab.classList.toggle('oculto', !itensDo(g).some(visivel)); });
  }
  atualizarVisiveis();
  // As permissões de algumas telas chegam depois (Cadastros, Manutenção, módulos da empresa...).
  let agendado = null;
  const reagendar = () => { clearTimeout(agendado); agendado = setTimeout(() => { atualizarVisiveis(); desenhar(); }, 30); };
  const vigiaItens = new MutationObserver(reagendar);
  document.querySelectorAll('.barra-lateral .nav-item[data-pagina]').forEach((el) => vigiaItens.observe(el, { attributes: true, attributeFilter: ['class'] }));

  // Abertos à mão (lembrados); o grupo da tela atual abre sozinho.
  const CHAVE = 'menuGruposAbertos';
  let abertos;
  try { abertos = new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]')); } catch { abertos = new Set(); }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify([...abertos])); } catch { /* sem armazenamento */ } };
  let grupoAtual = null;
  function desenhar() {
    const visiveis = grupos.filter((x) => visivel(x.cab)).length;
    grupos.forEach((g) => {
      const aberto = abertos.has(g.chave) || g.chave === grupoAtual || visiveis === 1;
      g.sub.classList.toggle('oculto', !aberto);
      g.cab.classList.toggle('aberto', aberto);
      g.cab.classList.toggle('contem-ativo', g.chave === grupoAtual);
      const seta = g.cab.querySelector('.nav-seta'); if (seta) seta.textContent = aberto ? '▾' : '▸';
    });
  }
  grupos.forEach((g) => g.cab.addEventListener('click', () => {
    const aberto = !g.sub.classList.contains('oculto');
    if (aberto) { abertos.delete(g.chave); if (g.chave === grupoAtual) grupoAtual = null; } else abertos.add(g.chave);
    salvar(); desenhar();
  }));

  const marcar = (el) => {
    tsubs.forEach((x) => x.classList.toggle('ativo', x === el));
    const g = el ? grupos.find((x) => x.sub.contains(el)) : null;
    grupoAtual = g ? g.chave : null;
    desenhar();
  };
  tsubs.forEach((el) => el.addEventListener('click', () => {
    if (el.classList.contains('oculto')) return;
    N.ir(el.dataset.destino);
    marcar(el);
  }));

  // Mudou a tela (menu, atalho, notificação, aba dentro da tela): acende o item dela e abre o grupo.
  function acompanhar() {
    const atual = tsubs.find((x) => x.classList.contains('ativo'));
    if (atual && visivel(atual) && N.ehAtual(atual.dataset.destino)) { desenhar(); return; }
    // Primeiro o que bate exato (página + aba); depois só a página (aba que não está no menu).
    let tsub = tsubs.find((x) => visivel(x) && N.ehAtual(x.dataset.destino));
    if (!tsub) {
      const aberta = document.querySelector('main > section[id^="pagina-"]:not(.oculto)')?.id.slice(7);
      // Página que é item direto dentro de um grupo (Cadastros, Manutenção...) vem antes de um subitem de outra aba dela.
      const item = aberta && document.querySelector(`.barra-lateral .nav-sub .nav-item[data-pagina="${aberta}"]`);
      tsub = !item && aberta && aberta !== 'relatorios' ? tsubs.find((x) => visivel(x) && x.dataset.ir === aberta) : null;
      if (!tsub) {
        tsubs.forEach((x) => x.classList.remove('ativo'));
        const g = item ? grupos.find((x) => x.sub.contains(item)) : null;
        grupoAtual = g ? g.chave : null;
        desenhar();
        return;
      }
    }
    marcar(tsub);
  }
  document.addEventListener('tela-mudou', acompanhar);
  acompanhar();
  // Módulos da empresa trocados (Cadastros » Empresa): refaz o menu na hora.
  document.addEventListener('modulos-mudou', () => { atualizarVisiveis(); acompanhar(); });
})();
