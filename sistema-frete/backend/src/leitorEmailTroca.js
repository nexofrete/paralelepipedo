// Lê o e-mail padrão de devolução / troca de nota e devolve os campos.
// Modelo (exemplo real):
//   "Informamos a devolução da NF 187470 do cliente OKUDA HOME ... (65.603.606/0001-67)
//    Sob nota de retorno 189490 - Motivo da devolução do documento: ...
//    · NF SUBSTITUTA: 189493  · PEDIDO 207463  · REPRESENTANTE: ...
//    · TABELA DE PREÇO: 02    · MOVIMENTAÇÃO DA MERCADORIA: ..."
// Regras tolerantes a acento, maiúscula, "nº", dois-pontos e marcadores (·, •, -).
const limpar = (t) => String(t || '').replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ').trim();
const num = (t) => (String(t || '').match(/\d+/) || [null])[0];
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function lerEmailTroca(textoOriginal) {
  const texto = limpar(textoOriginal);
  const t = semAcento(texto);   // para os padrões; os valores saem do texto original quando precisam de acento
  const achar = (re) => { const m = t.match(re); return m ? m : null; };
  const valorOriginal = (m, grupo = 1) => {
    if (!m) return null;
    const ini = m.index + m[0].indexOf(m[grupo]);
    return texto.slice(ini, ini + m[grupo].length).trim();
  };
  const r = {};
  r.nf_original = num((achar(/devolu[cç]ao da (?:NF|nota(?: fiscal)?)\s*(?:n[o°º.]*\s*)?(\d{3,9})/i) || achar(/nota fiscal n[o°º.]*\s*(\d{3,9})/i) || [])[1]);
  const cli = achar(/do cliente\s+(.+?)\s*\(\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\s*\)/i);
  r.cliente = cli ? valorOriginal(cli, 1) : null;
  r.cnpj_cliente = cli ? cli[2].replace(/\D/g, '') : null;
  r.nf_retorno = num((achar(/nota de (?:retorno|devolu[cç]ao|entrada)\s*(?:n[o°º.]*\s*)?(\d{3,9})/i) || [])[1]);
  const mot = achar(/motivo da devolu[cç]ao(?: do documento)?\s*:?\s*([\s\S]+?)(?=\n\s*\n|\n\s*[·•\-*]|NF SUBSTITUTA|$)/i);
  r.motivo = mot ? limpar(valorOriginal(mot, 1)).replace(/\s*\n\s*/g, ' ') : null;
  r.nf_substituta = num((achar(/NF\s+SUBSTITUTA\s*:?\s*(?:n[o°º.]*\s*)?(\d{3,9})/i) || [])[1]);
  r.pedido = num((achar(/(?:^|\n|[·•])\s*PEDIDO\s*:?\s*(?:n[o°º.]*\s*)?(\d{3,12})/i) || achar(/\bPEDIDO\s*:?\s*(\d{3,12})/i) || [])[1]);
  const rep = achar(/REPRESENTANTE\s*:?\s*([^\n·•]+)/i);
  r.representante = rep ? limpar(valorOriginal(rep, 1)) : null;
  const mov = achar(/MOVIMENTA[CÇ]AO DA MERCADORIA\s*:?\s*([^\n·•]+)/i);
  r.movimentacao = mov ? limpar(valorOriginal(mov, 1)) : null;
  r.mercadoria_com_transportador = /posse d[oa] (?:nosso |nossa )?transportador|com o transportador|com a transportadora/i.test(t);
  r.tipo = /devolu[cç]ao/i.test(t) ? 'devolucao' : (r.nf_substituta ? 'troca' : null);
  const faltando = ['nf_original'].filter((c) => !r[c]);
  return { ...r, completo: !faltando.length, faltando };
}

module.exports = { lerEmailTroca };
