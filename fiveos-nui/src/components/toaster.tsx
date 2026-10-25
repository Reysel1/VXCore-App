import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AlertCircle, Bell, Check, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type AnimatedToast,
  type ToastStatus,
} from '@/components/beui/animated-toast-stack'

export type Aviso = (texto: string, estado?: ToastStatus) => void

export interface AvisoDelJuego {
  titulo?: string
  texto?: string
  tipo?: string
  duracion?: number
}

export type PosicionAvisos = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface ConfigAvisos {
  posicion: PosicionAvisos
  duracion: number
}

export const CONFIG_AVISOS: ConfigAvisos = { posicion: 'top-center', duracion: 5000 }

const TIPOS: Record<string, ToastStatus> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
  inform: 'info',
}

export function useAvisos(duracionPorDefecto = CONFIG_AVISOS.duracion) {
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({
    defaultDuration: 3200,
    limit: 4,
  })

  const aviso = useCallback<Aviso>((texto, estado = 'neutral') => {
    if (!texto) return
    showToast({ title: texto, status: estado })
  }, [showToast])

  const avisoDelJuego = useCallback((a: AvisoDelJuego) => {
    const titulo = a.titulo?.trim()
    const texto = a.texto?.trim()
    if (!titulo && !texto) return
    showToast({
      title: titulo || texto,
      description: titulo ? texto : undefined,
      status: TIPOS[a.tipo ?? ''] ?? 'info',
      duration: a.duracion && a.duracion > 0 ? a.duracion : duracionPorDefecto,
    })
  }, [showToast, duracionPorDefecto])

  return useMemo(
    () => ({ toasts, aviso, avisoDelJuego, descartar: dismissToast }),
    [toasts, aviso, avisoDelJuego, dismissToast]
  )
}

export const ANCHO_MENU = 508
const ANCHO_BASE = 480
const MARGEN_BASE = 16

function medir() {
  return {
    escala: Math.min(2, Math.max(0.85, window.innerHeight / 1080)),
    ancho: window.innerWidth,
  }
}

export function usePantalla() {
  const [pantalla, setPantalla] = useState(medir)
  useEffect(() => {
    const alCambiar = () => setPantalla(medir())
    window.addEventListener('resize', alCambiar)
    return () => window.removeEventListener('resize', alCambiar)
  }, [])
  return pantalla
}

const ESTILO_TIPO: Record<ToastStatus, { icono: LucideIcon; color: string; fondo: string }> = {
  neutral: { icono: Bell, color: 'text-muted-foreground', fondo: 'bg-muted' },
  info: { icono: Info, color: 'text-sky-400', fondo: 'bg-sky-500/10' },
  loading: { icono: Info, color: 'text-sky-400', fondo: 'bg-sky-500/10' },
  success: { icono: Check, color: 'text-emerald-400', fondo: 'bg-emerald-500/10' },
  warning: { icono: TriangleAlert, color: 'text-amber-400', fondo: 'bg-amber-500/10' },
  error: { icono: AlertCircle, color: 'text-red-400', fondo: 'bg-red-500/10' },
}

function AvisoCompacto({ toast }: { toast: AnimatedToast }) {
  const estilo = ESTILO_TIPO[toast.status ?? 'neutral'] ?? ESTILO_TIPO.neutral
  const Icono = estilo.icono
  const titulo = toast.description ? toast.title : null
  const mensaje = toast.description ?? toast.title

  return (
    <div className="flex items-stretch">
      <div className={`flex shrink-0 items-center gap-1.5 border-r border-border px-2.5 ${estilo.fondo}`}>
        <Icono className={`size-3.5 shrink-0 ${estilo.color}`} strokeWidth={2.5} />
        {titulo ? (
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-foreground">
            {titulo}
          </span>
        ) : null}
      </div>

      <p className="line-clamp-3 min-w-0 break-words px-2.5 py-1.5 text-[12.5px] font-semibold leading-snug text-foreground">
        {mensaje}
      </p>
    </div>
  )
}

export function Avisos({
  toasts,
  onDismiss,
  posicion,
  menuAbierto,
}: {
  toasts: ReturnType<typeof useAvisos>['toasts']
  onDismiss?: (id: string) => void
  posicion: PosicionAvisos
  menuAbierto: boolean
}) {
  const { escala, ancho: anchoPantalla } = usePantalla()
  const [vertical, horizontal] = posicion.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right']

  const libre = menuAbierto ? Math.max(0, anchoPantalla - ANCHO_MENU) : anchoPantalla
  const margen = MARGEN_BASE * escala
  const ancho = Math.max(220, Math.min(ANCHO_BASE * escala, libre - margen * 2))

  const sitio: CSSProperties = { width: ancho }
  if (vertical === 'top') sitio.top = margen
  else sitio.bottom = margen * 1.5
  if (horizontal === 'left') sitio.left = margen
  if (horizontal === 'right') sitio.right = margen + (menuAbierto ? ANCHO_MENU : 0)
  if (horizontal === 'center') {
    sitio.left = libre / 2
    sitio.transform = 'translateX(-50%)'
  }

  return (
    <div className="pointer-events-none fixed z-[120]" style={sitio}>
      <div style={{ zoom: escala }}>
        <AnimatedToastStack
          toasts={toasts}
          onDismiss={onDismiss}
          position={posicion}
          placement="static"
          maxVisible={4}
          className="w-full max-w-none"
          classNames={{
            root:
              horizontal === 'center' ? 'items-center' : horizontal === 'left' ? 'items-start' : 'items-end',
            item: 'w-max max-w-full',
            surface: 'rounded-xl bg-card p-0 backdrop-blur-none shadow-xl',
          }}
          renderToast={(toast) => <AvisoCompacto toast={toast} />}
        />
      </div>
    </div>
  )
}
