// =====================================================================
// Visão geral » 🧾 Faturamento do dia: as NF-e emitidas na data (soma do valor total das notas, quantidade,
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
      ${d.notas ? '<a href="#" class="vg-fat-link" data-fat-notas>Ver as notas do dia »</a>' : ''}</div>`;

    // 2) Os 5 estados que mais compraram (barras horizontais, escala pelo 1º).
    const maxUf = d.estados[0]?.valor || 1;
    const estados = d.estados.length ? `<div class="vg-fat-ufs">${d.estados.map((u, i) => `
        <div class="vg-fat-uf" data-fat-uf="${esc(u.uf)}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(UF[u.uf] || u.uf)}: ${moeda(u.valor)}, ${pct(u.pct)} do dia, ${u.notas} notas">
          <div class="vg-fat-uf-nome"><span class="vg-fat-uf-sigla">${esc(u.uf === '?' ? '—' : u.uf)}</span><span class="vg-fat-uf-ext">${esc(UF[u.uf] || u.uf)}</span></div>
          <div class="vg-fat-uf-trilho"><div class="vg-fat-uf-barra" style="width:${Math.max(2, (u.valor / maxUf) * 100)}%"></div></div>
          <div class="vg-fat-uf-val"><b>${moedaCurta(u.valor)}</b><small>${pct(u.pct)} · ${u.notas} nota${u.notas === 1 ? '' : 's'}</small></div>
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
          ${media ? `<div class="vg-fat-media" style="bottom:${(media / maxDia) * 100}%"><span>média ${moedaCurta(media)}</span></div>` : ''}
          ${d.dias.map((x, i) => `<div class="vg-fat-col${x.dia === d.data ? ' sel' : ''}" data-fat-dia="${x.dia}" data-i="${i}" role="button" tabindex="0" aria-label="${rotDia(x)}">
            ${x.dia === d.data && x.valor ? `<span class="vg-fat-col-rot${i >= 12 ? ' fim' : ''}" style="bottom:calc(${(x.valor / maxDia) * 100}% + 4px)">${moedaCurta(x.valor)}</span>` : ''}
            <div class="vg-fat-col-barra" style="height:${x.valor ? Math.max(2, (x.valor / maxDia) * 100) : 0}%"></div></div>`).join('')}
        </div>
        <div class="vg-fat-eixo">${d.dias.map((x, i) => `<div class="${x.dia === d.data ? 'sel' : ''}${[0, 6].includes(diaSemana(x.dia)) ? ' fds' : ''}" data-fat-dia="${x.dia}" data-i="${i}">
          <b>${x.dia.slice(8, 10)}</b><span>${SEMANA_CURTA[diaSemana(x.dia)]}</span></div>`).join('')}</div>
      </div>`;

    corpo.innerHTML = `<div class="vg-fat-grade">
      ${resumo}
      <div class="vg-fat-bloco"><div class="vg-fat-sub">Os 5 estados que mais compraram <small>(UF do destinatário)</small></div>${estados}</div>
      <div class="vg-fat-bloco"><div class="vg-fat-sub">Últimos 14 dias <small>(clique num dia para ver)</small></div>${colunas}</div>
    </div>`;
  }

  // Abre a Consulta de notas com as notas do dia (e do estado, se escolhido).
  function abrirNotas(uf) {
    if (typeof window.abrirConsultaNotas !== 'function') return;
    window.abrirConsultaNotas({ de: dados.data, ate: dados.data, uf: uf || '', abrir: true });
  }

  corpo.addEventListener('click', (e) => {
    if (e.target.closest('[data-fat-notas]')) { e.preventDefault(); abrirNotas(); return; }
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

  document.getElementById('vgFatAnt').addEventListener('click', () => carregar(somarDias(dados?.data || campoData.value, -1)));
  document.getElementById('vgFatProx').addEventListener('click', () => { if (dados && dados.data < dados.hoje) carregar(somarDias(dados.data, 1)); });
  document.getElementById('vgFatHoje').addEventListener('click', () => carregar(null));
  campoData.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(campoData.value)) carregar(campoData.value); });

  // Carrega quando a Visão geral aparece; atualiza sozinho a cada 5 minutos enquanto mostra o dia de hoje.
  const visivel = () => !pagina.classList.contains('oculto') && !document.hidden;
  const aoMostrar = () => { if (visivel() && (!dados || Date.now() - carregadoEm > 60000)) carregar(dados && dados.data !== dados.hoje ? dados.data : null); };
  new MutationObserver(aoMostrar).observe(pagina, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', () => setTimeout(aoMostrar, 0));
  setInterval(() => { if (visivel() && dados && dados.data === dados.hoje) carregar(null); }, 5 * 60 * 1000);
})();
