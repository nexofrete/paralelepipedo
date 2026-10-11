const XLSX = require('xlsx');
const pool = require('./db');

// Importação do "Mapa de Carregamento" (.xls ou .xlsx exportado do ERP), ligando
// pela nota fiscal ("Nr. nota"). Grava em cada frete:
//   - Data da Coleta  <- "Dt. referência do mapa de carregamento" (a Data
//     Prevista de Entrega é recalculada sozinha em seguida);
//   - Nr. / Ds. / data de referência do mapa e o 1º ajudante — usados no
//     relatório de notas sem mapa de carregamento.

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const soNumeroNota = (v) => String(v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const dois = (n) => String(n).padStart(2, '0');

// "01/09/2026 15:17:23", "01/09/2026", data do Excel (Date) ou número serial → 'AAAA-MM-DD'.
function paraData(valor) {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date && !isNaN(valor)) {
    return `${valor.getFullYear()}-${dois(valor.getMonth() + 1)}-${dois(valor.getDate())}`;
  }
  if (typeof valor === 'number') {
    const d = XLSX.SSF.parse_date_code(valor);
    return d ? `${d.y}-${dois(d.m)}-${dois(d.d)}` : null;
  }
  const texto = String(valor).trim();
  let m = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${dois(m[2])}-${dois(m[1])}`;
  m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Acha a coluna pelo nome, sem ligar pra acento, maiúscula ou espaço extra.
function acharColuna(cabecalhos, ...candidatos) {
  const normal = cabecalhos.map(semAcento);
  for (const c of candidatos) {
    const i = normal.findIndex((h) => h === semAcento(c));
    if (i >= 0) return cabecalhos[i];
  }
  for (const c of candidatos) {
    const i = normal.findIndex((h) => h.includes(semAcento(c)));
    if (i >= 0) return cabecalhos[i];
  }
  return null;
}

function lerMapa(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const planilha = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(planilha, { defval: null, raw: true });
  if (!linhas.length) throw new Error('A planilha está vazia.');

  const cabecalhos = Object.keys(linhas[0]);
  const colNota = acharColuna(cabecalhos, 'Nr. nota', 'Nr nota', 'Numero da nota', 'Nota fiscal', 'NF');
  const colData = acharColuna(cabecalhos, 'Dt. referência do mapa de carregamento', 'Dt. referencia', 'Data de referencia');
  const colMapa = acharColuna(cabecalhos, 'Nr. mapa de carregamento', 'Nr. mapa', 'Numero do mapa');
  const colDesc = acharColuna(cabecalhos, 'Ds. mapa de carregamento', 'Ds. mapa', 'Descricao do mapa');
  const colAjud = acharColuna(cabecalhos, 'Nome do 1º ajudante do mapa de carregamento', 'Nome do 1o ajudante', '1º ajudante', '1o ajudante');
  if (!colNota || !colData) {
    throw new Error('Não achei as colunas "Nr. nota" e "Dt. referência do mapa de carregamento". Confira se é a planilha do mapa de carregamento.');
  }

  const texto = (v) => { const t = String(v ?? '').trim(); return t || null; };
  const porNota = new Map();
  let semMapa = 0;
  linhas.forEach((linha) => {
    const nota = soNumeroNota(linha[colNota]);
    if (!nota) return;
    const data = paraData(linha[colData]);
    const mapa = colMapa ? texto(linha[colMapa]) : null;
    if (!data && !mapa) { semMapa += 1; return; }
    // a mesma nota repetida: fica a última linha
    porNota.set(nota, { data, mapa, descricao: colDesc ? texto(linha[colDesc]) : null, ajudante: colAjud ? texto(linha[colAjud]) : null });
  });
  return { porNota, semMapa, totalLinhas: linhas.length };
}

async function importarMapaBuffer(buffer) {
  const { porNota, semMapa, totalLinhas } = lerMapa(buffer);
  const notas = [...porNota.keys()];
  const col = (k) => notas.map((n) => porNota.get(n)[k]);
  if (!notas.length) {
    return { totalLinhas, notasComData: 0, preenchidas: 0, atualizadas: 0, jaIguais: 0, semFrete: 0, semMapa, comMapa: 0 };
  }
  const params = [notas, col('data'), col('mapa'), col('descricao'), col('ajudante')];
  const { rows: alterados } = await pool.query(
    `WITH mapa AS (SELECT * FROM UNNEST($1::text[], $2::date[], $3::text[], $4::text[], $5::text[]) AS m(nota, data, numero, descricao, ajudante)),
          alvo AS (
            SELECT f.id, f.data_coleta AS antiga, m.*
              FROM fretes f JOIN mapa m ON LTRIM(f.numero_nf, '0') = m.nota
             WHERE f.data_coleta IS DISTINCT FROM COALESCE(m.data, f.data_coleta)
                OR f.numero_mapa IS DISTINCT FROM COALESCE(m.numero, f.numero_mapa)
                OR f.mapa_descricao IS DISTINCT FROM COALESCE(m.descricao, f.mapa_descricao)
                OR f.mapa_ajudante IS DISTINCT FROM COALESCE(m.ajudante, f.mapa_ajudante)
                OR f.mapa_data_referencia IS DISTINCT FROM COALESCE(m.data, f.mapa_data_referencia)
          )
     UPDATE fretes SET data_coleta = COALESCE(alvo.data, fretes.data_coleta),
            numero_mapa = COALESCE(alvo.numero, fretes.numero_mapa),
            mapa_descricao = COALESCE(alvo.descricao, fretes.mapa_descricao),
            mapa_ajudante = COALESCE(alvo.ajudante, fretes.mapa_ajudante),
            mapa_data_referencia = COALESCE(alvo.data, fretes.mapa_data_referencia),
            atualizado_em = NOW()
       FROM alvo WHERE fretes.id = alvo.id
     RETURNING alvo.antiga, alvo.data`,
    params
  );
  const { rows: contagem } = await pool.query(
    `SELECT COUNT(DISTINCT m.nota) FILTER (WHERE f.id IS NULL)::int AS sem_frete,
            COUNT(f.id) FILTER (WHERE f.id IS NOT NULL)::int AS com_frete
       FROM UNNEST($1::text[]) AS m(nota)
       LEFT JOIN fretes f ON LTRIM(f.numero_nf, '0') = m.nota`,
    [notas]
  );

  const preenchidas = alterados.filter((r) => r.antiga == null && r.data != null).length;
  const atualizadas = alterados.length - preenchidas;
  return {
    totalLinhas,
    notasComData: notas.length,
    preenchidas,
    atualizadas,
    jaIguais: Math.max(0, contagem[0].com_frete - alterados.length),
    semFrete: contagem[0].sem_frete,
    semMapa,
    comMapa: col('mapa').filter(Boolean).length,
  };
}

module.exports = { importarMapaBuffer, lerMapa, paraData };
