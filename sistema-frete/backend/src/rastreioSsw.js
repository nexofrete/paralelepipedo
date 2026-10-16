// Rastreamento automático pela SSW (sistema usado por muitas transportadoras,
// ex: FAST-X). Usa a WebAPI oficial e pública da SSW:
//   POST https://ssw.inf.br/api/trackingdanfe   {"chave_nfe": "..."}
// Não precisa de senha: basta a chave da NF-e. Devolve as ocorrências da nota
// (data/hora, cidade, código SSW, tipo "Entrega"/"Informativo", recebedor).
//
// O que o sistema faz com isso, para cada nota sem entrega registrada de uma
// transportadora marcada "Rastreamento pela SSW" no cadastro:
//   - guarda o histórico de ocorrências (tabela ocorrencias_rastreio);
//   - preenche a Data da Entrega (e quem recebeu) quando houver entrega;
//   - só vale a entrega registrada pela transportadora do CT-e (a da tabela
//     de preço). Eventos de outra transportadora (ex.: a do redespacho) ficam
//     só como informação: no histórico e em "Entrega final ao cliente";
//   - guarda a última ocorrência (ex: "ENTREGA AGENDADA P/ 27/08/26") e marca
//     ocorrências de problema (retido, devolução, recusa, avaria...).
// Nunca sobrescreve uma data de entrega lançada à mão.
const cron = require('node-cron');
const pool = require('./db');

const URL_API = 'https://ssw.inf.br/api/trackingdanfe';
const INTERVALO_MS = 800;            // entre uma consulta e outra (não sobrecarregar a SSW)
const LIMITE_POR_RODADA = 400;
const PROBLEMA_RE = /RETID|DEVOLU|RECUS|AVARIA|EXTRAV|SINISTR|AUSENTE|FECHAD|ENDERE[CÇ]O|NAO LOCALIZ|NÃO LOCALIZ|FALTA|ROUBO|FURTO|BLOQUE|IMPEDI/i;
const ENTREGA_RE = /MERCADORIA ENTREGUE|ENTREGA REALIZADA/i;

const dominiosAprendidos = new Map(); // transportadora_id -> código SSW (durante a rodada)
const estado = { rodando: false, total: 0, feitos: 0, entregues: 0, comOcorrencia: 0, erros: 0, inicio: null, fim: null, ultimoErro: null };

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const semAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// "SAO PAULO / SP" -> { cidade: 'SAOPAULO', uf: 'SP' }
function cidadeUf(texto) {
  const [c, u] = String(texto || '').split('/').map((x) => x.trim());
  return { cidade: semAcento(c), uf: semAcento(u) };
}

async function consultarChave(chaveNfe) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 20000);
  try {
    const resp = await fetch(URL_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave_nfe: chaveNfe }), signal: controle.signal,
    });
    if (!resp.ok) throw new Error(`SSW respondeu ${resp.status}`);
    const json = await resp.json();
    if (!json.success) return { encontrado: false, mensagem: json.message || 'Documento não localizado.' };
    return { encontrado: true, tracking: Array.isArray(json.documento?.tracking) ? json.documento.tracking : [] };
  } finally {
    clearTimeout(timer);
  }
}

const ehEntrega = (o) => String(o.tipo || '').toUpperCase() === 'ENTREGA' || String(o.codigo_ssw || '') === '01' || ENTREGA_RE.test(o.ocorrencia || '');
const dataDe = (o) => String(o.data_hora_efetiva || o.data_hora || '').slice(0, 10) || null;


// ---------- Página "Rastreamento pelo remetente" (CNPJ + NF) ----------
// A API pela chave da NF-e traz só UM CT-e — na nota com redespacho, às vezes
// só o da outra transportadora. A página pelo remetente mostra uma linha por
// transportadora (a última ocorrência de cada uma), com o código SSW dela,
// ex.: "MERCADORIA ENTREGUE (XAR SPF 01)". Não é API oficial: se a SSW mudar
// o layout, esta leitura para (e o sistema segue só com a API).
const REMETENTE_URL = 'https://ssw.inf.br/2/resultSSW';
// Campos confirmados no formulário do site (F12 » Payload): cnpj, NR e chave (vazia).
const REMETENTE_CAMPOS = (cnpj, nf) => ({ cnpj, NR: nf, chave: '' });

