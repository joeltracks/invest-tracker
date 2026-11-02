import type { Frequency, Investment } from '../types'

export const frequencyPeriods: Record<Frequency, number | null> = {
  daily: 365, monthly: 12, quarterly: 4, semiannual: 2, annual: 1,
  at_maturity: null, unknown: null,
}

export function effectiveDate(investment: Investment, date: Date): Date {
  if (!investment.maturityDate) return date
  const maturity = new Date(`${investment.maturityDate}T23:59:59`)
  return maturity < date ? maturity : date
}

export function dayCount(start: Date, end: Date): number {
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.max(0, Math.floor((endDay - startDay) / 86_400_000))
}

export interface Estimate {
  interest: number
  value: number
  days: number
  method: 'compound' | 'simple'
  cappedAtMaturity: boolean
}

/** ACT/365 estimate. Compound mode compounds at the selected frequency; paid-out and unknown terms use simple accrual. */
export function estimate(investment: Investment, requestedDate: Date): Estimate {
  const start = new Date(`${investment.startDate}T00:00:00`)
  const end = effectiveDate(investment, requestedDate)
  const days = dayCount(start, end)
  const rate = investment.annualRate / 100
  const periods = frequencyPeriods[investment.frequency]
  const compound = investment.interestMode === 'compound' && periods !== null
  let interest = 0
  if (compound && days > 0) {
    const total = investment.principal * Math.pow(1 + rate / periods, periods * days / 365)
    interest = total - investment.principal
  } else {
    interest = investment.principal * rate * days / 365
  }
  const retained = compound ? interest : 0
  return {
    interest,
    value: investment.principal + retained,
    days,
    method: compound ? 'compound' : 'simple',
    cappedAtMaturity: Boolean(investment.maturityDate && end.getTime() < requestedDate.getTime()),
  }
}

export function addMonths(date: Date, months: number): Date {
  const year = date.getFullYear(), month = date.getMonth() + months, day = date.getDate()
  const firstOfTarget = new Date(year, month, 1)
  const lastDay = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate()
  firstOfTarget.setDate(Math.min(day, lastDay))
  return firstOfTarget
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}

export function estimateLabel(investment: Investment): string {
  if (investment.interestMode === 'unknown' || investment.frequency === 'unknown') return 'Approximate · terms incomplete'
  if (investment.type === 'MMF') return 'Scenario · current yield held constant'
  return investment.interestMode === 'paid_out' ? 'Simple accrual · paid out' : 'Compounding scenario'
}
