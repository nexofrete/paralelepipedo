// Emissão de CT-e (modo transportadora): configuração fiscal, certificado,
// rascunhos, transmissão à SEFAZ, consulta, cancelamento, carta de correção,
// DACTE e XML.
const express = require('express');
const Doc = require('../utils/documento');
const multer = require('multer');
const pool = require('../db');
const { autenticar, apenasAdmin, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const { criptografar, lerPfx, gerarCertificadoDemonstracao } = require('../cte/certificado');
const { lerNfe, lerCteAnterior } = require('../cte/lerNfe');
const emissao = require('../cte/emissao');
const { gerarDacte } = require('../cte/dacte');
const { CODIGO_UF } = require('../cte/ufs');
const averbacao = require('../averbacao/averbacao');

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const responderErro = (res, err, padrao) => { console.error('[cte]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const log = (req, acao, detalhes, registroId) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes, registroId });

// ---------- Configuração fiscal ----------
const CAMPOS_CONFIG = {
  razao_social: 'texto', nome_fantasia: 'texto', cnpj: 'doc', ie: 'texto', telefone: 'texto', email: 'texto',
  endereco: 'texto', numero: 'texto', complemento: 'texto', bairro: 'texto', municipio: 'texto', uf: 'texto', cep: 'texto',
  codigo_municipio: 'texto', rntrc: 'texto', crt: 'inteiro', cte_ambiente: 'inteiro', cte_serie: 'inteiro', cte_proximo_numero: 'inteiro',
  cte_cst_padrao: 'texto', cte_aliquota_interna: 'numero', cte_verificar_servidor: 'bool', cte_demonstracao: 'bool', cte_prazo_padrao: 'inteiro', mdfe_serie: 'inteiro', mdfe_proximo_numero: 'inteiro',
  cte_ibscbs_ativo: 'bool', cte_ibscbs_cst: 'texto', cte_ibscbs_class_trib: 'texto',
  cte_ibs_uf_aliquota: 'numero', cte_ibs_mun_aliquota: 'numero', cte_cbs_aliquota: 'numero',
  resp_tec_cnpj: 'doc', resp_tec_contato: 'texto', resp_tec_email: 'texto', resp_tec_fone: 'texto',
  aviso_entrega_ativo: 'bool', aviso_entrega_eventos: 'texto', aviso_entrega_email: 'bool', aviso_entrega_whatsapp: 'bool', endereco_publico: 'texto',
  cte_contingencia: 'bool', cte_contingencia_motivo: 'texto',
  averbacao_provedor: 'texto', averbacao_usuario: 'texto', averbacao_codigo: 'texto', averbacao_automatica: 'bool',
  seguro_seguradora: 'texto', seguro_cnpj: 'doc', seguro_apolice: 'texto',
};
const SEM_CERTIFICADO = 'id, razao_social, nome_fantasia, cnpj, ie, telefone, email, endereco, numero, complemento, bairro, municipio, uf, cep, '
  + `codigo_municipio, rntrc, crt, ${Object.keys(CAMPOS_CONFIG).filter((c) => c.startsWith('cte_') || c.startsWith('mdfe_') || c.startsWith('resp_tec') || c.startsWith('aviso_entrega') || c.startsWith('averbacao_') || c.startsWith('seguro_') || c === 'endereco_publico').join(', ')}, `
  + 'cte_contingencia_inicio, (averbacao_senha IS NOT NULL) AS tem_senha_averbacao, certificado_titular, certificado_cnpj, certificado_validade, certificado_demonstracao, (certificado_pfx IS NOT NULL) AS tem_certificado';

// Qual SEFAZ Virtual de Contingência atende a UF da empresa (para a tela).
const comSvc = (c) => (c ? { ...c, svc_sigla: c.uf ? emissao.contingenciaDaUf(c.uf).sigla : null } : c);

router.get('/config', autenticar, async (req, res) => {
  try {
    await pool.query('INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    const { rows } = await pool.query(`SELECT ${SEM_CERTIFICADO} FROM empresa WHERE id = 1`);
    res.json(comSvc(rows[0]));
  } catch (err) { responderErro(res, err, 'Erro ao carregar a configuração fiscal.'); }
});

router.put('/config', autenticar, apenasAdmin, async (req, res) => {
  try {
    const campos = Object.keys(CAMPOS_CONFIG).filter((c) => req.body[c] !== undefined);
    // Senha da averbadora: só grava quando vem uma nova (criptografada, nunca volta para a tela).
    if (req.body.averbacao_senha_nova) {
      await pool.query('INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
      await pool.query('UPDATE empresa SET averbacao_senha = $1 WHERE id = 1', [criptografar(Buffer.from(String(req.body.averbacao_senha_nova), 'utf8'))]);
      log(req, 'cte_config', 'Trocou a senha da averbadora do seguro');
    }
    if (!campos.length) return res.status(400).json({ erro: 'Nada para salvar.' });
    const prov = req.body.averbacao_provedor;
    if (prov && !['atm', 'porto'].includes(prov)) return res.status(400).json({ erro: 'Averbadora inválida.' });
    const conv = (c, v) => {
      const tipo = CAMPOS_CONFIG[c];
      if (tipo === 'bool') return !!v;
      if (v === '' || v == null) return tipo === 'inteiro' && ['crt', 'cte_ambiente', 'cte_serie', 'cte_proximo_numero', 'mdfe_serie', 'mdfe_proximo_numero'].includes(c) ? undefined : null;
      if (tipo === 'inteiro') return parseInt(v, 10);
      if (tipo === 'numero') return Number(String(v).replace(',', '.'));
      // CNPJ/CPF: só os dígitos (a tela mostra com pontuação).
      if (tipo === 'doc') return Doc.limpar(v);
      return String(v).trim();
    };
    const pares = campos.map((c) => [c, conv(c, req.body[c])]).filter(([, v]) => v !== undefined);
    const uf = pares.find(([c]) => c === 'uf')?.[1];
    if (uf && !CODIGO_UF[String(uf).toUpperCase()]) return res.status(400).json({ erro: 'UF inválida.' });
    const ibge = pares.find(([c]) => c === 'codigo_municipio')?.[1];
    if (ibge && !/^\d{7}$/.test(ibge)) return res.status(400).json({ erro: 'O código IBGE do município tem 7 dígitos.' });
    const pub = pares.find(([c]) => c === 'endereco_publico')?.[1];
    if (pub && !/^https?:\/\/[^\s/]+/i.test(pub)) return res.status(400).json({ erro: 'O endereço público deve começar com https:// (ex.: https://rastreio.suaempresa.com.br).' });
    const amb = pares.find(([c]) => c === 'cte_ambiente')?.[1];
    if (amb != null && ![1, 2].includes(amb)) return res.status(400).json({ erro: 'Ambiente inválido.' });
    const demo = pares.find(([c]) => c === 'cte_demonstracao')?.[1];
    if (demo && amb === 1) return res.status(400).json({ erro: 'O modo demonstração só funciona em homologação. Desligue a demonstração para usar produção.' });
    // Demonstração sempre em homologação (o XML diz "sem valor fiscal").
    if (demo && amb == null) pares.push(['cte_ambiente', 2]);
    await pool.query('INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    const { rows: antes } = await pool.query('SELECT cte_ambiente, cte_demonstracao, cte_contingencia FROM empresa WHERE id = 1');
    // Contingência (SVC): exige o motivo (15+ letras) e marca a hora em que começou.
    const cont = pares.find(([c]) => c === 'cte_contingencia')?.[1];
    if (cont) {
      const motivo = pares.find(([c]) => c === 'cte_contingencia_motivo')?.[1] || '';
      if (motivo.length < 15) return res.status(400).json({ erro: 'Para ligar a contingência, escreva o motivo (pelo menos 15 letras), ex.: "SEFAZ SP fora do ar desde as 9h".' });
      if (!antes[0]?.cte_contingencia) {
        pares.push(['cte_contingencia_inicio', new Date()]);
        const svc = emissao.contingenciaDaUf(req.body.uf || (await pool.query('SELECT uf FROM empresa WHERE id = 1')).rows[0]?.uf);
        log(req, 'cte_config', `Ligou a contingência do CT-e (${svc.sigla}): ${motivo}`);
      }
    } else if (cont === false && antes[0]?.cte_contingencia) {
      pares.push(['cte_contingencia_inicio', null]);
      log(req, 'cte_config', 'Desligou a contingência do CT-e (voltou para a SEFAZ normal)');
    }
    if (demo === false && antes[0]?.cte_demonstracao) log(req, 'cte_config', 'Desligou o modo demonstração da emissão de CT-e');
    if (demo && !antes[0]?.cte_demonstracao) log(req, 'cte_config', 'Ligou o modo demonstração da emissão de CT-e (SEFAZ simulada)');
    await pool.query(`UPDATE empresa SET ${pares.map(([c], i) => `${c} = $${i + 1}`).join(', ')}, atualizado_em = NOW() WHERE id = 1`,
      pares.map(([c, v]) => (c === 'uf' && v ? String(v).toUpperCase() : v)));
    if (amb != null && Number(antes[0]?.cte_ambiente) !== amb) {
      log(req, 'cte_config', `Mudou o ambiente de emissão de CT-e para ${amb === 1 ? 'PRODUÇÃO' : 'homologação'}`);
    } else {
      log(req, 'cte_config', 'Atualizou a configuração fiscal da emissão de CT-e');
    }
    const { rows } = await pool.query(`SELECT ${SEM_CERTIFICADO} FROM empresa WHERE id = 1`);
    res.json(comSvc(rows[0]));
  } catch (err) { responderErro(res, err, 'Erro ao salvar a configuração fiscal.'); }
});

const uploadPfx = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 } });
router.post('/certificado', autenticar, apenasAdmin, (req, res, next) => uploadPfx.single('certificado')(req, res, (err) => {
  if (err) return res.status(400).json({ erro: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais para um certificado A1.' : 'Não consegui receber o arquivo.' });
  return next();
}), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Escolha o arquivo do certificado (.pfx ou .p12).' });
    const senha = String(req.body.senha || '');
    const c = lerPfx(req.file.buffer, senha);
    if (c.validoAte < new Date()) return res.status(400).json({ erro: `Esse certificado venceu em ${c.validoAte.toLocaleDateString('pt-BR')}.` });
    await pool.query('INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    await pool.query(
      `UPDATE empresa SET certificado_pfx = $1, certificado_senha = $2, certificado_titular = $3, certificado_cnpj = $4, certificado_validade = $5,
              certificado_demonstracao = FALSE, atualizado_em = NOW() WHERE id = 1`,
      [criptografar(req.file.buffer), criptografar(Buffer.from(senha, 'utf8')), c.titular, c.cnpj, c.validoAte]);
    log(req, 'cte_certificado', `Enviou o certificado digital de ${c.titular}${c.cnpj ? ` (${c.cnpj})` : ''}, válido até ${c.validoAte.toLocaleDateString('pt-BR')}`);
    res.json({ titular: c.titular, cnpj: c.cnpj, validade: c.validoAte });
  } catch (err) { responderErro(res, err, 'Não consegui ler o certificado.'); }
});

router.delete('/certificado', autenticar, apenasAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE empresa SET certificado_pfx = NULL, certificado_senha = NULL, certificado_titular = NULL, certificado_cnpj = NULL, certificado_validade = NULL, certificado_demonstracao = FALSE WHERE id = 1');
    log(req, 'cte_certificado', 'Removeu o certificado digital');
    res.json({ ok: true });
  } catch (err) { responderErro(res, err, 'Erro ao remover o certificado.'); }
});

// Certificado de demonstração (autoassinado, no CNPJ da empresa). Só com o modo
// demonstração ligado e sem um certificado verdadeiro cadastrado.
router.post('/certificado/demonstracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT razao_social, cnpj, cte_demonstracao, certificado_pfx IS NOT NULL AND NOT certificado_demonstracao AS tem_verdadeiro FROM empresa WHERE id = 1');
    const e = rows[0];
    if (!e?.cte_demonstracao) return res.status(400).json({ erro: 'Ligue o modo demonstração antes (Configuração fiscal → Ambiente).' });
    if (e.tem_verdadeiro) return res.status(400).json({ erro: 'Já existe um certificado A1 verdadeiro cadastrado — ele também funciona na demonstração.' });
    const cnpj = String(e.cnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'Preencha e salve o CNPJ da empresa antes de gerar o certificado de demonstração.' });
    const { pfx, senha } = gerarCertificadoDemonstracao({ razaoSocial: e.razao_social, cnpj });
    const c = lerPfx(pfx, senha);
    await pool.query(
      `UPDATE empresa SET certificado_pfx = $1, certificado_senha = $2, certificado_titular = $3, certificado_cnpj = $4, certificado_validade = $5,
              certificado_demonstracao = TRUE, atualizado_em = NOW() WHERE id = 1`,
      [criptografar(pfx), criptografar(Buffer.from(senha, 'utf8')), c.titular, cnpj, c.validoAte]);
    log(req, 'cte_certificado', 'Gerou um certificado de DEMONSTRAÇÃO (não vale na SEFAZ)');
    res.json({ titular: c.titular, cnpj, validade: c.validoAte, demonstracao: true });
  } catch (err) { responderErro(res, err, 'Não consegui gerar o certificado de demonstração.'); }
});

