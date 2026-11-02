import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, BadgeCheck, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, CircleHelp, FileText, Landmark, LockKeyhole, Pencil, Plus, ShieldCheck, Sparkles, Trash2, TrendingUp, Upload, WalletCards, X } from 'lucide-react'
import { addMonths, estimate, estimateLabel, formatMoney } from './lib/calculations'
import { deleteInvestment, loadInvestments, saveInvestment } from './lib/localStore'
import { parsePdf } from './lib/pdfImport'
import type { Frequency, Investment, InvestmentInput, InvestmentType } from './types'

const blank: InvestmentInput = { provider: '', name: '', type: 'MMF', principal: 0, currency: 'USD', annualRate: 0, startDate: new Date().toISOString().slice(0, 10), maturityDate: null, frequency: 'unknown', interestMode: 'unknown' }
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
  const principal = visible.reduce((sum, x) => sum + x.principal, 0)
  const currentValue = visible.reduce((sum, x) => sum + estimate(x, now).value, 0)
  const earned = visible.reduce((sum, x) => sum + estimate(x, now).interest, 0)
  const horizon = addMonths(now, months)
  const futureEarned = visible.reduce((sum, x) => sum + Math.max(0, estimate(x, horizon).interest - estimate(x, now).interest), 0)
  const chartPoints = Array.from({ length: 7 }, (_, index) => {
    const date = addMonths(now, Math.round(months * index / 6))
    return { date, value: visible.reduce((sum, x) => sum + estimate(x, date).value, 0) }
  })
  const hasData = items.length > 0

  async function save(input: InvestmentInput, id?: string) {
    setError('')
    const next = saveInvestment(input, id)
    setItems(next); setModal(false); setEditing(null)
    announce(id ? 'Investment updated' : 'Investment added')
  }
  async function remove(item: Investment) {
    if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) return
    try { setItems(deleteInvestment(item.id)); announce('Investment deleted') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete investment.') }
  }
  function announce(message: string) { setToast(message); window.setTimeout(() => setToast(''), 2800) }
  function openAdd() { setEditing(null); setModal(true) }
  function openEdit(item: Investment) { setEditing(item); setModal(true) }
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
      <nav className="top-nav" aria-label="Main navigation"><a className="active" href="#dashboard">Overview</a><a href="#investments">Investments</a><a href="#methodology">How estimates work</a></nav>
      <div className="top-actions"><span className="mode-pill"><span className="status-dot" />Frontend preview</span><span className="avatar" aria-label="Demo profile">D</span></div>
    </header>

    <main id="dashboard" className="main-content">
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR INCOME PORTFOLIO</div><h1>Good morning<span className="heading-period">.</span></h1><p className="subheading">A calm, clear view of what your investments may earn.</p></div>
        <div className="heading-actions">{hasData && <button className="button button-quiet" onClick={exportCsv}><ArrowDownToLine size={16} /> Export</button>}<button className="button button-primary" onClick={openAdd}><Plus size={17} /> Add investment</button></div>
      </div>
      {error && <div className="alert error-alert" role="alert"><CircleHelp size={18} />{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
      <div className="demo-banner"><ShieldCheck size={17} /><span><strong>Frontend preview.</strong> Sample data and edits are stored in this browser only. Backend sync will be added in a later phase.</span></div>

      {busy ? <div className="skeleton-panel" aria-label="Loading investments"><div /><div /><div /></div> : !hasData ? <EmptyState onAdd={openAdd} demo /> : <>
        <div className="metric-grid">
          <Metric icon={<WalletCards size={17} />} label="Total invested" value={formatMoney(principal, currency)} detail={`${visible.length} ${visible.length === 1 ? 'investment' : 'investments'} in ${currency}`} />
          <Metric icon={<Landmark size={17} />} label="Estimated current value" value={formatMoney(currentValue, currency)} detail={<>{formatMoney(earned, currency)} estimated income to date <span className="tiny-info" title="Gross estimate based on entered rates and terms">ⓘ</span></>} />
          <Metric icon={<TrendingUp size={17} />} label={`Projected earnings · ${months} months`} value={`+${formatMoney(futureEarned, currency)}`} detail="If stated rates stay unchanged" emphasis />
        </div>

        <section className="panel projection-panel" aria-labelledby="projection-title">
          <div className="section-head"><div><div className="section-kicker"><ChartNoAxesCombined size={15} /> PORTFOLIO OUTLOOK</div><h2 id="projection-title">A steady path forward</h2><p className="section-description">Estimated value if principal and entered rates remain unchanged.</p></div>
            <label className="select-wrap compact-select"><span className="sr-only">Projection currency</span><select value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={14} /></label>
          </div>
          <div className="chart-summary"><strong>{formatMoney(currentValue, currency)}</strong><span>today</span><ArrowRight size={15} /><strong className="green-text">{formatMoney(currentValue + futureEarned, currency)}</strong><span>in {months} months</span><div className="period-control" role="group" aria-label="Projection period">{[[3, '3M'], [6, '6M'], [12, '1Y'], [24, '2Y']].map(([m, label]) => <button key={m} className={months === m ? 'selected' : ''} onClick={() => setMonths(Number(m))} aria-pressed={months === m}>{label}</button>)}</div></div>
          <ProjectionChart points={chartPoints} currency={currency} />
          <p className="chart-note"><Sparkles size={13} /> Estimates assume the current entered rate continues. Variable yields can change.</p>
        </section>

        <section className="panel investments-panel" id="investments" aria-labelledby="investments-title">
          <div className="section-head list-head"><div><div className="section-kicker"><WalletCards size={15} /> YOUR HOLDINGS</div><h2 id="investments-title">Investments <span className="count-badge">{visible.length}</span></h2></div><button className="text-button" onClick={openAdd}><Plus size={16} /> Add another</button></div>
          {visible.length === 0 ? <div className="currency-empty">There are no investments in {currency}. Choose another currency or add one.</div> : <>
            <div className="investment-table-wrap"><table className="investment-table"><thead><tr><th>Investment</th><th>Principal</th><th>Annual rate</th><th>Earned to date*</th><th>Maturity</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(item => <InvestmentRow key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} />)}</tbody></table></div>
            <div className="mobile-investments">{visible.map(item => <InvestmentCard key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} />)}</div>
            <div className="table-foot"><span>* Gross estimate from the entered start date to today.</span><a href="#methodology">Calculation notes <ArrowRight size={13} /></a></div>
          </>}
        </section>
      </>}

      <section className="trust-strip" id="methodology"><div className="trust-icon"><LockKeyhole size={17} /></div><div><strong>Built for clarity and privacy</strong><p>Your estimates are based on the details you enter. This is a tracking tool, not financial advice.</p></div><button className="text-button" onClick={() => document.getElementById('formula-details')?.scrollIntoView({ behavior: 'smooth' })}>How we calculate <ArrowRight size={14} /></button></section>
      <section className="methodology" id="formula-details"><details><summary><span><CircleHelp size={15} /> Formulas, assumptions & limitations</span><ChevronDown size={15} /></summary><div className="method-copy"><p><strong>Simple accrual:</strong> principal × annual rate × days elapsed ÷ 365. Used for income marked “paid out” and when terms are unknown.</p><p><strong>Compound estimate:</strong> principal × (1 + annual rate ÷ periods per year)<sup>periods per year × days ÷ 365</sup>. Used only when you explicitly select “Reinvest / compound” and a compounding frequency.</p><p>Dates are counted using ACT/365; projections stop at the maturity date when one is entered. Coupons and payouts are estimates; taxes, fees, price changes, irregular cash flows and provider-specific rounding are excluded. MMF yields are held constant only as a scenario. If payout or compounding terms are unknown, this app does not silently compound.</p><p className="disclaimer">Estimates are illustrative, may differ from provider calculations, are not guaranteed returns, and are not financial advice.</p></div></details></section>
      <footer className="footer"><span>© 2026 Yieldwise prototype</span><span>Simple by design <span className="footer-dot">·</span> Private by default</span></footer>
    </main>
    {modal && <InvestmentModal key={editing?.id ?? 'new'} initial={editing} onClose={() => { setModal(false); setEditing(null) }} onSave={save} />}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>
}

