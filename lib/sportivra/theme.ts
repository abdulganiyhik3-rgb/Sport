export type ThemeMode = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'sportivra-theme'

export const THEME_INIT_SCRIPT = `(function(){try{var stored=localStorage.getItem('${THEME_STORAGE_KEY}');var theme=stored==='light'?'light':'dark';var root=document.documentElement;if(theme==='light'){root.classList.remove('dark');root.classList.add('light');root.style.colorScheme='light';}else{root.classList.remove('light');root.classList.add('dark');root.style.colorScheme='dark';}}catch(e){var r=document.documentElement;r.classList.remove('light');r.classList.add('dark');r.style.colorScheme='dark';}})();`

export function readCurrentTheme(): ThemeMode {
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('light')) return 'light'
    if (document.documentElement.classList.contains('dark')) return 'dark'
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') return stored
    } catch {
      // Ignore storage access errors
    }
  }
  return 'dark'
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.classList.remove(theme === 'light' ? 'dark' : 'light')
    root.classList.add(theme)
    root.style.colorScheme = theme

    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        theme === 'light' ? '#f5f7fa' : '#0b1220',
      )
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage write errors (e.g. private browsing)
    }
  }
}
