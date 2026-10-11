// Municípios do IBGE buscados pelo SERVIDOR (o navegador fica dentro da política
// de segurança do sistema) e guardados numa cópia local: depois da 1ª busca de
// cada estado, funciona até sem internet. Sem internet e sem cópia: usa as
// cidades que já aparecem nas notas daquele estado.
const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');

const router = express.Router();
const PASTA = path.join(__dirname, '..', '..', 'dados', 'ibge');
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

async function buscarIbge(uf) {
  const url = uf === 'BR'
    ? 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado'
    : `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?view=nivelado`;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 20000);
  try {
    const resp = await fetch(url, { signal: controle.signal, headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`IBGE respondeu ${resp.status}`);
    const dados = await resp.json();
    return dados.map((m) => ({
      nome: m['municipio-nome'] || m.nome,
      uf: m['UF-sigla'] || m.microrregiao?.mesorregiao?.UF?.sigla || m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla || (uf === 'BR' ? '' : uf),
    })).filter((m) => m.nome);
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/localidades/municipios?uf=SP   (uf=BR ou vazio = Brasil todo)
router.get('/municipios', autenticar, async (req, res) => {
  const uf = UFS.includes(String(req.query.uf || '').toUpperCase()) ? String(req.query.uf).toUpperCase() : 'BR';
  const arquivo = path.join(PASTA, `municipios-${uf}.json`);
  // Cópia guardada com menos de 90 dias: usa direto.
  try {
    const st = fs.statSync(arquivo);
    if (Date.now() - st.mtimeMs < 90 * 86400000) return res.json({ origem: 'copia', municipios: JSON.parse(fs.readFileSync(arquivo, 'utf8')) });
  } catch { /* sem cópia */ }
  try {
    const lista = await buscarIbge(uf);
    fs.mkdirSync(PASTA, { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify(lista));
    return res.json({ origem: 'ibge', municipios: lista });
  } catch (err) {
    // IBGE fora do ar / sem internet: cópia antiga, se houver…
    try { return res.json({ origem: 'copia-antiga', municipios: JSON.parse(fs.readFileSync(arquivo, 'utf8')) }); } catch { /* sem cópia */ }
    // …senão, as cidades que já aparecem nas notas (e no cadastro de clientes).
    const { rows } = await pool.query(
      `SELECT DISTINCT INITCAP(LOWER(c)) AS nome, u AS uf FROM (
         SELECT cidade AS c, uf AS u FROM fretes UNION SELECT municipio, uf FROM clientes
       ) x WHERE NULLIF(TRIM(c), '') IS NOT NULL AND NULLIF(TRIM(u), '') IS NOT NULL ${uf === 'BR' ? '' : 'AND UPPER(u) = $1'}`,
      uf === 'BR' ? [] : [uf]).catch(() => ({ rows: [] }));
    if (rows.length) return res.json({ origem: 'notas', aviso: `Sem acesso ao IBGE (${err.message}): mostrando as cidades que já aparecem nas notas.`, municipios: rows });
    return res.status(502).json({ erro: `Não consegui buscar a lista no IBGE (${err.message}).` });
  }
});

module.exports = router;
