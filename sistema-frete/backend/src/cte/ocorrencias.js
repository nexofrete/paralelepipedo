// Acompanhamento da entrega dos CT-e emitidos (no estilo do SSW): catálogo
// de ocorrências (com o código PROCEDA, que vai no OCOREN), previsão de
// entrega em dias úteis e a situação do CT-e tirada da última ocorrência.
const pool = require('../db');

// tipo → efeito na situação: transito (em trânsito), em_rota (saiu para
// entrega), agendada (nova data), entrega (entregue), problema (ocorrência
// pendente), devolucao (devolvido ao remetente), informativo (não muda).
const CATALOGO = [
  { id: 'coletado', codigo: 0, rotulo: 'Coletado — transporte iniciado', tipo: 'transito', grupo: 'Andamento' },
  { id: 'transferencia', codigo: 99, rotulo: 'Em transferência entre filiais', tipo: 'transito', grupo: 'Andamento', texto: 'EM TRANSFERENCIA' },
  { id: 'chegada', codigo: 98, rotulo: 'Chegada na cidade / filial de destino', tipo: 'transito', grupo: 'Andamento' },
  { id: 'saiu', codigo: 99, rotulo: 'Saiu para entrega', tipo: 'em_rota', grupo: 'Andamento', texto: 'SAIU PARA ENTREGA' },
  { id: 'programada', codigo: 91, rotulo: 'Entrega agendada', tipo: 'agendada', grupo: 'Andamento', pedePrevisao: true },
  { id: 'redespacho', codigo: 52, rotulo: 'Entregue ao redespacho', tipo: 'transito', grupo: 'Andamento' },
  { id: 'entregue', codigo: 1, rotulo: 'Entregue', tipo: 'entrega', grupo: 'Entrega', pedeRecebedor: true },
  { id: 'entregue_fora', codigo: 2, rotulo: 'Entregue fora da data programada', tipo: 'entrega', grupo: 'Entrega', pedeRecebedor: true },
  { id: 'reentregue', codigo: 24, rotulo: 'Reentregue ao cliente', tipo: 'entrega', grupo: 'Entrega', pedeRecebedor: true },
  { id: 'retirou', codigo: 29, rotulo: 'Cliente retirou na transportadora', tipo: 'entrega', grupo: 'Entrega', pedeRecebedor: true },
  { id: 'fechado', codigo: 21, rotulo: 'Estabelecimento fechado', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'ausente', codigo: 46, rotulo: 'Responsável pelo recebimento ausente', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'endereco', codigo: 6, rotulo: 'Endereço não localizado', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'mudou', codigo: 77, rotulo: 'Cliente mudou de endereço', tipo: 'problema', grupo: 'Não entregue' },
  { id: 'horario', codigo: 20, rotulo: 'Entrega prejudicada por horário', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'reentrega_cliente', codigo: 19, rotulo: 'Reentrega solicitada pelo cliente', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'balanco', codigo: 34, rotulo: 'Cliente fechado para balanço', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'feriado', codigo: 43, rotulo: 'Feriado local / nacional', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'veiculo', codigo: 58, rotulo: 'Quebra do veículo de entrega', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'interditada', codigo: 76, rotulo: 'Estrada / acesso interditado', tipo: 'problema', grupo: 'Não entregue', pedePrevisao: true },
  { id: 'sem_pedido', codigo: 3, rotulo: 'Recusa: falta de pedido de compra', tipo: 'problema', grupo: 'Recusa' },
  { id: 'desacordo', codigo: 9, rotulo: 'Recusa: mercadoria em desacordo com o pedido', tipo: 'problema', grupo: 'Recusa' },
  { id: 'embalagem', codigo: 11, rotulo: 'Recusa: embalagem danificada', tipo: 'problema', grupo: 'Recusa' },
  { id: 'negociacao', codigo: 88, rotulo: 'Recusado, aguardando negociação', tipo: 'problema', grupo: 'Recusa' },
  { id: 'avaria_parcial', codigo: 79, rotulo: 'Avaria parcial', tipo: 'problema', grupo: 'Sinistro' },
  { id: 'avaria_total', codigo: 78, rotulo: 'Avaria total', tipo: 'problema', grupo: 'Sinistro' },
  { id: 'extravio_parcial', codigo: 81, rotulo: 'Extravio parcial', tipo: 'problema', grupo: 'Sinistro' },
  { id: 'extravio_total', codigo: 80, rotulo: 'Extravio total', tipo: 'problema', grupo: 'Sinistro' },
  { id: 'roubo', codigo: 27, rotulo: 'Roubo de carga', tipo: 'problema', grupo: 'Sinistro' },
  { id: 'fiscalizacao', codigo: 26, rotulo: 'Nota retida pela fiscalização', tipo: 'problema', grupo: 'Sinistro' },
  { id: 'devolvido', codigo: 25, rotulo: 'Devolvido ao remetente', tipo: 'devolucao', grupo: 'Devolução', pedeRecebedor: true },
  { id: 'outros', codigo: 99, rotulo: 'Outra ocorrência (descreva na observação)', tipo: 'informativo', grupo: 'Outros', pedeObservacao: true },
];
const PORID = new Map(CATALOGO.map((c) => [c.id, c]));

