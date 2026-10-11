const express = require('express');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const { permitirAlguma, consultaCliente, podeVerCliente, freteDoCliente, temAlguma, vePotudo, bloquearCteCancelado } = require('../permissoes');
const { calcularParaRegistro } = require('../calculoFrete');
const { normalizarCidade, corrigirPelaLista } = require('../nomesCidades');
const { extrairComposicaoCTe } = require('../utils/xmlParser');

const router = express.Router();

// GET /api/fretes
// Admin e quem tem "pode_ver_todos" veem tudo. Os demais veem só as linhas
// onde "cliente" bate com o cliente_nome do usuário.
// Aceita ?pagina=1&por_pagina=100 para paginação. Sem esses parâmetros,
// retorna até 10000 linhas de uma vez (usado pela Visão geral, que precisa
// do total pra calcular os indicadores).
// Colunas que podem ser filtradas individualmente (evita SQL injection pelo nome da coluna).
const COLUNAS_FILTRAVEIS = [
  'numero_pedido', 'pedido_mercus', 'data_pedido', 'data_emissao_nf', 'numero_nf',
  'data_emissao_cte', 'numero_cte', 'data_fatura', 'numero_fatura',
  'cliente', 'cidade', 'bairro', 'uf', 'transportadora', 'transportadora_nfe', 'transportadora_cte', 'tipo_carga', 'frete_cif_fob',
  'redespacho', 'cidade_redespacho', 'valor_faturado', 'valor_total_cte', 'valor_total_calculado', 'qtd_volumes', 'peso_kg', 'cubagem_m3',
  'tabela_frete', 'interior_capital', 'valor_frete_tabelado', 'valor_frete_negociado',
  'tde', 'tda', 'gris', 'pedagio', 'trt', 'ad_valorem', 'reentrega', 'devolucao', 'outras_despesas', 'tabela_preco_id_usada', 'prazo_dias_tabela',
  'valor_total_frete', 'dif_negociado_tabela', 'percent_frete',
  'numero_mapa', 'data_coleta', 'data_entrega', 'data_vencimento', 'status', 'status_aprovacao', 'observacoes', 'auditoria_calculo', 'carga_direta',
];

router.get('/', autenticar, async (req, res) => {
  try {
    const { status, busca } = req.query;
    const porPagina = Math.min(parseInt(req.query.por_pagina, 10) || 10000, 10000);
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const offset = (pagina - 1) * porPagina;

    const condicoes = [];
    const valores = [];
    const vePotudo = req.usuario.perfil === 'admin' || req.usuario.pode_ver_todos;

    if (!vePotudo) {
      valores.push(require('../permissoes').textoLimpo(req.usuario.cliente_nome));
      condicoes.push(`cliente = $${valores.length}`);
    }
    if (status) {
      valores.push(status);
      condicoes.push(`status = $${valores.length}`);
    }
    if (busca) {
      valores.push(`%${busca}%`);
      condicoes.push(`(numero_pedido ILIKE $${valores.length} OR fretes.numero_nf ILIKE $${valores.length} OR numero_cte ILIKE $${valores.length} OR transportadora ILIKE $${valores.length} OR redespacho ILIKE $${valores.length} OR cliente ILIKE $${valores.length})`);
    }

    // Filtros por coluna, estilo Excel: ?filtros={"cliente":"casa","uf":"sp"}
    if (req.query.filtros) {
      try {
        const filtros = JSON.parse(req.query.filtros);
        for (const [coluna, valor] of Object.entries(filtros)) {
          if (!COLUNAS_FILTRAVEIS.includes(coluna) || !valor) continue;
          valores.push(`%${valor}%`);
          condicoes.push(`${coluna === 'numero_nf' ? 'fretes.numero_nf' : coluna}::text ILIKE $${valores.length}`);
        }
      } catch (e) { /* filtro mal formado, ignora */ }
    }

    // Filtro de período (De/Até) na Data Emissão NF.
    if (req.query.data_emissao_nf_de) {
      valores.push(req.query.data_emissao_nf_de);
      condicoes.push(`data_emissao_nf >= $${valores.length}`);
    }
    if (req.query.data_emissao_nf_ate) {
      valores.push(req.query.data_emissao_nf_ate);
      condicoes.push(`data_emissao_nf <= $${valores.length}`);
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const { rows: contagem } = await pool.query(`SELECT COUNT(*)::int AS total FROM fretes ${where}`, valores);
    const total = contagem[0].total;

    const valoresPagina = [...valores, porPagina, offset];
    const { rows } = await pool.query(
      `SELECT fretes.*,
              COALESCE(cn.quantidade, 0) AS nf_copias,
              CASE WHEN numero_cte IS NOT NULL
                   THEN (SELECT COUNT(*) FROM fretes f2 WHERE f2.numero_cte = fretes.numero_cte)
                   ELSE NULL END AS mesmo_cte_contagem
       FROM fretes
       LEFT JOIN copias_nf cn ON cn.numero_nf = fretes.numero_nf
       ${where}
       ORDER BY (CASE WHEN fretes.numero_nf ~ '^[0-9]+$' THEN fretes.numero_nf::bigint END) ASC NULLS LAST, criado_em DESC
       LIMIT $${valoresPagina.length - 1} OFFSET $${valoresPagina.length}`,
      valoresPagina
    );

    res.json({
      registros: rows,
      total,
      pagina,
      por_pagina: porPagina,
      total_paginas: Math.max(Math.ceil(total / porPagina), 1),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os registros.' });
  }
});

// POST /api/fretes  (lançamento manual de um novo registro, sem XML)
const CAMPOS_MANUAIS = [
  'numero_pedido', 'pedido_mercus', 'data_pedido', 'data_emissao_nf', 'numero_nf',
  'data_emissao_cte', 'numero_cte', 'data_fatura', 'numero_fatura',
  'cliente', 'cidade', 'bairro', 'uf', 'transportadora', 'transportadora_cte', 'frete_cif_fob', 'tipo_carga',
  'redespacho', 'cidade_redespacho', 'valor_faturado', 'valor_total_cte', 'valor_total_calculado', 'qtd_volumes', 'peso_kg', 'cubagem_m3',
  'tabela_frete', 'interior_capital', 'valor_frete_tabelado', 'valor_frete_negociado',
  'tde', 'tda', 'gris', 'pedagio', 'trt', 'ad_valorem', 'reentrega', 'devolucao', 'outras_despesas', 'tabela_preco_id_usada', 'prazo_dias_tabela',
  'valor_total_frete', 'dif_negociado_tabela', 'percent_frete',
  'numero_mapa', 'data_coleta', 'data_entrega', 'data_vencimento', 'status', 'observacoes', 'auditoria_calculo', 'carga_direta',
];

// Campos que decidem a conferência automática (valor do CT-e x valor esperado):
// mexer neles pode fazer o frete ser liberado para pagamento sozinho. Por isso
// só quem pode aprovar pagamento (e dentro da alçada) pode mudá-los à mão.
const CAMPOS_DE_CONFERENCIA = [
  'valor_total_cte', 'valor_total_calculado', 'valor_total_frete', 'valor_frete_tabelado', 'valor_frete_negociado',
  'outras_despesas', 'tabela_preco_id_usada', 'dif_negociado_tabela', 'carga_direta',
];
const vazio = (v) => v === null || v === undefined || v === '';
function valorMudou(atual, novo) {
  if (vazio(atual) && vazio(novo)) return false;
  if (vazio(atual) || vazio(novo)) return true;
  if (typeof atual === 'boolean' || typeof novo === 'boolean') return String(atual) !== String(novo);
  const a = Number(atual); const b = Number(novo);
  if (!Number.isNaN(a) && !Number.isNaN(b)) return a !== b;
  return String(atual) !== String(novo);
}
// Devolve a mensagem de erro (ou null) para quem tenta mexer nos campos da conferência.
async function bloqueioCamposConferencia(req, camposMexidos, valoresDoFrete) {
  if (!camposMexidos.length) return null;
  if (!temAlguma(req, 'pode_aprovar_pagamento')) {
    return `Só quem pode aprovar pagamento pode alterar ${camposMexidos.join(', ')} — esses campos decidem a liberação automática do frete.`;
  }
  const { rows: config } = await pool.query('SELECT limite_alcada_aprovacao FROM configuracao_auditoria WHERE id = 1');
  const limite = config[0]?.limite_alcada_aprovacao;
  const maior = Math.max(0, ...valoresDoFrete.map(Number).filter((n) => !Number.isNaN(n)));
  if (limite != null && maior > Number(limite) && !req.usuario.pode_aprovar_valores_altos) {
    return `Esse frete passa de R$ ${Number(limite).toFixed(2)} — só um gerente (com a permissão "Aprovar valores altos") pode alterar os valores da conferência.`;
  }
  return null;
}

router.post('/', autenticar, permitir('pode_editar_registros'), freteDoCliente(), async (req, res) => {
  try {
    const campos = Object.keys(req.body).filter((c) => CAMPOS_MANUAIS.includes(c) && req.body[c] !== '');
    if (campos.length === 0) {
      return res.status(400).json({ erro: 'Preencha ao menos um campo.' });
    }
    const mexidos = campos.filter((c) => CAMPOS_DE_CONFERENCIA.includes(c) && !vazio(req.body[c]) && req.body[c] !== false);
    const bloqueio = await bloqueioCamposConferencia(req, mexidos,
      ['valor_total_cte', 'valor_total_frete', 'valor_total_calculado', 'valor_frete_negociado'].map((c) => req.body[c]).filter((v) => !vazio(v)));
    if (bloqueio) return res.status(403).json({ erro: bloqueio });

    const valores = campos.map((c) => req.body[c]);
    campos.push('usuario_upload_id');
    valores.push(req.usuario.id);
    const placeholders = campos.map((_, i) => `$${i + 1}`);

    const { rows } = await pool.query(
      `INSERT INTO fretes (${campos.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      valores
    );
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'criar_registro',
      detalhes: `Lançou manualmente o registro #${rows[0].id} (pedido ${rows[0].numero_pedido || '—'}, NF ${rows[0].numero_nf || '—'})`,
      registroId: rows[0].id,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.message && err.message.includes('Só é possível liberar pagamento')) {
      return res.status(400).json({ erro: err.message });
    }
    res.status(500).json({ erro: 'Erro ao criar o registro.' });
  }
});

// CT-e marcado como "transportadora não levou a nota": não pode ser aprovado nem pago.
async function bloquearNaoLevou(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT numero_cte, cte_nao_levou FROM fretes WHERE id = $1', [req.params.id]);
    if (rows[0]?.cte_nao_levou) {
      return res.status(409).json({ erro: `O CT-e ${rows[0].numero_cte || ''} é de uma transportadora que NÃO levou a nota e não pode ser pago. Se isso estiver errado, troque a transportadora no Detalhe do Frete (Auditoria).` });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao validar o registro.' });
  }
}

// PUT /api/fretes/:id/aprovar  (Fluxo de Aprovação — só quem tem permissão)
router.put('/:id/aprovar', autenticar, permitir('pode_aprovar_pagamento'), freteDoCliente(), bloquearCteCancelado(), bloquearNaoLevou, async (req, res) => {
  try {
    const justificativa = (req.body.justificativa || '').trim() || null;

    const { rows: freteAtual } = await pool.query('SELECT valor_total_frete FROM fretes WHERE id = $1', [req.params.id]);
    if (!freteAtual[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });

    const { rows: config } = await pool.query('SELECT limite_alcada_aprovacao FROM configuracao_auditoria WHERE id = 1');
    const limite = config[0]?.limite_alcada_aprovacao;
    if (limite != null && Number(freteAtual[0].valor_total_frete) > Number(limite) && !req.usuario.pode_aprovar_valores_altos) {
      return res.status(403).json({ erro: `Esse frete passa de R$ ${Number(limite).toFixed(2)} — só um gerente (com a permissão "Aprovar valores altos") pode liberar esse valor.` });
    }

    const { rows } = await pool.query(
      `UPDATE fretes SET status_aprovacao = 'Aprovado', aprovado_por_nome = $1, aprovado_em = NOW(),
              motivo_rejeicao = NULL, justificativa_aprovacao = $2,
              status = CASE WHEN status = 'Frete Retido' THEN 'Liberado p/ Pagamento' ELSE status END
       WHERE id = $3 RETURNING *`,
      [req.usuario.nome, justificativa, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'aprovar_frete',
      detalhes: `Aprovou o frete #${rows[0].id} (pedido ${rows[0].numero_pedido || '—'}) para liberação de pagamento${justificativa ? `. Justificativa: ${justificativa}` : ''}`,
      registroId: rows[0].id,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao aprovar o registro.' });
  }
});

// PUT /api/fretes/aprovar-lote — aprova vários fretes de uma vez, respeitando
// a mesma verificação de alçada de cada um individualmente.
router.put('/aprovar-lote', autenticar, permitir('pode_aprovar_pagamento'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const justificativa = (req.body.justificativa || '').trim() || null;
    if (ids.length === 0) return res.status(400).json({ erro: 'Selecione pelo menos um frete.' });

    const { rows: config } = await pool.query('SELECT limite_alcada_aprovacao FROM configuracao_auditoria WHERE id = 1');
    const limite = config[0]?.limite_alcada_aprovacao;

    let aprovados = 0;
    const bloqueadosPorAlcada = [];
    for (const id of ids) {
      const { rows: frete } = await pool.query('SELECT id, numero_pedido, valor_total_frete, cliente, cte_cancelado, cte_nao_levou FROM fretes WHERE id = $1', [id]);
      if (!frete[0] || frete[0].cte_cancelado || frete[0].cte_nao_levou || !podeVerCliente(req, frete[0].cliente)) continue;
      if (limite != null && Number(frete[0].valor_total_frete) > Number(limite) && !req.usuario.pode_aprovar_valores_altos) {
        bloqueadosPorAlcada.push(frete[0].numero_pedido || `#${id}`);
        continue;
      }
      await pool.query(
        `UPDATE fretes SET status_aprovacao = 'Aprovado', aprovado_por_nome = $1, aprovado_em = NOW(),
                motivo_rejeicao = NULL, justificativa_aprovacao = $2,
                status = CASE WHEN status = 'Frete Retido' THEN 'Liberado p/ Pagamento' ELSE status END
         WHERE id = $3`,
        [req.usuario.nome, justificativa, id]
      );
      aprovados++;
    }

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'aprovar_lote',
      detalhes: `Aprovou ${aprovados} frete(s) em lote${justificativa ? `. Justificativa: ${justificativa}` : ''}`,
    });
    res.json({ aprovados, total: ids.length, bloqueadosPorAlcada });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao aprovar em lote.' });
  }
});

// PUT /api/fretes/:id/rejeitar  (Fluxo de Aprovação — só quem tem permissão)
router.put('/:id/rejeitar', autenticar, permitir('pode_aprovar_pagamento'), freteDoCliente(), bloquearCteCancelado(), async (req, res) => {
  try {
    const motivo = (req.body.motivo || '').trim() || null;
    const { rows } = await pool.query(
      `UPDATE fretes SET status_aprovacao = 'Rejeitado', aprovado_por_nome = $1, aprovado_em = NOW(), motivo_rejeicao = $2
       WHERE id = $3 RETURNING *`,
      [req.usuario.nome, motivo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'rejeitar_frete',
      detalhes: `Rejeitou o frete #${rows[0].id} (pedido ${rows[0].numero_pedido || '—'})${motivo ? `: ${motivo}` : ''}`,
      registroId: rows[0].id,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao rejeitar o registro.' });
  }
});

// PUT /api/fretes/:id/glosa  (Acordo Comercial — transportadora aceita descontar
// a diferença no boleto; registra a glosa e já libera o pagamento)
router.put('/:id/glosa', autenticar, permitir('pode_aprovar_pagamento'), freteDoCliente(), bloquearCteCancelado(), bloquearNaoLevou, async (req, res) => {
  try {
    const valor = Number(req.body.valor);
    const motivo = (req.body.motivo || '').trim() || null;
    if (!valor || valor <= 0) {
      return res.status(400).json({ erro: 'Informe um valor de glosa válido (maior que zero).' });
    }

    const { rows } = await pool.query(
      `UPDATE fretes SET
         glosa_valor = $1, glosa_motivo = $2, glosa_registrada_por = $3, glosa_registrada_em = NOW(),
         status_aprovacao = 'Aprovado', aprovado_por_nome = $3, aprovado_em = NOW(), motivo_rejeicao = NULL,
         justificativa_aprovacao = $4,
         status = CASE WHEN status = 'Frete Retido' THEN 'Liberado p/ Pagamento' ELSE status END
       WHERE id = $5 RETURNING *`,
      [valor, motivo, req.usuario.nome, `Divergência resolvida via glosa de ${valor.toFixed(2)} combinada com a transportadora${motivo ? `: ${motivo}` : ''}.`, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'registrar_glosa',
      detalhes: `Registrou glosa de R$ ${valor.toFixed(2)} no frete #${rows[0].id} (pedido ${rows[0].numero_pedido || '—'})${motivo ? `: ${motivo}` : ''}`,
      registroId: rows[0].id,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar a glosa.' });
  }
});

// POST /api/fretes/recalcular-tudo
// Passa por TODOS os registros (novos e antigos) e recalcula o Valor Frete
// Tabelado com a regra mais atual: acha o trecho pela cidade do redespacho
// (se tiver) ou do cliente, dentro da tabela da transportadora, e aplica a
// regra de volume mínimo/frete mínimo — a mesma lógica de "Calcular e preencher".
// GET /api/fretes/recalcular-tudo/diagnostico
// Mostra quais transportadoras têm mais fretes parados por falta de Tabela
// de Preço cadastrada — pra saber por onde começar a cadastrar.
router.get('/recalcular-tudo/diagnostico', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.transportadora_cte AS transportadora, COUNT(*)::int AS qtd_fretes,
              EXISTS (
                SELECT 1 FROM tabelas_preco tp
                JOIN transportadoras t ON t.id = tp.transportadora_id
                WHERE tp.ativa = TRUE AND t.razao_social ILIKE '%' || f.transportadora_cte || '%'
              ) AS tem_tabela
       FROM fretes f
       WHERE f.transportadora_cte IS NOT NULL AND (f.carga_direta IS NOT TRUE)
         AND f.valor_total_calculado IS NULL AND f.valor_frete_tabelado IS NULL
       GROUP BY f.transportadora_cte
       ORDER BY qtd_fretes DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar diagnóstico.' });
  }
});

// GET /api/fretes/relatorios/transportadoras
// Dados pros gráficos: % de fretes com tabela cadastrada x sem, e ranking das
// transportadoras (Transporte Cte) que mais carregam.
router.get('/relatorios/transportadoras', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT f.transportadora_cte AS transportadora, COUNT(*)::int AS qtd_fretes,
              COALESCE(SUM(f.valor_faturado), 0)::float AS valor_total,
              EXISTS (
                SELECT 1 FROM tabelas_preco tp
                JOIN transportadoras t ON t.id = tp.transportadora_id
                WHERE tp.ativa = TRUE AND t.razao_social ILIKE '%' || f.transportadora_cte || '%'
              ) AS tem_tabela
       FROM fretes f
       WHERE f.transportadora_cte IS NOT NULL
       GROUP BY f.transportadora_cte
       ORDER BY qtd_fretes DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de transportadoras.' });
  }
});

// GET /api/fretes/relatorios/redespacho
// Ranking das transportadoras de REDESPACHO que mais aparecem (a etapa final
// de entrega, quando o frete principal passa a mão pra outra transportadora).
router.get('/relatorios/redespacho', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT redespacho, COUNT(*)::int AS qtd_fretes
       FROM fretes
       WHERE redespacho IS NOT NULL AND redespacho <> ''
       GROUP BY redespacho
       ORDER BY qtd_fretes DESC
       LIMIT 15`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de redespacho.' });
  }
});

// GET /api/fretes/relatorios/cidades
// Ranking das cidades onde mais entrego (pela Cidade do cliente).
router.get('/relatorios/cidades', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    // Onde cada transportadora ENTREGOU: se o frete foi passado pra um
    // redespacho, conta a cidade do redespacho; se foi direto, a cidade do
    // cliente. Só entram transportadoras com tabela de preço ativa (mesmo
    // critério do gráfico "% de Fretes com Tabela de Preço Cadastrada").
    const temTabela = `EXISTS (
        SELECT 1 FROM tabelas_preco tp
        JOIN transportadoras t ON t.id = tp.transportadora_id
        WHERE tp.ativa = TRUE AND t.razao_social ILIKE '%' || f.transportadora_cte || '%'
      )`;
    const transportadora = req.query.transportadora ? String(req.query.transportadora) : null;

    const [{ rows: transportadoras }, { rows: cidadesBrutas }] = await Promise.all([
      consultaCliente(req, 
        `SELECT DISTINCT f.transportadora_cte AS nome FROM fretes f
          WHERE f.transportadora_cte IS NOT NULL AND ${temTabela}
          ORDER BY 1`
      ),
      consultaCliente(req, 
        `WITH base AS (
           SELECT NULLIF(TRIM(f.redespacho), '') IS NOT NULL AS via_redespacho,
                  UPPER(TRIM(CASE WHEN NULLIF(TRIM(f.redespacho), '') IS NOT NULL
                                  THEN COALESCE(NULLIF(TRIM(f.cidade_redespacho), ''), f.cidade)
                                  ELSE f.cidade END)) AS cidade_entrega
             FROM fretes f
            WHERE f.transportadora_cte IS NOT NULL
              AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')
              AND ($1::text IS NULL OR f.transportadora_cte = $1)
              AND ${temTabela}
         )
         SELECT cidade_entrega AS cidade,
                COUNT(*) FILTER (WHERE via_redespacho)::int     AS qtd_redespacho,
                COUNT(*) FILTER (WHERE NOT via_redespacho)::int AS qtd_direto
           FROM base
          WHERE cidade_entrega IS NOT NULL AND cidade_entrega <> ''
          GROUP BY cidade_entrega`,
        [transportadora]
      ),
    ]);

    // Junta as grafias diferentes da mesma cidade (acento, texto do ERP
    // grudado no nome, erro de digitação) antes de montar o top 15. As
    // cidades dos clientes (vindas da NF-e) servem de lista de nomes certos.
    const { rows: nomesNota } = await pool.query(
      `SELECT DISTINCT UPPER(TRIM(cidade)) AS c FROM fretes WHERE NULLIF(TRIM(cidade), '') IS NOT NULL`
    );
    const conhecidas = new Set(nomesNota.map((r) => normalizarCidade(r.c)).filter(Boolean));
    const juntas = new Map();
    cidadesBrutas.forEach((c) => {
      const nome = corrigirPelaLista(normalizarCidade(c.cidade), conhecidas);
      if (!nome) return;
      const atual = juntas.get(nome) || { cidade: nome, qtd_redespacho: 0, qtd_direto: 0, qtd_fretes: 0 };
      atual.qtd_redespacho += c.qtd_redespacho;
      atual.qtd_direto += c.qtd_direto;
      atual.qtd_fretes += c.qtd_redespacho + c.qtd_direto;
      juntas.set(nome, atual);
    });
    const cidades = [...juntas.values()]
      .sort((a, b) => b.qtd_fretes - a.qtd_fretes || a.cidade.localeCompare(b.cidade))
      .slice(0, 15);
    res.json({ transportadoras: transportadoras.map((t) => t.nome), cidades });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de cidades.' });
  }
});

// GET /api/fretes/relatorios/entregas-previstas
// Fretes que ainda não têm entrega registrada, pela Data Prevista de Entrega
// (Coleta ou CT-e + prazo do trecho): atrasados, hoje, próximos dias.
router.get('/relatorios/entregas-previstas', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  // Nota cancelada não tem entrega a acompanhar.
  const ABERTO = `data_entrega IS NULL AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`;
  try {
    const [{ rows: resumo }, { rows: porTransp }, { rows: porDia }, { rows: lista }, { rows: slaMes }] = await Promise.all([
      consultaCliente(req,
        `SELECT
           COUNT(*) FILTER (WHERE data_entrega_prevista < CURRENT_DATE)::int AS atrasadas,
           COUNT(*) FILTER (WHERE data_entrega_prevista = CURRENT_DATE)::int AS hoje,
           COUNT(*) FILTER (WHERE data_entrega_prevista BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 7)::int AS proximos_7,
           COUNT(*) FILTER (WHERE data_entrega_prevista > CURRENT_DATE + 7)::int AS depois,
           COUNT(*) FILTER (WHERE data_entrega_prevista IS NULL AND chave_cte IS NOT NULL)::int AS sem_previsao
         FROM fretes WHERE ${ABERTO}`),
      consultaCliente(req,
        `SELECT COALESCE(transportadora_cte, transportadora, 'Sem transportadora') AS transportadora,
                COUNT(*)::int AS qtd, MAX(CURRENT_DATE - data_entrega_prevista)::int AS maior_atraso
           FROM fretes WHERE ${ABERTO} AND data_entrega_prevista < CURRENT_DATE
          GROUP BY 1 ORDER BY qtd DESC, maior_atraso DESC LIMIT 10`),
      consultaCliente(req,
        `SELECT TO_CHAR(d::date, 'YYYY-MM-DD') AS data,
                (SELECT COUNT(*)::int FROM fretes WHERE ${ABERTO} AND data_entrega_prevista = d::date) AS qtd
           FROM GENERATE_SERIES(CURRENT_DATE, CURRENT_DATE + 13, INTERVAL '1 day') AS d
          ORDER BY d`),
      consultaCliente(req,
        `SELECT f.id, f.numero_pedido, f.numero_nf, f.numero_cte, f.chave_nfe, f.chave_cte, f.cliente, f.cidade, f.uf,
                COALESCE(f.transportadora_cte, f.transportadora) AS transportadora,
                (SELECT t.url_rastreamento FROM transportadoras t
                   WHERE LOWER(TRIM(t.razao_social)) = LOWER(TRIM(COALESCE(f.transportadora_cte, f.transportadora)))
                   LIMIT 1) AS url_rastreamento,
                f.data_coleta, f.data_emissao_cte, f.prazo_dias_tabela, f.data_entrega_prevista,
                f.rastreio_ultima_ocorrencia, f.rastreio_ultima_em, f.rastreio_problema, f.rastreio_entrega_agendada,
                f.rastreio_consultado_em,
                EXISTS (SELECT 1 FROM transportadoras t WHERE t.rastreamento_ssw
                  AND ((LENGTH(REGEXP_REPLACE(COALESCE(t.cnpj, ''), '[^0-9]', '', 'g')) = 14
                        AND LEFT(REGEXP_REPLACE(t.cnpj, '[^0-9]', '', 'g'), 8) = LEFT(REGEXP_REPLACE(COALESCE(f.transportadora_cnpj_cte, ''), '[^0-9]', '', 'g'), 8))
                    OR LOWER(TRIM(t.razao_social)) = LOWER(TRIM(COALESCE(f.transportadora_cte, f.transportadora))))) AS rastreio_ssw,
                (f.data_entrega_prevista - CURRENT_DATE)::int AS dias,
                COALESCE(cn.quantidade, 0)::int AS nf_copias
           FROM fretes f
           LEFT JOIN copias_nf cn ON cn.numero_nf = f.numero_nf
          WHERE f.data_entrega IS NULL AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND f.nf_retornou IS NOT TRUE AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')
            AND f.data_entrega_prevista <= CURRENT_DATE + 7
          ORDER BY f.data_entrega_prevista, f.transportadora_cte NULLS LAST, f.numero_nf
          LIMIT 500`),
      consultaCliente(req,
        `SELECT COUNT(*) FILTER (WHERE sla_status = 'No Prazo')::int AS no_prazo, COUNT(sla_status)::int AS total
           FROM fretes WHERE data_entrega >= DATE_TRUNC('month', CURRENT_DATE)`),
    ]);
    res.json({ resumo: { ...resumo[0], sla_mes: slaMes[0] }, por_transportadora: porTransp, por_dia: porDia, lista });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório de entregas previstas.' });
  }
});

// POST /api/fretes/rastreio-ssw/iniciar  { transportadora? }
// Busca na SSW as entregas das notas em aberto (roda em segundo plano).
router.post('/rastreio-ssw/iniciar', autenticar, permitirAlguma('pode_editar_registros', 'pode_ver_relatorios'), async (req, res) => {
  try {
    const r = await require('../rastreioSsw').iniciar({ transportadora: req.body?.transportadora || null });
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'rastreio_ssw',
      detalhes: `Iniciou a busca de entregas na SSW (${r.total} nota(s)${req.body?.transportadora ? `, ${req.body.transportadora}` : ''})` });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao iniciar a busca na SSW. Detalhe técnico: ${err.message}` });
  }
});

