// EDI dos parceiros (redespacho) no TMS: os arquivos PROCEDA que a transportadora
// parceira manda de volta, ligados aos nossos CT-e pelas notas fiscais.
// - OCOREN: as ocorrências viram ocorrências do nosso CT-e (e o nosso cliente é avisado,
//   como numa baixa feita pelo app);
// - CONEMB: o CT-e do parceiro e o valor que ele vai cobrar, conferido com o custo
//   previsto do redespacho (dá para corrigir o custo pelo valor do parceiro);
// - DOCCOB: a fatura do parceiro conferida com a conta-corrente; registrada, vira o
//   acerto dos CT-e dela e a conta a pagar.
const pool = require('./db');
const Doc = require('./utils/documento');
const edi = require('./edi/arquivos');
const oc = require('./cte/ocorrencias');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const raiz = (d) => String(Doc.limpar(d) || '').slice(0, 8);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const dataIso = (v) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null;
};

// Código PROCEDA da ocorrência → ocorrência do nosso catálogo. 99 ("outros") só vira "saiu para entrega"
// quando o texto diz isso; o que não tem par vira "outra ocorrência" com a descrição.
const CODIGO_PARA_TIPO = { 1: 'entregue', 2: 'entregue_fora', 24: 'reentregue', 31: 'entregue', 29: 'retirou', 25: 'devolvido' };
function tipoDaOcorrencia(codigo, texto = '') {
  const c = Number(codigo);
  if (CODIGO_PARA_TIPO[c]) return CODIGO_PARA_TIPO[c];
  if (c === 99 || c === 0) return /SAIU|ROTA DE ENTREGA|EM ENTREGA/i.test(texto) ? 'saiu' : /CHEGADA|CHEGOU/i.test(texto) ? 'chegada' : 'outros';
  const doCatalogo = oc.CATALOGO.find((x) => x.codigo === c && x.id !== 'outros');
  return doCatalogo ? doCatalogo.id : 'outros';
}

async function parceiroDoCnpj(cnpj) {
  const r = raiz(cnpj);
  if (!r) return null;
  const { rows } = await pool.query(`SELECT id, nome, fantasia, documento, pix FROM parceiros WHERE LEFT(documento, 8) = $1 ORDER BY ativo DESC, id LIMIT 1`, [r]);
  return rows[0] || null;
}

// Nossos CT-e que levam a nota (número + CNPJ de quem emitiu a NF); os repassados ao parceiro primeiro.
async function ctesDaNota(numeroNf, cnpjEmissorNf, parceiroId) {
  const n = String(numeroNf || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!n) return [];
  const emissor = Doc.limpar(cnpjEmissorNf) || '';
  const { rows } = await pool.query(
    `SELECT c.id, c.serie, c.numero, c.situacao_entrega, c.destinatario_nome, c.cidade_fim, c.uf_fim,
            (SELECT r.parceiro_id FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id WHERE ri.cte_id = c.id AND r.parceiro_id IS NOT NULL ORDER BY r.id DESC LIMIT 1) AS parceiro_id
       FROM ctes_emitidos c
      WHERE c.status = 'autorizado'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.dados->'nfes', '[]'::jsonb)) k
                     WHERE LTRIM(SUBSTRING(k FROM 26 FOR 9), '0') = $1 AND ($2 = '' OR SUBSTRING(k FROM 7 FOR 14) = $2))
      ORDER BY c.id DESC LIMIT 10`, [n, emissor]);
  return rows.sort((a, b) => (b.parceiro_id === parceiroId) - (a.parceiro_id === parceiroId));
}
async function cteDoNumero(numero) {
  const n = String(numero || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!n) return null;
  const { rows } = await pool.query(`SELECT id, serie, numero, situacao_entrega, destinatario_nome, cidade_fim, uf_fim FROM ctes_emitidos WHERE status = 'autorizado' AND numero::text = $1 ORDER BY id DESC LIMIT 1`, [n]);
  return rows[0] || null;
}
// Custo do redespacho em aberto do CT-e na conta do parceiro.
async function custoAberto(parceiroId, cteId) {
  if (!parceiroId || !cteId) return null;
  const { rows } = await pool.query(`SELECT id, valor::float, status, cte_parceiro FROM parceiro_lancamentos WHERE parceiro_id = $1 AND cte_id = $2 AND tipo = 'custo' ORDER BY (status = 'aberto') DESC, id DESC LIMIT 1`, [parceiroId, cteId]);
  return rows[0] || null;
}
const resumoCte = (c) => (c ? { id: c.id, serie: c.serie, numero: c.numero, situacao: c.situacao_entrega, destinatario: c.destinatario_nome, destino: `${c.cidade_fim || ''}/${c.uf_fim || ''}`, repassado: !!c.parceiro_id } : null);

