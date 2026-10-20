// Portal do cliente: API própria (/api/portal), com login separado dos
// usuários do sistema, e a administração dos acessos (/api/portal-acessos).
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const portal = require('../portal');
const emissao = require('../cte/emissao');
const { gerarDacte } = require('../cte/dacte');
const oc = require('../cte/ocorrencias');
const fat = require('../faturamento/faturamento');
const { gerarFaturaHtml } = require('../faturamento/faturaHtml');
const cot = require('../cotacoes');

const erro = (res, err, padrao) => { if (!err.status) console.error('[portal]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
const pagina = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) { res.status(err.status || 400).send(String(err.message || 'Erro.').replace(/</g, '&lt;')); }
};
const logPortal = (req, detalhes) => registrar({ usuarioNome: `Portal: ${req.portal.nome} <${req.portal.email}>`, acao: 'portal', detalhes });
const ERRO_XML_SEM_VALOR = 'O XML do CT-e traz o valor do frete, e o seu acesso não inclui os valores destes CT-e (só quem paga o frete e tem acesso ao financeiro). O DACTE continua disponível, sem os valores. Se precisar do XML, fale com a transportadora.';
const empresa = async () => (await pool.query('SELECT * FROM empresa WHERE id = 1')).rows[0] || {};

// ======================= API do cliente =======================
const api = express.Router();
const auth = portal.autenticarPortal;
const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' } });
const limiteEsqueci = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'Muitos pedidos de senha. Tente de novo mais tarde.' } });
api.use(rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitos pedidos seguidos. Aguarde um minuto.' } }));

// Nome, logo e contato da transportadora (aparece na tela de entrada).
api.get('/transportadora', rota(async (req, res) => {
  const e = await empresa();
  res.json({ nome: e.nome_fantasia || e.razao_social || 'Transportadora', logo: e.logo || null, telefone: e.telefone || null, email: e.email || null,
    recuperar_senha: !!e.portal_endereco });
}, 'Erro.'));

api.post('/entrar', limiteLogin, rota(async (req, res) => {
  const r = await portal.entrar(req.body?.email, req.body?.senha);
  registrar({ usuarioNome: `Portal: ${r.usuario.nome} <${r.usuario.email}>`, acao: 'portal', detalhes: 'Entrou no portal do cliente' });
  res.json(r);
}, 'Erro ao entrar.'));

api.post('/esqueci', limiteEsqueci, rota(async (req, res) => {
  await portal.esqueci(req.body?.email);
  res.json({ ok: true, mensagem: 'Se este e-mail tiver acesso ao portal, você vai receber um link para criar uma nova senha.' });
}, 'Erro.'));

api.post('/redefinir', limiteLogin, rota(async (req, res) => res.json(await portal.redefinir(req.body?.token, req.body?.senha)), 'Erro.'));

// Ticket de download para um link direto do portal (DACTE, XML, fatura...).
api.post('/ticket', auth, rota(async (req, res) => {
  const caminho = String(req.body?.caminho || '');
  if (!caminho.startsWith('/api/portal/')) return res.status(400).json({ erro: 'Caminho de download inválido.' });
  res.json({ ticket: require('../ticketDownload').emitir({ pid: req.portal.id, v: req.portal.sessao_versao }, caminho) });
}, 'Erro ao gerar o link de download.'));

api.post('/senha', auth, rota(async (req, res) => {
  const token = await portal.trocarSenha(req.portal, req.body?.atual, req.body?.nova);
  logPortal(req, 'Trocou a senha do portal');
  res.json({ ok: true, token });
}, 'Erro ao trocar a senha.'));

api.get('/eu', auth, rota(async (req, res) => {
  const u = req.portal;
  res.json({ nome: u.nome, email: u.email, cliente_nome: u.cliente_nome, documentos: u.documentos, por_raiz: u.por_raiz, pode_financeiro: u.pode_financeiro,
    trocar_senha: u.trocar_senha });
}, 'Erro.'));

api.get('/inicio', auth, rota(async (req, res) => res.json(await portal.indicadores(req.portal)), 'Erro ao montar o resumo.'));

// ---- Cargas ----
api.get('/cargas', auth, rota(async (req, res) => res.json(await portal.listarCargas(req.portal, req.query)), 'Erro ao listar as cargas.'));
api.get('/cargas/:id(\\d+)', auth, rota(async (req, res) => res.json(await portal.detalheCarga(req.portal, req.params.id)), 'Erro ao abrir a carga.'));

api.get('/cargas/:id(\\d+)/dacte', auth, pagina(async (req, res) => {
  const c = await portal.cteDoCliente(req.portal, req.params.id);
  const reg = await emissao.carregar(c.id);
  const e = await emissao.carregarEmitente();
  // Sem acesso ao valor deste CT-e: o DACTE sai sem os valores do frete.
  res.set('Content-Type', 'text/html; charset=utf-8').send(await gerarDacte(emissao.dadosParaXml(reg, e), reg, { semValores: !portal.veValor(req.portal, c.dados) }));
}));

api.get('/cargas/:id(\\d+)/xml', auth, pagina(async (req, res) => {
  const c = await portal.cteDoCliente(req.portal, req.params.id);
  if (!c.xml_autorizado) return res.status(404).send('Este CT-e não tem XML autorizado.');
  // O XML assinado traz os valores do frete e não pode ser editado: só para quem vê o valor.
  if (!portal.veValor(req.portal, c.dados)) return res.status(403).send(ERRO_XML_SEM_VALOR);
  res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${c.chave}-procCTe.xml"` });
  return res.send(c.xml_autorizado);
}));

// Comprovante de entrega (foto/PDF ou assinatura) de uma ocorrência da carga.
api.get('/cargas/:id(\\d+)/comprovante/:oc(\\d+)', auth, pagina(async (req, res) => {
  const c = await portal.cteDoCliente(req.portal, req.params.id);
  const { rows } = await pool.query('SELECT comprovante_arquivo, assinatura_arquivo FROM cte_ocorrencias WHERE id = $1 AND cte_id = $2', [req.params.oc, c.id]);
  const nome = req.query.tipo === 'assinatura' ? rows[0]?.assinatura_arquivo : rows[0]?.comprovante_arquivo;
  if (!nome || nome.includes('/') || nome.includes('\\')) return res.status(404).send('Sem comprovante.');
  const caminho = path.join(oc.PASTA, nome);
  if (!fs.existsSync(caminho)) return res.status(404).send('Arquivo não encontrado.');
  return require('../utils/arquivoSeguro').servir(res, caminho);
}));

// Todos os XML do período num .zip (para o fiscal do cliente).
api.get('/xmls.zip', auth, pagina(async (req, res) => {
  const { de, ate } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de || '') || !/^\d{4}-\d{2}-\d{2}$/.test(ate || '')) return res.status(400).send('Informe o período.');
  if ((Date.parse(ate) - Date.parse(de)) / 86400000 > 92) return res.status(400).send('Período máximo: 3 meses.');
  const u = req.portal;
  const demo = await portal.emDemonstracao();
  const { rows } = await pool.query(
    `SELECT c.chave, c.xml_autorizado, c.autorizado_em, c.dados FROM ctes_emitidos c
      WHERE c.status IN ('autorizado', 'cancelado') AND c.xml_autorizado IS NOT NULL AND c.autorizado_em >= $3::date AND c.autorizado_em < $4::date + 1
        AND ${portal.condicaoCliente(1)}${demo ? '' : ' AND NOT c.demonstracao'} ORDER BY c.autorizado_em LIMIT 5000`, [u.documentos, u.raizes, de, ate]);
  if (!rows.length) return res.status(404).send('Nenhum CT-e com XML neste período.');
  const permitidos = rows.filter((r) => portal.veValor(u, r.dados));
  if (!permitidos.length) return res.status(403).send(ERRO_XML_SEM_VALOR);
  const { EscritorZip } = require('../utils/zip');
  const tmp = path.join(os.tmpdir(), `portal-xml-${crypto.randomBytes(6).toString('hex')}.zip`);
  const zip = new EscritorZip(tmp);
  permitidos.forEach((r) => zip.adicionar(`${r.chave}-procCTe.xml`, Buffer.from(r.xml_autorizado, 'utf8'), { data: new Date(r.autorizado_em) }));
  zip.fechar();
  logPortal(req, `Baixou ${permitidos.length} XML de CT-e (${de} a ${ate})${permitidos.length < rows.length ? `; ${rows.length - permitidos.length} ficaram de fora (sem acesso ao valor)` : ''}`);
  res.download(tmp, `cte-xml-${de}-a-${ate}.zip`, () => fs.rm(tmp, { force: true }, () => {}));
}));

