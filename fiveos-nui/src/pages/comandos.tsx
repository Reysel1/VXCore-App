import { useMemo, useState } from 'react'
import { ListaDatos } from '@/components/admin/lista-datos'
import { FilaBoton, FilaFormulario } from '@/components/admin/comando'
import { COMANDOS, FILTROS, type BotonExtra, type Filtro } from '@/data/comandos'
import { ejecutarComando, ejecutarRuta } from '@/lib/ejecutar'
import type { Aviso } from '@/components/toaster'
import type { Atajo } from '@/hooks/useAtajos'
import { etiquetaDeTecla } from '@/data/teclas'
import { t, msg } from '@/i18n'

interface Props {
  aviso: Aviso
  toggles: Record<string, boolean>
  onToggle: (key: string) => Promise<{ ok?: boolean; mensaje?: string } | null>
  favoritos: string[]
  onFavorito: (id: string) => void
  onCerrarMenu: () => void
  atajos: Atajo[]
}

export function ComandosPage({ aviso, toggles, onToggle, favoritos, onFavorito, onCerrarMenu, atajos }: Props) {
  const [filtro, setFiltro] = useState<Filtro | 'todo'>('todo')
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return COMANDOS.filter(c => {
      if (filtro !== 'todo' && c.filtro !== filtro) return false
      if (!q) return true
      return t(c.label).toLowerCase().includes(q)
    }).sort((a, b) => {
      const fa = favoritos.includes(a.id) ? 0 : 1
      const fb = favoritos.includes(b.id) ? 0 : 1
      if (fa !== fb) return fa - fb
      return COMANDOS.indexOf(a) - COMANDOS.indexOf(b)
    })
  }, [filtro, busqueda, favoritos])

  const teclaDe = (id: string) => {
    const atajo = atajos.find(a => a.comando === id)
    return atajo && etiquetaDeTecla(atajo.tecla, atajo.etiqueta)
  }

  const extra = (b: BotonExtra) => void ejecutarRuta(b.ruta, b.datos ?? {}, aviso)

  return (
    <ListaDatos
      que={msg("comandos")}
      filtro={filtro}
      filtros={FILTROS}
      onFiltro={setFiltro}
      busqueda={busqueda}
      onBusqueda={setBusqueda}
    >
      {visibles.map(c =>
        c.tipo === 'boton' ? (
          <FilaBoton
            key={c.id}
            comando={c}
            activo={!!(c.toggle && toggles[c.toggle])}
            tecla={teclaDe(c.id)}
            favorito={favoritos.includes(c.id)}
            onFavorito={() => onFavorito(c.id)}
            onEjecutar={() => {
              void (async () => {
                await ejecutarComando(c, undefined, { aviso, toggle: onToggle })
                if (c.cierra) onCerrarMenu()
              })()
            }}
          />
        ) : (
          <FilaFormulario
            key={c.id}
            comando={c}
            tecla={teclaDe(c.id)}
            favorito={favoritos.includes(c.id)}
            onFavorito={() => onFavorito(c.id)}
            onEnviar={cuerpo => void ejecutarRuta(c.ruta, cuerpo, aviso)}
            onExtra={extra}
          />
        )
      )}

      {visibles.length === 0 && (
        <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">{t('Ningún comando coincide.')}</p>
      )}
    </ListaDatos>
  )
}
