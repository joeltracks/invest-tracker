import { dateKey } from './calculations'
import type { Investment, InvestmentEvent, InvestmentInput } from '../types'
let storageKey='yieldwise-demo-investments-v1'
export function setStorageScope(userId: string | null) { storageKey = userId ? `yieldwise-investments-${userId}` : 'yieldwise-demo-investments-v1' }
export function clearPortfolio() { localStorage.removeItem(storageKey) }
export function replaceInvestments(items: Investment[]) { persist(items); return items }
const defaults={events:[],yieldBasis:'gross' as const,taxRate:0,status:'active' as const,statementValue:null,couponMonths:[]}
function normalize(raw: Investment[]): Investment[] { return raw.map(x=>({...defaults,...x,events:x.events??[],yieldBasis:x.yieldBasis??'gross',taxRate:x.taxRate??0,status:x.status??'active',statementValue:x.statementValue??null,couponMonths:x.couponMonths??[]})) }
// Remove only untouched built-in records saved by earlier versions in the local/demo scope.
// Custom entries, reconciled records and samples with recorded events are preserved.
function isLegacySample(item:Investment):boolean {
  if(item.events.length||item.statementValue!==null||item.status!=='active'||item.yieldBasis!=='gross'||item.taxRate!==0)return false
  const created=new Date(item.createdAt)
  if(!Number.isFinite(created.getTime()))return false
  const originalDate=(value:string|null,monthsAgo:number,yearsAhead=0)=>{
    const date=new Date(created);date.setMonth(date.getMonth()-monthsAgo);date.setFullYear(date.getFullYear()+yearsAhead)
    return value===dateKey(date)||value===date.toISOString().slice(0,10)
  }
  const mmf=item.id==='demo-mmf'&&item.provider==='Cedar Capital'&&item.name==='Cedar Money Market Fund'&&item.annualRate===5.2
    &&item.type==='MMF'&&item.frequency==='unknown'&&item.interestMode==='unknown'&&item.maturityDate===null&&item.couponMonths.length===0&&originalDate(item.startDate,5)
  const bond=item.id==='demo-bond'&&item.provider==='Northstar Treasury'&&item.name==='2028 Treasury Note'&&item.annualRate===6
    &&item.type==='Bond'&&item.frequency==='semiannual'&&item.interestMode==='paid_out'&&item.couponMonths.join(',')==='6,12'&&originalDate(item.startDate,8)&&originalDate(item.maturityDate,0,2)
  return (mmf&&((item.currency==='USD'&&item.principal===15000)||(item.currency==='KES'&&item.principal===150000)))
    ||(bond&&((item.currency==='USD'&&item.principal===10000)||(item.currency==='KES'&&item.principal===100000)))
}
export function loadInvestments():Investment[]{
  const raw=localStorage.getItem(storageKey)
  if(!raw)return []
  const items=normalize(JSON.parse(raw) as Investment[])
  if(storageKey!=='yieldwise-demo-investments-v1')return items
  const next=items.filter(item=>!isLegacySample(item))
  if(next.length!==items.length)persist(next)
  return next
}
/** Read the pre-profile workspace without switching the currently selected profile. */
export function readBrowserInvestments():Investment[]{
  const raw=localStorage.getItem('yieldwise-demo-investments-v1')
  return raw?normalize(JSON.parse(raw) as Investment[]).filter(item=>!isLegacySample(item)):[]
}
function persist(items:Investment[]){localStorage.setItem(storageKey,JSON.stringify(items))}
export function saveInvestment(input:InvestmentInput,existingId?:string):Investment[]{const current=loadInvestments(),old=current.find(x=>x.id===existingId);if(old&&input.maturityDate&&old.events.some(e=>e.date>input.maturityDate!))throw Error('Maturity cannot precede a recorded event.');const item:Investment={...input,currency:old?.currency??input.currency,startDate:old?.startDate??input.startDate,principal:old?.principal??input.principal,annualRate:old?.annualRate??input.annualRate,events:old?.events??[],status:old?.status??'active',id:existingId??crypto.randomUUID(),createdAt:old?.createdAt??new Date().toISOString()};const next=existingId?current.map(x=>x.id===existingId?item:x):[item,...current];persist(next);return next}
export function deleteInvestment(id:string):Investment[]{const next=loadInvestments().filter(x=>x.id!==id);persist(next);return next}
export function restoreInvestment(item:Investment):Investment[]{const next=[item,...loadInvestments().filter(x=>x.id!==item.id)];persist(next);return next}
export function appendEvent(id:string,event:InvestmentEvent):Investment[]{const items=loadInvestments(),item=items.find(x=>x.id===id);if(!item)throw Error('Investment not found.');if(item.status==='closed')throw Error('Reopen the investment before recording events.');if(!/^\d{4}-\d{2}-\d{2}$/.test(event.date)||Number.isNaN(Date.parse(event.date))||new Date(event.date+'T12:00:00Z').toISOString().slice(0,10)!==event.date)throw Error('Enter a valid event date.');if(event.date<item.startDate||(item.maturityDate&&event.date>item.maturityDate))throw Error('Event date must fall between investment start and maturity.');const n=event.kind==='rate_change'?event.annualRate:event.amount;if(!Number.isFinite(n)||(n as number)<(event.kind==='rate_change'?0:0.01)||(n as number)>1e15||(event.kind==='rate_change'&&(n as number)>1000))throw Error('Enter a valid amount or yield.');let p=item.principal;for(const e of [...item.events,event].sort((a,b)=>a.date.localeCompare(b.date))){if(e.kind==='deposit')p+=e.amount??0;if(e.kind==='withdrawal'){p-=e.amount??0;if(p<0)throw Error('Withdrawal exceeds the principal available at that date or makes a later withdrawal invalid.')}}const next=items.map(x=>x.id===id?{...x,events:[...x.events,event]}:x);persist(next);return next}
export function setInvestmentStatus(id:string,status:Investment['status']):Investment[]{const next=loadInvestments().map(x=>x.id===id?{...x,status}:x);persist(next);return next}

