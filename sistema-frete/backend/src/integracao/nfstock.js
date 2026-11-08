// NF-Stock (Alterdata): os XML fiscais da empresa guardados no NF-Stock, nos dois sentidos.
//  • Buscar (MS-Exportação): GET /api/v1/{codigoCrm}/{cnpj}/documentos/{nsu}/novos?Tamanho=&Xml=true
//    traz os documentos novos a partir do último NSU. Cada XML segue o caminho de quem é:
//      - NF-e emitida pela empresa (embarcador) → "Enviar XML" (fretes);
//      - NF-e de outro emitente → NF-e contra o CNPJ (entrada, ou carga sem CT-e quando a empresa é a transportadora);
//      - CT-e de transportadora → CT-e recebidos; CT-e da própria empresa → fica de fora (já está em CT-e emitidos);
//      - eventos (cancelamento, carta de correção) → aplicados no documento;
//      - NFS-e e outros → só registrados.
//  • Enviar (MS-Importação): os CT-e (com os eventos), MDF-e e NFS-e autorizados em produção vão para o NF-Stock:
//    POST /storage {size, extension} → {url, id}; PUT do arquivo na url (vale 1 minuto); GET /storage/arquivo/{id}
//    → status "Uploaded" (importado) ou "Com Erro" (motivo no log).
//  • Autenticação: Authorization: Bearer <token> (gerado no NF-Stock em Opções da Conta » Integração),
//    guardado criptografado. Ambiente "simulador": tudo responde aqui mesmo, para testar sem a Alterdata.
const zlib = require('zlib');
const pool = require('../db');
const Doc = require('../utils/documento');
const { criptografar, descriptografar } = require('../cte/certificado');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const URLS = {
  exportacao: { producao: 'https://ms-exportacao-nfstock.pack.alterdata.com.br', desenvolvimento: 'https://ms-exportacao.dev.pack.alterdata.com.br' },
  importacao: { producao: 'https://ms-importacao-service-nfstock.alterdatasoftware.com.br', desenvolvimento: 'https://ms-importacao-service-nfstock.alterdatasoftware.com.br' },
};
const AMBIENTES = ['producao', 'desenvolvimento', 'simulador'];
const TIPOS_ENVIO = { cte: 'CT-e', cte_evento: 'Eventos do CT-e', mdfe: 'MDF-e', nfse: 'NFS-e' };
const TAMANHO_PAGINA = 50;
const LIMITE_BYTES = 30 * 1000 * 1000;   // a MS-Importação aceita até 30 MB

