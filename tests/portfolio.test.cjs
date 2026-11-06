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
function appExports(react=React){
  const exports={},source=fs.readFileSync('src/App.tsx','utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const req=p=>{if(p==='react')return react;if(p==='./Account')return {useAccount:()=>({profile:null,openExisting:()=>{}}),ProfilePage:()=>null};if(p==='./PortfolioTools')return {PortfolioTools:()=>null};if(p==='./lib/pdfImport')return {parsePdf:()=>{throw Error('No PDF access in calculation test')}};if(p.startsWith('./lib/'))return load(p.slice(6));return require(p)};
  new Function('require','exports',js+';exports.InvestmentModal=InvestmentModal;exports.EventModal=EventModal;')(req,exports);
  return exports;
}
function dashboard(items,date,rates={USD:130}){
  prefs.setPreferenceScope('dashboard-render');prefs.savePreferences({baseCurrency:'KES',rates,monthlyGoal:0});
  const NativeDate=global.Date;
  global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[date]))}static now(){return new NativeDate(date).getTime()}};
  try{
    const exports={},source=fs.readFileSync('src/App.tsx','utf8');
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const req=p=>{
      if(p==='react')return {...React,useState:initial=>Array.isArray(initial)?[items,()=>{}]:React.useState(initial===true?false:initial)};
      if(p==='./Account')return {useAccount:()=>({profile:null,openExisting:()=>{}}),ProfilePage:()=>null};
      if(p==='./PortfolioTools')return {PortfolioTools:()=>null};
      if(p==='./lib/pdfImport')return {parsePdf:()=>{throw Error('No PDF access in calculation test')}};
      if(p.startsWith('./lib/'))return load(p.slice(6));
      return require(p);
    };
    new Function('require','exports',js)(req,exports);
    return renderToStaticMarkup(React.createElement(exports.default));
  }finally{global.Date=NativeDate}
}
test('dashboard chart endpoint and breakdown use actual retained capital in KES',()=>{const i={...inv(),frequency:'annual',events:[{id:'d',kind:'deposit',date:'2026-01-01',amount:500}]};const html=dashboard([i],'2025-07-01T12:00:00');assert.ok(html.includes('class="green-text">'+calc.formatMoney(195000,'KES')+'</strong>'));assert.ok(html.includes('Fund: '+calc.formatMoney(195000,'KES')))});
test('dashboard breakdown applies the same tax and FX adjustments as its chart endpoint',()=>{const i={...inv(),frequency:'annual',interestMode:'compound',taxRate:20};const html=dashboard([i],'2025-01-01T12:00:00');assert.ok(html.includes('class="green-text">'+calc.formatMoney(140400,'KES')+'</strong>'));assert.ok(html.includes('Fund: '+calc.formatMoney(140400,'KES')))});
test('maturity timeline stays visible throughout its calendar due date',()=>{const html=dashboard([{...inv(),maturityDate:'2025-07-01',frequency:'at_maturity'}],'2025-07-01T18:00:00');assert.ok(html.includes('Maturity'));assert.ok(html.includes('class="event-node event-maturity '))});
test('combined currency total and goal use manual FX in the declared direction',()=>{
  prefs.setPreferenceScope('calculation-render');prefs.savePreferences({baseCurrency:'KES',rates:{USD:130},monthlyGoal:2000});
  const exports={},source=fs.readFileSync('src/PortfolioTools.tsx','utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','exports',js)(p=>p.startsWith('./lib/')?load(p.slice(6)):require(p),exports);
  const NativeDate=global.Date;global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2025-01-01T12:00:00']))}};
  try{const html=renderToStaticMarkup(React.createElement(exports.PortfolioTools,{items:[inv(),{...inv(),id:'kes',currency:'KES',principal:500}],onImport:()=>{},preferences:prefs.loadPreferences(),onPreferencesChange:()=>{}}));assert.ok(html.includes(calc.formatMoney(130500,'KES')));assert.ok(html.includes(calc.formatMoney(1087.5,'KES')));assert.ok(html.includes('aria-valuenow="54"'))}finally{global.Date=NativeDate;prefs.setPreferenceScope('two')}
});

