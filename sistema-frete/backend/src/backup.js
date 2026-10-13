const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const pool = require('./db');

const PASTA_DADOS = path.join(__dirname, '..', 'dados');
const PASTA_BACKUPS = path.join(PASTA_DADOS, 'backups');
// Além do banco, o backup completo leva o que fica fora dele: as fotos e
// assinaturas de entrega, os anexos e o config.json (a chave que abre o
// certificado digital e as senhas guardadas criptografadas no banco).
const PASTAS_DE_ARQUIVOS = ['comprovantes-cte', 'anexos'];
const ARQUIVO_BACKUP = /^backup_.*\.(sql|zip)$/;
fs.mkdirSync(PASTA_BACKUPS, { recursive: true });

let tarefaAgendada = null;

async function buscarConfiguracao() {
  const { rows } = await pool.query('SELECT * FROM configuracao_backup WHERE id = 1');
  if (rows[0]) return rows[0];
  const inserido = await pool.query(
    `INSERT INTO configuracao_backup (id) VALUES (1) RETURNING *`
  );
  return inserido.rows[0];
}

async function salvarConfiguracao(dados) {
  const campos = ['ativo', 'frequencia', 'horario', 'dia_semana', 'manter_ultimos', 'caminho_pg_dump', 'pasta_copia', 'senha_cripto'];
  // Senha do backup: só grava quando vem uma nova; remover_senha apaga.
  dados = { ...dados };
  delete dados.senha_cripto;
  if (dados.senha_backup) {
    if (String(dados.senha_backup).length < 8) throw new Error('A senha do backup precisa ter pelo menos 8 caracteres.');
    dados.senha_cripto = require('./cte/certificado').criptografar(Buffer.from(String(dados.senha_backup), 'utf8'));
  } else if (dados.remover_senha) dados.senha_cripto = null;
  const presentes = campos.filter((c) => dados[c] !== undefined);
  if (presentes.length === 0) return buscarConfiguracao();

  const sets = presentes.map((c, i) => `${c} = $${i + 1}`);
  const valores = presentes.map((c) => dados[c]);

  await pool.query(
    `INSERT INTO configuracao_backup (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
  );
  const { rows } = await pool.query(
    `UPDATE configuracao_backup SET ${sets.join(', ')} WHERE id = 1 RETURNING *`,
    valores
  );
  return rows[0];
}


// Acha o pg_dump sozinho quando o caminho não foi configurado: procura nas
// pastas padrão do PostgreSQL no Windows (C:\Program Files\PostgreSQL\<versão>\bin)
// e usa a versão mais nova instalada (o pg_dump precisa ser >= ao servidor).
function localizarPgDump(configurado) {
  if (configurado) return configurado;
  if (process.platform !== 'win32') return 'pg_dump';
  const fs = require('fs');
  const path = require('path');
  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)']
    .filter(Boolean).map((b) => path.join(b, 'PostgreSQL'));
  const achados = [];
  for (const base of [...new Set(bases)]) {
    let versoes = [];
    try { versoes = fs.readdirSync(base); } catch { continue; }
    for (const v of versoes) {
      const exe = path.join(base, v, 'bin', 'pg_dump.exe');
      if (fs.existsSync(exe)) achados.push({ exe, versao: parseFloat(v) || 0 });
    }
  }
  achados.sort((a, b) => b.versao - a.versao);
  return achados[0]?.exe || 'pg_dump';
}

// Roda o pg_dump de verdade e salva o arquivo .sql com data/hora no nome.
async function executarBackupAgora() {
  const config = await buscarConfiguracao();
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_frete',
  };

  const agora = new Date();
  const carimbo = agora.toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const nomeArquivo = `backup_${carimbo}.zip`;
  const caminhoZip = path.join(PASTA_BACKUPS, nomeArquivo);
  // O pg_dump grava num .sql temporário, que depois entra no .zip como banco.sql.
  const caminhoArquivo = path.join(PASTA_BACKUPS, `.temp_${carimbo}.sql`);
  const limpar = () => fs.rmSync(caminhoArquivo, { force: true });

  const executavel = localizarPgDump(config.caminho_pg_dump);
  const args = [
    '-h', dbConfig.host, '-p', String(dbConfig.port), '-U', dbConfig.user,
    '-F', 'p', '-f', caminhoArquivo, dbConfig.database,
  ];

  await new Promise((resolve, reject) => {
    execFile(executavel, args, { env: { ...process.env, PGPASSWORD: dbConfig.password } }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return reject(new Error(
            `Não encontrei o programa "pg_dump". Ele vem junto com o PostgreSQL, geralmente em ` +
            `"C:\\Program Files\\PostgreSQL\\<versão>\\bin\\pg_dump.exe". Informe esse caminho completo ` +
            `no campo "Caminho do pg_dump" nas configurações de backup.`
          ));
        }
        limpar();
        return reject(new Error(stderr || err.message));
      }
      resolve();
    });
  });

  let resumoZip;
  try {
    resumoZip = montarZip(caminhoZip, caminhoArquivo, agora, senhaGuardada(config));
  } finally {
    fs.rmSync(caminhoArquivo, { force: true });
  }
  const caminhoFinal = caminhoZip;

  await aplicarRotacao(config.manter_ultimos || 7);

  // Cópia fora do servidor: se o disco do servidor der problema, o backup
  // continua existindo na outra pasta (rede, outro computador, pendrive fixo).
  let copia = '';
  if (config.pasta_copia) {
    try {
      fs.mkdirSync(config.pasta_copia, { recursive: true });
      fs.copyFileSync(caminhoFinal, path.join(config.pasta_copia, nomeArquivo));
      aplicarRotacao(config.manter_ultimos || 7, config.pasta_copia);
      copia = ` e copiado para ${config.pasta_copia}`;
    } catch (err) {
      copia = ` — ⚠ NÃO consegui copiar para ${config.pasta_copia}: ${err.message}`;
    }
  }

  await pool.query(
    `UPDATE configuracao_backup SET ultimo_backup_em = NOW(), ultimo_backup_status = $2, ultimo_backup_mensagem = $1 WHERE id = 1`,
    [`Backup salvo em ${nomeArquivo} (${resumoZip.descricao})${copia}`, copia.includes('NÃO') ? 'erro' : 'sucesso']
  );

  return { arquivo: nomeArquivo, copia, ...resumoZip };
}

const LEIA_ME = `BACKUP COMPLETO DO NEXOFRETE

banco.sql ............ o banco de dados inteiro (pg_dump)
dados/config.json .... a chave do sistema: sem ela o certificado digital e as
                       senhas guardadas no banco não abrem. Guarde em lugar seguro.
dados/comprovantes-cte  fotos e assinaturas das entregas
dados/anexos ......... anexos de mensagens e sinistros

Para restaurar: Manutenção → Backups → Restaurar (no mesmo computador ou num
computador novo com o Nexofrete instalado; copie antes este .zip para a pasta
backend\\dados\\backups).
`;

// config.json protegido pela senha do backup (scrypt + AES-256-GCM).
function trancar(buf, senha) {
  const crypto = require('crypto');
  const sal = crypto.randomBytes(16); const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(senha, sal, 32), iv);
  const dados = Buffer.concat([c.update(buf), c.final()]);
  return JSON.stringify({ v: 1, sal: sal.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), dados: dados.toString('base64') });
}
function destrancar(texto, senha) {
  const crypto = require('crypto');
  const j = JSON.parse(texto);
  const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(senha, Buffer.from(j.sal, 'base64'), 32), Buffer.from(j.iv, 'base64'));
  d.setAuthTag(Buffer.from(j.tag, 'base64'));
  try { return Buffer.concat([d.update(Buffer.from(j.dados, 'base64')), d.final()]); } catch { throw new Error('Senha do backup incorreta.'); }
}
function senhaGuardada(config) {
  if (!config?.senha_cripto) return null;
  try { return require('./cte/certificado').descriptografar(config.senha_cripto).toString('utf8'); } catch { return null; }
}

// Junta o banco e os arquivos num .zip e confere se ele abre e se o banco.sql está íntegro.
function montarZip(caminhoZip, caminhoSql, agora, senha) {
  const { EscritorZip, abrirZip } = require('./utils/zip');
  const zip = new EscritorZip(caminhoZip);
  let fotos = 0;
  try {
    zip.adicionar('banco.sql', fs.readFileSync(caminhoSql), { data: agora });
    const config = path.join(PASTA_DADOS, 'config.json');
    if (fs.existsSync(config)) {
      if (senha) zip.adicionar('dados/config.json.cripto', trancar(fs.readFileSync(config), senha));
      else zip.adicionar('dados/config.json', fs.readFileSync(config));
    }
    for (const p of PASTAS_DE_ARQUIVOS) fotos += zip.adicionarPasta(path.join(PASTA_DADOS, p), `dados/${p}`);
    zip.adicionar('LEIA-ME.txt', LEIA_ME, { data: agora });
    zip.adicionar('backup.json', JSON.stringify({ versao: 2, criado_em: agora.toISOString(), arquivos: fotos }, null, 2));
  } catch (err) {
    try { zip.fechar(); } catch { /* já deu erro */ }
    fs.rmSync(caminhoZip, { force: true });
    throw err;
  }
  const { tamanho } = zip.fechar();
  const conferido = abrirZip(caminhoZip);
  try {
    const banco = conferido.entradas.find((e) => e.nome === 'banco.sql');
    if (!banco || banco.ler().length !== fs.statSync(caminhoSql).size) throw new Error('o banco.sql dentro do .zip não confere');
  } catch (err) {
    fs.rmSync(caminhoZip, { force: true });
    throw new Error(`O backup foi gravado com defeito (${err.message}). Confira o espaço em disco e tente de novo.`);
  } finally { conferido.fechar(); }
  const mb = (tamanho / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return { tamanho, arquivos: fotos, descricao: `banco + ${fotos} arquivo(s) de comprovantes/anexos + chave do sistema${senha ? ' (protegida por senha)' : ''}, ${mb} MB, conferido` };
}

async function executarBackupComTratamentoDeErro() {
  try {
    return await executarBackupAgora();
  } catch (err) {
    await pool.query(
      `INSERT INTO configuracao_backup (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
    );
    await pool.query(
      `UPDATE configuracao_backup SET ultimo_backup_em = NOW(), ultimo_backup_status = 'erro', ultimo_backup_mensagem = $1 WHERE id = 1`,
      [err.message]
    );
    throw err;
  }
}