// POST /api/fretes/rastreio/refazer-entregas  { confirmar?: true }
// Datas de entrega que vieram da busca automática (SSW/portal) e podem ter sido
// preenchidas por regras antigas: apaga e busca de novo com as regras atuais.
// Nunca mexe em data lançada à mão (tela, "Entregue", comprovante de entrega).
const REFAZER_WHERE = `
  data_entrega IS NOT NULL AND canhoto_registrado_em IS NULL
  -- mesma janela da busca automática: fora dela a nota não seria consultada de novo
  AND COALESCE(data_emissao_cte, criado_em::date) >= CURRENT_DATE - 120
  AND COALESCE(data_entrega_origem, '') <> 'manual' AND COALESCE(data_entrega_origem, '') <> 'sefaz'
  AND (
    data_entrega_origem IN ('ssw', 'portal')
    -- antes de guardar a origem: preenchida numa nota que o rastreamento consultou
    OR (data_entrega_origem IS NULL AND rastreio_consultado_em IS NOT NULL)
    -- antes de guardar a origem: CT-e do redespacho que recebeu a entrega pela regra antiga
    OR (data_entrega_origem IS NULL AND frete_principal_id IS NOT NULL AND vinculo_cte IN ('redespacho', 'redespacho_nota')
        AND EXISTS (SELECT 1 FROM fretes p WHERE p.id = fretes.frete_principal_id AND p.rastreio_consultado_em IS NOT NULL))
  )`;
router.post('/rastreio/refazer-entregas', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  try {
    const { rows: qtd } = await pool.query(`SELECT COUNT(*)::int AS n FROM fretes WHERE ${REFAZER_WHERE}`);
    if (!req.body?.confirmar) return res.json({ previa: true, quantidade: qtd[0].n });
    const { rowCount } = await pool.query(
      `UPDATE fretes SET data_entrega = NULL, data_entrega_origem = NULL, data_entrega_final = NULL,
              rastreio_consultado_em = NULL, atualizado_em = NOW()
        WHERE ${REFAZER_WHERE}`);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'refazer_entregas_automaticas',
      detalhes: `Apagou ${rowCount} data(s) de entrega da busca automática para refazer com as regras atuais` });
    const busca = await require('../rastreioSsw').iniciar({});
    res.json({ ok: true, apagadas: rowCount, busca });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao refazer as entregas. Detalhe técnico: ${err.message}` });
  }
});

// GET /api/fretes/rastreio-ssw/status — andamento da busca.
router.get('/rastreio-ssw/status', autenticar, permitirAlguma('pode_editar_registros', 'pode_ver_relatorios'), (req, res) => {
  res.json(require('../rastreioSsw').status());
});

// GET /api/fretes/:id/ocorrencias-rastreio — histórico vindo da SSW.
router.get('/:id/ocorrencias-rastreio', autenticar, freteDoCliente(), async (req, res) => {
  try {
    const { rows: f } = await pool.query(
      `SELECT COALESCE(f.frete_principal_id, f.id) AS nota,
              (SELECT p.rastreio_dominio FROM fretes p WHERE p.id = COALESCE(f.frete_principal_id, f.id)) AS dominio
         FROM fretes f WHERE f.id = $1`, [req.params.id]);
    if (!f[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });
    const { rows } = await pool.query(
      `SELECT data_hora, cidade, ocorrencia, descricao, tipo, dominio, recebedor FROM ocorrencias_rastreio
        WHERE frete_id = $1 ORDER BY data_hora DESC NULLS LAST, id DESC`, [f[0].nota]);
    // Código SSW da transportadora do CT-e (vazio = ainda não aprendido).
    res.set('X-Dominio-Transportadora', f[0].dominio || '');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar as ocorrências.' });
  }
});

// ---------- Lançar entregas a partir de mensagens do WhatsApp ----------
// A transportadora manda a foto do comprovante num grupo com o número da NF na
// legenda. O usuário seleciona as mensagens no WhatsApp Web, copia (Ctrl+C) e
// cola aqui — cada mensagem vem com data e hora: "[14:16, 06/10/2026] Fulano: 193233".
// Também aceita o "Exportar conversa" do celular ("06/10/2026 14:16 - Fulano: 193233")
// e linhas simples ("193233 06/10/2026" ou só "193233", com a data padrão).
function lerMensagensWhatsapp(texto, dataPadraoIso) {
  const ano4 = (a) => (String(a).length === 2 ? `20${a}` : String(a));
  const iso = (d, m, a) => `${ano4(a)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const valida = (i) => { const d = new Date(`${i}T12:00:00`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === i; };
  const achados = []; let dataAtual = dataPadraoIso || null; let remetente = null;
  for (const linhaBruta of String(texto || '').split(/\r?\n/)) {
    const linha = linhaBruta.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    if (!linha) continue;
    let corpo = linha; let dataMsg = null;
    let m = linha.match(/^\[(\d{1,2}):(\d{2}),?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]\s*([^:]{1,80}):\s*(.*)$/);   // WhatsApp Web (copiar)
    if (m) { dataMsg = iso(m[3], m[4], m[5]); remetente = m[6].replace(/^~\s*/, '').trim(); corpo = m[7]; }
    else if ((m = linha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})\s*-\s*([^:]{1,80}):\s*(.*)$/))) {   // exportar conversa
      dataMsg = iso(m[1], m[2], m[3]); remetente = m[6].replace(/^~\s*/, '').trim(); corpo = m[7];
    } else if ((m = linha.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) {   // linha simples com data
      dataMsg = iso(m[1], m[2], m[3]);
    }
    if (dataMsg && valida(dataMsg)) dataAtual = dataMsg;
    // Números de 5 a 9 dígitos no texto da mensagem (sem datas, horas e telefones com +).
    const limpo = corpo.replace(/\+\d[\d\s-]{7,}/g, ' ').replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ' ').replace(/\d{1,2}:\d{2}/g, ' ');
    for (const n of limpo.match(/\b\d{5,9}\b/g) || []) achados.push({ nf: String(Number(n)), data: dataAtual, remetente, texto: corpo.slice(0, 120) });
  }
  return achados;
}

// POST /api/fretes/entregas-whatsapp/previa  { texto, data_padrao }
router.post('/entregas-whatsapp/previa', autenticar, permitirAlguma('pode_editar_registros'), async (req, res) => {
  try {
    const padrao = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data_padrao || '')) ? req.body.data_padrao : new Date().toISOString().slice(0, 10);
    const achados = lerMensagensWhatsapp(req.body?.texto, padrao);
    if (!achados.length) return res.json({ itens: [], naoEncontradas: [] });
    // Só vale número que existe como NF no sistema (descarta pedidos, telefones soltos...).
    const numeros = [...new Set(achados.map((a) => a.nf))];
    const { rows } = await consultaCliente(req,
      `SELECT f.id, LTRIM(f.numero_nf, '0') AS nf, f.numero_nf, f.cliente, f.cidade, f.uf, f.data_emissao_nf, f.data_entrega, f.data_entrega_origem,
              COALESCE(f.transportadora_cte, f.transportadora) AS transportadora, f.nf_cancelada, f.status
         FROM fretes f WHERE f.frete_principal_id IS NULL AND LTRIM(f.numero_nf, '0') = ANY($1)`, [numeros]);
    const porNf = new Map(rows.map((r) => [r.nf, r]));
    const vistos = new Set(); const itens = []; const naoEncontradas = new Set();
    for (const a of achados) {
      const f = porNf.get(a.nf);
      if (!f) { naoEncontradas.add(a.nf); continue; }
      if (vistos.has(a.nf)) continue;   // a mesma NF mais de uma vez: fica a primeira mensagem
      vistos.add(a.nf);
      const avisos = [];
      if (f.data_entrega) avisos.push(`já tem entrega em ${String(f.data_entrega instanceof Date ? f.data_entrega.toISOString() : f.data_entrega).slice(0, 10).split('-').reverse().join('/')}${f.data_entrega_origem ? ` (${f.data_entrega_origem})` : ''}`);
      if (f.nf_cancelada || f.status === 'Cancelado') avisos.push('nota cancelada');
      const emissao = f.data_emissao_nf ? new Date(f.data_emissao_nf).toISOString().slice(0, 10) : null;
      if (emissao && a.data && a.data < emissao) avisos.push('data antes da emissão da nota');
      if (a.data && a.data > new Date().toISOString().slice(0, 10)) avisos.push('data no futuro');
      itens.push({ id: f.id, numero_nf: f.numero_nf, cliente: f.cliente, cidade: f.cidade, uf: f.uf, transportadora: f.transportadora,
        data_emissao_nf: emissao, data: a.data, remetente: a.remetente, mensagem: a.texto, avisos,
        marcar: !f.data_entrega && !f.nf_cancelada && f.status !== 'Cancelado' && !(emissao && a.data && a.data < emissao) });
    }
    res.json({ itens, naoEncontradas: [...naoEncontradas] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao ler as mensagens. Detalhe técnico: ${err.message}` });
  }
});

// POST /api/fretes/entregas-whatsapp  { itens: [{ id, data }] } — lança as datas de entrega
router.post('/entregas-whatsapp', autenticar, permitirAlguma('pode_editar_registros'), async (req, res) => {
  try {
    const itens = (Array.isArray(req.body?.itens) ? req.body.itens : [])
      .filter((i) => Number(i?.id) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(i?.data || ''))).slice(0, 500);
    let lancadas = 0;
    for (const i of itens) {
      const nota = `Entrega lançada pelo comprovante enviado no WhatsApp (${i.data.split('-').reverse().join('/')}), por ${req.usuario.nome}.`;
      const r = await pool.query(
        `UPDATE fretes SET data_entrega = $2::date, data_entrega_origem = 'whatsapp', atualizado_em = NOW(),
                observacoes = CASE WHEN POSITION($3 IN COALESCE(observacoes, '')) > 0 THEN observacoes ELSE CONCAT_WS(E'\n', NULLIF(observacoes, ''), $3::text) END
          WHERE id = $1 AND frete_principal_id IS NULL`, [Number(i.id), i.data, nota]);
      lancadas += r.rowCount;
    }
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'entregas_whatsapp', detalhes: `Lançou ${lancadas} data(s) de entrega a partir de mensagens do WhatsApp` });
    res.json({ ok: true, lancadas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao lançar as entregas. Detalhe técnico: ${err.message}` });
  }
});

// ---------- Relatório: notas sem mapa de carregamento ----------
// Nota emitida há mais de N dias (configurável, padrão 3, dias corridos) e
// ainda sem número de mapa — possivelmente parada no estoque. Fora: nota
// cancelada, devolvida, de entrada, já entregue ou arquivada. Situação:
//   sem_mapa — o caso comum;  retira — FOB / sem frete (cobrar a retirada);
//   cte — já tem CT-e mas não entrou em mapa (a transportadora não coletou?).
const SEM_MAPA_WHERE = `f.frete_principal_id IS NULL AND NULLIF(TRIM(COALESCE(f.numero_mapa, '')), '') IS NULL
  AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND f.nf_retornou IS NOT TRUE AND f.nf_entrada IS NOT TRUE AND f.nf_complementar IS NOT TRUE AND f.nf_sem_circulacao IS NOT TRUE
  AND f.data_entrega IS NULL AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Arquivado')
  AND f.data_emissao_nf IS NOT NULL`;
// "Frete por conta do cliente": a MESMA regra do selo 🧾 em Todos os registros —
// venda, frete por conta do destinatário (FOB) e SEM transportadora informada.
// FOB com transportadora informada é "sem mapa" normal (há quem venha coletar).
const SITUACAO_SQL = `CASE WHEN f.chave_cte IS NOT NULL THEN 'cte' WHEN f.frete_por_conta_cliente THEN 'retira' ELSE 'sem_mapa' END`;
async function diasAlertaMapa() {
  const { rows } = await pool.query('SELECT mapa_dias_alerta FROM configuracao_auditoria WHERE id = 1');
  return Number(rows[0]?.mapa_dias_alerta) || 3;
}