// ---------- Leitura (prévia) ----------
async function ler(texto) {
  const tipo = edi.tipoDoArquivo(texto);
  if (!tipo) throw falha('Não reconheci o arquivo: não é CONEMB, OCOREN nem DOCCOB (layout PROCEDA).');
  if (tipo === 'NOTFIS') throw falha('Esse é um NOTFIS (notas que o cliente manda para a transportadora): leia em "Do cliente".');
  if (tipo === 'OCOREN') return lerOcoren(texto);
  if (tipo === 'CONEMB') return lerConemb(texto);
  return lerDoccob(texto);
}

async function lerOcoren(texto) {
  const a = edi.lerOcoren(texto);
  const parceiro = await parceiroDoCnpj(a.transportadora.cnpj);
  const linhas = [];
  for (const o of a.ocorrencias) {
    // 343: o parceiro informou o nosso CT-e (redespacho) — vale mais que a nota.
    let cte = o.redespacho?.numeroCte ? await cteDoNumero(o.redespacho.numeroCte) : null;
    let candidatos = [];
    if (!cte) { candidatos = await ctesDaNota(o.numero, o.cnpjEmissorNf, parceiro?.id); cte = candidatos[0] || null; }
    const tipoId = tipoDaOcorrencia(o.codigo, o.texto);
    const item = oc.PORID.get(tipoId);
    const quando = o.data ? `${dataIso(o.data)}T${o.hora || '12:00'}` : null;
    let acao = 'lancar'; let motivo = null;
    if (!cte) { acao = 'sem_cte'; motivo = 'Nenhum CT-e nosso com esta nota.'; }
    else if (!quando) { acao = 'sem_data'; motivo = 'Ocorrência sem data.'; }
    else if (['entregue', 'devolvido'].includes(cte.situacao_entrega) && ['entrega', 'devolucao'].includes(item.tipo)) { acao = 'ja_feita'; motivo = `O CT-e já está ${cte.situacao_entrega}.`; }
    else {
      const { rowCount } = await pool.query(`SELECT 1 FROM cte_ocorrencias WHERE cte_id = $1 AND codigo = $2 AND data_hora = $3::timestamp`, [cte.id, item.codigo, quando.replace('T', ' ')]);
      if (rowCount) { acao = 'ja_feita'; motivo = 'Esta ocorrência já foi lançada.'; }
    }
    linhas.push({ nf: o.numero, serie_nf: o.serie, codigo: o.codigo, descricao: o.descricao, texto: o.texto || '', data_hora: quando, entregue: o.entregue,
      tipo_id: tipoId, tipo_nome: item.rotulo, cte: resumoCte(cte), outros_ctes: candidatos.length > 1 ? candidatos.length - 1 : 0, acao, motivo });
  }
  return { tipo: 'OCOREN', parceiro, transportadora: a.transportadora, cabecalho: { data: a.data, documento: a.documento }, linhas, avisos: a.avisos };
}

async function lerConemb(texto) {
  const a = edi.lerConemb(texto);
  const parceiro = await parceiroDoCnpj(a.transportadora.cnpj);
  const linhas = [];
  for (const c of a.conhecimentos) {
    let nosso = null;
    for (const n of c.notas) { [nosso] = await ctesDaNota(n.numero, c.cnpjEmissorNf, parceiro?.id); if (nosso) break; }
    const custo = parceiro && nosso ? await custoAberto(parceiro.id, nosso.id) : null;
    const valor = centavos(c.valorFrete);
    linhas.push({ serie: c.serie, numero: c.numero, chave: c.chaveCte || null, emissao: dataIso(c.emissao), valor, notas: c.notas.map((n) => n.numero), cte: resumoCte(nosso),
      custo: custo ? { id: custo.id, valor: custo.valor, status: custo.status } : null, diferenca: custo ? centavos(valor - custo.valor) : null,
      acao: !nosso ? 'sem_cte' : !custo ? 'sem_custo' : custo.status !== 'aberto' ? 'acertado' : Math.abs(valor - custo.valor) > 0.009 ? 'ajustar' : 'confere' });
  }
  return { tipo: 'CONEMB', parceiro, transportadora: a.transportadora, cabecalho: { data: a.data, documento: a.documento }, linhas, totais: a.totais, avisos: a.avisos };
}

