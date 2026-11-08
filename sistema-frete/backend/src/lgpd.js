// LGPD (Manutenção » LGPD, só administrador):
//  • Consulta por titular (CPF/CNPJ, e-mail ou nome): onde o sistema guarda dados da pessoa e por quê.
//  • Exportação de tudo o que foi achado (pedido de acesso do titular), com registro de quem exportou.
//  • Anonimização por CPF: tira nome, documento e contatos dos cadastros e registros que não são
//    obrigatórios por lei. Documentos fiscais (NF-e, CT-e), financeiro, jornada do motorista e acertos
//    ficam (guarda obrigatória — LGPD art. 16, I), e a tela diz isso.
//  • Prazo de guarda do histórico de alterações e dos registros de atividades arquivados.
//  • Aviso de privacidade (tela de login e portal do cliente).
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const { contexto } = require('./contextoUsuario');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const dig = (v) => String(v ?? '').replace(/\D/g, '');

const FISCAL = 'Documento fiscal (NF-e / CT-e): guarda obrigatória por lei — não é apagado';
const FONTES = [
  { tabela: 'clientes', rotulo: 'Clientes', doc: ['documento'], nome: ['razao_social', 'nome_fantasia'], email: ['email', 'cobranca_email'],
    anon: ['razao_social', 'nome_fantasia', 'email', 'telefone', 'logradouro', 'numero', 'complemento', 'bairro', 'cep', 'cobranca_email', 'cobranca_whatsapp', 'documento'], base: 'Cadastro de cliente' },
  { tabela: 'motoristas', rotulo: 'Motoristas', doc: ['cpf'], nome: ['nome'], anon: ['nome', 'cpf', 'telefone', 'cnh'], base: 'Cadastro de motorista' },
  { tabela: 'vendedores', rotulo: 'Vendedores', doc: ['documento'], nome: ['nome'], email: ['email'], anon: ['nome', 'documento', 'email', 'telefone'], base: 'Cadastro de vendedor' },
  { tabela: 'parceiros', rotulo: 'Parceiros (redespacho, agregados)', doc: ['documento'], nome: ['nome', 'contato_nome'], email: ['email'],
    anon: ['nome', 'contato_nome', 'telefone', 'email', 'logradouro', 'bairro', 'cep', 'contatos', 'documento'], base: 'Cadastro de parceiro' },
  { tabela: 'cotacoes', rotulo: 'Cotações', doc: ['cliente_doc'], nome: ['cliente_nome', 'contato_nome'], email: ['email'], anon: ['cliente_nome', 'contato_nome', 'email', 'telefone', 'cliente_doc'], base: 'Pedido de cotação' },
  { tabela: 'coletas', rotulo: 'Coletas', doc: ['remetente_doc', 'destinatario_doc'], nome: ['solicitante_nome', 'remetente_nome', 'destinatario_nome', 'contato_nome'], email: ['solicitante_email'],
    anon: ['solicitante_nome', 'solicitante_telefone', 'solicitante_email', 'contato_nome', 'contato_telefone'], base: 'Pedido de coleta' },
  { tabela: 'sac_chamados', rotulo: 'Chamados do SAC', doc: ['cliente_doc'], nome: ['cliente_nome', 'contato_nome'], email: ['contato_email'], anon: ['contato_nome', 'contato_email', 'contato_fone'], base: 'Atendimento (SAC)' },
  { tabela: 'usuarios', rotulo: 'Usuários do sistema', nome: ['nome'], email: ['email'], anon: null, base: 'Acesso ao sistema — para tirar, desative o usuário' },
  { tabela: 'portal_usuarios', rotulo: 'Acessos ao portal do cliente', nome: ['nome'], email: ['email'], anon: null, base: 'Acesso ao portal — para tirar, desative o acesso' },
  { tabela: 'fretes', rotulo: 'Notas fiscais e CT-e recebidos', doc: ['cliente_documento', 'cte_remetente_doc', 'cte_destinatario_doc', 'tomador_cte_cnpj'], nome: ['cliente', 'cte_remetente_nome', 'cte_destinatario_nome'], anon: null, base: FISCAL },
  { tabela: 'ctes_emitidos', rotulo: 'CT-e emitidos', docJson: 'dados', nome: ['remetente_nome', 'destinatario_nome', 'tomador_nome'], anon: null, base: FISCAL },
  { tabela: 'romaneios', rotulo: 'Romaneios', doc: ['motorista_documento'], nome: ['motorista_nome'], anon: null, base: 'Registro da operação de transporte (ligado aos CT-e)' },
  { tabela: 'acertos', rotulo: 'Acertos de viagem', doc: ['motorista_cpf', 'proprietario_doc'], nome: ['motorista_nome', 'proprietario_nome'], anon: null, base: 'Registro financeiro e fiscal (guarda obrigatória)' },
  { tabela: 'jornadas', rotulo: 'Jornada do motorista', doc: ['motorista_cpf'], nome: ['motorista_nome'], anon: null, base: 'Controle de jornada (Lei 13.103): guarda obrigatória' },
  { tabela: 'contas_pagar', rotulo: 'Contas a pagar', doc: ['fornecedor_doc'], nome: ['fornecedor_nome'], anon: null, base: 'Registro financeiro (guarda obrigatória)' },
];
// Colunas que nunca saem na exportação.
const SIGILO = ['senha_hash', 'totp_segredo', 'totp_pendente', 'totp_recuperacao', 'xml_nfe_original', 'xml_cte_original', 'xml_assinado', 'xml_autorizado', 'auditoria_calculo'];

