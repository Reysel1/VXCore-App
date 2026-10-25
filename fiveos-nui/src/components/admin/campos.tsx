import { useId, useMemo, useState } from 'react'
import { ChevronsUpDown, Minus, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RangeSlider } from '@/components/beui/range-slider'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import type { Opcion } from '@/data/opciones'
import { t } from '@/i18n'

function Rotulo({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
      {children}
    </Label>
  )
}

export function CampoTexto({
  label,
  valor,
  onCambio,
  placeholder,
  maximo,
  onEnviar,
  invalido = false,
}: {
  label: string
  valor: string
  onCambio: (v: string) => void
  placeholder?: string
  maximo?: number
  onEnviar?: () => void
  invalido?: boolean
}) {
  const id = useId()

  return (
    <div className="space-y-1.5">
      <Rotulo htmlFor={id}>{label}</Rotulo>
      <Input
        id={id}
        value={valor}
        maxLength={maximo}
        placeholder={placeholder}
        aria-invalid={invalido || undefined}
        onChange={e => onCambio(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && onEnviar) onEnviar()
        }}
      />
    </div>
  )
}

export function CampoNumero({
  label,
  valor,
  onCambio,
  min,
  max,
  paso = 1,
  invalido = false,
}: {
  label: string
  valor: number
  onCambio: (v: number) => void
  min: number
  max: number
  paso?: number
  invalido?: boolean
}) {
  const id = useId()
  const limitar = (n: number) => Math.min(max, Math.max(min, n))

  return (
    <div className="space-y-1.5">
      <Rotulo htmlFor={id}>{label}</Rotulo>
      <InputGroup>
        <InputGroupInput
          id={id}
          type="number"
          value={valor}
          min={min}
          max={max}
          step={paso}
          aria-invalid={invalido || undefined}
          onChange={e => onCambio(limitar(Number(e.target.value)))}
          className="tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={t('Menos')} onClick={() => onCambio(limitar(valor - paso))}>
            <Minus />
          </InputGroupButton>
          <InputGroupButton size="icon-xs" aria-label={t('Más')} onClick={() => onCambio(limitar(valor + paso))}>
            <Plus />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

export function CampoDeslizador({
  label,
  valor,
  onCambio,
  min,
  max,
  paso = 1,
  sufijo = '',
}: {
  label: string
  valor: number
  onCambio: (v: number) => void
  min: number
  max: number
  paso?: number
  sufijo?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Rotulo>{label}</Rotulo>
        <span className="text-xs tabular-nums text-foreground">
          {valor}
          {sufijo}
        </span>
      </div>
      <RangeSlider
        value={valor}
        onValueChange={onCambio}
        min={min}
        max={max}
        step={paso}
        aria-label={label}
        formatValueText={v => `${v}${sufijo}`}
        className="h-8"
      />
    </div>
  )
}

export function CampoCasilla({
  label,
  valor,
  onCambio,
}: {
  label: string
  valor: boolean
  onCambio: (v: boolean) => void
}) {
  const id = useId()

  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <Label htmlFor={id} className="text-[13px] font-normal">
        {label}
      </Label>
      <Switch id={id} checked={valor} onCheckedChange={v => onCambio(v)} />
    </div>
  )
}

export function CampoSelect({
  label,
  valor,
  onCambio,
  opciones,
  libre = false,
  placeholder = t('Elige una opción'),
  invalido = false,
}: {
  label: string
  valor: string
  onCambio: (v: string) => void
  opciones: Opcion[]
  libre?: boolean
  placeholder?: string
  invalido?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const elegida = opciones.find(o => o.value === valor)
  const escrito = busqueda.trim()

  const filtradas = useMemo(() => {
    const q = escrito.toLowerCase()
    const lista = q
      ? opciones.filter(o => t(o.label).toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
      : opciones
    return lista.slice(0, 60)
  }, [opciones, escrito])

  const elegir = (v: string) => {
    onCambio(v)
    setBusqueda('')
    setAbierto(false)
  }

  return (
    <div className="space-y-1.5">
      <Rotulo>{label}</Rotulo>
      <div className="flex gap-1">
        <Popover
          open={abierto}
          onOpenChange={o => {
            setAbierto(o)
            if (!o) setBusqueda('')
          }}
        >
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                aria-invalid={invalido || undefined}
                className="min-w-0 flex-1 justify-between font-normal"
              />
            }
          >
            <span className={cn('min-w-0 truncate', !valor && 'text-muted-foreground')}>
              {valor ? (elegida?.label ?? valor) : placeholder}
            </span>
            <ChevronsUpDown className="text-muted-foreground" />
          </PopoverTrigger>

          <PopoverContent align="start" className="w-(--anchor-width) min-w-56 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                value={busqueda}
                onValueChange={setBusqueda}
                placeholder={libre ? t('Busca o escribe el nombre…') : t('Buscar…')}
                aria-label={t('Buscar opción')}
              />
              <CommandList className="max-h-[200px]">
                {filtradas.map(o => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    data-checked={o.value === valor}
                    onSelect={() => elegir(o.value)}
                  >
                    <span className="min-w-0 truncate">{t(o.label)}</span>
                  </CommandItem>
                ))}

                {libre && escrito && filtradas.length === 0 && (
                  <CommandItem value={`libre:${escrito}`} onSelect={() => elegir(escrito)}>
                    {t('Usar «{escrito}» de todos modos', { escrito })}
                  </CommandItem>
                )}

                <CommandEmpty>{t('Nada coincide.')}</CommandEmpty>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {valor && (
          <Button variant="ghost" size="icon" aria-label={t('Vaciar')} onClick={() => onCambio('')}>
            <X />
          </Button>
        )}
      </div>
    </div>
  )
}
