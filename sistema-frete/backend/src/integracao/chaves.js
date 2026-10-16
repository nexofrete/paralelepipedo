// Chaves de API para o ERP. A chave ("nxf_" + 40 caracteres aleatórios) aparece
// uma vez só, ao criar; o banco guarda só o SHA-256. Escopos: "ler" (consultas)
// e "lancar" (enviar NF-e para virar rascunho de CT-e).
const crypto = require('crypto');
const pool = require('../db');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const ESCOPOS = { ler: 'Consultar CT-e, entregas e faturas', lancar: 'Enviar NF-e (vira rascunho de CT-e)' };
const hashDe = (chave) => crypto.createHash('sha256').update(String(chave)).digest('hex');

async function listar() {
  const { rows } = await pool.query(
    `SELECT id, nome, prefixo, escopos, ativo, criado_por_nome, criado_em, ultimo_uso_em, ultimo_ip, revogada_em FROM api_chaves ORDER BY ativo DESC, criado_em DESC`);
  return rows;
}

async function criar({ nome, escopos } = {}, usuarioNome) {
  const n = String(nome || '').trim().slice(0, 80);
  if (!n) throw falha('Dê um nome à chave (ex.: "ERP Bapx").');
  const esc = [...new Set((Array.isArray(escopos) ? escopos : ['ler']).filter((e) => ESCOPOS[e]))];
  if (!esc.length) throw falha('Escolha o que a chave pode fazer.');
  const chave = `nxf_${crypto.randomBytes(30).toString('base64url')}`;
  const { rows: [r] } = await pool.query(
    'INSERT INTO api_chaves (nome, prefixo, hash, escopos, criado_por_nome) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, prefixo, escopos, criado_em',
    [n, chave.slice(0, 12), hashDe(chave), esc, usuarioNome || null]);
  return { ...r, chave };
}

async function revogar(id) {
  const { rows: [r] } = await pool.query('UPDATE api_chaves SET ativo = FALSE, revogada_em = NOW() WHERE id = $1 AND ativo RETURNING id, nome', [id]);
  if (!r) throw falha('Chave não encontrada (ou já revogada).', 404);
  return r;
}

// Middleware: "Authorization: Bearer nxf_..." ou "X-Api-Key: nxf_...".
function autenticarApi(escopo = 'ler') {
  return async (req, res, next) => {
    try {
      const cab = String(req.headers.authorization || '');
      const chave = (/^Bearer\s+(nxf_[A-Za-z0-9_-]{20,})$/.exec(cab) || [])[1] || (/^nxf_[A-Za-z0-9_-]{20,}$/.test(String(req.headers['x-api-key'] || '')) ? req.headers['x-api-key'] : null);
      if (!chave) return res.status(401).json({ erro: 'Envie a chave de API no cabeçalho Authorization: Bearer nxf_...' });
      const { rows: [k] } = await pool.query('SELECT id, nome, escopos, ativo, ultimo_uso_em FROM api_chaves WHERE hash = $1', [hashDe(chave)]);
      if (!k || !k.ativo) return res.status(401).json({ erro: 'Chave de API inválida ou revogada.' });
      if (!k.escopos.includes(escopo)) return res.status(403).json({ erro: `Esta chave não tem permissão para "${escopo}".` });
      // Último uso: grava no máximo uma vez por minuto.
      if (!k.ultimo_uso_em || Date.now() - new Date(k.ultimo_uso_em).getTime() > 60000) {
        pool.query('UPDATE api_chaves SET ultimo_uso_em = NOW(), ultimo_ip = $2 WHERE id = $1', [k.id, String(req.ip || '').slice(0, 60)]).catch(() => {});
      }
      req.apiChave = { id: k.id, nome: k.nome, escopos: k.escopos };
      return next();
    } catch (err) { return next(err); }
  };
}

module.exports = { ESCOPOS, listar, criar, revogar, autenticarApi, hashDe };
