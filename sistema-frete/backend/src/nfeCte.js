// Integração NF-e × CT-e (embarcador):
//  - CT-e que leva várias notas: liga o CT-e a TODAS as notas que ele cita (o CT-e fica
//    no registro de uma; as outras apontam para ele em cte_coberto_por) e divide o frete
//    entre elas (frete_rateado: pelo peso; sem peso, pelo valor da nota; senão em partes iguais);
//  - conferência campo a campo do CT-e com as notas dele: valor da mercadoria, peso,
//    destinatário e cidade/UF de destino;
//  - a lista única de inconsistências (nota sem CT-e, CT-e sem nota, divergências,
//    transportadora diferente, CT-e cancelado cobrado, cobrança em dobro), com "aceitar";
//  - religar o CT-e à nota certa ou desligar (volta a ser um CT-e sem nota);
//  - a pesquisa por número da NF, do CT-e ou pela chave.
const pool = require('./db');
const { parseCTe } = require('./utils/xmlParser');
const { consultaCliente } = require('./permissoes');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dig = (v) => String(v ?? '').replace(/\D/g, '');
const semZero = (v) => dig(v).replace(/^0+(?=\d)/, '');
const plano = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const numerosDasChaves = (chaves) => (chaves || []).filter((c) => dig(c).length === 44).map((c) => semZero(dig(c).slice(25, 34)));
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

// Leitura do XML do CT-e, guardada enquanto o registro não muda.
const cacheXml = new Map();
function lerCte(linha) {
  if (!linha?.xml_cte_original) return null;
  const k = `${linha.id}:${linha.chave_cte}`;
  if (cacheXml.has(k)) return cacheXml.get(k);
  let d = null;
  try { d = parseCTe(linha.xml_cte_original); } catch { d = null; }
  if (cacheXml.size > 5000) cacheXml.clear();
  cacheXml.set(k, d);
  return d;
}

// ---------- Várias notas no mesmo CT-e ----------
const CAMPOS_COPIA = ['numero_cte', 'transportadora_cte', 'transportadora_cnpj_cte', 'data_emissao_cte'];

// Divide o frete do CT-e entre as notas dele (a do registro do CT-e e as cobertas).
async function ratear(cliente, cteId) {
  const { rows: grupo } = await cliente.query(
    `SELECT id, COALESCE(peso_kg, 0)::float AS peso, COALESCE(valor_faturado, 0)::float AS valor, COALESCE(valor_total_cte, valor_frete_negociado, 0)::float AS frete, cte_coberto_por
       FROM fretes WHERE id = $1 OR cte_coberto_por = $1 ORDER BY (id = $1) DESC, id`, [cteId]);
  if (!grupo.length) return;
  if (grupo.length === 1) { await cliente.query('UPDATE fretes SET frete_rateado = NULL WHERE id = $1 AND frete_rateado IS NOT NULL', [cteId]); return; }
  const frete = grupo[0].frete;
  const base = grupo.every((g) => g.peso > 0) ? 'peso' : grupo.every((g) => g.valor > 0) ? 'valor' : null;
  const total = base ? grupo.reduce((s, g) => s + g[base], 0) : grupo.length;
  let usado = 0;
  for (let i = 0; i < grupo.length; i++) {
    const parte = i === grupo.length - 1 ? r2(frete - usado) : r2((frete * (base ? grupo[i][base] : 1)) / total);
    usado = r2(usado + parte);
    await cliente.query('UPDATE fretes SET frete_rateado = $2 WHERE id = $1', [grupo[i].id, parte]);
  }
}

