// =====================================================================
// Manutenção » 🛡 LGPD: consulta por titular, exportação (JSON e Excel), anonimização por CPF,
// prazo de guarda e aviso de privacidade. Regras em src/lgpd.js.
// Usa do dashboard.js: apiFetch, mostrarAlerta, confirmar, pedirTexto; do indicadores.js: exportarExcel.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('painelLgpd')) return;
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const json = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro || 'Erro.'); return d; };
  const post = (url, corpo) => apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(json);

  async function carregarConfig() {
    try {
      const c = await apiFetch('/api/manutencao/lgpd/config').then(json);
      $('lgpdRetencao').value = c.lgpd_retencao_dias;
      $('lgpdAviso').value = c.aviso_privacidade;
      $('lgpdAviso').placeholder = c.aviso_padrao;
    } catch { /* sem acesso */ }
  }
  document.querySelector('.nav-item[data-pagina="manutencao"]')?.addEventListener('click', carregarConfig);

  async function consultar() {
    const busca = $('lgpdBusca').value.trim();
    $('lgpdResultado').textContent = 'Procurando…';
    let r;
    try { r = await apiFetch(`/api/manutencao/lgpd/titular?busca=${encodeURIComponent(busca)}`).then(json); } catch (e) { $('lgpdResultado').innerHTML = `<p style="color:var(--vermelho);">${esc(e.message)}</p>`; return; }
    const total = r.fontes.reduce((s, f) => s + f.quantidade, 0);
    $('lgpdResultado').innerHTML = r.fontes.length ? `<table style="width:100%; font-size:12.5px;"><thead><tr><th style="text-align:left;">Onde</th><th style="text-align:right;">Registros</th><th style="text-align:left;">Exemplos</th><th style="text-align:left;">Por que guarda</th></tr></thead><tbody>
      ${r.fontes.map((f) => `<tr><td><b>${esc(f.rotulo)}</b></td><td style="text-align:right;">${f.quantidade}</td>
        <td style="font-size:12px;">${f.exemplos.slice(0, 3).map((x) => esc(Object.entries(x).filter(([k, v]) => k !== 'id' && v).map(([, v]) => v).join(' · '))).join('<br>')}</td>
        <td style="font-size:12px; color:${f.anonimizavel ? 'inherit' : 'var(--texto-fraco)'};">${esc(f.base)}${f.anonimizavel ? ' — <b>pode ser anonimizado</b>' : ''}</td></tr>`).join('')}</tbody></table>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        <button class="btn btn-secundario" id="lgpdJson" style="width:auto;">⬇ Exportar tudo (JSON)</button>
        <button class="btn btn-secundario" id="lgpdExcel" style="width:auto;">⬇ Exportar tudo (Excel)</button>
        ${r.cpf ? '<button class="btn btn-secundario" id="lgpdAnonimizar" style="width:auto; color:var(--vermelho); border-color:var(--vermelho);">Anonimizar este CPF…</button>' : '<span style="font-size:12px; color:var(--texto-fraco); align-self:center;">A anonimização é por CPF (pessoa física).</span>'}</div>
      <p style="font-size:12px; color:var(--texto-fraco);">${total} registro(s) encontrados.</p>`
      : '<p style="color:var(--texto-fraco);">Nada encontrado para este titular.</p>';
    $('lgpdJson')?.addEventListener('click', () => exportar(busca, 'json'));
    $('lgpdExcel')?.addEventListener('click', () => exportar(busca, 'excel'));
    $('lgpdAnonimizar')?.addEventListener('click', () => anonimizar(busca));
  }
  async function exportar(busca, formato) {
    try {
      const d = await post('/api/manutencao/lgpd/exportar', { busca });
      const nome = `dados-titular-${busca.replace(/[^\w@.-]+/g, '_').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}`;
      if (formato === 'json') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
        a.download = `${nome}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } else {
        const abas = Object.entries(d.fontes).map(([rotulo, f]) => {
          const colunas = [...new Set(f.registros.flatMap((x) => Object.keys(x)))];
          return { nome: rotulo.slice(0, 31), colunas, linhas: f.registros.map((x) => colunas.map((c) => (x[c] != null && typeof x[c] === 'object' ? JSON.stringify(x[c]) : x[c]))) };
        });
        await window.exportarExcel(nome, abas);
      }
      mostrarAlerta('Exportado. A exportação ficou no registro de atividades.', { tipo: 'sucesso' });
    } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
  }
  async function anonimizar(cpf) {
    const palavra = await pedirTexto('A anonimização troca o nome por "TITULAR ANONIMIZADO" e apaga o CPF, e-mail, telefone e endereço deste titular nos cadastros e registros que não são obrigatórios por lei (clientes, motoristas, vendedores, parceiros, cotações, coletas e SAC). Não dá para desfazer (só restaurando um backup). Documentos fiscais continuam guardados.\n\nPara confirmar, digite ANONIMIZAR:',
      { tipo: 'perigo', titulo: 'Anonimizar este titular?', placeholder: 'ANONIMIZAR', textoOk: 'Continuar' });
    if (!palavra) return;
    const senha = await pedirTexto('Sua senha de administrador:', { titulo: 'Confirme com a sua senha', senha: true, placeholder: 'senha', textoOk: 'Anonimizar' });
    if (!senha) return;
    try {
      const r = await post('/api/manutencao/lgpd/anonimizar', { cpf, confirmacao: palavra, senha });
      mostrarAlerta(r.resultado.length ? `Anonimizado: ${r.resultado.map((x) => `${x.quantidade} em ${x.rotulo}`).join(', ')}.` : 'Nada a anonimizar nos cadastros.', { tipo: 'sucesso' });
      consultar();
    } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
  }
  $('lgpdConsultar').addEventListener('click', consultar);
  $('lgpdBusca').addEventListener('keydown', (e) => { if (e.key === 'Enter') consultar(); });
  $('lgpdSalvar').addEventListener('click', async () => {
    try {
      await apiFetch('/api/manutencao/lgpd/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lgpd_retencao_dias: Number($('lgpdRetencao').value) || 0, aviso_privacidade: $('lgpdAviso').value }) }).then(json);
      mostrarAlerta('Prazo de guarda e aviso de privacidade salvos.', { tipo: 'sucesso' });
    } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
  });
})();
