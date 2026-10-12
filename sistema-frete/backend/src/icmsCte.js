// Conferência da alíquota de ICMS do CT-e (transporte entre estados):
// 7% quando sai do Sul/Sudeste (menos ES) para Norte, Nordeste, Centro-Oeste
// ou ES; 12% nos demais casos. Dentro do mesmo estado não é conferida.
//
// A rota vem do UFIni/UFFim do CT-e, com uma exceção: no redespacho a 1ª
// transportadora só leva até a cidade do redespacho, e é esse trecho que ela
// tributa. Muitas preenchem o UFFim com o destino final da nota (ex.: RJ→GO)
// mas cobram a alíquota do trecho que fizeram (RJ→SP, 12%) — e estão certas.
// O fim do trecho sai do recebedor do CT-e ou da cidade do redespacho da nota.
const { ehTransportadoraDoRedespacho } = require('./ctesVinculados');
const { ufsDaCidade } = require('./roteirizacao/municipios');

const UF_SUL_SUDESTE = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'];
const UF_N_NE_CO_ES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'PA', 'PB', 'PE', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO'];
const uf = (v) => String(v ?? '').trim().toUpperCase();

function aliquotaInterestadual(ini, fim) {
  if (!ini || !fim || ini === fim) return null;
  return UF_SUL_SUDESTE.includes(ini) && UF_N_NE_CO_ES.includes(fim) ? 7 : 12;
}

// Campos que a conferência precisa, para pôr no SELECT (alias = tabela fretes).
// O recebedor é lido direto do XML guardado, sem trazer o XML inteiro.
const camposSql = (a) => `
  ${a}.uf_inicio_cte, ${a}.uf_fim_cte, ${a}.impostos_cte, ${a}.tp_serv_cte, ${a}.transportadora_cte, ${a}.transportadora_cnpj_cte,
  SUBSTRING(${a}.xml_cte_original FROM '<receb>.*?<UF>([A-Z]{2})</UF>') AS icms_uf_recebedor,
  (SELECT row_to_json(n) FROM (SELECT pr.redespacho, pr.cidade_redespacho, pr.redespacho_cnpj,
      (SELECT t.uf FROM transportadoras t WHERE pr.redespacho_cnpj IS NOT NULL
          AND LEFT(REGEXP_REPLACE(t.cnpj, '\\D', '', 'g'), 8) = LEFT(REGEXP_REPLACE(pr.redespacho_cnpj, '\\D', '', 'g'), 8) LIMIT 1) AS uf_transp_redespacho
     FROM fretes pr WHERE pr.id = COALESCE(${a}.frete_principal_id, ${a}.id)) n) AS icms_nota`;

// Onde termina o trecho que ESTA transportadora fez. Devolve { uf, motivo } ou null (= UFFim do CT-e).
function fimDoTrecho(r) {
  const fimCte = uf(r.uf_fim_cte);
  const nota = r.icms_nota || {};
  const temRedespacho = !!(nota.redespacho || nota.cidade_redespacho || nota.redespacho_cnpj);
  const primeiraPerna = temRedespacho
    && !ehTransportadoraDoRedespacho(nota, r.tp_serv_cte, r.transportadora_cte || r.transportadora, r.transportadora_cnpj_cte);
  const receb = uf(r.icms_uf_recebedor);
  if (primeiraPerna) {
    const cidade = nota.cidade_redespacho ? String(nota.cidade_redespacho).trim() : '';
    let ufCidade = null;
    if (cidade) {
      const ufs = ufsDaCidade(cidade);
      // Nome que existe em mais de um estado: desempata pelo recebedor ou pela UF da transportadora do redespacho.
      ufCidade = ufs.length === 1 ? ufs[0] : ufs.find((u) => u === receb || u === uf(nota.uf_transp_redespacho)) || null;
    }
    const fim = receb || ufCidade;
    if (fim && fim !== fimCte) {
      return { uf: fim, motivo: `trecho até o redespacho${cidade ? ` em ${cidade}/${fim}` : ''}${nota.redespacho ? ` (${nota.redespacho})` : ''} — o CT-e diz ${uf(r.uf_inicio_cte)}→${fimCte}, destino final da nota` };
    }
    return null;
  }
  // Sem redespacho: se o CT-e tem recebedor em outro estado, o serviço termina nele.
  if (receb && fimCte && receb !== fimCte) {
    return { uf: receb, motivo: `entrega ao recebedor do CT-e em ${receb} — o CT-e diz ${uf(r.uf_inicio_cte)}→${fimCte}` };
  }
  return null;
}

// null quando não se aplica (mesmo estado, isento, Simples...).
function conferirIcms(r) {
  let imp = r.impostos_cte;
  if (typeof imp === 'string') { try { imp = JSON.parse(imp || '{}'); } catch { return null; } }
  imp = imp || {};
  const cst = String(imp.cst ?? '').padStart(2, '0');
  if (!['00', '20'].includes(cst) || imp.pICMS == null) return null;
  const ini = uf(r.uf_inicio_cte);
  const fimCte = uf(r.uf_fim_cte);
  const trecho = fimDoTrecho(r);
  const fim = trecho ? trecho.uf : fimCte;
  if (!ini || !fim || ini === fim) {
    // Trecho dentro do estado (ex.: RJ→RJ até o redespacho): a alíquota é a interna, não se confere.
    return trecho ? { ini, fim, fimCte, esperada: null, cobrada: Number(imp.pICMS), divergente: false, motivo: trecho.motivo } : null;
  }
  // A alíquota gravada na importação (aliquotaEsperadaPelaRota) é do UFIni→UFFim; só vale sem ajuste do trecho.
  const esperada = !trecho && imp.aliquotaEsperadaPelaRota != null ? Number(imp.aliquotaEsperadaPelaRota) : aliquotaInterestadual(ini, fim);
  const cobrada = Number(imp.pICMS);
  return { ini, fim, fimCte, esperada, cobrada, divergente: Math.abs(cobrada - esperada) > 0.01, motivo: trecho?.motivo || null };
}

module.exports = { aliquotaInterestadual, fimDoTrecho, conferirIcms, camposSql, UF_SUL_SUDESTE, UF_N_NE_CO_ES };
