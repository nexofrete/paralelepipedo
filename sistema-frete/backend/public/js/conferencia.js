// =====================================================================
// Etiquetas de volume e conferência por código de barras (estilo SSW).
// O leitor de código de barras USB/Bluetooth funciona como teclado: lê e dá
// Enter no campo. No celular, dá para ler pela câmera (BarcodeDetector).
// Usa do dashboard.js: usuario, token, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const nav = document.getElementById('navConferencia');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dia = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const json = async (url, opcoes = {}) => {
    const r = await apiFetch(url, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  let aba = 'conferir'; let atual = null; let formato = '100x100'; let formatos = [];

  // Bipe: agudo e curto quando está certo; grave e longo quando não.
  let audio = null;
  function bipe(ok) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = 'square'; o.frequency.value = ok ? 1500 : 220; g.gain.value = 0.08;
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + (ok ? 0.09 : 0.45));
    } catch { /* sem som */ }
    if (!ok && navigator.vibrate) navigator.vibrate(300);
  }

  document.querySelectorAll('[data-bp-aba]').forEach((a) => a.addEventListener('click', () => {
    aba = a.dataset.bpAba;
    document.querySelectorAll('[data-bp-aba]').forEach((x) => x.classList.toggle('ativo', x === a));
    $('bpAbaConferir').classList.toggle('oculto', aba !== 'conferir');
    $('bpAbaEtiquetas').classList.toggle('oculto', aba !== 'etiquetas');
    (aba === 'conferir' ? (atual ? abrirConferencia(atual.id) : lista()) : telaEtiquetas()).catch(erro);
  }));
  let pularCarga = false;   // outra tela já vai abrir uma conferência
  nav.addEventListener('click', () => { if (pularCarga) { pularCarga = false; return; } (aba === 'conferir' ? (atual ? abrirConferencia(atual.id) : lista()) : telaEtiquetas()).catch(erro); });

  // ---------------- Conferência: lista ----------------
  async function lista() {
    atual = null;
    const [confs, roms] = await Promise.all([json('/api/conferencias'), json('/api/romaneios').then((l) => l.filter((r) => r.status !== 'fechado' && r.ctes > 0))]);
    $('bpAbaConferir').innerHTML = `<div class="painel oc-painel" style="margin-bottom:16px;">
        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div class="campo" style="margin:0; min-width:280px;"><label for="bpRom">Conferir o carregamento do romaneio</label>
            <select id="bpRom">${roms.length ? roms.map((r) => `<option value="${r.id}">Romaneio ${r.id} · ${esc(r.motorista_nome)}${r.placa ? ` · ${esc(r.placa)}` : ''} · ${r.ctes} CT-e${r.status === 'em_rota' ? ' (já saiu)' : ''}</option>`).join('') : '<option value="">Nenhum romaneio aberto</option>'}</select></div>
          <button class="btn btn-primario" id="bpCarga" style="width:auto;" ${roms.length ? '' : 'disabled'}>🔎 Conferir carga</button>
          <span style="flex:1;"></span>
          <button class="btn btn-secundario" id="bpDescarga" style="width:auto;" title="Volumes chegando no armazém (coleta, devolução, transferência)">📥 Recebimento no armazém (descarga)</button>
        </div>
        <p class="edi-dica" style="margin:10px 0 0;">Use o leitor de código de barras (ele "digita" o código e dá Enter) ou a câmera do celular. Vale a etiqueta de volume e também a chave de acesso do DACTE (conta o CT-e inteiro).</p></div>
      <div class="painel oc-painel"><h3 style="margin-top:0; font-size:15px;">Conferências dos últimos 30 dias</h3>
      ${confs.length ? `<table class="edi-tabela"><thead><tr><th>Nº</th><th>Tipo</th><th>Romaneio</th><th>Início</th><th>Por</th><th class="n">Leituras</th><th>Resultado</th><th></th></tr></thead><tbody>
        ${confs.map((c) => `<tr><td>${c.id}</td><td>${c.tipo === 'carga' ? '🚚 Carga' : '📥 Descarga'}</td><td>${c.romaneio_id ? `${c.romaneio_id} · ${esc(c.motorista_nome || '')}` : c.transferencia_id ? `transferência ${c.transferencia_id}` : '—'}</td>
          <td>${dia(c.criado_em)}</td><td>${esc(c.usuario_nome || '')}</td><td class="n">${c.leituras}</td>
          <td>${c.status === 'aberta' ? '<span class="oc-sit em_rota">Em andamento</span>' : resumoCurto(c.resumo)}</td>
          <td><div class="oc-linha-acoes"><button class="primario" data-bp-abrir="${c.id}">${c.status === 'aberta' ? 'Continuar' : 'Ver'}</button></div></td></tr>`).join('')}</tbody></table>`
        : '<div class="kanban-vazio">Nenhuma conferência ainda.</div>'}</div>`;
    $('bpCarga')?.addEventListener('click', () => comecar({ tipo: 'carga', romaneio_id: Number($('bpRom').value) }).catch(erro));
    $('bpDescarga').addEventListener('click', () => comecar({ tipo: 'descarga' }).catch(erro));
    $('bpAbaConferir').querySelectorAll('[data-bp-abrir]').forEach((b) => b.addEventListener('click', () => abrirConferencia(Number(b.dataset.bpAbrir)).catch(erro)));
  }
  const resumoCurto = (r) => {
    if (!r) return '';
    const ok = !r.faltam && !(r.sobras || []).length;
    return `<span class="oc-sit ${ok ? 'entregue' : 'ocorrencia'}">${r.lido}/${r.esperado} vol.${r.faltam ? ` · faltaram ${r.faltam}` : ''}${(r.sobras || []).length ? ` · ${r.sobras.length} sobra(s)` : ''}</span>`;
  };
  async function comecar(corpo) {
    const r = await json('/api/conferencias', { method: 'POST', body: JSON.stringify(corpo) });
    await abrirConferencia(r.id);
  }

  // ---------------- Conferência: tela de bipagem ----------------
  async function abrirConferencia(id, ultimo = null) {
    const c = await json(`/api/conferencias/${id}`);
    atual = c;
    const aberta = c.status === 'aberta';
    const pct = c.totais.esperado ? Math.round((c.totais.lido / c.totais.esperado) * 100) : 0;
    const temCamera = 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
    $('bpAbaConferir').innerHTML = `<div class="painel oc-painel">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:flex-start;">
          <div><h3 style="margin:0;">${c.transferencia_id ? `🔀 ${c.tipo === 'carga' ? 'Carregamento' : 'Chegada'} da transferência ${c.transferencia_id} <small>${esc(c.origem_sigla || '')} → ${esc(c.destino_sigla || '')}</small>` : c.tipo === 'carga' ? `🚚 Carga do romaneio ${c.romaneio_id}` : '📥 Recebimento no armazém'} <small style="color:var(--texto-fraco); font-weight:400;">conferência nº ${c.id}</small></h3>
            <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:3px;">${c.motorista_nome ? `${esc(c.motorista_nome)}${c.placa ? ` · ${esc(c.placa)}` : ''} · ` : ''}início ${dia(c.criado_em)} por ${esc(c.usuario_nome || '')}${c.concluida_em ? ` · concluída ${dia(c.concluida_em)}` : ''}</div></div>
          <button class="btn btn-secundario" id="bpVoltar" style="width:auto;">← Conferências</button>
        </div>
        ${aberta ? `<div style="display:flex; gap:8px; margin-top:14px;"><input id="bpCodigo" class="cte-entrada" autocomplete="off" inputmode="numeric" placeholder="Leia o código de barras (ou digite e dê Enter)"
            style="flex:1; font-size:20px; padding:12px 14px; letter-spacing:1px;" />${temCamera ? '<button class="btn btn-secundario" id="bpCamera" style="width:auto;" title="Ler pela câmera">📷</button>' : ''}</div>
          <video id="bpVideo" class="oculto" playsinline muted style="width:100%; max-height:260px; margin-top:8px; border-radius:8px; background:#000;"></video>` : ''}
        <div id="bpFeedback" style="margin-top:12px; padding:14px 16px; border-radius:10px; font-size:17px; font-weight:600; ${estiloFeedback(ultimo?.resultado)}">${ultimo ? esc(ultimo.mensagem) : aberta ? 'Pronto para ler.' : 'Conferência concluída.'}</div>
        ${c.com_lista ? `<div style="margin-top:14px;"><div style="display:flex; justify-content:space-between; font-size:13px;"><b>${c.totais.lido} de ${c.totais.esperado} volume(s)</b><span>${c.totais.faltam ? `faltam ${c.totais.faltam}` : '✓ todos lidos'}${c.totais.sobras ? ` · <b style="color:#ef4444;">${c.totais.sobras} sobra(s)</b>` : ''}</span></div>
          <div style="height:12px; background:var(--bg-elevado); border-radius:6px; margin-top:5px;"><div style="height:12px; border-radius:6px; width:${pct}%; background:${c.totais.faltam ? 'var(--azul)' : 'var(--verde)'};"></div></div></div>`
          : `<div style="margin-top:12px; font-size:13px;"><b>${c.totais.lido}</b> volume(s) recebido(s) de <b>${c.itens.length}</b> CT-e${c.totais.faltam ? ` · ${c.totais.faltam} volume(s) desses CT-e ainda não chegaram` : ''}</div>`}
        <table class="edi-tabela" style="margin-top:14px;"><thead><tr><th>CT-e</th><th>Destinatário</th><th>Cidade</th><th class="n">Lidos</th><th>Faltam</th><th></th></tr></thead><tbody>
          ${c.itens.map((i) => `<tr><td><b>${esc(i.serie)}/${esc(i.numero)}</b></td><td>${esc(i.destinatario)}</td><td>${esc(i.cidade || '')}/${esc(i.uf || '')}</td>
            <td class="n"><b>${i.lidos}</b>/${i.total}</td>
            <td>${i.faltam.length ? `<span style="color:#d97706;">${i.faltam.length > 12 ? `${i.faltam.slice(0, 12).join(', ')}… (+${i.faltam.length - 12})` : i.faltam.join(', ')}</span>` : '<span class="oc-sit entregue">completo</span>'}</td>
            <td>${i.faltam.length ? `<a href="/api/etiquetas/imprimir?ctes=${i.cte_id}&volumes=${i.faltam.join(',')}&token=${encodeURIComponent(token)}" target="_blank" rel="noopener" title="Reimprimir as etiquetas que faltam" style="white-space:nowrap;">🏷 reimprimir</a>` : ''}</td></tr>`).join('')
            || `<tr><td colspan="6" style="color:var(--texto-fraco);">${c.com_lista ? 'Nada a conferir.' : 'Nenhum volume lido ainda.'}</td></tr>`}</tbody></table>
        ${c.sobras.length ? `<div class="cte-aviso erro" style="margin-top:12px;"><b>Volumes que NÃO são deste romaneio (separe):</b> ${c.sobras.map((s) => `CT-e ${esc(s.cte?.numero || '?')} vol. ${s.volume || 'todos'}`).join(' · ')}</div>` : ''}
        ${c.leituras.length ? `<details style="margin-top:12px;"><summary style="cursor:pointer; font-size:13px;">Últimas leituras</summary><table class="edi-tabela" style="margin-top:6px;"><tbody>
          ${c.leituras.map((l) => `<tr><td>${dia(l.lido_em)}</td><td style="font-family:monospace;">${esc(l.codigo)}</td><td>${l.resultado === 'sobra' ? '⚠ sobra' : '✓'}</td><td>${esc(l.usuario_nome || '')}</td>
            <td>${aberta ? `<button class="btn btn-secundario" data-bp-desfazer="${l.id}" style="width:auto; padding:3px 8px; font-size:12px;">desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table></details>` : ''}
        <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:16px;">
          ${c.itens.length ? `<a class="btn btn-secundario" href="/api/etiquetas/imprimir?ctes=${c.itens.map((i) => i.cte_id).join(',')}&token=${encodeURIComponent(token)}" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">🏷 Etiquetas destes CT-e</a>` : ''}
          ${aberta ? '<button class="btn btn-primario" id="bpConcluir" style="width:auto;">✓ Concluir conferência</button>' : '<button class="btn btn-secundario" id="bpReabrir" style="width:auto;">Reabrir</button>'}
          ${!aberta && c.transferencia_id && c.tipo === 'descarga' && c.transferencia_status === 'em_transito' ? '<button class="btn btn-primario" id="bpReceber" style="width:auto;">✓ Registrar a chegada da transferência</button>' : ''}</div></div>`;
    $('bpVoltar').addEventListener('click', () => lista().catch(erro));
    const campo = $('bpCodigo');
    if (campo) {
      campo.focus();
      campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = campo.value.trim(); campo.value = ''; if (v) ler(v); } });
    }
    $('bpCamera')?.addEventListener('click', () => camera().catch(erro));
    $('bpAbaConferir').querySelectorAll('[data-bp-desfazer]').forEach((b) => b.addEventListener('click', async () => {
      try { await json(`/api/conferencias/${id}/leituras/${b.dataset.bpDesfazer}`, { method: 'DELETE' }); await abrirConferencia(id); } catch (err) { erro(err); }
    }));
    $('bpConcluir')?.addEventListener('click', async () => {
      const faltam = c.totais.faltam; const sobras = c.totais.sobras;
      if ((faltam || sobras) && !await confirmar(`${faltam ? `Ainda faltam ${faltam} volume(s).` : ''} ${sobras ? `Há ${sobras} volume(s) de outro romaneio.` : ''} Concluir mesmo assim? Fica registrado.`, { tipo: 'perigo', textoOk: 'Concluir' })) return;
      try { await json(`/api/conferencias/${id}/concluir`, { method: 'POST', body: '{}' }); await abrirConferencia(id); mostrarAlerta(faltam ? `Conferência concluída com ${faltam} volume(s) faltando.` : 'Conferência concluída: tudo certo.', { tipo: faltam ? 'aviso' : 'sucesso' }); } catch (err) { erro(err); }
    });
    $('bpReceber')?.addEventListener('click', async () => {
      try {
        const r = await json(`/api/transferencias/${c.transferencia_id}/receber`, { method: 'POST', body: JSON.stringify({ conferencia_id: c.id }) });
        mostrarAlerta(`Chegada registrada: ${r.ctes} CT-e na unidade.${r.nao_chegaram ? ` ${r.nao_chegaram} CT-e não chegaram (nenhum volume lido) e continuam em transferência.` : ''}`, { tipo: r.nao_chegaram ? 'aviso' : 'sucesso' });
        await abrirConferencia(c.id);
      } catch (err) { erro(err); }
    });
    $('bpReabrir')?.addEventListener('click', async () => { try { await json(`/api/conferencias/${id}/reabrir`, { method: 'POST' }); await abrirConferencia(id); } catch (err) { erro(err); } });
  }
  function estiloFeedback(r) {
    if (r === 'ok') return 'background:rgba(52,199,123,.18); color:var(--verde);';
    if (r === 'sobra' || r === 'invalido') return 'background:rgba(239,68,68,.18); color:#ef4444;';
    if (r === 'repetido') return 'background:rgba(245,158,11,.18); color:#d97706;';
    return 'background:var(--bg-elevado); color:var(--texto-fraco);';
  }
  // As leituras vão em fila (o leitor é mais rápido que a rede).
  let fila = Promise.resolve();
  function ler(codigo) {
    fila = fila.then(async () => {
      try {
        const r = await json(`/api/conferencias/${atual.id}/ler`, { method: 'POST', body: JSON.stringify({ codigo }) });
        bipe(r.resultado === 'ok');
        await abrirConferencia(atual.id, r);
      } catch (err) { bipe(false); erro(err); }
    });
  }

  // Câmera do celular (Chrome/Android): lê Code 128 e repassa para a conferência.
  let lendoCamera = false;
  async function camera() {
    const video = $('bpVideo');
    if (lendoCamera) { lendoCamera = false; video.srcObject?.getTracks().forEach((t) => t.stop()); video.classList.add('oculto'); return; }
    const detector = new window.BarcodeDetector({ formats: ['code_128'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream; video.classList.remove('oculto'); await video.play(); lendoCamera = true;
    let ultimoCodigo = ''; let ultimoEm = 0;
    const passo = async () => {
      if (!lendoCamera || !document.body.contains(video)) { stream.getTracks().forEach((t) => t.stop()); lendoCamera = false; return; }
      try {
        const achados = await detector.detect(video);
        const v = achados[0]?.rawValue;
        if (v && (v !== ultimoCodigo || Date.now() - ultimoEm > 3000)) { ultimoCodigo = v; ultimoEm = Date.now(); ler(v); }
      } catch { /* quadro ruim */ }
      setTimeout(passo, 250);
    };
    passo();
  }

  // ---------------- Etiquetas ----------------
  async function telaEtiquetas() {
    if (!formatos.length) { const c = await json('/api/etiquetas/config'); formato = c.formato; formatos = c.formatos; }
    $('bpAbaEtiquetas').innerHTML = `<div class="painel oc-painel">
      <div class="oc-barra">
        <div class="oc-busca"><input type="text" id="bpBusca" class="cte-entrada" placeholder="Nº do CT-e, NF, cliente ou cidade (vazio: últimos 10 dias)" style="min-width:320px;" /></div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <label for="bpFormato" style="font-size:12.5px;">Etiqueta</label>
          <select id="bpFormato" class="cte-entrada">${formatos.map((f) => `<option value="${f}" ${f === formato ? 'selected' : ''}>${f.replace('x', ' × ')} mm</option>`).join('')}</select>
          ${usuario?.perfil === 'admin' ? '<button class="btn btn-secundario" id="bpFormatoPadrao" style="width:auto; padding:6px 10px; font-size:12px;">Usar sempre</button>' : ''}
        </div>
      </div>
      <div class="oc-lote oculto" id="bpLote"><b id="bpLoteQtd"></b><span style="flex:1;"></span>
        <button class="btn btn-secundario" id="bpZpl" style="width:auto;" title="Arquivo para mandar direto à impressora Zebra/Argox (ZPL)">⬇ ZPL (Zebra)</button>
        <button class="btn btn-primario" id="bpImprimir" style="width:auto;">🖨 Imprimir etiquetas</button></div>
      <div class="edi-rolagem" id="bpCtes"></div></div>`;
    let tempo = null;
    $('bpBusca').addEventListener('input', () => { clearTimeout(tempo); tempo = setTimeout(() => carregarCtes().catch(erro), 350); });
    $('bpFormato').addEventListener('change', () => { formato = $('bpFormato').value; });
    $('bpFormatoPadrao')?.addEventListener('click', async () => { try { await json('/api/etiquetas/config', { method: 'PUT', body: JSON.stringify({ formato: $('bpFormato').value }) }); mostrarAlerta('Formato padrão salvo.', { tipo: 'sucesso' }); } catch (err) { erro(err); } });
    $('bpImprimir').addEventListener('click', () => imprimir(marcados()));
    $('bpZpl').addEventListener('click', () => baixarZpl(marcados()).catch(erro));
    await carregarCtes();
  }
  const marcados = () => [...document.querySelectorAll('[data-bp-cte]:checked')].map((x) => Number(x.dataset.bpCte));
  function atualizarLote() {
    const ids = marcados();
    const vols = ids.reduce((s, id) => s + Number(document.querySelector(`[data-bp-cte="${id}"]`).dataset.vol), 0);
    $('bpLote').classList.toggle('oculto', !ids.length);
    $('bpLoteQtd').textContent = `${ids.length} CT-e · ${vols} etiqueta(s)`;
  }
  async function carregarCtes() {
    const l = await json(`/api/etiquetas/ctes?busca=${encodeURIComponent($('bpBusca').value.trim())}`);
    $('bpCtes').innerHTML = l.length ? `<table class="edi-tabela"><thead><tr><th style="width:28px;"><input type="checkbox" id="bpTodos" aria-label="Marcar todos" /></th><th>CT-e</th><th>Autorizado</th><th>Remetente → destinatário</th><th>Cidade</th><th>NF</th><th class="n">Volumes</th><th></th></tr></thead><tbody>
      ${l.map((c) => `<tr><td><input type="checkbox" data-bp-cte="${c.id}" data-vol="${c.volumes}" aria-label="Marcar CT-e ${esc(c.numero)}" /></td><td><b>${esc(c.serie)}/${esc(c.numero)}</b></td><td>${dia(c.autorizado_em)}</td>
        <td style="font-size:12.5px;">${esc(c.remetente_nome || '')}<br><span style="color:var(--texto-fraco);">→ ${esc(c.destinatario_nome || '')}</span></td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td>
        <td><small>${esc(c.nfs.join(', '))}</small></td><td class="n">${c.volumes}</td>
        <td><div class="oc-linha-acoes"><button data-bp-um="${c.id}">🏷 Imprimir</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhum CT-e autorizado encontrado.</div>';
    $('bpTodos')?.addEventListener('change', (e) => { document.querySelectorAll('[data-bp-cte]').forEach((x) => { x.checked = e.target.checked; }); atualizarLote(); });
    $('bpCtes').addEventListener('change', atualizarLote);
    $('bpCtes').querySelectorAll('[data-bp-um]').forEach((b) => b.addEventListener('click', () => imprimir([Number(b.dataset.bpUm)])));
    atualizarLote();
  }
  function imprimir(ids, f = formato) {
    if (!ids.length) return;
    window.open(`/api/etiquetas/imprimir?ctes=${ids.join(',')}&formato=${encodeURIComponent(f)}&token=${encodeURIComponent(token)}`, '_blank', 'noopener');
  }
  async function baixarZpl(ids) {
    if (!ids.length) return;
    const r = await apiFetch(`/api/etiquetas/zpl?ctes=${ids.join(',')}&formato=${encodeURIComponent(formato)}`);
    if (!r.ok) throw new Error(await r.text());
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `etiquetas-${new Date().toISOString().slice(0, 10)}.zpl`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // Outras telas (CT-e, romaneio) chamam daqui.
  window.nexoConferencia = {
    conferirTransferencia: async (transferenciaId, tipo) => {
      pularCarga = true; nav.click(); pularCarga = false;
      aba = 'conferir';
      document.querySelectorAll('[data-bp-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.bpAba === 'conferir'));
      $('bpAbaConferir').classList.remove('oculto'); $('bpAbaEtiquetas').classList.add('oculto');
      await comecar({ tipo, transferencia_id: transferenciaId });
    },
    etiquetas: (ids) => imprimir(ids),
    conferirRomaneio: async (romaneioId) => {
      pularCarga = true; nav.click(); pularCarga = false;
      aba = 'conferir';
      document.querySelectorAll('[data-bp-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.bpAba === 'conferir'));
      $('bpAbaConferir').classList.remove('oculto'); $('bpAbaEtiquetas').classList.add('oculto');
      await comecar({ tipo: 'carga', romaneio_id: romaneioId });
    },
  };
})();
