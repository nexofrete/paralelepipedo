const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const config = require('../config');
const { registrar } = require('../auditoria');

const router = express.Router();

const { CAMPOS_PERMISSAO } = require('../permissoes');

// Guarda os códigos de 2FA pendentes em memória (bem curta duração — não
// precisa de tabela no banco pra isso). Chave = tempToken aleatório.
const codigos2FAPendentes = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [chave, valor] of codigos2FAPendentes) {
    if (valor.expiraEm < agora) codigos2FAPendentes.delete(chave);
  }
}, 60 * 1000);

function gerarDadosTokenEResposta(usuario) {
  const dadosToken = {
    id: usuario.id,
    nome: usuario.nome,
    perfil: usuario.perfil,
    cliente_nome: usuario.cliente_nome,
  };
  CAMPOS_PERMISSAO.forEach((c) => { dadosToken[c] = usuario[c]; });
  const token = jwt.sign(dadosToken, config.jwtSecret, { expiresIn: '8h' });
  return { token, usuario: { ...dadosToken, email: usuario.email, trocar_senha: !!usuario.trocar_senha, funcao: usuario.funcao || null } };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe email e senha.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE',
      [email]
    );
    const usuario = rows[0];

    if (!usuario) {
      return res.status(401).json({ erro: 'Email ou senha incorretos.' });
    }

    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ erro: 'Email ou senha incorretos.' });
    }

    // Login em duas etapas: manda um código por email em vez de liberar
    // acesso direto — só pra usuários com essa opção ativada.
    if (usuario.dois_fatores_ativo) {
      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const tempToken = require('crypto').randomBytes(24).toString('hex');
      codigos2FAPendentes.set(tempToken, { usuarioId: usuario.id, codigo, expiraEm: Date.now() + 5 * 60 * 1000 });

      try {
        const email = require('../email');
        await email.enviarCodigo2FA({ destinatarioEmail: usuario.email, destinatarioNome: usuario.nome, codigo });
      } catch (errEmail) {
        console.error('Falha ao enviar código 2FA:', errEmail.message);
        return res.status(500).json({ erro: 'Não foi possível enviar o código por email. Fale com o administrador.' });
      }

      return res.json({ precisaCodigo: true, tempToken, mensagem: `Enviamos um código para ${usuario.email}.` });
    }

    registrar({ usuarioId: usuario.id, usuarioNome: usuario.nome, acao: 'login', detalhes: 'Login realizado' });
    res.json(gerarDadosTokenEResposta(usuario));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno ao processar login.' });
  }
});

// POST /api/auth/verificar-codigo-2fa
router.post('/verificar-codigo-2fa', async (req, res) => {
  const { tempToken, codigo } = req.body;
  const pendente = codigos2FAPendentes.get(tempToken);

  if (!pendente || pendente.expiraEm < Date.now()) {
    codigos2FAPendentes.delete(tempToken);
    return res.status(401).json({ erro: 'Código expirado. Faça login novamente.' });
  }
  if (pendente.codigo !== String(codigo).trim()) {
    return res.status(401).json({ erro: 'Código incorreto.' });
  }
  codigos2FAPendentes.delete(tempToken);

  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND ativo = TRUE', [pendente.usuarioId]);
    const usuario = rows[0];
    if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado.' });

    registrar({ usuarioId: usuario.id, usuarioNome: usuario.nome, acao: 'login', detalhes: 'Login realizado (com verificação em duas etapas)' });
    res.json(gerarDadosTokenEResposta(usuario));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno ao verificar o código.' });
  }
});

const COLUNAS_USUARIO_RETORNO = `id, nome, email, funcao, perfil, cliente_nome, ativo, trocar_senha, criado_em, ultimo_acesso, ${CAMPOS_PERMISSAO.join(', ')}`;

