import { currencyCodes } from './currency'
import type { InvestmentType } from '../types'

export type StatementFields = Partial<Record<'provider'|'name'|'principal'|'annualRate'|'startDate'|'maturityDate'|'frequency'|'currency',string>> & {type?:InvestmentType;currencyStatus:'detected'|'ambiguous'|'missing'}
const codes=currencyCodes.join('|')
const token=`(?:${codes}|US\\$|CA?\\$|A(?:U)?\\$|KShs?\\.?|€|£|\\$)`
const principalLabel = '(?:opening principal|principal(?: amount)?|(?:total )?amount invested|investment amount|(?:total )?invested capital|invested amount|face value|par value)'
const nameLabel = '(?:investment name|fund name|product name|security name|scheme name|investment|fund|product|security|scheme)'
const typeLabel = '(?:investment type|product type|fund type|asset class|type of investment)'
const rateLabel = '(?:annual(?:i[sz]ed)? (?:interest rate|yield|return|rate)|interest rate|coupon(?: rate)?|effective annual yield|yield(?: rate)?)'
const providerLabel = '(?:provider|company|fund manager|issuer)'
const fieldLabel = [principalLabel, nameLabel, typeLabel, rateLabel, providerLabel, '(?:currency|ccy|denomination|start date|investment date|issue date|purchase date|maturity date|payment frequency|account number|statement date|closing balance|current balance|market value|interest earned)'].join('|')
const principalPattern = new RegExp('\\b'+principalLabel+'\\b\\s*(?:[:=–—]|-(?=\\s))?\\s*('+token+')?\\s*((?:\\d{1,3}(?:[, ]\\d{3})+|\\d+)(?:\\.\\d{1,2})?)\\s*('+token+')?(?![\\w,.])','ig')

function labelled(source:string,label:string):string|undefined {
  const pattern=new RegExp('\\b'+label+'\\b(?:\\s*[:=–—]\\s*|[ \\t]+-[ \\t]+|[ \\t]*\\n[ \\t]*|[ \\t]{2,})([^\\r\\n]+)','ig')
  for(const match of source.matchAll(pattern)){
    const value=match[1].split(new RegExp('[ \\t]+(?:'+fieldLabel+')\\b(?=\\s*[:=–—]|\\s+-\\s+)','i'))[0].trim()
    if(value && !new RegExp('^(?:'+fieldLabel+')\\b(?:\\s*[:=–—]|$)','i').test(value))return value
  }
}

function investmentType(value:string):StatementFields['type'] {
  if(/\b(?:money[\s-]+market(?:[\s-]+fund)?|MMF)\b/i.test(value))return 'MMF'
  if(/\b(?:treasury\s+)?bonds?\b|\b(?:T[\s-]?bond|infrastructure bond)\b/i.test(value))return 'Bond'
  if(/\b(?:fixed[\s-]+deposit|term[\s-]+deposit|treasury[\s-]+bill|T[\s-]?bill|other income investment)\b/i.test(value))return 'Other'
}

function statementRate(text:string):string|undefined {
  const rates=[...text.matchAll(new RegExp('\\b('+rateLabel+')\\b\\s*(?:\\(\\s*(?:p\\.?\\s*a\\.?|annual(?:i[sz]ed)?)\\s*\\))?\\s*[:=–—]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:%|percent\\b)','ig'))]
    .filter(match=> !/\b(?:daily|monthly|weekly|quarterly|tax|withholding|penalty|default|fee|benchmark)\s*$/i.test(text.slice(0,match.index)) &&
      !/^\s*(?:per\s+(?:day|week|month|quarter)|p\.?\s*m\.?\b|daily|monthly|weekly|quarterly)\b/i.test(text.slice(match.index+match[0].length)))
  const explicit=rates.filter(match=>/annual|coupon/i.test(match[1]))
  const values=[...new Set((explicit.length?explicit:rates).map(match=>Number(match[2].replace(',','.'))))]
  return values.length===1&&values[0]<=1000?String(values[0]):undefined
}
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
  const find=(pattern:RegExp)=>source.match(pattern)?.[1]?.trim()
  const principal=[...source.matchAll(new RegExp(principalPattern))][0]
  const heading=source.split(/\r?\n/).map(line=>line.trim()).find(line=>
    line.length<=120 && investmentType(line) && !/[:=%]|^(?:statement|account|page|type|investment type|fund type)\b/i.test(line))
  const name=labelled(source,nameLabel)??heading?.replace(/\s+(?:account\s+)?statement\s*$/i,'')
  return {
    provider:labelled(source,providerLabel),
    name,
    principal:principal?.[2].replaceAll(' ',''),
    annualRate:statementRate(source),
    startDate:find(/(?:start date|investment date|issue date|purchase date)\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i),
    maturityDate:find(/(?:maturity date|matures on|maturity)\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i),
    frequency:find(/(?:payment frequency|coupon frequency|distribution frequency|compounding frequency|interest credited|frequency)\s*[:\-]\s*(daily|monthly|quarterly|semi[- ]annual|semiannual|annual|at maturity)/i)
      ??find(/\b(daily|monthly|quarterly|semi[- ]annual|semiannual|at maturity)\b/i),
    type:investmentType(labelled(source,typeLabel)??name??''),
    ...detectCurrency(source),
  }
}
/** Pure text parser used by local PDF extraction and synthetic regression tests. */
export function parseStatementText(source:string):{fields:StatementFields;candidates:StatementFields[]} {
  const text=source.replace(/\r\n?/g,'\n').replace(/[\u00a0\u202f]/g,' ').trim(),matches=[...text.matchAll(new RegExp(principalPattern))],fields=parseFields(text)
  if(matches.length<=1)return {fields,candidates:[fields]}
  const starts=matches.map((match,index)=>{
    if(!index)return 0
    const previous=matches[index-1],gapStart=previous.index!+previous[0].length,gap=text.slice(gapStart,match.index)
    const header=gap.search(new RegExp('\\b(?:'+providerLabel+'|'+nameLabel+'|currency|ccy)\\s*[:=–—-]','i'))
    return header>=0?gapStart+header:match.index!
  })
  const candidates=starts.map((start,index)=>{
    const candidate=parseFields(text.slice(start,starts[index+1]??text.length))
    return candidate.currencyStatus==='missing'&&fields.currencyStatus==='detected'?{...candidate,currency:fields.currency,currencyStatus:'detected' as const}:candidate
  })
  return {fields,candidates}
}
