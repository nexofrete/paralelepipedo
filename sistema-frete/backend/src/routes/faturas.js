const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { ehAdmin, vePotudo, temAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');

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
              valor_ctes, qtd_ctes, parecer, codigo_verificacao, conferido_por_nome, conferido_em
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
      diferenca: i.dif_negociado_tabela != null ? Number(i.dif_negociado_tabela) : null,
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
    const totalGlosas = soma('glosa');
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
          conferido_por_id, conferido_por_nome, conferido_em, total_glosas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [String(numero).trim(), transportadora, data_emissao || null, data_vencimento || null, valorInformado,
       valorCtes, foto.length, soma('icms'), soma('valor_tabela'), parecer, observacoes || null,
       JSON.stringify(foto), codigo, req.usuario.id, req.usuario.nome, conferidoEm, totalGlosas]
    );
    const faturaId = nova[0].id;

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

    res.status(201).json({ id: faturaId, parecer, codigo_verificacao: codigo });
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
