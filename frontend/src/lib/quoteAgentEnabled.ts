/** Local-only. True only for 1/true/yes. Unset or any other value stays false (prod-like). */
function parseEnvFlag(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export const quoteAgentEnabled = parseEnvFlag(
  (import.meta.env as Record<string, string | boolean | undefined>).VITE_QUOTE_AGENT_ENABLED
)
