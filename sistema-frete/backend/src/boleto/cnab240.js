// CNAB 240 (FEBRABAN) de cobrança: remessa (segmentos P, Q e R) e leitura do
// retorno (segmentos T e U). Cada banco tem pequenas variações (convênio,
// carteira, versão do layout): os campos vêm da configuração e o banco
// confere o primeiro arquivo na homologação.
const { pad, so } = require('./boleto');

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' ').toUpperCase();
const A = (v, n) => semAcento(v).slice(0, n).padEnd(n, ' ');   // alfanumérico: à esquerda com brancos
const N = (v, n) => pad(v, n);                                  // numérico: à direita com zeros
const V = (valor, n) => pad(Math.round(Number(valor || 0) * 100), n);   // valor com 2 decimais
const D = (iso) => (iso ? `${String(iso).slice(8, 10)}${String(iso).slice(5, 7)}${String(iso).slice(0, 4)}` : '00000000');
const B = (n) => ' '.repeat(n);

function conferir(linha, tipo) {
  if (linha.length !== 240) throw new Error(`Registro ${tipo} ficou com ${linha.length} posições (deveria ter 240).`);
  return linha;
}

// cfg: { banco, banco_nome, agencia, agencia_dv, conta, conta_dv, convenio, carteira, juros_mes, multa, protesto_dias, baixa_dias, layout_arquivo, layout_lote }
// empresa: { cnpj, razao_social }; titulos: [{ movimento ('01' entrada | '02' baixa), nossoNumero, documento, vencimento, valor, emissao, usoEmpresa, pagador: { doc, nome, endereco, bairro, cep, cidade, uf } }]
function remessa(cfg, empresa, titulos, { nsa, agora = new Date() }) {
  const banco = N(cfg.banco, 3);
  const doc = so(empresa.cnpj);
  const tipoInsc = doc.length === 11 ? '1' : '2';
  const conta = `${N(cfg.agencia, 5)}${A(cfg.agencia_dv, 1)}${N(cfg.conta, 12)}${A(cfg.conta_dv, 1)} `;
  const hojeIso = new Date(agora.getTime() - 3 * 3600000).toISOString();
  const hora = hojeIso.slice(11, 19).replace(/:/g, '');
  const linhas = [];
  linhas.push(conferir(`${banco}00000${B(9)}${tipoInsc}${N(doc, 14)}${A(cfg.convenio, 20)}${conta}${A(empresa.razao_social, 30)}${A(cfg.banco_nome, 30)}${B(10)}1${D(hojeIso)}${hora}${N(nsa, 6)}${N(cfg.layout_arquivo || '087', 3)}00000${B(20)}${B(20)}${B(29)}`, 'header de arquivo'));
  linhas.push(conferir(`${banco}00011R01  ${N(cfg.layout_lote || '045', 3)} ${tipoInsc}${N(doc, 15)}${A(cfg.convenio, 20)}${conta}${A(empresa.razao_social, 30)}${B(40)}${B(40)}${N(nsa, 8)}${D(hojeIso)}00000000${B(33)}`, 'header de lote'));
  let seq = 0; let total = 0;
  for (const t of titulos) {
    const mov = t.movimento || '01';
    const p = t.pagador || {};
    const pdoc = so(p.doc);
    const jurosDia = cfg.juros_mes ? Math.round((Number(t.valor) * Number(cfg.juros_mes) / 100 / 30) * 100) / 100 : 0;
    const dataJuros = jurosDia ? new Date(Date.parse(`${String(t.vencimento).slice(0, 10)}T12:00:00Z`) + 86400000).toISOString() : null;
    const protesto = Number(cfg.protesto_dias) > 0;
    seq += 1;
    linhas.push(conferir(`${banco}00013${N(seq, 5)}P ${N(mov, 2)}${conta}${A(t.nossoNumero, 20)}${A(cfg.carteira_cnab || '1', 1)}1${cfg.tipo_documento || '1'}22${A(t.documento, 15)}${D(t.vencimento)}${V(t.valor, 15)}00000 04N${D(t.emissao)}${jurosDia ? '1' : '3'}${jurosDia ? D(dataJuros) : '00000000'}${V(jurosDia, 15)}000000000${V(0, 15)}${V(0, 15)}${V(0, 15)}${A(t.usoEmpresa, 25)}${protesto ? '1' : '3'}${N(protesto ? cfg.protesto_dias : 0, 2)}1${N(cfg.baixa_dias || 60, 3)}090000000000 `, 'segmento P'));
    seq += 1;
    const cep = so(p.cep).padStart(8, '0');
    linhas.push(conferir(`${banco}00013${N(seq, 5)}Q ${N(mov, 2)}${pdoc.length === 11 ? '1' : '2'}${N(pdoc, 15)}${A(p.nome, 40)}${A(p.endereco, 40)}${A(p.bairro, 15)}${cep.slice(0, 5)}${cep.slice(5, 8)}${A(p.cidade, 15)}${A(p.uf, 2)}0${N(0, 15)}${B(40)}000${B(20)}${B(8)}`, 'segmento Q'));
    if (Number(cfg.multa) > 0 && mov === '01') {
      seq += 1;
      const dataMulta = new Date(Date.parse(`${String(t.vencimento).slice(0, 10)}T12:00:00Z`) + 86400000).toISOString();
      linhas.push(conferir(`${banco}00013${N(seq, 5)}R ${N(mov, 2)}0${N(0, 8)}${V(0, 15)}0${N(0, 8)}${V(0, 15)}2${D(dataMulta)}${V(cfg.multa, 15)}${B(10)}${B(40)}${B(40)}${B(20)}${N(0, 8)}${N(0, 3)}${N(0, 5)}${B(1)}${N(0, 12)}${B(1)}${B(1)}${B(1)}${B(9)}`, 'segmento R'));
    }
    total += mov === '01' ? Number(t.valor) : 0;
  }
  linhas.push(conferir(`${banco}00015${B(9)}${N(seq + 2, 6)}${N(titulos.length, 6)}${V(total, 17)}${N(0, 6)}${V(0, 17)}${N(0, 6)}${V(0, 17)}${N(0, 6)}${V(0, 17)}${B(8)}${B(117)}`, 'trailer de lote'));
  linhas.push(conferir(`${banco}99999${B(9)}000001${N(linhas.length + 1, 6)}${N(0, 6)}${B(205)}`, 'trailer de arquivo'));
  return `${linhas.join('\r\n')}\r\n`;
}

