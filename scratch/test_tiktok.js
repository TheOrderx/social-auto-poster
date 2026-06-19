const axios = require('axios');

async function test() {
    const url = 'https://www.tiktok.com/@metnsanzz/video/7616417769571044628';
    try {
        console.log("Testing TikWM...");
        const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
        console.log("TikWM Response:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log("TikWM Error:", e.message);
    }
}

test();
