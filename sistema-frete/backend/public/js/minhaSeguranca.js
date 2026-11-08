// =====================================================================
// 🔐 Minha segurança (rodapé do menu): trocar a senha, verificação em duas etapas
// por aplicativo autenticador (ativar, novos códigos de recuperação, desligar) e as
// sessões abertas (encerrar uma ou todas as outras).
// E, no cadastro de usuário (quem gerencia usuários): sessões, bloqueio e 2FA da pessoa.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
window.MinhaSeguranca = (() => {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const json = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro || 'Erro.'); return d; };
  const post = (url, corpo) => apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) }).then(json);
  const listaSessoes = (lista, atual, comBotao) => (lista.length ? `<table style="width:100%; font-size:12.5px;"><thead><tr><th style="text-align:left;">Aparelho</th><th style="text-align:left;">IP</th><th style="text-align:left;">Entrou</th><th style="text-align:left;">Último uso</th><th></th></tr></thead><tbody>
    ${lista.map((s) => `<tr><td>${esc(s.aparelho || '—')}${s.id === atual ? ' <b style="color:var(--verde);">(esta)</b>' : ''}</td><td>${esc(s.ip || '—')}</td><td>${quando(s.criado_em)}</td><td>${quando(s.ultimo_uso)}</td>
      <td style="text-align:right;">${comBotao && s.id !== atual ? `<button class="btn btn-secundario" data-ms-encerrar="${esc(s.id)}" style="width:auto; padding:3px 9px; font-size:11.5px;">Encerrar</button>` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p style="font-size:12.5px; color:var(--texto-fraco);">Nenhuma sessão aberta.</p>');
  const blocoCodigos = (codigos) => `<p style="font-size:13px;"><b>Guarde estes códigos de recuperação</b> (anote ou imprima). Cada um entra uma vez, se você perder o celular. Os antigos deixam de valer.</p>
    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; font-family:monospace; font-size:14px; text-align:center;">${codigos.map((c) => `<div style="padding:6px; border:1px dashed var(--borda); border-radius:6px;">${c}</div>`).join('')}</div>`;

  // ---------- Janela ----------
  let fundo = null;
  async function abrir() {
    fundo?.remove();
    fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = '<div class="painel modal-card" style="max-width:760px; width:100%; max-height:92vh; overflow-y:auto; padding:20px 22px;" id="msCorpo">Carregando…</div>';
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-ms-fechar]')) { fundo.remove(); fundo = null; } });
    desenhar();
  }
  async function desenhar(extra = '') {
    const corpo = fundo?.querySelector('#msCorpo'); if (!corpo) return;
    let eu; let s;
    try { [eu, s] = await Promise.all([apiFetch('/api/auth/eu').then(json), apiFetch('/api/auth/sessoes').then(json)]); } catch (e) { corpo.textContent = e.message; return; }
    corpo.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🔐 Minha segurança</h3><span style="cursor:pointer; font-size:18px;" data-ms-fechar>✕</span></div>
      ${extra ? `<div class="painel" style="margin-top:12px; padding:12px 14px; border-color:var(--azul);">${extra}</div>` : ''}
      <h4 style="margin:16px 0 6px;">Senha</h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; align-items:end;">
        <div class="campo" style="margin:0;"><label>Senha atual</label><input type="password" id="msAtual" autocomplete="current-password" /></div>
        <div class="campo" style="margin:0;"><label>Nova senha</label><input type="password" id="msNova" autocomplete="new-password" /></div>
        <div class="campo" style="margin:0;"><label>Confirme</label><input type="password" id="msConfirma" autocomplete="new-password" /></div>
        <button class="btn btn-primario" id="msTrocar" style="width:auto;">Trocar a senha</button></div>
      <small style="color:var(--texto-fraco);">Ao trocar, as suas outras sessões (outros computadores) são encerradas.</small>
      <h4 style="margin:18px 0 6px;">Verificação em duas etapas</h4>
      ${eu.totp_ativo ? `<p style="font-size:13px; margin:0 0 8px;">✅ <b>Aplicativo autenticador ligado.</b> Depois da senha, o sistema pede o código do celular.</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-secundario" id="msNovosCodigos" style="width:auto;">Gerar novos códigos de recuperação</button>
          <button class="btn btn-secundario" id="msDesligar" style="width:auto;">Desligar o aplicativo</button></div>`
        : `<p style="font-size:13px; margin:0 0 8px;">${eu.dois_fatores_ativo ? '✉️ Hoje o código chega por <b>e-mail</b> (ligado pelo administrador). ' : 'Desligada. '}Com um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy) o código sai do seu celular, sem depender do e-mail.</p>
          <button class="btn btn-primario" id="msAtivar" style="width:auto;">📱 Ativar aplicativo autenticador</button><div id="msAtivacao"></div>`}
      <h4 style="margin:18px 0 6px;">Sessões abertas</h4>
      ${listaSessoes(s.sessoes, s.atual, true)}
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;"><button class="btn btn-secundario" id="msEncerrarOutras" style="width:auto;">Encerrar todas as outras sessões</button>
        <button class="btn btn-primario" data-ms-fechar style="width:auto;">Fechar</button></div>`;
    const $ = (id) => corpo.querySelector(`#${id}`);
    $('msTrocar').addEventListener('click', async () => {
      if ($('msNova').value !== $('msConfirma').value) { mostrarAlerta('As duas senhas novas não são iguais.', { tipo: 'erro' }); return; }
      try { await post('/api/auth/trocar-senha', { senha_atual: $('msAtual').value, nova_senha: $('msNova').value }); desenhar('✓ Senha trocada. As outras sessões foram encerradas.'); }
      catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    });
    $('msEncerrarOutras').addEventListener('click', async () => {
      try { const r = await post('/api/auth/sessoes/encerrar-outras'); desenhar(`✓ ${r.encerradas} sessão(ões) encerrada(s).`); } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    });
    corpo.querySelectorAll('[data-ms-encerrar]').forEach((b) => b.addEventListener('click', async () => {
      try { await apiFetch(`/api/auth/sessoes/${encodeURIComponent(b.dataset.msEncerrar)}`, { method: 'DELETE' }).then(json); desenhar('✓ Sessão encerrada.'); } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    }));
    $('msAtivar')?.addEventListener('click', async () => {
      try {
        const d = await post('/api/auth/2fa-app/iniciar');
        $('msAtivacao').innerHTML = `<div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-top:10px;">
          <div style="background:#fff; padding:8px; border-radius:8px; width:180px; height:180px;">${d.qr}</div>
          <div style="flex:1; min-width:220px; font-size:13px;"><p style="margin-top:0;">1. No aplicativo, toque em <b>+</b> e leia o QR Code (ou digite a chave <b style="font-family:monospace;">${esc(d.segredo)}</b>).<br>2. Digite o código de 6 números que aparece:</p>
            <div style="display:flex; gap:8px;"><input id="msCodigo" maxlength="6" inputmode="numeric" placeholder="000000" style="letter-spacing:5px; font-size:18px; text-align:center; max-width:150px;" />
            <button class="btn btn-primario" id="msConfirmarApp" style="width:auto;">Ativar</button></div></div></div>`;
        $('msCodigo').focus();
        $('msConfirmarApp').addEventListener('click', async () => {
          try { const r = await post('/api/auth/2fa-app/confirmar', { codigo: $('msCodigo').value }); desenhar(`✅ Aplicativo autenticador ligado.${blocoCodigos(r.codigos_recuperacao)}`); }
          catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
        });
      } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    });
    const comSenha = async (url, texto, depois) => {
      const senha = await pedirTexto(texto, { senha: true, placeholder: 'Sua senha' });
      if (!senha) return;
      try { depois(await post(url, { senha })); } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    };
    $('msNovosCodigos')?.addEventListener('click', () => comSenha('/api/auth/2fa-app/novos-codigos', 'Digite a sua senha para gerar novos códigos de recuperação:', (r) => desenhar(blocoCodigos(r.codigos_recuperacao))));
    $('msDesligar')?.addEventListener('click', () => comSenha('/api/auth/2fa-app/desligar', 'Digite a sua senha para desligar o aplicativo autenticador:', () => desenhar('Aplicativo autenticador desligado.')));
  }

  // Botão no rodapé do menu.
  const tema = document.getElementById('btnAlternarTema');
  if (tema && !document.getElementById('btnMinhaSeguranca')) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'btnMinhaSeguranca'; b.className = 'alternador-tema'; b.title = 'Senha, verificação em duas etapas e sessões abertas';
    b.style.cssText = 'margin-top:6px; display:flex; align-items:center; gap:6px;';
    b.innerHTML = '<span>🔐</span> <span>Minha segurança</span>';
    b.addEventListener('click', abrir);
    tema.insertAdjacentElement('afterend', b);
  }

  // ---------- Cadastro de usuário: segurança da conta da pessoa ----------
  async function formularioUsuario(u) {
    const painel = document.querySelector('#painelFormUsuario .modal-card');
    if (!painel) return;
    let div = document.getElementById('msUsuario');
    if (!div) {
      div = document.createElement('div'); div.id = 'msUsuario';
      div.style.cssText = 'margin-top:16px; border-top:1px solid var(--borda); padding-top:12px; font-size:13px;';
      const botoes = document.getElementById('btnSalvarUsuario')?.parentElement;
      painel.insertBefore(div, botoes);
    }
    if (!u) { div.innerHTML = ''; div.classList.add('oculto'); return; }
    div.classList.remove('oculto');
    div.innerHTML = 'Carregando a segurança da conta…';
    let s;
    try { s = await apiFetch(`/api/auth/usuarios/${u.id}/seguranca`).then(json); } catch (e) { div.innerHTML = ''; return; }
    div.innerHTML = `<b>🔐 Segurança da conta</b>
      <div style="margin:6px 0;">${s.bloqueado ? `⛔ <b style="color:var(--vermelho);">Bloqueada</b> até ${quando(s.bloqueado_ate)} (${s.tentativas_falhas} senhas erradas)` : `Conta liberada${s.tentativas_falhas ? ` (${s.tentativas_falhas} senha(s) errada(s) seguida(s))` : ''}`}
        · 2FA: ${s.totp_ativo ? `aplicativo (${s.codigos_restantes} código(s) de recuperação)` : s.dois_fatores_ativo ? 'e-mail' : 'desligado'} · senha trocada em ${quando(s.senha_alterada_em)}</div>
      ${listaSessoes(s.sessoes, null, false)}
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
        <button type="button" class="btn btn-secundario" data-ms-acao="encerrar-sessoes" style="width:auto; padding:5px 12px; font-size:12.5px;">Encerrar todas as sessões</button>
        ${s.bloqueado || s.tentativas_falhas ? '<button type="button" class="btn btn-secundario" data-ms-acao="desbloquear" style="width:auto; padding:5px 12px; font-size:12.5px;">Desbloquear</button>' : ''}
        ${s.totp_ativo ? '<button type="button" class="btn btn-secundario" data-ms-acao="desligar-2fa-app" style="width:auto; padding:5px 12px; font-size:12.5px;" title="Para quem perdeu o celular: no próximo login, configura de novo (se for obrigatório)">Desligar o aplicativo autenticador</button>' : ''}</div>`;
    div.querySelectorAll('[data-ms-acao]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar(`${b.textContent.trim()} de ${u.nome}?`))) return;
      try { const r = await post(`/api/auth/usuarios/${u.id}/seguranca/${b.dataset.msAcao}`); mostrarAlerta(r.mensagem, { tipo: 'sucesso' }); formularioUsuario(u); }
      catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    }));
  }

  return { abrir, formularioUsuario };
})();
