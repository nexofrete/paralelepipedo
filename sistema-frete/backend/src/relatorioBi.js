// Montar relatório (BI): o relatório que a pessoa monta escolhendo a FONTE (fretes contratados, CT-e
// emitidos, faturas a receber, faturas das transportadoras, contas a pagar, acertos de viagem), os
// campos (na ordem das colunas), os filtros, a ordenação e, se quiser, o agrupamento com totais.
// Usado pela prévia, pela planilha .xlsx e pelo envio automático por e-mail dos modelos salvos.
//
// Segurança: cada fonte tem uma lista FECHADA de campos (nunca entra nome de coluna vindo do usuário)
// e só aparece para quem pode ver a tela de origem (permissão antiga, grade de telas, módulo e filial).
const pool = require('./db');
const permissoes = require('./permissoes');

const SIMNAO = (c) => `CASE WHEN ${c} IS NULL THEN NULL WHEN ${c} THEN 'Sim' ELSE 'Não' END`;
const ROTULO_STATUS = (c) => `INITCAP(REPLACE(${c}, '_', ' '))`;
// Categoria da conta a pagar com o nome da tela (Combustível, Manutenção...); código desconhecido sai como está.
const CATEGORIA_CONTA = `CASE contas_pagar.categoria ${Object.entries(require('./contasPagar').CATEGORIAS)
  .map(([k, v]) => `WHEN '${k}' THEN '${v.replace(/'/g, "''")}'`).join(' ')} ELSE INITCAP(REPLACE(contas_pagar.categoria, '_', ' ')) END`;
// Endereço guardado em JSON (entrega_endereco / redespacho_endereco) como uma linha de texto.
const END_TEXTO = (c) => `NULLIF(CONCAT_WS(' — ', NULLIF(CONCAT_WS(', ', NULLIF(${c}->>'logradouro', ''), NULLIF(${c}->>'numero', ''), NULLIF(${c}->>'complemento', '')), ''),
  NULLIF(${c}->>'bairro', ''), NULLIF(CONCAT_WS('/', NULLIF(${c}->>'cidade', ''), NULLIF(${c}->>'uf', '')), ''), CASE WHEN ${c}->>'cep' ~ '^[0-9]{8}$' THEN 'CEP ' || LEFT(${c}->>'cep', 5) || '-' || RIGHT(${c}->>'cep', 3) END), '')`;
const LIMITE_LINHAS = 50000;
const LIMITE_GRUPOS = 5000;

