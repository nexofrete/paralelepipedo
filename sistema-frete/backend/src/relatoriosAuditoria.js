// Relatórios de auditoria de frete (tela 327, Gestão e relatórios): os números 11 a 24 da lista da empresa. Montado por
// src/relatoriosEntregas.js, com as mesmas bases e filtros. Usa as regras que já existem, para os números baterem com as
// telas de auditoria:
//  - Frete pela tabela: valor_total_frete (ou valor_total_calculado) gravado pelo cálculo (src/calculoFrete.js); a
//    diferença conta só fora da tolerância (src/toleranciaAuditoria.js: geral, por transportadora e por componente).
//  - Componente a componente, taxas não previstas, peso/volumes e ICMS: conferirFrete() de src/auditoriaDetalhada.js.
//  - Resultado (glosas, créditos, barrados, aprovado divergente, em apuração): src/resultadoAuditoria.js.
//  - Distância: o CT-e e as tabelas não trazem km; é estimada em linha reta entre as cidades do CT-e (base offline de
//    municípios) × 1,2 (fator de estrada), só para comparar frete por km entre CT-e parecidos.
const tolMod = require('./toleranciaAuditoria');
const det = require('./auditoriaDetalhada');
const { municipio, distanciaKm } = require('./roteirizacao/municipios');

