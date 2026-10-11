@echo off
title Sistema de Fretes - AMBIENTE DE TESTE

cd /d "%~dp0backend"
if not exist ".env.teste" (
  echo ERRO: ambiente de teste ainda nao configurado.
  echo Rode primeiro o arquivo "instalar-teste.bat".
  echo.
  pause
  exit /b
)

set ENV_FILE=.env.teste

echo ============================================
echo   Ligando o AMBIENTE DE TESTE...
echo   Banco separado (sistema_frete_teste), porta 3334.
echo   NAO afeta o sistema de producao de verdade.
echo   NAO FECHE esta janela enquanto estiver testando.
echo ============================================
echo.

rem Liga o servidor. Se ele sair pedindo reinicio (codigo 3 - por exemplo,
rem depois de "Atualizar o sistema" em Manutencao), liga de novo sozinho.
:ligar
node server.js
if "%errorlevel%"=="3" (
  echo.
  echo Reiniciando o servidor com a versao nova...
  echo.
  goto ligar
)

echo.
echo O servidor de teste parou (veja a mensagem acima).
pause
