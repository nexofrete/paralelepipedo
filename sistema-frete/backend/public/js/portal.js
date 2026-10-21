// Portal do cliente (embarcador): entrada, cargas, financeiro, coletas e cotações.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v, c = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const ic = (nome) => `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
  const vazio = (icone, texto) => `<div class="pt-vazio">${ic(icone)}${texto}</div>`;
  const dia = (v) => { if (!v) return ''; const s = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : ''; };
  // Data e hora do servidor (emissão, entrega, pedido): o dia no horário de Brasília.
  const diaTs = (v) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
  const diaHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

  const guardar = { ler: () => { try { return localStorage.getItem('nexoPortal'); } catch { return null; } },
    pôr: (t) => { try { if (t) localStorage.setItem('nexoPortal', t); else localStorage.removeItem('nexoPortal'); } catch { /* sem armazenamento */ } } };
  let token = guardar.ler();
  let eu = null; let empresa = null;

  async function api(caminho, opcoes = {}) {
    const r = await fetch(`/api/portal${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opcoes.headers || {}) } });
    const corpo = await r.json().catch(() => ({}));
    if (r.status === 401 && token) { sair(corpo.erro); throw new Error(corpo.erro || 'Entre de novo.'); }
    if (r.status === 403 && corpo.trocar_senha) { telaSenha(true); throw new Error(corpo.erro); }
    if (r.status === 423) throw new Error('O portal está temporariamente indisponível. Fale com a transportadora.');
    if (!r.ok) throw new Error(corpo.erro || 'Não foi possível completar agora.');
    return corpo;
  }
  LinkSeguro.configurar(async (caminho) => (await api('/ticket', { method: 'POST', body: JSON.stringify({ caminho }) })).ticket);
  const link = (caminho) => `/api/portal${caminho}${caminho.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;

  // ---------- Janela ----------
  const fundo = $('ptFundo'); const janela = $('ptJanela');
  function abrirJanela(titulo, html) {
    janela.innerHTML = `<div class="cab"><div>${titulo}</div><button class="fechar" data-fechar aria-label="Fechar">✕</button></div>${html}`;
    fundo.classList.remove('oculto');
    document.body.style.overflow = 'hidden';
  }
  function fecharJanela() { fundo.classList.add('oculto'); janela.innerHTML = ''; document.body.style.overflow = ''; }
  fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fechar]')) fecharJanela(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !fundo.classList.contains('oculto')) fecharJanela(); });
  const aviso = (msg) => abrirJanela('<b>Aviso</b>', `<p>${esc(msg)}</p><div class="pt-rodape-j"><button data-fechar>OK</button></div>`);

  // ---------- Entrada ----------
  function mostrarForm(id) { ['ptFormEntrar', 'ptFormEsqueci', 'ptFormSenha'].forEach((f) => $(f).classList.toggle('oculto', f !== id)); }
  function telaEntrada() {
    $('ptApp').classList.add('oculto'); $('ptEntrada').classList.remove('oculto');
    mostrarForm('ptFormEntrar');
    $('ptEsqueci').classList.toggle('oculto', !empresa?.recuperar_senha);
  }
  function sair(msg) {
    token = null; guardar.pôr(null); eu = null;
    telaEntrada();
    if (msg) { $('ptErroEntrar').textContent = msg; $('ptErroEntrar').classList.remove('oculto'); }
  }
  let modoSenha = 'trocar'; let tokenRedefinir = null;
  function telaSenha(obrigatoria, redefinir = null) {
    modoSenha = redefinir ? 'redefinir' : 'trocar'; tokenRedefinir = redefinir;
    if (obrigatoria || redefinir) {
      $('ptApp').classList.add('oculto'); $('ptEntrada').classList.remove('oculto'); mostrarForm('ptFormSenha');
      $('ptSenhaTitulo').textContent = redefinir ? 'Crie uma senha nova' : 'Crie a sua senha';
      $('ptCampoAtual').classList.toggle('oculto', !!redefinir);
      $('ptSenhaAtual').required = !redefinir;
      $('ptErroSenha').classList.add('oculto');
      (redefinir ? $('ptSenhaNova') : $('ptSenhaAtual')).focus();
      return;
    }
    abrirJanela(`<b>${ic('key')} Trocar a senha</b>`, `<div class="pt-grade" style="grid-template-columns:1fr;">
      <div><label for="ptjAtual">Senha atual</label><input id="ptjAtual" type="password" autocomplete="current-password" /></div>
      <div><label for="ptjNova">Senha nova (8+ caracteres, letras e números)</label><input id="ptjNova" type="password" autocomplete="new-password" /></div>
      <div><label for="ptjConf">Repita a senha nova</label><input id="ptjConf" type="password" autocomplete="new-password" /></div></div>
      <p id="ptjErro" class="erro oculto"></p>
      <div class="pt-rodape-j"><button class="sec" data-fechar>Cancelar</button><button id="ptjSalvar">Salvar</button></div>`);
    $('ptjSalvar').addEventListener('click', async () => {
      try {
        if ($('ptjNova').value !== $('ptjConf').value) throw new Error('As duas senhas novas não são iguais.');
        const r = await api('/senha', { method: 'POST', body: JSON.stringify({ atual: $('ptjAtual').value, nova: $('ptjNova').value }) });
        token = r.token; guardar.pôr(token); fecharJanela(); aviso('Senha trocada.');
      } catch (err) { $('ptjErro').textContent = err.message; $('ptjErro').classList.remove('oculto'); }
    });
  }

  $('ptFormEntrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]'); b.disabled = true;
    $('ptErroEntrar').classList.add('oculto');
    try {
      const r = await api('/entrar', { method: 'POST', body: JSON.stringify({ email: $('ptEmail').value, senha: $('ptSenha').value }) });
      token = r.token; guardar.pôr(token); $('ptSenha').value = '';
      if (r.usuario.trocar_senha) { $('ptSenhaAtual').value = ''; telaSenha(true); } else await iniciarApp();
    } catch (err) { $('ptErroEntrar').textContent = err.message; $('ptErroEntrar').classList.remove('oculto'); }
    b.disabled = false;
  });
  $('ptEsqueci').addEventListener('click', () => { $('ptEsqEmail').value = $('ptEmail').value; $('ptMsgEsqueci').classList.add('oculto'); mostrarForm('ptFormEsqueci'); });
  document.querySelectorAll('[data-pt-voltar]').forEach((b) => b.addEventListener('click', () => mostrarForm('ptFormEntrar')));
  $('ptFormEsqueci').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/esqueci', { method: 'POST', body: JSON.stringify({ email: $('ptEsqEmail').value }) });
      $('ptMsgEsqueci').textContent = r.mensagem; $('ptMsgEsqueci').className = 'ok';
    } catch (err) { $('ptMsgEsqueci').textContent = err.message; $('ptMsgEsqueci').className = 'erro'; }
  });
  $('ptFormSenha').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('ptErroSenha').classList.add('oculto');
    try {
      if ($('ptSenhaNova').value !== $('ptSenhaConf').value) throw new Error('As duas senhas novas não são iguais.');
      const r = modoSenha === 'redefinir'
        ? await api('/redefinir', { method: 'POST', body: JSON.stringify({ token: tokenRedefinir, senha: $('ptSenhaNova').value }) })
        : await api('/senha', { method: 'POST', body: JSON.stringify({ atual: $('ptSenhaAtual').value, nova: $('ptSenhaNova').value }) });
      token = r.token; guardar.pôr(token);
      ['ptSenhaAtual', 'ptSenhaNova', 'ptSenhaConf'].forEach((id) => { $(id).value = ''; });
      if (modoSenha === 'redefinir') history.replaceState(null, '', location.pathname);
      await iniciarApp();
    } catch (err) { $('ptErroSenha').textContent = err.message; $('ptErroSenha').classList.remove('oculto'); }
  });
  $('ptSair').addEventListener('click', () => sair());
  $('ptMinhaSenha').addEventListener('click', () => telaSenha(false));

  // ---------- Aplicativo ----------
  let abaAtual = 'inicio';
  async function iniciarApp() {
    eu = await api('/eu');
    if (eu.trocar_senha) { telaSenha(true); return; }
    $('ptEntrada').classList.add('oculto'); $('ptApp').classList.remove('oculto');
    $('ptNomeApp').textContent = empresa?.nome || 'Portal do cliente';
    $('ptUsuarioNome').textContent = eu.nome;
    $('ptCliente').textContent = eu.cliente_nome || '';
    $('ptAvatar').textContent = String(eu.nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
    $('ptRodapeEmpresa').textContent = [empresa?.nome, empresa?.telefone, empresa?.email].filter(Boolean).join(' · ');
    if (empresa?.logo) { $('ptLogoApp').src = empresa.logo; $('ptLogoApp').classList.remove('oculto'); }
    $('ptAbaFin').classList.toggle('oculto', !eu.pode_financeiro);
    $('ptXmlLote').classList.toggle('oculto', !eu.pode_financeiro);   // o XML traz o valor do frete
    // Aba Paletes só para quem tem paletes ou vales com a transportadora.
    api('/paletes').then((p) => $('ptAbaPaletes').classList.toggle('oculto', !p.saldos.length && !p.vales.length)).catch(() => {});
    irPara(abaAtual);
  }
  function irPara(aba) {
    if (aba === 'financeiro' && !eu.pode_financeiro) aba = 'inicio';
    abaAtual = aba;
    document.querySelectorAll('#ptAbas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
    document.querySelectorAll('[data-pagina]').forEach((s) => s.classList.toggle('oculto', s.dataset.pagina !== aba));
    ({ inicio: carregarInicio, cargas: carregarCargas, financeiro: carregarFaturas, coletas: carregarColetas, cotacoes: carregarCotacoes, sac: carregarChamados, paletes: carregarPaletes }[aba])().catch((err) => aviso(err.message));
  }
  $('ptAbas').addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) irPara(b.dataset.aba); });

  // ---------- Início ----------
  async function carregarInicio() {
    const r = await api('/inicio');
    const cartao = (icone, titulo, valor, rodape, extra = '') => `<div ${extra}><span class="ico">${ic(icone)}</span><span class="tit">${titulo}</span><b>${valor}</b><span>${rodape || '&nbsp;'}</span></div>`;
    const cartoes = [
      cartao('truck', 'Cargas em andamento', r.em_aberto, r.em_rota ? `${r.em_rota} saiu(íram) para entrega` : '', 'data-ir="cargas" data-filtro="transito"'),
      cartao('alerta', 'Atrasadas', r.atrasadas, r.com_ocorrencia ? `${r.com_ocorrencia} com ocorrência` : 'passaram da previsão', `data-ir="cargas" data-filtro="atrasadas" class="${r.atrasadas ? 'alerta' : ''}"`),
      cartao('grafico', 'Entregas no prazo (30 dias)', r.pontualidade == null ? '—' : `${num(r.pontualidade, 1)}%`, `${r.entregues_30} entrega(s)`,
        `class="${r.pontualidade >= 95 ? 'bom' : r.pontualidade != null && r.pontualidade < 85 ? 'alerta' : ''}"`),
      eu.pode_financeiro ? cartao('cash', 'Frete do mês (você paga)', moeda(r.frete_mes), `${r.emitidos_mes} CT-e no mês`) : '',
      eu.pode_financeiro ? cartao('doc', 'Faturas em aberto', moeda(r.faturas_saldo), `${r.faturas_abertas} fatura(s)${r.faturas_vencidas ? ` · ${r.faturas_vencidas} vencida(s)` : ''}`,
        `data-ir="financeiro" class="${r.faturas_vencidas ? 'alerta' : ''}"`) : '',
      cartao('tag', 'Cotações para responder', r.cotacoes_para_responder, r.cotacoes_pedidas ? `${r.cotacoes_pedidas} em cálculo` : '', `data-ir="cotacoes" class="${r.cotacoes_para_responder ? 'alerta' : ''}"`),
      cartao('cal', 'Coletas em aberto', r.coletas_abertas, '', 'data-ir="coletas"'),
    ].join('');
    const hora = Number(new Date().toLocaleString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }));
    $('ptInicio').innerHTML = `<div class="pt-saudacao"><h2>${hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'}, ${esc(String(eu.nome || '').split(' ')[0])}</h2>
        <p>Resumo das cargas${eu.cliente_nome ? ` de <b>${esc(eu.cliente_nome)}</b>` : ''} com ${esc(empresa?.nome || 'a transportadora')}.</p></div>
      <div class="pt-numeros">${cartoes}</div>
      <div class="cartao"><h2>Últimas movimentações</h2>${r.movimentos.length ? `<ul class="pt-tempo">${r.movimentos.map((m) => `<li><a href="#" data-carga="${m.cte_id}"><b>${esc(m.descricao)}</b></a> · CT-e ${esc(m.cte)} · ${esc(m.destinatario_nome || '')}
        <small>${diaHora(m.data_hora)}${m.local ? ` · ${esc(m.local)}` : ''}</small></li>`).join('')}</ul>` : '<p class="fraco">Nenhuma movimentação ainda.</p>'}</div>`;
  }
  $('ptInicio').addEventListener('click', (e) => {
    const c = e.target.closest('[data-carga]'); if (c) { e.preventDefault(); abrirCarga(Number(c.dataset.carga)); return; }
    const b = e.target.closest('[data-ir]'); if (!b) return;
    if (b.dataset.filtro) filtroCargas = b.dataset.filtro;
    irPara(b.dataset.ir);
  });

  // ---------- Cargas ----------
  let filtroCargas = 'transito'; let tempoBusca = null;
  const SIT = { pendente: 'azul', em_transito: 'azul', em_rota: 'azul', agendada: 'azul', ocorrencia: 'laranja', entregue: 'verde', devolvido: 'vermelho', cancelado: 'cinza' };
  const etiqueta = (c) => `<span class="sit ${c.atrasada ? 'laranja' : SIT[c.situacao] || 'azul'}">${esc(c.situacao_texto)}${c.atrasada ? ' · atrasada' : ''}</span>`;
  async function carregarCargas() {
    document.querySelectorAll('#ptFiltrosCargas [data-filtro]').forEach((b) => b.classList.toggle('ativo', b.dataset.filtro === filtroCargas));
    const lista = await api(`/cargas?${new URLSearchParams({ filtro: filtroCargas, busca: $('ptBuscaCargas').value.trim() })}`);
    $('ptCargas').innerHTML = lista.length ? lista.map((c) => `<div class="pt-item clicavel ${c.atrasada ? 'laranja' : SIT[c.situacao] || 'azul'}" data-carga="${c.id}">
        <div><div class="titulo">${c.nfs.length ? `NF ${esc(c.nfs.join(', '))}` : `CT-e ${esc(c.cte)}`} · ${esc(c.destinatario || '')}</div>
          <div class="linha">${esc(c.origem || '')} → ${esc(c.destino || '')} · CT-e ${esc(c.cte)} de ${diaTs(c.emissao)}${c.volumes ? ` · ${num(c.volumes)} vol.` : ''}${c.papeis.length ? ` · você é ${esc(c.papeis.join(' e ').toLowerCase())}` : ''}</div></div>
        <div class="dir">${etiqueta(c)}<div class="linha">${c.entregue_em ? `entregue ${diaTs(c.entregue_em)}` : c.agendamento ? `agendada ${dia(c.agendamento.data)}${c.agendamento.janela ? `, ${esc(c.agendamento.janela)}` : ''}` : c.previsao ? `previsão ${dia(c.previsao)}` : ''}</div>${c.valor != null ? `<div class="valor">${moeda(c.valor)}</div>` : ''}</div>
      </div>`).join('') : vazio('box', filtroCargas === 'transito' ? 'Nenhuma carga em andamento agora.' : 'Nenhuma carga encontrada.');
  }
  $('ptFiltrosCargas').addEventListener('click', (e) => { const b = e.target.closest('[data-filtro]'); if (b) { filtroCargas = b.dataset.filtro; carregarCargas().catch((err) => aviso(err.message)); } });
  $('ptBuscaCargas').addEventListener('input', () => { clearTimeout(tempoBusca); tempoBusca = setTimeout(() => carregarCargas().catch((err) => aviso(err.message)), 350); });
  $('ptCargas').addEventListener('click', (e) => { const b = e.target.closest('[data-carga]'); if (b) abrirCarga(Number(b.dataset.carga)); });

  async function abrirCarga(id) {
    try {
      const c = await api(`/cargas/${id}`);
      const comp = c.componentes?.length ? `<table class="pt-tab" style="margin-top:8px;"><tbody>${c.componentes.map((x) => `<tr><td>${esc(x.nome)}</td><td class="n">${moeda(x.valor)}</td></tr>`).join('')}
        <tr><th>Total do frete</th><th class="n">${moeda(c.valor)}</th></tr></tbody></table>` : '';
      abrirJanela(`<b style="font-size:17px;">CT-e ${esc(c.cte)}</b> ${etiqueta(c)}<div class="fraco" style="font-size:12.5px;">${c.chave ? esc(c.chave.replace(/(\d{4})(?=\d)/g, '$1 ')) : ''}</div>`,
        `${c.demonstracao ? '<div class="pt-aviso laranja">CT-e de demonstração (sem valor fiscal).</div>' : ''}
        <div class="pt-dados">
          <div>Remetente<b>${esc(c.remetente || '')}</b></div><div>Destinatário<b>${esc(c.destinatario || '')}</b></div>
          <div>Trajeto<b>${esc(c.origem || '')} → ${esc(c.destino || '')}</b></div><div>Nota(s) fiscal(is)<b>${esc(c.nfs.join(', ') || '—')}</b></div>
          <div>Carga<b>${[c.volumes ? `${num(c.volumes)} vol.` : '', c.peso ? `${num(c.peso, 1)} kg` : ''].filter(Boolean).join(' · ') || '—'}</b></div>
          <div>${c.entregue_em ? 'Entregue em' : c.agendamento ? 'Entrega agendada' : 'Previsão de entrega'}<b>${c.entregue_em ? diaHora(c.entregue_em) : c.agendamento ? `${dia(c.agendamento.data)}${c.agendamento.janela ? `, ${esc(c.agendamento.janela)}` : ''}` : dia(c.previsao) || '—'}</b></div>
          ${c.recebedor_nome ? `<div>Recebido por<b>${esc(c.recebedor_nome)}</b></div>` : ''}
          ${c.chegada_prevista ? `<div>Caminhão a caminho<b>chega ~${esc(new Date(c.chegada_prevista.chegada_prevista).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }))}</b><small>${c.chegada_prevista.entregas_antes ? `${c.chegada_prevista.entregas_antes} entrega(s) antes` : 'é a próxima entrega'}${c.chegada_prevista.km != null ? ` · ~${c.chegada_prevista.km} km` : ''}</small></div>` : ''}
        </div>${comp}
        <h3 style="font-size:15px; margin:16px 0 0;">Histórico</h3>
        <ul class="pt-tempo">${c.historico.map((h) => `<li><b>${esc(h.descricao)}</b>${h.recebedor ? ` — recebido por ${esc(h.recebedor)}` : ''}${h.nova_previsao ? ` — nova previsão ${dia(h.nova_previsao)}` : ''}
          <small>${diaHora(h.data_hora)}${h.local ? ` · ${esc(h.local)}` : ''}</small>
          ${h.tem_comprovante ? `<a class="botao sec" style="padding:4px 10px; font-size:12.5px; margin-top:4px;" href="${esc(link(`/cargas/${c.id}/comprovante/${h.id}`))}" target="_blank" rel="noopener">${ic('doc')} Comprovante</a>` : ''}
          ${h.tem_assinatura ? `<a class="botao sec" style="padding:4px 10px; font-size:12.5px; margin-top:4px;" href="${esc(link(`/cargas/${c.id}/comprovante/${h.id}?tipo=assinatura`))}" target="_blank" rel="noopener">${ic('check')} Assinatura</a>` : ''}</li>`).join('')}</ul>
        <div class="pt-rodape-j">
          <a class="botao sec" href="${esc(link(`/cargas/${c.id}/dacte`))}" target="_blank" rel="noopener">${ic('doc')} DACTE</a>
          ${c.tem_xml ? `<a class="botao sec" href="${esc(link(`/cargas/${c.id}/xml`))}">${ic('baixar')} XML</a>` : ''}
          <button class="sec" data-chamado-carga="${esc(c.cte)}">${ic('chat')} Falar sobre esta carga</button>
          <button data-fechar>Fechar</button></div>
        ${c.ve_valor ? '' : '<p class="fraco" style="font-size:12.5px; margin:8px 0 0;">Valores do frete não exibidos neste acesso (só quem paga o frete e tem acesso ao financeiro): o DACTE sai sem os valores e o XML não fica disponível.</p>'}`);
    } catch (err) { aviso(err.message); }
  }

  $('ptXmlLote').addEventListener('click', () => {
    const hoje = hojeIso();
    abrirJanela(`<b>${ic('baixar')} XML dos CT-e do período</b>`, `<p class="fraco" style="font-size:13.5px;">Baixa num arquivo .zip os XML dos CT-e em que a sua empresa paga o frete (máximo de 3 meses por vez). O XML traz o valor do frete, então os CT-e pagos por outra empresa ficam de fora.</p>
      <div class="pt-grade"><div><label for="ptjDe">De</label><input id="ptjDe" type="date" value="${hoje.slice(0, 8)}01" /></div><div><label for="ptjAte">Até</label><input id="ptjAte" type="date" value="${hoje}" /></div></div>
      <div class="pt-rodape-j"><button class="sec" data-fechar>Cancelar</button><button id="ptjBaixar">Baixar .zip</button></div>`);
    // Baixa pelo fetch (com o cabeçalho): se não houver XML, o aviso aparece aqui em vez de trocar a página.
    $('ptjBaixar').addEventListener('click', async () => {
      const botao = $('ptjBaixar'); botao.disabled = true;
      try {
        const r = await fetch(`/api/portal/xmls.zip?${new URLSearchParams({ de: $('ptjDe').value, ate: $('ptjAte').value })}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error((await r.text().catch(() => '')) || 'Não foi possível baixar agora.');
        const nome = (/filename="?([^";]+)"?/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'cte-xml.zip';
        const url = URL.createObjectURL(await r.blob());
        const a = Object.assign(document.createElement('a'), { href: url, download: nome });
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
        fecharJanela();
      } catch (err) { aviso(err.message); botao.disabled = false; }
    });
  });

  // ---------- Financeiro ----------
  const SIT_FAT = { aberta: ['Em aberto', 'azul'], parcial: ['Pago em parte', 'laranja'], paga: ['Paga', 'verde'] };
  async function carregarFaturas() {
    const lista = await api('/faturas');
    $('ptFaturas').innerHTML = lista.length ? lista.map((f) => {
      const [txt, cor] = f.vencida ? ['Vencida', 'vermelho'] : SIT_FAT[f.status] || [f.status, 'cinza'];
      return `<div class="pt-item ${cor}">
        <div><div class="titulo">Fatura nº ${esc(f.numero)}</div><div class="linha">Emitida em ${dia(f.emissao)} · ${f.qtd_ctes} CT-e · vencimento <b>${dia(f.vencimento)}</b></div>
          ${f.boleto_linha ? `<div class="linha" style="margin-top:4px;">Linha digitável: <span class="linha-digitavel">${esc(f.boleto_linha.replace(/^(\d{5})(\d{5})(\d{5})(\d{6})(\d{5})(\d{6})(\d)(\d{14})$/, '$1.$2 $3.$4 $5.$6 $7 $8'))}</span></div>` : ''}</div>
        <div class="dir"><span class="sit ${cor}">${txt}</span><div class="valor">${moeda(f.valor)}</div>${f.status === 'parcial' ? `<div class="linha">falta ${moeda(f.saldo)}</div>` : ''}</div>
        <div class="pt-acoes"><a class="botao sec" href="${esc(link(`/faturas/${f.id}/imprimir`))}" target="_blank" rel="noopener">${ic('doc')} Fatura</a>
          ${f.tem_boleto ? `<a class="botao sec" href="${esc(link(`/faturas/${f.id}/boleto`))}" target="_blank" rel="noopener">${ic('cash')} Boleto</a><button class="sec" data-copiar="${esc(f.boleto_linha)}">Copiar linha digitável</button>` : ''}</div>
      </div>`;
    }).join('') : vazio('doc', 'Nenhuma fatura.');
  }
  $('ptFaturas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = '✓ Copiada'; } catch { aviso(b.dataset.copiar); }
  });

  // ---------- Coletas ----------
  const SIT_COL = { pendente: 'azul', programada: 'azul', em_coleta: 'azul', coletada: 'verde', nao_coletada: 'laranja', cancelada: 'cinza' };
  const ETAPAS = ['Pedida', 'Programada', 'Saiu para coletar', 'Coletada'];
  const POSICAO = { pendente: 0, programada: 1, em_coleta: 2, coletada: 3, nao_coletada: 3 };
  const placaFmt = (p) => { const t = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return t.length === 7 ? `${t.slice(0, 3)}-${t.slice(3)}` : t; };
  const cidade = (c, uf) => (c ? `${esc(c)}${uf ? `/${esc(uf)}` : ''}` : '');
  const dado = (icone, rotulo, valor) => (valor ? `<div>${ic(icone)}<span>${rotulo}<b>${valor}</b></span></div>` : '');
  function cartaoColeta(k) {
    const pos = POSICAO[k.status] ?? 0;
    const etapas = k.status === 'cancelada' ? '' : `<div class="pt-etapas">${ETAPAS.map((t, i) => {
      if (k.status === 'nao_coletada' && i === 3) return '<div class="falhou">Não coletada</div>';
      return `<div class="${i < pos || (i === pos && k.status === 'coletada') ? 'feita' : i === pos ? 'atual' : ''}">${t}</div>`;
    }).join('')}</div>`;
    const janela = [k.hora_de ? `das ${esc(k.hora_de)}` : '', k.hora_ate ? `às ${esc(k.hora_ate)}` : ''].filter(Boolean).join(' ');
    const volumes = k.volumes_coletados != null && k.status === 'coletada'
      ? `${num(k.volumes_coletados)} coletado(s)${k.volumes ? ` de ${num(k.volumes)}` : ''}` : k.volumes ? `${num(k.volumes)} vol.${k.peso_kg ? ` · ${num(k.peso_kg, 1)} kg` : ''}` : '';
    const ficha = [
      dado('cal', 'Pedida em', esc(k.pedida_em)),
      dado('relogio', 'Data agendada', `${dia(k.data_coleta)}${janela ? ` <small>${janela}</small>` : ''}`),
      dado('check', 'Coletada em', esc(k.coletada_em)),
      dado('truck', 'Saiu para coletar', k.status !== 'coletada' ? esc(k.saiu_em) : ''),
      dado('user', 'Motorista', esc(k.motorista)),
      dado('placa', 'Veículo', k.placa ? `<span class="pt-placa">${esc(placaFmt(k.placa))}</span>${k.veiculo ? ` <small>${esc(k.veiculo)}</small>` : ''}` : ''),
      dado('box', 'Volumes', volumes),
      dado('user', 'Entregue por', esc(k.entregue_por)),
      dado('doc', 'Nota(s) fiscal(is)', esc(k.notas)),
      dado('doc', 'CT-e', k.cte ? (k.carga_id ? `<a href="#" data-carga="${k.carga_id}">${esc(k.cte)}</a>` : esc(k.cte)) : ''),
    ].join('');
    const aguardando = ['pendente'].includes(k.status) ? '<div class="pt-aviso">A transportadora vai programar a coleta e informar o motorista e o veículo aqui.</div>' : '';
    return `<div class="pt-item pt-coleta ${SIT_COL[k.status] || 'azul'}">
      <div class="cab"><div><div class="titulo">Coleta nº ${k.id} · ${esc(k.remetente_nome)}${k.tomador === 'destinatario' ? ' <span class="sit cinza">Reversa</span>' : ''}</div>
        <div class="rota">${ic('pin')} ${cidade(k.cidade, k.uf)}${k.destino_cidade ? ` ${ic('seta')} ${cidade(k.destino_cidade, k.destino_uf)}` : ''}</div></div>
        <span class="sit ${SIT_COL[k.status] || 'azul'}">${esc(k.status_texto)}</span></div>
      ${etapas}
      <div class="pt-ficha">${ficha}</div>
      ${k.motivo && ['nao_coletada', 'cancelada'].includes(k.status) ? `<div class="pt-alerta-linha">${ic('alerta')} ${esc(k.motivo)}</div>` : aguardando}
    </div>`;
  }
  let enderecoCliente = null;
  async function carregarColetas() {
    const r = await api('/coletas');
    enderecoCliente = r.endereco;
    $('ptColetas').innerHTML = r.coletas.length ? r.coletas.map(cartaoColeta).join('')
      : vazio('truck', 'Nenhuma coleta. Clique em "Pedir coleta" quando tiver mercadoria para enviar.');
  }
  $('ptColetas').addEventListener('click', (e) => { const b = e.target.closest('[data-carga]'); if (b) { e.preventDefault(); abrirCarga(Number(b.dataset.carga)); } });
  // Pedir coleta: no endereço da empresa do cliente (já preenchido com o endereço do acesso/cadastro) ou
  // coleta reversa — buscar em outro local (fornecedor, cliente dele) e trazer para a empresa dele.
  const ufOpcoes = (sel) => `<option value="">—</option>${UFS.map((u) => `<option ${u === sel ? 'selected' : ''}>${u}</option>`).join('')}`;
  const enderecoTexto = (e) => [[e.logradouro, e.numero].filter(Boolean).join(', ') + (e.complemento ? ` - ${e.complemento}` : ''), e.bairro,
    e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : '', e.cep ? `CEP ${String(e.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : ''].filter(Boolean).map(esc).join(' · ');
  const camposEndereco = (e = {}) => `
        <div class="largo"><label for="pkEnd">Endereço</label><input id="pkEnd" maxlength="200" value="${esc(e.logradouro || '')}" /></div>
        <div><label for="pkNum">Número</label><input id="pkNum" maxlength="30" value="${esc(e.numero || '')}" /></div>
        <div><label for="pkCpl">Complemento</label><input id="pkCpl" maxlength="120" value="${esc(e.complemento || '')}" /></div>
        <div><label for="pkBairro">Bairro</label><input id="pkBairro" maxlength="120" value="${esc(e.bairro || '')}" /></div>
        <div><label for="pkCep">CEP</label><input id="pkCep" inputmode="numeric" maxlength="9" value="${esc(e.cep || '')}" /></div>
        <div><label for="pkCid">Cidade</label><input id="pkCid" maxlength="120" value="${esc(e.cidade || '')}" /></div>
        <div><label for="pkUf">UF</label><select id="pkUf">${ufOpcoes(e.uf)}</select></div>`;
  $('ptNovaColeta').addEventListener('click', () => {
    const e = enderecoCliente || {};
    const temEndereco = !!(e.logradouro && e.cidade);
    const nomeCliente = e.nome || eu.cliente_nome || '';
    abrirJanela(`<b style="font-size:17px;">${ic('truck')} Pedir coleta</b>`, `
      <div class="pt-tipo" role="radiogroup">
        <label><input type="radio" name="pkTipo" value="normal" checked /><span>${ic('box')}<b>Coleta no meu endereço</b><small>A transportadora busca a mercadoria na sua empresa.</small></span></label>
        <label><input type="radio" name="pkTipo" value="reversa" /><span>${ic('seta')}<b>Coleta reversa</b><small>Buscar em outro local (fornecedor, cliente seu) e trazer para a sua empresa.</small></span></label>
      </div>
      <div id="pkNormal">
        ${temEndereco ? `<div class="pt-endereco">${ic('pin')}<div><small>Coletar em</small><b>${esc(nomeCliente)}</b><span>${enderecoTexto(e)}</span></div>
          <button type="button" class="sec" id="pkAlterar">Alterar</button></div>` : '<div class="pt-aviso">Informe o endereço da coleta. Para vir preenchido nas próximas vezes, peça à transportadora para cadastrar o seu endereço no seu acesso.</div>'}
        <div id="pkCamposNormal" class="pt-grade ${temEndereco ? 'oculto' : ''}" style="margin-top:12px;">
          <div class="inteiro"><label for="pkRem">Local da coleta (empresa)</label><input id="pkRem" maxlength="200" value="${esc(nomeCliente)}" /></div>
          ${camposEndereco(e)}
        </div>
        <div class="pt-secao">Para onde vai (opcional)</div>
        <div class="pt-grade">
          <div class="largo"><label for="pkDesNome">Destinatário</label><input id="pkDesNome" maxlength="200" /></div>
          <div><label for="pkDesCid">Cidade de destino</label><input id="pkDesCid" maxlength="120" /></div>
          <div><label for="pkDesUf">UF</label><select id="pkDesUf">${ufOpcoes('')}</select></div>
        </div>
      </div>
      <div id="pkReversa" class="oculto">
        <div class="pt-secao">Onde buscar</div>
        <div class="pt-grade">
          <div class="largo"><label for="pkRvNome">Empresa / pessoa onde buscar</label><input id="pkRvNome" maxlength="200" /></div>
          <div><label for="pkRvDoc">CNPJ/CPF (se souber)</label><input id="pkRvDoc" maxlength="18" /></div>
          ${camposEndereco({}).replace(/id="pk(End|Num|Cpl|Bairro|Cep|Cid|Uf)"/g, 'id="pkRv$1"').replace(/for="pk(End|Num|Cpl|Bairro|Cep|Cid|Uf)"/g, 'for="pkRv$1"')}
        </div>
        <div class="pt-endereco" style="margin-top:12px;">${ic('home')}<div><small>Entregar em (frete por conta da sua empresa)</small><b>${esc(nomeCliente)}</b><span>${temEndereco ? enderecoTexto(e) : esc([e.cidade, e.uf].filter(Boolean).join('/'))}</span></div></div>
      </div>
      <div class="pt-secao">Quando e o quê</div>
      <div class="pt-grade">
        <div><label for="pkContato">Falar com</label><input id="pkContato" maxlength="120" value="${esc(eu.nome)}" /></div>
        <div><label for="pkFone">Telefone</label><input id="pkFone" maxlength="30" value="${esc(e.telefone || '')}" /></div>
        <div><label for="pkData">Data</label><input id="pkData" type="date" min="${hojeIso()}" value="${hojeIso()}" /></div>
        <div><label for="pkDe">Das</label><input id="pkDe" type="time" value="08:00" /></div>
        <div><label for="pkAte">Até</label><input id="pkAte" type="time" value="17:00" /></div>
        <div><label for="pkVol">Volumes</label><input id="pkVol" inputmode="numeric" /></div>
        <div><label for="pkPeso">Peso (kg)</label><input id="pkPeso" inputmode="decimal" /></div>
        <div><label for="pkNf">Nota(s) fiscal(is)</label><input id="pkNf" maxlength="250" /></div>
        <div class="inteiro"><label for="pkObs">Observação (doca, horário de almoço, carga paletizada...)</label><textarea id="pkObs" rows="2" maxlength="2000"></textarea></div>
      </div><p id="pkErro" class="erro oculto"></p>
      <div class="pt-rodape-j"><button class="sec" data-fechar>Cancelar</button><button id="pkEnviar">Pedir coleta</button></div>`);
    const reversa = () => janela.querySelector('input[name="pkTipo"]:checked').value === 'reversa';
    janela.querySelectorAll('input[name="pkTipo"]').forEach((r) => r.addEventListener('change', () => {
      $('pkNormal').classList.toggle('oculto', reversa()); $('pkReversa').classList.toggle('oculto', !reversa());
      // Na reversa, quem entrega a mercadoria é o outro local: o contato é de lá.
      if (reversa() && $('pkContato').value === eu.nome) { $('pkContato').value = ''; $('pkFone').value = ''; }
      if (!reversa() && !$('pkContato').value) { $('pkContato').value = eu.nome; $('pkFone').value = e.telefone || ''; }
    }));
    $('pkAlterar')?.addEventListener('click', () => { $('pkCamposNormal').classList.remove('oculto'); $('pkAlterar').closest('.pt-endereco').classList.add('oculto'); $('pkEnd').focus(); });
    $('pkEnviar').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      const ehReversa = reversa();
      try {
        const comum = { contato_nome: $('pkContato').value, contato_telefone: $('pkFone').value, data_coleta: $('pkData').value, hora_de: $('pkDe').value, hora_ate: $('pkAte').value,
          volumes: $('pkVol').value, peso_kg: $('pkPeso').value, notas: $('pkNf').value, observacao: $('pkObs').value };
        const corpo = ehReversa ? {
          ...comum, tomador: 'destinatario', remetente_nome: $('pkRvNome').value, remetente_doc: $('pkRvDoc').value,
          logradouro: $('pkRvEnd').value, numero: $('pkRvNum').value, complemento: $('pkRvCpl').value, bairro: $('pkRvBairro').value, cidade: $('pkRvCid').value, uf: $('pkRvUf').value, cep: $('pkRvCep').value,
          destinatario_doc: e.documento || eu.documentos[0], destinatario_nome: nomeCliente, destino_cidade: e.cidade || '', destino_uf: e.uf || '',
        } : {
          ...comum, tomador: 'remetente', remetente_nome: $('pkRem').value, remetente_doc: e.documento || eu.documentos[0], remetente_ie: e.ie,
          cod_municipio: e.cidade && e.cidade === $('pkCid').value ? e.cod_municipio : null,
          logradouro: $('pkEnd').value, numero: $('pkNum').value, complemento: $('pkCpl').value, bairro: $('pkBairro').value, cidade: $('pkCid').value, uf: $('pkUf').value, cep: $('pkCep').value,
          destinatario_nome: $('pkDesNome').value, destino_cidade: $('pkDesCid').value, destino_uf: $('pkDesUf').value,
        };
        if (ehReversa && !corpo.remetente_nome.trim()) throw new Error('Informe onde buscar a mercadoria.');
        if (!corpo.logradouro.trim() || !corpo.cidade.trim() || !corpo.uf) throw new Error('Informe o endereço da coleta (rua, cidade e UF).');
        const r = await api('/coletas', { method: 'POST', body: JSON.stringify(corpo) });
        fecharJanela(); await carregarColetas();
        aviso(`Coleta nº ${r.id} pedida${ehReversa ? ' (reversa)' : ''}. A transportadora vai programar e você acompanha a situação aqui.`);
      } catch (err) { if ($('pkErro')) { $('pkErro').textContent = err.message; $('pkErro').classList.remove('oculto'); b.disabled = false; } else aviso(err.message); }
    });
  });

  // ---------- Paletes ----------
  async function carregarPaletes() {
    const r = await api('/paletes');
    const cor = { aberto: 'laranja', devolvido: 'verde', cobrado: 'cinza' };
    $('ptPaletes').innerHTML = `<div class="pt-numeros">${r.saldos.map((s) => `<div class="${s.saldo > 0 ? 'alerta' : 'bom'}"><span class="ico">${ic('box')}</span><span class="tit">${esc(s.tipo_nome)}</span>
        <b>${Math.abs(s.saldo)}</b><span>${s.saldo > 0 ? 'paletes da transportadora com você' : 'paletes seus com a transportadora'}</span></div>`).join('') || '<div><span class="tit">Saldo</span><b>0</b><span>nenhum palete pendente</span></div>'}</div>
      <div class="cartao"><h2>Vales-palete</h2>${r.vales.length ? r.vales.map((v) => `<div class="pt-item ${v.vencido ? 'vermelho' : cor[v.status] || 'azul'}">
        <div><div class="titulo">Vale nº ${v.numero} · ${v.quantidade} palete(s) ${esc(v.tipo_nome)}</div>
          <div class="linha">Emitido ${dia(v.emissao)}${v.cte ? ` · CT-e ${esc(v.cte)}` : ''} · devolver até <b>${dia(v.vencimento)}</b>${v.status === 'aberto' && v.pendente !== v.quantidade ? ` · faltam ${v.pendente}` : ''}</div></div>
        <div class="dir"><span class="sit ${v.vencido ? 'vermelho' : cor[v.status] || 'azul'}">${v.vencido ? 'Vencido' : esc(v.status_nome)}</span>
          <a class="botao sec" style="padding:4px 10px; font-size:12.5px;" href="${esc(link(`/paletes/vales/${v.id}`))}" target="_blank" rel="noopener">${ic('doc')} Ver vale</a></div></div>`).join('')
        : '<p class="fraco">Nenhum vale-palete.</p>'}
        <p class="fraco" style="font-size:12.5px; margin-top:10px;">Para combinar a devolução dos paletes, abra um chamado em Atendimento. Vale vencido pode ser cobrado na sua próxima fatura.</p></div>`;
  }

  // ---------- Atendimento (SAC) ----------
  const SIT_SAC = { aberto: 'laranja', em_andamento: 'azul', aguardando: 'laranja', resolvido: 'verde', cancelado: 'cinza' };
  const TEXTO_SAC = { aguardando: 'Respondido · aguardando você' };
  let assuntosSac = null;
  async function carregarChamados() {
    const r = await api('/sac');
    assuntosSac = r.assuntos;
    $('ptChamados').innerHTML = r.chamados.length ? r.chamados.map((c) => `<div class="pt-item clicavel ${SIT_SAC[c.status] || 'azul'}" data-chamado="${c.id}">
        <div><div class="titulo">${esc(c.titulo)}</div>
          <div class="linha">Protocolo <b>${esc(c.protocolo)}</b> · ${esc(c.assunto_nome)} · aberto ${diaHora(c.criado_em)} · ${c.mensagens} mensagem(ns)</div></div>
        <div class="dir"><span class="sit ${SIT_SAC[c.status] || 'azul'}">${esc(TEXTO_SAC[c.status] || c.status_nome)}</span>
          <div class="linha">${c.status === 'resolvido' && !c.avaliacao ? 'avalie o atendimento' : c.avaliacao ? '★'.repeat(c.avaliacao) : c.ultimo_autor === 'equipe' ? 'nova resposta' : `atualizado ${diaHora(c.atualizado_em)}`}</div></div>
      </div>`).join('') : vazio('chat', 'Nenhum chamado. Para atraso, avaria, comprovante, 2ª via de boleto ou qualquer dúvida, clique em "Abrir chamado".');
  }
  $('ptChamados').addEventListener('click', (e) => { const b = e.target.closest('[data-chamado]'); if (b) abrirChamado(Number(b.dataset.chamado)); });
  janela.addEventListener('click', (e) => { const b = e.target.closest('[data-chamado-carga]'); if (b) novoChamado(b.dataset.chamadoCarga); });
  async function novoChamado(cte = '') {
    try { if (!assuntosSac) assuntosSac = (await api('/sac')).assuntos; } catch (err) { aviso(err.message); return; }
    abrirJanela(`<b style="font-size:17px;">${ic('chat')} Abrir chamado</b>`, `
      <div class="pt-grade">
        <div><label for="scAssunto">Assunto</label><select id="scAssunto">${Object.entries(assuntosSac).map(([k, t]) => `<option value="${k}" ${k === (cte ? 'atraso' : 'outros') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div><label for="scCte">Nº da NF ou do CT-e (se for sobre uma carga)</label><input id="scCte" maxlength="44" value="${esc(cte)}" /></div>
        <div class="inteiro"><label for="scTitulo">Resumo</label><input id="scTitulo" maxlength="200" placeholder="Ex.: Carga da NF 1234 não chegou" /></div>
        <div class="inteiro"><label for="scTexto">Conte o que aconteceu</label><textarea id="scTexto" rows="5" maxlength="10000"></textarea></div>
      </div><p id="scErro" class="erro oculto"></p>
      <p class="fraco" style="font-size:12.5px;">Você recebe o número do protocolo e as respostas por e-mail (${esc(eu.email)}) e aqui no portal.</p>
      <div class="pt-rodape-j"><button class="sec" data-fechar>Cancelar</button><button id="scEnviar">Abrir chamado</button></div>`);
    $('scEnviar').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        if (!$('scTexto').value.trim()) throw new Error('Conte o que aconteceu.');
        const r = await api('/sac', { method: 'POST', body: JSON.stringify({ assunto: $('scAssunto').value, cte: $('scCte').value, titulo: $('scTitulo').value, texto: $('scTexto').value }) });
        if (abaAtual === 'sac') await carregarChamados();
        aviso(`Chamado aberto com o protocolo ${r.protocolo}. A transportadora responde até ${diaHora(r.prazo_resposta)}.`);
      } catch (err) { $('scErro').textContent = err.message; $('scErro').classList.remove('oculto'); b.disabled = false; }
    });
  }
  $('ptNovoChamado').addEventListener('click', () => novoChamado());
  async function abrirChamado(id) {
    let c;
    try { c = await api(`/sac/${id}`); } catch (err) { aviso(err.message); return; }
    const estrelas = (n) => [1, 2, 3, 4, 5].map((i) => `<button type="button" class="pt-estrela ${i <= n ? 'ativa' : ''}" data-nota="${i}" aria-label="${i} estrela(s)">★</button>`).join('');
    abrirJanela(`<b style="font-size:17px;">Protocolo ${esc(c.protocolo)}</b> <span class="sit ${SIT_SAC[c.status] || 'azul'}">${esc(TEXTO_SAC[c.status] || c.status_nome)}</span><div class="fraco" style="font-size:12.5px;">${esc(c.titulo)} · ${esc(c.assunto_nome)}${c.cte?.numero ? ` · CT-e ${esc(c.cte.numero)}` : ''}${c.responsavel_nome ? ` · atendimento: ${esc(c.responsavel_nome)}` : ''}</div>`, `
      <div class="pt-conversa">${c.mensagens.map((m) => `<div class="pt-msg ${m.autor === 'equipe' ? 'equipe' : ''}"><small><b>${esc(m.autor === 'equipe' ? `${m.autor_nome} (transportadora)` : m.autor_nome || 'Você')}</b> · ${diaHora(m.criado_em)}</small>${esc(m.texto)}</div>`).join('')}</div>
      ${c.status === 'resolvido' ? `<div class="pt-avaliar"><b>${c.avaliacao ? 'Sua avaliação' : 'Como foi o atendimento?'}</b><div id="scEstrelas">${estrelas(c.avaliacao || 0)}</div>
        <input id="scComentario" maxlength="500" placeholder="Comentário (opcional)" value="${esc(c.avaliacao_comentario || '')}" /><button id="scAvaliar" class="sec">${c.avaliacao ? 'Mudar avaliação' : 'Enviar avaliação'}</button></div>` : ''}
      ${c.status === 'cancelado' ? '<p class="fraco">Este chamado foi cancelado. Se precisar, abra um novo.</p>' : `<div class="pt-grade" style="margin-top:12px;"><div class="inteiro"><label for="scResposta">${c.status === 'resolvido' ? 'Ainda precisa de algo? Escreva e o chamado é reaberto' : 'Escrever para a transportadora'}</label><textarea id="scResposta" rows="3" maxlength="10000"></textarea></div></div>`}
      <p id="scErro" class="erro oculto"></p>
      <div class="pt-rodape-j"><button class="sec" data-fechar>Fechar</button>${c.status === 'cancelado' ? '' : '<button id="scMandar">Enviar</button>'}</div>`);
    let nota = c.avaliacao || 0;
    $('scEstrelas')?.addEventListener('click', (e) => { const b = e.target.closest('[data-nota]'); if (!b) return; nota = Number(b.dataset.nota); $('scEstrelas').querySelectorAll('[data-nota]').forEach((x) => x.classList.toggle('ativa', Number(x.dataset.nota) <= nota)); });
    const falha = (err) => { $('scErro').textContent = err.message; $('scErro').classList.remove('oculto'); };
    $('scAvaliar')?.addEventListener('click', async () => {
      try { if (!nota) throw new Error('Escolha de 1 a 5 estrelas.'); await api(`/sac/${id}/avaliar`, { method: 'POST', body: JSON.stringify({ nota, comentario: $('scComentario').value }) }); await carregarChamados(); abrirChamado(id); } catch (err) { falha(err); }
    });
    $('scMandar')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      try {
        if (!$('scResposta').value.trim()) throw new Error('Escreva a mensagem.');
        b.disabled = true;
        await api(`/sac/${id}/mensagem`, { method: 'POST', body: JSON.stringify({ texto: $('scResposta').value }) });
        await carregarChamados(); abrirChamado(id);
      } catch (err) { b.disabled = false; falha(err); }
    });
  }

  // ---------- Cotações ----------
  const SIT_COT = { solicitada: ['Em cálculo', 'azul'], aberta: ['Aguardando sua resposta', 'laranja'], enviada: ['Aguardando sua resposta', 'laranja'], aprovada: ['Aprovada', 'verde'],
    recusada: ['Recusada', 'cinza'], vencida: ['Vencida', 'cinza'] };
  async function carregarCotacoes() {
    const lista = await api('/cotacoes');
    $('ptCotacoes').innerHTML = lista.length ? lista.map((t) => {
      const [txt, cor] = SIT_COT[t.situacao] || [t.situacao, 'cinza'];
      return `<div class="pt-item ${cor}">
        <div><div class="titulo">Cotação nº ${t.id} · ${esc(t.origem_cidade)}/${esc(t.origem_uf)} → ${esc(t.destino_cidade)}/${esc(t.destino_uf)}</div>
          <div class="linha">${diaTs(t.criado_em)} · ${[t.peso_kg ? `${num(t.peso_kg, 1)} kg` : '', t.volumes ? `${num(t.volumes)} vol.` : '', t.valor_mercadoria ? `NF ${moeda(t.valor_mercadoria)}` : ''].filter(Boolean).join(' · ')}
          ${t.situacao !== 'solicitada' ? ` · válida até ${dia(t.validade)}` : ''}${t.prazo_dias ? ` · prazo ${t.prazo_dias} dia(s) útil(eis)` : ''}</div>
          ${t.status === 'aprovada' ? `<div class="linha" style="color:var(--verde);">${t.coleta_id ? `Coleta nº ${t.coleta_id} registrada.` : 'A transportadora vai programar a coleta.'}</div>` : ''}</div>
        <div class="dir"><span class="sit ${cor}">${txt}</span>${Number(t.valor_total) > 0 ? `<div class="valor">${moeda(t.valor_total)}</div>` : ''}</div>
        <div class="pt-acoes">${t.situacao !== 'solicitada' ? `<a class="botao sec" href="${esc(link(`/cotacoes/${t.id}/proposta`))}" target="_blank" rel="noopener">${ic('doc')} Proposta</a>` : ''}
          ${t.pode_responder ? `<button data-aprovar="${t.id}" data-valor="${t.valor_total}">✓ Aprovar</button><button class="perigo" data-recusar="${t.id}">✗ Recusar</button>` : ''}</div>
      </div>`;
    }).join('') : vazio('tag', 'Nenhuma cotação. Clique em "Pedir cotação".');
  }
  $('ptCotacoes').addEventListener('click', (e) => {
    const a = e.target.closest('[data-aprovar]');
    if (a) {
      const id = a.dataset.aprovar;
      abrirJanela(`<b>Aprovar a cotação nº ${esc(id)}</b>`, `<p>Confirma o frete de <b>${moeda(a.dataset.valor)}</b>? A transportadora é avisada e programa a coleta.</p>
        <div class="pt-rodape-j"><button class="sec" data-fechar>Voltar</button><button id="ptjAprovar">✓ Aprovar</button></div>`);
      $('ptjAprovar').addEventListener('click', async () => {
        try { await api(`/cotacoes/${id}/aprovar`, { method: 'POST' }); fecharJanela(); await carregarCotacoes(); aviso('Cotação aprovada. A transportadora vai entrar em contato para a coleta.'); } catch (err) { aviso(err.message); }
      });
      return;
    }
    const r = e.target.closest('[data-recusar]');
    if (r) {
      const id = r.dataset.recusar;
      abrirJanela(`<b>Recusar a cotação nº ${esc(id)}</b>`, `<label for="ptjMotivo">Pode contar o motivo? (ajuda a transportadora a melhorar)</label><input id="ptjMotivo" maxlength="200" placeholder="Ex.: preço, prazo..." />
        <div class="pt-rodape-j"><button class="sec" data-fechar>Voltar</button><button class="perigo" id="ptjRecusar">Recusar</button></div>`);
      $('ptjRecusar').addEventListener('click', async () => {
        try { await api(`/cotacoes/${id}/recusar`, { method: 'POST', body: JSON.stringify({ motivo: $('ptjMotivo').value }) }); fecharJanela(); await carregarCotacoes(); } catch (err) { aviso(err.message); }
      });
    }
  });
  $('ptNovaCotacao').addEventListener('click', async () => {
    if (!enderecoCliente) { try { enderecoCliente = (await api('/coletas')).endereco; } catch { /* sem endereço */ } }
    const e = enderecoCliente || {};
    abrirJanela(`<b style="font-size:17px;">${ic('tag')} Pedir cotação</b>`, `<div class="pt-grade">
        <div><label for="pqOriCid">Origem (cidade)</label><input id="pqOriCid" maxlength="120" value="${esc(e.cidade || '')}" /></div>
        <div><label for="pqOriUf">UF</label><select id="pqOriUf">${UFS.map((u) => `<option ${u === e.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div><label for="pqDesCid">Destino (cidade)</label><input id="pqDesCid" maxlength="120" /></div>
        <div><label for="pqDesUf">UF</label><select id="pqDesUf"><option value=""></option>${UFS.map((u) => `<option>${u}</option>`).join('')}</select></div>
        <div><label for="pqPeso">Peso (kg)</label><input id="pqPeso" inputmode="decimal" /></div>
        <div><label for="pqVol">Volumes</label><input id="pqVol" inputmode="numeric" /></div>
        <div><label for="pqCub">Cubagem (m³)</label><input id="pqCub" inputmode="decimal" /></div>
        <div><label for="pqValor">Valor da mercadoria (R$)</label><input id="pqValor" inputmode="decimal" /></div>
        <div><label for="pqProduto">Produto</label><input id="pqProduto" maxlength="120" /></div>
        <div><label for="pqPapel">Quem paga o frete</label><select id="pqPapel"><option value="remetente">Nós enviamos (CIF)</option><option value="destinatario">Nós recebemos (FOB)</option></select></div>
        <div class="inteiro"><label for="pqObs">Observação</label><textarea id="pqObs" rows="2" maxlength="2000"></textarea></div>
      </div><p id="pqErro" class="erro oculto"></p>
      <div class="pt-rodape-j"><button class="sec" data-fechar>Cancelar</button><button id="pqEnviar">Pedir cotação</button></div>`);
    $('pqEnviar').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const r = await api('/cotacoes', { method: 'POST', body: JSON.stringify({
          origem_cidade: $('pqOriCid').value, origem_uf: $('pqOriUf').value, destino_cidade: $('pqDesCid').value, destino_uf: $('pqDesUf').value,
          peso_kg: $('pqPeso').value, volumes: $('pqVol').value, cubagem_m3: $('pqCub').value, valor_mercadoria: $('pqValor').value, produto: $('pqProduto').value,
          cliente_papel: $('pqPapel').value, observacao: $('pqObs').value,
        }) });
        fecharJanela(); await carregarCotacoes();
        aviso(r.automatica ? `Cotação nº ${r.id}: frete de ${moeda(r.valor_total)}. Se estiver de acordo, clique em Aprovar.` : `Cotação nº ${r.id} pedida. A transportadora calcula e ela aparece aqui para você aprovar.`);
      } catch (err) { $('pqErro').textContent = err.message; $('pqErro').classList.remove('oculto'); b.disabled = false; }
    });
  });

  // ---------- Começo ----------
  (async () => {
    try { empresa = await api('/transportadora'); } catch { empresa = { nome: 'Portal do cliente' }; }
    $('ptNomeEmpresa').textContent = empresa.nome;
    document.title = `Portal do cliente — ${empresa.nome}`;
    if (empresa.logo) { $('ptLogo').src = empresa.logo; $('ptLogo').classList.remove('oculto'); }
    $('ptContato').textContent = [empresa.telefone, empresa.email].filter(Boolean).join(' · ');
    const redefinir = (location.hash.match(/redefinir=([a-f0-9]{48})/) || [])[1];
    if (redefinir) { telaSenha(true, redefinir); return; }
    if (!token) { telaEntrada(); return; }
    try { await iniciarApp(); } catch { if (!eu && token) sair(); }
  })();
})();
