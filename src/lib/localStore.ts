import type { Investment, InvestmentInput } from '../types'

const DEMO_KEY = 'yieldwise-demo-investments-v1'
const now = new Date()
const dateFrom = (months: number) => {
  const date = new Date(now)
  date.setMonth(date.getMonth() - months)
  return date.toISOString().slice(0, 10)
}
const demoSeed: Investment[] = [
  { id: 'demo-mmf', provider: 'Cedar Capital', name: 'Cedar Money Market Fund', type: 'MMF', principal: 15000, currency: 'USD', annualRate: 5.2, startDate: dateFrom(5), maturityDate: null, frequency: 'unknown', interestMode: 'unknown', createdAt: now.toISOString() },
  { id: 'demo-bond', provider: 'Northstar Treasury', name: '2028 Treasury Note', type: 'Bond', principal: 10000, currency: 'USD', annualRate: 6, startDate: dateFrom(8), maturityDate: new Date(new Date().setFullYear(now.getFullYear() + 2)).toISOString().slice(0, 10), frequency: 'semiannual', interestMode: 'paid_out', createdAt: now.toISOString() },
]

export function loadInvestments(): Investment[] {
  try {
    const stored = localStorage.getItem(DEMO_KEY)
    return stored ? JSON.parse(stored) as Investment[] : demoSeed
  } catch { return demoSeed }
}

function persist(items: Investment[]) { localStorage.setItem(DEMO_KEY, JSON.stringify(items)) }

export function saveInvestment(input: InvestmentInput, existingId?: string): Investment[] {
  const current = loadInvestments()
  const item: Investment = { ...input, id: existingId ?? crypto.randomUUID(), createdAt: new Date().toISOString() }
  const next = existingId ? current.map(x => x.id === existingId ? item : x) : [item, ...current]
  persist(next)
  return next
}

export function deleteInvestment(id: string): Investment[] {
  const next = loadInvestments().filter(x => x.id !== id)
  persist(next)
  return next
}
