// Gerenciadoras de risco (GR). Cada uma responde às mesmas chamadas:
//   consultarMotorista({ cpf, nome, cnh, cnh_validade }) → { status, protocolo, motivo }
//   consultarVeiculo({ placa, renavam, proprietario })    → { status, protocolo, motivo }
//   enviarSM(viagem)                                      → { numero }    solicitação de monitoramento
//   cancelarSM(viagem, motivo)                            → { protocolo }
// status: liberado | negado | pendente (a GR ainda está analisando).
// Buonny, Telerisco, Opentech e Tecnorisk liberam a API (manual e credenciais) com o contrato; até lá
// respondem com aviso e nada é enviado. O SIMULADOR faz o fluxo inteiro, sem valor para a seguradora.
const crypto = require('crypto');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const numeros = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

// Simulador: regras simples e previsíveis, para treinar a equipe.
const simulador = {
  nome: 'Simulador (sem valor para a seguradora)', simulado: true, credenciais: [],
  async consultarMotorista(m) {
    if (!m.cnh) return { status: 'pendente', protocolo: `SIM${numeros(8)}`, motivo: 'CNH não informada no cadastro do motorista.' };
    if (m.cnh_validade && String(m.cnh_validade).slice(0, 10) < hoje()) return { status: 'negado', protocolo: `SIM${numeros(8)}`, motivo: 'CNH vencida.' };
    return { status: 'liberado', protocolo: `SIM${numeros(8)}`, motivo: null };
  },
  async consultarVeiculo(v) {
    if (!v.renavam) return { status: 'pendente', protocolo: `SIM${numeros(8)}`, motivo: 'RENAVAM não informado no cadastro do veículo.' };
    return { status: 'liberado', protocolo: `SIM${numeros(8)}`, motivo: null };
  },
  async enviarSM() { return { numero: `SM${numeros(9)}` }; },
  async cancelarSM() { return { protocolo: `SIM${numeros(8)}` }; },
};

function aguardandoContrato(nome) {
  const aviso = async () => {
    throw falha(`A integração com a ${nome} ainda não está ligada: ela precisa do manual da API e das credenciais que a ${nome} entrega com o contrato. `
      + 'Enquanto isso, faça a consulta no site da gerenciadora e registre o resultado à mão, ou use o simulador para treinar.', 501);
  };
  return { nome, simulado: false, aguardando: true, credenciais: ['usuario', 'senha', 'codigo_cliente'],
    consultarMotorista: aviso, consultarVeiculo: aviso, enviarSM: aviso, cancelarSM: aviso };
}

const PROVEDORES = {
  simulador,
  buonny: aguardandoContrato('Buonny'),
  telerisco: aguardandoContrato('Telerisco'),
  opentech: aguardandoContrato('Opentech'),
  tecnorisk: aguardandoContrato('Tecnorisk'),
};

module.exports = { PROVEDORES };
