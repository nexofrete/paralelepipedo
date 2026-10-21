// =====================================================================
// Parceiros e redespacho: cadastro (área atendida e custo), as cargas
// repassadas a cada parceiro e a conta-corrente com o acerto.
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
  window.Doc?.registrar('#pfDoc', { razao_social: '#pfNome', nome_fantasia: '#pfFantasia', telefone: '#pfFone', email: '#pfEmail' });

  let dados = null;
  async function carregar() {
    dados = await api('');
    const ps = dados.parceiros;
    $('paConteudo').innerHTML = ps.length ? `<div class="painel oc-painel"><div class="edi-rolagem"><table class="edi-tabela"><thead><tr><th>Parceiro</th><th>Atende</th><th>Custo</th><th class="n">Prazo</th><th class="n">Cargas em aberto</th><th class="n">Saldo da conta</th><th></th></tr></thead><tbody>
      ${ps.map((p) => `<tr${p.ativo ? '' : ' style="opacity:.55;"'}><td><b>${esc(p.fantasia || p.nome)}</b><br><small style="color:var(--texto-fraco);">${esc(p.nome)}${p.contato_nome ? ` · ${esc(p.contato_nome)}` : ''}${p.telefone ? ` · ${esc(p.telefone)}` : ''}</small></td>
        <td><small>${p.ufs.length ? `<b>${esc(p.ufs.join(', '))}</b> (estado todo)` : ''}${p.ufs.length && p.cidades.length ? '<br>' : ''}${p.cidades.length ? `${esc(p.cidades.slice(0, 4).join(', '))}${p.cidades.length > 4 ? ` +${p.cidades.length - 4}` : ''}` : ''}</small></td>
        <td><small>${[p.custo_percentual ? `${num(p.custo_percentual)}% do frete` : '', p.custo_kg ? `${num(p.custo_kg, 4)}/kg` : '', p.custo_fixo ? `${brl(p.custo_fixo)} por CT-e` : '', p.custo_minimo ? `mín. ${brl(p.custo_minimo)}` : ''].filter(Boolean).join(' + ') || '—'}</small></td>
        <td class="n">${p.prazo_dias ? `+${p.prazo_dias} dia(s)` : '—'}</td>
        <td class="n">${p.em_aberto}${p.atrasados ? `<br><small style="color:var(--vermelho);">${p.atrasados} atrasada(s)</small>` : ''}</td>
        <td class="n"><b style="color:${p.saldo > 0 ? '#dc2626' : p.saldo < 0 ? 'var(--verde)' : 'inherit'};">${brl(Math.abs(p.saldo))}</b><br><small style="color:var(--texto-fraco);">${p.saldo > 0 ? 'a pagar ao parceiro' : p.saldo < 0 ? 'o parceiro deve' : 'zerado'}</small></td>
        <td><div class="oc-linha-acoes"><button class="primario" data-pa-abrir="${p.id}">Abrir</button><button data-pa-editar="${p.id}">Editar</button></div></td></tr>`).join('')}</tbody></table></div></div>
      <p class="edi-dica" style="margin-top:10px;">Para repassar cargas: em <b>Ocorrências de entrega</b>, marque os CT-e e clique em <b>🤝 Repassar a parceiro</b>. O sistema sugere o parceiro pelo destino, lança o custo previsto na conta dele e gera o código do app para ele dar baixa nas entregas.</p>`
      : '<div class="kanban-vazio">Nenhum parceiro. Cadastre os agentes e transportadoras que entregam onde você não tem filial (＋ Parceiro).</div>';
    document.querySelectorAll('[data-pa-abrir]').forEach((b) => b.addEventListener('click', () => abrir(Number(b.dataset.paAbrir)).catch(erro)));
    document.querySelectorAll('[data-pa-editar]').forEach((b) => b.addEventListener('click', () => form(ps.find((p) => p.id === Number(b.dataset.paEditar)))));
  }
  nav.addEventListener('click', () => carregar().catch(erro));
  $('paNovo').addEventListener('click', () => (dados ? Promise.resolve() : carregar()).then(() => form(null)).catch(erro));

  function form(p) {
    const v = p || { ufs: [], cidades: [], ativo: true };
    const campo = (id, rotulo, valor, extra = '', classe = '') => `<div class="campo ${classe}"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;
    modal.classList.remove('oculto');
    $('paModal').innerHTML = `${cab(p ? `Editar — ${esc(p.nome)}` : '＋ Novo parceiro')}
      <div class="oc-form">${campo('pfDoc', 'CNPJ/CPF', v.documento)}${campo('pfNome', 'Razão social', v.nome)}${campo('pfFantasia', 'Nome fantasia', v.fantasia)}${campo('pfRntrc', 'RNTRC', v.rntrc)}
        ${campo('pfContato', 'Contato', v.contato_nome)}${campo('pfFone', 'Telefone', v.telefone)}${campo('pfEmail', 'E-mail', v.email)}${campo('pfPix', 'Chave PIX (para o acerto)', v.pix)}</div>
      <h4 style="margin:12px 0 4px;">Onde entrega</h4>
      <div class="campo"><label>Estados inteiros</label><div class="pa-ufs">${dados.ufs.map((u) => `<label><input type="checkbox" data-pf-uf="${u}" ${v.ufs.includes(u) ? 'checked' : ''} /> ${u}</label>`).join('')}</div></div>
      <div class="campo"><label for="pfCidades">Cidades (uma por linha: Cidade/UF)</label><textarea id="pfCidades" class="cte-entrada" rows="4" placeholder="Juiz de Fora/MG&#10;Volta Redonda/RJ">${esc(v.cidades.join('\n'))}</textarea></div>
      <h4 style="margin:12px 0 4px;">Quanto ele cobra (custo previsto por CT-e)</h4>
      <div class="oc-form">${campo('pfPct', '% do frete', v.custo_percentual ? num(v.custo_percentual) : '')}${campo('pfKg', 'R$ por kg', v.custo_kg ? num(v.custo_kg, 4) : '')}${campo('pfFixo', 'R$ fixo por CT-e', v.custo_fixo ? num(v.custo_fixo) : '')}${campo('pfMin', 'Mínimo por CT-e (R$)', v.custo_minimo ? num(v.custo_minimo) : '')}
        ${campo('pfPrazo', 'Prazo dele (dias a mais na previsão)', v.prazo_dias || '', 'type="number" min="0"')}
        <label class="ag-check" style="align-self:end; margin-bottom:10px;"><input type="checkbox" id="pfAtivo" ${v.ativo ? 'checked' : ''} /> Ativo</label>
        <div class="campo inteiro"><label for="pfObs">Observação</label><input id="pfObs" class="cte-entrada" value="${esc(v.observacao || '')}" /></div></div>
      <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-pa-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="pfSalvar" style="width:auto;">Salvar</button></div>`;
    $('pfSalvar').addEventListener('click', async () => {
      const corpo = { documento: $('pfDoc').value, nome: $('pfNome').value, fantasia: $('pfFantasia').value, rntrc: $('pfRntrc').value, contato_nome: $('pfContato').value, telefone: $('pfFone').value,
        email: $('pfEmail').value, pix: $('pfPix').value, ufs: [...document.querySelectorAll('[data-pf-uf]:checked')].map((x) => x.dataset.pfUf), cidades: $('pfCidades').value,
        custo_percentual: $('pfPct').value, custo_kg: $('pfKg').value, custo_fixo: $('pfFixo').value, custo_minimo: $('pfMin').value, prazo_dias: $('pfPrazo').value, ativo: $('pfAtivo').checked, observacao: $('pfObs').value };
      try { await (p ? enviar(`/${p.id}`, 'PUT', corpo) : enviar('', 'POST', corpo)); fechar(); mostrarAlerta('Parceiro salvo.', { tipo: 'sucesso' }); carregar().catch(erro); } catch (err) { erro(err); }
    });
  }

  async function abrir(id, aba = 'cargas') {
    const x = await api(`/${id}/extrato?status=${aba === 'historico' ? 'todos' : 'aberto'}`);
    const p = x.parceiro;
    const abas = [['cargas', `🚚 Cargas (${x.cargas.filter((c) => !['entregue', 'devolvido'].includes(c.situacao_entrega)).length} em aberto)`], ['conta', `💰 Conta-corrente (${brl(Math.abs(x.saldo))})`], ['historico', '🧾 Histórico e acertos']];
    let corpo = '';
    if (aba === 'cargas') {
      const codigos = [...new Map(x.cargas.filter((c) => c.romaneio_status !== 'fechado').map((c) => [c.romaneio_id, c.codigo_acesso])).entries()];
      corpo = `${codigos.length ? `<div class="cte-aviso" style="margin-bottom:10px;">📱 O parceiro dá baixa pelo app: ${codigos.map(([r, c]) => `romaneio ${r}: código <b>${esc(c)}</b> <a href="#" data-pa-copiar="${esc(c)}">copiar link</a>`).join(' · ')}</div>` : ''}
        ${x.cargas.length ? `<table class="edi-tabela"><thead><tr><th>CT-e</th><th>Destinatário</th><th>Destino</th><th>Previsão</th><th>Situação</th></tr></thead><tbody>
        ${x.cargas.map((c) => `<tr><td><b>${esc(c.serie)}/${esc(c.numero)}</b></td><td>${esc(c.destinatario_nome || '')}</td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td>
          <td>${dia(c.previsao_entrega)}${!['entregue', 'devolvido'].includes(c.situacao_entrega) && c.previsao_entrega < hoje() ? ' <small style="color:var(--vermelho);">atrasada</small>' : ''}</td>
          <td><span class="oc-sit ${esc(c.situacao_entrega)}">${esc(SIT[c.situacao_entrega] || c.situacao_entrega)}</span>${c.data_entrega ? `<br><small>${new Date(c.data_entrega).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>` : ''}</td></tr>`).join('')}</tbody></table>`
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
    $('paModal').innerHTML = `${cab(`🤝 ${esc(p.fantasia || p.nome)}`)}<div class="cte-abas" style="margin-bottom:10px;">${abas.map(([k, t]) => `<div class="cte-aba ${aba === k ? 'ativo' : ''}" data-pa-aba="${k}">${t}</div>`).join('')}</div>${corpo}`;
    document.querySelectorAll('[data-pa-aba]').forEach((a) => a.addEventListener('click', () => abrir(id, a.dataset.paAba).catch(erro)));
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
      const ordem = [...s.parceiros].sort((a, b) => (sugeridos.has(b.id) - sugeridos.has(a.id)) || a.nome.localeCompare(b.nome));
      modal.classList.remove('oculto');
      $('paModal').innerHTML = `${cab(`🤝 Repassar ${ctes.length} CT-e a um parceiro`)}
        <p style="font-size:13px; margin:0 0 8px;">Destinos: ${s.por_destino.map((d) => `<b>${esc(d.destino)}</b>${d.parceiros.length ? ` (atende: ${d.parceiros.map((p) => esc(p.nome)).join(', ')})` : ' <span style="color:var(--vermelho);">nenhum parceiro cadastrado para este destino</span>'}`).join(' · ')} · frete ${brl(s.frete)}</p>
        <table class="edi-tabela"><thead><tr><th></th><th>Parceiro</th><th class="n">Custo previsto</th><th class="n">Margem do frete</th><th class="n">Prazo</th></tr></thead><tbody>
        ${ordem.map((p, i) => `<tr><td><input type="radio" name="paEscolha" value="${p.id}" ${i === 0 ? 'checked' : ''} /></td><td><b>${esc(p.nome)}</b>${sugeridos.has(p.id) ? ' <span class="oc-sit entregue">atende o destino</span>' : ''}</td>
          <td class="n">${brl(p.custo_previsto)}</td><td class="n">${s.frete ? `${num(((s.frete - p.custo_previsto) / s.frete) * 100, 1)}%` : '—'}</td><td class="n">${p.prazo_dias ? `+${p.prazo_dias} dia(s)` : '—'}</td></tr>`).join('')}</tbody></table>
        <p class="edi-dica">Ao confirmar: os CT-e ficam como "Entregue ao redespacho", o custo previsto entra na conta do parceiro e sai um código para ele dar baixa pelo app.</p>
        <div style="display:flex; justify-content:flex-end; gap:10px;"><button class="btn btn-secundario" data-pa-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="paConfirmar" style="width:auto;">Repassar</button></div>`;
      $('paConfirmar').addEventListener('click', async (e) => {
        const botao = e.currentTarget; botao.disabled = true;
        const pid = Number(document.querySelector('[name="paEscolha"]:checked').value);
        try {
          const r = await enviar(`/${pid}/repassar`, 'POST', { ctes });
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