const currency=load('currency'),statements=load('statementText');
test('fresh settings default to KES and legacy goals are not relabelled',()=>{prefs.setPreferenceScope('kes-default');assert.equal(prefs.loadPreferences().baseCurrency,'KES');localStorage.setItem(prefs.preferenceKey(),JSON.stringify({baseCurrency:'USD',monthlyGoal:500,rates:{KES:130,EUR:1.1}}));const migrated=prefs.loadPreferences();assert.equal(migrated.baseCurrency,'KES');assert.equal(migrated.monthlyGoal,0);assert.deepEqual(migrated.rates,{})});
test('KES quotes use source-to-KES multiplication and reject invalid rates',()=>{assert.equal(currency.toKes(1000,'USD',{USD:130}),130000);assert.equal(currency.toKes(1000,'KES',{}),1000);assert.equal(currency.toKes(1000,'EUR',{USD:130}),null);for(const rate of [0,-1,Infinity,NaN])assert.throws(()=>currency.withKesRate({},'USD',rate),/positive/);assert.equal(currency.toKes(1e300,'USD',{USD:1e300}),null)});
test('dashboard waits for all FX rates instead of showing partial KES totals',()=>{const html=dashboard([inv(),{...inv(),id:'k',currency:'KES',principal:500}],'2025-01-01T12:00:00',{});assert.ok(html.includes('Set conversion rates'));assert.ok(html.includes('USD to KES conversion rate'));assert.ok(!html.includes('class="chart-svg"'))});
test('overflowing conversion quotes cannot publish infinite dashboard totals',()=>{const html=dashboard([inv()],'2025-01-01T12:00:00',{USD:1e308});assert.ok(html.includes('values too large to display'));assert.ok(!html.includes('class="chart-svg"'));assert.ok(!html.includes('KES∞'))});
test('statement parser recognizes KES aliases, ISO codes and explicit symbols',()=>{for(const [text,code] of [['Principal: KShs. 150,000','KES'],['Principal: 150,000 KES','KES'],['Principal: USD 1,000','USD'],['Principal: CHF 1,000','CHF'],['Principal: €1,000','EUR'],['Currency: GBP Principal: 1,000','GBP']]){const field=statements.parseStatementText(text).fields;assert.equal(field.currency,code,text);assert.equal(field.principal,text.includes('150,000')?'150,000':'1,000',text)}});
test('ambiguous or missing currency stays unselected for review',()=>{assert.equal(statements.detectCurrency('Principal: $1,000').currencyStatus,'ambiguous');assert.equal(statements.detectCurrency('Principal: 1,000').currencyStatus,'missing');const conflict=statements.detectCurrency('Currency: USD Principal: KES 1,000');assert.equal(conflict.currency,undefined);assert.equal(conflict.currencyStatus,'ambiguous')});
test('multiple statement investments retain their own currencies and amounts',()=>{const parsed=statements.parseStatementText('Provider: Alpha Product name: Dollar Fund Principal: USD 1,000 Yield: 5% Provider: Beta Product name: Local Bond Principal: KES 200,000 Yield: 10%');assert.equal(parsed.candidates.length,2);assert.deepEqual(parsed.candidates.map(i=>i.currency),['USD','KES']);assert.deepEqual(parsed.candidates.map(i=>i.principal),['1,000','200,000'])});
test('annual rate language does not invent an annual payout frequency',()=>{assert.equal(statements.parseStatementText('Principal: USD 1,000 Annual interest rate: 5% Payment frequency: monthly').fields.frequency,'monthly');assert.equal(statements.parseStatementText('Principal: USD 1,000 Annual interest rate: 5%').fields.frequency,undefined);assert.equal(statements.parseStatementText('Principal: USD 1,000 Payment frequency: annual').fields.frequency,'annual')});
test('fresh and cleared local portfolios stay empty without sample seeding',()=>{store.setStorageScope(null);store.clearPortfolio();assert.deepEqual(store.loadInvestments(),[]);store.replaceInvestments([]);assert.deepEqual(store.loadInvestments(),[]);store.clearPortfolio();assert.deepEqual(store.loadInvestments(),[])});
test('legacy sample cleanup preserves custom entries, reconciliations and event history',()=>{store.setStorageScope(null);const seed={...inv(),id:'demo-mmf',provider:'Cedar Capital',name:'Cedar Money Market Fund',annualRate:5.2,principal:15000,startDate:'2024-08-01',frequency:'unknown',interestMode:'unknown'};const real={...inv(),id:'real'};store.replaceInvestments([seed,real]);assert.deepEqual(store.loadInvestments(),[real]);assert.equal(JSON.parse(localStorage.getItem('yieldwise-demo-investments-v1')).length,1);const edited={...seed,name:'My actual investment'};const reconciled={...seed,statementValue:15100};const ledger={...seed,events:[{id:'topup',date:'2025-02-01',kind:'deposit',amount:100}]};const changedTerms={...seed,frequency:'monthly'},changedDate={...seed,startDate:'2024-09-01'};store.replaceInvestments([edited,reconciled,ledger,changedTerms,changedDate]);assert.deepEqual(store.loadInvestments(),[edited,reconciled,ledger,changedTerms,changedDate])});
test('sample cleanup does not alter signed-in account storage',()=>{store.setStorageScope('sample-cleanup-account');const item={...inv(),id:'demo-mmf',provider:'Cedar Capital',name:'Cedar Money Market Fund',annualRate:5.2,principal:15000};store.replaceInvestments([item]);assert.deepEqual(store.loadInvestments(),[item]);store.setStorageScope('other')});

