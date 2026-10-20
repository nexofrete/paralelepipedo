// Boleto de cobrança (padrão FEBRABAN): nosso número, campo livre de cada
// banco, código de barras (44 dígitos), linha digitável (47) e o desenho do
// código de barras Interleaved 2 of 5.
//
// ATENÇÃO: cada banco confere o boleto e o arquivo CNAB na "homologação"
// (você manda um arquivo de teste antes de usar de verdade). Os campos de
// convênio/carteira/código do beneficiário vêm do contrato com o banco.

const { digitos: so } = require('../utils/documento');
const pad = (v, n) => so(v).padStart(n, '0').slice(-n);

// Módulo 10 (pesos 2,1 da direita para a esquerda; soma os dígitos do produto).
function modulo10(num) {
  let soma = 0; let peso = 2;
  for (let i = num.length - 1; i >= 0; i -= 1) {
    let p = Number(num[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p; peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

// Soma do módulo 11 com pesos 2..base repetindo da direita para a esquerda.
function soma11(num, base = 9) {
  let soma = 0; let peso = 2;
  for (let i = num.length - 1; i >= 0; i -= 1) { soma += Number(num[i]) * peso; peso = peso === base ? 2 : peso + 1; }
  return soma;
}

// DV geral do código de barras: 11 − resto; 0, 10 e 11 viram 1.
function dvGeral(codigo43) {
  const dv = 11 - (soma11(codigo43, 9) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

// Fator de vencimento: dias desde 07/10/1997. Em 22/02/2025 o fator chegou a
// 10.000 e voltou para 1.000 (regra da FEBRABAN): daí em diante, dias − 9.000.
function fatorVencimento(dataIso) {
  const dias = Math.round((Date.parse(`${String(dataIso).slice(0, 10)}T12:00:00Z`) - Date.parse('1997-10-07T12:00:00Z')) / 86400000);
  if (dias < 1000) throw new Error('Vencimento inválido para boleto.');
  return dias >= 10000 ? dias - 9000 : dias;
}

// ---------- Nosso número e campo livre de cada banco ----------
// cfg: { banco, agencia, agencia_dv, conta, conta_dv, carteira, convenio (código do beneficiário), modalidade }
const BANCOS = {
  '001': {
    nome: 'Banco do Brasil', carteira: '17',
    // Convênio de 7 dígitos: nosso número = convênio + sequencial de 10 (sem DV).
    nossoNumero: (cfg, seq) => { const n = `${pad(cfg.convenio, 7)}${pad(seq, 10)}`; return { numero: n, exibir: n }; },
    campoLivre: (cfg, nn) => `000000${nn.numero}${pad(cfg.carteira || '17', 2)}`,
    beneficiario: (cfg) => `${so(cfg.agencia)}-${cfg.agencia_dv || ''} / ${so(cfg.conta)}-${cfg.conta_dv || ''}`,
  },
  '341': {
    nome: 'Itaú', carteira: '109',
    nossoNumero: (cfg, seq) => {
      const n = pad(seq, 8); const cart = pad(cfg.carteira || '109', 3);
      const dac = modulo10(`${pad(cfg.agencia, 4)}${pad(cfg.conta, 5)}${cart}${n}`);
      return { numero: n, dv: String(dac), exibir: `${cart}/${n}-${dac}` };
    },
    campoLivre: (cfg, nn) => {
      const ag = pad(cfg.agencia, 4); const cc = pad(cfg.conta, 5);
      return `${pad(cfg.carteira || '109', 3)}${nn.numero}${nn.dv}${ag}${cc}${modulo10(`${ag}${cc}`)}000`;
    },
    beneficiario: (cfg) => `${so(cfg.agencia)} / ${so(cfg.conta)}-${cfg.conta_dv || ''}`,
  },
  '237': {
    nome: 'Bradesco', carteira: '09',
    nossoNumero: (cfg, seq) => {
      const n = pad(seq, 11); const cart = pad(cfg.carteira || '09', 2);
      const r = soma11(`${cart}${n}`, 7) % 11; const dv = r === 0 ? '0' : r === 1 ? 'P' : String(11 - r);
      return { numero: n, dv, exibir: `${cart}/${n}-${dv}` };
    },
    campoLivre: (cfg, nn) => `${pad(cfg.agencia, 4)}${pad(cfg.carteira || '09', 2)}${nn.numero}${pad(cfg.conta, 7)}0`,
    beneficiario: (cfg) => `${so(cfg.agencia)}-${cfg.agencia_dv || ''} / ${so(cfg.conta)}-${cfg.conta_dv || ''}`,
  },
  '033': {
    nome: 'Santander', carteira: '101',
    nossoNumero: (cfg, seq) => {
      const n = pad(seq, 12); const r = soma11(n, 9) % 11; const dv = String(r < 2 ? 0 : 11 - r);
      return { numero: n, dv, exibir: `${n}-${dv}` };
    },
    campoLivre: (cfg, nn) => `9${pad(cfg.convenio, 7)}${nn.numero}${nn.dv}0${pad(cfg.carteira || '101', 3)}`,
    beneficiario: (cfg) => `${so(cfg.agencia)} / ${pad(cfg.convenio, 7)}`,
  },
  '104': {
    nome: 'Caixa', carteira: 'RG',
    // SIGCB: nosso número de 17 = "14" (registrada, emitida pelo beneficiário) + 15 sequenciais.
    nossoNumero: (cfg, seq) => {
      const n = `14${pad(seq, 15)}`; const r = soma11(n, 9) % 11; const dv = 11 - r > 9 ? '0' : String(11 - r);
      return { numero: n, dv, exibir: `${n}-${dv}` };
    },
    campoLivre: (cfg, nn) => {
      const benef = pad(cfg.convenio, 6); const r = soma11(benef, 9) % 11; const dvBenef = 11 - r > 9 ? 0 : 11 - r;
      const n = nn.numero;
      const base = `${benef}${dvBenef}${n.slice(2, 5)}${n[0]}${n.slice(5, 8)}${n[1]}${n.slice(8, 17)}`;
      const r2 = soma11(base, 9) % 11; const dv = 11 - r2 > 9 ? 0 : 11 - r2;
      return `${base}${dv}`;
    },
    beneficiario: (cfg) => `${so(cfg.agencia)} / ${pad(cfg.convenio, 6)}`,
  },
  '756': {
    nome: 'Sicoob', carteira: '1',
    // Nosso número de 7 + DV (pesos 3,1,9,7 sobre agência + cliente com 10 dígitos + nosso número).
    nossoNumero: (cfg, seq) => {
      const n = pad(seq, 7); const base = `${pad(cfg.agencia, 4)}${pad(cfg.convenio, 10)}${n}`; const pesos = [3, 1, 9, 7];
      const s = [...base].reduce((t, d, i) => t + Number(d) * pesos[i % 4], 0); const r = s % 11;
      const dv = String(r <= 1 ? 0 : 11 - r);
      return { numero: n, dv, exibir: `${n}-${dv}` };
    },
    campoLivre: (cfg, nn) => `${pad(cfg.carteira || '1', 1)}${pad(cfg.agencia, 4)}${pad(cfg.modalidade || '01', 2)}${pad(cfg.convenio, 7)}${nn.numero}${nn.dv}001`,
    beneficiario: (cfg) => `${so(cfg.agencia)} / ${pad(cfg.convenio, 7)}`,
  },
};

// Monta o boleto: { nossoNumero, codigoBarras (44), linhaDigitavel (47), linhaFormatada }.
function montar(cfg, { sequencial, vencimento, valor }) {
  const banco = BANCOS[pad(cfg.banco, 3)];
  if (!banco) throw new Error(`Banco ${cfg.banco} ainda não tem boleto no sistema (BB 001, Itaú 341, Bradesco 237, Santander 033, Caixa 104, Sicoob 756).`);
  const centavos = Math.round(Number(valor) * 100);
  if (!(centavos > 0) || centavos > 9999999999) throw new Error('Valor inválido para boleto.');
  const nn = banco.nossoNumero(cfg, sequencial);
  const livre = banco.campoLivre(cfg, nn);
  if (!/^\d{25}$/.test(livre)) throw new Error('Configuração do banco incompleta (confira agência, conta, carteira e convênio).');
  const sem = `${pad(cfg.banco, 3)}9${pad(fatorVencimento(vencimento), 4)}${pad(centavos, 10)}${livre}`;
  const codigo = `${sem.slice(0, 4)}${dvGeral(sem)}${sem.slice(4)}`;
  const linha = linhaDigitavel(codigo);
  return { nossoNumero: nn, codigoBarras: codigo, linhaDigitavel: linha, linhaFormatada: formatarLinha(linha), bancoNome: banco.nome };
}

function linhaDigitavel(codigo) {
  const livre = codigo.slice(19);
  const c1 = `${codigo.slice(0, 4)}${livre.slice(0, 5)}`; const c2 = livre.slice(5, 15); const c3 = livre.slice(15, 25);
  return `${c1}${modulo10(c1)}${c2}${modulo10(c2)}${c3}${modulo10(c3)}${codigo[4]}${codigo.slice(5, 19)}`;
}
const formatarLinha = (l) => `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;

// Confere uma linha digitável (os 3 DVs dos campos e o DV geral).
function conferirLinha(linha) {
  const l = so(linha);
  if (l.length !== 47) return false;
  const campos = [[0, 9], [10, 20], [21, 31]];
  if (campos.some(([a, b]) => modulo10(l.slice(a, b)) !== Number(l[b]))) return false;
  const codigo = `${l.slice(0, 4)}${l[32]}${l.slice(33)}${l.slice(4, 9)}${l.slice(10, 20)}${l.slice(21, 31)}`;
  return dvGeral(`${codigo.slice(0, 4)}${codigo.slice(5)}`) === Number(codigo[4]);
}

// Código de barras Interleaved 2 of 5 em SVG (largo = 3 × estreito).
const I25 = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'];
function i25Svg(codigo, { altura = 50, estreito = 1 } = {}) {
  const largo = estreito * 3; let x = 0; let barras = '';
  const barra = (w, preta) => { if (preta) barras += `<rect x="${x}" y="0" width="${w}" height="${altura}"/>`; x += w; };
  [1, 1, 1, 1].forEach((_, i) => barra(estreito, i % 2 === 0));   // início: barra/espaço/barra/espaço estreitos
  for (let i = 0; i < codigo.length; i += 2) {
    const a = I25[Number(codigo[i])]; const b = I25[Number(codigo[i + 1])];
    for (let k = 0; k < 5; k += 1) { barra(a[k] === '1' ? largo : estreito, true); barra(b[k] === '1' ? largo : estreito, false); }
  }
  barra(largo, true); barra(estreito, false); barra(estreito, true);   // fim
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${altura}" width="${x}" height="${altura}" preserveAspectRatio="none" fill="#000" shape-rendering="crispEdges">${barras}</svg>`;
}

module.exports = { BANCOS, modulo10, soma11, dvGeral, fatorVencimento, montar, linhaDigitavel, formatarLinha, conferirLinha, i25Svg, pad, so };