// ---- Financeiro ----
api.get('/faturas', auth, rota(async (req, res) => {
  if (!req.portal.pode_financeiro) return res.status(403).json({ erro: 'Seu acesso não inclui o financeiro.' });
  return res.json(await portal.listarFaturas(req.portal));
}, 'Erro ao listar as faturas.'));

api.get('/faturas/:id(\\d+)/imprimir', auth, pagina(async (req, res) => {
  await portal.faturaDoCliente(req.portal, req.params.id);
  const f = await fat.carregar(req.params.id);
  const e = await empresa();
  const { boletoDaFatura, comBoleto } = require('./faturamento').ajudantes;
  res.set('Content-Type', 'text/html; charset=utf-8').send(comBoleto(await gerarFaturaHtml(f, e), await boletoDaFatura(f, e)));
}));

api.get('/faturas/:id(\\d+)/boleto', auth, pagina(async (req, res) => {
  await portal.faturaDoCliente(req.portal, req.params.id);
  const f = await fat.carregar(req.params.id);
  const e = await empresa();
  const b = await require('./faturamento').ajudantes.boletoDaFatura(f, e);
  if (!b) return res.status(404).send('Esta fatura não tem boleto valendo.');
  return res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Boleto — fatura ${f.numero}</title>
    <style>@page { size: A4; margin: 10mm; } body { margin: 0; } .acoes { text-align: center; margin: 10px; } @media print { .acoes { display: none; } }</style></head>
    <body><div class="acoes"><button onclick="window.print()">Imprimir boleto</button></div>${b}</body></html>`);
}));

// ---- Coletas ----
api.get('/coletas', auth, rota(async (req, res) => res.json({ coletas: await portal.listarColetas(req.portal), endereco: await portal.enderecoDoCliente(req.portal) }), 'Erro.'));
api.post('/coletas', auth, rota(async (req, res) => {
  const k = await portal.pedirColeta(req.portal, req.body || {});
  logPortal(req, `Pediu a coleta ${k.id} (${k.remetente_nome}, ${k.cidade}/${k.uf}, dia ${String(k.data_coleta instanceof Date ? k.data_coleta.toISOString() : k.data_coleta).slice(0, 10)})`);
  res.status(201).json({ id: k.id, status: k.status });
}, 'Erro ao pedir a coleta.'));

// ---- Cotações ----
api.get('/cotacoes', auth, rota(async (req, res) => res.json(await portal.listarCotacoes(req.portal)), 'Erro.'));
api.post('/cotacoes', auth, rota(async (req, res) => {
  const t = await portal.pedirCotacao(req.portal, req.body || {});
  logPortal(req, `Pediu a cotação ${t.id} (${t.origem_cidade}/${t.origem_uf} → ${t.destino_cidade}/${t.destino_uf})${t.automatica ? `: R$ ${t.valor_total} pela tabela` : ''}`);
  res.status(201).json({ id: t.id, status: t.status, automatica: !!t.automatica, valor_total: t.automatica ? Number(t.valor_total) : null });
}, 'Erro ao pedir a cotação.'));
api.post('/cotacoes/:id(\\d+)/aprovar', auth, rota(async (req, res) => {
  const t = await portal.responderCotacao(req.portal, req.params.id, true);
  logPortal(req, `Aprovou a cotação ${t.id} pelo portal (R$ ${t.valor_total})`);
  res.json({ ok: true });
}, 'Erro.'));
api.post('/cotacoes/:id(\\d+)/recusar', auth, rota(async (req, res) => {
  const t = await portal.responderCotacao(req.portal, req.params.id, false, req.body?.motivo);
  logPortal(req, `Recusou a cotação ${t.id} pelo portal`);
  res.json({ ok: true });
}, 'Erro.'));
api.get('/cotacoes/:id(\\d+)/proposta', auth, pagina(async (req, res) => {
  const t = await portal.cotacaoDoCliente(req.portal, req.params.id);
  if (t.status === 'solicitada') return res.status(409).send('A transportadora ainda está calculando esta cotação.');
  return res.set('Content-Type', 'text/html; charset=utf-8').send(cot.propostaHtml(t, await cot.empresa()));
}));

// ======================= Administração (equipe interna) =======================
const admin = express.Router();

admin.get('/', autenticar, apenasAdmin, rota(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${portal.CAMPOS_PUBLICOS} FROM portal_usuarios ORDER BY ativo DESC, cliente_nome NULLS LAST, nome`);
  const e = await empresa();
  res.json({ acessos: rows, config: { endereco: e.portal_endereco || '', cotacao_automatica: !!e.portal_cotacao_automatica } });
}, 'Erro ao listar os acessos.'));

