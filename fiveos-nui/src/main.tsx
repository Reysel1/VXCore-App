import { StrictMode, useEffect, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { IS_FIVEM, toClient } from '@/lib/fivem'
import { getLocale, isLocale, onLocaleChange, setLocale } from '@/i18n'
import './index.css'

if (!IS_FIVEM) document.documentElement.classList.add('vx-preview')

function Raiz() {
  useSyncExternalStore(onLocaleChange, getLocale)

  useEffect(() => {
    const aplicar = (valor: unknown) => {
      if (!isLocale(valor)) return
      setLocale(valor)
    }

    const alMensaje = (e: MessageEvent) => {
      if (e.data?.action === 'idioma') aplicar(e.data.locale)
    }
    window.addEventListener('message', alMensaje)

    if (IS_FIVEM) {
      void toClient<{ locale?: string }>('idioma').then(r => aplicar(r?.locale))
    } else {
      aplicar(new URLSearchParams(window.location.search).get('lang'))
    }

    return () => window.removeEventListener('message', alMensaje)
  }, [])

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>
)
