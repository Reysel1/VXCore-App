import { useCallback, useEffect, useRef, useState } from 'react'
import { useMensajeDelJuego } from '@/hooks/useFiveM'
import { toClient } from '@/lib/fivem'
import { ejecutarComando } from '@/lib/ejecutar'
import { COMANDOS } from '@/data/comandos'
import type { Valor } from '@/components/admin/comando'
import type { Aviso } from '@/components/toaster'
import { t } from '@/i18n'

export interface Atajo {
  id: string
  comando: string
  valores?: Record<string, Valor>
  tecla: string
  etiqueta: string
  control: number
}

export interface EstadoAtajos {
  activos: boolean
  lista: Atajo[]
}

const MAXIMO_POR_DEFECTO = 12

export function useAtajos({
  aviso,
  toggle,
}: {
  aviso: Aviso
  toggle: (key: string) => Promise<{ ok?: boolean; mensaje?: string } | null>
}) {
  const [estado, setEstado] = useState<EstadoAtajos>({ activos: true, lista: [] })
  const [maximo, setMaximo] = useState(MAXIMO_POR_DEFECTO)
  const [teclaMenu, setTeclaMenu] = useState<string | null>(null)
  const [permitidos, setPermitidos] = useState(true)
  const [disparado, setDisparado] = useState<string | null>(null)

  const actual = useRef({ estado, aviso, toggle })
  useEffect(() => {
    actual.current = { estado, aviso, toggle }
  })

  useEffect(() => {
    void (async () => {
      const r = await toClient<{
        activos?: boolean
        lista?: Atajo[]
        maximo?: number
        teclaMenu?: string
        permitidos?: boolean
      }>('atajos')
      if (!r) return
      setEstado({ activos: r.activos !== false, lista: Array.isArray(r.lista) ? r.lista : [] })
      if (typeof r.maximo === 'number' && r.maximo > 0) setMaximo(r.maximo)
      if (typeof r.teclaMenu === 'string' && r.teclaMenu) setTeclaMenu(r.teclaMenu)
      if (r.permitidos === false) setPermitidos(false)
    })()
  }, [])

  const guardar = useCallback((siguiente: EstadoAtajos) => {
    setEstado(siguiente)
    void toClient('atajos', { guardar: siguiente })
  }, [])

  const poner = useCallback(
    (atajo: Atajo) => {
      const { estado: e } = actual.current
      const sinChoques = e.lista.filter(a => a.id === atajo.id || a.tecla !== atajo.tecla)
      const lista = sinChoques.some(a => a.id === atajo.id)
        ? sinChoques.map(a => (a.id === atajo.id ? atajo : a))
        : [...sinChoques, atajo]
      guardar({ ...e, lista })
    },
    [guardar]
  )

  const quitar = useCallback(
    (id: string) => {
      const { estado: e } = actual.current
      guardar({ ...e, lista: e.lista.filter(a => a.id !== id) })
    },
    [guardar]
  )

  const alternarActivos = useCallback(
    (activos: boolean) => {
      guardar({ ...actual.current.estado, activos })
    },
    [guardar]
  )

  useMensajeDelJuego<{ id?: string }>('atajo', d => {
    const { estado: e, aviso: avisar, toggle: alternar } = actual.current
    if (!e.activos) return

    const atajo = e.lista.find(a => a.id === d.id)
    if (!atajo) return

    const comando = COMANDOS.find(c => c.id === atajo.comando)
    if (!comando) {
      avisar(t('Ese atajo apunta a una acción que ya no existe. Bórralo en el menú.'), 'error')
      return
    }

    setDisparado(atajo.id)
    void ejecutarComando(comando, atajo.valores, { aviso: avisar, toggle: alternar })
  })

  useEffect(() => {
    if (!disparado) return
    const id = setTimeout(() => setDisparado(null), 700)
    return () => clearTimeout(id)
  }, [disparado])

  return { estado, maximo, teclaMenu, permitidos, disparado, poner, quitar, alternarActivos }
}
