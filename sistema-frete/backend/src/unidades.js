// Filiais (unidades) e transferências entre elas (estilo SSW).
//  - Cada unidade tem as cidades que ela entrega. O CT-e autorizado nasce na
//    unidade que atende a cidade de início (ou na matriz) e já sabe qual
//    unidade vai entregar (a que atende a cidade de destino).
//  - Manifesto de transferência: CT-e saem de uma unidade para outra; no
//    caminho ficam "em transferência"; na chegada (de preferência bipando
//    os volumes), passam a estar na unidade de destino.
const pool = require('./db');
const oc = require('./cte/ocorrencias');
const { normalizarCidade } = require('./calculoFrete');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const ABERTOS = `c.status = 'autorizado' AND COALESCE(c.situacao_entrega, '') NOT IN ('entregue', 'devolvido') AND COALESCE(c.dados->>'tpCTe', '0') <> '1'`;

// Cria a matriz (com os dados da empresa) na primeira vez e põe nela os CT-e em andamento.
let matrizId = null;
async function garantirMatriz() {
  if (matrizId) return matrizId;
  const { rows } = await pool.query('SELECT id FROM unidades WHERE matriz ORDER BY id LIMIT 1');
  if (rows[0]) { matrizId = rows[0].id; return matrizId; }
  const { rows: e } = await pool.query('SELECT razao_social, nome_fantasia, municipio, uf, telefone FROM empresa WHERE id = 1');
  const emp = e[0] || {};
  const { rows: nova } = await pool.query(
    `INSERT INTO unidades (sigla, nome, cidade, uf, telefone, matriz) VALUES ('MTZ', $1, $2, $3, $4, TRUE)
     ON CONFLICT (sigla) DO UPDATE SET matriz = TRUE RETURNING id`,
    [`Matriz${emp.municipio ? ` — ${emp.municipio}` : ''}`, emp.municipio || null, emp.uf || null, emp.telefone || null]);
  matrizId = nova[0].id;
  await pool.query(
    `UPDATE ctes_emitidos c SET unidade_origem_id = $1, unidade_atual_id = $1, unidade_destino_id = $1
      WHERE ${ABERTOS} AND c.unidade_atual_id IS NULL AND c.em_transferencia_id IS NULL`, [matrizId]);
  return matrizId;
}
const esquecerMatriz = () => { matrizId = null; };

// "Cidade/UF" (ou só cidade) por linha ou separadas por vírgula / ponto e vírgula.
function lerCidades(textoCidades) {
  return String(textoCidades || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^(.*?)\s*[/-]\s*([A-Za-z]{2})$/.exec(x);
    return m ? { cidade: normalizarCidade(m[1]), uf: m[2].toUpperCase() } : { cidade: normalizarCidade(x), uf: null };
  });
}

async function unidadeDaCidade(cidade, uf, cliente = pool) {
  const alvo = normalizarCidade(cidade); const u = String(uf || '').toUpperCase();
  if (!alvo) return null;
  const { rows } = await cliente.query('SELECT id, cidade, uf, cidades FROM unidades WHERE ativa ORDER BY matriz, id');
  // 1º: está na lista de cidades atendidas; 2º: é a cidade da própria unidade.
  for (const x of rows) if (lerCidades(x.cidades).some((k) => k.cidade === alvo && (!k.uf || !u || k.uf === u))) return x.id;
  for (const x of rows) if (normalizarCidade(x.cidade) === alvo && (!x.uf || !u || x.uf === u)) return x.id;
  return null;
}

// CT-e autorizado: unidade de origem (onde a mercadoria está) e a que entrega.
async function aoAutorizar(cteId) {
  const matriz = await garantirMatriz();
  const { rows } = await pool.query('SELECT dados, unidade_atual_id, em_transferencia_id FROM ctes_emitidos WHERE id = $1', [cteId]);
  if (!rows[0] || rows[0].unidade_atual_id || rows[0].em_transferencia_id) return;   // já tem lugar (ex.: substituto herdou do original)
  const d = rows[0].dados || {};
  if (String(d.tpCTe) === '1') return;   // complementar: só valor, a mercadoria é a do original
  const origem = (await unidadeDaCidade(d.inicio?.xMun, d.inicio?.UF)) || matriz;
  const destino = (await unidadeDaCidade(d.fim?.xMun, d.fim?.UF)) || origem;
  await pool.query('UPDATE ctes_emitidos SET unidade_origem_id = $2, unidade_atual_id = $2, unidade_destino_id = $3 WHERE id = $1', [cteId, origem, destino]);
}

