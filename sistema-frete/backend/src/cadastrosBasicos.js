// Cadastros básicos (Configuração » Cadastros básicos): um motor só para fornecedores, ajudantes,
// conjuntos de veículos (cavalo + carretas), produtos, tipos de mercadoria, departamentos,
// regiões de atendimento, tipos de operação e condições de pagamento. Cada cadastro é descrito
// em DEFS (campos, quem edita) e a mesma tela e as mesmas rotas servem para todos.
const pool = require('./db');
const { temAlguma } = require('./permissoes');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const CATEGORIAS = require('./contasPagar').CATEGORIAS;
const SERVICOS = { 0: 'Normal', 1: 'Subcontratação', 2: 'Redespacho', 3: 'Redespacho intermediário' };
const TOMADORES = { 0: 'Remetente', 1: 'Expedidor', 2: 'Recebedor', 3: 'Destinatário', 4: 'Outros' };

// tipo: texto | doc | uf | numero | inteiro | bool | select | ref | refs | lista | dias | semana
const DEFS = {
  fornecedores: { titulo: 'Fornecedores', icone: '🏭', nome: 'razao_social', editar: ['pode_ver_financeiro'], busca: ['razao_social', 'nome_fantasia', 'documento', 'municipio'],
    ajuda: 'Quem a empresa paga: posto, oficina, seguradora, aluguel... Usado nas contas a pagar (com a condição de pagamento, as parcelas saem sozinhas).',
    campos: [
      { nome: 'documento', rotulo: 'CNPJ / CPF', tipo: 'doc', unico: true }, { nome: 'razao_social', rotulo: 'Razão social / nome', tipo: 'texto', max: 200, obrig: true },
      { nome: 'nome_fantasia', rotulo: 'Nome fantasia', tipo: 'texto', max: 150 }, { nome: 'ie', rotulo: 'Inscrição estadual', tipo: 'texto', max: 30 },
      { nome: 'email', rotulo: 'E-mail', tipo: 'texto', max: 150 }, { nome: 'telefone', rotulo: 'Telefone', tipo: 'texto', max: 40 },
      { nome: 'cep', rotulo: 'CEP', tipo: 'texto', max: 10 }, { nome: 'logradouro', rotulo: 'Endereço', tipo: 'texto', max: 200 }, { nome: 'numero', rotulo: 'Número', tipo: 'texto', max: 20 },
      { nome: 'bairro', rotulo: 'Bairro', tipo: 'texto', max: 100 }, { nome: 'municipio', rotulo: 'Cidade', tipo: 'texto', max: 100 }, { nome: 'uf', rotulo: 'UF', tipo: 'uf' },
      { nome: 'categoria_padrao', rotulo: 'Categoria de despesa padrão', tipo: 'select', opcoes: CATEGORIAS },
      { nome: 'condicao_pagamento_id', rotulo: 'Condição de pagamento', tipo: 'ref', fonte: 'condicoes_pagamento' },
      { nome: 'pix', rotulo: 'Chave PIX', tipo: 'texto', max: 150 }, { nome: 'observacoes', rotulo: 'Observações', tipo: 'texto', max: 500 },
    ] },
  ajudantes: { titulo: 'Ajudantes', icone: '🧑‍🔧', nome: 'nome', editar: ['pode_emitir_cte'], busca: ['nome', 'cpf'],
    ajuda: 'Ajudantes de carga e descarga. No romaneio, escolha os ajudantes da viagem; ao fechar o romaneio, a diária vira conta a pagar.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 150, obrig: true }, { nome: 'cpf', rotulo: 'CPF', tipo: 'doc', unico: true, so: 'cpf' },
      { nome: 'telefone', rotulo: 'Telefone', tipo: 'texto', max: 40 }, { nome: 'diaria', rotulo: 'Diária (R$)', tipo: 'numero', min: 0, padrao: 0 },
      { nome: 'pix', rotulo: 'Chave PIX', tipo: 'texto', max: 150 }, { nome: 'unidade_id', rotulo: 'Filial', tipo: 'ref', fonte: 'unidades' },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'texto', max: 500 },
    ] },
  conjuntos_veiculo: { titulo: 'Conjuntos (cavalo + carretas)', icone: '🚛', nome: 'descricao', editar: ['pode_emitir_cte'], busca: ['descricao'],
    ajuda: 'O cavalo mecânico e as carretas/implementos que ele costuma puxar. Escolher o cavalo no MDF-e e no romaneio já traz as carretas. As carretas são cadastradas em Veículos e motoristas (tipo reboque).',
    campos: [
      { nome: 'cavalo_id', rotulo: 'Cavalo (tração)', tipo: 'ref', fonte: 'veiculos_tracao', obrig: true },
      { nome: 'reboques', rotulo: 'Carretas / implementos (até 3)', tipo: 'refs', fonte: 'veiculos_reboque', max: 3 },
      { nome: 'motorista_id', rotulo: 'Motorista de costume', tipo: 'ref', fonte: 'motoristas' }, { nome: 'descricao', rotulo: 'Descrição (ex.: Bitrem graneleiro)', tipo: 'texto', max: 150 },
    ] },
  produtos: { titulo: 'Produtos', icone: '📦', nome: 'descricao', editar: ['pode_emitir_cte'], busca: ['codigo', 'descricao', 'ncm'],
    ajuda: 'Produtos transportados ou armazenados. O peso e as medidas calculam a cubagem na cotação; a descrição vira sugestão de "produto predominante" no CT-e.',
    campos: [
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', max: 60, obrig: true, unico: true }, { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', max: 250, obrig: true },
      { nome: 'ncm', rotulo: 'NCM', tipo: 'texto', max: 10 }, { nome: 'unidade', rotulo: 'Unidade (UN, CX, KG...)', tipo: 'texto', max: 10 }, { nome: 'embalagem', rotulo: 'Embalagem', tipo: 'texto', max: 60 },
      { nome: 'peso_kg', rotulo: 'Peso por unidade (kg)', tipo: 'numero', min: 0 }, { nome: 'altura_cm', rotulo: 'Altura (cm)', tipo: 'numero', min: 0 },
      { nome: 'largura_cm', rotulo: 'Largura (cm)', tipo: 'numero', min: 0 }, { nome: 'comprimento_cm', rotulo: 'Comprimento (cm)', tipo: 'numero', min: 0 },
      { nome: 'valor_unitario', rotulo: 'Valor unitário (R$)', tipo: 'numero', min: 0 }, { nome: 'tipo_mercadoria_id', rotulo: 'Tipo de mercadoria', tipo: 'ref', fonte: 'tipos_mercadoria' },
      { nome: 'perigoso', rotulo: 'Produto perigoso', tipo: 'bool' }, { nome: 'onu', rotulo: 'Número ONU', tipo: 'texto', max: 6 }, { nome: 'classe_risco', rotulo: 'Classe de risco', tipo: 'texto', max: 10 },
      { nome: 'cliente_documento', rotulo: 'CNPJ do cliente dono (opcional)', tipo: 'doc' }, { nome: 'observacoes', rotulo: 'Observações', tipo: 'texto', max: 500 },
    ] },
  tipos_mercadoria: { titulo: 'Tipos de mercadoria', icone: '🏷️', nome: 'nome', editar: ['pode_emitir_cte'], busca: ['nome'],
    ajuda: 'A natureza da carga (geral, refrigerada, perigosa, granel, alto valor...). Aparece no CT-e e na cotação e orienta seguro e gerenciamento de risco.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 80, obrig: true, unico: true }, { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', max: 300 },
      { nome: 'perigosa', rotulo: 'Carga perigosa', tipo: 'bool' }, { nome: 'refrigerada', rotulo: 'Refrigerada', tipo: 'bool' }, { nome: 'exige_escolta', rotulo: 'Exige escolta / gerenciamento de risco', tipo: 'bool' },
    ] },
  departamentos: { titulo: 'Departamentos', icone: '🏢', nome: 'nome', editar: ['pode_gerenciar_usuarios', 'pode_ver_financeiro'], busca: ['nome', 'responsavel'],
    ajuda: 'Setores da empresa (Operação, Financeiro, Comercial...). Ficam no cadastro do usuário e nas contas a pagar, para ver as despesas por departamento.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 80, obrig: true, unico: true }, { nome: 'responsavel', rotulo: 'Responsável', tipo: 'texto', max: 150 },
      { nome: 'centro_custo_id', rotulo: 'Centro de custo', tipo: 'ref', fonte: 'centros_custo' },
    ] },
  regioes_atendimento: { titulo: 'Regiões de atendimento', icone: '🗺️', nome: 'nome', editar: ['pode_emitir_cte'], busca: ['nome'],
    ajuda: 'O que cada filial atende: estados, cidades ou faixas de CEP, o prazo de entrega e os dias da semana. A cotação e o CT-e usam para sugerir a filial e a previsão de entrega (a faixa de CEP vale mais que a cidade, e a cidade mais que o estado).',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 100, obrig: true }, { nome: 'unidade_id', rotulo: 'Filial que atende', tipo: 'ref', fonte: 'unidades' },
      { nome: 'ufs', rotulo: 'Estados (UF), separados por vírgula', tipo: 'lista', formato: 'uf' },
      { nome: 'cidades', rotulo: 'Cidades (CIDADE/UF, uma por linha)', tipo: 'lista', formato: 'cidade' },
      { nome: 'ceps', rotulo: 'Faixas de CEP (01000-000 a 05999-999, uma por linha)', tipo: 'lista', formato: 'cep' },
      { nome: 'prazo_dias', rotulo: 'Prazo de entrega (dias úteis)', tipo: 'inteiro', min: 0, max: 60 }, { nome: 'dias_semana', rotulo: 'Dias de atendimento', tipo: 'semana' },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'texto', max: 500 },
    ] },
  tipos_operacao: { titulo: 'Tipos de operação', icone: '🔀', nome: 'nome', editar: ['pode_emitir_cte'], busca: ['nome', 'cfop_estadual', 'cfop_interestadual'],
    ajuda: 'Modelos de CT-e: escolher o tipo de operação preenche o CFOP (dentro ou fora do estado, pela rota), a natureza, o tipo de serviço e o tomador.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 80, obrig: true, unico: true },
      { nome: 'cfop_estadual', rotulo: 'CFOP dentro do estado', tipo: 'texto', max: 4, formato: 'cfop' }, { nome: 'cfop_interestadual', rotulo: 'CFOP para outro estado', tipo: 'texto', max: 4, formato: 'cfop' },
      { nome: 'natureza', rotulo: 'Natureza da operação', tipo: 'texto', max: 60 }, { nome: 'tp_serv', rotulo: 'Tipo de serviço', tipo: 'select', opcoes: SERVICOS, padrao: 0 },
      { nome: 'tomador', rotulo: 'Tomador (quem paga)', tipo: 'select', opcoes: TOMADORES }, { nome: 'tipo_mercadoria_id', rotulo: 'Tipo de mercadoria', tipo: 'ref', fonte: 'tipos_mercadoria' },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'texto', max: 500 },
    ] },
  condicoes_pagamento: { titulo: 'Condições de pagamento', icone: '📅', nome: 'nome', editar: ['pode_ver_financeiro'], busca: ['nome'],
    ajuda: 'Prazos de pagamento (à vista, 30 dias, 30/60/90...). Ficam no cliente (vencimento da fatura) e no fornecedor (parcelas das contas a pagar).',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 60, obrig: true, unico: true },
      { nome: 'parcelas', rotulo: 'Dias de cada parcela (ex.: 30, 60, 90; 0 = à vista)', tipo: 'dias' },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'texto', max: 300 },
    ] },
};