async function lerDoccob(texto) {
  const a = edi.lerDoccob(texto);
  const parceiro = await parceiroDoCnpj(a.transportadora.cnpj);
  const faturas = [];
  for (const f of a.cobrancas) {
    const numero = String(f.numero || '').trim();
    const { rows: ja } = parceiro ? await pool.query('SELECT id FROM parceiro_acertos WHERE parceiro_id = $1 AND documento = $2', [parceiro.id, numero]) : { rows: [] };
    const ctes = [];
    for (const c of f.conhecimentos) {
      let nosso = null;
      for (const n of c.notas) { [nosso] = await ctesDaNota(n.numero, n.cnpjEmissor || c.cnpjRemetente, parceiro?.id); if (nosso) break; }
      const custo = parceiro && nosso ? await custoAberto(parceiro.id, nosso.id) : null;
      ctes.push({ serie: c.serie, numero: c.numero, valor: centavos(c.valorFrete), notas: c.notas.map((n) => n.numero), cte: resumoCte(nosso),
        custo: custo ? { id: custo.id, valor: custo.valor, status: custo.status } : null });
    }
    const emAberto = ctes.filter((c) => c.custo?.status === 'aberto');
    const previsto = centavos(emAberto.reduce((s, c) => s + c.custo.valor, 0));
    faturas.push({ numero, serie: f.serie, emissao: dataIso(f.emissao), vencimento: dataIso(f.vencimento), valor: centavos(f.valor),
      banco: [f.banco, f.agencia ? `ag. ${f.agencia}${f.agenciaDv ? `-${f.agenciaDv}` : ''}` : '', f.conta ? `c/c ${f.conta}${f.contaDv ? `-${f.contaDv}` : ''}` : ''].filter(Boolean).join(' · '),
      ctes, previsto, diferenca: centavos(Number(f.valor) - previsto), ja_registrada: !!ja[0],
      sem_custo: ctes.filter((c) => !c.custo).length, ja_acertados: ctes.filter((c) => c.custo && c.custo.status !== 'aberto').length });
  }
  return { tipo: 'DOCCOB', parceiro, transportadora: a.transportadora, cabecalho: { data: a.data, documento: a.documento }, faturas, avisos: a.avisos };
}

// ---------- Aplicar ----------
// itens: [{ cte_id, tipo_id, data_hora "AAAA-MM-DDTHH:MM", texto, nf }]
async function aplicarOcoren(itens, { parceiroNome, usuarioNome }) {
  const lista = (Array.isArray(itens) ? itens : []).filter((i) => Number.isInteger(Number(i.cte_id)) && oc.PORID.get(i.tipo_id));
  if (!lista.length) throw falha('Nenhuma ocorrência para lançar.');
  const lancadas = []; const puladas = []; const erros = [];
  for (const i of lista) {
    const item = oc.PORID.get(i.tipo_id);
    const quem = parceiroNome ? `parceiro ${parceiroNome}` : 'parceiro (EDI)';
    const corpo = {
      tipo_id: i.tipo_id, data_hora: String(i.data_hora || '').slice(0, 16),
      observacao: `OCOREN do ${quem}${i.nf ? ` · NF ${i.nf}` : ''}${i.texto ? ` · ${String(i.texto).slice(0, 200)}` : ''}`,
      recebedor_nome: item.pedeRecebedor ? `Conforme ${quem}` : undefined,
    };
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const { rows: [c] } = await cliente.query('SELECT situacao_entrega FROM ctes_emitidos WHERE id = $1 FOR UPDATE', [Number(i.cte_id)]);
      const { rowCount: dup } = await cliente.query(`SELECT 1 FROM cte_ocorrencias WHERE cte_id = $1 AND codigo = $2 AND data_hora = $3::timestamp`, [Number(i.cte_id), item.codigo, corpo.data_hora.replace('T', ' ')]);
      if (dup || (['entregue', 'devolvido'].includes(c?.situacao_entrega) && ['entrega', 'devolucao'].includes(item.tipo))) { await cliente.query('ROLLBACK'); puladas.push(i.cte_id); continue; }
      lancadas.push(await oc.lancarOcorrencia(cliente, { cteId: Number(i.cte_id), corpo, usuarioNome: `EDI ${quem}`.slice(0, 150), origem: 'edi' }));
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      puladas.push(i.cte_id);
      erros.push({ nf: i.nf || null, cte_id: Number(i.cte_id), motivo: e.message });
      if (!e.status) console.error('[edi parceiro]', e.message);
    } finally { cliente.release(); }
  }
  if (lancadas.length) oc.depoisDeLancar(lancadas);
  return { lancadas: lancadas.length, puladas: puladas.length, erros };
}

