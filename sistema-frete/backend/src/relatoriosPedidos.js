// Relatórios de pedidos (tela 407, embarcador): os números 107 a 116. Montado por src/relatoriosEntregas.js (mesmo
// Excel, PDF, impressão, totalizador, gráfico e drill-down das outras telas de relatórios); rota /api/relatorios-pedidos.
// Os dados vêm da tela Pedidos (src/pedidos.js: planilha Timeline do ERP + WMS + liberação comercial + observações), com
// o mesmo filtro de status/tipo do ERP e a mesma restrição de cliente do usuário.
//  107 Separados e ainda sem nota fiscal          108 Em separação sem separador apontado
//  109 Liberados aguardando separação (fila)      110 Tempo de cada etapa (ciclo do pedido)
//  111 Produtividade por separador                112 Pedidos parados além do limite (gargalos)
//  113 Resumo por situação                        114 Pedidos com observação
//  115 Etiquetas impressas por usuário            116 Entrada × saída por dia (liberados, separados, faturados)
const hojeSP = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

const T = 'pedidos';
// Limites de cada etapa (horas) para dizer que o pedido está parado.
const LIMITE = { 'Aguardando nota': 24, Integrado: 24, 'Em separação': 4, 'Em conferência': 4, Separado: 8 };

// "Agora" no horário de Brasília, no mesmo formato que a tela Pedidos usa ("AAAA-MM-DD HH:MM").
const agoraSP = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);
const ms = (t) => (t ? Date.parse(`${String(t).slice(0, 16).replace(' ', 'T')}${String(t).length <= 10 ? 'T12:00' : ''}Z`) : NaN);
// Horas entre dois momentos ("AAAA-MM-DD HH:MM" ou só a data); null se faltar um deles ou a ordem não fizer sentido.
const horas = (de, ate) => { const a = ms(de); const b = ms(ate); return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 360000) / 10 : null; };
const media = (ls) => { const v = ls.filter((x) => x != null); return v.length ? Math.round((v.reduce((t, x) => t + x, 0) / v.length) * 10) / 10 : null; };
const soma = (ls, k) => Math.round(ls.reduce((t, l) => t + (Number(l[k]) || 0), 0) * 10) / 10;
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const faixa = (h) => (h == null ? 'Sem data' : h <= 4 ? 'Até 4 h' : h <= 24 ? '4 a 24 h' : h <= 72 ? '1 a 3 dias' : 'Mais de 3 dias');
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Quando o comercial liberou: a data do e-mail (ou digitada); sem ela, a liberação do ERP/WMS.
const liberado = (p) => p.lib_comercial || p.liberado_em || null;

