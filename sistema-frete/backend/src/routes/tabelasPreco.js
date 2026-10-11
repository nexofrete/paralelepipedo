const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const { calcularFreteBase, calcularComponentesEValorTotal, buscarTodosTrechosAtivos, encontrarTrechoPorCidade } = require('../calculoFrete');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const CAMPOS_TABELA = [
  'transportadora_id', 'nome', 'uf_destino', 'cidade_destino', 'tipo_frete',
  'valor_minimo', 'excedente_por_kg', 'ad_valorem_percentual', 'gris_percentual',
  'pedagio', 'tde', 'prazo_dias', 'ativa', 'observacoes',
  'despacho_valor', 'cubagem_kg_m3', 'devolucao_percentual', 'reentrega_percentual',
  'seguradora', 'condicao_faturamento', 'indice_correcao', 'validade_meses',
  'gris_minimo', 'tda', 'trt', 'valor_pallet',
  'descarga_valor', 'descarga_modo', 'descarga_minimo', 'descarga_aplicar', 'descarga_clientes',
  'icms_incluir', 'icms_aliquota', 'icms_modo', 'retorno_percentual',
];

// Busca uma tabela de preço com suas faixas de peso já juntas.
async function buscarComFaixas(id) {
  const { rows: tabelas } = await pool.query('SELECT * FROM tabelas_preco WHERE id = $1', [id]);
  if (!tabelas[0]) return null;
  const { rows: faixas } = await pool.query(
    'SELECT * FROM tabela_preco_faixas WHERE tabela_preco_id = $1 ORDER BY ordem ASC, peso_de ASC',
    [id]
  );
  return { ...tabelas[0], faixas };
}

async function salvarFaixas(tabelaId, faixas) {
  await pool.query('DELETE FROM tabela_preco_faixas WHERE tabela_preco_id = $1', [tabelaId]);
  if (!Array.isArray(faixas)) return;
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i];
    if (f.valor_por_kg === '' || f.valor_por_kg == null) continue;
    await pool.query(
      `INSERT INTO tabela_preco_faixas
         (tabela_preco_id, peso_de, peso_ate, valor_por_kg, origem, destino, tipo_carga, frete_minimo, volume_minimo, prazo_dias, cidades, ordem, modo_calculo, valor_kg_excedente, regiao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [tabelaId, f.peso_de || null, f.peso_ate || null, f.valor_por_kg || null,
       f.origem || null, f.destino || null, f.tipo_carga || null, f.frete_minimo || null,
       f.volume_minimo || null, f.prazo_dias || null, f.cidades || null, i,
       f.modo_calculo || 'volume', f.valor_kg_excedente || null, f.regiao || null]
    );
  }
}

// GET /api/tabelas-preco?transportadora_id=123
router.get('/', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const { transportadora_id } = req.query;
    const condicoes = [];
    const valores = [];
    if (transportadora_id) {
      valores.push(transportadora_id);
      condicoes.push(`tp.transportadora_id = $${valores.length}`);
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT tp.*, t.razao_social AS transportadora_nome,
              (SELECT COUNT(*) FROM tabela_preco_faixas f WHERE f.tabela_preco_id = tp.id)::int AS total_faixas
       FROM tabelas_preco tp
       JOIN transportadoras t ON t.id = tp.transportadora_id
       ${where}
       ORDER BY t.razao_social ASC, tp.nome ASC`,
      valores
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar tabelas de preço.' });
  }
});

