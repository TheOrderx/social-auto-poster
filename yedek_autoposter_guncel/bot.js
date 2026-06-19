const { 
  Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Partials,
  EmbedBuilder
} = require("discord.js");
const axios = require("axios");
const { Telegraf } = require("telegraf");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require("fs");
const path = require("path");
const delay = require("delay");
const geminiService = require("./gemini-service");
const envUpdater = require("./helpers/env-updater");

// --- Yapılandırma ---
require("dotenv").config({ override: true });
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_CONFIG = { token: process.env.GITHUB_TOKEN, owner: process.env.GITHUB_OWNER, repo: process.env.GITHUB_REPO };
const ERROR_LOG_CHANNEL_ID = "1501024841942437898"; // Sabit hata kanalı

// --- Dosya Sistemleri ---
const SCHEDULE_FILE = path.join(__dirname, "scheduled_posts.json");
if (!fs.existsSync(SCHEDULE_FILE)) fs.writeFileSync(SCHEDULE_FILE, "[]");

const LOCK_FILE = path.join(__dirname, "bot.lock");
if (fs.existsSync(LOCK_FILE)) {
  try {
    const pid = fs.readFileSync(LOCK_FILE, "utf8");
    process.kill(parseInt(pid), 0); 
    console.error(`\n⚠️ HATA: Bot zaten çalışıyor! (PID: ${pid})`);
    process.exit(1);
  } catch (e) { fs.unlinkSync(LOCK_FILE); }
}
fs.writeFileSync(LOCK_FILE, process.pid.toString());
process.on("exit", () => { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); });

// --- FFmpeg Ayarları ---
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// --- Global Log & Error Yönetimi ---
function logToDiscord(channel, message, type = "info") {
  const icons = { info: "ℹ️", success: "✅", warning: "⚠️", error: "❌", process: "⚙️" };
  const globalLogId = process.env.GLOBAL_LOG_CHANNEL_ID;
  
  if (!channel || typeof channel.send !== "function") {
    if (globalLogId && client) {
      const fallback = client.channels.cache.get(globalLogId);
      if (fallback) return fallback.send(`${icons[type]} ${message}`).catch(() => {});
    }
    if (channel) console.log(`${icons[type]} ${message}`);
    return Promise.resolve();
  }
  return channel.send(`${icons[type]} ${message}`).catch(() => {});
}

// console.error Override (Otomatik Discord Raporlama)
const originalConsoleError = console.error;
console.error = function(...args) {
  originalConsoleError.apply(console, args);
  try {
    const errorMessage = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    if (client && client.isReady()) {
      const errorChannel = client.channels.cache.get(ERROR_LOG_CHANNEL_ID);
      if (errorChannel) {
        const embed = {
          title: "❌ SİSTEM HATASI",
          description: `\`\`\`text\n${errorMessage.substring(0, 1900)}\n\`\`\``,
          color: 0xff0000,
          timestamp: new Date()
        };
        errorChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (e) {}
};

// --- Bot İstemcileri ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

let tgBot = null;
if (TELEGRAM_BOT_TOKEN && !TELEGRAM_BOT_TOKEN.includes("TOKEN")) {
  tgBot = new Telegraf(TELEGRAM_BOT_TOKEN);
  console.log("🤖 Telegram botu hazırlandı!");
}

// --- Yardımcılar & Bellek ---
const pendingPosts = new Map();
const activeSessions = new Set();
const createProgressBar = (percentage) => {
  const size = 10;
  const left = "█".repeat(Math.floor(percentage / 10));
  return `\`[${left}${"░".repeat(size - left.length)}]\` **%${Math.round(percentage)}**`;
};

// Bellek Temizleyici
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of pendingPosts.entries()) {
    if (now - data.timestamp > 3600000) pendingPosts.delete(id);
  }
}, 600000);

const STORY_CHANNEL_ID = process.env.STORY_CHANNEL_ID;
const TIKTOK_CHANNEL_ID = process.env.TIKTOK_CHANNEL_ID;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Parse Instagram accounts from environment
const ACCOUNTS = JSON.parse(process.env.INSTAGRAM_ACCOUNTS || "[]");

// --- GITHUB YAPILANDIRMASI (Zaten yukarıda tanımlı) ---

// Parse YouTube accounts from environment
const YOUTUBE_ACCOUNTS = JSON.parse(process.env.YOUTUBE_ACCOUNTS || "[]");

// Parse TikTok accounts from environment
const TIKTOK_ACCOUNTS = JSON.parse(process.env.TIKTOK_ACCOUNTS || "[]");

// Rastgele Seçilecek Açıklamalar Havuzu
const CAPTIONS_POOL = [
  // 1. Manifest Metni
  `Manifest, 2025 yılında Türkiye'de kurulan, altı üyeli bir kız grubudur. Grup, Hypers şirketinin YouTube üzerinden yayınladığı BIG 5 Türkiye programı ile oluşturuldu. Altı aylık bir kamp sürecinin sonunda üyeleri Esin Bahat, Hilal Yelekçi, Lidya Pınar, Mina Solak, Sueda Uluca ve Zeynep Oktay olarak belirlendi. İlk teklileri "Zamansızdık" 7 Şubat 2025'te yayınlandı. Ardından sırayla "Arıyo", "KTS" ve "Snap" şarkılarını yayınlayarak adlarını duyurmaya başladılar. İlk albümleri "Manifestival" Haziran 2025'te çıktı. Albüm toplamda 480 milyon üzerinde dinlemeye ulaştı. Çıktığı tarihten bu yana Spotify Türkiye’de en çok dinlenen albüm olarak liste başıdır.

Manifest 2005 çıkışlı Hepsi'den bu yana Türkiye'de kurulan ilk kız grubu olarak dikkat çekti. Grubun oluşturulma sürecinden başlayarak sosyal medya içerikleri, müzik tarzları ve dans koreografileri K-pop ile ilişkilendirildi.`,

  // 2. Asena Keskinci Metni
  `Asena Keskinci, Türk televizyon ve sinema oyuncusudur. 20 Nisan 2001’de İstanbul’da dünyaya gelmiş olup 2025 itibarıyla 24 yaşındadır. Küçük yaşta kamera karşısına geçmeye başlamış ve çocuk oyuncu olarak uzun yıllara yayılan bir kariyer inşa etmiştir.

Gerçek adı Reyhan Asena Keskinci’dir ve oyunculuk kariyerine 2004’te Aliye ve Yadigar gibi dizilerle başlamıştır. Çocukluk döneminde özellikle Bez Bebek dizisinde canlandırdığı Yağmur karakteri ile geniş kitlelerce tanınmıştır.

Keskinci uzun yıllar boyunca Türkiye televizyonlarında ve sinema projelerinde yer almıştır. Rol aldığı yapımlar arasında Hırsız Polis, Parmaklıklar Ardında, Masumiyet, Adı Sevgi gibi diziler ile Aşk Tesadüfleri Sever, Köstebekgiller: Perili Orman, Ahlat Ağacı gibi filmler bulunur. Özellikle Nuri Bilge Ceylan’ın Ahlat Ağacı’ndaki rolü oyunculuk kariyerinde dikkat çeken bir projedir.

Eğitimini İstanbul Üniversitesi Devlet Konservatuvarı’nda oyunculuk alanında tamamlamıştır; bu da sadece set tecrübesine değil akademik bir temele de sahip olduğunu gösterir.

2025’in sonlarında Asena Keskinci, HBO Max için çekilen dizi “Jasmine” adlı yapımda başrol olarak yer almasıyla tekrar gündeme gelmiştir.

Özel yaşamındaki ilişkiler ya da magazin iddiaları üzerine sosyal medyada gündeme gelen paylaşımlarda bulunmuştur; örneğin eski oyuncu Evrim Akın ile ilgili bazı iddialar tartışılmış, ancak bu konuların gerçekliği

#kesfet #kesfetteyiz #galatasaray #fyp #fypage`,

  // 3. Tevfik Fikret Metni
  `Tevfik Fikret (1867–1915)
Tevfik Fikret, Servetifünun edebiyatının en önemli şairidir. Türk edebiyatında modern şiirin öncülerinden biri olarak kabul edilir.
👤 Doğumu ve Ailesi
Tevfik Fikret, 24 Aralık 1867 tarihinde İstanbul’da doğmuştur. Asıl adı Mehmet Tevfik’tir. Annesini küçük yaşta kaybetmiştir. Bu durum onun içe dönük, duygusal ve hassas bir kişilik geliştirmesinde etkili olmuştur.
📚 Eğitimi
Galatasaray Sultanisi’nde (bugünkü Galatasaray Lisesi) eğitim görmüştür. Okul yıllarında edebiyata ilgi duymuş, şiir yazmaya başlamıştır. Mezun olduktan sonra öğretmenlik yapmış, daha sonra Galatasaray Lisesi’nde müdürlük görevinde bulunmuştur.
✍️ Edebi Hayatı
Tevfik Fikret, Servetifünun topluluğunun lideri olmuştur. İlk dönemlerinde “sanat için sanat” anlayışını benimsemiştir. Şiirlerinde bireysel duygular, karamsarlık, doğa ve hayal temalarına yer vermiştir.
Zamanla toplum sorunlarına yönelmiş; özgürlük, adalet ve baskıya karşı duruşunu şiirlerine yansıtmıştır.
🏛️ Görevleri
Servetifünun dergisinin yönetimini üstlenmiştir. II. Abdülhamid dönemindeki baskıcı yönetime karşı çıkmıştır. Akılcı, yenilikçi ve özgürlükçü bir düşünce yapısına sahiptir.
📖 Önemli Eserleri
* Rübab-ı Şikeste → En ünlü şiir kitabıdır.
* Haluk’un Defteri → Oğlu Haluk için yazdığı şiirlerden oluşur.
* Tarih-i İstanbul → Dönemin baskıcı düzenini eleştirir.
* Şermin → Çocuklar için yazılmış, sade ve öğretici şiirler içerir.
🪦 Ölümü
Tevfik Fikret, 19 Ağustos 1915 tarihinde İstanbul’da hayatını kaybetmiştir. Aşiyan’daki evi günümüzde müze olarak kullanılmaktadır.
✨ Genel Değerlendirme
Tevfik Fikret, Türk edebiyatında modern şiirin gelişmesinde önemli bir rol oynamış; düşünceleri ve eserleri birçok sanatçıyı etkilemiştir.
.
#keşfet #keşfetteyiz #fypppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp #keşfetteyim #kesfet`
];

// Gerekli ortam değişkenlerini doğrula
if (!DISCORD_TOKEN || !CHANNEL_ID) {
  console.error(
    "❌ Gerekli ortam değişkenleri eksik: DISCORD_TOKEN, CHANNEL_ID",
  );
  process.exit(1);
}

if (ACCOUNTS.length === 0) {
  console.warn("⚠️ Hiçbir Instagram hesabı yapılandırılmamış");
}

if (!GITHUB_CONFIG.token || !GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) {
  console.warn("⚠️ GitHub yapılandırması eksik - yüklemeler başarısız olabilir");
}

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY ayarlanmamış - Yapay zeka açıklamaları devre dışı kalacak");
  console.warn("   Yapay zeka desteğini açmak için .env dosyasına GEMINI_API_KEY ekleyin");
  console.warn(
    "   Ücretsiz API anahtarınızı buradan alabilirsiniz: https://aistudio.google.com/app/apikey",
  );
}

const BASE_CAPTION = `Manifest, 2025 yılında Türkiye'de kurulan, altı üyeli bir kız grubudur. İlk teklileri "Zamansızdık" ve "Manifestival" albümüyle Spotify Türkiye listelerini altüst eden grup, müzik tarzları ve dans koreografileriyle Türkiye'nin ilk modern kız grubu olarak dikkat çekiyor. ✨

#manifest #müzik #kesfet #kesfetteyiz #fyp`;


// Log Buffer for !log command
const recentLogs = [];
const MAX_LOG_LINES = 50;

// Wrap console.log and console.error to store logs in buffer
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  recentLogs.push(`[INFO] ${new Date().toLocaleTimeString()}: ${message}`);
  if (recentLogs.length > MAX_LOG_LINES) recentLogs.shift();
  originalLog.apply(console, args);
};

console.error = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  recentLogs.push(`[ERROR] ${new Date().toLocaleTimeString()}: ${message}`);
  if (recentLogs.length > MAX_LOG_LINES) recentLogs.shift();
  originalError.apply(console, args);
};

// activeSessions zaten yukarıda tanımlı (Satır 95)
const MAX_CONCURRENT_SESSIONS = 5;

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 15000,
  maxDelay: 120000,
  backoffMultiplier: 2,
};

