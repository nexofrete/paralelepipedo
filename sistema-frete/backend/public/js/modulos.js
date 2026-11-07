// Módulos da empresa (Cadastros » Empresa): transportadora, embarcador ou ambos.
// Esconde do menu, do "Ir para" e da tela Hoje a parte que a empresa não usa. Os itens do menu
// marcados com data-modulo="transportadora" ou "embarcador" somem pelo CSS (html[data-modulos]).
// A escolha fica guardada no navegador para o menu já abrir certo, e é conferida no servidor.
// Com os dois módulos, a chave "TMS | Embarcador" no alto do menu escolhe qual parte aparece
// (guardada no navegador de cada usuário); abrir uma tela da outra parte (pelo "Ir para") troca a chave.
window.Modulos = (() => {
  const CHAVE = 'modulosEmpresa';
  const CHAVE_PARTE = 'parteMenu';
  const VALIDOS = ['ambos', 'transportadora', 'embarcador'];
  let atual = 'ambos';
  let parte = 'transportadora';
  try { const v = localStorage.getItem(CHAVE); if (VALIDOS.includes(v)) atual = v; } catch { /* sem armazenamento */ }
  try { const v = localStorage.getItem(CHAVE_PARTE); if (v === 'embarcador') parte = v; } catch { /* sem armazenamento */ }
  // O que o menu mostra agora: o módulo da empresa ou, com os dois, a parte escolhida.
  const efetivo = () => (atual === 'ambos' ? parte : atual);
  function marcar() {
    document.documentElement.dataset.modulos = efetivo();
    document.documentElement.dataset.empresaModulos = atual;
    document.querySelectorAll('#menuPartes [data-parte]').forEach((b) => { const sim = b.dataset.parte === parte; b.classList.toggle('ativo', sim); b.setAttribute('aria-selected', String(sim)); });
  }
  marcar();
  document.addEventListener('DOMContentLoaded', marcar);

  // O elemento está numa parte que não aparece agora? empresa: true = só o que a empresa não usa
  // (o "Ir para" acha as telas das duas partes e troca a chave ao abrir).
  const fora = (el, { empresa = false } = {}) => {
    const m = empresa ? atual : efetivo();
    if (m === 'ambos' || !el) return false;
    const marcado = el.closest('[data-modulo]');
    return !!marcado && marcado.dataset.modulo !== m;
  };
  function trocarParte(p, { irParaInicio = true } = {}) {
    if (atual !== 'ambos' || !['transportadora', 'embarcador'].includes(p) || p === parte) return;
    parte = p;
    try { localStorage.setItem(CHAVE_PARTE, p); } catch { /* sem armazenamento */ }
    marcar();
    document.dispatchEvent(new CustomEvent('modulos-mudou', { detail: efetivo() }));
    if (irParaInicio) setTimeout(corrigirTela, 50);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#menuPartes [data-parte]');
    if (b) { trocarParte(b.dataset.parte); return; }
    // Abriu (pelo "Ir para" ou um atalho) uma tela da outra parte: o menu acompanha.
    const item = e.target.closest('.barra-lateral [data-pagina], .barra-lateral .nav-tsub');
    const marcado = item?.closest('[data-modulo]');
    if (marcado && atual === 'ambos' && marcado.dataset.modulo !== parte) trocarParte(marcado.dataset.modulo, { irParaInicio: false });
  }, true);
  // Tela aberta que ficou de fora: vai para a tela inicial do módulo.
  function corrigirTela() {
    const ativo = document.querySelector('.barra-lateral .nav-item.ativo[data-pagina]');
    if (!fora(ativo)) return;
    if (efetivo() === 'embarcador') document.querySelector('.nav-item[data-pagina="visao-geral"]')?.click();
    else {
      const hoje = document.getElementById('navHoje');
      const primeiro = [...document.querySelectorAll('.barra-lateral .nav-tsub')].find((el) => !el.classList.contains('oculto') && !fora(el));
      if (hoje && !hoje.classList.contains('oculto')) hoje.click(); else primeiro?.click();
    }
  }
  function aplicar(valor) {
    if (!VALIDOS.includes(valor)) return;
    const mudou = valor !== atual;
    atual = valor;
    marcar();
    try { localStorage.setItem(CHAVE, valor); } catch { /* sem armazenamento */ }
    if (mudou) document.dispatchEvent(new CustomEvent('modulos-mudou', { detail: efetivo() }));
    setTimeout(corrigirTela, 300);
  }
  apiFetch('/api/empresa').then((r) => (r.ok ? r.json() : null)).then((e) => { if (e?.modulos) aplicar(e.modulos); }).catch(() => {});
  return { fora, aplicar, trocarParte, atual: () => atual, parte: () => efetivo() };
})();
