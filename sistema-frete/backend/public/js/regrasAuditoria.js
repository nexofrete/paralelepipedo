// =====================================================================
// Manutenção do sistema » Auditoria » ⚡ Regras automáticas: condição + ação
// (aprovar ou glosar) para o que sempre é decidido do mesmo jeito.
// Servidor: src/regrasAuditoria.js, rotas /api/auditoria-config/regras.
// Usa do dashboard.js: apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const alvo = document.getElementById('audRegrasAuto');
  if (!alvo) return;
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dia = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  let TIPOS = {}; let ACOES = {}; let COMPONENTES = {}; let transportadoras = [];
  const json = async (url, op) => { const r = await apiFetch(url, op); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || 'Erro.'); return j; };
  const corpoJson = (metodo, corpo) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });

  const linha = (r = {}) => `<tr data-id="${r.id || ''}">
      <td><input type="checkbox" class="raAtivo" ${r.ativo === false ? '' : 'checked'} title="Ligada"></td>
      <td><input class="raNome" value="${esc(r.nome || '')}" placeholder="Ex.: Pedágio até R$ 5" style="width:140px;"></td>
      <td><select class="raT"><option value="">Todas</option>${transportadoras.map((t) => `<option value="${t.id}" ${Number(r.transportadora_id) === t.id ? 'selected' : ''}>${esc(t.razao_social)}</option>`).join('')}</select></td>
      <td><select class="raTipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${r.tipo === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></td>
      <td><select class="raComp"><option value="">${r.tipo === 'taxa_nao_prevista' ? 'Qualquer taxa' : '—'}</option>${Object.entries(COMPONENTES).filter(([k]) => k !== 'total').map(([k, v]) => `<option value="${k}" ${r.componente === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></td>
      <td><input class="raV" type="number" step="0.01" min="0" value="${r.valor ?? ''}" placeholder="R$" style="width:80px;"></td>
      <td><input class="raP" type="number" step="0.01" min="0" max="100" value="${r.percentual ?? ''}" placeholder="%" style="width:66px;"></td>
      <td><select class="raAcao">${Object.entries(ACOES).map(([k, v]) => `<option value="${k}" ${r.acao === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></td>
      <td class="ra-uso">${r.id ? `${r.fretes_decididos || 0} frete(s)${r.valor_glosado ? ` · ${moeda(r.valor_glosado)} glosado` : ''}<br><small>última: ${dia(r.ultimo_em)}</small>` : '<small>nova</small>'}</td>
      <td style="white-space:nowrap;"><button type="button" class="btn btn-secundario raSobe" title="Subir (a primeira que casar decide)" style="width:auto; padding:3px 8px;">↑</button>
        ${r.id && r.fretes_decididos ? '<button type="button" class="btn btn-secundario raDesfaz" title="Devolve para a fila os fretes ainda não faturados que esta regra decidiu, e desliga a regra" style="width:auto; padding:3px 8px;">Desfazer</button>' : ''}
        <button type="button" class="btn btn-secundario raX" style="width:auto; padding:3px 8px;">✕</button></td></tr>`;

  const ler = () => [...alvo.querySelectorAll('tbody tr')].map((tr) => ({
    id: Number(tr.dataset.id) || null, ativo: tr.querySelector('.raAtivo').checked, nome: tr.querySelector('.raNome').value,
    transportadora_id: tr.querySelector('.raT').value || null, tipo: tr.querySelector('.raTipo').value, componente: tr.querySelector('.raComp').value || null,
    valor: tr.querySelector('.raV').value, percentual: tr.querySelector('.raP').value, acao: tr.querySelector('.raAcao').value,
  }));

  function desenhar(regras) {
    alvo.innerHTML = `<div style="overflow-x:auto;"><table class="ct-tabela" style="min-width:960px;"><thead><tr><th></th><th>Nome</th><th>Transportadora</th><th>Condição</th><th>Componente</th><th>Até R$</th><th>Até %</th><th>Ação</th><th>Uso</th><th></th></tr></thead>
      <tbody>${regras.map(linha).join('')}</tbody></table></div>
      ${regras.length ? '' : '<p class="ra-vazio" style="font-size:12.5px; color:var(--texto-fraco); margin:6px 0;">Nenhuma regra: tudo o que diverge espera uma pessoa decidir.</p>'}
      <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secundario" id="raAdd" style="width:auto;">＋ Regra</button>
        <button type="button" class="btn btn-secundario" id="raSimular" style="width:auto;">🔎 Simular</button>
        <button type="button" class="btn btn-primario" id="raSalvar" style="width:auto;">Salvar e aplicar</button>
        <button type="button" class="btn btn-secundario" id="raAplicar" style="width:auto;" title="As regras rodam sozinhas a cada 10 minutos">⚡ Aplicar agora</button></div>
      <div id="raErro" class="mensagem-erro" style="margin-top:8px;"></div><div id="raSim" style="margin-top:10px;"></div>`;
    const corpo = alvo.querySelector('tbody');
    const erro = (e) => { const el = alvo.querySelector('#raErro'); el.textContent = e.message; el.classList.add('visivel'); };
    const limparErro = () => alvo.querySelector('#raErro').classList.remove('visivel');
    alvo.querySelector('#raAdd').addEventListener('click', () => { corpo.insertAdjacentHTML('beforeend', linha({ tipo: 'diferenca_ate', acao: 'aprovar' })); alvo.querySelector('.ra-vazio')?.remove(); });
    corpo.addEventListener('change', (e) => {
      if (!e.target.classList.contains('raTipo')) return;
      const opt = e.target.closest('tr').querySelector('.raComp option[value=""]');
      opt.textContent = e.target.value === 'taxa_nao_prevista' ? 'Qualquer taxa' : '—';
    });
    corpo.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      if (e.target.closest('.raX')) tr.remove();
      if (e.target.closest('.raSobe') && tr.previousElementSibling) tr.parentNode.insertBefore(tr, tr.previousElementSibling);
      if (e.target.closest('.raDesfaz')) {
        const nome = tr.querySelector('.raNome').value;
        if (!(await confirmar(`Devolver para a fila os fretes ainda não faturados que a regra "${nome}" decidiu? As glosas dela são apagadas e a regra é desligada.`, { titulo: 'Desfazer regra', tipo: 'perigo', textoOk: 'Desfazer' }))) return;
        try {
          const j = await json(`/api/auditoria-config/regras/${tr.dataset.id}/desfazer`, { method: 'POST' });
          mostrarAlerta(`${j.desfeitos} frete(s) voltaram para a fila da auditoria. A regra foi desligada.`, { tipo: 'sucesso' });
          desenhar(j.regras);
        } catch (err) { erro(err); }
      }
    });
    alvo.querySelector('#raSimular').addEventListener('click', async () => {
      limparErro();
      try {
        const j = await json('/api/auditoria-config/regras/simular', corpoJson('POST', { regras: ler() }));
        const el = alvo.querySelector('#raSim');
        if (!j.total) { el.innerHTML = `<p class="ct-dica">Nenhum frete seria decidido agora (${j.avaliados} retido(s) por cobrar a mais avaliados).</p>`; return; }
        el.innerHTML = `<p style="font-size:12.5px; margin:0 0 6px;"><b>${j.total} frete(s)</b> seriam decididos agora (de ${j.avaliados} retidos por cobrar a mais): ${Object.values(j.por_regra).map((p) => `${esc(p.regra)}: ${p.qtd} (${moeda(p.valor)})`).join(' · ')}</p>
          <div class="ct-rolagem" style="max-height:260px;"><table class="ct-tabela"><thead><tr><th>CT-e</th><th>NF</th><th>Transportadora</th><th>Regra</th><th>Ação</th><th class="n">Valor</th><th>Por quê</th></tr></thead><tbody>
          ${j.decididos.map((d) => `<tr><td>${esc(d.numero_cte)}</td><td>${esc(d.numero_nf || '')}</td><td>${esc(d.transportadora || '')}</td><td>${esc(d.regra)}</td><td>${esc(ACOES[d.acao])}</td><td class="n">${moeda(d.valor)}</td><td>${esc(d.texto)}</td></tr>`).join('')}</tbody></table></div>`;
      } catch (err) { erro(err); }
    });
    alvo.querySelector('#raSalvar').addEventListener('click', async (ev) => {
      limparErro(); ev.currentTarget.disabled = true;
      try {
        const j = await json('/api/auditoria-config/regras', corpoJson('PUT', { regras: ler() }));
        mostrarAlerta(`Regras gravadas. ${j.decididos} frete(s) foram decididos agora; daqui em diante elas rodam sozinhas a cada 10 minutos.`, { tipo: 'sucesso' });
        desenhar(j.regras);
      } catch (err) { erro(err); ev.currentTarget.disabled = false; }
    });
    alvo.querySelector('#raAplicar').addEventListener('click', async () => {
      limparErro();
      try {
        const j = await json('/api/auditoria-config/regras/aplicar', { method: 'POST' });
        mostrarAlerta(j.decididos ? `${j.decididos} frete(s) decididos pelas regras.` : 'Nenhum frete novo para as regras decidirem.', { tipo: j.decididos ? 'sucesso' : 'info' });
        desenhar(j.regras);
      } catch (err) { erro(err); }
    });
  }

  window.carregarRegrasAuditoria = async () => {
    try {
      const [cfg, rg, tr] = await Promise.all([json('/api/auditoria-config'), json('/api/auditoria-config/regras'), apiFetch('/api/transportadoras').then((r) => (r.ok ? r.json() : [])).catch(() => [])]);
      COMPONENTES = cfg.componentes || {}; TIPOS = rg.tipos; ACOES = rg.acoes;
      transportadoras = Array.isArray(tr) ? tr : (tr.transportadoras || []);
      desenhar(rg.regras);
    } catch (e) { alvo.innerHTML = `<div class="mensagem-erro visivel">${esc(e.message)}</div>`; }
  };
})();
