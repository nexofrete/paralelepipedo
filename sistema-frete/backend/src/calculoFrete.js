const pool = require('./db');

// Busca todos os trechos ativos de uma transportadora, já trazendo os campos
// gerais da tabela (Ad Valorem, GRIS, Pedágio, TDE/TDA/TRT, Despacho, Fator
// de Cubagem) — tudo que o cálculo completo precisa, numa consulta só.
// A transportadora é achada pelo CNPJ do CT-e (o exato e, se não tiver tabela
// nele, pela raiz — mesma empresa, outra filial). Só quando não há CNPJ é que
// cai no nome, que pode variar ("FAST-X" x "FAST X TRANSPORTES").
async function buscarTrechos(transportadoraNome, transportadoraCnpj) {
  const cnpj = String(transportadoraCnpj || '').replace(/\D/g, '');
  if (cnpj.length === 14) {
    for (const [condicao, valor] of [
      [`REGEXP_REPLACE(COALESCE(t.cnpj, ''), '[^0-9]', '', 'g') = $1`, cnpj],
      [`LEFT(REGEXP_REPLACE(COALESCE(t.cnpj, ''), '[^0-9]', '', 'g'), 8) = $1`, cnpj.slice(0, 8)],
    ]) {
      const { rows } = await pool.query(
        `SELECT f.*, tp.id AS tabela_preco_id, tp.nome AS tabela_nome, tp.uf_destino AS tabela_uf_destino, tp.prazo_dias AS tabela_prazo_dias,
                tp.ad_valorem_percentual, tp.gris_percentual, tp.gris_minimo,
                tp.pedagio AS tabela_pedagio, tp.tde AS tabela_tde, tp.tda AS tabela_tda,
                tp.trt AS tabela_trt, tp.despacho_valor, tp.cubagem_kg_m3, tp.descarga_valor, tp.descarga_modo, tp.descarga_minimo, tp.descarga_aplicar, tp.descarga_clientes, tp.icms_incluir, tp.icms_aliquota, tp.icms_modo,
                t.razao_social AS transportadora_nome
         FROM tabela_preco_faixas f
         JOIN tabelas_preco tp ON tp.id = f.tabela_preco_id
         JOIN transportadoras t ON t.id = tp.transportadora_id
         WHERE tp.ativa = TRUE AND ${condicao}
         ORDER BY f.destino ASC, f.tipo_carga ASC`, [valor]);
      if (rows.length) return rows;
    }
  }
  if (!transportadoraNome) return [];
  const { rows } = await pool.query(
    `SELECT f.*, tp.id AS tabela_preco_id, tp.nome AS tabela_nome, tp.uf_destino AS tabela_uf_destino, tp.prazo_dias AS tabela_prazo_dias,
            tp.ad_valorem_percentual, tp.gris_percentual, tp.gris_minimo,
            tp.pedagio AS tabela_pedagio, tp.tde AS tabela_tde, tp.tda AS tabela_tda,
            tp.trt AS tabela_trt, tp.despacho_valor, tp.cubagem_kg_m3, tp.descarga_valor, tp.descarga_modo, tp.descarga_minimo, tp.descarga_aplicar, tp.descarga_clientes, tp.icms_incluir, tp.icms_aliquota, tp.icms_modo,
            t.razao_social AS transportadora_nome
     FROM tabela_preco_faixas f
     JOIN tabelas_preco tp ON tp.id = f.tabela_preco_id
     JOIN transportadoras t ON t.id = tp.transportadora_id
     WHERE tp.ativa = TRUE AND t.razao_social ILIKE $1
     ORDER BY f.destino ASC, f.tipo_carga ASC`,
    [`%${transportadoraNome}%`]
  );
  return rows;
}

