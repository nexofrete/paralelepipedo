// Portal do cliente (embarcador), como o "SSW cliente": acesso separado dos
// usuários do sistema, ligado aos CNPJ/CPF do cliente. Aqui ficam o login
// (token assinado com uma chave derivada — um token do portal NÃO abre a API
// interna e vice-versa), o filtro de "quais cargas são deste cliente" e as
// consultas que o portal mostra.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const config = require('./config');
const { tomadorDe, valorCte } = require('./faturamento/faturamento');
const { SITUACOES } = require('./cte/ocorrencias');

const SEGREDO = crypto.createHmac('sha256', String(config.jwtSecret)).update('portal-do-cliente').digest('hex');
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const docLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const HASH_FALSO = bcrypt.hashSync(crypto.randomBytes(12).toString('hex'), 10);
const PAPEIS = { remetente: 'Remetente', destinatario: 'Destinatário', expedidor: 'Expedidor', recebedor: 'Recebedor', outroTomador: 'Pagador' };

// ---------- Acesso ----------
// Senha provisória legível (sem 0/O, 1/l/I).
function senhaProvisoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.randomBytes(10)].map((b) => letras[b % letras.length]).join('');
}
function conferirSenhaNova(senha) {
  const s = String(senha || '');
  if (s.length < 8) throw falha('A senha precisa ter pelo menos 8 caracteres.');
  if (s.length > 100) throw falha('Senha comprida demais.');
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw falha('Use letras e números na senha.');
  return s;
}
const hashSenha = (s) => bcrypt.hash(s, 10);

function emitirToken(u) {
  return jwt.sign({ pid: u.id, v: u.sessao_versao, tipo: 'portal' }, SEGREDO, { expiresIn: '12h' });
}

