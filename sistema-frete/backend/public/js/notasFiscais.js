// =====================================================================
// Notas e fretes » 🧾 Notas fiscais: consulta das NF-e com filtros (número,
// chave, emitente, destinatário, série, cidade/UF, período de emissão ou
// saída, situação), os dados completos de cada nota, o XML (um ou .zip),
// o DANFE e o Excel. Usa do dashboard.js: apiFetch, mostrarAlerta, token;
// do indicadores.js: exportarExcel; do linkSeguro.js: LinkSeguro.
// =====================================================================
(() => {
  const nav = document.querySelector('.nav-item[data-pagina="notas-fiscais"]');
  const cont = document.getElementById('nfConteudo');
  if (!nav || !cont) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const kg = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`);
  const dia = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10).split('-').reverse().join('/') : '—');
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const doc = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; };
  const SIT = { autorizada: ['entregue', 'Autorizada'], cancelada: ['devolvido', 'Cancelada'], denegada: ['ocorrencia', 'Denegada'] };
  let dados = null; let montado = false;

  function montar() {
    montado = true;
    cont.innerHTML = `<div class="painel" style="margin-bottom:12px;"><div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:10px; align-items:end;">
        <div class="campo" style="margin:0;"><label>Número, chave, cliente ou pedido</label><input id="nfBusca" class="cte-entrada" /></div>
        <div class="campo" style="margin:0;"><label>Emitente (nome ou CNPJ)</label><input id="nfEmit" class="cte-entrada" /></div>
        <div class="campo" style="margin:0;"><label>Destinatário (nome ou CNPJ)</label><input id="nfDest" class="cte-entrada" /></div>
        <div class="campo" style="margin:0;"><label>Série</label><input id="nfSerie" class="cte-entrada" maxlength="3" /></div>
        <div class="campo" style="margin:0;"><label>Cidade</label><input id="nfCidade" class="cte-entrada" /></div>
        <div class="campo" style="margin:0;"><label>UF</label><input id="nfUf" class="cte-entrada" maxlength="2" /></div>
        <div class="campo" style="margin:0;"><label>Período pela</label><select id="nfData" class="cte-entrada"><option value="emissao">Emissão</option><option value="saida">Saída</option></select></div>
        <div class="campo" style="margin:0; grid-column:span 2;"><label>Período</label><div style="display:flex; gap:6px; align-items:center;">${Periodo.html('nf')}</div></div>
        <div class="campo" style="margin:0;"><label>Situação</label><select id="nfSit" class="cte-entrada"><option value="">Todas</option><option value="autorizada">Autorizada</option><option value="cancelada">Cancelada</option><option value="denegada">Denegada</option><option value="sem_cte">Sem CT-e</option></select></div>
      </div></div>
      <div id="nfResumo" class="oc-resumo"></div>
      <div class="painel" style="overflow-x:auto;"><div id="nfTabela"></div></div>`;
    Periodo.ligar({ select: $('nfPer'), de: $('nfDe'), ate: $('nfAte'), chave: 'notas-fiscais', padrao: '30d', opcoes: ['7d', '30d', 'mes', 'mes_passado', '3m', 'ano', '12m', 'tudo', 'custom'], aoMudar: () => carregar() });
    let t = null;
    ['nfBusca', 'nfEmit', 'nfDest', 'nfSerie', 'nfCidade', 'nfUf'].forEach((id) => $(id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 400); }));
    ['nfData', 'nfSit'].forEach((id) => $(id).addEventListener('change', carregar));
    $('nfTabela').addEventListener('click', (e) => { const b = e.target.closest('[data-nf-ver]'); if (b) detalhe(Number(b.dataset.nfVer)); });
  }
  const filtros = () => new URLSearchParams({ busca: $('nfBusca').value.trim(), emitente: $('nfEmit').value.trim(), destinatario: $('nfDest').value.trim(), serie: $('nfSerie').value.trim(),
    cidade: $('nfCidade').value.trim(), uf: $('nfUf').value.trim(), data: $('nfData').value, de: $('nfDe').value, ate: $('nfAte').value, situacao: $('nfSit').value });
  async function carregar() {
    const r = await apiFetch(`/api/notas?${filtros()}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('nfTabela').innerHTML = `<div style="color:var(--vermelho);">${esc(j.erro || 'Erro.')}</div>`; return; }
    dados = j;
    const t = j.totais;
    $('nfResumo').innerHTML = `<div>Notas<b>${t.notas}</b><span>${j.limite ? 'mostrando as 2000 mais recentes' : 'no filtro'}</span></div><div>Valor das notas<b>${moeda(t.valor)}</b><span>produtos ${moeda(t.produtos)}</span></div>
      <div>Peso<b>${kg(t.peso)}</b><span>${t.volumes} volume(s)</span></div><div>Canceladas<b style="color:${t.canceladas ? 'var(--vermelho)' : 'inherit'};">${t.canceladas}</b><span>denegadas: ${t.denegadas}</span></div>`;
    $('nfTabela').innerHTML = j.notas.length ? `<table style="width:100%;"><thead><tr><th>NF / série</th><th>Emissão</th><th>Saída</th><th>Emitente</th><th>Destinatário</th><th>Destino</th><th style="text-align:right;">Produtos</th><th style="text-align:right;">Total</th><th style="text-align:right;">Peso bruto</th><th style="text-align:right;">Vol.</th><th>Situação</th><th></th></tr></thead><tbody>
      ${j.notas.map((n) => `<tr><td><b>${esc(n.numero_nf)}</b>${n.nf_serie ? ` <small style="color:var(--texto-fraco);">série ${esc(n.nf_serie)}</small>` : ''}${n.numero_cte ? `<br><small style="color:var(--texto-fraco);">CT-e ${esc(n.numero_cte)}</small>` : ''}</td>
        <td>${dia(n.data_emissao_nf)}</td><td>${n.data_saida ? dataHora(n.data_saida) : '—'}</td><td>${esc(n.emitente_nome || '—')}<br><small style="color:var(--texto-fraco);">${doc(n.emitente_cnpj)}</small></td>
        <td>${esc(n.cliente || '—')}<br><small style="color:var(--texto-fraco);">${doc(n.cliente_documento)}</small></td><td>${esc(n.cidade || '')}/${esc(n.uf || '')}</td>
        <td style="text-align:right;">${moeda(n.valor_produtos)}</td><td style="text-align:right;">${moeda(n.valor_faturado)}</td><td style="text-align:right;">${kg(n.peso_bruto ?? n.peso_kg)}</td><td style="text-align:right;">${n.qtd_volumes ?? '—'}</td>
        <td><span class="oc-sit ${SIT[n.situacao][0]}">${SIT[n.situacao][1]}</span></td>
        <td style="white-space:nowrap;"><button class="btn btn-secundario" data-nf-ver="${n.id}" style="width:auto; padding:4px 9px; font-size:11.5px;">Abrir</button></td></tr>`).join('')}</tbody></table>`
      : '<div style="padding:20px; text-align:center; color:var(--texto-fraco);">Nenhuma nota com esses filtros.</div>';
  }
  nav.addEventListener('click', () => { if (!montado) montar(); carregar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })); });

  function detalhe(id) {
    const n = dados.notas.find((x) => x.id === id);
    if (!n) return;
    let e = n.entrega_endereco; if (typeof e === 'string') { try { e = JSON.parse(e); } catch { e = null; } }
    const linha = (r, v) => `<tr><td style="color:var(--texto-fraco); width:38%;">${r}</td><td><b>${v}</b></td></tr>`;
    const corpo = `<table style="width:100%; font-size:13px;"><tbody>
      ${linha('Chave de acesso', `<span style="font-family:monospace;">${esc(String(n.chave_nfe || '—').replace(/(.{4})/g, '$1 '))}</span>`)}
      ${linha('Número / série', `${esc(n.numero_nf)} / ${esc(n.nf_serie || '—')}`)}${linha('Situação', SIT[n.situacao][1])}
      ${linha('Emitente', `${esc(n.emitente_nome || '—')} · ${doc(n.emitente_cnpj)}`)}${linha('Destinatário', `${esc(n.cliente || '—')} · ${doc(n.cliente_documento)}`)}
      ${linha(e?.local_diferente ? 'Local de entrega (diferente do destinatário)' : 'Endereço de entrega', e ? esc([e.nome, [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', '), e.bairro, `${e.cidade || ''}/${e.uf || ''}`, e.cep ? `CEP ${e.cep}` : ''].filter(Boolean).join(' — ')) : '—')}
      ${linha('Emissão / saída', `${dia(n.data_emissao_nf)} / ${n.data_saida ? dataHora(n.data_saida) : '—'}`)}
      ${linha('Valor dos produtos / total da nota', `${moeda(n.valor_produtos)} / ${moeda(n.valor_faturado)}`)}
      ${linha('Peso bruto / líquido', `${kg(n.peso_bruto)} / ${kg(n.peso_liquido)}`)}${linha('Volumes', n.qtd_volumes ?? '—')}
      ${linha('Pedido / transportadora da nota', `${esc(n.numero_pedido || '—')} / ${esc(n.transportadora_nfe || '—')}`)}${linha('CT-e', esc(n.numero_cte || 'sem CT-e'))}</tbody></table>`;
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:760px; width:100%; max-height:92vh; overflow-y:auto; padding:20px 22px;">
      <div style="display:flex; justify-content:space-between;"><h3 style="margin:0;">🧾 NF-e ${esc(n.numero_nf)}</h3><span style="cursor:pointer; font-size:18px;" data-nf-fechar>✕</span></div>
      <div style="margin-top:12px;">${corpo}</div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
        ${n.tem_xml ? `<a class="btn btn-secundario" style="width:auto;" href="/api/notas/${n.id}/danfe?token=${encodeURIComponent(token)}" target="_blank" rel="noopener">📄 DANFE (imprimir / PDF)</a>
        <a class="btn btn-secundario" style="width:auto;" href="/api/notas/${n.id}/xml?token=${encodeURIComponent(token)}">⬇ XML</a>` : '<span style="color:var(--texto-fraco); align-self:center;">Nota sem XML (entrou pela planilha do ERP)</span>'}
        <button class="btn btn-primario" data-nf-fechar style="width:auto;">Fechar</button></div></div>`;
    document.body.appendChild(fundo);
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-nf-fechar]')) fundo.remove(); });
  }

  $('nfExcel')?.addEventListener('click', () => {
    if (!dados) return;
    window.exportarExcel(`notas-fiscais-${new Date().toISOString().slice(0, 10)}`, [{ nome: 'Notas fiscais',
      colunas: ['NF', 'Série', 'Chave', 'Emissão', 'Saída', 'Emitente', 'CNPJ emitente', 'Destinatário', 'CNPJ/CPF destinatário', 'Cidade', 'UF', 'Valor produtos', 'Valor total', 'Peso bruto', 'Peso líquido', 'Volumes', 'Pedido', 'CT-e', 'Situação'],
      linhas: dados.notas.map((n) => [n.numero_nf, n.nf_serie || '', n.chave_nfe || '', dia(n.data_emissao_nf), n.data_saida ? dataHora(n.data_saida) : '', n.emitente_nome || '', doc(n.emitente_cnpj), n.cliente || '', doc(n.cliente_documento),
        n.cidade || '', n.uf || '', n.valor_produtos, n.valor_faturado, n.peso_bruto ?? n.peso_kg, n.peso_liquido, n.qtd_volumes, n.numero_pedido || '', n.numero_cte || '', SIT[n.situacao][1]]) }]).catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
  });
  $('nfZip')?.addEventListener('click', () => {
    if (!montado) return;
    const url = `/api/notas/zip?${filtros()}&token=${encodeURIComponent(token)}`;
    if (window.LinkSeguro?.ir) window.LinkSeguro.ir(url); else location.href = url;
  });
})();