let colunasCache = null;
async function colunas() {
  if (colunasCache) return colunasCache;
  const { rows } = await pool.query("SELECT table_name AS t, column_name AS c, data_type AS tipo, is_nullable = 'YES' AS nulo FROM information_schema.columns WHERE table_schema = 'public'");
  colunasCache = {};
  rows.forEach((r) => { (colunasCache[r.t] ||= {})[r.c] = r; });
  return colunasCache;
}

// Condição SQL do titular numa fonte. tipo: doc | email | nome.
function condicao(f, cols, busca, params) {
  const existe = (c) => !!cols[c];
  const d = dig(busca);
  if (d.length === 11 || d.length === 14) {
    const ds = (f.doc || []).filter(existe);
    params.push(d);
    const n = params.length;
    const partes = ds.map((c) => `regexp_replace(COALESCE(${c}::text, ''), '\\D', '', 'g') = $${n}`);
    if (f.docJson && existe(f.docJson)) partes.push(`${f.docJson}::text LIKE '%' || $${n} || '%'`);
    return partes.length ? `(${partes.join(' OR ')})` : null;
  }
  if (busca.includes('@')) {
    const es = (f.email || []).filter(existe);
    if (!es.length) return null;
    params.push(busca.toLowerCase());
    return `(${es.map((c) => `LOWER(${c}) = $${params.length}`).join(' OR ')})`;
  }
  const ns = (f.nome || []).filter(existe);
  if (!ns.length) return null;
  params.push(busca);
  return `(${ns.map((c) => `${c} ILIKE '%' || $${params.length} || '%'`).join(' OR ')})`;
}
function validarBusca(busca) {
  const b = String(busca || '').trim();
  const d = dig(b);
  if (d.length === 11 || d.length === 14 || b.includes('@')) return b;
  if (b.replace(/\s/g, '').length < 5) throw falha('Digite o CPF ou CNPJ, o e-mail ou pelo menos 5 letras do nome.');
  return b;
}

// Onde há dados do titular: quantidade por fonte e alguns exemplos.
async function consultar(busca) {
  const b = validarBusca(busca);
  const todas = await colunas();
  const fontes = [];
  for (const f of FONTES) {
    const cols = todas[f.tabela];
    if (!cols) continue;
    const params = [];
    const cond = condicao(f, cols, b, params);
    if (!cond) continue;
    const mostrar = [...new Set([...(f.nome || []), ...(f.doc || [])])].filter((c) => cols[c]);
    const { rows } = await pool.query(`SELECT id, ${mostrar.join(', ')}, COUNT(*) OVER ()::int AS total FROM ${f.tabela} WHERE ${cond} ORDER BY id DESC LIMIT 20`, params);
    if (!rows.length) continue;
    fontes.push({ tabela: f.tabela, rotulo: f.rotulo, base: f.base, anonimizavel: !!f.anon, quantidade: rows[0].total,
      exemplos: rows.map(({ total, ...r }) => r) });
  }
  return { busca: b, cpf: dig(b).length === 11, fontes };
}

// Tudo o que foi achado, com todas as colunas (menos senhas, segredos e XML).
async function exportar(busca) {
  const b = validarBusca(busca);
  const todas = await colunas();
  const saida = { titular: b, gerado_em: new Date().toISOString(), observacao: 'Dados pessoais encontrados no Nexofrete para este titular. Documentos fiscais seguem guardados por obrigação legal.', fontes: {} };
  for (const f of FONTES) {
    const cols = todas[f.tabela];
    if (!cols) continue;
    const params = [];
    const cond = condicao(f, cols, b, params);
    if (!cond) continue;
    const lista = Object.keys(cols).filter((c) => !SIGILO.includes(c));
    const { rows } = await pool.query(`SELECT ${lista.map((c) => `"${c}"`).join(', ')} FROM ${f.tabela} WHERE ${cond} ORDER BY id LIMIT 500`, params);
    if (rows.length) saida.fontes[f.rotulo] = { base_legal: f.base, registros: rows };
  }
  return saida;
}

