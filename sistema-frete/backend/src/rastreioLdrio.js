// Rastreamento pela "Central de Canhotos" da LD Rio Pizzo (site em
// ldriopizzo-controle-de-entrega.netlify.app). O site guarda os dados no
// Supabase; usamos os mesmos endereços que a tela usa (descobertos pelo F12),
// com o login do cliente:
//
//   login:  POST {supabase}/auth/v1/token?grant_type=password   {email, password}
//           -> { access_token, expires_in, ... }   (o token vale ~1 hora)
//   notas:  GET  {supabase}/rest/v1/coletas?select=*&order=criado_em.desc&offset=O&limit=1000
//           (a segurança do Supabase só devolve as notas da empresa do login)
//
// Para cada nota da transportadora ainda sem entrega no Nexofrete: acha a nota
// na lista (pela chave da NF-e ou pelo nº da NF + data), preenche a Data da
// Entrega (origem "portal") e guarda a ocorrência. Nunca mexe em entrega
// lançada à mão. Os nomes das colunas da tabela não são documentados: a
// leitura aceita os nomes mais comuns e, se não achar, o erro lista as
// colunas que vieram (aparece no "Testar conexão").
const pool = require('./db');
const { descriptografar } = require('./rastreioLonngren');

// Endereço e chave pública do Supabase do site (a chave "publishable" é a mesma
// que vai no site para qualquer visitante). Dá para trocar no cadastro.
const SUPABASE_PADRAO = 'https://qwxwjpwqauhrcvhxkzdn.supabase.co';
const CHAVE_PUBLICA_PADRAO = 'sb_publishable_sxMLRcAaQV2C7gQze35C4A_KifOI3MJ';
const TABELA = 'coletas';
const POR_PAGINA = 1000;
const MAX_PAGINAS = 30;
const INTERVALO_MS = 400;
const DOMINIO = 'LDRIO';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const semZeros = (v) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));

// ---------- Leitura das colunas ----------
const CAMPOS = {
  nf: ['numero_nf', 'nf', 'nota_fiscal', 'numero_nota', 'nota', 'num_nf', 'nf_numero', 'nfe_numero', 'numero_nfe', 'nfe'],
  chave: ['chave_nfe', 'chave_nf', 'chave_acesso', 'chave', 'nfe_chave'],
  entrega: ['data_entrega', 'entregue_em', 'dt_entrega', 'data_entregue', 'entrega_em', 'data_da_entrega', 'entrega', 'data_baixa', 'baixado_em', 'finalizado_em', 'concluido_em'],
  situacao: ['status', 'situacao', 'situacao_entrega', 'status_entrega', 'etapa'],
  emissao: ['emissao_cte', 'data_emissao_cte', 'cte_emissao', 'data_emissao', 'emissao', 'data_coleta', 'criado_em', 'created_at'],
  coleta: ['data_coleta', 'coletado_em', 'dt_coleta'],
  cte: ['numero_cte', 'cte', 'cte_numero', 'num_cte'],
  recebedor: ['recebedor', 'recebido_por', 'nome_recebedor', 'quem_recebeu'],
  canhoto: ['canhoto_url', 'foto_url', 'foto_canhoto', 'canhoto', 'comprovante_url', 'foto', 'imagem_url'],
  motorista: ['motorista', 'motorista_nome', 'nome_motorista'],
};
const primeiro = (item, nomes) => { for (const n of nomes) if (item[n] != null && item[n] !== '') return item[n]; return null; };

// "2026-10-16", "2026-10-16T13:20:00+00:00" (vira o dia em Brasília) ou "16/10/2026".
function dataDe(v) {
  if (v == null || v === '') return null;
  const t = String(v).trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(t)) {
    // Sem fuso no texto = já é a hora local; com fuso (Z, +00:00) = converte para Brasília.
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(t)) return t.slice(0, 10);
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  }
  return null;
}
function horaDe(v) {
  const t = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(t)) return '00:00';
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(t)) return t.slice(11, 16);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '00:00' : new Date(d.getTime() - 3 * 3600000).toISOString().slice(11, 16);
}

// Uma linha da tabela → o que interessa. Chave da NF-e: a coluna com 44 dígitos.
function lerItem(item) {
  let chave = String(primeiro(item, CAMPOS.chave) || '').replace(/\D/g, '');
  if (chave.length !== 44) chave = Object.values(item).map((v) => String(v ?? '').replace(/\D/g, '')).find((v) => v.length === 44 && /^\d{2}\d{4}\d{14}55/.test(v)) || '';
  const nfBruta = primeiro(item, CAMPOS.nf);
  const nf = semZeros(nfBruta) || (chave ? semZeros(chave.slice(25, 34)) : '');
  const situacao = String(primeiro(item, CAMPOS.situacao) || '').trim();
  const brutaEntrega = primeiro(item, CAMPOS.entrega);
  // Só vale como entregue com data de entrega (a situação sozinha não diz o dia).
  const entrega = dataDe(brutaEntrega);
  return {
    nf, chave: chave || null, situacao, entrega, horaEntrega: horaDe(brutaEntrega),
    emissao: dataDe(primeiro(item, CAMPOS.emissao)), coleta: dataDe(primeiro(item, CAMPOS.coleta)), criado: dataDe(item.criado_em || item.created_at),
    cte: primeiro(item, CAMPOS.cte), recebedor: primeiro(item, CAMPOS.recebedor), canhoto: !!primeiro(item, CAMPOS.canhoto), motorista: primeiro(item, CAMPOS.motorista),
  };
}

