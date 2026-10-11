// UFs (código IBGE) e qual SEFAZ autoriza o CT-e de cada uma, com os
// endereços dos webservices do CT-e 4.00 (homologação e produção).
// Conferidos com a tabela de webservices do projeto sped-cte (nfephp-org).

const CODIGO_UF = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26,
  AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53,
};

// Quem autoriza o CT-e de cada UF: a própria SEFAZ ou uma SEFAZ Virtual.
const AUTORIZADOR_DA_UF = {
  MG: 'MG', MS: 'MS', MT: 'MT', PR: 'PR', SP: 'SP',
  AP: 'SVSP', PE: 'SVSP', RR: 'SVSP',
};
const autorizadorDaUf = (uf) => AUTORIZADOR_DA_UF[String(uf || '').toUpperCase()] || 'SVRS';

const SVRS = (h) => ({
  recepcao: `https://${h}/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx`,
  consulta: `https://${h}/ws/CTeConsultaV4/CTeConsultaV4.asmx`,
  status: `https://${h}/ws/CTeStatusServicoV4/CTeStatusServicoV4.asmx`,
  evento: `https://${h}/ws/CTeRecepcaoEventoV4/CTeRecepcaoEventoV4.asmx`,
});
const SP = (h) => ({
  recepcao: `https://${h}/CTeWS/WS/CTeRecepcaoSincV4.asmx`,
  consulta: `https://${h}/CTeWS/WS/CTeConsultaV4.asmx`,
  status: `https://${h}/CTeWS/WS/CTeStatusServicoV4.asmx`,
  evento: `https://${h}/CTeWS/WS/CTeRecepcaoEventoV4.asmx`,
});
const SEM_ASMX = (base) => ({
  recepcao: `${base}/CTeRecepcaoSincV4`,
  consulta: `${base}/CTeConsultaV4`,
  status: `${base}/CTeStatusServicoV4`,
  evento: `${base}/CTeRecepcaoEventoV4`,
});

// [autorizador][tpAmb: 1 produção, 2 homologação]
const WEBSERVICES = {
  SVRS: {
    1: { ...SVRS('cte.svrs.rs.gov.br'), qrCode: 'https://dfe-portal.svrs.rs.gov.br/cte/qrCode' },
    2: { ...SVRS('cte-homologacao.svrs.rs.gov.br'), qrCode: 'https://dfe-portal.svrs.rs.gov.br/cte/qrCode' },
  },
  SP: {
    1: { ...SP('nfe.fazenda.sp.gov.br'), qrCode: 'https://nfe.fazenda.sp.gov.br/CTeConsulta/qrCode' },
    2: { ...SP('homologacao.nfe.fazenda.sp.gov.br'), qrCode: 'https://homologacao.nfe.fazenda.sp.gov.br/CTeConsulta/qrCode' },
  },
  MG: {
    1: { ...SEM_ASMX('https://cte.fazenda.mg.gov.br/cte/services'), qrCode: 'https://portalcte.fazenda.mg.gov.br/portalcte/sistema/qrcode.xhtml' },
    2: { ...SEM_ASMX('https://hcte.fazenda.mg.gov.br/cte/services'), qrCode: 'https://portalcte.fazenda.mg.gov.br/portalcte/sistema/qrcode.xhtml' },
  },
  MS: {
    1: { ...SEM_ASMX('https://producao.cte.ms.gov.br/ws'), qrCode: 'http://www.dfe.ms.gov.br/cte/qrcode' },
    2: { ...SEM_ASMX('https://homologacao.cte.ms.gov.br/ws'), qrCode: 'http://www.dfe.ms.gov.br/cte/qrcode' },
  },
  MT: {
    1: { ...SEM_ASMX('https://cte.sefaz.mt.gov.br/ctews2/services'), qrCode: 'https://www.sefaz.mt.gov.br/cte/qrcode' },
    2: { ...SEM_ASMX('https://homologacao.sefaz.mt.gov.br/ctews2/services'), qrCode: 'https://homologacao.sefaz.mt.gov.br/cte/qrcode' },
  },
  PR: {
    1: { ...SEM_ASMX('https://cte.fazenda.pr.gov.br/cte4'), qrCode: 'http://www.fazenda.pr.gov.br/cte/qrcode' },
    2: { ...SEM_ASMX('https://homologacao.cte.fazenda.pr.gov.br/cte4'), qrCode: 'http://www.fazenda.pr.gov.br/cte/qrcode' },
  },
};
WEBSERVICES.SVSP = WEBSERVICES.SP;

function webservicesDaUf(uf, tpAmb) {
  const aut = autorizadorDaUf(uf);
  return { autorizador: aut, ...WEBSERVICES[aut][Number(tpAmb) === 1 ? 1 : 2] };
}

module.exports = { CODIGO_UF, autorizadorDaUf, webservicesDaUf };