// grupos: [{ grupo, campos: [[id, rótulo, { tipo?, sql? }]] }]
//   tipo: texto (padrão) | numero | inteiro | data | datahora | simnao; sql: expressão no lugar da coluna.
// datas: campos de data que servem de período no filtro; situacao: coluna de situação (filtro);
// busca: colunas da busca por texto; media: campos que o "automático" totaliza pela média.
const FONTES = {
  fretes: {
    nome: 'Fretes contratados (notas e CT-e recebidos)',
    tabela: 'fretes',
    media: ['percent_frete', 'cte_icms_aliquota', 'prazo_dias_tabela'],
    grupos: [
    { grupo: 'Identificação', campos: [
      ['numero_pedido', 'Número do Pedido'],
      ['pedido_mercus', 'Pedido Mercus'],
      ['numero_nf', 'Número NF'],
      ['nf_serie', 'Série da NF'],
      ['chave_nfe', 'Chave da NF-e'],
      ['numero_cte', 'Número CT-e'],
      ['cte_serie', 'Série do CT-e'],
      ['chave_cte', 'Chave do CT-e'],
      ['cte_protocolo', 'Protocolo do CT-e'],
      ['numero_fatura', 'Número da Fatura'],
      ['numero_mapa', 'Número do Mapa'],
    ] },
    { grupo: 'Datas', campos: [
      ['data_pedido', 'Data do Pedido', { tipo: 'data' }],
      ['data_emissao_nf', 'Data Emissão NF', { tipo: 'data' }],
      ['data_saida', 'Data/hora de saída da NF', { tipo: 'datahora' }],
      ['data_emissao_cte', 'Data Emissão CT-e', { tipo: 'data' }],
      ['data_fatura', 'Data da Fatura', { tipo: 'data' }],
      ['data_vencimento', 'Data de Vencimento', { tipo: 'data' }],
      ['data_coleta', 'Data da Coleta', { tipo: 'data' }],
      ['data_entrega', 'Data da Entrega', { tipo: 'data' }],
      ['data_entrega_prevista', 'Previsão de entrega', { tipo: 'data' }],
      ['data_entrega_final', 'Entrega final (redespacho)', { tipo: 'data' }],
      ['rastreio_entrega_agendada', 'Entrega agendada (rastreio)', { tipo: 'data' }],
      ['mapa_data_referencia', 'Data do Mapa', { tipo: 'data' }],
    ] },
    { grupo: 'Cliente e Destino', campos: [
      ['cliente', 'Cliente'],
      ['cliente_documento', 'CNPJ/CPF do Cliente'],
      ['cidade', 'Cidade'],
      ['bairro', 'Bairro'],
      ['uf', 'UF'],
      ['redespacho', 'Redespacho'],
      ['redespacho_cnpj', 'CNPJ do Redespacho'],
      ['cidade_redespacho', 'Cidade do Redespacho'],
      ['endereco_entrega', 'Endereço de entrega', { sql: END_TEXTO('fretes.entrega_endereco') }],
      ['endereco_redespacho', 'Endereço do redespacho', { sql: END_TEXTO('fretes.redespacho_endereco') }],
      ['endereco_origem', 'Origem do endereço', { sql: "CASE fretes.endereco_origem WHEN 'redespacho' THEN 'Redespacho' WHEN 'xml_entrega' THEN 'Local de entrega (XML)' WHEN 'dados_adicionais' THEN 'Dados adicionais' WHEN 'destinatario' THEN 'Destinatário' WHEN 'manual' THEN 'Corrigido à mão' END" }],
      ['endereco_conferir', 'Endereço a conferir', { tipo: 'simnao' }],
      ['endereco_conferir_motivo', 'Motivo para conferir o endereço'],
    ] },
    { grupo: 'Emitente e partes do CT-e', campos: [
      ['emitente_nome', 'Emitente da NF'],
      ['emitente_cnpj', 'CNPJ do Emitente'],
      ['cte_remetente_nome', 'Remetente (CT-e)'],
      ['cte_remetente_doc', 'CNPJ/CPF do Remetente'],
      ['cte_destinatario_nome', 'Destinatário (CT-e)'],
      ['cte_destinatario_doc', 'CNPJ/CPF do Destinatário'],
      ['tomador_cte_papel', 'Tomador (papel)'],
      ['tomador_cte_nome', 'Tomador'],
      ['tomador_cte_cnpj', 'CNPJ do Tomador'],
      ['cte_cidade_inicio', 'Cidade de início (CT-e)'],
      ['uf_inicio_cte', 'UF de início (CT-e)'],
      ['cte_cidade_fim', 'Cidade de fim (CT-e)'],
      ['uf_fim_cte', 'UF de fim (CT-e)'],
    ] },
    { grupo: 'Transportadora', campos: [
      ['transportadora', 'Transportadora'],
      ['transportadora_nfe', 'Transportadora da NF'],
      ['transportadora_cte', 'Transporte Cte'],
      ['transportadora_cnpj_cte', 'CNPJ da Transportadora (CT-e)'],
      ['transportadora_definida_por', 'Transportadora definida por'],
      ['tabela_frete', 'Tabela de Preço'],
      ['interior_capital', 'Interior ou Capital'],
      ['prazo_dias_tabela', 'Prazo da tabela (dias)', { tipo: 'inteiro' }],
      ['tipo_cte', 'Tipo do CT-e', { sql: 'CASE tipo_cte WHEN 0 THEN \'Normal\' WHEN 1 THEN \'Complemento\' WHEN 2 THEN \'Anulação\' WHEN 3 THEN \'Substituto\' END' }],
      ['tp_serv_cte', 'Tipo de serviço (CT-e)', { sql: 'CASE tp_serv_cte WHEN 0 THEN \'Normal\' WHEN 1 THEN \'Subcontratação\' WHEN 2 THEN \'Redespacho\' WHEN 3 THEN \'Redespacho intermediário\' WHEN 4 THEN \'Serviço vinculado a multimodal\' END' }],
      ['cte_modal', 'Modal', { sql: 'CASE cte_modal WHEN \'01\' THEN \'Rodoviário\' WHEN \'02\' THEN \'Aéreo\' WHEN \'03\' THEN \'Aquaviário\' WHEN \'04\' THEN \'Ferroviário\' WHEN \'05\' THEN \'Dutoviário\' WHEN \'06\' THEN \'Multimodal\' ELSE cte_modal END' }],
    ] },
    { grupo: 'Carga', campos: [
      ['tipo_carga', 'Tipo de Carga'],
      ['frete_cif_fob', 'Frete CIF/FOB'],
      ['qtd_volumes', 'Qtd. Volumes', { tipo: 'inteiro' }],
      ['peso_kg', 'Peso (kg)', { tipo: 'numero' }],
      ['peso_bruto', 'Peso bruto (kg)', { tipo: 'numero' }],
      ['peso_liquido', 'Peso líquido (kg)', { tipo: 'numero' }],
      ['cubagem_m3', 'Cubagem (m³)', { tipo: 'numero' }],
      ['itens_sem_medida', 'Itens sem medida', { tipo: 'inteiro' }],
      ['mapa_descricao', 'Descrição do Mapa'],
      ['mapa_ajudante', 'Ajudante do Mapa'],
    ] },
    { grupo: 'Valores', campos: [
      ['valor_produtos', 'Valor dos Produtos', { tipo: 'numero' }],
      ['valor_faturado', 'Valor Faturado', { tipo: 'numero' }],
      ['valor_frete_tabelado', 'Valor Frete Tabelado', { tipo: 'numero' }],
      ['valor_total_calculado', 'Valor Total Calculado', { tipo: 'numero' }],
      ['valor_frete_negociado', 'Valor Frete Negociado', { tipo: 'numero' }],
      ['valor_total_cte', 'Vlr. CT-e', { tipo: 'numero' }],
      ['valor_total_frete', 'Valor Total do Frete', { tipo: 'numero' }],
      ['frete_rateado', 'Frete rateado (CT-e de várias notas)', { tipo: 'numero' }],
      ['dif_negociado_tabela', 'Dif. Negociado x Tabela', { tipo: 'numero' }],
      ['percent_frete', '% Frete', { tipo: 'numero' }],
    ] },
    { grupo: 'Taxas', campos: [
      ['tde', 'TDE', { tipo: 'numero' }],
      ['tda', 'TDA', { tipo: 'numero' }],
      ['gris', 'GRIS', { tipo: 'numero' }],
      ['pedagio', 'Pedágio', { tipo: 'numero' }],
      ['trt', 'TRT', { tipo: 'numero' }],
      ['ad_valorem', 'Ad Valorem', { tipo: 'numero' }],
      ['reentrega', 'Reentrega', { tipo: 'numero' }],
      ['devolucao', 'Devolução', { tipo: 'numero' }],
      ['outras_despesas', 'Outras Despesas', { tipo: 'numero' }],
    ] },
    { grupo: 'Fiscal do CT-e', campos: [
      ['cte_cfop', 'CFOP do CT-e'],
      ['cte_icms_cst', 'CST do ICMS'],
      ['cte_icms_base', 'Base do ICMS', { tipo: 'numero' }],
      ['cte_icms_aliquota', 'Alíquota do ICMS (%)', { tipo: 'numero' }],
      ['cte_icms_valor', 'Valor do ICMS', { tipo: 'numero' }],
    ] },
    { grupo: 'Entrega e rastreio', campos: [
      ['sla_status', 'Situação do prazo (SLA)'],
      ['data_entrega_origem', 'Origem da data de entrega'],
      ['rastreio_ultima_ocorrencia', 'Última ocorrência (rastreio)'],
      ['rastreio_ultima_em', 'Data da última ocorrência', { tipo: 'datahora' }],
      ['rastreio_problema', 'Problema no rastreio', { tipo: 'simnao' }],
      ['canhoto', 'Tem canhoto', { sql: SIMNAO('(canhoto_foto_arquivo IS NOT NULL OR canhoto_assinatura IS NOT NULL)') }],
      ['canhoto_recebido_por', 'Recebido por (canhoto)'],
      ['canhoto_registrado_em', 'Canhoto registrado em', { tipo: 'datahora' }],
    ] },
    { grupo: 'Status e Glosa', campos: [
      ['status', 'Status'],
      ['status_aprovacao', 'Aprovação'],
      ['aprovado_por_nome', 'Aprovado por'],
      ['aprovado_em', 'Aprovado em', { tipo: 'datahora' }],
      ['motivo_rejeicao', 'Motivo da rejeição'],
      ['justificativa_aprovacao', 'Justificativa da aprovação'],
      ['glosa_valor', 'Valor da Glosa', { tipo: 'numero' }],
      ['glosa_motivo', 'Motivo da Glosa'],
      ['glosa_registrada_por', 'Glosa registrada por'],
      ['motivo_conferencia', 'Motivo da conferência'],
      ['observacoes', 'Observações'],
    ] },
    { grupo: 'Situações da nota e do CT-e', campos: [
      ['nf_cancelada', 'NF cancelada', { tipo: 'simnao' }],
      ['nf_denegada', 'NF denegada', { tipo: 'simnao' }],
      ['nf_devolvida', 'NF devolvida', { tipo: 'simnao' }],
      ['nf_complementar', 'NF complementar', { tipo: 'simnao' }],
      ['nf_entrada', 'NF de entrada', { tipo: 'simnao' }],
      ['nf_sem_circulacao', 'NF sem circulação', { tipo: 'simnao' }],
      ['frete_por_conta_cliente', 'Frete por conta do cliente', { tipo: 'simnao' }],
      ['carga_direta', 'Carga direta', { tipo: 'simnao' }],
      ['cte_cancelado', 'CT-e cancelado', { tipo: 'simnao' }],
      ['cte_cancelado_em', 'CT-e cancelado em', { tipo: 'data' }],
      ['cte_cancelado_motivo', 'Motivo do cancelamento do CT-e'],
      ['cte_nao_levou', 'CT-e não levou a nota', { tipo: 'simnao' }],
      ['alerta_cobranca_dupla', 'Alerta de cobrança dupla', { tipo: 'simnao' }],
      ['alerta_transportadora_diferente', 'Alerta de transportadora diferente', { tipo: 'simnao' }],
    ] },
    ],
  },

  ctes: {
    nome: 'CT-e emitidos (transportadora)',
    tabela: 'ctes_emitidos',
    rota: '/api/cte-emissao',
    chaves: ['pode_emitir_cte', 'pode_ver_financeiro'],
    base: 'NOT COALESCE(ctes_emitidos.demonstracao, FALSE)',
    unidades: ['unidade_origem_id', 'unidade_atual_id', 'unidade_destino_id'],
    datas: [['autorizado_em', 'Autorização'], ['criado_em', 'Criação'], ['previsao_entrega', 'Previsão de entrega'], ['data_entrega', 'Entrega']],
    situacao: 'status',
    busca: ['tomador_nome', 'remetente_nome', 'destinatario_nome', 'chave', 'numero::text', 'cidade_fim'],
    grupos: [
      { grupo: 'Identificação', campos: [
        ['numero', 'Número', { sql: 'ctes_emitidos.numero::text' }], ['serie', 'Série', { sql: 'ctes_emitidos.serie::text' }], ['chave', 'Chave'],
        ['protocolo', 'Protocolo'], ['status', 'Situação', { sql: ROTULO_STATUS('ctes_emitidos.status') }],
        ['ambiente', 'Ambiente', { sql: "CASE ctes_emitidos.ambiente WHEN 1 THEN 'Produção' WHEN 2 THEN 'Homologação' END" }],
        ['cstat', 'Código SEFAZ (cStat)'], ['motivo', 'Retorno da SEFAZ'], ['substituido', 'Substituído', { sql: SIMNAO('ctes_emitidos.substituido_por IS NOT NULL') }],
      ] },
      { grupo: 'Datas', campos: [
        ['autorizado_em', 'Autorizado em', { tipo: 'datahora' }], ['criado_em', 'Criado em', { tipo: 'datahora' }],
        ['previsao_original', 'Previsão original', { tipo: 'data' }], ['previsao_entrega', 'Previsão de entrega', { tipo: 'data' }],
        ['data_entrega', 'Entregue em', { tipo: 'datahora' }],
      ] },
      { grupo: 'Partes e destino', campos: [
        ['tomador_nome', 'Tomador'], ['remetente_nome', 'Remetente'], ['destinatario_nome', 'Destinatário'], ['cidade_fim', 'Cidade de destino'], ['uf_fim', 'UF de destino'],
      ] },
      { grupo: 'Valores', campos: [['valor_total', 'Valor do CT-e', { tipo: 'numero' }], ['prazo_dias', 'Prazo (dias)', { tipo: 'inteiro' }]] },
      { grupo: 'Entrega e seguro', campos: [
        ['situacao_entrega', 'Situação da entrega', { sql: ROTULO_STATUS('ctes_emitidos.situacao_entrega') }], ['recebedor_nome', 'Recebido por'],
        ['recebedor_documento', 'Documento de quem recebeu'], ['averbacao_status', 'Averbação', { sql: ROTULO_STATUS('ctes_emitidos.averbacao_status') }],
      ] },
      { grupo: 'Faturamento, filial e vendedor', campos: [
        ['faturado', 'Faturado', { sql: SIMNAO('ctes_emitidos.fatura_id IS NOT NULL') }],
        ['fatura_numero', 'Nº da fatura', { sql: '(SELECT f.numero::text FROM faturas_transporte f WHERE f.id = ctes_emitidos.fatura_id)' }],
        ['unidade_origem', 'Filial de origem', { sql: '(SELECT u.nome FROM unidades u WHERE u.id = ctes_emitidos.unidade_origem_id)' }],
        ['unidade_destino', 'Filial de destino', { sql: '(SELECT u.nome FROM unidades u WHERE u.id = ctes_emitidos.unidade_destino_id)' }],
        ['vendedor', 'Vendedor', { sql: '(SELECT v.nome FROM vendedores v WHERE v.id = ctes_emitidos.vendedor_id)' }],
        ['criado_por_nome', 'Emitido por'],
      ] },
    ],
  },

  receber: {
    nome: 'Faturas a receber (transportadora)',
    tabela: 'faturas_transporte',
    rota: '/api/faturamento',
    chaves: ['pode_ver_financeiro'],
    base: 'NOT COALESCE(faturas_transporte.demonstracao, FALSE)',
    datas: [['emissao', 'Emissão'], ['vencimento', 'Vencimento'], ['enviada_em', 'Envio ao cliente']],
    situacao: 'status',
    busca: ['tomador_nome', 'tomador_doc', 'numero::text'],
    grupos: [
      { grupo: 'Fatura', campos: [
        ['numero', 'Número', { sql: 'faturas_transporte.numero::text' }], ['status', 'Situação', { sql: ROTULO_STATUS('faturas_transporte.status') }],
        ['vencida', 'Vencida', { sql: SIMNAO("(faturas_transporte.status IN ('aberta', 'parcial') AND faturas_transporte.vencimento < CURRENT_DATE)") }],
        ['dias_atraso', 'Dias de atraso', { tipo: 'inteiro', sql: "CASE WHEN faturas_transporte.status IN ('aberta', 'parcial') AND faturas_transporte.vencimento < CURRENT_DATE THEN CURRENT_DATE - faturas_transporte.vencimento END" }],
        ['qtd_ctes', 'Qtd. de CT-e', { tipo: 'inteiro', sql: '(SELECT COUNT(*) FROM ctes_emitidos c WHERE c.fatura_id = faturas_transporte.id)::int' }],
        ['observacoes', 'Observações'], ['criado_por_nome', 'Criada por'],
      ] },
      { grupo: 'Cliente', campos: [['tomador_nome', 'Cliente (tomador)'], ['tomador_doc', 'CNPJ/CPF'], ['tomador_email', 'E-mail']] },
      { grupo: 'Datas', campos: [
        ['emissao', 'Emissão', { tipo: 'data' }], ['vencimento', 'Vencimento', { tipo: 'data' }], ['enviada_em', 'Enviada em', { tipo: 'datahora' }],
        ['cancelada_em', 'Cancelada em', { tipo: 'datahora' }],
      ] },
      { grupo: 'Valores', campos: [
        ['valor_bruto', 'Valor bruto', { tipo: 'numero' }], ['desconto', 'Desconto', { tipo: 'numero' }],
        ['valor_liquido', 'Valor líquido', { tipo: 'numero', sql: '(faturas_transporte.valor_bruto - COALESCE(faturas_transporte.desconto, 0))' }],
        ['valor_pago', 'Valor recebido', { tipo: 'numero' }],
        ['saldo', 'Saldo a receber', { tipo: 'numero', sql: "CASE WHEN faturas_transporte.status IN ('aberta', 'parcial') THEN faturas_transporte.valor_bruto - COALESCE(faturas_transporte.desconto, 0) - COALESCE(faturas_transporte.valor_pago, 0) ELSE 0 END" }],
      ] },
      { grupo: 'Boleto e cobrança', campos: [
        ['boleto_banco', 'Banco do boleto'], ['boleto_nn_exibir', 'Nosso número'], ['boleto_status', 'Situação do boleto', { sql: ROTULO_STATUS('faturas_transporte.boleto_status') }],
        ['boleto_vencimento', 'Vencimento do boleto', { tipo: 'data' }], ['cobranca_pausada_ate', 'Cobrança pausada até', { tipo: 'data' }], ['motivo_cancelamento', 'Motivo do cancelamento'],
      ] },
    ],
  },

  faturas_transportadoras: {
    nome: 'Faturas das transportadoras (embarcador)',
    tabela: 'faturas_frete',
    rota: '/api/faturas',
    chaves: ['pode_conferir_fatura', 'pode_aprovar_pagamento', 'pode_ver_financeiro', 'pode_ver_auditoria'],
    vePotudo: true,
    datas: [['data_emissao', 'Emissão'], ['data_vencimento', 'Vencimento'], ['pago_em', 'Pagamento'], ['conferido_em', 'Conferência']],
    situacao: 'situacao',
    busca: ['numero', 'transportadora'],
    grupos: [
      { grupo: 'Fatura', campos: [
        ['numero', 'Número'], ['transportadora', 'Transportadora'], ['situacao', 'Situação', { sql: ROTULO_STATUS('faturas_frete.situacao') }],
        ['parecer', 'Parecer da conferência'], ['bloqueio_motivo', 'Motivo do bloqueio'], ['observacoes', 'Observações'],
      ] },
      { grupo: 'Datas', campos: [
        ['data_emissao', 'Emissão', { tipo: 'data' }], ['data_vencimento', 'Vencimento', { tipo: 'data' }], ['conferido_em', 'Conferida em', { tipo: 'datahora' }],
        ['aprovado_em', 'Aprovada em', { tipo: 'datahora' }], ['liberado_em', 'Liberada em', { tipo: 'datahora' }], ['pago_em', 'Paga em', { tipo: 'data' }],
      ] },
      { grupo: 'Valores', campos: [
        ['valor_informado', 'Valor da fatura', { tipo: 'numero' }], ['valor_ctes', 'Soma dos CT-e', { tipo: 'numero' }], ['qtd_ctes', 'Qtd. de CT-e', { tipo: 'inteiro' }],
        ['total_tabela', 'Total pela tabela', { tipo: 'numero' }],
        ['diferenca_tabela', 'Diferença fatura × tabela', { tipo: 'numero', sql: '(faturas_frete.valor_informado - faturas_frete.total_tabela)' }],
        ['total_glosas', 'Glosas', { tipo: 'numero' }], ['total_icms', 'ICMS', { tipo: 'numero' }], ['valor_pago', 'Valor pago', { tipo: 'numero' }],
      ] },
      { grupo: 'Quem fez', campos: [['conferido_por_nome', 'Conferida por'], ['aprovado_por', 'Aprovada por'], ['liberado_por', 'Liberada por'], ['pago_por', 'Paga por'], ['pagamento_obs', 'Observação do pagamento']] },
    ],
  },

  pagar: {
    nome: 'Contas a pagar',
    tabela: 'contas_pagar',
    rota: '/api/contas-pagar',
    chaves: ['pode_ver_financeiro'],
    unidades: ['unidade_id'],
    datas: [['vencimento', 'Vencimento'], ['pago_em', 'Pagamento'], ['competencia', 'Competência'], ['criado_em', 'Lançamento']],
    situacao: 'status',
    busca: ['descricao', 'fornecedor_nome', 'fornecedor_doc', 'documento'],
    grupos: [
      { grupo: 'Conta', campos: [
        ['descricao', 'Descrição'], ['categoria', 'Categoria', { sql: CATEGORIA_CONTA }], ['documento', 'Documento'], ['parcela', 'Parcela'],
        ['status', 'Situação', { sql: ROTULO_STATUS('contas_pagar.status') }],
        ['vencida', 'Vencida', { sql: SIMNAO("(contas_pagar.status = 'aberta' AND contas_pagar.vencimento < CURRENT_DATE)") }],
        ['acerto_id', 'Acerto de viagem', { sql: 'contas_pagar.acerto_id::text' }], ['observacao', 'Observação'], ['criado_por_nome', 'Lançada por'],
      ] },
      { grupo: 'Fornecedor', campos: [['fornecedor_nome', 'Fornecedor'], ['fornecedor_doc', 'CNPJ/CPF do fornecedor']] },
      { grupo: 'Datas', campos: [
        ['vencimento', 'Vencimento', { tipo: 'data' }], ['competencia', 'Competência', { tipo: 'data' }], ['pago_em', 'Paga em', { tipo: 'data' }],
        ['criado_em', 'Lançada em', { tipo: 'datahora' }], ['cancelada_em', 'Cancelada em', { tipo: 'datahora' }],
      ] },
      { grupo: 'Valores', campos: [
        ['valor', 'Valor', { tipo: 'numero' }], ['valor_pago', 'Valor pago', { tipo: 'numero' }],
        ['saldo', 'Saldo a pagar', { tipo: 'numero', sql: "CASE WHEN contas_pagar.status = 'aberta' THEN contas_pagar.valor - COALESCE(contas_pagar.valor_pago, 0) ELSE 0 END" }],
      ] },
      { grupo: 'Classificação', campos: [
        ['centro_custo', 'Centro de custo', { sql: '(SELECT c.nome FROM centros_custo c WHERE c.id = contas_pagar.centro_custo_id)' }],
        ['departamento', 'Departamento', { sql: '(SELECT d.nome FROM departamentos d WHERE d.id = contas_pagar.departamento_id)' }],
        ['unidade', 'Filial', { sql: '(SELECT u.nome FROM unidades u WHERE u.id = contas_pagar.unidade_id)' }],
      ] },
    ],
  },

  acertos: {
    nome: 'Acertos de viagem',
    tabela: 'acertos',
    rota: '/api/acertos',
    chaves: ['pode_ver_financeiro', 'pode_emitir_cte'],
    datas: [['data_saida', 'Saída'], ['acertado_em', 'Fechamento do acerto']],
    situacao: 'status',
    busca: ['motorista_nome', 'proprietario_nome', 'placa', 'descricao', 'ciot'],
    grupos: [
      { grupo: 'Viagem', campos: [
        ['id', 'Nº do acerto', { sql: 'acertos.id::text' }], ['tipo', 'Tipo', { sql: "CASE acertos.tipo WHEN 'proprio' THEN 'Motorista próprio' WHEN 'terceiro' THEN 'Terceiro / agregado' END" }],
        ['status', 'Situação', { sql: ROTULO_STATUS('acertos.status') }], ['descricao', 'Rota / descrição'], ['placa', 'Placa'],
        ['mdfe', 'MDF-e', { sql: "(SELECT m.serie::text || '/' || m.numero::text FROM mdfes m WHERE m.id = acertos.mdfe_id)" }], ['ciot', 'CIOT'],
      ] },
      { grupo: 'Pessoas', campos: [
        ['motorista_nome', 'Motorista'], ['motorista_cpf', 'CPF do motorista'], ['proprietario_nome', 'Contratado'], ['proprietario_doc', 'CPF/CNPJ do contratado'], ['rntrc', 'RNTRC'],
      ] },
      { grupo: 'Datas', campos: [['data_saida', 'Saída', { tipo: 'data' }], ['acertado_em', 'Acertado em', { tipo: 'datahora' }], ['acertado_por_nome', 'Acertado por']] },
      { grupo: 'Valores', campos: [
        ['valor_frete', 'Frete contratado', { tipo: 'numero' }], ['adiantamento', 'Adiantamento', { tipo: 'numero' }], ['inss', 'INSS retido', { tipo: 'numero' }],
        ['sest_senat', 'SEST/SENAT retido', { tipo: 'numero' }], ['irrf', 'IRRF retido', { tipo: 'numero' }], ['vale_pedagio_valor', 'Vale-pedágio', { tipo: 'numero' }],
        ['saldo', 'Saldo do acerto', { tipo: 'numero' }],
      ] },
      { grupo: 'Piso mínimo da ANTT', campos: [
        ['piso_valor', 'Piso ANTT', { tipo: 'numero' }], ['piso_km', 'Distância (km)', { tipo: 'numero' }],
        ['abaixo_piso', 'Frete abaixo do piso', { sql: SIMNAO("(acertos.tipo = 'terceiro' AND acertos.piso_valor IS NOT NULL AND acertos.valor_frete < acertos.piso_valor)") }],
        ['piso_resolucao', 'Resolução usada'],
      ] },
    ],
  },
};

