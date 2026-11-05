import { currencyCodes } from './currency'

export type StatementFields = Partial<Record<'provider'|'name'|'type'|'principal'|'annualRate'|'startDate'|'maturityDate'|'frequency'|'currency',string>> & {currencyStatus:'detected'|'ambiguous'|'missing'}
const codes=currencyCodes.join('|')
const token=`(?:${codes}|US\\$|CA?\\$|A(?:U)?\\$|KShs?\\.?|€|£|\\$)`
const principalPattern=new RegExp(`(?:principal|amount invested|investment amount|face value)\\s*[:\\-]?\\s*(${token})?\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(${token})?(?![A-Za-z])`,'ig')
function currencyOf(token:string):string|null {
  const key=token.replaceAll('.','').toUpperCase()
  if(/^KSHS?$/.test(key))return 'KES'
  if(key==='US$')return 'USD'
  if(key==='C$'||key==='CA$')return 'CAD'
  if(key==='A$'||key==='AU$')return 'AUD'
  if(key==='€')return 'EUR'
  if(key==='£')return 'GBP'
  return currencyCodes.includes(key)?key:null
}
/** A bare dollar sign is ambiguous. Currency is always reviewable before saving. */
export function detectCurrency(source:string):Pick<StatementFields,'currency'|'currencyStatus'> {
  const nearby=[...source.matchAll(new RegExp(principalPattern))].flatMap(m=>[m[1],m[3]]).filter((v):v is string=>Boolean(v)).map(currencyOf).filter((v):v is string=>v!==null)
  const explicit=[...source.matchAll(/\b(?:currency|ccy|denomination)\s*[:=\-]?\s*([A-Z]{3})\b/ig)].map(m=>m[1].toUpperCase())
  const strong=[...new Set([...nearby,...explicit.filter(c=>currencyCodes.includes(c))])]
  if(strong.length>1||explicit.some(c=>!currencyCodes.includes(c)))return {currencyStatus:'ambiguous'}
  if(strong.length===1)return {currency:strong[0],currencyStatus:'detected'}
  const signals=[...source.matchAll(new RegExp(`(?<![A-Za-z])(${token})(?![A-Za-z])`,'ig'))].map(m=>currencyOf(m[1])).filter((v):v is string=>v!==null)
  if(/\bKenyan? shillings?\b/i.test(source))signals.push('KES')
  if(/\b(?:US|U\.S\.) dollars?\b/i.test(source))signals.push('USD')
  const unique=[...new Set(signals)]
  return unique.length===1?{currency:unique[0],currencyStatus:'detected'}:{currencyStatus:unique.length>1||source.includes('$')?'ambiguous':'missing'}
}
function parseFields(source:string):StatementFields {
  const find=(pattern:RegExp)=>source.match(pattern)?.[1]?.trim(),principal=[...source.matchAll(new RegExp(principalPattern))][0]
  const type=find(/(money market fund|\bMMF\b|bond|fixed deposit)/i)
  return {
    provider:find(/(?:provider|company|fund manager|issuer)\s*[:\-]\s*(.+?)(?=\s+(?:investment|fund|product name|security|currency|principal|amount invested|interest|yield)\s*[:\-]|$)/i),
    name:find(/(?:investment|fund|product name|security)\s*[:\-]\s*(.+?)(?=\s+(?:provider|company|currency|principal|amount invested|investment amount|face value|interest|yield)\s*[:\-]|$)/i),
    principal:principal?.[2],
    annualRate:find(/(?:annual interest rate|interest rate|yield|coupon rate)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i),
    startDate:find(/(?:start date|investment date|issue date|purchase date)\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i),
    maturityDate:find(/(?:maturity date|matures on|maturity)\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i),
    frequency:find(/(?:payment frequency|coupon frequency|distribution frequency|compounding frequency|interest credited|frequency)\s*[:\-]\s*(daily|monthly|quarterly|semi[- ]annual|semiannual|annual|at maturity)/i)
      ??find(/\b(daily|monthly|quarterly|semi[- ]annual|semiannual|at maturity)\b/i),
    type:type?(/bond/i.test(type)?'Bond':/money market|mmf/i.test(type)?'MMF':'Other'):undefined,
    ...detectCurrency(source),
  }
}
/** Pure text parser used by local PDF extraction and synthetic regression tests. */
export function parseStatementText(source:string):{fields:StatementFields;candidates:StatementFields[]} {
  const text=source.replace(/\s+/g,' ').trim(),matches=[...text.matchAll(new RegExp(principalPattern))],fields=parseFields(text)
  if(matches.length<=1)return {fields,candidates:[fields]}
  const starts=matches.map((match,index)=>{
    if(!index)return 0
    const previous=matches[index-1],gapStart=previous.index!+previous[0].length,gap=text.slice(gapStart,match.index)
    const header=gap.search(/\b(?:provider|company|fund manager|issuer|investment|product name|security|currency|ccy)\s*[:\-]/i)
    return header>=0?gapStart+header:match.index!
  })
  const candidates=starts.map((start,index)=>{
    const candidate=parseFields(text.slice(start,starts[index+1]??text.length))
    return candidate.currencyStatus==='missing'&&fields.currencyStatus==='detected'?{...candidate,currency:fields.currency,currencyStatus:'detected' as const}:candidate
  })
  return {fields,candidates}
}
