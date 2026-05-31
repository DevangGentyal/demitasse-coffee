export async function parseJsonOrFallback(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    const text = await response.text().catch(() => '<unreadable response>')
    const contentType = response.headers?.get?.('content-type') || '<unknown>'
    const short = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 500) : String(text)
    return {
      success: false,
      message: `Invalid JSON response (status ${response.status}; content-type: ${contentType}): ${short}`,
      rawText: text,
    }
  }
}