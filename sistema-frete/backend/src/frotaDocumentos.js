// Documentos da frota com vencimento: do veículo (CRLV, RNTRC, tacógrafo,
// seguro...) e do motorista (CNH, exame toxicológico, MOPP...). Alerta antes
// de vencer e barra o MDF-e com documento vencido do veículo ou do motorista.
const pool = require('./db');

const TIPOS = {
  veiculo: {
    crlv: { nome: 'CRLV / licenciamento', obrigatorio: true },
    rntrc: { nome: 'RNTRC (ANTT)', obrigatorio: true, so: 'tracao' },
    tacografo: { nome: 'Aferição do tacógrafo (Inmetro)', obrigatorio: true, so: 'tracao' },
    seguro: { nome: 'Seguro do veículo' },
    civ: { nome: 'CIV / CIPP (produtos perigosos)' },
    aet: { nome: 'AET (autorização especial de trânsito)' },
    vistoria: { nome: 'Vistoria / inspeção' },
    outro: { nome: 'Outro documento' },
  },
  motorista: {
    cnh: { nome: 'CNH', obrigatorio: true },
    toxicologico: { nome: 'Exame toxicológico', obrigatorio: true },
    mopp: { nome: 'Curso MOPP (produtos perigosos)' },
    aso: { nome: 'Exame médico (ASO)' },
    curso: { nome: 'Outro curso / treinamento' },
    outro: { nome: 'Outro documento' },
  },
};
// Vencidos que impedem o MDF-e (rodar com eles é infração).
const BLOQUEIAM = ['crlv', 'rntrc', 'tacografo', 'civ', 'cnh', 'toxicologico', 'mopp'];

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const isoDe = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// vencido · vencendo (dentro do aviso) · em_dia · sem_validade
function situacao(doc, hoje = hojeBr()) {
  const v = isoDe(doc?.validade);
  if (!v) return { situacao: 'sem_validade', dias: null };
  const dias = diasEntre(hoje, v);
  if (dias < 0) return { situacao: 'vencido', dias };
  if (dias <= (Number(doc.aviso_dias) || 30)) return { situacao: 'vencendo', dias };
  return { situacao: 'em_dia', dias };
}

// Quadro: cada veículo/motorista ativo com os documentos dele e os obrigatórios que faltam.
async function quadro() {
  const hoje = hojeBr();
  const { rows: veics } = await pool.query(`SELECT id, placa AS nome, tipo, descricao FROM veiculos WHERE ativo ORDER BY tipo, placa`);
  const { rows: mots } = await pool.query(`SELECT id, nome, cpf FROM motoristas WHERE ativo ORDER BY nome`);
  const { rows: docs } = await pool.query(`SELECT id, dono_tipo, dono_id, tipo, numero, emissao::text, validade::text, aviso_dias, observacao, atualizado_por, atualizado_em FROM frota_documentos`);
  const montar = (donoTipo, d) => {
    const meus = docs.filter((x) => x.dono_tipo === donoTipo && x.dono_id === d.id).map((x) => ({ ...x, nome: TIPOS[donoTipo][x.tipo]?.nome || x.tipo, ...situacao(x, hoje) }));
    const faltam = Object.entries(TIPOS[donoTipo]).filter(([k, t]) => t.obrigatorio && (!t.so || t.so === d.tipo) && !meus.some((m) => m.tipo === k)).map(([k, t]) => ({ tipo: k, nome: t.nome }));
    const pior = meus.some((m) => m.situacao === 'vencido') ? 'vencido' : meus.some((m) => m.situacao === 'vencendo') ? 'vencendo' : faltam.length ? 'falta' : 'em_dia';
    return { dono_tipo: donoTipo, id: d.id, nome: d.nome, tipo: d.tipo || null, descricao: d.descricao || null, cpf: d.cpf || null, documentos: meus, faltam, situacao: pior };
  };
  const linhas = [...veics.map((v) => montar('veiculo', v)), ...mots.map((m) => montar('motorista', m))];
  const todos = linhas.flatMap((l) => l.documentos);
  return {
    tipos: Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([t, x]) => [t, x.nome]))])),
    linhas,
    contagens: { vencidos: todos.filter((d) => d.situacao === 'vencido').length, vencendo: todos.filter((d) => d.situacao === 'vencendo').length, faltando: linhas.reduce((s, l) => s + l.faltam.length, 0) },
  };
}

