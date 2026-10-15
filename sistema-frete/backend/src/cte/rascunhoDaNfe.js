// NF-e que chega (por e-mail) vira rascunho de CT-e pronto para conferir e
// transmitir: remetente, destinatário, tomador (CIF/FOB pelo modFrete),
// início/fim da prestação, CFOP, ICMS (alíquota interna ou interestadual),
// carga somada e o frete pela tabela de preço da própria transportadora.
// Notas do mesmo remetente para o mesmo destino, no mesmo e-mail, vão num CT-e só.
const pool = require('../db');
const { lerNfe } = require('./lerNfe');
const { aliquotaInterestadual } = require('../icmsCte');
const emissao = require('./emissao');

const docLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Lê os XML e separa: NF-e para nós, NF-e de outra transportadora, já em CT-e, não NF-e.
async function classificar(xmls, e) {
  const nossas = []; const ignoradas = [];
  const cnpj = docLimpo(e.cnpj);
  for (const x of xmls) {
    let n;
    try { n = lerNfe(x.buffer.toString('utf8')); } catch { ignoradas.push({ arquivo: x.nome, motivo: 'não é NF-e' }); continue; }
    if (!/^\d{44}$/.test(String(n.chave || ''))) { ignoradas.push({ arquivo: x.nome, nf: n.numero, motivo: 'chave de acesso inválida' }); continue; }
    const transp = docLimpo(n.transportadoraCnpj);
    if (transp && cnpj && transp !== cnpj) { ignoradas.push({ arquivo: x.nome, nf: n.numero, motivo: `transportadora da nota é outra (${transp})` }); continue; }
    if (String(n.modFrete) === '9') { ignoradas.push({ arquivo: x.nome, nf: n.numero, motivo: 'nota sem frete (modFrete 9)' }); continue; }
    const { rows } = await pool.query(`SELECT numero, status FROM ctes_emitidos WHERE dados->'nfes' ? $1 AND status NOT IN ('cancelado', 'substituido') LIMIT 1`, [n.chave]);
    if (rows[0]) { ignoradas.push({ arquivo: x.nome, nf: n.numero, motivo: `já está no CT-e ${rows[0].numero || '(rascunho)'}` }); continue; }
    if (nossas.some((m) => m.chave === n.chave)) continue;
    nossas.push(n);
  }
  return { nossas, ignoradas };
}

