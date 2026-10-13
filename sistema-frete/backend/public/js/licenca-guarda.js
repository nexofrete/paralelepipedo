// Sem licença ativa, as telas do sistema mandam para a ativação. No painel,
// mostra o aviso de licença vencendo ou vencida (só consulta).
(() => {
  fetch('/api/licenca/estado').then((r) => r.json()).then((e) => {
    window.__licenca = e;
    if (!e.ativo) { window.location.replace('ativar.html'); return; }
    if (!['vencendo', 'tolerancia', 'vencida'].includes(e.situacao)) return;
    const faixa = document.createElement('div');
    faixa.id = 'faixaLicenca';
    faixa.style.cssText = `position:sticky; top:0; z-index:50; padding:8px 14px; text-align:center; font-size:13px; font-weight:600;
      background:${e.situacao === 'vencendo' ? 'rgba(242,184,75,0.95)' : 'rgba(214,58,64,0.95)'}; color:#111;`;
    faixa.textContent = `🔑 ${e.mensagem}`;
    const ir = () => document.body.prepend(faixa);
    if (document.body) ir(); else document.addEventListener('DOMContentLoaded', ir);
  }).catch(() => {});
})();
