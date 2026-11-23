// Ordens de coleta do embarcador (Pátio e portaria » Ordens de coleta, tela 424).
// A expedição junta as notas que a transportadora deve buscar, gera a ordem e manda por e-mail com um link. Pelo link
// (sem login, só com o código da ordem) a transportadora aceita, informando a data/hora, a placa e o motorista, ou
// recusa com o motivo. Aceitar já cria o agendamento no pátio (src/patio.js) e devolve o link do motorista.
//   rascunho → enviada → aceita (→ no pátio → coletada, pela visita do pátio) | recusada | cancelada
// Situação de acompanhamento: aguardando confirmação, sem resposta (mais de 4 h), confirmada, atrasada (passou da janela
// sem chegar), no pátio, coletada, não compareceu, recusada, cancelada.
const crypto = require('crypto');
const pool = require('./db');
const patio = require('./patio');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const novoToken = () => crypto.randomBytes(18).toString('base64url');
const SEM_RESPOSTA_H = 4;
const REQ_SISTEMA = { usuario: { id: null, nome: 'Ordem de coleta', perfil: 'admin', pode_ver_todos: true } };
const SITUACOES = ['Rascunho', 'Aguardando confirmação', 'Sem resposta', 'Confirmada', 'Atrasada', 'No pátio', 'Coletada', 'Não compareceu', 'Recusada', 'Cancelada'];
const FOB = "COALESCE(f.frete_cif_fob, '') NOT IN ('FOB', 'Destinatário', 'Destinatario', 'Sem frete', 'Próprio destinatário')";
const ABERTAS = "o.status IN ('rascunho', 'enviada', 'aceita') AND (o.visita_id IS NULL OR NOT EXISTS (SELECT 1 FROM patio_visitas v WHERE v.id = o.visita_id AND v.status IN ('saiu', 'cancelado', 'nao_compareceu')))";

// Situação de acompanhamento (sem banco).
function situacao(o, agora = Date.now()) {
  if (o.status === 'rascunho') return 'Rascunho';
  if (o.status === 'cancelada') return 'Cancelada';
  if (o.status === 'recusada') return 'Recusada';
  if (o.status === 'enviada') {
    if (o.coletar_em && new Date(o.coletar_em).getTime() + (o.janela_min || 0) * 60000 < agora) return 'Atrasada';
    return o.enviada_em && agora - new Date(o.enviada_em).getTime() > SEM_RESPOSTA_H * 3600000 ? 'Sem resposta' : 'Aguardando confirmação';
  }
  const v = o.visita_status;
  if (v === 'saiu') return 'Coletada';
  if (v === 'nao_compareceu') return 'Não compareceu';
  if (v === 'cancelado') return 'Cancelada';
  if (['aguardando', 'chamado', 'em_doca', 'liberado'].includes(v)) return 'No pátio';
  const prev = o.previsto_em || o.coletar_em;
  if (prev && new Date(prev).getTime() + (o.janela_min || 0) * 60000 < agora) return 'Atrasada';
  return 'Confirmada';
}

const CAMPOS = `o.*, v.status AS visita_status, v.codigo AS visita_codigo, v.chegada_em, v.saida_em,
  to_char(o.coletar_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') AS coletar_local,
  to_char(o.previsto_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') AS previsto_local`;
const comSituacao = (o) => (o ? { ...o, situacao: situacao(o) } : o);

async function buscar(id) {
  const { rows: [o] } = await pool.query(`SELECT ${CAMPOS} FROM ordens_coleta o LEFT JOIN patio_visitas v ON v.id = o.visita_id WHERE o.id = $1`, [id]);
  if (!o) throw falha('Ordem de coleta não encontrada.', 404);
  return comSituacao(o);
}
async function porToken(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ''))) throw falha('Link inválido.', 404);
  const { rows: [o] } = await pool.query(`SELECT ${CAMPOS} FROM ordens_coleta o LEFT JOIN patio_visitas v ON v.id = o.visita_id WHERE o.token = $1`, [token]);
  if (!o) throw falha('Esta ordem de coleta não existe mais.', 404);
  return comSituacao(o);
}

