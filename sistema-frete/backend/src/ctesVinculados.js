const pool = require('./db');

// Vários CT-e para a mesma nota fiscal.
//
// O primeiro CT-e fica no registro da nota (o "principal"). Cada CT-e que
// chegar depois para a mesma nota vira um registro "filho", ligado ao
// principal, com os dados da nota copiados e um tipo de vínculo:
//   - complementar: CT-e complementar (tpCTe 1). Sem valor esperado: vai pra
//     aprovação manual.
//   - reentrega / devolucao: CT-e normal da MESMA transportadora. O valor
//     esperado é um % do CT-e original (padrão 50%, configurável em
//     Manutenção) e a conferência automática compara com isso.
//   - redespacho_nota: CT-e da transportadora de REDESPACHO da nota (a 2ª
//     perna da entrega). Reconhecido quando o nome bate com o "REDESPACHO:"
//     da NF-e, ou quando o próprio CT-e se declara subcontratação/redespacho
//     (tpServ 1, 2 ou 3). É frete legítimo: sem alerta, conferido pela
//     tabela da transportadora dele, até a cidade do cliente.
//   - redespacho: CT-e de OUTRA transportadora na mesma nota, sem ser o
//     redespacho previsto. Não deveria acontecer sem combinado: fica retido
//     e os dois registros ganham o alerta "transportadoras diferentes".
// CT-e substituto (tpCTe 3) troca os dados do principal; CT-e de anulação
// (tpCTe 2) prende o principal para revisão.

const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const normalizarNome = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A|SA)\b/g, '').replace(/[^A-Z0-9]/g, '');

const CAMPOS_DA_NOTA = ['numero_pedido', 'pedido_mercus', 'data_pedido', 'numero_nf', 'data_emissao_nf', 'cliente', 'cidade',
  'bairro', 'uf', 'valor_faturado', 'qtd_volumes', 'peso_kg', 'cubagem_m3', 'frete_cif_fob', 'numero_mapa'];

async function percentualReentrega(cliente = pool) {
  const { rows } = await cliente.query('SELECT percentual_reentrega FROM configuracao_auditoria WHERE id = 1');
  const pct = Number(rows[0]?.percentual_reentrega);
  return Number.isFinite(pct) && pct >= 0 ? pct : 50;
}

// Mesma transportadora? Pelo CNPJ quando os dois têm (a raiz de 8 dígitos,
// pra filiais da mesma empresa contarem como a mesma); senão, pelo nome.
function mesmaTransportadora(principal, dados) {
  const a = soDigitos(principal.transportadora_cnpj_cte);
  const b = soDigitos(dados.transportador_cnpj);
  if (a.length === 14 && b.length === 14) return a.slice(0, 8) === b.slice(0, 8);
  const na = normalizarNome(principal.transportadora_cte || principal.transportadora);
  const nb = normalizarNome(dados.transportadora);
  if (!na || !nb) return true;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

// Essa transportadora é a do REDESPACHO previsto na nota? Pelo tipo de
// serviço do CT-e (subcontratação/redespacho) ou pelo nome do "REDESPACHO:" da NF-e.
// Pelo CNPJ quando a nota traz o CNPJ do redespacho (o nome da nota pode ser a
// razão social e o do CT-e, o nome fantasia).
const CNPJ_REDESPACHO_RE = /REDESPACHO\s*:[^<]{0,250}?(?:CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})|(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}))/i;
function cnpjRedespachoDaNota(nota) {
  if (nota.redespacho_cnpj) return soDigitos(nota.redespacho_cnpj);
  const m = String(nota.xml_nfe_original || '').match(CNPJ_REDESPACHO_RE);
  return m ? soDigitos(m[1] || m[2]) : '';
}
function ehTransportadoraDoRedespacho(nota, tpServ, nomeTransportadora, cnpjTransportadora) {
  if ([1, 2, 3].includes(Number(tpServ))) return true;
  const cnpjNota = cnpjRedespachoDaNota(nota);
  const cnpjDeste = soDigitos(cnpjTransportadora);
  if (cnpjNota.length === 14 && cnpjDeste.length === 14) return cnpjNota.slice(0, 8) === cnpjDeste.slice(0, 8);
  const redespachoDaNota = nota.redespacho;
  const previsto = normalizarNome(redespachoDaNota);
  const deste = normalizarNome(nomeTransportadora);
  if (!previsto || !deste || previsto.length < 4 || deste.length < 4) return false;
  return previsto === deste || previsto.startsWith(deste) || deste.startsWith(previsto);
}
// Os dois CT-e são as duas pernas do redespacho da nota? Vale nos dois
// sentidos: o que chegou agora é o do redespacho, ou o principal é que é
// (quando o CT-e do redespacho chegou primeiro).
function ehRedespachoDaNota(principal, dados) {
  return ehTransportadoraDoRedespacho(principal, dados.tp_serv, dados.transportadora, dados.transportador_cnpj)
    || ehTransportadoraDoRedespacho(principal, principal.tp_serv_cte, principal.transportadora_cte || principal.transportadora, principal.transportadora_cnpj_cte);
}

// O CT-e é pago por outra pessoa (o tomador não é a empresa que emitiu a nota)?
// Ex.: redespacho "por conta do destino", pago pelo cliente. A empresa da nota
// é o CNPJ que vem dentro da chave da NF-e (posições 7 a 20).
function empresaDaNota(principal, dados) {
  const chave = soDigitos(principal.chave_nfe) || soDigitos((dados.chaves_nfe_referenciadas || [])[0]);
  return chave.length === 44 ? chave.slice(6, 20) : '';
}
function tomadorEhOutro(principal, dados) {
  const empresa = empresaDaNota(principal, dados);
  const tomador = soDigitos(dados.tomador_cnpj);
  if (empresa.length !== 14 || !tomador) return false;
  return tomador.length !== 14 || tomador.slice(0, 8) !== empresa.slice(0, 8);
}
const PAPEL_TOMADOR = { remetente: 'remetente', expedidor: 'expedidor', recebedor: 'recebedor', 'destinatário': 'destinatário', outros: 'terceiro' };

function classificar(principal, dados) {
  if (dados.tipo_cte === 1) return 'complementar';
  // Reposição: mercadoria enviada de novo (por avaria/extravio). É um frete
  // inteiro — conferido pela tabela, não pelos 50% da reentrega.
  if (/REPOSI[CÇ]/i.test(dados.observacoes_cte || '')) return 'reposicao';
  if (!mesmaTransportadora(principal, dados)) return ehRedespachoDaNota(principal, dados) ? 'redespacho_nota' : 'redespacho';
  return /DEVOLU/i.test(dados.observacoes_cte || '') ? 'devolucao' : 'reentrega';
}

