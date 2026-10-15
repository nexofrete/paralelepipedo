// Leitor de extrato OFX (o arquivo que todo banco exporta no internet banking).
// Aceita o OFX 1.x (SGML, sem tags de fechamento — o mais comum nos bancos
// brasileiros) e o 2.x (XML). Devolve a conta, o período, o saldo do banco e
// os lançamentos com valor assinado (+ crédito, − débito).
const crypto = require('crypto');

// Latin-1 (CHARSET:1252) ou UTF-8: decide pelo cabeçalho e pelo conteúdo.
function decodificar(buf) {
  if (typeof buf === 'string') return buf;
  const cab = buf.slice(0, 600).toString('latin1');
  if (/ENCODING[:=]\s*"?UTF-?8/i.test(cab) && !/CHARSET[:=]\s*"?(1252|ISO-?8859)/i.test(cab)) return buf.toString('utf8');
  const utf = buf.toString('utf8');
  return utf.includes('�') ? buf.toString('latin1') : utf;
}

const limpar = (v) => String(v ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
// Valor da tag dentro de um trecho (com ou sem </TAG>).
const tag = (bloco, nome) => {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco);
  return m ? limpar(m[1]) : '';
};
// 20261015120000[-3:BRT] → 2026-10-15
const data = (v) => { const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(v || '')); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
// "-1.234,56", "1234.56", "-150,00": vírgula decimal se for o último separador.
function valor(v) {
  let t = String(v || '').trim().replace(/\s/g, '');
  if (!t) return null;
  const v1 = t.lastIndexOf(','); const p1 = t.lastIndexOf('.');
  if (v1 > p1) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function lerOfx(entrada) {
  const texto = decodificar(entrada);
  if (!/<OFX>/i.test(texto)) throw Object.assign(new Error('Este arquivo não é um extrato OFX. No internet banking, exporte o extrato em "OFX" (às vezes chamado de "Money" ou "Quicken").'), { status: 400 });
  const corpo = texto.slice(texto.search(/<OFX>/i));
  const conta = {
    banco: tag(corpo, 'BANKID').replace(/^0+(?=\d{3}$)/, '').slice(-3) || null,
    agencia: tag(corpo, 'BRANCHID') || null,
    numero: tag(corpo, 'ACCTID') || null,
    cartao: /<CCACCTFROM>/i.test(corpo),
  };
  const lista = corpo.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]);
  const vistos = new Map();
  const lancamentos = [];
  lista.forEach((b) => {
    const v = valor(tag(b, 'TRNAMT'));
    const d = data(tag(b, 'DTPOSTED'));
    if (v == null || !d || v === 0) return;
    const memo = tag(b, 'MEMO'); const nome = tag(b, 'NAME');
    const descricao = [nome, memo].filter((x, i, a) => x && a.indexOf(x) === i).join(' — ').slice(0, 255);
    const documento = (tag(b, 'CHECKNUM') || tag(b, 'REFNUM')).slice(0, 60);
    // Alguns bancos repetem ou não mandam o FITID: monta um estável com data, valor e histórico.
    let fitid = tag(b, 'FITID');
    const base = fitid || `h:${crypto.createHash('sha1').update(`${d}|${v}|${descricao}|${documento}`).digest('hex').slice(0, 20)}`;
    const n = (vistos.get(base) || 0) + 1; vistos.set(base, n);
    fitid = (n > 1 ? `${base}#${n}` : base).slice(0, 120);
    lancamentos.push({ fitid, data: d, valor: v, tipo: tag(b, 'TRNTYPE').toUpperCase() || null, descricao, documento });
  });
  const bal = (corpo.split(/<LEDGERBAL>/i)[1] || '');
  const datas = lancamentos.map((l) => l.data).sort();
  return {
    conta,
    de: data(tag(corpo, 'DTSTART')) || datas[0] || null,
    ate: data(tag(corpo, 'DTEND')) || datas[datas.length - 1] || null,
    saldo: bal ? valor(tag(bal, 'BALAMT')) : null,
    saldo_data: bal ? data(tag(bal, 'DTASOF')) : null,
    lancamentos,
  };
}

module.exports = { lerOfx, valor, data };
