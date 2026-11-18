// =====================================================================
// Visão geral » 🧾 Faturamento do dia: as NF-e de venda e bonificação (pelo CFOP) emitidas na data (soma do valor total das notas, quantidade,
// clientes, ticket médio, peso), comparação com o mesmo dia da semana anterior, os 5 estados que mais
// compraram e os últimos 14 dias (clique num dia para ver aquele dia). Dados: GET /api/notas/faturamento-dia.
// Usa do dashboard.js: apiFetch; do notasFiscais.js: window.abrirConsultaNotas.
// =====================================================================
(() => {
  const pagina = document.getElementById('pagina-visao-geral');
  const corpo = document.getElementById('vgFatCorpo');
  const campoData = document.getElementById('vgFatData');
  if (!pagina || !corpo || !campoData) return;
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const moedaCurta = (v) => {
    const n = Number(v || 0);
    if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (n >= 1e3) return `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    return moeda(n);
  };
  const num = (v, casas = 0) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const pct = (v) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const diaSemana = (iso) => new Date(`${iso}T12:00:00`).getDay();
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const UF = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
    GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
    PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
    SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins', EX: 'Exterior', '?': 'Sem UF na nota' };

  let dados = null; let pedido = 0; let carregadoEm = 0;

  // Dica (tooltip) única, seguindo o mouse.
  const dica = document.createElement('div');
  dica.className = 'vg-fat-dica oculto';
  document.body.appendChild(dica);
  const mostrarDica = (html, ev) => {
    dica.innerHTML = html; dica.classList.remove('oculto');
    const r = dica.getBoundingClientRect();
    let x = ev.clientX + 14; let y = ev.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
    dica.style.left = `${x}px`; dica.style.top = `${y}px`;
  };
  const esconderDica = () => dica.classList.add('oculto');

  async function carregar(data) {
    const meu = ++pedido;
    if (!dados) corpo.innerHTML = '<div class="vg-fat-vazio">Carregando…</div>';
    const r = await apiFetch(`/api/notas/faturamento-dia${data ? `?data=${encodeURIComponent(data)}` : ''}`).catch(() => null);
    if (meu !== pedido) return;
    if (!r || !r.ok) {
      if (r && r.status === 403) { document.getElementById('vgFat')?.classList.add('oculto'); return; }
      corpo.innerHTML = '<div class="vg-fat-vazio">Não foi possível calcular o faturamento do dia.</div>';
      return;
    }
    dados = await r.json();
    carregadoEm = Date.now();
    campoData.value = dados.data;
    campoData.max = dados.hoje;
    document.getElementById('vgFatProx').disabled = dados.data >= dados.hoje;
    document.getElementById('vgFatHoje').classList.toggle('oculto', dados.data === dados.hoje);
    desenhar();
  }

  function comparacao(d) {
    const sp = d.semana_passada;
    const nome = SEMANA[diaSemana(d.data)];
    const masc = nome === 'sábado' || nome === 'domingo';
    const ref = `${masc ? 'ao' : 'à'} ${nome} passad${masc ? 'o' : 'a'}`;
    if (!sp || !sp.valor) return `<div class="vg-fat-comp neutro">Sem notas ${masc ? 'no' : 'na'} ${nome} passad${masc ? 'o' : 'a'} (${ddmm(sp?.dia || somarDias(d.data, -7))}) para comparar</div>`;
    const v = (d.valor - sp.valor) / sp.valor;
    const sobe = v >= 0;
    return `<div class="vg-fat-comp ${sobe ? 'sobe' : 'desce'}"><span aria-hidden="true">${sobe ? '▲' : '▼'}</span> ${sobe ? '+' : '−'}${pct(Math.abs(v))}
      <span class="vg-fat-comp-ref">em relação ${ref} (${ddmm(sp.dia)}: ${moeda(sp.valor)})</span></div>`;
  }

  // As notas do dia que não entraram na soma (outras operações e sem XML).
  function foraTexto(f) {
    if (!f) return '';
    const partes = [];
    if (f.outras) partes.push(`<a href="#" data-fat-fora="outra">${f.outras} de outras operações</a> (remessa, transferência, devolução...)`);
    if (f.sem_xml) partes.push(`<a href="#" data-fat-fora="sem_xml">${f.sem_xml} sem XML</a> (entraram pela planilha do ERP, sem o CFOP)`);
    if (f.lendo) partes.push(`${f.lendo} ainda sendo lidas`);
    return partes.length ? `<div class="vg-fat-fora">Não entraram na soma: ${partes.join('; ')}.</div>` : '';
  }

  function desenhar() {
    const d = dados;
    if (!d) return;
    const ehHoje = d.data === d.hoje;
    const sem = SEMANA[diaSemana(d.data)];
    const titDia = `${ehHoje ? `Hoje, ${sem}` : sem.charAt(0).toUpperCase() + sem.slice(1)}, ${ddmm(d.data)}/${d.data.slice(0, 4)}`;

    // 1) Resumo do dia (número principal).
    const resumo = `<div class="vg-fat-resumo">
      <div class="vg-fat-rot">${esc(titDia)}</div>
      <div class="vg-fat-total">${moeda(d.valor)}</div>
      ${comparacao(d)}
      <div class="vg-fat-kpis">
        <div><span>Notas emitidas</span><b>${num(d.notas)}</b></div>
        <div><span>Clientes</span><b>${num(d.clientes)}</b></div>
        <div><span>Ticket médio</span><b>${d.notas ? moeda(d.ticket_medio) : '—'}</b></div>
        <div><span>Peso / volumes</span><b>${num(d.peso)} kg</b><small>${num(d.volumes)} vol.</small></div>
      </div>
      ${d.notas ? `<div class="vg-fat-split">
        <div><span class="vg-fat-split-rot">Venda</span><b>${moeda(d.valor_venda)}</b><small>${num(d.notas_venda)} nota${d.notas_venda === 1 ? '' : 's'}</small></div>
        <div><span class="vg-fat-split-rot">Bonificação</span><b>${moeda(d.valor_bonificacao)}</b><small>${num(d.notas_bonificacao)} nota${d.notas_bonificacao === 1 ? '' : 's'}</small></div></div>` : ''}
      ${d.notas ? '<a href="#" class="vg-fat-link" data-fat-notas>Ver as notas do dia »</a>' : ''}
      ${foraTexto(d.fora)}</div>`;

    // 2) Os 5 estados que mais compraram (barras horizontais, escala pelo 1º).
    const maxUf = d.estados[0]?.valor || 1;
    const estados = d.estados.length ? `<div class="vg-fat-ufs">${d.estados.map((u, i) => `
        <div class="vg-fat-uf" data-fat-uf="${esc(u.uf)}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(UF[u.uf] || u.uf)}: ${moeda(u.valor)}, ${pct(u.pct)} do dia, ${u.notas} notas">
          <div class="vg-fat-uf-nome"><span class="vg-fat-uf-sigla">${esc(u.uf === '?' ? '—' : u.uf)}</span><span class="vg-fat-uf-ext">${esc(UF[u.uf] || u.uf)}</span></div>
          <div class="vg-fat-uf-trilho"><div class="vg-fat-uf-barra" style="width:${Math.max(2, (u.valor / maxUf) * 100)}%"></div></div>
          <div class="vg-fat-uf-val"><b>${moeda(u.valor)}</b><small>${pct(u.pct)} · ${u.notas} nota${u.notas === 1 ? '' : 's'}</small></div>
        </div>`).join('')}
        ${d.outros ? `<div class="vg-fat-outros">+ ${d.outros.estados} outro${d.outros.estados > 1 ? 's' : ''} estado${d.outros.estados > 1 ? 's' : ''}: ${moeda(d.outros.valor)} (${pct(d.valor ? d.outros.valor / d.valor : 0)}) em ${d.outros.notas} nota${d.outros.notas === 1 ? '' : 's'}</div>` : ''}
      </div>` : '<div class="vg-fat-vazio">Nenhuma nota emitida neste dia.</div>';

    // 3) Últimos 14 dias (colunas; o dia escolhido em destaque, média como linha de referência).
    const maxDia = Math.max(...d.dias.map((x) => x.valor), 1);
    const comValor = d.dias.filter((x) => x.valor > 0);
    const media = comValor.length ? comValor.reduce((s, x) => s + x.valor, 0) / comValor.length : 0;
    const rotDia = (x) => `${SEMANA[diaSemana(x.dia)]} ${ddmm(x.dia)}: ${moeda(x.valor)}, ${x.notas} notas`;
    const colunas = `<div class="vg-fat-dias">
        <div class="vg-fat-plot">
          ${media ? `<div class="vg-fat-media" style="bottom:${(media / maxDia) * 100}%"><span>média ${moeda(media)}</span></div>` : ''}
          ${d.dias.map((x, i) => `<div class="vg-fat-col${x.dia === d.data ? ' sel' : ''}" data-fat-dia="${x.dia}" data-i="${i}" role="button" tabindex="0" aria-label="${rotDia(x)}">
            <div class="vg-fat-col-barra" style="height:${x.valor ? Math.max(2, (x.valor / maxDia) * 100) : 0}%">${x.valor ? `<span class="vg-fat-col-val">${moeda(x.valor)}</span>` : ''}</div></div>`).join('')}
        </div>
        <div class="vg-fat-eixo">${d.dias.map((x, i) => `<div class="${x.dia === d.data ? 'sel' : ''}${[0, 6].includes(diaSemana(x.dia)) ? ' fds' : ''}" data-fat-dia="${x.dia}" data-i="${i}">
          <b>${x.dia.slice(8, 10)}</b><span>${SEMANA_CURTA[diaSemana(x.dia)]}</span></div>`).join('')}</div>
      </div>`;

    corpo.innerHTML = `<div class="vg-fat-grade">
      ${resumo}
      <div class="vg-fat-bloco"><div class="vg-fat-sub">Os 5 estados que mais compraram <small>(UF do destinatário)</small></div>${estados}</div>
      <div class="vg-fat-bloco"><div class="vg-fat-sub">Últimos 14 dias <small>(clique num dia para ver)</small></div>${colunas}</div>
    </div>`;
    posicionarValores();
  }

  // Valor de cada dia dentro da coluna (na vertical); coluna baixa demais para o texto: o valor vai logo acima dela.
  function posicionarValores() {
    corpo.querySelectorAll('.vg-fat-col-barra').forEach((b) => {
      const v = b.querySelector('.vg-fat-col-val'); if (!v) return;
      v.classList.remove('fora');
      if (v.offsetHeight + 10 > b.clientHeight) v.classList.add('fora');
    });
  }
  window.addEventListener('resize', () => { if (dados) posicionarValores(); });

  // Abre a Consulta de notas com as notas do dia (e do estado, se escolhido).
  function abrirNotas(uf, operacao) {
    if (typeof window.abrirConsultaNotas !== 'function') return;
    window.abrirConsultaNotas({ de: dados.data, ate: dados.data, uf: uf || '', operacao: operacao || 'faturamento', abrir: true });
  }

  corpo.addEventListener('click', (e) => {
    if (e.target.closest('[data-fat-notas]')) { e.preventDefault(); abrirNotas(); return; }
    const fora = e.target.closest('[data-fat-fora]');
    if (fora) { e.preventDefault(); abrirNotas('', fora.dataset.fatFora); return; }
    const uf = e.target.closest('[data-fat-uf]');
    if (uf) { esconderDica(); abrirNotas(uf.dataset.fatUf === '?' ? '' : uf.dataset.fatUf); return; }
    const dia = e.target.closest('[data-fat-dia]');
    if (dia && dia.dataset.fatDia !== dados?.data) { esconderDica(); carregar(dia.dataset.fatDia); }
  });
  corpo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const alvo = e.target.closest('[data-fat-uf], [data-fat-dia]');
    if (alvo) { e.preventDefault(); alvo.click(); }
  });
  corpo.addEventListener('mousemove', (e) => {
    if (!dados) return;
    const col = e.target.closest('[data-fat-dia]');
    if (col) {
      const x = dados.dias[Number(col.dataset.i)];
      const media = x.notas ? x.valor / x.notas : 0;
      mostrarDica(`<b>${SEMANA[diaSemana(x.dia)]}, ${ddmm(x.dia)}</b><div class="vg-fat-dica-val">${moeda(x.valor)}</div>
        <div>${x.notas} nota${x.notas === 1 ? '' : 's'}${x.notas ? ` · ticket médio ${moeda(media)}` : ''}</div>
        ${x.dia !== dados.data ? '<small>Clique para ver este dia</small>' : ''}`, e);
      return;
    }
    const uf = e.target.closest('[data-fat-uf]');
    if (uf) {
      const u = dados.estados[Number(uf.dataset.i)];
      mostrarDica(`<b>${esc(UF[u.uf] || u.uf)}</b><div class="vg-fat-dica-val">${moeda(u.valor)}</div>
        <div>${pct(u.pct)} do dia · ${u.notas} nota${u.notas === 1 ? '' : 's'}</div><small>Clique para ver as notas</small>`, e);
      return;
    }
    esconderDica();
  });
  corpo.addEventListener('mouseleave', esconderDica);


  // ---------- Imagem para o WhatsApp ----------
  // Desenha o resumo do dia num PNG em pé (1080 px de largura, fundo claro, letras grandes para ler no celular):
  // cabeçalho com o logo e o nome da empresa, total e comparação, números do dia, venda x bonificação, os 5 estados
  // e os últimos 14 dias. Copiar (colar com Ctrl+V no WhatsApp Web), compartilhar (celular/Windows) ou baixar.
  let empresa = null;
  async function dadosEmpresa() {
    if (empresa) return empresa;
    try { const r = await apiFetch('/api/empresa'); empresa = r.ok ? ((await r.json()) || {}) : {}; } catch { empresa = {}; }
    return empresa;
  }
  const carregarImg = (src) => new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const COR = { fundo: '#ffffff', caixa: '#f3f5f9', borda: '#e1e4ea', texto: '#1a1d24', fraco: '#656d7c', azul: '#3b68e8', azulClaro: '#b9c8f7', verde: '#1f9d5c', vermelho: '#d63a40' };
  const FONTE = '"Segoe UI", Inter, "Helvetica Neue", Arial, sans-serif';

  async function desenharImagem() {
    const d = dados; if (!d) return null;
    const emp = await dadosEmpresa();
    const logo = await carregarImg(emp.logo);
    const nomeEmp = emp.nome_fantasia || emp.razao_social || '';
    const W = 1080; const P = 64;
    const nEst = d.estados.length;
    const H = 704 + Math.max(nEst, 1) * 64 + (d.outros ? 40 : 0) + 392 + 110;   // estados + 14 dias (colunas de 210) + rodapé   // estados + 14 dias + rodapé
    const esc2 = 2;
    const cv = document.createElement('canvas'); cv.width = W * esc2; cv.height = H * esc2;
    const c = cv.getContext('2d'); c.scale(esc2, esc2);
    const f = (tam, peso = 400) => `${peso} ${tam}px ${FONTE}`;
    const txt = (t, x, y, { tam = 22, peso = 400, cor = COR.texto, alinhar = 'left', max } = {}) => {
      c.font = f(tam, peso); c.fillStyle = cor; c.textAlign = alinhar; c.textBaseline = 'alphabetic';
      let s = String(t);
      if (max) { while (s.length > 1 && c.measureText(s).width > max) s = s.slice(0, -1); if (s !== String(t)) s = `${s.trimEnd()}…`; }
      c.fillText(s, x, y); return c.measureText(s).width;
    };
    const ret = (x, y, w, h, r, cor, borda) => {
      c.beginPath(); c.roundRect(x, y, w, h, r);
      if (cor) { c.fillStyle = cor; c.fill(); }
      if (borda) { c.strokeStyle = borda; c.lineWidth = 1.5; c.stroke(); }
    };
    c.fillStyle = COR.fundo; c.fillRect(0, 0, W, H);
    c.fillStyle = COR.azul; c.fillRect(0, 0, W, 10);

    // Cabeçalho
    let y = 64; let xNome = P;
    if (logo) {
      const h = 64; const w = Math.min(200, (logo.width / logo.height) * h);
      c.drawImage(logo, P, y - 6, w, h); xNome = P + w + 20;
    }
    const sem = SEMANA[diaSemana(d.data)];
    const semExt = `${sem.charAt(0).toUpperCase()}${sem.slice(1)}${['sábado', 'domingo'].includes(sem) ? '' : '-feira'}`;
    txt(semExt, W - P, y + 18, { tam: 22, cor: COR.fraco, alinhar: 'right' });
    txt(`${ddmm(d.data)}/${d.data.slice(0, 4)}`, W - P, y + 54, { tam: 34, peso: 700, alinhar: 'right' });
    if (nomeEmp) txt(nomeEmp, xNome, y + 20, { tam: 26, peso: 700, max: W - P - 260 - xNome });
    txt('Faturamento do dia', xNome, y + (nomeEmp ? 54 : 36), { tam: nomeEmp ? 22 : 30, peso: nomeEmp ? 400 : 700, cor: nomeEmp ? COR.fraco : COR.texto });
    y = 160; c.fillStyle = COR.borda; c.fillRect(P, y, W - 2 * P, 1.5);

    // Total e comparação
    y = 212; txt('Total das notas de venda e bonificação', P, y, { tam: 22, cor: COR.fraco });
    y = 300; txt(moeda(d.valor), P, y, { tam: 82, peso: 700 });
    y = 348;
    const sp = d.semana_passada;
    const masc = sem === 'sábado' || sem === 'domingo';
    if (sp && sp.valor) {
      const v = (d.valor - sp.valor) / sp.valor; const sobe = v >= 0;
      const w1 = txt(`${sobe ? '▲' : '▼'} ${sobe ? '+' : '−'}${pct(Math.abs(v))}`, P, y, { tam: 26, peso: 700, cor: sobe ? COR.verde : COR.vermelho });
      txt(` em relação ${masc ? 'ao' : 'à'} ${sem} passad${masc ? 'o' : 'a'} (${ddmm(sp.dia)}: ${moeda(sp.valor)})`, P + w1, y, { tam: 22, cor: COR.fraco });
    } else {
      txt(`Sem notas ${masc ? 'no' : 'na'} ${sem} passad${masc ? 'o' : 'a'} para comparar`, P, y, { tam: 22, cor: COR.fraco });
    }

    // Números do dia
    y = 392; const gap = 16; const wK = (W - 2 * P - 3 * gap) / 4;
    [['Notas', num(d.notas)], ['Clientes', num(d.clientes)], ['Ticket médio', d.notas ? moeda(d.ticket_medio) : '—'], ['Peso', `${num(d.peso)} kg`]].forEach(([r, v], i) => {
      const x = P + i * (wK + gap);
      ret(x, y, wK, 108, 14, COR.caixa);
      txt(r, x + 20, y + 40, { tam: 20, cor: COR.fraco });
      txt(v, x + 20, y + 84, { tam: 30, peso: 700, max: wK - 36 });
    });
    y = 516; const wV = (W - 2 * P - gap) / 2;
    [['Venda', d.valor_venda, d.notas_venda], ['Bonificação', d.valor_bonificacao, d.notas_bonificacao]].forEach(([r, v, n], i) => {
      const x = P + i * (wV + gap);
      ret(x, y, wV, 96, 14, null, COR.borda);
      txt(r, x + 20, y + 36, { tam: 20, cor: COR.fraco });
      const wv = txt(moeda(v), x + 20, y + 76, { tam: 30, peso: 700 });
      txt(`${num(n)} nota${n === 1 ? '' : 's'}`, x + 32 + wv, y + 76, { tam: 20, cor: COR.fraco });
    });

    // Os 5 estados
    y = 682; txt('Os 5 estados que mais compraram', P, y, { tam: 28, peso: 700 });
    y += 22;
    const maxUf = d.estados[0]?.valor || 1;
    if (!nEst) { txt('Nenhuma nota emitida neste dia.', P, y + 40, { tam: 22, cor: COR.fraco }); y += 64; }
    d.estados.forEach((u) => {
      const yl = y + 42;
      ret(P, y + 12, 58, 40, 9, COR.caixa, COR.borda);
      txt(u.uf === '?' ? '—' : u.uf, P + 29, yl, { tam: 21, peso: 700, alinhar: 'center' });
      txt(UF[u.uf] || u.uf, P + 74, yl, { tam: 23, max: 230 });
      const bx = 392; const bw = 300;
      ret(bx, y + 22, bw, 20, 5, COR.caixa);
      ret(bx, y + 22, Math.max(6, (u.valor / maxUf) * bw), 20, 5, COR.azul);
      txt(moeda(u.valor), W - P, yl - 4, { tam: 24, peso: 700, alinhar: 'right' });
      txt(`${pct(u.pct)} · ${u.notas} nota${u.notas === 1 ? '' : 's'}`, W - P, yl + 22, { tam: 18, cor: COR.fraco, alinhar: 'right' });
      y += 64;
    });
    if (d.outros) {
      txt(`+ ${d.outros.estados} outro${d.outros.estados > 1 ? 's' : ''} estado${d.outros.estados > 1 ? 's' : ''}: ${moeda(d.outros.valor)} (${pct(d.valor ? d.outros.valor / d.valor : 0)}) em ${d.outros.notas} nota${d.outros.notas === 1 ? '' : 's'}`, P, y + 26, { tam: 19, cor: COR.fraco });
      y += 40;
    }

    // Últimos 14 dias
    y += 52; txt('Últimos 14 dias', P, y, { tam: 28, peso: 700 });
    const ALT = 210; const topo = y + 46; const base = topo + ALT;   // altura das colunas (cabe o valor exato dentro)
    const maxDia = Math.max(...d.dias.map((x) => x.valor), 1);
    const cw = (W - 2 * P) / 14;
    const comValor = d.dias.filter((x) => x.valor > 0);
    const media = comValor.length ? comValor.reduce((s, x) => s + x.valor, 0) / comValor.length : 0;
    d.dias.forEach((x, i) => {
      const sel = x.dia === d.data; const bx = P + i * cw + 7; const bw = cw - 14;
      const h = x.valor ? Math.max(4, (x.valor / maxDia) * ALT) : 0;
      if (h) { c.beginPath(); c.roundRect(bx, base - h, bw, h, [6, 6, 0, 0]); c.fillStyle = sel ? COR.azul : COR.azulClaro; c.fill(); }
      if (x.valor) {
        // Valor na vertical, dentro da coluna (ou acima dela, se a coluna for baixa).
        c.save(); c.font = f(15, sel ? 700 : 600);
        const rotulo = moeda(x.valor);
        const tw = c.measureText(rotulo).width;
        const dentro = h >= tw + 14;
        c.translate(bx + bw / 2 + 5, dentro ? base - 8 : base - h - 6);
        c.rotate(-Math.PI / 2); c.textAlign = 'left'; c.fillStyle = dentro && sel ? '#ffffff' : COR.texto;
        if (dentro || base - h - 6 - tw > topo - 30) c.fillText(rotulo, 0, 0);
        c.restore();
      }
      const fds = [0, 6].includes(diaSemana(x.dia));
      txt(x.dia.slice(8, 10), bx + bw / 2, base + 30, { tam: 19, peso: sel ? 700 : 600, cor: sel ? COR.azul : (fds ? '#9aa1ac' : COR.texto), alinhar: 'center' });
      txt(SEMANA_CURTA[diaSemana(x.dia)], bx + bw / 2, base + 54, { tam: 16, cor: sel ? COR.azul : COR.fraco, alinhar: 'center' });
    });
    c.fillStyle = COR.borda; c.fillRect(P, base, W - 2 * P, 1.5);
    if (media) {
      const ym = base - (media / maxDia) * ALT;
      c.setLineDash([6, 5]); c.strokeStyle = '#9aa1ac'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(P, ym); c.lineTo(W - P, ym); c.stroke(); c.setLineDash([]);
    }
    txt(media ? `linha tracejada: média dos dias com nota, ${moeda(media)}` : '', P, base + 84, { tam: 17, cor: COR.fraco });

    // Rodapé
    const agora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    c.fillStyle = COR.borda; c.fillRect(P, H - 70, W - 2 * P, 1.5);
    txt(`NF-e de venda e bonificação emitidas no dia (pelo CFOP), sem canceladas e denegadas · gerado em ${agora}`, P, H - 34, { tam: 16, cor: COR.fraco, max: W - 2 * P });
    return cv;
  }

  async function abrirImagem() {
    if (!dados) return;
    const cv = await desenharImagem();
    if (!cv) return;
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
    const nome = `faturamento-${dados.data}.png`;
    const url = URL.createObjectURL(blob);
    const arquivo = new File([blob], nome, { type: 'image/png' });
    const podeCopiar = !!(window.isSecureContext && navigator.clipboard?.write && window.ClipboardItem);
    let podeCompartilhar = false;
    try { podeCompartilhar = !!navigator.canShare?.({ files: [arquivo] }); } catch { /* sem compartilhar */ }
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card vg-fat-img-card">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">📷 Imagem do faturamento do dia</h3><span style="cursor:pointer; font-size:18px;" data-fechar>✕</span></div>
      <p class="vg-fat-img-dica">${podeCopiar ? '<b>Copiar</b> e colar (Ctrl+V) na conversa do WhatsApp Web ou do WhatsApp do computador' : '<b>Baixar</b> e anexar na conversa do WhatsApp (clipe » Fotos e vídeos)'}${podeCompartilhar ? ', ou <b>Compartilhar</b> e escolher o WhatsApp' : ''}.</p>
      <div class="vg-fat-img-prev"><img src="${url}" alt="Faturamento do dia ${ddmm(dados.data)}" /></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; margin-top:12px;">
        ${podeCompartilhar ? '<button type="button" class="btn btn-secundario" data-compartilhar style="width:auto;">📤 Compartilhar</button>' : ''}
        <a class="btn btn-secundario" style="width:auto;" href="${url}" download="${nome}">⬇ Baixar PNG</a>
        ${podeCopiar ? '<button type="button" class="btn btn-primario" data-copiar style="width:auto;">📋 Copiar imagem</button>' : ''}
      </div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => { fundo.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
    fundo.addEventListener('click', async (e) => {
      if (e.target === fundo || e.target.closest('[data-fechar]')) { fechar(); return; }
      if (e.target.closest('[data-copiar]')) {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); mostrarAlerta('Imagem copiada. Cole (Ctrl+V) na conversa do WhatsApp.', { tipo: 'sucesso' }); }
        catch { mostrarAlerta('O navegador não deixou copiar a imagem. Use "Baixar PNG" e anexe na conversa.', { tipo: 'aviso' }); }
        return;
      }
      if (e.target.closest('[data-compartilhar]')) {
        try { await navigator.share({ files: [arquivo], title: `Faturamento do dia ${ddmm(dados.data)}` }); } catch { /* cancelou */ }
      }
    });
  }


  // ---------- Conferir com o ERP ----------
  // Cola as linhas da lista do ERP (selecionar e Ctrl+C): em cada linha, o nº da NF (número de 4 a 9 dígitos fora de
  // parênteses, de preferência com 5 ou mais) e o 1º valor em reais. Compara nota a nota com o sistema no dia escolhido.
  const valorBr = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));
  function lerListaErp(texto) {
    const itens = new Map();
    for (const linha of String(texto || '').split(/\r?\n/)) {
      const limpa = linha.replace(/\([^)]*\)/g, ' ');
      const valores = [...limpa.matchAll(/(-?\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/g)].map((m) => m[1]);
      const resto = limpa.replace(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g, ' ');
      const nums = [...resto.matchAll(/(?<![\d.\/-])(\d{4,9})(?![\d.,\/-])/g)].map((m) => m[1]);
      if (!nums.length || !valores.length) continue;
      const numero = String(Number(nums.find((n) => n.length >= 5) || nums[0]));
      itens.set(numero, { numero, valor: valorBr(valores[0]), linha: linha.trim() });
    }
    return [...itens.values()];
  }
  const motivoFora = (s) => (s.frete_principal_id ? `guardada dentro do registro #${s.frete_principal_id} (reinicie o servidor ou envie o XML de novo)`
    : s.nf_denegada ? 'denegada' : s.nf_cancelada ? 'cancelada no sistema (o cancelamento foi importado)'
    : s.sem_xml && !s.nf_operacao ? 'sem XML (entrou pela planilha do ERP): envie o XML'
    : !s.nf_operacao ? 'operação ainda sendo lida (reinicie o servidor)'
    : s.nf_operacao === 'outra' ? `operação "${s.nf_natureza || 'outra'}" não é venda nem bonificação pelo CFOP` : '');
  const conta = (s) => !s.frete_principal_id && !s.nf_cancelada && !s.nf_denegada && ['venda', 'bonificacao'].includes(s.nf_operacao);
  const semZeros = (n) => String(n || '').replace(/\D/g, '').replace(/^0+/, '');

  function compararComErp(erp, r) {
    const sis = new Map(r.sistema.map((s) => [semZeros(s.numero_nf), s]));
    const outra = new Map(r.outras_datas.map((s) => [semZeros(s.numero_nf), s]));
    const pulada = new Map(r.sem_frete.map((s) => [semZeros(s.numero_nf), s]));
    const linhas = [];
    for (const e of erp) {
      const s = sis.get(e.numero);
      if (s && conta(s)) {
        const dif = Math.round((s.valor - e.valor) * 100) / 100;
        linhas.push(Math.abs(dif) < 0.01 ? { tipo: 'ok', e, s } : { tipo: 'valor', e, s, texto: `valor diferente: no sistema ${moeda(s.valor)} (${dif > 0 ? '+' : ''}${moeda(dif)})` });
      } else if (s) linhas.push({ tipo: 'fora', e, s, texto: `no sistema, mas fora da soma: ${motivoFora(s)}` });
      else if (outra.get(e.numero)) { const o = outra.get(e.numero); linhas.push({ tipo: 'data', e, s: o, texto: `no sistema com emissão em ${ddmm(o.data)}/${o.data.slice(0, 4)} (conta naquele dia)` }); }
      else if (pulada.get(e.numero)) linhas.push({ tipo: 'fora', e, texto: `não gera frete: ${pulada.get(e.numero).motivo}` });
      else linhas.push({ tipo: 'falta', e, texto: 'não está no sistema' });
    }
    const noErp = new Set(erp.map((e) => e.numero));
    for (const s of r.sistema) {
      if (conta(s) && !noErp.has(semZeros(s.numero_nf))) linhas.push({ tipo: 'so_sistema', s, texto: 'conta no sistema, mas não está na lista colada' });
    }
    return linhas;
  }

  function abrirConferencia() {
    if (!dados) return;
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay';
    fundo.innerHTML = `<div class="painel modal-card vg-conf-card">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">🔎 Conferir o dia ${ddmm(dados.data)}/${dados.data.slice(0, 4)} com o ERP</h3><span style="cursor:pointer; font-size:18px;" data-fechar>✕</span></div>
      <p class="vg-fat-img-dica">No ERP, abra a lista das notas do dia, selecione as linhas (Ctrl+A) e copie (Ctrl+C). Cole aqui (Ctrl+V). Em cada linha o sistema pega o nº da nota e o valor.</p>
      <textarea id="vgConfTexto" class="cte-entrada" rows="6" placeholder="A3E WEB LTDA (031085)	195799	R$ 19.043,86	VENDA DE MERCADORIA	105"></textarea>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;"><button type="button" class="btn btn-primario" data-conferir style="width:auto;">Conferir</button></div>
      <div id="vgConfRes"></div></div>`;
    document.body.appendChild(fundo);
    const res = fundo.querySelector('#vgConfRes');
    let ultimo = null;
    const conferir = async () => {
      const erp = lerListaErp(fundo.querySelector('#vgConfTexto').value);
      if (!erp.length) { res.innerHTML = '<p class="vg-conf-aviso">Não achei nenhuma linha com número de nota e valor. Copie as linhas da lista do ERP (com as colunas do número da nota e do valor).</p>'; return; }
      ultimo = erp;
      res.innerHTML = '<p class="vg-conf-aviso">Conferindo…</p>';
      const r = await apiFetch('/api/notas/conferir-dia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dados.data, numeros: erp.map((e) => e.numero) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { res.innerHTML = `<p class="vg-conf-aviso">${esc(j.erro || 'Erro ao conferir.')}</p>`; return; }
      const linhas = compararComErp(erp, j);
      const totErp = erp.reduce((s, e) => s + e.valor, 0);
      const contadas = j.sistema.filter(conta);
      const totSis = contadas.reduce((s, x) => s + x.valor, 0);
      const probl = linhas.filter((l) => l.tipo !== 'ok');
      const ROT = { falta: ['⚠', 'Falta no sistema'], fora: ['⚠', 'Fora da soma'], valor: ['≠', 'Valor diferente'], data: ['📅', 'Outra data'], so_sistema: ['＋', 'Só no sistema'], ok: ['✓', 'Confere'] };
      const ORDEM = { falta: 1, fora: 2, data: 3, valor: 4, so_sistema: 5, ok: 9 };
      linhas.sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo] || Number((a.e || a.s).numero || semZeros(a.s?.numero_nf)) - Number((b.e || b.s).numero || semZeros(b.s?.numero_nf)));
      const dif = Math.round((totSis - totErp) * 100) / 100;
      res.innerHTML = `<div class="vg-conf-resumo">
          <div><span>ERP (colado)</span><b>${moeda(totErp)}</b><small>${erp.length} nota(s)</small></div>
          <div><span>Sistema</span><b>${moeda(totSis)}</b><small>${contadas.length} nota(s)</small></div>
          <div class="${Math.abs(dif) < 0.01 ? 'ok' : 'dif'}"><span>Diferença</span><b>${Math.abs(dif) < 0.01 ? 'Bateu ✓' : moeda(dif)}</b><small>${probl.length ? `${probl.length} nota(s) para ver` : 'nota por nota igual'}</small></div></div>
        <table class="vg-conf-tab"><thead><tr><th></th><th>NF</th><th>ERP</th><th>Sistema</th><th>O que é</th></tr></thead><tbody>
        ${linhas.map((l) => `<tr class="t-${l.tipo}"><td title="${ROT[l.tipo][1]}">${ROT[l.tipo][0]}</td><td><b>${esc(l.e?.numero || semZeros(l.s?.numero_nf))}</b>${l.s?.cliente ? `<br><small>${esc(l.s.cliente)}</small>` : ''}</td>
          <td>${l.e ? moeda(l.e.valor) : '—'}</td><td>${l.s ? moeda(l.s.valor) : '—'}</td>
          <td>${l.tipo === 'ok' ? '<span class="vg-conf-ok">confere</span>' : esc(l.texto || '')}${l.tipo === 'falta' || (l.tipo === 'fora' && l.s?.sem_xml) || l.s?.frete_principal_id ? ' <button type="button" class="nf-faltando-enviar" data-conf-xml>⬆ Enviar o XML</button>' : ''}</td></tr>`).join('')}
        </tbody></table>`;
    };
    fundo.addEventListener('click', async (e) => {
      if (e.target === fundo || e.target.closest('[data-fechar]')) { fundo.remove(); return; }
      if (e.target.closest('[data-conferir]')) { conferir().catch((err) => { res.innerHTML = `<p class="vg-conf-aviso">${esc(err.message)}</p>`; }); return; }
      if (e.target.closest('[data-conf-xml]')) {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xml,.zip'; inp.multiple = true;
        inp.addEventListener('change', async () => {
          const msgs = [];
          for (const arq of inp.files) {
            const fd = new FormData(); fd.append('arquivo', arq, arq.name);
            const r = await apiFetch(`/api/upload/${/\.zip$/i.test(arq.name) ? 'zip' : 'nfe'}`, { method: 'POST', body: fd }).catch(() => null);
            const j = r ? await r.json().catch(() => ({})) : {};
            msgs.push(`${arq.name}: ${j.mensagem || j.erro || (j.resultados ? `${j.resultados.length} XML no zip` : 'falha')}`);
          }
          mostrarAlerta(msgs.join('\n\n'), { tipo: 'aviso', titulo: 'Resposta do sistema' });
          window.dispatchEvent(new Event('nexofrete:notas-alteradas'));
          if (ultimo) conferir().catch(() => {});
        });
        inp.click();
      }
    });
    setTimeout(() => fundo.querySelector('#vgConfTexto')?.focus(), 50);
  }

  document.getElementById('vgFatConferir').addEventListener('click', abrirConferencia);
  document.getElementById('vgFatImagem').addEventListener('click', () => abrirImagem().catch((e) => mostrarAlerta(`Não consegui gerar a imagem: ${e.message}`, { tipo: 'erro' })));
  document.getElementById('vgFatAnt').addEventListener('click', () => carregar(somarDias(dados?.data || campoData.value, -1)));
  document.getElementById('vgFatProx').addEventListener('click', () => { if (dados && dados.data < dados.hoje) carregar(somarDias(dados.data, 1)); });
  document.getElementById('vgFatHoje').addEventListener('click', () => carregar(null));
  campoData.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(campoData.value)) carregar(campoData.value); });

  // Carrega quando a Visão geral aparece; atualiza sozinho a cada 5 minutos enquanto mostra o dia de hoje.
  const visivel = () => !pagina.classList.contains('oculto') && !document.hidden;
  // Recarrega o dia que está na tela (hoje segue "hoje" mesmo virando a meia-noite).
  const recarregar = () => carregar(dados && dados.data !== dados.hoje ? dados.data : null);
  // Ao voltar para a Visão geral: sempre recarrega (só não repete se acabou de carregar).
  const aoMostrar = () => { if (visivel() && (!dados || Date.now() - carregadoEm > 5000)) recarregar(); };
  new MutationObserver(aoMostrar).observe(pagina, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', () => setTimeout(aoMostrar, 0));
  document.addEventListener('visibilitychange', aoMostrar);
  // XML importado (Enviar XML, botões da Consulta de notas): recarrega já, ou ao voltar para a tela.
  window.addEventListener('nexofrete:notas-alteradas', () => { carregadoEm = 0; if (visivel()) recarregar(); });
  // Notas que entram sozinhas (pasta monitorada, NF-Stock, e-mail): a cada 2 minutos com a tela aberta, qualquer dia.
  setInterval(() => { if (visivel() && dados) recarregar(); }, 2 * 60 * 1000);
})();
