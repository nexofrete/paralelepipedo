// DANFE (src/danfe.js): divide os produtos em folhas A4 de altura fixa (284 mm: 297 − margens de 6 mm − folga).
// Cada folha tem o conteúdo (canhoto, cabeçalho, quadros e produtos) e, no rodapé, os dados adicionais. Enquanto o
// conteúdo mais o rodapé passam da folha, a última linha de produto vai para a folha seguinte (que repete o canhoto, o
// cabeçalho e o rodapé); a "Continuação - informações complementares" fica sempre na última folha. No fim, numera
// "FL x / y". Fica num arquivo próprio para ser lido e embutido em cada DANFE.
(function () {
  var mm = document.getElementById('danfeMm').getBoundingClientRect().height / 100;
  var limite = 283 * mm;
  var alt = function (pag) {
    var c = pag.querySelector(':scope > .conteudo'); var r = pag.querySelector(':scope > .rodape');
    return (c ? c.getBoundingClientRect().height : 0) + (r ? r.getBoundingClientRect().height : 0);
  };
  document.querySelectorAll('.pag[data-danfe]').forEach(function (primeira) {
    var modelo = primeira.querySelector('template.danfe-cont');
    var folhas = [primeira]; var atual = primeira; var voltas = 0;
    while (alt(atual) > limite && voltas++ < 500) {
      var corpo = atual.querySelector('table.itens tbody');
      var cont = atual.querySelector('.cont-info');
      if (!corpo || (corpo.rows.length <= 1 && !cont)) break;
      var prox = document.createElement('div'); prox.className = 'pag';
      prox.appendChild(modelo.content.cloneNode(true));
      atual.after(prox); folhas.push(prox);
      var destino = prox.querySelector('table.itens tbody');
      // A continuação das informações complementares vai junto para a última folha.
      if (cont) prox.querySelector(':scope > .conteudo').appendChild(cont);
      while (alt(atual) > limite && corpo.rows.length > 1) destino.insertBefore(corpo.rows[corpo.rows.length - 1], destino.firstChild);
      // Folha nova sem produto nenhum (só a continuação do texto): esconde a tabela vazia.
      if (!destino.rows.length) { var t = destino.closest('table'); t.style.display = 'none'; var tit = t.previousElementSibling; if (tit && tit.classList.contains('tit')) tit.style.display = 'none'; }
      atual = prox;
    }
    folhas.forEach(function (f, i) { f.querySelectorAll('.nfolha').forEach(function (e) { e.textContent = 'FL ' + (i + 1) + ' / ' + folhas.length; }); });
  });
  document.body.classList.add('danfe-pronto');
})();
