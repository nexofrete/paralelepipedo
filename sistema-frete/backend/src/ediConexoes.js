// EDI por SFTP / FTP: o servidor da transportadora (ou do parceiro) onde ela deixa os arquivos PROCEDA.
// De tempos em tempos o sistema entra, baixa os arquivos novos da pasta e passa cada um pela entrada
// automática de EDI (src/ediEntrada.js: OCOREN aplicado na hora, CONEMB/DOCCOB/NOTFIS para conferir).
// Depois de lido, o arquivo é movido para a pasta de processados, apagado ou deixado lá (e não é baixado de novo).
// Senha e chave privada ficam criptografadas e nunca voltam para a tela. Só o administrador configura.
// Protocolo "simulador": uma pasta de mentira com arquivos de exemplo, para conhecer sem a transportadora.
const path = require('path').posix;
const pool = require('./db');
const { criptografar, descriptografar } = require('./cte/certificado');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const PROTOCOLOS = { sftp: 'SFTP (SSH)', ftps: 'FTPS (FTP com TLS)', ftp: 'FTP (sem criptografia)', simulador: 'Simulador' };
const DEPOIS = { mover: 'Mover para a pasta de processados', apagar: 'Apagar do servidor', manter: 'Deixar no servidor (não baixa de novo)' };
const PORTA_PADRAO = { sftp: 22, ftps: 21, ftp: 21, simulador: 0 };
const LIMITE_BYTES = 30 * 1024 * 1024;
const LIMITE_ARQUIVOS = 200;   // por rodada

const cifrar = (t) => (t ? criptografar(Buffer.from(String(t), 'utf8')) : null);
const decifrar = (v) => { try { return v ? descriptografar(v).toString('utf8') : null; } catch { throw falha('Não consegui ler a senha guardada: informe de novo.'); } };
const semSegredos = ({ senha, chave_privada, ...c }) => ({ ...c, tem_senha: !!senha, tem_chave: !!chave_privada });

