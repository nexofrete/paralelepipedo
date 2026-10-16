// =====================================================================
// Filtro de período igual em todas as telas: atalhos (Este mês, Mês passado,
// Últimos 30 dias...) + as datas "de" e "até". Aplica na hora (sem botão
// "Filtrar") e lembra a última escolha de cada tela neste navegador — os
// atalhos são recalculados no dia (Este mês acompanha o mês); datas escolhidas
// à mão ficam como estão.
//   Periodo.html('fv')            → <select id="fvPer"> + #fvDe + #fvAte
//   Periodo.ligar({ select, de, ate, chave, padrao, opcoes, aoMudar(de, ate) })
//   Periodo.atual(chave, padrao)  → { de, ate } (o que a tela deve usar agora)
// =====================================================================
window.Periodo = (() => {
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const ROTULOS = {
    hoje: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', mes: 'Este mês', mes_passado: 'Mês passado', '3m': 'Últimos 3 meses',
    ano: 'Este ano', '12m': 'Últimos 12 meses', tudo: 'Tudo', custom: 'Escolher datas…',
  };
  const PADRAO_OPCOES = ['mes', 'mes_passado', '30d', '3m', 'ano', '12m', 'custom'];

  function calcular(p) {
    const h = new Date(); let de; let ate = new Date(h);
    if (p === 'hoje') de = new Date(h);
    if (p === '7d') { de = new Date(h); de.setDate(de.getDate() - 6); }
    if (p === '30d') { de = new Date(h); de.setDate(de.getDate() - 29); }
    if (p === 'mes') de = new Date(h.getFullYear(), h.getMonth(), 1);
    if (p === 'mes_passado') { de = new Date(h.getFullYear(), h.getMonth() - 1, 1); ate = new Date(h.getFullYear(), h.getMonth(), 0); }
    if (p === '3m') de = new Date(h.getFullYear(), h.getMonth() - 2, 1);
    if (p === 'ano') de = new Date(h.getFullYear(), 0, 1);
    if (p === '12m') de = new Date(h.getFullYear(), h.getMonth() - 11, 1);
    if (p === 'tudo') return { de: '', ate: '' };
    return de ? { de: iso(de), ate: iso(ate) } : null;
  }

  const ler = (chave) => { try { return JSON.parse(localStorage.getItem(`periodo:${chave}`) || 'null'); } catch { return null; } };
  const gravar = (chave, v) => { try { localStorage.setItem(`periodo:${chave}`, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  // O que vale agora para a tela: o atalho guardado (recalculado) ou as datas à mão.
  function atual(chave, padrao = 'mes') {
    const g = ler(chave);
    if (g?.p && g.p !== 'custom') return { p: g.p, ...(calcular(g.p) || calcular(padrao)) };
    if (g?.p === 'custom' && (g.de || g.ate)) return { p: 'custom', de: g.de || '', ate: g.ate || '' };
    return { p: padrao, ...calcular(padrao) };
  }

  function html(prefixo, { titulo = 'Período' } = {}) {
    return `<span class="periodo" role="group" aria-label="${titulo}"><select id="${prefixo}Per" class="cte-entrada" aria-label="${titulo}"></select>
      <input type="date" id="${prefixo}De" class="cte-entrada" aria-label="De" /><span class="periodo-ate">até</span><input type="date" id="${prefixo}Ate" class="cte-entrada" aria-label="Até" /></span>`;
  }

  function ligar({ select, de, ate, chave, padrao = 'mes', opcoes = PADRAO_OPCOES, aoMudar }) {
    if (!select || !de || !ate) return null;
    const lista = opcoes.includes('custom') ? opcoes : [...opcoes, 'custom'];
    select.innerHTML = lista.map((k) => `<option value="${k}">${ROTULOS[k]}</option>`).join('');
    const ini = atual(chave, padrao);
    select.value = lista.includes(ini.p) ? ini.p : padrao;
    de.value = ini.de || ''; ate.value = ini.ate || '';
    select.closest('.periodo')?.classList.toggle('periodo-tudo', select.value === 'tudo');
    const avisar = () => { gravar(chave, { p: select.value, de: de.value, ate: ate.value }); if (aoMudar) aoMudar(de.value, ate.value, select.value); };
    select.addEventListener('change', () => {
      select.closest('.periodo')?.classList.toggle('periodo-tudo', select.value === 'tudo');
      if (select.value === 'custom') { gravar(chave, { p: 'custom', de: de.value, ate: ate.value }); de.focus(); return; }
      const c = calcular(select.value); de.value = c.de; ate.value = c.ate; avisar();
    });
    [de, ate].forEach((el) => el.addEventListener('change', () => {
      if (de.value && ate.value && de.value > ate.value) { (el === de ? ate : de).value = el.value; }
      select.value = 'custom'; select.closest('.periodo')?.classList.remove('periodo-tudo'); avisar();
    }));
    return { de: () => de.value, ate: () => ate.value, preset: () => select.value };
  }

  return { calcular, atual, html, ligar, ROTULOS };
})();
