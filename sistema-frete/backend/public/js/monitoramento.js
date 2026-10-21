// =====================================================================
// Monitoramento de veículos: mapa com os caminhões em rota (posição do app
// do motorista), situação, próxima entrega com a chegada prevista e os
// alertas; clicando, o trajeto do dia e as entregas na ordem.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta. Leaflet (L) e LinkSeguro.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navMonitoramento');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hora = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
  const quandoHa = (v) => { if (!v) return 'nunca'; const m = Math.round((Date.now() - new Date(v)) / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
  const diaHora = (v) => { if (!v) return '—'; const d = new Date(v); const hoje = new Date().toDateString() === d.toDateString(); return hoje ? hora(v) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/monitoramento${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const ESTADO = { em_movimento: ['Em movimento', '#16a34a'], parado: ['Parado', '#d97706'], no_cliente: ['No cliente', '#2563eb'], sem_sinal: ['Sem sinal', '#6b7280'], sem_posicao: ['Sem posição', '#9ca3af'] };
  let mapa = null; let camadas = null; let aberto = null; let timer = null; let dados = null;

  function prepararMapa() {
    if (typeof L === 'undefined') { $('moMapa').innerHTML = '<p style="padding:12px;">Mapa indisponível.</p>'; return false; }
    if (mapa) { setTimeout(() => mapa.invalidateSize(), 50); return true; }
    mapa = L.map('moMapa', { scrollWheelZoom: true }).setView([-15.8, -47.9], 4);
    camadas = L.layerGroup().addTo(mapa);
    LinkSeguro.ticket('/api/roteirizacao/mapa/').then((t) => {
      const fundo = L.tileLayer(`/api/roteirizacao/mapa/{z}/{x}/{y}.png?token=${encodeURIComponent(t)}`, {
        maxZoom: 18, attribution: '&copy; colaboradores do OpenStreetMap',
        errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+/btfwAJ4gPu4vb0xQAAAABJRU5ErkJggg==',
      }).addTo(mapa);
      let avisou = false;
      fundo.on('tileerror', () => { if (avisou) return; avisou = true; $('moAvisoMapa').classList.remove('oculto'); });
    }).catch(() => {});
    setTimeout(() => mapa.invalidateSize(), 50);
    return true;
  }
  const iconeCaminhao = (v) => L.divIcon({ className: 'mo-caminhao', iconSize: null, iconAnchor: [18, 18],
    html: `<span style="background:${ESTADO[v.estado]?.[1] || '#6b7280'};">🚚</span><b>${esc(v.placa || v.motorista)}</b>` });
  const iconeParada = (n, cor) => L.divIcon({ className: 'rt-marcador', html: `<span style="background:${cor};">${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });

  function cartao(v) {
    const [nome, cor] = ESTADO[v.estado] || [v.estado, '#6b7280'];
    const alertas = v.alertas.filter((a) => a.tipo !== 'sem_posicao');
    return `<div class="mo-cartao ${aberto === v.id ? 'ativo' : ''}" data-mo-abrir="${v.id}">
      <div style="display:flex; justify-content:space-between; gap:8px;"><b>🚚 ${esc(v.placa || '—')} · ${esc(v.motorista)}</b><span class="mo-estado" style="background:${cor};">${nome}</span></div>
      <small>${v.parceiro ? 'Parceiro (redespacho) · ' : ''}Romaneio ${v.id} · ${v.entregas.feitas}/${v.entregas.total} entregas · posição ${quandoHa(v.posicao?.em)}${v.posicao?.velocidade ? ` · ${Math.round(v.posicao.velocidade)} km/h` : ''}</small>
      ${v.no_cliente ? `<small>📍 No cliente: ${esc(v.no_cliente)}${v.parado_desde ? ` desde ${hora(v.parado_desde)}` : ''}</small>` : v.estado === 'parado' && v.parado_desde ? `<small>⏸ Parado desde ${hora(v.parado_desde)}</small>` : ''}
      ${v.proxima ? `<small>➡ Próxima: <b>${esc(v.proxima.destinatario)}</b> (CT-e ${esc(v.proxima.numero)})${v.proxima.chegada_prevista ? ` · chega ~${diaHora(v.proxima.chegada_prevista)}` : ''}</small>` : '<small>✓ Todas as entregas feitas</small>'}
      ${alertas.map((a) => `<div class="mo-alerta ${a.tipo}">⚠ ${esc(a.texto)}</div>`).join('')}
    </div>`;
  }

  async function carregar() {
    dados = await api('');
    const r = dados.resumo;
    $('moResumo').innerHTML = `
      <div>Em rota<b>${r.em_rota}</b><span>romaneios que saíram</span></div>
      <div>Em movimento<b style="color:#16a34a;">${r.em_movimento}</b><span>andando agora</span></div>
      <div>Parados<b style="color:#d97706;">${r.parados}</b><span>no cliente ou fora</span></div>
      <div>Sem sinal<b style="color:#6b7280;">${r.sem_sinal}</b><span>app fechado ou sem internet</span></div>
      <div>Com alerta<b style="color:${r.com_alerta ? '#ef4444' : 'inherit'};">${r.com_alerta}</b><span>parado, fora da rota, atraso</span></div>`;
    if (aberto) { await detalhe(aberto); return; }
    $('moLado').innerHTML = dados.veiculos.length
      ? dados.veiculos.map(cartao).join('')
      : '<div class="kanban-vazio">Nenhum romaneio em rota. Quando o caminhão sai (Romaneios » Dar saída, ou "Iniciar a rota" no app), o app do motorista passa a mandar a posição e o veículo aparece aqui.</div>';
    ligarCartoes();
    if (!prepararMapa()) return;
    camadas.clearLayers();
    const limites = [];
    dados.veiculos.filter((v) => v.posicao).forEach((v) => {
      const m = L.marker([v.posicao.lat, v.posicao.lon], { icon: iconeCaminhao(v) }).addTo(camadas);
      m.bindTooltip(`${esc(v.placa || '')} · ${esc(v.motorista)}<br>${ESTADO[v.estado]?.[0] || ''} · ${quandoHa(v.posicao.em)}`);
      m.on('click', () => abrir(v.id));
      limites.push([v.posicao.lat, v.posicao.lon]);
    });
    if (limites.length) mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 13 });
  }
  function ligarCartoes() {
    document.querySelectorAll('#moLado [data-mo-abrir]').forEach((b) => b.addEventListener('click', () => abrir(Number(b.dataset.moAbrir))));
  }
  function abrir(id) { aberto = id; detalhe(id).catch(erro); }

  async function detalhe(id) {
    const v = await api(`/${id}`);
    const faltam = v.paradas.filter((p) => !p.feita);
    $('moLado').innerHTML = `<button class="btn btn-secundario" id="moVoltar" style="width:auto; margin-bottom:10px;">← Todos os veículos</button>
      ${cartao(v)}
      <div class="mo-info">Saiu ${diaHora(v.saiu_em)} · ${String(v.km_rodados).replace('.', ',')} km rodados (pelo GPS)${v.telefone ? ` · <a href="tel:${esc(v.telefone)}">📞 ${esc(v.telefone)}</a>` : ''}</div>
      <table class="edi-tabela" style="margin-top:8px;"><thead><tr><th>#</th><th>Entrega</th><th>Chegada</th></tr></thead><tbody>
      ${v.paradas.map((p, i) => `<tr${p.feita ? ' style="opacity:.6;"' : ''}><td>${i + 1}</td><td><b>${esc(p.destinatario)}</b><br><small style="color:var(--texto-fraco);">CT-e ${esc(p.numero)} · ${esc(p.cidade)}${p.ponto?.precisao === 'cidade' ? ' · no mapa: centro da cidade' : ''}</small>
        ${p.atraso ? `<br><small style="color:#ef4444;">⚠ ${esc(p.atraso)}</small>` : ''}${p.agendamento ? `<br><small>📅 agendado ${esc(p.agendamento.data.split('-').reverse().join('/'))}${p.agendamento.hora_de ? ` ${esc(p.agendamento.hora_de)}–${esc(p.agendamento.hora_ate || '')}` : ''}</small>` : ''}</td>
        <td>${p.feita ? `<small>${p.situacao === 'entregue' ? `✓ ${diaHora(p.data_entrega)}` : esc(p.situacao)}</small>` : p.chegada_prevista ? `~${diaHora(p.chegada_prevista)}` : '—'}</td></tr>`).join('')}</tbody></table>
      <p class="edi-dica" style="margin-top:8px;">Chegada prevista pela distância até cada entrega (ruas ≈ 1,3 × linha reta, velocidade média da roteirização) mais ${v.config.atendimento_min} min por entrega. ${faltam.some((p) => p.ponto?.precisao === 'cidade') ? 'Entregas sem o endereço achado no mapa ficam no centro da cidade: a previsão é aproximada.' : ''}${v.rota ? '' : ' Sem o desenho da rota (serviço de rotas fora do ar): o alerta "fora da rota" fica desligado.'}</p>`;
    $('moVoltar').addEventListener('click', () => { aberto = null; carregar().catch(erro); });
    if (!prepararMapa()) return;
    camadas.clearLayers();
    const limites = [];
    if (v.rota?.length) L.polyline(v.rota, { color: '#64748b', weight: 4, dashArray: '6 8', opacity: 0.8 }).addTo(camadas).bindTooltip('Rota planejada');
    if (v.trajeto.length) { L.polyline(v.trajeto, { color: '#2563eb', weight: 4 }).addTo(camadas).bindTooltip('Por onde o caminhão passou'); limites.push(...v.trajeto); }
    v.paradas.forEach((p, i) => {
      if (!p.ponto) return;
      const cor = p.feita ? (p.situacao === 'entregue' ? '#16a34a' : '#d97706') : p.atraso ? '#dc2626' : '#2563eb';
      L.marker([p.ponto.lat, p.ponto.lon], { icon: iconeParada(i + 1, cor) }).addTo(camadas)
        .bindPopup(`<b>${i + 1}. ${esc(p.destinatario)}</b><br>${esc(p.endereco || '')} ${esc(p.cidade)}<br>${p.feita ? esc(p.situacao) : `Chegada prevista: ${diaHora(p.chegada_prevista)}`}`);
      limites.push([p.ponto.lat, p.ponto.lon]);
    });
    v.baixas.forEach((b) => L.circleMarker([b.lat, b.lon], { radius: 5, color: b.tipo === 'entrega' ? '#16a34a' : '#d97706' }).addTo(camadas).bindTooltip(`${esc(b.descricao)} · ${diaHora(b.data_hora)}`));
    if (v.posicao) { L.marker([v.posicao.lat, v.posicao.lon], { icon: iconeCaminhao(v), zIndexOffset: 1000 }).addTo(camadas); limites.push([v.posicao.lat, v.posicao.lon]); }
    if (limites.length) mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 15 });
  }

  function atualizarSozinho() {
    clearInterval(timer);
    timer = setInterval(() => { if (!$('pagina-monitoramento').classList.contains('oculto') && document.visibilityState === 'visible') carregar().catch(() => {}); }, 30000);
  }
  nav.addEventListener('click', () => { aberto = null; carregar().catch(erro); atualizarSozinho(); });

  $('moConfig').addEventListener('click', async () => {
    let c;
    try { c = await api('/config'); } catch (err) { erro(err); return; }
    const campos = [['intervalo_s', 'O app manda a posição a cada (segundos)'], ['parada_min', 'Alerta de parado depois de (min)'], ['sem_sinal_min', 'Sem sinal depois de (min)'],
      ['desvio_km', 'Fora da rota a mais de (km)'], ['atendimento_min', 'Tempo em cada entrega (min, para a previsão)'], ['guardar_dias', 'Guardar as posições por (dias)']];
    $('moModal').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><h3 style="margin:0;">⚙ Limites do monitoramento</h3><span style="cursor:pointer; font-size:18px;" data-mo-fechar>✕</span></div>
      <div class="oc-form">${campos.map(([k, t]) => `<div class="campo"><label for="mc_${k}">${t}</label><input id="mc_${k}" data-mc="${k}" class="cte-entrada" value="${esc(String(c[k]).replace('.', ','))}" /></div>`).join('')}</div>
      <p class="edi-dica">A posição vem do GPS do celular, com o app do motorista aberto e o romaneio em rota (com a tela apagada o navegador pode parar de mandar; o motorista pode deixar a tela ligada pelo próprio app). As posições ficam guardadas pelo prazo acima e depois são apagadas.</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-mo-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="mcSalvar" style="width:auto;">Salvar</button></div>`;
    $('modalMonitoramento').classList.remove('oculto');
    $('mcSalvar').addEventListener('click', async () => {
      const b = {}; document.querySelectorAll('[data-mc]').forEach((i) => { b[i.dataset.mc] = i.value; });
      try { await api('/config', { method: 'PUT', body: JSON.stringify(b) }); $('modalMonitoramento').classList.add('oculto'); mostrarAlerta('Limites salvos.', { tipo: 'sucesso' }); carregar().catch(erro); } catch (err) { erro(err); }
    });
  });
  $('modalMonitoramento').addEventListener('click', (e) => { if (e.target.id === 'modalMonitoramento' || e.target.closest('[data-mo-fechar]')) $('modalMonitoramento').classList.add('oculto'); });
})();