// Índice campo → definição, por fonte.
for (const f of Object.values(FONTES)) {
  f.campos = {};
  f.grupos.forEach((g) => g.campos.forEach(([id, rotulo, d = {}]) => { f.campos[id] = { rotulo, tipo: d.tipo || 'texto', sql: d.sql || null }; }));
  f.media = new Set(f.media || []);
}

// ---------- Quem pode usar cada fonte ----------
function podeFonte(u, id) {
  const f = FONTES[id];
  if (!f || !u) return false;
  if (u.perfil === 'admin') return true;
  if (id === 'fretes') return true;   // os fretes já respeitam o cliente do usuário (consultaCliente)
  if (u.perfil === 'cliente') return false;
  if (!(f.chaves || []).some((k) => u[k])) return false;
  if (f.vePotudo && !permissoes.vePotudo({ usuario: u })) return false;
  if (permissoes.moduloBloqueado(u, permissoes.moduloDaRota(f.rota))) return false;
  if (require('./acessoTelas').conferir(u, 'GET', f.rota)) return false;
  return true;
}
// O que a tela precisa para montar a escolha de campos e os filtros de cada fonte.
function fontesDo(u) {
  return Object.entries(FONTES).filter(([id]) => podeFonte(u, id)).map(([id, f]) => ({
    id, nome: f.nome, datas: f.datas || [], situacao: !!f.situacao, busca: !!(f.busca || []).length,
    grupos: f.grupos.map((g) => ({ grupo: g.grupo, campos: g.campos.map(([c, r, d = {}]) => [c, r, d.tipo || 'texto']) })),
  }));
}