// Apaga os backups mais antigos, mantendo só os "manterUltimos" mais recentes.
async function aplicarRotacao(manterUltimos, pasta = PASTA_BACKUPS) {
  const arquivos = fs.readdirSync(pasta)
    .filter((f) => ARQUIVO_BACKUP.test(f))
    .map((f) => ({ nome: f, caminho: path.join(pasta, f), mtime: fs.statSync(path.join(pasta, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  arquivos.slice(manterUltimos).forEach((a) => fs.unlinkSync(a.caminho));
}

function listarBackups() {
  return fs.readdirSync(PASTA_BACKUPS)
    .filter((f) => ARQUIVO_BACKUP.test(f) || (/\.sql$/.test(f) && !f.startsWith('.')))
    .map((f) => {
      const stat = fs.statSync(path.join(PASTA_BACKUPS, f));
      // .zip = completo (banco + arquivos); .sql = só o banco (backups antigos).
      return { nome: f, tamanho: stat.size, criado_em: stat.mtime, completo: f.endsWith('.zip') };
    })
    .sort((a, b) => b.criado_em - a.criado_em);
}

// (Re)agenda a tarefa automática de acordo com a configuração salva no banco.
async function reagendarTarefa() {
  if (tarefaAgendada) {
    tarefaAgendada.stop();
    tarefaAgendada = null;
  }

  const config = await buscarConfiguracao();
  if (!config.ativo) return;

  const [hora, minuto] = (config.horario || '02:00').split(':');
  let expressao;
  if (config.frequencia === 'semanal') {
    const dia = config.dia_semana != null ? config.dia_semana : 0;
    expressao = `${Number(minuto)} ${Number(hora)} * * ${dia}`;
  } else {
    expressao = `${Number(minuto)} ${Number(hora)} * * *`;
  }

  tarefaAgendada = cron.schedule(expressao, () => {
    executarBackupComTratamentoDeErro().catch((err) => {
      console.error('Backup automático falhou:', err.message);
    });
  });
}

// Restaura um backup: faz um backup de segurança do jeito que está agora,
// apaga as tabelas atuais e carrega o arquivo escolhido com o psql (que vem
// junto com o PostgreSQL, na mesma pasta do pg_dump).
async function restaurarBackup(nomeArquivo, { senha } = {}) {
  const original = path.join(PASTA_BACKUPS, path.basename(nomeArquivo));
  if (!fs.existsSync(original)) throw new Error('Arquivo de backup não encontrado.');
  // Backup completo (.zip): tira o banco.sql para um arquivo temporário e confere tudo antes de mexer em algo.
  let arquivo = original; let zip = null;
  if (original.endsWith('.zip')) {
    zip = require('./utils/zip').abrirZip(original);
    const banco = zip.entradas.find((e) => e.nome === 'banco.sql');
    if (!banco) { zip.fechar(); throw new Error('Esse .zip não tem o banco.sql — não é um backup do Nexofrete.'); }
    // Chave protegida por senha: confere a senha antes de mexer no banco.
    const trancada = zip.entradas.find((e) => e.nome === 'dados/config.json.cripto');
    if (trancada && senha) { try { zip.chaveAberta = destrancar(trancada.ler().toString('utf8'), senha); } catch (err) { zip.fechar(); throw err; } }
    zip.chaveTrancadaSemSenha = !!trancada && !senha;
    arquivo = path.join(PASTA_BACKUPS, `.restaurar_${Date.now()}.sql`);
    try { fs.writeFileSync(arquivo, banco.ler()); } catch (err) { zip.fechar(); fs.rmSync(arquivo, { force: true }); throw err; }
  }
  const config = await buscarConfiguracao();
  let seguranca;
  try { seguranca = await executarBackupAgora(); } catch (err) { zip?.fechar(); if (zip) fs.rmSync(arquivo, { force: true }); throw err; }

  const pgDump = localizarPgDump(config.caminho_pg_dump);
  const psql = /pg_dump(\.exe)?$/i.test(pgDump) ? pgDump.replace(/pg_dump(\.exe)?$/i, (m, ext) => `psql${ext || ''}`) : 'psql';
  const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' };
  const base = ['-h', process.env.DB_HOST || 'localhost', '-p', String(process.env.DB_PORT || 5432),
    '-U', process.env.DB_USER || 'postgres', '-d', process.env.DB_NAME || 'sistema_frete'];
  const rodar = (args) => new Promise((resolve, reject) => {
    execFile(psql, [...base, ...args], { env, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') return reject(new Error('Não encontrei o programa "psql". Informe o caminho completo do pg_dump nas configurações de backup (o psql fica na mesma pasta).'));
      if (err) return reject(new Error(stderr || err.message));
      resolve(stderr);
    });
  });
  let arquivosRestaurados = 0; let chaveTrocada = false;
  try {
    await rodar(['-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;']);
    await rodar(['-v', 'ON_ERROR_STOP=0', '-q', '-f', arquivo]);
    // Garante que o banco restaurado tenha as tabelas/colunas desta versão.
    await require('./db').aplicarSchema();
    if (zip) ({ arquivosRestaurados, chaveTrocada } = restaurarArquivos(zip));
    // O status de backup voltou junto com o banco: registra a restauração nele.
    await pool.query(`INSERT INTO configuracao_backup (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
    await pool.query(`UPDATE configuracao_backup SET ultimo_backup_em = $1, ultimo_backup_status = 'sucesso', ultimo_backup_mensagem = $2 WHERE id = 1`,
      [fs.statSync(original).mtime, `Banco restaurado a partir de ${path.basename(original)} (backup de segurança antes: ${seguranca.arquivo})`]);
  } finally {
    zip?.fechar();
    if (zip) fs.rmSync(arquivo, { force: true });
  }
  return { restaurado: path.basename(original), seguranca: seguranca.arquivo, arquivosRestaurados, chaveTrocada, chaveNaoRestaurada: !!zip?.chaveTrancadaSemSenha };
}

// Devolve as fotos/assinaturas e anexos do backup para a pasta dados, e o
// config.json quando a chave for outra (computador novo): a atual fica guardada ao lado.
function restaurarArquivos(zip) {
  let n = 0; let chaveTrocada = false;
  for (const e of zip.entradas) {
    const m = /^dados\/(comprovantes-cte|anexos)\/(.+)$/.exec(e.nome);
    if (m) {
      const destino = path.join(PASTA_DADOS, m[1], ...m[2].split('/'));
      if (!destino.startsWith(path.join(PASTA_DADOS, m[1]) + path.sep)) continue;   // nada fora da pasta
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, e.ler()); n += 1;
    }
    if (e.nome === 'dados/config.json' || (e.nome === 'dados/config.json.cripto' && zip.chaveAberta)) {
      const atual = path.join(PASTA_DADOS, 'config.json');
      const novo = e.nome.endsWith('.cripto') ? zip.chaveAberta : e.ler();
      const ler = (b) => { try { return JSON.parse(b.toString('utf8')).jwtSecret; } catch { return null; } };
      if (!fs.existsSync(atual) || ler(fs.readFileSync(atual)) !== ler(novo)) {
        if (fs.existsSync(atual)) fs.copyFileSync(atual, path.join(PASTA_DADOS, `config.json.antes-${Date.now()}`));
        fs.writeFileSync(atual, novo); chaveTrocada = true;
      }
    }
  }
  return { arquivosRestaurados: n, chaveTrocada };
}

module.exports = {
  restaurarBackup,
  PASTA_BACKUPS,
  buscarConfiguracao,
  salvarConfiguracao,
  executarBackupComTratamentoDeErro,
  executarBackupAgora,
  listarBackups,
  reagendarTarefa,
};
