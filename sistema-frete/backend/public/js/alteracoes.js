// =====================================================================
// Histórico de alterações campo a campo (antes → depois, quem e quando).
// Window.Alteracoes.abrir({ tabela, registro_id, titulo }) abre a janela; sem tabela, com filtros
// (Cadastros » Auditoria e Logs » 🕘 Alterações campo a campo). Usa do dashboard.js: apiFetch, mostrarAlerta.
// =====================================================================
window.Alteracoes = (() => {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const quando = (v) => new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const campoNome = (c) => String(c || '').replace(/^pode_/, 'pode ').replace(/_/g, ' ');
  const valor = (v) => (v == null || v === '' ? '<span style="color:var(--texto-fraco);">(vazio)</span>' : esc(v.length > 160 ? `${v.slice(0, 160)}…` : v));
  const OPER = { criou: '🆕 criou', alterou: '✏️ alterou', excluiu: '🗑 excluiu' };

  async function abrir({ tabela = '', registro_id = '', titulo = '' } = {}) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    const fixo = !!(tabela && registro_id);
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:1000px; width:100%; max-height:92vh; overflow-y:auto; padding:20px 22px;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🕘 Alterações${titulo ? ` — ${esc(titulo)}` : ' campo a campo'}</h3><span style="cursor:pointer; font-size:18px;" data-alt-fechar>✕</span></div>
      <p style="font-size:12.5px; color:var(--texto-fraco);">O que cada pessoa mudou: o valor de antes, o de depois, quem e quando. As mudanças automáticas do sistema (cálculo, conferência, rastreio) ficam no histórico de cada frete.</p>
      ${fixo ? '' : `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:8px; align-items:end; margin-bottom:10px;">
        <div class="campo" style="margin:0;"><label>Cadastro</label><select id="altTabela"><option value="">Todos</option></select></div>
        <div class="campo" style="margin:0;"><label>Nº do registro</label><input id="altRegistro" /></div>
        <div class="campo" style="margin:0;"><label>Quem</label><input id="altUsuario" /></div>
        <div class="campo" style="margin:0;"><label>Campo</label><input id="altCampo" /></div>
        <div class="campo" style="margin:0;"><label>De</label><input type="date" id="altDe" /></div>
        <div class="campo" style="margin:0;"><label>Até</label><input type="date" id="altAte" /></div></div>`}
      <div id="altLista">Carregando…</div></div>`;
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-alt-fechar]')) fundo.remove(); });
    const $ = (id) => fundo.querySelector(`#${id}`);
    let primeira = true;
    async function carregar() {
      const p = new URLSearchParams(fixo ? { tabela, registro_id } : { tabela: $('altTabela').value, registro_id: $('altRegistro').value.trim(), usuario: $('altUsuario').value.trim(), campo: $('altCampo').value.trim(), de: $('altDe').value, ate: $('altAte').value });
      const r = await apiFetch(`/api/alteracoes?${p}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { $('altLista').innerHTML = `<p style="color:var(--vermelho);">${esc(j.erro || 'Erro.')}</p>`; return; }
      if (primeira && !fixo) { $('altTabela').innerHTML += Object.entries(j.tabelas).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(''); primeira = false; }
      $('altLista').innerHTML = j.alteracoes.length ? `<table style="width:100%; font-size:12.5px;"><thead><tr><th style="text-align:left;">Quando</th><th style="text-align:left;">Quem</th>${fixo ? '' : '<th style="text-align:left;">Cadastro</th>'}<th style="text-align:left;">O quê</th><th style="text-align:left;">Antes</th><th style="text-align:left;">Depois</th></tr></thead><tbody>
        ${j.alteracoes.map((a) => `<tr><td style="white-space:nowrap;">${quando(a.quando)}</td><td>${esc(a.usuario_nome || '—')}</td>
          ${fixo ? '' : `<td>${esc(a.tabela_nome)} #${esc(a.registro_id || '')}</td>`}
          <td>${OPER[a.operacao] || esc(a.operacao)}${a.campo ? ` <b>${esc(campoNome(a.campo))}</b>` : ''}</td>
          <td style="max-width:280px; word-break:break-word;">${a.operacao === 'alterou' || a.operacao === 'excluiu' ? valor(a.antes) : ''}</td><td style="max-width:280px; word-break:break-word;">${a.operacao === 'alterou' ? valor(a.depois) : ''}</td></tr>`).join('')}</tbody></table>
        ${j.limite ? '<p style="font-size:12px; color:var(--texto-fraco);">Mostrando as 1000 mais recentes: use os filtros.</p>' : ''}`
        : '<p style="color:var(--texto-fraco);">Nenhuma alteração registrada.</p>';
    }
    if (!fixo) { let t; fundo.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 400); })); }
    carregar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
  }

  // Botão em Cadastros » Auditoria e Logs.
  const atualizar = document.getElementById('btnAtualizarAuditoria');
  if (atualizar && !document.getElementById('btnAlteracoes')) {
    const b = document.createElement('button');
    b.id = 'btnAlteracoes'; b.className = 'btn btn-secundario'; b.style.width = 'auto';
    b.textContent = '🕘 Alterações campo a campo';
    b.addEventListener('click', () => abrir());
    atualizar.parentNode.insertBefore(b, atualizar);
  }
  return { abrir };
})();
