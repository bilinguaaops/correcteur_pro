interface ApiRequest {
  method?: string;
  body?: any;
  query?: Record<string, any>;
  headers?: Record<string, any>;
  socket?: any;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
  send: (data: any) => void;
  end: () => void;
  setHeader: (k: string, v: string) => ApiResponse;
}
import { GoogleGenAI } from '@google/genai';

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing. Veuillez renseigner votre clé dans les variables d\'environnement Vercel.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateWithRetry(ai: GoogleGenAI, parts: any[]) {
  const models = ['gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const modelName of models) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ parts }],
          config: {
            systemInstruction:
              'Tu es un correcteur pédagogique expert, bienveillant, rigoureux et précis. Tu réponds UNIQUEMENT par un objet JSON valide, sans balises de code Markdown ni texte autour.',
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isQuotaExceeded =
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('Quota exceeded');
        const isUnavailable =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand') ||
          errMsg.includes('temporarily overloaded');

        if ((isQuotaExceeded || isUnavailable) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1200 * attempt));
          continue;
        }
        break;
      }
    }
  }
  throw lastError;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Format invalide : "messages" requis.' });
    }

    const ai = getGenAI();

    // Convert messages parts
    const parts: any[] = [];
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'image' && block.source) {
            parts.push({
              inlineData: {
                data: block.source.data,
                mimeType: block.source.media_type,
              },
            });
          } else if (block.type === 'document' && block.source) {
            parts.push({
              inlineData: {
                data: block.source.data,
                mimeType: block.source.media_type,
              },
            });
          }
        }
      }
    }

    const response = await generateWithRetry(ai, parts);
    const text = response.text || '';

    let cleanJson = text.trim();
    cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      const parsed = JSON.parse(cleanJson);
      return res.json({ result: parsed });
    } catch (parseErr) {
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({ result: parsed });
      }
      return res.json({ text: cleanJson });
    }
  } catch (error: any) {
    console.error('Vercel API error:', error);
    const errMsg = error?.message || String(error);
    const isQuota =
      errMsg.includes('429') ||
      errMsg.includes('RESOURCE_EXHAUSTED') ||
      errMsg.includes('Quota exceeded');
    const isMissingKey =
      errMsg.includes('GEMINI_API_KEY') || errMsg.includes('API key');

    if (isMissingKey) {
      return res.status(500).json({
        error:
          'Clé API Gemini non configurée dans Vercel (GEMINI_API_KEY). Veuillez vérifier vos variables d\'environnement.',
      });
    }

    if (isQuota) {
      return res.status(429).json({
        error:
          'Quota de l\'API Gemini dépassé pour ce compte. Veuillez vérifier votre plan ou attendre quelques instants.',
      });
    }

    return res.status(500).json({
      error: error.message || 'Erreur lors de la correction par l\'IA',
    });
  }
}
