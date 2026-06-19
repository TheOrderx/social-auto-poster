const {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
require("dotenv").config();

// Validate API key on startup
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY not found in .env file!");
  console.warn(
    "⚠️ AI caption generation will be disabled. Using fallback captions."
  );
}

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Constants
const MAX_VIDEO_PROCESSING_TIME_MS = 60000; // 60 seconds
const VIDEO_PROCESSING_CHECK_INTERVAL_MS = 2000; // 2 seconds
const MAX_VIDEO_SIZE_MB = 20; // Gemini free tier limit
const TRIM_VIDEO_DURATION = 10; // Trim to first 10 seconds for AI analysis
const RATE_LIMIT_RPM = 10; // Conservative limit
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_CAPTION_LENGTH = 500;
const API_TIMEOUT_MS = 30000; // 30 seconds

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

const INSTAGRAM_SYSTEM_PROMPT = `Sen futbol içerikleri üzerine uzmanlaşmış, yaratıcı bir sosyal medya içerik üreticisisin.
Görevin, videoyu ve orijinal açıklamayı analiz ederek etkileyici, heyecan verici ve futbolseverlerin ilgisini çekecek Türkçe açıklamalar oluşturmaktır.

KURALLAR:
1. KESİNLİKLE TÜRKÇE YAZ.
2. Reklam yapma, uygulama tanıtımı ekleme.
3. Futbol terimlerini (gol, asist, çalım, taraftar vb.) yerinde ve heyecanlı kullan.
4. Kısa ve vurucu ol (150-300 karakter).
5. Kredi formatı: "Video: @{author}"
6. Orijinal açıklamayı ve sahadaki duyguyu yansıt.`;

const YOUTUBE_SYSTEM_PROMPT = `Sen futbol videoları konusunda uzmanlaşmış profesyonel bir YouTube Shorts içerik üreticisisin.
Görevin, futbol temalı YouTube Shorts için SEO uyumlu, merak uyandırıcı başlıklar ve açıklamalar oluşturmaktır.

KURALLAR:
1. KESİNLİKLE TÜRKÇE YAZ.
2. REKLAM YAPMA.
3. Başlıklar futbolseverlerin tıklamasını sağlayacak kadar heyecanlı olmalı (100 karakter altı).
4. Açıklamada pozisyonu veya oyuncuyu özetle.
5. Kredi formatı: "Video Sahibi: @{author}"
6. İlgili hashtag'leri ekle (#shorts #futbol #gol #maç #viral).`;

class GeminiCaptionService {
  constructor() {
    this.lastRequestTime = 0;
    this.requestsThisMinute = 0;
    this.resetInterval = null;
    this.isEnabled = !!genAI;
    this.uploadedFiles = new Set(); // Track uploaded files for cleanup

    if (!this.isEnabled) {
      console.warn("⚠️ Gemini AI is disabled - API key not configured");
      return;
    }

    // Get model name from env or use default
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

    // Initialize models with system prompts
    this.instagramModel = genAI.getGenerativeModel({
      model: modelName,
      safetySettings,
      systemInstruction: INSTAGRAM_SYSTEM_PROMPT,
    });

    this.youtubeModel = genAI.getGenerativeModel({
      model: modelName,
      safetySettings,
      systemInstruction: YOUTUBE_SYSTEM_PROMPT,
    });

    // Reset counter every minute
    this.resetInterval = setInterval(() => {
      this.requestsThisMinute = 0;
    }, RATE_LIMIT_WINDOW_MS);
  }

  getYouTubeModel(isSaglamKafaAbi) {
    if (!genAI) return null;
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
    
    if (isSaglamKafaAbi) {
      const KICK_SYSTEM_PROMPT = `Sen Kick yayın kesitleri (özellikle "sağlam kafa abi" veya benzeri eğlenceli yayınlar) konusunda uzmanlaşmış profesyonel bir YouTube Shorts içerik üreticisisin.
Görevin, yayın anlarındaki komik, heyecanlı, absürt veya ilginç anları analiz edip, SEO uyumlu ve izleyici çeken başlıklar ve açıklamalar oluşturmaktır.
KURALLAR:
1. KESİNLİKLE TÜRKÇE YAZ.
2. REKLAM YAPMA.
3. Başlıklar izleyiciyi güldürecek, merak ettirecek veya hype yaratacak şekilde olmalı (100 karakter altı).
4. Açıklamada yayındaki olayı veya komik anı özetle.
5. Kredi formatı: "Video Sahibi: @{author}"
6. İlgili hashtag'leri ekle (#shorts #kick #yayın #komik #kesit #sağlamkafaabi).`;

      return genAI.getGenerativeModel({
        model: modelName,
        safetySettings,
        systemInstruction: KICK_SYSTEM_PROMPT,
      });
    }

    return this.youtubeModel;
  }

