import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, BadgeCheck, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, CircleHelp, FileText, Landmark, LockKeyhole, Pencil, Plus, ShieldCheck, Sparkles, Trash2, TrendingUp, Upload, WalletCards, X, ArrowDownUp } from 'lucide-react'
import { addMonths, estimate, estimateLabel, formatMoney, investmentState, nextPayout } from './lib/calculations'
import { appendEvent, deleteInvestment, loadInvestments, restoreInvestment, saveInvestment, setInvestmentStatus } from './lib/localStore'
import { parsePdf } from './lib/pdfImport'
import type { Frequency, Investment, InvestmentInput, InvestmentType } from './types'

const blank: InvestmentInput = { provider: '', name: '', type: 'MMF', principal: 0, currency: 'USD', annualRate: 0, startDate: new Date().toISOString().slice(0, 10), maturityDate: null, frequency: 'unknown', interestMode: 'unknown', yieldBasis: 'gross', taxRate: 0, statementValue: null, couponMonths: [] }
const frequencyLabels: Record<Frequency, string> = { daily: 'Daily', monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Semiannually', annual: 'Annually', at_maturity: 'At maturity', unknown: 'Not sure' }
const currencyOptions = ['USD', 'EUR', 'GBP', 'KES', 'CAD', 'AUD', 'INR', 'ZAR', 'NGN', 'GHS']

function App() {
  const [items, setItems] = useState<Investment[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [months, setMonths] = useState(12)
  const [currency, setCurrency] = useState('USD')
  const [toast, setToast] = useState('')
  const [undoItem, setUndoItem] = useState<Investment | null>(null)
  const [eventFor, setEventFor] = useState<Investment | null>(null)
  const [eventKind, setEventKind] = useState<'deposit'|'withdrawal'|'rate_change'|undefined>()
  const [sortBy, setSortBy] = useState<'name'|'principal'|'rate'|'earned'|'maturity'>('name')
  const [filterBy, setFilterBy] = useState<'all'|'active'|'scheduled'|'matured'|'closed'>('all')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try { setItems(loadInvestments()); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your investments.') }
    finally { setBusy(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const currencies = useMemo(() => [...new Set(items.map(x => x.currency))], [items])
  useEffect(() => { if (currencies.length && !currencies.includes(currency)) setCurrency(currencies[0]) }, [currencies, currency])
  const visible = items.filter(x => x.currency === currency)
  const now = new Date()
  const eligible = visible.filter(x => ['Active','Matured'].includes(investmentState(x, now)))
  const principal = eligible.reduce((sum, x) => sum + estimate(x, now).principal, 0)
  const currentValue = eligible.reduce((sum, x) => {const e=estimate(x,now);return sum+e.principal+(e.value-e.principal)*(x.yieldBasis==='gross'?1-x.taxRate/100:1)}, 0)
  const horizon = addMonths(now, months)
  const futureEarned = eligible.reduce((sum, x) => sum + Math.max(0, estimate(x, horizon).interest - estimate(x, now).interest) * (x.yieldBasis === 'gross' ? 1 - x.taxRate/100 : 1), 0)
  const unknownTerms=eligible.some(x=>x.interestMode==='unknown'||x.frequency==='unknown')
  const portfolioRange=(date:Date)=>eligible.reduce((range,x)=>{const e=estimate(x,date),factor=x.yieldBasis==='gross'?1-x.taxRate/100:1,isUnknown=x.interestMode==='unknown'||x.frequency==='unknown';const low=isUnknown?e.low:e.value-e.principal,high=isUnknown?e.high:e.value-e.principal;return {low:range.low+e.principal+low*factor,high:range.high+e.principal+high*factor}},{low:0,high:0})
  const futureRange=eligible.reduce((range,x)=>{const a=estimate(x,now),b=estimate(x,horizon),factor=x.yieldBasis==='gross'?1-x.taxRate/100:1,isUnknown=x.interestMode==='unknown'||x.frequency==='unknown';const lo=isUnknown?b.low-a.low:b.interest-a.interest,hi=isUnknown?b.high-a.high:b.interest-a.interest;return {low:range.low+Math.max(0,lo)*factor,high:range.high+Math.max(0,hi)*factor}},{low:0,high:0})
  const nowRange=portfolioRange(now), currentMetric=unknownTerms?`Between ${formatMoney(nowRange.low,currency)} and ${formatMoney(nowRange.high,currency)}`:formatMoney(currentValue,currency)
  const projectedMetric=unknownTerms?`Between +${formatMoney(futureRange.low,currency)} and +${formatMoney(futureRange.high,currency)}`:`+${formatMoney(futureEarned,currency)}`
  const chartPoints = Array.from({ length: 7 }, (_, index) => {
    const date = addMonths(now, Math.round(months * index / 6))
    return { date, value: eligible.reduce((sum, x) => {const e=estimate(x,date);return sum+e.principal+(e.value-e.principal)*(x.yieldBasis==='gross'?1-x.taxRate/100:1)}, 0) }
  })
  const filtered = visible.filter(x => filterBy === 'all' || investmentState(x, now).toLowerCase() === filterBy).sort((a,b)=> {
    if(sortBy==='name') return a.name.localeCompare(b.name)
    if(sortBy==='principal') return estimate(b,now).principal-estimate(a,now).principal
    if(sortBy==='rate') return b.annualRate-a.annualRate
    if(sortBy==='earned') return estimate(b,now).interest-estimate(a,now).interest
    return (a.maturityDate??'9999').localeCompare(b.maturityDate??'9999')
  })
  const weightedRate = eligible.reduce((sum,x)=>sum+estimate(x,now).principal*x.annualRate,0)/(principal||1)
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
      if (payout && payout <= end) rows.push({ id: `${item.id}:payout:${payout.toISOString()}`, date: payout.toISOString().slice(0, 10), kind: 'payout', title: 'Next payout', investment: item.name })
      if (item.maturityDate && new Date(`${item.maturityDate}T12:00:00`) >= now && new Date(`${item.maturityDate}T12:00:00`) <= end) rows.push({ id: `${item.id}:maturity`, date: item.maturityDate, kind: 'maturity', title: 'Maturity', investment: item.name })
    })
    rows.sort((a, b) => a.date.localeCompare(b.date))
    const today = now.toISOString().slice(0, 10)
    return [...rows.filter(x => x.date < today).slice(-3), ...rows.filter(x => x.date >= today).slice(0, 5)]
  }, [visible, months, now])
  const selectedEvent = timelineEvents.find(event => event.id === selectedEventId)
  const hasData = items.length > 0

  async function save(input: InvestmentInput, id?: string, keepOpen=false) {
    setError('')
    const next = saveInvestment(input, id)
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
    const header = ['Provider', 'Investment', 'Type', 'Principal', 'Currency', 'Annual rate (%)', 'Start date', 'Maturity date', 'Frequency', 'Interest treatment']
    const rows = items.map(x => [x.provider, x.name, x.type, x.principal, x.currency, x.annualRate, x.startDate, x.maturityDate ?? '', frequencyLabels[x.frequency], x.interestMode])
    const csv = [header, ...rows].map(row => row.map(v => {
      const raw = String(v), safe = /^[\s]*[=+@\-]/.test(raw) ? `'${raw}` : raw
      return `"${safe.replaceAll('"', '""')}"`
    }).join(',')).join('\r\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'yieldwise-investments.csv'; link.click(); URL.revokeObjectURL(link.href)
  }

  return <div className="app-shell">
    <header className="topbar">
      <a href="#home" className="brand" aria-label="Yieldwise home"><span className="brand-mark"><Activity size={19} strokeWidth={2.5} /></span><span>yieldwise</span></a>
      <nav className="top-nav" aria-label="Main navigation"><a className="active" href="#dashboard">Overview</a><a href="#investments">Investments</a><a href="#formula-details" onClick={e=>{e.preventDefault();const details=document.querySelector<HTMLDetailsElement>('#formula-details details');if(details)details.open=true;document.getElementById('formula-details')?.scrollIntoView({behavior:'smooth'})}}>How estimates work</a></nav>
      <div className="top-actions"><span className="mode-pill"><span className="status-dot" />Frontend preview</span><span className="avatar" aria-label="Demo profile">D</span></div>
    </header>

    <main id="dashboard" className="main-content">
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR INCOME PORTFOLIO</div><h1>Your portfolio, in motion<span className="heading-period">.</span></h1><p className="subheading">See how dates, cash flows and stated terms shape what your investments may earn.</p></div>
        <div className="heading-actions">{hasData && <button className="button button-quiet" onClick={exportCsv}><ArrowDownToLine size={16} /> Export</button>}<button className="button button-primary" onClick={openAdd}><Plus size={17} /> Add investment</button></div>
      </div>
      {error && <div className="alert error-alert" role="alert"><CircleHelp size={18} />{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
      <div className="demo-banner"><ShieldCheck size={17} /><span><strong>Frontend preview.</strong> Sample data and edits are stored in this browser only. Backend sync will be added in a later phase.</span></div>
      {visible.some(x=>investmentState(x)==='Matured')&&<div className="maturity-banner" role="status"><CalendarDays size={17}/><div><strong>Matured: renew or close?</strong><span>{visible.filter(x=>investmentState(x)==='Matured').map(x=>x.name).join(', ')} reached maturity. Review provider options; close records from their row or edit dates/terms to track a renewal.</span></div></div>}

      {busy ? <div className="skeleton-panel" aria-label="Loading investments"><div /><div /><div /></div> : !hasData ? <EmptyState onAdd={openAdd} demo /> : <>
        <div className="metric-grid">
          <Metric icon={<WalletCards size={17} />} label="Total invested" value={formatMoney(principal, currency)} detail={`${eligible.length} active or matured holdings · ${currency}`} />
          <Metric icon={<Landmark size={17} />} label="Estimated current value" value={currentMetric} detail={<>{unknownTerms?'Range reflects unknown interest treatment':'Includes entered dates and terms'} <span className="tiny-info" title="Estimates are scenarios, not guarantees">ⓘ</span></>} />
          <Metric icon={<TrendingUp size={17} />} label={`Projected earnings · ${months} months`} value={projectedMetric} detail={`If rates hold · weighted yield ${weightedRate.toFixed(2)}%`} emphasis />
        </div>

        <section className="panel projection-panel" aria-labelledby="projection-title">
          <div className="section-head"><div><div className="section-kicker"><ChartNoAxesCombined size={15} /> PORTFOLIO OUTLOOK</div><h2 id="projection-title">A steady path forward</h2><p className="section-description">Estimated value if principal and entered rates remain unchanged.</p></div>
            <label className="select-wrap compact-select"><span className="sr-only">Projection currency</span><select value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={14} /></label>
          </div>
            <div className="chart-summary"><strong>{formatMoney(currentValue, currency)}</strong><span>today</span><ArrowRight size={15} /><strong className="green-text">{formatMoney(currentValue + futureEarned, currency)}</strong><span>in {months} months</span><div className="period-control" role="group" aria-label="Projection period">{[[3, '3M'], [6, '6M'], [12, '1Y'], [24, '2Y']].map(([m, label]) => <button key={m} className={months === m ? 'selected' : ''} onClick={() => setMonths(Number(m))} aria-pressed={months === m}>{label}</button>)}</div></div>
          <ProjectionChart points={chartPoints} currency={currency} breakdown={eligible} />
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
            <div className="investment-table-wrap"><table className="investment-table"><thead><tr><th>Investment</th><th>Principal</th><th>Annual rate</th><th>Earned to date*</th><th>Next payout / maturity</th><th>State</th><th>Reconcile</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(item => <InvestmentRow key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} onEvent={() => recordEvent(item)} onCloseInvestment={()=>setItems(setInvestmentStatus(item.id,'closed'))} onReconcile={v=>{const next=saveInvestment({...item,statementValue:v},item.id);setItems(next)}} />)}</tbody></table></div>
            <div className="mobile-investments" role="table" aria-label="Investments">{filtered.map(item => <InvestmentCard key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} onEvent={()=>recordEvent(item)} onReconcile={v=>{const next=saveInvestment({...item,statementValue:v},item.id);setItems(next)}} />)}</div>
            <div className="table-foot"><span>* Gross estimate from the entered start date to today.</span><a href="#formula-details" onClick={e=>{e.preventDefault();openMethodology()}}>Calculation notes <ArrowRight size={13} /></a></div>
          </>}
        </section>
      </>}

      <section className="panel monthly-panel"><div className="section-kicker"><CalendarDays size={15}/> MONTHLY INCOME VIEW</div><h2>Expected payouts this month</h2><div className="monthly-payouts">{eligible.map(x=>({item:x,date:nextPayout(x)})).filter(x=>x.date&&x.date.getMonth()===now.getMonth()&&x.date.getFullYear()===now.getFullYear()).map(({item,date})=><span key={item.id}><strong>{item.name}</strong> · {date?.toLocaleDateString(undefined,{month:'short',day:'numeric'})} · {formatMoney(estimate(item,date!).interest,item.currency)}</span>)}{eligible.every(x=>{const d=nextPayout(x);return !d||d.getMonth()!==now.getMonth()||d.getFullYear()!==now.getFullYear()})&&<span>No known payouts scheduled this month. Check provider terms for exact dates.</span>}</div></section>
      <section className="trust-strip" id="methodology"><div className="trust-icon"><LockKeyhole size={17} /></div><div><strong>Built for clarity and privacy</strong><p>Your estimates are based on the details you enter. This is a tracking tool, not financial advice.</p></div><button className="text-button" onClick={openMethodology}>How we calculate <ArrowRight size={14} /></button></section>
      <section className="methodology" id="formula-details"><details><summary><span><CircleHelp size={15} /> Formulas, assumptions & limitations</span><ChevronDown size={15} /></summary><div className="method-copy"><p><strong>Event ledger:</strong> ACT/365 accrual is calculated between each dated deposit, withdrawal, and rate change. Compound terms apply per-period compounding inside each segment; paid-out terms use simple accrual. Withdrawals reduce balance from their event date.</p><p><strong>Unknown terms:</strong> show a range between simple accrual and daily compounding. These are illustrative bounds, not a probability range. Tax is deducted only for a gross stated yield: net estimate = gross interest × (1 − entered tax rate).</p><p>Scheduled and closed investments are excluded from portfolio totals; matured investments stop accruing on their maturity date and require review. Coupons and payout dates are approximations from the selected frequency. MMF yields are held constant only as a scenario. Price changes, fees, irregular rounding and tax rules are not independently validated.</p><p className="disclaimer">Estimates are illustrative, may differ from provider calculations, are not guaranteed returns, and are not financial advice.</p></div></details></section>
      <footer className="footer"><span>© 2026 Yieldwise prototype</span><span>Simple by design <span className="footer-dot">·</span> Private by default</span></footer>
    </main>
    {modal && <InvestmentModal key={editing?.id ?? 'new'} initial={editing} existingItems={items} onClose={() => { setModal(false); setEditing(null) }} onRecordEvent={(item,kind)=>{setModal(false);recordEvent(item,kind)}} onSave={save} />}
    {eventFor && <EventModal key={`${eventFor.id}-${eventKind??'any'}`} item={eventFor} initialKind={eventKind} onClose={()=>{setEventFor(null);setEventKind(undefined)}} onSave={(event)=>{const updated=appendEvent(eventFor.id,event);setItems(updated);setEventFor(null);setEventKind(undefined);announce('Ledger event recorded')}} />}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}{undoItem&&<button onClick={undoDelete}>Undo</button>}</div>}
  </div>
}