// Ocorrências do retorno (FEBRABAN). As que importam: entrada, rejeição, liquidação, baixa.
const OCORRENCIAS = {
  '02': 'Entrada confirmada', '03': 'Entrada rejeitada', '04': 'Transferência de carteira', '06': 'Liquidação', '09': 'Baixa', '12': 'Abatimento concedido',
  '13': 'Abatimento cancelado', '14': 'Vencimento alterado', '17': 'Liquidação após baixa', '19': 'Protesto: instrução recebida', '23': 'Remessa a cartório',
  '25': 'Protestado e baixado', '26': 'Instrução rejeitada', '28': 'Débito de tarifas', '30': 'Alteração rejeitada',
};
const valorDe = (s) => Number(s || 0) / 100;
const dataDe = (s) => (/^\d{8}$/.test(s) && s !== '00000000' ? `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}` : null);

// Lê o arquivo de retorno: [{ nossoNumero, documento, usoEmpresa, ocorrencia, descricao, motivos, vencimento, valorTitulo, valorPago, juros, desconto, tarifa, dataOcorrencia, dataCredito }]
function lerRetorno(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
  if (!linhas.length) throw new Error('Arquivo de retorno vazio.');
  if (linhas[0].length < 240 || linhas[0][7] !== '0') throw new Error('Não parece um retorno CNAB 240 (o header do arquivo não confere). Se o banco manda CNAB 400, peça o retorno em 240.');
  if (linhas[0][142] !== '2') throw new Error('Este arquivo é uma REMESSA, não um retorno do banco.');
  const banco = linhas[0].slice(0, 3);
  const titulos = []; let atual = null;
  for (const l of linhas) {
    if (l[7] !== '3') continue;
    const seg = l[13];
    if (seg === 'T') {
      atual = {
        banco, ocorrencia: l.slice(15, 17), nossoNumero: l.slice(37, 57).trim(), documento: l.slice(58, 73).trim(), vencimento: dataDe(l.slice(73, 81)),
        valorTitulo: valorDe(l.slice(81, 96)), usoEmpresa: l.slice(105, 130).trim(), pagadorDoc: so(l.slice(133, 148)), pagadorNome: l.slice(148, 188).trim(),
        tarifa: valorDe(l.slice(198, 213)), motivos: l.slice(213, 223).trim(),
      };
      atual.descricao = OCORRENCIAS[atual.ocorrencia] || `Ocorrência ${atual.ocorrencia}`;
      titulos.push(atual);
    } else if (seg === 'U' && atual) {
      Object.assign(atual, {
        juros: valorDe(l.slice(17, 32)), desconto: valorDe(l.slice(32, 47)), abatimento: valorDe(l.slice(47, 62)), valorPago: valorDe(l.slice(77, 92)),
        valorLiquido: valorDe(l.slice(92, 107)), dataOcorrencia: dataDe(l.slice(137, 145)), dataCredito: dataDe(l.slice(145, 153)),
      });
      atual = null;
    }
  }
  return { banco, titulos };
}

module.exports = { remessa, lerRetorno, OCORRENCIAS };