// POST /api/auth/ticket { caminho } — ticket de download para um link direto (ver ticketDownload.js).
router.post('/ticket', autenticar, (req, res) => {
  try {
    res.json({ ticket: require('../ticketDownload').emitir({ id: req.usuario.id }, req.body?.caminho) });
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao gerar o link de download.' });
  }
});

// POST /api/auth/sair — só registra no log que o usuário saiu (a sessão em
// si é encerrada na tela, apagando o token).
router.post('/sair', autenticar, (req, res) => {
  const porInatividade = req.body?.motivo === 'inatividade';
  registrar({
    usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'logout',
    detalhes: porInatividade ? 'Sessão encerrada automaticamente por inatividade' : 'Saiu do sistema',
  });
  res.json({ ok: true });
});

// POST /api/auth/trocar-senha — o próprio usuário cadastra a sua senha
// (obrigatório no primeiro acesso com senha provisória).
router.post('/trocar-senha', autenticar, async (req, res) => {
  const { senha_atual, nova_senha } = req.body || {};
  const nova = String(nova_senha || '');
  if (nova.length < 8) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  if (!/[A-Za-zÀ-ÿ]/.test(nova) || !/\d/.test(nova)) {
    return res.status(400).json({ erro: 'A nova senha precisa ter letras e números.' });
  }
  try {
    const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!(await bcrypt.compare(String(senha_atual || ''), rows[0].senha_hash))) {
      return res.status(400).json({ erro: 'A senha atual (provisória) está incorreta.' });
    }
    if (await bcrypt.compare(nova, rows[0].senha_hash)) {
      return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' });
    }
    await pool.query('UPDATE usuarios SET senha_hash = $1, trocar_senha = FALSE WHERE id = $2', [await bcrypt.hash(nova, 10), req.usuario.id]);
    require('../avisosSeguranca').verificar().catch(() => {});   // tira o aviso de senha padrão na hora
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'trocar_senha',
      detalhes: req.usuario.trocar_senha ? 'Cadastrou a própria senha (substituiu a provisória)' : 'Trocou a própria senha',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar a nova senha.' });
  }
});

// GET /api/auth/eu — dados e permissões atuais do usuário logado (a tela
// usa pra se atualizar quando alguém muda as permissões dele).
router.get('/eu', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT email FROM usuarios WHERE id = $1', [req.usuario.id]);
    const { ativo, ...usuario } = req.usuario;
    res.json({ ...usuario, email: rows[0]?.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar o usuário.' });
  }
});

// GET /api/auth/verificar-email?email=...&excluir_id=...
// Verifica em tempo real (antes de salvar) se já existe um usuário com esse email.
router.get('/verificar-email', autenticar, permitir('pode_gerenciar_usuarios'), async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    if (!email) return res.json({ existe: false });

    const condicoes = ['LOWER(email) = $1'];
    const valores = [email];
    if (req.query.excluir_id) {
      valores.push(req.query.excluir_id);
      condicoes.push(`id != $${valores.length}`);
    }

    const { rows } = await pool.query(
      `SELECT id, nome FROM usuarios WHERE ${condicoes.join(' AND ')}`,
      valores
    );
    res.json({ existe: rows.length > 0, usuario: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao verificar email.' });
  }
});

