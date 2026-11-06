export type NavigationSection = 'dashboard' | 'investments' | 'formula-details' | 'profile'
export type InvestmentTab = 'manual' | 'statement'

export function navigationSection(hash: string): NavigationSection {
  const section = hash.replace(/^#/, '').split('?')[0]
  return section === 'investments' || section === 'formula-details' || section === 'profile' ? section : 'dashboard'
}

/** The two investment-entry tabs follow the standard horizontal tab keyboard pattern. */
export function investmentTabForKey(current: InvestmentTab, key: string): InvestmentTab | null {
  if (key === 'Home') return 'manual'
  if (key === 'End') return 'statement'
  if (key === 'ArrowLeft' || key === 'ArrowRight') return current === 'manual' ? 'statement' : 'manual'
  return null
}
