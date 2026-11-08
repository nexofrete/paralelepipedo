// NF-Stock (Alterdata): endereços, cabeçalhos e os formatos em que o XML pode chegar.
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const ns = require('../src/integracao/nfstock');
const { criptografar } = require('../src/cte/certificado');

const XML = '<cteProc xmlns="http://www.portalfiscal.inf.br/cte"><CTe><infCte Id="CTe1"/></CTe></cteProc>';
const cfg = { ambiente: 'producao', codigo_crm: '123', cnpj: '11222333000181', token: criptografar(Buffer.from('TOKEN-X', 'utf8')) };

function comFetch(resposta, fn) {
  const chamadas = [];
  const antes = global.fetch;
  global.fetch = async (url, op = {}) => { chamadas.push({ url: String(url), op }); return new Response(typeof resposta === 'string' ? resposta : JSON.stringify(resposta), { status: 200 }); };
  return fn(chamadas).finally(() => { global.fetch = antes; });
}

test('NF-Stock: código CRM com 6 dígitos (zeros à esquerda)', () => {
  assert.strictEqual(ns.crm6('123'), '000123');
  assert.strictEqual(ns.crm6('000123'), '000123');
  assert.strictEqual(ns.crm6(''), '');
});

test('NF-Stock: busca de documentos novos (URL, NSU, XML e Bearer)', () => comFetch({ total: 0, documentos: [] }, async (ch) => {
  await ns.http.novos(cfg, 77);
  assert.strictEqual(ch[0].url, 'https://ms-exportacao-nfstock.pack.alterdata.com.br/api/v1/000123/11222333000181/documentos/77/novos?Tamanho=50&Xml=true');
  assert.strictEqual(ch[0].op.headers.Authorization, 'Bearer TOKEN-X');
  await ns.http.novos({ ...cfg, ambiente: 'desenvolvimento' }, 0, { tamanho: 1, xml: false });
  assert.match(ch[1].url, /^https:\/\/ms-exportacao\.dev\.pack\.alterdata\.com\.br\/api\/v1\/000123\/11222333000181\/documentos\/0\/novos\?Tamanho=1&Xml=false$/);
}));

test('NF-Stock: envio em três passos (URL assinada sem token e sem Content-Type)', () => comFetch({ mensagem: 'Url gerada com sucesso.', url: 'https://ms-importacao.s3.amazonaws.com/abc?AWSAccessKeyId=x&Expires=1&Signature=y', id: 'abc' }, async (ch) => {
  const r = await ns.http.pedirUrl(cfg, 2999999);
  assert.strictEqual(ch[0].url, 'https://ms-importacao-service-nfstock.alterdatasoftware.com.br/storage');
  assert.strictEqual(ch[0].op.method, 'POST');
  assert.deepStrictEqual(JSON.parse(ch[0].op.body), { size: 2999999, extension: '.xml' });
  assert.strictEqual(ch[0].op.headers.Authorization, 'Bearer TOKEN-X');
  assert.strictEqual(r.id, 'abc');
  await ns.http.subir(cfg, r.url, Buffer.from(XML));
  assert.strictEqual(ch[1].op.method, 'PUT');
  assert.strictEqual(ch[1].op.headers, undefined);
  await ns.http.status(cfg, 'abc');
  assert.strictEqual(ch[2].url, 'https://ms-importacao-service-nfstock.alterdatasoftware.com.br/storage/arquivo/abc');
}));

test('NF-Stock: token recusado vira mensagem clara', async () => {
  const antes = global.fetch;
  global.fetch = async () => new Response('{"message":"Unauthorized"}', { status: 401 });
  try { await assert.rejects(ns.http.novos(cfg, 0), /recusou o token/); } finally { global.fetch = antes; }
});

test('NF-Stock: o XML pode vir em texto, base64, gzip ou zip', async () => {
  assert.deepStrictEqual(await ns.xmlsDoDocumento(cfg, { xml: XML }), [XML]);
  assert.deepStrictEqual(await ns.xmlsDoDocumento(cfg, { xml: Buffer.from(XML).toString('base64') }), [XML]);
  assert.deepStrictEqual(await ns.xmlsDoDocumento(cfg, { xml: zlib.gzipSync(Buffer.from(XML)).toString('base64') }), [XML]);
  // zip "armazenado" (sem compressão) com um arquivo
  const nome = Buffer.from('a.xml'); const dados = Buffer.from(XML);
  const crc = zlib.crc32 ? zlib.crc32(dados) : 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(nome.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(dados.length, 20); central.writeUInt32LE(dados.length, 24); central.writeUInt16LE(nome.length, 28);
  const inicioCentral = local.length + nome.length + dados.length;
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(1, 8); fim.writeUInt16LE(1, 10); fim.writeUInt32LE(central.length + nome.length, 12); fim.writeUInt32LE(inicioCentral, 16);
  const zip = Buffer.concat([local, nome, dados, central, nome, fim]);
  assert.deepStrictEqual(await ns.xmlsDoDocumento(cfg, { xml: zip.toString('base64') }), [XML]);
  // sem XML e sem url: nada
  assert.deepStrictEqual(await ns.xmlsDoDocumento(cfg, { xml: '' }), []);
});

test('NF-Stock: sem o XML no retorno, baixa pela url_download', () => comFetch(XML, async (ch) => {
  assert.deepStrictEqual(await ns.xmlsDoDocumento(cfg, { xml: null, url_download: 'https://exemplo/doc.xml' }), [XML]);
  assert.strictEqual(ch[0].url, 'https://exemplo/doc.xml');
}));
