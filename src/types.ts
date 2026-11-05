export type InvestmentType = 'MMF' | 'Bond' | 'Other'
export type InterestMode = 'compound' | 'paid_out' | 'unknown'
export type Frequency = 'daily' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'at_maturity' | 'unknown'
export type EventKind = 'deposit' | 'withdrawal' | 'rate_change'
export interface InvestmentEvent { id: string; date: string; kind: EventKind; amount?: number; annualRate?: number; note?: string }
export interface Investment {
  id: string; provider: string; name: string; type: InvestmentType; principal: number; currency: string
  annualRate: number; startDate: string; maturityDate: string | null; frequency: Frequency; interestMode: InterestMode
  createdAt: string; events: InvestmentEvent[]; yieldBasis: 'gross' | 'net'; taxRate: number
  status: 'active' | 'closed'; statementValue: number | null; couponMonths: number[]
}
export type InvestmentInput = Omit<Investment, 'id' | 'createdAt' | 'events' | 'status'>

