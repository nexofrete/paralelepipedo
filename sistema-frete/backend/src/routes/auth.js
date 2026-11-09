const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const config = require('../config');
const { registrar } = require('../auditoria');
const contas = require('../segurancaContas');

const router = express.Router();

const { CAMPOS_PERMISSAO, limparModulos } = require('../permissoes');
const limparUnidades = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

// Guarda os códigos de 2FA pendentes em memória (bem curta duração — não
// precisa de tabela no banco pra isso). Chave = tempToken aleatório.
const codigos2FAPendentes = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [chave, valor] of codigos2FAPendentes) {
    if (valor.expiraEm < agora) codigos2FAPendentes.delete(chave);
  }
}, 60 * 1000);

// Cada login vira uma sessão (aparelho, IP); o token leva o id dela (sid) e para de valer quando ela é encerrada.
async function gerarDadosTokenEResposta(usuario, req) {
  const sid = await contas.criarSessao(usuario.id, req);
  await contas.limparFalhas(usuario.id);
  const dadosToken = {
    id: usuario.id,
    nome: usuario.nome,
    perfil: usuario.perfil,
    cliente_nome: usuario.cliente_nome,
  };
  CAMPOS_PERMISSAO.forEach((c) => { dadosToken[c] = usuario[c]; });
  const token = jwt.sign({ ...dadosToken, sid }, config.jwtSecret, { expiresIn: '8h' });
  return { token, usuario: { ...dadosToken, email: usuario.email, trocar_senha: !!usuario.trocar_senha, funcao: usuario.funcao || null,
    modulos_bloqueados: usuario.modulos_bloqueados || [], unidades_permitidas: usuario.unidades_permitidas || [], perfil_acesso_id: usuario.perfil_acesso_id || null,
    acesso_telas: usuario.acesso_telas || null, acesso_acoes: usuario.acesso_acoes || null,
    totp_ativo: !!usuario.totp_ativo, configurar_2fa: await contas.precisaConfigurar2fa(usuario) } };
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
    // Conta bloqueada por senhas erradas seguidas (Manutenção » Segurança).
    if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
      const min = Math.max(1, Math.ceil((new Date(usuario.bloqueado_ate) - Date.now()) / 60000));
      return res.status(423).json({ erro: `Conta bloqueada por senhas erradas. Tente de novo em ${min} minuto(s), use "Esqueci minha senha" ou peça ao administrador para desbloquear.`, bloqueada: true });
    }

    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) {
      const f = await contas.registrarFalha(usuario);
      if (f.bloqueou) return res.status(423).json({ erro: `Senha errada demais vezes: a conta ficou bloqueada por ${f.minutos} minuto(s). Use "Esqueci minha senha" ou peça ao administrador para desbloquear.`, bloqueada: true });
      return res.status(401).json({ erro: 'Email ou senha incorretos.' });
    }
    // Senha vencida (troca periódica): entra e cadastra uma nova antes de continuar.
    if (!usuario.trocar_senha && contas.senhaVencida(usuario, await contas.politica())) {
      await pool.query('UPDATE usuarios SET trocar_senha = TRUE WHERE id = $1', [usuario.id]);
      usuario.trocar_senha = true;
    }

    // Aplicativo autenticador: pede o código do celular (ou um código de recuperação).
    if (usuario.totp_ativo) {
      const tempToken = require('crypto').randomBytes(24).toString('hex');
      codigos2FAPendentes.set(tempToken, { usuarioId: usuario.id, metodo: 'app', tentativas: 0, expiraEm: Date.now() + 5 * 60 * 1000 });
      return res.json({ precisaCodigo: true, metodo: 'app', tempToken, mensagem: 'Digite o código de 6 números do seu aplicativo autenticador (ou um código de recuperação).' });
    }
    // Login em duas etapas: manda um código por email em vez de liberar
    // acesso direto — só pra usuários com essa opção ativada.
    if (usuario.dois_fatores_ativo) {
      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const tempToken = require('crypto').randomBytes(24).toString('hex');
      codigos2FAPendentes.set(tempToken, { usuarioId: usuario.id, metodo: 'email', codigo, tentativas: 0, expiraEm: Date.now() + 5 * 60 * 1000 });

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
    res.json(await gerarDadosTokenEResposta(usuario, req));
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
  // No máximo 5 tentativas por login: depois, começa de novo pelo e-mail e senha.
  pendente.tentativas = (pendente.tentativas || 0) + 1;
  if (pendente.tentativas > 5) { codigos2FAPendentes.delete(tempToken); return res.status(401).json({ erro: 'Código errado demais vezes. Faça login novamente.' }); }
  let viaRecuperacao = false;
  if (pendente.metodo === 'app') {
    const ok = await contas.conferirSegundoFator(pendente.usuarioId, codigo).catch(() => false);
    if (!ok) return res.status(401).json({ erro: 'Código incorreto.' });
    viaRecuperacao = ok === 'recuperacao';
  } else if (pendente.codigo !== String(codigo).trim()) {
    return res.status(401).json({ erro: 'Código incorreto.' });
  }
  codigos2FAPendentes.delete(tempToken);

  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND ativo = TRUE', [pendente.usuarioId]);
    const usuario = rows[0];
    if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado.' });

    registrar({ usuarioId: usuario.id, usuarioNome: usuario.nome, acao: 'login',
      detalhes: viaRecuperacao ? 'Login realizado com um código de recuperação do 2FA' : `Login realizado (verificação em duas etapas por ${pendente.metodo === 'app' ? 'aplicativo' : 'e-mail'})` });
    res.json({ ...(await gerarDadosTokenEResposta(usuario, req)), usouRecuperacao: viaRecuperacao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno ao verificar o código.' });
  }
});

