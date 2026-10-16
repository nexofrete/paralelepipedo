// Coletas (estilo SSW): o cliente pede, a expedição programa num romaneio
// (o mesmo caminhão e o mesmo código do app do motorista das entregas), o
// motorista dá baixa no celular com volumes, peso, foto e assinatura, e a
// coleta vira rascunho de CT-e — ou se liga sozinha ao CT-e quando a NF-e
// do remetente chega por e-mail.
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const emissao = require('./cte/emissao');

const PASTA = path.join(__dirname, '..', 'dados', 'comprovantes-coleta');
const STATUS = {
  pendente: 'A programar', programada: 'Programada', em_coleta: 'Saiu para coletar', coletada: 'Coletada',
  nao_coletada: 'Não coletada', cancelada: 'Cancelada',
};
const CANAIS = ['telefone', 'whatsapp', 'email', 'presencial', 'edi', 'portal'];
// Motivos que o motorista escolhe quando não coleta.
const MOTIVOS = ['Mercadoria não estava pronta', 'Local fechado / sem responsável', 'Endereço não localizado', 'Cliente cancelou na hora',
  'Volume ou peso maior que o informado', 'Veículo sem espaço', 'Horário fora da janela', 'Outro'];

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const doc = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 20) || null;
const numero = (v, casas = 3) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10 ** casas) / 10 ** casas;
};
const inteiro = (v) => { const n = numero(v, 0); return n == null ? null : Math.round(n); };
const hora = (v) => (/^\d{2}:\d{2}$/.test(String(v || '')) ? v : null);
const dataBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

// Confere e normaliza o formulário da coleta.
function lerColeta(b = {}) {
  const c = {
    canal: CANAIS.includes(b.canal) ? b.canal : 'telefone',
    solicitante_nome: texto(b.solicitante_nome, 120), solicitante_telefone: texto(b.solicitante_telefone, 30), solicitante_email: texto(b.solicitante_email, 250),
    remetente_doc: doc(b.remetente_doc), remetente_nome: texto(b.remetente_nome, 200), remetente_ie: texto(b.remetente_ie, 30),
    logradouro: texto(b.logradouro, 200), numero: texto(b.numero, 30), complemento: texto(b.complemento, 150), bairro: texto(b.bairro, 120),
    cidade: texto(b.cidade, 120), uf: texto(b.uf, 2)?.toUpperCase() || null, cep: texto(String(b.cep || '').replace(/\D/g, ''), 8),
    cod_municipio: texto(String(b.cod_municipio || '').replace(/\D/g, ''), 7),
    contato_nome: texto(b.contato_nome, 120), contato_telefone: texto(b.contato_telefone, 30),
    destinatario_doc: doc(b.destinatario_doc), destinatario_nome: texto(b.destinatario_nome, 200),
    destino_cidade: texto(b.destino_cidade, 120), destino_uf: texto(b.destino_uf, 2)?.toUpperCase() || null,
    tomador: b.tomador === 'destinatario' ? 'destinatario' : 'remetente',
    data_coleta: /^\d{4}-\d{2}-\d{2}$/.test(String(b.data_coleta || '')) ? b.data_coleta : dataBr(),
    hora_de: hora(b.hora_de), hora_ate: hora(b.hora_ate),
    volumes: inteiro(b.volumes), peso_kg: numero(b.peso_kg), cubagem_m3: numero(b.cubagem_m3), valor_mercadoria: numero(b.valor_mercadoria, 2),
    produto: texto(b.produto, 120), notas: texto(b.notas, 250), observacao: texto(b.observacao, 2000),
  };
  if (!c.remetente_nome) throw falha('Informe quem vai entregar a mercadoria (remetente).');
  if (!c.cidade || !c.uf || c.uf.length !== 2) throw falha('Informe a cidade e a UF da coleta.');
  if (!c.logradouro) throw falha('Informe o endereço da coleta.');
  if (c.remetente_doc && ![11, 14].includes(c.remetente_doc.length)) throw falha('CNPJ/CPF do remetente inválido.');
  if (c.destinatario_doc && ![11, 14].includes(c.destinatario_doc.length)) throw falha('CNPJ/CPF do destinatário inválido.');
  if (c.hora_de && c.hora_ate && c.hora_de > c.hora_ate) throw falha('O horário inicial da coleta é depois do final.');
  if (c.data_coleta < new Date(Date.now() - 3 * 3600000 - 30 * 86400000).toISOString().slice(0, 10)) throw falha('Data da coleta muito antiga.');
  return c;
}
const CAMPOS = Object.keys(lerColeta({ remetente_nome: 'x', cidade: 'x', uf: 'SP', logradouro: 'x' }));

