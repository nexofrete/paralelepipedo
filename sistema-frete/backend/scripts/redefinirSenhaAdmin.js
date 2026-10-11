// Redefine a senha de um administrador direto no banco (pra quando ninguém
// consegue mais entrar). Gera uma SENHA PROVISÓRIA: no próximo acesso, o
// sistema obriga a pessoa a cadastrar uma senha nova.
//
// Uso: redefinir-senha-admin.bat   (ou: node scripts/redefinirSenhaAdmin.js [email])
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', process.env.ENV_FILE || '.env') });
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const crypto = require('crypto');

const perguntar = (texto) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(texto, (r) => { rl.close(); resolve(r.trim()); });
});

(async () => {
  const cliente = new Client({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_frete',
  });
  try {
    await cliente.connect();
  } catch (err) {
    console.log('\nNao consegui conectar no banco de dados:', err.message);
    console.log('Confira se o PostgreSQL esta ligado e se o arquivo backend\\.env esta certo.');
    process.exit(1);
  }

  const { rows: admins } = await cliente.query(`SELECT id, nome, email, ativo FROM usuarios WHERE perfil = 'admin' ORDER BY id`);
  console.log('\nAdministradores cadastrados:');
  admins.forEach((a) => console.log(`  - ${a.email}  (${a.nome})${a.ativo ? '' : '  [DESATIVADO]'}`));
  if (!admins.length) console.log('  (nenhum)');

  let email = process.argv[2] || await perguntar('\nDigite o email do usuario que vai receber a senha provisoria: ');
  email = email.toLowerCase();
  const { rows } = await cliente.query('SELECT id, nome, email FROM usuarios WHERE LOWER(email) = $1', [email]);
  if (!rows[0]) {
    console.log(`\nNao encontrei nenhum usuario com o email "${email}".`);
    await cliente.end();
    process.exit(1);
  }

  const provisoria = 'Nexo' + crypto.randomInt(100000, 999999);
  await cliente.query(
    `UPDATE usuarios SET senha_hash = $1, trocar_senha = TRUE, ativo = TRUE WHERE id = $2`,
    [await bcrypt.hash(provisoria, 10), rows[0].id]
  );
  await cliente.query(
    `INSERT INTO auditoria (usuario_nome, acao, detalhes) VALUES ($1, $2, $3)`,
    ['Script redefinir-senha-admin', 'redefinir_senha', `Senha provisoria gerada para ${rows[0].email}`]
  ).catch(() => {});
  await cliente.end();

  console.log('\n============================================');
  console.log(`  Senha provisoria de ${rows[0].nome}:`);
  console.log(`     Email: ${rows[0].email}`);
  console.log(`     Senha: ${provisoria}`);
  console.log('============================================');
  console.log('No proximo login, o sistema vai pedir para cadastrar uma senha nova.');
})();