// Timing constants to avoid magic numbers
const DELAYS = {
  BETWEEN_ACCOUNTS: 30000, // 30 seconds between Instagram account uploads
  BETWEEN_YOUTUBE: 10000, // 10 seconds between YouTube uploads
  RANDOM_MIN: 2000, // Minimum random delay
  RANDOM_MAX: 5000, // Maximum random delay
  RANDOM_LARGE_MIN: 5000, // Larger random delay min
  RANDOM_LARGE_MAX: 8000, // Larger random delay max
  COMMENT_DELAY_MIN: 5000, // Min delay before posting comment
  COMMENT_DELAY_MAX: 8000, // Max delay before posting comment
  RATE_LIMIT_WAIT: 60000, // 1 minute wait for rate limits
  CONTAINER_CHECK: 5000, // Base delay for checking container status
  CONTAINER_CHECK_RANDOM: 8000, // Random addition to container check
  PUBLISH_DELAY_MIN: 5000, // Min delay before publishing
  PUBLISH_DELAY_MAX: 10000, // Max delay before publishing
  DOWNLOAD_RETRY: 5000, // Delay between download retries
  API_RETRY: 10000, // Delay between API retries
  BACKOFF_BASE: 30000, // Base backoff delay (30s)
};

// Timeout constants
const TIMEOUTS = {
  AXIOS_DEFAULT: 30000, // 30 seconds
  AXIOS_DOWNLOAD: 60000, // 60 seconds for video downloads
  DOWNLOAD_TOTAL: 120000, // 2 minutes total download timeout
  CAPTION_EXTRACTION: 20000, // 20 seconds for caption extraction
  OEMBED_API: 8000, // 8 seconds for oEmbed API
  GITHUB_UPLOAD: 120000, // 2 minutes for GitHub upload
  YOUTUBE_API: 15000, // 15 seconds for YouTube API calls
  YOUTUBE_UPLOAD: 30000, // 30 seconds for YouTube upload
  INSTAGRAM_API: 30000, // 30 seconds for Instagram API
  INSTAGRAM_STATUS: 15000, // 15 seconds for status checks
};

// File size limits
const FILE_LIMITS = {
  MIN_VIDEO_SIZE: 1024, // 1KB minimum
  GITHUB_MAX_MB: 75, // 75MB for GitHub (100MB / 1.33 encoding overhead = ~75MB)
  YOUTUBE_MAX_GB: 128, // 128GB for YouTube (unverified accounts)
  INSTAGRAM_CAPTION_MAX: 2200, // Instagram caption character limit
};

client.once(Events.ClientReady, async () => {
  console.log(`\n🤖 Bot ${client.user.tag} olarak giriş yaptı!`);

  // Discord kanalına botun başladığını bildir
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (channel) {
      await logToDiscord(channel, "✅ Bot başarıyla başlatıldı ve görev bekliyor!", "success");
    }
  } catch (err) {
    console.error(`⚠️ Başlangıç mesajı gönderilemedi: ${err.message}`);
  }

  // Yerel API sağlık kontrolü
  try {
    const healthRes = await axios.get('http://localhost:3000/health', { timeout: 5000 });
    if (healthRes.data?.status === 'ok') {
      console.log(`✅ Yerel API aktif (uptime: ${healthRes.data.uptime}s, platformlar: ${healthRes.data.platforms.join(', ')})`);
    }
  } catch (err) {
    console.warn('⚠️ Yerel API (localhost:3000) kapalı! Fallback API\'ler kullanılacak.');
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel) {
        await logToDiscord(channel, '⚠️ Yerel indirme API\'si (localhost:3000) kapalı! Yedek API\'ler devrede. Hız düşebilir.', 'warning');
      }
    } catch (_) {}
  }

  // Başlangıçta Instagram tokenlarını otomatik yenile
  try {
    await autoRefreshInstagramTokens();
  } catch (error) {
    console.error(`❌ Token yenileme sırasında kritik hata: ${error.message}`);
    console.error(
      "⚠️  Bot devam edecek, ancak tokenların süresi dolmuşsa yüklemeler başarısız olabilir",
    );
  }
});

/**
 * Auto-refresh Instagram tokens on startup
 * Extends token validity by 60 days if successful
 *
 * @throws {Error} If critical error occurs during refresh
 */
async function autoRefreshInstagramTokens() {
  // Check if tokens were recently refreshed (within last 5 minutes)
  const REFRESH_COOLDOWN = 5 * 60 * 1000; // 5 minutes
  const timestampFile = path.join(__dirname, ".last-token-refresh");

  try {
    if (fs.existsSync(timestampFile)) {
      const lastRefresh = parseInt(fs.readFileSync(timestampFile, "utf8"));
      const timeSinceRefresh = Date.now() - lastRefresh;

      if (timeSinceRefresh < REFRESH_COOLDOWN) {
        const secondsAgo = Math.floor(timeSinceRefresh / 1000);
        const minutesAgo = Math.floor(secondsAgo / 60);
        const displayTime =
          minutesAgo > 0
            ? `${minutesAgo} dakika önce`
            : `${secondsAgo} saniye önce`;
        /*
        console.log(
          `⏭️  Token yenileme atlanıyor (en son ${displayTime} yenilenmiş)\n`,
        );
        */
        return;
      }
    }
  } catch (error) {
    // If we can't read timestamp, proceed with refresh
  }

  // console.log("\n🔄 Instagram tokenları otomatik yenileniyor...");

  // Reload environment variables to get latest tokens
  delete require.cache[require.resolve("dotenv")];
  require("dotenv").config({ override: true });

  let accounts;
  try {
    const accountsStr = process.env.INSTAGRAM_ACCOUNTS || "[]";
    accounts = JSON.parse(accountsStr);

    if (!Array.isArray(accounts)) {
      throw new Error("INSTAGRAM_ACCOUNTS must be an array");
    }
  } catch (error) {
    console.log(`⚠️  Instagram hesapları okunamadı: ${error.message}`);
    console.log("   Token yenileme atlanıyor");
    return;
  }

  if (accounts.length === 0) {
    console.log("⚠️  Yapılandırılmış Instagram hesabı yok, yenileme atlanıyor");
    return;
  }

  const updatedAccounts = [];
  let refreshedCount = 0;
  let failedCount = 0;
  const REFRESH_TIMEOUT = 20000; // 20 seconds per account
  const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds between requests to avoid rate limiting

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const accountName = account.name || `Account ${i + 1}`;

    // Add delay between requests (except for first account)
    if (i > 0) {
      await delay(DELAY_BETWEEN_REQUESTS);
    }

    // Validate account structure
    if (!account || typeof account !== "object") {
      console.log(`⚠️  ${accountName}: Invalid account structure, skipping`);
      updatedAccounts.push(account);
      failedCount++;
      continue;
    }

    if (!account.token) {
      console.log(`⚠️  ${accountName}: Missing token, skipping`);
      updatedAccounts.push(account);
      failedCount++;
      continue;
    }

    if (!account.id) {
      console.log(`⚠️  ${accountName}: Missing Instagram ID, skipping`);
      updatedAccounts.push(account);
      failedCount++;
      continue;
    }

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout")), REFRESH_TIMEOUT);
      });

      // Create refresh request promise
      // Detect Business token
      let refreshUrl = "https://graph.instagram.com/refresh_access_token";
      let params = {
        grant_type: "ig_refresh_token",
        access_token: account.token,
      };

      if (account.token.startsWith("EAAM")) {
        refreshUrl = "https://graph.facebook.com/v22.0/oauth/access_token";
        params = {
          grant_type: "fb_exchange_token",
          client_id: process.env.INSTAGRAM_APP_ID || "936619743392459", // Use env var or fallback
          client_secret: process.env.INSTAGRAM_APP_SECRET,
          fb_exchange_token: account.token
        };
      } else if (process.env.INSTAGRAM_APP_SECRET) {
        params.client_secret = process.env.INSTAGRAM_APP_SECRET;
      }

      const refreshPromise = axios.get(refreshUrl, { 
        params,
        timeout: REFRESH_TIMEOUT - 1000 
      });

      // Race between timeout and actual request
      const response = await Promise.race([refreshPromise, timeoutPromise]);

      if (response.data && response.data.access_token) {
        const newToken = response.data.access_token;
        const expiresIn = response.data.expires_in;
        const daysValid = Math.floor(expiresIn / 86400);

        // Log only if needed or keep it minimal
        // console.log(`✅ ${accountName}: Token yenilendi (${daysValid} gün geçerli)`);

        // Eski hesaptaki TÜM özellikleri (reelsChannel, postChannel vb.) koru, sadece token'ı güncelle
        updatedAccounts.push({
          ...account,
          token: newToken,
        });
        refreshedCount++;
      } else {
        console.log(
          `⚠️  ${accountName}: Beklenmedik yanıt formatı, eski token korunuyor`,
        );
        updatedAccounts.push(account);
        failedCount++;
      }
    } catch (error) {
      // Extract detailed error information
      let errorMsg = error.message;
      let errorCode = null;
      let httpStatus = null;

      if (error.response) {
        httpStatus = error.response.status;
        errorCode = error.response.data?.error?.code;
        errorMsg = error.response.data?.error?.message || error.message;

        // Provide specific guidance based on error
        if (httpStatus === 400 && errorCode === 190) {
          errorMsg = "Token süresi dolmuş veya geçersiz - manuel olarak yeniden alınmalı";
        } else if (httpStatus === 429) {
          errorMsg = "Hız sınırı aşıldı - çok fazla yenileme isteği";
        } else if (httpStatus === 403) {
          errorMsg = "İzin reddedildi - uygulama izinlerini kontrol edin";
        }
      }

      console.log(`❌ ${accountName}: Yenileme başarısız`);
      console.log(`   Hata: ${errorMsg}`);
      if (httpStatus) console.log(`   HTTP Durumu: ${httpStatus}`);
      if (errorCode) console.log(`   Hata Kodu: ${errorCode}`);
      console.log(`   → Eski token korunuyor ancak süresi dolmuş olabilir`);

      updatedAccounts.push(account);
      failedCount++;
    }
  }

  // Only update .env file if at least one token was successfully refreshed
  if (refreshedCount > 0) {
    try {
      const result = await envUpdater.updateEnvFile(
        "INSTAGRAM_ACCOUNTS",
        updatedAccounts,
      );

      if (result.success) {
        console.log(
          `✅ .env dosyası ${refreshedCount} yenilenmiş token ile güncellendi`,
        );

        // Reload environment variables after update
        delete require.cache[require.resolve("dotenv")];
        require("dotenv").config();

        // Write timestamp to prevent double-refresh
        try {
          const timestampFile = path.join(__dirname, ".last-token-refresh");
          fs.writeFileSync(timestampFile, Date.now().toString(), "utf8");
        } catch (tsError) {
          // Non-critical error, just log it
        }
      } else {
        console.log(`⚠️  .env dosyası güncellenemedi: ${result.error}`);
        console.log(
          "   Tokenlar yenilendi ancak kaydedilemedi - 1 saat içinde süreleri dolacaktır",
        );
      }
    } catch (error) {
      console.log(`⚠️  Error updating .env file: ${error.message}`);
      console.log(
        "   Tokens were refreshed but not saved - they will expire in 1 hour",
      );
    }
  } else if (failedCount === accounts.length) {
    console.log("⚠️  All token refreshes failed - .env file not updated");
  }

  /* 
  console.log(
    `📊 Instagram token yenileme: ${refreshedCount} başarılı, ${failedCount} başarısız\n`,
  );
  */

  if (failedCount > 0) {
    console.log(
      "💡 İpucu: Detaylı token durumu için 'npm run instagram-refresh' komutunu çalıştırın",
    );

    if (refreshedCount === 0) {
      console.log("⚠️  UYARI: Tüm tokenların yenilenmesi başarısız oldu!");
      console.log("   Eğer tokenların süresi dolmuşsa yüklemeler başarısız olacaktır.");
      console.log("   Yeni token oluşturmak için: SETUP_GUIDE.md dosyasını inceleyin\n");
    }
  }
}

