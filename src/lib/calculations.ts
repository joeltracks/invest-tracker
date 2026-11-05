import type { Frequency, Investment, InvestmentEvent } from '../types'

export const frequencyPeriods: Record<Frequency, number | null> = { daily: 365, monthly: 12, quarterly: 4, semiannual: 2, annual: 1, at_maturity: null, unknown: null }
export const dayCount = (a: Date, b: Date) => Math.max(0, Math.floor((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000))
const dateOf = (s: string) => new Date(`${s}T00:00:00`)
export const dateKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
export const hasUnknownTerms = (inv: Pick<Investment, 'interestMode'|'frequency'>): boolean => inv.interestMode === 'unknown' || (inv.interestMode === 'compound' && inv.frequency === 'unknown')
export const taxFactor = (inv: Investment): number => inv.yieldBasis === 'gross' ? 1-inv.taxRate/100 : 1

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
  const low = hasUnknownTerms(inv) ? Math.min(simple, daily) : interest
  const high = hasUnknownTerms(inv) ? Math.max(simple, daily) : interest
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
export function estimateLabel(inv: Investment): string { if(hasUnknownTerms(inv))return 'Range · simple to daily-compounded'; if(inv.interestMode==='paid_out')return 'Simple accrual · paid out'; if(inv.frequency==='at_maturity')return 'Simple accrual · retained until maturity'; return 'Compounding scenario' }
export function investmentState(inv: Investment, now=new Date()): 'Scheduled'|'Active'|'Matured'|'Closed' { if(inv.status==='closed')return 'Closed'; if(dateOf(inv.startDate)>now)return 'Scheduled'; if(inv.maturityDate && new Date(`${inv.maturityDate}T23:59:59`)<now)return 'Matured'; return 'Active' }
export function currentYield(inv: Investment, at=new Date()): number { return [...(inv.events??[])].filter(e=>e.kind==='rate_change'&&dateOf(e.date)<=at).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.annualRate??inv.annualRate }
/** Tax is a display adjustment to cumulative gross income, not withholding inside compounding. */
export function netValue(inv: Investment, at: Date): number {
  const e=estimate(inv,at)
  return e.principal+(e.value-e.principal)*taxFactor(inv)
}
export function valueRange(inv: Investment, at: Date): {low:number;high:number} {
  const e=estimate(inv,at),factor=taxFactor(inv)
  if(inv.interestMode==='paid_out')return {low:e.principal,high:e.principal}
  return {low:e.principal+e.low*factor,high:e.principal+e.high*factor}
}
export function incomeRange(inv: Investment, from: Date, to: Date): {low:number;high:number} {
  const a=estimate(inv,from),b=estimate(inv,to),factor=taxFactor(inv)
  return {low:Math.max(0,b.low-a.low)*factor,high:Math.max(0,b.high-a.high)*factor}
}

const dayAfter=(date:Date)=>{const next=new Date(date);next.setDate(next.getDate()+1);return next}
/** Calendar dates only. No cash payout is inferred for unknown or periodically reinvested terms. */
function payoutDates(inv:Investment, from:Date, to:Date):Date[] {
  if(inv.status==='closed'||inv.interestMode==='unknown'||inv.frequency==='unknown'||(inv.interestMode==='compound'&&inv.frequency!=='at_maturity'))return []
  const start=dateOf(inv.startDate),lower=dateOf(dateKey(from)),upper=dateOf(dateKey(to)),maturity=inv.maturityDate?dateOf(inv.maturityDate):null
  if(upper<lower||upper<=start||(maturity&&maturity<lower))return []
  if(inv.frequency==='at_maturity')return maturity&&maturity>=lower&&maturity<=upper?[maturity]:[]
  const dates:Date[]=[]
  if(inv.frequency==='daily') {
    for(let d=new Date(Math.max(dayAfter(start).getTime(),lower.getTime()));d<=upper&&(!maturity||d<=maturity);d=dayAfter(d))dates.push(d)
  } else {
    const step=12/frequencyPeriods[inv.frequency]!
    if(inv.couponMonths.length) {
      // Statements may identify coupon months but not a day. Approximate the day from start date.
      for(let year=lower.getFullYear();year<=upper.getFullYear();year++)for(const month of new Set(inv.couponMonths)) {
        const d=new Date(year,month-1,Math.min(start.getDate(),new Date(year,month,0).getDate()))
        if(d>start&&d>=lower&&d<=upper&&(!maturity||d<=maturity))dates.push(d)
      }
    } else {
      const elapsed=(lower.getFullYear()-start.getFullYear())*12+lower.getMonth()-start.getMonth()
      for(let index=Math.max(1,Math.floor(elapsed/step));;index++) {
        const d=addMonths(start,index*step)
        if(d>upper||(maturity&&d>maturity))break
        if(d>=lower)dates.push(d)
      }
    }
    // Assume remaining accrued interest is settled at maturity, including a short final period.
    if(maturity&&maturity>start&&maturity>=lower&&maturity<=upper)dates.push(maturity)
  }
  return [...new Map(dates.map(d=>[dateKey(d),d])).values()].sort((a,b)=>a.getTime()-b.getTime())
}
export function nextPayout(inv:Investment,from=new Date()):Date|null {
  const start=dateOf(inv.startDate),searchFrom=start>from?start:from
  const end=addMonths(searchFrom,13)
  // Annual schedules have at least one boundary within 13 months. At maturity may be further away.
  if(inv.frequency==='at_maturity'&&inv.maturityDate)end.setTime(dateOf(inv.maturityDate).getTime())
  return payoutDates(inv,searchFrom,end)[0]??null
}
export interface ScheduledPayout {date:Date;amount:number}
export function scheduledPayouts(inv:Investment,from:Date,to:Date):ScheduledPayout[] {
  return payoutDates(inv,from,to).map(date=>{
    let previous=dateOf(inv.startDate)
    if(inv.frequency==='daily'){previous=new Date(date);previous.setDate(previous.getDate()-1)}
    else if(inv.frequency!=='at_maturity') {
      const lookback=addMonths(date,-13),prior=payoutDates(inv,lookback,date).filter(d=>d<date).at(-1)
      if(prior)previous=prior
    }
    const amount=Math.max(0,estimate(inv,date).interest-estimate(inv,previous).interest)*taxFactor(inv)
    return {date,amount}
  })
}