// POST /api/tabelas-preco/calcular-completo
// Calcula o Frete Base + Ad Valorem + GRIS + Pedágio + Taxas pra um trecho
// específico, já escolhido — usado pelo botão "Calcular e preencher".
router.post('/calcular-completo', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  try {
    const { trecho_id, qtd_volumes, peso_kg, cubagem_m3, valor_faturado } = req.body;
    const { rows } = await pool.query(
      `SELECT f.*, tp.id AS tabela_preco_id, tp.nome AS tabela_nome,
              tp.ad_valorem_percentual, tp.gris_percentual, tp.gris_minimo,
              tp.pedagio AS tabela_pedagio, tp.tde AS tabela_tde, tp.tda AS tabela_tda,
              tp.trt AS tabela_trt, tp.despacho_valor, tp.cubagem_kg_m3, tp.descarga_valor, tp.descarga_modo, tp.descarga_minimo, tp.descarga_aplicar, tp.descarga_clientes, tp.icms_incluir, tp.icms_aliquota, tp.icms_modo,
              t.razao_social AS transportadora_nome
       FROM tabela_preco_faixas f
       JOIN tabelas_preco tp ON tp.id = f.tabela_preco_id
       JOIN transportadoras t ON t.id = tp.transportadora_id
       WHERE f.id = $1`,
      [trecho_id]
    );
    const trecho = rows[0];
    if (!trecho) return res.status(404).json({ erro: 'Trecho não encontrado.' });

    const { freteBase, explicacao, modo, taxaAplicada } = calcularFreteBase(trecho, { qtdVolumes: qtd_volumes, pesoKg: peso_kg, cubagemM3: cubagem_m3 });
    const componentes = calcularComponentesEValorTotal(trecho, freteBase, { valorFaturado: valor_faturado, pesoKg: peso_kg });

    res.json({ trecho, freteBase, explicacao, modo, componentes, taxaAplicada });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao calcular o frete.' });
  }
});

// GET /api/tabelas-preco/trechos/buscar?transportadora_nome=...
// Usada na tela de edição de registro, pra calcular o Valor Frete Tabelado.
router.get('/trechos/buscar', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  try {
    const { transportadora_nome } = req.query;
    if (!transportadora_nome) {
      return res.status(400).json({ erro: 'Informe o nome da transportadora.' });
    }
    const { rows } = await pool.query(
      `SELECT f.*, tp.nome AS tabela_nome, t.razao_social AS transportadora_nome
       FROM tabela_preco_faixas f
       JOIN tabelas_preco tp ON tp.id = f.tabela_preco_id
       JOIN transportadoras t ON t.id = tp.transportadora_id
       WHERE tp.ativa = TRUE AND t.razao_social ILIKE $1
       ORDER BY f.destino ASC, f.tipo_carga ASC`,
      [`%${transportadora_nome}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar trechos da transportadora.' });
  }
});

// GET /api/tabelas-preco/:id  (com as faixas de peso)
// GET /api/tabelas-preco/impressao?transportadora_id=&tabela_id=&apenas_ativas=1
// Tudo o que vai no relatório impresso das tabelas: transportadoras, tabelas,
// taxas e trechos (e os dados da empresa pro cabeçalho).
router.get('/impressao', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const cond = [];
    const val = [];
    if (req.query.transportadora_id) { val.push(req.query.transportadora_id); cond.push(`tp.transportadora_id = $${val.length}`); }
    if (req.query.tabela_id) { val.push(req.query.tabela_id); cond.push(`tp.id = $${val.length}`); }
    if (req.query.apenas_ativas === '1') cond.push('tp.ativa = TRUE');
    const { rows: tabelas } = await pool.query(
      `SELECT tp.*, t.razao_social AS transportadora_nome, t.cnpj AS transportadora_cnpj, t.telefone AS transportadora_telefone,
              t.municipio AS transportadora_municipio, t.uf AS transportadora_uf
         FROM tabelas_preco tp JOIN transportadoras t ON t.id = tp.transportadora_id
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY t.razao_social, tp.ativa DESC, tp.nome`, val);
    const ids = tabelas.map((t) => t.id);
    const { rows: faixas } = ids.length
      ? await pool.query(`SELECT * FROM tabela_preco_faixas WHERE tabela_preco_id = ANY($1) ORDER BY tabela_preco_id, ordem, destino, tipo_carga, peso_de`, [ids])
      : { rows: [] };
    const { rows: emp } = await pool.query('SELECT razao_social, nome_fantasia, cnpj FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
    tabelas.forEach((t) => { t.faixas = faixas.filter((f) => f.tabela_preco_id === t.id); });
    res.json({ empresa: emp[0] || null, tabelas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao montar o relatório das tabelas de preço.' });
  }
});

// /:id só aceita número: sem isso, "/comparar" e "/simulador" (declaradas
// mais abaixo) caíam aqui como se fossem o id de uma tabela e davam erro.
router.get('/:id(\\d+)', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const tabela = await buscarComFaixas(req.params.id);
    if (!tabela) return res.status(404).json({ erro: 'Tabela de preço não encontrada.' });
    res.json(tabela);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar a tabela de preço.' });
  }
});

// POST /api/tabelas-preco   Corpo: { ...campos da tabela, faixas: [{peso_de, peso_ate, valor_por_kg}, ...] }
router.post('/', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    if (!req.body.transportadora_id || !req.body.nome) {
      return res.status(400).json({ erro: 'Informe a transportadora e o nome da tabela.' });
    }
    const campos = Object.keys(req.body).filter((c) => CAMPOS_TABELA.includes(c) && req.body[c] !== '');
    const valores = campos.map((c) => req.body[c]);
    const placeholders = campos.map((_, i) => `$${i + 1}`);

    const { rows } = await pool.query(
      `INSERT INTO tabelas_preco (${campos.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      valores
    );
    await salvarFaixas(rows[0].id, req.body.faixas);

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'criar_tabela_preco',
      detalhes: `Criou a tabela de preço "${rows[0].nome}"`,
    });
    res.status(201).json(await buscarComFaixas(rows[0].id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar tabela de preço.' });
  }
});

// PUT /api/tabelas-preco/:id
router.put('/:id(\\d+)', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    // Guarda uma "foto" de como a tabela estava ANTES dessa edição — assim
    // um frete antigo sempre pode ser conferido com o preço que valia na
    // época, mesmo depois de a tabela mudar várias vezes.
    const estadoAntes = await buscarComFaixas(req.params.id);
    if (estadoAntes) {
      await pool.query(
        `INSERT INTO tabelas_preco_versoes (tabela_preco_id, dados_json, usuario_nome) VALUES ($1, $2, $3)`,
        [req.params.id, JSON.stringify(estadoAntes), req.usuario.nome]
      );
    }

    const campos = Object.keys(req.body).filter((c) => CAMPOS_TABELA.includes(c));
    if (campos.length > 0) {
      const sets = campos.map((c, i) => `${c} = $${i + 1}`);
      const valores = campos.map((c) => (req.body[c] === '' ? null : req.body[c]));
      valores.push(req.params.id);
      const { rows } = await pool.query(
        `UPDATE tabelas_preco SET ${sets.join(', ')}, atualizado_em = NOW() WHERE id = $${valores.length} RETURNING *`,
        valores
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Tabela de preço não encontrada.' });
    }
    if (req.body.faixas !== undefined) {
      await salvarFaixas(req.params.id, req.body.faixas);
    }

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_tabela_preco',
      detalhes: `Editou a tabela de preço #${req.params.id}`,
    });
    res.json(await buscarComFaixas(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar tabela de preço.' });
  }
});

// DELETE /api/tabelas-preco/:id
router.delete('/:id(\\d+)', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    await pool.query('DELETE FROM tabelas_preco WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir tabela de preço.' });
  }
});

