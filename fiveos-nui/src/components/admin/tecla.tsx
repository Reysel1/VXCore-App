import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

const TAMANOS = {
  sm: { caja: 'h-6 min-w-6 px-1.5 text-[11px] rounded-[6px]', fondo: 2 },
  md: { caja: 'h-10 min-w-10 px-2 text-[14px] rounded-[9px]', fondo: 3 },
  lg: { caja: 'h-[76px] min-w-[76px] px-4 text-[26px] rounded-[16px]', fondo: 5 },
} as const

export type TamanoTecla = keyof typeof TAMANOS

export function Keycap({
  children,
  tamano = 'md',
  pulsada = false,
  apagada = false,
  className,
}: {
  children: ReactNode
  tamano?: TamanoTecla
  pulsada?: boolean
  apagada?: boolean
  className?: string
}) {
  const reduce = useReducedMotion()
  const { caja, fondo } = TAMANOS[tamano]
  const hundida = pulsada ? Math.max(1, fondo - 2) : fondo

  return (
    <motion.kbd
      animate={reduce ? undefined : { y: pulsada ? fondo - hundida : 0 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-sans font-bold leading-none tracking-tight',
        caja,
        apagada ? 'border border-dashed border-foreground/20 text-muted-foreground' : 'border border-foreground/10 text-foreground',
        className
      )}
      style={
        apagada
          ? { background: 'rgba(255, 255, 255, 0.02)' }
          : {
              background: pulsada
                ? 'linear-gradient(180deg, #2b2b2b 0%, #333333 100%)'
                : 'linear-gradient(180deg, #3b3b3b 0%, #2a2a2a 100%)',
              boxShadow: [
                'inset 0 1px 0 rgba(255, 255, 255, 0.10)',
                `inset 0 -${hundida}px 0 rgba(0, 0, 0, 0.45)`,
                pulsada ? '0 0 0 3px rgba(255, 255, 255, 0.12)' : '0 2px 6px rgba(0, 0, 0, 0.35)',
              ].join(', '),
              paddingBottom: hundida,
            }
      }
    >
      {children}
    </motion.kbd>
  )
}
