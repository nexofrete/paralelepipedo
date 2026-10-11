const express = require('express');
const pool = require('../db');
const path = require('path');
const fs = require('fs');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const backup = require('../backup');
const { registrar } = require('../auditoria');
const multer = require('multer');
const atualizacao = require('../atualizacao');
const uploadZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const router = express.Router();

// Manutenção é área sensível (mexe com o banco inteiro) — só o administrador acessa.
router.use(autenticar, apenasAdmin);

// GET /api/manutencao/configuracao
router.get('/configuracao', async (req, res) => {
  try {
    const config = await backup.buscarConfiguracao();
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração de backup.' });
  }
});

// PUT /api/manutencao/configuracao
router.put('/configuracao', async (req, res) => {
  try {
    const config = await backup.salvarConfiguracao(req.body);
    await backup.reagendarTarefa();
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_backup_config',
      detalhes: `Alterou a configuração de backup automático (${config.ativo ? 'ativado' : 'desativado'}, ${config.frequencia} às ${config.horario})`,
    });
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração de backup.' });
  }
});

// POST /api/manutencao/backup-agora
router.post('/backup-agora', async (req, res) => {
  try {
    const resultado = await backup.executarBackupComTratamentoDeErro();
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'backup_manual',
      detalhes: `Executou um backup manual (${resultado.arquivo})`,
    });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: err.message || 'Erro ao executar o backup.' });
  }
});

// POST /api/manutencao/backups/:arquivo/restaurar  — volta o banco para esse backup.
router.post('/backups/:arquivo/restaurar', async (req, res) => {
  if (String(req.body?.confirmacao || '').trim().toUpperCase() !== 'RESTAURAR') {
    return res.status(400).json({ erro: 'Para restaurar, digite RESTAURAR na confirmação.' });
  }
  try {
    const r = await backup.restaurarBackup(req.params.arquivo);
    registrar({
      usuarioId: null, usuarioNome: req.usuario.nome, acao: 'restaurar_backup',
      detalhes: `Restaurou o banco a partir de ${r.restaurado} (backup de segurança antes: ${r.seguranca})`,
    });
    res.json({ mensagem: `Banco restaurado a partir de ${r.restaurado}. Antes, foi feito um backup de segurança (${r.seguranca}). Reinicie o servidor e peça para todos entrarem de novo.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Não foi possível restaurar: ${err.message}` });
  }
});

// POST /api/manutencao/atualizar  (form-data: arquivo = Nexofrete-x.y.z.zip)
// Faz backup, instala a versão nova por cima e reinicia o servidor.
router.post('/atualizar', uploadZip.single('arquivo'), async (req, res) => {
  if (!req.file || !/\.zip$/i.test(req.file.originalname)) return res.status(400).json({ erro: 'Envie o arquivo .zip da versão nova do Nexofrete.' });
  try {
    const r = await atualizacao.aplicarAtualizacao(req.file.buffer, req.file.originalname);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'atualizar_sistema',
      detalhes: `Atualizou o sistema de ${r.versaoAnterior} para ${r.versaoNova} (${r.copiados} arquivos; backup antes: ${r.seguranca})`,
    });
    res.json({ ...r, mensagem: `Versão ${r.versaoNova} instalada. O servidor vai reiniciar agora.` });
    // Sai com o código 3: o iniciar.bat entende que é pra ligar de novo (já com a versão nova).
    setTimeout(() => process.exit(3), 1500);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `A atualização não foi feita: ${err.message}` });
  }
});

// GET /api/manutencao/backups
router.get('/backups', (req, res) => {
  try {
    res.json(backup.listarBackups());
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar backups.' });
  }
});

// GET /api/manutencao/backups/:arquivo/download
router.get('/backups/:arquivo/download', (req, res) => {
  const nome = path.basename(req.params.arquivo); // impede acessar outras pastas
  const caminho = path.join(backup.PASTA_BACKUPS, nome);
  if (!fs.existsSync(caminho)) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  res.download(caminho, nome);
});

// DELETE /api/manutencao/backups/:arquivo
router.delete('/backups/:arquivo', (req, res) => {
  try {
    const nome = path.basename(req.params.arquivo);
    const caminho = path.join(backup.PASTA_BACKUPS, nome);
    if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir o backup.' });
  }
});


