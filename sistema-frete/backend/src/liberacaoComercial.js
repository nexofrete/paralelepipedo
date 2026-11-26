// Liberação comercial dos pedidos (tela Pedidos, 405): a data e hora em que o comercial liberou o pedido.
// Vem do e-mail de liberação impresso em PDF (ex.: "Pedidos Liberados 25/11 - Comercial", com "Data Qua, 2026-11-25 17:55"
// e a lista "Nr. Pedido: 217087 - Cliente: ..."): a data do e-mail vale para todos os pedidos da lista. Pode ser editada
// à mão em cada pedido; a data manual não é trocada por e-mails importados depois. Se o pedido aparecer em mais de um
// e-mail, fica a primeira liberação (a data mais antiga).
const pool = require('./db');

const falha = (m, status = 400) => Object.assign(new Error(m), { status });
const dois = (n) => String(n).padStart(2, '0');
const MESES = { janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

// Data e hora do e-mail, nos jeitos que o Outlook e os leitores de e-mail imprimem:
//  "Data Qua, 2026-11-25 17:55" · "Enviado: quarta-feira, 25 de novembro de 2026 17:55" · "Date: 25/11/2026 17:55" · "Sent: 25/11/2026 17:55:10"
function dataDoEmail(texto) {
  const t = String(texto || '');
  const linha = (t.match(/^\s*(?:Data|Date|Enviado(?:\s+em)?|Sent|Enviada)\s*:?\s+(.+)$/im) || [])[1] || '';
  let m = linha.match(/(\d{4})-(\d{2})-(\d{2})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${dois(m[4])}:${m[5]}:${m[6] || '00'}`;
  m = linha.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ ,]+(?:às\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${dois(m[2])}-${dois(m[1])} ${dois(m[4])}:${m[5]}:${m[6] || '00'}`;
  m = linha.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})[ ,]+(?:as\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m && MESES[m[2]]) return `${m[3]}-${dois(MESES[m[2]])}-${dois(m[1])} ${dois(m[4])}:${m[5]}:${m[6] || '00'}`;
  return null;
}

// Lê o texto do e-mail: data, remetente, assunto e os pedidos ("Nr. Pedido: 217087 - Cliente: NOME").
function lerEmail(texto) {
  const t = String(texto || '').replace(/\r/g, '');
  const de = ((t.match(/^\s*(?:De|From)\s*:?\s+(.+)$/im) || [])[1] || '').replace(/<[^>]*>/g, '').trim() || null;
  const assunto = t.split('\n').map((l) => l.trim()).find((l) => /pedidos?\s+liberad/i.test(l))
    || ((t.match(/^\s*(?:Assunto|Subject)\s*:?\s+(.+)$/im) || [])[1] || '').trim() || null;
  const vistos = new Set();
  const pedidos = [];
  for (const m of t.matchAll(/N[ºr°o]?\.?\s*(?:do\s+)?Pedido\s*[:\-]?\s*(\d{4,})(?:\s*[-–]\s*Cliente\s*:?\s*([^\n]+))?/gi)) {
    if (vistos.has(m[1])) continue;
    vistos.add(m[1]);
    pedidos.push({ numero: m[1], cliente: (m[2] || '').replace(/\s*\.\s*$/, '').trim() || null });
  }
  return { data: dataDoEmail(t), de, assunto, pedidos };
}

// Texto do PDF (e-mail impresso). Usa o unpdf (pdf.js); sem ele instalado, pede o npm install.
async function textoDoPdf(buffer) {
  let unpdf;
  try { unpdf = await import('unpdf'); } catch (e) {
    throw falha('O leitor de PDF não está instalado no servidor: na pasta backend, rode "npm install" e reinicie o Nexofrete.', 500);
  }
  try {
    const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });   // sem avisos de fonte no log
    const { text } = await unpdf.extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : String(text || '');
  } catch (e) { throw falha(`Não consegui ler o PDF: ${e.message}`); }
}

