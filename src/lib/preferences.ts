export interface Preferences { baseCurrency: string; rates: Record<string, number>; monthlyGoal: number }
let scope = 'demo'
export function setPreferenceScope(value: string) { scope = value }
export const preferenceKey = () => `yieldwise-preferences-${scope}`
export const defaultPreferences: Preferences = { baseCurrency: 'USD', rates: {}, monthlyGoal: 0 }
export function loadPreferences(): Preferences {
  const raw = localStorage.getItem(preferenceKey())
  if (!raw) return { ...defaultPreferences, rates: {} }
  return validatePreferences(JSON.parse(raw))
}
export function validatePreferences(value: unknown): Preferences {
  const x = value as Preferences
  if (!x || !/^[A-Z]{3}$/.test(x.baseCurrency) || !Number.isFinite(x.monthlyGoal) || x.monthlyGoal < 0 || !x.rates || typeof x.rates !== 'object' || Array.isArray(x.rates)) throw Error('Invalid goal or currency settings.')
  for (const [currency, rate] of Object.entries(x.rates)) if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(rate) || rate <= 0) throw Error('Each exchange rate must be a positive number.')
  return { baseCurrency: x.baseCurrency, rates: { ...x.rates }, monthlyGoal: x.monthlyGoal }
}
export function savePreferences(value: Preferences) { localStorage.setItem(preferenceKey(), JSON.stringify(validatePreferences(value))) }
