// Parceiros e redespacho (estilo SSW): agentes e transportadoras que entregam
// onde a empresa não tem filial. Cadastro com a área atendida (UFs e cidades)
// e a tabela de custo; repasse das cargas num "romaneio de redespacho" (o
// parceiro dá baixa pelo app do motorista, com o código); conta-corrente com
// o custo de cada CT-e, ajustes, pagamentos e o acerto que vira conta a pagar.
// O CT-e do parceiro lançado em Notas de entrada baixa o custo dos CT-e dele.
const pool = require('./db');
const Doc = require('./utils/documento');
const contasPagar = require('./contasPagar');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => { if (v === '' || v == null) return 0; const n = typeof v === 'number' ? v : Number(String(v).includes(',') ? String(v).replace(/\./g, '').replace(',', '.') : v); return Number.isFinite(n) ? n : 0; };
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
// "São Paulo/sp" → "SAO PAULO/SP"
const cidadeChave = (cidade, uf) => `${String(cidade || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()}/${String(uf || '').toUpperCase().trim()}`;
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const TIPOS = {
  custo: { nome: 'Custo do redespacho', sinal: 1 },
  frete_recebido: { nome: 'Frete recebido pelo parceiro (fica com ele)', sinal: -1 },
  pagamento: { nome: 'Pagamento ao parceiro', sinal: -1 },
  recebimento: { nome: 'Recebido do parceiro', sinal: 1 },
  ajuste: { nome: 'Ajuste', sinal: 0 },
};
// Serviços que o parceiro oferece (aparecem na escolha do repasse).
const SERVICOS = {
  fracionado: 'Carga fracionada', lotacao: 'Lotação (carga fechada)', dedicado: 'Veículo dedicado', coleta: 'Coleta',
  agendada: 'Entrega agendada', expressa: 'Entrega expressa', refrigerada: 'Carga refrigerada', perigosa: 'Produtos perigosos (MOPP)',
  reversa: 'Logística reversa', reentrega: 'Reentrega / devolução', armazenagem: 'Armazenagem',
};
// Documentos com vencimento. Os obrigatórios vencidos impedem o repasse (o administrador pode liberar caso a caso).
const DOCUMENTOS = {
  rntrc: { nome: 'RNTRC (ANTT)', obrigatorio: true },
  rctrc: { nome: 'Seguro RCTR-C', obrigatorio: true },
  rcfdc: { nome: 'Seguro RCF-DC' },
  contrato: { nome: 'Contrato de prestação de serviço' },
  cnd: { nome: 'Certidão negativa de débitos' },
  alvara: { nome: 'Alvará de funcionamento' },
  licenca: { nome: 'Licença ambiental / produtos perigosos' },
  outro: { nome: 'Outro documento' },
};
const TIPOS_CONTA = ['corrente', 'poupanca', 'pagamento'];

// ---------- Cadastro ----------
function lerParceiro(b = {}) {
  const documento = Doc.limpar(b.documento);
  if (!Doc.valido(documento)) throw falha('CNPJ/CPF do parceiro inválido.');
  const nome = texto(b.nome, 200);
  if (!nome) throw falha('Informe o nome do parceiro.');
  const ufs = [...new Set((Array.isArray(b.ufs) ? b.ufs : String(b.ufs || '').split(/[\s,;]+/)).map((u) => String(u).toUpperCase().trim()).filter((u) => UFS.includes(u)))];
  // Cidades: uma por linha, "Cidade/UF" ou "Cidade - UF".
  const cidades = [...new Set((Array.isArray(b.cidades) ? b.cidades : String(b.cidades || '').split(/\n|;/)).map((c) => {
    const m = /^(.+?)\s*[/-]\s*([A-Za-z]{2})\s*$/.exec(String(c).trim());
    return m && UFS.includes(m[2].toUpperCase()) ? cidadeChave(m[1], m[2]) : null;
  }).filter(Boolean))];
  const p = {
    documento, nome, fantasia: texto(b.fantasia, 120), rntrc: texto(b.rntrc, 20), contato_nome: texto(b.contato_nome, 120), telefone: texto(b.telefone, 30), email: texto(b.email, 250), pix: texto(b.pix, 120),
    ufs, cidades, custo_percentual: num(b.custo_percentual), custo_kg: num(b.custo_kg), custo_fixo: num(b.custo_fixo), custo_minimo: num(b.custo_minimo),
    prazo_dias: Math.max(0, parseInt(b.prazo_dias, 10) || 0), observacao: texto(b.observacao, 2000), ativo: b.ativo !== false,
    ie: texto(b.ie, 30), cep: texto(String(b.cep || '').replace(/\D/g, ''), 10), logradouro: texto(b.logradouro, 200), numero: texto(b.numero, 20), complemento: texto(b.complemento, 100),
    bairro: texto(b.bairro, 120), municipio: texto(b.municipio, 120), uf: UFS.includes(String(b.uf || '').toUpperCase().trim()) ? String(b.uf).toUpperCase().trim() : null,
    contatos: JSON.stringify((Array.isArray(b.contatos) ? b.contatos : []).map((c) => ({ nome: texto(c?.nome, 120), funcao: texto(c?.funcao, 60), telefone: texto(c?.telefone, 30), email: texto(c?.email, 250) }))
      .filter((c) => c.nome || c.telefone || c.email).slice(0, 10)),
    banco: texto(b.banco, 100), agencia: texto(b.agencia, 20), conta: texto(b.conta, 30), tipo_conta: TIPOS_CONTA.includes(b.tipo_conta) ? b.tipo_conta : null,
    servicos: [...new Set((Array.isArray(b.servicos) ? b.servicos : []).filter((x) => SERVICOS[x]))],
  };
  for (const c of JSON.parse(p.contatos)) if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw falha(`E-mail do contato ${c.nome || ''} inválido.`);
  if (p.custo_percentual < 0 || p.custo_percentual > 100) throw falha('Percentual do frete de 0 a 100.');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw falha('E-mail inválido.');
  return p;
}
const CAMPOS = ['documento', 'nome', 'fantasia', 'rntrc', 'contato_nome', 'telefone', 'email', 'pix', 'ufs', 'cidades', 'custo_percentual', 'custo_kg', 'custo_fixo', 'custo_minimo', 'prazo_dias', 'observacao', 'ativo',
  'ie', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'contatos', 'banco', 'agencia', 'conta', 'tipo_conta', 'servicos'];