async function retryUpload(uploadFunction, account, ...args) {
  let lastError = null;

  // Extract channel from args (should be the last argument)
  const channel = args[args.length - 1];

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      console.log(
        `${account.name} için yükleme denemesi ${attempt}/${RETRY_CONFIG.maxRetries}`,
      );
      const result = await uploadFunction(account, ...args);

      if (attempt > 1 && channel) {
        await logToDiscord(
          channel,
          `✅ Upload succeeded on attempt ${attempt} for ${account.name}`,
          "success",
        );
      }

      return result;
    } catch (error) {
      lastError = error;
      console.log(
        `${account.name} için yükleme denemesi ${attempt} başarısız oldu: ${error.message}`,
      );

      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay *
            Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
          RETRY_CONFIG.maxDelay,
        );

        if (channel) {
          await logToDiscord(
            channel,
            `⚠️ Yükleme denemesi ${attempt} başarısız (${account.name}). ${Math.round(delay / 1000)} saniye içinde tekrar deneniyor...`,
            "warning",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw lastError;
}

// --- MESAJ DİNLEYİCİSİ ---

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // !liste komutu - Şık Embed Versiyonu
  if (message.content.toLowerCase().trim() === "!liste") {
    try {
      const scheduleData = fs.readFileSync(SCHEDULE_FILE, "utf-8");
      const schedule = JSON.parse(scheduleData || "[]");
      
      const listEmbed = new EmbedBuilder()
        .setTitle("📅 Paylaşım Takvimi")
        .setColor(0x3498db)
        .setTimestamp();

      if (schedule.length === 0) {
        listEmbed.setDescription("ℹ️ Şu anda bekleyen zamanlanmış bir paylaşım bulunmuyor.");
      } else {
        const sorted = schedule.sort((a, b) => a.scheduledDate - b.scheduledDate).slice(0, 10);
        let description = "";
        sorted.forEach((p, i) => {
          const dateStr = new Date(p.scheduledDate).toLocaleString('tr-TR');
          description += `**${i+1}.** 🕒 \`${dateStr}\`\n🔗 [Video Linki](${p.reelUrl}) | 📺 \`${(p.matchType || 'URL').toUpperCase()}\`\n\n`;
        });
        listEmbed.setDescription(description);
        if (schedule.length > 10) listEmbed.setFooter({ text: `+${schedule.length - 10} adet daha planlanmış görev var.` });
      }
      
      return message.reply({ embeds: [listEmbed] });
    } catch (e) {
      return message.reply("❌ Liste okunurken bir hata oluştu.");
    }
  }

  // !panel komutu - Tüm Sistem Durumu
  if (message.content.toLowerCase() === '!panel') {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    const panelEmbed = new EmbedBuilder()
      .setTitle("🚀 Antigravity AI - Kontrol Paneli")
      .setDescription("Sistemin genel durumu ve aktif hesap bilgileri aşağıdadır.")
      .addFields(
        { name: "📊 Hesap Durumu", value: `📸 IG: \`${ACCOUNTS.length}\`\n🎬 TT: \`${TIKTOK_ACCOUNTS.length}\`\n📺 YT: \`${YOUTUBE_ACCOUNTS.length}\``, inline: true },
        { name: "⚙️ Sistem", value: `⏱️ Uptime: \`${hours}s ${minutes}d\`\n⚡ Gecikme: \`${client.ws.ping}ms\``, inline: true },
        { name: "🛡️ Güvenlik", value: `🔐 Lock: \`Aktif\`\n🆔 PID: \`${process.pid}\``, inline: true }
      )
      .setColor(0x2ecc71)
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({ text: "Sistemi yeniden başlatmak için !restart kullanabilirsiniz." })
      .setTimestamp();

    return message.reply({ embeds: [panelEmbed] });
  }

  // !api komutu - Yerel API durumunu kontrol et
  if (message.content.toLowerCase() === '!api') {
    try {
      const start = Date.now();
      const healthRes = await axios.get('http://localhost:3000/health', { timeout: 5000 });
      const ping = Date.now() - start;
      const data = healthRes.data;
      const embed = {
        title: '🟢 Yerel API Aktif',
        color: 0x2ecc71,
        fields: [
          { name: '⏱️ Ping', value: `\`${ping}ms\``, inline: true },
          { name: '🕐 Uptime', value: `\`${data.uptime}s\``, inline: true },
          { name: '📡 Platformlar', value: data.platforms.map(p => `\`${p}\``).join(' '), inline: false },
          { name: '🕒 Zaman', value: `\`${new Date(data.timestamp).toLocaleString('tr-TR')}\``, inline: false },
        ],
        footer: { text: 'http://localhost:3000/health' }
      };
      return message.reply({ embeds: [embed] });
    } catch (err) {
      const embed = {
        title: '🔴 Yerel API Kapalı',
        description: 'Yerel indirme API\'si çalışmıyor. Yedek API\'ler (TikWM, Cobalt vb.) kullanılıyor.',
        color: 0xe74c3c,
        fields: [{ name: '❌ Hata', value: `\`${err.message}\`` }],
        footer: { text: 'API\'yi başlatmak için: api_baslat.bat' }
      };
      return message.reply({ embeds: [embed] });
    }
  }

  // !restart, !log, !stop, !clear komutları (Kısa versiyonlar)
  if (message.content.toLowerCase() === "!restart") {
    await logToDiscord(message.channel, "🔄 Bot yeniden başlatılıyor...", "process");
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    setTimeout(() => process.exit(99), 1000);
    return;
  }
  if (message.content.toLowerCase() === "!log") {
    const logOutput = recentLogs.slice(-20).join('\n');
    return message.reply(logOutput ? `📜 **Son 20 Log:**\n\`\`\`text\n${logOutput.substring(0, 1900)}\n\`\`\`` : "ℹ️ Log bulunmuyor.");
  }
  if (message.content.toLowerCase() === "!stop") {
    await logToDiscord(message.channel, "🛑 Bot kapatılıyor...", "error");
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    process.exit(0);
  }
  if (message.content.toLowerCase().startsWith("!clear")) {
    const amount = Math.min(parseInt(message.content.split(" ")[1]) || 100, 100);
    return message.channel.bulkDelete(amount, true).then(d => message.channel.send(`🧹 **${d.size}** mesaj silindi.`).then(m => setTimeout(() => m.delete(), 3000))).catch(() => message.reply("⚠️ Temizleme hatası."));
  }

  // Kanal ve Link Analizi
  const currentChannelId = message.channel.id;
  require("dotenv").config({ override: true });
  const accounts = JSON.parse(process.env.INSTAGRAM_ACCOUNTS || "[]");
  
  const targetInstagramAccounts = accounts.filter(acc => 
    acc.reelsChannel == currentChannelId || acc.storyChannel == currentChannelId || acc.postChannel == currentChannelId ||
    (!acc.reelsChannel && currentChannelId == process.env.CHANNEL_ID) || (!acc.storyChannel && currentChannelId == process.env.STORY_CHANNEL_ID)
  );

  const targetYouTubeAccounts = JSON.parse(process.env.YOUTUBE_ACCOUNTS || "[]").filter(() => currentChannelId == (process.env.YOUTUBE_CHANNEL_ID || YOUTUBE_CHANNEL_ID));
  const targetTikTokAccounts = JSON.parse(process.env.TIKTOK_ACCOUNTS || "[]").filter(acc => acc.channelId == currentChannelId || (!acc.channelId && currentChannelId == (process.env.TIKTOK_CHANNEL_ID || TIKTOK_CHANNEL_ID)));

  // İşlem logu
  console.log(`\n[${new Date().toLocaleTimeString()}] 📩 Mesaj: #${message.channel.name} | IG:${targetInstagramAccounts.length} YT:${targetYouTubeAccounts.length} TT:${targetTikTokAccounts.length}`);

  if (targetInstagramAccounts.length === 0 && targetYouTubeAccounts.length === 0 && targetTikTokAccounts.length === 0) return;

  const instaRegex = /https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/g;
  const tiktokRegex = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/g;
  const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/shorts\/|youtu\.be\/)[^\s]+/g;
  
  const allMatches = [
    ...(message.content.match(instaRegex) || []).map(url => ({ url, type: 'instagram' })),
    ...(message.content.match(tiktokRegex) || []).map(url => ({ url, type: 'tiktok' })),
    ...(message.content.match(youtubeRegex) || []).map(url => ({ url, type: 'youtube' }))
  ];
  
  if (allMatches.length === 0) {
    console.log(`⚠️ Uyarı: Kanal eşleşti ancak geçerli bir video linki bulunamadı.`);
    return;
  }

  console.log(`✅ Mesajda ${allMatches.length} adet link bulundu!`);

  for (const match of allMatches) {
    let reelUrl = match.url;
    const isRepost = message.content.toLowerCase().includes("repost");
    const postAsStory = targetInstagramAccounts.some(acc => acc.storyChannel === currentChannelId) || currentChannelId === (process.env.STORY_CHANNEL_ID || STORY_CHANNEL_ID);

    if (match.type === 'instagram' && reelUrl.includes("/reels/")) {
      reelUrl = reelUrl.replace("/reels/", "/reel/");
      console.log(`🔄 URL normalize edildi (/reels/ -> /reel/): ${reelUrl}`);
    }

    console.log(`🔗 ${match.type.toUpperCase()} URL'si işleniyor: ${reelUrl}`);
    let author = "Orijinal İçerik Üreticisi";

    const authorMatch = message.content.match(/author:?\s*([^\s,\n\r]+)/i);
    if (authorMatch) {
      author = authorMatch[1].trim();
      console.log(`👤 Kullanılan üretici: ${author}`);
    } else {
      try {
        let oembedUrl = reelUrl.includes("tiktok.com") ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(reelUrl)}` : 
                       (reelUrl.includes("youtube.com") || reelUrl.includes("youtu.be") ? `https://www.youtube.com/oembed?url=${encodeURIComponent(reelUrl)}&format=json` : 
                       `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(reelUrl)}`);
        console.log(`📡 Oembed bilgisi sorgulanıyor: ${oembedUrl}`);
      } catch (e) { console.log("⚠️ Oembed hatası yoksayıldı."); }
    }

    // Zamanlama Kontrolü
    const fullDateMatch = message.content.match(/\b(\d{1,2}\.\d{1,2}(?:\.\d{4})?)\s+(\d{1,2}:\d{2})\b/);
    const timeOnlyMatch = message.content.match(/\b(\d{1,2}:\d{2})\b/);
    let scheduledDate = null;

    if (fullDateMatch) {
      const [d, t] = [fullDateMatch[1], fullDateMatch[2]];
      const [day, month, year] = d.split(".").map(Number);
      const [h, m] = t.split(":").map(Number);
      scheduledDate = new Date(year || new Date().getFullYear(), month - 1, day, h, m, 0);
    } else if (timeOnlyMatch) {
      const [h, m] = timeOnlyMatch[1].split(":").map(Number);
      scheduledDate = new Date();
      scheduledDate.setHours(h, m, 0, 0);
      if (scheduledDate <= new Date()) scheduledDate.setDate(scheduledDate.getDate() + 1);
    }

    if (scheduledDate) {
      console.log(`📅 Paylaşım planlandı: ${scheduledDate.toLocaleString('tr-TR')}`);
      const schedule = JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf-8") || "[]");
      schedule.push({ id: Date.now().toString(), reelUrl, author, manualCaption: message.content.replace(instaRegex, "").trim(), scheduledDate: scheduledDate.getTime(), channelId: message.channelId, isRepost });
      fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
      await message.reply(`📅 Paylaşım sıraya alındı: **${scheduledDate.toLocaleString('tr-TR')}**`);
      continue;
    }

    // İşlem Başlatma
    const isSystemMessage = message.author.tag === "System-Scheduler";
    const context = { sourcePlatform: "discord", message, author, channelId: currentChannelId, manualCaption: message.content.replace(instaRegex, "").trim(), isRepost, matchType: match.type, postAsStory, targetInstagramAccounts, targetYouTubeAccounts, targetTikTokAccounts };

    if (isSystemMessage) {
      console.log(`🤖 [Sistem] Zamanlanmış görev tetiklendi, motor başlatılıyor...`);
      handleSocialMediaProcess(reelUrl, context);
    } else {
      console.log(`⏳ Kullanıcı onayı bekleniyor (Butonlar gönderildi)...`);
      const postId = Date.now().toString() + Math.random().toString(36).substring(7);
      pendingPosts.set(postId, { reelUrl, author, manualCaption: context.manualCaption, channelId: currentChannelId, isRepost, matchType: match.type, timestamp: Date.now() });
      
      const platformIcons = { instagram: "📸", tiktok: "🎬", youtube: "📺" };

      const captureEmbed = new EmbedBuilder()
        .setTitle(`${platformIcons[match.type] || "🔗"} Video Yakalandı!`)
        .setDescription(`Bir **${match.type.toUpperCase()}** videosu tespit ettim. Bu içeriği platformlara aktarmak için aşağıdaki butonları kullanabilirsiniz.`)
        .addFields(
          { name: "👤 Kaynak Üretici", value: `\`${author}\``, inline: true },
          { name: "📺 Platform", value: `\`${match.type.toUpperCase()}\``, inline: true },
          { name: "🔗 Orijinal Link", value: `[Videoya Git](${reelUrl})`, inline: false }
        )
        .setColor(match.type === 'instagram' ? 0xe1306c : (match.type === 'tiktok' ? 0x25f4ee : 0xff0000))
        .setThumbnail(message.author.displayAvatarURL())
        .setFooter({ text: "Antigravity AI • İçerik Yönetim Sistemi" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_postnow_${postId}`).setLabel('🚀 Şimdi Paylaş').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`btn_schedule_${postId}`).setLabel('📅 Planla').setStyle(ButtonStyle.Primary)
      );
      
      await message.reply({ embeds: [captureEmbed], components: [row] });
    }
  }
});

// --- PLATFORM İŞLEM MOTORU ---

async function handleSocialMediaProcess(reelUrl, context) {
  const { 
    message, author, channelId, manualCaption, isRepost, 
    postAsStory, targetInstagramAccounts, targetYouTubeAccounts, 
    targetTikTokAccounts, sourcePlatform 
  } = context;

  const sessionId = Date.now().toString();
  activeSessions.add(sessionId);

  const progressSteps = { download: "⏳ Bekleniyor...", process: "⏳ Bekleniyor...", upload: "⏳ Bekleniyor..." };
  let statusMsg = null;

  const updateStatus = async (title, status, color = 0x3498db) => {
    try {
      const startTime = statusMsg ? (sourcePlatform === "discord" ? statusMsg.createdTimestamp : Date.now()) : Date.now();
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      let percent = 0;
      if (progressSteps.download.includes("✅")) percent += 33;
      if (progressSteps.process.includes("✅")) percent += 33;
      if (progressSteps.upload.includes("✅")) percent += 34;

      const desc = `${status}\n\n${createProgressBar(percent)}`;
      const footerText = `Oturum: ${sessionId} • Antigravity AI`;

      if (sourcePlatform === "discord") {
        const platformColors = { instagram: 0xe1306c, tiktok: 0x25f4ee, youtube: 0xff0000 };
        const platformThumbnails = { 
          instagram: "https://cdn-icons-png.flaticon.com/512/174/174855.png",
          tiktok: "https://cdn-icons-png.flaticon.com/512/3046/3046121.png",
          youtube: "https://cdn-icons-png.flaticon.com/512/1384/1384060.png"
        };

        const embed = {
          title: `🔄 İşlem Yürütülüyor: ${title}`,
          description: `**Durum:** ${status}\n\n${createProgressBar(percent)}`,
          fields: [
            { name: "📥 İndirme", value: progressSteps.download, inline: true },
            { name: "🛠️ İşleme", value: progressSteps.process, inline: true },
            { name: "📤 Paylaşım", value: progressSteps.upload, inline: true }
          ],
          color: platformColors[context.matchType] || color,
          thumbnail: { url: platformThumbnails[context.matchType] || "" },
          timestamp: new Date(),
          footer: { text: `Oturum: ${sessionId} • Antigravity AI Dashboard` },
        };
        if (!statusMsg) statusMsg = await message.channel.send({ embeds: [embed] });
        else await statusMsg.edit({ embeds: [embed] }).catch(() => {});
      } else {
        const text = `⚙️ *${title}*\n\n${desc}\n\n📥 *İndirme:* ${progressSteps.download}\n🛠️ *İşleme:* ${progressSteps.process}\n📤 *Paylaşım:* ${progressSteps.upload}\n⏱️ *Süre:* ${elapsed}s\n👤 *Üretici:* ${author}`;
        if (!statusMsg) statusMsg = await message.replyWithMarkdown(text);
        else await tgBot.telegram.editMessageText(message.chat.id, statusMsg.message_id, null, text, { parse_mode: 'Markdown' }).catch(() => {});
      }
    } catch (err) { console.error("Panel hatası:", err.message); }
  };

  const logToTarget = async (msg, type = "info") => {
    if (sourcePlatform === "discord") await logToDiscord(message.channel, msg, type);
    else await message.reply(`${type === "success" ? "✅" : "❌"} ${msg}`).catch(() => {});
  };

  try {
    progressSteps.download = "🏃 İşleniyor...";
    await updateStatus("Video İndiriliyor", "İçerik çekiliyor...");

    const result = await downloadVideo(reelUrl, sessionId, manualCaption, isRepost);
    const { videoPath, videoPaths, isCarousel, isImage, originalCaption, originalHashtags } = result;

    progressSteps.download = "✅ Tamamlandı";
    progressSteps.process = "🏃 İşleniyor...";
    await updateStatus("Video İşleniyor", "Metadatalar temizleniyor...");
    
    let finalPath = videoPath;
    if (!isImage) {
      let cleaned = await stripAllMetadata(videoPath, sessionId).catch(() => videoPath);
      finalPath = (process.env.ADD_VIDEO_BRANDING !== "false") ? 
        await addPromoToVideo(cleaned, sessionId, { text: author }).catch(() => cleaned) : cleaned;
    }

    const uploadPaths = isCarousel ? videoPaths : [finalPath];
    const githubUrls = [];
    for (const p of uploadPaths) {
      githubUrls.push(await uploadToGitHub(message.channel, p).catch(() => null));
    }
    const finalUrl = isCarousel ? githubUrls.filter(u => u) : githubUrls[0];
    
    progressSteps.process = "✅ Tamamlandı";
    await updateStatus("Video Hazır", "Platformlara aktarılıyor...", 0x3498db);

    let ytTitle = `${author} | Viral Content`, ytDesc = originalCaption || `Follow for more! #viral`;
    if (!isRepost && process.env.GEMINI_API_KEY && targetYouTubeAccounts.length > 0) {
      try {
        const file = await geminiService.uploadVideoForAnalysis(finalPath);
        const meta = await geminiService.generateYouTubeMetadataWithFile(originalCaption, author, originalHashtags, file);
        ytTitle = meta.title; ytDesc = meta.description;
      } catch (e) { console.error("Gemini AI error:", e.message); }
    }

    const total = targetInstagramAccounts.length + targetYouTubeAccounts.length + targetTikTokAccounts.length;
    let done = 0;

    for (const acc of targetInstagramAccounts) {
      progressSteps.upload = `📸 IG (${++done}/${total}) Yükleniyor...`;
      await updateStatus("Instagram", `${acc.name} hesabına aktarılıyor...`, 0xe1306c);
      let cap = (acc.name === "alyavibe") ? (originalCaption || "❤️✨🎀🕊️☁️") : CAPTIONS_POOL[Math.floor(Math.random() * CAPTIONS_POOL.length)];
      
      try {
        await postToInstagram(acc, finalUrl, author, originalHashtags, message.channel, originalCaption, isRepost, 3, cap, postAsStory, isImage, isCarousel);
      } catch (error) {
        progressSteps.upload = `❌ IG: ${acc.name} Hata`;
        await updateStatus("Instagram Hatası", `${acc.name}: ${error.message}`, 0xe74c3c);
        throw error;
      }
    }

    for (const acc of targetYouTubeAccounts) {
      progressSteps.upload = `🎬 YT (${++done}/${total}) Yükleniyor...`;
      await updateStatus("YouTube", `${acc.name} kanalına aktarılıyor...`, 0xff0000);
      try {
        await retryUpload(uploadToYouTube, acc, finalPath, ytTitle, ytDesc, originalHashtags, message.channel);
      } catch (error) {
        progressSteps.upload = `❌ YT: ${acc.name} Hata`;
        await updateStatus("YouTube Hatası", `${acc.name}: ${error.message}`, 0xe74c3c);
        throw error;
      }
    }

    for (const acc of targetTikTokAccounts) {
      progressSteps.upload = `🎬 TT (${++done}/${total}) Yükleniyor...`;
      await updateStatus("TikTok", `${acc.name} hesabına aktarılıyor...`, 0x25f4ee);
      try {
        await uploadToTikTok(acc, finalPath, originalCaption || "Viral Video #fyp", message.channel);
      } catch (error) {
        progressSteps.upload = `❌ TT: ${acc.name} Hata`;
        await updateStatus("TikTok Hatası", `${acc.name}: ${error.message}`, 0xe74c3c);
        throw error;
      }
    }

    progressSteps.upload = "✅ Tamamlandı";
    await updateStatus("İşlem Tamamlandı", "Tüm platformlara başarıyla yüklendi!", 0x2ecc71);

  } catch (error) {
    console.error("Process Error:", error);
    progressSteps.upload = "❌ Başarısız";
    await updateStatus("İşlem Başarısız", `Hata: ${error.message}`, 0xe74c3c);
    await logToTarget(`Hata: ${error.message}`, "error");
  } finally {
    activeSessions.delete(sessionId);
    fs.readdir(path.join(__dirname, "videos"), (err, files) => {
      if (!err) files.forEach(f => { if (f.includes(sessionId)) fs.unlink(path.join(__dirname, "videos", f), () => {}); });
    });
  }
}

async function downloadVideo(inputUrl, sessionId, manualCaption = "", isRepost = false) {
  const isTikTok = inputUrl.includes("tiktok.com");
  const isTwitter = inputUrl.includes("twitter.com") || inputUrl.includes("x.com");
  const isYouTube = inputUrl.includes("youtube.com") || inputUrl.includes("youtu.be");
  const cleanUrl = inputUrl.split('?')[0];

  const DOWNLOAD_APIS = isTwitter ? [
    { name: "Local Twitter", url: `http://localhost:3000/download?url=${encodeURIComponent(cleanUrl)}` },
    { name: "vxTwitter", url: (() => {
        const m = cleanUrl.match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/);
        return m ? `https://api.vxtwitter.com/${m[1]}/status/${m[2]}` : null;
      })()
    }
  ] : isYouTube ? [
    { name: "Local YouTube", url: `http://localhost:3000/download?url=${encodeURIComponent(cleanUrl)}` },
    { name: "Cobalt", url: `https://cobalt.nerdy.dev/api/json`, method: "POST", data: { url: cleanUrl, vCodec: "h264" } }
  ] : isTikTok ? [
    { name: "Local ViralMedia", url: `http://localhost:3000/download?url=${encodeURIComponent(cleanUrl)}&sessionId=${sessionId}` },
    { name: "TikWM", url: `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}` },
    { name: "TiklyDown", url: `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(cleanUrl)}` },
    { name: "Cobalt", url: `https://co.eepy.moe/api/json`, method: "POST", data: { url: cleanUrl, vCodec: "h264" } }
  ] : [
    { name: "Local Insta", url: `http://localhost:3000/download?url=${encodeURIComponent(cleanUrl)}&sessionId=${sessionId}` },
    { name: "Cobalt", url: `https://co.eepy.moe/api/json`, method: "POST", data: { url: cleanUrl, vCodec: "h264" } }
  ];

  let videoUrl = null, apiCaption = "", isCarousel = false, videoPaths = [], videoPath = null, isImage = false;

  for (const api of DOWNLOAD_APIS) {
    if (!api.url) continue;
    try {
      const res = await axios({ 
        url: api.url, method: api.method || "GET", data: api.data, timeout: 20000,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const data = res.data;

      // Eğer Yerel API dosyayı zaten indirdiyse (yt-dlp ile)
      if (data.videoPath && fs.existsSync(data.videoPath)) {
        console.log(`✅ ${api.name}: Dosya yerel motor tarafından zaten indirildi.`);
        videoPath = data.videoPath;
        videoPaths = [videoPath];
        videoUrl = "local_file"; // Döngüden çıkmak için
        if (data.caption) apiCaption = data.caption;
        break;
      }

      if (isTwitter) videoUrl = data.media_extended?.[0]?.url || data.result || data.url;
      else if (isTikTok) videoUrl = data.data?.play || data.play || data.url || data.result || data.data?.video?.no_watermark;
      else videoUrl = data.url || data.stream || data.data?.videoUrl || data.result;

      if (videoUrl && videoUrl.startsWith('http')) {
        const album = data.urls || data.media || data.images || data.data?.urls || data.url_list;
        if (album && Array.isArray(album) && album.length > 1) {
          isCarousel = true; isImage = true;
          console.log(`\n✅ ${api.name}: Carousel/Albüm bulundu (${album.length} parça)`);
          for (let i = 0; i < Math.min(album.length, 10); i++) {
            const cUrl = typeof album[i] === 'object' ? (album[i].url || album[i].display_url) : album[i];
            if (!cUrl) continue;
            const cPath = path.join(__dirname, 'videos', `dl_${sessionId}_${i}${cUrl.includes('.mp4') ? '.mp4' : '.jpg'}`);
            const writer = fs.createWriteStream(cPath);
            const r = await axios.get(cUrl, { responseType: 'stream' });
            r.data.pipe(writer);
            await new Promise(res => writer.on('finish', res));
            videoPaths.push(cPath);
          }
          videoPath = videoPaths[0];
        } else {
          isImage = videoUrl.match(/\.(jpg|jpeg|png|webp)/) ? true : false;
          console.log(`\n✅ ${api.name}: ${isImage ? 'Resim' : 'Video'} bulundu: ${videoUrl.substring(0, 50)}...`);
          videoPath = path.join(__dirname, 'videos', `dl_${sessionId}${isImage ? '.jpg' : '.mp4'}`);
          const writer = fs.createWriteStream(videoPath);
          const r = await axios.get(videoUrl, { responseType: 'stream', timeout: 60000 });
          r.data.pipe(writer);
          await new Promise(res => writer.on('finish', res));
          videoPaths.push(videoPath);
        }
        if (data.caption) apiCaption = data.caption;
        break;
      }
      console.log(`ℹ️ ${api.name} atlandı (Yanıt URL içermiyor)`);
    } catch (e) { 
      console.log(`ℹ️ ${api.name} hatası: ${e.message}`); 
    }
  }

  if (!videoUrl || !videoPath) throw new Error("All download APIs failed.");

  const meta = await extractVideoMetadata(cleanUrl, sessionId, apiCaption).catch(() => ({ caption: "", hashtags: [] }));
  return { 
    videoPath, videoPaths, isCarousel, isImage, 
    originalCaption: meta.caption, 
    originalHashtags: meta.hashtags, 
    isRepost 
  };
}

async function extractVideoMetadata(videoUrl, sessionId, apiCaption = "") {
  // Eğer API'den zaten bir açıklama geldiyse onu kullan
  if (apiCaption && apiCaption.length > 5) {
    return {
      caption: apiCaption,
      hashtags: apiCaption.match(/#[\w\u0590-\u05ff]+/g) || []
    };
  }

  try {
    let oembedUrl;
    if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    } else if (videoUrl.includes("tiktok.com")) {
      oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    } else {
      oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(videoUrl)}`;
    }
    const response = await axios.get(oembedUrl, { timeout: 5000 });
    if (response.data?.title) {
      return {
        caption: response.data.title,
        hashtags: response.data.title.match(/#[\w\u0590-\u05ff]+/g) || []
      };
    }
  } catch (e) {
    // console.log(`oEmbed failed: ${e.message}`);
  }
  return { caption: "", hashtags: [] };
}


async function addPromoToVideo(videoPath, sessionId, opts = {}) {
  return new Promise((resolve) => {
    let promiseResolved = false;
    let probeTimeout = null;
    let processingTimeout = null;
    let cmd = null;

    try {
      const outDir = path.join(__dirname, "videos");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const finalPath = path.join(outDir, `final_reel_${sessionId}.mp4`);
      try {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      } catch {}

      const {
        text = "Social Media", // Main text to display
        subtitle = "AI Social Media Automation", // Subtitle text
        x = 60, // Left padding from edge
        y = 80, // Top padding from edge
        appearAt = 0.5, // Start showing at 0.5s
        visibleFor = 4.0, // Show for 4 seconds
        fadeInDuration = 0.3, // Fade in over 0.3s
        fadeOutDuration = 0.3, // Fade out over 0.3s
        fontSize = 48, // Main text font size
        subtitleSize = 28, // Subtitle font size
        barWidth = 6, // Red bar width
        barColor = "red", // Bar color
        textColor = "white", // Text color
        crf = 28,
        preset = "veryfast",
      } = opts;

      // Timeout for ffprobe
      let probeCompleted = false;
      probeTimeout = setTimeout(() => {
        if (!probeCompleted && !promiseResolved) {
          promiseResolved = true;
          console.error(
            `❌ FFprobe timeout in addPromoToVideo for session ${sessionId}`,
          );
          resolve(videoPath);
        }
      }, 30000); // 30 second timeout

      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        probeCompleted = true;
        clearTimeout(probeTimeout);

        if (promiseResolved) return;

        if (err) {
          promiseResolved = true;
          console.error("ffprobe error:", err.message);
          return resolve(videoPath);
        }

        const vs = metadata.streams.find((s) => s.codec_type === "video");
        if (!vs) {
          promiseResolved = true;
          console.error("No video stream found.");
          return resolve(videoPath);
        }
        const hasAudio = metadata.streams.some((s) => s.codec_type === "audio");

        const width = vs.width;
        const height = vs.height;
        const targetW = 1080;
        const targetH = 1920;
        const aspect = width / height;
        const targetAspect = 9 / 16;

        let scaleFilter, padFilter;
        if (aspect > targetAspect) {
          const newW = targetW;
          const newH = Math.floor(targetW / aspect);
          const padTop = Math.floor((targetH - newH) / 2);
          scaleFilter = `scale=${newW}:${newH}`;
          padFilter = `pad=${targetW}:${targetH}:0:${padTop}:black`;
        } else {
          const newH = targetH;
          const newW = Math.floor(targetH * aspect);
          const padLeft = Math.floor((targetW - newW) / 2);
          scaleFilter = `scale=${newW}:${newH}`;
          padFilter = `pad=${targetW}:${targetH}:${padLeft}:0:black`;
        }

        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 3600 * 1000)
          .toISOString()
          .replace(/\.\d+Z$/, "");
        const city = { name: "Seoul, South Korea", lat: 37.5665, lng: 126.978 };

        const showStart = Math.max(0, appearAt);
        const showEnd = showStart + visibleFor;
        const fadeInEnd = showStart + fadeInDuration;
        const fadeOutStart = showEnd - fadeOutDuration;

        // Calculate alpha for fade in/out effect
        // Fade in: 0 to 1 from showStart to fadeInEnd
        // Full opacity: fadeInEnd to fadeOutStart
        // Fade out: 1 to 0 from fadeOutStart to showEnd
        const alphaExpr = `if(lt(t\\,${showStart})\\,0\\,if(lt(t\\,${fadeInEnd})\\,(t-${showStart})/${fadeInDuration}\\,if(lt(t\\,${fadeOutStart})\\,1\\,if(lt(t\\,${showEnd})\\,(${showEnd}-t)/${fadeOutDuration}\\,0))))`;

        // Find available font file (cross-platform)
        const fontPaths = [
          "/Windows/Fonts/arial.ttf", // Windows
          "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", // Linux
          "/System/Library/Fonts/Helvetica.ttc", // macOS
          "C:\\Windows\\Fonts\\arial.ttf", // Windows alternative
        ];
        const fontFile =
          fontPaths.find((p) => fs.existsSync(p)) || fontPaths[0];

        // Escape text for drawtext filter
        const escapedText = text.replace(/:/g, "\\:").replace(/'/g, "\\'");
        const escapedSubtitle = subtitle
          .replace(/:/g, "\\:")
          .replace(/'/g, "\\'");

        // Timeout for FFmpeg processing (3 minutes)
        processingTimeout = setTimeout(() => {
          if (!promiseResolved) {
            promiseResolved = true;
            console.error(
              `❌ FFmpeg timeout in addPromoToVideo for session ${sessionId}`,
            );
            try {
              if (cmd) cmd.kill("SIGKILL");
            } catch (e) {
              console.error(`Failed to kill FFmpeg: ${e.message}`);
            }
            // Clean up partial file
            if (fs.existsSync(finalPath)) {
              try {
                fs.unlinkSync(finalPath);
              } catch (e) {}
            }
            resolve(videoPath);
          }
        }, 180000); // 3 minute timeout

        cmd = ffmpeg(videoPath)
          .complexFilter([
            // Scale and pad video
            `[0:v]${scaleFilter}[scaled]`,
            `[scaled]${padFilter}[padded]`,
            // Draw red vertical bar on the left
            `[padded]drawbox=x=${x - barWidth - 15}:y=${y}:w=${barWidth}:h=${
              fontSize + subtitleSize + 20
            }:color=${barColor}:t=fill:enable='between(t\\,${showStart}\\,${showEnd})'[with_bar]`,
            // Draw main text with fade effect
            `[with_bar]drawtext=text='${escapedText}':fontfile=${fontFile}:fontsize=${fontSize}:fontcolor=${textColor}:x=${x}:y=${y}:alpha='${alphaExpr}'[with_text]`,
            // Draw subtitle with fade effect
            `[with_text]drawtext=text='${escapedSubtitle}':fontfile=${fontFile}:fontsize=${subtitleSize}:fontcolor=${textColor}:x=${x}:y=${
              y + fontSize + 10
            }:alpha='${alphaExpr}'[vout]`,
          ])
          .outputOptions([
            "-map",
            "[vout]",
            ...(hasAudio ? ["-map", "0:a?"] : ["-an"]),
            "-c:v",
            "libx264",
            "-preset",
            preset,
            "-crf",
            String(crf),
            ...(hasAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
            "-movflags",
            "+faststart",
            "-metadata",
            `title=${author} | Viral Content`,
            "-metadata",
            `comment=Reposted Content via ${author}`,
            "-metadata",
            `location=${city.name}`,
            "-metadata",
            `creation_time=${kst}`,
            "-metadata",
            `latitude=${city.lat}`,
            "-metadata",
            `longitude=${city.lng}`,
            "-metadata",
            `location-eng=${city.name}`,
            "-metadata",
            `copyright=${author}`,
          ])
          .on("stderr", (line) => {
            if (line) console.log("[ffmpeg]", line);
          })
          .on("end", () => {
            clearTimeout(processingTimeout);
            if (!promiseResolved) {
              promiseResolved = true;
              console.log(
                `✅ Netflix-style text overlay added ${showStart}s→${showEnd}s: ${finalPath}`,
              );
              resolve(finalPath);
            }
          })
          .on("error", (e) => {
            clearTimeout(processingTimeout);
            if (!promiseResolved) {
              promiseResolved = true;
              try {
                cmd.kill("SIGKILL"); // Kill FFmpeg process to prevent leak
              } catch (killError) {
                console.error(
                  "Failed to kill FFmpeg process:",
                  killError.message,
                );
              }
              // Clean up partial file
              if (fs.existsSync(finalPath)) {
                try {
                  fs.unlinkSync(finalPath);
                } catch (e) {}
              }
              console.log(
                `⚠️ Text overlay failed (${e.message}). Returning original.`,
              );
              resolve(videoPath);
            }
          });

        cmd.output(finalPath).run();
      });
    } catch (e) {
      if (probeTimeout) clearTimeout(probeTimeout);
      if (processingTimeout) clearTimeout(processingTimeout);
      if (!promiseResolved) {
        promiseResolved = true;
        console.log("⚠️ addPromoToVideo unexpected error:", e.message);
        resolve(videoPath);
      }
    }
  });
}

async function stripAllMetadata(videoPath, sessionId) {
  return new Promise((resolve) => {
    const cleanedPath = path.join(
      __dirname,
      "videos",
      `cleaned_${sessionId}.mp4`,
    );



    ffmpeg(videoPath)
      .setDuration(59)
      .outputOptions([
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "192k",
        "-map_metadata", "-1"
      ])
      .output(cleanedPath)
      .on("end", () => {

        resolve(cleanedPath);
      })
      .on("error", (err) => {
        console.error(`❌ Temizleme hatası: ${err.message}. Orijinal dosya kullanılıyor.`);
        resolve(videoPath);
      })
      .run();
  });
}

async function uploadToGitHub(channel, filePath) {
  try {
    const { Octokit } = await import("@octokit/rest");
    const octokit = new Octokit({
      auth: GITHUB_CONFIG.token,
    });

    // Create unique filename preserving the original extension
    const timestamp = Date.now();
    const ext = path.extname(filePath) || ".mp4";
    const mediaType = ext === ".jpg" || ext === ".png" ? "image" : "video";
    const fileName = `${mediaType}-${timestamp}${ext}`;
    const githubPath = `${mediaType}s/${fileName}`;

    // logToDiscord susturuldu

    // Check file size
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);

    // GitHub API limit is 100MB, but base64 encoding adds ~33% overhead
    // So practical limit is around 70MB for the original file to ensure encoded size < 100MB
    if (fileSizeMB > FILE_LIMITS.GITHUB_MAX_MB) {
      throw new Error(
        `Dosya çok büyük (${fileSizeMB.toFixed(2)}MB). GitHub API sınırı ${
          FILE_LIMITS.GITHUB_MAX_MB
        }MB'dır.`,
      );
    }

    // logToDiscord susturuldu

    // Read and encode the video file
    const fileContent = fs.readFileSync(filePath);
    const base64Content = fileContent.toString("base64");

    // logToDiscord susturuldu

    // Upload directly to repository with timeout handling
    const uploadPromise = octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_CONFIG.owner,
      repo: GITHUB_CONFIG.repo,
      path: githubPath,
      message: `Upload video: ${fileName}`,
      content: base64Content,
      branch: "main",
    });

    // Add a reasonable timeout for large files
    let uploadTimeout;
    const timeoutPromise = new Promise((_, reject) => {
      uploadTimeout = setTimeout(
        () => reject(new Error("Upload timeout after 2 minutes")),
        TIMEOUTS.GITHUB_UPLOAD,
      );
    });

    try {
      await Promise.race([uploadPromise, timeoutPromise]);
      clearTimeout(uploadTimeout);
    } catch (error) {
      clearTimeout(uploadTimeout);
      throw error;
    }

    // Generate raw GitHub URL
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/main/${githubPath}`;

    // logToDiscord susturuldu

    return rawUrl;
  } catch (error) {
    await logToDiscord(
      channel,
      `GitHub upload failed: ${error.message}`,
      "error",
    );

    // Provide more helpful error messages
    if (error.status === 500) {
      throw new Error(
        `GitHub server error (500). File may be too large or GitHub is experiencing issues. Try again later.`,
      );
    } else if (error.status === 422) {
      throw new Error(
        `GitHub rejected the upload (422). File may exceed size limits or be invalid.`,
      );
    } else if (error.message.includes("timeout")) {
      throw new Error(
        `Upload timed out. File may be too large for GitHub API.`,
      );
    }

    throw new Error(`GitHub Upload Failed: ${error.message}`);
  }
}

async function uploadToYouTube(
  account,
  videoPath,
  title,
  description,
  tags,
  channel,
) {
  let readStream = null;
  try {
    await logToDiscord(
      channel,
      `Starting YouTube upload for ${account.name}...`,
      "info",
    );

    // Validate and truncate title (YouTube limit: 100 characters) at word boundary
    title = title || "Viral Video";
    // Ensure #Shorts is in the title for better discovery
    if (!title.toLowerCase().includes("#shorts")) {
      title = title.substring(0, 92) + " #Shorts";
    }

    if (title.length > 100) {
      const truncated = title.substring(0, 97);
      const lastSpace = truncated.lastIndexOf(" ");
      title =
        (lastSpace > 80 ? truncated.substring(0, lastSpace) : truncated) +
        "...";
      console.log(`YouTube title truncated to 100 characters`);
    }

    // Validate and truncate description (YouTube limit: 5000 characters) at word boundary
    description = description || "";
    if (description.length > 5000) {
      const truncated = description.substring(0, 4997);
      const lastSpace = truncated.lastIndexOf(" ");
      description =
        (lastSpace > 4900 ? truncated.substring(0, lastSpace) : truncated) +
        "...";
      console.log(`YouTube description truncated to 5000 characters`);
    }

    // Validate tags (YouTube limits: max 500 characters total, 30 characters per tag)
    if (tags && tags.length > 0) {
      tags = tags
        .map((tag) => (tag.length > 30 ? tag.substring(0, 30) : tag))
        .filter((tag) => tag.length > 0);

      // Ensure total tags length doesn't exceed 500 characters
      let totalLength = tags.join(",").length;
      while (totalLength > 500 && tags.length > 0) {
        tags.pop();
        totalLength = tags.join(",").length;
      }
    }

    const { google } = await import("googleapis");

    // Validate YouTube credentials
    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
      throw new Error("YouTube OAuth credentials not configured in .env file");
    }

    if (!account.accessToken || !account.refreshToken) {
      throw new Error(
        `YouTube account ${account.name} missing access or refresh token`,
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI ||
        "http://localhost:3000/oauth2callback",
    );

    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    // Auto-refresh access token when it expires
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.refresh_token) {
        account.refreshToken = tokens.refresh_token;
        console.log(`🔄 New refresh token for ${account.name}`);
      }
      if (tokens.access_token) {
        account.accessToken = tokens.access_token;
        console.log(`🔄 Access token refreshed for ${account.name}`);
      }

      // Persist updated tokens to .env file
      try {
        const envUpdater = require("./helpers/env-updater");
        const result = await envUpdater.updateEnvFile(
          "YOUTUBE_ACCOUNTS",
          YOUTUBE_ACCOUNTS,
        );
        if (result.success) {
          console.log(`✅ Tokens persisted to .env for ${account.name}`);
        } else {
          console.warn(`⚠️ Could not persist tokens to .env: ${result.error}`);
        }
      } catch (persistError) {
        console.warn(`⚠️ Failed to persist tokens: ${persistError.message}`);
      }
    });

    // Force token refresh to ensure we have a valid access token
    try {
      console.log(`🔄 Requesting fresh access token for ${account.name}...`);
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      account.accessToken = credentials.access_token;
      if (credentials.refresh_token) account.refreshToken = credentials.refresh_token;
      console.log(`✅ Token refreshed successfully for ${account.name}`);
    } catch (refreshError) {
      console.error(`❌ Failed to refresh token for ${account.name}:`, refreshError.message);
      // If refresh fails, try to use existing tokens as fallback
      console.log(`⚠️ Attempting to proceed with existing tokens for ${account.name}...`);
    }

    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client,
    });

    const fileSize = fs.statSync(videoPath).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    const fileSizeGB = fileSize / (1024 * 1024 * 1024);

    // YouTube limits: 256GB for verified accounts, 128GB for unverified
    // Most users are unverified, so we'll use the conservative limit
    if (fileSizeGB > FILE_LIMITS.YOUTUBE_MAX_GB) {
      throw new Error(
        `Video file too large (${fileSizeGB.toFixed(2)}GB). YouTube limit is ${
          FILE_LIMITS.YOUTUBE_MAX_GB
        }GB for unverified accounts.`,
      );
    }

    await logToDiscord(
      channel,
      `Uploading ${fileSizeMB}MB to YouTube (${account.name})...`,
      "info",
    );

    readStream = fs.createReadStream(videoPath);

    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title,
          description: `#Shorts\n\n${description}`,
          tags: tags,
          categoryId: "17", // Sports category
        },
        status: {
          privacyStatus: "public", // or "private" or "unlisted"
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: readStream,
      },
    });

    const videoId = res.data.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    await logToDiscord(
      channel,
      `✅ Successfully uploaded to YouTube (${account.name}): ${videoUrl}`,
      "success",
    );


    return videoUrl;
  } catch (error) {
    // Provide more detailed error messages
    let errorMsg = error.message;
    let helpText = "";

    if (
      error.code === 401 ||
      error.message.includes("invalid authentication")
    ) {
      errorMsg = "Authentication failed. Access token expired or invalid.";
      helpText = "\n💡 Fix: Run 'node youtube-service.js' to regenerate tokens";
    } else if (error.code === 403) {
      errorMsg =
        "Permission denied. Check YouTube API quota or channel permissions.";
      helpText =
        "\n💡 Check: https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas";
    } else if (error.code === 400) {
      errorMsg = "Bad request. Video file may be invalid or too large.";
    } else if (error.message.includes("refresh token")) {
      errorMsg =
        "Failed to refresh access token. Refresh token may be invalid.";
      helpText = "\n💡 Fix: Run 'node youtube-service.js' to regenerate tokens";
    }

    console.error(`❌ YouTube upload error for ${account.name}:`, error);

    await logToDiscord(
      channel,
      `❌ YouTube upload failed for ${account.name}: ${errorMsg}${helpText}`,
      "error",
    );
    throw error;
  } finally {
    // Always close the read stream
    if (readStream) {
      readStream.destroy();
    }
  }
}

