@echo off
rem Abre a tela "Abrindo o Nexofrete..." (arquivo deste computador), que espera
rem o servidor responder e so entao vai pro login. Nada de erro de conexao
rem se o servidor demorar pra subir.

rem Porta do servidor: a mesma do arquivo backend\.env (linha PORT=); sem ela, 3333.
set PORTA=3333
for /f "tokens=2 delims==" %%P in ('findstr /b /c:"PORT=" "%~dp0backend\.env" 2^>nul') do set PORTA=%%P

set NAVEGADOR="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %NAVEGADOR% set NAVEGADOR="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %NAVEGADOR% set NAVEGADOR="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %NAVEGADOR% set NAVEGADOR="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

rem Se nao achou Chrome nem Edge nesses locais padrao, nao trava nada -
rem a pessoa ainda consegue abrir http://localhost:PORTA manualmente.
if not exist %NAVEGADOR% exit /b

rem Caminho curto (sem acentos/espacos) e com barras normais, pro endereco file:///.
for %%I in ("%~dp0.") do set "PASTACURTA=%%~sI"
set "ABRINDO=%PASTACURTA:\=/%/backend/public/abrindo-nexofrete.html"
start "" %NAVEGADOR% --app="file:///%ABRINDO%?u=http://localhost:%PORTA%" --start-maximized