// GET /api/fretes/relatorios/sem-mapa?dias=&desde=AAAA-MM-DD&situacao=&busca=
router.get('/relatorios/sem-mapa', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const diasConfig = await diasAlertaMapa();
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || diasConfig, 1), 365);
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? req.query.desde : null;
    const valores = [dias];
    let filtros = `${SEM_MAPA_WHERE} AND f.data_emissao_nf <= CURRENT_DATE - $1::int`;
    if (desde) { valores.push(desde); filtros += ` AND f.data_emissao_nf >= $${valores.length}::date`; }
    else filtros += ' AND f.data_emissao_nf >= CURRENT_DATE - 90';
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || '')) ? req.query.ate : null;
    if (ate) { valores.push(ate); filtros += ` AND f.data_emissao_nf <= $${valores.length}::date`; }
    if (['sem_mapa', 'retira', 'cte'].includes(req.query.situacao)) { valores.push(req.query.situacao); filtros += ` AND ${SITUACAO_SQL} = $${valores.length}`; }
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      valores.push(`%${busca}%`);
      filtros += ` AND (f.numero_nf ILIKE $${valores.length} OR f.numero_pedido ILIKE $${valores.length} OR f.cliente ILIKE $${valores.length})`;
    }
    const { rows } = await consultaCliente(req,
      `SELECT f.id, f.numero_nf, f.data_emissao_nf, f.numero_pedido, f.cliente, f.qtd_volumes,
              f.numero_mapa, f.mapa_descricao, f.mapa_data_referencia, f.mapa_ajudante,
              f.numero_cte, COALESCE(f.transportadora_cte, f.transportadora) AS transportadora, f.frete_cif_fob,
              (CURRENT_DATE - f.data_emissao_nf)::int AS dias_parada, ${SITUACAO_SQL} AS situacao
         FROM fretes f WHERE ${filtros}
        ORDER BY f.data_emissao_nf ASC, f.numero_nf LIMIT 3000`, valores);
    const resumo = { total: rows.length, sem_mapa: 0, retira: 0, cte: 0, volumes: 0 };
    rows.forEach((r) => { resumo[r.situacao] += 1; resumo.volumes += Number(r.qtd_volumes) || 0; });
    res.json({ dias, diasConfig, resumo, notas: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao montar o relatório. Detalhe técnico: ${err.message}` });
  }
});

// PUT /api/fretes/relatorios/sem-mapa/config  { dias } — prazo do alerta (sino e Visão geral)
router.put('/relatorios/sem-mapa/config', autenticar, permitirAlguma('pode_editar_registros', 'pode_ver_relatorios'), async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.body?.dias, 10) || 3, 1), 60);
    await pool.query('INSERT INTO configuracao_auditoria (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    await pool.query('UPDATE configuracao_auditoria SET mapa_dias_alerta = $1 WHERE id = 1', [dias]);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'config_alerta_sem_mapa', detalhes: `Alerta de nota sem mapa: ${dias} dia(s)` });
    res.json({ ok: true, dias });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar o prazo.' });
  }
});

// ---------- Relatório: melhor transportadora para cada nota ----------
// Para cada nota que ainda não saiu (sem CT-e, sem entrega), calcula pela
// tabela de preço o frete de TODAS as transportadoras que atendem a cidade,
// com o prazo e o % de entregas no prazo de cada uma, e sugere a melhor pelo
// critério escolhido. Com "já embarcadas", compara com o CT-e real (economia
// que teria havido). FOB / cliente retira fica fora (quem escolhe é o cliente).
const normTransp = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Contexto de destino compartilhado pelos relatórios "Melhor transportadora" e
// "Juntar notas": trechos de todas as tabelas, agrupados por transportadora, e a
// regra de ATÉ ONDE a transportadora leva (redespacho, local de entrega, cliente)
// — a mesma da Auditoria. Uma correção aqui vale para os dois relatórios.
async function contextoDestinos() {
  const calc = require('../calculoFrete');
    // Trechos de todas as tabelas ativas, agrupados por transportadora.
    const porTransportadora = {};
    const todosTrechos = await calc.buscarTodosTrechosAtivos();
    todosTrechos.forEach((t) => { (porTransportadora[t.transportadora_nome] = porTransportadora[t.transportadora_nome] || []).push(t); });

    // Até onde a transportadora leva (a mesma regra da Auditoria): nota com
    // redespacho -> cidade do redespacho; "LOCAL DE ENTREGA" (ou outra cidade
    // das tabelas) nas informações da nota -> essa cidade; senão, a do cliente.
    // Busca por palavra inteira e nome mais longo primeiro ("São José dos
    // Campos" antes de "São José").
    const municipios = await calc.municipiosConhecidos();   // só municípios de verdade (não bairros como "CENTRO")
    const bairrosMapa = await calc.bairrosConhecidos();
    const municipiosUf = await calc.municipiosComUf();      // município -> UFs (prefere cidade do mesmo estado do cliente)     // e não vale o bairro do próprio cliente ("CAMPO GRANDE" no Rio)
    const cidadesTabelas = [...new Set(todosTrechos.flatMap((t) => String(t.cidades || '').split(',').map((c) => c.trim()).filter(Boolean)))]
      .map((c) => ({ c, n: ` ${calc.normalizarCidade(c).replace(/[^a-z0-9]+/g, ' ').trim()} ` }))
      .filter((x) => x.n.trim().length >= 3 && municipios.has(x.n.trim()))
      .sort((a, b) => b.n.length - a.n.length);
    const acharCidade = (texto) => {
      if (!texto) return null;
      const t = ` ${calc.normalizarCidade(texto).replace(/[^a-z0-9]+/g, ' ')} `;
      return (cidadesTabelas.find((x) => t.includes(x.n)) || {}).c || null;
    };
    const ufNoTexto = (txt) => { const m = String(txt || '').toUpperCase().match(/[\s\/-](AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?:[\s.,;)]|$)/); return m ? m[1] : null; };
    const redespachoPorCnpj = await require('../transportadorasRedespacho').cidadesPorCnpj();
    const destinoDa = (n) => {
      // Redespacho com CNPJ cadastrado: a cidade/UF vem do cadastro da transportadora.
      const doCadastro = n.redespacho && n.redespacho_cnpj ? require('../transportadorasRedespacho').cidadeDoCnpj(redespachoPorCnpj, n.redespacho_cnpj) : null;
      if (doCadastro) return { cidade: doCadastro.municipio, uf: doCadastro.uf, tipo: 'redespacho', detalhe: `${doCadastro.nome} (cadastro, ${doCadastro.municipio}/${doCadastro.uf})` };
      if (n.redespacho) {
        const gravada = n.cidade_redespacho ? calc.municipioNoTexto(n.cidade_redespacho, municipios) : null;
        const valeGravada = gravada && municipios.has(calc.normalizarCidade(gravada).replace(/[^a-z0-9]+/g, ' ').trim());
        const c = (valeGravada ? gravada : null) || calc.cidadeDoRedespachoNoTexto(n.observacoes, municipios) || gravada || acharCidade(n.redespacho);
        return { cidade: c, uf: ufNoTexto(n.redespacho), tipo: 'redespacho', detalhe: String(n.redespacho).split(/\s+CNPJ|\s+-\s+/i)[0].slice(0, 60) };
      }
      // Mesma regra da Auditoria: só "LOCAL DE ENTREGA" / "ENTREGAR EM" / "ENDEREÇO DE ENTREGA", ou cidade escrita com a UF.
      const citada = calc.citacaoValida(calc.cidadeDeEntregaNaNota(todosTrechos, n.observacoes, municipios, { ufs: municipiosUf, ufCliente: n.uf }),
        { cidade: n.cidade, bairro: n.bairro, uf: n.uf }, bairrosMapa);
      if (citada && calc.normalizarCidade(citada.cidade) !== calc.normalizarCidade(n.cidade || '')) {
        return { cidade: citada.cidade, uf: citada.uf, tipo: citada.trechoTexto ? 'local' : 'observacoes', detalhe: citada.trechoTexto };
      }
      return { cidade: n.cidade, uf: n.uf, tipo: 'cliente', detalhe: null };
    };
  // UF de onde as cargas saem (ICMS pela rota): a da empresa; sem cadastro, RJ (o que valia antes).
  const { rows: emp } = await pool.query('SELECT uf FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
  const ufOrigem = String(emp[0]?.uf || '').trim().toUpperCase() || 'RJ';
  return { calc, todosTrechos, porTransportadora, destinoDa, ufOrigem };
}

// GET /api/fretes/relatorios/melhor-transportadora?criterio=barata|rapida|prazo&prazo_max=&desde=&busca=&embarcadas=1
const LIMITE_MT = 2000;   // notas por consulta (as mais recentes); o total do período vai junto
router.get('/relatorios/melhor-transportadora', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const calc = require('../calculoFrete');
    const criterio = ['barata', 'rapida', 'prazo'].includes(req.query.criterio) ? req.query.criterio : 'barata';
    const prazoMax = parseInt(req.query.prazo_max, 10) || null;
    const embarcadas = req.query.embarcadas === '1';
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? req.query.desde : null;
    const valores = [];
    let filtros = `f.frete_principal_id IS NULL AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND f.nf_retornou IS NOT TRUE
      AND f.nf_entrada IS NOT TRUE AND f.nf_complementar IS NOT TRUE AND f.nf_sem_circulacao IS NOT TRUE AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Arquivado')
      AND COALESCE(f.frete_cif_fob, '') NOT IN ('FOB', 'Destinatário', 'Destinatario', 'Sem frete', 'Próprio destinatário')
      AND NULLIF(TRIM(COALESCE(f.cidade, '')), '') IS NOT NULL`;
    filtros += embarcadas ? ' AND f.chave_cte IS NOT NULL AND NOT f.cte_cancelado' : ' AND f.chave_cte IS NULL AND f.data_entrega IS NULL';
    if (desde) { valores.push(desde); filtros += ` AND COALESCE(f.data_emissao_nf, f.criado_em::date) >= $${valores.length}::date`; }
    else filtros += ` AND COALESCE(f.data_emissao_nf, f.criado_em::date) >= CURRENT_DATE - ${embarcadas ? 30 : 60}`;
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      valores.push(`%${busca}%`);
      filtros += ` AND (f.numero_nf ILIKE $${valores.length} OR f.numero_pedido ILIKE $${valores.length} OR f.cliente ILIKE $${valores.length} OR f.cidade ILIKE $${valores.length})`;
    }
    const { rows: notas } = await consultaCliente(req,
      `SELECT f.id, f.numero_nf, f.numero_pedido, f.data_emissao_nf, f.cliente, f.cliente_documento, f.cidade, f.bairro, f.uf,
              f.qtd_volumes, f.peso_kg, f.cubagem_m3, f.valor_faturado, f.transportadora AS transportadora_nf,
              f.transportadora_cte, f.numero_cte, f.valor_total_cte, f.redespacho, f.cidade_redespacho, f.redespacho_cnpj, f.observacoes
         FROM fretes f WHERE ${filtros}
        ORDER BY f.data_emissao_nf DESC NULLS LAST, f.numero_nf DESC LIMIT ${LIMITE_MT}`, valores);
    // Quantas notas o período tem de verdade (a tela avisa quando passa do limite).
    const { rows: [{ total: totalPeriodo }] } = await consultaCliente(req, `SELECT COUNT(*)::int AS total FROM fretes f WHERE ${filtros}`, valores);

    // % de entregas no prazo (últimos 180 dias), por transportadora e por transportadora + UF.
    const { rows: hist } = await pool.query(
      `SELECT COALESCE(transportadora_cte, transportadora) AS t, uf,
              COUNT(*)::int AS total, COUNT(*) FILTER (WHERE data_entrega <= data_entrega_prevista)::int AS no_prazo
         FROM fretes
        WHERE frete_principal_id IS NULL AND data_entrega IS NOT NULL AND data_entrega_prevista IS NOT NULL
          AND data_entrega >= CURRENT_DATE - 180
        GROUP BY 1, 2`);
    const pontual = {};
    hist.forEach((h) => {
      const k = normTransp(h.t);
      pontual[k] = pontual[k] || { total: 0, no_prazo: 0, uf: {} };
      pontual[k].total += h.total; pontual[k].no_prazo += h.no_prazo;
      pontual[k].uf[h.uf || ''] = { total: h.total, no_prazo: h.no_prazo };
    });
    const pctNoPrazo = (nome, uf) => {
      const p = pontual[normTransp(nome)];
      if (!p) return null;
      const porUf = p.uf[uf || ''];
      const base = porUf && porUf.total >= 5 ? porUf : p;   // por UF só com amostra mínima
      return base.total ? { pct: Math.round((100 * base.no_prazo) / base.total), entregas: base.total, porUf: base === porUf } : null;
    };

    const { porTransportadora, destinoDa, ufOrigem } = await contextoDestinos();
    let economiaTotal = 0; let comSugestaoDiferente = 0; let semOpcao = 0; let comEconomia = 0;
    const semTabelaPorCidade = new Map();   // cidades sem nenhuma tabela: onde vale negociar
    const resultado = notas.map((n) => {
      const destino = destinoDa(n);
      const alvo = destino.tipo === 'cliente' ? { cidade: n.cidade, bairro: n.bairro, uf: n.uf } : { cidade: destino.cidade, bairro: null, uf: destino.uf };
      const opcoes = [];
      for (const [nome, trechos] of Object.entries(porTransportadora)) {
        // Trecho de outro estado não vale (uma tabela só de SP não atende entrega no RJ).
        const trecho = alvo.cidade ? calc.escolherTrechoDoDestino(trechos, alvo) : null;
        if (!trecho) continue;
        const { freteBase } = calc.calcularFreteBase(trecho, { qtdVolumes: n.qtd_volumes, pesoKg: n.peso_kg, cubagemM3: n.cubagem_m3 });
        const comp = calc.calcularComponentesEValorTotal(trecho, freteBase, {
          valorFaturado: n.valor_faturado, pesoKg: n.peso_kg, qtdVolumes: n.qtd_volumes,
          cliente: n.cliente, clienteCnpj: n.cliente_documento, ufIni: ufOrigem, ufFim: alvo.uf || n.uf,
        });
        if (!Number.isFinite(comp.total) || comp.total <= 0) continue;
        opcoes.push({ transportadora: nome, tabela: trecho.tabela_nome, valor: Math.round(comp.total * 100) / 100,
          prazo: trecho.prazo_dias ?? trecho.tabela_prazo_dias ?? null, pontualidade: pctNoPrazo(nome, n.uf) });
      }
      opcoes.sort((a, b) => a.valor - b.valor);
      const atualNome = n.transportadora_cte || n.transportadora_nf || null;
      const atualOpcao = opcoes.find((o) => normTransp(o.transportadora) === normTransp(atualNome)) || null;
      const valorAtual = embarcadas && n.valor_total_cte != null ? Number(n.valor_total_cte) : (atualOpcao ? atualOpcao.valor : null);
      let sugerida = null;
      if (opcoes.length) {
        if (criterio === 'rapida') sugerida = [...opcoes].sort((a, b) => (a.prazo ?? 999) - (b.prazo ?? 999) || a.valor - b.valor)[0];
        else if (criterio === 'prazo') {
          const limite = prazoMax || atualOpcao?.prazo || null;
          sugerida = (limite ? opcoes.filter((o) => o.prazo != null && o.prazo <= limite) : opcoes)[0] || opcoes[0];
        } else sugerida = opcoes[0];
      } else {
        semOpcao += 1;
        const k = `${destino.cidade || n.cidade || '—'}/${alvo.uf || n.uf || ''}`;
        semTabelaPorCidade.set(k, (semTabelaPorCidade.get(k) || 0) + 1);
      }
      const diferente = sugerida && atualNome && normTransp(sugerida.transportadora) !== normTransp(atualNome);
      const economia = sugerida && valorAtual != null && diferente ? Math.max(0, Math.round((valorAtual - sugerida.valor) * 100) / 100) : 0;
      if (diferente) comSugestaoDiferente += 1;
      if (economia > 0) comEconomia += 1;
      economiaTotal += economia;
      const { observacoes, ...semObs } = n;
      return { ...semObs, destino, transportadora_atual: atualNome, valor_atual: valorAtual, atual_na_tabela: !!atualOpcao, sugerida, economia,
        mesma_transportadora: !!(sugerida && atualNome && !diferente), opcoes };
    });
    const cidadesSemTabela = [...semTabelaPorCidade.entries()].map(([cidade, notas]) => ({ cidade, notas })).sort((a, b) => b.notas - a.notas).slice(0, 20);
    res.json({ criterio, embarcadas, resumo: { notas: resultado.length, totalPeriodo, limite: LIMITE_MT, comSugestaoDiferente, comEconomia, semOpcao, cidadesSemTabela,
      economiaTotal: Math.round(economiaTotal * 100) / 100 }, notas: resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao montar o relatório. Detalhe técnico: ${err.message}` });
  }
});

// "Juntar notas" por DESTINO: notas (de um ou vários clientes) que vão para a
// mesma cidade de entrega ou o mesmo redespacho, emitidas dentro da janela —
// fisicamente a mesma viagem. Compara: cada nota com a sua transportadora (ou a
// mais barata para ela) x tudo como UMA carga pela transportadora mais barata.
// Um cliente só = cabe num CT-e comum; vários clientes = negociar carga
// consolidada (ou CT-e globalizado, se a transportadora emitir e couber).
function consolidarPorDestino({ notas, calc, porTransportadora, destinoDa, freteDe, cargaDe, norm, janela, embarcadas }) {
  const grupos = new Map();
  for (const n of notas) {
    const destino = destinoDa(n);
    if (!destino.cidade) continue;
    const chave = destino.tipo === 'redespacho'
      ? `R|${n.redespacho_cnpj || norm(destino.detalhe || n.redespacho)}|${norm(destino.cidade)}`
      : `C|${norm(destino.cidade)}|${destino.uf || n.uf || ''}`;
    if (!grupos.has(chave)) grupos.set(chave, { destino, notas: [] });
    n._destino = destino;
    grupos.get(chave).notas.push(n);
  }
  const alvoDe = (n, destino) => (destino.tipo === 'cliente' ? { cidade: n.cidade, bairro: n.bairro, uf: n.uf } : { cidade: destino.cidade, bairro: null, uf: destino.uf });
  const sugestoes = []; let semTabela = 0;
  const avaliar = (destino, b) => {
    // Separado: cada nota com a transportadora dela (ou, sem transportadora, a mais barata para ela) — ou o CT-e pago, se já saiu.
    const separadas = b.map((n) => {
      if (embarcadas) return Number(n.valor_total_cte) || null;
      let melhor = null;
      for (const [nome, trechos] of Object.entries(porTransportadora)) {
        if (n.transportadora_nf && normTransp(nome) !== normTransp(n.transportadora_nf)) continue;
        const trecho = calc.escolherTrechoDoDestino(trechos, alvoDe(n, destino));
        if (!trecho) continue;
        const v = freteDe(trecho, cargaDe([n]), n, destino);
        if (v != null && (!melhor || v < melhor)) melhor = v;
      }
      return melhor;
    });
    if (separadas.some((v) => v == null)) { semTabela += 1; return; }
    // Junto: tudo como UMA carga, pela transportadora mais barata que atende esse destino.
    const n0 = b[0];
    let junto = null;
    for (const [nome, trechos] of Object.entries(porTransportadora)) {
      const trecho = calc.escolherTrechoDoDestino(trechos, alvoDe(n0, destino));
      if (!trecho) continue;
      const v = freteDe(trecho, cargaDe(b), n0, destino);
      if (v != null && (!junto || v < junto.valor)) junto = { valor: v, transportadora: nome, tabela: trecho.tabela_nome };
    }
    if (!junto) { semTabela += 1; return; }
    const separado = Math.round(separadas.reduce((a, v) => a + v, 0) * 100) / 100;
    const economia = Math.round((separado - junto.valor) * 100) / 100;
    if (economia <= 0) return;
    const porCliente = new Map();
    b.forEach((n, i) => {
      const k = n.cliente_documento || n.cliente;
      if (!porCliente.has(k)) porCliente.set(k, { cliente: n.cliente, cliente_documento: n.cliente_documento, notas: [] });
      porCliente.get(k).notas.push({ id: n.id, numero_nf: n.numero_nf, numero_pedido: n.numero_pedido, data_emissao_nf: n.data_emissao_nf,
        qtd_volumes: n.qtd_volumes, peso_kg: n.peso_kg, cubagem_m3: n.cubagem_m3, valor_faturado: n.valor_faturado, transportadora_nf: n.transportadora_nf,
        frete: separadas[i], numero_cte: n.numero_cte || null });
    });
    const carga = cargaDe(b);
    const clientes = [...porCliente.values()];
    sugestoes.push({
      destino, tipo: destino.tipo === 'redespacho' ? 'redespacho' : 'cidade', clientes,
      um_cliente: clientes.length === 1, qtd_notas: b.length,
      transportadora: junto.transportadora, tabela: junto.tabela,
      volumes: carga.vol, peso: Math.round(carga.peso * 1000) / 1000, valor: Math.round(carga.valor * 100) / 100,
      separado, junto: junto.valor, economia,
    });
  };
  for (const { destino, notas: lista } of grupos.values()) {
    if (lista.length < 2) continue;
    let bloco = [];
    const fechar = () => { if (bloco.length >= 2) avaliar(destino, bloco); bloco = []; };
    for (const n of lista) {
      if (bloco.length && (new Date(n.data_ref) - new Date(bloco[0].data_ref)) / 86400000 > janela) fechar();
      bloco.push(n);
    }
    fechar();
  }
  sugestoes.sort((a, b) => b.economia - a.economia);
  return {
    resumo: { grupos: sugestoes.length, notas: sugestoes.reduce((a, g) => a + g.qtd_notas, 0),
      economiaTotal: Math.round(sugestoes.reduce((a, g) => a + g.economia, 0) * 100) / 100, semTabela,
      umCliente: sugestoes.filter((g) => g.um_cliente).length, variosClientes: sugestoes.filter((g) => !g.um_cliente).length },
    grupos: sugestoes,
  };
}

