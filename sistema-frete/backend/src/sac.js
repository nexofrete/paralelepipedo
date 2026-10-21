// SAC com protocolo (estilo SSW): o cliente abre o chamado pelo portal, por
// e-mail (caixa com a finalidade "SAC") ou pelo WhatsApp; a equipe registra os
// que chegam por telefone. Cada chamado tem protocolo, assunto, prioridade,
// responsável, prazo de resposta e de solução (SLA), o CT-e/NF ligado e o
// histórico de mensagens (com notas internas que o cliente não vê). O cliente
// é avisado por e-mail/WhatsApp a cada resposta e avalia o atendimento no fim.
const crypto = require('crypto');
const pool = require('./db');
const Doc = require('./utils/documento');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ASSUNTOS = {
  atraso: 'Atraso na entrega', avaria: 'Avaria ou falta de mercadoria', comprovante: 'Comprovante de entrega', cobranca: 'Fatura, boleto ou 2ª via',
  coleta: 'Coleta', cotacao: 'Cotação ou proposta', reclamacao: 'Reclamação', outros: 'Outros assuntos',
};
const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', aguardando: 'Aguardando o cliente', resolvido: 'Resolvido', cancelado: 'Cancelado' };
const ORIGENS = { portal: 'Portal do cliente', email: 'E-mail', whatsapp: 'WhatsApp', telefone: 'Telefone', interno: 'Aberto pela equipe' };
const PRIORIDADE_DO_ASSUNTO = { avaria: 'alta', atraso: 'alta', reclamacao: 'alta' };
// Palpite do assunto pelo texto (e-mail e WhatsApp chegam sem assunto escolhido).
const PALAVRAS = [['avaria', /avaria|avariad|quebrad|amassad|molhad|danificad|falt(a|ou) (de )?(volume|caixa|mercadoria)|extravi/i],
  ['comprovante', /comprovante|canhoto|assinatura|prova de entrega/i], ['cobranca', /boleto|fatura|2.? ?via|cobran|pagamento|nota de d[eé]bito/i],
  ['coleta', /coleta|coletar|retirar|buscar a carga/i], ['cotacao', /cota[cç][aã]o|or[cç]amento|proposta|quanto custa|pre[cç]o/i],
  ['atraso', /atras|n[aã]o (chegou|foi entregue|recebi a (carga|mercadoria))|ainda n[aã]o|previs[aã]o|onde est[aá]|rastre/i],
  ['reclamacao', /reclama|absurdo|insatisfeit|p[eé]ssimo|descaso/i]];
// Nº de NF/CT-e citado no texto ("NF 1234", "nota fiscal nº 55", "CT-e 25").
function refCitada(t) { return (/(?:\bNF-?e?|\bnota(?: fiscal)?|\bCT-?e)\W{0,4}(?:n[º°o.]?\s*)?(\d{1,9})\b/i.exec(String(t || '')) || [])[1] || null; }
function adivinharAssunto(t) { return (PALAVRAS.find(([, re]) => re.test(String(t || ''))) || ['outros'])[0]; }
// Prazos em horas corridas: primeira resposta e solução.
const SLA_PADRAO = { urgente: { resposta: 1, solucao: 4 }, alta: { resposta: 4, solucao: 24 }, normal: { resposta: 8, solucao: 48 }, baixa: { resposta: 24, solucao: 120 } };
const CONFIG_PADRAO = { sla: SLA_PADRAO, email_resposta: '', avisar_email: true, avisar_whatsapp: true, equipe_email: '' };
const ABERTOS = `status IN ('aberto', 'em_andamento', 'aguardando')`;

async function config() {
  const { rows } = await pool.query('SELECT sac_config FROM empresa WHERE id = 1');
  const c = rows[0]?.sac_config || {};
  const sla = Object.fromEntries(Object.keys(SLA_PADRAO).map((p) => [p, { ...SLA_PADRAO[p], ...(c.sla?.[p] || {}) }]));
  return { ...CONFIG_PADRAO, ...c, sla };
}
async function salvarConfig(b = {}) {
  const atual = await config();
  const horas = (v, padrao) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 && n <= 720 ? n : padrao; };
  const sla = Object.fromEntries(Object.keys(SLA_PADRAO).map((p) => [p, { resposta: horas(b.sla?.[p]?.resposta, atual.sla[p].resposta), solucao: horas(b.sla?.[p]?.solucao, atual.sla[p].solucao) }]));
  const email = (v) => { const e = String(v || '').trim(); if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw falha(`E-mail inválido: ${e}`); return e; };
  const c = { sla, email_resposta: email(b.email_resposta), avisar_email: b.avisar_email !== false, avisar_whatsapp: b.avisar_whatsapp !== false, equipe_email: email(b.equipe_email) };
  await pool.query('UPDATE empresa SET sac_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return c;
}

