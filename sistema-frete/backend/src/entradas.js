// Notas de entrada (compras da transportadora): NF-e de diesel, peças, pneus
// e CT-e de subcontratação/redespacho em que a empresa é a tomadora.
//  • Importa o XML (confere se a nota é para a empresa e se já não foi lançada),
//    sugere a categoria pelo NCM e o crédito de ICMS conforme a configuração
//    (pelas notas, crédito presumido ou nenhum — Simples Nacional).
//  • Gera as contas a pagar pelas duplicatas da nota (ou um vencimento informado).
//  • Livro de entradas (por CFOP) e apuração do ICMS: débitos das saídas −
//    créditos das entradas (ou o presumido), com o saldo credor levado adiante.
const { XMLParser } = require('fast-xml-parser');
const pool = require('./db');
const Doc = require('./utils/documento');
const contasPagar = require('./contasPagar');
const { celula } = require('./utils/csv');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false, trimValues: true });
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const num = (v) => (v == null || v === '' ? 0 : Number(String(v).replace(',', '.')) || 0);
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const diaBr = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;

// Modos de crédito do ICMS nas entradas.
//  notas: crédito do ICMS destacado nas notas (combustível, lubrificante, CT-e tomado...).
//  presumido: crédito presumido de 20% do ICMS das saídas (Convênio ICMS 106/96), no lugar dos créditos das notas.
//  nenhum: Simples Nacional (ou empresa sem crédito).
const MODOS_CREDITO = { notas: 'Pelas notas de entrada', presumido: 'Crédito presumido (20% do ICMS das saídas)', nenhum: 'Sem crédito (Simples Nacional)' };
const PRESUMIDO = 0.2;

// Categoria (das contas a pagar) pelo NCM do item de maior valor.
function categoriaDoNcm(ncm) {
  const n = String(ncm || '');
  if (/^(27101921|27101922|27101259|22071|22072|31021010|271121)/.test(n)) return 'combustivel';
  if (/^(4011|4012|4013)/.test(n)) return 'pneus';
  if (/^(2710193|3403|3819|3820|8708|8409|8413|8421|8483|8481|8482|8511|8512|4016|7007|8507|8544|7320|8716)/.test(n)) return 'manutencao';
  return null;
}
// Item que dá crédito de ICMS na prestação de transporte: combustível e lubrificante consumidos nos veículos.
const creditavel = (ncm) => /^(2710|2207|31021010|2711|3403)/.test(String(ncm || ''));

// ICMS de um grupo de imposto (qualquer CST/CSOSN): base, alíquota, valor (inclui o monofásico do diesel).
function icmsDoGrupo(g) {
  const x = Object.values(g || {})[0] || {};
  return {
    cst: String(x.CST ?? x.CSOSN ?? ''), base: num(x.vBC), aliquota: num(x.pICMS),
    icms: num(x.vICMS) || num(x.vICMSMono) || num(x.vICMSMonoRet), st: num(x.vICMSST),
  };
}

