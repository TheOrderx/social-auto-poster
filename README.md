# 🚀 MediaFlow: Instagram, TikTok & YouTube Automation Bot

[![Language](https://img.shields.io/badge/Language-JavaScript-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

*For English, please scroll down. / İngilizce için aşağı kaydırın.*

---

## 🇹🇷 Türkçe Açıklama

Bu bot, Instagram (Reels, Post, Carousel), TikTok ve YouTube (Shorts) platformları için geliştirilmiş, yapay zeka destekli profesyonel bir içerik otomasyon sistemidir. İçerik çekebilir, bunları analiz edebilir ve belirlediğiniz hesaplarda otomatik olarak paylaşabilir.

### ✨ Temel Özellikler

- **📸 Instagram Carousel (Albüm) Desteği:** 10 parçaya kadar resim ve video içeren albümleri otomatik tanır ve paylaşır.
- **🛡️ Özel Yorum Yönetimi:** Belirlenen hesaplar için paylaşımlarda yorumları otomatik olarak kapatır.
- **🎥 Gelişmiş Video İşleme:** Videoları istenilen formata otomatik sığdırır, meta verileri temizler.
- **🤖 Yapay Zeka Destekli Açıklamalar:** Google Gemini AI kullanarak videonun içeriğine göre otomatik başlık ve açıklama oluşturur.
- **🔄 Akıllı Token Yenileme:** Access Token'larını süreleri bitmeden otomatik olarak tazeler.
- **📡 Çok Kanallı API Desteği:** İçerik indirme işlemleri için çoklu kaynaklar kullanarak hata payını minimize eder.

### 🛠️ Kurulum

1. **Bağımlılıkları Yükleyin:**
   ```bash
   npm install
   ```

2. **Gereksinimler:**
   - **Node.js** (v16+)
   - **FFmpeg** (Bilgisayarınızda kurulu ve PATH'e ekli olmalı)
   - **GitHub Token** (Videoların geçici olarak barındırılması için)
   - **Facebook/Instagram App ID & Secret**

3. **API Sunucusunu Başlatın:**
   Botun içerikleri çözebilmesi için yerel API sunucusunun açık olması gerekir:
   ```bash
   node insta-api.js
   ```

4. **Botu Başlatın:**
   ```bash
   npm start
   ```

### ⚙️ Yapılandırma (.env)
`.env` dosyasını oluşturup aşağıdaki değerleri kendinize göre düzenleyin:
- `GEMINI_API_KEY`: Yapay zeka açıklamaları için Google Gemini anahtarı.
- `ADD_VIDEO_BRANDING`: `false` yapılırsa videolardaki logo/yazı ekleme işlemi iptal edilir.
- `TARGET_ACCOUNTS`: Paylaşım yapılacak hesapların detaylı konfigürasyonu.

### ⚠️ Önemli Not (Facebook App Review)
Facebook Uygulama İncelemesinde (App Review) hata almamak için:
- **Uygulama İsmi:** "Tik" veya "Tok" kelimelerini içermemelidir.
- **İzinler:** Yorum kapatma özelliği için `instagram_manage_comments` izninin Advanced Access modunda olması gerekir.

---

## 🇬🇧 English Description

This bot is an AI-powered, professional content automation system developed for Instagram (Reels, Post, Carousel), TikTok, and YouTube (Shorts) platforms. It can pull content, analyze it, and automatically publish it to your specified accounts.

### ✨ Key Features

- **📸 Instagram Carousel Support:** Automatically detects and posts carousels with up to 10 images and videos.
- **🛡️ Custom Comment Management:** Automatically turns off comments for posts on specific designated accounts.
- **🎥 Advanced Video Processing:** Automatically scales videos to proper formats and cleans metadata.
- **🤖 AI-Powered Captions:** Generates automated titles and captions based on video content using Google Gemini AI.
- **🔄 Smart Token Refresh:** Automatically refreshes Access Tokens before they expire.
- **📡 Multi-Channel API Support:** Uses multiple sources for content downloading to minimize error rates.

### 🛠️ Installation

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Requirements:**
   - **Node.js** (v16+)
   - **FFmpeg** (Must be installed on your PC and added to PATH)
   - **GitHub Token** (For temporary video hosting)
   - **Facebook/Instagram App ID & Secret**

3. **Start API Server:**
   The local API server must be running for the bot to resolve content:
   ```bash
   node insta-api.js
   ```

4. **Start the Bot:**
   ```bash
   npm start
   ```

### ⚙️ Configuration (.env)
Create an `.env` file and configure the basic settings:
- `GEMINI_API_KEY`: Google Gemini key for AI captions.
- `ADD_VIDEO_BRANDING`: If set to `false`, adding logos/text to videos is disabled.
- `TARGET_ACCOUNTS`: Detailed configuration of the accounts to be posted to.

### ⚠️ Important Note (Facebook App Review)
To avoid errors in the Facebook App Review:
- **App Name:** Must not contain the words "Tik" or "Tok".
- **Permissions:** For the comment disabling feature, the `instagram_manage_comments` permission requires Advanced Access.

---

**Happy Posting! 📸🚀🔥**
