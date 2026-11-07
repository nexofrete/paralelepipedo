// Módulos da empresa (Cadastros » Empresa): transportadora, embarcador ou ambos.
// Esconde do menu, do "Ir para" e da tela Hoje a parte que a empresa não usa. Os itens do menu
// marcados com data-modulo="transportadora" ou "embarcador" somem pelo CSS (html[data-modulos]).
// A escolha fica guardada no navegador para o menu já abrir certo, e é conferida no servidor.
// Com os dois módulos, o menu é um só (por área) e mostra as telas das duas partes.
window.Modulos = (() => {
  const CHAVE = 'modulosEmpresa';
  const VALIDOS = ['ambos', 'transportadora', 'embarcador'];
  let atual = 'ambos';
  try { const v = localStorage.getItem(CHAVE); if (VALIDOS.includes(v)) atual = v; } catch { /* sem armazenamento */ }
  try { localStorage.removeItem('parteMenu'); } catch { /* chave da antiga troca TMS | Embarcador */ }
  function marcar() {
    document.documentElement.dataset.modulos = atual;
    document.documentElement.dataset.empresaModulos = atual;
  }
  marcar();

  // O elemento é de uma parte que a empresa não usa?
  const fora = (el) => {
    if (atual === 'ambos' || !el) return false;
    const marcado = el.closest('[data-modulo]');
    return !!marcado && marcado.dataset.modulo !== atual;
  };
  // Tela aberta que ficou de fora: vai para a tela inicial (Hoje ou a visão geral dos fretes contratados).
  function corrigirTela() {
    const aberta = document.querySelector('main > section[id^="pagina-"]:not(.oculto)')?.id.slice(7);
    const item = aberta && document.querySelector(`.barra-lateral .nav-item[data-pagina="${aberta}"]`);
    if (!fora(item)) return;
    const hoje = document.getElementById('navHoje');
    if (hoje && !hoje.classList.contains('oculto') && !fora(hoje)) hoje.click();
    else document.querySelector('.nav-item[data-pagina="visao-geral"]')?.click();
  }
  function aplicar(valor) {
    if (!VALIDOS.includes(valor)) return;
    const mudou = valor !== atual;
    atual = valor;
    marcar();
    try { localStorage.setItem(CHAVE, valor); } catch { /* sem armazenamento */ }
    if (mudou) document.dispatchEvent(new CustomEvent('modulos-mudou', { detail: atual }));
    setTimeout(corrigirTela, 300);
  }
  apiFetch('/api/empresa').then((r) => (r.ok ? r.json() : null)).then((e) => { if (e?.modulos) aplicar(e.modulos); }).catch(() => {});
  return { fora, aplicar, atual: () => atual, parte: () => atual };
})();
