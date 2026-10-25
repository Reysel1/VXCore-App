import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ListaDatos } from '@/components/admin/lista-datos'
import { Expandible } from '@/components/admin/expandible'
import { CampoTexto } from '@/components/admin/campos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { toAgent, toClient } from '@/lib/fivem'
import type { Player } from '@/hooks/useFiveM'
import type { Aviso } from '@/components/toaster'
import { t, msg } from '@/i18n'

interface Props {
  aviso: Aviso
  players: Player[]
  cargando: boolean
  onRefrescar: () => void
}

type FiltroJugadores = 'todos' | 'lag'

const FILTROS: { label: string; value: FiltroJugadores }[] = [
  { label: msg('Todos'), value: 'todos' },
  { label: msg('Con lag'), value: 'lag' },
]

const PING_ALTO = 150

type Confirmable = 'avisar' | 'echar' | 'banear'

const TEXTOS: Record<Confirmable, { titulo: string; ayuda: string; boton: string; ejemplo: string }> = {
  avisar: {
    titulo: msg('Mandarle un aviso'),
    ayuda: msg('Le aparece en pantalla, con tu nombre.'),
    boton: msg('Enviar'),
    ejemplo: msg('Baja el tono en el chat…'),
  },
  echar: {
    titulo: msg('¿Por qué lo expulsas?'),
    ayuda: msg('Lo verá al salir. Una expulsión no queda registrada en el panel.'),
    boton: msg('Expulsar'),
    ejemplo: msg('Incumplimiento de normas…'),
  },
  banear: {
    titulo: msg('¿Por qué lo baneas?'),
    ayuda: msg('Queda registrado en el agente de VXCore, con tu nombre y la fecha.'),
    boton: msg('Continuar'),
    ejemplo: msg('Trampas, insultos graves…'),
  },
}

const DURACIONES = [
  { minutos: 60, label: msg('1 hora') },
  { minutos: 1440, label: msg('1 día') },
  { minutos: 4320, label: msg('3 días') },
  { minutos: 10080, label: msg('1 semana') },
  { minutos: 43200, label: msg('1 mes') },
  { minutos: 0, label: msg('Permanente') },
]

function Historial({ id }: { id: number }) {
  const [estado, setEstado] = useState<'cargando' | 'limpio' | 'sancionado' | 'sin-agente'>('cargando')
  const [detalle, setDetalle] = useState('')

  useEffect(() => {
    let cancelado = false
    void (async () => {
      const r = await toAgent<{ banned?: boolean; message?: string }>('sanciones', { id })
      if (cancelado) return
      if (!r.ok) return setEstado('sin-agente')
      if (r.datos?.banned) {
        setDetalle(String(r.datos.message || ''))
        return setEstado('sancionado')
      }
      setEstado('limpio')
    })()
    return () => {
      cancelado = true
    }
  }, [id])

  if (estado === 'cargando') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />{" "}{t('Consultando su historial…')}
      </p>
    )
  }
  if (estado === 'sin-agente') {
    return <p className="text-xs text-muted-foreground">{t('Sin historial: el agente de VXCore no responde.')}</p>
  }
  if (estado === 'sancionado') {
    return (
      <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
        {t('Ya tiene una sanción activa')}{detalle ? `: ${detalle}` : '.'}
      </p>
    )
  }
  return <p className="text-xs text-muted-foreground">{t('Sin sanciones previas registradas.')}</p>
}

function Ping({ ms }: { ms?: number }) {
  if (typeof ms !== 'number') return null
  const tono = ms >= 200 ? 'text-red-400' : ms >= PING_ALTO ? 'text-amber-400' : 'text-muted-foreground'
  return <span className={cn('shrink-0 text-[11px] font-normal tabular-nums', tono)}>{ms} ms</span>
}

