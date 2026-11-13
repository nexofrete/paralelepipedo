// Contestação: motivo sugerido e valor a contestar (src/contestacoes.js).
const test = require('node:test');
const assert = require('node:assert');
const { sugerirMotivo, valorContestado } = require('../src/contestacoes');

test('motivo sugerido pelos alertas e pela conferência do CT-e', () => {
  assert.strictEqual(sugerirMotivo({ alerta_cobranca_dupla: true }), 'cobranca_dobro');
  assert.strictEqual(sugerirMotivo({ valor_total_cte: 980, valor_total_frete: 300 }), 'trecho_errado');
  assert.strictEqual(sugerirMotivo({ valor_total_cte: 120, valor_total_frete: 100 }, { apontamentos: [{ codigo: 'TAXA_NAO_PREVISTA' }] }), 'taxa_nao_prevista');
  assert.strictEqual(sugerirMotivo({ valor_total_cte: 120, valor_total_frete: 100 }, { apontamentos: [{ codigo: 'PESO' }] }), 'peso_divergente');
  assert.strictEqual(sugerirMotivo({ valor_total_cte: 120, valor_total_frete: 100 }, { componentes: [{ chave: 'tde', situacao: 'a_mais' }] }), 'taxa_acima');
  assert.strictEqual(sugerirMotivo({ valor_total_cte: 120, valor_total_frete: 100 }, null), 'valor_acima');
});

test('valor a contestar: o que passou da tabela, ou o CT-e inteiro', () => {
  assert.strictEqual(valorContestado({ valor_total_cte: 150, dif_negociado_tabela: -50 }, 'valor_acima'), 50);
  assert.strictEqual(valorContestado({ valor_total_cte: 210, dif_negociado_tabela: 0 }, 'cobranca_dobro'), 210);
});