// ---------- Expressões ----------
const ehNumero = (f, c) => ['numero', 'inteiro'].includes(f.campos[c]?.tipo);
const ehData = (f, c) => ['data', 'datahora'].includes(f.campos[c]?.tipo);
const col = (f, c) => `${f.tabela}."${c}"`;
// Para a tela: datas em dd/mm/aaaa. Para a planilha (iso): aaaa-mm-dd, que vira data de verdade no Excel.
function expressao(f, c, iso = false) {
  const d = f.campos[c];
  if (d.sql) return d.sql;
  if (d.tipo === 'data') return `to_char(${col(f, c)}, '${iso ? 'YYYY-MM-DD' : 'DD/MM/YYYY'}')`;
  if (d.tipo === 'datahora') return `to_char(${col(f, c)}, '${iso ? 'YYYY-MM-DD HH24:MI' : 'DD/MM/YYYY HH24:MI'}')`;
  if (d.tipo === 'simnao') return SIMNAO(col(f, c));
  return col(f, c);
}
const bruto = (f, c) => f.campos[c].sql || col(f, c);   // sem formatar (ordenar, totalizar)

// ---------- Filtros ----------
const dataOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
function filtrosFretes(q) {
  const condicoes = []; const valores = [];
  const add = (sql, v) => { valores.push(v); condicoes.push(sql.replace(/\$\?/g, `$${valores.length}`)); };
  if (q.transportadora) add('(transportadora_cte ILIKE $? OR transportadora ILIKE $?)', `%${String(q.transportadora).trim()}%`);
  if (q.cliente) {
    const doc = String(q.cliente).replace(/\D/g, '');
    if (doc.length >= 8 && /^[\d./\s-]+$/.test(String(q.cliente).trim())) add("REGEXP_REPLACE(COALESCE(cliente_documento, ''), '[^0-9]', '', 'g') LIKE $?", `${doc}%`);
    else add('cliente ILIKE $?', `%${String(q.cliente).trim()}%`);
  }
  if (/^[A-Za-z]{2}$/.test(String(q.uf || '').trim())) add('uf = $?', String(q.uf).trim().toUpperCase());
  if (q.status) add('status = $?', q.status);
  if (['Aprovado', 'Pendente', 'Rejeitado'].includes(q.aprovacao)) add('status_aprovacao = $?', q.aprovacao);
  [['data_de', 'data_emissao_nf', '>='], ['data_ate', 'data_emissao_nf', '<='], ['cte_de', 'data_emissao_cte', '>='], ['cte_ate', 'data_emissao_cte', '<='],
    ['entrega_de', 'data_entrega', '>='], ['entrega_ate', 'data_entrega', '<=']].forEach(([k, c, op]) => { if (dataOk(q[k])) add(`${c} ${op} $?`, dataOk(q[k])); });
  if (q.divergencia === '1') condicoes.push('(valor_frete_negociado IS NOT NULL AND ABS(COALESCE(dif_negociado_tabela, 0)) >= 0.01)');
  if (q.glosa === '1') condicoes.push('COALESCE(glosa_valor, 0) > 0');
  return { condicoes, valores };
}
// Outras fontes: período (num dos campos de data da fonte), situação e busca por texto.
function filtrosFonte(f, q, u) {
  const condicoes = []; const valores = [];
  const add = (sql, v) => { valores.push(v); condicoes.push(sql.replace(/\$\?/g, `$${valores.length}`)); };
  if (f.base) condicoes.push(f.base);
  if (f.unidades) condicoes.push(permissoes.condicaoUnidades({ usuario: u }, f.unidades.map((c) => `${f.tabela}.${c}`), valores));
  const campoData = (f.datas || []).find(([c]) => c === q.periodo_campo)?.[0] || f.datas?.[0]?.[0];
  if (campoData) {
    // datahora: o dia inteiro do "até".
    if (dataOk(q.de)) add(`${col(f, campoData)} >= $?::date`, dataOk(q.de));
    if (dataOk(q.ate)) add(`${col(f, campoData)} < $?::date + 1`, dataOk(q.ate));
  }
  if (f.situacao && q.situacao) add(`${f.tabela}.${f.situacao} = $?`, String(q.situacao).slice(0, 40));
  if (f.busca?.length && String(q.busca || '').trim()) add(`(${f.busca.map((c) => `${f.tabela}.${c.replace('::text', '')}${c.includes('::text') ? '::text' : ''} ILIKE $?`).join(' OR ')})`, `%${String(q.busca).trim().slice(0, 100)}%`);
  return { condicoes, valores };
}
// Valores de situação que existem (para a lista do filtro).
async function situacoes(u, fonte) {
  const f = FONTES[fonte];
  if (!f?.situacao || !podeFonte(u, fonte)) return [];
  const { rows } = await pool.query(`SELECT DISTINCT ${f.situacao} AS v FROM ${f.tabela} WHERE ${f.situacao} IS NOT NULL ORDER BY 1 LIMIT 50`);
  return rows.map((r) => r.v);
}

