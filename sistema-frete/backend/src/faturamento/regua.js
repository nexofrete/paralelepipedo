// Régua de cobrança: lembretes automáticos das faturas em aberto, por e-mail
// (com a fatura, o boleto e o PIX) e WhatsApp (com o PIX copia e cola).
//  • Etapas em dias em relação ao vencimento (−3 = três dias antes; 0 = no dia;
//    3 = três dias depois). Cada etapa vai uma vez por canal.
//  • Roda uma vez por dia, a partir da hora escolhida; para sozinha quando a
//    fatura é paga (baixa manual, retorno do boleto ou conciliação do extrato).
//  • Não cobra cliente pausado nem fatura com pagamento prometido.
//  • Etapa que passou há mais de "janela" dias não é mandada atrasada (ex.: ao
//    ligar a régua, quem está 60 dias vencido não recebe o "vence em 3 dias").
const pool = require('../db');

const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const isoDe = (v) => String(v instanceof Date ? v.toISOString() : v || '').slice(0, 10);
const diaBr = (v) => isoDe(v).split('-').reverse().join('/');
const dias = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
// Celular brasileiro em +55DDXXXXXXXXX (WhatsApp só vai para celular).
function celular(fone) {
  let d = String(fone || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d.length === 11 && d[2] === '9' ? `+55${d}` : null;
}

const ETAPAS_PADRAO = [
  { dias: -3, ativo: true, titulo: 'Lembrete: sua fatura {quando}',
    texto: 'Olá, {cliente}. Passando para lembrar que a fatura {fatura}, de {valor}, {quando} ({vencimento}). A fatura com o boleto e o PIX segue abaixo.' },
  { dias: 0, ativo: true, titulo: 'Sua fatura {quando}',
    texto: 'Olá, {cliente}. A fatura {fatura}, de {valor}, {quando} ({vencimento}). Se já pagou, por favor desconsidere esta mensagem.' },
  { dias: 3, ativo: true, titulo: 'Fatura em atraso',
    texto: 'Olá, {cliente}. Não identificamos o pagamento da fatura {fatura}, de {valor}, que {quando} ({vencimento}). Se já pagou, por favor nos envie o comprovante.' },
  { dias: 10, ativo: true, titulo: 'Fatura vencida há {dias} dias',
    texto: 'Olá, {cliente}. A fatura {fatura}, de {valor}, está vencida desde {vencimento}. Pedimos que regularize o pagamento ou fale com a gente para combinarmos: {contato}.' },
];
// "vence em 3 dias", "vence amanhã", "vence hoje", "venceu ontem", "venceu há 5 dias" — calculado no dia do envio.
function quando(atraso) {
  if (atraso < -1) return `vence em ${-atraso} dias`;
  if (atraso === -1) return 'vence amanhã';
  if (atraso === 0) return 'vence hoje';
  if (atraso === 1) return 'venceu ontem';
  return `venceu há ${atraso} dias`;
}
const CONFIG_PADRAO = { ativo: false, hora: 8, email: true, whatsapp: false, copia: '', janela: 7, etapas: ETAPAS_PADRAO, ultima_execucao: null, ultimo_resumo: null };

async function config() {
  const { rows } = await pool.query('SELECT regua_config FROM empresa WHERE id = 1');
  const c = rows[0]?.regua_config || {};
  return { ...CONFIG_PADRAO, ...c, etapas: Array.isArray(c.etapas) && c.etapas.length ? c.etapas : ETAPAS_PADRAO };
}

function lerEtapas(lista) {
  if (!Array.isArray(lista) || !lista.length) throw falha('Deixe pelo menos uma etapa na régua.');
  const etapas = lista.slice(0, 10).map((e) => {
    const d = parseInt(e.dias, 10);
    if (!Number.isFinite(d) || d < -30 || d > 120) throw falha('Os dias de cada etapa vão de −30 (antes do vencimento) a 120 (depois).');
    const titulo = String(e.titulo || '').trim().slice(0, 120); const texto = String(e.texto || '').trim().slice(0, 1000);
    if (!titulo || !texto) throw falha(`Preencha o assunto e a mensagem da etapa de ${d} dia(s).`);
    return { dias: d, ativo: e.ativo !== false, titulo, texto };
  }).sort((a, b) => a.dias - b.dias);
  if (new Set(etapas.map((e) => e.dias)).size !== etapas.length) throw falha('Há duas etapas no mesmo dia.');
  return etapas;
}

async function salvarConfig(b = {}) {
  const atual = await config();
  const { rows: [bruto] } = await pool.query('SELECT regua_config FROM empresa WHERE id = 1');
  const etapasGravadas = bruto?.regua_config?.etapas;   // sem edição, fica com o padrão (que pode melhorar nas versões novas)
  const copia = String(b.copia ?? atual.copia ?? '').trim();
  if (copia && !copia.split(/[;,]/).every((x) => emailValido(x))) throw falha('E-mail de cópia inválido.');
  const c = {
    ...atual, ativo: !!b.ativo, hora: Math.min(Math.max(parseInt(b.hora, 10) || 8, 6), 20), email: b.email !== false, whatsapp: !!b.whatsapp,
    copia: copia.slice(0, 250), janela: Math.min(Math.max(parseInt(b.janela, 10) || 7, 1), 30), etapas: b.etapas ? lerEtapas(b.etapas) : etapasGravadas,
  };
  if (c.ativo && !c.email && !c.whatsapp) throw falha('Escolha pelo menos um canal (e-mail ou WhatsApp).');
  if (b.etapas && JSON.stringify(c.etapas) === JSON.stringify(ETAPAS_PADRAO)) c.etapas = undefined;
  await pool.query('UPDATE empresa SET regua_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return { ...c, etapas: c.etapas || ETAPAS_PADRAO };
}

function preencher(modelo, v) {
  return String(modelo).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m));
}