async function postToInstagram(
  account,
  videoUrl,
  author,
  originalHashtags,
  channel,
  originalCaption = "",
  isRepost = false,
  maxRetries = 3,
  preGeneratedCaption = null,
  postAsStory = false,
  isImage = false,
  isCarousel = false,
) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    try {
      attempt++;
      if (attempt > 1) {
        await logToDiscord(
          channel,
          `🔄 Retry attempt ${attempt}/${maxRetries} for ${account.name}`,
          "warning",
        );
        // Exponential backoff: 30s, 60s, 120s
        const backoffDelay = Math.pow(2, attempt - 1) * 30000;
        await delay(backoffDelay);
      }



      const USER_AGENTS = [
        "Instagram 219.0.0.12.117 Android (30/11; 420dpi; 1080x2158; samsung; SM-G998B; p3s; exynos2100; en_US)",
        "Instagram 187.0.0.32.120 Android (28/9; 480dpi; 1080x2076; samsung; SM-G973F; beyond1; exynos9820; en_GB)",
        "Instagram 165.1.0.29.119 Android (29/10; 480dpi; 1080x2340; OnePlus; GM1913; OnePlus7Pro; qcom; en_US)",
        "Instagram 195.0.0.31.123 Android (26/8.0.0; 480dpi; 1080x1920; Xiaomi; MI 6; sagit; qcom; en_US)",
      ];

      const API_VERSIONS = ["v22.0"];

      const userAgent =
        USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      const apiVersion =
        API_VERSIONS[Math.floor(Math.random() * API_VERSIONS.length)];

      // logToDiscord susturuldu
      if (isRepost && originalCaption) {
        // logToDiscord susturuldu
      } else if (isRepost && !originalCaption) {
        await logToDiscord(
          channel,
          `⚠️ Repost mode but no original caption found, generating new caption for ${account.name}`,
          "warning",
        );
      }
      await delay(Math.floor(Math.random() * 5000) + 3000);

      // Download for single post (size check/validation)
      let localVideoPath = null;
      if (!isCarousel) {
          const fileExt = isImage ? "jpg" : "mp4";
          localVideoPath = path.join("videos", `insta_tmp_${Date.now()}.${fileExt}`);
          let downloadSuccess = false;
          let downloadAttempts = 0;
          const maxDownloadAttempts = 3;
          while (!downloadSuccess && downloadAttempts < maxDownloadAttempts) {
        let writer = null;
        let videoResponse = null;

        try {
          downloadAttempts++;
          writer = fs.createWriteStream(localVideoPath);
          videoResponse = await axios.get(videoUrl, {
            responseType: "stream",
            timeout: 60000, // 60 second timeout
          });
          videoResponse.data.pipe(writer);

          // Add timeout for the write operation
          let writeTimeout;
          await Promise.race([
            new Promise((resolve, reject) => {
              writer.on("finish", () => {
                clearTimeout(writeTimeout);
                resolve();
              });
              writer.on("error", (err) => {
                clearTimeout(writeTimeout);
                reject(err);
              });
            }),
            new Promise((_, reject) => {
              writeTimeout = setTimeout(
                () => reject(new Error("Write timeout")),
                120000,
              );
            }),
          ]);

          downloadSuccess = true;
          // logToDiscord susturuldu
        } catch (downloadError) {
          // Clean up partial file and destroy stream
          try {
            if (writer) writer.destroy();
          } catch (e) {}
          try {
            if (videoResponse?.data) videoResponse.data.destroy();
          } catch (e) {}
          if (fs.existsSync(localVideoPath)) {
            try {
              fs.unlinkSync(localVideoPath);
            } catch (e) {}
          }
          if (downloadAttempts === maxDownloadAttempts) {
            throw new Error(
              `Failed to download video after ${maxDownloadAttempts} attempts: ${downloadError.message}`,
            );
          }
          await delay(5000); // Wait 5 seconds before retry
        }
      }
    }

      await delay(Math.floor(Math.random() * 3000) + 2000);





      let caption;
      if (isRepost && originalCaption && account.name === "alyavibe") {
        caption = originalCaption;
      } else if (preGeneratedCaption) {
        // Use pre-generated AI caption
        caption = preGeneratedCaption;
        console.log(`Using pre-generated AI caption for ${account.name}`);
      } else if (account.name === "alyavibe") {
        // alyavibe özel: Her zaman orijinal açıklamayı öncelikli kullan, yoksa emoji at
        console.log(`Using smart emoji/original caption for ${account.name}`);
        caption = originalCaption ? originalCaption : "❤️✨🎀🕊️☁️";
      } else {
        // Diğer hesaplar (Futbol/Arşiv vb.): Orijinal açıklamayı çekseler bile ASLA kullanma, havuzdan seç
        console.log(`Using a random pool caption for ${account.name}`);
        const randomCaption = CAPTIONS_POOL[Math.floor(Math.random() * CAPTIONS_POOL.length)];
        caption = randomCaption;
      }

      // Instagram caption length limit
      if (caption.length > FILE_LIMITS.INSTAGRAM_CAPTION_MAX) {
        caption =
          caption.substring(0, FILE_LIMITS.INSTAGRAM_CAPTION_MAX - 3) + "...";
        console.log(
          `⚠️ Caption truncated to ${FILE_LIMITS.INSTAGRAM_CAPTION_MAX} chars for ${account.name}`,
        );
      }




      // Create media container with retry
      let containerRes;
      let containerAttempts = 0;
      const maxContainerAttempts = 3;

      while (containerAttempts < maxContainerAttempts) {
        try {
          containerAttempts++;
          let finalCaption = caption;
          if (account.onlyEmojis) {
             finalCaption = originalCaption ? originalCaption : "❤️✨🎀🕊️☁️"; 
          }

          if (isCarousel && Array.isArray(videoUrl) && videoUrl.length > 1) {
             console.log(`🚀 [Carousel Mode] ${videoUrl.length} parça albüm olarak işleniyor...`);
             // 1. Önce her bir resmi/videoyu gizli container olarak yükle
             let childrenIds = [];
             for (let i = 0; i < videoUrl.length; i++) {
                 const isItemImage = videoUrl[i].includes(".jpg") || videoUrl[i].includes(".jpeg") || videoUrl[i].includes(".png");
                 const childParams = new URLSearchParams({
                     access_token: account.token,
                     is_carousel_item: "true"
                 });
                 
                 if (isItemImage) {
                   childParams.append("image_url", videoUrl[i]);
                 } else {
                   childParams.append("media_type", "VIDEO");
                   childParams.append("video_url", videoUrl[i]);
                 }

                 const childRes = await axios.post(
                    `https://graph.facebook.com/${apiVersion}/${account.id}/media`,
                    childParams,
                    { headers: { "User-Agent": userAgent } }
                 );
                 const childId = childRes.data.id;
                 
                 // Container'ın hazır olmasını bekle (Kesin çözüm!)
                 let isReady = false;
                 let checkAttempts = 0;
                 while (!isReady && checkAttempts < 10) {
                     checkAttempts++;
                     await delay(3000);
                     const statusRes = await axios.get(`https://graph.facebook.com/${apiVersion}/${childId}?fields=status_code&access_token=${account.token}`);
                     if (statusRes.data.status_code === 'FINISHED') {
                         isReady = true;
                     } else if (statusRes.data.status_code === 'ERROR') {
                         throw new Error(`Media container ${childId} failed: ${statusRes.data.status_info}`);
                     }
                     console.log(`   - Medya ${i+1}/${videoUrl.length} durumu: ${statusRes.data.status_code} (${checkAttempts}/10)`);
                 }
                 
                 childrenIds.push(childId);
             }

             // 2. Ana Carousel Container'ı oluştur
             console.log(`🚀 Tüm medyalar hazır. Albüm oluşturuluyor... (${childrenIds.length} parça)`);
             const containerParams = new URLSearchParams({
                 media_type: "CAROUSEL",
                 children: childrenIds.join(","),
                 caption: finalCaption,
                 access_token: account.token
             });
             
             // SADECE alyavibe hesabına özel yorum kapatma (Daha güvenli kontrol)
             const shouldDisable = (account.name && account.name.toLowerCase() === "alyavibe") || account.commentsDisabled === true || account.commentsDisabled === "true";
             if (shouldDisable) {
                console.log(`🛡️ [${account.name}] Yorum kapatma komutu albüm konteynerine ekleniyor...`);
                containerParams.append("is_commenting_disabled", "true");
             }

             containerRes = await axios.post(
                `https://graph.facebook.com/${apiVersion}/${account.id}/media`,
                containerParams,
                { headers: { "User-Agent": userAgent } }
             );

          } else {
             // NORMAL TEKLİ YÜKLEME
             const containerParams = new URLSearchParams();
             if (isImage) {
                containerParams.append("image_url", videoUrl); 
             } else {
                containerParams.append("media_type", postAsStory ? "STORIES" : "REELS");
                containerParams.append("video_url", videoUrl);
             }
             
             containerParams.append("access_token", account.token);

             if (!postAsStory) {
                containerParams.append("caption", finalCaption);
                if (!isImage) {
                   containerParams.append("share_to_feed", "true");
                }
                // SADECE alyavibe hesabına özel yorum kapatma (Daha güvenli kontrol)
                const shouldDisable = (account.name && account.name.toLowerCase() === "alyavibe") || account.commentsDisabled === true || account.commentsDisabled === "true";
                if (shouldDisable) {
                   console.log(`🛡️ [${account.name}] Yorum kapatma komutu tekli gönderiye ekleniyor...`);
                   containerParams.append("is_commenting_disabled", "true");
                }
             }

             containerRes = await axios.post(
                `https://graph.facebook.com/${apiVersion}/${account.id}/media`,
                containerParams,
                { headers: { "User-Agent": userAgent }, timeout: 30000 }
             );
          }
          break; // Success, exit loop
        } catch (containerError) {
          if (containerAttempts === maxContainerAttempts) {
            if (containerError.response?.data) {
              console.error(`❌ Instagram Container Error:`, JSON.stringify(containerError.response.data, null, 2));
            }
            throw containerError;
          }
          if (containerError.response?.status === 429) {
            await delay(60000); // Wait 1 minute for rate limit
          } else {
            await delay(10000); // Wait 10 seconds for other errors
          }
        }
      }

      const containerId = containerRes.data.id;
      console.log(`📦 [${account.name}] Container oluşturuldu (ID: ${containerId}), işleniyor...`);

      await delay(Math.floor(Math.random() * 5000) + 3000);

      let isReady = false;
      let retries = 30; // Increased from 20 to 30 for more patience
      const pollingStartTime = Date.now();
      const MAX_POLLING_TIME = 300000; // 5 minutes maximum

      while (!isReady && retries > 0) {
        // Check overall timeout
        if (Date.now() - pollingStartTime > MAX_POLLING_TIME) {
          throw new Error(`Instagram processing timeout after 5 minutes`);
        }
        try {
          const checkDelay = Math.floor(Math.random() * 8000) + 5000; // Increased delay range
          await delay(checkDelay);

          const checkStatus = await axios.get(
            `https://graph.facebook.com/${apiVersion}/${containerId}?fields=status_code&access_token=${account.token}`,
            {
              headers: {
                "User-Agent": userAgent,
                Accept: "application/json",
              },
              timeout: 15000, // 15 second timeout
            },
          );

          const statusCode = checkStatus.data.status_code;

          if (statusCode === "FINISHED") {
            isReady = true;
            console.log(`✅ [${account.name}] Medya işlendi, yayınlanmaya hazır!`);
          } else if (statusCode === "ERROR") {
            throw new Error(`Instagram processing failed with error status`);
          } else if (statusCode === "IN_PROGRESS") {
            retries--;
            const elapsed = Math.round((Date.now() - pollingStartTime) / 1000);
            console.log(`⏳ [${account.name}] İşleniyor... (${elapsed}s geçti, ${retries} deneme kaldı)`);
            if (retries % 5 === 0) {
              await logToDiscord(channel, `Still processing for ${account.name}, ${retries} attempts remaining...`, "info");
            }
          } else {
            retries--;
            console.log(`⏳ [${account.name}] Durum: ${statusCode} (${retries} deneme kaldı)`);
          }
        } catch (error) {
          if (error.response?.status === 429) {
            await logToDiscord(
              channel,
              `Rate limited for ${account.name}, waiting 45 seconds...`,
              "warning",
            );
            await delay(45000); // Longer delay for rate limits
            retries--;
          } else if (error.response?.status >= 500) {
            await logToDiscord(
              channel,
              `Instagram server error for ${account.name}, waiting before retry...`,
              "warning",
            );
            await delay(15000);
            retries--;
          } else {
            throw error;
          }
        }
      }

      if (!isReady) {
        throw new Error(
          `Media processing timeout after ${
            30 - retries
          } attempts. Instagram may be experiencing high load.`,
        );
      }

      await delay(Math.floor(Math.random() * 5000) + 5000);

      // Publish media with retry
      console.log(`🚀 [${account.name}] Yayınlanıyor...`);
      let publishResponse;
      let publishAttempts = 0;
      const maxPublishAttempts = 3;

      while (publishAttempts < maxPublishAttempts) {
        try {
          publishAttempts++;
          publishResponse = await axios.post(
            `https://graph.facebook.com/${apiVersion}/${account.id}/media_publish`,
            new URLSearchParams({
              creation_id: containerId,
              access_token: account.token,
              device_id: generateRandomDeviceId(),
              is_commenting_disabled: (account.name === "alyavibe" || account.commentsDisabled === true) ? "true" : "false"
            }),
            {
              headers: {
                "User-Agent": userAgent,
                Accept: "application/json",
                "X-Instagram-AJAX": "1",
                "X-IG-App-ID": "936619743392459",
              },
              timeout: 30000, // 30 second timeout
            },
          );
          break; // Success, exit loop
        } catch (publishError) {
          if (publishAttempts === maxPublishAttempts) {
            throw publishError;
          }
          if (publishError.response?.status === 429) {
            await delay(60000); // Wait 1 minute for rate limit
          } else {
            await delay(10000); // Wait 10 seconds for other errors
          }
        }
      }

      const mediaId = publishResponse.data.id;
      console.log(`✅ [${account.name}] Instagram'a başarıyla yayınlandı! (Media ID: ${mediaId})`);

      // Try to post comment and story, but don't fail the whole function if these fail
      /* 
      try {
        await postFirstComment(account, mediaId, channel);
      } catch (commentError) {
        await logToDiscord(
          channel,
          `⚠️ Failed to post first comment for ${account.name}: ${commentError.message}`,
          "warning",
        );
      }
      */

      await delay(Math.floor(Math.random() * 3000) + 2000);

      const mediaInfo = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${mediaId}?fields=permalink,like_count,comments_count&access_token=${account.token}`,
        {
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json",
          },
          timeout: 15000, // 15 second timeout
        },
      );

      const reelUrl = mediaInfo.data.permalink;

      // Clean up video file
      if (localVideoPath && fs.existsSync(localVideoPath)) {
        fs.unlinkSync(localVideoPath);
      }

      await logToDiscord(
        channel,
        `✅ Instagram'da başarıyla paylaşıldı: ${account.name}${
          isRepost ? " [TEKRAR PAYLAŞIM]" : ""
        }\nReel URL: ${reelUrl}`,
        "success",
      );

      return reelUrl;
    } catch (error) {
      lastError = error;

      // Clean up video file on error - use the actual path from this attempt
      const errorVideoPath = path.join(
        "videos",
        `instagram_upload_${Date.now()}_${attempt}.mp4`,
      );
      // Also try to clean up the file that was actually created
      try {
        const videosDir = path.join(__dirname, "videos");
        if (fs.existsSync(videosDir)) {
          const files = fs.readdirSync(videosDir);
          const attemptFiles = files.filter(
            (f) =>
              f.startsWith("instagram_upload_") &&
              f.includes(`_${attempt}.mp4`),
          );
          attemptFiles.forEach((f) => {
            const fullPath = path.join(videosDir, f);
            try {
              if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                console.log(`🧹 Cleaned up failed upload file: ${f}`);
              }
            } catch (e) {}
          });
        }
      } catch (e) {
        console.error(`Failed to cleanup error files: ${e.message}`);
      }

      await logToDiscord(
        channel,
        `❌ Attempt ${attempt}/${maxRetries} failed for ${account.name}: ${error.message}`,
        "error",
      );

      // Check if this is a non-retryable error
      if (isNonRetryableError(error)) {
        await logToDiscord(
          channel,
          `🚫 Non-retryable error detected for ${account.name}, stopping attempts`,
          "error",
        );
        break;
      }

      // If this was the last attempt, don't continue
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  // If we get here, all retries failed
  throw new Error(
    `Instagram Upload Failed after ${maxRetries} attempts for ${
      account.name
    }: ${
      lastError?.response?.data?.error?.message ||
      lastError?.message ||
      "Unknown error"
    }`,
  );
}

// Helper function to determine if an error should not be retried
function isNonRetryableError(error) {
  const errorMessage =
    error.response?.data?.error?.message || error.message || "";
  const statusCode = error.response?.status;
  const errorCode = error.code;

  // Don't retry on authentication/authorization errors
  if (statusCode === 401 || statusCode === 403) {
    return true;
  }

  // Don't retry on invalid media format errors
  if (
    errorMessage.toLowerCase().includes("invalid media") ||
    errorMessage.toLowerCase().includes("unsupported format") ||
    errorMessage.toLowerCase().includes("media type not supported")
  ) {
    return true;
  }

  // Don't retry on quota exceeded errors (different from rate limiting)
  if (
    errorMessage.toLowerCase().includes("quota exceeded") ||
    errorMessage.toLowerCase().includes("api limit exceeded")
  ) {
    return true;
  }

  // Don't retry on invalid token errors
  if (
    errorMessage.toLowerCase().includes("invalid access token") ||
    errorMessage.toLowerCase().includes("access token has expired")
  ) {
    return true;
  }

  // Don't retry on unrecoverable network errors
  if (
    errorCode === "ENOTFOUND" ||
    errorCode === "ECONNREFUSED" ||
    errorCode === "EHOSTUNREACH" ||
    errorCode === "ENETUNREACH"
  ) {
    return true;
  }

  return false;
}

async function uploadToTikTok(account, videoPath, caption, channel) {
  try {
    await logToDiscord(channel, `🚀 TikTok'a doğrudan paylaşım başlatılıyor: ${account.name}...`, "info");

    if (!account.token || account.token === "test_token") {
      throw new Error("TikTok Token geçersiz veya eksik! Lütfen helpers/tiktok-auth-helper.js ile token alıp .env dosyasına ekleyin.");
    }

    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;

    // 1. ADIM: Yükleme Başlatma (Init) - Sadece video.upload iznimiz olduğu için Taslak (Inbox) API'si kullanılıyor
    const initResponse = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      {
        post_info: {
          title: caption.substring(0, 100), // TikTok başlık sınırı
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_label: "COMMERCIAL_CONTENT"
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: fileSize,
          chunk_size: fileSize,
          total_chunk_count: 1
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${account.token}`,
          "Content-Type": "application/json; charset=UTF-8"
        }
      }
    );

    const uploadUrl = initResponse.data.data.upload_url;
    const publishId = initResponse.data.data.publish_id;

    // 2. ADIM: Dosyayı Yükleme (Binary Upload)
    const videoData = fs.readFileSync(videoPath);
    await axios.put(uploadUrl, videoData, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": fileSize,
        "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`
      }
    });

    await logToDiscord(
      channel,
      `✅ TikTok paylaşımı başarılı! (Hesap: ${account.name}, Publish ID: ${publishId})`,
      "success"
    );

    return true;
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error(`❌ TikTok upload error for ${account.name}:`, errorData);
    
    let userFriendlyError = "TikTok yükleme hatası.";
    if (error.response?.status === 401) userFriendlyError = "TikTok Token süresi dolmuş! Lütfen tekrar giriş yapın.";
    if (error.response?.status === 403) userFriendlyError = "TikTok Scope yetkisi yetersiz! (video.publish izni gerekiyor)";

    await logToDiscord(channel, `❌ TikTok Hatası (${account.name}): ${JSON.stringify(errorData)}`, "error");
    throw error;
  }
}