// Depois de mudar as cidades das unidades: recalcula quem entrega os CT-e em andamento.
async function recalcularDestinos() {
  const { rows } = await pool.query(`SELECT c.id, c.dados->'fim' AS fim, c.unidade_origem_id FROM ctes_emitidos c WHERE ${ABERTOS}`);
  let n = 0;
  for (const c of rows) {
    const destino = (await unidadeDaCidade(c.fim?.xMun, c.fim?.UF)) || c.unidade_origem_id;
    const r = await pool.query('UPDATE ctes_emitidos SET unidade_destino_id = $2 WHERE id = $1 AND unidade_destino_id IS DISTINCT FROM $2', [c.id, destino]);
    n += r.rowCount;
  }
  return n;
}

function lerUnidade(b = {}) {
  const u = {
    sigla: texto(b.sigla, 6)?.toUpperCase().replace(/[^A-Z0-9]/g, ''), nome: texto(b.nome, 120), cidade: texto(b.cidade, 120), uf: texto(b.uf, 2)?.toUpperCase() || null,
    endereco: texto(b.endereco, 250), telefone: texto(b.telefone, 30), responsavel: texto(b.responsavel, 120), cidades: texto(b.cidades, 20000),
    ativa: b.ativa !== false,
  };
  if (!u.sigla || u.sigla.length < 2) throw falha('Informe a sigla da unidade (2 a 6 letras, ex.: CPS, SPO).');
  if (!u.nome) throw falha('Informe o nome da unidade.');
  if (!u.cidade || !u.uf) throw falha('Informe a cidade e a UF da unidade.');
  return u;
}

// ---------- Onde está a mercadoria ----------
async function estoque() {
  await garantirMatriz();
  const { rows: unidades } = await pool.query('SELECT * FROM unidades ORDER BY matriz DESC, sigla');
  const { rows } = await pool.query(
    `SELECT c.id, c.serie, c.numero, c.destinatario_nome, c.remetente_nome, c.cidade_fim, c.uf_fim, c.previsao_entrega, c.situacao_entrega, c.valor_total, c.dados->'carga' AS carga,
            c.unidade_atual_id, c.unidade_destino_id, c.em_transferencia_id, c.autorizado_em,
            (SELECT ri.romaneio_id FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id WHERE ri.cte_id = c.id AND r.status <> 'fechado' LIMIT 1) AS romaneio_id,
            (SELECT ti.transferencia_id FROM transferencia_itens ti JOIN transferencias t ON t.id = ti.transferencia_id WHERE ti.cte_id = c.id AND t.status = 'aberta' LIMIT 1) AS transferencia_aberta
       FROM ctes_emitidos c WHERE ${ABERTOS} ORDER BY c.previsao_entrega NULLS LAST, c.numero`);
  const vol = (carga) => (carga?.quantidades || []).filter((x) => String(x.cUnid) === '03').reduce((s, x) => s + (Number(x.qCarga) || 0), 0);
  const kg = (carga) => (carga?.quantidades || []).filter((x) => String(x.cUnid) === '01').reduce((s, x) => s + (Number(x.qCarga) || 0), 0);
  const ctes = rows.map(({ carga, ...c }) => ({ ...c, volumes: vol(carga), peso: kg(carga) }));
  return {
    unidades: unidades.map((u) => {
      const aqui = ctes.filter((c) => c.unidade_atual_id === u.id);
      return { ...u, a_entregar: aqui.filter((c) => c.unidade_destino_id === u.id || !c.unidade_destino_id).length, a_transferir: aqui.filter((c) => c.unidade_destino_id && c.unidade_destino_id !== u.id).length,
        chegando: ctes.filter((c) => c.em_transferencia_id && c.unidade_destino_id === u.id).length, volumes: aqui.reduce((s, c) => s + c.volumes, 0), peso: aqui.reduce((s, c) => s + c.peso, 0) };
    }),
    ctes,
  };
}

