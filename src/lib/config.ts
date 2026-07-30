export interface Config {
  api_key: string;
  organization: string;
  base_url: string;
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (cached) return cached;
  const apiKey = process.env.H8_API_KEY;
  if (!apiKey) {
    throw new Error("H8_API_KEY environment variable is not set. Get an API key from https://console.hamravesh.com");
  }
  cached = {
    api_key: apiKey,
    organization: process.env.H8_ORGANIZATION ?? "",
    base_url: "https://api.hamravesh.com",
  };
  return cached;
}