// Lista de documentos (texto livre: vírgula, espaço ou linha) → só CNPJ/CPF válidos no tamanho.
function lerDocumentos(v) {
  const lista = (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(docLimpo).filter(Boolean);
  const ruins = lista.filter((d) => ![11, 14].includes(d.length));
  if (ruins.length) throw falha(`CNPJ/CPF inválido: ${ruins.join(', ')}`);
  return [...new Set(lista)].slice(0, 50);
}

// Middleware: exige o token do portal (cabeçalho ou ?token= nos links de download).
async function autenticarPortal(req, res, next) {
  const cab = req.headers.authorization;
  const token = (cab ? cab.split(' ')[1] : null) || req.query.token;
  if (!token) return res.status(401).json({ erro: 'Entre com o seu e-mail e senha.' });
  let p;
  try { p = jwt.verify(token, SEGREDO); } catch { return res.status(401).json({ erro: 'Sua sessão expirou. Entre de novo.' }); }
  if (p.tipo !== 'portal') return res.status(401).json({ erro: 'Entre com o seu e-mail e senha.' });
  try {
    const { rows } = await pool.query(
      `UPDATE portal_usuarios SET ultimo_acesso = NOW() WHERE id = $1 AND ativo AND sessao_versao = $2
       RETURNING id, nome, email, cliente_nome, documentos, por_raiz, pode_financeiro, trocar_senha, sessao_versao`, [p.pid, p.v]);
    if (!rows[0]) return res.status(401).json({ erro: 'Seu acesso foi alterado ou desativado. Entre de novo ou fale com a transportadora.' });
    const u = rows[0];
    if (u.trocar_senha && !['/senha', '/eu'].includes(req.path)) return res.status(403).json({ erro: 'Cadastre a sua senha antes de continuar.', trocar_senha: true });
    req.portal = { ...u, raizes: u.por_raiz ? [...new Set(u.documentos.filter((d) => d.length === 14).map((d) => d.slice(0, 8)))] : [] };
    return next();
  } catch (err) {
    console.error('[portal]', err.message);
    return res.status(500).json({ erro: 'Erro ao validar o acesso.' });
  }
}

async function entrar(email, senha) {
  const { rows } = await pool.query('SELECT * FROM portal_usuarios WHERE LOWER(email) = LOWER($1)', [String(email || '').trim()]);
  const u = rows[0];
  // Compara mesmo sem usuário (o tempo de resposta não entrega quem existe).
  const ok = await bcrypt.compare(String(senha || ''), u?.senha_hash || HASH_FALSO);
  if (!u || !ok) throw falha('E-mail ou senha não conferem.', 401);
  if (!u.ativo) throw falha('Seu acesso está desativado. Fale com a transportadora.', 403);
  return { token: emitirToken(u), usuario: { nome: u.nome, email: u.email, cliente_nome: u.cliente_nome, trocar_senha: u.trocar_senha } };
}

async function trocarSenha(u, atual, nova) {
  const s = conferirSenhaNova(nova);
  const { rows } = await pool.query('SELECT senha_hash FROM portal_usuarios WHERE id = $1', [u.id]);
  if (!(await bcrypt.compare(String(atual || ''), rows[0]?.senha_hash || ''))) throw falha('A senha atual não confere.');
  if (atual === s) throw falha('A senha nova precisa ser diferente da atual.');
  const { rows: r } = await pool.query(
    `UPDATE portal_usuarios SET senha_hash = $2, trocar_senha = FALSE, sessao_versao = sessao_versao + 1, reset_hash = NULL, reset_expira = NULL
      WHERE id = $1 RETURNING *`, [u.id, await hashSenha(s)]);
  return emitirToken(r[0]);
}

// "Esqueci a senha": manda um link que vale 1 hora. O endereço do link vem da
// configuração (nunca do cabeçalho Host do pedido, que qualquer um forja).
async function esqueci(email) {
  const { rows: emp } = await pool.query('SELECT portal_endereco, razao_social, nome_fantasia FROM empresa WHERE id = 1');
  const base = String(emp[0]?.portal_endereco || '').replace(/\/+$/, '');
  if (!base) throw falha('A recuperação de senha por e-mail não está ligada. Peça uma senha nova para a transportadora.', 409);
  const { rows } = await pool.query('SELECT id, nome, email FROM portal_usuarios WHERE LOWER(email) = LOWER($1) AND ativo', [String(email || '').trim()]);
  if (!rows[0]) return;   // não conta se o e-mail existe
  const token = crypto.randomBytes(24).toString('hex');
  await pool.query(`UPDATE portal_usuarios SET reset_hash = $2, reset_expira = NOW() + INTERVAL '1 hour' WHERE id = $1`,
    [rows[0].id, crypto.createHash('sha256').update(token).digest('hex')]);
  const nomeEmpresa = emp[0].nome_fantasia || emp[0].razao_social || 'Transportadora';
  const link = `${base}/portal.html#redefinir=${token}`;
  // Envio em segundo plano: a resposta não espera nem muda (senão o tempo ou o erro contariam quais e-mails existem).
  require('./email').enviarFatura({
    destinatarioEmail: rows[0].email, assunto: `${nomeEmpresa} — nova senha do portal do cliente`,
    html: `<div style="font-family:Arial,sans-serif; color:#1d2433;"><p>Olá, ${String(rows[0].nome).replace(/[<>&]/g, '')}.</p>
      <p>Recebemos um pedido para criar uma nova senha no portal do cliente da ${nomeEmpresa.replace(/[<>&]/g, '')}.</p>
      <p><a href="${link}" style="background:#2f5bea; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">Criar nova senha</a></p>
      <p style="color:#667085; font-size:12px;">O link vale por 1 hora. Se não foi você, ignore este e-mail: a senha atual continua valendo.</p></div>`,
  }).catch((err) => console.error('[portal] e-mail de nova senha:', err.message));
}

async function redefinir(token, nova) {
  const s = conferirSenhaNova(nova);
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const { rows } = await pool.query(
    `UPDATE portal_usuarios SET senha_hash = $2, trocar_senha = FALSE, sessao_versao = sessao_versao + 1, reset_hash = NULL, reset_expira = NULL
      WHERE reset_hash = $1 AND reset_expira > NOW() AND ativo RETURNING *`, [hash, await hashSenha(s)]);
  if (!rows[0]) throw falha('Este link já foi usado ou venceu. Peça outro em "Esqueci a senha".');
  return { token: emitirToken(rows[0]), usuario: { nome: rows[0].nome, email: rows[0].email, cliente_nome: rows[0].cliente_nome } };
}

// ---------- Quais cargas são do cliente ----------
// Documento de uma parte do CT-e, só letras/números (como fica em dados).
const docSql = (parte) => `UPPER(REGEXP_REPLACE(COALESCE(c.dados->'${parte}'->>'cnpj', c.dados->'${parte}'->>'cpf', ''), '[^0-9A-Za-z]', '', 'g'))`;
// Condição SQL "o cliente aparece neste CT-e". Usa os parâmetros $n (documentos) e $n+1 (raízes).
function condicaoCliente(n) {
  return `(${Object.keys(PAPEIS).map((p) => `${docSql(p)} = ANY($${n}::text[]) OR (LENGTH(${docSql(p)}) = 14 AND LEFT(${docSql(p)}, 8) = ANY($${n + 1}::text[]))`).join(' OR ')})`;
}
const ehDoCliente = (u, doc) => { const d = docLimpo(doc); return !!d && (u.documentos.includes(d) || (d.length === 14 && u.raizes.includes(d.slice(0, 8)))); };
// Em que papel o cliente aparece no CT-e (pode ser mais de um).
function papeisNoCte(u, d = {}) {
  const papeis = Object.keys(PAPEIS).filter((p) => d[p] && ehDoCliente(u, d[p].cnpj || d[p].cpf)).map((p) => PAPEIS[p]);
  const pagador = ehDoCliente(u, tomadorDe(d).doc);
  if (pagador && !papeis.includes('Pagador')) papeis.push('Pagador');
  return { papeis, pagador };
}

// CT-e de demonstração só aparecem enquanto a empresa está no modo demonstração.
async function emDemonstracao() {
  const { rows } = await pool.query('SELECT cte_demonstracao FROM empresa WHERE id = 1');
  return !!rows[0]?.cte_demonstracao;
}

const FILTROS = {
  transito: `c.status = 'autorizado' AND c.situacao_entrega NOT IN ('entregue', 'devolvido')`,
  atrasadas: `c.status = 'autorizado' AND c.situacao_entrega NOT IN ('entregue', 'devolvido') AND c.previsao_entrega < $HOJE::date`,
  entregues: `c.status = 'autorizado' AND c.situacao_entrega IN ('entregue', 'devolvido')`,
  todas: `c.status IN ('autorizado', 'cancelado')`,
};

// Quantidade da carga do CT-e pelo tipo de medida (PESO BRUTO, VOLUMES...).
const quantidade = (d, re) => Number((d.carga?.quantidades || []).find((q) => re.test(String(q.tpMed || '').toUpperCase()))?.qCarga || 0);
const numNf = (k) => Number(String(k).slice(25, 34));
const atrasada = (c) => c.status === 'autorizado' && !['entregue', 'devolvido'].includes(c.situacao_entrega) && c.previsao_entrega
  && String(c.previsao_entrega instanceof Date ? c.previsao_entrega.toISOString() : c.previsao_entrega).slice(0, 10) < hoje();

function resumoCte(u, c) {
  const d = c.dados || {};
  const { papeis, pagador } = papeisNoCte(u, d);
  const verValor = pagador && u.pode_financeiro;
  return {
    id: c.id, cte: c.numero ? `${c.serie}/${c.numero}` : `(sem número, ref. ${c.id})`, numero: c.numero, chave: c.chave, emissao: c.autorizado_em, cancelado: c.status === 'cancelado', demonstracao: c.demonstracao,
    remetente: d.remetente?.xNome || c.remetente_nome, destinatario: d.destinatario?.xNome || c.destinatario_nome,
    origem: d.inicio ? `${d.inicio.xMun}/${d.inicio.UF}` : null, destino: d.fim ? `${d.fim.xMun}/${d.fim.UF}` : (c.cidade_fim ? `${c.cidade_fim}/${c.uf_fim}` : null),
    nfs: (d.nfes || []).map(numNf).filter(Boolean),
    volumes: quantidade(d, /VOL/) || null, peso: quantidade(d, /PESO/) || null,
    situacao: c.status === 'cancelado' ? 'cancelado' : c.situacao_entrega, situacao_texto: c.status === 'cancelado' ? 'CT-e cancelado' : SITUACOES[c.situacao_entrega] || c.situacao_entrega,
    previsao: c.previsao_entrega, entregue_em: c.data_entrega, atrasada: atrasada(c),
    papeis, pagador, valor: verValor ? valorCte(c) : null,
  };
}

async function listarCargas(u, { filtro = 'transito', busca = '', de, ate } = {}) {
  const f = FILTROS[filtro] ? filtro : 'transito';
  const val = [u.documentos, u.raizes, hoje()];
  const onde = [condicaoCliente(1), '$3::date IS NOT NULL', FILTROS[f].replace(/\$HOJE/g, '$3')];
  if (!(await emDemonstracao())) onde.push('NOT c.demonstracao');
  if (/^\d{4}-\d{2}-\d{2}$/.test(de || '')) { val.push(de); onde.push(`c.autorizado_em >= $${val.length}::date`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(ate || '')) { val.push(ate); onde.push(`c.autorizado_em < $${val.length}::date + 1`); }
  const b = String(busca || '').trim();
  if (b) {
    const dig = b.replace(/\D/g, '');
    val.push(`%${b}%`, dig.replace(/^0+/, '') || '__nada__', dig || '__nada__');
    const [p1, p2, p3] = [val.length - 2, val.length - 1, val.length];
    onde.push(`(c.destinatario_nome ILIKE $${p1} OR c.remetente_nome ILIKE $${p1} OR c.cidade_fim ILIKE $${p1} OR c.numero::text = $${p2} OR c.chave = $${p3}
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.dados->'nfes', '[]'::jsonb)) k WHERE LTRIM(SUBSTRING(k FROM 26 FOR 9), '0') = $${p2}))`);
  }
  const { rows } = await pool.query(
    `SELECT c.id, c.serie, c.numero, c.chave, c.status, c.autorizado_em, c.valor_total, c.dados, c.demonstracao, c.situacao_entrega, c.previsao_entrega,
            c.data_entrega, c.remetente_nome, c.destinatario_nome, c.cidade_fim, c.uf_fim
       FROM ctes_emitidos c WHERE ${onde.join(' AND ')}
      ORDER BY ${f === 'transito' || f === 'atrasadas' ? 'c.previsao_entrega NULLS LAST, c.autorizado_em' : 'c.autorizado_em DESC'} LIMIT 300`, val);
  return rows.map((c) => resumoCte(u, c));
}

// Um CT-e do cliente (ou erro 404 — não conta que existe se não for dele).
async function cteDoCliente(u, id) {
  const val = [u.documentos, u.raizes, Number(id)];
  const demo = await emDemonstracao();
  const { rows } = await pool.query(
    `SELECT c.* FROM ctes_emitidos c WHERE c.id = $3 AND c.status IN ('autorizado', 'cancelado') AND ${condicaoCliente(1)}${demo ? '' : ' AND NOT c.demonstracao'}`, val);
  if (!rows[0]) throw falha('Carga não encontrada.', 404);
  return rows[0];
}

async function detalheCarga(u, id) {
  const c = await cteDoCliente(u, id);
  const r = resumoCte(u, c);
  const d = c.dados || {};
  const { rows: ocs } = await pool.query(
    `SELECT id, descricao, tipo, data_hora, cidade, uf, recebedor_nome, nova_previsao, observacao, (comprovante_arquivo IS NOT NULL) AS tem_comprovante,
            (assinatura_arquivo IS NOT NULL) AS tem_assinatura
       FROM cte_ocorrencias WHERE cte_id = $1 ORDER BY data_hora DESC, id DESC`, [c.id]);
  return {
    ...r, recebedor_nome: c.recebedor_nome, tem_xml: !!c.xml_autorizado,
    componentes: r.valor != null ? (d.valores?.componentes || []).map((x) => ({ nome: x.xNome, valor: Number(x.vComp) })) : null,
    valor_mercadoria: Number(d.carga?.vCarga || 0) || null, produto: d.carga?.proPred || null,
    historico: [
      ...ocs.map((o) => ({ id: o.id, descricao: o.descricao, tipo: o.tipo, data_hora: o.data_hora, local: o.cidade ? `${o.cidade}${o.uf ? `/${o.uf}` : ''}` : null,
        recebedor: o.tipo === 'entrega' ? o.recebedor_nome : null, nova_previsao: o.nova_previsao, tem_comprovante: o.tem_comprovante, tem_assinatura: o.tem_assinatura })),
      { descricao: 'CT-e emitido', tipo: 'emissao', data_hora: c.autorizado_em, local: r.origem },
    ],
  };
}

// Indicadores da tela inicial (últimos 30 dias de entregas e o mês corrente).
async function indicadores(u) {
  const demo = await emDemonstracao();
  const val = [u.documentos, u.raizes, hoje()];
  const base = `FROM ctes_emitidos c WHERE c.status = 'autorizado' AND ${condicaoCliente(1)} AND $3::date IS NOT NULL${demo ? '' : ' AND NOT c.demonstracao'}`;
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE c.situacao_entrega NOT IN ('entregue', 'devolvido'))::int AS em_aberto,
            COUNT(*) FILTER (WHERE c.situacao_entrega = 'em_rota')::int AS em_rota,
            COUNT(*) FILTER (WHERE c.situacao_entrega NOT IN ('entregue', 'devolvido') AND c.previsao_entrega < $3::date)::int AS atrasadas,
            COUNT(*) FILTER (WHERE c.situacao_entrega = 'ocorrencia')::int AS com_ocorrencia,
            COUNT(*) FILTER (WHERE c.situacao_entrega = 'entregue' AND c.data_entrega >= $3::date - 30)::int AS entregues_30,
            COUNT(*) FILTER (WHERE c.situacao_entrega = 'entregue' AND c.data_entrega >= $3::date - 30
                               AND c.data_entrega::date <= COALESCE(c.previsao_original, c.previsao_entrega, c.data_entrega::date))::int AS no_prazo_30,
            COUNT(*) FILTER (WHERE c.autorizado_em >= date_trunc('month', $3::date))::int AS emitidos_mes
       ${base}`, val);
  const ind = rows[0];
  ind.pontualidade = ind.entregues_30 ? Math.round((ind.no_prazo_30 / ind.entregues_30) * 1000) / 10 : null;
  if (u.pode_financeiro) {
    // Frete do mês: só os CT-e em que o cliente é o pagador.
    const { rows: mes } = await pool.query(`SELECT c.id, c.valor_total, c.dados ${base} AND c.autorizado_em >= date_trunc('month', $3::date)`, val);
    ind.frete_mes = Math.round(mes.filter((c) => ehDoCliente(u, tomadorDe(c.dados).doc)).reduce((s, c) => s + valorCte(c), 0) * 100) / 100;
    const fat = await listarFaturas(u, { abertas: true });
    ind.faturas_abertas = fat.length;
    ind.faturas_saldo = Math.round(fat.reduce((s, f) => s + f.saldo, 0) * 100) / 100;
    ind.faturas_vencidas = fat.filter((f) => f.vencida).length;
  }
  const { rows: cot } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('aberta', 'enviada') AND valor_total > 0 AND validade >= $3::date)::int AS cotacoes_para_responder,
            COUNT(*) FILTER (WHERE status = 'solicitada')::int AS cotacoes_pedidas
       FROM cotacoes t WHERE (t.portal_usuario_id = $4 OR t.cliente_doc = ANY($1::text[]) OR (LENGTH(t.cliente_doc) = 14 AND LEFT(t.cliente_doc, 8) = ANY($2::text[])))`,
    [...val, u.id]);
  const { rows: col } = await pool.query(
    `SELECT COUNT(*)::int AS coletas_abertas FROM coletas k
      WHERE k.status IN ('pendente', 'programada', 'em_coleta') AND (k.portal_usuario_id = $3 OR k.remetente_doc = ANY($1::text[])
            OR (LENGTH(k.remetente_doc) = 14 AND LEFT(k.remetente_doc, 8) = ANY($2::text[])))`, [u.documentos, u.raizes, u.id]);
  // Últimas movimentações das cargas do cliente.
  const { rows: mov } = await pool.query(
    `SELECT o.descricao, o.tipo, o.data_hora, o.cidade, o.uf, c.id AS cte_id, c.serie, c.numero, c.destinatario_nome
       FROM cte_ocorrencias o JOIN ctes_emitidos c ON c.id = o.cte_id
      WHERE c.status = 'autorizado' AND ${condicaoCliente(1)} AND $3::date IS NOT NULL${demo ? '' : ' AND NOT c.demonstracao'}
      ORDER BY o.data_hora DESC, o.id DESC LIMIT 8`, val);
  return { ...ind, ...cot[0], ...col[0], movimentos: mov.map((m) => ({ ...m, cte: `${m.serie}/${m.numero}`, local: m.cidade ? `${m.cidade}/${m.uf || ''}` : null })) };
}

