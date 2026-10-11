@echo off
title Instalando Sistema de Fretes

cd /d "%~dp0backend"
if not exist "package.json" (
  echo ERRO: nao encontrei a pasta "backend" com os arquivos do sistema.
  echo Verifique se voce extraiu o ZIP inteiro antes de rodar este arquivo.
  echo.
  pause
  exit /b
)

if exist ".env" goto instalar_dependencias

echo ============================================
echo   Configuracao do banco de dados PostgreSQL
echo ============================================
echo.
echo Digite a senha do PostgreSQL (usuario "postgres") e aperte Enter:
set /p PGSENHA=Senha: 

echo DB_HOST=localhost> .env
echo DB_PORT=5432>> .env
echo DB_NAME=sistema_frete>> .env
echo DB_USER=postgres>> .env
echo DB_PASSWORD=%PGSENHA%>> .env

echo.
echo Configuracao salva em backend\.env

:instalar_dependencias
echo.
echo ============================================
echo   Instalando dependencias (pode levar 1-2 minutos)...
echo ============================================
echo.
call npm install

echo.
echo ============================================
echo   Instalacao concluida!
echo   Agora clique duas vezes em "iniciar.bat"
echo ============================================
echo.
pause
