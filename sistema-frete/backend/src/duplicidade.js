// =====================================================================
// Regra única de duplicidade de documentos (antes cada tela tinha a sua):
// usada pela auditoria de frete (DUP_CTE / DUP_NFE) e pelo relatório
// "Anomalias e duplicidades".
//   • CT-e: mesmo número (sem zeros à esquerda) da MESMA transportadora (raiz do CNPJ;
//     sem CNPJ, o nome). Não contam: CT-e cancelado e nota coberta por CT-e de outra
//     (várias notas num CT-e: as cobertas repetem o número do CT-e de propósito).
//   • NF-e: mesmo número (sem zeros) do MESMO emitente (CNPJ da chave de acesso ou o
//     emitente_cnpj do XML). Só registros principais: CT-e a mais da mesma nota
//     (reentrega, devolução, redespacho) é esperado; CT-e cancelado também não conta.
//     Sem emitente conhecido, compara só com outras notas sem emitente.
// =====================================================================
const limpo = (expr) => `UPPER(regexp_replace(COALESCE(${expr}, ''), '[^0-9A-Za-z]', '', 'g'))`;

const chaveCte = (a) => `LTRIM(${a}.numero_cte, '0') || '|' || COALESCE(NULLIF(LEFT(${limpo(`${a}.transportadora_cnpj_cte`)}, 8), ''), UPPER(TRIM(COALESCE(${a}.transportadora_cte, ''))))`;
const contaCte = (a) => `COALESCE(${a}.numero_cte, '') <> '' AND ${a}.cte_cancelado IS NOT TRUE AND ${a}.cte_coberto_por IS NULL`;

const emitente = (a) => `COALESCE(NULLIF(SUBSTRING(${limpo(`${a}.chave_nfe`)} FROM 7 FOR 14), ''), ${limpo(`${a}.emitente_cnpj`)})`;
const chaveNf = (a) => `LTRIM(${a}.numero_nf, '0') || '|' || ${emitente(a)}`;
const contaNf = (a) => `COALESCE(${a}.numero_nf, '') <> '' AND ${a}.frete_principal_id IS NULL AND ${a}.cte_cancelado IS NOT TRUE`;

// JOINs para a consulta da auditoria (alias f): dão dup_cte.qtd e dup_nf.qtd (> 1 = duplicado).
const joinsQuantidade = (a = 'f') => `
  LEFT JOIN (SELECT ${chaveCte('d')} AS chave, COUNT(*)::int AS qtd FROM fretes d WHERE ${contaCte('d')} GROUP BY 1 HAVING COUNT(*) > 1) dup_cte
         ON ${contaCte(a)} AND dup_cte.chave = ${chaveCte(a)}
  LEFT JOIN (SELECT ${chaveNf('d')} AS chave, COUNT(*)::int AS qtd FROM fretes d WHERE ${contaNf('d')} GROUP BY 1 HAVING COUNT(*) > 1) dup_nf
         ON ${contaNf(a)} AND dup_nf.chave = ${chaveNf(a)}`;

// Lista dos grupos duplicados (relatório). Os registros vêm como pedidos e ids.
const sqlGruposCte = `SELECT MIN(f.numero_cte) AS numero, 'CT-e' AS tipo, MIN(f.transportadora_cte) AS emissor, COUNT(*)::int AS qtd,
       STRING_AGG(f.numero_pedido, ', ' ORDER BY f.id) AS pedidos, STRING_AGG(f.id::text, ',' ORDER BY f.id) AS ids
  FROM fretes f WHERE ${contaCte('f')} GROUP BY ${chaveCte('f')} HAVING COUNT(*) > 1`;
const sqlGruposNf = `SELECT MIN(f.numero_nf) AS numero, 'NF-e' AS tipo, MIN(COALESCE(f.emitente_nome, f.emitente_cnpj)) AS emissor, COUNT(*)::int AS qtd,
       STRING_AGG(f.numero_pedido, ', ' ORDER BY f.id) AS pedidos, STRING_AGG(f.id::text, ',' ORDER BY f.id) AS ids
  FROM fretes f WHERE ${contaNf('f')} GROUP BY ${chaveNf('f')} HAVING COUNT(*) > 1`;

module.exports = { chaveCte, contaCte, chaveNf, contaNf, joinsQuantidade, sqlGruposCte, sqlGruposNf };
