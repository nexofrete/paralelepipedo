// Rastreamento pelo portal Lonngren (sistema próprio da Andrade e Abreu /
// "ATA"; lonngren.app). Não é API oficial: são os mesmos endereços que a tela
// do portal usa (pasta json/), descobertos pelo F12. Se o portal mudar, esta
// leitura para e o motivo aparece no fim da busca.
//
//   login:     GET json/login_busca.php?chave&email&empresa&mostra_frete=S&senha
//   lista:     GET json/listagem.php?emAberto=&nroLinhas=N&paginaAtual=P
//              -> [ {totregs}, {numero (NF), pedido, situacao, dtsol, dtcol, remnom, desnom, frete}, ... ]
//   histórico: GET json/evolucao.php?nota=NF&pedido=PEDIDO
//              -> [ {evolucaoid, datafmt, datahr, ocorrencia, observacoes, viagem, rota}, ... ]
//
// Para cada nota da transportadora ainda sem entrega no Nexofrete: acha a nota
// na lista (pelo nº da NF e pela data), guarda o histórico, preenche a Data da
// Entrega pela "Entrega realizada" e a Data da Coleta (se estiver vazia).
const crypto = require('crypto');
const pool = require('./db');
const config = require('./config');

const BASE = 'https://lonngren.app/lonngren_online/json/';
const LINHAS_POR_PAGINA = 100;
const MAX_PAGINAS = 150;   // teto de segurança; quem manda é a data (veja abaixo)
const INTERVALO_MS = 400;
const ENTREGA_RE = /ENTREGA REALIZADA|MERCADORIA ENTREGUE/i;
const PROBLEMA_RE = /RETID|DEVOLU|RECUS|AVARIA|EXTRAV|SINISTR|AUSENTE|FECHAD|ENDERE[CÇ]O|NAO LOCALIZ|NÃO LOCALIZ|FALTA|ROUBO|FURTO|BLOQUE|IMPEDI|RETRABALH/i;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const semZeros = (v) => String(v || '').replace(/\D/g, '').replace(/^0+/, '');
const dataBr = (s) => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

// ---------- Senha do portal: guardada criptografada (AES-256-GCM) ----------
const CHAVE_CRIPTO = crypto.createHash('sha256').update(`portal-transportadora:${config.jwtSecret}`).digest();
function criptografar(texto) {
  if (!texto) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', CHAVE_CRIPTO, iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${dados.toString('base64')}`;
}
function descriptografar(valor) {
  if (!valor) return null;
  const [v, iv, tag, dados] = String(valor).split(':');
  if (v !== 'v1') return null;
  const d = crypto.createDecipheriv('aes-256-gcm', CHAVE_CRIPTO, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
}

// Extrai a "chave" do link de login que a transportadora passou.
function chaveDoLink(link) {
  const m = String(link || '').match(/[?&]chave=([^&\s]+)/i);
  return m ? decodeURIComponent(m[1]) : (String(link || '').trim() || null);
}

// ---------- Sessão ----------
async function pedir(caminho, cookie) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 25000);
  try {
    const resp = await fetch(BASE + caminho, { headers: cookie ? { Cookie: cookie } : {}, signal: controle.signal });
    if (!resp.ok) throw new Error(`portal respondeu ${resp.status} em ${caminho.split('?')[0]}`);
    const cookies = typeof resp.headers.getSetCookie === 'function' ? resp.headers.getSetCookie() : [resp.headers.get('set-cookie')].filter(Boolean);
    const texto = await resp.text();
    return { texto, cookies };
  } finally {
    clearTimeout(timer);
  }
}
const juntarCookies = (atual, novos) => {
  const mapa = new Map(String(atual || '').split(/;\s*/).filter(Boolean).map((c) => [c.split('=')[0], c]));
  for (const c of novos || []) { const par = String(c).split(';')[0]; if (par.includes('=')) mapa.set(par.split('=')[0], par); }
  return [...mapa.values()].join('; ');
};
const lerJson = (texto, oQue) => {
  try { return JSON.parse(texto); } catch { throw new Error(`o portal não devolveu ${oQue} (login recusado ou layout mudou)`); }
};

