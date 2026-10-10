-- =====================================================================
--  TransportadoraCTe - estrutura do banco PostgreSQL
--  Execute conectado ao banco criado para o sistema, por exemplo:
--     CREATE DATABASE transportadora ENCODING 'UTF8';
--     \c transportadora
--     \i schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Usuarios do sistema
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id            SERIAL PRIMARY KEY,
    nome          VARCHAR(100) NOT NULL,
    login         VARCHAR(40)  NOT NULL UNIQUE,
    senha_hash    VARCHAR(88)  NOT NULL,
    senha_salt    VARCHAR(44)  NOT NULL,
    perfil        VARCHAR(10)  NOT NULL DEFAULT 'OPERADOR'
                  CHECK (perfil IN ('ADMIN','OPERADOR','CONSULTA')),
    ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMP    NOT NULL DEFAULT now(),
    ultimo_acesso TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Empresa emitente (a transportadora) - um unico registro (id = 1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresa (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    cnpj            VARCHAR(14)  NOT NULL,
    ie              VARCHAR(14)  NOT NULL,
    razao_social    VARCHAR(60)  NOT NULL,
    nome_fantasia   VARCHAR(60),
    rntrc           VARCHAR(8)   NOT NULL,
    crt             SMALLINT     NOT NULL DEFAULT 3,   -- 1=Simples Nacional 2=Simples excesso 3=Regime normal 4=MEI
    logradouro      VARCHAR(255) NOT NULL,
    numero          VARCHAR(60)  NOT NULL,
    complemento     VARCHAR(60),
    bairro          VARCHAR(60)  NOT NULL,
    cod_municipio   VARCHAR(7)   NOT NULL,             -- codigo IBGE
    municipio       VARCHAR(60)  NOT NULL,
    uf              CHAR(2)      NOT NULL,
    cep             VARCHAR(8)   NOT NULL,
    fone            VARCHAR(14),
    email           VARCHAR(60),
    serie_cte       INTEGER      NOT NULL DEFAULT 1,
    proximo_numero  INTEGER      NOT NULL DEFAULT 1,
    ambiente        SMALLINT     NOT NULL DEFAULT 2,   -- 1=Producao 2=Homologacao
    cert_thumbprint VARCHAR(64),                       -- certificado no repositorio do Windows
    resp_tec_cnpj   VARCHAR(14),                       -- responsavel tecnico (opcional)
    resp_tec_contato VARCHAR(60),
    resp_tec_email  VARCHAR(60),
    resp_tec_fone   VARCHAR(14)
);

-- ---------------------------------------------------------------------
-- Clientes (remetentes, destinatarios, tomadores)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id             SERIAL PRIMARY KEY,
    tipo_pessoa    CHAR(1)      NOT NULL DEFAULT 'J' CHECK (tipo_pessoa IN ('J','F')),
    cpf_cnpj       VARCHAR(14)  NOT NULL UNIQUE,
    ie             VARCHAR(14),                        -- vazio ou ISENTO para nao contribuinte
    contribuinte   SMALLINT     NOT NULL DEFAULT 1,    -- 1=Contribuinte 2=Isento 9=Nao contribuinte
    razao_social   VARCHAR(60)  NOT NULL,
    nome_fantasia  VARCHAR(60),
    logradouro     VARCHAR(255) NOT NULL,
    numero         VARCHAR(60)  NOT NULL,
    complemento    VARCHAR(60),
    bairro         VARCHAR(60)  NOT NULL,
    cod_municipio  VARCHAR(7)   NOT NULL,
    municipio      VARCHAR(60)  NOT NULL,
    uf             CHAR(2)      NOT NULL,
    cep            VARCHAR(8),
    fone           VARCHAR(14),
    email          VARCHAR(60),
    ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em      TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_clientes_nome ON clientes (razao_social);

-- ---------------------------------------------------------------------
-- Conhecimentos de transporte (CT-e modelo 57, modal rodoviario)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ctes (
    id                  SERIAL PRIMARY KEY,
    serie               INTEGER       NOT NULL,
    numero              INTEGER       NOT NULL,
    chave               VARCHAR(44),
    codigo_numerico     VARCHAR(8),
    ambiente            SMALLINT      NOT NULL,
    data_emissao        TIMESTAMP     NOT NULL DEFAULT now(),
    cfop                VARCHAR(4)    NOT NULL,
    natureza_operacao   VARCHAR(60)   NOT NULL,
    remetente_id        INTEGER       NOT NULL REFERENCES clientes(id),
    destinatario_id     INTEGER       NOT NULL REFERENCES clientes(id),
    tomador             SMALLINT      NOT NULL DEFAULT 0,   -- 0=Remetente 1=Expedidor 2=Recebedor 3=Destinatario
    cod_mun_inicio      VARCHAR(7)    NOT NULL,
    mun_inicio          VARCHAR(60)   NOT NULL,
    uf_inicio           CHAR(2)       NOT NULL,
    cod_mun_fim         VARCHAR(7)    NOT NULL,
    mun_fim             VARCHAR(60)   NOT NULL,
    uf_fim              CHAR(2)       NOT NULL,
    valor_prestacao     NUMERIC(15,2) NOT NULL,
    valor_receber       NUMERIC(15,2) NOT NULL,
    cst_icms            VARCHAR(2)    NOT NULL,             -- 00, 40, 41, 51, 90SN
    base_icms           NUMERIC(15,2) NOT NULL DEFAULT 0,
    aliquota_icms       NUMERIC(5,2)  NOT NULL DEFAULT 0,
    valor_icms          NUMERIC(15,2) NOT NULL DEFAULT 0,
    produto_predominante VARCHAR(60)  NOT NULL,
    valor_carga         NUMERIC(15,2) NOT NULL,
    peso_kg             NUMERIC(15,4) NOT NULL,
    chaves_nfe          TEXT,                                -- uma chave por linha
    observacoes         VARCHAR(2000),
    status              VARCHAR(12)   NOT NULL DEFAULT 'DIGITACAO'
                        CHECK (status IN ('DIGITACAO','AUTORIZADO','REJEITADO','CANCELADO','DENEGADO')),
    cstat               VARCHAR(3),
    xmotivo             VARCHAR(500),
    protocolo           VARCHAR(20),
    data_autorizacao    TIMESTAMP,
    protocolo_cancel    VARCHAR(20),
    xml_assinado        TEXT,
    xml_autorizado      TEXT,                                -- cteProc
    xml_cancelamento    TEXT,
    usuario_id          INTEGER REFERENCES usuarios(id),
    criado_em           TIMESTAMP     NOT NULL DEFAULT now(),
    UNIQUE (ambiente, serie, numero)
);
CREATE INDEX IF NOT EXISTS ix_ctes_data   ON ctes (data_emissao);
CREATE INDEX IF NOT EXISTS ix_ctes_chave  ON ctes (chave);
CREATE INDEX IF NOT EXISTS ix_ctes_status ON ctes (status);

-- ---------------------------------------------------------------------
-- Log de comunicacao com a SEFAZ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sefaz_log (
    id          SERIAL PRIMARY KEY,
    cte_id      INTEGER REFERENCES ctes(id),
    servico     VARCHAR(40) NOT NULL,
    envio       TEXT,
    retorno     TEXT,
    criado_em   TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Usuario inicial:  login = admin   senha = admin
-- (troque a senha no primeiro acesso, em Cadastros > Usuarios)
-- ---------------------------------------------------------------------
INSERT INTO usuarios (nome, login, senha_hash, senha_salt, perfil)
SELECT 'Administrador', 'admin', 'J61gq9p+gUFEUp/BhhoP3n01iRmalv5vMKtpqOZ9o1Q=', 'YrXqdwUaCYTgzmOVr2kNWA==', 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE login = 'admin');