// ---------------------------------------------------------------- configuração
async function config() {
  await pool.query('INSERT INTO configuracao_nfstock (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const { rows: [c] } = await pool.query('SELECT * FROM configuracao_nfstock WHERE id = 1');
  return c;
}
const dataIso = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
// Documento emitido antes da data "buscar desde" (pela data de emissão, no horário de Brasília). Sem data: não pula.
function antesDe(d, desde) {
  if (!desde || !d?.data_emissao) return false;
  const t = Date.parse(d.data_emissao);
  if (!Number.isFinite(t)) return false;
  return new Date(t - 3 * 3600000).toISOString().slice(0, 10) < dataIso(desde);
}
const paraTela = (c) => ({
  busca_ativa: c.busca_ativa, envio_ativo: c.envio_ativo, tem_token: !!c.token, codigo_crm: c.codigo_crm, cnpj: c.cnpj, ambiente: c.ambiente,
  intervalo_min: c.intervalo_min, enviar_desde: c.enviar_desde ? String(c.enviar_desde instanceof Date ? c.enviar_desde.toISOString() : c.enviar_desde).slice(0, 10) : null,
  enviar_tipos: c.enviar_tipos, estado: c.estado || {}, buscar_desde: dataIso(c.buscar_desde),
});
const crm6 = (v) => { const d = String(v || '').replace(/\D/g, ''); return d ? d.padStart(6, '0').slice(-6) : ''; };

async function salvarConfig(b = {}) {
  const atual = await config();
  const ambiente = AMBIENTES.includes(b.ambiente) ? b.ambiente : atual.ambiente;
  const crm = b.codigo_crm !== undefined ? crm6(b.codigo_crm) : atual.codigo_crm;
  const cnpj = b.cnpj !== undefined ? Doc.limpar(b.cnpj) : atual.cnpj;
  if (cnpj && ![11, 14].includes(cnpj.length)) throw falha('CNPJ/CPF inválido.');
  const tipos = Array.isArray(b.enviar_tipos) ? b.enviar_tipos.filter((t) => TIPOS_ENVIO[t]) : atual.enviar_tipos;
  const intervalo = b.intervalo_min !== undefined ? Math.min(1440, Math.max(15, Number(b.intervalo_min) || 30)) : atual.intervalo_min;
  let desde = b.enviar_desde !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(String(b.enviar_desde || '')) ? b.enviar_desde : null) : atual.enviar_desde;
  const envio = b.envio_ativo !== undefined ? !!b.envio_ativo : atual.envio_ativo;
  if (envio && !desde) desde = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);   // ligou o envio: a partir de hoje
  const busca = b.busca_ativa !== undefined ? !!b.busca_ativa : atual.busca_ativa;
  const token = String(b.token_novo || '').trim();
  const buscarDesde = b.buscar_desde !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(String(b.buscar_desde || '')) ? b.buscar_desde : null) : atual.buscar_desde;
  let nsuInicial = null;
  if (b.nsu_inicial !== undefined && b.nsu_inicial !== null && String(b.nsu_inicial).trim() !== '') {
    const txt = String(b.nsu_inicial).trim().replace(/[.\s]/g, '');
    nsuInicial = /^\d+$/.test(txt) ? Number(txt) : NaN;
    if (!Number.isSafeInteger(nsuInicial)) throw falha('NSU inválido: use só números (0 = desde o começo).');
  }
  if ((busca || envio) && ambiente !== 'simulador') {
    if (!token && !atual.token) throw falha('Informe o token do NF-Stock (Opções da Conta » Integração no site do NF-Stock).');
    if (!crm) throw falha('Informe o código CRM da Alterdata.');
    if (!cnpj) throw falha('Informe o CNPJ da empresa no NF-Stock.');
  }
  await pool.query(`UPDATE configuracao_nfstock SET busca_ativa = $1, envio_ativo = $2, codigo_crm = $3, cnpj = $4, ambiente = $5, intervalo_min = $6,
      enviar_desde = $7, enviar_tipos = $8, token = COALESCE($9, token), buscar_desde = $10, atualizado_em = NOW() WHERE id = 1`,
  [busca, envio, crm || null, cnpj || null, ambiente, intervalo, desde, tipos, token ? criptografar(Buffer.from(token, 'utf8')) : null, buscarDesde]);
  // "Começar a partir do NSU": a próxima busca pede o que vem DEPOIS dele (0 = tudo desde o começo).
  if (nsuInicial !== null) await salvarEstado({ ult_nsu: nsuInicial, nsu_definido: nsuInicial, nsu_definido_em: new Date().toISOString() });
  if (b.remover_token) await pool.query('UPDATE configuracao_nfstock SET token = NULL, busca_ativa = FALSE, envio_ativo = FALSE WHERE id = 1');
  return paraTela(await config());
}
async function salvarEstado(m) {
  await pool.query(`UPDATE configuracao_nfstock SET estado = COALESCE(estado, '{}'::jsonb) || $1::jsonb WHERE id = 1`, [JSON.stringify(m)]);
}