// Lê o XML de uma NF-e (modelo 55) ou de um CT-e (57) recebido.
function lerXml(xml) {
  let doc;
  try { doc = parser.parse(String(xml || '')); } catch { throw falha('Arquivo não é um XML válido.'); }
  const nfe = (doc.nfeProc?.NFe || doc.NFe)?.infNFe;
  if (nfe) {
    const t = nfe.total?.ICMSTot || {};
    const itens = lista(nfe.det).map((d) => {
      const p = d.prod || {}; const i = icmsDoGrupo(d.imposto?.ICMS);
      return {
        codigo: p.cProd || '', descricao: p.xProd || '', ncm: p.NCM || '', cfop: String(p.CFOP || ''), unidade: p.uCom || '', quantidade: num(p.qCom), valor_unitario: num(p.vUnCom),
        valor: num(p.vProd), frete: num(p.vFrete), seguro: num(p.vSeg), desconto: num(p.vDesc), outras: num(p.vOutro), ipi: num(d.imposto?.IPI?.IPITrib?.vIPI),
        cst: i.cst, base: i.base, aliquota: i.aliquota, icms: i.icms, st: i.st,
      };
    });
    const maior = itens.slice().sort((a, b) => b.valor - a.valor)[0] || {};
    return {
      modelo: '55', chave: String(nfe['@Id'] || '').replace(/^NFe/, ''), serie: String(nfe.ide?.serie ?? ''), numero: String(nfe.ide?.nNF ?? ''),
      emissao: String(nfe.ide?.dhEmi || nfe.ide?.dEmi || '').slice(0, 10), natureza: nfe.ide?.natOp || '', saida: String(nfe.ide?.tpNF) === '1',
      emitente: { doc: Doc.limpar(nfe.emit?.CNPJ || nfe.emit?.CPF), nome: nfe.emit?.xNome || '', uf: nfe.emit?.enderEmit?.UF || '', ie: nfe.emit?.IE || '' },
      destinatario_doc: Doc.limpar(nfe.dest?.CNPJ || nfe.dest?.CPF),
      valor_total: num(t.vNF), valor_produtos: num(t.vProd), base_icms: num(t.vBC), icms: centavos(Math.max(num(t.vICMS) + num(t.vICMSMono) + num(t.vICMSMonoRet), itens.reduce((s, x) => s + x.icms, 0))),   // inclui o monofásico do diesel icms_st: num(t.vST), ipi: num(t.vIPI),
      itens, categoria: categoriaDoNcm(maior.ncm) || 'outros',
      duplicatas: lista(nfe.cobr?.dup).map((d) => ({ numero: d.nDup || '', vencimento: iso(d.dVenc), valor: num(d.vDup) })).filter((d) => d.vencimento && d.valor > 0),
    };
  }
  const cte = (doc.cteProc?.CTe || doc.CTe)?.infCte;
  if (cte) {
    const ide = cte.ide || {};
    const papel = { 0: cte.rem, 1: cte.exped, 2: cte.receb, 3: cte.dest }[String(ide.toma3?.toma ?? ide.toma03?.toma ?? '')] || ide.toma4 || ide.toma04;
    const i = icmsDoGrupo(cte.imp?.ICMS);
    const valor = num(cte.vPrest?.vTPrest);
    return {
      modelo: '57', chave: String(cte['@Id'] || '').replace(/^CTe/, ''), serie: String(ide.serie ?? ''), numero: String(ide.nCT ?? ''),
      emissao: String(ide.dhEmi || '').slice(0, 10), natureza: ide.natOp || '', saida: false,
      emitente: { doc: Doc.limpar(cte.emit?.CNPJ || cte.emit?.CPF), nome: cte.emit?.xNome || '', uf: cte.emit?.enderEmit?.UF || '', ie: cte.emit?.IE || '' },
      destinatario_doc: Doc.limpar(papel?.CNPJ || papel?.CPF),
      valor_total: valor, valor_produtos: valor, base_icms: i.base, icms: i.icms, icms_st: 0, ipi: 0,
      itens: [{ codigo: 'CT-e', descricao: `Frete contratado: ${ide.xMunIni || ''}/${ide.UFIni || ''} → ${ide.xMunFim || ''}/${ide.UFFim || ''}`, ncm: '', cfop: String(ide.CFOP || ''), unidade: 'UN', quantidade: 1,
        valor_unitario: valor, valor, frete: 0, seguro: 0, desconto: 0, outras: 0, ipi: 0, cst: i.cst, base: i.base, aliquota: i.aliquota, icms: i.icms, st: 0 }],
      categoria: 'frete_terceiro', duplicatas: [],
    };
  }
  throw falha('O arquivo não é uma NF-e nem um CT-e.');
}

// CFOP de entrada sugerido (o contador confere), 1xxx na mesma UF e 2xxx de outra UF:
// CT-e tomado → x351 (serviço de transporte para prestar serviço da mesma natureza); combustível e
// lubrificante → x653 (consumidor final); compra (5/6 1xx, 4xx) → x556 (uso e consumo); o resto troca o 1º dígito.
function cfopEntrada(cfop, mesmaUf, { cte = false, combustivel = false } = {}) {
  const c = String(cfop || '');
  const p = mesmaUf ? '1' : '2';
  if (cte) return `${p}351`;
  if (!/^\d{4}$/.test(c) || /^[123]/.test(c)) return c;
  if (combustivel) return `${p}653`;
  if (/^[56][14]\d\d$/.test(c)) return `${p}556`;
  return `${p}${c.slice(1)}`;
}