function generateRandomDeviceId() {
  // Use crypto for better randomness and avoid collisions
  const crypto = require("crypto");
  return crypto.randomBytes(8).toString("hex"); // 16 hex characters
}

// Global error handlers to prevent crashes
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Promise Rejection:", reason);
  console.error("Promise:", promise);
  // Don't exit, just log - the bot should keep running
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  console.error("Stack:", error.stack);

  // For uncaught exceptions, we should exit gracefully
  // Give cleanup 5 seconds max, then force exit
  const forceExitTimeout = setTimeout(() => {
    console.error("⚠️ Cleanup timeout, forcing exit");
    process.exit(1);
  }, 5000);

  geminiService
    .cleanup()
    .catch((err) => console.error("Cleanup error:", err))
    .finally(() => {
      clearTimeout(forceExitTimeout);
      process.exit(1);
    });
});




// Graceful shutdown handlers
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  try {
    await geminiService.cleanup();
    console.log("✅ Cleanup complete");
  } catch (error) {
    console.error("❌ Cleanup error:", error);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  try {
    await geminiService.cleanup();
    console.log("✅ Cleanup complete");
  } catch (error) {
    console.error("❌ Cleanup error:", error);
  }
  process.exit(0);
});

// --- Zamanlama Motoru (Background Worker) ---
async function checkScheduledPosts() {
  try {
    const now = Date.now();
    let schedule = JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf-8"));
    const duePosts = schedule.filter(p => p.scheduledDate <= now);
    
    if (duePosts.length === 0) return;

    console.log(`\n⏰ [Zamanlama] Zamanı gelen ${duePosts.length} görev bulundu. İşleniyor...`);
    
    for (const post of duePosts) {
      try {
        const channel = await client.channels.fetch(post.channelId);
        if (channel) {
          await logToDiscord(channel, `⏰ Zamanı gelen paylaşım başlatılıyor: ${post.reelUrl}`, "process");
          
          // Sahte bir mesaj objesi oluşturarak ana mantığı tetikliyoruz
          const fakeMessage = {
            content: `${post.reelUrl} ${post.manualCaption || ""} ${post.isRepost ? "repost" : ""}`,
            channel: channel,
            channelId: post.channelId,
            author: { bot: false, tag: "System-Scheduler" }, // Bu tag sayesinde butonlar baypas edilecek
            reply: (msg) => channel.send(msg),
            react: () => Promise.resolve()
          };
          
          console.log(`🚀 [Zamanlama] Paylaşım başlatılıyor: ${post.reelUrl}`);
          // client.emit ile ana messageCreate olayını tetikle
          client.emit("messageCreate", fakeMessage);
        }
      } catch (err) {
        console.error(`❌ Zamanlanmış görev hatası (${post.id}):`, err);
      }
    }

    // İşlenenleri listeden çıkar
    schedule = schedule.filter(p => p.scheduledDate > now);
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
  } catch (e) {
    console.error("❌ checkScheduledPosts error:", e);
  }
}

