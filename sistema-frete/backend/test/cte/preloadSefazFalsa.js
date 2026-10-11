// Para testar a tela sem a SEFAZ de verdade: node -r ./test/cte/preloadSefazFalsa.js server.js
// Liga a SEFAZ de mentira e desvia os webservices do CT-e para ela.
require('./sefazFalsa').iniciar().then((s) => console.log(`[teste] SEFAZ de mentira em ${s.base}`));