// "*.txt; OCO*" → expressão. Vazio = todos os arquivos.
function filtroDe(padrao) {
  const partes = String(padrao || '').split(/[;,\s]+/).map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return () => true;
  const res = partes.map((p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i'));
  return (nome) => res.some((r) => r.test(nome));
}
const pastaLimpa = (p, padrao = '/') => { const t = String(p || '').trim().replace(/\\/g, '/'); return t ? (t.startsWith('/') || t.startsWith('.') ? t : `/${t}`) : padrao; };

// ---------------------------------------------------------------- cadastro
async function listar() {
  const { rows } = await pool.query(`SELECT c.*, p.nome AS parceiro_nome FROM edi_conexoes c LEFT JOIN parceiros p ON p.id = c.parceiro_id ORDER BY c.nome`);
  return { conexoes: rows.map(semSegredos), protocolos: PROTOCOLOS, depois: DEPOIS };
}
async function salvar(id, b = {}) {
  const atual = id ? (await pool.query('SELECT * FROM edi_conexoes WHERE id = $1', [id])).rows[0] : null;
  if (id && !atual) throw falha('Conexão não encontrada.', 404);
  const protocolo = PROTOCOLOS[b.protocolo] ? b.protocolo : atual?.protocolo || 'sftp';
  const nome = String(b.nome ?? atual?.nome ?? '').trim().slice(0, 100);
  if (!nome) throw falha('Dê um nome (ex.: a transportadora).');
  const host = String(b.host ?? atual?.host ?? '').trim().replace(/^(s?ftps?):\/\//i, '').replace(/\/.*$/, '').slice(0, 200);
  if (protocolo !== 'simulador' && !/^[A-Za-z0-9.-]+$/.test(host)) throw falha('Informe o endereço do servidor (ex.: sftp.transportadora.com.br).');
  const porta = Math.min(65535, Math.max(1, Number(b.porta ?? atual?.porta) || PORTA_PADRAO[protocolo] || 22));
  const usuario = String(b.usuario ?? atual?.usuario ?? '').trim().slice(0, 150);
  if (protocolo !== 'simulador' && !usuario) throw falha('Informe o usuário.');
  const depois = DEPOIS[b.depois] ? b.depois : atual?.depois || 'mover';
  const pasta = pastaLimpa(b.pasta ?? atual?.pasta, '/');
  const processados = depois === 'mover' ? pastaLimpa(b.pasta_processados ?? atual?.pasta_processados, path.join(pasta, 'processados')) : null;
  const intervalo = Math.min(1440, Math.max(5, Number(b.intervalo_minutos ?? atual?.intervalo_minutos) || 30));
  const senha = String(b.senha_nova || '').trim() ? cifrar(b.senha_nova) : (b.remover_senha ? null : atual?.senha ?? null);
  const chave = String(b.chave_privada_nova || '').trim() ? cifrar(b.chave_privada_nova) : (b.remover_chave ? null : atual?.chave_privada ?? null);
  if (protocolo !== 'simulador' && !senha && !chave) throw falha('Informe a senha (ou, no SFTP, a chave privada).');
  const vals = [nome, b.ativo !== undefined ? !!b.ativo : atual?.ativo ?? true, protocolo, host || null, porta, usuario || null, senha, chave, pasta, processados,
    String(b.padrao_arquivos ?? atual?.padrao_arquivos ?? '').trim().slice(0, 200) || null, depois, intervalo, Number(b.parceiro_id ?? atual?.parceiro_id) || null];
  const { rows: [c] } = id
    ? await pool.query(`UPDATE edi_conexoes SET nome = $1, ativo = $2, protocolo = $3, host = $4, porta = $5, usuario = $6, senha = $7, chave_privada = $8, pasta = $9,
        pasta_processados = $10, padrao_arquivos = $11, depois = $12, intervalo_minutos = $13, parceiro_id = $14, atualizado_em = NOW() WHERE id = $15 RETURNING *`, [...vals, id])
    : await pool.query(`INSERT INTO edi_conexoes (nome, ativo, protocolo, host, porta, usuario, senha, chave_privada, pasta, pasta_processados, padrao_arquivos, depois, intervalo_minutos, parceiro_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, vals);
  return semSegredos(c);
}
async function excluir(id) {
  const { rowCount } = await pool.query('DELETE FROM edi_conexoes WHERE id = $1', [id]);
  if (!rowCount) throw falha('Conexão não encontrada.', 404);
}

// ---------------------------------------------------------------- clientes (SFTP, FTP/FTPS, simulador)
// Interface comum: listar(pasta) → [{ nome, tamanho, modificado }], baixar(caminho) → Buffer, mover(de, para), apagar(caminho), criarPasta(p), fechar().
async function conectar(c) {
  if (c.protocolo === 'simulador') return simulador.cliente();
  if (c.protocolo === 'sftp') {
    const SftpClient = require('ssh2-sftp-client');
    const s = new SftpClient();
    const chave = decifrar(c.chave_privada);
    await s.connect({ host: c.host, port: c.porta || 22, username: c.usuario, password: chave ? undefined : decifrar(c.senha), privateKey: chave || undefined,
      passphrase: chave && c.senha ? decifrar(c.senha) : undefined, readyTimeout: 20000, retries: 0 });
    return {
      listar: async (p) => (await s.list(p)).filter((x) => x.type === '-').map((x) => ({ nome: x.name, tamanho: x.size, modificado: new Date(x.modifyTime).toISOString() })),
      baixar: async (p) => s.get(p),
      mover: async (de, para) => s.rename(de, para),
      apagar: async (p) => s.delete(p),
      criarPasta: async (p) => { if (!(await s.exists(p))) await s.mkdir(p, true); },
      fechar: async () => s.end().catch(() => {}),
    };
  }
  const ftp = require('basic-ftp');
  const cli = new ftp.Client(20000);
  await cli.access({ host: c.host, port: c.porta || 21, user: c.usuario, password: decifrar(c.senha) || '', secure: c.protocolo === 'ftps' });
  const { Writable } = require('stream');
  return {
    listar: async (p) => (await cli.list(p)).filter((x) => x.isFile).map((x) => ({ nome: x.name, tamanho: x.size, modificado: x.modifiedAt ? x.modifiedAt.toISOString() : x.rawModifiedAt || null })),
    baixar: async (p) => {
      const partes = [];
      await cli.downloadTo(new Writable({ write(ch, _e, cb) { partes.push(ch); cb(); } }), p);
      return Buffer.concat(partes);
    },
    mover: async (de, para) => cli.rename(de, para),
    apagar: async (p) => cli.remove(p),
    criarPasta: async (p) => { const atual = await cli.pwd(); await cli.ensureDir(p); await cli.cd(atual); },
    fechar: async () => cli.close(),
  };
}

const traduzirErro = (e, c) => {
  const m = String(e?.message || e);
  if (/ENOTFOUND|getaddrinfo/i.test(m)) return `Servidor "${c.host}" não encontrado.`;
  if (/ECONNREFUSED/i.test(m)) return `O servidor ${c.host}:${c.porta} recusou a conexão (porta ou protocolo errados?).`;
  if (/ETIMEDOUT|Timed out|timeout/i.test(m)) return `O servidor ${c.host} não respondeu (firewall ou endereço errado?).`;
  if (/authentication|auth|530|Login incorrect|All configured authentication methods failed/i.test(m)) return 'Usuário ou senha (ou chave) recusados pelo servidor.';
  if (/No such file|550|ENOENT|does not exist/i.test(m)) return `Pasta não encontrada no servidor: ${m}`;
  return m;
};

// ---------------------------------------------------------------- executar
async function testar(id) {
  const { rows: [c] } = await pool.query('SELECT * FROM edi_conexoes WHERE id = $1', [id]);
  if (!c) throw falha('Conexão não encontrada.', 404);
  let cli;
  try {
    cli = await conectar(c);
    const arquivos = (await cli.listar(c.pasta || '/')).filter((a) => filtroDe(c.padrao_arquivos)(a.nome));
    return { ok: true, mensagem: `Conectou em ${c.protocolo === 'simulador' ? 'simulador' : `${c.host}:${c.porta}`}: ${arquivos.length} arquivo(s) na pasta ${c.pasta || '/'}${arquivos.length ? ` (ex.: ${arquivos.slice(0, 3).map((a) => a.nome).join(', ')})` : ''}.` };
  } catch (e) { throw falha(traduzirErro(e, c), 502); } finally { if (cli) await cli.fechar(); }
}

const rodando = new Set();
async function executar(id, motivo = 'manual') {
  if (rodando.has(id)) return { ok: false, mensagem: 'Esta conexão já está sendo lida agora.' };
  rodando.add(id);
  const { rows: [c] } = await pool.query('SELECT * FROM edi_conexoes WHERE id = $1', [id]);
  if (!c) { rodando.delete(id); throw falha('Conexão não encontrada.', 404); }
  const ent = require('./ediEntrada');
  const cont = { arquivos: 0, edi: 0, aplicados: 0, aguardando: 0, repetidos: 0, ignorados: 0, erros: 0, detalhes: [] };
  let cli;
  try {
    cli = await conectar(c);
    const pasta = c.pasta || '/';
    const filtro = filtroDe(c.padrao_arquivos);
    let arquivos = (await cli.listar(pasta)).filter((a) => filtro(a.nome) && a.tamanho <= LIMITE_BYTES);
    if (c.depois === 'manter') {
      const { rows: vistos } = await pool.query('SELECT nome, tamanho, modificado FROM edi_conexao_vistos WHERE conexao_id = $1', [c.id]);
      const ja = new Set(vistos.map((v) => `${v.nome}|${v.tamanho}|${v.modificado}`));
      arquivos = arquivos.filter((a) => !ja.has(`${a.nome}|${a.tamanho}|${a.modificado}`));
    }
    if (c.depois === 'mover' && arquivos.length) await cli.criarPasta(c.pasta_processados);
    for (const a of arquivos.slice(0, LIMITE_ARQUIVOS)) {
      const caminho = path.join(pasta, a.nome);
      cont.arquivos += 1;
      let r;
      try {
        const buf = await cli.baixar(caminho);
        r = await ent.receber({ nome: a.nome, conteudo: buf, origem: c.protocolo === 'simulador' ? 'sftp' : c.protocolo, de: c.protocolo === 'simulador' ? 'simulador' : c.host });
      } catch (e) { cont.erros += 1; cont.detalhes.push(`${a.nome}: ${traduzirErro(e, c)}`); continue; }
      if (r.ignorado) cont.ignorados += 1;
      else {
        cont.edi += 1;
        if (r.repetido) cont.repetidos += 1; else if (r.status === 'aplicado') cont.aplicados += 1; else if (r.status === 'aguardando') cont.aguardando += 1; else cont.erros += 1;
        if (!r.repetido) cont.detalhes.push(`${r.tipo} ${a.nome}: ${r.mensagem}`);
      }
      // Depois de lido (EDI ou não): sai da pasta, para não baixar de novo.
      try {
        if (c.depois === 'mover') await cli.mover(caminho, path.join(c.pasta_processados, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${a.nome}`));
        else if (c.depois === 'apagar') await cli.apagar(caminho);
        else await pool.query('INSERT INTO edi_conexao_vistos (conexao_id, nome, tamanho, modificado) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [c.id, a.nome, a.tamanho, a.modificado]);
      } catch (e) { cont.detalhes.push(`${a.nome}: lido, mas não consegui ${c.depois === 'mover' ? 'mover' : 'apagar'} (${traduzirErro(e, c)})`); }
    }
    const texto = cont.arquivos
      ? `${cont.arquivos} arquivo(s): ${cont.aplicados} OCOREN aplicado(s), ${cont.aguardando} para conferir${cont.repetidos ? `, ${cont.repetidos} repetido(s)` : ''}${cont.ignorados ? `, ${cont.ignorados} não era(m) EDI` : ''}${cont.erros ? `, ${cont.erros} com erro` : ''}.`
      : 'Nenhum arquivo novo.';
    await pool.query('UPDATE edi_conexoes SET ultima_execucao = NOW(), ultimo_resultado = $2, ultimo_erro = NULL WHERE id = $1', [c.id, `${texto}${cont.detalhes.length ? ` ${cont.detalhes.slice(0, 8).join('; ')}` : ''}`.slice(0, 2000)]);
    if (cont.arquivos) require('./auditoria').registrar({ usuarioId: null, usuarioNome: 'EDI automático', acao: 'edi_conexao', detalhes: `(${motivo}) ${c.nome}: ${texto}` });
    return { ok: true, ...cont, mensagem: texto };
  } catch (e) {
    const msg = traduzirErro(e, c);
    await pool.query('UPDATE edi_conexoes SET ultima_execucao = NOW(), ultimo_erro = $2 WHERE id = $1', [c.id, msg.slice(0, 1000)]);
    throw falha(msg, 502);
  } finally {
    if (cli) await cli.fechar();
    rodando.delete(id);
  }
}

