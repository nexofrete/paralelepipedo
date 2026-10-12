// Rastreio público da entrega (sem login).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : '—');
  const modo = () => document.querySelector('input[name=modo]:checked').value;
  document.querySelectorAll('input[name=modo]').forEach((r) => r.addEventListener('change', () => {
    $('rtModoNf').classList.toggle('oculto', modo() !== 'nf');
    $('rtModoChave').classList.toggle('oculto', modo() !== 'chave');
  }));

  function mostrar(r) {
    const t = r.transportadora;
    if (t.logo) { $('rtLogo').src = t.logo; $('rtLogo').classList.remove('oculto'); }
    $('rtNome').textContent = `Rastreio — ${t.nome}`;
    $('rtContato').textContent = [t.nome, t.telefone, t.email].filter(Boolean).join(' · ');
    $('rtResultado').innerHTML = r.entregas.map((e) => `<section class="rt-cartao">
      <div class="rt-status"><div><small style="color:var(--fraco);">CT-e ${esc(e.cte)}</small><h2>${esc(e.destino || '')}</h2></div>
        <span class="rt-sit ${esc(e.situacao_codigo)}">${esc(e.situacao)}</span></div>
      <div class="rt-dados">
        <div>Origem<b>${esc(e.origem || '—')}</b></div><div>Destino<b>${esc(e.destino || '—')}</b></div>
        ${e.entregue_em ? `<div>Entregue em<b>${esc(dataHora(e.entregue_em))}</b></div>${e.recebido_por ? `<div>Recebido por<b>${esc(e.recebido_por)}</b></div>` : ''}`
    : `<div>Previsão de entrega<b>${esc(dia(e.previsao))}</b></div>`}
      </div>
      ${e.demonstracao ? '<div class="rt-aviso">Entrega de demonstração (sem valor fiscal).</div>' : ''}
      <ul class="rt-linha-tempo">${e.historico.map((h) => `<li><b>${esc(h.descricao)}</b><small>${esc(dataHora(h.data_hora))}${h.local ? ` · ${esc(h.local)}` : ''}</small>${h.detalhe ? `<small>${esc(h.detalhe)}</small>` : ''}</li>`).join('')}</ul>
    </section>`).join('');
  }

  async function consultar(params) {
    const botao = document.querySelector('#rtForm button');
    botao.disabled = true; $('rtResultado').innerHTML = '';
    try {
      const r = await fetch(`/api/rastreio?${new URLSearchParams(params)}`);
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo.erro || 'Não foi possível consultar agora.');
      mostrar(corpo);
    } catch (err) {
      $('rtResultado').innerHTML = `<div class="rt-cartao rt-erro">${esc(err.message)}</div>`;
    } finally { botao.disabled = false; }
  }

  $('rtForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (modo() === 'chave') consultar({ chave: $('rtChave').value });
    else consultar({ documento: $('rtDoc').value, nf: $('rtNf').value });
  });

  // Link direto: rastreio.html?chave=... ou ?documento=...&nf=...
  const q = new URLSearchParams(location.search);
  if (q.get('chave')) {
    document.querySelector('input[value=chave]').checked = true;
    $('rtModoNf').classList.add('oculto'); $('rtModoChave').classList.remove('oculto');
    $('rtChave').value = q.get('chave'); consultar({ chave: q.get('chave') });
  } else if (q.get('documento') && q.get('nf')) {
    $('rtDoc').value = q.get('documento'); $('rtNf').value = q.get('nf'); consultar({ documento: q.get('documento'), nf: q.get('nf') });
  }
})();
