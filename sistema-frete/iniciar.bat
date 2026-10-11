@echo off
title Sistema de Fretes

cd /d "%~dp0backend"

rem Tira a marca "baixado da internet" dos arquivos (vem quando o .zip e
rem descompactado a mao): assim o Windows para de perguntar "fornecedor nao
rem verificado" nas proximas vezes. Silencioso e rapido.
for %%I in ("%~dp0.") do set "PASTACURTA=%%~sI"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%PASTACURTA%' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
if not exist "package.json" (
  echo ERRO: nao encontrei a pasta "backend" com os arquivos do sistema.
  echo Verifique se voce extraiu o ZIP inteiro antes de rodar este arquivo.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo ERRO: ainda nao configurado.
  echo Rode primeiro o arquivo "instalar.bat".
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo ============================================
  echo   Dependencias nao encontradas.
  echo   Instalando o sistema pela primeira vez...
  echo ============================================
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo ERRO: nao foi possivel instalar as dependencias.
    echo Verifique se o Node.js e o npm estao instalados e se ha internet.
    echo.
    pause
    exit /b 1
  )
  echo.
  echo Dependencias instaladas com sucesso.
  echo.
)

echo ============================================
echo   Ligando o Sistema de Fretes...
echo   NAO FECHE esta janela enquanto estiver usando o sistema.
echo ============================================
echo.

start "" cmd /c call "%~dp0abrir-app.bat"

:ligar
node server.js
if "%errorlevel%"=="3" (
  echo.
  echo Reiniciando o servidor com a versao nova...
  echo.
  goto ligar
)

echo.
echo O servidor parou ou nao conseguiu iniciar (veja a mensagem acima).
pause
