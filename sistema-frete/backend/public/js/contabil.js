// =====================================================================
// Fiscal e contabilidade: livro de saídas (CFOP, CST, UF, ICMS e ISS),
// lançamentos contábeis pelo plano de contas do contador e o pacote do
// mês (.zip com todos os XML), com envio por e-mail.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, pedirTexto, token.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navContabil');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/contabil${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const SITUACAO = { autorizado: ['Autorizado', 'entregue'], cancelado: ['Cancelado', 'cancelado'], substituido: ['Substituído', 'pendente'] };
  const tabela = (cab, linhas, vazio = 'Nada no período.') => (linhas.length
    ? `<div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr>${cab}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
    : `<div class="kanban-vazio">${vazio}</div>`);

  let aba = 'livro'; let cfg = null;
  const per = { de: '', ate: '' };
  const qs = () => `de=${per.de}&ate=${per.ate}`;
  const link = (c) => `/api/contabil/${c}?${qs()}&token=${encodeURIComponent(token)}`;
  const mostrarPeriodo = () => { $('cblBaixar').href = link('pacote.zip'); };
  // Período igual ao das outras telas (js/periodo.js); o contador fecha o mês passado.
  Periodo.ligar({ select: $('cblPer'), de: $('cblDe'), ate: $('cblAte'), chave: 'contabil', padrao: 'mes_passado',
    aoMudar: (de, ate) => { per.de = de; per.ate = ate; mostrarPeriodo(); carregar().catch(erro); } });
  Object.assign(per, { de: $('cblDe').value, ate: $('cblAte').value }); mostrarPeriodo();

  function mostrarAba(nome) {
    aba = nome;
    document.querySelectorAll('[data-cbl-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.cblAba === nome));
    $('cblBarra').classList.toggle('oculto', nome === 'config');
  }
  async function carregar() {
    mostrarPeriodo();
    if (!cfg) cfg = await api('/config');
    $('cblConteudo').innerHTML = '<div class="kanban-vazio">Carregando…</div>';
    await ({ livro: telaLivro, entradas: telaEntradas, lancamentos: telaLancamentos, pacote: telaPacote, config: telaConfig }[aba])();
  }
  document.querySelectorAll('[data-cbl-aba]').forEach((a) => a.addEventListener('click', () => { mostrarAba(a.dataset.cblAba); carregar().catch(erro); }));
  nav.addEventListener('click', () => { mostrarAba(aba); carregar().catch(erro); });
  $('cblEnviar').addEventListener('click', () => enviar().catch(erro));

  // ---------- Livro de saídas ----------
  async function telaLivro() {
    const l = await api(`/livro?${qs()}`);
    const t = l.totais;
    const grupo = (titulo, lista, rotulo) => `<div class="painel" style="padding:12px 14px; min-width:0;"><h4 style="margin:0 0 8px;">${titulo}</h4>${tabela(
      `<th>${rotulo}</th><th class="n">Qtd</th><th class="n">Valor</th><th class="n">Base ICMS</th><th class="n">ICMS</th><th class="n">Isentas/outras</th>`,
      lista.map((g) => `<tr><td>${esc(g.chave)}</td><td class="n">${g.qtd}</td><td class="n">${num(g.valor)}</td><td class="n">${num(g.base)}</td><td class="n">${num(g.icms)}</td><td class="n">${num(g.isentas_outras)}</td></tr>`))}</div>`;
    const avisos = [
      t.demonstracao ? 'O sistema está no modo demonstração: aqui aparecem só os documentos de demonstração (sem valor fiscal). Em produção, aparecem só os de produção.' : '',
      t.homologacao ? 'O CT-e está em homologação (ambiente de testes): estes documentos não têm valor fiscal.' : '',
      t.icms_outra_uf ? `ICMS devido a outra UF (OUTRAUF): ${brl(t.icms_outra_uf)} fora da base e do débito próprios — recolhido por GNRE.` : '',
      t.ajustes ? `${t.ajustes} documento(s) de meses anteriores cancelado(s) ou substituído(s) neste período: −${brl(t.ajustes_valor)} (ICMS −${brl(t.ajustes_icms)}). Veja "Ajustes de meses anteriores" abaixo; os lançamentos já trazem o estorno.` : '',
      l.ctes.some((d) => d.sem_base) ? `CT-e com CST tributado e alíquota, mas sem base de cálculo no XML: ${l.ctes.filter((d) => d.sem_base).map((d) => `${d.serie}/${d.numero}`).join(', ')}. O ICMS deles está zerado aqui — confira com o contador (os novos já saem com a base calculada).` : '',
      l.ctes.some((d) => !d.cfop) ? 'Há CT-e sem CFOP gravado (emitidos antes desta versão): confira no XML.' : '',
    ].filter(Boolean);
    $('cblConteudo').innerHTML = `
      <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <a class="btn btn-secundario" href="${link('livro.html')}" target="_blank" style="width:auto; text-decoration:none;">🖨 Imprimir / PDF</a>
        <a class="btn btn-secundario" href="${link('livro.csv')}" style="width:auto; text-decoration:none;">⬇ Planilha (Excel)</a></div>
      <div class="oc-resumo">
        <div>CT-e válidos<b>${t.ctes}</b><span>${[t.cancelados ? `${t.cancelados} cancelado(s)` : '', t.substituidos ? `${t.substituidos} substituído(s)` : ''].filter(Boolean).join(' · ') || 'nenhum cancelado'}</span></div>
        <div>Valor das prestações<b>${brl(t.valor)}</b><span>base ICMS ${brl(t.base)}</span></div>
        <div>ICMS das saídas<b>${brl(t.icms)}</b><span>isentas/outras ${brl(t.isentas_outras)}</span></div>
        <div>NFS-e (frete municipal)<b>${brl(t.nfse_valor)}</b><span>${t.nfse} nota(s) · ISS ${brl(t.iss)}${t.iss_retido ? ` (retido ${brl(t.iss_retido)})` : ''}</span></div>
      </div>
      ${avisos.length ? `<div class="cte-aviso" style="margin-bottom:12px;"><ul style="margin:0; padding-left:18px; line-height:1.6;">${avisos.map((a) => `<li>${a}</li>`).join('')}</ul></div>` : ''}
      <p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 12px;">O ICMS acima é o <b>débito</b> das saídas. Os créditos (diesel, CT-e de subcontratação) e o saldo a recolher estão na aba <b>📥 Notas de entrada e apuração</b>. Cancelados e substituídos aparecem na lista, mas não entram nas somas.</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(380px, 100%), 1fr)); gap:12px; margin-bottom:14px;">
        ${grupo('Por CFOP', l.por_cfop, 'CFOP')}${grupo('Por CST e alíquota', l.por_cst, 'CST')}${grupo('Por UF de início → fim', l.por_uf, 'Trajeto')}
      </div>
      <div class="painel" style="padding:12px 14px; margin-bottom:14px;"><h4 style="margin:0 0 8px;">CT-e do período (${l.ctes.length})</h4>${tabela(
        '<th>Data</th><th>Série/nº</th><th>Situação</th><th>CFOP</th><th>CST</th><th class="n">Alíq.</th><th>Trajeto</th><th>Tomador</th><th class="n">Valor</th><th class="n">Base</th><th class="n">ICMS</th>',
        l.ctes.map((d) => `<tr${d.situacao !== 'autorizado' ? ' style="opacity:.6;"' : ''}><td>${dia(d.data)}</td><td>${d.serie}/${d.numero}${d.demonstracao ? ' <small title="Demonstração">🧪</small>' : ''}</td>
          <td><span class="oc-sit ${SITUACAO[d.situacao]?.[1] || ''}">${SITUACAO[d.situacao]?.[0] || esc(d.situacao)}</span>${d.tipo !== 'normal' ? ` <small>${esc(d.tipo)}</small>` : ''}</td>
          <td>${esc(d.cfop || '—')}</td><td>${esc(d.cst || '—')}</td><td class="n">${d.aliquota ? `${num(d.aliquota)}%` : ''}${d.outra_uf ? ' <small>outra UF</small>' : ''}</td><td>${esc(d.mun_ini || '')}/${esc(d.uf_ini || '?')} → ${esc(d.mun_fim || '')}/${esc(d.uf_fim || '?')}</td>
          <td>${esc(d.tomador_nome)}<br><small style="color:var(--texto-fraco);">${docFmt(d.tomador_doc)}</small></td><td class="n">${num(d.valor_original)}</td><td class="n">${num(d.base)}</td><td class="n">${num(d.icms)}</td></tr>`),
        'Nenhum CT-e autorizado no período.')}</div>
      ${l.ajustes?.length ? `<div class="painel" style="padding:12px 14px; margin-bottom:14px;"><h4 style="margin:0 0 8px;">Ajustes de meses anteriores (${l.ajustes.length})</h4>${tabela(
        '<th>Data do ajuste</th><th>Documento</th><th>Emitido em</th><th>Motivo</th><th>Tomador</th><th class="n">Valor</th><th class="n">ICMS/ISS</th>',
        l.ajustes.map((a) => `<tr><td>${dia(a.data)}</td><td>${esc(a.documento)}</td><td>${dia(a.data_original)}</td><td>${esc(a.motivo)}</td><td>${esc(a.tomador_nome)}</td>
          <td class="n">−${num(a.valor)}</td><td class="n">${a.icms || a.iss ? `−${num(a.icms || a.iss)}` : ''}</td></tr>`))}</div>` : ''}
      ${l.nfse.length ? `<div class="painel" style="padding:12px 14px;"><h4 style="margin:0 0 8px;">NFS-e do período (${l.nfse.length})</h4>${tabela(
        '<th>Data</th><th>Número</th><th>Situação</th><th>Tomador</th><th class="n">Valor</th><th class="n">Alíq. ISS</th><th class="n">ISS</th><th>ISS retido</th>',
        l.nfse.map((x) => `<tr${x.cancelada ? ' style="opacity:.6;"' : ''}><td>${dia(x.data)}</td><td>${esc(x.numero_nfse)}</td><td><span class="oc-sit ${x.cancelada ? 'cancelado' : 'entregue'}">${x.cancelada ? 'Cancelada' : 'Autorizada'}</span></td>
          <td>${esc(x.tomador_nome)}</td><td class="n">${num(x.valor)}</td><td class="n">${x.iss_aliquota != null ? `${num(x.iss_aliquota)}%` : ''}</td><td class="n">${num(x.iss_valor)}</td><td>${x.iss_retido ? 'Sim' : 'Não'}</td></tr>`))}</div>` : ''}`;
  }

  // ---------- Notas de entrada e apuração ----------
  const SIT_NE = { lancada: ['Lançada', 'entregue'], cancelada: ['Cancelada', 'cancelado'] };
  const modalNe = $('modalEntrada');
  const fecharNe = () => modalNe.classList.add('oculto');
  modalNe.addEventListener('click', (e) => { if (e.target === modalNe || e.target.closest('[data-ne-fechar]')) fecharNe(); });
  const cabModal = (titulo) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;"><h3 style="margin:0;">${titulo}</h3><span style="cursor:pointer; font-size:18px;" data-ne-fechar>✕</span></div>`;
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let ne = { busca: '', dados: null };
  // CNPJ do fornecedor na nota sem XML: formata, confere e preenche o nome pela Receita.
  window.Doc?.registrar('#nmDoc', { razao_social: '#nmNome', uf: '#nmUf' });

  async function telaEntradas() {
    const [d, lv] = await Promise.all([api(`/entradas?${qs()}&situacao=todas&busca=${encodeURIComponent(ne.busca)}`), api(`/entradas/livro?${qs()}`)]);
    ne.dados = d;
    const a = lv.apuracao; const t = lv.livro.totais;
    $('cblConteudo').innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <label class="btn btn-primario" style="width:auto; cursor:pointer;">⬆ Importar XML (NF-e / CT-e)<input type="file" id="neArquivos" accept=".xml,text/xml,application/xml" multiple style="display:none;" /></label>
          <button class="btn btn-secundario" id="neManual" style="width:auto;">✍ Nota sem XML</button></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-secundario" href="${link('entradas/livro.html')}" target="_blank" style="width:auto; text-decoration:none;">🖨 Livro de entradas</a>
          <a class="btn btn-secundario" href="${link('entradas/livro.csv')}" style="width:auto; text-decoration:none;">⬇ Planilha</a></div></div>
      <div class="oc-resumo">
        <div>ICMS das saídas (débitos)<b>${brl(a.debito)}</b><span>do livro de saídas</span></div>
        <div>Créditos<b>${brl(a.credito)}</b><span>${esc(a.modo_texto)}</span></div>
        ${a.modo === 'notas' ? `<div>Saldo credor anterior<b>${brl(a.saldo_credor_anterior)}</b><span>levado dos meses anteriores</span></div>` : ''}
        <div>${a.a_recolher ? 'ICMS a recolher' : 'Saldo credor para o próximo mês'}<b style="color:${a.a_recolher ? '#ef4444' : 'var(--verde)'};">${brl(a.a_recolher || a.saldo_credor)}</b><span>${t.notas} nota(s) de entrada · ${brl(t.valor)}</span></div>
      </div>
      <p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 12px;">Lance as notas de compra (diesel, ARLA, peças, pneus) e os CT-e de agregados e redespacho em que a sua empresa é a tomadora. O crédito de ICMS de cada nota é sugerido pelo tipo do item e pode ser ajustado; o modo de crédito fica em ⚙ Contador e plano de contas. A apuração é uma prévia: o contador confirma no SPED.</p>
      ${lv.livro.por_cfop.length ? `<div class="painel" style="padding:12px 14px; margin-bottom:14px;"><h4 style="margin:0 0 8px;">Livro de entradas por CFOP</h4>${tabela(
        '<th>CFOP</th><th class="n">Linhas</th><th class="n">Valor contábil</th><th class="n">Base</th><th class="n">ICMS creditado</th><th class="n">Isentas/outras</th>',
        lv.livro.por_cfop.map((g) => `<tr><td>${esc(g.chave)}</td><td class="n">${g.qtd}</td><td class="n">${num(g.valor)}</td><td class="n">${num(g.base)}</td><td class="n">${num(g.credito)}</td><td class="n">${num(g.outras)}</td></tr>`))}</div>` : ''}
      <div class="painel" style="padding:12px 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;"><h4 style="margin:0;">Notas de entrada (${d.totais.qtd})</h4>
          <input type="text" id="neBusca" class="cte-entrada" placeholder="Fornecedor, número, chave ou CNPJ" value="${esc(ne.busca)}" style="max-width:300px;" /></div>
        ${tabela('<th>Entrada</th><th>Nota</th><th>Fornecedor</th><th>Categoria</th><th class="n">Valor</th><th class="n">ICMS</th><th class="n">Crédito</th><th>Contas a pagar</th><th>Situação</th><th></th>',
    d.notas.map((n) => `<tr${n.status !== 'lancada' ? ' style="opacity:.6;"' : ''}><td>${dia(n.entrada)}<br><small style="color:var(--texto-fraco);">emitida ${dia(n.emissao)}</small></td>
          <td>${{ 55: 'NF-e', 57: 'CT-e', '01': 'Nota' }[n.modelo] || n.modelo} ${esc(n.numero)}${n.serie ? `/${esc(n.serie)}` : ''}</td>
          <td>${esc(n.emitente_nome)}<br><small style="color:var(--texto-fraco);">${docFmt(n.emitente_doc)}${n.emitente_uf ? ` · ${esc(n.emitente_uf)}` : ''}</small></td>
          <td>${esc(d.categorias[n.categoria] || n.categoria)}</td><td class="n">${num(n.valor_total)}</td><td class="n">${num(n.icms)}</td><td class="n">${n.credito_icms ? `<b>${num(n.credito_icms)}</b>` : '—'}</td>
          <td>${(n.contas || []).length ? (n.contas || []).map((c) => `<small style="display:block;">${dia(c.vencimento)} · ${num(c.valor)} · ${esc(c.status)}</small>`).join('') : '<small style="color:var(--texto-fraco);">não gerou</small>'}</td>
          <td><span class="oc-sit ${SIT_NE[n.status][1]}">${SIT_NE[n.status][0]}</span>${n.motivo_cancelamento ? `<br><small>${esc(n.motivo_cancelamento)}</small>` : ''}</td>
          <td><div class="oc-linha-acoes"><button data-ne-ver="${n.id}">Ver</button>${n.status === 'lancada' ? `<button data-ne-cancelar="${n.id}" title="Cancelar o lançamento">✕</button>` : ''}</div></td></tr>`),
    'Nenhuma nota de entrada no período. Use "Importar XML" para lançar as compras.')}
      </div>`;
    let tm = null;
    $('neBusca').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(() => { ne.busca = e.target.value.trim(); telaEntradas().then(() => { const b = $('neBusca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }).catch(erro); }, 400); });
    $('neArquivos').addEventListener('change', (e) => importar([...e.target.files]).catch(erro));
    $('neManual').addEventListener('click', () => manual());
    $('cblConteudo').querySelectorAll('[data-ne-ver]').forEach((b) => b.addEventListener('click', () => verNota(Number(b.dataset.neVer)).catch(erro)));
    $('cblConteudo').querySelectorAll('[data-ne-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      const motivo = await pedirTexto('Cancelar o lançamento desta nota? As contas a pagar dela em aberto são canceladas junto. Motivo:', { titulo: 'Cancelar nota de entrada', textoOk: 'Cancelar nota' });
      if (!motivo) return;
      try { await api(`/entradas/${b.dataset.neCancelar}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) }); mostrarAlerta('Nota cancelada.', { tipo: 'sucesso' }); telaEntradas().catch(erro); } catch (err) { erro(err); }
    }));
  }

  const opcoesCategoria = (sel) => Object.entries(ne.dados?.categorias || {}).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

  // Lê os XML escolhidos, mostra a prévia de cada um e lança os que estiverem certos.
  async function importar(arquivos) {
    if (!arquivos.length) return;
    const lidos = [];
    for (const f of arquivos) {
      const xml = await f.text();
      try { lidos.push({ nome: f.name, xml, p: await api('/entradas/previa', { method: 'POST', body: JSON.stringify({ xml }) }) }); } catch (err) { lidos.push({ nome: f.name, erro: err.message }); }
    }
    const ok = lidos.filter((x) => x.p);
    const semCredito = ne.dados?.modo_credito !== 'notas';
    $('neModal').innerHTML = `${cabModal(`📥 Importar ${arquivos.length} arquivo(s)`)}
      ${lidos.map((x, k) => (x.erro ? `<div class="cte-aviso erro" style="margin-bottom:10px;"><b>${esc(x.nome)}</b>: ${esc(x.erro)}</div>` : `
      <div class="painel ne-item" data-k="${k}" style="padding:12px 14px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div><b>${x.p.modelo === '57' ? 'CT-e' : 'NF-e'} ${esc(x.p.numero)}/${esc(x.p.serie)}</b> · ${esc(x.p.emitente.nome)} <small style="color:var(--texto-fraco);">${docFmt(x.p.emitente.doc)} · ${esc(x.p.emitente.uf)}</small><br>
            <small style="color:var(--texto-fraco);">Emitida ${dia(x.p.emissao)} · ${esc(x.p.natureza)} · CFOP de entrada ${esc(x.p.cfop_entrada)} · ${x.p.itens.length} item(ns): ${esc(x.p.itens.slice(0, 3).map((i) => i.descricao).join(', '))}${x.p.itens.length > 3 ? '…' : ''}</small></div>
          <div style="text-align:right;"><b style="font-size:16px;">${brl(x.p.valor_total)}</b><br><small>ICMS ${brl(x.p.icms)}</small></div></div>
        ${x.p.avisos.length ? `<div class="cte-aviso" style="margin:8px 0;">${x.p.avisos.map(esc).join('<br>')}</div>` : ''}
        <div class="oc-form" style="margin-top:8px;">
          <div class="campo"><label>Data de entrada</label><input type="date" class="ne-entrada" value="${hoje() < x.p.emissao ? x.p.emissao : hoje()}" min="${esc(x.p.emissao)}" /></div>
          <div class="campo"><label>Categoria</label><select class="ne-cat">${opcoesCategoria(x.p.categoria)}</select></div>
          <div class="campo"><label>Crédito de ICMS (R$)</label><input type="number" step="0.01" min="0" max="${x.p.icms}" class="ne-credito" value="${semCredito ? 0 : x.p.credito_sugerido}" ${semCredito ? 'disabled title="Modo de crédito: sem crédito pelas notas"' : ''} /></div>
          <label class="ag-check" style="align-self:end; margin-bottom:10px;"><input type="checkbox" class="ne-gerar" checked /> Gerar conta(s) a pagar</label>
          ${x.p.duplicatas.length ? `<div class="campo inteiro"><small>Duplicatas da nota: ${x.p.duplicatas.map((d) => `${dia(d.vencimento)} ${brl(d.valor)}`).join(' · ')}</small></div>`
    : `<div class="campo"><label>Vencimento</label><input type="date" class="ne-venc" /></div><div class="campo"><label>Parcelas</label><input type="number" class="ne-parc" min="1" max="60" value="1" /></div>`}
        </div><div class="ne-res"></div></div>`)).join('')}
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ne-fechar style="width:auto;">Fechar</button>
        ${ok.length ? `<button class="btn btn-primario" id="neLancar" style="width:auto;">Lançar ${ok.length} nota(s)</button>` : ''}</div>`;
    modalNe.classList.remove('oculto');
    $('neLancar')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      let feitas = 0;
      for (const el of document.querySelectorAll('#neModal .ne-item')) {
        if (el.dataset.feito) continue;
        const x = lidos[Number(el.dataset.k)];
        const q = (c) => el.querySelector(c);
        try {
          const r = await api('/entradas', { method: 'POST', body: JSON.stringify({ xml: x.xml, entrada: q('.ne-entrada').value, categoria: q('.ne-cat').value, credito_icms: q('.ne-credito').value,
            gerar_contas: q('.ne-gerar').checked, vencimento: q('.ne-venc')?.value, parcelas: q('.ne-parc')?.value }) });
          el.dataset.feito = '1'; feitas += 1;
          q('.ne-res').innerHTML = `<div class="cte-aviso ok" style="margin-top:6px;">✓ Lançada${r.contas.length ? ` · ${r.contas.length} conta(s) a pagar` : ''}${r.credito ? ` · crédito ${brl(r.credito)}` : ''}</div>`;
        } catch (err) { q('.ne-res').innerHTML = `<div class="cte-aviso erro" style="margin-top:6px;">${esc(err.message)}</div>`; }
      }
      b.disabled = false;
      if (feitas) { mostrarAlerta(`${feitas} nota(s) lançada(s).`, { tipo: 'sucesso' }); telaEntradas().catch(erro); }
      if (![...document.querySelectorAll('#neModal .ne-item')].some((el) => !el.dataset.feito)) b.remove();
    });
  }

  function manual() {
    const semCredito = ne.dados?.modo_credito !== 'notas';
    $('neModal').innerHTML = `${cabModal('✍ Nota de entrada sem XML')}
      <p class="edi-dica" style="margin-top:0;">Para nota em papel, cupom ou serviço sem XML. Com XML, prefira "Importar XML": vem tudo da nota.</p>
      <div class="oc-form">
        <div class="campo"><label for="nmNome">Fornecedor</label><input id="nmNome" maxlength="200" /></div>
        <div class="campo"><label for="nmDoc">CNPJ/CPF</label><input id="nmDoc" maxlength="18" /></div>
        <div class="campo"><label for="nmUf">UF do fornecedor</label><input id="nmUf" maxlength="2" /></div>
        <div class="campo"><label for="nmNum">Número</label><input id="nmNum" maxlength="15" /></div>
        <div class="campo"><label for="nmSerie">Série</label><input id="nmSerie" maxlength="5" /></div>
        <div class="campo"><label for="nmEmissao">Emissão</label><input type="date" id="nmEmissao" value="${hoje()}" /></div>
        <div class="campo"><label for="nmEntrada">Entrada</label><input type="date" id="nmEntrada" value="${hoje()}" /></div>
        <div class="campo"><label for="nmValor">Valor total (R$)</label><input type="number" step="0.01" id="nmValor" /></div>
        <div class="campo"><label for="nmCfop">CFOP de entrada</label><input id="nmCfop" maxlength="4" value="1556" title="1556: uso e consumo · 1653: combustível · 1351: frete contratado · 1933: serviço" /></div>
        <div class="campo"><label for="nmBase">Base do ICMS</label><input type="number" step="0.01" id="nmBase" value="0" /></div>
        <div class="campo"><label for="nmIcms">ICMS destacado</label><input type="number" step="0.01" id="nmIcms" value="0" /></div>
        <div class="campo"><label for="nmCred">Crédito de ICMS</label><input type="number" step="0.01" id="nmCred" value="0" ${semCredito ? 'disabled' : ''} /></div>
        <div class="campo"><label for="nmCat">Categoria</label><select id="nmCat">${opcoesCategoria('manutencao')}</select></div>
        <div class="campo inteiro"><label for="nmDesc">Descrição</label><input id="nmDesc" maxlength="200" placeholder="Ex: troca de lona de freio do caminhão ABC1D23" /></div>
        <label class="ag-check" style="margin-bottom:10px;"><input type="checkbox" id="nmGerar" checked /> Gerar conta(s) a pagar</label>
        <div class="campo"><label for="nmVenc">Vencimento</label><input type="date" id="nmVenc" /></div>
        <div class="campo"><label for="nmParc">Parcelas</label><input type="number" id="nmParc" min="1" max="60" value="1" /></div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ne-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="nmSalvar" style="width:auto;">Lançar nota</button></div>`;
    modalNe.classList.remove('oculto');
    $('nmSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        await api('/entradas', { method: 'POST', body: JSON.stringify({ emitente_nome: $('nmNome').value, emitente_doc: $('nmDoc').value, emitente_uf: $('nmUf').value, numero: $('nmNum').value, serie: $('nmSerie').value,
          emissao: $('nmEmissao').value, entrada: $('nmEntrada').value, valor_total: $('nmValor').value, cfop: $('nmCfop').value, base_icms: $('nmBase').value, icms: $('nmIcms').value,
          credito_icms: $('nmCred').value, categoria: $('nmCat').value, descricao: $('nmDesc').value, gerar_contas: $('nmGerar').checked, vencimento: $('nmVenc').value, parcelas: $('nmParc').value }) });
        fecharNe(); mostrarAlerta('Nota lançada.', { tipo: 'sucesso' }); telaEntradas().catch(erro);
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  async function verNota(id) {
    const n = await api(`/entradas/${id}`);
    $('neModal').innerHTML = `${cabModal(`${{ 55: 'NF-e', 57: 'CT-e', '01': 'Nota' }[n.modelo] || ''} ${esc(n.numero)}${n.serie ? `/${esc(n.serie)}` : ''} — ${esc(n.emitente_nome)}`)}
      <div style="font-size:12.5px; color:var(--texto-fraco); margin-bottom:10px;">${docFmt(n.emitente_doc)}${n.emitente_uf ? ` · ${esc(n.emitente_uf)}` : ''} · emitida ${dia(n.emissao)} · entrada ${dia(n.entrada)}${n.natureza ? ` · ${esc(n.natureza)}` : ''}${n.chave ? `<br>Chave ${esc(n.chave)}` : ''} · lançada por ${esc(n.usuario_nome || '')}</div>
      <div class="oc-resumo"><div>Valor<b>${brl(n.valor_total)}</b></div><div>ICMS<b>${brl(n.icms)}</b><span>base ${brl(n.base_icms)}${n.icms_st ? ` · ST ${brl(n.icms_st)}` : ''}${n.ipi ? ` · IPI ${brl(n.ipi)}` : ''}</span></div><div>Crédito aproveitado<b>${brl(n.credito_icms)}</b></div></div>
      ${tabela('<th>Item</th><th>NCM</th><th>CFOP</th><th>Entrada</th><th class="n">Qtd</th><th class="n">Valor</th><th>CST</th><th class="n">ICMS</th>',
    (n.itens || []).map((i) => `<tr><td>${esc(i.descricao)}</td><td>${esc(i.ncm)}</td><td>${esc(i.cfop)}</td><td>${esc(i.cfop_entrada || '')}</td><td class="n">${num(i.quantidade)} ${esc(i.unidade)}</td><td class="n">${num(i.valor)}</td><td>${esc(i.cst)}</td><td class="n">${num(i.icms)}${i.creditavel ? ' <small title="Item que dá crédito">✓</small>' : ''}</td></tr>`))}
      <h4 style="margin:14px 0 6px;">Contas a pagar</h4>${tabela('<th>Conta</th><th>Vencimento</th><th class="n">Valor</th><th class="n">Pago</th><th>Situação</th>',
    n.contas.map((c) => `<tr><td>${esc(c.descricao)}${c.parcela ? ` (${esc(c.parcela)})` : ''}</td><td>${dia(c.vencimento)}</td><td class="n">${num(c.valor)}</td><td class="n">${num(c.valor_pago)}</td><td>${esc(c.status)}</td></tr>`), 'Esta nota não gerou conta a pagar.')}
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">${n.tem_xml ? '<button class="btn btn-secundario" id="neXml" style="width:auto;">⬇ XML</button>' : ''}<button class="btn btn-secundario" data-ne-fechar style="width:auto;">Fechar</button></div>`;
    modalNe.classList.remove('oculto');
    $('neXml')?.addEventListener('click', async () => {
      const r = await apiFetch(`/api/contabil/entradas/${id}/xml`);
      if (!r.ok) { erro(new Error('Não foi possível baixar o XML.')); return; }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = `${n.chave || `nota-${id}`}.xml`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }

  // ---------- Lançamentos ----------
  async function telaLancamentos() {
    const r = await api(`/lancamentos?${qs()}`);
    const deb = r.por_conta.reduce((s, c) => s + c.debito, 0); const cred = r.por_conta.reduce((s, c) => s + c.credito, 0);
    $('cblConteudo').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <span style="font-size:12.5px; color:var(--texto-fraco);">Regime de <b>${r.regime === 'caixa' ? 'caixa' : 'competência'}</b> · ${r.totais.linhas} lançamento(s) · contas do plano em ⚙ Contador e plano de contas</span>
        ${r.totais.receita_recebida ? `<span style="font-size:12.5px;">Receita recebida no período: <b>R$ ${num(r.totais.receita_recebida.total)}</b> (CT-e ${num(r.totais.receita_recebida.frete)} · NFS-e ${num(r.totais.receita_recebida.municipal)})</span>` : ''}
        <a class="btn btn-primario" href="${link('lancamentos.csv')}" style="width:auto; text-decoration:none;">⬇ Planilha para importar</a></div>
      <div class="painel" style="padding:12px 14px; margin-bottom:14px;"><h4 style="margin:0 0 8px;">Resumo por conta</h4>${tabela(
        '<th>Conta</th><th>Nome</th><th class="n">Débitos</th><th class="n">Créditos</th><th class="n">Saldo do período</th>',
        r.por_conta.map((c) => `<tr><td>${esc(c.conta)}</td><td>${esc(c.nome)}</td><td class="n">${num(c.debito)}</td><td class="n">${num(c.credito)}</td><td class="n">${num(Math.abs(c.saldo))} ${c.saldo > 0 ? 'D' : c.saldo < 0 ? 'C' : ''}</td></tr>`)
          .concat(r.por_conta.length ? [`<tr style="font-weight:700;"><td colspan="2">Total (débitos = créditos)</td><td class="n">${num(deb)}</td><td class="n">${num(cred)}</td><td></td></tr>`] : []),
        'Nenhum lançamento no período.')}</div>
      <div class="painel" style="padding:12px 14px;"><h4 style="margin:0 0 8px;">Lançamentos</h4>${tabela(
        '<th>Data</th><th>Débito</th><th>Crédito</th><th class="n">Valor</th><th>Histórico</th><th>Documento</th>',
        r.linhas.map((x) => `<tr><td>${dia(x.data)}</td><td>${esc(x.debito)}</td><td>${esc(x.credito)}</td><td class="n">${num(x.valor)}</td><td style="white-space:normal;">${esc(x.historico)}</td><td>${esc(x.documento)}</td></tr>`))}</div>`;
  }

  // ---------- Pacote ----------
  async function telaPacote() {
    const [l, c] = await Promise.all([api(`/livro?${qs()}`), api('/config')]);
    cfg = c;
    const u = c.ultimo_envio;
    $('cblConteudo').innerHTML = `
      <div class="painel" style="padding:16px 18px; margin-bottom:14px; max-width:860px;">
        <h4 style="margin:0 0 6px;">O que vai no .zip de ${dia(per.de)} a ${dia(per.ate)}</h4>
        <ul style="margin:0 0 12px; padding-left:18px; line-height:1.8; font-size:13.5px;">
          <li><b>CT-e</b>: XML autorizado de ${l.totais.ctes} válido(s), ${l.totais.cancelados} cancelado(s) e ${l.totais.substituidos} substituído(s), em pastas separadas, com os eventos (cancelamento, carta de correção)</li>
          <li><b>MDF-e</b> e <b>NFS-e</b> do período (${l.totais.nfse + l.totais.nfse_canceladas} NFS-e)</li>
          <li><b>Livro de saídas</b> (HTML para imprimir e planilha) com o resumo por CFOP, CST e UF</li>
          <li><b>Notas de entrada</b>: XML das notas lançadas no período (pasta Entradas) e o <b>livro de entradas</b> com a apuração do ICMS</li>
          <li><b>Lançamentos contábeis</b> (data, débito, crédito, valor, histórico, documento, CNPJ) para importar no sistema do contador</li>
        </ul>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-primario" href="${link('pacote.zip')}" style="width:auto; text-decoration:none;">⬇ Baixar o pacote (.zip)</a>
          <button class="btn btn-secundario" id="cblEnviar2" style="width:auto;">✉ Enviar ao contador${c.contador_email ? ` (${esc(c.contador_email)})` : ''}</button>
        </div>
        <p style="font-size:12.5px; color:var(--texto-fraco); margin:12px 0 0;">O SPED (EFD ICMS/IPI e EFD Contribuições) é gerado pelo sistema do contador: ele importa estes XML (saídas e as notas de entrada lançadas aqui). Nota de entrada que não foi lançada no Nexofrete não vai no pacote.</p>
      </div>
      <div class="painel" style="padding:16px 18px; max-width:860px;">
        <h4 style="margin:0 0 6px;">Envio automático</h4>
        <p style="margin:0; font-size:13.5px;">${c.envio_ativo
    ? `Ligado: todo dia <b>${c.envio_dia}</b>, o pacote do mês anterior vai para <b>${esc(c.contador_email)}</b>.`
    : 'Desligado. Ligue em ⚙ Contador e plano de contas para o pacote ir sozinho todo mês.'}</p>
        ${u ? `<p style="margin:8px 0 0; font-size:13px;">Último envio automático: ${dia(u.de)} a ${dia(u.ate)} em ${new Date(u.em).toLocaleString('pt-BR')} para ${esc(u.para || '')} —
          ${u.ok ? '<span class="oc-sit entregue">Enviado</span>' : `<span class="oc-sit cancelado">Falhou</span> ${esc(u.erro || '')}`}</p>` : ''}
      </div>`;
    $('cblEnviar2').addEventListener('click', () => enviar().catch(erro));
  }

  async function enviar() {
    if (!cfg) cfg = await api('/config');
    const para = await pedirTexto(`Mandar o pacote de ${dia(per.de)} a ${dia(per.ate)} por e-mail para:`, { titulo: 'Enviar ao contador', valor: cfg.contador_email || '', placeholder: 'contador@escritorio.com.br', textoOk: 'Enviar' });
    if (para == null) return;
    const botoes = [$('cblEnviar'), $('cblEnviar2')].filter(Boolean);
    const textos = botoes.map((x) => x.textContent);
    botoes.forEach((x) => { x.disabled = true; x.textContent = 'Enviando…'; });
    let r;
    try { r = await api('/enviar', { method: 'POST', body: JSON.stringify({ de: per.de, ate: per.ate, para: para.trim() }) }); } finally { botoes.forEach((x, i) => { x.disabled = false; x.textContent = textos[i]; }); }
    mostrarAlerta(`Pacote enviado para ${r.para}: ${r.contagem.cte} CT-e, ${r.contagem.mdfe} MDF-e, ${r.contagem.nfse} NFS-e e ${r.lancamentos.linhas} lançamentos.`, { tipo: 'sucesso' });
  }

  // ---------- Configuração ----------
  async function telaConfig() {
    const c = cfg = await api('/config');
    const campo = (id, rotulo, valor, extra = '') => `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;
    $('cblConteudo').innerHTML = `
      <div style="display:grid; grid-template-columns:minmax(320px, 440px) minmax(0, 1fr); gap:14px; align-items:start;" class="cbl-grade">
        <div class="painel" style="padding:16px 18px;">
          <h4 style="margin:0 0 10px;">Contador</h4>
          ${campo('cblNome', 'Nome / escritório', c.contador_nome)}
          ${campo('cblEmail', 'E-mail (vários: separe com ;)', c.contador_email, 'type="text" placeholder="contador@escritorio.com.br"')}
          ${campo('cblCrc', 'CRC', c.contador_crc)}
          <div class="campo"><label for="cblRegime">Regime dos lançamentos</label><select id="cblRegime" class="cte-entrada">
            <option value="competencia" ${c.regime !== 'caixa' ? 'selected' : ''}>Competência — despesa no mês da competência, receita na emissão</option>
            <option value="caixa" ${c.regime === 'caixa' ? 'selected' : ''}>Caixa — despesa quando paga, receita quando recebe</option></select></div>
          <div class="campo"><label for="cblSep">Separador da planilha</label><select id="cblSep" class="cte-entrada">
            <option value=";" ${c.separador === ';' ? 'selected' : ''}>Ponto e vírgula (Excel brasileiro, Domínio, Alterdata)</option>
            <option value="," ${c.separador === ',' ? 'selected' : ''}>Vírgula (valor com ponto)</option>
            <option value="tab" ${c.separador === 'tab' ? 'selected' : ''}>Tabulação</option></select></div>
          <div class="campo"><label for="cblCredito">Crédito de ICMS nas entradas</label><select id="cblCredito" class="cte-entrada">
            <option value="">Automático (Simples: sem crédito; demais: pelas notas)</option>
            <option value="notas" ${c.icms_credito === 'notas' ? 'selected' : ''}>Pelas notas de entrada (diesel, lubrificante, CT-e tomado)</option>
            <option value="presumido" ${c.icms_credito === 'presumido' ? 'selected' : ''}>Crédito presumido de 20% (Convênio ICMS 106/96)</option>
            <option value="nenhum" ${c.icms_credito === 'nenhum' ? 'selected' : ''}>Sem crédito (Simples Nacional)</option></select></div>
          ${campo('cblSaldoIni', 'Saldo credor de ICMS antes da primeira nota lançada (R$)', c.icms_saldo_inicial || '', 'type="number" step="0.01" min="0" style="width:180px;"')}
          <label style="display:flex; gap:8px; align-items:center; margin:12px 0 6px; font-size:13.5px;"><input type="checkbox" id="cblAuto" ${c.envio_ativo ? 'checked' : ''} /> Enviar o pacote do mês anterior automaticamente</label>
          ${campo('cblDia', 'Dia do mês do envio (1 a 28)', c.envio_dia, 'type="number" min="1" max="28" style="width:110px;"')}
          <button class="btn btn-primario" id="cblSalvar" style="width:auto; margin-top:8px;">Salvar</button>
        </div>
        <div class="painel" style="padding:16px 18px; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;"><h4 style="margin:0;">Plano de contas</h4>
            <button class="btn btn-secundario" id="cblPadrao" style="width:auto;">Voltar ao padrão</button></div>
          <p style="font-size:12.5px; color:var(--texto-fraco); margin:6px 0 10px;">Troque pelos códigos (ou reduzidos) do plano do seu contador — é o que vai nas colunas débito e crédito.</p>
          <div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Conta</th><th style="width:170px;">Código</th></tr></thead><tbody>
            ${Object.keys(c.padrao).map((k) => `<tr><td>${esc(c.nomes[k] || k)}</td><td><input class="cte-entrada cbl-conta" data-conta="${k}" value="${esc(c.contas[k])}" style="padding:5px 8px;" /></td></tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;
    $('cblPadrao').addEventListener('click', () => document.querySelectorAll('.cbl-conta').forEach((i) => { i.value = c.padrao[i.dataset.conta]; }));
    $('cblSalvar').addEventListener('click', async () => {
      const contas = {}; document.querySelectorAll('.cbl-conta').forEach((i) => { contas[i.dataset.conta] = i.value; });
      try {
        cfg = await api('/config', { method: 'PUT', body: JSON.stringify({ contador_nome: $('cblNome').value, contador_email: $('cblEmail').value, contador_crc: $('cblCrc').value,
          regime: $('cblRegime').value, separador: $('cblSep').value, envio_ativo: $('cblAuto').checked, envio_dia: $('cblDia').value, contas,
          icms_credito: $('cblCredito').value, icms_saldo_inicial: $('cblSaldoIni').value }) });
        mostrarAlerta(cfg.envio_ativo ? `Salvo. O pacote vai para ${cfg.contador_email} todo dia ${cfg.envio_dia}.` : 'Salvo.', { tipo: 'sucesso' });
      } catch (e) { erro(e); }
    });
  }
})();
