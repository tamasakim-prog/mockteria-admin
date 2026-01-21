export default async function handler(req, res) {
  // --- 1. CORS設定 (ここを修正しました) ---
  
  // 許可するドメインのリスト
  const allowedOrigins = [
    'https://mockteria-app.vercel.app',       // Vercel本番
    'https://mockteria-757c7.web.app',        // Firebase本番
    'http://localhost:5173'                   // ローカル開発用
  ];

  const origin = req.headers.origin;

  // リクエスト元のURLが許可リストに含まれていれば、そのURLをセットする
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // OPTIONSメソッド（プリフライトリクエスト）への対応
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POSTメソッド以外は拒否
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text, target_lang } = req.body;
  
  // Vercelの環境変数からAPIキーを取得
  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'DeepL API Key not configured on server' });
  }

  // APIキーの種類によってエンドポイントを自動切り替え
  const isFreeKey = apiKey.endsWith(':fx');
  const deepLUrl = isFreeKey 
    ? 'https://api-free.deepl.com/v2/translate' 
    : 'https://api.deepl.com/v2/translate';

  try {
    const params = new URLSearchParams();
    params.append('auth_key', apiKey);
    params.append('target_lang', target_lang || 'EN');
    
    // 配列か単一文字列かで処理を分ける
    if (Array.isArray(text)) {
      text.forEach(t => params.append('text', t));
    } else {
      params.append('text', text);
    }

    const response = await fetch(deepLUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepL API Error: ${errorText}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}