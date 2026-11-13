// Fila por responsável: cada transportadora pode ter um analista (transportadoras.auditor_id).
// Na Auditoria, o filtro "Meus" mostra só o que é de quem está usando; o sino avisa os retidos de cada um.
const pool = require('./db');

// Transportadora do frete: a da tabela de preço usada ou a do nome (o mesmo critério da tolerância).
const TRANSP_DO_FRETE = (f = 'f') => `COALESCE((SELECT tp.transportadora_id FROM tabelas_preco tp WHERE tp.id = ${f}.tabela_preco_id_usada),
  (SELECT tr.id FROM transportadoras tr WHERE UPPER(TRIM(tr.razao_social)) = UPPER(TRIM(COALESCE(${f}.transportadora_cte, ${f}.transportadora))) LIMIT 1))`;

async function listar() {
  const { rows: transportadoras } = await pool.query(`SELECT t.id, t.razao_social, t.auditor_id, u.nome AS auditor_nome
     FROM transportadoras t LEFT JOIN usuarios u ON u.id = t.auditor_id ORDER BY t.razao_social`);
  const { rows: usuarios } = await pool.query(`SELECT id, nome, email, perfil, resumo_auditoria FROM usuarios
     WHERE ativo AND (perfil = 'admin' OR (COALESCE(pode_ver_auditoria, TRUE) AND (pode_ver_todos OR pode_aprovar_pagamento))) ORDER BY nome`);
  const { rows: [cfg] } = await pool.query('SELECT resumo_hora FROM configuracao_auditoria WHERE id = 1');
  return { transportadoras, usuarios, resumo_hora: cfg?.resumo_hora ?? 7 };
}

// b: { responsaveis: [{ transportadora_id, auditor_id }], resumo: [usuario_id...], resumo_hora }
async function salvar(b) {
  const lista = Array.isArray(b.responsaveis) ? b.responsaveis : [];
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const r of lista) {
      const tid = Number(r.transportadora_id); if (!tid) continue;
      await db.query('UPDATE transportadoras SET auditor_id = $2 WHERE id = $1', [tid, Number(r.auditor_id) || null]);
    }
    if (Array.isArray(b.resumo)) {
      const ids = b.resumo.map(Number).filter(Boolean);
      await db.query('UPDATE usuarios SET resumo_auditoria = (id = ANY($1::int[]))', [ids]);
    }
    if (b.resumo_hora != null && b.resumo_hora !== '') {
      const h = Math.min(23, Math.max(0, Math.round(Number(b.resumo_hora)) || 0));
      await db.query('INSERT INTO configuracao_auditoria (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
      await db.query('UPDATE configuracao_auditoria SET resumo_hora = $1 WHERE id = 1', [h]);
    }
    await db.query('COMMIT');
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
  return listar();
}

// Transportadoras de um usuário (vazio = não é responsável por nenhuma).
async function doUsuario(usuarioId) {
  const { rows } = await pool.query('SELECT id FROM transportadoras WHERE auditor_id = $1', [usuarioId]);
  return rows.map((r) => r.id);
}

module.exports = { TRANSP_DO_FRETE, listar, salvar, doUsuario };