// ---------------------------------------------------------------- HTTP
function tokenDe(c) {
  if (c.ambiente === 'simulador') return 'simulador';
  if (!c.token) throw falha('Cadastre o token do NF-Stock.');
  try { return descriptografar(c.token).toString('utf8'); } catch { throw falha('Não consegui ler o token guardado: informe de novo.'); }
}
async function pedir(url, opcoes = {}, tempo = 30000) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), tempo);
  try {
    const r = await fetch(url, { ...opcoes, signal: controle.signal });
    const texto = await r.text();
    let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { /* não é JSON */ }
    if (r.status === 401 || r.status === 403) throw falha('O NF-Stock recusou o token (HTTP ' + r.status + '): confira o token, o código CRM e o CNPJ.', 502);
    if (!r.ok) throw falha(`O NF-Stock respondeu HTTP ${r.status}${json?.mensagem || json?.message ? `: ${json.mensagem || json.message}` : texto ? `: ${texto.slice(0, 200)}` : ''}`, 502);
    return json ?? texto;
  } catch (e) {
    if (e.name === 'AbortError') throw falha('O NF-Stock não respondeu a tempo (30 s).', 504);
    if (e.status) throw e;
    throw falha(`Sem conexão com o NF-Stock: ${e.cause?.code || e.message}`, 502);
  } finally { clearTimeout(timer); }
}
const http = {
  async novos(c, nsu, { tamanho = TAMANHO_PAGINA, xml = true } = {}) {
    if (c.ambiente === 'simulador') return simulador.novos(c, nsu, tamanho);
    const url = `${URLS.exportacao[c.ambiente]}/api/v1/${crm6(c.codigo_crm)}/${Doc.limpar(c.cnpj)}/documentos/${Number(nsu) || 0}/novos?Tamanho=${tamanho}&Xml=${xml}`;
    return pedir(url, { headers: { Authorization: `Bearer ${tokenDe(c)}`, Accept: 'application/json' } });
  },
  async baixar(c, url) {
    if (c.ambiente === 'simulador') return simulador.baixar(url);
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 30000);
    try {
      const r = await fetch(url, { signal: controle.signal });
      if (!r.ok) throw falha(`Download do XML falhou (HTTP ${r.status}).`, 502);
      return Buffer.from(await r.arrayBuffer());
    } finally { clearTimeout(timer); }
  },
  async pedirUrl(c, tamanho) {
    if (c.ambiente === 'simulador') return simulador.pedirUrl(tamanho);
    return pedir(`${URLS.importacao[c.ambiente]}/storage`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDe(c)}` }, body: JSON.stringify({ size: tamanho, extension: '.xml' }) });
  },
  async subir(c, url, buffer) {
    if (c.ambiente === 'simulador') return simulador.subir(url, buffer);
    // URL assinada da Amazon: sem Content-Type (ele entraria na assinatura) e sem o token.
    return pedir(url, { method: 'PUT', body: buffer }, 60000);
  },
  async status(c, id) {
    if (c.ambiente === 'simulador') return simulador.status(id);
    return pedir(`${URLS.importacao[c.ambiente]}/storage/arquivo/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${tokenDe(c)}`, Accept: 'application/json' } });
  },
};

// ---------------------------------------------------------------- buscar (MS-Exportação)
// O campo "xml" pode vir como texto, base64, gzip ou .zip; sem ele, baixa pela url_download.
function xmlsDoConteudo(buf) {
  if (!buf || !buf.length) return [];
  if (buf[0] === 0x1f && buf[1] === 0x8b) return xmlsDoConteudo(zlib.gunzipSync(buf));
  if (buf[0] === 0x50 && buf[1] === 0x4b) return require('../utils/lerZip').lerXmlDoZip(buf).map((a) => a.buffer.toString('utf8'));
  const t = buf.toString('utf8').replace(/^﻿/, '').trim();
  return t.startsWith('<') ? [t] : [];
}
async function xmlsDoDocumento(c, d) {
  const bruto = typeof d.xml === 'string' ? d.xml.trim() : '';
  if (bruto.startsWith('<')) return [bruto];
  if (bruto) {
    const lista = xmlsDoConteudo(Buffer.from(bruto, 'base64'));
    if (lista.length) return lista;
  }
  if (d.url_download) return xmlsDoConteudo(await http.baixar(c, d.url_download));
  return [];
}

const tag = (xml, nome) => { const m = new RegExp(`<(?:\\w+:)?${nome}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(xml || ''); return m ? m[1].trim() : null; };
const USUARIO = { id: null, nome: 'NF-Stock (Alterdata)', perfil: 'admin', pode_ver_todos: true };

