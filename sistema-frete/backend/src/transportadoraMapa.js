// Transportadora do mapa de carregamento (coluna TRANSPORTADORA_MAPA da planilha Timeline de pedidos):
// é quem de fato coletou a mercadoria na empresa. Vale mais que a transportadora da nota fiscal:
//  - vira a transportadora da nota (a da NF-e continua guardada em transportadora_nfe);
//  - dá a previsão de entrega antes de o CT-e chegar (prazo da tabela dela + Data da Coleta do mapa);
//  - é comparada com a transportadora do CT-e (inconsistência "MAPA" e relatório 106).
const pool = require('./db');

const dig = (v) => String(v ?? '').replace(/\D/g, '');
const texto = (v) => { const t = String(v ?? '').trim(); return t || null; };

// "ANDRADE E ABREU TRAS LTDA CNPJ:09.318.444/0002-25" → { nome: 'ANDRADE E ABREU TRAS LTDA', cnpj: '09318444000225' }
function separar(valor) {
  const t = texto(valor);
  if (!t) return { nome: null, cnpj: null };
  const m = t.match(/C\.?\s*N\.?\s*P\.?\s*J\.?\s*[:\-]?\s*([\d./\-\s]{14,20})/i);
  const cnpj = m && dig(m[1]).length === 14 ? dig(m[1]) : null;
  const nome = texto((m ? t.slice(0, m.index) : t).replace(/[\s\-–:;,./]+$/, ''));
  return { nome, cnpj };
}

const temCnpj = (v) => !!separar(v).cnpj;
const pareceData = (v) => /^\s*DATA\s*:/i.test(String(v ?? ''));

// Colunas do mapa de uma linha da planilha. Na exportação atual do ERP as colunas do fim vêm
// deslocadas uma casa (a transportadora em DS_MAPA_CARREGAMENTO, o ajudante em TRANSPORTADORA_MAPA
// e a data de saída em AJUDANTE_1_MAPA): reconhecido pelo conteúdo, para não gravar trocado.
function lerMapaDaLinha(l) {
  const ds = texto(l.DS_MAPA_CARREGAMENTO);
  const tr = texto(l.TRANSPORTADORA_MAPA);
  const aj = texto(l.AJUDANTE_1_MAPA);
  const deslocado = pareceData(aj) && !temCnpj(tr) && temCnpj(ds);
  const transportadora = deslocado ? ds : tr;
  const ajudante = deslocado ? tr : (pareceData(aj) ? null : aj);
  const { nome, cnpj } = separar(transportadora);
  return { mapa_descricao: ds, mapa_ajudante: ajudante, mapa_transportadora: nome, mapa_transportadora_cnpj: cnpj, deslocado };
}

// Núcleo do nome para comparar ("TRANSPORTES ANDRADE E ABREU LTDA" × "ANDRADE E ABREU TRAS LTDA").
const SOBRA = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S', 'A', 'E', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'CIA', 'COMERCIO',
  'TRANSPORTES', 'TRANSPORTE', 'TRANSPORTADORA', 'TRANSP', 'TRANS', 'TRAS', 'TRANSPS', 'LOGISTICA', 'LOG', 'CARGAS', 'RODOVIARIO', 'RODOVIARIOS', 'EXPRESS', 'EXPRESSO']);
