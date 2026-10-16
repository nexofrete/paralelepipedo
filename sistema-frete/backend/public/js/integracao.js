// =====================================================================
// Configuração → Integração (API e ERP): chaves de API, webhooks (avisos
// automáticos) e o resumo da API para mandar ao fornecedor do ERP.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const nav = document.getElementById('navIntegracao');
  if (!nav || usuario?.perfil !== 'admin') return;
  nav.classList.remove('oculto');
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (c, o = {}) => {
    const r = await apiFetch(c, { ...o, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const modal = $('modalItg');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-itg-fechar]')) fechar(); });
  const abrirModal = (titulo, corpo) => {
    $('itgModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;"><h3 style="margin:0;">${titulo}</h3><span style="cursor:pointer; font-size:18px;" data-itg-fechar>✕</span></div>${corpo}`;
    modal.classList.remove('oculto');
  };
  const copiar = async (texto, botao) => {
    try { await navigator.clipboard.writeText(texto); if (botao) { const t = botao.textContent; botao.textContent = '✓ Copiado'; setTimeout(() => { botao.textContent = t; }, 1500); } }
    catch { mostrarAlerta('Não consegui copiar: selecione o texto e copie à mão.', { tipo: 'aviso' }); }
  };
  // Mostra um segredo uma vez só, com botão de copiar.
  const mostrarSegredo = (titulo, rotulo, valor, aviso) => {
    abrirModal(titulo, `<p style="margin:0 0 10px;">${aviso}</p>
      <label style="font-size:12px; color:var(--texto-fraco);">${rotulo}</label>
      <div style="display:flex; gap:8px; align-items:center; margin:4px 0 14px;"><input class="cte-entrada" id="itgSegredo" readonly value="${esc(valor)}" style="font-family:monospace; flex:1;" />
        <button class="btn btn-primario" id="itgCopiar" style="width:auto;">📋 Copiar</button></div>
      <div class="cte-aviso">⚠ Guarde agora: por segurança, ele <b>não aparece de novo</b>. Se perder, crie outro.</div>
      <div style="text-align:right; margin-top:14px;"><button class="btn btn-secundario" data-itg-fechar style="width:auto;">Já guardei</button></div>`);
    $('itgCopiar').addEventListener('click', (e) => copiar(valor, e.currentTarget));
    $('itgSegredo').addEventListener('focus', (e) => e.target.select());
  };

  let dados = null;
  async function carregar() {
    dados = await api('/api/integracao');
    const ent = await api('/api/integracao/entregas').catch(() => []);
    desenhar(ent);
  }
  const recarregar = () => carregar().catch(erro);
  nav.addEventListener('click', recarregar);

  function desenhar(entregas) {
    const base = `${location.origin}/api/v1`;
    const ev = dados.eventos;
    const chavesHtml = dados.chaves.length ? `<div class="tabela-container"><table><thead><tr><th>Nome</th><th>Chave</th><th>Pode</th><th>Último uso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${dados.chaves.map((k) => `<tr${k.ativo ? '' : ' style="opacity:.55;"'}><td><b>${esc(k.nome)}</b><br><small style="color:var(--texto-fraco);">criada ${quando(k.criado_em)}${k.criado_por_nome ? ` por ${esc(k.criado_por_nome)}` : ''}</small></td>
        <td><code>${esc(k.prefixo)}…</code></td><td>${k.escopos.map((e) => esc(dados.escopos[e] || e)).join('<br>')}</td>
        <td>${quando(k.ultimo_uso_em)}${k.ultimo_ip ? `<br><small style="color:var(--texto-fraco);">${esc(k.ultimo_ip)}</small>` : ''}</td>
        <td>${k.ativo ? '<span class="oc-sit entregue">Ativa</span>' : `<span class="oc-sit cancelado">Revogada</span><br><small>${quando(k.revogada_em)}</small>`}</td>
        <td>${k.ativo ? `<button class="btn btn-secundario" data-itg-revogar="${k.id}" style="width:auto; padding:4px 10px;">Revogar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p style="color:var(--texto-fraco); margin:0;">Nenhuma chave ainda. Crie uma para o ERP (uma por sistema, para poder revogar só aquela).</p>';
    const whHtml = dados.webhooks.length ? `<div class="tabela-container"><table><thead><tr><th>Nome / endereço</th><th>Eventos</th><th>Último envio</th><th>Fila</th><th></th></tr></thead><tbody>
      ${dados.webhooks.map((w) => `<tr${w.ativo ? '' : ' style="opacity:.6;"'}><td><b>${esc(w.nome)}</b> ${w.ativo ? '' : '<span class="oc-sit cancelado">Desligado</span>'}<br><small style="color:var(--texto-fraco); word-break:break-all;">${esc(w.url)}</small></td>
        <td style="white-space:normal; max-width:240px;">${w.eventos.includes('*') ? 'Todos' : w.eventos.map((e) => esc(ev[e] || e)).join(', ')}</td>
        <td>${w.ultimo_envio_em ? `${quando(w.ultimo_envio_em)}<br>${w.ultimo_status >= 200 && w.ultimo_status < 300 ? `<span style="color:var(--verde);">✓ HTTP ${w.ultimo_status}</span>` : `<span style="color:var(--vermelho);">✗ ${esc(w.ultimo_erro || `HTTP ${w.ultimo_status}`)}</span>`}` : '—'}</td>
        <td>${w.pendentes ? `${w.pendentes} na fila` : ''}${w.falharam ? `<br><span style="color:var(--vermelho);">${w.falharam} falharam</span>` : ''}${!w.pendentes && !w.falharam ? '—' : ''}</td>
        <td style="white-space:nowrap;"><button class="btn btn-secundario" data-itg-testar="${w.id}" style="width:auto; padding:4px 10px;">🔌 Testar</button>
          <button class="btn btn-secundario" data-itg-editar="${w.id}" style="width:auto; padding:4px 10px;">✏️</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p style="color:var(--texto-fraco); margin:0;">Nenhum webhook. Com um, o Nexofrete avisa o ERP na hora em que o CT-e é autorizado, a entrega acontece ou a fatura é paga.</p>';
    const entHtml = entregas.length ? `<div class="tabela-container" style="max-height:340px; overflow:auto;"><table><thead><tr><th>Quando</th><th>Evento</th><th>Webhook</th><th>Situação</th><th></th></tr></thead><tbody>
      ${entregas.map((e) => `<tr><td>${quando(e.criado_em)}</td><td>${esc(ev[e.evento] || e.evento)} <small style="color:var(--texto-fraco);">${esc(e.recurso)} ${e.recurso_id}</small></td><td>${esc(e.webhook)}</td>
        <td>${e.status === 'enviado' ? `<span class="oc-sit entregue">Enviado</span> <small>HTTP ${e.http_status}</small>` : e.status === 'falhou' ? `<span class="oc-sit cancelado">Falhou</span> <small>${esc(e.erro || '')}</small>`
          : `<span class="oc-sit pendente">Na fila</span> <small>${e.tentativas ? `${e.tentativas} tentativa(s) · ${esc(e.erro || '')} · próxima ${quando(e.proxima_em)}` : ''}</small>`}</td>
        <td>${e.status !== 'enviado' ? `<button class="btn btn-secundario" data-itg-reenviar="${e.id}" style="width:auto; padding:3px 9px;">Reenviar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p style="color:var(--texto-fraco); margin:0;">Nenhum aviso enviado ainda.</p>';
    $('itgConteudo').innerHTML = `
      <div class="painel" style="padding:14px 16px; margin-bottom:14px;"><h4 style="margin:0 0 10px;">🔑 Chaves de API</h4>${chavesHtml}</div>
      <div class="painel" style="padding:14px 16px; margin-bottom:14px;"><h4 style="margin:0 0 10px;">📣 Webhooks (avisos automáticos para o ERP)</h4>${whHtml}</div>
      <div class="painel" style="padding:14px 16px; margin-bottom:14px;"><h4 style="margin:0 0 10px;">📬 Últimos avisos</h4>${entHtml}</div>
      <div class="painel" style="padding:14px 16px;"><div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;"><h4 style="margin:0;">📘 Como o ERP usa (mande para o fornecedor do ERP)</h4>
        <button class="btn btn-secundario" id="itgCopiarDoc" style="width:auto;">📋 Copiar instruções</button></div>
        <pre id="itgDoc" style="white-space:pre-wrap; font-size:12.5px; line-height:1.5; background:var(--fundo-sutil, rgba(127,127,127,.08)); padding:12px; border-radius:8px; margin:10px 0 0;">${esc(documentacao(base))}</pre></div>`;
    document.querySelectorAll('[data-itg-revogar]').forEach((b) => b.addEventListener('click', () => revogar(Number(b.dataset.itgRevogar))));
    document.querySelectorAll('[data-itg-testar]').forEach((b) => b.addEventListener('click', () => testar(Number(b.dataset.itgTestar), b)));
    document.querySelectorAll('[data-itg-editar]').forEach((b) => b.addEventListener('click', () => formWebhook(dados.webhooks.find((w) => w.id === Number(b.dataset.itgEditar)))));
    document.querySelectorAll('[data-itg-reenviar]').forEach((b) => b.addEventListener('click', () => enviar(`/api/integracao/entregas/${b.dataset.itgReenviar}/reenviar`, 'POST').then(() => { mostrarAlerta('Vai de novo em até 20 segundos.', { tipo: 'sucesso' }); recarregar(); }).catch(erro)));
    $('itgCopiarDoc').addEventListener('click', (e) => copiar($('itgDoc').textContent, e.currentTarget));
  }

  function documentacao(base) {
    return `API do Nexofrete (v1) — ${base}
Autenticação: cabeçalho  Authorization: Bearer <chave>   (a chave começa com nxf_)
Formato: JSON (UTF-8). Datas AAAA-MM-DD (dia em Brasília); momentos em ISO 8601. Limite: 120 chamadas por minuto.

CONSULTAS (chave com "Consultar")
  GET ${base}/status                       → confere a chave
  GET ${base}/ctes?alterado_desde=2026-10-01T00:00:00-03:00&limite=100
        CT-e autorizados/cancelados/substituídos que mudaram depois da data, do mais antigo para o mais novo.
        Próxima página: repita com os valores de "proxima" (alterado_desde e depois_de).
        Filtro opcional: status=autorizado | cancelado | substituido
  GET ${base}/ctes/<chave de 44 dígitos>       → um CT-e (tomador, remetente, destinatário, NF-e, valor, entrega, fatura)
  GET ${base}/ctes/<chave>/xml                 → XML autorizado (procCTe)
  GET ${base}/entregas?desde=2026-10-01&ate=2026-10-31   → CT-e entregues no período (data, hora e recebedor)
  GET ${base}/faturas?alterado_desde=...&status=paga      → faturas (documentos, pagamentos, saldo, boleto)
  GET ${base}/faturas/<id>

LANÇAMENTO (chave com "Enviar NF-e")
  POST ${base}/nfe   corpo: {"xml": "<nfeProc ...>...</nfeProc>"}   ou   {"xmls": ["...", "..."]}
        → cada NF-e (destinada a esta transportadora) vira rascunho de CT-e, com o frete da tabela; a equipe confere e transmite.

AVISOS AUTOMÁTICOS (webhooks)
  O Nexofrete faz POST no endereço cadastrado com:
    {"id": "evt_123", "evento": "cte.entregue", "criado_em": "...", "dados": {"cte": {...}}}
  Eventos: cte.autorizado, cte.cancelado, cte.substituido, cte.entregue, fatura.criada, fatura.paga, fatura.cancelada
  (dados.cte ou dados.fatura no mesmo formato das consultas).
  Responda HTTP 2xx em até 10 s. Sem 2xx, tenta de novo em 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h e 24 h.
  O mesmo evento pode chegar mais de uma vez: use o "id" para ignorar repetidos.
  Assinatura (confira sempre):  X-Nexofrete-Assinatura: t=<unix>,v1=<hex>
    v1 = HMAC-SHA256(segredo do webhook, "<t>.<corpo exato recebido>") em hexadecimal.
    Recuse se v1 não conferir ou se t tiver mais de 5 minutos.
  Exemplo (Node.js):
    const [t, v1] = cab.split(',').map((p) => p.split('=')[1]);
    const ok = crypto.timingSafeEqual(Buffer.from(v1, 'hex'),
      crypto.createHmac('sha256', segredo).update(t + '.' + corpoBruto).digest());`;
  }

  async function revogar(id) {
    const k = dados.chaves.find((x) => x.id === id);
    if (!(await confirmar(`Revogar a chave "${k?.nome}"? O sistema que usa esta chave para de acessar na hora.`, { tipo: 'perigo', titulo: 'Revogar chave', textoOk: 'Revogar' }))) return;
    enviar(`/api/integracao/chaves/${id}/revogar`, 'POST').then(recarregar).catch(erro);
  }

  async function testar(id, botao) {
    botao.disabled = true; const t = botao.textContent; botao.textContent = 'Enviando…';
    try {
      const r = await enviar(`/api/integracao/webhooks/${id}/testar`, 'POST');
      mostrarAlerta(r.ok ? `O ERP recebeu o aviso de teste (HTTP ${r.http_status}).` : `O aviso de teste não chegou: ${r.erro}`, { tipo: r.ok ? 'sucesso' : 'aviso', titulo: r.ok ? 'Funcionou' : 'Não funcionou' });
    } catch (e) { erro(e); } finally { botao.disabled = false; botao.textContent = t; }
  }

  $('itgNovaChave').addEventListener('click', () => {
    abrirModal('🔑 Nova chave de API', `
      <div class="campo"><label for="itgKNome">Nome (para saber quem usa)</label><input id="itgKNome" class="cte-entrada" placeholder="Ex.: ERP Bapx" maxlength="80" /></div>
      <div style="margin:10px 0;"><label style="display:block; margin-bottom:4px;">O que a chave pode fazer</label>
        ${Object.entries(dados?.escopos || {}).map(([k, v]) => `<label style="display:flex; gap:8px; align-items:center; margin:4px 0;"><input type="checkbox" data-itg-escopo="${k}" ${k === 'ler' ? 'checked' : ''} /> ${esc(v)}</label>`).join('')}</div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;"><button class="btn btn-secundario" data-itg-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="itgKOk" style="width:auto;">Criar chave</button></div>`);
    $('itgKNome').focus();
    $('itgKOk').addEventListener('click', async () => {
      try {
        const escopos = [...document.querySelectorAll('[data-itg-escopo]:checked')].map((x) => x.dataset.itgEscopo);
        const r = await enviar('/api/integracao/chaves', 'POST', { nome: $('itgKNome').value, escopos });
        mostrarSegredo('🔑 Chave criada', `Chave de API — ${esc(r.nome)}`, r.chave, 'Passe esta chave para o ERP (no cabeçalho <code>Authorization: Bearer …</code>).');
        recarregar();
      } catch (e) { erro(e); }
    });
  });

  function formWebhook(w = null) {
    const ev = dados?.eventos || {};
    const marcados = w ? w.eventos : ['*'];
    abrirModal(w ? '✏️ Webhook' : '📣 Novo webhook', `
      <div class="campo"><label for="itgWNome">Nome</label><input id="itgWNome" class="cte-entrada" value="${esc(w?.nome || '')}" placeholder="Ex.: ERP Bapx" maxlength="80" /></div>
      <div class="campo" style="margin-top:8px;"><label for="itgWUrl">Endereço que o ERP deu para receber os avisos</label><input id="itgWUrl" class="cte-entrada" value="${esc(w?.url || '')}" placeholder="https://erp.suaempresa.com.br/nexofrete/webhook" maxlength="500" />
        <small style="color:var(--texto-fraco);">${dados?.rede_interna ? 'Aceita também endereço da rede interna (http://).' : 'Precisa ser https:// e público (endereços da rede interna são recusados por segurança).'}</small></div>
      <div style="margin:10px 0;"><label style="display:block; margin-bottom:4px;">Avisar quando</label>
        <label style="display:flex; gap:8px; align-items:center; margin:4px 0;"><input type="checkbox" id="itgWTodos" ${marcados.includes('*') ? 'checked' : ''} /> <b>Todos os eventos</b> (inclusive os que vierem em versões futuras)</label>
        <div id="itgWLista" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:2px 10px; padding-left:22px;">
        ${Object.entries(ev).map(([k, v]) => `<label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" data-itg-ev="${k}" ${marcados.includes('*') || marcados.includes(k) ? 'checked' : ''} /> ${esc(v)}</label>`).join('')}</div></div>
      ${w ? `<label style="display:flex; gap:8px; align-items:center; margin:8px 0;"><input type="checkbox" id="itgWAtivo" ${w.ativo ? 'checked' : ''} /> Ligado</label>` : ''}
      <div style="display:flex; justify-content:space-between; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <div style="display:flex; gap:8px;">${w ? `<button class="btn btn-secundario" id="itgWSegredo" style="width:auto;">🔁 Novo segredo</button><button class="btn btn-secundario" id="itgWExcluir" style="width:auto; color:var(--vermelho);">Excluir</button>` : ''}</div>
        <div style="display:flex; gap:8px;"><button class="btn btn-secundario" data-itg-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="itgWOk" style="width:auto;">Salvar</button></div></div>`);
    const todos = $('itgWTodos');
    const sincronizar = () => document.querySelectorAll('[data-itg-ev]').forEach((x) => { x.disabled = todos.checked; if (todos.checked) x.checked = true; });
    todos.addEventListener('change', sincronizar); sincronizar();
    $('itgWOk').addEventListener('click', async () => {
      try {
        const eventos = todos.checked ? ['*'] : [...document.querySelectorAll('[data-itg-ev]:checked')].map((x) => x.dataset.itgEv);
        const corpo = { nome: $('itgWNome').value, url: $('itgWUrl').value, eventos };
        if (w) {
          await enviar(`/api/integracao/webhooks/${w.id}`, 'PUT', { ...corpo, ativo: $('itgWAtivo').checked });
          fechar(); recarregar();
        } else {
          const r = await enviar('/api/integracao/webhooks', 'POST', corpo);
          mostrarSegredo('📣 Webhook criado', 'Segredo da assinatura', r.segredo, 'Passe este segredo para o ERP: com ele o ERP confere que o aviso veio mesmo do Nexofrete (cabeçalho <code>X-Nexofrete-Assinatura</code>).');
          recarregar();
        }
      } catch (e) { erro(e); }
    });
    $('itgWSegredo')?.addEventListener('click', async () => {
      if (!(await confirmar('Gerar um novo segredo? O ERP precisa receber o novo; até lá, ele vai recusar os avisos.', { titulo: 'Novo segredo', textoOk: 'Gerar' }))) return;
      enviar(`/api/integracao/webhooks/${w.id}/segredo`, 'POST').then((r) => mostrarSegredo('🔁 Novo segredo', 'Segredo da assinatura', r.segredo, 'Atualize no ERP.')).catch(erro);
    });
    $('itgWExcluir')?.addEventListener('click', async () => {
      if (!(await confirmar(`Excluir o webhook "${w.nome}"? Os avisos na fila também somem.`, { tipo: 'perigo', titulo: 'Excluir webhook', textoOk: 'Excluir' }))) return;
      enviar(`/api/integracao/webhooks/${w.id}`, 'DELETE').then(() => { fechar(); recarregar(); }).catch(erro);
    });
  }
  $('itgNovoWebhook').addEventListener('click', () => (dados ? Promise.resolve() : carregar()).then(() => formWebhook()).catch(erro));
})();
