const axios = require("axios");
const fs = require("fs");
const path = require("path");

/**
 * Text-to-Speech (TTS) Service
 * Converts Turkish text into a professional voiceover MP3 file.
 * Supports OpenAI TTS as premium option and falls back to a free, robust Google Translate TTS chunked endpoint.
 */

async function generateSpeech(text, outputPath) {
  try {
    // 1. Clean the text
    const cleanText = text
      .replace(/\r?\n|\r/g, " ") // Replace newlines with spaces
      .replace(/\s+/g, " ")      // Collapse multiple spaces
      .trim();

    if (!cleanText) {
      throw new Error("Text content is empty.");
    }

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 2. Premium Check: OpenAI TTS
    if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("YOUR_")) {
      console.log("🎙️ [TTS] Premium OpenAI TTS API kullanılıyor...");
      const response = await axios.post(
        "https://api.openai.com/v1/audio/speech",
        {
          model: "tts-1",
          input: cleanText,
          voice: "onyx", // Professional male voice, alternatives: alloy, echo, fable, onyx, nova, shimmer
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
          timeout: 30000,
        }
      );
      fs.writeFileSync(outputPath, response.data);
      console.log(`✅ [TTS] OpenAI TTS başarıyla üretildi: ${outputPath}`);
      return outputPath;
    }

    // 3. Fallback: Free Google Translate TTS with automatic 200-char chunking
    console.log("🎙️ [TTS] Ücretsiz Google TTS altyapısı kullanılıyor...");
    const chunks = splitTextIntoChunks(cleanText, 180);
    console.log(`🎙️ [TTS] Metin ${chunks.length} parçaya bölündü.`);

    const buffers = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=tr&client=tw-ob`;
      
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
        },
        timeout: 15000,
      });

      buffers.push(response.data);
      // Small delay between requests to avoid rate limits
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    // Concatenate all MP3 buffers and save
    const combinedBuffer = Buffer.concat(buffers);
    fs.writeFileSync(outputPath, combinedBuffer);
    console.log(`✅ [TTS] Ücretsiz Google TTS başarıyla birleştirildi ve kaydedildi: ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error("❌ [TTS] Seslendirme üretilirken hata oluştu:", error.message);
    throw error;
  }
}

/**
 * Splits text into chunks of maximum size without cutting words.
 * Google TTS limits each request to 200 characters.
 */
function splitTextIntoChunks(text, maxSize = 180) {
  const words = text.split(" ");
  const chunks = [];
  let currentChunk = "";

  for (const word of words) {
    if ((currentChunk + " " + word).length > maxSize) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = word;
    } else {
      currentChunk += (currentChunk ? " " : "") + word;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

module.exports = {
  generateSpeech,
};
