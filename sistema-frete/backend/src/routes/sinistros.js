const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const { permitirAlguma, vePotudo } = require('../permissoes');

const router = express.Router();

// Sinistro não tem cliente próprio: pertence ao cliente da nota fiscal (ou do
// pedido, nos registros antigos). Quem não vê todos os fretes só enxerga/mexe
// nos sinistros de notas do seu cliente.
const FILTRO_PEDIDO_DO_CLIENTE = `(numero_nf IN (SELECT numero_nf FROM fretes WHERE cliente = $1 AND numero_nf IS NOT NULL)
  OR numero_pedido IN (SELECT numero_pedido FROM fretes WHERE cliente = $1 AND numero_pedido IS NOT NULL))`;
async function notaEhDoCliente(req, numeroNf, numeroPedido) {
  if (vePotudo(req)) return true;
  if (!numeroNf && !numeroPedido) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM fretes WHERE cliente = $3 AND ((numero_nf = $1 AND $1 IS NOT NULL) OR (numero_pedido = $2 AND $2 IS NOT NULL)) LIMIT 1`,
    [numeroNf || null, numeroPedido || null, req.usuario.cliente_nome]
  );
  return rows.length > 0;
}
async function sinistroEhDoCliente(req, id) {
  if (vePotudo(req)) return true;
  const { rows } = await pool.query('SELECT numero_nf, numero_pedido FROM sinistros WHERE id = $1', [id]);
  return rows[0] ? notaEhDoCliente(req, rows[0].numero_nf, rows[0].numero_pedido) : true; // não existe: deixa dar 404 lá embaixo
}

// Completa o sinistro com o que já está no frete da nota: número do pedido
// e transportadora (se não foram informados).
async function completarPelaNota(req, corpo) {
  const nf = String(corpo.numero_nf || '').trim();
  if (!nf) return corpo;
  const { rows } = await pool.query(
    `SELECT numero_pedido, COALESCE(transportadora_cte, transportadora) AS transportadora FROM fretes
      WHERE numero_nf = $1 AND NOT cte_cancelado ${vePotudo(req) ? '' : 'AND cliente = $2'} ORDER BY frete_principal_id NULLS FIRST, id DESC LIMIT 1`,
    vePotudo(req) ? [nf] : [nf, req.usuario.cliente_nome]
  );
  if (!rows[0]) return corpo;
  return {
    ...corpo,
    numero_nf: nf,
    numero_pedido: corpo.numero_pedido || rows[0].numero_pedido,
    transportadora: corpo.transportadora || rows[0].transportadora,
  };
}

const podeVer = permitirAlguma('pode_ver_sinistros');
const podeEditar = (req, res, next) => {
  const u = req.usuario || {};
  if (u.perfil === 'admin' || (u.pode_ver_sinistros && u.pode_editar_registros)) return next();
  return res.status(403).json({ erro: 'Você não tem permissão para fazer isso.' });
};

const CAMPOS_SINISTRO = [
  'numero_nf', 'numero_pedido', 'transportadora', 'tipo', 'descricao', 'valor_prejuizo',
  'data_ocorrencia', 'ressarcido', 'valor_ressarcido', 'data_ressarcimento', 'data_cobranca', 'status',
];

// Lembrete de cobrança na agenda de quem registrou/alterou o sinistro: um
// evento de dia inteiro na data de cobrar, com lembrete na véspera e no dia.
// Some sozinho quando o sinistro é resolvido, ressarcido ou fica sem data.
async function sincronizarLembreteCobranca(req, sinistro) {
  if (!sinistro) return;
  const precisa = sinistro.data_cobranca && sinistro.status !== 'Resolvido' && !sinistro.ressarcido;
  try {
    if (!precisa) {
      if (sinistro.agenda_evento_id) {
        await pool.query('DELETE FROM agenda_eventos WHERE id = $1', [sinistro.agenda_evento_id]);
        await pool.query('UPDATE sinistros SET agenda_evento_id = NULL WHERE id = $1', [sinistro.id]);
      }
      return;
    }
    const titulo = `Cobrar sinistro NF ${sinistro.numero_nf || sinistro.numero_pedido || '—'} — ${sinistro.transportadora || 'transportadora'}`.slice(0, 200);
    const valor = sinistro.valor_prejuizo != null ? Number(sinistro.valor_prejuizo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;
    const descricao = [`${sinistro.tipo}${valor ? ` de ${valor}` : ''}. Status: ${sinistro.status}.`, sinistro.descricao || ''].filter(Boolean).join('\n');
    const data = new Date(sinistro.data_cobranca).toISOString().slice(0, 10);

    const { rows: existe } = sinistro.agenda_evento_id
      ? await pool.query('SELECT id FROM agenda_eventos WHERE id = $1', [sinistro.agenda_evento_id])
      : { rows: [] };
    if (existe[0]) {
      await pool.query(
        `UPDATE agenda_eventos SET titulo = $1, descricao = $2, inicio = $3, atualizado_em = NOW() WHERE id = $4`,
        [titulo, descricao, data, existe[0].id]
      );
    } else {
      const { rows } = await pool.query(
        `INSERT INTO agenda_eventos (titulo, descricao, inicio, dia_inteiro, cor, lembrete_1dia, lembrete_1hora, criado_por_id, criado_por_nome)
         VALUES ($1, $2, $3, TRUE, 'laranja', TRUE, TRUE, $4, $5) RETURNING id`,
        [titulo, descricao, data, req.usuario.id, req.usuario.nome]
      );
      await pool.query('UPDATE sinistros SET agenda_evento_id = $1 WHERE id = $2', [rows[0].id, sinistro.id]);
    }
  } catch (err) {
    console.error('[sinistros] Não consegui atualizar o lembrete na agenda:', err.message);
  }
}

// Sem ressarcimento, não guarda valor nem data de ressarcimento.
function normalizarRessarcimento(corpo) {
  if (corpo.ressarcido === false) return { ...corpo, valor_ressarcido: null, data_ressarcimento: null };
  return corpo;
}

// GET /api/sinistros/buscar-nf?nf=123 — acha o frete da nota pra preencher o formulário.
router.get('/buscar-nf', autenticar, permitirAlguma('pode_ver_sinistros'), async (req, res) => {
  try {
    const nf = String(req.query.nf || '').trim();
    if (!nf) return res.json(null);
    const { rows } = await pool.query(
      `SELECT numero_nf, numero_pedido, cliente, cidade, uf, numero_cte, data_emissao_nf, valor_faturado,
              COALESCE(transportadora_cte, transportadora) AS transportadora
         FROM fretes
        WHERE numero_nf = $1 AND NOT cte_cancelado ${vePotudo(req) ? '' : 'AND cliente = $2'}
        ORDER BY frete_principal_id NULLS FIRST, id DESC LIMIT 1`,
      vePotudo(req) ? [nf] : [nf, req.usuario.cliente_nome]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar a nota fiscal.' });
  }
});

// GET /api/sinistros/transportadoras?q=... — busca por nome ou CNPJ, no
// cadastro de transportadoras e nas que aparecem nos fretes.
router.get('/transportadoras', autenticar, permitirAlguma('pode_ver_sinistros'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const digitos = q.replace(/\D/g, '');
    const { rows } = await pool.query(
      `SELECT nome, MAX(cnpj) AS cnpj FROM (
         SELECT razao_social AS nome, cnpj FROM transportadoras
         UNION ALL
         SELECT DISTINCT COALESCE(transportadora_cte, transportadora), NULL FROM fretes
          WHERE COALESCE(transportadora_cte, transportadora) IS NOT NULL
       ) t
       WHERE nome IS NOT NULL AND nome <> ''
         AND ($1 = '' OR nome ILIKE '%' || $1 || '%' OR ($2 <> '' AND REGEXP_REPLACE(COALESCE(cnpj, ''), '\\D', '', 'g') LIKE '%' || $2 || '%'))
       GROUP BY nome ORDER BY nome LIMIT 15`,
      [q, digitos.length >= 3 ? digitos : '']
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar transportadoras.' });
  }
});

// GET /api/sinistros
router.get('/', autenticar, podeVer, async (req, res) => {
  try {
    const { rows } = vePotudo(req)
      ? await pool.query('SELECT * FROM sinistros ORDER BY criado_em DESC')
      : await pool.query(`SELECT * FROM sinistros WHERE ${FILTRO_PEDIDO_DO_CLIENTE} ORDER BY criado_em DESC`, [req.usuario.cliente_nome]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar sinistros.' });
  }
});

// GET /api/sinistros/resumo — totais pra mostrar no topo da tela.
router.get('/resumo', autenticar, podeVer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS qtd_total,
              COALESCE(SUM(valor_prejuizo), 0)::float AS total_prejuizo,
              COALESCE(SUM(valor_ressarcido), 0)::float AS total_ressarcido,
              COUNT(*) FILTER (WHERE status = 'Aberto')::int AS qtd_abertos
       FROM sinistros ${vePotudo(req) ? '' : `WHERE ${FILTRO_PEDIDO_DO_CLIENTE}`}`,
      vePotudo(req) ? [] : [req.usuario.cliente_nome]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar resumo de sinistros.' });
  }
});