// Opções dos campos que apontam para outro cadastro.
const FONTES = {
  condicoes_pagamento: "SELECT id, nome FROM condicoes_pagamento WHERE ativo ORDER BY nome",
  tipos_mercadoria: "SELECT id, nome FROM tipos_mercadoria WHERE ativo ORDER BY nome",
  unidades: "SELECT id, sigla || ' — ' || nome AS nome FROM unidades ORDER BY matriz DESC, sigla",
  centros_custo: "SELECT id, nome FROM centros_custo WHERE ativo ORDER BY nome",
  motoristas: "SELECT id, nome FROM motoristas ORDER BY nome",
  veiculos_tracao: "SELECT id, placa || COALESCE(' — ' || descricao, '') AS nome FROM veiculos WHERE COALESCE(tipo, 'tracao') = 'tracao' AND ativo IS NOT FALSE ORDER BY placa",
  veiculos_reboque: "SELECT id, placa || COALESCE(' — ' || descricao, '') AS nome FROM veiculos WHERE tipo = 'reboque' AND ativo IS NOT FALSE ORDER BY placa",
  fornecedores: "SELECT id, razao_social AS nome FROM fornecedores WHERE ativo ORDER BY razao_social",
  departamentos: "SELECT id, nome FROM departamentos WHERE ativo ORDER BY nome",
  ajudantes: "SELECT id, nome FROM ajudantes WHERE ativo ORDER BY nome",
  produtos: "SELECT id, codigo || ' — ' || descricao AS nome FROM produtos WHERE ativo ORDER BY descricao",
  tipos_operacao: "SELECT id, nome FROM tipos_operacao WHERE ativo ORDER BY nome",
};

