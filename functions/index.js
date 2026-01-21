const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });

admin.initializeApp();

// Secret Managerの設定
const deeplApiKey = defineSecret("DEEPL_API_KEY");

// DeepL API URL (Free版の場合は -free をつける、Pro版は外す)
// あなたのキーには :fx がなかったので、Pro版(-freeなし)にしています
const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate";

exports.translate = functions
  .runWith({ 
    secrets: [deeplApiKey], // APIキーを使う設定
  })
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      // POSTメソッド以外は拒否
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      try {
        const { text, target_lang } = req.body;
        const authKey = deeplApiKey.value(); // キーの中身を取り出す

        if (!authKey) {
          throw new Error("DeepL API Key is not configured.");
        }

        // DeepLへリクエスト (新しいヘッダー認証方式)
        const response = await axios.post(
          DEEPL_API_URL,
          {
            text: text,
            target_lang: target_lang.toUpperCase(),
          },
          {
            headers: {
              "Authorization": `DeepL-Auth-Key ${authKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        res.status(200).json(response.data);

      } catch (error) {
        console.error("Translation Error:", error.response?.data || error.message);
        res.status(500).json({ 
          error: "Translation failed", 
          details: error.response?.data || error.message 
        });
      }
    });
  });