/**
 * config.ts
 * Validates required environment variables at process startup and exports a
 * typed config object. The process exits with code 1 if any required variable
 * is missing — this prevents the server from starting in a misconfigured state.
 */

const requiredVars: string[] = ['MONGODB_URI', 'JWT_SECRET', 'LLM_PROVIDER'];

for (const v of requiredVars) {
  if (!process.env[v]) {
    console.error(`[startup] Missing required environment variable: ${v}`);
    process.exit(1);
  }
}

const provider = process.env.LLM_PROVIDER!;

const llmVars: Record<string, string[]> = {
  gemini: ['GEMINI_API_KEY'],
  groq:   ['GROQ_API_KEY'],
};

for (const v of llmVars[provider] ?? []) {
  if (!process.env[v]) {
    console.error(`[startup] LLM_PROVIDER=${provider} requires ${v} to be set`);
    process.exit(1);
  }
}

export const config = {
  mongoUri:         process.env.MONGODB_URI!,
  jwtSecret:        process.env.JWT_SECRET!,
  jwtExpiry:        process.env.JWT_EXPIRY ?? '24h',
  llmProvider:      provider as 'gemini' | 'groq',
  geminiApiKey:     process.env.GEMINI_API_KEY,
  geminiModel:      process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
  groqApiKey:       process.env.GROQ_API_KEY,
  groqModel:        process.env.GROQ_MODEL ?? 'llama-3.1-70b-versatile',
  researchProvider: (process.env.RESEARCH_PROVIDER ?? 'duckduckgo') as 'duckduckgo' | 'serpapi',
  serpApiKey:       process.env.SERPAPI_KEY,
  port:             Number(process.env.PORT ?? 4000),
  isProduction:     process.env.NODE_ENV === 'production',
  frontendUrl:      process.env.FRONTEND_URL ?? 'http://localhost:3000',
} as const;
