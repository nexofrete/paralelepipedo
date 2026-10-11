// Leitura do número da NF IMPRESSO no canhoto, sem custo e sem internet (só na
// 1ª vez, para baixar os dados do idioma): OCR com o Tesseract rodando no servidor.
// O canhoto costuma vir DEITADO na foto: tenta as 4 posições. Só aceita número
// que existe como NF no sistema (descarta leituras erradas). Letra à mão (a data)
// o OCR não lê bem — a data continua vindo do nome do arquivo, para conferir.
const path = require('path');
const pool = require('./db');

let Tesseract = null;
try { Tesseract = require('tesseract.js'); } catch { Tesseract = null; }

const PASTA_DADOS = path.join(__dirname, '..', 'dados', 'ocr');
let worker = null;
let fila = Promise.resolve();

function disponivel() { return !!Tesseract; }

async function obterWorker() {
  if (worker) return worker;
  require('fs').mkdirSync(PASTA_DADOS, { recursive: true });
  worker = await Tesseract.createWorker('eng', 1, { cachePath: PASTA_DADOS, logger: () => {}, errorHandler: () => {} });
  return worker;
}

// Números candidatos no texto lido: primeiro os que vêm depois de "Nº"/"N°"/"NF",
// depois qualquer sequência de 5 a 9 dígitos (com ou sem pontos: 000.193.459).
function candidatos(texto) {
  const t = String(texto || '');
  const fortes = [...t.matchAll(/N\s*[º°o0.]?\s*[:.]?\s*((?:\d[\s.]?){5,9})/gi)].map((m) => m[1]);
  const gerais = [...t.matchAll(/\b(\d{1,3}(?:\.\d{3}){1,2}|\d{5,9})\b/g)].map((m) => m[1]);
  return [...new Set([...fortes, ...gerais].map((n) => String(n).replace(/\D/g, '').replace(/^0+/, '')).filter((n) => n.length >= 5 && n.length <= 9))];
}

async function nfExistentes(numeros) {
  if (!numeros.length) return [];
  const { rows } = await pool.query(
    `SELECT LTRIM(numero_nf, '0') AS nf, data_entrega FROM fretes
      WHERE frete_principal_id IS NULL AND LTRIM(numero_nf, '0') = ANY($1)`, [numeros]);
  return rows;
}

// Lê a foto e devolve { nf, rotacao, lidos } — nf só se existir no sistema.
async function lerNumeroNf(buffer) {
  if (!Tesseract) return { indisponivel: true };
  const tarefa = fila.then(async () => {
    const w = await obterWorker();
    const lidos = [];
    for (const graus of [0, 90, 270, 180]) {
      const { data } = await w.recognize(buffer, { rotateRadians: (graus * Math.PI) / 180 });
      const nums = candidatos(data.text);
      lidos.push(...nums);
      const achadas = await nfExistentes(nums);
      if (achadas.length) {
        // Mais de uma NF existente na mesma foto: prefere a que ainda não tem entrega.
        const escolhida = achadas.find((a) => !a.data_entrega) || achadas[0];
        return { nf: escolhida.nf, rotacao: graus, lidos: [...new Set(lidos)] };
      }
    }
    return { nf: null, lidos: [...new Set(lidos)] };
  });
  fila = tarefa.catch(() => {});
  return tarefa;
}

module.exports = { disponivel, lerNumeroNf, candidatos };
