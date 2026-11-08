const pool = require('./db');

// Todas as permissões individuais de usuário (colunas booleanas em "usuarios").
// Admin sempre tem tudo, independente delas.
const CAMPOS_PERMISSAO = [
  'pode_ver_todos', 'pode_enviar_xml', 'pode_editar_registros', 'pode_excluir_registros',
  'pode_gerenciar_usuarios', 'pode_gerenciar_transportadoras', 'pode_gerenciar_tabelas_preco',
  'pode_aprovar_pagamento', 'pode_aprovar_valores_altos', 'dois_fatores_ativo',
  'pode_ver_auditoria', 'pode_ver_financeiro', 'pode_ver_relatorios', 'pode_ver_sinistros',
  'pode_conferir_fatura', 'pode_emitir_cte',
];

// Módulos da transportadora que podem ser bloqueados por usuário (além das permissões acima, que dizem o papel).
// prefixos: rotas da API do módulo; paginas: telas do menu (para esconder). livres: rotas que outras telas usam.
const MODULOS = {
  operacao: { nome: 'Operação (CT-e, MDF-e, coletas, cotações, entregas, parceiros)', prefixos: ['/api/cte-emissao', '/api/mdfe', '/api/nfse', '/api/coletas', '/api/cotacoes', '/api/romaneios', '/api/ocorrencias', '/api/conferencias', '/api/etiquetas', '/api/monitoramento', '/api/transferencias', '/api/gr', '/api/paletes', '/api/parceiros'],
    paginas: ['emissao-cte', 'coletas', 'cotacoes', 'conferencia', 'ocorrencias', 'monitoramento', 'paletes', 'parceiros', 'filiais'] },
  frota: { nome: 'Frota', prefixos: ['/api/frota'], paginas: ['frota'] },
  armazem: { nome: 'Armazém', prefixos: ['/api/armazem'], paginas: ['armazem'] },
  faturamento: { nome: 'Faturamento e contas a receber', prefixos: ['/api/faturamento', '/api/regua', '/api/servicos-extras'], paginas: ['faturamento'] },
  pagar: { nome: 'Contas a pagar, acerto de viagem e comissões', prefixos: ['/api/contas-pagar', '/api/acertos', '/api/comissoes', '/api/pef'], paginas: ['pagar', 'comissoes'] },
  bancos: { nome: 'Caixa e bancos', prefixos: ['/api/bancos'], livres: ['/api/bancos/contas/opcoes'], paginas: ['bancos'] },
  fiscal: { nome: 'Fiscal e contabilidade', prefixos: ['/api/contabil', '/api/gnre'], paginas: ['contabil'] },
  sac: { nome: 'SAC (chamados)', prefixos: ['/api/sac'], paginas: ['sac'] },
  gerencial: { nome: 'Painel gerencial, margem e centros de custo', prefixos: ['/api/painel-transporte', '/api/centros-custo'], paginas: ['painel-transporte', 'centros'] },
};
function moduloDaRota(url) {
  const c = String(url || '').split('?')[0];
  return Object.keys(MODULOS).find((k) => {
    const m = MODULOS[k];
    if ((m.livres || []).some((l) => c === l || c.startsWith(`${l}/`))) return false;
    return m.prefixos.some((p) => c === p || c.startsWith(`${p}/`));
  }) || null;
}
const moduloBloqueado = (usuario, modulo) => !!modulo && usuario?.perfil !== 'admin' && (usuario?.modulos_bloqueados || []).includes(modulo);
const paginaBloqueada = (usuario, pagina) => Object.keys(MODULOS).some((k) => MODULOS[k].paginas.includes(pagina) && moduloBloqueado(usuario, k));
const limparModulos = (lista) => [...new Set((Array.isArray(lista) ? lista : []).filter((m) => MODULOS[m]))];

