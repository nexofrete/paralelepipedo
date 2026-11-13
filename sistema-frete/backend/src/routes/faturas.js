const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { ehAdmin, vePotudo, temAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const multer = require('multer');
const faturasFrete = require('../faturasFrete');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 20 } });

// Conferência de Fatura: junta os CT-e de uma fatura da transportadora,
// guarda uma "foto" dos valores no momento da conferência e gera o
// documento que vai pro financeiro.
const router = express.Router();

const STATUS_BLOQUEADOS = ['Cancelado'];

// Fatura junta CT-e de vários clientes, então só quem vê todos os fretes
// entra aqui. Ver: quem confere fatura, aprova pagamento ou vê o Financeiro
// ou a Auditoria. Conferir: só quem tem "Conferir fatura".
function podeVerFaturas(req, res, next) {
  if (ehAdmin(req) || (vePotudo(req) && temAlguma(req, 'pode_conferir_fatura', 'pode_aprovar_pagamento', 'pode_ver_financeiro', 'pode_ver_auditoria'))) return next();
  return res.status(403).json({ erro: 'Você não tem permissão para ver as faturas.' });
}
function podeConferirFatura(req, res, next) {
  if (ehAdmin(req) || (vePotudo(req) && temAlguma(req, 'pode_conferir_fatura'))) return next();
  return res.status(403).json({ erro: 'Você não tem permissão para conferir faturas.' });
}

// Campos que vão pra foto (snapshot) de cada CT-e da fatura.
const SELECT_ITENS = `
  SELECT f.id, f.numero_cte, f.data_emissao_cte, f.numero_pedido, f.numero_nf,
         f.cliente, f.cidade, f.uf, f.valor_faturado, f.peso_kg, f.qtd_volumes,
         f.valor_frete_negociado, f.valor_total_cte, f.valor_total_frete,
         f.dif_negociado_tabela, f.status, f.status_aprovacao, f.aprovado_por_nome,
         f.impostos_cte, f.fatura_id, f.cte_cancelado, f.glosa_valor, f.glosa_motivo,
         COALESCE(f.transportadora_cte, f.transportadora) AS transportadora
    FROM fretes f`;

function vIcms(impostosCte) {
  if (!impostosCte) return null;
  try {
    const v = JSON.parse(impostosCte).vICMS;
    return v != null ? Number(v) : null;
  } catch (e) { return null; }
}

// Um CT-e está "conferido" quando o sistema liberou ou alguém aprovou.
function situacaoConferencia(item) {
  if (item.status_aprovacao === 'Aprovado' || item.status === 'Liberado p/ Pagamento') return 'Conferido';
  if (item.status === 'Frete Retido') return 'Divergente';
  return 'Não conferido';
}

// GET /api/faturas  — faturas já conferidas (mais recentes primeiro)
router.get('/', autenticar, podeVerFaturas, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, numero, transportadora, data_emissao, data_vencimento, valor_informado,
              valor_ctes, qtd_ctes, parecer, codigo_verificacao, conferido_por_nome, conferido_em, total_glosas,
              pago_em::text, valor_pago, pago_por, pagamento_obs, COALESCE(situacao, 'conferida') AS situacao, bloqueio_motivo,
              aprovado_por, aprovado_em, liberado_por, liberado_em
         FROM faturas_frete ORDER BY conferido_em DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar as faturas.' });
  }
});

