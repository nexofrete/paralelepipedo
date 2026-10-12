const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { temAlguma, ehAdmin, consultaCliente } = require('../permissoes');
const backup = require('../backup');

const router = express.Router();

// GET /api/notificacoes — junta tudo que precisa de atenção agora, num lugar
// só: fretes retidos, vencimentos no Financeiro, e o último backup.
router.get('/', autenticar, async (req, res) => {
  try {
    const notificacoes = [];

    // Cada aviso só aparece pra quem pode ver a tela a que ele leva, e as
    // contagens de fretes respeitam o cliente do usuário.
    const verAuditoria = temAlguma(req, 'pode_ver_auditoria');
    const verFinanceiro = temAlguma(req, 'pode_ver_financeiro');
    const verRelatorios = temAlguma(req, 'pode_ver_relatorios');
    const verTabelas = temAlguma(req, 'pode_gerenciar_tabelas_preco', 'pode_gerenciar_usuarios');

    // Mais urgente de todos: CT-e de transportadoras diferentes na mesma nota.
    if (verAuditoria) {
      const { rows: outra } = await consultaCliente(req,
        `SELECT COUNT(*)::int AS qtd FROM fretes
          WHERE alerta_transportadora_diferente AND frete_principal_id IS NOT NULL AND status = 'Frete Retido'`);
      if (outra[0].qtd > 0) {
        notificacoes.push({ tipo: 'urgente', icone: '⚠️', pagina: 'auditoria-frete', alvo: 'retidos',
          texto: `${outra[0].qtd} nota(s) com CT-e de transportadoras DIFERENTES — confira antes de pagar` });
      }
    }

    const { rows: retidos } = verAuditoria
      ? await consultaCliente(req, `SELECT COUNT(*)::int AS qtd FROM fretes WHERE status = 'Frete Retido'`)
      : { rows: [{ qtd: 0 }] };
    if (retidos[0].qtd > 0) {
      notificacoes.push({
        tipo: 'alerta', icone: '🔶', pagina: 'auditoria-frete', alvo: 'retidos',
        texto: `${retidos[0].qtd} frete(s) retido(s) aguardando resolução`,
      });
    }

    const { rows: financeiro } = !verFinanceiro ? { rows: [{ vencidos: 0, vencendo: 0 }] } : await consultaCliente(req,
      `SELECT
         COUNT(*) FILTER (WHERE data_vencimento < CURRENT_DATE)::int AS vencidos,
         COUNT(*) FILTER (WHERE data_vencimento >= CURRENT_DATE AND data_vencimento <= CURRENT_DATE + INTERVAL '7 days')::int AS vencendo
       FROM fretes WHERE status = 'Liberado p/ Pagamento'`
    );
    if (financeiro[0].vencidos > 0) {
      notificacoes.push({
        tipo: 'urgente', icone: '🚨', pagina: 'financeiro', alvo: 'vencimentos',
        texto: `${financeiro[0].vencidos} frete(s) com pagamento VENCIDO`,
      });
    }
    if (financeiro[0].vencendo > 0) {
      notificacoes.push({
        tipo: 'aviso', icone: '⏰', pagina: 'financeiro', alvo: 'vencimentos',
        texto: `${financeiro[0].vencendo} frete(s) vencendo nos próximos 7 dias`,
      });
    }

    if (ehAdmin(req)) try {
      const backups = backup.listarBackups();
      if (backups.length === 0) {
        notificacoes.push({ tipo: 'aviso', icone: '💾', pagina: 'manutencao', alvo: 'backup', texto: 'Nenhum backup foi feito ainda' });
      } else {
        const diasSemBackup = (Date.now() - new Date(backups[0].criado_em).getTime()) / (1000 * 60 * 60 * 24);
        if (diasSemBackup > 2) {
          notificacoes.push({
            tipo: 'aviso', icone: '💾', pagina: 'manutencao', alvo: 'backup',
            texto: `Último backup foi há ${Math.floor(diasSemBackup)} dia(s)`,
          });
        }
      }
    } catch { /* pasta de backups pode não existir ainda, tudo bem */ }

    if (verFinanceiro) try {
      const mesAtual = new Date().toISOString().slice(0, 7);
      const { rows: metaGeralRows } = await pool.query(
        `SELECT valor_meta FROM metas_frete WHERE mes_referencia = $1 AND transportadora IS NULL`,
        [`${mesAtual}-01`]
      );
      if (metaGeralRows[0]) {
        const { rows: realizadoRows } = await consultaCliente(req, 
          `SELECT COALESCE(SUM(valor_total_frete), 0)::float AS total FROM fretes
           WHERE data_emissao_nf >= $1 AND data_emissao_nf < ($1::date + INTERVAL '1 month')`,
          [`${mesAtual}-01`]
        );
        const percentual = (realizadoRows[0].total / Number(metaGeralRows[0].valor_meta)) * 100;
        if (percentual >= 100) {
          notificacoes.push({ tipo: 'urgente', icone: '🎯', pagina: 'financeiro', alvo: 'meta', texto: `Meta de frete do mês já ESTOUROU (${percentual.toFixed(0)}%)` });
        } else if (percentual >= 90) {
          notificacoes.push({ tipo: 'aviso', icone: '🎯', pagina: 'financeiro', alvo: 'meta', texto: `Meta de frete do mês em ${percentual.toFixed(0)}% — perto de estourar` });
        }
      }
    } catch { /* sem meta cadastrada ainda, tudo bem */ }

    if (verTabelas) try {
      const { rows: tabelasVencendo } = await pool.query(
        `SELECT tp.nome, t.razao_social,
                (tp.criado_em + (tp.validade_meses || ' months')::INTERVAL)::date AS data_vencimento
         FROM tabelas_preco tp
         JOIN transportadoras t ON t.id = tp.transportadora_id
         WHERE tp.ativa = TRUE AND tp.validade_meses IS NOT NULL
           AND (tp.criado_em + (tp.validade_meses || ' months')::INTERVAL) <= NOW() + INTERVAL '30 days'`
      );
      const vencidas = tabelasVencendo.filter((t) => new Date(t.data_vencimento) < new Date());
      const vencendoEmBreve = tabelasVencendo.filter((t) => new Date(t.data_vencimento) >= new Date());
      if (vencidas.length > 0) {
        notificacoes.push({ tipo: 'urgente', icone: '⏰', pagina: 'cadastros', alvo: 'tabelas-preco', texto: `${vencidas.length} tabela(s) de preço JÁ VENCIDA(S) — confira com a transportadora` });
      }
      if (vencendoEmBreve.length > 0) {
        notificacoes.push({ tipo: 'aviso', icone: '⏰', pagina: 'cadastros', alvo: 'tabelas-preco', texto: `${vencendoEmBreve.length} tabela(s) de preço vencendo nos próximos 30 dias` });
      }
    } catch { /* validade_meses pode não estar preenchido em nenhuma, tudo bem */ }

    if (verRelatorios) try {
      const { rows: dup } = await consultaCliente(req, 
        `SELECT COUNT(*)::int AS qtd FROM (
           SELECT numero_cte FROM fretes WHERE numero_cte IS NOT NULL AND numero_cte <> '' AND NOT cte_cancelado
            GROUP BY numero_cte, LEFT(COALESCE(transportadora_cnpj_cte, transportadora_cte, ''), 8) HAVING COUNT(*) > 1
           UNION ALL
           SELECT numero_nf FROM fretes WHERE numero_nf IS NOT NULL AND numero_nf <> '' AND frete_principal_id IS NULL GROUP BY numero_nf HAVING COUNT(*) > 1
         ) sub`
      );
      if (dup[0].qtd > 0) {
        notificacoes.push({ tipo: 'aviso', icone: '🔁', pagina: 'relatorios', alvo: 'anomalias', texto: `${dup[0].qtd} possível(is) CT-e/NF-e duplicado(s) — confira em Relatórios → Anomalias` });
      }
    } catch { /* tudo bem, segue sem essa checagem */ }

    if (verRelatorios) try {
      const { rows: ea } = await consultaCliente(req,
        `SELECT COUNT(*)::int AS qtd FROM fretes
          WHERE data_entrega IS NULL AND data_entrega_prevista < CURRENT_DATE AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`);
      if (ea[0].qtd > 0) {
        notificacoes.push({ tipo: 'alerta', icone: '🚚', pagina: 'relatorios', alvo: 'entregas-previstas',
          texto: `${ea[0].qtd} entrega(s) com a data prevista vencida e sem entrega registrada` });
      }
    } catch { /* segue sem essa checagem */ }

    // Notas sem mapa de carregamento há mais de N dias (paradas no estoque?).
    if (verRelatorios) try {
      const { rows: sm } = await consultaCliente(req,
        `SELECT COUNT(*)::int AS qtd FROM fretes
          WHERE frete_principal_id IS NULL AND NULLIF(TRIM(COALESCE(numero_mapa, '')), '') IS NULL
            AND nf_cancelada IS NOT TRUE AND nf_devolvida IS NOT TRUE AND nf_retornou IS NOT TRUE AND nf_entrada IS NOT TRUE AND nf_complementar IS NOT TRUE AND nf_sem_circulacao IS NOT TRUE
            AND data_entrega IS NULL AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Arquivado')
            AND data_emissao_nf BETWEEN CURRENT_DATE - 90
                AND CURRENT_DATE - COALESCE((SELECT mapa_dias_alerta FROM configuracao_auditoria WHERE id = 1), 3)`);
      if (sm[0].qtd > 0) {
        notificacoes.push({ tipo: 'alerta', icone: '🗺️', pagina: 'relatorios', alvo: 'sem-mapa',
          texto: `${sm[0].qtd} nota(s) sem mapa de carregamento — paradas no estoque?` });
      }
    } catch { /* segue sem essa checagem */ }

    // Rastreamento SSW: a última ocorrência da nota é um problema (retida, recusa, avaria...).
    if (verRelatorios) try {
      const { rows: rp } = await consultaCliente(req,
        `SELECT COUNT(*)::int AS qtd FROM fretes
          WHERE rastreio_problema AND data_entrega IS NULL AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`);
      if (rp[0].qtd > 0) {
        notificacoes.push({ tipo: 'alerta', icone: '⚠️', pagina: 'relatorios', alvo: 'entregas-previstas',
          texto: `${rp[0].qtd} nota(s) com ocorrência de problema na SSW (retida, recusa, avaria...)` });
      }
    } catch { /* segue sem essa checagem */ }

    // Alertas operacionais automáticos: entrega, canhoto, tabela, ICMS e faturas.
    if (verRelatorios) try {
      const { rows: canhoto } = await consultaCliente(req,
        `SELECT COUNT(*)::int AS qtd FROM fretes
          WHERE data_entrega IS NOT NULL
            AND canhoto_registrado_em IS NULL
            AND COALESCE(status, '') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')
            -- Entrega vinda da SSW já tem comprovante registrado na SEFAZ pela transportadora.
            AND NOT EXISTS (SELECT 1 FROM ocorrencias_rastreio o
                             WHERE o.frete_id = COALESCE(fretes.frete_principal_id, fretes.id) AND o.tipo = 'Entrega')`);
      if (canhoto[0].qtd > 0) {
        notificacoes.push({ tipo: 'alerta', icone: '📸', pagina: 'relatorios', alvo: 'entregas-previstas',
          texto: `${canhoto[0].qtd} entrega(s) registrada(s) sem canhoto — confira os comprovantes` });
      }
    } catch { /* segue sem essa checagem */ }

    if (verAuditoria) try {
      const { rows: semTabela } = await consultaCliente(req,
        `SELECT COUNT(*)::int AS qtd FROM fretes
          WHERE chave_cte IS NOT NULL AND NOT cte_cancelado
            AND COALESCE(status, '') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')
            AND tabela_preco_id_usada IS NULL
            AND frete_principal_id IS NULL`);
      if (semTabela[0].qtd > 0) {
        notificacoes.push({ tipo: 'alerta', icone: '📋', pagina: 'auditoria-frete', alvo: 'retidos',
          texto: `${semTabela[0].qtd} CT-e sem tabela de preço vinculada — confira antes de pagar` });
      }
    } catch { /* segue sem essa checagem */ }

    if (verAuditoria) try {
      // Mesma conferência da auditoria (UFIni→UFFim, ou o trecho até o redespacho).
      const { conferirIcms, camposSql } = require('../icmsCte');
      const { rows: ctesIcms } = await consultaCliente(req,
        `SELECT fretes.id, fretes.frete_principal_id, fretes.transportadora, ${camposSql('fretes')} FROM fretes
          WHERE chave_cte IS NOT NULL AND NOT cte_cancelado
            AND COALESCE(status, '') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado', 'Faturado')
            AND impostos_cte IS NOT NULL AND impostos_cte <> ''
            AND uf_inicio_cte IS NOT NULL AND uf_inicio_cte <> uf_fim_cte
          LIMIT 5000`);
      const foraDaRota = ctesIcms.filter((f) => conferirIcms(f)?.divergente).length;
      if (foraDaRota > 0) {
        notificacoes.push({ tipo: 'urgente', icone: '🧾', pagina: 'auditoria-frete', alvo: 'retidos',
          texto: `${foraDaRota} CT-e com alíquota de ICMS diferente da rota — confira na Auditoria de Frete` });
      }
    } catch { /* segue sem essa checagem */ }

    if (verFinanceiro) try {
      const { rows: faturasPendentes } = await pool.query(
        `SELECT COUNT(*)::int AS qtd FROM faturas_frete
          WHERE data_vencimento IS NOT NULL
            AND data_vencimento <= CURRENT_DATE + INTERVAL '7 days'
            AND COALESCE(parecer, '') NOT ILIKE '%pago%'`
      );
      if (faturasPendentes[0].qtd > 0) {
        notificacoes.push({ tipo: 'aviso', icone: '💳', pagina: 'financeiro', alvo: 'vencimentos',
          texto: `${faturasPendentes[0].qtd} fatura(s) vencendo ou vencida(s) nos próximos 7 dias` });
      }
    } catch { /* segue sem essa checagem */ }

    if (temAlguma(req, 'pode_ver_sinistros')) try {
      const { rows: sc } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE data_cobranca < CURRENT_DATE)::int AS atrasadas,
                COUNT(*) FILTER (WHERE data_cobranca = CURRENT_DATE)::int AS hoje
           FROM sinistros s
          WHERE s.data_cobranca <= CURRENT_DATE AND s.status <> 'Resolvido' AND NOT s.ressarcido
            AND ($1::text IS NULL OR s.numero_nf IN (SELECT numero_nf FROM fretes WHERE cliente = $1)
                 OR s.numero_pedido IN (SELECT numero_pedido FROM fretes WHERE cliente = $1))`,
        [ehAdmin(req) || req.usuario.pode_ver_todos ? null : (req.usuario.cliente_nome || '')]
      );
      const { atrasadas, hoje } = sc[0];
      if (atrasadas + hoje > 0) {
        notificacoes.push({
          tipo: atrasadas ? 'urgente' : 'alerta', icone: '📦', pagina: 'sinistros', alvo: 'sinistros-cobrar',
          texto: `${atrasadas + hoje} sinistro(s) para cobrar da transportadora${atrasadas ? ` (${atrasadas} com a data já passada)` : ' hoje'}`,
        });
      }
    } catch { /* segue sem essa checagem */ }

    // Segurança: só para administradores, sempre no topo.
    if (ehAdmin(req)) {
      for (const texto of require('../avisosSeguranca').listar()) {
        notificacoes.unshift({ tipo: 'urgente', icone: '🔐', pagina: 'cadastros', texto });
      }
    }
    res.json(notificacoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar notificações.' });
  }
});

module.exports = router;
