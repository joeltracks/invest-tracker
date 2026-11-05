import type { Frequency, Investment, InvestmentEvent } from '../types'

export const frequencyPeriods: Record<Frequency, number | null> = { daily: 365, monthly: 12, quarterly: 4, semiannual: 2, annual: 1, at_maturity: null, unknown: null }
export const dayCount = (a: Date, b: Date) => Math.max(0, Math.floor((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000))
const dateOf = (s: string) => new Date(`${s}T00:00:00`)

export interface Estimate { interest: number; value: number; principal: number; days: number; low: number; high: number; cappedAtMaturity: boolean }
/** Accrues one segment at a time, applying dated cash flows and rate changes on their event dates. ACT/365. */
export function estimate(inv: Investment, requested: Date): Estimate {
  const endLimit = inv.maturityDate ? new Date(`${inv.maturityDate}T23:59:59`) : requested
  const end = endLimit < requested ? endLimit : requested
  const start = dateOf(inv.startDate)
  if (end < start) return { interest: 0, value: inv.principal, principal: inv.principal, days: 0, low: 0, high: 0, cappedAtMaturity: false }
  const events = (inv.events ?? []).filter(e => dateOf(e.date) >= start && dateOf(e.date) <= end).sort((a,b) => a.date.localeCompare(b.date))
  let balance = inv.principal, principal = inv.principal, interest = 0, rate = inv.annualRate, cursor = start
  const periods = frequencyPeriods[inv.frequency]
  const compound = inv.interestMode === 'compound' && periods !== null
  const accrue = (until: Date) => {
    const days = dayCount(cursor, until), r = rate / 100
    const gain = compound ? balance * (Math.pow(1 + r / periods!, periods! * days / 365) - 1) : principal * r * days / 365
    interest += gain
    if (compound) balance += gain
    cursor = until
  }
  for (const event of events) {
    const when = dateOf(event.date); accrue(when)
    if (event.kind === 'deposit' && event.amount) { principal += event.amount; balance += event.amount }
    if (event.kind === 'withdrawal' && event.amount) { principal = Math.max(0, principal - event.amount); balance = Math.max(0, balance - event.amount) }
    if (event.kind === 'rate_change' && event.annualRate !== undefined) rate = event.annualRate
  }
  accrue(end)
  const simple = calculate(inv, requested, false), daily = calculate(inv, requested, true)
  const low = inv.interestMode === 'unknown' || inv.frequency === 'unknown' ? Math.min(simple, daily) : interest
  const high = inv.interestMode === 'unknown' || inv.frequency === 'unknown' ? Math.max(simple, daily) : interest
  const keptInterest = inv.interestMode === 'paid_out' ? 0 : interest
  return { interest, value: Math.max(0, principal + keptInterest), principal, days: dayCount(start, end), low, high, cappedAtMaturity: Boolean(inv.maturityDate && endLimit < requested) }
}
// Alternative boundary scenarios for incomplete terms, using the event ledger.
function calculate(inv: Investment, requested: Date, daily: boolean): number {
  const periodInv = { ...inv, frequency: daily ? 'daily' as const : 'unknown' as const, interestMode: daily ? 'compound' as const : 'paid_out' as const }
  return estimateCore(periodInv, requested)
}
function estimateCore(inv: Investment, requested: Date): number {
  const endLimit = inv.maturityDate ? new Date(`${inv.maturityDate}T23:59:59`) : requested, end = endLimit < requested ? endLimit : requested
  let cursor = dateOf(inv.startDate), principal = inv.principal, balance = principal, rate = inv.annualRate, income = 0
  const events = (inv.events ?? []).filter(e => dateOf(e.date) >= cursor && dateOf(e.date) <= end).sort((a,b)=>a.date.localeCompare(b.date))
  const accrue = (to: Date) => { const d=dayCount(cursor,to), gain=inv.frequency==='daily' ? balance*(Math.pow(1+rate/36500,d)-1) : principal*rate/100*d/365; income+=gain; if(inv.frequency==='daily') balance+=gain; cursor=to }
  events.forEach((e: InvestmentEvent)=>{accrue(dateOf(e.date)); if(e.kind==='deposit'&&e.amount){principal+=e.amount;balance+=e.amount} if(e.kind==='withdrawal'&&e.amount){principal=Math.max(0,principal-e.amount);balance=Math.max(0,balance-e.amount)} if(e.kind==='rate_change'&&e.annualRate!==undefined) rate=e.annualRate})
  accrue(end); return income
}
export function addMonths(date: Date, months: number): Date { const d=new Date(date), day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+months); d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate())); return d }
export function formatMoney(amount: number, currency: string): string { try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(amount)}catch{return `${currency} ${amount.toLocaleString(undefined,{maximumFractionDigits:2})}`} }
export function estimateLabel(inv: Investment): string { if(inv.interestMode==='unknown'||inv.frequency==='unknown')return 'Range · simple to daily-compounded'; if(inv.type==='MMF')return 'Scenario · current yield held constant'; return inv.interestMode==='paid_out'?'Simple accrual · paid out':'Compounding scenario' }
export function investmentState(inv: Investment, now=new Date()): 'Scheduled'|'Active'|'Matured'|'Closed' { if(inv.status==='closed')return 'Closed'; if(dateOf(inv.startDate)>now)return 'Scheduled'; if(inv.maturityDate && new Date(`${inv.maturityDate}T23:59:59`)<now)return 'Matured'; return 'Active' }
export function currentYield(inv: Investment, at=new Date()): number { return [...(inv.events??[])].filter(e=>e.kind==='rate_change'&&dateOf(e.date)<=at).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.annualRate??inv.annualRate }
export function nextPayout(inv: Investment, from=new Date()): Date|null {
  if(inv.status==='closed'||(inv.maturityDate&&dateOf(inv.maturityDate)<=from))return null
  if(inv.frequency==='unknown')return null
  if(inv.frequency==='at_maturity')return inv.maturityDate?dateOf(inv.maturityDate):null
  let d=dateOf(inv.startDate)
  if(inv.frequency==='daily'){d=new Date(Math.max(d.getTime(),new Date(from.getFullYear(),from.getMonth(),from.getDate()).getTime()));if(d<=from)d.setDate(d.getDate()+1)}
  else {const step=12/frequencyPeriods[inv.frequency]!;for(let i=1;d<=from&&i<100000;i++)d=addMonths(dateOf(inv.startDate),step*i)}
  if(inv.maturityDate&&d>dateOf(inv.maturityDate))return null
  return d
}
