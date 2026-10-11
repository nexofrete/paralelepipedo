@echo off
title Redefinir senha do administrador - Nexofrete
cd /d "%~dp0backend"
echo ============================================
echo   Redefinir senha de um usuario (Nexofrete)
echo ============================================
echo Gera uma SENHA PROVISORIA: no proximo login, a pessoa
echo cadastra uma senha nova. Use quando ninguem consegue entrar.
echo.
node scripts\redefinirSenhaAdmin.js
echo.
pause