async function empresa(cliente = pool) {
  const { rows: [e] } = await cliente.query('SELECT cnpj, uf, crt, contabil_config FROM empresa WHERE id = 1');
  return e || {};
}
async function modoCredito(e) {
  const m = e?.contabil_config?.icms_credito;
  if (MODOS_CREDITO[m]) return m;
  return Number(e?.crt) === 1 ? 'nenhum' : 'notas';
}

// Prévia do XML: o que vai ser lançado, com as sugestões (categoria, crédito, CFOP de entrada) e os avisos.
async function previa(xml) {
  const n = lerXml(xml);
  const e = await empresa();
  const nossa = Doc.limpar(e.cnpj);
  const avisos = [];
  if (n.modelo === '55' && n.saida === false) avisos.push('NF-e de entrada emitida pelo próprio fornecedor (devolução ou entrada dele): confira antes de lançar.');
  if (nossa && n.emitente.doc === nossa) throw falha('Esta nota foi emitida pela sua própria empresa: não é nota de entrada.');
  if (nossa && n.destinatario_doc && n.destinatario_doc !== nossa) {
    throw falha(n.modelo === '57' ? `Este CT-e não tem a sua empresa como tomadora (tomador: ${Doc.formatar(n.destinatario_doc)}).` : `Esta NF-e não é para a sua empresa (destinatário: ${Doc.formatar(n.destinatario_doc)}).`);
  }
  const { rows: ja } = await pool.query(`SELECT id, entrada::text, status FROM notas_entrada WHERE chave = $1`, [n.chave]);
  if (ja[0] && ja[0].status === 'lancada') throw falha(`Esta nota já foi lançada (entrada em ${diaBr(ja[0].entrada)}).`, 409);
  const modo = await modoCredito(e);
  const mesmaUf = !!e.uf && n.emitente.uf === e.uf;
  n.itens = n.itens.map((i) => ({ ...i, cfop_entrada: cfopEntrada(i.cfop, mesmaUf, { cte: n.modelo === '57', combustivel: creditavel(i.ncm) }), creditavel: n.modelo === '57' || creditavel(i.ncm) }));
  const sugerido = modo === 'notas' ? centavos(n.itens.filter((i) => i.creditavel).reduce((s, i) => s + i.icms, 0)) : 0;
  if (modo === 'notas' && n.icms > 0 && sugerido < centavos(n.icms)) avisos.push('Parte do ICMS da nota é de itens que normalmente não dão crédito na transportadora (uso e consumo): o crédito sugerido é só o dos combustíveis/lubrificantes. Ajuste se o contador orientar diferente.');
  if (n.itens.some((i) => i.cst === '61')) avisos.push('Diesel com ICMS monofásico (CST 61): o valor sugerido é o ICMS retido na nota. Confirme com o contador se a empresa aproveita esse crédito.');
  return { ...n, ja_cancelada: !!ja[0], modo_credito: modo, credito_sugerido: sugerido, avisos, cfop_entrada: [...new Set(n.itens.map((i) => i.cfop_entrada))].join(', ') };
}