module.exports = function criar() {
  const pedidosMod = () => require('./pedidos');

  // Pedidos da tela Pedidos com os filtros do relatório (cliente, transportadora, separador, nº do pedido).
  async function lista(req, q, de, ate) {
    const r = await pedidosMod().pedidos(req, { de, ate });
    const cli = norm(q.cliente); const cliNum = String(q.cliente || '').replace(/\D/g, '');
    const tr = norm(q.transportadora); const sep = norm(q.separador);
    const nums = String(q.pedido || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    return r.pedidos.filter((p) => (!cli || norm(p.cliente).includes(cli) || norm(p.nome_curto).includes(cli) || (cliNum.length >= 8 && String(p.cnpj || '').includes(cliNum)))
      && (!tr || norm(p.transportadora).includes(tr)) && (!sep || norm(p.separador).includes(sep) || norm(p.usuario).includes(sep))
      && (!nums.length || nums.includes(String(p.pedido))));
  }
  // Relatórios de "agora" (sem período): os pedidos dos últimos 120 dias que ainda estão na etapa.
  const recentes = (req, q) => { const hoje = hojeSP(); return lista(req, q, somarDias(hoje, -120), hoje); };
  const base = (p) => ({ id: p.id, pedido: p.pedido, cliente: p.nome_curto || p.cliente, destino: p.destino || null, peso: p.peso, valor: p.valor, obs: p.obs || null });
  const COL_BASE = [['pedido', 'Pedido'], ['cliente', 'Cliente'], ['destino', 'Destino']];
  const COL_FIM = [['peso', 'Peso (kg)', 'dec'], ['valor', 'Valor', 'moeda'], ['obs', 'Observação']];

  // 107 ---------------------------------------------------------------------------------------------------------------
  async function separadosSemNota(req, q) {
    const agora = agoraSP();
    const linhas = (await recentes(req, q)).filter((p) => p.situacao === 'Separado').map((p) => {
      const fim = p.sep_fim || p.exp_fim || p.etiquetas_em || null; const h = horas(fim, agora);
      const nfSemXml = !!p.nf;
      return { ...base(p), separador: p.separador, sep_fim: p.sep_fim, etiquetas_em: p.etiquetas_em, qtd_etiquetas: p.qtd_etiquetas, nf: p.nf || null, horas: h, situacao: faixa(h),
        decisao: nfSemXml ? 'NF emitida no ERP sem XML aqui: conferir a importação da nota' : h != null && h > 24 ? 'Cobrar o faturamento (separado há mais de 1 dia)' : 'Faturar' };
    }).sort((a, b) => (b.horas ?? -1) - (a.horas ?? -1));
    return {
      colunas: [...COL_BASE, ['situacao', 'Parado há'], ['horas', 'Horas desde a separação', 'dec'], ['sep_fim', 'Fim da separação', 'datahora'], ['separador', 'Separador'],
        ['etiquetas_em', 'Etiquetas impressas', 'datahora'], ['qtd_etiquetas', 'Etiquetas', 'num'], ['nf', 'NF no ERP'], ['decisao', 'O que fazer'], ...COL_FIM],
      linhas,
      resumo: [['Separados sem nota', linhas.length], ['Há mais de 24 h', linhas.filter((l) => (l.horas || 0) > 24).length], ['Com NF no ERP e sem XML', linhas.filter((l) => l.nf).length],
        ['Peso parado (kg)', soma(linhas, 'peso'), 'dec'], ['Valor parado', soma(linhas, 'valor'), 'moeda'], ['Espera média (h)', media(linhas.map((l) => l.horas)), 'dec']],
    };
  }

  // 108 ---------------------------------------------------------------------------------------------------------------
  async function semSeparador(req, q) {
    const agora = agoraSP();
    const linhas = (await recentes(req, q)).filter((p) => ['Em separação', 'Em conferência'].includes(p.situacao) && !p.separador).map((p) => {
      const ini = p.sep_inicio || p.data_inicial || p.etiquetas_em || null; const h = horas(ini, agora);
      const consulta = p.wms_atualizado_em ? horas(p.wms_atualizado_em, agora) : null;
      return { ...base(p), status_wms: p.status_wms, situacao: p.situacao, inicio: ini, horas: h, usuario: p.usuario, etiquetas_em: p.etiquetas_em, exp_wms: p.exp_wms,
        wms_atualizado_em: p.wms_atualizado_em,
        decisao: consulta == null || consulta > 6 ? 'Atualizar do WMS (dado antigo) e, se continuar, apontar o separador' : 'Apontar o separador no WMS (apontamento de separação)' };
    }).sort((a, b) => (b.horas ?? -1) - (a.horas ?? -1));
    return {
      colunas: [...COL_BASE, ['situacao', 'Situação'], ['status_wms', 'Status no WMS'], ['inicio', 'Início', 'datahora'], ['horas', 'Horas em andamento', 'dec'],
        ['usuario', 'Imprimiu as etiquetas'], ['etiquetas_em', 'Etiquetas impressas', 'datahora'], ['exp_wms', 'Expedição WMS'], ['wms_atualizado_em', 'Lido do WMS em', 'datahora'], ['decisao', 'O que fazer'], ...COL_FIM],
      linhas,
      resumo: [['Sem separador', linhas.length], ['Em separação', linhas.filter((l) => l.situacao === 'Em separação').length], ['Em conferência', linhas.filter((l) => l.situacao === 'Em conferência').length],
        ['Há mais de 4 h', linhas.filter((l) => (l.horas || 0) > 4).length], ['Peso (kg)', soma(linhas, 'peso'), 'dec']],
    };
  }

  // 109 ---------------------------------------------------------------------------------------------------------------
  async function filaSeparacao(req, q) {
    const agora = agoraSP();
    const linhas = (await recentes(req, q)).filter((p) => ['Aguardando nota', 'Integrado'].includes(p.situacao) && !p.sep_inicio && !p.etiquetas_em).map((p) => {
      const lib = liberado(p); const h = horas(lib, agora);
      return { ...base(p), lib_comercial: p.lib_comercial, liberado_em: p.liberado_em, data_inicial: p.data_inicial, horas: h, faixa: faixa(h),
        situacao: p.situacao === 'Integrado' ? 'Integrado no WMS' : p.tem_wms ? `No WMS (${p.status_wms || 'sem status'})` : 'Não chegou ao WMS',
        decisao: !p.tem_wms ? 'Conferir se o pedido foi integrado no WMS' : h != null && h > 24 ? 'Priorizar a separação (liberado há mais de 1 dia)' : 'Na fila' };
    }).sort((a, b) => (b.horas ?? -1) - (a.horas ?? -1));
    return {
      colunas: [...COL_BASE, ['situacao', 'No WMS'], ['faixa', 'Aguardando há'], ['horas', 'Horas desde a liberação', 'dec'], ['lib_comercial', 'Liberação comercial', 'datahora'], ['liberado_em', 'Liberação (ERP)', 'datahora'],
        ['data_inicial', 'Integrado no WMS em', 'datahora'], ['decisao', 'O que fazer'], ...COL_FIM],
      linhas,
      resumo: [['Na fila', linhas.length], ['Integrados no WMS', linhas.filter((l) => l.situacao === 'Integrado no WMS').length], ['Não chegaram ao WMS', linhas.filter((l) => l.situacao === 'Não chegou ao WMS').length],
        ['Há mais de 24 h', linhas.filter((l) => (l.horas || 0) > 24).length],
        ['Peso na fila (kg)', soma(linhas, 'peso'), 'dec'], ['Valor na fila', soma(linhas, 'valor'), 'moeda']],
    };
  }

  // 110 ---------------------------------------------------------------------------------------------------------------
  async function ciclo(req, q, de, ate) {
    const linhas = (await lista(req, q, de, ate)).filter((p) => p.situacao !== 'Cancelado').map((p) => {
      const lib = liberado(p);
      const e1 = horas(lib, p.sep_inicio); const e2 = horas(p.sep_inicio, p.sep_fim); const e3 = horas(p.sep_fim, p.etiquetas_em);
      const e4 = p.emissao_nf ? horas(String(p.sep_fim || p.etiquetas_em || '').slice(0, 10) || null, p.emissao_nf) : null;
      const total = horas(lib, p.emissao_nf ? `${p.emissao_nf} 12:00` : null);
      const etapas = { 'Liberação até a separação': e1, Separação: e2, 'Separação até as etiquetas': e3 };
      const maior = Object.entries(etapas).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])[0];
      return { ...base(p), situacao: p.situacao, lib, sep_inicio: p.sep_inicio, sep_fim: p.sep_fim, etiquetas_em: p.etiquetas_em, emissao_nf: p.emissao_nf,
        e1, e2, e3, e4: e4 == null ? null : Math.round(e4 / 24), total_dias: total == null ? null : Math.round(total / 2.4) / 10, gargalo: maior ? maior[0] : null };
    });
    const conta = (k) => linhas.filter((l) => l.gargalo === k).length;
    return {
      colunas: [...COL_BASE, ['situacao', 'Situação'], ['lib', 'Liberado pelo comercial', 'datahora'], ['sep_inicio', 'Início separação', 'datahora'], ['sep_fim', 'Fim separação', 'datahora'],
        ['etiquetas_em', 'Etiquetas', 'datahora'], ['emissao_nf', 'Emissão NF', 'data'], ['e1', 'Liberação → separação (h)', 'dec'], ['e2', 'Separação (h)', 'dec'],
        ['e3', 'Separação → etiquetas (h)', 'dec'], ['e4', 'Separação → NF (dias)', 'num'], ['total_dias', 'Liberação → NF (dias)', 'dec'], ['gargalo', 'Etapa mais demorada'], ['peso', 'Peso (kg)', 'dec']],
      linhas,
      resumo: [['Pedidos', linhas.length], ['Média liberação → separação (h)', media(linhas.map((l) => l.e1)), 'dec'], ['Média da separação (h)', media(linhas.map((l) => l.e2)), 'dec'],
        ['Média separação → etiquetas (h)', media(linhas.map((l) => l.e3)), 'dec'], ['Média separação → NF (dias)', media(linhas.map((l) => l.e4)), 'dec'],
        ['Média liberação → NF (dias)', media(linhas.map((l) => l.total_dias)), 'dec'],
        ['Gargalo mais comum', ['Liberação até a separação', 'Separação', 'Separação até as etiquetas'].sort((a, b) => conta(b) - conta(a))[0] || '—']],
    };
  }

  // 111 ---------------------------------------------------------------------------------------------------------------
  const dosSeparadores = (p) => String(p.separador || '').split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  async function produtividade(req, q, de, ate) {
    const ls = (await lista(req, q, de, ate)).filter((p) => p.separador && p.situacao !== 'Cancelado');
    const g = new Map();
    for (const p of ls) {
      for (const s of dosSeparadores(p)) {
        const x = g.get(s) || { grupo: s, pedidos: 0, finalizados: 0, etiquetas: 0, peso: 0, minutos: [], dias: new Set() };
        x.pedidos += 1; if (p.sep_fim) x.finalizados += 1; x.etiquetas += Number(p.qtd_etiquetas) || 0; x.peso += Number(p.peso) || 0;
        if (p.sep_minutos != null && p.sep_minutos >= 0) x.minutos.push(p.sep_minutos);
        if (p.sep_inicio) x.dias.add(p.sep_inicio.slice(0, 10));
        g.set(s, x);
      }
    }
    const linhas = [...g.values()].map((x) => ({ grupo: x.grupo, pedidos: x.pedidos, finalizados: x.finalizados, etiquetas: x.etiquetas, peso: Math.round(x.peso * 10) / 10,
      tempo_medio: media(x.minutos), dias: x.dias.size, por_dia: x.dias.size ? Math.round((x.pedidos / x.dias.size) * 10) / 10 : null,
      kg_hora: x.minutos.length ? Math.round((x.peso / (x.minutos.reduce((t, m) => t + m, 0) / 60)) * 10) / 10 : null })).sort((a, b) => b.pedidos - a.pedidos);
    return {
      colunas: [['grupo', 'Separador'], ['pedidos', 'Pedidos', 'num'], ['finalizados', 'Finalizados', 'num'], ['etiquetas', 'Etiquetas', 'num'], ['peso', 'Peso (kg)', 'dec'],
        ['tempo_medio', 'Tempo médio por pedido (min)', 'dec'], ['dias', 'Dias trabalhados', 'num'], ['por_dia', 'Pedidos por dia', 'dec'], ['kg_hora', 'Kg por hora', 'dec']],
      linhas, agrupado: true,
      resumo: [['Separadores', linhas.length], ['Pedidos separados', ls.length], ['Tempo médio geral (min)', media(ls.map((p) => p.sep_minutos)), 'dec'],
        ['Pedidos sem separador no período', (await lista(req, q, de, ate)).filter((p) => !p.separador && (p.sep_inicio || p.sep_fim)).length]],
    };
  }
  async function produtividadeDetalhe(req, q, de, ate, valor) {
    const ls = (await lista(req, q, de, ate)).filter((p) => dosSeparadores(p).some((s) => s === valor));
    return { colunas: [...COL_BASE, ['situacao', 'Situação'], ['sep_inicio', 'Início', 'datahora'], ['sep_fim', 'Fim', 'datahora'], ['sep_minutos', 'Minutos', 'num'], ['qtd_etiquetas', 'Etiquetas', 'num'], ['peso', 'Peso (kg)', 'dec']],
      linhas: ls.map((p) => ({ ...base(p), situacao: p.situacao, sep_inicio: p.sep_inicio, sep_fim: p.sep_fim, sep_minutos: p.sep_minutos, qtd_etiquetas: p.qtd_etiquetas })) };
  }

  // 112 ---------------------------------------------------------------------------------------------------------------
  const inicioDaEtapa = (p) => (p.situacao === 'Aguardando nota' ? liberado(p) : p.situacao === 'Integrado' ? (liberado(p) || p.data_inicial) : p.situacao === 'Separado' ? (p.sep_fim || p.exp_fim || p.etiquetas_em)
    : (p.sep_inicio || p.data_inicial || p.etiquetas_em));
  const O_QUE = { 'Aguardando nota': 'Conferir se chegou ao WMS e priorizar', Integrado: 'Priorizar a separação', 'Em separação': 'Ver com o líder da separação o que trava', 'Em conferência': 'Liberar a conferência', Separado: 'Cobrar o faturamento' };
  async function parados(req, q) {
    const agora = agoraSP();
    const linhas = (await recentes(req, q)).filter((p) => LIMITE[p.situacao] != null).map((p) => {
      const h = horas(inicioDaEtapa(p), agora); const lim = LIMITE[p.situacao];
      return { ...base(p), etapa: p.situacao, desde: inicioDaEtapa(p), horas: h, limite: lim, excesso: h == null ? null : Math.round((h - lim) * 10) / 10,
        situacao: h == null ? 'Sem data' : h > lim ? 'Acima do limite' : 'No limite', separador: p.separador, decisao: h != null && h > lim ? O_QUE[p.situacao] : null };
    }).filter((l) => q.so_problemas !== '1' || l.situacao === 'Acima do limite').sort((a, b) => (b.excesso ?? -1e9) - (a.excesso ?? -1e9));
    const por = (e) => linhas.filter((l) => l.etapa === e && l.situacao === 'Acima do limite').length;
    return {
      colunas: [...COL_BASE, ['etapa', 'Etapa'], ['situacao', 'Situação'], ['desde', 'Na etapa desde', 'datahora'], ['horas', 'Horas na etapa', 'dec'], ['limite', 'Limite (h)', 'num'],
        ['excesso', 'Horas além do limite', 'dec'], ['separador', 'Separador'], ['decisao', 'O que fazer'], ...COL_FIM],
      linhas,
      resumo: [['Acima do limite', linhas.filter((l) => l.situacao === 'Acima do limite').length], ['Fora do WMS (24 h)', por('Aguardando nota')], ['Integrados sem separar (24 h)', por('Integrado')], ['Em separação (4 h)', por('Em separação')],
        ['Em conferência (4 h)', por('Em conferência')], ['Separado sem nota (8 h)', por('Separado')]],
    };
  }

  // 113 ---------------------------------------------------------------------------------------------------------------
  async function porSituacao(req, q, de, ate) {
    const ls = await lista(req, q, de, ate);
    const SIT = pedidosMod().SITUACOES_PEDIDO;
    const linhas = SIT.map((s) => {
      const x = ls.filter((p) => p.situacao === s);
      return { grupo: s, pedidos: x.length, pct: ls.length ? x.length / ls.length : null, peso: soma(x, 'peso'), valor: soma(x, 'valor'), etiquetas: soma(x, 'qtd_etiquetas'),
        mais_antigo: x.length ? Math.max(...x.map((p) => p.dias || 0)) : null, idade_media: media(x.map((p) => p.dias)) };
    }).filter((l) => l.pedidos);
    const abertos = ls.filter((p) => ['Aguardando nota', 'Integrado', 'Em separação', 'Em conferência', 'Separado'].includes(p.situacao));
    return {
      colunas: [['grupo', 'Situação'], ['pedidos', 'Pedidos', 'num'], ['pct', '% dos pedidos', 'pct'], ['peso', 'Peso (kg)', 'dec'], ['valor', 'Valor', 'moeda'], ['etiquetas', 'Etiquetas', 'num'],
        ['idade_media', 'Idade média (dias)', 'dec'], ['mais_antigo', 'Mais antigo (dias)', 'num']],
      linhas, agrupado: true,
      resumo: [['Pedidos', ls.length], ['Ainda sem nota', abertos.length], ['Peso sem nota (kg)', soma(abertos, 'peso'), 'dec'], ['Valor sem nota', soma(abertos, 'valor'), 'moeda'],
        ['Faturados ou além', ls.filter((p) => p.tem_nota && p.situacao !== 'Cancelado').length]],
    };
  }
  async function porSituacaoDetalhe(req, q, de, ate, valor) {
    const ls = (await lista(req, q, de, ate)).filter((p) => p.situacao === valor);
    return { colunas: [...COL_BASE, ['data_pedido', 'Data do pedido', 'data'], ['dias', 'Dias', 'num'], ['status_wms', 'Status WMS'], ['separador', 'Separador'], ['nf', 'NF'], ['transportadora', 'Transportadora'], ...COL_FIM],
      linhas: ls.map((p) => ({ ...base(p), data_pedido: p.data_pedido, dias: p.dias, status_wms: p.status_wms, separador: p.separador, nf: p.nf, transportadora: p.transportadora })) };
  }

  // 114 ---------------------------------------------------------------------------------------------------------------
  async function comObservacao(req, q, de, ate) {
    const linhas = (await lista(req, q, de, ate)).filter((p) => p.obs).map((p) => ({ ...base(p), situacao: p.situacao, obs_por: p.obs_por, obs_em: p.obs_em ? String(p.obs_em).slice(0, 16).replace('T', ' ') : null,
      data_pedido: p.data_pedido, nf: p.nf }));
    return {
      colunas: [...COL_BASE, ['situacao', 'Situação'], ['obs', 'Observação'], ['obs_por', 'Escrita por'], ['obs_em', 'Em', 'datahora'], ['data_pedido', 'Data do pedido', 'data'], ['nf', 'NF'],
        ['peso', 'Peso (kg)', 'dec'], ['valor', 'Valor', 'moeda']],
      linhas,
      resumo: [['Com observação', linhas.length], ['Ainda sem nota', linhas.filter((l) => ['Aguardando nota', 'Integrado', 'Em separação', 'Em conferência', 'Separado'].includes(l.situacao)).length],
        ['Agendamento', linhas.filter((l) => /AGEND/i.test(l.obs)).length]],
    };
  }

  // 115 ---------------------------------------------------------------------------------------------------------------
  async function etiquetas(req, q, de, ate) {
    const ls = (await lista(req, q, de, ate)).filter((p) => p.usuario && p.etiquetas_em);
    const g = new Map();
    for (const p of ls) {
      const x = g.get(p.usuario) || { grupo: p.usuario, pedidos: 0, etiquetas: 0, peso: 0, dias: new Set() };
      x.pedidos += 1; x.etiquetas += Number(p.qtd_etiquetas) || 0; x.peso += Number(p.peso) || 0; x.dias.add(p.etiquetas_em.slice(0, 10)); g.set(p.usuario, x);
    }
    const linhas = [...g.values()].map((x) => ({ grupo: x.grupo, pedidos: x.pedidos, etiquetas: x.etiquetas, peso: Math.round(x.peso * 10) / 10, dias: x.dias.size,
      por_dia: x.dias.size ? Math.round((x.etiquetas / x.dias.size) * 10) / 10 : null })).sort((a, b) => b.etiquetas - a.etiquetas);
    return {
      colunas: [['grupo', 'Usuário'], ['pedidos', 'Pedidos', 'num'], ['etiquetas', 'Etiquetas', 'num'], ['peso', 'Peso (kg)', 'dec'], ['dias', 'Dias', 'num'], ['por_dia', 'Etiquetas por dia', 'dec']],
      linhas, agrupado: true,
      resumo: [['Usuários', linhas.length], ['Pedidos com etiqueta', ls.length], ['Etiquetas', soma(linhas, 'etiquetas')]],
    };
  }
  async function etiquetasDetalhe(req, q, de, ate, valor) {
    const ls = (await lista(req, q, de, ate)).filter((p) => p.usuario === valor && p.etiquetas_em);
    return { colunas: [...COL_BASE, ['situacao', 'Situação'], ['etiquetas_em', 'Impressas em', 'datahora'], ['qtd_etiquetas', 'Etiquetas', 'num'], ['separador', 'Separador'], ['peso', 'Peso (kg)', 'dec']],
      linhas: ls.map((p) => ({ ...base(p), situacao: p.situacao, etiquetas_em: p.etiquetas_em, qtd_etiquetas: p.qtd_etiquetas, separador: p.separador })) };
  }

  // 116 ---------------------------------------------------------------------------------------------------------------
  async function porDia(req, q, de, ate) {
    // Pedidos de até 30 dias antes do período (os liberados antes podem ser separados/faturados dentro dele).
    const ls = (await lista(req, q, somarDias(de, -30), ate)).filter((p) => p.situacao !== 'Cancelado');
    const dias = new Map();
    for (let d = de; d <= ate; d = somarDias(d, 1)) dias.set(d, { grupo: d, liberados: 0, separados: 0, faturados: 0, peso_separado: 0 });
    const marca = (data, k, p) => { const x = dias.get(String(data || '').slice(0, 10)); if (x) { x[k] += 1; if (k === 'separados') x.peso_separado += Number(p.peso) || 0; } };
    for (const p of ls) { marca(liberado(p), 'liberados', p); marca(p.sep_fim, 'separados', p); marca(p.emissao_nf, 'faturados', p); }
    let saldo = 0;
    const linhas = [...dias.values()].map((x) => { saldo += x.liberados - x.faturados; return { ...x, peso_separado: Math.round(x.peso_separado * 10) / 10, saldo_dia: x.liberados - x.faturados, acumulado: saldo }; });
    const t = (k) => linhas.reduce((s, l) => s + l[k], 0);
    return {
      colunas: [['grupo', 'Dia', 'data'], ['liberados', 'Liberados', 'num'], ['separados', 'Separados', 'num'], ['faturados', 'Faturados', 'num'], ['peso_separado', 'Peso separado (kg)', 'dec'],
        ['saldo_dia', 'Entrou − saiu', 'num'], ['acumulado', 'Saldo acumulado', 'num']],
      linhas, agrupado: true,
      resumo: [['Liberados', t('liberados')], ['Separados', t('separados')], ['Faturados', t('faturados')], ['Saldo (liberados − faturados)', t('liberados') - t('faturados')],
        ['Média de separados por dia', linhas.length ? Math.round((t('separados') / linhas.length) * 10) / 10 : null, 'dec']],
    };
  }
  async function porDiaDetalhe(req, q, de, ate, valor) {
    const ls = (await lista(req, q, somarDias(de, -30), ate)).filter((p) => [liberado(p), p.sep_fim, p.emissao_nf].some((d) => String(d || '').slice(0, 10) === valor));
    return { colunas: [...COL_BASE, ['situacao', 'Situação'], ['lib', 'Liberado', 'datahora'], ['sep_fim', 'Separado', 'datahora'], ['emissao_nf', 'NF', 'data'], ['peso', 'Peso (kg)', 'dec']],
      linhas: ls.map((p) => ({ ...base(p), situacao: p.situacao, lib: liberado(p), sep_fim: p.sep_fim, emissao_nf: p.emissao_nf })) };
  }

  const G1 = 'Para as equipes (o que fazer agora)'; const G2 = 'Para decisão (tempo e produtividade)'; const G3 = 'Acompanhamento';
  return {
    107: { titulo: 'Separados e ainda sem nota fiscal', grupo: G1, tela: T, semPeriodo: true, rodar: separadosSemNota,
      desc: 'Pedidos com a separação finalizada no WMS e sem NF-e, do mais antigo para o mais novo: quanto tempo estão parados, quem separou e o que fazer. Para o faturamento.' },
    108: { titulo: 'Em separação sem separador apontado', grupo: G1, tela: T, semPeriodo: true, rodar: semSeparador,
      desc: 'Pedidos em separação ou conferência no WMS sem o nome do separador no apontamento de separação. Para o líder do armazém apontar (sem isso não há produtividade nem responsável).' },
    109: { titulo: 'Liberados e integrados aguardando separação (fila)', grupo: G1, tela: T, semPeriodo: true, rodar: filaSeparacao,
      desc: 'Pedidos liberados pelo comercial que ainda não começaram a ser separados: os já integrados no WMS (status INTEGRADO) e os que nem chegaram ao WMS, por tempo de espera. Para priorizar a fila do armazém.' },
    112: { titulo: 'Pedidos parados além do limite', grupo: G1, tela: T, semPeriodo: true, rodar: parados,
      desc: 'Cada pedido em aberto pela etapa em que está e há quanto tempo: aguardando ou integrado no WMS sem separar acima de 24 h, em separação ou conferência acima de 4 h, separado sem nota acima de 8 h.' },
    110: { titulo: 'Tempo de cada etapa (ciclo do pedido)', grupo: G2, tela: T, rodar: ciclo,
      desc: 'Da liberação comercial à nota fiscal: horas até começar a separar, tempo de separação, até imprimir as etiquetas e dias até a NF; as médias mostram onde está o gargalo.' },
    111: { titulo: 'Produtividade por separador', grupo: G2, tela: T, rodar: produtividade, detalhe: produtividadeDetalhe,
      desc: 'Pedidos, etiquetas, peso e tempo médio de separação de cada separador no período (clique para ver os pedidos). Ajuda a dimensionar a equipe e a treinar.' },
    116: { titulo: 'Entrada × saída por dia', grupo: G2, tela: T, rodar: porDia, detalhe: porDiaDetalhe,
      desc: 'Por dia: pedidos liberados pelo comercial, separados e faturados, e o saldo que fica acumulado. Se entra mais do que sai, a capacidade do armazém ou do faturamento não acompanha.' },
    113: { titulo: 'Resumo por situação', grupo: G3, tela: T, rodar: porSituacao, detalhe: porSituacaoDetalhe,
      desc: 'Quantos pedidos (peso e valor) há em cada situação, a idade média e o mais antigo. Clique na situação para ver os pedidos.' },
    114: { titulo: 'Pedidos com observação', grupo: G3, tela: T, rodar: comObservacao,
      desc: 'Pedidos com observação (agendamento, aguardando cliente, retirar...), quem escreveu e em que situação estão.' },
    115: { titulo: 'Etiquetas impressas por usuário', grupo: G3, tela: T, rodar: etiquetas, detalhe: etiquetasDetalhe,
      desc: 'Quem imprimiu as etiquetas no WMS (OS da expedição): pedidos, etiquetas e peso por usuário no período.' },
  };
};
module.exports.horas = horas;
module.exports.LIMITE = LIMITE;