const capitalEvents=[{id:'d',date:'2025-02-01',kind:'deposit',amount:500},{id:'w',date:'2025-03-01',kind:'withdrawal',amount:200}];
test('persisted cash events change current principal without rewriting its historical opening amount',()=>{store.setStorageScope('ledger-principal');store.replaceInvestments([inv()]);capitalEvents.forEach(e=>store.appendEvent('a',e));const saved=store.loadInvestments()[0];near(calc.estimate(saved,new Date('2025-01-31T12:00')).principal,1000);near(calc.estimate(saved,new Date('2025-02-01T12:00')).principal,1500);near(calc.estimate(saved,new Date('2025-03-01T12:00')).principal,1300);assert.equal(saved.principal,1000);store.saveInvestment({...saved,name:'Renamed after events'},saved.id);near(calc.estimate(store.loadInvestments()[0],new Date('2025-03-01T12:00')).principal,1300)});
test('foreign edit preview converts current principal after cash events',()=>{const item={...inv(),events:capitalEvents};const html=renderToStaticMarkup(React.createElement(appExports().InvestmentModal,{initial:item,existingItems:[item],preferences:{baseCurrency:'KES',rates:{USD:130},monthlyGoal:0},onClose:()=>{},onRecordEvent:()=>{},onSave:async()=>{}}));assert.ok(html.includes('Current principal'));assert.ok(html.includes('Principal in KES: '+calc.formatMoney(169000,'KES')))});
test('CSV snapshots export current principal and preserve opening capital separately',()=>{const item={...inv(),events:capitalEvents};const csv=appExports().buildInvestmentCsv([item],new Date('2025-03-01T12:00'));const rows=csv.split('\r\n').map(line=>line.slice(1,-1).split('\",\"'));const record=Object.fromEntries(rows[0].map((key,index)=>[key,rows[1][index]]));assert.equal(record['Opening principal'],'1000');assert.equal(record['Current principal'],'1300');assert.equal(record['Principal as of'],'2025-03-01')});
test('current principal stays dated while projections include future cash events',()=>{const item={...inv(),currency:'KES',events:[...capitalEvents,{id:'future',date:'2025-12-01',kind:'deposit',amount:5000}]};const html=dashboard([item],'2025-03-01T12:00:00',{});const metric=html.slice(html.indexOf('Principal currently invested'),html.indexOf('Estimated current value'));assert.ok(metric.includes(calc.formatMoney(1300,'KES')));assert.ok(!metric.includes(calc.formatMoney(6300,'KES')));assert.ok(html.includes(calc.formatMoney(6300,'KES')));near(calc.estimate(item,new Date('2025-12-01T12:00')).principal,6300)});