// CONEMB: o custo previsto passa a ser o valor do CT-e do parceiro. itens: [{ lancamento_id, valor, cte_parceiro }]
async function aplicarConemb(parceiroId, itens) {
  let feitos = 0;
  for (const i of Array.isArray(itens) ? itens : []) {
    const { rowCount } = await pool.query(
      `UPDATE parceiro_lancamentos SET valor = $3, cte_parceiro = $4, descricao = COALESCE(descricao, '') || $5
        WHERE id = $1 AND parceiro_id = $2 AND tipo = 'custo' AND status = 'aberto'`,
      [Number(i.lancamento_id), parceiroId, centavos(i.valor), String(i.cte_parceiro || '').slice(0, 60) || null, ` · valor do CT-e ${String(i.cte_parceiro || '').slice(0, 30)} do parceiro (CONEMB)`]);
    feitos += rowCount;
  }
  return { ajustados: feitos };
}

// DOCCOB: registra a fatura do parceiro. Os custos dos CT-e dela entram num acerto, a diferença entre a
// fatura e o previsto vira um ajuste, e a fatura vira conta a pagar (frete de terceiro).
async function registrarFatura(parceiroId, f, lancamentoIds, usuarioNome) {
  const numero = String(f.numero || '').trim().slice(0, 40);
  if (!numero) throw falha('Fatura sem número.');
  const valor = centavos(f.valor);
  if (!(valor > 0)) throw falha('Fatura sem valor.');
  const venc = dataIso(f.vencimento) || hojeBr();
  const ids = [...new Set((lancamentoIds || []).map(Number).filter(Number.isInteger))];
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [p] } = await cliente.query('SELECT * FROM parceiros WHERE id = $1 FOR UPDATE', [parceiroId]);
    if (!p) throw falha('Parceiro não encontrado: cadastre a transportadora em Parceiros e redespacho.', 404);
    const { rows: ja } = await cliente.query('SELECT id FROM parceiro_acertos WHERE parceiro_id = $1 AND documento = $2', [p.id, numero]);
    if (ja[0]) throw falha(`A fatura ${numero} deste parceiro já foi registrada.`, 409);
    const { rows: custos } = await cliente.query(`SELECT id, valor FROM parceiro_lancamentos WHERE id = ANY($1::int[]) AND parceiro_id = $2 AND tipo = 'custo' AND status = 'aberto' FOR UPDATE`, [ids, p.id]);
    const previsto = centavos(custos.reduce((s, l) => s + Number(l.valor), 0));
    const dif = centavos(valor - previsto);
    const data = dataIso(f.emissao) || hojeBr();
    const [conta] = await require('./contasPagar').criar({
      descricao: `Fatura ${numero} — ${p.fantasia || p.nome} (redespacho)`.slice(0, 200), categoria: 'frete_terceiro', fornecedor_nome: p.nome, fornecedor_doc: p.documento,
      documento: `Fatura ${numero}`.slice(0, 60), competencia: data, vencimento: venc, valor, parcelas: 1,
      observacao: [f.banco ? `Pagar em: ${f.banco}` : null, p.pix ? `PIX do parceiro: ${p.pix}` : null, `Fatura recebida por EDI (DOCCOB): ${custos.length} CT-e.`].filter(Boolean).join('\n'),
    }, usuarioNome, { cliente });
    const { rows: [a] } = await cliente.query('INSERT INTO parceiro_acertos (parceiro_id, ate, saldo, conta_pagar_id, usuario_nome, documento) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [p.id, data, valor, conta.id, usuarioNome, numero]);
    await cliente.query(`UPDATE parceiro_lancamentos SET status = 'acertado', acerto_id = $2 WHERE id = ANY($1::int[])`, [custos.map((l) => l.id), a.id]);
    if (dif) {
      await cliente.query(`INSERT INTO parceiro_lancamentos (parceiro_id, data, tipo, valor, descricao, status, acerto_id, usuario_nome) VALUES ($1, $2, 'ajuste', $3, $4, 'acertado', $5, $6)`,
        [p.id, data, dif, `Diferença da fatura ${numero} (DOCCOB) sobre o custo previsto`, a.id, usuarioNome]);
    }
    await cliente.query('COMMIT');
    return { acerto_id: a.id, conta_pagar_id: conta.id, ctes: custos.length, previsto, diferenca: dif, parceiro: p.nome };
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') throw falha(`A fatura ${numero} deste parceiro já foi registrada.`, 409);
    throw e;
  } finally { cliente.release(); }
}

module.exports = { tipoDaOcorrencia, ler, aplicarOcoren, aplicarConemb, registrarFatura };
