export const reportingCurrency = 'KES'
const fallbackCurrencies = ['KES','USD','EUR','GBP','CAD','AUD','INR','ZAR','NGN','GHS','JPY','CHF','UGX','TZS','RWF','AED','CNY']
const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
export const currencyCodes = ['KES', ...new Set([...(intl.supportedValuesOf?.('currency') ?? fallbackCurrencies), ...fallbackCurrencies])].filter((c,i)=>c!=='KES'||i===0)

/** Manual quote direction: KES received for ONE unit of the source currency. */
export function kesRate(currency: string, rates: Record<string,number>): number | null {
  if(currency==='KES')return 1
  const rate=rates[currency]
  return Number.isFinite(rate)&&rate>0?rate:null
}
export function toKes(amount:number,currency:string,rates:Record<string,number>):number|null {
  const rate=kesRate(currency,rates)
  if(rate===null)return null
  const value=amount*rate
  return Number.isFinite(value)?value:null
}
export function withKesRate(rates:Record<string,number>,currency:string,rate:number):Record<string,number> {
  if(!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(rate)||rate<=0)throw Error('Enter a positive, finite conversion rate: KES for 1 unit of the investment currency.')
  return currency==='KES'?{...rates}:{...rates,[currency]:rate}
}