// Her dakika kontrol et
setInterval(checkScheduledPosts, 60000);

// --- TELEGRAM MESAJ DİNLEYİCİSİ ---
if (tgBot) {
  // /start veya /yardim komutu
  tgBot.command(['start', 'yardim', 'help'], (ctx) => {
    const helpText = `
🤖 *Antigravity AI Sosyal Medya Botu* 🚀

Bu bot, gönderdiğiniz video linklerini otomatik olarak işler ve Sosyal Medya hesaplarınıza yükler.

📖 *Nasıl Kullanılır?*
1️⃣ Botun ekli olduğu kanala veya bota doğrudan bir video linki atın (IG, TikTok, YouTube).
2️⃣ Bot videoyu indirir, temizler ve markalamanızı ekler.
3️⃣ Otomatik olarak hesaplarınıza yükleme yapar.

✨ *Özel Kelimeler (Linkin yanına yazın):*
📸 *story:* Videoyu Instagram Story olarak paylaşır.
🔄 *repost:* Orijinal açıklama ve etiketleri korur (AlyaVibe özel).

📥 *Örnek Kullanım:*
\`https://www.instagram.com/reel/C4... story\`
\`https://www.instagram.com/reel/C4... repost\`

📊 *Durum Takibi:*
Bot her işlem adımında size anlık bilgi mesajı gönderir. İşlem bittiğinde terminalden detaylı logları görebilirsiniz.

_Botunuz her an görev başında!_ 🎬🦾✨
    `;
    ctx.replyWithMarkdown(helpText).catch(() => {});
  });

  tgBot.on("text", async (ctx) => {
    const text = ctx.message.text;
    const chatId = ctx.message.chat.id.toString();

    // Link Analizi
    const instaRegex = /https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/g;
    const tiktokRegex = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/g;
    const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/shorts\/|youtu\.be\/)[^\s]+/g;
    
    const allMatches = [
      ...(text.match(instaRegex) || []).map(url => ({ url, type: 'instagram' })),
      ...(text.match(tiktokRegex) || []).map(url => ({ url, type: 'tiktok' })),
      ...(text.match(youtubeRegex) || []).map(url => ({ url, type: 'youtube' }))
    ];

    if (allMatches.length === 0) return;

    for (const match of allMatches) {
      const reelUrl = match.url;
      const postId = "tg" + Date.now().toString() + Math.random().toString(36).substring(7);
      
      // Geçici veriyi sakla
      pendingPosts.set(postId, {
        reelUrl,
        matchType: match.type,
        timestamp: Date.now(),
        chatId
      });

      // Ortam değişkenlerini tazele
      require("dotenv").config({ override: true });
      const currentAccounts = JSON.parse(process.env.INSTAGRAM_ACCOUNTS || "[]");
      const currentYT = JSON.parse(process.env.YOUTUBE_ACCOUNTS || "[]");
      const currentTT = JSON.parse(process.env.TIKTOK_ACCOUNTS || "[]");

      // Butonları Oluştur
      const buttons = [];
      
      // Her hesap için bir buton (Ayraç olarak | kullanıyoruz)
      currentAccounts.forEach(acc => {
        buttons.push([{ text: `📸 IG: ${acc.name}`, callback_data: `tgacc|${postId}|ig|${acc.name}` }]);
      });

      if (currentYT.length > 0) buttons.push([{ text: `🎬 YouTube: ${currentYT[0].name}`, callback_data: `tgacc|${postId}|yt|all` }]);
      if (currentTT.length > 0) buttons.push([{ text: `🎵 TikTok: ${currentTT[0].name}`, callback_data: `tgacc|${postId}|tt|all` }]);

      // Fonksiyonel Butonlar
      buttons.push([
        { text: "🌟 TÜMÜNE AT", callback_data: `tgacc|${postId}|all|all` },
        { text: "📸 STORY YAP", callback_data: `tgacc|${postId}|story|all` }
      ]);
      buttons.push([{ text: "🔄 REPOST (Orijinal Açıklama)", callback_data: `tgacc|${postId}|repost|all` }]);

      await ctx.replyWithMarkdown(`🎬 *${match.type.toUpperCase()}* videosu yakalandı!\nHangi hesaba yüklensin?`, {
        reply_markup: { inline_keyboard: buttons }
      });
    }
  });

  // Telegram Buton Tıklama İşleyicisi
  tgBot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("tgacc|")) return;

    const [_, postId, targetType, targetName] = data.split("|");
    const postData = pendingPosts.get(postId);

    if (!postData) {
      return ctx.answerCbQuery("⚠️ Veri bulunamadı veya süresi doldu.", { show_alert: true });
    }

    // Mesajı güncelle
    await ctx.editMessageText("🚀 İşlem başlatılıyor, lütfen bekleyin...").catch(() => {});

    // Ortam değişkenlerini tazele
    require("dotenv").config({ override: true });
    const allIG = JSON.parse(process.env.INSTAGRAM_ACCOUNTS || "[]");
    const allYT = JSON.parse(process.env.YOUTUBE_ACCOUNTS || "[]");
    const allTT = JSON.parse(process.env.TIKTOK_ACCOUNTS || "[]");

    let targetIG = [];
    let targetYT = [];
    let targetTT = [];
    let isRepost = targetType === "repost";
    let isStory = targetType === "story";

    if (targetType === "ig") {
      targetIG = allIG.filter(acc => acc.name === targetName);
    } else if (targetType === "yt") {
      targetYT = allYT;
    } else if (targetType === "tt") {
      targetTT = allTT;
    } else if (targetType === "all") {
      targetIG = allIG; targetYT = allYT; targetTT = allTT;
    } else if (targetType === "repost") {
      targetIG = allIG.filter(acc => acc.name === "alyavibe");
    } else if (targetType === "story") {
      targetIG = allIG;
    }

    const context = {
      sourcePlatform: "telegram",
      message: ctx,
      author: ctx.from.username || ctx.from.first_name || "Telegram User",
      channelId: postData.chatId,
      manualCaption: "",
      isRepost,
      postAsStory: isStory,
      matchType: postData.matchType,
      targetInstagramAccounts: targetIG,
      targetYouTubeAccounts: targetYT,
      targetTikTokAccounts: targetTT
    };

    handleSocialMediaProcess(postData.reelUrl, context);
    pendingPosts.delete(postId);
    ctx.answerCbQuery("🚀 Paylaşım başladı!");
  });
}