const valorBase = (p) => (p.valor_total_cte != null ? Number(p.valor_total_cte) : (p.valor_frete_negociado != null ? Number(p.valor_frete_negociado) : null));
const esperadoReentrega = (principal, pct) => {
  const base = valorBase(principal);
  return base == null ? null : Math.round(base * pct) / 100;
};
// Reposição: o mesmo frete que a tabela dá pra essa nota (frete cheio).
const esperadoReposicao = (principal) => (principal.valor_total_calculado != null ? Number(principal.valor_total_calculado) : null);
// Retorno de remessa (feira, demonstração, conserto): % do CT-e da ida que a
// transportadora cobra pela volta, da tabela de preço DELA (vazio = 100%).
async function percentualRetorno(cnpjTransportadora) {
  const raiz = String(cnpjTransportadora || '').replace(/\D/g, '').slice(0, 8);
  if (raiz.length === 8) {
    const { rows } = await pool.query(
      `SELECT tp.retorno_percentual FROM tabelas_preco tp JOIN transportadoras t ON t.id = tp.transportadora_id
        WHERE COALESCE(tp.ativa, TRUE) AND tp.retorno_percentual IS NOT NULL
          AND LEFT(REGEXP_REPLACE(COALESCE(t.cnpj, ''), '[^0-9]', '', 'g'), 8) = $1
        ORDER BY tp.id DESC LIMIT 1`, [raiz]);
    if (rows[0]) return Number(rows[0].retorno_percentual);
  }
  return 100;
}
function valorEsperado(vinculo, principal, pct) {
  if (vinculo === 'reentrega' || vinculo === 'devolucao' || vinculo === 'retorno') return esperadoReentrega(principal, pct);
  if (vinculo === 'reposicao') return esperadoReposicao(principal);
  return null;
}

// Reposição normalmente existe por causa de um sinistro da mesma nota.
async function textoSinistroDaNota(numeroNf) {
  if (!numeroNf) return '';
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo, status FROM sinistros WHERE LTRIM(numero_nf, '0') = LTRIM($1, '0') ORDER BY id DESC LIMIT 1`, [numeroNf]);
    return rows[0]
      ? ` Ligada ao sinistro #${rows[0].id} (${rows[0].tipo}, ${rows[0].status}).`
      : ' Nenhum sinistro registrado para esta nota — se houve avaria ou extravio, registre em Sinistros.';
  } catch (e) { return ''; }
}

// Número da NF que vem dentro da chave de acesso da NF-e (44 dígitos).
function numerosDasChaves(chaves) {
  return [...new Set((chaves || []).map((c) => String(c).replace(/\D/g, ''))
    .filter((c) => c.length === 44).map((c) => c.slice(25, 34).replace(/^0+(?=\d)/, '')))];
}

// Acha o registro principal da nota do CT-e que está chegando.
async function acharPrincipal(dados, numeroPedido) {
  if (dados.chave_cte_referenciada) {
    const { rows } = await pool.query('SELECT * FROM fretes WHERE chave_cte = $1', [dados.chave_cte_referenciada]);
    if (rows[0]) {
      if (!rows[0].frete_principal_id) return rows[0];
      const { rows: p } = await pool.query('SELECT * FROM fretes WHERE id = $1', [rows[0].frete_principal_id]);
      if (p[0]) return p[0];
    }
  }
  // CT-e que cita uma NOTA DE RETORNO (entrada) de devolução informada por e-mail:
  // o frete é da devolução da nota ORIGINAL — liga lá, como CT-e de devolução.
  if (dados.chaves_nfe_referenciadas?.length || dados.numero_nf_referenciada) {
    const numeros = [...numerosDasChaves(dados.chaves_nfe_referenciadas || []), dados.numero_nf_referenciada].filter(Boolean).map((n) => String(n).replace(/^0+/, ''));
    if (numeros.length) {
      const { rows: tr } = await pool.query(
        `SELECT nf_original, nf_retorno, tipo FROM trocas_nota WHERE LTRIM(nf_retorno, '0') = ANY($1) ORDER BY criado_em DESC LIMIT 1`, [numeros]);
      if (tr[0]) {
        const { rows: orig } = await pool.query(
          `SELECT * FROM fretes WHERE LTRIM(numero_nf, '0') = LTRIM($1, '0') AND frete_principal_id IS NULL
            ORDER BY (chave_cte IS NOT NULL) DESC, id DESC LIMIT 1`, [tr[0].nf_original]);
        if (orig[0]) return { ...orig[0], _viaRetorno: tr[0] };
      }
    }
  }
  const tentativas = [];
  if (numeroPedido) tentativas.push(['numero_pedido = $1', [numeroPedido]]);
  if (dados.chaves_nfe_referenciadas?.length) {
    tentativas.push(['chave_nfe = ANY($1)', [dados.chaves_nfe_referenciadas]]);
    // Nota que entrou pela planilha do ERP não tem a chave: usa o número da NF
    // que está DENTRO da chave (posições 26 a 34).
    const numeros = numerosDasChaves(dados.chaves_nfe_referenciadas);
    if (numeros.length) tentativas.push([`LTRIM(numero_nf, '0') = ANY($1) AND cliente IS NOT NULL`, [numeros]]);
  }
  if (dados.numero_nf_referenciada) tentativas.push([`LTRIM(numero_nf, '0') = LTRIM($1, '0')`, [dados.numero_nf_referenciada]]);
  for (const [condicao, params] of tentativas) {
    const { rows } = await pool.query(
      `SELECT * FROM fretes WHERE ${condicao} AND frete_principal_id IS NULL
        ORDER BY (chave_cte IS NOT NULL) DESC, (cliente IS NOT NULL) DESC, id LIMIT 1`, params);
    if (rows[0]) return rows[0];
  }
  return null;
}