const def = (tipo) => { const d = DEFS[tipo]; if (!d) throw falha('Cadastro desconhecido.', 404); return d; };
const podeLer = (req) => req.usuario?.perfil !== 'cliente';
const podeEditar = (req, tipo) => temAlguma(req, ...def(tipo).editar);

// Converte e confere o valor de cada campo.
const cepNum = (v) => String(v).replace(/\D/g, '');
function lerValor(c, v) {
  const vazio = v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length);
  if (vazio) {
    if (c.obrig) throw falha(`Preencha: ${c.rotulo}.`);
    if (c.tipo === 'bool') return false;
    if (['lista', 'refs', 'semana'].includes(c.tipo)) return [];
    if (c.tipo === 'dias') return [0];
    return c.padrao ?? null;
  }
  switch (c.tipo) {
    case 'texto': {
      const s = String(v).trim();
      if (c.formato === 'cfop' && !/^[1-7]\d{3}$/.test(s)) throw falha(`${c.rotulo}: CFOP de 4 números.`);
      return s.slice(0, c.max || 500);
    }
    case 'doc': {
      const d = String(v).toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (c.so === 'cpf' ? d.length !== 11 : ![11, 14].includes(d.length)) throw falha(`${c.rotulo}: ${c.so === 'cpf' ? 'CPF com 11 números' : 'CPF (11) ou CNPJ (14)'}.`);
      return d;
    }
    case 'uf': { const u = String(v).trim().toUpperCase(); if (!UFS.includes(u)) throw falha(`${c.rotulo}: UF inválida.`); return u; }
    case 'numero': case 'inteiro': {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || (c.tipo === 'inteiro' && !Number.isInteger(n))) throw falha(`${c.rotulo}: número inválido.`);
      if (c.min != null && n < c.min) throw falha(`${c.rotulo}: no mínimo ${c.min}.`);
      if (c.max != null && c.tipo === 'inteiro' && n > c.max) throw falha(`${c.rotulo}: no máximo ${c.max}.`);
      return n;
    }
    case 'bool': return v === true || v === 'true' || v === 1 || v === '1';
    case 'select': { const k = String(v); if (!Object.prototype.hasOwnProperty.call(c.opcoes, k)) throw falha(`${c.rotulo}: opção inválida.`); return /^\d+$/.test(k) ? Number(k) : k; }
    case 'ref': { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw falha(`${c.rotulo}: escolha uma opção.`); return n; }
    case 'refs': {
      const l = [...new Set((Array.isArray(v) ? v : String(v).split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (c.max && l.length > c.max) throw falha(`${c.rotulo}: no máximo ${c.max}.`);
      return l;
    }
    case 'semana': return [...new Set((Array.isArray(v) ? v : String(v).split(',')).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
    case 'dias': {
      const l = (Array.isArray(v) ? v : String(v).split(/[,;/\s]+/)).filter((x) => String(x).trim() !== '').map(Number);
      if (!l.length || l.some((n) => !Number.isInteger(n) || n < 0 || n > 720) || l.length > 24) throw falha(`${c.rotulo}: dias inteiros de 0 a 720, até 24 parcelas.`);
      return [...l].sort((a, b) => a - b);
    }
    case 'lista': {
      const l = (Array.isArray(v) ? v : String(v).split(c.formato === 'uf' ? /[,;\s]+/ : /\n|;/)).map((x) => String(x).trim()).filter(Boolean);
      return [...new Set(l.map((x) => {
        if (c.formato === 'uf') { const u = x.toUpperCase(); if (!UFS.includes(u)) throw falha(`UF inválida: ${x}.`); return u; }
        if (c.formato === 'cidade') {
          const m = /^(.+?)\s*[/-]\s*([A-Za-z]{2})$/.exec(x);
          if (!m || !UFS.includes(m[2].toUpperCase())) throw falha(`Cidade "${x}": escreva CIDADE/UF (ex.: CAMPINAS/SP).`);
          return `${m[1].trim().toUpperCase()}/${m[2].toUpperCase()}`;
        }
        if (c.formato === 'cep') {
          const ceps = x.replace(/(\d{5})[-.\s]?(\d{3})/g, '$1$2').match(/\d{8}/g) || [];
          const [de, ate = de] = ceps;
          if (!de || ceps.length > 2 || ate < de) throw falha(`Faixa de CEP "${x}": use 01000-000 a 05999-999.`);
          return `${de}-${ate}`;
        }
        return x.slice(0, 120);
      }))].slice(0, 500);
    }
    default: return v;
  }
}

async function listar(req, tipo, q = {}) {
  if (!podeLer(req)) throw falha('Sem permissão.', 403);
  const d = def(tipo);
  const p = []; const cond = [];
  if (q.ativos === '1') cond.push('ativo');
  const t = String(q.busca || '').trim();
  if (t) { p.push(t); cond.push(`(${d.busca.map((c) => `${c}::text ILIKE '%' || $1 || '%'`).join(' OR ')})`); }
  const { rows } = await pool.query(`SELECT * FROM ${tipo} ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY ativo DESC, ${d.nome} NULLS LAST, id LIMIT 2000`, p);
  return rows;
}

async function salvar(req, tipo, id, corpo) {
  const d = def(tipo);
  if (!podeEditar(req, tipo)) throw falha('Você não tem permissão para editar este cadastro.', 403);
  const valores = {};
  for (const c of d.campos) if (corpo[c.nome] !== undefined || !id) valores[c.nome] = lerValor(c, corpo[c.nome]);
  if (corpo.ativo !== undefined) valores.ativo = !!corpo.ativo;
  // Conjunto: as carretas têm que ser reboques e o cavalo, tração.
  if (tipo === 'conjuntos_veiculo' && valores.reboques?.length) {
    const { rows } = await pool.query("SELECT id FROM veiculos WHERE id = ANY($1::int[]) AND tipo = 'reboque'", [valores.reboques]);
    if (rows.length !== valores.reboques.length) throw falha('Escolha só carretas/implementos (veículos do tipo reboque).');
  }
  const cols = Object.keys(valores);
  try {
    if (id) {
      if (!cols.length) throw falha('Nada para salvar.');
      const { rows: [r] } = await pool.query(`UPDATE ${tipo} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, atualizado_em = NOW() WHERE id = $1 RETURNING *`, [id, ...cols.map((c) => valores[c])]);
      if (!r) throw falha('Registro não encontrado.', 404);
      return r;
    }
    const { rows: [r] } = await pool.query(`INSERT INTO ${tipo} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, cols.map((c) => valores[c]));
    return r;
  } catch (err) {
    if (err.code === '23502') throw falha(`Preencha: ${d.campos.find((c) => c.nome === err.column)?.rotulo || err.column}.`);
    if (err.code === '23505') {
      const campo = d.campos.find((c) => (err.constraint || '').includes(c.nome)) || d.campos.find((c) => c.unico);
      throw falha(`Já existe um cadastro com ${campo ? campo.rotulo.toLowerCase() : 'esses dados'} igual.`, 409);
    }
    throw err;
  }
}

async function excluir(req, tipo, id) {
  if (!podeEditar(req, tipo)) throw falha('Você não tem permissão para editar este cadastro.', 403);
  def(tipo);
  try {
    const { rowCount } = await pool.query(`DELETE FROM ${tipo} WHERE id = $1`, [id]);
    if (!rowCount) throw falha('Registro não encontrado.', 404);
  } catch (err) {
    if (err.code === '23503') throw falha('Este cadastro já está em uso. Desative em vez de excluir.', 409);
    throw err;
  }
}

async function opcoes(req, fonte) {
  if (!podeLer(req)) throw falha('Sem permissão.', 403);
  if (!FONTES[fonte]) throw falha('Lista desconhecida.', 404);
  return (await pool.query(FONTES[fonte])).rows;
}

// Fornecedores que já aparecem nos lançamentos (contas a pagar e notas de entrada) entram no cadastro.
async function importarFornecedores(req) {
  if (!podeEditar(req, 'fornecedores')) throw falha('Você não tem permissão para editar este cadastro.', 403);
  const { rowCount } = await pool.query(`
    INSERT INTO fornecedores (documento, razao_social, uf, ie)
    SELECT DISTINCT ON (doc) doc, nome, uf, ie FROM (
      SELECT regexp_replace(UPPER(fornecedor_doc), '[^0-9A-Z]', '', 'g') AS doc, fornecedor_nome AS nome, NULL::text AS uf, NULL::text AS ie, criado_em AS quando FROM contas_pagar
       WHERE COALESCE(fornecedor_nome, '') <> ''
      UNION ALL
      SELECT regexp_replace(UPPER(emitente_doc), '[^0-9A-Z]', '', 'g'), emitente_nome, emitente_uf, emitente_ie, criado_em FROM notas_entrada WHERE COALESCE(emitente_nome, '') <> ''
    ) x WHERE length(doc) IN (11, 14) ORDER BY doc, quando DESC
    ON CONFLICT (documento) DO NOTHING`);
  const { rowCount: ligadas } = await pool.query(`UPDATE contas_pagar c SET fornecedor_id = f.id FROM fornecedores f
    WHERE c.fornecedor_id IS NULL AND f.documento = regexp_replace(UPPER(COALESCE(c.fornecedor_doc, '')), '[^0-9A-Z]', '', 'g')`);
  return { novos: rowCount, contas_ligadas: ligadas };
}

// Região de atendimento de um destino: faixa de CEP > cidade > UF.
async function regiaoDe({ uf, cidade, cep } = {}) {
  const { rows } = await pool.query('SELECT r.*, u.sigla AS unidade_sigla, u.nome AS unidade_nome FROM regioes_atendimento r LEFT JOIN unidades u ON u.id = r.unidade_id WHERE r.ativo');
  const c = cepNum(cep || ''); const U = String(uf || '').toUpperCase(); const C = String(cidade || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const porCep = c.length === 8 && rows.find((r) => r.ceps.some((f) => { const [de, ate] = f.split('-'); return c >= de && c <= ate; }));
  if (porCep) return { ...porCep, por: 'cep' };
  const porCidade = C && U && rows.find((r) => r.cidades.some((x) => semAcento(x) === `${C}/${U}`));
  if (porCidade) return { ...porCidade, por: 'cidade' };
  const porUf = U && rows.find((r) => r.ufs.includes(U));
  return porUf ? { ...porUf, por: 'uf' } : null;
}

// Vencimentos de uma condição de pagamento a partir de uma data (AAAA-MM-DD).
function vencimentos(parcelas, dataBase) {
  const base = new Date(`${dataBase}T12:00:00Z`);
  return (parcelas?.length ? parcelas : [0]).map((d) => { const x = new Date(base); x.setUTCDate(x.getUTCDate() + Number(d)); return x.toISOString().slice(0, 10); });
}

// Definições para a tela (sem as funções).
const paraTela = (req) => Object.fromEntries(Object.entries(DEFS).map(([k, d]) => [k, { ...d, pode_editar: podeEditar(req, k) }]));

module.exports = { DEFS, FONTES, lerValor, listar, salvar, excluir, opcoes, importarFornecedores, regiaoDe, vencimentos, paraTela, UFS };
