// =====================================================================
// Roteirizar entregas: escolher as notas, calcular a sequência, mostrar no
// mapa e cadastrar as restrições de circulação. Usa do dashboard.js:
// apiFetch, mostrarAlerta, confirmar, usuario, formatoData.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('subabaRoteirizar')) return;
  const ehAdmin = usuario?.perfil === 'admin';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hm = (min) => { const m = Math.round(Number(min) || 0); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
  const km = (v) => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
  const num = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  let iniciado = false;
  let config = null;
  let notas = [];
  const marcadas = [];          // ids na ordem em que foram marcadas
  let resultado = null;
  let mapa = null;

  async function api(caminho, opcoes = {}) {
    const r = await apiFetch(`/api/roteirizacao${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(corpo.erro || 'Erro ao falar com o servidor.'); e.dados = corpo; throw e; }
    return corpo;
  }

  // ---------------- Início ----------------
  window.carregarRoteirizacao = async () => {
    if (!iniciado) {
      iniciado = true;
      $('rtUf').innerHTML += UFS.map((u) => `<option>${u}</option>`).join('');
      $('rtDesde').value = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const amanha = new Date(Date.now() + 86400000);
      $('rtSaida').value = `${amanha.toISOString().slice(0, 10)}T07:00`;
      try {
        config = await api('/config');
        $('rtCategoria').innerHTML = Object.entries(config.categorias).map(([k, v]) => `<option value="${k}" ${k === 'toco' ? 'selected' : ''}>${esc(v)}</option>`).join('');
        $('rtServico').value = config.tempo_parada_min ?? 30;
        $('rtRecIni').value = config.recebimento_inicio || '08:00'; $('rtRecFim').value = config.recebimento_fim || '18:00';
        $('rtRecSabado').checked = !!config.recebimento_sabado;
      } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
      try {
        const emp = await (await apiFetch('/api/empresa')).json();
        $('rtOrigemTexto').textContent = emp?.municipio
          ? [[emp.endereco, emp.numero].filter(Boolean).join(', '), emp.bairro, `${emp.municipio}/${emp.uf || ''}`].filter(Boolean).join(' — ')
          : 'Endereço da empresa não cadastrado — informe abaixo.';
        if (!emp?.municipio) $('rtOrigemCampos').classList.remove('oculto');
      } catch { /* segue */ }
    }
    carregarNotas();
  };

  let timer = null;
  ['rtDesde', 'rtUf', 'rtPedidos'].forEach((id) => $(id).addEventListener('change', carregarNotas));
  $('rtBusca').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(carregarNotas, 400); });
  $('rtOrigemAlterar').addEventListener('click', (e) => { e.preventDefault(); $('rtOrigemCampos').classList.toggle('oculto'); });

  async function carregarNotas() {
    const p = new URLSearchParams({ desde: $('rtDesde').value, uf: $('rtUf').value, busca: $('rtBusca').value.trim(), pedidos: $('rtPedidos').checked ? '1' : '0' });
    $('rtNotas').innerHTML = '<tr><td colspan="5" style="color:var(--texto-fraco);">Carregando…</td></tr>';
    try {
      notas = await api(`/notas?${p}`);
      desenharNotas();
    } catch (e) { $('rtNotas').innerHTML = `<tr><td colspan="5">${esc(e.message)}</td></tr>`; }
  }
  function desenharNotas() {
    $('rtNotas').innerHTML = notas.length ? notas.map((n) => `<tr data-id="${n.id}" class="${marcadas.includes(n.id) ? 'rt-sel' : ''}">
      <td><input type="checkbox" class="rt-marca" data-id="${n.id}" ${marcadas.includes(n.id) ? 'checked' : ''} /></td>
      <td style="white-space:nowrap;"><b>${esc(n.numero_nf || '—')}</b>${n.numero_pedido ? `<small class="rt-sub">ped. ${esc(n.numero_pedido)}</small>` : ''}</td>
      <td>${esc(n.cliente || '—')}${n.redespacho ? `<small class="rt-sub" style="color:#8b5cf6;">🔀 ${esc(String(n.redespacho).slice(0, 50))}</small>` : ''}</td>
      <td>${esc(n.cidade || '—')}/${esc(n.uf || '')}${n.bairro ? `<small class="rt-sub">${esc(n.bairro)}</small>` : ''}</td>
      <td style="text-align:right; white-space:nowrap;">${n.qtd_volumes ? `${num(n.qtd_volumes, 2)} vol` : '—'}${n.peso_kg ? `<small class="rt-sub">${num(n.peso_kg, 1)} kg</small>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="5" style="color:var(--texto-fraco); padding:12px;">Nenhuma nota em aberto com esses filtros.</td></tr>';
    atualizarContagem();
  }
  function atualizarContagem() {
    $('rtContagem').textContent = `${marcadas.length} marcada(s)${notas.length ? ` · ${notas.length} na lista` : ''}`;
    const naLista = notas.filter((n) => marcadas.includes(n.id)).length;
    $('rtMarcarTodas').checked = notas.length > 0 && naLista === notas.length;
    $('rtMarcarTodas').indeterminate = naLista > 0 && naLista < notas.length;
  }
  function marcar(id, sim) {
    const k = marcadas.indexOf(id);
    if (sim && k < 0) marcadas.push(id);
    if (!sim && k >= 0) marcadas.splice(k, 1);
  }
  $('rtNotas').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number(tr.dataset.id);
    const cb = tr.querySelector('.rt-marca');
    if (e.target !== cb) cb.checked = !cb.checked;
    marcar(id, cb.checked);
    tr.classList.toggle('rt-sel', cb.checked);
    atualizarContagem();
  });
  $('rtMarcarTodas').addEventListener('change', (e) => { notas.forEach((n) => marcar(n.id, e.target.checked)); desenharNotas(); });

  // Vindo do "Consolidar rotas": já chega com os pedidos marcados.
  window.roteirizarIds = (ids) => {
    marcadas.splice(0, marcadas.length, ...ids.map(Number).filter((x) => Number.isInteger(x) && x > 0));
    $('rtPedidos').checked = true;
  };

  // ---------------- Calcular ----------------
  $('btnRtCalcular').addEventListener('click', () => calcular());
  async function calcular(ordemNotas = null) {
    if (!marcadas.length) { mostrarAlerta('Marque as notas que vão no caminhão.', { tipo: 'info' }); return; }
    const botao = $('btnRtCalcular');
    botao.disabled = true;
    $('rtAndamento').textContent = `Procurando ${marcadas.length} endereço(s) no mapa e calculando a melhor sequência… (endereços novos levam ~1 s cada)`;
    const origemManual = !$('rtOrigemCampos').classList.contains('oculto') && $('rtOrigemCidade').value.trim();
    try {
      resultado = await api('/calcular', {
        method: 'POST',
        body: JSON.stringify({
          ids: marcadas, saida: $('rtSaida').value, servicoMin: Number($('rtServico').value),
          veiculo: { categoria: $('rtCategoria').value, placa: $('rtPlaca').value },
          recebimento: { inicio: $('rtRecIni').value, fim: $('rtRecFim').value, sabado: $('rtRecSabado').checked },
          voltar: $('rtVoltar').checked, doisMotoristas: $('rtDoisMotoristas').checked, otimizar: ordemNotas ? false : $('rtOtimizar').checked,
          ordemNotas: ordemNotas || marcadas,
          origem: origemManual ? { endereco: $('rtOrigemEnd').value.trim(), cidade: $('rtOrigemCidade').value.trim(), uf: $('rtOrigemUf').value.trim().toUpperCase() } : null,
        }),
      });
      desenharResultado();
      $('rtAndamento').textContent = '';
    } catch (e) {
      $('rtAndamento').textContent = '';
      const nl = e.dados?.naoLocalizadas;
      mostrarAlerta(`${e.message}${nl?.length ? `\n\nNão achados: ${nl.map((x) => `${x.nome} (${x.endereco})`).join('; ')}` : ''}`, { tipo: 'erro' });
    } finally { botao.disabled = false; }
  }

  function desenharResultado() {
    const r = resultado; const t = r.totais;
    $('rtResultado').classList.remove('oculto');
    $('rtResumo').innerHTML = `
      <div>Paradas<strong>${t.paradas}</strong>${t.notas} nota(s)</div>
      <div style="border-left-color:#8b5cf6;">Distância<strong>${km(t.km)}</strong></div>
      <div style="border-left-color:#f59e0b;">Dirigindo<strong>${hm(t.dirigindoMin)}</strong>${[t.pausas ? `${t.pausas} pausa(s) de 30 min` : '', t.pernoites ? `${t.pernoites} pernoite(s)` : ''].filter(Boolean).join(' · ') || 'sem pausa obrigatória'}</div>
      <div style="border-left-color:var(--verde);">Viagem completa<strong>${hm(t.jornadaMin)}</strong>saída ${esc(r.saida)} · fim ${esc(r.fim)}</div>
      <div style="border-left-color:${t.alertas ? 'var(--vermelho)' : 'var(--verde)'};">Restrições e alertas<strong>${t.alertas}</strong>${t.esperaMin ? `${hm(t.esperaMin)} esperando liberar` : ''}</div>`;
    const avisos = [];
    r.alertasJornada.forEach((a) => avisos.push(`<div class="mt-aviso">⚠ ${esc(a)}</div>`));
    if (t.aproximadas) avisos.push(`<div class="mt-aviso">📍 ${t.aproximadas} parada(s) localizada(s) só pelo <b>centro da cidade</b> (endereço não achado no mapa): a distância e o horário delas são aproximados.</div>`);
    if (r.naoLocalizadas?.length) avisos.push(`<div class="mt-aviso">❓ Ficaram de fora (cidade não encontrada): ${r.naoLocalizadas.map((x) => esc(`${x.nome} — ${x.endereco}`)).join('; ')}</div>`);
    $('rtAlertas').innerHTML = avisos.join('');
    $('rtFonte').textContent = `Distâncias e tempos: ${r.fonte}. Horários de Brasília. Veículo: ${$('rtCategoria').selectedOptions[0]?.textContent || ''}${r.veiculo.placaFinal ? ` (placa final ${r.veiculo.placaFinal})` : ''}.`;

    const entregas = r.passos.filter((p) => p.indice !== 0);
    $('rtSequencia').innerHTML = r.passos.map((p, k) => {
      const ehRetorno = p.indice === 0;
      const pos = entregas.indexOf(p);
      return `<tr>
        <td><span class="rt-num${ehRetorno ? ' rt-num-volta' : ''}">${ehRetorno ? '↩' : pos + 1}</span></td>
        <td><b>${esc(p.nome)}</b>${p.redespacho ? ' <small style="color:#8b5cf6;">redespacho</small>' : ''}<small class="rt-sub">${esc(p.endereco)}</small>
          ${p.precisao === 'cidade' ? '<small class="rt-sub" style="color:#e8890c;">≈ localizado pelo centro da cidade</small>' : ''}</td>
        <td>${ehRetorno ? '' : `${p.notas.map((n) => esc(n.nf || `ped. ${n.pedido}`)).join(', ')}<small class="rt-sub">${p.volumes ? `${num(p.volumes, 2)} vol` : ''}${p.peso ? ` · ${num(p.peso, 1)} kg` : ''}</small>`}</td>
        <td style="text-align:right; white-space:nowrap;">${km(p.legKm)}<small class="rt-sub">${hm(p.legMin)}${p.pausas ? ` + ${p.pausas}× pausa 30 min` : ''}</small>${p.pernoites ? `<small class="rt-sub" style="color:#e8890c;">🛏 + ${p.pernoites} pernoite(s) de 11h</small>` : ''}</td>
        <td style="white-space:nowrap;">${esc(p.chegada)}${p.esperaMin ? `<small class="rt-sub" style="color:var(--vermelho);">espera ${hm(p.esperaMin)}</small>` : ''}</td>
        <td style="white-space:nowrap;">${ehRetorno ? '' : esc(p.saida)}${!ehRetorno && p.servicoMin ? `<small class="rt-sub">${p.servicoMin} min descarga</small>` : ''}</td>
        <td class="rt-alertas">${p.alertas.map((a) => `<div class="${a.tipo === 'aviso' ? 'rt-alerta-aviso' : 'rt-alerta-espera'}">${a.tipo === 'conflito' ? '❗' : a.tipo === 'espera' ? '⛔' : '⚠'} ${esc(a.texto)}</div>`).join('')}</td>
        <td style="white-space:nowrap;">${ehRetorno ? '' : `<button class="btn btn-secundario rt-mover" data-k="${pos}" data-dir="-1" title="Entregar antes" ${pos === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-secundario rt-mover" data-k="${pos}" data-dir="1" title="Entregar depois" ${pos === entregas.length - 1 ? 'disabled' : ''}>↓</button>`}</td>
      </tr>`;
    }).join('');
    desenharMapa();
  }

  // Trocar a ordem na mão: recalcula horários e restrições nessa ordem.
  $('rtSequencia').addEventListener('click', (e) => {
    const b = e.target.closest('.rt-mover');
    if (!b || !resultado) return;
    const entregas = resultado.passos.filter((p) => p.indice !== 0);
    const k = Number(b.dataset.k); const j = k + Number(b.dataset.dir);
    [entregas[k], entregas[j]] = [entregas[j], entregas[k]];
    calcular(entregas.flatMap((p) => p.notas.map((n) => n.id)));
  });

  function desenharMapa() {
    if (typeof L === 'undefined') { $('rtMapa').innerHTML = '<p style="padding:12px;">Mapa indisponível.</p>'; return; }
    if (!mapa) {
      mapa = L.map('rtMapa', { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; colaboradores do OpenStreetMap' }).addTo(mapa);
    }
    mapa.eachLayer((camada) => { if (!(camada instanceof L.TileLayer)) mapa.removeLayer(camada); });
    const r = resultado;
    const icone = (texto, cor) => L.divIcon({ className: 'rt-marcador', html: `<span style="background:${cor};">${texto}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    const pontos = [[r.origem.lat, r.origem.lon]];
    L.marker([r.origem.lat, r.origem.lon], { icon: icone('S', '#16a34a') }).addTo(mapa).bindPopup(`<b>Saída</b><br>${esc(r.origem.endereco)}<br>${esc(r.saida)}`);
    let n = 0;
    r.passos.forEach((p) => {
      pontos.push([p.lat, p.lon]);
      if (p.indice === 0) return;
      n += 1;
      L.marker([p.lat, p.lon], { icon: icone(n, p.alertas.some((a) => a.tipo !== 'aviso') ? '#dc2626' : p.precisao === 'cidade' ? '#d97706' : '#2563eb') }).addTo(mapa)
        .bindPopup(`<b>${n}. ${esc(p.nome)}</b><br>${esc(p.endereco)}<br>Chegada: ${esc(p.chegada)}<br>Notas: ${p.notas.map((x) => esc(x.nf || x.pedido)).join(', ')}`);
    });
    L.polyline(r.geometria || pontos, { color: '#4d7cff', weight: 4, opacity: 0.8, dashArray: r.geometria ? null : '6 8' }).addTo(mapa);
    mapa.fitBounds(L.latLngBounds(pontos).pad(0.15));
    setTimeout(() => mapa.invalidateSize(), 50);
  }

  // ---------------- Google Maps, impressão e Excel ----------------
  $('btnRtGoogle').addEventListener('click', () => {
    if (!resultado) return;
    const pts = [resultado.origem, ...resultado.passos].map((p) => `${p.lat},${p.lon}`);
    // O Google Maps aceita até 9 paradas intermediárias por link: rotas maiores viram trechos.
    const links = [];
    for (let i = 0; i < pts.length - 1; i += 10) {
      const trecho = pts.slice(i, i + 11);
      const meio = trecho.slice(1, -1);
      links.push(`https://www.google.com/maps/dir/?api=1&origin=${trecho[0]}&destination=${trecho[trecho.length - 1]}${meio.length ? `&waypoints=${encodeURIComponent(meio.join('|'))}` : ''}&travelmode=driving`);
    }
    if (links.length === 1) { window.open(links[0], '_blank', 'noopener'); return; }
    const fundo = document.createElement('div');
    fundo.className = 'ep-historico-fundo';
    fundo.innerHTML = `<div class="ep-historico" style="width:min(520px, 100%);"><h3 style="margin-top:0;">🧭 Rota em ${links.length} partes</h3>
      <p style="font-size:13px;">O Google Maps aceita até 10 paradas por link. Abra uma parte de cada vez:</p>
      ${links.map((l, k) => `<p><a href="${esc(l)}" target="_blank" rel="noopener" style="color:var(--azul);">Parte ${k + 1} (paradas ${k * 10 + 1} a ${Math.min((k + 1) * 10, pts.length - 1)})</a></p>`).join('')}
      <button class="btn btn-secundario" data-fechar style="width:auto;">Fechar</button></div>`;
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fechar]')) fundo.remove(); });
    document.body.appendChild(fundo);
  });

  $('btnRtImprimir').addEventListener('click', () => {
    if (!resultado) return;
    const r = resultado; const t = r.totais;
    const janela = window.open('', '_blank');
    if (!janela) return;
    let n = 0;
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Roteiro de entregas</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:16px;color:#000} h1{font-size:18px;margin:0 0 4px} table{width:100%;border-collapse:collapse;margin-top:10px}
      td,th{border:1px solid #999;padding:5px;vertical-align:top;text-align:left} th{background:#eee;font-size:11px} small{color:#555} .a{color:#b00}
      @media print{button{display:none}}</style></head><body>
      <button onclick="window.print()" style="float:right;padding:6px 14px;">Imprimir</button>
      <h1>Roteiro de entregas</h1>
      <div>Saída: <b>${esc(r.saida)}</b> — ${esc(r.origem.endereco)}<br>
      ${t.paradas} parada(s) · ${t.notas} nota(s) · ${km(t.km)} · dirigindo ${hm(t.dirigindoMin)} · viagem ${hm(t.jornadaMin)} · fim previsto ${esc(r.fim)}</div>
      ${r.alertasJornada.map((a) => `<p class="a">⚠ ${esc(a)}</p>`).join('')}
      <table><tr><th>#</th><th>Cliente / endereço</th><th>Notas</th><th>Trecho</th><th>Chegada</th><th>Atenção</th><th>Recebido por / hora</th></tr>
      ${r.passos.map((p) => { if (p.indice !== 0) n += 1; return `<tr><td>${p.indice === 0 ? '↩' : n}</td><td><b>${esc(p.nome)}</b><br><small>${esc(p.endereco)}</small></td>
        <td>${p.notas.map((x) => esc(x.nf || x.pedido)).join(', ')}${p.volumes ? `<br><small>${num(p.volumes, 2)} vol${p.peso ? ` · ${num(p.peso, 1)} kg` : ''}</small>` : ''}</td>
        <td>${km(p.legKm)}<br><small>${hm(p.legMin)}${p.pausas ? ` + ${p.pausas} pausa` : ''}${p.pernoites ? ` + ${p.pernoites} pernoite` : ''}</small></td><td>${esc(p.chegada)}${p.esperaMin ? `<br><small class="a">espera ${hm(p.esperaMin)}</small>` : ''}</td>
        <td>${p.alertas.map((a) => `<small class="a">${esc(a.texto)}</small>`).join('<br>')}</td><td style="width:140px;"></td></tr>`; }).join('')}</table>
      <p><small>${esc($('rtFonte').textContent)}</small></p></body></html>`);
    janela.document.close();
  });

  $('btnRtExcel').addEventListener('click', () => {
    if (!resultado) return;
    let n = 0;
    const cab = ['Ordem', 'Parada', 'Endereço', 'Cidade', 'UF', 'Notas', 'Volumes', 'Peso (kg)', 'Trecho (km)', 'Trecho (min)', 'Pausas', 'Chegada', 'Espera (min)', 'Saída', 'Atenção', 'Latitude', 'Longitude'];
    const linhas = resultado.passos.map((p) => [p.indice === 0 ? 'retorno' : (n += 1), p.nome, p.endereco, p.cidade, p.uf, p.notas.map((x) => x.nf || x.pedido).join(', '),
      p.volumes, p.peso, p.legKm, p.legMin, p.pausas, p.chegada, p.esperaMin, p.saida, p.alertas.map((a) => a.texto).join(' | '), p.lat, p.lon]
      .map((v) => (typeof v === 'number' ? String(v).replace('.', ',') : v)));
    const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `roteiro_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  // ---------------- Restrições de circulação e serviço de mapas ----------------
  $('btnRtConfig').addEventListener('click', abrirConfig);
  $('btnRtConfigFechar').addEventListener('click', () => $('rtModalConfig').classList.add('oculto'));
  let restricoes = [];
  async function abrirConfig() {
    try {
      config = await api('/config');
      restricoes = await api('/restricoes');
    } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); return; }
    desenharConfig();
    $('rtModalConfig').classList.remove('oculto');
  }
  const catTexto = (csv) => (String(csv || '').split(',').filter(Boolean).map((c) => config.categorias[c] || c).join(', ') || 'todos os veículos');
  function desenharConfig() {
    const c = config;
    const sel = (id, ops, v) => `<select id="${id}" ${ehAdmin ? '' : 'disabled'}>${ops.map(([k, t]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    $('rtConfigCorpo').innerHTML = `
      <h4 style="margin:16px 0 8px;">Restrições de circulação</h4>
      <p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 8px;">As regras que vêm prontas (São Paulo) são uma base: confira na prefeitura/CET da cidade e ajuste. “Esperar” faz o caminhão aguardar a janela
        acabar; “Avisar” só alerta. Deixe “Bairros” vazio para valer na cidade toda.</p>
      <div style="overflow-x:auto;"><table class="rt-tabela"><thead><tr><th>Cidade</th><th>Restrição</th><th>Veículos</th><th>Quando</th><th>Efeito</th><th></th></tr></thead><tbody>
        ${restricoes.map((r) => `<tr style="${r.ativo ? '' : 'opacity:.5;'}"><td>${esc(r.cidade)}/${esc(r.uf)}${r.bairros ? `<small class="rt-sub">${esc(r.bairros)}</small>` : ''}</td>
          <td>${esc(r.descricao)}${r.observacao ? `<small class="rt-sub">${esc(r.observacao)}</small>` : ''}</td><td>${esc(catTexto(r.categorias))}</td>
          <td style="white-space:nowrap;">${String(r.dias).split(',').map((d) => DIAS[d]).join(', ')}<small class="rt-sub">${esc(r.inicio)}–${esc(r.fim)}${r.tipo === 'rodizio' ? ' · rodízio' : ''}</small></td>
          <td>${r.efeito === 'esperar' ? '⛔ Esperar' : '⚠ Avisar'}</td>
          <td style="white-space:nowrap;">${ehAdmin ? `<button class="btn btn-secundario rt-edita" data-id="${r.id}" style="width:auto; padding:3px 8px;">✏️</button>
            <button class="btn btn-secundario rt-apaga" data-id="${r.id}" style="width:auto; padding:3px 8px;">🗑</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma restrição cadastrada.</td></tr>'}
      </tbody></table></div>
      ${ehAdmin ? '<button class="btn btn-secundario" id="rtNovaRestricao" style="width:auto; margin-top:8px;">+ Nova restrição</button><div id="rtFormRestricao"></div>' : ''}
      <h4 style="margin:22px 0 8px;">Serviço de mapas</h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:0 12px;">
        <div class="campo"><label>Distâncias e tempos</label>${sel('rtcProvedor', [['osrm', 'OSRM (gratuito, sem chave)'], ['ors', 'OpenRouteService (caminhão, chave grátis)'], ['estimado', 'Só estimativa (sem internet)']], c.provedor)}</div>
        <div class="campo"><label>Chave do OpenRouteService</label><input type="password" id="rtcChave" placeholder="${c.tem_chave_ors ? '•••••• (cadastrada)' : 'openrouteservice.org → Dev dashboard'}" ${ehAdmin ? '' : 'disabled'} autocomplete="off" /></div>
        <div class="campo"><label>Tempo do caminhão × carro (OSRM)</label><input type="number" step="0.05" min="1" max="3" id="rtcFator" value="${esc(c.fator_caminhao)}" ${ehAdmin ? '' : 'disabled'} /></div>
        <div class="campo"><label>Velocidade média na estimativa (km/h)</label><input type="number" min="20" max="110" id="rtcVel" value="${esc(c.velocidade_estimada)}" ${ehAdmin ? '' : 'disabled'} /></div>
        <div class="campo"><label>Tempo padrão em cada parada (min)</label><input type="number" min="0" max="600" id="rtcParada" value="${esc(c.tempo_parada_min)}" ${ehAdmin ? '' : 'disabled'} /></div>
        <div class="campo"><label>Clientes recebem das (padrão)</label><input type="time" id="rtcRecIni" value="${esc(c.recebimento_inicio)}" ${ehAdmin ? '' : 'disabled'} /></div>
        <div class="campo"><label>até</label><input type="time" id="rtcRecFim" value="${esc(c.recebimento_fim)}" ${ehAdmin ? '' : 'disabled'} /></div>
        <div class="campo"><label>Recebem no sábado</label><select id="rtcRecSab" ${ehAdmin ? '' : 'disabled'}><option value="0">Não</option><option value="1" ${c.recebimento_sabado ? 'selected' : ''}>Sim</option></select></div>
      </div>
      <label style="display:flex; gap:6px; align-items:center; font-size:13px;"><input type="checkbox" id="rtcGeo" ${c.geocodificar_endereco ? 'checked' : ''} ${ehAdmin ? '' : 'disabled'} />
        Procurar a rua e o número no mapa (OpenStreetMap). Desligado: usa o centro da cidade.</label>
      <p style="font-size:12px; color:var(--texto-fraco);">O OSRM calcula como carro (o tempo é multiplicado pelo fator acima). O OpenRouteService usa o perfil de caminhão, que já evita vias com restrição
        de altura, peso ou proibição de caminhão cadastradas no OpenStreetMap. Sem internet, o sistema estima pela distância em linha reta.</p>
      ${ehAdmin ? '<button class="btn btn-primario" id="rtcSalvar" style="width:auto;">💾 Salvar</button>' : ''}`;
    if (!ehAdmin) return;
    $('rtcSalvar').addEventListener('click', async () => {
      try {
        await api('/config', { method: 'PUT', body: JSON.stringify({ provedor: $('rtcProvedor').value, ors_chave: $('rtcChave').value, fator_caminhao: $('rtcFator').value,
          velocidade_estimada: $('rtcVel').value, tempo_parada_min: $('rtcParada').value, geocodificar_endereco: $('rtcGeo').checked,
          recebimento_inicio: $('rtcRecIni').value, recebimento_fim: $('rtcRecFim').value, recebimento_sabado: $('rtcRecSab').value === '1' }) });
        config = await api('/config'); $('rtServico').value = config.tempo_parada_min;
        $('rtRecIni').value = config.recebimento_inicio; $('rtRecFim').value = config.recebimento_fim; $('rtRecSabado').checked = !!config.recebimento_sabado;
        mostrarAlerta('Configuração salva.', { tipo: 'sucesso' });
      } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    });
    $('rtNovaRestricao').addEventListener('click', () => formRestricao(null));
    $('rtConfigCorpo').addEventListener('click', async (e) => {
      const ed = e.target.closest('.rt-edita'); const ap = e.target.closest('.rt-apaga');
      if (ed) formRestricao(restricoes.find((r) => r.id === Number(ed.dataset.id)));
      if (ap) {
        if (!await confirmar('Excluir esta restrição?', { tipo: 'perigo', textoOk: 'Excluir' })) return;
        try { await api(`/restricoes/${ap.dataset.id}`, { method: 'DELETE' }); restricoes = await api('/restricoes'); desenharConfig(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
      }
    });
  }

  function formRestricao(r) {
    const v = r || { cidade: '', uf: '', bairros: '', descricao: '', categorias: 'tres_quartos,toco,truck,carreta', dias: '1,2,3,4,5', inicio: '07:00', fim: '19:00', tipo: 'proibido', efeito: 'esperar', ativo: true, finais: {} };
    const cats = String(v.categorias || '').split(','); const dias = String(v.dias || '').split(',');
    const finais = v.finais || {};
    $('rtFormRestricao').innerHTML = `<div class="cte-secao" style="margin-top:10px;"><h4>${r ? 'Alterar restrição' : 'Nova restrição'}</h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:0 12px;">
        <div class="campo"><label>Cidade</label><input type="text" id="rfCidade" value="${esc(v.cidade)}" /></div>
        <div class="campo"><label>UF</label><input type="text" id="rfUf" maxlength="2" value="${esc(v.uf)}" /></div>
        <div class="campo" style="grid-column:span 2;"><label>Nome / descrição</label><input type="text" id="rfDesc" value="${esc(v.descricao)}" /></div>
        <div class="campo" style="grid-column:1 / -1;"><label>Bairros (separados por vírgula; vazio = cidade toda)</label><input type="text" id="rfBairros" value="${esc(v.bairros || '')}" /></div>
        <div class="campo"><label>Das</label><input type="time" id="rfIni" value="${esc(v.inicio)}" /></div>
        <div class="campo"><label>Até</label><input type="time" id="rfFim" value="${esc(v.fim)}" /></div>
        <div class="campo"><label>Tipo</label><select id="rfTipo"><option value="proibido" ${v.tipo !== 'rodizio' ? 'selected' : ''}>Proibido circular</option><option value="rodizio" ${v.tipo === 'rodizio' ? 'selected' : ''}>Rodízio (final de placa)</option></select></div>
        <div class="campo"><label>Efeito</label><select id="rfEfeito"><option value="esperar" ${v.efeito !== 'avisar' ? 'selected' : ''}>Esperar a janela acabar</option><option value="avisar" ${v.efeito === 'avisar' ? 'selected' : ''}>Só avisar</option></select></div>
      </div>
      <div style="font-size:12.5px; margin-bottom:8px;">Dias: ${DIAS.map((d, i) => `<label style="margin-right:10px;"><input type="checkbox" class="rfDia" value="${i}" ${dias.includes(String(i)) ? 'checked' : ''} /> ${d}</label>`).join('')}</div>
      <div style="font-size:12.5px; margin-bottom:8px;">Veículos afetados: ${Object.entries(config.categorias).map(([k, t]) => `<label style="margin-right:10px;"><input type="checkbox" class="rfCat" value="${k}" ${cats.includes(k) ? 'checked' : ''} /> ${esc(t)}</label>`).join('')}
        <small style="color:var(--texto-fraco);">(nenhum marcado = todos)</small></div>
      <div id="rfFinais" class="${v.tipo === 'rodizio' ? '' : 'oculto'}" style="font-size:12.5px; margin-bottom:8px;">Finais de placa por dia:
        ${[1, 2, 3, 4, 5, 6, 0].map((i) => `<label style="margin-right:8px;">${DIAS[i]} <input type="text" class="rfFinal" data-dia="${i}" value="${esc(finais[i] || '')}" style="width:50px;" placeholder="1,2" /></label>`).join('')}</div>
      <div class="campo"><label>Observação / fonte</label><input type="text" id="rfObs" value="${esc(v.observacao || '')}" /></div>
      <label style="font-size:13px;"><input type="checkbox" id="rfAtivo" ${v.ativo !== false ? 'checked' : ''} /> Ativa</label>
      <div style="margin-top:10px; display:flex; gap:8px;"><button class="btn btn-primario" id="rfSalvar" style="width:auto;">💾 Salvar restrição</button>
        <button class="btn btn-secundario" id="rfCancelar" style="width:auto;">Cancelar</button></div></div>`;
    $('rfTipo').addEventListener('change', () => $('rfFinais').classList.toggle('oculto', $('rfTipo').value !== 'rodizio'));
    $('rfCancelar').addEventListener('click', () => { $('rtFormRestricao').innerHTML = ''; });
    $('rfSalvar').addEventListener('click', async () => {
      const finaisSel = {};
      document.querySelectorAll('.rfFinal').forEach((i) => { if (i.value.trim()) finaisSel[i.dataset.dia] = i.value.replace(/[^\d,]/g, ''); });
      const corpo = { cidade: $('rfCidade').value, uf: $('rfUf').value, descricao: $('rfDesc').value, bairros: $('rfBairros').value,
        inicio: $('rfIni').value, fim: $('rfFim').value, tipo: $('rfTipo').value, efeito: $('rfEfeito').value, observacao: $('rfObs').value, ativo: $('rfAtivo').checked,
        dias: [...document.querySelectorAll('.rfDia:checked')].map((x) => x.value).join(','),
        categorias: [...document.querySelectorAll('.rfCat:checked')].map((x) => x.value).join(','), finais: finaisSel };
      try {
        await api(r ? `/restricoes/${r.id}` : '/restricoes', { method: r ? 'PUT' : 'POST', body: JSON.stringify(corpo) });
        restricoes = await api('/restricoes'); desenharConfig();
      } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
    });
  }
})();
