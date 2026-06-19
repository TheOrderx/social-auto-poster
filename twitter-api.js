const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');

async function uploadToTwitter(account, videoPath, caption, channel) {
  try {
    // 1. Initialize Twitter API client with user credentials
    const client = new TwitterApi({
      appKey: account.appKey,
      appSecret: account.appSecret,
      accessToken: account.accessToken,
      accessSecret: account.accessSecret,
    });

    // 2. Upload Media (using v1.1 endpoint via twitter-api-v2 for media upload)
    console.log(`[Twitter] Uploading media to ${account.name}...`);
    
    // Check file size limit (Twitter supports up to 512MB for video, but async upload handles chunks)
    const mediaId = await client.v1.uploadMedia(videoPath, {
      mimeType: 'video/mp4',
      target: 'tweet',
      shared: true
    });
    
    console.log(`[Twitter] Media uploaded successfully. Media ID: ${mediaId}`);

    // Wait slightly to ensure Twitter processes the video before we tweet it
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Post the Tweet (using v2 endpoint)
    console.log(`[Twitter] Posting tweet to ${account.name}...`);
    
    const tweetText = caption && caption.length > 0 ? caption.substring(0, 280) : "Viral video! #fyp";
    
    const { data: createdTweet } = await client.v2.tweet(tweetText, {
      media: { media_ids: [mediaId] }
    });

    console.log(`[Twitter] Tweet published successfully: https://x.com/user/status/${createdTweet.id}`);
    
    return `https://x.com/user/status/${createdTweet.id}`;

  } catch (error) {
    console.error(`[Twitter] Failed to upload for account ${account.name}:`, error);
    if (error.response) {
      console.error(`[Twitter] Error Details:`, JSON.stringify(error.response, null, 2));
    }
    throw new Error(`Twitter upload failed: ${error.message}`);
  }
}

module.exports = {
  uploadToTwitter
};