// Anonimização por CPF (pessoa física): só nos cadastros e registros que não são obrigatórios por lei.
async function anonimizar(cpf) {
  const d = dig(cpf);
  if (d.length !== 11) throw falha('A anonimização é por CPF (pessoa física): digite os 11 números.');
  const todas = await colunas();
  const resultado = [];
  // Sem o usuário no contexto: os gatilhos de histórico não guardam os dados que estão saindo.
  await contexto.exit(async () => {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      for (const f of FONTES.filter((x) => x.anon)) {
        const cols = todas[f.tabela];
        if (!cols) continue;
        const params = [];
        const cond = condicao(f, cols, d, params);
        if (!cond) continue;
        const sets = f.anon.filter((c) => cols[c]).map((c) => {
          const col = cols[c];
          if (col.tipo === 'jsonb' || col.tipo === 'json') return `${c} = '[]'::jsonb`;
          if (!/char|text/.test(col.tipo)) return null;
          if (/nome|razao|fantasia/.test(c)) return `${c} = 'TITULAR ANONIMIZADO'`;
          return col.nulo ? `${c} = NULL` : `${c} = 'ANON-' || id`;
        }).filter(Boolean);
        if (!sets.length) continue;
        const { rows } = await cliente.query(`UPDATE ${f.tabela} SET ${sets.join(', ')} WHERE ${cond} RETURNING id`, params);
        if (!rows.length) continue;
        // O histórico de alterações desses registros também tinha os dados antigos.
        await cliente.query('DELETE FROM alteracoes WHERE tabela = $1 AND registro_id = ANY($2::text[])', [f.tabela, rows.map((r) => String(r.id))]);
        resultado.push({ rotulo: f.rotulo, quantidade: rows.length });
      }
      await cliente.query('COMMIT');
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { cliente.release(); }
  });
  return resultado;
}

// ---------- Prazo de guarda ----------
const PASTA_LOGS = path.join(__dirname, '..', 'dados', 'logs-auditoria');
async function limparPorPrazo() {
  const { rows: [c] } = await pool.query('SELECT lgpd_retencao_dias FROM configuracao_seguranca WHERE id = 1');
  const dias = Number(c?.lgpd_retencao_dias) || 0;
  if (dias <= 0) return { alteracoes: 0, arquivos: 0 };
  const { rowCount } = await pool.query("DELETE FROM alteracoes WHERE quando < NOW() - ($1 || ' days')::interval", [String(dias)]);
  // Registros de atividades arquivados por dia (dados/logs-auditoria/AAAA-MM/AAAA-MM-DD.json).
  const limite = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  let arquivos = 0;
  if (fs.existsSync(PASTA_LOGS)) {
    for (const mes of fs.readdirSync(PASTA_LOGS)) {
      const pasta = path.join(PASTA_LOGS, mes);
      if (!fs.statSync(pasta).isDirectory()) continue;
      for (const arq of fs.readdirSync(pasta)) {
        const dia = arq.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dia) && dia < limite) { fs.rmSync(path.join(pasta, arq), { force: true }); arquivos += 1; }
      }
      if (!fs.readdirSync(pasta).length) fs.rmdirSync(pasta);
    }
  }
  if (rowCount || arquivos) console.log(`[lgpd] prazo de guarda (${dias} dias): ${rowCount} alteração(ões) e ${arquivos} arquivo(s) de registro apagados.`);
  return { alteracoes: rowCount, arquivos };
}

// ---------- Aviso de privacidade ----------
async function avisoPrivacidade() {
  const { rows: [c] } = await pool.query('SELECT aviso_privacidade FROM configuracao_seguranca WHERE id = 1');
  if (c?.aviso_privacidade) return c.aviso_privacidade;
  const { rows: [e] } = await pool.query('SELECT razao_social, nome_fantasia, email FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
  const nome = e?.razao_social || e?.nome_fantasia || 'A empresa';
  return `${nome} usa este sistema para emitir, conferir e acompanhar documentos de transporte (NF-e, CT-e, MDF-e), entregas, cobranças e pagamentos.

Dados tratados: nome, CPF ou CNPJ, e-mail, telefone e endereço de clientes, destinatários, motoristas, parceiros e usuários; registros de acesso (data, hora, IP e aparelho).

Para quê: executar o transporte e o contrato, cumprir obrigações legais e fiscais (os documentos fiscais são guardados pelo prazo da lei), cobrar e pagar, e proteger o sistema contra acessos indevidos.

Com quem: com a SEFAZ e órgãos públicos quando a lei exige, e com transportadoras e parceiros que participam da entrega.

Seus direitos: confirmar se tratamos seus dados, acessar, corrigir, pedir a anonimização ou a exclusão do que não é obrigatório guardar, e saber com quem compartilhamos.${e?.email ? ` Fale com a gente em ${e.email}.` : ' Fale com a empresa pelos canais de atendimento.'}`;
}

module.exports = { FONTES, consultar, exportar, anonimizar, limparPorPrazo, avisoPrivacidade };
