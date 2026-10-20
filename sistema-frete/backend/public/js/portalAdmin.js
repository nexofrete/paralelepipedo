// =====================================================================
// Portal do cliente — administração dos acessos (só o administrador):
// cria o acesso do embarcador ligado aos CNPJ/CPF dele, gera senha
// provisória, desativa e configura o endereço público do portal.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const nav = document.getElementById('navPortalCliente');
  if (usuario?.perfil !== 'admin' || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca entrou');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/portal-acessos${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  };
  const modal = $('modalPortalCliente');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-pc-fechar]')) fechar(); });

  let estado = { acessos: [], config: {} };
  const enderecoPortal = () => `${estado.config.endereco || window.location.origin}/portal.html`;

  async function carregar() {
    estado = await api('');
    desenhar();
  }
  function desenhar() {
    const b = $('pcBusca').value.trim().toLowerCase(); const bd = b.replace(/\D/g, '');
    const lista = estado.acessos.filter((a) => !b || [a.nome, a.email, a.cliente_nome].some((x) => String(x || '').toLowerCase().includes(b)) || (bd && a.documentos.some((d) => d.includes(bd))));
    $('pcAviso').innerHTML = `<div class="cte-aviso ${estado.config.endereco ? 'ok' : ''}" style="margin-bottom:12px;">
      Endereço do portal para os clientes: <b>${esc(enderecoPortal())}</b>
      ${estado.config.endereco ? '' : '<br><small>Para o cliente entrar de fora da empresa, o servidor precisa estar publicado na internet (HTTPS). Configure o endereço público em ⚙ Configurar — com ele, o sistema manda o acesso por e-mail e o cliente pode recuperar a senha sozinho.</small>'}
      ${estado.config.cotacao_automatica ? '<br><small>Cotação automática ligada: o cliente recebe o preço da tabela na hora.</small>' : ''}</div>`;
    $('pcTabela').innerHTML = lista.length ? `<table class="edi-tabela"><thead><tr><th>Cliente</th><th>Quem usa</th><th>CNPJ/CPF</th><th>Vê</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((a) => `<tr style="${a.ativo ? '' : 'opacity:.55;'}"><td><b>${esc(a.cliente_nome || '—')}</b></td><td>${esc(a.nome)}<br><small style="color:var(--texto-fraco);">${esc(a.email)}</small></td>
        <td><small>${a.documentos.map((d) => esc(docFmt(d))).join('<br>')}${a.por_raiz ? '<br><i>+ todas as filiais</i>' : ''}</small></td>
        <td><small>Cargas${a.pode_financeiro ? ', valores e faturas' : ' (sem valores)'}</small></td>
        <td><small>${quando(a.ultimo_acesso)}</small></td>
        <td><span class="oc-sit ${a.ativo ? (a.trocar_senha ? 'pendente' : 'entregue') : 'cancelado'}">${a.ativo ? (a.trocar_senha ? 'Senha provisória' : 'Ativo') : 'Desativado'}</span></td>
        <td><div class="oc-linha-acoes"><button class="primario" data-pc-editar="${a.id}">Editar</button><button data-pc-senha="${a.id}">Nova senha</button>
          <button data-pc-ativo="${a.id}">${a.ativo ? 'Desativar' : 'Reativar'}</button></div></td></tr>`).join('')}</tbody></table>`
      : `<div class="kanban-vazio">${estado.acessos.length ? 'Nenhum acesso nesta busca.' : 'Nenhum cliente com acesso ainda. Clique em "＋ Novo acesso" para liberar o portal a um cliente.'}</div>`;
  }
  nav.addEventListener('click', () => carregar().catch(erro));
  $('pcBusca').addEventListener('input', desenhar);
  $('pcNovo').addEventListener('click', () => formulario());
  $('pcConfig').addEventListener('click', configurar);
  $('pcTabela').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-pc-editar]');
    if (ed) { formulario(estado.acessos.find((a) => a.id === Number(ed.dataset.pcEditar))); return; }
    const se = e.target.closest('[data-pc-senha]');
    if (se) {
      const a = estado.acessos.find((x) => x.id === Number(se.dataset.pcSenha));
      if (!await confirmar(`Gerar uma senha provisória nova para ${a.nome}? A senha atual deixa de valer e quem estiver no portal precisa entrar de novo.`, { textoOk: 'Gerar senha' })) return;
      try { const r = await api(`/${a.id}/nova-senha`, { method: 'POST', body: JSON.stringify({ enviar_email: !!estado.config.endereco }) }); await carregar(); mostrarSenha(r); } catch (err) { erro(err); }
      return;
    }
    const at = e.target.closest('[data-pc-ativo]');
    if (at) {
      const a = estado.acessos.find((x) => x.id === Number(at.dataset.pcAtivo));
      if (a.ativo && !await confirmar(`Desativar o acesso de ${a.nome}? Ele sai do portal na hora.`, { textoOk: 'Desativar' })) return;
      try { await api(`/${a.id}/ativo`, { method: 'POST', body: JSON.stringify({ ativo: !a.ativo }) }); await carregar(); } catch (err) { erro(err); }
    }
  });

  function mostrarSenha(r) {
    const a = r.acesso;
    const texto = `Portal do cliente\nEndereço: ${enderecoPortal()}\nE-mail: ${a.email}\nSenha provisória: ${r.senha}\n(no primeiro acesso o portal pede para criar a sua senha)`;
    $('pcModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🔑 Acesso de ${esc(a.nome)}</h3><span style="cursor:pointer; font-size:18px;" data-pc-fechar>✕</span></div>
      ${r.email?.enviado ? `<div class="cte-aviso ok" style="margin-top:12px;">Mandamos o acesso para ${esc(a.email)}.</div>` : ''}
      ${r.email && !r.email.enviado ? `<div class="cte-aviso erro" style="margin-top:12px;">Não consegui mandar o e-mail: ${esc(r.email.erro)}</div>` : ''}
      <p style="margin:14px 0 6px;">Passe estes dados ao cliente. <b>A senha aparece só agora</b> (o sistema guarda apenas a versão embaralhada).</p>
      <pre id="pcTextoAcesso" style="background:var(--bg-input, rgba(0,0,0,.05)); border:1px solid var(--borda); border-radius:8px; padding:12px; white-space:pre-wrap; font-size:14px;">${esc(texto)}</pre>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" id="pcCopiar" style="width:auto;">📋 Copiar</button><button class="btn btn-primario" data-pc-fechar style="width:auto;">Pronto</button></div>`;
    modal.classList.remove('oculto');
    $('pcCopiar').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(texto); e.currentTarget.textContent = '✓ Copiado'; } catch { mostrarAlerta('Selecione o texto e copie.', { tipo: 'aviso' }); } });
  }

  function formulario(a = null) {
    $('pcModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">${a ? `🌐 Acesso de ${esc(a.nome)}` : '🌐 Novo acesso ao portal'}</h3><span style="cursor:pointer; font-size:18px;" data-pc-fechar>✕</span></div>
      <div class="cte-grade" style="margin-top:12px;">
        <div class="campo largo" style="position:relative;"><label for="pcCliente">Cliente (empresa)</label><input id="pcCliente" maxlength="200" autocomplete="off" value="${esc(a?.cliente_nome || '')}" placeholder="Busca no cadastro de clientes" />
          <div id="pcSug" class="oculto" style="position:absolute; z-index:5; left:0; right:0; top:100%; background:var(--bg-card); border:1px solid var(--borda); border-radius:8px; max-height:220px; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.25);"></div></div>
        <div class="campo inteiro"><label for="pcDocs">CNPJ/CPF do cliente (um por linha — as cargas em que algum deles aparece ficam visíveis)</label><textarea id="pcDocs" rows="3">${esc((a?.documentos || []).map(docFmt).join('\n'))}</textarea></div>
        <div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="pcRaiz" ${a?.por_raiz ? 'checked' : ''} style="width:auto;" /> Vale para todas as filiais (mesma raiz de CNPJ — 8 primeiros dígitos)</label></div>
        <div class="campo"><label for="pcNome">Nome de quem vai usar</label><input id="pcNome" maxlength="120" value="${esc(a?.nome || '')}" /></div>
        <div class="campo"><label for="pcEmail">E-mail (é o login)</label><input id="pcEmail" type="email" maxlength="250" value="${esc(a?.email || '')}" /></div>
        <div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="pcFin" ${a && !a.pode_financeiro ? '' : 'checked'} style="width:auto;" /> Vê valores de frete, faturas, boletos e baixa o XML (só dos CT-e em que o cliente é o pagador)</label><small class="fraco">Sem isso, o DACTE sai sem os valores do frete e o XML não fica disponível (ele traz os valores e não pode ser alterado).</small></div>
        ${a ? '' : `<div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="pcEnviar" ${estado.config.endereco ? 'checked' : 'disabled'} style="width:auto;" /> Mandar o acesso por e-mail${estado.config.endereco ? '' : ' (configure o endereço público do portal antes)'}</label></div>`}
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;"><button class="btn btn-secundario" data-pc-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="pcSalvar" style="width:auto;">${a ? 'Salvar' : 'Criar acesso'}</button></div>`;
    modal.classList.remove('oculto');
    ligarBusca();
    $('pcSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const corpo = { cliente_nome: $('pcCliente').value, documentos: $('pcDocs').value, por_raiz: $('pcRaiz').checked, nome: $('pcNome').value, email: $('pcEmail').value,
        pode_financeiro: $('pcFin').checked, enviar_email: !!$('pcEnviar')?.checked };
      try {
        if (a) { await api(`/${a.id}`, { method: 'PUT', body: JSON.stringify(corpo) }); fechar(); mostrarAlerta('Acesso salvo.', { tipo: 'sucesso' }); await carregar(); } else { const r = await api('', { method: 'POST', body: JSON.stringify(corpo) }); await carregar(); mostrarSenha(r); }
      } catch (err) { erro(err); b.disabled = false; }
    });
    (a ? $('pcNome') : $('pcCliente')).focus();
  }

  function ligarBusca() {
    const caixa = $('pcSug'); let achados = []; let t = null;
    const buscar = async () => {
      if (!document.body.contains(caixa)) return;
      const q = $('pcCliente').value.trim();
      if (q.length < 3) { caixa.classList.add('oculto'); return; }
      achados = await apiFetch(`/api/coletas/clientes?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => []);
      if (!document.body.contains(caixa) || !Array.isArray(achados)) return;
      caixa.innerHTML = achados.map((k, i) => `<div data-pc-sug="${i}" style="padding:8px 10px; cursor:pointer; border-bottom:1px solid var(--borda); font-size:13px;"><b>${esc(k.nome)}</b> <small style="color:var(--texto-fraco);">${esc(docFmt(k.documento))} · ${esc(k.cidade || '')}/${esc(k.uf || '')}</small></div>`).join('');
      caixa.classList.toggle('oculto', !achados.length);
    };
    $('pcCliente').addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 300); });
    $('pcCliente').addEventListener('blur', () => setTimeout(() => caixa.classList.add('oculto'), 200));
    caixa.addEventListener('mousedown', (e) => {
      const el = e.target.closest('[data-pc-sug]'); if (!el) return;
      const k = achados[Number(el.dataset.pcSug)];
      $('pcCliente').value = k.nome || '';
      const atuais = $('pcDocs').value.split(/\n/).map((x) => x.trim()).filter(Boolean);
      if (k.documento && !atuais.some((x) => x.replace(/\D/g, '') === k.documento)) $('pcDocs').value = [...atuais, docFmt(k.documento)].join('\n');
      if (k.email && !$('pcEmail').value) $('pcEmail').value = k.email;
      caixa.classList.add('oculto');
    });
  }

  function configurar() {
    const c = estado.config;
    $('pcModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">⚙ Portal do cliente</h3><span style="cursor:pointer; font-size:18px;" data-pc-fechar>✕</span></div>
      <div class="campo" style="margin-top:14px;"><label for="pcEndereco">Endereço público do portal (como o cliente acessa pela internet)</label><input id="pcEndereco" maxlength="250" placeholder="https://portal.suatransportadora.com.br" value="${esc(c.endereco || '')}" />
        <small style="color:var(--texto-fraco);">Vai nos e-mails de acesso e de "esqueci a senha". Deixe em branco se o portal só for usado dentro da empresa.</small></div>
      <div class="campo"><label style="display:flex; gap:8px; align-items:flex-start;"><input type="checkbox" id="pcAuto" ${c.cotacao_automatica ? 'checked' : ''} style="width:auto; margin-top:3px;" />
        <span>Cotação automática: o cliente recebe na hora o preço da tabela da empresa e pode aprovar. Desligado, o pedido cai em Cotações (filtro "Do portal") para a equipe calcular e responder.</span></label></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-pc-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="pcCfgSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('pcCfgSalvar').addEventListener('click', async () => {
      try { await api('/config', { method: 'PUT', body: JSON.stringify({ endereco: $('pcEndereco').value, cotacao_automatica: $('pcAuto').checked }) }); fechar(); await carregar(); mostrarAlerta('Salvo.', { tipo: 'sucesso' }); } catch (err) { erro(err); }
    });
  }
})();