// GET /api/sinistros/relatorio — números e gráficos de sinistros (Relatórios).
router.get('/relatorio', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  const filtro = vePotudo(req) ? 'TRUE' : FILTRO_PEDIDO_DO_CLIENTE;
  const params = vePotudo(req) ? [] : [require('../permissoes').textoLimpo(req.usuario.cliente_nome)];
  const pendente = `GREATEST(COALESCE(valor_prejuizo, 0) - COALESCE(valor_ressarcido, 0), 0)`;
  try {
    const [{ rows: resumo }, { rows: porTransp }, { rows: porTipo }, { rows: porMes }, { rows: cobrancas }] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS qtd,
                COUNT(*) FILTER (WHERE status <> 'Resolvido')::int AS qtd_abertos,
                COALESCE(SUM(valor_prejuizo), 0)::float AS prejuizo,
                COALESCE(SUM(valor_ressarcido), 0)::float AS ressarcido,
                COALESCE(SUM(${pendente}) FILTER (WHERE status <> 'Resolvido'), 0)::float AS a_recuperar,
                COUNT(*) FILTER (WHERE data_cobranca < CURRENT_DATE AND status <> 'Resolvido' AND NOT ressarcido)::int AS cobrancas_atrasadas,
                COUNT(*) FILTER (WHERE data_cobranca BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status <> 'Resolvido' AND NOT ressarcido)::int AS cobrancas_semana
           FROM sinistros WHERE ${filtro}`, params),
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(transportadora), ''), 'Sem transportadora') AS transportadora,
                COUNT(*)::int AS qtd,
                COALESCE(SUM(valor_ressarcido), 0)::float AS ressarcido,
                COALESCE(SUM(${pendente}), 0)::float AS pendente
           FROM sinistros WHERE ${filtro}
          GROUP BY 1 ORDER BY SUM(COALESCE(valor_prejuizo, 0)) DESC, qtd DESC LIMIT 10`, params),
      pool.query(
        `SELECT tipo, COUNT(*)::int AS qtd, COALESCE(SUM(valor_prejuizo), 0)::float AS prejuizo
           FROM sinistros WHERE ${filtro} GROUP BY tipo ORDER BY qtd DESC`, params),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(data_ocorrencia, criado_em::date)), 'MM/YYYY') AS mes,
                COUNT(*)::int AS qtd, COALESCE(SUM(valor_prejuizo), 0)::float AS prejuizo
           FROM sinistros
          WHERE ${filtro} AND COALESCE(data_ocorrencia, criado_em::date) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
          GROUP BY DATE_TRUNC('month', COALESCE(data_ocorrencia, criado_em::date))
          ORDER BY DATE_TRUNC('month', COALESCE(data_ocorrencia, criado_em::date))`, params),
      pool.query(
        `SELECT id, numero_nf, numero_pedido, transportadora, tipo, data_cobranca, status,
                ${pendente}::float AS a_recuperar
           FROM sinistros
          WHERE ${filtro} AND data_cobranca IS NOT NULL AND status <> 'Resolvido' AND NOT ressarcido
          ORDER BY data_cobranca LIMIT 12`, params),
    ]);
    res.json({ resumo: resumo[0], por_transportadora: porTransp, por_tipo: porTipo, por_mes: porMes, cobrancas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório de sinistros.' });
  }
});

// POST /api/sinistros
router.post('/', autenticar, podeEditar, async (req, res) => {
  try {
    const corpo = normalizarRessarcimento(await completarPelaNota(req, req.body || {}));
    if (!(await notaEhDoCliente(req, corpo.numero_nf, corpo.numero_pedido))) {
      return res.status(403).json({ erro: 'Essa nota fiscal não é de um cliente seu.' });
    }
    const campos = CAMPOS_SINISTRO.filter((c) => corpo[c] !== undefined);
    const valores = campos.map((c) => (corpo[c] === '' ? null : corpo[c]));
    const { rows } = await pool.query(
      `INSERT INTO sinistros (${campos.join(', ')}, criado_por) VALUES (${campos.map((_, i) => `$${i + 1}`).join(', ')}, $${campos.length + 1}) RETURNING *`,
      [...valores, req.usuario.nome]
    );
    await sincronizarLembreteCobranca(req, rows[0]);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'criar_sinistro',
      detalhes: `Registrou sinistro (${rows[0].tipo}) da NF ${rows[0].numero_nf || '—'} (pedido ${rows[0].numero_pedido || '—'}), transportadora ${rows[0].transportadora || '—'}`,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar o sinistro.' });
  }
});

// PUT /api/sinistros/:id
router.put('/:id', autenticar, podeEditar, async (req, res) => {
  try {
    const corpo = normalizarRessarcimento(await completarPelaNota(req, req.body || {}));
    if (!(await sinistroEhDoCliente(req, req.params.id)) ||
        ((corpo.numero_nf !== undefined || corpo.numero_pedido !== undefined) && !(await notaEhDoCliente(req, corpo.numero_nf, corpo.numero_pedido)))) {
      return res.status(403).json({ erro: 'Você não tem acesso a esse sinistro.' });
    }
    const campos = CAMPOS_SINISTRO.filter((c) => corpo[c] !== undefined);
    if (campos.length === 0) return res.status(400).json({ erro: 'Nada pra atualizar.' });
    const sets = campos.map((c, i) => `${c} = $${i + 1}`);
    const valores = campos.map((c) => (corpo[c] === '' ? null : corpo[c]));
    valores.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE sinistros SET ${sets.join(', ')}, atualizado_em = NOW() WHERE id = $${valores.length} RETURNING *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Sinistro não encontrado.' });
    await sincronizarLembreteCobranca(req, rows[0]);

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_sinistro',
      detalhes: `Editou o sinistro #${req.params.id}`,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar o sinistro.' });
  }
});

// DELETE /api/sinistros/:id
router.delete('/:id', autenticar, podeEditar, async (req, res) => {
  try {
    if (!(await sinistroEhDoCliente(req, req.params.id))) {
      return res.status(403).json({ erro: 'Você não tem acesso a esse sinistro.' });
    }
    const { rows: apagado } = await pool.query('DELETE FROM sinistros WHERE id = $1 RETURNING agenda_evento_id', [req.params.id]);
    if (apagado[0]?.agenda_evento_id) await pool.query('DELETE FROM agenda_eventos WHERE id = $1', [apagado[0].agenda_evento_id]);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'excluir_sinistro',
      detalhes: `Excluiu o sinistro #${req.params.id}`,
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir o sinistro.' });
  }
});

module.exports = router;
