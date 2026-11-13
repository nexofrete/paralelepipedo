// =====================================================================
// Manutenção do sistema » Auditoria » 👤 Responsáveis e resumo diário:
// quem confere cada transportadora (fila por responsável na Auditoria) e
// quem recebe o resumo da auditoria por e-mail, logo cedo.
// Servidor: src/responsaveisAuditoria.js e src/resumoAuditoria.js (rotas em /api/auditoria-config).
// =====================================================================
(() => {
  const alvo = document.getElementById('audResponsaveis');
  if (!alvo) return;
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const json = async (url, op) => { const r = await apiFetch(url, op); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro.'); return j; };

  function desenhar(d) {
    const opU = (sel) => `<option value="">— Todos —</option>${d.usuarios.map((u) => `<option value="${u.id}" ${Number(sel) === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}`;
    alvo.innerHTML = `<div class="rp-duas">
        <div><b style="font-size:13px;">Quem confere cada transportadora</b>
          <div class="ct-rolagem" style="max-height:320px; margin-top:6px;"><table class="ct-tabela"><thead><tr><th>Transportadora</th><th>Responsável</th></tr></thead><tbody>
          ${d.transportadoras.map((t) => `<tr data-t="${t.id}"><td>${esc(t.razao_social)}</td><td><select class="rpU">${opU(t.auditor_id)}</select></td></tr>`).join('') || '<tr><td colspan="2" class="ct-dica">Nenhuma transportadora cadastrada.</td></tr>'}
          </tbody></table></div></div>
        <div><b style="font-size:13px;">Resumo diário por e-mail</b>
          <p class="ct-dica" style="margin:4px 0 8px;">De segunda a sábado, na hora escolhida: fretes retidos, os 5 que mais cobraram a mais, contestações vencidas e respondidas pelo link e faturas que vencem na semana. Quem é responsável por transportadoras recebe só as dele.</p>
          <label class="ct-dica">Enviar às <select id="rpHora">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === d.resumo_hora ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select> (horário de Brasília)</label>
          <div class="rp-lista">${d.usuarios.map((u) => `<label><input type="checkbox" class="rpR" value="${u.id}" ${u.resumo_auditoria ? 'checked' : ''}> ${esc(u.nome)} <span class="ct-dica">${esc(u.email)}</span></label>`).join('')}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
            <button type="button" class="btn btn-secundario" id="rpPrevia" style="width:auto;">👁 Ver o meu resumo de hoje</button>
            <button type="button" class="btn btn-secundario" id="rpTeste" style="width:auto;">✉️ Enviar o meu agora (teste)</button></div>
        </div></div>
      <div style="margin-top:10px;"><button type="button" class="btn btn-primario" id="rpSalvar" style="width:auto;">Salvar responsáveis e resumo</button></div>
      <div id="rpErro" class="mensagem-erro" style="margin-top:8px;"></div>`;
    const erro = (e) => { const el = alvo.querySelector('#rpErro'); el.textContent = e.message; el.classList.add('visivel'); };
    alvo.querySelector('#rpSalvar').addEventListener('click', async (ev) => {
      alvo.querySelector('#rpErro').classList.remove('visivel'); ev.currentTarget.disabled = true;
      try {
        const corpo = {
          responsaveis: [...alvo.querySelectorAll('tr[data-t]')].map((tr) => ({ transportadora_id: Number(tr.dataset.t), auditor_id: tr.querySelector('.rpU').value || null })),
          resumo: [...alvo.querySelectorAll('.rpR:checked')].map((c) => Number(c.value)), resumo_hora: alvo.querySelector('#rpHora').value,
        };
        const j = await json('/api/auditoria-config/responsaveis', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        mostrarAlerta('Responsáveis e resumo diário gravados.', { tipo: 'sucesso' });
        desenhar(j);
      } catch (e) { erro(e); ev.currentTarget.disabled = false; }
    });
    alvo.querySelector('#rpPrevia').addEventListener('click', async () => {
      try {
        const j = await json('/api/auditoria-config/resumo/previa');
        const w = window.open('', '_blank');
        if (!w) { mostrarAlerta('O navegador bloqueou a janela. Libere os pop-ups para este endereço.'); return; }
        w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo da auditoria (prévia)</title></head><body style="margin:20px;">${j.html}</body></html>`);
        w.document.close();
      } catch (e) { erro(e); }
    });
    alvo.querySelector('#rpTeste').addEventListener('click', async () => {
      try { const j = await json('/api/auditoria-config/resumo/teste', { method: 'POST' }); mostrarAlerta(`Resumo enviado para ${j.para}.`, { tipo: 'sucesso' }); } catch (e) { erro(e); }
    });
  }

  window.carregarResponsaveisAuditoria = async () => {
    try { desenhar(await json('/api/auditoria-config/responsaveis')); } catch (e) { alvo.innerHTML = `<div class="mensagem-erro visivel">${esc(e.message)}</div>`; }
  };
})();