// Grava a liberação dos pedidos do e-mail. Data manual não é trocada; se já tinha de outro e-mail, fica a mais antiga.
async function gravarDoEmail(email, usuario, arquivo = null) {
  if (!email.data) throw falha('Não achei a data do e-mail no PDF (a linha "Data ..." do cabeçalho).');
  if (!email.pedidos.length) throw falha('Não achei nenhum "Nr. Pedido:" no PDF.');
  const r = { data: email.data, de: email.de, assunto: email.assunto, arquivo, pedidos: email.pedidos.length, gravados: 0, manuais: 0, ja_mais_antigos: 0 };
  for (const p of email.pedidos) {
    const { rows: [atual] } = await pool.query('SELECT origem, liberado_em FROM liberacoes_comerciais WHERE numero_pedido = $1', [p.numero]);
    if (atual?.origem === 'manual') { r.manuais += 1; continue; }
    const { rowCount } = await pool.query(`INSERT INTO liberacoes_comerciais (numero_pedido, liberado_em, origem, email_de, email_assunto, arquivo, cliente, usuario_nome, atualizado_em)
      VALUES ($1, $2::timestamp, 'email', $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (numero_pedido) DO UPDATE SET liberado_em = EXCLUDED.liberado_em, email_de = EXCLUDED.email_de, email_assunto = EXCLUDED.email_assunto,
        arquivo = EXCLUDED.arquivo, cliente = COALESCE(EXCLUDED.cliente, liberacoes_comerciais.cliente), usuario_nome = EXCLUDED.usuario_nome, atualizado_em = NOW()
      WHERE liberacoes_comerciais.origem <> 'manual' AND EXCLUDED.liberado_em < liberacoes_comerciais.liberado_em`,
    [p.numero, email.data, email.de, email.assunto, arquivo, p.cliente, usuario?.nome || null]);
    if (rowCount) r.gravados += 1; else r.ja_mais_antigos += 1;
  }
  return r;
}

async function importarPdf(buffer, usuario, arquivo) {
  return gravarDoEmail(lerEmail(await textoDoPdf(buffer)), usuario, arquivo);
}

// Data manual (de quem edita registros). Vazio apaga: o pedido volta a esperar o e-mail.
async function salvarManual(numero, valor, usuario) {
  const n = String(numero || '').trim();
  if (!/^[\w.\-/]{1,50}$/.test(n)) throw falha('Pedido inválido.');
  const v = String(valor || '').trim();
  if (!v) { await pool.query('DELETE FROM liberacoes_comerciais WHERE numero_pedido = $1', [n]); return { numero_pedido: n, liberado_em: null }; }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw falha('Data e hora inválidas.');
  const dt = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
  await pool.query(`INSERT INTO liberacoes_comerciais (numero_pedido, liberado_em, origem, usuario_nome, atualizado_em) VALUES ($1, $2::timestamp, 'manual', $3, NOW())
    ON CONFLICT (numero_pedido) DO UPDATE SET liberado_em = EXCLUDED.liberado_em, origem = 'manual', usuario_nome = EXCLUDED.usuario_nome, atualizado_em = NOW()`, [n, dt, usuario?.nome || null]);
  return { numero_pedido: n, liberado_em: dt, origem: 'manual' };
}

// Liberações de uma lista de pedidos (para a tela).
async function dosPedidos(numeros) {
  const ids = [...new Set((numeros || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const { rows } = await pool.query(`SELECT numero_pedido, to_char(liberado_em, 'YYYY-MM-DD HH24:MI') AS liberado_em, origem, email_de, usuario_nome
    FROM liberacoes_comerciais WHERE numero_pedido = ANY($1::text[])`, [ids]).catch(() => ({ rows: [] }));
  return new Map(rows.map((r) => [r.numero_pedido, r]));
}

module.exports = { dataDoEmail, lerEmail, textoDoPdf, gravarDoEmail, importarPdf, salvarManual, dosPedidos };
