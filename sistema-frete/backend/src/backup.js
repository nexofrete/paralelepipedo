const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const pool = require('./db');

const PASTA_BACKUPS = path.join(__dirname, '..', 'dados', 'backups');
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
  const campos = ['ativo', 'frequencia', 'horario', 'dia_semana', 'manter_ultimos', 'caminho_pg_dump', 'pasta_copia'];
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
  const nomeArquivo = `backup_${carimbo}.sql`;
  const caminhoArquivo = path.join(PASTA_BACKUPS, nomeArquivo);

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
        return reject(new Error(stderr || err.message));
      }
      resolve();
    });
  });

  await aplicarRotacao(config.manter_ultimos || 7);

  // Cópia fora do servidor: se o disco do servidor der problema, o backup
  // continua existindo na outra pasta (rede, outro computador, pendrive fixo).
  let copia = '';
  if (config.pasta_copia) {
    try {
      fs.mkdirSync(config.pasta_copia, { recursive: true });
      fs.copyFileSync(caminhoArquivo, path.join(config.pasta_copia, nomeArquivo));
      aplicarRotacao(config.manter_ultimos || 7, config.pasta_copia);
      copia = ` e copiado para ${config.pasta_copia}`;
    } catch (err) {
      copia = ` — ⚠ NÃO consegui copiar para ${config.pasta_copia}: ${err.message}`;
    }
  }

  await pool.query(
    `UPDATE configuracao_backup SET ultimo_backup_em = NOW(), ultimo_backup_status = $2, ultimo_backup_mensagem = $1 WHERE id = 1`,
    [`Backup salvo em ${nomeArquivo}${copia}`, copia.includes('NÃO') ? 'erro' : 'sucesso']
  );

  return { arquivo: nomeArquivo, copia };
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
    .filter((f) => /^backup_.*\.sql$/.test(f))
    .map((f) => ({ nome: f, caminho: path.join(pasta, f), mtime: fs.statSync(path.join(pasta, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  arquivos.slice(manterUltimos).forEach((a) => fs.unlinkSync(a.caminho));
}

function listarBackups() {
  return fs.readdirSync(PASTA_BACKUPS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const stat = fs.statSync(path.join(PASTA_BACKUPS, f));
      return { nome: f, tamanho: stat.size, criado_em: stat.mtime };
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
async function restaurarBackup(nomeArquivo) {
  const arquivo = path.join(PASTA_BACKUPS, path.basename(nomeArquivo));
  if (!fs.existsSync(arquivo)) throw new Error('Arquivo de backup não encontrado.');
  const config = await buscarConfiguracao();
  const seguranca = await executarBackupAgora();

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
  await rodar(['-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;']);
  await rodar(['-v', 'ON_ERROR_STOP=0', '-q', '-f', arquivo]);
  // Garante que o banco restaurado tenha as tabelas/colunas desta versão.
  await require('./db').aplicarSchema();
  return { restaurado: path.basename(arquivo), seguranca: seguranca.arquivo };
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
