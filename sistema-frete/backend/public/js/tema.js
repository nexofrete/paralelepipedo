// Aplica o tema salvo antes da página desenhar, pra não "piscar" o tema errado.
// (Arquivo próprio: a proteção do navegador (CSP) não deixa rodar script embutido no HTML.)
try { if (localStorage.getItem('tema') === 'claro') document.documentElement.classList.add('tema-claro'); } catch (e) { /* segue */ }