// Um XML: decide para onde vai. Devolve { resultado, mensagem }.
async function rotear(xml, cnpjEmpresa, nome) {
  const { importarXmlInterno, tipoDoXml } = require('../routes/upload');
  const tipo = tipoDoXml(xml);
  const emitBloco = (/<emit>([\s\S]*?)<\/emit>/.exec(xml) || [])[1] || '';
  const emitente = Doc.limpar(tag(emitBloco, 'CNPJ') || tag(emitBloco, 'CPF'));
  const viaUpload = async (rotulo) => {
    const r = await importarXmlInterno(Buffer.from(xml, 'utf8'), nome, USUARIO);
    return { resultado: r.ok ? 'importado' : r.status === 409 ? 'ja_existia' : 'erro', mensagem: `${rotulo}: ${r.mensagem}` };
  };
  if (tipo === 'cte') {
    if (emitente && emitente === cnpjEmpresa) return { resultado: 'proprio', mensagem: 'CT-e emitido pela própria empresa (já está em CT-e emitidos).' };
    return viaUpload('CT-e recebido');
  }
  if (tipo === 'nfe') {
    if (emitente && emitente === cnpjEmpresa) return viaUpload('NF-e emitida pela empresa');
    // Nota de outro emitente: NF-e contra o CNPJ (entrada ou carga da transportadora).
    const r = await require('../dfe').processarDoc({ nsu: null, schema: 'procNFe_v4.00.xsd', xml }, { cnpj: cnpjEmpresa });
    return { resultado: r === 'novo' ? 'importado' : 'ja_existia', mensagem: r === 'novo' ? 'NF-e de outro emitente: entrou em NF-e contra o CNPJ.' : 'NF-e de outro emitente: já estava em NF-e contra o CNPJ.' };
  }
  if (tipo === 'evento') {
    const r = await viaUpload(`Evento ${tag(xml, 'descEvento') || ''}`.trim());
    if (/<chNFe>/.test(xml) && tag(xml, 'tpEvento') === '110111') {
      await require('../dfe').processarDoc({ nsu: null, schema: 'procEventoNFe_v1.00.xsd', xml }, { cnpj: cnpjEmpresa }).catch(() => null);
    }
    return r.resultado === 'erro' && /não encontr|nenhum/i.test(r.mensagem) ? { resultado: 'ignorado', mensagem: r.mensagem } : r;
  }
  if (/<(?:\w+:)?(CompNfse|NFSe|Nfse|infNFSe|InfNfse)\b/.test(xml)) return { resultado: 'ignorado', mensagem: 'NFS-e: guardada só no registro (o sistema não lança NFS-e de terceiros).' };
  return { resultado: 'ignorado', mensagem: 'Documento que o sistema não usa.' };
}

async function registrarDoc(d, campos) {
  await pool.query(`INSERT INTO nfstock_docs (nsu, chave, modelo, tipo, status_doc, emissao, resultado, mensagem) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (nsu) DO UPDATE SET resultado = EXCLUDED.resultado, mensagem = EXCLUDED.mensagem, criado_em = NOW()`,
  [d.nsu, String(d.chave || '').slice(0, 60) || null, String(d.modelo || '').slice(0, 20) || null, String(d.tipo || '').slice(0, 20) || null,
    String(d.status || '').slice(0, 30) || null, d.data_emissao || null, campos.resultado, String(campos.mensagem || '').slice(0, 500) || null]);
}

