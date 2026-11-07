// Relatórios e indicadores (src/indicadores.js) e a exportação para Excel (.xlsx) de qualquer relatório.
const express = require('express');
const XLSX = require('xlsx');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const indicadores = require('../indicadores');

const router = express.Router();
const pode = permitirAlguma('pode_ver_relatorios');

router.get('/', autenticar, pode, async (req, res) => {
  try { res.json(await indicadores.painel(req, req.query)); } catch (err) {
    if (!err.status) console.error('[indicadores]', err.message);
    res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao montar os indicadores.' });
  }
});

// Planilha a partir do que a tela mostra: { nome, abas: [{ nome, colunas: [..], linhas: [[..], ..] }] }.
// Número vira número (o Excel soma); texto que parece fórmula vira texto.
const nomeAba = (n, usados) => {
  let base = String(n || 'Planilha').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Planilha';
  let nome = base; let i = 2;
  while (usados.has(nome.toLowerCase())) nome = `${base.slice(0, 25)} ${i++}`;
  usados.add(nome.toLowerCase());
  return nome;
};
const celula = (v) => {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  return /^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
};
router.post('/xlsx', autenticar, (req, res) => {
  const abas = Array.isArray(req.body?.abas) ? req.body.abas.slice(0, 40) : [];
  if (!abas.length) return res.status(400).json({ erro: 'Nada para exportar.' });
  const livro = XLSX.utils.book_new();
  const usados = new Set();
  for (const a of abas) {
    const linhas = (Array.isArray(a.linhas) ? a.linhas : []).slice(0, 100000).map((l) => (Array.isArray(l) ? l.slice(0, 200).map(celula) : []));
    const colunas = (Array.isArray(a.colunas) ? a.colunas : []).slice(0, 200).map((c) => String(c ?? ''));
    const folha = XLSX.utils.aoa_to_sheet([...(colunas.length ? [colunas] : []), ...linhas]);
    folha['!cols'] = (colunas.length ? colunas : linhas[0] || []).map((_, i) => ({ wch: Math.min(60, Math.max(10, ...[colunas[i], ...linhas.slice(0, 200).map((l) => l[i])].map((v) => String(v ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(livro, folha, nomeAba(a.nome, usados));
  }
  const nome = `${String(req.body.nome || 'relatorio').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 60) || 'relatorio'}.xlsx`;
  const buf = XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' });
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(buf);
});

module.exports = router;
