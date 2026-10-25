import { type ReactNode } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

export const FILA =
  'flex h-11 w-full items-center gap-2 rounded-lg bg-card px-2.5 text-left text-[13.5px] font-medium ring-1 ring-foreground/10 transition-colors hover:bg-accent'

export function Expandible({
  cabecera,
  abierto,
  onAlternar,
  children,
}: {
  cabecera: ReactNode
  abierto: boolean
  onAlternar: () => void
  children: ReactNode
}) {
  return (
    <Accordion value={abierto ? ['fila'] : []} onValueChange={onAlternar}>
      <AccordionItem value="fila" className={cn('rounded-lg bg-card ring-1 ring-foreground/10', abierto && 'bg-accent/40')}>
        <AccordionTrigger
          className={cn(
            FILA,
            'items-center py-0 ring-0 hover:no-underline',
            abierto && 'rounded-b-none bg-accent'
          )}
        >
          {cabecera}
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-2.5 px-3 pt-3 pb-3 [&_p:not(:last-child)]:mb-0">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
