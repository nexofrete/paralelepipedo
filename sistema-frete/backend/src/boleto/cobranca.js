// Cobrança por boleto registrado: gera o boleto da fatura, monta a remessa
// CNAB 240 (entradas e pedidos de baixa) e processa o retorno do banco
// (confirmação, rejeição, pagamento → baixa da fatura, baixa).
const pool = require('../db');
const bol = require('./boleto');
const cnab = require('./cnab240');
const fat = require('../faturamento/faturamento');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const iso = (v) => (v instanceof Date ? v.toISOString() : String(v || '')).slice(0, 10);
const CAMPOS_CFG = ['banco', 'agencia', 'agencia_dv', 'conta', 'conta_dv', 'carteira', 'carteira_cnab', 'convenio', 'modalidade', 'juros_mes', 'multa', 'protesto_dias',
  'baixa_dias', 'instrucoes', 'layout_arquivo', 'layout_lote', 'local_pagamento'];

async function empresa() { return (await pool.query('SELECT * FROM empresa WHERE id = 1')).rows[0] || {}; }

async function config() {
  const e = await empresa();
  const c = e.boleto_config || {};
  return { ...c, banco_nome: bol.BANCOS[c.banco]?.nome || null, proximo_nn: Number(e.boleto_proximo_nn), proximo_nsa: Number(e.boleto_proximo_nsa),
    bancos: Object.fromEntries(Object.entries(bol.BANCOS).map(([k, b]) => [k, { nome: b.nome, carteira: b.carteira }])) };
}

async function salvarConfig(b = {}) {
  const c = Object.fromEntries(CAMPOS_CFG.map((k) => [k, String(b[k] ?? '').trim().slice(0, k === 'instrucoes' ? 400 : 60) || null]));
  c.banco = bol.pad(c.banco, 3);
  if (!bol.BANCOS[c.banco]) throw falha('Escolha o banco.');
  if (!bol.so(c.agencia) || !bol.so(c.conta)) throw falha('Informe a agência e a conta.');
  if (['001', '033', '104', '756'].includes(c.banco) && !bol.so(c.convenio)) throw falha(`Informe o ${c.banco === '001' ? 'convênio' : 'código do beneficiário'} (está no contrato de cobrança).`);
  ['juros_mes', 'multa'].forEach((k) => { c[k] = c[k] ? Math.max(0, Math.min(Number(String(c[k]).replace(',', '.')) || 0, 20)) : 0; });
  ['protesto_dias', 'baixa_dias'].forEach((k) => { c[k] = Math.max(0, Math.min(parseInt(c[k], 10) || 0, 99)); });
  // Teste: monta um boleto de mentira para conferir se a configuração fecha.
  bol.montar(c, { sequencial: 1, vencimento: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), valor: 1 });
  await pool.query('INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const pares = [['boleto_config', c]];
  if (parseInt(b.proximo_nn, 10) > 0) pares.push(['boleto_proximo_nn', parseInt(b.proximo_nn, 10)]);
  if (parseInt(b.proximo_nsa, 10) > 0) pares.push(['boleto_proximo_nsa', parseInt(b.proximo_nsa, 10)]);
  await pool.query(`UPDATE empresa SET ${pares.map(([k], i) => `${k} = $${i + 1}`).join(', ')} WHERE id = 1`, pares.map(([, v]) => v));
  return config();
}