function nucleo(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/).filter((p) => p && !SOBRA.has(p)).join(' ');
}
// Mesma transportadora? Pela raiz do CNPJ quando os dois têm; senão pelo núcleo do nome
// (um contém o outro). Sem um dos lados, não dá para dizer que é outra: null.
function mesma(a, b) {
  const ca = dig(a?.cnpj); const cb = dig(b?.cnpj);
  if (ca.length === 14 && cb.length === 14) return ca.slice(0, 8) === cb.slice(0, 8);
  const na = nucleo(a?.nome); const nb = nucleo(b?.nome);
  if (!na || !nb) return null;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Situação da nota pela transportadora da NF-e, do mapa e do CT-e.
function situacao({ nf, mapa, cte }) {
  const temMapa = !!(mapa?.nome || mapa?.cnpj);
  const temCte = !!(cte?.nome || cte?.cnpj);
  if (!temMapa) return temCte ? 'Sem transportadora no mapa' : 'Sem mapa';
  const nfOutra = mesma(nf, mapa) === false;
  if (temCte) {
    if (mesma(mapa, cte) === false) return 'CT-e de outra transportadora';
    return nfOutra ? 'Saiu por outra; CT-e confere' : 'Confere';
  }
  return nfOutra ? 'Saiu por outra; aguardando CT-e' : 'Aguardando CT-e';
}

// Nome do cadastro de transportadoras pelo CNPJ (o mapa abrevia: "TRAS LTDA").
async function nomeDoCadastro(cnpj, cliente = pool) {
  const c = dig(cnpj);
  if (c.length !== 14) return null;
  const { rows } = await cliente.query(
    `SELECT razao_social FROM transportadoras
      WHERE REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = $1 OR COALESCE(cnpj_alternativos, '') LIKE '%' || $1 || '%'
         OR LEFT(REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g'), 8) = LEFT($1, 8)
      ORDER BY (REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = $1) DESC, id LIMIT 1`, [c]);
  return rows[0]?.razao_social || null;
}

// Prazo da tabela da transportadora do mapa: com a Data da Coleta, o trigger calcula a Data
// Prevista de Entrega. Vale antes do CT-e e também quando o CT-e é de outra transportadora (o
// frete é conferido pelo CT-e, mas quem leva a mercadoria é quem coletou). CT-e da mesma
// transportadora do mapa: fica o prazo do cálculo do CT-e.
async function prazoPeloMapa(freteId) {
  const { rows: [f] } = await pool.query('SELECT * FROM fretes WHERE id = $1', [freteId]);
  if (!f || f.frete_principal_id || !(f.mapa_transportadora || f.mapa_transportadora_cnpj)) return null;
  const doMapa = { nome: f.mapa_transportadora, cnpj: f.mapa_transportadora_cnpj };
  if (f.chave_cte && mesma(doMapa, { nome: f.transportadora_cte, cnpj: f.transportadora_cnpj_cte }) !== false) return null;
  const calc = require('./calculoFrete');
  let r;
  try {
    r = await calc.calcularParaRegistro({
      transportadoraCte: f.mapa_transportadora, transportadoraCnpj: f.mapa_transportadora_cnpj,
      cidade: f.cidade, bairro: f.bairro, cidadeRedespacho: f.cidade_redespacho, redespacho: f.redespacho, observacoes: f.observacoes,
      qtdVolumes: f.qtd_volumes, pesoKg: f.peso_kg, cubagemM3: f.cubagem_m3, valorFaturado: f.valor_faturado,
      registro: f, xmlNfe: f.xml_nfe_original, redespachoCnpj: f.redespacho_cnpj,
    });
  } catch (e) { return null; }
  const prazo = r && !r.erro ? calc.prazoDoTrecho(r.trecho) : null;
  if (prazo == null) return null;
  await pool.query('UPDATE fretes SET prazo_dias_tabela = $1 WHERE id = $2 AND prazo_dias_tabela IS DISTINCT FROM $1', [prazo, freteId]);
  return prazo;
}

// Grava a transportadora do mapa na nota e passa a usá-la. Devolve true se algo mudou.
async function aplicar(freteId, { nome, cnpj }) {
  if (!nome && !cnpj) return false;
  const { rows: [f] } = await pool.query('SELECT transportadora FROM fretes WHERE id = $1', [freteId]);
  if (!f) return false;
  // Mesma empresa com outro jeito de escrever: fica o nome que já estava. Outra: a do mapa
  // (o nome do cadastro, pelo CNPJ; o mapa abrevia).
  let usar = null;
  if (mesma({ nome: f.transportadora }, { nome, cnpj }) !== true) usar = (await nomeDoCadastro(cnpj)) || nome;
  if (usar && mesma({ nome: f.transportadora }, { nome: usar }) === true) usar = null;
  const { rowCount } = await pool.query(
    `UPDATE fretes SET mapa_transportadora = $1, mapa_transportadora_cnpj = $2,
            transportadora_nfe = COALESCE(transportadora_nfe, transportadora),
            transportadora = COALESCE($3, transportadora), atualizado_em = NOW()
      WHERE id = $4 AND (mapa_transportadora IS DISTINCT FROM $1 OR mapa_transportadora_cnpj IS DISTINCT FROM $2
                         OR transportadora IS DISTINCT FROM COALESCE($3, transportadora))`,
    [nome, cnpj, usar, freteId]);
  return rowCount > 0;
}

module.exports = { separar, lerMapaDaLinha, nucleo, mesma, situacao, nomeDoCadastro, prazoPeloMapa, aplicar };