// Lança a nota. b: { xml } ou os campos à mão { emitente_doc, emitente_nome, numero, serie, emissao, valor_total, base_icms, icms, cfop };
// mais: entrada, categoria, credito_icms, observacao, gerar_contas, vencimento (sem duplicatas), parcelas.
async function lancar(b, usuarioNome) {
  const e = await empresa();
  let n;
  if (b.xml) n = await previa(b.xml);
  else {
    const doc = Doc.limpar(b.emitente_doc);
    if (doc && !Doc.valido(doc)) throw falha('CNPJ/CPF do fornecedor inválido.');
    const v = contasPagar.valor(b.valor_total);
    if (!String(b.emitente_nome || '').trim()) throw falha('Informe o fornecedor.');
    if (!String(b.numero || '').trim()) throw falha('Informe o número da nota.');
    if (!iso(b.emissao)) throw falha('Informe a data de emissão.');
    if (!(v > 0)) throw falha('Informe o valor total da nota.');
    const icms = contasPagar.valor(b.icms) || 0; const base = contasPagar.valor(b.base_icms) || 0;
    const cfop = String(b.cfop || '').replace(/\D/g, '').slice(0, 4);
    n = {
      modelo: '01', chave: null, serie: texto(b.serie, 5) || '', numero: String(b.numero).trim().slice(0, 15), emissao: b.emissao, natureza: '',
      emitente: { doc, nome: String(b.emitente_nome).trim().slice(0, 200), uf: String(b.emitente_uf || '').toUpperCase().slice(0, 2), ie: '' },
      valor_total: v, valor_produtos: v, base_icms: base, icms, icms_st: 0, ipi: 0, duplicatas: [],
      itens: [{ codigo: '', descricao: texto(b.descricao, 200) || 'Nota sem XML', ncm: '', cfop, cfop_entrada: cfop, unidade: '', quantidade: 1, valor_unitario: v, valor: v, frete: 0, seguro: 0, desconto: 0, outras: 0, ipi: 0, cst: '', base, aliquota: 0, icms, st: 0 }],
    };
  }
  const entrada = iso(b.entrada) || contasPagar.hojeBr();
  if (entrada < n.emissao) throw falha('A data de entrada é antes da emissão da nota.');
  const modo = await modoCredito(e);
  const credito = modo === 'notas' ? contasPagar.valor(b.credito_icms ?? n.credito_sugerido) || 0 : 0;
  if (credito > centavos(n.icms) + 0.001) throw falha('O crédito de ICMS não pode passar do ICMS da nota.');
  const categoria = contasPagar.CATEGORIAS[b.categoria] ? b.categoria : (n.categoria || 'outros');
  const gerar = b.gerar_contas !== false && b.gerar_contas !== 'false';
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    // Nota cancelada aqui antes (lançada errada) pode ser lançada de novo: a linha antiga sai.
    if (n.chave) await cliente.query(`DELETE FROM notas_entrada WHERE chave = $1 AND status = 'cancelada'`, [n.chave]);
    const { rows: [nota] } = await cliente.query(
      `INSERT INTO notas_entrada (modelo, chave, serie, numero, emissao, entrada, emitente_doc, emitente_nome, emitente_uf, emitente_ie, natureza, valor_total, valor_produtos,
                                  base_icms, icms, icms_st, ipi, credito_icms, categoria, itens, duplicatas, xml, observacao, usuario_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id`,
      [n.modelo, n.chave, n.serie, n.numero, n.emissao, entrada, n.emitente.doc || null, n.emitente.nome, n.emitente.uf || null, n.emitente.ie || null, n.natureza || null,
        centavos(n.valor_total), centavos(n.valor_produtos), centavos(n.base_icms), centavos(n.icms), centavos(n.icms_st), centavos(n.ipi), credito, categoria,
        JSON.stringify(n.itens), JSON.stringify(n.duplicatas || []), b.xml ? String(b.xml) : null, texto(b.observacao, 2000), usuarioNome]);
    const contas = [];
    if (gerar) {
      const docNota = `${n.modelo === '57' ? 'CT-e' : 'NF'} ${n.numero}${n.serie ? `/${n.serie}` : ''}`;
      const base = { descricao: `${contasPagar.CATEGORIAS[categoria]} — ${docNota}`, categoria, fornecedor_nome: n.emitente.nome, fornecedor_doc: n.emitente.doc, documento: docNota, competencia: entrada, observacao: texto(b.observacao, 2000), centro_custo_id: b.centro_custo_id, placa: b.placa };
      const dups = n.duplicatas?.length ? n.duplicatas : null;
      if (dups) {
        const total = centavos(dups.reduce((s, d) => s + d.valor, 0));
        if (Math.abs(total - centavos(n.valor_total)) > 0.05) throw falha(`As duplicatas da nota somam ${total.toFixed(2)} e a nota vale ${centavos(n.valor_total).toFixed(2)}: lance sem gerar as contas e cadastre à mão.`);
        for (const [k, d] of dups.entries()) {
          const [c] = await contasPagar.criar({ ...base, vencimento: d.vencimento, valor: d.valor, parcelas: 1 }, usuarioNome, { cliente });
          await cliente.query('UPDATE contas_pagar SET parcela = $2, nota_entrada_id = $3, grupo = $4 WHERE id = $1', [c.id, dups.length > 1 ? `${k + 1}/${dups.length}` : null, nota.id, dups.length > 1 ? `ne${nota.id}` : null]);
          contas.push(c.id);
        }
      } else {
        if (!iso(b.vencimento)) throw falha('A nota não traz duplicatas: informe o vencimento (ou desmarque "gerar conta a pagar").');
        const criadas = await contasPagar.criar({ ...base, vencimento: b.vencimento, valor: n.valor_total, parcelas: b.parcelas || 1, dividir: true }, usuarioNome, { cliente });
        await cliente.query('UPDATE contas_pagar SET nota_entrada_id = $2 WHERE id = ANY($1::int[])', [criadas.map((c) => c.id), nota.id]);
        contas.push(...criadas.map((c) => c.id));
      }
    }
    await cliente.query('COMMIT');
    // CT-e de redespacho de um parceiro: os custos dos CT-e dele saem da conta-corrente (a nota já gerou a conta a pagar).
    const parceiro = n.modelo === '57' ? await require('./parceiros').aoLancarNotaEntrada(nota.id, { emitenteDoc: n.emitente.doc, xml: b.xml }).catch(() => null) : null;
    return { id: nota.id, numero: n.numero, fornecedor: n.emitente.nome, valor: centavos(n.valor_total), credito, contas, parceiro };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw falha('Esta nota já foi lançada.', 409);
    throw err;
  } finally { cliente.release(); }
}