// ---------- Veículo indicado para cada carga (relatório "Juntar notas") ----------
// Capacidades típicas de mercado; cada empresa ajusta na tela (⚙ Veículos).
const VEICULOS_PADRAO = [
  { nome: 'Utilitário (Fiorino/Kangoo)', kg: 650, m3: 3 },
  { nome: 'VUC / Bongo / HR', kg: 1500, m3: 10 },
  { nome: '3/4', kg: 4000, m3: 22 },
  { nome: 'Toco', kg: 6000, m3: 35 },
  { nome: 'Truck', kg: 12000, m3: 48 },
  { nome: 'Carreta', kg: 27000, m3: 90 },
];
async function veiculosConfigurados() {
  const { rows } = await pool.query('SELECT veiculos_capacidade FROM configuracao_auditoria WHERE id = 1').catch(() => ({ rows: [] }));
  const lista = Array.isArray(rows[0]?.veiculos_capacidade) ? rows[0].veiculos_capacidade : null;
  const validos = (lista || []).filter((v) => v && v.nome && Number(v.kg) > 0).map((v) => ({ nome: String(v.nome).slice(0, 60), kg: Number(v.kg), m3: Number(v.m3) || null }));
  return (validos.length ? validos : VEICULOS_PADRAO).sort((a, b) => a.kg - b.kg);
}
// O menor veículo que comporta o PESO e o VOLUME (se o m³ for conhecido). Passou da
// maior capacidade: quantos do maior são necessários.
function veiculoIndicado(veiculos, pesoKg, m3, m3Completo) {
  const usaM3 = m3Completo && m3 > 0;
  const cabe = veiculos.find((v) => pesoKg <= v.kg && (!usaM3 || !v.m3 || m3 <= v.m3));
  const ocup = (v) => ({ pesoPct: Math.round((100 * pesoKg) / v.kg), m3Pct: usaM3 && v.m3 ? Math.round((100 * m3) / v.m3) : null });
  if (cabe) return { nome: cabe.nome, quantidade: 1, ...ocup(cabe), porPeso: !usaM3 };
  const maior = veiculos[veiculos.length - 1];
  const qtd = Math.max(Math.ceil(pesoKg / maior.kg), usaM3 && maior.m3 ? Math.ceil(m3 / maior.m3) : 1);
  return { nome: maior.nome, quantidade: qtd, pesoPct: Math.round((100 * pesoKg) / (maior.kg * qtd)),
    m3Pct: usaM3 && maior.m3 ? Math.round((100 * m3) / (maior.m3 * qtd)) : null, porPeso: !usaM3 };
}
// Acrescenta peso, m³ e veículo a cada grupo do relatório.
function completarCarga(grupos, veiculos) {
  grupos.forEach((g) => {
    const notas = g.notas || (g.clientes || []).flatMap((c) => c.notas);
    const cub = notas.reduce((a, n) => a + (Number(n.cubagem_m3) || 0), 0);
    const semCub = notas.filter((n) => !(Number(n.cubagem_m3) > 0)).length;
    g.cubagem = Math.round(cub * 1000) / 1000;
    g.notas_sem_cubagem = semCub;
    g.veiculo = veiculoIndicado(veiculos, Number(g.peso) || 0, cub, semCub === 0);
  });
}

// GET /api/fretes/relatorios/consolidacao/veiculos — capacidades em uso
router.get('/relatorios/consolidacao/veiculos', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  res.json({ veiculos: await veiculosConfigurados(), padrao: VEICULOS_PADRAO });
});
// PUT /api/fretes/relatorios/consolidacao/veiculos  { veiculos: [{nome, kg, m3}] }  (lista vazia = volta ao padrão)
router.put('/relatorios/consolidacao/veiculos', autenticar, permitirAlguma('pode_editar_registros', 'pode_ver_relatorios'), async (req, res) => {
  try {
    const lista = (Array.isArray(req.body?.veiculos) ? req.body.veiculos : [])
      .filter((v) => v && String(v.nome || '').trim() && Number(v.kg) > 0)
      .map((v) => ({ nome: String(v.nome).trim().slice(0, 60), kg: Math.round(Number(v.kg)), m3: Number(v.m3) > 0 ? Math.round(Number(v.m3) * 10) / 10 : null }))
      .slice(0, 15);
    await pool.query('INSERT INTO configuracao_auditoria (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    await pool.query('UPDATE configuracao_auditoria SET veiculos_capacidade = $1 WHERE id = 1', [lista.length ? JSON.stringify(lista) : null]);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'config_veiculos', detalhes: lista.length ? `Capacidades dos veículos: ${lista.map((v) => v.nome).join(', ')}` : 'Capacidades dos veículos: voltou ao padrão' });
    res.json({ ok: true, veiculos: await veiculosConfigurados() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar as capacidades.' });
  }
});

// ---------- Consolidar rotas: pedidos liberados, ANTES da nota fiscal ----------
// Fonte: a planilha do ERP (pedidos ainda sem NF). Agrupa pelo destino: a cidade
// do cliente, ou a do REDESPACHO quando o pedido tem redespacho. A tela deixa
// marcar os pedidos e vai somando peso, m³ e o caminhão indicado.
// GET /api/fretes/relatorios/consolidar-rotas?desde=&ate=&busca=&faturados=1
router.get('/relatorios/consolidar-rotas', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const calc = require('../calculoFrete');
    const valores = [];
    // Pedido liberado e ainda sem nota (opcional: também os já faturados que ainda não saíram).
    let filtros = `f.frete_principal_id IS NULL AND NULLIF(TRIM(COALESCE(f.numero_pedido, '')), '') IS NOT NULL
      AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Arquivado')
      AND COALESCE(f.frete_cif_fob, '') NOT IN ('FOB', 'Destinatário', 'Destinatario', 'Sem frete', 'Próprio destinatário')
      AND f.frete_por_conta_cliente IS NOT TRUE AND f.data_entrega IS NULL`;
    filtros += req.query.faturados === '1'
      ? ' AND f.chave_cte IS NULL AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE'
      : " AND NULLIF(TRIM(COALESCE(f.numero_nf, '')), '') IS NULL AND f.chave_nfe IS NULL";
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? req.query.desde : null;
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || '')) ? req.query.ate : null;
    if (desde) { valores.push(desde); filtros += ` AND COALESCE(f.data_pedido, f.criado_em::date) >= $${valores.length}::date`; }
    else filtros += ' AND COALESCE(f.data_pedido, f.criado_em::date) >= CURRENT_DATE - 30';
    if (ate) { valores.push(ate); filtros += ` AND COALESCE(f.data_pedido, f.criado_em::date) <= $${valores.length}::date`; }
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      valores.push(`%${busca}%`);
      filtros += ` AND (f.numero_pedido ILIKE $${valores.length} OR f.pedido_mercus ILIKE $${valores.length} OR f.cliente ILIKE $${valores.length}
        OR f.cidade ILIKE $${valores.length} OR f.redespacho ILIKE $${valores.length} OR f.cidade_redespacho ILIKE $${valores.length})`;
    }
    const { rows } = await consultaCliente(req,
      `SELECT f.id, f.numero_pedido, f.pedido_mercus, f.cliente, f.data_pedido, f.transportadora, f.redespacho, f.cidade_redespacho,
              f.cidade, f.bairro, f.uf, f.qtd_volumes, f.peso_kg, f.cubagem_m3, f.valor_faturado, f.numero_nf, f.itens_sem_medida, f.observacoes
         FROM fretes f WHERE ${filtros}
        ORDER BY f.data_pedido NULLS LAST, f.numero_pedido LIMIT 3000`, valores);
    // Pedidos da planilha que ainda NÃO viraram registro (sem nota: ficam na lista de
    // espera até o XML da NF-e chegar) — são justamente os que importam aqui.
    const { rows: espera } = await pool.query(
      `SELECT p.numero_pedido, p.numero_nf, p.dados, p.recebido_em FROM erp_pendentes p
        WHERE NOT EXISTS (SELECT 1 FROM fretes f WHERE f.frete_principal_id IS NULL AND f.numero_pedido = p.numero_pedido)`).catch(() => ({ rows: [] }));
    const FOB = ['FOB', 'Destinatário', 'Destinatario', 'Sem frete', 'Próprio destinatário'];
    const buscaN = busca.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const hoje = new Date();
    const desdeEf = desde || new Date(hoje.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    for (const e of espera) {
      const d = e.dados || {};
      if (d._estatus_pedido === 'C' || String(d.cidade || '').trim().toUpperCase() === 'EXTERIOR') continue;
      if (FOB.includes(String(d.frete_cif_fob || ''))) continue;
      const temNf = !!(e.numero_nf || d.numero_nf);
      if (temNf && req.query.faturados !== '1') continue;
      if (d._nf_cancelada === 'S') continue;
      const dataRef = d.data_pedido || (e.recebido_em ? new Date(e.recebido_em).toISOString().slice(0, 10) : null);
      if (dataRef && (dataRef < desdeEf || (ate && dataRef > ate))) continue;
      if (buscaN) {
        const alvo = [e.numero_pedido, d.pedido_mercus, d.cliente, d.cidade, d.redespacho, d.cidade_redespacho].join(' ')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        if (!alvo.includes(buscaN)) continue;
      }
      rows.push({ id: `E${e.numero_pedido}`, numero_pedido: e.numero_pedido, pedido_mercus: d.pedido_mercus, cliente: d.cliente, data_pedido: dataRef,
        transportadora: d.transportadora, redespacho: d.redespacho, cidade_redespacho: d.cidade_redespacho, cidade: d.cidade, bairro: d.bairro, uf: d.uf,
        qtd_volumes: d.qtd_volumes, peso_kg: d.peso_kg, cubagem_m3: d.cubagem_m3, valor_faturado: d.valor_faturado, numero_nf: e.numero_nf || d.numero_nf || null,
        itens_sem_medida: d.itens_sem_medida, observacoes: d.observacoes });
    }
    const municipios = await calc.municipiosConhecidos().catch(() => null);
    const municipiosUf = await calc.municipiosComUf().catch(() => null);
    const bairrosMapa = await calc.bairrosConhecidos().catch(() => null);
    const norm = (t) => calc.normalizarCidade(t || '').replace(/[^a-z0-9]+/g, ' ').trim();
    const grupos = new Map();
    for (const p of rows) {
      let chave; let destino;
      // "Endereço de entrega / Local de entrega ..." na observação do pedido: vale essa cidade (como na Auditoria).
      const citada = !NULLIF_texto(p.redespacho) && p.observacoes
        ? calc.citacaoValida(calc.cidadeDeEntregaNaNota([], p.observacoes, municipios, { ufs: municipiosUf, ufCliente: p.uf }),
          { cidade: p.cidade, bairro: p.bairro, uf: p.uf }, bairrosMapa)
        : null;
      if (citada && norm(citada.cidade) !== norm(p.cidade)) {
        destino = { tipo: 'cidade', cidade: citada.cidade, uf: citada.uf || null, entregaEm: true };
        chave = `C|${norm(citada.cidade)}|${String(citada.uf || '').toUpperCase()}`;
        p._entregaEm = `${citada.cidade}${citada.uf ? `/${citada.uf}` : ''}`;
      } else if (NULLIF_texto(p.redespacho)) {
        const cidadeRed = p.cidade_redespacho ? calc.municipioNoTexto(p.cidade_redespacho, municipios) : null;
        destino = { tipo: 'redespacho', cidade: cidadeRed || null, uf: null, redespacho: String(p.redespacho).replace(/\s*CNPJ[\s\S]*$/i, '').trim() };
        chave = `R|${norm(destino.redespacho)}|${norm(destino.cidade)}`;
      } else {
        destino = { tipo: 'cidade', cidade: p.cidade || null, uf: p.uf || null };
        chave = `C|${norm(p.cidade)}|${String(p.uf || '').toUpperCase()}`;
      }
      if (!grupos.has(chave)) grupos.set(chave, { destino, pedidos: [] });
      grupos.get(chave).pedidos.push({
        id: p.id, pedido: p.numero_pedido, mercus: p.pedido_mercus, cliente: p.cliente, data_liberacao: p.data_pedido,
        transportadora: p.transportadora, redespacho: p.redespacho, cidade: p.cidade, bairro: p.bairro, uf: p.uf,
        volumes: Number(p.qtd_volumes) || 0, peso: Number(p.peso_kg) || 0, cubagem: p.cubagem_m3 != null ? Number(p.cubagem_m3) : null,
        valor: p.valor_faturado != null ? Number(p.valor_faturado) : null, numero_nf: p.numero_nf || null,
        itens_sem_medida: Number(p.itens_sem_medida) > 0 ? Math.round(Number(p.itens_sem_medida)) : 0,
        entrega_em: p._entregaEm || null,
      });
    }
    const lista = [...grupos.values()].map((g) => {
      const peso = g.pedidos.reduce((a, x) => a + x.peso, 0);
      return { ...g, qtd: g.pedidos.length, volumes: g.pedidos.reduce((a, x) => a + x.volumes, 0),
        peso: Math.round(peso * 1000) / 1000, cubagem: Math.round(g.pedidos.reduce((a, x) => a + (x.cubagem || 0), 0) * 1000) / 1000,
        sem_cubagem: g.pedidos.filter((x) => !(x.cubagem > 0)).length };
    }).sort((a, b) => b.peso - a.peso);
    res.json({ veiculos: await veiculosConfigurados(), grupos: lista,
      resumo: { destinos: lista.length, pedidos: rows.length, peso: Math.round(lista.reduce((a, g) => a + g.peso, 0) * 1000) / 1000 } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao montar as rotas. Detalhe técnico: ${err.message}` });
  }
});
const NULLIF_texto = (t) => (String(t || '').trim() ? String(t).trim() : null);

// ---------- Relatório: juntar notas para economizar frete (consolidação) ----------
// Notas que podem ir num ÚNICO CT-e, respeitando a legislação: mesmo remetente
// (a empresa), mesmo DESTINATÁRIO (CNPJ exato — filial diferente não), mesmo
// tomador (só CIF: frete pago pela empresa), mesma origem/destino (mesma cidade
// de entrega e, havendo, mesmo redespacho) e mesma transportadora. Emitidas
// dentro de uma janela de dias. Compara o frete de um CT-e por nota com o de
// um CT-e só (somando volumes, peso e valor) pela tabela de preço.
// O sistema só SUGERE: cada NF-e continua independente; quem junta é a expedição
// combinando com a transportadora (um CT-e citando todas as NF-e).
// GET /api/fretes/relatorios/consolidacao?janela=1&desde=&ate=&busca=
router.get('/relatorios/consolidacao', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const janela = Math.min(Math.max(parseInt(req.query.janela, 10) || 0, 0), 7);
    // embarcadas=1: notas que JÁ SAÍRAM em CT-e separados — quanto teria economizado num CT-e só.
    const embarcadas = req.query.embarcadas === '1';
    // modo=destino: agrupa pelo DESTINO (cidade de entrega ou redespacho), de clientes diferentes —
    // carga consolidada para negociar com a transportadora (ou CT-e globalizado, se cabível).
    const porDestino = req.query.modo === 'destino';
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? req.query.desde : null;
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || '')) ? req.query.ate : null;
    const valores = [];
    let filtros = `f.frete_principal_id IS NULL AND ${embarcadas ? 'f.chave_cte IS NOT NULL AND NOT f.cte_cancelado AND f.valor_total_cte > 0' : 'f.chave_cte IS NULL AND f.data_entrega IS NULL'}
      AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND f.nf_retornou IS NOT TRUE
      AND f.nf_entrada IS NOT TRUE AND f.nf_complementar IS NOT TRUE AND f.nf_sem_circulacao IS NOT TRUE
      AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Arquivado'${embarcadas ? '' : ", 'Não cobrado'"})
      AND COALESCE(f.frete_cif_fob, '') NOT IN ('FOB', 'Destinatário', 'Destinatario', 'Sem frete', 'Próprio destinatário')
      AND f.frete_por_conta_cliente IS NOT TRUE
      AND LENGTH(COALESCE(f.cliente_documento, '')) >= 11`;
    if (desde) { valores.push(desde); filtros += ` AND f.data_emissao_nf >= $${valores.length}::date`; }
    else filtros += ` AND f.data_emissao_nf >= CURRENT_DATE - ${embarcadas ? 60 : 15}`;
    if (ate) { valores.push(ate); filtros += ` AND f.data_emissao_nf <= $${valores.length}::date`; }
    const busca = String(req.query.busca || '').trim();
    if (busca) { valores.push(`%${busca}%`); filtros += ` AND (f.cliente ILIKE $${valores.length} OR f.numero_nf ILIKE $${valores.length} OR f.cidade ILIKE $${valores.length})`; }
    const { rows: notas } = await consultaCliente(req,
      `SELECT f.id, f.numero_nf, f.numero_pedido, f.data_emissao_nf, f.cliente, f.cliente_documento, f.cidade, f.bairro, f.uf,
              f.qtd_volumes, f.peso_kg, f.cubagem_m3, f.valor_faturado, f.transportadora AS transportadora_nf,
              f.redespacho, f.cidade_redespacho, f.redespacho_cnpj, f.observacoes, f.numero_mapa,
              f.chave_cte, f.numero_cte, f.valor_total_cte, f.transportadora_cte, f.data_emissao_cte
         FROM fretes f WHERE ${filtros}
        ORDER BY ${embarcadas ? 'COALESCE(f.data_emissao_cte, f.data_emissao_nf)' : 'f.data_emissao_nf'}, f.numero_nf LIMIT 3000`, valores);
    // Na visão "já embarcadas" a transportadora é a do CT-e e a data é a do CT-e.
    if (embarcadas) notas.forEach((n) => { n.transportadora_nf = n.transportadora_cte || n.transportadora_nf; n.data_ref = n.data_emissao_cte || n.data_emissao_nf; });
    else notas.forEach((n) => { n.data_ref = n.data_emissao_nf; });

    const { calc, porTransportadora, destinoDa, ufOrigem } = await contextoDestinos();
    const norm = (t) => calc.normalizarCidade(t || '').replace(/[^a-z0-9]+/g, ' ').trim();
    // Frete de UMA remessa (uma nota, ou o grupo somado) por um trecho.
    const freteDe = (trecho, carga, n, destino) => {
      const { freteBase } = calc.calcularFreteBase(trecho, { qtdVolumes: carga.vol, pesoKg: carga.peso, cubagemM3: carga.cub });
      const comp = calc.calcularComponentesEValorTotal(trecho, freteBase, {
        valorFaturado: carga.valor, pesoKg: carga.peso, qtdVolumes: carga.vol, cliente: n.cliente, clienteCnpj: n.cliente_documento, ufIni: ufOrigem, ufFim: destino.uf || n.uf,
      });
      return Number.isFinite(comp.total) && comp.total > 0 ? Math.round(comp.total * 100) / 100 : null;
    };
    const cargaDe = (lista) => lista.reduce((a, n) => ({ vol: a.vol + (Number(n.qtd_volumes) || 0), peso: a.peso + (Number(n.peso_kg) || 0),
      cub: a.cub + (Number(n.cubagem_m3) || 0), valor: a.valor + (Number(n.valor_faturado) || 0) }), { vol: 0, peso: 0, cub: 0, valor: 0 });

    if (porDestino) {
      const resultado = consolidarPorDestino({ notas, calc, porTransportadora, destinoDa, freteDe, cargaDe, norm, janela, embarcadas });
      const veiculos = await veiculosConfigurados();
      completarCarga(resultado.grupos, veiculos);
      return res.json({ janela, embarcadas, modo: 'destino', veiculos, ...resultado });
    }
    // 1) Chave legal: mesmo destinatário (CNPJ exato) + mesma cidade de entrega + mesmo redespacho + mesma transportadora.
    const grupos = new Map();
    for (const n of notas) {
      const destino = destinoDa(n);
      if (!destino.cidade) continue;
      const red = n.redespacho_cnpj || norm(n.redespacho);
      const chave = [n.cliente_documento, norm(destino.cidade), red || '', normTransp(n.transportadora_nf)].join('|');
      if (!grupos.has(chave)) grupos.set(chave, { destino, notas: [] });
      grupos.get(chave).notas.push(n);
    }
    // 2) Dentro de cada chave: notas emitidas dentro da janela de dias (a partir da 1ª do bloco).
    const sugestoes = []; let semTabela = 0;
    for (const { destino, notas: lista } of grupos.values()) {
      if (lista.length < 2) continue;
      let bloco = [];
      const fechar = () => { if (bloco.length >= 2) avaliar(bloco); bloco = []; };
      const avaliar = (b) => {
        const n0 = b[0];
        const alvo = destino.tipo === 'cliente' ? { cidade: n0.cidade, bairro: n0.bairro, uf: n0.uf } : { cidade: destino.cidade, bairro: null, uf: destino.uf };
        // Transportadora: a da nota; sem transportadora na nota, a que fica mais barata para o grupo junto.
        const candidatas = n0.transportadora_nf
          ? Object.entries(porTransportadora).filter(([nome]) => normTransp(nome) === normTransp(n0.transportadora_nf))
          : Object.entries(porTransportadora);
        let melhor = null;
        for (const [nome, trechos] of candidatas) {
          const trecho = calc.escolherTrechoDoDestino(trechos, alvo);
          if (!trecho) continue;
          const separadas = b.map((n) => freteDe(trecho, cargaDe([n]), n, destino));
          if (separadas.some((v) => v == null)) continue;
          const junto = freteDe(trecho, cargaDe(b), n0, destino);
          if (junto == null) continue;
          const separado = Math.round(separadas.reduce((a, v) => a + v, 0) * 100) / 100;
          if (!melhor || junto < melhor.junto) melhor = { transportadora: nome, tabela: trecho.tabela_nome, separadas, separado, junto };
        }
        if (!melhor) { semTabela += 1; return; }
        // Já embarcadas: só conta se saíram em CT-e DIFERENTES; o "separado" é o que foi pago (soma dos CT-e).
        if (embarcadas) {
          const ctes = new Map(b.map((n) => [n.chave_cte, Number(n.valor_total_cte) || 0]));
          if (ctes.size < 2) return;
          melhor.separado = Math.round([...ctes.values()].reduce((a, v) => a + v, 0) * 100) / 100;
          melhor.separadas = b.map((n) => Number(n.valor_total_cte) || 0);
        }
        const economia = Math.round((melhor.separado - melhor.junto) * 100) / 100;
        if (economia <= 0) return;
        const carga = cargaDe(b);
        sugestoes.push({
          cliente: n0.cliente, cliente_documento: n0.cliente_documento, destino, transportadora: melhor.transportadora,
          transportadora_definida: !!n0.transportadora_nf, tabela: melhor.tabela,
          notas: b.map((n, i) => ({ id: n.id, numero_nf: n.numero_nf, numero_pedido: n.numero_pedido, data_emissao_nf: n.data_emissao_nf,
            qtd_volumes: n.qtd_volumes, peso_kg: n.peso_kg, cubagem_m3: n.cubagem_m3, valor_faturado: n.valor_faturado, numero_mapa: n.numero_mapa, frete: melhor.separadas[i],
            numero_cte: n.numero_cte || null, data_emissao_cte: n.data_emissao_cte || null })),
          volumes: carga.vol, peso: Math.round(carga.peso * 1000) / 1000, valor: Math.round(carga.valor * 100) / 100,
          separado: melhor.separado, junto: melhor.junto, economia,
        });
      };
      for (const n of lista) {
        if (bloco.length && (new Date(n.data_ref) - new Date(bloco[0].data_ref)) / 86400000 > janela) fechar();
        bloco.push(n);
      }
      fechar();
    }
    sugestoes.sort((a, b) => b.economia - a.economia);
    const veiculos = await veiculosConfigurados();
    completarCarga(sugestoes, veiculos);
    res.json({ janela, embarcadas, veiculos, resumo: { grupos: sugestoes.length, notas: sugestoes.reduce((a, g) => a + g.notas.length, 0),
      economiaTotal: Math.round(sugestoes.reduce((a, g) => a + g.economia, 0) * 100) / 100, semTabela }, grupos: sugestoes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao montar o relatório. Detalhe técnico: ${err.message}` });
  }
});

