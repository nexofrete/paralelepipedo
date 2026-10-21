// Agendamento de entrega com o destinatário (estilo SSW): data, janela de
// horário, senha/protocolo e doca. O cliente marcado "exige agendamento" no
// cadastro faz o CT-e aparecer em "A agendar" até ter um agendamento.
// Agendar lança a ocorrência "Entrega agendada" (PROCEDA 91), que muda a
// previsão de entrega; reagendar substitui o anterior; cancelar apaga a
// ocorrência e a previsão volta a ser a de antes.
const pool = require('../db');
const oc = require('./ocorrencias');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
const hora = (v) => {
  const s = String(v || '').trim();
  if (!s) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(:\d{2})?$/.exec(s);
  if (!m) throw falha(`Horário inválido: "${s}". Use HH:MM.`);
  return `${m[1]}:${m[2]}`;
};

// Documento de quem recebe (o recebedor, se houver, e o destinatário) nos dados do CT-e.
const DOCS = (a) => `COALESCE(${a}.dados->'destinatario'->>'cnpj', ${a}.dados->'destinatario'->>'cpf'), COALESCE(${a}.dados->'recebedor'->>'cnpj', ${a}.dados->'recebedor'->>'cpf')`;
const SQL_EXIGE = (a = 'c') => `EXISTS (SELECT 1 FROM clientes cl WHERE cl.exige_agendamento AND cl.documento IN (${DOCS(a)}))`;
const SQL_ATIVO = (a = 'c') => `EXISTS (SELECT 1 FROM cte_agendamentos ag WHERE ag.cte_id = ${a}.id AND ag.status = 'ativo')`;
const CAMPOS_JSON = `json_build_object('id', ag.id, 'data', TO_CHAR(ag.data, 'YYYY-MM-DD'), 'hora_de', TO_CHAR(ag.hora_de, 'HH24:MI'), 'hora_ate', TO_CHAR(ag.hora_ate, 'HH24:MI'),
  'senha', ag.senha, 'doca', ag.doca, 'contato', ag.contato, 'observacao', ag.observacao)`;
// Subconsulta com o agendamento ativo do CT-e (json ou null).
const SQL_JSON = (a = 'c') => `(SELECT ${CAMPOS_JSON} FROM cte_agendamentos ag WHERE ag.cte_id = ${a}.id AND ag.status = 'ativo')`;

const diaBr = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
// "08:00 às 12:00", "a partir das 08:00", "até as 12:00" ou "".
function janela(a) {
  if (!a) return '';
  if (a.hora_de && a.hora_ate) return `${a.hora_de} às ${a.hora_ate}`;
  if (a.hora_de) return `a partir das ${a.hora_de}`;
  if (a.hora_ate) return `até as ${a.hora_ate}`;
  return '';
}
// Uma linha para tela, romaneio e app do motorista. comSenha: false no que vai para fora (portal, aviso).
function resumo(a, { comSenha = true } = {}) {
  if (!a) return '';
  return [`${diaBr(a.data)}${janela(a) ? `, ${janela(a)}` : ''}`, comSenha && a.senha ? `senha ${a.senha}` : '', comSenha && a.doca ? `doca ${a.doca}` : ''].filter(Boolean).join(' · ');
}

async function exigeDoCte(cteId, cliente = pool) {
  const { rows } = await cliente.query(
    `SELECT cl.razao_social, cl.agendamento_instrucoes FROM ctes_emitidos c JOIN clientes cl ON cl.exige_agendamento AND cl.documento IN (${DOCS('c')})
      WHERE c.id = $1 LIMIT 1`, [cteId]);
  return rows[0] ? { exige: true, cliente: rows[0].razao_social, instrucoes: rows[0].agendamento_instrucoes } : { exige: false };
}

async function doCte(cteId, cliente = pool) {
  const { rows } = await cliente.query(
    `SELECT ag.id, TO_CHAR(ag.data, 'YYYY-MM-DD') AS data, TO_CHAR(ag.hora_de, 'HH24:MI') AS hora_de, TO_CHAR(ag.hora_ate, 'HH24:MI') AS hora_ate,
            ag.senha, ag.doca, ag.contato, ag.observacao, ag.status, ag.motivo_cancelamento, ag.usuario_nome, ag.criado_em
       FROM cte_agendamentos ag WHERE ag.cte_id = $1 ORDER BY ag.criado_em DESC, ag.id DESC`, [cteId]);
  return rows;
}

