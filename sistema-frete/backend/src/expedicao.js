// Painel de expedição (Pátio e portaria » Expedição, tela 425): as notas de venda dos últimos 45 dias que ainda não
// saíram e as que saíram hoje, cada uma na sua etapa, juntando a ordem de coleta (src/ordensColeta.js) e a visita do pátio:
//   Sem ordem de coleta → Ordem em rascunho → Ordem enviada (aguardando / sem resposta) → Coleta confirmada (ou atrasada)
//   → No pátio (aguardando doca, na doca) → Expedida hoje (saída na portaria ou CT-e da transportadora emitido hoje).
// Por transportadora: quantas notas em cada etapa, volumes, peso, valor, a nota mais antiga e a próxima coleta.
// Alertas: nota parada sem ordem há mais de DIAS_PARADA dias, ordem sem resposta, coleta atrasada.
const { consultaCliente } = require('./permissoes');
const oc = require('./ordensColeta');

const DIAS_PARADA = 2;
const ETAPAS = ['Sem ordem de coleta', 'Ordem em rascunho', 'Ordem enviada', 'Sem resposta', 'Coleta confirmada', 'Coleta atrasada', 'No pátio', 'Expedida hoje'];
const FOB = "COALESCE(f.frete_cif_fob, '') IN ('FOB', 'Destinatário', 'Destinatario', 'Próprio destinatário')";
const hojeSP = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const diasDesde = (iso, hoje) => (iso ? Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`)) / 86400000) : null);

// Etapa de uma nota (sem banco): n.expedida_em (data da saída ou do CT-e, quando é de hoje), n.ordem (a ordem aberta, com
// a situação calculada por ordensColeta.situacao).
function etapa(n) {
  if (n.expedida_hoje) return 'Expedida hoje';
  const o = n.ordem;
  if (!o) return 'Sem ordem de coleta';
  if (o.status === 'rascunho') return 'Ordem em rascunho';
  const s = o.situacao;
  if (s === 'No pátio') return 'No pátio';
  if (s === 'Atrasada') return o.status === 'enviada' ? 'Sem resposta' : 'Coleta atrasada';
  if (s === 'Sem resposta') return 'Sem resposta';
  if (o.status === 'enviada') return 'Ordem enviada';
  return 'Coleta confirmada';
}

async function painel(req, q = {}) {
  const hoje = hojeSP();
  const p = [hoje]; const cond = [];
  if (String(q.transportadora || '').trim()) { p.push(`%${String(q.transportadora).trim()}%`); cond.push(`COALESCE(f.transportadora, f.transportadora_nfe, f.transportadora_cte) ILIKE $${p.length}`); }
  const incluirFob = q.fob === '1';
  const { rows } = await consultaCliente(req, `SELECT f.id, LTRIM(f.numero_nf, '0') AS numero, f.numero_pedido AS pedido, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao,
      f.cliente, f.cidade, f.uf, f.qtd_volumes AS volumes, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso, f.valor_faturado::float AS valor,
      COALESCE(f.transportadora_cte, f.transportadora, f.transportadora_nfe) AS transportadora, (${FOB}) AS fob,
      (COALESCE(f.data_saida::date, f.data_emissao_cte) = $1::date AND (f.data_saida IS NOT NULL OR f.chave_cte IS NOT NULL)) AS expedida_hoje,
      to_char(f.data_saida, 'YYYY-MM-DD"T"HH24:MI') AS saida_em, f.numero_cte,
      o.id AS ordem_id, o.status AS ordem_status, o.enviada_em, o.coletar_em, o.previsto_em, o.janela_min, o.tipo AS ordem_tipo, o.placa, o.motorista_nome,
      v.status AS visita_status
    FROM fretes f
    LEFT JOIN LATERAL (SELECT x.* FROM ordens_coleta x WHERE f.id = ANY(x.frete_ids) AND x.status IN ('rascunho', 'enviada', 'aceita') ORDER BY x.id DESC LIMIT 1) o ON TRUE
    LEFT JOIN patio_visitas v ON v.id = o.visita_id
    WHERE f.frete_principal_id IS NULL AND COALESCE(f.numero_nf, '') <> '' AND f.nf_cancelada IS NOT TRUE AND f.nf_entrada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE
      AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') AND f.data_entrega IS NULL
      AND f.data_emissao_nf >= CURRENT_DATE - 45
      AND ((f.data_saida IS NULL AND f.chave_cte IS NULL AND f.cte_coberto_por IS NULL) OR COALESCE(f.data_saida::date, f.data_emissao_cte) = $1::date)
      ${incluirFob ? '' : `AND NOT ${FOB}`}${cond.length ? ` AND ${cond.join(' AND ')}` : ''}
    ORDER BY f.data_emissao_nf, f.numero_nf LIMIT 5000`, p);
  const notas = rows.map((r) => {
    const ordem = r.ordem_id ? { id: r.ordem_id, status: r.ordem_status, enviada_em: r.enviada_em, coletar_em: r.coletar_em, previsto_em: r.previsto_em, janela_min: r.janela_min,
      tipo: r.ordem_tipo, visita_status: r.visita_status, placa: r.placa, motorista_nome: r.motorista_nome } : null;
    if (ordem) ordem.situacao = oc.situacao(ordem);
    const n = { id: r.id, numero: r.numero, pedido: r.pedido, emissao: r.emissao, cliente: r.cliente, destino: [r.cidade, r.uf].filter(Boolean).join('/'), volumes: r.volumes,
      peso: r.peso, valor: r.valor, transportadora: r.transportadora || '(sem transportadora)', fob: r.fob, expedida_hoje: r.expedida_hoje, saida_em: r.saida_em, numero_cte: r.numero_cte,
      ordem, dias: diasDesde(r.emissao, hoje) };
    n.etapa = etapa(n);
    return n;
  });
  const soma = (ls, k) => ls.reduce((t, l) => t + (Number(l[k]) || 0), 0);
  const aExpedir = notas.filter((n) => n.etapa !== 'Expedida hoje');
  const expedidas = notas.filter((n) => n.etapa === 'Expedida hoje');
  const conta = (e) => notas.filter((n) => n.etapa === e).length;
  // Por transportadora.
  const mapa = new Map();
  for (const n of notas) {
    const t = mapa.get(n.transportadora) || { transportadora: n.transportadora, etapas: Object.fromEntries(ETAPAS.map((e) => [e, 0])), notas: 0, volumes: 0, peso: 0, valor: 0, mais_antiga: null, proxima_coleta: null, ordens: new Set() };
    t.etapas[n.etapa] += 1;
    if (n.etapa !== 'Expedida hoje') {
      t.notas += 1; t.volumes += Number(n.volumes) || 0; t.peso += Number(n.peso) || 0; t.valor += Number(n.valor) || 0;
      if (!t.mais_antiga || n.emissao < t.mais_antiga) t.mais_antiga = n.emissao;
    }
    if (n.ordem) {
      t.ordens.add(n.ordem.id);
      const prox = n.ordem.previsto_em || n.ordem.coletar_em;
      if (prox && n.etapa !== 'Expedida hoje' && (!t.proxima_coleta || new Date(prox) < new Date(t.proxima_coleta))) t.proxima_coleta = new Date(prox).toISOString();
    }
    mapa.set(n.transportadora, t);
  }
  const transportadoras = [...mapa.values()].map(({ ordens, ...t }) => ({ ...t, peso: Math.round(t.peso * 10) / 10, valor: Math.round(t.valor * 100) / 100, ordens: ordens.size,
    dias_mais_antiga: diasDesde(t.mais_antiga, hoje) })).sort((a, b) => b.notas - a.notas || b.etapas['Expedida hoje'] - a.etapas['Expedida hoje']);
  // Alertas (os mais antigos primeiro).
  const alertas = [
    ...notas.filter((n) => n.etapa === 'Sem ordem de coleta' && n.dias > DIAS_PARADA && !n.fob).map((n) => ({ tipo: 'parada', texto: `NF ${n.numero} (${n.cliente}) parada há ${n.dias} dias sem ordem de coleta`, transportadora: n.transportadora, dias: n.dias, nota_id: n.id })),
    ...[...new Map(notas.filter((n) => n.etapa === 'Sem resposta').map((n) => [n.ordem.id, n])).values()].map((n) => ({ tipo: 'sem_resposta', texto: `Ordem de coleta nº ${n.ordem.id} sem resposta da transportadora`, transportadora: n.transportadora, dias: diasDesde(n.ordem.enviada_em, hoje), ordem_id: n.ordem.id })),
    ...[...new Map(notas.filter((n) => n.etapa === 'Coleta atrasada').map((n) => [n.ordem.id, n])).values()].map((n) => ({ tipo: 'atrasada', texto: `Coleta da ordem nº ${n.ordem.id} atrasada (${n.ordem.placa || 'sem placa'}): passou da janela e o caminhão não chegou`, transportadora: n.transportadora, dias: 0, ordem_id: n.ordem.id })),
  ].sort((a, b) => (b.dias || 0) - (a.dias || 0)).slice(0, 60);
  return {
    hoje, agora: new Date().toISOString(), etapas: ETAPAS, dias_parada: DIAS_PARADA,
    indicadores: {
      a_expedir: aExpedir.length, volumes: soma(aExpedir, 'volumes'), peso: Math.round(soma(aExpedir, 'peso') * 10) / 10, valor: Math.round(soma(aExpedir, 'valor') * 100) / 100,
      sem_ordem: conta('Sem ordem de coleta'), rascunho: conta('Ordem em rascunho'), aguardando: conta('Ordem enviada') + conta('Sem resposta'), sem_resposta: conta('Sem resposta'),
      confirmadas: conta('Coleta confirmada'), atrasadas: conta('Coleta atrasada'), no_patio: conta('No pátio'),
      expedidas_hoje: expedidas.length, expedidas_volumes: soma(expedidas, 'volumes'), expedidas_peso: Math.round(soma(expedidas, 'peso') * 10) / 10, expedidas_valor: Math.round(soma(expedidas, 'valor') * 100) / 100,
      paradas: alertas.filter((a) => a.tipo === 'parada').length,
    },
    transportadoras, alertas, notas,
  };
}

module.exports = { etapa, painel, ETAPAS, DIAS_PARADA };
