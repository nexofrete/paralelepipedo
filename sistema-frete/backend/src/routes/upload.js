const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { parseNFe, parseCTe, parseEvento, parseRetorno } = require('../utils/xmlParser');
const { registrar } = require('../auditoria');
const ctesVinculados = require('../ctesVinculados');
const { calcularEGravar } = require('../calculoFrete');
const { aplicarPendenteDaNota } = require('../importacaoErp');

const router = express.Router();

// Recebe o arquivo em memória (não salva em disco) — o XML bruto vai para o banco.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });   // um XML nunca chega perto disso

/**
 * POST /api/upload/nfe
 * Form-data: arquivo (o .xml), numero_pedido (opcional, para já vincular a um pedido existente)
 */
const tratar_nfe = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: 'Nenhum arquivo XML enviado.' });
  }

  try {
    const xmlString = req.file.buffer.toString('utf-8');
    const dados = parseNFe(xmlString);
    // Prioriza o número de pedido digitado na tela; se não foi digitado,
    // usa o que foi extraído automaticamente do texto da NF-e.
    const numeroPedido = req.body.numero_pedido || dados.numero_pedido || null;

    // NF-e SEM CIRCULAÇÃO de mercadoria (baixa de estoque, destinatário é a própria
    // empresa...): não há transporte, não gera frete e não se junta a outro registro.
    if (dados.sem_circulacao && !dados.nf_complementar) {
      return res.json({ pulado: true,
        mensagem: `NF-e ${dados.numero_nf || ''}${dados.natureza_operacao ? ` (${dados.natureza_operacao})` : ''} não tem transporte de mercadoria — ${dados.motivo_sem_circulacao}. Não gera frete a acompanhar, não foi importada.` });
    }

    // NF-e COMPLEMENTAR / de ajuste: sem mercadoria, não gera frete — e nunca se
    // junta ao registro de outra nota (ela pode ter o MESMO número de pedido da
    // original e sobrescreveria os dados dela). Só anota na nota original.
    if (dados.nf_complementar) {
      const info = String(dados.infCpl || '');
      const chaveRef = (dados.nf_referenciadas || [])[0] || null;
      const nfRef = chaveRef ? String(Number(chaveRef.slice(25, 34))) : ((info.match(/documento\s+(\d{3,9})/i) || [])[1] || null);
      const valor = Number(dados.valor_faturado ?? dados.valor_nf ?? 0);
      const texto = `NF-e complementar ${dados.numero_nf || ''}${dados.natureza_operacao ? ` (${dados.natureza_operacao})` : ''}`
        + `${dados.data_emissao_nf ? ` emitida em ${String(dados.data_emissao_nf).slice(0, 10).split('-').reverse().join('/')}` : ''}`
        + `${valor ? ` — ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}: sem mercadoria, não gera frete.`;
      let original = null;
      if (chaveRef) original = (await pool.query('SELECT id, numero_nf FROM fretes WHERE chave_nfe = $1 AND frete_principal_id IS NULL LIMIT 1', [chaveRef])).rows[0];
      if (!original && nfRef) original = (await pool.query(`SELECT id, numero_nf FROM fretes WHERE LTRIM(numero_nf, '0') = LTRIM($1, '0') AND frete_principal_id IS NULL ORDER BY id DESC LIMIT 1`, [nfRef])).rows[0];
      if (original) {
        await pool.query(
          `UPDATE fretes SET observacoes = CASE WHEN POSITION($2 IN COALESCE(observacoes, '')) > 0 THEN observacoes
                                               ELSE CONCAT_WS(E'\n', NULLIF(observacoes, ''), $2::text) END WHERE id = $1`, [original.id, texto]);
      }
      return res.json({ pulado: true, mensagem: `${texto}${nfRef ? ` Complementa a NF ${nfRef}${original ? ' (anotado nela)' : ' (que ainda não está no sistema)'}.` : ''}` });
    }

    // Procura uma linha já existente para juntar com esta NF-e: primeiro pelo
    // número de pedido (se veio um), senão pelo número da NF (caso o CT-e
    // correspondente já tenha sido importado antes e criado a linha).
    let idExistente = null;
    if (numeroPedido) {
      const r = await pool.query('SELECT id FROM fretes WHERE numero_pedido = $1', [numeroPedido]);
      if (r.rows.length > 0) idExistente = r.rows[0].id;
    }
    if (!idExistente && dados.numero_nf) {
      const r = await pool.query(
        'SELECT id FROM fretes WHERE numero_nf = $1 AND chave_nfe IS NULL',
        [dados.numero_nf]
      );
      if (r.rows.length > 0) idExistente = r.rows[0].id;
    }

    // O sistema acompanha só fretes nacionais — se for a primeira vez que
    // esse pedido aparece e a cidade do destinatário é EXTERIOR, não cria
    // registro nenhum (mas se já existir, continua atualizando normalmente).
    if (!idExistente && (dados.nf_entrada || dados.nf_devolucao)) {
      // Nota de entrada / devolução não gera frete de venda. Se ela estiver numa
      // devolução informada por e-mail, fica registrada lá.
      // NF-e de DEVOLUÇÃO emitida pela empresa: o próprio XML diz qual é a nota de
      // origem (NFref ou "Nota Fiscal de Origem: N") e o motivo. Registra a
      // devolução sozinho — a nota de origem fica marcada como devolvida (sai das
      // entregas atrasadas) e o CT-e de devolução que vier citando esta nota é
      // ligado à nota de origem.
      let devolucaoRegistrada = null;
      // Retorno de remessa (feira, demonstração, conserto): nota de entrada que cita a remessa de origem.
      const CFOP_RETORNO = ['1913', '1914', '1916', '2913', '2914', '2916'];
      const ehRetornoRemessa = !dados.nf_devolucao && (dados.cfops || []).some((c) => CFOP_RETORNO.includes(c));
      if (dados.nf_devolucao || ehRetornoRemessa) {
        devolucaoRegistrada = await registrarDevolucaoDoXml(dados, ehRetornoRemessa ? 'retorno' : 'devolucao').catch((e) => { console.error('[devolução xml]', e.message); return null; });
      }
      const ehRetorno = await require('../trocasNota').marcarRetornoRecebido(dados.numero_nf).catch(() => null);
      return res.json({ pulado: !devolucaoRegistrada, alerta: !!devolucaoRegistrada,
        mensagem: devolucaoRegistrada
          ? (devolucaoRegistrada.tipo === 'retorno'
            ? `NF-e ${dados.numero_nf} é o RETORNO da remessa NF ${devolucaoRegistrada.nfOriginal} (feira/demonstração)${devolucaoRegistrada.achouOriginal ? ' — a remessa foi marcada como "retornou"' : ' (a remessa ainda não está no sistema; é ligada quando chegar)'}. O CT-e da volta será conferido pelo % de retorno da tabela da transportadora.`
            : `NF-e ${dados.numero_nf} é a DEVOLUÇÃO da NF ${devolucaoRegistrada.nfOriginal}${devolucaoRegistrada.achouOriginal ? ' — a NF de origem foi marcada como devolvida' : ' (a NF de origem ainda não está no sistema; é ligada quando chegar)'}. Não gera frete de venda.`)
          : `NF-e ${dados.numero_nf || ''} é nota de ${dados.nf_entrada ? 'entrada' : 'devolução'} — não gera frete a acompanhar, não foi importada.`
            + (ehRetorno ? ` É a nota de retorno da devolução da NF ${ehRetorno} (registrada).` : '') });
    }
    if (!idExistente && (dados.cidade || '').trim().toUpperCase() === 'EXTERIOR') {
      return res.json({ mensagem: 'NF-e de exportação (Cidade: EXTERIOR) — não importada, o sistema acompanha só fretes nacionais.', pulado: true });
    }

    let observacoesParaSalvar = dados.infCpl;
    if (idExistente && dados.infCpl) {
      const { rows: atual } = await pool.query('SELECT observacoes FROM fretes WHERE id = $1', [idExistente]);
      const observacoesAtuais = atual[0]?.observacoes || '';
      observacoesParaSalvar = observacoesAtuais.includes(dados.infCpl)
        ? observacoesAtuais
        : (observacoesAtuais ? `${observacoesAtuais}\n${dados.infCpl}` : dados.infCpl);
    }

    let resultado;
    if (idExistente) {
      resultado = await pool.query(
        `UPDATE fretes SET
           numero_pedido = COALESCE(numero_pedido, $1),
           chave_nfe = $2, numero_nf = $3, data_emissao_nf = $4, cliente = $5,
           cidade = $6, bairro = $7, uf = $8, valor_faturado = $9,
           qtd_volumes = $10, peso_kg = COALESCE(peso_kg, $11),
           frete_cif_fob = $12, pedido_mercus = COALESCE($13, pedido_mercus),
           redespacho = COALESCE($14, redespacho),
           cidade_redespacho = COALESCE($15, cidade_redespacho), xml_nfe_original = $16,
           usuario_upload_id = $17, impostos_nfe = $18,
           transportadora = COALESCE(transportadora, $19), transportadora_nfe = $19,
           observacoes = COALESCE($21, observacoes), atualizado_em = NOW()
         WHERE id = $20
         RETURNING *`,
        [numeroPedido, dados.chave_nfe, dados.numero_nf, dados.data_emissao_nf, dados.cliente,
         dados.cidade, dados.bairro, dados.uf, dados.valor_faturado,
         dados.qtd_volumes, dados.peso_kg, dados.frete_cif_fob,
         dados.pedido_mercus, dados.redespacho, dados.cidade_redespacho, xmlString,
         req.usuario.id, dados.impostos_nfe, dados.transportadora, idExistente, observacoesParaSalvar]
      );
      registrar({
        usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_nfe',
        detalhes: `Importou NF-e ${dados.numero_nf || '?'} e vinculou ao registro #${idExistente}`,
        registroId: idExistente,
      });
      // Se o CT-e dessa nota já tinha chegado, agora dá pra calcular pela tabela.
      if (resultado.rows[0]?.chave_cte) await calcularEGravar(resultado.rows[0].id, 'importacao-nfe').catch(() => {});
      await aplicarPendenteDaNota(resultado.rows[0].id);
      // Uma complementar tinha sobrescrito este registro e agora a nota original voltou: tira a marca.
      await pool.query(`UPDATE fretes SET nf_complementar = FALSE,
                               status = CASE WHEN status = 'Não cobrado' AND chave_cte IS NULL THEN 'Pendente' ELSE status END
                         WHERE id = $1 AND nf_complementar`, [resultado.rows[0].id]).catch(() => {});
      const jaCancelada = await aplicarCancelamentoGuardado(resultado.rows[0].id, dados.chave_nfe);
      await require('../trocasNota').aplicarPendentesDaNota(dados.numero_nf).catch(() => {});
      await require('../trocasNota').verificarRefaturamentoDaNota(resultado.rows[0].id).catch(() => {});   // é a refaturada de uma devolução?
      await require('../clientes').registrarDaNfe(dados, resultado.rows[0].id).catch(() => {});
      require('../transportadorasRedespacho').daNota(resultado.rows[0].id, dados).catch(() => {});   // cadastra o redespacho pelo CNPJ
      if (dados.frete_por_conta_cliente) {   // venda FOB com transportadora: frete por conta do cliente
        const msgFob = 'Frete por conta do cliente (FOB) — transportadora não informada na nota: o cliente contrata a transportadora ou vem buscar.';
        await pool.query(`UPDATE fretes SET frete_por_conta_cliente = TRUE,
            observacoes = CASE WHEN POSITION($2 IN COALESCE(observacoes, '')) > 0 THEN observacoes ELSE CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $2::text) END
          WHERE id = $1`, [resultado.rows[0].id, msgFob]).catch(() => {});
      }
      ctesVinculados.reconciliarCtesSoltos().catch(() => {});
      return res.json({ mensagem: `NF-e vinculada ao pedido existente.${jaCancelada ? ' ⚠ Essa NF-e já tinha o cancelamento importado: entrou como CANCELADA.' : ''}`, frete: resultado.rows[0] });
    }

    resultado = await pool.query(
      `INSERT INTO fretes (
         numero_pedido, chave_nfe, numero_nf, data_emissao_nf, cliente,
         cidade, bairro, uf, valor_faturado, qtd_volumes, peso_kg,
         frete_cif_fob, pedido_mercus, redespacho, cidade_redespacho, xml_nfe_original, usuario_upload_id,
         impostos_nfe, transportadora, transportadora_nfe, observacoes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19,$20)
       RETURNING *`,
      [numeroPedido, dados.chave_nfe, dados.numero_nf, dados.data_emissao_nf, dados.cliente,
       dados.cidade, dados.bairro, dados.uf, dados.valor_faturado, dados.qtd_volumes,
       dados.peso_kg, dados.frete_cif_fob, dados.pedido_mercus, dados.redespacho, dados.cidade_redespacho,
       xmlString, req.usuario.id, dados.impostos_nfe, dados.transportadora, dados.infCpl]
    );
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_nfe',
      detalhes: `Importou NF-e ${dados.numero_nf || '?'} (novo registro #${resultado.rows[0].id})`,
      registroId: resultado.rows[0].id,
    });
    const comPlanilha = await aplicarPendenteDaNota(resultado.rows[0].id);
    const jaCancelada = await aplicarCancelamentoGuardado(resultado.rows[0].id, dados.chave_nfe);
    await require('../trocasNota').aplicarPendentesDaNota(dados.numero_nf).catch(() => {});
    await require('../trocasNota').verificarRefaturamentoDaNota(resultado.rows[0].id).catch(() => {});   // é a refaturada de uma devolução?
    await require('../clientes').registrarDaNfe(dados, resultado.rows[0].id).catch(() => {});
    require('../transportadorasRedespacho').daNota(resultado.rows[0].id, dados).catch(() => {});   // cadastra o redespacho pelo CNPJ
    if (dados.frete_por_conta_cliente) {   // venda FOB com transportadora: frete por conta do cliente
      const msgFob = 'Frete por conta do cliente (FOB) — transportadora não informada na nota: o cliente contrata a transportadora ou vem buscar.';
      await pool.query(`UPDATE fretes SET frete_por_conta_cliente = TRUE,
          observacoes = CASE WHEN POSITION($2 IN COALESCE(observacoes, '')) > 0 THEN observacoes ELSE CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $2::text) END
        WHERE id = $1`, [resultado.rows[0].id, msgFob]).catch(() => {});
    }
    ctesVinculados.reconciliarCtesSoltos().catch(() => {});
    res.status(201).json({ mensagem: `NF-e importada com sucesso${comPlanilha ? ' (com os dados da planilha do ERP que estavam esperando)' : ''}.${jaCancelada ? ' ⚠ Essa NF-e já tinha o cancelamento importado: entrou como CANCELADA.' : ''}`, frete: resultado.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Essa NF-e (mesma chave de acesso) já foi importada antes.' });
    }
    res.status(400).json({ erro: err.message || 'Erro ao processar o XML da NF-e.' });
  }
};
router.post('/nfe', autenticar, permitir('pode_enviar_xml'), upload.single('arquivo'), tratar_nfe);

