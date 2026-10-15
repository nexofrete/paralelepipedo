// =====================================================================
// Cotações de frete (estilo SSW): cálculo pela tabela de preço da empresa,
// ajuste/desconto, proposta (PDF, e-mail, WhatsApp) e, aprovada, coleta e
// CT-e com o preço combinado.
// Usa do dashboard.js: usuario, token, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const nav = document.getElementById('navCotacoes');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');
  if (usuario?.perfil === 'admin') document.getElementById('ctConfig').classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v, c = 0) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: c }));
  const lerNum = (v) => { const t = String(v ?? '').trim(); if (!t) return 0; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : 0; };
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/cotacoes${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  };
  const modal = $('modalCotacao');
  const fecharModal = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-ct-fechar]')) fecharModal(); });

  const SIT = { aberta: ['Em aberto', 'pendente'], enviada: ['Enviada', 'em_transito'], aprovada: ['Aprovada', 'entregue'], recusada: ['Recusada', 'cancelado'],
    cancelada: ['Cancelada', 'cancelado'], vencida: ['Vencida', 'ocorrencia'] };
  const FILTROS = [['abertas', 'Em aberto'], ['vencidas', 'Vencidas'], ['aprovadas', 'Aprovadas'], ['recusadas', 'Recusadas'], ['todas', 'Todas']];
  let estado = { filtro: 'abertas', config: null };

  async function iniciar() {
    if (!estado.config) estado.config = await api('/config');
    await carregar();
  }
  nav.addEventListener('click', () => iniciar().catch(erro));
  let tempo = null;
  $('ctBusca').addEventListener('input', () => { clearTimeout(tempo); tempo = setTimeout(() => carregar().catch(erro), 350); });
  $('ctFiltros').addEventListener('click', (e) => { const b = e.target.closest('[data-ct-filtro]'); if (b) { estado.filtro = b.dataset.ctFiltro; carregar().catch(erro); } });
  $('ctNova').addEventListener('click', () => iniciar().then(() => formulario()).catch(erro));
  $('ctConfig').addEventListener('click', () => configurar().catch(erro));

  async function carregar() {
    const r = await api(`?${new URLSearchParams({ filtro: estado.filtro, busca: $('ctBusca').value.trim() })}`);
    const s = r.resumo;
    const conversao = s.mes_decididas ? Math.round((s.mes_aprovadas / s.mes_decididas) * 100) : null;
    $('ctResumo').innerHTML = `<div>Em aberto<b>${s.abertas}</b>${s.vencendo ? `<span style="color:#d97706;">${s.vencendo} vencendo em até 2 dias</span>` : ''}</div>
      <div>Valor em negociação<b>${moeda(s.valor_aberto)}</b></div>
      <div>Aprovadas no mês<b>${s.mes_aprovadas}</b><span>${moeda(s.mes_valor_aprovado)} de ${s.mes_total} cotação(ões)</span></div>
      <div>Conversão no mês<b>${conversao == null ? '—' : `${conversao}%`}</b><span>aprovadas ÷ decididas</span></div>`;
    $('ctFiltros').innerHTML = FILTROS.map(([id, nome]) => `<button class="oc-filtro ${estado.filtro === id ? 'ativo' : ''}" data-ct-filtro="${id}">${nome}</button>`).join('');
    $('ctTabela').innerHTML = r.cotacoes.length ? `<table class="edi-tabela"><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Trajeto</th><th>Carga</th><th class="n">Frete</th><th>Válida até</th><th>Situação</th><th></th></tr></thead><tbody>
      ${r.cotacoes.map((c) => `<tr><td><b>${c.id}</b></td><td>${dia(c.criado_em)}</td>
        <td><b>${esc(c.cliente_nome)}</b>${c.cliente_doc ? `<br><small style="color:var(--texto-fraco);">${esc(docFmt(c.cliente_doc))}</small>` : ''}</td>
        <td>${esc(c.origem_cidade)}/${esc(c.origem_uf)} → ${esc(c.destino_cidade)}/${esc(c.destino_uf)}</td>
        <td><small>${[c.peso_kg ? `${num(c.peso_kg, 1)} kg` : '', c.volumes ? `${num(c.volumes)} vol.` : ''].filter(Boolean).join(' · ')}</small></td>
        <td class="n"><b>${moeda(c.valor_total)}</b>${c.valor_tabela && Number(c.valor_tabela) > Number(c.valor_total) ? `<br><small style="color:var(--texto-fraco);">tabela ${moeda(c.valor_tabela)}</small>` : ''}</td>
        <td>${dia(c.validade)}</td>
        <td><span class="oc-sit ${SIT[c.situacao][1]}">${SIT[c.situacao][0]}</span>${c.coleta_id ? `<br><small>coleta nº ${c.coleta_id}</small>` : ''}${c.motivo ? `<br><small style="color:var(--texto-fraco);">${esc(c.motivo)}</small>` : ''}</td>
        <td><div class="oc-linha-acoes"><button class="primario" data-ct-abrir="${c.id}">Abrir</button></div></td></tr>`).join('')}</tbody></table>`
      : `<div class="kanban-vazio">${estado.filtro === 'abertas' ? 'Nenhuma cotação em aberto. Clique em "＋ Nova cotação" quando um cliente pedir preço.' : 'Nenhuma cotação neste filtro.'}</div>`;
  }
  $('ctTabela').addEventListener('click', (e) => { const b = e.target.closest('[data-ct-abrir]'); if (b) abrir(Number(b.dataset.ctAbrir)).catch(erro); });

  // ---------- Formulário ----------
  function formulario(c = null, { duplicar = false } = {}) {
    const v = (k) => esc(c?.[k] ?? '');
    const editar = c && !duplicar;
    const origem = estado.config?.origem || {};
    $('ctModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">${editar ? `💲 Cotação ${c.id}` : '💲 Nova cotação'}</h3><span style="cursor:pointer; font-size:18px;" data-ct-fechar>✕</span></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:18px; margin-top:12px;">
      <div>
        <div class="cte-secao"><h4>Cliente</h4><div class="cte-grade">
          <div class="campo largo" style="position:relative;"><label for="cqCliente">Nome ou CNPJ (busca no cadastro)</label><input id="cqCliente" maxlength="200" autocomplete="off" value="${v('cliente_nome')}" />
            <div id="cqSug" class="oculto" style="position:absolute; z-index:5; left:0; right:0; top:100%; background:var(--bg-card); border:1px solid var(--borda); border-radius:8px; max-height:220px; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.25);"></div></div>
          <div class="campo"><label for="cqDoc">CNPJ / CPF</label><input id="cqDoc" maxlength="18" value="${esc(docFmt(c?.cliente_doc))}" /></div>
          <div class="campo"><label for="cqPapel">O cliente é</label><select id="cqPapel"><option value="remetente">Remetente (paga — CIF)</option><option value="destinatario" ${c?.cliente_papel === 'destinatario' ? 'selected' : ''}>Destinatário (paga — FOB)</option></select></div>
          <div class="campo"><label for="cqContato">A/C (contato)</label><input id="cqContato" maxlength="120" value="${v('contato_nome')}" /></div>
          <div class="campo"><label for="cqEmail">E-mail</label><input id="cqEmail" type="email" maxlength="250" value="${v('email')}" /></div>
          <div class="campo"><label for="cqFone">WhatsApp / telefone</label><input id="cqFone" maxlength="30" value="${v('telefone')}" /></div>
        </div></div>
        <div class="cte-secao"><h4>Trajeto</h4><div class="cte-grade">
          <div class="campo"><label for="cqOriCid">Origem</label><input id="cqOriCid" maxlength="120" value="${esc(c?.origem_cidade ?? origem.cidade ?? '')}" /></div>
          <div class="campo"><label for="cqOriUf">UF</label><input id="cqOriUf" maxlength="2" style="text-transform:uppercase;" value="${esc(c?.origem_uf ?? origem.uf ?? '')}" /></div>
          <div class="campo"><label for="cqDesCid">Destino</label><input id="cqDesCid" maxlength="120" value="${v('destino_cidade')}" /></div>
          <div class="campo"><label for="cqDesUf">UF</label><input id="cqDesUf" maxlength="2" style="text-transform:uppercase;" value="${v('destino_uf')}" /></div>
          <div class="campo"><label for="cqDesBairro">Bairro (se a tabela separa)</label><input id="cqDesBairro" maxlength="120" value="${v('destino_bairro')}" /></div>
        </div></div>
        <div class="cte-secao"><h4>Carga</h4><div class="cte-grade">
          <div class="campo"><label for="cqPeso">Peso (kg)</label><input id="cqPeso" inputmode="decimal" value="${c?.peso_kg != null ? esc(num(c.peso_kg, 3)) : ''}" /></div>
          <div class="campo"><label for="cqVol">Volumes</label><input id="cqVol" inputmode="numeric" value="${v('volumes')}" /></div>
          <div class="campo"><label for="cqCub">Cubagem (m³)</label><input id="cqCub" inputmode="decimal" value="${c?.cubagem_m3 != null ? esc(num(c.cubagem_m3, 3)) : ''}" /></div>
          <div class="campo"><label for="cqValor">Valor da mercadoria (R$)</label><input id="cqValor" inputmode="decimal" value="${c?.valor_mercadoria != null ? esc(num(c.valor_mercadoria, 2)) : ''}" /></div>
          <div class="campo largo"><label for="cqProduto">Produto</label><input id="cqProduto" maxlength="120" value="${v('produto')}" /></div>
        </div></div>
      </div>
      <div>
        <div class="cte-secao"><h4 style="display:flex; justify-content:space-between; align-items:center;">Frete <button class="btn btn-secundario" id="cqCalcular" style="width:auto; padding:6px 12px;">🧮 Calcular pela tabela</button></h4>
          <div id="cqExplica" style="font-size:12px; color:var(--texto-fraco); margin-bottom:8px;">${c?.explicacao ? esc(c.explicacao) : 'Preencha destino e carga e clique em Calcular. Você pode mudar os valores, dar desconto ou lançar à mão.'}</div>
          <table class="edi-tabela" id="cqComps"><thead><tr><th>Componente</th><th class="n">Valor (R$)</th><th></th></tr></thead><tbody></tbody></table>
          <div style="display:flex; gap:8px; align-items:center; margin:8px 0; flex-wrap:wrap;">
            <button class="btn btn-secundario" id="cqLinha" style="width:auto; padding:5px 10px;">＋ Linha</button>
            <span style="flex:1;"></span>
            <label for="cqDesc" style="font-size:12.5px;">Desconto %</label><input id="cqDesc" class="cte-entrada" inputmode="decimal" style="width:70px;" />
            <button class="btn btn-secundario" id="cqAplicarDesc" style="width:auto; padding:5px 10px;">Aplicar</button>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:baseline; border-top:1px solid var(--borda); padding-top:10px;">
            <span>Total do frete<br><small id="cqTabela" style="color:var(--texto-fraco);"></small></span><b id="cqTotal" style="font-size:24px;"></b></div>
        </div>
        <div class="cte-secao"><h4>Proposta</h4><div class="cte-grade">
          <div class="campo"><label for="cqPrazo">Prazo (dias úteis)</label><input id="cqPrazo" inputmode="numeric" value="${v('prazo_dias')}" /></div>
          <div class="campo"><label for="cqValidade">Válida até</label><input id="cqValidade" type="date" value="${editar ? esc(String(c.validade).slice(0, 10)) : ''}" /></div>
          <div class="campo inteiro"><label for="cqObs">Observação na proposta</label><textarea id="cqObs" rows="2" maxlength="2000">${v('observacao')}</textarea></div>
        </div></div>
      </div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ct-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="cqSalvar" style="width:auto;">${editar ? 'Salvar' : 'Salvar cotação'}</button></div>`;
    modal.classList.remove('oculto');
    let calculo = { valor_tabela: c?.valor_tabela ?? null, tabela_nome: c?.tabela_nome ?? null, explicacao: c?.explicacao ?? null };
    if (!editar) { const d = new Date(); d.setDate(d.getDate() + (estado.config?.validade_dias || 10)); $('cqValidade').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

    const corpoComps = $('cqComps').querySelector('tbody');
    const linha = (x = {}) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="cq-nome cte-entrada" maxlength="15" style="width:100%; text-transform:uppercase;" value="${esc(x.xNome || '')}" aria-label="Componente" /></td>
        <td class="n"><input class="cq-valor cte-entrada" inputmode="decimal" style="width:110px; text-align:right;" value="${x.vComp != null ? esc(Number(x.vComp).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : ''}" aria-label="Valor" /></td>
        <td><button type="button" class="cq-tirar" title="Tirar" style="border:0; background:none; color:var(--texto-fraco); cursor:pointer;">✕</button></td>`;
      corpoComps.appendChild(tr);
    };
    const componentes = () => [...corpoComps.querySelectorAll('tr')].map((tr) => ({ xNome: tr.querySelector('.cq-nome').value.trim().toUpperCase(), vComp: Math.round(lerNum(tr.querySelector('.cq-valor').value) * 100) / 100 }))
      .filter((x) => x.xNome && x.vComp > 0);
    const totalizar = () => {
      const t = componentes().reduce((s, x) => s + x.vComp, 0);
      $('cqTotal').textContent = moeda(t);
      const tab = Number(calculo.valor_tabela) || 0;
      $('cqTabela').textContent = tab ? `pela tabela${calculo.tabela_nome ? ` "${calculo.tabela_nome}"` : ''}: ${moeda(tab)}${tab > t + 0.004 ? ` · desconto de ${moeda(tab - t)} (${num(((tab - t) / tab) * 100, 1)}%)` : ''}` : '';
    };
    (c?.componentes || []).forEach(linha);
    if (!corpoComps.children.length) linha({ xNome: 'FRETE PESO' });
    totalizar();
    corpoComps.addEventListener('input', totalizar);
    corpoComps.addEventListener('click', (e) => { if (e.target.closest('.cq-tirar')) { e.target.closest('tr').remove(); totalizar(); } });
    $('cqLinha').addEventListener('click', () => linha());
    $('cqAplicarDesc').addEventListener('click', () => {
      const p = lerNum($('cqDesc').value);
      if (!(p > 0 && p < 100)) { mostrarAlerta('Informe o desconto em % (ex.: 5).', { tipo: 'aviso' }); return; }
      // O desconto sai do frete peso (o principal), como no SSW.
      const tr = [...corpoComps.querySelectorAll('tr')].find((x) => x.querySelector('.cq-nome').value.trim().toUpperCase() === 'FRETE PESO') || corpoComps.querySelector('tr');
      const total = componentes().reduce((s, x) => s + x.vComp, 0);
      const campo = tr.querySelector('.cq-valor');
      const novo = Math.max(lerNum(campo.value) - (total * p) / 100, 0);
      campo.value = novo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      $('cqDesc').value = ''; totalizar();
    });
    const dadosCarga = () => ({ destino_cidade: $('cqDesCid').value, destino_uf: $('cqDesUf').value, destino_bairro: $('cqDesBairro').value, peso_kg: $('cqPeso').value,
      volumes: $('cqVol').value, cubagem_m3: $('cqCub').value, valor_mercadoria: $('cqValor').value, cliente_nome: $('cqCliente').value });
    $('cqCalcular').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await api('/calcular', { method: 'POST', body: JSON.stringify(dadosCarga()) });
        calculo = { valor_tabela: r.total, tabela_nome: r.tabela_nome, explicacao: r.explicacao };
        corpoComps.innerHTML = ''; r.componentes.forEach(linha);
        if (r.prazo_dias) $('cqPrazo').value = r.prazo_dias;
        $('cqExplica').textContent = `${r.explicacao || ''}${r.cidade_usada ? ` · praça ${r.cidade_usada}` : ''}`;
        totalizar();
      } catch (err) { erro(err); }
      b.disabled = false;
    });
    ligarBuscaCliente();
    $('cqSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const corpo = {
          cliente_nome: $('cqCliente').value, cliente_doc: $('cqDoc').value, cliente_papel: $('cqPapel').value, contato_nome: $('cqContato').value, email: $('cqEmail').value, telefone: $('cqFone').value,
          origem_cidade: $('cqOriCid').value, origem_uf: $('cqOriUf').value, ...dadosCarga(), produto: $('cqProduto').value,
          componentes: componentes(), valor_tabela: calculo.valor_tabela, tabela_nome: calculo.tabela_nome, explicacao: calculo.explicacao,
          prazo_dias: $('cqPrazo').value, validade: $('cqValidade').value, observacao: $('cqObs').value,
        };
        const salva = editar ? await api(`/${c.id}`, { method: 'PUT', body: JSON.stringify(corpo) }) : await api('', { method: 'POST', body: JSON.stringify(corpo) });
        await carregar(); await abrir(salva.id);
      } catch (err) { erro(err); b.disabled = false; }
    });
    $('cqCliente').focus();
  }

  function ligarBuscaCliente() {
    const caixa = $('cqSug'); let achados = []; let t = null;
    const buscar = async () => {
      if (!document.body.contains(caixa)) return;
      const q = $('cqCliente').value.trim();
      if (q.length < 3) { caixa.classList.add('oculto'); return; }
      achados = await apiFetch(`/api/coletas/clientes?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => []);
      if (!document.body.contains(caixa) || !Array.isArray(achados)) return;
      caixa.innerHTML = achados.map((k, i) => `<div data-cq-sug="${i}" style="padding:8px 10px; cursor:pointer; border-bottom:1px solid var(--borda); font-size:13px;"><b>${esc(k.nome)}</b> <small style="color:var(--texto-fraco);">${esc(docFmt(k.documento))} · ${esc(k.cidade || '')}/${esc(k.uf || '')}</small></div>`).join('');
      caixa.classList.toggle('oculto', !achados.length);
    };
    $('cqCliente').addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 300); });
    $('cqCliente').addEventListener('blur', () => setTimeout(() => caixa.classList.add('oculto'), 200));
    caixa.addEventListener('mousedown', (e) => {
      const el = e.target.closest('[data-cq-sug]'); if (!el) return;
      const k = achados[Number(el.dataset.cqSug)];
      $('cqCliente').value = k.nome || ''; $('cqDoc').value = docFmt(k.documento);
      if (k.email && !$('cqEmail').value) $('cqEmail').value = k.email;
      if (k.telefone && !$('cqFone').value) $('cqFone').value = k.telefone;
      // Cliente remetente: a origem é a cidade dele.
      if ($('cqPapel').value === 'remetente' && k.cidade) { $('cqOriCid').value = k.cidade; $('cqOriUf').value = k.uf || ''; }
      caixa.classList.add('oculto');
    });
  }

  // ---------- Detalhe ----------
  async function abrir(id) {
    const c = await api(`/${id}`);
    const aberta = ['aberta', 'enviada'].includes(c.status);
    const fone = String(c.telefone || '').replace(/\D/g, '');
    const wa = `https://wa.me/${fone ? (fone.length <= 11 ? `55${fone}` : fone) : ''}?text=${encodeURIComponent(c.whatsapp)}`;
    $('ctModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div><h3 style="margin:0;">💲 Cotação ${c.id} <span class="oc-sit ${SIT[c.situacao][1]}" style="vertical-align:middle;">${SIT[c.situacao][0]}</span></h3>
        <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:4px;">${dia(c.criado_em)} · ${esc(c.criado_por_nome || '')} · válida até ${dia(c.validade)}${c.enviada_em ? ` · enviada ${new Date(c.enviada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</div></div>
        <span style="cursor:pointer; font-size:18px;" data-ct-fechar>✕</span></div>
      ${c.motivo ? `<div class="cte-aviso erro" style="margin-top:10px;">${c.status === 'cancelada' ? 'Cancelada' : 'Recusada'}: ${esc(c.motivo)}</div>` : ''}
      ${c.coleta_id ? `<div class="cte-aviso ok" style="margin-top:10px;">📦 Virou a coleta nº ${c.coleta_id} — <a href="#" id="cdVerColeta">abrir</a>${c.cte_id ? ' · já tem CT-e' : ''}</div>` : ''}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px; margin-top:14px;">
        <div style="font-size:13.5px; line-height:1.6;">
          <b>${esc(c.cliente_nome)}</b>${c.cliente_doc ? ` · ${esc(docFmt(c.cliente_doc))}` : ''}<br>
          ${esc([c.contato_nome, c.email, c.telefone].filter(Boolean).join(' · '))}<br>
          <b>${esc(c.origem_cidade)}/${esc(c.origem_uf)} → ${esc(c.destino_cidade)}${c.destino_bairro ? ` (${esc(c.destino_bairro)})` : ''}/${esc(c.destino_uf)}</b><br>
          ${esc([c.peso_kg ? `${num(c.peso_kg, 1)} kg` : '', c.volumes ? `${num(c.volumes)} vol.` : '', c.cubagem_m3 ? `${num(c.cubagem_m3, 3)} m³` : '', c.valor_mercadoria ? `NF ${moeda(c.valor_mercadoria)}` : '', c.produto].filter(Boolean).join(' · '))}<br>
          Frete pago pelo ${c.cliente_papel === 'destinatario' ? 'destinatário (FOB)' : 'remetente (CIF)'}${c.prazo_dias ? ` · prazo ${c.prazo_dias} dia(s) útil(eis)` : ''}
          ${c.observacao ? `<br><i>${esc(c.observacao)}</i>` : ''}
        </div>
        <div><table class="edi-tabela"><tbody>${(c.componentes || []).map((x) => `<tr><td>${esc(x.xNome)}</td><td class="n">${moeda(x.vComp)}</td></tr>`).join('')}
          <tr><th>Total</th><th class="n" style="font-size:16px;">${moeda(c.valor_total)}</th></tr></tbody></table>
          ${c.valor_tabela && Number(c.valor_tabela) > Number(c.valor_total) ? `<small style="color:var(--texto-fraco);">Pela tabela: ${moeda(c.valor_tabela)} (desconto de ${num(((c.valor_tabela - c.valor_total) / c.valor_tabela) * 100, 1)}%)</small>` : ''}</div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:16px;">
        ${aberta || c.situacao === 'vencida' ? '<button class="btn btn-secundario" id="cdRecusar" style="width:auto; color:var(--vermelho);">✗ Recusada</button>' : ''}
        ${['recusada', 'cancelada', 'vencida'].includes(c.situacao) || (c.status === 'aprovada' && !c.coleta_id) ? '<button class="btn btn-secundario" id="cdReabrir" style="width:auto;">Reabrir</button>' : ''}
        <button class="btn btn-secundario" id="cdDuplicar" style="width:auto;">↻ Duplicar</button>
        ${aberta ? '<button class="btn btn-secundario" id="cdEditar" style="width:auto;">Editar</button>' : ''}
        <a class="btn btn-secundario" href="/api/cotacoes/${c.id}/proposta?token=${encodeURIComponent(token)}" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">🖨 Proposta / PDF</a>
        ${aberta ? `<a class="btn btn-secundario" id="cdWhats" href="${esc(wa)}" target="_blank" rel="noopener" style="width:auto; text-decoration:none;">💬 WhatsApp</a>
          <button class="btn btn-secundario" id="cdEmail" style="width:auto;">✉ Enviar por e-mail</button>` : ''}
        ${aberta && c.situacao !== 'vencida' ? '<button class="btn btn-primario" id="cdAprovar" style="width:auto;">✓ Aprovada → programar coleta</button>' : ''}
        ${c.status === 'aprovada' && !c.coleta_id ? '<button class="btn btn-primario" id="cdColeta" style="width:auto;">📦 Criar a coleta</button>' : ''}</div>`;
    modal.classList.remove('oculto');
    const depois = async () => { await carregar(); await abrir(id); };
    $('cdEditar')?.addEventListener('click', () => formulario(c));
    $('cdDuplicar').addEventListener('click', () => formulario(c, { duplicar: true }));
    $('cdWhats')?.addEventListener('click', () => { api(`/${id}/marcar-enviada`, { method: 'POST' }).then(depois).catch(() => {}); });
    $('cdEmail')?.addEventListener('click', async () => {
      const para = await pedirTexto('Enviar a proposta para qual e-mail?', { titulo: `Cotação ${id}`, valor: c.email || '', placeholder: 'cliente@empresa.com.br', textoOk: 'Enviar' });
      if (para == null) return;
      try { const r = await api(`/${id}/enviar`, { method: 'POST', body: JSON.stringify({ email: para }) }); mostrarAlerta(`Proposta enviada para ${r.para}.`, { tipo: 'sucesso' }); await depois(); } catch (err) { erro(err); }
    });
    $('cdRecusar')?.addEventListener('click', async () => {
      const motivo = await pedirTexto('Por que o cliente não fechou? (preço, prazo, fechou com outro...)', { titulo: `Cotação ${id} recusada`, placeholder: 'Ex.: preço acima do concorrente', textoOk: 'Marcar como recusada' });
      if (motivo == null) return;
      try { await api(`/${id}/recusar`, { method: 'POST', body: JSON.stringify({ motivo }) }); await depois(); } catch (err) { erro(err); }
    });
    $('cdReabrir')?.addEventListener('click', async () => { try { await api(`/${id}/reabrir`, { method: 'POST' }); await depois(); } catch (err) { erro(err); } });
    const irParaColeta = async (cot) => {
      fecharModal();
      if (!window.nexoColetas?.novaDaCotacao) { mostrarAlerta('Cotação aprovada. Registre a coleta em Coletas.', { tipo: 'sucesso' }); return; }
      document.getElementById('navColetas')?.click();
      await window.nexoColetas.novaDaCotacao(cot);
    };
    $('cdAprovar')?.addEventListener('click', async () => {
      if (!await confirmar(`Marcar a cotação ${id} como aprovada pelo cliente (${moeda(c.valor_total)})? Em seguida você registra a coleta, e o CT-e sai com este preço.`, { textoOk: 'Aprovada' })) return;
      try { const cot = await api(`/${id}/aprovar`, { method: 'POST' }); await carregar(); await irParaColeta(cot); } catch (err) { erro(err); }
    });
    $('cdColeta')?.addEventListener('click', () => irParaColeta(c).catch(erro));
    $('cdVerColeta')?.addEventListener('click', (e) => { e.preventDefault(); fecharModal(); document.getElementById('navColetas')?.click(); window.nexoColetas?.abrir(c.coleta_id); });
  }

  async function configurar() {
    const cfg = await api('/config');
    $('ctModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">⚙ Validade e condições das cotações</h3><span style="cursor:pointer; font-size:18px;" data-ct-fechar>✕</span></div>
      <div class="campo" style="margin-top:14px; max-width:220px;"><label for="cfgDias">Validade padrão (dias)</label><input id="cfgDias" inputmode="numeric" value="${cfg.validade_dias}" /></div>
      <div class="campo"><label for="cfgCond">Condições gerais (saem no fim de toda proposta)</label><textarea id="cfgCond" rows="7" placeholder="Ex.: Valores para carga paletizada e descarga pelo destinatário. Sujeito à disponibilidade de veículo. Pagamento em 15 dias da emissão do CT-e...">${esc(cfg.condicoes)}</textarea></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-ct-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="cfgSalvar" style="width:auto;">Salvar</button></div>`;
    modal.classList.remove('oculto');
    $('cfgSalvar').addEventListener('click', async () => {
      try { await api('/config', { method: 'PUT', body: JSON.stringify({ validade_dias: $('cfgDias').value, condicoes: $('cfgCond').value }) }); estado.config = null; await iniciar(); fecharModal(); mostrarAlerta('Salvo.', { tipo: 'sucesso' }); } catch (err) { erro(err); }
    });
  }
})();