// Agrupa por remetente + destinatário + local de entrega.
function agrupar(nfes) {
  const grupos = new Map();
  nfes.forEach((n) => {
    const fim = n.entrega?.cMun || n.destinatario?.endereco?.cMun;
    const k = `${docLimpo(n.remetente?.cnpj || n.remetente?.cpf)}|${docLimpo(n.destinatario?.cnpj || n.destinatario?.cpf)}|${fim}|${String(n.modFrete) === '1' ? 'F' : 'C'}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(n);
  });
  return [...grupos.values()];
}

async function freteDaTabela(e, d, notas) {
  try {
    const r = await require('../calculoFrete').calcularParaRegistro({
      transportadoraCte: e.razao_social, transportadoraCnpj: e.cnpj, cidade: d.fim.xMun, bairro: d.destinatario?.endereco?.xBairro,
      qtdVolumes: notas.reduce((s, n) => s + (n.volumes || 0), 0), pesoKg: notas.reduce((s, n) => s + (n.pesoBruto || 0), 0), cubagemM3: null,
      valorFaturado: notas.reduce((s, n) => s + (n.valor || 0), 0),
      registro: { uf: d.fim.UF, cliente: d.destinatario?.xNome, tipo_carga: null }, xmlNfe: null,
    });
    if (r.erro) return { erro: r.erro };
    const c = r.componentes;
    const componentes = [['FRETE PESO', r.freteBase], ['AD VALOREM', c.adValorem], ['GRIS', c.gris], ['PEDAGIO', c.pedagio], ['TDE', c.tde], ['TDA', c.tda],
      ['TRT', c.trt], ['DESPACHO', c.despacho], ['DESCARGA', c.descarga]].filter(([, v]) => Number(v) > 0).map(([xNome, v]) => ({ xNome, vComp: centavos(v) }));
    return { componentes, total: centavos(componentes.reduce((s, x) => s + x.vComp, 0)), tabela: r.trecho?.tabela_nome };
  } catch (err) { return { erro: err.message }; }
}

// Monta os dados do CT-e (o mesmo formato da tela) para um grupo de notas.
async function montarDados(notas, e, origem) {
  const n0 = notas[0];
  const fob = String(n0.modFrete) === '1';
  const rem = n0.remetente; const dest = n0.destinatario;
  const fimEnd = n0.entrega?.cMun ? n0.entrega : dest?.endereco || {};
  const inicio = { cMun: rem?.endereco?.cMun, xMun: rem?.endereco?.xMun, UF: rem?.endereco?.UF };
  const fim = { cMun: fimEnd.cMun, xMun: fimEnd.xMun, UF: fimEnd.UF };
  // CFOP: x353 comercial / x357 não contribuinte; início fora da UF da empresa: x932.
  const tomaIe = String((fob ? dest : rem)?.ie || '').replace(/\D/g, '');
  const outraUf = inicio.UF && e.uf && inicio.UF !== e.uf;
  const cfopTipo = outraUf ? '932' : tomaIe ? '353' : '357';
  const cfop = `${inicio.UF === fim.UF ? 5 : 6}${cfopTipo}`;
  const aliq = inicio.UF && fim.UF && inicio.UF !== fim.UF ? aliquotaInterestadual(inicio.UF, fim.UF) : Number(e.cte_aliquota_interna) || null;
  const simples = [1, 4].includes(Number(e.crt));
  const cst = simples ? 'SN' : outraUf ? 'OUTRAUF' : (e.cte_cst_padrao || '00');
  const soma = (k) => notas.reduce((s, n) => s + (Number(n[k]) || 0), 0);
  const dados = {
    tpCTe: '0', tpServ: '0', tomador: fob ? '3' : '0', remetente: rem, destinatario: dest, inicio, fim, cfop, cfopTipo,
    natOp: cfopTipo === '932' ? 'PRESTACAO DE SERVICO DE TRANSPORTE' : cfopTipo === '357' ? 'TRANSPORTE A NAO CONTRIBUINTE' : 'TRANSPORTE A ESTABELECIMENTO COMERCIAL',
    carga: {
      vCarga: centavos(soma('valor')), proPred: n0.produtoPredominante || 'DIVERSOS',
      quantidades: [{ cUnid: '01', tpMed: 'PESO BRUTO', qCarga: Math.round(soma('pesoBruto') * 1000) / 1000 }, ...(soma('volumes') ? [{ cUnid: '03', tpMed: 'VOLUMES', qCarga: soma('volumes') }] : [])],
    },
    nfes: notas.map((n) => n.chave),
    valores: { vTPrest: 0, componentes: [] },
    icms: { cst, pICMS: aliq },
    origem,
  };
  const frete = await freteDaTabela(e, dados, notas);
  const avisos = [];
  if (frete.erro) avisos.push(/tabela de pre/i.test(frete.erro) ? 'frete não calculado: a empresa não tem tabela de preço (Cadastros → Transportadoras) — lance os valores' : `frete não calculado (${frete.erro}) — lance os valores`);
  else {
    dados.valores = { vTPrest: frete.total, componentes: frete.componentes };
    if (['00', '20', '90', 'OUTRAUF'].includes(cst) && aliq) dados.icms = { cst, pICMS: aliq, vBC: frete.total, vICMS: centavos((frete.total * aliq) / 100) };
  }
  if (!inicio.cMun || !fim.cMun) avisos.push('confira os códigos IBGE de início e fim');
  dados.observacoes = '';
  dados.avisosImportacao = avisos;
  return dados;
}

// xmls: [{ nome, buffer }] de um e-mail. Cria os rascunhos e devolve o resumo.
async function rascunhosDosXml(xmls, origem) {
  const e = await emissao.carregarEmitente();
  const { nossas, ignoradas } = await classificar(xmls, e);
  const criados = [];
  for (const grupo of agrupar(nossas)) {
    const dados = await montarDados(grupo, e, origem);
    const r = emissao.resumo(dados);
    const { rows } = await pool.query(
      `INSERT INTO ctes_emitidos (ambiente, dados, valor_total, tomador_nome, remetente_nome, destinatario_nome, cidade_fim, uf_fim, criado_por_nome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [e.cte_ambiente || 2, dados, r.valor_total, r.tomador_nome, r.remetente_nome, r.destinatario_nome, r.cidade_fim, r.uf_fim, origem?.usuario || 'E-mail']);
    // Coleta feita deste remetente e ainda sem CT-e: liga as duas.
    const coleta = await require('../coletas').vincularCte(rows[0].id, dados.remetente?.cnpj || dados.remetente?.cpf, origem).catch(() => null);
    criados.push({ coleta, id: rows[0].id, nfs: grupo.map((n) => n.numero), destinatario: dados.destinatario?.xNome, valor: dados.valores.vTPrest, avisos: dados.avisosImportacao });
  }
  return { criados, ignoradas };
}

module.exports = { rascunhosDosXml, montarDados, classificar, agrupar };