// ---------- Faturas (cliente pagador) ----------
async function listarFaturas(u, { abertas = false } = {}) {
  if (!u.pode_financeiro) return [];
  const demo = await emDemonstracao();
  const { rows } = await pool.query(
    `SELECT f.id, f.numero, f.emissao, f.vencimento, f.valor_bruto, f.desconto, f.valor_pago, f.status, f.boleto_linha, f.boleto_status, f.boleto_vencimento,
            (SELECT COUNT(*)::int FROM ctes_emitidos c WHERE c.fatura_id = f.id) + (SELECT COUNT(*)::int FROM nfse_emitidas n WHERE n.fatura_id = f.id) AS qtd_ctes
       FROM faturas_transporte f
      WHERE (f.tomador_doc = ANY($1::text[]) OR (LENGTH(f.tomador_doc) = 14 AND LEFT(f.tomador_doc, 8) = ANY($2::text[])))
        AND f.status ${abertas ? "IN ('aberta', 'parcial')" : "<> 'cancelada'"}${demo ? '' : ' AND NOT f.demonstracao'}
      ORDER BY (f.status IN ('aberta', 'parcial')) DESC, f.vencimento DESC LIMIT 200`, [u.documentos, u.raizes]);
  const ativo = require('./boleto/cobranca').ATIVO;
  return rows.map((f) => {
    const saldo = Math.round((f.valor_bruto - f.desconto - f.valor_pago) * 100) / 100;
    return {
      ...f, valor: Math.round((f.valor_bruto - f.desconto) * 100) / 100, saldo,
      vencida: ['aberta', 'parcial'].includes(f.status) && String(f.vencimento instanceof Date ? f.vencimento.toISOString() : f.vencimento).slice(0, 10) < hoje(),
      tem_boleto: !!f.boleto_linha && ativo.includes(f.boleto_status) && ['aberta', 'parcial'].includes(f.status),
      boleto_linha: ativo.includes(f.boleto_status) && ['aberta', 'parcial'].includes(f.status) ? f.boleto_linha : null,
    };
  });
}
async function faturaDoCliente(u, id) {
  if (!u.pode_financeiro) throw falha('Seu acesso não inclui o financeiro.', 403);
  const f = (await listarFaturas(u)).find((x) => x.id === Number(id));
  if (!f) throw falha('Fatura não encontrada.', 404);
  return f;
}

