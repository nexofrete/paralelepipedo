const XLSX = require('xlsx');
const fs = require('fs');
const cron = require('node-cron');
const pool = require('./db');

let tarefaAgendada = null;

// Converte um valor de data vindo do Excel (Date, string ou serial) pra 'YYYY-MM-DD'.
function paraDataSql(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  // Texto no formato brasileiro "dd/mm/aaaa" (com ou sem hora): o new Date() leria
  // como mês/dia (06/10 viraria 10 de junho).
  const br = String(valor).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    const iso = `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    const d = new Date(`${iso}T12:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
  }
  const data = new Date(valor);
  return isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

function paraTexto(valor) {
  if (valor == null) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

function paraNumero(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let t = String(valor).trim();
  if (!t) return null;
  // Número escrito em texto no formato brasileiro: "1.234,56" / "22,4453".
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  const num = Number(t);
  return isNaN(num) ? null : num;
}

// Lê o buffer do arquivo .xlsx e devolve um array de objetos já no formato das colunas do sistema.
function mapearPlanilha(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const planilha = workbook.Sheets[workbook.SheetNames[0]];
  // Cabeçalhos com espaço sobrando ou em minúsculas ("QTD_CAIXAS ", "Peso_Kg") valem igual.
  const linhas = XLSX.utils.sheet_to_json(planilha, { defval: null }).map((l) => {
    const n = {};
    Object.entries(l).forEach(([k, v]) => { const c = String(k).trim().toUpperCase(); if (!(c in n) || n[c] == null) n[c] = v; });
    Object.entries(l).forEach(([k, v]) => { if (!(k in n)) n[k] = v; });   // mantém também o nome original (ex.: CdChaveAcessoNFEletronica)
    return n;
  });

  const mapaFreteCifFob = { E: 'CIF', D: 'Destinatário' };

  return linhas.map((linha) => {
    const numeroPedido = paraTexto(linha.NR_PEDIDO);
    if (!numeroPedido) return null;

    const redespacho = paraTexto(linha.REDESPACHO);
    const cidadeRedespacho = paraTexto(linha.CIDADE_REDESPACHO);
    const freteCifFobBruto = paraTexto(linha.FRETE_CIF_FOB);

    return {
      numero_pedido: numeroPedido,
      // Pedido Mercus: só os números ("132237ANTECIPAD" → "132237").
      pedido_mercus: (String(paraTexto(linha.PEDIDO_CLIENTE) || '').match(/\d+/) || [null])[0],
      cliente: paraTexto(linha.NM_CLIENTE),
      cliente_documento: (String(paraTexto(linha.CdCPF_CGC) || '').replace(/\D/g, '')) || null,
      data_pedido: paraDataSql(linha.DT_PEDIDO_LIBERADO),
      numero_nf: paraTexto(linha.NR_NF) || paraTexto(linha.NR_NOTA),
      data_emissao_nf: paraDataSql(linha.DT_EMISSAO_NF),
      numero_mapa: paraTexto(linha.NR_MAPA_CARREGAMENTO),
      chave_nfe: paraTexto(linha.CdChaveAcessoNFEletronica),
      cidade: paraTexto(linha.CIDADE),
      bairro: paraTexto(linha.BAIRRO),
      uf: paraTexto(linha.UF),
      transportadora: paraTexto(linha.TRANSPORTADORA),
      frete_cif_fob: mapaFreteCifFob[freteCifFobBruto] || freteCifFobBruto,
      redespacho,
      cidade_redespacho: cidadeRedespacho,
      valor_faturado: paraNumero(linha.VALOR_FATURADO ?? linha.VlDocumento),
      qtd_volumes: paraNumero(linha.QTD_CAIXAS ?? linha.QTD_VOLUMES),   // volumes = QTD_CAIXAS (QTD_VOLUMES nas planilhas antigas)
      // Peso e cubagem: aceita também os nomes de coluna mais comuns em outros ERPs.
      peso_kg: paraNumero(linha.PESO_KG ?? linha.PESO_BRUTO_KG ?? linha.PESO_BRUTO ?? linha.PESO_TOTAL ?? linha.PESO),
      cubagem_m3: paraNumero(linha.CUBAGEM_M3 ?? linha.CUBAGEM ?? linha.VOLUME_M3 ?? linha.M3),
      // Quantos itens do pedido estão sem medida (cubagem incompleta). > 0 = alerta.
      itens_sem_medida: paraNumero(linha.ITENS_SEM_MEDIDA),
      observacoes: paraTexto(linha.OBSERVACAO_PEDIDO),
      _estatus_pedido: paraTexto(linha.ESTATUS_PEDIDO),
      _nf_cancelada: paraTexto(linha.NF_CANCELADA),
      _nr_nf: paraTexto(linha.NR_NF),
      _nr_nota: paraTexto(linha.NR_NOTA),
    };
  }).filter(Boolean);
}

// Colunas que a importação pode preencher (só entra se o registro já não tiver valor).
const CAMPOS_PREENCHIVEIS = [
  'pedido_mercus', 'cliente', 'cliente_documento', 'data_pedido', 'numero_nf', 'data_emissao_nf',
  'numero_mapa', 'cidade', 'bairro', 'uf', 'transportadora', 'frete_cif_fob',
  'redespacho', 'cidade_redespacho', 'valor_faturado', 'qtd_volumes', 'peso_kg', 'cubagem_m3', 'observacoes', 'itens_sem_medida',
];

// Volumes, peso e cubagem do pedido: enquanto não há NF-e, vale sempre a planilha mais nova
// (o pedido pode mudar até ser faturado); valor gravado 0 também é substituído.
const MEDIDAS = ['qtd_volumes', 'peso_kg', 'cubagem_m3'];

// Monta as mensagens e força status/nf_cancelada quando o ERP indicar cancelamento.
async function aplicarRegrasCancelamento(freteId, linha) {
  const mensagens = [];
  let statusForcado = null;
  let nfCanceladaForcada = null;

  if (linha._estatus_pedido === 'C') {
    mensagens.push('Pedido cancelado no ERP.');
    statusForcado = 'Cancelado';
  }

  if (linha._nf_cancelada === 'S') {
    const numeroNfCancelada = linha._nr_nf || linha.numero_nf || '';
    mensagens.push(`A nota fiscal ${numeroNfCancelada} foi cancelada.`);
    if (linha._nr_nota && linha._nr_nota !== linha._nr_nf) {
      mensagens.push(`Foi refaturada pela nota fiscal ${linha._nr_nota}.`);
    }
    nfCanceladaForcada = true;
  }

  if (mensagens.length === 0 && !statusForcado && !nfCanceladaForcada) return;

  const atual = await pool.query('SELECT observacoes FROM fretes WHERE id = $1', [freteId]);
  let observacoes = atual.rows[0]?.observacoes || '';
  mensagens.forEach((msg) => {
    if (!observacoes.includes(msg)) {
      observacoes = observacoes ? `${observacoes}\n${msg}` : msg;
    }
  });

  const campos = ['observacoes = $1'];
  const valores = [observacoes];
  if (statusForcado) { valores.push(statusForcado); campos.push(`status = $${valores.length}`); }
  if (nfCanceladaForcada) { valores.push(true); campos.push(`nf_cancelada = $${valores.length}`); }
  valores.push(freteId);

  await pool.query(`UPDATE fretes SET ${campos.join(', ')} WHERE id = $${valores.length}`, valores);
}

async function importarLinhas(linhasMapeadas, usuarioId) {
  let criados = 0;
  let aguardando = 0;
  let atualizados = 0;
  let pulados = 0;
  const erros = [];

  for (const linha of linhasMapeadas) {
    try {
      const existente = await pool.query(
        `SELECT id FROM fretes
          WHERE frete_principal_id IS NULL AND NOT cte_cancelado
            AND (numero_pedido = $1 OR ($2::text IS NOT NULL AND LTRIM(numero_nf, '0') = LTRIM($2, '0')))
          ORDER BY (numero_pedido = $1) DESC LIMIT 1`,
        [linha.numero_pedido, linha.numero_nf ? String(linha.numero_nf) : null]);
      let freteId;

      if (existente.rows.length > 0) {
        freteId = existente.rows[0].id;
        const sets = CAMPOS_PREENCHIVEIS.map((c, i) => (MEDIDAS.includes(c)
          ? `${c} = CASE WHEN fretes.chave_nfe IS NULL OR COALESCE(fretes.${c}, 0) = 0 THEN COALESCE($${i + 1}, fretes.${c}) ELSE fretes.${c} END`
          : `${c} = COALESCE(fretes.${c}, $${i + 1})`));
        const valores = CAMPOS_PREENCHIVEIS.map((c) => linha[c]);
        valores.push(freteId);
        await pool.query(
          `UPDATE fretes SET ${sets.join(', ')}, atualizado_em = NOW() WHERE id = $${valores.length}`,
          valores
        );
        // Itens sem medida: vale sempre o da planilha mais nova (o ERP pode ter medido os itens).
        if (linha.itens_sem_medida != null) {
          await pool.query('UPDATE fretes SET itens_sem_medida = $1 WHERE id = $2', [Math.round(linha.itens_sem_medida), freteId]);
        }
        atualizados++;
      } else {
        // A planilha NÃO cria mais registros: o sistema acompanha notas
        // fiscais, e a nota entra pelo XML. A linha fica guardada esperando o
        // XML da NF-e chegar — aí os dados dela são aplicados na hora.
        // (Pedido cancelado ou de exportação nem fica esperando.)
        if (linha._estatus_pedido === 'C' || (linha.cidade || '').trim().toUpperCase() === 'EXTERIOR') {
          pulados++;
          continue;
        }
        await pool.query(
          `INSERT INTO erp_pendentes (numero_pedido, numero_nf, dados) VALUES ($1, $2, $3)
           ON CONFLICT (numero_pedido) DO UPDATE SET numero_nf = EXCLUDED.numero_nf, dados = EXCLUDED.dados, recebido_em = NOW()`,
          [String(linha.numero_pedido), linha.numero_nf ? String(linha.numero_nf).replace(/^0+(?=\d)/, '') : null, JSON.stringify(linha)]
        );
        aguardando++;
        continue;
      }

      await aplicarRegrasCancelamento(freteId, linha);
    } catch (err) {
      erros.push(`Pedido ${linha.numero_pedido}: ${err.message}`);
    }
  }

  return { total: linhasMapeadas.length, criados, atualizados, aguardando, pulados, erros };
}

// Quando o XML da NF-e chega: aplica a linha da planilha que estava esperando
// por essa nota (pelo número do pedido ou da NF). Só preenche o que o XML não
// trouxe e aplica as regras de cancelamento do ERP.
async function aplicarPendenteDaNota(freteId) {
  try {
    const { rows: f } = await pool.query('SELECT id, numero_pedido, numero_nf FROM fretes WHERE id = $1', [freteId]);
    if (!f[0]) return false;
    const { rows } = await pool.query(
      `SELECT * FROM erp_pendentes
        WHERE ($1::text IS NOT NULL AND numero_pedido = $1)
           OR ($2::text IS NOT NULL AND numero_nf = LTRIM($2, '0'))
        ORDER BY (numero_pedido = $1) DESC LIMIT 1`,
      [f[0].numero_pedido, f[0].numero_nf]
    );
    if (!rows[0]) return false;
    const linha = rows[0].dados;
    const sets = CAMPOS_PREENCHIVEIS.map((c, i) => (MEDIDAS.includes(c)
          ? `${c} = CASE WHEN fretes.chave_nfe IS NULL OR COALESCE(fretes.${c}, 0) = 0 THEN COALESCE($${i + 1}, fretes.${c}) ELSE fretes.${c} END`
          : `${c} = COALESCE(fretes.${c}, $${i + 1})`));
    const valores = CAMPOS_PREENCHIVEIS.map((c) => linha[c] ?? null);
    valores.push(linha.numero_pedido, freteId);
    await pool.query(
      `UPDATE fretes SET ${sets.join(', ')}, numero_pedido = COALESCE(numero_pedido, $${valores.length - 1}), atualizado_em = NOW()
        WHERE id = $${valores.length}`, valores);
    await aplicarRegrasCancelamento(freteId, linha);
    await pool.query('DELETE FROM erp_pendentes WHERE numero_pedido = $1', [rows[0].numero_pedido]);
    return true;
  } catch (err) {
    console.error('[erp] Não consegui aplicar a planilha pendente:', err.message);
    return false;
  }
}

// Registros antigos que vieram SÓ da planilha (sem XML de NF-e nem CT-e e sem
// nada lançado neles) voltam a ficar "aguardando o XML". Com simular=true, só conta.
async function devolverParaAguardandoXml(simular) {
  const CONDICAO = `chave_nfe IS NULL AND chave_cte IS NULL AND frete_principal_id IS NULL AND numero_pedido IS NOT NULL
      AND fatura_id IS NULL AND data_entrega IS NULL AND canhoto_registrado_em IS NULL AND carga_direta IS NOT TRUE
      AND COALESCE(status, 'Pendente') IN ('Pendente', 'Cancelado')
      AND NOT EXISTS (SELECT 1 FROM fretes fi WHERE fi.frete_principal_id = fretes.id)
      AND NOT EXISTS (SELECT 1 FROM sinistros s WHERE s.numero_pedido = fretes.numero_pedido)`;
  const { rows: contagem } = await pool.query(`SELECT COUNT(*)::int AS qtd FROM fretes WHERE ${CONDICAO}`);
  if (simular) return { qtd: contagem[0].qtd };
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(
      `INSERT INTO erp_pendentes (numero_pedido, numero_nf, dados)
       SELECT numero_pedido, LTRIM(numero_nf, '0'),
              JSONB_STRIP_NULLS(JSONB_BUILD_OBJECT(
                'numero_pedido', numero_pedido, 'pedido_mercus', pedido_mercus, 'cliente', cliente, 'data_pedido', data_pedido,
                'numero_nf', numero_nf, 'data_emissao_nf', data_emissao_nf, 'numero_mapa', numero_mapa, 'cidade', cidade, 'bairro', bairro,
                'uf', uf, 'transportadora', transportadora, 'frete_cif_fob', frete_cif_fob, 'redespacho', redespacho,
                'cidade_redespacho', cidade_redespacho, 'valor_faturado', valor_faturado, 'qtd_volumes', qtd_volumes,
                'peso_kg', peso_kg, 'cubagem_m3', cubagem_m3, 'observacoes', observacoes,
                '_estatus_pedido', CASE WHEN status = 'Cancelado' THEN 'C' END,
                '_nf_cancelada', CASE WHEN nf_cancelada THEN 'S' END))
         FROM fretes WHERE ${CONDICAO}
       ON CONFLICT (numero_pedido) DO NOTHING`);
    const { rowCount } = await cliente.query(`DELETE FROM fretes WHERE ${CONDICAO}`);
    await cliente.query('COMMIT');
    return { qtd: rowCount };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

async function importarBuffer(buffer, usuarioId) {
  const linhas = mapearPlanilha(buffer);
  const resultado = await importarLinhas(linhas, usuarioId);
  // Notas novas da planilha podem ser as de CT-e que chegaram antes: junta.
  await require('./ctesVinculados').reconciliarCtesSoltos().catch(() => {});
  return resultado;
}

async function buscarConfiguracao() {
  const { rows } = await pool.query('SELECT * FROM configuracao_importacao_erp WHERE id = 1');
  if (rows[0]) return rows[0];
  const inserido = await pool.query('INSERT INTO configuracao_importacao_erp (id) VALUES (1) RETURNING *');
  return inserido.rows[0];
}

async function salvarConfiguracao(dados) {
  const campos = ['ativo', 'caminho_arquivo', 'intervalo_minutos'];
  const presentes = campos.filter((c) => dados[c] !== undefined);
  if (presentes.length === 0) return buscarConfiguracao();

  await pool.query('INSERT INTO configuracao_importacao_erp (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const sets = presentes.map((c, i) => `${c} = $${i + 1}`);
  const valores = presentes.map((c) => dados[c]);
  const { rows } = await pool.query(
    `UPDATE configuracao_importacao_erp SET ${sets.join(', ')} WHERE id = 1 RETURNING *`,
    valores
  );
  return rows[0];
}

// Verifica se o arquivo configurado mudou desde a última importação; se sim, importa de novo.
async function verificarEImportarSeMudou(forcarManual = false) {
  const config = await buscarConfiguracao();

  // A verificação automática (agendada) respeita o "ativo"; já o clique manual
  // no botão "Verificar e importar agora" deve funcionar mesmo se a
  // verificação automática estiver desligada.
  if (!forcarManual && !config.ativo) return;

  if (!config.caminho_arquivo) {
    await pool.query(
      `UPDATE configuracao_importacao_erp SET
         ultima_importacao_em = NOW(), ultima_importacao_status = 'erro',
         ultima_importacao_mensagem = 'Nenhum caminho de arquivo configurado.'
       WHERE id = 1`
    );
    return;
  }

  try {
    if (!fs.existsSync(config.caminho_arquivo)) {
      throw new Error(`Arquivo não encontrado: ${config.caminho_arquivo}`);
    }
    const stat = fs.statSync(config.caminho_arquivo);
    const mtime = Math.floor(stat.mtimeMs);

    if (config.ultimo_mtime_importado && Number(config.ultimo_mtime_importado) === mtime) {
      // Arquivo não mudou desde a última vez — ainda assim avisa (não fica em silêncio).
      await pool.query(
        `UPDATE configuracao_importacao_erp SET
           ultima_importacao_em = NOW(), ultima_importacao_status = 'sucesso',
           ultima_importacao_mensagem = 'Verificado — o arquivo não mudou desde a última importação, nada novo pra importar.'
         WHERE id = 1`
      );
      return;
    }

    const buffer = fs.readFileSync(config.caminho_arquivo);
    const resultado = await importarBuffer(buffer, null);

    await pool.query(
      `UPDATE configuracao_importacao_erp SET
         ultimo_mtime_importado = $1, ultima_importacao_em = NOW(),
         ultima_importacao_status = 'sucesso',
         ultima_importacao_mensagem = $2
       WHERE id = 1`,
      [mtime, `${resultado.criados} criados, ${resultado.atualizados} atualizados${resultado.pulados ? `, ${resultado.pulados} pulado(s) (cancelados sem nota)` : ''}${resultado.erros.length ? `, ${resultado.erros.length} erro(s)` : ''}`]
    );
  } catch (err) {
    await pool.query(
      `UPDATE configuracao_importacao_erp SET
         ultima_importacao_em = NOW(), ultima_importacao_status = 'erro', ultima_importacao_mensagem = $1
       WHERE id = 1`,
      [err.message]
    );
  }
}

async function reagendarMonitor() {
  if (tarefaAgendada) {
    tarefaAgendada.stop();
    tarefaAgendada = null;
  }
  const config = await buscarConfiguracao();
  if (!config.ativo) return;

  const minutos = Math.max(Number(config.intervalo_minutos) || 15, 1);
  tarefaAgendada = cron.schedule(`*/${minutos} * * * *`, () => {
    verificarEImportarSeMudou().catch((err) => console.error('Importação ERP falhou:', err.message));
  });
}

module.exports = {
  aplicarPendenteDaNota, devolverParaAguardandoXml,
  importarBuffer,
  buscarConfiguracao,
  salvarConfiguracao,
  verificarEImportarSeMudou,
  reagendarMonitor,
};