// GET /api/tabelas-preco/:id/versoes — lista as fotos antigas dessa tabela.
router.get('/:id/versoes', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, usuario_nome, criado_em FROM tabelas_preco_versoes
       WHERE tabela_preco_id = $1 ORDER BY criado_em DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar o histórico dessa tabela.' });
  }
});

// GET /api/tabelas-preco/versoes/:versaoId — o conteúdo completo de uma foto antiga.
router.get('/versoes/:versaoId', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tabelas_preco_versoes WHERE id = $1', [req.params.versaoId]);
    if (!rows[0]) return res.status(404).json({ erro: 'Versão não encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar essa versão.' });
  }
});

// GET /api/tabelas-preco/comparar?cidade=...&bairro=...&qtd_volumes=...&peso_kg=...&cubagem_m3=...&valor_faturado=...
// Mostra o preço de TODAS as transportadoras cadastradas pra aquela cidade,
// já calculado e ordenado do mais barato pro mais caro.
router.get('/comparar', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  try {
    const { cidade, bairro, qtd_volumes, peso_kg, cubagem_m3, valor_faturado } = req.query;
    if (!cidade && !bairro) return res.status(400).json({ erro: 'Informe pelo menos a cidade.' });

    const todosTrechos = await buscarTodosTrechosAtivos();

    // Agrupa por transportadora — cada uma só pode aparecer uma vez no resultado.
    const porTransportadora = {};
    todosTrechos.forEach((t) => {
      if (!porTransportadora[t.transportadora_nome]) porTransportadora[t.transportadora_nome] = [];
      porTransportadora[t.transportadora_nome].push(t);
    });

    const candidatos = [cidade, bairro].filter(Boolean);
    const resultados = [];
    for (const [transportadoraNome, trechos] of Object.entries(porTransportadora)) {
      const trecho = encontrarTrechoPorCidade(trechos, candidatos);
      if (!trecho) continue;

      const { freteBase, explicacao, modo } = calcularFreteBase(trecho, { qtdVolumes: qtd_volumes, pesoKg: peso_kg, cubagemM3: cubagem_m3 });
      const componentes = calcularComponentesEValorTotal(trecho, freteBase, { valorFaturado: valor_faturado, pesoKg: peso_kg });
      resultados.push({
        transportadora: transportadoraNome, tabela_nome: trecho.tabela_nome,
        origem: trecho.origem, destino: trecho.destino, tipo_carga: trecho.tipo_carga,
        modo, freteBase, explicacao, prazo_dias: trecho.prazo_dias ?? trecho.tabela_prazo_dias ?? null, valorTotal: componentes.total, componentes,
      });
    }

    resultados.sort((a, b) => a.valorTotal - b.valorTotal);
    res.json(resultados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao comparar cotações.' });
  }
});

