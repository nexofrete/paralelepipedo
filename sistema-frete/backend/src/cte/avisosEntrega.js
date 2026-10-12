// Avisos automáticos ao cliente quando uma ocorrência é lançada: "saiu para
// entrega", "entregue", "não entregue" e "devolvido", por e-mail e/ou
// WhatsApp, com o link de rastreio. Liga e desliga na Configuração fiscal.
const pool = require('../db');

const TITULOS = {
  em_rota: (e) => `Sua entrega saiu para entrega hoje`,
  entrega: () => 'Entrega realizada',
  problema: () => 'Houve um problema na sua entrega',
  devolucao: () => 'Mercadoria devolvida ao remetente',
  agendada: () => 'Entrega agendada',
  transito: () => 'Atualização da sua entrega',
};
const p2 = (n) => String(n).padStart(2, '0');
const dataHora = (d) => { const x = new Date(d); return `${p2(x.getDate())}/${p2(x.getMonth() + 1)} às ${p2(x.getHours())}:${p2(x.getMinutes())}`; };
const diaBr = (d) => { const x = d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T12:00:00`); return `${p2(x.getDate())}/${p2(x.getMonth() + 1)}/${x.getFullYear()}`; };
const nfDaChave = (c) => (String(c).length === 44 ? String(Number(String(c).slice(25, 34))) : null);
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

// Celular brasileiro em +55DDXXXXXXXXX (WhatsApp só vai para celular).
function celular(fone) {
  let d = String(fone || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d.length === 11 && d[2] === '9' ? `+55${d}` : null;
}

// Para quem avisar: destinatário e quem paga o frete (sem repetir).
function destinatarios(dados) {
  const toma = { 0: dados.remetente, 1: dados.expedidor, 2: dados.recebedor, 3: dados.destinatario, 4: dados.outroTomador }[String(dados.tomador ?? '0')];
  const pessoas = [dados.destinatario, toma].filter(Boolean);
  const emails = [...new Set(pessoas.map((p) => String(p.email || '').trim().toLowerCase()).filter(emailValido))];
  const fones = [...new Set(pessoas.map((p) => celular(p.fone || p.endereco?.fone)).filter(Boolean))];
  return { emails, fones };
}

function mensagem(o, cte, empresa, link) {
  const d = cte.dados || {};
  const nfs = (d.nfes || []).map(nfDaChave).filter(Boolean);
  const titulo = (TITULOS[o.tipo] || TITULOS.transito)();
  const nomeEmpresa = empresa.nome_fantasia || empresa.razao_social || 'Transportadora';
  const linhas = [
    `Olá, ${d.destinatario?.xNome || 'cliente'}.`,
    `${o.descricao} — ${dataHora(o.data_hora)}${o.cidade ? ` (${o.cidade}${o.uf ? `/${o.uf}` : ''})` : ''}.`,
    `Transporte ${nomeEmpresa} · CT-e ${cte.serie}/${cte.numero}${nfs.length ? ` · NF ${nfs.join(', ')}` : ''}.`,
  ];
  if (o.tipo === 'entrega' && o.recebedor_nome) linhas.push(`Recebido por ${o.recebedor_nome}.`);
  if (o.nova_previsao) linhas.push(`Nova previsão de entrega: ${diaBr(o.nova_previsao)}.`);
  else if (['em_rota', 'transito'].includes(o.tipo) && cte.previsao_entrega) linhas.push(`Previsão de entrega: ${diaBr(cte.previsao_entrega)}.`);
  if (['problema', 'devolucao'].includes(o.tipo) && (empresa.telefone || empresa.email)) {
    linhas.push(`Fale com a gente: ${[empresa.telefone, empresa.email].filter(Boolean).join(' · ')}.`);
  }
  const texto = [`*${titulo}*`, ...linhas, link ? `Acompanhe: ${link}` : ''].filter(Boolean).join('\n');
  return { titulo, linhas, texto, assunto: `${titulo} — ${nomeEmpresa}${nfs.length ? ` · NF ${nfs[0]}` : ''}`, rodape: `Aviso automático de ${nomeEmpresa}.` };
}

// lancadas: [{ id (da ocorrência), cteId, tipo }]
async function avisar(lancadas) {
  if (!lancadas?.length) return [];
  const { rows: emp } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  const empresa = emp[0] || {};
  if (!empresa.aviso_entrega_ativo) return [];
  const eventos = String(empresa.aviso_entrega_eventos || '').split(',').map((x) => x.trim());
  const feitos = [];
  for (const l of lancadas) {
    if (!eventos.includes(l.tipo)) continue;
    const { rows: oc } = await pool.query('SELECT * FROM cte_ocorrencias WHERE id = $1', [l.id]);
    const { rows: ct } = await pool.query('SELECT id, serie, numero, chave, dados, previsao_entrega, demonstracao FROM ctes_emitidos WHERE id = $1', [l.cteId]);
    if (!oc[0] || !ct[0]) continue;
    const base = String(empresa.endereco_publico || '').replace(/\/+$/, '');
    const link = base && ct[0].chave ? `${base}/rastreio.html?chave=${ct[0].chave}` : null;
    const m = mensagem(oc[0], ct[0], empresa, link);
    const { emails, fones } = destinatarios(ct[0].dados || {});
    const registrar = (canal, destino, situacao, detalhe) => pool.query(
      'INSERT INTO avisos_entrega (ocorrencia_id, cte_id, canal, destino, situacao, detalhe) VALUES ($1, $2, $3, $4, $5, $6)',
      [l.id, l.cteId, canal, destino, situacao, detalhe ? String(detalhe).slice(0, 500) : null]).catch(() => {});
    if (empresa.aviso_entrega_email) {
      for (const e of emails) {
        try { await require('../email').enviarAvisoEntrega({ destinatarioEmail: e, ...m, link }); await registrar('email', e, 'enviado'); feitos.push({ canal: 'email', destino: e }); } catch (err) { await registrar('email', e, 'erro', err.message); }
      }
    }
    if (empresa.aviso_entrega_whatsapp) {
      for (const f of fones) {
        try { await require('../whatsapp').enviarMensagem(m.texto, f); await registrar('whatsapp', f, 'enviado'); feitos.push({ canal: 'whatsapp', destino: f }); } catch (err) { await registrar('whatsapp', f, 'erro', err.message); }
      }
    }
    if (!emails.length && !fones.length) await registrar('nenhum', '-', 'erro', 'O CT-e não tem e-mail nem celular do destinatário/tomador.');
  }
  return feitos;
}

module.exports = { avisar, mensagem, destinatarios, celular };