// Faturas em aberto com o contato de cobrança e o que já foi mandado.
async function faturasEmAberto({ faturaId = null } = {}) {
  const { rows: [e] } = await pool.query('SELECT cte_demonstracao FROM empresa WHERE id = 1');
  const { rows } = await pool.query(
    `SELECT f.id, f.numero, f.tomador_doc, f.tomador_nome, f.tomador_email, f.vencimento::text AS vencimento, f.status, f.demonstracao,
            (f.valor_bruto - f.desconto - f.valor_pago)::float AS saldo, f.cobranca_pausada_ate::text AS pausada_ate, f.cobranca_motivo AS fatura_motivo,
            c.email AS cli_email, c.telefone AS cli_fone, c.cobranca_email, c.cobranca_whatsapp, COALESCE(c.cobranca_pausada, FALSE) AS cli_pausado, c.cobranca_motivo AS cli_motivo,
            COALESCE((SELECT json_agg(json_build_object('etapa', x.etapa, 'canal', x.canal, 'status', x.status)) FROM cobranca_envios x WHERE x.fatura_id = f.id AND (x.automatico OR x.status = 'enviado')), '[]') AS enviados
       FROM faturas_transporte f LEFT JOIN clientes c ON c.documento = f.tomador_doc
      WHERE f.status IN ('aberta', 'parcial') AND (f.valor_bruto - f.desconto - f.valor_pago) > 0.005
        AND ($1::int IS NULL OR f.id = $1) AND ($1::int IS NOT NULL OR f.demonstracao = $2)
      ORDER BY f.vencimento, f.numero`, [faturaId, !!e?.cte_demonstracao]);
  return rows.map((f) => {
    const emails = [...new Set(String(f.cobranca_email || f.tomador_email || f.cli_email || '').split(/[;,]/).map((x) => x.trim().toLowerCase()).filter(emailValido))];
    return { ...f, emails, fone: celular(f.cobranca_whatsapp || f.cli_fone) };
  });
}