function Metric({ icon, label, value, detail, emphasis = false }: { icon: React.ReactNode; label: string; value: string; detail: React.ReactNode; emphasis?: boolean }) {
  return <article className={`metric-card ${emphasis ? 'metric-emphasis' : ''}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span>{label}</span></div><strong className="metric-value">{value}</strong><div className="metric-detail">{detail}</div></article>
}

function ProjectionChart({ points, currency }: { points: { date: Date; value: number }[]; currency: string }) {
  if (!points.length) return null
  const values = points.map(x => x.value), min = Math.min(...values), max = Math.max(...values), span = max - min || Math.max(max * 0.04, 1)
  const coords = points.map((point, i) => ({ x: 40 + i * 150, y: 124 - ((point.value - min) / span) * 78 }))
  const path = coords.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  const area = `${path} L ${coords.at(-1)?.x} 142 L ${coords[0].x} 142 Z`
  return <div className="chart-wrap"><svg className="chart-svg" viewBox="0 0 940 170" role="img" aria-label={`Estimated portfolio value trend in ${currency}`} preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#65a88e" stopOpacity=".22" /><stop offset="100%" stopColor="#65a88e" stopOpacity="0" /></linearGradient></defs>{[38, 82, 126].map(y => <line key={y} x1="35" y1={y} x2="925" y2={y} className="chart-grid" />)}<path d={area} fill="url(#fill)" /><path d={path} fill="none" className="chart-line" />{coords.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r={i === coords.length - 1 ? 5 : 3.1} className="chart-dot" /></g>)}</svg><div className="chart-labels">{[0, Math.ceil((points.length - 1) / 2), points.length - 1].map(i => <span key={i}>{points[i].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>)}</div></div>
}

function InvestmentRow({ item, onEdit, onDelete }: { item: Investment; onEdit: () => void; onDelete: () => void }) {
  const earned = estimate(item, new Date()).interest
  return <tr><td><div className="investment-identity"><span className={`investment-icon ${item.type.toLowerCase()}`}>{item.type === 'Bond' ? <Landmark size={17} /> : item.type === 'MMF' ? <Activity size={17} /> : <WalletCards size={17} />}</span><div><strong>{item.name}</strong><span>{item.provider} <i>·</i> {item.type === 'Other' ? 'Other income' : item.type}</span></div></div></td><td>{formatMoney(item.principal, item.currency)}</td><td><strong>{item.annualRate.toFixed(2)}%</strong><span className="cell-sub">{item.frequency === 'unknown' ? 'Terms not set' : frequencyLabels[item.frequency]}</span></td><td><strong>{formatMoney(earned, item.currency)}</strong><span className="cell-sub">{item.interestMode === 'unknown' ? 'Simple estimate' : estimateLabel(item)}</span></td><td>{item.maturityDate ? new Date(`${item.maturityDate}T12:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : <span className="muted">—</span>}</td><td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`Delete ${item.name}`} onClick={onDelete}><Trash2 size={15} /></button></div></td></tr>
}
function InvestmentCard({ item, onEdit, onDelete }: { item: Investment; onEdit: () => void; onDelete: () => void }) {
  return <article className="investment-mobile-card"><div className="mobile-card-top"><div className="investment-identity"><span className={`investment-icon ${item.type.toLowerCase()}`}>{item.type === 'Bond' ? <Landmark size={17} /> : <Activity size={17} />}</span><div><strong>{item.name}</strong><span>{item.provider} · {item.type}</span></div></div><div className="row-actions"><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`Delete ${item.name}`} onClick={onDelete}><Trash2 size={15} /></button></div></div><div className="mobile-card-stats"><div><span>Principal</span><strong>{formatMoney(item.principal, item.currency)}</strong></div><div><span>Rate</span><strong>{item.annualRate.toFixed(2)}%</strong></div><div><span>Earned*</span><strong>{formatMoney(estimate(item, new Date()).interest, item.currency)}</strong></div></div><small>{estimateLabel(item)}</small></article>
}
function EmptyState({ onAdd, demo }: { onAdd: () => void; demo: boolean }) {
  return <section className="empty-state panel"><div className="empty-art"><span className="empty-art-ring ring-one" /><span className="empty-art-ring ring-two" /><span className="empty-art-icon"><ChartNoAxesCombined size={28} /></span><span className="floating-dot dot-a" /><span className="floating-dot dot-b" /></div><div className="empty-eyebrow">A LITTLE MORE CLARITY</div><h2>Your investments, in one clear view.</h2><p>Add an income-generating investment to see estimated earnings and a simple projection. You can start with just the details you know.</p><button className="button button-primary" onClick={onAdd}><Plus size={17} /> Add your first investment</button><div className="empty-foot"><ShieldCheck size={14} /> {demo ? 'Your data stays in this browser in demo mode.' : 'Your records are private to your signed-in account.'}</div></section>
}