// Grava (ou atualiza) o documento: { dono_tipo, dono_id, tipo, numero, emissao, validade, aviso_dias, observacao }.
async function salvar(b, usuarioNome) {
  const donoTipo = b.dono_tipo === 'motorista' ? 'motorista' : b.dono_tipo === 'veiculo' ? 'veiculo' : null;
  if (!donoTipo) throw falha('Escolha o veículo ou o motorista.');
  if (!TIPOS[donoTipo][b.tipo]) throw falha('Escolha o tipo do documento.');
  const donoId = Number(b.dono_id);
  const { rows: dono } = await pool.query(`SELECT id FROM ${donoTipo === 'veiculo' ? 'veiculos' : 'motoristas'} WHERE id = $1`, [donoId]);
  if (!dono[0]) throw falha(`${donoTipo === 'veiculo' ? 'Veículo' : 'Motorista'} não encontrado.`, 404);
  const validade = iso(b.validade); const emissao = iso(b.emissao);
  if (!validade && b.tipo !== 'outro') throw falha('Informe a validade.');
  if (emissao && validade && emissao > validade) throw falha('A emissão é depois da validade.');
  const aviso = Math.min(Math.max(parseInt(b.aviso_dias, 10) || 30, 1), 180);
  const numero = String(b.numero || '').trim().slice(0, 60) || null;
  const { rows } = await pool.query(
    `INSERT INTO frota_documentos (dono_tipo, dono_id, tipo, numero, emissao, validade, aviso_dias, observacao, atualizado_por, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (dono_tipo, dono_id, tipo) DO UPDATE SET numero = EXCLUDED.numero, emissao = EXCLUDED.emissao, validade = EXCLUDED.validade, aviso_dias = EXCLUDED.aviso_dias,
       observacao = EXCLUDED.observacao, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW() RETURNING id`,
    [donoTipo, donoId, b.tipo, numero, emissao, validade, aviso, String(b.observacao || '').trim().slice(0, 300) || null, usuarioNome]);
  // A CNH continua no cadastro do motorista (o MDF-e e as outras telas usam).
  if (donoTipo === 'motorista' && b.tipo === 'cnh') await pool.query('UPDATE motoristas SET cnh = COALESCE($2, cnh), cnh_validade = $3 WHERE id = $1', [donoId, numero, validade]);
  return { id: rows[0].id, nome: TIPOS[donoTipo][b.tipo].nome };
}

async function excluir(id) {
  const { rows } = await pool.query('DELETE FROM frota_documentos WHERE id = $1 RETURNING dono_tipo, dono_id, tipo', [id]);
  if (!rows[0]) throw falha('Documento não encontrado.', 404);
  if (rows[0].dono_tipo === 'motorista' && rows[0].tipo === 'cnh') await pool.query('UPDATE motoristas SET cnh_validade = NULL WHERE id = $1', [rows[0].dono_id]);
  return rows[0];
}

// Documentos vencidos de placas e CPFs (para o MDF-e e o romaneio).
async function vencidosDe({ placas = [], cpfs = [] } = {}) {
  const p = placas.map((x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean);
  const c = cpfs.map((x) => String(x || '').replace(/\D/g, '')).filter(Boolean);
  if (!p.length && !c.length) return [];
  const { rows } = await pool.query(
    `SELECT d.tipo, d.dono_tipo, d.validade::text, COALESCE(v.placa, m.nome) AS dono FROM frota_documentos d
       LEFT JOIN veiculos v ON d.dono_tipo = 'veiculo' AND v.id = d.dono_id
       LEFT JOIN motoristas m ON d.dono_tipo = 'motorista' AND m.id = d.dono_id
      WHERE d.validade < $3::date AND d.tipo = ANY($4::text[])
        AND ((d.dono_tipo = 'veiculo' AND upper(v.placa) = ANY($1::text[])) OR (d.dono_tipo = 'motorista' AND m.cpf = ANY($2::text[])))`,
    [p, c, hojeBr(), BLOQUEIAM]);
  return rows.map((r) => ({ ...r, nome: TIPOS[r.dono_tipo][r.tipo]?.nome || r.tipo }));
}
const textoVencidos = (l) => l.map((x) => `${x.nome} de ${x.dono} (venceu em ${x.validade.split('-').reverse().join('/')})`).join('; ');

async function conferirMdfe(mdfeId) {
  const { rows } = await pool.query('SELECT dados FROM mdfes WHERE id = $1', [mdfeId]);
  const d = rows[0]?.dados || {};
  const venc = await vencidosDe({ placas: [d.veiculo?.placa, ...(d.reboques || []).map((r) => r.placa)], cpfs: (d.condutores || []).map((c) => c.cpf) });
  if (venc.length) throw falha(`Documento vencido: ${textoVencidos(venc)}. Atualize em Frota › Documentos antes de transmitir o MDF-e.`, 409);
}

async function pendencias() {
  const q = await quadro();
  return q.contagens;
}

module.exports = { TIPOS, BLOQUEIAM, situacao, quadro, salvar, excluir, vencidosDe, textoVencidos, conferirMdfe, pendencias };
