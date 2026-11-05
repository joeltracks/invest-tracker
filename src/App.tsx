import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, BadgeCheck, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, CircleHelp, FileText, Landmark, LockKeyhole, Pencil, Plus, ShieldCheck, Sparkles, Trash2, TrendingUp, Upload, WalletCards, X, ArrowDownUp } from 'lucide-react'
import { addMonths, estimate, estimateLabel, formatMoney, investmentState, nextPayout, currentYield, dateKey, hasUnknownTerms, netValue, valueRange, incomeRange, scheduledPayouts, taxFactor } from './lib/calculations'
import { appendEvent, deleteInvestment, loadInvestments, restoreInvestment, saveInvestment, setInvestmentStatus } from './lib/localStore'
import { parsePdf } from './lib/pdfImport'
import type { Frequency, Investment, InvestmentInput, InvestmentType } from './types'
import { AccountPanel, useAccount } from './Account'
import { PortfolioTools } from './PortfolioTools'
import { defaultPreferences, loadPreferences, savePreferences, type Preferences } from './lib/preferences'
import { currencyCodes, kesRate, withKesRate } from './lib/currency'

const blank: InvestmentInput = { provider: '', name: '', type: 'MMF', principal: 0, currency: 'KES', annualRate: 0, startDate: dateKey(new Date()), maturityDate: null, frequency: 'unknown', interestMode: 'unknown', yieldBasis: 'gross', taxRate: 0, statementValue: null, couponMonths: [] }
const frequencyLabels: Record<Frequency, string> = { daily: 'Daily', monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Semiannually', annual: 'Annually', at_maturity: 'At maturity', unknown: 'Not sure' }
const currencyOptions = currencyCodes

/** A dated snapshot: opening capital stays immutable; current capital includes effective ledger cash flows. */
export function buildInvestmentCsv(items:Investment[],asOf=new Date()):string {
  const header=['Provider','Investment','Type','Opening principal','Current principal','Principal as of','Currency','Current annual rate (%)','Start date','Maturity date','Frequency','Interest treatment']
  const rows=items.map(item=>[item.provider,item.name,item.type,item.principal,estimate(item,asOf).principal,dateKey(asOf),item.currency,currentYield(item,asOf),item.startDate,item.maturityDate??'',frequencyLabels[item.frequency],item.interestMode])
  return [header,...rows].map(row=>row.map(value=>{
    const raw=String(value),safe=/^[\s]*[=+@\-]/.test(raw)?`'${raw}`:raw
    return `"${safe.replaceAll('"','""')}"`
  }).join(',')).join('\r\n')
}

function App() {
  const { session } = useAccount()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('dashboard')
  const navigationToggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mobileNavigationOpen) {
        setMobileNavigationOpen(false)
        navigationToggle.current?.focus()
      }
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [mobileNavigationOpen])
  function navigateTo(section: string) {
    setActiveSection(section)
    setMobileNavigationOpen(false)
    const destination = document.getElementById(section)
    if (destination instanceof HTMLDetailsElement) destination.open = true
    if (section === 'formula-details') destination?.querySelector('details')?.setAttribute('open', '')
    requestAnimationFrame(() => {
      destination?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
      if (destination) { destination.tabIndex = -1; destination.focus({ preventScroll: true }) }
      history.replaceState(null, '', `#${section}`)
    })
  }
  const projectionRef = useRef<HTMLElement>(null)
  const [items, setItems] = useState<Investment[]>([])
  const [busy, setBusy] = useState(true)
  useEffect(()=>{if(!projectionRef.current||matchMedia("(prefers-reduced-motion: reduce)").matches)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){projectionRef.current?.classList.add("projection-reveal");observer.disconnect()}},{threshold:0.3});observer.observe(projectionRef.current);return()=>observer.disconnect()},[busy,items.length])
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [months, setMonths] = useState(12)
  const currency = 'KES'
  const [preferences,setPreferences]=useState<Preferences>(()=>{try{return loadPreferences()}catch{return {...defaultPreferences,rates:{}}}})
  const [toast, setToast] = useState('')
  const [undoItem, setUndoItem] = useState<Investment | null>(null)
  const [eventFor, setEventFor] = useState<Investment | null>(null)
  const [eventKind, setEventKind] = useState<'deposit'|'withdrawal'|'rate_change'|undefined>()
  const [sortBy, setSortBy] = useState<'name'|'principal'|'rate'|'earned'|'maturity'>('name')
  const [filterBy, setFilterBy] = useState<'all'|'active'|'scheduled'|'matured'|'closed'>('all')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try { setItems(loadInvestments()); setPreferences(loadPreferences()); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your investments.') }
    finally { setBusy(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const visible = items
  const now = new Date()
  const eligible = visible.filter(x => ['Active','Matured'].includes(investmentState(x, now)))
  const missingRates=[...new Set(eligible.filter(x=>kesRate(x.currency,preferences.rates)===null).map(x=>x.currency))]
  const needsRates=missingRates.length>0
  const fx=(item:Investment)=>kesRate(item.currency,preferences.rates)??0
  const principal = eligible.reduce((sum, x) => sum + estimate(x, now).principal*fx(x), 0)
  const currentValue = eligible.reduce((sum, x) => sum+netValue(x,now)*fx(x), 0)
  const horizon = addMonths(now, months)
  const futureEarned = eligible.reduce((sum, x) => sum + Math.max(0, estimate(x, horizon).interest - estimate(x, now).interest) * (x.yieldBasis === 'gross' ? 1 - x.taxRate/100 : 1)*fx(x), 0)
  const unknownTerms=eligible.some(hasUnknownTerms)
  const portfolioRange=(date:Date)=>eligible.reduce((range,x)=>{const e=valueRange(x,date);return {low:range.low+e.low*fx(x),high:range.high+e.high*fx(x)}},{low:0,high:0})
  const futureRange=eligible.reduce((range,x)=>{const e=incomeRange(x,now,horizon);return {low:range.low+e.low*fx(x),high:range.high+e.high*fx(x)}},{low:0,high:0})
  const nowRange=portfolioRange(now), currentMetric=unknownTerms?`Between ${formatMoney(nowRange.low,currency)} and ${formatMoney(nowRange.high,currency)}`:formatMoney(currentValue,currency)
  const projectedMetric=unknownTerms?`Between +${formatMoney(futureRange.low,currency)} and +${formatMoney(futureRange.high,currency)}`:`+${formatMoney(futureEarned,currency)}`
  const chartPoints = Array.from({ length: 7 }, (_, index) => {
    const date = addMonths(now, Math.round(months * index / 6))
    return { date, value: eligible.reduce((sum, x) => sum+netValue(x,date)*fx(x), 0) }
  })
  const conversionOverflow=[principal,currentValue,futureEarned,nowRange.low,nowRange.high,futureRange.low,futureRange.high,...chartPoints.map(p=>p.value)].some(v=>!Number.isFinite(v))
  const totalsBlocked=needsRates||conversionOverflow
  const filtered = visible.filter(x => filterBy === 'all' || investmentState(x, now).toLowerCase() === filterBy).sort((a,b)=> {
    if(sortBy==='name') return a.name.localeCompare(b.name)
    if(sortBy==='principal') return estimate(b,now).principal*fx(b)-estimate(a,now).principal*fx(a)
    if(sortBy==='rate') return currentYield(b)-currentYield(a)
    if(sortBy==='earned') return estimate(b,now).interest*fx(b)-estimate(a,now).interest*fx(a)
    return (a.maturityDate??'9999').localeCompare(b.maturityDate??'9999')
  })
  const earning = eligible.filter(x=>investmentState(x,now)==='Active')
  const earningPrincipal=earning.reduce((sum,x)=>sum+estimate(x,now).principal*fx(x),0)
  const weightedRate = earning.reduce((sum,x)=>sum+estimate(x,now).principal*fx(x)*currentYield(x,now),0)/(earningPrincipal||1)
  const monthlyPayouts=eligible.flatMap(item=>scheduledPayouts(item,now,new Date(now.getFullYear(),now.getMonth()+1,0)).map(payout=>({item,...payout}))).sort((a,b)=>a.date.getTime()-b.date.getTime())
  const timelineEvents = useMemo(() => {
    const end = addMonths(now, months)
    const rows: { id: string; date: string; kind: 'start'|'deposit'|'withdrawal'|'rate_change'|'payout'|'maturity'; title: string; investment: string; amount?: string }[] = []
    visible.filter(x => investmentState(x, now) !== 'Closed').forEach(item => {
      const state = investmentState(item, now)
      rows.push({ id: `${item.id}:start`, date: item.startDate, kind: 'start', title: state === 'Scheduled' ? 'Starts' : 'Investment started', investment: item.name })
      item.events.forEach(event => rows.push({
        id: `${item.id}:${event.id}`,
        date: event.date,
        kind: event.kind,
        title: event.kind === 'deposit' ? 'Top-up' : event.kind === 'withdrawal' ? 'Withdrawal' : 'Rate change',
        investment: item.name,
        amount: event.kind === 'rate_change' ? `${event.annualRate}%` : formatMoney(event.amount ?? 0, item.currency),
      }))
      const payout = item.frequency === 'unknown' || item.frequency === 'at_maturity' ? null : nextPayout(item, now)
      if (payout && payout <= end) rows.push({ id: `${item.id}:payout:${payout.toISOString()}`, date: dateKey(payout), kind: 'payout', title: 'Next payout', investment: item.name })
      if (item.maturityDate && item.maturityDate >= dateKey(now) && item.maturityDate <= dateKey(end)) rows.push({ id: `${item.id}:maturity`, date: item.maturityDate, kind: 'maturity', title: 'Maturity', investment: item.name })
    })
    rows.sort((a, b) => a.date.localeCompare(b.date))
    const today = dateKey(now)
    return [...rows.filter(x => x.date < today).slice(-3), ...rows.filter(x => x.date >= today).slice(0, 5)]
  }, [visible, months, now])
  const selectedEvent = timelineEvents.find(event => event.id === selectedEventId)
  const hasData = items.length > 0

  async function save(input: InvestmentInput, id?: string, keepOpen=false, exchangeRate?:number) {
    setError('')
    const nextPreferences={...preferences,baseCurrency:'KES',rates:input.currency==='KES'?preferences.rates:withKesRate(preferences.rates,input.currency,exchangeRate??NaN)}
    savePreferences(nextPreferences)
    let next:Investment[]
    try{next=saveInvestment(input,id)}catch(e){savePreferences(preferences);throw e}
    setPreferences(nextPreferences)
    setItems(next); if(!keepOpen){setModal(false); setEditing(null)}
    announce(id ? 'Investment updated' : 'Investment added')
  }
  async function remove(item: Investment) {
    try { setUndoItem(item); setItems(deleteInvestment(item.id)); setToast(`Deleted ${item.name}`); window.setTimeout(() => { setToast(''); setUndoItem(null) }, 6000) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete investment.') }
  }
  function announce(message: string) { setToast(message); window.setTimeout(() => setToast(''), 2800) }
  function openMethodology() { const details=document.querySelector<HTMLDetailsElement>('#formula-details details'); if(details)details.open=true; document.getElementById('formula-details')?.scrollIntoView({behavior:'smooth'}) }
  function openAdd() { setEditing(null); setModal(true) }
  function openEdit(item: Investment) { setEditing(item); setModal(true) }
  function recordEvent(item: Investment, kind?:'deposit'|'withdrawal'|'rate_change') { setEventFor(item);setEventKind(kind) }
  function undoDelete() { if(undoItem){setItems(restoreInvestment(undoItem));setUndoItem(null);setToast('Investment restored');window.setTimeout(()=>setToast(''),2500)} }
  function exportCsv() {
    const csv = buildInvestmentCsv(items)
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'yieldwise-investments.csv'; link.click(); URL.revokeObjectURL(link.href)
  }

  return <div className={`app-shell sidebar-layout ${mobileNavigationOpen ? 'sidebar-open' : ''}`}><a className="skip-link" href="#dashboard">Skip to portfolio</a>
    <header className="mobile-header">
      <a href="#dashboard" className="brand" onClick={e=>{e.preventDefault();navigateTo('dashboard')}} aria-label="Yieldwise home"><span className="brand-mark"><Activity size={19} strokeWidth={2.5}/></span>yieldwise</a>
      <button ref={navigationToggle} type="button" className="button button-quiet navigation-toggle" aria-expanded={mobileNavigationOpen} aria-controls="primary-sidebar" onClick={()=>setMobileNavigationOpen(open=>!open)}>{mobileNavigationOpen?<X size={18}/>:<WalletCards size={18}/>} {mobileNavigationOpen?'Close menu':'Menu'}</button>
    </header>
    <aside id="primary-sidebar" className="sidebar" aria-label="Primary sidebar">
      <a href="#dashboard" className="brand sidebar-brand" onClick={e=>{e.preventDefault();navigateTo('dashboard')}} aria-label="Yieldwise home"><span className="brand-mark"><Activity size={19} strokeWidth={2.5}/></span><span>yieldwise</span></a>
      <div className="sidebar-group-label">Portfolio</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        <a href="#dashboard" className={activeSection==='dashboard'?'active':''} aria-current={activeSection==='dashboard'?'location':undefined} onClick={e=>{e.preventDefault();navigateTo('dashboard')}}><ChartNoAxesCombined size={18}/>Overview</a>
        <a href="#investments" className={activeSection==='investments'?'active':''} aria-current={activeSection==='investments'?'location':undefined} onClick={e=>{e.preventDefault();navigateTo('investments')}}><WalletCards size={18}/>Investments</a>
        <a href="#formula-details" className={activeSection==='formula-details'?'active':''} aria-current={activeSection==='formula-details'?'location':undefined} onClick={e=>{e.preventDefault();navigateTo('formula-details')}}><CircleHelp size={18}/><span>How estimates work</span></a>
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className={`sidebar-account ${activeSection==='account-settings'?'active':''}`} onClick={()=>navigateTo('account-settings')}><LockKeyhole size={18}/>Account & security<ArrowRight size={15}/></button>
        <div className="sidebar-status"><span className="status-dot"/>{session?'Personal portfolio':'Demo portfolio'}<small>Stored in this browser</small></div>
      </div>
    </aside>

    <main id="dashboard" className="main-content">
      <div className="page-heading"><div><h1>Your portfolio, in motion<span className="heading-period">.</span></h1><p className="subheading">See how dates, cash flows and stated terms shape what your investments may earn.</p></div>
        <div className="heading-actions">{hasData && <button className="button button-quiet" onClick={exportCsv}><ArrowDownToLine size={16} /> Export</button>}<button className="button button-primary" onClick={openAdd}><Plus size={17} /> Add investment</button></div>
      </div>
      {error && <div className="alert error-alert" role="alert"><CircleHelp size={18} />{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
      <div className="demo-banner"><ShieldCheck size={17} /><span><strong>{session?"Account portfolio.":"Local portfolio."}</strong> Records stay in this browser{session?" under your account.":" on this device."} Export JSON to back up your data.</span></div>
      {visible.some(x=>investmentState(x)==='Matured')&&<div className="maturity-banner" role="status"><CalendarDays size={17}/><div><strong>Matured: renew or close?</strong><span>{visible.filter(x=>investmentState(x)==='Matured').map(x=>x.name).join(', ')} reached maturity. Review provider options; close records from their row or edit dates/terms to track a renewal.</span></div></div>}

      {!busy&&<PortfolioTools items={items} onImport={setItems} preferences={preferences} onPreferencesChange={setPreferences}/>}
      {busy ? <div className="skeleton-panel" aria-label="Loading investments"><div /><div /><div /></div> : !hasData ? <EmptyState onAdd={openAdd} demo={!session} /> : <>
        <div className="metric-grid">
          <Metric icon={<WalletCards size={17} />} label="Principal currently invested" value={totalsBlocked?'Set conversion rates':formatMoney(principal, currency)} detail={`${eligible.length} active or matured holdings · ${currency}`} />
          <Metric icon={<Landmark size={17} />} label="Estimated current value" value={totalsBlocked?'Set conversion rates':currentMetric} detail={<>{unknownTerms?'Range reflects unknown interest treatment':'Includes entered dates and terms'} <span className="tiny-info" title="Estimates are scenarios, not guarantees">ⓘ</span></>} />
          <Metric icon={<TrendingUp size={17} />} label={`Projected earnings · ${months} months`} value={totalsBlocked?'Set conversion rates':projectedMetric} detail={totalsBlocked?`Check KES rates: ${missingRates.join(', ')}`:`If rates hold · active weighted yield ${weightedRate.toFixed(2)}%`} emphasis />
        </div>

        <section ref={projectionRef} className="panel projection-panel" aria-labelledby="projection-title">
          <div className="section-head"><div><div className="section-kicker"><ChartNoAxesCombined size={15} /> PORTFOLIO OUTLOOK</div><h2 id="projection-title">Portfolio projection</h2><p className="section-description">Estimated value if principal and entered rates remain unchanged.</p></div>
            <span className="reporting-badge">KES · user-set rates</span>
          </div>
            {totalsBlocked?<p className="fx-required" role="status">{needsRates?'Enter the '+missingRates.join(', ')+' to KES conversion rate above to calculate this projection.':'The entered rates produce values too large to display. Check your rates and investment terms.'}</p>:<><div className="chart-summary"><strong>{formatMoney(currentValue, currency)}</strong><span>today</span><ArrowRight size={15} /><strong className="green-text">{formatMoney(chartPoints.at(-1)!.value, currency)}</strong><span>in {months} months</span><div className="period-control" role="group" aria-label="Projection period">{[[3, '3M'], [6, '6M'], [12, '1Y'], [24, '2Y']].map(([m, label]) => <button key={m} className={months === m ? 'selected' : ''} onClick={() => setMonths(Number(m))} aria-pressed={months === m}>{label}</button>)}</div></div>
          <ProjectionChart points={chartPoints} currency={currency} breakdown={eligible} rates={preferences.rates} /></>}
          <div className="event-rail" aria-label="Investment event timeline">
            <div className="event-rail-heading"><strong>Events shaping this view</strong><span>{months}-month window</span></div>
            {timelineEvents.length ? <div className="event-track">{timelineEvents.map(event => <button key={event.id} type="button" className={`event-node event-${event.kind} ${selectedEventId === event.id ? 'event-selected' : ''}`} aria-pressed={selectedEventId === event.id} onClick={() => setSelectedEventId(selectedEventId === event.id ? null : event.id)}><i aria-hidden="true" /><span><strong>{event.title}</strong><small>{new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small><small className="event-investment">{event.investment}{event.amount ? ` · ${event.amount}` : ''}</small></span></button>)}</div> : <p className="event-empty">No dated events in this projection window yet. Add a top-up, rate change or payout term to build the timeline.</p>}
            {selectedEvent && <div className="event-inspector" aria-live="polite"><span className={`event-inspector-mark event-${selectedEvent.kind}`} aria-hidden="true" /><div><strong>{selectedEvent.title} · {selectedEvent.investment}</strong><span>{new Date(`${selectedEvent.date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })}{selectedEvent.amount ? ` · ${selectedEvent.amount}` : ''}. This date marks a new segment in the estimate.</span></div><button type="button" onClick={() => setSelectedEventId(null)} aria-label="Close event details"><X size={15} /></button></div>}
          </div>
          <p className="chart-note"><Sparkles size={13} /> Estimates assume the current entered rate continues. Where terms are unknown, the chart shows the simple-accrual scenario; the dashboard and holding rows show the simple-to-daily range.</p>
        </section>

        <section className="panel investments-panel" id="investments" aria-labelledby="investments-title">
          <div className="section-head list-head"><div><div className="section-kicker"><WalletCards size={15} /> YOUR HOLDINGS</div><h2 id="investments-title">Investments <span className="count-badge">{visible.length}</span></h2></div><button className="text-button" onClick={openAdd}><Plus size={16} /> Add another</button></div>
          <div className="table-tools"><label>State <select value={filterBy} onChange={e=>setFilterBy(e.target.value as typeof filterBy)}><option value="all">All states</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="matured">Matured</option><option value="closed">Closed</option></select></label><label>Sort by <select value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)}><option value="name">Name</option><option value="principal">Principal</option><option value="rate">Yield</option><option value="earned">Earnings</option><option value="maturity">Maturity</option></select></label></div>
          {filtered.length === 0 ? <div className="currency-empty">No investments match this view.</div> : <>
            <div className="investment-table-wrap" role="region" aria-label="Investment details table. Scroll horizontally for all columns." tabIndex={0}><table className="investment-table"><thead><tr><th>Investment</th><th>Current principal</th><th>Annual rate</th><th>Earned to date*</th><th>Next payout / maturity</th><th>State</th><th>Reconcile</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(item => <InvestmentRow key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} onEvent={() => recordEvent(item, item.type==="MMF"?"rate_change":undefined)} onCloseInvestment={()=>setItems(setInvestmentStatus(item.id,'closed'))} onReconcile={v=>{const next=saveInvestment({...item,statementValue:v},item.id);setItems(next)}} />)}</tbody></table></div>
            <div className="mobile-investments" role="table" aria-label="Investments">{filtered.map(item => <InvestmentCard key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} onEvent={()=>recordEvent(item,item.type==="MMF"?"rate_change":undefined)} onReconcile={v=>{const next=saveInvestment({...item,statementValue:v},item.id);setItems(next)}} />)}</div>
            <div className="table-foot"><span>* Earnings since the start date, after your entered tax assumption.</span><a href="#formula-details" onClick={e=>{e.preventDefault();openMethodology()}}>Calculation notes <ArrowRight size={13} /></a></div>
          </>}
        </section>
      </>}

      <section className="panel monthly-panel"><div className="section-kicker"><CalendarDays size={15}/> MONTHLY INCOME VIEW</div><h2>Income payouts due this month</h2><p>Today through month-end · estimated interest after entered tax. Dates are approximate; reinvested income is excluded.</p><div className="monthly-payouts">{monthlyPayouts.map(({item,date,amount})=><span key={item.id+dateKey(date)}><strong>{item.name}</strong> · {date.toLocaleDateString(undefined,{month:'short',day:'numeric'})} · {(kesRate(item.currency,preferences.rates)===null?'KES rate needed':formatMoney(amount*fx(item),'KES'))+(item.currency!=='KES'?' ('+formatMoney(amount,item.currency)+')':'')}</span>)}{monthlyPayouts.length===0&&<span>No known cash payouts due in the remaining month. Check provider terms for exact dates.</span>}</div></section>
      <section className="trust-strip" id="methodology"><div className="trust-icon"><LockKeyhole size={17} /></div><div><strong>Built for clarity and privacy</strong><p>Your estimates are based on the details you enter. This is a tracking tool, not financial advice.</p></div><button className="text-button" onClick={openMethodology}>How we calculate <ArrowRight size={14} /></button></section>
      <section className="methodology" id="formula-details"><details><summary><span><CircleHelp size={15} /> Formulas, assumptions & limitations</span><ChevronDown size={15} /></summary><div className="method-copy"><p><strong>Event ledger:</strong> ACT/365 accrual is calculated between each dated deposit, withdrawal, and rate change. Compound segments use balance × ((1 + rate / m)^(m × days / 365) − 1), with rate as a decimal. Paid-out and at-maturity terms use principal × rate × days / 365. At-maturity interest is retained without interim compounding. Withdrawals reduce balance from their event date.</p><p><strong>Unknown terms:</strong> show a range between simple accrual and daily compounding. These are illustrative bounds, not a probability range. Unknown payout timing alone does not imply reinvestment. Paid-out income is excluded from account value. Tax is a display adjustment, not withholding within compounding, and is deducted only for a gross stated yield: net estimate = gross interest × (1 − entered tax rate).</p><p>Scheduled and closed investments are excluded from portfolio totals; matured investments stop accruing on their maturity date and require review. Payouts show interest for each payment period after entered tax, including dates due today. Reinvested interest is not cash income. Dates use start-date anniversaries, or entered coupon months with the start day as an approximation. Remaining accrued interest is assumed settled at maturity. Check provider dates and coupon conventions. MMF yields are held constant only as a scenario. Price changes, fees, irregular rounding and tax rules are not independently validated.</p><p className="disclaimer">Estimates are illustrative, may differ from provider calculations, are not guaranteed returns, and are not financial advice.</p></div></details></section>
      <AccountPanel/>
      <footer className="footer"><span>© 2026 Yieldwise prototype</span><span>Simple by design <span className="footer-dot">·</span> Private by default</span></footer>
    </main>
    {modal && <InvestmentModal key={editing?.id ?? 'new'} initial={editing} existingItems={items} preferences={preferences} onClose={() => { setModal(false); setEditing(null) }} onRecordEvent={(item,kind)=>{setModal(false);recordEvent(item,kind)}} onSave={save} />}
    {eventFor && <EventModal key={`${eventFor.id}-${eventKind??'any'}`} item={eventFor} initialKind={eventKind} onClose={()=>{setEventFor(null);setEventKind(undefined)}} onSave={(event)=>{const updated=appendEvent(eventFor.id,event);setItems(updated);setEventFor(null);setEventKind(undefined);announce('Ledger event recorded')}} />}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}{undoItem&&<button onClick={undoDelete}>Undo</button>}</div>}
  </div>
}

function Metric({ icon, label, value, detail, emphasis = false }: { icon: React.ReactNode; label: string; value: string; detail: React.ReactNode; emphasis?: boolean }) {
  return <article className={`metric-card ${emphasis ? 'metric-emphasis' : ''}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span>{label}</span></div><strong className={`metric-value ${value.startsWith('Between')?'metric-range':''}`}>{value}</strong><div className="metric-detail">{detail}</div></article>
}

function ProjectionChart({ points, currency, breakdown, rates }: { points: { date: Date; value: number }[]; currency: string; breakdown: Investment[]; rates:Record<string,number> }) {
  const [activePoint, setActivePoint] = useState<number | null>(null)
  if (!points.length) return null
  const values = points.map(x => x.value), min = Math.min(...values), max = Math.max(...values), span = max - min || Math.max(max * 0.04, 1)
  const coords = points.map((point, i) => ({ x: 40 + i * 150, y: 124 - ((point.value - min) / span) * 78 }))
  const path = coords.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  const area = `${path} L ${coords.at(-1)?.x} 142 L ${coords[0].x} 142 Z`
  return <div className="chart-wrap"><div className="chart-tooltip" role="status" aria-live="polite">{activePoint === null ? 'Focus or hover a point to inspect its estimate' : <><strong>{points[activePoint].date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</strong><span>{formatMoney(points[activePoint].value, currency)}</span></>}</div><svg className="chart-svg" viewBox="0 0 940 170" role="img" aria-label={`Estimated portfolio value trend in ${currency}`} preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3159f5" stopOpacity=".2" /><stop offset="100%" stopColor="#3159f5" stopOpacity="0" /></linearGradient></defs>{[38, 82, 126].map(y => <line key={y} x1="35" y1={y} x2="925" y2={y} className="chart-grid" />)}<path d={area} fill="url(#fill)" /><path d={path} fill="none" className="chart-line" />{coords.map((p, i) => <g key={i} className="chart-point" tabIndex={0} role="img" aria-label={`${points[i].date.toLocaleDateString()} estimated value ${formatMoney(points[i].value,currency)}`} onFocus={() => setActivePoint(i)} onBlur={() => setActivePoint(null)} onMouseEnter={() => setActivePoint(i)} onMouseLeave={() => setActivePoint(null)}><circle cx={p.x} cy={p.y} r={i === coords.length - 1 ? 5 : 3.1} className="chart-dot" /><title>{`${points[i].date.toLocaleDateString()} · ${formatMoney(points[i].value,currency)}`}</title></g>)}</svg><div className="chart-labels">{[0, Math.ceil((points.length - 1) / 2), points.length - 1].map(i => <span key={i}>{points[i].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>)}</div><div className="breakdown-list" aria-label="Projection breakdown">{breakdown.map(x=><span key={x.id}><i />{x.name}: {formatMoney(netValue(x,points.at(-1)!.date)*(kesRate(x.currency,rates)??0),currency)}</span>)}</div></div>
}

function InvestmentRow({ item, onEdit, onDelete, onEvent, onCloseInvestment, onReconcile }: { item: Investment; onEdit: () => void; onDelete: () => void; onEvent:()=>void; onCloseInvestment:()=>void; onReconcile:(value:number)=>void }) {
  const [statementValue,setStatementValue]=useState(item.statementValue===null?'':String(item.statementValue))
  const earned = estimate(item, new Date()).interest, state=investmentState(item), payout=nextPayout(item)
  const today=estimate(item,new Date()),afterTax=item.yieldBasis==='gross'?1-item.taxRate/100:1
  const reportedValue=netValue(item,new Date())
  const gap=item.statementValue===null?null:item.statementValue-reportedValue
  return <tr><td><div className="investment-identity"><span className={`investment-icon ${item.type.toLowerCase()}`}>{item.type === 'Bond' ? <Landmark size={17} /> : item.type === 'MMF' ? <Activity size={17} /> : <WalletCards size={17} />}</span><div><strong>{item.name}</strong><span>{item.provider} <i>·</i> {item.type === 'Other' ? 'Other income' : item.type}</span></div></div></td><td>{formatMoney(today.principal, item.currency)}</td><td><strong>{currentYield(item).toFixed(2)}%</strong><span className="cell-sub">{item.frequency === 'unknown' ? 'Terms not set' : frequencyLabels[item.frequency]}</span></td><td><strong>{hasUnknownTerms(item)?`${formatMoney(today.low*afterTax,item.currency)}–${formatMoney(today.high*afterTax,item.currency)}`:formatMoney(earned*afterTax, item.currency)}</strong><span className="cell-sub">{estimateLabel(item)} · {item.yieldBasis==='gross'?'gross':'net'}</span></td><td>{payout?payout.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'—'}{item.maturityDate&&<span className="cell-sub">Maturity {new Date(`${item.maturityDate}T12:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span>}</td><td><span className={`state-tag ${state.toLowerCase()}`}>{state}</span></td><td><label className="sr-only" htmlFor={`statement-${item.id}`}>My statement shows for {item.name}</label><input className="reconcile-input" id={`statement-${item.id}`} type="number" min="0" step="0.01" placeholder="My statement shows X" value={statementValue} onChange={e=>setStatementValue(e.target.value)} onBlur={()=>{if(statementValue!==''&&Number.isFinite(Number(statementValue)))onReconcile(Number(statementValue))}} />{gap!==null&&<span className="cell-sub">Gap {formatMoney(gap,item.currency)}</span>}</td><td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button" aria-label={item.type==="MMF"?`Update yield for ${item.name}`:`Add top-up or withdrawal to ${item.name}`} title={item.type==="MMF"?"Update yield":"Record event"} onClick={onEvent}><ArrowDownUp size={15}/>{item.type==="MMF"&&<span className="yield-action-label">Update yield</span>}</button><button className="icon-button danger-hover" aria-label={`Delete ${item.name}`} onClick={onDelete}><Trash2 size={15} /></button>{state==='Matured'&&<><button className="text-button" onClick={onEdit}>Renew / update</button><button className="text-button" onClick={onCloseInvestment}>Close</button></>}</div></td></tr>
}
function InvestmentCard({ item, onEdit, onDelete, onEvent, onReconcile }: { item: Investment; onEdit: () => void; onDelete: () => void; onEvent:()=>void; onReconcile:(value:number)=>void }) {
  const [statementValue,setStatementValue]=useState(item.statementValue===null?'':String(item.statementValue))
  const state=investmentState(item), est=estimate(item,new Date()), payout=nextPayout(item)
  return <article className="investment-mobile-card" role="row" aria-label={`${item.name} investment details`}><div className="mobile-card-top" role="cell"><div className="investment-identity"><span className={`investment-icon ${item.type.toLowerCase()}`}>{item.type === 'Bond' ? <Landmark size={17} /> : <Activity size={17} />}</span><div><strong>{item.name}</strong><span>{item.provider} · {item.type} · {state}</span></div></div><div className="row-actions"><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button" aria-label={item.type==="MMF"?`Update yield for ${item.name}`:`Top up or withdraw ${item.name}`} title={item.type==="MMF"?"Update yield":"Record event"} onClick={onEvent}><ArrowDownUp size={15}/></button><button className="icon-button danger-hover" aria-label={`Delete ${item.name}`} onClick={onDelete}><Trash2 size={15} /></button></div></div><div className="mobile-card-stats" role="presentation"><div role="cell"><span>Principal</span><strong>{formatMoney(est.principal, item.currency)}</strong></div><div role="cell"><span>Rate</span><strong>{currentYield(item).toFixed(2)}%</strong></div><div role="cell"><span>Earned*</span><strong>{(hasUnknownTerms(item)?`${formatMoney(est.low*taxFactor(item),item.currency)}–${formatMoney(est.high*taxFactor(item),item.currency)}`:formatMoney(est.interest*taxFactor(item),item.currency))}</strong></div></div><div className="mobile-dates" role="cell"><span>Next payout: {payout?.toLocaleDateString()??'Not provided'}</span>{item.maturityDate&&<span>Maturity: {new Date(`${item.maturityDate}T12:00`).toLocaleDateString()}</span>}</div><label className="mobile-reconcile" role="cell">My statement shows <input type="number" min="0" step="0.01" value={statementValue} onChange={e=>setStatementValue(e.target.value)} onBlur={()=>{if(statementValue!=='')onReconcile(Number(statementValue))}} placeholder={item.currency}/> {item.statementValue!==null&&<span>Gap {formatMoney(item.statementValue-netValue(item,new Date()),item.currency)}</span>}</label><small role="cell">{estimateLabel(item)}</small></article>
}
function EmptyState({ onAdd, demo }: { onAdd: () => void; demo: boolean }) {
  return <section className="empty-state panel" id="investments"><div className="empty-art"><span className="empty-art-ring ring-one" /><span className="empty-art-ring ring-two" /><span className="empty-art-icon"><ChartNoAxesCombined size={28} /></span><span className="floating-dot dot-a" /><span className="floating-dot dot-b" /></div><div className="empty-eyebrow">A LITTLE MORE CLARITY</div><h2>Your investments, in one clear view.</h2><p>Add an income-generating investment to see estimated earnings and a simple projection. You can start with just the details you know.</p><button className="button button-primary" onClick={onAdd}><Plus size={17} /> Add your first investment</button><div className="empty-foot"><ShieldCheck size={14} /> {demo ? 'Your data stays in this browser.' : 'Your records are private to your signed-in account.'}</div></section>
}

function InvestmentModal({ initial, existingItems, preferences, onClose, onRecordEvent, onSave }: { initial: Investment | null; existingItems:Investment[];preferences:Preferences; onClose: () => void; onRecordEvent:(item:Investment,kind:'deposit'|'withdrawal'|'rate_change')=>void; onSave: (input: InvestmentInput, id?: string, keepOpen?:boolean,exchangeRate?:number) => Promise<void> }) {
  const [form, setForm] = useState<InvestmentInput>(initial ? { provider: initial.provider, name: initial.name, type: initial.type, principal: initial.principal, currency: initial.currency, annualRate: initial.annualRate, startDate: initial.startDate, maturityDate: initial.maturityDate, frequency: initial.frequency, interestMode: initial.interestMode, yieldBasis: initial.yieldBasis, taxRate: initial.taxRate, statementValue: initial.statementValue, couponMonths: initial.couponMonths } : blank)
  const [tab, setTab] = useState<'manual' | 'statement'>('manual')
  const [parseStatus, setParseStatus] = useState('')
  const [parseError, setParseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [statementLoaded, setStatementLoaded] = useState(false)
  const [fileName, setFileName] = useState('')
  const [candidates, setCandidates] = useState<NonNullable<Awaited<ReturnType<typeof parsePdf>>['candidates']>>([])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [conversionRates,setConversionRates]=useState<Record<string,number>>({...preferences.rates})
  const conversionRate=kesRate(form.currency,conversionRates)
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLElement>('input:not([type=hidden]),button')?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !dialog) return
      const elements = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),a[href]')]
      if (!elements.length) return
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const put = <K extends keyof InvestmentInput>(key: K, value: InvestmentInput[K]) => setForm(prev => ({ ...prev, [key]: value }))
  const preview:Investment={...form,id:initial?.id??'preview',events:initial?.events??[],status:initial?.status??'active',createdAt:initial?.createdAt??'',principal:Number(form.principal)||0,annualRate:Number(form.annualRate)||0}
  const todayEstimate=estimate(preview,new Date()), yearEstimate=estimate(preview,addMonths(new Date(),12))
  const previewUnknown=hasUnknownTerms(form), previewTax=form.yieldBasis==='gross'?1-form.taxRate/100:1
  const previewReady=conversionRate!==null&&[todayEstimate.low,todayEstimate.high,yearEstimate.low,yearEstimate.high].every(v=>Number.isFinite(v*conversionRate))
  const previewFx=conversionRate??0
  const previewEarned=!previewReady?'Confirm currency and enter a valid KES rate':previewUnknown?`Between ${formatMoney(todayEstimate.low*previewTax*previewFx,'KES')} and ${formatMoney(todayEstimate.high*previewTax*previewFx,'KES')}`:formatMoney(todayEstimate.interest*previewTax*previewFx,'KES')
  const previewNext=!previewReady?'Confirm currency and enter a valid KES rate':previewUnknown?`Between ${formatMoney(Math.max(0,yearEstimate.low-todayEstimate.low)*previewTax*previewFx,'KES')} and ${formatMoney(Math.max(0,yearEstimate.high-todayEstimate.high)*previewTax*previewFx,'KES')}`:formatMoney(Math.max(0,yearEstimate.interest-todayEstimate.interest)*previewTax*previewFx,'KES')

  function useTemplate(value:string) {
    if(value==='treasury')setForm(prev=>({...prev,type:'Bond',name:prev.name||'Treasury bond',frequency:'semiannual',interestMode:'paid_out',couponMonths:[]}))
    if(value==='fixed')setForm(prev=>({...prev,type:'Other',name:prev.name||'Fixed deposit',frequency:'at_maturity',interestMode:'paid_out'}))
    if(value==='mmf')setForm(prev=>({...prev,type:'MMF',name:prev.name||'Money market fund',frequency:'daily',interestMode:'paid_out'}))
  }

  function setType(type: InvestmentType) {
    setForm(prev => ({ ...prev, type, name: type === 'MMF' && prev.name === '' ? 'Money Market Fund' : prev.name, frequency: prev.frequency, maturityDate: type === 'MMF' ? null : prev.maturityDate }))
  }
  async function handleFile(file?: File) {
    if (!file) return
    setParseError(''); setParseStatus('Reading PDF locally…'); setFileName(file.name); setStatementLoaded(false)
    try {
      const result = await parsePdf(file)
      const list=result.candidates?.length?result.candidates:[result.fields];setCandidates(list);setCandidateIndex(0)
      const fields = list[0]
      setForm(prev => ({ ...prev,
        currency: fields.currency ?? '',
        provider: fields.provider ?? prev.provider,
        name: fields.name ?? prev.name,
        type: (fields.type as InvestmentType | undefined) ?? prev.type,
        principal: fields.principal ? Number(fields.principal.replaceAll(',', '')) : prev.principal,
        annualRate: fields.annualRate ? Number(fields.annualRate) : prev.annualRate,
        startDate: fields.startDate ?? prev.startDate,
        maturityDate: fields.maturityDate ?? prev.maturityDate,
        frequency: fields.frequency ? normalizeFrequency(fields.frequency) : prev.frequency,
      }))
      const count = Object.entries(fields).filter(([key,value])=>key!=='currencyStatus'&&Boolean(value)).length
      setStatementLoaded(true)
      setParseStatus(count ? `Found ${list.length} possible investment${list.length===1?'':'s'} and ${count} fields for this one. Review each before saving.` : 'Readable text found, but no familiar fields were identified. Fill in details manually.')
    } catch (e) { setParseStatus(''); setParseError(e instanceof Error ? e.message : 'Could not read this PDF.') }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setAttempted(true)
    if(!currencyCodes.includes(form.currency)){setParseError('Confirm the investment currency before saving.');return}
    if(form.currency!=='KES'&&(conversionRate===null||!Number.isFinite(form.principal*conversionRate))){setParseError('Enter a positive, finite conversion rate to KES before saving this investment.');return}
    if (!form.provider.trim() || !form.name.trim() || !Number.isFinite(form.principal) || !(form.principal > 0) || !Number.isFinite(form.annualRate) || form.annualRate < 0 || !form.startDate || (form.maturityDate && form.maturityDate < form.startDate)) return
    setSaving(true)
    try {
      const keep=tab==='statement'&&!initial&&candidateIndex<candidates.length-1
      await onSave({ ...form, provider: form.provider.trim(), name: form.name.trim(), maturityDate: form.maturityDate || null }, initial?.id,keep,conversionRate??undefined)
      if(keep){const nextIndex=candidateIndex+1,fields=candidates[nextIndex];setCandidateIndex(nextIndex);setForm(prev=>({...blank,currency:fields.currency??'',provider:fields.provider??'',name:fields.name??'',type:(fields.type as InvestmentType|undefined)??'Other',principal:fields.principal?Number(fields.principal.replaceAll(',','')):0,annualRate:fields.annualRate?Number(fields.annualRate):0,startDate:fields.startDate??prev.startDate,maturityDate:fields.maturityDate??null,frequency:fields.frequency?normalizeFrequency(fields.frequency):'unknown'}));setParseError('');setParseStatus(`Saved investment ${nextIndex} of ${candidates.length}. Review the next candidate, its currency and its KES conversion rate.`)}
    }
    catch (e) { setParseError(e instanceof Error ? e.message : 'Could not save investment.') }
    finally { setSaving(false) }
  }
  const duplicate=existingItems.some(x=>x.currency===form.currency&&x.name.trim().toLowerCase()===form.name.trim().toLowerCase()&&x.provider.trim().toLowerCase()===form.provider.trim().toLowerCase()&&Math.abs(x.principal-Number(form.principal))<0.01)

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="section-kicker"><Plus size={14} /> PORTFOLIO DETAILS</div><h2 id="modal-title">{initial ? 'Edit investment' : 'Add an investment'}</h2><p>Enter the details you know. You can update them any time.</p></div><button className="icon-button close-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    {!initial && <div className="modal-tabs" role="tablist" aria-label="Choose how to add an investment"><button role="tab" aria-selected={tab === 'manual'} className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}><Pencil size={15} /> Enter manually</button><button role="tab" aria-selected={tab === 'statement'} className={tab === 'statement' ? 'active' : ''} onClick={() => setTab('statement')}><FileText size={15} /> From statement <span className="local-tag">LOCAL</span></button></div>}
    {tab === 'statement' && !initial && <div className="upload-area"><input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={e => void handleFile(e.target.files?.[0])} hidden /><div className="upload-icon"><Upload size={19} /></div><strong>Extract from a PDF statement</strong><p>Text is read in this browser. The file is not uploaded anywhere. Scanned PDFs need manual entry in this prototype.</p><button type="button" className="button button-quiet" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose PDF</button>{fileName && <div className="file-name"><FileText size={14} />{fileName}</div>}{parseStatus && <div className="parse-status" role="status"><BadgeCheck size={15} />{parseStatus}</div>}</div>}
    <form className="investment-form" onSubmit={e => void submit(e)}>{parseError&&<p className="parse-error" role="alert">{parseError}</p>}
      {tab === 'statement' && statementLoaded && <div className="review-banner"><Check size={15} /><span><strong>Review extracted details.</strong> Extraction may be wrong or incomplete. Confirm every value before saving.</span></div>}
      {duplicate&&<div className="duplicate-warning" role="alert"><CircleHelp size={15}/> Possible duplicate: a saved investment has the same provider, name and principal. Confirm before adding.</div>}
      {!initial&&<label className="field template-field"><span>Start from a product template</span><span className="select-wrap"><select defaultValue="" onChange={e=>useTemplate(e.target.value)}><option value="">Choose a template (optional)</option><option value="treasury">Treasury bond · semi-annual coupons</option><option value="fixed">Fixed deposit · at maturity</option><option value="mmf">Money market fund · daily accrual (paid out)</option></select><ChevronDown size={15}/></span></label>}
      <div className="form-section-title"><span>01</span> Investment details</div>
      <div className="form-grid"><label className="field full"><span>Investment or product name <b>*</b></span><input value={form.name} onChange={e => put('name', e.target.value)} placeholder="e.g. Horizon Money Market Fund" required aria-invalid={attempted && !form.name.trim()} /></label>
        <label className="field"><span>Provider / company <b>*</b></span><input value={form.provider} onChange={e => put('provider', e.target.value)} placeholder="e.g. Horizon Capital" required /></label>
        <label className="field"><span>Investment type <b>*</b></span><span className="select-wrap"><select value={form.type} onChange={e => setType(e.target.value as InvestmentType)}><option value="MMF">Money market fund (MMF)</option><option value="Bond">Bond</option><option value="Other">Other income investment</option></select><ChevronDown size={15} /></span></label>
      </div>
      <div className="form-section-title second"><span>02</span> Amount & timing</div>
      <div className="form-grid">{initial?<div className="field"><span>Current principal</span><strong>{formatMoney(estimate(initial,new Date()).principal,initial.currency)}</strong><small>Opening principal: {formatMoney(initial.principal,initial.currency)}. Dated top-ups and withdrawals determine the current amount.</small><div className="ledger-actions"><button type="button" className="text-button" onClick={()=>onRecordEvent(initial,'deposit')}>Add top-up</button><button type="button" className="text-button" onClick={()=>onRecordEvent(initial,'withdrawal')}>Add withdrawal</button></div></div>:<label className="field"><span>Principal amount <b>*</b></span><div className="input-with-prefix"><span>{form.currency}</span><input type="number" min="0.01" step="0.01" value={form.principal || ''} onChange={e => put('principal', Number(e.target.value))} placeholder="10,000.00" required /></div>{form.type === 'Bond' && <small>Enter face value for coupon estimates. Purchase-price yield is not modeled.</small>}</label>}
        <label className="field"><span>Currency <b>*</b></span><span className="select-wrap"><select required disabled={!!initial} value={form.currency} onChange={e => put('currency', e.target.value)}><option value="" disabled>Confirm statement currency</option>{currencyOptions.map(x => <option key={x}>{x}</option>)}</select><ChevronDown size={15} /></span></label>
        <label className="field"><span>Investment start date <b>*</b></span><div className="input-with-icon"><CalendarDays size={15} /><input type="date" disabled={!!initial} value={form.startDate} onChange={e => put('startDate', e.target.value)} required /></div><small>Future start dates are saved as Scheduled and excluded from totals.</small></label>
        <label className="field"><span>Maturity date <small>Optional</small></span><div className="input-with-icon"><CalendarDays size={15} /><input type="date" value={form.maturityDate ?? ''} onChange={e => put('maturityDate', e.target.value || null)} min={form.startDate} /></div></label>
      </div>

      {statementLoaded&&tab==='statement'&&<p className="currency-detection" role="status">{candidates[candidateIndex]?.currencyStatus==='detected'?'Statement currency detected: '+candidates[candidateIndex].currency+'. Confirm it against your statement.':'The statement currency is missing or ambiguous. Select the correct currency above; a dollar sign alone does not identify USD.'}</p>}
      {form.currency&&form.currency!=='KES'&&<div className="investment-fx"><h3>Convert this investment to KES</h3><p>{statementLoaded?'This statement is in '+form.currency+'. ':'This investment is in '+form.currency+'. '}Enter the current rate you want to apply before saving.</p><label className="field"><span>1 {form.currency} = how many KES? <b>*</b></span><div className="input-with-suffix"><input type="number" required min="0.00000001" step="any" value={conversionRates[form.currency]??''} onChange={e=>setConversionRates(prev=>({...prev,[form.currency]:Number(e.target.value)}))} placeholder="Enter conversion rate"/><span>KES</span></div></label><p aria-live="polite">{conversionRate!==null&&Number.isFinite(todayEstimate.principal*conversionRate)?'Principal in KES: '+formatMoney(todayEstimate.principal*conversionRate,'KES'):'Enter a valid rate to preview the KES equivalent.'}</p><small>User-set rate, not a live quote. Saving applies it to all {form.currency} holdings, current totals and projections. The original amount stays in {form.currency}.</small></div>}
      <div className="form-section-title second"><span>03</span> Interest & payout terms</div>
      <div className="form-grid">{initial?<div className="field"><span>Current recorded yield</span><strong>{(initial?currentYield(initial):form.annualRate).toFixed(2)}%</strong><button type="button" className="text-button" onClick={()=>onRecordEvent(initial,'rate_change')}>Record rate change</button></div>:<label className="field"><span>Annual interest rate / yield <b>*</b></span><div className="input-with-suffix"><input type="number" min="0" max="1000" step="0.01" value={form.annualRate || ''} onChange={e => put('annualRate', Number(e.target.value))} placeholder="5.25" required /><span>%</span></div></label>}
        <label className="field"><span>Payment / compounding frequency <small>As stated by provider</small><span className="help-line">Look for “coupon frequency”, “distribution”, or “interest credited” on the statement’s product terms.</span></span><span className="select-wrap"><select value={form.frequency} onChange={e => setForm(prev=>({...prev,frequency:e.target.value as Frequency,couponMonths:[]}))}>{Object.entries(frequencyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={15} /></span><small>Payment dates are estimates: {form.couponMonths.length?`coupon months ${form.couponMonths.join(', ')}, using the start day`:'start-date anniversaries'}. Confirm the provider’s actual schedule. Changing frequency resets coupon months.</small></label>
        <label className="field"><span>Yield amount basis</span><span className="select-wrap"><select value={form.yieldBasis} onChange={e=>put('yieldBasis',e.target.value as 'gross'|'net')}><option value="gross">Gross, before tax</option><option value="net">Net, after tax</option></select><ChevronDown size={15}/></span></label>
        {form.yieldBasis==='gross'&&<label className="field"><span>Estimated tax rate <small>Optional</small></span><div className="input-with-suffix"><input type="number" min="0" max="100" step="0.1" value={form.taxRate||''} onChange={e=>put('taxRate',Number(e.target.value))} placeholder="0"/><span>%</span></div></label>}
        <label className="field full"><span>What happens to interest?</span><div className="radio-cards"><RadioCard selected={form.interestMode === 'unknown'} title="Not sure" description="Show a range from simple accrual to daily compounding." onClick={() => put('interestMode', 'unknown')} /><RadioCard selected={form.interestMode === 'paid_out'} title="Paid out" description="Estimate income separately; principal stays the same." onClick={() => put('interestMode', 'paid_out')} /><RadioCard selected={form.interestMode === 'compound'} title="Reinvested" description="Compound using the frequency selected above." onClick={() => put('interestMode', 'compound')} /></div></label>
      </div>
      {attempted && (!form.provider.trim() || !form.name.trim() || !(form.principal > 0) || (form.maturityDate && form.maturityDate < form.startDate)) && <p className="validation-error" role="alert">Enter a name, provider and positive principal. Maturity must be on or after the start date.</p>}
      <div className="form-preview"><div className="preview-icon"><TrendingUp size={17} /></div><div><strong>Live estimate preview</strong><span>Earned so far: {previewEarned} · Next 12 months: {previewNext}. {previewUnknown?'Range is simple accrual to daily compounding.':form.interestMode==='compound'?(form.frequency==='at_maturity'?'Simple accrual retained until maturity; no interim compounding.':`Compounds ${frequencyLabels[form.frequency].toLowerCase()} using ACT/365.`):'Simple accrual for paid-out interest.'} {form.yieldBasis==='gross'&&form.taxRate>0?` Tax estimate ${form.taxRate}% applied to accrued earnings.`:''}</span></div><CircleHelp size={15} className="preview-help" /></div>
      <div className="modal-footer"><span><LockKeyhole size={13} /> Your information is private</span><div><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : tab==='statement'&&candidateIndex<candidates.length-1?'Save & review next':initial ? 'Save changes' : 'Save investment'} <ArrowRight size={15} /></button></div></div>
    </form></section></div>
}
function RadioCard({ selected, title, description, onClick }: { selected: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" className={`radio-card ${selected ? 'chosen' : ''}`} onClick={onClick} aria-pressed={selected}><span className="radio-indicator">{selected && <span />}</span><strong>{title}</strong><small>{description}</small></button>
}
function EventModal({item,initialKind,onClose,onSave}:{item:Investment;initialKind?:'deposit'|'withdrawal'|'rate_change';onClose:()=>void;onSave:(event:{id:string;date:string;kind:'deposit'|'withdrawal'|'rate_change';amount?:number;annualRate?:number})=>void}){
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const dialog=document.querySelector<HTMLElement>('.event-modal');dialog?.querySelector<HTMLElement>('input,select,button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose()}if(e.key==='Tab'&&dialog){const controls=[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()}},[onClose])
 const [kind,setKind]=useState<'deposit'|'withdrawal'|'rate_change'>(initialKind??'deposit'),[date,setDate]=useState(dateKey(new Date())),[amount,setAmount]=useState(''),[rate,setRate]=useState(''),[error,setError]=useState('')
 const draftAmount=Number(amount),validCashEvent=kind!=='rate_change'&&Number.isFinite(draftAmount)&&draftAmount>0&&Boolean(date)&&!Number.isNaN(Date.parse(date))&&date>=item.startDate&&(!item.maturityDate||date<=item.maturityDate)
 const effectiveAt=new Date(date+'T23:59:59'),beforePrincipal=validCashEvent?estimate(item,effectiveAt).principal:0
 const overdraft=validCashEvent&&kind==='withdrawal'&&draftAmount>beforePrincipal
 const previewPrincipal=validCashEvent&&!overdraft?estimate({...item,events:[...item.events,{id:'draft-cash-event',date,kind,amount:draftAmount}]},effectiveAt).principal:null

 function submit(e:FormEvent){e.preventDefault();const n=Number(kind==='rate_change'?rate:amount);if(!date||!Number.isFinite(n)||(kind==='rate_change'?n<0:n<=0)){setError(kind==='rate_change'?'Enter a valid annual rate.':'Enter a positive amount.');return}try{onSave({id:crypto.randomUUID(),date,kind,...(kind==='rate_change'?{annualRate:n}:{amount:n})})}catch(e){setError(e instanceof Error?e.message:'Could not record event.')}}
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal-card event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title"><div className="modal-header"><div><div className="section-kicker"><ArrowDownUp size={14}/> EVENT LEDGER</div><h2 id="event-title">Record an investment event</h2><p>{item.name} · current principal {formatMoney(estimate(item,new Date()).principal,item.currency)}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><form className="investment-form" onSubmit={submit}><label className="field"><span>Event type</span><span className="select-wrap"><select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="deposit">Top-up / deposit</option><option value="withdrawal">Withdrawal</option><option value="rate_change">Rate change</option></select><ChevronDown size={15}/></span></label><label className="field"><span>Effective date</span><input type="date" min={item.startDate} max={item.maturityDate??undefined} value={date} onChange={e=>setDate(e.target.value)} required/></label>{kind==='rate_change'?<label className="field"><span>New annual rate</span><div className="input-with-suffix"><input type="number" min="0" max="1000" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} placeholder="5.25"/><span>%</span></div></label>:<label className="field"><span>Amount ({item.currency})</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount"/></label>}{previewPrincipal!==null&&<div className="form-preview" aria-live="polite"><div><strong>Principal after this event: {formatMoney(previewPrincipal,item.currency)}</strong><br/><span>{formatMoney(beforePrincipal,item.currency)} {kind==='deposit'?'+':'−'} {formatMoney(draftAmount,item.currency)} · effective {date}. {date>dateKey(new Date())?'This is future-dated; today’s principal will change on that date.':'The investment row and portfolio total update when you record the event.'}</span></div></div>}{overdraft&&<p className="validation-error" role="alert">This withdrawal exceeds the principal available on its effective date.</p>}{kind==='rate_change'&&<p className="settings-note">Yield changes affect earnings; they do not change invested principal.</p>}{error&&<p role="alert" className="validation-error">{error}</p>}<div className="ledger-history"><strong>Event history</strong>{item.events.length?<div className="ledger-table-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Value</th></tr></thead><tbody>{[...item.events].sort((a,b)=>b.date.localeCompare(a.date)).map(x=><tr key={x.id}><td>{x.date}</td><td>{x.kind==='rate_change'?'Rate change':x.kind==='deposit'?'Top-up':'Withdrawal'}</td><td>{x.kind==='rate_change'?`${x.annualRate}%`:formatMoney(x.amount??0,item.currency)}</td></tr>)}</tbody></table></div>:<span>No ledger events yet.</span>}</div><div className="modal-footer"><span>Accrual is recalculated in date order.</span><div><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Record event</button></div></div></form></section></div>
}
function normalizeFrequency(raw: string): Frequency {
  const value = raw.toLowerCase()
  if (value.includes('daily')) return 'daily'; if (value.includes('monthly')) return 'monthly'; if (value.includes('quarterly')) return 'quarterly'; if (value.includes('semi')) return 'semiannual'; if (value.includes('annual')) return 'annual'; if (value.includes('maturity')) return 'at_maturity'; return 'unknown'
}

export default App

