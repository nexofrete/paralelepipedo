// PIX "copia e cola" (BR Code estático, padrão EMV do Banco Central) com a
// chave PIX da transportadora, o valor da fatura e um identificador (txid).
// Funciona em qualquer banco, sem integração: o cliente paga lendo o QR Code.

const sem = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
// Campo EMV: id (2) + tamanho (2) + valor.
const campo = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como o manual do BR Code pede.
function crc16(texto) {
  let crc = 0xffff;
  for (const b of Buffer.from(texto, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Chave como o PIX espera: CPF/CNPJ só dígitos, celular com +55 (digitado com o +),
// e-mail e chave aleatória como vieram.
function normalizarChave(chave) {
  const c = String(chave || '').trim();
  if (!c) return '';
  if (/@/.test(c)) return c.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return c.toLowerCase();
  const d = c.replace(/\D/g, '');
  if (c.startsWith('+')) return `+${d}`;   // celular: +5511987654321
  return d;   // CPF (11) ou CNPJ (14)
}

// { chave, nome, cidade, valor, txid, descricao }
function brCode({ chave, nome, cidade, valor, txid, descricao }) {
  const k = normalizarChave(chave);
  if (!k) throw new Error('Cadastre a chave PIX da empresa (Faturamento → Configuração).');
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', k) + (descricao ? campo('02', sem(descricao).slice(0, 40)) : '');
  const id = sem(txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const corpo = campo('00', '01') + campo('26', conta) + campo('52', '0000') + campo('53', '986')
    + (Number(valor) > 0 ? campo('54', Number(valor).toFixed(2)) : '') + campo('58', 'BR')
    + campo('59', sem(nome).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 25) || 'RECEBEDOR')
    + campo('60', sem(cidade).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 15) || 'BRASIL')
    + campo('62', campo('05', id)) + '6304';
  return corpo + crc16(corpo);
}

module.exports = { brCode, crc16, normalizarChave };