function Metric({ icon, label, value, detail, emphasis = false }: { icon: React.ReactNode; label: string; value: string; detail: React.ReactNode; emphasis?: boolean }) {
  return <article className={`metric-card ${emphasis ? 'metric-emphasis' : ''}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span>{label}</span></div><strong className={`metric-value ${value.startsWith('Between')?'metric-range':''}`}>{value}</strong><div className="metric-detail">{detail}</div></article>
}

function ProjectionChart({ points, currency, breakdown }: { points: { date: Date; value: number }[]; currency: string; breakdown: Investment[] }) {
  const [activePoint, setActivePoint] = useState<number | null>(null)
  if (!points.length) return null
  const values = points.map(x => x.value), min = Math.min(...values), max = Math.max(...values), span = max - min || Math.max(max * 0.04, 1)
  const coords = points.map((point, i) => ({ x: 40 + i * 150, y: 124 - ((point.value - min) / span) * 78 }))
  const path = coords.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  const area = `${path} L ${coords.at(-1)?.x} 142 L ${coords[0].x} 142 Z`
  return <div className="chart-wrap"><div className="chart-tooltip" role="status" aria-live="polite">{activePoint === null ? 'Focus or hover a point to inspect its estimate' : <><strong>{points[activePoint].date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</strong><span>{formatMoney(points[activePoint].value, currency)}</span></>}</div><svg className="chart-svg" viewBox="0 0 940 170" role="img" aria-label={`Estimated portfolio value trend in ${currency}`} preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3159f5" stopOpacity=".2" /><stop offset="100%" stopColor="#3159f5" stopOpacity="0" /></linearGradient></defs>{[38, 82, 126].map(y => <line key={y} x1="35" y1={y} x2="925" y2={y} className="chart-grid" />)}<path d={area} fill="url(#fill)" /><path d={path} fill="none" className="chart-line" />{coords.map((p, i) => <g key={i} className="chart-point" tabIndex={0} role="img" aria-label={`${points[i].date.toLocaleDateString()} estimated value ${formatMoney(points[i].value,currency)}`} onFocus={() => setActivePoint(i)} onBlur={() => setActivePoint(null)} onMouseEnter={() => setActivePoint(i)} onMouseLeave={() => setActivePoint(null)}><circle cx={p.x} cy={p.y} r={i === coords.length - 1 ? 5 : 3.1} className="chart-dot" /><title>{points[i].date.toLocaleDateString()} · {formatMoney(points[i].value,currency)}</title></g>)}</svg><div className="chart-labels">{[0, Math.ceil((points.length - 1) / 2), points.length - 1].map(i => <span key={i}>{points[i].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>)}</div><div className="breakdown-list" aria-label="Projection breakdown">{breakdown.map(x=><span key={x.id}><i />{x.name}: {formatMoney(estimate(x,points.at(-1)!.date).value,x.currency)}</span>)}</div></div>
}

function InvestmentRow({ item, onEdit, onDelete, onEvent, onCloseInvestment, onReconcile }: { item: Investment; onEdit: () => void; onDelete: () => void; onEvent:()=>void; onCloseInvestment:()=>void; onReconcile:(value:number)=>void }) {
  const [statementValue,setStatementValue]=useState(item.statementValue===null?'':String(item.statementValue))
  const earned = estimate(item, new Date()).interest, state=investmentState(item), payout=nextPayout(item)
  const today=estimate(item,new Date()),afterTax=item.yieldBasis==='gross'?1-item.taxRate/100:1
  const reportedValue=today.principal+(today.value-today.principal)*afterTax
  const gap=item.statementValue===null?null:item.statementValue-reportedValue
  return <tr><td><div className="investment-identity"><span className={`investment-icon ${item.type.toLowerCase()}`}>{item.type === 'Bond' ? <Landmark size={17} /> : item.type === 'MMF' ? <Activity size={17} /> : <WalletCards size={17} />}</span><div><strong>{item.name}</strong><span>{item.provider} <i>·</i> {item.type === 'Other' ? 'Other income' : item.type}</span></div></div></td><td>{formatMoney(today.principal, item.currency)}</td><td><strong>{item.annualRate.toFixed(2)}%</strong><span className="cell-sub">{item.frequency === 'unknown' ? 'Terms not set' : frequencyLabels[item.frequency]}</span></td><td><strong>{item.interestMode==='unknown'?`${formatMoney(today.low*afterTax,item.currency)}–${formatMoney(today.high*afterTax,item.currency)}`:formatMoney(earned*afterTax, item.currency)}</strong><span className="cell-sub">{estimateLabel(item)} · {item.yieldBasis==='gross'?'gross':'net'}</span></td><td>{payout?payout.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'—'}{item.maturityDate&&<span className="cell-sub">Maturity {new Date(`${item.maturityDate}T12:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span>}</td><td><span className={`state-tag ${state.toLowerCase()}`}>{state}</span></td><td><label className="sr-only" htmlFor={`statement-${item.id}`}>My statement shows for {item.name}</label><input className="reconcile-input" id={`statement-${item.id}`} type="number" min="0" step="0.01" placeholder="My statement shows X" value={statementValue} onChange={e=>setStatementValue(e.target.value)} onBlur={()=>{if(statementValue!==''&&Number.isFinite(Number(statementValue)))onReconcile(Number(statementValue))}} />{gap!==null&&<span className="cell-sub">Gap {formatMoney(gap,item.currency)}</span>}</td><td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button" aria-label={`Add top-up or withdrawal to ${item.name}`} onClick={onEvent}><ArrowDownUp size={15}/></button><button className="icon-button danger-hover" aria-label={`Delete ${item.name}`} onClick={onDelete}><Trash2 size={15} /></button>{state==='Matured'&&<><button className="text-button" onClick={onEdit}>Renew / update</button><button className="text-button" onClick={onCloseInvestment}>Close</button></>}</div></td></tr>
}
function InvestmentCard({ item, onEdit, onDelete, onEvent, onReconcile }: { item: Investment; onEdit: () => void; onDelete: () => void; onEvent:()=>void; onReconcile:(value:number)=>void }) {
  const [statementValue,setStatementValue]=useState(item.statementValue===null?'':String(item.statementValue))
  const state=investmentState(item), est=estimate(item,new Date()), payout=nextPayout(item)
  return <article className="investment-mobile-card" role="row" aria-label={`${item.name} investment details`}><div className="mobile-card-top" role="cell"><div className="investment-identity"><span className={`investment-icon ${item.type.toLowerCase()}`}>{item.type === 'Bond' ? <Landmark size={17} /> : <Activity size={17} />}</span><div><strong>{item.name}</strong><span>{item.provider} · {item.type} · {state}</span></div></div><div className="row-actions"><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button" aria-label={`Top up or withdraw ${item.name}`} onClick={onEvent}><ArrowDownUp size={15}/></button><button className="icon-button danger-hover" aria-label={`Delete ${item.name}`} onClick={onDelete}><Trash2 size={15} /></button></div></div><div className="mobile-card-stats" role="presentation"><div role="cell"><span>Principal</span><strong>{formatMoney(est.principal, item.currency)}</strong></div><div role="cell"><span>Rate</span><strong>{item.annualRate.toFixed(2)}%</strong></div><div role="cell"><span>Earned*</span><strong>{formatMoney(est.interest, item.currency)}</strong></div></div><div className="mobile-dates" role="cell"><span>Next payout: {payout?.toLocaleDateString()??'Not provided'}</span>{item.maturityDate&&<span>Maturity: {new Date(`${item.maturityDate}T12:00`).toLocaleDateString()}</span>}</div><label className="mobile-reconcile" role="cell">My statement shows <input type="number" min="0" step="0.01" value={statementValue} onChange={e=>setStatementValue(e.target.value)} onBlur={()=>{if(statementValue!=='')onReconcile(Number(statementValue))}} placeholder={item.currency}/> {item.statementValue!==null&&<span>Gap {formatMoney(item.statementValue-est.value,item.currency)}</span>}</label><small role="cell">{estimateLabel(item)}</small></article>
}
function EmptyState({ onAdd, demo }: { onAdd: () => void; demo: boolean }) {
  return <section className="empty-state panel" id="investments"><div className="empty-art"><span className="empty-art-ring ring-one" /><span className="empty-art-ring ring-two" /><span className="empty-art-icon"><ChartNoAxesCombined size={28} /></span><span className="floating-dot dot-a" /><span className="floating-dot dot-b" /></div><div className="empty-eyebrow">A LITTLE MORE CLARITY</div><h2>Your investments, in one clear view.</h2><p>Add an income-generating investment to see estimated earnings and a simple projection. You can start with just the details you know.</p><button className="button button-primary" onClick={onAdd}><Plus size={17} /> Add your first investment</button><div className="empty-foot"><ShieldCheck size={14} /> {demo ? 'Your data stays in this browser in demo mode.' : 'Your records are private to your signed-in account.'}</div></section>
}

