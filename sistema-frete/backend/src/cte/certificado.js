// Certificado digital A1 (.pfx) do emitente: lê o arquivo, confere a senha e
// tira o que o CT-e precisa (chave privada, certificado, titular, CNPJ e validade).
// O .pfx e a senha ficam no banco criptografados (AES-256-GCM).
const crypto = require('crypto');
const forge = require('node-forge');
const config = require('../config');

const CHAVE = crypto.createHash('sha256').update(`certificado-a1:${config.jwtSecret}`).digest();
function criptografar(buffer) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', CHAVE, iv);
  const dados = Buffer.concat([c.update(buffer), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${dados.toString('base64')}`;
}
function descriptografar(valor) {
  const [v, iv, tag, dados] = String(valor || '').split(':');
  if (v !== 'v1') throw new Error('Certificado guardado num formato desconhecido — envie o .pfx de novo.');
  const d = crypto.createDecipheriv('aes-256-gcm', CHAVE, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]);
}

// Abre o .pfx. Erro com mensagem clara quando a senha não confere.
function lerPfx(pfx, senha) {
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), String(senha || ''));
  } catch (e) {
    throw new Error(/mac|password|invalid/i.test(e.message) ? 'Senha do certificado incorreta.' : 'Não consegui ler o arquivo — confira se é o certificado A1 (.pfx ou .p12).');
  }
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!chaves.length || !certs.length) throw new Error('O arquivo não tem a chave privada e o certificado — use o certificado A1 completo (.pfx).');
  const chave = chaves[0].key;
  // O certificado do titular é o que corresponde à chave privada (o .pfx pode trazer a cadeia junto).
  const doTitular = certs.map((b) => b.cert).find((c) => c.publicKey.n && c.publicKey.n.equals(chave.n)) || certs[0].cert;
  const cn = doTitular.subject.getField('CN')?.value || '';
  const cnpj = (cn.match(/:(\d{14})\s*$/) || [])[1] || null;
  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(doTitular),
    // Certificado em base64 (sem cabeçalho), como vai no X509Certificate da assinatura.
    certBase64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(doTitular)).getBytes()),
    titular: cn.replace(/:\d{11,14}\s*$/, '').trim() || cn,
    cnpj,
    validoDe: doTitular.validity.notBefore,
    validoAte: doTitular.validity.notAfter,
  };
}

// Certificado do emitente guardado no banco (empresa.id = 1), já aberto.
async function certificadoDoEmitente(pool) {
  const { rows } = await pool.query('SELECT certificado_pfx, certificado_senha, certificado_demonstracao FROM empresa WHERE id = 1');
  if (!rows[0]?.certificado_pfx) throw new Error('Nenhum certificado digital cadastrado. Envie o certificado A1 em Transportadora → Configuração fiscal.');
  const pfx = descriptografar(rows[0].certificado_pfx);
  const senha = descriptografar(rows[0].certificado_senha).toString('utf8');
  const dados = lerPfx(pfx, senha);
  if (dados.validoAte < new Date()) throw new Error(`O certificado digital venceu em ${dados.validoAte.toLocaleDateString('pt-BR')}. Envie o certificado novo.`);
  return { ...dados, pfx, senha, demonstracao: !!rows[0].certificado_demonstracao };
}

// Certificado de DEMONSTRAÇÃO: autoassinado, no nome e CNPJ da empresa. Só
// serve para o modo demonstração (a SEFAZ recusa: não é da ICP-Brasil).
function gerarCertificadoDemonstracao({ razaoSocial, cnpj }) {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = `01${crypto.randomBytes(8).toString('hex')}`;
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const sujeito = [{ name: 'commonName', value: `${String(razaoSocial || 'EMPRESA DEMONSTRACAO').slice(0, 40)}:${cnpj}` },
    { name: 'organizationName', value: 'DEMONSTRACAO NEXOFRETE - SEM VALOR' }, { name: 'countryName', value: 'BR' }];
  cert.setSubject(sujeito); cert.setIssuer(sujeito);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const senha = crypto.randomBytes(12).toString('hex');
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, { algorithm: '3des' });
  return { pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'), senha };
}

module.exports = { criptografar, descriptografar, lerPfx, certificadoDoEmitente, gerarCertificadoDemonstracao };
