// Boleto impresso: recibo do pagador + ficha de compensação com o código de
// barras Interleaved 2 of 5 (padrão FEBRABAN).
const bol = require('./boleto');

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (v) => { const s = (v instanceof Date ? v.toISOString() : String(v || '')).slice(0, 10); return s ? s.split('-').reverse().join('/') : ''; };
const docFmt = (v) => { const d = bol.so(v); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };

const ESTILO = `
  .bol { font-family: Arial, Helvetica, sans-serif; color: #000; max-width: 186mm; margin: 14px auto 0; font-size: 10px; }
  .bol table { width: 100%; border-collapse: collapse; } .bol td { border: 1px solid #000; padding: 1px 4px 2px; vertical-align: top; height: 9mm; }
  .bol .r { font-size: 8px; display: block; color: #333; } .bol .v { font-size: 11px; font-weight: bold; } .bol .dir { text-align: right; }
  .bol .cab { display: flex; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 2px; }
  .bol .cab .banco { font-size: 15px; font-weight: bold; width: 42mm; } .bol .cab .cod { font-size: 17px; font-weight: bold; border-left: 2px solid #000; border-right: 2px solid #000; padding: 0 8px; margin-right: 8px; }
  .bol .cab .linha { font-size: 13.5px; font-weight: bold; flex: 1; text-align: right; letter-spacing: .3px; }
  .bol .corte { border-top: 1px dashed #000; margin: 10px 0 8px; text-align: right; font-size: 8px; }
  .bol .barras { padding: 6px 0 0 4px; } .bol .barras svg { width: 103mm; height: 13mm; display: block; }
  .bol .aut { text-align: right; font-size: 8px; }`;

function cabecalho(bancoCod, bancoNome, linhaFormatada) {
  return `<div class="cab"><div class="banco">${esc(bancoNome)}</div><div class="cod">${esc(bancoCod)}-${dvBanco(bancoCod)}</div><div class="linha">${esc(linhaFormatada)}</div></div>`;
}
// Dígito do código do banco que aparece no boleto (001-9, 341-7, 237-2, 033-7, 104-0, 756-0).
const DV_BANCO = { '001': '9', '341': '7', '237': '2', '033': '7', '104': '0', '756': '0' };
const dvBanco = (b) => DV_BANCO[b] ?? '0';

// f: fatura (com boleto_*), e: empresa, cfg: boleto_config, pagador: { doc, nome, endereco, bairro, cep, cidade, uf }
function fichaHtml(f, e, cfg, pagador) {
  if (!f.boleto_codigo) return '';
  const banco = bol.BANCOS[f.boleto_banco] || { nome: f.boleto_banco, beneficiario: () => '' };
  const linha = bol.formatarLinha(f.boleto_linha);
  const benef = `${e.razao_social || ''} · CNPJ ${docFmt(e.cnpj)}`;
  const agCod = banco.beneficiario(cfg || {});
  const instr = [
    cfg?.juros_mes ? `Após o vencimento, juros de ${String(cfg.juros_mes).replace('.', ',')}% ao mês (R$ ${brl((Number(f.boleto_valor) * Number(cfg.juros_mes)) / 100 / 30)} por dia).` : '',
    cfg?.multa ? `Após o vencimento, multa de ${String(cfg.multa).replace('.', ',')}%.` : '',
    Number(cfg?.protesto_dias) > 0 ? `Sujeito a protesto ${cfg.protesto_dias} dias após o vencimento.` : '',
    `Referente à fatura de transporte nº ${f.numero}.`, cfg?.instrucoes || '',
  ].filter(Boolean);
  const pag = pagador || {};
  const pagTxt = `${esc(pag.nome || f.tomador_nome)} · ${esc(docFmt(pag.doc || f.tomador_doc))}<br>${esc(pag.endereco || '')}${pag.bairro ? ` — ${esc(pag.bairro)}` : ''} · ${esc(pag.cidade || '')}/${esc(pag.uf || '')} · CEP ${esc(bol.so(pag.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2'))}`;
  const local = cfg?.local_pagamento || 'Pagável em qualquer banco, lotérica ou aplicativo até o vencimento';
  return `<style>${ESTILO}</style><div class="bol">
    <div class="corte">✂ Recibo do pagador</div>
    ${cabecalho(f.boleto_banco, banco.nome, linha)}
    <table><tr><td colspan="3"><span class="r">Beneficiário</span><span class="v">${esc(benef)}</span></td><td><span class="r">Agência / código do beneficiário</span>${esc(agCod)}</td><td class="dir"><span class="r">Vencimento</span><span class="v">${dia(f.boleto_vencimento)}</span></td></tr>
      <tr><td colspan="3"><span class="r">Pagador</span>${pagTxt}</td><td><span class="r">Nosso número</span>${esc(f.boleto_nn_exibir)}</td><td class="dir"><span class="r">Valor do documento</span><span class="v">${brl(f.boleto_valor)}</span></td></tr></table>
    <div class="aut">Autenticação mecânica</div>
    <div class="corte">✂ Ficha de compensação</div>
    ${cabecalho(f.boleto_banco, banco.nome, linha)}
    <table>
      <tr><td colspan="5"><span class="r">Local de pagamento</span>${esc(local)}</td><td class="dir" style="width:42mm;"><span class="r">Vencimento</span><span class="v">${dia(f.boleto_vencimento)}</span></td></tr>
      <tr><td colspan="5"><span class="r">Beneficiário</span>${esc(benef)}</td><td class="dir"><span class="r">Agência / código do beneficiário</span>${esc(agCod)}</td></tr>
      <tr><td><span class="r">Data do documento</span>${dia(f.emissao)}</td><td><span class="r">Nº do documento</span>FAT${esc(f.numero)}</td><td><span class="r">Espécie doc.</span>DS</td><td><span class="r">Aceite</span>N</td><td><span class="r">Data processamento</span>${dia(new Date())}</td>
        <td class="dir"><span class="r">Nosso número</span>${esc(f.boleto_nn_exibir)}</td></tr>
      <tr><td><span class="r">Uso do banco</span></td><td><span class="r">Carteira</span>${esc(cfg?.carteira || banco.carteira || '')}</td><td><span class="r">Espécie</span>R$</td><td><span class="r">Quantidade</span></td><td><span class="r">Valor</span></td>
        <td class="dir"><span class="r">(=) Valor do documento</span><span class="v">${brl(f.boleto_valor)}</span></td></tr>
      <tr><td colspan="5" rowspan="4" style="height:auto;"><span class="r">Instruções (texto de responsabilidade do beneficiário)</span>${instr.map(esc).join('<br>')}</td><td><span class="r">(−) Desconto / abatimento</span></td></tr>
      <tr><td><span class="r">(+) Mora / multa</span></td></tr><tr><td><span class="r">(+) Outros acréscimos</span></td></tr><tr><td><span class="r">(=) Valor cobrado</span></td></tr>
      <tr><td colspan="6" style="height:auto;"><span class="r">Pagador</span>${pagTxt}</td></tr>
    </table>
    <div class="aut">Autenticação mecânica — Ficha de compensação</div>
    <div class="barras">${bol.i25Svg(f.boleto_codigo, { altura: 50, estreito: 1 })}</div>
  </div>`;
}

module.exports = { fichaHtml, dvBanco };