// O que a régua faz hoje com cada fatura (a prévia e o envio usam a mesma conta).
function decidir(f, cfg, hoje, { whatsappOk = true } = {}) {
  const atraso = dias(hoje, f.vencimento);
  const etapas = cfg.etapas.filter((x) => x.ativo).sort((a, b) => a.dias - b.dias);
  // Lembrete de antes do vencimento (ou do dia) não vale depois que a fatura venceu.
  const etapa = [...etapas].reverse().find((x) => x.dias <= atraso && !(x.dias <= 0 && atraso > 0));
  const base = { fatura_id: f.id, numero: f.numero, cliente: f.tomador_nome, doc: f.tomador_doc, vencimento: f.vencimento, saldo: centavos(f.saldo), atraso };
  if (!etapa) {
    const proxima = etapas.find((x) => x.dias > atraso);
    const data = proxima && new Date(Date.parse(`${f.vencimento}T12:00:00Z`) + proxima.dias * 86400000).toISOString().slice(0, 10);
    return { ...base, acao: 'aguardar', motivo: proxima ? `próximo lembrete em ${diaBr(data)} (${proxima.dias < 0 ? `${-proxima.dias} dia(s) antes` : proxima.dias ? `${proxima.dias} dia(s) depois` : 'no dia'} do vencimento)` : 'nenhuma etapa ativa' };
  }
  if (atraso - etapa.dias > cfg.janela) return { ...base, etapa: etapa.dias, acao: 'fora_da_janela', motivo: `a etapa de ${etapa.dias} dia(s) passou há mais de ${cfg.janela} dias` };
  if (f.cli_pausado) return { ...base, etapa: etapa.dias, acao: 'pausada', motivo: `cliente pausado${f.cli_motivo ? `: ${f.cli_motivo}` : ''}` };
  if (f.pausada_ate && f.pausada_ate >= hoje) return { ...base, etapa: etapa.dias, acao: 'pausada', motivo: `pagamento prometido até ${diaBr(f.pausada_ate)}${f.fatura_motivo ? ` — ${f.fatura_motivo}` : ''}` };
  const feitos = (f.enviados || []).filter((x) => ['enviado', 'sem_contato'].includes(x.status));
  // Já mandou esta etapa (ou uma posterior) neste canal?
  const jaFoi = (canal) => feitos.some((x) => x.canal === canal && x.etapa >= etapa.dias);
  const ativos = [cfg.email && 'email', cfg.whatsapp && whatsappOk && 'whatsapp'].filter(Boolean);
  const contato = { email: f.emails.join(', ') || null, whatsapp: f.fone };
  const ja = ativos.filter((c) => jaFoi(c));
  // Pendentes: canais ativos ainda não mandados nesta etapa e com contato.
  const pendentes = ativos.filter((c) => !jaFoi(c) && contato[c]).map((c) => ({ canal: c, destino: contato[c] }));
  // ("sem contato" registrado não bloqueia: se o contato for cadastrado, a etapa ainda sai.)
  if (!pendentes.length && ja.length) return { ...base, etapa: etapa.dias, acao: 'ja_enviada', motivo: `etapa de ${etapa.dias} dia(s) já enviada` };
  if (!pendentes.length) {
    return { ...base, etapa: etapa.dias, acao: ativos.length ? 'sem_contato' : 'aguardar', canais: [],
      motivo: ativos.length ? `o cliente não tem ${ativos.map((c) => (c === 'email' ? 'e-mail' : 'celular')).join(' nem ')} de cobrança` : 'nenhum canal ligado' };
  }
  return { ...base, etapa: etapa.dias, titulo: etapa.titulo, acao: 'enviar', canais: pendentes, motivo: '' };
}

async function whatsappLigado() {
  try { const w = await require('../whatsapp').buscarConfiguracao(); return !!(w.ativo && w.twilio_account_sid && w.twilio_auth_token); } catch { return false; }
}

async function previa({ hoje = hojeBr() } = {}) {
  const cfg = await config();
  const whatsappOk = await whatsappLigado();
  const lista = (await faturasEmAberto()).map((f) => decidir(f, cfg, hoje, { whatsappOk }));
  const conta = (a) => lista.filter((x) => x.acao === a).length;
  return { hoje, ativo: cfg.ativo, whatsapp_desligado: cfg.whatsapp && !whatsappOk, resumo: { enviar: conta('enviar'), sem_contato: conta('sem_contato'), pausadas: conta('pausada'), ja_enviadas: conta('ja_enviada') }, faturas: lista };
}