/**
 * POST /api/upload/cte
 * Form-data: arquivo (o .xml), numero_pedido (opcional, para já vincular a um pedido existente)
 */
const tratar_cte = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: 'Nenhum arquivo XML enviado.' });
  }

  try {
    const xmlString = req.file.buffer.toString('utf-8');
    const dados = parseCTe(xmlString);
    const numeroPedido = req.body.numero_pedido || null;

    // Cadastra ou atualiza a transportadora automaticamente a partir do
    // emitente do CT-e (sem duplicar, casando pelo CNPJ).
    if (dados.transportador_cnpj && dados.transportadora) {
      await pool.query(
        `INSERT INTO transportadoras (razao_social, cnpj, ie, telefone, endereco, bairro, municipio, uf, cep)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (cnpj) DO UPDATE SET
           razao_social = EXCLUDED.razao_social,
           ie = COALESCE(EXCLUDED.ie, transportadoras.ie),
           telefone = COALESCE(EXCLUDED.telefone, transportadoras.telefone),
           endereco = COALESCE(EXCLUDED.endereco, transportadoras.endereco),
           bairro = COALESCE(EXCLUDED.bairro, transportadoras.bairro),
           municipio = COALESCE(EXCLUDED.municipio, transportadoras.municipio),
           uf = COALESCE(EXCLUDED.uf, transportadoras.uf),
           cep = COALESCE(EXCLUDED.cep, transportadoras.cep),
           atualizado_em = NOW()`,
        [dados.transportadora, dados.transportador_cnpj, dados.transportador_ie,
         dados.transportador_telefone, dados.transportador_endereco, dados.transportador_bairro,
         dados.transportador_municipio, dados.transportador_uf, dados.transportador_cep]
      );
    }

    // Procura o registro da nota, em ordem de confiança: CT-e original citado
    // (complementar/substituto/anulação), número do pedido, CHAVE da NF-e
    // referenciada no XML e, por último, o número da NF escrito nas observações.
    const principal = await ctesVinculados.acharPrincipal(dados, numeroPedido);
    if (principal && principal.chave_cte && principal.chave_cte === dados.chave_cte) {
      return res.status(409).json({ erro: 'Esse CT-e (mesma chave de acesso) já foi importado antes.' });
    }

    // CT-e da nota de retorno de uma devolução: é o frete da devolução da nota original.
    if (principal?._viaRetorno) {
      const ehRetornoRemessa = principal._viaRetorno.tipo === 'retorno';
      dados._vinculoForcado = ehRetornoRemessa ? 'retorno' : 'devolucao';
      dados.observacoes_cte = `${dados.observacoes_cte || ''} [CT-e da nota de retorno ${principal._viaRetorno.nf_retorno} — ${ehRetornoRemessa ? 'retorno da remessa' : 'devolução'} da NF ${principal._viaRetorno.nf_original}]`.trim();
    }
    // A nota já tem CT-e: esse é um CT-e a mais (complementar, reentrega,
    // devolução, redespacho de outra transportadora, substituto ou anulação).
    if (principal && (principal.chave_cte || principal._viaRetorno)) {
      const r = await ctesVinculados.gravarCteAdicional(principal, dados, xmlString, req.usuario);
      registrar({
        usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_cte',
        detalhes: `Importou CT-e ${dados.numero_cte || '?'} (${r.vinculo}) para a nota ${principal.numero_nf || '?'}, ligado ao CT-e ${principal.numero_cte || '?'}${r.alerta ? ' — TRANSPORTADORAS DIFERENTES' : ''}`,
        registroId: r.frete?.id,
      });
      return res.status(201).json({ mensagem: r.mensagem, frete: r.frete, vinculo: r.vinculo, alerta: r.alerta });
    }

    const idExistente = principal ? principal.id : null;
    let resultado;
    if (idExistente) {
      resultado = await pool.query(
        `UPDATE fretes SET
           chave_cte = $1, numero_cte = $2, data_emissao_cte = $3,
           transportadora = $4, transportadora_cte = $4, valor_frete_negociado = $5,
           peso_kg = COALESCE(peso_kg, $6), cubagem_m3 = COALESCE(cubagem_m3, $7),
           xml_cte_original = $8, usuario_upload_id = $9, impostos_cte = $10,
           valor_total_cte = $11, gris = COALESCE(gris, $12), tde = COALESCE(tde, $13),
           tda = COALESCE(tda, $14), pedagio = COALESCE(pedagio, $15), trt = COALESCE(trt, $16),
           ad_valorem = COALESCE(ad_valorem, $17),
           transportadora_cnpj_cte = $19, tipo_cte = $20, uf_inicio_cte = $21, uf_fim_cte = $22,
           atualizado_em = NOW()
         WHERE id = $18
         RETURNING *`,
        [dados.chave_cte, dados.numero_cte, dados.data_emissao_cte, dados.transportadora,
         dados.valor_frete_negociado, dados.peso_kg,
         dados.cubagem_m3, xmlString, req.usuario.id, dados.impostos_cte,
         dados.valor_total_cte, dados.gris, dados.tde, dados.tda,
         dados.pedagio, dados.trt, dados.ad_valorem, idExistente, dados.transportador_cnpj, dados.tipo_cte || 0, dados.uf_inicio, dados.uf_fim]
      );
      await ctesVinculados.recalcularFilhos(idExistente);
      registrar({
        usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_cte',
        detalhes: `Importou CT-e ${dados.numero_cte || '?'} e vinculou ao registro #${idExistente}`,
        registroId: idExistente,
      });
      await ctesVinculados.gravarDadosCte(dados.chave_cte, dados).catch(() => {});
      const calc = await calcularEGravar(idExistente, 'importacao-cte').catch(() => null);
      await require('../trocasNota').verificarCobrancaDuplaPorFrete(idExistente).catch(() => {});   // nota devolvida/refaturada com 2 CT-e?
      return res.json({ mensagem: `CT-e vinculado ao pedido existente${calc?.ok ? ' e calculado pela tabela' : ''}.`, frete: resultado.rows[0] });
    }

    resultado = await pool.query(
      `INSERT INTO fretes (
         numero_pedido, numero_nf, chave_cte, numero_cte, data_emissao_cte, transportadora, transportadora_cte,
         valor_frete_negociado, peso_kg, cubagem_m3, xml_cte_original, usuario_upload_id, impostos_cte,
         valor_total_cte, gris, tde, tda, pedagio, trt, ad_valorem, transportadora_cnpj_cte, tipo_cte, uf_inicio_cte, uf_fim_cte
       ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [numeroPedido, dados.numero_nf_referenciada, dados.chave_cte, dados.numero_cte,
       dados.data_emissao_cte, dados.transportadora, dados.valor_frete_negociado,
       dados.peso_kg, dados.cubagem_m3, xmlString, req.usuario.id, dados.impostos_cte,
       dados.valor_total_cte, dados.gris, dados.tde, dados.tda, dados.pedagio, dados.trt, dados.ad_valorem,
       dados.transportador_cnpj, dados.tipo_cte || 0, dados.uf_inicio, dados.uf_fim]
    );
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_cte',
      detalhes: `Importou CT-e ${dados.numero_cte || '?'} (novo registro #${resultado.rows[0].id})`,
      registroId: resultado.rows[0].id,
    });
    await ctesVinculados.gravarDadosCte(dados.chave_cte, dados).catch(() => {});
    const calc = await calcularEGravar(resultado.rows[0].id, 'importacao-cte').catch(() => null);
    res.status(201).json({ mensagem: `CT-e importado com sucesso${calc?.ok ? ' e calculado pela tabela' : ''}.`, frete: resultado.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Esse CT-e (mesma chave de acesso) já foi importado antes.' });
    }
    res.status(400).json({ erro: err.message || 'Erro ao processar o XML do CT-e.' });
  }
};
router.post('/cte', autenticar, permitir('pode_enviar_xml'), upload.single('arquivo'), tratar_cte);