// Remove acentos e normaliza espaços, pra "São Paulo" e "Sao Paulo" (ou com
// espaços extras) serem tratados como a mesma cidade na hora de comparar.
function normalizarCidade(texto) {
  return (texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tira acentos
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

// Acha, dentre os trechos já buscados, o que tem algum dos candidatos (ex:
// cidade E bairro) na sua lista de cidades cadastradas — algumas
// transportadoras organizam a Capital por BAIRRO em vez de pelo nome da
// cidade, então aceitamos qualquer um dos dois batendo.
function trechosDaCidade(trechos, candidatos) {
  const lista = (Array.isArray(candidatos) ? candidatos : [candidatos]).filter(Boolean).map(normalizarCidade);
  if (lista.length === 0) return [];
  return trechos.filter((t) => {
    const cidadesTrecho = (t.cidades || '').split(',').map((c) => normalizarCidade(c));
    return lista.some((alvo) => cidadesTrecho.includes(alvo));
  });
}
// A mesma praça pode ter mais de um trecho (ex.: CAIXA e TAPETE, ou faixas de
// peso). Prefere o do Tipo de Carga do registro e, no cálculo por peso, a faixa
// em que o peso considerado cabe ("peso até"). Sem isso, fica o 1º da lista.
function preferirTrecho(achados, { tipoCarga, pesoKg, cubagemM3 } = {}) {
  let lista = achados;
  const tipo = semAcentoMaiusc(tipoCarga);
  if (tipo && lista.length > 1) {
    const mesmoTipo = lista.filter((t) => {
      const x = semAcentoMaiusc(t.tipo_carga);
      return x && (x === tipo || x.startsWith(tipo) || tipo.startsWith(x));
    });
    if (mesmoTipo.length) lista = mesmoTipo;
  }
  if (lista.length > 1 && (pesoKg != null || cubagemM3 != null)) {
    const pesoDo = (t) => Math.max(Number(pesoKg) || 0, (Number(cubagemM3) || 0) * (Number(t.cubagem_kg_m3) || 300));
    const naFaixa = lista.filter((t) => t.modo_calculo !== 'peso' || t.peso_ate == null || pesoDo(t) <= Number(t.peso_ate));
    if (naFaixa.length) lista = naFaixa;
    // Faixa com "peso até" (a mais justa primeiro) vem antes da faixa aberta.
    const teto = (t) => (t.modo_calculo === 'peso' && t.peso_ate != null ? Number(t.peso_ate) : Number.MAX_VALUE);
    lista = [...lista].sort((a, b) => teto(a) - teto(b));
  }
  return lista[0] || null;
}
function encontrarTrechoPorCidade(trechos, candidatos, opcoes) {
  return preferirTrecho(trechosDaCidade(trechos, candidatos), opcoes);
}

// Bloco A + B da fórmula: descobre o Peso Considerado (o maior entre peso
// real e peso cubado) e calcula o Frete Base — por PESO (mínimo + excedente)
// ou por VOLUME (quantidade), conforme o "Modo de Cálculo" do trecho.
function calcularFreteBase(trecho, { qtdVolumes, pesoKg, cubagemM3 }) {
  if (trecho.modo_calculo === 'peso') {
    const fatorCubagem = Number(trecho.cubagem_kg_m3) || 300;
    const pesoCubado = cubagemM3 != null ? Number(cubagemM3) * fatorCubagem : 0;
    const pesoReal = Number(pesoKg) || 0;
    const pesoConsiderado = Math.max(pesoReal, pesoCubado);
    const pesoMinimo = trecho.peso_de != null ? Number(trecho.peso_de) : 0;
    const valorMinimo = Number(trecho.frete_minimo) || 0;
    const valorKgExcedente = Number(trecho.valor_kg_excedente) || 0;

    let freteBase;
    let explicacao;
    let taxaAplicada;
    if (pesoConsiderado <= pesoMinimo) {
      freteBase = valorMinimo;
      taxaAplicada = valorMinimo;
      explicacao = `Peso considerado ${pesoConsiderado.toFixed(1)}kg (real ${pesoReal}kg, cubado ${pesoCubado.toFixed(1)}kg) ≤ peso mínimo (${pesoMinimo}kg) → Valor Mínimo: R$${valorMinimo.toFixed(2)}`;
    } else {
      freteBase = valorMinimo + (pesoConsiderado - pesoMinimo) * valorKgExcedente;
      taxaAplicada = valorKgExcedente;
      explicacao = `Peso considerado ${pesoConsiderado.toFixed(1)}kg (real ${pesoReal}kg, cubado ${pesoCubado.toFixed(1)}kg) → R$${valorMinimo.toFixed(2)} + [(${pesoConsiderado.toFixed(1)} - ${pesoMinimo}) × R$${valorKgExcedente}/kg] = R$${freteBase.toFixed(2)}`;
    }
    return { freteBase, explicacao, modo: 'peso', pesoConsiderado, pesoCubado, pesoReal, taxaAplicada };
  }

  // Modo VOLUME (padrão): regra simples e direta, sem nenhum ajuste extra —
  // Qtd. Volumes <= Volume Mínimo → Frete Mínimo; Qtd. Volumes > Volume
  // Mínimo → Valor por Volume × Qtd. Volumes (mesmo que dê menos que o mínimo).
  const volumeMinimo = trecho.volume_minimo != null ? Number(trecho.volume_minimo) : null;
  const qtd = Number(qtdVolumes) || 0;
  let freteBase;
  let explicacao;
  let taxaAplicada;
  if (volumeMinimo != null && qtd <= volumeMinimo) {
    freteBase = Number(trecho.frete_minimo);
    // Na coluna "Tabela de Preço" vai o Frete Mínimo dividido pelo Volume
    // Mínimo — o valor por volume que o mínimo representa (ex: R$115 ÷ 10 =
    // R$11,50), pra comparar direto com o Valor por Volume da tabela.
    const divisor = volumeMinimo > 0 ? volumeMinimo : 10;
    taxaAplicada = Math.round((freteBase / divisor) * 100) / 100;
    explicacao = `${qtd} volume(s) ≤ volume mínimo (${volumeMinimo}) → Frete Mínimo: R$${freteBase.toFixed(2)} (R$${freteBase.toFixed(2)} ÷ ${divisor} = R$${taxaAplicada.toFixed(2)} por volume)`;
  } else {
    freteBase = Number(trecho.valor_por_kg) * qtd;
    taxaAplicada = Number(trecho.valor_por_kg);
    explicacao = `${qtd} volume(s) × R$${trecho.valor_por_kg}/volume = R$${freteBase.toFixed(2)}`;
  }
  return { freteBase, explicacao, modo: 'volume', taxaAplicada };
}

// Blocos C, D, E, F da fórmula: Ad Valorem + GRIS + Pedágio + Taxas + Descarga,
// e o ICMS por cima quando a transportadora cobra "tabela + ICMS".
// opcoes: { valorFaturado, pesoKg, qtdVolumes, cliente, clienteCnpj, impostosCte, ufIni, ufFim }
const semAcentoMaiusc = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const UF_SUL_SUDESTE = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'];
const UF_N_NE_CO_ES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'PA', 'PB', 'PE', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO'];

// O cliente está na lista de descarga da tabela? Cada linha: CNPJ (ou raiz de 8
// dígitos) ou parte do nome do cliente.
function clienteNaLista(lista, cliente, clienteCnpj) {
  const cnpj = String(clienteCnpj || '').replace(/\D/g, '');
  const nome = semAcentoMaiusc(cliente);
  return String(lista || '').split(/[\n;]+/).map((l) => l.trim()).filter(Boolean).some((l) => {
    const d = l.replace(/\D/g, '');
    if (d.length >= 8 && /^[\d.\/\-\s]+$/.test(l)) return !!cnpj && cnpj.startsWith(d);
    const n = semAcentoMaiusc(l);
    return n.length >= 3 && nome.includes(n);
  });
}

function calcularComponentesEValorTotal(trecho, freteBase, opcoes = {}) {
  const { valorFaturado, pesoKg, qtdVolumes, cliente, clienteCnpj, impostosCte, ufIni, ufFim } = opcoes;
  const adValorem = (trecho.ad_valorem_percentual != null && valorFaturado != null)
    ? Number(valorFaturado) * (Number(trecho.ad_valorem_percentual) / 100) : 0;
  const gris = (trecho.gris_percentual != null && valorFaturado != null)
    ? Math.max(Number(valorFaturado) * (Number(trecho.gris_percentual) / 100), Number(trecho.gris_minimo) || 0) : 0;
  const pedagio = (trecho.tabela_pedagio != null && pesoKg != null)
    ? Number(trecho.tabela_pedagio) * Math.ceil(Number(pesoKg) / 100) : 0;
  const tde = Number(trecho.tabela_tde) || 0;
  const tda = Number(trecho.tabela_tda) || 0;
  const trt = Number(trecho.tabela_trt) || 0;
  const despacho = Number(trecho.despacho_valor) || 0;

  // Descarga: em todos os clientes ou só nos da lista.
  let descarga = 0; let descargaInfo = null;
  const vDesc = Number(trecho.descarga_valor) || 0;
  if (vDesc > 0 && (trecho.descarga_aplicar === 'todos' || clienteNaLista(trecho.descarga_clientes, cliente, clienteCnpj))) {
    const modo = trecho.descarga_modo || 'fixo';
    const base = modo === 'volume' ? vDesc * (Number(qtdVolumes) || 0)
      : modo === 'kg' ? vDesc * (Number(pesoKg) || 0)
      : modo === 'tonelada' ? vDesc * ((Number(pesoKg) || 0) / 1000)
      : vDesc;
    descarga = Math.max(base, Number(trecho.descarga_minimo) || 0);
    descargaInfo = { modo, valor: vDesc, minimo: Number(trecho.descarga_minimo) || null };
  }

  const subtotal = freteBase + adValorem + gris + pedagio + tde + tda + trt + despacho + descarga;

  // ICMS por cima do frete (transportadora que cobra "tabela + ICMS").
  let icms = 0; let icmsAliquota = null; let icmsOrigem = null;
  if (trecho.icms_incluir) {
    let imp = impostosCte;
    if (typeof imp === 'string') { try { imp = JSON.parse(imp); } catch { imp = null; } }
    const ini = String(ufIni || '').toUpperCase(); const fim = String(ufFim || '').toUpperCase();
    if (Number(trecho.icms_aliquota) > 0) { icmsAliquota = Number(trecho.icms_aliquota); icmsOrigem = 'alíquota da tabela'; }
    else if (Number(imp?.pICMS) > 0) { icmsAliquota = Number(imp.pICMS); icmsOrigem = 'alíquota do CT-e'; }
    else if (ini && fim && ini !== fim) {
      icmsAliquota = UF_SUL_SUDESTE.includes(ini) && UF_N_NE_CO_ES.includes(fim) ? 7 : 12;
      icmsOrigem = `alíquota da rota ${ini}→${fim}`;
    }
    if (icmsAliquota && icmsAliquota < 100) {
      icms = trecho.icms_modo === 'fora' ? subtotal * (icmsAliquota / 100) : subtotal / (1 - icmsAliquota / 100) - subtotal;
    }
  }

  const total = subtotal + icms;
  return { adValorem, gris, pedagio, tde, tda, trt, despacho, descarga, descargaInfo, subtotal,
    icms, icmsAliquota, icmsOrigem, icmsModo: trecho.icms_incluir ? (trecho.icms_modo || 'dentro') : null, total };
}

// CNPJ (ou CPF) do destinatário, lido do XML da NF-e guardado.
function cnpjDoDestinatario(xmlNfe) {
  const m = String(xmlNfe || '').match(/<dest>[\s\S]*?<(?:CNPJ|CPF)>(\d{11,14})<\/(?:CNPJ|CPF)>/);
  return m ? m[1] : null;
}
// Dados do registro que a descarga e o ICMS usam.
function extrasDoRegistro(reg, xmlNfe) {
  if (!reg) return {};
  return { cliente: reg.cliente, clienteCnpj: cnpjDoDestinatario(xmlNfe || reg.xml_nfe_original),
    impostosCte: reg.impostos_cte, ufIni: reg.uf_inicio_cte, ufFim: reg.uf_fim_cte };
}

// Procura, dentro das cidades cadastradas em QUALQUER trecho da transportadora,
// se alguma delas é mencionada dentro de um texto livre (usado pra achar um
// local de entrega escondido nas Observações, quando não tem Redespacho).
function encontrarCidadeMencionadaEmTexto(trechos, texto) {
  if (!texto) return null;
  const textoNormalizado = normalizarCidade(texto);
  const todasCidades = new Set();
  trechos.forEach((t) => {
    (t.cidades || '').split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => todasCidades.add(c));
  });
  for (const cidade of todasCidades) {
    if (textoNormalizado.includes(normalizarCidade(cidade))) return cidade;
  }
  return null;
}

// Municípios de verdade, tirados das próprias notas: a cidade do cliente na
// NF-e (xMun) e o cadastro de clientes. NÃO usa a cidade do redespacho gravada
// — ela é justamente a que pode vir suja ("SAO PAULO I", "GUARULHOS FRETE POR
// CONTA...") e entraria na lista como se fosse município. Guardado por 10 min.
let cacheMunicipios = { quando: 0, nomes: null };
async function municipiosConhecidos() {
  if (cacheMunicipios.nomes && Date.now() - cacheMunicipios.quando < 600000) return cacheMunicipios.nomes;
  const { rows } = await pool.query(
    `SELECT DISTINCT c FROM (
       SELECT cidade AS c FROM fretes UNION SELECT municipio FROM clientes
     ) x WHERE NULLIF(TRIM(c), '') IS NOT NULL`);
  cacheMunicipios = { quando: Date.now(), nomes: new Set(rows.map((r) => normalizarCidade(r.c).replace(/[^a-z0-9]+/g, ' ').trim())) };
  return cacheMunicipios.nomes;
}

// Bairros conhecidos de cada cidade (dos endereços das NF-e): "CAMPO GRANDE"
// é bairro do Rio (e de SP) e também município (MS). Guardado por 10 minutos.
let cacheBairros = { quando: 0, mapa: null };
const planoNome = (t) => normalizarCidade(t).replace(/[^a-z0-9]+/g, ' ').trim();
async function bairrosConhecidos() {
  if (cacheBairros.mapa && Date.now() - cacheBairros.quando < 600000) return cacheBairros.mapa;
  const { rows } = await pool.query(
    `SELECT DISTINCT cidade, bairro FROM fretes WHERE NULLIF(TRIM(cidade), '') IS NOT NULL AND NULLIF(TRIM(bairro), '') IS NOT NULL
     UNION SELECT DISTINCT municipio, bairro FROM clientes WHERE NULLIF(TRIM(municipio), '') IS NOT NULL AND NULLIF(TRIM(bairro), '') IS NOT NULL`);
  const mapa = new Map();
  rows.forEach((r) => { const c = planoNome(r.cidade); if (!mapa.has(c)) mapa.set(c, new Set()); mapa.get(c).add(planoNome(r.bairro)); });
  cacheBairros = { quando: Date.now(), mapa };
  return mapa;
}
// Cidade do redespacho que não é um município conhecido (texto a mais gravado
// junto): procura o município — o de nome mais longo — dentro do texto.
function municipioNoTexto(texto, municipios) {
  if (!texto || !municipios) return texto || null;
  const t = planoNome(texto);
  if (municipios.has(t)) return texto;
  let melhor = null;
  for (const m of municipios) if (m.length >= 3 && ` ${t} `.includes(` ${m} `) && (!melhor || m.length > melhor.length)) melhor = m;
  return melhor ? melhor.toUpperCase() : texto;
}

// Cidade do redespacho que não veio num formato conhecido ("CIDADE: X" ou
// "- X - UF -"): procura no TRECHO do redespacho nas informações da nota um
// município de verdade — primeiro um escrito com a UF ("GOIANIA/GO",
// "GOIANIA - GO"), senão o de nome mais longo. Devolve o nome ou null.
const UFS_RE = '(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)';
function cidadeDoRedespachoNoTexto(observacoes, municipios) {
  if (!observacoes || !municipios) return null;
  const m = String(observacoes).match(/REDESPACHO\s*:?([\s\S]{0,500}?)(?:FRETE\s+POR\s+CONTA|TERMO\s+DE\s+ISENCAO|$)/i);
  if (!m) return null;
  const t = ` ${planoNome(m[1])} `;
  const candidatos = [...municipios].filter((x) => x.length >= 3 && t.includes(` ${x} `)).sort((a, b) => b.length - a.length);
  if (!candidatos.length) return null;
  const comUf = candidatos.find((x) => new RegExp(` ${x} ${UFS_RE} `).test(t));
  return (comUf || candidatos[0]).toUpperCase();
}

// A cidade citada na nota vale mesmo? Não vale quando é só o BAIRRO do próprio
// cliente (a nota repetindo o endereço dele) — a não ser que venha escrita com
// OUTRA UF ("CAMPO GRANDE/MS" para cliente do RJ).
function citacaoValida(citada, { cidade, bairro, uf }, bairrosMapa) {
  if (!citada?.cidade) return null;
  const n = planoNome(citada.cidade);
  const cid = planoNome(cidade || '');
  if (n === cid) return citada;
  const ufCliente = String(uf || '').trim().toUpperCase();
  if (citada.uf && ufCliente && citada.uf !== ufCliente) return citada;
  if (bairro && n === planoNome(bairro)) return null;
  if (cid && bairrosMapa?.get(cid)?.has(n)) return null;
  return citada;
}

// ---------- Estado (UF) do trecho e cidade de entrega citada na nota ----------
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
// UF do trecho: a "UF destino" da tabela, ou a sigla no fim do destino do trecho ("SAO PAULO/SP").
function ufDoTrecho(t) {
  const daTabela = String(t.tabela_uf_destino || '').trim().toUpperCase();
  if (UFS.includes(daTabela)) return daTabela;
  const m = String(t.destino || '').toUpperCase().match(/(?:^|[^A-Z])([A-Z]{2})\s*$/);
  return m && UFS.includes(m[1]) ? m[1] : null;
}
// true = mesmo estado; false = estado diferente; null = não dá pra saber.
function trechoNoEstado(t, uf) {
  const u = String(uf || '').trim().toUpperCase();
  const ut = ufDoTrecho(t);
  if (!UFS.includes(u) || !ut) return null;
  return ut === u;
}
// Escolhe o trecho do destino: pela CIDADE (só trechos do mesmo estado, ou de
// estado desconhecido); o BAIRRO só serve de plano B com prova de que o trecho
// é desse estado/cidade — senão um bairro "CENTRO" do Rio casava com uma
// tabela de São Paulo que lista bairros da capital.
// opcoes (tipoCarga, pesoKg, cubagemM3): desempatam trechos da mesma praça.
function escolherTrechoDoDestino(trechos, { cidade, bairro, uf, ...opcoes }) {
  const porCidade = cidade ? encontrarTrechoPorCidade(trechos.filter((t) => trechoNoEstado(t, uf) !== false), [cidade], opcoes) : null;
  if (porCidade || !bairro) return porCidade;
  const cid = normalizarCidade(cidade || '');
  const comProva = trechos.filter((t) => trechoNoEstado(t, uf) === true
    || (cid && normalizarCidade(`${t.destino || ''} ${t.regiao || ''}`).includes(cid)));
  return encontrarTrechoPorCidade(comProva, [bairro], opcoes);
}
// Cidade de entrega citada nas informações da nota. Só conta quando vem num
// trecho explícito ("LOCAL DE ENTREGA", "ENTREGAR EM", "ENDEREÇO DE ENTREGA")
// ou escrita com a UF ("SAO PAULO/SP"); busca por palavra inteira, nome mais
// longo primeiro. Devolve { cidade, uf, trechoTexto } ou null.
// "municipios" (opcional): nomes de municípios de verdade (das NF-e). Só esses
// contam — as listas dos trechos misturam cidades com BAIRROS ("CENTRO",
// "MOOCA"), e "CENTRO/RJ" no endereço não pode virar "cidade de entrega".
// Palavras que, logo ANTES de um nome, mostram que ele é parte de um endereço
// (rua, bairro) e não a cidade: "RUA SANTOS DUMONT", "JARDIM DOS SANTOS".
const PALAVRAS_DE_ENDERECO = new Set(['rua', 'r', 'av', 'avenida', 'travessa', 'tv', 'trav', 'estrada', 'estr', 'est', 'rodovia', 'rod',
  'praca', 'pca', 'pc', 'alameda', 'al', 'largo', 'lg', 'beco', 'viela', 'jardim', 'jd', 'jrd', 'parque', 'pq', 'prq', 'vila', 'vl',
  'conjunto', 'cj', 'conj', 'residencial', 'res', 'loteamento', 'lot', 'condominio', 'cond', 'galpao', 'quadra', 'qd', 'lote', 'lt',
  'dos', 'das', 'bairro', 'nossa', 'senhora']);
const UFS_LISTA = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to'];

// Cidade de entrega citada nas informações da nota ("LOCAL DE ENTREGA: ...",
// "ENTREGAR EM ...", ou uma cidade escrita com a UF). Os candidatos são TODOS
// os municípios conhecidos (não só os das tabelas: a cidade é descoberta
// primeiro, a tabela que atende vem depois). Descarta nome que é parte de rua
// ou bairro; prefere cidade escrita com a UF, depois a do mesmo estado do
// cliente, e a mais perto do fim do endereço.
// opcoes: { ufs: Map(município -> Set de UFs), ufCliente }
function cidadeDeEntregaNaNota(trechos, texto, municipios = null, opcoes = {}) {
  if (!texto) return null;
  const { ufs = null, ufCliente = null } = opcoes;
  const ufCli = String(ufCliente || '').toLowerCase();
  const nomes = municipios
    ? [...municipios].filter((n) => n.length >= 3)
    : [...new Set(trechos.flatMap((t) => String(t.cidades || '').split(',').map((c) => planoNome(c)).filter((n) => n.length >= 3)))];
  // Acha a melhor cidade num pedaço de texto. exigirUf: só vale cidade com a UF escrita depois.
  const melhorEm = (pedaco, exigirUf) => {
    const palavras = planoNome(pedaco).split(' ').filter(Boolean);
    const t = ` ${palavras.join(' ')} `;
    let melhor = null;
    for (const nome of nomes) {
      const alvo = ` ${nome} `;
      let pos = t.indexOf(alvo);
      while (pos !== -1) {
        const antes = t.slice(0, pos).trim().split(' ').pop();
        const depois = t.slice(pos + alvo.length).trim().split(' ')[0] || '';
        const ufEscrita = UFS_LISTA.includes(depois) ? depois : null;
        const ufsDoNome = ufs?.get(nome);
        const valida = !PALAVRAS_DE_ENDERECO.has(antes) && (!ufEscrita || !ufsDoNome || ufsDoNome.has(ufEscrita.toUpperCase()));
        if (valida && (!exigirUf || ufEscrita)) {
          const pontos = (ufEscrita ? 1000 : 0) + (ufCli && ufsDoNome?.has(ufCli.toUpperCase()) ? 500 : 0) + nome.length * 2 + pos / t.length * 10;
          if (!melhor || pontos > melhor.pontos) {
            const ufFinal = ufEscrita ? ufEscrita.toUpperCase()
              : (ufsDoNome && ufsDoNome.size === 1 ? [...ufsDoNome][0] : (ufCli && ufsDoNome?.has(ufCli.toUpperCase()) ? ufCli.toUpperCase() : null));
            melhor = { nome, uf: ufFinal, pontos };
          }
        }
        pos = t.indexOf(alvo, pos + 1);
      }
    }
    return melhor;
  };
  // 1) trecho explícito de local de entrega
  const marcador = String(texto).match(/(?:LOCAL\s+DE\s+ENTREGA|ENTREGAR\s+EM|ENTREGA\s+EM|ENDERE[CÇ]O\s+DE\s+ENTREGA)\s*:?([\s\S]{0,300})/i);
  if (marcador) {
    const achada = melhorEm(marcador[1], false);
    if (achada) return { cidade: achada.nome.toUpperCase(), uf: achada.uf, trechoTexto: marcador[1].trim().slice(0, 80) };
  }
  // 2) qualquer cidade escrita junto com a UF
  const comUf = melhorEm(texto, true);
  if (comUf) return { cidade: comUf.nome.toUpperCase(), uf: comUf.uf, trechoTexto: null };
  return null;
}

// Município -> UFs (das notas e do cadastro de clientes). Guardado por 10 minutos.
let cacheMunicipiosUf = { quando: 0, mapa: null };
async function municipiosComUf() {
  if (cacheMunicipiosUf.mapa && Date.now() - cacheMunicipiosUf.quando < 600000) return cacheMunicipiosUf.mapa;
  const { rows } = await pool.query(
    `SELECT DISTINCT cidade AS c, uf FROM fretes WHERE NULLIF(TRIM(cidade), '') IS NOT NULL AND NULLIF(TRIM(uf), '') IS NOT NULL
     UNION SELECT DISTINCT municipio, uf FROM clientes WHERE NULLIF(TRIM(municipio), '') IS NOT NULL AND NULLIF(TRIM(uf), '') IS NOT NULL`);
  const mapa = new Map();
  rows.forEach((r) => { const n = planoNome(r.c); if (!mapa.has(n)) mapa.set(n, new Set()); mapa.get(n).add(String(r.uf).trim().toUpperCase()); });
  cacheMunicipiosUf = { quando: Date.now(), mapa };
  return mapa;
}

// Busca TODOS os trechos ativos de TODAS as transportadoras — usado pelo
// Comparador de Cotações, que precisa olhar todo mundo de uma vez, não só
// uma transportadora específica.
async function buscarTodosTrechosAtivos() {
  const { rows } = await pool.query(
    `SELECT f.*, tp.id AS tabela_preco_id, tp.nome AS tabela_nome, tp.uf_destino AS tabela_uf_destino,
            tp.ad_valorem_percentual, tp.gris_percentual, tp.gris_minimo,
            tp.pedagio AS tabela_pedagio, tp.tde AS tabela_tde, tp.tda AS tabela_tda,
            tp.trt AS tabela_trt, tp.despacho_valor, tp.cubagem_kg_m3, tp.descarga_valor, tp.descarga_modo, tp.descarga_minimo, tp.descarga_aplicar, tp.descarga_clientes, tp.icms_incluir, tp.icms_aliquota, tp.icms_modo,
            t.razao_social AS transportadora_nome
     FROM tabela_preco_faixas f
     JOIN tabelas_preco tp ON tp.id = f.tabela_preco_id
     JOIN transportadoras t ON t.id = tp.transportadora_id
     WHERE tp.ativa = TRUE
     ORDER BY t.razao_social ASC`
  );
  return rows;
}

// Junta tudo: acha a transportadora certa (pelo Transporte Cte), depois a
// cidade certa nessa ordem de prioridade —
//   1) Redespacho preenchido → usa a Cidade do Redespacho
//   2) Sem Redespacho → procura uma cidade cadastrada mencionada nas Observações
//   3) Se não achar em nenhum dos dois → usa a Cidade do cliente
// — sempre testando também o BAIRRO do cliente junto (algumas transportadoras
// organizam a Capital por bairro, não pelo nome da cidade) — e por fim
// calcula o Valor Total Calculado no trecho encontrado.
async function calcularParaRegistro({ transportadoraCte, transportadoraCnpj, cidade, bairro, cidadeRedespacho, redespacho, observacoes, qtdVolumes, pesoKg, cubagemM3, valorFaturado, registro, xmlNfe, redespachoCnpj }) {
  if (!transportadoraCte && !transportadoraCnpj) return { erro: 'Registro sem "Transporte Cte" (transportadora do CT-e) preenchida.' };

  const trechos = await buscarTrechos(transportadoraCte, transportadoraCnpj);
  if (trechos.length === 0) return { erro: 'Nenhuma tabela de preço ativa encontrada para a transportadora do CT-e.' };

  let candidatos = [];
  let origemCidade = null;
  let ufDestino = null;   // UF do destino (cliente, ou a escrita junto da cidade citada) — trecho de outro estado não vale

  if (redespacho) {
    // 1º: a cidade do CADASTRO da transportadora de redespacho, pelo CNPJ que vem
    // na nota (cadastrada sozinha pela BrasilAPI) — o jeito mais confiável.
    const cnpjRed = String(redespachoCnpj || registro?.redespacho_cnpj || '').replace(/\D/g, '');
    const red = require('./transportadorasRedespacho');
    const doCadastro = cnpjRed.length === 14 ? red.cidadeDoCnpj(await red.cidadesPorCnpj().catch(() => null), cnpjRed) : null;
    // 2º: a cidade do redespacho gravada; se vier vazia (ou não for município),
    // procura no texto do redespacho nas observações (ex.: redespacho por autônomo).
    const munis = await municipiosConhecidos().catch(() => null);
    const gravada = cidadeRedespacho ? municipioNoTexto(cidadeRedespacho, munis) : null;
    const valeGravada = gravada && (!munis || munis.has(planoNome(gravada)));
    cidadeRedespacho = doCadastro?.municipio || (valeGravada ? gravada : (cidadeDoRedespachoNoTexto(observacoes, munis) || gravada));
    if (doCadastro?.uf) ufDestino = doCadastro.uf;   // trecho de outro estado não vale
    if (cidadeRedespacho) {
      candidatos = [cidadeRedespacho];
      origemCidade = 'Cidade do Redespacho';
    }
  } else {
    const citada = citacaoValida(cidadeDeEntregaNaNota(trechos, observacoes, await municipiosConhecidos().catch(() => null),
      { ufs: await municipiosComUf().catch(() => null), ufCliente: registro?.uf }),
      { cidade, bairro, uf: registro?.uf }, await bairrosConhecidos().catch(() => null));
    if (citada) {
      candidatos = [citada.cidade];
      origemCidade = 'Observações';
      ufDestino = citada.uf;
    } else {
      candidatos = [cidade, bairro];
      origemCidade = 'Cidade/Bairro do cliente';
      ufDestino = registro?.uf || null;
    }
  }
  candidatos = candidatos.filter(Boolean);

  if (candidatos.length === 0) {
    return {
      erro: redespacho
        ? 'Tem Redespacho preenchido, mas o campo "Cidade do Redespacho" está vazio.'
        : 'Não achei nenhuma cidade cadastrada mencionada nas Observações, e os campos Cidade e Bairro também estão vazios.',
    };
  }

  const desempate = { tipoCarga: registro?.tipo_carga, pesoKg, cubagemM3 };
  const trecho = origemCidade === 'Cidade/Bairro do cliente'
    ? escolherTrechoDoDestino(trechos, { cidade, bairro, uf: ufDestino, ...desempate })
    : escolherTrechoDoDestino(trechos, { cidade: candidatos[0], bairro: null, uf: ufDestino, ...desempate });
  if (!trecho) {
    const cidadesCadastradas = [...new Set(
      trechos.flatMap((t) => (t.cidades || '').split(',').map((c) => c.trim()).filter(Boolean))
    )];
    return {
      erro: `Nenhum trecho encontrado com "${candidatos.join('" nem "')}" (via ${origemCidade}${ufDestino ? `, UF ${ufDestino}: trechos de outro estado não valem` : ''}). Cidades/bairros cadastrados nos trechos dessa transportadora: ${cidadesCadastradas.length ? cidadesCadastradas.join(', ') : '(nenhuma — os trechos não têm nenhuma cidade cadastrada ainda)'}.`,
    };
  }

  const base = calcularFreteBase(trecho, { qtdVolumes, pesoKg, cubagemM3 });
  const { freteBase, modo, taxaAplicada } = base;
  let { explicacao } = base;
  const componentes = calcularComponentesEValorTotal(trecho, freteBase, { valorFaturado, pesoKg, qtdVolumes, ...extrasDoRegistro(registro, xmlNfe) });
  const cidadeUsada = candidatos.find((c) => encontrarTrechoPorCidade([trecho], [c])) || candidatos[0];

  // Praça com outros tipos de carga e o registro sem Tipo de Carga: avisa qual foi usado.
  const tiposDaPraca = [...new Set(trechosDaCidade(trechos.filter((t) => t.tabela_preco_id === trecho.tabela_preco_id), [cidadeUsada])
    .map((t) => String(t.tipo_carga || '').trim().toUpperCase()).filter(Boolean))];
  if (tiposDaPraca.length > 1 && !semAcentoMaiusc(registro?.tipo_carga)) {
    explicacao += ` — atenção: essa praça tem ${tiposDaPraca.join(', ')}; usado ${trecho.tipo_carga || 'o 1º trecho'} (preencha o Tipo de Carga do registro para escolher o certo)`;
  }

  return {
    trecho, freteBase, explicacao, modo, componentes, taxaAplicada,
    cidadeUsada,
    origemCidade,
  };
}

// Prazo de entrega do trecho; sem prazo no trecho, o prazo padrão da tabela.
const prazoDoTrecho = (trecho) => (trecho?.prazo_dias ?? trecho?.tabela_prazo_dias ?? null);

// Calcula e grava o frete de UM registro pela tabela (o mesmo que o
// "Recalcular tudo" faz, só que pra um). Usado quando o CT-e ou a NF-e chegam,
// pra o frete já entrar calculado, com prazo e conferido — sem ninguém clicar.
// CT-e adicionais (reentrega etc.), cancelados e carga direta ficam de fora —
// menos o CT-e de OUTRA transportadora na mesma nota, que é um frete inteiro
// e confere pela tabela da transportadora dele.
async function calcularEGravar(id, origem = 'importacao') {
  const { rows } = await pool.query('SELECT * FROM fretes WHERE id = $1', [id]);
  const reg = rows[0];
  if (!reg || reg.cte_cancelado || reg.carga_direta) return null;
  if (reg.frete_principal_id && !['redespacho', 'redespacho_nota'].includes(reg.vinculo_cte)) return null;
  // Nota com redespacho tem duas pernas: a 1ª transportadora leva até a cidade
  // do redespacho; a transportadora do redespacho leva dali até o cliente.
  // Os dados do redespacho ficam no registro principal da nota.
  let nota = reg;
  if (reg.frete_principal_id) {
    const { rows: pr } = await pool.query('SELECT redespacho, cidade_redespacho, redespacho_cnpj, xml_nfe_original FROM fretes WHERE id = $1', [reg.frete_principal_id]);
    if (pr[0]) nota = { ...reg, ...pr[0] };
  }
  const pernaDoRedespacho = !!nota.redespacho || [1, 2, 3].includes(Number(reg.tp_serv_cte))
    ? require('./ctesVinculados').ehTransportadoraDoRedespacho(nota, reg.tp_serv_cte, reg.transportadora_cte || reg.transportadora, reg.transportadora_cnpj_cte)
    : false;
  if (!reg.transportadora_cte && !reg.transportadora_cnpj_cte) return { ok: false, motivo: 'O CT-e não tem a transportadora preenchida.' };
  if (['Faturado', 'Cancelado', 'Não cobrado', 'Arquivado'].includes(reg.status)) return { ok: false, motivo: `O frete está ${reg.status} — não é recalculado.` };

  const resultado = await calcularParaRegistro({
    transportadoraCte: reg.transportadora_cte, transportadoraCnpj: reg.transportadora_cnpj_cte,
    cidade: reg.cidade, bairro: reg.bairro,
    cidadeRedespacho: pernaDoRedespacho ? null : nota.cidade_redespacho, redespacho: pernaDoRedespacho ? null : nota.redespacho,
    observacoes: pernaDoRedespacho ? null : reg.observacoes, qtdVolumes: reg.qtd_volumes, pesoKg: reg.peso_kg, cubagemM3: reg.cubagem_m3,
    valorFaturado: reg.valor_faturado,
    registro: reg, xmlNfe: nota.xml_nfe_original || reg.xml_nfe_original, redespachoCnpj: nota.redespacho_cnpj,
  });
  const semAviso = (reg.observacoes || '').split('\n').filter((l) => !l.trim().startsWith('⚠️ Cálculo automático:'));
  if (resultado.erro) {
    const obs = [...semAviso, `⚠️ Cálculo automático: ${resultado.erro}`].join('\n').trim();
    if (obs !== (reg.observacoes || '').trim()) await pool.query('UPDATE fretes SET observacoes = $1 WHERE id = $2', [obs, id]);
    return { ok: false, motivo: resultado.erro };
  }
  const { trecho, freteBase, explicacao, componentes, cidadeUsada, origemCidade, taxaAplicada } = resultado;
  // Cidade do redespacho achada no texto (estava vazia ou suja): grava a certa no
  // registro — assim o campo vai ficando limpo sozinho (só no registro da nota).
  if (origemCidade === 'Cidade do Redespacho' && cidadeUsada && !reg.frete_principal_id
      && planoNome(cidadeUsada) !== planoNome(reg.cidade_redespacho || '')) {
    await pool.query('UPDATE fretes SET cidade_redespacho = $2 WHERE id = $1', [id, String(cidadeUsada).toUpperCase()]).catch(() => {});
  }
  const auditoria = JSON.stringify({
    tabela_nome: trecho.tabela_nome, transportadora_nome: trecho.transportadora_nome,
    origem: trecho.origem, destino: trecho.destino, tipo_carga: trecho.tipo_carga,
    cidade_usada: cidadeUsada, origem_cidade: origemCidade, modo_calculo: trecho.modo_calculo,
    valor_por_volume: trecho.valor_por_kg != null ? Number(trecho.valor_por_kg) : null,
    volume_minimo: trecho.volume_minimo != null ? Number(trecho.volume_minimo) : null,
    frete_minimo: trecho.frete_minimo != null ? Number(trecho.frete_minimo) : null,
    qtd_volumes_usada: reg.qtd_volumes, explicacao, valor_resultado: freteBase,
    componentes, valor_total_calculado: componentes.total,
    calculado_em: new Date().toISOString(), origem_recalculo: origem,
  });
  await pool.query(
    `UPDATE fretes SET valor_frete_tabelado = $1, valor_total_calculado = $2, tabela_preco_id_usada = $3,
            auditoria_calculo = $4, interior_capital = COALESCE($5, interior_capital), tabela_frete = $6,
            observacoes = $7, prazo_dias_tabela = $8, atualizado_em = NOW()
      WHERE id = $9`,
    [freteBase, componentes.total, trecho.tabela_preco_id, auditoria, trecho.regiao || null,
     taxaAplicada != null ? taxaAplicada.toFixed(2) : null, semAviso.join('\n').trim(), prazoDoTrecho(trecho), id]
  );
  // A reposição é conferida contra esse cálculo: atualiza os CT-e a mais da nota.
  await require('./ctesVinculados').recalcularFilhos(id).catch(() => {});
  return { ok: true };
}

module.exports = {
  calcularEGravar, prazoDoTrecho,
  buscarTrechos, buscarTodosTrechosAtivos, encontrarTrechoPorCidade, trechosDaCidade, preferirTrecho, encontrarCidadeMencionadaEmTexto, normalizarCidade, calcularFreteBase,
  calcularComponentesEValorTotal, calcularParaRegistro, extrasDoRegistro, clienteNaLista,
  ufDoTrecho, trechoNoEstado, escolherTrechoDoDestino, cidadeDeEntregaNaNota, municipiosComUf, municipiosConhecidos, bairrosConhecidos, citacaoValida, municipioNoTexto, cidadeDoRedespachoNoTexto,
};