let buscando = null;
async function buscar({ automatico = false } = {}) {
  if (buscando) return buscando;
  buscando = (async () => {
    const c = await config();
    if (c.ambiente !== 'simulador' && (!c.codigo_crm || !c.cnpj)) throw falha('Configure o código CRM e o CNPJ do NF-Stock.');
    const cnpjEmpresa = Doc.limpar(c.cnpj) || Doc.limpar((await pool.query('SELECT cnpj FROM empresa WHERE id = 1')).rows[0]?.cnpj);
    let ult = Number(c.estado?.ult_nsu) || 0;
    const cont = { documentos: 0, importados: 0, ja_existiam: 0, proprios: 0, ignorados: 0, erros: 0, antigos: 0 };
    try {
      // Até 40 páginas com documentos de verdade por busca; as páginas só de documentos antigos (antes de "buscar desde") não contam, até 400.
      for (let rodada = 0, uteis = 0; rodada < 400 && uteis < 40; rodada += 1) {
        const r = await http.novos(c, ult);
        const todos = (Array.isArray(r?.documentos) ? r.documentos : []).filter((d) => Number(d.nsu) > ult).sort((a, b) => Number(a.nsu) - Number(b.nsu));
        if (!todos.length) break;
        const docs = todos.filter((d) => !antesDe(d, c.buscar_desde));
        cont.antigos += todos.length - docs.length;
        if (!docs.length) {
          ult = Math.max(ult, ...todos.map((d) => Number(d.nsu)));
          await salvarEstado({ ult_nsu: ult });
          if (todos.length < TAMANHO_PAGINA) break;
          continue;
        }
        uteis += 1;
        // Primeiro os documentos, depois os eventos (o evento precisa achar o documento).
        const ordem = [];
        for (const d of docs) {
          let xmls = [];
          try { xmls = await xmlsDoDocumento(c, d); } catch (e) { ordem.push({ d, erro: e.message }); continue; }
          if (!xmls.length) ordem.push({ d, erro: 'O NF-Stock não mandou o XML deste documento.' });
          xmls.forEach((x, i) => ordem.push({ d, xml: x, i, evento: /procEvento|<infEvento/.test(x) }));
        }
        ordem.sort((a, b) => (a.evento ? 1 : 0) - (b.evento ? 1 : 0));
        const porNsu = new Map();
        for (const it of ordem) {
          let res;
          if (it.erro) res = { resultado: 'erro', mensagem: it.erro };
          else {
            try { res = await rotear(it.xml, cnpjEmpresa, `NF-Stock NSU ${it.d.nsu}${it.i ? `-${it.i}` : ''}.xml`); } catch (e) { res = { resultado: 'erro', mensagem: e.message }; }
          }
          // Um NSU com vários XML (zip): fica o pior resultado.
          const PESO = { erro: 4, importado: 3, ja_existia: 2, proprio: 1, ignorado: 0 };
          const antes = porNsu.get(it.d.nsu);
          if (!antes || PESO[res.resultado] > PESO[antes.resultado]) porNsu.set(it.d.nsu, res);
        }
        for (const d of docs) {
          const res = porNsu.get(d.nsu) || { resultado: 'erro', mensagem: 'Sem XML.' };
          await registrarDoc(d, res);
          cont.documentos += 1;
          const k = { importado: 'importados', ja_existia: 'ja_existiam', proprio: 'proprios', ignorado: 'ignorados', erro: 'erros' }[res.resultado];
          cont[k] += 1;
          ult = Math.max(ult, Number(d.nsu));
        }
        ult = Math.max(ult, ...todos.map((d) => Number(d.nsu)));
        await salvarEstado({ ult_nsu: ult });
        if (todos.length < TAMANHO_PAGINA) break;
      }
      await salvarEstado({ ultima_busca: new Date().toISOString(), ultimo_resultado: cont, erro_busca: null });
      return { ...cont, ult_nsu: ult, automatico };
    } catch (e) {
      await salvarEstado({ ultima_busca: new Date().toISOString(), erro_busca: e.message });
      throw e;
    }
  })();
  try { return await buscando; } finally { buscando = null; }
}