// ---------- Agrupar e totalizar ----------
const FUNCOES = { soma: ['SUM', 'Soma'], media: ['AVG', 'Média'], min: ['MIN', 'Mínimo'], max: ['MAX', 'Máximo'] };
const PERIODOS = { dia: ['YYYY-MM-DD', 'dia'], mes: ['YYYY-MM', 'mês'], ano: ['YYYY', 'ano'] };
const grupoSql = (f, c, periodo) => (ehData(f, c) ? `to_char(${col(f, c)}, '${PERIODOS[periodo][0]}')` : expressao(f, c));
function metrica(f, c, total) {
  const fn = FUNCOES[total] ? total : (f.media.has(c) ? 'media' : 'soma');
  const inteiro = f.campos[c].tipo === 'inteiro' && fn !== 'media';
  return { f: fn, tipo: inteiro ? 'inteiro' : 'numero', sql: `ROUND(${FUNCOES[fn][0]}(${bruto(f, c)})::numeric, ${inteiro ? 0 : 2})` };
}
const chave = (v, data) => (v == null || v === '' ? '(em branco)' : data ? String(v).split('-').reverse().join('/') : v);
function lerRotulos(q) {
  if (q.rotulos && typeof q.rotulos === 'object') return q.rotulos;
  try { const r = JSON.parse(q.rotulos || '{}'); return r && typeof r === 'object' && !Array.isArray(r) ? r : {}; } catch { return {}; }
}

