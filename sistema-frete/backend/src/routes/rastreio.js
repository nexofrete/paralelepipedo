// Rastreio público (sem login), como o "rastreamento" do SSW: o cliente da
// transportadora consulta pela chave do CT-e, ou pelo CNPJ (remetente ou
// destinatário) + número da NF. Mostra só o andamento: nada de valores,
// observações internas nem documento de quem recebeu.
const express = require('express');
const pool = require('../db');
const { SITUACOES } = require('../cte/ocorrencias');

const router = express.Router();
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const docLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
// "Maria da Silva Souza" → "Maria S." (o nome inteiro de quem recebeu não vai para a internet).
// DATE do banco (vem como Date à meia-noite local) → "dd/mm/aaaa".
const diaBr = (v) => { const d = v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T12:00:00`); return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const nomeCurto = (n) => { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return p.length ? `${p[0]}${p.length > 1 ? ` ${p[p.length - 1][0]}.` : ''}` : null; };

router.get('/', async (req, res) => {
  try {
    const chave = soDigitos(req.query.chave);
    const doc = docLimpo(req.query.documento);
    const nf = soDigitos(req.query.nf).replace(/^0+/, '');
    let rows;
    if (chave.length === 44) {
      ({ rows } = await pool.query(`SELECT * FROM ctes_emitidos WHERE chave = $1 AND status IN ('autorizado', 'cancelado')`, [chave]));
    } else if ((doc.length === 14 || doc.length === 11) && nf) {
      ({ rows } = await pool.query(
        `SELECT * FROM ctes_emitidos c
          WHERE c.status IN ('autorizado', 'cancelado')
            AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.dados->'nfes', '[]'::jsonb)) k
                         WHERE LTRIM(SUBSTRING(k FROM 26 FOR 9), '0') = $2)
            AND ($1 IN (UPPER(REGEXP_REPLACE(COALESCE(c.dados->'remetente'->>'cnpj', c.dados->'remetente'->>'cpf', ''), '[^0-9A-Za-z]', '', 'g')),
                        UPPER(REGEXP_REPLACE(COALESCE(c.dados->'destinatario'->>'cnpj', c.dados->'destinatario'->>'cpf', ''), '[^0-9A-Za-z]', '', 'g'))))
          ORDER BY c.autorizado_em DESC LIMIT 5`, [doc, nf]));
    } else {
      return res.status(400).json({ erro: 'Informe a chave do CT-e (44 dígitos) ou o CNPJ/CPF e o número da nota fiscal.' });
    }
    // CT-e cancelado só aparece se não houver outro válido para a mesma busca (ex.: foi substituído).
    if (rows.some((r) => r.status === 'autorizado')) rows = rows.filter((r) => r.status === 'autorizado');
    if (!rows.length) return res.status(404).json({ erro: 'Não encontramos nenhuma entrega com esses dados. Confira o número e tente de novo.' });
    const { rows: emp } = await pool.query('SELECT razao_social, nome_fantasia, telefone, email, logo FROM empresa WHERE id = 1');
    const resultado = [];
    for (const c of rows) {
      const { rows: ocs } = await pool.query(
        'SELECT descricao, tipo, data_hora, cidade, uf, recebedor_nome, nova_previsao FROM cte_ocorrencias WHERE cte_id = $1 ORDER BY data_hora DESC, id DESC', [c.id]);
      const d = c.dados || {};
      resultado.push({
        cte: `${c.serie}/${c.numero}`, emissao: c.autorizado_em, cancelado: c.status === 'cancelado', demonstracao: c.demonstracao,
        origem: d.inicio ? `${d.inicio.xMun}/${d.inicio.UF}` : null, destino: d.fim ? `${d.fim.xMun}/${d.fim.UF}` : null,
        destinatario: d.destinatario?.xNome || null,
        situacao: c.status === 'cancelado' ? 'CT-e cancelado' : SITUACOES[c.situacao_entrega] || c.situacao_entrega,
        situacao_codigo: c.status === 'cancelado' ? 'cancelado' : c.situacao_entrega,
        previsao: c.previsao_entrega, entregue_em: c.data_entrega, recebido_por: nomeCurto(c.recebedor_nome),
        historico: [
          ...ocs.map((o) => ({ descricao: o.descricao, data_hora: o.data_hora, local: o.cidade ? `${o.cidade}${o.uf ? `/${o.uf}` : ''}` : null,
            detalhe: o.tipo === 'entrega' && o.recebedor_nome ? `Recebido por ${nomeCurto(o.recebedor_nome)}` : o.nova_previsao ? `Nova previsão: ${diaBr(o.nova_previsao)}` : null })),
          { descricao: 'CT-e emitido', data_hora: c.autorizado_em, local: d.inicio ? `${d.inicio.xMun}/${d.inicio.UF}` : null },
        ],
      });
    }
    res.json({ transportadora: { nome: emp[0]?.nome_fantasia || emp[0]?.razao_social || 'Transportadora', telefone: emp[0]?.telefone || null, email: emp[0]?.email || null, logo: emp[0]?.logo || null }, entregas: resultado });
  } catch (err) {
    console.error('[rastreio]', err.message);
    res.status(500).json({ erro: 'Não foi possível consultar agora. Tente de novo em alguns minutos.' });
  }
});

module.exports = router;
