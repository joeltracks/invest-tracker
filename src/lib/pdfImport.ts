import { parseStatementText, type StatementFields } from './statementText'
export type ParsedStatement = {text:string;fields:StatementFields;candidates:StatementFields[]}
/** Selectable PDF text stays on this device. No external AI or OCR service is used. */
export async function parsePdf(file:File):Promise<ParsedStatement> {
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw Error('Choose a PDF statement.')
  if(file.size>12*1024*1024)throw Error('PDF is too large. Choose a file under 12 MB.')
  const pdfjs=await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString()
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise
  try {
    const lines:string[]=[]
    for(let pageNum=1;pageNum<=Math.min(pdf.numPages,12);pageNum++) {
      const content=await (await pdf.getPage(pageNum)).getTextContent()
      lines.push(content.items.filter((item):item is typeof item & {str:string}=>'str' in item).map(item=>item.str).join(' '))
    }
    const text=lines.join(' ').trim()
    if(text.replace(/\s/g,'').length<30)throw Error('No selectable text found. This may be a scanned PDF; local OCR is not included, so enter the details manually.')
    return {text,...parseStatementText(text)}
  } finally {await pdf.destroy()}
}
