// Provedores de pagamento eletrônico de frete (IPEF habilitadas pela ANTT) que geram o CIOT
// e vendem o vale-pedágio. Cada provedor responde às mesmas chamadas:
//   declarar(op)          → { ciot, verificador, protocolo }          abre a operação de transporte
//   comprarValePedagio(op, { valor, eixos }) → { numero, valor, fornecedora_cnpj, fornecedora_nome }
//   encerrar(op, final)   → { protocolo }                              fim da viagem (valor e peso finais)
//   cancelar(op, motivo)  → { protocolo }                              desfaz a operação (e o vale-pedágio)
// "op" é a operação no formato do Nexofrete (pef.js › montarOperacao).
//
// Pamcard, Repom, e-Frete e Target: a API de cada um só é liberada com o contrato (manual,
// endereço e credenciais de homologação). Enquanto isso, o provedor responde com um aviso claro
// e nada é enviado. O SIMULADOR faz o fluxo inteiro sem enviar nada à ANTT (para treinar e testar).
const crypto = require('crypto');
const { municipio, distanciaKm } = require('../roteirizacao/municipios');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const numeros = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');

// Vale-pedágio estimado pela distância (linha reta × 1,3) e pelos eixos — só no simulador.
function pedagioEstimado(op, eixos) {
  const a = municipio({ ibge: op.origem.ibge }); const b = municipio({ ibge: op.destino.ibge });
  if (!a || !b) return 0;
  return centavos(distanciaKm(a, b) * 1.3 * Math.max(Number(eixos) || 2, 2) * 0.055);
}

const simulador = {
  nome: 'Simulador (sem valor legal)', site: null, simulado: true, credenciais: [],
  async declarar() { return { ciot: numeros(12), verificador: numeros(4), protocolo: `SIM${numeros(10)}` }; },
  async comprarValePedagio(op, { valor, eixos }, cfg) {
    const v = centavos(valor) || pedagioEstimado(op, eixos);
    if (!(v > 0)) throw falha('Informe o valor do vale-pedágio (o simulador não achou a rota).');
    if (!cfg.vp_fornecedora_cnpj) throw falha('Informe o CNPJ da fornecedora do vale-pedágio na configuração do CIOT.');
    return { numero: numeros(12), valor: v, fornecedora_cnpj: cfg.vp_fornecedora_cnpj, fornecedora_nome: cfg.vp_fornecedora_nome || 'Fornecedora do vale-pedágio' };
  },
  async encerrar() { return { protocolo: `SIM${numeros(10)}` }; },
  async cancelar() { return { protocolo: `SIM${numeros(10)}` }; },
};

// Provedores reais: a integração entra quando o contrato liberar o manual da API.
function aguardandoContrato(nome, site, credenciais) {
  const aviso = async () => {
    throw falha(`A integração com a ${nome} ainda não está ligada: ela precisa do manual da API e das credenciais de homologação que a ${nome} entrega com o contrato. `
      + 'Enquanto isso, use o simulador para treinar, ou declare o CIOT no site do provedor e digite o número no acerto.', 501);
  };
  return { nome, site, simulado: false, aguardando: true, credenciais, declarar: aviso, comprarValePedagio: aviso, encerrar: aviso, cancelar: aviso };
}

const PROVEDORES = {
  simulador,
  pamcard: aguardandoContrato('Pamcard', 'https://www.pamcard.com.br', ['usuario', 'senha', 'codigo_cliente']),
  repom: aguardandoContrato('Repom', 'https://www.repom.com.br', ['usuario', 'senha', 'codigo_cliente']),
  efrete: aguardandoContrato('e-Frete', 'https://www.efrete.com.br', ['usuario', 'senha', 'token_integrador']),
  target: aguardandoContrato('Target', 'https://www.targetmp.com.br', ['usuario', 'senha', 'codigo_cliente']),
};

module.exports = { PROVEDORES, pedagioEstimado };
