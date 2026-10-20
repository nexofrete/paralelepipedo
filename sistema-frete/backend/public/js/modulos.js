// Módulos da empresa (Cadastros » Empresa): transportadora, embarcador ou ambos.
// Esconde do menu, do "Ir para" e da tela Hoje a parte que a empresa não usa. Os itens do menu
// marcados com data-modulo="transportadora" ou "embarcador" somem pelo CSS (html[data-modulos]).
// A escolha fica guardada no navegador para o menu já abrir certo, e é conferida no servidor.
window.Modulos = (() => {
  const CHAVE = 'modulosEmpresa';
  const VALIDOS = ['ambos', 'transportadora', 'embarcador'];
  let atual = 'ambos';
  try { const v = localStorage.getItem(CHAVE); if (VALIDOS.includes(v)) atual = v; } catch { /* sem armazenamento */ }
  document.documentElement.dataset.modulos = atual;

  // O elemento está numa parte do sistema que a empresa não usa?
  const fora = (el) => {
    if (atual === 'ambos' || !el) return false;
    const marcado = el.closest('[data-modulo]');
    return !!marcado && marcado.dataset.modulo !== atual;
  };
  // Tela aberta que ficou de fora: vai para a tela inicial do módulo.
  function corrigirTela() {
    const ativo = document.querySelector('.barra-lateral .nav-item.ativo[data-pagina]');
    if (!fora(ativo)) return;
    if (atual === 'embarcador') document.querySelector('.nav-item[data-pagina="visao-geral"]')?.click();
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
    document.documentElement.dataset.modulos = valor;
    try { localStorage.setItem(CHAVE, valor); } catch { /* sem armazenamento */ }
    if (mudou) document.dispatchEvent(new CustomEvent('modulos-mudou', { detail: valor }));
    setTimeout(corrigirTela, 300);
  }
  apiFetch('/api/empresa').then((r) => (r.ok ? r.json() : null)).then((e) => { if (e?.modulos) aplicar(e.modulos); }).catch(() => {});
  return { fora, aplicar, atual: () => atual };
})();
