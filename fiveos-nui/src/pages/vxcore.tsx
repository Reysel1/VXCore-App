import { type ReactNode } from 'react'
import { AlertTriangle, Ban, Boxes, Cpu, RefreshCw, ShieldOff, Unplug, Users } from 'lucide-react'
import { AnimatedCircularProgressBar } from '@/components/magicui/animated-circular-progress-bar'
import { NumberTicker } from '@/components/magicui/number-ticker'
import { Loader } from '@/components/beui/loader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { ResumenAgente } from '@/lib/fivem'
import type { EstadoAgente } from '@/hooks/useFiveM'
import { t, msg } from '@/i18n'

interface Props {
  resumen: ResumenAgente | null
  estado: EstadoAgente
  onRefrescar: () => void
}

const ROTULOS: Record<EstadoAgente, { texto: string; punto: string; color: string }> = {
  cargando: { texto: msg('Conectando…'), punto: 'bg-muted-foreground', color: 'text-muted-foreground' },
  conectado: { texto: msg('Agente conectado'), punto: 'bg-emerald-400', color: 'text-emerald-400' },
  'sin-agente': { texto: msg('El agente no responde'), punto: 'bg-amber-400', color: 'text-amber-400' },
  'sin-permiso': { texto: msg('Sin permiso'), punto: 'bg-red-400', color: 'text-red-400' },
}

function Cifra({ icono, valor, sufijo, rotulo }: { icono: ReactNode; valor: number; sufijo?: string; rotulo: string }) {
  return (
    <Card size="sm" className="gap-1.5">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs [&_svg]:size-3.5">
          {icono}
          <span className="truncate">{rotulo}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-baseline gap-1">
        <NumberTicker value={valor} className="font-heading text-2xl font-semibold leading-none tracking-tight" />
        {sufijo && <span className="text-xs text-muted-foreground">{sufijo}</span>}
      </CardContent>
    </Card>
  )
}

function tonoDe(porcentaje: number) {
  if (porcentaje >= 90) return 'var(--destructive)'
  if (porcentaje >= 70) return '#ffb900'
  return 'var(--primary)'
}

function Medidor({ rotulo, porcentaje, detalle }: { rotulo: string; porcentaje: number; detalle: string }) {
  const valor = Math.max(0, Math.min(100, porcentaje))

  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <AnimatedCircularProgressBar
        value={valor}
        gaugePrimaryColor={tonoDe(valor)}
        gaugeSecondaryColor="var(--muted)"
        className="size-24 text-lg tabular-nums"
      />
      <div className="min-w-0 space-y-0.5">
        <div className="text-[13px] font-medium">{rotulo}</div>
        <div className="text-[11px] leading-snug text-muted-foreground">{detalle}</div>
      </div>
    </div>
  )
}

