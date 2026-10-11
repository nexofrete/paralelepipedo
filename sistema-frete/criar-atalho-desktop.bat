@echo off
chcp 65001 >nul
title Criar atalho do Nexofrete

echo ============================================
echo   Criar atalho na Area de Trabalho
echo ============================================
echo.
echo Isso cria um icone na sua Area de Trabalho que abre o sistema
echo direto, parecido com um aplicativo (sem barra de enderecos, sem abas).
echo.
echo Se esse computador E o servidor (onde voce roda o iniciar.bat), digite: localhost
echo Se esse computador acessa o servidor pela rede, digite o IP dele, ex: 192.168.0.10
echo (se a porta for diferente da do servidor, digite junto: 192.168.0.10:3300)
echo.
echo DICA: nos computadores dos usuarios e mais facil abrir o sistema pelo
echo navegador e clicar em "Instalar atalho neste computador" no menu.
echo.
set /p ENDERECO="Digite o endereco do servidor: "

if "%ENDERECO%"=="" (
  echo Voce precisa digitar um endereco. Rode o arquivo de novo.
  pause
  exit /b
)

rem Porta do servidor: a mesma do arquivo backend\.env (linha PORT=); sem ela, 3333.
set PORTA=3333
for /f "tokens=2 delims==" %%P in ('findstr /b /c:"PORT=" "%~dp0backend\.env" 2^>nul') do set PORTA=%%P
rem Se digitou o endereco ja com a porta (ex: 192.168.0.10:3300), usa ele inteiro.
echo %ENDERECO% | find ":" >nul && (set "URLBASE=http://%ENDERECO%") || (set "URLBASE=http://%ENDERECO%:%PORTA%")

set NAVEGADOR="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %NAVEGADOR% set NAVEGADOR="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %NAVEGADOR% set NAVEGADOR="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %NAVEGADOR% set NAVEGADOR="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if not exist %NAVEGADOR% (
  echo.
  echo Nao encontrei o Google Chrome nem o Microsoft Edge instalados nos
  echo locais padrao deste computador. Instale um dos dois e rode este
  echo arquivo de novo.
  pause
  exit /b
)

rem Usa o "caminho curto" do Windows (sem acentos/espacos) pra essa pasta,
rem porque nomes com acento (tipo "Andre") corrompem o script do atalho.
for %%I in ("%~dp0.") do set "PASTACURTA=%%~sI"

rem Arquivo de icone com nome novo: o Windows guarda o icone antigo em cache
rem pelo nome do arquivo, entao um nome novo garante que o "N" do Nexofrete apareca.
set ICONE="%PASTACURTA%\backend\public\img\nexofrete.ico"
rem Tela de abertura que espera o servidor responder (em vez de dar erro se ele ainda estiver ligando).
set "ABRINDO=%PASTACURTA:\=/%/backend/public/abrindo-nexofrete.html"
if not exist %ICONE% set ICONE=%NAVEGADOR%

set VBS=%TEMP%\criar_atalho_sistema_frete.vbs
(
  echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
  echo Set oFSO = CreateObject^("Scripting.FileSystemObject"^)
  echo sAntigo = oWS.SpecialFolders^("Desktop"^) ^& "\Sistema de Fretes.lnk"
  echo If oFSO.FileExists^(sAntigo^) Then oFSO.DeleteFile sAntigo
  echo sLinkFile = oWS.SpecialFolders^("Desktop"^) ^& "\Nexofrete.lnk"
  echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
  echo oLink.TargetPath = %NAVEGADOR%
  echo oLink.Arguments = "--app=file:///%ABRINDO%?u=%URLBASE% --start-maximized"
  echo oLink.IconLocation = %ICONE%
  echo oLink.Description = "Nexofrete"
  echo oLink.Save
) > "%VBS%"

cscript //nologo "%VBS%"
del "%VBS%" >nul 2>&1

echo.
echo ============================================
echo   Pronto! Ja deve ter aparecido um icone
echo   "Nexofrete" na sua Area de Trabalho.
echo ============================================
echo.
echo Da proxima vez, e so dar dois cliques nesse icone -
echo ele abre o sistema direto, sem digitar nada.
echo.
pause