  async cleanup() {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
      this.resetInterval = null;
    }

    // Clean up any remaining uploaded files
    if (this.uploadedFiles.size > 0 && genAI) {
      console.log(
        `🧹 Cleaning up ${this.uploadedFiles.size} uploaded files...`
      );
      const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
      // Convert to array to avoid modifying Set during iteration
      const filesToDelete = Array.from(this.uploadedFiles);
      for (const fileName of filesToDelete) {
        try {
          await fileManager.deleteFile(fileName);
          this.uploadedFiles.delete(fileName);
        } catch (error) {
          console.error(`Failed to delete file ${fileName}:`, error.message);
        }
      }
    }
  }

  /**
   * Upload video once for reuse across multiple generations
   */
  async uploadVideoForAnalysis(videoPath) {
    if (!this.isEnabled) {
      throw new Error("Gemini AI is disabled - API key not configured");
    }

    let videoFile = null;
    let trimmedPath = null;
    let shouldCleanupTrimmed = false;

    try {
      // Validate input file exists
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      // Check file size first
      const stats = fs.statSync(videoPath);
      const fileSizeMB = stats.size / (1024 * 1024);

      // If video is too large, trim to first 10 seconds
      if (fileSizeMB > MAX_VIDEO_SIZE_MB) {
        console.log(
          `📹 Video too large (${fileSizeMB.toFixed(
            2
          )}MB), trimming to first ${TRIM_VIDEO_DURATION} seconds...`
        );
        trimmedPath = await this.trimVideoForAnalysis(videoPath);
        shouldCleanupTrimmed = true;

        // Validate trimmed file was created and is smaller
        if (!fs.existsSync(trimmedPath)) {
          throw new Error("Trimmed video file was not created");
        }

        const trimmedStats = fs.statSync(trimmedPath);
        const trimmedSizeMB = trimmedStats.size / (1024 * 1024);

        if (trimmedSizeMB > MAX_VIDEO_SIZE_MB) {
          throw new Error(
            `Trimmed video still too large (${trimmedSizeMB.toFixed(2)}MB)`
          );
        }

        console.log(`✅ Trimmed video size: ${trimmedSizeMB.toFixed(2)}MB`);
        videoFile = await this.uploadFileToGemini(trimmedPath);
      } else {
        videoFile = await this.uploadFileToGemini(videoPath);
      }

      this.uploadedFiles.add(videoFile.name);

      // Wait for processing
      const processedFile = await this.waitForVideoProcessing(videoFile.name);

      // Only clean up trimmed file AFTER successful processing
      if (shouldCleanupTrimmed && trimmedPath && fs.existsSync(trimmedPath)) {
        try {
          fs.unlinkSync(trimmedPath);
          console.log(`🧹 Cleaned up trimmed video`);
        } catch (e) {
          console.warn(`Warning: Could not delete trimmed video: ${e.message}`);
        }
      }

      return processedFile;
    } catch (error) {
      // Remove from tracking if upload/processing failed
      if (videoFile && videoFile.name) {
        this.uploadedFiles.delete(videoFile.name);
      }

      // Clean up trimmed file on error
      if (shouldCleanupTrimmed && trimmedPath && fs.existsSync(trimmedPath)) {
        try {
          fs.unlinkSync(trimmedPath);
          console.log(`🧹 Cleaned up trimmed video (error cleanup)`);
        } catch (e) {
          console.warn(`Warning: Could not delete trimmed video: ${e.message}`);
        }
      }

      throw error;
    }
  }

  /**
   * Clean up a specific video file
   */
  async cleanupVideoFile(fileName) {
    if (!fileName) return;

    try {
      const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
      await fileManager.deleteFile(fileName);
      console.log(`🧹 Cleaned up video file: ${fileName}`);
    } catch (error) {
      console.error(`Failed to cleanup video file ${fileName}:`, error.message);
    } finally {
      // Always remove from tracking set, even if deletion failed
      this.uploadedFiles.delete(fileName);
    }
  }

  /**
   * Generate Instagram caption using pre-uploaded video file
   */
  async generateInstagramCaptionWithFile(
    originalCaption,
    author,
    hashtags = [],
    videoFile = null,
    retries = 3
  ) {
    if (!this.isEnabled) {
      return this.getFallbackInstagramCaption(originalCaption, author);
    }

    try {
      await this.checkRateLimit();

      const prompt = `Generate a unique, engaging Instagram Reels caption.

Context:
- Original creator: @${author}
- Original caption: "${originalCaption || "No caption provided"}"
- Hashtags from original: ${hashtags.join(", ") || "None"}
- Video content: Watch the video to understand the scene, emotions, and context

Requirements:
- Analyze BOTH the video content AND the original caption for context
- If the original caption provides useful context (story, emotion, meaning), incorporate that insight
- Watch the video to see what's actually happening (dance, scene, reaction, etc.)
- Create a NEW caption that's engaging and relates to the content
- Keep it SHORT (150-300 characters max)
- Use emojis strategically (2-4 max)
- Be creative and trendy - don't just copy the original
- Credit the creator: "🎬 via @${author}"
- Add relevant hashtags at the end (max 5)

Example approach:
- If original says "This scene made me cry 😭" and video shows emotional K-drama scene
  → "When K-dramas hit different 😭 Check this out! 🎬 via @${author} #kdrama #emotional"

Generate ONLY the caption text, nothing else. No explanations, no quotes around it.`;

      let result;

      // If video file provided, use it
      if (videoFile) {
        try {
          console.log(`🎬 Generating caption with video analysis...`);

          result = await this.withTimeout(
            this.instagramModel.generateContent([
              {
                fileData: {
                  mimeType: videoFile.mimeType,
                  fileUri: videoFile.uri,
                },
              },
              { text: prompt },
            ]),
            API_TIMEOUT_MS
          );
        } catch (videoError) {
          console.warn(
            `⚠️ Video analysis failed, using text-only: ${videoError.message}`
          );
          result = await this.withTimeout(
            this.instagramModel.generateContent(prompt),
            API_TIMEOUT_MS
          );
        }
      } else {
        // Text-only generation
        result = await this.withTimeout(
          this.instagramModel.generateContent(prompt),
          API_TIMEOUT_MS
        );
      }

      let caption = result.response.text().trim();

      // Remove any markdown formatting or quotes
      caption = caption
        .replace(/```/g, "")
        .replace(/^["']|["']$/g, "")
        .trim();

      // Ensure it's not too long
      if (caption.length > MAX_CAPTION_LENGTH) {
        caption = caption.substring(0, MAX_CAPTION_LENGTH - 3) + "...";
      }

      console.log(`✨ Generated Instagram caption (${caption.length} chars)`);
      return caption;
    } catch (error) {
      console.error("Error generating Instagram caption:", error);

      if (retries > 0) {
        console.log(`Retrying... (${retries} attempts left)`);
        await this.sleep(2000);
        return this.generateInstagramCaptionWithFile(
          originalCaption,
          author,
          hashtags,
          videoFile, // Pass videoFile on retry, not videoPath
          retries - 1
        );
      }

      // Fallback to basic caption
      return this.getFallbackInstagramCaption(originalCaption, author);
    }
    // Note: No cleanup here - videoFile is managed by caller
  }

  // REMOVED: This function is deprecated - use generateYouTubeMetadataWithFile() instead

  getFallbackInstagramCaption(originalCaption, author) {
    const templates = [
      `⚽ İnanılmaz bir yetenek! Futbolun kalbi burada atıyor. 🔥\n\nVideo: @${author}\n\n#futbol #gol #mac #viral`,
      `🔥 Bu pozisyonu defalarca izledim, hala inanamıyorum! 🎬\n\nVideo: @${author}\n\n#trending #futbol #superlig`,
      `💫 Sahada büyüleyici anlar! Futbolseverler buraya. ✨\n\nVideo: @${author}\n\n#viral #gol #keşfet`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  getFallbackYouTubeDescription(originalCaption, author) {
    return `Futbol dünyasından en heyecanlı anlar! ⚽\n\nVideo Sahibi: @${author}\n\n#futbol #gol #shorts #viral #trending #maç`;
  }

  /**
   * Trim video to first N seconds for AI analysis
   */
  async trimVideoForAnalysis(videoPath) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const trimmedPath = path.join(
        path.dirname(videoPath),
        `trimmed_ai_${timestamp}.mp4`
      );

      let command = null;
      let timeoutId = null;
      let resolved = false;

      console.log(
        `✂️ Trimming video to ${TRIM_VIDEO_DURATION} seconds for AI analysis...`
      );

      // Timeout protection (2 minutes max)
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error(`❌ Video trimming timeout after 2 minutes`);

          // Kill FFmpeg process
          if (command) {
            try {
              command.kill("SIGKILL");
            } catch (e) {
              console.error(`Failed to kill FFmpeg: ${e.message}`);
            }
          }

          // Clean up partial file
          if (fs.existsSync(trimmedPath)) {
            try {
              fs.unlinkSync(trimmedPath);
            } catch (e) {}
          }

          reject(new Error("Video trimming timeout"));
        }
      }, 120000); // 2 minutes

      try {
        command = ffmpeg(videoPath)
          .setStartTime(0)
          .setDuration(TRIM_VIDEO_DURATION)
          .outputOptions([
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28", // Higher CRF for smaller file
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
          ])
          .output(trimmedPath)
          .on("end", () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);

              // Validate output file
              if (!fs.existsSync(trimmedPath)) {
                reject(new Error("Trimmed file was not created"));
                return;
              }

              const stats = fs.statSync(trimmedPath);
              if (stats.size < 1024) {
                // Less than 1KB
                try {
                  fs.unlinkSync(trimmedPath);
                } catch (e) {}
                reject(new Error("Trimmed file is too small (corrupted)"));
                return;
              }

              const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
              console.log(`✅ Trimmed video created: ${sizeMB}MB`);
              resolve(trimmedPath);
            }
          })
          .on("error", (err) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              console.error(`❌ Video trimming failed: ${err.message}`);

              // Clean up partial file
              if (fs.existsSync(trimmedPath)) {
                try {
                  fs.unlinkSync(trimmedPath);
                } catch (e) {}
              }

              reject(new Error(`Failed to trim video: ${err.message}`));
            }
          });

        command.run();
      } catch (error) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      }
    });
  }

  async checkRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Reset counter if more than a minute has passed
    if (timeSinceLastRequest >= RATE_LIMIT_WINDOW_MS) {
      this.requestsThisMinute = 0;
      this.lastRequestTime = now;
    }

    // Check rate limit
    if (this.requestsThisMinute >= RATE_LIMIT_RPM) {
      const waitTime = RATE_LIMIT_WINDOW_MS - timeSinceLastRequest;
      if (waitTime > 0) {
        console.log(
          `⏳ Gemini rate limit: Waiting ${Math.ceil(waitTime / 1000)}s...`
        );
        await this.sleep(waitTime);
        this.requestsThisMinute = 0;
        this.lastRequestTime = Date.now();
      }
    }

    this.requestsThisMinute++;
  }

  async uploadFileToGemini(filePath) {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Check file size
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);

    if (fileSizeMB > MAX_VIDEO_SIZE_MB) {
      throw new Error(
        `Video too large (${fileSizeMB.toFixed(
          2
        )}MB). Max: ${MAX_VIDEO_SIZE_MB}MB`
      );
    }

    console.log(`📤 Uploading ${fileSizeMB.toFixed(2)}MB video to Gemini...`);

    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType: "video/mp4",
      displayName: `video_${Date.now()}`,
    });

    console.log(`✅ Video uploaded: ${uploadResult.file.name}`);
    return uploadResult.file;
  }

  async waitForVideoProcessing(fileName) {
    const startTime = Date.now();
    let iterations = 0;
    const maxIterations = Math.ceil(
      MAX_VIDEO_PROCESSING_TIME_MS / VIDEO_PROCESSING_CHECK_INTERVAL_MS
    );

    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

    while (iterations < maxIterations) {
      const file = await fileManager.getFile(fileName);

      if (file.state === "ACTIVE") {
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Video processed in ${processingTime}s`);
        return file;
      }

      if (file.state === "FAILED") {
        throw new Error("Video processing failed");
      }

      if (file.state === "PROCESSING") {
        iterations++;
        await this.sleep(VIDEO_PROCESSING_CHECK_INTERVAL_MS);
        continue;
      }

      // Unknown state
      throw new Error(`Unknown file state: ${file.state}`);
    }

    throw new Error(
      `Video processing timeout after ${MAX_VIDEO_PROCESSING_TIME_MS / 1000}s`
    );
  }

  async withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate YouTube metadata using pre-uploaded video file
   */
  async generateYouTubeMetadataWithFile(
    originalCaption,
    author,
    hashtags = [],
    videoFile = null,
    isSaglamKafaAbi = false,
    retries = 3
  ) {
    if (!this.isEnabled) {
      return {
        title: `${author} | Content`,
        description: this.getFallbackYouTubeDescription(
          originalCaption,
          author
        ),
      };
    }

    try {
      await this.checkRateLimit();

      const promptContext = isSaglamKafaAbi
        ? `BAŞLIK Kuralları:
- Dikkat çekici, komik ve izleyiciyi videoya çekecek şekilde olmalı.
- Orijinal açıklamayı ve videoyu analiz ederek yayındaki absürt veya eğlenceli durumu yansıtmalı.
- 100 karakterin altında olmalı.

AÇIKLAMA Kuralları:
- İlk satır arama sonuçları için çok önemlidir.
- Videodaki (yayın kesitindeki) olayı kısaca açıkla.
- Kredi: "Video Sahibi: @${author}"
- İlgili hashtag'leri ekle (#kick #yayın #kesit #sağlamkafaabi vs.)
- 400 karakterin altında olsun.

Örnek:
- Orijinal: "Koptum amk djsdh"
- Video: Yayıncının komik bir oyuna verdiği tepki
- TITLE: Yayındaki Bu An Kriz Geçirtti! 😂
- DESCRIPTION: Sağlam Kafa Abi yayınındaki efsanevi an! Orijinal videodaki her an aşırı komik. Yayından en iyi kesitleri kaçırmayın. Video Sahibi: @${author} #kick #yayın #komik #sağlamkafaabi #shorts`

        : `BAŞLIK Kuralları:
- Dikkat çekici ve SEO uyumlu olmalı.
- Orijinal açıklamayı ve videoyu analiz ederek duyguyu (üzücü, komik, heyecanlı) yansıtmalı.
- "kpop, kdrama, viral, trend, dizi, edit" gibi anahtar kelimeler içerebilir.
- 100 karakterin altında olmalı.

AÇIKLAMA Kuralları:
- İlk satır arama sonuçları için çok önemlidir.
- Videoda ne olduğunu kısaca açıkla.
- Orijinal açıklamadaki bağlamı koru.
- Kredi: "Video Sahibi: @${author}"
- İlgili hashtag'leri ekle.
- 400 karakterin altında ve profesyonel/etkileşim odaklı olsun.

Örnek:
- Orijinal: "İnanılmaz bir gol! 😭"
- Video: Futbol maçındaki röveşata golü
- TITLE: Yılın Golü Olmaya Aday! 🔥
- DESCRIPTION: Bu gol gerçekten fizik kurallarına aykırı! Orijinal videodaki her an büyüleyici. Futbolseverler bu pozisyonu kaçırmasın. Video Sahibi: @${author} #futbol #gol #maç #keşfet`;

      const videoContext = videoFile 
        ? "- Video içeriği: Sahneyi, duyguları ve bağlamı anlamak için ekteki videoyu izle."
        : "- Video içeriği: (VİDEO DOSYASI YOK! Bu yüzden sadece Orijinal Açıklamaya ve Etiketlere bak. Metnin anafikrini bul ve tamamen ONA UYGUN mantıklı bir başlık/açıklama yaz. Kafandan alakasız bir olay veya sahne uydurma!)";

      const prompt = `YouTube Shorts için başlık (title) ve açıklama (description) oluştur.

BAĞLAM:
- Orijinal İçerik Üreticisi: @${author}
- Orijinal Açıklama: "${originalCaption || "Açıklama belirtilmemiş"}"
- Etiketler: ${hashtags.join(", ") || "Yok"}
${videoContext}

DİL KURALLARI:
- TÜM ÇIKTILAR KESİNLİKLE TÜRKÇE OLMALIDIR.
- Eğer orijinal açıklama farklı bir dildeyse, içeriği anlayıp Türkçe'ye uyarla.

Şu formatta yanıt ver:
TITLE: [başlık buraya - max 100 karakter]
DESCRIPTION: [açıklama buraya - max 400 karakter]

${promptContext}

YALNIZCA yukarıdaki formatta yanıt ver. Ekstra metin yazma.`;

      let result;
      const currentYoutubeModel = this.getYouTubeModel(isSaglamKafaAbi);

      // If video file provided, use it
      if (videoFile) {
        try {
          console.log(`🎬 Generating YouTube metadata with video analysis...`);

          result = await this.withTimeout(
            currentYoutubeModel.generateContent([
              {
                fileData: {
                  mimeType: videoFile.mimeType,
                  fileUri: videoFile.uri,
                },
              },
              { text: prompt },
            ]),
            API_TIMEOUT_MS
          );
        } catch (videoError) {
          console.warn(
            `⚠️ Video analysis failed, using text-only: ${videoError.message}`
          );
          result = await this.withTimeout(
            currentYoutubeModel.generateContent(prompt),
            API_TIMEOUT_MS
          );
        }
      } else {
        // Text-only generation
        result = await this.withTimeout(
          currentYoutubeModel.generateContent(prompt),
          API_TIMEOUT_MS
        );
      }

      let response = result.response.text().trim();

      // Parse the response
      const titleMatch = response.match(/TITLE:\s*(.+?)(?=\n|$)/i);
      const descMatch = response.match(/DESCRIPTION:\s*([\s\S]+?)(?=$)/i);

      let title =
        titleMatch?.[1]?.trim() ||
        `${author} | Futbol İçeriği`;
      let description =
        descMatch?.[1]?.trim() ||
        this.getFallbackYouTubeDescription(originalCaption, author);

      // Ensure limits
      if (title.length > 100) {
        title = title.substring(0, 97) + "...";
      }
      if (description.length > 500) {
        description = description.substring(0, 497) + "...";
      }

      console.log(`✨ Generated YouTube metadata`);
      console.log(`   Title: ${title} (${title.length} chars)`);
      console.log(`   Description: ${description.length} chars`);

      return { title, description };
    } catch (error) {
      console.error("Error generating YouTube metadata:", error);

      if (retries > 0) {
        console.log(`Retrying... (${retries} attempts left)`);
        await this.sleep(2000);
        return this.generateYouTubeMetadataWithFile(
          originalCaption,
          author,
          hashtags,
          videoFile,
          isSaglamKafaAbi,
          retries - 1
        );
      }

      return {
        title: `${author} | Futbol İçeriği`,
        description: this.getFallbackYouTubeDescription(originalCaption, author),
      };
    }
  }

  /**
   * Generates a high-quality, engaging viral Shorts script in Turkish based on a topic.
   * Designed specifically for text-to-speech generation.
   */
  async generateShortScript(topic, retries = 2) {
    if (!this.isEnabled) {
      throw new Error("Gemini AI is disabled - API key not configured");
    }

    try {
      await this.checkRateLimit();

      const systemPrompt = `Sen viral YouTube Shorts, Instagram Reels ve TikTok içerikleri üreten usta bir senaryo yazarı ve içerik üreticisisin.
Görevin, kullanıcının verdiği konuya göre 150 ile 180 kelime arasında (yaklaşık 45-50 saniye konuşma süresi), yüksek tempolu, merak uyandırıcı ve akıcı bir Türkçe seslendirme metni yazmaktır.

KURALLAR:
1. SADECE seslendirilecek metni yaz. Sahne tarifleri, [Müzik girer], (Kameraya bakar) gibi parantez içi açıklama veya yönlendirmeleri KESİNLİKLE yazma. Çünkü bu metin doğrudan seslendirme (TTS) motoruna gönderilecektir!
2. İlk 3 saniyede izleyiciyi ekrana kilitleyecek bir kanca (hook) ile başla.
3. Cümleler kısa, dinamik ve kulağa doğal gelmelidir.
4. Karmaşık kelimelerden kaçın, konuşma dilinde yaz.
5. Sonunda izleyiciyi abone olmaya veya beğenmeye davet eden akıllıca bir çağrı (call-to-action) ekle.
6. KESİNLİKLE sadece seslendirilecek metni Türkçe olarak döndür.`;

      const prompt = `Lütfen şu konu hakkında viral bir Shorts seslendirme senaryosu yaz: "${topic}"`;

      // Use the standard gemini model
      const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
      const scriptModel = genAI.getGenerativeModel({
        model: modelName,
        safetySettings,
        systemInstruction: systemPrompt,
      });

      const result = await this.withTimeout(
        scriptModel.generateContent(prompt),
        API_TIMEOUT_MS
      );

      const scriptText = result.response.text().trim();
      return scriptText;
    } catch (error) {
      console.error("Error generating Short script:", error);
      if (retries > 0) {
        await this.sleep(2000);
        return this.generateShortScript(topic, retries - 1);
      }
      throw error;
    }
  }
}

module.exports = new GeminiCaptionService();
