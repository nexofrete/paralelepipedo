// Zerar o banco de dados (Manutenção, só administrador): apaga a movimentação para começar
// sem informações. Sempre faz um backup antes (dá para voltar em Manutenção » Backups » Restaurar).
// Nunca apaga: usuários, perfis de acesso, dados da empresa (certificado, séries, configurações),
// configurações de e-mail/backup/segurança/WhatsApp/pasta XML/ERP, chaves de API e webhooks.
// Cadastros (transportadoras, tabelas de preço, clientes, parceiros, veículos, motoristas, filiais...)
// ficam, a não ser que se marque para apagar também.
// A numeração fiscal em produção (CT-e, MDF-e, NFS-e) continua de onde parou: número repetido é rejeitado pela SEFAZ.
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const SEMPRE = ['usuarios', 'perfis_acesso', 'sessoes', 'empresa', 'configuracao_auditoria', 'configuracao_backup', 'configuracao_email', 'configuracao_importacao_erp',
  'configuracao_pasta_xml', 'configuracao_roteirizacao', 'configuracao_seguranca', 'configuracao_whatsapp', 'contas_email', 'api_chaves', 'webhooks',
  'erp_modelos', 'feriados', 'geocodificacao_cache', 'sefaz_cadastros'];
const CADASTROS = ['transportadoras', 'tabelas_preco', 'tabela_preco_faixas', 'tabelas_preco_versoes', 'clientes', 'parceiros', 'parceiro_tabela', 'parceiro_documentos',
  'veiculos', 'motoristas', 'unidades', 'centros_custo', 'contas_bancarias', 'vendedores', 'manutencao_planos', 'servicos_extras_regras', 'portal_usuarios',
  'metas_frete', 'restricoes_circulacao', 'pneus', 'frota_documentos', 'armazem_contratos',
  // Cadastros básicos (907)
  'fornecedores', 'ajudantes', 'conjuntos_veiculo', 'produtos', 'tipos_mercadoria', 'departamentos', 'regioes_atendimento', 'tipos_operacao', 'condicoes_pagamento'];
// Pastas de arquivos da movimentação (fotos de canhoto, assinaturas, anexos).
const PASTAS = ['comprovantes-cte', 'comprovantes-coleta', 'anexos'];
const PASTA_DADOS = path.join(__dirname, '..', 'dados');
const NOMES = { fretes: 'Fretes / notas e CT-e recebidos', ctes_emitidos: 'CT-e emitidos', mdfes: 'MDF-e', nfse_emitidas: 'NFS-e', coletas: 'Coletas', cotacoes: 'Cotações',
  romaneios: 'Romaneios', faturas_transporte: 'Faturas (contas a receber)', faturas_frete: 'Faturas das transportadoras', contas_pagar: 'Contas a pagar',
  movimentos_bancarios: 'Movimentos de caixa e bancos', cte_ocorrencias: 'Ocorrências', sinistros: 'Sinistros', mensagens: 'Mensagens', agenda_eventos: 'Agenda',
  auditoria: 'Registro de atividades', abastecimentos: 'Abastecimentos', manutencoes: 'Manutenções', sac_chamados: 'Chamados do SAC', notas_entrada: 'Notas de entrada' };

async function tabelas(cliente = pool) {
  const { rows } = await cliente.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  return rows.map((r) => r.t);
}
const contar = async (cliente, t) => Number((await cliente.query(`SELECT COUNT(*)::int AS n FROM "${t}"`)).rows[0].n);

// O que seria apagado (para a tela mostrar antes).
async function previa() {
  const todas = await tabelas();
  const mov = todas.filter((t) => !SEMPRE.includes(t) && !CADASTROS.includes(t));
  const principais = [];
  for (const t of Object.keys(NOMES)) if (mov.includes(t)) { const n = await contar(pool, t); if (n) principais.push({ tabela: t, nome: NOMES[t], quantidade: n }); }
  let cadastros = 0;
  for (const t of CADASTROS) if (todas.includes(t)) cadastros += await contar(pool, t);
  return { movimentacao: principais, cadastros, pastas: PASTAS };
}

