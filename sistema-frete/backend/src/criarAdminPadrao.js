const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const EMAIL_PADRAO = 'admin@empresa.com';
const SENHA_PADRAO = 'admin123';
const arquivoAviso = path.join(__dirname, '..', 'dados', 'PRIMEIRO_ACESSO.txt');

async function garantirAdminPadrao() {
  const { rows } = await pool.query("SELECT id FROM usuarios WHERE perfil = 'admin' LIMIT 1");
  if (rows.length > 0) return; // já existe um admin, não faz nada

  const senha_hash = await bcrypt.hash(SENHA_PADRAO, 10);
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, 'admin')`,
    ['Administrador', EMAIL_PADRAO, senha_hash]
  );

  const texto =
    'PRIMEIRO ACESSO AO SISTEMA\n' +
    '===========================\n\n' +
    `Email: ${EMAIL_PADRAO}\n` +
    `Senha: ${SENHA_PADRAO}\n\n` +
    'IMPORTANTE: troque essa senha assim que possível (ou peça para eu adicionar\n' +
    'uma tela de troca de senha). Guarde este arquivo em local seguro.\n';

  fs.mkdirSync(path.dirname(arquivoAviso), { recursive: true });
  fs.writeFileSync(arquivoAviso, texto, 'utf-8');

  console.log('\n==============================================');
  console.log(' Usuário administrador criado automaticamente:');
  console.log(`   Email: ${EMAIL_PADRAO}`);
  console.log(`   Senha: ${SENHA_PADRAO}`);
  console.log(` (também salvo em backend/dados/PRIMEIRO_ACESSO.txt)`);
  console.log('==============================================\n');
}

module.exports = garantirAdminPadrao;
