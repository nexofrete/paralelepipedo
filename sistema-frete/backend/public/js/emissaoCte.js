// =====================================================================
// Emissão de CT-e (modo transportadora): lista, formulário, configuração
// fiscal e certificado. Usa do dashboard.js: token, usuario, apiFetch,
// mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const podeEmitirCte = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte;
  const ehAdmin = usuario?.perfil === 'admin';
  const nav = document.getElementById('navEmissaoCte');
  if (!podeEmitirCte || !nav) return;
  nav.classList.remove('oculto');
  if (!ehAdmin) document.getElementById('cteAbaConfig').classList.add('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isNaN(n) ? null : n; };
  const numPonto = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isNaN(n) ? null : n; };
  const fmtNum = (v, casas = 2) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const STATUS = { rascunho: 'Rascunho', enviando: 'Enviando', autorizado: 'Autorizado', rejeitado: 'Rejeitado', erro: 'Sem resposta', cancelado: 'Cancelado', substituido: 'Substituído' };
  const TIPO_SERV = { 0: 'Normal', 1: 'Subcontratação', 2: 'Redespacho', 3: 'Redespacho intermediário' };
  const nCte = (c) => (c ? `${Number(String(c).slice(22, 25))}/${Number(String(c).slice(25, 34))}` : '');
  let config = null;

  async function json(resposta) {
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.erro || 'Erro ao falar com o servidor.');
    return corpo;
  }
  const api = (caminho, opcoes = {}) => apiFetch(`/api/cte-emissao${caminho}`, {
    ...opcoes, headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
  }).then(json);

  // ---------------- Navegação ----------------
  nav.addEventListener('click', () => { carregarConfig().then(carregarLista); });
  document.querySelectorAll('.cte-aba').forEach((aba) => aba.addEventListener('click', () => {
    document.querySelectorAll('.cte-aba').forEach((a) => a.classList.toggle('ativo', a === aba));
    // Cada aba tem o seu painel "cte-aba-<nome>" (lista, mdfe, frota, config).
    document.querySelectorAll('[id^="cte-aba-"]').forEach((p) => p.classList.toggle('oculto', p.id !== `cte-aba-${aba.dataset.cteAba}`));
    if (aba.dataset.cteAba === 'config') renderConfig();
  }));

  async function carregarConfig() {
    try {
      config = await api('/config');
    } catch (e) { config = null; }
    const selo = $('cteSeloAmbiente');
    if (config) {
      const prod = Number(config.cte_ambiente) === 1;
      selo.textContent = config.cte_demonstracao ? 'DEMONSTRAÇÃO (SEFAZ simulada — nada é enviado)' : prod ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO (sem valor fiscal)';
      selo.className = `badge ${config.cte_demonstracao ? 'badge-faturado' : prod ? 'badge-liberado' : 'badge-pendente'}`;
      if (config.cte_contingencia) { selo.textContent += ` · CONTINGÊNCIA ${config.svc_sigla || 'SVC'}`; selo.className = 'badge badge-pendente'; }
    }
    const faltando = [];
    if (!config?.cnpj || !config?.razao_social) faltando.push('dados da empresa');
    if (!config?.codigo_municipio || !config?.uf) faltando.push('município (código IBGE) e UF');
    if (!config?.rntrc) faltando.push('RNTRC');
    if (!config?.tem_certificado) faltando.push('certificado digital A1');
    const venc = config?.certificado_validade ? new Date(config.certificado_validade) : null;
    const aviso = $('cteAvisoConfig');
    if (config?.cte_contingencia) {
      aviso.innerHTML = `⚠️ <b>Contingência ligada</b>: os CT-e estão sendo autorizados pela <b>${esc(config.svc_sigla || 'SVC')}</b>${config.cte_contingencia_inicio ? ` desde ${new Date(config.cte_contingencia_inicio).toLocaleString('pt-BR')}` : ''}. Quando a SEFAZ ${esc(config.uf || '')} voltar, desligue em Configuração fiscal${ehAdmin ? '' : ' (peça ao administrador)'}.`;
      aviso.className = 'cte-aviso erro';
    } else if (faltando.length) {
      aviso.innerHTML = `Para transmitir, complete a <b>Configuração fiscal</b>: ${esc(faltando.join(', '))}.${ehAdmin ? '' : ' Peça ao administrador.'}`;
      aviso.className = 'cte-aviso';
    } else if (venc && venc - Date.now() < 30 * 86400000) {
      aviso.innerHTML = `O certificado digital vence em <b>${venc.toLocaleDateString('pt-BR')}</b>. Providencie a renovação.`;
      aviso.className = 'cte-aviso';
    } else {
      aviso.className = 'cte-aviso oculto';
    }
  }

  // ---------------- Lista ----------------
  let buscaTimer = null;
  $('cteBusca').addEventListener('input', () => { clearTimeout(buscaTimer); buscaTimer = setTimeout(carregarLista, 300); });
  $('cteFiltroStatus').addEventListener('change', carregarLista);

  async function carregarLista() {
    const corpo = document.querySelector('#tabelaCtes tbody');
    try {
      const p = new URLSearchParams();
      if ($('cteBusca').value.trim()) p.set('busca', $('cteBusca').value.trim());
      if ($('cteFiltroStatus').value) p.set('status', $('cteFiltroStatus').value);
      const lista = await api(`/?${p}`);
      if (!lista.length) { corpo.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--texto-fraco); padding:24px;">Nenhum CT-e ainda. Clique em “+ Novo CT-e”.</td></tr>'; return; }
      corpo.innerHTML = lista.map(linhaLista).join('');
    } catch (e) {
      corpo.innerHTML = `<tr><td colspan="7" style="color:var(--vermelho);">${esc(e.message)}</td></tr>`;
    }
  }

  function linhaLista(c) {
    const b = (acao, texto, extra = '') => `<button class="btn btn-secundario" data-cte-acao="${acao}" data-id="${c.id}" ${extra}>${texto}</button>`;
    const acoes = [];
    if (['rascunho', 'rejeitado'].includes(c.status)) acoes.push(b('editar', '✏️ Editar'), b('transmitir', '📤 Transmitir'));
    if (['erro', 'enviando'].includes(c.status)) acoes.push(b('transmitir', '🔁 Tentar de novo'), b('consultar', '🔎 Consultar'));
    if (c.status === 'autorizado') acoes.push(b('consultar', '🔎 Consultar'), b('cce', '✍️ Correção'), b('cancelar', '⛔ Cancelar'));
    if (c.status === 'autorizado' && c.tp_cte !== '1') acoes.push(b('complementar', '➕ Complementar'), b('substituir', '♻ Substituir'));
    if (c.chave_pendente_origem) acoes.push(b('pendente', '⚠ Chave pendente'));
    if (c.status === 'autorizado' && c.averbacao_status !== 'averbado') acoes.push(b('averbar', '🛡 Averbar'));
    acoes.push(b('dacte', c.status === 'autorizado' || c.status === 'cancelado' ? '🖨 DACTE' : '👁 Prévia'));
    if (c.chave) acoes.push(b('xml', '⬇ XML'));
    acoes.push(b('duplicar', '⧉ Duplicar'));
    if (c.status === 'rascunho' && !c.numero) acoes.push(b('excluir', '🗑'));
    const motivo = c.motivo && ['rejeitado', 'erro', 'cancelado'].includes(c.status)
      ? `<div style="font-size:11.5px; color:${c.status === 'cancelado' ? 'var(--texto-fraco)' : 'var(--vermelho)'}; max-width:280px;">${esc(c.cstat && c.status !== 'cancelado' ? `${c.cstat} - ` : '')}${esc(c.motivo)}</div>` : '';
    return `<tr>
      <td style="white-space:nowrap;"><b>${c.numero ? `${c.serie}/${c.numero}` : '—'}</b><div style="font-size:11px; color:var(--texto-fraco);">${dataHora(c.autorizado_em || c.criado_em)}</div>${c.demonstracao ? '<div style="font-size:10.5px; color:var(--azul);">demonstração</div>' : Number(c.ambiente) === 2 ? '<div style="font-size:10.5px; color:var(--amarelo);">homologação</div>' : ''}</td>
      <td><span class="badge badge-cte-${esc(c.status)}">${esc(STATUS[c.status] || c.status)}</span>${motivo}
        ${c.tp_cte === '1' ? `<div class="cte-tipo">Complementar do ${esc(nCte(c.chave_referencia))}</div>` : ''}
        ${c.tp_cte === '3' ? `<div class="cte-tipo">Substitui o ${esc(nCte(c.chave_referencia))}</div>` : ''}
        ${c.substituido_por_numero ? `<div class="cte-tipo">Substituído pelo ${esc(c.substituido_por_numero)}</div>` : ''}
        ${c.tp_serv && c.tp_serv !== '0' ? `<div class="cte-tipo">${esc(TIPO_SERV[c.tp_serv])}</div>` : ''}
        ${Number(c.tp_emis) > 1 ? `<div class="cte-tipo alerta">Contingência ${Number(c.tp_emis) === 7 ? 'SVC-RS' : 'SVC-SP'}</div>` : ''}
        ${c.chave_pendente_origem ? '<div class="cte-tipo alerta">Chave pendente na SEFAZ de origem</div>' : ''}
        ${seloAverbacao(c)}
        ${c.status === 'rascunho' && c.origem_tipo === 'email' ? `<div class="cte-tipo" title="${esc(c.origem_remetente || '')}">✉ chegou por e-mail</div>` : ''}
        ${c.status === 'rascunho' && (c.avisos_importacao || []).length ? `<div class="cte-tipo alerta">⚠ ${esc(c.avisos_importacao.join('; '))}</div>` : ''}</td>
      <td>${esc(c.tomador_nome || '—')}</td>
      <td style="font-size:12.5px;">${esc(c.remetente_nome || '—')}<br><span style="color:var(--texto-fraco);">→ ${esc(c.destinatario_nome || '—')}</span></td>
      <td>${esc(c.cidade_fim || '—')}${c.uf_fim ? `/${esc(c.uf_fim)}` : ''}</td>
      <td style="text-align:right; white-space:nowrap;">${moeda(c.valor_total)}</td>
      <td><div class="cte-acoes">${acoes.join('')}</div></td></tr>`;
  }

  // Situação da averbação do seguro (só para CT-e que já passou pela SEFAZ).
  function seloAverbacao(c) {
    if (!['autorizado', 'cancelado', 'substituido'].includes(c.status) || !c.averbacao_status) return '';
    if (c.averbacao_status === 'averbado') return `<div class="cte-tipo" title="${esc(c.averbacao_mensagem || '')}">🛡 Averbado${c.averbacao_teste ? ' (teste)' : ''} · ${esc(c.averbacao_numero || c.averbacao_protocolo || '')}</div>`;
    if (c.averbacao_status === 'cancelado') return '<div class="cte-tipo">🛡 Averbação cancelada</div>';
    return `<div class="cte-tipo alerta" title="${esc(c.averbacao_mensagem || '')}">⚠ Averbação falhou: ${esc(String(c.averbacao_mensagem || '').slice(0, 70))}</div>`;
  }
  $('cteAverbarPendentes').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await api('/averbar-pendentes', { method: 'POST' });
      mostrarAlerta(r.total ? `${r.averbados} de ${r.total} CT-e averbados.${r.falhas.length ? `\n\nFalharam:\n${r.falhas.map((f) => `#${f.id}: ${f.mensagem}`).join('\n')}` : ''}` : 'Nenhum CT-e pendente de averbação nos últimos 30 dias.', { tipo: r.falhas.length ? 'aviso' : 'sucesso' });
      carregarLista();
    } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    b.disabled = false;
  });

  document.querySelector('#tabelaCtes tbody').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-cte-acao]');
    if (!btn) return;
    const id = btn.dataset.id;
    const acao = btn.dataset.cteAcao;
    try {
      if (acao === 'editar') return abrirFormulario(id);
      if (acao === 'dacte') return window.open(`/api/cte-emissao/${id}/dacte?token=${encodeURIComponent(token)}`, '_blank');
      if (acao === 'xml') { window.location.href = `/api/cte-emissao/${id}/xml?token=${encodeURIComponent(token)}`; return null; }
      btn.disabled = true;
      if (acao === 'transmitir') await transmitir(id);
      if (acao === 'consultar') {
        const r = await api(`/${id}/consultar`, { method: 'POST' });
        mostrarAlerta(`SEFAZ: ${r.consulta.cStat} - ${r.consulta.xMotivo}${r.consulta.nProt ? `\nProtocolo: ${r.consulta.nProt}` : ''}`, { tipo: ['100', '150'].includes(r.consulta.cStat) ? 'sucesso' : 'aviso' });
      }
      if (acao === 'complementar' || acao === 'substituir') {
        if (acao === 'substituir' && !await confirmar('O CT-e de substituição troca este CT-e por outro com os dados corrigidos (valores, impostos, tomador...). Remetente, destinatário, expedidor, recebedor e NF-e continuam os mesmos.\n\nAntes, o tomador (quem paga o frete) precisa registrar na SEFAZ o evento "Prestação do serviço em desacordo" deste CT-e. Prazo: 60 dias da autorização.', { titulo: 'Substituir CT-e', textoOk: 'Montar o substituto' })) return null;
        const novo = await api(`/${id}/${acao}`, { method: 'POST' });
        await carregarLista();
        return abrirFormulario(novo.id);
      }
      if (acao === 'averbar') {
        const r = await api(`/${id}/averbar`, { method: 'POST' });
        mostrarAlerta(r.status === 'averbado' ? `Averbado. Protocolo ${r.protocolo}${r.numero && r.numero !== r.protocolo ? `\nNº de averbação ${r.numero}` : ''}${r.teste ? '\n(averbação de TESTE: CT-e de homologação/demonstração)' : ''}` : `A averbadora não averbou: ${r.mensagem}`, { tipo: r.status === 'averbado' ? 'sucesso' : 'erro' });
      }
      if (acao === 'pendente') {
        const r = await api(`/${id}/consultar`, { method: 'POST' });
        const p = r.pendente;
        if (!p) { mostrarAlerta('Ainda não deu para conferir a chave pendente na SEFAZ de origem (a contingência continua ligada ou a SEFAZ não respondeu). Tente quando a SEFAZ voltar.', { tipo: 'aviso' }); }
        else if (p.autorizada) {
          if (await confirmar(`A SEFAZ de origem TAMBÉM autorizou a chave ${p.chave} (protocolo ${p.nProt}), enviada antes da contingência. Ela precisa ser cancelada, porque este CT-e já foi autorizado na contingência.`, { tipo: 'perigo', titulo: 'CT-e em duplicidade', textoOk: 'Cancelar a chave da origem' })) {
            const ev = await api(`/${id}/cancelar-pendente`, { method: 'POST' });
            mostrarAlerta(`Chave da SEFAZ de origem cancelada. Protocolo ${ev.protocolo}.`, { tipo: 'sucesso' });
          }
        } else mostrarAlerta(`A SEFAZ de origem respondeu: ${p.cStat} - ${p.xMotivo}. Não há o que cancelar.`, { tipo: 'sucesso' });
      }
      if (acao === 'duplicar') { const novo = await api(`/${id}/duplicar`, { method: 'POST' }); await carregarLista(); return abrirFormulario(novo.id); }
      if (acao === 'excluir') {
        if (!await confirmar('Excluir este rascunho de CT-e?', { tipo: 'perigo', textoOk: 'Excluir' })) return null;
        await api(`/${id}`, { method: 'DELETE' });
      }
      if (acao === 'cancelar') {
        const just = await pedirTexto('Justificativa do cancelamento (mínimo 15 caracteres). O cancelamento é enviado à SEFAZ e não pode ser desfeito.', { titulo: 'Cancelar CT-e', multilinha: true, textoOk: 'Cancelar CT-e' });
        if (just == null) return null;
        const r = await api(`/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ justificativa: just }) });
        mostrarAlerta(`CT-e cancelado. Protocolo do evento: ${r.protocolo}`, { tipo: 'sucesso' });
      }
      if (acao === 'cce') await cartaCorrecao(id);
      await carregarLista();
    } catch (e) {
      mostrarAlerta(e.message, { tipo: 'erro' });
      carregarLista();
    } finally {
      btn.disabled = false;
    }
    return null;
  });

  async function transmitir(id) {
    const prod = Number(config?.cte_ambiente) === 1;
    if (prod && !await confirmar('Transmitir este CT-e em PRODUÇÃO? Depois de autorizado ele tem valor fiscal.', { textoOk: 'Transmitir' })) return null;
    const c = await api(`/${id}/transmitir`, { method: 'POST' });
    if (c.status === 'autorizado') {
      mostrarAlerta(c.demonstracao
        ? `CT-e ${c.serie}/${c.numero} autorizado na DEMONSTRAÇÃO (simulado, nada foi enviado à SEFAZ).\nProtocolo de demonstração: ${c.protocolo}`
        : `CT-e ${c.serie}/${c.numero} autorizado!\nProtocolo: ${c.protocolo}`, { tipo: 'sucesso' });
      window.open(`/api/cte-emissao/${id}/dacte?token=${encodeURIComponent(token)}`, '_blank');
    } else {
      mostrarAlerta(`A SEFAZ não autorizou o CT-e ${c.serie}/${c.numero}:\n${c.cstat || ''} - ${c.motivo || ''}\n\nCorrija e transmita de novo (o número continua reservado).`, { tipo: 'erro' });
    }
    return c;
  }

  async function cartaCorrecao(id) {
    const ajuda = 'Informe o grupo e o campo do XML do CT-e a corrigir e o valor certo. Exemplos: grupo "compl", campo "xObs"; grupo "infCarga", campo "proPred". Não pode corrigir valores, impostos, datas, nem trocar remetente, destinatário ou tomador.';
    const grupo = await pedirTexto(`${ajuda}\n\nGrupo:`, { titulo: 'Carta de correção', placeholder: 'compl' });
    if (!grupo) return;
    const campo = await pedirTexto('Campo:', { titulo: 'Carta de correção', placeholder: 'xObs' });
    if (!campo) return;
    const valor = await pedirTexto('Valor correto:', { titulo: 'Carta de correção', multilinha: true });
    if (!valor) return;
    const r = await api(`/${id}/carta-correcao`, { method: 'POST', body: JSON.stringify({ correcoes: [{ grupo, campo, valor }] }) });
    mostrarAlerta(`Carta de correção registrada. Protocolo: ${r.protocolo}`, { tipo: 'sucesso' });
  }

  // ---------------- Formulário do CT-e ----------------
  let editandoId = null;
  let nfes = [];          // chaves de acesso
  // Tipo do CT-e que está aberto: 0 normal, 1 complementar, 3 substituição (com a chave de referência).
  let tipoCte = { tpCTe: '0', complementados: [], substituido: null };
  let origemCte = null;   // de onde veio o rascunho (e-mail, arquivo) — continua depois de editar
  $('btnNovoCte').addEventListener('click', () => abrirFormulario(null));

  // NF-e em lote (arquivos ou e-mail) -> rascunhos de CT-e.
  function resumoImportacao(r) {
    const linhas = (r.criados || []).map((c) => `• NF ${c.nfs.join(', ')} → ${c.destinatario || ''}: ${c.valor ? moeda(c.valor) : 'frete a lançar'}${c.avisos?.length ? ` (${c.avisos.join('; ')})` : ''}`);
    const ign = (r.ignoradas || []).map((i) => `• ${i.nf ? `NF ${i.nf}` : i.arquivo}: ${i.motivo}`);
    return `${r.criados?.length || 0} rascunho(s) de CT-e criado(s).${linhas.length ? `\n${linhas.join('\n')}` : ''}${ign.length ? `\n\nNão viraram CT-e:\n${ign.join('\n')}` : ''}\n\nConfira e transmita (filtro "Rascunho").`;
  }
  $('btnCteImportarNfe').addEventListener('click', () => $('cteArquivosLote').click());
  $('cteArquivosLote').addEventListener('change', async (e) => {
    const arquivos = [...e.target.files]; e.target.value = '';
    if (!arquivos.length) return;
    const b = $('btnCteImportarNfe'); b.disabled = true;
    try {
      const lidos = await Promise.all(arquivos.map((f) => new Promise((ok, falha) => {
        const fr = new FileReader(); fr.onload = () => ok({ nome: f.name, conteudo: String(fr.result).split(',')[1] }); fr.onerror = falha; fr.readAsDataURL(f);
      })));
      const r = await api('/importar-nfe', { method: 'POST', body: JSON.stringify({ arquivos: lidos }) });
      mostrarAlerta(resumoImportacao(r), { tipo: r.criados.length ? 'sucesso' : 'aviso', titulo: 'NF-e importadas' });
      $('cteFiltroStatus').value = 'rascunho'; carregarLista();
    } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    b.disabled = false;
  });
  $('btnCteBuscarEmail').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await api('/buscar-email', { method: 'POST' });
      mostrarAlerta(`${r.mensagem}${r.detalhes?.length ? `\n\n${r.detalhes.slice(0, 15).map((d) => `• ${d}`).join('\n')}` : ''}`, { tipo: r.ok ? (r.cte ? 'sucesso' : 'info') : 'aviso', titulo: 'NF-e por e-mail' });
      if (r.cte) { $('cteFiltroStatus').value = 'rascunho'; carregarLista(); }
    } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
    b.disabled = false;
  });
  $('btnFecharCte').addEventListener('click', fecharFormulario);
  $('btnCteCancelarForm').addEventListener('click', fecharFormulario);
  function fecharFormulario() { $('modalCte').classList.add('oculto'); }

  const campo = (id, rotulo, { tipo = 'text', classe = '', ph = '', valor = '', extra = '' } = {}) => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input type="${tipo}" id="${id}" placeholder="${esc(ph)}" value="${esc(valor)}" ${extra} /></div>`;
  const selUf = (id, rotulo) => `<div class="campo"><label for="${id}">${rotulo}</label><select id="${id}"><option value=""></option>${UFS.map((u) => `<option>${u}</option>`).join('')}</select></div>`;

  function blocoPessoa(pre, titulo) {
    return `<div class="cte-secao" id="${pre}_bloco"><h4>${titulo} <button type="button" class="btn btn-secundario" data-ibge="${pre}" style="width:auto; font-size:11.5px; padding:3px 8px;">🔎 Achar código IBGE</button></h4><div class="cte-grade">
      ${campo(`${pre}_doc`, 'CNPJ ou CPF')}${campo(`${pre}_ie`, 'Inscrição estadual', { ph: 'só números ou ISENTO' })}
      ${campo(`${pre}_nome`, 'Razão social / nome', { classe: 'largo' })}
      ${campo(`${pre}_lgr`, 'Logradouro', { classe: 'largo' })}${campo(`${pre}_nro`, 'Número')}${campo(`${pre}_cpl`, 'Complemento')}
      ${campo(`${pre}_bairro`, 'Bairro')}${campo(`${pre}_mun`, 'Município')}${campo(`${pre}_cmun`, 'Código IBGE', { ph: '7 dígitos' })}
      ${selUf(`${pre}_uf`, 'UF')}${campo(`${pre}_cep`, 'CEP')}${campo(`${pre}_fone`, 'Telefone')}${campo(`${pre}_email`, 'E-mail')}
    </div></div>`;
  }
  const CFOPS = [
    ['353', 'a estabelecimento comercial'], ['352', 'a estabelecimento industrial'], ['357', 'a não contribuinte'], ['356', 'a produtor rural'],
    ['351', 'para execução de serviço da mesma natureza'], ['359', 'carga dispensada de nota fiscal'], ['360', 'a contribuinte substituto'],
  ];

  function renderFormulario() {
    const ibs = config?.cte_ibscbs_ativo;
    $('cteFormCorpo').innerHTML = `
      <div id="cteAvisoTipo"></div>
      <div class="cte-secao" id="cteSecaoServico"><h4>Tipo de serviço</h4><div class="cte-grade">
        <div class="campo largo"><label for="cteTpServ">Serviço</label><select id="cteTpServ">
          <option value="0">Normal — a transportadora faz o transporte para o cliente</option>
          <option value="2">Redespacho — outra transportadora contratou o trecho final</option>
          <option value="1">Subcontratação — outra transportadora contratou o transporte todo</option>
          <option value="3">Redespacho intermediário — trecho do meio (sem entregar ao destinatário)</option></select></div>
        <div class="campo largo" style="display:flex; gap:16px; align-items:flex-end; padding-bottom:10px;">
          <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="cteTemExped" style="width:auto;" /> Há expedidor</label>
          <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="cteTemReceb" style="width:auto;" /> Há recebedor</label></div>
        <div class="campo inteiro" id="cteAjudaServico" style="font-size:12px; color:var(--texto-fraco);"></div>
      </div></div>
      <div class="cte-secao oculto" id="cteSecaoDocAnt"><h4>CT-e anterior (de quem contratou este serviço)
        <span style="display:flex; gap:6px;"><button type="button" class="btn btn-secundario" id="cteBtnLerCteAnt" style="width:auto;">📄 Ler XML do CT-e anterior</button>
        <input type="file" id="cteArquivoCteAnt" accept=".xml,text/xml" class="oculto" /></span></h4>
        <div class="cte-grade">
          ${campo('ant_doc', 'CNPJ de quem emitiu')}${campo('ant_ie', 'Inscrição estadual')}${selUf('ant_uf', 'UF')}${campo('ant_nome', 'Razão social', { classe: 'largo' })}
          <div class="campo inteiro"><label for="ant_chaves">Chave(s) do CT-e anterior (uma por linha)</label><textarea id="ant_chaves" rows="2" style="width:100%; font-family:ui-monospace,monospace;"></textarea></div>
        </div>
        <div style="font-size:12px; color:var(--texto-fraco); margin-bottom:8px;">Ao ler o XML do CT-e da transportadora que contratou, o sistema preenche essa parte, o remetente, o destinatário, as NF-e e a carga.</div>
      </div>
      <div class="cte-secao" id="cteSecaoNfe"><h4>Documentos transportados (NF-e)
        <span style="display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secundario" id="cteBtnLerNfe" style="width:auto;">📄 Ler XML da NF-e</button>
          <button type="button" class="btn btn-secundario" id="cteBtnBuscarNfe" style="width:auto;">🔎 NF-e já importada</button>
          <input type="file" id="cteArquivoNfe" accept=".xml,text/xml" multiple class="oculto" />
        </span></h4>
        <div class="cte-chips" id="cteChipsNfe"></div>
        <div style="display:flex; gap:8px; margin-bottom:10px;"><input type="text" id="cteChaveManual" class="cte-entrada" placeholder="Ou digite a chave de acesso (44 dígitos) e tecle Enter" style="flex:1;" /></div>
        <div style="font-size:12px; color:var(--texto-fraco); margin-bottom:8px;">Ao ler o XML, remetente, destinatário, peso, volumes e valor da carga são preenchidos sozinhos (os de mais de uma NF-e são somados).</div>
      </div>
      <div class="cte-duas">${blocoPessoa('rem', 'Remetente')}${blocoPessoa('dest', 'Destinatário')}</div>
      <div class="cte-duas"><div id="cteBlocoExped" class="oculto">${blocoPessoa('exp', 'Expedidor (entregou a carga para a transportadora)')}</div>
        <div id="cteBlocoReceb" class="oculto">${blocoPessoa('rec', 'Recebedor (vai receber a carga da transportadora)')}</div></div>
      <div class="cte-secao"><h4>Tomador do serviço (quem paga o frete)</h4><div class="cte-grade">
        <div class="campo"><label for="cteTomador">Tomador</label><select id="cteTomador"><option value="0">Remetente (CIF)</option><option value="3">Destinatário (FOB)</option>
          <option value="1">Expedidor</option><option value="2">Recebedor</option><option value="4">Outro</option></select></div>
        <div class="campo largo oculto" id="cteAlteraTomaCampo" style="display:flex; align-items:flex-end; padding-bottom:10px;"><label style="display:flex; gap:6px; align-items:center;">
          <input type="checkbox" id="cteAlteraToma" style="width:auto;" /> O substituto troca o tomador do serviço</label></div>
      </div></div>
      <div id="cteBlocoOutroTomador" class="oculto">${blocoPessoa('toma', 'Outro tomador')}</div>
      <div class="cte-secao"><h4>Prestação <button type="button" class="btn btn-secundario" id="cteBtnPuxarPrestacao" style="width:auto; font-size:11.5px; padding:3px 8px;">↺ Início/fim pelos participantes</button></h4><div class="cte-grade">
        ${campo('ini_mun', 'Início — município')}${campo('ini_cmun', 'Início — código IBGE')}${selUf('ini_uf', 'Início — UF')}
        ${campo('fim_mun', 'Fim — município')}${campo('fim_cmun', 'Fim — código IBGE')}${selUf('fim_uf', 'Fim — UF')}
        <div class="campo largo"><label for="cteCfopTipo">Natureza (CFOP)</label><select id="cteCfopTipo">${CFOPS.map(([s, t]) => `<option value="${s}">Transporte ${t}</option>`).join('')}</select></div>
        ${campo('cteCfop', 'CFOP', { extra: 'readonly' })}
        <div class="campo inteiro" id="cteAvisoPrestacao" style="font-size:12px; color:var(--amarelo);"></div>
      </div></div>
      <div class="cte-secao" id="cteSecaoCarga"><h4>Carga</h4><div class="cte-grade">
        ${campo('carga_pro', 'Produto predominante', { classe: 'largo' })}${campo('carga_out', 'Outras características')}
        ${campo('carga_valor', 'Valor da carga (R$)')}${campo('carga_peso', 'Peso bruto (kg)')}${campo('carga_vol', 'Volumes')}${campo('carga_m3', 'Cubagem (m³)')}
        ${campo('carga_tipo', 'Tipo de carga (tabela)', { ph: 'ex.: CAIXA' })}
      </div></div>
      <div class="cte-secao"><h4>Valores da prestação
        <button type="button" class="btn btn-secundario" id="cteBtnCalcular" style="width:auto; font-size:11.5px; padding:3px 8px;">🧮 Calcular pela tabela</button></h4>
        <div id="cteComponentes"></div>
        <button type="button" class="btn btn-secundario" id="cteBtnAddComp" style="width:auto; font-size:12px; margin-bottom:10px;">+ Componente</button>
        <div class="cte-grade">${campo('cteTotal', 'Valor total da prestação', { extra: 'readonly' })}${campo('cteVrec', 'Valor a receber', { ph: 'igual ao total' })}</div>
        <div id="cteExplicaCalculo" style="font-size:12px; color:var(--texto-fraco); margin-bottom:8px;"></div>
      </div>
      <div class="cte-secao"><h4>ICMS</h4><div class="cte-grade">
        <div class="campo largo"><label for="icms_cst">Situação tributária</label><select id="icms_cst">
          <option value="00">00 - Tributação normal</option><option value="20">20 - Com redução de base de cálculo</option>
          <option value="40">40 - Isenta</option><option value="41">41 - Não tributada</option><option value="51">51 - Diferida</option>
          <option value="60">60 - Cobrado por substituição tributária</option><option value="90">90 - Outros</option><option value="OUTRAUF">90 - ICMS devido a outra UF (início fora da UF da empresa)</option><option value="SN">Simples Nacional</option></select></div>
        ${campo('icms_red', '% redução da base')}${campo('icms_bc', 'Base de cálculo')}${campo('icms_aliq', 'Alíquota (%)')}${campo('icms_valor', 'Valor do ICMS')}
      </div></div>
      ${ibs ? `<div class="cte-secao"><h4>IBS / CBS (Reforma Tributária)</h4><div class="cte-grade">
        ${campo('ibs_cst', 'CST', { valor: config.cte_ibscbs_cst || '000' })}${campo('ibs_class', 'cClassTrib', { valor: config.cte_ibscbs_class_trib || '000001' })}
        ${campo('ibs_bc', 'Base de cálculo')}${campo('ibs_uf', 'IBS UF (%)', { valor: config.cte_ibs_uf_aliquota ?? '0.1' })}
        ${campo('ibs_mun', 'IBS Município (%)', { valor: config.cte_ibs_mun_aliquota ?? '0' })}${campo('ibs_cbs', 'CBS (%)', { valor: config.cte_cbs_aliquota ?? '0.9' })}
      </div></div>` : ''}
      <div class="cte-secao"><h4>Observações</h4><div class="campo"><textarea id="cteObs" rows="3" maxlength="2000" style="width:100%;"></textarea></div></div>`;

    $('cteBtnLerNfe').addEventListener('click', () => $('cteArquivoNfe').click());
    $('cteArquivoNfe').addEventListener('change', lerArquivosNfe);
    $('cteBtnBuscarNfe').addEventListener('click', buscarNfeImportada);
    $('cteChaveManual').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const ch = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (ch.length !== 44) { mostrarAlerta('A chave de acesso tem 44 caracteres.', { tipo: 'aviso' }); return; }
      adicionarChave(ch); e.target.value = '';
    });
    $('cteChipsNfe').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tirar]');
      if (b) { nfes = nfes.filter((c) => c !== b.dataset.tirar); desenharChips(); }
    });
    $('cteTomador').addEventListener('change', () => { $('cteBlocoOutroTomador').classList.toggle('oculto', $('cteTomador').value !== '4'); ajustarServico(); sugerirImpostos(); });
    ['cteTpServ', 'cteTemExped', 'cteTemReceb'].forEach((id) => $(id).addEventListener('change', () => { ajustarServico(); puxarPrestacao(false); }));
    $('cteBtnLerCteAnt').addEventListener('click', () => $('cteArquivoCteAnt').click());
    $('cteArquivoCteAnt').addEventListener('change', lerCteAnterior);
    $('cteBtnPuxarPrestacao').addEventListener('click', () => puxarPrestacao(true));
    ['ini_uf', 'fim_uf', 'cteCfopTipo', 'ini_cmun', 'fim_cmun', 'dest_ie', 'rem_ie', 'exp_ie', 'rec_ie'].forEach((id) => $(id).addEventListener('change', sugerirImpostos));
    $('cteBtnAddComp').addEventListener('click', () => adicionarComponente());
    $('cteComponentes').addEventListener('input', recalcularTotais);
    $('cteComponentes').addEventListener('click', (e) => { const b = e.target.closest('[data-tirar-comp]'); if (b) { b.parentElement.remove(); recalcularTotais(); } });
    $('cteBtnCalcular').addEventListener('click', calcularPelaTabela);
    ['icms_cst', 'icms_red', 'icms_aliq'].forEach((id) => $(id).addEventListener('input', () => recalcularTotais({ manterBase: false })));
    $('icms_bc').addEventListener('input', () => calcularIcms());
    document.querySelectorAll('[data-ibge]').forEach((b) => b.addEventListener('click', () => acharIbge(b.dataset.ibge)));
  }

  function desenharChips() {
    $('cteChipsNfe').innerHTML = nfes.length
      ? nfes.map((c) => `<span class="cte-chip">${esc(c.replace(/(.{4})/g, '$1 ').trim())}<button type="button" data-tirar="${esc(c)}" title="Tirar">✕</button></span>`).join('')
      : '<span style="font-size:12.5px; color:var(--texto-fraco);">Nenhuma NF-e ainda.</span>';
  }
  const adicionarChave = (c) => { if (!nfes.includes(c)) nfes.push(c); desenharChips(); };

  // Mostra/esconde o que depende do tipo de serviço e do tipo do CT-e.
  const AJUDA_SERVICO = {
    0: '',
    1: 'Subcontratação: outra transportadora vendeu o frete e contratou você para fazer o transporte. Ela é o tomador (normalmente "Outro") e o CT-e dela vai como documento anterior.',
    2: 'Redespacho: você faz o trecho final. A transportadora que trouxe a carga é o expedidor e, em geral, o tomador. A prestação começa no expedidor (ex.: o terminal dela em Guarulhos/SP).',
    3: 'Redespacho intermediário: você leva a carga de uma transportadora (expedidor) para outra (recebedor), sem entregar ao destinatário final.',
  };
  function ajustarServico() {
    const serv = $('cteTpServ').value;
    const compl = tipoCte.tpCTe === '1';
    if (serv === '3') { $('cteTemExped').checked = true; $('cteTemReceb').checked = true; }
    if (serv === '2' && !$('cteTemExped').dataset.mexeu) $('cteTemExped').checked = true;
    const toma = $('cteTomador').value;
    if (toma === '1') $('cteTemExped').checked = true;
    if (toma === '2') $('cteTemReceb').checked = true;
    $('cteBlocoExped').classList.toggle('oculto', !$('cteTemExped').checked);
    $('cteBlocoReceb').classList.toggle('oculto', !$('cteTemReceb').checked);
    $('cteSecaoDocAnt').classList.toggle('oculto', serv === '0' || compl);
    $('cteSecaoNfe').classList.toggle('oculto', compl);
    $('cteSecaoCarga').classList.toggle('oculto', compl);
    $('cteAjudaServico').textContent = AJUDA_SERVICO[serv] || '';
    $('cteAlteraTomaCampo').classList.toggle('oculto', tipoCte.tpCTe !== '3');
    const ref = tipoCte.tpCTe === '1' ? tipoCte.complementados?.[0] : tipoCte.substituido?.chave;
    $('cteAvisoTipo').innerHTML = tipoCte.tpCTe === '1'
      ? `<div class="cte-aviso">➕ <b>CT-e complementar</b> do CT-e ${esc(nCte(ref))}: cobra só o valor a mais (estadia, reentrega, diferença de frete...). Lance os componentes e o ICMS desse valor. Remetente, destinatário e tomador são os mesmos do CT-e original.</div>`
      : tipoCte.tpCTe === '3'
        ? `<div class="cte-aviso">♻ <b>CT-e de substituição</b> do CT-e ${esc(nCte(ref))}: corrija valores, impostos, carga ou o tomador. Remetente, destinatário, expedidor, recebedor, NF-e e UFs de início e fim têm que continuar iguais. O tomador precisa ter registrado o evento "Prestação do serviço em desacordo" do CT-e original.</div>`
        : '';
  }

  // CT-e da transportadora que contratou (redespacho/subcontratação).
  async function lerCteAnterior(e) {
    const arq = e.target.files[0];
    e.target.value = '';
    if (!arq) return;
    try {
      const c = await api('/ler-cte', { method: 'POST', body: JSON.stringify({ xml: await arq.text() }) });
      const em = c.emitente || {};
      $('ant_doc').value = em.cnpj || em.cpf || ''; $('ant_ie').value = em.ie || ''; $('ant_uf').value = em.uf || ''; $('ant_nome').value = em.xNome || '';
      const chaves = $('ant_chaves').value.split(/\s+/).filter(Boolean);
      if (!chaves.includes(c.chave)) chaves.push(c.chave);
      $('ant_chaves').value = chaves.join('\n');
      preencherPessoa('rem', c.remetente, false); preencherPessoa('dest', c.destinatario, false);
      // Quem trouxe a carga até aqui (o emitente do CT-e anterior) é o expedidor do redespacho.
      if ($('cteTpServ').value === '2' || $('cteTpServ').value === '3') {
        $('cteTemExped').checked = true;
        preencherPessoa('exp', em, false);
      }
      (c.nfes || []).forEach(adicionarChave);
      if (!$('carga_pro').value) {
        $('carga_pro').value = c.carga?.proPred || ''; $('carga_valor').value = c.carga?.vCarga ? fmtNum(c.carga.vCarga) : '';
        const q = (u) => (c.carga?.quantidades || []).find((x) => String(x.cUnid).padStart(2, '0') === u)?.qCarga;
        if (q('01') != null) $('carga_peso').value = fmtNum(q('01'), 3);
        if (q('03') != null) $('carga_vol').value = q('03');
      }
      ajustarServico();
      if ($('cteTemExped').checked && $('exp_cmun').value) { $('ini_mun').value = $('exp_mun').value; $('ini_cmun').value = $('exp_cmun').value; $('ini_uf').value = $('exp_uf').value; }
      puxarPrestacao(false);
      mostrarAlerta(`CT-e ${c.serie}/${c.numero} de ${em.xNome} lido.${$('cteTemExped').checked ? ' Confira o endereço do expedidor (o terminal de onde a carga sai) e o código IBGE.' : ''}`, { tipo: 'sucesso' });
    } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
  }

  function adicionarComponente(nome = '', valor = '') {
    const div = document.createElement('div');
    div.className = 'cte-linha-comp';
    div.innerHTML = `<input type="text" class="comp-nome" maxlength="15" placeholder="Ex.: FRETE PESO" value="${esc(nome)}" />
      <input type="text" class="comp-valor" placeholder="0,00" value="${esc(valor === '' ? '' : fmtNum(valor))}" /><button type="button" data-tirar-comp title="Tirar">✕</button>`;
    $('cteComponentes').appendChild(div);
    recalcularTotais();
  }

  function totalComponentes() {
    return [...document.querySelectorAll('#cteComponentes .cte-linha-comp')].reduce((s, l) => s + (num(l.querySelector('.comp-valor').value) || 0), 0);
  }
  function recalcularTotais({ manterBase = false } = {}) {
    const total = Math.round(totalComponentes() * 100) / 100;
    $('cteTotal').value = fmtNum(total);
    if (!manterBase) {
      const red = num($('icms_red').value) || 0;
      $('icms_bc').value = fmtNum(Math.round(total * (1 - ($('icms_cst').value === '20' ? red : 0) / 100) * 100) / 100);
      if ($('ibs_bc')) $('ibs_bc').value = fmtNum(total);
    }
    calcularIcms();
  }
  function calcularIcms() {
    const cst = $('icms_cst').value;
    const semValor = ['40', '41', '51', 'SN'].includes(cst);
    ['icms_bc', 'icms_aliq', 'icms_valor'].forEach((id) => { $(id).disabled = semValor; });
    $('icms_red').disabled = !['20', '90', 'OUTRAUF'].includes(cst);
    if (semValor) return;
    const bc = num($('icms_bc').value) || 0;
    const aliq = numPonto($('icms_aliq').value) || 0;
    $('icms_valor').value = fmtNum(Math.round(bc * aliq) / 100);
  }

  // Início/fim da prestação pelos endereços do remetente e do destinatário.
  function puxarPrestacao(forcar) {
    const copia = (de, para) => {
      if (forcar || !$(`${para}_mun`).value) {
        $(`${para}_mun`).value = $(`${de}_mun`).value; $(`${para}_cmun`).value = $(`${de}_cmun`).value; $(`${para}_uf`).value = $(`${de}_uf`).value;
      }
    };
    // Com expedidor, a prestação começa nele; com recebedor, termina nele (redespacho).
    copia($('cteTemExped').checked && $('exp_cmun').value ? 'exp' : 'rem', 'ini');
    copia($('cteTemReceb').checked && $('rec_cmun').value ? 'rec' : 'dest', 'fim');
    sugerirImpostos();
  }

  // CFOP, alíquota interestadual e avisos.
  const SUL_SUDESTE = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'];
  function sugerirImpostos() {
    const ufIni = $('ini_uf').value; const ufFim = $('fim_uf').value; const ufEmit = config?.uf;
    let cfop = $('cteCfopTipo').value;
    const avisos = [];
    if (ufIni && ufEmit && ufIni !== ufEmit) {
      cfop = '932';
      avisos.push(`A prestação começa em ${ufIni}, fora da UF da empresa (${ufEmit}): CFOP x932 e ICMS devido a ${ufIni}.`);
      if (['00', '90'].includes($('icms_cst').value)) { $('icms_cst').value = 'OUTRAUF'; calcularIcms(); }
    }
    $('cteCfop').value = ufIni && ufFim ? `${ufIni === ufFim ? 5 : 6}${cfop}` : '';
    if ($('ini_cmun').value && $('ini_cmun').value === $('fim_cmun').value) avisos.push('Início e fim no mesmo município: esse transporte é serviço municipal (ISS) — normalmente não se emite CT-e.');
    const tomaIe = { 0: $('rem_ie').value, 1: $('exp_ie').value, 2: $('rec_ie').value, 3: $('dest_ie').value, 4: $('toma_ie')?.value }[$('cteTomador').value];
    if (ufIni && ufFim && ufIni !== ufFim && !String(tomaIe || '').replace(/\D/g, '') && $('cteCfopTipo').value !== '932') {
      avisos.push('Tomador não contribuinte em operação interestadual: pode haver diferencial de alíquota (DIFAL) para a UF de destino — confira com a contabilidade.');
    }
    $('cteAvisoPrestacao').textContent = avisos.join(' ');
    // Alíquota: interestadual 7% (Sul/Sudeste → N/NE/CO/ES) ou 12%; interna, a da configuração.
    if (!$('icms_aliq').dataset.editado && ufIni && ufFim) {
      const aliq = ufIni !== ufFim ? (SUL_SUDESTE.includes(ufIni) && !SUL_SUDESTE.includes(ufFim) ? 7 : 12) : (config?.cte_aliquota_interna ?? '');
      $('icms_aliq').value = aliq === '' || aliq == null ? '' : fmtNum(aliq);
      calcularIcms();
    }
  }

  // ---- NF-e ----
  async function lerArquivosNfe(e) {
    const arquivos = [...e.target.files];
    e.target.value = '';
    for (const arq of arquivos) {
      try {
        const nfe = await api('/ler-nfe', { method: 'POST', body: JSON.stringify({ xml: await arq.text() }) });
        aplicarNfe(nfe);
      } catch (err) { mostrarAlerta(`${arq.name}: ${err.message}`, { tipo: 'erro' }); }
    }
  }
  async function buscarNfeImportada() {
    const busca = await pedirTexto('Chave de acesso ou número da NF-e (importada em "Enviar XML"):', { titulo: 'Buscar NF-e' });
    if (!busca) return;
    try {
      const lista = await api(`/nfe-importada?busca=${encodeURIComponent(busca)}`);
      lista.slice(0, 1).forEach(aplicarNfe);
      if (lista.length > 1) mostrarAlerta(`Achei ${lista.length} NF-e com esse número; usei a mais recente (${lista[0].chave}). Para outra, busque pela chave.`, { tipo: 'aviso' });
    } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
  }
  function preencherPessoa(pre, p, sobrescrever) {
    if (!p) return;
    const e = p.endereco || {};
    const val = { doc: p.cnpj || p.cpf, ie: p.ie, nome: p.xNome, lgr: e.xLgr, nro: e.nro, cpl: e.xCpl, bairro: e.xBairro, mun: e.xMun, cmun: e.cMun, uf: e.UF, cep: e.CEP, fone: p.fone || e.fone, email: p.email };
    const vazio = !$(`${pre}_doc`).value;
    if (!vazio && !sobrescrever) return;
    Object.entries(val).forEach(([k, v]) => { const el = $(`${pre}_${k}`); if (el) el.value = v ?? ''; });
  }
  function aplicarNfe(nfe) {
    const primeira = nfes.length === 0;
    adicionarChave(nfe.chave);
    preencherPessoa('rem', nfe.remetente, false);
    preencherPessoa('dest', nfe.destinatario, false);
    if (primeira) {
      $('carga_pro').value = $('carga_pro').value || nfe.produtoPredominante || '';
      $('carga_valor').value = fmtNum(nfe.valor); $('carga_peso').value = fmtNum(nfe.pesoBruto, 3); $('carga_vol').value = nfe.volumes || '';
      // modFrete 0 = por conta do remetente (CIF), 1 = destinatário (FOB).
      if (String(nfe.modFrete) === '1') $('cteTomador').value = '3';
      if (String(nfe.modFrete) === '0') $('cteTomador').value = '0';
    } else {
      $('carga_valor').value = fmtNum((num($('carga_valor').value) || 0) + (nfe.valor || 0));
      $('carga_peso').value = fmtNum((num($('carga_peso').value) || 0) + (nfe.pesoBruto || 0), 3);
      $('carga_vol').value = (Number($('carga_vol').value) || 0) + (nfe.volumes || 0);
    }
    puxarPrestacao(false);
    // Local de entrega diferente do endereço do destinatário.
    if (primeira && nfe.entrega?.cMun) { $('fim_mun').value = nfe.entrega.xMun || ''; $('fim_cmun').value = nfe.entrega.cMun; $('fim_uf').value = nfe.entrega.UF || ''; sugerirImpostos(); }
  }

  // ---- Código IBGE pelo nome do município (BrasilAPI) ----
  const cacheIbge = {};
  const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  async function acharIbge(pre) {
    const uf = $(`${pre}_uf`).value; const mun = $(`${pre}_mun`).value;
    if (!uf || !mun) { mostrarAlerta('Preencha o município e a UF primeiro.', { tipo: 'aviso' }); return; }
    try {
      if (!cacheIbge[uf]) {
        const r = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}?providers=dados-abertos-br,gov,wikipedia`);
        if (!r.ok) throw new Error('A consulta de municípios (BrasilAPI) não respondeu.');
        cacheIbge[uf] = await r.json();
      }
      const achado = cacheIbge[uf].find((m) => semAcento(m.nome) === semAcento(mun));
      if (!achado) { mostrarAlerta(`Não achei "${mun}" em ${uf}. Confira o nome do município.`, { tipo: 'aviso' }); return; }
      $(`${pre}_cmun`).value = achado.codigo_ibge;
      $(`${pre}_mun`).value = achado.nome;
      if (['rem', 'dest', 'exp', 'rec'].includes(pre)) puxarPrestacao(false);
    } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); }
  }

  async function calcularPelaTabela() {
    try {
      const r = await api('/calcular-frete', {
        method: 'POST',
        body: JSON.stringify({
          cidade: $('fim_mun').value, uf: $('fim_uf').value, bairro: $('dest_bairro').value, peso: num($('carga_peso').value),
          volumes: Number($('carga_vol').value) || 0, cubagem: num($('carga_m3').value), valorCarga: num($('carga_valor').value),
          cliente: $('dest_nome').value, tipoCarga: $('carga_tipo').value,
        }),
      });
      $('cteComponentes').innerHTML = '';
      r.componentes.forEach((c) => adicionarComponente(c.xNome, c.vComp));
      $('cteExplicaCalculo').textContent = `Tabela "${r.tabela}": ${r.explicacao}${r.prazo ? ` · prazo ${r.prazo} dia(s)` : ''}`;
    } catch (err) { mostrarAlerta(err.message, { tipo: 'aviso' }); }
  }

  // ---- Monta os dados (o mesmo formato que o servidor usa para gerar o XML) ----
  function pessoa(pre) {
    const doc = $(`${pre}_doc`).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return {
      [doc.length === 11 ? 'cpf' : 'cnpj']: doc, ie: $(`${pre}_ie`).value.trim(), xNome: $(`${pre}_nome`).value.trim(),
      fone: $(`${pre}_fone`).value.trim(), email: $(`${pre}_email`).value.trim(),
      endereco: {
        xLgr: $(`${pre}_lgr`).value.trim(), nro: $(`${pre}_nro`).value.trim(), xCpl: $(`${pre}_cpl`).value.trim(), xBairro: $(`${pre}_bairro`).value.trim(),
        xMun: $(`${pre}_mun`).value.trim(), cMun: $(`${pre}_cmun`).value.replace(/\D/g, ''), UF: $(`${pre}_uf`).value, CEP: $(`${pre}_cep`).value.replace(/\D/g, ''),
      },
    };
  }
  function coletar() {
    const total = Math.round(totalComponentes() * 100) / 100;
    const quantidades = [];
    if (num($('carga_peso').value) != null) quantidades.push({ cUnid: '01', tpMed: 'PESO BRUTO', qCarga: num($('carga_peso').value) });
    if (Number($('carga_vol').value) > 0) quantidades.push({ cUnid: '03', tpMed: 'VOLUMES', qCarga: Number($('carga_vol').value) });
    if (num($('carga_m3').value) > 0) quantidades.push({ cUnid: '00', tpMed: 'CUBAGEM', qCarga: num($('carga_m3').value) });
    const serv = $('cteTpServ').value;
    const docAnt = serv !== '0' && $('ant_chaves').value.trim() ? [{
      [$('ant_doc').value.replace(/[^0-9A-Za-z]/g, '').length === 11 ? 'cpf' : 'cnpj']: $('ant_doc').value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      ie: $('ant_ie').value.trim(), uf: $('ant_uf').value, xNome: $('ant_nome').value.trim(),
      chaves: $('ant_chaves').value.toUpperCase().split(/[^A-Z0-9]+/).filter((c) => c.length === 44),
    }] : [];
    const temPessoa = (pre) => !!$(`${pre}_doc`).value.trim();
    const dados = {
      tpCTe: tipoCte.tpCTe, tpServ: serv, ...(origemCte ? { origem: origemCte } : {}), complementados: tipoCte.complementados || [],
      substituido: tipoCte.substituido ? { ...tipoCte.substituido, indAlteraToma: $('cteAlteraToma').checked } : null,
      docAnt,
      nfes: [...nfes],
      // No redespacho intermediário pode não haver remetente/destinatário.
      remetente: serv === '3' && !temPessoa('rem') ? null : pessoa('rem'),
      destinatario: serv === '3' && !temPessoa('dest') ? null : pessoa('dest'),
      expedidor: $('cteTemExped').checked ? pessoa('exp') : null, recebedor: $('cteTemReceb').checked ? pessoa('rec') : null,
      tomador: $('cteTomador').value,
      outroTomador: $('cteTomador').value === '4' ? pessoa('toma') : null,
      inicio: { xMun: $('ini_mun').value.trim(), cMun: $('ini_cmun').value.replace(/\D/g, ''), UF: $('ini_uf').value },
      fim: { xMun: $('fim_mun').value.trim(), cMun: $('fim_cmun').value.replace(/\D/g, ''), UF: $('fim_uf').value },
      cfop: $('cteCfop').value, cfopTipo: $('cteCfopTipo').value,
      // Natureza da operação: o texto da opção escolhida (até 60 caracteres, sem acento).
      natOp: ($('cteCfopTipo').selectedOptions[0]?.textContent || 'Prestacao de servico de transporte')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, 60),
      carga: { proPred: $('carga_pro').value.trim(), xOutCat: $('carga_out').value.trim(), vCarga: num($('carga_valor').value), tipoCarga: $('carga_tipo').value.trim(), cubagem: num($('carga_m3').value), quantidades },
      valores: {
        vTPrest: total, vRec: num($('cteVrec').value) ?? total,
        componentes: [...document.querySelectorAll('#cteComponentes .cte-linha-comp')].map((l) => ({ xNome: l.querySelector('.comp-nome').value.trim().toUpperCase(), vComp: num(l.querySelector('.comp-valor').value) })).filter((c) => c.xNome || c.vComp),
      },
      icms: { cst: $('icms_cst').value, pRedBC: num($('icms_red').value), vBC: num($('icms_bc').value), pICMS: numPonto($('icms_aliq').value), vICMS: num($('icms_valor').value) },
      observacoes: $('cteObs').value.trim(),
    };
    if ($('ibs_cst')) {
      dados.ibscbs = { cst: $('ibs_cst').value.trim(), cClassTrib: $('ibs_class').value.trim(), vBC: num($('ibs_bc').value), pIBSUF: numPonto($('ibs_uf').value), pIBSMun: numPonto($('ibs_mun').value), pCBS: numPonto($('ibs_cbs').value) };
    }
    return dados;
  }

  function preencher(d) {
    nfes = [...(d.nfes || [])]; desenharChips();
    tipoCte = { tpCTe: String(d.tpCTe ?? '0'), complementados: d.complementados || [], substituido: d.substituido || null };
    origemCte = d.origem || null;
    $('cteTpServ').value = String(d.tpServ ?? '0');
    $('cteTemExped').checked = !!d.expedidor; $('cteTemReceb').checked = !!d.recebedor;
    if (d.expedidor) $('cteTemExped').dataset.mexeu = '1';
    preencherPessoa('exp', d.expedidor, true); preencherPessoa('rec', d.recebedor, true);
    $('cteAlteraToma').checked = !!d.substituido?.indAlteraToma;
    const ant = (d.docAnt || [])[0];
    if (ant) { $('ant_doc').value = ant.cnpj || ant.cpf || ''; $('ant_ie').value = ant.ie || ''; $('ant_uf').value = ant.uf || ''; $('ant_nome').value = ant.xNome || ''; $('ant_chaves').value = (ant.chaves || []).join('\n'); }
    preencherPessoa('rem', d.remetente, true); preencherPessoa('dest', d.destinatario, true);
    $('cteTomador').value = String(d.tomador ?? '0');
    if (d.outroTomador) preencherPessoa('toma', d.outroTomador, true);
    $('cteBlocoOutroTomador').classList.toggle('oculto', $('cteTomador').value !== '4');
    if (d.inicio) { $('ini_mun').value = d.inicio.xMun || ''; $('ini_cmun').value = d.inicio.cMun || ''; $('ini_uf').value = d.inicio.UF || ''; }
    if (d.fim) { $('fim_mun').value = d.fim.xMun || ''; $('fim_cmun').value = d.fim.cMun || ''; $('fim_uf').value = d.fim.UF || ''; }
    if (d.cfopTipo) $('cteCfopTipo').value = d.cfopTipo;
    const c = d.carga || {};
    $('carga_pro').value = c.proPred || ''; $('carga_out').value = c.xOutCat || ''; $('carga_valor').value = c.vCarga != null ? fmtNum(c.vCarga) : '';
    $('carga_tipo').value = c.tipoCarga || ''; $('carga_m3').value = c.cubagem != null ? fmtNum(c.cubagem, 3) : '';
    const q = (u) => (c.quantidades || []).find((x) => String(x.cUnid) === u)?.qCarga;
    $('carga_peso').value = q('01') != null ? fmtNum(q('01'), 3) : ''; $('carga_vol').value = q('03') ?? '';
    $('cteComponentes').innerHTML = '';
    (d.valores?.componentes || []).forEach((x) => adicionarComponente(x.xNome, x.vComp));
    if (d.valores?.vRec != null && d.valores.vRec !== d.valores.vTPrest) $('cteVrec').value = fmtNum(d.valores.vRec);
    const i = d.icms || {};
    $('icms_cst').value = i.cst || '00'; $('icms_red').value = i.pRedBC != null ? fmtNum(i.pRedBC) : '';
    $('icms_aliq').value = i.pICMS != null ? fmtNum(i.pICMS) : ''; if (i.pICMS != null) $('icms_aliq').dataset.editado = '1';
    recalcularTotais({ manterBase: false });
    if (i.vBC != null) { $('icms_bc').value = fmtNum(i.vBC); calcularIcms(); }
    if (d.ibscbs && $('ibs_cst')) {
      $('ibs_cst').value = d.ibscbs.cst || ''; $('ibs_class').value = d.ibscbs.cClassTrib || ''; $('ibs_uf').value = d.ibscbs.pIBSUF ?? '';
      $('ibs_mun').value = d.ibscbs.pIBSMun ?? ''; $('ibs_cbs').value = d.ibscbs.pCBS ?? '';
    }
    $('cteObs').value = d.observacoes || '';
    ajustarServico();
    sugerirImpostos();
  }

  async function abrirFormulario(id) {
    if (!config) await carregarConfig();
    editandoId = id;
    nfes = [];
    tipoCte = { tpCTe: '0', complementados: [], substituido: null };
    origemCte = null;
    renderFormulario();
    $('cteTemExped').addEventListener('change', () => { $('cteTemExped').dataset.mexeu = '1'; });
    $('icms_aliq').addEventListener('input', () => { $('icms_aliq').dataset.editado = '1'; });
    $('erroFormCte').classList.remove('visivel');
    const status = $('cteStatusForm');
    status.className = 'cte-aviso oculto';
    if (id) {
      try {
        const c = await api(`/${id}`);
        const tipoTitulo = { 1: 'CT-e complementar', 3: 'CT-e de substituição' }[String(c.dados?.tpCTe)] || 'CT-e';
        $('tituloModalCte').textContent = c.numero ? `${tipoTitulo} ${c.serie}/${c.numero}` : `Rascunho de ${tipoTitulo} #${c.id}`;
        preencher(c.dados || {});
        if (c.status === 'rejeitado') { status.textContent = `Rejeitado pela SEFAZ: ${c.cstat || ''} - ${c.motivo || ''}. Corrija e transmita de novo.`; status.className = 'cte-aviso erro'; }
      } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); return; }
    } else {
      $('tituloModalCte').textContent = 'Novo CT-e';
      desenharChips();
      $('icms_cst').value = Number(config?.crt) === 1 || Number(config?.crt) === 4 ? 'SN' : (config?.cte_cst_padrao || '00');
      adicionarComponente('FRETE PESO', '');
      calcularIcms();
      ajustarServico();
    }
    $('modalCte').classList.remove('oculto');
  }

  async function salvar() {
    const dados = coletar();
    const c = editandoId
      ? await api(`/${editandoId}`, { method: 'PUT', body: JSON.stringify({ dados }) })
      : await api('/', { method: 'POST', body: JSON.stringify({ dados }) });
    editandoId = c.id;
    return c;
  }
  async function comBotao(botao, fn) {
    const texto = botao.textContent;
    botao.disabled = true; botao.textContent = 'Aguarde...';
    $('erroFormCte').classList.remove('visivel');
    try { await fn(); } catch (err) {
      $('erroFormCte').textContent = err.message; $('erroFormCte').classList.add('visivel');
    } finally { botao.disabled = false; botao.textContent = texto; }
  }
  $('btnCteSalvar').addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
    await salvar(); fecharFormulario(); carregarLista();
    mostrarAlerta('Rascunho salvo.', { tipo: 'sucesso' });
  }));
  $('btnCteTransmitir').addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
    const d = coletar();
    if (!d.nfes.length && d.tpCTe !== '1' && d.tpServ !== '3') throw new Error('Informe pelo menos uma NF-e transportada.');
    if (d.tpServ !== '0' && d.tpCTe !== '1' && !d.docAnt.length) throw new Error('Informe a chave do CT-e anterior (de quem contratou o serviço) — ou leia o XML dele.');
    if (!(d.valores.vTPrest > 0)) throw new Error('Informe os valores da prestação (componentes).');
    const c = await salvar();
    try {
      const r = await transmitir(c.id);
      if (r?.status === 'autorizado') fecharFormulario();
      else if (r) { $('cteStatusForm').textContent = `Rejeitado pela SEFAZ: ${r.cstat || ''} - ${r.motivo || ''}`; $('cteStatusForm').className = 'cte-aviso erro'; }
    } finally { carregarLista(); }
  }));

  // ---------------- Configuração fiscal ----------------
  function renderConfig() {
    const c = config || {};
    const venc = c.certificado_validade ? new Date(c.certificado_validade) : null;
    const sel = (id, rotulo, opcoes, valor) => `<div class="campo"><label for="${id}">${rotulo}</label><select id="${id}">${opcoes.map(([v, t]) => `<option value="${v}" ${String(valor) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    $('cte-aba-config').innerHTML = `
      <div class="painel" style="padding:20px;">
        <div class="cte-secao"><h4>Empresa emitente <button type="button" class="btn btn-secundario" id="cfgBuscarCnpj" style="width:auto; font-size:11.5px; padding:3px 8px;">🔎 Preencher pelo CNPJ</button></h4><div class="cte-grade">
          ${campo('cfg_cnpj', 'CNPJ', { valor: c.cnpj || '' })}${campo('cfg_ie', 'Inscrição estadual', { valor: c.ie || '' })}
          ${campo('cfg_razao', 'Razão social', { classe: 'largo', valor: c.razao_social || '' })}${campo('cfg_fantasia', 'Nome fantasia', { classe: 'largo', valor: c.nome_fantasia || '' })}
          ${campo('cfg_lgr', 'Logradouro', { classe: 'largo', valor: c.endereco || '' })}${campo('cfg_nro', 'Número', { valor: c.numero || '' })}${campo('cfg_cpl', 'Complemento', { valor: c.complemento || '' })}
          ${campo('cfg_bairro', 'Bairro', { valor: c.bairro || '' })}${campo('cfg_mun', 'Município', { valor: c.municipio || '' })}
          ${campo('cfg_cmun', 'Código IBGE do município', { valor: c.codigo_municipio || '', ph: '7 dígitos' })}
          ${sel('cfg_uf', 'UF', [['', ''], ...UFS.map((u) => [u, u])], c.uf || '')}${campo('cfg_cep', 'CEP', { valor: c.cep || '' })}
          ${campo('cfg_fone', 'Telefone', { valor: c.telefone || '' })}${campo('cfg_email', 'E-mail', { valor: c.email || '' })}
        </div></div>
        <div class="cte-secao"><h4>Dados fiscais do CT-e</h4><div class="cte-grade">
          ${campo('cfg_rntrc', 'RNTRC (ANTT)', { valor: c.rntrc || '', ph: '8 dígitos' })}
          ${sel('cfg_crt', 'Regime tributário', [[3, 'Regime normal'], [1, 'Simples Nacional'], [2, 'Simples — excesso de sublimite'], [4, 'MEI']], c.crt || 3)}
          ${sel('cfg_ambiente', 'Ambiente', [['demo', 'Demonstração (simulada)'], [2, 'Homologação (testes, sem valor fiscal)'], [1, 'PRODUÇÃO (valor fiscal)']], c.cte_demonstracao ? 'demo' : (c.cte_ambiente || 2))}
          ${campo('cfg_serie', 'Série do CT-e', { valor: c.cte_serie ?? 1, tipo: 'number' })}${campo('cfg_numero', 'Próximo número do CT-e', { valor: c.cte_proximo_numero ?? 1, tipo: 'number' })}
          ${campo('cfg_mdfe_serie', 'Série do MDF-e', { valor: c.mdfe_serie ?? 1, tipo: 'number' })}${campo('cfg_mdfe_numero', 'Próximo número do MDF-e', { valor: c.mdfe_proximo_numero ?? 1, tipo: 'number' })}
          ${sel('cfg_cst', 'CST do ICMS padrão', [['00', '00 - Tributação normal'], ['20', '20 - Redução de base'], ['40', '40 - Isenta'], ['41', '41 - Não tributada'], ['51', '51 - Diferida'], ['90', '90 - Outros']], c.cte_cst_padrao || '00')}
          ${campo('cfg_aliq', 'Alíquota interna do ICMS (%)', { valor: c.cte_aliquota_interna ?? '', ph: 'operação dentro do estado' })}
          ${campo('cfg_prazo', 'Prazo de entrega padrão (dias úteis)', { valor: c.cte_prazo_padrao ?? '', ph: 'sem tabela de preço: 3', tipo: 'number' })}
          <div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="cfg_verificar" ${c.cte_verificar_servidor ? 'checked' : ''} style="width:auto;" />
            Verificar o certificado do servidor da SEFAZ (precisa das raízes ICP-Brasil instaladas no Windows)</label></div>
        </div></div>
        <div class="cte-secao"><h4>Contingência (SEFAZ fora do ar)</h4><div class="cte-grade">
          <div class="campo inteiro" style="font-size:12.5px;">Quando a SEFAZ ${esc(c.uf || 'da sua UF')} estiver fora do ar, ligue a contingência: os CT-e passam a ser autorizados pela
            <b>${esc(c.svc_sigla || 'SEFAZ Virtual de Contingência')}</b> e o DACTE sai em papel comum, marcado "emitido em contingência". Desligue assim que a SEFAZ voltar.
            CT-e de substituição não pode ser emitido em contingência.</div>
          <div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="cfg_cont" ${c.cte_contingencia ? 'checked' : ''} style="width:auto;" />
            <b>Contingência ligada</b>${c.cte_contingencia && c.cte_contingencia_inicio ? `&nbsp;desde ${new Date(c.cte_contingencia_inicio).toLocaleString('pt-BR')}` : ''}</label></div>
          ${campo('cfg_cont_motivo', 'Motivo (aparece no registro; mínimo 15 letras)', { classe: 'inteiro', valor: c.cte_contingencia_motivo || '', ph: 'ex.: SEFAZ SP fora do ar desde as 9h' })}
        </div></div>
        <div class="cte-secao"><h4>Seguro da carga e averbação</h4><div class="cte-grade">
          <div class="campo inteiro" style="font-size:12.5px;">Cada CT-e autorizado é mandado na hora para a averbadora da seguradora (AT&amp;M ou AverbePorto). O protocolo e o número da averbação ficam no CT-e, e o número vai sozinho para o MDF-e. Cancelamentos e encerramentos também são avisados. No modo demonstração a averbação é simulada.</div>
          ${sel('cfg_av_prov', 'Averbadora', [['', '— nenhuma —'], ['atm', 'AT&M'], ['porto', 'Porto (AverbePorto)']], c.averbacao_provedor || '')}
          ${campo('cfg_av_usuario', 'Usuário', { valor: c.averbacao_usuario || '' })}
          ${campo('cfg_av_senha', `Senha${c.tem_senha_averbacao ? ' (já cadastrada — preencha só para trocar)' : ''}`, { tipo: 'password', extra: 'autocomplete="new-password"' })}
          ${campo('cfg_av_codigo', 'Código AT&amp;M (codatm)', { valor: c.averbacao_codigo || '' })}
          <div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="cfg_av_auto" ${c.averbacao_automatica !== false ? 'checked' : ''} style="width:auto;" />
            Averbar automaticamente ao autorizar (desligue se o seguro da carga é do embarcador e não da transportadora)</label></div>
          ${campo('cfg_seg_nome', 'Seguradora (vai no MDF-e)', { classe: 'largo', valor: c.seguro_seguradora || '' })}${campo('cfg_seg_cnpj', 'CNPJ da seguradora', { valor: c.seguro_cnpj || '' })}${campo('cfg_seg_apolice', 'Nº da apólice (RCTR-C)', { valor: c.seguro_apolice || '' })}
        </div></div>
        <div class="cte-secao"><h4>IBS / CBS (Reforma Tributária)</h4><div class="cte-grade">
          <div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="cfg_ibs" ${c.cte_ibscbs_ativo ? 'checked' : ''} style="width:auto;" /> Informar IBS/CBS no CT-e</label></div>
          ${campo('cfg_ibs_cst', 'CST IBS/CBS', { valor: c.cte_ibscbs_cst || '000' })}${campo('cfg_ibs_class', 'cClassTrib', { valor: c.cte_ibscbs_class_trib || '000001' })}
          ${campo('cfg_ibs_uf', 'IBS UF (%)', { valor: c.cte_ibs_uf_aliquota ?? '0.1' })}${campo('cfg_ibs_mun', 'IBS Município (%)', { valor: c.cte_ibs_mun_aliquota ?? '0' })}${campo('cfg_cbs', 'CBS (%)', { valor: c.cte_cbs_aliquota ?? '0.9' })}
        </div></div>
        <div class="cte-secao"><h4>Avisos de entrega ao cliente (e-mail / WhatsApp)</h4><div class="cte-grade">
          <div class="campo inteiro"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="cfg_aviso" ${c.aviso_entrega_ativo ? 'checked' : ''} style="width:auto;" />
            Avisar o destinatário e quem paga o frete a cada ocorrência lançada (usa o e-mail e o celular que vieram na NF-e)</label></div>
          <div class="campo inteiro" style="display:flex; gap:18px; flex-wrap:wrap;">
            ${[['em_rota', 'Saiu para entrega'], ['entrega', 'Entregue'], ['problema', 'Não entregue / problema'], ['devolucao', 'Devolvido'], ['agendada', 'Agendado'], ['transito', 'Em trânsito']]
    .map(([k, t]) => `<label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" data-cfg-evento="${k}" ${String(c.aviso_entrega_eventos ?? 'em_rota,entrega,problema,devolucao').split(',').includes(k) ? 'checked' : ''} style="width:auto;" /> ${t}</label>`).join('')}
          </div>
          <div class="campo"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="cfg_aviso_email" ${c.aviso_entrega_email !== false ? 'checked' : ''} style="width:auto;" /> Por e-mail</label></div>
          <div class="campo"><label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="cfg_aviso_wpp" ${c.aviso_entrega_whatsapp ? 'checked' : ''} style="width:auto;" /> Por WhatsApp (Twilio)</label></div>
          ${campo('cfg_end_publico', 'Endereço público do Nexofrete (para o link de rastreio)', { classe: 'largo', valor: c.endereco_publico || '', ph: 'https://rastreio.suaempresa.com.br' })}
          <div class="campo inteiro" style="font-size:12px; color:var(--texto-fraco);">O e-mail usa a configuração de SMTP e o WhatsApp a do Twilio (Cadastros → Configurações). Sem o endereço público, a mensagem vai sem o link.</div>
        </div></div>
        <div class="cte-secao"><h4>Responsável técnico (quem fornece o sistema — exigido por algumas UFs)</h4><div class="cte-grade">
          ${campo('cfg_rt_cnpj', 'CNPJ', { valor: c.resp_tec_cnpj || '' })}${campo('cfg_rt_contato', 'Contato', { valor: c.resp_tec_contato || '' })}
          ${campo('cfg_rt_email', 'E-mail', { valor: c.resp_tec_email || '' })}${campo('cfg_rt_fone', 'Telefone', { valor: c.resp_tec_fone || '' })}
        </div></div>
        <div style="display:flex; justify-content:flex-end; margin-bottom:18px;"><button type="button" class="btn btn-primario" id="cfgSalvar" style="width:auto;">💾 Salvar configuração</button></div>
        <div class="cte-secao"><h4>Certificado digital A1</h4>
          <div style="margin-bottom:10px; font-size:13px;">${c.tem_certificado
    ? `${c.certificado_demonstracao ? '🧪 <b>Certificado de DEMONSTRAÇÃO</b> (só funciona no modo demonstração) — ' : '✅ '}<b>${esc(c.certificado_titular)}</b>${c.certificado_cnpj ? ` — CNPJ ${esc(c.certificado_cnpj)}` : ''} — válido até <b>${venc ? venc.toLocaleDateString('pt-BR') : '?'}</b>`
    : '⚠️ Nenhum certificado enviado.'}</div>
          ${c.cte_demonstracao ? `<div class="cte-aviso" style="margin-bottom:10px;">🧪 <b>Modo demonstração ligado.</b> A SEFAZ é simulada aqui no servidor: dá para emitir, imprimir o DACTE, cancelar e fazer carta de correção sem internet e sem certificado verdadeiro. A assinatura digital e a chave de acesso são conferidas de verdade. <b>Nada é enviado e nada tem valor fiscal</b> — o DACTE sai com a tarja "DEMONSTRAÇÃO".
            ${!c.tem_certificado || c.certificado_demonstracao ? '' : '<br>Já tem um certificado verdadeiro: ele é usado para assinar (e continua sem enviar nada).'}</div>` : ''}
          <div class="cte-grade">
            <div class="campo largo"><label for="cfg_pfx">Arquivo do certificado (.pfx ou .p12)</label><input type="file" id="cfg_pfx" accept=".pfx,.p12" /></div>
            ${campo('cfg_pfx_senha', 'Senha do certificado', { tipo: 'password', extra: 'autocomplete="new-password"' })}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
            <button type="button" class="btn btn-primario" id="cfgEnviarPfx" style="width:auto;">⬆ Enviar certificado</button>
            ${c.tem_certificado ? '<button type="button" class="btn btn-secundario" id="cfgRemoverPfx" style="width:auto;">Remover</button>' : ''}
            ${c.cte_demonstracao && (!c.tem_certificado || c.certificado_demonstracao) ? `<button type="button" class="btn btn-secundario" id="cfgGerarDemo" style="width:auto;">🧪 ${c.certificado_demonstracao ? 'Gerar de novo o' : 'Gerar'} certificado de demonstração</button>` : ''}
            <button type="button" class="btn btn-secundario" id="cfgTestar" style="width:auto;">📡 Testar conexão com a SEFAZ</button>
          </div>
          <div style="font-size:12px; color:var(--texto-fraco);">O certificado e a senha ficam guardados criptografados no banco do Nexofrete e nunca voltam para a tela.</div>
        </div>
      </div>`;
    $('cfgSalvar').addEventListener('click', (e) => comBotaoCfg(e.currentTarget, salvarConfig));
    $('cfgEnviarPfx').addEventListener('click', (e) => comBotaoCfg(e.currentTarget, enviarCertificado));
    $('cfgRemoverPfx')?.addEventListener('click', async () => {
      if (!await confirmar('Remover o certificado digital? Sem ele não dá para transmitir.', { tipo: 'perigo', textoOk: 'Remover' })) return;
      await api('/certificado', { method: 'DELETE' }); await carregarConfig(); renderConfig();
    });
    $('cfgGerarDemo')?.addEventListener('click', (e) => comBotaoCfg(e.currentTarget, async () => {
      const r = await api('/certificado/demonstracao', { method: 'POST' });
      await carregarConfig(); renderConfig();
      mostrarAlerta(`Certificado de demonstração gerado para ${r.titular} (${r.cnpj}). Ele não vale na SEFAZ — serve só para o modo demonstração.`, { tipo: 'sucesso' });
    }));
    $('cfgTestar').addEventListener('click', (e) => comBotaoCfg(e.currentTarget, async () => {
      const r = await api('/testar-conexao', { method: 'POST' });
      mostrarAlerta(`SEFAZ (${r.autorizador}): ${r.cStat} - ${r.xMotivo}${r.tMed ? ` · tempo médio ${r.tMed}s` : ''}`, { tipo: r.cStat === '107' ? 'sucesso' : 'aviso' });
    }));
    $('cfgBuscarCnpj').addEventListener('click', (e) => comBotaoCfg(e.currentTarget, preencherPeloCnpj));
  }
  async function comBotaoCfg(botao, fn) {
    const texto = botao.textContent; botao.disabled = true; botao.textContent = 'Aguarde...';
    try { await fn(); } catch (err) { mostrarAlerta(err.message, { tipo: 'erro' }); } finally { botao.disabled = false; botao.textContent = texto; }
  }
  async function salvarConfig() {
    const v = (id) => $(id).value.trim();
    const demo = v('cfg_ambiente') === 'demo';
    const ambienteNovo = demo ? 2 : Number(v('cfg_ambiente'));
    if (!demo && config?.cte_demonstracao && config?.certificado_demonstracao
      && !await confirmar('Sair do modo demonstração? O certificado cadastrado é o de demonstração e não vale na SEFAZ: envie o certificado A1 da empresa antes de transmitir.', { textoOk: 'Sair da demonstração' })) return;
    if ($('cfg_cont').checked && !config?.cte_contingencia
      && !await confirmar(`Ligar a contingência? Os próximos CT-e vão para a ${config?.svc_sigla || 'SVC'} em vez da SEFAZ ${config?.uf || ''}. Use só quando a SEFAZ estiver fora do ar.`, { textoOk: 'Ligar contingência' })) return;
    if (ambienteNovo === 1 && Number(config?.cte_ambiente) !== 1
      && !await confirmar('Passar a emitir em PRODUÇÃO? Os CT-e autorizados terão valor fiscal. Confira antes se os testes em homologação deram certo.', { tipo: 'perigo', textoOk: 'Usar produção' })) return;
    const corpo = {
      cnpj: v('cfg_cnpj').toUpperCase().replace(/[^A-Z0-9]/g, ''), ie: v('cfg_ie'), razao_social: v('cfg_razao'), nome_fantasia: v('cfg_fantasia'),
      endereco: v('cfg_lgr'), numero: v('cfg_nro'), complemento: v('cfg_cpl'), bairro: v('cfg_bairro'), municipio: v('cfg_mun'),
      codigo_municipio: v('cfg_cmun').replace(/\D/g, ''), uf: v('cfg_uf'), cep: v('cfg_cep').replace(/\D/g, ''), telefone: v('cfg_fone'), email: v('cfg_email'),
      rntrc: v('cfg_rntrc').replace(/\D/g, ''), crt: v('cfg_crt'), cte_ambiente: ambienteNovo, cte_demonstracao: demo, cte_serie: v('cfg_serie'), cte_proximo_numero: v('cfg_numero'), mdfe_serie: v('cfg_mdfe_serie'), mdfe_proximo_numero: v('cfg_mdfe_numero'),
      cte_cst_padrao: v('cfg_cst'), cte_aliquota_interna: v('cfg_aliq'), cte_prazo_padrao: v('cfg_prazo'), cte_verificar_servidor: $('cfg_verificar').checked,
      cte_ibscbs_ativo: $('cfg_ibs').checked, cte_ibscbs_cst: v('cfg_ibs_cst'), cte_ibscbs_class_trib: v('cfg_ibs_class'),
      cte_ibs_uf_aliquota: v('cfg_ibs_uf'), cte_ibs_mun_aliquota: v('cfg_ibs_mun'), cte_cbs_aliquota: v('cfg_cbs'),
      aviso_entrega_ativo: $('cfg_aviso').checked, aviso_entrega_email: $('cfg_aviso_email').checked, aviso_entrega_whatsapp: $('cfg_aviso_wpp').checked,
      aviso_entrega_eventos: [...document.querySelectorAll('[data-cfg-evento]:checked')].map((x) => x.dataset.cfgEvento).join(',') || 'nenhum', endereco_publico: v('cfg_end_publico'),
      cte_contingencia: $('cfg_cont').checked, cte_contingencia_motivo: v('cfg_cont_motivo'),
      averbacao_provedor: v('cfg_av_prov'), averbacao_usuario: v('cfg_av_usuario'), averbacao_codigo: v('cfg_av_codigo'), averbacao_automatica: $('cfg_av_auto').checked,
      ...($('cfg_av_senha').value ? { averbacao_senha_nova: $('cfg_av_senha').value } : {}),
      seguro_seguradora: v('cfg_seg_nome'), seguro_cnpj: v('cfg_seg_cnpj').replace(/\D/g, ''), seguro_apolice: v('cfg_seg_apolice'),
      resp_tec_cnpj: v('cfg_rt_cnpj').replace(/\D/g, ''), resp_tec_contato: v('cfg_rt_contato'), resp_tec_email: v('cfg_rt_email'), resp_tec_fone: v('cfg_rt_fone').replace(/\D/g, ''),
    };
    config = await api('/config', { method: 'PUT', body: JSON.stringify(corpo) });
    await carregarConfig();
    renderConfig();
    mostrarAlerta('Configuração fiscal salva.', { tipo: 'sucesso' });
  }
  async function enviarCertificado() {
    const arq = $('cfg_pfx').files[0];
    if (!arq) throw new Error('Escolha o arquivo do certificado.');
    const fd = new FormData();
    fd.append('certificado', arq);
    fd.append('senha', $('cfg_pfx_senha').value);
    const r = await apiFetch('/api/cte-emissao/certificado', { method: 'POST', body: fd }).then(json);
    await carregarConfig(); renderConfig();
    mostrarAlerta(`Certificado de ${r.titular} enviado. Válido até ${new Date(r.validade).toLocaleDateString('pt-BR')}.`, { tipo: 'sucesso' });
  }
  async function preencherPeloCnpj() {
    const cnpj = $('cfg_cnpj').value.replace(/\D/g, '');
    if (cnpj.length !== 14) throw new Error('Digite o CNPJ (14 dígitos) primeiro.');
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!r.ok) throw new Error('Não achei esse CNPJ na consulta pública (BrasilAPI).');
    const d = await r.json();
    const set = (id, v) => { if (v) $(id).value = v; };
    set('cfg_razao', d.razao_social); set('cfg_fantasia', d.nome_fantasia); set('cfg_lgr', [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '));
    set('cfg_nro', d.numero); set('cfg_cpl', d.complemento); set('cfg_bairro', d.bairro); set('cfg_mun', d.municipio); set('cfg_uf', d.uf);
    set('cfg_cep', d.cep); set('cfg_cmun', d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : ''); set('cfg_fone', d.ddd_telefone_1); set('cfg_email', d.email);
  }
})();