// Tabela que fica e aponta (chave estrangeira) para uma que vai ser apagada: limpa o campo, se puder;
// se o campo for obrigatório, a tabela apontada fica também (nunca apaga em cascata o que deveria ficar).
async function ajustarDependencias(cliente, apagar, manter) {
  for (let volta = 0; volta < 20; volta += 1) {
    const { rows } = await cliente.query(
      `SELECT c.conrelid::regclass::text AS tabela, a.attname AS coluna, a.attnotnull AS obrigatoria, c.confrelid::regclass::text AS aponta
         FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'f' AND c.conrelid::regclass::text = ANY($1::text[]) AND c.confrelid::regclass::text = ANY($2::text[])`, [[...manter], [...apagar]]);
    const obrigatorias = rows.filter((r) => r.obrigatoria);
    if (!obrigatorias.length) {
      for (const r of rows) await cliente.query(`UPDATE "${r.tabela}" SET "${r.coluna}" = NULL WHERE "${r.coluna}" IS NOT NULL`);
      return;
    }
    obrigatorias.forEach((r) => { apagar.delete(r.aponta); manter.add(r.aponta); });
  }
  throw new Error('Não consegui separar o que fica do que sai (dependências demais).');
}

// pastaDados e backup só mudam nos testes (cópia descartável do banco).
async function zerar({ apagarCadastros = false, pastaDados = PASTA_DADOS, backup = () => require('./backup').executarBackupComTratamentoDeErro() } = {}) {
  // 1) Backup antes, sempre. Sem backup, não apaga nada.
  const copia = await backup();
  const cliente = await pool.connect();
  let apagadas = [];
  try {
    await cliente.query('BEGIN');
    const todas = await tabelas(cliente);
    const manter = new Set(todas.filter((t) => SEMPRE.includes(t) || (!apagarCadastros && CADASTROS.includes(t))));
    const apagar = new Set(todas.filter((t) => !manter.has(t)));
    // 2) Numeração fiscal em produção segue de onde parou.
    await cliente.query(`UPDATE empresa e SET
        cte_proximo_numero = GREATEST(e.cte_proximo_numero, COALESCE((SELECT MAX(numero) + 1 FROM ctes_emitidos WHERE ambiente = 1 AND serie = e.cte_serie), 1)),
        mdfe_proximo_numero = GREATEST(e.mdfe_proximo_numero, COALESCE((SELECT MAX(numero) + 1 FROM mdfes WHERE ambiente = 1 AND serie = e.mdfe_serie), 1)),
        nfse_proximo_dps = GREATEST(e.nfse_proximo_dps, COALESCE((SELECT MAX(numero_dps) + 1 FROM nfse_emitidas WHERE ambiente = 1 AND serie = e.nfse_serie), 1))
      WHERE e.id = 1`);
    await ajustarDependencias(cliente, apagar, manter);
    apagadas = [...apagar];
    if (apagadas.length) await cliente.query(`TRUNCATE ${apagadas.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY`);
    if (apagarCadastros) await cliente.query("UPDATE usuarios SET unidades_permitidas = '{}'");   // as filiais saíram
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw Object.assign(new Error(`Nada foi apagado: ${err.message}`), { backup: copia.arquivo });
  } finally { cliente.release(); }
  // 3) Arquivos da movimentação (o backup já tem uma cópia).
  let arquivos = 0;
  for (const p of PASTAS) {
    const dir = path.join(pastaDados, p);
    if (!fs.existsSync(dir)) continue;
    for (const nome of fs.readdirSync(dir)) { fs.rmSync(path.join(dir, nome), { recursive: true, force: true }); arquivos += 1; }
  }
  return { backup: copia.arquivo, tabelas: apagadas.length, arquivos, cadastros: apagarCadastros };
}

module.exports = { previa, zerar, SEMPRE, CADASTROS };
