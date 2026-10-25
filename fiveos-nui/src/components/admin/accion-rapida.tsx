import { type ReactNode } from 'react'
import { DockItem } from '@/components/beui/dock'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { Rotulo } from '@/components/admin/rotulo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function AccionRapida({
  icono,
  titulo,
  activo = false,
  onClick,
}: {
  icono: ReactNode
  titulo: string
  activo?: boolean
  onClick: () => void
}) {
  return (
    <DockItem>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              aria-label={titulo}
              aria-pressed={activo || undefined}
              onClick={onClick}
              className={cn(
                'size-full rounded-xl text-muted-foreground',
                activo && 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-300'
              )}
            />
          }
        >
          {icono}
        </TooltipTrigger>
        <Rotulo>{titulo}</Rotulo>
      </Tooltip>
    </DockItem>
  )
}

export interface ItemMenu {
  label: string
  onClick: () => void
}

export function MenuRapido({ icono, titulo, items }: { icono: ReactNode; titulo: string; items: ItemMenu[] }) {
  return (
    <DockItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              aria-label={titulo}
              className="size-full rounded-xl text-muted-foreground aria-expanded:text-foreground"
            />
          }
        >
          {icono}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="start" sideOffset={8} className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{titulo}</DropdownMenuLabel>
            {items.map(item => (
              <DropdownMenuItem key={item.label} onClick={item.onClick} className="font-mono text-xs">
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </DockItem>
  )
}
