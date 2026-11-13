// Página pública da contestação de frete (public/contestacao.html?c=<código>): a transportadora
// confere os CT-e contestados e responde cada um (aceito, com o valor, ou recusado, com o motivo).
// A resposta vai para a empresa conferir e confirmar; até lá dá para mudar.
(() => {
  const token = new URLSearchParams(location.search).get('c') || '';
  const corpo = document.getElementById('ctCorpo');
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const num = (v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
  let dados = null;

  async function carregar() {
    try {
      const r = await fetch(`/api/contestacao-publica/${encodeURIComponent(token)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível abrir a contestação.');
      dados = j; desenhar();
    } catch (e) {
      document.getElementById('ctSub').textContent = '';
      corpo.innerHTML = `<div class="rt-cartao rt-erro">${esc(e.message)}</div>`;
    }
  }

  function desenhar() {
    const d = dados;
    document.title = `Contestação nº ${d.numero} — ${d.empresa}`;
    document.getElementById('ctNome').textContent = `Contestação de frete nº ${d.numero}`;
    document.getElementById('ctSub').textContent = `${d.empresa} → ${d.transportadora}`;
    document.getElementById('ctContato').textContent = d.contato ? `Dúvidas: ${d.empresa} · ${d.contato}` : '';
    const encerrada = !d.aberta;
    const respondeu = !!d.respondida_em;
    const topo = encerrada
      ? `<div class="rt-cartao ct-ok"><b>Contestação encerrada: ${esc(d.situacao)}.</b>${d.valor_aceito != null ? ` Valor aceito: ${moeda(d.valor_aceito)}.` : ''}<br>Obrigado. O valor aceito deve vir descontado na próxima fatura.</div>`
      : respondeu
        ? `<div class="rt-cartao ct-ok"><b>Resposta recebida</b> de ${esc(d.nome)} em ${new Date(d.respondida_em).toLocaleString('pt-BR')}. ${esc(d.empresa)} vai conferir. Até lá, dá para mudar e enviar de novo.</div>`
        : `<div class="rt-cartao ct-aviso">Na conferência dos CT-e com a tabela de frete combinada, ${esc(d.empresa)} encontrou as cobranças abaixo. Para cada CT-e, marque se aceita o desconto (pode aceitar um valor menor) ou se recusa, dizendo o motivo.${d.prazo_resposta ? ` <b>Responda até ${dia(d.prazo_resposta)}.</b>` : ''}${d.observacao ? `<br><br>${esc(d.observacao)}` : ''}</div>`;
    const item = (i) => {
      const sit = encerrada ? i.situacao : (i.portal_situacao || '');
      const valor = i.portal_valor != null && i.portal_situacao === 'aceito' ? i.portal_valor : i.valor_contestado;
      return `<div class="ct-item" data-id="${i.id}">
        <h3><span>CT-e ${esc(i.numero_cte)}${i.numero_nf ? ` · NF ${esc(i.numero_nf)}` : ''}</span><span style="font-weight:400; font-size:13px; color:var(--fraco);">emitido em ${dia(i.data_emissao_cte)}</span></h3>
        <div class="ct-num"><div>Valor do CT-e<b>${moeda(i.valor_cte)}</b></div><div>Pela tabela<b>${moeda(i.valor_tabela)}</b></div><div>Contestado<b>${moeda(i.valor_contestado)}</b></div></div>
        <div class="ct-motivo">${esc(i.motivo_texto || i.motivo)}</div>
        ${encerrada
          ? `<div class="ct-res ${esc(sit)}" style="margin-top:8px;">${sit === 'aceito' ? `Aceito: ${moeda(i.valor_aceito)}` : sit === 'recusado' ? 'Recusado' : 'Sem resposta'}</div>`
          : `<div class="ct-escolha">
              <label class="${sit === 'aceito' ? 'sel-aceito' : ''}"><input type="radio" name="s${i.id}" value="aceito" ${sit === 'aceito' ? 'checked' : ''}> Aceito o desconto</label>
              <label class="${sit === 'recusado' ? 'sel-recusado' : ''}"><input type="radio" name="s${i.id}" value="recusado" ${sit === 'recusado' ? 'checked' : ''}> Recuso</label></div>
            <div class="ct-extra">
              <label class="ct-val">Valor aceito (R$)<input class="ctV" inputmode="decimal" value="${Number(valor).toFixed(2).replace('.', ',')}" ${sit === 'recusado' ? 'disabled' : ''}></label>
              <label><span>Comentário <span class="ct-obr">${sit === 'recusado' ? '(obrigatório ao recusar)' : '(opcional)'}</span></span><input class="ctC" maxlength="500" value="${esc(i.portal_comentario || '')}" placeholder="Ex.: a TDE é devida, a entrega foi em área restrita"></label>
            </div>`}
      </div>`;
    };
    corpo.innerHTML = `${topo}<div class="rt-cartao">
        <div class="ct-total"><span>${d.itens.length} CT-e contestado(s)</span><b>Total contestado: ${moeda(d.valor_contestado)}</b></div>
        ${d.itens.map(item).join('')}</div>
      ${encerrada ? '' : `<div class="rt-cartao">
        <label style="display:grid; gap:6px; font-size:13px; color:var(--fraco);">Seu nome<input id="ctQuem" maxlength="150" value="${esc(d.nome || '')}" placeholder="Nome de quem está respondendo"></label>
        <label style="display:grid; gap:6px; font-size:13px; color:var(--fraco); margin-top:10px;">Comentário geral (opcional)<textarea id="ctGeral" rows="3" maxlength="2000">${esc(d.comentario || '')}</textarea></label>
        <div id="ctResumo" class="ct-total" style="margin-top:14px;"></div>
        <div id="ctErro" class="rt-erro" style="margin-bottom:10px;"></div>
        <button id="ctEnviar">${respondeu ? 'Enviar a resposta de novo' : 'Enviar resposta'}</button></div>`}`;
    if (encerrada) return;
    const resumo = () => {
      let ac = 0; let n = 0; let rec = 0;
      corpo.querySelectorAll('.ct-item').forEach((el) => {
        const s = el.querySelector('input[type=radio]:checked')?.value;
        if (s === 'aceito') { ac += num(el.querySelector('.ctV').value); n += 1; }
        if (s === 'recusado') rec += 1;
      });
      document.getElementById('ctResumo').innerHTML = `<span>${n} aceito(s), ${rec} recusado(s), ${d.itens.length - n - rec} sem resposta</span><b>Aceito: ${moeda(ac)}</b>`;
    };
    corpo.addEventListener('change', (e) => {
      if (e.target.type !== 'radio') return;
      const el = e.target.closest('.ct-item');
      el.querySelectorAll('.ct-escolha label').forEach((l) => { l.className = l.querySelector('input').checked ? `sel-${l.querySelector('input').value}` : ''; });
      el.querySelector('.ctV').disabled = e.target.value === 'recusado';
      el.querySelector('.ct-obr').textContent = e.target.value === 'recusado' ? '(obrigatório ao recusar)' : '(opcional)';
      resumo();
    });
    corpo.addEventListener('input', resumo);
    resumo();
    document.getElementById('ctEnviar').addEventListener('click', async (ev) => {
      const erro = document.getElementById('ctErro'); erro.textContent = '';
      const itens = [...corpo.querySelectorAll('.ct-item')].map((el) => ({ id: Number(el.dataset.id), situacao: el.querySelector('input[type=radio]:checked')?.value || null,
        valor: num(el.querySelector('.ctV').value), comentario: el.querySelector('.ctC').value }));
      const falta = itens.findIndex((i) => !i.situacao);
      if (falta >= 0) { erro.textContent = `Marque aceito ou recuso no CT-e ${d.itens[falta].numero_cte}.`; return; }
      ev.currentTarget.disabled = true;
      try {
        const r = await fetch(`/api/contestacao-publica/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: document.getElementById('ctQuem').value, comentario: document.getElementById('ctGeral').value, itens }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || 'Não foi possível enviar.');
        dados = j; desenhar(); window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) { erro.textContent = e.message; ev.currentTarget.disabled = false; }
    });
  }
  carregar();
})();
