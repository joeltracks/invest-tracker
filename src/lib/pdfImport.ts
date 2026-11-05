export type ParsedStatement = {
  text: string
  fields: Partial<Record<'provider' | 'name' | 'type' | 'principal' | 'annualRate' | 'startDate' | 'maturityDate' | 'frequency', string>>
  candidates: Partial<Record<'provider' | 'name' | 'type' | 'principal' | 'annualRate' | 'startDate' | 'maturityDate' | 'frequency', string>>[]
}

/** Extracts selectable PDF text in the browser. No file bytes leave this device. */
export async function parsePdf(file: File): Promise<ParsedStatement> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF statement.')
  if (file.size > 12 * 1024 * 1024) throw new Error('PDF is too large. Choose a file under 12 MB.')
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const lines: string[] = []
  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 12); pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const items = content.items.filter((item): item is typeof item & { str: string } => 'str' in item)
    lines.push(items.map(x => x.str).join(' '))
  }
  const text = lines.join('\n').replace(/\s+/g, ' ').trim()
  if (text.length < 30) throw new Error('No selectable text found. This may be a scanned PDF; local OCR is not included, so enter the details manually.')
  const parseFields = (source:string):ParsedStatement['fields'] => {
  const fields: ParsedStatement['fields'] = {}
  const find = (patterns: RegExp[]) => {
    for (const pattern of patterns) { const match = source.match(pattern); if (match?.[1]) return match[1].trim() }
    return undefined
  }
  fields.provider = find([/(?:provider|company|fund manager|issuer)\s*[:\-]\s*([A-Za-z0-9 &.,'-]{2,60})/i])
  fields.name = find([/(?:investment|fund|product name|security)\s*[:\-]\s*([A-Za-z0-9 &.,'-]{2,80})/i])
  fields.principal = find([/(?:principal|amount invested|investment amount|face value)\s*[:\-]?\s*(?:USD|KES|EUR|GBP|\$|KSh)?\s*([\d,]+(?:\.\d{1,2})?)/i])
  fields.annualRate = find([/(?:annual interest rate|interest rate|yield|coupon rate)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i])
  fields.startDate = find([/(?:start date|investment date|issue date|purchase date)\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i])
  fields.maturityDate = find([/(?:maturity date|matures on|maturity)\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i])
  fields.frequency = find([/(daily|monthly|quarterly|semi[- ]annual|semiannual|annual|at maturity)/i])
  const type = find([/(money market fund|\bMMF\b|bond|fixed deposit)/i])
  fields.type = type ? (/bond/i.test(type) ? 'Bond' : /money market|mmf/i.test(type) ? 'MMF' : 'Other') : undefined
  return fields
  }
  const principalMatches=[...text.matchAll(/(?:principal|amount invested|investment amount|face value)\s*[:\-]?\s*(?:USD|KES|EUR|GBP|\$|KSh)?\s*[\d,]+(?:\.\d{1,2})?/ig)]
  const candidates=principalMatches.map((match,index)=>parseFields(text.slice(Math.max(0,(match.index??0)-220), Math.min(text.length,(principalMatches[index+1]?.index??text.length)))))
  const fields=parseFields(text)
  return { text, fields, candidates: candidates.length>1?candidates:[fields] }
}