// As colunas mínimas (NF ou chave) estão na tabela? Senão, avisa quais vieram.
function conferirColunas(lista) {
  const amostra = lista.find((x) => x && typeof x === 'object');
  if (!amostra) return;
  const l = lerItem(amostra);
  if (!l.nf && !l.chave) {
    throw new Error(`não achei o número da NF nas notas do portal. Colunas que vieram: ${Object.keys(amostra).slice(0, 40).join(', ')}`);
  }
}

// ---------- Acesso ----------
function enderecos(t) {
  // Só um projeto do Supabase (https://xxx.supabase.co); LDRIO_SUPABASE_URL serve para testes.
  const doCadastro = String(t.portal_chave || '').trim().replace(/\/+$/, '');
  const url = process.env.LDRIO_SUPABASE_URL || (/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(doCadastro) ? doCadastro : SUPABASE_PADRAO);
  const chave = /^(sb_publishable_|eyJ)/.test(String(t.portal_empresa || '').trim()) ? String(t.portal_empresa).trim() : CHAVE_PUBLICA_PADRAO;
  return { url, chave };
}

async function pedir(url, opcoes = {}) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 30000);
  try {
    const resp = await fetch(url, { ...opcoes, signal: controle.signal });
    const texto = await resp.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
    return { status: resp.status, json, texto };
  } finally { clearTimeout(timer); }
}

async function entrar(t) {
  const senha = descriptografar(t.portal_senha);
  if (!t.portal_usuario || !senha) throw new Error('falta o e-mail ou a senha do portal no cadastro da transportadora');
  const { url, chave } = enderecos(t);
  const r = await pedir(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(t.portal_usuario).trim(), password: senha }),
  });
  if (r.status === 400 || r.status === 401) throw new Error('login no portal não foi aceito (confira e-mail e senha)');
  if (r.status >= 300 || !r.json?.access_token) throw new Error(`o portal respondeu ${r.status} no login`);
  return { url, chave, token: r.json.access_token, expira: Date.now() + (Number(r.json.expires_in) || 3600) * 1000 - 60000 };
}

async function pagina(sessao, t, offset) {
  if (Date.now() > sessao.expira) Object.assign(sessao, await entrar(t));
  const q = `select=*&order=criado_em.desc&offset=${offset}&limit=${POR_PAGINA}`;
  const r = await pedir(`${sessao.url}/rest/v1/${TABELA}?${q}`, {
    headers: { apikey: sessao.chave, Authorization: `Bearer ${sessao.token}`, 'Accept-Profile': 'public', Accept: 'application/json' },
  });
  if (r.status >= 300 || !Array.isArray(r.json)) throw new Error(`o portal não devolveu a lista de notas (HTTP ${r.status}${r.json?.message ? `: ${r.json.message}` : ''})`);
  return r.json;
}

