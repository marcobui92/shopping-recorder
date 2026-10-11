export const TONES = [
  { id: 'hong', nameKey: 'Peach rose', swatch: '#A13958', paper: '#FBF6F5' },
  { id: 'xanh', nameKey: 'Custody green', swatch: '#1E6B44', paper: '#F6F8F4' },
  { id: 'tim', nameKey: 'Lavender', swatch: '#744593', paper: '#F8F6FB' },
  { id: 'bac', nameKey: 'Silver blue', swatch: '#005F99', paper: '#F4F8FA' },
  { id: 'kem', nameKey: 'Cream amber', swatch: '#78431B', paper: '#F9F7F2' },
] as const

export type ToneId = (typeof TONES)[number]['id']

const STORAGE_KEY = 'shopping-recorder-tone'

export function currentTone(): ToneId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && TONES.some((tone) => tone.id === stored)) return stored as ToneId
  } catch { /* preference is optional */ }
  return 'hong'
}

export function applyTone(id: ToneId) {
  try { localStorage.setItem(STORAGE_KEY, id) } catch { /* preference is optional */ }
  document.documentElement.setAttribute('data-tone', id)
  const option = TONES.find((tone) => tone.id === id)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (option && meta) meta.setAttribute('content', option.paper)
}