/**
 * POST /api/upload/evento
 * Recebe um XML de evento (Carta de Correção, Cancelamento, Ciência da
 * Operação etc), acha o registro pela chave do NF-e/CT-e que ele referencia,
 * e anota o conteúdo do evento nas Observações — não tenta adivinhar/mudar
 * sozinho nenhum outro campo, já que o texto do evento é livre.
 */
const tratar_evento = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: 'Nenhum arquivo XML enviado.' });
  }

  try {
    const xmlString = req.file.buffer.toString('utf-8');
    const dados = parseEvento(xmlString);

    if (!dados.chave) {
      return res.status(400).json({ erro: 'Não consegui identificar a chave de acesso do NF-e/CT-e referenciado nesse evento.' });
    }

    // Cancelamento de CT-e: além de anotar, tira o CT-e das contas da nota.
    const ehCancelamento = String(dados.tpEvento || '') === '110111' || /cancel/i.test(dados.descEvento || '');
    if (dados.tipoDocumento === 'cte' && ehCancelamento) {
      const r = await ctesVinculados.cancelarCte(dados.chave, { data: dados.dhEvento, motivo: dados.textoDetalhe }, req.usuario);
      if (!r) {
        return res.status(404).json({ erro: `Não encontrei nenhum registro com esse CT-e já importado (chave ${dados.chave}). Importe o CT-e original primeiro, depois suba o evento de novo.` });
      }
      registrar({
        usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_evento',
        detalhes: r.mensagem, registroId: r.freteId,
      });
      return res.json({ mensagem: r.mensagem, alerta: !!r.alerta });
    }

    const coluna = dados.tipoDocumento === 'cte' ? 'chave_cte' : 'chave_nfe';
    const { rows } = await pool.query(`SELECT * FROM fretes WHERE ${coluna} = $1`, [dados.chave]);

    if (!rows[0]) {
      // Cancelamento de NF-e que ainda não está no sistema: guarda e aplica se a nota chegar.
      const cancelamentoNfe = dados.tipoDocumento === 'nfe' && ['110111', '110112'].includes(String(dados.tpEvento || ''))
        && (!dados.cStatRegistro || ['135', '136', '155'].includes(dados.cStatRegistro));
      if (cancelamentoNfe) {
        await pool.query(
          `INSERT INTO nfe_canceladas_pendentes (chave_nfe, data, motivo, protocolo) VALUES ($1, $2, $3, $4)
           ON CONFLICT (chave_nfe) DO UPDATE SET data = COALESCE(EXCLUDED.data, nfe_canceladas_pendentes.data),
             motivo = COALESCE(EXCLUDED.motivo, nfe_canceladas_pendentes.motivo), protocolo = COALESCE(EXCLUDED.protocolo, nfe_canceladas_pendentes.protocolo)`,
          [dados.chave, dados.dhEvento || null, dados.textoDetalhe || null, dados.numeroProtocolo ? String(dados.numeroProtocolo) : null]);
        const nf = String(dados.chave).length === 44 ? String(Number(String(dados.chave).slice(25, 34))) : '';
        return res.json({ pulado: true, mensagem: `NF-e ${nf} cancelada — ela não está no sistema, então não há o que mudar. O cancelamento ficou guardado: se a nota for importada depois, já entra como cancelada.` });
      }
      const nomeDoc = dados.tipoDocumento === 'cte' ? 'CT-e' : 'NF-e';
      return res.status(404).json({ erro: `Não encontrei nenhum registro com esse ${nomeDoc} já importado (chave ${dados.chave}). Importe o ${nomeDoc} original primeiro, depois suba o evento de novo.` });
    }

    const registro = rows[0];
    // Arquivo só com o retorno da SEFAZ (ex.: "-can-ret.xml") não traz a descrição: usa o código do evento.
    const NOMES_EVENTO = { 110110: 'Carta de Correção', 110111: 'Cancelamento', 110112: 'Cancelamento por substituição',
      110130: 'Comprovante de Entrega', 110180: 'Comprovante de Entrega', 610110: 'Prestação de serviço em desacordo' };
    const rotulo = dados.descEvento || NOMES_EVENTO[Number(dados.tpEvento)] || 'Evento';

    // Cancelamento da NF-e registrado na SEFAZ: marca a nota (e os CT-e dela)
    // como NF cancelada. Arquivo com retorno de rejeição só é anotado.
    const cancelouNfe = dados.tipoDocumento === 'nfe' && (['110111', '110112'].includes(String(dados.tpEvento || '')) || /cancel/i.test(rotulo))
      && (!dados.cStatRegistro || ['135', '136', '155'].includes(dados.cStatRegistro));
    if (cancelouNfe) {
      const principalId = registro.frete_principal_id || registro.id;
      await pool.query(
        `UPDATE fretes SET nf_cancelada = TRUE, atualizado_em = NOW() WHERE id = $1 OR frete_principal_id = $1`, [principalId]);
    }

    // Comprovante de Entrega registrado na SEFAZ pela transportadora: preenche
    // a entrega (sem substituir data lançada à mão). O do CT-e vale para a
    // transportadora daquele CT-e (na nota com redespacho, cada perna tem o seu);
    // o da NF-e é a entrega ao cliente.
    const ehComprovante = ['110180', '110130'].includes(String(dados.tpEvento || '')) || (/comprovante de entrega/i.test(rotulo) && !/cancel/i.test(rotulo));
    if (ehComprovante && dados.dhEntrega) {
      const temRedespacho = !!(registro.redespacho || registro.cidade_redespacho);
      if (dados.tipoDocumento === 'cte' || !temRedespacho) {
        await pool.query(
          `UPDATE fretes SET data_entrega_origem = CASE WHEN data_entrega IS NULL THEN 'sefaz' ELSE data_entrega_origem END,
                  data_entrega = COALESCE(data_entrega, $2::date),
                  canhoto_recebido_por = COALESCE(canhoto_recebido_por, NULLIF($3, '')), atualizado_em = NOW()
            WHERE id = $1`, [registro.id, dados.dhEntrega, dados.recebedorNome || '']);
      }
      if (dados.tipoDocumento === 'nfe' || (!registro.frete_principal_id && !temRedespacho)) {
        await pool.query('UPDATE fretes SET data_entrega_final = COALESCE(data_entrega_final, $2::date) WHERE id = $1',
          [registro.frete_principal_id || registro.id, dados.dhEntrega]);
      }
      await pool.query(
        `INSERT INTO ocorrencias_rastreio (frete_id, data_hora, ocorrencia, descricao, tipo, codigo, dominio, recebedor, fonte)
         VALUES ($1, $2::date, 'COMPROVANTE DE ENTREGA (SEFAZ)', $3, 'Entrega', $4, '', $5, 'SEFAZ')
         ON CONFLICT (frete_id, data_hora, codigo, dominio) DO NOTHING`,
        [registro.frete_principal_id || registro.id, dados.dhEntrega,
         `Comprovante de entrega do ${dados.tipoDocumento === 'cte' ? `CT-e ${registro.numero_cte || ''}` : 'NF-e'} registrado na SEFAZ${dados.numeroProtocolo ? ` (protocolo ${dados.numeroProtocolo})` : ''}.`,
         String(dados.tpEvento || ''), dados.recebedorNome || null]);
    }
    let anotacao = `📝 ${rotulo}${dados.dhEvento ? ` (${dados.dhEvento.split('-').reverse().join('/')})` : ''}`;
    if (dados.textoDetalhe) anotacao += `: ${dados.textoDetalhe}`;

    let observacoes = registro.observacoes || '';
    if (!observacoes.includes(anotacao)) {
      observacoes = observacoes ? `${observacoes}\n${anotacao}` : anotacao;
    }

    const atualizado = await pool.query(
      'UPDATE fretes SET observacoes = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *',
      [observacoes, registro.id]
    );

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_evento',
      detalhes: `Vinculou um evento (${rotulo}) ao registro #${registro.id} (pedido ${registro.numero_pedido || '—'})`,
      registroId: registro.id,
    });

    res.json({ mensagem: cancelouNfe
      ? `NF-e ${registro.numero_nf || ''} CANCELADA na SEFAZ${dados.dhEvento ? ` em ${dados.dhEvento.split('-').reverse().join('/')}` : ''}${dados.textoDetalhe ? ` (${dados.textoDetalhe})` : ''} — marcada no registro #${registro.id}${registro.chave_cte ? '; o frete fica retido para conferência' : ''} ✓`
      : ehComprovante && dados.dhEntrega
      ? `Comprovante de entrega: entregue em ${dados.dhEntrega.split('-').reverse().join('/')}${dados.recebedorNome ? ` para ${dados.recebedorNome}` : ''} — registro #${registro.id} ✓`
      : `${rotulo} anotado(a) no registro #${registro.id} ✓`, frete: atualizado.rows[0] });
  } catch (err) {
    console.error('[evento]', req.file?.originalname || '', err);
    // Mostra o motivo real junto: a mensagem genérica sozinha não deixa saber o que falhou.
    res.status(500).json({ erro: `Erro ao processar o evento. Confira se o arquivo é um XML de evento válido (Carta de Correção, Cancelamento etc). Detalhe técnico: ${err.message || err}` });
  }
};
router.post('/evento', autenticar, permitir('pode_enviar_xml'), upload.single('arquivo'), tratar_evento);