router.post('/testar-conexao', autenticar, apenasAdmin, async (req, res) => {
  try {
    res.json(await emissao.testarConexao());
  } catch (err) { responderErro(res, err, 'Falha ao testar a conexão.'); }
});

// ---------- Apoio ao preenchimento ----------
// Lê um XML de NF-e enviado pela tela (o navegador manda o texto do arquivo).
// (o limite maior do corpo para esta rota está no server.js)
router.post('/ler-nfe', autenticar, emitir, (req, res) => {
  try { res.json(lerNfe(req.body?.xml)); } catch (err) { responderErro(res, err, 'Não consegui ler a NF-e.'); }
});

// NF-e dos clientes -> rascunhos de CT-e: lê agora as caixas de e-mail de NF-e,
// ou recebe os XML/ZIP escolhidos na tela (base64).
router.post('/buscar-email', autenticar, emitir, async (req, res) => {
  try {
    const r = await require('../caixaEmail').executar(null, 'manual', 'cte');
    log(req, 'cte_email', `Buscou NF-e no e-mail: ${r.mensagem}`);
    res.json(r);
  } catch (err) { responderErro(res, err, 'Erro ao ler o e-mail.'); }
});
router.post('/importar-nfe', autenticar, emitir, async (req, res) => {
  try {
    const { lerXmlDoZip } = require('../utils/lerZip');
    const xmls = [];
    for (const a of (req.body?.arquivos || []).slice(0, 200)) {
      const buffer = Buffer.from(String(a.conteudo || ''), 'base64');
      if (/\.zip$/i.test(a.nome || '')) xmls.push(...lerXmlDoZip(buffer)); else xmls.push({ nome: a.nome || 'nota.xml', buffer });
    }
    if (!xmls.length) return res.status(400).json({ erro: 'Escolha os XML (ou ZIP) das NF-e.' });
    const r = await require('../cte/rascunhoDaNfe').rascunhosDosXml(xmls, { tipo: 'arquivo', usuario: req.usuario.nome });
    log(req, 'cte_rascunho', `Importou ${xmls.length} XML de NF-e: ${r.criados.length} rascunho(s) de CT-e`);
    res.status(201).json(r);
  } catch (err) { responderErro(res, err, 'Erro ao importar as NF-e.'); }
});

