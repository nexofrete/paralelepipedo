// Tratamento das ocorrências de problema (avaria, extravio, falta, recusa, não entregue):
// cada uma nasce "aberta", com prazo, culpa provável e a justificativa; alguém assume
// (responsável), trata e encerra com a solução (e o prejuízo, se houve). Entrega ou
// devolução do CT-e resolve sozinho os "não entregue" e as recusas; avaria, extravio
// e falta continuam até alguém decidir (indenizar, abater no frete...). Várias fotos por
// ocorrência e o histórico de cada passo.
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const texto = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

const STATUS = { aberta: 'Aberta', tratamento: 'Em tratamento', aguardando: 'Aguardando terceiro', resolvida: 'Resolvida' };
const CULPAS = { cliente: 'Cliente (destinatário/remetente)', empresa: 'Empresa (operação)', motorista: 'Motorista', parceiro: 'Parceiro (redespacho)', terceiros: 'Terceiros / força maior', indefinida: 'A definir' };
const SOLUCOES = {
  reentregue: 'Reentregue', devolvido: 'Devolvido ao remetente', indenizado: 'Indenizado ao cliente', abatido: 'Abatido no frete', seguro: 'Acionado o seguro',
  cobrado_parceiro: 'Cobrado do parceiro', aceito: 'Cliente aceitou a mercadoria', localizado: 'Mercadoria localizada', sem_custo: 'Resolvido sem custo', outro: 'Outra solução',
};
// Culpa provável de cada ocorrência (dá para mudar no tratamento).
const CULPA_PADRAO = {
  fechado: 'cliente', ausente: 'cliente', endereco: 'cliente', mudou: 'cliente', horario: 'cliente', reentrega_cliente: 'cliente', balanco: 'cliente',
  sem_pedido: 'cliente', desacordo: 'cliente', negociacao: 'cliente', feriado: 'terceiros', interditada: 'terceiros', fiscalizacao: 'terceiros',
  veiculo: 'empresa', retorno_base: 'empresa', embalagem: 'indefinida',
};
// Dias para resolver, pelo grupo da ocorrência.
const PRAZO_GRUPO = { 'Não entregue': 2, Recusa: 3, Sinistro: 7 };
// Ocorrências que a entrega (ou devolução) resolve sozinha.
const RESOLVE_NA_ENTREGA = ['Não entregue', 'Recusa'];
const somaDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function historico(cliente, ocorrenciaId, acao, detalhe, usuario) {
  await cliente.query('INSERT INTO cte_ocorrencia_historico (ocorrencia_id, acao, detalhe, usuario_nome) VALUES ($1, $2, $3, $4)',
    [ocorrenciaId, acao, detalhe ? String(detalhe).slice(0, 600) : null, usuario]);
}

// Chamado por lancarOcorrencia (dentro da transação) logo depois de gravar a ocorrência.
async function aoLancar(cliente, { ocorrenciaId, item, cteId, corpo = {}, romaneioId, usuarioNome }) {
  if (item.tipo === 'problema') {
    let culpa = CULPAS[corpo.culpa] ? corpo.culpa : CULPA_PADRAO[item.id] || 'indefinida';
    // Problema numa carga que está com o parceiro: a culpa provável é dele (exceto as do cliente).
    if (!CULPAS[corpo.culpa] && culpa !== 'cliente' && culpa !== 'terceiros') {
      const { rows } = await cliente.query(`SELECT 1 FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id
        WHERE ri.cte_id = $1 AND r.parceiro_id IS NOT NULL AND r.status <> 'fechado' ${romaneioId ? 'AND r.id = $2' : ''} LIMIT 1`, romaneioId ? [cteId, romaneioId] : [cteId]);
      if (rows[0]) culpa = 'parceiro';
    }
    const volumes = item.pedeVolumes ? Math.max(0, parseInt(corpo.volumes_faltantes, 10) || 0) || null : null;
    if (item.pedeVolumes && !volumes) throw falha('Informe quantos volumes faltaram.');
    const justificativa = texto(corpo.justificativa) || texto(corpo.observacao) || null;
    const prazo = somaDias(hojeBr(), PRAZO_GRUPO[item.grupo] || 3);
    await cliente.query(`UPDATE cte_ocorrencias SET tratamento_status = 'aberta', prazo_tratamento = $2, culpa = $3, justificativa = $4, volumes_faltantes = $5 WHERE id = $1`,
      [ocorrenciaId, prazo, culpa, justificativa, volumes]);
    await historico(cliente, ocorrenciaId, 'aberta', `${item.rotulo}${volumes ? ` · ${volumes} volume(s) faltando` : ''} · culpa: ${CULPAS[culpa]}${justificativa ? ` · ${justificativa}` : ''}`, usuarioNome);
    return;
  }
  // Entregue ou devolvido: o que impedia a entrega está resolvido.
  if (item.tipo === 'entrega' || item.tipo === 'devolucao') {
    const solucao = item.tipo === 'entrega' ? 'reentregue' : 'devolvido';
    const grupos = require('./ocorrencias').CATALOGO.filter((c) => RESOLVE_NA_ENTREGA.includes(c.grupo)).map((c) => c.id);
    const { rows } = await cliente.query(
      `UPDATE cte_ocorrencias SET tratamento_status = 'resolvida', solucao = $3, solucao_texto = COALESCE(solucao_texto, $4), resolvida_em = NOW(), resolvida_por = $5
        WHERE cte_id = $1 AND tratamento_status IS NOT NULL AND tratamento_status <> 'resolvida' AND tipo_id = ANY($2::text[]) RETURNING id`,
      [cteId, grupos, solucao, `${item.rotulo} (encerrada automaticamente)`, usuarioNome]);
    for (const r of rows) await historico(cliente, r.id, 'resolvida', `${SOLUCOES[solucao]} — encerrada automaticamente pela ocorrência "${item.rotulo}"`, usuarioNome);
  }
}

