// EDI de transporte no layout PROCEDA 3.1 (o "EDI" que embarcadores e
// transportadoras trocam): arquivo texto, uma linha por registro, campos de
// tamanho fixo. Cada linha começa com o tipo do registro (000, 310, 322...).
//
// Tipos de campo:
//   A  — texto: maiúsculo, sem acento, alinhado à esquerda, completa com espaços
//   N  — número: sem vírgula, zeros à esquerda; "dec" casas decimais implícitas
//   D8 — data DDMMAAAA   D6 — data DDMMAA   H4 — hora HHMM
// O que sobra no fim da linha é completado com espaços (filler).

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const p2 = (n) => String(n).padStart(2, '0');

// Aceita Date, "AAAA-MM-DD", "AAAA-MM-DDTHH:MM..." ou "DD/MM/AAAA".
function partesData(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : { a: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), h: v.getHours(), mi: v.getMinutes() };
  const s = String(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (m) return { a: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0) };
  m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/.exec(s);
  if (m) return { a: +m[3], m: +m[2], d: +m[1], h: +(m[4] || 0), mi: +(m[5] || 0) };
  return null;
}

function formatar(campo, valor, registro) {
  const { nome, tam, tipo, dec = 0 } = campo;
  if (tipo === 'A') {
    return semAcento(valor).toUpperCase().replace(/[^\x20-\x7E]/g, ' ').slice(0, tam).padEnd(tam, ' ');
  }
  if (tipo === 'N') {
    const n = Math.round(Math.abs(Number(valor) || 0) * 10 ** dec);
    const s = String(n);
    if (s.length > tam) throw new Error(`EDI: o valor ${valor} não cabe no campo "${nome}" do registro ${registro} (${tam} dígitos${dec ? `, ${dec} decimais` : ''}).`);
    return s.padStart(tam, '0');
  }
  const d = partesData(valor);
  if (tipo === 'D8') return d ? `${p2(d.d)}${p2(d.m)}${d.a}` : '0'.repeat(8);
  if (tipo === 'D6') return d ? `${p2(d.d)}${p2(d.m)}${String(d.a).slice(-2)}` : '0'.repeat(6);
  if (tipo === 'H4') return d ? `${p2(d.h)}${p2(d.mi)}` : '0000';
  throw new Error(`EDI: tipo de campo desconhecido ${tipo}`);
}

function interpretar(campo, texto) {
  const { tipo, dec = 0 } = campo;
  if (tipo === 'A') return texto.trim();
  if (tipo === 'N') {
    const limpo = texto.trim();
    if (!/^\d+$/.test(limpo)) return limpo ? Number(limpo.replace(',', '.')) || 0 : 0;
    return Number(limpo) / 10 ** dec;
  }
  if (tipo === 'D8') {
    const m = /^(\d{2})(\d{2})(\d{4})$/.exec(texto.trim());
    return m && m[3] !== '0000' ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
  if (tipo === 'D6') {
    const m = /^(\d{2})(\d{2})(\d{2})$/.exec(texto.trim());
    return m && texto.trim() !== '000000' ? `20${m[3]}-${m[2]}-${m[1]}` : null;
  }
  if (tipo === 'H4') {
    const m = /^(\d{2})(\d{2})$/.exec(texto.trim());
    return m ? `${m[1]}:${m[2]}` : null;
  }
  return texto;
}

// Atalhos para declarar campos.
const A = (nome, tam) => ({ nome, tam, tipo: 'A' });
const N = (nome, tam, dec = 0) => ({ nome, tam, tipo: 'N', dec });
const D8 = (nome) => ({ nome, tam: 8, tipo: 'D8' });
const D6 = (nome) => ({ nome, tam: 6, tipo: 'D6' });
const H4 = (nome) => ({ nome, tam: 4, tipo: 'H4' });

// Layout = { tamanho da linha, registros: { '000': [campos...] } }. Confere as somas.
// estendidos: registros que a versão deixou passar do tamanho da linha
// (ex.: o 322 do CONEMB 3.1, que ganhou chave e protocolo do CT-e no fim).
function layout(nome, tamanho, registros, estendidos = []) {
  const tamanhos = {};
  Object.entries(registros).forEach(([id, campos]) => {
    const soma = 3 + campos.reduce((s, c) => s + c.tam, 0);
    if (soma > tamanho && !estendidos.includes(id)) throw new Error(`Layout ${nome}: registro ${id} tem ${soma} posições (máximo ${tamanho}).`);
    tamanhos[id] = Math.max(tamanho, soma);
  });
  return { nome, tamanho, registros, tamanhos };
}

function linha(lay, id, valores = {}) {
  const campos = lay.registros[id];
  if (!campos) throw new Error(`Layout ${lay.nome}: registro ${id} não existe.`);
  return (id + campos.map((c) => formatar(c, valores[c.nome], id)).join('')).padEnd(lay.tamanhos[id], ' ');
}

// Lê o arquivo: [{ id, campos, numeroLinha }]. Tolera linhas cortadas (sem o filler), CRLF e BOM.
function ler(lay, texto) {
  const linhas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/);
  const saida = [];
  linhas.forEach((bruta, i) => {
    if (!bruta.trim()) return;
    const id = bruta.slice(0, 3);
    const campos = lay.registros[id];
    if (!campos) { saida.push({ id, campos: null, bruta, numeroLinha: i + 1 }); return; }
    const l = bruta.padEnd(lay.tamanhos[id], ' ');
    let pos = 3; const v = {};
    campos.forEach((c) => { v[c.nome] = interpretar(c, l.slice(pos, pos + c.tam)); pos += c.tam; });
    saida.push({ id, campos: v, bruta, numeroLinha: i + 1 });
  });
  return saida;
}

// Identificações do cabeçalho: intercâmbio (12) e documento (14), ex.: NOT1210143001 / NOTFI1210143001.
function identificacoes(prefixo3, prefixo5, quando = new Date(), seq = 1) {
  const d = partesData(quando);
  const marca = `${p2(d.d)}${p2(d.m)}${p2(d.h)}${p2(d.mi)}${String(seq % 10)}`;
  return { intercambio: `${prefixo3}${marca}`, documento: `${prefixo5}${marca}` };
}

module.exports = { A, N, D8, D6, H4, layout, linha, ler, identificacoes, semAcento, partesData };
