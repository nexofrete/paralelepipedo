// Página da transportadora para a ordem de coleta (coleta.html?t=CODIGO): mostra a ordem e as notas e deixa
// aceitar (data e hora de chegada, placa, motorista) ou recusar (motivo). Aceita, vira agendamento no pátio e
// mostra o link do motorista (QR Code da portaria). Sem login: só pelo código do link.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const token = (new URLSearchParams(location.search).get('t') || '').replace(/[^A-Za-z0-9_-]/g, '');
  const dataHora = (v) => (v ? new Date(v.length === 16 ? `${v}:00` : v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const num = (v, c = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const COR = { Coletada: 'entregue', Confirmada: 'entregue', 'No pátio': 'entregue', Recusada: 'cancelado', Cancelada: 'cancelado', 'Não compareceu': 'cancelado', Atrasada: 'ocorrencia', 'Sem resposta': 'ocorrencia' };
  if (token.length < 20) { $('ocCartao').innerHTML = '<p class="rt-erro">Link incompleto. Peça o link de novo a quem mandou a ordem.</p>'; return; }
  const api = async (sufixo = '', corpo = null) => {
    const r = await fetch(`/api/ordem-coleta-publica/${token}${sufixo}`, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível concluir.');
    return j;
  };
  let o = null;
  function desenhar() {
    $('ocEmpresa').textContent = o.empresa ? `${o.empresa} · ordem nº ${o.numero}` : `Ordem nº ${o.numero}`;
    $('ocCartao').innerHTML = `<div class="rt-status"><div><h2>${esc(o.transportadora || 'Transportadora')}</h2><small>Ordem de coleta nº ${o.numero}</small></div><span class="rt-sit ${COR[o.situacao] || ''}">${esc(o.situacao)}</span></div>
      <div class="rt-dados"><div>Pronta para coleta<b>${dataHora(o.coletar_em)}</b>${o.janela_min ? `<small>janela de ${num(o.janela_min / 60, 1)} h</small>` : ''}</div>
        <div>Local<b>${esc(o.endereco || '—')}</b>${o.telefone ? `<small>${esc(o.telefone)}</small>` : ''}</div>
        <div>Carga<b>${o.notas.length} nota(s)</b><small>${num(o.volumes)} volume(s) · ${num(o.peso_kg, 1)} kg${o.cubagem_m3 ? ` · ${num(o.cubagem_m3, 2)} m³` : ''}</small></div>
        ${o.tipo_veiculo ? `<div>Veículo pedido<b>${esc(o.veiculos[o.tipo_veiculo] || o.tipo_veiculo)}</b></div>` : ''}</div>
      ${o.observacao ? `<p class="rt-aviso">${esc(o.observacao)}</p>` : ''}
      <p><a href="/api/ordem-coleta-publica/${token}/documento" target="_blank" rel="noopener">Abrir o documento da ordem (para imprimir)</a></p>`;
    $('ocNotas').innerHTML = `<h3 style="margin:0 0 4px;">Notas a coletar</h3><table class="oc-notas"><thead><tr><th>NF-e</th><th>Cliente</th><th>Destino</th><th>Vol.</th><th>Peso (kg)</th></tr></thead><tbody>
      ${o.notas.map((n) => `<tr><td>${esc(n.numero)}</td><td>${esc(n.cliente)}</td><td>${esc([n.cidade, n.uf].filter(Boolean).join('/'))}</td><td class="n">${num(n.volumes)}</td><td class="n">${num(n.peso, 1)}</td></tr>`).join('')}</tbody></table>`;
    const r = o.resposta; const box = $('ocResposta');
    box.classList.remove('oculto');
    const motorista = o.motorista_codigo ? `${location.origin}/patio.html?c=${o.motorista_codigo}` : null;
    let html = '';
    if (r && o.status === 'aceita') {
      html += `<h3 style="margin:0;">Coleta confirmada</h3><p>Chegada prevista: <b>${dataHora(r.previsto_em)}</b>${r.placa ? ` · placa <b>${esc(r.placa)}</b>` : ''}${r.motorista_nome ? ` · ${esc(r.motorista_nome)}` : ''}<br><small>Confirmado por ${esc(r.nome)}.</small></p>
        ${motorista ? `<p>Mande este link ao motorista: ele mostra o QR Code na portaria e acompanha a vez dele no pátio.<br><a class="oc-link" href="${esc(motorista)}" target="_blank" rel="noopener">${esc(motorista)}</a></p>` : ''}`;
    } else if (r && o.status === 'recusada') {
      html += `<h3 style="margin:0;">Coleta recusada</h3><p>Motivo: ${esc(r.motivo)}<br><small>Por ${esc(r.nome)}.</small></p>`;
    }
    if (o.pode_responder) {
      const sug = (r && r.previsto_em) || o.coletar_em || '';
      html += `<h3 style="margin:${html ? '18px' : '0'} 0 0;">${o.status === 'aceita' ? 'Alterar a confirmação' : 'Confirme a coleta'}</h3>
        <div class="oc-form">
          <label>Data e hora da chegada<input type="datetime-local" id="ocPrevisto" value="${esc(sug)}"></label>
          <label>Placa<input id="ocPlaca" maxlength="8" value="${esc(r?.placa || '')}" placeholder="ABC1D23"></label>
          <label>Tipo de veículo<select id="ocTipo"><option value="">—</option>${Object.entries(o.veiculos).map(([k, v]) => `<option value="${k}"${k === o.tipo_veiculo ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <label>Motorista<input id="ocMotorista" maxlength="120" value="${esc(r?.motorista_nome || '')}"></label>
          <label>CPF/CNH do motorista<input id="ocDoc" maxlength="20"></label>
          <label>Celular do motorista<input id="ocFone" maxlength="20" placeholder="(11) 99999-9999"></label>
          <label>Seu nome<input id="ocNome" maxlength="120" value="${esc(r?.nome || '')}"></label>
          <label class="largo">Observação<textarea id="ocObs" rows="2" maxlength="500"></textarea></label>
        </div>
        <div class="oc-botoes"><button type="button" class="ok" id="ocAceitar">${o.status === 'aceita' ? 'Salvar a alteração' : 'Confirmar a coleta'}</button>
          ${o.status === 'enviada' ? '<button type="button" class="nao" id="ocRecusar">Não posso atender</button>' : ''}</div>
        <p id="ocMsg" class="rt-erro"></p>`;
    }
    if (!html) { box.classList.add('oculto'); return; }
    box.innerHTML = html;
    $('ocAceitar')?.addEventListener('click', async () => {
      try {
        o = await api('/aceitar', { previsto_em: $('ocPrevisto').value, placa: $('ocPlaca').value, tipo_veiculo: $('ocTipo').value, motorista_nome: $('ocMotorista').value,
          motorista_documento: $('ocDoc').value, motorista_telefone: $('ocFone').value, nome: $('ocNome').value, obs: $('ocObs').value });
        desenhar(); window.scrollTo(0, 0);
      } catch (e) { $('ocMsg').textContent = e.message; }
    });
    $('ocRecusar')?.addEventListener('click', async () => {
      const motivo = window.prompt('Por que não pode atender esta coleta?');
      if (!motivo) return;
      try { o = await api('/recusar', { motivo, nome: $('ocNome').value || window.prompt('Seu nome:') || '' }); desenhar(); } catch (e) { $('ocMsg').textContent = e.message; }
    });
  }
  api().then((j) => { o = j; desenhar(); }).catch((e) => { $('ocCartao').innerHTML = `<p class="rt-erro">${esc(e.message)}</p>`; });
})();
