@echo off
title Instagram Bot Kontrol Paneli
:loop
cls
echo ============================================
echo   INSTAGRAM OTOMATIK POSTER BASLATILIYOR
echo ============================================
echo.
node bot.js
set EXIT_CODE=%errorlevel%

if %EXIT_CODE% equ 0 (
    echo.
    echo [BILGI] Bot temiz bir sekilde kapatildi.
    if exist bot.lock del bot.lock
    pause
    exit
)

echo.
echo ============================================
echo   BOT YENIDEN BASLATILIYOR... (Kod: %EXIT_CODE%)
echo ============================================
timeout /t 5
goto loop
