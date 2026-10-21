// =====================================================================
// SAC com protocolo: fila de chamados (filtros e prazos), a conversa com o
// cliente (resposta, nota interna), responsável, prioridade, status e o
// CT-e ligado; os indicadores do atendimento e os prazos (SLA).
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navSac');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/sac${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const modal = $('modalSac');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-sac-fechar]')) fechar(); });
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-sac-fechar>✕</span></div>`;
  const COR = { aberto: 'ocorrencia', em_andamento: 'em_transito', aguardando: 'agendada', resolvido: 'entregue', cancelado: 'cancelado' };
  const COR_PRIO = { urgente: '#ef4444', alta: '#d97706', normal: 'var(--texto-fraco)', baixa: 'var(--texto-fraco)' };
  const ICONE = { portal: '🌐', email: '✉', whatsapp: '💬', telefone: '📞', interno: '🏢' };
  const FILTROS = [['abertos', 'Em aberto'], ['meus', 'Meus'], ['sem_responsavel', 'Sem responsável'], ['atrasados', 'Fora do prazo'], ['aguardando', 'Aguardando o cliente'], ['resolvidos', 'Encerrados'], ['todos', 'Todos']];
  const est = { filtro: 'abertos', busca: '' };
  let listas = null;
  let usuarios = null;

  // Prazo que vale agora: a resposta (se ainda não respondeu) ou a solução.
  function prazo(c) {
    if (['resolvido', 'cancelado'].includes(c.status)) return `<span class="sac-prazo">${c.prazo_situacao === 'resolvido_fora' ? 'resolvido fora do prazo' : 'no prazo'}</span>`;
    const resp = !c.respondido_em;
    const alvo = resp ? c.prazo_resposta : c.prazo_solucao;
    const atraso = c.prazo_situacao === 'solucao_atrasada' || c.prazo_situacao === 'resposta_atrasada';
    return `<span class="sac-prazo ${atraso ? 'atraso' : c.prazo_situacao === 'vencendo' ? 'vencendo' : ''}">${resp ? 'responder' : 'resolver'} até ${quando(alvo)}${atraso ? ' · ATRASADO' : ''}</span>`;
  }
  // Na lista: em duas linhas, para caber.
  function prazoLista(c) {
    return prazo(c).replace(/ até /, ' até<br>');
  }

  async function carregar() {
    const [d, ind] = await Promise.all([api(`?filtro=${est.filtro}&busca=${encodeURIComponent(est.busca)}`), api('/indicadores')]);
    listas = d;
    const k = d.contagens;
    const pct = ind.resolvidos_30 ? Math.round((ind.no_prazo_30 / ind.resolvidos_30) * 100) : null;
    $('sacConteudo').innerHTML = `
      <div class="oc-resumo">
        <div>Em aberto<b>${ind.abertos}</b><span>${k.atrasados ? `<b style="display:inline; font-size:inherit; color:#ef4444;">${k.atrasados} fora do prazo</b>` : 'nenhum fora do prazo'}</span></div>
        <div>Tempo da 1ª resposta<b>${ind.horas_resposta != null ? `${String(ind.horas_resposta).replace('.', ',')} h` : '—'}</b><span>média dos últimos 30 dias</span></div>
        <div>Resolvidos no prazo<b>${pct != null ? `${pct}%` : '—'}</b><span>${ind.resolvidos_30} resolvido(s) em 30 dias</span></div>
        <div>Avaliação dos clientes<b>${ind.nota_media != null ? `${String(ind.nota_media).replace('.', ',')} <span class="sac-estrelas">★</span>` : '—'}</b><span>${ind.avaliacoes} avaliação(ões) em 90 dias</span></div>
        <div>Mais pedidos (30 dias)<b style="font-size:14px;">${esc(ind.por_assunto[0]?.nome || '—')}</b><span>${ind.por_assunto.slice(1, 3).map((x) => `${esc(x.nome)} (${x.n})`).join(' · ') || '&nbsp;'}</span></div>
      </div>
      <div class="oc-barra" style="align-items:center;">
        <div class="oc-filtros">${FILTROS.map(([f, t]) => `<button class="oc-filtro ${est.filtro === f ? 'ativo' : ''} ${f === 'atrasados' ? 'perigo' : ''}" data-sac-filtro="${f}">${t}<span class="n">${k[f] ?? 0}</span></button>`).join('')}</div>
        <input type="text" id="sacBusca" class="cte-entrada" placeholder="Protocolo, cliente, e-mail, nº CT-e/NF" value="${esc(est.busca)}" style="max-width:260px;" />
      </div>
      <div class="painel oc-painel"><div class="edi-rolagem">${d.chamados.length ? `<table class="edi-tabela"><thead><tr><th>Protocolo</th><th>Cliente</th><th>Assunto</th><th>Prioridade</th><th>Responsável</th><th>Situação</th><th>Prazo</th></tr></thead><tbody>
        ${d.chamados.map((c) => `<tr data-sac-abrir="${c.id}" style="cursor:pointer;" title="Abrir o chamado">
          <td><b>${esc(c.protocolo)}</b><br><small style="color:var(--texto-fraco);" title="${esc(d.origens[c.origem])}">${ICONE[c.origem] || ''} ${esc(d.origens[c.origem])} · ${quando(c.criado_em)}</small></td>
          <td>${esc(c.cliente_nome || c.contato_nome || c.contato_email || c.contato_fone || '—')}${c.cliente_nome && c.contato_nome ? `<br><small style="color:var(--texto-fraco);">${esc(c.contato_nome)}</small>` : ''}</td>
          <td><b>${esc(c.titulo)}</b><br><small style="color:var(--texto-fraco);">${esc(d.assuntos[c.assunto])}${c.cte_numero ? ` · CT-e ${esc(c.cte_serie)}/${esc(c.cte_numero)}` : c.nf ? ` · NF ${esc(c.nf)}` : ''} · ${c.mensagens} msg</small></td>
          <td><b style="color:${COR_PRIO[c.prioridade]};">${esc(d.prioridades[c.prioridade])}</b></td>
          <td>${c.responsavel_nome ? esc(c.responsavel_nome) : '<small style="color:#d97706;">ninguém</small>'}</td>
          <td><span class="oc-sit ${COR[c.status]}">${esc(d.status[c.status])}</span>${c.ultimo_autor === 'cliente' && !['resolvido', 'cancelado'].includes(c.status) ? '<br><small style="color:var(--azul);">cliente escreveu</small>' : ''}${c.avaliacao ? `<br><small class="sac-estrelas">${'★'.repeat(c.avaliacao)}</small>` : ''}</td>
          <td>${prazoLista(c)}</td></tr>`).join('')}</tbody></table>`
    : `<div class="kanban-vazio">${est.filtro === 'abertos' ? 'Nenhum chamado em aberto. Os chamados chegam pelo portal do cliente, pela caixa de e-mail do SAC e pelo WhatsApp; os de telefone você registra em ＋ Chamado.' : 'Nada aqui.'}</div>`}</div></div>`;
    document.querySelectorAll('[data-sac-filtro]').forEach((b) => b.addEventListener('click', () => { est.filtro = b.dataset.sacFiltro; carregar().catch(erro); }));
    document.querySelectorAll('[data-sac-abrir]').forEach((b) => b.addEventListener('click', () => abrir(Number(b.dataset.sacAbrir)).catch(erro)));
    let tm = null;
    $('sacBusca').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(() => { est.busca = e.target.value.trim(); carregar().then(() => { const x = $('sacBusca'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }).catch(erro); }, 400); });
  }
  nav.addEventListener('click', () => carregar().catch(erro));

  const opcoes = (mapa, atual) => Object.entries(mapa).map(([k, t]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${esc(t)}</option>`).join('');
  async function garantirListas() {
    if (!listas) listas = await api('?filtro=todos&busca=-');
    if (!usuarios) usuarios = await api('/usuarios');
  }

  async function abrir(id) {
    await garantirListas();
    const c = await api(`/${id}`);
    const L = listas;
    const encerrado = ['resolvido', 'cancelado'].includes(c.status);
    modal.classList.remove('oculto');
    $('sacModal').innerHTML = `${cab(`🎧 ${esc(c.protocolo)} — ${esc(c.titulo)}`)}
      <div style="display:grid; grid-template-columns: 1fr 260px; gap:18px;" class="sac-grade">
        <div>
          <div style="font-size:12.5px; color:var(--texto-fraco);">${ICONE[c.origem] || ''} ${esc(L.origens[c.origem])} · aberto em ${quando(c.criado_em)} · ${prazo(c)}</div>
          <div class="sac-conversa">${c.mensagens.map((m) => `<div class="sac-msg ${m.autor === 'sistema' ? 'sistema' : m.interna ? 'interna' : m.autor === 'equipe' ? 'equipe' : ''}">${m.autor === 'sistema' ? `${esc(m.texto)}${m.enviado ? ` (${esc(m.enviado)})` : ''} · ${quando(m.criado_em)}` : `<small>${m.interna ? '🔒 Nota interna · ' : ''}<b>${esc(m.autor_nome || (m.autor === 'cliente' ? 'Cliente' : 'Equipe'))}</b>${m.canal && m.autor === 'cliente' ? ` · ${esc(L.origens[m.canal] || m.canal)}` : ''} · ${quando(m.criado_em)}${m.enviado ? ` · avisado: ${esc(m.enviado)}` : ''}</small>${esc(m.texto)}`}</div>`).join('')}</div>
          ${c.avaliacao ? `<p style="font-size:13px;">Avaliação do cliente: <span class="sac-estrelas">${'★'.repeat(c.avaliacao)}${'☆'.repeat(5 - c.avaliacao)}</span>${c.avaliacao_comentario ? ` — “${esc(c.avaliacao_comentario)}”` : ''}</p>` : ''}
          <div class="campo"><label for="sacTexto">${encerrado ? 'Nota interna (o chamado está encerrado: reabra para responder ao cliente)' : 'Resposta ao cliente'}</label><textarea id="sacTexto" class="cte-entrada" rows="4" placeholder="${encerrado ? 'Só a equipe vê' : 'O cliente recebe por e-mail (e WhatsApp, se veio por lá) e vê no portal'}"></textarea></div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${encerrado ? '' : `<button class="btn btn-primario" data-sac-resp="aguardando" style="width:auto;">Responder</button><button class="btn btn-secundario" data-sac-resp="resolvido" style="width:auto;">Responder e resolver</button>`}
            <button class="btn btn-secundario" data-sac-resp="interna" style="width:auto;">🔒 Nota interna</button>
          </div>
        </div>
        <div>
          <div class="campo"><label for="sacStatus">Situação</label><select id="sacStatus">${opcoes(L.status, c.status)}</select></div>
          <div class="campo"><label for="sacPrio">Prioridade (muda os prazos)</label><select id="sacPrio">${opcoes(L.prioridades, c.prioridade)}</select></div>
          <div class="campo"><label for="sacResp">Responsável</label><select id="sacResp"><option value="">— ninguém —</option>${usuarios.map((u) => `<option value="${u.id}" ${u.id === c.responsavel_id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
          <div class="campo"><label for="sacAssunto">Assunto</label><select id="sacAssunto">${opcoes(L.assuntos, c.assunto)}</select></div>
          <div class="campo"><label for="sacCte">CT-e ligado (nº do CT-e, da NF ou chave)</label><input id="sacCte" class="cte-entrada" value="${esc(c.cte ? c.cte.numero : '')}" placeholder="${c.nf ? `citou: ${esc(c.nf)}` : ''}" /></div>
          ${c.cte ? `<div style="font-size:12px; color:var(--texto-fraco); margin:-8px 0 12px;">CT-e ${esc(c.cte.serie)}/${esc(c.cte.numero)} · ${esc(c.cte.destinatario_nome || '')} · ${esc(c.cte.cidade_fim || '')}/${esc(c.cte.uf_fim || '')}<br>${c.cte.data_entrega ? `entregue em ${quando(c.cte.data_entrega)}${c.cte.recebedor_nome ? ` (${esc(c.cte.recebedor_nome)})` : ''}` : `previsão ${esc(String(c.cte.previsao_entrega || '—').split('-').reverse().join('/'))}`}${c.cte.ultima ? `<br>última: ${esc(c.cte.ultima.descricao)} (${quando(c.cte.ultima.data_hora)})` : ''}</div>` : ''}
          <div style="font-size:12px; color:var(--texto-fraco); margin-bottom:12px;"><b>Cliente:</b> ${esc(c.cliente_nome || '—')}${c.cliente_doc ? ` (${esc(c.cliente_doc)})` : ''}<br><b>Contato:</b> ${esc([c.contato_nome, c.contato_email, c.contato_fone].filter(Boolean).join(' · ') || '—')}</div>
          <button class="btn btn-secundario" id="sacSalvar" style="width:100%;">Salvar alterações</button>
        </div>
      </div>`;
    document.querySelectorAll('[data-sac-resp]').forEach((b) => b.addEventListener('click', async () => {
      const tipo = b.dataset.sacResp;
      const texto = $('sacTexto').value.trim();
      if (!texto) { mostrarAlerta('Escreva a mensagem.', { tipo: 'aviso' }); return; }
      b.disabled = true;
      try {
        const r = await enviar(`/${id}/responder`, 'POST', tipo === 'interna' ? { texto, interna: true } : { texto, status: tipo });
        if (tipo !== 'interna') mostrarAlerta(r.enviado ? `Resposta registrada. Cliente avisado: ${r.enviado}.` : 'Resposta registrada. O cliente vê no portal (sem e-mail/WhatsApp de contato para avisar).', { tipo: r.enviado && /não enviado/.test(r.enviado) ? 'aviso' : 'sucesso' });
        await abrir(id); carregar().catch(() => {});
      } catch (err) { b.disabled = false; erro(err); }
    }));
    $('sacSalvar').addEventListener('click', async () => {
      const corpo = { status: $('sacStatus').value, prioridade: $('sacPrio').value, assunto: $('sacAssunto').value };
      if (String(c.responsavel_id || '') !== $('sacResp').value) corpo.responsavel_id = $('sacResp').value;
      if (String(c.cte?.numero || '') !== $('sacCte').value.trim()) corpo.cte = $('sacCte').value.trim();
      if (corpo.status === 'cancelado' && c.status !== 'cancelado' && !await confirmar('Cancelar o chamado? Use para chamado aberto por engano ou repetido.', { textoOk: 'Cancelar chamado' })) return;
      try { await enviar(`/${id}`, 'PUT', corpo); mostrarAlerta('Chamado atualizado.', { tipo: 'sucesso' }); await abrir(id); carregar().catch(() => {}); } catch (err) { erro(err); }
    });
  }

  // Registrar um chamado que chegou por telefone (ou aberto pela equipe).
  $('sacNovo').addEventListener('click', async () => {
    try { await garantirListas(); } catch (err) { erro(err); return; }
    const L = listas;
    const campo = (id, rotulo, extra = '', classe = '') => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" ${extra} /></div>`;
    modal.classList.remove('oculto');
    $('sacModal').innerHTML = `${cab('＋ Novo chamado')}
      <div class="oc-form">
        <div class="campo"><label for="snOrigem">Como chegou</label><select id="snOrigem"><option value="telefone">📞 Telefone</option><option value="interno">🏢 Aberto pela equipe</option></select></div>
        <div class="campo"><label for="snAssunto">Assunto</label><select id="snAssunto">${opcoes(L.assuntos, 'atraso')}</select></div>
        ${campo('snCte', 'CT-e (nº do CT-e, da NF ou chave)', 'placeholder="Traz o cliente sozinho"')}
        <div class="campo"><label for="snPrio">Prioridade</label><select id="snPrio"><option value="">Pelo assunto</option>${opcoes(L.prioridades, '')}</select></div>
        ${campo('snDoc', 'CNPJ/CPF do cliente', 'placeholder="Se não tiver CT-e"')}${campo('snNome', 'Contato (quem falou)')}
        ${campo('snEmail', 'E-mail do contato', 'placeholder="Recebe o protocolo e as respostas"')}${campo('snFone', 'Telefone / WhatsApp')}
        ${campo('snTitulo', 'Título', 'placeholder="Em branco: o começo do relato"', 'inteiro')}
        <div class="campo inteiro"><label for="snTexto">O que o cliente disse</label><textarea id="snTexto" class="cte-entrada" rows="4"></textarea></div>
      </div>
      <label class="ag-check" style="margin-bottom:12px;"><input type="checkbox" id="snAssumir" checked /> Eu fico responsável</label>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-sac-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="snSalvar" style="width:auto;">Abrir chamado</button></div>`;
    $('snSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const ch = await enviar('', 'POST', { origem: $('snOrigem').value, assunto: $('snAssunto').value, prioridade: $('snPrio').value || null, cte: $('snCte').value, cliente_doc: $('snDoc').value,
          contato_nome: $('snNome').value, contato_email: $('snEmail').value, contato_fone: $('snFone').value, titulo: $('snTitulo').value, texto: $('snTexto').value, assumir: $('snAssumir').checked });
        mostrarAlerta(`Chamado aberto: protocolo ${ch.protocolo}. Passe o número ao cliente.`, { tipo: 'sucesso', titulo: 'Protocolo' });
        carregar().catch(() => {});
        await abrir(ch.id);
      } catch (err) { b.disabled = false; erro(err); }
    });
  });

  // Prazos (SLA) por prioridade e os avisos.
  $('sacConfig').addEventListener('click', async () => {
    let c;
    try { c = await api('/config'); } catch (err) { erro(err); return; }
    const P = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
    modal.classList.remove('oculto');
    $('sacModal').innerHTML = `${cab('⚙ Prazos e avisos do SAC')}
      <p class="edi-dica">Prazos em horas corridas a partir da abertura. A prioridade vem do assunto (atraso, avaria e reclamação: alta) e pode ser mudada no chamado.</p>
      <table class="edi-tabela" style="max-width:520px;"><thead><tr><th>Prioridade</th><th>1ª resposta (h)</th><th>Solução (h)</th></tr></thead><tbody>
        ${Object.entries(P).map(([k, t]) => `<tr><td><b>${t}</b></td><td><input class="cte-entrada" data-sla="${k}:resposta" value="${c.sla[k].resposta}" style="max-width:90px;" /></td><td><input class="cte-entrada" data-sla="${k}:solucao" value="${c.sla[k].solucao}" style="max-width:90px;" /></td></tr>`).join('')}</tbody></table>
      <div class="oc-form" style="margin-top:14px;">
        <div class="campo"><label for="scResp">Responder para (e-mail da caixa do SAC)</label><input id="scResp" class="cte-entrada" value="${esc(c.email_resposta)}" placeholder="sac@suaempresa.com.br" /></div>
        <div class="campo"><label for="scEquipe">Avisar a equipe de chamado novo</label><input id="scEquipe" class="cte-entrada" value="${esc(c.equipe_email)}" placeholder="e-mail da equipe (opcional)" /></div>
      </div>
      <label class="ag-check"><input type="checkbox" id="scEmail" ${c.avisar_email ? 'checked' : ''} /> Avisar o cliente por e-mail (protocolo e cada resposta)</label><br>
      <label class="ag-check"><input type="checkbox" id="scZap" ${c.avisar_whatsapp ? 'checked' : ''} /> Responder pelo WhatsApp os chamados que chegaram por lá</label>
      <p class="edi-dica" style="margin-top:12px;"><b>E-mail:</b> cadastre a caixa do SAC em Manutenção → Leitura automática de e-mail, com "Chamados do SAC". Cada e-mail novo abre um chamado; a resposta com [SAC protocolo] no assunto entra no mesmo chamado.<br>
      <b>WhatsApp:</b> no painel da Twilio, em "A message comes in", ponha o endereço público da empresa (o mesmo do rastreio) seguido de <code>/api/sac/whatsapp</code>. O mesmo número do WhatsApp responde o cliente.</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-sac-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="scSalvar" style="width:auto;">Salvar</button></div>`;
    $('scSalvar').addEventListener('click', async () => {
      const sla = {};
      document.querySelectorAll('[data-sla]').forEach((i) => { const [p, t] = i.dataset.sla.split(':'); (sla[p] = sla[p] || {})[t] = i.value; });
      try { await enviar('/config', 'PUT', { sla, email_resposta: $('scResp').value, equipe_email: $('scEquipe').value, avisar_email: $('scEmail').checked, avisar_whatsapp: $('scZap').checked }); fechar(); mostrarAlerta('Prazos e avisos salvos.', { tipo: 'sucesso' }); } catch (err) { erro(err); }
    });
  });
})();