// ---------- Coletas ----------
async function listarColetas(u) {
  const { rows } = await pool.query(
    `SELECT k.id, k.status, k.data_coleta, k.hora_de, k.hora_ate, k.remetente_nome, k.cidade, k.uf, k.destino_cidade, k.destino_uf, k.volumes, k.peso_kg,
            k.notas, k.motivo, k.coletado_em, k.criado_em, k.canal, ct.serie AS cte_serie, ct.numero AS cte_numero, ct.id AS cte_id, ct.status AS cte_status
       FROM coletas k LEFT JOIN ctes_emitidos ct ON ct.id = k.cte_id
      WHERE k.portal_usuario_id = $3 OR k.remetente_doc = ANY($1::text[]) OR (LENGTH(k.remetente_doc) = 14 AND LEFT(k.remetente_doc, 8) = ANY($2::text[]))
      ORDER BY (k.status IN ('pendente', 'programada', 'em_coleta', 'nao_coletada')) DESC, k.data_coleta DESC, k.id DESC LIMIT 200`,
    [u.documentos, u.raizes, u.id]);
  const STATUS = require('./coletas').STATUS;
  return rows.map((k) => ({ ...k, status_texto: STATUS[k.status] || k.status, cte: k.cte_id && k.cte_status === 'autorizado' ? `${k.cte_serie}/${k.cte_numero}` : null, cte_id: undefined, cte_serie: undefined, cte_numero: undefined }));
}