// corpo: { data "AAAA-MM-DD", hora_de, hora_ate "HH:MM", senha, doca, contato, observacao }
async function agendar(cliente, { cteId, corpo = {}, usuarioNome }) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(corpo.data || '')) ? corpo.data : null;
  if (!data) throw falha('Informe a data agendada para a entrega.');
  if (data < oc.hojeBrasilia()) throw falha('A data agendada já passou.');
  const de = hora(corpo.hora_de); const ate = hora(corpo.hora_ate);
  if (de && ate && de >= ate) throw falha('O horário final da janela tem de ser depois do inicial.');
  const { rows } = await cliente.query('SELECT id, numero, status, situacao_entrega FROM ctes_emitidos WHERE id = $1 FOR UPDATE', [cteId]);
  const cte = rows[0];
  if (!cte) throw falha('CT-e não encontrado.', 404);
  if (cte.status !== 'autorizado') throw falha(`O CT-e ${cte.numero || ''} não está autorizado.`);
  if (['entregue', 'devolvido'].includes(cte.situacao_entrega)) throw falha(`O CT-e ${cte.numero} já foi ${cte.situacao_entrega === 'entregue' ? 'entregue' : 'devolvido'}.`);
  const a = { data, hora_de: de, hora_ate: ate, senha: texto(corpo.senha, 60), doca: texto(corpo.doca, 40), contato: texto(corpo.contato, 120), observacao: texto(corpo.observacao, 500) };
  const { rowCount: anterior } = await cliente.query(`UPDATE cte_agendamentos SET status = 'substituido' WHERE cte_id = $1 AND status = 'ativo'`, [cteId]);
  // A ocorrência leva a data e a janela; a senha e a doca ficam só no agendamento (a ocorrência vai para o cliente e o OCOREN).
  const obs = [`${anterior ? 'Reagendado' : 'Agendado'} para ${diaBr(data)}/${data.slice(0, 4)}${janela(a) ? `, ${janela(a)}` : ''}`, a.contato ? `com ${a.contato}` : ''].filter(Boolean).join(' ');
  const lancada = await oc.lancarOcorrencia(cliente, {
    cteId, usuarioNome, corpo: { tipo_id: 'programada', data_hora: oc.agoraBrasilia(), nova_previsao: data, observacao: obs },
  });
  const { rows: novo } = await cliente.query(
    `INSERT INTO cte_agendamentos (cte_id, data, hora_de, hora_ate, senha, doca, contato, observacao, ocorrencia_id, usuario_nome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [cteId, data, de, ate, a.senha, a.doca, a.contato, a.observacao, lancada.id, usuarioNome]);
  return { id: novo[0].id, numero: cte.numero, reagendamento: !!anterior, lancada, resumo: resumo(a) };
}

// Cancela o agendamento ativo: apaga as ocorrências "Entrega agendada" (dele e dos que ele
// substituiu) e refaz a previsão. O histórico dos agendamentos continua na tabela.
async function cancelar(cliente, { id, motivo }) {
  const m = texto(motivo, 200);
  if (!m) throw falha('Diga o motivo do cancelamento.');
  const { rows } = await cliente.query(
    `UPDATE cte_agendamentos ag SET status = 'cancelado', motivo_cancelamento = $2 FROM ctes_emitidos c
      WHERE ag.id = $1 AND ag.status = 'ativo' AND c.id = ag.cte_id RETURNING ag.cte_id, ag.ocorrencia_id, c.numero, c.situacao_entrega`, [id, m]);
  if (!rows[0]) throw falha('Agendamento não encontrado ou já cancelado.', 404);
  if (['entregue', 'devolvido'].includes(rows[0].situacao_entrega)) throw falha('A entrega já foi baixada: o agendamento fica no histórico.');
  // Sai também a ocorrência dos agendamentos que este substituiu: senão a previsão voltaria para uma data já desmarcada.
  await cliente.query(`DELETE FROM cte_ocorrencias WHERE id IN (SELECT ocorrencia_id FROM cte_agendamentos WHERE cte_id = $1 AND status IN ('cancelado', 'substituido') AND ocorrencia_id IS NOT NULL)`, [rows[0].cte_id]);
  await oc.recalcularSituacao(rows[0].cte_id, cliente);
  return { cteId: rows[0].cte_id, numero: rows[0].numero };
}

// Apagaram à mão a ocorrência de um agendamento: ele deixa de valer.
async function aoApagarOcorrencia(cliente, ocorrenciaId) {
  await cliente.query(`UPDATE cte_agendamentos SET status = 'cancelado', motivo_cancelamento = 'Ocorrência apagada' WHERE ocorrencia_id = $1 AND status = 'ativo'`, [ocorrenciaId]);
}

module.exports = { SQL_EXIGE, SQL_ATIVO, SQL_JSON, janela, resumo, exigeDoCte, doCte, agendar, cancelar, aoApagarOcorrencia };