// GET /api/fretes/relatorios/cif-direto-redespacho?periodo=tudo|mes|3m|12m
// Fretes CIF das transportadoras com tabela de preço: quanto elas entregaram
// DIRETO ao cliente x quanto passou por uma transportadora de redespacho.
router.get('/relatorios/cif-direto-redespacho', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  const periodos = {
    mes: `AND data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE)`,
    '3m': `AND data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'`,
    '12m': `AND data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'`,
  };
  const filtroPeriodo = periodos[req.query.periodo] || '';
  const VALOR = 'COALESCE(valor_total_cte, valor_frete_negociado, 0)';
  const REDESP = `NULLIF(TRIM(redespacho), '') IS NOT NULL`;
  try {
    const { rows } = await consultaCliente(req,
      `SELECT transportadora_cte AS transportadora,
              COUNT(*) FILTER (WHERE NOT ${REDESP})::int AS qtd_direto,
              COUNT(*) FILTER (WHERE ${REDESP})::int AS qtd_redespacho,
              COALESCE(SUM(${VALOR}) FILTER (WHERE NOT ${REDESP}), 0)::float AS valor_direto,
              COALESCE(SUM(${VALOR}) FILTER (WHERE ${REDESP}), 0)::float AS valor_redespacho
         FROM fretes f
        WHERE UPPER(TRIM(frete_cif_fob)) = 'CIF'
          AND f.transportadora_cte IS NOT NULL
          AND f.frete_principal_id IS NULL
          AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')
          ${filtroPeriodo}
          AND EXISTS (
            SELECT 1 FROM tabelas_preco tp JOIN transportadoras t ON t.id = tp.transportadora_id
             WHERE tp.ativa = TRUE AND t.razao_social ILIKE '%' || f.transportadora_cte || '%'
          )
        GROUP BY transportadora_cte
        ORDER BY SUM(${VALOR}) DESC`);
    res.json({ transportadoras: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório de CIF direto x redespacho.' });
  }
});

// Período comum dos relatórios de custo (pela emissão do CT-e).
function filtroPeriodoCte(periodo, coluna = 'data_emissao_cte') {
  return {
    mes: `AND ${coluna} >= DATE_TRUNC('month', CURRENT_DATE)`,
    '3m': `AND ${coluna} >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'`,
    '12m': `AND ${coluna} >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'`,
  }[periodo] || '';
}

// GET /api/fretes/relatorios/custo-clientes?periodo=12m
// Quanto cada cliente custa de frete (todos os CT-e da nota, inclusive
// reentregas) em relação ao que ele compra (valor das notas).
router.get('/relatorios/custo-clientes', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  const periodo = filtroPeriodoCte(req.query.periodo);
  try {
    const { rows } = await consultaCliente(req,
      `SELECT cliente,
              COUNT(*) FILTER (WHERE frete_principal_id IS NULL)::int AS qtd_notas,
              COALESCE(SUM(valor_faturado) FILTER (WHERE frete_principal_id IS NULL), 0)::float AS faturado,
              COALESCE(SUM(COALESCE(valor_total_cte, valor_frete_negociado)), 0)::float AS frete,
              COALESCE(SUM(COALESCE(valor_total_cte, valor_frete_negociado)) FILTER (WHERE vinculo_cte IN ('reentrega', 'devolucao')), 0)::float AS frete_reentrega,
              COUNT(*) FILTER (WHERE vinculo_cte IN ('reentrega', 'devolucao'))::int AS qtd_reentregas,
              MODE() WITHIN GROUP (ORDER BY frete_cif_fob) AS cif_fob
         FROM fretes
        WHERE NULLIF(TRIM(cliente), '') IS NOT NULL AND chave_cte IS NOT NULL
          AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') ${periodo}
        GROUP BY cliente
        HAVING SUM(COALESCE(valor_total_cte, valor_frete_negociado)) > 0
        ORDER BY frete DESC
        LIMIT 40`);
    res.json({ clientes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o custo de frete por cliente.' });
  }
});

// GET /api/fretes/relatorios/reentregas?periodo=12m
// Quanto se gasta com reentregas e devoluções, por transportadora e por cliente.
router.get('/relatorios/reentregas', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  const periodo = filtroPeriodoCte(req.query.periodo, 'f.data_emissao_cte');
  const BASE = `FROM fretes f LEFT JOIN fretes p ON p.id = f.frete_principal_id
               WHERE f.vinculo_cte IN ('reentrega', 'devolucao') AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') ${periodo}`;
  const VALOR = 'COALESCE(f.valor_total_cte, f.valor_frete_negociado, 0)';
  try {
    const [{ rows: resumo }, { rows: porTransp }, { rows: porCliente }, { rows: fretesTotais }] = await Promise.all([
      consultaCliente(req, `SELECT COUNT(*)::int AS qtd,
              COUNT(*) FILTER (WHERE f.vinculo_cte = 'reentrega')::int AS qtd_reentrega,
              COUNT(*) FILTER (WHERE f.vinculo_cte = 'devolucao')::int AS qtd_devolucao,
              COALESCE(SUM(${VALOR}), 0)::float AS valor,
              COALESCE(SUM(COALESCE(p.valor_total_cte, p.valor_frete_negociado)), 0)::float AS valor_original,
              COUNT(*) FILTER (WHERE f.status = 'Frete Retido')::int AS retidas ${BASE}`),
      consultaCliente(req, `SELECT COALESCE(f.transportadora_cte, f.transportadora, '—') AS transportadora, COUNT(*)::int AS qtd,
              COALESCE(SUM(${VALOR}), 0)::float AS valor ${BASE} GROUP BY 1 ORDER BY valor DESC LIMIT 10`),
      consultaCliente(req, `SELECT COALESCE(f.cliente, '—') AS cliente, COUNT(*)::int AS qtd,
              COALESCE(SUM(${VALOR}), 0)::float AS valor ${BASE} GROUP BY 1 ORDER BY valor DESC LIMIT 10`),
      consultaCliente(req, `SELECT COALESCE(SUM(COALESCE(valor_total_cte, valor_frete_negociado)), 0)::float AS total
         FROM fretes WHERE chave_cte IS NOT NULL AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') ${filtroPeriodoCte(req.query.periodo)}`),
    ]);
    res.json({ resumo: { ...resumo[0], frete_total: fretesTotais[0].total }, por_transportadora: porTransp, por_cliente: porCliente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório de reentregas.' });
  }
});

// GET /api/fretes/relatorios/carga-direta
// Fretes marcados como Carga Direta: resumo, por transportadora, por destino
// e por mês (últimos 12). Valor = o cobrado no CT-e (ou o negociado/tabelado
// quando o CT-e ainda não tem valor).
router.get('/relatorios/carga-direta', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  const VALOR = 'COALESCE(valor_total_cte, valor_frete_negociado, valor_total_frete)';
  const BASE = `FROM fretes WHERE carga_direta IS TRUE AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`;
  try {
    const [{ rows: resumo }, { rows: porTransportadora }, { rows: porCidade }, { rows: porMes }] = await Promise.all([
      consultaCliente(req,
        `SELECT COUNT(*)::int AS qtd, COALESCE(SUM(${VALOR}), 0)::float AS valor,
                COALESCE(SUM(valor_faturado), 0)::float AS mercadoria,
                COALESCE(SUM(peso_kg), 0)::float AS peso
         ${BASE}`),
      consultaCliente(req,
        `SELECT COALESCE(transportadora_cte, transportadora, 'Sem transportadora') AS transportadora,
                COUNT(*)::int AS qtd, COALESCE(SUM(${VALOR}), 0)::float AS valor
         ${BASE} GROUP BY 1 ORDER BY valor DESC, qtd DESC LIMIT 10`),
      consultaCliente(req,
        `SELECT UPPER(TRIM(cidade)) || COALESCE('/' || NULLIF(TRIM(uf), ''), '') AS cidade,
                COUNT(*)::int AS qtd, COALESCE(SUM(${VALOR}), 0)::float AS valor
         ${BASE} AND NULLIF(TRIM(cidade), '') IS NOT NULL
         GROUP BY 1 ORDER BY qtd DESC, valor DESC LIMIT 10`),
      consultaCliente(req,
        `SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(data_emissao_cte, data_emissao_nf)), 'MM/YYYY') AS mes,
                COUNT(*)::int AS qtd, COALESCE(SUM(${VALOR}), 0)::float AS valor
         ${BASE} AND COALESCE(data_emissao_cte, data_emissao_nf) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
         GROUP BY DATE_TRUNC('month', COALESCE(data_emissao_cte, data_emissao_nf))
         ORDER BY DATE_TRUNC('month', COALESCE(data_emissao_cte, data_emissao_nf))`),
    ]);
    res.json({ resumo: resumo[0], por_transportadora: porTransportadora, por_cidade: porCidade, por_mes: porMes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de carga direta.' });
  }
});

// GET /api/fretes/relatorios/percent-frete-mensal
// % Frete médio por mês (últimos 12 meses), pra comparar a evolução.
router.get('/relatorios/percent-frete-mensal', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT TO_CHAR(DATE_TRUNC('month', data_emissao_nf), 'MM/YYYY') AS mes,
              ROUND(AVG(percent_frete)::numeric, 2) AS percent_medio
       FROM fretes
       WHERE data_emissao_nf IS NOT NULL AND percent_frete IS NOT NULL
         AND data_emissao_nf >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
       GROUP BY DATE_TRUNC('month', data_emissao_nf)
       ORDER BY DATE_TRUNC('month', data_emissao_nf) ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório mensal.' });
  }
});

// GET /api/fretes/relatorios/percent-frete-diario
// % Frete médio por dia (últimos 30 dias).
router.get('/relatorios/percent-frete-diario', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT TO_CHAR(data_emissao_nf, 'DD/MM') AS dia,
              ROUND(AVG(percent_frete)::numeric, 2) AS percent_medio
       FROM fretes
       WHERE data_emissao_nf IS NOT NULL AND percent_frete IS NOT NULL
         AND data_emissao_nf >= NOW() - INTERVAL '30 days'
       GROUP BY data_emissao_nf
       ORDER BY data_emissao_nf ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório diário.' });
  }
});

// GET /api/fretes/relatorios/cif-fob
// Comparação entre fretes CIF e FOB, por quantidade e por valor faturado.
router.get('/relatorios/cif-fob', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT COALESCE(frete_cif_fob, 'Não informado') AS tipo, COUNT(*)::int AS qtd_fretes,
              COALESCE(SUM(valor_faturado), 0)::float AS valor_total
       FROM fretes
       GROUP BY frete_cif_fob
       ORDER BY qtd_fretes DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório CIF x FOB.' });
  }
});

