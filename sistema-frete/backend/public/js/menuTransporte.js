// =====================================================================
// Menu por área (Operação, Financeiro, Frota, Gestão, Notas e fretes
// contratados, Configuração), com os mesmos números do "Ir para".
// Cada grupo abre/fecha; o grupo da tela aberta fica sempre aberto e os que a
// pessoa abriu à mão continuam abertos (lembrado neste navegador).
// Os subitens ".nav-tsub" abrem a página de sempre (o item escondido do menu,
// que guarda a permissão) e já escolhem a aba certa dela.
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
      if (e.target.closest('.nav-tsub, .nav-item:not([data-pagina="relatorios"]), .nav-subitem')) { document.body.classList.remove('menu-aberto'); b.textContent = '☰ Menu'; }
    });
  }
  if (!grupos.length) return;
  const ehAdmin = usuario?.perfil === 'admin';
  const paginaDo = (el) => document.querySelector(`.nav-item[data-pagina="${el.dataset.ir}"]`);
  // Atributo das abas de cada tela.
  const ATRIBUTO_ABA = {
    'emissao-cte': 'data-cte-aba', ocorrencias: 'data-oc-aba', faturamento: 'data-fat-aba', 'painel-transporte': 'data-pt-aba', conferencia: 'data-bp-aba',
    filiais: 'data-fl-aba', pagar: 'data-cp-aba', frota: 'data-fv-aba', contabil: 'data-cbl-aba', bancos: 'data-bx-aba',
  };
  const DATASET = Object.fromEntries(Object.entries(ATRIBUTO_ABA).map(([p, a]) => [p, a.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())]));   // data-cte-aba → cteAba
  const tsubs = [...document.querySelectorAll('.barra-lateral .nav-tsub')];

  // Só aparece o que o usuário pode abrir (os scripts de cada tela já tiraram o "oculto" do item da página).
  tsubs.forEach((el) => el.classList.toggle('oculto', !paginaDo(el) || paginaDo(el).classList.contains('oculto') || (!!el.dataset.soAdmin && !ehAdmin)));
  const itensDo = (g) => [...g.sub.querySelectorAll('.nav-tsub, .nav-item')];
  const visivel = (el) => !el.classList.contains('oculto');
  const atualizarVisiveis = () => grupos.forEach((g) => { g.cab.classList.toggle('oculto', !itensDo(g).some(visivel)); });
  atualizarVisiveis();
  // Itens de página dentro dos grupos (Cadastros, Manutenção...) aparecem depois, quando o dashboard confere a permissão.
  const vigiaItens = new MutationObserver(atualizarVisiveis);
  grupos.forEach((g) => g.sub.querySelectorAll('.nav-item').forEach((el) => vigiaItens.observe(el, { attributes: true, attributeFilter: ['class'] })));

  // Abertos à mão (lembrados); o grupo da tela atual abre sozinho.
  const CHAVE = 'menuGruposAbertos';
  let abertos;
  try { abertos = new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]')); } catch { abertos = new Set(); }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify([...abertos])); } catch { /* sem armazenamento */ } };
  let grupoAtual = null;
  const desenhar = () => grupos.forEach((g) => {
    const aberto = abertos.has(g.chave) || g.chave === grupoAtual || grupos.filter((x) => visivel(x.cab)).length === 1;
    g.sub.classList.toggle('oculto', !aberto);
    g.cab.classList.toggle('aberto', aberto);
    g.cab.classList.toggle('contem-ativo', g.chave === grupoAtual);
    const seta = g.cab.querySelector('.nav-seta'); if (seta) seta.textContent = aberto ? '▾' : '▸';
  });
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
    const pagina = paginaDo(el);
    if (!pagina || pagina.classList.contains('oculto')) return;
    const naPagina = !document.getElementById(`pagina-${el.dataset.ir}`)?.classList.contains('oculto');
    if (!naPagina) pagina.click();
    if (el.dataset.aba) document.querySelector(`[${ATRIBUTO_ABA[el.dataset.ir]}="${el.dataset.aba}"]`)?.click();
    marcar(el);
  }));

  // As abas dentro das telas também acendem o subitem certo.
  const seletorAbas = Object.values(ATRIBUTO_ABA).map((a) => `[${a}]`).join(', ');
  document.querySelectorAll(seletorAbas).forEach((aba) => aba.addEventListener('click', () => {
    const ir = Object.keys(DATASET).find((p) => aba.dataset[DATASET[p]] != null);
    const el = tsubs.find((x) => x.dataset.ir === ir && x.dataset.aba === aba.dataset[DATASET[ir]]);
    if (el) marcar(el);
  }));

  // Mudou a tela (menu, atalho, notificação): acende o item dela e abre o grupo.
  const secoes = [...document.querySelectorAll('main > section[id^="pagina-"]')];
  const observar = new MutationObserver(() => {
    const aberta = secoes.find((s) => !s.classList.contains('oculto'))?.id.slice(7);
    if (!aberta) return;
    const atual = tsubs.find((x) => x.classList.contains('ativo'));
    if (atual && atual.dataset.ir === aberta) return;
    const tsub = tsubs.find((x) => x.dataset.ir === aberta && visivel(x));
    if (tsub) { marcar(tsub); return; }
    // Página que é item direto dentro de um grupo (ex.: Visão geral, Cadastros).
    tsubs.forEach((x) => x.classList.remove('ativo'));
    const item = document.querySelector(`.barra-lateral .nav-sub .nav-item[data-pagina="${aberta}"]`);
    const g = item ? grupos.find((x) => x.sub.contains(item)) : null;
    grupoAtual = g ? g.chave : null;
    desenhar();
  });
  secoes.forEach((s) => observar.observe(s, { attributes: true, attributeFilter: ['class'] }));
  observar.takeRecords(); // estado inicial:
  const inicial = secoes.find((s) => !s.classList.contains('oculto'))?.id.slice(7);
  const itemIni = inicial && document.querySelector(`.barra-lateral .nav-sub .nav-item[data-pagina="${inicial}"]`);
  grupoAtual = itemIni ? grupos.find((x) => x.sub.contains(itemIni))?.chave || null : null;
  desenhar();
})();