// ---------- Fotos ----------
function salvarArquivoFoto(buffer, ocorrenciaId) {
  const { PASTA } = require('./ocorrencias');
  const tipo = require('../utils/arquivoSeguro').detectarTipo(buffer, { pdf: false });
  if (!tipo) throw falha('As fotos devem ser imagens (JPG, PNG, WEBP, HEIC).');
  fs.mkdirSync(PASTA, { recursive: true });
  const nome = `oc-${ocorrenciaId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${tipo.ext}`;
  fs.writeFileSync(path.join(PASTA, nome), buffer);
  return nome;
}
async function adicionarFotos(cliente, ocorrenciaId, arquivos = [], usuarioNome, legenda = null) {
  const lista = (arquivos || []).slice(0, 10);
  if (!lista.length) return 0;
  const { rows: [{ n }] } = await cliente.query('SELECT COUNT(*)::int AS n FROM cte_ocorrencia_fotos WHERE ocorrencia_id = $1', [ocorrenciaId]);
  if (n + lista.length > 30) throw falha('No máximo 30 fotos por ocorrência.');
  for (const a of lista) {
    const nome = salvarArquivoFoto(a.buffer, ocorrenciaId);
    await cliente.query('INSERT INTO cte_ocorrencia_fotos (ocorrencia_id, arquivo, legenda, usuario_nome) VALUES ($1, $2, $3, $4)', [ocorrenciaId, nome, texto(legenda, 150) || null, usuarioNome]);
  }
  await historico(cliente, ocorrenciaId, 'fotos', `${lista.length} foto(s) anexada(s)`, usuarioNome);
  return lista.length;
}
async function fotos(ocorrenciaId) {
  const { rows } = await pool.query('SELECT id, legenda, usuario_nome, criado_em FROM cte_ocorrencia_fotos WHERE ocorrencia_id = $1 ORDER BY id', [ocorrenciaId]);
  return rows;
}
async function arquivoFoto(fotoId) {
  const { rows } = await pool.query('SELECT arquivo FROM cte_ocorrencia_fotos WHERE id = $1', [fotoId]);
  return rows[0]?.arquivo || null;
}
async function apagarFoto(fotoId, usuarioNome) {
  const { rows } = await pool.query('DELETE FROM cte_ocorrencia_fotos WHERE id = $1 RETURNING ocorrencia_id, arquivo', [fotoId]);
  if (!rows[0]) throw falha('Foto não encontrada.', 404);
  fs.rm(path.join(require('./ocorrencias').PASTA, rows[0].arquivo), { force: true }, () => {});
  await historico(pool, rows[0].ocorrencia_id, 'fotos', 'Apagou uma foto', usuarioNome);
}