function InvestmentModal({ initial, existingItems, onClose, onRecordEvent, onSave }: { initial: Investment | null; existingItems:Investment[]; onClose: () => void; onRecordEvent:(item:Investment,kind:'deposit'|'withdrawal'|'rate_change')=>void; onSave: (input: InvestmentInput, id?: string, keepOpen?:boolean) => Promise<void> }) {
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
  const previewUnknown=form.interestMode==='unknown'||form.frequency==='unknown', previewTax=form.yieldBasis==='gross'?1-form.taxRate/100:1
  const previewEarned=previewUnknown?`Between ${formatMoney(todayEstimate.low*previewTax,form.currency)} and ${formatMoney(todayEstimate.high*previewTax,form.currency)}`:formatMoney(todayEstimate.interest*previewTax,form.currency)
  const previewNext=previewUnknown?`Between ${formatMoney(Math.max(0,yearEstimate.low-todayEstimate.low)*previewTax,form.currency)} and ${formatMoney(Math.max(0,yearEstimate.high-todayEstimate.high)*previewTax,form.currency)}`:formatMoney(Math.max(0,yearEstimate.interest-todayEstimate.interest)*previewTax,form.currency)

  function useTemplate(value:string) {
    if(value==='treasury')setForm(prev=>({...prev,type:'Bond',name:prev.name||'Treasury bond',frequency:'semiannual',interestMode:'paid_out',couponMonths:[6,12]}))
    if(value==='fixed')setForm(prev=>({...prev,type:'Other',name:prev.name||'Fixed deposit',frequency:'at_maturity',interestMode:'compound'}))
    if(value==='mmf')setForm(prev=>({...prev,type:'MMF',name:prev.name||'Money market fund',frequency:'unknown',interestMode:'unknown'}))
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
        provider: fields.provider ?? prev.provider,
        name: fields.name ?? prev.name,
        type: (fields.type as InvestmentType | undefined) ?? prev.type,
        principal: fields.principal ? Number(fields.principal.replaceAll(',', '')) : prev.principal,
        annualRate: fields.annualRate ? Number(fields.annualRate) : prev.annualRate,
        startDate: fields.startDate ?? prev.startDate,
        maturityDate: fields.maturityDate ?? prev.maturityDate,
        frequency: fields.frequency ? normalizeFrequency(fields.frequency) : prev.frequency,
      }))
      const count = Object.values(fields).filter(Boolean).length
      setStatementLoaded(true)
      setParseStatus(count ? `Found ${list.length} possible investment${list.length===1?'':'s'} and ${count} fields for this one. Review each before saving.` : 'Readable text found, but no familiar fields were identified. Fill in details manually.')
    } catch (e) { setParseStatus(''); setParseError(e instanceof Error ? e.message : 'Could not read this PDF.') }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setAttempted(true)
    if (!form.provider.trim() || !form.name.trim() || !(form.principal > 0) || form.annualRate < 0 || !form.startDate || (form.maturityDate && form.maturityDate < form.startDate)) return
    setSaving(true)
    try {
      const keep=tab==='statement'&&!initial&&candidateIndex<candidates.length-1
      await onSave({ ...form, provider: form.provider.trim(), name: form.name.trim(), maturityDate: form.maturityDate || null }, initial?.id,keep)
      if(keep){const nextIndex=candidateIndex+1,fields=candidates[nextIndex];setCandidateIndex(nextIndex);setForm(prev=>({...blank,currency:prev.currency,provider:fields.provider??'',name:fields.name??'',type:(fields.type as InvestmentType|undefined)??'Other',principal:fields.principal?Number(fields.principal.replaceAll(',','')):0,annualRate:fields.annualRate?Number(fields.annualRate):0,startDate:fields.startDate??prev.startDate,maturityDate:fields.maturityDate??null,frequency:fields.frequency?normalizeFrequency(fields.frequency):'unknown'}));setParseStatus(`Saved investment ${nextIndex} of ${candidates.length}. Review the next candidate.`)}
    }
    catch (e) { setParseError(e instanceof Error ? e.message : 'Could not save investment.') }
    finally { setSaving(false) }
  }
  const duplicate=existingItems.some(x=>x.name.trim().toLowerCase()===form.name.trim().toLowerCase()&&x.provider.trim().toLowerCase()===form.provider.trim().toLowerCase()&&Math.abs(x.principal-Number(form.principal))<0.01)

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="section-kicker"><Plus size={14} /> PORTFOLIO DETAILS</div><h2 id="modal-title">{initial ? 'Edit investment' : 'Add an investment'}</h2><p>Enter the details you know. You can update them any time.</p></div><button className="icon-button close-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    {!initial && <div className="modal-tabs" role="tablist" aria-label="Choose how to add an investment"><button role="tab" aria-selected={tab === 'manual'} className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}><Pencil size={15} /> Enter manually</button><button role="tab" aria-selected={tab === 'statement'} className={tab === 'statement' ? 'active' : ''} onClick={() => setTab('statement')}><FileText size={15} /> From statement <span className="local-tag">LOCAL</span></button></div>}
    {tab === 'statement' && !initial && <div className="upload-area"><input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={e => void handleFile(e.target.files?.[0])} hidden /><div className="upload-icon"><Upload size={19} /></div><strong>Extract from a PDF statement</strong><p>Text is read in this browser. The file is not uploaded anywhere. Scanned PDFs need manual entry in this prototype.</p><button type="button" className="button button-quiet" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose PDF</button>{fileName && <div className="file-name"><FileText size={14} />{fileName}</div>}{parseStatus && <div className="parse-status" role="status"><BadgeCheck size={15} />{parseStatus}</div>}{parseError && <div className="parse-error" role="alert">{parseError}</div>}</div>}
    <form className="investment-form" onSubmit={e => void submit(e)}>
      {tab === 'statement' && statementLoaded && <div className="review-banner"><Check size={15} /><span><strong>Review extracted details.</strong> Extraction may be wrong or incomplete. Confirm every value before saving.</span></div>}
      {duplicate&&<div className="duplicate-warning" role="alert"><CircleHelp size={15}/> Possible duplicate: a saved investment has the same provider, name and principal. Confirm before adding.</div>}
      {!initial&&<label className="field template-field"><span>Start from a product template</span><span className="select-wrap"><select defaultValue="" onChange={e=>useTemplate(e.target.value)}><option value="">Choose a template (optional)</option><option value="treasury">Treasury bond · semi-annual coupons</option><option value="fixed">Fixed deposit · at maturity</option><option value="mmf">Money market fund · terms unknown</option></select><ChevronDown size={15}/></span></label>}
      <div className="form-section-title"><span>01</span> Investment details</div>
      <div className="form-grid"><label className="field full"><span>Investment or product name <b>*</b></span><input value={form.name} onChange={e => put('name', e.target.value)} placeholder="e.g. Horizon Money Market Fund" required aria-invalid={attempted && !form.name.trim()} /></label>
        <label className="field"><span>Provider / company <b>*</b></span><input value={form.provider} onChange={e => put('provider', e.target.value)} placeholder="e.g. Horizon Capital" required /></label>
        <label className="field"><span>Investment type <b>*</b></span><span className="select-wrap"><select value={form.type} onChange={e => setType(e.target.value as InvestmentType)}><option value="MMF">Money market fund (MMF)</option><option value="Bond">Bond</option><option value="Other">Other income investment</option></select><ChevronDown size={15} /></span></label>
      </div>
      <div className="form-section-title second"><span>02</span> Amount & timing</div>
      <div className="form-grid">{initial?<div className="field"><span>Current principal</span><strong>{formatMoney(estimate(initial,new Date()).principal,initial.currency)}</strong><div className="ledger-actions"><button type="button" className="text-button" onClick={()=>onRecordEvent(initial,'deposit')}>Add top-up</button><button type="button" className="text-button" onClick={()=>onRecordEvent(initial,'withdrawal')}>Add withdrawal</button></div></div>:<label className="field"><span>Principal amount <b>*</b></span><div className="input-with-prefix"><span>{form.currency}</span><input type="number" min="0.01" step="0.01" value={form.principal || ''} onChange={e => put('principal', Number(e.target.value))} placeholder="10,000.00" required /></div>{form.type === 'Bond' && <small>Enter face value for coupon estimates. Purchase-price yield is not modeled.</small>}</label>}
        <label className="field"><span>Currency <b>*</b></span><span className="select-wrap"><select value={form.currency} onChange={e => put('currency', e.target.value)}>{currencyOptions.map(x => <option key={x}>{x}</option>)}</select><ChevronDown size={15} /></span></label>
        <label className="field"><span>Investment start date <b>*</b></span><div className="input-with-icon"><CalendarDays size={15} /><input type="date" value={form.startDate} onChange={e => put('startDate', e.target.value)} required /></div><small>Future start dates are saved as Scheduled and excluded from totals.</small></label>
        <label className="field"><span>Maturity date <small>Optional</small></span><div className="input-with-icon"><CalendarDays size={15} /><input type="date" value={form.maturityDate ?? ''} onChange={e => put('maturityDate', e.target.value || null)} min={form.startDate} /></div></label>
      </div>
      <div className="form-section-title second"><span>03</span> Interest & payout terms</div>
      <div className="form-grid">{initial?<div className="field"><span>Current recorded yield</span><strong>{form.annualRate.toFixed(2)}%</strong><button type="button" className="text-button" onClick={()=>onRecordEvent(initial,'rate_change')}>Record rate change</button></div>:<label className="field"><span>Annual interest rate / yield <b>*</b></span><div className="input-with-suffix"><input type="number" min="0" max="1000" step="0.01" value={form.annualRate || ''} onChange={e => put('annualRate', Number(e.target.value))} placeholder="5.25" required /><span>%</span></div></label>}
        <label className="field"><span>Payment / compounding frequency <small>As stated by provider</small><span className="help-line">Look for “coupon frequency”, “distribution”, or “interest credited” on the statement’s product terms.</span></span><span className="select-wrap"><select value={form.frequency} onChange={e => put('frequency', e.target.value as Frequency)}>{Object.entries(frequencyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={15} /></span></label>
        <label className="field"><span>Yield amount basis</span><span className="select-wrap"><select value={form.yieldBasis} onChange={e=>put('yieldBasis',e.target.value as 'gross'|'net')}><option value="gross">Gross, before tax</option><option value="net">Net, after tax</option></select><ChevronDown size={15}/></span></label>
        {form.yieldBasis==='gross'&&<label className="field"><span>Estimated tax rate <small>Optional</small></span><div className="input-with-suffix"><input type="number" min="0" max="100" step="0.1" value={form.taxRate||''} onChange={e=>put('taxRate',Number(e.target.value))} placeholder="0"/><span>%</span></div></label>}
        <label className="field full"><span>What happens to interest?</span><div className="radio-cards"><RadioCard selected={form.interestMode === 'unknown'} title="Not sure" description="Use simple interest; label estimate approximate." onClick={() => put('interestMode', 'unknown')} /><RadioCard selected={form.interestMode === 'paid_out'} title="Paid out" description="Estimate income separately; principal stays the same." onClick={() => put('interestMode', 'paid_out')} /><RadioCard selected={form.interestMode === 'compound'} title="Reinvested" description="Compound using the frequency selected above." onClick={() => put('interestMode', 'compound')} /></div></label>
      </div>
      {attempted && (!form.provider.trim() || !form.name.trim() || !(form.principal > 0) || (form.maturityDate && form.maturityDate < form.startDate)) && <p className="validation-error" role="alert">Enter a name, provider and positive principal. Maturity must be on or after the start date.</p>}
      <div className="form-preview"><div className="preview-icon"><TrendingUp size={17} /></div><div><strong>Live estimate preview</strong><span>Earned so far: {previewEarned} · Next 12 months: {previewNext}. {previewUnknown?'Range is simple accrual to daily compounding.':form.interestMode==='compound'?`Compounds ${frequencyLabels[form.frequency].toLowerCase()} using ACT/365.`:'Simple accrual for paid-out interest.'} {form.yieldBasis==='gross'&&form.taxRate>0?` Tax estimate ${form.taxRate}% applied to accrued earnings.`:''}</span></div><CircleHelp size={15} className="preview-help" /></div>
      <div className="modal-footer"><span><LockKeyhole size={13} /> Your information is private</span><div><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : tab==='statement'&&candidateIndex<candidates.length-1?'Save & review next':initial ? 'Save changes' : 'Save investment'} <ArrowRight size={15} /></button></div></div>
    </form></section></div>
}
function RadioCard({ selected, title, description, onClick }: { selected: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" className={`radio-card ${selected ? 'chosen' : ''}`} onClick={onClick} aria-pressed={selected}><span className="radio-indicator">{selected && <span />}</span><strong>{title}</strong><small>{description}</small></button>
}
function EventModal({item,initialKind,onClose,onSave}:{item:Investment;initialKind?:'deposit'|'withdrawal'|'rate_change';onClose:()=>void;onSave:(event:{id:string;date:string;kind:'deposit'|'withdrawal'|'rate_change';amount?:number;annualRate?:number})=>void}){
 const [kind,setKind]=useState<'deposit'|'withdrawal'|'rate_change'>(initialKind??'deposit'),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[amount,setAmount]=useState(''),[rate,setRate]=useState(''),[error,setError]=useState('')
 function submit(e:FormEvent){e.preventDefault();const n=Number(kind==='rate_change'?rate:amount);if(!date||!Number.isFinite(n)||n<=0){setError(kind==='rate_change'?'Enter a valid annual rate.':'Enter a positive amount.');return}if(kind==='withdrawal'&&n>estimate(item,new Date()).principal){setError('Withdrawal is larger than the current principal.');return}onSave({id:crypto.randomUUID(),date,kind,...(kind==='rate_change'?{annualRate:n}:{amount:n})})}
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal-card event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title"><div className="modal-header"><div><div className="section-kicker"><ArrowDownUp size={14}/> EVENT LEDGER</div><h2 id="event-title">Record an investment event</h2><p>{item.name} · current principal {formatMoney(estimate(item,new Date()).principal,item.currency)}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><form className="investment-form" onSubmit={submit}><label className="field"><span>Event type</span><span className="select-wrap"><select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="deposit">Top-up / deposit</option><option value="withdrawal">Withdrawal</option><option value="rate_change">Rate change</option></select><ChevronDown size={15}/></span></label><label className="field"><span>Effective date</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>{kind==='rate_change'?<label className="field"><span>New annual rate</span><div className="input-with-suffix"><input type="number" min="0" max="1000" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} placeholder="5.25"/><span>%</span></div></label>:<label className="field"><span>Amount ({item.currency})</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount"/></label>}{error&&<p role="alert" className="validation-error">{error}</p>}<div className="ledger-history"><strong>Event history</strong>{item.events.length?<div className="ledger-table-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Value</th></tr></thead><tbody>{[...item.events].sort((a,b)=>b.date.localeCompare(a.date)).map(x=><tr key={x.id}><td>{x.date}</td><td>{x.kind==='rate_change'?'Rate change':x.kind==='deposit'?'Top-up':'Withdrawal'}</td><td>{x.kind==='rate_change'?`${x.annualRate}%`:formatMoney(x.amount??0,item.currency)}</td></tr>)}</tbody></table></div>:<span>No ledger events yet.</span>}</div><div className="modal-footer"><span>Accrual is recalculated in date order.</span><div><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Record event</button></div></div></form></section></div>
}
function normalizeFrequency(raw: string): Frequency {
  const value = raw.toLowerCase()
  if (value.includes('daily')) return 'daily'; if (value.includes('monthly')) return 'monthly'; if (value.includes('quarterly')) return 'quarterly'; if (value.includes('semi')) return 'semiannual'; if (value.includes('annual')) return 'annual'; if (value.includes('maturity')) return 'at_maturity'; return 'unknown'
}

export default App

