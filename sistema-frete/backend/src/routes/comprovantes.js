// Comprovantes de entrega em lote: fotos dos canhotos (ex.: baixadas do grupo do
// WhatsApp da transportadora). Cada foto vira o comprovante da nota e lança a
// data de entrega. Opcional: leitura automática do nº da NF e da data do canhoto
// por IA (API da Anthropic) — desligada até informar a chave em Manutenção.
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { autenticar, permitir, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const { criptografar, descriptografar } = require('../rastreioLonngren');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});
const PASTA_CANHOTOS = path.join(__dirname, '..', '..', 'dados', 'canhotos');
const MODELO_PADRAO = 'claude-haiku-4-5-20251001';

async function configIa() {
  const { rows } = await pool.query('SELECT ia_ativa, ia_chave, ia_modelo FROM configuracao_auditoria WHERE id = 1').catch(() => ({ rows: [] }));
  const c = rows[0] || {};
  let chave = null;
  try { chave = c.ia_chave ? descriptografar(c.ia_chave) : null; } catch { chave = null; }
  return { ativa: !!c.ia_ativa && !!chave, chave, modelo: c.ia_modelo || MODELO_PADRAO };
}

// Chama a API de mensagens da Anthropic com a imagem e devolve o texto da resposta.
async function perguntarIa({ chave, modelo }, conteudo, maxTokens = 300) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 60000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controle.signal,
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, max_tokens: maxTokens, messages: [{ role: 'user', content: conteudo }] }),
    });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(d?.error?.message || `a API respondeu ${resp.status}`);
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'a leitura demorou demais' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Configuração da IA (só administrador) ----------
router.get('/ia', autenticar, apenasAdmin, async (req, res) => {
  const c = await configIa();
  const { rows } = await pool.query('SELECT ia_ativa, ia_chave IS NOT NULL AS tem_chave FROM configuracao_auditoria WHERE id = 1').catch(() => ({ rows: [] }));
  res.json({ ativa: !!rows[0]?.ia_ativa, temChave: !!rows[0]?.tem_chave, modelo: c.modelo, modeloPadrao: MODELO_PADRAO });
});
router.put('/ia', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { ativa, chave, modelo } = req.body || {};
    await pool.query('INSERT INTO configuracao_auditoria (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    if (chave !== undefined && String(chave).trim()) await pool.query('UPDATE configuracao_auditoria SET ia_chave = $1 WHERE id = 1', [criptografar(String(chave).trim())]);
    if (chave === null) await pool.query('UPDATE configuracao_auditoria SET ia_chave = NULL, ia_ativa = FALSE WHERE id = 1');
    if (modelo !== undefined) await pool.query('UPDATE configuracao_auditoria SET ia_modelo = $1 WHERE id = 1', [String(modelo || '').trim().slice(0, 80) || null]);
    if (ativa !== undefined) await pool.query('UPDATE configuracao_auditoria SET ia_ativa = $1 WHERE id = 1', [!!ativa]);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'config_ia_comprovantes', detalhes: `Leitura de comprovantes por IA: ${ativa ? 'ligada' : 'desligada'}` });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar a configuração.' });
  }
});
router.post('/ia/testar', autenticar, apenasAdmin, async (req, res) => {
  try {
    const c = await configIa();
    if (!c.chave) return res.status(400).json({ erro: 'Informe e salve a chave da API primeiro.' });
    const r = await perguntarIa(c, [{ type: 'text', text: 'Responda apenas: OK' }], 10);
    res.json({ ok: true, mensagem: `Conectou com a API (modelo ${c.modelo}). Resposta: ${r.trim().slice(0, 40)}` });
  } catch (err) {
    res.status(400).json({ erro: `Não conectou: ${err.message}` });
  }
});

// ---------- Dados da nota pelo número (para conferir na tela) ----------
async function notaPeloNumero(nf) {
  const n = String(nf || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!n) return null;
  const { rows } = await pool.query(
    `SELECT id, numero_nf, cliente, cidade, uf, data_emissao_nf, data_entrega, data_entrega_origem, canhoto_foto_arquivo,
            COALESCE(transportadora_cte, transportadora) AS transportadora, nf_cancelada, status
       FROM fretes WHERE frete_principal_id IS NULL AND LTRIM(numero_nf, '0') = $1 ORDER BY id DESC LIMIT 1`, [n]);
  return rows[0] || null;
}
router.get('/nf/:nf', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  const f = await notaPeloNumero(req.params.nf);
  if (!f) return res.status(404).json({ erro: 'NF não encontrada no sistema.' });
  res.json(f);
});

