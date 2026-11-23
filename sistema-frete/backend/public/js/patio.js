// =====================================================================
// 🚧 Pátio e portaria (embarcador; regras em src/patio.js): painel em tempo real (docas, fila com a previsão,
// próximas chegadas), portaria (check-in pelo QR Code com leitor ou câmera, pela placa ou sem agendamento),
// agendamentos (janela, notas, QR Code e link para o motorista) e docas (operação, veículos aceitos, tempo
// padrão, alocação automática). Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto, token.
// =====================================================================
(() => {
  const nav = document.getElementById('navPatio');
  const cont = document.getElementById('paConteudo');
  if (!nav || !cont || usuario?.perfil === 'cliente') return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hora = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
  const diaHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const minTxt = (m) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);
  const hojeIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/patio${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, corpo, metodo = 'POST') => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const modal = $('modalPatio'); const caixa = $('paModal');
  const fechar = () => { modal.classList.add('oculto'); pararCamera(); };
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-pa-fechar]')) fechar(); });
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-pa-fechar>✕</span></div>`;
  const COR = { agendado: 'pendente', aguardando: 'ocorrencia', chamado: 'em_transito', em_doca: 'em_transito', liberado: 'entregue', saiu: 'entregue', cancelado: 'cancelado', nao_compareceu: 'cancelado' };
  let opcoes = { operacoes: {}, veiculos: {}, status: {} };
  let aba = 'painel'; let timer = null; let ultimoPainel = null;
  const sit = (s) => `<span class="oc-sit ${COR[s] || ''}">${esc(opcoes.status[s] || s)}</span>`;
  const quem = (v) => `<b>${esc(v.placa || '—')}</b>${v.placa_carreta ? ` <small>+ ${esc(v.placa_carreta)}</small>` : ''}<br><small style="color:var(--texto-fraco);">${esc(v.transportadora || v.fornecedor || '')}${v.motorista_nome ? ` · ${esc(v.motorista_nome)}` : ''}</small>`;
  const opTxt = (o) => ({ carga: '📦 Carregamento', descarga: '📥 Descarga', outro: '🔧 Outro' }[o] || o);

  // ---------- Abas ----------
  function mostrarAba(nome) {
    aba = nome;
    document.querySelectorAll('[data-pa-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.paAba === nome));
    carregar().catch(erro);
  }
  document.querySelectorAll('[data-pa-aba]').forEach((a) => a.addEventListener('click', () => mostrarAba(a.dataset.paAba)));
  $('paAgendar').addEventListener('click', () => formulario(null, { data: aba === 'agenda' ? dataAgenda : null }));
  $('paSemAgendamento').addEventListener('click', () => formulario(null, { semAgendamento: true }));
  nav.addEventListener('click', async () => {
    if (!Object.keys(opcoes.operacoes).length) opcoes = await api('/opcoes').catch(() => opcoes);
    carregar().catch(erro);
    ligarAtualizacao();
  });
  function ligarAtualizacao() {
    clearInterval(timer);
    timer = setInterval(() => {
      if ($('pagina-patio').classList.contains('oculto') || document.visibilityState !== 'visible' || !modal.classList.contains('oculto')) return;
      if (['painel', 'portaria'].includes(aba)) carregar().catch(() => {});
    }, 20000);
  }
  async function carregar() {
    if (aba === 'painel') return desenharPainel(await api('/painel'));
    if (aba === 'portaria') return desenharPortaria();
    if (aba === 'agenda') return desenharAgenda();
    if (aba === 'docas') return desenharDocas();
    if (aba === 'ordens') return window.OrdensColeta?.desenhar(cont);
  }

  // ---------- Painel em tempo real ----------
  function desenharPainel(p) {
    ultimoPainel = p;
    const i = p.indicadores;
    const card = (rot, v, extra = '') => `<div>${esc(rot)}<b>${v}</b><span>${extra || '&nbsp;'}</span></div>`;
    const corDoca = (d) => (d.estado === 'livre' ? 'livre' : d.atrasada ? 'atrasada' : d.estado);
    cont.innerHTML = `
      <div class="pa-topo"><span>Atualizado às ${hora(p.agora)} · atualiza sozinho a cada 20 s · alocação automática <b>${p.config.alocacao_automatica ? 'ligada' : 'desligada'}</b></span>
        <span style="flex:1;"></span><button class="btn btn-secundario" style="width:auto;" id="paTelaCheia">📺 Tela cheia</button>
        ${p.config.alocacao_automatica ? '' : '<button class="btn btn-secundario" style="width:auto;" id="paAlocar">🧠 Alocar a fila agora</button>'}
        <button class="btn btn-secundario" style="width:auto;" id="paAtualizar">⟳ Atualizar</button></div>
      <div class="nf-resumo">
        ${card('No pátio agora', i.no_patio)}${card('Aguardando doca', i.aguardando, i.espera_prevista_max ? `maior espera prevista ${minTxt(i.espera_prevista_max)}` : '')}
        ${card('Em operação', i.em_doca, i.chamados ? `${i.chamados} chamado(s) a caminho` : '')}${card('Docas livres', `${i.docas_livres} de ${i.docas}`)}
        ${card('Espera média hoje', minTxt(i.espera_media))}${card('Tempo médio na doca', minTxt(i.doca_media))}${card('Permanência média', minTxt(i.permanencia_media))}
        ${card('Pontualidade', i.pontualidade == null ? '—' : `${Math.round(i.pontualidade * 100)}%`, `${i.pontuais || 0} de ${i.agendados_chegaram || 0} na janela`)}
        ${card('Hoje', `${i.chegaram_hoje} chegaram`, `${i.agendados_hoje} agendados · ${i.sairam_hoje} saíram · ${i.sem_agendamento_hoje} sem agend. · ${i.nao_compareceram} faltaram`)}
      </div>
      <div class="pa-docas">${p.docas.length ? p.docas.map((d) => `
        <div class="pa-doca ${corDoca(d)}">
          <div class="pa-doca-tit"><b>${esc(d.nome)}</b><small>${esc({ carga: 'Carregamento', descarga: 'Descarga', ambas: 'Carga e descarga' }[d.operacao])}</small></div>
          ${d.visita ? `<div class="pa-doca-vis">${quem(d.visita)}</div>
            <div class="pa-doca-info">${d.estado === 'chamado' ? `📣 Chamado às ${hora(d.visita.chamado_em)}` : `⏱ ${minTxt(d.minutos_em_doca)} na doca`}
              · fim previsto <b>${hora(d.fim_previsto)}</b>${d.atrasada ? ' <span class="pa-alerta">passou do tempo</span>' : ''}</div>
            <div class="pa-doca-acoes">${d.estado === 'chamado' ? `<button class="btn btn-primario" data-iniciar="${d.visita.id}">▶ Encostou / iniciar</button><button class="btn btn-secundario" data-voltar="${d.visita.id}">↩ Voltar à fila</button>`
              : `<button class="btn btn-primario" data-finalizar="${d.visita.id}">✔ Terminou a operação</button>`}</div>`
            : `<div class="pa-doca-vis livre-txt">🟢 Livre</div>${d.proximo ? `<div class="pa-doca-info">Próximo: <b>${esc(d.proximo.placa || d.proximo.codigo)}</b></div><div class="pa-doca-acoes"><button class="btn btn-primario" data-chamar="${d.proximo.id}" data-doca="${d.id}">📣 Chamar ${esc(d.proximo.placa || '')}</button></div>` : '<div class="pa-doca-info">Ninguém na fila para esta doca</div>'}`}
        </div>`).join('') : '<div class="kanban-vazio">Cadastre as docas na aba Docas.</div>'}</div>
      <div class="pa-colunas">
        <div class="painel"><h4>🚛 Fila do pátio (${p.fila.length})</h4>${p.fila.length ? `<table class="re-tab"><thead><tr><th>#</th><th>Veículo</th><th>Operação</th><th>Chegou</th><th>Prioridade</th><th>Previsão</th><th></th></tr></thead><tbody>
          ${p.fila.map((v) => `<tr><td><b>${v.posicao}º</b></td><td>${quem(v)}</td><td>${opTxt(v.operacao)}</td><td>${hora(v.chegada_em)}<br><small>há ${minTxt(v.espera_ate_agora)}</small></td>
            <td><span class="pa-prio ${v.prioridade}">${{ na_janela: 'Na janela', atrasado: 'Atrasado', sem_agendamento: 'Sem agendamento' }[v.prioridade]}</span></td>
            <td>${v.previsao?.sem_doca ? '<span class="pa-alerta">nenhuma doca aceita</span>' : v.previsao ? `<b>${esc(v.previsao.doca)}</b> ${v.previsao.livre_agora ? '· <b>agora</b>' : `às ${hora(v.previsao.inicio)}`}<br><small>espera ${minTxt(v.previsao.espera_min)} · sai da doca ~${hora(v.previsao.fim)}</small>` : '—'}</td>
            <td style="white-space:nowrap;"><button class="btn btn-secundario pa-mini" data-chamar="${v.id}">📣 Chamar</button> <button class="btn btn-secundario pa-mini" data-abrir="${v.id}">…</button></td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Ninguém aguardando.</div>'}
          ${p.liberados.length ? `<h4 style="margin-top:14px;">🚪 Liberados, indo para a saída (${p.liberados.length})</h4><table class="re-tab"><tbody>${p.liberados.map((v) => `<tr><td>${quem(v)}</td><td>${esc(v.doca_nome || '')} · terminou às ${hora(v.fim_doca_em)}</td><td style="text-align:right;"><button class="btn btn-primario pa-mini" data-saida="${v.id}">🚪 Registrar saída</button></td></tr>`).join('')}</tbody></table>` : ''}
        </div>
        <div class="painel"><h4>🕒 Próximas chegadas (24 h)</h4>${p.proximas.length ? `<table class="re-tab"><tbody>${p.proximas.map((v) => `<tr>
            <td><b>${hora(v.previsto_em)}</b><br><small>${new Date(v.previsto_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small></td><td>${quem(v)}</td>
            <td><span class="pa-cheg ${v.situacao_chegada}">${{ previsto: 'Previsto', chegando: 'Chegando', atrasado: 'Atrasado', nao_compareceu: 'Não veio' }[v.situacao_chegada]}</span></td>
            <td style="white-space:nowrap; text-align:right;"><button class="btn btn-secundario pa-mini" data-checkin="${v.id}">✅ Chegou</button>${v.situacao_chegada === 'nao_compareceu' || v.situacao_chegada === 'atrasado' ? ` <button class="btn btn-secundario pa-mini" data-faltou="${v.id}">✖ Não veio</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nenhuma chegada prevista.</div>'}</div>
      </div>`;
    $('paAtualizar').addEventListener('click', () => carregar().catch(erro));
    $('paAlocar')?.addEventListener('click', () => enviar('/alocar').then((r) => { mostrarAlerta(r.chamados.length ? `${r.chamados.length} chamado(s) para as docas.` : 'Nenhuma doca livre para a fila agora.', { tipo: 'sucesso' }); return carregar(); }).catch(erro));
    $('paTelaCheia').addEventListener('click', () => { const el = $('pagina-patio'); (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.())?.catch?.(() => {}); });
  }

  // Ações (painel, portaria, agenda): um só ouvinte.
  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = (k) => Number(b.dataset[k]);
    try {
      if (b.dataset.iniciar) await enviar(`/visitas/${id('iniciar')}/iniciar`);
      else if (b.dataset.voltar) await enviar(`/visitas/${id('voltar')}/voltar-fila`);
      else if (b.dataset.finalizar) {
        const lacre = await pedirTexto('Lacre (opcional). Deixe em branco se não houver.', { titulo: 'Fim da operação', textoOk: 'Terminou' });
        if (lacre === null) return;
        await enviar(`/visitas/${id('finalizar')}/finalizar`, { lacre });
      } else if (b.dataset.chamar) await enviar(`/visitas/${id('chamar')}/chamar`, b.dataset.doca ? { doca_id: Number(b.dataset.doca) } : {});
      else if (b.dataset.saida) await enviar(`/visitas/${id('saida')}/saida`);
      else if (b.dataset.checkin) { const v = await api(`/visitas/${id('checkin')}`); await enviar('/checkin', { codigo: v.codigo }); }
      else if (b.dataset.faltou) { if (!(await confirmar('Marcar como "não compareceu"?'))) return; await enviar(`/visitas/${id('faltou')}/nao-compareceu`); }
      else if (b.dataset.abrir) { await detalhe(id('abrir')); return; }
      else return;
      await carregar();
    } catch (err) { erro(err); }
  });

  // ---------- Portaria ----------
  async function desenharPortaria() {
    if (!$('paLeitor')) {
      cont.innerHTML = `<div class="painel pa-portaria">
          <h4 style="margin-top:0;">🚪 Entrada na portaria</h4>
          <p class="edi-dica">Leia o QR Code do motorista (leitor USB ou o botão da câmera) ou digite o código de 8 letras ou a placa. Sem agendamento: use o botão "Entrada sem agendamento".</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;"><input id="paLeitor" class="cte-entrada" style="flex:1; min-width:220px; font-size:18px; letter-spacing:1px;" placeholder="QR Code, código ou placa" autocomplete="off" />
            <button class="btn btn-primario" style="width:auto;" id="paEntrar">✅ Registrar entrada</button><button class="btn btn-secundario" style="width:auto;" id="paCamera">📷 Câmera</button></div>
          <div id="paResultado" style="margin-top:12px;"></div>
        </div>
        <div class="painel"><div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;"><h4 style="margin:0;">Movimento de hoje</h4><span style="flex:1;"></span><input id="paBuscaHoje" class="cte-entrada" style="max-width:240px;" placeholder="Buscar placa, transportadora, nota" /></div><div id="paHoje" style="margin-top:8px;"></div></div>`;
      const entrar = async () => {
        const codigo = $('paLeitor').value.trim(); if (!codigo) return;
        try {
          const v = await enviar('/checkin', { codigo });
          $('paResultado').innerHTML = `<div class="pa-ok">${v.ja_estava ? 'ℹ Já tinha entrado' : '✅ Entrada registrada'}: ${quem(v)} · ${opTxt(v.operacao)} · ${sit(v.status)}${v.doca_nome && ['chamado', 'em_doca'].includes(v.status) ? ` · <b>dirija-se à ${esc(v.doca_nome)}</b>` : ''}</div>`;
          $('paLeitor').value = '';
          desenharHoje();
        } catch (err) { $('paResultado').innerHTML = `<div class="pa-erro">⚠ ${esc(err.message)}</div>`; $('paLeitor').select(); }
      };
      $('paEntrar').addEventListener('click', entrar);
      $('paLeitor').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
      $('paCamera').addEventListener('click', () => lerCamera((txt) => { $('paLeitor').value = txt; entrar(); }));
      let t = null; $('paBuscaHoje').addEventListener('input', () => { clearTimeout(t); t = setTimeout(desenharHoje, 350); });
    }
    $('paLeitor').focus();
    await desenharHoje();
  }
  async function desenharHoje() {
    const vs = await api(`/visitas?data=${hojeIso()}&busca=${encodeURIComponent($('paBuscaHoje')?.value || '')}`);
    $('paHoje').innerHTML = tabelaVisitas(vs, 'Nenhuma visita hoje.');
  }
  // Ações possíveis em cada situação.
  function acoesDe(v) {
    const b = (k, t, cls = 'btn-secundario') => `<button class="btn ${cls} pa-mini" data-${k}="${v.id}">${t}</button>`;
    return ({ agendado: b('checkin', '✅ Chegou', 'btn-primario'), aguardando: b('chamar', '📣 Chamar'), chamado: b('iniciar', '▶ Iniciar', 'btn-primario'),
      em_doca: b('finalizar', '✔ Terminou', 'btn-primario'), liberado: b('saida', '🚪 Saída', 'btn-primario') }[v.status] || '') + ` ${b('abrir', '…')}`;
  }
  const tabelaVisitas = (vs, vazio) => (vs.length ? `<table class="re-tab"><thead><tr><th>Previsto</th><th>Veículo</th><th>Operação</th><th>Notas</th><th>Situação</th><th>Doca</th><th>Chegada</th><th>Saída</th><th></th></tr></thead><tbody>
    ${vs.map((v) => `<tr><td>${v.previsto_em ? diaHora(v.previsto_em) : '<small>sem agendamento</small>'}</td><td>${quem(v)}</td><td>${opTxt(v.operacao)}</td>
      <td><small>${esc((v.notas || []).slice(0, 4).join(', '))}${(v.notas || []).length > 4 ? ` +${v.notas.length - 4}` : ''}</small></td><td>${sit(v.status)}</td><td>${esc(v.doca_nome || '—')}</td>
      <td>${hora(v.chegada_em)}</td><td>${hora(v.saida_em)}</td><td style="white-space:nowrap; text-align:right;">${acoesDe(v)}</td></tr>`).join('')}</tbody></table>` : `<div class="kanban-vazio">${vazio}</div>`);

  // Câmera: lê o QR Code com o leitor do navegador (Chrome/Edge/Android).
  let fluxo = null; let lendo = false;
  function pararCamera() { lendo = false; if (fluxo) { fluxo.getTracks().forEach((t) => t.stop()); fluxo = null; } }
  async function lerCamera(aoLer) {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      mostrarAlerta('Este navegador não lê QR Code pela câmera. Use um leitor USB (ele digita o código no campo) ou o Chrome no celular.', { tipo: 'aviso' }); return;
    }
    caixa.innerHTML = `${cab('📷 Aponte para o QR Code')}<video id="paVideo" autoplay playsinline muted style="width:100%; border-radius:10px; background:#000;"></video><p class="edi-dica">Lendo…</p>`;
    modal.classList.remove('oculto');
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = $('paVideo'); video.srcObject = fluxo; await video.play();
      const det = new window.BarcodeDetector({ formats: ['qr_code'] }); lendo = true;
      const passo = async () => {
        if (!lendo) return;
        const r = await det.detect(video).catch(() => []);
        if (r[0]?.rawValue) { const txt = r[0].rawValue; fechar(); aoLer(txt); return; }
        setTimeout(passo, 250);
      };
      passo();
    } catch (err) { fechar(); erro(new Error(`Não foi possível abrir a câmera: ${err.message}`)); }
  }

  // ---------- Agendamentos ----------
  let dataAgenda = hojeIso();
  async function desenharAgenda() {
    if (!$('paDataAgenda')) {
      cont.innerHTML = `<div class="painel"><div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
          <label class="nf-f" style="max-width:180px;"><span>Dia</span><input type="date" id="paDataAgenda" class="cte-entrada" /></label>
          <label class="nf-f" style="max-width:280px;"><span>Buscar</span><input id="paBuscaAgenda" class="cte-entrada" placeholder="Placa, transportadora, código, nota" /></label>
</div>
        <div id="paAgendaLista" style="margin-top:10px;"></div></div>`;
      $('paDataAgenda').value = dataAgenda;
      $('paDataAgenda').addEventListener('change', () => { dataAgenda = $('paDataAgenda').value || hojeIso(); desenharAgenda(); });
      let t = null; $('paBuscaAgenda').addEventListener('input', () => { clearTimeout(t); t = setTimeout(desenharAgenda, 350); });
    }
    const vs = await api(`/visitas?data=${dataAgenda}&busca=${encodeURIComponent($('paBuscaAgenda').value || '')}`);
    // Ocupação por hora: quantos agendados em cada hora do dia.
    const porHora = {}; vs.filter((v) => v.previsto_em && v.status !== 'cancelado').forEach((v) => { const h = new Date(v.previsto_em).getHours(); porHora[h] = (porHora[h] || 0) + 1; });
    const max = Math.max(1, ...Object.values(porHora));
    $('paAgendaLista').innerHTML = `${Object.keys(porHora).length ? `<div class="pa-horas">${Array.from({ length: 24 }, (_, h) => h).filter((h) => h >= 5 && h <= 22).map((h) => `<div title="${porHora[h] || 0} agendado(s) às ${h}h"><span style="height:${((porHora[h] || 0) / max) * 100}%"></span><small>${h}h</small></div>`).join('')}</div>` : ''}
      ${tabelaVisitas(vs, 'Nenhum agendamento neste dia.')}`;
  }

  // Formulário: agendar, alterar ou entrada sem agendamento.
  async function formulario(v, { semAgendamento = false, data = null } = {}) {
    if (!Object.keys(opcoes.operacoes).length) opcoes = await api('/opcoes').catch(() => opcoes);
    const ds = await api('/docas').catch(() => []);
    const ini = v?.previsto_local || `${data || hojeIso()}T${String(new Date().getHours() + 1).padStart(2, '0')}:00`;
    const sel = (id, obj, val) => `<select id="${id}" class="cte-entrada">${Object.entries(obj).map(([k, t]) => `<option value="${k}"${k === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const campo = (id, rot, val = '', extra = '') => `<label class="nf-f"><span>${rot}</span><input id="${id}" class="cte-entrada" value="${esc(val ?? '')}" ${extra} /></label>`;
    caixa.innerHTML = `${cab(v ? `Visita ${esc(v.codigo)}` : semAgendamento ? '🚪 Entrada sem agendamento' : '＋ Agendar janela')}
      <div class="pa-form">
        <label class="nf-f"><span>Operação</span>${sel('pfOp', opcoes.operacoes, v?.operacao || 'carga')}</label>
        ${semAgendamento ? '' : `${campo('pfQuando', 'Data e hora previstas', ini, 'type="datetime-local"')}${campo('pfJanela', 'Janela (min)', v?.janela_min ?? 60, 'type="number" min="0" step="15"')}`}
        ${campo('pfTransp', 'Transportadora', v?.transportadora, 'placeholder="Quem vem buscar"')}${campo('pfForn', 'Fornecedor (descarga)', v?.fornecedor)}
        ${campo('pfPlaca', 'Placa', v?.placa, 'placeholder="ABC1D23" style="text-transform:uppercase;"')}${campo('pfCarreta', 'Placa da carreta', v?.placa_carreta, 'style="text-transform:uppercase;"')}
        <label class="nf-f"><span>Veículo</span>${sel('pfVeic', { '': '—', ...opcoes.veiculos }, v?.tipo_veiculo || '')}</label>
        ${campo('pfMot', 'Motorista', v?.motorista_nome)}${campo('pfDoc', 'CPF / CNH', v?.motorista_documento)}${campo('pfTel', 'Celular do motorista', v?.motorista_telefone, 'placeholder="(11) 9...."')}
        <label class="nf-f pa-largo"><span>Notas fiscais (números, separados por vírgula)</span><textarea id="pfNotas" class="cte-entrada" rows="2">${esc((v?.notas || []).join(', '))}</textarea></label>
        ${campo('pfPedido', 'Pedido', v?.pedido)}${campo('pfVol', 'Volumes', v?.volumes, 'type="number" min="0"')}${campo('pfPeso', 'Peso (kg)', v?.peso_kg)}
        ${campo('pfMin', 'Tempo previsto na doca (min)', v?.minutos_previstos, 'type="number" min="0" placeholder="média da doca"')}
        <label class="nf-f pa-largo"><span>Observação</span><textarea id="pfObs" class="cte-entrada" rows="2">${esc(v?.observacao || '')}</textarea></label>
      </div>
      <div id="pfNotasInfo" class="edi-dica"></div>
      ${!ds.length ? '<p class="pa-erro">Ainda não há docas cadastradas: cadastre na aba Docas para a alocação funcionar.</p>' : ''}
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" style="width:auto;" data-pa-fechar>Cancelar</button>
        <button class="btn btn-primario" style="width:auto;" id="pfSalvar">${v ? 'Salvar' : semAgendamento ? '✅ Registrar entrada' : '📅 Agendar e gerar QR Code'}</button></div>`;
    modal.classList.remove('oculto');
    // Confere as notas digitadas: mostra cliente, volumes e peso e preenche o que faltar.
    let t = null;
    $('pfNotas').addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => {
      const n = await api(`/notas?numeros=${encodeURIComponent($('pfNotas').value)}`).catch(() => null);
      if (!n) return;
      $('pfNotasInfo').innerHTML = n.achadas.length ? `${n.achadas.length} nota(s): ${n.achadas.map((x) => `${esc(x.numero)} (${esc(x.cliente || '')}, ${x.qtd_volumes || 0} vol.)`).join(' · ')}${n.faltam?.length ? ` · <b>não achadas:</b> ${esc(n.faltam.join(', '))}` : ''}` : (n.notas.length ? 'Nenhuma dessas notas está no sistema.' : '');
      if (!$('pfTransp').value && n.achadas.find((x) => x.transportadora)) $('pfTransp').value = n.achadas.find((x) => x.transportadora).transportadora;
    }, 500); });
    $('pfSalvar').addEventListener('click', async () => {
      const corpo = { operacao: $('pfOp').value, previsto_em: $('pfQuando')?.value, janela_min: $('pfJanela')?.value, transportadora: $('pfTransp').value, fornecedor: $('pfForn').value,
        placa: $('pfPlaca').value, placa_carreta: $('pfCarreta').value, tipo_veiculo: $('pfVeic').value, motorista_nome: $('pfMot').value, motorista_documento: $('pfDoc').value,
        motorista_telefone: $('pfTel').value, notas: $('pfNotas').value, pedido: $('pfPedido').value, volumes: $('pfVol').value, peso_kg: $('pfPeso').value,
        minutos_previstos: $('pfMin').value, observacao: $('pfObs').value, sem_agendamento: semAgendamento };
      try {
        const r = v ? await enviar(`/visitas/${v.id}`, corpo, 'PUT') : await enviar('/visitas', corpo);
        if (r.notas_faltando?.length) mostrarAlerta(`Notas não achadas no sistema: ${r.notas_faltando.join(', ')}. A visita foi salva sem elas.`, { tipo: 'aviso' });
        if (!v && !semAgendamento) await detalhe(r.id); else fechar();
        carregar().catch(erro);
      } catch (err) { erro(err); }
    });
  }

  // Detalhe: QR Code, link para o motorista, histórico e as ações.
  async function detalhe(id) {
    const v = await api(`/visitas/${id}`);
    const tel = String(v.motorista_telefone || '').replace(/\D/g, '');
    const msg = `Olá${v.motorista_nome ? `, ${v.motorista_nome.split(' ')[0]}` : ''}! Seu ${v.operacao === 'descarga' ? 'descarregamento' : 'carregamento'} está agendado para ${v.previsto_em ? diaHora(v.previsto_em) : 'hoje'}. Na portaria, mostre o QR Code deste link: ${v.link} (código ${v.codigo}). Pelo link você acompanha a fila e a doca.`;
    caixa.innerHTML = `${cab(`${opTxt(v.operacao)} · ${esc(v.placa || v.codigo)}`)}
      <div class="pa-detalhe">
        <div class="pa-qr"><img src="/api/patio-publico/${encodeURIComponent(v.codigo)}/qr.svg" alt="QR Code da visita" width="200" height="200" /><b>${esc(v.codigo)}</b><small>Mostre na portaria</small></div>
        <div>
          <p style="margin:0 0 6px;">${sit(v.status)} ${v.doca_nome ? `· ${esc(v.doca_nome)}` : ''}</p>
          <p style="margin:0 0 6px;">${quem(v)}</p>
          <p style="margin:0 0 6px;">Previsto: <b>${v.previsto_em ? diaHora(v.previsto_em) : 'sem agendamento'}</b>${v.janela_min ? ` (janela de ${v.janela_min} min)` : ''}</p>
          ${(v.notas || []).length ? `<p style="margin:0 0 6px;">Notas: ${esc(v.notas.join(', '))}${v.volumes ? ` · ${v.volumes} vol.` : ''}${v.peso_kg ? ` · ${Number(v.peso_kg).toLocaleString('pt-BR')} kg` : ''}</p>` : ''}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0;">
            <button class="btn btn-secundario" style="width:auto;" id="pdCopiar">📋 Copiar link</button>
            ${tel ? `<a class="btn btn-secundario" style="width:auto; text-decoration:none;" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}?text=${encodeURIComponent(msg)}">💬 Enviar no WhatsApp</a>` : ''}
            <a class="btn btn-secundario" style="width:auto; text-decoration:none;" target="_blank" rel="noopener" href="${esc(v.link)}">🔗 Página do motorista</a>
            ${['agendado', 'aguardando', 'chamado'].includes(v.status) ? '<button class="btn btn-secundario" style="width:auto;" id="pdEditar">✏ Alterar</button><button class="btn btn-secundario" style="width:auto;" id="pdCancelar">✖ Cancelar</button>' : ''}
          </div>
          <div class="pa-eventos">${v.eventos.map((e) => `<div><small>${diaHora(e.em)}</small> ${esc(e.detalhe || e.tipo)}${e.usuario_nome ? ` <small>· ${esc(e.usuario_nome)}</small>` : ''}</div>`).join('')}</div>
        </div>
      </div>`;
    modal.classList.remove('oculto');
    $('pdCopiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(msg); } catch { /* sem área de transferência */ } mostrarAlerta('Mensagem com o link copiada.', { tipo: 'sucesso' }); });
    $('pdEditar')?.addEventListener('click', () => formulario(v));
    $('pdCancelar')?.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo do cancelamento', { titulo: 'Cancelar a visita', textoOk: 'Cancelar visita' });
      if (motivo === null) return;
      try { await enviar(`/visitas/${v.id}/cancelar`, { motivo }); fechar(); carregar().catch(erro); } catch (err) { erro(err); }
    });
  }

  // ---------- Docas e regras ----------
  async function desenharDocas() {
    const [ds, cfg] = await Promise.all([api('/docas?todas=1'), api('/config')]);
    if (!Object.keys(opcoes.operacoes).length) opcoes = await api('/opcoes').catch(() => opcoes);
    cont.innerHTML = `<div class="pa-colunas">
      <div class="painel"><div style="display:flex; align-items:center;"><h4 style="margin:0;">Docas</h4><span style="flex:1;"></span><button class="btn btn-primario" style="width:auto;" data-nova-doca>＋ Doca</button></div>
        ${ds.length ? `<table class="re-tab" style="margin-top:8px;"><thead><tr><th>Doca</th><th>Operação</th><th>Veículos aceitos</th><th>Tempo padrão</th><th>Situação</th><th></th></tr></thead><tbody>
          ${ds.map((d) => `<tr><td><b>${esc(d.nome)}</b>${d.observacao ? `<br><small>${esc(d.observacao)}</small>` : ''}</td><td>${esc({ carga: 'Carregamento', descarga: 'Descarga', ambas: 'Carga e descarga' }[d.operacao])}</td>
            <td><small>${d.veiculos.length ? esc(d.veiculos.map((x) => opcoes.veiculos[x] || x).join(', ')) : 'Todos'}</small></td><td>${d.minutos_padrao} min</td><td>${d.ativa ? 'Ativa' : '<span style="color:var(--texto-fraco);">Inativa</span>'}</td>
            <td style="text-align:right;"><button class="btn btn-secundario pa-mini" data-editar-doca="${d.id}">✏</button> <button class="btn btn-secundario pa-mini" data-excluir-doca="${d.id}">🗑</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="kanban-vazio">Nenhuma doca. Cadastre as docas para o sistema distribuir os caminhões.</div>'}</div>
      <div class="painel"><h4 style="margin-top:0;">🧠 Alocação e regras</h4>
        <label class="re-check"><input type="checkbox" id="pcAuto" ${cfg.alocacao_automatica ? 'checked' : ''} /> Alocação automática: quando uma doca fica livre, chamar sozinho o próximo da fila</label>
        <div class="pa-form" style="margin-top:8px;">
          <label class="nf-f"><span>Tolerância de atraso (min)</span><input id="pcTol" type="number" min="0" class="cte-entrada" value="${cfg.tolerancia_min}" /></label>
          <label class="nf-f"><span>"Não compareceu" depois de (min)</span><input id="pcFalta" type="number" min="30" class="cte-entrada" value="${cfg.nao_compareceu_min}" /></label>
        </div>
        <p class="edi-dica">A fila respeita a prioridade: quem chega dentro da janela agendada (mais a tolerância) passa na frente de quem atrasou ou veio sem agendamento. Cada caminhão vai para a doca compatível (operação e tipo de veículo) que fica livre primeiro; o tempo de cada operação é a média real da doca nos últimos 60 dias (com pelo menos 3 operações) ou o tempo padrão dela.</p>
        <button class="btn btn-primario" style="width:auto;" id="pcSalvar">Salvar regras</button></div></div>`;
    $('pcSalvar').addEventListener('click', () => enviar('/config', { alocacao_automatica: $('pcAuto').checked, tolerancia_min: $('pcTol').value, nao_compareceu_min: $('pcFalta').value }, 'PUT')
      .then(() => mostrarAlerta('Regras salvas.', { tipo: 'sucesso' })).catch(erro));
    cont.querySelector('[data-nova-doca]').addEventListener('click', () => formDoca(null));
    cont.querySelectorAll('[data-editar-doca]').forEach((b) => b.addEventListener('click', () => formDoca(ds.find((d) => d.id === Number(b.dataset.editarDoca)))));
    cont.querySelectorAll('[data-excluir-doca]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar('Excluir esta doca? Se ela já foi usada, fica só desativada (o histórico continua).'))) return;
      enviar(`/docas/${b.dataset.excluirDoca}`, {}, 'DELETE').then(desenharDocas).catch(erro);
    }));
  }
  function formDoca(d) {
    caixa.innerHTML = `${cab(d ? `Doca ${esc(d.nome)}` : '＋ Doca')}<div class="pa-form">
        <label class="nf-f"><span>Nome</span><input id="pdNome" class="cte-entrada" value="${esc(d?.nome || '')}" placeholder="Doca 1" /></label>
        <label class="nf-f"><span>Operação</span><select id="pdOp" class="cte-entrada">${[['ambas', 'Carga e descarga'], ['carga', 'Só carregamento'], ['descarga', 'Só descarga']].map(([k, t]) => `<option value="${k}"${k === (d?.operacao || 'ambas') ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="nf-f"><span>Tempo padrão (min)</span><input id="pdMin" type="number" min="5" class="cte-entrada" value="${d?.minutos_padrao || 60}" /></label>
        <label class="nf-f"><span>Ordem no painel</span><input id="pdOrdem" type="number" class="cte-entrada" value="${d?.ordem || 0}" /></label>
        <div class="nf-f pa-largo"><span>Veículos aceitos (nenhum marcado = todos)</span><div class="pa-veics">${Object.entries(opcoes.veiculos).map(([k, t]) => `<label><input type="checkbox" value="${k}"${(d?.veiculos || []).includes(k) ? ' checked' : ''} /> ${esc(t)}</label>`).join('')}</div></div>
        <label class="nf-f pa-largo"><span>Observação</span><input id="pdObs" class="cte-entrada" value="${esc(d?.observacao || '')}" placeholder="Ex.: rampa niveladora, só paletizado" /></label>
        <label class="re-check"><input type="checkbox" id="pdAtiva" ${d?.ativa === false ? '' : 'checked'} /> Ativa</label>
      </div><div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" style="width:auto;" data-pa-fechar>Cancelar</button><button class="btn btn-primario" style="width:auto;" id="pdSalvar">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('pdSalvar').addEventListener('click', async () => {
      const corpo = { nome: $('pdNome').value, operacao: $('pdOp').value, minutos_padrao: $('pdMin').value, ordem: $('pdOrdem').value, observacao: $('pdObs').value, ativa: $('pdAtiva').checked,
        veiculos: [...caixa.querySelectorAll('.pa-veics input:checked')].map((x) => x.value) };
      try { await (d ? enviar(`/docas/${d.id}`, corpo, 'PUT') : enviar('/docas', corpo)); fechar(); desenharDocas(); } catch (err) { erro(err); }
    });
  }
})();
