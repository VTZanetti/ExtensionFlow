@echo off
cd server
echo Instalando dependencias...
call npm install
echo Iniciando servidor...
call npm start
pause