// O que está disponível para ler as fotos: IA (paga, lê NF e data) e/ou OCR (grátis, lê a NF impressa).
router.get('/capacidades', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  const c = await configIa();
  res.json({ ia: c.ativa, ocr: require('../ocrCanhoto').disponivel() });
});

// ---------- Leitura automática de uma foto (IA) ----------
// POST /api/comprovantes/ler  (foto, ano_provavel)
router.post('/ler', autenticar, permitir('pode_editar_registros'), upload.single('foto'), async (req, res) => {
  try {
    const c = await configIa();
    if (!req.file) return c.ativa ? res.status(400).json({ erro: 'Envie a foto (jpg, png ou webp).' }) : res.json({ semIa: true });
    if (!c.ativa) {
      // Sem IA: lê só o número da NF IMPRESSO, com o leitor gratuito (Tesseract), se instalado.
      const ocr = require('../ocrCanhoto');
      if (!ocr.disponivel()) return res.json({ semIa: true, semOcr: true });
      const r = await ocr.lerNumeroNf(req.file.buffer);
      return res.json({ metodo: 'ocr', nf: r.nf, data: null, confianca_nf: r.nf ? 'alta' : null, lidos: r.lidos || [], nota: r.nf ? await notaPeloNumero(r.nf) : null });
    }
    const ano = /^\d{4}$/.test(String(req.body.ano_provavel || '')) ? req.body.ano_provavel : String(new Date().getFullYear());
    const texto = await perguntarIa(c, [
      { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: req.file.buffer.toString('base64') } },
      { type: 'text', text:
        'Esta é a foto de um canhoto de nota fiscal (NF-e) — o comprovante de entrega assinado pelo cliente. '
        + 'Leia: (1) o número da nota fiscal impresso no canhoto (campo "NF-e Nº"/"Nº", só os dígitos, sem zeros à esquerda) e '
        + `(2) a data de recebimento escrita à mão ou carimbada pelo cliente (ano provável: ${ano}). `
        + 'Responda SOMENTE um JSON, sem nada antes ou depois: {"nf": "123456" ou null, "data": "AAAA-MM-DD" ou null, '
        + '"confianca_nf": "alta"|"media"|"baixa", "confianca_data": "alta"|"media"|"baixa"}. Se não conseguir ler algum campo, use null.' },
    ]);
    let r = {};
    try { r = JSON.parse(texto.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { r = {}; }
    const nf = r.nf ? String(r.nf).replace(/\D/g, '').replace(/^0+/, '') || null : null;
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(r.data || '')) ? r.data : null;
    res.json({ metodo: 'ia', nf, data, confianca_nf: r.confianca_nf || null, confianca_data: r.confianca_data || null, nota: nf ? await notaPeloNumero(nf) : null });
  } catch (err) {
    res.status(400).json({ erro: `Não consegui ler a foto: ${err.message}` });
  }
});

// ---------- Lançar: guarda a foto como comprovante e grava a data de entrega ----------
// POST /api/comprovantes/lancar  (foto, nf, data)
router.post('/lancar', autenticar, permitir('pode_editar_registros'), upload.single('foto'), async (req, res) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.data || '')) ? req.body.data : null;
    if (!data) return res.status(400).json({ erro: 'Data do canhoto inválida.' });
    const f = await notaPeloNumero(req.body.nf);
    if (!f) return res.status(404).json({ erro: `NF ${req.body.nf} não encontrada no sistema.` });
    let arquivo = null;
    if (req.file) {
      fs.mkdirSync(PASTA_CANHOTOS, { recursive: true });
      const ext = { 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[req.file.mimetype] || '.jpg';
      arquivo = `frete-${f.id}-${Date.now()}${ext}`;
      fs.writeFileSync(path.join(PASTA_CANHOTOS, arquivo), req.file.buffer);
    }
    const nota = `Entrega lançada pelo canhoto (foto) — data ${data.split('-').reverse().join('/')}, por ${req.usuario.nome}.`;
    await pool.query(
      `UPDATE fretes SET data_entrega = $2::date, data_entrega_origem = 'canhoto',
              canhoto_foto_arquivo = COALESCE($3, canhoto_foto_arquivo), canhoto_registrado_em = NOW(), atualizado_em = NOW(),
              observacoes = CASE WHEN POSITION($4 IN COALESCE(observacoes, '')) > 0 THEN observacoes ELSE CONCAT_WS(E'\n', NULLIF(observacoes, ''), $4::text) END
        WHERE id = $1`, [f.id, data, arquivo, nota]);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'comprovante_lote',
      detalhes: `Lançou a entrega da NF ${f.numero_nf} pelo canhoto (${data})`, registroId: f.id });
    res.json({ ok: true, id: f.id, numero_nf: f.numero_nf });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao lançar: ${err.message}` });
  }
});

module.exports = router;