function InvestmentModal({ initial, onClose, onSave }: { initial: Investment | null; onClose: () => void; onSave: (input: InvestmentInput, id?: string) => Promise<void> }) {
  const [form, setForm] = useState<InvestmentInput>(initial ? { provider: initial.provider, name: initial.name, type: initial.type, principal: initial.principal, currency: initial.currency, annualRate: initial.annualRate, startDate: initial.startDate, maturityDate: initial.maturityDate, frequency: initial.frequency, interestMode: initial.interestMode } : blank)
  const [tab, setTab] = useState<'manual' | 'statement'>('manual')
  const [parseStatus, setParseStatus] = useState('')
  const [parseError, setParseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [statementLoaded, setStatementLoaded] = useState(false)
  const [fileName, setFileName] = useState('')
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

  function setType(type: InvestmentType) {
    setForm(prev => ({ ...prev, type, name: type === 'MMF' && prev.name === '' ? 'Money Market Fund' : prev.name, frequency: prev.frequency, maturityDate: type === 'MMF' ? null : prev.maturityDate }))
  }
  async function handleFile(file?: File) {
    if (!file) return
    setParseError(''); setParseStatus('Reading PDF locally…'); setFileName(file.name); setStatementLoaded(false)
    try {
      const result = await parsePdf(file)
      const fields = result.fields
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
      setParseStatus(count ? `Found ${count} possible field${count === 1 ? '' : 's'}. Review and correct each field below before saving.` : 'Readable text found, but no familiar fields were identified. Fill in details manually.')
    } catch (e) { setParseStatus(''); setParseError(e instanceof Error ? e.message : 'Could not read this PDF.') }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setAttempted(true)
    if (!form.provider.trim() || !form.name.trim() || !(form.principal > 0) || form.annualRate < 0 || !form.startDate || form.startDate > new Date().toISOString().slice(0, 10) || (form.maturityDate && form.maturityDate < form.startDate)) return
    setSaving(true)
    try { await onSave({ ...form, provider: form.provider.trim(), name: form.name.trim(), maturityDate: form.maturityDate || null }, initial?.id) }
    catch (e) { setParseError(e instanceof Error ? e.message : 'Could not save investment.') }
    finally { setSaving(false) }
  }

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="section-kicker"><Plus size={14} /> PORTFOLIO DETAILS</div><h2 id="modal-title">{initial ? 'Edit investment' : 'Add an investment'}</h2><p>Enter the details you know. You can update them any time.</p></div><button className="icon-button close-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    {!initial && <div className="modal-tabs" role="tablist" aria-label="Choose how to add an investment"><button role="tab" aria-selected={tab === 'manual'} className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}><Pencil size={15} /> Enter manually</button><button role="tab" aria-selected={tab === 'statement'} className={tab === 'statement' ? 'active' : ''} onClick={() => setTab('statement')}><FileText size={15} /> From statement <span className="local-tag">LOCAL</span></button></div>}
    {tab === 'statement' && !initial && <div className="upload-area"><input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={e => void handleFile(e.target.files?.[0])} hidden /><div className="upload-icon"><Upload size={19} /></div><strong>Extract from a PDF statement</strong><p>Text is read in this browser. The file is not uploaded anywhere. Scanned PDFs need manual entry in this prototype.</p><button type="button" className="button button-quiet" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose PDF</button>{fileName && <div className="file-name"><FileText size={14} />{fileName}</div>}{parseStatus && <div className="parse-status" role="status"><BadgeCheck size={15} />{parseStatus}</div>}{parseError && <div className="parse-error" role="alert">{parseError}</div>}</div>}
    <form className="investment-form" onSubmit={e => void submit(e)}>
      {tab === 'statement' && statementLoaded && <div className="review-banner"><Check size={15} /><span><strong>Review extracted details.</strong> Extraction may be wrong or incomplete. Confirm every value before saving.</span></div>}
      <div className="form-section-title"><span>01</span> Investment details</div>
      <div className="form-grid"><label className="field full"><span>Investment or product name <b>*</b></span><input value={form.name} onChange={e => put('name', e.target.value)} placeholder="e.g. Horizon Money Market Fund" required aria-invalid={attempted && !form.name.trim()} /></label>
        <label className="field"><span>Provider / company <b>*</b></span><input value={form.provider} onChange={e => put('provider', e.target.value)} placeholder="e.g. Horizon Capital" required /></label>
        <label className="field"><span>Investment type <b>*</b></span><span className="select-wrap"><select value={form.type} onChange={e => setType(e.target.value as InvestmentType)}><option value="MMF">Money market fund (MMF)</option><option value="Bond">Bond</option><option value="Other">Other income investment</option></select><ChevronDown size={15} /></span></label>
      </div>
      <div className="form-section-title second"><span>02</span> Amount & timing</div>
      <div className="form-grid"><label className="field"><span>Principal amount <b>*</b></span><div className="input-with-prefix"><span>{form.currency}</span><input type="number" min="0.01" step="0.01" value={form.principal || ''} onChange={e => put('principal', Number(e.target.value))} placeholder="10,000.00" required /></div>{form.type === 'Bond' && <small>Enter face value for coupon estimates. Purchase-price yield is not modeled.</small>}</label>
        <label className="field"><span>Currency <b>*</b></span><span className="select-wrap"><select value={form.currency} onChange={e => put('currency', e.target.value)}>{currencyOptions.map(x => <option key={x}>{x}</option>)}</select><ChevronDown size={15} /></span></label>
        <label className="field"><span>Investment start date <b>*</b></span><div className="input-with-icon"><CalendarDays size={15} /><input type="date" max={new Date().toISOString().slice(0, 10)} value={form.startDate} onChange={e => put('startDate', e.target.value)} required /></div></label>
        <label className="field"><span>Maturity date <small>Optional</small></span><div className="input-with-icon"><CalendarDays size={15} /><input type="date" value={form.maturityDate ?? ''} onChange={e => put('maturityDate', e.target.value || null)} min={form.startDate} /></div></label>
      </div>
      <div className="form-section-title second"><span>03</span> Interest & payout terms</div>
      <div className="form-grid"><label className="field"><span>Annual interest rate / yield <b>*</b></span><div className="input-with-suffix"><input type="number" min="0" max="1000" step="0.01" value={form.annualRate || ''} onChange={e => put('annualRate', Number(e.target.value))} placeholder="5.25" required /><span>%</span></div></label>
        <label className="field"><span>Payment / compounding frequency <small>As stated by provider</small></span><span className="select-wrap"><select value={form.frequency} onChange={e => put('frequency', e.target.value as Frequency)}>{Object.entries(frequencyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={15} /></span></label>
        <label className="field full"><span>What happens to interest?</span><div className="radio-cards"><RadioCard selected={form.interestMode === 'unknown'} title="Not sure" description="Use simple interest; label estimate approximate." onClick={() => put('interestMode', 'unknown')} /><RadioCard selected={form.interestMode === 'paid_out'} title="Paid out" description="Estimate income separately; principal stays the same." onClick={() => put('interestMode', 'paid_out')} /><RadioCard selected={form.interestMode === 'compound'} title="Reinvested" description="Compound using the frequency selected above." onClick={() => put('interestMode', 'compound')} /></div></label>
      </div>
      {attempted && (!form.provider.trim() || !form.name.trim() || !(form.principal > 0) || form.startDate > new Date().toISOString().slice(0, 10) || (form.maturityDate && form.maturityDate < form.startDate)) && <p className="validation-error" role="alert">Enter a name, provider and positive principal. Start date cannot be in the future; maturity must be on or after the start date.</p>}
      <div className="form-preview"><div className="preview-icon"><TrendingUp size={17} /></div><div><strong>Transparent estimates, your way.</strong><span>{form.interestMode === 'compound' && form.frequency !== 'unknown' && form.frequency !== 'at_maturity' ? `Compounds ${frequencyLabels[form.frequency].toLowerCase()} using ACT/365.` : 'Uses simple interest; no compounding is assumed.'} Rate held constant for projections.</span></div><CircleHelp size={15} className="preview-help" /></div>
      <div className="modal-footer"><span><LockKeyhole size={13} /> Your information is private</span><div><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Save investment'} <ArrowRight size={15} /></button></div></div>
    </form></section></div>
}
function RadioCard({ selected, title, description, onClick }: { selected: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" className={`radio-card ${selected ? 'chosen' : ''}`} onClick={onClick} aria-pressed={selected}><span className="radio-indicator">{selected && <span />}</span><strong>{title}</strong><small>{description}</small></button>
}
function normalizeFrequency(raw: string): Frequency {
  const value = raw.toLowerCase()
  if (value.includes('daily')) return 'daily'; if (value.includes('monthly')) return 'monthly'; if (value.includes('quarterly')) return 'quarterly'; if (value.includes('semi')) return 'semiannual'; if (value.includes('annual')) return 'annual'; if (value.includes('maturity')) return 'at_maturity'; return 'unknown'
}

export default App
