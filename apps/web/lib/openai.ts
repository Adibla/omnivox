import OpenAI from "openai";
import { getEnv } from "./env";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient() {
  if (openaiClient) {
    return openaiClient;
  }
  const env = getEnv();
  openaiClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    defaultHeaders: {
      [env.OPENAI_ZDR_HEADER]: env.OPENAI_ZDR_VALUE,
    },
  });
  return openaiClient;
}
