// =====================================================================
// NFS-e (Padrão Nacional) do frete municipal, na aba "NFS-e" da Emissão de
// CT-e: rascunho, transmissão ao Sistema Nacional, DANFSe, XML e cancelamento.
// Frete que começa e termina no mesmo município é serviço com ISS, não CT-e.
// Usa do dashboard.js: token, usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const painel = document.getElementById('cte-aba-nfse');
  if (!pode || !painel) return;
  const ehAdmin = usuario?.perfil === 'admin';

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const fmt = (v, c = 2) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const lerNum = (v) => { const t = String(v ?? '').trim(); if (!t) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : null; };
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const docFmt = (d) => { const x = String(d || '').replace(/\D/g, ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const STATUS = { rascunho: ['Rascunho', 'pendente'], enviando: ['Enviando', 'em_transito'], autorizada: ['Autorizada', 'entregue'], rejeitada: ['Rejeitada', 'ocorrencia'],
    erro: ['Sem resposta', 'ocorrencia'], cancelada: ['Cancelada', 'cancelado'] };
  const FILTROS = [['todas', 'Todas'], ['abertas', 'A transmitir'], ['autorizadas', 'Autorizadas'], ['canceladas', 'Canceladas']];
  const modal = $('modalNfse');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-ns-fechar]')) fechar(); });
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/nfse${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  };
  const link = (caminho) => `/api/nfse${caminho}${caminho.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  let estado = { filtro: 'todas', config: null };

  document.querySelectorAll('.cte-aba').forEach((aba) => aba.addEventListener('click', () => { if (aba.dataset.cteAba === 'nfse') montar().catch(erro); }));

  async function montar() {
    estado.config = await api('/config');
    const c = estado.config;
    painel.innerHTML = `<div class="cte-aviso" style="margin-bottom:12px;">Frete com coleta e entrega no <b>mesmo município</b> não leva CT-e: é serviço com <b>ISS</b> e sai em NFS-e (Padrão Nacional).
        Ambiente: <b>${c.ambiente === 1 ? 'PRODUÇÃO' : 'homologação (produção restrita)'}</b>${c.demonstracao ? ' · <b style="color:var(--azul);">modo demonstração</b> (nada vai ao governo)' : ''} · série ${c.serie} · código ${esc(c.cTribNac)}${c.aliquota ? ` · ISS ${fmt(c.aliquota)}%` : ''}</div>
      <div class="oc-resumo" id="nsResumo"></div>
      <div class="painel oc-painel">
        <div class="oc-barra" style="flex-wrap:wrap; gap:8px;">
          <div class="oc-filtros" id="nsFiltros"></div>
          <div class="oc-busca" style="display:flex; gap:8px;"><input type="text" id="nsBusca" class="cte-entrada" placeholder="Tomador, CNPJ, número ou chave" />
            ${ehAdmin ? '<button class="btn btn-secundario" id="nsConfig" style="width:auto;">⚙ Configurar</button>' : ''}
            <button class="btn btn-primario" id="nsNova" style="width:auto;">＋ Nova NFS-e</button></div>
        </div>
        <div class="edi-rolagem" id="nsTabela"></div>
      </div>`;
    let t = null;
    $('nsBusca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => carregar().catch(erro), 350); });
    $('nsFiltros').addEventListener('click', (e) => { const b = e.target.closest('[data-ns-filtro]'); if (b) { estado.filtro = b.dataset.nsFiltro; carregar().catch(erro); } });
    $('nsNova').addEventListener('click', () => formulario());
    $('nsConfig')?.addEventListener('click', () => configurar());
    $('nsTabela').addEventListener('click', (e) => { const b = e.target.closest('[data-ns-abrir]'); if (b) abrir(Number(b.dataset.nsAbrir)).catch(erro); });
    await carregar();
  }

  async function carregar() {
    const r = await api(`?${new URLSearchParams({ filtro: estado.filtro, busca: $('nsBusca').value.trim() })}`);
    const s = r.resumo;
    $('nsResumo').innerHTML = `<div>Emitidas no mês<b>${s.mes_qtd}</b><span>${moeda(s.mes_valor)}</span></div>
      <div>ISS a recolher (mês)<b>${moeda(s.mes_iss_recolher)}</b><span>guia do município</span></div>
      <div>ISS retido pelos clientes<b>${moeda(s.mes_iss_retido)}</b><span>eles recolhem</span></div>
      <div>A transmitir<b ${s.pendentes ? 'style="color:#d97706;"' : ''}>${s.pendentes}</b><span>rascunhos e rejeitadas</span></div>`;
    $('nsFiltros').innerHTML = FILTROS.map(([id, nome]) => `<button class="oc-filtro ${estado.filtro === id ? 'ativo' : ''}" data-ns-filtro="${id}">${nome}</button>`).join('');
    $('nsTabela').innerHTML = r.notas.length ? `<table class="edi-tabela"><thead><tr><th>NFS-e</th><th>Data</th><th>Tomador</th><th class="n">Valor</th><th class="n">ISS</th><th>Situação</th><th></th></tr></thead><tbody>
      ${r.notas.map((n) => `<tr><td><b>${n.numero_nfse ? `Nº ${esc(n.numero_nfse)}` : `Rascunho #${n.id}`}</b>${n.numero_dps ? `<br><small style="color:var(--texto-fraco);">DPS ${n.serie}/${n.numero_dps}</small>` : ''}
          ${n.demonstracao ? '<br><small style="color:var(--azul);">demonstração</small>' : Number(n.ambiente) === 2 && n.numero_dps ? '<br><small style="color:var(--amarelo);">homologação</small>' : ''}</td>
        <td>${dataHora(n.autorizada_em || n.criado_em)}</td>
        <td><b>${esc(n.tomador_nome)}</b><br><small style="color:var(--texto-fraco);">${esc(docFmt(n.tomador_doc))}</small></td>
        <td class="n"><b>${moeda(n.valor)}</b></td>
        <td class="n">${n.iss_valor != null ? moeda(n.iss_valor) : '—'}${n.iss_retido ? '<br><small style="color:var(--texto-fraco);">retido</small>' : ''}</td>
        <td><span class="oc-sit ${STATUS[n.status][1]}">${STATUS[n.status][0]}</span>${n.fatura_numero ? `<br><small>fatura ${esc(n.fatura_numero)}</small>` : ''}
          ${n.motivo && ['rejeitada', 'erro'].includes(n.status) ? `<br><small style="color:var(--vermelho);">${esc(String(n.motivo).slice(0, 160))}</small>` : ''}</td>
        <td><div class="oc-linha-acoes"><button class="primario" data-ns-abrir="${n.id}">Abrir</button></div></td></tr>`).join('')}</tbody></table>`
      : `<div class="kanban-vazio">${estado.filtro === 'todas' ? 'Nenhuma NFS-e ainda. Use "＋ Nova NFS-e" — ou, no CT-e com origem e destino na mesma cidade, o sistema oferece trocar por NFS-e.' : 'Nada neste filtro.'}</div>`;
  }

  // ---------- Formulário ----------
  function formulario(n = null) {
    const d = n?.dados || {}; const t = d.tomador || {}; const en = t.end || {}; const s = d.servico || {}; const v = d.valores || {};
    const c = estado.config || {};
    const campo = (id, rotulo, valor, extra = '', classe = '') => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;
    $('nsModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🧾 ${n ? `NFS-e — rascunho #${n.id}` : 'Nova NFS-e (frete municipal)'}</h3><span style="cursor:pointer; font-size:18px;" data-ns-fechar>✕</span></div>
      ${n?.status === 'rejeitada' ? `<div class="cte-aviso erro" style="margin-top:10px;">Rejeitada: ${esc(n.motivo || '')}. Corrija e transmita de novo.</div>` : ''}
      ${d.cte_origem ? '<div class="cte-aviso" style="margin-top:10px;">Veio de um rascunho de CT-e com origem e destino na mesma cidade. Confira o valor do frete. Quando a NFS-e for autorizada, o rascunho de CT-e é apagado.</div>' : ''}
      <div class="cte-secao" style="margin-top:12px;"><h4>Tomador (quem paga o frete)</h4><div class="cte-grade">
        <div class="campo largo" style="position:relative;"><label for="nsNome">Nome / razão social (busca no cadastro)</label><input id="nsNome" class="cte-entrada" maxlength="200" autocomplete="off" value="${esc(t.nome || '')}" />
          <div id="nsSug" class="oculto" style="position:absolute; z-index:5; left:0; right:0; top:100%; background:var(--bg-card); border:1px solid var(--borda); border-radius:8px; max-height:220px; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.25);"></div></div>
        ${campo('nsDoc', 'CNPJ / CPF', docFmt(t.doc), 'maxlength="18"')}
        ${campo('nsIm', 'Inscrição municipal (se tiver)', t.im, 'maxlength="15"')}
        ${campo('nsEmail', 'E-mail', t.email, 'maxlength="80"')}
        ${campo('nsCep', 'CEP', en.cep, 'maxlength="9"')}
        ${campo('nsLgr', 'Endereço', en.xLgr, 'maxlength="255"', 'largo')}
        ${campo('nsNro', 'Número', en.nro, 'maxlength="60"')}
        ${campo('nsBairro', 'Bairro', en.xBairro, 'maxlength="60"')}
        ${campo('nsMun', 'Município', en.xMun, 'maxlength="120"')}
        ${campo('nsCmun', 'Código IBGE', en.cMun, 'maxlength="7" inputmode="numeric"')}
        ${campo('nsUf', 'UF', en.uf, 'maxlength="2" style="text-transform:uppercase;"')}
      </div></div>
      <div class="cte-secao"><h4>Serviço</h4><div class="cte-grade">
        <div class="campo inteiro"><label for="nsDesc">Descrição do serviço</label><textarea id="nsDesc" class="cte-entrada" rows="3" maxlength="2000">${esc(s.descricao || c.descricao_padrao || '')}</textarea></div>
        <div class="campo inteiro"><label for="nsInfo">Informações complementares (NF-e transportadas, pedido...)</label><textarea id="nsInfo" class="cte-entrada" rows="2" maxlength="2000">${esc(s.informacoes || '')}</textarea></div>
        ${campo('nsCompet', 'Competência (data do serviço)', d.competencia || hoje(), 'type="date"')}
        ${campo('nsRef', 'Documento de referência (opcional)', s.docRef, 'maxlength="255"')}
      </div></div>
      <div class="cte-secao"><h4>Valores</h4><div class="cte-grade">
        ${campo('nsValor', 'Valor do frete (R$)', v.vServ ? fmt(v.vServ) : '', 'inputmode="decimal"')}
        ${campo('nsDescIncond', 'Desconto incondicional (R$)', v.descontoIncond ? fmt(v.descontoIncond) : '', 'inputmode="decimal"')}
        ${campo('nsAliq', 'Alíquota do ISS (%)', v.pAliq != null ? fmt(v.pAliq) : (c.aliquota != null ? fmt(c.aliquota) : ''), 'inputmode="decimal"')}
        <div class="campo"><label style="display:flex; gap:8px; align-items:center; margin-top:22px;"><input type="checkbox" id="nsRetido" ${v.issRetido ? 'checked' : ''} style="width:auto;" /> ISS retido pelo tomador</label></div>
      </div><div id="nsCalc" style="font-size:13px; color:var(--texto-fraco);"></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-secundario" data-ns-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-secundario" id="nsSalvar" style="width:auto;">Salvar rascunho</button>
        <button class="btn btn-primario" id="nsTransmitir" style="width:auto;">📤 Transmitir</button></div>`;
    modal.classList.remove('oculto');
    const calc = () => {
      const valor = (lerNum($('nsValor').value) || 0) - (lerNum($('nsDescIncond').value) || 0);
      const aliq = lerNum($('nsAliq').value);
      const iss = aliq ? Math.round(valor * aliq) / 100 : null;
      $('nsCalc').innerHTML = valor > 0 ? `Base: <b>${moeda(valor)}</b>${iss != null ? ` · ISS estimado: <b>${moeda(iss)}</b>${$('nsRetido').checked ? ` (retido pelo cliente) · a receber: <b>${moeda(valor - iss)}</b>` : ''}` : ''}. O valor final do ISS vem do Sistema Nacional, pelo cadastro do município.` : '';
    };
    ['nsValor', 'nsDescIncond', 'nsAliq'].forEach((id) => $(id).addEventListener('input', calc)); $('nsRetido').addEventListener('change', calc); calc();
    ligarBusca();
    const corpo = () => ({
      competencia: $('nsCompet').value,
      tomador: { nome: $('nsNome').value, doc: $('nsDoc').value, im: $('nsIm').value, email: $('nsEmail').value,
        end: { cep: $('nsCep').value, xLgr: $('nsLgr').value, nro: $('nsNro').value, xBairro: $('nsBairro').value, xMun: $('nsMun').value, cMun: $('nsCmun').value, uf: $('nsUf').value } },
      servico: { descricao: $('nsDesc').value, informacoes: $('nsInfo').value, docRef: $('nsRef').value, notas: d.servico?.notas || [] },
      valores: { vServ: lerNum($('nsValor').value), descontoIncond: lerNum($('nsDescIncond').value), pAliq: lerNum($('nsAliq').value), issRetido: $('nsRetido').checked },
      cte_origem: d.cte_origem || null,
    });
    let id = n?.id || null;
    const salvar = async () => { const r = id ? await api(`/${id}`, { method: 'PUT', body: JSON.stringify(corpo()) }) : await api('', { method: 'POST', body: JSON.stringify(corpo()) }); id = r.id; return r; };
    $('nsSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await salvar(); fechar(); await carregar(); mostrarAlerta('Rascunho salvo.', { tipo: 'sucesso' }); } catch (err) { erro(err); b.disabled = false; }
    });
    $('nsTransmitir').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        if (!(lerNum($('nsValor').value) > 0)) throw new Error('Informe o valor do frete.');
        if (estado.config?.ambiente === 1 && !estado.config?.demonstracao && !await confirmar('Transmitir esta NFS-e em PRODUÇÃO? Depois de autorizada ela tem valor fiscal.', { textoOk: 'Transmitir' })) { b.disabled = false; return; }
        await salvar();
        await transmitir(id);
      } catch (err) { erro(err); }
      b.disabled = false;
    });
    $('nsNome').focus();
  }

  async function transmitir(id) {
    const r = await api(`/${id}/transmitir`, { method: 'POST' });
    await carregar();
    if (r.status === 'autorizada') { mostrarAlerta(`NFS-e nº ${r.numero_nfse} autorizada.`, { tipo: 'sucesso' }); await abrir(id); }
    else await abrir(id);
    return r;
  }

  function ligarBusca() {
    const caixa = $('nsSug'); let achados = []; let t = null;
    const buscar = async () => {
      if (!document.body.contains(caixa)) return;
      const q = $('nsNome').value.trim();
      if (q.length < 3) { caixa.classList.add('oculto'); return; }
      achados = await apiFetch(`/api/coletas/clientes?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => []);
      if (!document.body.contains(caixa) || !Array.isArray(achados)) return;
      caixa.innerHTML = achados.map((k, i) => `<div data-ns-sug="${i}" style="padding:8px 10px; cursor:pointer; border-bottom:1px solid var(--borda); font-size:13px;"><b>${esc(k.nome)}</b> <small style="color:var(--texto-fraco);">${esc(docFmt(k.documento))} · ${esc(k.cidade || '')}/${esc(k.uf || '')}</small></div>`).join('');
      caixa.classList.toggle('oculto', !achados.length);
    };
    $('nsNome').addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 300); });
    $('nsNome').addEventListener('blur', () => setTimeout(() => caixa.classList.add('oculto'), 200));
    caixa.addEventListener('mousedown', (e) => {
      const el = e.target.closest('[data-ns-sug]'); if (!el) return;
      const k = achados[Number(el.dataset.nsSug)];
      $('nsNome').value = k.nome || ''; $('nsDoc').value = docFmt(k.documento); $('nsEmail').value = k.email || $('nsEmail').value;
      $('nsCep').value = k.cep || ''; $('nsLgr').value = k.logradouro || ''; $('nsNro').value = k.numero || ''; $('nsBairro').value = k.bairro || '';
      $('nsMun').value = k.cidade || ''; $('nsCmun').value = k.cod_municipio || ''; $('nsUf').value = k.uf || '';
      caixa.classList.add('oculto');
    });
  }

  // ---------- Detalhe ----------
  async function abrir(id) {
    const n = await api(`/${id}`);
    if (['rascunho', 'rejeitada'].includes(n.status)) { formulario(n); return; }
    const d = n.dados || {}; const s = d.servico || {};
    const [txt, cor] = STATUS[n.status];
    $('nsModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div><h3 style="margin:0;">🧾 ${n.numero_nfse ? `NFS-e nº ${esc(n.numero_nfse)}` : `NFS-e #${n.id}`} <span class="oc-sit ${cor}" style="vertical-align:middle;">${txt}</span></h3>
          <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:4px;">DPS ${n.serie || '—'}/${n.numero_dps || '—'} · ${n.demonstracao ? 'demonstração' : Number(n.ambiente) === 1 ? 'produção' : 'homologação'}${n.autorizada_em ? ` · autorizada ${dataHora(n.autorizada_em)}` : ''}</div></div>
        <span style="cursor:pointer; font-size:18px;" data-ns-fechar>✕</span></div>
      ${n.chave ? `<div style="font-family:monospace; font-size:13px; margin:10px 0;">${esc(n.chave.replace(/(\d{4})(?=\d)/g, '$1 '))}</div>` : ''}
      ${n.status === 'erro' ? `<div class="cte-aviso erro">Sem resposta do Sistema Nacional: ${esc(n.motivo || '')}. Clique em "Tentar de novo" — antes de reenviar, o sistema confere se a nota já foi gerada.</div>` : ''}
      ${n.status === 'cancelada' ? `<div class="cte-aviso erro">Cancelada em ${dataHora(n.cancelada_em)}: ${esc(n.motivo || '')}</div>` : ''}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-top:10px; font-size:13.5px; line-height:1.6;">
        <div><b>${esc(n.tomador_nome)}</b> · ${esc(docFmt(n.tomador_doc))}<br>${esc(s.descricao || '')}${s.informacoes ? `<br><i>${esc(s.informacoes)}</i>` : ''}</div>
        <div><table class="edi-tabela"><tbody>
          <tr><td>Valor do serviço</td><td class="n">${moeda(d.valores?.vServ)}</td></tr>
          ${Number(d.valores?.descontoIncond) > 0 ? `<tr><td>Desconto</td><td class="n">− ${moeda(d.valores.descontoIncond)}</td></tr>` : ''}
          <tr><td>ISS${n.iss_aliquota != null ? ` (${fmt(n.iss_aliquota)}%)` : ''}${n.iss_retido ? ' — retido pelo tomador' : ''}</td><td class="n">${n.iss_valor != null ? moeda(n.iss_valor) : '—'}</td></tr>
          <tr><th>A receber</th><th class="n">${moeda(n.valor_liquido)}</th></tr></tbody></table>
          ${n.fatura_numero ? `<small>Na fatura nº ${esc(n.fatura_numero)}.</small>` : n.status === 'autorizada' ? '<small>Ainda não faturada (aparece em Faturamento → A faturar).</small>' : ''}</div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:16px;">
        ${['erro', 'enviando'].includes(n.status) ? '<button class="btn btn-primario" id="nsDeNovo" style="width:auto;">🔁 Tentar de novo</button>' : ''}
        ${n.status === 'autorizada' ? '<button class="btn btn-secundario" id="nsCancelar" style="width:auto; color:var(--vermelho);">⛔ Cancelar NFS-e</button>' : ''}
        ${n.tem_xml ? `<a class="btn btn-secundario" href="${esc(link(`/${n.id}/xml`))}" style="width:auto; text-decoration:none;">⬇ XML</a>` : ''}
        ${['autorizada', 'cancelada'].includes(n.status) ? `<a class="btn btn-primario" href="${esc(link(`/${n.id}/danfse`))}" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">🖨 DANFSe</a>` : ''}</div>`;
    modal.classList.remove('oculto');
    $('nsDeNovo')?.addEventListener('click', () => transmitir(n.id).catch(erro));
    $('nsCancelar')?.addEventListener('click', async () => {
      const motivo = await pedirTexto('Motivo do cancelamento (pelo menos 15 letras). Ex.: valor do frete informado errado.', { titulo: `Cancelar a NFS-e nº ${n.numero_nfse}`, textoOk: 'Cancelar a NFS-e' });
      if (motivo == null) return;
      try {
        await api(`/${n.id}/cancelar`, { method: 'POST', body: JSON.stringify({ cMotivo: /n[aã]o prestad/i.test(motivo) ? '2' : /err/i.test(motivo) ? '1' : '9', motivo }) });
        await carregar(); await abrir(n.id); mostrarAlerta('NFS-e cancelada.', { tipo: 'sucesso' });
      } catch (err) { erro(err); }
    });
  }

  // ---------- Configuração (admin) ----------
  async function configurar() {
    const c = await api('/config');
    const campo = (id, rotulo, valor, extra = '', classe = '') => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;
    const sn = ['1', '2'].includes(String(c.crt));
    $('nsModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">⚙ NFS-e — configuração</h3><span style="cursor:pointer; font-size:18px;" data-ns-fechar>✕</span></div>
      <div class="cte-aviso" style="margin-top:12px;">A NFS-e sai pelo <b>emissor nacional</b> (Sistema Nacional NFS-e), com o mesmo certificado A1 do CT-e.
        O município da empresa (${esc(c.municipio || '?')}/${esc(c.uf || '')}, IBGE ${esc(c.codigo_municipio || '?')}) precisa ter aderido ao emissor nacional — confirme com a prefeitura ou o contador.
        Comece em <b>homologação</b> (produção restrita) e só depois mude para produção.</div>
      <div class="cte-grade" style="margin-top:12px;">
        <div class="campo"><label for="nsCfgAmb">Ambiente</label><select id="nsCfgAmb" class="cte-entrada"><option value="2">Homologação (produção restrita)</option><option value="1" ${c.ambiente === 1 ? 'selected' : ''}>Produção</option></select></div>
        ${campo('nsCfgSerie', 'Série da DPS', c.serie, 'inputmode="numeric"')}
        ${campo('nsCfgProx', 'Próximo número da DPS', c.proximo_dps, 'inputmode="numeric"')}
        ${campo('nsCfgIm', 'Inscrição municipal da empresa', c.inscricao_municipal, 'maxlength="15"')}
        ${campo('nsCfgTrib', 'Código de tributação nacional', c.cTribNac, 'maxlength="6" inputmode="numeric" title="160201 = outros serviços de transporte de natureza municipal (LC 116, item 16.02)"')}
        ${campo('nsCfgTribMun', 'Código de tributação municipal (opcional)', c.cTribMun, 'maxlength="3" inputmode="numeric"')}
        ${campo('nsCfgNbs', 'Código NBS (opcional)', c.cNBS, 'maxlength="9" inputmode="numeric"')}
        ${campo('nsCfgAliq', 'Alíquota do ISS no município (%)', c.aliquota != null ? fmt(c.aliquota) : '', 'inputmode="decimal" placeholder="ex.: 5,00"')}
        <div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="nsCfgInfAliq" ${c.informar_aliquota ? 'checked' : ''} style="width:auto;" /> Informar a alíquota na DPS (só se o município exigir — normalmente o Sistema Nacional usa a do cadastro do município)</label></div>
        ${sn ? `<div class="campo"><label for="nsCfgApur">Simples Nacional: apuração</label><select id="nsCfgApur" class="cte-entrada">
            <option value="1">Federais e ISS pelo Simples</option><option value="2" ${c.regApTribSN === '2' ? 'selected' : ''}>Federais pelo Simples, ISS por fora</option><option value="3" ${c.regApTribSN === '3' ? 'selected' : ''}>Tudo por fora do Simples</option></select></div>
          ${campo('nsCfgPtot', 'Simples: % aproximado de tributos (opcional)', c.pTotTribSN != null ? fmt(c.pTotTribSN) : '', 'inputmode="decimal"')}` : ''}
        <div class="campo inteiro"><label for="nsCfgDesc">Descrição padrão do serviço</label><textarea id="nsCfgDesc" class="cte-entrada" rows="2" maxlength="2000">${esc(c.descricao_padrao)}</textarea></div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ns-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="nsCfgSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('nsCfgSalvar').addEventListener('click', async () => {
      try {
        if ($('nsCfgAmb').value === '1' && c.ambiente !== 1 && !await confirmar('Mudar a NFS-e para PRODUÇÃO? As notas passam a ter valor fiscal.', { textoOk: 'Produção' })) return;
        await api('/config', { method: 'PUT', body: JSON.stringify({
          ambiente: $('nsCfgAmb').value, serie: $('nsCfgSerie').value, proximo_dps: $('nsCfgProx').value, inscricao_municipal: $('nsCfgIm').value,
          cTribNac: $('nsCfgTrib').value, cTribMun: $('nsCfgTribMun').value, cNBS: $('nsCfgNbs').value, aliquota: lerNum($('nsCfgAliq').value),
          informar_aliquota: $('nsCfgInfAliq').checked, regApTribSN: $('nsCfgApur')?.value, pTotTribSN: lerNum($('nsCfgPtot')?.value), descricao_padrao: $('nsCfgDesc').value,
        }) });
        fechar(); await montar(); mostrarAlerta('Configuração da NFS-e salva.', { tipo: 'sucesso' });
      } catch (err) { erro(err); }
    });
  }

  // Chamado pela tela do CT-e quando origem e destino são a mesma cidade.
  window.nexoNfse = {
    async doCte(cteId) {
      const n = await api(`/do-cte/${cteId}`, { method: 'POST' });
      document.querySelector('.cte-aba[data-cte-aba="nfse"]')?.click();
      await new Promise((r) => setTimeout(r, 400));
      await abrir(n.id);
    },
  };
})();
