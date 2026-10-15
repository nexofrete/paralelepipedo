// Tela "Hoje" da transportadora: o que precisa de atenção agora, por área,
// conforme as permissões de quem está vendo. Cada pendência diz para onde ir
// (tela, aba e o filtro já aplicado).
const pool = require('./db');
const { temAlguma } = require('./permissoes');

const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

// Uma consulta que falha (tabela de um módulo não usado, por ex.) não derruba a tela.
async function um(sql, args = []) {
  try { return (await pool.query(sql, args)).rows[0] || {}; } catch (e) { console.error('[hoje]', e.message); return {}; }
}

async function montar(req) {
  const h = hojeBr();
  const operacao = temAlguma(req, 'pode_emitir_cte');
  const financeiro = temAlguma(req, 'pode_ver_financeiro');
  const itens = [];
  // nivel: perigo (resolver já) · atencao (hoje/em breve) · info (bom saber)
  const add = (area, it) => { if (it.qtd > 0 || it.sempre) itens.push({ area, ...it }); };

  if (operacao) {
    const c = await um(`SELECT COUNT(*) FILTER (WHERE status = 'rejeitado')::int AS rejeitados, COUNT(*) FILTER (WHERE status = 'erro')::int AS erro,
        COUNT(*) FILTER (WHERE status = 'enviando' AND atualizado_em < NOW() - INTERVAL '10 minutes')::int AS travados,
        COUNT(*) FILTER (WHERE status = 'rascunho')::int AS rascunhos FROM ctes_emitidos`);
    add('operacao', { chave: 'cte_rejeitados', icone: '⛔', titulo: 'CT-e rejeitados pela SEFAZ', qtd: c.rejeitados, nivel: 'perigo', detalhe: 'corrija e transmita de novo',
      destino: { ir: 'emissao-cte', aba: 'lista', selecionar: ['cteFiltroStatus', 'rejeitado'] } });
    add('operacao', { chave: 'cte_erro', icone: '📡', titulo: 'CT-e com erro de comunicação', qtd: (c.erro || 0) + (c.travados || 0), nivel: 'perigo', detalhe: 'consulte ou transmita de novo',
      destino: { ir: 'emissao-cte', aba: 'lista', selecionar: ['cteFiltroStatus', 'erro'] } });
    add('operacao', { chave: 'cte_rascunhos', icone: '📝', titulo: 'CT-e em rascunho', qtd: c.rascunhos, nivel: 'atencao', detalhe: 'inclui os importados das NF-e por e-mail',
      destino: { ir: 'emissao-cte', aba: 'lista', selecionar: ['cteFiltroStatus', 'rascunho'] } });

    const e = await um(`SELECT COUNT(*) FILTER (WHERE previsao_entrega < $1)::int AS atrasadas, COUNT(*) FILTER (WHERE previsao_entrega = $1)::int AS hoje,
        COUNT(*) FILTER (WHERE situacao_entrega = 'ocorrencia')::int AS ocorrencias
      FROM ctes_emitidos WHERE status = 'autorizado' AND COALESCE(situacao_entrega, 'pendente') NOT IN ('entregue', 'devolvido')`, [h]);
    add('operacao', { chave: 'entregas_atrasadas', icone: '⏰', titulo: 'Entregas atrasadas', qtd: e.atrasadas, nivel: 'perigo', detalhe: 'passaram da previsão e não foram baixadas',
      destino: { ir: 'ocorrencias', aba: 'entregas', clicar: '[data-oc-filtro="atrasados"]' } });
    add('operacao', { chave: 'ocorrencias', icone: '⚠️', titulo: 'Entregas com ocorrência', qtd: e.ocorrencias, nivel: 'perigo', detalhe: 'avaria, recusa, endereço não localizado…',
      destino: { ir: 'ocorrencias', aba: 'entregas', clicar: '[data-oc-filtro="ocorrencia"]' } });
    add('operacao', { chave: 'entregas_hoje', icone: '🚚', titulo: 'Entregas previstas para hoje', qtd: e.hoje, nivel: 'info',
      destino: { ir: 'ocorrencias', aba: 'entregas', clicar: '[data-oc-filtro="hoje"]' } });

    const col = await um(`SELECT COUNT(*) FILTER (WHERE status = 'pendente')::int AS a_programar, COUNT(*) FILTER (WHERE status = 'pendente' AND data_coleta < $1)::int AS atrasadas FROM coletas`, [h]);
    add('operacao', { chave: 'coletas', icone: '📦', titulo: 'Coletas a programar', qtd: col.a_programar, nivel: col.atrasadas ? 'perigo' : 'atencao',
      detalhe: col.atrasadas ? `${col.atrasadas} com a data já passada` : 'ponha no caminhão', destino: { ir: 'coletas', clicar: '[data-col-filtro="pendente"]' } });
    const cot = await um(`SELECT COUNT(*)::int AS n FROM cotacoes WHERE status = 'solicitada'`);
    add('operacao', { chave: 'cotacoes_portal', icone: '🌐', titulo: 'Cotações pedidas no portal', qtd: cot.n, nivel: 'atencao', detalhe: 'calcule o preço e responda o cliente',
      destino: { ir: 'cotacoes', clicar: '[data-ct-filtro="portal"]' } });
    const md = await um(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE autorizado_em < NOW() - INTERVAL '5 days')::int AS velhos FROM mdfes WHERE status = 'autorizado'`);
    add('operacao', { chave: 'mdfe_abertos', icone: '📋', titulo: 'MDF-e em aberto', qtd: md.n, nivel: md.velhos ? 'perigo' : 'info',
      detalhe: md.velhos ? `${md.velhos} há mais de 5 dias: encerre ao fim da viagem` : 'encerre quando a viagem terminar', destino: { ir: 'emissao-cte', aba: 'mdfe' } });
  }

  if (financeiro) {
    const f = await um(`SELECT COUNT(*) FILTER (WHERE vencimento < $1)::int AS vencidas, COALESCE(SUM(valor_bruto - desconto - valor_pago) FILTER (WHERE vencimento < $1), 0)::float AS vencidas_valor,
        COUNT(*) FILTER (WHERE vencimento BETWEEN $1 AND $1::date + 7)::int AS semana, COALESCE(SUM(valor_bruto - desconto - valor_pago) FILTER (WHERE vencimento BETWEEN $1 AND $1::date + 7), 0)::float AS semana_valor,
        COUNT(*) FILTER (WHERE boleto_status = 'rejeitado')::int AS boletos_rejeitados
      FROM faturas_transporte WHERE status IN ('aberta', 'parcial')`, [h]);
    add('financeiro', { chave: 'faturas_vencidas', icone: '🚨', titulo: 'Faturas vencidas', qtd: f.vencidas, valor: centavos(f.vencidas_valor), nivel: 'perigo', detalhe: 'cobre o cliente',
      destino: { ir: 'faturamento', aba: 'faturas', selecionar: ['fatStatus', 'vencidas'] } });
    add('financeiro', { chave: 'faturas_semana', icone: '📥', titulo: 'A receber nos próximos 7 dias', qtd: f.semana, valor: centavos(f.semana_valor), nivel: 'info',
      destino: { ir: 'faturamento', aba: 'faturas', selecionar: ['fatStatus', 'abertas'] } });
    add('financeiro', { chave: 'boletos_rejeitados', icone: '🏦', titulo: 'Boletos rejeitados pelo banco', qtd: f.boletos_rejeitados, nivel: 'perigo', detalhe: 'veja o motivo no retorno',
      destino: { ir: 'faturamento', aba: 'boletos' } });
    const af = await um(`SELECT COUNT(*)::int AS n, COALESCE(SUM(COALESCE((dados->'valores'->>'vRec')::numeric, (dados->'valores'->>'vTPrest')::numeric, valor_total)), 0)::float AS v
      FROM ctes_emitidos c WHERE status = 'autorizado' AND fatura_id IS NULL AND COALESCE(dados->>'tpCTe', '0') <> '3'
        AND demonstracao = COALESCE((SELECT cte_demonstracao FROM empresa WHERE id = 1), FALSE)`);
    add('financeiro', { chave: 'a_faturar', icone: '🧾', titulo: 'CT-e a faturar', qtd: af.n, valor: centavos(af.v), nivel: 'atencao', detalhe: 'sem fatura ainda: não entram no fluxo de caixa',
      destino: { ir: 'faturamento', aba: 'faturas' } });
    const p = await um(`SELECT COUNT(*) FILTER (WHERE vencimento < $1)::int AS vencidas, COALESCE(SUM(valor - valor_pago) FILTER (WHERE vencimento < $1), 0)::float AS vencidas_valor,
        COUNT(*) FILTER (WHERE vencimento = $1)::int AS hoje, COALESCE(SUM(valor - valor_pago) FILTER (WHERE vencimento = $1), 0)::float AS hoje_valor,
        COUNT(*) FILTER (WHERE vencimento BETWEEN $1::date + 1 AND $1::date + 7)::int AS semana, COALESCE(SUM(valor - valor_pago) FILTER (WHERE vencimento BETWEEN $1::date + 1 AND $1::date + 7), 0)::float AS semana_valor
      FROM contas_pagar WHERE status = 'aberta'`, [h]);
    add('financeiro', { chave: 'pagar_vencidas', icone: '💸', titulo: 'Contas a pagar vencidas', qtd: p.vencidas, valor: centavos(p.vencidas_valor), nivel: 'perigo', detalhe: 'juros e multa correndo',
      destino: { ir: 'pagar', aba: 'contas', clicar: '[data-cp-filtro="vencidas"]' } });
    add('financeiro', { chave: 'pagar_hoje', icone: '📆', titulo: 'Contas que vencem hoje', qtd: p.hoje, valor: centavos(p.hoje_valor), nivel: 'atencao',
      destino: { ir: 'pagar', aba: 'contas', clicar: '[data-cp-filtro="semana"]' } });
    add('financeiro', { chave: 'pagar_semana', icone: '🗓', titulo: 'A pagar nos próximos 7 dias', qtd: p.semana, valor: centavos(p.semana_valor), nivel: 'info',
      destino: { ir: 'pagar', aba: 'contas', clicar: '[data-cp-filtro="semana"]' } });
    const x = await um(`SELECT COUNT(*)::int AS n, COUNT(DISTINCT conta_id)::int AS contas FROM extrato_linhas WHERE conciliado_tipo IS NULL`);
    add('financeiro', { chave: 'conciliar', icone: '🔗', titulo: 'Linhas do extrato a conciliar', qtd: x.n, nivel: 'atencao', detalhe: x.contas > 1 ? `em ${x.contas} contas` : 'confira as sugestões',
      destino: { ir: 'bancos', aba: 'conciliacao' } });
    try {
      const { contas, total } = await require('./bancos/bancos').listarContas();
      if (contas.length) {
        const dif = contas.filter((c) => c.diferenca != null && Math.abs(c.diferenca) >= 0.005);
        add('financeiro', { chave: 'saldo', icone: '🏦', titulo: 'Saldo em caixa e bancos', qtd: contas.length, valor: total, sempre: true, nivel: total < 0 ? 'perigo' : dif.length ? 'atencao' : 'info',
          detalhe: dif.length ? `${dif.map((c) => c.nome).join(', ')}: diferença com o extrato` : `${contas.length} conta(s)`, destino: { ir: 'bancos', aba: 'contas' }, so_valor: true });
      }
    } catch (e) { console.error('[hoje]', e.message); }
    const cfg = await um('SELECT contabil_config->\'ultimo_envio\' AS u FROM empresa WHERE id = 1');
    if (cfg.u && cfg.u.ok === false) {
      add('financeiro', { chave: 'contador', icone: '🧮', titulo: 'Envio ao contador falhou', qtd: 1, nivel: 'perigo', detalhe: String(cfg.u.erro || '').slice(0, 120), destino: { ir: 'contabil', aba: 'pacote' } });
    }
  }

  if (operacao || financeiro) {
    try {
      const fr = await require('./frota').painel({});
      const a = fr.alertas || {};
      add('frota', { chave: 'manut_vencida', icone: '🛠', titulo: 'Manutenção preventiva vencida', qtd: (a.planos_vencidos || []).length, nivel: 'perigo',
        detalhe: (a.planos_vencidos || []).slice(0, 3).map((x) => `${x.placa} ${x.item}`).join(' · '), destino: { ir: 'frota', aba: 'painel' } });
      add('frota', { chave: 'manut_vencendo', icone: '🔧', titulo: 'Manutenção vencendo', qtd: (a.planos_vencendo || []).length, nivel: 'atencao',
        detalhe: (a.planos_vencendo || []).slice(0, 3).map((x) => `${x.placa} ${x.item}`).join(' · '), destino: { ir: 'frota', aba: 'painel' } });
      const cnhVencida = (a.cnh || []).filter((x) => x.vencida).length;
      add('frota', { chave: 'cnh', icone: '🪪', titulo: 'CNH vencida ou vencendo', qtd: (a.cnh || []).length, nivel: cnhVencida ? 'perigo' : 'atencao',
        detalhe: (a.cnh || []).slice(0, 3).map((x) => x.nome).join(', '), destino: { ir: 'frota', aba: 'painel' } });
      add('frota', { chave: 'oficina', icone: '🏭', titulo: 'Veículos na oficina ou com manutenção agendada', qtd: (a.oficina || []).length, nivel: 'info', destino: { ir: 'frota', aba: 'manutencoes' } });
    } catch (e) { console.error('[hoje]', e.message); }
  }

  const ordem = { perigo: 0, atencao: 1, info: 2 };
  itens.sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
  return {
    hoje: h, nome: req.usuario?.nome || '', areas: { operacao, financeiro, frota: operacao || financeiro }, itens,
    resumo: { perigo: itens.filter((i) => i.nivel === 'perigo').length, atencao: itens.filter((i) => i.nivel === 'atencao').length },
  };
}

module.exports = { montar };
