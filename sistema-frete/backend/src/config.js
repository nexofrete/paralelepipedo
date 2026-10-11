const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Gera e guarda uma chave secreta automaticamente na primeira execução,
// para o usuário não precisar criar nem editar nenhum arquivo .env.
const caminhoConfig = path.join(__dirname, '..', 'dados', 'config.json');

function carregarOuCriarConfig() {
  fs.mkdirSync(path.dirname(caminhoConfig), { recursive: true });

  if (fs.existsSync(caminhoConfig)) {
    return JSON.parse(fs.readFileSync(caminhoConfig, 'utf-8'));
  }

  const config = {
    jwtSecret: crypto.randomBytes(48).toString('hex'),
  };
  fs.writeFileSync(caminhoConfig, JSON.stringify(config, null, 2));
  return config;
}

module.exports = carregarOuCriarConfig();