const textoLimpo = (html) => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&ccedil;/g, 'ç').replace(/&atilde;/g, 'ã')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// Lê as linhas do resultado e devolve no mesmo formato da API (tracking).
function lerPaginaRemetente(html) {
  const eventos = [];
  const linhas = String(html).split(/<tr\b/i).slice(1).filter((l) => /class=["']?titulo/i.test(l));
  for (const linha of linhas) {
    const tds = linha.split(/<td\b/i).slice(1);
    if (tds.length < 3) continue;
    const [nfTexto] = [textoLimpo(tds[0].replace(/^[^>]*>/, ''))];
    const local = textoLimpo(tds[1].replace(/^[^>]*>/, '')).split('\n').filter(Boolean);
    const cidade = local[0] || '';
    const dh = (local.slice(1).join(' ').match(/(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2})/) || []);
    const tituloHtml = (tds[2].match(/<p class=["']?titulo["']?>([\s\S]*?)<\/p>/i) || [])[1] || '';
    const cod = (textoLimpo(tituloHtml).match(/\(\s*([A-Z0-9]{2,5})\s+([A-Z0-9]{2,5})\s+([0-9]{1,3})\s*\)/) || []);
    const titulo = textoLimpo(tituloHtml.replace(/<font[\s\S]*?<\/font>/i, ''));
    const descricao = textoLimpo(((tds[2].match(/<\/b>\s*<p class=["']?tdb["']?>([\s\S]*?)<\/p>/i) || [])[1]) || '');
    if (!dh[0] || !cod[0]) continue;
    const ano = dh[3].length === 2 ? `20${dh[3]}` : dh[3];
    eventos.push({
      data_hora: `${ano}-${dh[2]}-${dh[1]}T${dh[4]}:${dh[5]}:00`, data_hora_efetiva: `${ano}-${dh[2]}-${dh[1]}T${dh[4]}:${dh[5]}:00`,
      cidade, ocorrencia: `${titulo} (${cod[3]})`, descricao, tipo: (cod[3] === '01' || ENTREGA_RE.test(titulo)) ? 'Entrega' : 'Informativo',
      codigo_ssw: cod[3], dominio: cod[1], nome_recebedor: '', nro_doc_recebedor: '', _nf: nfTexto, _fonte: 'remetente',
    });
  }
  return eventos;
}

async function consultarRemetente(cnpj, nf) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 20000);
  try {
    const resp = await fetch(REMETENTE_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(REMETENTE_CAMPOS(cnpj, nf)).toString(), signal: controle.signal,
    });
    if (!resp.ok) throw new Error(`página do remetente respondeu ${resp.status}`);
    const html = await resp.text();
    // Só as linhas desta NF (a página pode listar outras notas do remetente).
    return lerPaginaRemetente(html).filter((e) => String(e._nf).split('\n')[0].split(' ').pop().replace(/^0+/, '') === String(nf).replace(/^0+/, ''));
  } finally {
    clearTimeout(timer);
  }
}

// Aplica o resultado da SSW numa nota (registro principal) e nos CT-e dela.
async function aplicarNaNota(nota, tracking) {
  // Histórico (sem repetir o que já está guardado).
  for (const o of tracking) {
    await pool.query(
      `INSERT INTO ocorrencias_rastreio (frete_id, data_hora, cidade, ocorrencia, descricao, tipo, codigo, dominio, recebedor, fonte)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SSW')
       ON CONFLICT (frete_id, data_hora, codigo, dominio) DO NOTHING`,
      [nota.id, o.data_hora_efetiva || o.data_hora || null, o.cidade || null, o.ocorrencia || null, o.descricao || null,
       o.tipo || null, String(o.codigo_ssw || ''), o.dominio || '', o.nome_recebedor || null]);
  }
  const ordenado = [...tracking].sort((a, b) => String(a.data_hora_efetiva || a.data_hora).localeCompare(String(b.data_hora_efetiva || b.data_hora)));
  // A entrega que conta é a da transportadora do CT-e (a da tabela de preço).
  // Na SSW cada evento traz o "domínio" de quem o registrou; o da
  // transportadora do CT-e é o do primeiro evento (a emissão do documento).
  // Eventos de outra transportadora (ex.: a do redespacho) são só informação:
  // ficam no histórico e na "entrega final ao cliente", sem mudar datas.
  // O código SSW da transportadora é APRENDIDO de uma nota sem redespacho (todos
  // os eventos são dela). Na nota com redespacho a SSW pode devolver só os
  // eventos da outra transportadora, então sem o código conhecido nada ali conta.
  const temRedespacho = !!(nota.redespacho || nota.cidade_redespacho);
  let dominioDaTransportadora = nota.ssw_dominio || (nota.transportadora_id && dominiosAprendidos.get(nota.transportadora_id)) || '';
  const dominiosDaNota = [...new Set(ordenado.map((o) => o.dominio || '').filter(Boolean))];
  if (!dominioDaTransportadora && !temRedespacho && dominiosDaNota.length === 1) {
    dominioDaTransportadora = dominiosDaNota[0];
    if (nota.transportadora_id) {
      dominiosAprendidos.set(nota.transportadora_id, dominioDaTransportadora);
      await pool.query('UPDATE transportadoras SET ssw_dominio = $2 WHERE id = $1 AND ssw_dominio IS NULL', [nota.transportadora_id, dominioDaTransportadora]);
    }
  }
  if (!dominioDaTransportadora && !temRedespacho) dominioDaTransportadora = ordenado[0]?.dominio || '';
  const daTransportadora = (o) => !!dominioDaTransportadora && (o.dominio || '') === dominioDaTransportadora;
  const entregas = ordenado.filter(ehEntrega);
  const cliente = { cidade: semAcento(nota.cidade), uf: semAcento(nota.uf) };
  const noCliente = (o) => { const c = cidadeUf(o.cidade); return c.cidade && c.cidade === cliente.cidade && (!c.uf || !cliente.uf || c.uf === cliente.uf); };

  const entregaDaNota = entregas.find(daTransportadora) || null;                 // vale para o prazo
  const entregaFinal = entregas.find(noCliente) || entregas[entregas.length - 1] || null; // informativo
  const ultima = ordenado[ordenado.length - 1] || null;
  const deOutra = ultima && !daTransportadora(ultima) ? `[Redespacho ${ultima.dominio || ''}] `.replace(' ]', ']') : '';
  const textoUltima = ultima ? `${deOutra}${ultima.ocorrencia || ''}${ultima.descricao ? ` — ${ultima.descricao}` : ''}`.slice(0, 500) : null;
  // Entrega agendada: só o agendamento registrado pela transportadora do CT-e muda o prazo.
  const agendamentos = ordenado.filter(daTransportadora)
    .map((o) => String(o.descricao || '').match(/AGENDAD[AO]\s+(?:P\/?|PARA|PRA)\s*(\d{2})\/(\d{2})\/(\d{2,4})/i)).filter(Boolean);
  const m = agendamentos.pop();
  const dataAgendada = m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}` : null;
  const problema = !entregaDaNota && ultima && !ehEntrega(ultima) && PROBLEMA_RE.test(`${ultima.ocorrencia} ${ultima.descricao}`);

  await pool.query(
    `UPDATE fretes SET
        data_entrega_origem = CASE WHEN data_entrega IS NULL AND $2::date IS NOT NULL THEN 'ssw' ELSE data_entrega_origem END,
        data_entrega = COALESCE(data_entrega, $2::date),
        canhoto_recebido_por = COALESCE(canhoto_recebido_por, NULLIF($3, '')),
        data_entrega_final = COALESCE(data_entrega_final, $4::date),
        rastreio_ultima_ocorrencia = $5, rastreio_ultima_em = $6::timestamp, rastreio_problema = $7,
        rastreio_entrega_agendada = $8::date, rastreio_dominio = NULLIF($9, ''), rastreio_consultado_em = NOW()
      WHERE id = $1`,
    [nota.id, entregaDaNota ? dataDe(entregaDaNota) : null, entregaDaNota?.nome_recebedor || '',
     entregaFinal ? dataDe(entregaFinal) : null, textoUltima, ultima ? (ultima.data_hora_efetiva || ultima.data_hora) : null,
     !!problema, dataAgendada, dominioDaTransportadora]);

  return { entregou: !!entregaDaNota, problema: !!problema };
}

// Notas a consultar: sem entrega registrada, com chave de NF-e, de
// transportadora marcada para rastrear pela SSW. Opcionalmente, só uma
// transportadora (nome, como aparece na lista) ou só alguns ids.
async function notasParaConsultar({ transportadora, ids } = {}) {
  const valores = [];
  const filtros = [];
  if (transportadora) { valores.push(transportadora); filtros.push(`COALESCE(f.transportadora_cte, f.transportadora) = $${valores.length}`); }
  if (ids?.length) { valores.push(ids.map(Number)); filtros.push(`f.id = ANY($${valores.length}::int[])`); }
  const { rows } = await pool.query(
    `SELECT f.id, f.chave_nfe, f.cidade, f.uf, f.redespacho, f.cidade_redespacho,
            tr.id AS transportadora_id, tr.ssw_dominio
       FROM fretes f
       JOIN LATERAL (SELECT t.id, t.ssw_dominio FROM transportadoras t WHERE t.rastreamento_ssw
              AND ((LENGTH(REGEXP_REPLACE(COALESCE(t.cnpj, ''), '[^0-9]', '', 'g')) = 14
                    AND LEFT(REGEXP_REPLACE(t.cnpj, '[^0-9]', '', 'g'), 8) = LEFT(REGEXP_REPLACE(COALESCE(f.transportadora_cnpj_cte, ''), '[^0-9]', '', 'g'), 8))
                OR LOWER(TRIM(t.razao_social)) = LOWER(TRIM(COALESCE(f.transportadora_cte, f.transportadora))))
              ORDER BY t.ssw_dominio IS NULL LIMIT 1) tr ON TRUE
      WHERE f.frete_principal_id IS NULL AND LENGTH(COALESCE(f.chave_nfe, '')) = 44 AND f.chave_cte IS NOT NULL
        AND (f.data_entrega IS NULL OR ((f.redespacho IS NOT NULL OR f.cidade_redespacho IS NOT NULL) AND f.data_entrega_final IS NULL))
        AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND f.nf_retornou IS NOT TRUE
        AND COALESCE(f.data_emissao_cte, f.criado_em::date) >= CURRENT_DATE - 120
        ${filtros.length ? `AND ${filtros.join(' AND ')}` : ''}
      -- Notas sem redespacho primeiro: são elas que ensinam o código SSW da transportadora.
      ORDER BY (f.redespacho IS NULL AND f.cidade_redespacho IS NULL) DESC, f.data_entrega_prevista NULLS LAST
      LIMIT ${LIMITE_POR_RODADA}`, valores);
  return rows;
}

// Roda em segundo plano; a tela acompanha pelo status().
async function iniciar(opcoes = {}) {
  if (estado.rodando) return { jaRodando: true, ...status() };
  const notas = await notasParaConsultar(opcoes);
  // Transportadoras com portal próprio (ex.: Lonngren / Andrade e Abreu).
  // Cada tipo de portal tem o seu módulo (Lonngren = Andrade e Abreu; ldrio = Central de Canhotos da LD Rio).
  const MODULOS = { lonngren: require('./rastreioLonngren'), ldrio: require('./rastreioLdrio') };
  const portais = [];
  for (const m of Object.values(MODULOS)) portais.push(...await m.transportadorasComPortal(opcoes.transportadora).catch(() => []));
  let notasPortal = 0;
  for (const t of portais) notasPortal += (await MODULOS[t.portal_tipo].notasEmAberto(t).catch(() => [])).length;
  Object.assign(estado, { rodando: true, total: notas.length + notasPortal, portalAchou: 0, portalEntregues: 0, portalErro: null, portalNaoAchadas: 0, portalNaoAchadasNfs: [], feitos: 0, entregues: 0, comOcorrencia: 0, erros: 0,
    remetenteConsultas: 0, remetenteAchou: 0, remetenteErro: null,
    inicio: new Date(), fim: null, ultimoErro: null });
  (async () => {
    for (const nota of notas) {
      try {
        const r = await consultarChave(nota.chave_nfe);
        let tracking = r.encontrado ? r.tracking : [];
        // Nota com redespacho sem a entrega da transportadora do CT-e na API:
        // completa com a página "pelo remetente" (CNPJ da empresa + nº da NF).
        const temRedespacho = !!(nota.redespacho || nota.cidade_redespacho);
        const dominio = nota.ssw_dominio || dominiosAprendidos.get(nota.transportadora_id) || '';
        if (temRedespacho && dominio && !tracking.some((o) => (o.dominio || '') === dominio && ehEntrega(o))) {
          try {
            const chave = String(nota.chave_nfe);
            const extras = await consultarRemetente(chave.slice(6, 20), String(Number(chave.slice(25, 34))));
            const ja = new Set(tracking.map((o) => `${o.dominio}|${String(o.data_hora_efetiva || o.data_hora).slice(0, 16)}|${o.codigo_ssw}`));
            for (const e of extras) if (!ja.has(`${e.dominio}|${e.data_hora.slice(0, 16)}|${e.codigo_ssw}`)) tracking.push(e);
            estado.remetenteConsultas += 1;
            if (extras.length) estado.remetenteAchou += 1;
          } catch (err) {
            estado.remetenteErro = err.name === 'AbortError' ? 'a página demorou demais' : err.message;
          }
          await esperar(INTERVALO_MS);
        }
        if (tracking.length) {
          const a = await aplicarNaNota(nota, tracking);
          if (a.entregou) estado.entregues += 1;
          if (a.problema) estado.comOcorrencia += 1;
        } else {
          await pool.query('UPDATE fretes SET rastreio_consultado_em = NOW() WHERE id = $1', [nota.id]);
        }
      } catch (err) {
        estado.erros += 1;
        estado.ultimoErro = err.name === 'AbortError' ? 'A SSW demorou demais para responder.' : err.message;
      }
      estado.feitos += 1;
      await esperar(INTERVALO_MS);
    }
    // Depois da SSW, os portais próprios das transportadoras.
    for (const t of portais) {
      try {
        const r = await MODULOS[t.portal_tipo].sincronizar(t, estado);
        estado.portalAchou += r.consultadas; estado.portalEntregues += r.entregues; estado.entregues += r.entregues;
        estado.portalNaoAchadas = (estado.portalNaoAchadas || 0) + r.naoAchadas;
        estado.portalNaoAchadasNfs = [...(estado.portalNaoAchadasNfs || []), ...r.naoAchadasNfs].slice(0, 30);
        if (r.falhas) estado.portalErro = `${t.razao_social}: ${r.falhas} nota(s) com erro no histórico (${r.ultimoErro})`;
      } catch (err) {
        estado.portalErro = `${t.razao_social}: ${err.name === 'AbortError' ? 'o portal demorou demais' : err.message}`;
      }
    }
    estado.feitos = estado.total;
    estado.rodando = false;
    estado.fim = new Date();
    if (estado.total) console.log(`[ssw] Rastreamento: ${estado.feitos} nota(s) consultada(s), ${estado.entregues} com entrega, ${estado.erros} erro(s).`
      + (estado.remetenteConsultas ? ` Página do remetente: ${estado.remetenteAchou}/${estado.remetenteConsultas} com resultado${estado.remetenteErro ? ` (erro: ${estado.remetenteErro})` : ''}.` : ''));
  })();
  return status();
}

function status() {
  return { ...estado };
}

// Todo dia às 6h30, antes do expediente.
function agendarConsultaDiaria() {
  cron.schedule('30 6 * * *', () => { iniciar().catch((err) => console.error('[ssw]', err.message)); });
}

// Descobre quais transportadoras usam SSW: consulta a nota mais recente de
// cada uma (sem redespacho, pra não confundir com a SSW da outra perna). Se a
// SSW achar a nota com ocorrências, a transportadora é marcada.
async function descobrirTransportadoras() {
  const { rows } = await pool.query(
    `SELECT t.id, t.razao_social,
            (SELECT f.chave_nfe FROM fretes f
              WHERE f.frete_principal_id IS NULL AND LENGTH(COALESCE(f.chave_nfe, '')) = 44 AND f.chave_cte IS NOT NULL
                AND f.redespacho IS NULL AND f.cidade_redespacho IS NULL
                AND COALESCE(f.data_emissao_cte, f.criado_em::date) >= CURRENT_DATE - 90
                AND ((LENGTH(REGEXP_REPLACE(COALESCE(t.cnpj, ''), '[^0-9]', '', 'g')) = 14
                      AND LEFT(REGEXP_REPLACE(t.cnpj, '[^0-9]', '', 'g'), 8) = LEFT(REGEXP_REPLACE(COALESCE(f.transportadora_cnpj_cte, ''), '[^0-9]', '', 'g'), 8))
                  OR LOWER(TRIM(t.razao_social)) = LOWER(TRIM(COALESCE(f.transportadora_cte, f.transportadora))))
              ORDER BY f.data_emissao_cte DESC NULLS LAST LIMIT 1) AS chave_nfe
       FROM transportadoras t WHERE NOT COALESCE(t.rastreamento_ssw, FALSE)`);
  const resultado = { usam: [], naoUsam: [], semNota: [], erros: [] };
  for (const t of rows) {
    if (!t.chave_nfe) { resultado.semNota.push(t.razao_social); continue; }
    try {
      const r = await consultarChave(t.chave_nfe);
      if (r.encontrado && r.tracking.length) {
        await pool.query('UPDATE transportadoras SET rastreamento_ssw = TRUE WHERE id = $1', [t.id]);
        resultado.usam.push(t.razao_social);
      } else {
        resultado.naoUsam.push(t.razao_social);
      }
    } catch (err) {
      resultado.erros.push(t.razao_social);
    }
    await esperar(INTERVALO_MS);
  }
  return resultado;
}

module.exports = { lerPaginaRemetente, consultarRemetente, iniciar, status, agendarConsultaDiaria, consultarChave, aplicarNaNota, descobrirTransportadoras };