async function entrar(t) {
  const senha = descriptografar(t.portal_senha);
  if (!t.portal_chave || !t.portal_usuario || !senha) throw new Error('falta link, usuário ou senha do portal no cadastro da transportadora');
  const q = new URLSearchParams({ chave: t.portal_chave, email: t.portal_usuario, empresa: t.portal_empresa || '', mostra_frete: 'S', senha });
  const r = await pedir(`login_busca.php?${q}`);
  const cookie = juntarCookies('', r.cookies);
  // O login devolve algo; o teste de verdade é conseguir ler a lista em seguida.
  const lista = lerJson((await pedir(`listagem.php?emAberto=&nroLinhas=1&paginaAtual=1`, cookie)).texto, 'a lista de notas');
  if (!Array.isArray(lista)) throw new Error('login no portal não foi aceito (confira usuário e senha)');
  return cookie;
}

// ---------- Sincronização de uma transportadora ----------
async function notasEmAberto(t) {
  const { rows } = await pool.query(
    `SELECT f.id, f.numero_nf, f.data_emissao_cte, f.data_coleta, COALESCE(f.data_emissao_cte, f.criado_em::date) AS referencia
       FROM fretes f
      WHERE f.frete_principal_id IS NULL AND f.data_entrega IS NULL AND f.chave_cte IS NOT NULL AND f.numero_nf IS NOT NULL
        AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND f.nf_retornou IS NOT TRUE
        AND COALESCE(f.data_emissao_cte, f.criado_em::date) >= CURRENT_DATE - 120
        AND ((LENGTH(REGEXP_REPLACE(COALESCE($2, ''), '[^0-9]', '', 'g')) = 14
              AND LEFT(REGEXP_REPLACE($2, '[^0-9]', '', 'g'), 8) = LEFT(REGEXP_REPLACE(COALESCE(f.transportadora_cnpj_cte, ''), '[^0-9]', '', 'g'), 8))
          OR LOWER(TRIM($1)) = LOWER(TRIM(COALESCE(f.transportadora_cte, f.transportadora))))`,
    [t.razao_social, t.cnpj]);
  return rows;
}