// Acha o valor de uma linha da planilha, testando várias variações possíveis
// de nome de coluna (maiúscula/minúscula, com/sem acento).
function normalizarTextoCabecalho(t) {
  return (t || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
function pegarCampo(linha, candidatos) {
  const chaves = Object.keys(linha);
  for (const candidato of candidatos) {
    const chave = chaves.find((k) => normalizarTextoCabecalho(k) === normalizarTextoCabecalho(candidato));
    if (chave && linha[chave] !== null && linha[chave] !== undefined && linha[chave] !== '') return linha[chave];
  }
  return null;
}

// POST /api/tabelas-preco/:id/importar-trechos
// Sobe uma planilha Excel com vários trechos de uma vez, em vez de cadastrar
// linha por linha na tela — útil quando a transportadora manda a tabela dela

// ---------- Exportar / importar a tabela de preço COMPLETA ----------
// Um .xlsx com duas abas: "Tabela" (dados gerais, campo × valor) e "Trechos"
// (as mesmas colunas do "Importar via Excel"). Serve pra levar a mesma tabela
// para outra empresa/instalação do Nexofrete sem digitar tudo de novo — e dá
// pra ajustar valores no Excel antes de importar.
const CAMPOS_EXPORTACAO = [
  ['nome', 'Nome da tabela', 'texto'], ['uf_destino', 'UF destino', 'texto'], ['cidade_destino', 'Cidade destino', 'texto'],
  ['tipo_frete', 'Tipo de frete', 'texto'], ['prazo_dias', 'Prazo padrão (dias)', 'numero'],
  ['valor_minimo', 'Valor mínimo (R$)', 'numero'], ['excedente_por_kg', 'Excedente por kg (R$)', 'numero'],
  ['ad_valorem_percentual', 'Ad Valorem (%)', 'numero'], ['gris_percentual', 'GRIS (%)', 'numero'], ['gris_minimo', 'GRIS mínimo (R$)', 'numero'],
  ['pedagio', 'Pedágio (R$ por 100 kg)', 'numero'], ['tde', 'TDE (R$)', 'numero'], ['tda', 'TDA (R$)', 'numero'], ['trt', 'TRT (R$)', 'numero'],
  ['despacho_valor', 'Despacho / CTRC (R$)', 'numero'], ['valor_pallet', 'Valor por pallet (R$)', 'numero'],
  ['cubagem_kg_m3', 'Cubagem (kg por m³)', 'numero'], ['devolucao_percentual', 'Devolução (%)', 'numero'],
  ['reentrega_percentual', 'Reentrega (%)', 'numero'], ['retorno_percentual', 'Retorno de remessa - feira/demonstração (%)', 'numero'],
  ['validade_meses', 'Validade (meses)', 'numero'],
  ['descarga_valor', 'Descarga (R$)', 'numero'], ['descarga_modo', 'Descarga cobrada (fixo/volume/kg/tonelada)', 'texto'],
  ['descarga_minimo', 'Descarga mínima (R$)', 'numero'], ['descarga_aplicar', 'Descarga em (todos/lista)', 'texto'],
  ['descarga_clientes', 'Clientes com descarga (separados por ;)', 'texto'],
  ['icms_incluir', 'Somar ICMS ao frete (S/N)', 'simnao'], ['icms_aliquota', 'Alíquota do ICMS (%)', 'numero'],
  ['icms_modo', 'ICMS (dentro/fora)', 'texto'],
  ['seguradora', 'Seguradora', 'texto'], ['condicao_faturamento', 'Condição de faturamento', 'texto'],
  ['indice_correcao', 'Índice de correção', 'texto'], ['ativa', 'Ativa (S/N)', 'simnao'], ['observacoes', 'Observações', 'texto'],
];
const COLUNAS_TRECHOS = ['Origem', 'Destino', 'Região', 'Tipo de Carga', 'Cidades', 'Modo de Cálculo', 'Volume Mínimo',
  'Peso Mínimo (kg)', 'Peso Até (kg)', 'Valor por Volume', 'R$/Kg Excedente', 'Frete Mínimo', 'Prazo (dias)'];

// "1.234,56" / "1234,56" / 1234.56 -> 1234.56
function numeroPlanilha(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  let t = String(v).trim().replace(/[R$%\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// GET /api/tabelas-preco/:id/exportar -> .xlsx da tabela completa
router.get('/:id(\\d+)/exportar', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const tabela = await buscarComFaixas(req.params.id);
    if (!tabela) return res.status(404).json({ erro: 'Tabela de preço não encontrada.' });
    const { rows: tr } = await pool.query('SELECT razao_social, cnpj FROM transportadoras WHERE id = $1', [tabela.transportadora_id]);
    const linhasTabela = [
      ['Campo', 'Valor'],
      ['Transportadora', tr[0]?.razao_social || ''],
      ['CNPJ da transportadora', tr[0]?.cnpj || ''],
      ...CAMPOS_EXPORTACAO.map(([campo, rotulo, tipo]) => {
        const v = tabela[campo];
        if (tipo === 'simnao') return [rotulo, v ? 'S' : 'N'];
        if (tipo === 'numero') return [rotulo, v == null ? '' : Number(v)];
        return [rotulo, v ?? ''];
      }),
      [],
      ['Exportado do Nexofrete', new Date().toLocaleString('pt-BR')],
    ];
    const linhasTrechos = [COLUNAS_TRECHOS, ...tabela.faixas.map((f) => {
      const n = (v) => (v == null ? '' : Number(v));
      return [f.origem || '', f.destino || '', f.regiao || '', f.tipo_carga || '', f.cidades || '',
        f.modo_calculo === 'peso' ? 'Peso' : 'Volume', n(f.volume_minimo), n(f.peso_de), n(f.peso_ate),
        n(f.valor_por_kg), n(f.valor_kg_excedente), n(f.frete_minimo), n(f.prazo_dias)];
    })];
    const wb = XLSX.utils.book_new();
    const abaTabela = XLSX.utils.aoa_to_sheet(linhasTabela);
    abaTabela['!cols'] = [{ wch: 30 }, { wch: 50 }];
    const abaTrechos = XLSX.utils.aoa_to_sheet(linhasTrechos);
    abaTrechos['!cols'] = COLUNAS_TRECHOS.map((c) => ({ wch: c === 'Cidades' ? 60 : Math.max(12, c.length + 2) }));
    XLSX.utils.book_append_sheet(wb, abaTabela, 'Tabela');
    XLSX.utils.book_append_sheet(wb, abaTrechos, 'Trechos');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const nomeArquivo = `Tabela_${String(tr[0]?.razao_social || 'transportadora').replace(/[^\w]+/g, '_').slice(0, 40)}_${String(tabela.nome).replace(/[^\w]+/g, '_').slice(0, 40)}.xlsx`;
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'exportar_tabela_preco',
      detalhes: `Exportou a tabela de preço #${tabela.id} (${tabela.nome}) com ${tabela.faixas.length} trecho(s)` });
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"` });
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao exportar a tabela de preço.' });
  }
});

// POST /api/tabelas-preco/importar-completa  (arquivo .xlsx exportado acima)
// Cria uma tabela NOVA. A transportadora é achada pelo CNPJ (ou pelo nome);
// se não existir, é cadastrada. Nunca sobrescreve uma tabela existente.
router.post('/importar-completa', autenticar, permitir('pode_gerenciar_tabelas_preco'), upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  const cliente = await pool.connect();
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const abaTabela = wb.Sheets[wb.SheetNames.find((n) => normalizarTextoCabecalho(n) === 'tabela')];
    const abaTrechos = wb.Sheets[wb.SheetNames.find((n) => normalizarTextoCabecalho(n) === 'trechos')];
    if (!abaTabela || !abaTrechos) {
      return res.status(400).json({ erro: 'Esse arquivo não parece uma tabela exportada do Nexofrete (precisa das abas "Tabela" e "Trechos"). Para só trechos, use "Importar via Excel" dentro da tabela.' });
    }
    // Aba "Tabela": Campo | Valor
    const pares = XLSX.utils.sheet_to_json(abaTabela, { header: 1, defval: null });
    const valorDe = (rotulo) => {
      const linha = pares.find((l) => l && normalizarTextoCabecalho(l[0]) === normalizarTextoCabecalho(rotulo));
      return linha ? linha[1] : null;
    };
    const nomeTransp = String(valorDe('Transportadora') || '').trim();
    const cnpjTransp = String(valorDe('CNPJ da transportadora') || '').replace(/\D/g, '');
    if (!nomeTransp && !cnpjTransp) return res.status(400).json({ erro: 'A aba "Tabela" não informa a transportadora.' });

    await cliente.query('BEGIN');
    // Transportadora: CNPJ exato, depois raiz do CNPJ, depois nome; senão cadastra.
    let transportadoraId = req.body?.transportadora_id ? Number(req.body.transportadora_id) : null;
    let transportadoraCriada = false;
    if (!transportadoraId && cnpjTransp.length === 14) {
      const { rows } = await cliente.query(
        `SELECT id FROM transportadoras WHERE REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = $1
         UNION ALL SELECT id FROM transportadoras WHERE LEFT(REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g'), 8) = LEFT($1, 8) LIMIT 1`, [cnpjTransp]);
      transportadoraId = rows[0]?.id || null;
    }
    if (!transportadoraId && nomeTransp) {
      const { rows } = await cliente.query('SELECT id FROM transportadoras WHERE LOWER(TRIM(razao_social)) = LOWER(TRIM($1)) LIMIT 1', [nomeTransp]);
      transportadoraId = rows[0]?.id || null;
    }
    if (!transportadoraId) {
      const { rows } = await cliente.query('INSERT INTO transportadoras (razao_social, cnpj) VALUES ($1, $2) RETURNING id',
        [nomeTransp || `Transportadora ${cnpjTransp}`, cnpjTransp || null]);
      transportadoraId = rows[0].id;
      transportadoraCriada = true;
    }

    // Dados gerais
    const dados = { transportadora_id: transportadoraId };
    for (const [campo, rotulo, tipo] of CAMPOS_EXPORTACAO) {
      const v = valorDe(rotulo);
      if (v === null || v === undefined || v === '') continue;
      if (tipo === 'numero') { const n = numeroPlanilha(v); if (n !== null) dados[campo] = n; }
      else if (tipo === 'simnao') dados[campo] = /^(s|sim|true|1|ativa)$/i.test(String(v).trim());
      else dados[campo] = String(v).trim();
    }
    if (!dados.nome) dados.nome = 'Tabela importada';
    if (dados.uf_destino) dados.uf_destino = String(dados.uf_destino).toUpperCase().slice(0, 2);
    // Mesmo nome já existe nessa transportadora: não sobrescreve, cria com outro nome.
    const { rows: mesmoNome } = await cliente.query('SELECT 1 FROM tabelas_preco WHERE transportadora_id = $1 AND LOWER(nome) = LOWER($2)', [transportadoraId, dados.nome]);
    if (mesmoNome.length) dados.nome = `${dados.nome} (importada ${new Date().toLocaleDateString('pt-BR')})`.slice(0, 150);
    const campos = Object.keys(dados);
    const { rows: nova } = await cliente.query(
      `INSERT INTO tabelas_preco (${campos.join(', ')}) VALUES (${campos.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id, nome`,
      campos.map((c) => dados[c]));
    const tabelaId = nova[0].id;

    // Trechos
    const linhas = XLSX.utils.sheet_to_json(abaTrechos, { defval: null });
    let importados = 0;
    const erros = [];
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      const valorPorVolume = numeroPlanilha(pegarCampo(l, ['Valor por Volume', 'Valor por Volume (R$)', 'Valor/Volume']));
      const freteMinimo = numeroPlanilha(pegarCampo(l, ['Frete Mínimo', 'Valor Mínimo', 'Frete Mínimo (R$)']));
      if (valorPorVolume == null && freteMinimo == null) continue;
      try {
        await cliente.query(
          `INSERT INTO tabela_preco_faixas
             (tabela_preco_id, origem, destino, regiao, tipo_carga, cidades, modo_calculo, volume_minimo,
              peso_de, peso_ate, valor_por_kg, valor_kg_excedente, frete_minimo, prazo_dias, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [tabelaId, pegarCampo(l, ['Origem']), pegarCampo(l, ['Destino']), pegarCampo(l, ['Região', 'Regiao']),
           pegarCampo(l, ['Tipo de Carga', 'Tipo']), pegarCampo(l, ['Cidades', 'Cidades dessa praça']),
           normalizarTextoCabecalho(pegarCampo(l, ['Modo de Cálculo', 'Modo']) || 'volume').includes('peso') ? 'peso' : 'volume',
           numeroPlanilha(pegarCampo(l, ['Volume Mínimo'])), numeroPlanilha(pegarCampo(l, ['Peso Mínimo (kg)', 'Peso Mínimo'])),
           numeroPlanilha(pegarCampo(l, ['Peso Até (kg)', 'Peso Até'])), valorPorVolume ?? 0,
           numeroPlanilha(pegarCampo(l, ['R$/Kg Excedente', 'Kg Excedente'])), freteMinimo,
           numeroPlanilha(pegarCampo(l, ['Prazo (dias)', 'Prazo'])), i]);
        importados += 1;
      } catch (e) {
        erros.push(`Trecho da linha ${i + 2}: ${e.message}`);
      }
    }
    await cliente.query('COMMIT');
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_tabela_preco',
      detalhes: `Importou a tabela "${nova[0].nome}" (#${tabelaId}) com ${importados} trecho(s)${transportadoraCriada ? ' e cadastrou a transportadora' : ''}` });
    res.json({ ok: true, tabela_id: tabelaId, nome: nova[0].nome, trechos: importados, erros, transportadora_criada: transportadoraCriada });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(400).json({ erro: `Não consegui importar a tabela: ${err.message}` });
  } finally {
    cliente.release();
  }
});

// pronta em Excel.
router.post('/:id/importar-trechos', autenticar, permitir('pode_gerenciar_tabelas_preco'), upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const planilha = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(planilha, { defval: null });

    let importados = 0;
    const erros = [];

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      try {
        const valorPorVolume = pegarCampo(linha, ['Valor por Volume', 'Valor por Volume (R$)', 'Valor/Volume']);
        const freteMinimo = pegarCampo(linha, ['Frete Mínimo', 'Valor Mínimo', 'Frete Mínimo (R$)', 'Valor Mínimo (R$)']);
        if (valorPorVolume == null && freteMinimo == null) { continue; } // linha em branco, pula sem contar erro

        const modoTexto = normalizarTextoCabecalho(pegarCampo(linha, ['Modo de Cálculo', 'Modo']) || 'volume');
        const modoCalculo = modoTexto.includes('peso') ? 'peso' : 'volume';

        await pool.query(
          `INSERT INTO tabela_preco_faixas
             (tabela_preco_id, origem, destino, tipo_carga, cidades, modo_calculo, volume_minimo,
              peso_de, valor_por_kg, valor_kg_excedente, frete_minimo, prazo_dias, regiao, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            req.params.id,
            pegarCampo(linha, ['Origem']),
            pegarCampo(linha, ['Destino']),
            pegarCampo(linha, ['Tipo de Carga', 'Tipo']),
            pegarCampo(linha, ['Cidades', 'Cidades dessa praça', 'Cidades dessa praça (separadas por vírgula)']),
            modoCalculo,
            pegarCampo(linha, ['Volume Mínimo']),
            pegarCampo(linha, ['Peso Mínimo', 'Peso Mínimo (kg)']),
            valorPorVolume || null,
            pegarCampo(linha, ['R$/Kg Excedente', 'Kg Excedente', 'Valor Kg Excedente']),
            freteMinimo || null,
            pegarCampo(linha, ['Prazo', 'Prazo (dias)']),
            pegarCampo(linha, ['Região', 'Regiao']),
            i,
          ]
        );
        importados++;
      } catch (errLinha) {
        erros.push(`Linha ${i + 2}: ${errLinha.message}`);
      }
    }

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_trechos_excel',
      detalhes: `Importou ${importados} trecho(s) via Excel pra tabela de preço #${req.params.id}${erros.length ? `, ${erros.length} erro(s)` : ''}`,
    });
    res.json({ importados, total: linhas.length, erros });
  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: err.message || 'Erro ao ler a planilha. Confira se é um arquivo .xlsx válido.' });
  }
});

