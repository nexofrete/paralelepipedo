@echo off
rem Gera o Manual do Nexofrete (Manual_Sistema_de_Fretes.pdf, na pasta do sistema).
rem Precisa do Python 3 instalado (python.org). Caminho curto: evita erro com acentos.
for %%I in ("%~dp0.") do set "PASTACURTA=%%~sI"
echo ============================================
echo   Gerar o Manual do Nexofrete
echo ============================================
echo.
where py >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Python neste computador.
  echo Instale em python.org ^(marque "Add Python to PATH"^) e rode de novo.
  pause
  exit /b 1
)
py -c "import reportlab" 2>nul || py -m pip install reportlab
py "%PASTACURTA%\gerar-manual.py"
echo.
pause