// NF-e em que a empresa é a transportadora, buscadas na SEFAZ (Distribuição DF-e, src/dfe.js) -> rascunhos de CT-e.
router.get('/dfe-cargas', autenticar, emitir, async (req, res) => {
  try { res.json(await require('../dfe').cargasSemCte()); } catch (err) { responderErro(res, err, 'Erro ao listar as NF-e da SEFAZ.'); }
});
router.post('/dfe-cargas/rascunhos', autenticar, emitir, async (req, res) => {
  try {
    const r = await require('../dfe').rascunhosCte(req.body?.ids, req.usuario.nome);
    log(req, 'cte_rascunho', `Gerou ${r.criados.length} rascunho(s) de CT-e das NF-e da SEFAZ`);
    res.status(201).json(r);
  } catch (err) { responderErro(res, err, 'Erro ao gerar os rascunhos.'); }
});

router.post('/ler-cte', autenticar, emitir, (req, res) => {
  try { res.json(lerCteAnterior(req.body?.xml)); } catch (err) { responderErro(res, err, 'Não consegui ler o CT-e.'); }
});

// NF-e já importada no Nexofrete (Enviar XML), pela chave ou pelo número.
router.get('/nfe-importada', autenticar, emitir, async (req, res) => {
  try {
    const busca = String(req.query.busca || '').replace(/\s/g, '');
    if (!busca) return res.status(400).json({ erro: 'Informe a chave ou o número da NF-e.' });
    const { rows } = await pool.query(
      `SELECT xml_nfe_original FROM fretes WHERE xml_nfe_original IS NOT NULL AND (chave_nfe = $1 OR LTRIM(numero_nf, '0') = LTRIM($1, '0'))
        ORDER BY data_emissao_nf DESC NULLS LAST, id DESC LIMIT 5`, [busca]);
    if (!rows.length) return res.status(404).json({ erro: 'Nenhuma NF-e importada com essa chave ou número.' });
    res.json(rows.map((r) => lerNfe(r.xml_nfe_original)));
  } catch (err) { responderErro(res, err, 'Erro ao buscar a NF-e.'); }
});