// Cancela o lançamento (nota lançada errada ou devolvida): as contas a pagar em aberto e sem pagamento saem junto.
async function cancelar(id, motivo) {
  const m = texto(motivo, 200);
  if (!m) throw falha('Diga o motivo.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [n] } = await cliente.query(`SELECT id, numero, emitente_nome, status FROM notas_entrada WHERE id = $1 FOR UPDATE`, [id]);
    if (!n) throw falha('Nota não encontrada.', 404);
    if (n.status !== 'lancada') throw falha('Esta nota já foi cancelada.', 409);
    const { rows: pagas } = await cliente.query(`SELECT COUNT(*)::int AS n FROM contas_pagar WHERE nota_entrada_id = $1 AND status <> 'cancelada' AND valor_pago > 0`, [id]);
    if (pagas[0].n) throw falha('Há conta a pagar desta nota com pagamento: estorne o pagamento antes.', 409);
    await cliente.query(`UPDATE contas_pagar SET status = 'cancelada', cancelada_em = NOW(), observacao = TRIM(COALESCE(observacao, '') || E'\\nCancelada com a nota de entrada: ' || $2)
      WHERE nota_entrada_id = $1 AND status = 'aberta'`, [id, m]);
    await cliente.query(`UPDATE notas_entrada SET status = 'cancelada', motivo_cancelamento = $2, cancelada_em = NOW() WHERE id = $1`, [id, m]);
    await cliente.query('COMMIT');
    return n;
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

const CAMPOS_LISTA = `n.id, n.modelo, n.chave, n.serie, n.numero, n.emissao::text, n.entrada::text, n.emitente_doc, n.emitente_nome, n.emitente_uf, n.valor_total::float, n.base_icms::float,
  n.icms::float, n.icms_st::float, n.ipi::float, n.credito_icms::float, n.categoria, n.status, n.motivo_cancelamento, n.usuario_nome, (n.xml IS NOT NULL) AS tem_xml`;

async function listar({ de, ate, busca, situacao } = {}) {
  const val = [iso(de) || '1900-01-01', iso(ate) || '2999-12-31'];
  const cond = ['n.entrada BETWEEN $1::date AND $2::date'];
  if (situacao !== 'todas') cond.push(`n.status = 'lancada'`);
  const b = String(busca || '').trim();
  if (b) { val.push(`%${b}%`, b.replace(/\D/g, '') || '-'); cond.push(`(n.emitente_nome ILIKE $3 OR n.numero = $4 OR n.chave LIKE '%' || $4 || '%' OR n.emitente_doc LIKE $4 || '%')`); }
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_LISTA},
            (SELECT json_agg(json_build_object('id', c.id, 'vencimento', c.vencimento::text, 'valor', c.valor::float, 'status', c.status, 'parcela', c.parcela) ORDER BY c.vencimento)
               FROM contas_pagar c WHERE c.nota_entrada_id = n.id) AS contas
       FROM notas_entrada n WHERE ${cond.join(' AND ')} ORDER BY n.entrada DESC, n.id DESC LIMIT 1000`, val);
  const validas = rows.filter((r) => r.status === 'lancada');
  const soma = (k) => centavos(validas.reduce((s, r) => s + Number(r[k] || 0), 0));
  return { notas: rows, totais: { qtd: validas.length, valor: soma('valor_total'), icms: soma('icms'), credito: soma('credito_icms') } };
}

async function detalhe(id) {
  const { rows } = await pool.query(`SELECT ${CAMPOS_LISTA}, n.natureza, n.itens, n.duplicatas, n.observacao, n.criado_em FROM notas_entrada n WHERE n.id = $1`, [id]);
  if (!rows[0]) throw falha('Nota não encontrada.', 404);
  const { rows: contas } = await pool.query(`SELECT id, descricao, vencimento::text, valor::float, valor_pago::float, status, parcela FROM contas_pagar WHERE nota_entrada_id = $1 ORDER BY vencimento`, [id]);
  return { ...rows[0], contas };
}

// ---------- Livro de entradas ----------
// Uma linha por nota e CFOP de entrada: valor contábil, base e ICMS creditado (rateado pelos itens que dão crédito).
async function livroEntradas({ de, ate }) {
  const { rows } = await pool.query(
    `SELECT id, modelo, chave, serie, numero, emissao::text, entrada::text, emitente_doc, emitente_nome, emitente_uf, valor_total::float, icms::float, icms_st::float, ipi::float,
            credito_icms::float, categoria, itens FROM notas_entrada WHERE status = 'lancada' AND entrada BETWEEN $1::date AND $2::date ORDER BY entrada, id`, [de, ate]);
  const linhas = [];
  rows.forEach((n) => {
    const itens = Array.isArray(n.itens) && n.itens.length ? n.itens : [{ cfop_entrada: '', valor: n.valor_total, icms: n.icms, base: 0, creditavel: true }];
    const contabil = (i) => i.valor + (i.frete || 0) + (i.seguro || 0) + (i.outras || 0) - (i.desconto || 0) + (i.ipi || 0) + (i.st || 0);
    const totalItens = itens.reduce((s, i) => s + contabil(i), 0) || 1;
    const icmsCred = itens.filter((i) => i.creditavel !== false).reduce((s, i) => s + (i.icms || 0), 0);
    const grupos = new Map();
    itens.forEach((i) => {
      const k = i.cfop_entrada || i.cfop || '—';
      const g = grupos.get(k) || { cfop: k, valor: 0, base: 0, credito: 0 };
      // O valor contábil da nota (com frete, IPI, ST) é distribuído pelos itens na proporção deles.
      g.valor += (contabil(i) / totalItens) * n.valor_total;
      const parte = icmsCred > 0 && i.creditavel !== false ? (i.icms || 0) / icmsCred : 0;
      g.credito += parte * n.credito_icms;
      g.base += parte && i.icms ? (i.base || 0) * (n.credito_icms / icmsCred) : 0;
      grupos.set(k, g);
    });
    [...grupos.values()].forEach((g) => linhas.push({
      id: n.id, modelo: n.modelo, chave: n.chave, serie: n.serie, numero: n.numero, emissao: n.emissao, entrada: n.entrada, emitente_doc: n.emitente_doc, emitente_nome: n.emitente_nome,
      uf: n.emitente_uf, categoria: n.categoria, cfop: g.cfop, valor: centavos(g.valor), base: centavos(g.base), credito: centavos(g.credito), outras: centavos(g.valor - g.base),
    }));
  });
  // Acerta os centavos do rateio na última linha de cada nota.
  rows.forEach((n) => {
    const ls = linhas.filter((l) => l.id === n.id);
    const dv = centavos(n.valor_total - ls.reduce((s, l) => s + l.valor, 0)); const dc = centavos(n.credito_icms - ls.reduce((s, l) => s + l.credito, 0));
    if (ls.length) { ls[ls.length - 1].valor = centavos(ls[ls.length - 1].valor + dv); ls[ls.length - 1].credito = centavos(ls[ls.length - 1].credito + dc); ls[ls.length - 1].outras = centavos(ls[ls.length - 1].valor - ls[ls.length - 1].base); }
  });
  const por = new Map();
  linhas.forEach((l) => { const g = por.get(l.cfop) || { chave: l.cfop, qtd: 0, valor: 0, base: 0, credito: 0, outras: 0 }; g.qtd += 1; ['valor', 'base', 'credito', 'outras'].forEach((k) => { g[k] = centavos(g[k] + l[k]); }); por.set(l.cfop, g); });
  const soma = (k) => centavos(linhas.reduce((s, l) => s + l[k], 0));
  return { periodo: { de, ate }, linhas, por_cfop: [...por.values()].sort((a, b) => a.chave.localeCompare(b.chave)), totais: { notas: rows.length, valor: soma('valor'), base: soma('base'), credito: soma('credito'), outras: soma('outras') } };
}

// ---------- Apuração do ICMS ----------
const mesesEntre = (de, ate) => {
  const r = []; let d = new Date(`${de.slice(0, 7)}-01T12:00:00Z`);
  while (d.toISOString().slice(0, 7) <= ate.slice(0, 7)) {
    const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    r.push({ de: d.toISOString().slice(0, 10), ate: fim });
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12));
  }
  return r;
};
async function apurarPeriodo({ de, ate }, modo) {
  const contabil = require('./contabil');
  const l = await contabil.livroSaidas({ de, ate });
  const debito = centavos(l.totais.icms - l.totais.ajustes_icms);
  let credito = 0;
  if (modo === 'notas') credito = (await livroEntradas({ de, ate })).totais.credito;
  if (modo === 'presumido') credito = centavos(Math.max(0, debito) * PRESUMIDO);
  return { debito, credito };
}
// Débitos − créditos do período; no modo "notas", o saldo credor dos meses anteriores (desde a primeira nota lançada) é abatido.
async function apuracao({ de, ate }) {
  const e = await empresa();
  const modo = await modoCredito(e);
  const atual = await apurarPeriodo({ de, ate }, modo);
  let saldoAnterior = 0;
  if (modo === 'notas') {
    saldoAnterior = centavos(Number(e.contabil_config?.icms_saldo_inicial) || 0);
    const { rows: [p] } = await pool.query(`SELECT MIN(entrada)::text AS primeira FROM notas_entrada WHERE status = 'lancada' AND entrada < $1::date`, [de]);
    if (p.primeira) {
      const ini = p.primeira > de ? de : p.primeira;
      const antes = new Date(Date.parse(`${de}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
      // No máximo 36 meses para trás.
      for (const m of mesesEntre(ini, antes).slice(-36)) {
        const r = await apurarPeriodo(m, modo);
        saldoAnterior = centavos(Math.max(0, saldoAnterior + r.credito - r.debito));
      }
    }
  }
  const saldo = centavos(atual.debito - atual.credito - saldoAnterior);
  return {
    periodo: { de, ate }, modo, modo_texto: MODOS_CREDITO[modo], debito: atual.debito, credito: atual.credito, saldo_credor_anterior: saldoAnterior,
    a_recolher: saldo > 0 ? saldo : 0, saldo_credor: saldo < 0 ? -saldo : 0,
    compensado: centavos(Math.min(atual.debito, atual.credito + saldoAnterior)),
  };
}