async function sincronizar(t, estado) {
  const abertas = await notasEmAberto(t);
  if (!abertas.length) return { consultadas: 0, entregues: 0 };
  const porNf = new Map();
  for (const n of abertas) { const k = semZeros(n.numero_nf); if (!porNf.has(k)) porNf.set(k, []); porNf.get(k).push(n); }
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
  const maisAntiga = abertas.map((n) => iso(n.referencia)).filter(Boolean).sort()[0] || iso(new Date());
  const limite = new Date(new Date(maisAntiga).getTime() - 20 * 86400000).toISOString().slice(0, 10);

  let cookie = await entrar(t);
  const achadas = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS && porNf.size; pagina += 1) {
    const lista = lerJson((await pedir(`listagem.php?emAberto=&nroLinhas=${LINHAS_POR_PAGINA}&paginaAtual=${pagina}`, cookie)).texto, 'a lista de notas');
    const itens = (Array.isArray(lista) ? lista : []).filter((x) => x && x.numero);
    if (!itens.length) break;
    for (const item of itens) {
      const candidatas = porNf.get(semZeros(item.numero));
      if (!candidatas) continue;
      // Mesma NF de outro remetente/época: a coleta tem que ser perto da emissão do CT-e.
      const col = dataBr(item.dtcol) || dataBr(item.dtsol);
      const nota = candidatas.find((n) => !col || !n.referencia
        || Math.abs(new Date(col) - new Date(n.referencia)) <= 25 * 86400000);
      if (!nota) continue;
      achadas.push({ nota, item });
      candidatas.splice(candidatas.indexOf(nota), 1);
      if (!candidatas.length) porNf.delete(semZeros(item.numero));
    }
    // A lista vem da mais nova pra mais antiga: parou de cobrir as notas em aberto, para.
    const ultima = dataBr(itens[itens.length - 1].dtsol);
    if (ultima && ultima < limite) break;
    await esperar(INTERVALO_MS);
  }

  let entregues = 0; let falhas = 0; let ultimoErro = null;
  for (const { nota, item } of achadas) {
   try {
    let eventos;
    try {
      eventos = lerJson((await pedir(`evolucao.php?nota=${encodeURIComponent(item.numero)}&pedido=${encodeURIComponent(item.pedido)}`, cookie)).texto, 'o histórico da nota');
    } catch (e) {
      // Sessão pode ter expirado no meio: entra de novo e tenta mais uma vez.
      cookie = await entrar(t);
      eventos = lerJson((await pedir(`evolucao.php?nota=${encodeURIComponent(item.numero)}&pedido=${encodeURIComponent(item.pedido)}`, cookie)).texto, 'o histórico da nota');
    }
    const lista = (Array.isArray(eventos) ? eventos : []).map((e) => ({
      data: dataBr(e.datafmt), hora: /^\d{2}:\d{2}$/.test(e.datahr || '') ? e.datahr : '00:00',
      ocorrencia: String(e.ocorrencia || '').trim(), obs: String(e.observacoes || '').trim(), id: String(e.evolucaoid || ''),
    })).filter((e) => e.data).sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`));

    for (const e of lista) {
      await pool.query(
        `INSERT INTO ocorrencias_rastreio (frete_id, data_hora, cidade, ocorrencia, descricao, tipo, codigo, dominio, fonte)
         VALUES ($1, $2::timestamp, $3, $4, $5, $6, $7, 'ATA', 'PORTAL')
         ON CONFLICT (frete_id, data_hora, codigo, dominio) DO NOTHING`,
        [nota.id, `${e.data}T${e.hora}:00`, e.obs || null, e.ocorrencia, [e.obs, item.pedido ? `pedido ${item.pedido}` : ''].filter(Boolean).join(' · ') || null,
         ENTREGA_RE.test(e.ocorrencia) ? 'Entrega' : 'Informativo', e.id.slice(-10)]);
    }
    const entrega = lista.find((e) => ENTREGA_RE.test(e.ocorrencia)) || null;
    // Sem histórico com a entrega, vale o "Entregue em dd/mm/aaaa" da lista.
    const entregueLista = /ENTREGUE EM/i.test(item.situacao || '') ? dataBr(item.situacao) : null;
    const dataEntrega = entrega?.data || entregueLista;
    const ultima = lista[lista.length - 1];
    const textoUltima = ultima ? `${ultima.ocorrencia}${ultima.obs ? ` — ${ultima.obs}` : ''}` : (item.situacao || null);
    const problema = !dataEntrega && PROBLEMA_RE.test(`${ultima?.ocorrencia || ''} ${ultima?.obs || ''}`);
    await pool.query(
      `UPDATE fretes SET data_entrega_origem = CASE WHEN data_entrega IS NULL AND $2::date IS NOT NULL THEN 'portal' ELSE data_entrega_origem END,
              data_entrega = COALESCE(data_entrega, $2::date), data_coleta = COALESCE(data_coleta, $3::date),
              rastreio_ultima_ocorrencia = $4, rastreio_ultima_em = $5::timestamp, rastreio_problema = $6,
              rastreio_consultado_em = NOW()
        WHERE id = $1`,
      [nota.id, dataEntrega, dataBr(item.dtcol), textoUltima ? String(textoUltima).slice(0, 500) : null,
       ultima ? `${ultima.data}T${ultima.hora}:00` : null, problema]);
    if (dataEntrega) entregues += 1;
   } catch (err) {
    falhas += 1;
    ultimoErro = `NF ${item.numero}: ${err.name === 'AbortError' ? 'o portal demorou demais' : err.message}`;
   }
    if (estado) estado.feitos += 1;
    await esperar(INTERVALO_MS);
  }
  return { consultadas: achadas.length, entregues, naoAchadas: abertas.length - achadas.length, falhas, ultimoErro,
    naoAchadasNfs: [...porNf.keys()].slice(0, 30) };
}

async function transportadorasComPortal(filtroNome) {
  const { rows } = await pool.query(
    `SELECT * FROM transportadoras WHERE portal_tipo = 'lonngren' AND portal_chave IS NOT NULL
        ${filtroNome ? 'AND LOWER(TRIM(razao_social)) = LOWER(TRIM($1))' : ''}`, filtroNome ? [filtroNome] : []);
  return rows;
}

module.exports = { sincronizar, transportadorasComPortal, notasEmAberto, criptografar, descriptografar, chaveDoLink, entrar };
