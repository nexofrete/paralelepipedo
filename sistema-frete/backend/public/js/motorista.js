// App do motorista: entra com o código do romaneio e dá baixa nas entregas
// com foto, assinatura na tela e a localização do celular.
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
    const feitos = dados.itens.filter((i) => ['entregue', 'devolvido'].includes(i.situacao)).length;
    $('mtEmpresa').textContent = dados.empresa.nome;
    $('mtTitulo').textContent = `Romaneio ${r.id} · ${feitos}/${dados.itens.length}`;
    $('mtSub').textContent = [r.motorista, r.placa, r.veiculo].filter(Boolean).join(' · ');
    $('mtBarra').style.width = `${dados.itens.length ? Math.round((feitos / dados.itens.length) * 100) : 0}%`;
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
        <div class="mt-status" style="color:${feito ? 'var(--verde)' : i.situacao === 'ocorrencia' ? 'var(--laranja)' : 'var(--azul)'};">${esc(SIT[i.situacao] || i.situacao)}${i.situacao === 'entregue' && i.recebedor ? ` · ${esc(i.recebedor)}` : i.situacao === 'ocorrencia' && i.ultima ? ` · ${esc(i.ultima.descricao)}` : ''}</div>
        ${feito ? '' : `<div class="mt-botoes">
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}" target="_blank" rel="noopener">🗺 Mapa</a>
          ${i.telefone ? `<a href="tel:${esc(String(i.telefone).replace(/[^\d+]/g, ''))}">📞 Ligar</a>` : '<span></span>'}
          <button class="ok" data-mt-entregue="${i.cte_id}">✓ Entregue</button>
          <button class="ruim" data-mt-problema="${i.cte_id}">⚠ Não entregue</button></div>`}
      </article>`;
    }).join('') || '<p class="mt-fraco">Nenhuma entrega neste romaneio.</p>';
  }

  $('mtLista').addEventListener('click', (e) => {
    const ok = e.target.closest('[data-mt-entregue]'); const ruim = e.target.closest('[data-mt-problema]');
    if (ok) abrirFolha(Number(ok.dataset.mtEntregue), 'entrega');
    if (ruim) abrirFolha(Number(ruim.dataset.mtProblema), 'problema');
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

  function abrirFolha(cteId, tipo) {
    atual = dados.itens.find((i) => i.cte_id === cteId); modo = tipo;
    $('mtFolhaTitulo').textContent = tipo === 'entrega' ? '✓ Confirmar entrega' : '⚠ Não entregue';
    $('mtFolhaCte').textContent = `${atual.destinatario} · CT-e ${atual.serie}/${atual.numero}`;
    $('mtCamposEntrega').classList.toggle('oculto', tipo !== 'entrega');
    $('mtCampoTipo').classList.toggle('oculto', tipo === 'entrega');
    $('mtTipo').innerHTML = `<option value="">Escolha...</option>${dados.ocorrencias.filter((o) => o.tipo !== 'entrega').map((o) => `<option value="${o.id}">${esc(o.rotulo)}</option>`).join('')}`;
    ['mtRecebedor', 'mtDoc', 'mtObs'].forEach((id) => { $(id).value = ''; });
    $('mtFoto').value = ''; $('mtPrevia').classList.add('oculto'); $('mtErro').textContent = '';
    $('mtFolha').classList.remove('oculto');
    if (tipo === 'entrega') requestAnimationFrame(prepararCanvas);
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

  $('mtFormCodigo').addEventListener('submit', (e) => { e.preventDefault(); entrar($('mtCodigo').value); });
  $('mtSair').addEventListener('click', () => { guardar('motoristaCodigo', null); location.href = 'motorista.html'; });
  // Atualiza a lista a cada 2 minutos (a expedição pode ter mexido).
  setInterval(() => { if (codigo && dados && $('mtFolha').classList.contains('oculto')) entrar(codigo); }, 120000);

  const inicial = new URLSearchParams(location.search).get('c') || lido('motoristaCodigo');
  if (inicial) { $('mtCodigo').value = inicial; entrar(inicial); }
})();