// Valor do frete pelas tabelas de preço cadastradas para a própria empresa.
router.post('/calcular-frete', autenticar, emitir, async (req, res) => {
  try {
    const e = await emissao.carregarEmitente();
    const b = req.body || {};
    const r = await require('../calculoFrete').calcularParaRegistro({
      transportadoraCte: e.razao_social, transportadoraCnpj: e.cnpj, cidade: b.cidade, bairro: b.bairro,
      qtdVolumes: b.volumes, pesoKg: b.peso, cubagemM3: b.cubagem, valorFaturado: b.valorCarga, clienteDoc: b.tomadorDoc,
      registro: { uf: b.uf, cliente: b.cliente, tipo_carga: b.tipoCarga }, xmlNfe: null,
    });
    if (r.erro) return res.status(404).json({ erro: `${r.erro} (cadastre a própria empresa em Cadastros → Transportadoras, com a tabela de preço dela).` });
    const c = r.componentes;
    const componentes = [
      ['FRETE PESO', r.freteBase], ['AD VALOREM', c.adValorem], ['GRIS', c.gris], ['PEDAGIO', c.pedagio], ['TDE', c.tde], ['TDA', c.tda],
      ['TRT', c.trt], ['DESPACHO', c.despacho], ['DESCARGA', c.descarga],
    ].filter(([, v]) => Number(v) > 0).map(([xNome, v]) => ({ xNome, vComp: Math.round(v * 100) / 100 }));
    // O ICMS embutido pela tabela entra no total, não como componente.
    res.json({ componentes, total: Math.round(c.total * 100) / 100, explicacao: r.explicacao, tabela: r.trecho.tabela_nome, tabela_cliente: !!r.tabelaCliente, prazo: r.trecho.prazo_dias ?? r.trecho.tabela_prazo_dias ?? null });
  } catch (err) { responderErro(res, err, 'Erro ao calcular o frete.'); }
});

