// Aplica uma devolução / troca de nota (vinda do e-mail) nos registros:
//   NF original   -> marcada como devolvida, ligada à substituta; sai das
//                    entregas a acompanhar (o frete dela continua na auditoria)
//   NF substituta -> ligada à original ("substitui a NF X"), com a informação
//                    de onde está a mercadoria (ex.: com o transportador)
//   NF de retorno -> nota de entrada: não tem frete a acompanhar ("Não cobrado")
// O que ainda não estiver no sistema é aplicado quando a nota for importada.
const pool = require('./db');

const nfIgual = `LTRIM(numero_nf, '0') = LTRIM($1, '0')`;
const hoje = () => new Date().toLocaleDateString('pt-BR');

async function acharNota(nf) {
  if (!nf) return null;
  const { rows } = await pool.query(
    `SELECT id, numero_nf, numero_pedido, data_emissao_nf, criado_em, chave_cte, numero_cte, data_emissao_cte, cte_cancelado, status,
            status_aprovacao, aprovado_por_nome, fatura_id, alerta_cobranca_dupla,
            COALESCE(transportadora_cte, transportadora) AS transportadora, observacoes
       FROM fretes WHERE frete_principal_id IS NULL AND ${nfIgual} ORDER BY criado_em DESC LIMIT 1`, [nf]);
  return rows[0] || null;
}
async function anotar(id, texto, extras = {}) {
  const sets = ["observacoes = CASE WHEN POSITION($2 IN COALESCE(observacoes, '')) > 0 THEN observacoes ELSE CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $2::text) END", 'atualizado_em = NOW()'];
  const valores = [id, texto];
  for (const [c, v] of Object.entries(extras)) { valores.push(v); sets.push(`${c} = $${valores.length}`); }
  await pool.query(`UPDATE fretes SET ${sets.join(', ')} WHERE id = $1`, valores);
}

async function aplicar(troca) {
  const feito = { original: troca.aplicado_original, substituta: troca.aplicado_substituta, retorno: troca.aplicado_retorno };
  const quando = new Date(troca.criado_em || Date.now()).toLocaleDateString('pt-BR');
  const original = await acharNota(troca.nf_original);
  // Retorno de remessa (feira/demonstração): a remessa só fica marcada como "retornou".
  if (troca.tipo === 'retorno') {
    if (original && !feito.original) {
      await anotar(original.id,
        `↩ Retornou (remessa para feira/demonstração) pela NF ${troca.nf_retorno || '?'} em ${quando}.${troca.motivo ? ` ${troca.motivo}` : ''}`
        + ' O CT-e da volta é conferido pelo % de retorno da tabela de preço da transportadora.',
        { nf_retornou: true, troca_id: troca.id });
      feito.original = true;
    }
    await pool.query('UPDATE trocas_nota SET aplicado_original = $2 WHERE id = $1', [troca.id, feito.original]);
    return feito;
  }
  if (original && !feito.original) {
    await anotar(original.id,
      `↩ ${troca.tipo === 'troca' ? 'Troca de nota' : 'Devolução'} ${troca.origem === 'xml' ? 'registrada pela NF-e de devolução' : 'informada por e-mail'} em ${quando}`
      + `${troca.nf_retorno ? ` — nota de retorno ${troca.nf_retorno}` : ''}${troca.nf_substituta ? `, substituída pela NF ${troca.nf_substituta}` : ''}.`
      + `${troca.motivo ? ` Motivo: ${troca.motivo}` : ''}${troca.movimentacao ? ` Mercadoria: ${troca.movimentacao}` : ''}`,
      { nf_devolvida: true, nf_substituida_por: troca.nf_substituta || null, troca_id: troca.id });
    feito.original = true;
  }
  // Sem NF substituta informada: procura a nota REFATURADA — mesmo nº de pedido
  // da nota devolvida, emitida depois dela.
  if (!troca.nf_substituta && original) {
    const refaturada = await acharRefaturada(original, troca);
    if (refaturada) {
      try {
        await pool.query('UPDATE trocas_nota SET nf_substituta = $2 WHERE id = $1', [troca.id, refaturada.numero_nf]);
        troca.nf_substituta = refaturada.numero_nf;
      } catch { /* outra troca já tem essa combinação: segue sem gravar */ }
    }
  }
  const substituta = await acharNota(troca.nf_substituta);
  if (substituta && !feito.substituta) {
    const transp = original?.transportadora;
    const texto = troca.nf_retorno
      ? `↪ Nota fiscal refaturada referente à NF ${troca.nf_original}, que foi devolvida (nota de retorno ${troca.nf_retorno}).`
      : `↪ Substitui a NF ${troca.nf_original} (${troca.tipo === 'troca' ? 'troca de nota' : 'devolução'} registrada em ${quando}).`;
    await anotar(substituta.id,
      texto + `${troca.mercadoria_com_transportador ? ` A mercadoria continua com o transportador${transp ? ` (${transp})` : ''} — o CT-e desta nota deve vir dele.` : ''}`
        + ` A transportadora deve cobrar a entrega uma vez só: no CT-e da NF ${troca.nf_original} ou no desta nota.`,
      { nf_substitui: troca.nf_original, troca_id: troca.id });
    if (original) await pool.query('UPDATE fretes SET nf_substituida_por = $2 WHERE id = $1', [original.id, substituta.numero_nf]);
    feito.substituta = true;
  }
  const retorno = await acharNota(troca.nf_retorno);
  if (retorno && !feito.retorno) {
    await anotar(retorno.id, `Nota de retorno da devolução da NF ${troca.nf_original} (informada por e-mail em ${quando}): não tem frete a acompanhar.`,
      { status: 'Não cobrado', troca_id: troca.id });
    feito.retorno = true;
  }
  await pool.query('UPDATE trocas_nota SET aplicado_original = $2, aplicado_substituta = $3, aplicado_retorno = $4 WHERE id = $1',
    [troca.id, feito.original, feito.substituta, feito.retorno]);
  await verificarCobrancaDupla(troca).catch((e) => console.error('[troca]', e.message));
  return feito;
}

