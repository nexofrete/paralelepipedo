// =====================================================================
// Parceiros e redespacho: cadastro completo (endereço, contatos, banco, serviços),
// área atendida, tabela de frete por região e peso, documentos com vencimento,
// desempenho (pontualidade), avaliações, bloqueio, as cargas repassadas a cada
// parceiro e a conta-corrente com o acerto.
// O repasse em si é feito nas Ocorrências (marcar os CT-e → Repassar a parceiro).
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, confirmar, pedirTexto.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro;
  const financeiro = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navParceiros');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v, c = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/parceiros${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const enviar = (c, metodo, corpo) => api(c, { method: metodo, body: JSON.stringify(corpo || {}) });
  const modal = $('modalParceiro');
  const fechar = () => modal.classList.add('oculto');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-pa-fechar]')) fechar(); });
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-pa-fechar>✕</span></div>`;
  const SIT = { pendente: 'Emitido', em_transito: 'Em trânsito', em_rota: 'Saiu para entrega', agendada: 'Agendado', ocorrencia: 'Com ocorrência', entregue: 'Entregue', devolvido: 'Devolvido' };
  const linkApp = (codigo) => `${location.origin}/motorista.html?c=${codigo}`;
  // CNPJ do parceiro: formata, confere e traz o nome e o telefone pela Receita.
  window.Doc?.registrar('#pfDoc', { razao_social: '#pfNome', nome_fantasia: '#pfFantasia', telefone: '#pfFone', email: '#pfEmail', ie: '#pfIe', cep: '#pfCep', logradouro: '#pfLgr',
    numero: '#pfNro', complemento: '#pfCpl', bairro: '#pfBairro', municipio: '#pfMun', uf: '#pfUf' });
  const admin = usuario?.perfil === 'admin';
  const pct = (v) => (v == null ? '—' : `${num(v, 1)}%`);
  const estrelas = (n) => (n == null ? '<span style="color:var(--texto-fraco);">—</span>' : `<span title="${num(n, 1)} de 5" style="color:#f59e0b; letter-spacing:1px;">${'★'.repeat(Math.round(n))}<span style="opacity:.3;">${'★'.repeat(5 - Math.round(n))}</span></span> <small>${num(n, 1)}</small>`);
  const corPont = (v) => (v == null ? 'inherit' : v >= 95 ? 'var(--verde)' : v >= 85 ? '#d97706' : 'var(--vermelho)');
  const selo = (p) => (p.bloqueado ? `<span class="oc-sit devolvido" title="${esc(p.bloqueio_motivo || '')}">🚫 Bloqueado</span>`
    : p.impedido ? `<span class="oc-sit ocorrencia" title="${esc(p.impedido)}">📄 Documento vencido</span>`
      : p.docs_vencendo ? '<span class="oc-sit agendada">📄 Documento vencendo</span>' : '');

  let dados = null;
  async function carregar() {
    dados = await api('');
    const ps = dados.parceiros;
    $('paConteudo').innerHTML = ps.length ? `<div class="cte-abas" style="margin-bottom:10px;"><div class="cte-aba ativo">🤝 Parceiros</div><div class="cte-aba" id="paVerRanking">🏆 Ranking de desempenho</div></div>
      <div class="painel oc-painel"><div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Parceiro</th><th>Atende</th><th>Custo</th><th class="n">Prazo</th><th class="n" title="Últimos 90 dias">Pontualidade</th><th>Nota</th><th class="n">Cargas em aberto</th><th class="n">Saldo da conta</th><th></th></tr></thead><tbody>
      ${ps.map((p) => `<tr${p.ativo ? '' : ' style="opacity:.55;"'}><td><b>${esc(p.fantasia || p.nome)}</b> ${selo(p)}<br><small style="color:var(--texto-fraco);">${esc(p.nome)}${p.contato_nome ? ` · ${esc(p.contato_nome)}` : ''}${p.telefone ? ` · ${esc(p.telefone)}` : ''}</small>
        ${p.servicos?.length ? `<br><small style="color:var(--texto-fraco);">${p.servicos.map((x) => esc(dados.servicos[x] || x)).join(' · ')}</small>` : ''}</td>
        <td><small>${p.ufs.length ? `<b>${esc(p.ufs.join(', '))}</b> (estado todo)` : ''}${p.ufs.length && p.cidades.length ? '<br>' : ''}${p.cidades.length ? `${esc(p.cidades.slice(0, 4).join(', '))}${p.cidades.length > 4 ? ` +${p.cidades.length - 4}` : ''}` : ''}</small></td>
        <td><small>${p.tabela_linhas ? `<b>Tabela por região</b> (${p.tabela_linhas} linha(s))<br>` : ''}${[p.custo_percentual ? `${num(p.custo_percentual)}% do frete` : '', p.custo_kg ? `${num(p.custo_kg, 4)}/kg` : '', p.custo_fixo ? `${brl(p.custo_fixo)} por CT-e` : '', p.custo_minimo ? `mín. ${brl(p.custo_minimo)}` : ''].filter(Boolean).join(' + ') || (p.tabela_linhas ? '' : '—')}</small></td>
        <td class="n">${p.prazo_dias ? `+${p.prazo_dias} dia(s)` : '—'}</td>
        <td class="n"><b style="color:${corPont(p.indicadores.pontualidade)};">${pct(p.indicadores.pontualidade)}</b>${p.indicadores.cargas ? `<br><small style="color:var(--texto-fraco);">${p.indicadores.cargas} carga(s)</small>` : ''}</td>
        <td>${estrelas(p.indicadores.nota_geral)}</td>
        <td class="n">${p.em_aberto}${p.atrasados ? `<br><small style="color:var(--vermelho);">${p.atrasados} atrasada(s)</small>` : ''}</td>
        <td class="n"><b style="color:${p.saldo > 0 ? '#dc2626' : p.saldo < 0 ? 'var(--verde)' : 'inherit'};">${brl(Math.abs(p.saldo))}</b><br><small style="color:var(--texto-fraco);">${p.saldo > 0 ? 'a pagar ao parceiro' : p.saldo < 0 ? 'o parceiro deve' : 'zerado'}</small></td>
        <td><div class="oc-linha-acoes"><button class="primario" data-pa-abrir="${p.id}">Abrir</button><button data-pa-editar="${p.id}">Editar</button></div></td></tr>`).join('')}</tbody></table></div></div>
      <p class="edi-dica" style="margin-top:10px;">Para repassar cargas: em <b>Ocorrências de entrega</b>, marque os CT-e e clique em <b>🤝 Repassar a parceiro</b>. O sistema sugere o parceiro pelo destino, lança o custo previsto na conta dele e gera o código do app para ele dar baixa nas entregas.</p>`
      : '<div class="kanban-vazio">Nenhum parceiro. Cadastre os agentes e transportadoras que entregam onde você não tem filial (＋ Parceiro).</div>';
    $('paVerRanking')?.addEventListener('click', () => ranking().catch(erro));
    document.querySelectorAll('[data-pa-abrir]').forEach((b) => b.addEventListener('click', () => abrir(Number(b.dataset.paAbrir)).catch(erro)));
    document.querySelectorAll('[data-pa-editar]').forEach((b) => b.addEventListener('click', () => form(ps.find((p) => p.id === Number(b.dataset.paEditar)))));
  }
  nav.addEventListener('click', () => carregar().catch(erro));
  $('paNovo').addEventListener('click', () => (dados ? Promise.resolve() : carregar()).then(() => form(null)).catch(erro));

  function form(p) {
    const v = p || { ufs: [], cidades: [], ativo: true, contatos: [], servicos: [] };
    const campo = (id, rotulo, valor, extra = '', classe = '') => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;
    const linhaContato = (c = {}) => `<div class="oc-form" data-pf-contato style="grid-template-columns:repeat(4,1fr) auto; margin-bottom:4px;">
      <input class="cte-entrada" data-k="nome" placeholder="Nome" value="${esc(c.nome || '')}" /><input class="cte-entrada" data-k="funcao" placeholder="Função (financeiro, operação...)" value="${esc(c.funcao || '')}" />
      <input class="cte-entrada" data-k="telefone" placeholder="Telefone" value="${esc(c.telefone || '')}" /><input class="cte-entrada" data-k="email" placeholder="E-mail" value="${esc(c.email || '')}" />
      <button class="btn btn-secundario" data-pf-tirar style="width:auto;" title="Tirar">✕</button></div>`;
    modal.classList.remove('oculto');
    $('paModal').innerHTML = `${cab(p ? `Editar — ${esc(p.nome)}` : '＋ Novo parceiro')}
      <div class="oc-form">${campo('pfDoc', 'CNPJ/CPF', v.documento)}${campo('pfNome', 'Razão social', v.nome)}${campo('pfFantasia', 'Nome fantasia', v.fantasia)}${campo('pfIe', 'Inscrição estadual', v.ie)}${campo('pfRntrc', 'RNTRC', v.rntrc)}</div>
      <h4 style="margin:12px 0 4px;">Endereço</h4>
      <div class="oc-form">${campo('pfCep', 'CEP', v.cep)}${campo('pfLgr', 'Logradouro', v.logradouro)}${campo('pfNro', 'Número', v.numero)}${campo('pfCpl', 'Complemento', v.complemento)}${campo('pfBairro', 'Bairro', v.bairro)}${campo('pfMun', 'Município', v.municipio)}
        <div class="campo"><label for="pfUf">UF</label><select id="pfUf" class="cte-entrada"><option value=""></option>${dados.ufs.map((u) => `<option ${v.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
      <h4 style="margin:12px 0 4px;">Contatos</h4>
      <div class="oc-form">${campo('pfContato', 'Contato principal', v.contato_nome)}${campo('pfFone', 'Telefone', v.telefone)}${campo('pfEmail', 'E-mail', v.email)}</div>
      <div id="pfContatos">${(v.contatos || []).map(linhaContato).join('')}</div>
      <button class="btn btn-secundario" id="pfMaisContato" style="width:auto; margin-bottom:6px;">＋ Outro contato</button>
      <h4 style="margin:12px 0 4px;">Dados bancários (para o acerto)</h4>
      <div class="oc-form">${campo('pfBanco', 'Banco', v.banco)}${campo('pfAgencia', 'Agência', v.agencia)}${campo('pfConta', 'Conta', v.conta)}
        <div class="campo"><label for="pfTipoConta">Tipo de conta</label><select id="pfTipoConta" class="cte-entrada"><option value=""></option>${[['corrente', 'Corrente'], ['poupanca', 'Poupança'], ['pagamento', 'Pagamento']].map(([k, t]) => `<option value="${k}" ${v.tipo_conta === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        ${campo('pfPix', 'Chave PIX', v.pix)}</div>
      <h4 style="margin:12px 0 4px;">Serviços que oferece</h4>
      <div class="pa-ufs">${Object.entries(dados.servicos).map(([k, t]) => `<label><input type="checkbox" data-pf-serv="${k}" ${(v.servicos || []).includes(k) ? 'checked' : ''} /> ${esc(t)}</label>`).join('')}</div>
      <h4 style="margin:12px 0 4px;">Onde entrega</h4>
      <div class="campo"><label>Estados inteiros</label><div class="pa-ufs">${dados.ufs.map((u) => `<label><input type="checkbox" data-pf-uf="${u}" ${v.ufs.includes(u) ? 'checked' : ''} /> ${u}</label>`).join('')}</div></div>
      <div class="campo"><label for="pfCidades">Cidades (uma por linha: Cidade/UF)</label><textarea id="pfCidades" class="cte-entrada" rows="4" placeholder="Juiz de Fora/MG&#10;Volta Redonda/RJ">${esc(v.cidades.join('\n'))}</textarea></div>
      <h4 style="margin:12px 0 4px;">Custo padrão (quando a tabela por região não tem o destino)</h4>
      <div class="oc-form">${campo('pfPct', '% do frete', v.custo_percentual ? num(v.custo_percentual) : '')}${campo('pfKg', 'R$ por kg', v.custo_kg ? num(v.custo_kg, 4) : '')}${campo('pfFixo', 'R$ fixo por CT-e', v.custo_fixo ? num(v.custo_fixo) : '')}${campo('pfMin', 'Mínimo por CT-e (R$)', v.custo_minimo ? num(v.custo_minimo) : '')}
        ${campo('pfPrazo', 'Prazo dele (dias a mais na previsão)', v.prazo_dias || '', 'type="number" min="0"')}
        <label class="ag-check" style="align-self:end; margin-bottom:10px;"><input type="checkbox" id="pfAtivo" ${v.ativo ? 'checked' : ''} /> Ativo</label>
        <div class="campo inteiro"><label for="pfObs">Observação</label><input id="pfObs" class="cte-entrada" value="${esc(v.observacao || '')}" /></div></div>
      <p class="edi-dica">A tabela de frete por região e faixa de peso, os documentos, o desempenho, as avaliações e o bloqueio ficam em <b>Abrir</b>.</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-pa-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="pfSalvar" style="width:auto;">Salvar</button></div>`;
    const ligarTirar = () => document.querySelectorAll('[data-pf-tirar]').forEach((b) => { b.onclick = () => b.closest('[data-pf-contato]').remove(); });
    ligarTirar();
    $('pfMaisContato').addEventListener('click', () => { $('pfContatos').insertAdjacentHTML('beforeend', linhaContato()); ligarTirar(); });
    $('pfSalvar').addEventListener('click', async () => {
      const contatos = [...document.querySelectorAll('[data-pf-contato]')].map((l) => Object.fromEntries([...l.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])));
      const corpo = { documento: $('pfDoc').value, nome: $('pfNome').value, fantasia: $('pfFantasia').value, ie: $('pfIe').value, rntrc: $('pfRntrc').value,
        cep: $('pfCep').value, logradouro: $('pfLgr').value, numero: $('pfNro').value, complemento: $('pfCpl').value, bairro: $('pfBairro').value, municipio: $('pfMun').value, uf: $('pfUf').value,
        contato_nome: $('pfContato').value, telefone: $('pfFone').value, email: $('pfEmail').value, contatos,
        banco: $('pfBanco').value, agencia: $('pfAgencia').value, conta: $('pfConta').value, tipo_conta: $('pfTipoConta').value, pix: $('pfPix').value,
        servicos: [...document.querySelectorAll('[data-pf-serv]:checked')].map((x) => x.dataset.pfServ),
        ufs: [...document.querySelectorAll('[data-pf-uf]:checked')].map((x) => x.dataset.pfUf), cidades: $('pfCidades').value,
        custo_percentual: $('pfPct').value, custo_kg: $('pfKg').value, custo_fixo: $('pfFixo').value, custo_minimo: $('pfMin').value, prazo_dias: $('pfPrazo').value, ativo: $('pfAtivo').checked, observacao: $('pfObs').value };
      try { await (p ? enviar(`/${p.id}`, 'PUT', corpo) : enviar('', 'POST', corpo)); fechar(); mostrarAlerta('Parceiro salvo.', { tipo: 'sucesso' }); carregar().catch(erro); } catch (err) { erro(err); }
    });
  }

  // Ranking dos parceiros no período (pontualidade, atrasos, notas).
  async function ranking(de = '', ate = '') {
    const r = await api(`/ranking?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`);
    $('paConteudo').innerHTML = `<div class="cte-abas" style="margin-bottom:10px;"><div class="cte-aba" id="paVerLista">🤝 Parceiros</div><div class="cte-aba ativo">🏆 Ranking de desempenho</div></div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">De <input type="date" id="prDe" class="cte-entrada" value="${r.de}" style="width:auto;" /> até <input type="date" id="prAte" class="cte-entrada" value="${r.ate}" style="width:auto;" />
        <button class="btn btn-secundario" id="prVer" style="width:auto;">Ver</button></div>
      <div class="painel oc-painel"><div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>#</th><th>Parceiro</th><th class="n">Cargas</th><th class="n">Entregues</th><th class="n">Pontualidade</th><th class="n">Atraso médio</th><th class="n">Ocorrências</th><th class="n">Devolvidas</th><th>Avaliação</th><th>Nota geral</th></tr></thead><tbody>
      ${r.parceiros.map((p, i) => `<tr${p.ativo ? '' : ' style="opacity:.55;"'}><td>${p.nota_geral == null ? '' : `${i + 1}º`}</td><td><b>${esc(p.fantasia || p.nome)}</b>${p.bloqueado ? ' <span class="oc-sit devolvido">🚫 Bloqueado</span>' : ''}</td>
        <td class="n">${p.cargas}</td><td class="n">${p.entregues}</td><td class="n"><b style="color:${corPont(p.pontualidade)};">${pct(p.pontualidade)}</b></td>
        <td class="n">${p.atrasadas ? `${num(p.atraso_medio, 1)} dia(s)` : '—'}</td><td class="n">${p.problemas || '—'}</td><td class="n">${p.devolvidas || '—'}</td>
        <td>${estrelas(p.nota_media)}${p.avaliacoes ? ` <small style="color:var(--texto-fraco);">(${p.avaliacoes})</small>` : ''}</td><td>${estrelas(p.nota_geral)}</td></tr>`).join('')}</tbody></table></div></div>
      <p class="edi-dica" style="margin-top:8px;">Pontualidade: entregas no prazo prometido pelo parceiro ÷ (entregues + as em aberto que já passaram do prazo). O prazo conta do repasse (ou da previsão do CT-e, se for depois) mais os dias do parceiro. Nota geral: a pontualidade em 5 estrelas (100% = 5); com avaliações, metade de cada.</p>`;
    $('paVerLista').addEventListener('click', () => carregar().catch(erro));
    $('prVer').addEventListener('click', () => ranking($('prDe').value, $('prAte').value).catch(erro));
  }

  async function abrir(id, aba = 'cargas') {
    const x = await api(`/${id}/extrato?status=${aba === 'historico' ? 'todos' : 'aberto'}`);
    const p = x.parceiro;
    const abas = [['cargas', `🚚 Cargas (${x.cargas.filter((c) => !['entregue', 'devolvido'].includes(c.situacao_entrega)).length} em aberto)`], ['conta', `💰 Conta-corrente (${brl(Math.abs(x.saldo))})`], ['historico', '🧾 Histórico e acertos'],
      ['desempenho', '📈 Desempenho'], ['tabela', '📋 Tabela de frete'], ['documentos', '📄 Documentos'], ['avaliacoes', '⭐ Avaliações'], ['bloqueio', p.bloqueado ? '🚫 Bloqueado' : '🔓 Bloqueio']];
    let corpo = '';
    if (['desempenho', 'tabela', 'documentos', 'avaliacoes', 'bloqueio'].includes(aba)) corpo = await outraAba(id, p, aba);
    else if (aba === 'cargas') {
      const codigos = [...new Map(x.cargas.filter((c) => c.romaneio_status !== 'fechado').map((c) => [c.romaneio_id, c.codigo_acesso])).entries()];
      corpo = `${codigos.length ? `<div class="cte-aviso" style="margin-bottom:10px;">📱 O parceiro dá baixa pelo app: ${codigos.map(([r, c]) => `romaneio ${r}: código <b>${esc(c)}</b> <a href="#" data-pa-copiar="${esc(c)}">copiar link</a>`).join(' · ')}</div>` : ''}
        ${x.cargas.length ? `<table class="edi-tabela"><thead><tr><th>CT-e</th><th>Destinatário</th><th>Destino</th><th>Previsão</th><th>Situação</th><th></th></tr></thead><tbody>
        ${x.cargas.map((c) => `<tr><td><b>${esc(c.serie)}/${esc(c.numero)}</b></td><td>${esc(c.destinatario_nome || '')}</td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td>
          <td>${dia(c.previsao_entrega)}${!['entregue', 'devolvido'].includes(c.situacao_entrega) && c.previsao_entrega < hoje() ? ' <small style="color:var(--vermelho);">atrasada</small>' : ''}</td>
          <td><span class="oc-sit ${esc(c.situacao_entrega)}">${esc(SIT[c.situacao_entrega] || c.situacao_entrega)}</span>${c.data_entrega ? `<br><small>${new Date(c.data_entrega).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>` : ''}</td>
          <td>${['entregue', 'devolvido'].includes(c.situacao_entrega) ? `<button class="btn btn-secundario" style="width:auto; padding:4px 10px;" data-pa-avaliar="${c.id}" data-rotulo="${esc(`${c.serie}/${c.numero}`)}">⭐ Avaliar</button>` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<div class="kanban-vazio">Nenhuma carga com este parceiro.</div>'}`;
    } else {
      const lancs = x.lancamentos;
      corpo = `${aba === 'conta' ? `<div class="oc-resumo"><div>Saldo em aberto<b style="color:${x.saldo > 0 ? '#dc2626' : 'var(--verde)'};">${brl(Math.abs(x.saldo))}</b><span>${x.saldo > 0 ? 'a empresa deve ao parceiro' : x.saldo < 0 ? 'o parceiro deve à empresa' : 'zerado'}</span></div>
          <div>Custos em aberto<b>${brl(lancs.filter((l) => l.tipo === 'custo').reduce((s, l) => s + l.valor, 0))}</b><span>${lancs.filter((l) => l.tipo === 'custo').length} CT-e</span></div></div>
        ${financeiro ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;"><button class="btn btn-secundario" id="paLancar" style="width:auto;">＋ Lançamento</button><span style="flex:1;"></span>
          <input type="date" id="paAte" class="cte-entrada" value="${hoje()}" style="width:auto;" title="Acertar até" /><button class="btn btn-primario" id="paAcertar" style="width:auto;">✓ Fazer o acerto</button></div>` : ''}` : ''}
        ${lancs.length ? `<table class="edi-tabela"><thead><tr><th>Data</th><th>Lançamento</th><th>CT-e</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lancs.map((l) => `<tr><td>${dia(l.data)}</td><td>${esc(l.tipo_nome)}<br><small style="color:var(--texto-fraco);">${esc(l.descricao || '')}</small></td><td>${l.numero ? `${esc(l.serie)}/${esc(l.numero)}<br><small>${esc(l.cidade_fim || '')}/${esc(l.uf_fim || '')}</small>` : ''}</td>
          <td class="n" style="color:${l.valor > 0 ? '#dc2626' : 'var(--verde)'};">${l.valor > 0 ? '' : '− '}${brl(Math.abs(l.valor))}</td>
          <td><small>${l.status === 'aberto' ? 'em aberto' : l.nota_entrada_id ? `baixado pelo CT-e ${esc(l.nota_numero || '')} do parceiro` : `acerto ${l.acerto_id}`}</small></td>
          <td>${l.status === 'aberto' && financeiro ? `<div class="oc-linha-acoes"><button data-pa-valor="${l.id}" data-v="${l.valor}">Ajustar</button><button data-pa-apagar="${l.id}" title="Apagar">🗑</button></div>` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<div class="kanban-vazio">Nenhum lançamento.</div>'}
        ${aba === 'historico' && x.acertos.length ? `<h4 style="margin:14px 0 6px;">Acertos</h4><table class="edi-tabela"><tbody>${x.acertos.map((a) => `<tr><td>Acerto ${a.id} · até ${dia(a.ate)}</td><td class="n">${brl(Math.abs(a.saldo))} ${a.saldo > 0 ? 'pago ao parceiro' : a.saldo < 0 ? 'devido pelo parceiro' : ''}</td><td>${a.conta_pagar_id ? `conta a pagar ${a.conta_status || ''} · vence ${dia(a.conta_vencimento)}` : ''}</td><td><small>${esc(a.usuario_nome || '')}</small></td></tr>`).join('')}</tbody></table>` : ''}
        <p class="edi-dica" style="margin-top:8px;">Cada repasse lança o custo previsto pela tabela do parceiro. Quando o CT-e do parceiro (redespacho contra a sua empresa) é lançado em Fiscal › Notas de entrada, os custos dos CT-e citados nele saem daqui: a conta a pagar já sai da nota. O resto entra no acerto.</p>`;
    }
    modal.classList.remove('oculto');
    const lp = dados?.parceiros?.find((y) => y.id === id) || p;
    $('paModal').innerHTML = `${cab(`🤝 ${esc(p.fantasia || p.nome)} ${selo(lp)}`)}${p.bloqueado ? `<div class="cte-aviso" style="margin-bottom:10px; border-color:var(--vermelho);">🚫 Bloqueado desde ${new Date(p.bloqueado_em).toLocaleDateString('pt-BR')} por ${esc(p.bloqueado_por || '')}: <b>${esc(p.bloqueio_motivo || '')}</b>. Não recebe cargas até ser liberado.</div>` : lp.impedido ? `<div class="cte-aviso" style="margin-bottom:10px;">📄 ${esc(lp.impedido)}. O repasse fica travado (o administrador pode liberar caso a caso).</div>` : ''}<div class="cte-abas" style="margin-bottom:10px; flex-wrap:wrap;">${abas.map(([k, t]) => `<div class="cte-aba ${aba === k ? 'ativo' : ''}" data-pa-aba="${k}">${t}</div>`).join('')}</div>${corpo}`;
    document.querySelectorAll('[data-pa-aba]').forEach((a) => a.addEventListener('click', () => abrir(id, a.dataset.paAba).catch(erro)));
    document.querySelectorAll('[data-pa-avaliar]').forEach((b) => b.addEventListener('click', () => avaliar(id, Number(b.dataset.paAvaliar), b.dataset.rotulo)));
    ligarOutraAba(id, p, aba);
    document.querySelectorAll('[data-pa-copiar]').forEach((a) => a.addEventListener('click', async (e) => { e.preventDefault(); const t = linkApp(a.dataset.paCopiar); try { await navigator.clipboard.writeText(t); mostrarAlerta(`Link copiado:\n${t}`, { tipo: 'sucesso' }); } catch { mostrarAlerta(t); } }));
    $('paLancar')?.addEventListener('click', () => lancamento(id, x.tipos));
    $('paAcertar')?.addEventListener('click', async () => {
      const ate = $('paAte').value;
      const saldo = x.lancamentos.filter((l) => l.data <= ate).reduce((s, l) => s + l.valor, 0);
      let vencimento = null;
      if (saldo > 0) {
        vencimento = await pedirTexto(`Acerto até ${dia(ate)}: a empresa paga ${brl(saldo)} ao parceiro. Vencimento da conta a pagar (AAAA-MM-DD):`, { titulo: 'Acerto com o parceiro', valor: hoje(), textoOk: 'Fazer o acerto' });
        if (!vencimento) return;
      } else if (!await confirmar(`Acerto até ${dia(ate)}: ${saldo < 0 ? `o parceiro deve ${brl(-saldo)} à empresa (lance o recebimento quando ele pagar)` : 'saldo zerado'}. Fechar os lançamentos?`, { textoOk: 'Fazer o acerto' })) return;
      try { const r = await enviar(`/${id}/acertar`, 'POST', { ate, vencimento }); mostrarAlerta(`Acerto feito: ${r.lancamentos} lançamento(s), saldo ${brl(Math.abs(r.saldo))}${r.conta_pagar_id ? ' — conta a pagar lançada' : ''}.`, { tipo: 'sucesso' }); abrir(id, 'historico').catch(erro); carregar().catch(erro); } catch (err) { erro(err); }
    });
    document.querySelectorAll('[data-pa-valor]').forEach((b) => b.addEventListener('click', async () => {
      const v = await pedirTexto('Novo valor (R$). Positivo: a empresa deve; negativo: o parceiro deve.', { titulo: 'Ajustar lançamento', valor: num(b.dataset.v), textoOk: 'Salvar' });
      if (v == null) return;
      try { await enviar(`/lancamentos/${b.dataset.paValor}`, 'PUT', { valor: v, motivo: 'ajuste manual' }); abrir(id, aba).catch(erro); carregar().catch(erro); } catch (err) { erro(err); }
    }));
    document.querySelectorAll('[data-pa-apagar]').forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmar('Apagar este lançamento?', { tipo: 'perigo', textoOk: 'Apagar' })) return;
      try { await api(`/lancamentos/${b.dataset.paApagar}`, { method: 'DELETE' }); abrir(id, aba).catch(erro); carregar().catch(erro); } catch (err) { erro(err); }
    }));
  }

  // ---------- Abas de gestão: desempenho, tabela, documentos, avaliações, bloqueio ----------
  const filtroDesempenho = {};
  async function outraAba(id, p, aba) {
    if (aba === 'desempenho') {
      const f = filtroDesempenho[id] || {};
      const d = await api(`/${id}/desempenho?de=${f.de || ''}&ate=${f.ate || ''}`);
      const g = d.geral;
      const barra = (v) => (v == null ? '—' : `<div style="display:flex; align-items:center; gap:6px;"><div style="flex:1; min-width:80px; height:8px; background:var(--bg-elevado); border-radius:4px;"><div style="width:${Math.max(0, Math.min(100, v))}%; height:100%; background:${corPont(v)}; border-radius:4px;"></div></div><b style="color:${corPont(v)};">${num(v, 1)}%</b></div>`);
      const tabelaGrupo = (titulo, linhas, rotulo) => `<h4 style="margin:14px 0 6px;">${titulo}</h4>${linhas.length ? `<table class="edi-tabela"><thead><tr><th>${rotulo}</th><th class="n">Cargas</th><th class="n">Entregues</th><th style="min-width:180px;">Pontualidade</th><th class="n">Atraso médio</th><th class="n">Ocorrências</th><th class="n">Devolvidas</th></tr></thead><tbody>
        ${linhas.map((l) => `<tr><td><b>${esc(rotulo === 'Mês' ? l.chave.split('-').reverse().join('/') : l.chave)}</b></td><td class="n">${l.cargas}</td><td class="n">${l.entregues}</td><td>${barra(l.pontualidade)}</td><td class="n">${l.atrasadas ? `${num(l.atraso_medio, 1)} dia(s)` : '—'}</td><td class="n">${l.problemas || '—'}</td><td class="n">${l.devolvidas || '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nenhuma carga no período.</div>'}`;
      return `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">De <input type="date" id="pdDe" class="cte-entrada" value="${d.de}" style="width:auto;" /> até <input type="date" id="pdAte" class="cte-entrada" value="${d.ate}" style="width:auto;" /><button class="btn btn-secundario" id="pdVer" style="width:auto;">Ver</button></div>
        <div class="oc-resumo"><div>Pontualidade<b style="color:${corPont(g.pontualidade)};">${pct(g.pontualidade)}</b><span>${g.no_prazo} de ${g.entregues + g.abertas_atrasadas} no prazo</span></div>
          <div>Cargas<b>${g.cargas}</b><span>${g.entregues} entregue(s) · ${g.abertas} em aberto</span></div>
          <div>Atrasos<b style="color:${g.atrasadas + g.abertas_atrasadas ? 'var(--vermelho)' : 'inherit'};">${g.atrasadas + g.abertas_atrasadas}</b><span>${g.atrasadas ? `média ${num(g.atraso_medio, 1)} dia(s) nas entregues` : 'nenhum entregue atrasado'}${g.abertas_atrasadas ? ` · ${g.abertas_atrasadas} em aberto atrasada(s)` : ''}</span></div>
          <div>Ocorrências<b>${g.problemas}</b><span>${g.devolvidas} devolvida(s)</span></div>
          <div>Avaliação<b>${g.nota_media == null ? '—' : num(g.nota_media, 1)}</b><span>${g.avaliacoes} avaliação(ões)</span></div>
          <div>Nota geral<b>${g.nota_geral == null ? '—' : num(g.nota_geral, 1)}</b><span>${estrelas(g.nota_geral)}</span></div></div>
        ${tabelaGrupo('Por mês (do repasse)', d.por_mes, 'Mês')}${tabelaGrupo('Por estado de destino', d.por_uf, 'UF')}
        <h4 style="margin:14px 0 6px;">Entregas atrasadas</h4>${d.atrasos.length ? `<table class="edi-tabela"><thead><tr><th>CT-e</th><th>Destinatário</th><th>Destino</th><th>Prazo do parceiro</th><th>Entregue</th><th class="n">Atraso</th></tr></thead><tbody>
        ${d.atrasos.map((l) => `<tr><td><b>${esc(l.serie)}/${esc(l.numero)}</b></td><td>${esc(l.destinatario_nome || '')}</td><td>${esc(l.cidade_fim || '')}/${esc(l.uf_fim || '')}</td><td>${dia(l.prometido)}</td><td>${l.entregue_em ? dia(l.entregue_em) : '<small style="color:var(--vermelho);">ainda não</small>'}</td><td class="n" style="color:var(--vermelho);">${l.dias} dia(s)</td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nenhuma entrega atrasada no período. 👍</div>'}
        <p class="edi-dica" style="margin-top:8px;">O prazo do parceiro conta do repasse (ou da previsão do CT-e, se for depois) mais os dias dele (da tabela da região ou do cadastro). CT-e que já estava atrasado ao ser repassado não conta contra ele.</p>`;
    }
    if (aba === 'tabela') {
      const t = await api(`/${id}/tabela`);
      return `<p class="edi-dica" style="margin-top:0;">Custo e prazo por região: a linha da <b>cidade</b> vale antes da do <b>estado</b>; na mesma região, vale a menor faixa de peso em que o CT-e cabe ("até" vazio = qualquer peso). Destino sem linha: usa o custo padrão do cadastro. O custo é o fixo + % do frete + R$/kg, nunca menos que o mínimo.</p>
        <div class="edi-rolagem"><table class="edi-tabela" id="ptTabela"><thead><tr><th>UF</th><th>Cidade (vazia = estado todo)</th><th>Até (kg)</th><th>% do frete</th><th>R$/kg</th><th>R$ fixo</th><th>Mínimo R$</th><th>Prazo (dias)</th><th></th></tr></thead><tbody>
        ${t.linhas.map(linhaTabela).join('')}</tbody></table></div>
        <div style="display:flex; gap:8px; margin-top:8px;"><button class="btn btn-secundario" id="ptMais" style="width:auto;">＋ Linha</button><span style="flex:1;"></span><button class="btn btn-primario" id="ptSalvar" style="width:auto;">Salvar a tabela</button></div>`;
    }
    if (aba === 'documentos') {
      const d = await api(`/${id}/documentos`);
      const SITD = { vencido: ['devolvido', 'Vencido'], vencendo: ['agendada', 'Vencendo'], em_dia: ['entregue', 'Em dia'], sem_validade: ['pendente', 'Sem validade'] };
      return `${d.faltam.length ? `<div class="cte-aviso" style="margin-bottom:10px;">Faltam os obrigatórios: <b>${d.faltam.map((f) => esc(f.nome)).join(', ')}</b>.</div>` : ''}
        ${d.documentos.length ? `<table class="edi-tabela"><thead><tr><th>Documento</th><th>Número</th><th>Validade</th><th>Situação</th><th>Atualizado</th><th></th></tr></thead><tbody>
        ${d.documentos.map((x) => `<tr><td><b>${esc(x.nome)}</b>${x.obrigatorio ? ' <small style="color:var(--texto-fraco);">obrigatório</small>' : ''}${x.observacao ? `<br><small>${esc(x.observacao)}</small>` : ''}</td><td>${esc(x.numero || '')}</td><td>${dia(x.validade)}</td>
          <td><span class="oc-sit ${SITD[x.situacao][0]}">${SITD[x.situacao][1]}</span>${x.dias != null ? `<br><small>${x.dias < 0 ? `venceu há ${-x.dias} dia(s)` : `faltam ${x.dias} dia(s)`}</small>` : ''}</td>
          <td><small>${esc(x.atualizado_por || '')}<br>${new Date(x.atualizado_em).toLocaleDateString('pt-BR')}</small></td>
          <td><div class="oc-linha-acoes"><button data-pd-editar='${esc(JSON.stringify(x))}'>Renovar</button><button data-pd-apagar="${x.id}" title="Apagar">🗑</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nenhum documento cadastrado.</div>'}
        <h4 style="margin:14px 0 6px;">Lançar / renovar documento</h4>
        <div class="oc-form"><div class="campo"><label for="pdTipo">Documento</label><select id="pdTipo" class="cte-entrada">${Object.entries(d.tipos).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
          <div class="campo"><label for="pdNumero">Número / apólice</label><input id="pdNumero" class="cte-entrada" /></div>
          <div class="campo"><label for="pdValidade">Validade</label><input id="pdValidade" type="date" class="cte-entrada" /></div>
          <div class="campo"><label for="pdAviso">Avisar antes (dias)</label><input id="pdAviso" type="number" min="1" max="180" value="30" class="cte-entrada" /></div>
          <div class="campo inteiro"><label for="pdObs">Observação</label><input id="pdObs" class="cte-entrada" maxlength="300" placeholder="Ex.: seguradora, cobertura" /></div></div>
        <div style="display:flex; justify-content:flex-end;"><button class="btn btn-primario" id="pdSalvar" style="width:auto;">Salvar documento</button></div>
        <p class="edi-dica">RNTRC e seguro RCTR-C vencidos travam o repasse de cargas ao parceiro (o administrador pode liberar caso a caso). A tela Hoje avisa os vencidos e os que vencem dentro do aviso.</p>`;
    }
    if (aba === 'avaliacoes') {
      const { avaliacoes } = await api(`/${id}/avaliacoes`);
      return `<div style="display:flex; justify-content:flex-end; margin-bottom:8px;"><button class="btn btn-primario" id="paAvaliarGeral" style="width:auto;">⭐ Avaliar o parceiro</button></div>
        ${avaliacoes.length ? `<table class="edi-tabela"><thead><tr><th>Quando</th><th>Nota</th><th>CT-e</th><th>Comentário</th><th>Quem</th><th></th></tr></thead><tbody>
        ${avaliacoes.map((a) => `<tr><td>${new Date(a.criado_em).toLocaleDateString('pt-BR')}</td><td>${estrelas(a.nota)}</td><td>${a.numero ? `${esc(a.serie)}/${esc(a.numero)}<br><small>${esc(a.destinatario_nome || '')}</small>` : '<small>geral</small>'}</td>
          <td>${esc(a.comentario || '')}</td><td><small>${esc(a.usuario_nome || '')}</small></td><td><button class="btn btn-secundario" style="width:auto; padding:4px 8px;" data-pv-apagar="${a.id}" title="Apagar">🗑</button></td></tr>`).join('')}</tbody></table>`
    : '<div class="kanban-vazio">Nenhuma avaliação. Avalie cada carga entregue na aba Cargas (⭐ Avaliar) ou o parceiro em geral.</div>'}`;
    }
    // bloqueio
    const { historico } = await api(`/${id}/bloqueios`);
    return `${p.bloqueado
      ? `<p>O parceiro está <b>bloqueado</b>: não aparece na sugestão do repasse e não recebe cargas.</p>${admin ? `<div class="campo"><label for="pbMotivo">Motivo da liberação</label><input id="pbMotivo" class="cte-entrada" maxlength="300" /></div>
        <div style="display:flex; justify-content:flex-end;"><button class="btn btn-primario" id="pbLiberar" style="width:auto;">🔓 Liberar o parceiro</button></div>` : '<div class="cte-aviso">Só o administrador libera um parceiro bloqueado.</div>'}`
      : `<p>Bloqueie o parceiro para impedir novos repasses (problema de entrega, extravio, documento irregular, pendência financeira...). As cargas que já estão com ele continuam e podem receber baixa. Só o administrador libera.</p>
        <div class="campo"><label for="pbMotivo">Motivo do bloqueio</label><input id="pbMotivo" class="cte-entrada" maxlength="300" /></div>
        <div style="display:flex; justify-content:flex-end;"><button class="btn btn-primario" id="pbBloquear" style="width:auto; background:var(--vermelho);">🚫 Bloquear o parceiro</button></div>`}
      <h4 style="margin:14px 0 6px;">Histórico</h4>${historico.length ? `<table class="edi-tabela"><tbody>${historico.map((h) => `<tr><td>${new Date(h.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
        <td>${h.acao === 'bloqueio' ? '<span class="oc-sit devolvido">🚫 Bloqueio</span>' : '<span class="oc-sit entregue">🔓 Liberação</span>'}</td><td>${esc(h.motivo || '')}</td><td><small>${esc(h.usuario_nome || '')}</small></td></tr>`).join('')}</tbody></table>` : '<div class="kanban-vazio">Nunca foi bloqueado.</div>'}`;
  }
  const linhaTabela = (l = {}) => `<tr data-pt-linha><td><select class="cte-entrada" data-k="uf" style="min-width:64px;"><option value=""></option>${(dados?.ufs || []).map((u) => `<option ${l.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></td>
    <td><input class="cte-entrada" data-k="cidade" value="${esc(l.cidade ? l.cidade.replace(/\/[A-Z]{2}$/, '') : '')}" placeholder="estado todo" /></td>
    <td><input class="cte-entrada" data-k="peso_ate" value="${l.peso_ate == null ? '' : num(l.peso_ate, 0)}" placeholder="qualquer" style="width:80px;" /></td>
    <td><input class="cte-entrada" data-k="custo_percentual" value="${l.custo_percentual ? num(l.custo_percentual) : ''}" style="width:70px;" /></td>
    <td><input class="cte-entrada" data-k="custo_kg" value="${l.custo_kg ? num(l.custo_kg, 4) : ''}" style="width:80px;" /></td>
    <td><input class="cte-entrada" data-k="custo_fixo" value="${l.custo_fixo ? num(l.custo_fixo) : ''}" style="width:80px;" /></td>
    <td><input class="cte-entrada" data-k="custo_minimo" value="${l.custo_minimo ? num(l.custo_minimo) : ''}" style="width:80px;" /></td>
    <td><input class="cte-entrada" data-k="prazo_dias" type="number" min="0" value="${l.prazo_dias ?? ''}" style="width:64px;" /></td>
    <td><button class="btn btn-secundario" data-pt-tirar style="width:auto; padding:4px 8px;">✕</button></td></tr>`;
  function ligarOutraAba(id, p, aba) {
    const reabrir = (a = aba) => { abrir(id, a).catch(erro); carregar().catch(erro); };
    if (aba === 'desempenho') $('pdVer')?.addEventListener('click', () => { filtroDesempenho[id] = { de: $('pdDe').value, ate: $('pdAte').value }; abrir(id, 'desempenho').catch(erro); });
    if (aba === 'tabela') {
      const ligar = () => document.querySelectorAll('[data-pt-tirar]').forEach((b) => { b.onclick = () => b.closest('tr').remove(); });
      ligar();
      $('ptMais').addEventListener('click', () => { const ult = [...document.querySelectorAll('[data-pt-linha] [data-k="uf"]')].pop()?.value; document.querySelector('#ptTabela tbody').insertAdjacentHTML('beforeend', linhaTabela({ uf: ult })); ligar(); });
      $('ptSalvar').addEventListener('click', async () => {
        const linhas = [...document.querySelectorAll('[data-pt-linha]')].map((tr) => Object.fromEntries([...tr.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value]))).filter((l) => l.uf || l.cidade);
        try { const r = await enviar(`/${id}/tabela`, 'PUT', { linhas }); mostrarAlerta(`Tabela salva: ${r.linhas.length} linha(s).`, { tipo: 'sucesso' }); reabrir(); } catch (err) { erro(err); }
      });
    }
    if (aba === 'documentos') {
      document.querySelectorAll('[data-pd-editar]').forEach((b) => b.addEventListener('click', () => {
        const x = JSON.parse(b.dataset.pdEditar);
        $('pdTipo').value = x.tipo; $('pdNumero').value = x.numero || ''; $('pdValidade').value = ''; $('pdAviso').value = x.aviso_dias || 30; $('pdObs').value = x.observacao || ''; $('pdValidade').focus();
      }));
      document.querySelectorAll('[data-pd-apagar]').forEach((b) => b.addEventListener('click', async () => {
        if (!await confirmar('Apagar este documento?', { tipo: 'perigo', textoOk: 'Apagar' })) return;
        try { await api(`/documentos/${b.dataset.pdApagar}`, { method: 'DELETE' }); reabrir(); } catch (err) { erro(err); }
      }));
      $('pdSalvar').addEventListener('click', async () => {
        try { await enviar(`/${id}/documentos`, 'POST', { tipo: $('pdTipo').value, numero: $('pdNumero').value, validade: $('pdValidade').value, aviso_dias: $('pdAviso').value, observacao: $('pdObs').value }); mostrarAlerta('Documento salvo.', { tipo: 'sucesso' }); reabrir(); } catch (err) { erro(err); }
      });
    }
    if (aba === 'avaliacoes') {
      $('paAvaliarGeral').addEventListener('click', () => avaliar(id, null, null));
      document.querySelectorAll('[data-pv-apagar]').forEach((b) => b.addEventListener('click', async () => {
        if (!await confirmar('Apagar esta avaliação?', { tipo: 'perigo', textoOk: 'Apagar' })) return;
        try { await api(`/avaliacoes/${b.dataset.pvApagar}`, { method: 'DELETE' }); reabrir(); } catch (err) { erro(err); }
      }));
    }
    if (aba === 'bloqueio') {
      $('pbBloquear')?.addEventListener('click', async () => {
        if (!await confirmar(`Bloquear ${p.fantasia || p.nome}? Ele não recebe cargas até ser liberado pelo administrador.`, { tipo: 'perigo', textoOk: 'Bloquear' })) return;
        try { await enviar(`/${id}/bloquear`, 'POST', { motivo: $('pbMotivo').value }); mostrarAlerta('Parceiro bloqueado.', { tipo: 'sucesso' }); reabrir(); } catch (err) { erro(err); }
      });
      $('pbLiberar')?.addEventListener('click', async () => {
        try { await enviar(`/${id}/liberar`, 'POST', { motivo: $('pbMotivo').value }); mostrarAlerta('Parceiro liberado.', { tipo: 'sucesso' }); reabrir(); } catch (err) { erro(err); }
      });
    }
  }
  // Nota de 1 a 5 (de uma carga ou do parceiro em geral).
  function avaliar(id, cteId, rotulo) {
    let nota = 0;
    $('paModal').innerHTML = `${cab(`⭐ Avaliar ${rotulo ? `a entrega do CT-e ${esc(rotulo)}` : 'o parceiro'}`)}
      <div id="pvEstrelas" style="font-size:34px; cursor:pointer; color:#f59e0b; letter-spacing:4px; margin:6px 0 12px;">${[1, 2, 3, 4, 5].map((n) => `<span data-n="${n}" style="opacity:.3;">★</span>`).join('')}</div>
      <div class="campo"><label for="pvComentario">Comentário (obrigatório em nota 1 ou 2)</label><textarea id="pvComentario" class="cte-entrada" rows="3" maxlength="500" placeholder="Ex.: entregou no prazo, mercadoria sem avaria, canhoto legível"></textarea></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" id="pvVoltar" style="width:auto;">Voltar</button><button class="btn btn-primario" id="pvSalvar" style="width:auto;">Salvar avaliação</button></div>`;
    document.querySelectorAll('#pvEstrelas [data-n]').forEach((e) => e.addEventListener('click', () => { nota = Number(e.dataset.n); document.querySelectorAll('#pvEstrelas [data-n]').forEach((x) => { x.style.opacity = Number(x.dataset.n) <= nota ? '1' : '.3'; }); }));
    $('pvVoltar').addEventListener('click', () => abrir(id, cteId ? 'cargas' : 'avaliacoes').catch(erro));
    $('pvSalvar').addEventListener('click', async () => {
      try { await enviar(`/${id}/avaliacoes`, 'POST', { cte_id: cteId, nota, comentario: $('pvComentario').value }); mostrarAlerta('Avaliação salva.', { tipo: 'sucesso' }); abrir(id, 'avaliacoes').catch(erro); carregar().catch(erro); } catch (err) { erro(err); }
    });
  }

  function lancamento(id, tipos) {
    $('paModal').innerHTML = `${cab('＋ Lançamento na conta do parceiro')}
      <div class="oc-form"><div class="campo"><label for="plTipo">Tipo</label><select id="plTipo" class="cte-entrada">${Object.entries(tipos).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
        <div class="campo"><label for="plValor">Valor (R$)</label><input id="plValor" class="cte-entrada" /></div>
        <div class="campo"><label for="plData">Data</label><input id="plData" type="date" class="cte-entrada" value="${hoje()}" /></div>
        <div class="campo"><label for="plCte">Nº do CT-e (opcional)</label><input id="plCte" class="cte-entrada" /></div>
        <div class="campo inteiro"><label for="plDesc">Descrição</label><input id="plDesc" class="cte-entrada" maxlength="300" placeholder="Ex.: frete FOB recebido pelo parceiro no destino" /></div></div>
      <p class="edi-dica">Custo e recebido do parceiro aumentam o que a empresa deve; pagamento ao parceiro e frete que ele recebeu (e ficou com ele) diminuem. No ajuste, use valor negativo para diminuir.</p>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-pa-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="plSalvar" style="width:auto;">Lançar</button></div>`;
    $('plSalvar').addEventListener('click', async () => {
      try { await enviar(`/${id}/lancamentos`, 'POST', { tipo: $('plTipo').value, valor: $('plValor').value, data: $('plData').value, cte: $('plCte').value, descricao: $('plDesc').value }); abrir(id, 'conta').catch(erro); carregar().catch(erro); } catch (err) { erro(err); }
    });
  }

  // Repasse (chamado pela tela de Ocorrências com os CT-e marcados).
  window.nexoParceiros = {
    async repassar(ctes, aoTerminar) {
      if (!dados) dados = await api('');
      const s = await enviar('/sugestao', 'POST', { ctes });
      if (!s.parceiros.length) { mostrarAlerta('Cadastre os parceiros primeiro em Operação › Parceiros e redespacho.', { tipo: 'aviso' }); return; }
      const sugeridos = new Set(s.por_destino.flatMap((d) => d.parceiros.map((p) => p.id)));
      const livre = (p) => !p.bloqueado && !p.impedido;
      const ordem = [...s.parceiros].sort((a, b) => (livre(b) - livre(a)) || (sugeridos.has(b.id) - sugeridos.has(a.id)) || ((b.nota_geral ?? -1) - (a.nota_geral ?? -1)) || a.nome.localeCompare(b.nome));
      const primeiro = ordem.find(livre) || (s.admin ? ordem.find((p) => !p.bloqueado) : null);
      modal.classList.remove('oculto');
      $('paModal').innerHTML = `${cab(`🤝 Repassar ${ctes.length} CT-e a um parceiro`)}
        <p style="font-size:13px; margin:0 0 8px;">Destinos: ${s.por_destino.map((d) => `<b>${esc(d.destino)}</b>${d.parceiros.length ? ` (atende: ${d.parceiros.map((p) => esc(p.nome)).join(', ')})` : ' <span style="color:var(--vermelho);">nenhum parceiro cadastrado para este destino</span>'}`).join(' · ')} · frete ${brl(s.frete)}</p>
        <table class="edi-tabela"><thead><tr><th></th><th>Parceiro</th><th class="n">Custo previsto</th><th class="n">Margem do frete</th><th class="n">Prazo</th><th class="n">Pontualidade</th><th>Nota</th></tr></thead><tbody>
        ${ordem.map((p) => { const travado = p.bloqueado || (p.impedido && !s.admin); return `<tr${travado ? ' style="opacity:.55;"' : ''}><td><input type="radio" name="paEscolha" value="${p.id}" ${p === primeiro ? 'checked' : ''} ${travado ? 'disabled' : ''} data-impedido="${p.impedido && !p.bloqueado ? 1 : ''}" /></td>
          <td><b>${esc(p.nome)}</b>${sugeridos.has(p.id) ? ' <span class="oc-sit entregue">atende o destino</span>' : ''}${p.bloqueado ? ' <span class="oc-sit devolvido">🚫 Bloqueado</span>' : p.impedido ? ` <span class="oc-sit ocorrencia" title="${esc(p.impedido)}">📄 ${esc(p.impedido)}</span>` : ''}
          ${p.servicos?.length ? `<br><small style="color:var(--texto-fraco);">${p.servicos.map((x) => esc(s.servicos[x] || x)).join(' · ')}</small>` : ''}</td>
          <td class="n">${brl(p.custo_previsto)}${p.pela_tabela ? '<br><small style="color:var(--texto-fraco);">pela tabela</small>' : ''}</td><td class="n">${s.frete ? `${num(((s.frete - p.custo_previsto) / s.frete) * 100, 1)}%` : '—'}</td><td class="n">${p.prazo_dias ? `+${p.prazo_dias} dia(s)` : '—'}</td>
          <td class="n" style="color:${corPont(p.pontualidade)};">${pct(p.pontualidade)}</td><td>${estrelas(p.nota_geral)}</td></tr>`; }).join('')}</tbody></table>
        <p class="edi-dica">Ao confirmar: os CT-e ficam como "Entregue ao redespacho", o custo previsto entra na conta do parceiro e sai um código para ele dar baixa pelo app.</p>
        <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-pa-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="paConfirmar" style="width:auto;">Repassar</button></div>`;
      $('paConfirmar').addEventListener('click', async (e) => {
        const botao = e.currentTarget; botao.disabled = true;
        const escolhido = document.querySelector('[name="paEscolha"]:checked');
        if (!escolhido) { botao.disabled = false; mostrarAlerta('Nenhum parceiro liberado para receber estas cargas.', { tipo: 'aviso' }); return; }
        const pid = Number(escolhido.value);
        let forcar = false;
        if (escolhido.dataset.impedido) {
          if (!await confirmar('Este parceiro está com documento obrigatório vencido. Liberar este repasse mesmo assim? (fica registrado na auditoria)', { tipo: 'perigo', textoOk: 'Liberar e repassar' })) { botao.disabled = false; return; }
          forcar = true;
        }
        try {
          const r = await enviar(`/${pid}/repassar`, 'POST', { ctes, forcar });
          $('paModal').innerHTML = `${cab('✓ Cargas repassadas')}<p>${r.ctes} CT-e entregue(s) a <b>${esc(r.parceiro)}</b> · custo previsto ${brl(r.custo_previsto)}.</p>
            <div class="cte-aviso">Mande ao parceiro o link do app para ele dar baixa nas entregas (com foto do canhoto):<br><b>${esc(linkApp(r.codigo))}</b> · código <b style="letter-spacing:2px;">${esc(r.codigo)}</b>
            <br><a href="#" id="paCopiarNovo">copiar link</a></div>
            <div style="display:flex; justify-content:flex-end; margin-top:12px;"><button class="btn btn-primario" data-pa-fechar style="width:auto;">Fechar</button></div>`;
          $('paCopiarNovo').addEventListener('click', async (ev) => { ev.preventDefault(); try { await navigator.clipboard.writeText(linkApp(r.codigo)); mostrarAlerta('Link copiado.', { tipo: 'sucesso' }); } catch { mostrarAlerta(linkApp(r.codigo)); } });
          aoTerminar?.();
        } catch (err) { erro(err); botao.disabled = false; }
      });
    },
  };
})();
