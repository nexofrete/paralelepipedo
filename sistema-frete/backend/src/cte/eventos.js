// Eventos do CT-e 4.00: cancelamento (110111) e carta de correção (110110).
// Montam o eventoCTe sem assinatura; quem chama assina o infEvento.
const { CODIGO_UF } = require('./ufs');
const { NS, VERSAO, texto, cnpjLimpo, esc, dataHoraBrasilia } = require('./montarCte');

const COND_USO_CCE = 'A Carta de Correcao e disciplinada pelo Art. 58-B do CONVENIO/SINIEF 06/89: Fica permitida a utilizacao de carta de correcao, para regularizacao de erro ocorrido na emissao de documentos fiscais relativos a prestacao de servico de transporte, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da prestacao;II - a correcao de dados cadastrais que implique mudanca do emitente, tomador, remetente ou do destinatario;III - a data de emissao ou de saida.';

function montarEvento({ tpEvento, chave, cnpj, uf, tpAmb, nSeq = 1, detalhe }) {
  if (!CODIGO_UF[uf]) throw new Error('UF do emitente inválida.');
  const seq = String(Number(nSeq));
  const id = `ID${tpEvento}${chave}${seq.padStart(3, '0')}`;
  return `<eventoCTe xmlns="${NS}" versao="${VERSAO}"><infEvento Id="${id}">`
    + `<cOrgao>${CODIGO_UF[uf]}</cOrgao><tpAmb>${Number(tpAmb) === 1 ? 1 : 2}</tpAmb><CNPJ>${cnpjLimpo(cnpj)}</CNPJ>`
    + `<chCTe>${chave}</chCTe><dhEvento>${dataHoraBrasilia()}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${seq}</nSeqEvento>`
    + `<detEvento versaoEvento="${VERSAO}">${detalhe}</detEvento></infEvento></eventoCTe>`;
}

function cancelamento({ chave, cnpj, uf, tpAmb, nProt, justificativa }) {
  const xJust = texto(justificativa, 255);
  if (!xJust || xJust.length < 15) throw new Error('A justificativa do cancelamento precisa ter pelo menos 15 caracteres.');
  if (!/^\d{15}$/.test(String(nProt || ''))) throw new Error('CT-e sem protocolo de autorização — só dá para cancelar CT-e autorizado.');
  return montarEvento({
    tpEvento: '110111', chave, cnpj, uf, tpAmb,
    detalhe: `<evCancCTe><descEvento>Cancelamento</descEvento><nProt>${nProt}</nProt><xJust>${esc(xJust)}</xJust></evCancCTe>`,
  });
}

// correcoes: [{ grupo: 'compl', campo: 'xObs', valor: '...', item? }]
function cartaCorrecao({ chave, cnpj, uf, tpAmb, nSeq, correcoes }) {
  const itens = (correcoes || []).filter((c) => texto(c.grupo) && texto(c.campo) && texto(c.valor));
  if (!itens.length) throw new Error('Informe pelo menos uma correção (grupo, campo e novo valor).');
  const det = itens.map((c) => `<infCorrecao><grupoAlterado>${esc(texto(c.grupo, 20))}</grupoAlterado><campoAlterado>${esc(texto(c.campo, 20))}</campoAlterado>`
    + `<valorAlterado>${esc(texto(c.valor, 500))}</valorAlterado>${c.item ? `<nroItemAlterado>${String(Number(c.item)).padStart(2, '0')}</nroItemAlterado>` : ''}</infCorrecao>`).join('');
  return montarEvento({
    tpEvento: '110110', chave, cnpj, uf, tpAmb, nSeq,
    detalhe: `<evCCeCTe><descEvento>Carta de Correcao</descEvento>${det}<xCondUso>${COND_USO_CCE}</xCondUso></evCCeCTe>`,
  });
}

module.exports = { cancelamento, cartaCorrecao };
