// Aplica o tema salvo antes da página desenhar, pra não "piscar" o tema errado.
// (Arquivo próprio: a proteção do navegador (CSP) não deixa rodar script embutido no HTML.)
try { if (localStorage.getItem('tema') === 'claro') document.documentElement.classList.add('tema-claro'); } catch (e) { /* segue */ }
// Menu lateral recolhido (js/menuRecolher.js), também antes de desenhar.
try { if (localStorage.getItem('menuRecolhido') === '1') document.documentElement.classList.add('menu-recolhido'); } catch (e) { /* segue */ }
