// Avisos de segurança para os administradores (no sino), verificados ao ligar
// e a cada 30 minutos:
//   - o administrador padrão ainda entra com a senha de fábrica (admin123);
//   - o arquivo com os dados do primeiro acesso ainda está na pasta do sistema;
//   - há CT-e/MDF-e com a hora de autorização gravada no fuso errado (fusoBanco.js).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const ARQUIVO_PRIMEIRO_ACESSO = path.join(__dirname, '..', 'dados', 'PRIMEIRO_ACESSO.txt');
let avisos = [];

async function verificar() {
  const novos = [];
  try {
    const { rows } = await pool.query("SELECT senha_hash FROM usuarios WHERE LOWER(email) = 'admin@empresa.com' AND COALESCE(ativo, TRUE)");
    if (rows[0] && await bcrypt.compare('admin123', rows[0].senha_hash)) {
      novos.push('O administrador padrão (admin@empresa.com) ainda usa a senha de fábrica "admin123" — troque em Cadastros » Usuários.');
    }
  } catch { /* segue */ }
  if (fs.existsSync(ARQUIVO_PRIMEIRO_ACESSO)) {
    novos.push('O arquivo backend\\dados\\PRIMEIRO_ACESSO.txt (com a senha do primeiro acesso) ainda está no servidor — apague depois de trocar a senha.');
  }
  avisos = novos;
  if (novos.length) novos.forEach((a) => console.warn(`[segurança] ⚠ ${a}`));
}

function iniciar() {
  verificar();
  setInterval(verificar, 30 * 60 * 1000);
}
const listar = () => {
  const fuso = require('./fusoBanco').aviso();
  return fuso ? [...avisos, `🕒 ${fuso} Veja em Manutenção » Fuso do banco.`] : avisos;
};

module.exports = { iniciar, listar, verificar };
