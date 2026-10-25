import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { toAgent, toClient, type ResumenAgente } from '@/lib/fivem'

export function useMensajeDelJuego<T = Record<string, unknown>>(
  accion: string,
  alRecibir: (datos: T) => void
) {
  const recibir = useEffectEvent(alRecibir)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data || {}
      if (d.action === accion) recibir(d as T)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [accion])
}

const DESPLEGABLE_ABIERTO =
  '[data-slot="popover-content"][data-open], [data-slot="dropdown-menu-content"][data-open]'

export function usePanel() {
  const [open, setOpen] = useState(false)

  useMensajeDelJuego<{ open?: boolean }>('toggle', d => setOpen(!!d.open))

  const close = useCallback(() => {
    setOpen(false)
    toClient('close')
  }, [])

  useEffect(() => {
    if (!open) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector(DESPLEGABLE_ABIERTO)) return
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [open, close])

  return { open, close }
}

export function useToggles(abierto: boolean) {
  const [toggles, setToggles] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!abierto) return
    void toClient<Record<string, boolean>>('estado').then(estado => {
      if (estado) setToggles(estado)
    })
  }, [abierto])

  const toggle = useCallback(async (key: string) => {
    const r = await toClient('accion', { accion: key })
    if (r && typeof r.activo === 'boolean') {
      setToggles(prev => ({ ...prev, [key]: r.activo! }))
    }
    return r
  }, [])

  return { toggles, toggle }
}

export interface Player {
  id: number
  nombre: string
  ping?: number
  yo: boolean
}

export function usePlayers() {
  const [players, setPlayers] = useState<Player[]>([])
  const [cargando, setCargando] = useState(false)

  useMensajeDelJuego<{ players?: Player[] }>('players', d => {
    setPlayers(d.players || [])
    setCargando(false)
  })

  const refresh = useCallback(() => {
    setCargando(true)
    void toClient('jugadores')
  }, [])

  return { players, refresh, cargando }
}

export type EstadoAgente = 'cargando' | 'conectado' | 'sin-agente' | 'sin-permiso'

export function useResumen(abierto: boolean) {
  const [resumen, setResumen] = useState<ResumenAgente | null>(null)
  const [estado, setEstado] = useState<EstadoAgente>('cargando')

  const pedir = useCallback(
    () =>
      toAgent<ResumenAgente>('resumen').then(r => {
        if (r.ok && r.datos) {
          setResumen(r.datos)
          setEstado('conectado')
          return
        }
        setEstado(r.error === 'SIN_PERMISO' ? 'sin-permiso' : 'sin-agente')
      }),
    []
  )

  useEffect(() => {
    if (!abierto) return
    void pedir()
    const id = setInterval(() => void pedir(), 8000)
    return () => clearInterval(id)
  }, [abierto, pedir])

  return { resumen, estado, refrescar: pedir }
}

export function useFavoritos() {
  const [favoritos, setFavoritos] = useState<string[]>([])

  useEffect(() => {
    void (async () => {
      const r = await toClient<{ lista?: string[] }>('favoritos')
      if (Array.isArray(r?.lista)) setFavoritos(r.lista)
    })()
  }, [])

  const alternar = useCallback((id: string) => {
    setFavoritos(prev => {
      const siguiente = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      void toClient('favoritos', { guardar: siguiente })
      return siguiente
    })
  }, [])

  return { favoritos, alternar }
}