// GET /api/fretes/resumo
// Os números da Visão Geral, calculados direto no banco (COUNT/SUM) — ao
// contrário de baixar milhares de registros pra contar no navegador, isso
// nunca "perde" registros mesmo com o banco bem grande.
router.get('/resumo', autenticar, async (req, res) => {
  // Painel da Visão geral: o fluxo do frete (etapa por etapa), o que precisa
  // de atenção, o gasto do mês e as transportadoras do mês. Tudo respeita o
  // cliente do usuário (consultaCliente).
  const VALOR_CTE = 'COALESCE(valor_total_cte, valor_frete_negociado)';
  try {
    const [{ rows: fluxo }, { rows: mes }, { rows: transportadorasMes }, { rows: evolucao }, { rows: meta }] = await Promise.all([
      consultaCliente(req,
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE chave_cte IS NULL AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Arquivado'))::int AS aguardando_cte,
           COUNT(*) FILTER (WHERE chave_cte IS NOT NULL AND COALESCE(status, 'Pendente') = 'Pendente')::int AS em_conferencia,
           COALESCE(SUM(${VALOR_CTE}) FILTER (WHERE chave_cte IS NOT NULL AND COALESCE(status, 'Pendente') = 'Pendente'), 0)::float AS valor_em_conferencia,
           COUNT(*) FILTER (WHERE status = 'Frete Retido')::int AS retidos,
           COALESCE(SUM(${VALOR_CTE}) FILTER (WHERE status = 'Frete Retido'), 0)::float AS valor_retido,
           COUNT(*) FILTER (WHERE status IN ('Liberado p/ Pagamento', 'Conferido'))::int AS liberados,
           COALESCE(SUM(${VALOR_CTE}) FILTER (WHERE status IN ('Liberado p/ Pagamento', 'Conferido')), 0)::float AS valor_liberado,
           COUNT(*) FILTER (WHERE status = 'Faturado')::int AS faturados,
           COALESCE(SUM(${VALOR_CTE}) FILTER (WHERE status = 'Faturado'), 0)::float AS valor_faturado,
           COUNT(*) FILTER (WHERE status IN ('Liberado p/ Pagamento', 'Conferido') AND data_vencimento < CURRENT_DATE)::int AS vencidos,
           COUNT(*) FILTER (WHERE status IN ('Liberado p/ Pagamento', 'Conferido')
                              AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS vencendo,
           COUNT(*) FILTER (WHERE chave_cte IS NOT NULL AND valor_total_frete IS NULL
                              AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Arquivado'))::int AS sem_calculo,
           COUNT(*) FILTER (WHERE status = 'Liberado p/ Pagamento' AND fatura_id IS NULL)::int AS prontos_fatura,
           COALESCE(SUM(${VALOR_CTE}) FILTER (WHERE status = 'Liberado p/ Pagamento' AND fatura_id IS NULL), 0)::float AS valor_prontos_fatura,
           COUNT(*) FILTER (WHERE data_entrega IS NULL AND data_entrega_prevista < CURRENT_DATE AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE
                              AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado'))::int AS entregas_atrasadas,
           COUNT(*) FILTER (WHERE frete_principal_id IS NULL AND NULLIF(TRIM(COALESCE(numero_mapa, '')), '') IS NULL
                              AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE AND nf_entrada IS NOT TRUE AND nf_complementar IS NOT TRUE AND nf_sem_circulacao IS NOT TRUE
                              AND data_entrega IS NULL AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Arquivado')
                              AND data_emissao_nf BETWEEN CURRENT_DATE - 90
                                  AND CURRENT_DATE - COALESCE((SELECT mapa_dias_alerta FROM configuracao_auditoria WHERE id = 1), 3))::int AS notas_sem_mapa,
           COUNT(*) FILTER (WHERE alerta_cobranca_dupla AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Liberado p/ Pagamento'))::int AS cobranca_dupla,
           COUNT(*) FILTER (WHERE nf_cancelada AND chave_cte IS NOT NULL AND NOT cte_cancelado
                              AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Arquivado'))::int AS nf_cancelada_com_cte,
           COUNT(*) FILTER (WHERE alerta_transportadora_diferente AND frete_principal_id IS NOT NULL
                              AND status = 'Frete Retido')::int AS ctes_outra_transportadora
         FROM fretes`),
      // Gasto do mês: pelo valor cobrado no CT-e e a data de emissão do CT-e.
      consultaCliente(req,
        `SELECT
           COALESCE(SUM(${VALOR_CTE}) FILTER (WHERE data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE)), 0)::float AS valor_atual,
           COUNT(*) FILTER (WHERE data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE))::int AS qtd_atual,
           COALESCE(SUM(valor_faturado) FILTER (WHERE data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE)), 0)::float AS mercadoria_atual,
           COALESCE(SUM(${VALOR_CTE}) FILTER (WHERE data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                                             AND data_emissao_cte < DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                                                                    + (CURRENT_DATE - DATE_TRUNC('month', CURRENT_DATE)::date + 1) * INTERVAL '1 day'), 0)::float AS valor_anterior_mesmo_periodo,
           COALESCE(SUM(${VALOR_CTE}) FILTER (WHERE data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                                             AND data_emissao_cte < DATE_TRUNC('month', CURRENT_DATE)), 0)::float AS valor_anterior
         FROM fretes
         WHERE data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
           AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`),
      consultaCliente(req,
        `SELECT COALESCE(transportadora_cte, transportadora) AS transportadora,
                COALESCE(SUM(${VALOR_CTE}), 0)::float AS valor, COUNT(*)::int AS qtd
           FROM fretes
          WHERE data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE)
            AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')
          GROUP BY 1 ORDER BY valor DESC LIMIT 6`),
      consultaCliente(req,
        // Todos os meses desde o primeiro com CT-e (dentro dos 6), inclusive os
        // sem nenhum CT-e (R$ 0) — antes, mês vazio simplesmente sumia do gráfico.
        `WITH dados AS (
           SELECT DATE_TRUNC('month', data_emissao_cte) AS m, COALESCE(SUM(${VALOR_CTE}), 0)::float AS valor
             FROM fretes
            WHERE data_emissao_cte >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
              AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')
            GROUP BY 1
         ), meses AS (
           SELECT generate_series(COALESCE((SELECT MIN(m) FROM dados), DATE_TRUNC('month', CURRENT_DATE)),
                                  DATE_TRUNC('month', CURRENT_DATE), INTERVAL '1 month') AS m
         )
         SELECT TO_CHAR(meses.m, 'MM/YYYY') AS mes, COALESCE(dados.valor, 0)::float AS valor
           FROM meses LEFT JOIN dados ON dados.m = meses.m
          ORDER BY meses.m`),
      // Meta do mês: mesmo cálculo da tela Financeiro, pra os dois baterem.
      consultaCliente(req,
        `SELECT m.valor_meta::float AS valor_meta,
                (SELECT COALESCE(SUM(valor_total_frete), 0)::float FROM fretes
                  WHERE data_emissao_nf >= DATE_TRUNC('month', CURRENT_DATE)
                    AND data_emissao_nf < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month') AS realizado
           FROM metas_frete m
          WHERE m.mes_referencia = DATE_TRUNC('month', CURRENT_DATE)::date AND m.transportadora IS NULL`),
    ]);
    // Sinistros com a data de cobrar a transportadora vencida ou pra hoje.
    let sinistrosCobrar = 0;
    if (temAlguma(req, 'pode_ver_sinistros')) {
      const { rows: sc } = await pool.query(
        `SELECT COUNT(*)::int AS qtd FROM sinistros s
          WHERE s.data_cobranca <= CURRENT_DATE AND s.status <> 'Resolvido' AND NOT s.ressarcido
            AND ($1::text IS NULL OR s.numero_nf IN (SELECT numero_nf FROM fretes WHERE cliente = $1)
                 OR s.numero_pedido IN (SELECT numero_pedido FROM fretes WHERE cliente = $1))`,
        [vePotudo(req) ? null : (req.usuario.cliente_nome || '')]
      );
      sinistrosCobrar = sc[0].qtd;
    }
    res.json({
      ...fluxo[0],
      sinistros_cobrar: sinistrosCobrar,
      mes: mes[0],
      transportadoras_mes: transportadorasMes,
      evolucao,
      meta: meta[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao calcular o resumo.' });
  }
});

// GET /api/fretes/relatorios/status
// Distribuição atual de todos os fretes por Status.
router.get('/relatorios/status', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT COALESCE(status, 'Pendente') AS status, COUNT(*)::int AS qtd_fretes
       FROM fretes GROUP BY status ORDER BY qtd_fretes DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de status.' });
  }
});

// GET /api/fretes/relatorios/retido-por-transportadora
router.get('/relatorios/retido-por-transportadora', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT transportadora_cte AS transportadora, COUNT(*)::int AS qtd_fretes
       FROM fretes WHERE status = 'Frete Retido' AND transportadora_cte IS NOT NULL
       GROUP BY transportadora_cte ORDER BY qtd_fretes DESC LIMIT 15`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de frete retido.' });
  }
});

// GET /api/fretes/relatorios/valor-total-mensal
// Evolução do Valor Total do Frete (R$) mês a mês, últimos 12 meses.
router.get('/relatorios/valor-total-mensal', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT TO_CHAR(DATE_TRUNC('month', data_emissao_nf), 'MM/YYYY') AS mes,
              COALESCE(SUM(valor_total_frete), 0)::float AS valor_total
       FROM fretes
       WHERE data_emissao_nf IS NOT NULL
         AND data_emissao_nf >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
       GROUP BY DATE_TRUNC('month', data_emissao_nf)
       ORDER BY DATE_TRUNC('month', data_emissao_nf) ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de valor mensal.' });
  }
});

// GET /api/fretes/relatorios/valor-por-transportadora
router.get('/relatorios/valor-por-transportadora', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT transportadora_cte AS transportadora, COALESCE(SUM(valor_faturado), 0)::float AS valor_total
       FROM fretes WHERE transportadora_cte IS NOT NULL
       GROUP BY transportadora_cte ORDER BY valor_total DESC LIMIT 10`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de valor por transportadora.' });
  }
});

// GET /api/fretes/relatorios/glosas-por-transportadora
router.get('/relatorios/glosas-por-transportadora', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT transportadora_cte AS transportadora, COALESCE(SUM(glosa_valor), 0)::float AS valor_glosa
       FROM fretes WHERE glosa_valor IS NOT NULL AND transportadora_cte IS NOT NULL
       GROUP BY transportadora_cte ORDER BY valor_glosa DESC LIMIT 10`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de glosas.' });
  }
});

// GET /api/fretes/relatorios/faturamento-cidades?uf=SP&periodo=12m
// Cidades dos clientes que mais faturamos (valor das notas), com a
// participação de cada uma no faturamento total e o frete pago pra lá.
router.get('/relatorios/faturamento-cidades', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  const periodos = {
    mes: `AND data_emissao_nf >= DATE_TRUNC('month', CURRENT_DATE)`,
    '3m': `AND data_emissao_nf >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'`,
    '12m': `AND data_emissao_nf >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'`,
  };
  const filtroPeriodo = periodos[req.query.periodo] || '';
  const uf = /^[A-Z]{2}$/.test(String(req.query.uf || '').toUpperCase()) ? String(req.query.uf).toUpperCase() : null;
  const BASE = `FROM fretes
       WHERE frete_principal_id IS NULL
         AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE
         AND valor_faturado IS NOT NULL AND NULLIF(TRIM(cidade), '') IS NOT NULL
         ${filtroPeriodo}`;
  try {
    const [{ rows: brutas }, { rows: total }, { rows: ufs }] = await Promise.all([
      consultaCliente(req,
        `SELECT UPPER(TRIM(cidade)) AS cidade, UPPER(TRIM(uf)) AS uf,
                COUNT(*)::int AS qtd_notas,
                ARRAY_AGG(DISTINCT cliente) FILTER (WHERE cliente IS NOT NULL) AS clientes,
                COALESCE(SUM(valor_faturado), 0)::float AS faturado,
                COALESCE(SUM(COALESCE(valor_total_cte, valor_frete_negociado)), 0)::float AS frete
         ${BASE} AND ($1::text IS NULL OR UPPER(TRIM(uf)) = $1)
         GROUP BY 1, 2`, [uf]),
      consultaCliente(req, `SELECT COALESCE(SUM(valor_faturado), 0)::float AS faturado ${BASE}`),
      consultaCliente(req, `SELECT DISTINCT UPPER(TRIM(uf)) AS uf ${BASE} AND NULLIF(TRIM(uf), '') IS NOT NULL ORDER BY 1`),
    ]);

    // Junta grafias diferentes da mesma cidade (acento, espaços) dentro da UF.
    const juntas = new Map();
    brutas.forEach((c) => {
      const nome = normalizarCidade(c.cidade);
      if (!nome) return;
      const chave = `${nome}|${c.uf || ''}`;
      const atual = juntas.get(chave) || { cidade: nome, uf: c.uf || '', qtd_notas: 0, clientes: new Set(), faturado: 0, frete: 0 };
      atual.qtd_notas += c.qtd_notas;
      (c.clientes || []).forEach((cl) => atual.clientes.add(cl));
      atual.faturado += c.faturado;
      atual.frete += c.frete;
      juntas.set(chave, atual);
    });
    const faturamentoTotal = total[0].faturado;
    const faturamentoFiltro = [...juntas.values()].reduce((s, c) => s + c.faturado, 0);
    const lista = [...juntas.values()]
      .sort((a, b) => b.faturado - a.faturado)
      .slice(0, 30)
      .map((c) => ({ ...c, qtd_clientes: c.clientes.size, clientes: undefined }));
    res.json({ faturamento_total: faturamentoTotal, faturamento_filtro: faturamentoFiltro, qtd_cidades: juntas.size, ufs: ufs.map((u) => u.uf), cidades: lista });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório de faturamento por cidade.' });
  }
});

// GET /api/fretes/relatorios/por-uf
// Só considera fretes de transportadoras que já têm Tabela de Preço
// cadastrada (senão não daria pra saber se aquele frete é "de verdade").
router.get('/relatorios/por-uf', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT f.uf, COUNT(*)::int AS qtd_fretes
       FROM fretes f
       WHERE f.uf IS NOT NULL AND f.uf <> '' AND f.transportadora_cte IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM tabelas_preco tp
           JOIN transportadoras t ON t.id = tp.transportadora_id
           WHERE tp.ativa = TRUE AND t.razao_social ILIKE '%' || f.transportadora_cte || '%'
         )
       GROUP BY f.uf ORDER BY qtd_fretes DESC LIMIT 15`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório por UF.' });
  }
});

// Campos que o BI pode selecionar — lista fechada, evita qualquer risco de
// injeção de SQL (nunca aceita nome de coluna vindo direto do usuário).
const CAMPOS_BI_PERMITIDOS = [
  'numero_pedido', 'pedido_mercus', 'data_pedido', 'data_emissao_nf', 'numero_nf',
  'data_emissao_cte', 'numero_cte', 'data_fatura', 'numero_fatura', 'data_vencimento',
  'cliente', 'cidade', 'bairro', 'uf', 'transportadora', 'transportadora_cte', 'tipo_carga', 'frete_cif_fob',
  'redespacho', 'cidade_redespacho', 'valor_faturado', 'qtd_volumes', 'peso_kg', 'cubagem_m3',
  'tabela_frete', 'interior_capital', 'valor_frete_tabelado', 'valor_total_calculado',
  'valor_frete_negociado', 'valor_total_cte', 'tde', 'tda', 'gris', 'pedagio', 'trt', 'ad_valorem',
  'reentrega', 'devolucao', 'outras_despesas', 'valor_total_frete', 'dif_negociado_tabela', 'percent_frete',
  'numero_mapa', 'data_coleta', 'data_entrega', 'status', 'status_aprovacao', 'observacoes',
  'glosa_valor', 'glosa_motivo',
];

// GET /api/fretes/bi?campos=a,b,c&transportadora=...&status=...&data_de=...&data_ate=...
// Monta uma consulta só com os campos escolhidos pela pessoa — usado tanto
// pra pré-visualizar quanto pra exportar pro Excel.
router.get('/bi', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const camposPedidos = (req.query.campos || '').split(',').map((c) => c.trim()).filter(Boolean);
    const campos = camposPedidos.filter((c) => CAMPOS_BI_PERMITIDOS.includes(c));
    if (campos.length === 0) return res.status(400).json({ erro: 'Selecione pelo menos um campo.' });

    const condicoes = [];
    const valores = [];
    if (req.query.transportadora) {
      valores.push(`%${req.query.transportadora}%`);
      condicoes.push(`transportadora_cte ILIKE $${valores.length}`);
    }
    if (req.query.status) {
      valores.push(req.query.status);
      condicoes.push(`status = $${valores.length}`);
    }
    if (req.query.data_de) {
      valores.push(req.query.data_de);
      condicoes.push(`data_emissao_nf >= $${valores.length}`);
    }
    if (req.query.data_ate) {
      valores.push(req.query.data_ate);
      condicoes.push(`data_emissao_nf <= $${valores.length}`);
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const { rows } = await consultaCliente(req, 
      `SELECT ${campos.map((c) => `"${c}"`).join(', ')} FROM fretes ${where} ORDER BY id DESC LIMIT 50000`,
      valores
    );
    res.json({ campos, linhas: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório personalizado.' });
  }
});

// GET /api/fretes/relatorios/sla
router.get('/relatorios/sla', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT COALESCE(sla_status, 'Sem dados') AS sla_status, COUNT(*)::int AS qtd_fretes
       FROM fretes WHERE sla_status IS NOT NULL
       GROUP BY sla_status ORDER BY qtd_fretes DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de SLA.' });
  }
});

// GET /api/fretes/relatorios/atrasos-por-transportadora
router.get('/relatorios/atrasos-por-transportadora', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT transportadora_cte AS transportadora, COUNT(*)::int AS qtd_fretes
       FROM fretes WHERE sla_status = 'Atrasado' AND transportadora_cte IS NOT NULL
       GROUP BY transportadora_cte ORDER BY qtd_fretes DESC LIMIT 15`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório de atrasos.' });
  }
});

