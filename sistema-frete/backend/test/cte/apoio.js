// Apoio aos testes do CT-e: certificado A1 de teste (autoassinado) e dados de exemplo.
const forge = require('node-forge');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function pfxDeTeste(senha = '1234', cnpj = '11222333000181') {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const nome = [{ name: 'commonName', value: `TRANSPORTES TESTE LTDA:${cnpj}` }, { name: 'countryName', value: 'BR' }];
  cert.setSubject(nome); cert.setIssuer(nome);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

const endereco = (cMun, xMun, UF) => ({ xLgr: 'RUA TESTE', nro: '100', xBairro: 'CENTRO', cMun, xMun, CEP: '13000000', UF });
function dadosDeExemplo(extra = {}) {
  return {
    ambiente: 2, serie: 1, numero: 123, cfop: '6353', natOp: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    emitente: {
      cnpj: '11222333000181', ie: '123456789012', xNome: 'TRANSPORTES TESTE LTDA', xFant: 'TESTE', crt: 3, rntrc: '12345678',
      endereco: { ...endereco('3509502', 'CAMPINAS', 'SP'), fone: '1932323232' },
    },
    tomador: '0',
    remetente: { cnpj: '44555666000199', ie: '111222333444', xNome: 'INDUSTRIA REMETENTE SA', endereco: endereco('3509502', 'CAMPINAS', 'SP') },
    destinatario: { cnpj: '77888999000155', ie: 'ISENTO', xNome: 'CLIENTE DESTINO LTDA', endereco: endereco('3304557', 'RIO DE JANEIRO', 'RJ') },
    inicio: { cMun: '3509502', xMun: 'CAMPINAS', UF: 'SP' },
    fim: { cMun: '3304557', xMun: 'RIO DE JANEIRO', UF: 'RJ' },
    valores: { vTPrest: 350.5, componentes: [{ xNome: 'FRETE PESO', vComp: 300 }, { xNome: 'GRIS', vComp: 50.5 }] },
    icms: { cst: '00', vBC: 350.5, pICMS: 12, vICMS: 42.06 },
    carga: { vCarga: 10000, proPred: 'MOVEIS', quantidades: [{ cUnid: '01', tpMed: 'PESO BRUTO', qCarga: 520.5 }, { cUnid: '03', tpMed: 'VOLUMES', qCarga: 12 }] },
    nfes: ['35260144555666000199550010000012341000012345'],
    observacoes: 'Entregar em horario comercial & conferir volumes <frageis>',
    respTec: { cnpj: '11222333000181', xContato: 'SUPORTE', email: 'suporte@teste.com.br', fone: '1932323232' },
    ...extra,
  };
}

// Valida um XML contra um XSD com o xmllint. Devolve null se válido, ou o erro.
function validarXsd(xml, xsd) {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cte-')), 'doc.xml');
  fs.writeFileSync(arq, xml);
  try {
    execFileSync('xmllint', ['--noout', '--schema', xsd, arq], { stdio: 'pipe' });
    return null;
  } catch (e) {
    return String(e.stderr || e.message);
  }
}
const temXmllint = () => { try { execFileSync('xmllint', ['--version'], { stdio: 'pipe' }); return true; } catch { return false; } };

module.exports = { pfxDeTeste, dadosDeExemplo, validarXsd, temXmllint, SCHEMAS: path.join(__dirname, 'schemas') };
