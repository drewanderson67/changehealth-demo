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