// Liga o CT-e (registro id) às outras notas que ele cita. Devolve quantas notas foram ligadas.
async function cobrirNotas(id, cliente = pool) {
  const { rows: [m] } = await cliente.query(
    `SELECT id, chave_nfe, chave_cte, xml_cte_original, cte_cancelado, frete_principal_id, ${CAMPOS_COPIA.join(', ')} FROM fretes WHERE id = $1`, [id]);
  if (!m || !m.chave_cte || m.frete_principal_id) return 0;
  // CT-e cancelado: as notas que ele cobria voltam a esperar CT-e.
  if (m.cte_cancelado) { await descobrir(cliente, m.id); return 0; }
  const d = lerCte(m);
  const chaves = (d?.chaves_nfe_referenciadas || []).map(dig).filter((c) => c.length === 44 && c !== dig(m.chave_nfe));
  if (!chaves.length) return 0;
  const { rows: notas } = await cliente.query(
    `SELECT id, cte_coberto_por FROM fretes
      WHERE id <> $1 AND frete_principal_id IS NULL AND chave_cte IS NULL AND cliente IS NOT NULL AND nf_cancelada IS NOT TRUE
        AND (cte_coberto_por IS NULL OR cte_coberto_por = $1)
        AND (chave_nfe = ANY($2::text[]) OR (chave_nfe IS NULL AND LTRIM(numero_nf, '0') = ANY($3::text[])))
        AND NOT EXISTS (SELECT 1 FROM nfe_cte_desvinculos dv WHERE dv.frete_id = fretes.id AND dv.chave_cte = $4)`,
    [m.id, chaves, numerosDasChaves(chaves), m.chave_cte]);
  if (!notas.length) return 0;
  await cliente.query(
    `UPDATE fretes SET cte_coberto_por = $1, ${CAMPOS_COPIA.map((c, i) => `${c} = $${i + 3}`).join(', ')}, atualizado_em = NOW()
      WHERE id = ANY($2::int[])`, [m.id, notas.map((n) => n.id), ...CAMPOS_COPIA.map((c) => m[c])]);
  await ratear(cliente, m.id);
  // Notas novas no CT-e: a conferência pela tabela passa a somar o peso e o valor de todas.
  const novas = notas.filter((n) => !n.cte_coberto_por).length;
  if (novas && cliente === pool) await require('./calculoFrete').calcularEGravar(m.id, 'notas-do-cte').catch(() => null);
  return novas;
}
async function descobrir(cliente, cteId) {
  await cliente.query(`UPDATE fretes SET cte_coberto_por = NULL, frete_rateado = NULL, ${CAMPOS_COPIA.map((c) => `${c} = NULL`).join(', ')}, atualizado_em = NOW() WHERE cte_coberto_por = $1`, [cteId]);
  await cliente.query('UPDATE fretes SET frete_rateado = NULL WHERE id = $1', [cteId]);
}
// Passa por todos os CT-e que citam mais de uma nota (roda depois das importações).
let cobrindo = false;
async function cobrirTodos() {
  if (cobrindo) return 0;
  cobrindo = true;
  let total = 0;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM fretes WHERE chave_cte IS NOT NULL AND frete_principal_id IS NULL AND xml_cte_original IS NOT NULL
         AND (cte_cancelado OR (length(xml_cte_original) - length(replace(xml_cte_original, '<infNFe>', ''))) >= 16)
         AND (cte_cancelado IS NOT TRUE OR EXISTS (SELECT 1 FROM fretes c WHERE c.cte_coberto_por = fretes.id))
       LIMIT 5000`);
    for (const r of rows) total += await cobrirNotas(r.id).catch((e) => { console.error('[nfe-cte] cobrir', r.id, e.message); return 0; });
  } finally { cobrindo = false; }
  return total;
}

// ---------- Conferência campo a campo ----------
const TOL = { valor: { abs: 1, pct: 0.5 }, peso: { abs: 1, pct: 5 } };
const fora = (a, b, t) => Math.abs(a - b) > Math.max(t.abs, (Math.abs(b) * t.pct) / 100);
// Compara o CT-e com as notas dele. notas: [{ valor_faturado, peso_kg, cliente_documento, cidade, uf, cidade_redespacho, redespacho }]
function conferir(d, notas, { vinculo = null } = {}) {
  const problemas = [];
  if (!d || !notas.length) return problemas;
  const somaValor = r2(notas.reduce((s, n) => s + (Number(n.valor_faturado) || 0), 0));
  const somaPeso = r2(notas.reduce((s, n) => s + (Number(n.peso_kg) || 0), 0));
  if (d.valor_carga > 0 && somaValor > 0 && fora(d.valor_carga, somaValor, TOL.valor)) {
    problemas.push({ codigo: 'VALOR', texto: `Valor da mercadoria: CT-e R$ ${d.valor_carga.toFixed(2)} × nota(s) R$ ${somaValor.toFixed(2)}` });
  }
  if (d.peso_kg > 0 && somaPeso > 0 && fora(d.peso_kg, somaPeso, TOL.peso)) {
    problemas.push({ codigo: 'PESO', texto: `Peso: CT-e ${d.peso_kg.toLocaleString('pt-BR')} kg × nota(s) ${somaPeso.toLocaleString('pt-BR')} kg` });
  }
  const docsNotas = [...new Set(notas.map((n) => dig(n.cliente_documento)).filter(Boolean))];
  if (d.destinatario_doc && docsNotas.length && !docsNotas.includes(dig(d.destinatario_doc))) {
    problemas.push({ codigo: 'DESTINATARIO', texto: `Destinatário: CT-e ${d.destinatario_nome || ''} (${d.destinatario_doc}) × nota(s) ${docsNotas.join(', ')}`, suspeito: true });
  }
  const n0 = notas[0];
  if (d.cidade_fim && n0.cidade) {
    const cidadeCte = plano(d.cidade_fim); const ufCte = String(d.uf_fim || '').toUpperCase();
    const destinos = [[plano(n0.cidade), String(n0.uf || '').toUpperCase()]];
    // Com redespacho, a 1ª perna termina na cidade do redespacho.
    if (n0.cidade_redespacho && vinculo !== 'redespacho_nota') destinos.push([plano(n0.cidade_redespacho), null]);
    if (!destinos.some(([c, u]) => c === cidadeCte && (!u || !ufCte || u === ufCte))) {
      problemas.push({ codigo: 'CIDADE', texto: `Destino: CT-e ${d.cidade_fim}/${ufCte} × nota ${n0.cidade}/${n0.uf || ''}${n0.cidade_redespacho ? ` (redespacho ${n0.cidade_redespacho})` : ''}`, suspeito: true });
    }
  }
  return problemas;
}

const NOMES = {
  NF_SEM_CTE: 'Nota sem CT-e', CTE_SEM_NF: 'CT-e sem nota', VALOR: 'Valor da mercadoria diferente', PESO: 'Peso diferente', DESTINATARIO: 'Destinatário diferente (vínculo suspeito)',
  CIDADE: 'Cidade de destino diferente (vínculo suspeito)', TRANSPORTADORA: 'Transportadora da NF-e × CT-e diferente', CTE_CANCELADO: 'CT-e cancelado cobrado', COBRANCA_DUPLA: 'Possível cobrança em dobro',
};

// Lista única. q: { dias (nota sem CT-e há pelo menos N dias; padrão 3), tipo, busca, aceitas }
async function inconsistencias(req, q = {}) {
  const dias = Math.max(0, parseInt(q.dias ?? 3, 10) || 0);
  const hoje = hojeBr();
  const itens = [];
  const add = (f, codigo, texto, extra = {}) => itens.push({
    frete_id: f.id, codigo, nome: NOMES[codigo], texto, numero_nf: f.numero_nf, numero_cte: f.numero_cte, cliente: f.cliente, transportadora: f.transportadora_cte || f.transportadora_nfe || f.transportadora,
    data: f.data_emissao_cte || f.data_emissao_nf, cidade: f.cidade, uf: f.uf, valor: f.valor_total_cte != null ? Number(f.valor_total_cte) : null, ...extra,
  });
  // Nota sem CT-e (e não coberta por CT-e de outra nota).
  const { rows: semCte } = await consultaCliente(req,
    `SELECT id, numero_nf, numero_cte, cliente, transportadora_nfe, transportadora, transportadora_cte, data_emissao_nf, data_emissao_cte, cidade, uf, valor_total_cte, ($1::date - data_emissao_nf)::int AS dias
       FROM fretes WHERE frete_principal_id IS NULL AND chave_cte IS NULL AND cte_coberto_por IS NULL AND cliente IS NOT NULL
        AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE AND nf_entrada IS NOT TRUE AND nf_sem_circulacao IS NOT TRUE
        AND frete_por_conta_cliente IS NOT TRUE AND carga_direta IS NOT TRUE AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')
        AND data_emissao_nf <= $1::date - $2::int
      ORDER BY data_emissao_nf LIMIT 3000`, [hoje, dias]);
  semCte.forEach((f) => add(f, 'NF_SEM_CTE', `Emitida há ${f.dias ?? '?'} dia(s) e ainda sem CT-e`, { dias: f.dias }));
  // CT-e sem nota (a nota não está no sistema).
  const { rows: soltos } = await consultaCliente(req,
    `SELECT id, numero_nf, numero_cte, cliente, transportadora, transportadora_cte, transportadora_nfe, data_emissao_nf, data_emissao_cte, cidade, uf, valor_total_cte, xml_cte_original, chave_cte, ($1::date - data_emissao_cte)::int AS dias
       FROM fretes WHERE chave_cte IS NOT NULL AND frete_principal_id IS NULL AND cte_cancelado IS NOT TRUE AND cliente IS NULL AND NULLIF(TRIM(numero_nf), '') IS NULL
      ORDER BY data_emissao_cte LIMIT 3000`, [hoje]);
  soltos.forEach((f) => {
    const d = lerCte(f);
    const nfs = numerosDasChaves(d?.chaves_nfe_referenciadas || []);
    add(f, 'CTE_SEM_NF', `CT-e de ${f.dias ?? '?'} dia(s) cuja nota não está no sistema${nfs.length ? ` (cita a NF ${nfs.join(', ')})` : ''}`, { dias: f.dias, nfs_citadas: nfs });
  });
  // CT-e com nota: conferência campo a campo e os alertas que já existem.
  const { rows: ctes } = await consultaCliente(req,
    `SELECT f.id, f.numero_nf, f.numero_cte, f.cliente, f.transportadora, f.transportadora_cte, f.transportadora_nfe, f.data_emissao_nf, f.data_emissao_cte, f.cidade, f.uf, f.valor_total_cte,
            f.xml_cte_original, f.chave_cte, f.valor_faturado, f.peso_kg, f.cliente_documento, f.cidade_redespacho, f.redespacho, f.vinculo_cte, f.tipo_cte, f.frete_principal_id,
            f.alerta_transportadora_diferente, f.alerta_cobranca_dupla, f.cte_cancelado, f.fatura_id, f.status
       FROM fretes f WHERE f.chave_cte IS NOT NULL AND f.cliente IS NOT NULL ORDER BY f.data_emissao_cte DESC NULLS LAST LIMIT 5000`);
  const ids = ctes.map((c) => c.id);
  const { rows: cobertas } = ids.length ? await consultaCliente(req,
    'SELECT cte_coberto_por, valor_faturado, peso_kg, cliente_documento, cidade, uf, cidade_redespacho, redespacho FROM fretes WHERE cte_coberto_por = ANY($1::int[])', [ids]) : { rows: [] };
  for (const f of ctes) {
    if (f.cte_cancelado) {
      if (f.fatura_id || ['Liberado p/ Pagamento', 'Faturado'].includes(f.status)) add(f, 'CTE_CANCELADO', `CT-e cancelado e ${f.fatura_id ? 'em fatura' : f.status}`);
      continue;
    }
    if (f.alerta_transportadora_diferente) add(f, 'TRANSPORTADORA', `NF-e: ${f.transportadora_nfe || '—'} · CT-e: ${f.transportadora_cte || '—'}`);
    if (f.alerta_cobranca_dupla && f.status !== 'Cancelado') add(f, 'COBRANCA_DUPLA', 'Nota devolvida e refaturada com CT-e nas duas');
    // CT-e complementar não traz carga para comparar.
    if (Number(f.tipo_cte) === 1 || f.vinculo_cte === 'complementar') continue;
    const d = lerCte(f);
    const notas = [f, ...cobertas.filter((c) => c.cte_coberto_por === f.id)];
    for (const p of conferir(d, notas, { vinculo: f.vinculo_cte })) add(f, p.codigo, p.texto, { suspeito: !!p.suspeito, notas: notas.length });
  }
  // Aceitas (alguém conferiu e explicou): ficam fora, a não ser que peça para ver.
  const { rows: aceites } = await pool.query('SELECT frete_id, codigo, motivo, usuario_nome, criado_em FROM nfe_cte_aceites');
  const chave = (i) => `${i.frete_id}|${i.codigo}`;
  const mapa = new Map(aceites.map((a) => [chave(a), a]));
  let lista = itens.map((i) => ({ ...i, aceite: mapa.get(chave(i)) || null }));
  lista = lista.filter((i) => (q.aceitas === '1' ? !!i.aceite : !i.aceite));
  const resumo = Object.fromEntries(Object.keys(NOMES).map((k) => [k, lista.filter((i) => i.codigo === k).length]));
  if (NOMES[q.tipo]) lista = lista.filter((i) => i.codigo === q.tipo);
  const busca = String(q.busca || '').trim().toUpperCase();
  if (busca) lista = lista.filter((i) => [i.numero_nf, i.numero_cte, i.cliente, i.transportadora].some((v) => String(v || '').toUpperCase().includes(busca)));
  return { dias, nomes: NOMES, resumo, total: Object.values(resumo).reduce((s, n) => s + n, 0), aceitas: aceites.length, itens: lista.slice(0, 5000) };
}

async function aceitar(freteId, codigo, motivo, usuario) {
  if (!NOMES[codigo]) throw falha('Tipo de inconsistência inválido.');
  const m = String(motivo || '').trim().slice(0, 500);
  if (m.length < 5) throw falha('Explique por que está tudo certo (ex.: CT-e de coleta parcial, peso cubado).');
  await pool.query(`INSERT INTO nfe_cte_aceites (frete_id, codigo, motivo, usuario_nome) VALUES ($1, $2, $3, $4)
    ON CONFLICT (frete_id, codigo) DO UPDATE SET motivo = EXCLUDED.motivo, usuario_nome = EXCLUDED.usuario_nome, criado_em = NOW()`, [freteId, codigo, m, usuario]);
}
async function desfazerAceite(freteId, codigo) {
  await pool.query('DELETE FROM nfe_cte_aceites WHERE frete_id = $1 AND codigo = $2', [freteId, codigo]);
}

// ---------- Religar / desligar ----------
const CAMPOS_DO_CTE = () => [...require('./ctesVinculados').CAMPOS_DO_CTE, 'glosa_valor', 'glosa_motivo', 'glosa_registrada_por', 'glosa_registrada_em', 'tp_serv_cte', 'tomador_cte_papel', 'tomador_cte_cnpj', 'tomador_cte_nome'];
// Tira o CT-e do registro (dentro da transação). Devolve os valores dos campos do CT-e.
async function tirarCte(cliente, f, usuario, motivo) {
  if (f.fatura_id) throw falha(`O CT-e ${f.numero_cte} já está na fatura ${f.numero_fatura || ''}: desfaça a conferência da fatura antes.`, 409);
  if (f.frete_principal_id) throw falha('Este é um CT-e a mais da nota (reentrega, complementar, redespacho): não dá para religar por aqui.', 409);
  const campos = CAMPOS_DO_CTE();
  const valores = Object.fromEntries(campos.map((c) => [c, f[c]]));
  await descobrir(cliente, f.id);
  // Lembra que este CT-e não é desta nota (para não ser ligado de novo sozinho).
  if (f.cliente) await cliente.query('INSERT INTO nfe_cte_desvinculos (frete_id, chave_cte) VALUES ($1, $2) ON CONFLICT DO NOTHING', [f.id, f.chave_cte]);
  await cliente.query(
    `UPDATE fretes SET ${campos.map((c) => `${c} = NULL`).join(', ')}, valor_total_calculado = NULL, valor_total_frete = NULL, auditoria_calculo = NULL,
            status = 'Pendente', status_aprovacao = 'Pendente', aprovado_por_nome = NULL, aprovado_em = NULL, motivo_conferencia = NULL,
            alerta_transportadora_diferente = FALSE, cte_cancelado = FALSE, cte_nao_levou = FALSE,
            observacoes = CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $2::text), atualizado_em = NOW()
      WHERE id = $1`, [f.id, `CT-e ${f.numero_cte} desligado desta nota por ${usuario}: ${motivo}`]);
  return valores;
}
async function religar(cteFreteId, notaId, motivo, usuario) {
  const m = String(motivo || '').trim().slice(0, 300);
  if (m.length < 5) throw falha('Diga por que o vínculo estava errado.');
  const cliente = await pool.connect();
  let alvo;
  try {
    await cliente.query('BEGIN');
    const { rows: [f] } = await cliente.query('SELECT * FROM fretes WHERE id = $1 FOR UPDATE', [cteFreteId]);
    if (!f?.chave_cte) throw falha('CT-e não encontrado.', 404);
    const { rows: [n] } = await cliente.query('SELECT * FROM fretes WHERE id = $1 FOR UPDATE', [notaId]);
    if (!n || n.id === f.id) throw falha('Escolha outra nota.');
    if (n.chave_cte || n.frete_principal_id) throw falha(`A NF ${n.numero_nf} já tem CT-e: não dá para ligar outro aqui.`, 409);
    if (n.cte_coberto_por && n.cte_coberto_por !== f.id) throw falha(`A NF ${n.numero_nf} já está coberta por outro CT-e.`, 409);
    const valores = await tirarCte(cliente, f, usuario, m);
    // Registro sem nota (CT-e solto): some depois de passar o CT-e.
    if (!f.cliente && !String(f.numero_nf || '').trim()) await cliente.query('DELETE FROM fretes WHERE id = $1', [f.id]);
    const campos = Object.keys(valores);
    await cliente.query(`UPDATE fretes SET ${campos.map((c, i) => `${c} = $${i + 2}`).join(', ')}, cte_coberto_por = NULL, frete_rateado = NULL,
        transportadora = COALESCE(transportadora, $${campos.length + 2}), observacoes = CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $${campos.length + 3}::text), atualizado_em = NOW() WHERE id = $1`,
    [n.id, ...campos.map((c) => valores[c]), valores.transportadora_cte, `CT-e ${valores.numero_cte} religado a esta nota por ${usuario}: ${m}`]);
    alvo = n;
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  await cobrirNotas(alvo.id).catch(() => 0);
  await require('./calculoFrete').calcularEGravar(alvo.id, 'religar-cte').catch(() => null);
  return { nota: alvo.numero_nf };
}
async function desligar(cteFreteId, motivo, usuario) {
  const m = String(motivo || '').trim().slice(0, 300);
  if (m.length < 5) throw falha('Diga por que o CT-e não é desta nota.');
  const cliente = await pool.connect();
  let novoId;
  try {
    await cliente.query('BEGIN');
    const { rows: [f] } = await cliente.query('SELECT * FROM fretes WHERE id = $1 FOR UPDATE', [cteFreteId]);
    if (!f?.chave_cte) throw falha('CT-e não encontrado.', 404);
    if (!f.cliente) throw falha('Este CT-e já está sem nota.', 409);
    const valores = await tirarCte(cliente, f, usuario, m);
    const campos = Object.keys(valores);
    const { rows: [novo] } = await cliente.query(
      `INSERT INTO fretes (${campos.join(', ')}, transportadora, status, observacoes) VALUES (${campos.map((_, i) => `$${i + 1}`).join(', ')}, $${campos.length + 1}, 'Pendente', $${campos.length + 2}) RETURNING id`,
      [...campos.map((c) => valores[c]), valores.transportadora_cte, `CT-e desligado da NF ${f.numero_nf} por ${usuario}: ${m}`]);
    novoId = novo.id;
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  return { id: novoId };
}

// Notas candidatas para religar um CT-e: as que ele cita (pela chave ou número) e as sem CT-e do mesmo destinatário.
async function candidatas(req, cteFreteId) {
  const { rows: [f] } = await pool.query('SELECT id, xml_cte_original, chave_cte FROM fretes WHERE id = $1', [cteFreteId]);
  if (!f) throw falha('CT-e não encontrado.', 404);
  const d = lerCte(f) || {};
  const chaves = (d.chaves_nfe_referenciadas || []).map(dig);
  const { rows } = await consultaCliente(req,
    `SELECT id, numero_nf, chave_nfe, cliente, cliente_documento, cidade, uf, valor_faturado::float, peso_kg::float, data_emissao_nf, (chave_cte IS NOT NULL) AS tem_cte, cte_coberto_por,
            (chave_nfe = ANY($2::text[]) OR LTRIM(numero_nf, '0') = ANY($3::text[])) AS citada
       FROM fretes WHERE id <> $1 AND frete_principal_id IS NULL AND cliente IS NOT NULL AND nf_cancelada IS NOT TRUE
        AND (chave_nfe = ANY($2::text[]) OR LTRIM(numero_nf, '0') = ANY($3::text[])
             OR (chave_cte IS NULL AND cte_coberto_por IS NULL AND $4::text <> '' AND regexp_replace(COALESCE(cliente_documento, ''), '\\D', '', 'g') = $4::text))
      ORDER BY citada DESC, (chave_cte IS NULL) DESC, data_emissao_nf DESC LIMIT 50`,
    [f.id, chaves, numerosDasChaves(chaves), dig(d.destinatario_doc)]);
  return { cte: { numero: d.numero_cte, destinatario: d.destinatario_nome, destinatario_doc: d.destinatario_doc, cidade: d.cidade_fim, uf: d.uf_fim, valor_carga: d.valor_carga, peso: d.peso_kg, nfs_citadas: numerosDasChaves(chaves) }, notas: rows };
}

// ---------- Pesquisa ----------
// Pelo número da NF, do CT-e ou pela chave (44 dígitos): as notas, os CT-e de cada uma e as notas de cada CT-e.
async function pesquisar(req, termo) {
  const t = dig(termo);
  if (!t) throw falha('Digite o número da NF, do CT-e ou a chave.');
  const n = semZero(t);
  const { rows: achados } = await consultaCliente(req,
    `SELECT id FROM fretes WHERE ${t.length === 44 ? 'chave_nfe = $1 OR chave_cte = $1' : `LTRIM(numero_nf, '0') = $1 OR LTRIM(numero_cte, '0') = $1`} LIMIT 200`, [t.length === 44 ? t : n]);
  if (!achados.length) return { termo: t, grupos: [] };
  // Junta tudo que está ligado: o CT-e da nota, os CT-e a mais (filhos), quem cobre e as cobertas.
  const ids = new Set(achados.map((a) => a.id));
  for (let volta = 0; volta < 2; volta++) {
    const { rows } = await consultaCliente(req,
      `SELECT id FROM fretes WHERE id = ANY($1::int[]) OR frete_principal_id = ANY($1::int[]) OR cte_coberto_por = ANY($1::int[])
          OR id IN (SELECT frete_principal_id FROM fretes WHERE id = ANY($1::int[])) OR id IN (SELECT cte_coberto_por FROM fretes WHERE id = ANY($1::int[]))`, [[...ids]]);
    rows.forEach((r) => ids.add(r.id));
  }
  const { rows } = await consultaCliente(req,
    `SELECT id, numero_nf, chave_nfe, numero_cte, chave_cte, cliente, cidade, uf, transportadora_cte, valor_faturado::float, peso_kg::float, valor_total_cte::float, frete_rateado::float,
            status, vinculo_cte, frete_principal_id, cte_coberto_por, cte_cancelado, data_emissao_nf, data_emissao_cte, data_entrega
       FROM fretes WHERE id = ANY($1::int[]) ORDER BY numero_nf, id`, [[...ids]]);
  // Um grupo por CT-e "principal" (registro com chave_cte, sem ser filho) e as notas sem CT-e.
  const porId = new Map(rows.map((r) => [r.id, r]));
  const grupos = [];
  for (const r of rows.filter((x) => x.chave_cte && !x.frete_principal_id)) {
    grupos.push({ cte: r, notas: [r, ...rows.filter((x) => x.cte_coberto_por === r.id)].filter((x) => x.numero_nf), adicionais: rows.filter((x) => x.frete_principal_id === r.id) });
  }
  for (const r of rows.filter((x) => !x.chave_cte && !x.cte_coberto_por && !x.frete_principal_id)) grupos.push({ cte: null, notas: [r], adicionais: rows.filter((x) => x.frete_principal_id === r.id) });
  return { termo: t, grupos, total: porId.size };
}

module.exports = { cobrirNotas, cobrirTodos, ratear, conferir, inconsistencias, aceitar, desfazerAceite, religar, desligar, candidatas, pesquisar, numerosDasChaves, NOMES };
