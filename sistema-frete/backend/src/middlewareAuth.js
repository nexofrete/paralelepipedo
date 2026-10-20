const jwt = require('jsonwebtoken');
const config = require('./config');
const pool = require('./db');
const { CAMPOS_PERMISSAO } = require('./permissoes');
const ticket = require('./ticketDownload');

// Protege rotas: exige um token JWT válido no cabeçalho Authorization. Links diretos de
// download (que não conseguem mandar cabeçalho) levam ?token= com um ticket de download
// (ver ticketDownload.js) — nunca o token da sessão.
const ROTAS_LIBERADAS_TROCA_SENHA = ['/api/auth/trocar-senha', '/api/auth/eu', '/api/auth/sair'];

async function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(' ')[1] : null;

  let payload;
  if (token) {
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({ erro: 'Sessão expirada ou token inválido. Faça login novamente.' });
    }
    // Ticket de download e token do portal não valem como sessão do sistema.
    if (payload.tipo || !payload.id) return res.status(401).json({ erro: 'Sessão expirada ou token inválido. Faça login novamente.' });
  } else if (req.query.token) {
    payload = ticket.conferir(req.query.token, req, 'dl');
    if (!payload) return res.status(401).json({ erro: ticket.ERRO_LINK });
  } else {
    return res.status(401).json({ erro: 'Token não informado. Faça login novamente.' });
  }

  // As permissões são lidas do banco a cada requisição (não do token), então
  // qualquer mudança feita no cadastro do usuário vale na hora — e um usuário
  // desativado perde o acesso imediatamente. Aproveita e marca a última atividade.
  try {
    const { rows } = await pool.query(
      `UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = $1
       RETURNING id, nome, funcao, perfil, cliente_nome, ativo, trocar_senha, ${CAMPOS_PERMISSAO.join(', ')}`,
      [payload.id]
    );
    const usuario = rows[0];
    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ erro: 'Usuário desativado ou removido. Fale com o administrador.' });
    }
    // Senha provisória: até cadastrar a própria senha, só pode fazer isso
    // (e sair). Qualquer outra rota responde pedindo a troca.
    if (usuario.trocar_senha && !ROTAS_LIBERADAS_TROCA_SENHA.some((r) => req.originalUrl.split('?')[0] === r)) {
      return res.status(403).json({ erro: 'Cadastre a sua senha antes de continuar.', trocar_senha: true });
    }
    req.usuario = usuario;
    next();
  } catch (err) {
    console.error('Erro ao validar o usuário:', err.message);
    return res.status(500).json({ erro: 'Erro ao validar o usuário.' });
  }
}

// Bloqueia rotas que só o admin pode acessar.
function apenasAdmin(req, res, next) {
  if (req.usuario?.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }
  next();
}

// Permite admin OU quem tiver a permissão específica (ex: 'pode_enviar_xml').
// Admin sempre passa, independente das permissões individuais.
function permitir(nomePermissao) {
  return (req, res, next) => {
    if (req.usuario?.perfil === 'admin' || req.usuario?.[nomePermissao]) {
      return next();
    }
    return res.status(403).json({ erro: 'Você não tem permissão para fazer isso.' });
  };
}

module.exports = { autenticar, apenasAdmin, permitir };