async function salvar(id, b) {
  const p = lerParceiro(b);
  try {
    if (id) {
      const { rows } = await pool.query(`UPDATE parceiros SET ${CAMPOS.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...CAMPOS.map((c) => p[c])]);
      if (!rows[0]) throw falha('Parceiro não encontrado.', 404);
      return rows[0];
    }
    const { rows } = await pool.query(`INSERT INTO parceiros (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, CAMPOS.map((c) => p[c]));
    return rows[0];
  } catch (e) { if (e.code === '23505') throw falha('Já existe parceiro com este CNPJ/CPF.', 409); throw e; }
}

// Saldo e pendências de cada parceiro.
async function listar() {
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE((SELECT SUM(valor) FROM parceiro_lancamentos l WHERE l.parceiro_id = p.id AND l.status = 'aberto'), 0)::float AS saldo,
            (SELECT COUNT(*)::int FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
              WHERE r.parceiro_id = p.id AND c.situacao_entrega NOT IN ('entregue', 'devolvido') AND c.status = 'autorizado') AS em_aberto,
            (SELECT COUNT(*)::int FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
              WHERE r.parceiro_id = p.id AND c.situacao_entrega NOT IN ('entregue', 'devolvido') AND c.status = 'autorizado' AND c.previsao_entrega < $1::date) AS atrasados
       FROM parceiros p ORDER BY p.ativo DESC, p.nome`, [hojeBr()]);
  const docs = await documentosDe(rows.map((p) => p.id));
  const de = new Date(Date.parse(`${hojeBr()}T12:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  const ind = await indicadores(rows.map((p) => p.id), de, hojeBr());
  const { rows: tab } = await pool.query('SELECT parceiro_id, COUNT(*)::int AS n FROM parceiro_tabela GROUP BY parceiro_id');
  return rows.map((p) => {
    const d = docs.filter((x) => x.parceiro_id === p.id);
    return {
      ...p, custo_percentual: Number(p.custo_percentual), custo_kg: Number(p.custo_kg), custo_fixo: Number(p.custo_fixo), custo_minimo: Number(p.custo_minimo),
      docs_vencidos: d.filter((x) => x.situacao === 'vencido').length, docs_vencendo: d.filter((x) => x.situacao === 'vencendo').length,
      docs_faltando: Object.entries(DOCUMENTOS).filter(([k, t]) => t.obrigatorio && !d.some((x) => x.tipo === k)).map(([, t]) => t.nome),
      impedido: impedimento(p, d), tabela_linhas: tab.find((t) => t.parceiro_id === p.id)?.n || 0, indicadores: ind[p.id] || resumir([]),
    };
  });
}

// Por que o parceiro não pode receber carga agora (null = pode).
function impedimento(p, docs) {
  if (p.bloqueado) return `Bloqueado${p.bloqueio_motivo ? `: ${p.bloqueio_motivo}` : ''}`;
  const venc = docs.filter((d) => d.situacao === 'vencido' && DOCUMENTOS[d.tipo]?.obrigatorio);
  if (venc.length) return `Documento vencido: ${venc.map((d) => `${d.nome} (${d.validade.split('-').reverse().join('/')})`).join(', ')}`;
  return null;
}

// Quem atende a cidade: primeiro quem tem a cidade na lista, depois quem atende a UF inteira.
async function sugerir(cidade, uf) {
  const { rows } = await pool.query(
    `SELECT id, nome, prazo_dias, ($1 = ANY(cidades) OR EXISTS (SELECT 1 FROM parceiro_tabela t WHERE t.parceiro_id = p.id AND t.cidade = $1)) AS pela_cidade FROM parceiros p
      WHERE ativo AND NOT bloqueado AND ($1 = ANY(cidades) OR $2 = ANY(ufs) OR EXISTS (SELECT 1 FROM parceiro_tabela t WHERE t.parceiro_id = p.id AND t.uf = $2 AND (t.cidade IS NULL OR t.cidade = $1)))
      ORDER BY 4 DESC, nome`,
    [cidadeChave(cidade, uf), String(uf || '').toUpperCase()]);
  return rows;
}

// Linha da tabela do parceiro que vale para o destino e o peso: a da cidade antes da do estado;
// na mesma região, a menor faixa de peso que cabe (sem faixa = qualquer peso). Sem linha: o custo do cadastro.
function regra(p, linhas = [], { cidade, uf, peso = 0 } = {}) {
  const chave = cidade ? cidadeChave(cidade, uf) : null;
  const u = String(uf || '').toUpperCase();
  const cabe = (l) => l.peso_ate == null || Number(peso) <= Number(l.peso_ate);
  const ordem = (a, b) => (a.peso_ate == null) - (b.peso_ate == null) || Number(a.peso_ate) - Number(b.peso_ate);
  const daCidade = linhas.filter((l) => l.uf === u && l.cidade && l.cidade === chave && cabe(l)).sort(ordem);
  const doEstado = linhas.filter((l) => l.uf === u && !l.cidade && cabe(l)).sort(ordem);
  const l = daCidade[0] || doEstado[0];
  if (!l) return { custo_percentual: p.custo_percentual, custo_kg: p.custo_kg, custo_fixo: p.custo_fixo, custo_minimo: p.custo_minimo, prazo_dias: p.prazo_dias, origem: 'cadastro', regiao: null };
  return { custo_percentual: l.custo_percentual, custo_kg: l.custo_kg, custo_fixo: l.custo_fixo, custo_minimo: l.custo_minimo, prazo_dias: l.prazo_dias, origem: 'tabela',
    regiao: `${l.cidade || `${l.uf} (estado)`}${l.peso_ate != null ? ` até ${Number(l.peso_ate).toLocaleString('pt-BR')} kg` : ''}` };
}
async function tabelaDe(ids) {
  const { rows } = await pool.query(`SELECT * FROM parceiro_tabela WHERE parceiro_id = ANY($1::int[]) ORDER BY uf, cidade NULLS FIRST, peso_ate NULLS LAST`, [ids]);
  return rows.map((l) => ({ ...l, peso_ate: l.peso_ate == null ? null : Number(l.peso_ate), custo_percentual: Number(l.custo_percentual), custo_kg: Number(l.custo_kg), custo_fixo: Number(l.custo_fixo), custo_minimo: Number(l.custo_minimo) }));
}
// Custo e prazo do CT-e com este parceiro (pela tabela dele ou pelo cadastro).
function previsto(p, linhas, { frete = 0, peso = 0, cidade, uf } = {}) {
  const r = regra(p, linhas, { cidade, uf, peso });
  return { valor: custoPrevisto(r, { frete, peso }), prazo_dias: r.prazo_dias, origem: r.origem, regiao: r.regiao };
}

// Custo previsto do CT-e pela tabela do parceiro.
function custoPrevisto(p, { frete = 0, peso = 0 } = {}) {
  const v = Number(p.custo_fixo || 0) + (Number(frete) * Number(p.custo_percentual || 0)) / 100 + Number(peso) * Number(p.custo_kg || 0);
  return centavos(Math.max(v, Number(p.custo_minimo || 0)));
}
const pesoKg = (d = {}) => {
  const q = d.carga?.quantidades || [];
  const kg = q.find((x) => String(x.cUnid).padStart(2, '0') === '01');
  if (kg) return Number(kg.qCarga) || 0;
  const t = q.find((x) => String(x.cUnid).padStart(2, '0') === '02');
  return t ? (Number(t.qCarga) || 0) * 1000 : 0;
};

// ---------- Repasse ao parceiro (romaneio de redespacho) ----------
// Monta o romaneio com o parceiro, dá a saída ("Entregue ao redespacho") e lança o custo previsto de cada CT-e.
async function repassar(parceiroId, ctes, usuario, { forcar = false } = {}) {
  const { rows: [p] } = await pool.query('SELECT * FROM parceiros WHERE id = $1 AND ativo', [parceiroId]);
  if (!p) throw falha('Escolha um parceiro ativo.');
  if (p.bloqueado) throw falha(`${p.nome} está bloqueado${p.bloqueio_motivo ? ` (${p.bloqueio_motivo})` : ''}. Libere o parceiro antes de repassar cargas.`, 409);
  const imp = impedimento(p, await documentosDe([p.id]));
  if (imp && !forcar) throw Object.assign(falha(`${p.nome}: ${imp}. Atualize o documento ou peça ao administrador para liberar este repasse.`, 409), { documento_vencido: true });
  const linhas = await tabelaDe([p.id]);
  const lista = [...new Set((ctes || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) throw falha('Marque os CT-e.');
  const romaneios = require('./routes/romaneios');
  const cliente = await pool.connect();
  let id;
  try {
    await cliente.query('BEGIN');
    const codigo = romaneios.novoCodigo();
    ({ rows: [{ id }] } = await cliente.query(
      `INSERT INTO romaneios (data, motorista_nome, motorista_documento, motorista_telefone, observacao, codigo_acesso, criado_por_nome, parceiro_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [hojeBr(), p.fantasia || p.nome, p.documento, p.telefone, `Redespacho por ${p.nome}`, codigo, usuario, p.id]));
    await romaneios.gravarItens(cliente, id, lista);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  await romaneios.darSaida(id, usuario);
  const { rows: cs } = await pool.query('SELECT id, serie, numero, dados, valor_total, previsao_entrega::text, cidade_fim, uf_fim FROM ctes_emitidos WHERE id = ANY($1::int[])', [lista]);
  let total = 0;
  for (const c of cs) {
    const prev = previsto(p, linhas, { frete: Number(c.dados?.valores?.vTPrest ?? c.valor_total) || 0, peso: pesoKg(c.dados), cidade: c.cidade_fim, uf: c.uf_fim });
    const valor = prev.valor;
    total += valor;
    if (valor > 0) {
      await pool.query(`INSERT INTO parceiro_lancamentos (parceiro_id, data, tipo, valor, cte_id, romaneio_id, descricao, usuario_nome) VALUES ($1, $2, 'custo', $3, $4, $5, $6, $7)`,
        [p.id, hojeBr(), valor, c.id, id, `Redespacho do CT-e ${c.serie}/${c.numero} (previsto ${prev.origem === 'tabela' ? `pela tabela: ${prev.regiao}` : 'pelo cadastro'})`, usuario]);
    }
    // Prazo do parceiro (da região na tabela ou do cadastro): a ocorrência do redespacho leva a nova previsão (previsão + dias dele).
    if (prev.prazo_dias > 0 && c.previsao_entrega) {
      await pool.query(`UPDATE cte_ocorrencias SET nova_previsao = $3::date + $4::int WHERE romaneio_id = $1 AND cte_id = $2 AND tipo_id = 'redespacho'`, [id, c.id, c.previsao_entrega, prev.prazo_dias]);
      await require('./cte/ocorrencias').recalcularSituacao(c.id);
    }
    // CT-e que já estava atrasado ao ser repassado não conta contra o parceiro: o prazo dele corre do repasse.
    await pool.query(`UPDATE romaneio_itens SET prometido_parceiro = GREATEST(COALESCE($3::date, $4::date), $4::date) + $5::int WHERE romaneio_id = $1 AND cte_id = $2`,
      [id, c.id, c.previsao_entrega, hojeBr(), prev.prazo_dias || 0]);
  }
  const { rows: [r] } = await pool.query('SELECT codigo_acesso FROM romaneios WHERE id = $1', [id]);
  return { romaneio_id: id, codigo: r.codigo_acesso, ctes: cs.length, custo_previsto: centavos(total), parceiro: p.nome };
}

// ---------- Conta-corrente ----------
async function extrato(parceiroId, { status = 'aberto' } = {}) {
  const { rows: [p] } = await pool.query('SELECT * FROM parceiros WHERE id = $1', [parceiroId]);
  if (!p) throw falha('Parceiro não encontrado.', 404);
  const { rows } = await pool.query(
    `SELECT l.*, l.data::text, l.valor::float, c.serie, c.numero, c.situacao_entrega, c.destinatario_nome, c.cidade_fim, c.uf_fim, n.numero AS nota_numero
       FROM parceiro_lancamentos l LEFT JOIN ctes_emitidos c ON c.id = l.cte_id LEFT JOIN notas_entrada n ON n.id = l.nota_entrada_id
      WHERE l.parceiro_id = $1 ${status === 'aberto' ? `AND l.status = 'aberto'` : ''} ORDER BY l.data DESC, l.id DESC LIMIT 1000`, [p.id]);
  const abertos = status === 'aberto' ? rows : rows.filter((l) => l.status === 'aberto');
  const { rows: acertos } = await pool.query(
    `SELECT a.*, a.ate::text, a.saldo::float, cp.status AS conta_status, cp.vencimento::text AS conta_vencimento FROM parceiro_acertos a LEFT JOIN contas_pagar cp ON cp.id = a.conta_pagar_id
      WHERE a.parceiro_id = $1 ORDER BY a.id DESC LIMIT 50`, [p.id]);
  const { rows: cargas } = await pool.query(
    `SELECT c.id, c.serie, c.numero, c.destinatario_nome, c.cidade_fim, c.uf_fim, c.situacao_entrega, c.previsao_entrega::text, c.data_entrega, r.id AS romaneio_id, r.codigo_acesso, r.status AS romaneio_status
       FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
      WHERE r.parceiro_id = $1 AND (c.situacao_entrega NOT IN ('entregue', 'devolvido') OR c.data_entrega > NOW() - INTERVAL '30 days') ORDER BY c.situacao_entrega IN ('entregue', 'devolvido'), c.previsao_entrega`, [p.id]);
  return { parceiro: p, lancamentos: rows.map((l) => ({ ...l, tipo_nome: TIPOS[l.tipo]?.nome || l.tipo })), saldo: centavos(abertos.reduce((s, l) => s + l.valor, 0)), acertos, cargas, tipos: Object.fromEntries(Object.entries(TIPOS).map(([k, t]) => [k, t.nome])) };
}

// Lançamento à mão: { tipo, valor (positivo), data, descricao, cte (número) }. O sinal sai do tipo (ajuste: o sinal digitado).
async function lancar(parceiroId, b, usuario) {
  const t = TIPOS[b.tipo];
  if (!t) throw falha('Escolha o tipo do lançamento.');
  let v = num(b.valor);
  if (!v) throw falha('Informe o valor.');
  if (t.sinal) v = Math.abs(v) * t.sinal;
  const descricao = texto(b.descricao, 300);
  if (b.tipo === 'ajuste' && !descricao) throw falha('Diga o motivo do ajuste.');
  let cteId = null;
  if (String(b.cte || '').trim()) {
    const { rows } = await pool.query(`SELECT id FROM ctes_emitidos WHERE numero::text = $1 AND status = 'autorizado' ORDER BY id DESC LIMIT 1`, [String(b.cte).replace(/\D/g, '')]);
    if (!rows[0]) throw falha('CT-e não encontrado.');
    cteId = rows[0].id;
  }
  const { rows } = await pool.query(
    `INSERT INTO parceiro_lancamentos (parceiro_id, data, tipo, valor, cte_id, descricao, usuario_nome) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [parceiroId, iso(b.data) || hojeBr(), b.tipo, centavos(v), cteId, descricao || t.nome, usuario]);
  return rows[0];
}
async function alterarValor(id, valor, motivo) {
  const v = num(valor);
  const { rows } = await pool.query(`UPDATE parceiro_lancamentos SET valor = $2, descricao = COALESCE(descricao, '') || $3 WHERE id = $1 AND status = 'aberto' RETURNING *`,
    [id, centavos(v), motivo ? ` · ajustado: ${String(motivo).slice(0, 100)}` : '']);
  if (!rows[0]) throw falha('Só dá para alterar lançamento em aberto.', 409);
  return rows[0];
}
async function excluirLancamento(id) {
  const { rowCount } = await pool.query(`DELETE FROM parceiro_lancamentos WHERE id = $1 AND status = 'aberto'`, [id]);
  if (!rowCount) throw falha('Só dá para apagar lançamento em aberto.', 409);
}

// Acerto: fecha os lançamentos em aberto até a data. Saldo a favor do parceiro vira conta a pagar.
async function acertar(parceiroId, { ate, vencimento }, usuario) {
  const fim = iso(ate) || hojeBr();
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [p] } = await cliente.query('SELECT * FROM parceiros WHERE id = $1 FOR UPDATE', [parceiroId]);
    if (!p) throw falha('Parceiro não encontrado.', 404);
    const { rows: abertos } = await cliente.query(`SELECT id, valor FROM parceiro_lancamentos WHERE parceiro_id = $1 AND status = 'aberto' AND data <= $2::date FOR UPDATE`, [p.id, fim]);
    if (!abertos.length) throw falha('Nada em aberto até esta data.');
    const saldo = centavos(abertos.reduce((s, l) => s + Number(l.valor), 0));
    let contaId = null;
    if (saldo > 0) {
      if (!iso(vencimento)) throw falha('Informe o vencimento do pagamento ao parceiro.');
      const [c] = await contasPagar.criar({ descricao: `Acerto de redespacho — ${p.nome} (até ${fim.split('-').reverse().join('/')})`, categoria: 'frete_terceiro',
        fornecedor_nome: p.nome, fornecedor_doc: p.documento, competencia: fim, vencimento, valor: saldo, parcelas: 1, observacao: p.pix ? `PIX do parceiro: ${p.pix}` : null }, usuario, { cliente });
      contaId = c.id;
    }
    const { rows: [a] } = await cliente.query('INSERT INTO parceiro_acertos (parceiro_id, ate, saldo, conta_pagar_id, usuario_nome) VALUES ($1, $2, $3, $4, $5) RETURNING id', [p.id, fim, saldo, contaId, usuario]);
    await cliente.query(`UPDATE parceiro_lancamentos SET status = 'acertado', acerto_id = $2 WHERE id = ANY($1::int[])`, [abertos.map((l) => l.id), a.id]);
    await cliente.query('COMMIT');
    return { acerto_id: a.id, saldo, conta_pagar_id: contaId, lancamentos: abertos.length, parceiro: p.nome };
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

// ---------- CT-e do parceiro em Notas de entrada ----------
// O parceiro emite o CT-e de redespacho contra a empresa (tomadora), citando o nosso CT-e (docAnt) ou as NF-e.
// Os custos em aberto desses CT-e saem da conta-corrente (a nota já gerou a conta a pagar).
async function aoLancarNotaEntrada(notaId, { emitenteDoc, xml }) {
  if (!xml) return null;
  const { rows: [p] } = await pool.query('SELECT id, nome FROM parceiros WHERE documento = $1', [Doc.limpar(emitenteDoc)]);
  if (!p) return null;
  const chaves = [...new Set((String(xml).match(/<(?:chCTe|chave|chNFe)>(\d{44})<\/(?:chCTe|chave|chNFe)>/g) || []).map((x) => x.replace(/\D/g, '')))];
  if (!chaves.length) return null;
  const { rows } = await pool.query(
    `UPDATE parceiro_lancamentos l SET status = 'acertado', nota_entrada_id = $2, descricao = COALESCE(l.descricao, '') || ' · confirmado pelo CT-e do parceiro'
      FROM ctes_emitidos c WHERE l.cte_id = c.id AND l.parceiro_id = $1 AND l.tipo = 'custo' AND l.status = 'aberto'
        AND (c.chave = ANY($3::text[]) OR c.dados->'nfes' ?| $3::text[]) RETURNING l.id`, [p.id, notaId, chaves]);
  return { parceiro: p.nome, custos: rows.length };
}

// ---------- Tabela de frete por região e faixa de peso ----------
// linhas: [{ uf, cidade, peso_ate, custo_percentual, custo_kg, custo_fixo, custo_minimo, prazo_dias }] — troca a tabela toda.
async function salvarTabela(parceiroId, linhas) {
  const { rows: [p] } = await pool.query('SELECT id FROM parceiros WHERE id = $1', [parceiroId]);
  if (!p) throw falha('Parceiro não encontrado.', 404);
  const lidas = (Array.isArray(linhas) ? linhas : []).slice(0, 2000).map((l, i) => {
    const uf = String(l.uf || '').toUpperCase().trim();
    if (!UFS.includes(uf)) throw falha(`Linha ${i + 1}: escolha o estado.`);
    const cidade = String(l.cidade || '').trim() ? cidadeChave(String(l.cidade).replace(/\s*[/-]\s*[A-Za-z]{2}\s*$/, ''), uf) : null;
    const pesoAte = l.peso_ate === '' || l.peso_ate == null ? null : num(l.peso_ate);
    if (pesoAte != null && pesoAte <= 0) throw falha(`Linha ${i + 1}: a faixa de peso tem de ser maior que zero.`);
    const r = { uf, cidade, peso_ate: pesoAte, custo_percentual: num(l.custo_percentual), custo_kg: num(l.custo_kg), custo_fixo: num(l.custo_fixo), custo_minimo: num(l.custo_minimo), prazo_dias: Math.max(0, parseInt(l.prazo_dias, 10) || 0) };
    if (r.custo_percentual < 0 || r.custo_percentual > 100) throw falha(`Linha ${i + 1}: percentual do frete de 0 a 100.`);
    if ([r.custo_kg, r.custo_fixo, r.custo_minimo].some((v) => v < 0)) throw falha(`Linha ${i + 1}: valores não podem ser negativos.`);
    return r;
  });
  const vistos = new Set();
  for (const l of lidas) { const k = `${l.uf}|${l.cidade}|${l.peso_ate}`; if (vistos.has(k)) throw falha(`Linha repetida: ${l.cidade || l.uf}${l.peso_ate != null ? ` até ${l.peso_ate} kg` : ''}.`); vistos.add(k); }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('DELETE FROM parceiro_tabela WHERE parceiro_id = $1', [parceiroId]);
    for (const l of lidas) {
      await cliente.query(`INSERT INTO parceiro_tabela (parceiro_id, uf, cidade, peso_ate, custo_percentual, custo_kg, custo_fixo, custo_minimo, prazo_dias) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [parceiroId, l.uf, l.cidade, l.peso_ate, l.custo_percentual, l.custo_kg, l.custo_fixo, l.custo_minimo, l.prazo_dias]);
    }
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  return tabelaDe([parceiroId]);
}

// ---------- Documentos com vencimento ----------
async function documentosDe(ids) {
  const { situacao } = require('./frotaDocumentos');
  const hoje = hojeBr();
  const { rows } = await pool.query(`SELECT id, parceiro_id, tipo, numero, validade::text, aviso_dias, observacao, atualizado_por, atualizado_em FROM parceiro_documentos WHERE parceiro_id = ANY($1::int[]) ORDER BY parceiro_id, tipo`, [ids]);
  return rows.map((d) => ({ ...d, nome: DOCUMENTOS[d.tipo]?.nome || d.tipo, obrigatorio: !!DOCUMENTOS[d.tipo]?.obrigatorio, ...situacao(d, hoje) }));
}
async function documentos(parceiroId) {
  const docs = await documentosDe([parceiroId]);
  return { documentos: docs, faltam: Object.entries(DOCUMENTOS).filter(([k, t]) => t.obrigatorio && !docs.some((d) => d.tipo === k)).map(([k, t]) => ({ tipo: k, nome: t.nome })),
    tipos: Object.fromEntries(Object.entries(DOCUMENTOS).map(([k, t]) => [k, t.nome])) };
}
async function salvarDocumento(parceiroId, b, usuario) {
  if (!DOCUMENTOS[b.tipo]) throw falha('Escolha o tipo do documento.');
  const { rows: [p] } = await pool.query('SELECT id FROM parceiros WHERE id = $1', [parceiroId]);
  if (!p) throw falha('Parceiro não encontrado.', 404);
  const validade = iso(b.validade);
  if (!validade && b.tipo !== 'outro' && b.tipo !== 'contrato') throw falha('Informe a validade.');
  const aviso = Math.min(Math.max(parseInt(b.aviso_dias, 10) || 30, 1), 180);
  const { rows } = await pool.query(
    `INSERT INTO parceiro_documentos (parceiro_id, tipo, numero, validade, aviso_dias, observacao, atualizado_por, atualizado_em) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (parceiro_id, tipo) DO UPDATE SET numero = EXCLUDED.numero, validade = EXCLUDED.validade, aviso_dias = EXCLUDED.aviso_dias, observacao = EXCLUDED.observacao,
       atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW() RETURNING id`,
    [parceiroId, b.tipo, texto(b.numero, 60), validade, aviso, texto(b.observacao, 300), usuario]);
  // O RNTRC do cadastro acompanha o documento.
  if (b.tipo === 'rntrc' && texto(b.numero, 20)) await pool.query('UPDATE parceiros SET rntrc = $2 WHERE id = $1', [parceiroId, texto(b.numero, 20)]);
  return { id: rows[0].id, nome: DOCUMENTOS[b.tipo].nome };
}
async function excluirDocumento(id) {
  const { rows } = await pool.query('DELETE FROM parceiro_documentos WHERE id = $1 RETURNING parceiro_id, tipo', [id]);
  if (!rows[0]) throw falha('Documento não encontrado.', 404);
  return { ...rows[0], nome: DOCUMENTOS[rows[0].tipo]?.nome || rows[0].tipo };
}

// ---------- Bloqueio e liberação ----------
async function bloquear(parceiroId, motivo, usuario) {
  const m = texto(motivo, 300);
  if (!m) throw falha('Diga o motivo do bloqueio.');
  const { rows: [p] } = await pool.query(`UPDATE parceiros SET bloqueado = TRUE, bloqueio_motivo = $2, bloqueado_em = NOW(), bloqueado_por = $3 WHERE id = $1 AND NOT bloqueado RETURNING id, nome`, [parceiroId, m, usuario]);
  if (!p) throw falha('Parceiro não encontrado ou já bloqueado.', 409);
  await pool.query(`INSERT INTO parceiro_bloqueios (parceiro_id, acao, motivo, usuario_nome) VALUES ($1, 'bloqueio', $2, $3)`, [parceiroId, m, usuario]);
  return p;
}
async function liberar(parceiroId, motivo, usuario) {
  const m = texto(motivo, 300);
  if (!m) throw falha('Diga o motivo da liberação.');
  const { rows: [p] } = await pool.query(`UPDATE parceiros SET bloqueado = FALSE, bloqueio_motivo = NULL, bloqueado_em = NULL, bloqueado_por = NULL WHERE id = $1 AND bloqueado RETURNING id, nome`, [parceiroId]);
  if (!p) throw falha('Parceiro não encontrado ou não está bloqueado.', 409);
  await pool.query(`INSERT INTO parceiro_bloqueios (parceiro_id, acao, motivo, usuario_nome) VALUES ($1, 'liberacao', $2, $3)`, [parceiroId, m, usuario]);
  return p;
}
async function bloqueios(parceiroId) {
  const { rows } = await pool.query('SELECT * FROM parceiro_bloqueios WHERE parceiro_id = $1 ORDER BY id DESC LIMIT 100', [parceiroId]);
  return rows;
}

// ---------- Avaliações ----------
async function avaliar(parceiroId, b, usuario) {
  const nota = parseInt(b.nota, 10);
  if (!(nota >= 1 && nota <= 5)) throw falha('Dê uma nota de 1 a 5.');
  let cteId = Number(b.cte_id) || null;
  if (cteId) {
    const { rows } = await pool.query(`SELECT 1 FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id WHERE r.parceiro_id = $1 AND ri.cte_id = $2 LIMIT 1`, [parceiroId, cteId]);
    if (!rows[0]) throw falha('Este CT-e não foi repassado a este parceiro.');
  } else cteId = null;
  const comentario = texto(b.comentario, 500);
  if (nota <= 2 && !comentario) throw falha('Nota baixa: conte o que aconteceu.');
  const { rows } = cteId
    ? await pool.query(`INSERT INTO parceiro_avaliacoes (parceiro_id, cte_id, nota, comentario, usuario_nome) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (parceiro_id, cte_id) WHERE cte_id IS NOT NULL DO UPDATE SET nota = EXCLUDED.nota, comentario = EXCLUDED.comentario, usuario_nome = EXCLUDED.usuario_nome, criado_em = NOW() RETURNING *`,
    [parceiroId, cteId, nota, comentario, usuario])
    : await pool.query(`INSERT INTO parceiro_avaliacoes (parceiro_id, nota, comentario, usuario_nome) VALUES ($1, $2, $3, $4) RETURNING *`, [parceiroId, nota, comentario, usuario]);
  return rows[0];
}
async function avaliacoes(parceiroId) {
  const { rows } = await pool.query(
    `SELECT a.*, c.serie, c.numero, c.destinatario_nome, c.cidade_fim, c.uf_fim FROM parceiro_avaliacoes a LEFT JOIN ctes_emitidos c ON c.id = a.cte_id
      WHERE a.parceiro_id = $1 ORDER BY a.id DESC LIMIT 300`, [parceiroId]);
  return rows;
}
async function excluirAvaliacao(id) {
  const { rowCount } = await pool.query('DELETE FROM parceiro_avaliacoes WHERE id = $1', [id]);
  if (!rowCount) throw falha('Avaliação não encontrada.', 404);
}

// ---------- Desempenho: pontualidade, atrasos, ocorrências e notas ----------
// Cada CT-e repassado no período, com a data prometida pelo parceiro (gravada no repasse; nos antigos, a previsão do redespacho).
async function entregasDe(ids, de, ate) {
  const { rows } = await pool.query(
    `SELECT r.parceiro_id, c.id, c.serie, c.numero, c.uf_fim, c.cidade_fim, c.destinatario_nome, c.situacao_entrega, c.data_entrega::date::text AS entregue_em, r.data::text AS repasse,
            COALESCE(ri.prometido_parceiro, (SELECT o.nova_previsao FROM cte_ocorrencias o WHERE o.cte_id = c.id AND o.romaneio_id = r.id AND o.tipo_id = 'redespacho' AND o.nova_previsao IS NOT NULL ORDER BY o.id DESC LIMIT 1),
                     c.previsao_original, c.previsao_entrega)::text AS prometido,
            (SELECT COUNT(*)::int FROM cte_ocorrencias o WHERE o.cte_id = c.id AND o.tipo = 'problema' AND o.data_hora::date >= r.data) AS problemas
       FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
      WHERE r.parceiro_id = ANY($1::int[]) AND r.data BETWEEN $2::date AND $3::date AND c.status = 'autorizado'`, [ids, de, ate]);
  return rows;
}
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
// Resumo de uma lista de entregas (+ notas dadas). Pontualidade: no prazo ÷ (entregues + abertas já atrasadas).
function resumir(linhas, notas = [], hoje = hojeBr()) {
  const r = { cargas: linhas.length, entregues: 0, no_prazo: 0, atrasadas: 0, abertas: 0, abertas_atrasadas: 0, devolvidas: 0, problemas: 0, dias_atraso: 0 };
  for (const l of linhas) {
    r.problemas += l.problemas || 0;
    if (l.situacao_entrega === 'devolvido') { r.devolvidas += 1; continue; }
    if (l.situacao_entrega === 'entregue' && l.entregue_em) {
      r.entregues += 1;
      if (!l.prometido || l.entregue_em <= l.prometido) r.no_prazo += 1;
      else { r.atrasadas += 1; r.dias_atraso += diasEntre(l.prometido, l.entregue_em); }
    } else {
      r.abertas += 1;
      if (l.prometido && l.prometido < hoje) r.abertas_atrasadas += 1;
    }
  }
  const base = r.entregues + r.abertas_atrasadas;
  r.pontualidade = base ? Math.round((r.no_prazo / base) * 1000) / 10 : null;
  r.atraso_medio = r.atrasadas ? Math.round((r.dias_atraso / r.atrasadas) * 10) / 10 : 0;
  r.avaliacoes = notas.length;
  r.nota_media = notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null;
  // Nota geral (0 a 5): a pontualidade vale 5 com 100%; com avaliações, metade de cada.
  const auto = r.pontualidade == null ? null : r.pontualidade / 20;
  r.nota_geral = auto == null && r.nota_media == null ? null : Math.round(((auto != null && r.nota_media != null) ? (auto + r.nota_media) / 2 : (auto ?? r.nota_media)) * 10) / 10;
  delete r.dias_atraso;
  return r;
}
async function notasDe(ids, de, ate) {
  const { rows } = await pool.query(`SELECT parceiro_id, nota FROM parceiro_avaliacoes WHERE parceiro_id = ANY($1::int[]) AND criado_em::date BETWEEN $2::date AND $3::date`, [ids, de, ate]);
  return rows;
}
async function indicadores(ids, de, ate) {
  if (!ids.length) return {};
  const [linhas, notas] = await Promise.all([entregasDe(ids, de, ate), notasDe(ids, de, ate)]);
  return Object.fromEntries(ids.map((id) => [id, resumir(linhas.filter((l) => l.parceiro_id === id), notas.filter((n) => n.parceiro_id === id).map((n) => n.nota))]));
}
function periodo({ de, ate } = {}) {
  const fim = iso(ate) || hojeBr();
  const ini = iso(de) || new Date(Date.parse(`${fim}T12:00:00Z`) - 89 * 86400000).toISOString().slice(0, 10);
  if (ini > fim) throw falha('O início do período é depois do fim.');
  return { de: ini, ate: fim };
}
async function desempenho(parceiroId, q = {}) {
  const { de, ate } = periodo(q);
  const { rows: [p] } = await pool.query('SELECT id, nome, fantasia FROM parceiros WHERE id = $1', [parceiroId]);
  if (!p) throw falha('Parceiro não encontrado.', 404);
  const [linhas, notas] = await Promise.all([entregasDe([p.id], de, ate), notasDe([p.id], de, ate)]);
  const grupo = (chave) => [...new Set(linhas.map(chave))].sort().map((k) => ({ chave: k, ...resumir(linhas.filter((l) => chave(l) === k)) }));
  const hoje = hojeBr();
  const atrasos = linhas.filter((l) => l.prometido && l.situacao_entrega !== 'devolvido' && ((l.entregue_em && l.entregue_em > l.prometido) || (!l.entregue_em && l.situacao_entrega !== 'entregue' && l.prometido < hoje)))
    .map((l) => ({ ...l, dias: diasEntre(l.prometido, l.entregue_em || hoje) })).sort((a, b) => b.dias - a.dias).slice(0, 50);
  return { de, ate, parceiro: p, geral: resumir(linhas, notas.map((n) => n.nota)), por_mes: grupo((l) => l.repasse.slice(0, 7)), por_uf: grupo((l) => l.uf_fim || '—'), atrasos };
}
async function ranking(q = {}) {
  const { de, ate } = periodo(q);
  const { rows } = await pool.query('SELECT id, nome, fantasia, bloqueado, ativo FROM parceiros ORDER BY nome');
  const ind = await indicadores(rows.map((p) => p.id), de, ate);
  return { de, ate, parceiros: rows.map((p) => ({ ...p, ...ind[p.id] })).sort((a, b) => (b.nota_geral ?? -1) - (a.nota_geral ?? -1) || b.cargas - a.cargas) };
}

async function pendencias() {
  const docs = (await documentosDe((await pool.query('SELECT id FROM parceiros WHERE ativo')).rows.map((r) => r.id)));
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*)::int AS atrasados FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id JOIN ctes_emitidos c ON c.id = ri.cte_id
      WHERE r.parceiro_id IS NOT NULL AND r.status <> 'fechado' AND c.status = 'autorizado' AND c.situacao_entrega NOT IN ('entregue', 'devolvido') AND c.previsao_entrega < $1::date`, [hojeBr()]);
  return { ...r, docs_vencidos: docs.filter((d) => d.situacao === 'vencido').length, docs_vencendo: docs.filter((d) => d.situacao === 'vencendo').length };
}

module.exports = { SERVICOS, DOCUMENTOS, regra, tabelaDe, previsto, salvarTabela, documentos, documentosDe, salvarDocumento, excluirDocumento, bloquear, liberar, bloqueios, avaliar, avaliacoes, excluirAvaliacao, resumir, desempenho, ranking, impedimento, UFS, TIPOS, cidadeChave, lerParceiro, salvar, listar, sugerir, custoPrevisto, repassar, extrato, lancar, alterarValor, excluirLancamento, acertar, aoLancarNotaEntrada, pendencias };
