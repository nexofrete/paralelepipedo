// Acesso por tela: para cada usuário interno, cada tela tem um nível — "nenhum" (não vê), "consulta"
// (vê, mas não altera) ou "opera" (vê e altera) — e as ações sensíveis têm chave própria.
//  • O servidor confere em toda requisição (middlewareAuth): rota → tela → nível; GET é consulta, o resto é
//    operar (com exceção dos POST que só leem, como "ler arquivo", "calcular", "imprimir"); ações sensíveis
//    (cancelar CT-e, dar baixa, pagar, estornar...) precisam da chave da ação.
//  • As permissões antigas (Emitir CT-e, Financeiro, Auditoria, Relatórios, Sinistros) passam a ser
//    derivadas da grade: continuam abrindo as rotas como antes, e a grade é que restringe por tela.
//  • Usuário antigo (sem grade): na subida do servidor ganha a grade equivalente ao que já tinha, com todas
//    as ações — ninguém perde acesso. Administrador sempre tem tudo; usuário "cliente" não usa a grade.
const NIVEIS = { nenhum: 'Não vê', consulta: 'Só consulta', opera: 'Opera' };

// area, nome, desc; menu: destinos do menu (js/familias.js); abas: [atributo, valor] da aba dentro da tela;
// prefixos: rotas da API; leituraPara: telas que também leem (GET) estas rotas; chave: permissão antiga
// que a tela precisa (derivada da grade); legado: permissões antigas que davam acesso (migração).
const TELAS = [
  // ---------------- Operação
  { id: 'coletas', area: 'Operação', nome: 'Coletas', desc: 'Pedidos de coleta, programação no caminhão e baixa', menu: ['t:coletas:'], prefixos: ['/api/coletas'], leituraPara: ['cotacoes', 'nfse'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'cotacoes', area: 'Operação', nome: 'Cotações', desc: 'Calcular e enviar cotações de frete', menu: ['t:cotacoes:'], prefixos: ['/api/cotacoes'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'cte', area: 'Operação', nome: 'CT-e', desc: 'Montar, transmitir e corrigir CT-e (cancelar é ação à parte)', menu: ['t:emissao-cte:lista'], abas: [['data-cte-aba', 'lista']], prefixos: ['/api/cte-emissao'], leituraPara: ['mdfe', 'fiscal'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'mdfe', area: 'Operação', nome: 'MDF-e', desc: 'Manifesto da viagem, encerramento e gerenciamento de risco', menu: ['t:emissao-cte:mdfe'], abas: [['data-cte-aba', 'mdfe']], prefixos: ['/api/mdfe', '/api/gr'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'veiculos', area: 'Operação', nome: 'Veículos e motoristas', desc: 'Cadastro de veículos, carretas e motoristas', menu: ['t:emissao-cte:frota'], abas: [['data-cte-aba', 'frota']], prefixos: ['/api/mdfe/veiculos', '/api/mdfe/motoristas'], leituraPara: ['coletas', 'romaneios', 'ocorrencias', 'filiais', 'pagar', 'acertos', 'mdfe', 'frota'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'nfse', area: 'Operação', nome: 'NFS-e', desc: 'Nota de serviço do frete municipal', menu: ['t:emissao-cte:nfse'], abas: [['data-cte-aba', 'nfse']], prefixos: ['/api/nfse'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'romaneios', area: 'Operação', nome: 'Romaneios', desc: 'Montar a carga, dar saída e fechar', menu: ['t:ocorrencias:romaneios'], abas: [['data-oc-aba', 'romaneios']], prefixos: ['/api/romaneios'], leituraPara: ['coletas', 'conferencia', 'ocorrencias'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'ocorrencias', area: 'Operação', nome: 'Ocorrências de entrega', desc: 'Baixas, ocorrências, agendamentos e tratamento', menu: ['t:ocorrencias:entregas'], abas: [['data-oc-aba', 'entregas']], prefixos: ['/api/ocorrencias'], leituraPara: ['romaneios'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'monitoramento', area: 'Operação', nome: 'Monitoramento (mapa)', desc: 'Veículos no mapa, previsão de chegada e alertas', menu: ['t:monitoramento:'], prefixos: ['/api/monitoramento', '/api/roteirizacao'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte', 'pode_ver_financeiro'] },
  { id: 'conferencia', area: 'Operação', nome: 'Conferência e etiquetas', desc: 'Bipagem da carga e etiquetas de volume', menu: ['t:conferencia:conferir', 't:conferencia:etiquetas'], prefixos: ['/api/conferencias', '/api/etiquetas'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'armazem', area: 'Operação', nome: 'Armazém', desc: 'Contratos, entradas, saídas e saldo de armazenagem', menu: ['t:armazem:'], prefixos: ['/api/armazem'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte', 'pode_ver_financeiro'] },
  { id: 'filiais', area: 'Operação', nome: 'Transferências e estoque das filiais', desc: 'Onde está a mercadoria e transferências entre filiais', menu: ['t:filiais:estoque', 't:filiais:transferencias'], prefixos: ['/api/transferencias'], leituraPara: ['conferencia'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte'] },
  { id: 'parceiros', area: 'Operação', nome: 'Parceiros e redespacho', desc: 'Parceiros, conta-corrente e acertos de redespacho', menu: ['t:parceiros:'], prefixos: ['/api/parceiros'], leituraPara: ['romaneios', 'ocorrencias', 'edi'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte', 'pode_ver_financeiro'] },
  { id: 'paletes', area: 'Operação', nome: 'Paletes', desc: 'Saldo e vales de palete', menu: ['t:paletes:'], prefixos: ['/api/paletes'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte', 'pode_ver_financeiro'] },
  { id: 'edi', area: 'Operação', nome: 'EDI', desc: 'NOTFIS, CONEMB, OCOREN e DOCCOB; recebidos automaticamente', menu: ['t:edi:'], prefixos: ['/api/edi'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte', 'pode_ver_financeiro', 'pode_ver_auditoria', 'pode_editar_registros', 'pode_enviar_xml'] },
  { id: 'sac', area: 'Operação', nome: 'SAC (chamados)', desc: 'Atendimento com protocolo', menu: ['t:sac:'], prefixos: ['/api/sac'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte', 'pode_ver_financeiro'] },
  // ---------------- Financeiro
  { id: 'faturamento', area: 'Financeiro', nome: 'Faturamento e contas a receber', desc: 'Faturas, boletos, régua de cobrança e serviços extras (baixa e estorno são ações à parte)', menu: ['t:faturamento:resumo', 't:faturamento:faturas', 't:faturamento:afaturar', 't:faturamento:boletos', 't:faturamento:regua', 't:faturamento:extras', 't:faturamento:config'], prefixos: ['/api/faturamento', '/api/regua', '/api/servicos-extras'], chave: 'pode_ver_financeiro', legado: ['pode_ver_financeiro', 'pode_emitir_cte'] },
  { id: 'pagar', area: 'Financeiro', nome: 'Contas a pagar', desc: 'Lançar e conferir contas (pagar e estornar são ações à parte)', menu: ['t:pagar:contas'], abas: [['data-cp-aba', 'contas']], prefixos: ['/api/contas-pagar'], chave: 'pode_ver_financeiro', legado: ['pode_ver_financeiro'] },
  { id: 'acertos', area: 'Financeiro', nome: 'Acerto de viagem', desc: 'Adiantamentos, despesas, CIOT e vale-pedágio', menu: ['t:pagar:acertos'], abas: [['data-cp-aba', 'acertos']], prefixos: ['/api/acertos', '/api/pef'], chave: 'pode_ver_financeiro', legado: ['pode_ver_financeiro', 'pode_emitir_cte'] },
  { id: 'comissoes', area: 'Financeiro', nome: 'Comissões', desc: 'Vendedores, apuração e fechamento', menu: ['t:comissoes:apuracao'], prefixos: ['/api/comissoes'], chave: 'pode_ver_financeiro', legado: ['pode_ver_financeiro'] },
  { id: 'bancos', area: 'Financeiro', nome: 'Caixa e bancos', desc: 'Saldos, extrato, conciliação e fluxo de caixa', menu: ['t:bancos:contas', 't:bancos:conciliacao', 't:bancos:fluxo'], prefixos: ['/api/bancos'], leituraPara: ['faturamento', 'pagar', 'acertos'], leituraRotas: ['/api/bancos/contas', '/api/bancos/contas/opcoes'], chave: 'pode_ver_financeiro', legado: ['pode_ver_financeiro'] },
  { id: 'fiscal', area: 'Financeiro', nome: 'Fiscal e contabilidade', desc: 'Livros, NF-e contra o CNPJ, GNRE, lançamentos e pacote do contador', menu: ['t:contabil:livro', 't:contabil:pacote', 't:contabil:entradas'], prefixos: ['/api/contabil', '/api/gnre'], chave: 'pode_ver_financeiro', legado: ['pode_ver_financeiro'] },
  { id: 'centros', area: 'Financeiro', nome: 'Centros de custo', desc: 'Centros de custo e resultado por centro', menu: ['t:centros:resultado'], prefixos: ['/api/centros-custo'], leituraPara: ['pagar', 'acertos', 'comissoes', 'frota'], chave: 'pode_ver_financeiro', legado: ['pode_ver_financeiro'] },
  // ---------------- Frota
  { id: 'frota', area: 'Frota', nome: 'Frota', desc: 'Custos, abastecimentos, manutenções, documentos, pneus e jornada', menu: ['t:frota:painel', 't:frota:abastecimentos', 't:frota:manutencoes', 't:frota:documentos', 't:frota:pneus', 't:frota:jornada'], prefixos: ['/api/frota'], chave: 'pode_emitir_cte', legado: ['pode_emitir_cte', 'pode_ver_financeiro'] },
  // ---------------- Gestão
  { id: 'painel', area: 'Gestão', nome: 'Painel gerencial e margem', desc: 'Indicadores da operação e margem por CT-e e por cliente', menu: ['t:painel-transporte:geral', 't:painel-transporte:resultado'], prefixos: ['/api/painel-transporte'], chave: 'pode_ver_relatorios', legado: ['pode_emitir_cte', 'pode_ver_financeiro', 'pode_ver_relatorios'] },
  { id: 'relatorios', area: 'Gestão', nome: 'Relatórios e indicadores (fretes contratados)', desc: 'Gráficos, BI, KPIs, scorecard, NF-e × CT-e', menu: ['p:relatorios', 'r:indicadores', 'r:graficos', 'r:scorecard', 'r:nfeCte', 'r:bi'], prefixos: ['/api/indicadores', '/api/nfe-cte'], chave: 'pode_ver_relatorios', legado: ['pode_ver_relatorios'] },
  // ---------------- Fretes contratados (embarcador)
  { id: 'auditoria', area: 'Fretes contratados', nome: 'Auditoria de frete', desc: 'CT-e × tabela, conferência e cobranças indevidas', menu: ['p:auditoria-frete', 'r:auditoriaFrete', 'r:cobIndevidas'], prefixos: [], chave: 'pode_ver_auditoria', legado: ['pode_ver_auditoria'] },
  { id: 'financeiro_emb', area: 'Fretes contratados', nome: 'Financeiro (fretes contratados)', desc: 'Fretes liberados, vencimentos e meta de gasto', menu: ['p:financeiro'], prefixos: [], chave: 'pode_ver_financeiro', legado: ['pode_ver_financeiro'] },
  { id: 'notas', area: 'Fretes contratados', nome: 'Notas fiscais', desc: 'NF-e, DANFE e eventos', menu: ['p:notas-fiscais'], prefixos: ['/api/notas'], chave: null, legado: ['*'] },
  { id: 'ctes_recebidos', area: 'Fretes contratados', nome: 'CT-e recebidos', desc: 'CT-e das transportadoras, DACTE e XML', menu: ['p:ctes-recebidos'], prefixos: ['/api/ctes-recebidos'], chave: null, legado: ['*'] },
  { id: 'sinistros', area: 'Fretes contratados', nome: 'Sinistros', desc: 'Avarias e extravios', menu: ['p:sinistros'], prefixos: ['/api/sinistros'], chave: 'pode_ver_sinistros', legado: ['pode_ver_sinistros'] },
  // ---------------- Cadastros (a leitura é livre: as outras telas usam as listas)
  { id: 'clientes', area: 'Cadastros', nome: 'Clientes', desc: 'Cadastro de clientes, IE e condição de pagamento (alterar também precisa de "Gerenciar transportadoras" ou "Editar / lançar registros")', menu: ['t:cadastros:clientes'], abas: [['data-subpagina', 'clientes']], prefixos: ['/api/clientes'], leituraLivre: true, chave: null, legado: ['*'] },
  { id: 'cadastros_basicos', area: 'Cadastros', nome: 'Cadastros básicos', desc: 'Fornecedores, ajudantes, conjuntos, produtos, regiões, condições...', menu: ['p:cadastros-basicos', 't:cadastros-basicos:fornecedores', 't:cadastros-basicos:conjuntos_veiculo', 't:cadastros-basicos:ajudantes', 't:cadastros-basicos:produtos', 't:cadastros-basicos:tipos_mercadoria', 't:cadastros-basicos:regioes_atendimento', 't:cadastros-basicos:tipos_operacao', 't:cadastros-basicos:condicoes_pagamento', 't:cadastros-basicos:departamentos'], prefixos: ['/api/cadastros-basicos'], leituraLivre: true, chave: null, legado: ['*'] },
];

// Ações sensíveis: [método, expressão da rota].
const ACOES = {
  cancelar_documento: { nome: 'Cancelar CT-e e NFS-e', rotas: [['POST', /^\/api\/cte-emissao\/\d+\/cancelar(-pendente)?$/], ['POST', /^\/api\/nfse\/\d+\/cancelar$/]] },
  receber: { nome: 'Dar baixa em faturas (recebimento, retorno de boleto, PIX)', rotas: [['POST', /^\/api\/faturamento\/\d+\/receber$/], ['POST', /^\/api\/faturamento\/boleto\/retorno$/], ['POST', /^\/api\/faturamento\/pix-api\/conferir$/]] },
  pagar: { nome: 'Pagar contas', rotas: [['POST', /^\/api\/contas-pagar\/\d+\/pagar$/]] },
  estornar: { nome: 'Estornar recebimentos e pagamentos, desfazer conciliação', rotas: [['DELETE', /^\/api\/faturamento\/\d+\/pagamentos\/\d+$/], ['DELETE', /^\/api\/contas-pagar\/\d+\/pagamentos\/\d+$/], ['POST', /^\/api\/bancos\/extrato\/\d+\/desfazer$/], ['DELETE', /^\/api\/bancos\/movimentos\/\d+$/]] },
  cancelar_financeiro: { nome: 'Cancelar faturas, contas a pagar, acertos e fechamentos de comissão', rotas: [['POST', /^\/api\/faturamento\/\d+\/cancelar$/], ['POST', /^\/api\/contas-pagar\/\d+\/cancelar$/], ['POST', /^\/api\/acertos\/\d+\/cancelar$/], ['POST', /^\/api\/comissoes\/fechamentos\/\d+\/cancelar$/]] },
  fechar_acerto: { nome: 'Fechar e reabrir acerto de viagem', rotas: [['POST', /^\/api\/acertos\/\d+\/(acertar|reabrir)$/]] },
};

// POST que só lê (vale em "Só consulta").
const POST_LEITURA = /\/(ler|calcular|simular|previa|zip|danfes|xlsx|imprimir|zpl|pdf|testar|conferir-previa)(\/[\w-]*)?$/;

const PORID = new Map(TELAS.map((t) => [t.id, t]));
const casa = (rota, p) => rota === p || rota.startsWith(`${p}/`);

// A tela de uma rota: o prefixo mais comprido que casa.
function telaDaRota(url) {
  const rota = String(url || '').split('?')[0];
  let melhor = null; let tam = 0;
  for (const t of TELAS) for (const p of t.prefixos) if (casa(rota, p) && p.length > tam) { melhor = t; tam = p.length; }
  return melhor;
}
function acaoDaRota(metodo, url) {
  const rota = String(url || '').split('?')[0];
  return Object.keys(ACOES).find((k) => ACOES[k].rotas.some(([m, re]) => m === metodo && re.test(rota))) || null;
}
const usaGrade = (u) => !!u && u.perfil === 'interno' && u.acesso_telas && typeof u.acesso_telas === 'object';
function nivelDe(u, telaId) {
  if (!u || u.perfil === 'admin') return 'opera';
  if (!usaGrade(u)) return 'opera';   // sem grade: valem só as permissões antigas
  return NIVEIS[u.acesso_telas[telaId]] ? u.acesso_telas[telaId] : 'nenhum';
}
const temAcao = (u, acao) => !u || u.perfil === 'admin' || !usaGrade(u) || u.acesso_acoes == null || (u.acesso_acoes || []).includes(acao);

// Confere a requisição. Devolve null (pode) ou { status, erro }.
function conferir(u, metodo, url) {
  if (!usaGrade(u)) return null;
  const rota = String(url || '').split('?')[0];
  const t = telaDaRota(rota);
  if (t) {
    const nivel = nivelDe(u, t.id);
    const leitura = metodo === 'GET' || metodo === 'HEAD' || (metodo === 'POST' && POST_LEITURA.test(rota));
    if (nivel === 'nenhum') {
      // Outras telas que leem estas rotas (ex.: a lista de veículos na Coleta); leituraRotas limita a quais rotas.
      const rotaLiberada = !t.leituraRotas || t.leituraRotas.includes(rota);   // só exatamente estas (a lista), não o extrato
      const outra = leitura && (t.leituraLivre || (rotaLiberada && (t.leituraPara || []).some((id) => nivelDe(u, id) !== 'nenhum')));
      if (!outra) return { status: 403, erro: `Seu usuário não tem acesso à tela ${t.nome}. Fale com o administrador.`, tela: t.id };
    } else if (nivel === 'consulta' && !leitura) {
      return { status: 403, erro: `Na tela ${t.nome} o seu usuário só consulta: não pode alterar. Fale com o administrador.`, tela: t.id };
    }
  }
  const acao = acaoDaRota(metodo, rota);
  if (acao && !temAcao(u, acao)) return { status: 403, erro: `Seu usuário não pode: ${ACOES[acao].nome.toLowerCase()}. Fale com o administrador.`, acao };
  return null;
}

// Grade equivalente às permissões antigas (migração e usuários sem grade).
function gradeDoLegado(u) {
  const bloq = u.modulos_bloqueados || [];
  const { MODULOS } = require('./permissoes');
  const tem = (perms) => perms.includes('*') || perms.some((p) => u[p]);
  const telas = {};
  for (const t of TELAS) {
    const pagina = (t.menu[0] || '').split(':')[1];
    const moduloFora = bloq.some((m) => (MODULOS[m]?.paginas || []).includes(pagina) || (MODULOS[m]?.prefixos || []).some((p) => t.prefixos.some((q) => casa(q, p))));
    telas[t.id] = tem(t.legado) && !moduloFora ? 'opera' : 'nenhum';
  }
  return { telas, acoes: Object.keys(ACOES) };
}

// Limpa o que veio da tela.
function limparGrade(telas, acoes) {
  const t = {};
  for (const x of TELAS) t[x.id] = NIVEIS[telas?.[x.id]] ? telas[x.id] : 'nenhum';
  const a = [...new Set((Array.isArray(acoes) ? acoes : []).filter((k) => ACOES[k]))];
  return { telas: t, acoes: a };
}

// Permissões antigas que a grade abre (as das telas viram verdadeiras/falsas conforme a grade).
const CHAVES_DERIVADAS = ['pode_emitir_cte', 'pode_ver_financeiro', 'pode_ver_auditoria', 'pode_ver_relatorios', 'pode_ver_sinistros'];
function chavesDaGrade(telas) {
  const r = Object.fromEntries(CHAVES_DERIVADAS.map((c) => [c, false]));
  for (const t of TELAS) if (t.chave && telas[t.id] && telas[t.id] !== 'nenhum') r[t.chave] = true;
  return r;
}

// Migração na subida: usuários internos sem grade (e perfis de acesso) ganham a grade equivalente.
async function migrar(pool) {
  const { rows } = await pool.query(`SELECT * FROM usuarios WHERE perfil = 'interno' AND acesso_telas IS NULL`);
  for (const u of rows) {
    const g = gradeDoLegado(u);
    await pool.query('UPDATE usuarios SET acesso_telas = $2, acesso_acoes = $3 WHERE id = $1', [u.id, JSON.stringify(g.telas), g.acoes]);
  }
  const { rows: perfis } = await pool.query('SELECT * FROM perfis_acesso WHERE telas IS NULL');
  for (const p of perfis) {
    const g = gradeDoLegado({ ...(p.permissoes || {}), modulos_bloqueados: p.modulos_bloqueados });
    await pool.query('UPDATE perfis_acesso SET telas = $2, acoes = $3 WHERE id = $1', [p.id, JSON.stringify(g.telas), g.acoes]);
  }
  if (rows.length || perfis.length) console.log(`[acesso] grade de telas criada para ${rows.length} usuário(s) e ${perfis.length} perfil(is), igual ao acesso que já tinham.`);
}

// Modelos prontos por função: ponto de partida (o administrador ajusta). Tela que não aparece = "Não vê".
// permissoes: as chaves que continuam no formulário (ver todos, editar registros, aprovar...).
const O = 'opera'; const C = 'consulta';
const todas = (nivel, exceto = {}) => ({ ...Object.fromEntries(TELAS.map((t) => [t.id, nivel])), ...exceto });
const MODELOS = [
  { id: 'comercial', nome: 'Comercial', descricao: 'Cotações e coletas, cadastro de clientes e acompanhamento das entregas',
    telas: { cotacoes: O, coletas: O, clientes: O, cadastros_basicos: C, ocorrencias: C, monitoramento: C, sac: O }, acoes: [], permissoes: { pode_editar_registros: true } },
  { id: 'emissor_cte', nome: 'Emissor de CT-e', descricao: 'CT-e, MDF-e e NFS-e, com a carga, a coleta e o EDI',
    telas: { cte: O, mdfe: O, nfse: O, veiculos: O, coletas: O, cotacoes: C, romaneios: O, ocorrencias: O, conferencia: O, edi: O, monitoramento: C, clientes: C, cadastros_basicos: O }, acoes: ['cancelar_documento'], permissoes: {} },
  { id: 'expedicao', nome: 'Expedição e entregas', descricao: 'Romaneios, ocorrências, conferência, monitoramento e MDF-e da viagem',
    telas: { romaneios: O, ocorrencias: O, conferencia: O, monitoramento: O, coletas: O, filiais: O, paletes: O, mdfe: O, veiculos: C, cte: C, armazem: C, cadastros_basicos: C }, acoes: [], permissoes: {} },
  { id: 'conferente', nome: 'Conferente e armazém', descricao: 'Bipagem, etiquetas, armazém e transferências entre filiais',
    telas: { conferencia: O, armazem: O, filiais: O, paletes: O, romaneios: C, ocorrencias: C }, acoes: [], permissoes: {} },
  { id: 'faturista', nome: 'Faturista', descricao: 'Faturas, boletos e cobrança; vê os CT-e e as entregas',
    telas: { faturamento: O, cte: C, nfse: C, ocorrencias: C, sac: C, clientes: O, cadastros_basicos: C }, acoes: ['receber'], permissoes: { pode_editar_registros: true } },
  { id: 'contas_pagar', nome: 'Contas a pagar', descricao: 'Lança e paga as contas, acerto de viagem e fornecedores',
    telas: { pagar: O, acertos: O, centros: C, frota: C, fiscal: C, cadastros_basicos: O }, acoes: ['pagar', 'fechar_acerto'], permissoes: {} },
  { id: 'tesouraria', nome: 'Tesouraria', descricao: 'Caixa e bancos, recebimentos e pagamentos, conciliação',
    telas: { bancos: O, faturamento: O, pagar: O, acertos: C, comissoes: C, centros: C, cadastros_basicos: C }, acoes: ['receber', 'pagar', 'estornar'], permissoes: {} },
  { id: 'fiscal', nome: 'Fiscal / contador', descricao: 'Livros, notas de entrada, GNRE e pacote do contador; vê documentos e financeiro',
    telas: { fiscal: O, cte: C, mdfe: C, nfse: C, faturamento: C, pagar: C, bancos: C, centros: C, cadastros_basicos: C }, acoes: [], permissoes: {} },
  { id: 'frota', nome: 'Frota', descricao: 'Veículos, abastecimentos, manutenções, documentos, pneus e jornada',
    telas: { frota: O, veiculos: O, monitoramento: O, acertos: C, pagar: C, cadastros_basicos: O }, acoes: [], permissoes: {} },
  { id: 'sac', nome: 'SAC / atendimento', descricao: 'Chamados e ocorrências; consulta coletas, cotações e CT-e',
    telas: { sac: O, ocorrencias: O, monitoramento: C, cte: C, coletas: C, cotacoes: C, romaneios: C, clientes: C }, acoes: [], permissoes: {} },
  { id: 'gerente', nome: 'Gerente', descricao: 'Consulta tudo, painel e relatórios; aprova os valores acima da alçada',
    telas: todas(C, { painel: O, relatorios: O }), acoes: [], permissoes: { pode_ver_todos: true, pode_aprovar_pagamento: true, pode_aprovar_valores_altos: true } },
  { id: 'auditor', nome: 'Auditor de fretes (embarcador)', descricao: 'Auditoria de frete, conferência de faturas das transportadoras e relatórios',
    telas: { auditoria: O, relatorios: O, notas: C, ctes_recebidos: C, financeiro_emb: C, sinistros: C, cadastros_basicos: C }, acoes: [], permissoes: { pode_ver_todos: true, pode_conferir_fatura: true } },
  { id: 'consulta', nome: 'Só consulta', descricao: 'Vê todas as telas, sem alterar nada',
    telas: todas(C), acoes: [], permissoes: { pode_ver_todos: true } },
];

// Para a tela (menu, formulário).
function catalogo() {
  return {
    niveis: NIVEIS,
    telas: TELAS.map(({ id, area, nome, desc, menu, abas }) => ({ id, area, nome, desc, menu, abas: abas || [] })),
    acoes: Object.fromEntries(Object.entries(ACOES).map(([k, a]) => [k, a.nome])),
    modelos: MODELOS.map((m) => ({ ...m, telas: limparGrade(m.telas, m.acoes).telas })),
  };
}

// Relatório "quem pode o quê": cada usuário ativo (administradores e internos) com o nível de cada tela,
// as ações e as chaves que continuam no formulário.
const CHAVES_RELATORIO = { pode_ver_todos: 'Ver todos os registros', pode_enviar_xml: 'Enviar XML', pode_editar_registros: 'Editar / lançar registros',
  pode_excluir_registros: 'Excluir registros', pode_gerenciar_usuarios: 'Gerenciar usuários', pode_gerenciar_transportadoras: 'Gerenciar transportadoras',
  pode_gerenciar_tabelas_preco: 'Gerenciar tabelas de preço', pode_aprovar_pagamento: 'Aprovar pagamento', pode_aprovar_valores_altos: 'Aprovar valores altos',
  pode_conferir_fatura: 'Conferir fatura da transportadora' };
async function relatorio(pool) {
  const { rows } = await pool.query(`SELECT u.*, p.nome AS perfil_acesso_nome FROM usuarios u LEFT JOIN perfis_acesso p ON p.id = u.perfil_acesso_id
    WHERE u.ativo AND u.perfil IN ('admin', 'interno') ORDER BY (u.perfil = 'admin') DESC, u.nome`);
  const { rows: unidades } = await pool.query('SELECT id, COALESCE(sigla, nome) AS nome FROM unidades').catch(() => ({ rows: [] }));
  const usuarios = rows.map((u) => {
    const admin = u.perfil === 'admin';
    const grade = admin ? null : (u.acesso_telas || gradeDoLegado(u).telas);
    return {
      id: u.id, nome: u.nome, email: u.email, funcao: u.funcao, perfil: u.perfil, perfil_acesso: u.perfil_acesso_nome || null, ultimo_acesso: u.ultimo_acesso,
      telas: Object.fromEntries(TELAS.map((t) => [t.id, admin ? 'opera' : (grade[t.id] || 'nenhum')])),
      acoes: admin ? Object.keys(ACOES) : (u.acesso_acoes == null ? Object.keys(ACOES) : u.acesso_acoes),
      chaves: Object.fromEntries(Object.keys(CHAVES_RELATORIO).map((c) => [c, admin || !!u[c]])),
      filiais: (u.unidades_permitidas || []).length ? unidades.filter((x) => u.unidades_permitidas.includes(x.id)).map((x) => x.nome) : null,
    };
  });
  return { ...catalogo(), chaves: CHAVES_RELATORIO, usuarios };
}

// O destino da tela Hoje (ir + aba) pertence a uma tela bloqueada?
function destinoBloqueado(u, destino) {
  if (!usaGrade(u) || !destino?.ir) return false;
  const chave = destino.aba ? `t:${destino.ir}:${destino.aba}` : null;
  const t = TELAS.find((x) => x.menu.some((m) => m === chave || m === `t:${destino.ir}:` || m === `p:${destino.ir}`));
  return !!t && nivelDe(u, t.id) === 'nenhum';
}

module.exports = { MODELOS, relatorio, NIVEIS, TELAS, ACOES, CHAVES_DERIVADAS, PORID, telaDaRota, acaoDaRota, nivelDe, temAcao, conferir, gradeDoLegado, limparGrade, chavesDaGrade, migrar, catalogo, destinoBloqueado, usaGrade };
