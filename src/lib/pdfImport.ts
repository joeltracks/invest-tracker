import { parseStatementText, type StatementFields } from './statementText'
import type { Worker } from 'tesseract.js'
export type ParsedStatement = {text:string;fields:StatementFields;candidates:StatementFields[];warnings:string[];ocrPages:number}
export interface PdfOptions { signal?:AbortSignal; forceOcr?:boolean; onProgress?:(message:string)=>void }
/** Rendering and OCR run locally; only public OCR assets are downloaded. */
export async function parsePdf(file:File, options:PdfOptions={}):Promise<ParsedStatement> {
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw Error('Choose a PDF statement.')
  if(file.size>12*1024*1024)throw Error('PDF is too large. Choose a file under 12 MB.')
  const controller=new AbortController(), cancel=()=>controller.abort()
  options.signal?.addEventListener('abort',cancel,{once:true})
  if(options.signal?.aborted)cancel()
  let timedOut=false, ocrFailure=false
  const timer=setTimeout(()=>{timedOut=true;cancel()},300000)
  const aborted=new Promise<never>((_,reject)=>{
    const fail=()=>reject(Error(ocrFailure?'OCR could not load or read this page. Check your connection, retry, or enter details manually.':timedOut?'Reading took too long. Try a smaller PDF or enter details manually.':'Statement reading cancelled.'))
    if(controller.signal.aborted)fail()
    else controller.signal.addEventListener('abort',fail,{once:true})
  })
  void aborted.catch(()=>{})
  const run=<T,>(task:Promise<T>)=>Promise.race([task,aborted])
  let worker:Worker|undefined
  let loading:ReturnType<typeof import('pdfjs-dist')['getDocument']>|undefined
  let currentPage=0
  try {
    const pdfjs=await run(import('pdfjs-dist'))
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString()
    loading=pdfjs.getDocument({data:await run(file.arrayBuffer()),isEvalSupported:false})
    const pdf=await run(loading.promise)
    const lines:string[]=[],warnings:string[]=[]
    let ocrPages=0
    if(pdf.numPages>12)warnings.push('Only the first 12 of '+pdf.numPages+' pages were read. Split the remaining pages into another PDF.')
    for(let pageNum=1;pageNum<=Math.min(pdf.numPages,12);pageNum++) {
      currentPage=pageNum
      options.onProgress?.('Reading page '+pageNum+' of '+Math.min(pdf.numPages,12)+'…')
      const page=await run(pdf.getPage(pageNum))
      const content=await run(page.getTextContent())
      let text=content.items.filter((item):item is typeof item & {str:string}=>'str' in item).map(item=>item.str).join(' ').trim()
      if(options.forceOcr||text.replace(/\s/g,'').length<80) {
        if(!worker){
          options.onProgress?.('Loading local OCR engine and English language data…')
          const {createWorker}=await run(import('tesseract.js'))
          const base=new URL((import.meta.env?.BASE_URL??'/')+'ocr/',window.location.href).href
          const pending=createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false,errorHandler:()=>{ocrFailure=true;cancel()},logger:m=>{
            if(!controller.signal.aborted&&m.status==='recognizing text')options.onProgress?.('Reading scanned page '+currentPage+': '+Math.round(m.progress*100)+'%')
          }})
          void pending.then(w=>{if(controller.signal.aborted)void w.terminate()}).catch(()=>{})
          worker=await run(pending)
        }
        const original=page.getViewport({scale:1})
        const scale=Math.min(2.5,Math.sqrt(6000000/(original.width*original.height)),4096/Math.max(original.width,original.height))
        const viewport=page.getViewport({scale})
        const canvas=document.createElement('canvas')
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height)
        try {
          const context=canvas.getContext('2d')
          if(!context)throw Error('This browser cannot render the scanned page. Try another browser or enter details manually.')
          await run(page.render({canvasContext:context,viewport,background:'white'}).promise)
          const result=await run(worker.recognize(canvas))
          text=result.data.text.trim();ocrPages++
          if(result.data.confidence<70)warnings.push('Page '+pageNum+' has low OCR confidence. Check every amount, date and currency against the PDF.')
        } finally {canvas.width=0;canvas.height=0}
      }
      if(!text)warnings.push('No readable text on page '+pageNum+'. Check it manually.')
      lines.push(text);page.cleanup()
    }
    const text=lines.join('\n\n').trim()
    if(text.replace(/\s/g,'').length<30)throw Error('No usable text could be read, even with OCR. Try a clearer scan or enter details manually.')
    if(ocrPages)warnings.unshift('OCR can misread digits and currency symbols. Compare all extracted values with your statement before saving.')
    return {text,...parseStatementText(text),warnings,ocrPages}
  } catch(error) {
    if(error instanceof Error&&error.name==='PasswordException')throw Error('This PDF is password protected. Unlock a copy on your device and try again.')
    if(error instanceof Error&&error.name==='InvalidPDFException')throw Error('This PDF is damaged or unsupported. Choose another copy or enter details manually.')
    throw error
  } finally {
    clearTimeout(timer);options.signal?.removeEventListener('abort',cancel)
    if(worker)await worker.terminate().catch(()=>{})
    if(loading)await loading.destroy().catch(()=>{})
  }
}
