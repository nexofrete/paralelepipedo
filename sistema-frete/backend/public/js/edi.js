// =====================================================================
// EDI PROCEDA 3.1: NOTFIS, CONEMB, OCOREN e DOCCOB, dos dois lados
// (embarcador e transportadora). Usa do dashboard.js: usuario, apiFetch,
// mostrarAlerta, confirmar, cfAbrir/cfCarregarCtes/cfMarcarColados.
// =====================================================================
(() => {
  const ehAdmin = usuario?.perfil === 'admin';
  const ladoEmbarcador = ehAdmin || !!(usuario?.pode_ver_auditoria || usuario?.pode_editar_registros || usuario?.pode_enviar_xml);
  const ladoTransportadora = ehAdmin || !!usuario?.pode_emitir_cte;
  const podeGravarEntrega = ehAdmin || !!usuario?.pode_editar_registros;
  const nav = document.getElementById('navEdi');
  if (!nav || (!ladoEmbarcador && !ladoTransportadora)) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const dataBr = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
  const hojeIso = (dias = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/edi${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  };
  const baixar = (nome, texto) => {
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=us-ascii' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const lerArquivo = (input) => new Promise((resolve, reject) => {
    const f = input.files[0];
    if (!f) { reject(new Error('Escolha o arquivo.')); return; }
    const leitor = new FileReader();
    leitor.onload = () => resolve({ nome: f.name, texto: leitor.result });
    leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    leitor.readAsText(f, 'ISO-8859-1');   // os arquivos PROCEDA costumam vir em ANSI
  });
  const comBotao = async (botao, fn) => {
    const texto = botao.textContent; botao.disabled = true; botao.textContent = 'Aguarde...';
    try { await fn(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); } finally { botao.disabled = false; botao.textContent = texto; }
  };

  // ---------------- Abas ----------------
  if (!ladoEmbarcador) $('ediAbaEmbarcador').classList.add('oculto');
  if (!ladoTransportadora) $('ediAbaTransportadora').classList.add('oculto');
  const abrirAba = (lado) => {
    document.querySelectorAll('[data-edi-aba]').forEach((a) => a.classList.toggle('ativo', a.dataset.ediAba === lado));
    $('edi-aba-embarcador').classList.toggle('oculto', lado !== 'embarcador');
    $('edi-aba-transportadora').classList.toggle('oculto', lado !== 'transportadora');
    if (lado === 'embarcador') carregarTransportadoras(); else carregarClientes();
  };
  document.querySelectorAll('[data-edi-aba]').forEach((a) => a.addEventListener('click', () => abrirAba(a.dataset.ediAba)));
  let iniciado = false;
  nav.addEventListener('click', () => {
    if (iniciado) return;
    iniciado = true;
    $('ediNfDe').value = hojeIso(-7); $('ediNfAte').value = hojeIso();
    $('ediCtDe').value = hojeIso(-30); $('ediCtAte').value = hojeIso();
    abrirAba(ladoEmbarcador ? 'embarcador' : 'transportadora');
  });

  // =================================================================
  // Embarcador
  // =================================================================
  async function carregarTransportadoras() {
    try {
      const lista = await api('/embarcador/transportadoras');
      $('ediNfTransp').innerHTML = lista.length
        ? `<option value="">Selecione...</option>${lista.map((t) => `<option value="${esc(t.nome)}">${esc(t.nome)} (${t.notas} nota${t.notas > 1 ? 's' : ''})</option>`).join('')}`
        : '<option value="">Nenhuma nota com XML nos últimos 120 dias</option>';
    } catch (err) { $('ediNfTransp').innerHTML = `<option value="">${esc(err.message)}</option>`; }
  }

  $('ediGerarNotfis').addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
    const r = await api('/embarcador/notfis', { method: 'POST', body: JSON.stringify({
      transportadora: $('ediNfTransp').value, de: $('ediNfDe').value, ate: $('ediNfAte').value, semCte: $('ediNfSemCte').checked }) });
    baixar(r.nome, r.texto);
    $('ediNotfisResultado').innerHTML = `<div class="cte-aviso ok">✓ <b>${esc(r.nome)}</b> — ${r.notas} nota(s). Envie esse arquivo para a transportadora (e-mail, FTP ou portal dela).</div>`
      + (r.avisos.length ? `<div class="cte-aviso">${r.avisos.map(esc).join('<br>')}</div>` : '');
  }));

  let ultimaLeitura = null;
  $('ediArquivoEmb').addEventListener('change', async (e) => {
    const alvo = $('ediResultadoEmb');
    try {
      const { nome, texto } = await lerArquivo(e.target);
      alvo.innerHTML = '<div class="painel edi-painel">Lendo o arquivo...</div>';
      ultimaLeitura = await api('/embarcador/ler', { method: 'POST', body: JSON.stringify({ texto }) });
      ultimaLeitura.arquivo = nome;
      ({ CONEMB: mostrarConemb, OCOREN: mostrarOcoren, DOCCOB: mostrarDoccob })[ultimaLeitura.tipo](ultimaLeitura);
    } catch (err) {
      alvo.innerHTML = `<div class="cte-aviso erro">${esc(err.message)}</div>`;
    } finally { e.target.value = ''; }
  });

  const cabecalhoLeitura = (r, titulo) => `<h3 style="margin:0 0 4px;">${titulo}</h3>
    <p class="edi-dica">${esc(r.arquivo)} · ${esc(r.transportadora?.razao || r.transportadora?.nomeCadastro || '')} ${r.transportadora?.cnpj ? `(${esc(r.transportadora.cnpj)})` : ''} · gerado em ${dataBr(r.cabecalho?.data)}</p>
    ${r.avisos?.length ? `<div class="cte-aviso">${r.avisos.slice(0, 5).map(esc).join('<br>')}${r.avisos.length > 5 ? `<br>… e mais ${r.avisos.length - 5}` : ''}</div>` : ''}`;

  const SITUACAO_CONEMB = {
    cte_ja_recebido: ['✓ CT-e (XML) já no sistema', 'var(--verde)'],
    aguardando_xml_cte: ['Aguardando o XML do CT-e', 'var(--amarelo)'],
    nota_nao_encontrada: ['NF não encontrada', 'var(--vermelho)'],
  };
  function mostrarConemb(r) {
    const comTabela = r.linhas.filter((l) => l.diferenca != null);
    const aMais = comTabela.filter((l) => l.diferenca > 0.009);
    const total = r.linhas.reduce((s, l) => s + (l.valorFrete || 0), 0);
    $('ediResultadoEmb').innerHTML = `<div class="painel edi-painel">${cabecalhoLeitura(r, '📄 CONEMB — conhecimentos da transportadora')}
      <div class="edi-resumo">
        <div><b>${r.linhas.length}</b>CT-e no arquivo</div><div><b>${moeda(total)}</b>valor total</div>
        <div><b>${r.linhas.filter((l) => l.situacao === 'aguardando_xml_cte').length}</b>sem o XML do CT-e ainda</div>
        <div><b style="color:${aMais.length ? 'var(--vermelho)' : 'inherit'};">${aMais.length}</b>acima da tabela (${moeda(aMais.reduce((s, l) => s + l.diferenca, 0))})</div>
        <div><b>${r.linhas.filter((l) => !l.frete).length}</b>NF não encontrada</div>
      </div>
      <div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>CT-e</th><th>Emissão</th><th>NF</th><th>Cliente</th><th class="n">Valor CONEMB</th><th class="n">Tabela</th><th class="n">Diferença</th><th>Situação</th></tr></thead><tbody>
      ${r.linhas.map((l) => {
    const [txt, cor] = SITUACAO_CONEMB[l.situacao];
    return `<tr><td><b>${esc(l.numero)}</b>${l.serie ? `<small style="color:var(--texto-fraco);"> /${esc(l.serie)}</small>` : ''}${l.tipo && l.tipo !== 'Normal' ? `<br><small>${esc(l.tipo)}</small>` : ''}</td>
          <td>${dataBr(l.emissao)}</td><td>${esc(l.notas.slice(0, 3).join(', '))}${l.notas.length > 3 ? ` +${l.notas.length - 3}` : ''}</td>
          <td>${l.frete ? `${esc(l.frete.cliente || '—')}<br><small style="color:var(--texto-fraco);">${esc(l.frete.cidade || '')}${l.frete.uf ? `/${esc(l.frete.uf)}` : ''}</small>` : '—'}</td>
          <td class="n">${moeda(l.valorFrete)}</td><td class="n">${moeda(l.valorTabela)}</td>
          <td class="n" style="color:${l.diferenca > 0.009 ? 'var(--vermelho)' : l.diferenca < -0.009 ? 'var(--verde)' : 'inherit'};">${l.diferenca == null ? '—' : `${l.diferenca > 0 ? '+' : ''}${moeda(l.diferenca)}`}</td>
          <td style="color:${cor};">${txt}</td></tr>`;
  }).join('')}</tbody></table></div>
      <p class="edi-dica" style="margin-top:10px;">O CONEMB só confere: o frete entra na Auditoria quando chega o XML do CT-e (Enviar XML ou caixa de e-mail).</p></div>`;
  }

  function mostrarOcoren(r) {
    const gravar = r.linhas.filter((l) => l.acao === 'gravar_entrega');
    $('ediResultadoEmb').innerHTML = `<div class="painel edi-painel">${cabecalhoLeitura(r, '🚚 OCOREN — ocorrências na entrega')}
      <div class="edi-resumo">
        <div><b>${r.linhas.length}</b>ocorrências</div><div><b>${r.linhas.filter((l) => l.entregue).length}</b>entregas</div>
        <div><b>${gravar.length}</b>entregas novas para gravar</div><div><b>${r.linhas.filter((l) => !l.frete).length}</b>NF não encontrada</div>
      </div>
      <div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>NF</th><th>Cliente</th><th>Ocorrência</th><th>Quando</th><th>Entrega no Nexofrete</th></tr></thead><tbody>
      ${r.linhas.map((l) => `<tr>
        <td><b>${esc(l.numero)}</b></td>
        <td>${l.frete ? `${esc(l.frete.cliente || '—')}<br><small style="color:var(--texto-fraco);">${esc(l.frete.cidade || '')}${l.frete.uf ? `/${esc(l.frete.uf)}` : ''}</small>` : '<span style="color:var(--vermelho);">NF não encontrada</span>'}</td>
        <td><span style="color:${l.entregue ? 'var(--verde)' : 'inherit'};">${String(l.codigo).padStart(2, '0')} — ${esc(l.descricao)}</span>${l.observacao ? `<br><small>${esc(l.observacao)}</small>` : ''}${l.texto && l.texto.toUpperCase() !== l.descricao.toUpperCase() ? `<br><small style="color:var(--texto-fraco);">${esc(l.texto)}</small>` : ''}</td>
        <td style="white-space:nowrap;">${dataBr(l.data)}${l.hora && l.hora !== '00:00' ? ` ${esc(l.hora)}` : ''}</td>
        <td>${l.frete?.data_entrega ? `${dataBr(l.frete.data_entrega)}` : l.acao === 'gravar_entrega' ? '<span style="color:var(--azul);">vai gravar</span>' : '—'}</td></tr>`).join('')}
      </tbody></table></div>
      ${gravar.length ? (podeGravarEntrega
    ? `<div class="edi-acoes"><button class="btn btn-primario" id="ediGravarEntregas" style="width:auto;">✓ Gravar ${gravar.length} data(s) de entrega</button>
         <span class="edi-dica" style="margin:0;">Só nas notas que ainda não têm data. A origem fica registrada como "EDI".</span></div>`
    : '<p class="edi-dica" style="margin-top:10px;">Para gravar as entregas é preciso a permissão de editar registros.</p>') : ''}</div>`;
    $('ediGravarEntregas')?.addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
      const x = await api('/embarcador/ocoren/aplicar', { method: 'POST', body: JSON.stringify({ itens: gravar.map((l) => ({ id: l.frete.id, data: l.data })) }) });
      mostrarAlerta(`${x.gravadas} data(s) de entrega gravada(s).`, { tipo: 'sucesso' });
      gravar.forEach((l) => { l.frete.data_entrega = l.data; l.acao = null; });
      mostrarOcoren(r);
    }));
  }

  function mostrarDoccob(r) {
    $('ediResultadoEmb').innerHTML = `<div class="painel edi-painel">${cabecalhoLeitura(r, '💰 DOCCOB — fatura da transportadora')}
      ${r.faturas.map((f, i) => {
    const fora = f.ctes.filter((c) => !c.noSistema); const faturados = f.ctes.filter((c) => c.jaFaturado);
    const somaSistema = f.ctes.reduce((s, c) => s + (Number(c.valorSistema) || 0), 0);
    return `<div class="edi-resumo" style="margin-top:10px;">
          <div><b>${esc(f.numero)}</b>fatura${f.serie ? ` série ${esc(f.serie)}` : ''}</div><div><b>${dataBr(f.vencimento)}</b>vencimento</div>
          <div><b>${moeda(f.valor)}</b>valor da fatura</div><div><b>${f.ctes.length}</b>CT-e</div>
          <div><b style="color:${fora.length ? 'var(--vermelho)' : 'inherit'};">${fora.length}</b>CT-e que não estão no Nexofrete</div>
          <div><b style="color:${faturados.length ? 'var(--vermelho)' : 'inherit'};">${faturados.length}</b>já em outra fatura</div>
          <div><b>${moeda(somaSistema)}</b>soma dos CT-e no sistema</div>
        </div>
        ${f.banco ? `<p class="edi-dica">Pagamento: ${esc(f.banco)}</p>` : ''}
        ${fora.length ? `<div class="cte-aviso">CT-e fora do Nexofrete (falta o XML): ${fora.slice(0, 30).map((c) => esc(c.numero)).join(', ')}${fora.length > 30 ? '…' : ''}</div>` : ''}
        <div class="edi-acoes"><button class="btn btn-primario" data-edi-conferir="${i}" style="width:auto;">🧾 Conferir esta fatura</button></div>`;
  }).join('<hr style="border:none; border-top:1px solid var(--borda); margin:16px 0;">')}</div>`;
    document.querySelectorAll('[data-edi-conferir]').forEach((b) => b.addEventListener('click', () => conferirFatura(r, r.faturas[Number(b.dataset.ediConferir)])));
  }

  // Abre a Conferência de Fatura já com número, vencimento, valor, transportadora e os CT-e.
  async function conferirFatura(r, f) {
    if (typeof cfAbrir !== 'function') { mostrarAlerta('A conferência de fatura não está disponível para o seu usuário.', { tipo: 'erro' }); return; }
    await cfAbrir();
    const sel = $('cfTransportadora');
    const alvo = String(r.transportadora.nomeCadastro || r.transportadora.razao || '').toUpperCase();
    const opcao = [...sel.options].find((o) => o.value && (o.value.toUpperCase() === alvo || alvo.startsWith(o.value.toUpperCase()) || o.value.toUpperCase().startsWith(alvo.slice(0, 12))));
    if (opcao) { sel.value = opcao.value; await cfCarregarCtes(); }
    $('cfNumero').value = f.numero;
    if ($('cfEmissao')) $('cfEmissao').value = f.emissao || '';
    $('cfVencimento').value = f.vencimento || '';
    $('cfValor').value = Number(f.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    $('cfColarCtes').value = f.ctes.map((c) => c.numero).join('\n');
    if (typeof cfMarcarColados === 'function') cfMarcarColados();
    if (typeof cfAtualizarResumo === 'function') cfAtualizarResumo();
    if (!opcao) mostrarAlerta(`Escolha a transportadora "${r.transportadora.razao || r.transportadora.cnpj}" na conferência — não achei pelo nome.`, { tipo: 'aviso' });
  }

  // =================================================================
  // Transportadora
  // =================================================================
  async function carregarClientes() {
    if (!ladoTransportadora) return;
    try {
      const lista = await api('/transportadora/tomadores');
      $('ediCliente').innerHTML = lista.length
        ? `<option value="">Selecione...</option>${lista.map((t) => `<option value="${esc(t.cnpj)}" data-nome="${esc(t.nome)}">${esc(t.nome)} — ${esc(t.cnpj)} (${t.ctes} CT-e)</option>`).join('')}`
        : '<option value="">Nenhum CT-e autorizado nos últimos 180 dias</option>';
    } catch (err) { $('ediCliente').innerHTML = `<option value="">${esc(err.message)}</option>`; }
  }

  let notfisLido = null;
  $('ediArquivoNotfis').addEventListener('change', async (e) => {
    const alvo = $('ediResultadoTransp');
    try {
      const { nome, texto } = await lerArquivo(e.target);
      notfisLido = await api('/transportadora/notfis/ler', { method: 'POST', body: JSON.stringify({ texto }) });
      const dests = notfisLido.embarcadores.flatMap((em) => em.destinatarios.map((d) => ({ ...d, embarcador: em.razao || em.cnpj })));
      const notas = dests.flatMap((d) => d.notas);
      const semChave = notas.filter((n) => !n.chave).length;
      alvo.innerHTML = `<div class="painel edi-painel"><h3 style="margin:0 0 4px;">📄 NOTFIS — ${esc(nome)}</h3>
        <p class="edi-dica">${esc(notfisLido.remetente)} · ${dataBr(notfisLido.data)} · ${esc(notfisLido.documento)}</p>
        <div class="edi-resumo"><div><b>${dests.length}</b>destinatários (= CT-e)</div><div><b>${notas.length}</b>notas</div>
          <div><b>${moeda(notas.reduce((s, n) => s + (n.valor || 0), 0))}</b>valor das notas</div>
          <div><b>${notas.reduce((s, n) => s + (n.peso || 0), 0).toLocaleString('pt-BR')} kg</b>peso</div>
          <div><b style="color:${semChave ? 'var(--vermelho)' : 'inherit'};">${semChave}</b>notas sem a chave da NF-e</div></div>
        ${semChave ? '<div class="cte-aviso">O layout 3.1 não traz a chave da NF-e. Sem ela o CT-e não transmite: importe o XML das notas (Enviar XML) antes, ou cole a chave no rascunho.</div>' : ''}
        <div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Destinatário</th><th>Cidade</th><th>NF</th><th class="n">Volumes</th><th class="n">Peso (kg)</th><th class="n">Valor</th><th>Frete</th><th>Chave NF-e</th></tr></thead><tbody>
        ${dests.map((d) => d.notas.map((n, k) => `<tr>${k === 0 ? `<td rowspan="${d.notas.length}"><b>${esc(d.razao)}</b><br><small style="color:var(--texto-fraco);">${esc(d.cnpj)}</small></td><td rowspan="${d.notas.length}">${esc(d.cidade)}/${esc(d.uf)}</td>` : ''}
          <td>${esc(n.numero)}${n.serie ? `/${esc(n.serie)}` : ''}</td><td class="n">${esc(n.volumes)}</td><td class="n">${Number(n.peso || 0).toLocaleString('pt-BR')}</td><td class="n">${moeda(n.valor)}</td>
          <td>${n.condicaoFrete === 'F' ? 'FOB' : 'CIF'}</td><td>${n.chave ? `<span style="color:var(--verde);" title="${esc(n.chave)}">✓ ${esc(n.chaveOrigem)}</span>` : '<span style="color:var(--vermelho);">falta</span>'}</td></tr>`).join('')).join('')}
        </tbody></table></div>
        <div class="edi-acoes"><button class="btn btn-primario" id="ediCriarRascunhos" style="width:auto;">+ Criar ${dests.length} rascunho(s) de CT-e</button>
          <span class="edi-dica" style="margin:0;">Depois é só abrir em Emissão de CT-e, conferir o valor do frete e transmitir.</span></div></div>`;
      $('ediCriarRascunhos').addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
        const r = await api('/transportadora/notfis/rascunhos', { method: 'POST', body: JSON.stringify({ notfis: notfisLido }) });
        const faltando = r.criados.filter((c) => c.semChave.length).length;
        mostrarAlerta(`${r.criados.length} rascunho(s) de CT-e criado(s) em Emissão de CT-e.${faltando ? `\n${faltando} deles ainda precisam da chave da NF-e.` : ''}`, { tipo: 'sucesso' });
        ev.currentTarget.disabled = true;
      }));
    } catch (err) {
      alvo.innerHTML = `<div class="cte-aviso erro">${esc(err.message)}</div>`;
    } finally { e.target.value = ''; }
  });

  const OCORRENCIAS = [[1, 'Entrega realizada normalmente'], [2, 'Entrega fora da data programada'], [91, 'Entrega programada'], [98, 'Chegada na cidade ou filial'],
    [19, 'Reentrega solicitada pelo cliente'], [21, 'Estabelecimento fechado'], [6, 'Endereço não localizado'], [46, 'Responsável pelo recebimento ausente'],
    [25, 'Mercadoria devolvida ao cliente de origem'], [9, 'Mercadoria em desacordo com o pedido'], [14, 'Mercadoria sinistrada'], [79, 'Avaria parcial'],
    [78, 'Avaria total'], [81, 'Extravio parcial'], [27, 'Roubo de carga'], [29, 'Cliente retira na transportadora'], [99, 'Outros tipos de ocorrência']];
  let ctesCliente = [];
  $('ediCarregarCtes').addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
    if (!$('ediCliente').value) throw new Error('Escolha o cliente.');
    ctesCliente = await api(`/transportadora/ctes?tomador=${encodeURIComponent($('ediCliente').value)}&de=${$('ediCtDe').value}&ate=${$('ediCtAte').value}`);
    desenharCtes();
  }));
  const nomeCliente = () => $('ediCliente').selectedOptions[0]?.dataset.nome || '';
  const marcados = () => [...document.querySelectorAll('[data-edi-cte]:checked')].map((c) => Number(c.dataset.ediCte));

  function desenharCtes() {
    const alvo = $('ediResultadoTransp');
    if (!ctesCliente.length) { alvo.innerHTML = '<div class="cte-aviso">Nenhum CT-e autorizado desse cliente no período.</div>'; return; }
    alvo.innerHTML = `<div class="painel edi-painel"><h3 style="margin:0 0 10px;">CT-e de ${esc(nomeCliente())}</h3>
      <div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th><input type="checkbox" id="ediTodos" checked title="Marcar todos" /></th><th>CT-e</th><th>Emissão</th><th>Destinatário</th><th>NF</th><th class="n">Valor</th><th>Ocorrência (para o OCOREN)</th><th>Data</th><th>Hora</th></tr></thead><tbody>
      ${ctesCliente.map((c) => `<tr>
        <td><input type="checkbox" data-edi-cte="${c.id}" checked /></td>
        <td><b>${esc(c.serie)}/${esc(c.numero)}</b>${c.demonstracao ? '<br><small style="color:var(--azul);">demonstração</small>' : ''}</td>
        <td>${dataBr(c.emissao)}</td><td>${esc(c.destinatario)}<br><small style="color:var(--texto-fraco);">${esc(c.cidade)}/${esc(c.uf)}</small></td>
        <td>${c.notas.map((n) => esc(n.numero)).join(', ') || '—'}</td><td class="n">${moeda(c.valor)}</td>
        <td><select data-edi-oco="${c.id}"><option value="">—</option>${OCORRENCIAS.map(([v, t]) => `<option value="${v}">${String(v).padStart(2, '0')} ${esc(t)}</option>`).join('')}</select></td>
        <td><input type="date" data-edi-oco-data="${c.id}" value="${hojeIso()}" /></td><td><input type="time" data-edi-oco-hora="${c.id}" /></td></tr>`).join('')}
      </tbody></table></div>
      <div class="edi-acoes">
        <button class="btn btn-primario" id="ediGerarConemb" style="width:auto;">⬇ CONEMB (CT-e marcados)</button>
        <button class="btn btn-secundario" id="ediGerarOcoren" style="width:auto;">⬇ OCOREN (linhas com ocorrência)</button>
      </div>
      <div class="edi-acoes" style="border-top:1px solid var(--borda); padding-top:14px;">
        <div class="campo"><label for="ediFatNumero">Nº da fatura</label><input type="text" id="ediFatNumero" maxlength="10" style="width:120px;" /></div>
        <div class="campo"><label for="ediFatVenc">Vencimento</label><input type="date" id="ediFatVenc" value="${hojeIso(15)}" /></div>
        <div class="campo"><label for="ediFatBanco">Banco</label><input type="text" id="ediFatBanco" maxlength="35" placeholder="Ex: Banco do Brasil" style="width:160px;" /></div>
        <div class="campo"><label for="ediFatAg">Agência</label><input type="text" id="ediFatAg" maxlength="6" style="width:80px;" /></div>
        <div class="campo"><label for="ediFatConta">Conta</label><input type="text" id="ediFatConta" maxlength="13" style="width:120px;" /></div>
        <button class="btn btn-primario" id="ediGerarDoccob" style="width:auto;">⬇ DOCCOB (fatura dos CT-e marcados)</button>
      </div></div>`;
    $('ediTodos').addEventListener('change', (e) => document.querySelectorAll('[data-edi-cte]').forEach((c) => { c.checked = e.target.checked; }));
    const periodo = () => ({ tomador: $('ediCliente').value, nome: nomeCliente(), de: $('ediCtDe').value, ate: $('ediCtAte').value });
    $('ediGerarConemb').addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
      const ids = marcados(); if (!ids.length) throw new Error('Marque pelo menos um CT-e.');
      const r = await api('/transportadora/conemb', { method: 'POST', body: JSON.stringify({ ...periodo(), ids }) });
      baixar(r.nome, r.texto); mostrarAlerta(`CONEMB gerado com ${r.ctes} CT-e: ${r.nome}`, { tipo: 'sucesso' });
    }));
    $('ediGerarDoccob').addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
      const ids = marcados(); if (!ids.length) throw new Error('Marque os CT-e da fatura.');
      const [agencia, agenciaDv] = $('ediFatAg').value.split('-'); const [conta, contaDv] = $('ediFatConta').value.split('-');
      const r = await api('/transportadora/doccob', { method: 'POST', body: JSON.stringify({ ...periodo(), ids,
        fatura: { numero: $('ediFatNumero').value.trim(), vencimento: $('ediFatVenc').value, banco: $('ediFatBanco').value, agencia, agenciaDv, conta, contaDv } }) });
      baixar(r.nome, r.texto); mostrarAlerta(`DOCCOB gerado: ${r.ctes} CT-e, ${moeda(r.valor)}.`, { tipo: 'sucesso' });
    }));
    $('ediGerarOcoren').addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
      const ocorrencias = [];
      ctesCliente.forEach((c) => {
        const codigo = document.querySelector(`[data-edi-oco="${c.id}"]`).value;
        if (!codigo) return;
        const dataOco = document.querySelector(`[data-edi-oco-data="${c.id}"]`).value; const hora = document.querySelector(`[data-edi-oco-hora="${c.id}"]`).value;
        c.notas.forEach((n) => ocorrencias.push({ cnpjEmissorNf: c.cnpjEmissorNf, serie: n.serie, numero: n.numero, codigo, data: dataOco, hora }));
      });
      if (!ocorrencias.length) throw new Error('Escolha a ocorrência em pelo menos uma linha.');
      const r = await api('/transportadora/ocoren', { method: 'POST', body: JSON.stringify({ nome: nomeCliente(), ocorrencias }) });
      baixar(r.nome, r.texto); mostrarAlerta(`OCOREN gerado com ${r.ocorrencias} ocorrência(s).`, { tipo: 'sucesso' });
    }));
  }
})();
