export type InvestmentType = 'MMF' | 'Bond' | 'Other'
export type InterestMode = 'compound' | 'paid_out' | 'unknown'
export type Frequency = 'daily' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'at_maturity' | 'unknown'

export interface Investment {
  id: string
  provider: string
  name: string
  type: InvestmentType
  principal: number
  currency: string
  annualRate: number
  startDate: string
  maturityDate: string | null
  frequency: Frequency
  interestMode: InterestMode
  createdAt: string
}

export type InvestmentInput = Omit<Investment, 'id' | 'createdAt'>
