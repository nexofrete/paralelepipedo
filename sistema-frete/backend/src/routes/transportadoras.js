const express = require('express');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');

const router = express.Router();

const CAMPOS_TRANSPORTADORA = [
  'razao_social', 'nome_fantasia', 'cnpj', 'ie', 'telefone', 'email',
  'endereco', 'bairro', 'municipio', 'uf', 'cep', 'observacoes',
  'banco', 'agencia', 'conta', 'tipo_conta', 'chave_pix', 'url_rastreamento', 'rastreamento_ssw', 'portal_tipo', 'portal_chave', 'portal_empresa', 'portal_usuario',
];

// GET /api/transportadoras/verificar-cnpj?cnpj=...&excluir_id=...
// Verifica em tempo real (antes de salvar) se já existe uma transportadora com esse CNPJ.
router.get('/verificar-cnpj', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    const cnpj = (req.query.cnpj || '').replace(/\D/g, '');
    if (!cnpj) return res.json({ existe: false });

    const condicoes = ['cnpj = $1'];
    const valores = [cnpj];
    if (req.query.excluir_id) {
      valores.push(req.query.excluir_id);
      condicoes.push(`id != $${valores.length}`);
    }

    const { rows } = await pool.query(
      `SELECT id, razao_social FROM transportadoras WHERE ${condicoes.join(' AND ')}`,
      valores
    );
    res.json({ existe: rows.length > 0, transportadora: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao verificar CNPJ.' });
  }
});

// POST /api/transportadoras/:id/testar-portal — faz login no portal e diz se deu certo.
router.post('/:id/testar-portal', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transportadoras WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Transportadora não encontrada.' });
    const t = rows[0];
    if (t.portal_tipo === 'ldrio') {
      const ldrio = require('../rastreioLdrio');
      const r = await ldrio.testar(t);
      const abertas = await ldrio.notasEmAberto(t);
      return res.json({ ok: true, mensagem: `Login no portal funcionou: ${r.notasNoPortal} nota(s) na 1ª página do portal (${r.entreguesNoPortal} com data de entrega). ${abertas.length} nota(s) dessa transportadora em aberto no Nexofrete para acompanhar.` });
    }
    const lonngren = require('../rastreioLonngren');
    await lonngren.entrar(t);
    const abertas = await lonngren.notasEmAberto(t);
    res.json({ ok: true, mensagem: `Login no portal funcionou. ${abertas.length} nota(s) dessa transportadora em aberto no Nexofrete para acompanhar.` });
  } catch (err) {
    res.json({ ok: false, mensagem: `Não consegui entrar no portal: ${err.name === 'AbortError' ? 'o portal demorou demais' : err.message}` });
  }
});

// POST /api/transportadoras/:id/completar-cnpj — busca os dados pelo CNPJ agora (BrasilAPI, CNPJ.ws, ReceitaWS).
router.post('/:id(\\d+)/completar-cnpj', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    const t = await require('../transportadorasRedespacho').completarAgora(Number(req.params.id), req.body?.cnpj);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'completar_transportadora_cnpj', detalhes: `Completou pelo CNPJ: ${t.razao_social} (${t.municipio || 'sem cidade'})` });
    res.json(semSenha(t));
  } catch (err) {
    res.status(400).json({ erro: `Não consegui buscar os dados pelo CNPJ: ${err.message}` });
  }
});