// GET /api/tabelas-preco/simulador?de=TransportadoraAtual&para=TransportadoraAlternativa&data_de=...&data_ate=...
// Pega o histórico de fretes de uma transportadora, e recalcula quanto
// teria custado se cada um desses fretes tivesse ido pra outra
// transportadora (usando a tabela de preço dela) — pra saber se valeria a
// pena trocar.
router.get('/simulador', autenticar, permitir('pode_editar_registros'), async (req, res) => {
  try {
    const { de, para, data_de, data_ate } = req.query;
    if (!de || !para) return res.status(400).json({ erro: 'Informe as duas transportadoras (atual e alternativa).' });

    const condicoes = ['transportadora_cte = $1', 'valor_total_frete IS NOT NULL'];
    const valores = [de];
    if (data_de) { valores.push(data_de); condicoes.push(`data_emissao_nf >= $${valores.length}`); }
    if (data_ate) { valores.push(data_ate); condicoes.push(`data_emissao_nf <= $${valores.length}`); }

    const { rows: fretes } = await pool.query(
      `SELECT id, numero_pedido, cidade, bairro, valor_total_frete, qtd_volumes, peso_kg, cubagem_m3, valor_faturado
       FROM fretes WHERE ${condicoes.join(' AND ')} ORDER BY data_emissao_nf DESC LIMIT 500`,
      valores
    );

    const todosTrechos = await buscarTodosTrechosAtivos();
    const trechosAlternativa = todosTrechos.filter((t) => t.transportadora_nome === para);

    let totalReal = 0, totalSimulado = 0, comparaveis = 0, semCobertura = 0;
    for (const f of fretes) {
      totalReal += Number(f.valor_total_frete) || 0;
      const trecho = encontrarTrechoPorCidade(trechosAlternativa, [f.cidade, f.bairro].filter(Boolean));
      if (!trecho) { semCobertura++; continue; }
      const { freteBase } = calcularFreteBase(trecho, { qtdVolumes: f.qtd_volumes, pesoKg: f.peso_kg, cubagemM3: f.cubagem_m3 });
      const componentes = calcularComponentesEValorTotal(trecho, freteBase, { valorFaturado: f.valor_faturado, pesoKg: f.peso_kg });
      totalSimulado += componentes.total;
      comparaveis++;
    }

    res.json({
      qtdFretes: fretes.length, comparaveis, semCobertura,
      totalReal, totalSimulado: comparaveis > 0 ? totalSimulado : null,
      diferenca: comparaveis > 0 ? totalSimulado - (totalReal * (comparaveis / fretes.length)) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao simular a troca de transportadora.' });
  }
});

module.exports = router;
