// Resumo diário da auditoria por e-mail, logo cedo (hora em configuracao_auditoria.resumo_hora, de segunda a sábado),
// para quem marcou "recebe o resumo" (usuarios.resumo_auditoria). Quem é responsável por transportadoras (fila por
// responsável) recebe só as dele; os demais, tudo. Conteúdo: fretes retidos e quanto somam a mais, os 5 que mais
// cobraram a mais, contestações vencidas e respondidas pelo link, e faturas das transportadoras que vencem na semana.
const pool = require('./db');
const { TRANSP_DO_FRETE, doUsuario } = require('./responsaveisAuditoria');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (v) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');

async function dados(usuario) {
  const minhas = await doUsuario(usuario.id);
  const params = [];
  let filtro = '';
  if (minhas.length) { params.push(minhas); filtro = ` AND ${TRANSP_DO_FRETE('f')} = ANY($${params.length}::int[])`; }
  const BASE = `FROM fretes f WHERE f.status = 'Frete Retido' AND f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE${filtro}`;
  const { rows: [ret] } = await pool.query(`SELECT COUNT(*)::int AS qtd, COALESCE(SUM(GREATEST(-COALESCE(f.dif_negociado_tabela, 0), 0)), 0)::float AS a_mais ${BASE}`, params);
  const { rows: top } = await pool.query(`SELECT f.id, f.numero_cte, f.numero_nf, f.transportadora, f.cliente, f.valor_total_cte::float AS valor_cte,
      (-f.dif_negociado_tabela)::float AS a_mais ${BASE} AND f.dif_negociado_tabela < 0 ORDER BY f.dif_negociado_tabela LIMIT 5`, params);
  const nomes = minhas.length ? (await pool.query('SELECT razao_social FROM transportadoras WHERE id = ANY($1::int[]) ORDER BY 1', [minhas])).rows.map((r) => r.razao_social) : null;
  const pT = nomes ? [nomes] : [];
  const fT = nomes ? ' AND transportadora = ANY($1::text[])' : '';
  const { rows: [ct] } = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE status = 'enviada' AND prazo_resposta < CURRENT_DATE AND portal_respondida_em IS NULL)::int AS vencidas,
      COALESCE(SUM(valor_contestado) FILTER (WHERE status = 'enviada' AND prazo_resposta < CURRENT_DATE AND portal_respondida_em IS NULL), 0)::float AS valor_vencidas,
      COUNT(*) FILTER (WHERE status = 'enviada' AND portal_respondida_em IS NOT NULL)::int AS respondidas
    FROM contestacoes WHERE TRUE${fT}`, pT);
  const { rows: faturas } = await pool.query(`SELECT numero, transportadora, data_vencimento,
      COALESCE(valor_informado, valor_ctes - COALESCE(total_glosas, 0))::float AS valor, COALESCE(situacao, 'conferida') AS situacao
    FROM faturas_frete WHERE pago_em IS NULL AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7${fT} ORDER BY data_vencimento LIMIT 20`, pT);
  return { minhas: nomes, retidos: ret, top, contestacoes: ct, faturas };
}

async function html(usuario, base = null) {
  const d = await dados(usuario);
  const vazio = !d.retidos.qtd && !d.contestacoes.vencidas && !d.contestacoes.respondidas && !d.faturas.length;
  const th = (t, dir = 'left') => `<th style="text-align:${dir}; border-bottom:2px solid #d1d5db; padding:4px 8px; font-size:12px;">${t}</th>`;
  const td = (t, dir = 'left') => `<td style="text-align:${dir}; border-bottom:1px solid #e5e7eb; padding:4px 8px; font-size:12.5px;">${t}</td>`;
  const bloco = (titulo, corpo) => `<h3 style="font-size:15px; margin:20px 0 6px;">${titulo}</h3>${corpo}`;
  const corpo = `<div style="font-family:Arial,sans-serif; font-size:14px; color:#1f2937; max-width:720px;">
    <p>Bom dia, ${esc(String(usuario.nome || '').split(' ')[0])}. Este é o resumo da auditoria de frete de hoje${d.minhas ? ` (só das suas transportadoras: ${esc(d.minhas.join(', '))})` : ''}.</p>
    <table style="border-collapse:collapse; margin:6px 0;"><tr>
      <td style="padding:10px 16px; border:1px solid #e5e7eb; border-radius:8px;"><div style="font-size:12px; color:#6b7280;">Fretes retidos</div><div style="font-size:22px; font-weight:bold;">${d.retidos.qtd}</div><div style="font-size:12px; color:#b91c1c;">${brl(d.retidos.a_mais)} cobrados a mais</div></td>
      <td style="width:10px;"></td>
      <td style="padding:10px 16px; border:1px solid #e5e7eb;"><div style="font-size:12px; color:#6b7280;">Contestações</div><div style="font-size:22px; font-weight:bold;">${d.contestacoes.vencidas + d.contestacoes.respondidas}</div><div style="font-size:12px; color:#6b7280;">${d.contestacoes.vencidas} vencida(s) sem resposta · ${d.contestacoes.respondidas} respondida(s) pelo link</div></td>
      <td style="width:10px;"></td>
      <td style="padding:10px 16px; border:1px solid #e5e7eb;"><div style="font-size:12px; color:#6b7280;">Faturas vencendo em 7 dias</div><div style="font-size:22px; font-weight:bold;">${d.faturas.length}</div><div style="font-size:12px; color:#6b7280;">${brl(d.faturas.reduce((s, f) => s + f.valor, 0))}</div></td>
    </tr></table>
    ${d.top.length ? bloco('Por onde começar: os que mais cobraram a mais', `<table style="border-collapse:collapse;"><tr>${th('CT-e')}${th('NF')}${th('Transportadora')}${th('Valor do CT-e', 'right')}${th('A mais', 'right')}</tr>
      ${d.top.map((f) => `<tr>${td(esc(f.numero_cte))}${td(esc(f.numero_nf || ''))}${td(esc(f.transportadora || ''))}${td(brl(f.valor_cte), 'right')}${td(`<b style="color:#b91c1c;">${brl(f.a_mais)}</b>`, 'right')}</tr>`).join('')}</table>`) : ''}
    ${d.contestacoes.vencidas ? bloco('Contestações sem resposta depois do prazo', `<p style="margin:0;">${d.contestacoes.vencidas} contestação(ões), ${brl(d.contestacoes.valor_vencidas)}. Reenvie a cobrança como lembrete.</p>`) : ''}
    ${d.contestacoes.respondidas ? bloco('Transportadoras que responderam pelo link', `<p style="margin:0;">${d.contestacoes.respondidas} contestação(ões) esperando você conferir e confirmar a resposta.</p>`) : ''}
    ${d.faturas.length ? bloco('Faturas das transportadoras que vencem nos próximos 7 dias', `<table style="border-collapse:collapse;"><tr>${th('Vencimento')}${th('Fatura')}${th('Transportadora')}${th('Situação')}${th('Valor', 'right')}</tr>
      ${d.faturas.map((f) => `<tr>${td(dia(f.data_vencimento))}${td(esc(f.numero))}${td(esc(f.transportadora))}${td(esc(f.situacao))}${td(brl(f.valor), 'right')}</tr>`).join('')}</table>`) : ''}
    ${vazio ? '<p style="color:#15803d;"><b>Nada pendente hoje.</b></p>' : ''}
    ${base ? `<p style="margin-top:20px;"><a href="${esc(base)}/dashboard.html" style="background:#2563eb; color:#fff; padding:9px 16px; border-radius:7px; text-decoration:none;">Abrir o Nexofrete</a></p>` : ''}
    <p style="font-size:11.5px; color:#9ca3af; margin-top:18px;">Você recebe este resumo porque está marcado em Manutenção do sistema » Auditoria » Responsáveis e resumo diário.</p></div>`;
  return { html: corpo, vazio, dados: d };
}

async function enviarPara(usuario, base = null) {
  const r = await html(usuario, base);
  await require('./email').enviarRelatorio({ para: usuario.email, assunto: `Auditoria de frete — resumo do dia: ${r.dados.retidos.qtd} retido(s)${r.dados.contestacoes.vencidas ? `, ${r.dados.contestacoes.vencidas} contestação(ões) vencida(s)` : ''}`, html: r.html });
  await pool.query('UPDATE usuarios SET resumo_auditoria_enviado = CURRENT_DATE WHERE id = $1', [usuario.id]);
  return r;
}

// Roda a cada 10 minutos: na hora marcada (horário de Brasília), de segunda a sábado, manda uma vez por dia.
async function enviarDoDia() {
  const agora = new Date();
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(agora).map((p) => [p.type, p.value]));
  if (partes.weekday === 'Sun') return 0;
  const { rows: [cfg] } = await pool.query('SELECT resumo_hora FROM configuracao_auditoria WHERE id = 1');
  if (Number(partes.hour) < (cfg?.resumo_hora ?? 7)) return 0;
  const { rows: usuarios } = await pool.query(`SELECT id, nome, email FROM usuarios WHERE ativo AND resumo_auditoria
     AND (resumo_auditoria_enviado IS NULL OR resumo_auditoria_enviado < CURRENT_DATE)`);
  if (!usuarios.length) return 0;
  const { rows: [emp] } = await pool.query('SELECT endereco_publico FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
  const base = emp?.endereco_publico ? String(emp.endereco_publico).replace(/\/+$/, '') : null;
  let n = 0;
  for (const u of usuarios) {
    try { await enviarPara(u, base); n += 1; } catch (e) {
      console.error(`[resumo auditoria] ${u.email}: ${e.message}`);
      if (/não está configurado/i.test(e.message)) break;   // sem SMTP: tenta de novo no próximo ciclo
    }
  }
  return n;
}

let timer = null;
function agendar() {
  if (timer) return;
  const passo = () => enviarDoDia().catch((e) => console.error('[resumo auditoria]', e.message));
  setTimeout(passo, 90 * 1000).unref?.();
  timer = setInterval(passo, 10 * 60 * 1000); timer.unref?.();
}

module.exports = { dados, html, enviarPara, enviarDoDia, agendar };
