import { type ReactNode } from 'react'
import { TooltipContent } from '@/components/ui/tooltip'

export function Rotulo({ children }: { children: ReactNode }) {
  return (
    <TooltipContent
      side="left"
      className="bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 *:bg-popover *:fill-popover"
    >
      {children}
    </TooltipContent>
  )
}
