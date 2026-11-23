// =====================================================================
// Pessoas (RH): Painel de férias (270), Programação de férias (271) e Funcionários (272). Regras em src/ferias.js.
// Usa do dashboard.js: apiFetch, mostrarAlerta, confirmar.
// =====================================================================
(() => {
  const nav = document.getElementById('navFerias');
  const cont = document.getElementById('feConteudo');
  if (!nav || !cont) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const D = (s) => new Date(`${String(s).slice(0, 10)}T12:00:00`);
  const br = (s) => (s ? D(s).toLocaleDateString('pt-BR') : '—');
  const brc = (s) => (s ? D(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
  const somaDias = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (c, op = {}) => { const r = await apiFetch(`/api/ferias${c}`, { ...op, headers: { 'Content-Type': 'application/json' } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro ao falar com o servidor.'), { status: r.status }); return j; };
  const post = (c, b, m = 'POST') => api(c, { method: m, body: JSON.stringify(b || {}) });
  const COR = { Vencidas: 'cancelado', Vencendo: 'ocorrencia', 'A programar': 'pendente', Programadas: 'em_transito', 'Em aquisição': '', Gozadas: 'entregue',
    'Em férias': 'em_transito', Programada: 'pendente', Aprovada: 'entregue', 'Concluída': '', Cancelada: 'cancelado' };
  const sit = (s) => `<span class="oc-sit ${COR[s] || ''}">${esc(s)}</span>`;
  const CORBARRA = { 'Em férias': '#2563eb', Programada: '#d97706', Aprovada: '#16a34a', 'Concluída': '#94a3b8' };
  let aba = 'painel'; let dados = null; let depto = '';

  // Só aparece para quem pode ver dados de pessoas (o servidor confere de novo).
  api('/config').then(() => nav.classList.remove('oculto')).catch(() => {});
  document.querySelectorAll('[data-fe-aba]').forEach((a) => a.addEventListener('click', () => { aba = a.dataset.feAba; document.querySelectorAll('[data-fe-aba]').forEach((x) => x.classList.toggle('ativo', x === a)); desenhar().catch(erro); }));
  nav.addEventListener('click', () => desenhar().catch(erro));
  async function desenhar() {
    dados = await api('/');
    if (aba === 'programacao') return desenharProgramacao();
    if (aba === 'funcionarios') return desenharFuncionarios();
    return desenharPainel();
  }

  function janela(html, largura = 760) {
    let m = $('modalFerias');
    if (!m) {
      m = document.createElement('div'); m.className = 'modal-overlay'; m.id = 'modalFerias';
      m.innerHTML = '<div class="painel modal-card" style="width:100%; max-height:94vh; overflow-y:auto; padding:22px 24px;" id="feModal"></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-fe-fechar]')) m.classList.add('oculto'); });
    }
    m.classList.remove('oculto'); $('feModal').style.maxWidth = `${largura}px`; $('feModal').innerHTML = html; return $('feModal');
  }
  const fechar = () => $('modalFerias')?.classList.add('oculto');
  const cab = (t) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;"><h3 style="margin:0;">${t}</h3><span style="cursor:pointer; font-size:18px;" data-fe-fechar>✕</span></div>`;
  const abrirHtml = async (url) => { const w = window.open('', '_blank'); try { const r = await apiFetch(url); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não foi possível montar.'); const h = await r.text(); if (w) { w.document.write(h); w.document.close(); } } catch (e) { w?.close(); erro(e); } };

  // ================= Painel =================
  function desenharPainel() {
    const d = dados; const a = d.avisos; const dias = d.config.dias_aviso;
    const lista = (ls, fn, vazio) => (ls.length ? `<ul style="margin:6px 0 0; padding-left:18px;">${ls.map((f) => `<li style="margin:4px 0;">${fn(f)}</li>`).join('')}</ul>` : `<div style="color:var(--texto-fraco); font-size:13px; margin-top:6px;">${vazio}</div>`);
    cont.innerHTML = `
      <div class="nf-resumo">
        <div>De férias hoje<b>${a.em_ferias.length}</b><span>&nbsp;</span></div>
        <div>Entram nos próximos ${dias} dias<b>${a.saem.length}</b><span>&nbsp;</span></div>
        <div>Voltam nos próximos ${dias} dias<b>${a.voltam.length}</b><span>&nbsp;</span></div>
        <div class="${a.aviso_pendente.length ? 'ex-alerta' : ''}">Aviso de férias a entregar<b>${a.aviso_pendente.length}</b><span>30 dias antes do início</span></div>
        <div class="${a.vencidas.length ? 'ex-alerta' : ''}">Férias vencidas<b>${a.vencidas.length}</b><span>pagamento em dobro</span></div>
        <div>Vencendo (até 90 dias)<b>${a.vencendo.length}</b><span>programe antes do limite</span></div></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; margin:12px 0;">
        <div class="painel" style="padding:12px 14px;"><h4 style="margin:0;">🏖 Saindo de férias</h4>${lista(a.saem, (f) => `<b>${esc(f.nome)}</b> em ${br(f.inicio)}${f.inicio === d.hoje ? ' <b>(hoje)</b>' : ''} · ${f.dias} dias · volta ${br(somaDias(f.fim, 1))}`, `Ninguém nos próximos ${dias} dias.`)}</div>
        <div class="painel" style="padding:12px 14px;"><h4 style="margin:0;">👋 Voltando</h4>${lista(a.voltam, (f) => `<b>${esc(f.nome)}</b> volta ${br(somaDias(f.fim, 1))}${somaDias(f.fim, 1) === d.hoje ? ' <b>(hoje)</b>' : ''}`, `Ninguém nos próximos ${dias} dias.`)}</div>
        <div class="painel" style="padding:12px 14px;"><h4 style="margin:0;">🌴 De férias agora</h4>${lista(a.em_ferias, (f) => `<b>${esc(f.nome)}</b> até ${br(f.fim)}`, 'Ninguém.')}</div>
        <div class="painel" style="padding:12px 14px;"><h4 style="margin:0;">📝 Aviso a entregar</h4>${lista(a.aviso_pendente, (f) => `<b>${esc(f.nome)}</b>: férias em ${br(f.inicio)} <a href="#" data-fe-aviso="${f.id}">imprimir</a>`, 'Nenhum.')}</div></div>
      <div class="painel" style="padding:0; overflow-x:auto;"><div style="display:flex; align-items:center; gap:10px; padding:12px 14px;"><h4 style="margin:0;">Funcionários e saldo de férias</h4><span style="flex:1;"></span>
          <button class="btn btn-primario" style="width:auto;" id="feNovaFerias">＋ Programar férias</button></div>
        <table class="tabela"><thead><tr><th>Funcionário</th><th>Admissão</th><th>Período pendente</th><th>Saldo</th><th>Programar até</th><th>Situação</th><th>Próximas férias</th><th></th></tr></thead><tbody>
        ${d.funcionarios.length ? d.funcionarios.map((f) => { const p = f.periodo_alvo; return `<tr><td><b>${esc(f.nome)}</b><br><small style="color:var(--texto-fraco);">${esc([f.cargo, f.departamento].filter(Boolean).join(' · '))}</small></td>
          <td>${br(f.admissao)}</td><td>${p ? `${br(p.inicio)} a ${br(p.fim)}` : '—'}</td><td><b>${f.saldo_total}</b> dia(s)${f.em_ferias ? '<br><small>de férias agora</small>' : ''}</td>
          <td>${p && p.completo ? `${br(p.concessivo_fim)}${p.dias_limite < 0 ? '<br><small class="pa-alerta">vencido</small>' : p.dias_limite <= 90 ? `<br><small>faltam ${p.dias_limite} d</small>` : ''}` : '—'}</td>
          <td>${sit(f.situacao)}</td><td>${f.proxima ? `${br(f.proxima.inicio)} a ${br(f.proxima.fim)}` : '—'}</td>
          <td><button class="btn btn-secundario pa-mini" data-fe-programar="${f.id}">Programar</button></td></tr>`; }).join('')
          : '<tr><td colspan="8" style="text-align:center; padding:22px; color:var(--texto-fraco);">Cadastre os funcionários na aba Funcionários (com a data de admissão).</td></tr>'}
        </tbody></table></div>
      <div class="painel" style="margin-top:12px; padding:14px 16px;"><h4 style="margin:0 0 8px;">Avisos por e-mail</h4>
        <div style="display:grid; grid-template-columns:2fr 1fr 1fr auto; gap:10px; align-items:end;">
          <div class="campo"><label>E-mails que recebem o resumo (RH, gestores)</label><input id="feEmails" value="${esc(d.config.emails)}" placeholder="rh@empresa.com.br, gestor@empresa.com.br"></div>
          <div class="campo"><label>Avisar com quantos dias</label><input id="feDias" type="number" min="1" max="60" value="${d.config.dias_aviso}"></div>
          <div class="campo"><label><input type="checkbox" id="feDiario"${d.config.email_diario ? ' checked' : ''}> E-mail todo dia às 7h20</label></div>
          <button class="btn btn-secundario" style="width:auto;" id="feSalvarCfg">Salvar</button></div>
        <small style="color:var(--texto-fraco);">O e-mail só sai nos dias com algo a avisar: quem entra e quem volta de férias, quem está de férias, aviso a entregar, férias vencidas e vencendo. Os mesmos avisos aparecem na tela Hoje e no sino.</small></div>`;
    $('feNovaFerias').addEventListener('click', () => formFerias(null, null).catch(erro));
    cont.querySelectorAll('[data-fe-programar]').forEach((b) => b.addEventListener('click', () => formFerias(null, Number(b.dataset.feProgramar)).catch(erro)));
    cont.querySelectorAll('[data-fe-aviso]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); abrirHtml(`/api/ferias/${a.dataset.feAviso}/aviso`); }));
    $('feSalvarCfg').addEventListener('click', async () => { try { await post('/config', { emails: $('feEmails').value, dias_aviso: $('feDias').value, email_diario: $('feDiario').checked }, 'PUT'); mostrarAlerta('Avisos salvos.', { tipo: 'sucesso' }); await desenhar(); } catch (e) { erro(e); } });
  }

  // ================= Programação (calendário de 12 meses) =================
  function desenharProgramacao() {
    const d = dados;
    const hoje = D(d.hoje); const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1); const fim = new Date(ini.getFullYear(), ini.getMonth() + 12, 0);
    const total = (fim - ini) / 86400000 + 1;
    const pos = (s) => Math.max(0, Math.min(100, ((D(s) - ini) / 86400000 / total) * 100));
    const meses = Array.from({ length: 12 }, (_, i) => new Date(ini.getFullYear(), ini.getMonth() + i, 1));
    const deptos = [...new Set(d.funcionarios.map((f) => f.departamento || 'Sem departamento'))].sort();
    const fs = d.funcionarios.filter((f) => !depto || (f.departamento || 'Sem departamento') === depto);
    const ferias = d.ferias.filter((f) => f.situacao !== 'Cancelada');
    // Sobreposições no mesmo departamento (dias em que 2 ou mais estão fora).
    const sobre = [];
    deptos.forEach((dp) => {
      const fe = ferias.filter((f) => (f.departamento || 'Sem departamento') === dp && f.fim >= d.hoje);
      for (let i = 0; i < fe.length; i += 1) for (let j = i + 1; j < fe.length; j += 1) if (!(fe[i].fim < fe[j].inicio || fe[i].inicio > fe[j].fim)) sobre.push(`${dp}: ${fe[i].nome} e ${fe[j].nome} (${brc(fe[i].inicio > fe[j].inicio ? fe[i].inicio : fe[j].inicio)} a ${brc(fe[i].fim < fe[j].fim ? fe[i].fim : fe[j].fim)})`);
    });
    const proximas = d.ferias.filter((f) => f.fim >= somaDias(d.hoje, -30)).sort((a, b) => a.inicio.localeCompare(b.inicio));
    cont.innerHTML = `<div class="pa-topo"><label style="font-size:13px;">Departamento <select id="feDepto"><option value="">Todos</option>${deptos.map((x) => `<option${x === depto ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <span style="flex:1;"></span><span style="font-size:12px;">${Object.entries(CORBARRA).map(([k, c]) => `<span style="display:inline-block; width:10px; height:10px; background:${c}; border-radius:2px; margin:0 4px 0 10px;"></span>${k}`).join('')}</span>
        <button class="btn btn-primario" style="width:auto;" id="feNovaFerias">＋ Programar férias</button></div>
      ${sobre.length ? `<div class="cte-aviso" style="margin-top:10px;"><b>Férias ao mesmo tempo no mesmo departamento:</b> ${sobre.slice(0, 6).map(esc).join(' · ')}${sobre.length > 6 ? ` e mais ${sobre.length - 6}` : ''}</div>` : ''}
      <div class="painel" style="margin-top:12px; overflow-x:auto;"><div style="min-width:900px;">
        <div style="display:grid; grid-template-columns:200px 1fr; font-size:12px; color:var(--texto-fraco); border-bottom:1px solid var(--borda); padding-bottom:4px;">
          <div></div><div style="display:grid; grid-template-columns:repeat(12, 1fr);">${meses.map((m) => `<div style="text-align:center; text-transform:capitalize;">${m.toLocaleDateString('pt-BR', { month: 'short' })}${m.getMonth() === 0 || m === meses[0] ? `/${String(m.getFullYear()).slice(2)}` : ''}</div>`).join('')}</div></div>
        ${fs.map((fu) => `<div style="display:grid; grid-template-columns:200px 1fr; align-items:center; border-bottom:1px solid var(--borda); min-height:30px;">
          <div style="font-size:13px; padding:4px 6px;"><b>${esc(fu.nome)}</b><br><small style="color:var(--texto-fraco);">${esc(fu.departamento || '')} · saldo ${fu.saldo_total} d</small></div>
          <div style="position:relative; height:30px; background:repeating-linear-gradient(90deg, transparent 0, transparent calc(100%/12 - 1px), var(--borda) calc(100%/12 - 1px), var(--borda) calc(100%/12));">
            <div style="position:absolute; top:0; bottom:0; left:${pos(d.hoje)}%; width:2px; background:var(--vermelho);" title="Hoje"></div>
            ${ferias.filter((f) => f.funcionario_id === fu.id && f.fim >= `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, '0')}-01`).map((f) => `<div data-fe-editar="${f.id}" title="${esc(`${f.nome}: ${br(f.inicio)} a ${br(f.fim)} (${f.dias} dias) · ${f.situacao}`)}"
              style="position:absolute; top:6px; height:18px; left:${pos(f.inicio)}%; width:${Math.max(0.6, pos(somaDias(f.fim, 1)) - pos(f.inicio))}%; background:${CORBARRA[f.situacao] || '#64748b'}; border-radius:4px; cursor:pointer; color:#fff; font-size:10px; overflow:hidden; white-space:nowrap; padding:1px 4px;">${f.dias}d</div>`).join('')}
          </div></div>`).join('') || '<div style="padding:16px; color:var(--texto-fraco);">Nenhum funcionário.</div>'}
      </div></div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:12px;"><table class="tabela"><thead><tr><th>Funcionário</th><th>Período aquisitivo</th><th>Férias</th><th>Dias</th><th>Abono</th><th>Retorno</th><th>Pagar até</th><th>Aviso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${proximas.length ? proximas.map((f) => `<tr><td><b>${esc(f.nome)}</b><br><small style="color:var(--texto-fraco);">${esc(f.departamento || '')}</small></td><td>${br(f.aquisitivo_inicio)} a ${br(f.aquisitivo_fim)}</td>
        <td>${br(f.inicio)} a ${br(f.fim)}</td><td>${f.dias}</td><td>${f.abono_dias || '—'}</td><td>${br(f.retorno)}</td><td>${br(f.pagamento_ate)}</td><td>${f.aviso_em ? `entregue ${brc(f.aviso_em)}` : f.situacao === 'Cancelada' ? '—' : '<span class="pa-alerta">pendente</span>'}</td><td>${sit(f.situacao)}</td>
        <td><div style="display:flex; flex-wrap:wrap; gap:4px; min-width:170px;">${f.situacao !== 'Cancelada' ? `<button class="btn btn-secundario pa-mini" data-fe-doc="${f.id}">Aviso</button> ${!f.aviso_em ? `<button class="btn btn-secundario pa-mini" data-fe-entregue="${f.id}">Entregue</button> ` : ''}${f.status === 'programada' ? `<button class="btn btn-primario pa-mini" data-fe-aprovar="${f.id}">Aprovar</button> ` : ''}${f.situacao !== 'Concluída' ? `<button class="btn btn-secundario pa-mini" data-fe-editar="${f.id}">Editar</button> <button class="btn btn-secundario pa-mini" data-fe-cancelar="${f.id}">Cancelar</button>` : ''}` : ''}</div></td></tr>`).join('')
        : '<tr><td colspan="10" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhuma férias programada.</td></tr>'}
      </tbody></table></div>`;
    $('feDepto').addEventListener('change', (e) => { depto = e.target.value; desenharProgramacao(); });
    $('feNovaFerias').addEventListener('click', () => formFerias(null, null).catch(erro));
    cont.querySelectorAll('[data-fe-editar]').forEach((b) => b.addEventListener('click', () => { const f = d.ferias.find((x) => x.id === Number(b.dataset.feEditar)); if (f && f.situacao !== 'Concluída' && f.situacao !== 'Cancelada') formFerias(f, f.funcionario_id).catch(erro); }));
    cont.querySelectorAll('[data-fe-doc]').forEach((b) => b.addEventListener('click', () => abrirHtml(`/api/ferias/${b.dataset.feDoc}/aviso`)));
    const acao = (sel, ac, msg) => cont.querySelectorAll(sel).forEach((b) => b.addEventListener('click', async () => {
      if (msg && !await confirmar(msg, { textoOk: 'Confirmar' })) return;
      try { await post(`/${Object.values(b.dataset)[0]}/${ac}`); await desenhar(); } catch (e) { erro(e); }
    }));
    acao('[data-fe-aprovar]', 'aprovar'); acao('[data-fe-entregue]', 'aviso'); acao('[data-fe-cancelar]', 'cancelar', 'Cancelar estas férias? Os dias voltam para o saldo.');
  }

  // ================= Formulário de férias =================
  async function formFerias(f, funcId) {
    const d = dados;
    if (!d.funcionarios.length) return mostrarAlerta('Cadastre os funcionários primeiro (aba Funcionários).');
    const caixa = janela(`${cab(f ? 'Alterar férias' : 'Programar férias')}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px 14px;">
        <div class="campo" style="grid-column:1 / -1;"><label>Funcionário</label><select id="ffFunc">${d.funcionarios.map((x) => `<option value="${x.id}"${x.id === funcId ? ' selected' : ''}>${esc(x.nome)}${x.departamento ? ` · ${esc(x.departamento)}` : ''} (saldo ${x.saldo_total} d)</option>`).join('')}</select></div>
        <div class="campo" style="grid-column:1 / -1;"><label>Período aquisitivo</label><select id="ffPer"></select></div>
        <div class="campo"><label>Início</label><input id="ffIni" type="date" value="${esc(f?.inicio || '')}"></div>
        <div class="campo"><label>Dias de férias</label><input id="ffDias" type="number" min="5" max="30" value="${f?.dias || 30}"></div>
        <div class="campo"><label>Abono (dias vendidos, até 10)</label><input id="ffAbono" type="number" min="0" max="10" value="${f?.abono_dias || 0}"></div>
        <div class="campo"><label><input type="checkbox" id="ff13"${f?.adiantar_13 ? ' checked' : ''}> Adiantar a 1ª parcela do 13º</label></div>
        <div class="campo" style="grid-column:1 / -1;"><label>Observação</label><input id="ffObs" maxlength="1000" value="${esc(f?.observacao || '')}"></div></div>
      <div class="painel" id="ffPrev" style="margin-top:10px; padding:10px 14px; font-size:14px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" data-fe-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="ffOk" style="width:auto;">Salvar</button></div>`);
    const periodos = () => {
      const fu = d.funcionarios.find((x) => x.id === Number($('ffFunc').value));
      const ps = (fu?.periodos || []).filter((p) => p.saldo > 0 || (f && p.inicio === f.aquisitivo_inicio));
      $('ffPer').innerHTML = ps.map((p) => `<option value="${p.inicio}"${(f ? p.inicio === f.aquisitivo_inicio : p === ps[0]) ? ' selected' : ''}>${br(p.inicio)} a ${br(p.fim)} · saldo ${p.saldo + (f && p.inicio === f.aquisitivo_inicio ? f.dias + (f.abono_dias || 0) : 0)} d · ${esc(p.situacao)}${p.completo ? ` · programar até ${br(p.concessivo_fim)}` : ''}</option>`).join('') || '<option value="">Sem período com saldo</option>';
    };
    const previa = () => {
      const ini = $('ffIni').value; const dias = Number($('ffDias').value) || 0;
      if (!ini || !dias) { $('ffPrev').innerHTML = 'Escolha o início e os dias.'; return; }
      const fim = somaDias(ini, dias - 1); const dow = D(ini).getDay();
      $('ffPrev').innerHTML = `De <b>${br(ini)}</b> a <b>${br(fim)}</b> · volta em <b>${br(somaDias(fim, 1))}</b> · pagamento até <b>${br(somaDias(ini, -2))}</b> · aviso até <b>${br(somaDias(ini, -30))}</b>
        ${dow === 5 || dow === 6 ? '<br><span class="pa-alerta">A CLT não deixa começar na sexta nem no sábado (2 dias antes do domingo).</span>' : ''}`;
    };
    $('ffFunc').addEventListener('change', () => { periodos(); previa(); });
    ['ffIni', 'ffDias'].forEach((id) => $(id).addEventListener('input', previa));
    periodos(); previa();
    $('ffOk').addEventListener('click', async () => {
      try {
        const b = { funcionario_id: Number($('ffFunc').value), aquisitivo_inicio: $('ffPer').value, inicio: $('ffIni').value, dias: $('ffDias').value, abono_dias: $('ffAbono').value, adiantar_13: $('ff13').checked, observacao: $('ffObs').value };
        const r = f ? await post(`/${f.id}`, b, 'PUT') : await post('/', b);
        fechar();
        mostrarAlerta(`Férias salvas: de ${br(b.inicio)} a ${br(r.fim)}, volta em ${br(r.retorno)}.${r.avisos.length ? `\n\nAtenção:\n• ${r.avisos.join('\n• ')}` : ''}`, { tipo: r.avisos.length ? 'erro' : 'sucesso' });
        await desenhar();
      } catch (e) { erro(e); }
    });
    return caixa;
  }

  // ================= Funcionários =================
  async function desenharFuncionarios() {
    const fs = await api('/funcionarios?todos=1');
    cont.innerHTML = `<div class="pa-topo"><span>Cadastre cada funcionário com a data de admissão: é dela que saem os períodos de férias.</span><span style="flex:1;"></span><button class="btn btn-primario" style="width:auto;" id="fuNovo">＋ Novo funcionário</button></div>
      <div class="painel" style="padding:0; overflow-x:auto; margin-top:12px;"><table class="tabela"><thead><tr><th>Nome</th><th>Matrícula</th><th>Cargo</th><th>Departamento</th><th>Unidade</th><th>Admissão</th><th>Gestor</th><th>Situação</th><th></th></tr></thead><tbody>
      ${fs.length ? fs.map((f) => `<tr><td><b>${esc(f.nome)}</b>${f.email ? `<br><small>${esc(f.email)}</small>` : ''}</td><td>${esc(f.matricula || '—')}</td><td>${esc(f.cargo || '—')}</td><td>${esc(f.departamento || '—')}</td><td>${esc(f.unidade || '—')}</td>
        <td>${br(f.admissao)}</td><td>${esc(f.gestor || '—')}</td><td>${f.ativo ? 'Ativo' : `Desligado${f.demissao ? ` em ${br(f.demissao)}` : ''}`}</td><td><button class="btn btn-secundario pa-mini" data-fu-ed="${f.id}">Editar</button></td></tr>`).join('')
        : '<tr><td colspan="9" style="text-align:center; padding:22px; color:var(--texto-fraco);">Nenhum funcionário cadastrado.</td></tr>'}</tbody></table></div>`;
    const form = (f) => {
      janela(`${cab(f ? 'Funcionário' : 'Novo funcionário')}<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px 14px;">
        <div class="campo" style="grid-column:1 / -1;"><label>Nome</label><input id="fuNome" maxlength="150" value="${esc(f?.nome || '')}"></div>
        <div class="campo"><label>CPF</label><input id="fuCpf" value="${esc(f?.cpf || '')}"></div><div class="campo"><label>Matrícula</label><input id="fuMat" value="${esc(f?.matricula || '')}"></div>
        <div class="campo"><label>Cargo</label><input id="fuCargo" value="${esc(f?.cargo || '')}"></div>
        <div class="campo"><label>Departamento</label><select id="fuDep"><option value="">—</option>${dados.departamentos.map((x) => `<option value="${x.id}"${x.id === f?.departamento_id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label>Unidade</label><select id="fuUni"><option value="">—</option>${dados.unidades.map((x) => `<option value="${x.id}"${x.id === f?.unidade_id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label>Admissão</label><input id="fuAdm" type="date" value="${esc(f?.admissao || '')}"></div>
        <div class="campo"><label>E-mail</label><input id="fuEmail" value="${esc(f?.email || '')}"></div><div class="campo"><label>Telefone</label><input id="fuFone" value="${esc(f?.telefone || '')}"></div>
        <div class="campo"><label>Gestor</label><input id="fuGestor" value="${esc(f?.gestor || '')}"></div><div class="campo"><label>E-mail do gestor</label><input id="fuGestorEmail" value="${esc(f?.email_gestor || '')}"></div>
        <div class="campo"><label>Desligamento</label><input id="fuDem" type="date" value="${esc(f?.demissao || '')}"></div>
        <div class="campo" style="grid-column:1 / -1;"><label>Observações</label><input id="fuObs" maxlength="1000" value="${esc(f?.observacoes || '')}"></div></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" data-fe-fechar style="width:auto;">Fechar</button><button class="btn btn-primario" id="fuOk" style="width:auto;">Salvar</button></div>`);
      $('fuOk').addEventListener('click', async () => {
        const b = { nome: $('fuNome').value, cpf: $('fuCpf').value, matricula: $('fuMat').value, cargo: $('fuCargo').value, departamento_id: $('fuDep').value, unidade_id: $('fuUni').value, admissao: $('fuAdm').value,
          email: $('fuEmail').value, telefone: $('fuFone').value, gestor: $('fuGestor').value, email_gestor: $('fuGestorEmail').value, demissao: $('fuDem').value, observacoes: $('fuObs').value };
        try { if (f) await post(`/funcionarios/${f.id}`, b, 'PUT'); else await post('/funcionarios', b); fechar(); await desenhar(); } catch (e) { erro(e); }
      });
    };
    $('fuNovo').addEventListener('click', () => form(null));
    cont.querySelectorAll('[data-fu-ed]').forEach((b) => b.addEventListener('click', () => form(fs.find((x) => x.id === Number(b.dataset.fuEd)))));
  }
})();
