# Instagram Otomatik Paylaşım Botu - Tam Kurulum Rehberi

Bu rehber, YouTube entegrasyonu ile Instagram Otomatik Paylaşım botunu kurmanızda size adım adım yol gösterecektir.

---

## 📋 Ön Koşullar

- Node.js (v16 veya üstü)
- Sisteminizde kurulu FFmpeg
- Discord hesabı ve sunucusu
- Instagram İşletme/İçerik Üretici hesabı
- Google Cloud hesabı (YouTube için)
- GitHub hesabı (video depolama için)

---

## 🚀 Hızlı Başlangıç

### 1. Bağımlılıkları Yükleyin

```bash
npm install
```

### 2. Ortam Değişkenlerini (Environment Variables) Ayarlayın

`.env.example` dosyasının adını `.env` olarak değiştirin ve kendi bilgilerinizi girin:

```bash
cp .env.example .env
```

---

## 🔧 Detaylı Kurulum Talimatları

### Discord Bot Kurulumu

1. https://discord.com/developers/applications adresine gidin.
2. "New Application" (Yeni Uygulama) butonuna tıklayın, botunuza bir isim verin ve oluşturun.
3. Soldaki menüden "Bot" sekmesine geçin ve "Add Bot" diyerek botu ekleyin.
4. "Reset Token" diyerek botunuzun **Token**'ını alın (Bu token'ı `.env` dosyasındaki `DISCORD_TOKEN` kısmına yapıştıracaksınız).
5. Aynı sayfada aşağı inip "MESSAGE CONTENT INTENT" seçeneğini aktif edin ve kaydedin.
6. Soldaki menüden "OAuth2" -> "URL Generator" sekmesine gidin.
7. "SCOPES" altından `bot` ve `applications.commands` seçeneklerini işaretleyin.
8. "BOT PERMISSIONS" altından `Read Messages/View Channels`, `Send Messages`, `Embed Links`, `Attach Files` ve `Read Message History` seçeneklerini işaretleyin.
9. Altta oluşan URL'yi kopyalayıp tarayıcınızda açın ve botu kendi Discord sunucunuza ekleyin.
10. Discord ayarlarınızdan "Geliştirici Modu"nu (Developer Mode) açın, botun çalışmasını istediğiniz kanala sağ tıklayıp "Kanal ID'sini Kopyala" deyin ve `.env` dosyasındaki `CHANNEL_ID` kısmına yapıştırın.

---

### Instagram Kurulumu

1. Meta Developer (https://developers.facebook.com/apps) üzerinden yeni bir "Business" (İşletme) uygulaması oluşturun.
2. Uygulamanıza "Instagram Basic Display" ve "Instagram Graph API" ürünlerini ekleyin.
3. Graph API Explorer aracı üzerinden uygulamanızı ve Instagram'a bağlı Facebook sayfanızı seçerek geçici bir "Access Token" (Erişim Anahtarı) oluşturun.
4. Bu geçici token'ı kullanarak 60 günlük (uzun ömürlü) bir token alın. (Bunu Tarayıcınızda şu URL ile yapabilirsiniz: `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=UYGULAMA_ID&client_secret=UYGULAMA_GIZLI_ANAHTARI&fb_exchange_token=GECICI_TOKEN`)
5. Instagram İşletme Hesabı (Business Account) ID'nizi ve kullanıcı adınızı bulun.
6. Tüm bu bilgileri `.env` dosyasındaki `INSTAGRAM_ACCOUNTS` kısmına JSON formatında ekleyin.

**Not:** Bot çalıştığında her 60 günde bir tokenlarınızı otomatik olarak güncelleyecektir. İsterseniz `npm run instagram-refresh` komutuyla bunu manuel de yapabilirsiniz.

---

### GitHub Kurulumu (Video Depolama İçin)

1. https://github.com/settings/tokens adresinden "repo" yetkisine sahip yeni bir "Personal Access Token" oluşturun.
2. Videoların yükleneceği yeni bir GitHub Reposu oluşturun (Gizli veya Açık olabilir).
3. `.env` dosyasına token, kullanıcı adı ve repo adını ekleyin (`GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`).

---

### Gemini AI Kurulumu (Yapay Zeka Açıklamaları İçin)

1. https://aistudio.google.com/app/apikey adresinden yeni bir API anahtarı (API Key) oluşturun.
2. Oluşturduğunuz anahtarı `.env` dosyasındaki `GEMINI_API_KEY` kısmına yapıştırın.

Bu sayede her video için özgün, trendlere uygun ve projenizi tanıtan benzersiz açıklamalar otomatik olarak üretilecektir.

---

### YouTube Kurulumu (İsteğe Bağlı)

1. Google Cloud Console üzerinden yeni bir proje oluşturun ve "YouTube Data API v3" hizmetini aktif edin.
2. "OAuth client ID" (Web application türünde) oluşturun.
3. Yönlendirme URL'si (Redirect URI) olarak `http://localhost:3000/oauth2callback` ekleyin.
4. Client ID ve Client Secret bilgilerinizi `.env` dosyasına girin.
5. Terminalinizde `npm run youtube-auth` komutunu çalıştırın. Bu komut tarayıcınızı açacak ve sizden YouTube hesabınızla giriş yapmanızı isteyecektir.
6. İşlem tamamlandığında terminalde size verilen token bilgilerini kopyalayıp `.env` dosyasındaki `YOUTUBE_ACCOUNTS` kısmına yapıştırın.

---

## 🏃 Botu Çalıştırma

Tüm ayarları tamamladıktan sonra botu başlatmak için:

```bash
npm start
```

**Kullanım:**
Discord'da botun bulunduğu kanala bir Instagram Reels linki atmanız yeterlidir.
Örnek: `https://instagram.com/reel/xyz`

Bot videoyu indirecek, hızlandırıp/parlaklığını artıracak, yapay zeka ile açıklama yazacak ve tüm platformlara otomatik olarak yükleyecektir.