// ---------------------------------------------------------------- enviar (MS-Importação)
async function enfileirar(c) {
  if (!c.envio_ativo || !c.enviar_desde) return 0;
  const tipos = c.enviar_tipos || [];
  // Só produção (o que vale para a contabilidade); no simulador, também a homologação/demonstração.
  const amb = c.ambiente === 'simulador' ? 'TRUE' : 'ambiente = 1';
  let n = 0;
  const ins = async (sql) => { n += (await pool.query(sql, [c.enviar_desde])).rowCount; };
  if (tipos.includes('cte')) {
    await ins(`INSERT INTO nfstock_envios (origem, ref, chave) SELECT 'cte', 'cte:' || id, chave FROM ctes_emitidos
      WHERE ${amb} AND xml_autorizado IS NOT NULL AND autorizado_em >= $1::date ON CONFLICT (ref) DO NOTHING`);
  }
  if (tipos.includes('cte_evento')) {
    await ins(`INSERT INTO nfstock_envios (origem, ref, chave) SELECT 'cte_evento', 'cte_evento:' || c.id || ':' || (e.n - 1), c.chave
      FROM ctes_emitidos c, jsonb_array_elements(COALESCE(c.eventos, '[]'::jsonb)) WITH ORDINALITY e(ev, n)
      WHERE ${amb.replace('ambiente', 'c.ambiente')} AND (e.ev->>'ok')::boolean AND e.ev->>'xml' IS NOT NULL AND COALESCE((e.ev->>'em')::timestamptz, NOW()) >= $1::date
      ON CONFLICT (ref) DO NOTHING`);
  }
  if (tipos.includes('mdfe')) {
    await ins(`INSERT INTO nfstock_envios (origem, ref, chave) SELECT 'mdfe', 'mdfe:' || id, chave FROM mdfes
      WHERE ${amb} AND xml_autorizado IS NOT NULL AND autorizado_em >= $1::date ON CONFLICT (ref) DO NOTHING`);
  }
  if (tipos.includes('nfse')) {
    await ins(`INSERT INTO nfstock_envios (origem, ref, chave) SELECT 'nfse', 'nfse:' || id, chave FROM nfse_emitidas
      WHERE ${amb} AND xml_nfse IS NOT NULL AND autorizada_em >= $1::date ON CONFLICT (ref) DO NOTHING`);
  }
  return n;
}

async function xmlDoEnvio(ref) {
  const [origem, id, idx] = String(ref).split(':');
  const um = async (sql) => (await pool.query(sql, [Number(id)])).rows[0];
  if (origem === 'cte') return (await um('SELECT xml_autorizado AS x FROM ctes_emitidos WHERE id = $1'))?.x;
  if (origem === 'cte_evento') return (await um('SELECT eventos FROM ctes_emitidos WHERE id = $1'))?.eventos?.[Number(idx)]?.xml;
  if (origem === 'mdfe') return (await um('SELECT xml_autorizado AS x FROM mdfes WHERE id = $1'))?.x;
  if (origem === 'nfse') return (await um('SELECT xml_nfse AS x FROM nfse_emitidas WHERE id = $1'))?.x;
  return null;
}