// POST /api/transportadoras/completar-todas — põe na fila todas as que estão sem cidade (em segundo plano).
router.post('/completar-todas', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    const qtd = await require('../transportadorasRedespacho').completarTodas();
    res.json({ ok: true, qtd, mensagem: qtd ? `${qtd} transportadora(s) sem cidade (ou de redespacho sem nome fantasia) foram para a fila. O sistema consulta uma a cada 3 segundos — recarregue a lista em alguns minutos.` : 'Todas as transportadoras com CNPJ já têm cidade.' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/transportadoras/descobrir-ssw
// Testa uma nota recente de cada transportadora na SSW e marca as que usam.
router.post('/descobrir-ssw', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    const r = await require('../rastreioSsw').descobrirTransportadoras();
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'descobrir_ssw',
      detalhes: `Procurou transportadoras na SSW: ${r.usam.length} usam (${r.usam.join(', ') || '—'})` });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao consultar a SSW. Detalhe técnico: ${err.message}` });
  }
});


// Senha do portal: nunca sai do servidor. Na resposta vai só "tem senha: sim/não".
const { criptografar, chaveDoLink } = require('../rastreioLonngren');
function semSenha(t) {
  if (!t) return t;
  const { portal_senha: senha, ...resto } = t;
  return { ...resto, portal_tem_senha: !!senha };
}
function prepararPortal(corpo) {
  // Lonngren: a "chave" sai do link de login. LD Rio: endereço do Supabase (opcional; vazio = o padrão).
  if (corpo.portal_chave && corpo.portal_tipo !== 'ldrio') corpo.portal_chave = chaveDoLink(corpo.portal_chave);
  if (corpo.portal_tipo === 'ldrio' && corpo.portal_chave && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(corpo.portal_chave).trim())) corpo.portal_chave = null;
  if (corpo.portal_tipo === '') corpo.portal_tipo = null;
  return corpo;
}
async function gravarSenhaPortal(id, senha) {
  if (senha === undefined || senha === null || senha === '') return;   // vazio = mantém a atual
  await pool.query('UPDATE transportadoras SET portal_senha = $2 WHERE id = $1', [id, criptografar(senha)]);
}

// GET /api/transportadoras
router.get('/', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transportadoras ORDER BY razao_social ASC');
    res.json(rows.map(semSenha));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar transportadoras.' });
  }
});

// POST /api/transportadoras  (cadastro manual)
router.post('/', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    if (!req.body.razao_social) {
      return res.status(400).json({ erro: 'Informe ao menos a razão social.' });
    }
    prepararPortal(req.body);
    const campos = Object.keys(req.body).filter((c) => CAMPOS_TRANSPORTADORA.includes(c) && req.body[c] !== '');
    const valores = campos.map((c) => req.body[c]);
    const placeholders = campos.map((_, i) => `$${i + 1}`);

    const { rows } = await pool.query(
      `INSERT INTO transportadoras (${campos.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      valores
    );
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'criar_transportadora',
      detalhes: `Cadastrou manualmente a transportadora "${rows[0].razao_social}"`,
    });
    await gravarSenhaPortal(rows[0].id, req.body.portal_senha);
    res.status(201).json(semSenha(rows[0]));
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma transportadora com esse CNPJ.' });
    }
    res.status(500).json({ erro: 'Erro ao cadastrar transportadora.' });
  }
});

// PUT /api/transportadoras/:id
router.put('/:id', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    prepararPortal(req.body);
    const campos = Object.keys(req.body).filter((c) => CAMPOS_TRANSPORTADORA.includes(c));
    if (campos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
    }
    const sets = campos.map((c, i) => `${c} = $${i + 1}`);
    const valores = campos.map((c) => req.body[c] || null);
    valores.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE transportadoras SET ${sets.join(', ')}, atualizado_em = NOW() WHERE id = $${valores.length} RETURNING *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Transportadora não encontrada.' });
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_transportadora',
      detalhes: `Editou a transportadora "${rows[0].razao_social}"`,
    });
    await gravarSenhaPortal(rows[0].id, req.body.portal_senha);
    res.json(semSenha(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar transportadora.' });
  }
});

// DELETE /api/transportadoras/:id
router.delete('/:id', autenticar, permitir('pode_gerenciar_transportadoras'), async (req, res) => {
  try {
    await pool.query('DELETE FROM transportadoras WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir transportadora.' });
  }
});

module.exports = router;
