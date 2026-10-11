// Assinatura digital (XMLDSig) do CT-e e dos eventos, no padrão da SEFAZ:
// RSA-SHA1, canonicalização C14N, transformação "enveloped", referência ao Id
// do elemento assinado (infCte ou infEvento). A assinatura vai no fim do
// elemento raiz (CTe ou eventoCTe).
const { SignedXml } = require('xml-crypto');

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

// elemento: 'infCte' ou 'infEvento'. cert: { chavePem, certBase64 }.
function assinar(xml, elemento, cert) {
  const sig = new SignedXml({
    privateKey: cert.chavePem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${cert.certBase64}</X509Certificate></X509Data>`,
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${elemento}']`,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  // A SEFAZ espera Reference URI="#<Id>" (o xml-crypto usa o atributo Id).
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${elemento}']`, action: 'after' } });
  return sig.getSignedXml();
}

// Confere a assinatura de um XML (usado nos testes).
function conferir(xmlAssinado, certPem) {
  const { DOMParser } = require('@xmldom/xmldom');
  const doc = new DOMParser().parseFromString(xmlAssinado, 'text/xml');
  const no = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  const sig = new SignedXml({ publicCert: certPem });
  sig.loadSignature(no);
  return sig.checkSignature(xmlAssinado);
}

module.exports = { assinar, conferir };
