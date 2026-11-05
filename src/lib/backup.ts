import type { Investment } from '../types'
import { validatePreferences, type Preferences } from './preferences'
export interface Backup { format: 'yieldwise'; version: 1; exportedAt: string; investments: Investment[]; preferences: Preferences }
const date = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s
const number = (x: unknown, min = 0, max = 1e15): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max
export function parseBackup(text: string): Backup {
  const x = JSON.parse(text) as Backup
  if (x?.format !== 'yieldwise' || x.version !== 1 || !Array.isArray(x.investments) || x.investments.length > 10000) throw Error('Choose a Yieldwise version 1 JSON export with at most 10,000 investments.')
  const ids = new Set<string>()
  for (const i of x.investments) {
    if (!i || typeof i.id !== 'string' || !i.id || ids.has(i.id) || typeof i.name !== 'string' || !i.name.trim() || typeof i.provider !== 'string' || !i.provider.trim() || i.name.length > 300 || i.provider.length > 300 || !['MMF','Bond','Other'].includes(i.type) || !number(i.principal, 0.01) || !/^[A-Z]{3}$/.test(i.currency) || !number(i.annualRate, 0, 1000) || !date(i.startDate) || (i.maturityDate !== null && (!date(i.maturityDate) || i.maturityDate < i.startDate)) || !['daily','monthly','quarterly','semiannual','annual','at_maturity','unknown'].includes(i.frequency) || !['compound','paid_out','unknown'].includes(i.interestMode) || !['gross','net'].includes(i.yieldBasis) || !number(i.taxRate, 0, 100) || !['active','closed'].includes(i.status) || (i.statementValue !== null && !number(i.statementValue)) || !Array.isArray(i.events) || i.events.length > 10000 || !Array.isArray(i.couponMonths) || !i.couponMonths.every(m => Number.isInteger(m) && m >= 1 && m <= 12) || typeof i.createdAt !== 'string' || Number.isNaN(Date.parse(i.createdAt))) throw Error('The backup contains an invalid investment. Nothing was imported.')
    ids.add(i.id)
    const eventIds = new Set<string>()
    let principal = i.principal
    for (const e of [...i.events].sort((a,b) => a.date.localeCompare(b.date))) {
      if (!e || typeof e.id !== 'string' || !e.id || eventIds.has(e.id) || !date(e.date) || e.date < i.startDate || (i.maturityDate && e.date > i.maturityDate) || !['deposit','withdrawal','rate_change'].includes(e.kind) || (e.kind === 'rate_change' ? !number(e.annualRate, 0, 1000) : !number(e.amount, 0.01))) throw Error('Invalid dated ledger event. Nothing was imported.')
      eventIds.add(e.id)
      if (e.kind === 'deposit') principal += e.amount!
      if (e.kind === 'withdrawal') { principal -= e.amount!; if (principal < 0) throw Error('A backup withdrawal exceeds principal at its date.') }
    }
  }
  return { format: 'yieldwise', version: 1, exportedAt: x.exportedAt, investments: x.investments.map(i=>({id:i.id,name:i.name,provider:i.provider,type:i.type,principal:i.principal,currency:i.currency,annualRate:i.annualRate,startDate:i.startDate,maturityDate:i.maturityDate,frequency:i.frequency,interestMode:i.interestMode,createdAt:i.createdAt,status:i.status,yieldBasis:i.yieldBasis,taxRate:i.taxRate,statementValue:i.statementValue,couponMonths:i.couponMonths,events:i.events.map(e=>({id:e.id,date:e.date,kind:e.kind,...(e.kind==="rate_change"?{annualRate:e.annualRate}:{amount:e.amount})}))})), preferences: validatePreferences(x.preferences) }
}
export function downloadBackup(investments: Investment[], preferences: Preferences) {
  const blob = new Blob([JSON.stringify({ format:'yieldwise',version:1,exportedAt:new Date().toISOString(),investments,preferences }, null, 2)], { type:'application/json' })
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = `yieldwise-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
