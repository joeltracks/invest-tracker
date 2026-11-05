const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const ts=require('typescript');
const cache={};function load(name){if(cache[name])return cache[name];const exports={};cache[name]=exports;const source=fs.readFileSync(`src/lib/${name}.ts`,'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(p=>load(p.replace('./','')),exports);return exports}
const data=new Map();global.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
const calc=load('calculations'),store=load('localStore'),prefs=load('preferences'),backup=load('backup');
const inv=()=>({id:'a',provider:'Provider',name:'Fund',type:'MMF',principal:1000,currency:'USD',annualRate:10,startDate:'2025-01-01',maturityDate:null,frequency:'daily',interestMode:'paid_out',createdAt:'2025-01-01T00:00:00Z',events:[],yieldBasis:'gross',taxRate:0,status:'active',statementValue:null,couponMonths:[]});
test('dated top-ups and zero-yield changes split ACT/365 accrual',()=>{const i=inv();i.events=[{id:'1',date:'2025-02-01',kind:'deposit',amount:1000},{id:'2',date:'2025-03-01',kind:'rate_change',annualRate:0}];assert.ok(Math.abs(calc.estimate(i,new Date('2025-04-01T12:00')).interest-(1000*.1*31/365+2000*.1*28/365))<1e-8);assert.equal(calc.currentYield(i,new Date('2025-04-01')),0)});
test('daily payout stays visible on its due date and respects maturity',()=>{const i=inv();assert.equal(calc.nextPayout(i,new Date('2025-02-01T12:00')).getDate(),1);assert.equal(calc.nextPayout(i,new Date('2025-02-02T12:00')).getDate(),2);i.maturityDate='2025-02-01';assert.equal(calc.nextPayout(i,new Date('2025-02-02T12:00')),null)});
test('backdated withdrawal cannot spend a later deposit or invalidate a later withdrawal',()=>{store.setStorageScope('test');store.replaceInvestments([inv()]);store.appendEvent('a',{id:'d',date:'2025-03-01',kind:'deposit',amount:500});assert.throws(()=>store.appendEvent('a',{id:'w',date:'2025-02-01',kind:'withdrawal',amount:1200}),/principal/);assert.equal(store.loadInvestments()[0].events.length,1)});
test('editing preserves initial principal, yield, date and currency',()=>{const input=inv();store.replaceInvestments([input]);store.saveInvestment({...input,principal:9999,annualRate:99,currency:'KES',startDate:'2024-01-01'},'a');const actual=store.loadInvestments()[0];assert.equal(actual.principal,1000);assert.equal(actual.annualRate,10);assert.equal(actual.currency,'USD');assert.equal(actual.startDate,'2025-01-01')});
test('account records and preference scopes are isolated',()=>{store.setStorageScope('other');assert.deepEqual(store.loadInvestments(),[]);prefs.setPreferenceScope('one');prefs.savePreferences({baseCurrency:'KES',rates:{USD:130},monthlyGoal:5000});prefs.setPreferenceScope('two');assert.equal(prefs.loadPreferences().monthlyGoal,0)});
test('backup validation rejects malformed records, overdrawn ledger and bad FX',()=>{const b={format:'yieldwise',version:1,exportedAt:new Date().toISOString(),investments:[inv()],preferences:{baseCurrency:'USD',rates:{},monthlyGoal:100}};assert.equal(backup.parseBackup(JSON.stringify(b)).investments.length,1);b.investments[0].events=[{id:'w',date:'2025-02-01',kind:'withdrawal',amount:1001}];assert.throws(()=>backup.parseBackup(JSON.stringify(b)),/exceeds/);b.investments=[inv()];b.preferences.rates={KES:0};assert.throws(()=>backup.parseBackup(JSON.stringify(b)),/positive/)});
test('unknown terms remain a range and maturity stops accrual',()=>{const i=inv();i.interestMode='unknown';i.maturityDate='2025-07-01';const a=calc.estimate(i,new Date('2026-01-01'));const b=calc.estimate(i,new Date('2025-08-01'));assert.equal(a.interest,b.interest);assert.ok(a.high>a.low)});

test('same-day yield changes use ledger insertion order',()=>{const i=inv();i.events=[{id:'r1',date:'2025-02-01',kind:'rate_change',annualRate:8},{id:'r2',date:'2025-02-01',kind:'rate_change',annualRate:6}];assert.equal(calc.currentYield(i,new Date('2025-03-01')),6)});
test('invalid calendar dates are rejected before a ledger write',()=>{store.setStorageScope('dates');store.replaceInvestments([inv()]);assert.throws(()=>store.appendEvent('a',{id:'bad',date:'2025-02-31',kind:'deposit',amount:100}),/valid event date/);assert.equal(store.loadInvestments()[0].events.length,0)});

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('unknown payment timing does not imply reinvestment',()=>{const i={...inv(),frequency:'unknown'};const e=calc.estimate(i,new Date('2026-01-01T12:00'));near(e.low,100);near(e.high,100);near(e.value,1000)});
test('coupon amount covers its period and applies entered tax',()=>{const i={...inv(),frequency:'semiannual',taxRate:20};const payments=calc.scheduledPayouts(i,new Date('2026-01-01T12:00'),new Date('2026-01-01T23:59'));assert.equal(payments.length,1);near(payments[0].amount,1000*.1*184/365*.8)});
test('net retained value excludes paid income and includes dated future capital',()=>{const i={...inv(),taxRate:20,events:[{id:'d',kind:'deposit',date:'2025-07-01',amount:500}]};near(calc.netValue(i,new Date('2026-01-01T12:00')),1500);const c={...inv(),interestMode:'compound',frequency:'annual',taxRate:20};near(calc.netValue(c,new Date('2026-01-01T12:00')),1080)});
test('maturity-day payment remains visible and reinvestment has no periodic cash payout',()=>{const i={...inv(),frequency:'at_maturity',maturityDate:'2025-07-01'};assert.equal(calc.dateKey(calc.nextPayout(i,new Date('2025-07-01T12:00'))),'2025-07-01');assert.equal(calc.nextPayout({...inv(),interestMode:'compound'},new Date('2025-02-01T12:00')),null)});
test('calendar coupon months are respected without a start-day coupon',()=>{const i={...inv(),startDate:'2025-08-15',frequency:'semiannual',couponMonths:[6,12]};assert.equal(calc.dateKey(calc.nextPayout(i,new Date('2025-08-01T12:00'))),'2025-12-15')});
test('monthly view enumerates daily payments once and only period income',()=>{const i=inv();const payments=calc.scheduledPayouts(i,new Date('2025-02-26T12:00'),new Date('2025-02-28T23:59'));assert.equal(payments.length,3);payments.forEach(p=>near(p.amount,1000*.1/365))});
test('local calendar date keys preserve Nairobi midnight',()=>{const prior=process.env.TZ;try{process.env.TZ='Africa/Nairobi';assert.equal(calc.dateKey(new Date('2025-06-30T00:00:00')),'2025-06-30')}finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior}});
test('far-future scheduled investments retain a derivable first payout',()=>{const i={...inv(),startDate:'2028-01-01',frequency:'monthly'};assert.equal(calc.dateKey(calc.nextPayout(i,new Date('2026-01-01T12:00'))),'2028-02-01')});
test('short final payout period and month-end anniversaries do not double count',()=>{const i={...inv(),startDate:'2025-01-31',frequency:'monthly',maturityDate:'2025-03-15'};const p=calc.scheduledPayouts(i,new Date('2025-01-01T12:00'),new Date('2025-12-31T12:00'));assert.deepEqual(p.map(x=>calc.dateKey(x.date)),['2025-02-28','2025-03-15']);near(p.reduce((s,x)=>s+x.amount,0),1000*.1*43/365)});
test('coupon period handles both top-ups and changed yields',()=>{const i={...inv(),frequency:'semiannual',taxRate:20,events:[{id:'d',kind:'deposit',date:'2025-09-01',amount:500},{id:'r',kind:'rate_change',date:'2025-10-01',annualRate:6}]};const p=calc.scheduledPayouts(i,new Date('2026-01-01T12:00'),new Date('2026-01-01T23:59'));near(p[0].amount,(1000*.1*62/365+1500*.1*30/365+1500*.06*92/365)*.8)});

// Render actual source consumers with a fixed clock and isolated fictional holdings.
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function dashboard(items,date){
  const NativeDate=global.Date;
  global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[date]))}static now(){return new NativeDate(date).getTime()}};
  try{
    const exports={},source=fs.readFileSync('src/App.tsx','utf8');
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const req=p=>{
      if(p==='react')return {...React,useState:initial=>Array.isArray(initial)?[items,()=>{}]:React.useState(initial===true?false:initial)};
      if(p==='./Account')return {useAccount:()=>({session:null}),AccountPanel:()=>null};
      if(p==='./PortfolioTools')return {PortfolioTools:()=>null};
      if(p==='./lib/pdfImport')return {parsePdf:()=>{throw Error('No PDF access in calculation test')}};
      if(p.startsWith('./lib/'))return load(p.slice(6));
      return require(p);
    };
    new Function('require','exports',js)(req,exports);
    return renderToStaticMarkup(React.createElement(exports.default));
  }finally{global.Date=NativeDate}
}
test('dashboard chart endpoint and breakdown use actual retained capital',()=>{const i={...inv(),frequency:'annual',events:[{id:'d',kind:'deposit',date:'2026-01-01',amount:500}]};const html=dashboard([i],'2025-07-01T12:00:00');assert.ok(html.includes('class="green-text">$1,500.00</strong>'));assert.ok(html.includes('Fund: $1,500.00'))});
test('dashboard breakdown applies the same tax adjustment as its chart endpoint',()=>{const i={...inv(),frequency:'annual',interestMode:'compound',taxRate:20};const html=dashboard([i],'2025-01-01T12:00:00');assert.ok(html.includes('class="green-text">$1,080.00</strong>'));assert.ok(html.includes('Fund: $1,080.00'))});
test('maturity timeline stays visible throughout its calendar due date',()=>{const html=dashboard([{...inv(),maturityDate:'2025-07-01',frequency:'at_maturity'}],'2025-07-01T18:00:00');assert.ok(html.includes('Maturity'));assert.ok(html.includes('class="event-node event-maturity '))});
test('combined currency total and goal use manual FX in the declared direction',()=>{
  prefs.setPreferenceScope('calculation-render');prefs.savePreferences({baseCurrency:'KES',rates:{USD:130},monthlyGoal:2000});
  const exports={},source=fs.readFileSync('src/PortfolioTools.tsx','utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','exports',js)(p=>p.startsWith('./lib/')?load(p.slice(6)):require(p),exports);
  const NativeDate=global.Date;global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2025-01-01T12:00:00']))}};
  try{const html=renderToStaticMarkup(React.createElement(exports.PortfolioTools,{items:[inv(),{...inv(),id:'kes',currency:'KES',principal:500}],onImport:()=>{}}));assert.ok(html.includes(calc.formatMoney(130500,'KES')));assert.ok(html.includes(calc.formatMoney(1087.5,'KES')));assert.ok(html.includes('aria-valuenow="54"'))}finally{global.Date=NativeDate;prefs.setPreferenceScope('two')}
});