async function listar(q = {}) {
  const p = []; const cond = [];
  if (String(q.transportadora || '').trim()) { p.push(`%${String(q.transportadora).trim()}%`); cond.push(`o.transportadora ILIKE $${p.length}`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.de || '')) { p.push(q.de); cond.push(`COALESCE(o.previsto_em, o.coletar_em, o.criado_em) >= $${p.length}::date`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.ate || '')) { p.push(q.ate); cond.push(`COALESCE(o.previsto_em, o.coletar_em, o.criado_em) < $${p.length}::date + 1`); }
  const { rows } = await pool.query(`SELECT ${CAMPOS} FROM ordens_coleta o LEFT JOIN patio_visitas v ON v.id = o.visita_id
    ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY COALESCE(o.previsto_em, o.coletar_em, o.criado_em) DESC, o.id DESC LIMIT 1000`, p);
  const lista = rows.map(comSituacao);
  const contagem = Object.fromEntries(SITUACOES.map((s) => [s, lista.filter((o) => o.situacao === s).length]));
  const filtro = String(q.situacao || '');
  return { situacoes: SITUACOES, contagem, ordens: filtro ? lista.filter((o) => o.situacao === filtro) : lista };
}

// Notas que podem entrar numa ordem: CIF, emitidas nos últimos 45 dias, sem saída, sem CT-e e fora de outra ordem aberta.
async function candidatas(req, q = {}) {
  const { consultaCliente } = require('./permissoes');
  const p = []; const cond = [];
  if (String(q.transportadora || '').trim()) { p.push(`%${String(q.transportadora).trim()}%`); cond.push(`COALESCE(f.transportadora, f.transportadora_nfe) ILIKE $${p.length}`); }
  if (String(q.busca || '').trim()) { p.push(`%${String(q.busca).trim()}%`); cond.push(`(f.numero_nf ILIKE $${p.length} OR f.cliente ILIKE $${p.length} OR f.cidade ILIKE $${p.length} OR f.numero_pedido ILIKE $${p.length})`); }
  const { rows } = await consultaCliente(req, `SELECT f.id, LTRIM(f.numero_nf, '0') AS numero, f.numero_pedido AS pedido, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, f.cliente, f.cidade, f.uf,
      f.qtd_volumes AS volumes, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso, f.cubagem_m3::float AS m3, f.valor_faturado::float AS valor,
      COALESCE(f.transportadora, f.transportadora_nfe) AS transportadora, f.redespacho
    FROM fretes f
    WHERE f.frete_principal_id IS NULL AND COALESCE(f.numero_nf, '') <> '' AND f.nf_cancelada IS NOT TRUE AND f.nf_entrada IS NOT TRUE AND ${FOB}
      AND f.data_saida IS NULL AND f.data_entrega IS NULL AND f.chave_cte IS NULL AND f.cte_coberto_por IS NULL
      AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') AND f.data_emissao_nf >= CURRENT_DATE - 45
      AND NOT EXISTS (SELECT 1 FROM ordens_coleta o WHERE f.id = ANY(o.frete_ids) AND ${ABERTAS})
      ${cond.length ? `AND ${cond.join(' AND ')}` : ''}
    ORDER BY transportadora NULLS LAST, f.data_emissao_nf, f.numero_nf LIMIT 1500`, p);
  return rows;
}

// E-mail da transportadora pelo cadastro (nome parecido).
async function emailDaTransportadora(nome) {
  if (!String(nome || '').trim()) return null;
  const { rows } = await pool.query(`SELECT email FROM transportadoras WHERE NULLIF(TRIM(email), '') IS NOT NULL
    AND (UPPER(razao_social) = UPPER($1) OR UPPER(nome_fantasia) = UPPER($1) OR UPPER($1) LIKE '%' || UPPER(razao_social) || '%' OR UPPER(razao_social) LIKE '%' || UPPER($1) || '%')
    ORDER BY (UPPER(razao_social) = UPPER($1)) DESC LIMIT 1`, [String(nome).trim()]).catch(() => ({ rows: [] }));
  return rows[0]?.email || null;
}

function dados(b) {
  const coletar = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(b.coletar_em || '')) ? String(b.coletar_em).slice(0, 16) : null;
  return {
    transportadora: texto(b.transportadora, 160), email_para: texto(b.email_para, 250), coletar_em: coletar,
    janela_min: Math.min(1440, Math.max(0, parseInt(b.janela_min ?? 120, 10) || 0)),
    tipo_veiculo: patio.VEICULOS[b.tipo_veiculo] ? b.tipo_veiculo : null, observacao: texto(b.observacao, 2000),
  };
}