const sessionData=new Map();global.sessionStorage={getItem:key=>sessionData.get(key)??null,setItem:(key,value)=>sessionData.set(key,value),removeItem:key=>sessionData.delete(key)};
const profiles=load('profiles');
const ada={name:'Ada Example',email:'ada@example.test'},ben={name:'Ben Example',email:'ben@example.test'};
const resetProfiles=()=>{localStorage.removeItem(profiles.profilesKey);profiles.closeLocalProfile()};
test('local profile creation validates details and prevents duplicate emails',()=>{resetProfiles();const profile=profiles.createLocalProfile({name:'  Ada   Example ',email:' ADA@EXAMPLE.TEST '});assert.equal(profile.name,ada.name);assert.equal(profile.email,ada.email);assert.throws(()=>profiles.createLocalProfile({name:'Another Name',email:'ADA@example.test'}),/already exists/);assert.throws(()=>profiles.createLocalProfile({name:'A',email:'bad'}),/name/);assert.equal(profiles.loadProfiles().length,1);assert.equal(profiles.currentLocalProfile(),null);assert.ok(!JSON.stringify(profiles.loadProfiles()).includes('password'))});
test('returning profile selection requires matching details and supports closing the workspace',()=>{resetProfiles();const profile=profiles.createLocalProfile(ada);assert.equal(profiles.findLocalProfile({name:'ada example',email:'ADA@EXAMPLE.TEST'}).id,profile.id);assert.throws(()=>profiles.findLocalProfile({...ada,name:'Wrong Name'}),/do not match/);assert.throws(()=>profiles.findLocalProfile({...ada,email:'other@example.test'}),/do not match/);profiles.openLocalProfile(profile.id);assert.equal(profiles.currentLocalProfile().id,profile.id);profiles.closeLocalProfile();assert.equal(profiles.currentLocalProfile(),null);assert.throws(()=>profiles.openLocalProfile('missing'),/no longer/)});
test('first profile can copy existing browser data while later profiles start empty',()=>{resetProfiles();const original=[{...inv(),events:capitalEvents}];localStorage.setItem('yieldwise-demo-investments-v1',JSON.stringify(original));localStorage.setItem('yieldwise-preferences-demo',JSON.stringify({baseCurrency:'KES',rates:{USD:130},monthlyGoal:5000}));const first=profiles.createLocalProfile(ada,true);assert.deepEqual(JSON.parse(localStorage.getItem('yieldwise-investments-'+first.id)),original);assert.equal(JSON.parse(localStorage.getItem('yieldwise-preferences-'+first.id)).monthlyGoal,5000);assert.deepEqual(JSON.parse(localStorage.getItem('yieldwise-demo-investments-v1')),original);const second=profiles.createLocalProfile(ben);assert.deepEqual(JSON.parse(localStorage.getItem('yieldwise-investments-'+second.id)),[]);assert.throws(()=>profiles.createLocalProfile({name:'Third Person',email:'third@example.test'},true),/first profile/)});
test('profile edits keep identity and portfolio data and reject another profile email',()=>{resetProfiles();const first=profiles.createLocalProfile(ada),second=profiles.createLocalProfile(ben);store.setStorageScope(first.id);store.replaceInvestments([{...inv(),events:capitalEvents}]);const updated=profiles.updateLocalProfile(first.id,{name:'Ada Updated',email:'updated@example.test'});assert.equal(updated.id,first.id);assert.equal(profiles.findLocalProfile({name:'Ada Updated',email:'updated@example.test'}).id,first.id);assert.equal(store.loadInvestments()[0].events.length,2);assert.throws(()=>profiles.updateLocalProfile(first.id,{name:'Ada Updated',email:second.email}),/already uses/)});
test('removing a local profile clears only its own workspace',()=>{resetProfiles();const first=profiles.createLocalProfile(ada),second=profiles.createLocalProfile(ben);localStorage.setItem('yieldwise-investments-'+first.id,JSON.stringify([inv()]));localStorage.setItem('yieldwise-preferences-'+first.id,JSON.stringify({baseCurrency:'KES',rates:{},monthlyGoal:10}));localStorage.setItem('yieldwise-investments-'+second.id,JSON.stringify([{...inv(),principal:2000}]));const guest=localStorage.getItem('yieldwise-demo-investments-v1');profiles.openLocalProfile(first.id);profiles.removeLocalProfile(first.id);assert.equal(profiles.currentLocalProfile(),null);assert.equal(localStorage.getItem('yieldwise-investments-'+first.id),null);assert.equal(localStorage.getItem('yieldwise-preferences-'+first.id),null);assert.equal(JSON.parse(localStorage.getItem('yieldwise-investments-'+second.id))[0].principal,2000);assert.equal(localStorage.getItem('yieldwise-demo-investments-v1'),guest);assert.deepEqual(profiles.loadProfiles().map(p=>p.id),[second.id])});
test('failed profile creation leaves existing records intact and no orphan workspace',()=>{resetProfiles();const priorKeys=[...data.keys()],write=localStorage.setItem;localStorage.setItem=(key,value)=>{if(key===profiles.profilesKey)throw Error('quota');write(key,value)};try{assert.throws(()=>profiles.createLocalProfile(ada,true),/could not be saved/);assert.deepEqual([...data.keys()].sort(),priorKeys.sort());assert.deepEqual(profiles.loadProfiles(),[])}finally{localStorage.setItem=write}});
function profileUi(react=React){
  const modules={};
  function component(name){
    if(modules[name])return modules[name];
    const exports={};modules[name]=exports;
    const source=fs.readFileSync(`src/${name}.tsx`,'utf8');
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    new Function('require','exports',js)(p=>p==='react'?react:p==='./LandingPage'?component('LandingPage'):p.startsWith('./lib/')?load(p.slice(6)):require(p),exports);
    return exports;
  }
  return component('Account');
}
test('new and returning visitors can browse publicly without opening a profile or mounting portfolio tools',()=>{
  resetProfiles();let mounted=0;function PrivateTools(){mounted++;return React.createElement('p',null,'Private portfolio');}
  function render(){return renderToStaticMarkup(React.createElement(profileUi().AccountProvider,null,React.createElement(PrivateTools)));}
  let html=render();assert.ok(html.includes('Take a look around'));assert.ok(html.includes('Our estimates'));assert.ok(!html.includes('Create a new profile'));assert.ok(!html.includes('role="dialog"'));assert.equal(mounted,0);
  profiles.createLocalProfile(ada);const before=JSON.stringify([...data]);html=render();assert.ok(html.includes('Add investment'));assert.ok(!html.includes('role="dialog"'));assert.equal(mounted,0);assert.equal(JSON.stringify([...data]),before);assert.ok(!html.includes('Magic link'));assert.ok(!html.includes('VITE_SUPABASE'));
});
test('opening profiles selects their matching portfolio and KES settings before rendering',()=>{resetProfiles();const first=profiles.createLocalProfile(ada),second=profiles.createLocalProfile(ben);localStorage.setItem('yieldwise-investments-'+first.id,JSON.stringify([{...inv(),principal:1500}]));localStorage.setItem('yieldwise-investments-'+second.id,JSON.stringify([{...inv(),principal:2500}]));function Probe(){return React.createElement('p',null,'Capital '+store.loadInvestments()[0].principal)}profiles.openLocalProfile(first.id);let html=renderToStaticMarkup(React.createElement(profileUi().AccountProvider,null,React.createElement(Probe)));assert.ok(html.includes('Capital 1500'));profiles.openLocalProfile(second.id);html=renderToStaticMarkup(React.createElement(profileUi().AccountProvider,null,React.createElement(Probe)));assert.ok(html.includes('Capital 2500'));profiles.closeLocalProfile();store.setStorageScope('other');prefs.setPreferenceScope('two')});
test('first-profile copy does not bring back removed legacy samples',()=>{resetProfiles();const sample={...inv(),id:'demo-mmf',provider:'Cedar Capital',name:'Cedar Money Market Fund',annualRate:5.2,principal:15000,startDate:'2024-08-01',frequency:'unknown',interestMode:'unknown'},real={...inv(),id:'actual-entry'};localStorage.setItem('yieldwise-demo-investments-v1',JSON.stringify([sample,real]));const profile=profiles.createLocalProfile(ada,true);assert.deepEqual(JSON.parse(localStorage.getItem('yieldwise-investments-'+profile.id)),[real]);assert.equal(JSON.parse(localStorage.getItem('yieldwise-demo-investments-v1')).length,2)});
test('corrupt legacy browser data cannot block an existing local profile',()=>{resetProfiles();const profile=profiles.createLocalProfile(ada);profiles.openLocalProfile(profile.id);const guest=localStorage.getItem('yieldwise-demo-investments-v1');localStorage.setItem('yieldwise-demo-investments-v1','invalid json');try{const html=renderToStaticMarkup(React.createElement(profileUi().AccountProvider,null,React.createElement('p',null,'Existing workspace opens')));assert.ok(html.includes('Existing workspace opens'));assert.ok(!html.includes('profiles need attention'))}finally{if(guest===null)localStorage.removeItem('yieldwise-demo-investments-v1');else localStorage.setItem('yieldwise-demo-investments-v1',guest);profiles.closeLocalProfile();store.setStorageScope('other');prefs.setPreferenceScope('two')}});

