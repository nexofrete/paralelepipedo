// =====================================================================
// Comissões (vendedores, carteira, apuração e fechamentos) e Centros de
// custo (resultado por centro e cadastro).
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar; Periodo (js/periodo.js).
// =====================================================================
const cmComum = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctTxt = (v) => (v == null ? '' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%`);
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const docFmt = (v) => { const d = String(v || ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (c, o = {}) => {
    const r = await apiFetch(c, { ...o, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const modal = $('modalCm');
  const fechar = () => modal.classList.add('oculto');
  modal?.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-cm-fechar]')) fechar(); });
  const abrirModal = (titulo, corpo) => {
    $('cmModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;"><h3 style="margin:0;">${titulo}</h3><span style="cursor:pointer; font-size:18px;" data-cm-fechar>✕</span></div>${corpo}`;
    modal.classList.remove('oculto');
  };
  const campo = (id, rotulo, valor = '', extra = '') => `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;
  return { $, esc, brl, num, pctTxt, dia, docFmt, erro, api, enviar, fechar, abrirModal, campo };
})();

// ------------------------------- Comissões -------------------------------
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navComissoes');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');
  const { $, esc, brl, num, pctTxt, dia, docFmt, erro, api, enviar, fechar, abrirModal, campo } = cmComum;
  let aba = 'apuracao'; let vend = null;
  const per = { de: '', ate: '' };
  const carregarVendedores = async () => { vend = await api('/api/comissoes/vendedores?todos=1'); };

  function mostrarAba(n) { aba = n; document.querySelectorAll('[data-cm-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.cmAba === n)); }
  async function carregar() {
    await carregarVendedores();
    return ({ apuracao: telaApuracao, carteira: telaCarteira, vendedores: telaVendedores, fechamentos: telaFechamentos }[aba])();
  }
  const recarregar = () => carregar().catch(erro);
  document.querySelectorAll('[data-cm-aba]').forEach((a) => a.addEventListener('click', () => { mostrarAba(a.dataset.cmAba); recarregar(); }));
  nav.addEventListener('click', () => { mostrarAba(aba); recarregar(); });
  $('cmNovoVend').addEventListener('click', () => (vend ? Promise.resolve() : carregarVendedores()).then(() => formVendedor()).catch(erro));

  // ---------- Apuração ----------
  async function telaApuracao() {
    ({ de: per.de, ate: per.ate } = Periodo.atual('comissoes', 'mes_passado'));
    $('cmConteudo').innerHTML = `<div class="oc-barra" style="justify-content:flex-start;">${Periodo.html('cm')}</div><div id="cmApur"><div class="kanban-vazio">Apurando…</div></div>`;
    Periodo.ligar({ select: $('cmPer'), de: $('cmDe'), ate: $('cmAte'), chave: 'comissoes', padrao: 'mes_passado', aoMudar: () => telaApuracao().catch(erro) });
    if (!vend.vendedores.length) { $('cmApur').innerHTML = '<div class="painel" style="padding:18px 20px;"><b>Cadastre os vendedores</b> (＋ Vendedor) e ligue cada cliente ao vendedor dele na aba Carteira de clientes.</div>'; return; }
    const a = await api(`/api/comissoes/apuracao?de=${per.de}&ate=${per.ate}`);
    $('cmApur').innerHTML = `
      <div class="oc-resumo">
        <div>Comissão do período<b>${brl(a.total)}</b><span>${a.vendedores.filter((v) => v.itens.length || v.estornos.length).length} vendedor(es) com documentos</span></div>
        <div>Documentos<b>${a.vendedores.reduce((s, v) => s + v.itens.length, 0)}</b><span>${a.vendedores.reduce((s, v) => s + v.estornos.length, 0)} estorno(s)</span></div>
        <div>Sem vendedor<b style="${a.sem_vendedor.qtd ? 'color:#f59e0b;' : ''}">${a.sem_vendedor.qtd}</b><span>${a.sem_vendedor.qtd ? `${brl(a.sem_vendedor.valor)} recebido de clientes sem vendedor` : 'todos os clientes têm vendedor'}</span></div>
      </div>
      ${a.sem_vendedor.qtd ? `<div class="cte-aviso" style="margin-bottom:12px;">Clientes sem vendedor com recebimento no período: ${a.sem_vendedor.clientes.map((c) => esc(c.nome || docFmt(c.doc))).join(', ')}. Ligue-os em <a href="#" id="cmIrCarteira">Carteira de clientes</a> se tiverem vendedor.</div>` : ''}
      ${a.vendedores.map((r, i) => {
    const docs = [...r.itens, ...r.estornos];
    return `<div class="painel" style="padding:14px 18px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div><div style="font-weight:700; font-size:15px;">${esc(r.vendedor.nome)}${r.vendedor.ativo ? '' : ' <small>(inativo)</small>'}</div>
            <div style="font-size:12.5px; color:var(--texto-fraco);">${pctTxt(r.vendedor.comissao_pct)} ${r.vendedor.base === 'faturado' ? 'sobre o faturado (CT-e autorizado no período)' : 'sobre o recebido (fatura quitada no período)'} · ${r.vendedor.clientes} cliente(s) na carteira</div></div>
          <div style="text-align:right;"><div style="font-size:12px; color:var(--texto-fraco);">${r.itens.length} doc. · base ${brl(r.base_total)}${r.estornos.length ? ` · ${r.estornos.length} estorno(s)` : ''}</div>
            <div style="font-size:22px; font-weight:700; ${r.total < 0 ? 'color:var(--vermelho);' : ''}">${brl(r.total)}</div></div></div>
        ${docs.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn btn-secundario" data-cm-ver="${i}" style="width:auto;">📄 Ver os documentos</button>
          ${r.total > 0 ? `<button class="btn btn-primario" data-cm-fechar-v="${i}" style="width:auto;">✓ Fechar e lançar em Contas a pagar</button>` : '<span style="font-size:12.5px; color:var(--texto-fraco); align-self:center;">Estornos maiores que a comissão: ficam para o próximo fechamento.</span>'}</div>
          <div id="cmDocs${i}" class="oculto" style="margin-top:10px; overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Documento</th><th>Cliente</th><th>${r.vendedor.base === 'faturado' ? 'Autorizado' : 'Quitado'}</th><th class="n">Valor</th><th class="n">%</th><th class="n">Comissão</th><th>Vendedor</th></tr></thead><tbody>
            ${docs.map((d) => `<tr${d.tipo === 'estorno' ? ' style="color:var(--vermelho);"' : ''}><td>${esc(d.documento)}${d.tipo === 'estorno' ? ' <small>(cancelado: estorno)</small>' : ''}</td><td>${esc(d.cliente || '')}</td><td>${dia(d.data_ref)}</td>
              <td class="n">${num(d.valor)}</td><td class="n">${pctTxt(d.pct)}</td><td class="n">${num(d.comissao)}</td>
              <td>${d.tipo === 'estorno' ? '' : `<select class="cte-entrada cm-troca" data-tipo="${d.doc_tipo}" data-id="${d.doc_id}" style="padding:3px 6px; font-size:12px; width:auto;"><option value="">do cliente (${esc(r.vendedor.nome)})</option>${vend.vendedores.filter((v) => v.ativo && v.id !== r.vendedor.id).map((v) => `<option value="${v.id}">${esc(v.nome)}</option>`).join('')}<option value="0">ninguém</option></select>`}</td></tr>`).join('')}
          </tbody></table></div>` : '<div style="font-size:12.5px; color:var(--texto-fraco); margin-top:6px;">Nada no período.</div>'}</div>`;
  }).join('')}`;
    $('cmIrCarteira')?.addEventListener('click', (e) => { e.preventDefault(); mostrarAba('carteira'); recarregar(); });
    document.querySelectorAll('[data-cm-ver]').forEach((b) => b.addEventListener('click', () => $(`cmDocs${b.dataset.cmVer}`).classList.toggle('oculto')));
    document.querySelectorAll('.cm-troca').forEach((s) => s.addEventListener('change', async () => {
      try { await enviar(`/api/comissoes/documentos/${s.dataset.tipo}/${s.dataset.id}/vendedor`, 'PUT', { vendedor_id: s.value === '0' ? null : s.value || null });
        if (s.value === '') return; telaApuracao().catch(erro); } catch (e) { erro(e); }
    }));
    document.querySelectorAll('[data-cm-fechar-v]').forEach((b) => b.addEventListener('click', () => formFechar(a.vendedores[Number(b.dataset.cmFecharV)])));
  }

  async function formFechar(r) {
    const { centros } = await api('/api/centros-custo').catch(() => ({ centros: [] }));
    const venc = new Date(); venc.setDate(venc.getDate() + 10);
    const p2 = (x) => String(x).padStart(2, '0');
    abrirModal(`Fechar a comissão de ${esc(r.vendedor.nome)}`, `
      <p style="margin-top:0; line-height:1.6;">${dia(per.de)} a ${dia(per.ate)}: <b>${r.itens.length}</b> documento(s)${r.estornos.length ? ` e <b>${r.estornos.length}</b> estorno(s)` : ''} — <b style="font-size:16px;">${brl(r.total)}</b></p>
      <div class="cte-grade">${campo('cmVenc', 'Vencimento do pagamento', `${venc.getFullYear()}-${p2(venc.getMonth() + 1)}-${p2(venc.getDate())}`, 'type="date"')}
        <div class="campo"><label for="cmCentro">Centro de custo</label><select id="cmCentro" class="cte-entrada"><option value="">— Comercial (automático) —</option>${centros.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div></div>
      <p style="font-size:12.5px; color:var(--texto-fraco);">Vira uma conta a pagar (categoria Comissão) para ${esc(r.vendedor.nome)}. Estes documentos não entram de novo em outra apuração; se algum for cancelado depois, volta como estorno.</p>
      <div style="display:flex; justify-content:flex-end; gap:8px;"><button class="btn btn-secundario" data-cm-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="cmFecharOk" style="width:auto;">Fechar ${brl(r.total)}</button></div>`);
    $('cmFecharOk').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const f = await enviar('/api/comissoes/fechar', 'POST', { vendedor_id: r.vendedor.id, de: per.de, ate: per.ate, vencimento: $('cmVenc').value, centro_custo_id: $('cmCentro').value || null });
        fechar(); mostrarAlerta(`Comissão fechada: ${brl(f.total)} para ${f.vendedor}, lançada em Contas a pagar (conta ${f.conta_pagar_id}).`, { tipo: 'sucesso' }); recarregar();
      } catch (e) { erro(e); b.disabled = false; }
    });
  }

  // ---------- Carteira ----------
  async function telaCarteira() {
    const lista = await api('/api/comissoes/carteira');
    const ativos = vend.vendedores.filter((v) => v.ativo);
    const linha = (c) => `<tr data-doc="${c.documento}" data-nome="${esc(c.nome)}"><td>${esc(c.nome || '—')}<br><small style="color:var(--texto-fraco);">${docFmt(c.documento)}</small></td>
      <td><select class="cte-entrada cm-vend" style="padding:4px 8px; width:auto; min-width:180px;"><option value="">— sem vendedor —</option>${ativos.map((v) => `<option value="${v.id}" ${c.vendedor_id === v.id ? 'selected' : ''}>${esc(v.nome)} (${pctTxt(v.comissao_pct)})</option>`).join('')}</select></td>
      <td><input class="cte-entrada cm-pct" inputmode="decimal" value="${c.comissao_pct != null ? String(c.comissao_pct).replace('.', ',') : ''}" placeholder="do vendedor" style="padding:4px 8px; width:110px;" /></td>
      <td><span class="cm-ok" style="color:var(--verde); font-size:12px;"></span></td></tr>`;
    $('cmConteudo').innerHTML = `
      <div class="oc-barra" style="justify-content:flex-start;"><input id="cmBusca" class="cte-entrada" placeholder="Buscar cliente ou CNPJ" style="width:260px;" />
        <label style="font-size:13px; display:flex; gap:6px; align-items:center;"><input type="checkbox" id="cmSoSem" /> só os sem vendedor</label></div>
      ${ativos.length ? '' : '<div class="cte-aviso" style="margin-bottom:10px;">Cadastre os vendedores primeiro (＋ Vendedor).</div>'}
      <div class="painel" style="padding:12px 14px;"><p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 8px;">Clientes que pagam frete (tomadores). Escolher o vendedor ou mudar o % salva na hora. % em branco = o do vendedor.</p>
        <div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Cliente</th><th>Vendedor</th><th>% próprio</th><th></th></tr></thead><tbody id="cmCarteira">${lista.map(linha).join('') || '<tr><td colspan="4" style="color:var(--texto-fraco);">Nenhum cliente ainda (aparecem os tomadores dos CT-e e das faturas).</td></tr>'}</tbody></table></div></div>`;
    const filtrar = () => {
      const t = $('cmBusca').value.trim().toLowerCase(); const d = t.replace(/\D/g, ''); const so = $('cmSoSem').checked;
      document.querySelectorAll('#cmCarteira tr[data-doc]').forEach((tr) => {
        const ok = (!t || tr.dataset.nome.toLowerCase().includes(t) || (d && tr.dataset.doc.includes(d))) && (!so || !tr.querySelector('.cm-vend').value);
        tr.classList.toggle('oculto', !ok);
      });
    };
    $('cmBusca').addEventListener('input', filtrar); $('cmSoSem').addEventListener('change', filtrar);
    document.querySelectorAll('#cmCarteira tr[data-doc]').forEach((tr) => {
      const salvar = async () => {
        const ok = tr.querySelector('.cm-ok'); ok.textContent = '…';
        try {
          await enviar('/api/comissoes/carteira', 'PUT', { documentos: [tr.dataset.doc], nome: tr.dataset.nome, vendedor_id: tr.querySelector('.cm-vend').value || null, comissao_pct: tr.querySelector('.cm-pct').value });
          ok.textContent = '✓ salvo';
        } catch (e) { ok.textContent = ''; erro(e); }
      };
      tr.querySelector('.cm-vend').addEventListener('change', salvar);
      tr.querySelector('.cm-pct').addEventListener('change', salvar);
    });
  }

  // ---------- Vendedores ----------
  async function telaVendedores() {
    $('cmConteudo').innerHTML = `<div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Vendedor</th><th class="n">Comissão</th><th>Base</th><th class="n">Clientes</th><th>Contato</th><th></th></tr></thead><tbody>
      ${vend.vendedores.map((v) => `<tr${v.ativo ? '' : ' style="opacity:.55;"'}><td><b>${esc(v.nome)}</b>${v.documento ? `<br><small>${docFmt(v.documento)}</small>` : ''}${v.ativo ? '' : ' <small>(inativo)</small>'}</td><td class="n">${pctTxt(v.comissao_pct)}</td>
        <td>${v.base === 'faturado' ? 'Faturado' : 'Recebido'}</td><td class="n">${v.clientes}</td><td><small>${esc([v.email, v.telefone].filter(Boolean).join(' · '))}</small></td>
        <td><button class="btn btn-secundario" data-cm-ed="${v.id}" style="width:auto; padding:3px 8px; font-size:12px;">Editar</button></td></tr>`).join('')
        || '<tr><td colspan="6" style="color:var(--texto-fraco);">Nenhum vendedor. Clique em ＋ Vendedor.</td></tr>'}</tbody></table></div></div>`;
    document.querySelectorAll('[data-cm-ed]').forEach((b) => b.addEventListener('click', () => formVendedor(vend.vendedores.find((v) => v.id === Number(b.dataset.cmEd)))));
  }

  function formVendedor(v = null) {
    abrirModal(v ? `Editar ${esc(v.nome)}` : 'Novo vendedor', `<div class="cte-grade">
      ${campo('cmVNome', 'Nome', v?.nome, 'maxlength="120"')}${campo('cmVDoc', 'CPF/CNPJ (para a conta a pagar)', v?.documento ? docFmt(v.documento) : '')}
      ${campo('cmVPct', 'Comissão (%)', v ? String(v.comissao_pct).replace('.', ',') : '', 'inputmode="decimal" placeholder="ex.: 3"')}
      <div class="campo"><label for="cmVBase">Calcula sobre</label><select id="cmVBase" class="cte-entrada"><option value="recebido">o recebido (fatura quitada)</option><option value="faturado" ${v?.base === 'faturado' ? 'selected' : ''}>o faturado (CT-e autorizado)</option></select></div>
      ${campo('cmVEmail', 'E-mail', v?.email)}${campo('cmVFone', 'Telefone', v?.telefone)}</div>
      ${v ? `<label style="display:flex; gap:8px; align-items:center; font-size:13.5px; margin:6px 0;"><input type="checkbox" id="cmVAtivo" ${v.ativo ? 'checked' : ''} /> Ativo</label>` : ''}
      <p style="font-size:12.5px; color:var(--texto-fraco);">"Recebido" é o mais comum: a comissão só entra quando o cliente paga a fatura. Um cliente pode ter % próprio na Carteira.</p>
      <div style="display:flex; justify-content:flex-end; gap:8px;"><button class="btn btn-secundario" data-cm-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="cmVOk" style="width:auto;">Salvar</button></div>`);
    $('cmVNome').focus();
    $('cmVOk').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      const corpo = { nome: $('cmVNome').value, documento: $('cmVDoc').value, comissao_pct: $('cmVPct').value, base: $('cmVBase').value, email: $('cmVEmail').value, telefone: $('cmVFone').value, ...(v ? { ativo: $('cmVAtivo').checked } : {}) };
      try { if (v) await enviar(`/api/comissoes/vendedores/${v.id}`, 'PUT', corpo); else await enviar('/api/comissoes/vendedores', 'POST', corpo); fechar(); recarregar(); } catch (e) { erro(e); b.disabled = false; }
    });
  }

  // ---------- Fechamentos ----------
  async function telaFechamentos() {
    const lista = await api('/api/comissoes/fechamentos');
    const conta = (f) => (f.conta_status === 'paga' ? '<span class="oc-sit entregue">Paga</span>' : f.conta_status === 'cancelada' ? '<span class="oc-sit cancelado">Cancelada</span>' : `<span class="oc-sit pendente">A pagar</span> <small>${dia(f.conta_vencimento)}</small>`);
    $('cmConteudo').innerHTML = `<div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Nº</th><th>Vendedor</th><th>Período</th><th class="n">Docs</th><th class="n">Total</th><th>Conta a pagar</th><th>Fechado em</th><th></th></tr></thead><tbody>
      ${lista.map((f) => `<tr${f.status === 'cancelado' ? ' style="opacity:.55;"' : ''}><td>${f.id}</td><td>${esc(f.vendedor)}</td><td>${dia(f.de)} a ${dia(f.ate)}</td><td class="n">${f.itens}${f.estornos ? ` <small>(${f.estornos} est.)</small>` : ''}</td>
        <td class="n">${brl(f.total)}</td><td>${f.status === 'cancelado' ? '<span class="oc-sit cancelado">Fechamento cancelado</span>' : conta(f)}</td><td><small>${new Date(f.criado_em).toLocaleDateString('pt-BR')} · ${esc(f.usuario_nome || '')}</small></td>
        <td style="white-space:nowrap;">${f.status === 'fechado' ? `<button class="btn btn-secundario" data-cm-itens="${f.id}" style="width:auto; padding:3px 8px; font-size:12px;">Documentos</button>
          <button class="btn btn-secundario" data-cm-cancelar="${f.id}" style="width:auto; padding:3px 8px; font-size:12px; color:var(--vermelho);">Cancelar</button>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="8" style="color:var(--texto-fraco);">Nenhum fechamento ainda.</td></tr>'}</tbody></table></div></div>`;
    document.querySelectorAll('[data-cm-itens]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const it = await api(`/api/comissoes/fechamentos/${b.dataset.cmItens}/itens`);
        abrirModal(`Fechamento ${b.dataset.cmItens}`, `<div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Documento</th><th>Cliente</th><th>Data</th><th class="n">Valor</th><th class="n">%</th><th class="n">Comissão</th></tr></thead><tbody>
          ${it.map((x) => `<tr${x.tipo === 'estorno' ? ' style="color:var(--vermelho);"' : ''}><td>${esc(x.documento)}${x.tipo === 'estorno' ? ' (estorno)' : ''}</td><td>${esc(x.cliente)}</td><td>${dia(x.data_ref)}</td><td class="n">${num(x.base_valor)}</td><td class="n">${pctTxt(x.pct)}</td><td class="n">${num(x.valor)}</td></tr>`).join('')}</tbody></table></div>`);
      } catch (e) { erro(e); }
    }));
    document.querySelectorAll('[data-cm-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Cancelar este fechamento? A conta a pagar é cancelada e os documentos voltam para a apuração.', { tipo: 'perigo', textoOk: 'Cancelar fechamento' })) return;
      try { await api(`/api/comissoes/fechamentos/${b.dataset.cmCancelar}/cancelar`, { method: 'POST' }); recarregar(); } catch (e) { erro(e); }
    }));
  }
})();