// Monta e manda a mensagem de uma etapa por um canal.
async function mandar(fatura, etapa, canal, destino, cfg) {
  const fat = require('./faturamento');
  const f = await fat.carregar(fatura.id);
  const { rows: [e] } = await pool.query('SELECT razao_social, nome_fantasia, telefone, email, pix_chave FROM empresa WHERE id = 1');
  const atraso = dias(hojeBr(), isoDe(f.vencimento));
  const v = {
    cliente: f.tomador_nome || 'cliente', fatura: f.numero, valor: brl(f.saldo), vencimento: diaBr(f.vencimento), dias: Math.abs(atraso), quando: quando(atraso),
    empresa: e.nome_fantasia || e.razao_social || '', contato: [e.telefone, e.email].filter(Boolean).join(' · ') || (e.nome_fantasia || e.razao_social || ''),
  };
  const titulo = preencher(etapa.titulo, v); const texto = preencher(etapa.texto, v);
  if (canal === 'email') {
    await require('./envioFatura').enviarFaturaEmail(f, { para: destino, copia: cfg.copia || undefined, assunto: `${titulo} — fatura ${f.numero} — ${v.empresa}`, mensagem: { titulo, paragrafos: [texto] } });
    return;
  }
  const { cobrancaPix } = require('./faturaHtml');
  const { rows: [emp] } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  const pix = await cobrancaPix(f, emp).catch(() => null);
  const linhas = [`*${titulo}*`, texto, `Fatura ${f.numero} · ${v.valor} · vencimento ${v.vencimento}`];
  if (pix) linhas.push('', 'PIX copia e cola:', pix.copiaECola);
  if (f.boleto_linha && ['gerado', 'remetido', 'registrado'].includes(f.boleto_status)) linhas.push('', `Boleto: ${require('../boleto/boleto').formatarLinha(f.boleto_linha)}`);
  linhas.push('', `${v.empresa}${v.contato && v.contato !== v.empresa ? ` · ${v.contato}` : ''}`);
  await require('../whatsapp').enviarMensagem(linhas.join('\n'), destino);
}

// Roda a régua: manda o que a prévia diz (cada envio é reservado antes, então
// duas execuções ao mesmo tempo não mandam em dobro).
async function processar({ hoje = hojeBr(), usuarioNome = 'Régua de cobrança' } = {}) {
  const cfg = await config();
  const whatsappOk = await whatsappLigado();
  const faturas = await faturasEmAberto();
  const r = { enviados: 0, erros: 0, sem_contato: 0, detalhes: [], whatsapp_desligado: cfg.whatsapp && !whatsappOk };
  for (const f of faturas) {
    const d = decidir(f, cfg, hoje, { whatsappOk });
    if (!['enviar', 'sem_contato'].includes(d.acao)) continue;
    const etapa = cfg.etapas.find((x) => x.dias === d.etapa);
    if (d.acao === 'sem_contato') {
      const { rowCount } = await pool.query(`INSERT INTO cobranca_envios (fatura_id, etapa, canal, destino, status, erro, usuario_nome) VALUES ($1,$2,'nenhum','-','sem_contato',$3,$4)
        ON CONFLICT (fatura_id, etapa, canal) WHERE automatico AND status IN ('enviado', 'sem_contato') DO NOTHING`, [f.id, d.etapa, d.motivo, usuarioNome]);
      if (rowCount) { r.sem_contato += 1; r.detalhes.push({ fatura: f.numero, canal: 'nenhum', status: 'sem_contato' }); }
      continue;
    }
    for (const c of d.canais) {
      const { rows: [res] } = await pool.query(`INSERT INTO cobranca_envios (fatura_id, etapa, canal, destino, status, usuario_nome) VALUES ($1,$2,$3,$4,'enviado',$5)
        ON CONFLICT (fatura_id, etapa, canal) WHERE automatico AND status IN ('enviado', 'sem_contato') DO NOTHING RETURNING id`, [f.id, d.etapa, c.canal, c.destino.slice(0, 250), usuarioNome]);
      if (!res) continue;
      try {
        await mandar(f, etapa, c.canal, c.destino, cfg);
        r.enviados += 1; r.detalhes.push({ fatura: f.numero, canal: c.canal, destino: c.destino, status: 'enviado' });
      } catch (err) {
        await pool.query(`UPDATE cobranca_envios SET status = 'erro', erro = $2 WHERE id = $1`, [res.id, String(err.message).slice(0, 300)]);
        r.erros += 1; r.detalhes.push({ fatura: f.numero, canal: c.canal, destino: c.destino, status: 'erro', erro: err.message });
      }
    }
  }
  return r;
}