function duracion(segundos: number): string {
  const dias = Math.floor(segundos / 86400)
  const horas = Math.floor((segundos % 86400) / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  if (dias > 0) return `${dias} ${dias === 1 ? 'día' : 'días'} y ${horas} h`
  if (horas > 0) return t('{horas} h {minutos} min', { horas, minutos })
  return t('{minutos} min', { minutos })
}

export function VXCorePage({ resumen, estado, onRefrescar }: Props) {
  const r = ROTULOS[estado]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <span className={cn('size-2 shrink-0 rounded-full', r.punto)} />
        <span className={cn('min-w-0 flex-1 truncate text-[13px] font-medium', r.color)}>{t(r.texto)}</span>
        {resumen?.version && (
          <Badge variant="outline" className="font-mono">
            v{resumen.version}
          </Badge>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onRefrescar} aria-label={t('Actualizar')} title={t('Actualizar')}>
          <RefreshCw />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {estado === 'sin-permiso' && (
          <Aparte icono={<ShieldOff />} titulo={t('Sin permiso para consultar al agente')} onReintentar={onRefrescar}>
            {t('Puedes abrir el menú pero tu cuenta no tiene el ACE')}{" "}<code className="font-mono">{t('vxcore.menu')}</code>{" "}{t('con el que el servidor pregunta al agente. Pídeselo a quien administre el servidor.')}
          </Aparte>
        )}

        {estado === 'sin-agente' && (
          <Aparte icono={<Unplug />} titulo={t('El agente de VXCore no responde')} onReintentar={onRefrescar}>
            {t('Sin él no hay resumen, los baneos que pongas aquí no quedarán registrados y el historial de sanciones saldrá vacío. El resto del menú sigue funcionando: comprueba que VXCore esté abierto en la máquina del servidor.')}
          </Aparte>
        )}

        {estado === 'cargando' && !resumen && (
          <div className="grid place-items-center py-12">
            <Loader variant="dots" size={22} label={t('Cargando el estado del servidor')} />
          </div>
        )}

        {resumen && estado === 'conectado' && (
          <div className="space-y-2">
            {resumen.juego.obsoleto && (
              <Alert className={cn(CON_ICONO, 'border-amber-500/25 bg-amber-500/10 text-amber-400')}>
                <AlertTriangle />
                <AlertTitle className="col-start-2">{t('Datos sin actualizar')}</AlertTitle>
                <AlertDescription className="col-start-2 text-amber-400/80">
                  {t('El recurso del juego lleva')}{" "}
                  {resumen.juego.latido === null ? t('un rato') : `${resumen.juego.latido} s`}{" "}{t('sin dar señales. Lo de abajo es la última foto que llegó, no la de ahora.')}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Cifra
                icono={<Users />}
                valor={resumen.juego.jugadores}
                sufijo={`/ ${resumen.juego.maximo}`}
                rotulo={t('Jugadores')}
              />
              <Cifra icono={<Boxes />} valor={resumen.juego.recursos} rotulo={t('Recursos')} />
              <Cifra icono={<Ban />} valor={resumen.sanciones.activas} rotulo={t('Baneos')} />
            </div>

            <Card size="sm">
              <CardHeader>
                <CardDescription className='flex items-center gap-1.5 text-xs [&_svg]:size-3.5'>
                  <Cpu />
                  {t('La máquina del servidor')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {resumen.maquina ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Medidor
                      rotulo={t('Procesador')}
                      porcentaje={resumen.maquina.cpu}
                      detalle={t('{nucleos} núcleos · encendida desde hace {duracion}', { nucleos: resumen.maquina.nucleos, duracion: duracion(resumen.maquina.encendida) })}
                    />
                    <Medidor
                      rotulo={t('Memoria')}
                      porcentaje={resumen.maquina.memoria}
                      detalle={t('{memoriaGb} GB de {memoriaTotalGb} GB en uso', { memoriaGb: resumen.maquina.memoriaGb, memoriaTotalGb: resumen.maquina.memoriaTotalGb })}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('El agente no ha podido leer la carga de la máquina. No afecta a nada más del menú.')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardContent>
                <dl className="space-y-2 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('Último latido')}</dt>
                    <dd className="tabular-nums">
                      {resumen.juego.latido === null ? t('todavía ninguno') : t('hace {latido} s', { latido: resumen.juego.latido })}
                    </dd>
                  </div>
                  <Separator />
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('Aforo')}</dt>
                    <dd className="tabular-nums">
                      {resumen.juego.jugadores} de {resumen.juego.maximo}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

const CON_ICONO = 'grid-cols-[auto_1fr] gap-x-2'

function Aparte({
  icono,
  titulo,
  children,
  onReintentar,
}: {
  icono: ReactNode
  titulo: string
  children: ReactNode
  onReintentar: () => void
}) {
  return (
    <Alert className={CON_ICONO}>
      {icono}
      <AlertTitle className="col-start-2">{titulo}</AlertTitle>
      <AlertDescription className="col-start-2 space-y-3">
        <p className="leading-relaxed">{children}</p>
        <Button size="sm" variant="secondary" onClick={onReintentar}>
          {t('Reintentar')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