// GET /api/fretes/relatorios/anomalias
// Compara cada frete com a média histórica da MESMA transportadora, e
// sinaliza os que fogem muito do padrão (mais de 2 desvios-padrão de
// diferença) — mesmo que o valor "bata" certinho com o CT-e, pode ser um
// preço fora do normal (erro de digitação, tabela errada, etc.).
router.get('/relatorios/anomalias', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `WITH stats AS (
         SELECT transportadora_cte, AVG(valor_total_frete) AS media, STDDEV(valor_total_frete) AS desvio, COUNT(*) AS qtd
         FROM fretes
         WHERE valor_total_frete IS NOT NULL AND transportadora_cte IS NOT NULL
         GROUP BY transportadora_cte
         HAVING COUNT(*) >= 5
       )
       SELECT f.id, f.numero_pedido, f.numero_nf, f.transportadora_cte AS transportadora,
              f.valor_total_frete::float AS valor_total_frete, s.media::float AS media_transportadora,
              ROUND(((f.valor_total_frete - s.media) / NULLIF(s.desvio, 0))::numeric, 2)::float AS desvios_padrao
       FROM fretes f
       JOIN stats s ON s.transportadora_cte = f.transportadora_cte
       WHERE s.desvio > 0 AND ABS(f.valor_total_frete - s.media) > 2 * s.desvio
       ORDER BY ABS(f.valor_total_frete - s.media) / NULLIF(s.desvio, 0) DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar anomalias.' });
  }
});

// GET /api/fretes/relatorios/scorecard
// Uma nota geral por transportadora, combinando SLA (prazo), % de fretes
// retidos por divergência, sinistros e preço médio — pra decidir com quem
// vale a pena continuar trabalhando, baseado em dado e não só impressão.
router.get('/relatorios/scorecard', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `WITH base AS (
         SELECT
           transportadora_cte AS transportadora,
           COUNT(*)::int AS qtd_fretes,
           COUNT(*) FILTER (WHERE sla_status = 'No Prazo')::float AS qtd_no_prazo,
           COUNT(*) FILTER (WHERE sla_status IS NOT NULL)::float AS qtd_com_sla,
           COUNT(*) FILTER (WHERE status = 'Frete Retido')::float AS qtd_retidos,
           AVG(valor_total_frete)::float AS preco_medio
         FROM fretes
         WHERE transportadora_cte IS NOT NULL
         GROUP BY transportadora_cte
         HAVING COUNT(*) >= 3
       ),
       sinistros_agrupados AS (
         SELECT transportadora, COUNT(*)::int AS qtd_sinistros, COALESCE(SUM(valor_prejuizo), 0)::float AS prejuizo_total
         FROM sinistros GROUP BY transportadora
       )
       SELECT b.transportadora, b.qtd_fretes, b.preco_medio,
              CASE WHEN b.qtd_com_sla > 0 THEN ROUND((b.qtd_no_prazo / b.qtd_com_sla) * 100, 1) ELSE NULL END AS percentual_no_prazo,
              ROUND((b.qtd_retidos / b.qtd_fretes) * 100, 1) AS percentual_retido,
              COALESCE(s.qtd_sinistros, 0) AS qtd_sinistros,
              COALESCE(s.prejuizo_total, 0) AS prejuizo_total
       FROM base b
       LEFT JOIN sinistros_agrupados s ON s.transportadora = b.transportadora
       ORDER BY b.qtd_fretes DESC`
    );

    const comNota = rows.map((t) => {
      const penalidadeAtraso = t.percentual_no_prazo != null ? (100 - t.percentual_no_prazo) * 0.3 : 0;
      const penalidadeRetido = t.percentual_retido * 0.4;
      const penalidadeSinistro = (t.qtd_sinistros / t.qtd_fretes) * 100 * 3;
      const nota = Math.max(0, Math.min(100, Math.round(100 - penalidadeAtraso - penalidadeRetido - penalidadeSinistro)));
      return { ...t, nota };
    });
    comNota.sort((a, b) => b.nota - a.nota);
    res.json(comNota);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o scorecard.' });
  }
});

// GET /api/fretes/relatorios/nfe-cte
// Relação consolidada de cada NF-e com todos os CT-e encontrados para ela.
router.get('/relatorios/nfe-cte', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const busca = String(req.query.busca || '').trim();
    const params = [];
    const filtros = [];
    if (busca) {
      params.push(`%${busca}%`);
      filtros.push(`(numero_nf ILIKE $${params.length} OR numero_cte ILIKE $${params.length} OR numero_pedido ILIKE $${params.length} OR cliente ILIKE $${params.length})`);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const { rows } = await consultaCliente(req, `
      WITH base AS (
        SELECT * FROM fretes ${where}
      ), agrupado AS (
        SELECT
          numero_nf,
          MAX(chave_nfe) AS chave_nfe,
          STRING_AGG(DISTINCT NULLIF(numero_pedido, ''), ', ' ORDER BY NULLIF(numero_pedido, '')) AS pedidos,
          MAX(cliente) AS cliente,
          MAX(cidade) AS cidade,
          MAX(uf) AS uf,
          MAX(transportadora_nfe) AS transportadora_nfe,
          MAX(valor_faturado) FILTER (WHERE frete_principal_id IS NULL OR frete_principal_id = id) AS valor_nf,
          COUNT(DISTINCT numero_cte) FILTER (WHERE numero_cte IS NOT NULL AND numero_cte <> '')::int AS qtd_ctes,
          COUNT(*)::int AS qtd_registros,
          COALESCE(SUM(valor_total_cte) FILTER (WHERE numero_cte IS NOT NULL), 0)::numeric AS total_ctes,
          COALESCE(SUM(valor_total_frete) FILTER (WHERE numero_cte IS NOT NULL), 0)::numeric AS total_fretes,
          JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', id,
              'numero_cte', numero_cte,
              'chave_cte', chave_cte,
              'data_emissao_cte', data_emissao_cte,
              'transportadora_cte', transportadora_cte,
              'valor_total_cte', valor_total_cte,
              'valor_total_frete', valor_total_frete,
              'status', status,
              'vinculo_cte', vinculo_cte,
              'cte_cancelado', COALESCE(cte_cancelado, false),
              'cte_cancelado_motivo', cte_cancelado_motivo
            )
          ) FILTER (WHERE numero_cte IS NOT NULL AND numero_cte <> '') AS ctes
        FROM base
        WHERE numero_nf IS NOT NULL AND numero_nf <> ''
        GROUP BY numero_nf
      )
      SELECT a.*, COALESCE(cn.quantidade, 0)::int AS nf_copias
      FROM agrupado a
      LEFT JOIN copias_nf cn ON cn.numero_nf = a.numero_nf
      ORDER BY CASE WHEN numero_nf ~ '^[0-9]+$' THEN numero_nf::numeric END ASC NULLS LAST, numero_nf
    `, params);

    const resultado = rows.map(r => ({
      ...r,
      ctes: Array.isArray(r.ctes) ? r.ctes : [],
      situacao: Number(r.qtd_ctes || 0) === 0 ? 'Sem CT-e' : Number(r.qtd_ctes) === 1 ? '1 CT-e' : `${r.qtd_ctes} CT-e`,
    }));
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar a relação NF-e × CT-e.' });
  }
});

// GET /api/fretes/relatorios/auditoria-frete
// Auditoria consolidada: compara o valor calculado pela tabela com o CT-e,
// identifica falta de tabela, divergencia de transportadora, CT-e cancelado,
// duplicidade e divergencia de ICMS pela rota UFIni/UFFim.
router.get('/relatorios/auditoria-frete', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const valores = [];
    const filtros = [];
    const dataDe = String(req.query.data_de || '').trim();
    const dataAte = String(req.query.data_ate || '').trim();
    const transportadora = String(req.query.transportadora || '').trim();
    const status = String(req.query.status || '').trim();
    const busca = String(req.query.busca || '').trim();

    if (dataDe) { valores.push(dataDe); filtros.push(`f.data_emissao_cte >= $${valores.length}`); }
    if (dataAte) { valores.push(dataAte); filtros.push(`f.data_emissao_cte <= $${valores.length}`); }
    if (transportadora) { valores.push(`%${transportadora}%`); filtros.push(`f.transportadora_cte ILIKE $${valores.length}`); }
    if (status) { valores.push(status); filtros.push(`f.status = $${valores.length}`); }
    if (busca) {
      valores.push(`%${busca}%`);
      const n = valores.length;
      filtros.push(`(f.numero_nf ILIKE $${n} OR f.numero_cte ILIKE $${n} OR f.numero_pedido ILIKE $${n} OR f.cliente ILIKE $${n} OR f.transportadora_cte ILIKE $${n})`);
    }

    if (!(req.usuario.perfil === 'admin' || req.usuario.pode_ver_todos)) {
      valores.push(require('../permissoes').textoLimpo(req.usuario.cliente_nome));
      filtros.push(`f.cliente = $${valores.length}`);
    }
    const whereExtra = filtros.length ? `AND ${filtros.join(' AND ')}` : '';
    const { rows } = await pool.query(`
      SELECT f.id, f.numero_pedido, f.numero_nf, f.numero_cte, f.chave_nfe, f.chave_cte,
             f.data_emissao_cte, f.cliente, f.cidade, f.uf,
             f.transportadora, f.transportadora_nfe, f.transportadora_cte,
             f.valor_faturado::float AS valor_faturado,
             f.valor_total_frete::float AS valor_total_frete,
             f.valor_total_cte::float AS valor_total_cte,
             f.valor_total_calculado::float AS valor_total_calculado,
             f.valor_frete_negociado::float AS valor_frete_negociado,
             f.valor_frete_tabelado::float AS valor_frete_tabelado,
             f.dif_negociado_tabela::float AS dif_negociado_tabela,
             f.percent_frete::float AS percent_frete,
             f.tabela_preco_id_usada, f.prazo_dias_tabela,
             f.status, f.status_aprovacao, f.cte_cancelado, f.cte_cancelado_motivo,
             f.frete_principal_id, f.vinculo_cte, f.carga_direta,
             f.uf_inicio_cte, f.uf_fim_cte, f.impostos_cte,
             f.transportadora_cnpj_cte,
             -- Duplicidade: o mesmo CT-e (número + transportadora) em mais de um registro
             -- ativo; a mesma NF em mais de um registro PRINCIPAL (CT-e a mais da nota
             -- — reentrega, redespacho, cancelado — é esperado e não conta).
             (SELECT COUNT(*) FROM fretes d WHERE d.numero_cte = f.numero_cte AND NOT d.cte_cancelado
                 AND LEFT(COALESCE(d.transportadora_cnpj_cte, ''), 8) = LEFT(COALESCE(f.transportadora_cnpj_cte, ''), 8))::int AS qtd_numero_cte,
             CASE WHEN f.frete_principal_id IS NULL AND f.numero_nf IS NOT NULL
                  THEN (SELECT COUNT(*) FROM fretes d WHERE d.frete_principal_id IS NULL AND NOT d.cte_cancelado
                          AND LTRIM(d.numero_nf, '0') = LTRIM(f.numero_nf, '0')
                          AND COALESCE(d.chave_nfe, '') <> '' AND COALESCE(f.chave_nfe, '') <> ''
                          AND SUBSTRING(d.chave_nfe FROM 7 FOR 14) = SUBSTRING(f.chave_nfe FROM 7 FOR 14))
                  ELSE 0 END::int AS qtd_numero_nf
      FROM fretes f
      -- Só o que tem CT-e: nota ainda sem CT-e não tem o que auditar.
      WHERE f.chave_cte IS NOT NULL AND COALESCE(f.status, '') <> 'Não cobrado' ${whereExtra}
      ORDER BY f.data_emissao_cte DESC NULLS LAST, f.id DESC
      LIMIT 10000
    `, valores);

    const { rows: cfg } = await pool.query('SELECT tolerancia_valor, tolerancia_percentual FROM configuracao_auditoria WHERE id = 1');
    const toleranciaValor = Number(cfg[0]?.tolerancia_valor || 0);
    const toleranciaPercentual = Number(cfg[0]?.tolerancia_percentual || 0);

    const sulSudeste = new Set(['SP','RJ','MG','PR','SC','RS']);
    const norteNordesteCentroOesteEs = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','PA','PB','PE','PI','RN','RO','RR','SE','TO']);
    // Nomes da transportadora sem "LTDA", pontuação e espaços: "FAST-X TRANSPORTES
    // LTDA" e "FAST X TRANSPORTES" são a mesma.
    const nomeLimpo = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
      .replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A|SA)\b/g, '').replace(/[^A-Z0-9]/g, '');
    const mesmaTransp = (a, b) => { const x = nomeLimpo(a); const y = nomeLimpo(b); return !x || !y || x === y || x.startsWith(y) || y.startsWith(x); };
    // CT-e a mais da nota com valor esperado próprio (não usam tabela de preço).
    const SEM_TABELA_OK = ['reentrega', 'devolucao', 'complementar', 'reposicao', 'cancelado'];
    const resultado = rows.map((r) => {
      const problemas = [];
      let diferenca = null;
      let diferencaPercentual = null;

      if (!r.tabela_preco_id_usada && r.carga_direta !== true && !r.cte_cancelado && !SEM_TABELA_OK.includes(r.vinculo_cte)) problemas.push({ codigo: 'SEM_TABELA', texto: 'CT-e sem tabela de preço' });
      // Mesma base da conferência automática (trigger): valor total do frete
      // (calculado + outras despesas); sem ele, o calculado.
      const esperado = r.valor_total_frete != null ? r.valor_total_frete : r.valor_total_calculado;
      if (r.valor_total_cte != null && esperado != null && r.carga_direta !== true && !r.cte_cancelado) {
        diferenca = Number(r.valor_total_cte) - Number(esperado);
        diferencaPercentual = Number(esperado) ? (diferenca / Number(esperado)) * 100 : null;
        const limite = Math.max(toleranciaValor, Math.abs(Number(r.valor_total_cte)) * toleranciaPercentual / 100);
        if (Math.abs(diferenca) > limite) problemas.push({ codigo: 'DIVERGENCIA_VALOR', texto: 'CT-e diferente do valor calculado' });
      }
      if (!r.frete_principal_id && r.transportadora_nfe && r.transportadora_cte && !mesmaTransp(r.transportadora_nfe, r.transportadora_cte)) problemas.push({ codigo: 'TRANSPORTADORA_DIFERENTE', texto: 'Transportadora NF-e × CT-e diferente' });
      if (r.cte_cancelado) problemas.push({ codigo: 'CTE_CANCELADO', texto: 'CT-e cancelado' });
      if (!r.cte_cancelado && Number(r.qtd_numero_cte || 0) > 1) problemas.push({ codigo: 'DUP_CTE', texto: `CT-e aparece ${r.qtd_numero_cte}x` });
      if (Number(r.qtd_numero_nf || 0) > 1) problemas.push({ codigo: 'DUP_NFE', texto: `NF-e aparece ${r.qtd_numero_nf}x` });

      let icms = null;
      try { icms = JSON.parse(r.impostos_cte || '{}') || {}; } catch (_) { icms = null; }
      const ini = String(r.uf_inicio_cte || '').trim().toUpperCase();
      const fim = String(r.uf_fim_cte || '').trim().toUpperCase();
      const cst = String(icms?.cst ?? '').padStart(2, '0');
      if (ini && fim && ini !== fim && ['00','20'].includes(cst) && icms?.pICMS != null) {
        const esperada = icms?.aliquotaEsperadaPelaRota != null ? Number(icms.aliquotaEsperadaPelaRota) : (sulSudeste.has(ini) && norteNordesteCentroOesteEs.has(fim) ? 7 : 12);
        const cobrada = Number(icms.pICMS);
        if (Math.abs(cobrada - esperada) > 0.01) problemas.push({ codigo: 'ICMS', texto: `ICMS ${cobrada}% — esperado ${esperada}% (${ini}→${fim})` });
      }

      return { ...r, diferenca, diferenca_percentual: diferencaPercentual, problemas, qtd_problemas: problemas.length,
        situacao: problemas.length ? 'Divergência' : 'Conferido' };
    });
    res.json({ dados: resultado, tolerancia_valor: toleranciaValor, tolerancia_percentual: toleranciaPercentual });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar auditoria de frete.' });
  }
});

// GET /api/fretes/relatorios/duplicidades
// Acha Números de CT-e ou NF-e que aparecem em MAIS de um registro — sinal
// de que o mesmo documento pode ter sido importado duas vezes, ou vinculado
// a pedidos diferentes por engano (evita pagar o mesmo frete duas vezes).
router.get('/relatorios/duplicidades', autenticar, permitirAlguma('pode_ver_relatorios'), async (req, res) => {
  try {
    const { rows: cteDuplicado } = await consultaCliente(req, 
      // Mesmo número de CT-e da MESMA transportadora (raiz do CNPJ): transportadoras
      // diferentes podem ter CT-e com o mesmo número. CT-e cancelado não conta.
      `SELECT numero_cte AS numero, 'CT-e' AS tipo, COUNT(*)::int AS qtd,
              STRING_AGG(numero_pedido, ', ') AS pedidos, STRING_AGG(id::text, ',') AS ids
       FROM fretes WHERE numero_cte IS NOT NULL AND numero_cte <> '' AND NOT cte_cancelado
       GROUP BY numero_cte, LEFT(COALESCE(transportadora_cnpj_cte, transportadora_cte, ''), 8) HAVING COUNT(*) > 1`
    );
    const { rows: nfDuplicada } = await consultaCliente(req, 
      `SELECT numero_nf AS numero, 'NF-e' AS tipo, COUNT(*)::int AS qtd,
              STRING_AGG(numero_pedido, ', ') AS pedidos, STRING_AGG(id::text, ',') AS ids
       FROM fretes WHERE numero_nf IS NOT NULL AND numero_nf <> '' AND frete_principal_id IS NULL
       GROUP BY numero_nf HAVING COUNT(*) > 1`
    );
    res.json([...cteDuplicado, ...nfDuplicada]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar duplicidades.' });
  }
});

// GET /api/fretes/buscar-cidade-por-endereco?endereco=...&uf=...
// Usado quando o endereço de entrega não veio com cidade nenhuma (só rua e
// número) — busca candidatos de cidade pra você CONFERIR e escolher, nunca
// aplica sozinho.
router.get('/buscar-cidade-por-endereco', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  try {
    const { endereco, uf } = req.query;
    if (!endereco) return res.status(400).json({ erro: 'Informe o endereço pra buscar.' });
    const { buscarCidadePorEndereco } = require('../geocodificacao');
    const candidatos = await buscarCidadePorEndereco(endereco, uf);
    res.json(candidatos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar o endereço. Tente de novo em alguns segundos.' });
  }
});

router.post('/recalcular-tudo', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const { rows: registros } = await pool.query(
      `SELECT id, transportadora_cte, transportadora_cnpj_cte, cidade, bairro, cidade_redespacho, redespacho, observacoes,
              qtd_volumes, peso_kg, cubagem_m3, valor_faturado,
              cliente, impostos_cte, uf_inicio_cte, uf_fim_cte, xml_nfe_original, uf, redespacho_cnpj   -- descarga, ICMS, UF do destino e cadastro do redespacho
       FROM fretes
       WHERE transportadora_cte IS NOT NULL AND (carga_direta IS NOT TRUE)
         AND frete_principal_id IS NULL AND NOT cte_cancelado  -- CT-e adicionais (reentrega etc.) têm valor esperado próprio; o de outra transportadora é frete inteiro`
    );

    let recalculados = 0;
    let semTabela = 0;
    let semCidade = 0;
    let semTrecho = 0;
    // Um frete com problema não pode derrubar o recálculo dos outros: cada um
    // em separado, e os que falharem voltam listados com o motivo.
    const falhas = [];

    for (const reg of registros) {
     try {
      const resultado = await calcularParaRegistro({
        transportadoraCte: reg.transportadora_cte, transportadoraCnpj: reg.transportadora_cnpj_cte, cidade: reg.cidade, bairro: reg.bairro,
        cidadeRedespacho: reg.cidade_redespacho, redespacho: reg.redespacho,
        observacoes: reg.observacoes,
        qtdVolumes: reg.qtd_volumes, pesoKg: reg.peso_kg, cubagemM3: reg.cubagem_m3,
        valorFaturado: reg.valor_faturado, registro: reg,
      });

      if (resultado.erro) {
        if (resultado.erro.includes('tabela de preço')) semTabela++;
        else if (resultado.erro.includes('cidade') || resultado.erro.includes('Cidade') || resultado.erro.includes('Observações')) semCidade++;
        else semTrecho++;

        // Deixa registrado, direto no frete, por que ele não conseguiu calcular
        // — assim dá pra ver isso sem precisar clicar em "Por que não calculou?".
        // Sempre troca a anotação anterior pela mais recente, em vez de
        // empilhar uma embaixo da outra a cada vez que o recálculo roda.
        const anotacao = `⚠️ Cálculo automático: ${resultado.erro}`;
        const linhasObservacoes = (reg.observacoes || '')
          .split('\n')
          .filter((linha) => !linha.trim().startsWith('⚠️ Cálculo automático:'));
        if (!linhasObservacoes.includes(anotacao)) linhasObservacoes.push(anotacao);
        const observacoesAtualizadas = linhasObservacoes.join('\n').trim();

        if (observacoesAtualizadas !== (reg.observacoes || '').trim()) {
          await pool.query('UPDATE fretes SET observacoes = $1 WHERE id = $2', [observacoesAtualizadas, reg.id]);
        }
        continue;
      }

      const { trecho, freteBase, explicacao, componentes, cidadeUsada, origemCidade, taxaAplicada } = resultado;
      const auditoriaCalculo = JSON.stringify({
        tabela_nome: trecho.tabela_nome, transportadora_nome: trecho.transportadora_nome,
        origem: trecho.origem, destino: trecho.destino, tipo_carga: trecho.tipo_carga,
        cidade_usada: cidadeUsada, origem_cidade: origemCidade, modo_calculo: trecho.modo_calculo,
        valor_por_volume: trecho.valor_por_kg != null ? Number(trecho.valor_por_kg) : null,
        volume_minimo: trecho.volume_minimo != null ? Number(trecho.volume_minimo) : null,
        frete_minimo: trecho.frete_minimo != null ? Number(trecho.frete_minimo) : null,
        qtd_volumes_usada: reg.qtd_volumes, explicacao, valor_resultado: freteBase,
        componentes, valor_total_calculado: componentes.total,
        calculado_em: new Date().toISOString(), origem_recalculo: 'recalcular-tudo',
      });

      await pool.query(
        `UPDATE fretes SET valor_frete_tabelado = $1, valor_total_calculado = $2,
                tabela_preco_id_usada = $3, auditoria_calculo = $4,
                interior_capital = COALESCE($5, interior_capital),
                tabela_frete = $6, observacoes = $7, prazo_dias_tabela = $8
         WHERE id = $9`,
        [freteBase, componentes.total, trecho.tabela_preco_id, auditoriaCalculo, trecho.regiao || null,
         taxaAplicada != null ? taxaAplicada.toFixed(2) : null,
         (reg.observacoes || '').split('\n').filter((l) => !l.trim().startsWith('⚠️ Cálculo automático:')).join('\n').trim(),
         trecho.prazo_dias ?? trecho.tabela_prazo_dias ?? null, reg.id]
      );
      recalculados++;
     } catch (e) {
      falhas.push({ id: reg.id, motivo: e.message });
      if (falhas.length <= 3) console.error(`[recalcular] frete #${reg.id}:`, e.message);
     }
    }

    // CT-e de outra transportadora e do redespacho da nota: frete inteiro, pela tabela deles.
    const { rows: adicionais } = await pool.query(
      `SELECT id FROM fretes WHERE vinculo_cte IN ('redespacho', 'redespacho_nota') AND frete_principal_id IS NOT NULL AND NOT cte_cancelado`);
    for (const a of adicionais) {
      const r = await require('../calculoFrete').calcularEGravar(a.id, 'recalcular-tudo').catch(() => null);
      if (r?.ok) recalculados++;
    }

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'recalcular_tudo',
      detalhes: `Recalculou o Valor Total Calculado em massa: ${recalculados} atualizado(s) de ${registros.length}`,
    });

    // Pra cada frete que falhou: nº da NF/CT-e e o motivo (os 20 primeiros).
    let falhasDetalhe = [];
    if (falhas.length) {
      const { rows: info } = await pool.query('SELECT id, numero_nf, numero_cte, status, status_aprovacao FROM fretes WHERE id = ANY($1)', [falhas.slice(0, 20).map((f) => f.id)]);
      falhasDetalhe = falhas.slice(0, 20).map((f) => ({ ...f, ...(info.find((i) => i.id === f.id) || {}) }));
    }
    res.json({ total: registros.length, recalculados, semTabela, semCidade, semTrecho, falhas: falhas.length, falhasDetalhe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao recalcular os registros. Detalhe técnico: ${err.message}` });
  }
});

// GET /api/fretes/financeiro/exportar
// Exporta só o essencial pro financeiro: transportadora, dados bancários,
// vencimento e valor líquido acordado — dos fretes já Liberados p/ Pagamento.
router.get('/financeiro/exportar', autenticar, permitirAlguma('pode_ver_financeiro', 'pode_aprovar_pagamento'), async (req, res) => {
  try {
    const { rows } = await consultaCliente(req, 
      `SELECT f.numero_pedido, f.numero_nf, f.numero_cte, t.razao_social AS transportadora,
              t.cnpj, t.banco, t.agencia, t.conta, t.tipo_conta, t.chave_pix,
              f.data_vencimento, f.valor_frete_negociado, f.glosa_valor,
              (f.valor_frete_negociado - COALESCE(f.glosa_valor, 0)) AS valor_liquido_acordado
       FROM fretes f
       LEFT JOIN transportadoras t ON t.razao_social = f.transportadora
       WHERE f.status = 'Liberado p/ Pagamento'
       ORDER BY f.data_vencimento ASC NULLS LAST, t.razao_social ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar exportação financeira.' });
  }
});