// ---------- CT-e ----------
router.get('/', autenticar, emitir, async (req, res) => {
  try {
    const cond = []; const val = [];
    if (req.query.status) { val.push(req.query.status); cond.push(`status = $${val.length}`); }
    if (req.query.busca) {
      val.push(`%${String(req.query.busca).trim()}%`);
      cond.push(`(CAST(numero AS TEXT) ILIKE $${val.length} OR chave ILIKE $${val.length} OR tomador_nome ILIKE $${val.length} OR remetente_nome ILIKE $${val.length} OR destinatario_nome ILIKE $${val.length} OR cidade_fim ILIKE $${val.length})`);
    }
    const { rows } = await pool.query(
      `SELECT id, ambiente, serie, numero, chave, status, protocolo, autorizado_em, cstat, motivo, valor_total, tomador_nome,
              remetente_nome, destinatario_nome, cidade_fim, uf_fim, criado_por_nome, criado_em, atualizado_em, demonstracao,
              COALESCE(dados->>'tpCTe', '0') AS tp_cte, COALESCE(dados->>'tpServ', '0') AS tp_serv, tp_emis, chave_pendente_origem,
              COALESCE(dados->'complementados'->>0, dados->'substituido'->>'chave') AS chave_referencia,
              (SELECT s.serie || '/' || s.numero FROM ctes_emitidos s WHERE s.id = ctes_emitidos.substituido_por) AS substituido_por_numero,
              averbacao_status, averbacao->>'numero' AS averbacao_numero, averbacao->>'protocolo' AS averbacao_protocolo,
              averbacao->>'mensagem' AS averbacao_mensagem, (averbacao->>'teste')::boolean AS averbacao_teste,
              dados->'origem'->>'tipo' AS origem_tipo, dados->'origem'->>'remetente' AS origem_remetente, dados->'origem'->>'coleta_id' AS origem_coleta, dados->'avisosImportacao' AS avisos_importacao
         FROM ctes_emitidos ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY criado_em DESC LIMIT 500`, val);
    res.json(rows);
  } catch (err) { responderErro(res, err, 'Erro ao listar os CT-e.'); }
});

