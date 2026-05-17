import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext({
    theme: 'light',
    setTheme: () => {},
    isDark: false,
    toggleTheme: () => {},
})

export function ThemeProvider({ children }) {
    // 1. Check local storage first, then default to system preferences
    const [theme, setThemeState] = useState(() => {
        const saved = localStorage.getItem('theme')
        if (saved) return saved
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        return systemPrefersDark ? 'dark' : 'light'
    })

    const isDark = theme === 'dark'

    // 2. Synchronize theme with local storage & document root
    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') {
            root.classList.add('dark')
            localStorage.setItem('theme', 'dark')
        } else {
            root.classList.remove('dark')
            localStorage.setItem('theme', 'light')
        }
    }, [theme])

    // 3. Listen to system preference changes if no manual choice is saved
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const handleChange = (e) => {
            const saved = localStorage.getItem('theme')
            if (!saved) {
                setThemeState(e.matches ? 'dark' : 'light')
            }
        }
        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
    }, [])

    function setTheme(newTheme) {
        if (newTheme === 'dark' || newTheme === 'light') {
            setThemeState(newTheme)
        }
    }

    function toggleTheme() {
        setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'))
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme, isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useTheme = () => useContext(ThemeContext)
