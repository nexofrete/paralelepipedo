// =====================================================================
// Frota: abastecimentos (consumo km/l), manutenções preventivas e
// corretivas, plano preventivo por km/data e custo por km de cada veículo.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navFrota');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const n = (v, c = 0) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const lerNum = (v) => { const t = String(v ?? '').trim(); if (!t) return null; const x = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(x) ? x : null; };
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const p2 = (x) => String(x).padStart(2, '0');
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/frota${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (caminho, metodo, corpo) => api(caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined });
  const modal = $('modalFrota');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-fv-fechar]')) fechar(); });
  const titulo = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-fv-fechar>✕</span></div>`;
  const campo = (id, rotulo, valor = '', extra = '', classe = '') => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;
  const SIT_PLANO = { vencido: ['Vencido', 'cancelado'], vencendo: ['Vencendo', 'ocorrencia'], em_dia: ['Em dia', 'entregue'], sem_base: ['Falta a última vez', 'pendente'] };
  const SIT_MANUT = { agendada: 'pendente', em_andamento: 'em_transito', concluida: 'entregue', cancelada: 'cancelado' };

  let cat = null; let aba = 'painel';
  const estado = { de: '', ate: '', veiculo: '', status: 'todas' };
  const carregarCatalogo = async () => { cat = await api('/catalogo'); };
  const opcoesVeiculos = (atual, { todos = false, soAtivos = true } = {}) => `${todos ? '<option value="">Todos os veículos</option>' : '<option value="">— escolha —</option>'}${cat.veiculos.filter((v) => !soAtivos || v.ativo || v.id === Number(atual))
    .map((v) => `<option value="${v.id}" ${Number(atual) === v.id ? 'selected' : ''}>${esc(v.placa)}${v.descricao ? ` — ${esc(v.descricao)}` : ''}${v.tipo === 'reboque' ? ' (reboque)' : ''}</option>`).join('')}`;

  function mostrarAba(nome) {
    aba = nome;
    document.querySelectorAll('[data-fv-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.fvAba === nome));
  }
  async function carregar() {
    Object.assign(estado, (({ de, ate }) => ({ de, ate }))(Periodo.atual('frota', 'mes')));
    if (!cat) await carregarCatalogo();
    if (!cat.veiculos.length) {
      $('fvConteudo').innerHTML = '<div class="kanban-vazio">Cadastre os veículos primeiro em Operação de Transporte → 🚛 Veículos e motoristas.</div>';
      return;
    }
    await ({ painel: telaPainel, abastecimentos: telaAbastecimentos, manutencoes: telaManutencoes, planos: telaPlanos, documentos: telaDocumentos, pneus: telaPneus, jornada: telaJornada }[aba])();
  }
  document.querySelectorAll('[data-fv-aba]').forEach((a) => a.addEventListener('click', () => { mostrarAba(a.dataset.fvAba); carregar().catch(erro); }));
  nav.addEventListener('click', () => { mostrarAba(aba); carregarCatalogo().then(carregar).catch(erro); });
  $('fvNovoAbast').addEventListener('click', () => (cat ? Promise.resolve() : carregarCatalogo()).then(() => formAbastecimento()).catch(erro));
  $('fvNovaManut').addEventListener('click', () => (cat ? Promise.resolve() : carregarCatalogo()).then(() => formManutencao()).catch(erro));
  const recarregar = async () => { await carregarCatalogo(); await carregar(); };

  // Período igual ao das outras telas (js/periodo.js): aplica na hora e lembra a escolha.
  const barraPeriodo = (extra = '') => `<div class="oc-barra" style="flex-wrap:wrap; gap:8px; align-items:center; justify-content:flex-start;">${Periodo.html('fv')}${extra}</div>`;
  const ligarPeriodo = (fn) => {
    Periodo.ligar({ select: $('fvPer'), de: $('fvDe'), ate: $('fvAte'), chave: 'frota', padrao: 'mes', aoMudar: (de, ate) => { estado.de = de; estado.ate = ate; fn().catch(erro); } });
    $('fvVeic')?.addEventListener('change', () => { estado.veiculo = $('fvVeic').value; fn().catch(erro); });
    $('fvStatus')?.addEventListener('change', () => { estado.status = $('fvStatus').value; fn().catch(erro); });
  };

  // ======================= Painel =======================
  async function telaPainel() {
    const p = await api(`/painel?${new URLSearchParams({ de: estado.de, ate: estado.ate })}`);
    if (!estado.de) { estado.de = p.periodo.de; estado.ate = p.periodo.ate; }
    const t = p.totais; const a = p.alertas;
    const itensAlerta = [
      ...a.planos_vencidos.map((x) => `<li><span class="oc-sit cancelado">Vencido</span> <b>${esc(x.placa)}</b> — ${esc(x.item)} ${detalhePlano(x)}</li>`),
      ...a.planos_vencendo.map((x) => `<li><span class="oc-sit ocorrencia">Vencendo</span> <b>${esc(x.placa)}</b> — ${esc(x.item)} ${detalhePlano(x)}</li>`),
      ...a.oficina.map((x) => `<li><span class="oc-sit ${SIT_MANUT[x.status]}">${esc(x.status_texto)}</span> <b>${esc(x.placa)}</b> — ${esc(x.descricao)}${x.oficina_nome ? ` (${esc(x.oficina_nome)})` : ''} · ${dia(x.data)}</li>`),
      ...a.consumo.map((x) => `<li><span class="oc-sit ocorrencia">Consumo alto</span> <b>${esc(x.placa)}</b> — média ${n(x.consumo_medio, 2)} km/l, esperado ${n(x.consumo_referencia, 2)} km/l. Confira vazamento, pneus, rota ou desvio de combustível.</li>`),
      ...a.cnh.map((x) => `<li><span class="oc-sit ${x.vencida ? 'cancelado' : 'ocorrencia'}">CNH ${x.vencida ? 'vencida' : 'vencendo'}</span> <b>${esc(x.nome)}</b> — validade ${dia(x.cnh_validade)}</li>`),
    ];
    $('fvConteudo').innerHTML = `${barraPeriodo()}
      <div class="oc-resumo" style="margin-top:10px;">
        <div>Km rodados<b>${n(t.km)}</b><span>${n(t.litros, 0)} litros de combustível</span></div>
        <div>Combustível<b>${brl(t.combustivel)}</b><span>${t.km ? `${brl(t.combustivel / t.km)}/km` : '—'}</span></div>
        <div>Manutenção<b>${brl(t.manutencao)}</b><span>${t.km ? `${brl(t.manutencao / t.km)}/km` : '—'}</span></div>
        <div>Custo por km<b>${t.custo_km != null ? brl(t.custo_km) : '—'}</b><span>combustível + manutenção</span></div>
      </div>
      <div class="painel" style="padding:14px 18px; margin-bottom:14px;"><h4 style="margin:0 0 8px;">⚠ Atenção (${itensAlerta.length})</h4>
        ${itensAlerta.length ? `<ul style="margin:0; padding-left:18px; line-height:1.9; font-size:13.5px;">${itensAlerta.join('')}</ul>` : '<div style="color:var(--texto-fraco); font-size:13.5px;">Nada vencido ou vencendo. 👍</div>'}</div>
      <div class="painel oc-painel"><div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Veículo</th><th class="n">Km atual</th><th class="n">Km no período</th><th class="n">Litros</th>
        <th class="n">Média km/l</th><th class="n">Combustível</th><th class="n">Manutenção</th><th class="n">Total</th><th class="n">Custo/km</th><th></th></tr></thead><tbody>
        ${p.veiculos.map((v) => `<tr><td><b>${esc(v.placa)}</b>${v.descricao ? `<br><small style="color:var(--texto-fraco);">${esc(v.descricao)}</small>` : ''}</td>
          <td class="n">${n(v.km_atual)}</td><td class="n">${v.km_rodados ? n(v.km_rodados) : '—'}</td><td class="n">${v.litros ? n(v.litros, 0) : '—'}</td>
          <td class="n" style="${v.alerta_consumo ? 'color:#d97706; font-weight:700;' : ''}">${v.consumo_medio ? n(v.consumo_medio, 2) : '—'}${v.consumo_referencia ? `<br><small style="color:var(--texto-fraco); font-weight:400;">ref. ${n(v.consumo_referencia, 2)}</small>` : ''}</td>
          <td class="n">${brl(v.combustivel)}</td><td class="n">${brl(v.manutencao)}</td><td class="n"><b>${brl(v.total)}</b></td>
          <td class="n">${v.custo_km != null ? `<b>${brl(v.custo_km)}</b>` : '—'}</td>
          <td><div class="oc-linha-acoes"><button data-fv-ajustar="${v.veiculo_id}">Ajustar</button></div></td></tr>`).join('')}
        </tbody></table></div></div>
      <p style="font-size:12px; color:var(--texto-fraco);">O consumo é medido de tanque cheio a tanque cheio. Os km rodados vêm do hodômetro informado nos abastecimentos e manutenções. Custos de pedágio e motorista ficam no acerto de viagem.</p>`;
    ligarPeriodo(telaPainel);
    $('fvConteudo').querySelectorAll('[data-fv-ajustar]').forEach((b) => b.addEventListener('click', () => ajustarVeiculo(Number(b.dataset.fvAjustar))));
  }
  const detalhePlano = (x) => `<small style="color:var(--texto-fraco);">(${[x.proxima_km != null ? `km ${n(x.proxima_km)}${x.falta_km != null ? ` — ${x.falta_km <= 0 ? `passou ${n(-x.falta_km)} km` : `faltam ${n(x.falta_km)} km`}` : ''}` : '',
    x.proxima_data ? `${dia(x.proxima_data)}${x.falta_dias != null ? ` — ${x.falta_dias <= 0 ? `há ${-x.falta_dias} dia(s)` : `em ${x.falta_dias} dia(s)`}` : ''}` : ''].filter(Boolean).join(' · ')})</small>`;

  function ajustarVeiculo(id) {
    const v = cat.veiculos.find((x) => x.id === id);
    modal.classList.remove('oculto');
    $('fvModalConteudo').innerHTML = `${titulo(`🚛 ${esc(v.placa)}`)}<div class="cte-grade" style="margin-top:12px;">
        ${campo('fvAjKm', 'Km atual do hodômetro', v.km_atual ?? '', 'inputmode="numeric"')}
        ${campo('fvAjRef', 'Consumo esperado (km/l)', v.consumo_referencia != null ? n(v.consumo_referencia, 2) : '', 'inputmode="decimal" placeholder="ex.: 2,6"')}</div>
      <p style="font-size:12.5px; color:var(--texto-fraco);">O km atual sobe sozinho com os abastecimentos e manutenções; ajuste aqui só para começar ou corrigir. Com o consumo esperado, o painel avisa quando a média ficar 15% abaixo.</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="fvAjSalvar" style="width:auto;">Salvar</button></div>`;
    $('fvAjSalvar').addEventListener('click', async () => {
      try { await enviar(`/veiculos/${id}`, 'PUT', { km_atual: $('fvAjKm').value, consumo_referencia: $('fvAjRef').value }); fechar(); await recarregar(); } catch (err) { erro(err); }
    });
  }

  // ======================= Abastecimentos =======================
  async function telaAbastecimentos() {
    const lista = await api(`/abastecimentos?${new URLSearchParams({ veiculo_id: estado.veiculo, de: estado.de, ate: estado.ate })}`);
    const tot = lista.reduce((s, a) => ({ l: s.l + (a.combustivel === 'arla32' ? 0 : Number(a.litros)), v: s.v + Number(a.valor_total) }), { l: 0, v: 0 });
    $('fvConteudo').innerHTML = `${barraPeriodo(`<select id="fvVeic" class="cte-entrada" style="width:auto;">${opcoesVeiculos(estado.veiculo, { todos: true, soAtivos: false })}</select>`)}
      <div class="oc-resumo" style="margin-top:10px;"><div>Abastecimentos<b>${lista.length}</b></div><div>Litros (sem ARLA)<b>${n(tot.l, 0)}</b></div><div>Valor<b>${brl(tot.v)}</b></div>
        <div>Preço médio<b>${tot.l ? brl(lista.filter((a) => a.combustivel !== 'arla32').reduce((s, a) => s + Number(a.valor_total), 0) / tot.l) : '—'}</b><span>por litro</span></div></div>
      <div class="painel oc-painel"><div class="edi-rolagem">${lista.length ? `<table class="edi-tabela"><thead><tr><th>Data</th><th>Veículo</th><th class="n">Km</th><th>Combustível</th><th class="n">Litros</th>
        <th class="n">R$/litro</th><th class="n">Valor</th><th>Posto</th><th>Pagamento</th><th class="n">Consumo</th><th></th></tr></thead><tbody>
        ${lista.map((a) => `<tr><td>${dia(a.data)}</td><td><b>${esc(a.placa)}</b>${a.motorista_nome ? `<br><small style="color:var(--texto-fraco);">${esc(a.motorista_nome)}</small>` : ''}</td>
          <td class="n">${n(a.km)}</td><td>${esc(cat.combustiveis[a.combustivel])}${a.tanque_cheio ? '' : ' <small style="color:var(--texto-fraco);">(parcial)</small>'}</td>
          <td class="n">${n(a.litros, 1)}</td><td class="n">${n(a.preco_litro, 3)}</td><td class="n"><b>${brl(a.valor_total)}</b></td><td><small>${esc(a.posto_nome || '')}</small></td>
          <td><small>${esc(cat.pagamentos[a.pagamento])}${a.acerto_id ? ` nº ${a.acerto_id}` : ''}</small></td>
          <td class="n" style="${a.alerta_consumo ? 'color:#d97706; font-weight:700;' : ''}">${a.consumo ? `${n(a.consumo, 2)} km/l<br><small style="color:var(--texto-fraco); font-weight:400;">${n(a.km_rodados)} km</small>` : '—'}</td>
          <td><div class="oc-linha-acoes"><button data-fv-excl-ab="${a.id}" title="Excluir">🗑</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhum abastecimento neste filtro. Clique em "＋ Abastecimento".</div>'}</div></div>`;
    ligarPeriodo(telaAbastecimentos);
    $('fvConteudo').querySelectorAll('[data-fv-excl-ab]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Excluir este abastecimento? A conta a pagar (ou a despesa no acerto) gerada por ele também sai.', { textoOk: 'Excluir', tipo: 'perigo' })) return;
      try { await enviar(`/abastecimentos/${b.dataset.fvExclAb}`, 'DELETE'); await recarregar(); } catch (err) { erro(err); }
    }));
  }

  const camposPagamento = (prefixo, { motorista = false, parcelas = false } = {}) => `
    <div class="campo"><label for="${prefixo}Pag">Pagamento</label><select id="${prefixo}Pag" class="cte-entrada">
      ${Object.entries(cat.pagamentos).filter(([k]) => motorista || k !== 'motorista').map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
    <div class="campo" data-pag="a_vista"><label for="${prefixo}Forma">Pago com</label><select id="${prefixo}Forma" class="cte-entrada">
      <option value="pix">PIX</option><option value="cartao">Cartão</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="boleto">Boleto</option></select></div>
    <div class="campo oculto" data-pag="a_prazo"><label for="${prefixo}Venc">Vencimento</label><input type="date" id="${prefixo}Venc" class="cte-entrada" /></div>
    ${parcelas ? `<div class="campo oculto" data-pag="a_prazo"><label for="${prefixo}Parc">Parcelas</label><input id="${prefixo}Parc" class="cte-entrada" inputmode="numeric" value="1" /></div>` : ''}
    ${motorista ? `<div class="campo largo oculto" data-pag="motorista"><label for="${prefixo}Acerto">Acerto de viagem (motorista próprio, em aberto)</label><select id="${prefixo}Acerto" class="cte-entrada">
      ${cat.acertos.length ? cat.acertos.map((x) => `<option value="${x.id}">nº ${x.id} — ${esc(x.motorista_nome)}${x.placa ? ` · ${esc(x.placa)}` : ''}${x.descricao ? ` · ${esc(x.descricao)}` : ''}</option>`).join('') : '<option value="">Nenhum acerto aberto — abra em Contas a pagar → Acertos</option>'}</select></div>` : ''}`;
  const ligarPagamento = (prefixo) => {
    const mostrar = () => document.querySelectorAll('#fvModalConteudo [data-pag]').forEach((el) => el.classList.toggle('oculto', el.dataset.pag !== $(`${prefixo}Pag`).value));
    $(`${prefixo}Pag`).addEventListener('change', mostrar); mostrar();
  };

  function formAbastecimento() {
    modal.classList.remove('oculto');
    $('fvModalConteudo').innerHTML = `${titulo('⛽ Abastecimento')}
      <div class="cte-grade" style="margin-top:12px;">
        <div class="campo largo"><label for="abVeic">Veículo</label><select id="abVeic" class="cte-entrada">${opcoesVeiculos(estado.veiculo)}</select></div>
        ${campo('abData', 'Data', hoje(), 'type="date"')}
        ${campo('abKm', 'Km do hodômetro', '', 'inputmode="numeric"')}
        <div class="campo"><label for="abComb">Combustível</label><select id="abComb" class="cte-entrada">${Object.entries(cat.combustiveis).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
        ${campo('abLitros', 'Litros', '', 'inputmode="decimal"')}
        ${campo('abValor', 'Valor total (R$)', '', 'inputmode="decimal"')}
        <div class="campo"><label style="display:flex; gap:8px; align-items:center; margin-top:22px;"><input type="checkbox" id="abCheio" checked style="width:auto;" /> Completou o tanque</label></div>
        ${campo('abPosto', 'Posto', '', 'maxlength="150" list="abPostos"')}
        ${campo('abPostoDoc', 'CNPJ do posto', '', 'maxlength="18"')}
        ${campo('abDoc', 'Cupom / NF', '', 'maxlength="60"')}
        ${campo('abMot', 'Motorista', '', 'maxlength="120" list="abMots"')}
        ${camposPagamento('ab', { motorista: true })}
        <div class="campo inteiro"><label for="abObs">Observação</label><input id="abObs" class="cte-entrada" maxlength="2000" /></div>
      </div>
      <datalist id="abMots">${cat.motoristas.map((m) => `<option value="${esc(m.nome)}">`).join('')}</datalist><datalist id="abPostos"></datalist>
      <div id="abInfo" style="font-size:13px; color:var(--texto-fraco); margin:6px 0 10px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="abSalvar" style="width:auto;">Lançar</button></div>`;
    ligarPagamento('ab');
    const info = () => {
      const v = cat.veiculos.find((x) => x.id === Number($('abVeic').value));
      const l = lerNum($('abLitros').value); const val = lerNum($('abValor').value);
      $('abInfo').innerHTML = [v?.km_atual != null ? `Último km conhecido de ${esc(v.placa)}: <b>${n(v.km_atual)}</b>` : '', l && val ? `Preço: <b>${brl(val / l)}</b> por litro` : ''].filter(Boolean).join(' · ');
      $('abKm').closest('.campo').classList.toggle('oculto', $('abComb').value === 'arla32');
      $('abCheio').closest('.campo').classList.toggle('oculto', $('abComb').value === 'arla32');
    };
    ['abVeic', 'abComb'].forEach((id) => $(id).addEventListener('change', info)); ['abLitros', 'abValor'].forEach((id) => $(id).addEventListener('input', info)); info();
    $('abSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        await enviar('/abastecimentos', 'POST', {
          veiculo_id: $('abVeic').value, data: $('abData').value, km: $('abComb').value === 'arla32' ? null : $('abKm').value, combustivel: $('abComb').value, litros: $('abLitros').value,
          valor_total: $('abValor').value, tanque_cheio: $('abCheio').checked, posto_nome: $('abPosto').value, posto_doc: $('abPostoDoc').value, documento: $('abDoc').value,
          motorista_nome: $('abMot').value, pagamento: $('abPag').value, forma: $('abForma').value, vencimento: $('abVenc').value, acerto_id: $('abAcerto')?.value, observacao: $('abObs').value,
        });
        fechar(); mostrarAlerta('Abastecimento lançado.', { tipo: 'sucesso' });
        if (aba !== 'painel') mostrarAba('abastecimentos');
        await recarregar();
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  // ======================= Manutenções =======================
  async function telaManutencoes() {
    const lista = await api(`/manutencoes?${new URLSearchParams({ veiculo_id: estado.veiculo, de: estado.de, ate: estado.ate, status: estado.status })}`);
    $('fvConteudo').innerHTML = `${barraPeriodo(`<select id="fvVeic" class="cte-entrada" style="width:auto;">${opcoesVeiculos(estado.veiculo, { todos: true, soAtivos: false })}</select>
        <select id="fvStatus" class="cte-entrada" style="width:auto;"><option value="todas">Todas</option><option value="abertas" ${estado.status === 'abertas' ? 'selected' : ''}>Agendadas e na oficina</option>
        <option value="concluida" ${estado.status === 'concluida' ? 'selected' : ''}>Concluídas</option><option value="cancelada" ${estado.status === 'cancelada' ? 'selected' : ''}>Canceladas</option></select>`)}
      <div class="painel oc-painel" style="margin-top:10px;"><div class="edi-rolagem">${lista.length ? `<table class="edi-tabela"><thead><tr><th>Data</th><th>Veículo</th><th>Manutenção</th><th>Oficina</th><th class="n">Km</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lista.map((m) => `<tr><td>${dia(m.data)}${m.data_saida && m.data_saida !== m.data ? `<br><small style="color:var(--texto-fraco);">saiu ${dia(m.data_saida)}</small>` : ''}</td>
          <td><b>${esc(m.placa)}</b></td><td><b>${esc(m.descricao)}</b><br><small style="color:var(--texto-fraco);">${m.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva'}${m.itens.length ? ` · ${m.itens.length} item(ns)` : ''}${m.planos.length ? ` · cumpre ${m.planos.length} item(ns) do plano` : ''}</small></td>
          <td><small>${esc(m.oficina_nome || '')}</small></td><td class="n">${n(m.km)}</td><td class="n"><b>${brl(m.valor_total)}</b></td>
          <td><span class="oc-sit ${SIT_MANUT[m.status]}">${esc(cat.status[m.status])}</span></td>
          <td><div class="oc-linha-acoes">${['agendada', 'em_andamento'].includes(m.status) ? `<button class="primario" data-fv-editar="${m.id}">${m.status === 'em_andamento' ? 'Concluir' : 'Abrir'}</button><button data-fv-canc="${m.id}">Cancelar</button>` : ''}
            ${m.status === 'concluida' ? `<button data-fv-ver="${m.id}">Ver</button>` : ''}<button data-fv-excl-m="${m.id}" title="Excluir">🗑</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhuma manutenção neste filtro. Clique em "＋ Manutenção".</div>'}</div></div>`;
    ligarPeriodo(telaManutencoes);
    const achar = (id) => lista.find((m) => m.id === Number(id));
    $('fvConteudo').querySelectorAll('[data-fv-editar]').forEach((b) => b.addEventListener('click', () => formManutencao(achar(b.dataset.fvEditar)).catch(erro)));
    $('fvConteudo').querySelectorAll('[data-fv-ver]').forEach((b) => b.addEventListener('click', () => verManutencao(achar(b.dataset.fvVer))));
    $('fvConteudo').querySelectorAll('[data-fv-canc]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Cancelar esta manutenção?', { textoOk: 'Cancelar manutenção' })) return;
      try { await enviar(`/manutencoes/${b.dataset.fvCanc}/cancelar`, 'POST'); await recarregar(); } catch (err) { erro(err); }
    }));
    $('fvConteudo').querySelectorAll('[data-fv-excl-m]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Excluir esta manutenção? As contas a pagar geradas por ela também saem, e o plano preventivo volta como estava.', { textoOk: 'Excluir', tipo: 'perigo' })) return;
      try { await enviar(`/manutencoes/${b.dataset.fvExclM}`, 'DELETE'); await recarregar(); } catch (err) { erro(err); }
    }));
  }

  function verManutencao(m) {
    modal.classList.remove('oculto');
    $('fvModalConteudo').innerHTML = `${titulo(`🔧 ${esc(m.placa)} — ${esc(m.descricao)}`)}
      <div style="font-size:13px; color:var(--texto-fraco); margin:6px 0 12px;">${m.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva'} · ${dia(m.data)}${m.data_saida ? ` a ${dia(m.data_saida)}` : ''}${m.km ? ` · km ${n(m.km)}` : ''}${m.oficina_nome ? ` · ${esc(m.oficina_nome)}` : ''}${m.documento ? ` · doc. ${esc(m.documento)}` : ''}</div>
      ${m.itens.length ? `<table class="edi-tabela"><thead><tr><th>Item</th><th class="n">Qtd</th><th class="n">Unitário</th><th class="n">Total</th></tr></thead><tbody>
        ${m.itens.map((i) => `<tr><td>${i.tipo === 'servico' ? '🛠' : '⚙'} ${esc(i.descricao)}</td><td class="n">${n(i.qtd, i.qtd % 1 ? 2 : 0)}</td><td class="n">${brl(i.valor_unit)}</td><td class="n">${brl(i.qtd * i.valor_unit)}</td></tr>`).join('')}</tbody></table>` : ''}
      <div style="text-align:right; font-size:18px; margin:10px 0;">Total: <b>${brl(m.valor_total)}</b></div>
      <div style="font-size:13px;">${esc(cat.pagamentos[m.pagamento] || '')}${m.contas_ids.length ? ` · ${m.contas_ids.length} conta(s) a pagar · pago ${brl(m.valor_pago_contas)}` : ''}</div>
      ${m.observacao ? `<p style="font-size:13px;"><i>${esc(m.observacao)}</i></p>` : ''}
      <div style="display:flex; justify-content:flex-end;"><button class="btn btn-primario" data-fv-fechar style="width:auto;">Fechar</button></div>`;
  }

  async function formManutencao(m = null) {
    const planos = await api('/planos');
    modal.classList.remove('oculto');
    const st = m?.status === 'em_andamento' ? 'concluida' : m?.status || 'concluida';
    $('fvModalConteudo').innerHTML = `${titulo(m ? `🔧 Manutenção ${m.id} — ${esc(m.placa)}` : '🔧 Manutenção')}
      <div class="cte-grade" style="margin-top:12px;">
        <div class="campo largo"><label for="mnVeic">Veículo</label><select id="mnVeic" class="cte-entrada">${opcoesVeiculos(m?.veiculo_id || estado.veiculo)}</select></div>
        <div class="campo"><label for="mnTipo">Tipo</label><select id="mnTipo" class="cte-entrada"><option value="corretiva">Corretiva (quebrou)</option><option value="preventiva" ${m?.tipo === 'preventiva' ? 'selected' : ''}>Preventiva (plano)</option></select></div>
        <div class="campo"><label for="mnStatus">Situação</label><select id="mnStatus" class="cte-entrada">
          <option value="concluida" ${st === 'concluida' ? 'selected' : ''}>Concluída</option><option value="em_andamento" ${st === 'em_andamento' ? 'selected' : ''}>Na oficina</option><option value="agendada" ${st === 'agendada' ? 'selected' : ''}>Agendada</option></select></div>
        ${campo('mnDesc', 'O que foi feito', m?.descricao || '', 'maxlength="250" placeholder="ex.: troca de óleo e filtros"', 'inteiro')}
        ${campo('mnData', 'Data (entrada / agendada)', m ? String(m.data).slice(0, 10) : hoje(), 'type="date"')}
        ${campo('mnSaida', 'Saída da oficina', m?.data_saida ? String(m.data_saida).slice(0, 10) : (m?.status === 'em_andamento' ? hoje() : ''), 'type="date"')}
        ${campo('mnKm', 'Km', m?.km ?? '', 'inputmode="numeric"')}
        ${campo('mnOficina', 'Oficina / fornecedor', m?.oficina_nome || '', 'maxlength="150"')}
        ${campo('mnOficinaDoc', 'CNPJ/CPF', Doc.formatar(m?.oficina_doc || ''), 'maxlength="18"')}
        ${campo('mnDocto', 'NF / OS', m?.documento || '', 'maxlength="60"')}
      </div>
      <div class="cte-secao"><h4 style="display:flex; justify-content:space-between; align-items:center;">Peças e serviços <button class="btn btn-secundario" id="mnLinha" style="width:auto; padding:5px 10px;">＋ Linha</button></h4>
        <table class="edi-tabela" id="mnItens"><thead><tr><th>Tipo</th><th>Descrição</th><th class="n">Qtd</th><th class="n">Unitário (R$)</th><th class="n">Total</th><th></th></tr></thead><tbody></tbody></table>
        <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:8px;"><span id="mnSemItens" style="font-size:12.5px; color:var(--texto-fraco);">Sem itens? informe só o total:</span>
          <input id="mnTotal" class="cte-entrada" inputmode="decimal" style="width:130px; text-align:right;" value="${m && !m.itens.length && Number(m.valor_total) ? n(m.valor_total, 2) : ''}" /><b id="mnSoma" style="font-size:18px;"></b></div></div>
      <div class="cte-secao" id="mnPlanosBox"><h4>Itens do plano preventivo que esta manutenção cumpre</h4><div id="mnPlanos" style="display:flex; flex-wrap:wrap; gap:6px 18px; font-size:13.5px;"></div></div>
      <div class="cte-grade" id="mnPagBox">${camposPagamento('mn', { parcelas: true })}
        ${campo('mnObs', 'Observação', m?.observacao || '', 'maxlength="2000"', 'largo')}</div>
      <div id="mnAviso" style="font-size:12.5px; color:var(--texto-fraco); margin:6px 0 10px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="mnSalvar" style="width:auto;">Salvar</button></div>`;
    ligarPagamento('mn');
    if (m?.pagamento) { $('mnPag').value = m.pagamento; $('mnPag').dispatchEvent(new Event('change')); }
    const corpo = $('mnItens').querySelector('tbody');
    const linha = (i = {}) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select class="mn-tipo cte-entrada" style="width:auto;"><option value="peca">Peça</option><option value="servico" ${i.tipo === 'servico' ? 'selected' : ''}>Serviço</option></select></td>
        <td><input class="mn-desc cte-entrada" maxlength="150" value="${esc(i.descricao || '')}" aria-label="Descrição" /></td>
        <td class="n"><input class="mn-qtd cte-entrada" inputmode="decimal" style="width:70px; text-align:right;" value="${i.qtd != null ? esc(String(i.qtd).replace('.', ',')) : '1'}" aria-label="Quantidade" /></td>
        <td class="n"><input class="mn-unit cte-entrada" inputmode="decimal" style="width:110px; text-align:right;" value="${i.valor_unit != null ? esc(n(i.valor_unit, 2)) : ''}" aria-label="Valor unitário" /></td>
        <td class="n mn-sub"></td><td><button type="button" class="mn-tirar" style="border:0; background:none; color:var(--texto-fraco); cursor:pointer;" title="Tirar">✕</button></td>`;
      corpo.appendChild(tr);
    };
    const itens = () => [...corpo.querySelectorAll('tr')].map((tr) => ({ tipo: tr.querySelector('.mn-tipo').value, descricao: tr.querySelector('.mn-desc').value.trim(),
      qtd: lerNum(tr.querySelector('.mn-qtd').value) || 1, valor_unit: lerNum(tr.querySelector('.mn-unit').value) || 0 })).filter((i) => i.descricao);
    const somar = () => {
      corpo.querySelectorAll('tr').forEach((tr) => { tr.querySelector('.mn-sub').textContent = brl((lerNum(tr.querySelector('.mn-qtd').value) || 1) * (lerNum(tr.querySelector('.mn-unit').value) || 0)); });
      const it = itens();
      $('mnTotal').classList.toggle('oculto', it.length > 0); $('mnSemItens').classList.toggle('oculto', it.length > 0);
      $('mnSoma').textContent = it.length ? brl(it.reduce((s, i) => s + i.qtd * i.valor_unit, 0)) : '';
    };
    (m?.itens || []).forEach(linha); somar();
    corpo.addEventListener('input', somar); corpo.addEventListener('change', somar);
    corpo.addEventListener('click', (e) => { if (e.target.closest('.mn-tirar')) { e.target.closest('tr').remove(); somar(); } });
    $('mnLinha').addEventListener('click', () => { linha(); somar(); });
    const desenharPlanos = () => {
      const meus = planos.filter((p) => p.veiculo_id === Number($('mnVeic').value));
      $('mnPlanos').innerHTML = meus.length ? meus.map((p) => `<label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" value="${p.id}" ${m?.planos?.includes(p.id) ? 'checked' : ''} style="width:auto;" />
        ${esc(p.item)} <span class="oc-sit ${SIT_PLANO[p.situacao][1]}" style="font-size:10.5px;">${SIT_PLANO[p.situacao][0]}</span></label>`).join('')
        : '<span style="color:var(--texto-fraco);">Este veículo ainda não tem plano preventivo (aba 🗓 Plano preventivo).</span>';
    };
    const ajustar = () => {
      const concluida = $('mnStatus').value === 'concluida';
      $('mnPagBox').style.opacity = concluida ? '' : '.45';
      $('mnAviso').textContent = concluida ? 'Ao salvar como concluída, o custo entra em Contas a pagar, o km do veículo é atualizado e os itens marcados do plano preventivo recomeçam a contar.'
        : 'Agendada ou na oficina: o custo só é lançado quando você concluir.';
    };
    $('mnVeic').addEventListener('change', desenharPlanos); $('mnStatus').addEventListener('change', ajustar);
    $('mnTipo').addEventListener('change', () => { if ($('mnTipo').value === 'preventiva') $('mnPlanosBox').scrollIntoView({ block: 'nearest' }); });
    desenharPlanos(); ajustar();
    $('mnSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const it = itens();
        const dados = {
          veiculo_id: $('mnVeic').value, tipo: $('mnTipo').value, status: $('mnStatus').value, descricao: $('mnDesc').value, data: $('mnData').value, data_saida: $('mnSaida').value,
          km: $('mnKm').value, oficina_nome: $('mnOficina').value, oficina_doc: $('mnOficinaDoc').value, documento: $('mnDocto').value, itens: it, valor_total: it.length ? null : $('mnTotal').value,
          planos: [...$('mnPlanos').querySelectorAll('input:checked')].map((x) => Number(x.value)),
          pagamento: $('mnPag').value, forma: $('mnForma').value, vencimento: $('mnVenc').value, parcelas: $('mnParc').value, observacao: $('mnObs').value,
        };
        if (m) await enviar(`/manutencoes/${m.id}`, 'PUT', dados); else await enviar('/manutencoes', 'POST', dados);
        fechar(); mostrarAlerta(dados.status === 'concluida' ? 'Manutenção concluída e lançada.' : 'Manutenção salva.', { tipo: 'sucesso' });
        if (aba !== 'painel') mostrarAba('manutencoes');
        await recarregar();
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  // ======================= Plano preventivo =======================
  async function telaPlanos() {
    const planos = await api(`/planos?${new URLSearchParams({ veiculo_id: estado.veiculo })}`);
    $('fvConteudo').innerHTML = `<div class="oc-barra" style="flex-wrap:wrap; gap:8px;"><select id="fvVeic" class="cte-entrada" style="width:auto;">${opcoesVeiculos(estado.veiculo, { todos: true })}</select>
        <span style="flex:1;"></span><button class="btn btn-secundario" id="plSugerido" style="width:auto;">✨ Plano sugerido para um veículo</button><button class="btn btn-primario" id="plNovo" style="width:auto;">＋ Item do plano</button></div>
      <div class="painel oc-painel" style="margin-top:10px;"><div class="edi-rolagem">${planos.length ? `<table class="edi-tabela"><thead><tr><th>Veículo</th><th>Item</th><th>A cada</th><th>Última vez</th><th>Próxima</th><th>Situação</th><th></th></tr></thead><tbody>
        ${planos.map((p) => `<tr><td><b>${esc(p.placa)}</b><br><small style="color:var(--texto-fraco);">km ${n(p.km_atual)}</small></td><td>${esc(p.item)}</td>
          <td>${[p.a_cada_km ? `${n(p.a_cada_km)} km` : '', p.a_cada_dias ? `${n(p.a_cada_dias)} dias` : ''].filter(Boolean).join(' ou ')}</td>
          <td>${[p.ultima_km != null ? `km ${n(p.ultima_km)}` : '', p.ultima_data ? dia(p.ultima_data) : ''].filter(Boolean).join(' · ') || '—'}</td>
          <td>${detalhePlano(p)}</td><td><span class="oc-sit ${SIT_PLANO[p.situacao][1]}">${SIT_PLANO[p.situacao][0]}</span></td>
          <td><div class="oc-linha-acoes"><button class="primario" data-pl-editar="${p.id}">Editar</button><button data-pl-excl="${p.id}" title="Excluir">🗑</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="kanban-vazio">Nenhum item no plano preventivo. Use "✨ Plano sugerido" para começar com os itens mais comuns (óleo, filtros, freios, pneus, licenciamento, tacógrafo).</div>'}</div></div>`;
    $('fvVeic').addEventListener('change', () => { estado.veiculo = $('fvVeic').value; telaPlanos().catch(erro); });
    $('plNovo').addEventListener('click', () => formPlano());
    $('plSugerido').addEventListener('click', () => planoSugerido());
    $('fvConteudo').querySelectorAll('[data-pl-editar]').forEach((b) => b.addEventListener('click', () => formPlano(planos.find((p) => p.id === Number(b.dataset.plEditar)))));
    $('fvConteudo').querySelectorAll('[data-pl-excl]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Tirar este item do plano preventivo?', { textoOk: 'Tirar' })) return;
      try { await enviar(`/planos/${b.dataset.plExcl}`, 'DELETE'); await telaPlanos(); } catch (err) { erro(err); }
    }));
  }

  function formPlano(p = null) {
    modal.classList.remove('oculto');
    $('fvModalConteudo').innerHTML = `${titulo(p ? `🗓 ${esc(p.placa)} — ${esc(p.item)}` : '🗓 Item do plano preventivo')}
      <div class="cte-grade" style="margin-top:12px;">
        ${campo('plItem', 'Item', p?.item || '', 'maxlength="120" list="plModelos"', 'largo')}
        ${campo('plKm', 'A cada (km)', p?.a_cada_km ?? '', 'inputmode="numeric"')}
        ${campo('plDias', 'ou a cada (dias)', p?.a_cada_dias ?? '', 'inputmode="numeric"')}
        ${campo('plAvKm', 'Avisar faltando (km)', p?.aviso_km ?? 1000, 'inputmode="numeric"')}
        ${campo('plAvDias', 'Avisar faltando (dias)', p?.aviso_dias ?? 15, 'inputmode="numeric"')}
        ${campo('plUltKm', 'Última vez — km', p?.ultima_km ?? '', 'inputmode="numeric"')}
        ${campo('plUltData', 'Última vez — data', p?.ultima_data ? String(p.ultima_data).slice(0, 10) : '', 'type="date"')}
      </div>
      <datalist id="plModelos">${cat.modelos.map((x) => `<option value="${esc(x.item)}">`).join('')}</datalist>
      ${p ? '' : `<div class="cte-secao"><h4>Veículos</h4><div style="display:flex; flex-wrap:wrap; gap:6px 18px; font-size:13.5px;">
        ${cat.veiculos.filter((v) => v.ativo).map((v) => `<label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" class="pl-veic" value="${v.id}" ${Number(estado.veiculo) === v.id ? 'checked' : ''} style="width:auto;" />${esc(v.placa)}</label>`).join('')}</div>
        <p style="font-size:12.5px; color:var(--texto-fraco);">Com vários veículos e sem "última vez", conta a partir de hoje e do km atual de cada um.</p></div>`}
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="plSalvar" style="width:auto;">Salvar</button></div>`;
    $('plItem').addEventListener('change', () => {
      const mo = cat.modelos.find((x) => x.item === $('plItem').value);
      if (mo && !p) { $('plKm').value = mo.a_cada_km || ''; $('plDias').value = mo.a_cada_dias || ''; if (mo.aviso_dias) $('plAvDias').value = mo.aviso_dias; }
    });
    $('plSalvar').addEventListener('click', async () => {
      const dados = { item: $('plItem').value, a_cada_km: $('plKm').value, a_cada_dias: $('plDias').value, aviso_km: $('plAvKm').value, aviso_dias: $('plAvDias').value,
        ultima_km: $('plUltKm').value, ultima_data: $('plUltData').value };
      try {
        if (p) await enviar(`/planos/${p.id}`, 'PUT', { ...dados, ativo: true });
        else {
          const veiculos = [...document.querySelectorAll('.pl-veic:checked')].map((x) => Number(x.value));
          if (!veiculos.length) throw new Error('Marque pelo menos um veículo.');
          await enviar('/planos', 'POST', { ...dados, veiculos });
        }
        fechar(); await recarregar();
      } catch (err) { erro(err); }
    });
  }

  function planoSugerido() {
    modal.classList.remove('oculto');
    $('fvModalConteudo').innerHTML = `${titulo('✨ Plano preventivo sugerido')}
      <p style="font-size:13.5px;">Cria os itens abaixo no veículo escolhido, contando a partir de hoje e do km atual. Depois ajuste a "última vez" de cada item e os intervalos pelo manual do fabricante.</p>
      <div class="campo" style="max-width:360px;"><label for="psVeic">Veículo</label><select id="psVeic" class="cte-entrada">${opcoesVeiculos(estado.veiculo)}</select></div>
      <div style="display:grid; gap:6px; font-size:13.5px; margin:10px 0;">${cat.modelos.map((x, i) => `<label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" class="ps-item" value="${i}" checked style="width:auto;" />
        ${esc(x.item)} <small style="color:var(--texto-fraco);">(${[x.a_cada_km ? `${n(x.a_cada_km)} km` : '', x.a_cada_dias ? `${x.a_cada_dias} dias` : ''].filter(Boolean).join(' ou ')})</small></label>`).join('')}</div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Cancelar</button><button class="btn btn-primario" id="psCriar" style="width:auto;">Criar plano</button></div>`;
    $('psCriar').addEventListener('click', async () => {
      try {
        const vid = Number($('psVeic').value); if (!vid) throw new Error('Escolha o veículo.');
        const v = cat.veiculos.find((x) => x.id === vid);
        for (const el of document.querySelectorAll('.ps-item:checked')) {
          const mo = cat.modelos[Number(el.value)];
          await enviar('/planos', 'POST', { ...mo, veiculo_id: vid, ultima_km: v.km_atual, ultima_data: hoje() }).catch((err) => { if (!/já tem/.test(err.message)) throw err; });
        }
        estado.veiculo = String(vid); fechar(); mostrarAba('planos'); await recarregar();
      } catch (err) { erro(err); }
    });
  }
  // ======================= Documentos com vencimento =======================
  const SIT_DOC = { vencido: ['Vencido', 'cancelado'], vencendo: ['Vencendo', 'ocorrencia'], em_dia: ['Em dia', 'entregue'], sem_validade: ['Sem validade', 'pendente'], falta: ['Falta documento', 'pendente'] };
  const docs = { filtro: 'problemas' };
  async function telaDocumentos() {
    const q = await api('/documentos');
    const linhas = q.linhas.filter((l) => docs.filtro === 'todos' || (docs.filtro === 'problemas' ? l.situacao !== 'em_dia' : l.dono_tipo === docs.filtro));
    const chip = (l, d) => `<button class="fv-doc ${SIT_DOC[d.situacao][1]}" data-doc-editar="${l.dono_tipo}|${l.id}|${d.tipo}" title="${esc(d.numero ? `nº ${d.numero} · ` : '')}${d.atualizado_por ? `atualizado por ${esc(d.atualizado_por)}` : ''}">
      <b>${esc(d.nome)}</b><span>${d.validade ? dia(d.validade) : 'sem validade'}${d.situacao === 'vencido' ? ` · venceu há ${-d.dias} dia(s)` : d.situacao === 'vencendo' ? ` · vence em ${d.dias} dia(s)` : ''}</span></button>`;
    $('fvConteudo').innerHTML = `<div class="oc-barra" style="flex-wrap:wrap; gap:8px; align-items:center;">
        <div class="oc-filtros">${[['problemas', 'Com pendência'], ['veiculo', 'Veículos'], ['motorista', 'Motoristas'], ['todos', 'Todos']].map(([k, t]) => `<button class="oc-filtro ${docs.filtro === k ? 'ativo' : ''}" data-doc-filtro="${k}">${t}</button>`).join('')}</div>
        <span style="flex:1;"></span><span style="font-size:12.5px;"><b style="color:#ef4444;">${q.contagens.vencidos}</b> vencido(s) · <b style="color:#d97706;">${q.contagens.vencendo}</b> vencendo · ${q.contagens.faltando} obrigatório(s) sem cadastro</span></div>
      <p class="edi-dica" style="margin:8px 0;">Documento vencido do veículo (CRLV, RNTRC, tacógrafo, CIV) ou do motorista (CNH, toxicológico, MOPP) <b>barra a transmissão do MDF-e</b> e aparece no romaneio. O aviso começa ${'30'} dias antes (ajuste em cada documento).</p>
      <div class="painel oc-painel"><div class="edi-rolagem">${linhas.length ? `<table class="edi-tabela"><thead><tr><th>Veículo / motorista</th><th>Documentos</th><th></th></tr></thead><tbody>
        ${linhas.map((l) => `<tr><td style="white-space:nowrap;">${l.dono_tipo === 'veiculo' ? '🚛' : '👤'} <b>${esc(l.nome)}</b><br><small style="color:var(--texto-fraco);">${l.dono_tipo === 'veiculo' ? esc(l.tipo === 'reboque' ? 'reboque' : 'tração') + (l.descricao ? ` · ${esc(l.descricao)}` : '') : 'motorista'}</small></td>
          <td><div class="fv-docs">${l.documentos.map((d) => chip(l, d)).join('')}${l.faltam.map((f) => `<button class="fv-doc falta" data-doc-novo="${l.dono_tipo}|${l.id}|${f.tipo}"><b>${esc(f.nome)}</b><span>não cadastrado</span></button>`).join('')}</div></td>
          <td><div class="oc-linha-acoes"><button class="primario" data-doc-novo="${l.dono_tipo}|${l.id}|">＋ Documento</button></div></td></tr>`).join('')}</tbody></table>`
    : '<div class="kanban-vazio">Nada pendente: todos os documentos obrigatórios estão em dia. 👏</div>'}</div></div>`;
    document.querySelectorAll('[data-doc-filtro]').forEach((b) => b.addEventListener('click', () => { docs.filtro = b.dataset.docFiltro; telaDocumentos().catch(erro); }));
    const abrir = (chave) => { const [tipoDono, id, tipo] = chave.split('|'); const l = q.linhas.find((x) => x.dono_tipo === tipoDono && x.id === Number(id)); formDocumento(q, l, l.documentos.find((d) => d.tipo === tipo) || { tipo }); };
    document.querySelectorAll('[data-doc-editar]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.docEditar)));
    document.querySelectorAll('[data-doc-novo]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.docNovo)));
  }
  function formDocumento(q, l, d) {
    const tipos = q.tipos[l.dono_tipo];
    $('fvModalConteudo').innerHTML = `${titulo(`📄 ${esc(l.nome)} — documento`)}
      <div class="oc-form" style="margin-top:12px;">
        <div class="campo"><label for="dcTipo">Documento</label><select id="dcTipo" class="cte-entrada">${Object.entries(tipos).map(([k, t]) => `<option value="${k}" ${k === d.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        ${campo('dcNumero', 'Número', d.numero || '')}
        ${campo('dcEmissao', 'Emissão', d.emissao || '', 'type="date"')}
        ${campo('dcValidade', 'Validade', d.validade || '', 'type="date"')}
        ${campo('dcAviso', 'Avisar quantos dias antes', d.aviso_dias || 30, 'type="number" min="1" max="180"')}
        ${campo('dcObs', 'Observação', d.observacao || '', 'maxlength="300"', 'inteiro')}
      </div>
      <div style="display:flex; justify-content:space-between; gap:10px; margin-top:10px;">${d.id ? `<button class="btn btn-secundario" id="dcExcluir" style="width:auto; color:var(--vermelho);">Apagar</button>` : '<span></span>'}
        <div style="display:flex; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="dcSalvar" style="width:auto;">Salvar</button></div></div>`;
    modal.classList.remove('oculto');
    $('dcSalvar').addEventListener('click', async () => {
      try {
        await enviar('/documentos', 'POST', { dono_tipo: l.dono_tipo, dono_id: l.id, tipo: $('dcTipo').value, numero: $('dcNumero').value, emissao: $('dcEmissao').value, validade: $('dcValidade').value, aviso_dias: $('dcAviso').value, observacao: $('dcObs').value });
        fechar(); mostrarAlerta('Documento salvo.', { tipo: 'sucesso' }); telaDocumentos().catch(erro);
      } catch (err) { erro(err); }
    });
    $('dcExcluir')?.addEventListener('click', async () => {
      if (!await confirmar('Apagar este documento?', { tipo: 'perigo', textoOk: 'Apagar' })) return;
      try { await enviar(`/documentos/${d.id}`, 'DELETE'); fechar(); telaDocumentos().catch(erro); } catch (err) { erro(err); }
    });
  }

  // ======================= Pneus =======================
  const pn = { veiculo: '', status: '' };
  const corSulco = (p) => (p?.alerta === 'ilegal' ? 'cancelado' : p?.alerta === 'baixo' ? 'ocorrencia' : 'entregue');
  async function telaPneus() {
    if (!pn.veiculo) pn.veiculo = String(cat.veiculos.find((v) => v.ativo)?.id || '');
    const [lista, mapa] = await Promise.all([api(`/pneus?${new URLSearchParams({ status: pn.status })}`), pn.veiculo ? api(`/veiculos/${pn.veiculo}/pneus`) : null]);
    const caixa = (l) => `<button class="fv-pneu ${l.pneu ? corSulco(l.pneu) : 'vazio'}" data-pos="${l.posicao}" title="${esc(l.nome)}">
      <small>${esc(l.posicao)}</small>${l.pneu ? `<b>${esc(l.pneu.numero_fogo)}</b><span>${l.pneu.sulco_mm != null ? `${n(l.pneu.sulco_mm, 1)} mm` : 'sem medição'}</span>` : '<span>vazio</span>'}</button>`;
    const c = lista.contagens;
    $('fvConteudo').innerHTML = `<div class="oc-barra" style="flex-wrap:wrap; gap:8px; align-items:center;">
        <select id="pnVeic" class="cte-entrada" style="width:auto;">${opcoesVeiculos(pn.veiculo)}</select>
        ${mapa ? `<label style="font-size:12.5px;">Eixos <input id="pnEixos" type="number" min="1" max="9" value="${mapa.veiculo.eixos}" class="cte-entrada" style="width:64px; padding:4px 6px;" /></label>` : ''}
        <span style="flex:1;"></span><button class="btn btn-primario" id="pnNovo" style="width:auto;">＋ Pneu</button></div>
      ${mapa ? `<div class="painel" style="padding:14px; margin:10px 0;"><h4 style="margin:0 0 10px;">🚛 ${esc(mapa.veiculo.placa)} ${mapa.veiculo.km_atual != null ? `<small style="color:var(--texto-fraco); font-weight:400;">· km ${n(mapa.veiculo.km_atual)}</small>` : ''}</h4>
        <div class="fv-eixos">${mapa.eixos.map((e) => `<div class="fv-eixo"><span class="fv-eixo-n">${e.eixo}º eixo</span><div class="fv-lado">${e.lados.slice(0, e.lados.length / 2).map(caixa).join('')}</div><div class="fv-barra"></div><div class="fv-lado">${e.lados.slice(e.lados.length / 2).map(caixa).join('')}</div></div>`).join('')}
          <div class="fv-eixo"><span class="fv-eixo-n">Estepe</span><div class="fv-lado">${mapa.estepe.map(caixa).join('')}</div></div></div>
        <p class="edi-dica" style="margin:8px 0 0;">Clique numa posição vazia para montar um pneu do estoque; num pneu, para rodízio, medir o sulco ou desmontar. Verde: sulco bom · amarelo: até ${n(lista.sulco_alerta, 0)} mm · vermelho: abaixo de ${n(lista.sulco_minimo, 1)} mm (ilegal).</p></div>` : ''}
      <div class="oc-filtros" style="margin:6px 0 10px;">${[['', 'Em uso e estoque'], ['montado', `Montados (${c.montado})`], ['estoque', `Estoque (${c.estoque})`], ['recapagem', `Na recapagem (${c.recapagem})`], ['sucata', `Sucata (${c.sucata})`], ['todos', 'Todos']]
    .map(([k, t]) => `<button class="oc-filtro ${pn.status === k ? 'ativo' : ''}" data-pn-filtro="${k}">${t}</button>`).join('')}</div>
      <div class="painel oc-painel"><div class="edi-rolagem">${lista.pneus.length ? `<table class="edi-tabela"><thead><tr><th>Fogo</th><th>Pneu</th><th class="n">Vida</th><th>Onde está</th><th class="n">Sulco</th><th class="n">Km rodados</th><th class="n">Custo</th><th class="n">R$/km</th><th></th></tr></thead><tbody>
        ${lista.pneus.map((p) => `<tr><td><b>${esc(p.numero_fogo)}</b></td><td>${esc([p.marca, p.modelo].filter(Boolean).join(' '))}<br><small style="color:var(--texto-fraco);">${esc(p.medida || '')}${p.dot ? ` · DOT ${esc(p.dot)}` : ''}</small></td>
          <td class="n">${p.vida ? `${p.vida}ª recapagem` : 'novo'}</td>
          <td>${p.status === 'montado' ? `<b>${esc(p.placa)}</b> · ${esc(p.posicao_texto)}` : `<span class="oc-sit ${{ estoque: 'pendente', recapagem: 'em_transito', sucata: 'cancelado' }[p.status]}">${esc(p.status_texto)}</span>`}</td>
          <td class="n">${p.sulco_mm != null ? `<span class="oc-sit ${corSulco(p)}">${n(p.sulco_mm, 1)} mm</span>` : '—'}</td><td class="n">${n(p.km_total)}</td><td class="n">${brl(p.custo_total)}</td><td class="n">${p.custo_km != null ? n(p.custo_km, 4) : '—'}</td>
          <td><div class="oc-linha-acoes">${{ estoque: `<button class="primario" data-pn="montar|${p.id}">Montar</button><button data-pn="recapagem|${p.id}">Recapar</button><button data-pn="sucata|${p.id}">Sucata</button>`,
    montado: `<button class="primario" data-pn="acoes|${p.id}">Ações</button>`, recapagem: `<button class="primario" data-pn="retorno|${p.id}">Voltou da recapagem</button>`, sucata: '' }[p.status]}<button data-pn="historico|${p.id}">Histórico</button></div></td></tr>`).join('')}</tbody></table>`
    : '<div class="kanban-vazio">Nenhum pneu aqui. Cadastre os pneus com o número de fogo (a marcação a fogo na lateral).</div>'}</div></div>`;
    $('pnVeic').addEventListener('change', () => { pn.veiculo = $('pnVeic').value; telaPneus().catch(erro); });
    $('pnEixos')?.addEventListener('change', async (e) => { try { await enviar(`/veiculos/${pn.veiculo}/eixos`, 'PUT', { eixos: e.target.value }); telaPneus().catch(erro); } catch (err) { erro(err); } });
    $('pnNovo').addEventListener('click', () => formPneu());
    document.querySelectorAll('[data-pn-filtro]').forEach((b) => b.addEventListener('click', () => { pn.status = b.dataset.pnFiltro; telaPneus().catch(erro); }));
    const achar = (id) => lista.pneus.find((p) => p.id === Number(id));
    document.querySelectorAll('[data-pn]').forEach((b) => b.addEventListener('click', () => { const [acao, id] = b.dataset.pn.split('|'); acaoPneu(acao, achar(id) || { id: Number(id) }, mapa).catch(erro); }));
    document.querySelectorAll('.fv-pneu').forEach((b) => b.addEventListener('click', () => {
      const pos = b.dataset.pos; const lado = [...mapa.eixos.flatMap((e) => e.lados), ...mapa.estepe].find((l) => l.posicao === pos);
      if (lado.pneu) acaoPneu('acoes', lado.pneu, mapa).catch(erro); else acaoPneu('montar_aqui', { posicao: pos }, mapa, lista).catch(erro);
    }));
  }
  function formPneu() {
    $('fvModalConteudo').innerHTML = `${titulo('🛞 Novo pneu')}<div class="oc-form" style="margin-top:12px;">
      ${campo('pnFogo', 'Número de fogo', '', 'maxlength="20" style="text-transform:uppercase;"')}${campo('pnMarca', 'Marca', '')}${campo('pnModelo', 'Modelo', '')}${campo('pnMedida', 'Medida', '', 'placeholder="295/80 R22.5"')}
      ${campo('pnDot', 'DOT (semana/ano)', '', 'maxlength="10" placeholder="2526"')}${campo('pnVida', 'Vida', '0', 'type="number" min="0" max="9" title="0 = novo; 1 = já recapado uma vez..."')}
      ${campo('pnValor', 'Valor de compra (R$)', '')}${campo('pnData', 'Data da compra', hoje(), 'type="date"')}${campo('pnForn', 'Fornecedor', '')}${campo('pnSulco', 'Sulco (mm)', '', 'placeholder="16"')}</div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="pnSalvar" style="width:auto;">Cadastrar</button></div>`;
    modal.classList.remove('oculto');
    $('pnSalvar').addEventListener('click', async () => {
      try {
        await enviar('/pneus', 'POST', { numero_fogo: $('pnFogo').value, marca: $('pnMarca').value, modelo: $('pnModelo').value, medida: $('pnMedida').value, dot: $('pnDot').value, vida: $('pnVida').value,
          valor_compra: $('pnValor').value, data_compra: $('pnData').value, fornecedor: $('pnForn').value, sulco_mm: $('pnSulco').value });
        fechar(); mostrarAlerta('Pneu cadastrado.', { tipo: 'sucesso' }); pn.status = 'estoque'; telaPneus().catch(erro);
      } catch (err) { erro(err); }
    });
  }
  async function acaoPneu(acao, p, mapa, lista) {
    const kmVeic = mapa?.veiculo?.km_atual ?? '';
    const formulario = (tituloTxt, campos, botao, fn) => {
      $('fvModalConteudo').innerHTML = `${titulo(tituloTxt)}<div class="oc-form" style="margin-top:12px;">${campos}</div>
        <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="pnOk" style="width:auto;">${botao}</button></div>`;
      modal.classList.remove('oculto');
      $('pnOk').addEventListener('click', async (e) => { e.currentTarget.disabled = true; try { const r = await fn(); fechar(); mostrarAlerta(r || 'Feito.', { tipo: 'sucesso' }); telaPneus().catch(erro); } catch (err) { erro(err); e.currentTarget.disabled = false; } });
    };
    const posicoesDe = (m) => [...m.eixos.flatMap((e) => e.lados), ...m.estepe];
    if (acao === 'historico') {
      const h = await api(`/pneus/${p.id}`);
      $('fvModalConteudo').innerHTML = `${titulo(`🛞 Pneu ${esc(h.pneu.numero_fogo)}`)}<p style="font-size:13px;">${esc([h.pneu.marca, h.pneu.modelo, h.pneu.medida].filter(Boolean).join(' · '))} · ${h.pneu.vida ? `${h.pneu.vida}ª recapagem` : 'novo'} · ${n(h.pneu.km_total)} km · custo ${brl(h.pneu.custo_total)}${h.pneu.custo_km != null ? ` (${n(h.pneu.custo_km, 4)} R$/km)` : ''}</p>
        <table class="edi-tabela"><thead><tr><th>Data</th><th>Movimento</th><th>Onde</th><th class="n">Km do veículo</th><th class="n">Km rodados</th><th class="n">Sulco</th><th class="n">Valor</th><th>Por</th></tr></thead><tbody>
        ${h.movimentos.map((m) => `<tr><td>${dia(m.data)}</td><td>${esc({ cadastro: 'Cadastro', montagem: 'Montagem', desmontagem: 'Desmontagem', recapagem: 'Foi para recapagem', retorno: 'Voltou da recapagem', sucata: 'Sucata', medicao: 'Medição de sulco' }[m.tipo] || m.tipo)}${m.observacao ? `<br><small>${esc(m.observacao)}</small>` : ''}</td>
          <td>${m.placa ? `${esc(m.placa)} · ${esc(m.posicao_texto)}` : esc(m.fornecedor || '')}</td><td class="n">${m.km_veiculo != null ? n(m.km_veiculo) : ''}</td><td class="n">${m.km_rodados != null ? n(m.km_rodados) : ''}</td>
          <td class="n">${m.sulco_mm != null ? `${n(m.sulco_mm, 1)} mm` : ''}</td><td class="n">${m.valor != null ? brl(m.valor) : ''}</td><td><small>${esc(m.usuario_nome || '')}</small></td></tr>`).join('')}</tbody></table>`;
      modal.classList.remove('oculto');
      return;
    }
    if (acao === 'montar_aqui') {
      const estoque = (await api('/pneus?status=estoque')).pneus;
      if (!estoque.length) { mostrarAlerta('Não há pneu no estoque. Cadastre o pneu primeiro (＋ Pneu).', { tipo: 'aviso' }); return; }
      formulario(`🛞 Montar no ${esc(mapa.veiculo.placa)} — ${esc(p.posicao)}`, `<div class="campo inteiro"><label for="pnEsc">Pneu do estoque</label><select id="pnEsc" class="cte-entrada">${estoque.map((x) => `<option value="${x.id}">${esc(x.numero_fogo)} · ${esc([x.marca, x.medida].filter(Boolean).join(' '))} · ${x.sulco_mm != null ? `${n(x.sulco_mm, 1)} mm` : ''}</option>`).join('')}</select></div>
        ${campo('pnKm', 'Km do veículo agora', kmVeic)}${campo('pnDataM', 'Data', hoje(), 'type="date"')}`, 'Montar',
      async () => { await enviar(`/pneus/${$('pnEsc').value}/montar`, 'POST', { veiculo_id: mapa.veiculo.id, posicao: p.posicao, km: $('pnKm').value, data: $('pnDataM').value }); return 'Pneu montado.'; });
      return;
    }
    if (acao === 'montar') {
      formulario(`🛞 Montar o pneu ${esc(p.numero_fogo)}`, `<div class="campo"><label for="pnV">Veículo</label><select id="pnV" class="cte-entrada">${opcoesVeiculos(pn.veiculo)}</select></div>
        <div class="campo"><label for="pnP">Posição</label><select id="pnP" class="cte-entrada"></select></div>${campo('pnKm', 'Km do veículo agora', '')}${campo('pnDataM', 'Data', hoje(), 'type="date"')}`, 'Montar',
      async () => { await enviar(`/pneus/${p.id}/montar`, 'POST', { veiculo_id: $('pnV').value, posicao: $('pnP').value, km: $('pnKm').value, data: $('pnDataM').value }); return 'Pneu montado.'; });
      const preencher = async () => { const m = await api(`/veiculos/${$('pnV').value}/pneus`); $('pnP').innerHTML = posicoesDe(m).map((l) => `<option value="${l.posicao}" ${l.pneu ? 'disabled' : ''}>${esc(l.nome)}${l.pneu ? ` (ocupada: ${esc(l.pneu.numero_fogo)})` : ''}</option>`).join(''); $('pnKm').value = m.veiculo.km_atual ?? ''; };
      $('pnV').addEventListener('change', () => preencher().catch(erro)); await preencher();
      return;
    }
    if (acao === 'acoes') {
      const m = mapa && mapa.veiculo.id === p.veiculo_id ? mapa : await api(`/veiculos/${p.veiculo_id}/pneus`);
      formulario(`🛞 Pneu ${esc(p.numero_fogo)} — ${esc(m.veiculo.placa)} ${esc(p.posicao_texto || p.posicao)}`, `
        <div class="campo"><label for="pnAcao">O que fazer</label><select id="pnAcao" class="cte-entrada"><option value="rodizio">Rodízio (trocar de posição)</option><option value="medir">Medir o sulco</option><option value="desmontar">Desmontar para o estoque</option><option value="recapagem">Desmontar e mandar recapar</option><option value="sucata">Desmontar e mandar para a sucata</option></select></div>
        <div class="campo pn-rod"><label for="pnDest">Nova posição</label><select id="pnDest" class="cte-entrada">${posicoesDe(m).filter((l) => l.posicao !== p.posicao).map((l) => `<option value="${l.posicao}">${esc(l.nome)}${l.pneu ? ` (troca com ${esc(l.pneu.numero_fogo)})` : ''}</option>`).join('')}</select></div>
        ${campo('pnKm', 'Km do veículo agora', m.veiculo.km_atual ?? '', '', 'pn-km')}${campo('pnSul', 'Sulco medido (mm)', '', 'placeholder="ex.: 7,5"', 'pn-sul')}${campo('pnObs', 'Motivo / recapadora', '', '', 'pn-obs')}${campo('pnDataA', 'Data', hoje(), 'type="date"')}`, 'Confirmar',
      async () => {
        const a = $('pnAcao').value;
        const corpo = { km: $('pnKm').value, sulco_mm: $('pnSul').value, observacao: $('pnObs').value, fornecedor: $('pnObs').value, data: $('pnDataA').value };
        if (a === 'rodizio') { const r = await enviar(`/pneus/${p.id}/rodizio`, 'POST', { ...corpo, posicao: $('pnDest').value }); return `Rodízio feito${r.trocou_com ? `: trocou de lugar com o ${r.trocou_com}` : ''}.`; }
        if (a === 'medir') { await enviar(`/pneus/${p.id}/medir`, 'POST', corpo); return 'Sulco registrado.'; }
        if (a === 'desmontar') { const r = await enviar(`/pneus/${p.id}/desmontar`, 'POST', { ...corpo, destino: 'estoque' }); return `Desmontado: rodou ${n(r.rodados)} km nesta montagem.`; }
        if (a === 'recapagem') { await enviar(`/pneus/${p.id}/recapagem`, 'POST', corpo); return 'Pneu enviado para a recapagem.'; }
        await enviar(`/pneus/${p.id}/sucata`, 'POST', corpo); return 'Pneu na sucata.';
      });
      const mostrar = () => { const a = $('pnAcao').value; document.querySelector('.pn-rod').classList.toggle('oculto', a !== 'rodizio'); document.querySelector('.pn-sul').classList.toggle('oculto', a === 'rodizio');
        document.querySelector('.pn-obs').classList.toggle('oculto', !['sucata', 'recapagem'].includes(a)); document.querySelector('.pn-km').classList.toggle('oculto', a === 'medir'); };
      $('pnAcao').addEventListener('change', mostrar); mostrar();
      return;
    }
    if (acao === 'recapagem') { formulario(`🛞 Mandar recapar o ${esc(p.numero_fogo)}`, `${campo('pnObs', 'Recapadora', '')}${campo('pnDataA', 'Data', hoje(), 'type="date"')}`, 'Enviar', async () => { await enviar(`/pneus/${p.id}/recapagem`, 'POST', { fornecedor: $('pnObs').value, data: $('pnDataA').value }); return 'Pneu na recapagem.'; }); return; }
    if (acao === 'sucata') { formulario(`🛞 Sucata — ${esc(p.numero_fogo)}`, `${campo('pnObs', 'Motivo', '', 'placeholder="corte lateral, desgaste irregular..."', 'inteiro')}${campo('pnDataA', 'Data', hoje(), 'type="date"')}`, 'Mandar para a sucata', async () => { await enviar(`/pneus/${p.id}/sucata`, 'POST', { observacao: $('pnObs').value, data: $('pnDataA').value }); return 'Pneu na sucata.'; }); return; }
    if (acao === 'retorno') {
      formulario(`🛞 ${esc(p.numero_fogo)} voltou da recapagem`, `${campo('pnValor', 'Valor da recapagem (R$)', '')}${campo('pnObs', 'Recapadora', '')}${campo('pnSul', 'Sulco novo (mm)', '')}${campo('pnDataA', 'Data', hoje(), 'type="date"')}
        ${campo('pnVenc', 'Vencimento (para gerar a conta a pagar — opcional)', '', 'type="date"')}${campo('pnDoc', 'Nota / documento', '')}`, 'Registrar',
      async () => { const r = await enviar(`/pneus/${p.id}/retorno`, 'POST', { valor: $('pnValor').value, fornecedor: $('pnObs').value, sulco_mm: $('pnSul').value, data: $('pnDataA').value, vencimento: $('pnVenc').value, documento: $('pnDoc').value }); return `Pneu de volta ao estoque (${r.vida}ª vida)${r.conta ? ' e conta a pagar lançada' : ''}.`; });
    }
  }

  // ======================= Jornada do motorista =======================
  const jo = { motorista: '' };
  const hhmm = (m) => `${Math.floor((m || 0) / 60)}h${String(Math.round((m || 0) % 60)).padStart(2, '0')}`;
  const hora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const agoraLocal = () => { const d = new Date(); return `${hoje()}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  async function telaJornada() {
    const r = await api(`/jornadas?${new URLSearchParams({ de: estado.de, ate: estado.ate, motorista: jo.motorista })}`);
    $('fvConteudo').innerHTML = `${barraPeriodo(`<select id="joMot" class="cte-entrada" style="width:auto;"><option value="">Todos os motoristas</option>${r.motoristas.map((m) => `<option value="${esc(m.chave)}" ${jo.motorista === m.chave ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select>
        <span style="flex:1;"></span><button class="btn btn-secundario" id="joEspelho" style="width:auto;">🖨 Espelho do mês</button><button class="btn btn-primario" id="joNova" style="width:auto;">＋ Lançar marcação</button>`)}
      <p class="edi-dica" style="margin:8px 0;">O motorista marca no app (o mesmo do romaneio): dirigindo, carga/descarga, espera, pausa, refeição e o fim. Lei 13.103: jornada de 8h + até 2h extras, no máximo 5h30 dirigindo sem 30 min de descanso, 1h de refeição e 11h de descanso entre jornadas. O tempo de espera não conta como jornada.</p>
      <div class="painel oc-painel"><div class="edi-rolagem">${r.jornadas.length ? `<table class="edi-tabela"><thead><tr><th>Motorista</th><th>Início</th><th>Fim</th><th class="n">Direção</th><th class="n">Trabalho</th><th class="n">Espera</th><th class="n">Refeição</th><th class="n">Jornada</th><th class="n">Extras</th><th>Alertas</th><th></th></tr></thead><tbody>
        ${r.jornadas.map((j) => { const c = j.calculo; return `<tr><td><b>${esc(j.motorista_nome)}</b>${j.placa ? `<br><small style="color:var(--texto-fraco);">${esc(j.placa)}</small>` : ''}</td><td>${hora(j.inicio)}</td>
          <td>${j.status === 'aberta' ? `<span class="oc-sit em_transito">Aberta</span><br><small>${esc(r.tipos[c.estado] || '')}</small>` : hora(j.fim)}</td>
          <td class="n">${hhmm(c.totais.direcao)}</td><td class="n">${hhmm(c.totais.trabalho)}</td><td class="n">${hhmm(c.totais.espera)}</td><td class="n">${hhmm(c.totais.refeicao)}</td><td class="n"><b>${hhmm(c.jornada)}</b></td><td class="n">${c.extras ? hhmm(c.extras) : '—'}</td>
          <td>${c.alertas.map((a) => `<small style="display:block; color:#dc2626;">⚠ ${esc(a.texto)}</small>`).join('') || '<small style="color:var(--verde);">ok</small>'}</td>
          <td><div class="oc-linha-acoes"><button class="primario" data-jo-ver="${j.id}">Ver</button></div></td></tr>`; }).join('')}</tbody></table>`
    : '<div class="kanban-vazio">Nenhuma jornada no período. O motorista marca pelo app do romaneio, ou lance aqui em "＋ Lançar marcação".</div>'}</div></div>`;
    ligarPeriodo(telaJornada);
    $('joMot').addEventListener('change', () => { jo.motorista = $('joMot').value; telaJornada().catch(erro); });
    $('joNova').addEventListener('click', () => formMarcacao(null, r.tipos));
    $('joEspelho').addEventListener('click', () => {
      if (!jo.motorista) { mostrarAlerta('Escolha o motorista no filtro.', { tipo: 'aviso' }); return; }
      const mes = (estado.de || hoje()).slice(0, 7);
      window.open(`/api/frota/jornadas/espelho?motorista=${encodeURIComponent(jo.motorista)}&mes=${mes}&token=${encodeURIComponent(token)}`, '_blank');
    });
    document.querySelectorAll('[data-jo-ver]').forEach((b) => b.addEventListener('click', () => verJornada(Number(b.dataset.joVer)).catch(erro)));
  }
  function formMarcacao(j, tipos) {
    $('fvModalConteudo').innerHTML = `${titulo(j ? `⏱ Incluir marcação — ${esc(j.motorista_nome)}` : '⏱ Lançar marcação de jornada')}<div class="oc-form" style="margin-top:12px;">
      ${j ? '' : `<div class="campo"><label for="joM">Motorista</label><select id="joM" class="cte-entrada"><option value="">— escolha —</option>${cat.motoristas.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div>`}
      <div class="campo"><label for="joT">Marcação</label><select id="joT" class="cte-entrada">${Object.entries(tipos).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
      ${campo('joEm', 'Data e hora', agoraLocal(), 'type="datetime-local"')}${campo('joObs', 'Motivo do ajuste', '', 'maxlength="300"', 'inteiro')}</div>
      <p class="edi-dica">Marcação lançada pelo escritório fica registrada com o seu nome (o espelho mostra o que veio do app e o que foi ajustado).</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="joSalvar" style="width:auto;">Lançar</button></div>`;
    modal.classList.remove('oculto');
    $('joSalvar').addEventListener('click', async () => {
      const em = new Date($('joEm').value).toISOString();
      try {
        if (j) await enviar(`/jornadas/${j.id}/eventos`, 'POST', { tipo: $('joT').value, em, observacao: $('joObs').value });
        else await enviar('/jornadas', 'POST', { motorista_id: $('joM').value, tipo: $('joT').value, em, observacao: $('joObs').value });
        if (j) await verJornada(j.id); else fechar();
        telaJornada().catch(erro);
      } catch (err) { erro(err); }
    });
  }
  async function verJornada(id) {
    const j = await api(`/jornadas/${id}`); const c = j.calculo;
    $('fvModalConteudo').innerHTML = `${titulo(`⏱ ${esc(j.motorista_nome)} — ${hora(j.inicio)}`)}
      <div class="oc-resumo" style="margin-top:10px;"><div>Jornada<b>${hhmm(c.jornada)}</b><span>extras ${hhmm(c.extras)}</span></div><div>Direção<b>${hhmm(c.totais.direcao)}</b><span>máx. contínua ${hhmm(c.direcao_continua_max)}</span></div>
        <div>Espera<b>${hhmm(c.totais.espera)}</b><span>não conta na jornada</span></div><div>Refeição / pausas<b>${hhmm(c.totais.refeicao)}</b><span>pausas ${hhmm(c.totais.pausa)}</span></div></div>
      ${c.alertas.length ? `<div class="cte-aviso erro" style="margin:8px 0;">${c.alertas.map((a) => `⚠ ${esc(a.texto)}`).join('<br>')}</div>` : ''}
      <table class="edi-tabela"><thead><tr><th>Hora</th><th>Marcação</th><th>Origem</th><th></th></tr></thead><tbody>
      ${j.eventos.map((e) => `<tr><td>${hora(e.em)}</td><td>${esc(j.tipos[e.tipo])}${e.observacao ? `<br><small>${esc(e.observacao)}</small>` : ''}</td>
        <td><small>${e.origem === 'app' ? '📱 app' : `🖥 ${esc(e.usuario_nome || 'escritório')}`}${e.latitude != null ? ` · <a href="https://www.google.com/maps?q=${e.latitude},${e.longitude}" target="_blank" rel="noopener">📍</a>` : ''}</small></td>
        <td><a href="#" data-jo-apagar="${e.id}" style="color:var(--vermelho);">apagar</a></td></tr>`).join('')}</tbody></table>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;"><button class="btn btn-secundario" data-fv-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="joIncluir" style="width:auto;">＋ Incluir marcação</button></div>`;
    modal.classList.remove('oculto');
    $('joIncluir').addEventListener('click', () => formMarcacao(j, j.tipos));
    document.querySelectorAll('[data-jo-apagar]').forEach((a) => a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      if (!await confirmar('Apagar esta marcação? Fica no registro de auditoria quem apagou.', { tipo: 'perigo', textoOk: 'Apagar' })) return;
      try { const r = await enviar(`/jornadas/eventos/${a.dataset.joApagar}`, 'DELETE'); if (r.apagou_jornada) fechar(); else await verJornada(id); telaJornada().catch(erro); } catch (err) { erro(err); }
    }));
  }
})();
