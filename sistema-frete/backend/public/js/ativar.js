// Tela de ativação: mostra o código da máquina, ajuda a pedir a chave e ativa.
(async () => {
  const $ = (id) => document.getElementById(id);
  let estado = {};
  async function carregar() {
    estado = await fetch('/api/licenca/estado').then((r) => r.json());
    $('codigoMaquina').textContent = estado.codigo;
    const sit = $('situacao');
    sit.classList.remove('oculto');
    sit.textContent = estado.ativo
      ? `${estado.mensagem}${estado.cliente ? ` — ${estado.cliente}` : ''}`
      : estado.situacao === 'sem_licenca' ? 'Este computador ainda não foi ativado.' : estado.mensagem;
    $('linkEntrar').style.display = estado.ativo ? '' : 'none';
    const c = estado.contato || {};
    const texto = `Olá! Preciso da chave de ativação do Nexofrete.\nCódigo do computador: ${estado.codigo}\nEmpresa: \nCNPJ: `;
    const fone = String(c.whatsapp || '').replace(/\D/g, '');
    if (fone) { $('btnWhatsapp').href = `https://wa.me/${fone.length <= 11 ? `55${fone}` : fone}?text=${encodeURIComponent(texto)}`; $('btnWhatsapp').style.display = ''; }
    if (c.email) { $('btnEmail').href = `mailto:${c.email}?subject=${encodeURIComponent('Ativação do Nexofrete')}&body=${encodeURIComponent(texto)}`; $('btnEmail').style.display = ''; }
  }
  $('btnCopiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(estado.codigo); $('btnCopiar').textContent = '✓ Copiado'; } catch {
      const r = document.createRange(); r.selectNodeContents($('codigoMaquina')); getSelection().removeAllRanges(); getSelection().addRange(r);
    }
    setTimeout(() => { $('btnCopiar').textContent = '📋 Copiar código'; }, 2000);
  });
  $('btnAtivar').addEventListener('click', async () => {
    const erro = $('mensagemErro'); erro.classList.remove('visivel');
    const b = $('btnAtivar'); b.disabled = true;
    try {
      const r = await fetch('/api/licenca/ativar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: $('chaveAtivacao').value }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Não foi possível ativar.');
      erro.textContent = `✓ Sistema ativado para ${j.cliente}. Entrando…`; erro.style.color = 'var(--verde)'; erro.classList.add('visivel');
      setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    } catch (e) { erro.textContent = e.message; erro.style.color = ''; erro.classList.add('visivel'); b.disabled = false; }
  });
  carregar().catch(() => { $('situacao').textContent = 'Não consegui falar com o servidor.'; });
})();