// Grava um CT-e adicional ligado ao principal. Devolve { frete, vinculo, alerta, mensagem }.
async function gravarCteAdicional(principal, dados, xmlString, usuario) {
  // Substituto: o CT-e novo toma o lugar do original no registro principal.
  if (dados.tipo_cte === 3) {
    const obs = `CT-e ${principal.numero_cte || '?'} substituído pelo CT-e ${dados.numero_cte || '?'} em ${new Date().toLocaleDateString('pt-BR')}.`;
    const { rows } = await pool.query(
      `UPDATE fretes SET chave_cte = $1, numero_cte = $2, data_emissao_cte = $3, valor_frete_negociado = $4, valor_total_cte = $5,
              impostos_cte = $6, xml_cte_original = $7, transportadora_cnpj_cte = $8, tipo_cte = 3,
              observacoes = CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $9::text), atualizado_em = NOW()
        WHERE id = $10 RETURNING *`,
      [dados.chave_cte, dados.numero_cte, dados.data_emissao_cte, dados.valor_frete_negociado, dados.valor_total_cte,
       dados.impostos_cte, xmlString, dados.transportador_cnpj, obs, principal.id]
    );
    await recalcularFilhos(principal.id);
    return { frete: rows[0], vinculo: 'substituto', alerta: false, mensagem: `CT-e substituto: trocou o CT-e ${principal.numero_cte || ''} no registro da nota.` };
  }
  // Anulação: não cria registro; prende o principal pra alguém revisar.
  if (dados.tipo_cte === 2) {
    const obs = `CT-e ${principal.numero_cte || '?'} ANULADO pelo CT-e ${dados.numero_cte || '?'} em ${new Date().toLocaleDateString('pt-BR')}. Confira e registre o CT-e substituto.`;
    const { rows } = await pool.query(
      `UPDATE fretes SET status = CASE WHEN status IN ('Faturado', 'Cancelado') THEN status ELSE 'Frete Retido' END,
              observacoes = CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $1::text), atualizado_em = NOW()
        WHERE id = $2 RETURNING *`,
      [obs, principal.id]
    );
    return { frete: rows[0], vinculo: 'anulacao', alerta: false, mensagem: 'CT-e de anulação: o CT-e original foi marcado e o frete ficou retido para revisão.' };
  }

  let vinculo = dados._vinculoForcado || classificar(principal, dados);
  // Nota já decidida ("quem levou foi X"): CT-e novo da mesma transportadora
  // que levou segue normal; de qualquer outra, a decisão é desfeita e o alerta volta.
  if (vinculo === 'redespacho' && principal.cte_que_levou_id) {
    const { rows: esc } = await pool.query('SELECT * FROM fretes WHERE id = $1', [principal.cte_que_levou_id]);
    if (esc[0] && mesmaTransportadora(esc[0], dados)) {
      vinculo = /DEVOLU/i.test(dados.observacoes_cte || '') ? 'devolucao' : 'reentrega';
      principal = { ...principal, valor_total_cte: esc[0].valor_total_cte, valor_frete_negociado: esc[0].valor_frete_negociado };
    } else {
      const c = await pool.connect();
      try { await limparDecisao(c, principal.id); } finally { c.release(); }
    }
  }
  // Complementar/reentrega têm regra própria; nos demais, CT-e pago por outro
  // (tomador ≠ empresa da nota) não é cobrança nossa: vira só histórico.
  const naoCobrado = !['complementar'].includes(vinculo) && tomadorEhOutro(principal, dados);
  const alerta = vinculo === 'redespacho' && !naoCobrado;
  const pct = vinculo === 'retorno' ? await percentualRetorno(dados.transportador_cnpj) : await percentualReentrega();
  const esperado = naoCobrado ? null : valorEsperado(vinculo, principal, pct);
  const rotulo = { complementar: 'complementar', reentrega: 'de reentrega', devolucao: 'de devolução', redespacho: 'de OUTRA transportadora', reposicao: 'de REPOSIÇÃO', redespacho_nota: 'do REDESPACHO', retorno: 'de RETORNO (feira/demonstração)' }[vinculo];
  const detalheEsperado = esperado == null ? ''
    : vinculo === 'reposicao' ? ` — esperado o frete da tabela (R$ ${esperado.toFixed(2)})` : ` — esperado ${pct}% do original (R$ ${esperado.toFixed(2)})`;
  const observacao = naoCobrado
    ? `CT-e ${rotulo} ${dados.numero_cte || ''} pago por ${dados.tomador_nome || PAPEL_TOMADOR[dados.tomador_papel] || 'outra pessoa'} (tomador: ${PAPEL_TOMADOR[dados.tomador_papel] || '?'}) — não é cobrado da empresa; fica só como histórico da nota.`
    : alerta
    ? `⚠ ATENÇÃO: CT-e ${dados.numero_cte || '?'} de ${dados.transportadora || 'outra transportadora'} para a mesma nota do CT-e ${principal.numero_cte || '?'} (${principal.transportadora_cte || principal.transportadora || '—'}). Confirme antes de pagar.`
    : `CT-e ${rotulo} vinculado ao CT-e ${principal.numero_cte || '?'}${detalheEsperado}.${vinculo === 'reposicao' ? await textoSinistroDaNota(principal.numero_nf) : ''}`;

  const colunas = [...CAMPOS_DA_NOTA, 'frete_principal_id', 'vinculo_cte', 'tipo_cte', 'alerta_transportadora_diferente',
    'chave_cte', 'numero_cte', 'data_emissao_cte', 'transportadora', 'transportadora_cte', 'transportadora_cnpj_cte',
    'valor_frete_negociado', 'valor_total_cte', 'impostos_cte', 'xml_cte_original', 'usuario_upload_id',
    'valor_total_calculado', 'status', 'observacoes', 'uf_inicio_cte', 'uf_fim_cte',
    'tp_serv_cte', 'tomador_cte_papel', 'tomador_cte_cnpj', 'tomador_cte_nome'];
  const valores = [...CAMPOS_DA_NOTA.map((c) => principal[c] ?? null), principal.id, vinculo, dados.tipo_cte || 0, alerta,
    dados.chave_cte, dados.numero_cte, dados.data_emissao_cte, dados.transportadora, dados.transportadora, dados.transportador_cnpj,
    dados.valor_frete_negociado, dados.valor_total_cte, dados.impostos_cte, xmlString, usuario?.id || null,
    esperado, naoCobrado ? 'Não cobrado' : (alerta ? 'Frete Retido' : 'Pendente'), observacao, dados.uf_inicio || null, dados.uf_fim || null,
    dados.tp_serv ?? null, dados.tomador_papel || null, dados.tomador_cnpj || null, dados.tomador_nome || null];
  const { rows } = await pool.query(
    `INSERT INTO fretes (${colunas.join(', ')}) VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    valores
  );
  if (alerta) {
    // Liga o alerta no principal e em todos os CT-e de outra transportadora da
    // nota (o trigger prende de novo o que a conferência tinha liberado sozinha).
    await pool.query(
      `UPDATE fretes SET alerta_transportadora_diferente = TRUE, atualizado_em = NOW()
        WHERE id = $1 OR (frete_principal_id = $1 AND vinculo_cte = 'redespacho' AND NOT cte_cancelado)`, [principal.id]);
    // CT-e de outra transportadora é um frete inteiro: já confere pela tabela
    // dela, pra quem for decidir quem levou ver quanto cada uma deveria cobrar.
    try { await require('./calculoFrete').calcularEGravar(rows[0].id, 'importacao-cte'); } catch (e) { /* segue */ }
  }
  if (vinculo === 'redespacho_nota' && !naoCobrado) {
    try { await require('./calculoFrete').calcularEGravar(rows[0].id, 'importacao-cte'); } catch (e) { /* segue */ }
  }
  if (naoCobrado) {
    return { frete: rows[0], vinculo, alerta: false,
      mensagem: `CT-e ${dados.numero_cte || ''} (${dados.transportadora || '—'}) vinculado à nota como histórico: quem paga é ${dados.tomador_nome || 'outra pessoa'}, não a empresa.` };
  }
  const mensagens = {
    redespacho_nota: `CT-e do redespacho (${dados.transportadora || 'outra transportadora'}) vinculado à nota — conferido pela tabela dele.`,
    complementar: 'CT-e complementar vinculado à nota — aguardando aprovação.',
    reentrega: `CT-e de reentrega vinculado à nota — conferido contra ${pct}% do CT-e original.`,
    devolucao: `CT-e de devolução vinculado à nota — conferido contra ${pct}% do CT-e original.`,
    retorno: `CT-e do RETORNO (feira/demonstração) vinculado à remessa — conferido contra ${pct}% do CT-e da ida (tabela de preço da transportadora).`,
    redespacho: '⚠ CT-e de OUTRA transportadora para a mesma nota — ficou retido para conferência.',
    reposicao: esperado != null
      ? `CT-e de reposição vinculado à nota — conferido contra o frete da tabela (R$ ${esperado.toFixed(2)}).`
      : 'CT-e de reposição vinculado à nota — a nota ainda não tem cálculo pela tabela: aguardando aprovação.',
  };
  return { frete: rows[0], vinculo, alerta, mensagem: mensagens[vinculo] };
}

// Se o CT-e principal mudou de valor, refaz o esperado das reentregas/devoluções
// que ainda não foram decididas.
async function recalcularFilhos(principalId) {
  const { rows: p } = await pool.query('SELECT * FROM fretes WHERE id = $1', [principalId]);
  if (!p[0]) return;
  const pct = await percentualReentrega();
  for (const [vinculos, esperado] of [[['reentrega', 'devolucao'], esperadoReentrega(p[0], pct)], [['reposicao'], esperadoReposicao(p[0])]]) {
    await pool.query(
      `UPDATE fretes SET valor_total_calculado = $1, atualizado_em = NOW()
        WHERE frete_principal_id = $2 AND vinculo_cte = ANY($3) AND NOT cte_cancelado
          AND COALESCE(status, 'Pendente') NOT IN ('Faturado', 'Cancelado')
          AND (status_aprovacao IS DISTINCT FROM 'Aprovado' OR aprovado_por_nome LIKE 'Sistema%')`,
      [esperado, principalId, vinculos]
    );
  }
  // Retorno: o % é da tabela da transportadora de cada CT-e de retorno.
  const { rows: retornos } = await pool.query(
    `SELECT id, transportadora_cnpj_cte FROM fretes WHERE frete_principal_id = $1 AND vinculo_cte = 'retorno' AND NOT cte_cancelado
        AND COALESCE(status, 'Pendente') NOT IN ('Faturado', 'Cancelado')
        AND (status_aprovacao IS DISTINCT FROM 'Aprovado' OR aprovado_por_nome LIKE 'Sistema%')`, [principalId]);
  for (const r of retornos) {
    await pool.query('UPDATE fretes SET valor_total_calculado = $1, atualizado_em = NOW() WHERE id = $2',
      [esperadoReentrega(p[0], await percentualRetorno(r.transportadora_cnpj_cte)), r.id]);
  }
}

// Uma vez, ao ligar: CT-e que antes viravam registros soltos da mesma nota
// (sem cliente, sem vínculo) passam a ficar ligados ao principal. Não mexe
// em decisão já tomada (aprovado, faturado, cancelado): só liga e classifica.
async function vincularCtesAntigos() {
  try {
    const { rows: soltos } = await pool.query(
      `SELECT f.*, p.id AS p_id FROM fretes f
         JOIN LATERAL (
           SELECT id FROM fretes p
            WHERE p.id <> f.id AND p.frete_principal_id IS NULL AND p.chave_cte IS NOT NULL AND p.cliente IS NOT NULL
              AND LTRIM(p.numero_nf, '0') = LTRIM(f.numero_nf, '0')
            ORDER BY p.data_emissao_cte NULLS LAST, p.id LIMIT 1
         ) p ON TRUE
        WHERE f.frete_principal_id IS NULL AND f.vinculo_cte IS NULL AND f.chave_cte IS NOT NULL
          AND f.cliente IS NULL AND COALESCE(f.numero_nf, '') <> ''`
    );
    if (!soltos.length) return;
    const pct = await percentualReentrega();
    let ligados = 0;
    for (const f of soltos) {
      const { rows: pr } = await pool.query('SELECT * FROM fretes WHERE id = $1', [f.p_id]);
      const principal = pr[0];
      if (!principal) continue;
      const dadosCte = { tipo_cte: 0, transportador_cnpj: null, transportadora: f.transportadora_cte || f.transportadora, observacoes_cte: '' };
      const vinculo = classificar(principal, dadosCte);
      const alerta = vinculo === 'redespacho';
      const aberto = !f.status || f.status === 'Pendente';
      const esperado = aberto ? valorEsperado(vinculo, principal, pct) : null;
      const sets = CAMPOS_DA_NOTA.filter((c) => c !== 'numero_nf').map((c, i) => `${c} = COALESCE(${c}, $${i + 1})`);
      const params = CAMPOS_DA_NOTA.filter((c) => c !== 'numero_nf').map((c) => principal[c] ?? null);
      params.push(principal.id, vinculo, alerta, esperado, aberto && alerta ? 'Frete Retido' : null, f.id);
      const n = params.length;
      await pool.query(
        `UPDATE fretes SET ${sets.join(', ')}, frete_principal_id = $${n - 5}, vinculo_cte = $${n - 4},
                alerta_transportadora_diferente = $${n - 3},
                valor_total_calculado = COALESCE($${n - 2}::numeric, valor_total_calculado),
                status = COALESCE($${n - 1}::text, status), atualizado_em = NOW()
          WHERE id = $${n}`,
        params
      );
      if (alerta) await pool.query('UPDATE fretes SET alerta_transportadora_diferente = TRUE WHERE id = $1', [principal.id]);
      ligados += 1;
    }
    console.log(`[ctes] ${ligados} CT-e adicional(is) de notas já existentes foram vinculados ao CT-e principal.`);
  } catch (err) {
    console.error('[ctes] Não consegui vincular os CT-e antigos:', err.message);
  }
}

// ---------- CT-e cancelado (evento de cancelamento) ----------
// Campos que são do CT-e (e não da nota) — os que mudam quando o CT-e da nota muda.
const CAMPOS_DO_CTE = ['chave_cte', 'numero_cte', 'data_emissao_cte', 'transportadora_cte', 'transportadora_cnpj_cte',
  'tipo_cte', 'valor_frete_negociado', 'valor_total_cte', 'impostos_cte', 'xml_cte_original',
  'gris', 'tde', 'tda', 'pedagio', 'trt', 'ad_valorem', 'uf_inicio_cte', 'uf_fim_cte'];

// Recalcula o alerta de "transportadoras diferentes" da nota, ignorando CT-e cancelados.
async function atualizarAlertaNota(cliente, principalId) {
  await cliente.query(
    `UPDATE fretes SET alerta_transportadora_diferente = (cte_que_levou_id IS NULL AND EXISTS (
        SELECT 1 FROM fretes f WHERE f.frete_principal_id = $1 AND f.vinculo_cte = 'redespacho' AND NOT f.cte_cancelado
          AND COALESCE(f.status, '') <> 'Não cobrado'))
      WHERE id = $1`, [principalId]);
}

/**
 * Trata o evento de cancelamento de um CT-e.
 *  - CT-e a mais da nota (reentrega, redespacho...): ele vira "Cancelado" e sai das contas.
 *  - CT-e principal: ele vai pro histórico da nota (registro "cancelado") e
 *      · se já chegou outro CT-e pra mesma nota, esse assume como principal;
 *      · se não, a nota volta a "Aguardando CT-e" e o próximo CT-e entra no lugar.
 *  - Se o frete já estava faturado, não mexe na estrutura: só marca e avisa.
 * Devolve { mensagem, freteId, alerta }.
 */
async function cancelarCte(chave, { data, motivo: motivoXml }, usuario) {
  // Justificativa só com pontos/traços ("..........") não diz nada: trata como sem motivo.
  const motivo = /[A-Za-zÀ-ÿ0-9]/.test(String(motivoXml || '')) ? String(motivoXml).trim() : 'sem justificativa informada';
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM fretes WHERE chave_cte = $1 FOR UPDATE', [chave]);
    const cte = rows[0];
    if (!cte) { await cliente.query('ROLLBACK'); return null; }
    const quando = data ? data.split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR');
    const nota = `🚫 CT-e ${cte.numero_cte || '?'} CANCELADO em ${quando}${motivo ? ` — ${motivo}` : ''}`;
    const anotar = (obs) => (String(obs || '').includes(nota) ? obs : [obs, nota].filter(Boolean).join('\n'));

    if (cte.cte_cancelado) {
      await cliente.query('ROLLBACK');
      return { mensagem: `O CT-e ${cte.numero_cte || ''} já estava marcado como cancelado.`, freteId: cte.id };
    }

    // Já faturado: não reorganiza (a fatura foi conferida com ele) — só marca e avisa.
    if (cte.status === 'Faturado' || cte.fatura_id) {
      await cliente.query(
        `UPDATE fretes SET cte_cancelado = TRUE, cte_cancelado_em = $2, cte_cancelado_motivo = $3,
                observacoes = $4, atualizado_em = NOW() WHERE id = $1`,
        [cte.id, data || null, motivo || null, anotar(cte.observacoes) + '\n⚠ Esse CT-e já estava FATURADO: confira a fatura com a transportadora.']
      );
      await cliente.query('COMMIT');
      return { mensagem: `⚠ CT-e ${cte.numero_cte || ''} cancelado, mas ele já estava FATURADO. Confira a fatura com a transportadora.`, freteId: cte.id, alerta: true };
    }

    // CT-e a mais da nota — ou CT-e "solto", que nunca achou a nota dele (sem
    // NF, sem cliente): só cancela ele, sem reorganizar nada.
    const semNota = !cte.numero_nf && !cte.cliente && !cte.numero_pedido;
    if (cte.frete_principal_id || semNota) {
      await cliente.query(
        `UPDATE fretes SET cte_cancelado = TRUE, cte_cancelado_em = $2, cte_cancelado_motivo = $3,
                status = 'Cancelado', alerta_transportadora_diferente = FALSE, valor_total_calculado = NULL,
                observacoes = $4, atualizado_em = NOW() WHERE id = $1`,
        [cte.id, data || null, motivo || null, anotar(cte.observacoes)]
      );
      if (cte.frete_principal_id) await atualizarAlertaNota(cliente, cte.frete_principal_id);
      await cliente.query('COMMIT');
      return { mensagem: `CT-e ${cte.numero_cte || ''} cancelado${motivo ? ` (${motivo})` : ''} — saiu das contas da nota.`, freteId: cte.id };
    }

    // CT-e principal: guarda ele no histórico da nota…
    await cliente.query('UPDATE fretes SET chave_cte = NULL WHERE id = $1', [cte.id]);
    const colunasHist = [...CAMPOS_DA_NOTA, ...CAMPOS_DO_CTE, 'transportadora', 'frete_principal_id', 'vinculo_cte', 'status',
      'cte_cancelado', 'cte_cancelado_em', 'cte_cancelado_motivo', 'observacoes', 'usuario_upload_id'];
    const valoresHist = [...CAMPOS_DA_NOTA.map((c) => cte[c] ?? null),
      ...CAMPOS_DO_CTE.map((c) => (c === 'chave_cte' ? chave : cte[c] ?? null)),
      cte.transportadora, cte.id, 'cancelado', 'Cancelado', true, data || null, motivo || null, nota, usuario?.id || null];
    await cliente.query(
      `INSERT INTO fretes (${colunasHist.join(', ')}) VALUES (${colunasHist.map((_, i) => `$${i + 1}`).join(', ')})`,
      valoresHist
    );

    // …e procura um CT-e que já tenha chegado depois pra mesma nota (o que substitui o cancelado).
    const { rows: candidatos } = await cliente.query(
      `SELECT * FROM fretes WHERE frete_principal_id = $1 AND NOT cte_cancelado
          AND vinculo_cte IN ('reentrega', 'devolucao', 'redespacho')
          AND COALESCE(status, 'Pendente') NOT IN ('Faturado', 'Cancelado')
        ORDER BY data_emissao_cte NULLS LAST, id LIMIT 1`,
      [cte.id]
    );
    const novo = candidatos[0];
    // status_aprovacao é NOT NULL no banco: volta pra 'Pendente' (antes ia NULL e
    // o cancelamento do CT-e principal dava erro e não era gravado).
    const limpar = CAMPOS_DO_CTE.map((c, i) => `${c} = $${i + 2}`).join(', ');
    let mensagem;
    if (novo) {
      // O CT-e que veio depois assume como principal da nota.
      await cliente.query('DELETE FROM fretes WHERE id = $1', [novo.id]);
      await cliente.query(
        `UPDATE fretes SET ${limpar}, transportadora = COALESCE($${CAMPOS_DO_CTE.length + 2}, transportadora),
                status = 'Pendente', status_aprovacao = 'Pendente', aprovado_por_nome = NULL, aprovado_em = NULL,
                motivo_rejeicao = NULL, justificativa_aprovacao = NULL, glosa_valor = NULL, glosa_motivo = NULL,
                glosa_registrada_por = NULL, glosa_registrada_em = NULL, cte_nao_levou = FALSE,
                observacoes = $${CAMPOS_DO_CTE.length + 3}, atualizado_em = NOW()
          WHERE id = $1`,
        [cte.id, ...CAMPOS_DO_CTE.map((c) => novo[c] ?? null), novo.transportadora_cte || novo.transportadora,
         anotar(cte.observacoes) + `\n↪ O CT-e ${novo.numero_cte || '?'} passou a ser o CT-e desta nota.`]
      );
      mensagem = `CT-e ${cte.numero_cte || ''} cancelado${motivo ? ` (${motivo})` : ''}. O CT-e ${novo.numero_cte || ''}, que já tinha chegado, passou a ser o CT-e da nota e vai ser conferido.`;
    } else {
      // Nenhum outro CT-e ainda: a nota volta a esperar o CT-e certo.
      await cliente.query(
        `UPDATE fretes SET ${limpar}, status = 'Pendente', status_aprovacao = 'Pendente', aprovado_por_nome = NULL, aprovado_em = NULL,
                motivo_rejeicao = NULL, justificativa_aprovacao = NULL, glosa_valor = NULL, glosa_motivo = NULL,
                glosa_registrada_por = NULL, glosa_registrada_em = NULL, cte_nao_levou = FALSE,
                observacoes = $${CAMPOS_DO_CTE.length + 2}, atualizado_em = NOW()
          WHERE id = $1`,
        [cte.id, ...CAMPOS_DO_CTE.map(() => null), anotar(cte.observacoes)]
      );
      mensagem = `CT-e ${cte.numero_cte || ''} cancelado${motivo ? ` (${motivo})` : ''}. A nota voltou para "Aguardando CT-e" — o próximo CT-e dela entra no lugar.`;
    }
    await atualizarAlertaNota(cliente, cte.id);
    await cliente.query('COMMIT');
    if (novo) await require('./calculoFrete').calcularEGravar(cte.id, 'cte-substituiu-cancelado').catch(() => null);
    await recalcularFilhos(cte.id);
    return { mensagem, freteId: cte.id };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

// CT-e "soltos": entraram antes da nota (sem NF, sem cliente) e ficaram
// sozinhos numa linha. Quando a nota chega (NF-e ou planilha do ERP), junta:
//  - se a nota ainda não tem CT-e, o CT-e vai pra linha da nota;
//  - se já tem, ele vira um CT-e a mais da nota (reentrega, complementar...).
// Roda ao ligar o servidor e depois de cada importação de nota/planilha.
let reconciliando = false;
async function reconciliarCtesSoltos() {
  if (reconciliando) return 0;
  reconciliando = true;
  let juntados = 0;
  try {
    const { parseCTe } = require('./utils/xmlParser');
    const { rows: soltos } = await pool.query(
      `SELECT * FROM fretes
        WHERE chave_cte IS NOT NULL AND frete_principal_id IS NULL AND NOT cte_cancelado
          AND NULLIF(TRIM(numero_nf), '') IS NULL AND cliente IS NULL AND numero_pedido IS NULL
          AND xml_cte_original IS NOT NULL
        LIMIT 2000`);
    for (const solto of soltos) {
      let dados;
      try { dados = parseCTe(solto.xml_cte_original); } catch (e) { continue; }
      const chaves = dados.chaves_nfe_referenciadas || [];
      const numeros = [...numerosDasChaves(chaves), dados.numero_nf_referenciada ? String(dados.numero_nf_referenciada).replace(/^0+(?=\d)/, '') : null].filter(Boolean);
      if (!chaves.length && !numeros.length) continue;
      const { rows: notas } = await pool.query(
        `SELECT * FROM fretes
          WHERE id <> $1 AND frete_principal_id IS NULL AND cliente IS NOT NULL
            AND (chave_nfe = ANY($2) OR LTRIM(numero_nf, '0') = ANY($3))
          ORDER BY (chave_cte IS NULL) DESC, id LIMIT 1`,
        [solto.id, chaves, numeros]);
      const nota = notas[0];
      if (!nota) continue;

      if (!nota.chave_cte) {
        // A nota ainda esperava CT-e: o CT-e vai pra linha dela e a linha solta some.
        const cliente = await pool.connect();
        try {
          await cliente.query('BEGIN');
          await cliente.query('DELETE FROM fretes WHERE id = $1', [solto.id]);
          const sets = CAMPOS_DO_CTE.map((c, i) => `${c} = $${i + 2}`).join(', ');
          await cliente.query(
            `UPDATE fretes SET ${sets}, transportadora = COALESCE(transportadora, $${CAMPOS_DO_CTE.length + 2}),
                    observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), NULLIF($${CAMPOS_DO_CTE.length + 3}, '')),
                    atualizado_em = NOW()
              WHERE id = $1`,
            [nota.id, ...CAMPOS_DO_CTE.map((c) => solto[c] ?? null), solto.transportadora_cte || solto.transportadora, solto.observacoes || '']);
          await cliente.query('COMMIT');
        } catch (err) {
          await cliente.query('ROLLBACK').catch(() => {});
          console.error('[ctes] Não consegui juntar o CT-e', solto.numero_cte, 'com a nota', nota.numero_nf, err.message);
          continue;
        } finally {
          cliente.release();
        }
        try { await require('./calculoFrete').calcularEGravar(nota.id, 'ct-e-juntado-a-nota'); } catch (e) { /* segue */ }
        await recalcularFilhos(nota.id);
      } else {
        // A nota já tinha CT-e: esse vira um CT-e a mais dela.
        const vinculo = classificar(nota, { tipo_cte: solto.tipo_cte || 0, transportador_cnpj: solto.transportadora_cnpj_cte, transportadora: solto.transportadora_cte || solto.transportadora, observacoes_cte: dados.observacoes_cte || '' });
        const alerta = vinculo === 'redespacho';
        const pct = await percentualReentrega();
        const esperado = valorEsperado(vinculo, nota, pct);
        const campos = CAMPOS_DA_NOTA.filter((c) => c !== 'numero_nf');
        const sets = campos.map((c, i) => `${c} = $${i + 1}`);
        const params = campos.map((c) => nota[c] ?? null);
        params.push(nota.numero_nf, nota.id, vinculo, alerta, esperado, alerta ? 'Frete Retido' : null, solto.id);
        const n = params.length;
        await pool.query(
          `UPDATE fretes SET ${sets.join(', ')}, numero_nf = $${n - 6}, frete_principal_id = $${n - 5}, vinculo_cte = $${n - 4},
                  alerta_transportadora_diferente = $${n - 3}, valor_total_calculado = COALESCE($${n - 2}::numeric, valor_total_calculado),
                  status = COALESCE($${n - 1}::text, status), atualizado_em = NOW()
            WHERE id = $${n}`, params);
        if (alerta) await pool.query('UPDATE fretes SET alerta_transportadora_diferente = TRUE WHERE id = $1', [nota.id]);
      }
      juntados += 1;
    }
    if (juntados) console.log(`[ctes] ${juntados} CT-e que tinham chegado antes da nota foram juntados à nota deles.`);
  } catch (err) {
    console.error('[ctes] Erro ao juntar CT-e soltos:', err.message);
  } finally {
    reconciliando = false;
  }
  return juntados;
}

// ---------- Transportadora que levou a nota ----------
// Quando a nota tem CT-e de transportadoras diferentes, alguém decide qual
// delas levou de fato. Os CT-e dessa transportadora seguem a conferência
// normal (pela tabela dela); os das outras ficam marcados "não levou" e
// nunca são pagos. A decisão fica no registro principal da nota.
const MARCA_NAO_LEVOU = 'Transportadora não levou a nota';
function chaveTransportadora(r) {
  const cnpj = soDigitos(r.transportadora_cnpj_cte);
  if (cnpj.length === 14) return `CNPJ:${cnpj.slice(0, 8)}`;
  return `NOME:${normalizarNome(r.transportadora_cte || r.transportadora)}`;
}
const nomeTransp = (r) => r.transportadora_cte || r.transportadora || '—';

// Tira as marcas de uma decisão anterior (sem recalcular nada ainda).
async function limparDecisao(cliente, principalId) {
  await cliente.query(
    `UPDATE fretes SET cte_nao_levou = FALSE,
            status_aprovacao = CASE WHEN motivo_rejeicao LIKE $2 THEN 'Pendente' ELSE status_aprovacao END,
            aprovado_por_nome = CASE WHEN motivo_rejeicao LIKE $2 THEN NULL ELSE aprovado_por_nome END,
            aprovado_em = CASE WHEN motivo_rejeicao LIKE $2 THEN NULL ELSE aprovado_em END,
            status = CASE WHEN motivo_rejeicao LIKE $2 AND COALESCE(status, 'Pendente') NOT IN ('Faturado', 'Cancelado') THEN 'Pendente' ELSE status END,
            motivo_rejeicao = CASE WHEN motivo_rejeicao LIKE $2 THEN NULL ELSE motivo_rejeicao END,
            atualizado_em = NOW()
      WHERE (id = $1 OR frete_principal_id = $1) AND cte_nao_levou`,
    [principalId, `${MARCA_NAO_LEVOU}%`]);
  await cliente.query(
    `UPDATE fretes SET cte_que_levou_id = NULL, transportadora_definida_por = NULL, transportadora_definida_em = NULL WHERE id = $1`,
    [principalId]);
}

// Refaz a conta de todos os CT-e abertos da nota (dispara a conferência de novo).
async function reconferirNota(principalId) {
  const { calcularEGravar } = require('./calculoFrete');
  const { rows } = await pool.query(
    `SELECT id FROM fretes WHERE (id = $1 OR (frete_principal_id = $1 AND vinculo_cte IN ('redespacho', 'redespacho_nota')))
        AND NOT cte_cancelado AND chave_cte IS NOT NULL`, [principalId]);
  for (const r of rows) await calcularEGravar(r.id, 'transportadora-que-levou').catch(() => null);
  await recalcularFilhos(principalId);
  // CT-e sem cálculo pela tabela (ou que não mudou de valor) também passa pela conferência.
  await pool.query('UPDATE fretes SET atualizado_em = NOW() WHERE (id = $1 OR frete_principal_id = $1) AND NOT cte_cancelado', [principalId]);
}

async function definirTransportadoraQueLevou(freteId, cteEscolhidoId, usuario) {
  const { rows: atual } = await pool.query('SELECT id, frete_principal_id FROM fretes WHERE id = $1', [freteId]);
  if (!atual[0]) return { erro: 'Registro não encontrado.', status: 404 };
  const principalId = atual[0].frete_principal_id || atual[0].id;
  const cliente = await pool.connect();
  let resultado;
  try {
    await cliente.query('BEGIN');
    const { rows: ctes } = await cliente.query(
      `SELECT * FROM fretes WHERE (id = $1 OR frete_principal_id = $1) AND chave_cte IS NOT NULL AND NOT cte_cancelado
        ORDER BY (frete_principal_id IS NULL) DESC, data_emissao_cte, id FOR UPDATE`, [principalId]);
    const escolhido = ctes.find((c) => c.id === Number(cteEscolhidoId));
    if (!escolhido) { await cliente.query('ROLLBACK'); return { erro: 'Esse CT-e não é desta nota (ou foi cancelado).', status: 400 }; }

    await limparDecisao(cliente, principalId);
    const chave = chaveTransportadora(escolhido);
    const outros = ctes.filter((c) => chaveTransportadora(c) !== chave);
    const faturados = [];
    for (const c of outros) {
      const motivo = `${MARCA_NAO_LEVOU}: quem levou foi ${nomeTransp(escolhido)} (CT-e ${escolhido.numero_cte || '?'}). Definido por ${usuario.nome}.`;
      const jaFaturado = c.status === 'Faturado' || c.fatura_id;
      if (jaFaturado) faturados.push(c.numero_cte || `#${c.id}`);
      await cliente.query(
        `UPDATE fretes SET cte_nao_levou = TRUE,
                status_aprovacao = CASE WHEN $2 THEN status_aprovacao ELSE 'Rejeitado' END,
                aprovado_por_nome = CASE WHEN $2 THEN aprovado_por_nome ELSE $3 END,
                aprovado_em = CASE WHEN $2 THEN aprovado_em ELSE NOW() END,
                motivo_rejeicao = CASE WHEN $2 THEN motivo_rejeicao ELSE $4 END,
                observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $5::text), atualizado_em = NOW()
          WHERE id = $1`,
        [c.id, !!jaFaturado, usuario.nome, motivo,
         `🚫 ${motivo}${jaFaturado ? ' ⚠ Esse CT-e já estava FATURADO: cobre o estorno da transportadora.' : ''}`]);
    }
    // Tira o alerta ANTES de soltar os CT-e (com o alerta ligado, o trigger prende de novo).
    await cliente.query('UPDATE fretes SET alerta_transportadora_diferente = FALSE WHERE id = $1 OR frete_principal_id = $1', [principalId]);
    await cliente.query(
      `UPDATE fretes SET cte_que_levou_id = $2, transportadora_definida_por = $3, transportadora_definida_em = NOW() WHERE id = $1`,
      [principalId, escolhido.id, usuario.nome]);
    // Os CT-e da transportadora que levou deixam de estar presos pelo alerta
    // (o trigger confere de novo: se divergir da tabela, volta a ficar retido).
    await cliente.query(
      `UPDATE fretes SET status = 'Pendente', atualizado_em = NOW()
        WHERE (id = $1 OR frete_principal_id = $1) AND NOT cte_nao_levou AND NOT cte_cancelado
          AND status = 'Frete Retido' AND status_aprovacao IS DISTINCT FROM 'Aprovado'`, [principalId]);
    await cliente.query('COMMIT');
    resultado = { principalId, escolhido, outros, faturados };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
  await reconferirNota(principalId);
  const { escolhido, outros, faturados } = resultado;
  return {
    principalId,
    transportadora: nomeTransp(escolhido),
    mensagem: `Definido: quem levou a nota foi ${nomeTransp(escolhido)}.`
      + (outros.length ? ` ${outros.length} CT-e de outra transportadora ficaram marcados como "não levou" e não serão pagos.` : '')
      + (faturados.length ? ` ⚠ Já estava(m) faturado(s): ${faturados.join(', ')} — cobre o estorno da transportadora.` : ''),
    resumo: `${nomeTransp(escolhido)} (CT-e ${escolhido.numero_cte || '?'}); não levou: ${outros.map((c) => `${nomeTransp(c)} CT-e ${c.numero_cte || '?'}`).join(', ') || '—'}`,
  };
}

