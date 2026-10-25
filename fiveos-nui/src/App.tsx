import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Activity, Bird, Copy, Keyboard, RefreshCw, Users, Wand2, X } from 'lucide-react'
import { Ventana, type Pestana } from '@/components/admin/ventana'
import { AccionRapida, MenuRapido } from '@/components/admin/accion-rapida'
import { Avisos, CONFIG_AVISOS, useAvisos, type AvisoDelJuego, type ConfigAvisos } from '@/components/toaster'
import { Controles, useControles } from '@/components/controles'
import { reproducirSonidoAviso } from '@panel/lib/sonido-aviso'
import { FichaIdentificadores, type Identificadores } from '@/components/identificadores'
import { AtajosPage } from '@/pages/atajos'
import { ComandosPage } from '@/pages/comandos'
import { JugadoresPage } from '@/pages/jugadores'
import { VXCorePage } from '@/pages/vxcore'
import {
  useFavoritos, useMensajeDelJuego, usePanel, usePlayers, useResumen, useToggles,
} from '@/hooks/useFiveM'
import { useAtajos } from '@/hooks/useAtajos'
import { IS_FIVEM, toClient } from '@/lib/fivem'
import { copiar } from '@/lib/copiar'
import { t, msg } from '@/i18n'

const PESTANAS: Pestana[] = [
  { id: 'comandos', titulo: msg('Comandos'), icono: <Wand2 size={17} /> },
  { id: 'jugadores', titulo: msg('Jugadores'), icono: <Users size={17} /> },
  { id: 'atajos', titulo: msg('Atajos de teclado'), icono: <Keyboard size={17} /> },
  { id: 'vxcore', titulo: msg('Estado de VXCore'), icono: <Activity size={17} /> },
]

function App() {
  const [pestana, setPestana] = useState('comandos')
  const { open, close } = usePanel()
  const [configAvisos, setConfigAvisos] = useState<ConfigAvisos>(CONFIG_AVISOS)
  const { toasts, aviso, avisoDelJuego, descartar } = useAvisos(configAvisos.duracion)

  useEffect(() => {
    void (async () => {
      const r = await toClient<Partial<ConfigAvisos>>('avisos')
      if (r?.posicion) setConfigAvisos({ ...CONFIG_AVISOS, ...r } as ConfigAvisos)
    })()
  }, [])

  useMensajeDelJuego<AvisoDelJuego>('notificar', avisoDelJuego)
  useMensajeDelJuego<{ volumen?: number }>('sonido', d => reproducirSonidoAviso(d.volumen))
  const { grupos: controles, posicion: posicionControles } = useControles()
  const { toggles, toggle } = useToggles(open)
  const atajos = useAtajos({ aviso, toggle })
  const { players, refresh, cargando } = usePlayers()
  const { resumen, estado, refrescar } = useResumen(open)
  const { favoritos, alternar } = useFavoritos()
  const [identificadores, setIdentificadores] = useState<Identificadores | null>(null)

  useMensajeDelJuego<{ info?: Identificadores }>('ids', d => {
    if (d.info) setIdentificadores(d.info)
  })

  useEffect(() => {
    if (IS_FIVEM) return
    window.dispatchEvent(new MessageEvent('message', { data: { action: 'toggle', open: true } }))
  }, [])

  const copiarCoords = async (formato: 'crudo' | 'vector3' | 'vector4') => {
    const r = await toClient<{ x?: number; y?: number; z?: number; h?: number }>('donde')
    if (!r || typeof r.x !== 'number' || typeof r.y !== 'number') {
      return aviso(t('No se han podido leer las coordenadas.'), 'error')
    }
    const f = (n: number) => n.toFixed(2)
    const texto =
      formato === 'crudo'
        ? `${f(r.x)}, ${f(r.y)}, ${f(r.z ?? 0)}`
        : formato === 'vector3'
          ? `vector3(${f(r.x)}, ${f(r.y)}, ${f(r.z ?? 0)})`
          : `vector4(${f(r.x)}, ${f(r.y)}, ${f(r.z ?? 0)}, ${f(r.h ?? 0)})`

    const bien = await copiar(texto)
    aviso(bien ? t('Copiado: {texto}', { texto }) : t('No se ha podido copiar.'), bien ? 'success' : 'error')
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <Ventana
            key="ventana"
            pestanas={PESTANAS}
            pestana={pestana}
            onPestana={setPestana}
            rapidas={
              <>
                <AccionRapida
                  icono={<Bird size={17} />}
                  titulo="NoClip"
                  activo={!!toggles.noclip}
                  onClick={() => {
                    void (async () => {
                      const r = await toggle('noclip')
                      if (r?.mensaje) aviso(r.mensaje, r.ok === false ? 'error' : 'success')
                      close()
                    })()
                  }}
                />
                <MenuRapido
                  icono={<Copy size={16} />}
                  titulo={t('Copiar posición')}
                  items={[
                    { label: 'x, y, z', onClick: () => void copiarCoords('crudo') },
                    { label: 'vector3(…)', onClick: () => void copiarCoords('vector3') },
                    { label: 'vector4(…)', onClick: () => void copiarCoords('vector4') },
                  ]}
                />
                <AccionRapida
                  icono={<RefreshCw size={16} />}
                  titulo={t('Actualizar jugadores')}
                  onClick={() => {
                    refresh()
                    refrescar()
                  }}
                />
                <AccionRapida icono={<X size={17} />} titulo={t('Cerrar el menú (Esc)')} onClick={close} />
              </>
            }
          >
            {pestana === 'comandos' && (
              <ComandosPage
                aviso={aviso}
                toggles={toggles}
                onToggle={toggle}
                favoritos={favoritos}
                onFavorito={alternar}
                onCerrarMenu={close}
                atajos={atajos.estado.lista}
              />
            )}
            {pestana === 'jugadores' && (
              <JugadoresPage aviso={aviso} players={players} cargando={cargando} onRefrescar={refresh} />
            )}
            {pestana === 'atajos' && <AtajosPage atajos={atajos} aviso={aviso} />}
            {pestana === 'vxcore' && <VXCorePage resumen={resumen} estado={estado} onRefrescar={refrescar} />}
          </Ventana>
        )}
      </AnimatePresence>

      <FichaIdentificadores info={identificadores} onCerrar={() => setIdentificadores(null)} aviso={aviso} />
      <Controles grupos={controles} posicion={posicionControles} menuAbierto={open} />
      <Avisos toasts={toasts} onDismiss={open ? descartar : undefined} posicion={configAvisos.posicion} menuAbierto={open} />
    </>
  )
}

export default App