// Cria (ou altera, enquanto rascunho/enviada sem resposta) a ordem com as notas escolhidas (ids dos registros).
async function salvar(req, id, b, usuario) {
  const d = dados(b);
  const ids = [...new Set((Array.isArray(b.frete_ids) ? b.frete_ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 300);
  if (!ids.length) throw falha('Escolha pelo menos uma nota para a transportadora coletar.');
  if (!d.coletar_em) throw falha('Informe a data e a hora em que a carga estará pronta para a coleta.');
  if (d.email_para && !emailOk(d.email_para)) throw falha('E-mail da transportadora inválido.');
  const { consultaCliente } = require('./permissoes');
  const { rows: notas } = await consultaCliente(req, `SELECT f.id, LTRIM(f.numero_nf, '0') AS numero, f.qtd_volumes, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso, f.cubagem_m3::float AS m3,
      f.valor_faturado::float AS valor, COALESCE(f.transportadora, f.transportadora_nfe) AS transportadora FROM fretes f WHERE f.id = ANY($1)`, [ids]);
  if (!notas.length) throw falha('Nenhuma das notas foi encontrada.');
  const outras = await pool.query(`SELECT o.id, n FROM ordens_coleta o, unnest(o.frete_ids) n WHERE n = ANY($1) AND ${ABERTAS} AND o.id <> COALESCE($2, 0)`, [notas.map((n) => n.id), id]);
  if (outras.rows.length) throw falha(`Uma ou mais notas já estão na ordem de coleta nº ${outras.rows[0].id}. Tire de lá antes.`, 409);
  if (!d.transportadora) d.transportadora = notas.find((n) => n.transportadora)?.transportadora || null;
  if (!d.transportadora) throw falha('Informe a transportadora.');
  if (!d.email_para) d.email_para = await emailDaTransportadora(d.transportadora);
  const tot = (k) => notas.reduce((s, n) => s + (Number(n[k]) || 0), 0);
  const vals = [d.transportadora, d.email_para, notas.map((n) => n.numero), notas.map((n) => n.id), Math.round(tot('qtd_volumes')) || null, Math.round(tot('peso') * 100) / 100 || null,
    Math.round(tot('valor') * 100) / 100 || null, Math.round(tot('m3') * 1000) / 1000 || null, d.coletar_em, d.janela_min, d.tipo_veiculo, d.observacao];
  if (id) {
    const atual = await buscar(id);
    if (!['rascunho', 'enviada'].includes(atual.status)) throw falha('A transportadora já respondeu esta ordem; cancele e faça outra.', 409);
    await pool.query(`UPDATE ordens_coleta SET transportadora = $1, email_para = $2, notas = $3, frete_ids = $4, volumes = $5, peso_kg = $6, valor = $7, cubagem_m3 = $8,
      coletar_em = ($9::timestamp AT TIME ZONE 'America/Sao_Paulo'), janela_min = $10, tipo_veiculo = $11, observacao = $12, atualizado_em = NOW() WHERE id = $13`, [...vals, id]);
    return buscar(id);
  }
  const { rows: [o] } = await pool.query(`INSERT INTO ordens_coleta (transportadora, email_para, notas, frete_ids, volumes, peso_kg, valor, cubagem_m3, coletar_em, janela_min, tipo_veiculo, observacao, token, criado_por_nome)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ($9::timestamp AT TIME ZONE 'America/Sao_Paulo'), $10, $11, $12, $13, $14) RETURNING id`, [...vals, novoToken(), usuario]);
  return buscar(o.id);
}

async function empresa() {
  const { rows: [e] } = await pool.query('SELECT razao_social, nome_fantasia, cnpj, telefone, email, endereco, numero, complemento, bairro, municipio, uf, cep, logo FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
  return e || {};
}
const enderecoEmpresa = (e) => [[e.endereco, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro, [e.municipio, e.uf].filter(Boolean).join('/'), e.cep ? `CEP ${e.cep}` : null].filter(Boolean).join(' - ');
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// Manda a ordem por e-mail (com o documento anexo) e marca como enviada.
async function enviar(id, linkBase, usuario, { para } = {}) {
  const o = await buscar(id);
  if (['cancelada', 'recusada'].includes(o.status)) throw falha('Esta ordem está encerrada.', 409);
  const email = String(para || o.email_para || '').trim();
  if (!emailOk(email)) throw falha('Informe o e-mail da transportadora para mandar a ordem.');
  const e = await empresa();
  const nomeEmp = e.nome_fantasia || e.razao_social || 'Expedição';
  const link = `${linkBase}/coleta.html?t=${o.token}`;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:Arial,sans-serif; max-width:560px; margin:0 auto;">
    <h2 style="color:#1F4E78;">Ordem de coleta nº ${o.id} — ${esc(nomeEmp)}</h2>
    <p>Olá, ${esc(o.transportadora)}.</p>
    <p>Temos <b>${o.notas.length} nota(s)</b> para coletar${o.volumes ? `, ${o.volumes} volume(s)` : ''}${o.peso_kg ? `, ${Number(o.peso_kg).toLocaleString('pt-BR')} kg` : ''}.</p>
    <p><b>Pronta para coleta:</b> ${esc(quando(o.coletar_em))}${o.janela_min ? ` (janela de ${Math.round(o.janela_min / 60 * 10) / 10} h)` : ''}<br><b>Local:</b> ${esc(enderecoEmpresa(e))}</p>
    <p>Confirme pelo botão abaixo informando a data e a hora, a placa e o motorista (ou recuse, se não puder atender). O documento da ordem vai anexo.</p>
    <p style="margin:22px 0;"><a href="${esc(link)}" style="background:#2f5bea; color:#fff; padding:11px 20px; border-radius:6px; text-decoration:none;">Confirmar a coleta</a></p>
    ${o.observacao ? `<p><b>Observações:</b> ${esc(o.observacao)}</p>` : ''}
    <p style="color:#888; font-size:12px; margin-top:26px;">${esc(nomeEmp)}${e.telefone ? ` · ${esc(e.telefone)}` : ''}${e.email ? ` · ${esc(e.email)}` : ''}</p></div>`;
  await require('./email').enviarRelatorio({ para: email, assunto: `Ordem de coleta nº ${o.id} — ${nomeEmp}`, html,
    anexos: [{ filename: `ordem-coleta-${o.id}.html`, content: await documentoDe(o, link), contentType: 'text/html; charset=utf-8' }] })
    .catch((e) => { throw falha(`Não consegui mandar o e-mail: ${e.message} Você pode copiar o link da ordem e mandar por WhatsApp.`, 502); });
  await pool.query(`UPDATE ordens_coleta SET status = CASE WHEN status = 'rascunho' THEN 'enviada' ELSE status END, email_para = $2, enviada_em = NOW(), enviada_por = $3, atualizado_em = NOW() WHERE id = $1`, [id, email, usuario]);
  return buscar(id);
}

async function cancelar(id, motivo, usuario) {
  const o = await buscar(id);
  if (['cancelada', 'recusada'].includes(o.status)) throw falha('Esta ordem já está encerrada.', 409);
  if (o.visita_id && ['aguardando', 'chamado', 'em_doca', 'liberado', 'saiu'].includes(o.visita_status)) throw falha('O caminhão já está no pátio (ou já saiu): a ordem não pode mais ser cancelada.', 409);
  if (o.visita_id && o.visita_status === 'agendado') await patio.cancelar(o.visita_id, `Ordem de coleta ${id} cancelada${motivo ? `: ${motivo}` : ''}`, usuario).catch(() => {});
  await pool.query(`UPDATE ordens_coleta SET status = 'cancelada', motivo_recusa = COALESCE($2, motivo_recusa), atualizado_em = NOW() WHERE id = $1`, [id, texto(motivo, 500)]);
  return buscar(id);
}

// ---------- Página da transportadora (pelo link) ----------
async function publico(token, { marcarAberta = true } = {}) {
  const o = await porToken(token);
  if (marcarAberta && !o.aberta_em) await pool.query('UPDATE ordens_coleta SET aberta_em = NOW() WHERE id = $1', [o.id]);
  const e = await empresa();
  const { rows: notas } = await pool.query(`SELECT LTRIM(numero_nf, '0') AS numero, cliente, cidade, uf, qtd_volumes AS volumes, COALESCE(peso_bruto, peso_kg)::float AS peso
    FROM fretes WHERE id = ANY($1) ORDER BY numero_nf`, [o.frete_ids]);
  return {
    numero: o.id, status: o.status, situacao: o.situacao, transportadora: o.transportadora, empresa: e.nome_fantasia || e.razao_social || '', endereco: enderecoEmpresa(e), telefone: e.telefone || null,
    coletar_em: o.coletar_local, janela_min: o.janela_min, tipo_veiculo: o.tipo_veiculo, veiculos: patio.VEICULOS, observacao: o.observacao,
    volumes: o.volumes, peso_kg: o.peso_kg != null ? Number(o.peso_kg) : null, cubagem_m3: o.cubagem_m3 != null ? Number(o.cubagem_m3) : null, notas,
    resposta: o.respondida_em ? { em: o.respondida_em, nome: o.resposta_nome, placa: o.placa, motorista_nome: o.motorista_nome, previsto_em: o.previsto_local, motivo: o.motivo_recusa, obs: o.resposta_obs } : null,
    pode_responder: ['enviada', 'aceita'].includes(o.status) && (!o.visita_status || o.visita_status === 'agendado'),
    motorista_codigo: o.visita_codigo || null,
  };
}

async function aceitar(token, b) {
  const o = await porToken(token);
  if (!['enviada', 'aceita'].includes(o.status)) throw falha(o.status === 'rascunho' ? 'Esta ordem ainda não foi liberada.' : 'Esta ordem já foi encerrada.', 409);
  if (o.visita_id && o.visita_status !== 'agendado') throw falha('O caminhão já passou pela portaria: não dá mais para alterar.', 409);
  const previsto = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(b.previsto_em || '')) ? String(b.previsto_em).slice(0, 16) : null;
  if (!previsto) throw falha('Informe a data e a hora em que o caminhão vai chegar.');
  const nome = texto(b.nome, 120); if (!nome) throw falha('Informe o seu nome.');
  const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) || null;
  const visita = { operacao: 'carga', previsto_em: previsto, janela_min: o.janela_min || 60, transportadora: o.transportadora, placa, placa_carreta: b.placa_carreta,
    tipo_veiculo: b.tipo_veiculo || o.tipo_veiculo, motorista_nome: b.motorista_nome, motorista_documento: b.motorista_documento, motorista_telefone: b.motorista_telefone,
    pedido: `Ordem de coleta ${o.id}`, notas: o.notas.join(' '), observacao: [`Ordem de coleta nº ${o.id}`, texto(b.obs, 500)].filter(Boolean).join(' — ') };
  const quem = `${nome} (${o.transportadora || 'transportadora'})`;
  const v = o.visita_id ? await patio.atualizar(REQ_SISTEMA, o.visita_id, visita, quem) : await patio.criar(REQ_SISTEMA, visita, quem);
  await pool.query(`UPDATE ordens_coleta SET status = 'aceita', respondida_em = NOW(), resposta_nome = $2, placa = $3, motorista_nome = $4, motorista_documento = $5, motorista_telefone = $6,
      previsto_em = ($7::timestamp AT TIME ZONE 'America/Sao_Paulo'), resposta_obs = $8, motivo_recusa = NULL, visita_id = $9, atualizado_em = NOW() WHERE id = $1`,
  [o.id, nome, placa, texto(b.motorista_nome, 120), texto(b.motorista_documento, 20), texto(b.motorista_telefone, 20), previsto, texto(b.obs, 500), v.id]);
  return publico(token, { marcarAberta: false });
}

async function recusar(token, b) {
  const o = await porToken(token);
  if (o.status !== 'enviada') throw falha('Esta ordem não está mais aguardando resposta.', 409);
  const motivo = texto(b.motivo, 500); if (!motivo) throw falha('Conte o motivo da recusa.');
  const nome = texto(b.nome, 120); if (!nome) throw falha('Informe o seu nome.');
  await pool.query(`UPDATE ordens_coleta SET status = 'recusada', respondida_em = NOW(), resposta_nome = $2, motivo_recusa = $3, atualizado_em = NOW() WHERE id = $1`, [o.id, nome, motivo]);
  return publico(token, { marcarAberta: false });
}

// ---------- Documento (impressão / anexo do e-mail) ----------
function documento(o, e, link = null) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, c = 0) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const notas = o._notas || [];
  const logo = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(String(e.logo || '')) ? `<img src="${e.logo}" alt="" style="max-height:52px; max-width:160px;">` : '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ordem de coleta nº ${o.id}</title><style>
    @page { size: A4; margin: 14mm; } body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
    .cab { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111; padding-bottom: 8px; }
    h1 { font-size: 20px; margin: 0; } .num { font-size: 15px; font-weight: 700; text-align: right; }
    .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #111; margin-top: 10px; }
    .grade div { padding: 6px 8px; border-right: 1px solid #111; border-bottom: 1px solid #111; } .grade div:nth-child(2n) { border-right: none; }
    .grade b { display: block; font-size: 10px; text-transform: uppercase; color: #444; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; } th, td { border: 1px solid #111; padding: 4px 6px; text-align: left; } th { background: #eee; font-size: 11px; }
    td.n { text-align: right; } tfoot td { font-weight: 700; }
    .ass { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 46px; } .ass div { border-top: 1px solid #111; padding-top: 4px; text-align: center; }
    .acoes { margin-bottom: 10px; } @media print { .acoes { display: none; } } @media screen { body { padding: 18px; max-width: 920px; margin: 0 auto; } }
  </style></head><body>
  <div class="acoes"><button type="button" onclick="window.print()">Imprimir</button></div>
  <div class="cab"><div style="display:flex; gap:12px; align-items:center;">${logo}<div><h1>ORDEM DE COLETA</h1><div>${esc(e.razao_social || e.nome_fantasia || '')}${e.cnpj ? ` · CNPJ ${esc(e.cnpj)}` : ''}</div></div></div>
    <div class="num">Nº ${o.id}<br><span style="font-weight:400; font-size:11px;">emitida em ${esc(quando(o.criado_em))}</span></div></div>
  <div class="grade">
    <div><b>Transportadora</b>${esc(o.transportadora)}</div><div><b>Situação</b>${esc(o.situacao || '')}</div>
    <div><b>Local da coleta</b>${esc(enderecoEmpresa(e))}</div><div><b>Contato</b>${esc([e.telefone, e.email].filter(Boolean).join(' · '))}</div>
    <div><b>Pronta para coleta</b>${esc(quando(o.coletar_em))}${o.janela_min ? ` (janela de ${num(o.janela_min / 60, 1)} h)` : ''}</div><div><b>Veículo pedido</b>${esc(patio.VEICULOS[o.tipo_veiculo] || 'Qualquer')}</div>
    <div><b>Chegada confirmada</b>${esc(quando(o.previsto_em))}</div><div><b>Placa / motorista</b>${esc([o.placa, o.motorista_nome, o.motorista_documento].filter(Boolean).join(' · '))}</div>
  </div>
  <table><thead><tr><th>NF-e</th><th>Cliente</th><th>Destino</th><th>Volumes</th><th>Peso (kg)</th><th>Valor (R$)</th></tr></thead><tbody>
  ${notas.map((n) => `<tr><td>${esc(n.numero)}</td><td>${esc(n.cliente)}</td><td>${esc([n.cidade, n.uf].filter(Boolean).join('/'))}</td><td class="n">${num(n.volumes)}</td><td class="n">${num(n.peso, 1)}</td><td class="n">${num(n.valor, 2)}</td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3">${notas.length} nota(s)</td><td class="n">${num(o.volumes)}</td><td class="n">${num(o.peso_kg, 1)}</td><td class="n">${num(o.valor, 2)}</td></tr></tfoot></table>
  ${o.observacao ? `<p><b>Observações:</b> ${esc(o.observacao)}</p>` : ''}
  ${link ? `<p>Confirme a coleta em: ${esc(link)}</p>` : ''}
  <div class="ass"><div>Expedição (${esc(e.nome_fantasia || e.razao_social || '')})</div><div>Motorista (nome e documento)</div></div>
  </body></html>`;
}
async function documentoDe(o, link = null) {
  const { rows } = await pool.query(`SELECT LTRIM(numero_nf, '0') AS numero, cliente, cidade, uf, qtd_volumes AS volumes, COALESCE(peso_bruto, peso_kg)::float AS peso, valor_faturado::float AS valor
    FROM fretes WHERE id = ANY($1) ORDER BY numero_nf`, [o.frete_ids]);
  return documento({ ...o, _notas: rows }, await empresa(), link);
}

module.exports = { porToken, situacao, SITUACOES, listar, candidatas, buscar, salvar, enviar, cancelar, publico, aceitar, recusar, documento, documentoDe, emailDaTransportadora };