let enviando = null;
async function enviar() {
  if (enviando) return enviando;
  enviando = (async () => {
    const c = await config();
    const cont = { enfileirados: await enfileirar(c), enviados: 0, importados: 0, recusados: 0, erros: 0 };
    // 1) Manda os pendentes (e tenta de novo os que falharam na conexão: 15 min, 30 min, 45 min... até 6 vezes).
    const { rows } = await pool.query(`SELECT id, ref FROM nfstock_envios WHERE status = 'pendente'
        OR (status = 'erro' AND tentativas < 6 AND atualizado_em < NOW() - (tentativas * INTERVAL '15 minutes')) ORDER BY id LIMIT 100`);
    for (const e of rows) {
      try {
        const xml = await xmlDoEnvio(e.ref);
        if (!xml) throw falha('O XML do documento não está mais no sistema.');
        const buf = Buffer.from(xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8"?>${xml}`, 'utf8');
        if (buf.length > LIMITE_BYTES) throw falha('Arquivo maior que 30 MB.');
        const r = await http.pedirUrl(c, buf.length);
        if (!r?.url || !r?.id) throw falha(`O NF-Stock não devolveu a URL de envio${r?.mensagem ? `: ${r.mensagem}` : ''}.`);
        await http.subir(c, r.url, buf);   // a URL vale 1 minuto: sobe na hora
        await pool.query(`UPDATE nfstock_envios SET status = 'enviado', remoto_id = $2, tamanho = $3, log = NULL, tentativas = tentativas + 1, enviado_em = NOW(), atualizado_em = NOW() WHERE id = $1`, [e.id, String(r.id), buf.length]);
        cont.enviados += 1;
      } catch (err) {
        await pool.query(`UPDATE nfstock_envios SET status = 'erro', log = $2, tentativas = tentativas + 1, atualizado_em = NOW() WHERE id = $1`, [e.id, String(err.message).slice(0, 1000)]);
        cont.erros += 1;
        if (err.status === 502 && /token/i.test(err.message)) break;   // token recusado: não adianta continuar
      }
    }
    // 2) Confere a importação dos enviados.
    const { rows: env } = await pool.query(`SELECT id, remoto_id FROM nfstock_envios WHERE status = 'enviado' AND remoto_id IS NOT NULL ORDER BY id LIMIT 200`);
    for (const e of env) {
      try {
        const s = await http.status(c, e.remoto_id);
        const st = String(s?.status || '');
        if (/^uploaded$/i.test(st)) {
          await pool.query(`UPDATE nfstock_envios SET status = 'importado', log = NULL, importado_em = NOW(), atualizado_em = NOW() WHERE id = $1`, [e.id]);
          cont.importados += 1;
        } else if (/erro/i.test(st)) {
          await pool.query(`UPDATE nfstock_envios SET status = 'recusado', log = $2, atualizado_em = NOW() WHERE id = $1`, [e.id, String(s.log || 'Erro na importação.').slice(0, 1000)]);
          cont.recusados += 1;
        }
      } catch (err) { /* tenta de novo na próxima rodada */ }
    }
    await salvarEstado({ ultimo_envio: new Date().toISOString(), ultimo_envio_resultado: cont });
    return cont;
  })();
  try { return await enviando; } finally { enviando = null; }
}

async function reenviar(id) {
  const { rowCount } = await pool.query(`UPDATE nfstock_envios SET status = 'pendente', tentativas = 0, log = NULL, remoto_id = NULL, atualizado_em = NOW() WHERE id = $1 AND status IN ('erro', 'recusado')`, [id]);
  if (!rowCount) throw falha('Só dá para reenviar o que deu erro ou foi recusado.', 409);
}

// Testa o token e o CRM: pede 1 documento a partir do último NSU, sem XML.
async function testar() {
  const c = await config();
  const r = await http.novos(c, Number(c.estado?.ult_nsu) || 0, { tamanho: 1, xml: false });
  return { ok: true, total: Number(r?.total) || 0, mensagem: `Conexão com o NF-Stock OK${c.ambiente === 'simulador' ? ' (simulador)' : ''}: ${Number(r?.total) || 0} documento(s) novo(s) a partir do NSU ${Number(c.estado?.ult_nsu) || 0}.` };
}

async function painel() {
  const c = await config();
  const { rows: docs } = await pool.query('SELECT nsu, chave, modelo, tipo, status_doc, emissao, resultado, mensagem, criado_em FROM nfstock_docs ORDER BY criado_em DESC, nsu DESC LIMIT 40');
  const { rows: envios } = await pool.query(`SELECT id, origem, ref, chave, status, log, tentativas, enviado_em, importado_em, atualizado_em FROM nfstock_envios
    ORDER BY (status IN ('erro', 'recusado')) DESC, atualizado_em DESC LIMIT 40`);
  const { rows: [cont] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes, COUNT(*) FILTER (WHERE status = 'enviado')::int AS enviados,
      COUNT(*) FILTER (WHERE status = 'importado')::int AS importados, COUNT(*) FILTER (WHERE status = 'recusado')::int AS recusados, COUNT(*) FILTER (WHERE status = 'erro')::int AS erros
    FROM nfstock_envios`);
  return { config: paraTela(c), docs, envios, contagem: cont, tipos_envio: TIPOS_ENVIO };
}

// Para a tela Hoje (administrador): o que não chegou ao NF-Stock.
async function pendencias() {
  const { rows: [r] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'recusado' OR (status = 'erro' AND tentativas >= 6))::int AS problemas FROM nfstock_envios`);
  return r;
}

// ---------------------------------------------------------------- agendador
let agendado = null;
function agendar() {
  if (agendado) return;
  const rodar = async () => {
    let c;
    try { c = await config(); } catch { return; }
    if (c.busca_ativa) {
      const ult = c.estado?.ultima_busca ? Date.parse(c.estado.ultima_busca) : 0;
      if (Date.now() - ult >= (Number(c.intervalo_min) || 30) * 60000 - 30000) {
        try { const r = await buscar({ automatico: true }); if (r.importados) console.log(`[nfstock] ${r.importados} documento(s) novo(s)`); } catch (e) { console.error('[nfstock] busca:', e.message); }
      }
    }
    if (c.envio_ativo) { try { await enviar(); } catch (e) { console.error('[nfstock] envio:', e.message); } }
  };
  agendado = setInterval(rodar, 5 * 60 * 1000);
  setTimeout(rodar, 2 * 60 * 1000);
}

// ---------------------------------------------------------------- simulador
const simulador = (() => {
  const enviados = new Map();
  let ctx = null;
  async function documentos() {
    if (!ctx) {
      const { rows: [e] } = await pool.query('SELECT cnpj, uf FROM empresa WHERE id = 1');
      ctx = { cnpj: Doc.limpar(e?.cnpj) || '11222333000181', uf: e?.uf || 'SP', tpAmb: 2 };
    }
    const sim = await require('../sefazServicos').simulador.distribuicao(ctx, 0);
    const [cte1, cte2, proprio] = sim.docs.map((d) => d.xml);
    const nfse = '<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse><InfNfse><Numero>123</Numero><ValoresNfse><ValorLiquidoNfse>350.00</ValorLiquidoNfse></ValoresNfse></InfNfse></Nfse></CompNfse>';
    const chaveDe = (x) => (/Id="CTe(\d{44})"/.exec(x) || [])[1];
    const agora = new Date().toISOString();
    // Um com o XML em texto, um em base64 e um só pela url_download (os formatos que o NF-Stock pode mandar).
    return [
      { nsu: 101, data_emissao: agora, data_importacao: agora, chave: chaveDe(cte1), modelo: '57', status: 'Autorizada', tipo: 'Recebida', xml: cte1 },
      { nsu: 102, data_emissao: agora, data_importacao: agora, chave: chaveDe(cte2), modelo: '57', status: 'Autorizada', tipo: 'Recebida', xml: Buffer.from(cte2, 'utf8').toString('base64') },
      { nsu: 103, data_emissao: agora, data_importacao: agora, chave: chaveDe(proprio), modelo: '57', status: 'Autorizada', tipo: 'Emitida', xml: '', url_download: 'simulador://nsu/103' },
      { nsu: 104, data_emissao: agora, data_importacao: agora, chave: '', modelo: 'NFSE', status: 'Autorizada', tipo: 'Recebida', xml: nfse, layout_nacional: false },
    ].map((d) => ({ ...d, _proprio: proprio }));
  }
  return {
    async novos(c, nsu, tamanho) {
      const todos = (await documentos()).filter((d) => d.nsu > Number(nsu));
      const pag = todos.slice(0, tamanho).map(({ _proprio, ...d }) => d);
      return { total: todos.length, paginas: Math.ceil(todos.length / tamanho), tamanho, pagina: 0, documentos: pag };
    },
    async baixar(url) {
      const d = (await documentos()).find((x) => url === `simulador://nsu/${x.nsu}`);
      if (!d) throw falha('Download simulado não encontrado.', 404);
      return Buffer.from(d._proprio, 'utf8');
    },
    async pedirUrl(tamanho) {
      const id = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return { mensagem: 'Url gerada com sucesso.', url: `simulador://upload/${id}?Expires=60`, id, tamanho };
    },
    async subir(url, buffer) {
      const id = (/upload\/([^?]+)/.exec(url) || [])[1];
      enviados.set(id, buffer.toString('utf8'));
      return '';
    },
    async status(id) {
      const xml = enviados.get(id);
      const agora = new Date().toISOString();
      if (xml == null) return { status: 'Com Erro', log: 'Arquivo não recebido (simulador).', dataCriacao: agora };
      if (!/<(cteProc|mdfeProc|procEventoCTe|CompNfse|NFSe|nfseProc|infNFSe)/i.test(xml)) return { tamanho: xml.length, extensao: '.xml', status: 'Com Erro', log: 'Erro - Erro de Schema (simulador): documento não reconhecido.', dataCriacao: agora };
      return { tamanho: xml.length, extensao: '.xml', status: 'Uploaded', dataCriacao: agora, log: '', dataUploaded: agora };
    },
  };
})();

module.exports = { antesDe, config, salvarConfig, buscar, enviar, enfileirar, reenviar, testar, painel, pendencias, agendar, rotear, xmlsDoConteudo, xmlsDoDocumento, crm6, http, URLS, TIPOS_ENVIO, simulador };