// Nota refaturada: mesmo pedido da devolvida, outro número, emitida depois,
// e não é a nota de retorno nem nota cancelada/devolvida/de entrada.
async function acharRefaturada(original, troca) {
  if (!original?.numero_pedido) return null;
  const { rows } = await pool.query(
    `SELECT id, numero_nf FROM fretes
      WHERE frete_principal_id IS NULL AND numero_pedido = $1
        AND LTRIM(numero_nf, '0') <> LTRIM($2, '0') AND LTRIM(numero_nf, '0') <> LTRIM(COALESCE($3, ''), '0')
        AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE AND nf_entrada IS NOT TRUE AND nf_complementar IS NOT TRUE AND nf_sem_circulacao IS NOT TRUE
        AND COALESCE(data_emissao_nf, criado_em::date) >= COALESCE($4::date, '1900-01-01')
      ORDER BY data_emissao_nf NULLS LAST, id LIMIT 1`,
    [original.numero_pedido, String(original.numero_nf), troca.nf_retorno || '', original.data_emissao_nf || null]);
  return rows[0] || null;
}

// A entrega deve ser cobrada UMA vez: no CT-e da nota devolvida OU no da
// refaturada. Se as duas tiverem CT-e de entrega, o mais novo fica retido com
// o alerta de possível cobrança em dobro (uma pessoa confere e aprova ou rejeita).
async function verificarCobrancaDupla(troca) {
  if (!troca?.nf_substituta) return;
  const devolvida = await acharNota(troca.nf_original);
  const refaturada = await acharNota(troca.nf_substituta);
  const temCte = (n) => n && n.chave_cte && !n.cte_cancelado && !['Cancelado', 'Não cobrado'].includes(n.status);
  if (!temCte(devolvida) || !temCte(refaturada)) return;
  const quando = (n) => String(n.data_emissao_cte || n.criado_em || '');
  const [primeiro, segundo] = quando(devolvida) <= quando(refaturada) ? [devolvida, refaturada] : [refaturada, devolvida];
  if (segundo.alerta_cobranca_dupla) return;
  const aprovadoPorPessoa = segundo.status_aprovacao === 'Aprovado' && !String(segundo.aprovado_por_nome || '').startsWith('Sistema');
  const travar = !aprovadoPorPessoa && !segundo.fatura_id && segundo.status !== 'Faturado';
  await anotar(segundo.id,
    `⚠ Possível cobrança em dobro: a NF ${devolvida.numero_nf} (devolvida) e a NF ${refaturada.numero_nf} (refaturada) são a mesma entrega,`
    + ` e as duas têm CT-e — ${primeiro.numero_nf === devolvida.numero_nf ? 'devolvida' : 'refaturada'}: CT-e ${primeiro.numero_cte || '?'} (${primeiro.transportadora || '—'});`
    + ` esta: CT-e ${segundo.numero_cte || '?'} (${segundo.transportadora || '—'}). A transportadora deve cobrar uma vez só — confira antes de pagar.`,
    travar ? { alerta_cobranca_dupla: true, status: 'Frete Retido' } : { alerta_cobranca_dupla: true });
}

