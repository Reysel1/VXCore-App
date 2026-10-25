import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Dock, DockItem, DockSeparator } from '@/components/beui/dock'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Rotulo } from '@/components/admin/rotulo'
import { EASE_OUT } from '@/lib/ease'
import { t } from '@/i18n'

export interface Pestana {
  id: string
  titulo: string
  icono: ReactNode
}

export function Ventana({
  pestanas,
  pestana,
  onPestana,
  rapidas,
  children,
}: {
  pestanas: Pestana[]
  pestana: string
  onPestana: (id: string) => void
  rapidas: ReactNode
  children: ReactNode
}) {
  const reduce = useReducedMotion()

  return (
    <TooltipProvider delay={120}>
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.15, ease: EASE_OUT } }}
        transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.7 }}
        className="fixed right-2 top-1/2 flex h-[min(760px,84vh)] w-[500px] max-w-[calc(100vw-16px)] -translate-y-1/2 select-none items-start gap-2"
      >
        <nav aria-label={t('Secciones')} className="shrink-0">
          <Dock size={44} className="flex-col items-center gap-1 bg-card px-1 py-1.5 shadow-xl backdrop-blur-none">
            <DockItem>
              <img src="./logo.png" alt="VXCore" className="size-6 object-contain" />
            </DockItem>

            <DockSeparator className="mx-0 my-0.5 h-px w-6" />

            {pestanas.map(p => {
              const activa = p.id === pestana
              return (
                <DockItem key={p.id} active={activa}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          aria-label={t(p.titulo)}
                          aria-current={activa ? 'page' : undefined}
                          onClick={() => onPestana(p.id)}
                          className={
                            activa
                              ? 'size-full rounded-xl text-foreground hover:bg-transparent'
                              : 'size-full rounded-xl text-muted-foreground'
                          }
                        />
                      }
                    >
                      {p.icono}
                    </TooltipTrigger>
                    <Rotulo>{t(p.titulo)}</Rotulo>
                  </Tooltip>
                </DockItem>
              )
            })}

            <DockSeparator className="mx-0 my-0.5 h-px w-6" />

            {rapidas}
          </Dock>
        </nav>

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          {children}
        </div>
      </motion.div>
    </TooltipProvider>
  )
}