const entry=load('entryRoutes');
test('entry routes protect private deep links and accept only known return actions',()=>{
  for(const action of entry.portfolioActions){
    const route=entry.readEntryRoute(entry.entryUrl('signup',action));
    assert.equal(route.action,action);assert.equal(entry.entryScreen(route,false),'signup');
    assert.equal(entry.readEntryRoute(entry.entryUrl('login',action)).action,action);
  }
  assert.equal(entry.entryScreen(entry.readEntryRoute('#profile'),false),'signup');
  assert.equal(entry.entryScreen(entry.readEntryRoute('#portfolio-settings'),false),'signup');
  assert.equal(entry.entryScreen(entry.readEntryRoute('#dashboard'),false),'landing');
  assert.equal(entry.entryScreen(entry.readEntryRoute('#features'),true),'landing');
  assert.equal(entry.entryScreen(entry.readEntryRoute('#public-content'),true),'landing');
  assert.equal(entry.entryScreen(entry.readEntryRoute('#dashboard'),true),'portfolio');
  for(const next of ['https://example.test','//example.test','javascript:alert(1)','not-an-action'])assert.equal(entry.readEntryRoute('#signup?next='+encodeURIComponent(next)).action,'dashboard');
});

/** Exercise the provider's real event handlers with in-memory React state/history. */
function entryHarness(hash=''){
  const previousWindow=global.window,states=[],refs=[];let stateCursor=0,refCursor=0;
  global.window={location:{hash},scrollTo(){},history:{pushState(_state,_title,url){window.location.hash=url},replaceState(_state,_title,url){window.location.hash=url}}};
  const react={...React,useEffect:()=>{},useCallback:fn=>fn,useRef:initial=>{const index=refCursor++;return refs[index]??(refs[index]={current:initial})},useState:initial=>{
    const index=stateCursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;
    return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}];
  }};
  const {AccountProvider}=profileUi(react);
  return {render(){stateCursor=0;refCursor=0;return AccountProvider({children:React.createElement('p',null,'Private portfolio')})},restore(){if(previousWindow===undefined)delete global.window;else global.window=previousWindow;profiles.closeLocalProfile();store.setStorageScope('other');prefs.setPreferenceScope('two')}};
}

