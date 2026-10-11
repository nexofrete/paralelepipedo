const cron = require('node-cron');
const pool = require('./db');
const email = require('./email');

// ---------- Textos dos avisos ----------
function formatarQuando(evento) {
  const inicio = new Date(evento.inicio);
  const data = inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (evento.dia_inteiro) return `${data} (dia inteiro)`;
  const h = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return evento.fim ? `${data}, das ${h(inicio)} às ${h(evento.fim)}` : `${data}, às ${h(inicio)}`;
}

function textoAviso(tipo, evento, autor) {
  const quando = formatarQuando(evento);
  const hora = evento.dia_inteiro ? '' : new Date(evento.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  switch (tipo) {
    case 'convite': return `${autor || 'Alguém'} incluiu você no evento — ${quando}`;
    case 'alterado': return `${autor || 'Alguém'} alterou o evento — agora ${quando}`;
    case 'cancelado': return `${autor || 'Alguém'} cancelou o evento que seria ${quando}`;
    case 'removido': return `${autor || 'Alguém'} tirou você do evento de ${quando}`;
    case 'lembrete_1dia': return evento.dia_inteiro ? 'É amanhã (dia inteiro)' : `É amanhã, às ${hora}`;
    case 'lembrete_1hora': return evento.dia_inteiro ? 'É hoje (dia inteiro)' : `Começa em 1 hora, às ${hora}`;
    default: return quando;
  }
}

const ASSUNTOS = {
  convite: '📅 Novo evento na agenda',
  alterado: '📅 Evento alterado',
  cancelado: '📅 Evento cancelado',
  removido: '📅 Você saiu de um evento',
  lembrete_1dia: '⏰ Lembrete: amanhã',
  lembrete_1hora: '⏰ Lembrete: em 1 hora',
};

// Grava os avisos pra cada usuário e manda email (se configurado), sem
// travar quem chamou: falha de email só vai pro log do servidor.
async function notificar(usuarioIds, tipo, evento, autor) {
  const ids = [...new Set(usuarioIds.map(Number).filter(Boolean))];
  if (!ids.length) return;
  const texto = textoAviso(tipo, evento, autor);
  await pool.query(
    `INSERT INTO agenda_notificacoes (usuario_id, evento_id, tipo, titulo, texto)
     SELECT u, $2, $3, $4, $5 FROM UNNEST($1::int[]) AS u`,
    [ids, tipo === 'cancelado' ? null : evento.id, tipo, evento.titulo, texto]
  );
  enviarEmails(ids, tipo, evento, texto).catch((err) => console.error('[agenda] Falha ao mandar email:', err.message));
}

async function enviarEmails(ids, tipo, evento, texto) {
  const { rows } = await pool.query('SELECT nome, email FROM usuarios WHERE id = ANY($1) AND ativo = TRUE', [ids]);
  for (const u of rows) {
    const linhas = [texto, `Quando: ${formatarQuando(evento)}`];
    if (evento.local) linhas.push(`Local: ${evento.local}`);
    if (evento.descricao && tipo !== 'cancelado') linhas.push(evento.descricao);
    await email.enviarAvisoAgenda({
      destinatarioEmail: u.email, destinatarioNome: u.nome,
      assunto: `${ASSUNTOS[tipo] || '📅 Agenda'} — ${evento.titulo}`, titulo: evento.titulo, linhas,
    });
  }
}

// ---------- Lembretes (roda a cada minuto) ----------
// Base do horário: evento de dia inteiro conta como às 08:00 do dia, pra o
// "1 hora antes" não cair na madrugada e o "1 dia antes" sair de manhã.
const BASE = `(CASE WHEN e.dia_inteiro THEN e.inicio + INTERVAL '8 hours' ELSE e.inicio END)`;

async function dispararLembretes() {
  try {
    for (const [tipo, coluna, antecedencia] of [
      ['lembrete_1dia', 'lembrete_1dia', '1 day'],
      ['lembrete_1hora', 'lembrete_1hora', '1 hour'],
    ]) {
      // Todos que participam (dono + convidados), dentro da janela do lembrete.
      // O lembrete de 1 dia não sai se o evento foi criado já dentro dessa
      // janela (a pessoa acabou de receber o convite).
      const { rows } = await pool.query(
        `WITH alvo AS (
           SELECT e.*, p.usuario_id
             FROM agenda_eventos e
             JOIN (SELECT evento_id, usuario_id FROM agenda_participantes
                   UNION SELECT id, criado_por_id FROM agenda_eventos WHERE criado_por_id IS NOT NULL) p
               ON p.evento_id = e.id
            WHERE e.${coluna} = TRUE
              AND LOCALTIMESTAMP >= ${BASE} - INTERVAL '${antecedencia}'
              AND LOCALTIMESTAMP < ${BASE}
              AND ($1 <> 'lembrete_1dia' OR e.criado_em < ${BASE} - INTERVAL '${antecedencia}')
         )
         INSERT INTO agenda_notificacoes (usuario_id, evento_id, tipo, titulo, referencia)
         SELECT usuario_id, id, $1, titulo, inicio FROM alvo
         ON CONFLICT DO NOTHING
         RETURNING id, usuario_id, evento_id`,
        [tipo]
      );
      if (!rows.length) continue;

      // Completa o texto e manda o email, agrupado por evento.
      const porEvento = new Map();
      rows.forEach((r) => { if (!porEvento.has(r.evento_id)) porEvento.set(r.evento_id, []); porEvento.get(r.evento_id).push(r); });
      for (const [eventoId, lista] of porEvento) {
        const { rows: ev } = await pool.query('SELECT * FROM agenda_eventos WHERE id = $1', [eventoId]);
        if (!ev[0]) continue;
        const texto = textoAviso(tipo, ev[0]);
        await pool.query('UPDATE agenda_notificacoes SET texto = $1 WHERE id = ANY($2)', [texto, lista.map((r) => r.id)]);
        enviarEmails(lista.map((r) => r.usuario_id), tipo, ev[0], texto)
          .catch((err) => console.error('[agenda] Falha ao mandar email de lembrete:', err.message));
      }
    }
  } catch (err) {
    console.error('[agenda] Erro ao disparar lembretes:', err.message);
  }
}

function agendarLembretes() {
  cron.schedule('* * * * *', dispararLembretes);
  dispararLembretes();
}

module.exports = { notificar, agendarLembretes, dispararLembretes };
