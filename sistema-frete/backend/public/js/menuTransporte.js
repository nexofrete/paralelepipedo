// =====================================================================
// Menu "Operação de Transporte": junta cotações, coletas, CT-e, MDF-e, ocorrências, romaneios,
// EDI, veículos/motoristas e configuração fiscal num item com submenus.
// Cada subitem abre a página de sempre (o item escondido do menu, que guarda
// a permissão) e já escolhe a aba certa dela.
// =====================================================================
(() => {
  const grupo = document.getElementById('navGrupoTransporte');
  const sub = document.getElementById('navSubTransporte');
  const seta = document.getElementById('navTranspSeta');
  if (!grupo || !sub) return;
  const itens = [...sub.querySelectorAll('.nav-tsub')];
  const paginaDo = (el) => document.querySelector(`.nav-item[data-pagina="${el.dataset.ir}"]`);
  const ehAdmin = usuario?.perfil === 'admin';
  // Atributo das abas de cada tela.
  const ATRIBUTO_ABA = { 'emissao-cte': 'data-cte-aba', ocorrencias: 'data-oc-aba', faturamento: 'data-fat-aba', 'painel-transporte': 'data-pt-aba', conferencia: 'data-bp-aba', filiais: 'data-fl-aba', pagar: 'data-cp-aba' };
  const PAGINAS = Object.keys(ATRIBUTO_ABA).concat('edi', 'coletas', 'cotacoes');

  // Só aparece o que o usuário pode abrir (os scripts de cada tela já tiraram o "oculto" do item da página).
  itens.forEach((el) => el.classList.toggle('oculto', !paginaDo(el) || paginaDo(el).classList.contains('oculto') || (!!el.dataset.soAdmin && !ehAdmin)));
  const visiveis = itens.filter((el) => !el.classList.contains('oculto'));
  if (!visiveis.length) return;
  grupo.classList.remove('oculto');

  const abrirSub = (abrir) => { sub.classList.toggle('oculto', !abrir); seta.textContent = abrir ? '▾' : '▸'; };
  const marcar = (el) => {
    itens.forEach((x) => x.classList.toggle('ativo', x === el));
    grupo.classList.toggle('ativo', !!el);
  };

  grupo.addEventListener('click', () => {
    const aberto = !sub.classList.contains('oculto');
    if (aberto) return abrirSub(false);
    abrirSub(true);
    // Fora das telas de transporte: abre a primeira (CT-e).
    if (!grupo.classList.contains('ativo')) visiveis[0].click();
    return null;
  });

  itens.forEach((el) => el.addEventListener('click', () => {
    const pagina = paginaDo(el);
    if (!pagina || pagina.classList.contains('oculto')) return;
    const naPagina = !document.getElementById(`pagina-${el.dataset.ir}`)?.classList.contains('oculto');
    if (!naPagina) pagina.click();
    if (el.dataset.aba) {
      const aba = document.querySelector(`[${ATRIBUTO_ABA[el.dataset.ir]}="${el.dataset.aba}"]`);
      aba?.click();
    }
    abrirSub(true);
    marcar(el);
  }));

  // As abas dentro das telas também acendem o subitem certo.
  document.querySelectorAll('.cte-aba[data-cte-aba], [data-oc-aba], [data-fat-aba], [data-pt-aba], [data-bp-aba], [data-fl-aba], [data-cp-aba]').forEach((aba) => aba.addEventListener('click', () => {
    const ir = aba.dataset.ocAba ? 'ocorrencias' : aba.dataset.fatAba ? 'faturamento' : aba.dataset.ptAba ? 'painel-transporte' : aba.dataset.bpAba ? 'conferencia' : aba.dataset.flAba ? 'filiais' : aba.dataset.cpAba ? 'pagar' : 'emissao-cte';
    const nome = aba.dataset.ocAba || aba.dataset.fatAba || aba.dataset.ptAba || aba.dataset.bpAba || aba.dataset.flAba || aba.dataset.cpAba || aba.dataset.cteAba;
    const el = itens.find((x) => x.dataset.ir === ir && x.dataset.aba === nome);
    if (el) marcar(el);
  }));

  // Outra página do menu (ou um atalho): apaga o destaque e fecha o submenu;
  // se o atalho abriu uma tela de transporte, acende o subitem dela.
  const observar = new MutationObserver(() => {
    const aberta = PAGINAS.find((p) => !document.getElementById(`pagina-${p}`)?.classList.contains('oculto'));
    if (!aberta) { marcar(null); abrirSub(false); return; }
    if (!itens.some((x) => x.classList.contains('ativo') && x.dataset.ir === aberta)) {
      marcar(itens.find((x) => x.dataset.ir === aberta && !x.classList.contains('oculto')));
      abrirSub(true);
    }
  });
  PAGINAS.forEach((p) => {
    const sec = document.getElementById(`pagina-${p}`);
    if (sec) observar.observe(sec, { attributes: true, attributeFilter: ['class'] });
  });
})();
