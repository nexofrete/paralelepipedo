// Gestão das faturas que as transportadoras mandam (embarcador), depois da conferência:
//   conferida → aprovada → liberada (para pagamento) → paga
//   bloqueada: conferida com divergência (automático) ou à mão; só sai com justificativa.
// Aprovação com alçada (configuracao_auditoria.limite_alcada_fatura: acima dele, só quem
// tem "Aprovar valores altos"). Cada passo fica no histórico da fatura. Também: importação
// da fatura em planilha (Excel/CSV), CT-e que a transportadora ainda não cobrou e o quadro
// de vencimentos.
const XLSX = require('xlsx');
const pool = require('./db');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const SITUACOES = { conferida: 'Conferida', bloqueada: 'Bloqueada', aprovada: 'Aprovada', liberada: 'Liberada p/ pagamento', paga: 'Paga' };
const valorAPagar = (f) => r2(f.valor_informado != null ? Number(f.valor_informado) : Number(f.valor_ctes) - Number(f.total_glosas || 0));

async function historico(cliente, faturaId, acao, antes, depois, detalhe, usuario) {
  await cliente.query(`INSERT INTO faturas_frete_historico (fatura_id, acao, situacao_antes, situacao_depois, detalhe, usuario_nome) VALUES ($1, $2, $3, $4, $5, $6)`,
    [faturaId, acao, antes, depois, detalhe ? String(detalhe).slice(0, 500) : null, usuario]);
}

