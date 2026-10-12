// EDI PROCEDA 3.1 (NOTFIS, CONEMB, OCOREN, DOCCOB) dos dois lados:
// - Embarcador (quem contrata o frete): gera o NOTFIS das notas para a
//   transportadora e lê o CONEMB, o OCOREN e o DOCCOB que ela devolve.
// - Transportadora (quem emite CT-e no Nexofrete): lê o NOTFIS do cliente
//   (vira rascunho de CT-e) e gera CONEMB, OCOREN e DOCCOB para ele.
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const { permitirAlguma, consultaCliente } = require('../permissoes');
const edi = require('../edi/arquivos');
const { lerNfe } = require('../cte/lerNfe');
const { municipio, ufsDaCidade } = require('../roteirizacao/municipios');
const emissao = require('../cte/emissao');

const router = express.Router();

const embarcador = permitirAlguma('pode_ver_auditoria', 'pode_editar_registros', 'pode_enviar_xml');
const transportadora = permitirAlguma('pode_emitir_cte');
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const docLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const raiz = (cnpj) => docLimpo(cnpj).slice(0, 8);
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const log = (req, acao, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes });
const responderErro = (res, err, padrao) => { console.error('[edi]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const carimbo = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 16).replace(/\D/g, '');
const nomeArquivo = (tipo, quem) => `${tipo}_${String(quem || '').normalize('NFD').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30)}_${carimbo()}.txt`;

async function empresa() {
  const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
  return rows[0] || {};
}

// =====================================================================
// EMBARCADOR
// =====================================================================

// Transportadoras com notas no período (para escolher o destino do NOTFIS).
router.get('/embarcador/transportadoras', autenticar, embarcador, async (req, res) => {
  try {
    const { rows } = await consultaCliente(req,
      `SELECT TRIM(transportadora) AS nome, COUNT(*)::int AS notas, MAX(data_emissao_nf) AS ultima
         FROM fretes WHERE COALESCE(TRIM(transportadora), '') <> '' AND xml_nfe_original IS NOT NULL AND data_emissao_nf >= CURRENT_DATE - 120
        GROUP BY 1 ORDER BY MAX(data_emissao_nf) DESC, 1 LIMIT 300`);
    res.json(rows);
  } catch (err) { responderErro(res, err, 'Erro ao listar as transportadoras.'); }
});

// Gera o NOTFIS das notas de uma transportadora num período.
router.post('/embarcador/notfis', autenticar, embarcador, async (req, res) => {
  try {
    const { transportadora: transp, de, ate, semCte } = req.body || {};
    if (!transp) return res.status(400).json({ erro: 'Escolha a transportadora.' });
    if (!data(de) || !data(ate)) return res.status(400).json({ erro: 'Informe o período (emissão da NF).' });
    const { rows } = await consultaCliente(req,
      `SELECT id, numero_nf, xml_nfe_original, redespacho, cidade_redespacho, redespacho_cnpj, peso_kg, qtd_volumes, cubagem_m3
         FROM fretes
        WHERE xml_nfe_original IS NOT NULL AND nf_cancelada IS NOT TRUE AND frete_principal_id IS NULL
          AND UPPER(TRIM(transportadora)) = UPPER(TRIM($1)) AND data_emissao_nf BETWEEN $2::date AND $3::date
          ${semCte ? 'AND chave_cte IS NULL' : ''}
        ORDER BY data_emissao_nf, numero_nf`, [transp, de, ate]);
    if (!rows.length) return res.status(404).json({ erro: 'Nenhuma nota (com XML) dessa transportadora no período.' });
    const embarcadores = new Map();
    const avisos = [];
    rows.forEach((r) => {
      let n;
      try { n = lerNfe(r.xml_nfe_original); } catch { avisos.push(`NF ${r.numero_nf}: XML ilegível, ficou de fora`); return; }
      const rem = n.remetente || {}; const dst = n.destinatario || {};
      const chaveEmb = docLimpo(rem.cnpj || rem.cpf);
      if (!embarcadores.has(chaveEmb)) {
        embarcadores.set(chaveEmb, { cnpj: chaveEmb, ie: rem.ie, razao: rem.xNome, endereco: [rem.endereco?.xLgr, rem.endereco?.nro].filter(Boolean).join(', '),
          cidade: rem.endereco?.xMun, cep: rem.endereco?.CEP, uf: rem.endereco?.UF, destinatarios: new Map() });
      }
      const emb = embarcadores.get(chaveEmb);
      const chaveDst = docLimpo(dst.cnpj || dst.cpf) || dst.xNome;
      if (!emb.destinatarios.has(chaveDst)) {
        const e = dst.endereco || {};
        emb.destinatarios.set(chaveDst, { razao: dst.xNome, cnpj: dst.cnpj || dst.cpf, ie: dst.ie, endereco: [e.xLgr, e.nro].filter(Boolean).join(', '), bairro: e.xBairro,
          cidade: e.xMun, cep: e.CEP, codigoMunicipio: e.cMun, uf: e.UF, telefone: dst.fone, notas: [] });
      }
      // Redespacho da nota: vai no 316 (com a UF achada pela cidade, quando o nome é único).
      let redespacho = null;
      if (r.redespacho || r.cidade_redespacho) {
        const ufs = r.cidade_redespacho ? ufsDaCidade(r.cidade_redespacho) : [];
        redespacho = { razao: r.redespacho || 'REDESPACHO', cnpj: r.redespacho_cnpj, cidade: r.cidade_redespacho, uf: ufs.length === 1 ? ufs[0] : '' };
      }
      emb.destinatarios.get(chaveDst).notas.push({
        serie: n.serie, numero: Number(n.numero), emissao: String(n.dataEmissao || '').slice(0, 10), condicaoFrete: String(n.modFrete) === '1' ? 'F' : 'C',
        natureza: n.produtoPredominante, especie: n.especie, volumes: Number(r.qtd_volumes ?? n.volumes) || 0, valor: n.valor,
        peso: Number(r.peso_kg ?? n.pesoBruto) || 0, cubagem: Number(r.cubagem_m3) || 0, cfop: soDigitos(n.cfop).slice(0, 4) || null, redespacho,
      });
    });
    const e = await empresa();
    const texto = edi.montarNotfis({
      remetente: e.razao_social || 'EMBARCADOR', destinatario: transp,
      embarcadores: [...embarcadores.values()].map((x) => ({ ...x, destinatarios: [...x.destinatarios.values()] })),
    });
    const qtd = rows.length - avisos.length;
    log(req, 'edi_notfis', `Gerou NOTFIS para ${transp} com ${qtd} nota(s) (${de} a ${ate})`);
    res.json({ nome: nomeArquivo('NOTFIS', transp), texto, notas: qtd, avisos });
  } catch (err) { responderErro(res, err, 'Erro ao gerar o NOTFIS.'); }
});

// Fretes de uma NF: número + raiz do CNPJ do emissor (posições 7–14 da chave).
async function fretesDaNota(req, numero, cnpjEmissor) {
  const { rows } = await consultaCliente(req,
    `SELECT id, numero_nf, cliente, cidade, uf, transportadora, numero_cte, chave_cte, valor_total_cte, valor_frete_negociado,
            COALESCE(valor_total_calculado, valor_frete_tabelado) AS valor_tabela, data_entrega, data_entrega_origem, status, chave_nfe
       FROM fretes
      WHERE LTRIM(numero_nf, '0') = LTRIM($1, '0') AND frete_principal_id IS NULL
        AND ($2 = '' OR SUBSTRING(COALESCE(chave_nfe, '') FROM 7 FOR 8) = $2)
      ORDER BY data_emissao_nf DESC NULLS LAST LIMIT 3`, [String(numero), raiz(cnpjEmissor)]);
  return rows;
}

// Lê um arquivo da transportadora (CONEMB, OCOREN, DOCCOB) e cruza com os fretes.
router.post('/embarcador/ler', autenticar, embarcador, async (req, res) => {
  try {
    const texto = String(req.body?.texto || '');
    const tipo = edi.tipoDoArquivo(texto);
    if (!tipo) return res.status(400).json({ erro: 'Não reconheci o arquivo: não é NOTFIS, CONEMB, OCOREN nem DOCCOB (layout PROCEDA).' });
    if (tipo === 'NOTFIS') return res.status(400).json({ erro: 'Esse é um NOTFIS (notas para a transportadora). Aqui entram os arquivos que a transportadora devolve: CONEMB, OCOREN e DOCCOB.' });

    if (tipo === 'CONEMB') {
      const a = edi.lerConemb(texto);
      const linhas = [];
      for (const c of a.conhecimentos) {
        let frete = null;
        if (c.chaveCte) frete = (await consultaCliente(req, 'SELECT id FROM fretes WHERE chave_cte = $1 LIMIT 1', [c.chaveCte])).rows[0] || null;
        const daNota = c.notas.length ? await fretesDaNota(req, c.notas[0].numero, c.cnpjEmissorNf) : [];
        const f = (frete && daNota.find((x) => x.id === frete.id)) || daNota[0] || null;
        const tabela = f?.valor_tabela != null ? Number(f.valor_tabela) : null;
        linhas.push({
          serie: c.serie, numero: c.numero, emissao: c.emissao, valorFrete: c.valorFrete, valorIcms: c.valorIcms, aliquotaIcms: c.aliquotaIcms,
          tipo: c.tipoDescricao, chaveCte: c.chaveCte || null, notas: c.notas.map((n) => n.numero),
          frete: f ? { id: f.id, cliente: f.cliente, cidade: f.cidade, uf: f.uf, numero_cte: f.numero_cte, valor_cte_xml: f.valor_total_cte, status: f.status } : null,
          valorTabela: tabela, diferenca: tabela != null ? Math.round((c.valorFrete - tabela) * 100) / 100 : null,
          situacao: !f ? 'nota_nao_encontrada' : f.chave_cte ? 'cte_ja_recebido' : 'aguardando_xml_cte',
        });
      }
      return res.json({ tipo, transportadora: a.transportadora, cabecalho: { data: a.data, documento: a.documento }, totais: a.totais, linhas, avisos: a.avisos });
    }

    if (tipo === 'OCOREN') {
      const a = edi.lerOcoren(texto);
      const linhas = [];
      for (const o of a.ocorrencias) {
        const [f] = await fretesDaNota(req, o.numero, o.cnpjEmissorNf);
        linhas.push({
          numero: o.numero, serie: o.serie, codigo: o.codigo, descricao: o.descricao, observacao: o.observacao, data: o.data, hora: o.hora, texto: o.texto,
          entregue: o.entregue, frete: f ? { id: f.id, cliente: f.cliente, cidade: f.cidade, uf: f.uf, data_entrega: f.data_entrega } : null,
          acao: f && o.entregue && !f.data_entrega && o.data ? 'gravar_entrega' : null,
        });
      }
      return res.json({ tipo, transportadora: a.transportadora, cabecalho: { data: a.data, documento: a.documento }, linhas, avisos: a.avisos });
    }

    // DOCCOB: confere os CT-e da fatura com os que estão no Nexofrete.
    const a = edi.lerDoccob(texto);
    const cnpjT = raiz(a.transportadora.cnpj);
    const { rows: cad } = await pool.query(
      `SELECT razao_social FROM transportadoras WHERE LEFT(REGEXP_REPLACE(COALESCE(cnpj, ''), '\\D', '', 'g'), 8) = $1
          OR COALESCE(cnpj_alternativos, '') LIKE '%' || $1 || '%' LIMIT 1`, [cnpjT]).catch(() => ({ rows: [] }));
    const faturas = [];
    for (const f of a.cobrancas) {
      const numeros = f.conhecimentos.map((c) => String(c.numero));
      const { rows } = numeros.length ? await consultaCliente(req,
        `SELECT numero_cte, valor_total_cte, status, fatura_id FROM fretes
          WHERE LTRIM(numero_cte, '0') = ANY($1) AND LEFT(REGEXP_REPLACE(COALESCE(transportadora_cnpj_cte, ''), '\\D', '', 'g'), 8) = $2 AND NOT cte_cancelado`,
        [numeros, cnpjT]) : { rows: [] };
      const achados = new Map(rows.map((r) => [String(r.numero_cte).replace(/^0+/, ''), r]));
      faturas.push({
        numero: f.numero, serie: f.serie, emissao: f.emissao, vencimento: f.vencimento, valor: f.valor, icms: f.icms,
        banco: [f.banco, f.agencia ? `ag. ${f.agencia}${f.agenciaDv ? `-${f.agenciaDv}` : ''}` : '', f.conta ? `c/c ${f.conta}${f.contaDv ? `-${f.contaDv}` : ''}` : ''].filter(Boolean).join(' · '),
        ctes: f.conhecimentos.map((c) => {
          const r = achados.get(String(c.numero));
          return { numero: c.numero, valorFrete: c.valorFrete, noSistema: !!r, valorSistema: r?.valor_total_cte ?? null, jaFaturado: !!r?.fatura_id };
        }),
      });
    }
    return res.json({ tipo, transportadora: { ...a.transportadora, nomeCadastro: cad[0]?.razao_social || null }, cabecalho: { data: a.data, documento: a.documento }, faturas, avisos: a.avisos });
  } catch (err) { responderErro(res, err, 'Erro ao ler o arquivo.'); }
});

// Grava a Data da Entrega das notas que o OCOREN diz que foram entregues
// (só nas que ainda não têm data).
router.post('/embarcador/ocoren/aplicar', autenticar, permitirAlguma('pode_editar_registros'), async (req, res) => {
  try {
    const itens = (Array.isArray(req.body?.itens) ? req.body.itens : []).filter((i) => Number.isInteger(Number(i.id)) && data(i.data));
    if (!itens.length) return res.status(400).json({ erro: 'Nenhuma entrega para gravar.' });
    let gravadas = 0;
    for (const i of itens) {
      const { rowCount } = await consultaCliente(req, 'SELECT 1 FROM fretes WHERE id = $1', [Number(i.id)]);
      if (!rowCount) continue;
      const r = await pool.query(
        `UPDATE fretes SET data_entrega = $2::date, data_entrega_origem = 'edi', atualizado_em = NOW() WHERE id = $1 AND data_entrega IS NULL`,
        [Number(i.id), i.data]);
      gravadas += r.rowCount;
    }
    log(req, 'edi_ocoren', `Gravou ${gravadas} data(s) de entrega a partir de um OCOREN`);
    res.json({ gravadas });
  } catch (err) { responderErro(res, err, 'Erro ao gravar as entregas.'); }
});

// =====================================================================
// TRANSPORTADORA (CT-e emitidos pelo Nexofrete)
// =====================================================================

// Quem paga o frete do CT-e (o cliente para quem vão CONEMB/OCOREN/DOCCOB).
function tomadorDe(d) {
  const p = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {};
  return { cnpj: docLimpo(p.cnpj || p.cpf), nome: p.xNome || '' };
}
const serieNumeroDaChave = (c) => ({ serie: String(Number(c.slice(22, 25))), numero: Number(c.slice(25, 34)) });

async function ctesDoTomador(cnpj, de, ate, ids) {
  const { rows } = await pool.query(
    `SELECT id, serie, numero, chave, protocolo, autorizado_em, dados, valor_total, demonstracao FROM ctes_emitidos
      WHERE status = 'autorizado' ${ids?.length ? 'AND id = ANY($3::int[])' : ''} AND autorizado_em::date BETWEEN $1::date AND $2::date
      ORDER BY numero`, ids?.length ? [de, ate, ids] : [de, ate]);
  return rows.filter((r) => !cnpj || tomadorDe(r.dados || {}).cnpj === docLimpo(cnpj));
}

function conhecimentoEdi(r) {
  const d = r.dados || {};
  const notas = (d.nfes || []).filter((c) => String(c).length === 44).map(serieNumeroDaChave);
  const peso = (d.carga?.quantidades || []).find((q) => /PESO/i.test(q.tpMed || '') || String(q.cUnid) === '01');
  const comp = (nome) => (d.valores?.componentes || []).filter((c) => new RegExp(nome, 'i').test(c.xNome || '')).reduce((s, c) => s + (Number(c.vComp) || 0), 0);
  return {
    serie: String(r.serie), numero: r.numero, emissao: r.autorizado_em, condicaoFrete: String(d.tomador ?? '0') === '3' ? 'F' : 'C',
    peso: Number(peso?.qCarga) || 0, valorFrete: Number(d.valores?.vTPrest ?? r.valor_total) || 0,
    baseIcms: Number(d.icms?.vBC) || 0, aliquotaIcms: Number(d.icms?.pICMS) || 0, valorIcms: Number(d.icms?.vICMS) || 0,
    fretePeso: comp('PESO') || 0, freteValor: comp('VALOR|AD.?VALOREM|GRIS') || 0, pedagio: comp('PED[AÁ]GIO') || 0, despacho: comp('DESPACHO') || 0,
    cnpjEmissorNf: docLimpo(d.remetente?.cnpj || d.remetente?.cpf), cnpjEmbarcadora: tomadorDe(d).cnpj,
    notas, cfop: d.cfop, chaveCte: r.chave, protocoloCte: r.protocolo,
    cnpjRemetente: docLimpo(d.remetente?.cnpj || d.remetente?.cpf), cnpjDestinatario: docLimpo(d.destinatario?.cnpj || d.destinatario?.cpf),
  };
}

// Clientes (tomadores) com CT-e autorizado.
router.get('/transportadora/tomadores', autenticar, transportadora, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT dados, autorizado_em FROM ctes_emitidos WHERE status = 'autorizado' AND autorizado_em >= NOW() - INTERVAL '180 days'`);
    const mapa = new Map();
    rows.forEach((r) => {
      const t = tomadorDe(r.dados || {});
      if (!t.cnpj) return;
      const atual = mapa.get(t.cnpj) || { cnpj: t.cnpj, nome: t.nome, ctes: 0 };
      atual.ctes += 1; mapa.set(t.cnpj, atual);
    });
    res.json([...mapa.values()].sort((a, b) => b.ctes - a.ctes));
  } catch (err) { responderErro(res, err, 'Erro ao listar os clientes.'); }
});

// CT-e e notas do cliente no período (para escolher o que vai na fatura e nas ocorrências).
router.get('/transportadora/ctes', autenticar, transportadora, async (req, res) => {
  try {
    if (!data(req.query.de) || !data(req.query.ate)) return res.status(400).json({ erro: 'Informe o período.' });
    const rows = await ctesDoTomador(req.query.tomador, req.query.de, req.query.ate);
    res.json(rows.map((r) => {
      const c = conhecimentoEdi(r);
      return { id: r.id, serie: c.serie, numero: c.numero, emissao: r.autorizado_em, valor: c.valorFrete, destinatario: r.dados?.destinatario?.xNome || '',
        cidade: r.dados?.fim?.xMun || '', uf: r.dados?.fim?.UF || '', notas: c.notas, cnpjEmissorNf: c.cnpjEmissorNf, demonstracao: r.demonstracao };
    }));
  } catch (err) { responderErro(res, err, 'Erro ao listar os CT-e.'); }
});

async function cabecalhoTransportadora(cliente) {
  const e = await empresa();
  if (!e.cnpj) { const err = new Error('Preencha o CNPJ e a razão social da empresa em Emissão de CT-e → Configuração fiscal.'); err.status = 400; throw err; }
  return { remetente: e.razao_social, destinatario: cliente || 'CLIENTE', transportadora: { cnpj: e.cnpj, razao: e.razao_social } };
}

router.post('/transportadora/conemb', autenticar, transportadora, async (req, res) => {
  try {
    const { tomador, nome, de, ate, ids } = req.body || {};
    if (!data(de) || !data(ate)) return res.status(400).json({ erro: 'Informe o período.' });
    const rows = await ctesDoTomador(tomador, de, ate, ids);
    if (!rows.length) return res.status(404).json({ erro: 'Nenhum CT-e autorizado desse cliente no período.' });
    const texto = edi.montarConemb({ ...await cabecalhoTransportadora(nome), conhecimentos: rows.map(conhecimentoEdi) });
    log(req, 'edi_conemb', `Gerou CONEMB para ${nome || tomador} com ${rows.length} CT-e`);
    res.json({ nome: nomeArquivo('CONEMB', nome || tomador), texto, ctes: rows.length });
  } catch (err) { responderErro(res, err, 'Erro ao gerar o CONEMB.'); }
});

router.post('/transportadora/doccob', autenticar, transportadora, async (req, res) => {
  try {
    const { tomador, nome, de, ate, ids, fatura = {} } = req.body || {};
    if (!data(de) || !data(ate)) return res.status(400).json({ erro: 'Informe o período.' });
    if (!fatura.numero || !data(fatura.vencimento)) return res.status(400).json({ erro: 'Informe o número e o vencimento da fatura.' });
    const rows = await ctesDoTomador(tomador, de, ate, ids);
    if (!rows.length) return res.status(404).json({ erro: 'Nenhum CT-e autorizado para essa fatura.' });
    const ctes = rows.map(conhecimentoEdi);
    const valor = Math.round(ctes.reduce((s, c) => s + c.valorFrete, 0) * 100) / 100;
    const icms = Math.round(ctes.reduce((s, c) => s + c.valorIcms, 0) * 100) / 100;
    const texto = edi.montarDoccob({ ...await cabecalhoTransportadora(nome), cobrancas: [{
      serie: fatura.serie || '', numero: fatura.numero, emissao: data(fatura.emissao) || new Date(), vencimento: fatura.vencimento, valor, icms,
      banco: fatura.banco, agencia: soDigitos(fatura.agencia), agenciaDv: fatura.agenciaDv, conta: soDigitos(fatura.conta), contaDv: fatura.contaDv,
      conhecimentos: ctes.map((c) => ({ serie: c.serie, numero: c.numero, valorFrete: c.valorFrete, emissao: c.emissao, cnpjRemetente: c.cnpjRemetente,
        cnpjDestinatario: c.cnpjDestinatario, cnpjEmissor: '', notas: c.notas.map((n) => ({ ...n, cnpjEmissor: c.cnpjEmissorNf })) })),
    }] });
    log(req, 'edi_doccob', `Gerou DOCCOB da fatura ${fatura.numero} para ${nome || tomador}: ${rows.length} CT-e, R$ ${valor.toFixed(2)}`);
    res.json({ nome: nomeArquivo('DOCCOB', nome || tomador), texto, ctes: rows.length, valor });
  } catch (err) { responderErro(res, err, 'Erro ao gerar o DOCCOB.'); }
});

router.post('/transportadora/ocoren', autenticar, transportadora, async (req, res) => {
  try {
    const { nome, ocorrencias } = req.body || {};
    const lista = (Array.isArray(ocorrencias) ? ocorrencias : []).filter((o) => o.numero && Number.isInteger(Number(o.codigo)) && data(o.data));
    if (!lista.length) return res.status(400).json({ erro: 'Marque pelo menos uma nota com o código e a data da ocorrência.' });
    const texto = edi.montarOcoren({ ...await cabecalhoTransportadora(nome), ocorrencias: lista.map((o) => ({
      cnpjEmissorNf: o.cnpjEmissorNf, serie: o.serie, numero: Number(o.numero), codigo: Number(o.codigo), data: o.data, hora: /^\d{2}:\d{2}$/.test(o.hora || '') ? o.hora : null,
      codigoObservacao: Number(o.codigoObservacao) || 0, texto: o.texto,
    })) });
    log(req, 'edi_ocoren', `Gerou OCOREN para ${nome || 'cliente'} com ${lista.length} ocorrência(s)`);
    res.json({ nome: nomeArquivo('OCOREN', nome), texto, ocorrencias: lista.length });
  } catch (err) { responderErro(res, err, 'Erro ao gerar o OCOREN.'); }
});

// NOTFIS do cliente: mostra as notas e cria rascunhos de CT-e (um por destinatário).
router.post('/transportadora/notfis/ler', autenticar, transportadora, async (req, res) => {
  try {
    const texto = String(req.body?.texto || '');
    const tipo = edi.tipoDoArquivo(texto);
    if (tipo !== 'NOTFIS') return res.status(400).json({ erro: tipo ? `Esse arquivo é um ${tipo}. Aqui entra o NOTFIS que o cliente manda.` : 'Não reconheci o arquivo como NOTFIS (PROCEDA).' });
    const a = edi.lerNotfis(texto);
    // Chave da NF-e: do arquivo ou de um XML já importado no Nexofrete.
    for (const emb of a.embarcadores) {
      for (const d of emb.destinatarios) {
        for (const n of d.notas) {
          if (!n.chave) {
            const { rows } = await pool.query(
              `SELECT chave_nfe FROM fretes WHERE chave_nfe IS NOT NULL AND LTRIM(numero_nf, '0') = LTRIM($1, '0') AND SUBSTRING(chave_nfe FROM 7 FOR 8) = $2 LIMIT 1`,
              [String(n.numero), raiz(emb.cnpj)]);
            n.chave = rows[0]?.chave_nfe || null;
            n.chaveOrigem = n.chave ? 'xml importado' : null;
          } else n.chaveOrigem = 'arquivo';
        }
      }
    }
    res.json(a);
  } catch (err) { responderErro(res, err, 'Erro ao ler o NOTFIS.'); }
});

function pessoaCte(p, cMunFallback) {
  const mun = municipio({ ibge: soDigitos(p.codigoMunicipio), cidade: p.cidade, uf: p.uf });
  const doc = docLimpo(p.cnpj);
  return {
    ...(doc.length === 11 ? { cpf: doc } : { cnpj: doc }), ie: p.ie || null, xNome: p.razao, fone: soDigitos(p.telefone) || null,
    endereco: { xLgr: p.endereco || '', nro: 'S/N', xBairro: p.bairro || '', cMun: mun?.ibge || cMunFallback || '', xMun: mun?.nome?.toUpperCase() || p.cidade, CEP: soDigitos(p.cep), UF: mun?.uf || p.uf },
  };
}

router.post('/transportadora/notfis/rascunhos', autenticar, transportadora, async (req, res) => {
  try {
    const a = req.body?.notfis;
    if (!a?.embarcadores?.length) return res.status(400).json({ erro: 'Leia o NOTFIS antes.' });
    const { rows: emp } = await pool.query('SELECT cte_ambiente, cte_cst_padrao FROM empresa WHERE id = 1');
    const criados = [];
    for (const emb of a.embarcadores) {
      const remetente = pessoaCte(emb);
      for (const d of emb.destinatarios) {
        if (!d.notas?.length) continue;
        const destinatario = pessoaCte(d);
        const somar = (k) => d.notas.reduce((s, n) => s + (Number(n[k]) || 0), 0);
        const semChave = d.notas.filter((n) => !n.chave).map((n) => `${n.numero}${n.serie ? `/${n.serie}` : ''}`);
        const fob = d.notas.every((n) => n.condicaoFrete === 'F');
        const frete = somar('freteTotal');
        const dados = {
          tomador: fob ? '3' : '0', remetente, destinatario,
          inicio: { cMun: remetente.endereco.cMun, xMun: remetente.endereco.xMun, UF: remetente.endereco.UF },
          fim: { cMun: destinatario.endereco.cMun, xMun: destinatario.endereco.xMun, UF: destinatario.endereco.UF },
          cfop: remetente.endereco.UF && remetente.endereco.UF === destinatario.endereco.UF ? '5353' : '6353',
          valores: { vTPrest: frete || 0, componentes: frete ? [{ xNome: 'FRETE', vComp: frete }] : [] },
          icms: { cst: emp[0]?.cte_cst_padrao || '00' },
          carga: { vCarga: somar('valor'), proPred: d.notas[0].natureza || 'DIVERSOS',
            quantidades: [{ cUnid: '01', tpMed: 'PESO BRUTO', qCarga: somar('peso') }, { cUnid: '03', tpMed: 'VOLUMES', qCarga: somar('volumes') }] },
          nfes: d.notas.map((n) => n.chave).filter(Boolean),
          observacoes: `Importado do NOTFIS ${a.documento || ''}`.trim() + (semChave.length ? ` — falta a chave da NF ${semChave.join(', ')}` : ''),
        };
        const r = emissao.resumo(dados);
        const { rows } = await pool.query(
          `INSERT INTO ctes_emitidos (ambiente, dados, valor_total, tomador_nome, remetente_nome, destinatario_nome, cidade_fim, uf_fim, criado_por_nome)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [emp[0]?.cte_ambiente || 2, dados, r.valor_total, r.tomador_nome, r.remetente_nome, r.destinatario_nome, r.cidade_fim, r.uf_fim, req.usuario.nome]);
        criados.push({ id: rows[0].id, destinatario: d.razao, notas: d.notas.length, semChave });
      }
    }
    log(req, 'edi_notfis_importar', `Criou ${criados.length} rascunho(s) de CT-e a partir do NOTFIS ${a.documento || ''}`);
    res.status(201).json({ criados });
  } catch (err) { responderErro(res, err, 'Erro ao criar os rascunhos.'); }
});

module.exports = router;
