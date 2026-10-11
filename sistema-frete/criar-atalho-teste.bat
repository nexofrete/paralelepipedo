@echo off
chcp 65001 >nul
title Criar atalho do AMBIENTE DE TESTE

echo ============================================
echo   Criar atalho do AMBIENTE DE TESTE
echo ============================================
echo.
echo Isso cria um icone na sua Area de Trabalho que abre o AMBIENTE DE TESTE
echo (porta 3334, banco separado) - diferente do atalho normal do sistema.
echo.
echo Se esse computador E o servidor (onde voce roda o iniciar-teste.bat), digite: localhost
echo Se esse computador acessa o servidor pela rede, digite o IP dele, ex: 192.168.0.10
echo.
set /p ENDERECO="Digite o endereco do servidor: "

if "%ENDERECO%"=="" (
  echo Voce precisa digitar um endereco. Rode o arquivo de novo.
  pause
  exit /b
)

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
set ICONE="%PASTACURTA%\backend\public\img\nexofrete-teste.ico"
set "ABRINDO=%PASTACURTA:\=/%/backend/public/abrindo-nexofrete.html"
if not exist %ICONE% set ICONE=%NAVEGADOR%

set VBS=%TEMP%\criar_atalho_sistema_frete_teste.vbs
(
  echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
  echo Set oFSO = CreateObject^("Scripting.FileSystemObject"^)
  echo sAntigo = oWS.SpecialFolders^("Desktop"^) ^& "\Sistema de Fretes - TESTE.lnk"
  echo If oFSO.FileExists^(sAntigo^) Then oFSO.DeleteFile sAntigo
  echo sLinkFile = oWS.SpecialFolders^("Desktop"^) ^& "\Nexofrete - TESTE.lnk"
  echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
  echo oLink.TargetPath = %NAVEGADOR%
  echo oLink.Arguments = "--app=file:///%ABRINDO%?u=http://%ENDERECO%:3334 --start-maximized"
  echo oLink.IconLocation = %ICONE%
  echo oLink.Description = "Nexofrete - AMBIENTE DE TESTE"
  echo oLink.Save
) > "%VBS%"

cscript //nologo "%VBS%"
del "%VBS%" >nul 2>&1

echo.
echo ============================================
echo   Pronto! Ja deve ter aparecido um icone
echo   "Nexofrete - TESTE" na sua Area de Trabalho.
echo ============================================
echo.
echo Da proxima vez, e so dar dois cliques nesse icone -
echo ele abre o AMBIENTE DE TESTE direto (porta 3334).
echo Lembre-se: o iniciar-teste.bat precisa estar rodando primeiro.
echo.
pause