// ---------- Transferências ----------
async function gravarItens(cliente, t, ids) {
  const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) throw falha('Escolha pelo menos um CT-e para transferir.');
  const { rows } = await cliente.query(
    `SELECT c.id, c.numero, c.status, c.unidade_atual_id, c.situacao_entrega, c.em_transferencia_id,
            (SELECT ti.transferencia_id FROM transferencia_itens ti JOIN transferencias x ON x.id = ti.transferencia_id
              WHERE ti.cte_id = c.id AND x.status = 'aberta' AND x.id <> $2 LIMIT 1) AS outra
       FROM ctes_emitidos c WHERE c.id = ANY($1::int[])`, [lista, t.id]);
  for (const id of lista) {
    const c = rows.find((x) => x.id === id);
    if (!c || c.status !== 'autorizado') throw falha(`O CT-e #${id} não está autorizado.`);
    if (['entregue', 'devolvido'].includes(c.situacao_entrega)) throw falha(`O CT-e ${c.numero} já foi ${c.situacao_entrega}.`);
    if (c.em_transferencia_id) throw falha(`O CT-e ${c.numero} já está em transferência.`);
    if (c.unidade_atual_id !== t.origem_id) throw falha(`O CT-e ${c.numero} não está na unidade de origem desta transferência.`);
    if (c.outra) throw falha(`O CT-e ${c.numero} já está na transferência ${c.outra}, que ainda não saiu.`);
  }
  await cliente.query('DELETE FROM transferencia_itens WHERE transferencia_id = $1', [t.id]);
  await cliente.query('INSERT INTO transferencia_itens (transferencia_id, cte_id) SELECT $1, unnest($2::int[])', [t.id, lista]);
}

function lerCabecalho(b = {}) {
  return {
    motorista_nome: texto(b.motorista_nome, 120), motorista_documento: texto(b.motorista_documento, 30), placa: texto(b.placa, 10)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
    veiculo: texto(b.veiculo, 60), lacre: texto(b.lacre, 60), observacao: texto(b.observacao, 2000),
  };
}