// ---------- Tratamento ----------
// Lista do tratamento: { status: abertas (padrão: tudo que não está resolvido) | resolvidas | todas, responsavel, culpa, busca, de, ate }.
async function listar(q = {}) {
  const val = []; const cond = ['o.tratamento_status IS NOT NULL'];
  const st = q.status || 'pendentes';
  if (st === 'pendentes') cond.push(`o.tratamento_status <> 'resolvida'`);
  else if (STATUS[st]) { val.push(st); cond.push(`o.tratamento_status = $${val.length}`); }
  else if (st === 'vencidas') { val.push(hojeBr()); cond.push(`o.tratamento_status <> 'resolvida' AND o.prazo_tratamento < $${val.length}::date`); }
  else if (st === 'sem_responsavel') cond.push(`o.tratamento_status <> 'resolvida' AND o.responsavel_nome IS NULL`);
  if (q.responsavel === 'eu' && q.usuarioId) { val.push(q.usuarioId); cond.push(`o.responsavel_id = $${val.length}`); }
  if (CULPAS[q.culpa]) { val.push(q.culpa); cond.push(`o.culpa = $${val.length}`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.de || '')) { val.push(q.de); cond.push(`o.data_hora::date >= $${val.length}::date`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.ate || '')) { val.push(q.ate); cond.push(`o.data_hora::date <= $${val.length}::date`); }
  const busca = texto(q.busca, 80);
  if (busca) {
    val.push(`%${busca}%`);
    cond.push(`(CAST(c.numero AS TEXT) = $${val.length + 1} OR COALESCE(c.destinatario_nome, c.dados->'destinatario'->>'xNome') ILIKE $${val.length} OR c.tomador_nome ILIKE $${val.length}
      OR o.descricao ILIKE $${val.length} OR o.responsavel_nome ILIKE $${val.length})`);
    val.push(busca.replace(/\D/g, '') || '-');
  }
  const { rows } = await pool.query(
    `SELECT o.id, o.cte_id, o.tipo_id, o.descricao, o.data_hora, o.cidade, o.uf, o.observacao, o.origem, o.romaneio_id, o.usuario_nome,
            o.tratamento_status, o.responsavel_id, o.responsavel_nome, o.prazo_tratamento::text, o.culpa, o.justificativa, o.volumes_faltantes,
            o.solucao, o.solucao_texto, o.prejuizo::float, o.resolvida_em, o.resolvida_por, (o.comprovante_arquivo IS NOT NULL) AS tem_comprovante,
            (SELECT COUNT(*)::int FROM cte_ocorrencia_fotos f WHERE f.ocorrencia_id = o.id) AS fotos,
            c.serie, c.numero, c.situacao_entrega, COALESCE(c.destinatario_nome, c.dados->'destinatario'->>'xNome') AS destinatario_nome, c.tomador_nome,
            COALESCE(c.cidade_fim, c.dados->'fim'->>'xMun') AS cidade_fim, COALESCE(c.uf_fim, c.dados->'fim'->>'UF') AS uf_fim, c.valor_total::float,
            (SELECT p.nome FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN parceiros p ON p.id = r.parceiro_id WHERE ri.cte_id = c.id ORDER BY r.id DESC LIMIT 1) AS parceiro
       FROM cte_ocorrencias o JOIN ctes_emitidos c ON c.id = o.cte_id
      WHERE ${cond.join(' AND ')}
      ORDER BY (o.tratamento_status = 'resolvida'), o.prazo_tratamento NULLS LAST, o.data_hora DESC LIMIT 1000`, val);
  return rows;
}

