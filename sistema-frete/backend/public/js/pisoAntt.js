// Piso mínimo de frete da ANTT (src/pisoAntt.js).
//  - PisoAntt.abrir(): coeficientes (resolução, vigência, grade por tabela/tipo/eixos, planilha,
//    colar do Excel), calculadora e histórico. Botões em Tabelas de preço e em Acerto de viagem.
//  - PisoAntt.blocoAcerto(a) / ligarBloco(): o quadro do piso no acerto com terceiro.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dec = (v, c) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c, useGrouping: false }));
  const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const podeEditar = () => usuario?.perfil === 'admin' || !!usuario?.pode_gerenciar_tabelas_preco;
  const json = async (url, opcoes = {}) => {
    const r = await apiFetch(url, opcoes.body instanceof FormData ? opcoes : { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro ao falar com o servidor.'), { dados: j });
    return j;
  };
  let cache = null;
  const situacao = async (forcar = false) => { if (!cache || forcar) cache = await json('/api/piso-antt'); return cache; };

  // ---------------- Tela de coeficientes ----------------
  async function abrir() {
    const s = await situacao(true);
    const editar = podeEditar();
    const mapa = {};
    s.coeficientes.forEach((c) => { mapa[`${c.tabela}|${c.tipo_carga}|${c.eixos}`] = c; });
    let tabelaAtual = 'A';
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay'; fundo.id = 'modalPisoAntt';
    const cfg = s.config;
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:1180px; width:100%; max-height:94vh; overflow-y:auto; padding:22px 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">⚖ Piso mínimo de frete da ANTT</h3><span style="cursor:pointer; font-size:18px;" title="Fechar (Esc)" data-pa-fechar>✕</span></div>
      <p style="font-size:12.5px; color:var(--texto-fraco); margin:6px 0 10px;">Piso da viagem = <b>km × CCD + CC</b> (Lei 13.703/2018). A ANTT muda os coeficientes por resolução (todo ano e quando o diesel sobe ou desce além do gatilho): copie os valores da resolução em vigor ou da calculadora oficial da ANTT. O frete do acerto com terceiro é conferido com o piso${cfg.bloquear_ciot ? ', e o CIOT não é declarado com frete abaixo dele' : ''}.</p>
      ${s.total ? '' : '<p class="mt-aviso" style="font-size:13px;">Nenhum coeficiente cadastrado ainda: o piso não é conferido. Baixe o modelo, preencha com a resolução da ANTT em vigor e importe (ou digite na grade).</p>'}
      <div style="display:flex; gap:6px; margin:8px 0 12px;">
        <button class="btn btn-primario" data-pa-aba="calc" style="width:auto;">Calculadora</button>
        <button class="btn btn-secundario" data-pa-aba="coef" style="width:auto;">Coeficientes${s.total ? ` (${s.total})` : ''}</button>
        <button class="btn btn-secundario" data-pa-aba="hist" style="width:auto;">Histórico</button></div>
      <div id="paCalc"></div>
      <div id="paCoef" class="oculto">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px;">
          <div class="campo"><label for="paRes">Resolução da ANTT</label><input id="paRes" maxlength="80" value="${esc(cfg.resolucao || '')}" placeholder="Ex.: Resolução ANTT nº 6.xxx/2026" ${editar ? '' : 'disabled'} /></div>
          <div class="campo"><label for="paVig">Vigência desde</label><input id="paVig" type="date" value="${esc(cfg.vigencia || '')}" ${editar ? '' : 'disabled'} /></div>
          <div class="campo"><label for="paFator">Fator do retorno vazio</label><input id="paFator" inputmode="decimal" value="${esc(dec(cfg.fator_retorno, 2))}" title="Retorno vazio: fator × km de volta × CCD" ${editar ? '' : 'disabled'} /></div>
          <div class="campo" style="display:flex; align-items:flex-end;"><label style="display:flex; gap:6px; align-items:center; font-size:13px;"><input type="checkbox" id="paBloq" style="width:auto;" ${cfg.bloquear_ciot ? 'checked' : ''} ${editar ? '' : 'disabled'} /> Não declarar CIOT com frete abaixo do piso</label></div>
        </div>
        ${cfg.atualizado_em ? `<small style="color:var(--texto-fraco);">Gravado por ${esc(cfg.atualizado_por || '—')} em ${new Date(cfg.atualizado_em).toLocaleString('pt-BR')}.</small>` : ''}
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin:10px 0 8px;">
          ${Object.keys(s.tabelas).map((t) => `<button class="btn ${t === 'A' ? 'btn-primario' : 'btn-secundario'}" data-pa-tab="${t}" style="width:auto; padding:6px 12px;" title="${esc(s.tabelas[t])}">Tabela ${t}</button>`).join('')}
          <span id="paTabNome" style="font-size:12.5px; color:var(--texto-fraco); margin-left:6px;"></span>
          <span style="margin-left:auto; display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-secundario" id="paModelo" style="width:auto;">⬇ Planilha modelo</button>
            ${editar ? `<button class="btn btn-secundario" id="paImportar" style="width:auto;">⬆ Importar planilha</button><input type="file" id="paArquivo" accept=".xlsx,.xls,.csv" style="display:none;" />
            <button class="btn btn-secundario" id="paColar" style="width:auto;">📋 Colar do Excel</button>` : ''}</span></div>
        <div id="paColarCaixa" class="oculto" style="margin-bottom:8px;"><textarea id="paTexto" rows="6" style="width:100%; font-family:monospace; font-size:12px;" placeholder="Cole aqui as colunas Tabela, Tipo de carga, Eixos, CCD, CC (com ou sem a linha de títulos)"></textarea>
          <button class="btn btn-secundario" id="paLerColado" style="width:auto; margin-top:6px;">Conferir e pôr na grade</button></div>
        <div id="paGrade" style="overflow:auto; border:1px solid var(--borda); border-radius:8px;"></div>
        <p style="font-size:12px; color:var(--texto-fraco); margin:6px 0;">Em cada célula: <b>CCD</b> (R$/km, em cima) e <b>CC</b> (R$, embaixo). Em branco = sem piso para essa combinação.</p>
        ${editar ? '<div style="display:flex; justify-content:flex-end;"><button class="btn btn-primario" id="paGravar" style="width:auto;">Gravar coeficientes</button></div>' : ''}
      </div>
      <div id="paHist" class="oculto"></div>
    </div>`;
    document.body.appendChild(fundo);
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', teclado); };
    const teclado = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', teclado);
    fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
    fundo.addEventListener('click', (e) => { if (e.target.closest('[data-pa-fechar]')) fechar(); });

    // Lê o que está digitado na grade da tabela visível para o mapa.
    const guardarGrade = () => {
      fundo.querySelectorAll('[data-pa-cel]').forEach((cel) => {
        const [tipo, eixos] = cel.dataset.paCel.split('|');
        const ccd = cel.querySelector('.pa-ccd').value.trim(); const cc = cel.querySelector('.pa-cc').value.trim();
        const k = `${tabelaAtual}|${tipo}|${eixos}`;
        if (!ccd && !cc) delete mapa[k]; else mapa[k] = { tabela: tabelaAtual, tipo_carga: tipo, eixos: Number(eixos), ccd, cc };
      });
    };
    const desenharGrade = () => {
      $('paTabNome').textContent = s.tabelas[tabelaAtual];
      const inp = (cls, v, ph) => `<input class="${cls}" value="${esc(v)}" placeholder="${ph}" inputmode="decimal" style="width:76px; padding:3px 5px; font-size:12px; text-align:right;" ${editar ? '' : 'disabled'} />`;
      $('paGrade').innerHTML = `<table class="edi-tabela" style="font-size:12.5px; min-width:900px;"><thead><tr><th style="text-align:left; min-width:210px;">Tipo de carga</th>${s.eixos.map((e) => `<th>${e} eixos</th>`).join('')}</tr></thead><tbody>
        ${Object.entries(s.tipos).map(([tipo, nome]) => `<tr><td>${esc(nome)}</td>${s.eixos.map((e) => {
          const c = mapa[`${tabelaAtual}|${tipo}|${e}`];
          const ccd = c ? (typeof c.ccd === 'number' ? dec(c.ccd, 4) : c.ccd) : ''; const cc = c ? (typeof c.cc === 'number' ? dec(c.cc, 2) : c.cc) : '';
          return `<td data-pa-cel="${tipo}|${e}" style="text-align:center; padding:3px;">${inp('pa-ccd', ccd, 'CCD')}<br>${inp('pa-cc', cc, 'CC')}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table>`;
    };
    fundo.querySelectorAll('[data-pa-tab]').forEach((b) => b.addEventListener('click', () => {
      guardarGrade(); tabelaAtual = b.dataset.paTab;
      fundo.querySelectorAll('[data-pa-tab]').forEach((x) => { x.className = `btn ${x === b ? 'btn-primario' : 'btn-secundario'}`; });
      desenharGrade();
    }));
    fundo.querySelectorAll('[data-pa-aba]').forEach((b) => b.addEventListener('click', () => {
      fundo.querySelectorAll('[data-pa-aba]').forEach((x) => { x.className = `btn ${x === b ? 'btn-primario' : 'btn-secundario'}`; });
      ['calc', 'coef', 'hist'].forEach((a) => $(`pa${a[0].toUpperCase()}${a.slice(1)}`).classList.toggle('oculto', a !== b.dataset.paAba));
      if (b.dataset.paAba === 'hist') historico();
    }));
    desenharGrade();
    calculadora($('paCalc'), s);

    $('paModelo').addEventListener('click', async () => {
      const r = await apiFetch('/api/piso-antt/modelo');
      if (!r.ok) { mostrarAlerta('Não consegui gerar a planilha.', { tipo: 'erro' }); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'coeficientes-piso-antt.xlsx';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    const aplicarLidas = (r) => {
      guardarGrade();
      r.linhas.forEach((l) => { mapa[`${l.tabela}|${l.tipo_carga}|${l.eixos}`] = l; });
      desenharGrade();
      mostrarAlerta(`${r.linhas.length} coeficiente(s) postos na grade. Confira, informe a resolução e a vigência e clique em Gravar.${r.erros.length ? ` Linhas com problema (ficaram de fora): ${r.erros.slice(0, 5).join('; ')}${r.erros.length > 5 ? '…' : ''}` : ''}`,
        { tipo: r.erros.length ? 'aviso' : 'sucesso' });
    };
    $('paImportar')?.addEventListener('click', () => $('paArquivo').click());
    $('paArquivo')?.addEventListener('change', async (e) => {
      const arq = e.target.files[0]; e.target.value = ''; if (!arq) return;
      const fd = new FormData(); fd.append('arquivo', arq);
      try { aplicarLidas(await json('/api/piso-antt/ler', { method: 'POST', body: fd })); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
    $('paColar')?.addEventListener('click', () => { $('paColarCaixa').classList.toggle('oculto'); $('paTexto').focus(); });
    $('paLerColado')?.addEventListener('click', async () => {
      try { aplicarLidas(await json('/api/piso-antt/ler', { method: 'POST', body: JSON.stringify({ texto: $('paTexto').value }) })); $('paColarCaixa').classList.add('oculto'); $('paTexto').value = ''; } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
    $('paGravar')?.addEventListener('click', async (ev) => {
      guardarGrade();
      const b = ev.currentTarget; b.disabled = true;
      try {
        const r = await json('/api/piso-antt', { method: 'PUT', body: JSON.stringify({ linhas: Object.values(mapa), resolucao: $('paRes').value, vigencia: $('paVig').value, fator_retorno: $('paFator').value, bloquear_ciot: $('paBloq').checked }) });
        cache = null;
        mostrarAlerta(`${r.gravados} coeficiente(s) gravados${r.config.resolucao ? ` (${r.config.resolucao})` : ''}. Os próximos acertos já usam estes valores; os acertos já gravados guardam os coeficientes do dia.`, { tipo: 'sucesso' });
        fechar(); abrir().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
      } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); b.disabled = false; }
    });

    async function historico() {
      const caixa = $('paHist');
      const lista = await json('/api/piso-antt/historico').catch(() => []);
      caixa.innerHTML = lista.length ? `<table class="edi-tabela" style="font-size:12.5px; width:100%;"><thead><tr><th>Quando</th><th style="text-align:left;">Quem</th><th style="text-align:left;">Resolução</th><th>Vigência</th><th>Coeficientes</th><th>Retorno vazio</th></tr></thead><tbody>
        ${lista.map((h) => `<tr><td>${new Date(h.criado_em).toLocaleString('pt-BR')}</td><td>${esc(h.usuario_nome || '')}</td><td>${esc(h.resolucao || '—')}</td><td style="text-align:center;">${dataBr(h.vigencia)}</td><td style="text-align:center;">${h.total}</td><td style="text-align:center;">${dec(h.fator_retorno, 2)}</td></tr>`).join('')}</tbody></table>`
        : '<p style="color:var(--texto-fraco);">Nenhuma gravação ainda.</p>';
    }
  }

  // Calculadora (tela de coeficientes): tabela, tipo, eixos, km e retorno vazio.
  function calculadora(alvo, s) {
    alvo.innerHTML = `${campos('pc', {}, s)}<div id="pcRes" style="margin-top:10px;"></div>`;
    ligarCampos('pc', s, (r) => {
      if (!$('pcRes')) return;   // janela já fechada
      $('pcRes').innerHTML = !r ? '' : r.erro ? `<p style="color:var(--texto-fraco); font-size:13px;">${esc(r.erro)}</p>`
        : `<div class="painel" style="padding:12px 14px;"><div style="font-size:13px; color:var(--texto-fraco);">Piso mínimo da viagem</div><div style="font-size:24px; font-weight:700;">${brl(r.piso)}</div>
          <div style="font-size:12.5px;">${esc(r.explicacao)}</div><small style="color:var(--texto-fraco);">${esc(r.resolucao || '')}${r.vigencia ? ` · vigência ${dataBr(r.vigencia)}` : ''} · o vale-pedágio é pago à parte e não entra no piso.</small></div>`;
    });
  }

  // Campos do piso (usados na calculadora e no acerto). p = prefixo dos ids; v = valores.
  function campos(p, v, s) {
    const sel = (id, opcoes, atual, vazio) => `<select id="${p}${id}"><option value="">${vazio}</option>${opcoes.map(([k, n]) => `<option value="${k}" ${String(atual ?? '') === String(k) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    return `<div class="cte-grade">
      <div class="campo largo"><label for="${p}Tab">Tabela da ANTT</label>${sel('Tab', Object.entries(s.tabelas), v.tabela, '— escolha —')}</div>
      <div class="campo largo"><label for="${p}Tipo">Tipo de carga</label>${sel('Tipo', Object.entries(s.tipos), v.tipo_carga, '— escolha —')}</div>
      <div class="campo"><label for="${p}Eixos">Eixos (veículo + implemento)</label>${sel('Eixos', s.eixos.map((e) => [e, `${e} eixos`]), v.eixos, '—')}</div>
      <div class="campo"><label for="${p}Ori">Origem (cidade/UF)</label><input id="${p}Ori" maxlength="80" value="${esc(v.origem || '')}" placeholder="Campinas/SP" /></div>
      <div class="campo"><label for="${p}Des">Destino (cidade/UF)</label><input id="${p}Des" maxlength="80" value="${esc(v.destino || '')}" placeholder="Curitiba/PR" /></div>
      <div class="campo"><label for="${p}Km">Distância (km)</label><div style="display:flex; gap:4px;"><input id="${p}Km" inputmode="decimal" value="${esc(v.km != null ? dec(v.km, 1) : '')}" /><button type="button" class="btn btn-secundario" id="${p}CalcKm" style="width:auto; padding:4px 8px;" title="Calcular a distância pela rota entre a origem e o destino">📏</button></div></div>
      <div class="campo"><label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="${p}Ret" style="width:auto;" ${v.retorno_vazio ? 'checked' : ''} /> Retorno vazio</label><input id="${p}KmRet" inputmode="decimal" value="${esc(v.km_retorno != null ? dec(v.km_retorno, 1) : '')}" placeholder="km da volta (= ida)" /></div>
    </div><small id="${p}KmFonte" style="color:var(--texto-fraco);"></small>`;
  }
  function lerCampos(p) {
    return { tabela: $(`${p}Tab`).value, tipo_carga: $(`${p}Tipo`).value, eixos: $(`${p}Eixos`).value, km: $(`${p}Km`).value, origem: $(`${p}Ori`).value, destino: $(`${p}Des`).value,
      retorno_vazio: $(`${p}Ret`).checked, km_retorno: $(`${p}KmRet`).value };
  }
  const numero = (v) => { let t = String(v || '').trim(); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); return Number(t) || 0; };
  function ligarCampos(p, s, mostrar) {
    let tempo = null;
    const recalcular = async () => {
      const c = lerCampos(p);
      if (!c.tabela || !c.tipo_carga || !c.eixos || !(numero(c.km) > 0)) { mostrar(null); return; }
      const q = new URLSearchParams({ tabela: c.tabela, tipo_carga: c.tipo_carga, eixos: c.eixos, km: numero(c.km), retorno_vazio: c.retorno_vazio, km_retorno: numero(c.km_retorno) || '' });
      try { mostrar(await json(`/api/piso-antt/calcular?${q}`)); } catch (err) { mostrar({ erro: err.message }); }
    };
    ['Tab', 'Tipo', 'Eixos', 'Km', 'Ret', 'KmRet'].forEach((k) => {
      const el = $(`${p}${k}`);
      el.addEventListener('change', recalcular);
      el.addEventListener('input', () => { clearTimeout(tempo); tempo = setTimeout(recalcular, 400); });
    });
    $(`${p}CalcKm`).addEventListener('click', async () => {
      const parte = (t) => { const m = String(t || '').split('/'); return [m[0]?.trim(), (m[1] || '').trim().toUpperCase()]; };
      const [oc, ou] = parte($(`${p}Ori`).value); const [dc, du] = parte($(`${p}Des`).value);
      if (!oc || !ou || !dc || !du) { mostrarAlerta('Informe a origem e o destino como Cidade/UF (ex.: Campinas/SP).', { tipo: 'aviso' }); return; }
      try {
        const r = await json(`/api/piso-antt/distancia?${new URLSearchParams({ origem_cidade: oc, origem_uf: ou, destino_cidade: dc, destino_uf: du })}`);
        $(`${p}Km`).value = dec(r.km, 1);
        $(`${p}KmFonte`).textContent = `Distância ${r.origem} → ${r.destino}: ${dec(r.km, 1)} km (${r.fonte}). Confira com a rota real: a ANTT usa a distância percorrida.`;
        recalcular();
      } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    });
    recalcular();
    return recalcular;
  }

  // ---------------- No acerto com terceiro ----------------
  async function blocoAcerto(a) {
    let s;
    try { s = await situacao(); } catch { return ''; }
    const v = { tabela: a?.piso_tabela, tipo_carga: a?.piso_tipo_carga, eixos: a?.piso_eixos, km: a?.piso_km, origem: a?.piso_origem, destino: a?.piso_destino,
      retorno_vazio: a?.piso_retorno_vazio, km_retorno: a?.piso_km_retorno };
    return `<div class="cte-secao" id="axPiso"><h4>⚖ Piso mínimo da ANTT <button type="button" class="btn btn-secundario" id="axPisoCoef" style="width:auto; padding:2px 8px; font-size:12px; margin-left:6px;">coeficientes</button></h4>
      ${s.total ? '' : '<p class="edi-dica" style="margin:0 0 6px;">Nenhum coeficiente da ANTT cadastrado: o piso não é conferido. Cadastre em "coeficientes".</p>'}
      ${campos('axP', v, s)}<div id="axPisoRes" style="margin-top:8px;"></div></div>`;
  }
  // freteAtual: () => número do frete digitado. Devolve leitor dos campos para salvar.
  function ligarBloco(freteAtual) {
    if (!$('axPiso')) return () => ({});
    $('axPisoCoef').addEventListener('click', () => abrir().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })));
    let ultimo = null;
    const mostrar = (r) => {
      ultimo = r;
      const alvo = $('axPisoRes'); if (!alvo) return;
      if (!r) { alvo.innerHTML = '<small style="color:var(--texto-fraco);">Escolha a tabela, o tipo de carga, os eixos e a distância para conferir o frete com o piso.</small>'; return; }
      if (r.erro) { alvo.innerHTML = `<small style="color:var(--texto-fraco);">${esc(r.erro)}</small>`; return; }
      const frete = numero(freteAtual());
      const abaixo = frete > 0 && frete + 0.004 < r.piso;
      alvo.innerHTML = `<div style="padding:8px 12px; border-radius:8px; font-size:13px; background:${abaixo ? 'rgba(220,38,38,.10)' : 'rgba(22,163,74,.10)'}; border:1px solid ${abaixo ? 'rgba(220,38,38,.45)' : 'rgba(22,163,74,.4)'};">
        Piso da viagem: <b>${brl(r.piso)}</b> <small>(${esc(r.explicacao)})</small><br>
        ${frete > 0 ? (abaixo ? `<b style="color:var(--vermelho);">⚠ O frete contratado (${brl(frete)}) está ${brl(r.piso - frete)} abaixo do piso.</b> Pagar abaixo do piso dá multa para quem contrata${cache?.config?.bloquear_ciot ? ', e o CIOT não é declarado' : ''}.`
          : `<span style="color:var(--verde);">✓ Frete contratado (${brl(frete)}) acima do piso.</span>`) : 'Informe o frete contratado para conferir.'}</div>`;
    };
    ligarCampos('axP', cache, mostrar);
    $('axFrete')?.addEventListener('input', () => mostrar(ultimo));
    return () => {
      const c = lerCampos('axP');
      return { piso_tabela: c.tabela, piso_tipo_carga: c.tipo_carga, piso_eixos: c.eixos, piso_km: c.km, piso_origem: c.origem, piso_destino: c.destino, piso_retorno_vazio: c.retorno_vazio, piso_km_retorno: c.km_retorno };
    };
  }

  // Linha do piso no detalhe do acerto.
  function resumoAcerto(a) {
    const p = a.piso_conferencia;
    if (!p || a.tipo !== 'terceiro') return '';
    if (p.situacao === 'nao_conferido') return '<p style="font-size:12.5px; color:var(--texto-fraco);">⚖ Piso mínimo da ANTT não conferido (informe a tabela, o tipo de carga, os eixos e a distância em "Editar").</p>';
    const abaixo = p.situacao === 'abaixo';
    return `<p style="font-size:12.5px; padding:6px 10px; border-radius:8px; background:${abaixo ? 'rgba(220,38,38,.10)' : 'rgba(22,163,74,.10)'};">⚖ Piso ANTT: <b>${brl(p.piso)}</b>
      (tabela ${esc(a.piso_tabela)}, ${esc(cache?.tipos?.[a.piso_tipo_carga] || a.piso_tipo_carga || '').toLowerCase()}, ${esc(a.piso_eixos)} eixos, ${dec(a.piso_km, 1)} km${a.piso_retorno_vazio ? ', com retorno vazio' : ''}${a.piso_resolucao ? ` · ${esc(a.piso_resolucao)}` : ''}) ·
      ${abaixo ? `<b style="color:var(--vermelho);">frete ${brl(-p.diferenca)} abaixo do piso</b>` : '<span style="color:var(--verde);">frete acima do piso ✓</span>'}</p>`;
  }

  // Botão em Tabelas de preço.
  function botaoTabelas() {
    const ref = $('btnImprimirTabelasPreco');
    if (!ref || $('btnPisoAntt')) return;
    const b = document.createElement('button');
    b.id = 'btnPisoAntt'; b.className = 'btn btn-secundario'; b.style.width = 'auto';
    b.title = 'Coeficientes e calculadora do piso mínimo de frete da ANTT';
    b.textContent = '⚖ Piso ANTT';
    b.addEventListener('click', () => abrir().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })));
    ref.parentNode.insertBefore(b, ref);
  }
  botaoTabelas();

  window.PisoAntt = { abrir, blocoAcerto, ligarBloco, resumoAcerto, situacao };
})();
