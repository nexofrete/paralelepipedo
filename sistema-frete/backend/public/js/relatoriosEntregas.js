// =====================================================================
// Gestão e relatórios » 📦 Relatórios de entregas (tela 324) 🏆 Desempenho das transportadoras (tela 325, relatórios 61 a 70) , 🔗 Relatórios NF-e × CT-e (tela 326, 25 a 34) e 🔎 Relatórios de auditoria (tela 327, 11 a 24): os relatórios 35 a 50 da lista da empresa (entregas
// previstas, realizadas, atrasadas, de hoje, próximos 7 dias, pendentes, em trânsito; por transportadora, cliente,
// cidade e estado; ocorrências, reentregas, comprovantes, rastreamento e SLA). Regras em src/relatoriosEntregas.js.
// Usa do dashboard.js: apiFetch, mostrarAlerta, token; do indicadores.js: exportarExcel; do periodo.js: Periodo;
// do notasFiscais.js: abrirNotaDetalhe.
// =====================================================================
// A mesma tela serve aos relatórios de desempenho das transportadoras (tela 325, relatórios 61 a 70).
function telaRelatorios({ pagina, conteudo, P, tela, primeiro, chaveLs, periodoPadrao }) {
  const nav = document.querySelector(`.nav-item[data-pagina="${pagina}"]`);
  const cont = document.getElementById(conteudo);
  if (!nav || !cont) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const num = (v, c = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const pct = (v) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const diaHora = (v) => (v ? `${dia(v)} ${String(v).slice(11, 16)}` : '—');
  const SIT = { 'Entregue no prazo': 'entregue', Entregue: 'entregue', 'Entregue com atraso': 'ocorrencia', Atrasada: 'ocorrencia', 'Em trânsito': 'em_transito', 'Aguardando CT-e': 'pendente' };
  let catalogo = []; let atual = primeiro; let dados = null;
  try { atual = Number(localStorage.getItem(chaveLs)) || primeiro; } catch { /* sem localStorage */ }
   let montado = false; let pedido = 0;
  let ordem = { col: null, asc: true };

  // Formato de cada célula pelo tipo da coluna.
  function celula(l, [k, , tipo]) {
    const v = l[k];
    if (tipo === 'data') return dia(v);
    if (tipo === 'datahora') return diaHora(v);
    if (tipo === 'num') return v == null ? '—' : num(v);
    if (tipo === 'dec') return v == null ? '—' : num(v, 1);
    if (tipo === 'moeda') return moeda(v);
    if (tipo === 'pct') return pct(v);
    if (tipo === 'difcusto') return v == null ? '—' : `<span class="re-var ${v > 0.004 ? 'ruim' : v < -0.004 ? 'bom' : ''}">${v > 0 ? '+' : ''}${moeda(v)}</span>`;
    if (tipo === 'auditoria') return v ? `<span class="re-sla ${v === 'Confere' ? 'bom' : /Acima|Não prevista/.test(v) ? 'ruim' : /Abaixo/.test(v) ? 'azul' : 'medio'}">${esc(v)}</span>` : '—';
    if (tipo === 'chave') return v ? `<span class="re-chave">${esc(v)}</span>` : '—';
    if (tipo === 'confere') return v ? `<span class="re-sla ${['Confere', 'Válida'].includes(v) ? 'bom' : /^Sem /.test(v) ? 'medio' : 'ruim'}">${esc(v)}</span>` : '—';
    if (tipo === 'moeda4') return v == null ? '—' : `R$ ${num(v, 4)}`;
    if (tipo === 'mes') return v ? `${MESES[Number(String(v).slice(5, 7)) - 1]}/${String(v).slice(0, 4)}` : '—';
    if (tipo === 'atraso') return v == null ? '—' : `<span class="re-sla ${v <= 0.05 ? 'bom' : v <= 0.15 ? 'medio' : 'ruim'}">${pct(v)}</span>`;
    if (tipo === 'nota') return v == null ? '—' : `<span class="re-sla ${v >= 8.5 ? 'bom' : v >= 7 ? 'azul' : v >= 5 ? 'medio' : 'ruim'}">${num(v, 1)}</span>`;
    if (tipo === 'conceito') return v ? `<span class="re-conceito c-${esc(v[0])}">${esc(v)}</span>` : '—';
    if (tipo === 'posicao') return v == null ? '—' : (['🥇', '🥈', '🥉'][v - 1] ? `${['🥇', '🥈', '🥉'][v - 1]} ${v}º` : `${v}º`);
    if (tipo === 'varcusto') return v == null ? '—' : `<span class="re-var ${v > 0.005 ? 'ruim' : v < -0.005 ? 'bom' : ''}">${v > 0 ? '+' : ''}${pct(v)}</span>`;
    if (tipo === 'varpp') return v == null ? '—' : `<span class="re-var ${v < -0.005 ? 'ruim' : v > 0.005 ? 'bom' : ''}">${v > 0 ? '+' : ''}${num(v * 100, 1)} p.p.</span>`;
    if (tipo === 'sla') return v == null ? '—' : `<span class="re-sla ${v >= 0.95 ? 'bom' : v >= 0.85 ? 'medio' : 'ruim'}">${pct(v)}</span>`;
    if (tipo === 'situacao') return v ? `<span class="oc-sit ${SIT[v] || ''}">${esc(v)}</span>` : '—';
    if (tipo === 'categoria') return `<span class="re-cat${['Entrega', 'Informativo'].includes(v) ? ' neutra' : ''}">${esc(v)}</span>`;
    if (tipo === 'comprovante') {
      const foto = l.tem_foto ? ` <a href="/api/fretes/${l.id}/canhoto/foto?token=${encodeURIComponent(token)}" target="_blank" rel="noopener" title="Ver a foto do canhoto">📷 ver</a>` : '';
      return `<span class="re-comp${v === 'Sem comprovante' ? ' sem' : ''}">${esc(v)}</span>${foto}`;
    }
    return v == null || v === '' ? '—' : esc(v);
  }
  const ehNumero = (tipo) => ['num', 'dec', 'moeda', 'moeda4', 'difcusto', 'pct', 'sla', 'atraso', 'nota', 'posicao', 'varcusto', 'varpp'].includes(tipo);
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function montar() {
    montado = true;
    const grupos = [...new Set(catalogo.map((r) => r.grupo))];
    cont.innerHTML = `<div class="re-layout">
      <nav class="re-lista painel" aria-label="Relatórios">${grupos.map((g) => `<div class="re-grupo">${esc(g)}</div>${catalogo.filter((r) => r.grupo === g).map((r) => `
        <button type="button" class="re-item${r.numero === atual ? ' ativo' : ''}" data-re="${r.numero}"><span class="re-num">${r.numero}</span>${esc(r.titulo)}</button>`).join('')}`).join('')}</nav>
      <div class="re-corpo">
        <div class="painel re-topo">
          <div class="re-tit"><h3 id="${P}Titulo"></h3><p id="${P}Desc"></p></div>
          <div class="re-filtros">
            <div class="nf-f re-per" id="${P}PerCaixa"><span>Período</span>${Periodo.html(P)}</div>
            <label class="nf-f"><span>Transportadora</span><input id="${P}Transp" class="cte-entrada" placeholder="Todas" /></label>
            <label class="nf-f"><span>Cliente (nome ou CNPJ)</span><input id="${P}Cli" class="cte-entrada" placeholder="Todos" /></label>
            <label class="nf-f"><span>Cidade</span><input id="${P}Cidade" class="cte-entrada" placeholder="Todas" /></label>
            <label class="nf-f re-uf"><span>UF</span><input id="${P}Uf" class="cte-entrada" maxlength="2" placeholder="—" /></label>
            <label class="re-check oculto" id="${P}ProbCaixa"><input type="checkbox" id="${P}Prob" checked /> Só problemas</label>
          </div>
          <div class="re-acoes"><span id="${P}Info"></span><span style="flex:1;"></span>
            <button type="button" class="btn btn-secundario oculto" id="${P}Copiar" style="width:auto;">📋 Copiar</button>
            <button type="button" class="btn btn-secundario" id="${P}Excel" style="width:auto;">⬇ Excel</button>
            <button type="button" class="btn btn-secundario" id="${P}Imprimir" style="width:auto;">🖨 Imprimir</button></div>
        </div>
        <div id="${P}Resumo" class="nf-resumo"></div>
        <div class="painel re-tab-painel"><div id="${P}Tabela" class="nf-rolagem"></div></div>
      </div></div>`;
    let tPer = null;
    Periodo.ligar({ select: $(P + 'Per'), de: $(P + 'De'), ate: $(P + 'Ate'), chave: pagina, padrao: periodoPadrao, opcoes: ['7d', '30d', 'mes', 'mes_passado', '3m', 'ano', '12m', 'custom'],
      aoMudar: () => { clearTimeout(tPer); tPer = setTimeout(carregar, 500); } });
    let t = null;
    ['Transp', 'Cli', 'Cidade', 'Uf'].forEach((id) => $(P + id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 450); }));
    $(P + 'Prob').addEventListener('change', carregar);
    cont.querySelector('.re-lista').addEventListener('click', (e) => {
      const b = e.target.closest('[data-re]'); if (!b) return;
      atual = Number(b.dataset.re); ordem = { col: null, asc: true };
      try { localStorage.setItem(chaveLs, String(atual)); } catch { /* ok */ }
      cont.querySelectorAll('.re-item').forEach((x) => x.classList.toggle('ativo', x === b));
      carregar();
    });
    $(P + 'Tabela').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-col]'); if (!th) return;
      ordem = { col: th.dataset.col, asc: ordem.col === th.dataset.col ? !ordem.asc : true };
      desenharTabela();
    });
    $(P + 'Tabela').addEventListener('dblclick', (e) => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-id]');
      if (tr && typeof window.abrirNotaDetalhe === 'function') window.abrirNotaDetalhe(Number(tr.dataset.id));
    });
    $(P + 'Excel').addEventListener('click', () => {
      if (!dados) return;
      window.exportarExcel(`relatorio-${dados.numero}-${String(dados.titulo).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`, [{
        nome: `${dados.numero} ${dados.titulo}`.slice(0, 31), colunas: dados.colunas.map((c) => c[1]),
        linhas: linhasOrdenadas().map((l) => dados.colunas.map(([k, , tipo]) => (ehNumero(tipo) ? (l[k] == null ? '' : (['pct', 'sla', 'atraso', 'varcusto', 'varpp'].includes(tipo) ? Math.round(l[k] * 1000) / 10 : l[k]))
          : tipo === 'data' ? dia(l[k]) : tipo === 'mes' ? String(l[k] || '') : tipo === 'datahora' ? diaHora(l[k]) : (l[k] ?? '')))),
      }]).catch((err) => mostrarAlerta(err.message, { tipo: 'erro' }));
    });
    $(P + 'Imprimir').addEventListener('click', imprimir);
    // Copiar uma coluna inteira (ex.: as chaves de acesso), uma por linha, na ordem da tabela.
    $(P + 'Copiar').addEventListener('click', async () => {
      if (!dados?.copiar) return;
      const texto = linhasOrdenadas().map((l) => l[dados.copiar.coluna]).filter(Boolean).join('\n');
      try { await navigator.clipboard.writeText(texto); } catch {
        const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
      }
      mostrarAlerta(`${texto ? texto.split('\n').length : 0} copiada(s). Cole onde precisar (uma por linha).`, { tipo: 'sucesso' });
    });
  }

  const filtros = () => {
    const q = new URLSearchParams({ de: $(P + 'De').value, ate: $(P + 'Ate').value, transportadora: $(P + 'Transp').value.trim(), cliente: $(P + 'Cli').value.trim(), cidade: $(P + 'Cidade').value.trim(), uf: $(P + 'Uf').value.trim() });
    if (atual === 46 && $(P + 'Prob').checked) q.set('so_problemas', '1');
    return q;
  };

  async function carregar() {
    const meu = ++pedido;
    const info = catalogo.find((r) => r.numero === atual) || {};
    $(P + 'Titulo').textContent = `${atual} · ${info.titulo || ''}`; $(P + 'Desc').textContent = info.desc || '';
    $(P + 'PerCaixa').classList.toggle('re-sem-periodo', !!info.semPeriodo);
    $(P + 'ProbCaixa').classList.toggle('oculto', atual !== 46);
    $(P + 'Tabela').innerHTML = '<div class="kanban-vazio">Montando o relatório…</div>';
    const r = await apiFetch(`/api/relatorios-entregas/${atual}?${filtros()}`).catch(() => null);
    if (meu !== pedido) return;
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { $(P + 'Tabela').innerHTML = `<div class="kanban-vazio">${esc(j.erro || 'Erro ao montar o relatório.')}</div>`; return; }
    dados = j;
    $(P + 'Copiar').classList.toggle('oculto', !j.copiar);
    if (j.copiar) $(P + 'Copiar').textContent = `📋 ${j.copiar.rotulo}`;
    $(P + 'Info').textContent = `${j.de ? `Período: ${dia(j.de)} a ${dia(j.ate)}` : `Hoje: ${dia(j.hoje)}`} · ${num(j.linhas.length)} linha${j.linhas.length === 1 ? '' : 's'}${j.mais ? ' (as primeiras 5.000)' : ''}`;
    $(P + 'Resumo').innerHTML = (j.resumo || []).map(([rot, v, tipo]) => `<div>${esc(rot)}<b>${resumoValor(v, tipo)}</b><span>&nbsp;</span></div>`).join('');
    desenharTabela();
  }

  function resumoValor(v, tipo) {
    if (v == null) return '—';
    if (tipo === 'moeda') return moeda(v);
    if (tipo === 'moeda4') return `R$ ${num(v, 4)}`;
    if (tipo === 'pct') return pct(v);
    if (tipo === 'dec') return num(v, 1);
    if (tipo === 'pp') return `${v > 0 ? '+' : ''}${num(v * 100, 1)} p.p.`;
    if (tipo === 'texto') return esc(v);
    return num(v);
  }

  function linhasOrdenadas() {
    if (!dados) return [];
    if (!ordem.col) return dados.linhas;
    const col = dados.colunas.find((c) => c[0] === ordem.col); const tipo = col?.[2];
    const f = ordem.asc ? 1 : -1;
    return [...dados.linhas].sort((a, b) => {
      const x = a[ordem.col]; const y = b[ordem.col];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (ehNumero(tipo) ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * f;
    });
  }

  function desenharTabela() {
    const d = dados; if (!d) return;
    if (!d.linhas.length) { $(P + 'Tabela').innerHTML = '<div class="kanban-vazio">Nada neste relatório com os filtros escolhidos.</div>'; return; }
    const seta = (k) => (ordem.col === k ? (ordem.asc ? ' ▲' : ' ▼') : '');
    $(P + 'Tabela').innerHTML = `<table class="re-tab"><thead><tr>${d.colunas.map(([k, rot, tipo]) => `<th data-col="${k}" class="${ehNumero(tipo) ? 'n' : ''}" title="Clique para ordenar">${esc(rot)}${seta(k)}</th>`).join('')}</tr></thead>
      <tbody>${linhasOrdenadas().map((l) => `<tr${l.id && !d.agrupado ? ` data-id="${l.id}" title="Dois cliques para abrir a nota"` : ''}>${d.colunas.map((c) => `<td class="${ehNumero(c[2]) ? 'n' : ''}">${celula(l, c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // Imprimir: uma página só com o relatório (título, filtros, resumo e tabela).
  function imprimir() {
    if (!dados) return;
    const filtrosTxt = [['Transportadora', $(P + 'Transp').value], ['Cliente', $(P + 'Cli').value], ['Cidade', $(P + 'Cidade').value], ['UF', $(P + 'Uf').value]]
      .filter(([, v]) => String(v).trim()).map(([k, v]) => `${k}: ${esc(v)}`).join(' · ');
    const w = window.open('', '_blank');
    if (!w) { mostrarAlerta('O navegador bloqueou a janela de impressão. Libere as janelas deste site.', { tipo: 'aviso' }); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(`${dados.numero} ${dados.titulo}`)}</title><style>
      @page { size: A4 landscape; margin: 10mm; } body { font: 11px Arial, sans-serif; color: #000; }
      h1 { font-size: 16px; margin: 0 0 2px; } p { margin: 0 0 6px; color: #444; } .res { display: flex; gap: 14px; flex-wrap: wrap; margin: 6px 0 8px; } .res div { border: 1px solid #ccc; border-radius: 6px; padding: 4px 8px; } .res b { display: block; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; vertical-align: top; } th { background: #eee; } td.n, th.n { text-align: right; } tr { break-inside: avoid; }
      a { display: none; } .oc-sit, .re-cat, .re-sla, .re-comp { font-weight: bold; }
    </style></head><body><h1>${esc(`${dados.numero} · ${dados.titulo}`)}</h1><p>${esc(dados.descricao)}</p>
    <p>${dados.de ? `Período: ${dia(dados.de)} a ${dia(dados.ate)}` : `Hoje: ${dia(dados.hoje)}`}${filtrosTxt ? ` · ${filtrosTxt}` : ''} · emitido em ${new Date().toLocaleString('pt-BR')}</p>
    <div class="res">${$(P + 'Resumo').innerHTML}</div>${$(P + 'Tabela').innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  nav.addEventListener('click', async () => {
    try {
      if (!catalogo.length) { const r = await apiFetch(`/api/relatorios-entregas?tela=${tela}`); catalogo = r.ok ? await r.json() : []; }
      if (!catalogo.some((r) => r.numero === atual)) atual = primeiro;
      if (!montado) montar();
      await carregar();
    } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
  });
}
telaRelatorios({ pagina: 'relatorios-entregas', conteudo: 'reConteudo', P: 're', tela: 'entregas', primeiro: 35, chaveLs: 'nexofreteRelEntregas', periodoPadrao: '30d' });
telaRelatorios({ pagina: 'relatorios-auditoria', conteudo: 'auConteudo', P: 'au', tela: 'auditoria', primeiro: 11, chaveLs: 'nexofreteRelAuditoria', periodoPadrao: '30d' });
telaRelatorios({ pagina: 'relatorios-nfe-cte', conteudo: 'ncConteudo', P: 'nc', tela: 'nfecte', primeiro: 25, chaveLs: 'nexofreteRelNfeCte', periodoPadrao: '30d' });
telaRelatorios({ pagina: 'desempenho-transportadoras', conteudo: 'dtConteudo', P: 'dt', tela: 'desempenho', primeiro: 61, chaveLs: 'nexofreteRelDesempenho', periodoPadrao: '3m' });