// Monta e roda o relatório. u = usuário (o da tela ou o dono do modelo, no envio automático).
// Devolve { fonte, agrupado, colunas: [{ id, rotulo, tipo, papel }], linhas, total, cortado, limite }.
async function gerar(u, q = {}, { iso = false } = {}) {
  const fonte = FONTES[q.fonte] ? q.fonte : 'fretes';
  if (!podeFonte(u, fonte)) throw Object.assign(new Error('Seu usuário não pode ver esta fonte de dados.'), { status: 403 });
  const f = FONTES[fonte];
  const pedidos = (Array.isArray(q.campos) ? q.campos : String(q.campos || '').split(',')).map((c) => String(c).trim()).filter(Boolean);
  const campos = [...new Set(pedidos.filter((c) => f.campos[c]))];
  const agrupar = [...new Set([q.agrupar, q.agrupar2].filter((c) => f.campos[c] && !ehNumero(f, c)))];
  if (!campos.length && !agrupar.length) throw Object.assign(new Error('Selecione pelo menos um campo.'), { status: 400 });
  const rot = lerRotulos(q);
  const rotulo = (c) => String(rot[c] || f.campos[c].rotulo).slice(0, 80);
  const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
  const { condicoes, valores } = fonte === 'fretes' ? filtrosFretes(q) : filtrosFonte(f, q, u);
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const consultar = (sql) => (fonte === 'fretes' ? permissoes.consultaCliente({ usuario: u }, sql, valores) : pool.query(sql, valores));
  let colunas; let linhas; let total = null; let limite;

  if (agrupar.length) {
    limite = LIMITE_GRUPOS;
    const periodo = PERIODOS[q.periodo] ? q.periodo : 'mes';
    const metricas = campos.filter((c) => ehNumero(f, c)).map((c) => ({ c, ...metrica(f, c, q.total) }));
    colunas = [
      ...agrupar.map((c, i) => ({ id: `g${i + 1}`, campo: c, papel: 'grupo', tipo: 'texto', rotulo: `${rotulo(c)}${ehData(f, c) ? ` (${PERIODOS[periodo][1]})` : ''}` })),
      { id: 'qtd', campo: 'qtd', papel: 'qtd', tipo: 'inteiro', rotulo: 'Qtd. de registros' },
      ...metricas.map((m) => ({ id: m.c, campo: m.c, papel: 'metrica', funcao: m.f, tipo: m.tipo, rotulo: `${FUNCOES[m.f][1]} de ${rotulo(m.c)}` })),
    ];
    const alvo = colunas.find((x) => x.campo === q.ordem);
    const ordem = alvo ? `${alvo.papel === 'metrica' ? `"${alvo.id}"` : alvo.id} ${dir} NULLS LAST` : (ehData(f, agrupar[0]) ? 'g1 ASC NULLS LAST' : 'qtd DESC');
    const metricasSql = metricas.map((m) => `, ${m.sql} AS "${m.c}"`).join('');
    const { rows } = await consultar(`SELECT ${agrupar.map((c, i) => `${grupoSql(f, c, periodo)} AS g${i + 1}`).join(', ')}, COUNT(*)::int AS qtd${metricasSql}
      FROM ${f.tabela} ${where} GROUP BY ${agrupar.map((_, i) => i + 1).join(', ')} ORDER BY ${ordem}, g1 LIMIT ${limite + 1}`);
    linhas = rows.map((r) => { agrupar.forEach((c, i) => { r[`g${i + 1}`] = chave(r[`g${i + 1}`], ehData(f, c)); }); return r; });
    total = (await consultar(`SELECT COUNT(*)::int AS qtd${metricasSql} FROM ${f.tabela} ${where}`)).rows[0];
  } else {
    limite = LIMITE_LINHAS;
    colunas = campos.map((c) => ({ id: c, campo: c, papel: 'campo', tipo: f.campos[c].tipo, rotulo: rotulo(c) }));
    const ordem = f.campos[q.ordem] ? `${bruto(f, q.ordem)} ${dir} NULLS LAST, ${f.tabela}.id DESC` : `${f.tabela}.id DESC`;
    const { rows } = await consultar(`SELECT ${campos.map((c) => `${expressao(f, c, iso)} AS "${c}"`).join(', ')} FROM ${f.tabela} ${where} ORDER BY ${ordem} LIMIT ${limite + 1}`);
    linhas = rows;
  }
  // Uma linha a mais que o limite = havia mais registros do que cabe.
  const cortado = linhas.length > limite;
  if (cortado) linhas = linhas.slice(0, limite);
  return { fonte, fonteNome: f.nome, agrupado: !!agrupar.length, colunas, linhas, total, cortado, limite };
}

