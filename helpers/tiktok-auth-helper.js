const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 4000;
require('dotenv').config();

// TikTok Developer Panelinden aldığınız bilgiler
const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || 'CLIENT_KEY_BURAYA';
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || 'CLIENT_SECRET_BURAYA';
const REDIRECT_URI = 'https://theorderx.github.io/Autoposter-AI/callback.html'; // Panelde bu şekilde kayıtlı olmalı

app.get('/login', (req, res) => {
    let url = 'https://www.tiktok.com/v2/auth/authorize/';
    url += `?client_key=${CLIENT_KEY}`;
    url += '&scope=user.info.basic,user.info.profile,user.info.stats,video.list,video.upload,video.publish';
    url += '&response_type=code';
    url += `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    url += '&state=' + Math.random().toString(36).substring(7);
    
    console.log('🔗 Giriş linki oluşturuldu, tarayıcıya yönlendiriliyor...');
    res.redirect(url);
});

app.get('/receive-code', async (req, res) => {
    // Tarayıcıdan (github.io) gelen isteği kabul etmesi için CORS izni
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { code } = req.query;
    if (!code) return res.json({ success: false, error: 'Kod alınamadı.' });

    try {
        console.log('⏳ Web sitesinden kod geldi! Token alınıyor...');
        const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', 
            new URLSearchParams({
                client_key: CLIENT_KEY,
                client_secret: CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const token = response.data.access_token;
        const refreshToken = response.data.refresh_token;
        if (token) {
            console.log('\n✅ BAŞARILI! Yeni Token Alındı.');
            console.log('🔄 Refresh Token:', refreshToken || 'YOK');
            
            // .env dosyasını otomatik güncelle
            const fs = require('fs');
            const path = require('path');
            const envPath = path.join(__dirname, '..', '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');
            
            // TIKTOK_ACCOUNTS içindeki access_token değerini bul ve değiştir
            envContent = envContent.replace(
                /(TIKTOK_ACCOUNTS=\[.*?\"token\"\s*:\s*\")[^\"]+(\")/s,
                `$1${token}$2`
            );
            
            // refresh_token varsa kaydet veya güncelle
            if (refreshToken) {
                if (envContent.includes('TIKTOK_REFRESH_TOKEN=')) {
                    envContent = envContent.replace(/TIKTOK_REFRESH_TOKEN=.*/, `TIKTOK_REFRESH_TOKEN=${refreshToken}`);
                } else {
                    envContent += `\nTIKTOK_REFRESH_TOKEN=${refreshToken}`;
                }
            }
            
            fs.writeFileSync(envPath, envContent);
            
            console.log('🚀 .env dosyası OTOMATIK olarak güncellendi! Bot kullanıma hazır.\n');
            res.json({ success: true });
        } else {
            console.log('❌ Token alınamadı:', response.data);
            res.json({ success: false });
        }
    } catch (error) {
        console.error('❌ Hata:', error.response?.data || error.message);
        res.json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 TikTok Onay Test Sunucusu Başlatıldı`);
    console.log(`=================================================\n`);
    console.log(`1. Tarayıcıda şu adresi açın: http://localhost:${PORT}/login`);
    console.log(`2. Sandbox hesabınızla giriş yapın.`);
    console.log(`3. İzinleri onaylayın.`);
    console.log(`\n⚠️ NOT: Bu işlemi yaparken ekran kaydı (VİDEO) almayı unutmayın!`);
});
