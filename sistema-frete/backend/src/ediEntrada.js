// Entrada automática de EDI (PROCEDA): os arquivos que chegam por e-mail (e por SFTP/FTP) passam todos por aqui.
//  • Cada arquivo entra uma vez só (hash do conteúdo), mesmo chegando repetido.
//  • Quem mandou: o CNPJ do cabeçalho. Parceiro de redespacho (Parceiros e redespacho) → lado "parceiro";
//    senão, transportadora contratada (o embarcador acompanha as notas dele) → lado "embarcador".
//    NOTFIS é do cliente (a transportadora recebe as notas) → lado "cliente".
//  • OCOREN é aplicado sozinho, na hora: parceiro → ocorrências nos nossos CT-e (o cliente é avisado);
//    embarcador → data de entrega nas notas. O resto do OCOREN (nota que não é nossa, já lançada...) fica no resumo.
//  • CONEMB, DOCCOB e NOTFIS mexem com valores/CT-e: ficam "aguardando conferência" e são abertos na tela EDI,
//    no mesmo passo a passo do arquivo escolhido à mão.
const crypto = require('crypto');
const pool = require('./db');
const edi = require('./edi/arquivos');
const Doc = require('./utils/documento');

const USUARIO_SISTEMA = { id: null, nome: 'EDI automático', perfil: 'admin', pode_ver_todos: true };
const REQ_SISTEMA = { usuario: USUARIO_SISTEMA };
const STATUS = { aplicado: 'Aplicado', aguardando: 'Aguardando conferência', conferido: 'Conferido', erro: 'Erro', ignorado: 'Ignorado' };
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });

// O texto do arquivo: os PROCEDA vêm em ANSI (latin1); se for UTF-8 válido, usa UTF-8.
function textoDoBuffer(buf) {
  if (!Buffer.isBuffer(buf)) return String(buf || '');
  const utf = buf.toString('utf8');
  return utf.includes('�') ? buf.toString('latin1') : utf;
}
const ehEdi = (texto) => !!edi.tipoDoArquivo(texto);
const hashDe = (texto) => crypto.createHash('sha256').update(String(texto).replace(/\r\n/g, '\n').trim()).digest('hex');

function cabecalho(tipo, texto) {
  try {
    const a = { CONEMB: edi.lerConemb, OCOREN: edi.lerOcoren, DOCCOB: edi.lerDoccob }[tipo]?.(texto);
    if (a) return { cnpj: Doc.limpar(a.transportadora?.cnpj), nome: a.transportadora?.razao || a.transportadora?.nome || null, documento: a.documento || null };
    if (tipo === 'NOTFIS') {
      const n = edi.lerNotfis(texto);
      const emb = n.embarcadores?.[0] || {};
      return { cnpj: Doc.limpar(emb.cnpj), nome: emb.razao || null, documento: n.documento || null };
    }
  } catch { /* cabeçalho ilegível: segue sem */ }
  return { cnpj: null, nome: null, documento: null };
}