router.get('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    if (!reg) return res.status(404).json({ erro: 'CT-e não encontrado.' });
    delete reg.xml_assinado; delete reg.xml_autorizado;
    reg.eventos = (reg.eventos || []).map(({ xml, ...ev }) => ev);
    res.json(reg);
  } catch (err) { responderErro(res, err, 'Erro ao carregar o CT-e.'); }
});

const EDITAVEL = ['rascunho', 'rejeitado'];
router.post('/', autenticar, emitir, async (req, res) => {
  try {
    const dados = req.body?.dados || {};
    const { rows: emp } = await pool.query('SELECT cte_ambiente FROM empresa WHERE id = 1');
    const r = emissao.resumo(dados);
    const { rows } = await pool.query(
      `INSERT INTO ctes_emitidos (ambiente, dados, valor_total, tomador_nome, remetente_nome, destinatario_nome, cidade_fim, uf_fim, criado_por_nome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [emp[0]?.cte_ambiente || 2, dados, r.valor_total, r.tomador_nome, r.remetente_nome, r.destinatario_nome, r.cidade_fim, r.uf_fim, req.usuario.nome]);
    log(req, 'cte_rascunho', `Criou o rascunho de CT-e #${rows[0].id}`);
    res.status(201).json(await emissao.carregar(rows[0].id));
  } catch (err) { responderErro(res, err, 'Erro ao salvar o rascunho.'); }
});

router.put('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    if (!reg) return res.status(404).json({ erro: 'CT-e não encontrado.' });
    if (!EDITAVEL.includes(reg.status)) return res.status(409).json({ erro: `CT-e ${reg.status} não pode ser alterado.` });
    const dados = req.body?.dados || {};
    const r = emissao.resumo(dados);
    await pool.query(
      `UPDATE ctes_emitidos SET dados = $2, valor_total = $3, tomador_nome = $4, remetente_nome = $5, destinatario_nome = $6, cidade_fim = $7, uf_fim = $8, atualizado_em = NOW() WHERE id = $1`,
      [reg.id, dados, r.valor_total, r.tomador_nome, r.remetente_nome, r.destinatario_nome, r.cidade_fim, r.uf_fim]);
    res.json(await emissao.carregar(reg.id));
  } catch (err) { responderErro(res, err, 'Erro ao salvar o CT-e.'); }
});

