// App do motorista: entra com o código do romaneio e dá baixa nas entregas
// e nas coletas com foto, assinatura na tela e a localização do celular.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const guardar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  const lido = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  let codigo = null; let dados = null; let atual = null; let modo = null;

  async function api(caminho, opcoes = {}) {
    const r = await fetch(`/api/motorista/${encodeURIComponent(codigo)}${caminho}`, opcoes);
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(corpo.erro || 'Sem conexão. Tente de novo.'), { status: r.status });
    return corpo;
  }

  async function entrar(c) {
    codigo = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    $('mtErroCodigo').textContent = '';
    try {
      dados = await api('');
      guardar('motoristaCodigo', codigo);
      $('mtEntrar').classList.add('oculto'); $('mtRota').classList.remove('oculto');
      desenhar();
    } catch (err) {
      if (err.status === 404 || err.status === 410) guardar('motoristaCodigo', null);
      $('mtEntrar').classList.remove('oculto'); $('mtRota').classList.add('oculto');
      $('mtErroCodigo').textContent = err.message;
    }
  }

  const SIT = { pendente: 'A entregar', em_transito: 'A entregar', em_rota: 'Saiu para entrega', agendada: 'Agendado', ocorrencia: 'Com ocorrência', entregue: 'Entregue', devolvido: 'Devolvido' };
  function desenhar() {
    const r = dados.romaneio;
    const coletas = dados.coletas || [];
    const feitos = dados.itens.filter((i) => ['entregue', 'devolvido'].includes(i.situacao)).length + coletas.filter((c) => ['coletada', 'nao_coletada'].includes(c.status)).length;
    const total = dados.itens.length + coletas.length;
    $('mtEmpresa').textContent = dados.empresa.nome;
    $('mtTitulo').textContent = `Romaneio ${r.id} · ${feitos}/${total}`;
    $('mtSub').textContent = [r.motorista, r.placa, r.veiculo].filter(Boolean).join(' · ');
    $('mtBarra').style.width = `${total ? Math.round((feitos / total) * 100) : 0}%`;
    $('mtAviso').innerHTML = r.status === 'aberto'
      ? '<div class="rt-cartao"><b>A rota ainda não começou.</b><p class="mt-fraco">Quando sair com o caminhão, toque abaixo: o cliente é avisado que a entrega saiu.</p><button id="mtIniciar">▶ Iniciar a rota</button></div>' : '';
    $('mtIniciar')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await api('/saida', { method: 'POST' }); await entrar(codigo); } catch (err) { alert(err.message); e.currentTarget.disabled = false; }
    });
    $('mtLista').innerHTML = dados.itens.map((i, k) => {
      const feito = ['entregue', 'devolvido'].includes(i.situacao);
      const endereco = [i.endereco, i.bairro, `${i.cidade}${i.uf ? ` - ${i.uf}` : ''}`, i.cep].filter(Boolean).join(', ');
      return `<article class="mt-item ${feito ? 'feito' : ''} ${i.situacao === 'ocorrencia' ? 'problema' : ''}">
        <h2><span class="mt-num">${k + 1}</span>${esc(i.destinatario)}</h2>
        <div class="mt-end">${esc(endereco)}</div>
        <div class="mt-info">CT-e ${esc(i.serie)}/${esc(i.numero)}${i.nfs.length ? ` · NF ${esc(i.nfs.join(', '))}` : ''}${i.volumes ? ` · ${i.volumes} vol.` : ''}${i.peso ? ` · ${i.peso.toLocaleString('pt-BR')} kg` : ''}</div>
        ${i.agendamento && !feito ? `<div class="mt-agenda">📅 Agendado ${esc(i.agendamento.data.slice(8, 10))}/${esc(i.agendamento.data.slice(5, 7))}${i.agendamento.hora_de || i.agendamento.hora_ate ? `, ${esc(i.agendamento.hora_de || '')}${i.agendamento.hora_ate ? ` às ${esc(i.agendamento.hora_ate)}` : ''}` : ''}${i.agendamento.senha ? ` · senha <b>${esc(i.agendamento.senha)}</b>` : ''}${i.agendamento.doca ? ` · doca ${esc(i.agendamento.doca)}` : ''}${i.agendamento.observacao ? `<br>${esc(i.agendamento.observacao)}` : ''}</div>` : ''}
        <div class="mt-status" style="color:${feito ? 'var(--verde)' : i.situacao === 'ocorrencia' ? 'var(--laranja)' : 'var(--azul)'};">${esc(SIT[i.situacao] || i.situacao)}${i.situacao === 'entregue' && i.recebedor ? ` · ${esc(i.recebedor)}` : i.situacao === 'ocorrencia' && i.ultima ? ` · ${esc(i.ultima.descricao)}` : ''}</div>
        ${feito ? '' : `<div class="mt-botoes">
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}" target="_blank" rel="noopener">🗺 Mapa</a>
          ${i.telefone ? `<a href="tel:${esc(String(i.telefone).replace(/[^\d+]/g, ''))}">📞 Ligar</a>` : '<span></span>'}
          <button class="ok" data-mt-entregue="${i.cte_id}">✓ Entregue</button>
          <button class="ruim" data-mt-problema="${i.cte_id}">⚠ Não entregue</button></div>`}
      </article>`;
    }).join('') + desenharColetas(coletas, dados.itens.length) || '<p class="mt-fraco">Nenhuma entrega neste romaneio.</p>';
  }

  const SIT_COLETA = { programada: 'A coletar', em_coleta: 'A coletar', coletada: 'Coletada', nao_coletada: 'Não coletada' };
  function desenharColetas(coletas, temEntregas) {
    if (!coletas.length) return '';
    return `${temEntregas ? '<h2 class="mt-secao">📦 Coletas</h2>' : ''}${coletas.map((c) => {
      const feito = ['coletada', 'nao_coletada'].includes(c.status);
      const endereco = [c.endereco, c.bairro, `${c.cidade}${c.uf ? ` - ${c.uf}` : ''}`, c.cep].filter(Boolean).join(', ');
      return `<article class="mt-item mt-coleta ${c.status === 'coletada' ? 'feito' : ''} ${c.status === 'nao_coletada' ? 'problema' : ''}">
        <h2><span class="mt-num">C</span>Coletar: ${esc(c.remetente)}</h2>
        <div class="mt-end">${esc(endereco)}</div>
        <div class="mt-info">Coleta nº ${c.id}${c.hora_de || c.hora_ate ? ` · ${esc(c.hora_de || '')}–${esc(c.hora_ate || '')}` : ''}${c.volumes ? ` · ${c.volumes} vol.` : ''}${c.peso ? ` · ${c.peso.toLocaleString('pt-BR')} kg` : ''}${c.destino ? ` · destino ${esc(c.destino)}` : ''}${c.notas ? ` · NF ${esc(c.notas)}` : ''}</div>
        ${c.contato ? `<div class="mt-info">Falar com ${esc(c.contato)}</div>` : ''}
        ${c.observacao ? `<div class="mt-info">📝 ${esc(c.observacao)}</div>` : ''}
        <div class="mt-status" style="color:${c.status === 'coletada' ? 'var(--verde)' : c.status === 'nao_coletada' ? 'var(--laranja)' : 'var(--azul)'};">${esc(SIT_COLETA[c.status] || c.status)}${c.status === 'coletada' ? ` · ${c.volumes_coletados} vol. · ${esc(c.entregue_por || '')}` : c.status === 'nao_coletada' && c.motivo ? ` · ${esc(c.motivo)}` : ''}</div>
        ${feito ? '' : `<div class="mt-botoes">
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}" target="_blank" rel="noopener">🗺 Mapa</a>
          ${c.telefone ? `<a href="tel:${esc(String(c.telefone).replace(/[^\d+]/g, ''))}">📞 Ligar</a>` : '<span></span>'}
          <button class="ok" data-mt-coletou="${c.id}">✓ Coletado</button>
          <button class="ruim" data-mt-naocoletou="${c.id}">⚠ Não coletado</button></div>`}
      </article>`;
    }).join('')}`;
  }

  $('mtLista').addEventListener('click', (e) => {
    const ok = e.target.closest('[data-mt-entregue]'); const ruim = e.target.closest('[data-mt-problema]');
    const col = e.target.closest('[data-mt-coletou]'); const naoCol = e.target.closest('[data-mt-naocoletou]');
    if (ok) abrirFolha(Number(ok.dataset.mtEntregue), 'entrega');
    if (ruim) abrirFolha(Number(ruim.dataset.mtProblema), 'problema');
    if (col) abrirFolha(Number(col.dataset.mtColetou), 'coleta');
    if (naoCol) abrirFolha(Number(naoCol.dataset.mtNaocoletou), 'nao_coleta');
  });

  // ---------- Folha de baixa ----------
  const canvas = $('mtCanvas'); const ctx = canvas.getContext('2d');
  let desenhou = false; let ponto = null;
  function prepararCanvas() {
    const r = canvas.getBoundingClientRect(); const escala = window.devicePixelRatio || 1;
    canvas.width = r.width * escala; canvas.height = r.height * escala;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    desenhou = false;
  }
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ponto = pos(e); });
  canvas.addEventListener('pointermove', (e) => {
    if (!ponto) return;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(ponto.x, ponto.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ponto = p; desenhou = true;
  });
  ['pointerup', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, () => { ponto = null; }));
  $('mtLimpar').addEventListener('click', prepararCanvas);

  function abrirFolha(id, tipo) {
    const coleta = tipo === 'coleta' || tipo === 'nao_coleta';
    atual = coleta ? dados.coletas.find((c) => c.id === id) : dados.itens.find((i) => i.cte_id === id); modo = tipo;
    $('mtFolhaTitulo').textContent = { entrega: '✓ Confirmar entrega', problema: '⚠ Não entregue', coleta: '✓ Confirmar coleta', nao_coleta: '⚠ Não coletado' }[tipo];
    $('mtFolhaCte').textContent = coleta ? `${atual.remetente} · coleta nº ${atual.id}` : `${atual.destinatario} · CT-e ${atual.serie}/${atual.numero}`;
    const comAssinatura = tipo === 'entrega' || tipo === 'coleta';
    $('mtCamposEntrega').classList.toggle('oculto', !comAssinatura);
    $('mtCamposColeta').classList.toggle('oculto', tipo !== 'coleta');
    $('mtCampoDoc').classList.toggle('oculto', tipo === 'coleta');
    $('mtRotuloRecebedor').textContent = tipo === 'coleta' ? 'Quem entregou a mercadoria' : 'Quem recebeu';
    $('mtRotuloFoto').textContent = coleta ? 'Foto (mercadoria, etiqueta ou local)' : 'Foto (canhoto, fachada ou avaria)';
    $('mtRecebedor').placeholder = tipo === 'coleta' ? 'Nome de quem liberou a carga' : 'Nome de quem recebeu';
    $('mtCampoTipo').classList.toggle('oculto', comAssinatura);
    $('mtTipo').innerHTML = tipo === 'nao_coleta'
      ? `<option value="">Escolha...</option>${(dados.motivos_coleta || []).map((m) => `<option>${esc(m)}</option>`).join('')}`
      : `<option value="">Escolha...</option>${dados.ocorrencias.filter((o) => o.tipo !== 'entrega').map((o) => `<option value="${o.id}">${esc(o.rotulo)}</option>`).join('')}`;
    ['mtRecebedor', 'mtDoc', 'mtObs', 'mtVol', 'mtPeso'].forEach((el) => { $(el).value = ''; });
    if (tipo === 'coleta' && atual.volumes) $('mtVol').value = atual.volumes;
    $('mtFoto').value = ''; $('mtPrevia').classList.add('oculto'); $('mtErro').textContent = '';
    $('mtFolha').classList.remove('oculto');
    if (comAssinatura) requestAnimationFrame(prepararCanvas);
  }
  $('mtFechar').addEventListener('click', () => $('mtFolha').classList.add('oculto'));

  // Foto reduzida no próprio celular (até 1600 px, JPEG) para enviar rápido pelo 4G.
  let fotoReduzida = null;
  $('mtFoto').addEventListener('change', async () => {
    fotoReduzida = null;
    const f = $('mtFoto').files[0]; if (!f) { $('mtPrevia').classList.add('oculto'); return; }
    try {
      const img = await createImageBitmap(f);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      fotoReduzida = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
    } catch { fotoReduzida = f; }
    $('mtPrevia').src = URL.createObjectURL(fotoReduzida || f); $('mtPrevia').classList.remove('oculto');
  });

  const localizacao = () => new Promise((res) => {
    if (!navigator.geolocation) { res(null); return; }
    navigator.geolocation.getCurrentPosition((p) => res(p.coords), () => res(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 });
  });

  $('mtEnviar').addEventListener('click', async (e) => {
    const b = e.currentTarget; $('mtErro').textContent = '';
    if (modo === 'coleta' || modo === 'nao_coleta') { enviarColeta(b); return; }
    const tipoId = modo === 'entrega' ? 'entregue' : $('mtTipo').value;
    if (!tipoId) { $('mtErro').textContent = 'Escolha o que aconteceu.'; return; }
    if (modo === 'entrega' && !$('mtRecebedor').value.trim()) { $('mtErro').textContent = 'Informe o nome de quem recebeu.'; return; }
    if (modo === 'entrega' && !desenhou && !$('mtFoto').files[0]) { $('mtErro').textContent = 'Colete a assinatura ou tire a foto do canhoto.'; return; }
    b.disabled = true; b.textContent = 'Enviando...';
    try {
      const fd = new FormData();
      fd.append('tipo_id', tipoId); fd.append('recebedor_nome', $('mtRecebedor').value); fd.append('recebedor_documento', $('mtDoc').value); fd.append('observacao', $('mtObs').value);
      if (modo === 'entrega' && desenhou) fd.append('assinatura', canvas.toDataURL('image/png'));
      const foto = fotoReduzida || $('mtFoto').files[0];
      if (foto) fd.append('foto', foto, 'foto.jpg');
      const c = await localizacao();
      if (c) { fd.append('latitude', c.latitude.toFixed(6)); fd.append('longitude', c.longitude.toFixed(6)); }
      await api(`/entregas/${atual.cte_id}`, { method: 'POST', body: fd });
      $('mtFolha').classList.add('oculto');
      fotoReduzida = null;
      await entrar(codigo);
    } catch (err) {
      $('mtErro').textContent = err.message;
    } finally { b.disabled = false; b.textContent = 'Confirmar'; }
  });

  async function enviarColeta(b) {
    const sim = modo === 'coleta';
    if (!sim && !$('mtTipo').value) { $('mtErro').textContent = 'Escolha o motivo.'; return; }
    if (sim && !(Number($('mtVol').value) > 0)) { $('mtErro').textContent = 'Informe quantos volumes você coletou.'; return; }
    if (sim && !$('mtRecebedor').value.trim()) { $('mtErro').textContent = 'Informe quem entregou a mercadoria.'; return; }
    if (sim && !desenhou && !$('mtFoto').files[0]) { $('mtErro').textContent = 'Colete a assinatura ou tire uma foto da mercadoria.'; return; }
    b.disabled = true; b.textContent = 'Enviando...';
    try {
      const fd = new FormData();
      fd.append('coletado', String(sim));
      if (sim) { fd.append('volumes', $('mtVol').value); fd.append('peso', $('mtPeso').value); fd.append('entregue_por', $('mtRecebedor').value); } else fd.append('motivo', $('mtTipo').value);
      fd.append('observacao', $('mtObs').value);
      if (sim && desenhou) fd.append('assinatura', canvas.toDataURL('image/png'));
      const foto = fotoReduzida || $('mtFoto').files[0];
      if (foto) fd.append('foto', foto, 'foto.jpg');
      const c = await localizacao();
      if (c) { fd.append('latitude', c.latitude.toFixed(6)); fd.append('longitude', c.longitude.toFixed(6)); }
      await api(`/coletas/${atual.id}`, { method: 'POST', body: fd });
      $('mtFolha').classList.add('oculto');
      fotoReduzida = null;
      await entrar(codigo);
    } catch (err) {
      $('mtErro').textContent = err.message;
    } finally { b.disabled = false; b.textContent = 'Confirmar'; }
  }

  $('mtFormCodigo').addEventListener('submit', (e) => { e.preventDefault(); entrar($('mtCodigo').value); });
  $('mtSair').addEventListener('click', () => { guardar('motoristaCodigo', null); location.href = 'motorista.html'; });
  // Atualiza a lista a cada 2 minutos (a expedição pode ter mexido).
  setInterval(() => { if (codigo && dados && $('mtFolha').classList.contains('oculto')) entrar(codigo); }, 120000);

  const inicial = new URLSearchParams(location.search).get('c') || lido('motoristaCodigo');
  if (inicial) { $('mtCodigo').value = inicial; entrar(inicial); }
})();
