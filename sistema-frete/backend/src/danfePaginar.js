// DANFE (src/danfe.js): divide os itens em folhas A4 (280 mm úteis: 297 − margens de 7 mm − folga). Enquanto a folha
// passa da altura, a última linha de produto vai para a folha seguinte (que repete o cabeçalho); no fim, numera
// "Folha x/y". Fica num arquivo próprio para ser lido e embutido em cada DANFE.
(function () {
  var mm = document.getElementById('danfeMm').getBoundingClientRect().height / 100;
  var limite = 280 * mm;
  var alt = function (pag) { return pag.querySelector(':scope > .folha').getBoundingClientRect().height; };
  document.querySelectorAll('.pag[data-danfe]').forEach(function (primeira) {
    var modelo = primeira.querySelector('template.danfe-cont');
    var folhas = [primeira]; var atual = primeira; var voltas = 0;
    while (alt(atual) > limite && voltas++ < 500) {
      var corpo = atual.querySelector('table.itens tbody');
      if (!corpo || corpo.rows.length <= 1) break;
      var prox = document.createElement('div'); prox.className = 'pag';
      prox.appendChild(modelo.content.cloneNode(true));
      atual.after(prox); folhas.push(prox);
      var destino = prox.querySelector('table.itens tbody');
      while (alt(atual) > limite && corpo.rows.length > 1) destino.insertBefore(corpo.rows[corpo.rows.length - 1], destino.firstChild);
      atual = prox;
    }
    folhas.forEach(function (f, i) { f.querySelectorAll('.nfolha').forEach(function (e) { e.textContent = 'Folha ' + (i + 1) + '/' + folhas.length; }); });
  });
  document.body.classList.add('danfe-pronto');
})();