// ---------- Planilha .xlsx ----------
// Números como número, datas como data do Excel (dá para somar, filtrar e montar tabela dinâmica).
function planilha({ colunas, linhas, total, cortado, limite }) {
  const XLSX = require('xlsx');
  const serial = (t) => { const m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 86400000 + 25569 : null; };
  const todas = total ? [...linhas, { ...total, [colunas[0].id]: 'TOTAL GERAL' }] : linhas;
  if (cortado) todas.push({ [colunas[0].id]: `Atenção: o relatório parou em ${limite.toLocaleString('pt-BR')} ${total ? 'grupos' : 'linhas'}. Use filtros (ex.: um período menor) para ver tudo.` });
  const folha = XLSX.utils.aoa_to_sheet([colunas.map((c) => c.rotulo)]);
  todas.forEach((l, r) => colunas.forEach((c, i) => {
    const v = l[c.id];
    if (v == null || v === '') return;
    const ref = XLSX.utils.encode_cell({ r: r + 1, c: i });
    if ((c.tipo === 'numero' || c.tipo === 'inteiro') && typeof v !== 'string' || ((c.tipo === 'numero' || c.tipo === 'inteiro') && /^-?\d+(\.\d+)?$/.test(String(v)))) {
      folha[ref] = { t: 'n', v: Number(v), z: c.tipo === 'inteiro' ? '#,##0' : '#,##0.00' };
    } else if ((c.tipo === 'data' || c.tipo === 'datahora') && serial(v) != null) {
      folha[ref] = { t: 'n', v: serial(v), z: c.tipo === 'data' ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm' };
    } else folha[ref] = { t: 's', v: String(v) };
  }));
  folha['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: todas.length, c: colunas.length - 1 } });
  folha['!cols'] = colunas.map((c) => ({ wch: Math.min(50, Math.max(10, String(c.rotulo).length + 2, ...todas.slice(0, 200).map((l) => String(l[c.id] ?? '').length + 2))) }));
  folha['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: colunas.length - 1 } }) };
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, folha, 'Relatório');
  return XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' });
}
const nomeArquivo = (nome) => `${String(nome || 'relatorio-personalizado').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 60) || 'relatorio'}.xlsx`;

// ---------- Modelos salvos ----------
const FILTROS = ['transportadora', 'cliente', 'uf', 'status', 'aprovacao', 'data_de', 'data_ate', 'cte_de', 'cte_ate', 'entrega_de', 'entrega_ate', 'divergencia', 'glosa',
  'periodo_campo', 'de', 'ate', 'situacao', 'busca', 'ordem', 'dir', 'agrupar', 'agrupar2', 'periodo', 'total'];
const PERIODOS_ENVIO = {
  salvo: 'O período salvo no modelo', ontem: 'Ontem', ultimos7: 'Últimos 7 dias (até ontem)', semana_anterior: 'Semana anterior (segunda a domingo)',
  mes_atual: 'Mês atual (até hoje)', mes_anterior: 'Mês anterior', ultimos30: 'Últimos 30 dias (até ontem)',
};
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function lerEnvio(e) {
  if (!e || typeof e !== 'object' || !e.ativo) return { ativo: false };
  const para = String(e.para || '').split(/[;,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!para.length) return { erro: 'Informe pelo menos um e-mail para o envio automático.' };
  const ruins = para.filter((x) => !emailOk(x));
  if (ruins.length) return { erro: `E-mail inválido: ${ruins.join(', ')}.` };
  if (para.length > 20) return { erro: 'No máximo 20 e-mails por modelo.' };
  const frequencia = ['diaria', 'semanal', 'mensal'].includes(e.frequencia) ? e.frequencia : 'semanal';
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(e.hora || '')) ? e.hora : '08:00';
  return {
    ativo: true, para: [...new Set(para)].join(', '), frequencia, hora,
    dia_semana: Math.min(Math.max(parseInt(e.dia_semana, 10) || 1, 0), 6),
    dia_mes: Math.min(Math.max(parseInt(e.dia_mes, 10) || 1, 1), 28),
    dias_uteis: e.dias_uteis === true,
    periodo: PERIODOS_ENVIO[e.periodo] ? e.periodo : 'salvo',
  };
}
// Próximo envio depois de "depois" (hora local do servidor).
function proximoEnvio(e, depois = new Date()) {
  if (!e?.ativo) return null;
  const [h, m] = e.hora.split(':').map(Number);
  const d = new Date(depois.getFullYear(), depois.getMonth(), depois.getDate(), h, m, 0, 0);
  for (let i = 0; i < 400; i++) {
    const ok = e.frequencia === 'diaria' ? !(e.dias_uteis && [0, 6].includes(d.getDay()))
      : e.frequencia === 'semanal' ? d.getDay() === e.dia_semana
        : d.getDate() === e.dia_mes;
    if (ok && d > depois) return d;
    d.setDate(d.getDate() + 1);
  }
  return null;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function periodoRelativo(tipo, hoje = new Date()) {
  const dia = (n) => { const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()); d.setDate(d.getDate() + n); return d; };
  switch (tipo) {
    case 'ontem': return [iso(dia(-1)), iso(dia(-1))];
    case 'ultimos7': return [iso(dia(-7)), iso(dia(-1))];
    case 'ultimos30': return [iso(dia(-30)), iso(dia(-1))];
    case 'semana_anterior': { const seg = dia(-((hoje.getDay() + 6) % 7) - 7); const dom = new Date(seg); dom.setDate(seg.getDate() + 6); return [iso(seg), iso(dom)]; }
    case 'mes_atual': return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), iso(hoje)];
    case 'mes_anterior': return [iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0))];
    default: return null;
  }
}
// Parâmetros do relatório a partir do modelo (com o período relativo do envio, se houver).
function parametrosDoModelo(m, comPeriodo = true) {
  const q = { fonte: m.fonte || 'fretes', campos: m.campos, ...(m.filtros || {}) };
  const p = comPeriodo ? periodoRelativo(m.envio?.periodo) : null;
  if (p) { if (q.fonte === 'fretes') { [q.data_de, q.data_ate] = p; } else { [q.de, q.ate] = p; } }
  return q;
}

