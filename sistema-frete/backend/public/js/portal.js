// Portal do cliente (embarcador): entrada, cargas, financeiro, coletas e cotações.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v, c = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
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
    abrirJanela('<b>🔑 Trocar a senha</b>', `<div class="pt-grade" style="grid-template-columns:1fr;">
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
    $('ptCliente').textContent = `${eu.cliente_nome || eu.nome} · ${eu.nome}`;
    if (empresa?.logo) { $('ptLogoApp').src = empresa.logo; $('ptLogoApp').classList.remove('oculto'); }
    $('ptAbaFin').classList.toggle('oculto', !eu.pode_financeiro);
    irPara(abaAtual);
  }
  function irPara(aba) {
    if (aba === 'financeiro' && !eu.pode_financeiro) aba = 'inicio';
    abaAtual = aba;
    document.querySelectorAll('#ptAbas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
    document.querySelectorAll('[data-pagina]').forEach((s) => s.classList.toggle('oculto', s.dataset.pagina !== aba));
    ({ inicio: carregarInicio, cargas: carregarCargas, financeiro: carregarFaturas, coletas: carregarColetas, cotacoes: carregarCotacoes }[aba])().catch((err) => aviso(err.message));
  }
  $('ptAbas').addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) irPara(b.dataset.aba); });

  // ---------- Início ----------
  async function carregarInicio() {
    const r = await api('/inicio');
    const cartoes = [
      `<div data-ir="cargas" data-filtro="transito">Cargas em andamento<b>${r.em_aberto}</b>${r.em_rota ? `${r.em_rota} saiu(íram) para entrega` : '&nbsp;'}</div>`,
      `<div data-ir="cargas" data-filtro="atrasadas" class="${r.atrasadas ? 'alerta' : ''}">Atrasadas<b>${r.atrasadas}</b>${r.com_ocorrencia ? `${r.com_ocorrencia} com ocorrência` : 'passaram da previsão'}</div>`,
      `<div class="${r.pontualidade >= 95 ? 'bom' : r.pontualidade != null && r.pontualidade < 85 ? 'alerta' : ''}">Entregas no prazo (30 dias)<b>${r.pontualidade == null ? '—' : `${num(r.pontualidade, 1)}%`}</b>${r.entregues_30} entrega(s)</div>`,
      eu.pode_financeiro ? `<div>Frete do mês (você paga)<b>${moeda(r.frete_mes)}</b>${r.emitidos_mes} CT-e no mês</div>` : '',
      eu.pode_financeiro ? `<div data-ir="financeiro" class="${r.faturas_vencidas ? 'alerta' : ''}">Faturas em aberto<b>${moeda(r.faturas_saldo)}</b>${r.faturas_abertas} fatura(s)${r.faturas_vencidas ? ` · ${r.faturas_vencidas} vencida(s)` : ''}</div>` : '',
      `<div data-ir="cotacoes" class="${r.cotacoes_para_responder ? 'alerta' : ''}">Cotações para responder<b>${r.cotacoes_para_responder}</b>${r.cotacoes_pedidas ? `${r.cotacoes_pedidas} em cálculo` : '&nbsp;'}</div>`,
      `<div data-ir="coletas">Coletas em aberto<b>${r.coletas_abertas}</b>&nbsp;</div>`,
    ].join('');
    $('ptInicio').innerHTML = `<div class="pt-numeros">${cartoes}</div>
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
    $('ptCargas').innerHTML = lista.length ? lista.map((c) => `<div class="pt-item clicavel" data-carga="${c.id}">
        <div><div class="titulo">${c.nfs.length ? `NF ${esc(c.nfs.join(', '))}` : `CT-e ${esc(c.cte)}`} · ${esc(c.destinatario || '')}</div>
          <div class="linha">${esc(c.origem || '')} → ${esc(c.destino || '')} · CT-e ${esc(c.cte)} de ${diaTs(c.emissao)}${c.volumes ? ` · ${num(c.volumes)} vol.` : ''}${c.papeis.length ? ` · você é ${esc(c.papeis.join(' e ').toLowerCase())}` : ''}</div></div>
        <div class="dir">${etiqueta(c)}<div class="linha">${c.entregue_em ? `entregue ${diaTs(c.entregue_em)}` : c.previsao ? `previsão ${dia(c.previsao)}` : ''}</div>${c.valor != null ? `<div class="valor">${moeda(c.valor)}</div>` : ''}</div>
      </div>`).join('') : `<div class="pt-vazio">${filtroCargas === 'transito' ? 'Nenhuma carga em andamento agora.' : 'Nenhuma carga encontrada.'}</div>`;
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
          <div>${c.entregue_em ? 'Entregue em' : 'Previsão de entrega'}<b>${c.entregue_em ? diaHora(c.entregue_em) : dia(c.previsao) || '—'}</b></div>
          ${c.recebedor_nome ? `<div>Recebido por<b>${esc(c.recebedor_nome)}</b></div>` : ''}
        </div>${comp}
        <h3 style="font-size:15px; margin:16px 0 0;">Histórico</h3>
        <ul class="pt-tempo">${c.historico.map((h) => `<li><b>${esc(h.descricao)}</b>${h.recebedor ? ` — recebido por ${esc(h.recebedor)}` : ''}${h.nova_previsao ? ` — nova previsão ${dia(h.nova_previsao)}` : ''}
          <small>${diaHora(h.data_hora)}${h.local ? ` · ${esc(h.local)}` : ''}</small>
          ${h.tem_comprovante ? `<a class="botao sec" style="padding:4px 10px; font-size:12.5px; margin-top:4px;" href="${esc(link(`/cargas/${c.id}/comprovante/${h.id}`))}" target="_blank" rel="noopener">📷 Comprovante</a>` : ''}
          ${h.tem_assinatura ? `<a class="botao sec" style="padding:4px 10px; font-size:12.5px; margin-top:4px;" href="${esc(link(`/cargas/${c.id}/comprovante/${h.id}?tipo=assinatura`))}" target="_blank" rel="noopener">✍ Assinatura</a>` : ''}</li>`).join('')}</ul>
        <div class="pt-rodape-j">
          <a class="botao sec" href="${esc(link(`/cargas/${c.id}/dacte`))}" target="_blank" rel="noopener">🖨 DACTE</a>
          ${c.tem_xml ? `<a class="botao sec" href="${esc(link(`/cargas/${c.id}/xml`))}">⬇ XML</a>` : ''}
          <button data-fechar>Fechar</button></div>`);
    } catch (err) { aviso(err.message); }
  }

  $('ptXmlLote').addEventListener('click', () => {
    const hoje = hojeIso();
    abrirJanela('<b>⬇ XML dos CT-e do período</b>', `<p class="fraco" style="font-size:13.5px;">Baixa num arquivo .zip os XML de todos os CT-e em que a sua empresa aparece (máximo de 3 meses por vez).</p>
      <div class="pt-grade"><div><label for="ptjDe">De</label><input id="ptjDe" type="date" value="${hoje.slice(0, 8)}01" /></div><div><label for="ptjAte">Até</label><input id="ptjAte" type="date" value="${hoje}" /></div></div>
      <div class="pt-rodape-j"><button class="sec" data-fechar>Cancelar</button><button id="ptjBaixar">Baixar .zip</button></div>`);
    $('ptjBaixar').addEventListener('click', () => { window.location.href = link(`/xmls.zip?${new URLSearchParams({ de: $('ptjDe').value, ate: $('ptjAte').value })}`); fecharJanela(); });
  });

  // ---------- Financeiro ----------
  const SIT_FAT = { aberta: ['Em aberto', 'azul'], parcial: ['Pago em parte', 'laranja'], paga: ['Paga', 'verde'] };
  async function carregarFaturas() {
    const lista = await api('/faturas');
    $('ptFaturas').innerHTML = lista.length ? lista.map((f) => {
      const [txt, cor] = f.vencida ? ['Vencida', 'vermelho'] : SIT_FAT[f.status] || [f.status, 'cinza'];
      return `<div class="pt-item">
        <div><div class="titulo">Fatura nº ${esc(f.numero)}</div><div class="linha">Emitida em ${dia(f.emissao)} · ${f.qtd_ctes} CT-e · vencimento <b>${dia(f.vencimento)}</b></div>
          ${f.boleto_linha ? `<div class="linha" style="margin-top:4px;">Linha digitável: <span class="linha-digitavel">${esc(f.boleto_linha.replace(/^(\d{5})(\d{5})(\d{5})(\d{6})(\d{5})(\d{6})(\d)(\d{14})$/, '$1.$2 $3.$4 $5.$6 $7 $8'))}</span></div>` : ''}</div>
        <div class="dir"><span class="sit ${cor}">${txt}</span><div class="valor">${moeda(f.valor)}</div>${f.status === 'parcial' ? `<div class="linha">falta ${moeda(f.saldo)}</div>` : ''}</div>
        <div class="pt-acoes"><a class="botao sec" href="${esc(link(`/faturas/${f.id}/imprimir`))}" target="_blank" rel="noopener">🖨 Fatura</a>
          ${f.tem_boleto ? `<a class="botao sec" href="${esc(link(`/faturas/${f.id}/boleto`))}" target="_blank" rel="noopener">🏦 Boleto</a><button class="sec" data-copiar="${esc(f.boleto_linha)}">📋 Copiar linha</button>` : ''}</div>
      </div>`;
    }).join('') : '<div class="pt-vazio">Nenhuma fatura.</div>';
  }
  $('ptFaturas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = '✓ Copiada'; } catch { aviso(b.dataset.copiar); }
  });

  // ---------- Coletas ----------
  const SIT_COL = { pendente: 'azul', programada: 'azul', em_coleta: 'azul', coletada: 'verde', nao_coletada: 'laranja', cancelada: 'cinza' };
  let enderecoCliente = null;
  async function carregarColetas() {
    const r = await api('/coletas');
    enderecoCliente = r.endereco;
    $('ptColetas').innerHTML = r.coletas.length ? r.coletas.map((k) => `<div class="pt-item">
        <div><div class="titulo">Coleta nº ${k.id} · ${esc(k.remetente_nome)}</div>
          <div class="linha">${esc(k.cidade)}/${esc(k.uf)}${k.destino_cidade ? ` → ${esc(k.destino_cidade)}/${esc(k.destino_uf || '')}` : ''} · dia ${dia(k.data_coleta)}${k.hora_de ? ` das ${esc(k.hora_de)}` : ''}${k.hora_ate ? ` às ${esc(k.hora_ate)}` : ''}
          ${[k.volumes ? `${num(k.volumes)} vol.` : '', k.peso_kg ? `${num(k.peso_kg, 1)} kg` : '', k.notas ? `NF ${esc(k.notas)}` : ''].filter(Boolean).map((x) => ` · ${x}`).join('')}</div>
          ${k.motivo && ['nao_coletada', 'cancelada'].includes(k.status) ? `<div class="linha" style="color:var(--laranja);">${esc(k.motivo)}</div>` : ''}</div>
        <div class="dir"><span class="sit ${SIT_COL[k.status] || 'azul'}">${esc(k.status_texto)}</span>${k.cte ? `<div class="linha">CT-e ${esc(k.cte)}</div>` : ''}</div></div>`).join('')
      : '<div class="pt-vazio">Nenhuma coleta. Clique em "＋ Pedir coleta" quando tiver mercadoria para enviar.</div>';
  }
  $('ptNovaColeta').addEventListener('click', () => {
    const e = enderecoCliente || {};
    const v = (k) => esc(e[k] || '');
    abrirJanela('<b style="font-size:17px;">📦 Pedir coleta</b>', `<div class="pt-grade">
        <div class="inteiro"><label for="pkRem">Local da coleta (empresa)</label><input id="pkRem" maxlength="200" value="${esc(e.nome || eu.cliente_nome || '')}" /></div>
        <div class="largo"><label for="pkEnd">Endereço</label><input id="pkEnd" maxlength="200" value="${v('logradouro')}" /></div>
        <div><label for="pkNum">Número</label><input id="pkNum" maxlength="30" value="${v('numero')}" /></div>
        <div><label for="pkBairro">Bairro</label><input id="pkBairro" maxlength="120" value="${v('bairro')}" /></div>
        <div><label for="pkCid">Cidade</label><input id="pkCid" maxlength="120" value="${v('cidade')}" /></div>
        <div><label for="pkUf">UF</label><select id="pkUf">${UFS.map((u) => `<option ${u === e.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div><label for="pkCep">CEP</label><input id="pkCep" inputmode="numeric" maxlength="9" value="${v('cep')}" /></div>
        <div><label for="pkContato">Falar com</label><input id="pkContato" maxlength="120" value="${esc(eu.nome)}" /></div>
        <div><label for="pkFone">Telefone</label><input id="pkFone" maxlength="30" value="${v('telefone')}" /></div>
        <div><label for="pkData">Data</label><input id="pkData" type="date" min="${hojeIso()}" value="${hojeIso()}" /></div>
        <div><label for="pkDe">Das</label><input id="pkDe" type="time" value="08:00" /></div>
        <div><label for="pkAte">Até</label><input id="pkAte" type="time" value="17:00" /></div>
        <div><label for="pkVol">Volumes</label><input id="pkVol" inputmode="numeric" /></div>
        <div><label for="pkPeso">Peso (kg)</label><input id="pkPeso" inputmode="decimal" /></div>
        <div><label for="pkNf">Nota(s) fiscal(is)</label><input id="pkNf" maxlength="250" /></div>
        <div><label for="pkDesCid">Destino (cidade)</label><input id="pkDesCid" maxlength="120" /></div>
        <div><label for="pkDesUf">UF destino</label><select id="pkDesUf"><option value=""></option>${UFS.map((u) => `<option>${u}</option>`).join('')}</select></div>
        <div class="inteiro"><label for="pkObs">Observação (doca, horário de almoço, carga paletizada...)</label><textarea id="pkObs" rows="2" maxlength="2000"></textarea></div>
      </div><p id="pkErro" class="erro oculto"></p>
      <div class="pt-rodape-j"><button class="sec" data-fechar>Cancelar</button><button id="pkEnviar">Pedir coleta</button></div>`);
    $('pkEnviar').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const r = await api('/coletas', { method: 'POST', body: JSON.stringify({
          remetente_nome: $('pkRem').value, remetente_doc: e.documento || eu.documentos[0], remetente_ie: e.ie, cod_municipio: e.cidade === $('pkCid').value ? e.cod_municipio : null,
          logradouro: $('pkEnd').value, numero: $('pkNum').value, bairro: $('pkBairro').value, cidade: $('pkCid').value, uf: $('pkUf').value, cep: $('pkCep').value,
          contato_nome: $('pkContato').value, contato_telefone: $('pkFone').value, data_coleta: $('pkData').value, hora_de: $('pkDe').value, hora_ate: $('pkAte').value,
          volumes: $('pkVol').value, peso_kg: $('pkPeso').value, notas: $('pkNf').value, destino_cidade: $('pkDesCid').value, destino_uf: $('pkDesUf').value, observacao: $('pkObs').value,
        }) });
        fecharJanela(); await carregarColetas();
        aviso(`Coleta nº ${r.id} pedida. A transportadora vai programar e você acompanha a situação aqui.`);
      } catch (err) { $('pkErro').textContent = err.message; $('pkErro').classList.remove('oculto'); b.disabled = false; }
    });
  });

  // ---------- Cotações ----------
  const SIT_COT = { solicitada: ['Em cálculo', 'azul'], aberta: ['Aguardando sua resposta', 'laranja'], enviada: ['Aguardando sua resposta', 'laranja'], aprovada: ['Aprovada', 'verde'],
    recusada: ['Recusada', 'cinza'], vencida: ['Vencida', 'cinza'] };
  async function carregarCotacoes() {
    const lista = await api('/cotacoes');
    $('ptCotacoes').innerHTML = lista.length ? lista.map((t) => {
      const [txt, cor] = SIT_COT[t.situacao] || [t.situacao, 'cinza'];
      return `<div class="pt-item">
        <div><div class="titulo">Cotação nº ${t.id} · ${esc(t.origem_cidade)}/${esc(t.origem_uf)} → ${esc(t.destino_cidade)}/${esc(t.destino_uf)}</div>
          <div class="linha">${diaTs(t.criado_em)} · ${[t.peso_kg ? `${num(t.peso_kg, 1)} kg` : '', t.volumes ? `${num(t.volumes)} vol.` : '', t.valor_mercadoria ? `NF ${moeda(t.valor_mercadoria)}` : ''].filter(Boolean).join(' · ')}
          ${t.situacao !== 'solicitada' ? ` · válida até ${dia(t.validade)}` : ''}${t.prazo_dias ? ` · prazo ${t.prazo_dias} dia(s) útil(eis)` : ''}</div>
          ${t.status === 'aprovada' ? `<div class="linha" style="color:var(--verde);">${t.coleta_id ? `Coleta nº ${t.coleta_id} registrada.` : 'A transportadora vai programar a coleta.'}</div>` : ''}</div>
        <div class="dir"><span class="sit ${cor}">${txt}</span>${Number(t.valor_total) > 0 ? `<div class="valor">${moeda(t.valor_total)}</div>` : ''}</div>
        <div class="pt-acoes">${t.situacao !== 'solicitada' ? `<a class="botao sec" href="${esc(link(`/cotacoes/${t.id}/proposta`))}" target="_blank" rel="noopener">🖨 Proposta</a>` : ''}
          ${t.pode_responder ? `<button data-aprovar="${t.id}" data-valor="${t.valor_total}">✓ Aprovar</button><button class="perigo" data-recusar="${t.id}">✗ Recusar</button>` : ''}</div>
      </div>`;
    }).join('') : '<div class="pt-vazio">Nenhuma cotação. Clique em "＋ Pedir cotação".</div>';
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
    abrirJanela('<b style="font-size:17px;">💲 Pedir cotação</b>', `<div class="pt-grade">
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