// ---------- Limpeza: notas "Aguardando CT-e" ----------
// Separa as notas sem CT-e por motivo, pra limpar grupo a grupo:
//   so_planilha: vieram só da planilha do ERP (sem XML da nota)
//   fob:         frete FOB / destinatário — o CT-e é cobrado do cliente, nunca vem pra empresa
//   sem_frete:   NF-e "sem frete" (retirada, transporte próprio)
//   antigas:     CIF sem CT-e há mais de N dias (histórico / CT-e nunca importado)
//   recentes:    o resto — aguardando de verdade
const FOB = `('FOB', 'Destinatário', 'Destinatario')`;
const SEM_FRETE = `('Sem frete', 'Próprio remetente', 'Próprio destinatário')`;
const BASE_AGUARDANDO = `frete_principal_id IS NULL AND chave_cte IS NULL AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE
  AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Arquivado')`;
const TEM_NF = `NULLIF(chave_nfe, '') IS NOT NULL`;
const GRUPOS = (dias) => ({
  so_planilha: `${BASE_AGUARDANDO} AND NOT (${TEM_NF})`,
  fob: `${BASE_AGUARDANDO} AND ${TEM_NF} AND frete_cif_fob IN ${FOB}`,
  sem_frete: `${BASE_AGUARDANDO} AND ${TEM_NF} AND frete_cif_fob IN ${SEM_FRETE}`,
  antigas: `${BASE_AGUARDANDO} AND ${TEM_NF} AND COALESCE(frete_cif_fob, '') NOT IN ${FOB} AND COALESCE(frete_cif_fob, '') NOT IN ${SEM_FRETE}
            AND COALESCE(data_emissao_nf, criado_em::date) < CURRENT_DATE - ${Number(dias)}`,
  recentes: `${BASE_AGUARDANDO} AND ${TEM_NF} AND COALESCE(frete_cif_fob, '') NOT IN ${FOB} AND COALESCE(frete_cif_fob, '') NOT IN ${SEM_FRETE}
            AND COALESCE(data_emissao_nf, criado_em::date) >= CURRENT_DATE - ${Number(dias)}`,
});
const diasValidos = (v) => Math.min(Math.max(parseInt(v, 10) || 60, 15), 720);

// GET /api/manutencao/limpeza-aguardando?dias=60
router.get('/limpeza-aguardando', autenticar, apenasAdmin, async (req, res) => {
  try {
    const dias = diasValidos(req.query.dias);
    const g = GRUPOS(dias);
    const contar = async (w) => (await pool.query(`SELECT COUNT(*)::int AS n FROM fretes WHERE ${w}`)).rows[0].n;
    const grupos = {};
    for (const k of Object.keys(g)) grupos[k] = await contar(g[k]);
    // "Só da planilha" usa a mesma regra do botão de limpeza (que conta exatamente o que ele move).
    grupos.so_planilha = (await require('../importacaoErp').devolverParaAguardandoXml(true)).qtd;
    const { rows: porMes } = await pool.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(data_emissao_nf, criado_em::date)), 'MM/YYYY') AS mes, COUNT(*)::int AS qtd
         FROM fretes WHERE ${g.antigas} GROUP BY DATE_TRUNC('month', COALESCE(data_emissao_nf, criado_em::date)) ORDER BY 1 DESC LIMIT 24`);
    const { rows: porTransp } = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(transportadora_nfe), ''), NULLIF(TRIM(transportadora), ''), '(sem transportadora na nota)') AS transportadora, COUNT(*)::int AS qtd
         FROM fretes WHERE ${g.antigas} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
    res.json({ dias, grupos, total: Object.values(grupos).reduce((a, b) => a + b, 0), antigas_por_mes: porMes, antigas_por_transportadora: porTransp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro no diagnóstico. Detalhe técnico: ${err.message}` });
  }
});