router.delete('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    if (!reg) return res.status(404).json({ erro: 'CT-e não encontrado.' });
    if (reg.status !== 'rascunho' || reg.numero) {
      return res.status(409).json({ erro: 'Só dá para excluir rascunho que ainda não recebeu número. CT-e rejeitado pode ser corrigido e transmitido de novo.' });
    }
    await pool.query('DELETE FROM ctes_emitidos WHERE id = $1', [reg.id]);
    log(req, 'cte_excluir', `Excluiu o rascunho de CT-e #${reg.id}`);
    res.json({ ok: true });
  } catch (err) { responderErro(res, err, 'Erro ao excluir.'); }
});

router.post('/:id(\\d+)/duplicar', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    if (!reg) return res.status(404).json({ erro: 'CT-e não encontrado.' });
    const { rows: emp } = await pool.query('SELECT cte_ambiente FROM empresa WHERE id = 1');
    // A cópia sai como CT-e normal (complementar/substituto se faz pelos botões próprios).
    reg.dados = { ...reg.dados, tpCTe: '0', complementados: [], substituido: null };
    const r = emissao.resumo(reg.dados);
    const { rows } = await pool.query(
      `INSERT INTO ctes_emitidos (ambiente, dados, valor_total, tomador_nome, remetente_nome, destinatario_nome, cidade_fim, uf_fim, criado_por_nome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [emp[0]?.cte_ambiente || 2, reg.dados, r.valor_total, r.tomador_nome, r.remetente_nome, r.destinatario_nome, r.cidade_fim, r.uf_fim, req.usuario.nome]);
    res.status(201).json(await emissao.carregar(rows[0].id));
  } catch (err) { responderErro(res, err, 'Erro ao duplicar.'); }
});

// Complementar (valor a mais) e substituição, a partir de um CT-e autorizado.
['complementar', 'substituir'].forEach((tipo) => router.post(`/:id(\\d+)/${tipo}`, autenticar, emitir, async (req, res) => {
  try {
    const novo = await emissao.rascunhoDerivado(req.params.id, tipo === 'complementar' ? 'complementar' : 'substituto', req.usuario.nome);
    log(req, 'cte_rascunho', `Criou o rascunho #${novo.id} de CT-e ${tipo === 'complementar' ? 'complementar' : 'de substituição'} do CT-e #${req.params.id}`);
    delete novo.xml_assinado; delete novo.xml_autorizado;
    res.status(201).json(novo);
  } catch (err) { responderErro(res, err, 'Erro ao criar o rascunho.'); }
}));

// Averbação do seguro: refazer um CT-e, ou todos os autorizados que ficaram sem averbar.
router.post('/:id(\\d+)/averbar', autenticar, emitir, async (req, res) => {
  try {
    const r = await averbacao.averbar('cte', Number(req.params.id), { forcar: true });
    log(req, 'cte_averbacao', `Averbação do CT-e #${req.params.id}: ${r?.status} ${r?.protocolo || r?.mensagem || ''}`);
    res.json(r);
  } catch (err) { responderErro(res, err, 'Erro ao averbar.'); }
});
router.post('/averbar-pendentes', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id FROM ctes_emitidos WHERE status = 'autorizado' AND COALESCE(averbacao_status, '') <> 'averbado'
       AND autorizado_em >= NOW() - INTERVAL '30 days' ORDER BY autorizado_em LIMIT 200`);
    let ok = 0; const falhas = [];
    for (const { id } of rows) {
      const r = await averbacao.averbar('cte', id, { forcar: true }).catch((err) => ({ status: 'erro', mensagem: err.message }));
      if (r?.status === 'averbado') ok += 1; else falhas.push({ id, mensagem: r?.mensagem });
    }
    log(req, 'cte_averbacao', `Averbou ${ok} de ${rows.length} CT-e pendentes`);
    res.json({ total: rows.length, averbados: ok, falhas: falhas.slice(0, 20) });
  } catch (err) { responderErro(res, err, 'Erro ao averbar os pendentes.'); }
});

router.post('/:id(\\d+)/cancelar-pendente', autenticar, emitir, async (req, res) => {
  try {
    const ev = await emissao.cancelarPendenteOrigem(req.params.id);
    log(req, 'cte_cancelar', `Cancelou na SEFAZ de origem a chave pendente do CT-e #${req.params.id} (protocolo ${ev.protocolo})`);
    res.json({ ok: true, protocolo: ev.protocolo });
  } catch (err) { responderErro(res, err, 'Erro ao cancelar a chave pendente.'); }
});

