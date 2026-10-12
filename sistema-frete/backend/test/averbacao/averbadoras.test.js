// Averbação do seguro: leitura dos retornos da AT&M e da AverbePorto e o envio
// (SOAP da AT&M e login + upload da Porto) contra servidores falsos.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { enviar, lerRetornoAtm, lerRetornoPorto } = require('../../src/averbacao/averbadoras');

const envelope = (corpo) => `<?xml version="1.0" encoding="utf-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns1:averbaCTeResponse xmlns:ns1="http://schemas.xmlsoap.org/soap/envelope/"><Response>${corpo}</Response></ns1:averbaCTeResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
const AVERBADO = envelope('<Numero>83</Numero><Serie>1</Serie><CNPJCli>28125153000184</CNPJCli><TpDoc>2</TpDoc><Averbado><dhAverbacao>2022-06-10T12:04:25</dhAverbacao><Protocolo>CUE4FQ52NI4XN47D18518D9Y6QQXS</Protocolo><DadosSeguro><NumeroAverbacao>0651310222812515300018457001000000083120</NumeroAverbacao></DadosSeguro></Averbado><Infos><Info><Codigo>001</Codigo><Descricao>Documento ja averbado</Descricao></Info></Infos>');
const RECUSADO = envelope('<Numero>1</Numero><Serie>3</Serie><Erros><Erro><Codigo>033</Codigo><Descricao>CNPJ emissor nao autorizado para averbar...</Descricao></Erro></Erros>');

test('AT&M: lê protocolo e número de averbação, erros e o formato antigo', () => {
  const ok = lerRetornoAtm(AVERBADO);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.protocolo, 'CUE4FQ52NI4XN47D18518D9Y6QQXS');
  assert.strictEqual(ok.numero, '0651310222812515300018457001000000083120');
  assert.match(ok.mensagem, /ja averbado/);
  const erro = lerRetornoAtm(RECUSADO);
  assert.strictEqual(erro.ok, false);
  assert.match(erro.mensagem, /033 - CNPJ emissor nao autorizado/);
  assert.strictEqual(lerRetornoAtm(envelope('<Erros><Erro><Codigo>910</Codigo><Descricao>Servico indisponivel</Descricao></Erro></Erros>')).tentarDeNovo, true);
  const antigo = lerRetornoAtm('<MSGS><TESTE><NUMDOC>1</NUMDOC><PROTOCOLO><DATA>01-01-2026</DATA><HORA>10:00:00</HORA><PROTOCOLONUMERO>TESTE</PROTOCOLONUMERO></PROTOCOLO></TESTE></MSGS>');
  assert.deepStrictEqual([antigo.ok, antigo.teste, antigo.protocolo], [true, true, 'TESTE']);
  assert.match(lerRetornoAtm('<x><faultstring>error in msg parsing</faultstring></x>').mensagem, /recusou a mensagem/);
});

test('AverbePorto: processado, duplicado e rejeitado', () => {
  assert.deepStrictEqual(lerRetornoPorto('{"success":1,"S":{"P":1,"D":0,"R":0,"N":0},"prot":"0588603230780110500019955055000151287062"}').numero, '0588603230780110500019955055000151287062');
  assert.match(lerRetornoPorto('{"success":1,"S":{"P":0,"D":1,"R":0,"N":0},"prot":"123"}').mensagem, /duplicado/);
  assert.strictEqual(lerRetornoPorto('{"success":1,"S":{"P":0,"D":0,"R":1,"N":0}}').ok, false);
  assert.strictEqual(lerRetornoPorto('nao e json').ok, false);
});

function servidor(responder) {
  return new Promise((resolve) => {
    const recebidos = [];
    const s = http.createServer((req, res) => {
      const partes = [];
      req.on('data', (p) => partes.push(p));
      req.on('end', () => { const r = { url: req.url, headers: req.headers, corpo: Buffer.concat(partes).toString('utf8') }; recebidos.push(r); responder(r, res); });
    }).listen(0, '127.0.0.1', () => resolve({ s, recebidos, url: `http://127.0.0.1:${s.address().port}/20/index.soap` }));
  });
}

test('AT&M: envelope SOAP com usuário, senha, código e o XML em CDATA', async () => {
  const { s, recebidos, url } = await servidor((r, res) => { res.setHeader('Content-Type', 'text/xml'); res.end(AVERBADO); });
  try {
    const r = await enviar({ provedor: 'atm', usuario: 'user&1', senha: 's3nh<a', codigo: '12345', ambiente: 2, url }, 'cte', '<?xml version="1.0"?><cteProc><CTe/></cteProc>');
    assert.strictEqual(r.ok, true);
    const { headers, corpo } = recebidos[0];
    assert.strictEqual(headers.soapaction, 'urn:ATMWebSvr#averbaCTe');
    assert.match(corpo, /<urn:averbaCTe><usuario>user&amp;1<\/usuario><senha>s3nh&lt;a<\/senha><codatm>12345<\/codatm><xmlCTe><!\[CDATA\[<cteProc><CTe\/><\/cteProc>\]\]><\/xmlCTe>/);
    await enviar({ provedor: 'atm', usuario: 'u', senha: 's', codigo: '1', url }, 'mdfe', '<mdfeProc/>');
    assert.strictEqual(recebidos[1].headers.soapaction, 'urn:ATMWebSvr#declaraMDFe');
    assert.match(recebidos[1].corpo, /<xmlMDFe><!\[CDATA\[<mdfeProc\/>\]\]><\/xmlMDFe>/);
    await assert.rejects(() => enviar({ provedor: 'atm', usuario: 'u', url }, 'cte', '<x/>'), /usuário, senha e código AT&M/);
  } finally { s.close(); }
});

test('AverbePorto: login guarda o cookie e o upload vai como arquivo', async () => {
  const { s, recebidos, url } = await servidor((r, res) => {
    if (/name="mod"\r\n\r\nlogin/.test(r.corpo)) { res.setHeader('Set-Cookie', 'portal[ses]=abc123; path=/'); return res.end('{"success":1,"C":{"id":"1"}}'); }
    return res.end(r.headers.cookie === 'portal[ses]=abc123' ? '{"success":1,"S":{"P":1,"D":0,"R":0,"N":0},"prot":"0588"}' : '{"success":1,"logout":1}');
  });
  try {
    const r = await enviar({ provedor: 'porto', usuario: 'u', senha: 's', url }, 'cte', '<cteProc/>', { nomeArquivo: '3526.xml' });
    assert.deepStrictEqual([r.ok, r.numero], [true, '0588']);
    assert.match(recebidos[1].corpo, /name="mod"\r\n\r\nUpload/);
    assert.match(recebidos[1].corpo, /name="file"; filename="3526.xml"\r\nContent-Type: text\/xml\r\n\r\n<cteProc\/>/);
  } finally { s.close(); }
});

test('demonstração: simula sem rede e marca como teste', async () => {
  const r = await enviar({ simulado: true }, 'cte', '<CTe><infCte Id="CTe35261011222333000181570010000000161123456785"/></CTe>');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.teste, true);
  assert.match(r.mensagem, /DEMONSTRAÇÃO/);
});
