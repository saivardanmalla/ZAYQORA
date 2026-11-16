import { GoogleGenAI } from '@google/genai';

export interface GroundedSource {
  title: string;
  uri: string;
}

export interface RestaurantTrendsResult {
  query: string;
  reportMarkdown: string;
  sources: GroundedSource[];
  searchQueries: string[];
  model: string;
  generatedAt: string;
}

export class GeminiServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiServiceError('GEMINI_API_KEY is not configured in Settings > Secrets.', 400);
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchRestaurantSaasTrends(
  query: string,
  focusArea?: string
): Promise<RestaurantTrendsResult> {
  const ai = getGeminiClient();

  const focusContext = focusArea
    ? `Focus especially on: ${focusArea}.`
    : 'Cover POS & online ordering adoption, commission-free direct channels, kitchen automation (KDS), table management, and SaaS pricing/retention benchmarks.';

  const prompt = [
    'Research the latest verified restaurant SaaS and hospitality technology industry trends for an executive platform analytics report.',
    `User query: "${query}"`,
    focusContext,
    'Provide a concise, data-backed executive brief using clear headings (## Market Overview, ## Key Industry Trends, ## Benchmarks & Signals, ## Strategic Actions for Platform Tenants) and bullet points.',
  ].join('\n\n');

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a senior hospitality SaaS market intelligence analyst preparing an executive briefing for a multi-tenant restaurant SaaS platform. Cite recent, factual industry developments from search results and keep insights concise and actionable.',
          tools: [{ googleSearch: {} }],
        },
      });

      const reportMarkdown = (response.text ?? '').trim();
      if (!reportMarkdown) {
        throw new GeminiServiceError('Empty intelligence response received from Gemini Search Grounding.', 502);
      }

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const rawChunks = groundingMetadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const sources: GroundedSource[] = [];

      for (const chunk of rawChunks) {
        const web = chunk.web;
        if (web?.uri && !seenUris.has(web.uri)) {
          seenUris.add(web.uri);
          sources.push({
            title: web.title || web.uri,
            uri: web.uri,
          });
        }
      }

      const searchQueries = Array.isArray(groundingMetadata?.webSearchQueries)
        ? groundingMetadata.webSearchQueries.filter((q): q is string => typeof q === 'string' && q.length > 0)
        : [];

      return {
        query,
        reportMarkdown,
        sources,
        searchQueries,
        model: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransientRateLimit = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429');
      if (isTransientRateLimit && attempt === 0) {
        await sleep(900);
        continue;
      }
      break;
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Failed to fetch grounded restaurant SaaS trends.';
  if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED') || message.includes('403')) {
    throw new GeminiServiceError('Gemini API authorization error. Check GEMINI_API_KEY in Settings > Secrets.', 403);
  }
  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
    throw new GeminiServiceError(
      'Gemini API quota or rate limit exceeded. Wait a moment or select a billing-enabled key in Settings > Secrets.',
      429
    );
  }
  if (lastError instanceof GeminiServiceError) {
    throw lastError;
  }
  throw new GeminiServiceError(message, 502);
}