async function criarTransferencia(b, usuarioNome) {
  const origem = Number(b.origem_id); const destino = Number(b.destino_id);
  if (!origem || !destino) throw falha('Escolha a unidade de origem e a de destino.');
  if (origem === destino) throw falha('A origem e o destino são a mesma unidade.');
  const cab = lerCabecalho(b);
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO transferencias (origem_id, destino_id, motorista_nome, motorista_documento, placa, veiculo, lacre, observacao, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [origem, destino, cab.motorista_nome, cab.motorista_documento, cab.placa, cab.veiculo, cab.lacre, cab.observacao, usuarioNome]);
    await gravarItens(cliente, rows[0], b.ctes);
    await cliente.query('COMMIT');
    return rows[0];
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

async function alterarTransferencia(id, b) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM transferencias WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw falha('Transferência não encontrada.', 404);
    if (rows[0].status !== 'aberta') throw falha('A transferência já saiu: não dá para alterar.');
    const cab = lerCabecalho(b);
    await cliente.query('UPDATE transferencias SET motorista_nome = $2, motorista_documento = $3, placa = $4, veiculo = $5, lacre = $6, observacao = $7 WHERE id = $1',
      [id, cab.motorista_nome, cab.motorista_documento, cab.placa, cab.veiculo, cab.lacre, cab.observacao]);
    if (Array.isArray(b.ctes)) await gravarItens(cliente, rows[0], b.ctes);
    await cliente.query('COMMIT');
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

async function detalhe(id) {
  const { rows } = await pool.query(
    `SELECT t.*, o.sigla AS origem_sigla, o.nome AS origem_nome, o.cidade AS origem_cidade, o.uf AS origem_uf,
            d.sigla AS destino_sigla, d.nome AS destino_nome, d.cidade AS destino_cidade, d.uf AS destino_uf
       FROM transferencias t JOIN unidades o ON o.id = t.origem_id JOIN unidades d ON d.id = t.destino_id WHERE t.id = $1`, [id]);
  if (!rows[0]) throw falha('Transferência não encontrada.', 404);
  const { rows: itens } = await pool.query(
    `SELECT c.id AS cte_id, c.serie, c.numero, c.chave, c.destinatario_nome, c.remetente_nome, c.cidade_fim, c.uf_fim, c.valor_total, c.dados->'carga' AS carga, c.dados->'nfes' AS nfes,
            c.unidade_atual_id, c.unidade_destino_id, c.situacao_entrega, (c.em_transferencia_id = i.transferencia_id) AS pendente
       FROM transferencia_itens i JOIN ctes_emitidos c ON c.id = i.cte_id WHERE i.transferencia_id = $1 ORDER BY c.cidade_fim, c.numero`, [id]);
  const { rows: conf } = await pool.query('SELECT id, tipo, status, resumo FROM conferencias WHERE transferencia_id = $1 ORDER BY id', [id]);
  const q = (carga, u) => (carga?.quantidades || []).filter((x) => String(x.cUnid) === u).reduce((s, x) => s + (Number(x.qCarga) || 0), 0);
  return {
    ...rows[0], conferencias: conf,
    itens: itens.map(({ carga, nfes, ...c }) => ({ ...c, volumes: q(carga, '03'), peso: q(carga, '01'), valor_carga: Number(carga?.vCarga) || 0,
      nfs: (nfes || []).map((k) => String(Number(String(k).slice(25, 34)))) })),
  };
}

// Saída do caminhão: os CT-e ficam "em transferência" e ganham a ocorrência.
async function darSaida(id, usuarioNome) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT t.*, o.sigla AS os, o.cidade AS oc, o.uf AS ou, d.sigla AS ds, d.cidade AS dc, d.uf AS du FROM transferencias t
         JOIN unidades o ON o.id = t.origem_id JOIN unidades d ON d.id = t.destino_id WHERE t.id = $1 FOR UPDATE OF t`, [id]);
    const t = rows[0];
    if (!t) throw falha('Transferência não encontrada.', 404);
    if (t.status !== 'aberta') throw falha('Esta transferência já saiu.');
    const { rows: itens } = await cliente.query('SELECT cte_id FROM transferencia_itens WHERE transferencia_id = $1', [id]);
    if (!itens.length) throw falha('A transferência não tem CT-e.');
    const lancadas = [];
    for (const { cte_id: cteId } of itens) {
      await cliente.query('UPDATE ctes_emitidos SET unidade_atual_id = NULL, em_transferencia_id = $2 WHERE id = $1', [cteId, id]);
      lancadas.push(await oc.lancarOcorrencia(cliente, { cteId, usuarioNome, corpo: { tipo_id: 'transferencia', data_hora: oc.agoraBrasilia(), cidade: t.oc, uf: t.ou,
        observacao: `Transferência ${id}: ${t.os} → ${t.ds}${t.placa ? ` · ${t.placa}` : ''}` } }));
    }
    await cliente.query(`UPDATE transferencias SET status = 'em_transito', saiu_em = NOW() WHERE id = $1`, [id]);
    await cliente.query('COMMIT');
    oc.depoisDeLancar(lancadas);
    return itens.length;
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

// Chegada: os CT-e passam a estar na unidade de destino. Se houve conferência
// (bipagem), os que não tiveram nenhum volume lido ficam como "não chegou".
async function receber(id, { usuarioNome, conferenciaId = null } = {}) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT t.*, d.sigla AS ds, d.cidade AS dc, d.uf AS du, o.sigla AS os FROM transferencias t JOIN unidades d ON d.id = t.destino_id JOIN unidades o ON o.id = t.origem_id
        WHERE t.id = $1 FOR UPDATE OF t`, [id]);
    const t = rows[0];
    if (!t) throw falha('Transferência não encontrada.', 404);
    if (t.status !== 'em_transito') throw falha(t.status === 'aberta' ? 'A transferência ainda não saiu.' : 'Esta transferência já foi recebida.');
    let resumo = null;
    if (conferenciaId) {
      const s = await require('./routes/conferencias').situacao(conferenciaId);
      resumo = { conferencia_id: conferenciaId, esperado: s.totais.esperado, lido: s.totais.lido,
        faltas: s.itens.filter((i) => i.faltam.length).map((i) => ({ cte_id: i.cte_id, numero: i.numero, faltam: i.faltam, nada: i.lidos === 0 })),
        sobras: s.sobras.map((x) => ({ cte_id: x.cte_id, numero: x.cte?.numero, volume: x.volume })) };
    }
    const naoChegou = new Set((resumo?.faltas || []).filter((f) => f.nada).map((f) => f.cte_id));
    const { rows: itens } = await cliente.query('SELECT cte_id FROM transferencia_itens WHERE transferencia_id = $1', [id]);
    const lancadas = [];
    for (const { cte_id: cteId } of itens) {
      if (naoChegou.has(cteId)) {
        // Nenhum volume chegou: continua "em transferência" e fica registrado na chegada.
        lancadas.push(await oc.lancarOcorrencia(cliente, { cteId, usuarioNome, corpo: { tipo_id: 'outros', data_hora: oc.agoraBrasilia(), cidade: t.dc, uf: t.du,
          observacao: `Transferência ${id}: nenhum volume chegou na unidade ${t.ds}. Verifique com a origem (${t.os}).` } }));
        continue;
      }
      const falta = (resumo?.faltas || []).find((f) => f.cte_id === cteId);
      await cliente.query('UPDATE ctes_emitidos SET unidade_atual_id = $2, em_transferencia_id = NULL WHERE id = $1', [cteId, t.destino_id]);
      lancadas.push(await oc.lancarOcorrencia(cliente, { cteId, usuarioNome, corpo: { tipo_id: 'chegada', data_hora: oc.agoraBrasilia(), cidade: t.dc, uf: t.du,
        observacao: `Transferência ${id}: chegou na unidade ${t.ds}${falta ? ` — FALTAM os volumes ${falta.faltam.join(', ')}` : ''}` } }));
    }
    await cliente.query(`UPDATE transferencias SET status = 'recebida', chegou_em = NOW(), recebido_por_nome = $2, resumo_chegada = $3 WHERE id = $1`, [id, usuarioNome, resumo]);
    await cliente.query('COMMIT');
    oc.depoisDeLancar(lancadas);
    return { ctes: itens.length - naoChegou.size, nao_chegaram: naoChegou.size, resumo };
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