// Nota importada agora: pode ser a REFATURADA de uma devolução (mesmo pedido).
async function verificarRefaturamentoDaNota(freteId) {
  const { rows: f } = await pool.query('SELECT numero_nf, numero_pedido FROM fretes WHERE id = $1 AND frete_principal_id IS NULL', [freteId]);
  if (!f[0]?.numero_pedido) return;
  const { rows } = await pool.query(
    `SELECT t.* FROM trocas_nota t
      WHERE t.nf_substituta IS NULL AND LTRIM(t.nf_original, '0') <> LTRIM($2, '0')
        AND EXISTS (SELECT 1 FROM fretes o WHERE o.frete_principal_id IS NULL AND LTRIM(o.numero_nf, '0') = LTRIM(t.nf_original, '0') AND o.numero_pedido = $1)`,
    [f[0].numero_pedido, String(f[0].numero_nf || '')]);
  for (const t of rows) await aplicar(t);
}

// CT-e gravado agora numa nota: confere se ela faz parte de uma devolução + refaturamento.
async function verificarCobrancaDuplaPorFrete(freteId) {
  const { rows: f } = await pool.query('SELECT numero_nf FROM fretes WHERE id = $1', [freteId]);
  if (!f[0]?.numero_nf) return;
  const { rows } = await pool.query(
    `SELECT * FROM trocas_nota WHERE nf_substituta IS NOT NULL
        AND (LTRIM(nf_original, '0') = LTRIM($1, '0') OR LTRIM(nf_substituta, '0') = LTRIM($1, '0'))`, [String(f[0].numero_nf)]);
  for (const t of rows) await verificarCobrancaDupla(t);
}

async function registrar(dados, usuario, origem = 'email-colado') {
  const { rows } = await pool.query(
    `INSERT INTO trocas_nota (tipo, nf_original, nf_substituta, nf_retorno, pedido, cliente, cnpj_cliente, motivo,
                              representante, movimentacao, mercadoria_com_transportador, texto, origem, registrado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (nf_original, nf_substituta, nf_retorno) DO UPDATE SET motivo = EXCLUDED.motivo, movimentacao = EXCLUDED.movimentacao
     RETURNING *`,
    [dados.tipo || 'devolucao', dados.nf_original, dados.nf_substituta || null, dados.nf_retorno || null, dados.pedido || null,
     dados.cliente || null, dados.cnpj_cliente || null, dados.motivo || null, dados.representante || null, dados.movimentacao || null,
     !!dados.mercadoria_com_transportador, dados.texto || null, origem, usuario?.nome || null]);
  const feito = await aplicar(rows[0]);
  return { troca: rows[0], feito };
}

// Nota importada agora: aplica trocas que estavam esperando por ela.
async function aplicarPendentesDaNota(numeroNf) {
  if (!numeroNf) return;
  const { rows } = await pool.query(
    `SELECT * FROM trocas_nota
      WHERE (LTRIM(nf_original, '0') = LTRIM($1, '0') AND NOT aplicado_original)
         OR (LTRIM(nf_substituta, '0') = LTRIM($1, '0') AND NOT aplicado_substituta)
         OR (LTRIM(nf_retorno, '0') = LTRIM($1, '0') AND NOT aplicado_retorno)`, [String(numeroNf)]);
  for (const t of rows) await aplicar(t);
}

// XML da nota de retorno chegou (e não vira frete): marca a troca como resolvida.
async function marcarRetornoRecebido(numeroNf) {
  if (!numeroNf) return null;
  const { rows } = await pool.query(
    `UPDATE trocas_nota SET aplicado_retorno = TRUE WHERE LTRIM(nf_retorno, '0') = LTRIM($1, '0') RETURNING nf_original`, [String(numeroNf)]);
  return rows[0]?.nf_original || null;
}

async function listar() {
  const { rows } = await pool.query('SELECT * FROM trocas_nota ORDER BY criado_em DESC LIMIT 200');
  return rows;
}

module.exports = { registrar, aplicar, aplicarPendentesDaNota, marcarRetornoRecebido, listar, verificarRefaturamentoDaNota, verificarCobrancaDuplaPorFrete };
