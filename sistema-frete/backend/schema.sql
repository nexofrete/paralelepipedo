-- ============================================================
-- Banco de dados: Sistema de Acompanhamento de Fretes (PostgreSQL)
-- Esse arquivo é executado automaticamente pelo servidor na
-- primeira vez que ele roda. Você não precisa rodar nada manual.
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    senha_hash      VARCHAR(255) NOT NULL,
    perfil          VARCHAR(20) NOT NULL DEFAULT 'cliente', -- 'admin' ou 'cliente'
    cliente_nome    VARCHAR(150),
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fretes (
    id                          SERIAL PRIMARY KEY,

    numero_pedido               VARCHAR(50),
    data_pedido                 DATE,

    data_emissao_nf             DATE,
    numero_nf                   VARCHAR(30),
    chave_nfe                   VARCHAR(44) UNIQUE,

    data_emissao_cte            DATE,
    numero_cte                  VARCHAR(30),
    chave_cte                   VARCHAR(44) UNIQUE,

    data_fatura                 DATE,
    numero_fatura                VARCHAR(30),

    cliente                     VARCHAR(150),
    cidade                      VARCHAR(120),
    bairro                      VARCHAR(120),
    uf                          CHAR(2),

    transportadora              VARCHAR(150),
    frete_cif_fob               VARCHAR(10),
    redespacho                  VARCHAR(600),

    valor_faturado              NUMERIC(14,2),
    qtd_volumes                 INTEGER,
    peso_kg                     NUMERIC(12,3),
    cubagem_m3                  NUMERIC(12,4),

    tabela_frete                VARCHAR(80),
    interior_capital            VARCHAR(20),

    valor_frete_tabelado        NUMERIC(14,2),
    valor_frete_negociado       NUMERIC(14,2),
    tde                         NUMERIC(14,2),
    tda                         NUMERIC(14,2),
    reentrega                   NUMERIC(14,2),
    devolucao                   NUMERIC(14,2),
    outras_despesas             NUMERIC(14,2),
    valor_total_frete           NUMERIC(14,2),
    dif_negociado_tabela        NUMERIC(14,2),
    percent_frete               NUMERIC(6,3),

    status                      VARCHAR(40) DEFAULT 'Pendente',
    observacoes                 TEXT,

    xml_nfe_original            TEXT,
    xml_cte_original            TEXT,

    usuario_upload_id           INTEGER REFERENCES usuarios(id),
    criado_em                   TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fretes_cliente ON fretes (cliente);
CREATE INDEX IF NOT EXISTS idx_fretes_status ON fretes (status);
CREATE INDEX IF NOT EXISTS idx_fretes_numero_pedido ON fretes (numero_pedido);
CREATE INDEX IF NOT EXISTS idx_fretes_numero_nf ON fretes (numero_nf);
CREATE INDEX IF NOT EXISTS idx_fretes_numero_cte ON fretes (numero_cte);
CREATE INDEX IF NOT EXISTS idx_fretes_criado_em ON fretes (criado_em DESC);

-- Contador de cópias da NF-e: o contador é por número da nota,
-- independentemente de quantos registros/CT-e a mesma NF possua.
CREATE TABLE IF NOT EXISTS copias_nf (
    numero_nf       VARCHAR(30) PRIMARY KEY,
    quantidade      INTEGER NOT NULL DEFAULT 0,
    atualizado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Auditoria: registra as ações importantes feitas pelos usuários no sistema.
CREATE TABLE IF NOT EXISTS auditoria (
    id              SERIAL PRIMARY KEY,
    usuario_id      INTEGER REFERENCES usuarios(id),
    usuario_nome    VARCHAR(150),
    acao            VARCHAR(50) NOT NULL,
    detalhes        TEXT,
    registro_id     INTEGER,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_criado_em ON auditoria (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (usuario_id);

-- Cadastro de transportadoras: preenchido automaticamente ao importar CT-e,
-- ou manualmente pela tela de Cadastros.
CREATE TABLE IF NOT EXISTS transportadoras (
    id              SERIAL PRIMARY KEY,
    razao_social    VARCHAR(150) NOT NULL,
    cnpj            VARCHAR(20) UNIQUE,
    ie              VARCHAR(30),
    telefone        VARCHAR(30),
    email           VARCHAR(150),
    endereco        VARCHAR(200),
    bairro          VARCHAR(120),
    municipio       VARCHAR(120),
    uf              CHAR(2),
    cep             VARCHAR(15),
    observacoes     TEXT,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transportadoras_razao_social ON transportadoras (razao_social);

-- Meta de gasto com frete por mês — geral (transportadora NULL) ou por
-- transportadora específica.
CREATE TABLE IF NOT EXISTS metas_frete (
    id              SERIAL PRIMARY KEY,
    mes_referencia  DATE NOT NULL,
    transportadora  VARCHAR(200),
    valor_meta      NUMERIC(14,2) NOT NULL,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metas_frete_unica
  ON metas_frete (mes_referencia, COALESCE(transportadora, ''));

-- Sinistros: avaria, extravio ou furto de carga, por transportadora.
CREATE TABLE IF NOT EXISTS sinistros (
    id                SERIAL PRIMARY KEY,
    numero_pedido     VARCHAR(50),
    transportadora    VARCHAR(200),
    tipo              VARCHAR(20) NOT NULL DEFAULT 'Avaria',
    descricao         TEXT,
    valor_prejuizo    NUMERIC(14,2),
    data_ocorrencia   DATE,
    ressarcido        BOOLEAN NOT NULL DEFAULT FALSE,
    valor_ressarcido  NUMERIC(14,2),
    status            VARCHAR(20) NOT NULL DEFAULT 'Aberto',
    criado_por        VARCHAR(150),
    criado_em         TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sinistros_transportadora ON sinistros (transportadora);

-- Dados bancários, pra exportar direto pro financeiro sem precisar digitar de novo.
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS banco VARCHAR(100);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS agencia VARCHAR(20);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS conta VARCHAR(30);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS tipo_conta VARCHAR(20);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(150);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS url_rastreamento TEXT;

-- Tabela de preço de frete de cada transportadora (pode ter várias por
-- transportadora, ex: uma pra cada destino/UF).
CREATE TABLE IF NOT EXISTS tabelas_preco (
    id                      SERIAL PRIMARY KEY,
    transportadora_id       INTEGER NOT NULL REFERENCES transportadoras(id) ON DELETE CASCADE,
    nome                    VARCHAR(150) NOT NULL,
    uf_destino              CHAR(2),
    cidade_destino          VARCHAR(120),
    tipo_frete              VARCHAR(10),
    valor_minimo            NUMERIC(14,2),
    excedente_por_kg        NUMERIC(14,4),
    ad_valorem_percentual   NUMERIC(6,3),
    gris_percentual         NUMERIC(6,3),
    pedagio                 NUMERIC(14,2),
    tde                     NUMERIC(14,2),
    prazo_dias              INTEGER,
    ativa                   BOOLEAN NOT NULL DEFAULT TRUE,
    observacoes             TEXT,
    criado_em               TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tabelas_preco_transportadora ON tabelas_preco (transportadora_id);

-- Campos adicionais de tabela de preço, para cobrir propostas comerciais reais
-- de transportadoras (despacho por CT-e, cubagem, devolução/reentrega, etc).
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS despacho_valor NUMERIC(14,2);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS cubagem_kg_m3 NUMERIC(10,2);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS devolucao_percentual NUMERIC(6,3);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS reentrega_percentual NUMERIC(6,3);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS seguradora VARCHAR(120);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS condicao_faturamento VARCHAR(200);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS indice_correcao VARCHAR(200);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS validade_meses INTEGER;
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS gris_minimo NUMERIC(14,2);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS tda NUMERIC(14,2);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS trt NUMERIC(14,2);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS valor_pallet NUMERIC(14,2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS valor_total_calculado NUMERIC(14,2);

-- Guarda uma "foto" da tabela de preço (com todos os trechos) toda vez que
-- ela é editada, antes de aplicar a mudança — assim um frete antigo sempre
-- pode ser conferido com o preço que valia NA ÉPOCA, não o preço de hoje.
CREATE TABLE IF NOT EXISTS tabelas_preco_versoes (
    id                SERIAL PRIMARY KEY,
    tabela_preco_id   INTEGER NOT NULL REFERENCES tabelas_preco(id) ON DELETE CASCADE,
    dados_json        JSONB NOT NULL,
    usuario_nome      VARCHAR(150),
    criado_em         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tabelas_preco_versoes_tabela ON tabelas_preco_versoes (tabela_preco_id, criado_em DESC);

-- Faixas de peso dentro de cada tabela de preço (ex: de 0 a 100kg = R$1,20/kg;
-- de 100 a 500kg = R$0,95/kg, etc).
CREATE TABLE IF NOT EXISTS tabela_preco_faixas (
    id                  SERIAL PRIMARY KEY,
    tabela_preco_id     INTEGER NOT NULL REFERENCES tabelas_preco(id) ON DELETE CASCADE,
    peso_de             NUMERIC(12,3),
    peso_ate            NUMERIC(12,3),
    valor_por_kg        NUMERIC(14,4) NOT NULL,
    ordem               INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tabela_preco_faixas_tabela ON tabela_preco_faixas (tabela_preco_id);
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS modo_calculo VARCHAR(10) NOT NULL DEFAULT 'volume';
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS valor_kg_excedente NUMERIC(14,4);
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS regiao VARCHAR(60);

-- Muitas transportadoras cobram por PRAÇA DE DESTINO + TIPO DE CARGA
-- (ex: Caixa, Tapete até 10 volumes, Tapete acima de 10 volumes) em vez de
-- faixa de peso — por isso essas colunas são opcionais e adicionadas depois.
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS origem VARCHAR(80);
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS destino VARCHAR(80);
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS tipo_carga VARCHAR(80);
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS frete_minimo NUMERIC(14,2);
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS volume_minimo INTEGER;
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS prazo_dias INTEGER;
ALTER TABLE tabela_preco_faixas ADD COLUMN IF NOT EXISTS cidades TEXT;

-- Configuração de backup automático do banco de dados (registro único).
CREATE TABLE IF NOT EXISTS configuracao_backup (
    id                      INTEGER PRIMARY KEY DEFAULT 1,
    ativo                   BOOLEAN NOT NULL DEFAULT FALSE,
    frequencia              VARCHAR(20) NOT NULL DEFAULT 'diario',   -- 'diario' ou 'semanal'
    horario                 VARCHAR(5) NOT NULL DEFAULT '02:00',      -- HH:MM, 24h
    dia_semana              INTEGER,                                  -- 0 (domingo) a 6 (sábado), só se semanal
    manter_ultimos          INTEGER NOT NULL DEFAULT 7,
    caminho_pg_dump         VARCHAR(300),                             -- opcional, se pg_dump não estiver no PATH
    ultimo_backup_em        TIMESTAMP,
    ultimo_backup_status    VARCHAR(20),
    ultimo_backup_mensagem  TEXT,
    CONSTRAINT configuracao_backup_unica CHECK (id = 1)
);
-- Senha do backup (opcional, guardada criptografada): protege a chave do sistema
-- (config.json) dentro do .zip — sem ela, uma cópia na nuvem não abre o certificado.
ALTER TABLE configuracao_backup ADD COLUMN IF NOT EXISTS senha_cripto TEXT;

-- Avisos que o admin dispara para todos os usuários logados (ex: manutenção programada).
CREATE TABLE IF NOT EXISTS avisos (
    id                  SERIAL PRIMARY KEY,
    mensagem            TEXT NOT NULL,
    tipo                VARCHAR(20) NOT NULL DEFAULT 'info', -- 'info', 'aviso' ou 'urgente'
    criado_por_nome     VARCHAR(150),
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
    expira_em           TIMESTAMP,
    ativo               BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_avisos_ativo ON avisos (ativo, criado_em DESC);

-- Mensagens internas entre usuários, com anexos.
CREATE TABLE IF NOT EXISTS mensagens (
    id                  SERIAL PRIMARY KEY,
    remetente_id        INTEGER REFERENCES usuarios(id),
    remetente_nome      VARCHAR(150),
    destinatario_id     INTEGER NOT NULL REFERENCES usuarios(id),
    destinatario_nome   VARCHAR(150),
    assunto             VARCHAR(200),
    corpo               TEXT,
    lida                BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mensagens_destinatario ON mensagens (destinatario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_remetente ON mensagens (remetente_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS mensagens_anexos (
    id                  SERIAL PRIMARY KEY,
    mensagem_id         INTEGER NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
    nome_original       VARCHAR(255),
    nome_arquivo        VARCHAR(255),
    tamanho             INTEGER,
    tipo_mime           VARCHAR(120)
);
ALTER TABLE tabela_preco_faixas ALTER COLUMN peso_de DROP NOT NULL;

-- Cadastro da empresa que usa o sistema (um único registro, id fixo = 1).
CREATE TABLE IF NOT EXISTS empresa (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    razao_social    VARCHAR(150),
    nome_fantasia   VARCHAR(150),
    cnpj            VARCHAR(20),
    ie              VARCHAR(30),
    telefone        VARCHAR(30),
    email           VARCHAR(150),
    endereco        VARCHAR(200),
    bairro          VARCHAR(120),
    municipio       VARCHAR(120),
    uf              CHAR(2),
    cep             VARCHAR(15),
    atualizado_em   TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT empresa_unica CHECK (id = 1)
);

-- Colunas adicionadas depois, para bater exatamente com a planilha
-- (ADD COLUMN IF NOT EXISTS não dá erro se a coluna já existir)
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS pedido_mercus VARCHAR(50);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS gris NUMERIC(14,2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS numero_mapa VARCHAR(50);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS data_coleta DATE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS data_entrega DATE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS tipo_carga VARCHAR(80);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS nf_cancelada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS auditoria_calculo TEXT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS carga_direta BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS impostos_nfe TEXT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS impostos_cte TEXT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS valor_total_cte NUMERIC(14,2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS status_aprovacao VARCHAR(20) NOT NULL DEFAULT 'Pendente';
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS aprovado_por_nome VARCHAR(150);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS justificativa_aprovacao TEXT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS cidade_redespacho VARCHAR(150);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS transportadora_nfe VARCHAR(200);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS transportadora_cte VARCHAR(200);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS pedagio NUMERIC(14,2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS trt NUMERIC(14,2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS ad_valorem NUMERIC(14,2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS tabela_preco_id_usada INTEGER REFERENCES tabelas_preco(id) ON DELETE SET NULL;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS glosa_valor NUMERIC(14,2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS glosa_motivo TEXT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS glosa_registrada_por VARCHAR(150);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS glosa_registrada_em TIMESTAMP;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS data_vencimento DATE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS prazo_dias_tabela INTEGER;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS data_entrega_prevista DATE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS sla_status VARCHAR(20);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS canhoto_assinatura TEXT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS canhoto_foto_arquivo VARCHAR(200);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS canhoto_recebido_por VARCHAR(150);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS canhoto_registrado_em TIMESTAMP;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_aprovar_pagamento BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_aprovar_valores_altos BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dois_fatores_ativo BOOLEAN NOT NULL DEFAULT FALSE;

-- Permissões individuais de cada usuário (usadas quando perfil = 'interno')
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_ver_todos BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_enviar_xml BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_editar_registros BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_excluir_registros BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_gerenciar_usuarios BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_gerenciar_transportadoras BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_gerenciar_tabelas_preco BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMP;

-- Aumenta o limite do campo Redespacho (o texto extraído do XML costuma vir
-- com o endereço completo da transportadora de redespacho, que é longo).
ALTER TABLE fretes ALTER COLUMN redespacho TYPE VARCHAR(600);

-- Importação automática da planilha do ERP (preenche campos faltantes dos registros).
CREATE TABLE IF NOT EXISTS configuracao_importacao_erp (
    id                          INTEGER PRIMARY KEY DEFAULT 1,
    ativo                       BOOLEAN NOT NULL DEFAULT FALSE,
    caminho_arquivo             VARCHAR(500),
    intervalo_minutos           INTEGER NOT NULL DEFAULT 15,
    ultimo_mtime_importado      BIGINT,
    ultima_importacao_em        TIMESTAMP,
    ultima_importacao_status    VARCHAR(20),
    ultima_importacao_mensagem  TEXT,
    CONSTRAINT configuracao_importacao_erp_unica CHECK (id = 1)
);

-- Auditoria de frete: sempre que o Valor Frete Negociado (vindo do CT-e) e o
-- Valor Frete Tabelado (calculado pela tabela de preço) estiverem preenchidos,
-- calcula sozinho a diferença entre eles — sem precisar de nenhuma rota fazer isso.
-- Transportadora que levou a nota (v1.72.0). Criadas ANTES do trigger abaixo,
-- porque ele já lê essas colunas (e o UPDATE de correção logo depois dispara o trigger).
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS cte_nao_levou BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS alerta_transportadora_diferente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS cte_cancelado BOOLEAN NOT NULL DEFAULT FALSE;

-- Status "Não cobrado" (v1.72.0): CT-e que não é pago pela empresa (o tomador
-- é outro — ex: o redespacho pago pelo destinatário). Fica só como histórico
-- da nota: a conferência não mexe nele e ele sai das contas de gasto.
-- Entrega agendada (lida da SSW): criada ANTES do trigger, que já usa a coluna.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS rastreio_entrega_agendada DATE;
-- Nota devolvida + nota refaturada com CT-e de entrega nas duas: possível
-- cobrança em dobro. O frete marcado não é liberado sozinho (usada pelo trigger).
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS alerta_cobranca_dupla BOOLEAN NOT NULL DEFAULT FALSE;
-- Motivo de conferência manual (devolução/refaturamento): criada ANTES do trigger, que já usa a coluna.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS motivo_conferencia TEXT;

CREATE OR REPLACE FUNCTION calcular_dif_frete() RETURNS TRIGGER AS $$
BEGIN
  -- Valor Total do Frete = base (Valor Frete Negociado se for Carga Direta,
  -- senão Valor Total Calculado pela tabela) + Outras Despesas.
  IF NEW.carga_direta IS TRUE THEN
    IF NEW.valor_frete_negociado IS NOT NULL THEN
      NEW.valor_total_frete := NEW.valor_frete_negociado + COALESCE(NEW.outras_despesas, 0);
    END IF;
  ELSE
    IF NEW.valor_total_calculado IS NOT NULL THEN
      NEW.valor_total_frete := NEW.valor_total_calculado + COALESCE(NEW.outras_despesas, 0);
    END IF;
  END IF;

  -- Dif. Negociado x Tabela = Valor Total do Frete comparado com o Vlr. CT-e.
  IF NEW.valor_total_frete IS NOT NULL AND NEW.valor_total_cte IS NOT NULL THEN
    NEW.dif_negociado_tabela := NEW.valor_total_frete - NEW.valor_total_cte;
  END IF;

  -- % Frete: quanto o frete representa do valor da mercadoria (nota fiscal).
  IF NEW.valor_total_frete IS NOT NULL AND NEW.valor_faturado IS NOT NULL AND NEW.valor_faturado > 0 THEN
    NEW.percent_frete := ROUND((NEW.valor_total_frete / NEW.valor_faturado) * 100, 3);
  END IF;

  -- SLA: data prevista de entrega = data da coleta (ou emissão do CT-e, se
  -- não tiver coleta) + prazo (dias) do trecho usado no cálculo. Comparando
  -- com a Data de Entrega real, sabe se chegou "No Prazo" ou "Atrasado".
  IF NEW.prazo_dias_tabela IS NOT NULL AND COALESCE(NEW.data_coleta, NEW.data_emissao_cte) IS NOT NULL THEN
    NEW.data_entrega_prevista := COALESCE(NEW.data_coleta, NEW.data_emissao_cte) + (NEW.prazo_dias_tabela || ' days')::INTERVAL;
  END IF;
  -- Entrega AGENDADA (pelo cliente, informada na SSW): o prazo passa a ser a
  -- data agendada — a transportadora não tem como entregar antes dela.
  IF NEW.rastreio_entrega_agendada IS NOT NULL THEN
    NEW.data_entrega_prevista := NEW.rastreio_entrega_agendada;
  END IF;
  IF NEW.data_entrega IS NOT NULL AND NEW.data_entrega_prevista IS NOT NULL THEN
    NEW.sla_status := CASE WHEN NEW.data_entrega <= NEW.data_entrega_prevista THEN 'No Prazo' ELSE 'Atrasado' END;
  ELSE
    NEW.sla_status := NULL;
  END IF;

  -- Se Valor Total do Frete bater com o Vlr. CT-e (dentro da margem de
  -- tolerância configurada), libera o pagamento e aprova sozinho. Se
  -- divergir de verdade (fora da margem), prende como "Frete Retido" —
  -- exceto se já foi aprovado manualmente, cancelado ou faturado. CT-e
  -- cancelado por evento nunca passa pela conferência.
  -- Nota com CT-e de transportadoras diferentes (ainda sem decidir quem
  -- levou) nunca é liberada sozinha: fica retida até alguém decidir.
  IF NEW.valor_total_frete IS NOT NULL AND NEW.valor_total_cte IS NOT NULL
     AND NOT COALESCE(NEW.cte_cancelado, FALSE) AND NOT COALESCE(NEW.cte_nao_levou, FALSE)
     AND COALESCE(NEW.status, '') <> 'Não cobrado' THEN
    -- Carga Direta nunca é liberada sozinha: o "negociado" vem do próprio CT-e,
    -- então a conferência compararia o CT-e com ele mesmo. Precisa de uma pessoa.
    -- Frete REJEITADO por uma pessoa também não é aprovado de novo pelo sistema.
    IF NOT COALESCE(NEW.alerta_transportadora_diferente, FALSE) AND NOT COALESCE(NEW.alerta_cobranca_dupla, FALSE)
       AND NULLIF(NEW.motivo_conferencia, '') IS NULL
       AND NEW.carga_direta IS NOT TRUE
       AND NEW.status_aprovacao IS DISTINCT FROM 'Rejeitado'
       AND ABS(NEW.valor_total_frete - NEW.valor_total_cte) <= COALESCE((
          SELECT GREATEST(
                   COALESCE(tolerancia_valor, 0),
                   COALESCE(tolerancia_percentual, 0) / 100 * NEW.valor_total_cte
                 )
          FROM configuracao_auditoria WHERE id = 1
        ), 0) THEN
      -- Não mexe em frete cancelado/faturado, nem sobrescreve aprovação manual.
      IF COALESCE(NEW.status, 'Pendente') NOT IN ('Cancelado', 'Faturado') THEN
        NEW.status := 'Liberado p/ Pagamento';
        IF NEW.status_aprovacao IS DISTINCT FROM 'Aprovado' THEN
          NEW.status_aprovacao := 'Aprovado';
          NEW.aprovado_por_nome := 'Sistema (conferência automática)';
          NEW.aprovado_em := NOW();
        END IF;
      END IF;
    -- Divergente, Carga Direta ou rejeitado: fica retido até uma pessoa aprovar.
    ELSIF (NEW.status_aprovacao IS DISTINCT FROM 'Aprovado' OR NEW.aprovado_por_nome = 'Sistema (conferência automática)')
          AND COALESCE(NEW.status, 'Pendente') NOT IN ('Cancelado', 'Faturado') THEN
      NEW.status := 'Frete Retido';
      IF NEW.aprovado_por_nome = 'Sistema (conferência automática)' THEN
        NEW.status_aprovacao := 'Pendente';
        NEW.aprovado_por_nome := NULL;
        NEW.aprovado_em := NULL;
      END IF;
    END IF;
  END IF;

  -- CT-e da transportadora que NÃO levou a nota: nunca é pago. Fica retido
  -- (a não ser que já estivesse faturado/cancelado — aí só fica marcado).
  IF COALESCE(NEW.cte_nao_levou, FALSE) AND NEW.status NOT IN ('Cancelado', 'Faturado') THEN
    NEW.status := 'Frete Retido';
    IF NEW.status_aprovacao = 'Aprovado' THEN
      NEW.status_aprovacao := 'Rejeitado';
    END IF;
  END IF;

  -- NF cancelada SEM CT-e: o registro vira Cancelado (sai de "Aguardando CT-e",
  -- das entregas e das contas) — automático, venha o cancelamento do XML da
  -- SEFAZ, do retorno ou da planilha do ERP.
  IF COALESCE(NEW.nf_cancelada, FALSE) AND NEW.chave_cte IS NULL
     AND COALESCE(NEW.status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Arquivado') THEN
    NEW.status := 'Cancelado';
  END IF;
  -- Nota ARQUIVADA (histórico sem CT-e) ou FOB/sem frete ("Não cobrado") que
  -- recebe um CT-e depois: volta para a conferência normal.
  IF TG_OP = 'UPDATE' AND OLD.chave_cte IS NULL AND NEW.chave_cte IS NOT NULL AND NEW.frete_principal_id IS NULL
     AND NEW.status IN ('Arquivado', 'Não cobrado') AND NOT COALESCE(NEW.nf_cancelada, FALSE) THEN
    NEW.status := 'Pendente';
  END IF;

  -- Nota cancelada (NF ou pedido) que RECEBE um CT-e depois: a transportadora
  -- está cobrando frete de nota cancelada — não pode sumir calado. Fica retido.
  IF TG_OP = 'UPDATE' AND OLD.chave_cte IS NULL AND NEW.chave_cte IS NOT NULL
     AND NEW.status = 'Cancelado' AND NOT COALESCE(NEW.cte_cancelado, FALSE) THEN
    NEW.status := 'Frete Retido';
  END IF;

  -- NF cancelada que tem CT-e: frete de nota cancelada não é pago sem alguém
  -- conferir (normalmente o frete vai para a nota que substituiu). Fica retido,
  -- a não ser que uma PESSOA já tenha aprovado, ou já esteja faturado/cancelado.
  IF COALESCE(NEW.nf_cancelada, FALSE) AND NEW.chave_cte IS NOT NULL AND NOT COALESCE(NEW.cte_cancelado, FALSE)
     AND COALESCE(NEW.status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Arquivado')
     AND (NEW.status_aprovacao IS DISTINCT FROM 'Aprovado' OR NEW.aprovado_por_nome = 'Sistema (conferência automática)') THEN
    NEW.status := 'Frete Retido';
    IF NEW.aprovado_por_nome = 'Sistema (conferência automática)' THEN
      NEW.status_aprovacao := 'Pendente';
      NEW.aprovado_por_nome := NULL;
      NEW.aprovado_em := NULL;
    END IF;
  END IF;

  -- Aprovação acompanha o cancelamento: registro Cancelado não tem pagamento a
  -- aprovar. Se sair do Cancelado (ex.: chegou CT-e), volta a Pendente.
  IF NEW.status = 'Cancelado' THEN
    NEW.status_aprovacao := 'Cancelado';
  ELSIF NEW.status_aprovacao = 'Cancelado' THEN
    NEW.status_aprovacao := 'Pendente';
    NEW.aprovado_por_nome := NULL;
    NEW.aprovado_em := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calcular_dif_frete ON fretes;
CREATE TRIGGER trg_calcular_dif_frete
  BEFORE INSERT OR UPDATE ON fretes
  FOR EACH ROW EXECUTE FUNCTION calcular_dif_frete();

-- Correção (v1.64.8): CT-e importados sem vTotDFe ficaram com valor_total_cte
-- vazio e por isso nunca passaram pela conferência automática. Preenche com o
-- valor da prestação (vTPrest); o UPDATE dispara o trigger acima e confere.
-- Só atinge registros ainda vazios, então rodar de novo a cada início é inofensivo.
UPDATE fretes
   SET valor_total_cte = valor_frete_negociado
 WHERE valor_total_cte IS NULL
   AND valor_frete_negociado IS NOT NULL
   AND chave_cte IS NOT NULL;

-- Trava de segurança: mesmo que alguém tente pular a interface e mexer direto
-- no banco, não deixa marcar "Liberado p/ Pagamento" sem aprovação registrada.
CREATE OR REPLACE FUNCTION validar_liberacao_pagamento() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Liberado p/ Pagamento' AND NEW.status_aprovacao IS DISTINCT FROM 'Aprovado' THEN
    RAISE EXCEPTION 'Só é possível liberar pagamento de fretes aprovados.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_liberacao_pagamento ON fretes;
CREATE TRIGGER trg_validar_liberacao_pagamento
  BEFORE INSERT OR UPDATE ON fretes
  FOR EACH ROW EXECUTE FUNCTION validar_liberacao_pagamento();

-- Configuração de segurança: tempo de inatividade até deslogar sozinho.
CREATE TABLE IF NOT EXISTS configuracao_seguranca (
    id                          INTEGER PRIMARY KEY DEFAULT 1,
    tempo_inatividade_minutos   INTEGER,
    CONSTRAINT configuracao_seguranca_unica CHECK (id = 1)
);

-- Configuração de envio de email (SMTP), pra mandar o espelho do cálculo
-- direto pra transportadora quando tem divergência.
CREATE TABLE IF NOT EXISTS configuracao_email (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    ativo           BOOLEAN NOT NULL DEFAULT FALSE,
    smtp_host       VARCHAR(200),
    smtp_porta      INTEGER DEFAULT 587,
    smtp_seguro     BOOLEAN NOT NULL DEFAULT FALSE,
    smtp_usuario    VARCHAR(200),
    smtp_senha      VARCHAR(300),
    email_remetente VARCHAR(200),
    nome_remetente  VARCHAR(150),
    resumo_semanal_ativo BOOLEAN NOT NULL DEFAULT FALSE,
    resumo_semanal_email VARCHAR(200),
    CONSTRAINT configuracao_email_unica CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS configuracao_whatsapp (
    id                     INTEGER PRIMARY KEY DEFAULT 1,
    ativo                  BOOLEAN NOT NULL DEFAULT FALSE,
    twilio_account_sid     VARCHAR(200),
    twilio_auth_token      VARCHAR(200),
    twilio_numero_whatsapp VARCHAR(30),
    numero_destino         VARCHAR(30),
    CONSTRAINT configuracao_whatsapp_unica CHECK (id = 1)
);
INSERT INTO configuracao_whatsapp (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Margem de tolerância da auditoria: diferenças pequenas (arredondamento) não
-- devem travar o frete como "Frete Retido" sozinho.
CREATE TABLE IF NOT EXISTS configuracao_auditoria (
    id                    INTEGER PRIMARY KEY DEFAULT 1,
    tolerancia_valor      NUMERIC(14,2) NOT NULL DEFAULT 0,
    tolerancia_percentual NUMERIC(6,3) NOT NULL DEFAULT 0,
    CONSTRAINT configuracao_auditoria_unica CHECK (id = 1)
);
INSERT INTO configuracao_auditoria (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE configuracao_auditoria ADD COLUMN IF NOT EXISTS limite_alcada_aprovacao NUMERIC(14,2);

-- Conferência de Fatura (v1.66.0): cada fatura da transportadora conferida
-- no sistema, com a "foto" dos CT-e no momento da conferência (itens).
CREATE TABLE IF NOT EXISTS faturas_frete (
    id                  SERIAL PRIMARY KEY,
    numero              VARCHAR(30) NOT NULL,
    transportadora      VARCHAR(200) NOT NULL,
    data_emissao        DATE,
    data_vencimento     DATE,
    valor_informado     NUMERIC(14,2),
    valor_ctes          NUMERIC(14,2) NOT NULL,
    qtd_ctes            INTEGER NOT NULL,
    total_icms          NUMERIC(14,2),
    total_tabela        NUMERIC(14,2),
    parecer             VARCHAR(40) NOT NULL,
    observacoes         TEXT,
    itens               JSONB NOT NULL,
    codigo_verificacao  VARCHAR(20) NOT NULL,
    conferido_por_id    INTEGER,
    conferido_por_nome  VARCHAR(150),
    conferido_em        TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT faturas_frete_unica UNIQUE (numero, transportadora)
);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS fatura_id INTEGER REFERENCES faturas_frete(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fretes_fatura_id ON fretes (fatura_id);

-- Permissões por tela (v1.67.0). Na primeira vez que a coluna é criada,
-- os usuários que já existiam ganham a permissão (pra ninguém perder acesso
-- de repente); usuários novos começam sem ela.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'pode_ver_auditoria') THEN
    ALTER TABLE usuarios ADD COLUMN pode_ver_auditoria BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE usuarios ALTER COLUMN pode_ver_auditoria SET DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'pode_ver_financeiro') THEN
    ALTER TABLE usuarios ADD COLUMN pode_ver_financeiro BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE usuarios ALTER COLUMN pode_ver_financeiro SET DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'pode_ver_relatorios') THEN
    ALTER TABLE usuarios ADD COLUMN pode_ver_relatorios BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE usuarios ALTER COLUMN pode_ver_relatorios SET DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'pode_ver_sinistros') THEN
    ALTER TABLE usuarios ADD COLUMN pode_ver_sinistros BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE usuarios ALTER COLUMN pode_ver_sinistros SET DEFAULT FALSE;
  END IF;
  -- Conferir fatura: quem já aprovava pagamento continua podendo conferir.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'pode_conferir_fatura') THEN
    ALTER TABLE usuarios ADD COLUMN pode_conferir_fatura BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE usuarios SET pode_conferir_fatura = pode_aprovar_pagamento;
  END IF;
END $$;

-- Senha provisória (v1.67.0): quando TRUE, o usuário precisa cadastrar a
-- própria senha no próximo acesso antes de usar o sistema.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trocar_senha BOOLEAN NOT NULL DEFAULT FALSE;

-- Agenda compartilhada (v1.68.0)
CREATE TABLE IF NOT EXISTS agenda_eventos (
    id               SERIAL PRIMARY KEY,
    titulo           VARCHAR(200) NOT NULL,
    descricao        TEXT,
    local            VARCHAR(200),
    inicio           TIMESTAMP NOT NULL,
    fim              TIMESTAMP,
    dia_inteiro      BOOLEAN NOT NULL DEFAULT FALSE,
    cor              VARCHAR(20),
    lembrete_1dia    BOOLEAN NOT NULL DEFAULT FALSE,
    lembrete_1hora   BOOLEAN NOT NULL DEFAULT FALSE,
    criado_por_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_por_nome  VARCHAR(150),
    criado_em        TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_inicio ON agenda_eventos (inicio);

CREATE TABLE IF NOT EXISTS agenda_participantes (
    evento_id   INTEGER NOT NULL REFERENCES agenda_eventos(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    PRIMARY KEY (evento_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_agenda_participantes_usuario ON agenda_participantes (usuario_id);

-- Avisos da agenda pra cada usuário (convite, alteração, cancelamento e
-- lembretes). "referencia" guarda o horário do evento no momento do lembrete:
-- se o evento mudar de horário, o lembrete do novo horário sai de novo.
CREATE TABLE IF NOT EXISTS agenda_notificacoes (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    evento_id   INTEGER REFERENCES agenda_eventos(id) ON DELETE SET NULL,
    tipo        VARCHAR(20) NOT NULL,
    titulo      VARCHAR(200),
    texto       TEXT,
    referencia  TIMESTAMP,
    lida        BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agenda_notificacoes_usuario ON agenda_notificacoes (usuario_id, lida);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_lembrete_unico
  ON agenda_notificacoes (evento_id, usuario_id, tipo, referencia)
  WHERE tipo IN ('lembrete_1dia', 'lembrete_1hora');

-- Tabela de Preço no Frete Mínimo (v1.69.0): nos fretes já calculados pelo
-- mínimo (modo volume), a coluna passa a mostrar Frete Mínimo ÷ Volume Mínimo
-- (o valor por volume) em vez do Frete Mínimo inteiro. Só atinge linhas que
-- ainda estão com o valor antigo, então rodar de novo não muda nada. Qualquer
-- detalhe de cálculo que não dê pra ler é simplesmente pulado.
DO $$
DECLARE r RECORD; a JSONB; minimo NUMERIC; vol_min NUMERIC; qtd NUMERIC;
BEGIN
  FOR r IN SELECT id, tabela_frete, auditoria_calculo FROM fretes
            WHERE auditoria_calculo IS NOT NULL AND tabela_frete ~ '^[0-9]+(\.[0-9]+)?$' LOOP
    BEGIN
      a := r.auditoria_calculo::jsonb;
      minimo := (a->>'frete_minimo')::numeric;
      vol_min := (a->>'volume_minimo')::numeric;
      qtd := (a->>'qtd_volumes_usada')::numeric;
      IF COALESCE(a->>'modo_calculo', 'volume') = 'volume' AND minimo IS NOT NULL AND vol_min > 1
         AND qtd IS NOT NULL AND qtd <= vol_min AND r.tabela_frete::numeric = minimo THEN
        UPDATE fretes SET tabela_frete = TO_CHAR(ROUND(minimo / vol_min, 2), 'FM999999990.00') WHERE id = r.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- Sinistros (v1.69.0): nota fiscal e data do ressarcimento.
ALTER TABLE sinistros ADD COLUMN IF NOT EXISTS numero_nf VARCHAR(50);
ALTER TABLE sinistros ADD COLUMN IF NOT EXISTS data_ressarcimento DATE;
CREATE INDEX IF NOT EXISTS idx_sinistros_numero_nf ON sinistros (numero_nf);

-- Função (cargo) do usuário (v1.69.0), ex: "Analista de Fretes".
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS funcao VARCHAR(100);

-- Sinistros (v1.69.0): data para cobrar a transportadora, com lembrete na agenda.
ALTER TABLE sinistros ADD COLUMN IF NOT EXISTS data_cobranca DATE;
ALTER TABLE sinistros ADD COLUMN IF NOT EXISTS agenda_evento_id INTEGER REFERENCES agenda_eventos(id) ON DELETE SET NULL;

-- Vários CT-e na mesma nota (v1.70.0): o primeiro CT-e é o "principal" e os
-- outros ficam vinculados a ele (complementar, reentrega, devolução ou
-- redespacho por outra transportadora).
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS frete_principal_id INTEGER REFERENCES fretes(id) ON DELETE SET NULL;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS vinculo_cte VARCHAR(20);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS tipo_cte SMALLINT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS transportadora_cnpj_cte VARCHAR(20);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS alerta_transportadora_diferente BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_fretes_principal ON fretes (frete_principal_id);
CREATE INDEX IF NOT EXISTS idx_fretes_numero_nf ON fretes (numero_nf);
ALTER TABLE configuracao_auditoria ADD COLUMN IF NOT EXISTS percentual_reentrega NUMERIC(5,2) NOT NULL DEFAULT 50;

-- Instalações antigas criaram a tabela de email antes destas colunas existirem.
ALTER TABLE configuracao_email ADD COLUMN IF NOT EXISTS resumo_semanal_ativo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE configuracao_email ADD COLUMN IF NOT EXISTS resumo_semanal_email VARCHAR(200);

-- CT-e cancelado por evento (v1.70.4): o CT-e cancelado fica guardado como
-- histórico da nota e sai das contas; a nota volta a esperar um CT-e válido
-- (ou o CT-e que veio depois assume o lugar dele).
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS cte_cancelado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS cte_cancelado_em DATE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS cte_cancelado_motivo TEXT;

-- CNPJ da transportadora dos CT-e importados antes da v1.71.0, lido do XML
-- (pra achar a tabela de preço pelo CNPJ). Só preenche o que está vazio.
UPDATE fretes
   SET transportadora_cnpj_cte = SUBSTRING(xml_cte_original FROM '<emit>[^<]*<CNPJ>([0-9]{14})</CNPJ>')
 WHERE transportadora_cnpj_cte IS NULL AND xml_cte_original IS NOT NULL
   AND xml_cte_original ~ '<emit>[^<]*<CNPJ>[0-9]{14}</CNPJ>';

-- Pasta monitorada de XML (v1.71.0): o sistema importa sozinho os XML de NF-e,
-- CT-e e eventos que aparecerem numa pasta.
CREATE TABLE IF NOT EXISTS configuracao_pasta_xml (
    id                 INTEGER PRIMARY KEY DEFAULT 1,
    ativo              BOOLEAN NOT NULL DEFAULT FALSE,
    caminho            VARCHAR(500),
    intervalo_minutos  INTEGER NOT NULL DEFAULT 5,
    mover_processados  BOOLEAN NOT NULL DEFAULT TRUE,
    ultima_execucao_em TIMESTAMP,
    ultima_mensagem    TEXT,
    CONSTRAINT configuracao_pasta_xml_unica CHECK (id = 1)
);
-- Cada arquivo lido fica anotado (pelo conteúdo), pra nunca ser importado duas vezes.
CREATE TABLE IF NOT EXISTS xml_pasta_processados (
    hash          VARCHAR(64) PRIMARY KEY,
    nome_arquivo  VARCHAR(300),
    tipo          VARCHAR(10),
    ok            BOOLEAN NOT NULL,
    mensagem      TEXT,
    processado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xml_pasta_processados_em ON xml_pasta_processados (processado_em DESC);

-- UF de início e fim da prestação do CT-e (v1.71.0), pra conferir a alíquota de ICMS.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS uf_inicio_cte VARCHAR(2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS uf_fim_cte VARCHAR(2);
UPDATE fretes
   SET uf_inicio_cte = SUBSTRING(xml_cte_original FROM '<UFIni>([A-Z]{2})</UFIni>'),
       uf_fim_cte = SUBSTRING(xml_cte_original FROM '<UFFim>([A-Z]{2})</UFFim>')
 WHERE uf_inicio_cte IS NULL AND xml_cte_original LIKE '%<UFIni>%';

-- Glosas na Conferência de Fatura (v1.71.0): quanto de glosa combinada havia
-- nos CT-e da fatura, pra conferir se foi descontada no valor cobrado.
ALTER TABLE faturas_frete ADD COLUMN IF NOT EXISTS total_glosas NUMERIC(14,2);

-- Cópia do backup fora do servidor (v1.71.0): pasta de rede / outro computador.
ALTER TABLE configuracao_backup ADD COLUMN IF NOT EXISTS pasta_copia VARCHAR(500);

-- Planilha do ERP aguardando o XML (v1.71.0): linhas da planilha de pedidos
-- que ainda não têm nota no sistema ficam aqui, e são aplicadas quando o XML
-- da NF-e chegar — a planilha não cria mais registros sozinha.
CREATE TABLE IF NOT EXISTS erp_pendentes (
    numero_pedido  VARCHAR(50) PRIMARY KEY,
    numero_nf      VARCHAR(50),
    dados          JSONB NOT NULL,
    recebido_em    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_erp_pendentes_nf ON erp_pendentes (numero_nf);

-- Transportadora que levou a nota (v1.72.0): quando a mesma nota tem CT-e de
-- transportadoras diferentes, alguém define qual delas levou de fato. Fica
-- guardado no registro principal da nota; os CT-e das outras ficam marcados
-- como "não levou" (cte_nao_levou) e não são pagos.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS cte_que_levou_id INTEGER REFERENCES fretes(id) ON DELETE SET NULL;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS transportadora_definida_por VARCHAR(150);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS transportadora_definida_em TIMESTAMP;

-- Notas com transportadoras diferentes que a conferência automática já tinha
-- liberado sozinha voltam a ficar retidas até alguém decidir quem levou.
-- (Aprovação feita por uma pessoa e frete faturado não são mexidos.)
UPDATE fretes SET atualizado_em = atualizado_em
 WHERE alerta_transportadora_diferente AND NOT cte_cancelado
   AND aprovado_por_nome = 'Sistema (conferência automática)'
   AND status = 'Liberado p/ Pagamento' AND fatura_id IS NULL;

-- Redespacho previsto na nota (v1.72.0): o CT-e da transportadora de
-- redespacho (a 2ª perna da entrega) não é cobrança duplicada. Guardamos o
-- tipo de serviço do CT-e e o tomador (quem paga o frete), lidos do XML.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS tp_serv_cte SMALLINT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS tomador_cte_papel VARCHAR(20);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS tomador_cte_cnpj VARCHAR(20);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS tomador_cte_nome VARCHAR(200);

-- CNPJ da transportadora de redespacho citada na NF-e ("REDESPACHO: ... CNPJ:
-- 12.360.920/0001-08"). O nome na nota pode ser a razão social e o do CT-e o
-- nome fantasia — o CNPJ é o que liga os dois com segurança.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS redespacho_cnpj VARCHAR(14);
UPDATE fretes
   SET redespacho_cnpj = REGEXP_REPLACE(SUBSTRING(xml_nfe_original FROM 'REDESPACHO\s*:[^<]*?CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2})'), '[^0-9]', '', 'g')
 WHERE redespacho_cnpj IS NULL AND xml_nfe_original ~* 'REDESPACHO\s*:[^<]*CNPJ';

-- Relatório de Auditoria de Frete (v1.72.0): procura CT-e/NF duplicados linha a
-- linha — com índice, isso continua rápido mesmo com dezenas de milhares de fretes.
CREATE INDEX IF NOT EXISTS idx_fretes_numero_cte ON fretes (numero_cte);
CREATE INDEX IF NOT EXISTS idx_fretes_nf_sem_zeros ON fretes (LTRIM(numero_nf, '0'));

-- Rastreamento automático pela SSW (v1.72.0).
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS rastreamento_ssw BOOLEAN DEFAULT FALSE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS data_entrega_final DATE;           -- entrega ao cliente (quando houve redespacho)
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS rastreio_ultima_ocorrencia TEXT;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS rastreio_ultima_em TIMESTAMP;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS rastreio_problema BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS rastreio_entrega_agendada DATE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS rastreio_consultado_em TIMESTAMP;
CREATE TABLE IF NOT EXISTS ocorrencias_rastreio (
    id          SERIAL PRIMARY KEY,
    frete_id    INTEGER NOT NULL REFERENCES fretes(id) ON DELETE CASCADE,
    data_hora   TIMESTAMP,
    cidade      VARCHAR(120),
    ocorrencia  VARCHAR(200),
    descricao   TEXT,
    tipo        VARCHAR(40),
    codigo      VARCHAR(10) NOT NULL DEFAULT '',
    dominio     VARCHAR(10) NOT NULL DEFAULT '',
    recebedor   VARCHAR(150),
    fonte       VARCHAR(20) NOT NULL DEFAULT 'SSW',
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (frete_id, data_hora, codigo, dominio)
);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_rastreio_frete ON ocorrencias_rastreio (frete_id, data_hora);
-- Código (domínio) da transportadora na SSW, aprendido das notas sem
-- redespacho (ex.: FAST-X = XAR). Só eventos com esse código contam como dela.
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS ssw_dominio VARCHAR(10);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS rastreio_dominio VARCHAR(10);

-- Portal de rastreamento da transportadora (v1.72.0) — ex.: Lonngren (Andrade e Abreu).
-- A senha fica criptografada (portal_senha) e nunca volta para a tela.
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS portal_tipo VARCHAR(20);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS portal_chave VARCHAR(200);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS portal_empresa VARCHAR(50);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS portal_usuario VARCHAR(150);
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS portal_senha TEXT;

-- De onde veio a Data da Entrega: manual (tela/canhoto), ssw, portal, sefaz.
-- Serve para "Refazer entregas automáticas" sem mexer nas lançadas à mão.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS data_entrega_origem VARCHAR(20);

-- NF cancelada com CT-e que a conferência tinha liberado sozinha: volta a ficar retida.
UPDATE fretes SET atualizado_em = atualizado_em
 WHERE nf_cancelada AND chave_cte IS NOT NULL AND NOT cte_cancelado AND fatura_id IS NULL
   AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Frete Retido')
   AND (status_aprovacao IS DISTINCT FROM 'Aprovado' OR aprovado_por_nome = 'Sistema (conferência automática)');

-- Cancelamento de NF-e que chegou antes da própria nota (ou de nota que nunca
-- entrou no sistema). Fica guardado e é aplicado se a NF-e for importada depois.
CREATE TABLE IF NOT EXISTS nfe_canceladas_pendentes (
    chave_nfe   VARCHAR(44) PRIMARY KEY,
    data        DATE,
    motivo      TEXT,
    protocolo   VARCHAR(30),
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- NF cancelada sem CT-e que ainda estava como Pendente: passa a Cancelado.
UPDATE fretes SET atualizado_em = atualizado_em
 WHERE nf_cancelada AND chave_cte IS NULL AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Arquivado');

-- Registros já Cancelados: aprovação passa a Cancelado também.
UPDATE fretes SET atualizado_em = atualizado_em
 WHERE status = 'Cancelado' AND status_aprovacao IS DISTINCT FROM 'Cancelado';

-- Modalidade do frete que ficou vazia: lê do XML da NF-e guardado (<modFrete>).
UPDATE fretes SET frete_cif_fob = CASE SUBSTRING(xml_nfe_original FROM '<modFrete>\s*(\d)\s*</modFrete>')
    WHEN '0' THEN 'CIF' WHEN '1' THEN 'FOB' WHEN '2' THEN 'Terceiros' WHEN '3' THEN 'Próprio remetente'
    WHEN '4' THEN 'Próprio destinatário' WHEN '9' THEN 'Sem frete' END
 WHERE frete_cif_fob IS NULL AND xml_nfe_original ~ '<modFrete>';

-- Devolução / troca de nota informada por e-mail (v1.72.0).
CREATE TABLE IF NOT EXISTS trocas_nota (
    id                  SERIAL PRIMARY KEY,
    tipo                VARCHAR(20),
    nf_original         VARCHAR(20) NOT NULL,
    nf_substituta       VARCHAR(20),
    nf_retorno          VARCHAR(20),
    pedido              VARCHAR(30),
    cliente             VARCHAR(200),
    cnpj_cliente        VARCHAR(14),
    motivo              TEXT,
    representante       VARCHAR(120),
    movimentacao        TEXT,
    mercadoria_com_transportador BOOLEAN NOT NULL DEFAULT FALSE,
    texto               TEXT,
    origem              VARCHAR(20) NOT NULL DEFAULT 'email-colado',
    registrado_por      VARCHAR(150),
    aplicado_original   BOOLEAN NOT NULL DEFAULT FALSE,
    aplicado_substituta BOOLEAN NOT NULL DEFAULT FALSE,
    aplicado_retorno    BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (nf_original, nf_substituta, nf_retorno)
);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS nf_devolvida BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS nf_substituida_por VARCHAR(20);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS nf_substitui VARCHAR(20);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS troca_id INTEGER;

-- Leitura automática da caixa de e-mail (IMAP): as caixas ficam em contas_email.
CREATE TABLE IF NOT EXISTS emails_processados (
    message_id   VARCHAR(500) PRIMARY KEY,
    assunto      VARCHAR(300),
    remetente    VARCHAR(300),
    recebido_em  TIMESTAMP,
    processado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Notas de ENTRADA (tpNF 0) e de DEVOLUÇÃO (finNFe 4) que versões antigas
-- importaram como frete de venda: não têm CT-e a esperar -> "Não cobrado".
UPDATE fretes SET status = 'Não cobrado',
       observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), 'Nota de entrada/devolução: não gera frete de venda a acompanhar.')
 WHERE chave_cte IS NULL AND frete_principal_id IS NULL
   AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado', 'Não cobrado', 'Arquivado')
   AND (xml_nfe_original ~ '<tpNF>\s*0\s*</tpNF>' OR xml_nfe_original ~ '<finNFe>\s*4\s*</finNFe>');
-- (Uma versão de teste chegou a pôr "remetentes" na tabela de ENVIO de e-mail; tira.)
ALTER TABLE configuracao_email DROP COLUMN IF EXISTS remetentes;

-- Várias caixas de e-mail (cada pessoa que envia devoluções pode ter a sua).
CREATE TABLE IF NOT EXISTS contas_email (
    id                  SERIAL PRIMARY KEY,
    nome                VARCHAR(100),
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    servidor            VARCHAR(200),
    porta               INTEGER NOT NULL DEFAULT 993,
    usuario             VARCHAR(200),
    senha               TEXT,
    pasta               VARCHAR(200) NOT NULL DEFAULT 'INBOX',
    remetentes          TEXT,
    intervalo_minutos   INTEGER NOT NULL DEFAULT 15,
    ultima_execucao     TIMESTAMP,
    ultimo_resultado    TEXT,
    ultimo_erro         TEXT,
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW()
);
-- auditoria: devoluções e XML para a auditoria de frete (embarcador);
-- cte: NF-e dos clientes da transportadora viram rascunho de CT-e.
ALTER TABLE contas_email ADD COLUMN IF NOT EXISTS finalidade VARCHAR(12) NOT NULL DEFAULT 'auditoria';

-- Descarga e ICMS na tabela de preço (v1.72.0).
--   descarga_modo: fixo (por entrega) | volume | kg | tonelada
--   descarga_aplicar: todos | lista (só os clientes de descarga_clientes: nome ou CNPJ, um por linha)
--   icms_incluir: a transportadora cobra o frete da tabela + ICMS
--   icms_aliquota: vazio = usa a do CT-e, ou a da rota (7%/12% entre estados)
--   icms_modo: dentro (padrão do CT-e: frete ÷ (1 - alíquota)) | fora (frete × alíquota)
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS descarga_valor NUMERIC(12,4);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS descarga_modo VARCHAR(10) NOT NULL DEFAULT 'fixo';
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS descarga_minimo NUMERIC(12,2);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS descarga_aplicar VARCHAR(10) NOT NULL DEFAULT 'lista';
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS descarga_clientes TEXT;
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS icms_incluir BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS icms_aliquota NUMERIC(5,2);
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS icms_modo VARCHAR(10) NOT NULL DEFAULT 'dentro';

-- Cadastro de clientes (destinatários das NF-e), montado sozinho pelo XML da
-- nota. editado_manual = alguém corrigiu à mão: as notas seguintes só
-- preenchem campos vazios, nunca desfazem a correção.
CREATE TABLE IF NOT EXISTS clientes (
    id              SERIAL PRIMARY KEY,
    documento       VARCHAR(20) UNIQUE,          -- CNPJ ou CPF (só números)
    tipo_pessoa     CHAR(1),                     -- J, F ou E (estrangeiro)
    razao_social    VARCHAR(200),
    nome_fantasia   VARCHAR(200),
    ie              VARCHAR(30),
    ind_ie          VARCHAR(2),
    email           VARCHAR(250),
    telefone        VARCHAR(30),
    logradouro      VARCHAR(200),
    numero          VARCHAR(30),
    complemento     VARCHAR(150),
    bairro          VARCHAR(120),
    cod_municipio   VARCHAR(10),
    municipio       VARCHAR(120),
    uf              CHAR(2),
    cep             VARCHAR(10),
    pais            VARCHAR(60),
    observacoes     TEXT,
    origem          VARCHAR(10) NOT NULL DEFAULT 'nfe',
    editado_manual  BOOLEAN NOT NULL DEFAULT FALSE,
    primeira_nf_em  DATE,
    ultima_nf       VARCHAR(20),
    ultima_nf_em    DATE,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clientes_razao ON clientes (razao_social);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS cliente_documento VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_fretes_cliente_documento ON fretes (cliente_documento);

-- Fretes antigos "Liberado p/ Pagamento" SEM aprovação registrada (de antes da
-- trava de segurança): qualquer atualização neles era recusada pelo banco e
-- derrubava, por exemplo, o "Recalcular todos". Voltam para a conferência,
-- que decide de novo (libera e aprova se bater com a tabela, ou retém).
UPDATE fretes SET status = 'Pendente'
 WHERE status = 'Liberado p/ Pagamento' AND status_aprovacao IS DISTINCT FROM 'Aprovado';

-- ---------- Segurança: textos vindos de fora não viram código na tela ----------
-- XML de transportadora, e-mail, SSW e portais escrevem nestas tabelas. Um texto
-- com "<script>" ou aspas poderia rodar no navegador de quem abrisse a tela e
-- roubar a sessão (XSS). Toda gravação troca os caracteres usados para montar
-- código por equivalentes visuais inofensivos: < > " ' viram ‹ › ” ’.
CREATE OR REPLACE FUNCTION nf_limpar_texto(t TEXT) RETURNS TEXT AS $$
  SELECT translate(t, '<>"''', '‹›”’')
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION nf_sanitizar_fretes() RETURNS TRIGGER AS $$
BEGIN
  NEW.cliente := nf_limpar_texto(NEW.cliente);
  NEW.cidade := nf_limpar_texto(NEW.cidade);
  NEW.bairro := nf_limpar_texto(NEW.bairro);
  NEW.transportadora := nf_limpar_texto(NEW.transportadora);
  NEW.transportadora_cte := nf_limpar_texto(NEW.transportadora_cte);
  NEW.redespacho := nf_limpar_texto(NEW.redespacho);
  NEW.cidade_redespacho := nf_limpar_texto(NEW.cidade_redespacho);
  NEW.observacoes := nf_limpar_texto(NEW.observacoes);
  NEW.tipo_carga := nf_limpar_texto(NEW.tipo_carga);
  NEW.rastreio_ultima_ocorrencia := nf_limpar_texto(NEW.rastreio_ultima_ocorrencia);
  NEW.motivo_rejeicao := nf_limpar_texto(NEW.motivo_rejeicao);
  NEW.tomador_cte_nome := nf_limpar_texto(NEW.tomador_cte_nome);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_a_sanitizar_fretes ON fretes;
CREATE TRIGGER trg_a_sanitizar_fretes BEFORE INSERT OR UPDATE ON fretes
  FOR EACH ROW EXECUTE FUNCTION nf_sanitizar_fretes();

ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS nome_fantasia VARCHAR(150);
CREATE OR REPLACE FUNCTION nf_sanitizar_transportadoras() RETURNS TRIGGER AS $$
BEGIN
  NEW.razao_social := nf_limpar_texto(NEW.razao_social);
  NEW.nome_fantasia := nf_limpar_texto(NEW.nome_fantasia);
  NEW.observacoes := nf_limpar_texto(NEW.observacoes);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_a_sanitizar_transportadoras ON transportadoras;
CREATE TRIGGER trg_a_sanitizar_transportadoras BEFORE INSERT OR UPDATE ON transportadoras
  FOR EACH ROW EXECUTE FUNCTION nf_sanitizar_transportadoras();

CREATE OR REPLACE FUNCTION nf_sanitizar_clientes() RETURNS TRIGGER AS $$
BEGIN
  NEW.razao_social := nf_limpar_texto(NEW.razao_social);
  NEW.nome_fantasia := nf_limpar_texto(NEW.nome_fantasia);
  NEW.logradouro := nf_limpar_texto(NEW.logradouro);
  NEW.complemento := nf_limpar_texto(NEW.complemento);
  NEW.bairro := nf_limpar_texto(NEW.bairro);
  NEW.municipio := nf_limpar_texto(NEW.municipio);
  NEW.email := nf_limpar_texto(NEW.email);
  NEW.observacoes := nf_limpar_texto(NEW.observacoes);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_a_sanitizar_clientes ON clientes;
CREATE TRIGGER trg_a_sanitizar_clientes BEFORE INSERT OR UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION nf_sanitizar_clientes();

CREATE OR REPLACE FUNCTION nf_sanitizar_ocorrencias() RETURNS TRIGGER AS $$
BEGIN
  NEW.cidade := nf_limpar_texto(NEW.cidade);
  NEW.ocorrencia := nf_limpar_texto(NEW.ocorrencia);
  NEW.descricao := nf_limpar_texto(NEW.descricao);
  NEW.recebedor := nf_limpar_texto(NEW.recebedor);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_a_sanitizar_ocorrencias ON ocorrencias_rastreio;
CREATE TRIGGER trg_a_sanitizar_ocorrencias BEFORE INSERT OR UPDATE ON ocorrencias_rastreio
  FOR EACH ROW EXECUTE FUNCTION nf_sanitizar_ocorrencias();

CREATE OR REPLACE FUNCTION nf_sanitizar_trocas() RETURNS TRIGGER AS $$
BEGIN
  NEW.cliente := nf_limpar_texto(NEW.cliente);
  NEW.motivo := nf_limpar_texto(NEW.motivo);
  NEW.representante := nf_limpar_texto(NEW.representante);
  NEW.movimentacao := nf_limpar_texto(NEW.movimentacao);
  NEW.texto := nf_limpar_texto(NEW.texto);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_a_sanitizar_trocas ON trocas_nota;
CREATE TRIGGER trg_a_sanitizar_trocas BEFORE INSERT OR UPDATE ON trocas_nota
  FOR EACH ROW EXECUTE FUNCTION nf_sanitizar_trocas();

-- Limpa o que já está gravado (só as linhas que têm algum desses caracteres).
UPDATE fretes SET id = id
 WHERE CONCAT(cliente, cidade, bairro, transportadora, transportadora_cte, redespacho, cidade_redespacho, observacoes,
               tipo_carga, rastreio_ultima_ocorrencia, motivo_rejeicao, tomador_cte_nome) ~ '[<>"'']';
UPDATE transportadoras SET id = id WHERE CONCAT(razao_social, observacoes) ~ '[<>"'']';
UPDATE clientes SET id = id WHERE CONCAT(razao_social, nome_fantasia, logradouro, complemento, bairro, municipio, email, observacoes) ~ '[<>"'']';
UPDATE ocorrencias_rastreio SET id = id WHERE CONCAT(cidade, ocorrencia, descricao, recebedor) ~ '[<>"'']';
UPDATE trocas_nota SET id = id WHERE CONCAT(cliente, motivo, representante, movimentacao, texto) ~ '[<>"'']';

-- O nome do cliente do usuário (perfil Cliente) passa pela mesma limpeza, pra
-- continuar igual ao "cliente" gravado nos fretes.
CREATE OR REPLACE FUNCTION nf_sanitizar_usuarios() RETURNS TRIGGER AS $$
BEGIN
  NEW.cliente_nome := nf_limpar_texto(NEW.cliente_nome);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_a_sanitizar_usuarios ON usuarios;
CREATE TRIGGER trg_a_sanitizar_usuarios BEFORE INSERT OR UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION nf_sanitizar_usuarios();
UPDATE usuarios SET id = id WHERE cliente_nome ~ '[<>"'']';

-- HTTPS na rede da empresa (opcional): cadeado no navegador.
ALTER TABLE configuracao_seguranca ADD COLUMN IF NOT EXISTS https_ativo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE configuracao_seguranca ADD COLUMN IF NOT EXISTS https_porta INTEGER NOT NULL DEFAULT 3443;

-- Mapa de carregamento: dados completos da planilha do mapa (v1.72.0).
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS mapa_descricao VARCHAR(200);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS mapa_data_referencia DATE;
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS mapa_ajudante VARCHAR(150);
-- Nota de entrada / devolução (não sai do estoque como venda): marcada pra ficar fora do relatório de notas sem mapa.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS nf_entrada BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE fretes SET nf_entrada = TRUE
 WHERE nf_entrada IS NOT TRUE AND status = 'Não cobrado'
   AND (xml_nfe_original ~ '<tpNF>\s*0\s*</tpNF>' OR xml_nfe_original ~ '<finNFe>\s*4\s*</finNFe>');
-- Prazo (dias corridos após a emissão) para alertar nota sem mapa de carregamento.
ALTER TABLE configuracao_auditoria ADD COLUMN IF NOT EXISTS mapa_dias_alerta INTEGER NOT NULL DEFAULT 3;

-- Devolução e refaturamento (v1.72.0).
--   motivo_conferencia: CT-e que precisa de conferência manual antes de pagar
--   (ex.: CT-e da nota refaturada quando a nota devolvida já tinha CT-e, ou CT-e
--   emitido sobre a nota depois de devolvida). Enquanto houver motivo, a
--   conferência automática não libera o pagamento.
ALTER TABLE trocas_nota ADD COLUMN IF NOT EXISTS data_retorno DATE;

-- Retorno de remessa (feira / exposição / demonstração / conserto), v1.72.0.
-- Na tabela de preço: % do CT-e da ida que a transportadora cobra pela volta
-- (vazio = 100%). Na nota de origem: marcada como "retornou".
ALTER TABLE tabelas_preco ADD COLUMN IF NOT EXISTS retorno_percentual NUMERIC(6,2);
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS nf_retornou BOOLEAN NOT NULL DEFAULT FALSE;

-- Cidade do redespacho gravada com texto a mais ("GUARULHOS FRETE POR CONTA DO
-- DESTINO..."): fica só a cidade (sem a frase e sem a UF no fim).
UPDATE fretes
   SET cidade_redespacho = NULLIF(TRIM(REGEXP_REPLACE(
         REGEXP_REPLACE(cidade_redespacho, '\s+(FRETE|POR\s+CONTA|CEP|CNPJ|INSCR|FONE|TEL|E-?MAIL|ESTADO|[0-9]).*$', '', 'i'),
         '\s+[-/]?\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*$', '')), '')
 WHERE cidade_redespacho ~* '\s(FRETE|POR\s+CONTA|CEP|CNPJ|INSCR|FONE|TEL|E-?MAIL|ESTADO|[0-9])'
    OR cidade_redespacho ~ '\s[-/]?\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*$';

-- Sobra do "I.E" (inscrição estadual) colada na cidade do redespacho: "SAO PAULO I".
UPDATE fretes SET cidade_redespacho = TRIM(REGEXP_REPLACE(cidade_redespacho, '\s+I\.?\s*$', ''))
 WHERE cidade_redespacho ~ '\s+I\.?\s*$';

-- Transportadora de redespacho cadastrada sozinha pelo CNPJ que vem na NF-e (v1.72.0).
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS eh_redespacho BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS cadastro_consultado_em TIMESTAMP;
-- Motivo da última falha ao completar a transportadora pelo CNPJ (mostrado no cadastro).
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS cadastro_erro TEXT;
-- CNPJs errados (vindos de notas) que pertencem a esta transportadora: a nota
-- continua ligada ao cadastro certo. Só números, separados por vírgula.
ALTER TABLE transportadoras ADD COLUMN IF NOT EXISTS cnpj_alternativos TEXT;

-- CNPJ do redespacho escrito SEM o rótulo "CNPJ:" ("REDESPACHO: FULANO - ME - 02.765.172/0002-62 - RUA ..."):
-- pega o número no formato de CNPJ dentro do texto do redespacho.
UPDATE fretes
   SET redespacho_cnpj = REGEXP_REPLACE(COALESCE(
         (REGEXP_MATCH(xml_nfe_original, 'REDESPACHO\s*:[^<]{0,250}?(?:CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2})|(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}))', 'i'))[1],
         (REGEXP_MATCH(xml_nfe_original, 'REDESPACHO\s*:[^<]{0,250}?(?:CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2})|(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}))', 'i'))[2]), '[^0-9]', '', 'g')
 WHERE redespacho_cnpj IS NULL AND NULLIF(TRIM(COALESCE(redespacho, '')), '') IS NOT NULL
   AND xml_nfe_original ~* 'REDESPACHO\s*:[^<]{0,250}?\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}';

-- NF-e complementar / de ajuste (finNFe 2 ou 3): complementa imposto ou valor de
-- outra nota, sem mercadoria — não gera frete, não entra em mapa, entrega nem
-- "Aguardando CT-e". As importadas antes ficam marcadas (lê só o começo do XML).
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS nf_complementar BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE fretes
   SET nf_complementar = TRUE,
       status = CASE WHEN chave_cte IS NULL AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado') THEN 'Não cobrado' ELSE status END,
       observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), 'NF-e complementar (sem mercadoria): não gera frete a acompanhar.')
 WHERE nf_complementar IS NOT TRUE AND xml_nfe_original IS NOT NULL
   AND SUBSTRING(xml_nfe_original FROM 1 FOR 4000) ~ '<finNFe>\s*[23]\s*</finNFe>';

-- NF-e SEM CIRCULAÇÃO de mercadoria: destinatário com o MESMO CNPJ do emitente
-- (ex.: baixa de estoque, CFOP 5927) ou só CFOPs que não movimentam mercadoria.
-- Não gera frete; as importadas antes ficam marcadas.
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS nf_sem_circulacao BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE fretes
   SET nf_sem_circulacao = TRUE,
       status = CASE WHEN chave_cte IS NULL AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Faturado') THEN 'Não cobrado' ELSE status END,
       observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), 'NF-e sem circulação de mercadoria (ex.: baixa de estoque, destinatário é a própria empresa): não gera frete.')
 WHERE nf_sem_circulacao IS NOT TRUE AND xml_nfe_original IS NOT NULL AND chave_cte IS NULL
   AND (
     -- mesmo CNPJ no emitente e no destinatário
     (REGEXP_MATCH(SUBSTRING(xml_nfe_original FROM 1 FOR 8000), '<emit>\s*<CNPJ>([0-9]{14})</CNPJ>'))[1]
       = (REGEXP_MATCH(SUBSTRING(xml_nfe_original FROM 1 FOR 8000), '<dest>\s*<CNPJ>([0-9]{14})</CNPJ>'))[1]
     -- ou só CFOPs sem circulação de mercadoria
     OR (xml_nfe_original ~ '<CFOP>(5926|5927|6927|5929|6929|5601|5602|5603|6603|5605|5606)</CFOP>'
         AND xml_nfe_original !~ '<CFOP>(?!(5926|5927|6927|5929|6929|5601|5602|5603|6603|5605|5606)</CFOP>)[0-9]{4}</CFOP>')
   );

-- Venda + frete por conta do destinatário (modFrete 1) + SEM transportadora
-- informada: o frete é por conta do CLIENTE (ele contrata ou vem buscar).
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS frete_por_conta_cliente BOOLEAN NOT NULL DEFAULT FALSE;
-- Desfaz a marcação de uma versão de teste que marcava as notas COM transportadora.
UPDATE fretes
   SET frete_por_conta_cliente = FALSE,
       observacoes = NULLIF(TRIM(REGEXP_REPLACE(observacoes, '\n?Frete por conta do cliente \(FOB\) — transportadora [^\n]* contratada pelo cliente\.', '', 'g')), '')
 WHERE observacoes ~ 'Frete por conta do cliente \(FOB\) — transportadora [^\n]* contratada pelo cliente\.';
UPDATE fretes
   SET frete_por_conta_cliente = TRUE,
       observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''),
         'Frete por conta do cliente (FOB) — transportadora não informada na nota: o cliente contrata a transportadora ou vem buscar.')
 WHERE frete_por_conta_cliente IS NOT TRUE AND xml_nfe_original IS NOT NULL
   AND SUBSTRING(xml_nfe_original FROM 1 FOR 4000) ~* '<natOp>[^<]*VENDA[^<]*</natOp>'
   AND xml_nfe_original ~ '<modFrete>\s*1\s*</modFrete>'
   AND xml_nfe_original !~ '<transporta>(?:[^<]|<(?!/transporta>))*?<xNome>[^<]*[^<\s][^<]*</xNome>';

-- Capacidades dos veículos (peso e m³) para indicar o veículo de cada carga no
-- relatório "Juntar notas". Vazio = valores típicos de mercado (editáveis na tela).
ALTER TABLE configuracao_auditoria ADD COLUMN IF NOT EXISTS veiculos_capacidade JSONB;

-- Leitura de comprovantes (canhotos) por IA — opcional, desligada até informar a chave.
ALTER TABLE configuracao_auditoria ADD COLUMN IF NOT EXISTS ia_ativa BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE configuracao_auditoria ADD COLUMN IF NOT EXISTS ia_chave TEXT;            -- criptografada (AES-256-GCM)
ALTER TABLE configuracao_auditoria ADD COLUMN IF NOT EXISTS ia_modelo VARCHAR(80);

-- Itens do pedido sem medida (cubagem incompleta), da planilha do ERP (ITENS_SEM_MEDIDA).
ALTER TABLE fretes ADD COLUMN IF NOT EXISTS itens_sem_medida INTEGER;

-- Logo da empresa (imagem em data URL), usada no cabeçalho dos relatórios impressos.
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS logo TEXT;

-- Correção da conferência automática: Carga Direta que o sistema tinha liberado
-- sozinho (comparava o CT-e com ele mesmo) volta a ficar retida, esperando uma
-- pessoa aprovar. Aprovação feita por pessoa e frete faturado não são mexidos.
UPDATE fretes SET atualizado_em = atualizado_em
 WHERE carga_direta IS TRUE AND NOT cte_cancelado AND fatura_id IS NULL
   AND aprovado_por_nome = 'Sistema (conferência automática)'
   AND status = 'Liberado p/ Pagamento';

-- ===================== Emissão de CT-e (modo transportadora) =====================
-- Dados fiscais do emitente (a própria transportadora), no cadastro da empresa.
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS numero VARCHAR(60);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS complemento VARCHAR(60);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS codigo_municipio VARCHAR(7);          -- código IBGE (7 dígitos)
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS rntrc VARCHAR(8);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS crt SMALLINT NOT NULL DEFAULT 3;       -- 1 Simples, 2 Simples excesso, 3 Normal, 4 MEI
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_ambiente SMALLINT NOT NULL DEFAULT 2;  -- 1 produção, 2 homologação
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_serie INTEGER NOT NULL DEFAULT 1;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_proximo_numero INTEGER NOT NULL DEFAULT 1;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_cst_padrao VARCHAR(3) NOT NULL DEFAULT '00';
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_aliquota_interna NUMERIC(5,2);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_verificar_servidor BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_ibscbs_ativo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_ibscbs_cst VARCHAR(3);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_ibscbs_class_trib VARCHAR(6);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_ibs_uf_aliquota NUMERIC(7,4);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_ibs_mun_aliquota NUMERIC(7,4);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_cbs_aliquota NUMERIC(7,4);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS resp_tec_cnpj VARCHAR(14);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS resp_tec_contato VARCHAR(60);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS resp_tec_email VARCHAR(60);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS resp_tec_fone VARCHAR(14);
-- Certificado A1: o .pfx e a senha ficam criptografados (AES-256-GCM) e nunca voltam para a tela.
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS certificado_pfx TEXT;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS certificado_senha TEXT;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS certificado_titular VARCHAR(200);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS certificado_cnpj VARCHAR(14);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS certificado_validade TIMESTAMP;
-- Modo demonstração: a SEFAZ é simulada no próprio servidor (sem certificado ICP-Brasil, nada é enviado).
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_demonstracao BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS certificado_demonstracao BOOLEAN NOT NULL DEFAULT FALSE;

-- CT-e emitidos pela transportadora. "dados" guarda o que foi preenchido na tela;
-- o número é reservado na primeira transmissão e não muda mais (o código cCT
-- também, pra chave continuar a mesma se for preciso reenviar).
CREATE TABLE IF NOT EXISTS ctes_emitidos (
    id                  SERIAL PRIMARY KEY,
    ambiente            SMALLINT NOT NULL DEFAULT 2,
    serie               INTEGER,
    numero              INTEGER,
    codigo_numerico     VARCHAR(8),
    chave               VARCHAR(44),
    status              VARCHAR(20) NOT NULL DEFAULT 'rascunho',  -- rascunho, enviando, autorizado, rejeitado, erro, cancelado
    dados               JSONB NOT NULL DEFAULT '{}'::jsonb,
    xml_assinado        TEXT,          -- último CT-e assinado enviado
    xml_autorizado      TEXT,          -- cteProc (CT-e + protocolo da SEFAZ)
    protocolo           VARCHAR(20),
    autorizado_em       TIMESTAMP,
    cstat               VARCHAR(5),
    motivo              TEXT,
    valor_total         NUMERIC(14,2),
    tomador_nome        VARCHAR(150),
    remetente_nome      VARCHAR(150),
    destinatario_nome   VARCHAR(150),
    cidade_fim          VARCHAR(120),
    uf_fim              CHAR(2),
    cce_sequencia       INTEGER NOT NULL DEFAULT 0,
    eventos             JSONB NOT NULL DEFAULT '[]'::jsonb,
    criado_por_nome     VARCHAR(150),
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS demonstracao BOOLEAN NOT NULL DEFAULT FALSE;
-- Acompanhamento da entrega (estilo SSW): previsão, situação e ocorrências.
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS prazo_dias INTEGER;
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS previsao_original DATE;      -- a do dia da emissão (mede o atraso)
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS previsao_entrega DATE;       -- a atual (muda com agendamento/reentrega)
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS situacao_entrega VARCHAR(20) NOT NULL DEFAULT 'pendente';
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS data_entrega TIMESTAMP;
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS recebedor_nome VARCHAR(120);
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS recebedor_documento VARCHAR(30);
-- Complementar/substituto (o tipo fica em dados->>'tpCTe'), contingência (SVC) e
-- o CT-e que substituiu este (status 'substituido').
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS tp_emis SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS substituido_por INTEGER;
-- Chave enviada à SEFAZ de origem que ficou sem resposta antes de reemitir na SVC:
-- se a origem tiver autorizado, ela precisa ser cancelada.
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS chave_pendente_origem VARCHAR(44);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_contingencia BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_contingencia_motivo VARCHAR(256);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_contingencia_inicio TIMESTAMPTZ;
-- Averbação do seguro de carga (AT&M ou AverbePorto) e a apólice que vai no MDF-e.
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS averbacao_provedor VARCHAR(10);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS averbacao_usuario VARCHAR(120);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS averbacao_senha TEXT;          -- criptografada
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS averbacao_codigo VARCHAR(40);  -- código AT&M
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS averbacao_automatica BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS seguro_seguradora VARCHAR(60);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS seguro_cnpj VARCHAR(14);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS seguro_apolice VARCHAR(20);
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS averbacao JSONB;
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS averbacao_status VARCHAR(12);
CREATE TABLE IF NOT EXISTS cte_ocorrencias (
    id                  SERIAL PRIMARY KEY,
    cte_id              INTEGER NOT NULL REFERENCES ctes_emitidos(id) ON DELETE CASCADE,
    tipo_id             VARCHAR(30) NOT NULL,     -- item do catálogo (src/cte/ocorrencias.js)
    codigo              SMALLINT NOT NULL,        -- código PROCEDA (vai no OCOREN)
    descricao           VARCHAR(120) NOT NULL,
    tipo                VARCHAR(20) NOT NULL,     -- transito, em_rota, agendada, entrega, problema, devolucao, informativo
    data_hora           TIMESTAMP NOT NULL,
    cidade              VARCHAR(120),
    uf                  CHAR(2),
    recebedor_nome      VARCHAR(120),
    recebedor_documento VARCHAR(30),
    nova_previsao       DATE,
    observacao          TEXT,
    comprovante_arquivo VARCHAR(200),
    usuario_nome        VARCHAR(150),
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
    enviada_edi_em      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cte_ocorrencias_cte ON cte_ocorrencias (cte_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_ctes_emitidos_situacao ON ctes_emitidos (situacao_entrega, previsao_entrega) WHERE status = 'autorizado';
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cte_prazo_padrao INTEGER;
-- MDF-e (Manifesto Eletrônico de Documentos Fiscais, modelo 58, rodoviário).
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS mdfe_serie INTEGER NOT NULL DEFAULT 1;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS mdfe_proximo_numero INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS mdfes (
    id                  SERIAL PRIMARY KEY,
    ambiente            SMALLINT NOT NULL DEFAULT 2,
    serie               INTEGER,
    numero              INTEGER,
    codigo_numerico     VARCHAR(8),
    chave               VARCHAR(44),
    status              VARCHAR(20) NOT NULL DEFAULT 'rascunho',   -- rascunho, enviando, autorizado, rejeitado, erro, encerrado, cancelado
    dados               JSONB NOT NULL DEFAULT '{}'::jsonb,
    xml_assinado        TEXT,
    xml_autorizado      TEXT,      -- mdfeProc
    protocolo           VARCHAR(20),
    autorizado_em       TIMESTAMP,
    encerrado_em        TIMESTAMP,
    cstat               VARCHAR(5),
    motivo              TEXT,
    eventos             JSONB NOT NULL DEFAULT '[]'::jsonb,
    seq_condutor        INTEGER NOT NULL DEFAULT 1,
    demonstracao        BOOLEAN NOT NULL DEFAULT FALSE,
    romaneio_id         INTEGER,
    placa               VARCHAR(10),
    uf_ini              CHAR(2),
    uf_fim              CHAR(2),
    qtd_documentos      INTEGER,
    valor_carga         NUMERIC(14,2),
    criado_por_nome     VARCHAR(150),
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mdfes_numero ON mdfes (ambiente, serie, numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mdfes_chave ON mdfes (chave) WHERE chave IS NOT NULL;
ALTER TABLE mdfes ADD COLUMN IF NOT EXISTS averbacao JSONB;
ALTER TABLE mdfes ADD COLUMN IF NOT EXISTS averbacao_status VARCHAR(12);
CREATE INDEX IF NOT EXISTS idx_mdfes_status ON mdfes (status, criado_em DESC);
-- Cadastro de veículos e motoristas (MDF-e e romaneio).
CREATE TABLE IF NOT EXISTS veiculos (
    id          SERIAL PRIMARY KEY,
    placa       VARCHAR(10) NOT NULL UNIQUE,
    tipo        VARCHAR(10) NOT NULL DEFAULT 'tracao',   -- tracao, reboque
    renavam     VARCHAR(11),
    tara        INTEGER,
    cap_kg      INTEGER,
    cap_m3      INTEGER,
    tp_rod      CHAR(2),
    tp_car      CHAR(2),
    uf          CHAR(2),
    descricao   VARCHAR(60),
    proprietario JSONB,           -- veículo de terceiro: { doc, xNome, rntrc, ie, uf, tpProp }
    ativo       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS motoristas (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL,
    cpf         VARCHAR(11) NOT NULL UNIQUE,
    telefone    VARCHAR(30),
    cnh         VARCHAR(20),
    cnh_validade DATE,
    ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Romaneio (manifesto de saída para entrega) e o app do motorista.
CREATE TABLE IF NOT EXISTS romaneios (
    id                  SERIAL PRIMARY KEY,
    data                DATE NOT NULL DEFAULT CURRENT_DATE,
    motorista_nome      VARCHAR(120) NOT NULL,
    motorista_documento VARCHAR(30),
    motorista_telefone  VARCHAR(30),
    placa               VARCHAR(10),
    veiculo             VARCHAR(60),
    observacao          TEXT,
    status              VARCHAR(12) NOT NULL DEFAULT 'aberto',   -- aberto, em_rota, fechado
    codigo_acesso       VARCHAR(12) UNIQUE,                       -- o motorista entra no app com ele
    criado_por_nome     VARCHAR(150),
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
    saiu_em             TIMESTAMP,
    fechado_em          TIMESTAMP
);
CREATE TABLE IF NOT EXISTS romaneio_itens (
    romaneio_id INTEGER NOT NULL REFERENCES romaneios(id) ON DELETE CASCADE,
    cte_id      INTEGER NOT NULL REFERENCES ctes_emitidos(id) ON DELETE CASCADE,
    ordem       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (romaneio_id, cte_id)
);
CREATE INDEX IF NOT EXISTS idx_romaneio_itens_cte ON romaneio_itens (cte_id);
ALTER TABLE cte_ocorrencias ADD COLUMN IF NOT EXISTS romaneio_id INTEGER;
ALTER TABLE cte_ocorrencias ADD COLUMN IF NOT EXISTS assinatura_arquivo VARCHAR(200);
ALTER TABLE cte_ocorrencias ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6);
ALTER TABLE cte_ocorrencias ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
ALTER TABLE cte_ocorrencias ADD COLUMN IF NOT EXISTS origem VARCHAR(12) NOT NULL DEFAULT 'sistema';   -- sistema, motorista
-- Avisos automáticos da entrega para o cliente (e-mail / WhatsApp).
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS aviso_entrega_ativo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS aviso_entrega_eventos TEXT NOT NULL DEFAULT 'em_rota,entrega,problema,devolucao';
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS aviso_entrega_email BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS aviso_entrega_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS endereco_publico VARCHAR(200);   -- https://... para os links de rastreio
CREATE TABLE IF NOT EXISTS avisos_entrega (
    id              SERIAL PRIMARY KEY,
    ocorrencia_id   INTEGER REFERENCES cte_ocorrencias(id) ON DELETE SET NULL,
    cte_id          INTEGER REFERENCES ctes_emitidos(id) ON DELETE CASCADE,
    canal           VARCHAR(10) NOT NULL,     -- email, whatsapp
    destino         VARCHAR(150) NOT NULL,
    situacao        VARCHAR(10) NOT NULL,     -- enviado, erro
    detalhe         TEXT,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_avisos_entrega_cte ON avisos_entrega (cte_id);

-- Feriados estaduais/municipais e folgas (os nacionais o sistema já sabe).
CREATE TABLE IF NOT EXISTS feriados (
    id          SERIAL PRIMARY KEY,
    data        DATE NOT NULL,
    descricao   VARCHAR(120) NOT NULL,
    uf          CHAR(2),          -- vazio = todo o país
    cidade      VARCHAR(120),     -- vazio = a UF inteira
    anual       BOOLEAN NOT NULL DEFAULT TRUE,   -- repete todo ano no mesmo dia
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);       -- dias úteis, quando a tabela não diz
CREATE UNIQUE INDEX IF NOT EXISTS idx_ctes_emitidos_numero ON ctes_emitidos (ambiente, serie, numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ctes_emitidos_chave ON ctes_emitidos (chave) WHERE chave IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ctes_emitidos_status ON ctes_emitidos (status, criado_em DESC);

-- Permissão de emitir CT-e (transmitir, cancelar, carta de correção).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_emitir_cte BOOLEAN NOT NULL DEFAULT FALSE;

-- ===================== Roteirização de entregas =====================
CREATE TABLE IF NOT EXISTS configuracao_roteirizacao (
    id                      INTEGER PRIMARY KEY DEFAULT 1,
    provedor                VARCHAR(10) NOT NULL DEFAULT 'osrm',   -- osrm, ors (OpenRouteService), estimado
    osrm_url                VARCHAR(200),
    ors_url                 VARCHAR(200),
    ors_chave               TEXT,
    nominatim_url           VARCHAR(200),
    geocodificar_endereco   BOOLEAN NOT NULL DEFAULT TRUE,
    fator_caminhao          NUMERIC(4,2) NOT NULL DEFAULT 1.25,    -- OSRM calcula para carro: caminhão leva mais tempo
    velocidade_estimada     INTEGER NOT NULL DEFAULT 55,           -- km/h na estimativa sem serviço de rotas
    tempo_parada_min        INTEGER NOT NULL DEFAULT 30,
    CONSTRAINT configuracao_roteirizacao_unica CHECK (id = 1)
);
INSERT INTO configuracao_roteirizacao (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
-- Horário em que os clientes recebem (padrão de toda rota; a tela pode mudar por rota).
ALTER TABLE configuracao_roteirizacao ADD COLUMN IF NOT EXISTS recebimento_inicio VARCHAR(5) NOT NULL DEFAULT '08:00';
ALTER TABLE configuracao_roteirizacao ADD COLUMN IF NOT EXISTS recebimento_fim VARCHAR(5) NOT NULL DEFAULT '18:00';
ALTER TABLE configuracao_roteirizacao ADD COLUMN IF NOT EXISTS recebimento_sabado BOOLEAN NOT NULL DEFAULT FALSE;
-- Imagens do mapa de fundo ({z}/{x}/{y}); vazio = OpenStreetMap. O servidor busca e guarda cópia (dados/mapa-cache).
ALTER TABLE configuracao_roteirizacao ADD COLUMN IF NOT EXISTS mapa_url VARCHAR(300);

-- Endereços já procurados no mapa (não consulta de novo; "achado = false" evita repetir o que não existe).
CREATE TABLE IF NOT EXISTS geocodificacao_cache (
    chave       TEXT PRIMARY KEY,
    lat         NUMERIC(10,6),
    lon         NUMERIC(10,6),
    achado      BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Restrições de circulação de caminhões por cidade (horário de Brasília).
-- categorias: utilitario, vuc, tres_quartos, toco, truck, carreta (vazio = todas).
-- dias: 0 = domingo ... 6 = sábado. tipo "rodizio": finais = {"1": "1,2", ...} por dia.
-- efeito: "esperar" (o veículo aguarda a janela acabar) ou "avisar" (só alerta).
CREATE TABLE IF NOT EXISTS restricoes_circulacao (
    id          SERIAL PRIMARY KEY,
    cidade      VARCHAR(120) NOT NULL,
    uf          CHAR(2) NOT NULL,
    bairros     TEXT,
    descricao   VARCHAR(200) NOT NULL,
    categorias  TEXT,
    dias        VARCHAR(20) NOT NULL,
    inicio      VARCHAR(5) NOT NULL,
    fim         VARCHAR(5) NOT NULL,
    tipo        VARCHAR(10) NOT NULL DEFAULT 'proibido',
    finais      JSONB,
    efeito      VARCHAR(10) NOT NULL DEFAULT 'esperar',
    observacao  TEXT,
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Regras iniciais (só na primeira vez). A ZMRC vale no centro expandido de São
-- Paulo: fica como "avisar" para a cidade toda até alguém listar os bairros.
INSERT INTO restricoes_circulacao (cidade, uf, descricao, categorias, dias, inicio, fim, tipo, finais, efeito, observacao)
SELECT * FROM (VALUES
  ('SAO PAULO', 'SP', 'ZMRC — caminhões (exceto VUC) na Zona de Máxima Restrição', 'tres_quartos,toco,truck,carreta', '1,2,3,4,5', '05:00', '21:00', 'proibido', NULL::jsonb, 'avisar',
   'Centro expandido. Confira as regras atuais na CET/Prefeitura de São Paulo e liste os bairros para o sistema esperar a janela.'),
  ('SAO PAULO', 'SP', 'ZMRC — caminhões (exceto VUC) aos sábados', 'tres_quartos,toco,truck,carreta', '6', '10:00', '14:00', 'proibido', NULL::jsonb, 'avisar',
   'Confira as regras atuais na CET/Prefeitura de São Paulo.'),
  ('SAO PAULO', 'SP', 'Rodízio municipal (final de placa)', '', '1,2,3,4,5', '07:00', '10:00', 'rodizio', '{"1":"1,2","2":"3,4","3":"5,6","4":"7,8","5":"9,0"}'::jsonb, 'avisar',
   'Vale no centro expandido. Confira as regras atuais na CET/Prefeitura de São Paulo.'),
  ('SAO PAULO', 'SP', 'Rodízio municipal (final de placa) — tarde', '', '1,2,3,4,5', '17:00', '20:00', 'rodizio', '{"1":"1,2","2":"3,4","3":"5,6","4":"7,8","5":"9,0"}'::jsonb, 'avisar',
   'Vale no centro expandido. Confira as regras atuais na CET/Prefeitura de São Paulo.')
) AS v(cidade, uf, descricao, categorias, dias, inicio, fim, tipo, finais, efeito, observacao)
WHERE NOT EXISTS (SELECT 1 FROM restricoes_circulacao);

-- Faturamento da transportadora (contas a receber): fatura com os CT-e de um
-- tomador, recebimentos (baixas) e cobrança por PIX.
CREATE TABLE IF NOT EXISTS faturas_transporte (
    id                  SERIAL PRIMARY KEY,
    numero              INTEGER NOT NULL UNIQUE,
    tomador_doc         VARCHAR(14) NOT NULL,
    tomador_nome        VARCHAR(120),
    tomador_email       VARCHAR(160),
    emissao             DATE NOT NULL DEFAULT CURRENT_DATE,
    vencimento          DATE NOT NULL,
    valor_bruto         NUMERIC(14,2) NOT NULL,
    desconto            NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor_pago          NUMERIC(14,2) NOT NULL DEFAULT 0,
    status              VARCHAR(12) NOT NULL DEFAULT 'aberta',   -- aberta, parcial, paga, cancelada
    observacoes         TEXT,
    demonstracao        BOOLEAN NOT NULL DEFAULT FALSE,
    enviada_em          TIMESTAMPTZ,
    cancelada_em        TIMESTAMPTZ,
    motivo_cancelamento VARCHAR(255),
    criado_por_nome     VARCHAR(120),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_faturas_transporte_status ON faturas_transporte (status, vencimento);
CREATE INDEX IF NOT EXISTS idx_faturas_transporte_tomador ON faturas_transporte (tomador_doc);
CREATE TABLE IF NOT EXISTS faturas_transporte_pagamentos (
    id          SERIAL PRIMARY KEY,
    fatura_id   INTEGER NOT NULL REFERENCES faturas_transporte(id) ON DELETE CASCADE,
    data        DATE NOT NULL,
    valor       NUMERIC(14,2) NOT NULL,
    forma       VARCHAR(20) NOT NULL DEFAULT 'pix',   -- pix, boleto, deposito, dinheiro, outro
    observacao  VARCHAR(255),
    usuario_nome VARCHAR(120),
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS fatura_id INTEGER REFERENCES faturas_transporte(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ctes_emitidos_fatura ON ctes_emitidos (fatura_id);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS fatura_proximo_numero INTEGER NOT NULL DEFAULT 1;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS fatura_prazo_dias INTEGER NOT NULL DEFAULT 15;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS fatura_instrucoes TEXT;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS pix_chave VARCHAR(80);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS pix_cidade VARCHAR(40);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS banco_nome VARCHAR(60);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS banco_codigo VARCHAR(3);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS banco_agencia VARCHAR(10);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS banco_conta VARCHAR(20);

-- Custos da viagem (no MDF-e) para o resultado por viagem do painel:
-- { combustivel, pedagio, motorista, terceiro, outros } em R$.
ALTER TABLE mdfes ADD COLUMN IF NOT EXISTS custos JSONB;

-- Coletas (pedido do cliente → programação no romaneio → baixa pelo motorista → CT-e).
-- status: pendente, programada (num romaneio que ainda não saiu), em_coleta (o
-- caminhão saiu), coletada, nao_coletada (pode reprogramar) e cancelada.
CREATE TABLE IF NOT EXISTS coletas (
    id                  SERIAL PRIMARY KEY,
    status              VARCHAR(14) NOT NULL DEFAULT 'pendente',
    canal               VARCHAR(12) NOT NULL DEFAULT 'telefone',   -- telefone, whatsapp, email, presencial, edi
    solicitante_nome    VARCHAR(120),
    solicitante_telefone VARCHAR(30),
    solicitante_email   VARCHAR(250),
    remetente_doc       VARCHAR(20),
    remetente_nome      VARCHAR(200) NOT NULL,
    remetente_ie        VARCHAR(30),
    logradouro          VARCHAR(200),
    numero              VARCHAR(30),
    complemento         VARCHAR(150),
    bairro              VARCHAR(120),
    cidade              VARCHAR(120) NOT NULL,
    uf                  CHAR(2) NOT NULL,
    cep                 VARCHAR(10),
    cod_municipio       VARCHAR(10),
    contato_nome        VARCHAR(120),
    contato_telefone    VARCHAR(30),
    destinatario_doc    VARCHAR(20),
    destinatario_nome   VARCHAR(200),
    destino_cidade      VARCHAR(120),
    destino_uf          CHAR(2),
    tomador             VARCHAR(12) NOT NULL DEFAULT 'remetente',   -- remetente, destinatario
    data_coleta         DATE NOT NULL,
    hora_de             VARCHAR(5),
    hora_ate            VARCHAR(5),
    volumes             INTEGER,
    peso_kg             NUMERIC(12,3),
    cubagem_m3          NUMERIC(10,3),
    valor_mercadoria    NUMERIC(14,2),
    produto             VARCHAR(120),
    notas               VARCHAR(250),          -- números das NF, se o cliente já informou
    observacao          TEXT,
    motivo              VARCHAR(250),          -- não coletada / cancelada
    romaneio_id         INTEGER REFERENCES romaneios(id) ON DELETE SET NULL,
    ordem               INTEGER NOT NULL DEFAULT 0,
    coletado_em         TIMESTAMPTZ,
    volumes_coletados   INTEGER,
    peso_coletado       NUMERIC(12,3),
    entregue_por        VARCHAR(120),          -- quem entregou a mercadoria ao motorista
    foto_arquivo        VARCHAR(200),
    assinatura_arquivo  VARCHAR(200),
    latitude            NUMERIC(9,6),
    longitude           NUMERIC(9,6),
    obs_motorista       TEXT,
    cte_id              INTEGER REFERENCES ctes_emitidos(id) ON DELETE SET NULL,
    criado_por_nome     VARCHAR(150),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coletas_status ON coletas (status, data_coleta);
CREATE INDEX IF NOT EXISTS idx_coletas_romaneio ON coletas (romaneio_id);
CREATE INDEX IF NOT EXISTS idx_coletas_remetente ON coletas (remetente_doc);

-- Cotações de frete: calculada pela tabela de preço da empresa, enviada ao
-- cliente (e-mail/WhatsApp/PDF) e, aprovada, vira coleta → CT-e com o preço combinado.
-- status: aberta, enviada, aprovada, recusada, cancelada (vencida = validade passou e não foi aprovada).
CREATE TABLE IF NOT EXISTS cotacoes (
    id                  SERIAL PRIMARY KEY,
    status              VARCHAR(10) NOT NULL DEFAULT 'aberta',
    cliente_doc         VARCHAR(20),
    cliente_nome        VARCHAR(200) NOT NULL,
    cliente_papel       VARCHAR(12) NOT NULL DEFAULT 'remetente',   -- o cliente é o remetente (CIF) ou o destinatário (FOB)
    contato_nome        VARCHAR(120),
    email               VARCHAR(250),
    telefone            VARCHAR(30),
    origem_cidade       VARCHAR(120) NOT NULL,
    origem_uf           CHAR(2) NOT NULL,
    destino_cidade      VARCHAR(120) NOT NULL,
    destino_uf          CHAR(2) NOT NULL,
    destino_bairro      VARCHAR(120),
    volumes             INTEGER,
    peso_kg             NUMERIC(12,3),
    cubagem_m3          NUMERIC(10,3),
    valor_mercadoria    NUMERIC(14,2),
    produto             VARCHAR(120),
    componentes         JSONB NOT NULL DEFAULT '[]',     -- [{ xNome, vComp }]
    valor_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor_tabela        NUMERIC(14,2),                   -- o que a tabela deu (para ver o desconto concedido)
    prazo_dias          INTEGER,
    tabela_nome         VARCHAR(150),
    explicacao          TEXT,
    validade            DATE NOT NULL,
    observacao          TEXT,
    motivo              VARCHAR(250),
    coleta_id           INTEGER REFERENCES coletas(id) ON DELETE SET NULL,
    enviada_em          TIMESTAMPTZ,
    decidida_em         TIMESTAMPTZ,
    criado_por_nome     VARCHAR(150),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_status ON cotacoes (status, validade);
CREATE INDEX IF NOT EXISTS idx_cotacoes_cliente ON cotacoes (cliente_doc);
ALTER TABLE coletas ADD COLUMN IF NOT EXISTS cotacao_id INTEGER REFERENCES cotacoes(id) ON DELETE SET NULL;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cotacao_validade_dias INTEGER NOT NULL DEFAULT 10;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cotacao_condicoes TEXT;

-- Etiquetas de volume e conferência por código de barras (bipagem).
-- Código do volume: 77 + id do CT-e (8 dígitos) + nº do volume (4 dígitos).
-- tipo: carga (saída do romaneio) ou descarga (recebimento no armazém).
CREATE TABLE IF NOT EXISTS conferencias (
    id              SERIAL PRIMARY KEY,
    tipo            VARCHAR(10) NOT NULL DEFAULT 'carga',
    romaneio_id     INTEGER REFERENCES romaneios(id) ON DELETE SET NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'aberta',   -- aberta, concluida
    observacao      TEXT,
    resumo          JSONB,
    usuario_nome    VARCHAR(150),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concluida_em    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_conferencias_romaneio ON conferencias (romaneio_id);
CREATE TABLE IF NOT EXISTS conferencia_leituras (
    id              SERIAL PRIMARY KEY,
    conferencia_id  INTEGER NOT NULL REFERENCES conferencias(id) ON DELETE CASCADE,
    codigo          VARCHAR(60) NOT NULL,
    cte_id          INTEGER REFERENCES ctes_emitidos(id) ON DELETE SET NULL,
    volume          INTEGER,                 -- 0 = CT-e inteiro (leu a chave do DACTE)
    resultado       VARCHAR(12) NOT NULL,    -- ok, sobra
    usuario_nome    VARCHAR(150),
    lido_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conferencia_leituras ON conferencia_leituras (conferencia_id);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS etiqueta_formato VARCHAR(10) NOT NULL DEFAULT '100x100';

-- Filiais (unidades) e transferência entre elas (estilo SSW).
-- Cada CT-e sabe onde a mercadoria está (unidade_atual_id; NULL + em_transferencia
-- = no caminhão entre filiais) e qual unidade entrega (unidade_destino_id, pela
-- lista de cidades atendidas de cada unidade).
CREATE TABLE IF NOT EXISTS unidades (
    id          SERIAL PRIMARY KEY,
    sigla       VARCHAR(6) NOT NULL UNIQUE,
    nome        VARCHAR(120) NOT NULL,
    cidade      VARCHAR(120),
    uf          CHAR(2),
    endereco    VARCHAR(250),
    telefone    VARCHAR(30),
    responsavel VARCHAR(120),
    cidades     TEXT,                     -- cidades que esta unidade entrega (uma por linha ou separadas por vírgula; "Cidade/UF")
    matriz      BOOLEAN NOT NULL DEFAULT FALSE,
    ativa       BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS unidade_origem_id INTEGER REFERENCES unidades(id) ON DELETE SET NULL;
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS unidade_atual_id INTEGER REFERENCES unidades(id) ON DELETE SET NULL;
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS unidade_destino_id INTEGER REFERENCES unidades(id) ON DELETE SET NULL;
ALTER TABLE ctes_emitidos ADD COLUMN IF NOT EXISTS em_transferencia_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_ctes_unidade_atual ON ctes_emitidos (unidade_atual_id);
ALTER TABLE romaneios ADD COLUMN IF NOT EXISTS unidade_id INTEGER REFERENCES unidades(id) ON DELETE SET NULL;

-- Manifesto de transferência: status aberta (carregando), em_transito, recebida.
CREATE TABLE IF NOT EXISTS transferencias (
    id                  SERIAL PRIMARY KEY,
    origem_id           INTEGER NOT NULL REFERENCES unidades(id),
    destino_id          INTEGER NOT NULL REFERENCES unidades(id),
    status              VARCHAR(12) NOT NULL DEFAULT 'aberta',
    motorista_nome      VARCHAR(120),
    motorista_documento VARCHAR(30),
    placa               VARCHAR(10),
    veiculo             VARCHAR(60),
    lacre               VARCHAR(60),
    observacao          TEXT,
    resumo_chegada      JSONB,            -- faltas/sobras do recebimento
    criado_por_nome     VARCHAR(150),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    saiu_em             TIMESTAMPTZ,
    chegou_em           TIMESTAMPTZ,
    recebido_por_nome   VARCHAR(150)
);
CREATE TABLE IF NOT EXISTS transferencia_itens (
    transferencia_id INTEGER NOT NULL REFERENCES transferencias(id) ON DELETE CASCADE,
    cte_id           INTEGER NOT NULL REFERENCES ctes_emitidos(id) ON DELETE CASCADE,
    PRIMARY KEY (transferencia_id, cte_id)
);
CREATE INDEX IF NOT EXISTS idx_transferencia_itens_cte ON transferencia_itens (cte_id);
ALTER TABLE conferencias ADD COLUMN IF NOT EXISTS transferencia_id INTEGER REFERENCES transferencias(id) ON DELETE SET NULL;

-- Contas a pagar (combustível, pedágio, manutenção, frete de terceiro, salários...).
-- status: aberta, paga, cancelada (parcial = aberta com valor_pago > 0).
CREATE TABLE IF NOT EXISTS contas_pagar (
    id              SERIAL PRIMARY KEY,
    descricao       VARCHAR(200) NOT NULL,
    categoria       VARCHAR(20) NOT NULL DEFAULT 'outros',
    fornecedor_nome VARCHAR(200),
    fornecedor_doc  VARCHAR(20),
    documento       VARCHAR(60),          -- nº da NF, boleto, recibo
    vencimento      DATE NOT NULL,
    valor           NUMERIC(14,2) NOT NULL,
    valor_pago      NUMERIC(14,2) NOT NULL DEFAULT 0,
    status          VARCHAR(10) NOT NULL DEFAULT 'aberta',
    parcela         VARCHAR(10),          -- "2/6"
    grupo           VARCHAR(40),          -- parcelas do mesmo lançamento
    acerto_id       INTEGER,
    unidade_id      INTEGER REFERENCES unidades(id) ON DELETE SET NULL,
    observacao      TEXT,
    pago_em         DATE,
    criado_por_nome VARCHAR(150),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_venc ON contas_pagar (status, vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_acerto ON contas_pagar (acerto_id);
CREATE TABLE IF NOT EXISTS contas_pagar_pagamentos (
    id          SERIAL PRIMARY KEY,
    conta_id    INTEGER NOT NULL REFERENCES contas_pagar(id) ON DELETE CASCADE,
    data        DATE NOT NULL,
    valor       NUMERIC(14,2) NOT NULL,
    forma       VARCHAR(20) NOT NULL DEFAULT 'pix',
    observacao  VARCHAR(255),
    usuario_nome VARCHAR(120),
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Acerto de viagem: motorista próprio (adiantamento − despesas comprovadas) ou
-- terceiro/agregado (frete contratado − adiantamento − impostos retidos ± ajustes),
-- com CIOT e vale-pedágio. status: aberto, acertado, cancelado.
CREATE TABLE IF NOT EXISTS acertos (
    id                  SERIAL PRIMARY KEY,
    tipo                VARCHAR(10) NOT NULL DEFAULT 'proprio',   -- proprio, terceiro
    status              VARCHAR(10) NOT NULL DEFAULT 'aberto',
    motorista_nome      VARCHAR(120) NOT NULL,
    motorista_cpf       VARCHAR(14),
    proprietario_nome   VARCHAR(200),         -- terceiro: quem recebe o frete (TAC ou empresa)
    proprietario_doc    VARCHAR(20),
    rntrc               VARCHAR(20),
    placa               VARCHAR(10),
    descricao           VARCHAR(200),         -- rota / viagem
    data_saida          DATE NOT NULL,
    mdfe_id             INTEGER REFERENCES mdfes(id) ON DELETE SET NULL,
    romaneio_id         INTEGER REFERENCES romaneios(id) ON DELETE SET NULL,
    transferencia_id    INTEGER REFERENCES transferencias(id) ON DELETE SET NULL,
    valor_frete         NUMERIC(14,2) NOT NULL DEFAULT 0,   -- terceiro: frete contratado
    adiantamento        NUMERIC(14,2) NOT NULL DEFAULT 0,
    reter_impostos      BOOLEAN NOT NULL DEFAULT FALSE,     -- TAC pessoa física: INSS, SEST/SENAT, IRRF
    inss                NUMERIC(14,2) NOT NULL DEFAULT 0,
    sest_senat          NUMERIC(14,2) NOT NULL DEFAULT 0,
    irrf                NUMERIC(14,2) NOT NULL DEFAULT 0,
    ciot                VARCHAR(20),
    vale_pedagio_valor  NUMERIC(14,2) NOT NULL DEFAULT 0,
    vale_pedagio_cnpj   VARCHAR(20),          -- fornecedora do vale-pedágio
    vale_pedagio_compra VARCHAR(30),          -- nº do comprovante de compra
    prazo_saldo_dias    INTEGER NOT NULL DEFAULT 0,
    observacao          TEXT,
    saldo               NUMERIC(14,2),        -- gravado no acerto (+ empresa paga / − motorista devolve)
    acertado_em         TIMESTAMPTZ,
    acertado_por_nome   VARCHAR(150),
    criado_por_nome     VARCHAR(150),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS acerto_lancamentos (
    id          SERIAL PRIMARY KEY,
    acerto_id   INTEGER NOT NULL REFERENCES acertos(id) ON DELETE CASCADE,
    tipo        VARCHAR(10) NOT NULL,     -- despesa (próprio), desconto, acrescimo
    categoria   VARCHAR(20) NOT NULL DEFAULT 'outros',
    descricao   VARCHAR(200),
    valor       NUMERIC(14,2) NOT NULL,
    data        DATE,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_acerto_lancamentos ON acerto_lancamentos (acerto_id);

-- Boleto registrado (CNAB 240): configuração do banco, boleto de cada fatura,
-- arquivos de remessa e de retorno.
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS boleto_config JSONB;   -- { banco, agencia, agencia_dv, conta, conta_dv, carteira, convenio, ... }
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS boleto_proximo_nn BIGINT NOT NULL DEFAULT 1;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS boleto_proximo_nsa INTEGER NOT NULL DEFAULT 1;
-- boleto_status: gerado, remetido, registrado, rejeitado, pago, baixar (pedido de baixa a enviar), baixado
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_banco VARCHAR(3);
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_nosso_numero VARCHAR(25);
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_nn_exibir VARCHAR(30);
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_linha VARCHAR(47);
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_codigo VARCHAR(44);
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_valor NUMERIC(14,2);
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_vencimento DATE;
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_status VARCHAR(12);
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_mensagem VARCHAR(250);
ALTER TABLE faturas_transporte ADD COLUMN IF NOT EXISTS boleto_remessa_id INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_faturas_boleto_nn ON faturas_transporte (boleto_banco, boleto_nosso_numero) WHERE boleto_nosso_numero IS NOT NULL;
CREATE TABLE IF NOT EXISTS boleto_arquivos (
    id              SERIAL PRIMARY KEY,
    tipo            VARCHAR(8) NOT NULL,       -- remessa, retorno
    banco           VARCHAR(3),
    nsa             INTEGER,
    nome_arquivo    VARCHAR(120),
    conteudo        TEXT NOT NULL,
    qtd             INTEGER NOT NULL DEFAULT 0,
    valor_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
    resultado       JSONB,                     -- retorno: o que foi feito em cada título
    usuario_nome    VARCHAR(150),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Portal do cliente (embarcador): acesso próprio, separado dos usuários do
-- sistema, ligado aos CNPJ/CPF do cliente. Ele vê as cargas em que aparece
-- (remetente, destinatário, expedidor, recebedor ou pagador), baixa DACTE/XML
-- e comprovante, vê as faturas/boletos em que é o pagador, pede coleta e cotação.
CREATE TABLE IF NOT EXISTS portal_usuarios (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(120) NOT NULL,
    email           VARCHAR(250) NOT NULL,
    senha_hash      TEXT NOT NULL,
    cliente_nome    VARCHAR(200),
    documentos      TEXT[] NOT NULL DEFAULT '{}',     -- CNPJ/CPF do cliente (só números)
    por_raiz        BOOLEAN NOT NULL DEFAULT FALSE,    -- vale para todas as filiais (8 primeiros dígitos do CNPJ)
    pode_financeiro BOOLEAN NOT NULL DEFAULT TRUE,     -- vê valores, faturas e boletos
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    trocar_senha    BOOLEAN NOT NULL DEFAULT TRUE,
    sessao_versao   INTEGER NOT NULL DEFAULT 1,        -- muda ao trocar a senha / desativar: derruba os acessos abertos
    reset_hash      VARCHAR(64),
    reset_expira    TIMESTAMPTZ,
    ultimo_acesso   TIMESTAMPTZ,
    criado_por_nome VARCHAR(150),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_usuarios_email ON portal_usuarios (LOWER(email));
ALTER TABLE coletas ADD COLUMN IF NOT EXISTS portal_usuario_id INTEGER REFERENCES portal_usuarios(id) ON DELETE SET NULL;
ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS portal_usuario_id INTEGER REFERENCES portal_usuarios(id) ON DELETE SET NULL;
-- Endereço público do portal (vai nos e-mails de acesso e de "esqueci a senha")
-- e se a cotação pedida no portal já sai com o preço da tabela.
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS portal_endereco VARCHAR(250);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS portal_cotacao_automatica BOOLEAN NOT NULL DEFAULT FALSE;
