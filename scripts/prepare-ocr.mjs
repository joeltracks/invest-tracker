import { mkdir, copyFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require=createRequire(import.meta.url)
const target=fileURLToPath(new URL('../public/ocr/',import.meta.url))
await mkdir(target,{recursive:true})
const root=name=>dirname(require.resolve(name+'/package.json'))
await copyFile(join(root('tesseract.js'),'dist/worker.min.js'),join(target,'worker.min.js'))
await copyFile(join(root('tesseract.js'),'dist/worker.min.js.LICENSE.txt'),join(target,'worker.min.js.LICENSE.txt'))
const core=root('tesseract.js-core')
for(const file of await readdir(core))if(/\.wasm(?:\.js)?$/.test(file))await copyFile(join(core,file),join(target,file))
await copyFile(join(root('@tesseract.js-data/eng'),'4.0.0_best_int/eng.traineddata.gz'),join(target,'eng.traineddata.gz'))
for(const name of ['tesseract.js','tesseract.js-core','@tesseract.js-data/eng']){
  const license=(await readdir(root(name))).find(file=>/^license(?:\.|$)/i.test(file))
  if(license)await copyFile(join(root(name),license),join(target,name.replaceAll('/','-')+'-LICENSE.txt'))
}
console.log('Local OCR worker, core and English data prepared in public/ocr.')