// Envio na hora, pelo botão da fatura. Conta como a etapa daquele canal: a régua não repete.
async function enviarAgora(faturaId, { etapa, canal = 'email', destino } = {}, usuarioNome) {
  const cfg = await config();
  const [f] = await faturasEmAberto({ faturaId: Number(faturaId) });
  if (!f) throw falha('Fatura não encontrada ou já paga/cancelada.', 404);
  const atraso = dias(hojeBr(), f.vencimento);
  const modelo = cfg.etapas.find((x) => x.dias === Number(etapa))
    || [...cfg.etapas].sort((a, b) => b.dias - a.dias).find((x) => x.dias <= atraso && !(x.dias <= 0 && atraso > 0))
    || [...cfg.etapas].sort((a, b) => a.dias - b.dias)[0];
  const para = String(destino || (canal === 'whatsapp' ? f.fone : f.emails.join(', ')) || '').trim();
  if (!para) throw falha(canal === 'whatsapp' ? 'O cliente não tem celular de cobrança. Informe o número.' : 'O cliente não tem e-mail de cobrança. Informe o e-mail.');
  const destinoOk = canal === 'whatsapp' ? celular(para) : para.split(/[;,]/).every((x) => emailValido(x)) ? para : null;
  if (!destinoOk) throw falha(canal === 'whatsapp' ? 'Celular inválido (DDD + 9 dígitos).' : 'E-mail inválido.');
  try {
    await mandar(f, modelo, canal, destinoOk, cfg);
    await pool.query(`INSERT INTO cobranca_envios (fatura_id, etapa, canal, destino, status, automatico, usuario_nome) VALUES ($1,$2,$3,$4,'enviado',FALSE,$5)`, [f.id, modelo.dias, canal, destinoOk, usuarioNome]);
  } catch (err) {
    await pool.query(`INSERT INTO cobranca_envios (fatura_id, etapa, canal, destino, status, erro, automatico, usuario_nome) VALUES ($1,$2,$3,$4,'erro',$5,FALSE,$6)`,
      [f.id, modelo.dias, canal, destinoOk, String(err.message).slice(0, 300), usuarioNome]);
    throw err;
  }
  return { numero: f.numero, canal, destino: destinoOk, etapa: modelo.dias };
}