// Muda a ocorrência: { acao: assumir | repassar | status | culpa | resolver | reabrir | prazo | justificar, ... }.
async function atualizar(id, b, usuario) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [o] } = await cliente.query('SELECT * FROM cte_ocorrencias WHERE id = $1 FOR UPDATE', [id]);
    if (!o) throw falha('Ocorrência não encontrada.', 404);
    if (!o.tratamento_status) throw falha('Esta ocorrência não é um problema a tratar.');
    const resolvida = o.tratamento_status === 'resolvida';
    const set = async (campos, acao, detalhe) => {
      const k = Object.keys(campos);
      await cliente.query(`UPDATE cte_ocorrencias SET ${k.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...k.map((c) => campos[c])]);
      await historico(cliente, id, acao, detalhe, usuario.nome);
    };
    switch (b.acao) {
      case 'assumir':
        if (resolvida) throw falha('Ocorrência já resolvida.', 409);
        await set({ responsavel_id: usuario.id, responsavel_nome: usuario.nome, tratamento_status: o.tratamento_status === 'aberta' ? 'tratamento' : o.tratamento_status }, 'responsavel', `${usuario.nome} assumiu o tratamento`);
        break;
      case 'repassar': {
        if (resolvida) throw falha('Ocorrência já resolvida.', 409);
        const { rows: [u] } = await cliente.query('SELECT id, nome FROM usuarios WHERE id = $1 AND ativo IS NOT FALSE', [Number(b.responsavel_id)]);
        if (!u) throw falha('Escolha o responsável.');
        await set({ responsavel_id: u.id, responsavel_nome: u.nome, tratamento_status: o.tratamento_status === 'aberta' ? 'tratamento' : o.tratamento_status }, 'responsavel',
          `Repassada para ${u.nome}${texto(b.motivo, 300) ? `: ${texto(b.motivo, 300)}` : ''}`);
        break;
      }
      case 'status':
        if (!['tratamento', 'aguardando'].includes(b.status)) throw falha('Situação inválida.');
        if (resolvida) throw falha('Ocorrência resolvida: reabra para mudar.', 409);
        await set({ tratamento_status: b.status }, 'status', `${STATUS[b.status]}${texto(b.detalhe, 400) ? `: ${texto(b.detalhe, 400)}` : ''}`);
        break;
      case 'culpa':
        if (!CULPAS[b.culpa]) throw falha('Escolha de quem foi a culpa.');
        await set({ culpa: b.culpa, justificativa: texto(b.justificativa) || o.justificativa }, 'culpa', `Culpa: ${CULPAS[b.culpa]}${texto(b.justificativa) ? ` · ${texto(b.justificativa, 400)}` : ''}`);
        break;
      case 'prazo':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.prazo || '')) throw falha('Informe o novo prazo.');
        await set({ prazo_tratamento: b.prazo }, 'prazo', `Prazo para ${b.prazo.split('-').reverse().join('/')}${texto(b.motivo, 300) ? `: ${texto(b.motivo, 300)}` : ''}`);
        break;
      case 'comentar':
        if (!texto(b.comentario)) throw falha('Escreva o comentário.');
        await historico(cliente, id, 'comentario', texto(b.comentario, 600), usuario.nome);
        break;
      case 'resolver': {
        if (resolvida) throw falha('Ocorrência já resolvida.', 409);
        if (!SOLUCOES[b.solucao]) throw falha('Escolha a solução.');
        const desc = texto(b.solucao_texto);
        if (desc.length < 5) throw falha('Descreva como foi resolvido.');
        const prejuizo = b.prejuizo === '' || b.prejuizo == null ? null : Number(String(b.prejuizo).includes(',') ? String(b.prejuizo).replace(/\./g, '').replace(',', '.') : b.prejuizo);
        if (prejuizo != null && (!Number.isFinite(prejuizo) || prejuizo < 0)) throw falha('Prejuízo inválido.');
        const culpa = CULPAS[b.culpa] ? b.culpa : o.culpa;
        if (!culpa || culpa === 'indefinida') throw falha('Antes de encerrar, diga de quem foi a culpa.');
        await set({ tratamento_status: 'resolvida', solucao: b.solucao, solucao_texto: desc, prejuizo: prejuizo != null ? Math.round(prejuizo * 100) / 100 : null, culpa,
          resolvida_em: new Date(), resolvida_por: usuario.nome, responsavel_id: o.responsavel_id || usuario.id, responsavel_nome: o.responsavel_nome || usuario.nome },
        'resolvida', `${SOLUCOES[b.solucao]} · ${desc}${prejuizo ? ` · prejuízo R$ ${prejuizo.toFixed(2)}` : ''} · culpa: ${CULPAS[culpa]}`);
        break;
      }
      case 'reabrir':
        if (!resolvida) throw falha('A ocorrência não está resolvida.', 409);
        if (texto(b.motivo).length < 5) throw falha('Diga por que reabrir.');
        await set({ tratamento_status: 'tratamento', resolvida_em: null, resolvida_por: null }, 'reaberta', texto(b.motivo, 400));
        break;
      default: throw falha('Ação inválida.');
    }
    await cliente.query('COMMIT');
    const { rows: [c] } = await pool.query('SELECT numero FROM ctes_emitidos WHERE id = $1', [o.cte_id]);
    return { id, cte_id: o.cte_id, numero: c?.numero, descricao: o.descricao };
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

async function detalhe(id) {
  const [{ rows: hist }, ft] = await Promise.all([
    pool.query('SELECT * FROM cte_ocorrencia_historico WHERE ocorrencia_id = $1 ORDER BY id', [id]),
    fotos(id),
  ]);
  return { historico: hist, fotos: ft };
}

async function responsaveis() {
  const { rows } = await pool.query(`SELECT id, nome FROM usuarios WHERE ativo IS NOT FALSE AND (perfil = 'admin' OR pode_emitir_cte) ORDER BY nome`);
  return rows;
}

// ---------- Relatório ----------
async function relatorio({ de, ate } = {}) {
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(ate || '') ? ate : hojeBr();
  const ini = /^\d{4}-\d{2}-\d{2}$/.test(de || '') ? de : `${fim.slice(0, 7)}-01`;
  const { rows } = await pool.query(
    `SELECT o.descricao, o.culpa, o.tratamento_status, o.responsavel_nome, o.solucao, COALESCE(o.prejuizo, 0)::float AS prejuizo, o.prazo_tratamento::text,
            EXTRACT(EPOCH FROM (o.resolvida_em - o.data_hora)) / 86400 AS dias_resolver, (o.resolvida_em::date > o.prazo_tratamento) AS fora_prazo,
            c.tomador_nome AS cliente,
            (SELECT p.nome FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN parceiros p ON p.id = r.parceiro_id WHERE ri.cte_id = c.id ORDER BY r.id DESC LIMIT 1) AS parceiro
       FROM cte_ocorrencias o JOIN ctes_emitidos c ON c.id = o.cte_id
      WHERE o.tratamento_status IS NOT NULL AND o.data_hora::date BETWEEN $1::date AND $2::date`, [ini, fim]);
  const hoje = hojeBr();
  const agrupar = (chave) => [...rows.reduce((m, r) => {
    const k = chave(r) || '—';
    const a = m.get(k) || { chave: k, qtd: 0, resolvidas: 0, abertas: 0, vencidas: 0, prejuizo: 0, soma_dias: 0 };
    a.qtd += 1; a.prejuizo += r.prejuizo;
    if (r.tratamento_status === 'resolvida') { a.resolvidas += 1; a.soma_dias += Number(r.dias_resolver) || 0; } else { a.abertas += 1; if (r.prazo_tratamento && r.prazo_tratamento < hoje) a.vencidas += 1; }
    return m.set(k, a);
  }, new Map()).values()].map((a) => ({ ...a, prejuizo: Math.round(a.prejuizo * 100) / 100, tempo_medio: a.resolvidas ? Math.round((a.soma_dias / a.resolvidas) * 10) / 10 : null, soma_dias: undefined }))
    .sort((a, b) => b.qtd - a.qtd);
  const geral = agrupar(() => 'Total')[0] || { qtd: 0, resolvidas: 0, abertas: 0, vencidas: 0, prejuizo: 0, tempo_medio: null };
  return {
    de: ini, ate: fim, geral, no_prazo: rows.filter((r) => r.tratamento_status === 'resolvida' && !r.fora_prazo).length,
    por_tipo: agrupar((r) => r.descricao), por_culpa: agrupar((r) => CULPAS[r.culpa] || 'A definir'), por_responsavel: agrupar((r) => r.responsavel_nome || 'Sem responsável'),
    por_cliente: agrupar((r) => r.cliente || 'Sem cliente').slice(0, 50), por_parceiro: agrupar((r) => r.parceiro).filter((x) => x.chave !== '—'),
    por_solucao: agrupar((r) => (r.solucao ? SOLUCOES[r.solucao] : null) || 'Em aberto'),
  };
}

async function pendencias() {
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE tratamento_status <> 'resolvida' AND prazo_tratamento < $1::date)::int AS vencidas,
            COUNT(*) FILTER (WHERE tratamento_status <> 'resolvida' AND responsavel_nome IS NULL)::int AS sem_responsavel,
            COUNT(*) FILTER (WHERE tratamento_status <> 'resolvida')::int AS abertas
       FROM cte_ocorrencias WHERE tratamento_status IS NOT NULL`, [hojeBr()]);
  return r;
}

module.exports = { STATUS, CULPAS, SOLUCOES, CULPA_PADRAO, PRAZO_GRUPO, aoLancar, adicionarFotos, fotos, arquivoFoto, apagarFoto, listar, atualizar, detalhe, responsaveis, relatorio, pendencias, historico };