router.post('/:id(\\d+)/transmitir', autenticar, emitir, async (req, res) => {
  try {
    const cte = await emissao.transmitir(req.params.id);
    log(req, 'cte_transmitir', `Transmitiu o CT-e ${cte.serie}/${cte.numero}: ${cte.status}${cte.cstat ? ` (${cte.cstat} - ${cte.motivo})` : ''}`, null);
    delete cte.xml_assinado; delete cte.xml_autorizado;
    res.json(cte);
  } catch (err) { responderErro(res, err, 'Erro ao transmitir o CT-e.'); }
});

router.post('/:id(\\d+)/consultar', autenticar, emitir, async (req, res) => {
  try {
    const r = await emissao.consultar(req.params.id);
    delete r.cte.xml_assinado; delete r.cte.xml_autorizado;
    res.json(r);
  } catch (err) { responderErro(res, err, 'Erro ao consultar o CT-e.'); }
});

router.post('/:id(\\d+)/cancelar', autenticar, emitir, async (req, res) => {
  try {
    const ev = await emissao.cancelar(req.params.id, req.body?.justificativa);
    log(req, 'cte_cancelar', `Cancelou o CT-e #${req.params.id} (protocolo ${ev.protocolo}): ${req.body?.justificativa}`);
    res.json({ ok: true, protocolo: ev.protocolo });
  } catch (err) { responderErro(res, err, 'Erro ao cancelar o CT-e.'); }
});

router.post('/:id(\\d+)/carta-correcao', autenticar, emitir, async (req, res) => {
  try {
    const ev = await emissao.cartaCorrecao(req.params.id, req.body?.correcoes);
    log(req, 'cte_cce', `Registrou carta de correção no CT-e #${req.params.id} (protocolo ${ev.protocolo})`);
    res.json({ ok: true, protocolo: ev.protocolo });
  } catch (err) { responderErro(res, err, 'Erro ao registrar a carta de correção.'); }
});

// XML autorizado (cteProc) ou, antes da autorização, o último XML assinado.
router.get('/:id(\\d+)/xml', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    const xml = reg?.xml_autorizado || reg?.xml_assinado;
    if (!xml) return res.status(404).json({ erro: 'Esse CT-e ainda não tem XML (transmita primeiro).' });
    res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${reg.chave || `cte-${reg.id}`}${reg.xml_autorizado ? '-procCTe' : ''}.xml"` });
    res.send(xml);
  } catch (err) { responderErro(res, err, 'Erro ao baixar o XML.'); }
});

router.get('/:id(\\d+)/dacte', autenticar, emitir, async (req, res) => {
  try {
    const reg = await emissao.carregar(req.params.id);
    if (!reg) return res.status(404).send('CT-e não encontrado.');
    const e = await emissao.carregarEmitente();
    res.set('Content-Type', 'text/html; charset=utf-8').send(await gerarDacte(emissao.dadosParaXml(reg, e), reg));
  } catch (err) { console.error('[cte]', err); res.status(400).send(`Não consegui gerar o DACTE: ${String(err.message).replace(/</g, '&lt;')}`); }
});

module.exports = router;
