// Página do motorista no pátio (patio.html?c=CODIGO): QR Code para a portaria, a situação, a posição na fila,
// a previsão e, quando chamado, a doca em destaque (com vibração). Atualiza a cada 15 s. Sem login: só pelo código.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const codigo = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hora = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  let statusAnterior = null;
  if (codigo.length !== 8) { $('pmCartao').innerHTML = '<p class="rt-erro">Link incompleto. Peça o link de novo a quem agendou.</p>'; return; }
  $('pmQr').innerHTML = `<img src="/api/patio-publico/${codigo}/qr.svg" alt="QR Code" /><span class="pm-codigo">${codigo}</span><small>Mostre este QR Code na portaria</small>`;
  async function carregar() {
    try {
      const r = await fetch(`/api/patio-publico/${codigo}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Não foi possível consultar.');
      if (j.empresa) $('pmEmpresa').textContent = j.empresa;
      const cls = { saiu: 'entregue', liberado: 'entregue', cancelado: 'cancelado', nao_compareceu: 'cancelado', aguardando: 'ocorrencia' }[j.status] || '';
      let destaque = '';
      if (j.status === 'chamado') destaque = `<div class="pm-doca"><small>📣 É a sua vez! Dirija-se à</small><b>${esc(j.doca || 'doca')}</b></div>`;
      else if (j.status === 'em_doca') destaque = `<div class="pm-doca"><small>Você está na</small><b>${esc(j.doca || 'doca')}</b></div>`;
      else if (j.status === 'aguardando') destaque = `<div class="pm-fila">Sua posição na fila<b>${j.posicao ? `${j.posicao}º` : '—'}</b>${j.previsao ? `Previsão: ${j.previsao.espera_min ? `cerca de ${j.previsao.espera_min} min` : 'em instantes'}${j.previsao.inicio ? ` (às ${hora(j.previsao.inicio)})` : ''}` : ''}</div>`;
      else if (j.status === 'liberado') destaque = '<div class="pm-fila">✅ Operação concluída. Siga para a portaria de saída.</div>';
      $('pmCartao').innerHTML = `<div class="rt-status"><div><h2>${esc(j.placa || codigo)}</h2><small>${esc(j.operacao || '')}${j.motorista ? ` · ${esc(j.motorista)}` : ''}</small></div><span class="rt-sit ${cls}">${esc(j.status_txt)}</span></div>
        <div class="rt-dados">${j.previsto_em ? `<div>Agendado<b>${dataHora(j.previsto_em)}</b>${j.janela_min ? `<small>janela de ${j.janela_min} min</small>` : ''}</div>` : ''}
          ${j.chegada_em ? `<div>Chegada<b>${dataHora(j.chegada_em)}</b></div>` : ''}${j.saida_em ? `<div>Saída<b>${dataHora(j.saida_em)}</b></div>` : ''}</div>
        ${destaque}`;
      $('pmQr').classList.toggle('oculto', ['saiu', 'cancelado', 'nao_compareceu'].includes(j.status));
      if (j.status === 'chamado' && statusAnterior && statusAnterior !== 'chamado' && navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]);
      statusAnterior = j.status;
    } catch (err) { $('pmCartao').innerHTML = `<p class="rt-erro">${esc(err.message)}</p>`; }
  }
  carregar();
  setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 15000);
})();