// Aplica o OCOREN sozinho. Devolve { resumo, mensagem }.
async function aplicarOcoren(lado, texto, nomeEmissor) {
  if (lado === 'parceiro') {
    const ep = require('./ediParceiros');
    const r = await ep.ler(texto);
    const itens = r.linhas.filter((l) => l.acao === 'lancar' && l.cte?.id).map((l) => ({ cte_id: l.cte.id, tipo_id: l.tipo_id, data_hora: l.data_hora, texto: l.texto, nf: l.nf }));
    const conta = (a) => r.linhas.filter((l) => l.acao === a).length;
    const ap = itens.length ? await ep.aplicarOcoren(itens, { parceiroNome: r.parceiro?.fantasia || r.parceiro?.nome || nomeEmissor || '', usuarioNome: USUARIO_SISTEMA.nome }) : { lancadas: 0, puladas: 0, erros: [] };
    const erros = ap.erros || [];
    const resumo = { ocorrencias: r.linhas.length, lancadas: ap.lancadas, ja_lancadas: conta('ja_feita') + ap.puladas - erros.length, nao_lancadas: erros.length, sem_cte: conta('sem_cte'), sem_data: conta('sem_data'), erros };
    return { resumo, mensagem: `${resumo.lancadas} ocorrência(s) lançada(s) nos CT-e${resumo.ja_lancadas ? `, ${resumo.ja_lancadas} já estavam` : ''}${resumo.sem_cte ? `, ${resumo.sem_cte} de nota que não é nossa` : ''}${resumo.sem_data ? `, ${resumo.sem_data} sem data` : ''}`
      + `${erros.length ? `; não lançada(s): ${erros.slice(0, 3).map((e) => `${e.nf ? `NF ${e.nf}` : `CT-e #${e.cte_id}`} — ${e.motivo}`).join('; ')}${erros.length > 3 ? ` e mais ${erros.length - 3}` : ''} (lance à mão em Ocorrências)` : ''}.` };
  }
  const { lerEmbarcador } = require('./routes/edi');
  const r = await lerEmbarcador(REQ_SISTEMA, texto);
  let gravadas = 0;
  for (const l of r.linhas.filter((x) => x.acao === 'gravar_entrega' && x.frete?.id && x.data)) {
    const u = await pool.query(`UPDATE fretes SET data_entrega = $2::date, data_entrega_origem = 'edi', atualizado_em = NOW() WHERE id = $1 AND data_entrega IS NULL`, [l.frete.id, l.data]);
    gravadas += u.rowCount;
  }
  const resumo = { ocorrencias: r.linhas.length, entregas_gravadas: gravadas, sem_nota: r.linhas.filter((l) => !l.frete).length };
  return { resumo, mensagem: `${gravadas} data(s) de entrega gravada(s) de ${resumo.ocorrencias} ocorrência(s)${resumo.sem_nota ? `; ${resumo.sem_nota} de nota que não está no sistema` : ''}.` };
}

// Resumo do que espera conferência (contagens para a lista).
async function resumoParaConferir(lado, tipo, texto) {
  try {
    if (tipo === 'NOTFIS') { const n = edi.lerNotfis(texto); const notas = (n.embarcadores || []).reduce((t, e) => t + (e.destinatarios || []).reduce((u, d) => u + (d.notas || []).length, 0), 0); return { resumo: { notas }, mensagem: `${notas} nota(s) para virar CT-e: confira e gere os rascunhos.` }; }
    if (lado === 'parceiro') {
      const r = await require('./ediParceiros').ler(texto);
      if (tipo === 'CONEMB') { const dif = r.linhas.filter((l) => l.acao === 'ajustar').length; return { resumo: { ctes: r.linhas.length, diferencas: dif }, mensagem: `${r.linhas.length} CT-e do parceiro${dif ? `, ${dif} com valor diferente do previsto` : ''}: confira.` }; }
      const f = r.faturas || []; return { resumo: { faturas: f.length, valor: f.reduce((s, x) => s + Number(x.valor || 0), 0) }, mensagem: `${f.length} fatura(s) do parceiro: confira e registre.` };
    }
    const r = await require('./routes/edi').lerEmbarcador(REQ_SISTEMA, texto);
    if (tipo === 'CONEMB') { const dif = (r.linhas || []).filter((l) => l.diferenca && Math.abs(l.diferenca) > 0.009).length; return { resumo: { ctes: (r.linhas || []).length, diferencas: dif }, mensagem: `${(r.linhas || []).length} CT-e${dif ? `, ${dif} com valor diferente da tabela` : ''}: confira.` }; }
    const f = r.faturas || []; return { resumo: { faturas: f.length, valor: f.reduce((s, x) => s + Number(x.valor || 0), 0) }, mensagem: `${f.length} fatura(s): confira.` };
  } catch (e) { return { resumo: {}, mensagem: `Para conferir (${e.message}).` }; }
}

// Recebe um arquivo. origem: 'email' | 'sftp' | 'ftp' | 'manual'; de: quem mandou (e-mail ou servidor).
async function receber({ nome, conteudo, origem = 'email', de = null }) {
  const texto = textoDoBuffer(conteudo);
  const tipo = edi.tipoDoArquivo(texto);
  if (!tipo) return { ok: false, ignorado: true, mensagem: 'Não é um arquivo EDI PROCEDA.' };
  const hash = hashDe(texto);
  const { rows: [ja] } = await pool.query('SELECT id, status FROM edi_recebidos WHERE hash = $1', [hash]);
  if (ja) return { ok: true, repetido: true, id: ja.id, status: ja.status };
  const cab = cabecalho(tipo, texto);
  let lado = 'embarcador'; let parceiroId = null;
  if (tipo === 'NOTFIS') lado = 'cliente';
  else if (cab.cnpj) {
    const raiz = cab.cnpj.slice(0, 8);
    const { rows: [p] } = await pool.query('SELECT id FROM parceiros WHERE LEFT(documento, 8) = $1 ORDER BY ativo DESC, id LIMIT 1', [raiz]).catch(() => ({ rows: [] }));
    if (p) { lado = 'parceiro'; parceiroId = p.id; }
  }
  const { rows: [reg] } = await pool.query(`INSERT INTO edi_recebidos (hash, nome_arquivo, origem, de, tipo, lado, cnpj_emissor, nome_emissor, parceiro_id, documento, status, texto)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'aguardando',$11) ON CONFLICT (hash) DO NOTHING RETURNING id`,
  [hash, String(nome || 'arquivo.txt').slice(0, 200), origem, de ? String(de).slice(0, 200) : null, tipo, lado, cab.cnpj, cab.nome ? String(cab.nome).slice(0, 200) : null, parceiroId, cab.documento ? String(cab.documento).slice(0, 60) : null, texto]);
  if (!reg) return { ok: true, repetido: true };
  let status = 'aguardando'; let resultado;
  try {
    if (tipo === 'OCOREN') { resultado = await aplicarOcoren(lado, texto, cab.nome); status = 'aplicado'; } else resultado = await resumoParaConferir(lado, tipo, texto);
  } catch (e) {
    status = 'erro'; resultado = { resumo: {}, mensagem: e.message };
  }
  await pool.query(`UPDATE edi_recebidos SET status = $2::varchar, resumo = $3, mensagem = $4, tratado_em = CASE WHEN $2::varchar = 'aplicado' THEN NOW() ELSE NULL END,
      tratado_por = CASE WHEN $2::varchar = 'aplicado' THEN $5::varchar ELSE NULL END WHERE id = $1`,
  [reg.id, status, JSON.stringify(resultado.resumo || {}), String(resultado.mensagem || '').slice(0, 1000), USUARIO_SISTEMA.nome]);
  if (status !== 'aguardando') {
    require('./auditoria').registrar({ usuarioId: null, usuarioNome: USUARIO_SISTEMA.nome, acao: 'edi_automatico', detalhes: `${tipo} de ${cab.nome || cab.cnpj || 'remetente desconhecido'} (${origem}): ${resultado.mensagem}`.slice(0, 1000) });
  }
  return { ok: status !== 'erro', id: reg.id, tipo, lado, status, mensagem: resultado.mensagem };
}

// Vários anexos/arquivos de uma vez (e-mail). Devolve contagens.
async function receberVarios(arquivos, { origem, de } = {}) {
  const cont = { edi: 0, aplicados: 0, aguardando: 0, repetidos: 0, erros: 0, detalhes: [] };
  for (const a of arquivos) {
    const r = await receber({ nome: a.nome, conteudo: a.conteudo, origem, de }).catch((e) => ({ ok: false, mensagem: e.message }));
    if (r.ignorado) continue;
    cont.edi += 1;
    if (r.repetido) cont.repetidos += 1;
    else if (r.status === 'aplicado') cont.aplicados += 1;
    else if (r.status === 'aguardando') cont.aguardando += 1;
    else cont.erros += 1;
    if (!r.repetido) cont.detalhes.push(`${r.tipo || 'EDI'} ${a.nome}: ${r.mensagem}`);
  }
  return cont;
}

// Anexos de um e-mail que parecem EDI (texto, sem ser XML/PDF/imagem).
function anexosEdi(email) {
  const lista = [];
  for (const a of email.attachments || []) {
    const nome = String(a.filename || 'anexo.txt');
    if (/\.(xml|pdf|zip|png|jpe?g|gif|docx?|xlsx?|html?)$/i.test(nome) || /image|pdf|xml/i.test(a.contentType || '')) continue;
    if (!a.content || a.content.length > 30 * 1024 * 1024) continue;
    const texto = textoDoBuffer(a.content);
    if (ehEdi(texto)) lista.push({ nome, conteudo: a.content });
  }
  return lista;
}

// ---------------------------------------------------------------- tela
async function listar({ status = '', busca = '' } = {}) {
  const val = []; const cond = [];
  if (status) { val.push(status); cond.push(`r.status = $${val.length}`); }
  const b = String(busca || '').trim();
  if (b) { val.push(`%${b}%`); cond.push(`(r.nome_arquivo ILIKE $${val.length} OR r.nome_emissor ILIKE $${val.length} OR r.cnpj_emissor LIKE $${val.length} OR r.de ILIKE $${val.length})`); }
  const { rows } = await pool.query(`SELECT r.id, r.nome_arquivo, r.origem, r.de, r.tipo, r.lado, r.cnpj_emissor, r.nome_emissor, r.documento, r.status, r.resumo, r.mensagem,
      r.criado_em, r.tratado_em, r.tratado_por, p.nome AS parceiro_nome
    FROM edi_recebidos r LEFT JOIN parceiros p ON p.id = r.parceiro_id ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY r.criado_em DESC LIMIT 200`, val);
  const { rows: [c] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'aguardando')::int AS aguardando, COUNT(*) FILTER (WHERE status = 'erro')::int AS erros,
      COUNT(*) FILTER (WHERE criado_em > NOW() - INTERVAL '7 days')::int AS semana FROM edi_recebidos`);
  return { arquivos: rows, contagem: c, status: STATUS };
}
async function arquivo(id) {
  const { rows: [r] } = await pool.query('SELECT id, nome_arquivo, tipo, lado, status, texto FROM edi_recebidos WHERE id = $1', [id]);
  if (!r) throw falha('Arquivo não encontrado.', 404);
  return r;
}
async function marcar(id, status, usuarioNome) {
  if (!['conferido', 'ignorado', 'aguardando'].includes(status)) throw falha('Situação inválida.');
  const { rowCount } = await pool.query(`UPDATE edi_recebidos SET status = $2::varchar, tratado_em = CASE WHEN $2::varchar = 'aguardando' THEN NULL ELSE NOW() END,
      tratado_por = CASE WHEN $2::varchar = 'aguardando' THEN NULL ELSE $3::varchar END WHERE id = $1`, [id, status, usuarioNome]);
  if (!rowCount) throw falha('Arquivo não encontrado.', 404);
}
// Tenta de novo um OCOREN que deu erro (ex.: o CT-e chegou depois).
async function reprocessar(id) {
  const r = await arquivo(id);
  if (r.tipo !== 'OCOREN') throw falha('Só o OCOREN é aplicado de novo; os outros são conferidos na tela.');
  const { rows: [x] } = await pool.query('SELECT nome_emissor FROM edi_recebidos WHERE id = $1', [id]);
  const res = await aplicarOcoren(r.lado, r.texto, x?.nome_emissor);
  await pool.query(`UPDATE edi_recebidos SET status = 'aplicado', resumo = $2, mensagem = $3, tratado_em = NOW(), tratado_por = $4 WHERE id = $1`,
    [id, JSON.stringify(res.resumo), res.mensagem, USUARIO_SISTEMA.nome]);
  return res;
}
async function pendencias() {
  const { rows: [c] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'aguardando')::int AS aguardando, COUNT(*) FILTER (WHERE status = 'erro')::int AS erros FROM edi_recebidos`);
  return c;
}

module.exports = { receber, receberVarios, anexosEdi, textoDoBuffer, hashDe, listar, arquivo, marcar, reprocessar, pendencias, STATUS };