// ---------------------------- Centros de custo ----------------------------
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navCentros');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');
  const { $, esc, brl, dia, erro, api, enviar, fechar, abrirModal, campo } = cmComum;
  let aba = 'resultado'; let cad = null;
  const per = { de: '', ate: '' };
  const CAT = { combustivel: 'Combustível', pedagio: 'Pedágio', manutencao: 'Manutenção', pneus: 'Pneus', frete_terceiro: 'Frete de terceiro', adiantamento: 'Adiantamento',
    salarios: 'Salários', impostos: 'Impostos', seguro: 'Seguro', aluguel: 'Aluguel', administrativo: 'Administrativo', comissao: 'Comissão', outros: 'Outros' };
  const cor = (v) => (v < 0 ? 'color:var(--vermelho);' : v > 0 ? 'color:var(--verde);' : '');

  function mostrarAba(n) { aba = n; document.querySelectorAll('[data-ccu-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.ccuAba === n)); }
  async function carregar() { cad = await api('/api/centros-custo?todos=1'); return (aba === 'resultado' ? telaResultado : telaCadastro)(); }
  const recarregar = () => carregar().catch(erro);
  document.querySelectorAll('[data-ccu-aba]').forEach((a) => a.addEventListener('click', () => { mostrarAba(a.dataset.ccuAba); recarregar(); }));
  nav.addEventListener('click', () => { mostrarAba(aba); recarregar(); });
  $('ccuNovo').addEventListener('click', () => (cad ? Promise.resolve() : api('/api/centros-custo?todos=1').then((c) => { cad = c; })).then(() => formCentro()).catch(erro));

  const botaoAutomatico = '<button class="btn btn-primario" id="ccuAuto" style="width:auto;">⚡ Criar automático (filiais, veículos, Comercial e Administrativo)</button>';
  const ligarAutomatico = () => $('ccuAuto')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      const r = await api('/api/centros-custo/automatico', { method: 'POST' });
      mostrarAlerta(`Criados: ${r.filiais} de filial, ${r.veiculos} de veículo e ${r.outros} outro(s). ${r.contas} conta(s) a pagar antigas foram classificadas pelo veículo/filial.`, { tipo: 'sucesso' });
      recarregar();
    } catch (e) { erro(e); }
  });

  async function telaResultado() {
    ({ de: per.de, ate: per.ate } = Periodo.atual('centros', 'mes'));
    $('ccuConteudo').innerHTML = `<div class="oc-barra" style="justify-content:flex-start;">${Periodo.html('ccu')}</div><div id="ccuRes"><div class="kanban-vazio">Calculando…</div></div>`;
    Periodo.ligar({ select: $('ccuPer'), de: $('ccuDe'), ate: $('ccuAte'), chave: 'centros', padrao: 'mes', aoMudar: () => telaResultado().catch(erro) });
    if (!cad.centros.length) { $('ccuRes').innerHTML = `<div class="painel" style="padding:18px 20px;"><b>Nenhum centro de custo ainda.</b><p style="line-height:1.6;">O jeito mais rápido é criar um para cada filial e cada veículo, mais Comercial e Administrativo. As contas a pagar antigas são classificadas pelo veículo ou pela filial.</p>${botaoAutomatico}</div>`; ligarAutomatico(); return; }
    const r = await api(`/api/centros-custo/resultado?de=${per.de}&ate=${per.ate}`);
    const maior = Math.max(1, ...r.centros.map((c) => Math.max(c.receita, c.despesas)));
    $('ccuRes').innerHTML = `
      <div class="oc-resumo">
        <div>Receita<b>${brl(r.totais.receita)}</b><span>CT-e e NFS-e do período</span></div>
        <div>Despesas<b>${brl(r.totais.despesas)}</b><span>contas a pagar pelo vencimento</span></div>
        <div>Resultado<b style="${cor(r.totais.resultado)}">${brl(r.totais.resultado)}</b><span>${r.totais.receita ? `${Math.round((r.totais.resultado / r.totais.receita) * 1000) / 10}% da receita` : ''}</span></div>
        <div>Sem centro<b style="${r.contas_sem_centro ? 'color:#f59e0b;' : ''}">${r.contas_sem_centro}</b><span>${r.contas_sem_centro ? `${brl(r.despesas_sem_centro)} — clique para classificar` : 'todas as contas têm centro'}</span></div>
      </div>
      ${r.sem_filial ? `<div class="cte-aviso" style="margin-bottom:10px;">${r.sem_filial} CT-e sem filial de origem: a receita deles entrou no centro da matriz. As NFS-e também entram na matriz.</div>` : ''}
      <div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Centro de custo</th><th class="n">Receita</th><th class="n">Despesas</th><th class="n">Resultado</th><th style="width:22%;"></th><th></th></tr></thead><tbody>
        ${r.centros.map((c) => `<tr><td><b>${esc(c.nome)}</b>${c.tipo ? ` <small style="color:var(--texto-fraco);">${esc(r.tipos[c.tipo] || c.tipo)}</small>` : ''}${c.id ? '' : ' <small style="color:#f59e0b;">(sem classificação)</small>'}
            ${Object.keys(c.por_categoria).length ? `<br><small style="color:var(--texto-fraco);">${Object.entries(c.por_categoria).map(([k, v]) => `${CAT[k] || k} ${brl(v)}`).join(' · ')}</small>` : ''}</td>
          <td class="n">${c.receita ? brl(c.receita) : '—'}${c.documentos ? `<br><small style="color:var(--texto-fraco);">${c.documentos} doc.</small>` : ''}</td><td class="n">${c.despesas ? brl(c.despesas) : '—'}${c.contas ? `<br><small style="color:var(--texto-fraco);">${c.contas} conta(s)</small>` : ''}</td>
          <td class="n" style="font-weight:700; ${cor(c.resultado)}">${brl(c.resultado)}${c.margem_pct != null ? `<br><small>${c.margem_pct}%</small>` : ''}</td>
          <td><div style="height:6px; border-radius:3px; background:var(--verde); opacity:.8; width:${(c.receita / maior) * 100}%; margin-bottom:3px;"></div><div style="height:6px; border-radius:3px; background:var(--vermelho); opacity:.8; width:${(c.despesas / maior) * 100}%;"></div></td>
          <td>${c.contas ? `<button class="btn btn-secundario" data-ccu-contas="${c.id ?? 'sem'}" data-nome="${esc(c.nome)}" style="width:auto; padding:3px 8px; font-size:12px;">Contas</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div><p style="font-size:12px; color:var(--texto-fraco); margin:8px 0 0;">Barra verde = receita, vermelha = despesas. Receita pela filial de origem do CT-e; despesas pelo centro de cada conta a pagar (abastecimento, manutenção e acerto pegam o do veículo).</p></div>`;
    document.querySelectorAll('[data-ccu-contas]').forEach((b) => b.addEventListener('click', () => verContas(b.dataset.ccuContas, b.dataset.nome)));
  }

  async function verContas(centro, nome) {
    const lista = await api(`/api/centros-custo/contas?de=${per.de}&ate=${per.ate}&centro=${centro}`);
    abrirModal(`Contas — ${esc(nome)}`, `<p style="margin-top:0; font-size:12.5px; color:var(--texto-fraco);">${dia(per.de)} a ${dia(per.ate)}. Marque e mova para outro centro.</p>
      <div style="overflow-x:auto; max-height:52vh;"><table class="edi-tabela"><thead><tr><th><input type="checkbox" id="ccuTodas" /></th><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th class="n">Valor</th></tr></thead><tbody>
        ${lista.map((c) => `<tr><td><input type="checkbox" class="ccu-conta" value="${c.id}" /></td><td>${dia(c.vencimento)}</td><td style="white-space:normal;">${esc(c.descricao)}${c.fornecedor_nome ? `<br><small>${esc(c.fornecedor_nome)}</small>` : ''}</td><td>${esc(CAT[c.categoria] || c.categoria)}</td><td class="n">${brl(c.valor)}</td></tr>`).join('')}
      </tbody></table></div>
      <div style="display:flex; gap:8px; justify-content:flex-end; align-items:center; flex-wrap:wrap; margin-top:12px;">Mover as marcadas para
        <select id="ccuDestino" class="cte-entrada" style="width:auto;">${cad.centros.filter((c) => c.ativo).map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}<option value="">— nenhum —</option></select>
        <button class="btn btn-primario" id="ccuMover" style="width:auto;">Mover</button></div>`);
    $('ccuTodas').addEventListener('change', (e) => document.querySelectorAll('.ccu-conta').forEach((x) => { x.checked = e.target.checked; }));
    $('ccuMover').addEventListener('click', async () => {
      const ids = [...document.querySelectorAll('.ccu-conta:checked')].map((x) => Number(x.value));
      if (!ids.length) { mostrarAlerta('Marque as contas.', { tipo: 'aviso' }); return; }
      try { await enviar('/api/centros-custo/contas', 'PUT', { conta_ids: ids, centro_custo_id: $('ccuDestino').value || null }); fechar(); recarregar(); } catch (e) { erro(e); }
    });
  }

  async function telaCadastro() {
    $('ccuConteudo').innerHTML = `<div style="display:flex; justify-content:flex-end; margin-bottom:10px;">${botaoAutomatico}</div>
      <div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Centro de custo</th><th>Tipo</th><th>Ligado a</th><th></th></tr></thead><tbody>
        ${cad.centros.map((c) => `<tr${c.ativo ? '' : ' style="opacity:.55;"'}><td><b>${esc(c.nome)}</b>${c.ativo ? '' : ' <small>(inativo)</small>'}</td><td>${esc(cad.tipos[c.tipo] || c.tipo)}</td>
          <td>${c.unidade_sigla ? `filial ${esc(c.unidade_sigla)}` : c.placa ? `veículo ${esc(c.placa)}` : '—'}</td>
          <td><button class="btn btn-secundario" data-ccu-ed="${c.id}" style="width:auto; padding:3px 8px; font-size:12px;">Editar</button></td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--texto-fraco);">Nenhum centro ainda.</td></tr>'}
      </tbody></table></div></div>`;
    ligarAutomatico();
    document.querySelectorAll('[data-ccu-ed]').forEach((b) => b.addEventListener('click', () => formCentro(cad.centros.find((c) => c.id === Number(b.dataset.ccuEd)))));
  }

  function formCentro(c = null) {
    abrirModal(c ? `Editar ${esc(c.nome)}` : 'Novo centro de custo', `<div class="cte-grade">
      ${campo('ccuNome', 'Nome', c?.nome, 'maxlength="80"')}
      <div class="campo"><label for="ccuTipo">Tipo</label><select id="ccuTipo" class="cte-entrada">${Object.entries(cad.tipos).map(([k, t]) => `<option value="${k}" ${c?.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="campo" id="ccuCampoFilial"><label for="ccuFilial">Filial</label><select id="ccuFilial" class="cte-entrada">${cad.unidades.map((u) => `<option value="${u.id}" ${c?.unidade_id === u.id ? 'selected' : ''}>${esc(u.sigla)} — ${esc(u.nome)}</option>`).join('')}</select></div>
      <div class="campo" id="ccuCampoVeic"><label for="ccuVeic">Veículo</label><select id="ccuVeic" class="cte-entrada">${cad.veiculos.map((v) => `<option value="${v.id}" ${c?.veiculo_id === v.id ? 'selected' : ''}>${esc(v.placa)}</option>`).join('')}</select></div></div>
      ${c ? `<label style="display:flex; gap:8px; align-items:center; font-size:13.5px; margin:6px 0;"><input type="checkbox" id="ccuAtivo" ${c.ativo ? 'checked' : ''} /> Ativo</label>` : ''}
      <p style="font-size:12.5px; color:var(--texto-fraco);">Filial: a receita dos CT-e dela vem para este centro. Veículo: abastecimentos, manutenções e acertos dele vêm para cá sozinhos.</p>
      <div style="display:flex; justify-content:flex-end; gap:8px;"><button class="btn btn-secundario" data-cm-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="ccuOk" style="width:auto;">Salvar</button></div>`);
    const ajustar = () => { const t = $('ccuTipo').value; $('ccuCampoFilial').classList.toggle('oculto', t !== 'filial'); $('ccuCampoVeic').classList.toggle('oculto', t !== 'veiculo'); };
    $('ccuTipo').addEventListener('change', ajustar); ajustar(); $('ccuNome').focus();
    $('ccuOk').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      const corpo = { nome: $('ccuNome').value, tipo: $('ccuTipo').value, unidade_id: $('ccuFilial').value, veiculo_id: $('ccuVeic').value, ...(c ? { ativo: $('ccuAtivo').checked } : {}) };
      try { if (c) await enviar(`/api/centros-custo/${c.id}`, 'PUT', corpo); else await enviar('/api/centros-custo', 'POST', corpo); fechar(); recarregar(); } catch (e) { erro(e); b.disabled = false; }
    });
  }
})();