// Muda a situação dentro de uma transação, conferindo de onde pode sair.
async function mudar(faturaId, { de, para, acao, detalhe, usuario, extra = {} }, conferir) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [f] } = await cliente.query('SELECT * FROM faturas_frete WHERE id = $1 FOR UPDATE', [faturaId]);
    if (!f) throw falha('Fatura não encontrada.', 404);
    const atual = f.situacao || 'conferida';
    const verbo = { aprovada: 'aprovar', liberada: 'liberar', bloqueada: 'bloquear', desbloqueada: 'desbloquear', paga: 'registrar o pagamento', pagamento_desfeito: 'desfazer o pagamento' }[acao] || 'fazer isso';
    const dica = acao === 'paga' ? (atual === 'bloqueada' ? ' Fatura bloqueada não pode ser paga: desbloqueie com justificativa, aprove e libere.' : ' Antes, aprove e libere a fatura para pagamento.') : '';
    if (!de.includes(atual)) throw falha(`A fatura ${f.numero} está "${SITUACOES[atual] || atual}": não dá para ${verbo} agora.${dica}`, 409);
    if (conferir) await conferir(f);
    const sets = { situacao: para, ...extra };
    const chaves = Object.keys(sets);
    await cliente.query(`UPDATE faturas_frete SET ${chaves.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [f.id, ...chaves.map((k) => sets[k])]);
    await historico(cliente, f.id, acao, atual, para, detalhe, usuario);
    await cliente.query('COMMIT');
    return { ...f, situacao: para };
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

const texto = (v, max = 500) => String(v ?? '').trim().slice(0, max);

async function bloquear(id, motivo, usuario) {
  const m = texto(motivo);
  if (!m) throw falha('Diga o motivo do bloqueio.');
  return mudar(id, { de: ['conferida', 'aprovada', 'liberada'], para: 'bloqueada', acao: 'bloqueada', detalhe: m, usuario, extra: { bloqueio_motivo: m } });
}
async function desbloquear(id, justificativa, usuario) {
  const j = texto(justificativa);
  if (j.length < 5) throw falha('Escreva a justificativa para desbloquear (o que foi resolvido ou combinado com a transportadora).');
  return mudar(id, { de: ['bloqueada'], para: 'conferida', acao: 'desbloqueada', detalhe: j, usuario, extra: { bloqueio_motivo: null } });
}
async function aprovar(id, { observacao, podeValoresAltos }, usuario) {
  const { rows: [cfg] } = await pool.query('SELECT limite_alcada_fatura FROM configuracao_auditoria WHERE id = 1');
  const limite = cfg?.limite_alcada_fatura != null ? Number(cfg.limite_alcada_fatura) : null;
  return mudar(id, { de: ['conferida'], para: 'aprovada', acao: 'aprovada', detalhe: texto(observacao) || null, usuario, extra: { aprovado_por: usuario, aprovado_em: new Date() } }, (f) => {
    if (limite != null && valorAPagar(f) > limite && !podeValoresAltos) {
      throw falha(`A fatura ${f.numero} (${valorAPagar(f).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) passa da alçada de ${limite.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}: só quem tem "Aprovar valores altos" aprova.`, 403);
    }
  });
}
async function liberar(id, observacao, usuario) {
  return mudar(id, { de: ['aprovada'], para: 'liberada', acao: 'liberada', detalhe: texto(observacao) || null, usuario, extra: { liberado_por: usuario, liberado_em: new Date() } });
}
async function pagar(id, { data, valor, observacao }, usuario) {
  return mudar(id, { de: ['liberada'], para: 'paga', acao: 'paga', detalhe: `R$ ${valor.toFixed(2)} em ${data.split('-').reverse().join('/')}${observacao ? ` · ${observacao}` : ''}`, usuario,
    extra: { pago_em: data, valor_pago: r2(valor), pago_por: usuario, pagamento_obs: observacao || null } }, (f) => {
    if (f.pago_em) throw falha('Esta fatura já está paga.', 409);
  });
}
async function desfazerPagamento(id, usuario) {
  return mudar(id, { de: ['paga'], para: 'liberada', acao: 'pagamento_desfeito', detalhe: null, usuario, extra: { pago_em: null, valor_pago: null, pago_por: null, pagamento_obs: null } });
}
// A situação de uma fatura recém-conferida: com ressalvas, já nasce bloqueada.
async function aoConferir(cliente, faturaId, { parecer, pendencias, bateFatura, valorInformado, valorEsperado }, usuario) {
  const motivos = [];
  if (pendencias) motivos.push(`${pendencias} CT-e não conferido(s) ou divergente(s)`);
  if (!bateFatura) motivos.push(`valor da fatura (R$ ${Number(valorInformado).toFixed(2)}) diferente do esperado (R$ ${Number(valorEsperado).toFixed(2)})`);
  const bloqueada = parecer !== 'Conferida';
  const motivo = bloqueada ? `Divergência na conferência: ${motivos.join('; ')}` : null;
  await cliente.query('UPDATE faturas_frete SET situacao = $2, bloqueio_motivo = $3 WHERE id = $1', [faturaId, bloqueada ? 'bloqueada' : 'conferida', motivo]);
  await historico(cliente, faturaId, 'conferida', null, 'conferida', `Parecer: ${parecer}`, usuario);
  if (bloqueada) await historico(cliente, faturaId, 'bloqueada', 'conferida', 'bloqueada', `${motivo} (bloqueio automático)`, usuario);
}
async function verHistorico(id) {
  const { rows } = await pool.query('SELECT * FROM faturas_frete_historico WHERE fatura_id = $1 ORDER BY id', [id]);
  return rows;
}

// ---------- Importação da fatura em planilha (Excel/CSV) ----------
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const numCte = (v) => soDigitos(v).replace(/^0+(?=\d)/, '');
function numeroBr(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/R\$|\s/g, '');
  if (!/\d/.test(s)) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}
function dataIso(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
// Lê uma planilha: acha a linha de títulos (CT-e / chave / valor) e devolve as linhas da fatura.
function lerPlanilha(buffer) {
  // raw: o CSV fica como texto ("118,50" não vira 11850); planilha Excel continua com números de verdade.
  const livro = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
  const linhas = [];
  let numeroFatura = null; let vencimento = null;
  for (const nomeAba of livro.SheetNames) {
    const grade = XLSX.utils.sheet_to_json(livro.Sheets[nomeAba], { header: 1, raw: true, defval: '' });
    let cab = -1; let cCte = -1; let cChave = -1; let cValor = -1;
    for (let i = 0; i < Math.min(grade.length, 40) && cab < 0; i++) {
      const t = grade[i].map((c) => String(c).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim());
      const iCte = t.findIndex((c) => /^(n[ºo°.]*\s*)?(do\s+)?(ct-?e|conhecimento|cte|documento|n[ºo°]?\s*doc)/.test(c) && !/chave|serie|emiss|data/.test(c));
      const iChave = t.findIndex((c) => /chave/.test(c));
      if (iCte >= 0 || iChave >= 0) {
        cab = i; cCte = iCte; cChave = iChave;
        const prefs = [/valor\s*(do\s*)?frete|frete\s*cobrado|valor\s*cobrado/, /valor\s*(a\s*)?pagar|valor\s*liquido/, /^valor|total|frete/];
        for (const re of prefs) { cValor = t.findIndex((c, k) => re.test(c) && k !== cCte && k !== cChave && !/merc|nota|nf|icms|base/.test(c)); if (cValor >= 0) break; }
      }
      // Cabeçalho da fatura: "Fatura: 123" / "Vencimento: 10/11/2026" em qualquer célula do topo.
      grade[i].forEach((c, k) => {
        const s = String(c);
        if (!numeroFatura && /fatura/i.test(s)) numeroFatura = (/fatura\s*(?:n[º°o.]*)?\s*[:#-]?\s*([\w./-]*\d[\w./-]*)/i.exec(s)?.[1]) || (String(grade[i][k + 1] || '').trim() || null);
        if (!vencimento && /venc/i.test(s)) vencimento = dataIso(/(\d{2}\/\d{2}\/\d{4})/.exec(s)?.[1]) || dataIso(grade[i][k + 1]);
      });
    }
    const corpo = cab >= 0 ? grade.slice(cab + 1) : grade;
    for (const l of corpo) {
      const celulas = l.map((c) => String(c ?? ''));
      let chave = cChave >= 0 ? soDigitos(l[cChave]) : '';
      if (chave.length !== 44) chave = celulas.map(soDigitos).find((d) => d.length === 44) || '';
      let cte = cCte >= 0 ? numCte(l[cCte]) : '';
      if (!cte && chave) cte = numCte(chave.slice(25, 34));
      if (cab < 0 && !chave) continue;   // sem títulos, só linhas com chave de 44 dígitos
      if (!cte || cte.length > 12) continue;
      const valor = cValor >= 0 ? numeroBr(l[cValor]) : null;
      linhas.push({ cte, chave: chave || null, valor: valor != null ? r2(valor) : null });
    }
  }
  return { linhas, numero: numeroFatura, vencimento };
}

// Junta as linhas de um ou mais arquivos e acha os nossos CT-e (pela chave ou pelo número).
async function importar(arquivos, transportadora) {
  if (!arquivos?.length) throw falha('Escolha o arquivo da fatura (Excel ou CSV).');
  const todas = []; let numero = null; let vencimento = null;
  for (const a of arquivos) {
    let r;
    try { r = lerPlanilha(a.buffer); } catch { throw falha(`Não consegui ler ${a.originalname}: use Excel (.xlsx/.xls) ou CSV.`); }
    todas.push(...r.linhas); numero = numero || r.numero; vencimento = vencimento || r.vencimento;
  }
  if (!todas.length) throw falha('Não achei CT-e no arquivo: precisa de uma coluna "CT-e" (número) ou "Chave", e de preferência "Valor".');
  const unicas = [...new Map(todas.map((l) => [l.chave || l.cte, l])).values()];
  const chaves = unicas.map((l) => l.chave).filter(Boolean);
  const { rows } = await pool.query(
    `SELECT id, numero_cte, chave_cte, COALESCE(transportadora_cte, transportadora) AS transportadora, COALESCE(valor_total_cte, valor_frete_negociado)::float AS valor_cte,
            fatura_id, numero_fatura, cte_cancelado, status
       FROM fretes WHERE chave_cte IS NOT NULL AND (chave_cte = ANY($1::text[]) OR regexp_replace(numero_cte, '\\D|^0+', '', 'g') = ANY($2::text[]))`,
    [chaves, unicas.map((l) => l.cte)]);
  // Transportadora: a escolhida, ou a que tem mais CT-e do arquivo.
  const cont = rows.reduce((m, r) => m.set(r.transportadora, (m.get(r.transportadora) || 0) + 1), new Map());
  const transp = transportadora || [...cont].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const achados = []; const naoEncontrados = []; const jaFaturados = []; const cancelados = [];
  for (const l of unicas) {
    const cands = rows.filter((r) => (l.chave && r.chave_cte === l.chave) || numCte(r.numero_cte) === l.cte);
    const f = cands.find((r) => r.transportadora === transp && r.chave_cte === l.chave) || cands.find((r) => r.transportadora === transp);
    if (!f) { naoEncontrados.push(l); continue; }
    if (f.cte_cancelado) { cancelados.push({ ...l, numero_cte: f.numero_cte }); continue; }
    if (f.fatura_id) { jaFaturados.push({ ...l, numero_cte: f.numero_cte, numero_fatura: f.numero_fatura }); continue; }
    if (achados.some((a) => a.frete_id === f.id)) continue;
    achados.push({ frete_id: f.id, numero_cte: f.numero_cte, valor_cte: r2(f.valor_cte), valor_cobrado: l.valor, diferenca: l.valor != null ? r2(l.valor - f.valor_cte) : null });
  }
  // Mesmo CT-e em mais de uma linha (pelo número ou pela chave): cobrança repetida no arquivo.
  const vezes = new Map();
  for (const l of todas) {
    const f = rows.find((r) => r.transportadora === transp && ((l.chave && r.chave_cte === l.chave) || numCte(r.numero_cte) === l.cte));
    const k = f ? `f${f.id}` : `n${l.cte}`;
    vezes.set(k, { cte: f ? f.numero_cte : l.cte, vezes: (vezes.get(k)?.vezes || 0) + 1 });
  }
  const repetidosArquivo = [...vezes.values()].filter((v) => v.vezes > 1);
  return {
    transportadora: transp, numero, vencimento, linhas: todas.length, achados, nao_encontrados: naoEncontrados, ja_faturados: jaFaturados, cancelados, repetidos_arquivo: repetidosArquivo,
    valor_cobrado: r2(todas.reduce((s, l) => s + (l.valor || 0), 0)), com_diferenca: achados.filter((a) => a.diferenca && Math.abs(a.diferenca) >= 0.01).length,
  };
}

// ---------- CT-e que a transportadora ainda não cobrou ----------
async function naoFaturados({ dias = 0 } = {}) {
  const minimo = Math.max(0, parseInt(dias, 10) || 0);
  const { rows } = await pool.query(
    `SELECT f.id, f.numero_cte, f.data_emissao_cte::text, f.numero_nf, f.cliente, f.uf, COALESCE(f.transportadora_cte, f.transportadora, 'Sem transportadora') AS transportadora,
            COALESCE(f.valor_total_cte, f.valor_frete_negociado, 0)::float AS valor, f.status, ($1::date - f.data_emissao_cte)::int AS dias
       FROM fretes f
      WHERE f.chave_cte IS NOT NULL AND f.fatura_id IS NULL AND f.cte_cancelado IS NOT TRUE AND f.cte_nao_levou IS NOT TRUE
        AND COALESCE(f.status_aprovacao, '') <> 'Rejeitado' AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado', 'Faturado')
        AND ($1::date - COALESCE(f.data_emissao_cte, $1::date)) >= $2
      ORDER BY f.data_emissao_cte NULLS LAST, f.numero_cte`, [hojeBr(), minimo]);
  const porTransp = [...rows.reduce((m, r) => {
    const a = m.get(r.transportadora) || { transportadora: r.transportadora, ctes: 0, valor: 0, mais_antigo: null, acima_30: 0, acima_60: 0 };
    a.ctes += 1; a.valor = r2(a.valor + r.valor); a.mais_antigo = Math.max(a.mais_antigo ?? 0, r.dias ?? 0);
    if (r.dias > 30) a.acima_30 += 1; if (r.dias > 60) a.acima_60 += 1;
    return m.set(r.transportadora, a);
  }, new Map()).values()].sort((a, b) => b.mais_antigo - a.mais_antigo);
  return { dias: minimo, total: rows.length, valor: r2(rows.reduce((s, r) => s + r.valor, 0)), por_transportadora: porTransp, ctes: rows.slice(0, 3000) };
}

// ---------- Vencimentos das faturas ainda não pagas ----------
async function vencimentos() {
  const hoje = hojeBr();
  const { rows } = await pool.query(
    `SELECT id, numero, transportadora, data_vencimento::text, valor_informado, valor_ctes, total_glosas, situacao, bloqueio_motivo, ($1::date - data_vencimento)::int AS dias_atraso
       FROM faturas_frete WHERE pago_em IS NULL ORDER BY data_vencimento NULLS LAST, id`, [hoje]);
  const linhas = rows.map((f) => ({ ...f, valor: valorAPagar(f), faixa: !f.data_vencimento ? 'sem_vencimento' : f.dias_atraso > 0 ? 'vencida' : f.dias_atraso === 0 ? 'hoje' : f.dias_atraso >= -7 ? 'semana' : 'depois' }));
  const resumo = Object.fromEntries(['vencida', 'hoje', 'semana', 'depois', 'sem_vencimento'].map((k) => {
    const l = linhas.filter((x) => x.faixa === k);
    return [k, { qtd: l.length, valor: r2(l.reduce((s, x) => s + x.valor, 0)) }];
  }));
  return { hoje, resumo, faturas: linhas };
}

// Para a Visão geral (o que precisa de atenção nas faturas).
async function pendencias() {
  const hoje = hojeBr();
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE pago_em IS NULL AND data_vencimento < $1::date)::int AS vencidas,
            COUNT(*) FILTER (WHERE pago_em IS NULL AND data_vencimento BETWEEN $1::date AND $1::date + 7)::int AS vencendo,
            COUNT(*) FILTER (WHERE situacao = 'bloqueada')::int AS bloqueadas,
            COUNT(*) FILTER (WHERE situacao IN ('conferida', 'aprovada'))::int AS aguardando,
            COUNT(*) FILTER (WHERE situacao = 'liberada')::int AS liberadas
       FROM faturas_frete`, [hoje]);
  const { rows: [n] } = await pool.query(
    `SELECT COUNT(*)::int AS qtd, COALESCE(SUM(COALESCE(valor_total_cte, valor_frete_negociado, 0)), 0)::float AS valor FROM fretes
      WHERE chave_cte IS NOT NULL AND fatura_id IS NULL AND cte_cancelado IS NOT TRUE AND cte_nao_levou IS NOT TRUE AND COALESCE(status_aprovacao, '') <> 'Rejeitado'
        AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado', 'Faturado') AND data_emissao_cte < $1::date - 30`, [hoje]);
  return { ...r, nao_faturados_30: n.qtd, valor_nao_faturados_30: r2(n.valor) };
}

module.exports = { SITUACOES, valorAPagar, bloquear, desbloquear, aprovar, liberar, pagar, desfazerPagamento, aoConferir, verHistorico, lerPlanilha, importar, naoFaturados, vencimentos, pendencias, historico };
