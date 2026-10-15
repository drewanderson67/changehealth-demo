export async function readErrorBody(response: Response): Promise<{ message?: string; statusCode?: number; details?: unknown; _optumApiRequest?: unknown }> {
  const text = await response.text().catch(() => '');
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return { message: `HTTP ${response.status}: ${text.slice(0, 200)}`, statusCode: response.status };
    }
  }
  return {
    message: `Backend unreachable or returned an empty response (HTTP ${response.status}). Check that the backend server is running.`,
    statusCode: response.status
  };
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

async function isBackendUnavailable(response: Response): Promise<boolean> {
  if ([502, 503, 504].includes(response.status)) return true;
  if (response.status !== 500) return false;
  const body = await response.clone().text().catch(() => '');
  return body === '';
}

// Retries while the backend is down or restarting (network error, or the dev proxy's empty 500).
// Only use for requests that are safe to repeat.
export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, init);
      if (attempt >= RETRY_DELAYS_MS.length || !(await isBackendUnavailable(response))) return response;
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}