// --- Etkileşim İşleyici (Buttons & Modals) ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // 1. Buton Tıklamaları
    if (interaction.isButton()) {
      const parts = interaction.customId.split("_");
      const action = parts[1]; // postnow veya schedule
      const postId = parts[2];
      const postData = pendingPosts.get(postId);
      
      if (!postData) {
        return interaction.reply({ content: "⚠️ İşlem zaman aşımına uğradı veya veri bulunamadı. Lütfen linki tekrar atın.", ephemeral: true });
      }

      if (action === "postnow") {
        await interaction.update({ content: "🚀 Paylaşım başlatılıyor, lütfen bekleyin...", components: [] });
        
        // Ortam değişkenlerini tazele
        require("dotenv").config({ override: true });
        
        const currentChannelId = interaction.channelId;
        const currentAccounts = JSON.parse(process.env.INSTAGRAM_ACCOUNTS || "[]");
        
        // Kanal eşleşmesine göre hesapları bul
        const targetInstagramAccounts = currentAccounts.filter(acc => {
          const accReels = acc.reelsChannel || acc.reels_channel || acc.reels;
          const accStory = acc.storyChannel || acc.story_channel || acc.story;
          const accPost = acc.postChannel || acc.post_channel || acc.post;
          return accReels == currentChannelId || accStory == currentChannelId || accPost == currentChannelId || 
                 (!accReels && currentChannelId == process.env.CHANNEL_ID) ||
                 (!accStory && currentChannelId == process.env.STORY_CHANNEL_ID);
        });

        const targetYouTubeAccounts = JSON.parse(process.env.YOUTUBE_ACCOUNTS || "[]").filter(acc => 
          currentChannelId === (process.env.YOUTUBE_CHANNEL_ID || YOUTUBE_CHANNEL_ID)
        );

        const targetTikTokAccounts = JSON.parse(process.env.TIKTOK_ACCOUNTS || "[]").filter(acc => 
          acc.channelId === currentChannelId || (!acc.channelId && currentChannelId === (process.env.TIKTOK_CHANNEL_ID || TIKTOK_CHANNEL_ID))
        );

        const context = {
          sourcePlatform: "discord",
          message: interaction,
          author: postData.author || "Discord User",
          channelId: currentChannelId,
          manualCaption: postData.manualCaption,
          isRepost: postData.isRepost,
          matchType: postData.matchType,
          targetInstagramAccounts,
          targetYouTubeAccounts,
          targetTikTokAccounts
        };
        
        handleSocialMediaProcess(postData.reelUrl, context);
        pendingPosts.delete(postId);
      } 
      
      else if (action === "schedule") {
        const modal = new ModalBuilder()
          .setCustomId(`modal_schedule_${postId}`)
          .setTitle('Paylaşım Zamanla');

        const timeInput = new TextInputBuilder()
          .setCustomId('schedule_time')
          .setLabel("Saat (Örn: 20:30 veya 15.05 21:00)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("HH:mm veya DD.MM HH:mm")
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
        await interaction.showModal(modal);
      }
    }

    // 2. Modal (Form) Gönderimleri
    if (interaction.isModalSubmit()) {
      const postId = interaction.customId.split("_")[2];
      const timeStr = interaction.fields.getTextInputValue('schedule_time');
      const postData = pendingPosts.get(postId);

      if (!postData) return interaction.reply({ content: "⚠️ Veri bulunamadı.", ephemeral: true });

      // Zamanı işle (mevcut mantığı kullan)
      const fullDateMatch = timeStr.match(/\b(\d{1,2}\.\d{1,2}(?:\.\d{4})?)\s+(\d{1,2}:\d{2})\b/);
      const timeOnlyMatch = timeStr.match(/\b(\d{1,2}:\d{2})\b/);
      
      let scheduledDate = null;
      if (fullDateMatch) {
        const [day, month, year] = fullDateMatch[1].split(".").map(Number);
        const [hours, minutes] = fullDateMatch[2].split(":").map(Number);
        scheduledDate = new Date(year || new Date().getFullYear(), month - 1, day, hours, minutes, 0, 0);
      } else if (timeOnlyMatch) {
        const [hours, minutes] = timeOnlyMatch[1].split(":").map(Number);
        scheduledDate = new Date();
        scheduledDate.setHours(hours, minutes, 0, 0);
        if (scheduledDate <= new Date()) scheduledDate.setDate(scheduledDate.getDate() + 1);
      }

      if (!scheduledDate) {
        return interaction.reply({ content: "❌ Geçersiz zaman formatı! Lütfen HH:mm veya DD.MM HH:mm şeklinde girin.", ephemeral: true });
      }

      const scheduledData = {
        id: postId,
        ...postData,
        scheduledDate: scheduledDate.getTime(),
      };

      const schedule = JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf-8"));
      schedule.push(scheduledData);
      fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));

      await interaction.update({ 
        content: `✅ Paylaşım **${scheduledDate.toLocaleString('tr-TR')}** tarihine planlandı! 📅`, 
        components: [] 
      });
      pendingPosts.delete(postId);
    }
  } catch (e) {
    console.error("Interaction Error:", e);
    if (!interaction.replied) interaction.reply({ content: "❌ Bir hata oluştu.", ephemeral: true }).catch(() => {});
  }
});

client.login(DISCORD_TOKEN);

if (tgBot) {
  tgBot.launch().then(() => {
    console.log("🚀 Telegram botu başarıyla başlatıldı!");
  }).catch(err => {
    console.error("❌ Telegram botu başlatılamadı:", err.message);
  });
}
