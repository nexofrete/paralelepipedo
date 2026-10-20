// Links de download sem a senha de acesso na URL.
// As telas montam os links com ?token=... (DACTE, XML, boleto, planilha, anexo...). Na hora
// do clique, este arquivo troca esse valor por um ticket de download pedido ao servidor —
// vale só para aquele arquivo e por 2 minutos —, então o token da sessão não vai para o
// histórico do navegador, para proxies nem para logs. Vale para clique normal, Ctrl/meio
// (nova aba), window.open e LinkSeguro.ir(url) (download na mesma aba).
// Cada página diz como pedir o ticket: LinkSeguro.configurar(async (caminho) => ticket).
(function () {
  let pedir = null;
  const abrirOriginal = window.open.bind(window);

  function precisa(url) {
    try {
      const u = new URL(String(url), location.href);
      return u.origin === location.origin && u.pathname.startsWith('/api/') && u.searchParams.has('token');
    } catch (e) { return false; }
  }

  async function trocar(url) {
    const u = new URL(String(url), location.href);
    if (!pedir) throw new Error('Link de download indisponível nesta tela.');
    u.searchParams.set('token', await pedir(u.pathname));
    return u.pathname + u.search + u.hash;
  }

  const falhou = (err) => window.alert(`Não consegui abrir o arquivo: ${err.message || 'falha de conexão.'} Tente de novo.`);

  // Nova aba: abre já (senão o navegador bloqueia como pop-up) e leva ao endereço quando o ticket chega.
  function abrirNovaAba(url) {
    const aba = abrirOriginal('about:blank', '_blank');
    if (aba) { try { aba.opener = null; aba.document.title = 'Abrindo...'; aba.document.body.textContent = 'Abrindo o arquivo...'; } catch (e) { /* segue */ } }
    trocar(url).then((final) => { if (aba) aba.location.replace(final); else location.href = final; })
      .catch((err) => { if (aba) aba.close(); falhou(err); });
    return aba;
  }

  async function ir(url) {
    if (!precisa(url)) { location.href = url; return; }
    try { location.href = await trocar(url); } catch (err) { falhou(err); }
  }

  window.open = function (url, alvo, recursos) {
    if (url && precisa(url)) {
      if (alvo && !['_blank', ''].includes(alvo)) { ir(url); return null; }
      return abrirNovaAba(url);
    }
    return abrirOriginal(url, alvo, recursos);
  };

  function aoClicar(e) {
    if (e.defaultPrevented || (e.type === 'auxclick' && e.button !== 1) || (e.type === 'click' && e.button !== 0)) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !precisa(a.href)) return;
    e.preventDefault();
    const novaAba = a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;
    if (novaAba) abrirNovaAba(a.href); else ir(a.href);
  }
  document.addEventListener('click', aoClicar, true);
  document.addEventListener('auxclick', aoClicar, true);

  window.LinkSeguro = {
    configurar(fn) { pedir = fn; },
    ir,
    trocar,
    // Ticket que vale por prefixo (imagens do mapa da roteirização).
    ticket: (caminho) => { if (!pedir) throw new Error('Link de download indisponível nesta tela.'); return pedir(caminho); },
  };
}());