// Filiais do usuário: vazio = todas. unidadesDo(req) devolve null quando não há limite.
const unidadesDo = (req) => {
  if (req.usuario?.perfil === 'admin') return null;
  const u = (req.usuario?.unidades_permitidas || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return u.length ? u : null;
};
// Condição SQL "o documento é de uma das filiais do usuário" (ou não tem filial). colunas: as colunas de filial do documento.
function condicaoUnidades(req, colunas, params) {
  const u = unidadesDo(req);
  if (!u) return 'TRUE';
  params.push(u);
  const n = params.length;
  return `(${colunas.map((c) => `${c} = ANY($${n}::int[])`).join(' OR ')} OR (${colunas.map((c) => `${c} IS NULL`).join(' AND ')}))`;
}

const ehAdmin = (req) => req.usuario?.perfil === 'admin';

// Admin e quem tem "Ver tudo" enxergam os fretes de todos os clientes.
const vePotudo = (req) => ehAdmin(req) || !!req.usuario?.pode_ver_todos;

// Admin ou quem tiver QUALQUER uma das permissões passadas.
function temAlguma(req, ...nomes) {
  return ehAdmin(req) || nomes.some((n) => !!req.usuario?.[n]);
}
function permitirAlguma(...nomes) {
  return (req, res, next) => {
    if (temAlguma(req, ...nomes)) return next();
    return res.status(403).json({ erro: 'Você não tem permissão para fazer isso.' });
  };
}

// Roda uma consulta de relatório/resumo enxergando só os fretes que contam:
// sem os CT-e cancelados (eles ficam só como histórico) e, pra quem não vê
// tudo, só os do cliente do usuário. Funciona pondo na frente um WITH chamado
// "fretes", que na consulta toma o lugar da tabela de verdade — assim qualquer
// FROM/JOIN/subconsulta em "fretes" já sai filtrada, sem reescrever cada SQL.
// NOT MATERIALIZED (PostgreSQL 12+) faz o banco usar a tabela direto, sem
// montar uma cópia dela na memória.
let suportaNotMaterialized = null;
async function verificarVersaoBanco() {
  if (suportaNotMaterialized !== null) return;
  try {
    const { rows } = await pool.query('SHOW server_version_num');
    suportaNotMaterialized = Number(rows[0].server_version_num) >= 120000;
  } catch (e) { suportaNotMaterialized = false; }
}
function sqlComEscopoCliente(req, sql, params = []) {
  const restrito = !vePotudo(req);
  const n = params.length + 1;
  const filtro = restrito ? `NOT cte_cancelado AND cliente = $${n}` : 'NOT cte_cancelado';
  const cte = `fretes AS ${suportaNotMaterialized ? 'NOT MATERIALIZED ' : ''}(SELECT * FROM public.fretes WHERE ${filtro})`;
  const texto = sql.trimStart();
  const novoSql = /^WITH\s/i.test(texto) ? `WITH ${cte}, ${texto.slice(5)}` : `WITH ${cte} ${texto}`;
  return { sql: novoSql, params: restrito ? [...params, textoLimpo(req.usuario?.cliente_nome) ?? null] : params };
}
async function consultaCliente(req, sql, params = []) {
  await verificarVersaoBanco();
  const q = sqlComEscopoCliente(req, sql, params);
  return pool.query(q.sql, q.params);
}

// CT-e cancelado não pode fazer nada: nem aprovar, rejeitar, glosar, editar,
// excluir, registrar canhoto ou mandar espelho. Fica só como histórico.
function bloquearCteCancelado(nomeParametro = 'id') {
  return async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT numero_cte, cte_cancelado, cte_cancelado_motivo FROM fretes WHERE id = $1', [req.params[nomeParametro]]);
      if (rows[0]?.cte_cancelado) {
        return res.status(409).json({
          erro: `O CT-e ${rows[0].numero_cte || ''} foi CANCELADO${rows[0].cte_cancelado_motivo ? ` (${rows[0].cte_cancelado_motivo})` : ''} e fica só como histórico da nota: não pode ser alterado, aprovado, faturado nem excluído.`,
        });
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: 'Erro ao validar o registro.' });
    }
  };
}

// Confere se um frete (pelo cliente dele) pode ser visto por esse usuário.
// Mesma limpeza que o banco aplica aos textos (< > " ' viram ‹ › ” ’), pra
// comparar nomes de cliente gravados antes e depois dela.
const textoLimpo = (t) => (t == null ? t : String(t).replace(/</g, '‹').replace(/>/g, '›').replace(/"/g, '”').replace(/'/g, '’'));
function podeVerCliente(req, cliente) {
  return vePotudo(req) || (cliente != null && textoLimpo(cliente) === textoLimpo(req.usuario?.cliente_nome));
}

// Middleware pras rotas /:id de frete: quem não vê tudo só mexe nos fretes
// do próprio cliente (se o frete não existir, deixa a rota responder 404).
function freteDoCliente(nomeParametro = 'id') {
  return async (req, res, next) => {
    if (vePotudo(req)) return next();
    try {
      const { rows } = await pool.query('SELECT cliente FROM fretes WHERE id = $1', [req.params[nomeParametro]]);
      if (rows[0] && !podeVerCliente(req, rows[0].cliente)) {
        return res.status(403).json({ erro: 'Você não tem acesso a esse registro.' });
      }
      if (req.body && req.body.cliente !== undefined && textoLimpo(req.body.cliente) !== textoLimpo(req.usuario.cliente_nome)) {
        return res.status(403).json({ erro: 'Você só pode lançar fretes do seu próprio cliente.' });
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: 'Erro ao validar o acesso ao registro.' });
    }
  };
}

module.exports = { MODULOS, moduloDaRota, moduloBloqueado, paginaBloqueada, limparModulos, unidadesDo, condicaoUnidades, textoLimpo, bloquearCteCancelado, freteDoCliente, CAMPOS_PERMISSAO, ehAdmin, vePotudo, temAlguma, permitirAlguma, consultaCliente, sqlComEscopoCliente, podeVerCliente };
