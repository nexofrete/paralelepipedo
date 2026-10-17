// =====================================================================
// Régua de cobrança (aba do Faturamento): o que sai hoje, configuração das
// etapas e dos canais, clientes com exceção e histórico dos envios.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const quando = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const docFmt = (v) => Doc.formatar(v);
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (c, o = {}) => {
    const r = await apiFetch(`/api/regua${c}`, { ...o, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const financeiro = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const etapaNome = (d) => (d == null ? 'avulso' : d < 0 ? `${-d} dia(s) antes` : d === 0 ? 'no dia' : `${d} dia(s) depois`);
  const ACAO = {
    enviar: ['Sai hoje', 'em_transito'], sem_contato: ['Sem contato', 'cancelado'], pausada: ['Pausada', 'pendente'], ja_enviada: ['Já enviada', 'entregue'],
    aguardar: ['Aguardando', ''], fora_da_janela: ['Fora da janela', ''],
  };
  const STATUS = { enviado: ['Enviado', 'entregue'], erro: ['Erro', 'cancelado'], sem_contato: ['Sem contato', 'pendente'] };
  const CANAL = { email: '✉ E-mail', whatsapp: '💬 WhatsApp', nenhum: '—' };
  let parte = 'hoje'; let ctx = {};

  window.telaRegua = async (el, opcoes = {}) => {
    ctx = { el, ...opcoes };
    const [cfg, prev] = await Promise.all([api('/config'), api('/previa')]);
    ctx.cfg = cfg; ctx.prev = prev;
    const r = cfg.ultimo_resumo;
    el.innerHTML = `
      <div class="painel" style="padding:14px 18px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div><div style="font-weight:700; font-size:15px;">${cfg.ativo ? '🟢 Régua ligada' : '⚪ Régua desligada'}</div>
          <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:2px;">${cfg.ativo
    ? `Todo dia a partir das ${cfg.hora}h, por ${[cfg.email && 'e-mail', cfg.whatsapp && 'WhatsApp'].filter(Boolean).join(' e ')}. ${r ? `Última vez: ${quando(r.em)} — ${r.enviados} enviado(s)${r.erros ? `, ${r.erros} erro(s)` : ''}${r.sem_contato ? `, ${r.sem_contato} sem contato` : ''}.` : 'Ainda não rodou.'}`
    : 'Ligue em Configuração. Enquanto isso, dá para mandar lembretes à mão pela lista abaixo.'}</div></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">${financeiro && prev.resumo.enviar ? `<button class="btn btn-primario" id="rgRodar" style="width:auto;">▶ Mandar os ${prev.resumo.enviar} de hoje agora</button>` : ''}</div>
      </div>
      ${prev.whatsapp_desligado ? '<div class="cte-aviso" style="margin-bottom:12px;">O canal WhatsApp está marcado, mas o WhatsApp não está configurado (Manutenção → WhatsApp). Por enquanto vai só e-mail.</div>' : ''}
      <div class="oc-filtros" style="margin-bottom:12px;">${[['hoje', `Hoje (${prev.resumo.enviar})`], ['config', 'Configuração'], ['clientes', 'Clientes com exceção'], ['historico', 'Histórico']]
    .map(([k, t]) => `<button class="oc-filtro ${parte === k ? 'ativo' : ''}" data-rg-parte="${k}">${t}</button>`).join('')}</div>
      <div id="rgParte"></div>`;
    el.querySelectorAll('[data-rg-parte]').forEach((b) => b.addEventListener('click', () => { parte = b.dataset.rgParte; window.telaRegua(el, opcoes).catch(erro); }));
    el.querySelector('#rgRodar')?.addEventListener('click', async (ev) => {
      if (!await confirmar(`Mandar agora os lembretes de hoje (${prev.resumo.enviar} fatura(s))?`, { textoOk: 'Mandar' })) return;
      ev.currentTarget.disabled = true;
      try {
        const x = await enviar('/executar', 'POST');
        mostrarAlerta(`${x.enviados} lembrete(s) enviado(s)${x.erros ? `, ${x.erros} com erro (veja o Histórico)` : ''}${x.sem_contato ? `, ${x.sem_contato} fatura(s) sem contato` : ''}.`, { tipo: x.erros ? 'aviso' : 'sucesso' });
      } catch (e) { erro(e); }
      window.telaRegua(el, opcoes).catch(erro);
    });
    await ({ hoje: parteHoje, config: parteConfig, clientes: parteClientes, historico: parteHistorico }[parte])();
  };
  const recarregar = () => window.telaRegua(ctx.el, ctx).catch(erro);

  // ---------- Hoje ----------
  async function parteHoje() {
    const p = ctx.prev;
    const ordem = { enviar: 0, sem_contato: 1, pausada: 2, ja_enviada: 3, aguardar: 4, fora_da_janela: 5 };
    const lista = [...p.faturas].sort((a, b) => ordem[a.acao] - ordem[b.acao] || a.atraso - b.atraso);
    ctx.el.querySelector('#rgParte').innerHTML = `
      <div class="oc-resumo">
        <div>Saem hoje<b>${p.resumo.enviar}</b><span>lembrete(s) de cobrança</span></div>
        <div>Sem contato<b style="${p.resumo.sem_contato ? 'color:var(--vermelho);' : ''}">${p.resumo.sem_contato}</b><span>cadastre o e-mail/celular</span></div>
        <div>Pausadas<b>${p.resumo.pausadas}</b><span>cliente pausado ou pagamento prometido</span></div>
        <div>Em aberto<b>${p.faturas.length}</b><span>${brl(p.faturas.reduce((s, f) => s + f.saldo, 0))}</span></div>
      </div>
      <div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Fatura</th><th>Cliente</th><th>Vencimento</th><th class="n">Saldo</th><th>Etapa</th><th>Hoje</th><th>Para</th><th></th></tr></thead><tbody>
        ${lista.map((f) => `<tr><td><a href="#" class="rg-link" data-rg-fatura="${f.fatura_id}">${f.numero}</a></td><td>${esc(f.cliente)}<br><small style="color:var(--texto-fraco);">${docFmt(f.doc)}</small></td>
          <td>${dia(f.vencimento)}<br><small style="${f.atraso > 0 ? 'color:var(--vermelho);' : 'color:var(--texto-fraco);'}">${f.atraso > 0 ? `${f.atraso} dia(s) vencida` : f.atraso === 0 ? 'vence hoje' : `faltam ${-f.atraso} dia(s)`}</small></td>
          <td class="n">${brl(f.saldo)}</td><td>${f.etapa != null ? etapaNome(f.etapa) : '—'}</td>
          <td><span class="oc-sit ${ACAO[f.acao][1]}">${ACAO[f.acao][0]}</span>${f.motivo ? `<br><small style="color:var(--texto-fraco);">${esc(f.motivo)}</small>` : ''}</td>
          <td style="white-space:normal; font-size:12.5px;">${(f.canais || []).map((c) => `${CANAL[c.canal]} ${esc(c.destino || '')}`).join('<br>')}</td>
          <td><button class="btn btn-secundario" data-rg-enviar="${f.fatura_id}" style="width:auto; padding:3px 8px; font-size:12px;" title="Mandar um lembrete agora">✉ Lembrar</button></td></tr>`).join('')
          || '<tr><td colspan="8" style="color:var(--texto-fraco);">Nenhuma fatura em aberto.</td></tr>'}
      </tbody></table></div></div>`;
    ctx.el.querySelectorAll('[data-rg-fatura]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); ctx.abrirFatura?.(Number(a.dataset.rgFatura)); }));
    ctx.el.querySelectorAll('[data-rg-enviar]').forEach((b) => b.addEventListener('click', () => lembrarAgora(Number(b.dataset.rgEnviar), recarregar)));
  }

  // Envio na hora (usado aqui e no detalhe da fatura).
  async function lembrarAgora(faturaId, depois) {
    const canal = ctx.cfg?.whatsapp ? await escolherCanal() : 'email';
    if (!canal) return;
    try {
      const r = await enviar(`/faturas/${faturaId}/enviar`, 'POST', { canal });
      mostrarAlerta(`Lembrete da fatura ${r.numero} enviado por ${r.canal === 'whatsapp' ? 'WhatsApp' : 'e-mail'} para ${r.destino}.`, { tipo: 'sucesso' });
      depois?.();
    } catch (e) {
      // Sem contato: pergunta e manda para o informado.
      if (/não tem (e-mail|celular)/.test(e.message)) {
        const destino = await pedirTexto(e.message.replace('Informe o', 'Para qual').replace('Informe o número.', 'Para qual número?'), { titulo: 'Mandar lembrete', textoOk: 'Mandar' });
        if (!destino) return;
        try { const r = await enviar(`/faturas/${faturaId}/enviar`, 'POST', { canal, destino }); mostrarAlerta(`Lembrete da fatura ${r.numero} enviado para ${r.destino}.`, { tipo: 'sucesso' }); depois?.(); } catch (e2) { erro(e2); }
      } else erro(e);
    }
  }
  // Por qual canal mandar (fechar a janela = não manda).
  function escolherCanal() {
    return new Promise((resolve) => {
      const fundo = document.createElement('div');
      fundo.className = 'modal-overlay';
      fundo.innerHTML = `<div class="painel modal-card" style="max-width:380px; width:100%; padding:22px 24px; text-align:center;">
        <h3 style="margin:0 0 14px;">Mandar o lembrete por</h3>
        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn-primario" data-canal="email" style="width:auto;">✉ E-mail</button><button class="btn btn-primario" data-canal="whatsapp" style="width:auto;">💬 WhatsApp</button>
          <button class="btn btn-secundario" data-canal="" style="width:auto;">Cancelar</button></div></div>`;
      document.body.appendChild(fundo);
      fundo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-canal]');
        if (b || e.target === fundo) { fundo.remove(); resolve(b ? b.dataset.canal || null : null); }
      });
    });
  }
  window.reguaLembrarAgora = lembrarAgora;

  // ---------- Configuração ----------
  async function parteConfig() {
    const c = ctx.cfg;
    const linhaEtapa = (e, i) => `<div class="painel rg-etapa" data-i="${i}" style="padding:12px 14px; margin-bottom:10px;">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
        <label style="display:flex; gap:6px; align-items:center; font-size:13px;"><input type="checkbox" class="rg-ativo" ${e.ativo ? 'checked' : ''} ${financeiro ? '' : 'disabled'} /> Ativa</label>
        <label style="font-size:13px; display:flex; gap:6px; align-items:center;">Dias em relação ao vencimento <input type="number" class="cte-entrada rg-dias" value="${e.dias}" min="-30" max="120" style="width:80px; padding:5px 8px;" ${financeiro ? '' : 'disabled'} /></label>
        <span class="rg-quando" style="font-size:12.5px; color:var(--texto-fraco);">${etapaNome(e.dias)}</span>
        ${financeiro ? '<button class="btn btn-secundario rg-tirar" style="width:auto; padding:3px 8px; font-size:12px; margin-left:auto;">Tirar</button>' : ''}</div>
      <input class="cte-entrada rg-titulo" value="${esc(e.titulo)}" maxlength="120" placeholder="Assunto" style="margin-bottom:6px;" ${financeiro ? '' : 'disabled'} />
      <textarea class="cte-entrada rg-texto" rows="3" maxlength="1000" placeholder="Mensagem" ${financeiro ? '' : 'disabled'}>${esc(e.texto)}</textarea></div>`;
    ctx.el.querySelector('#rgParte').innerHTML = `
      <div style="display:grid; grid-template-columns:minmax(280px, 380px) minmax(0, 1fr); gap:14px; align-items:start;" class="rg-grade">
        <div class="painel" style="padding:16px 18px;">
          <label style="display:flex; gap:8px; align-items:center; font-weight:600; margin-bottom:12px;"><input type="checkbox" id="rgLigada" ${c.ativo ? 'checked' : ''} /> Régua ligada</label>
          <div style="font-size:13px; margin-bottom:6px;">Canais</div>
          <label style="display:flex; gap:8px; align-items:center; font-size:13.5px;"><input type="checkbox" id="rgEmail" ${c.email ? 'checked' : ''} /> E-mail (com a fatura, o boleto e o PIX)</label>
          <label style="display:flex; gap:8px; align-items:center; font-size:13.5px; margin-bottom:10px;"><input type="checkbox" id="rgWhats" ${c.whatsapp ? 'checked' : ''} /> WhatsApp (com o PIX copia e cola)</label>
          <div class="campo"><label for="rgHora">Manda a partir das</label><select id="rgHora" class="cte-entrada">${Array.from({ length: 15 }, (_, i) => i + 6).map((h) => `<option value="${h}" ${c.hora === h ? 'selected' : ''}>${h}h</option>`).join('')}</select></div>
          <div class="campo"><label for="rgJanela">Etapa perdida ainda vai até (dias)</label><input id="rgJanela" type="number" min="1" max="30" class="cte-entrada" value="${c.janela}" /></div>
          <div class="campo"><label for="rgCopia">Cópia dos e-mails para (opcional)</label><input id="rgCopia" class="cte-entrada" value="${esc(c.copia || '')}" placeholder="financeiro@suaempresa.com.br" /></div>
          <p style="font-size:12px; color:var(--texto-fraco); line-height:1.5; margin:8px 0 0;">Cada etapa vai uma vez por fatura e canal, e para quando a fatura é paga (baixa, retorno do boleto ou conciliação do extrato). Lembrete de "antes do vencimento" não sai depois que a fatura venceu.</p>
          ${financeiro ? '<button class="btn btn-primario" id="rgSalvar" style="width:auto; margin-top:12px;">Salvar</button>' : ''}
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;"><h4 style="margin:0;">Etapas e mensagens</h4>
            ${financeiro ? '<div style="display:flex; gap:8px;"><button class="btn btn-secundario" id="rgPadrao" style="width:auto;">Voltar ao padrão</button><button class="btn btn-secundario" id="rgNova" style="width:auto;">＋ Etapa</button></div>' : ''}</div>
          <p style="font-size:12px; color:var(--texto-fraco); margin:0 0 10px;">Variáveis: {cliente} {fatura} {valor} {vencimento} {quando} ("vence amanhã", "venceu há 5 dias") {dias} {empresa} {contato}.</p>
          <div id="rgEtapas">${c.etapas.map(linhaEtapa).join('')}</div>
        </div>
      </div>`;
    const el = ctx.el;
    const ligarEtapas = () => el.querySelectorAll('.rg-etapa').forEach((box) => {
      box.querySelector('.rg-tirar')?.addEventListener('click', () => box.remove());
      box.querySelector('.rg-dias').addEventListener('input', (e) => { box.querySelector('.rg-quando').textContent = etapaNome(parseInt(e.target.value, 10) || 0); });
    });
    ligarEtapas();
    el.querySelector('#rgNova')?.addEventListener('click', () => {
      el.querySelector('#rgEtapas').insertAdjacentHTML('beforeend', linhaEtapa({ dias: 20, ativo: true, titulo: 'Fatura vencida há {dias} dias', texto: 'Olá, {cliente}. A fatura {fatura}, de {valor}, {quando}. Fale com a gente: {contato}.' }, Date.now()));
      ligarEtapas();
    });
    el.querySelector('#rgPadrao')?.addEventListener('click', () => { el.querySelector('#rgEtapas').innerHTML = c.padrao.map(linhaEtapa).join(''); ligarEtapas(); });
    el.querySelector('#rgSalvar')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      const etapas = [...el.querySelectorAll('.rg-etapa')].map((box) => ({ dias: box.querySelector('.rg-dias').value, ativo: box.querySelector('.rg-ativo').checked, titulo: box.querySelector('.rg-titulo').value, texto: box.querySelector('.rg-texto').value }));
      try {
        const r = await enviar('/config', 'PUT', { ativo: el.querySelector('#rgLigada').checked, email: el.querySelector('#rgEmail').checked, whatsapp: el.querySelector('#rgWhats').checked,
          hora: el.querySelector('#rgHora').value, janela: el.querySelector('#rgJanela').value, copia: el.querySelector('#rgCopia').value, etapas });
        mostrarAlerta(r.ativo ? `Régua ligada: lembretes a partir das ${r.hora}h.` : 'Salvo. A régua está desligada.', { tipo: 'sucesso' });
        recarregar();
      } catch (e) { erro(e); b.disabled = false; }
    });
  }

  // ---------- Clientes com exceção ----------
  async function parteClientes() {
    const lista = await api('/clientes');
    ctx.el.querySelector('#rgParte').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <span style="font-size:12.5px; color:var(--texto-fraco);">Cliente com acordo, que paga por outro meio ou com e-mail/WhatsApp próprio do financeiro.</span>
        ${financeiro ? '<button class="btn btn-secundario" id="rgCliNovo" style="width:auto;">＋ Exceção de cliente</button>' : ''}</div>
      <div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Cliente</th><th>Cobrança</th><th>E-mail de cobrança</th><th>WhatsApp de cobrança</th><th></th></tr></thead><tbody>
        ${lista.map((c) => `<tr><td>${esc(c.nome || '')}<br><small style="color:var(--texto-fraco);">${docFmt(c.documento)}</small></td>
          <td>${c.cobranca_pausada ? `<span class="oc-sit pendente">Pausada</span>${c.cobranca_motivo ? `<br><small>${esc(c.cobranca_motivo)}</small>` : ''}` : '<span class="oc-sit entregue">Ativa</span>'}</td>
          <td>${esc(c.cobranca_email || '—')}</td><td>${esc(c.cobranca_whatsapp || '—')}</td>
          <td>${financeiro ? `<button class="btn btn-secundario" data-rg-cli="${c.documento}" style="width:auto; padding:3px 8px; font-size:12px;">Editar</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="5" style="color:var(--texto-fraco);">Nenhuma exceção: todos os clientes recebem a régua, no e-mail da fatura.</td></tr>'}
      </tbody></table></div></div>`;
    ctx.el.querySelector('#rgCliNovo')?.addEventListener('click', () => formCliente());
    ctx.el.querySelectorAll('[data-rg-cli]').forEach((b) => b.addEventListener('click', () => formCliente(lista.find((c) => c.documento === b.dataset.rgCli))));
  }

  function formCliente(c = null) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:520px; width:100%; padding:22px 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"><h3 style="margin:0;">${c ? `Cobrança de ${esc(c.nome || docFmt(c.documento))}` : 'Exceção de cliente'}</h3><span style="cursor:pointer; font-size:18px;" data-rg-fechar>✕</span></div>
      <div class="campo"><label for="rgCDoc">CNPJ/CPF</label><input id="rgCDoc" class="cte-entrada" value="${esc(c ? docFmt(c.documento) : '')}" ${c ? 'disabled' : ''} /></div>
      ${c ? '' : '<div class="campo"><label for="rgCNome">Nome</label><input id="rgCNome" class="cte-entrada" maxlength="200" /></div>'}
      <label style="display:flex; gap:8px; align-items:center; font-size:13.5px; margin:6px 0 10px;"><input type="checkbox" id="rgCPausa" ${c?.cobranca_pausada ? 'checked' : ''} /> Não mandar a régua para este cliente</label>
      <div class="campo"><label for="rgCMotivo">Motivo (aparece na prévia)</label><input id="rgCMotivo" class="cte-entrada" maxlength="200" value="${esc(c?.cobranca_motivo || '')}" placeholder="ex.: acordo de pagamento mensal" /></div>
      <div class="campo"><label for="rgCEmail">E-mail de cobrança (em vez do e-mail da fatura)</label><input id="rgCEmail" class="cte-entrada" value="${esc(c?.cobranca_email || '')}" placeholder="contas.pagar@cliente.com.br" /></div>
      <div class="campo"><label for="rgCWhats">WhatsApp de cobrança</label><input id="rgCWhats" class="cte-entrada" value="${esc(c?.cobranca_whatsapp || '')}" placeholder="(11) 98765-4321" /></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" data-rg-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="rgCOk" style="width:auto;">Salvar</button></div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-rg-fechar]')) fechar(); });
    fundo.querySelector('#rgCOk').addEventListener('click', async () => {
      const doc = (c?.documento || fundo.querySelector('#rgCDoc').value).replace(/\D/g, '');
      try {
        await enviar(`/clientes/${doc}`, 'PUT', { nome: fundo.querySelector('#rgCNome')?.value, cobranca_pausada: fundo.querySelector('#rgCPausa').checked, cobranca_motivo: fundo.querySelector('#rgCMotivo').value,
          cobranca_email: fundo.querySelector('#rgCEmail').value, cobranca_whatsapp: fundo.querySelector('#rgCWhats').value });
        fechar(); recarregar();
      } catch (e) { erro(e); }
    });
  }

  // ---------- Histórico ----------
  async function parteHistorico() {
    const lista = await api('/historico?limite=200');
    ctx.el.querySelector('#rgParte').innerHTML = `<div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Quando</th><th>Fatura</th><th>Cliente</th><th>Etapa</th><th>Canal</th><th>Para</th><th>Situação</th><th>Por</th></tr></thead><tbody>
      ${lista.map((h) => `<tr><td>${quando(h.enviado_em)}</td><td><a href="#" class="rg-link" data-rg-fatura="${h.fatura_id}">${h.numero}</a></td><td>${esc(h.tomador_nome || '')}</td><td>${etapaNome(h.etapa)}${h.automatico ? '' : ' <small>(à mão)</small>'}</td>
        <td>${CANAL[h.canal] || h.canal}</td><td>${esc(h.destino || '')}</td><td><span class="oc-sit ${STATUS[h.status]?.[1] || ''}">${STATUS[h.status]?.[0] || h.status}</span>${h.erro ? `<br><small style="color:var(--texto-fraco);">${esc(h.erro)}</small>` : ''}</td>
        <td><small>${esc(h.usuario_nome || '')}</small></td></tr>`).join('') || '<tr><td colspan="8" style="color:var(--texto-fraco);">Nenhum envio ainda.</td></tr>'}
    </tbody></table></div></div>`;
    ctx.el.querySelectorAll('[data-rg-fatura]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); ctx.abrirFatura?.(Number(a.dataset.rgFatura)); }));
  }

  // ---------- Seção "Cobrança" no detalhe da fatura ----------
  window.reguaNaFatura = async (caixa, f, depois) => {
    if (!caixa || !['aberta', 'parcial'].includes(f.status)) { if (caixa) caixa.innerHTML = ''; return; }
    let hist = []; let cfg = null;
    try { [hist, cfg] = await Promise.all([api(`/historico?fatura=${f.id}`), api('/config')]); } catch { return; }
    ctx.cfg = cfg;
    const ate = f.cobranca_pausada_ate ? String(f.cobranca_pausada_ate).slice(0, 10) : '';
    caixa.innerHTML = `<div class="cte-secao"><h4>📣 Cobrança</h4>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
        <button class="btn btn-secundario" id="rgFLembrar" style="width:auto;">✉ Mandar lembrete agora</button>
        <span style="font-size:13px;">Pagamento prometido até</span><input type="date" id="rgFAte" class="cte-entrada" style="width:auto; padding:5px 8px;" value="${ate}" />
        <input id="rgFMotivo" class="cte-entrada" style="width:220px; padding:5px 8px;" maxlength="200" placeholder="o que o cliente disse" value="${esc(f.cobranca_motivo || '')}" />
        <button class="btn btn-secundario" id="rgFPausar" style="width:auto;">${ate ? 'Atualizar' : 'Pausar a régua'}</button>
        ${ate ? '<button class="btn btn-secundario" id="rgFRetomar" style="width:auto;">Retomar</button>' : ''}</div>
      <div style="font-size:12.5px; color:var(--texto-fraco); margin-bottom:6px;">${cfg.ativo ? 'A régua está ligada.' : 'A régua está desligada (Faturamento → Régua de cobrança).'}${ate ? ` Pausada até ${dia(ate)}.` : ''}</div>
      ${hist.length ? `<table class="edi-tabela"><tbody>${hist.map((h) => `<tr><td>${quando(h.enviado_em)}</td><td>${etapaNome(h.etapa)}${h.automatico ? '' : ' (à mão)'}</td><td>${CANAL[h.canal] || h.canal}</td><td>${esc(h.destino || '')}</td>
        <td><span class="oc-sit ${STATUS[h.status]?.[1] || ''}">${STATUS[h.status]?.[0] || h.status}</span>${h.erro ? ` <small>${esc(h.erro)}</small>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div style="font-size:12.5px; color:var(--texto-fraco);">Nenhum lembrete enviado ainda.</div>'}</div>`;
    caixa.querySelector('#rgFLembrar').addEventListener('click', () => lembrarAgora(f.id, depois));
    const pausar = async (data) => {
      try { await enviar(`/faturas/${f.id}/pausa`, 'PUT', { ate: data, motivo: caixa.querySelector('#rgFMotivo').value }); depois?.(); } catch (e) { erro(e); }
    };
    caixa.querySelector('#rgFPausar').addEventListener('click', () => { const d = caixa.querySelector('#rgFAte').value; if (!d) { mostrarAlerta('Escolha até quando o cliente prometeu pagar.', { tipo: 'aviso' }); return; } pausar(d); });
    caixa.querySelector('#rgFRetomar')?.addEventListener('click', () => pausar(null));
  };
})();
