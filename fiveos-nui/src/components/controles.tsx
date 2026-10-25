import { useEffect, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ANCHO_MENU, usePantalla } from '@/components/toaster'
import { useMensajeDelJuego } from '@/hooks/useFiveM'
import { toClient } from '@/lib/fivem'
import { EASE_OUT } from '@/lib/ease'
import { t, msg } from '@/i18n'

export interface FilaControles {
  teclas: string[]
  texto: string
}

export interface GrupoControles {
  id: string
  titulo?: string
  teclas: FilaControles[]
}

export type PosicionControles = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

const POSICIONES: PosicionControles[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

function sanear(grupos: unknown): GrupoControles[] {
  if (!Array.isArray(grupos)) return []
  return grupos.flatMap((g) => {
    if (!g || typeof g !== 'object') return []
    const grupo = g as Partial<GrupoControles>
    const filas = Array.isArray(grupo.teclas)
      ? grupo.teclas.filter(
          (f): f is FilaControles =>
            !!f && Array.isArray(f.teclas) && f.teclas.length > 0 && typeof f.texto === 'string'
        )
      : []
    if (!grupo.id || filas.length === 0) return []
    return [{ id: String(grupo.id), titulo: grupo.titulo ? String(grupo.titulo) : undefined, teclas: filas }]
  })
}

export function useControles() {
  const [grupos, setGrupos] = useState<GrupoControles[]>([])
  const [posicion, setPosicion] = useState<PosicionControles>('bottom-right')

  useMensajeDelJuego<{ grupos?: unknown }>('controles', (d) => setGrupos(sanear(d.grupos)))

  useEffect(() => {
    void (async () => {
      const r = await toClient<{ grupos?: unknown; posicion?: string }>('controles')
      if (!r) return
      setGrupos(sanear(r.grupos))
      if (POSICIONES.includes(r.posicion as PosicionControles)) setPosicion(r.posicion as PosicionControles)
    })()
  }, [])

  return { grupos, posicion }
}

const NOMBRES: Record<string, string> = {
  LSHIFT: 'Shift', RSHIFT: 'Shift', SHIFT: 'Shift',
  LCONTROL: 'Ctrl', RCONTROL: 'Ctrl', LCTRL: 'Ctrl', RCTRL: 'Ctrl', CTRL: 'Ctrl', CONTROL: 'Ctrl',
  LMENU: 'Alt', RMENU: 'Alt', ALT: 'Alt',
  SPACE: msg('Espacio'), SPACEBAR: msg('Espacio'),
  RETURN: 'Enter', ENTER: 'Enter',
  ESCAPE: 'Esc', ESC: 'Esc',
  BACK: msg('Retroceso'), BACKSPACE: msg('Retroceso'),
  TAB: 'Tab', CAPITAL: msg('Bloq Mayús'), CAPSLOCK: msg('Bloq Mayús'),
  PRIOR: msg('Re Pág'), PAGEUP: msg('Re Pág'), NEXT: msg('Av Pág'), PAGEDOWN: msg('Av Pág'),
  DELETE: msg('Supr'), INSERT: msg('Insert'), HOME: msg('Inicio'), END: msg('Fin'),
  UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→',
}

const nombreDe = (tecla: string) => {
  const nombre = NOMBRES[tecla.trim().toUpperCase()]
  return nombre ? t(nombre) : tecla.trim()
}

function Tecla({ children }: { children: string }) {
  const larga = children.length > 1
  return (
    <kbd
      className={
        'inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border ' +
        'bg-muted font-sans text-[11px] font-bold leading-none text-foreground ' +
        (larga ? 'px-1.5' : 'px-1')
      }
      style={{ boxShadow: 'inset 0 -2px 0 rgba(0, 0, 0, 0.35)' }}
    >
      {children}
    </kbd>
  )
}

export function Controles({
  grupos,
  posicion,
  menuAbierto,
}: {
  grupos: GrupoControles[]
  posicion: PosicionControles
  menuAbierto: boolean
}) {
  const reduce = useReducedMotion() ?? false
  const { escala } = usePantalla()
  const [vertical, horizontal] = posicion.split('-') as ['top' | 'bottom', 'left' | 'right']

  const margen = 16 * escala
  const sitio: CSSProperties = {}
  if (vertical === 'top') sitio.top = margen
  else sitio.bottom = margen * 1.5
  if (horizontal === 'right') sitio.right = margen + (menuAbierto ? ANCHO_MENU : 0)
  else sitio.left = margen

  const desde = horizontal === 'right' ? 16 : -16

  return (
    <div className="pointer-events-none fixed z-[110]" style={sitio}>
      <div
        className={'flex flex-col gap-2 ' + (horizontal === 'right' ? 'items-end' : 'items-start')}
        style={{ zoom: escala }}
      >
        <AnimatePresence initial={false}>
          {grupos.map((grupo) => (
            <motion.section
              key={grupo.id}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: desde, filter: 'blur(4px)' }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: desde, filter: 'blur(4px)' }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
              aria-label={grupo.titulo ? t('Controles: {titulo}', { titulo: grupo.titulo }) : t('Controles')}
              className="flex w-max max-w-[calc(100vw-32px)] items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            >
              {grupo.titulo && (
                <header className="flex shrink-0 items-center gap-1.5 border-r border-border bg-muted px-2.5">
                  <img src="./logo.png" alt="" className="size-3.5 object-contain" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                    {grupo.titulo}
                  </span>
                </header>
              )}

              <div className="flex flex-wrap items-center gap-y-1 px-2.5 py-1.5">
                {grupo.teclas.map((fila, i) => (
                  <div
                    key={`${fila.texto}-${i}`}
                    className={'flex items-center gap-1.5 ' + (i > 0 ? 'ml-2.5 border-l border-border pl-2.5' : '')}
                  >
                    <span className="flex items-center gap-1">
                      {fila.teclas.map((tecla, t) => (
                        <Tecla key={`${tecla}-${t}`}>{nombreDe(tecla)}</Tecla>
                      ))}
                    </span>
                    <span className="whitespace-nowrap text-[12.5px] font-semibold leading-tight text-foreground">
                      {fila.texto}
                    </span>
                  </div>
                ))}
              </div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
