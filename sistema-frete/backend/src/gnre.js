// GNRE: o ICMS do frete devido a outra UF. Quando a prestação começa num estado em
// que a transportadora não tem inscrição estadual, o CT-e sai com ICMSOutraUF (CST 90)
// e o imposto é recolhido por GNRE para a UF de início, antes de a carga sair (a guia
// acompanha o transporte). A guia é gerada no Portal GNRE; aqui ficam os CT-e que
// precisam dela, os dados para preencher a guia, a guia registrada (linha digitável
// conferida pelo dígito verificador e o PDF) e a conta a pagar, que entra na
// contabilidade baixando o "ICMS devido a outra UF".
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const PASTA = path.join(__dirname, '..', 'dados', 'gnre');
const RECEITA_TRANSPORTE = '100030';   // Tabela de receitas da GNRE: ICMS Transporte
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Código de barras de arrecadação (FEBRABAN) ----------
// 44 dígitos; o 3º diz o valor (6/8 = valor em reais) e o módulo do DV (6/7 = módulo 10, 8/9 = módulo 11).
function mod10(s) {
  let soma = 0; let peso = 2;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    let p = Number(s[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p; peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}
function mod11(s) {
  let soma = 0; let peso = 2;
  for (let i = s.length - 1; i >= 0; i -= 1) { soma += Number(s[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return r === 0 || r === 1 ? 0 : r === 10 ? 1 : 11 - r;
}
// Aceita a linha digitável (48) ou o código de barras (44). Devolve { codigo, linha, valor } ou o erro.
function lerCodigo(entrada) {
  const d = String(entrada || '').replace(/\D/g, '');
  if (d.length !== 48 && d.length !== 44) return { erro: 'A linha digitável da GNRE tem 48 números (ou 44 no código de barras).' };
  if (d[0] !== '8') return { erro: 'Isso não é guia de arrecadação: a linha da GNRE começa com 8.' };
  const id = d[2];
  if (!['6', '7', '8', '9'].includes(id)) return { erro: 'O 3º número da linha não é de guia de arrecadação (6, 7, 8 ou 9).' };
  const modulo = ['6', '7'].includes(id) ? mod10 : mod11;
  let codigo;
  if (d.length === 48) {
    const blocos = [0, 1, 2, 3].map((i) => d.slice(i * 12, i * 12 + 12));
    const ruim = blocos.findIndex((b) => modulo(b.slice(0, 11)) !== Number(b[11]));
    if (ruim >= 0) return { erro: `O ${ruim + 1}º bloco da linha digitável não confere (número digitado errado?).` };
    codigo = blocos.map((b) => b.slice(0, 11)).join('');
  } else codigo = d;
  if (modulo(codigo.slice(0, 3) + codigo.slice(4)) !== Number(codigo[3])) return { erro: 'O dígito verificador geral não confere (número digitado errado?).' };
  const linha = [0, 1, 2, 3].map((i) => { const b = codigo.slice(i * 11, i * 11 + 11); return b + modulo(b); }).join('');
  return { codigo, linha, valor: ['6', '8'].includes(id) ? Number(codigo.slice(4, 15)) / 100 : null };
}
const linhaFormatada = (l) => (l ? l.match(/.{12}/g).map((b) => `${b.slice(0, 11)}-${b[11]}`).join(' ') : '');

// ---------- Configuração ----------
const CONFIG_PADRAO = { ufs_ie: [], vencimento_dias: 0 };
async function config() {
  const { rows } = await pool.query('SELECT gnre_config FROM empresa WHERE id = 1');
  return { ...CONFIG_PADRAO, ...(rows[0]?.gnre_config || {}) };
}
async function salvarConfig(b = {}) {
  const ufs = [...new Set((Array.isArray(b.ufs_ie) ? b.ufs_ie : String(b.ufs_ie || '').split(/[\s,;]+/)).map((u) => String(u).toUpperCase().trim()).filter(Boolean))];
  const ruim = ufs.find((u) => !UFS.includes(u));
  if (ruim) throw falha(`UF inválida: ${ruim}`);
  const dias = Number(b.vencimento_dias);
  const c = { ufs_ie: ufs, vencimento_dias: Number.isInteger(dias) && dias >= 0 && dias <= 30 ? dias : 0 };
  await pool.query('UPDATE empresa SET gnre_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return c;
}
async function demonstracao() {
  const { rows } = await pool.query('SELECT cte_demonstracao FROM empresa WHERE id = 1');
  return !!rows[0]?.cte_demonstracao;
}

// ---------- CT-e que precisam de GNRE ----------
const CTE_OUTRA_UF = `c.status = 'autorizado' AND c.dados->'icms'->>'cst' = 'OUTRAUF' AND COALESCE((c.dados->'icms'->>'vICMS')::numeric, 0) > 0 AND c.demonstracao = $1`;
const COM_GUIA = `EXISTS (SELECT 1 FROM gnre_guia_ctes gc JOIN gnre_guias g ON g.id = gc.guia_id WHERE gc.cte_id = c.id AND g.status = 'gerada')`;
const ufInicio = (d = {}) => String(d.inicio?.UF || '').toUpperCase();
async function pendentes() {
  const cfg = await config();
  const { rows } = await pool.query(
    `SELECT c.id, c.serie, c.numero, c.chave, c.autorizado_em, c.dados, c.cidade_fim, c.uf_fim, c.destinatario_nome, (c.dados->'icms'->>'vICMS')::float AS icms,
            (SELECT r.id FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id WHERE ri.cte_id = c.id AND r.status <> 'fechado' ORDER BY r.id DESC LIMIT 1) AS romaneio_id,
            c.situacao_entrega
       FROM ctes_emitidos c WHERE ${CTE_OUTRA_UF} AND NOT ${COM_GUIA} ORDER BY c.autorizado_em, c.numero LIMIT 2000`, [await demonstracao()]);
  const lista = rows.map((c) => {
    const d = c.dados || {};
    const tom = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {};
    return { id: c.id, serie: c.serie, numero: c.numero, chave: c.chave, emissao: c.autorizado_em, uf: ufInicio(d), origem: d.inicio ? `${d.inicio.xMun}/${d.inicio.UF}` : '',
      destino: `${c.cidade_fim || ''}/${c.uf_fim || ''}`, tomador: tom.xNome || '', icms: centavos(c.icms), aliquota: Number(d.icms?.pICMS) || null, base: Number(d.icms?.vBC) || null,
      romaneio_id: c.romaneio_id, situacao: c.situacao_entrega, ja_saiu: !['pendente', 'em_transito'].includes(c.situacao_entrega) };
  });
  const apuracao = lista.filter((c) => cfg.ufs_ie.includes(c.uf));
  const aGuia = lista.filter((c) => !cfg.ufs_ie.includes(c.uf));
  const porUf = {};
  aGuia.forEach((c) => { (porUf[c.uf] = porUf[c.uf] || { uf: c.uf, ctes: [], total: 0 }).ctes.push(c); porUf[c.uf].total = centavos(porUf[c.uf].total + c.icms); });
  return { por_uf: Object.values(porUf).sort((a, b) => b.total - a.total), apuracao_na_uf: apuracao, config: cfg };
}

// Dados para preencher a guia no Portal GNRE (um CT-e, ou vários da mesma UF numa guia só).
async function ficha(cteIds) {
  const ids = [...new Set((cteIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw falha('Escolha os CT-e da guia.');
  const { rows } = await pool.query(`SELECT c.id, c.serie, c.numero, c.chave, c.autorizado_em, c.dados, ${COM_GUIA} AS tem_guia FROM ctes_emitidos c
    WHERE c.id = ANY($2::int[]) AND ${CTE_OUTRA_UF}`, [await demonstracao(), ids]);
  if (rows.length !== ids.length) throw falha('Algum CT-e não é de ICMS devido a outra UF (ou não está autorizado).');
  const comGuia = rows.find((r) => r.tem_guia);
  if (comGuia) throw falha(`O CT-e ${comGuia.numero} já tem guia registrada.`);
  const ufs = [...new Set(rows.map((r) => ufInicio(r.dados)))];
  if (ufs.length > 1) throw falha(`Uma guia é de uma UF só: os CT-e marcados são de ${ufs.join(', ')}.`);
  const { rows: [e] } = await pool.query('SELECT razao_social, cnpj, ie, endereco, numero, bairro, municipio, uf, cep, telefone FROM empresa WHERE id = 1');
  const cfg = await config();
  const emissao = rows.map((r) => new Date(new Date(r.autorizado_em).getTime() - 3 * 3600000).toISOString().slice(0, 10)).sort()[0];
  const venc = new Date(`${hojeBr() > emissao ? hojeBr() : emissao}T12:00:00Z`); venc.setUTCDate(venc.getUTCDate() + cfg.vencimento_dias);
  return {
    uf_favorecida: ufs[0], receita: RECEITA_TRANSPORTE, receita_nome: 'ICMS Transporte',
    emitente: { cnpj: e.cnpj, razao_social: e.razao_social, ie: e.ie, endereco: [e.endereco, e.numero, e.bairro].filter(Boolean).join(', '), municipio: e.municipio, uf: e.uf, cep: e.cep, telefone: e.telefone },
    referencia: emissao.slice(0, 7), vencimento: venc.toISOString().slice(0, 10),
    ctes: rows.sort((a, b) => a.numero - b.numero).map((r) => ({ id: r.id, serie: r.serie, numero: r.numero, chave: r.chave, emissao: r.autorizado_em,
      icms: centavos(r.dados.icms.vICMS), base: Number(r.dados.icms.vBC) || null, aliquota: Number(r.dados.icms.pICMS) || null, origem: r.dados.inicio ? `${r.dados.inicio.xMun}/${r.dados.inicio.UF}` : '' })),
    valor: centavos(rows.reduce((s, r) => s + Number(r.dados.icms.vICMS), 0)),
  };
}

// ---------- Guia registrada ----------
// b: { cte_ids, linha (linha digitável ou código de barras), numero_controle, vencimento, observacao }, arquivo: Buffer (PDF/foto da guia)
async function registrar(b, arquivo, usuario) {
  const f = await ficha(b.cte_ids);
  const cod = lerCodigo(b.linha);
  if (cod.erro) throw falha(cod.erro);
  if (cod.valor != null && Math.abs(cod.valor - f.valor) > 0.009 && !b.valor_diferente) {
    throw falha(`A guia é de R$ ${cod.valor.toFixed(2).replace('.', ',')}, e o ICMS dos CT-e é R$ ${f.valor.toFixed(2).replace('.', ',')}. Confira (multa/juros? outro CT-e?) e confirme o valor diferente.`);
  }
  const valor = centavos(cod.valor ?? f.valor);
  const venc = dataIso(b.vencimento) || f.vencimento;
  let nomeArq = null;
  if (arquivo?.length) {
    const tipo = require('./utils/arquivoSeguro').detectarTipo(arquivo);
    if (!tipo) throw falha('A guia tem que ser PDF ou foto (JPG, PNG).');
    fs.mkdirSync(PASTA, { recursive: true });
    nomeArq = `gnre-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${tipo.ext}`;
    fs.writeFileSync(path.join(PASTA, nomeArq), arquivo);
  }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    // Trava os CT-e: dois cliques não registram duas guias.
    await cliente.query('SELECT id FROM ctes_emitidos WHERE id = ANY($1::int[]) FOR UPDATE', [f.ctes.map((c) => c.id)]);
    const { rows: ja } = await cliente.query(`SELECT gc.cte_id FROM gnre_guia_ctes gc JOIN gnre_guias g ON g.id = gc.guia_id WHERE gc.cte_id = ANY($1::int[]) AND g.status = 'gerada'`, [f.ctes.map((c) => c.id)]);
    if (ja.length) throw falha('Algum destes CT-e já tem guia registrada.', 409);
    const nums = f.ctes.map((c) => `${c.serie}/${c.numero}`).join(', ');
    const [conta] = await require('./contasPagar').criar({
      descricao: `GNRE ${f.uf_favorecida} — ICMS do frete (CT-e ${nums})`.slice(0, 200), categoria: 'gnre', fornecedor_nome: `SEFAZ-${f.uf_favorecida}`,
      documento: `GNRE ${texto(b.numero_controle, 30) || cod.codigo.slice(-10)}`.slice(0, 60), vencimento: venc, valor,
      competencia: `${f.referencia}-01`, observacao: `Linha digitável: ${linhaFormatada(cod.linha)}`,
    }, usuario?.nome, { cliente });
    const { rows: [g] } = await cliente.query(
      `INSERT INTO gnre_guias (uf_favorecida, receita, valor, vencimento, referencia, numero_controle, codigo_barras, linha_digitavel, arquivo, conta_pagar_id, observacao, usuario_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [f.uf_favorecida, f.receita, valor, venc, f.referencia, texto(b.numero_controle, 30), cod.codigo, cod.linha, nomeArq, conta.id, texto(b.observacao, 500), usuario?.nome]);
    for (const c of f.ctes) await cliente.query('INSERT INTO gnre_guia_ctes (guia_id, cte_id, valor) VALUES ($1, $2, $3)', [g.id, c.id, c.icms]);
    await cliente.query('COMMIT');
    return { ...g, conta_pagar_id: conta.id, ctes: f.ctes.length };
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (nomeArq) fs.rm(path.join(PASTA, nomeArq), { force: true }, () => {});
    throw e;
  } finally { cliente.release(); }
}

const SITUACAO = `CASE WHEN g.status = 'cancelada' THEN 'cancelada' WHEN cp.status = 'paga' THEN 'paga' WHEN g.vencimento < CURRENT_DATE THEN 'vencida' ELSE 'a_pagar' END`;
async function guias({ filtro = 'abertas', de, ate } = {}) {
  const cond = { abertas: `g.status = 'gerada' AND COALESCE(cp.status, '') <> 'paga'`, pagas: `g.status = 'gerada' AND cp.status = 'paga'`, canceladas: `g.status = 'cancelada'`, todas: 'TRUE' }[filtro] || 'TRUE';
  const val = []; const per = [];
  if (dataIso(de)) { val.push(de); per.push(`g.vencimento >= $${val.length}::date`); }
  if (dataIso(ate)) { val.push(ate); per.push(`g.vencimento <= $${val.length}::date`); }
  const { rows } = await pool.query(
    `SELECT g.*, g.vencimento::text AS vencimento, g.valor::float, ${SITUACAO} AS situacao, cp.status AS conta_status, cp.pago_em::text AS pago_em,
            (SELECT json_agg(json_build_object('id', c.id, 'serie', c.serie, 'numero', c.numero, 'status', c.status, 'valor', gc.valor) ORDER BY c.numero)
               FROM gnre_guia_ctes gc JOIN ctes_emitidos c ON c.id = gc.cte_id WHERE gc.guia_id = g.id) AS ctes
       FROM gnre_guias g LEFT JOIN contas_pagar cp ON cp.id = g.conta_pagar_id WHERE ${cond}${per.length ? ` AND ${per.join(' AND ')}` : ''}
      ORDER BY (g.status = 'gerada') DESC, g.vencimento, g.id DESC LIMIT 500`, val);
  // Guia paga de CT-e que depois foi cancelado: o imposto pode ser pedido de volta (restituição) na UF.
  return rows.map((g) => ({ ...g, cte_cancelado: (g.ctes || []).some((c) => c.status === 'cancelado') }));
}
async function cancelar(id, motivo) {
  const m = texto(motivo, 250);
  if (!m) throw falha('Informe o motivo.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [g] } = await cliente.query(`SELECT g.*, cp.valor_pago, cp.status AS conta_status FROM gnre_guias g LEFT JOIN contas_pagar cp ON cp.id = g.conta_pagar_id WHERE g.id = $1 FOR UPDATE OF g`, [id]);
    if (!g || g.status !== 'gerada') throw falha('Guia não encontrada.', 404);
    if (Number(g.valor_pago) > 0) throw falha('A guia já foi paga (toda ou em parte): para devolver o imposto, peça a restituição à SEFAZ da UF. Estorne o pagamento em Contas a pagar se foi lançado por engano.', 409);
    if (g.conta_pagar_id) await cliente.query(`UPDATE contas_pagar SET status = 'cancelada', observacao = TRIM(COALESCE(observacao, '') || E'\\nCancelada com a GNRE: ' || $2) WHERE id = $1 AND status = 'aberta' AND valor_pago = 0`, [g.conta_pagar_id, m]);
    await cliente.query(`UPDATE gnre_guias SET status = 'cancelada', motivo_cancelamento = $2 WHERE id = $1`, [id, m]);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}
async function anexar(id, campo, arquivo) {
  if (!['arquivo', 'comprovante'].includes(campo)) throw falha('Anexo inválido.');
  const tipo = require('./utils/arquivoSeguro').detectarTipo(arquivo);
  if (!tipo) throw falha('Envie PDF ou foto (JPG, PNG).');
  fs.mkdirSync(PASTA, { recursive: true });
  const nome = `gnre-${id}-${campo}-${Date.now()}${tipo.ext}`;
  fs.writeFileSync(path.join(PASTA, nome), arquivo);
  const { rowCount } = await pool.query(`UPDATE gnre_guias SET ${campo} = $2 WHERE id = $1`, [id, nome]);
  if (!rowCount) { fs.rm(path.join(PASTA, nome), { force: true }, () => {}); throw falha('Guia não encontrada.', 404); }
}
async function caminhoArquivo(id, campo) {
  const { rows: [g] } = await pool.query('SELECT arquivo, comprovante FROM gnre_guias WHERE id = $1', [id]);
  const nome = g?.[campo === 'comprovante' ? 'comprovante' : 'arquivo'];
  if (!nome || nome.includes('/') || nome.includes('\\')) throw falha('Sem arquivo.', 404);
  return path.join(PASTA, nome);
}

// CT-e de um romaneio que vão sair sem a GNRE paga (a guia acompanha a carga).
async function semGuiaPaga(cteIds) {
  if (!cteIds?.length) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.serie, c.numero, c.dados->'inicio'->>'UF' AS uf, (c.dados->'icms'->>'vICMS')::float AS icms,
            (SELECT CASE WHEN cp.status = 'paga' THEN 'paga' ELSE 'a_pagar' END FROM gnre_guia_ctes gc JOIN gnre_guias g ON g.id = gc.guia_id LEFT JOIN contas_pagar cp ON cp.id = g.conta_pagar_id
              WHERE gc.cte_id = c.id AND g.status = 'gerada' LIMIT 1) AS guia
       FROM ctes_emitidos c WHERE c.id = ANY($1::int[]) AND c.status = 'autorizado' AND c.dados->'icms'->>'cst' = 'OUTRAUF' AND COALESCE((c.dados->'icms'->>'vICMS')::numeric, 0) > 0`, [cteIds]);
  const cfg = await config();
  return rows.filter((r) => !cfg.ufs_ie.includes(String(r.uf || '').toUpperCase()) && r.guia !== 'paga');
}
async function pendencias() {
  const p = await pendentes();
  const { rows: [v] } = await pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(g.valor), 0)::float AS valor FROM gnre_guias g LEFT JOIN contas_pagar cp ON cp.id = g.conta_pagar_id
    WHERE g.status = 'gerada' AND COALESCE(cp.status, '') <> 'paga' AND g.vencimento <= CURRENT_DATE`);
  const ctes = p.por_uf.reduce((s, u) => s + u.ctes.length, 0);
  return { sem_guia: ctes, sem_guia_valor: centavos(p.por_uf.reduce((s, u) => s + u.total, 0)), vencendo: v.n, vencendo_valor: centavos(v.valor) };
}

// Ficha impressa com os dados para digitar no Portal GNRE.
function fichaHtml(f) {
  const linha = (rot, v) => `<tr><th>${esc(rot)}</th><td>${esc(v ?? '')}</td></tr>`;
  const doc = (d) => String(d || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dados para a GNRE ${esc(f.uf_favorecida)}</title><style>
    body{font-family:Arial,sans-serif;font-size:13px;max-width:780px;margin:20px auto;padding:0 14px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin:10px 0}
    th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eee;width:34%}.n{text-align:right}@media print{button{display:none}}</style></head><body>
    <button onclick="print()" style="float:right">Imprimir</button><h1>Dados para gerar a GNRE — ICMS do frete devido a ${esc(f.uf_favorecida)}</h1>
    <p>Gere a guia em <b>www.gnre.pe.gov.br</b> (Gerar GNRE) com os dados abaixo, pague antes da saída da carga e registre a guia no Nexofrete (Fiscal » GNRE).</p>
    <table>${linha('UF favorecida', f.uf_favorecida)}${linha('Receita', `${f.receita} — ${f.receita_nome}`)}
      ${linha('Emitente (contribuinte)', `${f.emitente.razao_social} — CNPJ ${doc(f.emitente.cnpj)}${f.emitente.ie ? ` — IE ${f.emitente.ie}` : ''}`)}
      ${linha('Endereço', `${f.emitente.endereco} — ${f.emitente.municipio}/${f.emitente.uf}${f.emitente.cep ? ` — CEP ${f.emitente.cep}` : ''}${f.emitente.telefone ? ` — tel. ${f.emitente.telefone}` : ''}`)}
      ${linha('Documento de origem', f.ctes.length === 1 ? `CT-e ${f.ctes[0].numero} — chave ${f.ctes[0].chave}` : `${f.ctes.length} CT-e (abaixo)`)}
      ${linha('Período de referência', f.referencia.split('-').reverse().join('/'))}${linha('Vencimento / pagamento', f.vencimento.split('-').reverse().join('/'))}
      ${linha('Valor principal (ICMS)', `R$ ${f.valor.toFixed(2).replace('.', ',')}`)}</table>
    <table><tr><th style="width:auto">CT-e</th><th style="width:auto">Chave</th><th style="width:auto">Início</th><th class="n" style="width:auto">Base</th><th class="n" style="width:auto">Alíq.</th><th class="n" style="width:auto">ICMS</th></tr>
    ${f.ctes.map((c) => `<tr><td>${esc(c.serie)}/${esc(c.numero)}</td><td style="font-size:11px">${esc(c.chave)}</td><td>${esc(c.origem)}</td><td class="n">${c.base != null ? c.base.toFixed(2).replace('.', ',') : ''}</td><td class="n">${c.aliquota ?? ''}%</td><td class="n">${c.icms.toFixed(2).replace('.', ',')}</td></tr>`).join('')}</table>
    <p style="color:#555">Alguns estados pedem campos extras (tipo do documento de origem, detalhamento da receita, produto): o Portal GNRE mostra o que cada UF exige ao escolher a UF e a receita.</p></body></html>`;
}

module.exports = { RECEITA_TRANSPORTE, UFS, lerCodigo, mod10, mod11, linhaFormatada, config, salvarConfig, pendentes, ficha, fichaHtml, registrar, guias, cancelar, anexar, caminhoArquivo, semGuiaPaga, pendencias };
