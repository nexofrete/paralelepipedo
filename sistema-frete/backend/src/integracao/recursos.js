// Formato público (API v1 e webhooks) do CT-e e da fatura: o que o ERP recebe.
// Campos estáveis e em português; datas em AAAA-MM-DD (dia em Brasília) e
// momentos em ISO 8601 com fuso.
const pool = require('../db');

const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dia = (v) => (v == null ? null : v instanceof Date ? new Date(v.getTime() - 3 * 3600000).toISOString().slice(0, 10) : String(v).slice(0, 10));
const momento = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

// As datas do CT-e são TIMESTAMP sem fuso, gravadas no horário de Brasília: converte
// no banco (vira um instante certo) e tira o dia local de lá, sem depender do fuso do servidor.
const COLUNAS_CTE = `c.id, c.chave, c.serie, c.numero, c.status, c.ambiente, c.demonstracao, c.valor_total, c.dados, c.tomador_nome,
  c.remetente_nome, c.destinatario_nome, c.cidade_fim, c.uf_fim, c.previsao_entrega::text AS previsao_entrega, c.situacao_entrega,
  (c.autorizado_em AT TIME ZONE 'America/Sao_Paulo') AS autorizado_em, c.autorizado_em::date::text AS data_emissao,
  (c.data_entrega AT TIME ZONE 'America/Sao_Paulo') AS data_entrega, c.data_entrega::date::text AS dia_entrega, c.recebedor_nome, c.recebedor_documento, c.fatura_id,
  c.substituido_por, (c.atualizado_em AT TIME ZONE 'America/Sao_Paulo') AS atualizado_em`;

function cte(c) {
  const { tomadorDe, valorCte } = require('../faturamento/faturamento');
  const d = c.dados || {};
  const t = tomadorDe(d);
  const pessoa = (p) => (p ? { documento: String(p.cnpj || p.cpf || '').replace(/\D/g, '') || null, nome: p.xNome || null } : null);
  return {
    id: c.id,
    chave: c.chave || null,
    serie: c.serie ?? null,
    numero: c.numero ?? null,
    status: c.status,                                   // rascunho, autorizado, cancelado, substituido, rejeitado...
    tipo: { 0: 'normal', 1: 'complementar', 2: 'anulacao', 3: 'substituto' }[String(d.tpCTe ?? '0')] || 'normal',
    ambiente: Number(c.ambiente) === 1 ? 'producao' : 'homologacao',
    demonstracao: !!c.demonstracao,
    autorizado_em: momento(c.autorizado_em),
    data_emissao: c.data_emissao || null,
    valor: centavos(d.valores?.vTPrest ?? c.valor_total),     // valor total da prestação
    valor_a_receber: valorCte(c),                              // o que vai para a fatura
    cfop: d.cfop || null,
    tomador: { documento: t.doc || null, nome: t.nome || c.tomador_nome || null },
    remetente: pessoa(d.remetente) || { documento: null, nome: c.remetente_nome || null },
    destinatario: pessoa(d.destinatario) || { documento: null, nome: c.destinatario_nome || null },
    destino: { cidade: c.cidade_fim || null, uf: c.uf_fim || null },
    nfes: (Array.isArray(d.nfes) ? d.nfes : []).map((x) => String(typeof x === 'string' ? x : x?.chave || '')).filter((x) => x.length === 44),
    entrega: {
      situacao: c.situacao_entrega || null,
      previsao: c.previsao_entrega || null,
      data: c.dia_entrega || null,
      momento: momento(c.data_entrega),
      recebedor: c.recebedor_nome ? { nome: c.recebedor_nome, documento: c.recebedor_documento || null } : null,
    },
    fatura_id: c.fatura_id || null,
    substituido_por_id: c.substituido_por || null,
    atualizado_em: momento(c.atualizado_em),
  };
}

async function ctePorId(id) {
  const { rows: [c] } = await pool.query(`SELECT ${COLUNAS_CTE} FROM ctes_emitidos c WHERE c.id = $1`, [id]);
  return c ? cte(c) : null;
}

const COLUNAS_FATURA = `f.id, f.numero, f.tomador_doc, f.tomador_nome, f.emissao::text AS emissao, f.vencimento::text AS vencimento, f.valor_bruto::float AS valor_bruto,
  f.desconto::float AS desconto, f.valor_pago::float AS valor_pago, f.status, f.demonstracao, f.boleto_linha, f.boleto_status, f.boleto_valor::float AS boleto_valor,
  f.cancelada_em, f.motivo_cancelamento, f.criado_em, f.atualizado_em`;

async function faturasCompletas(linhas) {
  if (!linhas.length) return [];
  const ids = linhas.map((f) => f.id);
  const { rows: docs } = await pool.query(
    `SELECT fatura_id, 'cte' AS tipo, id, chave, numero, serie FROM ctes_emitidos WHERE fatura_id = ANY($1::int[])
     UNION ALL SELECT fatura_id, 'nfse', id, chave, NULL, NULL FROM nfse_emitidas WHERE fatura_id = ANY($1::int[])`, [ids]);
  const { rows: pags } = await pool.query(
    'SELECT fatura_id, id, data::text AS data, valor::float AS valor, forma FROM faturas_transporte_pagamentos WHERE fatura_id = ANY($1::int[]) ORDER BY data, id', [ids]);
  return linhas.map((f) => {
    const liquido = centavos(f.valor_bruto - f.desconto);
    return {
      id: f.id,
      numero: f.numero,
      status: f.status,                                 // aberta, parcial, paga, cancelada
      demonstracao: !!f.demonstracao,
      tomador: { documento: f.tomador_doc, nome: f.tomador_nome },
      emissao: f.emissao,
      vencimento: f.vencimento,
      valor_bruto: centavos(f.valor_bruto),
      desconto: centavos(f.desconto),
      valor_liquido: liquido,
      valor_pago: centavos(f.valor_pago),
      saldo: f.status === 'cancelada' ? 0 : Math.max(0, centavos(liquido - f.valor_pago)),
      boleto: f.boleto_linha && ['gerado', 'remetido', 'registrado'].includes(f.boleto_status) ? { linha_digitavel: f.boleto_linha, valor: f.boleto_valor } : null,
      documentos: docs.filter((x) => x.fatura_id === f.id).map((x) => ({ tipo: x.tipo, id: x.id, chave: x.chave || null, numero: x.numero ?? null, serie: x.serie ?? null })),
      pagamentos: pags.filter((p) => p.fatura_id === f.id).map((p) => ({ id: p.id, data: p.data, valor: centavos(p.valor), forma: p.forma })),
      cancelada_em: momento(f.cancelada_em),
      motivo_cancelamento: f.motivo_cancelamento || null,
      atualizado_em: momento(f.atualizado_em),
    };
  });
}

async function faturaPorId(id) {
  const { rows } = await pool.query(`SELECT ${COLUNAS_FATURA} FROM faturas_transporte f WHERE f.id = $1`, [id]);
  return (await faturasCompletas(rows))[0] || null;
}

module.exports = { COLUNAS_CTE, COLUNAS_FATURA, cte, ctePorId, faturasCompletas, faturaPorId, dia };