// Endereço de coleta sugerido: o do cadastro do cliente (primeiro documento).
async function enderecoDoCliente(u) {
  if (!u.documentos.length) return null;
  const { rows } = await pool.query(
    `SELECT documento, razao_social AS nome, ie, logradouro, numero, complemento, bairro, municipio AS cidade, uf, cep, cod_municipio, telefone
       FROM clientes WHERE documento = ANY($1::text[]) ORDER BY array_position($1::text[], documento::text) LIMIT 1`, [u.documentos]);
  return rows[0] || null;
}

// Só o que o cliente pode informar no portal (nada de vínculo com cotação, preço, situação...).
const so = (b, campos) => Object.fromEntries(campos.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
const CAMPOS_COLETA_PORTAL = ['solicitante_telefone', 'remetente_doc', 'remetente_nome', 'remetente_ie', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep',
  'cod_municipio', 'contato_nome', 'contato_telefone', 'destinatario_doc', 'destinatario_nome', 'destino_cidade', 'destino_uf', 'data_coleta', 'hora_de', 'hora_ate',
  'volumes', 'peso_kg', 'cubagem_m3', 'valor_mercadoria', 'produto', 'notas', 'observacao'];
const CAMPOS_COTACAO_PORTAL = ['telefone', 'origem_cidade', 'origem_uf', 'destino_cidade', 'destino_uf', 'destino_bairro', 'volumes', 'peso_kg', 'cubagem_m3',
  'valor_mercadoria', 'produto', 'observacao'];

async function pedirColeta(u, entrada = {}) {
  const coletas = require('./coletas');
  const b = so(entrada, CAMPOS_COLETA_PORTAL);
  const doc = docLimpo(b.remetente_doc) || u.documentos[0] || null;
  // Quem pede pelo portal coleta no próprio endereço, ou num fornecedor que manda para ele (frete por conta do cliente).
  // Quem paga é sempre a empresa do cliente: remetente (frete pago) ou destinatário (frete a pagar).
  const tomador = entrada.tomador === 'destinatario' ? 'destinatario' : 'remetente';
  if (tomador === 'remetente' && doc && !ehDoCliente(u, doc)) throw falha('Coleta com frete pago pelo remetente: o remetente precisa ser a sua empresa.');
  const destDoc = docLimpo(b.destinatario_doc);
  if (tomador === 'destinatario' && destDoc && !ehDoCliente(u, destDoc)) throw falha('Coleta com frete a pagar pelo destinatário: o destinatário precisa ser a sua empresa.');
  const dados = {
    ...b, canal: 'portal', solicitante_nome: u.nome, solicitante_email: u.email, remetente_doc: doc, tomador,
    destinatario_doc: tomador === 'destinatario' ? (destDoc || u.documentos[0]) : destDoc || null,
  };
  if (dados.data_coleta && dados.data_coleta < hoje()) throw falha('A data da coleta já passou.');
  const k = await coletas.criar(dados, `Portal: ${u.nome}`);
  await pool.query('UPDATE coletas SET portal_usuario_id = $2 WHERE id = $1', [k.id, u.id]);
  return k;
}

// ---------- Cotações ----------
const condicaoCotacao = `(t.portal_usuario_id = $3 OR t.cliente_doc = ANY($1::text[]) OR (LENGTH(t.cliente_doc) = 14 AND LEFT(t.cliente_doc, 8) = ANY($2::text[])))`;
async function listarCotacoes(u) {
  const cot = require('./cotacoes');
  const { rows } = await pool.query(
    `SELECT t.id, t.status, t.criado_em, t.validade, t.origem_cidade, t.origem_uf, t.destino_cidade, t.destino_uf, t.peso_kg, t.volumes, t.valor_mercadoria,
            t.componentes, t.valor_total, t.prazo_dias, t.cliente_papel, t.observacao, t.motivo, t.coleta_id, t.produto
       FROM cotacoes t WHERE ${condicaoCotacao} AND t.status <> 'cancelada' ORDER BY t.criado_em DESC LIMIT 200`, [u.documentos, u.raizes, u.id]);
  return rows.map((t) => {
    const sit = cot.situacao(t);
    return { ...t, situacao: sit, pode_responder: ['aberta', 'enviada'].includes(sit) && Number(t.valor_total) > 0 };
  });
}
async function cotacaoDoCliente(u, id) {
  const { rows } = await pool.query(`SELECT t.* FROM cotacoes t WHERE t.id = $4 AND ${condicaoCotacao}`, [u.documentos, u.raizes, u.id, Number(id)]);
  if (!rows[0]) throw falha('Cotação não encontrada.', 404);
  return rows[0];
}

async function pedirCotacao(u, entrada = {}) {
  const cot = require('./cotacoes');
  const e = await cot.empresa();
  const b = { ...so(entrada, CAMPOS_COTACAO_PORTAL), cliente_papel: entrada.cliente_papel };
  const base = {
    ...b, cliente_doc: u.documentos[0] || null, cliente_nome: u.cliente_nome || u.nome, contato_nome: u.nome, email: u.email,
    cliente_papel: b.cliente_papel === 'destinatario' ? 'destinatario' : 'remetente',
  };
  // Com a cotação automática ligada, já sai com o preço da tabela (o cliente aprova na hora).
  if (e.portal_cotacao_automatica) {
    try {
      const calc = await cot.calcular(base);
      const c = await cot.criar({ ...base, componentes: calc.componentes, valor_tabela: calc.total, prazo_dias: calc.prazo_dias, tabela_nome: calc.tabela_nome, explicacao: calc.explicacao },
        `Portal: ${u.nome}`);
      const { rows } = await pool.query(`UPDATE cotacoes SET portal_usuario_id = $2, status = 'enviada', enviada_em = NOW() WHERE id = $1 RETURNING *`, [c.id, u.id]);
      return { ...rows[0], automatica: true };
    } catch (err) {
      if (err.status !== 422) throw err;   // sem tabela para o destino: vai para a equipe calcular
    }
  }
  // Sem preço: confere os dados e grava como "pedida no portal" para a equipe calcular.
  const c = cot.lerCotacao({ ...base, componentes: [{ xNome: 'A CALCULAR', vComp: 1 }] }, { validadeDias: e.cotacao_validade_dias || 10 });
  const { rows } = await pool.query(
    `INSERT INTO cotacoes (status, cliente_doc, cliente_nome, cliente_papel, contato_nome, email, telefone, origem_cidade, origem_uf, destino_cidade, destino_uf,
                           destino_bairro, volumes, peso_kg, cubagem_m3, valor_mercadoria, produto, componentes, valor_total, validade, observacao, criado_por_nome, portal_usuario_id)
     VALUES ('solicitada', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, '[]'::jsonb, 0, $17, $18, $19, $20) RETURNING *`,
    [c.cliente_doc, c.cliente_nome, c.cliente_papel, c.contato_nome, c.email, c.telefone, c.origem_cidade, c.origem_uf, c.destino_cidade, c.destino_uf,
      c.destino_bairro, c.volumes, c.peso_kg, c.cubagem_m3, c.valor_mercadoria, c.produto, c.validade, c.observacao, `Portal: ${u.nome}`, u.id]);
  return rows[0];
}

async function responderCotacao(u, id, aprovar, motivo) {
  const t = await cotacaoDoCliente(u, id);
  const cot = require('./cotacoes');
  const sit = cot.situacao(t);
  if (!['aberta', 'enviada'].includes(sit) || !(Number(t.valor_total) > 0)) {
    throw falha(sit === 'vencida' ? 'Esta cotação venceu. Peça uma nova.' : 'Esta cotação não está esperando a sua resposta.', 409);
  }
  const { rows } = aprovar
    ? await pool.query(`UPDATE cotacoes SET status = 'aprovada', decidida_em = NOW(), motivo = NULL, atualizado_em = NOW() WHERE id = $1 AND status IN ('aberta', 'enviada') RETURNING *`, [t.id])
    : await pool.query(`UPDATE cotacoes SET status = 'recusada', decidida_em = NOW(), motivo = $2, atualizado_em = NOW() WHERE id = $1 AND status IN ('aberta', 'enviada') RETURNING *`,
      [t.id, `Pelo portal: ${String(motivo || 'sem motivo').trim().slice(0, 230)}`]);
  if (!rows[0]) throw falha('Esta cotação não está esperando a sua resposta.', 409);
  return rows[0];
}

// ---------- Administração (tela interna) ----------
const CAMPOS_PUBLICOS = 'id, nome, email, cliente_nome, documentos, por_raiz, pode_financeiro, ativo, trocar_senha, ultimo_acesso, criado_por_nome, criado_em';
function lerAcesso(b = {}) {
  const a = {
    nome: String(b.nome || '').trim().slice(0, 120), email: String(b.email || '').trim().toLowerCase().slice(0, 250),
    cliente_nome: String(b.cliente_nome || '').trim().slice(0, 200) || null, documentos: lerDocumentos(b.documentos),
    por_raiz: !!b.por_raiz, pode_financeiro: b.pode_financeiro !== false,
  };
  if (!a.nome) throw falha('Informe o nome de quem vai usar o portal.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw falha('E-mail inválido.');
  if (!a.documentos.length) throw falha('Informe pelo menos um CNPJ/CPF do cliente.');
  return a;
}
const emailRepetido = (err) => { if (err.code === '23505') throw falha('Já existe um acesso com este e-mail.', 409); throw err; };

async function criarAcesso(b, usuarioNome) {
  const a = lerAcesso(b);
  const senha = senhaProvisoria();
  const { rows } = await pool.query(
    `INSERT INTO portal_usuarios (nome, email, cliente_nome, documentos, por_raiz, pode_financeiro, senha_hash, criado_por_nome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${CAMPOS_PUBLICOS}`,
    [a.nome, a.email, a.cliente_nome, a.documentos, a.por_raiz, a.pode_financeiro, await hashSenha(senha), usuarioNome]).catch(emailRepetido);
  return { acesso: rows[0], senha };
}
async function alterarAcesso(id, b) {
  const a = lerAcesso(b);
  const { rows } = await pool.query(
    `UPDATE portal_usuarios SET nome = $2, email = $3, cliente_nome = $4, documentos = $5, por_raiz = $6, pode_financeiro = $7 WHERE id = $1 RETURNING ${CAMPOS_PUBLICOS}`,
    [id, a.nome, a.email, a.cliente_nome, a.documentos, a.por_raiz, a.pode_financeiro]).catch(emailRepetido);
  if (!rows[0]) throw falha('Acesso não encontrado.', 404);
  return rows[0];
}
async function novaSenha(id) {
  const senha = senhaProvisoria();
  const { rows } = await pool.query(
    `UPDATE portal_usuarios SET senha_hash = $2, trocar_senha = TRUE, sessao_versao = sessao_versao + 1, reset_hash = NULL, reset_expira = NULL
      WHERE id = $1 RETURNING ${CAMPOS_PUBLICOS}`, [id, await hashSenha(senha)]);
  if (!rows[0]) throw falha('Acesso não encontrado.', 404);
  return { acesso: rows[0], senha };
}
async function ativar(id, ativo) {
  const { rows } = await pool.query(`UPDATE portal_usuarios SET ativo = $2, sessao_versao = sessao_versao + 1 WHERE id = $1 RETURNING ${CAMPOS_PUBLICOS}`, [id, !!ativo]);
  if (!rows[0]) throw falha('Acesso não encontrado.', 404);
  return rows[0];
}

// E-mail de boas-vindas com a senha provisória (só se o endereço do portal estiver configurado).
async function enviarAcesso(acesso, senha) {
  const { rows } = await pool.query('SELECT portal_endereco, razao_social, nome_fantasia, telefone FROM empresa WHERE id = 1');
  const base = String(rows[0]?.portal_endereco || '').replace(/\/+$/, '');
  if (!base) throw falha('Configure o endereço do portal (⚙) para mandar o acesso por e-mail.', 409);
  const nomeEmpresa = rows[0].nome_fantasia || rows[0].razao_social || 'Transportadora';
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  await require('./email').enviarFatura({
    destinatarioEmail: acesso.email, assunto: `${nomeEmpresa} — seu acesso ao portal do cliente`,
    html: `<div style="font-family:Arial,sans-serif; color:#1d2433;"><p>Olá, ${esc(acesso.nome)}.</p>
      <p>A ${esc(nomeEmpresa)} liberou o seu acesso ao <b>portal do cliente</b>: acompanhe as suas cargas, baixe DACTE, XML e comprovantes de entrega,
      veja faturas e boletos, peça coletas e cotações.</p>
      <p>Endereço: <a href="${esc(base)}/portal.html">${esc(base)}/portal.html</a><br>E-mail: <b>${esc(acesso.email)}</b><br>Senha provisória: <b style="font-family:monospace; font-size:15px;">${esc(senha)}</b></p>
      <p style="color:#667085; font-size:12px;">No primeiro acesso o portal pede para você criar a sua própria senha.</p></div>`,
  });
}

module.exports = {
  SEGREDO, autenticarPortal, entrar, trocarSenha, esqueci, redefinir, lerDocumentos, senhaProvisoria, conferirSenhaNova, condicaoCliente, papeisNoCte, ehDoCliente,
  listarCargas, cteDoCliente, detalheCarga, indicadores, listarFaturas, faturaDoCliente, listarColetas, enderecoDoCliente, pedirColeta,
  listarCotacoes, cotacaoDoCliente, pedirCotacao, responderCotacao, criarAcesso, alterarAcesso, novaSenha, ativar, enviarAcesso, CAMPOS_PUBLICOS, emDemonstracao,
};
