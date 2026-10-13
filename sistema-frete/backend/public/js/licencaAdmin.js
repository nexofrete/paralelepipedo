// =====================================================================
// Manutenção → Licença: mostra a licença desta instalação e, no computador
// do dono (com a chave privada), o emissor de chaves de ativação.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta.
// =====================================================================
(() => {
  const painel = document.getElementById('painelLicenca');
  if (!painel || usuario?.perfil !== 'admin') { painel?.remove(); return; }
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dia = (v) => (v ? String(v).split('-').reverse().join('/') : 'sem vencimento');
  const SIT = { ativa: '✅ Ativa', vencendo: '⚠️ Vencendo', tolerancia: '⚠️ Vencida (tolerância)', vencida: '⛔ Vencida — só consulta', licenciador: '🔑 Computador do licenciador' };

  async function montar() {
    const e = await fetch('/api/licenca/estado').then((r) => r.json());
    painel.innerHTML = `<h3 style="margin-top:0; font-size:15px;">🔑 Licença do sistema</h3>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px 18px; font-size:13px;">
        <div><span style="color:var(--texto-fraco);">Situação</span><br><b>${SIT[e.situacao] || esc(e.situacao)}</b></div>
        <div><span style="color:var(--texto-fraco);">Empresa</span><br><b>${esc(e.cliente || (e.licenciador ? 'você' : '—'))}</b>${e.cnpj ? `<br><small>${esc(e.cnpj)}</small>` : ''}</div>
        <div><span style="color:var(--texto-fraco);">Validade</span><br><b>${e.licenciador ? '—' : dia(e.validade)}</b></div>
        <div><span style="color:var(--texto-fraco);">Código deste computador</span><br><b style="font-family:ui-monospace,monospace;">${esc(e.codigo)}</b></div>
      </div>
      ${e.licenciador ? '' : '<p style="font-size:12px; color:var(--texto-fraco); margin:10px 0 0;">Para renovar ou trocar a chave, abra <a href="ativar.html">a tela de ativação</a> e cole a chave nova.</p>'}
      ${e.licenciador ? emissor() : ''}`;
    if (e.licenciador) { ligarEmissor(); carregarEmitidas(); }
  }

  const emissor = () => `<div class="cte-secao" style="margin-top:16px;"><h4>Emitir chave de ativação para um cliente</h4>
      <p style="font-size:12px; color:var(--texto-fraco); margin-top:0;">Só aparece neste computador, porque é aqui que está a sua chave privada (backend/dados/licenciador). Guarde uma cópia dela em lugar seguro: sem ela você não emite mais chaves.</p>
      <div class="cte-grade">
        <div class="campo largo"><label for="licCliente">Cliente (empresa)</label><input type="text" id="licCliente" placeholder="Transportes Exemplo Ltda" /></div>
        <div class="campo"><label for="licCnpj">CNPJ</label><input type="text" id="licCnpj" placeholder="00.000.000/0001-00" /></div>
        <div class="campo largo"><label for="licMaquina">Código do computador do cliente</label><input type="text" id="licMaquina" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" style="font-family:ui-monospace,monospace; text-transform:uppercase;" /></div>
        <div class="campo"><label for="licPlano">Validade</label><select id="licPlano"><option value="30">30 dias</option><option value="90">90 dias</option><option value="365" selected>1 ano</option><option value="">Sem vencimento</option><option value="data">Escolher data…</option></select></div>
        <div class="campo"><label for="licData">Até</label><input type="date" id="licData" /></div>
        <div class="campo inteiro"><label for="licObs">Observação (só para você)</label><input type="text" id="licObs" placeholder="ex.: plano mensal, pago até…" /></div>
      </div>
      <button class="btn btn-primario" id="licEmitir" style="width:auto;">🔑 Gerar chave</button>
      <div id="licResultado" style="margin-top:12px;"></div>
      <h4 style="margin-top:18px;">Chaves emitidas</h4><div id="licEmitidas" style="font-size:12.5px;"></div></div>`;

  function ligarEmissor() {
    const atualizarData = () => {
      const p = $('licPlano').value;
      $('licData').disabled = p !== 'data';
      if (p && p !== 'data') { const d = new Date(); d.setDate(d.getDate() + Number(p)); $('licData').value = d.toISOString().slice(0, 10); }
      if (!p) $('licData').value = '';
    };
    $('licPlano').addEventListener('change', atualizarData); atualizarData();
    $('licEmitir').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const r = await apiFetch('/api/licenca/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          cliente: $('licCliente').value, cnpj: $('licCnpj').value, maquina: $('licMaquina').value,
          validade: $('licPlano').value ? $('licData').value : null, observacao: $('licObs').value }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro);
        $('licResultado').innerHTML = `<div class="cte-aviso ok">Chave gerada para <b>${esc(j.cliente)}</b> (${esc(j.cnpj)}) — ${j.validade ? `válida até ${dia(j.validade)}` : 'sem vencimento'}. Envie ao cliente:</div>
          <textarea readonly style="width:100%; min-height:80px; font-family:ui-monospace,monospace; font-size:12px;" id="licChave">${esc(j.chave)}</textarea>
          <button class="btn btn-secundario" id="licCopiar" style="width:auto;">📋 Copiar chave</button>`;
        $('licCopiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(j.chave); mostrarAlerta('Chave copiada.', { tipo: 'sucesso' }); } catch { $('licChave').select(); } });
        carregarEmitidas();
      } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
      b.disabled = false;
    });
  }

  async function carregarEmitidas() {
    const r = await apiFetch('/api/licenca/emitidas');
    const lista = r.ok ? await r.json() : [];
    $('licEmitidas').innerHTML = lista.length ? `<table class="edi-tabela"><thead><tr><th>Cliente</th><th>CNPJ</th><th>Computador</th><th>Emitida</th><th>Validade</th><th>Obs.</th><th></th></tr></thead><tbody>
      ${lista.map((l, i) => `<tr><td>${esc(l.cliente)}</td><td>${esc(l.cnpj)}</td><td style="font-family:ui-monospace,monospace;">${esc(l.maquina)}</td><td>${dia(l.emitida)}</td><td>${dia(l.validade)}</td><td>${esc(l.observacao || '')}</td>
        <td><button class="btn btn-secundario" data-lic-copiar="${i}" style="width:auto; font-size:11.5px; padding:3px 8px;">Copiar chave</button></td></tr>`).join('')}</tbody></table>`
      : '<span style="color:var(--texto-fraco);">Nenhuma chave emitida ainda.</span>';
    document.querySelectorAll('[data-lic-copiar]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(lista[Number(b.dataset.licCopiar)].chave); mostrarAlerta('Chave copiada.', { tipo: 'sucesso' }); } catch { mostrarAlerta(lista[Number(b.dataset.licCopiar)].chave); }
    }));
  }

  document.querySelector('.nav-item[data-pagina="manutencao"]')?.addEventListener('click', () => montar().catch(() => {}));
})();
