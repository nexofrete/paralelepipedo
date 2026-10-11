@echo off
title Instalando o AMBIENTE DE TESTE do Sistema de Fretes

cd /d "%~dp0backend"
if not exist "package.json" (
  echo ERRO: nao encontrei a pasta "backend" com os arquivos do sistema.
  pause
  exit /b
)

if not exist "node_modules" (
  echo O sistema principal ainda nao foi instalado nesse computador.
  echo Rode primeiro o "instalar.bat" normal, so depois este aqui.
  echo.
  pause
  exit /b
)

echo ============================================
echo   Ambiente de TESTE do Sistema de Fretes
echo ============================================
echo.
echo Isso cria um banco de dados SEPARADO (sistema_frete_teste), numa porta
echo diferente (3334) - nao mexe em nada do sistema de producao de verdade.
echo Use pra testar atualizacoes arriscadas antes de confiar nelas.
echo.
echo Digite a senha do PostgreSQL (usuario "postgres") e aperte Enter:
set /p PGSENHA=Senha: 

echo DB_HOST=localhost> .env.teste
echo DB_PORT=5432>> .env.teste
echo DB_NAME=sistema_frete_teste>> .env.teste
echo DB_USER=postgres>> .env.teste
echo DB_PASSWORD=%PGSENHA%>> .env.teste
echo PORT=3334>> .env.teste
echo AMBIENTE_TESTE=sim>> .env.teste

echo.
echo ============================================
echo   Pronto! Configuracao salva em backend\.env.teste
echo   Agora clique duas vezes em "iniciar-teste.bat"
echo   O ambiente de teste vai abrir em http://localhost:3334
echo ============================================
echo.
pause