// Cancelamento que chegou antes da nota: aplica agora.
async function aplicarCancelamentoGuardado(freteId, chaveNfe) {
  if (!chaveNfe) return false;
  const { rows } = await pool.query('SELECT * FROM nfe_canceladas_pendentes WHERE chave_nfe = $1', [chaveNfe]);
  if (!rows[0]) return false;
  const c = rows[0];
  const quando = c.data ? new Date(c.data).toISOString().slice(0, 10).split('-').reverse().join('/') : '';
  const obs = `NF-e CANCELADA na SEFAZ${quando ? ` em ${quando}` : ''}${c.motivo ? ` (${c.motivo})` : ''}${c.protocolo ? ` — protocolo ${c.protocolo}` : ''}.`;
  await pool.query(
    `UPDATE fretes SET nf_cancelada = TRUE, observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $2::text), atualizado_em = NOW()
      WHERE id = $1 OR frete_principal_id = $1`, [freteId, obs]);
  await pool.query('DELETE FROM nfe_canceladas_pendentes WHERE chave_nfe = $1', [chaveNfe]);
  return true;
}

// Registra a devolução a partir do XML da NF-e de devolução (finNFe 4).
async function registrarDevolucaoDoXml(dados, tipo = 'devolucao') {
  const info = String(dados.infCpl || '').replace(/\\+n/g, '\n');   // "\n" escrito como texto no XML vira quebra de linha
  const chaveOrigem = (dados.nf_referenciadas || [])[0] || null;
  const nfOrigem = chaveOrigem ? String(Number(chaveOrigem.slice(25, 34)))
    : ((info.match(/nota\s+fiscal\s+de\s+origem\s*:?\s*(\d{3,9})/i) || [])[1] || null);
  if (!nfOrigem || !dados.numero_nf) return null;
  // Já registrada (XML importado de novo, ou e-mail já colado com esta nota de retorno)?
  const { rows: ja } = await pool.query(`SELECT id FROM trocas_nota WHERE LTRIM(nf_retorno, '0') = LTRIM($1, '0') LIMIT 1`, [String(dados.numero_nf)]);
  if (ja[0]) return null;
  let motivo = ((info.match(/motivo\s+da\s+devolu[cç][aã]o(?:\s+do\s+documento)?\s*:?\s*([\s\S]*?)(?:\n|O\.C\s*:|Valor do IPI|$)/i) || [])[1] || '').trim() || null;
  if (motivo && motivo.length > 300) motivo = `${motivo.slice(0, 297)}…`;
  if (!motivo && tipo === 'retorno') motivo = `Retorno de remessa (${(dados.natureza_operacao || dados.cfops?.join(', ') || 'feira/demonstração')})`;
  const dest = dados.destinatario || {};
  const r = await require('../trocasNota').registrar({
    tipo, nf_original: nfOrigem, nf_retorno: String(dados.numero_nf), cliente: dest.razao_social || null,
    cnpj_cliente: dest.documento || null, motivo, movimentacao: null, mercadoria_com_transportador: false,
    texto: `Registrada pelo XML da NF-e de ${tipo === 'retorno' ? 'retorno de remessa' : 'devolução'} ${dados.numero_nf}${dados.chave_nfe ? ` (chave ${dados.chave_nfe})` : ''}.\n\n${info}`,
  }, { nome: 'XML da NF-e de devolução' }, 'xml');
  return { nfOriginal: nfOrigem, achouOriginal: !!r.feito.original, tipo };
}

