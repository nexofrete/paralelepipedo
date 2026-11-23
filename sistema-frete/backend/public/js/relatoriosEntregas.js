// =====================================================================
// Telas de relatórios (uma tela, cinco catálogos; regras em src/relatoriosEntregas.js e nos módulos que ele monta):
//   📦 Relatórios de entregas (324, relatórios 35 a 50) · 🏆 Desempenho das transportadoras (325, 61 a 70)
//   🔗 Relatórios NF-e × CT-e (326, 25 a 34) · 🔎 Relatórios de auditoria (327, 11 a 24)
//   🗺 Relatórios de rotas e operação (328, 71 a 80, romaneios da transportadora) · 💵 Relatórios financeiros (329, 51 a 60)
// Em todas: filtros por período, transportadora, filial, cliente, UF, cidade, nº da NF-e, nº do CT-e e status;
// situação da linha (filtro na própria tabela); ordenação por coluna; totalizador; gráfico; Excel, PDF e impressão;
// drill-down (clique na linha agrupada abre os documentos do grupo; dois cliques abrem o documento de origem).
// Usa do dashboard.js: apiFetch, mostrarAlerta, token, usuario; do indicadores.js: exportarExcel; do periodo.js: Periodo;
// do notasFiscais.js: abrirNotaDetalhe; do ocorrencias.js: nexoRomaneio; do emissaoCte.js: nexoCte.
// =====================================================================
// Filtros de cada tela. mais: fica em "Mais filtros"; select: a lista vem de /filtros (filiais ou status).
const FILTROS_PADRAO = [
  { id: 'Transp', p: 'transportadora', rot: 'Transportadora', ph: 'Todas' },
  { id: 'Cli', p: 'cliente', rot: 'Cliente (nome ou CNPJ)', ph: 'Todos' },
  { id: 'Cidade', p: 'cidade', rot: 'Cidade', ph: 'Todas' },
  { id: 'Uf', p: 'uf', rot: 'UF', ph: '—', uf: true },
  { id: 'Filial', p: 'filial', rot: 'Filial (emitente)', select: 'filiais', todos: 'Todas', mais: true },
  { id: 'Nf', p: 'nf', rot: 'Nº da NF-e', ph: 'Um ou vários', mais: true },
  { id: 'Cte', p: 'cte', rot: 'Nº do CT-e', ph: 'Um ou vários', mais: true },
  { id: 'Status', p: 'status', rot: 'Status do frete', select: 'status', todos: 'Todos', mais: true },
];
const FILTROS_OPERACAO = [
  { id: 'Transp', p: 'placa', rot: 'Veículo (placa)', ph: 'Todos' },
  { id: 'Cli', p: 'motorista', rot: 'Motorista', ph: 'Todos' },
  { id: 'Cidade', p: 'cidade', rot: 'Cidade', ph: 'Todas' },
  { id: 'Uf', p: 'uf', rot: 'UF', ph: '—', uf: true },
  { id: 'Filial', p: 'filial', rot: 'Filial (unidade)', select: 'filiais', todos: 'Todas', mais: true },
  { id: 'Parc', p: 'transportadora', rot: 'Transportadora (parceiro)', ph: 'Todas', mais: true },
  { id: 'Dest', p: 'cliente', rot: 'Cliente (destinatário)', ph: 'Todos', mais: true },
  { id: 'Nf', p: 'nf', rot: 'Nº da NF-e', ph: 'Um ou vários', mais: true },
  { id: 'Cte', p: 'cte', rot: 'Nº do CT-e', ph: 'Um ou vários', mais: true },
  { id: 'Status', p: 'status', rot: 'Situação do romaneio', select: 'status', todos: 'Todas', mais: true },
];
function telaRelatorios({ pagina, conteudo, P, tela, primeiro, chaveLs, periodoPadrao, api = '/api/relatorios-entregas', campos = FILTROS_PADRAO, pode = null }) {
  const nav = document.querySelector(`.nav-item[data-pagina="${pagina}"]`);
  const cont = document.getElementById(conteudo);
  if (!nav || !cont) return;
  if (pode) { if (!pode()) return; nav.classList.remove('oculto'); }
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const texto = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
  const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const num = (v, c = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const pct = (v) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const diaHora = (v) => (v ? `${dia(v)} ${String(v).slice(11, 16)}` : '—');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const SIT = { 'Entregue no prazo': 'entregue', Entregue: 'entregue', 'Entregue com atraso': 'ocorrencia', Atrasada: 'ocorrencia', 'Em trânsito': 'em_transito', 'Aguardando CT-e': 'pendente' };
  const lsLer = (k, padrao) => { try { const v = localStorage.getItem(`${chaveLs}.${k}`); return v == null ? padrao : v; } catch { return padrao; } };
  const lsGravar = (k, v) => { try { localStorage.setItem(`${chaveLs}.${k}`, String(v)); } catch { /* sem localStorage */ } };
  let catalogo = []; let atual = primeiro; let dados = null; let opcoes = { filiais: [], status: [] };
  try { atual = Number(localStorage.getItem(chaveLs)) || primeiro; } catch { /* sem localStorage */ }
  let montado = false; let pedido = 0;
  let ordem = { col: null, asc: true };
  let detalhe = null;   // { valor, rotulo } quando o relatório agrupado está aberto num grupo (drill-down)
  let situacao = '';    // filtro da situação, na própria tabela
  let grafMetrica = null;

  // Formato de cada célula pelo tipo da coluna.
  function celula(l, [k, , tipo]) {
    const v = l[k];
    if (tipo === 'data') return dia(v);
    if (tipo === 'datahora') return diaHora(v);
    if (tipo === 'num') return v == null ? '—' : num(v);
    if (tipo === 'dec') return v == null ? '—' : num(v, 1);
    if (tipo === 'moeda') return moeda(v);
    if (tipo === 'pct') return pct(v);
    if (tipo === 'financeiro') return v ? `<span class="re-sla ${/^Pag/.test(v) ? 'bom' : /Faturado|Liberad|Aprovad/.test(v) ? 'azul' : /Retido|Bloquead/.test(v) ? 'ruim' : 'medio'}">${esc(v)}</span>` : '—';
    if (tipo === 'ocupacao') return v == null ? '—' : `<span class="re-sla ${v > 1 ? 'ruim' : v < 0.5 ? 'medio' : 'bom'}">${pct(v)}</span>`;
    if (tipo === 'difcusto') return v == null ? '—' : `<span class="re-var ${v > 0.004 ? 'ruim' : v < -0.004 ? 'bom' : ''}">${v > 0 ? '+' : ''}${moeda(v)}</span>`;
    if (tipo === 'auditoria') return v ? `<span class="re-sla ${v === 'Confere' ? 'bom' : /Acima|Não prevista/.test(v) ? 'ruim' : /Abaixo/.test(v) ? 'azul' : 'medio'}">${esc(v)}</span>` : '—';
    if (tipo === 'chave') return v ? `<span class="re-chave">${esc(v)}</span>` : '—';
    if (tipo === 'confere') return v ? `<span class="re-sla ${['Confere', 'Válida', 'Boa ocupação'].includes(v) ? 'bom' : /^Sem /.test(v) ? 'medio' : 'ruim'}">${esc(v)}</span>` : '—';
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
  const ehNumero = (tipo) => ['num', 'dec', 'moeda', 'moeda4', 'difcusto', 'ocupacao', 'pct', 'sla', 'atraso', 'nota', 'posicao', 'varcusto', 'varpp'].includes(tipo);
  // Coluna que se soma no totalizador (médias, índices, capacidades e "por ..." não se somam).
  const somavel = ([, rot, tipo]) => ['num', 'dec', 'moeda', 'difcusto'].includes(tipo) && !/médi|por |\/|%|capacidade|padrão|esperad|maior|menor|ticket|ocupa|alíquota|posição|dias\b|duração|km por|acumulad|^(transportadoras|veículos|motoristas|cidades)$/i.test(rot);
  // Coluna da situação de cada linha (filtro "Situação" e gráfico dos relatórios em lista).
  const colunaSituacao = (d) => (d?.colunas || []).find(([k, , tipo]) => ['situacao', 'categoria', 'auditoria', 'confere', 'conceito', 'financeiro'].includes(tipo) || ['situacao', 'decisao'].includes(k));

  function montar() {
    montado = true;
    const grupos = [...new Set(catalogo.map((r) => r.grupo))];
    const campo = (f) => {
      const cls = `nf-f${f.uf ? ' re-uf' : ''}${f.mais ? ' re-mais' : ''}`;
      if (f.select) return `<label class="${cls}"><span>${esc(f.rot)}</span><select id="${P}${f.id}" class="cte-entrada" data-select="${f.select}"><option value="">${esc(f.todos)}</option></select></label>`;
      return `<label class="${cls}"><span>${esc(f.rot)}</span><input id="${P}${f.id}" class="cte-entrada" placeholder="${esc(f.ph)}"${f.uf ? ' maxlength="2"' : ''} /></label>`;
    };
    cont.innerHTML = `<div class="re-layout">
      <nav class="re-lista painel" aria-label="Relatórios">${grupos.map((g) => `<div class="re-grupo">${esc(g)}</div>${catalogo.filter((r) => r.grupo === g).map((r) => `
        <button type="button" class="re-item${r.numero === atual ? ' ativo' : ''}${r.atalho ? ' re-atalho' : ''}" data-re="${r.numero}"${r.atalho ? ` title="Abre ${esc(r.atalho.rotulo)}"` : ''}><span class="re-num">${r.numero}</span>${esc(r.titulo)}${r.atalho ? ' <span class="re-seta">↗</span>' : ''}</button>`).join('')}`).join('')}</nav>
      <div class="re-corpo">
        <div class="painel re-topo">
          <div class="re-tit"><h3 id="${P}Titulo"></h3><p id="${P}Desc"></p></div>
          <div class="re-filtros${lsLer('mais', '0') === '1' ? ' re-mais-aberto' : ''}" id="${P}Filtros">
            <div class="nf-f re-per" id="${P}PerCaixa"><span>Período</span>${Periodo.html(P)}</div>
            ${campos.map(campo).join('')}
            <label class="nf-f re-sit oculto" id="${P}SitCaixa"><span>Situação (no relatório)</span><select id="${P}Sit" class="cte-entrada"><option value="">Todas</option></select></label>
            <label class="re-check oculto" id="${P}ProbCaixa"><input type="checkbox" id="${P}Prob" checked /> Só problemas</label>
          </div>
          <div class="re-acoes"><button type="button" class="re-link" id="${P}Mais"></button><span id="${P}Info" class="re-info"></span><div class="re-botoes">
            <button type="button" class="btn btn-secundario oculto" id="${P}Trab" style="width:auto;" title="A tela onde se trabalha estes documentos (aprovar, glosar, religar, aceitar, pagar...)"></button>
            <button type="button" class="btn btn-secundario oculto" id="${P}Copiar" style="width:auto;">📋 Copiar</button>
            <button type="button" class="btn btn-secundario" id="${P}Graf" style="width:auto;" title="Mostrar ou esconder o gráfico">📊 Gráfico</button>
            <button type="button" class="btn btn-secundario" id="${P}Excel" style="width:auto;">⬇ Excel</button>
            <button type="button" class="btn btn-secundario" id="${P}Pdf" style="width:auto;" title="Abre o relatório para salvar em PDF (escolha &quot;Salvar como PDF&quot; no destino)">📄 PDF</button>
            <button type="button" class="btn btn-secundario" id="${P}Imprimir" style="width:auto;">🖨 Imprimir</button></div></div>
        </div>
        <div id="${P}Resumo" class="nf-resumo"></div>
        <div id="${P}Grafico" class="painel re-graf oculto"></div>
        <div id="${P}Trilha" class="re-trilha oculto"></div>
        <div class="painel re-tab-painel"><div id="${P}Tabela" class="nf-rolagem"></div></div>
      </div></div>`;
    let tPer = null;
    Periodo.ligar({ select: $(P + 'Per'), de: $(P + 'De'), ate: $(P + 'Ate'), chave: pagina, padrao: periodoPadrao, opcoes: ['7d', '30d', 'mes', 'mes_passado', '3m', 'ano', '12m', 'custom'],
      aoMudar: () => { clearTimeout(tPer); tPer = setTimeout(() => { detalhe = null; carregar(); }, 500); } });
    let t = null;
    campos.forEach((f) => {
      const el = $(P + f.id);
      el.addEventListener(f.select ? 'change' : 'input', () => { clearTimeout(t); t = setTimeout(() => { detalhe = null; carregar(); }, f.select ? 0 : 450); });
    });
    $(P + 'Prob').addEventListener('change', () => { detalhe = null; carregar(); });
    $(P + 'Sit').addEventListener('change', () => { situacao = $(P + 'Sit').value; desenhar(); });
    $(P + 'Mais').addEventListener('click', () => {
      const aberto = $(P + 'Filtros').classList.toggle('re-mais-aberto'); lsGravar('mais', aberto ? '1' : '0'); textoMais();
    });
    $(P + 'Graf').addEventListener('click', () => { lsGravar('grafico', lsLer('grafico', '1') === '1' ? '0' : '1'); desenharGrafico(); });
    cont.querySelector('.re-lista').addEventListener('click', (e) => {
      const b = e.target.closest('[data-re]'); if (!b) return;
      const info = catalogo.find((r) => r.numero === Number(b.dataset.re));
      // Relatório que repetia outro: abre o original.
      if (info?.atalho) {
        if (info.atalho.destino) window.Navegar?.ir(info.atalho.destino);
        else if (info.atalho.pagina) window.abrirRelatorio?.(info.atalho.pagina, info.atalho.numero);
        return;
      }
      atual = Number(b.dataset.re); ordem = { col: null, asc: true }; detalhe = null; situacao = ''; grafMetrica = null;
      try { localStorage.setItem(chaveLs, String(atual)); } catch { /* ok */ }
      cont.querySelectorAll('.re-item').forEach((x) => x.classList.toggle('ativo', x === b));
      carregar();
    });
    $(P + 'Tabela').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-col]');
      if (th) { ordem = { col: th.dataset.col, asc: ordem.col === th.dataset.col ? !ordem.asc : true }; desenharTabela(); return; }
      if (e.target.closest('a')) return;
      // Drill-down: a linha agrupada abre os documentos do grupo.
      const tr = e.target.closest('tr[data-grupo]');
      if (tr) { detalhe = { valor: tr.dataset.grupo, rotulo: tr.dataset.rotulo }; ordem = { col: null, asc: true }; situacao = ''; carregar(); }
    });
    $(P + 'Trilha').addEventListener('click', (e) => {
      if (!e.target.closest('[data-voltar]')) return;
      detalhe = null; ordem = { col: null, asc: true }; situacao = ''; carregar();
    });
    $(P + 'Tabela').addEventListener('dblclick', (e) => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      abrirDocumento(dados?.abrir, Number(tr.dataset.id));
    });
    $(P + 'Excel').addEventListener('click', exportar);
    $(P + 'Trab').addEventListener('click', () => { const t = (catalogo.find((r) => r.numero === atual) || {}).trabalho; if (t) window.Navegar?.ir(t.destino); });
    $(P + 'Imprimir').addEventListener('click', () => imprimir(false));
    $(P + 'Pdf').addEventListener('click', () => imprimir(true));
    // Copiar uma coluna inteira (ex.: as chaves de acesso), uma por linha, na ordem da tabela.
    $(P + 'Copiar').addEventListener('click', async () => {
      if (!dados?.copiar) return;
      const txt = linhasVisiveis().map((l) => l[dados.copiar.coluna]).filter(Boolean).join('\n');
      try { await navigator.clipboard.writeText(txt); } catch {
        const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      mostrarAlerta(`${txt ? txt.split('\n').length : 0} copiada(s). Cole onde precisar (uma por linha).`, { tipo: 'sucesso' });
    });
    // Listas dos filtros (filiais e status).
    apiFetch(`${api}/filtros?tela=${tela}`).then((r) => (r.ok ? r.json() : null)).then((o) => {
      if (!o) return;
      opcoes = o;
      cont.querySelectorAll('select[data-select]').forEach((s) => {
        const lista = opcoes[s.dataset.select] || [];
        s.insertAdjacentHTML('beforeend', lista.map((x) => `<option value="${esc(x.valor)}">${esc(x.nome)}</option>`).join(''));
      });
    }).catch(() => {});
    textoMais();
  }

  // Documento de origem pelos dois cliques: a nota, o romaneio ou o CT-e.
  function abrirDocumento(tipo, id) {
    if (tipo === 'romaneio') { if (window.nexoRomaneio) window.nexoRomaneio.abrir(id).catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })); return; }
    if (tipo === 'cte') { if (window.nexoCte) window.nexoCte.abrir(id); return; }
    if (tipo === 'fatura') { abrirFatura(id).catch((e) => mostrarAlerta(e.message, { tipo: 'erro' })); return; }
    if (typeof window.abrirNotaDetalhe === 'function') window.abrirNotaDetalhe(id);
  }

  // Fatura de frete: os CT-e dela (do relatório 55) numa janela, com o atalho para a tela de pagamento.
  async function abrirFatura(id) {
    const r = await apiFetch(`${api}/55?detalhe=${id}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível abrir a fatura.');
    const fundo = document.createElement('div'); fundo.className = 'modal-overlay';
    const fat = (dados?.linhas || []).find((l) => String(l.id) === String(id)) || {};
    fundo.innerHTML = `<div class="painel modal-card" style="max-width:1100px; width:100%; max-height:92vh; overflow:auto; padding:18px 20px;">
      <div style="display:flex; justify-content:space-between; gap:12px;"><h3 style="margin:0;">🧾 Fatura ${esc(fat.numero || id)}${fat.transportadora ? ` · ${esc(fat.transportadora)}` : ''}</h3><span style="cursor:pointer; font-size:18px;" data-fechar>✕</span></div>
      <p style="margin:6px 0 10px; color:var(--texto-fraco); font-size:13px;">${(j.resumo || []).map(([k, v, t]) => `${esc(k)}: <b>${resumoValor(v, t)}</b>`).join(' · ')} · dois cliques num CT-e abrem a nota</p>
      <table class="re-tab"><thead><tr>${j.colunas.map(([, rot, tipo]) => `<th class="${ehNumero(tipo) ? 'n' : ''}">${esc(rot)}</th>`).join('')}</tr></thead>
      <tbody>${j.linhas.map((l) => `<tr data-id="${l.id}">${j.colunas.map((c) => `<td class="${ehNumero(c[2]) ? 'n' : ''}">${celula(l, c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;"><button class="btn btn-secundario" style="width:auto;" data-pagamento>🚛 Abrir Pagamento de fretes</button>
        <button class="btn btn-primario" style="width:auto;" data-fechar>Fechar</button></div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (e) => {
      if (e.target === fundo || e.target.closest('[data-fechar]')) fechar();
      if (e.target.closest('[data-pagamento]')) { fechar(); document.querySelector('.nav-item[data-pagina="financeiro"]')?.click(); }
    });
    fundo.addEventListener('dblclick', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) abrirDocumento('nota', Number(tr.dataset.id)); });
  }

  const valorFiltro = (f) => $(P + f.id).value.trim();
  function textoMais() {
    const ativos = campos.filter((f) => f.mais && valorFiltro(f)).length;
    const aberto = $(P + 'Filtros').classList.contains('re-mais-aberto');
    $(P + 'Mais').textContent = `${aberto ? '▾ Menos filtros' : '▸ Mais filtros'}${ativos ? ` (${ativos} em uso)` : ''}`;
    $(P + 'Mais').title = 'Filial, nº da NF-e, nº do CT-e e status';
  }
  const filtros = () => {
    const q = new URLSearchParams({ de: $(P + 'De').value, ate: $(P + 'Ate').value });
    campos.forEach((f) => { const v = valorFiltro(f); if (v) q.set(f.p, v); });
    if (atual === 46 && $(P + 'Prob').checked) q.set('so_problemas', '1');
    if (detalhe) q.set('detalhe', detalhe.valor);
    return q;
  };

  async function carregar() {
    const meu = ++pedido;
    const info = catalogo.find((r) => r.numero === atual) || {};
    // O menu acende o item do relatório aberto (itens com data-rel, como os de Planejamento).
    const sec = document.getElementById(`pagina-${pagina}`);
    if (sec && sec.dataset.rel !== String(atual)) { sec.dataset.rel = String(atual); document.dispatchEvent(new Event('tela-mudou')); }
    $(P + 'Titulo').textContent = `${atual} · ${info.titulo || ''}`; $(P + 'Desc').textContent = info.desc || '';
    $(P + 'PerCaixa').classList.toggle('re-sem-periodo', !!info.semPeriodo);
    $(P + 'ProbCaixa').classList.toggle('oculto', atual !== 46);
    cont.querySelectorAll('.re-item').forEach((x) => x.classList.toggle('ativo', Number(x.dataset.re) === atual));
    $(P + 'Trab').classList.toggle('oculto', !info.trabalho || !window.Navegar?.acessivel(info.trabalho.destino));
    if (info.trabalho) $(P + 'Trab').textContent = `↗ ${info.trabalho.rotulo}`;
    textoMais();
    $(P + 'Tabela').innerHTML = '<div class="kanban-vazio">Montando o relatório…</div>';
    const r = await apiFetch(`${api}/${atual}?${filtros()}`).catch(() => null);
    if (meu !== pedido) return;
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { $(P + 'Tabela').innerHTML = `<div class="kanban-vazio">${esc(j.erro || 'Erro ao montar o relatório.')}</div>`; return; }
    dados = j;
    $(P + 'Copiar').classList.toggle('oculto', !j.copiar);
    if (j.copiar) $(P + 'Copiar').textContent = `📋 ${j.copiar.rotulo}`;
    $(P + 'Resumo').innerHTML = (j.resumo || []).map(([rot, v, tipo]) => `<div>${esc(rot)}<b>${resumoValor(v, tipo)}</b><span>&nbsp;</span></div>`).join('');
    // Trilha do drill-down.
    $(P + 'Trilha').classList.toggle('oculto', !detalhe);
    if (detalhe) $(P + 'Trilha').innerHTML = `<button type="button" class="re-link" data-voltar>← Voltar a ${esc(`${j.numero} · ${j.titulo}`)}</button><span>Documentos de <b>${esc(detalhe.rotulo)}</b> · dois cliques abrem cada um</span>`;
    // Situações da tabela (filtro na própria tabela).
    const cs = colunaSituacao(j);
    const sits = cs ? [...new Set(j.linhas.map((l) => l[cs[0]]).filter((v) => v != null && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')) : [];
    if (!sits.includes(situacao)) situacao = '';
    $(P + 'SitCaixa').classList.toggle('oculto', sits.length < 2);
    $(P + 'Sit').innerHTML = `<option value="">Todas</option>${sits.map((s) => `<option${s === situacao ? ' selected' : ''}>${esc(s)}</option>`).join('')}`;
    desenhar();
  }
  function desenhar() {
    const d = dados; if (!d) return;
    const vis = linhasVisiveis().length;
    $(P + 'Info').textContent = `${d.de ? `Período: ${dia(d.de)} a ${dia(d.ate)}` : `Hoje: ${dia(d.hoje)}`} · ${num(vis)} linha${vis === 1 ? '' : 's'}${situacao ? ` de ${num(d.linhas.length)} (situação: ${situacao})` : ''}${d.mais ? ' (as primeiras 5.000)' : ''}`;
    desenharGrafico();
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

  // Linhas com o filtro de situação e a ordenação escolhida.
  function linhasVisiveis() {
    if (!dados) return [];
    const cs = colunaSituacao(dados);
    let ls = situacao && cs ? dados.linhas.filter((l) => l[cs[0]] === situacao) : dados.linhas;
    if (!ordem.col) return ls;
    const col = dados.colunas.find((c) => c[0] === ordem.col); const tipo = col?.[2];
    const f = ordem.asc ? 1 : -1;
    ls = [...ls].sort((a, b) => {
      const x = a[ordem.col]; const y = b[ordem.col];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (ehNumero(tipo) ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * f;
    });
    return ls;
  }
  // Totalizador: soma das colunas somáveis nas linhas visíveis.
  function totais(ls) {
    const t = {}; let algum = false;
    dados.colunas.forEach((c) => { if (somavel(c)) { t[c[0]] = ls.reduce((s, l) => s + (Number(l[c[0]]) || 0), 0); algum = true; } });
    return algum ? t : null;
  }

  function desenharTabela() {
    const d = dados; if (!d) return;
    const ls = linhasVisiveis();
    if (!ls.length) { $(P + 'Tabela').innerHTML = '<div class="kanban-vazio">Nada neste relatório com os filtros escolhidos.</div>'; return; }
    const seta = (k) => (ordem.col === k ? (ordem.asc ? ' ▲' : ' ▼') : '');
    const drill = !detalhe && d.drill;
    const tot = totais(ls);
    const linha = (l) => {
      let attrs = '';
      if (drill && !(d.drillValor && l[d.drillValor] == null)) {
        const bruto = l[d.drillValor || drill]; const valor = bruto == null || /^\(sem /i.test(String(bruto)) ? '' : String(bruto);
        const col = d.colunas.find((c) => c[0] === (d.drillRotulo || drill)) || [drill, '', ''];
        attrs = ` class="re-drill" data-grupo="${esc(valor)}" data-rotulo="${esc(texto(celula(l, col)))}" title="Clique para ver os documentos deste grupo"`;
      } else if (l.id && (!d.agrupado || ['romaneio', 'fatura'].includes(d.abrir))) {
        attrs = ` data-id="${l.id}" title="Dois cliques para abrir ${d.abrir === 'romaneio' ? 'o romaneio' : d.abrir === 'fatura' ? 'a fatura' : d.abrir === 'cte' ? 'o CT-e' : 'a nota'}"`;
      }
      return `<tr${attrs}>${d.colunas.map((c) => `<td class="${ehNumero(c[2]) ? 'n' : ''}">${celula(l, c)}</td>`).join('')}</tr>`;
    };
    $(P + 'Tabela').innerHTML = `<table class="re-tab"><thead><tr>${d.colunas.map(([k, rot, tipo]) => `<th data-col="${k}" class="${ehNumero(tipo) ? 'n' : ''}" title="Clique para ordenar">${esc(rot)}${seta(k)}</th>`).join('')}</tr></thead>
      <tbody>${ls.map(linha).join('')}</tbody>
      ${tot ? `<tfoot><tr>${d.colunas.map((c, i) => `<td class="${ehNumero(c[2]) ? 'n' : ''}">${i === 0 ? `Total (${num(ls.length)})` : c[0] in tot ? celula(tot, c) : ''}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
  }

  // Gráfico: nos agrupados e por período, barras da coluna escolhida; nos em lista, quantas linhas por situação.
  function desenharGrafico() {
    const caixa = $(P + 'Grafico'); const d = dados;
    const ligado = lsLer('grafico', '1') === '1';
    $(P + 'Graf').classList.toggle('ativo', ligado);
    if (!d || !ligado) { caixa.classList.add('oculto'); return; }
    const ls = linhasVisiveis();
    const metricas = d.colunas.filter(([, , tipo]) => ['num', 'dec', 'moeda', 'pct', 'sla', 'atraso', 'nota', 'ocupacao', 'moeda4'].includes(tipo));
    const rotulo = d.colunas.find(([k, , tipo]) => k === (d.drillRotulo || d.drill || 'grupo') || ['mes'].includes(tipo) || (k === 'periodo')) || null;
    let barras = []; let titulo = ''; let tipoValor = 'num';
    if ((d.agrupado || d.drill) && !detalhe && rotulo && metricas.length) {
      if (!metricas.some((m) => m[0] === grafMetrica)) grafMetrica = (metricas.find((m) => m[2] === 'moeda' && somavel(m)) || metricas.find((m) => somavel(m)) || metricas[0])[0];
      const m = metricas.find((x) => x[0] === grafMetrica);
      tipoValor = m[2];
      const tempo = ['mes', 'data'].includes(rotulo[2]);
      barras = ls.filter((l) => l[m[0]] != null).map((l) => ({ rot: texto(celula(l, rotulo)), v: Number(l[m[0]]) || 0 }));
      // Vencimentos (previsão) já vêm na ordem das datas; períodos vêm do mais novo para o mais antigo.
      barras = d.drill === 'data' ? barras.slice(0, 30) : tempo ? barras.reverse().slice(-24) : barras.sort((a, b) => b.v - a.v).slice(0, 15);
      titulo = `<label>📊 <select id="${P}GrafMet" class="cte-entrada">${metricas.map(([k, rot]) => `<option value="${k}"${k === grafMetrica ? ' selected' : ''}>${esc(rot)}</option>`).join('')}</select>
        por ${esc(rotulo[1].toLowerCase())}${tempo ? '' : ls.length > 15 ? ' · os 15 maiores' : ''}</label>`;
    } else {
      const cs = colunaSituacao(d);
      if (!cs) { caixa.classList.add('oculto'); return; }
      const cont2 = {}; ls.forEach((l) => { const k = l[cs[0]] || '—'; cont2[k] = (cont2[k] || 0) + 1; });
      barras = Object.entries(cont2).map(([rot, v]) => ({ rot, v })).sort((a, b) => b.v - a.v).slice(0, 12);
      titulo = `📊 Linhas por ${esc(cs[1].toLowerCase())}`;
      if (barras.length < 2) { caixa.classList.add('oculto'); return; }
    }
    if (!barras.length) { caixa.classList.add('oculto'); return; }
    const max = Math.max(...barras.map((b) => Math.abs(b.v)), 0) || 1;
    const fmt = (v) => (tipoValor === 'moeda' ? moeda(v) : tipoValor === 'moeda4' ? `R$ ${num(v, 4)}` : ['pct', 'sla', 'atraso', 'ocupacao'].includes(tipoValor) ? pct(v) : ['dec', 'nota'].includes(tipoValor) ? num(v, 1) : num(v));
    caixa.classList.remove('oculto');
    caixa.innerHTML = `<div class="re-graf-tit">${titulo}</div><div class="re-graf-barras">${barras.map((b) => `
      <div class="re-gbar" title="${esc(b.rot)}: ${esc(fmt(b.v))}"><span class="re-gbar-rot">${esc(b.rot)}</span>
        <span class="re-gbar-trilho"><span class="re-gbar-barra${b.v < 0 ? ' neg' : ''}" style="width:${Math.max(1, (Math.abs(b.v) / max) * 100).toFixed(1)}%"></span></span>
        <span class="re-gbar-val">${esc(fmt(b.v))}</span></div>`).join('')}</div>`;
    $(P + 'GrafMet')?.addEventListener('change', (e) => { grafMetrica = e.target.value; desenharGrafico(); });
  }

  const nomeArquivo = () => `relatorio-${dados.numero}-${String(dados.titulo).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}${detalhe ? `-${String(detalhe.rotulo).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}` : ''}`.replace(/-+$/, '');
  function exportar() {
    if (!dados) return;
    const ls = linhasVisiveis(); const tot = totais(ls);
    const valor = (l, [k, , tipo]) => (ehNumero(tipo) ? (l[k] == null ? '' : (['pct', 'sla', 'atraso', 'varcusto', 'varpp', 'ocupacao'].includes(tipo) ? Math.round(l[k] * 1000) / 10 : l[k]))
      : tipo === 'data' ? dia(l[k]) : tipo === 'mes' ? String(l[k] || '') : tipo === 'datahora' ? diaHora(l[k]) : (l[k] ?? ''));
    const linhas = ls.map((l) => dados.colunas.map((c) => valor(l, c)));
    if (tot) linhas.push(dados.colunas.map((c, i) => (i === 0 ? `Total (${ls.length})` : c[0] in tot ? tot[c[0]] : '')));
    window.exportarExcel(nomeArquivo(), [{ nome: `${dados.numero} ${dados.titulo}`.slice(0, 31), colunas: dados.colunas.map((c) => c[1]), linhas }])
      .catch((err) => mostrarAlerta(err.message, { tipo: 'erro' }));
  }

  // Imprimir / PDF: uma página com o relatório (título, filtros, resumo, gráfico e tabela com o total).
  function imprimir(pdf) {
    if (!dados) return;
    const filtrosTxt = campos.map((f) => {
      const v = valorFiltro(f); if (!v) return null;
      const el = $(P + f.id); const mostra = f.select ? el.options[el.selectedIndex]?.text : v;
      return `${f.rot}: ${esc(mostra)}`;
    }).concat(situacao ? [`Situação: ${esc(situacao)}`] : []).filter(Boolean).join(' · ');
    const w = window.open('', '_blank');
    if (!w) { mostrarAlerta('O navegador bloqueou a janela de impressão. Libere as janelas deste site.', { tipo: 'aviso' }); return; }
    const graf = $(P + 'Grafico').classList.contains('oculto') ? '' : `<div class="graf">${$(P + 'Grafico').innerHTML.replace(/<select[\s\S]*?<\/select>/, esc(dados.colunas.find((c) => c[0] === grafMetrica)?.[1] || ''))}</div>`;
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(pdf ? nomeArquivo() : `${dados.numero} ${dados.titulo}`)}</title><style>
      @page { size: A4 landscape; margin: 10mm; } body { font: 11px Arial, sans-serif; color: #000; }
      h1 { font-size: 16px; margin: 0 0 2px; } p { margin: 0 0 6px; color: #444; } .res { display: flex; gap: 14px; flex-wrap: wrap; margin: 6px 0 8px; } .res div { border: 1px solid #ccc; border-radius: 6px; padding: 4px 8px; } .res b { display: block; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; vertical-align: top; } th { background: #eee; } td.n, th.n { text-align: right; } tr { break-inside: avoid; }
      tfoot td { font-weight: bold; background: #f3f3f3; } a { display: none; } .oc-sit, .re-cat, .re-sla, .re-comp { font-weight: bold; }
      .graf { border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; margin: 0 0 8px; break-inside: avoid; } .re-graf-tit { font-weight: bold; margin-bottom: 4px; }
      .re-gbar { display: grid; grid-template-columns: 220px 1fr 110px; gap: 6px; align-items: center; font-size: 10px; } .re-gbar-rot { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .re-gbar-trilho { height: 9px; background: #eee; border-radius: 3px; } .re-gbar-barra { display: block; height: 9px; background: #3b6fd8; border-radius: 3px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .re-gbar-val { text-align: right; }
      .dica { background: #fff7d6; border: 1px solid #e8d27a; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; } @media print { .dica { display: none; } }
    </style></head><body>${pdf ? '<div class="dica">Para gerar o PDF, escolha <b>Salvar como PDF</b> no destino da impressão.</div>' : ''}<h1>${esc(`${dados.numero} · ${dados.titulo}`)}${detalhe ? ` — ${esc(detalhe.rotulo)}` : ''}</h1><p>${esc(dados.descricao)}</p>
    <p>${dados.de ? `Período: ${dia(dados.de)} a ${dia(dados.ate)}` : `Hoje: ${dia(dados.hoje)}`}${filtrosTxt ? ` · ${filtrosTxt}` : ''} · emitido em ${new Date().toLocaleString('pt-BR')}</p>
    <div class="res">${$(P + 'Resumo').innerHTML}</div>${graf}${$(P + 'Tabela').innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  // Outras telas abrem um relatório desta (atalhos, o Scorecard): window.abrirRelatorio(pagina, numero).
  window.abrirRelatorio = ((anterior) => (pag, numero) => {
    if (pag !== pagina) return anterior?.(pag, numero);
    atual = Number(numero); detalhe = null; situacao = ''; ordem = { col: null, asc: true };
    try { localStorage.setItem(chaveLs, String(atual)); } catch { /* ok */ }
    if (typeof irParaPagina === 'function') irParaPagina(pagina); else nav.click();
    return undefined;
  })(window.abrirRelatorio);
  nav.addEventListener('click', async () => {
    try {
      if (!catalogo.length) { const r = await apiFetch(`${api}?tela=${tela}`); catalogo = r.ok ? await r.json() : []; }
      if (!catalogo.some((r) => r.numero === atual && !r.atalho)) atual = (catalogo.find((r) => !r.atalho) || {}).numero || primeiro;
      if (!montado) montar();
      await carregar();
    } catch (e) { mostrarAlerta(e.message, { tipo: 'erro' }); }
  });
}
telaRelatorios({ pagina: 'relatorios-entregas', conteudo: 'reConteudo', P: 're', tela: 'entregas', primeiro: 35, chaveLs: 'nexofreteRelEntregas', periodoPadrao: '30d' });
telaRelatorios({ pagina: 'relatorios-operacao', conteudo: 'opConteudo', P: 'op', tela: 'operacao', primeiro: 71, chaveLs: 'nexofreteRelOperacao', periodoPadrao: '30d', api: '/api/relatorios-operacao',
  campos: FILTROS_OPERACAO, pode: () => usuario?.perfil === 'admin' || !!(usuario?.pode_emitir_cte || usuario?.pode_ver_relatorios || usuario?.pode_ver_financeiro) });
telaRelatorios({ pagina: 'relatorios-financeiros', conteudo: 'fiConteudo', P: 'fi', tela: 'financeiro', primeiro: 51, chaveLs: 'nexofreteRelFinanceiro', periodoPadrao: 'mes',
  api: '/api/relatorios-financeiros', pode: () => usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro });
telaRelatorios({ pagina: 'relatorios-auditoria', conteudo: 'auConteudo', P: 'au', tela: 'auditoria', primeiro: 11, chaveLs: 'nexofreteRelAuditoria', periodoPadrao: '30d' });
telaRelatorios({ pagina: 'relatorios-planejamento', conteudo: 'pjConteudo', P: 'pj', tela: 'planejamento', primeiro: 81, chaveLs: 'nexofreteRelPlanejamento', periodoPadrao: '3m' });
telaRelatorios({ pagina: 'relatorios-nfe-cte', conteudo: 'ncConteudo', P: 'nc', tela: 'nfecte', primeiro: 25, chaveLs: 'nexofreteRelNfeCte', periodoPadrao: '30d' });
telaRelatorios({ pagina: 'desempenho-transportadoras', conteudo: 'dtConteudo', P: 'dt', tela: 'desempenho', primeiro: 61, chaveLs: 'nexofreteRelDesempenho', periodoPadrao: '3m' });
