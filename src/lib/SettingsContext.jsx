import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const DEFAULTS = {
    filament_price_per_kg: 35,
    electricity_per_hour: 0.15,
}

const SettingsContext = createContext({
    settings: DEFAULTS,
    refreshSettings: async () => { },
})

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(DEFAULTS)

    async function refreshSettings() {
        const { data } = await supabase.from('settings').select('key, value')
        if (data?.length > 0) {
            const parsed = {}
            data.forEach(row => {
                const num = parseFloat(row.value)
                parsed[row.key] = isNaN(num) ? row.value : num
            })
            setSettings(prev => ({ ...prev, ...parsed }))
        }
    }

    useEffect(() => { refreshSettings() }, [])

    return (
        <SettingsContext.Provider value={{ settings, refreshSettings }}>
            {children}
        </SettingsContext.Provider>
    )
}

export const useSettings = () => useContext(SettingsContext)