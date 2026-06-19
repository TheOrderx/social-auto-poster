const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function downloadYtDlp() {
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    const filePath = path.join(__dirname, 'yt-dlp.exe');
    
    if (fs.existsSync(filePath)) {
        console.log("yt-dlp.exe already exists.");
        return;
    }

    console.log("Downloading yt-dlp.exe... (This might take a moment)");
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        writer.on('finish', () => {
            console.log("✅ yt-dlp.exe downloaded successfully!");
            process.exit(0);
        });

        writer.on('error', (err) => {
            console.error("❌ Download error:", err.message);
            process.exit(1);
        });
    } catch (e) {
        console.error("❌ Request error:", e.message);
        process.exit(1);
    }
}

downloadYtDlp();