// ---------- Sincronização ----------
// Mesmas notas em aberto que o portal da Andrade e Abreu: as do CT-e desta transportadora.
async function notasEmAberto(t) {
  const { rows } = await pool.query(
    `SELECT f.id, f.numero_nf, f.chave_nfe, f.data_emissao_cte, f.data_coleta, COALESCE(f.data_emissao_cte, f.criado_em::date) AS referencia
       FROM fretes f
      WHERE f.frete_principal_id IS NULL AND f.data_entrega IS NULL AND f.chave_cte IS NOT NULL AND (f.numero_nf IS NOT NULL OR f.chave_nfe IS NOT NULL)
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
  if (!abertas.length) return { consultadas: 0, entregues: 0, naoAchadas: 0, naoAchadasNfs: [] };
  const porChave = new Map(abertas.filter((n) => String(n.chave_nfe || '').length === 44).map((n) => [n.chave_nfe, n]));
  const porNf = new Map();
  for (const n of abertas) { const k = semZeros(n.numero_nf); if (!k) continue; if (!porNf.has(k)) porNf.set(k, []); porNf.get(k).push(n); }
  const maisAntiga = abertas.map((n) => iso(n.referencia)).filter(Boolean).sort()[0] || iso(new Date());
  const limite = new Date(Date.parse(`${maisAntiga}T12:00:00Z`) - 20 * 86400000).toISOString().slice(0, 10);
  const usadas = new Set();
  const tirar = (n) => { usadas.add(n.id); porChave.delete(n.chave_nfe); const k = semZeros(n.numero_nf); const l = porNf.get(k); if (l) { l.splice(l.indexOf(n), 1); if (!l.length) porNf.delete(k); } };

  const sessao = await entrar(t);
  const achadas = [];
  for (let p = 0; p < MAX_PAGINAS && usadas.size < abertas.length; p += 1) {
    const lista = await pagina(sessao, t, p * POR_PAGINA);
    if (p === 0) conferirColunas(lista);
    for (const bruto of lista) {
      const item = lerItem(bruto || {});
      let nota = item.chave ? porChave.get(item.chave) : null;
      if (!nota && item.nf) {
        // Mesma NF de outro remetente/época: a emissão tem que ser perto da do CT-e.
        const ref = item.emissao || item.coleta || item.criado;
        nota = (porNf.get(item.nf) || []).find((n) => !ref || !n.referencia || Math.abs(Date.parse(ref) - Date.parse(iso(n.referencia))) <= 25 * 86400000);
      }
      if (!nota || usadas.has(nota.id)) continue;
      achadas.push({ nota, item });
      tirar(nota);
    }
    // A lista vem da mais nova para a mais antiga: passou das notas em aberto, para.
    const ultima = lerItem(lista[lista.length - 1] || {});
    if (lista.length < POR_PAGINA || ((ultima.criado || ultima.emissao) && (ultima.criado || ultima.emissao) < limite)) break;
    await esperar(INTERVALO_MS);
  }

  let entregues = 0; let falhas = 0; let ultimoErro = null;
  for (const { nota, item } of achadas) {
    try {
      const texto = [item.situacao || (item.entrega ? 'Entregue' : 'Em andamento'), item.recebedor ? `recebido por ${item.recebedor}` : '', item.canhoto ? 'canhoto disponível no portal' : '']
        .filter(Boolean).join(' · ');
      if (item.entrega) {
        await pool.query(
          `INSERT INTO ocorrencias_rastreio (frete_id, data_hora, ocorrencia, descricao, tipo, codigo, dominio, recebedor, fonte)
           VALUES ($1, $2::timestamp, $3, $4, 'Entrega', 'ENT', $5, $6, 'PORTAL')
           ON CONFLICT (frete_id, data_hora, codigo, dominio) DO NOTHING`,
          [nota.id, `${item.entrega}T${item.horaEntrega}:00`, 'ENTREGA REALIZADA', [item.cte ? `CT-e ${item.cte}` : '', item.motorista ? `motorista ${item.motorista}` : '', item.canhoto ? 'canhoto no portal' : ''].filter(Boolean).join(' · ') || null,
            DOMINIO, item.recebedor ? String(item.recebedor).slice(0, 150) : null]);
      }
      await pool.query(
        `UPDATE fretes SET data_entrega_origem = CASE WHEN data_entrega IS NULL AND $2::date IS NOT NULL THEN 'portal' ELSE data_entrega_origem END,
                data_entrega = COALESCE(data_entrega, $2::date), data_coleta = COALESCE(data_coleta, $3::date),
                rastreio_ultima_ocorrencia = $4, rastreio_ultima_em = $5::timestamp, rastreio_problema = FALSE, rastreio_consultado_em = NOW()
          WHERE id = $1`,
        [nota.id, item.entrega, item.coleta, String(texto).slice(0, 500), item.entrega ? `${item.entrega}T${item.horaEntrega}:00` : null]);
      if (item.entrega) entregues += 1;
    } catch (err) {
      falhas += 1; ultimoErro = `NF ${item.nf}: ${err.message}`;
    }
    if (estado) estado.feitos += 1;
  }
  const naoAchadas = abertas.filter((n) => !usadas.has(n.id));
  return { consultadas: achadas.length, entregues, naoAchadas: naoAchadas.length, falhas, ultimoErro, naoAchadasNfs: naoAchadas.map((n) => semZeros(n.numero_nf)).filter(Boolean).slice(0, 30) };
}

// Teste do cadastro: entra, lê a 1ª página e confere se dá para achar a NF.
async function testar(t) {
  const sessao = await entrar(t);
  const lista = await pagina(sessao, t, 0);
  conferirColunas(lista);
  const entregues = lista.filter((x) => lerItem(x || {}).entrega).length;
  return { notasNoPortal: lista.length, entreguesNoPortal: entregues };
}

async function transportadorasComPortal(filtroNome) {
  const { rows } = await pool.query(
    `SELECT * FROM transportadoras WHERE portal_tipo = 'ldrio' AND portal_usuario IS NOT NULL AND portal_senha IS NOT NULL
        ${filtroNome ? 'AND LOWER(TRIM(razao_social)) = LOWER(TRIM($1))' : ''}`, filtroNome ? [filtroNome] : []);
  return rows;
}

module.exports = { sincronizar, transportadorasComPortal, notasEmAberto, entrar, testar, lerItem, dataDe, SUPABASE_PADRAO };