test('Add investment continues through sign up, sets profile scopes and resumes the selected action',()=>{
  resetProfiles();const harness=entryHarness();
  try{
    let tree=harness.render();tree.props.children[0].props.onStart('add-investment');
    tree=harness.render();assert.match(window.location.hash,/#signup\?next=add-investment/);assert.equal(tree.props.children[0].props.action,'add-investment');
    tree.props.children[0].props.onCreate(ada,false);tree=harness.render();
    assert.equal(tree.props.value.profile.email,ada.email);assert.equal(tree.props.value.pendingAction,'add-investment');assert.equal(window.location.hash,'#dashboard');
    assert.equal(tree.props.children[0].props.children.props.children,'Private portfolio');
    assert.deepEqual(store.loadInvestments(),[]);assert.equal(prefs.loadPreferences().baseCurrency,'KES');
    tree.props.value.completeEntryAction();assert.equal(harness.render().props.value.pendingAction,null);
    tree.props.value.closeProfile();tree=harness.render();assert.equal(window.location.hash,'#home');assert.equal(tree.props.value.profile,null);assert.ok(tree.props.children[0].props.onStart);
  }finally{harness.restore()}
});

test('Login cancellation and signup/login switching preserve the requested tool and existing records',()=>{
  resetProfiles();const saved=profiles.createLocalProfile(ada);localStorage.setItem('yieldwise-investments-'+saved.id,JSON.stringify([{...inv(),principal:4321}]));
  const harness=entryHarness('#signup?next=import-statement');
  try{
    let tree=harness.render();tree.props.children[0].props.onExisting();tree=harness.render();
    assert.equal(window.location.hash,'#login?next=import-statement');assert.equal(tree.props.children[1].props.action,'import-statement');assert.equal(tree.props.value.profile,null);
    tree.props.children[1].props.onClose();tree=harness.render();assert.equal(window.location.hash,'#signup?next=import-statement');assert.equal(tree.props.children[0].props.action,'import-statement');
    tree.props.children[0].props.onExisting();tree=harness.render();tree.props.children[1].props.onCreate();tree=harness.render();assert.equal(tree.props.children[0].props.action,'import-statement');
    tree.props.children[0].props.onExisting();tree=harness.render();tree.props.children[1].props.onOpen(profiles.findLocalProfile(ada));tree=harness.render();
    assert.equal(tree.props.value.pendingAction,'import-statement');assert.equal(store.loadInvestments()[0].principal,4321);assert.equal(tree.props.value.profile.id,saved.id);
  }finally{harness.restore()}
});

test('Reloaded auth routes retain their tool and do not expose private content before login',()=>{
  resetProfiles();profiles.createLocalProfile(ada);
  const harness=entryHarness('#login?next=income-goal');
  try{
    const tree=harness.render(),html=renderToStaticMarkup(tree);
    assert.ok(html.includes('Log in to your profile'));assert.ok(html.includes('set an income goal'));assert.ok(!html.includes('Private portfolio'));assert.ok(html.includes('not a secure sign-in'));
  }finally{harness.restore()}
});

test('logging out clears the session and protects the portfolio while preserving saved investments and KES settings',()=>{
  resetProfiles();const saved=profiles.createLocalProfile(ada);
  const holdings=JSON.stringify([{...inv(),events:[{id:'top-up',date:'2025-03-01',kind:'deposit',amount:500}]}]);
  const settings=JSON.stringify({baseCurrency:'KES',rates:{USD:130},monthlyGoal:5000});
  localStorage.setItem('yieldwise-investments-'+saved.id,holdings);localStorage.setItem('yieldwise-preferences-'+saved.id,settings);
  const harness=entryHarness();
  try{
    let tree=harness.render();tree.props.children[0].props.onLogin();tree=harness.render();tree.props.children[1].props.onOpen(saved);tree=harness.render();
    assert.equal(profiles.currentLocalProfile().id,saved.id);
    const before=JSON.stringify([...data]);tree.props.value.closeProfile();tree=harness.render();
    assert.equal(profiles.currentLocalProfile(),null);assert.equal(tree.props.value.profile,null);assert.equal(tree.props.value.pendingAction,null);assert.equal(window.location.hash,'#home');
    assert.equal(JSON.stringify([...data]),before);assert.equal(localStorage.getItem('yieldwise-investments-'+saved.id),holdings);assert.equal(localStorage.getItem('yieldwise-preferences-'+saved.id),settings);
    const html=renderToStaticMarkup(tree);assert.ok(html.includes('Take a look around'));assert.ok(!html.includes('Private portfolio'));
    assert.equal(entry.entryScreen(entry.readEntryRoute('#dashboard'),Boolean(profiles.currentLocalProfile())),'landing');
    const dashboardHtml=renderToStaticMarkup(React.createElement(appExports().default));assert.match(dashboardHtml,/>Log out<\/span>/);
  }finally{harness.restore()}
});
