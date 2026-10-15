// =====================================================================
// Coletas (estilo SSW): pedido do cliente, programação no caminhão (o mesmo
// romaneio e o mesmo app do motorista das entregas), baixa e o CT-e da carga.
// Usa do dashboard.js: usuario, token, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const nav = document.getElementById('navColetas');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hoje = () => iso(new Date());
  const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—');
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const num = (v, c = 0) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: c }));
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const formulario = opcoes.body instanceof FormData;
    const r = await apiFetch(`/api/coletas${caminho}`, { ...opcoes, headers: formulario ? {} : { 'Content-Type': 'application/json' } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  };
  const modal = $('modalColeta');
  const fecharModal = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-col-fechar]')) fecharModal(); });

  const STATUS = { pendente: 'A programar', programada: 'Programada', em_coleta: 'Saiu para coletar', coletada: 'Coletada', nao_coletada: 'Não coletada', cancelada: 'Cancelada' };
  const COR = { pendente: 'pendente', programada: 'em_transito', em_coleta: 'em_rota', coletada: 'entregue', nao_coletada: 'ocorrencia', cancelada: 'cancelado' };
  const CANAIS = { telefone: '📞 Telefone', whatsapp: '💬 WhatsApp', email: '✉ E-mail', presencial: '🏢 Presencial', edi: '🔁 EDI' };
  const FILTROS = [['abertas', 'Em aberto'], ['pendente', 'A programar', 'a_programar'], ['programada', 'No caminhão', 'programadas'],
    ['sem_cte', 'Coletadas sem CT-e', 'sem_cte'], ['coletada', 'Coletadas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']];
  let estado = { filtro: 'abertas', lista: [], resumo: {}, motivos: [] };

  async function iniciar() {
    if (!estado.motivos.length) {
      estado.motivos = (await api('/catalogo')).motivos;
      const d = new Date(); $('colAte').value = hoje(); d.setDate(d.getDate() - 30); $('colDe').value = iso(d);
    }
    await carregar();
  }
  nav.addEventListener('click', () => iniciar().catch(erro));

  let temporizador = null;
  $('colBusca').addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(() => carregar().catch(erro), 350); });
  ['colDe', 'colAte'].forEach((id) => $(id).addEventListener('change', () => carregar().catch(erro)));

  async function carregar() {
    const q = new URLSearchParams({ filtro: estado.filtro, busca: $('colBusca').value.trim(), de: $('colDe').value, ate: $('colAte').value });
    const r = await api(`?${q}`);
    estado.lista = r.coletas; estado.resumo = r.resumo;
    desenhar();
  }

  function desenhar() {
    const s = estado.resumo;
    $('colResumo').innerHTML = `<div>A programar<b>${s.a_programar}</b>${s.atrasadas ? `<span style="color:#ef4444;">${s.atrasadas} atrasada(s)</span>` : ''}</div>
      <div>No caminhão<b>${s.programadas}</b></div><div>Coletadas hoje<b>${s.coletadas_hoje}</b></div>
      <div>Coletadas sem CT-e<b>${s.sem_cte}</b>${s.sem_cte ? '<span>gere o CT-e ou espere a NF-e</span>' : ''}</div>`;
    $('colFiltros').innerHTML = FILTROS.map(([id, nome, chave]) => `<button class="oc-filtro ${estado.filtro === id ? 'ativo' : ''} ${id === 'sem_cte' || id === 'pendente' ? 'perigo' : ''}" data-col-filtro="${id}">${nome}${chave && s[chave] ? `<span class="n">${s[chave]}</span>` : ''}</button>`).join('');
    $('colPeriodo').classList.toggle('oculto', !['coletada', 'cancelada', 'todas'].includes(estado.filtro));
    const atrasada = (c) => ['pendente', 'nao_coletada'].includes(c.status) && String(c.data_coleta).slice(0, 10) < hoje();
    const marcavel = (c) => ['pendente', 'nao_coletada'].includes(c.status);
    $('colTabela').innerHTML = estado.lista.length ? `<table class="edi-tabela"><thead><tr>
        <th style="width:28px;"><input type="checkbox" id="colTodas" aria-label="Marcar todas" /></th><th>Nº</th><th>Data</th><th>Remetente / local</th><th>Destino</th><th class="n">Vol.</th><th class="n">Peso (kg)</th><th>Situação</th><th></th></tr></thead><tbody>
      ${estado.lista.map((c) => `<tr>
        <td>${marcavel(c) ? `<input type="checkbox" data-col-marca="${c.id}" aria-label="Marcar coleta ${c.id}" />` : ''}</td>
        <td><b>${c.id}</b></td>
        <td style="white-space:nowrap;${atrasada(c) ? ' color:#ef4444; font-weight:600;' : ''}">${dia(c.data_coleta)}${c.hora_de || c.hora_ate ? `<br><small>${esc(c.hora_de || '')}–${esc(c.hora_ate || '')}</small>` : ''}</td>
        <td><b>${esc(c.remetente_nome)}</b><br><small style="color:var(--texto-fraco);">${esc([c.logradouro, c.numero].filter(Boolean).join(', '))}${c.bairro ? ` — ${esc(c.bairro)}` : ''} · ${esc(c.cidade)}/${esc(c.uf)}</small></td>
        <td>${esc(c.destinatario_nome || '')}${c.destino_cidade ? `<br><small style="color:var(--texto-fraco);">${esc(c.destino_cidade)}/${esc(c.destino_uf || '')}</small>` : ''}</td>
        <td class="n">${c.status === 'coletada' ? `<b>${num(c.volumes_coletados)}</b>` : num(c.volumes)}</td>
        <td class="n">${c.status === 'coletada' && c.peso_coletado != null ? `<b>${num(c.peso_coletado, 1)}</b>` : num(c.peso_kg, 1)}</td>
        <td><span class="oc-sit ${COR[c.status]}">${STATUS[c.status]}</span>
          ${c.romaneio_id && ['programada', 'em_coleta'].includes(c.status) ? `<br><small><a href="#" data-col-rom="${c.romaneio_id}">romaneio ${c.romaneio_id}</a> · ${esc(c.motorista_nome || '')}</small>` : ''}
          ${c.status === 'nao_coletada' && c.motivo ? `<br><small style="color:var(--texto-fraco);">${esc(c.motivo)}</small>` : ''}
          ${c.cte_id ? `<br><small>${c.cte_numero ? `CT-e ${esc(c.cte_serie)}/${esc(c.cte_numero)}` : 'rascunho de CT-e'}</small>` : ''}</td>
        <td><div class="oc-linha-acoes"><button class="primario" data-col-abrir="${c.id}">Abrir</button>
          ${c.status === 'coletada' && !c.cte_id ? `<button data-col-cte="${c.id}">Gerar CT-e</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : `<div class="kanban-vazio">${estado.filtro === 'abertas' ? 'Nenhuma coleta em aberto. Clique em "＋ Nova coleta" quando um cliente pedir.' : 'Nenhuma coleta neste filtro.'}</div>`;
    atualizarLote();
  }

  const marcadas = () => [...document.querySelectorAll('[data-col-marca]:checked')].map((x) => Number(x.dataset.colMarca));
  function atualizarLote() {
    const n = marcadas().length;
    $('colLote').classList.toggle('oculto', !n);
    $('colLoteQtd').textContent = `${n} coleta(s) marcada(s)`;
  }
  $('colTabela').addEventListener('change', (e) => {
    if (e.target.id === 'colTodas') document.querySelectorAll('[data-col-marca]').forEach((x) => { x.checked = e.target.checked; });
    atualizarLote();
  });
  $('colFiltros').addEventListener('click', (e) => {
    const b = e.target.closest('[data-col-filtro]'); if (!b) return;
    estado.filtro = b.dataset.colFiltro; carregar().catch(erro);
  });
  $('colTabela').addEventListener('click', (e) => {
    const abrir = e.target.closest('[data-col-abrir]'); const cte = e.target.closest('[data-col-cte]'); const rom = e.target.closest('[data-col-rom]');
    if (abrir) abrirColeta(Number(abrir.dataset.colAbrir)).catch(erro);
    if (cte) gerarCte(Number(cte.dataset.colCte), cte).catch(erro);
    if (rom) { e.preventDefault(); window.nexoRomaneio?.abrir(Number(rom.dataset.colRom)).catch(erro); }
  });
  $('colNova').addEventListener('click', () => formulario());
  $('colProgramar').addEventListener('click', () => programar(marcadas()).catch(erro));

  // ---------- Formulário (nova / editar / repetir) ----------
  function formulario(c = null, { repetir = false } = {}) {
    const v = (k) => esc(c?.[k] ?? '');
    const editar = c && !repetir;
    $('colModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">${editar ? `📦 Coleta ${c.id}` : '📦 Nova coleta'}</h3><span style="cursor:pointer; font-size:18px;" data-col-fechar>✕</span></div>
      <div class="cte-secao" style="margin-top:12px;"><h4>Quem pediu</h4><div class="cte-grade">
        <div class="campo"><label for="cfCanal">Pedido por</label><select id="cfCanal">${Object.entries(CANAIS).map(([k, t]) => `<option value="${k}" ${c?.canal === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="campo"><label for="cfSolNome">Nome</label><input id="cfSolNome" maxlength="120" value="${v('solicitante_nome')}" /></div>
        <div class="campo"><label for="cfSolFone">Telefone / WhatsApp</label><input id="cfSolFone" maxlength="30" value="${v('solicitante_telefone')}" /></div>
        <div class="campo"><label for="cfSolEmail">E-mail (recebe o aviso da coleta)</label><input id="cfSolEmail" type="email" maxlength="250" value="${v('solicitante_email')}" /></div>
      </div></div>
      <div class="cte-secao"><h4>Onde coletar (remetente)</h4><div class="cte-grade">
        <div class="campo largo" style="position:relative;"><label for="cfRemNome">Remetente (nome ou CNPJ, busca no cadastro)</label><input id="cfRemNome" maxlength="200" autocomplete="off" value="${v('remetente_nome')}" />
          <div id="cfSugestoes" class="oculto" style="position:absolute; z-index:5; left:0; right:0; top:100%; background:var(--bg-card); border:1px solid var(--borda); border-radius:8px; max-height:240px; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.25);"></div></div>
        <div class="campo"><label for="cfRemDoc">CNPJ / CPF</label><input id="cfRemDoc" maxlength="18" value="${esc(docFmt(c?.remetente_doc))}" /></div>
        <div class="campo"><label for="cfRemIe">IE</label><input id="cfRemIe" maxlength="30" value="${v('remetente_ie')}" /></div>
        <div class="campo largo"><label for="cfLgr">Endereço</label><input id="cfLgr" maxlength="200" value="${v('logradouro')}" /></div>
        <div class="campo"><label for="cfNro">Número</label><input id="cfNro" maxlength="30" value="${v('numero')}" /></div>
        <div class="campo"><label for="cfCpl">Complemento</label><input id="cfCpl" maxlength="150" value="${v('complemento')}" /></div>
        <div class="campo"><label for="cfBairro">Bairro</label><input id="cfBairro" maxlength="120" value="${v('bairro')}" /></div>
        <div class="campo"><label for="cfCidade">Cidade</label><input id="cfCidade" maxlength="120" value="${v('cidade')}" /></div>
        <div class="campo"><label for="cfUf">UF</label><input id="cfUf" maxlength="2" style="text-transform:uppercase;" value="${v('uf')}" /></div>
        <div class="campo"><label for="cfCep">CEP</label><input id="cfCep" maxlength="9" value="${v('cep')}" /></div>
        <div class="campo"><label for="cfContato">Falar com</label><input id="cfContato" maxlength="120" value="${v('contato_nome')}" /></div>
        <div class="campo"><label for="cfContatoFone">Telefone do local</label><input id="cfContatoFone" maxlength="30" value="${v('contato_telefone')}" /></div>
        <input type="hidden" id="cfCodMun" value="${v('cod_municipio')}" />
      </div></div>
      <div class="cte-secao"><h4>Quando</h4><div class="cte-grade">
        <div class="campo"><label for="cfData">Data da coleta</label><input id="cfData" type="date" value="${repetir || !c ? hoje() : esc(String(c.data_coleta).slice(0, 10))}" /></div>
        <div class="campo"><label for="cfHoraDe">Das</label><input id="cfHoraDe" type="time" value="${v('hora_de')}" /></div>
        <div class="campo"><label for="cfHoraAte">Até</label><input id="cfHoraAte" type="time" value="${v('hora_ate')}" /></div>
      </div></div>
      <div class="cte-secao"><h4>Carga e destino</h4><div class="cte-grade">
        <div class="campo"><label for="cfVol">Volumes</label><input id="cfVol" inputmode="numeric" value="${v('volumes')}" /></div>
        <div class="campo"><label for="cfPeso">Peso (kg)</label><input id="cfPeso" inputmode="decimal" value="${c?.peso_kg != null ? esc(num(c.peso_kg, 3)) : ''}" /></div>
        <div class="campo"><label for="cfCub">Cubagem (m³)</label><input id="cfCub" inputmode="decimal" value="${c?.cubagem_m3 != null ? esc(num(c.cubagem_m3, 3)) : ''}" /></div>
        <div class="campo"><label for="cfValor">Valor da mercadoria (R$)</label><input id="cfValor" inputmode="decimal" value="${c?.valor_mercadoria != null ? esc(num(c.valor_mercadoria, 2)) : ''}" /></div>
        <div class="campo"><label for="cfProduto">Produto</label><input id="cfProduto" maxlength="120" value="${v('produto')}" /></div>
        <div class="campo"><label for="cfNotas">NF (se já tiver)</label><input id="cfNotas" maxlength="250" value="${v('notas')}" /></div>
        <div class="campo largo"><label for="cfDestNome">Destinatário</label><input id="cfDestNome" maxlength="200" value="${v('destinatario_nome')}" /></div>
        <div class="campo"><label for="cfDestDoc">CNPJ / CPF do destinatário</label><input id="cfDestDoc" maxlength="18" value="${esc(docFmt(c?.destinatario_doc))}" /></div>
        <div class="campo"><label for="cfDestCidade">Cidade de destino</label><input id="cfDestCidade" maxlength="120" value="${v('destino_cidade')}" /></div>
        <div class="campo"><label for="cfDestUf">UF</label><input id="cfDestUf" maxlength="2" style="text-transform:uppercase;" value="${v('destino_uf')}" /></div>
        <div class="campo"><label for="cfTomador">Quem paga o frete</label><select id="cfTomador"><option value="remetente">Remetente (CIF)</option><option value="destinatario" ${c?.tomador === 'destinatario' ? 'selected' : ''}>Destinatário (FOB)</option></select></div>
        <div class="campo inteiro"><label for="cfObs">Observação para o motorista</label><textarea id="cfObs" rows="2" maxlength="2000">${v('observacao')}</textarea></div>
      </div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-col-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="cfSalvar" style="width:auto;">${editar ? 'Salvar' : 'Registrar coleta'}</button></div>`;
    modal.classList.remove('oculto');
    $('cfRemNome').focus();
    ligarAutocompletar();
    $('cfSalvar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const corpo = {
          canal: $('cfCanal').value, solicitante_nome: $('cfSolNome').value, solicitante_telefone: $('cfSolFone').value, solicitante_email: $('cfSolEmail').value,
          remetente_nome: $('cfRemNome').value, remetente_doc: $('cfRemDoc').value, remetente_ie: $('cfRemIe').value, logradouro: $('cfLgr').value, numero: $('cfNro').value,
          complemento: $('cfCpl').value, bairro: $('cfBairro').value, cidade: $('cfCidade').value, uf: $('cfUf').value, cep: $('cfCep').value, cod_municipio: $('cfCodMun').value,
          contato_nome: $('cfContato').value, contato_telefone: $('cfContatoFone').value, data_coleta: $('cfData').value, hora_de: $('cfHoraDe').value, hora_ate: $('cfHoraAte').value,
          volumes: $('cfVol').value, peso_kg: $('cfPeso').value, cubagem_m3: $('cfCub').value, valor_mercadoria: $('cfValor').value, produto: $('cfProduto').value, notas: $('cfNotas').value,
          destinatario_nome: $('cfDestNome').value, destinatario_doc: $('cfDestDoc').value, destino_cidade: $('cfDestCidade').value, destino_uf: $('cfDestUf').value,
          tomador: $('cfTomador').value, observacao: $('cfObs').value,
        };
        const salva = editar ? await api(`/${c.id}`, { method: 'PUT', body: JSON.stringify(corpo) }) : await api('', { method: 'POST', body: JSON.stringify(corpo) });
        await carregar();
        await abrirColeta(salva.id);
        if (!editar) mostrarAlerta(`Coleta nº ${salva.id} registrada. Programe no caminhão quando for sair.`, { tipo: 'sucesso' });
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  // Busca o remetente no cadastro de clientes e preenche o endereço.
  function ligarAutocompletar() {
    const caixa = $('cfSugestoes'); let achados = []; let t = null;
    const buscar = async () => {
      if (!document.body.contains(caixa)) return;   // o formulário já foi fechado
      const q = $('cfRemNome').value.trim();
      if (q.length < 3) { caixa.classList.add('oculto'); return; }
      achados = await api(`/clientes?q=${encodeURIComponent(q)}`).catch(() => []);
      if (!document.body.contains(caixa)) return;
      caixa.innerHTML = achados.map((k, i) => `<div data-col-sug="${i}" style="padding:8px 10px; cursor:pointer; border-bottom:1px solid var(--borda); font-size:13px;"><b>${esc(k.nome)}</b> <small style="color:var(--texto-fraco);">${esc(docFmt(k.documento))}</small><br><small style="color:var(--texto-fraco);">${esc([k.logradouro, k.numero, k.bairro].filter(Boolean).join(', '))} · ${esc(k.cidade || '')}/${esc(k.uf || '')}</small></div>`).join('');
      caixa.classList.toggle('oculto', !achados.length);
    };
    $('cfRemNome').addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 300); });
    $('cfRemNome').addEventListener('blur', () => setTimeout(() => caixa.classList.add('oculto'), 200));
    caixa.addEventListener('mousedown', (e) => {
      const el = e.target.closest('[data-col-sug]'); if (!el) return;
      const k = achados[Number(el.dataset.colSug)];
      const por = { cfRemNome: k.nome, cfRemDoc: docFmt(k.documento), cfRemIe: k.ie, cfLgr: k.logradouro, cfNro: k.numero, cfCpl: k.complemento, cfBairro: k.bairro,
        cfCidade: k.cidade, cfUf: k.uf, cfCep: k.cep, cfCodMun: k.cod_municipio, cfContatoFone: k.telefone };
      Object.entries(por).forEach(([id, val]) => { $(id).value = val || ''; });
      if (!$('cfSolEmail').value && k.email) $('cfSolEmail').value = k.email;
      caixa.classList.add('oculto');
    });
  }

  // ---------- Detalhe ----------
  async function abrirColeta(id) {
    const c = await api(`/${id}`);
    const linha = (rot, val) => (val ? `<div><span style="color:var(--texto-fraco); font-size:12px;">${rot}</span><br>${val}</div>` : '');
    const aberta = ['pendente', 'programada', 'em_coleta', 'nao_coletada'].includes(c.status);
    $('colModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div><h3 style="margin:0;">📦 Coleta ${c.id} <span class="oc-sit ${COR[c.status]}" style="vertical-align:middle;">${STATUS[c.status]}</span></h3>
        <div style="font-size:12.5px; color:var(--texto-fraco); margin-top:4px;">${dia(c.data_coleta)}${c.hora_de || c.hora_ate ? ` · ${esc(c.hora_de || '')}–${esc(c.hora_ate || '')}` : ''} · ${CANAIS[c.canal] || ''}${c.solicitante_nome ? ` por ${esc(c.solicitante_nome)}` : ''} · registrada por ${esc(c.criado_por_nome || '')}</div></div>
        <span style="cursor:pointer; font-size:18px;" data-col-fechar>✕</span></div>
      ${c.motivo ? `<div class="cte-aviso ${c.status === 'cancelada' ? 'erro' : ''}" style="margin-top:10px;">${c.status === 'cancelada' ? 'Cancelada' : 'Não coletada'}: ${esc(c.motivo)}</div>` : ''}
      ${c.romaneio_id && ['programada', 'em_coleta'].includes(c.status) ? `<div class="cte-aviso" style="margin-top:10px;">🚚 No <a href="#" id="cdRom">romaneio ${c.romaneio_id}</a> · ${esc(c.motorista_nome || '')}${c.placa ? ` · ${esc(c.placa)}` : ''}${c.romaneio_status === 'aberto' ? ' · aguardando saída' : ' · caminhão na rua'}</div>` : ''}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px 18px; margin-top:14px; font-size:13.5px;">
        ${linha('Remetente', `<b>${esc(c.remetente_nome)}</b>${c.remetente_doc ? `<br><small>${esc(docFmt(c.remetente_doc))}</small>` : ''}`)}
        ${linha('Endereço', `${esc([c.logradouro, c.numero, c.complemento].filter(Boolean).join(', '))}${c.bairro ? ` — ${esc(c.bairro)}` : ''}<br>${esc(c.cidade)}/${esc(c.uf)}${c.cep ? ` · CEP ${esc(c.cep)}` : ''}`)}
        ${linha('Falar com', esc([c.contato_nome, c.contato_telefone].filter(Boolean).join(' · ')))}
        ${linha('Destino', esc([c.destinatario_nome, [c.destino_cidade, c.destino_uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')))}
        ${linha('Carga prevista', esc([c.volumes ? `${num(c.volumes)} vol.` : '', c.peso_kg != null ? `${num(c.peso_kg, 1)} kg` : '', c.cubagem_m3 != null ? `${num(c.cubagem_m3, 3)} m³` : '', c.produto].filter(Boolean).join(' · ')))}
        ${linha('Frete pago por', c.tomador === 'destinatario' ? 'Destinatário (FOB)' : 'Remetente (CIF)')}
        ${linha('NF', esc(c.notas))}
        ${linha('Pedido por', esc([c.solicitante_nome, c.solicitante_telefone, c.solicitante_email].filter(Boolean).join(' · ')))}
      </div>
      ${c.observacao ? `<p style="font-size:13px;"><b>Observação:</b> ${esc(c.observacao)}</p>` : ''}
      ${c.status === 'coletada' ? `<div class="cte-secao" style="margin-top:12px;"><h4>✓ Coletada ${dataHora(c.coletado_em)}</h4>
        <div style="font-size:13.5px;"><b>${num(c.volumes_coletados)} volume(s)</b>${c.peso_coletado != null ? ` · ${num(c.peso_coletado, 1)} kg` : ''} · entregue por <b>${esc(c.entregue_por || '')}</b>
        ${c.volumes && c.volumes_coletados !== c.volumes ? `<br><span style="color:#d97706;">⚠ Previsto: ${num(c.volumes)} volume(s)</span>` : ''}
        ${c.obs_motorista ? `<br>${esc(c.obs_motorista)}` : ''}<br>
        ${c.foto_arquivo ? `<a href="/api/coletas/${c.id}/arquivo?token=${encodeURIComponent(token)}" target="_blank" rel="noopener">📷 Foto</a> · ` : ''}${c.assinatura_arquivo ? `<a href="/api/coletas/${c.id}/arquivo?tipo=assinatura&token=${encodeURIComponent(token)}" target="_blank" rel="noopener">✍ Assinatura</a> · ` : ''}${c.latitude != null ? `<a href="https://www.google.com/maps?q=${c.latitude},${c.longitude}" target="_blank" rel="noopener">📍 Local</a>` : ''}</div></div>` : ''}
      ${c.cte_id ? `<div class="cte-aviso ok" style="margin-top:10px;">📄 ${c.cte_numero ? `CT-e ${esc(c.cte_serie)}/${esc(c.cte_numero)} (${esc(c.cte_status)})` : `Rascunho de CT-e #${c.cte_id}`} — <a href="#" id="cdAbrirCte">abrir</a></div>` : ''}
      <div id="cdBaixa"></div>
      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:16px;">
        ${aberta ? '<button class="btn btn-secundario" id="cdCancelar" style="width:auto; color:var(--vermelho);">Cancelar coleta</button>' : ''}
        ${c.status === 'cancelada' ? '<button class="btn btn-secundario" id="cdReabrir" style="width:auto;">Reabrir</button>' : ''}
        <button class="btn btn-secundario" id="cdRepetir" style="width:auto;" title="Nova coleta com os mesmos dados (cliente que pede toda semana)">↻ Repetir</button>
        ${aberta ? '<button class="btn btn-secundario" id="cdEditar" style="width:auto;">Editar</button>' : ''}
        ${['programada', 'em_coleta'].includes(c.status) ? '<button class="btn btn-secundario" id="cdTirar" style="width:auto;">Tirar do caminhão</button>' : ''}
        ${['pendente', 'nao_coletada'].includes(c.status) ? '<button class="btn btn-secundario" id="cdProgramar" style="width:auto;">🚚 Programar</button>' : ''}
        ${aberta ? '<button class="btn btn-primario" id="cdDarBaixa" style="width:auto;">Dar baixa</button>' : ''}
        ${c.status === 'coletada' && !c.cte_id ? '<button class="btn btn-primario" id="cdGerarCte" style="width:auto;">📄 Gerar CT-e</button>' : ''}</div>`;
    modal.classList.remove('oculto');
    const depois = async () => { await carregar(); await abrirColeta(id); };
    $('cdRom')?.addEventListener('click', (e) => { e.preventDefault(); fecharModal(); window.nexoRomaneio?.abrir(c.romaneio_id).catch(erro); });
    $('cdAbrirCte')?.addEventListener('click', (e) => { e.preventDefault(); abrirCte(c.cte_id); });
    $('cdEditar')?.addEventListener('click', () => formulario(c));
    $('cdRepetir').addEventListener('click', () => formulario(c, { repetir: true }));
    $('cdProgramar')?.addEventListener('click', () => programar([c.id]).catch(erro));
    $('cdGerarCte')?.addEventListener('click', (e) => gerarCte(c.id, e.currentTarget).catch(erro));
    $('cdTirar')?.addEventListener('click', async () => {
      if (!await confirmar('Tirar esta coleta do caminhão? Ela volta para "A programar".', { textoOk: 'Tirar' })) return;
      try { await api(`/${id}/desprogramar`, { method: 'POST' }); await depois(); } catch (err) { erro(err); }
    });
    $('cdCancelar')?.addEventListener('click', async () => {
      const motivo = await pedirTexto('Por que a coleta foi cancelada?', { titulo: `Cancelar coleta ${id}`, placeholder: 'Ex.: cliente desistiu', textoOk: 'Cancelar coleta' });
      if (motivo == null) return;
      try { await api(`/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) }); await depois(); } catch (err) { erro(err); }
    });
    $('cdReabrir')?.addEventListener('click', async () => { try { await api(`/${id}/reabrir`, { method: 'POST' }); await depois(); } catch (err) { erro(err); } });
    $('cdDarBaixa')?.addEventListener('click', () => formBaixa(c, depois));
  }

  // Baixa pelo escritório (o motorista avisou por telefone ou voltou sem o app).
  function formBaixa(c, depois) {
    $('cdBaixa').innerHTML = `<div class="cte-secao" style="margin-top:12px;"><h4>Dar baixa</h4>
      <div style="display:flex; gap:14px; margin-bottom:8px;"><label class="ag-check"><input type="radio" name="cbRes" value="1" checked /> Coletada</label>
        <label class="ag-check"><input type="radio" name="cbRes" value="0" /> Não coletada</label></div>
      <div class="cte-grade" id="cbSim">
        <div class="campo"><label for="cbVol">Volumes coletados</label><input id="cbVol" inputmode="numeric" value="${esc(c.volumes ?? '')}" /></div>
        <div class="campo"><label for="cbPeso">Peso (kg)</label><input id="cbPeso" inputmode="decimal" value="${c.peso_kg != null ? esc(num(c.peso_kg, 3)) : ''}" /></div>
        <div class="campo largo"><label for="cbPor">Entregue por (quem liberou a carga)</label><input id="cbPor" maxlength="120" /></div>
      </div>
      <div class="cte-grade oculto" id="cbNao"><div class="campo inteiro"><label for="cbMotivo">Motivo</label><select id="cbMotivo">${estado.motivos.map((m) => `<option>${esc(m)}</option>`).join('')}</select></div></div>
      <div class="campo"><label for="cbFoto">Foto (opcional)</label><input id="cbFoto" type="file" accept="image/*" /></div>
      <div class="campo"><label for="cbObs">Observação</label><input id="cbObs" maxlength="1000" /></div>
      <button class="btn btn-primario" id="cbConfirmar" style="width:auto;">Confirmar baixa</button></div>`;
    document.querySelectorAll('[name=cbRes]').forEach((r) => r.addEventListener('change', () => {
      const sim = document.querySelector('[name=cbRes]:checked').value === '1';
      $('cbSim').classList.toggle('oculto', !sim); $('cbNao').classList.toggle('oculto', sim);
    }));
    $('cbConfirmar').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const fd = new FormData();
        const sim = document.querySelector('[name=cbRes]:checked').value === '1';
        fd.append('coletado', String(sim));
        if (sim) { fd.append('volumes', $('cbVol').value); fd.append('peso', $('cbPeso').value); fd.append('entregue_por', $('cbPor').value); } else fd.append('motivo', $('cbMotivo').value);
        fd.append('observacao', $('cbObs').value);
        if ($('cbFoto').files[0]) fd.append('foto', $('cbFoto').files[0]);
        await api(`/${c.id}/baixa`, { method: 'POST', body: fd });
        await depois();
      } catch (err) { erro(err); b.disabled = false; }
    });
    $('cbVol').focus();
  }

  // ---------- Programar no caminhão ----------
  async function programar(ids) {
    if (!ids.length) return;
    const [romaneios, motoristas, veiculos] = await Promise.all([
      apiFetch('/api/romaneios').then((r) => r.json()).then((l) => (Array.isArray(l) ? l.filter((r) => r.status !== 'fechado') : [])),
      apiFetch('/api/mdfe/motoristas').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      apiFetch('/api/mdfe/veiculos').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    const motAtivos = (Array.isArray(motoristas) ? motoristas : []).filter((m) => m.ativo !== false);
    const veiAtivos = (Array.isArray(veiculos) ? veiculos : []).filter((v) => v.ativo !== false && v.tipo !== 'reboque');
    $('colModalConteudo').innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🚚 Programar ${ids.length} coleta(s)</h3><span style="cursor:pointer; font-size:18px;" data-col-fechar>✕</span></div>
      <p class="edi-dica">As coletas entram no romaneio do caminhão e aparecem no app do motorista junto com as entregas.</p>
      ${romaneios.length ? `<div class="cte-secao"><h4>Num caminhão que já tem romaneio</h4>
        ${romaneios.map((r) => `<label class="ag-check" style="display:flex; margin:6px 0;"><input type="radio" name="pgRom" value="${r.id}" />
          Romaneio ${r.id} · ${esc(r.motorista_nome)}${r.placa ? ` · ${esc(r.placa)}` : ''} · ${r.ctes} CT-e${r.coletas ? ` + ${r.coletas} coleta(s)` : ''} · ${r.status === 'em_rota' ? '<b>na rua</b> (o motorista vê na hora)' : 'aguardando saída'}</label>`).join('')}</div>` : ''}
      <div class="cte-secao"><h4><label class="ag-check"><input type="radio" name="pgRom" value="" ${romaneios.length ? '' : 'checked'} /> Num romaneio novo</label></h4>
        <div class="oc-form">
          <div class="campo"><label for="pgMot">Motorista</label><input id="pgMot" list="pgMotLista" maxlength="120" /><datalist id="pgMotLista">${motAtivos.map((m) => `<option value="${esc(m.nome)}"></option>`).join('')}</datalist></div>
          <div class="campo"><label for="pgPlaca">Placa</label><input id="pgPlaca" list="pgPlacaLista" maxlength="8" style="text-transform:uppercase;" /><datalist id="pgPlacaLista">${veiAtivos.map((v) => `<option value="${esc(v.placa)}">${esc(v.descricao || '')}</option>`).join('')}</datalist></div>
          <div class="campo"><label for="pgData">Data</label><input id="pgData" type="date" value="${hoje()}" /></div>
          <div class="campo"><label for="pgFone">Celular do motorista</label><input id="pgFone" maxlength="30" /></div>
        </div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-col-fechar style="width:auto;">Cancelar</button>
        <button class="btn btn-primario" id="pgOk" style="width:auto;">Programar</button></div>`;
    modal.classList.remove('oculto');
    $('pgMot').addEventListener('change', () => {
      const m = motAtivos.find((x) => x.nome === $('pgMot').value);
      if (m) { $('pgFone').value = m.telefone || ''; $('pgMot').dataset.doc = m.cpf || ''; }
      document.querySelector('[name=pgRom][value=""]').checked = true;
    });
    $('pgPlaca').addEventListener('input', () => { document.querySelector('[name=pgRom][value=""]').checked = true; });
    $('pgOk').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const escolhido = document.querySelector('[name=pgRom]:checked');
      if (!escolhido) { mostrarAlerta('Escolha o romaneio ou preencha o motorista do romaneio novo.', { tipo: 'aviso' }); return; }
      b.disabled = true;
      try {
        const v = veiAtivos.find((x) => x.placa === $('pgPlaca').value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
        const corpo = escolhido.value ? { coletas: ids, romaneio_id: Number(escolhido.value) }
          : { coletas: ids, novo: { motorista_nome: $('pgMot').value, motorista_documento: $('pgMot').dataset.doc || '', motorista_telefone: $('pgFone').value, placa: $('pgPlaca').value, veiculo: v?.descricao || '', data: $('pgData').value } };
        const r = await api('/programar', { method: 'POST', body: JSON.stringify(corpo) });
        fecharModal();
        await carregar();
        await window.nexoRomaneio?.abrir(r.romaneio_id);
      } catch (err) { erro(err); b.disabled = false; }
    });
  }

  // ---------- CT-e ----------
  async function abrirCte(id) {
    fecharModal();
    document.getElementById('navEmissaoCte')?.click();
    await window.nexoCte?.abrir(id);
  }
  async function gerarCte(id, botao) {
    if (botao) botao.disabled = true;
    try {
      const r = await api(`/${id}/gerar-cte`, { method: 'POST' });
      await carregar();
      await abrirCte(r.id);
      if (!r.existente) mostrarAlerta('Rascunho de CT-e criado com o remetente, o destino e a carga da coleta. Inclua as NF-e e confira os valores antes de transmitir.', { tipo: 'sucesso' });
    } finally { if (botao) botao.disabled = false; }
  }

  window.nexoColetas = { recarregar: () => { if (!$('pagina-coletas').classList.contains('oculto')) carregar().catch(() => {}); } };
})();