const somarHoras = (data, horas) => new Date(new Date(data).getTime() + horas * 3600000);
async function prazos(prioridade, base = new Date()) {
  const c = await config();
  const s = c.sla[prioridade] || c.sla.normal;
  return { prazo_resposta: somarHoras(base, s.resposta), prazo_solucao: somarHoras(base, s.solucao) };
}

// Protocolo do dia: AAAAMMDD-0001 (sequência por dia, no horário de Brasília).
async function novoProtocolo(cliente) {
  const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  const { rows } = await cliente.query(`SELECT COALESCE(MAX(SPLIT_PART(protocolo, '-', 2)::int), 0) + 1 AS n FROM sac_chamados WHERE protocolo LIKE $1 || '-%'`, [dia]);
  return `${dia}-${String(rows[0].n).padStart(4, '0')}`;
}

// CT-e pelo número do CT-e, da NF ou pela chave.
async function acharCte(ref, cliente = pool) {
  const r = String(ref || '').replace(/\s/g, '');
  if (!r) return null;
  const dig = r.replace(/\D/g, '');
  const { rows } = await cliente.query(
    `SELECT id, serie, numero, chave, dados, tomador_nome, situacao_entrega, previsao_entrega FROM ctes_emitidos WHERE status = 'autorizado' AND (chave = $1 OR numero::text = $2
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(dados->'nfes', '[]'::jsonb)) k WHERE LTRIM(SUBSTRING(k FROM 26 FOR 9), '0') = LTRIM($2, '0')))
     ORDER BY (numero::text = $2) DESC, id DESC LIMIT 1`, [dig, dig.replace(/^0+/, '') || '-']);
  return rows[0] || null;
}
const partesDoCte = (d = {}) => [d.remetente, d.expedidor, d.recebedor, d.destinatario, d.outroTomador].filter(Boolean).map((p) => Doc.limpar(p.cnpj || p.cpf)).filter(Boolean);
const tomador = (d = {}) => ({ 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {});

// ---------- Avisos ao cliente e à equipe ----------
async function enderecoPublico() {
  const { rows } = await pool.query('SELECT portal_endereco, nome_fantasia, razao_social FROM empresa WHERE id = 1');
  return { base: String(rows[0]?.portal_endereco || '').replace(/\/+$/, ''), nome: rows[0]?.nome_fantasia || rows[0]?.razao_social || 'Transportadora' };
}
async function avisarCliente(ch, { titulo, corpo }) {
  const c = await config();
  const { base, nome } = await enderecoPublico();
  const feitos = [];
  if (c.avisar_email && ch.contato_email) {
    const html = `<div style="font-family:Arial,sans-serif; max-width:560px; margin:0 auto;">
      <h2 style="color:#1F4E78; margin-bottom:6px;">${esc(titulo)}</h2>
      <p style="color:#555; margin:0 0 14px;">Protocolo <b>${esc(ch.protocolo)}</b> · ${esc(ch.titulo)}</p>
      <div style="white-space:pre-wrap; border-left:3px solid #2f5bea; padding:8px 12px; background:#f5f7fb;">${esc(corpo)}</div>
      ${base ? `<p style="margin:20px 0;"><a href="${esc(base)}/portal.html" style="background:#2f5bea; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">Acompanhar no portal</a></p>` : ''}
      <p style="color:#888; font-size:12px;">Responda este e-mail para falar com a ${esc(nome)} — mantenha o [SAC ${esc(ch.protocolo)}] no assunto.</p></div>`;
    try { await require('./email').enviarSac({ para: ch.contato_email, assunto: `[SAC ${ch.protocolo}] ${titulo} — ${nome}`, html, responderPara: c.email_resposta || undefined }); feitos.push('e-mail'); } catch (e) { feitos.push(`e-mail não enviado (${e.message})`); }
  }
  if (c.avisar_whatsapp && ch.contato_fone && ch.origem === 'whatsapp') {
    try { await require('./whatsapp').enviarMensagem(`*${titulo}*\nProtocolo ${ch.protocolo}\n\n${corpo}`.slice(0, 1500), ch.contato_fone); feitos.push('WhatsApp'); } catch (e) { feitos.push(`WhatsApp não enviado (${e.message})`); }
  }
  return feitos.join(', ') || null;
}
async function avisarEquipe(ch, texto) {
  const c = await config();
  if (!c.equipe_email) return;
  await require('./email').enviarSac({ para: c.equipe_email, assunto: `[SAC ${ch.protocolo}] Novo chamado: ${ch.titulo}`,
    html: `<div style="font-family:Arial,sans-serif;"><p><b>${esc(ORIGENS[ch.origem])}</b> · ${esc(ASSUNTOS[ch.assunto])} · prioridade ${esc(PRIORIDADES[ch.prioridade])}</p>
      <p>${esc(ch.cliente_nome || ch.contato_nome || ch.contato_email || ch.contato_fone || '')}</p><div style="white-space:pre-wrap;">${esc(texto)}</div></div>` }).catch(() => {});
}

// ---------- Abrir e conversar ----------
// b: { origem, assunto, prioridade, titulo, texto, cliente_doc, cliente_nome, contato_nome, contato_email, contato_fone, cte (nº CT-e/NF/chave), portal_acesso_id }
async function abrir(b, opcoes = {}) {
  const { autorNome = null, usuario = null } = opcoes;
  const origem = ORIGENS[b.origem] ? b.origem : 'interno';
  const assunto = ASSUNTOS[b.assunto] ? b.assunto : 'outros';
  const prioridade = PRIORIDADES[b.prioridade] ? b.prioridade : (PRIORIDADE_DO_ASSUNTO[assunto] || 'normal');
  const corpo = texto(b.texto, 10000);
  if (!corpo) throw falha('Descreva o que aconteceu.');
  const titulo = texto(b.titulo, 200) || corpo.split('\n')[0].slice(0, 120);
  const email = texto(b.contato_email, 250);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha('E-mail de contato inválido.');
  // cte_id: só de quem já conferiu o CT-e (portal); os demais mandam o número.
  let cte = opcoes.cteId ? (await pool.query('SELECT id, dados FROM ctes_emitidos WHERE id = $1', [opcoes.cteId])).rows[0] || null : b.cte ? await acharCte(b.cte) : null;
  if (b.cte && !cte && ['interno', 'telefone'].includes(origem)) throw falha('CT-e/NF não encontrado.');
  // E-mail/WhatsApp: qualquer um escreve. O CT-e citado só é ligado se o remetente for parte dele;
  // senão o número fica anotado e a equipe confere (o chamado não aparece no portal do dono da carga).
  let nfCitada = texto(b.nf, 20);
  if (cte && ['email', 'whatsapp'].includes(origem) && !partesDoCte(cte.dados).includes(Doc.limpar(b.cliente_doc) || '-')) { nfCitada = nfCitada || texto(b.cte, 20); cte = null; }
  const t = cte ? tomador(cte.dados) : {};
  let clienteDoc = Doc.limpar(b.cliente_doc) || Doc.limpar(t.cnpj || t.cpf) || null;
  let clienteNome = texto(b.cliente_nome, 200) || (clienteDoc && clienteDoc === Doc.limpar(t.cnpj || t.cpf) ? t.xNome : null) || null;
  if (clienteDoc && !clienteNome) { const { rows } = await pool.query('SELECT razao_social FROM clientes WHERE documento = $1', [clienteDoc]); clienteNome = rows[0]?.razao_social || null; }
  if (clienteDoc === '') clienteDoc = null;
  const p = await prazos(prioridade);
  const cliente = await pool.connect();
  let ch;
  try {
    await cliente.query('BEGIN');
    await cliente.query('LOCK TABLE sac_chamados IN SHARE ROW EXCLUSIVE MODE');
    const protocolo = await novoProtocolo(cliente);
    ({ rows: [ch] } = await cliente.query(
      `INSERT INTO sac_chamados (protocolo, origem, assunto, prioridade, titulo, cliente_doc, cliente_nome, contato_nome, contato_email, contato_fone, cte_id, nf, portal_acesso_id,
                                 prazo_resposta, prazo_solucao, responsavel_id, responsavel_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [protocolo, origem, assunto, prioridade, titulo, clienteDoc, clienteNome, texto(b.contato_nome, 120), email, texto(b.contato_fone, 30), cte?.id || null,
        nfCitada, Number(b.portal_acesso_id) || null, p.prazo_resposta, p.prazo_solucao, usuario?.id || null, usuario?.nome || null]));
    // Telefone/equipe: o relato é do cliente, digitado pela equipe.
    await cliente.query(`INSERT INTO sac_mensagens (chamado_id, autor, autor_nome, texto, canal) VALUES ($1, 'cliente', $2, $3, $4)`,
      [ch.id, autorNome || texto(b.contato_nome, 120) || clienteNome || 'Cliente', corpo, origem]);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  // Confirmação ao cliente com o protocolo (sem esperar).
  setImmediate(async () => {
    const env = await avisarCliente(ch, { titulo: 'Recebemos o seu chamado', corpo: `Seu chamado foi registrado com o protocolo ${ch.protocolo}.\nAssunto: ${ASSUNTOS[assunto]}.\nRespondemos até ${new Date(ch.prazo_resposta).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` }).catch(() => null);
    if (env) await pool.query(`INSERT INTO sac_mensagens (chamado_id, autor, autor_nome, texto, interna, enviado) VALUES ($1, 'sistema', 'Sistema', 'Confirmação do protocolo ao cliente.', TRUE, $2)`, [ch.id, env.slice(0, 200)]).catch(() => {});
    if (origem !== 'interno' && origem !== 'telefone') await avisarEquipe(ch, corpo);
  });
  return ch;
}

async function chamado(id, cliente = pool) {
  const { rows } = await cliente.query('SELECT * FROM sac_chamados WHERE id = $1', [id]);
  if (!rows[0]) throw falha('Chamado não encontrado.', 404);
  return rows[0];
}

// Resposta da equipe (ou nota interna). status: o novo (padrão: respondeu → aguardando o cliente).
async function responder(id, { texto: t, interna = false, status = null }, usuario) {
  const corpo = texto(t, 10000);
  if (!corpo) throw falha('Escreva a resposta.');
  const ch = await chamado(id);
  if (['resolvido', 'cancelado'].includes(ch.status) && !interna) throw falha('Chamado encerrado: reabra antes de responder.', 409);
  const novo = interna ? (status && STATUS[status] ? status : (ch.status === 'aberto' ? 'em_andamento' : ch.status)) : (status && STATUS[status] ? status : 'aguardando');
  const cliente = await pool.connect();
  let m;
  try {
    await cliente.query('BEGIN');
    ({ rows: [m] } = await cliente.query(`INSERT INTO sac_mensagens (chamado_id, autor, autor_nome, texto, interna) VALUES ($1, 'equipe', $2, $3, $4) RETURNING *`, [id, usuario.nome, corpo, !!interna]));
    await cliente.query(`UPDATE sac_chamados SET status = $2::text, respondido_em = CASE WHEN $3 THEN respondido_em ELSE COALESCE(respondido_em, NOW()) END,
        responsavel_id = COALESCE(responsavel_id, $4), responsavel_nome = COALESCE(responsavel_nome, $5),
        resolvido_em = CASE WHEN $2::text = 'resolvido' THEN NOW() ELSE resolvido_em END, atualizado_em = NOW() WHERE id = $1`, [id, novo, !!interna, usuario.id, usuario.nome]);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  let enviado = null;
  if (!interna) {
    enviado = await avisarCliente({ ...ch, status: novo }, { titulo: novo === 'resolvido' ? 'Seu chamado foi resolvido' : 'Resposta ao seu chamado', corpo: `${corpo}${novo === 'resolvido' ? '\n\nSe ainda precisar de algo, é só responder. Avalie o atendimento no portal.' : ''}` });
    if (enviado) await pool.query('UPDATE sac_mensagens SET enviado = $2 WHERE id = $1', [m.id, enviado.slice(0, 200)]);
  }
  return { ...m, enviado, status: novo };
}

// Mensagem do cliente (portal, e-mail, WhatsApp): reabre o chamado.
async function doCliente(id, { texto: t, canal, autorNome }) {
  const corpo = texto(t, 10000);
  if (!corpo) throw falha('Escreva a mensagem.');
  const ch = await chamado(id);
  if (ch.status === 'cancelado') throw falha('Este chamado foi cancelado: abra um novo.', 409);
  await pool.query(`INSERT INTO sac_mensagens (chamado_id, autor, autor_nome, texto, canal) VALUES ($1, 'cliente', $2, $3, $4)`, [id, autorNome || ch.contato_nome || ch.cliente_nome || 'Cliente', corpo, canal]);
  // Voltou a falar: precisa de resposta de novo (prazo de resposta conta a partir de agora).
  const p = await prazos(ch.prioridade);
  await pool.query(`UPDATE sac_chamados SET status = CASE WHEN status = 'aberto' THEN 'aberto' ELSE 'em_andamento' END, resolvido_em = NULL, avaliacao = CASE WHEN status = 'resolvido' THEN NULL ELSE avaliacao END,
      prazo_resposta = CASE WHEN status IN ('aguardando', 'resolvido') THEN $2 ELSE prazo_resposta END, respondido_em = CASE WHEN status IN ('aguardando', 'resolvido') THEN NULL ELSE respondido_em END,
      atualizado_em = NOW() WHERE id = $1`, [id, p.prazo_resposta]);
  return chamado(id);
}

// Mudanças da equipe: status, prioridade (recalcula os prazos), responsável, assunto, CT-e.
async function alterar(id, b, usuario) {
  const ch = await chamado(id);
  const mud = []; const val = [id]; const set = (campo, v) => { val.push(v); mud.push(`${campo} = $${val.length}`); };
  const log = [];
  if (b.prioridade && PRIORIDADES[b.prioridade] && b.prioridade !== ch.prioridade) {
    const p = await prazos(b.prioridade, ch.criado_em);
    set('prioridade', b.prioridade); set('prazo_resposta', p.prazo_resposta); set('prazo_solucao', p.prazo_solucao);
    log.push(`prioridade ${PRIORIDADES[ch.prioridade]} → ${PRIORIDADES[b.prioridade]}`);
  }
  if (b.assunto && ASSUNTOS[b.assunto] && b.assunto !== ch.assunto) { set('assunto', b.assunto); log.push(`assunto: ${ASSUNTOS[b.assunto]}`); }
  if (b.responsavel_id !== undefined) {
    const rid = Number(b.responsavel_id) || null;
    const { rows } = rid ? await pool.query('SELECT id, nome FROM usuarios WHERE id = $1 AND ativo', [rid]) : { rows: [] };
    if (rid && !rows[0]) throw falha('Usuário não encontrado.');
    set('responsavel_id', rows[0]?.id || null); set('responsavel_nome', rows[0]?.nome || null);
    log.push(`responsável: ${rows[0]?.nome || 'ninguém'}`);
  }
  if (b.cte !== undefined) {
    const c = b.cte ? await acharCte(b.cte) : null;
    if (b.cte && !c) throw falha('CT-e/NF não encontrado.');
    set('cte_id', c?.id || null); log.push(c ? `ligado ao CT-e ${c.serie}/${c.numero}` : 'sem CT-e');
  }
  if (b.status && STATUS[b.status] && b.status !== ch.status) {
    set('status', b.status);
    if (b.status === 'resolvido') { val.push(new Date()); mud.push(`resolvido_em = $${val.length}`); }
    if (['aberto', 'em_andamento'].includes(b.status)) mud.push('resolvido_em = NULL');
    log.push(`status: ${STATUS[b.status]}`);
  }
  if (!mud.length) return ch;
  await pool.query(`UPDATE sac_chamados SET ${mud.join(', ')}, atualizado_em = NOW() WHERE id = $1`, val);
  await pool.query(`INSERT INTO sac_mensagens (chamado_id, autor, autor_nome, texto, interna) VALUES ($1, 'sistema', $2, $3, TRUE)`, [id, usuario.nome, `${usuario.nome}: ${log.join('; ')}${b.motivo ? ` — ${String(b.motivo).slice(0, 200)}` : ''}`]);
  if (b.status === 'resolvido' && ch.status !== 'resolvido') await avisarCliente(ch, { titulo: 'Seu chamado foi resolvido', corpo: `${b.motivo || 'O atendimento foi concluído.'}\n\nSe ainda precisar de algo, é só responder. Avalie o atendimento no portal.` }).catch(() => null);
  return chamado(id);
}

// ---------- Consultas ----------
const SITUACAO_PRAZO = `CASE WHEN c.status IN ('resolvido', 'cancelado') THEN CASE WHEN c.resolvido_em > c.prazo_solucao THEN 'resolvido_fora' ELSE 'ok' END
  WHEN NOW() > c.prazo_solucao THEN 'solucao_atrasada' WHEN c.respondido_em IS NULL AND NOW() > c.prazo_resposta THEN 'resposta_atrasada'
  WHEN NOW() > c.prazo_solucao - (c.prazo_solucao - c.criado_em) / 4 THEN 'vencendo' ELSE 'ok' END`;
const FILTROS = {
  abertos: `c.${ABERTOS}`,
  meus: `c.${ABERTOS} AND c.responsavel_id = $USUARIO`,
  sem_responsavel: `c.${ABERTOS} AND c.responsavel_id IS NULL`,
  atrasados: `c.${ABERTOS} AND (NOW() > c.prazo_solucao OR (c.respondido_em IS NULL AND NOW() > c.prazo_resposta))`,
  aguardando: `c.status = 'aguardando'`,
  resolvidos: `c.status IN ('resolvido', 'cancelado')`,
  todos: 'TRUE',
};
async function listar({ filtro = 'abertos', busca = '', usuarioId = 0 } = {}) {
  const f = FILTROS[filtro] ? filtro : 'abertos';
  const val = [];
  const cond = [FILTROS[f].includes('$USUARIO') ? FILTROS[f].replace('$USUARIO', `$${val.push(Number(usuarioId) || 0)}`) : FILTROS[f]];
  const b = String(busca || '').trim();
  if (b) {
    const i = val.push(`%${b}%`, b.replace(/\D/g, '') || '-') - 1;
    cond.push(`(c.protocolo ILIKE $${i} OR c.titulo ILIKE $${i} OR c.cliente_nome ILIKE $${i} OR c.contato_nome ILIKE $${i} OR c.contato_email ILIKE $${i} OR c.nf = $${i + 1} OR t.numero::text = $${i + 1})`);
  }
  const { rows } = await pool.query(
    `SELECT c.*, ${SITUACAO_PRAZO} AS prazo_situacao, t.serie AS cte_serie, t.numero AS cte_numero,
            (SELECT COUNT(*)::int FROM sac_mensagens m WHERE m.chamado_id = c.id AND NOT m.interna AND m.autor <> 'sistema') AS mensagens,
            (SELECT m.autor FROM sac_mensagens m WHERE m.chamado_id = c.id AND m.autor <> 'sistema' ORDER BY m.criado_em DESC, m.id DESC LIMIT 1) AS ultimo_autor
       FROM sac_chamados c LEFT JOIN ctes_emitidos t ON t.id = c.cte_id WHERE ${cond.join(' AND ')}
      ORDER BY (c.status IN ('resolvido', 'cancelado')), CASE c.prioridade WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, c.prazo_solucao, c.id DESC LIMIT 500`, val);
  const { rows: [k] } = await pool.query(
    `SELECT ${Object.entries(FILTROS).map(([n, w]) => `COUNT(*) FILTER (WHERE ${w.replace('$USUARIO', '$1')})::int AS ${n}`).join(', ')} FROM sac_chamados c`, [Number(usuarioId) || 0]);
  return { chamados: rows, contagens: k };
}

async function indicadores() {
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE ${ABERTOS})::int AS abertos,
            COUNT(*) FILTER (WHERE criado_em > NOW() - INTERVAL '30 days')::int AS abertos_30,
            ROUND(AVG(EXTRACT(EPOCH FROM (respondido_em - criado_em)) / 3600) FILTER (WHERE respondido_em IS NOT NULL AND criado_em > NOW() - INTERVAL '30 days')::numeric, 1)::float AS horas_resposta,
            COUNT(*) FILTER (WHERE status = 'resolvido' AND resolvido_em > NOW() - INTERVAL '30 days')::int AS resolvidos_30,
            COUNT(*) FILTER (WHERE status = 'resolvido' AND resolvido_em > NOW() - INTERVAL '30 days' AND resolvido_em <= prazo_solucao)::int AS no_prazo_30,
            ROUND(AVG(avaliacao) FILTER (WHERE avaliacao IS NOT NULL AND resolvido_em > NOW() - INTERVAL '90 days')::numeric, 1)::float AS nota_media,
            COUNT(*) FILTER (WHERE avaliacao IS NOT NULL AND resolvido_em > NOW() - INTERVAL '90 days')::int AS avaliacoes
       FROM sac_chamados`);
  const { rows: porAssunto } = await pool.query(`SELECT assunto, COUNT(*)::int AS n FROM sac_chamados WHERE criado_em > NOW() - INTERVAL '30 days' GROUP BY assunto ORDER BY n DESC`);
  return { ...r, por_assunto: porAssunto.map((x) => ({ ...x, nome: ASSUNTOS[x.assunto] })) };
}

async function detalhe(id, { comInternas = true } = {}) {
  const { rows: [c] } = await pool.query(`SELECT c.*, ${SITUACAO_PRAZO} AS prazo_situacao FROM sac_chamados c WHERE c.id = $1`, [id]);
  if (!c) throw falha('Chamado não encontrado.', 404);
  const { rows: msgs } = await pool.query(`SELECT * FROM sac_mensagens WHERE chamado_id = $1 ${comInternas ? '' : `AND NOT interna AND autor <> 'sistema'`} ORDER BY criado_em, id`, [id]);
  let cte = null;
  if (c.cte_id) {
    const { rows: [t] } = await pool.query(
      `SELECT id, serie, numero, chave, situacao_entrega, previsao_entrega::text, data_entrega, recebedor_nome, destinatario_nome, cidade_fim, uf_fim, valor_total,
              (SELECT json_build_object('descricao', o.descricao, 'data_hora', o.data_hora) FROM cte_ocorrencias o WHERE o.cte_id = c2.id ORDER BY o.data_hora DESC, o.id DESC LIMIT 1) AS ultima
         FROM ctes_emitidos c2 WHERE id = $1`, [c.cte_id]);
    cte = t || null;
  }
  return { ...c, mensagens: msgs, cte };
}

// ---------- Portal do cliente ----------
const condPortal = (u, i = 1) => `(cliente_doc = ANY($${i}::text[]) OR portal_acesso_id = $${i + 1})`;
async function listarDoCliente(u) {
  const { rows } = await pool.query(
    `SELECT id, protocolo, assunto, titulo, status, prioridade, criado_em, atualizado_em, avaliacao, (SELECT COUNT(*)::int FROM sac_mensagens m WHERE m.chamado_id = sac_chamados.id AND NOT m.interna AND m.autor <> 'sistema') AS mensagens,
            (SELECT m.autor FROM sac_mensagens m WHERE m.chamado_id = sac_chamados.id AND NOT m.interna AND m.autor <> 'sistema' ORDER BY m.criado_em DESC, m.id DESC LIMIT 1) AS ultimo_autor
       FROM sac_chamados WHERE ${condPortal(u)} ORDER BY (status IN ('resolvido', 'cancelado')), atualizado_em DESC LIMIT 200`, [u.documentos, u.id]);
  return rows.map((r) => ({ ...r, assunto_nome: ASSUNTOS[r.assunto], status_nome: STATUS[r.status] }));
}
async function doPortal(u, id) {
  const { rows } = await pool.query(`SELECT id FROM sac_chamados WHERE id = $1 AND ${condPortal(u, 2)}`, [id, u.documentos, u.id]);
  if (!rows[0]) throw falha('Chamado não encontrado.', 404);
  const d = await detalhe(id, { comInternas: false });
  return { id: d.id, protocolo: d.protocolo, assunto: d.assunto, assunto_nome: ASSUNTOS[d.assunto], titulo: d.titulo, status: d.status, status_nome: STATUS[d.status], criado_em: d.criado_em,
    prazo_resposta: d.prazo_resposta, responsavel_nome: d.responsavel_nome, avaliacao: d.avaliacao, avaliacao_comentario: d.avaliacao_comentario,
    cte: d.cte ? { serie: d.cte.serie, numero: d.cte.numero, situacao_entrega: d.cte.situacao_entrega, previsao_entrega: d.cte.previsao_entrega } : null,
    mensagens: d.mensagens.map((m) => ({ autor: m.autor, autor_nome: m.autor === 'equipe' ? (m.autor_nome || 'Atendimento') : m.autor_nome, texto: m.texto, criado_em: m.criado_em })) };
}
async function abrirPeloPortal(u, b) {
  // CT-e citado: só se for do cliente.
  let cteId = null;
  if (String(b.cte || '').trim()) {
    const c = await acharCte(b.cte);
    if (c) { try { await require('./portal').cteDoCliente(u, c.id); cteId = c.id; } catch { cteId = null; } }
  }
  return abrir({ ...b, origem: 'portal', cte: null, nf: cteId ? null : String(b.cte || '').replace(/\D/g, '').slice(0, 20) || null, cliente_doc: u.documentos[0], cliente_nome: u.cliente_nome || null, contato_nome: u.nome, contato_email: u.email, portal_acesso_id: u.id, prioridade: null }, { autorNome: u.nome, cteId });
}
async function avaliar(u, id, nota, comentario) {
  const n = parseInt(nota, 10);
  if (!(n >= 1 && n <= 5)) throw falha('Dê uma nota de 1 a 5.');
  const { rowCount } = await pool.query(`UPDATE sac_chamados SET avaliacao = $2, avaliacao_comentario = $3, atualizado_em = NOW() WHERE id = $1 AND status = 'resolvido' AND ${condPortal(u, 4)}`,
    [id, n, texto(comentario, 500), u.documentos, u.id]);
  if (!rowCount) throw falha('Só dá para avaliar chamado resolvido.', 409);
}

// ---------- E-mail (caixa com a finalidade "SAC") ----------
// Tira a parte citada da resposta ("Em ... escreveu:", linhas com ">").
function semCitacao(t) {
  const linhas = String(t || '').replace(/\r/g, '').split('\n');
  const fim = linhas.findIndex((l) => /^(Em .+escreveu:|On .+wrote:|-{2,}\s*(Mensagem original|Original Message)|De: .+|From: .+|_{5,})/i.test(l.trim()));
  return (fim >= 0 ? linhas.slice(0, fim) : linhas).filter((l) => !/^>/.test(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function doEmail(email) {
  const assunto = String(email.subject || '').trim();
  const de = email.from?.value?.[0] || {};
  const endereco = String(de.address || '').toLowerCase();
  const corpo = semCitacao(email.text || String(email.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' '));
  if (!corpo) return { ignorado: 'sem texto' };
  const m = /\[SAC\s+(\d{8}-\d{3,})\]/i.exec(assunto);
  if (m) {
    // Só do e-mail de contato do chamado (o protocolo é sequencial): de outro endereço, vira chamado novo.
    const { rows } = await pool.query('SELECT id FROM sac_chamados WHERE protocolo = $1 AND LOWER(contato_email) = $2', [m[1], endereco]);
    if (rows[0]) { await doCliente(rows[0].id, { texto: corpo, canal: 'email', autorNome: de.name || endereco }); return { resposta: m[1] }; }
  }
  // Quem é: o acesso do portal ou o cadastro do cliente com este e-mail.
  const { rows: ac } = await pool.query(`SELECT id, documentos FROM portal_usuarios WHERE LOWER(email) = $1 LIMIT 1`, [endereco]).catch(() => ({ rows: [] }));
  const { rows: cl } = ac[0] ? { rows: [] } : await pool.query(`SELECT documento, razao_social FROM clientes WHERE LOWER(email) = $1 LIMIT 1`, [endereco]);
  const ch = await abrir({ origem: 'email', assunto: adivinharAssunto(`${assunto}\n${corpo}`), titulo: assunto.replace(/^(re|res|fw|fwd|enc)\s*:\s*/i, '') || corpo.slice(0, 100), texto: corpo, contato_nome: de.name || null, contato_email: endereco,
    cliente_doc: ac[0]?.documentos?.[0] || cl[0]?.documento || null, cliente_nome: cl[0]?.razao_social || null, portal_acesso_id: ac[0]?.id || null, cte: refCitada(`${assunto} ${corpo}`) },
  { autorNome: de.name || endereco });
  return { novo: ch.protocolo };
}

// ---------- WhatsApp (webhook da Twilio) ----------
// Confere a assinatura X-Twilio-Signature: HMAC-SHA1 (token da conta) da URL + os parâmetros em ordem.
function assinaturaTwilio(token, url, params) {
  const base = url + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha1', token).update(Buffer.from(base, 'utf8')).digest('base64');
}
async function doWhatsapp({ de, texto: t, nome }) {
  const fone = String(de || '').replace(/^whatsapp:/, '').trim();
  const corpo = texto(t, 5000);
  if (!fone || !corpo) return null;
  // Conversa aberta deste número nos últimos 30 dias: a mensagem entra nela.
  const { rows } = await pool.query(`SELECT id, protocolo FROM sac_chamados WHERE contato_fone = $1 AND ${ABERTOS} AND atualizado_em > NOW() - INTERVAL '30 days' ORDER BY id DESC LIMIT 1`, [fone]);
  if (rows[0]) { await doCliente(rows[0].id, { texto: corpo, canal: 'whatsapp', autorNome: nome || fone }); return { resposta: rows[0].protocolo }; }
  const digitos = fone.replace(/\D/g, '').replace(/^55/, '');
  const { rows: cl } = await pool.query(`SELECT documento, razao_social FROM clientes WHERE REGEXP_REPLACE(COALESCE(telefone, ''), '\\D', '', 'g') IN ($1, '55' || $1) LIMIT 1`, [digitos]);
  const ch = await abrir({ origem: 'whatsapp', assunto: adivinharAssunto(corpo), texto: corpo, contato_nome: nome || null, contato_fone: fone, cliente_doc: cl[0]?.documento || null, cliente_nome: cl[0]?.razao_social || null,
    cte: refCitada(corpo) }, { autorNome: nome || fone });
  return { novo: ch.protocolo };
}

async function pendencias(usuarioId = 0) {
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE ${FILTROS.atrasados})::int AS atrasados, COUNT(*) FILTER (WHERE ${FILTROS.sem_responsavel})::int AS sem_responsavel,
            COUNT(*) FILTER (WHERE ${FILTROS.meus.replace('$USUARIO', '$1')})::int AS meus FROM sac_chamados c`, [Number(usuarioId) || 0]);
  return r;
}

module.exports = { ASSUNTOS, PRIORIDADES, STATUS, ORIGENS, SLA_PADRAO, config, salvarConfig, prazos, abrir, responder, doCliente, alterar, listar, indicadores, detalhe,
  listarDoCliente, doPortal, abrirPeloPortal, avaliar, semCitacao, adivinharAssunto, refCitada, doEmail, assinaturaTwilio, doWhatsapp, pendencias, acharCte };