// GET /api/auth/usuarios-online  (pra saber quem está usando o sistema agora)
router.get('/usuarios-online', autenticar, permitir('pode_gerenciar_usuarios'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, email, perfil, cliente_nome, ultimo_acesso FROM usuarios
       WHERE ativo = TRUE ORDER BY ultimo_acesso DESC NULLS LAST`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar usuários online.' });
  }
});

// GET /api/auth/usuarios  (lista todos os usuários - admin ou quem gerencia usuários)
router.get('/usuarios', autenticar, permitir('pode_gerenciar_usuarios'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLUNAS_USUARIO_RETORNO} FROM usuarios ORDER BY criado_em DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar usuários.' });
  }
});

// POST /api/auth/usuarios  (cria usuário - admin ou quem gerencia usuários)
router.post('/usuarios', autenticar, permitir('pode_gerenciar_usuarios'), async (req, res) => {
  const { nome, email, senha, perfil, cliente_nome } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  }

  // Só o admin pode criar outro admin, ou dar permissão de gerenciar usuários.
  if ((perfil === 'admin' || req.body.pode_gerenciar_usuarios) && req.usuario.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Apenas o administrador pode criar outro administrador ou dar permissão de gerenciar usuários.' });
  }

  try {
    const senha_hash = await bcrypt.hash(senha, 10);
    // Senha criada pelo administrador é provisória por padrão: o usuário
    // cadastra a própria no primeiro acesso (dá pra desmarcar no formulário).
    const colunas = ['nome', 'email', 'funcao', 'senha_hash', 'perfil', 'cliente_nome', 'trocar_senha', ...CAMPOS_PERMISSAO];
    const valores = [
      nome, email, String(req.body.funcao || '').trim().slice(0, 100) || null, senha_hash, perfil || 'cliente', cliente_nome || null, req.body.trocar_senha !== false,
      ...CAMPOS_PERMISSAO.map((c) => !!req.body[c]),
    ];
    const placeholders = valores.map((_, i) => `$${i + 1}`);

    const { rows } = await pool.query(
      `INSERT INTO usuarios (${colunas.join(', ')}) VALUES (${placeholders.join(', ')})
       RETURNING ${COLUNAS_USUARIO_RETORNO}`,
      valores
    );
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'criar_usuario',
      detalhes: `Criou o usuário "${rows[0].nome}" (${rows[0].email}) como ${rows[0].perfil}`,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe um usuário com esse email.' });
    }
    res.status(500).json({ erro: 'Erro ao criar usuário.' });
  }
});

// PUT /api/auth/usuarios/:id  (edita usuário existente - admin ou quem gerencia usuários)
router.put('/usuarios/:id', autenticar, permitir('pode_gerenciar_usuarios'), async (req, res) => {
  const { nome, cliente_nome, ativo, senha, perfil } = req.body;

  if ((perfil === 'admin' || req.body.pode_gerenciar_usuarios) && req.usuario.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Apenas o administrador pode definir outro administrador ou dar permissão de gerenciar usuários.' });
  }

  try {
    const campos = [];
    const nomesCampos = [];
    const valores = [];
    const add = (coluna, valor) => { valores.push(valor); campos.push(`${coluna} = $${valores.length}`); nomesCampos.push(coluna); };

    if (nome !== undefined) add('nome', nome);
    if (req.body.funcao !== undefined) add('funcao', String(req.body.funcao || '').trim().slice(0, 100) || null);
    if (cliente_nome !== undefined) add('cliente_nome', cliente_nome || null);
    if (ativo !== undefined) add('ativo', !!ativo);
    if (perfil !== undefined) add('perfil', perfil);
    CAMPOS_PERMISSAO.forEach((c) => { if (req.body[c] !== undefined) add(c, !!req.body[c]); });
    if (senha) {
      if (senha.length < 8) {
        return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
      }
      add('senha_hash', await bcrypt.hash(senha, 10));
      setTimeout(() => require('../avisosSeguranca').verificar().catch(() => {}), 500);   // atualiza o aviso de senha padrão
      // Senha nova definida pelo administrador: provisória, a não ser que
      // ele desmarque (ou esteja trocando a própria).
      add('trocar_senha', String(req.params.id) !== String(req.usuario.id) && req.body.trocar_senha !== false);
    }

    if (campos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
    }

    valores.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${valores.length}
       RETURNING ${COLUNAS_USUARIO_RETORNO}`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_usuario',
      detalhes: `Editou o usuário "${rows[0].nome}" (${rows[0].email}) — campos: ${nomesCampos.join(', ')}`,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar usuário.' });
  }
});

module.exports = router;
