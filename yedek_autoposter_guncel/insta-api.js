const express = require('express');
const { instagramGetUrl } = require('instagram-url-direct');
const axios = require('axios');
const fs = require('fs');
const app = express();
const PORT = 3000;

// Basit log middleware
app.use((req, res, next) => {
    if (req.url !== '/health') {
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    }
    next();
});

// --- Bağımsız İndirme Motoru (yt-dlp) ---
const { exec } = require('child_process');
const path = require('path');

function downloadWithYtDlp(targetUrl, sessionId) {
    return new Promise((resolve, reject) => {
        const binPath = path.join(__dirname, 'yt-dlp.exe');
        const outPath = path.join(__dirname, 'videos', `dl_${sessionId}.mp4`);
        // -o: Çıktı dosyası, --no-part: Geçici dosya kullanma
        const cmd = `${binPath} -o "${outPath}" --no-playlist --user-agent "Mozilla/5.0" "${targetUrl}"`;
        
        console.log(`[yt-dlp] İndirme başlatılıyor...`);
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`[yt-dlp] İndirme Hatası: ${error.message}`);
                return reject(error);
            }
            if (fs.existsSync(outPath)) {
                resolve(outPath);
            } else {
                reject(new Error('Dosya indirilemedi'));
            }
        });
    });
}

// Evrensel indirme endpoint'i - Instagram / TikTok / YouTube
app.get('/download', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send('URL missing');

    const cleanUrl = url.split('?')[0];
    const isTikTok = url.includes('tiktok.com');
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isTwitter = url.includes('twitter.com') || url.includes('x.com');
    const sessionId = req.query.sessionId || Date.now().toString();

    console.log(`\n[${new Date().toLocaleTimeString()}] ⬇️ İndirme isteği: ${cleanUrl}`);

    try {
        // --- TikTok: Bağımsız yt-dlp (Doğrudan İndirme) ---
        if (isTikTok) {
            console.log(`🔍 TikTok için yt-dlp (Bağımsız Mod) deneniyor...`);
            try {
                const videoPath = await downloadWithYtDlp(url, sessionId);
                if (videoPath) {
                    console.log(`✅ yt-dlp: Video doğrudan indirildi (Filigransız).`);
                    return res.json({ status: 'success', videoPath: videoPath });
                }
            } catch (e) { console.log(`ℹ️ yt-dlp başarısız, dış servislere geçiliyor...`); }

            // Yedek: Dış API'ler
            console.log(`🔍 TikTok Dış API'leri deneniyor...`);
            try {
                const tikwmRes = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 10000 });
                if (tikwmRes.data?.data?.play) return res.json({ status: 'success', url: tikwmRes.data.data.play, caption: tikwmRes.data.data.title });
            } catch (e) {}

            try {
                const tiklyRes = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, { timeout: 10000 });
                if (tiklyRes.data?.data?.video?.no_watermark) return res.json({ status: 'success', url: tiklyRes.data.data.video.no_watermark });
            } catch (e) {}

            return res.status(404).send('TikTok video bulunamadi');
        }

        // Diğerleri için yt-dlp (Link Getirme)
        if (isYouTube || isTwitter) {
            try {
                const binPath = path.join(__dirname, 'yt-dlp.exe');
                const cmd = `${binPath} -g --no-playlist "${url}"`;
                const videoUrl = await new Promise((res, rej) => exec(cmd, (err, stdout) => err ? rej(err) : res(stdout.trim())));
                if (videoUrl) return res.json({ status: 'success', url: videoUrl });
            } catch (e) {}
        }

        // --- Geleneksel Dış Servisler ---
        if (isYouTube) {
            const cobaltRes = await axios.post('https://co.eepy.moe/api/json', { url: cleanUrl, vCodec: 'h264' }, { timeout: 15000 });
            const videoUrl = cobaltRes.data?.url || cobaltRes.data?.stream;
            if (videoUrl) return res.json({ status: 'success', url: videoUrl });
        }

        const result = await instagramGetUrl(cleanUrl);
        if (result && result.url_list) {
            const urls = result.url_list.map(i => typeof i === 'object' ? i.url : i);
            return res.json({ status: 'success', url: urls[0], urls: urls });
        } else if (result && result.url) {
            return res.json({ status: 'success', url: result.url });
        }
        
        res.status(404).send('İçerik bulunamadı');

    } catch (e) {
        console.error(`❌ API HATASI: ${e.message}`);
        res.status(404).send(e.message);
    }
});

// --- Sağlık Kontrolü ---
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        platforms: ['instagram', 'tiktok', 'youtube', 'twitter'],
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => console.log(`🚀 API PORT ${PORT} AKTIF - Instagram / TikTok / YouTube / Twitter destekleniyor`));