async function historico({ faturaId = null, limite = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT x.id, x.fatura_id, f.numero, f.tomador_nome, x.etapa, x.canal, x.destino, x.status, x.erro, x.automatico, x.usuario_nome, x.enviado_em
       FROM cobranca_envios x JOIN faturas_transporte f ON f.id = x.fatura_id WHERE ($1::int IS NULL OR x.fatura_id = $1) ORDER BY x.enviado_em DESC, x.id DESC LIMIT $2`,
    [faturaId, Math.min(Number(limite) || 100, 500)]);
  return rows;
}

// Promessa de pagamento: a régua para esta fatura até a data.
async function pausarFatura(id, { ate, motivo } = {}) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(ate || '')) ? ate : null;
  if (data && data < hojeBr()) throw falha('A data da promessa já passou.');
  const { rows: [f] } = await pool.query(`UPDATE faturas_transporte SET cobranca_pausada_ate = $2, cobranca_motivo = $3 WHERE id = $1 RETURNING id, numero, cobranca_pausada_ate::text AS ate`,
    [id, data, data ? String(motivo || '').trim().slice(0, 200) || null : null]);
  if (!f) throw falha('Fatura não encontrada.', 404);
  return f;
}

// Cliente: pausa (acordo, cobrança por outro meio) e contato de cobrança próprio.
async function clienteCobranca(doc, b = {}) {
  const d = String(doc || '').replace(/\D/g, '');
  if (![11, 14].includes(d.length)) throw falha('CNPJ/CPF inválido.');
  const email = String(b.cobranca_email || '').trim();
  if (email && !email.split(/[;,]/).every((x) => emailValido(x))) throw falha('E-mail de cobrança inválido.');
  const fone = String(b.cobranca_whatsapp || '').trim();
  if (fone && !celular(fone)) throw falha('Celular de cobrança inválido (DDD + 9 dígitos).');
  const { rows: [c] } = await pool.query(
    `INSERT INTO clientes (documento, razao_social, cobranca_pausada, cobranca_motivo, cobranca_email, cobranca_whatsapp, origem) VALUES ($1,$2,$3,$4,$5,$6,'manual')
     ON CONFLICT (documento) DO UPDATE SET cobranca_pausada = EXCLUDED.cobranca_pausada, cobranca_motivo = EXCLUDED.cobranca_motivo,
       cobranca_email = EXCLUDED.cobranca_email, cobranca_whatsapp = EXCLUDED.cobranca_whatsapp
     RETURNING documento, razao_social, cobranca_pausada, cobranca_motivo, cobranca_email, cobranca_whatsapp`,
    [d, String(b.nome || '').trim().slice(0, 200) || null, !!b.cobranca_pausada, String(b.cobranca_motivo || '').trim().slice(0, 200) || null, email || null, fone || null]);
  return c;
}

async function clientesComExcecao() {
  const { rows } = await pool.query(`SELECT documento, COALESCE(razao_social, nome_fantasia) AS nome, cobranca_pausada, cobranca_motivo, cobranca_email, cobranca_whatsapp FROM clientes
    WHERE cobranca_pausada OR cobranca_email IS NOT NULL OR cobranca_whatsapp IS NOT NULL ORDER BY cobranca_pausada DESC, 2`);
  return rows;
}

// Uma vez por dia, a partir da hora escolhida.
let agendado = null;
function agendar() {
  if (agendado) return;
  const verificar = async () => {
    try {
      const cfg = await config();
      if (!cfg.ativo) return;
      const agora = new Date(Date.now() - 3 * 3600000);
      const hoje = agora.toISOString().slice(0, 10);
      if (agora.getUTCHours() < cfg.hora || cfg.ultima_execucao === hoje) return;
      // Marca antes de rodar: um reinício no meio não manda de novo (os envios também são únicos por etapa).
      await pool.query(`UPDATE empresa SET regua_config = jsonb_set(COALESCE(regua_config, '{}'::jsonb), '{ultima_execucao}', to_jsonb($1::text)) WHERE id = 1`, [hoje]);
      const r = await processar({ hoje });
      await pool.query(`UPDATE empresa SET regua_config = jsonb_set(regua_config, '{ultimo_resumo}', $1::jsonb) WHERE id = 1`,
        [JSON.stringify({ em: new Date().toISOString(), enviados: r.enviados, erros: r.erros, sem_contato: r.sem_contato })]);
      if (r.enviados || r.erros) console.log(`[régua] ${r.enviados} lembrete(s) enviado(s), ${r.erros} erro(s), ${r.sem_contato} sem contato`);
    } catch (err) { console.error('[régua]', err.message); }
  };
  agendado = setInterval(verificar, 15 * 60 * 1000);
  setTimeout(verificar, 2 * 60 * 1000);
}

module.exports = {
  ETAPAS_PADRAO, config, salvarConfig, previa, processar, enviarAgora, historico, pausarFatura, clienteCobranca, clientesComExcecao, agendar,
  decidir, preencher, celular, lerEtapas, quando,
};
