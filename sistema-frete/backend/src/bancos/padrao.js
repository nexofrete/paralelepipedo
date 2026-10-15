// Conta onde cai um recebimento/pagamento quando a tela não escolheu:
// dinheiro vai para o caixa; o resto para a conta marcada como padrão.
const pool = require('../db');

async function contaDoLancamento(contaId, forma, cliente = pool) {
  if (contaId) {
    const { rows } = await cliente.query('SELECT id FROM contas_bancarias WHERE id = $1 AND ativo', [Number(contaId)]);
    if (!rows[0]) throw Object.assign(new Error('Conta bancária não encontrada ou inativa.'), { status: 400 });
    return rows[0].id;
  }
  const { rows } = await cliente.query(
    `SELECT id FROM contas_bancarias WHERE ativo ORDER BY (tipo = 'caixa') = $1 DESC, padrao DESC, tipo = 'banco' DESC, id LIMIT 1`, [forma === 'dinheiro']);
  return rows[0]?.id || null;
}

module.exports = { contaDoLancamento };