/**
 * POST /api/upload/retorno
 * Retorno/recibo da SEFAZ ("-ret.xml"): não tem os dados da nota, então não
 * cria nada. Só diz o que é e, se a SEFAZ informar que a nota/CT-e foi
 * cancelado ou denegado, anota nas Observações do registro (se ele existir).
 */
const SITUACOES_RUINS = { '101': 'cancelada', '151': 'cancelada', '155': 'cancelada', '135': 'com evento registrado',
  '110': 'denegada', '301': 'denegada', '302': 'denegada', '303': 'denegada' };
const tratar_retorno = async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo XML enviado.' });
  try {
    const d = parseRetorno(req.file.buffer.toString('utf-8'));
    const doc = d.tipoDocumento === 'cte' ? 'CT-e' : 'NF-e';
    const numero = d.chave && d.chave.length === 44 ? d.chave.slice(25, 34).replace(/^0+(?=\d)/, '') : null;
    const qual = `${doc}${numero ? ` ${numero}` : ''}`;
    const situacao = `${d.cStat || '?'}${d.xMotivo ? ` — ${d.xMotivo}` : ''}`;
    const ruim = SITUACOES_RUINS[d.cStat];
    if (!ruim || !d.chave) {
      return res.json({ pulado: true, mensagem: `Recibo da SEFAZ (${qual}: ${situacao}) — não traz os dados da ${doc === 'CT-e' ? 'prestação' : 'nota'}, nada a importar. Importe o XML do ${doc} em si.` });
    }
    // Cancelada/denegada: anota no registro, se já existir (não muda status sozinho).
    const coluna = d.tipoDocumento === 'cte' ? 'chave_cte' : 'chave_nfe';
    const { rows } = await pool.query(`SELECT id, observacoes FROM fretes WHERE ${coluna} = $1`, [d.chave]);
    if (!rows[0]) {
      return res.json({ pulado: true, mensagem: `Recibo da SEFAZ: ${qual} ${ruim} (${situacao}). Esse documento não está no sistema — nada a fazer.` });
    }
    const anotacao = `⚠ SEFAZ: ${qual} ${ruim}${d.data ? ` em ${d.data.split('-').reverse().join('/')}` : ''} (${situacao}${d.nProt ? `, protocolo ${d.nProt}` : ''}). Confira.`;
    if (d.tipoDocumento !== 'cte' && ruim === 'cancelada') {
      await pool.query('UPDATE fretes SET nf_cancelada = TRUE, atualizado_em = NOW() WHERE id = $1 OR frete_principal_id = $1', [rows[0].id]);
    }
    if (!(rows[0].observacoes || '').includes(anotacao)) {
      await pool.query(`UPDATE fretes SET observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $1::text), atualizado_em = NOW() WHERE id = $2`, [anotacao, rows[0].id]);
    }
    registrar({ usuarioId: req.usuario?.id, usuarioNome: req.usuario?.nome, acao: 'importar_retorno_sefaz', detalhes: anotacao, registroId: rows[0].id });
    return res.json({ mensagem: `${qual} ${ruim} segundo a SEFAZ — anotado no registro #${rows[0].id}.`, alerta: true });
  } catch (err) {
    console.error('[retorno]', req.file?.originalname || '', err);
    res.status(500).json({ erro: `Erro ao ler o retorno da SEFAZ. Detalhe técnico: ${err.message || err}` });
  }
};
router.post('/retorno', autenticar, permitir('pode_enviar_xml'), upload.single('arquivo'), tratar_retorno);