const COLUNAS_USUARIO_RETORNO = `id, nome, email, funcao, perfil, cliente_nome, ativo, trocar_senha, criado_em, ultimo_acesso, perfil_acesso_id, modulos_bloqueados, unidades_permitidas, departamento_id, acesso_telas, acesso_acoes, ${CAMPOS_PERMISSAO.join(', ')}`;

// POST /api/auth/ticket { caminho } — ticket de download para um link direto (ver ticketDownload.js).
router.post('/ticket', autenticar, (req, res) => {
  try {
    res.json({ ticket: require('../ticketDownload').emitir({ id: req.usuario.id }, req.body?.caminho) });
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao gerar o link de download.' });
  }
});

// POST /api/auth/sair — encerra a sessão no servidor (o token para de valer) e registra no log.
router.post('/sair', autenticar, async (req, res) => {
  const porInatividade = req.body?.motivo === 'inatividade';
  if (req.sessaoId) await contas.encerrarSessao(req.sessaoId, porInatividade ? 'inatividade' : 'saiu').catch(() => {});
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
  try {
    await contas.validarSenha(nova);
    const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!(await bcrypt.compare(String(senha_atual || ''), rows[0].senha_hash))) {
      return res.status(400).json({ erro: 'A senha atual (provisória) está incorreta.' });
    }
    if (await bcrypt.compare(nova, rows[0].senha_hash)) {
      return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' });
    }
    await pool.query('UPDATE usuarios SET senha_hash = $1, trocar_senha = FALSE, senha_alterada_em = NOW() WHERE id = $2', [await bcrypt.hash(nova, 10), req.usuario.id]);
    // As outras sessões (outros computadores) caem; esta continua.
    await contas.encerrarTodas(req.usuario.id, 'trocou a senha', req.sessaoId || null);
    require('../avisosSeguranca').verificar().catch(() => {});   // tira o aviso de senha padrão na hora
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'trocar_senha',
      detalhes: req.usuario.trocar_senha ? 'Cadastrou a própria senha (substituiu a provisória)' : 'Trocou a própria senha',
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
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
    res.json({ ...usuario, email: rows[0]?.email, configurar_2fa: await contas.precisaConfigurar2fa(req.usuario) });
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
  { const p = contas.problemaDaSenha(senha, await contas.politica()); if (p) return res.status(400).json({ erro: p }); }

  // Só o admin pode criar outro admin, ou dar permissão de gerenciar usuários.
  if ((perfil === 'admin' || req.body.pode_gerenciar_usuarios) && req.usuario.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Apenas o administrador pode criar outro administrador ou dar permissão de gerenciar usuários.' });
  }

  // Usuário interno: a grade de telas (ou a equivalente às permissões marcadas) e as permissões que ela abre.
  const acesso = require('../acessoTelas');
  let grade = null;
  if ((perfil || 'cliente') === 'interno') {
    grade = req.body.acesso_telas ? acesso.limparGrade(req.body.acesso_telas, req.body.acesso_acoes) : acesso.gradeDoLegado(req.body);
    Object.assign(req.body, acesso.chavesDaGrade(grade.telas));
  }
  try {
    const senha_hash = await bcrypt.hash(senha, 10);
    // Senha criada pelo administrador é provisória por padrão: o usuário
    // cadastra a própria no primeiro acesso (dá pra desmarcar no formulário).
    const colunas = ['acesso_telas', 'acesso_acoes', 'nome', 'email', 'funcao', 'senha_hash', 'perfil', 'cliente_nome', 'trocar_senha', 'perfil_acesso_id', 'modulos_bloqueados', 'unidades_permitidas', 'departamento_id', ...CAMPOS_PERMISSAO];
    const valores = [
      grade ? JSON.stringify(grade.telas) : null, grade ? grade.acoes : null,
      nome, email, String(req.body.funcao || '').trim().slice(0, 100) || null, senha_hash, perfil || 'cliente', cliente_nome || null, req.body.trocar_senha !== false,
      Number(req.body.perfil_acesso_id) || null, limparModulos(req.body.modulos_bloqueados), limparUnidades(req.body.unidades_permitidas), Number(req.body.departamento_id) || null,
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
    // Grade de telas: grava e acerta as permissões que ela abre (Emitir CT-e, Financeiro, Auditoria, Relatórios, Sinistros).
    if (req.body.acesso_telas !== undefined && req.body.acesso_telas !== null) {
      const acesso = require('../acessoTelas');
      const g = acesso.limparGrade(req.body.acesso_telas, req.body.acesso_acoes);
      Object.assign(req.body, acesso.chavesDaGrade(g.telas));
      add('acesso_telas', JSON.stringify(g.telas)); add('acesso_acoes', g.acoes);
    } else if (perfil === 'interno') {
      // Virou interno sem grade: a equivalente ao que estiver marcado.
      const { rows: [atual] } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
      if (atual && !atual.acesso_telas) { const g = require('../acessoTelas').gradeDoLegado({ ...atual, ...req.body }); add('acesso_telas', JSON.stringify(g.telas)); add('acesso_acoes', g.acoes); }
    }
    CAMPOS_PERMISSAO.forEach((c) => { if (req.body[c] !== undefined) add(c, !!req.body[c]); });
    if (req.body.perfil_acesso_id !== undefined) add('perfil_acesso_id', Number(req.body.perfil_acesso_id) || null);
    if (req.body.modulos_bloqueados !== undefined) add('modulos_bloqueados', limparModulos(req.body.modulos_bloqueados));
    if (req.body.unidades_permitidas !== undefined) add('unidades_permitidas', limparUnidades(req.body.unidades_permitidas));
    if (req.body.departamento_id !== undefined) add('departamento_id', Number(req.body.departamento_id) || null);
    if (senha) {
      { const p = contas.problemaDaSenha(senha, await contas.politica()); if (p) return res.status(400).json({ erro: p }); }
      add('senha_hash', await bcrypt.hash(senha, 10));
      add('senha_alterada_em', new Date());
      add('tentativas_falhas', 0); add('bloqueado_ate', null);
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
    // Senha trocada pelo administrador ou usuário desativado: as sessões dele caem na hora.
    if ((senha && String(req.params.id) !== String(req.usuario.id)) || ativo === false) await contas.encerrarTodas(rows[0].id, ativo === false ? 'usuário desativado' : 'senha trocada pelo administrador');
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

// ---------- Política de senha (a tela de login mostra as regras) ----------
router.get('/politica-senha', async (req, res) => {
  try { const p = await contas.politica(); res.json({ senha_min: Math.max(8, Number(p.senha_min) || 8), senha_variedade: !!p.senha_variedade }); }
  catch (err) { res.json({ senha_min: 8, senha_variedade: true }); }
});

// ---------- Esqueci minha senha (código por e-mail) ----------
router.post('/esqueci', async (req, res) => {
  try { await contas.pedirRedefinicao(req.body?.email); } catch (err) { console.error('[esqueci]', err.message); }
  // A resposta é sempre a mesma: não conta se o e-mail existe.
  res.json({ mensagem: 'Se este e-mail for de um usuário do sistema, ele vai receber um código de 8 números em instantes (vale 30 minutos). Confira também o spam.' });
});
router.post('/redefinir', async (req, res) => {
  try {
    await contas.redefinir(req.body?.email, req.body?.codigo, String(req.body?.nova_senha || ''));
    res.json({ ok: true, mensagem: 'Senha redefinida. Entre com a senha nova.' });
  } catch (err) { if (!err.status) console.error(err); res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao redefinir a senha.' }); }
});

// ---------- Minhas sessões ----------
router.get('/sessoes', autenticar, async (req, res) => {
  try { res.json({ atual: req.sessaoId || null, sessoes: await contas.sessoesDo(req.usuario.id) }); } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao listar as sessões.' }); }
});
router.delete('/sessoes/:sid', autenticar, async (req, res) => {
  try {
    const { rowCount } = await pool.query("UPDATE sessoes SET encerrada_em = NOW(), motivo = 'encerrada pelo usuário' WHERE id::text = $1 AND usuario_id = $2 AND encerrada_em IS NULL", [req.params.sid, req.usuario.id]);
    if (!rowCount) return res.status(404).json({ erro: 'Sessão não encontrada.' });
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'encerrar_sessao', detalhes: 'Encerrou uma das próprias sessões' });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao encerrar a sessão.' }); }
});
router.post('/sessoes/encerrar-outras', autenticar, async (req, res) => {
  try {
    const n = await contas.encerrarTodas(req.usuario.id, 'encerrada pelo usuário', req.sessaoId || null);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'encerrar_sessao', detalhes: `Encerrou as outras sessões (${n})` });
    res.json({ ok: true, encerradas: n });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao encerrar as sessões.' }); }
});

// ---------- Aplicativo autenticador (2FA) ----------
router.post('/2fa-app/iniciar', autenticar, async (req, res) => {
  try {
    const { rows: [u] } = await pool.query('SELECT id, nome, email FROM usuarios WHERE id = $1', [req.usuario.id]);
    res.json(await contas.iniciarTotp(u));
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao preparar o aplicativo autenticador.' }); }
});
router.post('/2fa-app/confirmar', autenticar, async (req, res) => {
  try {
    const codigos = await contas.confirmarTotp(req.usuario, req.body?.codigo);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: '2fa_app', detalhes: 'Ativou a verificação em duas etapas por aplicativo autenticador' });
    res.json({ ok: true, codigos_recuperacao: codigos });
  } catch (err) { if (!err.status) console.error(err); res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao ativar.' }); }
});
// Desligar ou gerar novos códigos: pede a senha.
async function conferirSenha(req) {
  const { rows: [u] } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
  return !!u && bcrypt.compare(String(req.body?.senha || ''), u.senha_hash);
}
router.post('/2fa-app/desligar', autenticar, async (req, res) => {
  try {
    if (!(await conferirSenha(req))) return res.status(403).json({ erro: 'Senha incorreta.' });
    const pol = await contas.politica();
    if (await contas.precisaConfigurar2fa({ ...req.usuario, totp_ativo: false })) return res.status(400).json({ erro: `A verificação em duas etapas é obrigatória para ${pol.exigir_2fa === 'todos' ? 'todos' : 'administradores'}: não dá para desligar.` });
    await contas.desligarTotp(req.usuario.id);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: '2fa_app', detalhes: 'Desligou o aplicativo autenticador' });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao desligar.' }); }
});
router.post('/2fa-app/novos-codigos', autenticar, async (req, res) => {
  try {
    if (!(await conferirSenha(req))) return res.status(403).json({ erro: 'Senha incorreta.' });
    const codigos = await contas.novosCodigos(req.usuario);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: '2fa_app', detalhes: 'Gerou novos códigos de recuperação do 2FA' });
    res.json({ codigos_recuperacao: codigos });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao gerar os códigos.' }); }
});

// ---------- Segurança de um usuário (quem gerencia usuários) ----------
router.get('/usuarios/:id(\\d+)/seguranca', autenticar, permitir('pode_gerenciar_usuarios'), async (req, res) => {
  try {
    const { rows: [u] } = await pool.query(`SELECT id, bloqueado_ate, tentativas_falhas, totp_ativo, dois_fatores_ativo, senha_alterada_em,
        COALESCE(array_length(totp_recuperacao, 1), 0) AS codigos_restantes FROM usuarios WHERE id = $1`, [req.params.id]);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({ ...u, bloqueado: !!u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date(), sessoes: await contas.sessoesDo(u.id) });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao buscar a segurança do usuário.' }); }
});
router.post('/usuarios/:id(\\d+)/seguranca/:acao(encerrar-sessoes|desbloquear|desligar-2fa-app)', autenticar, permitir('pode_gerenciar_usuarios'), async (req, res) => {
  try {
    const { rows: [u] } = await pool.query('SELECT id, nome, perfil FROM usuarios WHERE id = $1', [req.params.id]);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (u.perfil === 'admin' && req.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Só o administrador mexe na segurança de outro administrador.' });
    const a = req.params.acao;
    let texto;
    if (a === 'encerrar-sessoes') { const n = await contas.encerrarTodas(u.id, 'encerrada pelo administrador', u.id === req.usuario.id ? req.sessaoId : null); texto = `Encerrou ${n} sessão(ões) de ${u.nome}`; }
    if (a === 'desbloquear') { await contas.limparFalhas(u.id); texto = `Desbloqueou a conta de ${u.nome}`; }
    if (a === 'desligar-2fa-app') { await contas.desligarTotp(u.id); texto = `Desligou o aplicativo autenticador de ${u.nome} (perdeu o celular?)`; }
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'seguranca_usuario', detalhes: texto });
    res.json({ ok: true, mensagem: texto });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao aplicar.' }); }
});

module.exports = router;
