// =====================================================================
// Manutenção » Zerar o banco de dados: mostra o que vai sair, pede a palavra ZERAR e a
// senha do administrador. O servidor faz um backup antes (src/zerarBanco.js).
// Usa do dashboard.js: apiFetch, mostrarAlerta.
// =====================================================================
(() => {
  const botao = document.getElementById('btnZerarBanco');
  if (!botao) return;
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const n = (v) => Number(v || 0).toLocaleString('pt-BR');

  botao.addEventListener('click', async () => {
    let p;
    try {
      const r = await apiFetch('/api/manutencao/zerar/previa');
      p = await r.json();
      if (!r.ok) throw new Error(p.erro || 'Erro.');
    } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); return; }
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:620px; width:100%; max-height:92vh; overflow-y:auto; padding:22px 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0; color:var(--vermelho);">🧨 Zerar o banco de dados</h3><span style="cursor:pointer; font-size:18px;" data-zb-fechar>✕</span></div>
      <p style="font-size:13px;">Vai ser apagado:</p>
      ${p.movimentacao.length ? `<table style="width:100%; font-size:13px;"><tbody>${p.movimentacao.map((m) => `<tr><td>${esc(m.nome)}</td><td style="text-align:right;"><b>${n(m.quantidade)}</b></td></tr>`).join('')}</tbody></table>
        <p style="font-size:12px; color:var(--texto-fraco);">… e o resto da movimentação ligada a eles, mais as fotos de canhoto, assinaturas e anexos.</p>`
        : '<p style="font-size:13px; color:var(--texto-fraco);">Não há movimentação no banco.</p>'}
      <label class="ac-opcao" style="margin:10px 0;"><input type="checkbox" id="zbCadastros" /> Apagar também os cadastros (${n(p.cadastros)} registro(s): transportadoras, tabelas de preço, clientes, parceiros, veículos, motoristas, filiais, contas bancárias...)</label>
      <p style="font-size:12.5px; color:var(--texto-fraco);">Não são apagados: usuários, perfis de acesso, dados da empresa (certificado digital, séries) e as configurações. A numeração do CT-e, MDF-e e NFS-e em produção continua de onde parou. Antes de apagar, o sistema faz um backup completo (Backups » Restaurar volta tudo).</p>
      <div class="campo"><label>Digite <b>ZERAR</b> para confirmar</label><input id="zbPalavra" autocomplete="off" /></div>
      <div class="campo"><label>Sua senha de administrador</label><input id="zbSenha" type="password" autocomplete="current-password" /></div>
      <div id="zbErro" class="mensagem-erro"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
        <button class="btn btn-secundario" data-zb-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="zbConfirmar" style="width:auto; background:var(--vermelho); border-color:var(--vermelho);" disabled>Fazer backup e zerar</button></div></div>`;
    document.body.appendChild(fundo);
    const $ = (id) => fundo.querySelector(`#${id}`);
    const liberar = () => { $('zbConfirmar').disabled = $('zbPalavra').value.trim().toUpperCase() !== 'ZERAR' || !$('zbSenha').value; };
    $('zbPalavra').addEventListener('input', liberar); $('zbSenha').addEventListener('input', liberar);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-zb-fechar]')) fundo.remove(); });
    $('zbConfirmar').addEventListener('click', async () => {
      const b = $('zbConfirmar');
      b.disabled = true; b.textContent = 'Fazendo o backup e zerando…';
      $('zbErro').classList.remove('visivel');
      try {
        const r = await apiFetch('/api/manutencao/zerar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmacao: $('zbPalavra').value, senha: $('zbSenha').value, apagar_cadastros: $('zbCadastros').checked }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || 'Erro ao zerar.');
        fundo.remove();
        mostrarAlerta(j.mensagem, { tipo: 'sucesso' });
        setTimeout(() => location.reload(), 4000);   // a tela recarrega já sem os dados
      } catch (e) {
        $('zbErro').textContent = e.message; $('zbErro').classList.add('visivel');
        b.disabled = false; b.textContent = 'Fazer backup e zerar';
      }
    });
  });
})();
