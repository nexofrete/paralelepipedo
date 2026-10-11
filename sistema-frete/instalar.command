#!/bin/bash
cd "$(dirname "$0")/backend"
echo "============================================"
echo "  Instalando o Sistema de Fretes..."
echo "============================================"

if [ ! -f ".env" ]; then
  echo
  echo "Vamos configurar a conexão com o PostgreSQL."
  echo "Essa é a senha que você definiu quando instalou o PostgreSQL"
  echo "(do usuário 'postgres')."
  echo
  read -s -p "Digite a senha do PostgreSQL e aperte Enter: " PGSENHA
  echo
  cat > .env << ENVEOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sistema_frete
DB_USER=postgres
DB_PASSWORD=$PGSENHA
ENVEOF
  echo "Configuração salva."
fi

echo
echo "Instalando dependências (pode levar 1-2 minutos)..."
npm install

echo
echo "============================================"
echo "  Instalação concluída!"
echo "  Agora clique duas vezes em 'iniciar.command'"
echo "  (o PostgreSQL precisa estar instalado e rodando)"
echo "============================================"
read -p "Pressione Enter para fechar..."