module.exports = function criar(h) {
  const { consulta, filtros } = h;
  const r2 = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);
  const div = (a, b) => (b ? a / b : null);
  const destino = (r) => [r.cidade, r.uf].filter(Boolean).join('/');
  const json = (v) => { if (v == null || typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };
  const FATOR_ESTRADA = 1.2;
  const LIMITE = 5000;

  // Decisão da auditoria sobre o CT-e.
  function decisao(r) {
    if (r.cte_nao_levou) return 'Barrado (não levou)';
    if (r.status_aprovacao === 'Rejeitado') return 'Reprovado';
    if (Number(r.glosa_valor) > 0) return `Glosado R$ ${Number(r.glosa_valor).toFixed(2).replace('.', ',')}`;
    if (r.status === 'Frete Retido') return 'Retido';
    if (r.status === 'Faturado' || r.fatura_id) return 'Faturado';
    if (r.status_aprovacao === 'Aprovado') return String(r.aprovado_por_nome || '').startsWith('Regra automática') ? 'Aprovado por regra' : String(r.aprovado_por_nome || '').startsWith('Sistema') ? 'Liberado (confere)' : 'Aprovado';
    if (['Liberado p/ Pagamento', 'Conferido'].includes(r.status)) return 'Liberado';
    return r.status || 'Pendente';
  }

  // Os CT-e do período, auditados: total × tabela e a conferência em detalhe (componentes, peso, ICMS).
  async function auditar(req, q, de, ate, { comComplementar = false, onde = '' } = {}) {
    const params = [de, ate]; const extra = filtros(q, params);
    const { rows } = await consulta(req, `SELECT ${det.CAMPOS}, f.valor_total_calculado, f.glosa_valor, f.status_aprovacao, f.aprovado_por_nome, f.cte_nao_levou, f.fatura_id,
        f.cliente, f.cidade, f.uf, f.transportadora, f.cte_cidade_inicio, f.cte_cidade_fim, f.cubagem_m3, f.valor_faturado, f.redespacho, f.cidade_redespacho, f.tabela_preco_id_usada,
        COALESCE(f.transportadora_cte, f.transportadora) AS transp, to_char(f.data_emissao_cte, 'YYYY-MM-DD') AS data_cte,
        (SELECT p.numero_nf FROM fretes p WHERE p.id = f.frete_principal_id) AS nf_principal
      FROM fretes f
      WHERE f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado')
        ${comComplementar ? '' : "AND COALESCE(f.vinculo_cte, '') <> 'complementar' AND COALESCE(f.tipo_cte, '0') <> '1'"}
        AND f.data_emissao_cte BETWEEN $1::date AND $2::date${onde}${extra}
      ORDER BY f.data_emissao_cte DESC, f.numero_cte DESC LIMIT ${LIMITE + 1}`, params);
    const tol = await tolMod.carregar();
    const somas = await det.somasCobertas(rows.slice(0, LIMITE).map((r) => r.id));
    const lista = rows.slice(0, LIMITE).map((r) => {
      const cobrado = r.valor_total_cte != null ? Number(r.valor_total_cte) : null;
      const tabela = r.valor_total_frete != null ? Number(r.valor_total_frete) : r.valor_total_calculado != null ? Number(r.valor_total_calculado) : null;
      const dif = cobrado != null && tabela != null ? r2(cobrado - tabela) : null;
      const tolR = tabela != null ? tolMod.valorDe(tol, r.transportadora_id_tol, 'total', tabela) : null;
      const situacao = tabela == null ? 'Sem tabela' : dif > tolR + 0.004 ? 'Acima da tabela' : -dif > tolR + 0.004 ? 'Abaixo da tabela' : 'Confere';
      let a = null; try { a = det.conferirFrete(r, tol, somas.get(r.id)); } catch { a = null; }
      return { ...r, nf: r.numero_nf || r.nf_principal || '', id_nota: r.frete_principal_id || r.id, cobrado, tabela, dif, pct_dif: dif != null ? div(dif, tabela) : null,
        situacao, decisao: decisao(r), a, soma: somas.get(r.id) };
    });
    return { lista, mais: rows.length > LIMITE };
  }
  const base = (l) => ({ id: l.id_nota, data_cte: l.data_cte, numero_cte: l.numero_cte, nf: l.nf, transportadora: l.transp, cliente: l.cliente, destino: destino(l) });
  const COL_BASE = [['data_cte', 'Emissão CT-e', 'data'], ['numero_cte', 'CT-e'], ['nf', 'NF'], ['transportadora', 'Transportadora']];
  const soma = (ls, k) => ls.reduce((t, l) => t + (Number(l[k]) || 0), 0);

  // Por transportadora ou por mês, do resultado da auditoria (o mesmo da tela "Resultado da auditoria").
  async function resultado(req, q, de, ate) { return require('./resultadoAuditoria').gerar(req, { de, ate, transportadora: q.transportadora }); }
  const COL_RES = [['ctes', 'CT-e', 'num'], ['divergentes', 'Divergentes', 'num'], ['cobrado_a_mais', 'Cobrado a mais', 'moeda'], ['glosas', 'Glosas', 'moeda'], ['creditos', 'Créditos', 'moeda'],
    ['barrados', 'CT-e barrados', 'moeda'], ['recuperado', 'Recuperado', 'moeda'], ['pct_rec', 'Recuperado do cobrado a mais', 'pct'], ['aprovado_divergente', 'Aprovado divergente', 'moeda'],
    ['em_apuracao', 'Em apuração (retidos)', 'moeda']];
  const linhaRes = (x) => ({ ...x, pct_rec: x.pct_recuperado == null ? null : x.pct_recuperado / 100 });

  // Lista do relatório 11 (também o detalhe dos agrupados): cada CT-e com cobrado × tabela, apontamentos e decisão.
  async function listaAuditoria(req, q, de, ate, filtro = null) {
        const { lista: todos, mais } = await auditar(req, q, de, ate);
        const lista = filtro ? todos.filter(filtro) : todos;
        const linhas = lista.map((l) => ({ ...base(l), cobrado: l.cobrado, tabela: l.tabela, dif: l.dif, situacao: l.situacao, apont: l.a?.apontamentos.length || 0,
          apontamentos: (l.a?.apontamentos || []).map((p) => p.texto).join(' · '), decisao: l.decisao }));
        const conta = (s) => linhas.filter((l) => l.situacao === s).length;
        return {
          colunas: [...COL_BASE, ['cobrado', 'Cobrado', 'moeda'], ['tabela', 'Pela tabela', 'moeda'], ['dif', 'Diferença', 'difcusto'], ['situacao', 'Situação', 'auditoria'],
            ['apont', 'Apontamentos', 'num'], ['decisao', 'Decisão'], ['apontamentos', 'O que a conferência achou']],
          linhas, mais,
          resumo: [['CT-e auditados', linhas.length], ['Conferem', conta('Confere')], ['Acima da tabela', conta('Acima da tabela')], ['Abaixo da tabela', conta('Abaixo da tabela')],
            ['Sem tabela', conta('Sem tabela')], ['Com apontamento', linhas.filter((l) => l.apont).length], ['Cobrado', soma(linhas, 'cobrado'), 'moeda']],
        };
  }
  const daTransp = (req, q, de, ate, valor) => listaAuditoria(req, q, de, ate, (l) => (l.transp || '') === valor || (l.transportadora || '') === valor);

  return {
    11: { titulo: 'Auditoria de CT-e', grupo: 'Conferência', tela: 'auditoria', desc: 'Cada CT-e emitido no período: valor cobrado × frete pela tabela (dentro ou fora da tolerância), os apontamentos da conferência (componentes, taxas, peso, ICMS) e a decisão da auditoria.',
      rodar: (req, q, de, ate) => listaAuditoria(req, q, de, ate) },
    12: { titulo: 'Divergência de frete', grupo: 'Conferência', tela: 'auditoria', desc: 'CT-e do período cujo valor cobrado difere do frete calculado pela tabela além da tolerância (para mais ou para menos), com os componentes que explicam a diferença.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await auditar(req, q, de, ate);
        const linhas = lista.filter((l) => ['Acima da tabela', 'Abaixo da tabela'].includes(l.situacao)).map((l) => ({ ...base(l), cobrado: l.cobrado, tabela: l.tabela, dif: l.dif, pct_dif: l.pct_dif,
          situacao: l.situacao, componentes: (l.a?.componentes || []).filter((x) => x.situacao !== 'ok' && x.diferenca).map((x) => `${x.nome} ${x.diferenca > 0 ? '+' : ''}${x.diferenca.toFixed(2).replace('.', ',')}`).join(' · '),
          tabela_nome: json(l.auditoria_calculo)?.tabela_nome || '', decisao: l.decisao }));
        const acima = linhas.filter((l) => l.dif > 0); const abaixo = linhas.filter((l) => l.dif < 0);
        return {
          colunas: [...COL_BASE, ['cliente', 'Cliente'], ['cobrado', 'Cobrado', 'moeda'], ['tabela', 'Calculado', 'moeda'], ['dif', 'Diferença', 'difcusto'], ['pct_dif', '%', 'varcusto'],
            ['situacao', 'Situação', 'auditoria'], ['componentes', 'Onde está a diferença'], ['tabela_nome', 'Tabela'], ['decisao', 'Decisão']],
          linhas, mais,
          resumo: [['Divergentes', linhas.length], ['Acima', acima.length], ['Cobrado a mais', soma(acima, 'dif'), 'moeda'], ['Abaixo', abaixo.length], ['Cobrado a menos', -soma(abaixo, 'dif'), 'moeda']],
        };
      } },
    13: { detalhe: daTransp, titulo: 'Frete contratado x cobrado', grupo: 'Conferência', tela: 'auditoria', desc: 'Por transportadora: o frete contratado (pela tabela negociada) × o que foi cobrado nos CT-e do período, e quantos CT-e conferem, vieram acima, abaixo ou sem tabela.',
      rodar: async (req, q, de, ate) => {
        const { lista } = await auditar(req, q, de, ate);
        const m = new Map();
        for (const l of lista) {
          const g = m.get(l.transp) || { grupo: l.transp || '(sem transportadora)', ctes: 0, contratado: 0, cobrado_tab: 0, cobrado: 0, confere: 0, acima: 0, abaixo: 0, sem_tabela: 0, sem_tabela_valor: 0 };
          g.ctes += 1; g.cobrado += l.cobrado || 0;
          if (l.tabela != null) { g.contratado += l.tabela; g.cobrado_tab += l.cobrado || 0; } else g.sem_tabela_valor += l.cobrado || 0;
          g[{ Confere: 'confere', 'Acima da tabela': 'acima', 'Abaixo da tabela': 'abaixo', 'Sem tabela': 'sem_tabela' }[l.situacao]] += 1;
          m.set(l.transp, g);
        }
        const linhas = [...m.values()].map((g) => ({ ...g, contratado: r2(g.contratado), cobrado: r2(g.cobrado), dif: r2(g.cobrado_tab - g.contratado), pct: div(g.cobrado_tab - g.contratado, g.contratado) }))
          .sort((a, b) => b.cobrado - a.cobrado);
        return {
          colunas: [['grupo', 'Transportadora'], ['ctes', 'CT-e', 'num'], ['contratado', 'Contratado (tabela)', 'moeda'], ['cobrado', 'Cobrado', 'moeda'], ['dif', 'Diferença', 'difcusto'], ['pct', '%', 'varcusto'],
            ['confere', 'Conferem', 'num'], ['acima', 'Acima', 'num'], ['abaixo', 'Abaixo', 'num'], ['sem_tabela', 'Sem tabela', 'num'], ['sem_tabela_valor', 'Cobrado sem tabela', 'moeda']],
          linhas, agrupado: true,
          resumo: [['Contratado', soma(linhas, 'contratado'), 'moeda'], ['Cobrado (com tabela)', soma(linhas, 'cobrado_tab'), 'moeda'], ['Diferença', soma(linhas, 'dif'), 'moeda'],
            ['Cobrado sem tabela', soma(linhas, 'sem_tabela_valor'), 'moeda']],
        };
      } },
    14: { detalhe: daTransp, titulo: 'Auditoria por transportadora', grupo: 'Resultado', tela: 'auditoria', desc: 'Erros, divergências e cobranças de cada transportadora no período (o mesmo cálculo da tela Resultado da auditoria), com os apontamentos da conferência em detalhe. Só o filtro de transportadora vale aqui.',
      rodar: async (req, q, de, ate) => {
        const [res, { lista }] = await Promise.all([resultado(req, q, de, ate), auditar(req, { transportadora: q.transportadora }, de, ate)]);
        const ap = new Map();
        for (const l of lista) {
          const g = ap.get(l.transp) || { apontamentos: 0, taxas: 0, peso: 0, icms: 0 };
          for (const p of l.a?.apontamentos || []) { g.apontamentos += 1; if (p.codigo === 'TAXA_NAO_PREVISTA') g.taxas += 1; if (p.codigo === 'PESO') g.peso += 1; if (/^ICMS|CFOP/.test(p.codigo)) g.icms += 1; }
          ap.set(l.transp, g);
        }
        const nomes = new Set([...res.por_transportadora.map((t) => t.chave)]);
        const linhas = res.por_transportadora.map((t) => ({ grupo: t.chave, ...linhaRes(t), ...(ap.get(t.chave) || {}) }));
        for (const [k, g] of ap) if (!nomes.has(k) && g.apontamentos) linhas.push({ grupo: k || '(sem transportadora)', ...g });
        return {
          colunas: [['grupo', 'Transportadora'], ...COL_RES, ['apontamentos', 'Apontamentos', 'num'], ['taxas', 'Taxas não previstas', 'num'], ['peso', 'Peso', 'num'], ['icms', 'ICMS / CFOP', 'num']],
          linhas, agrupado: true,
          resumo: [['Transportadoras', linhas.length], ['Cobrado a mais', res.total.cobrado_a_mais, 'moeda'], ['Recuperado', res.total.recuperado, 'moeda'], ['Em apuração', res.total.em_apuracao, 'moeda'],
            ['Aprovado divergente', res.total.aprovado_divergente, 'moeda']],
        };
      } },
    15: { detalhe: (req, q, de, ate, valor) => listaAuditoria(req, q, de, ate, (l) => String(l.data_cte || '').startsWith(valor)), drill: 'mes', titulo: 'Auditoria por período', grupo: 'Resultado', tela: 'auditoria', desc: 'Total de divergências mês a mês no período (pela emissão do CT-e): CT-e, divergentes, cobrado a mais, recuperado e o que ficou em apuração. Só o filtro de transportadora vale aqui.',
      rodar: async (req, q, de, ate) => {
        const res = await resultado(req, q, de, ate);
        const linhas = res.por_mes.map((m) => ({ mes: m.chave, ...linhaRes(m), pct_div: div(m.divergentes, m.ctes) })).reverse();
        return {
          colunas: [['mes', 'Mês', 'mes'], ['ctes', 'CT-e', 'num'], ['divergentes', 'Divergentes', 'num'], ['pct_div', '% divergentes', 'atraso'], ...COL_RES.slice(2)],
          linhas, agrupado: true,
          resumo: [['CT-e', res.total.ctes], ['Divergentes', res.total.divergentes], ['Cobrado a mais', res.total.cobrado_a_mais, 'moeda'], ['Recuperado', res.total.recuperado, 'moeda'],
            ['Recuperado do cobrado a mais', res.total.pct_recuperado == null ? null : res.total.pct_recuperado / 100, 'pct']],
        };
      } },
    16: { titulo: 'Cobranças indevidas', grupo: 'Cobranças', tela: 'auditoria', desc: 'O que os CT-e do período cobraram indevidamente: componente acima da tabela ou taxa que a tabela não prevê (parcelas só trocadas, com o total certo, não contam), com a decisão de cada um.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await auditar(req, q, de, ate);
        const linhas = []; const porComp = {};
        for (const l of lista) {
          if (!l.a || !(l.a.a_mais > 0)) continue;
          const comps = l.a.componentes.filter((x) => ['a_mais', 'nao_autorizada'].includes(x.situacao) && x.tabela != null);
          comps.forEach((x) => { porComp[x.nome] = (porComp[x.nome] || 0) + x.diferenca; });
          linhas.push({ ...base(l), cobrado: l.cobrado, tabela: l.tabela, indevido: l.a.a_mais,
            motivo: comps.map((x) => `${x.nome}${x.situacao === 'nao_autorizada' ? ' (não prevista)' : ''} +${x.diferenca.toFixed(2).replace('.', ',')}`).join(' · ') || 'Total acima da tabela',
            decisao: l.decisao, glosa: Number(l.glosa_valor) || 0 });
        }
        linhas.sort((a, b) => b.indevido - a.indevido);
        const top = Object.entries(porComp).sort((a, b) => b[1] - a[1]).slice(0, 3);
        return {
          colunas: [...COL_BASE, ['cliente', 'Cliente'], ['cobrado', 'Cobrado', 'moeda'], ['tabela', 'Pela tabela', 'moeda'], ['indevido', 'Cobrado indevidamente', 'moeda'], ['motivo', 'O quê'],
            ['decisao', 'Decisão'], ['glosa', 'Glosado', 'moeda']],
          linhas, mais,
          resumo: [['CT-e', linhas.length], ['Cobrado indevidamente', soma(linhas, 'indevido'), 'moeda'], ['Já glosado', soma(linhas, 'glosa'), 'moeda'], ...top.map(([k, v]) => [k, v, 'moeda'])],
        };
      } },
    17: { titulo: 'Fretes acima da tabela', grupo: 'Cobranças', tela: 'auditoria', desc: 'CT-e do período cobrados acima do frete contratado (fora da tolerância), do maior excesso para o menor, com a decisão da auditoria.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await auditar(req, q, de, ate);
        const linhas = lista.filter((l) => l.situacao === 'Acima da tabela').map((l) => ({ ...base(l), cobrado: l.cobrado, tabela: l.tabela, dif: l.dif, pct_dif: l.pct_dif, decisao: l.decisao, glosa: Number(l.glosa_valor) || 0 }))
          .sort((a, b) => b.dif - a.dif);
        const retidos = linhas.filter((l) => l.decisao === 'Retido');
        return {
          colunas: [...COL_BASE, ['cliente', 'Cliente'], ['destino', 'Cidade/UF'], ['cobrado', 'Cobrado', 'moeda'], ['tabela', 'Contratado', 'moeda'], ['dif', 'Acima', 'difcusto'], ['pct_dif', '%', 'varcusto'],
            ['decisao', 'Decisão'], ['glosa', 'Glosado', 'moeda']],
          linhas, mais,
          resumo: [['CT-e acima', linhas.length], ['Cobrado a mais', soma(linhas, 'dif'), 'moeda'], ['Ainda retidos', retidos.length], ['A mais nos retidos', soma(retidos, 'dif'), 'moeda'], ['Já glosado', soma(linhas, 'glosa'), 'moeda']],
        };
      } },
    18: { titulo: 'Fretes abaixo da tabela', grupo: 'Cobranças', tela: 'auditoria', desc: 'CT-e do período cobrados abaixo do frete calculado (fora da tolerância). Muitos da mesma transportadora costumam indicar tabela desatualizada no sistema.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await auditar(req, q, de, ate);
        const linhas = lista.filter((l) => l.situacao === 'Abaixo da tabela').map((l) => ({ ...base(l), cobrado: l.cobrado, tabela: l.tabela, dif: l.dif, pct_dif: l.pct_dif,
          tabela_nome: json(l.auditoria_calculo)?.tabela_nome || '', decisao: l.decisao })).sort((a, b) => a.dif - b.dif);
        const porT = {}; linhas.forEach((l) => { porT[l.transportadora] = (porT[l.transportadora] || 0) + 1; });
        const maisT = Object.entries(porT).sort((a, b) => b[1] - a[1])[0];
        return {
          colunas: [...COL_BASE, ['cliente', 'Cliente'], ['destino', 'Cidade/UF'], ['cobrado', 'Cobrado', 'moeda'], ['tabela', 'Calculado', 'moeda'], ['dif', 'Abaixo', 'difcusto'], ['pct_dif', '%', 'varcusto'],
            ['tabela_nome', 'Tabela usada'], ['decisao', 'Decisão']],
          linhas, mais,
          resumo: [['CT-e abaixo', linhas.length], ['Cobrado a menos', -soma(linhas, 'dif'), 'moeda'], ['Transportadora com mais', maisT ? `${maisT[0]} (${maisT[1]})` : '—', 'texto']],
        };
      } },
    19: { titulo: 'Auditoria de ICMS', grupo: 'Impostos e taxas', tela: 'auditoria', desc: 'ICMS de cada CT-e do período: CST, base, alíquota cobrada × esperada pela rota (7% ou 12%; no redespacho, o trecho até o redespacho), valor × base × alíquota e o CFOP.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await auditar(req, q, de, ate, { comComplementar: true });
        const NOME = { base: 'Base', valor: 'Valor', aliquota: 'Alíquota', cfop: 'CFOP' };
        const linhas = lista.filter((l) => l.a?.icms).map((l) => {
          const i = l.a.icms;
          return { ...base(l), rota: i.rota || [i.uf_ini, i.uf_fim].filter(Boolean).join('→'), cst: i.cst, cfop: i.cfop, prestacao: l.a.vTPrest, base: i.base, aliquota: i.aliquota, aliquota_esperada: i.aliquota_esperada ?? null,
            valor: i.valor, valor_esperado: i.valor_esperado ?? null, dif_icms: i.valor != null && i.valor_esperado != null ? r2(i.valor - i.valor_esperado) : null,
            conferencia: i.checagens.length ? `${i.checagens.map((c) => NOME[c] || c).join(', ')} diferente` : i.cst == null ? 'Sem ICMS no XML' : 'Confere',
            detalhe: l.a.apontamentos.filter((p) => /^ICMS|CFOP/.test(p.codigo)).map((p) => p.texto).join(' · ') };
        });
        const conta = (c) => linhas.filter((l) => l.conferencia.includes(c)).length;
        return {
          colunas: [...COL_BASE, ['rota', 'Rota'], ['cst', 'CST'], ['cfop', 'CFOP'], ['prestacao', 'Prestação', 'moeda'], ['base', 'Base', 'moeda'], ['aliquota', 'Alíquota %', 'dec'],
            ['aliquota_esperada', 'Esperada %', 'dec'], ['valor', 'ICMS', 'moeda'], ['valor_esperado', 'Esperado', 'moeda'], ['conferencia', 'Conferência', 'confere'], ['detalhe', 'Detalhe']],
          linhas, mais,
          resumo: [['CT-e', linhas.length], ['Conferem', conta('Confere')], ['Alíquota diferente', conta('Alíquota')], ['Base diferente', conta('Base')], ['Valor diferente', conta('Valor')],
            ['CFOP diferente', conta('CFOP')], ['ICMS destacado', soma(linhas, 'valor'), 'moeda']],
        };
      } },
    20: { titulo: 'Auditoria de adicionais', grupo: 'Impostos e taxas', tela: 'auditoria', desc: 'Pedágio, GRIS, TDE, TDA, TRT, despacho, descarga e outras taxas de cada CT-e do período, cobrado × tabela (taxa que a tabela não prevê aparece como "não prevista"), mais os CT-e de reentrega.',
      rodar: async (req, q, de, ate) => {
        const [{ lista, mais }, reent] = await Promise.all([auditar(req, q, de, ate), auditar(req, q, de, ate, { onde: " AND f.vinculo_cte = 'reentrega'" })]);
        const SIT = { ok: 'Confere', a_mais: 'Acima da tabela', a_menos: 'Abaixo da tabela', nao_autorizada: 'Não prevista', sem_tabela: 'Sem tabela' };
        const linhas = [];
        for (const l of lista) {
          if (l.vinculo_cte === 'reentrega') continue;
          for (const x of l.a?.componentes || []) {
            if (['frete_peso', 'ad_valorem'].includes(x.chave)) continue;
            linhas.push({ ...base(l), taxa: x.nome, nomes: x.nomes_cte.join(', '), cobrado: x.cobrado, tabela: x.tabela, dif: x.diferenca, situacao: SIT[x.situacao] || x.situacao });
          }
        }
        for (const l of reent.lista) linhas.push({ ...base(l), taxa: 'Reentrega (CT-e)', nomes: '', cobrado: l.cobrado, tabela: l.tabela, dif: l.dif, situacao: l.situacao === 'Confere' ? 'Confere' : l.situacao });
        const porTaxa = {}; linhas.forEach((l) => { porTaxa[l.taxa] = (porTaxa[l.taxa] || 0) + (l.cobrado || 0); });
        const fora = linhas.filter((l) => ['Acima da tabela', 'Não prevista'].includes(l.situacao));
        return {
          colunas: [...COL_BASE, ['taxa', 'Taxa'], ['nomes', 'Nome no CT-e'], ['cobrado', 'Cobrado', 'moeda'], ['tabela', 'Tabela', 'moeda'], ['dif', 'Diferença', 'difcusto'], ['situacao', 'Situação', 'auditoria']],
          linhas, mais,
          resumo: [['Cobranças de taxas', linhas.length], ['Acima ou não previstas', fora.length], ['A mais', soma(fora.filter((l) => l.dif > 0), 'dif'), 'moeda'],
            ...Object.entries(porTaxa).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k, v, 'moeda'])],
        };
      } },
    21: { titulo: 'Auditoria de peso', grupo: 'Peso e distância', tela: 'auditoria', desc: 'Peso real das notas, peso cubado (pela cubagem e o fator da tabela), peso considerado no cálculo e o peso que o CT-e cobrou. Aponta o CT-e que cobrou peso maior que o real e o cubado.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await auditar(req, q, de, ate);
        const num = (re, t) => { const m = String(t || '').match(re); return m ? Number(m[1]) : null; };
        const linhas = lista.filter((l) => l.a).map((l) => {
          const calc = json(l.auditoria_calculo) || {};
          const cubado = num(/cubado ([\d.]+)kg/, calc.explicacao); const considerado = num(/Peso considerado ([\d.]+)kg/, calc.explicacao);
          const real = l.a.peso.nota; const cte = l.a.peso.cte;
          const ref = Math.max(real || 0, cubado || 0);
          const situacao = !cte || !ref ? 'Sem peso para comparar' : cte > ref + Math.max(1, ref * 0.05) ? 'CT-e cobrou peso maior' : cte < (real || 0) - Math.max(1, (real || 0) * 0.05) ? 'CT-e com peso menor' : 'Confere';
          return { ...base(l), real, cubagem: r2(Number(l.cubagem_m3 || 0) + Number(l.soma?.cubagem || 0)) || null, cubado, considerado, cte, dif_peso: cte && ref ? r2(cte - ref) : null,
            frete_kg: cte ? div(l.cobrado, cte) : null, situacao };
        });
        const maior = linhas.filter((l) => l.situacao === 'CT-e cobrou peso maior');
        return {
          colunas: [...COL_BASE, ['real', 'Peso real (notas)', 'dec'], ['cubagem', 'Cubagem (m³)', 'dec'], ['cubado', 'Peso cubado', 'dec'], ['considerado', 'Considerado no cálculo', 'dec'],
            ['cte', 'Peso no CT-e', 'dec'], ['dif_peso', 'Diferença (kg)', 'dec'], ['frete_kg', 'Frete por kg', 'moeda4'], ['situacao', 'Situação', 'confere']],
          linhas, mais,
          resumo: [['CT-e', linhas.length], ['Conferem', linhas.filter((l) => l.situacao === 'Confere').length], ['Peso maior no CT-e', maior.length], ['Kg a mais', soma(maior, 'dif_peso'), 'dec'],
            ['Peso menor no CT-e', linhas.filter((l) => l.situacao === 'CT-e com peso menor').length]],
        };
      } },
    22: { titulo: 'Auditoria de distância', grupo: 'Peso e distância', tela: 'auditoria', desc: 'Distância de cada CT-e (estimada entre as cidades de início e fim do CT-e: linha reta × 1,2), a cidade pela qual a tabela foi calculada e o frete por km. Aponta a tarifa de outra cidade e o frete por km bem acima do padrão da transportadora.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await auditar(req, q, de, ate);
        const plano = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
        const linhas = lista.map((l) => {
          const o = municipio({ cidade: l.cte_cidade_inicio, uf: l.uf_inicio_cte }); const d = municipio({ cidade: l.cte_cidade_fim, uf: l.uf_fim_cte });
          const km = o && d ? Math.round(distanciaKm(o, d) * FATOR_ESTRADA) : null;
          const calc = json(l.auditoria_calculo) || {};
          const tarifada = calc.cidade_usada || calc.destino || '';
          const outra = tarifada && l.cte_cidade_fim && plano(tarifada).split('/')[0].split(' - ')[0] !== plano(l.cte_cidade_fim);
          return { ...base(l), origem: [l.cte_cidade_inicio, l.uf_inicio_cte].filter(Boolean).join('/'), fim: [l.cte_cidade_fim, l.uf_fim_cte].filter(Boolean).join('/'), tarifada, km,
            frete_km: km ? div(l.cobrado, Math.max(km, 1)) : null, cobrado: l.cobrado, outra };
        });
        // Padrão da transportadora: a mediana do frete por km dos CT-e dela com mais de 30 km.
        const med = {};
        const porT = {}; linhas.forEach((l) => { if (l.frete_km != null && l.km > 30) (porT[l.transportadora] = porT[l.transportadora] || []).push(l.frete_km); });
        for (const [t, v] of Object.entries(porT)) { const s = [...v].sort((a, b) => a - b); med[t] = s.length >= 3 ? s[Math.floor(s.length / 2)] : null; }
        for (const l of linhas) {
          l.mediana = med[l.transportadora] ?? null;
          l.situacao = !l.origem || !l.fim ? 'Sem as cidades no CT-e' : l.km == null ? 'Cidade não localizada' : l.outra ? 'Tarifado por outra cidade' : l.mediana && l.km > 30 && l.frete_km > l.mediana * 1.5 ? 'Frete por km acima do padrão' : 'Confere';
          delete l.outra;
        }
        return {
          colunas: [...COL_BASE, ['origem', 'Início do CT-e'], ['fim', 'Fim do CT-e'], ['tarifada', 'Cidade da tabela'], ['km', 'Km (estimado)', 'num'], ['cobrado', 'Cobrado', 'moeda'],
            ['frete_km', 'Frete por km', 'moeda'], ['mediana', 'Padrão da transportadora (R$/km)', 'moeda'], ['situacao', 'Situação', 'confere']],
          linhas, mais,
          resumo: [['CT-e', linhas.length], ['Km estimados', soma(linhas, 'km')], ['Tarifado por outra cidade', linhas.filter((l) => l.situacao === 'Tarifado por outra cidade').length],
            ['Frete por km acima do padrão', linhas.filter((l) => l.situacao === 'Frete por km acima do padrão').length], ['Sem cidade ou não localizada', linhas.filter((l) => ['Cidade não localizada', 'Sem as cidades no CT-e'].includes(l.situacao)).length]],
        };
      } },
    23: { titulo: 'Auditoria de redespacho', grupo: 'Peso e distância', tela: 'auditoria', desc: 'Notas com redespacho: o CT-e da 1ª transportadora (até a cidade do redespacho) e o da transportadora do redespacho, cada um × a tabela, o custo total e as notas sem o CT-e do redespacho.',
      rodar: async (req, q, de, ate) => {
        const params = [de, ate]; const extra = filtros(q, params);
        const { rows } = await consulta(req, `SELECT f.id, f.numero_nf, f.cliente, f.cidade, f.uf, f.redespacho, f.cidade_redespacho, f.valor_faturado::float AS valor_nf,
            COALESCE(f.transportadora_cte, f.transportadora) AS transportadora, f.numero_cte, f.valor_total_cte::float AS frete1, COALESCE(f.valor_total_frete, f.valor_total_calculado)::float AS tabela1,
            to_char(COALESCE(f.data_emissao_cte, f.data_emissao_nf), 'YYYY-MM-DD') AS data,
            r.numero_cte AS cte_red, r.transportadora_cte AS transp_red, r.valor_total_cte::float AS frete2, COALESCE(r.valor_total_frete, r.valor_total_calculado)::float AS tabela2
          FROM fretes f
          LEFT JOIN LATERAL (SELECT c.* FROM fretes c WHERE c.frete_principal_id = f.id AND c.vinculo_cte IN ('redespacho', 'redespacho_nota') AND c.chave_cte IS NOT NULL AND c.cte_cancelado IS NOT TRUE
                             ORDER BY c.id DESC LIMIT 1) r ON TRUE
          WHERE f.frete_principal_id IS NULL AND COALESCE(f.redespacho, '') <> '' AND f.nf_cancelada IS NOT TRUE
            AND COALESCE(f.data_emissao_cte, f.data_emissao_nf) BETWEEN $1::date AND $2::date${extra}
          ORDER BY 13 DESC LIMIT 5001`, params);
        const tol = await tolMod.carregar();
        const sit = (cob, tab) => (cob == null ? null : tab == null ? 'Sem tabela' : cob - tab > tolMod.valorDe(tol, null, 'total', tab) + 0.004 ? 'Acima da tabela' : tab - cob > tolMod.valorDe(tol, null, 'total', tab) + 0.004 ? 'Abaixo da tabela' : 'Confere');
        const linhas = rows.slice(0, 5000).map((r) => {
          const s1 = r.numero_cte ? sit(r.frete1, r.tabela1) : 'Sem CT-e';
          const s2 = r.cte_red ? sit(r.frete2, r.tabela2) : 'Sem CT-e do redespacho';
          const total = (r.frete1 || 0) + (r.frete2 || 0);
          return { id: r.id, data_cte: r.data, numero_cte: r.numero_cte, nf: r.numero_nf, transportadora: r.transportadora, cliente: r.cliente, destino: destino(r), cidade_red: r.cidade_redespacho, redespacho: r.redespacho,
            frete1: r.frete1, tabela1: r.tabela1, cte_red: r.cte_red, frete2: r.frete2, tabela2: r.tabela2, total: r2(total), pct: div(total, r.valor_nf),
            situacao: [s1, s2].filter((s) => s && s !== 'Confere').join(' · ') || 'Confere' };
        });
        return {
          colunas: [['data_cte', 'Data', 'data'], ['nf', 'NF'], ['cliente', 'Cliente'], ['destino', 'Destino'], ['transportadora', '1ª transportadora'], ['numero_cte', 'CT-e'], ['frete1', 'Frete até o redespacho', 'moeda'],
            ['tabela1', 'Tabela', 'moeda'], ['cidade_red', 'Cidade do redespacho'], ['redespacho', 'Redespacho'], ['cte_red', 'CT-e redespacho'], ['frete2', 'Frete do redespacho', 'moeda'], ['tabela2', 'Tabela', 'moeda'],
            ['total', 'Custo total', 'moeda'], ['pct', 'Frete / valor da nota', 'pct'], ['situacao', 'Situação', 'confere']],
          linhas, mais: rows.length > 5000,
          resumo: [['Notas com redespacho', linhas.length], ['Custo total', soma(linhas, 'total'), 'moeda'], ['Sem CT-e do redespacho', linhas.filter((l) => !l.cte_red).length],
            ['Com valor acima da tabela', linhas.filter((l) => l.situacao.includes('Acima')).length], ['Frete / valor das notas', div(soma(linhas, 'total'), soma(rows, 'valor_nf')), 'pct']],
        };
      } },
    24: { detalhe: daTransp, titulo: 'Economia gerada pela auditoria', grupo: 'Resultado', tela: 'auditoria', desc: 'Valores recuperados (glosas manuais, por regra e por contestação, créditos abatidos em fatura e CT-e barrados) e evitados (o que os CT-e ainda retidos cobram a mais), por transportadora. Só o filtro de transportadora vale aqui.',
      rodar: async (req, q, de, ate) => {
        const res = await resultado(req, q, de, ate);
        const linhas = res.por_transportadora.map((t) => ({ grupo: t.chave, glosas_manual: t.glosas_manual, glosas_regra: t.glosas_regra, glosas_contestacao: t.glosas_contestacao, creditos: t.creditos,
          barrados: t.barrados, recuperado: t.recuperado, em_apuracao: t.em_apuracao, economia: r2(t.recuperado + t.em_apuracao), cobrado_a_mais: t.cobrado_a_mais, pct_rec: t.pct_recuperado == null ? null : t.pct_recuperado / 100 }))
          .sort((a, b) => b.economia - a.economia);
        const T = res.total;
        return {
          colunas: [['grupo', 'Transportadora'], ['glosas_manual', 'Glosas manuais', 'moeda'], ['glosas_regra', 'Glosas por regra', 'moeda'], ['glosas_contestacao', 'Por contestação', 'moeda'],
            ['creditos', 'Créditos em fatura', 'moeda'], ['barrados', 'CT-e barrados', 'moeda'], ['recuperado', 'Recuperado', 'moeda'], ['em_apuracao', 'Evitado (retido)', 'moeda'],
            ['economia', 'Economia total', 'moeda'], ['cobrado_a_mais', 'Cobrado a mais', 'moeda'], ['pct_rec', 'Recuperado do cobrado a mais', 'pct']],
          linhas, agrupado: true,
          resumo: [['Economia total', r2(T.recuperado + T.em_apuracao), 'moeda'], ['Recuperado', T.recuperado, 'moeda'], ['Glosas', T.glosas, 'moeda'], ['Créditos', T.creditos, 'moeda'],
            ['CT-e barrados', T.barrados, 'moeda'], ['Evitado (retido)', T.em_apuracao, 'moeda']],
        };
      } },
  };
};
