// Cadastro de clientes a partir do destinatário da NF-e.
const pool = require('./db');

const CAMPOS_NFE = ['tipo_pessoa', 'razao_social', 'ie', 'ind_ie', 'email', 'telefone', 'logradouro', 'numero', 'complemento',
  'bairro', 'cod_municipio', 'municipio', 'uf', 'cep', 'pais'];

// Cria ou atualiza o cliente com os dados de uma NF-e e liga o frete a ele.
// Nota mais nova atualiza os dados (endereço/IE mudam); se o cadastro foi
// corrigido à mão, só preenche o que estiver vazio.
async function registrarDaNfe(dados, freteId) {
  const d = dados?.destinatario;
  if (!d?.documento || d.documento.length < 11) return null;
  const dataNf = dados.data_emissao_nf || null;
  const valores = CAMPOS_NFE.map((c) => (d[c] === undefined || d[c] === '' ? null : d[c]));
  const n = CAMPOS_NFE.length;
  const atualizar = CAMPOS_NFE.map((c, i) => `${c} = CASE
      WHEN clientes.editado_manual THEN COALESCE(clientes.${c}, $${i + 2})
      WHEN $${n + 3}::date IS NULL OR clientes.ultima_nf_em IS NULL OR $${n + 3}::date >= clientes.ultima_nf_em THEN COALESCE($${i + 2}, clientes.${c})
      ELSE COALESCE(clientes.${c}, $${i + 2}) END`).join(',\n      ');
  const { rows } = await pool.query(
    `INSERT INTO clientes (documento, ${CAMPOS_NFE.join(', ')}, ultima_nf, ultima_nf_em, primeira_nf_em)
     VALUES ($1, ${CAMPOS_NFE.map((_, i) => `$${i + 2}`).join(', ')}, $${n + 2}, $${n + 3}::date, $${n + 3}::date)
     ON CONFLICT (documento) DO UPDATE SET
      ${atualizar},
      ultima_nf = CASE WHEN $${n + 3}::date IS NULL OR clientes.ultima_nf_em IS NULL OR $${n + 3}::date >= clientes.ultima_nf_em THEN $${n + 2} ELSE clientes.ultima_nf END,
      ultima_nf_em = GREATEST(clientes.ultima_nf_em, $${n + 3}::date),
      primeira_nf_em = LEAST(clientes.primeira_nf_em, $${n + 3}::date),
      atualizado_em = NOW()
     RETURNING id`,
    [d.documento, ...valores, dados.numero_nf != null ? String(dados.numero_nf) : null, dataNf]);
  if (freteId) await pool.query('UPDATE fretes SET cliente_documento = $2 WHERE id = $1 OR frete_principal_id = $1', [freteId, d.documento]);
  return rows[0]?.id || null;
}

// Ao ligar: monta o cadastro com as NF-e que já estão no banco (lê o XML guardado).
async function preencherComNotasAntigas() {
  const { parseNFe } = require('./utils/xmlParser');
  let feitos = 0;
  try {
    for (;;) {
      const { rows } = await pool.query(
        `SELECT id, xml_nfe_original FROM fretes
          WHERE cliente_documento IS NULL AND xml_nfe_original IS NOT NULL AND frete_principal_id IS NULL
          ORDER BY id LIMIT 500`);
      if (!rows.length) break;
      for (const r of rows) {
        try {
          const dados = parseNFe(r.xml_nfe_original);
          const ok = await registrarDaNfe(dados, r.id);
          if (!ok) await pool.query("UPDATE fretes SET cliente_documento = '' WHERE id = $1", [r.id]);   // sem documento: não tenta de novo
          else feitos += 1;
        } catch {
          await pool.query("UPDATE fretes SET cliente_documento = '' WHERE id = $1", [r.id]);
        }
      }
    }
    if (feitos) console.log(`[clientes] Cadastro de clientes preenchido a partir de ${feitos} NF-e já importadas.`);
  } catch (err) {
    console.error('[clientes] Erro ao montar o cadastro com as notas antigas:', err.message);
  }
}

module.exports = { registrarDaNfe, preencherComNotasAntigas, CAMPOS_NFE };
