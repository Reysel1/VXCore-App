import { type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { t } from '@/i18n'

export function ListaDatos<T extends string>({
  que,
  filtro,
  filtros,
  onFiltro,
  busqueda,
  onBusqueda,
  children,
}: {
  que: string
  filtro: T
  filtros: { label: string; value: T }[]
  onFiltro: (v: T) => void
  busqueda: string
  onBusqueda: (v: string) => void
  children: ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b p-2.5">
        <Tabs value={filtro} onValueChange={v => onFiltro(v as T)}>
          <TabsList className="w-full">
            {filtros.map(f => (
              <TabsTrigger key={f.value} value={f.value} className="px-2 text-[13px]">
                {t(f.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <InputGroup className="h-9">
          <InputGroupInput
            value={busqueda}
            onChange={e => onBusqueda(e.target.value)}
            placeholder={t('Escribe para filtrar {que}', { que: t(que) })}
            aria-label={t('Filtrar {que}', { que: t(que) })}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-2.5">{children}</div>
      </ScrollArea>
    </div>
  )
}