// Agendador: a cada 5 min, as conexões ativas cujo intervalo já passou.
let agendado = null;
function agendar() {
  if (agendado) return;
  const rodar = async () => {
    try {
      const { rows } = await pool.query(`SELECT id FROM edi_conexoes WHERE ativo AND (ultima_execucao IS NULL OR ultima_execucao < NOW() - (intervalo_minutos || ' minutes')::interval + INTERVAL '30 seconds')`);
      for (const r of rows) await executar(r.id, 'agendado').catch((e) => console.error('[edi-conexao]', r.id, e.message));
    } catch (e) { console.error('[edi-conexao]', e.message); }
  };
  agendado = setInterval(rodar, 5 * 60 * 1000);
  setTimeout(rodar, 3 * 60 * 1000);
}

// ---------------------------------------------------------------- simulador
// Uma pasta em memória com um OCOREN e um CONEMB de exemplo (da transportadora de demonstração); o que é lido sai da pasta.
const simulador = (() => {
  let pasta = null;
  function encher() {
    const edi = require('./edi/arquivos');
    const t = { cnpj: '61222333000140', razao: 'RODOVIARIO DEMONSTRACAO LTDA' };
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    pasta = new Map([
      [`OCOREN_${hoje.replace(/-/g, '')}.TXT`, edi.montarOcoren({ transportadora: t, ocorrencias: [{ cnpjEmissorNf: '44555666000199', serie: '1', numero: 9002, codigo: 1, data: hoje, hora: '14:20' }] })],
      [`CONEMB_${hoje.replace(/-/g, '')}.TXT`, edi.montarConemb({ transportadora: t, conhecimentos: [{ serie: '1', numero: 9101, emissao: hoje, valorFrete: 1850, cnpjEmissorNf: '44555666000199', notas: [{ serie: '1', numero: 9003 }], cfop: '6353' }] })],
      ['LEIA-ME.txt', 'Arquivos EDI de exemplo (simulador do Nexofrete).'],
    ]);
  }
  return {
    cliente() {
      if (!pasta) encher();
      return {
        listar: async () => [...pasta.entries()].map(([nome, t]) => ({ nome, tamanho: Buffer.byteLength(t, 'latin1'), modificado: '2026-01-01T00:00:00.000Z' })),
        baixar: async (p) => Buffer.from(pasta.get(path.basename(p)) ?? '', 'latin1'),
        mover: async (de) => { pasta.delete(path.basename(de)); },
        apagar: async (p) => { pasta.delete(path.basename(p)); },
        criarPasta: async () => {},
        fechar: async () => {},
      };
    },
    reiniciar() { pasta = null; },
  };
})();

module.exports = { PROTOCOLOS, DEPOIS, listar, salvar, excluir, testar, executar, agendar, filtroDe, pastaLimpa, conectar, simulador };
