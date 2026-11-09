// Acesso por tela: rota → tela, níveis, ações sensíveis, migração e chaves derivadas.
const test = require('node:test');
const assert = require('node:assert');
const a = require('../src/acessoTelas');

const u = (telas, acoes = []) => ({ perfil: 'interno', acesso_telas: telas, acesso_acoes: acoes });

test('Acesso: a tela de cada rota (o prefixo mais comprido vale)', () => {
  assert.strictEqual(a.telaDaRota('/api/mdfe/veiculos?x=1').id, 'veiculos');
  assert.strictEqual(a.telaDaRota('/api/mdfe/12').id, 'mdfe');
  assert.strictEqual(a.telaDaRota('/api/cte-emissao/5/cancelar').id, 'cte');
  assert.strictEqual(a.telaDaRota('/api/faturamentox'), null);
  assert.strictEqual(a.telaDaRota('/api/hoje'), null);
});

test('Acesso: não vê, só consulta e opera', () => {
  const x = u({ coletas: 'consulta', cotacoes: 'opera' });
  assert.strictEqual(a.conferir(x, 'GET', '/api/coletas'), null);
  assert.match(a.conferir(x, 'POST', '/api/coletas').erro, /só consulta/);
  assert.strictEqual(a.conferir(x, 'POST', '/api/coletas/importar/ler'), null);   // POST que só lê
  assert.strictEqual(a.conferir(x, 'POST', '/api/cotacoes'), null);
  assert.match(a.conferir(x, 'GET', '/api/cte-emissao').erro, /não tem acesso à tela CT-e/);
  // leitura de lista usada por outra tela
  assert.strictEqual(a.conferir(x, 'GET', '/api/mdfe/veiculos'), null);
  assert.ok(a.conferir(x, 'POST', '/api/mdfe/veiculos'));
  assert.strictEqual(a.conferir(u({ faturamento: 'opera' }), 'GET', '/api/bancos/contas'), null);
  assert.ok(a.conferir(u({ faturamento: 'opera' }), 'GET', '/api/bancos/contas/1/extrato'));
  // cadastros: leitura livre
  assert.strictEqual(a.conferir(u({}), 'GET', '/api/clientes'), null);
  assert.ok(a.conferir(u({}), 'PUT', '/api/clientes/3'));
});

test('Acesso: ações sensíveis precisam da chave', () => {
  const x = u({ faturamento: 'opera', cte: 'opera' }, ['receber']);
  assert.strictEqual(a.conferir(x, 'POST', '/api/faturamento/7/receber'), null);
  assert.match(a.conferir(x, 'DELETE', '/api/faturamento/7/pagamentos/2').erro, /estornar/);
  assert.match(a.conferir(x, 'POST', '/api/cte-emissao/9/cancelar').erro, /cancelar ct-e/);
  assert.strictEqual(a.acaoDaRota('POST', '/api/acertos/3/acertar'), 'fechar_acerto');
});

test('Acesso: administrador, cliente e usuário sem grade não são barrados pela grade', () => {
  assert.strictEqual(a.conferir({ perfil: 'admin' }, 'POST', '/api/bancos/movimentos'), null);
  assert.strictEqual(a.conferir({ perfil: 'interno', acesso_telas: null }, 'DELETE', '/api/bancos/movimentos/1'), null);
  assert.strictEqual(a.conferir({ perfil: 'cliente' }, 'GET', '/api/faturamento'), null);
});

test('Acesso: migração = o que as permissões antigas davam; chaves derivadas da grade', () => {
  const g = a.gradeDoLegado({ pode_emitir_cte: true, modulos_bloqueados: ['frota'] });
  assert.strictEqual(g.telas.cte, 'opera');
  assert.strictEqual(g.telas.frota, 'nenhum');
  assert.strictEqual(g.telas.bancos, 'nenhum');
  assert.strictEqual(g.telas.faturamento, 'opera');   // Emitir CT-e abria o faturamento: continua (o administrador tira)
  assert.strictEqual(g.acoes.length, Object.keys(a.ACOES).length);
  const c = a.chavesDaGrade({ cotacoes: 'consulta', pagar: 'nenhum', relatorios: 'opera' });
  assert.deepStrictEqual(c, { pode_emitir_cte: true, pode_ver_financeiro: false, pode_ver_auditoria: false, pode_ver_relatorios: true, pode_ver_sinistros: false });
  const l = a.limparGrade({ cte: 'opera', inventada: 'opera', mdfe: 'xx' }, ['pagar', 'nada']);
  assert.strictEqual(l.telas.cte, 'opera'); assert.strictEqual(l.telas.mdfe, 'nenhum'); assert.ok(!('inventada' in l.telas));
  assert.deepStrictEqual(l.acoes, ['pagar']);
});

test('Acesso: os modelos prontos só usam telas, ações e permissões que existem', () => {
  const telas = new Set(a.TELAS.map((t) => t.id));
  const { CAMPOS_PERMISSAO } = require('../src/permissoes');
  assert.ok(a.MODELOS.length >= 13);
  for (const m of a.MODELOS) {
    Object.keys(m.telas).forEach((t) => assert.ok(telas.has(t), `${m.id}: tela ${t}`));
    Object.values(m.telas).forEach((n) => assert.ok(a.NIVEIS[n], `${m.id}: nível ${n}`));
    m.acoes.forEach((x) => assert.ok(a.ACOES[x], `${m.id}: ação ${x}`));
    Object.keys(m.permissoes).forEach((p) => assert.ok(CAMPOS_PERMISSAO.includes(p) && !a.CHAVES_DERIVADAS.includes(p), `${m.id}: permissão ${p}`));
  }
  const fat = a.catalogo().modelos.find((m) => m.id === 'faturista');
  assert.strictEqual(fat.telas.faturamento, 'opera');
  assert.strictEqual(fat.telas.bancos, 'nenhum');   // completado com "Não vê"
  assert.ok(Object.values(a.catalogo().modelos.find((m) => m.id === 'consulta').telas).every((n) => n === 'consulta'));
});
