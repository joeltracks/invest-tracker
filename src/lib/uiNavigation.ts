export type NavigationSection = 'dashboard' | 'investments' | 'formula-details' | 'profile' | 'contact'

export function navigationSection(hash: string): NavigationSection {
  const section = hash.replace(/^#/, '').split('?')[0]
  return section === 'investments' || section === 'formula-details' || section === 'profile' || section === 'contact' ? section : 'dashboard'
}