// ---------- Envio por e-mail ----------
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function celulaHtml(c, v) {
  if (v == null || v === '') return '—';
  if (c.tipo === 'numero') return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (c.tipo === 'inteiro') return Number(v).toLocaleString('pt-BR');
  if ((c.tipo === 'data' || c.tipo === 'datahora') && /^\d{4}-\d{2}-\d{2}/.test(String(v))) { const [d, h] = String(v).split(' '); return `${d.split('-').reverse().join('/')}${h ? ` ${h}` : ''}`; }
  return esc(v);
}
async function enviarModelo(modelo, { manual = false } = {}) {
  const { rows: [u] } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [modelo.usuario_id]);
  if (!u || !u.ativo) throw new Error('O dono do modelo não está mais ativo.');
  if (u.perfil !== 'admin' && !u.pode_ver_relatorios) throw new Error('O dono do modelo não tem mais acesso a Relatórios.');
  const q = parametrosDoModelo(modelo);
  const r = await gerar(u, q, { iso: true });
  const periodo = q.fonte === 'fretes' ? [q.data_de, q.data_ate] : [q.de, q.ate];
  const txtPeriodo = periodo[0] || periodo[1] ? `${periodo[0] ? periodo[0].split('-').reverse().join('/') : '…'} a ${periodo[1] ? periodo[1].split('-').reverse().join('/') : '…'}` : 'sem período';
  const amostra = r.linhas.slice(0, 30);
  const html = `<div style="font-family:Arial,sans-serif; font-size:14px; color:#1f2937;">
    <h2 style="margin:0 0 4px;">${esc(modelo.nome)}</h2>
    <p style="margin:0 0 12px; color:#6b7280;">${esc(r.fonteNome)} · ${esc(txtPeriodo)} · ${r.agrupado ? `${r.linhas.length} grupo(s), ${Number(r.total?.qtd || 0).toLocaleString('pt-BR')} registro(s)` : `${r.linhas.length.toLocaleString('pt-BR')} registro(s)`}</p>
    ${r.cortado ? `<p style="color:#b45309;"><b>Atenção:</b> o relatório parou em ${r.limite.toLocaleString('pt-BR')} ${r.agrupado ? 'grupos' : 'linhas'}. Use filtros no modelo para ver tudo.</p>` : ''}
    <table style="border-collapse:collapse; font-size:12.5px;"><thead><tr>${r.colunas.map((c) => `<th style="text-align:left; border-bottom:2px solid #d1d5db; padding:5px 8px;">${esc(c.rotulo)}</th>`).join('')}</tr></thead>
    <tbody>${amostra.map((l) => `<tr>${r.colunas.map((c) => `<td style="border-bottom:1px solid #e5e7eb; padding:4px 8px;${['numero', 'inteiro'].includes(c.tipo) ? ' text-align:right;' : ''}">${celulaHtml(c, l[c.id])}</td>`).join('')}</tr>`).join('')}
    ${r.total ? `<tr style="font-weight:bold;">${r.colunas.map((c, i) => `<td style="padding:5px 8px; border-top:2px solid #d1d5db;${['numero', 'inteiro'].includes(c.tipo) ? ' text-align:right;' : ''}">${i === 0 ? 'TOTAL GERAL' : c.papel === 'grupo' ? '' : celulaHtml(c, r.total[c.id])}</td>`).join('')}</tr>` : ''}</tbody></table>
    ${r.linhas.length > amostra.length ? `<p style="color:#6b7280;">Mostrando ${amostra.length} de ${r.linhas.length.toLocaleString('pt-BR')}: o relatório completo está na planilha anexa.</p>` : '<p style="color:#6b7280;">A planilha completa vai anexa.</p>'}
    <p style="color:#9ca3af; font-size:12px;">${manual ? 'Envio pedido agora' : 'Envio automático'} do modelo "${esc(modelo.nome)}" (Relatórios » Montar relatório), configurado por ${esc(u.nome)}.</p></div>`;
  const hoje = iso(new Date());
  await require('./email').enviarRelatorio({
    para: modelo.envio.para, assunto: `${modelo.nome} — ${txtPeriodo}`, html,
    anexos: [{ filename: nomeArquivo(`${modelo.nome}-${hoje}`), content: planilha(r) }],
  });
  return { linhas: r.linhas.length, cortado: r.cortado };
}
let rodando = false;
async function enviarAgendados() {
  if (rodando) return 0;
  rodando = true;
  let n = 0;
  try {
    const { rows } = await pool.query("SELECT * FROM bi_modelos WHERE (envio->>'ativo')::boolean AND proximo_envio <= NOW() ORDER BY proximo_envio LIMIT 20");
    for (const m of rows) {
      let status;
      try { const r = await enviarModelo(m); status = `Enviado para ${m.envio.para} (${r.linhas} linha(s)${r.cortado ? ', cortado no limite' : ''})`; n++; } catch (err) { status = `Erro: ${err.message}`.slice(0, 300); console.error('[bi-envio]', m.id, err.message); }
      await pool.query('UPDATE bi_modelos SET ultimo_envio = NOW(), ultimo_envio_status = $2, proximo_envio = $3 WHERE id = $1', [m.id, status, proximoEnvio(m.envio)]);
    }
  } finally { rodando = false; }
  return n;
}
let agendado = false;
function agendar() {
  if (agendado) return;
  agendado = true;
  const rodar = () => enviarAgendados().catch((e) => console.error('[bi-envio]', e.message));
  setTimeout(rodar, 30000);
  setInterval(rodar, 5 * 60 * 1000).unref();
}

module.exports = { FONTES, FILTROS, PERIODOS_ENVIO, podeFonte, fontesDo, situacoes, gerar, planilha, nomeArquivo, lerEnvio, proximoEnvio, periodoRelativo, parametrosDoModelo, enviarModelo, enviarAgendados, agendar };