export function JugadoresPage({ aviso, players, cargando, onRefrescar }: Props) {
  const [filtro, setFiltro] = useState<FiltroJugadores>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)
  const [congelados, setCongelados] = useState<Record<number, boolean>>({})
  const [espectando, setEspectando] = useState<number | null>(null)
  const [confirmar, setConfirmar] = useState<{ accion: Confirmable; id: number; vista: 'motivo' | 'duracion' } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [minutos, setMinutos] = useState(1440)

  const refrescarAlMontar = useEffectEvent(onRefrescar)
  useEffect(() => {
    refrescarAlMontar()
  }, [])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return players.filter(p => {
      if (filtro === 'lag' && (p.ping ?? 0) < PING_ALTO) return false
      if (!q) return true
      return String(p.nombre).toLowerCase().includes(q) || String(p.id).includes(q)
    })
  }, [players, busqueda, filtro])

  if (abierto !== null && !players.some(p => p.id === abierto)) setAbierto(null)

  const sobre = async (id: number, accion: string, datos: Record<string, unknown> = {}) => {
    const r = await toClient('jugador', { accion, id, ...datos })
    const falló = !r || r.ok === false
    aviso(r?.mensaje || (falló ? t('El servidor no ha respondido.') : t('Hecho.')), falló ? 'error' : 'success')
    return falló ? null : r
  }

  const confirmarAccion = async () => {
    if (!confirmar) return
    const texto = motivo.trim()
    if (!texto) return aviso(t('Escribe el motivo.'), 'error')

    if (confirmar.accion === 'banear' && confirmar.vista === 'motivo') {
      return setConfirmar({ ...confirmar, vista: 'duracion' })
    }

    if (confirmar.accion === 'banear') {
      const r = await toClient('banear', { id: confirmar.id, motivo: texto, minutos })
      const falló = !r || r.ok === false
      aviso(r?.mensaje || (falló ? t('El servidor no ha respondido.') : t('Baneado.')), falló ? 'error' : 'success')
      setTimeout(onRefrescar, 900)
    } else {
      const clave = confirmar.accion === 'avisar' ? 'mensaje' : 'motivo'
      await sobre(confirmar.id, confirmar.accion, { [clave]: texto })
      if (confirmar.accion === 'echar') setTimeout(onRefrescar, 700)
    }

    setConfirmar(null)
  }

  const abrirConfirmacion = (accion: Confirmable, id: number) => {
    setMotivo('')
    setMinutos(1440)
    setConfirmar({ accion, id, vista: 'motivo' })
  }

  return (
    <>
      <ListaDatos
        que={msg("jugadores")}
        filtro={filtro}
        filtros={FILTROS}
        onFiltro={setFiltro}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
      >
        {cargando && players.length === 0 && (
          <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />{" "}{t('Pidiendo la lista al servidor…')}
          </p>
        )}

        {!cargando && visibles.length === 0 && (
          <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
            {players.length === 0 ? t('No hay nadie conectado.') : t('Nadie coincide.')}
          </p>
        )}

        {visibles.map(p => (
          <Expandible
            key={p.id}
            abierto={abierto === p.id}
            onAlternar={() => setAbierto(v => (v === p.id ? null : p.id))}
            cabecera={
              <>
                <Badge variant="secondary" className="min-w-7 font-mono tabular-nums">
                  {p.id}
                </Badge>
                <span className="min-w-0 flex-1 truncate">
                  {p.nombre}
                  {p.yo && <span className="ml-1 font-normal text-muted-foreground">{t('· tú')}</span>}
                </span>
                {congelados[p.id] && (
                  <Badge variant="outline" className="border-sky-500/30 text-sky-400">
                    {t('congelado')}
                  </Badge>
                )}
                {espectando === p.id && (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                    {t('viéndolo')}
                  </Badge>
                )}
                <Ping ms={p.ping} />
              </>
            }
          >
            {p.yo ? (
              <p className="text-xs text-muted-foreground">
                {t('Eres tú. Lo que puedes hacerte a ti mismo está en la pestaña de comandos.')}
              </p>
            ) : (
              <>
                <Historial id={p.id} />
                <Separator />
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => void sobre(p.id, 'ir')}>
                    Ir
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void sobre(p.id, 'traer')}>
                    {t('Traer')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void sobre(p.id, 'curar')}>
                    {t('Curar')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void (async () => {
                        const siguiente = !congelados[p.id]
                        const r = await sobre(p.id, 'congelar', { valor: siguiente })
                        if (r) setCongelados(prev => ({ ...prev, [p.id]: siguiente }))
                      })()
                    }}
                  >
                    {congelados[p.id] ? t('Soltar') : t('Congelar')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void (async () => {
                        const r = await sobre(p.id, 'espectar')
                        if (r && typeof r.activo === 'boolean') setEspectando(r.activo ? p.id : null)
                      })()
                    }}
                  >
                    {espectando === p.id ? t('Dejar de ver') : t('Espectar')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void (async () => {
                        const r = await toClient('identificadores', { id: p.id })
                        if (!r || r.ok === false) aviso(r?.mensaje || t('No se han podido leer sus identificadores.'), 'error')
                      })()
                    }}
                  >
                    IDs
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => abrirConfirmacion('avisar', p.id)}>
                    {t('Avisar')}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => abrirConfirmacion('echar', p.id)}>
                    {t('Echar')}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => abrirConfirmacion('banear', p.id)}>
                    {t('Banear')}
                  </Button>
                </div>
              </>
            )}
          </Expandible>
        ))}
      </ListaDatos>

      <Modal
        viewId={confirmar ? `${confirmar.accion}-${confirmar.vista}` : null}
        onClose={() => setConfirmar(null)}
        className="max-w-sm"
      >
        {confirmar && confirmar.vista === 'motivo' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="font-heading text-base font-medium">{t(TEXTOS[confirmar.accion].titulo)}</h2>
              <p className="text-[13px] leading-snug text-muted-foreground">{t(TEXTOS[confirmar.accion].ayuda)}</p>
            </div>
            {confirmar.accion !== 'avisar' && <Historial id={confirmar.id} />}
            <CampoTexto
              label={t('Motivo')}
              valor={motivo}
              onCambio={setMotivo}
              placeholder={t(TEXTOS[confirmar.accion].ejemplo)}
              onEnviar={() => void confirmarAccion()}
            />
            <div className="flex justify-end gap-1.5 pt-1">
              <Button variant="ghost" onClick={() => setConfirmar(null)}>
                {t('Cancelar')}
              </Button>
              <Button
                variant={confirmar.accion === 'avisar' ? 'default' : 'destructive'}
                onClick={() => void confirmarAccion()}
              >
                {t(TEXTOS[confirmar.accion].boton)}
              </Button>
            </div>
          </div>
        )}

        {confirmar && confirmar.vista === 'duracion' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="font-heading text-base font-medium">{t('¿Cuánto dura el ban?')}</h2>
              <p className="text-[13px] leading-snug text-muted-foreground">
                {t('Motivo:')}{" "}<span className="text-foreground">{motivo.trim()}</span>
              </p>
            </div>
            <div role="radiogroup" aria-label={t('Duración')} className="grid grid-cols-3 gap-1.5">
              {DURACIONES.map(d => (
                <Button
                  key={d.minutos}
                  role="radio"
                  aria-checked={minutos === d.minutos}
                  variant={minutos === d.minutos ? 'default' : 'outline'}
                  onClick={() => setMinutos(d.minutos)}
                >
                  {t(d.label)}
                </Button>
              ))}
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <Button variant="ghost" onClick={() => setConfirmar({ ...confirmar, vista: 'motivo' })}>
                {t('Atrás')}
              </Button>
              <Button variant="destructive" onClick={() => void confirmarAccion()}>
                {t('Banear')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
