const axios = require('axios');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const REDIRECT_URI = 'https://theorderx.github.io/Autoposter-AI/callback.html';

console.log('=================================================');
console.log('      TIKTOK MANUEL TOKEN DÖNÜŞTÜRÜCÜ');
console.log('=================================================');

rl.question('Lütfen tarayıcı adresindeki "code=" kısmından sonraki kodu buraya yapıştırın:\n> ', async (code) => {
    try {
        console.log('\n⏳ Token alınıyor...');
        
        const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', 
            new URLSearchParams({
                client_key: CLIENT_KEY,
                client_secret: CLIENT_SECRET,
                code: code.trim(),
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        if (response.data && response.data.access_token) {
            console.log('\n✅ BAŞARILI! TikTok Tokeniniz aşağıdadır:\n');
            console.log('-------------------------------------------------');
            console.log(response.data.access_token);
            console.log('-------------------------------------------------');
            console.log('\nBu tokenı kopyalayıp .env içindeki TIKTOK_ACCOUNTS kısmına yapıştırın.');
        } else {
            console.log('\n❌ Hata: Token alınamadı. Yanıt:', JSON.stringify(response.data));
        }
    } catch (error) {
        console.log('\n❌ Hata oluştu:', error.response?.data || error.message);
    }
    rl.close();
});
