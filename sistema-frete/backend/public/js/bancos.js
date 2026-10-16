// =====================================================================
// Caixa e bancos: contas e saldos, movimentação com saldo dia a dia,
// conciliação do extrato OFX com faturas/contas a pagar e fluxo de caixa.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto, token.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navBancos');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const p2 = (x) => String(x).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hoje = () => ymd(new Date());
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/bancos${caminho}`, { ...opcoes, headers: opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const cor = (v) => (v < 0 ? 'color:var(--vermelho);' : v > 0 ? 'color:var(--verde);' : '');
  const valorCor = (v) => `<span style="${cor(v)} font-weight:600;">${v < 0 ? '−' : '+'} ${num(Math.abs(v))}</span>`;
  const modal = $('modalBancos');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-bx-fechar]')) fechar(); });
  const titulo = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-bx-fechar>✕</span></div>`;
  const campo = (id, rotulo, valor = '', extra = '') => `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;

  let aba = 'contas'; let dados = null; let contaSel = null;
  const estado = { de: '', ate: '', situacao: 'pendentes', dias: 30 };
  const carregarContas = async () => { dados = await api('/contas'); if (!dados.contas.some((c) => c.id === contaSel)) contaSel = (dados.contas.find((c) => c.padrao) || dados.contas[0])?.id || null; };
  const opcoesConta = (atual, filtro = () => true) => dados.contas.filter(filtro).map((c) => `<option value="${c.id}" ${c.id === Number(atual) ? 'selected' : ''}>${esc(c.nome)}${c.tipo === 'caixa' ? ' (caixa)' : ''}</option>`).join('');

  function mostrarAba(nome) {
    aba = nome;
    document.querySelectorAll('[data-bx-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.bxAba === nome));
  }
  async function carregar() {
    await carregarContas();
    if (!dados.contas.length && aba !== 'fluxo') return telaVazia();
    return ({ contas: telaContas, movimentacao: telaMovimentacao, conciliacao: telaConciliacao, fluxo: telaFluxo }[aba])();
  }
  const recarregar = () => carregar().catch(erro);
  document.querySelectorAll('[data-bx-aba]').forEach((a) => a.addEventListener('click', () => { mostrarAba(a.dataset.bxAba); recarregar(); }));
  nav.addEventListener('click', () => { mostrarAba(aba); recarregar(); });
  $('bxNovoLanc').addEventListener('click', () => (dados ? Promise.resolve() : carregarContas()).then(() => formLancamento()).catch(erro));
  $('bxTransf').addEventListener('click', () => (dados ? Promise.resolve() : carregarContas()).then(() => formTransferencia()).catch(erro));
  $('bxImportar').addEventListener('click', async () => {
    try {
      if (!dados) await carregarContas();
      const bancos = dados.contas.filter((c) => c.tipo === 'banco');
      if (!bancos.length) { mostrarAlerta('Cadastre a conta bancária primeiro (aba Contas e saldos → ＋ Nova conta).', { tipo: 'aviso' }); return; }
      if (!bancos.some((c) => c.id === contaSel)) contaSel = bancos[0].id;
      if (bancos.length > 1 && aba !== 'conciliacao') { mostrarAba('conciliacao'); await recarregar(); }
      $('bxArquivo').click();
    } catch (e) { erro(e); }
  });
  $('bxArquivo').addEventListener('change', async (e) => {
    const arq = e.target.files[0]; e.target.value = '';
    if (!arq) return;
    const fd = new FormData(); fd.append('arquivo', arq);
    const conta = dados.contas.find((c) => c.id === contaSel);
    try {
      const r = await api(`/contas/${contaSel}/extrato`, { method: 'POST', body: fd });
      mostrarAba('conciliacao'); await carregar();
      mostrarAlerta(`Extrato de ${dia(r.de)} a ${dia(r.ate)} importado em ${conta?.nome || 'conta'}: ${r.novas} lançamento(s) novo(s)${r.repetidas ? `, ${r.repetidas} já importado(s) antes` : ''}${r.antes_do_inicio ? `, ${r.antes_do_inicio} antes do saldo inicial (ignorados)` : ''}. ${r.automaticas ? `${r.automaticas} conciliado(s) sozinho(s) com o que já estava lançado.` : ''}`, { tipo: 'sucesso' });
    } catch (err) { erro(err); }
  });

  function telaVazia() {
    $('bxConteudo').innerHTML = `<div class="painel" style="padding:22px 24px; max-width:720px;">
      <h3 style="margin-top:0;">Comece cadastrando as contas</h3>
      <p style="line-height:1.6;">Cadastre cada conta bancária e o caixa (dinheiro) com o <b>saldo de um dia</b> — por exemplo, o saldo do extrato no último dia do mês passado. A partir dessa data, os recebimentos de faturas, os pagamentos de contas e os lançamentos avulsos movimentam o saldo.</p>
      <p style="line-height:1.6; font-size:13px; color:var(--texto-fraco);">Os recebimentos e pagamentos já lançados desde a data do saldo passam para a primeira conta de cada tipo (dinheiro no caixa, o resto no banco).</p>
      <button class="btn btn-primario" id="bxPrimeira" style="width:auto;">＋ Cadastrar a conta bancária</button></div>`;
    $('bxPrimeira').addEventListener('click', () => formConta());
  }

  // ---------- Contas e saldos ----------
  async function telaContas() {
    const d = dados;
    $('bxConteudo').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
        <div style="font-size:14px;">Saldo de todas as contas hoje: <b style="font-size:18px; ${cor(d.total)}">${brl(d.total)}</b></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;"><label style="font-size:12.5px; display:flex; gap:6px; align-items:center;"><input type="checkbox" id="bxInativas" /> mostrar inativas</label>
          <button class="btn btn-secundario" id="bxNovaConta" style="width:auto;">＋ Nova conta</button></div></div>
      ${d.sem_conta ? `<div class="cte-aviso" style="margin-bottom:12px;">${d.sem_conta} recebimento(s)/pagamento(s) sem conta (lançados antes da data do saldo inicial das contas). Eles não mexem no saldo.</div>` : ''}
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(min(330px, 100%), 1fr)); gap:12px;" id="bxCartoes">
        ${d.contas.map((c) => `<div class="painel" style="padding:16px 18px; ${c.ativo ? '' : 'opacity:.55;'}">
          <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
            <div><div style="font-weight:700; font-size:15px;">${c.tipo === 'caixa' ? '💵' : '🏦'} ${esc(c.nome)}</div>
              <div style="font-size:12px; color:var(--texto-fraco);">${c.tipo === 'caixa' ? 'Caixa (dinheiro)' : [c.banco_codigo && `banco ${esc(c.banco_codigo)}`, c.agencia && `ag. ${esc(c.agencia)}`, c.numero && `c/c ${esc(c.numero)}`].filter(Boolean).join(' · ') || 'Conta bancária'}
              ${c.padrao ? ' · <b>padrão</b>' : ''}${c.ativo ? '' : ' · inativa'}</div></div>
            <button class="btn btn-secundario" data-bx-editar="${c.id}" style="width:auto; padding:4px 10px; font-size:12px;">Editar</button></div>
          <div style="font-size:24px; font-weight:700; margin:10px 0 2px; ${cor(c.saldo)}">${brl(c.saldo)}</div>
          <div style="font-size:12px; color:var(--texto-fraco);">saldo hoje · desde ${dia(c.saldo_inicial_data)} (inicial ${brl(c.saldo_inicial)})</div>
          ${c.ultimo_extrato?.saldo_banco != null ? `<div style="margin-top:10px; font-size:12.5px; line-height:1.6; border-top:1px solid var(--borda); padding-top:8px;">
            Banco em ${dia(c.ultimo_extrato.saldo_banco_data)}: <b>${brl(c.ultimo_extrato.saldo_banco)}</b> · sistema: <b>${brl(c.saldo_sistema_na_data)}</b><br>
            ${Math.abs(c.diferenca) < 0.005 ? '<span class="oc-sit entregue">✓ Bate com o banco</span>' : `<span class="oc-sit cancelado">Diferença de ${brl(c.diferenca)}</span> <small>concilie o extrato</small>`}</div>` : ''}
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
            <button class="btn btn-secundario" data-bx-mov="${c.id}" style="width:auto; padding:5px 10px; font-size:12.5px;">📜 Movimentação</button>
            ${c.tipo === 'banco' ? `<button class="btn ${c.pendentes ? 'btn-primario' : 'btn-secundario'}" data-bx-conc="${c.id}" style="width:auto; padding:5px 10px; font-size:12.5px;">🔗 Conciliar${c.pendentes ? ` (${c.pendentes})` : ''}</button>` : ''}</div>
        </div>`).join('')}</div>`;
    $('bxNovaConta').addEventListener('click', () => formConta());
    $('bxInativas').addEventListener('change', async (e) => { try { dados = await api(`/contas${e.target.checked ? '?todas=1' : ''}`); const marcado = e.target.checked; await telaContas(); $('bxInativas').checked = marcado; } catch (err) { erro(err); } });
    document.querySelectorAll('[data-bx-editar]').forEach((b) => b.addEventListener('click', () => formConta(dados.contas.find((c) => c.id === Number(b.dataset.bxEditar)))));
    document.querySelectorAll('[data-bx-mov]').forEach((b) => b.addEventListener('click', () => { contaSel = Number(b.dataset.bxMov); mostrarAba('movimentacao'); recarregar(); }));
    document.querySelectorAll('[data-bx-conc]').forEach((b) => b.addEventListener('click', () => { contaSel = Number(b.dataset.bxConc); mostrarAba('conciliacao'); recarregar(); }));
  }

  function formConta(c = null) {
    const ed = !!c;
    $('bxModalConteudo').innerHTML = `${titulo(ed ? `Editar ${esc(c.nome)}` : 'Nova conta')}
      <div class="cte-grade">
        <div class="campo"><label for="bxTipo">Tipo</label><select id="bxTipo" class="cte-entrada" ${ed ? 'disabled' : ''}><option value="banco">Conta bancária</option><option value="caixa" ${c?.tipo === 'caixa' ? 'selected' : ''}>Caixa (dinheiro)</option></select></div>
        ${campo('bxNome', 'Nome', c?.nome, 'placeholder="ex.: Itaú 12345-6" maxlength="80"')}
        <div class="bx-so-banco" style="display:contents;">${campo('bxBanco', 'Código do banco', c?.banco_codigo, 'placeholder="341" maxlength="5" inputmode="numeric"')}
        ${campo('bxAgencia', 'Agência', c?.agencia, 'maxlength="12"')}${campo('bxNumero', 'Conta corrente', c?.numero, 'placeholder="12345-6" maxlength="25"')}</div>
        ${campo('bxSaldo', 'Saldo inicial (R$)', c ? num(c.saldo_inicial) : '', 'inputmode="decimal" placeholder="0,00"')}
        ${campo('bxSaldoData', 'Saldo no fim do dia', c?.saldo_inicial_data || hoje(), 'type="date"')}
        ${campo('bxContabil', 'Conta contábil (opcional)', c?.conta_contabil, 'placeholder="ex.: 1.1.1.02" maxlength="40"')}
      </div>
      <p style="font-size:12px; color:var(--texto-fraco); margin:4px 0 10px;">Saldo inicial = o saldo do extrato no fim do dia escolhido. Tudo o que for desse dia em diante movimenta a conta.</p>
      <label style="display:flex; gap:8px; align-items:center; font-size:13.5px; margin-bottom:6px;" class="bx-so-banco"><input type="checkbox" id="bxPadrao" ${c?.padrao ? 'checked' : ''} /> Conta padrão (recebe os PIX, boletos e pagamentos quando não se escolhe a conta)</label>
      ${ed ? `<label style="display:flex; gap:8px; align-items:center; font-size:13.5px;"><input type="checkbox" id="bxAtiva" ${c.ativo ? 'checked' : ''} /> Ativa</label>` : ''}
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;"><button class="btn btn-secundario" data-bx-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="bxSalvarConta" style="width:auto;">Salvar</button></div>`;
    const tipo = () => $('bxTipo').value;
    const ajustar = () => document.querySelectorAll('.bx-so-banco').forEach((x) => { x.style.display = tipo() === 'banco' ? (x.tagName === 'LABEL' ? 'flex' : 'contents') : 'none'; });
    $('bxTipo').addEventListener('change', ajustar); ajustar();
    modal.classList.remove('oculto'); $('bxNome').focus();
    $('bxSalvarConta').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      const corpo = { tipo: tipo(), nome: $('bxNome').value, banco_codigo: $('bxBanco').value, agencia: $('bxAgencia').value, numero: $('bxNumero').value,
        saldo_inicial: $('bxSaldo').value, saldo_inicial_data: $('bxSaldoData').value, conta_contabil: $('bxContabil').value, padrao: $('bxPadrao').checked, ...(ed ? { ativo: $('bxAtiva').checked } : {}) };
      try {
        const r = ed ? await enviar(`/contas/${c.id}`, 'PUT', corpo) : await enviar('/contas', 'POST', corpo);
        fechar(); contaSel = r.id; await carregar();
        if (r.adotados) mostrarAlerta(`Conta criada. ${r.adotados} recebimento(s)/pagamento(s) desde ${dia(r.saldo_inicial_data)} passaram para ela.`, { tipo: 'sucesso' });
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  function formLancamento() {
    if (!dados?.contas.length) { mostrarAlerta('Cadastre uma conta primeiro.', { tipo: 'aviso' }); return; }
    const cats = Object.entries(dados.categorias).filter(([k]) => k !== 'transferencia');
    $('bxModalConteudo').innerHTML = `${titulo('Lançamento avulso')}
      <p style="font-size:12.5px; color:var(--texto-fraco); margin-top:0;">Para o que não é fatura nem conta a pagar: tarifa, rendimento, aporte ou retirada dos sócios, despesa paga no caixa…</p>
      <div class="cte-grade">
        <div class="campo"><label for="bxLConta">Conta</label><select id="bxLConta" class="cte-entrada">${opcoesConta(contaSel)}</select></div>
        <div class="campo"><label for="bxLSentido">Entrada ou saída</label><select id="bxLSentido" class="cte-entrada"><option value="saida">Saída (−)</option><option value="entrada">Entrada (+)</option></select></div>
        <div class="campo"><label for="bxLCat">Categoria</label><select id="bxLCat" class="cte-entrada">${cats.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
        ${campo('bxLValor', 'Valor (R$)', '', 'inputmode="decimal"')}${campo('bxLData', 'Data', hoje(), 'type="date"')}${campo('bxLDesc', 'Descrição', '', 'maxlength="200"')}
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;"><button class="btn btn-secundario" data-bx-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="bxLOk" style="width:auto;">Lançar</button></div>`;
    $('bxLCat').addEventListener('change', () => { const c = $('bxLCat').value; if (['rendimento', 'aporte'].includes(c)) $('bxLSentido').value = 'entrada'; if (['tarifa', 'juros_pagos', 'retirada'].includes(c)) $('bxLSentido').value = 'saida'; });
    modal.classList.remove('oculto'); $('bxLValor').focus();
    $('bxLOk').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        await enviar('/movimentos', 'POST', { conta_id: $('bxLConta').value, sentido: $('bxLSentido').value, categoria: $('bxLCat').value, valor: $('bxLValor').value, data: $('bxLData').value, descricao: $('bxLDesc').value });
        fechar(); await carregar();
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  function formTransferencia() {
    if ((dados?.contas.length || 0) < 2) { mostrarAlerta('Para transferir, cadastre pelo menos duas contas (ex.: o banco e o caixa).', { tipo: 'aviso' }); return; }
    const outra = dados.contas.find((c) => c.id !== contaSel)?.id;
    $('bxModalConteudo').innerHTML = `${titulo('Transferência entre contas')}
      <p style="font-size:12.5px; color:var(--texto-fraco); margin-top:0;">Saque para o caixa, depósito do caixa no banco, TED entre contas da empresa.</p>
      <div class="cte-grade">
        <div class="campo"><label for="bxTDe">De</label><select id="bxTDe" class="cte-entrada">${opcoesConta(contaSel)}</select></div>
        <div class="campo"><label for="bxTPara">Para</label><select id="bxTPara" class="cte-entrada">${opcoesConta(outra)}</select></div>
        ${campo('bxTValor', 'Valor (R$)', '', 'inputmode="decimal"')}${campo('bxTData', 'Data', hoje(), 'type="date"')}${campo('bxTDesc', 'Descrição (opcional)', '', 'maxlength="200"')}
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;"><button class="btn btn-secundario" data-bx-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="bxTOk" style="width:auto;">Transferir</button></div>`;
    modal.classList.remove('oculto'); $('bxTValor').focus();
    $('bxTOk').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        await enviar('/movimentos', 'POST', { conta_id: $('bxTDe').value, destino_id: $('bxTPara').value, categoria: 'transferencia', valor: $('bxTValor').value, data: $('bxTData').value, descricao: $('bxTDesc').value });
        fechar(); await carregar();
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  // ---------- Movimentação ----------
  const ORIGEM = { recebimento: ['Fatura', 'entregue'], pagamento: ['Conta a pagar', 'ocorrencia'], movimento: ['Avulso', 'pendente'] };
  async function telaMovimentacao() {
    ({ de: estado.de, ate: estado.ate } = Periodo.atual('bancos-movimentacao', 'mes'));
    const m = await api(`/contas/${contaSel}/movimentos?de=${estado.de}&ate=${estado.ate}`);
    $('bxConteudo').innerHTML = `
      <div class="oc-barra" style="flex-wrap:wrap; gap:8px; align-items:center; justify-content:flex-start;">
        <select id="bxMConta" class="cte-entrada" style="width:auto;">${opcoesConta(contaSel)}</select>
        ${Periodo.html('bxM')}</div>
      <div class="oc-resumo">
        <div>Saldo anterior<b>${brl(m.saldo_anterior)}</b><span>no início de ${dia(m.de)}</span></div>
        <div>Entradas<b style="color:var(--verde);">${brl(m.entradas)}</b><span>${m.linhas.filter((l) => l.valor > 0).length} lançamento(s)</span></div>
        <div>Saídas<b style="color:var(--vermelho);">${brl(m.saidas)}</b><span>${m.linhas.filter((l) => l.valor < 0).length} lançamento(s)</span></div>
        <div>Saldo em ${dia(m.ate)}<b style="${cor(m.saldo_final)}">${brl(m.saldo_final)}</b><span>${m.conta.tipo === 'caixa' ? 'caixa' : 'no sistema'}</span></div>
      </div>
      <div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Data</th><th>Descrição</th><th>Origem</th><th class="n">Valor</th><th class="n">Saldo</th><th>Extrato</th><th></th></tr></thead><tbody>
        ${m.linhas.map((l) => `<tr><td>${dia(l.data)}</td><td style="white-space:normal;">${esc(l.descricao)}${l.documento ? ` <small style="color:var(--texto-fraco);">${esc(l.documento)}</small>` : ''}</td>
          <td><span class="oc-sit ${ORIGEM[l.origem][1]}">${l.categoria_nome ? esc(l.categoria_nome) : ORIGEM[l.origem][0]}</span></td><td class="n">${valorCor(l.valor)}</td>
          <td class="n" style="${l.saldo < 0 ? 'color:var(--vermelho);' : ''}">${num(l.saldo)}</td><td>${l.conciliado ? '<span title="Conciliado com o extrato do banco">✓</span>' : m.conta.tipo === 'caixa' ? '' : '<span style="color:var(--texto-fraco);" title="Ainda não apareceu num extrato importado">—</span>'}</td>
          <td>${l.origem === 'movimento' ? `<button class="btn btn-secundario" data-bx-excluir="${l.id}" style="width:auto; padding:2px 8px; font-size:12px;" title="Excluir">✕</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="7" style="color:var(--texto-fraco);">Nenhuma movimentação no período.</td></tr>'}
      </tbody></table></div></div>`;
    Periodo.ligar({ select: $('bxMPer'), de: $('bxMDe'), ate: $('bxMAte'), chave: 'bancos-movimentacao', padrao: 'mes', aoMudar: () => telaMovimentacao().catch(erro) });
    $('bxMConta').addEventListener('change', () => { contaSel = Number($('bxMConta').value); telaMovimentacao().catch(erro); });
    document.querySelectorAll('[data-bx-excluir]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Excluir este lançamento? Se for transferência, sai das duas contas. Se estava conciliado, a linha do extrato volta para conciliar.', { tipo: 'perigo', textoOk: 'Excluir' })) return;
      try { await api(`/movimentos/${b.dataset.bxExcluir}`, { method: 'DELETE' }); await carregar(); } catch (e) { erro(e); }
    }));
  }

  // ---------- Conciliação ----------
  async function telaConciliacao() {
    const bancos = dados.contas.filter((c) => c.tipo === 'banco');
    if (!bancos.length) { $('bxConteudo').innerHTML = '<div class="kanban-vazio">Cadastre a conta bancária (aba Contas e saldos) para importar o extrato.</div>'; return; }
    if (!bancos.some((c) => c.id === contaSel)) contaSel = bancos[0].id;
    const x = await api(`/contas/${contaSel}/extrato?situacao=${estado.situacao}`);
    const conta = dados.contas.find((c) => c.id === contaSel);
    const cats = Object.entries(x.categorias).filter(([k]) => k !== 'transferencia');
    const opcoes = (l) => {
      const s = l.sugestoes.map((g, i) => `<option value="s${i}">${g.score >= 70 ? '★ ' : ''}${esc(g.rotulo)}</option>`).join('');
      const lancar = cats.filter(([k]) => !l.sugestoes.some((g) => g.acao === 'lancar' && g.categoria === k)).map(([k, t]) => `<option value="c:${k}">Lançar como: ${t}</option>`).join('');
      return `${s ? `<optgroup label="Sugestões">${s}</optgroup>` : '<option value="">— escolha o que é —</option>'}<optgroup label="Outros">${l.valor > 0 ? '<option value="fatura">Baixar outra fatura (informar o número)…</option>' : ''}${lancar}<option value="ignorar">Ignorar (não entra no sistema)</option></optgroup>`;
    };
    const pend = x.linhas.filter((l) => !l.conciliado_tipo);
    $('bxConteudo').innerHTML = `
      <div class="oc-barra" style="flex-wrap:wrap; gap:8px; align-items:center;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <select id="bxCConta" class="cte-entrada" style="width:auto;">${opcoesConta(contaSel, (c) => c.tipo === 'banco')}</select>
          <select id="bxCSit" class="cte-entrada" style="width:auto;"><option value="pendentes">A conciliar (${x.totais.pendentes})</option><option value="conciliadas" ${estado.situacao === 'conciliadas' ? 'selected' : ''}>Conciliadas</option><option value="todas" ${estado.situacao === 'todas' ? 'selected' : ''}>Todas (${x.totais.total})</option></select>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${pend.length ? '<button class="btn btn-secundario" id="bxCAuto" style="width:auto;">⚡ Conciliar automático</button><button class="btn btn-primario" id="bxCLote" style="width:auto;">✓ Confirmar marcadas</button>' : ''}</div></div>
      ${conta?.ultimo_extrato?.saldo_banco != null ? `<div class="oc-resumo" style="margin-bottom:12px;">
        <div>Saldo do banco<b>${brl(conta.ultimo_extrato.saldo_banco)}</b><span>em ${dia(conta.ultimo_extrato.saldo_banco_data)} (último extrato)</span></div>
        <div>Saldo no sistema<b>${brl(conta.saldo_sistema_na_data)}</b><span>na mesma data</span></div>
        <div>Diferença<b style="${Math.abs(conta.diferenca) < 0.005 ? 'color:var(--verde);' : 'color:var(--vermelho);'}">${brl(conta.diferenca)}</b><span>${Math.abs(conta.diferenca) < 0.005 ? 'tudo conciliado' : 'concilie as linhas abaixo'}</span></div>
        <div>A conciliar<b>${x.totais.pendentes}</b><span>linha(s) do extrato</span></div></div>` : ''}
      ${!x.totais.total ? `<div class="painel" style="padding:18px 20px;"><b>Nenhum extrato importado nesta conta.</b><p style="margin:8px 0 0; line-height:1.6; font-size:13.5px;">No internet banking, exporte o extrato da conta corrente em <b>OFX</b> (às vezes aparece como "Money" ou "Quicken") e clique em <b>📥 Importar extrato (OFX)</b>. O que já está lançado (boletos baixados pelo retorno, PIX recebidos, contas pagas) é conciliado sozinho; o resto aparece aqui com a sugestão do que é.</p></div>` : ''}
      ${x.linhas.length ? `<div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr>${pend.length ? '<th style="width:28px;"><input type="checkbox" id="bxCTodas" title="Marcar todas com sugestão" /></th>' : ''}<th>Data</th><th>Histórico do banco</th><th class="n">Valor</th><th style="min-width:300px;">O que é</th><th></th></tr></thead><tbody>
        ${x.linhas.map((l) => `<tr data-linha="${l.id}">
          ${pend.length ? `<td>${l.conciliado_tipo ? '' : `<input type="checkbox" class="bx-marca" ${l.sugestoes[0]?.score >= 70 ? 'checked' : ''} ${l.sugestoes.length ? '' : 'disabled'} />`}</td>` : ''}
          <td>${dia(l.data)}</td><td style="white-space:normal;">${esc(l.descricao)}${l.documento ? ` <small style="color:var(--texto-fraco);">doc ${esc(l.documento)}</small>` : ''}</td><td class="n">${valorCor(l.valor)}</td>
          <td style="white-space:normal;">${l.conciliado_tipo
    ? `<span class="oc-sit ${l.conciliado_tipo === 'ignorado' ? 'pendente' : 'entregue'}">${l.conciliado_tipo === 'ignorado' ? 'Ignorada' : { vinculou: 'Conciliada', baixou: 'Baixada', lancou: 'Lançada' }[l.conciliado_acao] || 'Conciliada'}</span> ${esc(l.vinculo || '')}`
    : `<select class="cte-entrada bx-opcao" style="padding:5px 8px; font-size:12.5px;">${opcoes(l)}</select>`}</td>
          <td>${l.conciliado_tipo ? '<button class="btn btn-secundario bx-desfazer" style="width:auto; padding:3px 8px; font-size:12px;">Desfazer</button>' : '<button class="btn btn-secundario bx-ok" style="width:auto; padding:3px 10px; font-size:12px;">OK</button>'}</td></tr>`).join('')}
      </tbody></table></div></div>` : (x.totais.total ? '<div class="kanban-vazio">Nada aqui. ✓</div>' : '')}`;
    const recarregarConc = () => carregar().catch(erro);
    $('bxCConta').addEventListener('change', (e) => { contaSel = Number(e.target.value); recarregarConc(); });
    $('bxCSit').addEventListener('change', (e) => { estado.situacao = e.target.value; recarregarConc(); });
    $('bxCTodas')?.addEventListener('change', (e) => document.querySelectorAll('.bx-marca:not(:disabled)').forEach((c) => { c.checked = e.target.checked; }));
    // Escolheu o que é: a linha entra no "Confirmar marcadas".
    document.querySelectorAll('.bx-opcao').forEach((sel) => sel.addEventListener('change', () => {
      const c = sel.closest('tr').querySelector('.bx-marca'); if (!c) return;
      c.disabled = !sel.value; c.checked = !!sel.value;
    }));
    const linhaDe = (tr) => x.linhas.find((l) => l.id === Number(tr.dataset.linha));
    // O que vai para a API a partir da escolha da linha.
    const pedido = async (tr) => {
      const l = linhaDe(tr); const v = tr.querySelector('.bx-opcao')?.value || '';
      if (!v) return null;
      if (v === 'ignorar') return { acao: 'ignorar' };
      if (v.startsWith('c:')) return { acao: 'lancar', categoria: v.slice(2) };
      if (v === 'fatura') { const n = await pedirTexto('Número da fatura a baixar com este crédito:', { titulo: 'Baixar fatura', textoOk: 'Baixar' }); return n ? { acao: 'baixar_fatura', numero: n.trim() } : null; }
      const g = l.sugestoes[Number(v.slice(1))];
      return g ? { acao: g.acao, tipo: g.tipo, id: g.id, categoria: g.categoria } : null;
    };
    document.querySelectorAll('.bx-ok').forEach((b) => b.addEventListener('click', async () => {
      const tr = b.closest('tr');
      try {
        const p = await pedido(tr);
        if (!p) { mostrarAlerta('Escolha o que é esta linha do extrato.', { tipo: 'aviso' }); return; }
        b.disabled = true;
        await enviar(`/extrato/${tr.dataset.linha}/conciliar`, 'POST', p);
        await carregar();
      } catch (e) { erro(e); b.disabled = false; }
    }));
    document.querySelectorAll('.bx-desfazer').forEach((b) => b.addEventListener('click', async () => {
      const l = linhaDe(b.closest('tr'));
      const msg = l.conciliado_acao === 'baixou' ? 'Desfazer? A baixa feita pela conciliação é estornada (a fatura/conta volta a ficar em aberto).'
        : l.conciliado_acao === 'lancou' ? 'Desfazer? O lançamento avulso criado pela conciliação é excluído.' : 'Desfazer? A linha volta para "a conciliar" (o lançamento continua no sistema).';
      if (!await confirmar(msg, { textoOk: 'Desfazer' })) return;
      try { await api(`/extrato/${l.id}/desfazer`, { method: 'POST' }); await carregar(); } catch (e) { erro(e); }
    }));
    $('bxCAuto')?.addEventListener('click', async () => {
      try { const r = await api(`/contas/${contaSel}/conciliar-automatico`, { method: 'POST' }); await carregar(); mostrarAlerta(r.conciliadas ? `${r.conciliadas} linha(s) conciliada(s).` : 'Nada para conciliar sozinho: confira as sugestões.', { tipo: r.conciliadas ? 'sucesso' : 'info' }); } catch (e) { erro(e); }
    });
    $('bxCLote')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      const trs = [...document.querySelectorAll('.bx-marca:checked')].map((c) => c.closest('tr'));
      if (!trs.length) { mostrarAlerta('Marque as linhas cuja escolha está certa.', { tipo: 'aviso' }); return; }
      const itens = [];
      for (const tr of trs) { const p = await pedido(tr); if (p) itens.push({ linha_id: Number(tr.dataset.linha), ...p }); }
      if (!itens.length) return;
      const baixas = itens.filter((i) => ['baixar_fatura', 'pagar_conta'].includes(i.acao)).length;
      if (!await confirmar(`Confirmar ${itens.length} linha(s)?${baixas ? ` ${baixas} delas dão baixa em fatura/conta a pagar.` : ''}`, { textoOk: 'Confirmar' })) return;
      b.disabled = true;
      try {
        const r = await enviar('/extrato/conciliar-lote', 'POST', { itens });
        await carregar();
        mostrarAlerta(`${r.ok} linha(s) conciliada(s).${r.erros.length ? ` ${r.erros.length} com erro: ${r.erros.map((e) => e.erro).join(' · ')}` : ''}`, { tipo: r.erros.length ? 'aviso' : 'sucesso' });
      } catch (e) { erro(e); b.disabled = false; }
    });
  }

  // ---------- Fluxo de caixa ----------
  async function telaFluxo() {
    const f = await api(`/fluxo?dias=${estado.dias}`);
    const aberta = new Set();
    $('bxConteudo').innerHTML = `
      <div class="oc-barra" style="flex-wrap:wrap; gap:8px; align-items:center; justify-content:flex-start;">
        <span style="font-size:13px;">Próximos</span>${[30, 60, 90].map((d) => `<button class="btn ${estado.dias === d ? 'btn-primario' : 'btn-secundario'}" data-bx-dias="${d}" style="width:auto;">${d} dias</button>`).join('')}</div>
      <div class="oc-resumo">
        <div>Saldo hoje<b style="${cor(f.saldo_atual)}">${brl(f.saldo_atual)}</b><span>${f.contas.length} conta(s)</span></div>
        <div>A receber<b style="color:var(--verde);">${brl(f.entradas)}</b><span>faturas até ${dia(f.ate)}</span></div>
        <div>A pagar<b style="color:var(--vermelho);">${brl(f.saidas)}</b><span>contas até ${dia(f.ate)}</span></div>
        <div>Saldo previsto<b style="${cor(f.saldo_final)}">${brl(f.saldo_final)}</b><span>em ${dia(f.ate)}${f.menor_saldo && f.menor_saldo.valor < 0 ? ` · fica negativo na semana de ${dia(f.menor_saldo.semana)}` : ''}</span></div>
      </div>
      ${[f.vencidos.pagar ? `<b>${brl(f.vencidos.pagar)}</b> de contas a pagar já vencidas (entram na primeira semana).` : '', f.vencidos.receber ? `<b>${brl(f.vencidos.receber)}</b> de faturas vencidas e não recebidas (entram na primeira semana — cobre).` : '',
    f.a_faturar.qtd ? `${f.a_faturar.qtd} CT-e ainda sem fatura (${brl(f.a_faturar.valor)}): não entram no fluxo até serem faturados.` : ''].filter(Boolean).map((t) => `<div class="cte-aviso" style="margin-bottom:8px;">${t}</div>`).join('')}
      <div class="painel" style="padding:12px 14px;"><div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Semana</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Saldo previsto</th><th style="width:30%;"></th></tr></thead><tbody id="bxFCorpo"></tbody></table></div>
      <p style="font-size:12px; color:var(--texto-fraco); margin:10px 0 0;">Previsão pelo vencimento das faturas em aberto e das contas a pagar. Clique na semana para ver o que vence nela.</p></div>`;
    const maior = Math.max(1, ...f.semanas.map((s) => Math.abs(s.saldo)));
    const desenhar = () => {
      $('bxFCorpo').innerHTML = f.semanas.map((s, i) => `<tr data-sem="${i}" style="cursor:pointer;"><td>${aberta.has(i) ? '▾' : '▸'} ${dia(s.de)} a ${dia(s.ate)}${i === 0 && (f.vencidos.pagar || f.vencidos.receber) ? ' <small>(+ vencidos)</small>' : ''}</td>
        <td class="n" style="color:var(--verde);">${s.entradas ? num(s.entradas) : '—'}</td><td class="n" style="color:var(--vermelho);">${s.saidas ? num(s.saidas) : '—'}</td>
        <td class="n" style="font-weight:700; ${cor(s.saldo)}">${num(s.saldo)}</td>
        <td><div style="height:10px; border-radius:5px; background:${s.saldo < 0 ? 'var(--vermelho)' : 'var(--verde)'}; opacity:.75; width:${Math.max(2, (Math.abs(s.saldo) / maior) * 100)}%;"></div></td></tr>
        ${aberta.has(i) ? (s.itens.map((it) => `<tr style="font-size:12.5px;"><td style="padding-left:26px; white-space:normal;" colspan="3">${dia(it.data)} · ${esc(it.descricao)}${it.vencido ? ' <span class="oc-sit cancelado">vencido</span>' : ''}</td>
          <td class="n">${it.sentido === 'entrada' ? `<span style="color:var(--verde);">+ ${num(it.valor)}</span>` : `<span style="color:var(--vermelho);">− ${num(it.valor)}</span>`}</td><td></td></tr>`).join('') || '<tr><td colspan="5" style="padding-left:26px; color:var(--texto-fraco);">Nada vence nesta semana.</td></tr>') : ''}`).join('');
      document.querySelectorAll('[data-sem]').forEach((tr) => tr.addEventListener('click', () => { const i = Number(tr.dataset.sem); if (aberta.has(i)) aberta.delete(i); else aberta.add(i); desenhar(); }));
    };
    desenhar();
    document.querySelectorAll('[data-bx-dias]').forEach((b) => b.addEventListener('click', () => { estado.dias = Number(b.dataset.bxDias); telaFluxo().catch(erro); }));
  }
})();