// dados.cotacao_id: a coleta nasce de uma cotação aprovada (o CT-e sai com o preço dela).
async function criar(dados, usuarioNome) {
  const c = lerColeta(dados);
  const cotacaoId = Number(dados.cotacao_id) || null;
  if (cotacaoId) {
    const { rows: cot } = await pool.query('SELECT status, coleta_id FROM cotacoes WHERE id = $1', [cotacaoId]);
    if (!cot[0]) throw falha('Cotação não encontrada.', 404);
    if (cot[0].status !== 'aprovada') throw falha('A cotação ainda não foi aprovada.');
    if (cot[0].coleta_id) throw falha(`Esta cotação já virou a coleta ${cot[0].coleta_id}.`, 409);
  }
  const { rows } = await pool.query(
    `INSERT INTO coletas (${CAMPOS.join(', ')}, criado_por_nome, cotacao_id) VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPOS.length + 1}, $${CAMPOS.length + 2}) RETURNING *`,
    [...CAMPOS.map((k) => c[k]), usuarioNome, cotacaoId]);
  if (cotacaoId) await pool.query('UPDATE cotacoes SET coleta_id = $2, atualizado_em = NOW() WHERE id = $1', [cotacaoId, rows[0].id]);
  return rows[0];
}

async function alterar(id, dados) {
  const c = lerColeta(dados);
  const { rows } = await pool.query(
    `UPDATE coletas SET ${CAMPOS.map((k, i) => `${k} = $${i + 2}`).join(', ')}, atualizado_em = NOW()
      WHERE id = $1 AND status IN ('pendente', 'programada', 'em_coleta', 'nao_coletada') RETURNING *`,
    [id, ...CAMPOS.map((k) => c[k])]);
  if (!rows[0]) throw falha('Esta coleta não pode mais ser alterada (já foi coletada ou cancelada).', 409);
  return rows[0];
}

// Coloca coletas num romaneio (aberto ou já na rua).
async function programar(cliente, romaneioId, ids) {
  const { rows: rom } = await cliente.query('SELECT id, status FROM romaneios WHERE id = $1 FOR UPDATE', [romaneioId]);
  if (!rom[0]) throw falha('Romaneio não encontrado.', 404);
  if (rom[0].status === 'fechado') throw falha('Este romaneio já foi fechado.');
  const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) throw falha('Escolha pelo menos uma coleta.');
  const { rows } = await cliente.query('SELECT id, status, romaneio_id FROM coletas WHERE id = ANY($1::int[]) FOR UPDATE', [lista]);
  for (const id of lista) {
    const c = rows.find((x) => x.id === id);
    if (!c) throw falha(`Coleta ${id} não encontrada.`, 404);
    if (!['pendente', 'nao_coletada', 'programada'].includes(c.status)) throw falha(`A coleta ${id} está "${STATUS[c.status]}" e não pode ser programada.`);
  }
  const { rows: ult } = await cliente.query('SELECT COALESCE(MAX(ordem), 0)::int AS n FROM coletas WHERE romaneio_id = $1', [romaneioId]);
  const status = rom[0].status === 'em_rota' ? 'em_coleta' : 'programada';
  await cliente.query(
    `UPDATE coletas c SET romaneio_id = $1, status = $2, motivo = NULL, ordem = $3 + t.o, atualizado_em = NOW()
       FROM unnest($4::int[]) WITH ORDINALITY AS t(x, o) WHERE c.id = t.x`, [romaneioId, status, ult[0].n, lista]);
  return lista.length;
}

async function desprogramar(id) {
  const { rows } = await pool.query(
    `UPDATE coletas c SET romaneio_id = NULL, status = 'pendente', atualizado_em = NOW() FROM romaneios r
      WHERE c.id = $1 AND r.id = c.romaneio_id AND c.status IN ('programada', 'em_coleta') RETURNING c.id`, [id]);
  if (!rows[0]) throw falha('Só dá para tirar do romaneio uma coleta que ainda não foi baixada.', 409);
}

// Saída do caminhão / fechamento / exclusão do romaneio.
const sairComColetas = (cliente, romaneioId) => cliente.query(
  `UPDATE coletas SET status = 'em_coleta', atualizado_em = NOW() WHERE romaneio_id = $1 AND status = 'programada'`, [romaneioId]);