async function desfazerTransportadoraQueLevou(freteId) {
  const { rows: atual } = await pool.query('SELECT id, frete_principal_id FROM fretes WHERE id = $1', [freteId]);
  if (!atual[0]) return { erro: 'Registro não encontrado.', status: 404 };
  const principalId = atual[0].frete_principal_id || atual[0].id;
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await limparDecisao(cliente, principalId);
    await atualizarAlertaNota(cliente, principalId);
    // Volta o alerta nos CT-e de outra transportadora (e eles ficam presos de novo).
    await cliente.query(
      `UPDATE fretes SET alerta_transportadora_diferente = TRUE,
              status = CASE WHEN COALESCE(status, 'Pendente') IN ('Faturado', 'Cancelado') OR status_aprovacao = 'Aprovado' THEN status ELSE 'Frete Retido' END,
              atualizado_em = NOW()
        WHERE frete_principal_id = $1 AND vinculo_cte = 'redespacho' AND NOT cte_cancelado`, [principalId]);
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
  await reconferirNota(principalId);
  return { principalId, mensagem: 'Decisão desfeita: a nota voltou a ficar com o alerta de transportadoras diferentes.' };
}

// Uma vez, ao ligar: CT-e de outra transportadora que chegaram antes desta
// versão nunca foram calculados pela tabela — calcula agora.
async function calcularRedespachosSemCalculo() {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM fretes WHERE vinculo_cte IN ('redespacho', 'redespacho_nota') AND frete_principal_id IS NOT NULL AND NOT cte_cancelado
          AND valor_total_calculado IS NULL AND COALESCE(status, 'Pendente') NOT IN ('Faturado', 'Cancelado') LIMIT 500`);
    const { calcularEGravar } = require('./calculoFrete');
    let ok = 0;
    for (const r of rows) { const c = await calcularEGravar(r.id, 'redespacho-sem-calculo').catch(() => null); if (c?.ok) ok += 1; }
    if (ok) console.log(`[ctes] ${ok} CT-e de outra transportadora foram calculados pela tabela dela.`);
  } catch (err) {
    console.error('[ctes] Não consegui calcular os CT-e de outra transportadora:', err.message);
  }
}

// Guarda tipo de serviço e tomador do CT-e (lidos do XML) no registro dele.
async function gravarDadosCte(chaveCte, dados) {
  if (!chaveCte) return;
  await pool.query(
    `UPDATE fretes SET tp_serv_cte = $2, tomador_cte_papel = $3, tomador_cte_cnpj = $4, tomador_cte_nome = $5 WHERE chave_cte = $1`,
    [chaveCte, dados.tp_serv ?? null, dados.tomador_papel || null, dados.tomador_cnpj || null, dados.tomador_nome || null]);
}

// Ao ligar: (1) lê tipo de serviço e tomador dos CT-e antigos, direto do XML
// guardado; (2) CT-e "de outra transportadora" que na verdade são o
// REDESPACHO previsto na nota deixam de ter o alerta e passam a ser
// conferidos pela tabela deles. Decisão já tomada nessas notas ("quem levou")
// é desfeita, porque o alerta era falso.
async function revisarCtesDeOutraTransportadora() {
  const { parseCTe } = require('./utils/xmlParser');
  try {
    const { rows: semDados } = await pool.query(
      `SELECT id, chave_cte, xml_cte_original FROM fretes
        WHERE tp_serv_cte IS NULL AND tomador_cte_papel IS NULL AND xml_cte_original IS NOT NULL AND chave_cte IS NOT NULL LIMIT 20000`);
    for (const r of semDados) {
      try { await gravarDadosCte(r.chave_cte, parseCTe(r.xml_cte_original)); } catch (e) { /* XML ilegível: segue */ }
    }

    const { rows } = await pool.query(
      `SELECT f.id, f.numero_cte, f.transportadora, f.transportadora_cte, f.transportadora_cnpj_cte, f.tp_serv_cte, f.vinculo_cte,
              f.status, f.status_aprovacao, f.aprovado_por_nome, f.fatura_id,
              f.tomador_cte_cnpj, f.tomador_cte_nome, f.tomador_cte_papel,
              p.id AS principal_id, p.redespacho, p.redespacho_cnpj, p.xml_nfe_original, p.chave_nfe,
              p.transportadora AS p_transportadora, p.transportadora_cte AS p_transportadora_cte,
              p.transportadora_cnpj_cte AS p_transportadora_cnpj_cte, p.tp_serv_cte AS p_tp_serv_cte
         FROM fretes f JOIN fretes p ON p.id = f.frete_principal_id
        WHERE f.vinculo_cte IN ('redespacho', 'redespacho_nota', 'reposicao', 'reentrega', 'devolucao') AND NOT f.cte_cancelado
          AND COALESCE(f.status, 'Pendente') NOT IN ('Faturado', 'Cancelado', 'Não cobrado', 'Arquivado')`);
    const notas = new Set();
    for (const r of rows) {
      const dados = { tp_serv: r.tp_serv_cte, transportadora: r.transportadora_cte || r.transportadora, transportador_cnpj: r.transportadora_cnpj_cte,
        tomador_cnpj: r.tomador_cte_cnpj, tomador_nome: r.tomador_cte_nome, tomador_papel: r.tomador_cte_papel };
      const principal = { redespacho: r.redespacho, redespacho_cnpj: r.redespacho_cnpj, xml_nfe_original: r.xml_nfe_original, chave_nfe: r.chave_nfe,
        tp_serv_cte: r.p_tp_serv_cte, transportadora: r.p_transportadora, transportadora_cte: r.p_transportadora_cte, transportadora_cnpj_cte: r.p_transportadora_cnpj_cte };
      // Pago por outro (tomador ≠ empresa): vira histórico — a não ser que uma pessoa já tenha aprovado.
      const aprovadoPorPessoa = r.status_aprovacao === 'Aprovado' && !String(r.aprovado_por_nome || '').startsWith('Sistema');
      if (!r.fatura_id && !aprovadoPorPessoa && tomadorEhOutro(principal, dados)) {
        await pool.query(
          `UPDATE fretes SET status = 'Não cobrado', alerta_transportadora_diferente = FALSE, cte_nao_levou = FALSE,
                  status_aprovacao = 'Pendente', aprovado_por_nome = NULL, aprovado_em = NULL, valor_total_calculado = NULL,
                  observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $2::text), atualizado_em = NOW()
            WHERE id = $1`,
          [r.id, `CT-e pago por ${r.tomador_cte_nome || PAPEL_TOMADOR[r.tomador_cte_papel] || 'outra pessoa'} (tomador: ${PAPEL_TOMADOR[r.tomador_cte_papel] || '?'}) — não é cobrado da empresa; fica só como histórico da nota.`]);
        notas.add(r.principal_id);
        continue;
      }
      if (r.vinculo_cte !== 'redespacho' || !ehRedespachoDaNota(principal, dados)) continue;
      await pool.query(
        `UPDATE fretes SET vinculo_cte = 'redespacho_nota', alerta_transportadora_diferente = FALSE,
                observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), 'CT-e do redespacho previsto na nota — conferido pela tabela da transportadora dele.'),
                atualizado_em = NOW()
          WHERE id = $1`, [r.id]);
      notas.add(r.principal_id);
    }
    for (const principalId of notas) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const { rows: p } = await c.query('SELECT cte_que_levou_id FROM fretes WHERE id = $1', [principalId]);
        if (p[0]?.cte_que_levou_id) await limparDecisao(c, principalId);
        await atualizarAlertaNota(c, principalId);
        // Sem alerta na nota, os CT-e presos só por ele voltam pra conferência.
        await c.query(
          `UPDATE fretes SET status = 'Pendente', atualizado_em = NOW()
            WHERE (id = $1 OR frete_principal_id = $1) AND NOT cte_cancelado AND status = 'Frete Retido'
              AND status_aprovacao IS DISTINCT FROM 'Aprovado'
              AND NOT EXISTS (SELECT 1 FROM fretes pp WHERE pp.id = $1 AND pp.alerta_transportadora_diferente)`, [principalId]);
        await c.query('UPDATE fretes SET alerta_transportadora_diferente = FALSE WHERE frete_principal_id = $1 AND vinculo_cte <> \'redespacho\'', [principalId]);
        await c.query('COMMIT');
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {});
        console.error('[ctes] Não consegui revisar a nota', principalId, err.message);
        continue;
      } finally {
        c.release();
      }
      await reconferirNota(principalId);
    }
    if (notas.size) console.log(`[ctes] ${notas.size} nota(s) com CT-e de redespacho previsto tiveram o alerta de transportadoras diferentes retirado.`);
  } catch (err) {
    console.error('[ctes] Erro ao revisar CT-e de outra transportadora:', err.message);
  }
}

module.exports = { ehTransportadoraDoRedespacho, gravarDadosCte, revisarCtesDeOutraTransportadora, definirTransportadoraQueLevou, desfazerTransportadoraQueLevou, calcularRedespachosSemCalculo, reconciliarCtesSoltos, numerosDasChaves, acharPrincipal, gravarCteAdicional, recalcularFilhos, vincularCtesAntigos, percentualReentrega, cancelarCte };
