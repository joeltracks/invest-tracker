import { Activity, ArrowRight, CalendarDays, FileText, Plus, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react'
import type { PortfolioAction } from './lib/entryRoutes'

interface LandingPageProps {
  hasProfile: boolean
  onStart: (action: PortfolioAction) => void
  onLogin: () => void
}

/** Public information only. Personal storage and portfolio tools mount after entry. */
export function LandingPage({ hasProfile, onStart, onLogin }: LandingPageProps) {
  return <div className="public-site" id="home">
    <a className="skip-link" href="#public-content">Skip to content</a>
    <header className="public-header">
      <a className="brand" href="#home" aria-label="Yieldwise home"><span className="brand-mark" aria-hidden="true"><Activity size={21} /></span>yieldwise</a>
      <nav aria-label="Website navigation"><a href="#features">Explore</a><a href="#how-it-works">How it works</a><a href="#estimates">Our estimates</a></nav>
      <div className="public-entry-actions">
        <button type="button" className="text-button" onClick={hasProfile ? () => onStart('dashboard') : onLogin}>{hasProfile ? 'Open portfolio' : 'Log in'}</button>
        {!hasProfile && <button type="button" className="button button-primary" onClick={() => onStart('dashboard')}>Sign up <ArrowRight size={15} aria-hidden="true" /></button>}
      </div>
    </header>
    <main id="public-content">
      <section className="public-hero" aria-labelledby="public-title">
        <div className="public-hero-copy">
          <span className="section-kicker">PERSONAL INVESTING · KENYA</span>
          <h1 id="public-title">Your portfolio,<br />in motion<span className="heading-period">.</span></h1>
          <p>Bring your MMFs, bonds and other income investments into one clear view. Follow your capital, understand your income and plan in Kenyan shillings.</p>
          <div className="public-hero-actions"><button type="button" className="button button-primary" onClick={() => onStart('add-investment')}><Plus size={18} aria-hidden="true" /> Add investment</button><a href="#features">Take a look around <span aria-hidden="true">↓</span></a></div>
          <p className="public-entry-note">{hasProfile ? 'Your portfolio is ready on this device.' : 'Explore freely. Sign up or log in when you’re ready to use the tools.'}</p>
        </div>
        <aside className="public-field-note" aria-labelledby="field-note-title">
          <div className="public-note-top"><span>THE YIELDWISE VIEW</span><span className="public-kes-badge">KES</span></div>
          <h2 id="field-note-title">Different investments.<br />One picture.</h2>
          <div className="public-product-tags"><span><WalletCards size={15} aria-hidden="true" /> Money market funds</span><span>Bonds</span><span>Other income</span></div>
          <ol className="public-capital-path">
            <li><span aria-hidden="true">01</span><div><strong>Capital in</strong><p>Your principal, with dated top-ups and withdrawals.</p></div></li>
            <li><span aria-hidden="true">02</span><div><strong>Terms & time</strong><p>Your stated yield, payout dates and maturity.</p></div></li>
            <li><span aria-hidden="true">03</span><div><strong>A clearer outlook</strong><p>Estimated income, with assumptions in view.</p></div></li>
          </ol>
          <div className="public-note-footer"><span className="status-dot" aria-hidden="true" /> Foreign currencies? You set the KES conversion rate.</div>
        </aside>
      </section>

      <section className="public-features" id="features" aria-labelledby="features-title">
        <div className="public-section-heading"><div><span className="section-kicker">WHAT YOU CAN DO</span><h2 id="features-title">Give every move<br />a place.</h2></div><p>From the first deposit to the next payout, keep the details that make your investment story add up.</p></div>
        <div className="public-feature-grid">
          <article><WalletCards size={22} aria-hidden="true" /><h3>Bring it all together</h3><p>Track MMFs, bonds and other income investments. Keep original currencies and combine values in KES using rates you enter.</p><button type="button" className="text-button" onClick={() => onStart('add-investment')}>Add investment <ArrowRight size={15} aria-hidden="true" /></button></article>
          <article><CalendarDays size={22} aria-hidden="true" /><h3>Follow the changes</h3><p>Record dated top-ups, withdrawals and yield changes. See how each event affects your capital and estimated earnings.</p><button type="button" className="text-button" onClick={() => onStart('investments')}>Manage investments <ArrowRight size={15} aria-hidden="true" /></button></article>
          <article><FileText size={22} aria-hidden="true" /><h3>Start from a statement</h3><p>Read PDF text and scanned pages locally with Tesseract OCR, then review the detected fields before saving.</p><button type="button" className="text-button" onClick={() => onStart('import-statement')}>Import statement <ArrowRight size={15} aria-hidden="true" /></button></article>
          <article><TrendingUp size={22} aria-hidden="true" /><h3>Work toward an income goal</h3><p>Set a monthly KES income target and follow your estimated progress. Separate a planning scenario from a promised return.</p><button type="button" className="text-button" onClick={() => onStart('income-goal')}>Set income goal <ArrowRight size={15} aria-hidden="true" /></button></article>
        </div>
      </section>

      <section className="public-how" id="how-it-works" aria-labelledby="how-title">
        <div className="public-section-heading"><div><span className="section-kicker">A SIMPLE START</span><h2 id="how-title">Look around.<br />Then make it yours.</h2></div></div>
        <ol><li><span>01</span><h3>Sign up or log in</h3><p>Create a profile, or open the one saved on this device. Your private portfolio tools appear after this step.</p></li><li><span>02</span><h3>Add your investments</h3><p>Enter your details or review a PDF import. Confirm the currency, interest terms and any KES conversion rate.</p></li><li><span>03</span><h3>Keep the story current</h3><p>Record changes as they happen. Explore future periods and compare estimates with your provider’s statement.</p></li></ol>
      </section>

      <section className="public-estimates" id="estimates" aria-labelledby="estimates-title">
        <div><span className="section-kicker">CLARITY BEFORE CONFIDENCE</span><h2 id="estimates-title">See the assumptions.<br />Know the limits.</h2><p>Your investment terms matter. Yieldwise makes room for uncertainty instead of turning every holding into a compounded forecast.</p></div>
        <div className="public-explainers">
          <details><summary>How are earnings estimated?</summary><p>Simple accrual uses principal × annual rate × days / 365, calculated between dated events. Explicit compounding uses the entered frequency. Rates are decimals in the formulas; a 10% rate is 0.10. Maturity stops further accrual.</p></details>
          <details><summary>What if I don’t know the interest terms?</summary><p>Unknown interest treatment shows a simple-to-daily-compounded scenario range. It is an illustration, not a probability range or a guaranteed upper or lower return. Payout assumptions remain visible for review.</p></details>
          <details><summary>How do foreign currencies become KES?</summary><p>You enter how many Kenyan shillings equal one unit of the original currency. KES value = original amount × your rate. These are manual quotes, not live exchange rates; the same saved quote applies across projection dates.</p></details>
          <details><summary>Are these guaranteed returns?</summary><p>No. Projections use the dates, yields and assumptions you enter. Provider calculations, taxes, fees, changing yields and market prices may differ. Estimates are not financial advice or guaranteed returns.</p></details>
        </div>
      </section>

      <section className="public-privacy" id="privacy"><ShieldCheck size={23} aria-hidden="true" /><div><h2>Know where your information lives.</h2><p>This version saves profiles and investments only in this browser. Profiles have no password protection or cloud sync. PDF statements are parsed locally, without an external AI or OCR service. Export a JSON backup to keep a copy of your portfolio.</p></div></section>
      <section className="public-final-cta"><span className="section-kicker">YOUR NEXT CHAPTER</span><h2>Make room for a<br />clearer financial picture.</h2><button type="button" className="button button-primary" onClick={() => onStart('dashboard')}>{hasProfile ? 'Open portfolio' : 'Sign up'} <ArrowRight size={17} aria-hidden="true" /></button>{!hasProfile && <p>Already have a profile? <button type="button" className="text-button" onClick={onLogin}>Log in</button></p>}</section>
    </main>
    <footer className="public-footer"><span>© 2026 Yieldwise prototype</span><span>Estimates, not guarantees. Not financial advice.</span></footer>
  </div>
}