// GET /api/faturas/transportadoras  — quem tem CT-e ainda fora de fatura
router.get('/transportadoras', autenticar, podeVerFaturas, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT COALESCE(transportadora_cte, transportadora) AS nome
         FROM fretes
        WHERE chave_cte IS NOT NULL AND fatura_id IS NULL AND NOT cte_cancelado
          AND status <> ALL($1) AND COALESCE(transportadora_cte, transportadora) IS NOT NULL
        ORDER BY 1`,
      [STATUS_BLOQUEADOS]
    );
    res.json(rows.map((r) => r.nome));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar as transportadoras.' });
  }
});

// GET /api/faturas/ctes-disponiveis?transportadora=...
router.get('/ctes-disponiveis', autenticar, podeVerFaturas, async (req, res) => {
  try {
    const { transportadora } = req.query;
    if (!transportadora) return res.status(400).json({ erro: 'Informe a transportadora.' });
    const { rows } = await pool.query(
      `${SELECT_ITENS}
        WHERE f.chave_cte IS NOT NULL AND f.fatura_id IS NULL AND NOT f.cte_cancelado
          AND f.status <> ALL($2)
          AND COALESCE(f.transportadora_cte, f.transportadora) = $1
        ORDER BY f.data_emissao_cte DESC NULLS LAST, f.numero_cte DESC
        LIMIT 2000`,
      [transportadora, STATUS_BLOQUEADOS]
    );
    res.json(rows.map((r) => ({ ...r, icms_cte: vIcms(r.impostos_cte), conferencia: situacaoConferencia(r), impostos_cte: undefined })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os CT-e.' });
  }
});

// ---------- Gestão das faturas (src/faturasFrete.js) ----------
const erroRota = (res, err, padrao) => { if (!err.status) console.error(err); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'faturas', detalhes });
// CT-e que a transportadora ainda não cobrou (?dias= mínimo desde a emissão).
router.get('/nao-faturados', autenticar, podeVerFaturas, async (req, res) => {
  try { res.json(await faturasFrete.naoFaturados(req.query)); } catch (err) { erroRota(res, err, 'Erro ao listar os CT-e não faturados.'); }
});
router.get('/vencimentos', autenticar, podeVerFaturas, async (req, res) => {
  try { res.json(await faturasFrete.vencimentos()); } catch (err) { erroRota(res, err, 'Erro ao listar os vencimentos.'); }
});
router.get('/pendencias', autenticar, podeVerFaturas, async (req, res) => {
  try { res.json(await faturasFrete.pendencias()); } catch (err) { erroRota(res, err, 'Erro.'); }
});
// Importa a fatura em planilha (Excel/CSV; um ou vários arquivos) e acha os CT-e.
router.post('/importar', autenticar, podeConferirFatura, upload.array('arquivos', 20), async (req, res) => {
  try { res.json(await faturasFrete.importar(req.files, String(req.body?.transportadora || '').trim() || null)); } catch (err) { erroRota(res, err, 'Erro ao ler o arquivo da fatura.'); }
});
router.get('/:id(\\d+)/historico', autenticar, podeVerFaturas, async (req, res) => {
  try { res.json({ historico: await faturasFrete.verHistorico(Number(req.params.id)) }); } catch (err) { erroRota(res, err, 'Erro.'); }
});

// GET /api/faturas/:id  — fatura com a foto dos CT-e (pra imprimir)
router.get('/:id', autenticar, podeVerFaturas, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM faturas_frete WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Fatura não encontrada.' });
    const fatura = rows[0];

    const [{ rows: emp }, { rows: transp }] = await Promise.all([
      pool.query('SELECT razao_social, nome_fantasia, cnpj, ie, telefone, endereco, bairro, municipio, uf, cep FROM empresa WHERE id = 1'),
      pool.query('SELECT razao_social, cnpj, ie, telefone, endereco, municipio, uf FROM transportadoras WHERE razao_social = $1 LIMIT 1', [fatura.transportadora]),
    ]);
    res.json({ fatura, empresa: emp[0] || null, transportadora: transp[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar a fatura.' });
  }
});

// Aprovar e liberar: quem aprova pagamento. Bloquear: também quem confere fatura. Pagar: aprova pagamento ou Financeiro.
function podeAprovarFatura(req, res, next) {
  if (ehAdmin(req) || (vePotudo(req) && temAlguma(req, 'pode_aprovar_pagamento'))) return next();
  return res.status(403).json({ erro: 'Você não tem permissão para aprovar ou liberar faturas.' });
}
function podeBloquearFatura(req, res, next) {
  if (ehAdmin(req) || (vePotudo(req) && temAlguma(req, 'pode_aprovar_pagamento', 'pode_conferir_fatura', 'pode_ver_financeiro'))) return next();
  return res.status(403).json({ erro: 'Você não tem permissão para bloquear faturas.' });
}
const moedaTxt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
router.post('/:id(\\d+)/bloquear', autenticar, podeBloquearFatura, async (req, res) => {
  try { const f = await faturasFrete.bloquear(Number(req.params.id), req.body?.motivo, req.usuario.nome); log(req, `Bloqueou a fatura ${f.numero} (${f.transportadora}): ${req.body?.motivo}`); res.json({ ok: true }); } catch (err) { erroRota(res, err, 'Erro ao bloquear.'); }
});
router.post('/:id(\\d+)/desbloquear', autenticar, podeAprovarFatura, async (req, res) => {
  try { const f = await faturasFrete.desbloquear(Number(req.params.id), req.body?.justificativa, req.usuario.nome); log(req, `Desbloqueou a fatura ${f.numero} (${f.transportadora}): ${req.body?.justificativa}`); res.json({ ok: true }); } catch (err) { erroRota(res, err, 'Erro ao desbloquear.'); }
});
router.post('/:id(\\d+)/aprovar', autenticar, podeAprovarFatura, async (req, res) => {
  try {
    const f = await faturasFrete.aprovar(Number(req.params.id), { observacao: req.body?.observacao, podeValoresAltos: ehAdmin(req) || !!req.usuario.pode_aprovar_valores_altos }, req.usuario.nome);
    log(req, `Aprovou a fatura ${f.numero} (${f.transportadora}): ${moedaTxt(faturasFrete.valorAPagar(f))}`); res.json({ ok: true });
  } catch (err) { erroRota(res, err, 'Erro ao aprovar.'); }
});
router.post('/:id(\\d+)/liberar', autenticar, podeAprovarFatura, async (req, res) => {
  try { const f = await faturasFrete.liberar(Number(req.params.id), req.body?.observacao, req.usuario.nome); log(req, `Liberou para pagamento a fatura ${f.numero} (${f.transportadora})`); res.json({ ok: true }); } catch (err) { erroRota(res, err, 'Erro ao liberar.'); }
});
// Pagamento: só fatura liberada. Os CT-e dela passam a contar como pagos nos Indicadores.
function podePagarFatura(req, res, next) {
  if (ehAdmin(req) || (vePotudo(req) && temAlguma(req, 'pode_aprovar_pagamento', 'pode_ver_financeiro'))) return next();
  return res.status(403).json({ erro: 'Você não tem permissão para registrar o pagamento de faturas.' });
}
const numero = (v) => { if (v === '' || v == null) return null; const n = typeof v === 'number' ? v : Number(String(v).includes(',') ? String(v).replace(/\./g, '').replace(',', '.') : v); return Number.isFinite(n) ? n : NaN; };
router.post('/:id(\\d+)/pagamento', autenticar, podePagarFatura, async (req, res) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data || '')) ? req.body.data : null;
    if (!data) return res.status(400).json({ erro: 'Informe a data do pagamento.' });
    const { rows: [f0] } = await pool.query('SELECT * FROM faturas_frete WHERE id = $1', [req.params.id]);
    if (!f0) return res.status(404).json({ erro: 'Fatura não encontrada.' });
    const devido = faturasFrete.valorAPagar(f0);
    const valor = numero(req.body?.valor) ?? devido;
    if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ erro: 'Valor pago inválido.' });
    const obs = String(req.body?.observacao || '').trim().slice(0, 300) || null;
    const f = await faturasFrete.pagar(f0.id, { data, valor, observacao: obs }, req.usuario.nome);
    log(req, `Registrou o pagamento da fatura ${f.numero} (${f.transportadora}): ${moedaTxt(valor)} em ${data}`);
    res.json({ ok: true, valor_pago: Math.round(valor * 100) / 100, devido });
  } catch (err) { erroRota(res, err, 'Erro ao registrar o pagamento.'); }
});
router.delete('/:id(\\d+)/pagamento', autenticar, podePagarFatura, async (req, res) => {
  try { const f = await faturasFrete.desfazerPagamento(Number(req.params.id), req.usuario.nome); log(req, `Desfez o pagamento da fatura ${f.numero} (${f.transportadora})`); res.json({ ok: true }); } catch (err) { erroRota(res, err, 'Erro ao desfazer o pagamento.'); }
});

// POST /api/faturas  — confere e fecha a fatura
router.post('/', autenticar, podeConferirFatura, async (req, res) => {
  const { numero, transportadora, data_emissao, data_vencimento, valor_informado, observacoes, frete_ids } = req.body || {};

  if (!numero || !String(numero).trim()) return res.status(400).json({ erro: 'Informe o número da fatura.' });
  if (!transportadora) return res.status(400).json({ erro: 'Informe a transportadora.' });
  if (!Array.isArray(frete_ids) || frete_ids.length === 0) return res.status(400).json({ erro: 'Marque pelo menos um CT-e.' });

  const ids = [...new Set(frete_ids.map(Number).filter(Number.isInteger))];
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: repetida } = await cliente.query(
      'SELECT id FROM faturas_frete WHERE numero = $1 AND transportadora = $2', [String(numero).trim(), transportadora]
    );
    if (repetida[0]) {
      await cliente.query('ROLLBACK');
      return res.status(409).json({ erro: `A fatura ${numero} dessa transportadora já foi conferida.` });
    }

    const { rows: itens } = await cliente.query(`${SELECT_ITENS} WHERE f.id = ANY($1) ORDER BY f.numero_cte FOR UPDATE`, [ids]);
    if (itens.length !== ids.length) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({ erro: 'Algum CT-e marcado não foi encontrado. Atualize a lista e tente de novo.' });
    }
    const cancelado = itens.find((i) => i.cte_cancelado);
    if (cancelado) {
      await cliente.query('ROLLBACK');
      return res.status(409).json({ erro: `O CT-e ${cancelado.numero_cte} foi cancelado e não pode entrar em fatura.` });
    }
    const jaFaturado = itens.find((i) => i.fatura_id != null);
    if (jaFaturado) {
      await cliente.query('ROLLBACK');
      return res.status(409).json({ erro: `O CT-e ${jaFaturado.numero_cte} já está em outra fatura.` });
    }
    const outraTransp = itens.find((i) => i.transportadora !== transportadora);
    if (outraTransp) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({ erro: `O CT-e ${outraTransp.numero_cte} é de outra transportadora.` });
    }

    const foto = itens.map((i) => ({
      frete_id: i.id,
      numero_cte: i.numero_cte,
      data_emissao_cte: i.data_emissao_cte,
      numero_pedido: i.numero_pedido,
      numero_nf: i.numero_nf,
      cliente: i.cliente,
      cidade: i.cidade,
      uf: i.uf,
      valor_mercadoria: i.valor_faturado != null ? Number(i.valor_faturado) : null,
      peso_kg: i.peso_kg != null ? Number(i.peso_kg) : null,
      qtd_volumes: i.qtd_volumes,
      icms: vIcms(i.impostos_cte),
      valor_tabela: i.valor_total_frete != null ? Number(i.valor_total_frete) : null,
      valor_cte: i.valor_total_cte != null ? Number(i.valor_total_cte) : (i.valor_frete_negociado != null ? Number(i.valor_frete_negociado) : null),
      // CT-e − tabela (positivo = cobrou a mais), igual ao total "Fatura − tabela" do documento.
      diferenca: i.dif_negociado_tabela != null ? -Number(i.dif_negociado_tabela) : null,
      conferencia: situacaoConferencia(i),
      glosa: i.glosa_valor != null ? Number(i.glosa_valor) : null,
      glosa_motivo: i.glosa_motivo || null,
      aprovado_por: i.aprovado_por_nome,
      status_anterior: i.status,
    }));

    const soma = (campo) => Math.round(foto.reduce((s, i) => s + (i[campo] || 0), 0) * 100) / 100;
    const valorCtes = soma('valor_cte');
    const valorInformado = valor_informado != null && valor_informado !== '' ? Number(valor_informado) : null;
    const pendencias = foto.filter((i) => i.conferencia !== 'Conferido').length;
    // Com glosa combinada, a fatura deveria vir com o desconto: soma dos CT-e − glosas.
    // Créditos de contestação aceitos depois de faturado (src/contestacoes.js): abatem nesta fatura.
    const contestacoes = require('../contestacoes');
    const creditos = await contestacoes.creditosPendentes(cliente, transportadora);
    const totalCreditos = Math.round(creditos.reduce((s, c) => s + Number(c.valor_aceito || 0), 0) * 100) / 100;
    const totalGlosas = Math.round((soma('glosa') + totalCreditos) * 100) / 100;
    const valorEsperado = Math.round((valorCtes - totalGlosas) * 100) / 100;
    const bateFatura = valorInformado == null || Math.abs(valorInformado - valorEsperado) < 0.01;
    const parecer = pendencias === 0 && bateFatura ? 'Conferida' : 'Conferida com ressalvas';

    const conferidoEm = new Date();
    const codigo = crypto.createHash('sha256')
      .update(JSON.stringify({ numero, transportadora, valorCtes, itens: foto.map((i) => [i.numero_cte, i.valor_cte]), em: conferidoEm.toISOString() }))
      .digest('hex').slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');

    const { rows: nova } = await cliente.query(
      `INSERT INTO faturas_frete
         (numero, transportadora, data_emissao, data_vencimento, valor_informado, valor_ctes, qtd_ctes,
          total_icms, total_tabela, parecer, observacoes, itens, codigo_verificacao,
          conferido_por_id, conferido_por_nome, conferido_em, total_glosas, creditos_contestacao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [String(numero).trim(), transportadora, data_emissao || null, data_vencimento || null, valorInformado,
       valorCtes, foto.length, soma('icms'), soma('valor_tabela'), parecer, observacoes || null,
       JSON.stringify(foto), codigo, req.usuario.id, req.usuario.nome, conferidoEm, totalGlosas,
       creditos.length ? JSON.stringify(creditos.map((c) => ({ contestacao_id: c.contestacao_id, numero_cte: c.numero_cte, valor: Number(c.valor_aceito) }))) : null]
    );
    const faturaId = nova[0].id;
    await contestacoes.abaterCreditos(cliente, faturaId, creditos);
    await faturasFrete.aoConferir(cliente, faturaId, { parecer, pendencias, bateFatura, valorInformado, valorEsperado }, req.usuario.nome);

    await cliente.query(
      `UPDATE fretes
          SET fatura_id = $1, numero_fatura = $2, status = 'Faturado',
              data_fatura = COALESCE($3::date, data_fatura),
              data_vencimento = COALESCE($4::date, data_vencimento),
              atualizado_em = NOW()
        WHERE id = ANY($5)`,
      [faturaId, String(numero).trim(), data_emissao || null, data_vencimento || null, ids]
    );

    await cliente.query('COMMIT');

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'conferir_fatura',
      detalhes: `Fatura ${numero} (${transportadora}) — ${foto.length} CT-e, ${valorCtes.toFixed(2)} — ${parecer}`,
    });

    res.status(201).json({ id: faturaId, parecer, codigo_verificacao: codigo, creditos_contestacao: totalCreditos });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ erro: 'Erro ao conferir a fatura.' });
  } finally {
    cliente.release();
  }
});