// POST /api/upload/zip — um .zip cheio de XML (NF-e, CT-e e eventos). Abre o
// zip e importa cada XML de dentro, na ordem certa (notas, CT-e, eventos).
const uploadZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
router.post('/zip', autenticar, permitir('pode_enviar_xml'), uploadZip.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  let xmls;
  try {
    xmls = require('../utils/lerZip').lerXmlDoZip(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }
  const ordem = { nfe: 1, cte: 2, evento: 3, retorno: 4 };
  const itens = xmls.map((x) => ({ ...x, tipo: tipoDoXml(x.buffer.toString('utf-8')) }))
    .sort((a, b) => (ordem[a.tipo] || 9) - (ordem[b.tipo] || 9));
  const resultados = [];
  for (const item of itens) {
    try {
      const r = await importarXmlInterno(item.buffer, item.nome, req.usuario);
      resultados.push({ nome: item.nome, ok: r.ok || r.status === 409, tipo: r.tipo, mensagem: r.mensagem });
    } catch (err) {
      resultados.push({ nome: item.nome, ok: false, tipo: item.tipo, mensagem: err.message });
    }
  }
  if (resultados.some((r) => r.ok)) ctesVinculados.reconciliarCtesSoltos().catch(() => {});
  res.json({ total: resultados.length, resultados });
});