const fecharColetas = (cliente, romaneioId) => cliente.query(
  `UPDATE coletas SET status = 'nao_coletada', motivo = COALESCE(motivo, $2), atualizado_em = NOW()
    WHERE romaneio_id = $1 AND status IN ('programada', 'em_coleta') RETURNING id`, [romaneioId, `Romaneio ${romaneioId} fechado sem baixa da coleta`]);
const soltarColetas = (cliente, romaneioId) => cliente.query(
  `UPDATE coletas SET status = 'pendente', romaneio_id = NULL, atualizado_em = NOW() WHERE romaneio_id = $1 AND status IN ('programada', 'em_coleta')`, [romaneioId]);

async function coletasDoRomaneio(romaneioId, cliente = pool) {
  const { rows } = await cliente.query('SELECT * FROM coletas WHERE romaneio_id = $1 ORDER BY ordem, id', [romaneioId]);
  return rows;
}

// Baixa: { coletado: bool, motivo, volumes, peso, entregue_por, observacao, latitude, longitude }, foto (multer), assinaturaPng (Buffer).
async function baixar(id, b, { foto, assinaturaPng, usuarioNome, romaneioId = null } = {}) {
  const coletado = b.coletado === true || b.coletado === 'true' || b.coletado === '1';
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM coletas WHERE id = $1 FOR UPDATE', [id]);
    const c = rows[0];
    if (!c) throw falha('Coleta não encontrada.', 404);
    if (romaneioId && c.romaneio_id !== romaneioId) throw falha('Esta coleta não é deste romaneio.', 404);
    if (!['pendente', 'programada', 'em_coleta', 'nao_coletada'].includes(c.status)) throw falha(`A coleta já está "${STATUS[c.status]}".`, 409);
    const motivo = texto(b.motivo, 250);
    const obs = texto(b.observacao, 1000);
    if (!coletado && !motivo) throw falha('Informe por que não foi coletada.');
    const volumes = inteiro(b.volumes);
    if (coletado && !volumes) throw falha('Informe quantos volumes foram coletados.');
    const entreguePor = texto(b.entregue_por, 120);
    if (coletado && !entreguePor) throw falha('Informe quem entregou a mercadoria.');
    const salvar = (buffer, ext) => {
      fs.mkdirSync(PASTA, { recursive: true });
      const nome = `coleta-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
      fs.writeFileSync(path.join(PASTA, nome), buffer);
      return nome;
    };
    let nomeFoto = null; let nomeAss = null;
    if (foto) {
      if (!/^image\//.test(foto.mimetype)) throw falha('A foto tem que ser uma imagem.');
      nomeFoto = salvar(foto.buffer, '.jpg');
    }
    if (assinaturaPng) nomeAss = salvar(assinaturaPng, '.png');
    const coord = (v, max) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) && Math.abs(n) <= max ? n : null; };
    const obsMot = [obs, usuarioNome ? `(${usuarioNome})` : null].filter(Boolean).join(' ') || null;
    if (coletado) {
      await cliente.query(
        `UPDATE coletas SET status = 'coletada', coletado_em = NOW(), volumes_coletados = $2, peso_coletado = $3, entregue_por = $4,
                foto_arquivo = COALESCE($5, foto_arquivo), assinatura_arquivo = COALESCE($6, assinatura_arquivo), latitude = $7, longitude = $8,
                obs_motorista = $9, motivo = NULL, atualizado_em = NOW() WHERE id = $1`,
        [id, volumes, numero(b.peso), entreguePor, nomeFoto, nomeAss, coord(b.latitude, 90), coord(b.longitude, 180), obsMot]);
    } else {
      await cliente.query(
        `UPDATE coletas SET status = 'nao_coletada', motivo = $2, foto_arquivo = COALESCE($3, foto_arquivo), latitude = $4, longitude = $5,
                obs_motorista = $6, atualizado_em = NOW() WHERE id = $1`,
        [id, motivo, nomeFoto, coord(b.latitude, 90), coord(b.longitude, 180), obsMot]);
    }
    await cliente.query('COMMIT');
    const { rows: depois } = await pool.query('SELECT * FROM coletas WHERE id = $1', [id]);
    setImmediate(() => avisarSolicitante(depois[0]).catch((e) => console.error('[coletas] aviso:', e.message)));
    return depois[0];
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

// Avisa quem pediu a coleta (mesma chave dos avisos de entrega da Configuração fiscal).
async function avisarSolicitante(c) {
  if (!c || !['coletada', 'nao_coletada'].includes(c.status)) return;
  const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  const e = rows[0] || {};
  if (!e.aviso_entrega_ativo) return;
  const nomeEmpresa = e.nome_fantasia || e.razao_social || 'Transportadora';
  const titulo = c.status === 'coletada' ? `Coleta nº ${c.id} realizada` : `Coleta nº ${c.id} não realizada`;
  const quando = c.coletado_em ? new Date(c.coletado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const linhas = c.status === 'coletada'
    ? [`Olá${c.solicitante_nome ? `, ${c.solicitante_nome}` : ''}.`, `Coletamos a mercadoria de ${c.remetente_nome}${quando ? ` em ${quando}` : ''}: ${c.volumes_coletados} volume(s)${c.peso_coletado ? `, ${Number(c.peso_coletado).toLocaleString('pt-BR')} kg` : ''}.`,
      `Entregue por ${c.entregue_por}.`]
    : [`Olá${c.solicitante_nome ? `, ${c.solicitante_nome}` : ''}.`, `Não conseguimos fazer a coleta em ${c.remetente_nome}: ${c.motivo}.`,
      `Fale com a gente para reagendar${e.telefone ? `: ${e.telefone}` : ''}.`];
  const m = { titulo, linhas, assunto: `${titulo} — ${nomeEmpresa}`, rodape: `Aviso automático de ${nomeEmpresa}.` };
  const email = String(c.solicitante_email || '').trim();
  if (e.aviso_entrega_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await require('./email').enviarAvisoEntrega({ destinatarioEmail: email, ...m, link: null }).catch((err) => console.error('[coletas] e-mail:', err.message));
  }
  const fone = require('./cte/avisosEntrega').celular(c.solicitante_telefone || c.contato_telefone);
  if (e.aviso_entrega_whatsapp && fone) {
    await require('./whatsapp').enviarMensagem([`*${titulo}*`, ...linhas].join('\n'), fone).catch((err) => console.error('[coletas] WhatsApp:', err.message));
  }
}

// Monta a pessoa do CT-e: cadastro de clientes (completo, com IE e código IBGE) ou o que está na coleta.
async function pessoa(documento, nome, endereco = {}) {
  if (documento) {
    const { rows } = await pool.query('SELECT * FROM clientes WHERE documento = $1', [documento]);
    const k = rows[0];
    if (k) {
      return {
        [documento.length === 11 ? 'cpf' : 'cnpj']: documento, ie: k.ie || null, xNome: k.razao_social || nome, xFant: k.nome_fantasia || null, fone: k.telefone || null, email: k.email || null,
        endereco: { xLgr: k.logradouro, nro: k.numero, xCpl: k.complemento, xBairro: k.bairro, cMun: k.cod_municipio, xMun: k.municipio, CEP: k.cep, UF: k.uf },
      };
    }
  }
  if (!nome) return null;
  return { ...(documento ? { [documento.length === 11 ? 'cpf' : 'cnpj']: documento } : {}), xNome: nome, endereco };
}

// Rascunho de CT-e com o que a coleta já sabe (remetente, destinatário, carga).
async function gerarCte(id, usuarioNome) {
  const { rows } = await pool.query('SELECT * FROM coletas WHERE id = $1', [id]);
  const c = rows[0];
  if (!c) throw falha('Coleta não encontrada.', 404);
  if (c.cte_id) {
    const { rows: ct } = await pool.query('SELECT id, status FROM ctes_emitidos WHERE id = $1', [c.cte_id]);
    if (ct[0] && !['cancelado', 'substituido'].includes(ct[0].status)) return { id: ct[0].id, existente: true };
  }
  if (c.status !== 'coletada') throw falha('Gere o CT-e depois que a coleta for feita.');
  const e = await emissao.carregarEmitente();
  const remetente = await pessoa(c.remetente_doc, c.remetente_nome, {
    xLgr: c.logradouro, nro: c.numero, xCpl: c.complemento, xBairro: c.bairro, cMun: c.cod_municipio, xMun: c.cidade, CEP: c.cep, UF: c.uf });
  const destinatario = await pessoa(c.destinatario_doc, c.destinatario_nome, { xMun: c.destino_cidade, UF: c.destino_uf });
  if (remetente && c.remetente_ie && !remetente.ie) remetente.ie = c.remetente_ie;
  const inicio = { cMun: remetente?.endereco?.cMun || c.cod_municipio, xMun: remetente?.endereco?.xMun || c.cidade, UF: remetente?.endereco?.UF || c.uf };
  const fim = { cMun: destinatario?.endereco?.cMun || null, xMun: destinatario?.endereco?.xMun || c.destino_cidade, UF: destinatario?.endereco?.UF || c.destino_uf };
  const vol = c.volumes_coletados || c.volumes;
  const peso = Number(c.peso_coletado ?? c.peso_kg) || 0;
  const dados = {
    tpCTe: '0', tpServ: '0', tomador: c.tomador === 'destinatario' ? '3' : '0', remetente, destinatario, inicio, fim,
    carga: {
      vCarga: Number(c.valor_mercadoria) || 0, proPred: c.produto || 'DIVERSOS',
      quantidades: [{ cUnid: '01', tpMed: 'PESO BRUTO', qCarga: peso }, ...(vol ? [{ cUnid: '03', tpMed: 'VOLUMES', qCarga: vol }] : [])],
    },
    nfes: [], valores: { vTPrest: 0, componentes: [] }, icms: { cst: [1, 4].includes(Number(e.crt)) ? 'SN' : (e.cte_cst_padrao || '00') },
    observacoes: `Coleta nº ${c.id}${c.notas ? ` · NF ${c.notas}` : ''}`,
    origem: { tipo: 'coleta', coleta_id: c.id },
    avisosImportacao: ['Rascunho a partir da coleta: inclua as NF-e (chaves de acesso), confira CFOP, valores e o destino.'],
  };
  // Coleta de cotação aprovada: o CT-e sai com o preço combinado.
  const cot = await require('./cotacoes').cotacaoDaColeta(c.id);
  if (cot) require('./cotacoes').aplicarNoCte(dados, cot, e);
  const r = emissao.resumo(dados);
  const { rows: novo } = await pool.query(
    `INSERT INTO ctes_emitidos (ambiente, dados, valor_total, tomador_nome, remetente_nome, destinatario_nome, cidade_fim, uf_fim, criado_por_nome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [e.cte_ambiente || 2, dados, r.valor_total, r.tomador_nome, r.remetente_nome, r.destinatario_nome, r.cidade_fim, r.uf_fim, usuarioNome]);
  await pool.query('UPDATE coletas SET cte_id = $2, atualizado_em = NOW() WHERE id = $1', [id, novo[0].id]);
  return { id: novo[0].id, existente: false };
}

// Quando a NF-e do remetente vira rascunho de CT-e (e-mail/pasta), liga à
// coleta mais antiga dele que foi feita nos últimos 10 dias e ainda está sem CT-e.
async function vincularCte(cteId, remetenteDoc, origem) {
  const d = doc(remetenteDoc);
  if (!d) return null;
  const { rows } = await pool.query(
    `UPDATE coletas SET cte_id = $1, atualizado_em = NOW() WHERE id = (
       SELECT id FROM coletas WHERE remetente_doc = $2 AND status = 'coletada' AND cte_id IS NULL AND coletado_em > NOW() - INTERVAL '10 days'
        ORDER BY coletado_em LIMIT 1) RETURNING id`, [cteId, d]);
  if (!rows[0]) return null;
  await pool.query(`UPDATE ctes_emitidos SET dados = jsonb_set(dados, '{origem}', $2::jsonb) WHERE id = $1`,
    [cteId, JSON.stringify({ ...(origem || {}), coleta_id: rows[0].id })]);
  // Coleta de cotação aprovada: troca o frete da tabela pelo preço combinado.
  const cotacoes = require('./cotacoes');
  const cot = await cotacoes.cotacaoDaColeta(rows[0].id);
  if (cot) {
    const { rows: ct } = await pool.query('SELECT dados FROM ctes_emitidos WHERE id = $1', [cteId]);
    const dados = cotacoes.aplicarNoCte(ct[0].dados, cot, await emissao.carregarEmitente());
    await pool.query('UPDATE ctes_emitidos SET dados = $2, valor_total = $3 WHERE id = $1', [cteId, dados, dados.valores.vTPrest]);
  }
  return rows[0].id;
}

module.exports = {
  PASTA, STATUS, CANAIS, MOTIVOS, lerColeta, criar, alterar, programar, desprogramar, sairComColetas, fecharColetas, soltarColetas,
  coletasDoRomaneio, baixar, gerarCte, vincularCte, avisarSolicitante,
};