// Quem paga: o tomador do 1º CT-e da fatura (com endereço); senão o cadastro de clientes.
async function pagador(f) {
  const { rows } = await pool.query('SELECT dados FROM ctes_emitidos WHERE fatura_id = $1 ORDER BY numero LIMIT 1', [f.id]);
  const d = rows[0]?.dados || {};
  const t = rows[0] ? { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || null : null;
  const e = t?.endereco || {};
  if (t && e.xLgr) {
    return { doc: f.tomador_doc, nome: t.xNome || f.tomador_nome, endereco: [e.xLgr, e.nro, e.xCpl].filter(Boolean).join(', '), bairro: e.xBairro, cep: e.CEP, cidade: e.xMun, uf: e.UF };
  }
  const { rows: k } = await pool.query('SELECT * FROM clientes WHERE documento = $1', [f.tomador_doc]);
  const c = k[0] || {};
  return { doc: f.tomador_doc, nome: f.tomador_nome || c.razao_social, endereco: [c.logradouro, c.numero, c.complemento].filter(Boolean).join(', '), bairro: c.bairro, cep: c.cep, cidade: c.municipio, uf: c.uf };
}

const ATIVO = ['gerado', 'remetido', 'registrado'];

async function gerar(faturaId) {
  const f = await fat.carregar(faturaId);
  if (!f) throw falha('Fatura não encontrada.', 404);
  if (!['aberta', 'parcial'].includes(f.status)) throw falha('Só dá para gerar boleto de fatura em aberto.');
  if (ATIVO.includes(f.boleto_status)) return f;   // já tem boleto valendo
  if (iso(f.vencimento) < fat.hoje()) throw falha('A fatura está vencida: altere o vencimento antes de gerar o boleto.');
  const e = await empresa();
  const cfg = e.boleto_config;
  if (!cfg?.banco) throw falha('Configure o boleto (banco, agência, conta, convênio) em Faturamento → Configuração.');
  const p = await pagador(f);
  if (!p.endereco || !bol.so(p.cep)) throw falha('O tomador está sem endereço/CEP (o banco recusa o boleto). Complete o cadastro do cliente.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('UPDATE empresa SET boleto_proximo_nn = boleto_proximo_nn + 1 WHERE id = 1 RETURNING boleto_proximo_nn - 1 AS seq');
    const b = bol.montar(cfg, { sequencial: rows[0].seq, vencimento: iso(f.vencimento), valor: f.saldo });
    await cliente.query(
      `UPDATE faturas_transporte SET boleto_banco = $2, boleto_nosso_numero = $3, boleto_nn_exibir = $4, boleto_linha = $5, boleto_codigo = $6, boleto_valor = $7,
              boleto_vencimento = $8, boleto_status = 'gerado', boleto_mensagem = NULL, boleto_remessa_id = NULL WHERE id = $1`,
      [faturaId, bol.pad(cfg.banco, 3), `${b.nossoNumero.numero}${b.nossoNumero.dv || ''}`, b.nossoNumero.exibir, b.linhaDigitavel, b.codigoBarras, f.saldo, iso(f.vencimento)]);
    await cliente.query('COMMIT');
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
  return fat.carregar(faturaId);
}

// Fatura cancelada (ou paga por fora) com boleto no banco: pede a baixa na próxima remessa.
async function pedirBaixa(faturaId) {
  await pool.query(`UPDATE faturas_transporte SET boleto_status = CASE WHEN boleto_status = 'gerado' THEN 'baixado' ELSE 'baixar' END
     WHERE id = $1 AND boleto_status IN ('gerado', 'remetido', 'registrado')`, [faturaId]);
}

async function pendentesRemessa() {
  const { rows } = await pool.query(
    `SELECT id, numero, tomador_nome, boleto_nn_exibir, boleto_valor, boleto_vencimento, boleto_status FROM faturas_transporte
      WHERE boleto_status IN ('gerado', 'baixar') ORDER BY id`);
  return rows;
}

async function gerarRemessa(usuarioNome) {
  const e = await empresa();
  const cfg = e.boleto_config;
  if (!cfg?.banco) throw falha('Configure o boleto primeiro.');
  const { rows } = await pool.query(`SELECT * FROM faturas_transporte WHERE boleto_status IN ('gerado', 'baixar') AND boleto_banco = $1 ORDER BY id`, [bol.pad(cfg.banco, 3)]);
  if (!rows.length) throw falha('Nenhum boleto novo nem pedido de baixa para mandar ao banco.');
  const titulos = [];
  for (const f of rows) {
    titulos.push({ movimento: f.boleto_status === 'baixar' ? '02' : '01', nossoNumero: f.boleto_nosso_numero, documento: `FAT${f.numero}`, vencimento: iso(f.boleto_vencimento),
      valor: Number(f.boleto_valor), emissao: iso(f.emissao), usoEmpresa: `FAT${f.id}`, pagador: await pagador(f) });
  }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: n } = await cliente.query('UPDATE empresa SET boleto_proximo_nsa = boleto_proximo_nsa + 1 WHERE id = 1 RETURNING boleto_proximo_nsa - 1 AS nsa');
    const nsa = n[0].nsa;
    const conteudo = cnab.remessa({ ...cfg, banco_nome: bol.BANCOS[cfg.banco]?.nome }, e, titulos, { nsa });
    const total = titulos.filter((t) => t.movimento === '01').reduce((s, t) => s + t.valor, 0);
    const nome = `REM${bol.pad(cfg.banco, 3)}_${String(nsa).padStart(6, '0')}.rem`;
    const { rows: arq } = await cliente.query(
      `INSERT INTO boleto_arquivos (tipo, banco, nsa, nome_arquivo, conteudo, qtd, valor_total, usuario_nome) VALUES ('remessa', $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [bol.pad(cfg.banco, 3), nsa, nome, conteudo, titulos.length, total, usuarioNome]);
    await cliente.query(`UPDATE faturas_transporte SET boleto_status = CASE boleto_status WHEN 'baixar' THEN 'baixa_pedida' ELSE 'remetido' END, boleto_remessa_id = $2
      WHERE id = ANY($1::int[])`, [rows.map((f) => f.id), arq[0].id]);
    await cliente.query('COMMIT');
    return { id: arq[0].id, nome, conteudo, qtd: titulos.length, entradas: titulos.filter((t) => t.movimento === '01').length, baixas: titulos.filter((t) => t.movimento === '02').length, total };
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

// Acha a fatura do título do retorno: pelo nosso número (o banco pode mandar com
// zeros à esquerda e/ou com o DV) ou pelo "uso da empresa" (FAT<id>).
async function faturaDoTitulo(t) {
  const r = bol.so(t.nossoNumero).replace(/^0+/, '');
  if (r) {
    const { rows } = await pool.query(`SELECT * FROM faturas_transporte WHERE boleto_banco = $1 AND boleto_nosso_numero IS NOT NULL`, [t.banco]);
    const achada = rows.find((f) => {
      const s = bol.so(f.boleto_nosso_numero).replace(/^0+/, '');
      const semDv = s.slice(0, -1);
      return s === r || (r.startsWith(s) && r.length - s.length <= 1) || (semDv && (r === semDv || (r.startsWith(semDv) && r.length - semDv.length <= 1)));
    });
    if (achada) return achada;
  }
  const m = /^FAT(\d+)$/.exec(String(t.usoEmpresa || '').trim());
  if (m) return (await pool.query('SELECT * FROM faturas_transporte WHERE id = $1', [m[1]])).rows[0] || null;
  return null;
}

async function processarRetorno(texto, { nomeArquivo, usuarioNome }) {
  const { banco, titulos } = cnab.lerRetorno(texto);
  const resultado = [];
  for (const t of titulos) {
    const f = await faturaDoTitulo(t);
    const item = { nossoNumero: t.nossoNumero, ocorrencia: t.ocorrencia, descricao: t.descricao, valorPago: t.valorPago || 0, fatura: f ? f.numero : null, acao: '' };
    if (!f) { item.acao = 'Título não encontrado nas faturas'; resultado.push(item); continue; }
    if (t.ocorrencia === '02') {
      await pool.query(`UPDATE faturas_transporte SET boleto_status = 'registrado', boleto_mensagem = NULL WHERE id = $1 AND boleto_status IN ('gerado', 'remetido')`, [f.id]);
      item.acao = 'Boleto registrado no banco';
    } else if (['03', '26', '30'].includes(t.ocorrencia)) {
      const msg = `${t.descricao}${t.motivos ? ` (motivos ${t.motivos})` : ''}`;
      await pool.query(`UPDATE faturas_transporte SET boleto_status = CASE WHEN $3 = '03' THEN 'rejeitado' ELSE boleto_status END, boleto_mensagem = $2 WHERE id = $1`, [f.id, msg.slice(0, 250), t.ocorrencia]);
      item.acao = `Rejeitado: confira o motivo ${t.motivos || ''} no manual do banco`;
    } else if (['06', '17'].includes(t.ocorrencia)) {
      const marca = `[boleto ${f.boleto_nn_exibir || t.nossoNumero} ${t.dataOcorrencia || ''}]`;
      const { rowCount: ja } = await pool.query('SELECT 1 FROM faturas_transporte_pagamentos WHERE fatura_id = $1 AND observacao LIKE $2', [f.id, `%${marca}%`]);
      if (ja) item.acao = 'Pagamento já baixado antes (arquivo repetido)';
      else if (['paga', 'cancelada'].includes(f.status)) item.acao = `Pago no banco, mas a fatura está ${f.status}: confira`;
      else {
        const valor = t.valorPago || t.valorTitulo;
        await fat.receber(f.id, { data: t.dataCredito || t.dataOcorrencia, valor, forma: 'boleto', usuarioNome: usuarioNome || 'Retorno do banco',
          observacao: `${marca}${t.juros ? ` juros/multa R$ ${t.juros.toFixed(2)}` : ''}${t.tarifa ? ` · tarifa R$ ${t.tarifa.toFixed(2)}` : ''}` });
        item.acao = `Fatura ${f.numero} baixada: R$ ${valor.toFixed(2)}`;
      }
      await pool.query(`UPDATE faturas_transporte SET boleto_status = 'pago' WHERE id = $1`, [f.id]);
    } else if (['09', '25'].includes(t.ocorrencia)) {
      await pool.query(`UPDATE faturas_transporte SET boleto_status = 'baixado' WHERE id = $1 AND boleto_status <> 'pago'`, [f.id]);
      item.acao = 'Boleto baixado no banco';
    } else item.acao = 'Só informativo';
    resultado.push(item);
  }
  const pagos = resultado.filter((r) => /baixada/.test(r.acao));
  await pool.query(
    `INSERT INTO boleto_arquivos (tipo, banco, nome_arquivo, conteudo, qtd, valor_total, resultado, usuario_nome) VALUES ('retorno', $1, $2, $3, $4, $5, $6, $7)`,
    [banco, String(nomeArquivo || 'retorno.ret').slice(0, 120), texto, titulos.length, pagos.reduce((s, r) => s + r.valorPago, 0), JSON.stringify(resultado), usuarioNome]);
  return { banco, titulos: titulos.length, pagos: pagos.length, valorPago: pagos.reduce((s, r) => s + r.valorPago, 0), resultado };
}

module.exports = { config, salvarConfig, gerar, pedirBaixa, pendentesRemessa, gerarRemessa, processarRetorno, pagador, ATIVO };