// GET /api/fretes/auditoria/divergencias
// Compara o Valor Frete Negociado (do CT-e) com o Valor Frete Tabelado (calculado
// pela tabela de preço), trazendo primeiro as maiores diferenças.
router.get('/auditoria/divergencias', autenticar, permitirAlguma('pode_ver_auditoria'), async (req, res) => {
  try {
    const vePotudo = req.usuario.perfil === 'admin' || req.usuario.pode_ver_todos;
    const condicoes = ['NOT fretes.cte_cancelado', "COALESCE(fretes.status, '') <> 'Não cobrado'", 'valor_frete_negociado IS NOT NULL', '(COALESCE(valor_total_calculado, valor_frete_tabelado) IS NOT NULL OR frete_principal_id IS NOT NULL OR alerta_transportadora_diferente)'];
    const valores = [];

    if (!vePotudo) {
      valores.push(require('../permissoes').textoLimpo(req.usuario.cliente_nome));
      condicoes.push(`cliente = $${valores.length}`);
    }

    const { rows } = await pool.query(
      `SELECT fretes.id, numero_pedido, numero_nf, numero_cte, cliente, transportadora, status,
              fretes.frete_principal_id, fretes.vinculo_cte, fretes.alerta_transportadora_diferente, fretes.cte_nao_levou, fretes.nf_cancelada,
              fretes.nf_devolvida, fretes.nf_substituida_por, fretes.nf_substitui, fretes.alerta_cobranca_dupla, fretes.nf_retornou,
              fretes.tp_serv_cte, fretes.tomador_cte_papel, fretes.tomador_cte_nome, fretes.tomador_cte_cnpj,
              (NULLIF(LEFT(REGEXP_REPLACE(COALESCE(fretes.tomador_cte_cnpj, ''), '[^0-9]', '', 'g'), 8), '') =
                 NULLIF(SUBSTRING(COALESCE(fretes.chave_nfe, (SELECT pr.chave_nfe FROM fretes pr WHERE pr.id = fretes.frete_principal_id), '') FROM 7 FOR 8), '')
              ) AS tomador_eh_empresa,
              (SELECT pr.redespacho FROM fretes pr WHERE pr.id = COALESCE(fretes.frete_principal_id, fretes.id)) AS redespacho_da_nota,
              fretes.transportadora_cte,
              (SELECT COALESCE(cl.transportadora_cte, cl.transportadora) || ' (CT-e ' || COALESCE(cl.numero_cte, '?') || ')'
                 FROM fretes pn JOIN fretes cl ON cl.id = pn.cte_que_levou_id
                WHERE pn.id = COALESCE(fretes.frete_principal_id, fretes.id)) AS transportadora_que_levou,
              (SELECT pr.numero_cte FROM fretes pr WHERE pr.id = fretes.frete_principal_id) AS numero_cte_principal,
              (SELECT COUNT(*)::int FROM fretes fi WHERE fi.frete_principal_id = fretes.id AND NOT fi.cte_cancelado) AS qtd_ctes_vinculados,
              (SELECT STRING_AGG(fi.numero_cte || COALESCE(' (' || fi.cte_cancelado_motivo || ')', ''), ', ')
                 FROM fretes fi WHERE fi.frete_principal_id = fretes.id AND fi.cte_cancelado) AS ctes_cancelados,
              cidade, uf, qtd_volumes, peso_kg, valor_frete_tabelado, valor_total_calculado, valor_frete_negociado,
              dif_negociado_tabela, auditoria_calculo, carga_direta, impostos_nfe, impostos_cte, uf_inicio_cte, uf_fim_cte,
              valor_faturado, fretes.tde, fretes.tda, fretes.gris, fretes.pedagio, fretes.trt, fretes.ad_valorem,
              reentrega, devolucao, outras_despesas, valor_total_frete,
              status_aprovacao, aprovado_por_nome, aprovado_em, motivo_rejeicao, justificativa_aprovacao,
              glosa_valor, glosa_motivo, glosa_registrada_por, glosa_registrada_em,
              CASE WHEN COALESCE(valor_total_calculado, valor_frete_tabelado) > 0
                   THEN ROUND((dif_negociado_tabela / COALESCE(valor_total_calculado, valor_frete_tabelado)) * 100, 2)
                   ELSE NULL END AS diferenca_percentual,
              tp.gris_percentual AS tabela_gris_percentual, tp.gris_minimo AS tabela_gris_minimo,
              tp.tde AS tabela_tde, tp.tda AS tabela_tda, tp.trt AS tabela_trt, tp.pedagio AS tabela_pedagio,
              tp.ad_valorem_percentual AS tabela_ad_valorem_percentual
       FROM fretes
       LEFT JOIN tabelas_preco tp ON tp.id = fretes.tabela_preco_id_usada
       WHERE ${condicoes.join(' AND ')}
       ORDER BY ABS(dif_negociado_tabela) DESC
       LIMIT 500`,
      valores
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao buscar auditoria de frete. Detalhe técnico: ${err.message}` });
  }
});

// GET /api/fretes/:id/diagnosticar-calculo
// Explica exatamente por que um registro NÃO conseguiu calcular o Valor
// Frete Tabelado — qual passo falhou (transportadora, tabela, cidade, trecho).
router.get('/:id/diagnosticar-calculo', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM fretes WHERE id = $1', [req.params.id]);
    const reg = rows[0];
    if (!reg) return res.status(404).json({ erro: 'Registro não encontrado.' });
    if (!podeVerCliente(req, reg.cliente)) return res.status(403).json({ erro: 'Você não tem acesso a esse registro.' });

    const resultado = await calcularParaRegistro({
      transportadoraCte: reg.transportadora_cte, transportadoraCnpj: reg.transportadora_cnpj_cte, cidade: reg.cidade, bairro: reg.bairro,
      cidadeRedespacho: reg.cidade_redespacho, redespacho: reg.redespacho,
      observacoes: reg.observacoes,
      qtdVolumes: reg.qtd_volumes, pesoKg: reg.peso_kg, cubagemM3: reg.cubagem_m3,
      valorFaturado: reg.valor_faturado, registro: reg,
    });

    if (resultado.erro) return res.json({ ok: false, motivo: resultado.erro });

    res.json({
      ok: true, freteBase: resultado.freteBase, explicacao: resultado.explicacao,
      cidadeUsada: resultado.cidadeUsada, origemCidade: resultado.origemCidade, trecho: resultado.trecho,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao diagnosticar o cálculo.' });
  }
});

// GET /api/fretes/:id/ctes-da-nota — todos os CT-e da mesma nota (o
// principal e os vinculados), com o total pago de frete por nota.
router.get('/:id/ctes-da-nota', autenticar, async (req, res) => {
  try {
    const { rows: atual } = await pool.query('SELECT id, frete_principal_id, cliente FROM fretes WHERE id = $1', [req.params.id]);
    if (!atual[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });
    if (!podeVerCliente(req, atual[0].cliente)) return res.status(403).json({ erro: 'Você não tem acesso a esse registro.' });
    const principalId = atual[0].frete_principal_id || atual[0].id;
    const { rows: pr } = await pool.query(
      'SELECT cte_que_levou_id, transportadora_definida_por, transportadora_definida_em FROM fretes WHERE id = $1', [principalId]);
    const { rows } = await pool.query(
      `SELECT id, numero_cte, data_emissao_cte, COALESCE(transportadora_cte, transportadora) AS transportadora,
              vinculo_cte, frete_principal_id, status, status_aprovacao, alerta_transportadora_diferente, cte_nao_levou, fatura_id,
              tp_serv_cte, tomador_cte_papel, tomador_cte_nome, observacoes,
              cte_cancelado, cte_cancelado_em, cte_cancelado_motivo,
              COALESCE(valor_total_cte, valor_frete_negociado)::float AS valor_cte, valor_total_frete::float AS valor_esperado
         FROM fretes WHERE (id = $1 OR frete_principal_id = $1) AND chave_cte IS NOT NULL
        ORDER BY (frete_principal_id IS NULL) DESC, data_emissao_cte, id`,
      [principalId]
    );
    const ativos = rows.filter((r) => !r.cte_cancelado && r.status !== 'Não cobrado');
    // O redespacho previsto na nota não conta como "outra transportadora cobrando".
    const transportadoras = new Set(ativos.filter((r) => r.vinculo_cte !== 'redespacho_nota')
      .map((r) => (r.transportadora || '').trim().toUpperCase()).filter(Boolean));
    const decisao = pr[0]?.cte_que_levou_id ? {
      cte_id: pr[0].cte_que_levou_id,
      transportadora: rows.find((r) => r.id === pr[0].cte_que_levou_id)?.transportadora || null,
      numero_cte: rows.find((r) => r.id === pr[0].cte_que_levou_id)?.numero_cte || null,
      definida_por: pr[0].transportadora_definida_por, definida_em: pr[0].transportadora_definida_em,
    } : null;
    res.json({
      principal_id: principalId,
      ctes: rows,
      // Só conta o que vai ser pago: sem cancelados e sem os CT-e de quem não levou.
      total_pago: rows.filter((r) => !['Cancelado', 'Não cobrado'].includes(r.status) && !r.cte_nao_levou).reduce((s, r) => s + (r.valor_cte || 0), 0),
      total_nao_cobrado: rows.filter((r) => r.status === 'Não cobrado').reduce((s, r) => s + (r.valor_cte || 0), 0),
      total_nao_levou: rows.filter((r) => r.status !== 'Cancelado' && r.cte_nao_levou).reduce((s, r) => s + (r.valor_cte || 0), 0),
      tem_varias_transportadoras: transportadoras.size > 1,
      transportadoras_diferentes: !decisao && (ativos.some((r) => r.alerta_transportadora_diferente) || transportadoras.size > 1),
      decisao,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar os CT-e da nota.' });
  }
});

// PUT /api/fretes/:id/transportadora-que-levou  { cte_id }
// Nota com CT-e de transportadoras diferentes: define qual delas levou de
// fato. Os CT-e das outras ficam marcados "não levou" e não são pagos.
router.put('/:id/transportadora-que-levou', autenticar, permitir('pode_aprovar_pagamento'), freteDoCliente(), async (req, res) => {
  try {
    const { definirTransportadoraQueLevou } = require('../ctesVinculados');
    const r = await definirTransportadoraQueLevou(Number(req.params.id), Number(req.body.cte_id), req.usuario);
    if (r.erro) return res.status(r.status || 400).json({ erro: r.erro });
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'definir_transportadora_que_levou',
      detalhes: `Definiu quem levou a nota do frete #${r.principalId}: ${r.resumo}`, registroId: r.principalId,
    });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao definir a transportadora que levou a nota.' });
  }
});

// DELETE /api/fretes/:id/transportadora-que-levou — desfaz a decisão.
router.delete('/:id/transportadora-que-levou', autenticar, permitir('pode_aprovar_pagamento'), freteDoCliente(), async (req, res) => {
  try {
    const { desfazerTransportadoraQueLevou } = require('../ctesVinculados');
    const r = await desfazerTransportadoraQueLevou(Number(req.params.id));
    if (r.erro) return res.status(r.status || 400).json({ erro: r.erro });
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'desfazer_transportadora_que_levou',
      detalhes: `Desfez a definição de quem levou a nota do frete #${r.principalId}`, registroId: r.principalId,
    });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao desfazer a decisão.' });
  }
});

// POST /api/fretes/:id/recalcular — recalcula UM frete pela tabela de preço
// (o mesmo do "Recalcular tudo"), e guarda o detalhe do cálculo.
router.post('/:id/recalcular', autenticar, permitirAlguma('pode_editar_registros', 'pode_aprovar_pagamento'), freteDoCliente(), bloquearCteCancelado(), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, frete_principal_id, vinculo_cte, carga_direta, numero_cte, status FROM fretes WHERE id = $1', [req.params.id]);
    const reg = rows[0];
    if (!reg) return res.status(404).json({ erro: 'Registro não encontrado.' });
    if (reg.status === 'Não cobrado') return res.json({ ok: false, motivo: 'Este CT-e não é cobrado da empresa (quem paga é outra pessoa): fica só como histórico da nota.' });
    if (reg.carga_direta) return res.json({ ok: false, motivo: 'Carga Direta não é conferida pela tabela.' });

    if (reg.frete_principal_id && !['redespacho', 'redespacho_nota'].includes(reg.vinculo_cte)) {
      // Reentrega/devolução/reposição: o esperado vem do CT-e principal, não da tabela.
      const { recalcularFilhos } = require('../ctesVinculados');
      if (reg.vinculo_cte === 'complementar') return res.json({ ok: false, motivo: 'CT-e complementar não tem valor esperado: é aprovado manualmente.' });
      await require('../calculoFrete').calcularEGravar(reg.frete_principal_id, 'recalculo-manual').catch(() => null);
      await recalcularFilhos(reg.frete_principal_id);
      await pool.query('UPDATE fretes SET atualizado_em = NOW() WHERE id = $1', [reg.id]);
      return res.json({ ok: true, mensagem: 'Valor esperado refeito a partir do CT-e principal da nota.' });
    }

    const r = await require('../calculoFrete').calcularEGravar(reg.id, 'recalculo-manual');
    if (!r) return res.json({ ok: false, motivo: 'Esse registro não é calculado pela tabela.' });
    if (!r.ok) return res.json(r);
    // Garante a conferência mesmo se o valor não mudou.
    await pool.query('UPDATE fretes SET atualizado_em = NOW() WHERE id = $1', [reg.id]);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'recalcular_frete',
      detalhes: `Recalculou pela tabela o frete #${reg.id} (CT-e ${reg.numero_cte || '—'})`, registroId: reg.id,
    });
    res.json({ ok: true, mensagem: 'Recalculado pela tabela de preço.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao recalcular o frete.' });
  }
});

// GET /api/fretes/:id/composicao-cte
// Lê o XML do CT-e guardado e devolve como a transportadora chegou no valor:
// componentes da prestação, impostos (ICMS/IBS/CBS) e totais.
router.get('/:id/composicao-cte', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT cliente, xml_cte_original FROM fretes WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });

    const vePotudo = req.usuario.perfil === 'admin' || req.usuario.pode_ver_todos;
    if (!vePotudo && rows[0].cliente !== req.usuario.cliente_nome) {
      return res.status(403).json({ erro: 'Você não tem acesso a esse registro.' });
    }
    if (!rows[0].xml_cte_original) return res.json({ semXml: true });

    res.json(extrairComposicaoCTe(rows[0].xml_cte_original));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao ler o XML do CT-e.' });
  }
});

// POST /api/fretes/copiar-nf — copia a NF-e e incrementa o contador do número.
// O contador fica salvo no banco para continuar existindo após sair/reabrir o sistema.
router.post('/copiar-nf', autenticar, async (req, res) => {
  try {
    const numeroNf = String(req.body.numero_nf || '').trim();
    if (!numeroNf) return res.status(400).json({ erro: 'Número da NF não informado.' });

    const { rows } = await pool.query(
      `INSERT INTO copias_nf (numero_nf, quantidade, atualizado_em)
       VALUES ($1, 1, NOW())
       ON CONFLICT (numero_nf) DO UPDATE
         SET quantidade = copias_nf.quantidade + 1, atualizado_em = NOW()
       RETURNING numero_nf, quantidade`,
      [numeroNf]
    );

    res.json({ numero_nf: rows[0].numero_nf, quantidade: rows[0].quantidade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível registrar a cópia da NF.' });
  }
});

// GET /api/fretes/:id
router.get('/:id', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM fretes WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });

    const vePotudo = req.usuario.perfil === 'admin' || req.usuario.pode_ver_todos;
    if (!vePotudo && rows[0].cliente !== req.usuario.cliente_nome) {
      return res.status(403).json({ erro: 'Você não tem acesso a esse registro.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar o registro.' });
  }
});

// PUT /api/fretes/:id  (edição manual de campos)
const CAMPOS_EDITAVEIS = CAMPOS_MANUAIS;

router.put('/:id', autenticar, permitir('pode_editar_registros'), freteDoCliente(), bloquearCteCancelado(), async (req, res) => {
  try {
    const campos = Object.keys(req.body).filter((c) => CAMPOS_EDITAVEIS.includes(c));
    if (campos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo válido para atualizar.' });
    }
    const { rows: atual } = await pool.query(`SELECT ${CAMPOS_DE_CONFERENCIA.join(', ')} FROM fretes WHERE id = $1`, [req.params.id]);
    if (!atual[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });
    const mexidos = campos.filter((c) => CAMPOS_DE_CONFERENCIA.includes(c) && valorMudou(atual[0][c], req.body[c]));
    const bloqueio = await bloqueioCamposConferencia(req, mexidos,
      ['valor_total_cte', 'valor_total_frete', 'valor_total_calculado', 'valor_frete_negociado']
        .flatMap((c) => [atual[0][c], campos.includes(c) ? req.body[c] : null]).filter((v) => !vazio(v)));
    if (bloqueio) return res.status(403).json({ erro: bloqueio });

    const sets = campos.map((c, i) => `${c} = $${i + 1}`);
    const valores = campos.map((c) => req.body[c]);
    // Data da entrega mexida pela tela: passa a ser "manual" (o Refazer não toca nela).
    if (campos.includes('data_entrega')) sets.push("data_entrega_origem = 'manual'");
    valores.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE fretes SET ${sets.join(', ')}, atualizado_em = NOW() WHERE id = $${valores.length} RETURNING *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_registro',
      detalhes: `Editou o registro #${rows[0].id} (pedido ${rows[0].numero_pedido || '—'}) — campos: ${campos.join(', ')}`,
      registroId: rows[0].id,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.message && err.message.includes('Só é possível liberar pagamento')) {
      return res.status(400).json({ erro: err.message });
    }
    res.status(500).json({ erro: 'Erro ao atualizar o registro.' });
  }
});

// DELETE /api/fretes/:id
// POST /api/fretes/excluir-lote  { ids: [...] }
// Mesmas regras da exclusão de um registro, em lote. Pula (e conta) o que não
// pode: fora do acesso do usuário, CT-e cancelado e frete já FATURADO (apagar
// deixaria a fatura conferida inconsistente).
router.post('/excluir-lote', autenticar, permitir('pode_excluir_registros'), async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ erro: 'Nenhum registro selecionado.' });
    if (ids.length > 500) return res.status(400).json({ erro: 'No máximo 500 registros por vez.' });
    const { rows } = await pool.query('SELECT id, cliente, numero_pedido, numero_nf, numero_cte, cte_cancelado, status, fatura_id FROM fretes WHERE id = ANY($1)', [ids]);
    const pulados = { semAcesso: 0, cteCancelado: 0, faturado: 0, naoEncontrado: ids.length - rows.length };
    const excluir = [];
    for (const r of rows) {
      if (!podeVerCliente(req, r.cliente)) pulados.semAcesso += 1;
      else if (r.cte_cancelado) pulados.cteCancelado += 1;
      else if (r.status === 'Faturado' || r.fatura_id) pulados.faturado += 1;
      else excluir.push(r);
    }
    if (excluir.length) await pool.query('DELETE FROM fretes WHERE id = ANY($1)', [excluir.map((r) => r.id)]);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'excluir_registros_lote',
      detalhes: `Excluiu ${excluir.length} registro(s) em lote: ${excluir.slice(0, 50).map((r) => `#${r.id} (pedido ${r.numero_pedido || '—'}, NF ${r.numero_nf || '—'})`).join('; ')}${excluir.length > 50 ? ' …' : ''}`,
    });
    res.json({ excluidos: excluir.length, pulados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao excluir os registros. Detalhe técnico: ${err.message}` });
  }
});

router.delete('/:id', autenticar, permitir('pode_excluir_registros'), freteDoCliente(), bloquearCteCancelado(), async (req, res) => {
  try {
    const existente = await pool.query('SELECT * FROM fretes WHERE id = $1', [req.params.id]);
    if (!existente.rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });

    await pool.query('DELETE FROM fretes WHERE id = $1', [req.params.id]);

    const r = existente.rows[0];
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'excluir_registro',
      detalhes: `Excluiu o registro #${r.id} (pedido ${r.numero_pedido || '—'}, NF ${r.numero_nf || '—'}, CT-e ${r.numero_cte || '—'})`,
      registroId: r.id,
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir o registro.' });
  }
});

module.exports = router;
