@echo off
chcp 65001 >nul
title Configurar inicio automatico do Sistema de Fretes

echo ============================================
echo   Configurar inicio automatico
echo ============================================
echo.
echo Isso faz o "iniciar.bat" rodar sozinho (numa janela minimizada)
echo toda vez que voce ligar o computador e entrar no Windows -
echo sem precisar clicar em nada.
echo.

rem Usa o caminho curto do Windows (sem acentos/espacos) pra evitar
rem problema de codificacao no script que cria o atalho.
for %%I in ("%~dp0.") do set "PASTACURTA=%%~sI"

rem Tira a marca "baixado da internet" de todos os arquivos do sistema: sem
rem isso o Windows mostra "O fornecedor nao pode ser verificado" e fica
rem esperando um clique em Executar toda vez que o computador liga.
echo Liberando os arquivos do sistema (aviso "fornecedor nao verificado")...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%PASTACURTA%' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue"
echo.

set VBS=%TEMP%\config_inicio_automatico_sistema_frete.vbs
(
  echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
  echo sLinkFile = oWS.SpecialFolders^("Startup"^) ^& "\Sistema de Fretes - Servidor.lnk"
  echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
  echo oLink.TargetPath = "%PASTACURTA%\iniciar.bat"
  echo oLink.WorkingDirectory = "%PASTACURTA%"
  echo oLink.WindowStyle = 7
  echo oLink.Description = "Liga o servidor do Sistema de Fretes automaticamente"
  echo oLink.Save
) > "%VBS%"

cscript //nologo "%VBS%"
del "%VBS%" >nul 2>&1

echo.
echo ============================================
echo   Pronto! A partir de agora, toda vez que
echo   voce ligar este computador e entrar no
echo   Windows, o servidor liga sozinho (numa
echo   janela minimizada na barra de tarefas).
echo ============================================
echo.
echo Pra CANCELAR isso no futuro: aperte Windows+R, digite
echo "shell:startup" e apague o atalho "Sistema de Fretes - Servidor".
echo.
pause