// Importação sem tela (pasta monitorada): roda o mesmo código das rotas,
// com um "usuário" do sistema, e devolve { ok, status, mensagem }.
function tipoDoXml(conteudo) {
  if (conteudo.includes('<infEvento') || conteudo.includes('procEvento') || conteudo.includes('retEvento')) return 'evento';
  if (conteudo.includes('<infCte') || conteudo.includes('cteProc')) return 'cte';
  if (conteudo.includes('<infNFe') || conteudo.includes('nfeProc')) return 'nfe';
  if (/<(protNFe|protCTe|retConsSitNFe|retConsSitCTe|retConsReciNFe|retConsReciCTe|retEnviNFe|retEnviCte|retCTe)\b/.test(conteudo)) return 'retorno';
  return null;
}
async function importarXmlInterno(buffer, nomeArquivo, usuario) {
  const tipo = tipoDoXml(buffer.toString('utf-8'));
  if (!tipo) return { ok: false, tipo: null, status: 400, mensagem: 'Não parece ser XML de NF-e, CT-e, evento ou retorno da SEFAZ.' };
  const tratador = { nfe: tratar_nfe, cte: tratar_cte, evento: tratar_evento, retorno: tratar_retorno }[tipo];
  let status = 200;
  let corpo = null;
  const res = {
    status(c) { status = c; return this; },
    json(o) { corpo = o; return this; },
    send(o) { corpo = o; return this; },
  };
  await tratador({ file: { buffer, originalname: nomeArquivo }, body: {}, query: {}, usuario }, res);
  const ok = status < 400;
  return { ok, tipo, status, mensagem: ok ? (corpo?.mensagem || 'Importado.') : (corpo?.erro || 'Erro ao importar.') };
}

module.exports = router;
module.exports.importarXmlInterno = importarXmlInterno;
module.exports.tipoDoXml = tipoDoXml;