const SITUACOES = {
  pendente: 'Emitido', em_transito: 'Em trânsito', em_rota: 'Saiu para entrega', agendada: 'Agendado',
  ocorrencia: 'Com ocorrência', entregue: 'Entregue', devolvido: 'Devolvido',
};
const SITUACAO_DO_TIPO = { transito: 'em_transito', em_rota: 'em_rota', agendada: 'agendada', entrega: 'entregue', problema: 'ocorrencia', devolucao: 'devolvido' };

// "AAAA-MM-DD" + n dias úteis (sem sábado e domingo).
function somarDiasUteis(dataIso, dias) {
  const d = new Date(`${String(dataIso).slice(0, 10)}T12:00:00Z`);
  let falta = Math.max(0, Number(dias) || 0);
  while (falta > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) falta -= 1;
  }
  return d.toISOString().slice(0, 10);
}
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

// Prazo do CT-e: a tabela de preço da própria empresa para a cidade de destino;
// sem tabela, o prazo padrão da Configuração fiscal (ou 3 dias úteis).
async function prazoDoCte(reg, empresa) {
  const d = reg.dados || {};
  try {
    const r = await require('../calculoFrete').calcularParaRegistro({
      transportadoraCte: empresa.razao_social, transportadoraCnpj: empresa.cnpj, cidade: d.fim?.xMun, bairro: d.destinatario?.endereco?.xBairro,
      qtdVolumes: 1, pesoKg: 1, valorFaturado: 0, registro: { uf: d.fim?.UF }, xmlNfe: null,
    });
    const p = r?.trecho?.prazo_dias ?? r?.trecho?.tabela_prazo_dias;
    if (p != null && Number(p) >= 0) return { dias: Number(p), origem: 'tabela' };
  } catch { /* sem tabela: usa o padrão */ }
  return { dias: Number(empresa.cte_prazo_padrao) || 3, origem: 'padrao' };
}

// Grava a previsão de entrega de um CT-e autorizado (se ainda não tem).
async function definirPrevisao(cteId) {
  const { rows } = await pool.query('SELECT id, dados, autorizado_em, previsao_entrega FROM ctes_emitidos WHERE id = $1', [cteId]);
  const reg = rows[0];
  if (!reg || reg.previsao_entrega || !reg.autorizado_em) return null;
  const { rows: emp } = await pool.query('SELECT razao_social, cnpj, cte_prazo_padrao FROM empresa WHERE id = 1');
  const prazo = await prazoDoCte(reg, emp[0] || {});
  const base = new Date(new Date(reg.autorizado_em).getTime() - 3 * 3600000).toISOString().slice(0, 10);
  const previsao = somarDiasUteis(base, prazo.dias);
  await pool.query('UPDATE ctes_emitidos SET prazo_dias = $2, previsao_original = $3, previsao_entrega = $3 WHERE id = $1 AND previsao_entrega IS NULL',
    [cteId, prazo.dias, previsao]);
  return previsao;
}

// Refaz situação, data de entrega, recebedor e previsão a partir das ocorrências.
async function recalcularSituacao(cteId, cliente = pool) {
  const { rows: ocs } = await cliente.query('SELECT * FROM cte_ocorrencias WHERE cte_id = $1 ORDER BY data_hora, id', [cteId]);
  let situacao = 'pendente'; let entrega = null; let previsao = null;
  ocs.forEach((o) => {
    if (SITUACAO_DO_TIPO[o.tipo]) situacao = SITUACAO_DO_TIPO[o.tipo];
    if (o.tipo === 'entrega') entrega = o;
    else if (o.tipo !== 'informativo') entrega = null;   // houve algo depois da entrega (ex.: devolução)
    if (o.nova_previsao) previsao = o.nova_previsao;
  });
  await cliente.query(
    `UPDATE ctes_emitidos SET situacao_entrega = $2, data_entrega = $3, recebedor_nome = $4, recebedor_documento = $5,
            previsao_entrega = COALESCE($6::date, previsao_original, previsao_entrega), atualizado_em = NOW() WHERE id = $1`,
    [cteId, situacao, entrega?.data_hora || null, entrega?.recebedor_nome || null, entrega?.recebedor_documento || null, previsao]);
  return situacao;
}

module.exports = { CATALOGO, PORID, SITUACOES, somarDiasUteis, hojeBrasilia, definirPrevisao, recalcularSituacao, prazoDoCte };