// POST /api/manutencao/limpeza-aguardando/:grupo  { dias }
router.post('/limpeza-aguardando/:grupo', autenticar, apenasAdmin, async (req, res) => {
  try {
    const dias = diasValidos(req.body?.dias);
    const g = GRUPOS(dias);
    const grupo = req.params.grupo;
    const hoje = new Date().toLocaleDateString('pt-BR');
    let qtd = 0; let mensagem = '';
    if (grupo === 'so_planilha') {
      const r = await require('../importacaoErp').devolverParaAguardandoXml(false);
      qtd = r.qtd;
      mensagem = `${qtd} registro(s) que vieram só da planilha saíram da lista e ficam aguardando o XML da nota (voltam sozinhos quando a NF-e chegar).`;
    } else if (grupo === 'fob' || grupo === 'sem_frete') {
      const obs = grupo === 'fob'
        ? `Frete FOB (pago pelo destinatário): não há CT-e para a empresa — tirado de "Aguardando CT-e" em ${hoje}.`
        : `NF-e sem frete (retirada / transporte próprio): não há CT-e — tirado de "Aguardando CT-e" em ${hoje}.`;
      const r = await pool.query(
        `UPDATE fretes SET status = 'Não cobrado', observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $1::text), atualizado_em = NOW()
          WHERE ${g[grupo]}`, [obs]);
      qtd = r.rowCount;
      mensagem = `${qtd} nota(s) ${grupo === 'fob' ? 'FOB' : 'sem frete'} marcadas como "Não cobrado". Se algum CT-e dessas notas chegar, ela volta sozinha para a conferência.`;
    } else if (grupo === 'antigas') {
      const r = await pool.query(
        `UPDATE fretes SET status = 'Arquivado',
                observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $1::text), atualizado_em = NOW()
          WHERE ${g.antigas}`,
        [`Arquivada em ${hoje}: sem CT-e há mais de ${dias} dias. Se o CT-e for importado depois, volta para a conferência.`]);
      qtd = r.rowCount;
      mensagem = `${qtd} nota(s) antiga(s) arquivada(s). Continuam em Todos os registros (status Arquivado) e voltam sozinhas se o CT-e for importado.`;
    } else {
      return res.status(400).json({ erro: 'Grupo inválido.' });
    }
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'limpeza_aguardando_cte', detalhes: `Limpeza "${grupo}": ${mensagem}` });
    res.json({ ok: true, qtd, mensagem });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro na limpeza. Detalhe técnico: ${err.message}` });
  }
});

// POST /api/manutencao/desarquivar — desfaz o arquivamento (volta tudo para "Aguardando CT-e").
router.post('/desarquivar', autenticar, apenasAdmin, async (req, res) => {
  try {
    const r = await pool.query(`UPDATE fretes SET status = 'Pendente', atualizado_em = NOW() WHERE status = 'Arquivado' AND chave_cte IS NULL`);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'desarquivar', detalhes: `Desarquivou ${r.rowCount} nota(s)` });
    res.json({ ok: true, mensagem: `${r.rowCount} nota(s) voltaram para "Aguardando CT-e".` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao desarquivar.' });
  }
});


// ---------- Leitura automática de e-mail (várias caixas) ----------
const caixa = () => require('../caixaEmail');
router.get('/email/contas', autenticar, apenasAdmin, async (req, res) => {
  try { res.json((await caixa().listarContas()).map(caixa().semSenha)); }
  catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao listar as caixas de e-mail.' }); }
});
router.post('/email/contas', autenticar, apenasAdmin, async (req, res) => {
  try {
    const c = await caixa().salvarConta(req.body || {});
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'configurar_email', detalhes: `Cadastrou a caixa de e-mail ${c.usuario || '—'} (pasta ${c.pasta})` });
    res.status(201).json(c);
  } catch (err) { res.status(400).json({ erro: err.message }); }
});
router.put('/email/contas/:id', autenticar, apenasAdmin, async (req, res) => {
  try {
    const c = await caixa().salvarConta(req.body || {}, Number(req.params.id));
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'configurar_email', detalhes: `Alterou a caixa de e-mail ${c.usuario || '—'} (pasta ${c.pasta}, ${c.ativo ? 'ativa' : 'desligada'})` });
    res.json(c);
  } catch (err) { res.status(400).json({ erro: err.message }); }
});
router.delete('/email/contas/:id', autenticar, apenasAdmin, async (req, res) => {
  try {
    await caixa().excluirConta(Number(req.params.id));
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'configurar_email', detalhes: `Excluiu a caixa de e-mail #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ erro: err.message }); }
});
router.post('/email/contas/:id/testar', autenticar, apenasAdmin, async (req, res) => {
  try { res.json(await caixa().testar(Number(req.params.id))); }
  catch (err) {
    res.json({ ok: false, erro: err.authenticationFailed ? 'Usuário ou senha recusados pelo servidor de e-mail.'
      : err.code === 'ENOTFOUND' ? 'Servidor de e-mail não encontrado — confira o endereço.'
      : (err.responseText || err.message || String(err)) });
  }
});
router.post('/email/contas/:id/ler', autenticar, apenasAdmin, async (req, res) => {
  try { res.json(await caixa().executar(Number(req.params.id), 'manual')); }
  catch (err) { console.error(err); res.status(500).json({ erro: err.message }); }
});
router.post('/email/ler-todas', autenticar, apenasAdmin, async (req, res) => {
  try { res.json(await caixa().executar(null, 'manual')); }
  catch (err) { console.error(err); res.status(500).json({ erro: err.message }); }
});

module.exports = router;