admin.put('/config', autenticar, apenasAdmin, rota(async (req, res) => {
  let end = String(req.body?.endereco || '').trim().replace(/\/+$/, '').replace(/\/portal\.html$/i, '');
  // (vai nos e-mails e na página: sem aspas, < > nem crase)
  if (end && (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(end) || /["'<>`\\]/.test(end))) throw Object.assign(new Error('Endereço inválido. Ex.: https://portal.suatransportadora.com.br'), { status: 400 });
  end = end.slice(0, 250) || null;
  await pool.query('UPDATE empresa SET portal_endereco = $1, portal_cotacao_automatica = $2 WHERE id = 1', [end, !!req.body?.cotacao_automatica]);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'portal', detalhes: `Configurou o portal do cliente (endereço ${end || '—'}, cotação automática ${req.body?.cotacao_automatica ? 'ligada' : 'desligada'})` });
  res.json({ ok: true });
}, 'Erro ao salvar.'));

const tentarEnviar = async (b, acesso, senha) => {
  if (!b?.enviar_email) return null;
  try { await portal.enviarAcesso(acesso, senha); return { enviado: true }; } catch (err) { return { enviado: false, erro: err.message }; }
};

admin.post('/', autenticar, apenasAdmin, rota(async (req, res) => {
  const { acesso, senha } = await portal.criarAcesso(req.body || {}, req.usuario.nome);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'portal', detalhes: `Criou o acesso ao portal de ${acesso.nome} <${acesso.email}> (${acesso.documentos.join(', ')})` });
  res.status(201).json({ acesso, senha, email: await tentarEnviar(req.body, acesso, senha) });
}, 'Erro ao criar o acesso.'));

admin.put('/:id(\\d+)', autenticar, apenasAdmin, rota(async (req, res) => {
  const acesso = await portal.alterarAcesso(Number(req.params.id), req.body || {});
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'portal', detalhes: `Alterou o acesso ao portal de ${acesso.nome} <${acesso.email}> (${acesso.documentos.join(', ')})` });
  res.json(acesso);
}, 'Erro ao salvar.'));

admin.post('/:id(\\d+)/nova-senha', autenticar, apenasAdmin, rota(async (req, res) => {
  const { acesso, senha } = await portal.novaSenha(Number(req.params.id));
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'portal', detalhes: `Gerou senha provisória do portal para ${acesso.nome} <${acesso.email}>` });
  res.json({ acesso, senha, email: await tentarEnviar(req.body, acesso, senha) });
}, 'Erro.'));

admin.post('/:id(\\d+)/ativo', autenticar, apenasAdmin, rota(async (req, res) => {
  const acesso = await portal.ativar(Number(req.params.id), req.body?.ativo);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'portal', detalhes: `${acesso.ativo ? 'Reativou' : 'Desativou'} o acesso ao portal de ${acesso.nome} <${acesso.email}>` });
  res.json(acesso);
}, 'Erro.'));

module.exports = { api, admin };