// CT-e que não chegou junto com a transferência e apareceu depois.
async function chegouDepois(id, cteId, usuarioNome) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT t.id, t.destino_id, d.sigla, d.cidade, d.uf FROM transferencias t JOIN unidades d ON d.id = t.destino_id WHERE t.id = $1 AND t.status = 'recebida'`, [id]);
    if (!rows[0]) throw falha('Transferência não encontrada ou ainda não recebida.', 404);
    const t = rows[0];
    const { rowCount } = await cliente.query('UPDATE ctes_emitidos SET unidade_atual_id = $2, em_transferencia_id = NULL WHERE id = $1 AND em_transferencia_id = $3', [cteId, t.destino_id, id]);
    if (!rowCount) throw falha('Este CT-e não está pendente nesta transferência.', 409);
    const l = await oc.lancarOcorrencia(cliente, { cteId, usuarioNome, corpo: { tipo_id: 'chegada', data_hora: oc.agoraBrasilia(), cidade: t.cidade, uf: t.uf,
      observacao: `Transferência ${id}: chegou depois na unidade ${t.sigla}` } });
    await cliente.query('COMMIT');
    oc.depoisDeLancar([l]);
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

module.exports = { chegouDepois,
  garantirMatriz, esquecerMatriz, lerCidades, unidadeDaCidade, aoAutorizar, recalcularDestinos, lerUnidade, estoque,
  criarTransferencia, alterarTransferencia, detalhe, darSaida, receber,
};
