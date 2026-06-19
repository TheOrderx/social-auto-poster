@echo off
title Yerel Instagram-TikTok-Twitter API Sunucusu
echo ============================================
echo   YEREL INDIRME API SUNUCUSU BASLATILIYOR
echo ============================================
echo.
echo [BILGI] Bu pencere bot calistigi surece acik kalmalidir.
echo [BILGI] Sunucu adresi: http://localhost:3000
echo.
node insta-api.js
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Sunucu baslatilamadi! Lutfen kutuphanelerin yuklu oldugundan emin olun.
    echo [KOMUT] npm install express axios instagram-url-direct
    pause
)
pause