// DELETE /api/faturas/:id  — desfaz a conferência (só admin): solta os CT-e
// e devolve cada um ao status que tinha antes.
router.delete('/:id', autenticar, apenasAdmin, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM faturas_frete WHERE id = $1 FOR UPDATE', [req.params.id]);
    const fatura = rows[0];
    if (!fatura) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ erro: 'Fatura não encontrada.' });
    }

    for (const item of fatura.itens || []) {
      await cliente.query(
        `UPDATE fretes SET fatura_id = NULL, numero_fatura = NULL, status = $2, atualizado_em = NOW()
          WHERE id = $1 AND fatura_id = $3`,
        [item.frete_id, item.status_anterior || 'Pendente', fatura.id]
      );
    }
    // Créditos de contestação abatidos nela voltam a ficar pendentes (para a próxima fatura).
    await cliente.query(`UPDATE contestacoes c SET status = CASE WHEN EXISTS (SELECT 1 FROM contestacao_itens r WHERE r.contestacao_id = c.id AND r.situacao = 'recusado') THEN 'parcial' ELSE 'aceita' END, atualizado_em = NOW()
       WHERE c.status = 'abatida' AND c.id IN (SELECT contestacao_id FROM contestacao_itens WHERE abatido_fatura_id = $1)`, [fatura.id]);
    await cliente.query('UPDATE contestacao_itens SET abatido_fatura_id = NULL, abatido_em = NULL WHERE abatido_fatura_id = $1', [fatura.id]);
    await cliente.query('DELETE FROM faturas_frete WHERE id = $1', [fatura.id]);
    await cliente.query('COMMIT');

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'desfazer_conferencia_fatura',
      detalhes: `Fatura ${fatura.numero} (${fatura.transportadora}) — conferência desfeita`,
    });
    res.json({ ok: true });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ erro: 'Erro ao desfazer a conferência.' });
  } finally {
    cliente.release();
  }
});

module.exports = router;