function csvLivro(l) {
  const n = (v) => Number(v || 0).toFixed(2).replace('.', ',');
  const linhas = [['Entrada', 'Emissão', 'Modelo', 'Série', 'Número', 'Chave', 'Fornecedor', 'CNPJ/CPF', 'UF', 'CFOP', 'Valor contábil', 'Base ICMS', 'ICMS creditado', 'Isentas/outras', 'Categoria'].join(';')];
  l.linhas.forEach((x) => linhas.push([diaBr(x.entrada), diaBr(x.emissao), x.modelo, x.serie, x.numero, x.chave, x.emitente_nome, x.emitente_doc, x.uf, x.cfop, n(x.valor), n(x.base), n(x.credito), n(x.outras),
    contasPagar.CATEGORIAS[x.categoria] || x.categoria].map((v) => celula(v)).join(';')));
  return `﻿${linhas.join('\r\n')}\r\n`;
}

function livroHtml(l, a, e) {
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const m = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const t = l.totais;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Livro de entradas ${diaBr(l.periodo.de)} a ${diaBr(l.periodo.ate)}</title>
  <style>@page { size: A4 landscape; margin: 10mm; } body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 14px; } h1 { font-size: 16px; margin: 0; } h3 { font-size: 13px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #ccc; padding: 3px 5px; text-align: left; } th { background: #eef0f4; } .n { text-align: right; }
  .resumo { display: flex; gap: 18px; flex-wrap: wrap; margin: 10px 0; } .resumo div { border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; } .resumo b { display: block; font-size: 14px; }
  .acoes { margin-bottom: 10px; } @media print { .acoes { display: none; } }</style></head><body>
  <div class="acoes"><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
  <h1>Registro de entradas</h1>
  <div>${esc(e.razao_social || '')} · CNPJ ${esc(e.cnpj || '')} · IE ${esc(e.ie || '')} · período ${diaBr(l.periodo.de)} a ${diaBr(l.periodo.ate)}</div>
  <div class="resumo"><div>Notas<b>${t.notas}</b></div><div>Valor contábil<b>R$ ${m(t.valor)}</b></div><div>Base de cálculo<b>R$ ${m(t.base)}</b></div><div>ICMS creditado<b>R$ ${m(t.credito)}</b></div><div>Isentas / outras<b>R$ ${m(t.outras)}</b></div></div>
  ${a ? `<h3>Apuração do ICMS (${esc(a.modo_texto)})</h3><table><tbody>
    <tr><td>Débitos (saídas)</td><td class="n">${m(a.debito)}</td></tr><tr><td>Créditos ${a.modo === 'presumido' ? '(presumido, 20% do débito)' : '(entradas)'}</td><td class="n">${m(a.credito)}</td></tr>
    ${a.modo === 'notas' ? `<tr><td>Saldo credor do período anterior</td><td class="n">${m(a.saldo_credor_anterior)}</td></tr>` : ''}
    <tr><th>${a.a_recolher ? 'ICMS a recolher' : 'Saldo credor para o próximo período'}</th><th class="n">${m(a.a_recolher || a.saldo_credor)}</th></tr></tbody></table>` : ''}
  <h3>Resumo por CFOP</h3><table><thead><tr><th>CFOP</th><th class="n">Linhas</th><th class="n">Valor contábil</th><th class="n">Base</th><th class="n">ICMS creditado</th><th class="n">Isentas/outras</th></tr></thead><tbody>
  ${l.por_cfop.map((g) => `<tr><td>${esc(g.chave)}</td><td class="n">${g.qtd}</td><td class="n">${m(g.valor)}</td><td class="n">${m(g.base)}</td><td class="n">${m(g.credito)}</td><td class="n">${m(g.outras)}</td></tr>`).join('')}</tbody></table>
  <h3>Documentos</h3><table><thead><tr><th>Entrada</th><th>Emissão</th><th>Mod.</th><th>Série/nº</th><th>Fornecedor</th><th>UF</th><th>CFOP</th><th class="n">Valor contábil</th><th class="n">Base</th><th class="n">ICMS</th><th class="n">Isentas/outras</th></tr></thead><tbody>
  ${l.linhas.map((x) => `<tr><td>${diaBr(x.entrada)}</td><td>${diaBr(x.emissao)}</td><td>${esc(x.modelo)}</td><td>${esc(x.serie)}/${esc(x.numero)}</td><td>${esc(x.emitente_nome)}</td><td>${esc(x.uf || '')}</td><td>${esc(x.cfop)}</td>
    <td class="n">${m(x.valor)}</td><td class="n">${m(x.base)}</td><td class="n">${m(x.credito)}</td><td class="n">${m(x.outras)}</td></tr>`).join('')}</tbody></table>
  <p style="font-size:10.5px; color:#555;">O CFOP de entrada é sugerido a partir do CFOP da nota do fornecedor (5xxx → 1xxx, 6xxx → 2xxx; CT-e tomado → 1353/2353). O crédito é o informado em cada nota no lançamento. Confira com o contador.</p>
  </body></html>`;
}

module.exports = { MODOS_CREDITO, PRESUMIDO, lerXml, previa, lancar, cancelar, listar, detalhe, livroEntradas, apuracao, csvLivro, livroHtml, categoriaDoNcm, cfopEntrada, modoCredito };
