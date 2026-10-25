import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  AlertTriangle, ArrowLeft, Car, Check, ChevronRight, Info, Keyboard, Pencil, Plus, Search, Server, Trash2, User, Wand2,
  type LucideIcon,
} from 'lucide-react'
import { Keycap } from '@/components/admin/tecla'
import { CamposDelComando, montarCuerpo, valoresIniciales, type Valor } from '@/components/admin/comando'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Modal } from '@/components/ui/modal'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { COMANDOS, FILTROS, FUENTES, type Comando, type Filtro } from '@/data/comandos'
import { codigoDe, esDeTeclado, etiquetaDeTecla, motivoTeclaNoValida, teclaPorCodigo } from '@/data/teclas'
import type { Atajo, useAtajos } from '@/hooks/useAtajos'
import type { Aviso } from '@/components/toaster'
import { EASE_OUT } from '@/lib/ease'
import { cn } from '@/lib/utils'
import { t, msg } from '@/i18n'

type Vista = 'accion' | 'valores' | 'tecla'

interface TeclaElegida {
  code: string
  etiqueta: string
  control: number
}

interface Borrador {
  id: string
  comando: string | null
  valores: Record<string, Valor>
  tecla: TeclaElegida | null
}

const ICONOS: Record<Filtro, LucideIcon> = {
  personaje: User,
  vehiculo: Car,
  utilidad: Wand2,
  servidor: Server,
}

const SUGERENCIAS = ['noclip', 'marcador', 'reparar', 'curar']

const nuevoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const comandoPorId = (id: string | null) => COMANDOS.find(c => c.id === id)

const rotuloFiltro = (filtro: Filtro) => t(FILTROS.find(f => f.value === filtro)?.label ?? filtro)

function resumenValores(comando: Comando, valores?: Record<string, Valor>): string {
  if (comando.tipo !== 'form' || !valores) return ''
  return comando.campos
    .flatMap(campo => {
      const v = valores[campo.nombre]
      if (v === undefined || v === '') return []
      if (campo.tipo === 'select') {
        const opcion = FUENTES[campo.opciones].find(o => o.value === String(v))
        return [opcion ? t(opcion.label) : String(v)]
      }
      if (campo.tipo === 'casilla') return v ? [t(campo.label)] : []
      if (campo.tipo === 'deslizador') return [`${v}${campo.sufijo ?? ''}`]
      return [String(v)]
    })
    .join(' · ')
}

function etiquetaDe(e: KeyboardEvent, code: string, tabla: string): string {
  if (esDeTeclado(code) && e.key.length === 1 && e.key.trim()) return e.key.toUpperCase()
  return tabla
}

export function AtajosPage({ atajos, aviso }: { atajos: ReturnType<typeof useAtajos>; aviso: Aviso }) {
  const { estado, maximo, teclaMenu, permitidos, disparado, poner, quitar, alternarActivos } = atajos
  const [editor, setEditor] = useState<{ vista: Vista; borrador: Borrador } | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [resaltado, setResaltado] = useState<string | null>(null)

  const lleno = estado.lista.length >= maximo

  useEffect(() => {
    if (!borrando) return
    const id = setTimeout(() => setBorrando(null), 3000)
    return () => clearTimeout(id)
  }, [borrando])

  useEffect(() => {
    if (!resaltado) return
    const id = setTimeout(() => setResaltado(null), 1400)
    return () => clearTimeout(id)
  }, [resaltado])

  const crear = (comando?: string) => {
    if (lleno) return
    const c = comandoPorId(comando ?? null)
    setEditor({
      vista: c ? (c.tipo === 'form' ? 'valores' : 'tecla') : 'accion',
      borrador: {
        id: nuevoId(),
        comando: c?.id ?? null,
        valores: c?.tipo === 'form' ? valoresIniciales(c) : {},
        tecla: null,
      },
    })
  }

  const editar = (atajo: Atajo) => {
    const c = comandoPorId(atajo.comando)
    setEditor({
      vista: 'accion',
      borrador: {
        id: atajo.id,
        comando: c ? atajo.comando : null,
        valores: atajo.valores ?? (c?.tipo === 'form' ? valoresIniciales(c) : {}),
        tecla: { code: atajo.tecla, etiqueta: atajo.etiqueta, control: atajo.control },
      },
    })
  }

  const guardar = (b: Borrador) => {
    const c = comandoPorId(b.comando)
    if (!c || !b.tecla) return
    poner({
      id: b.id,
      comando: c.id,
      valores: c.tipo === 'form' ? b.valores : undefined,
      tecla: b.tecla.code,
      etiqueta: b.tecla.etiqueta,
      control: b.tecla.control,
    })
    setEditor(null)
    setResaltado(b.id)
    aviso(
      t('Atajo guardado: {tecla} → {accion}', { tecla: etiquetaDeTecla(b.tecla.code, b.tecla.etiqueta), accion: t(c.label) }),
      'success'
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b px-3 py-2.5">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-card ring-1 ring-foreground/10">
          <Keyboard className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium leading-tight">{t('Atajos de teclado')}</div>
          <div className="text-[11.5px] tabular-nums text-muted-foreground">
            {t('{usados} de {maximo}', { usados: estado.lista.length, maximo })}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
          {estado.activos && permitidos ? t('Activados') : t('Desactivados')}
          <Switch
            checked={estado.activos && permitidos}
            disabled={!permitidos}
            onCheckedChange={v => alternarActivos(v)}
            aria-label={t('Activar los atajos')}
          />
        </label>
      </div>

      {!permitidos && (
        <div className="flex shrink-0 items-start gap-2 border-b bg-amber-500/10 px-3 py-2 text-[12px] leading-snug text-amber-300">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>{t('El servidor tiene los atajos desactivados. Se pueden preparar, pero no saltan.')}</span>
        </div>
      )}

      {estado.lista.length === 0 ? (
        <Vacio onCrear={crear} />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1.5 p-2.5">
            <AnimatePresence initial={false}>
              {estado.lista.map(atajo => (
                <FilaAtajo
                  key={atajo.id}
                  atajo={atajo}
                  apagado={!estado.activos || !permitidos}
                  pulsada={disparado === atajo.id}
                  resaltada={resaltado === atajo.id}
                  borrando={borrando === atajo.id}
                  onEditar={() => editar(atajo)}
                  onBorrar={() => {
                    if (borrando === atajo.id) {
                      quitar(atajo.id)
                      setBorrando(null)
                    } else {
                      setBorrando(atajo.id)
                    }
                  }}
                />
              ))}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => crear()}
              disabled={lleno}
              className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 bg-card/30 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/35 hover:bg-accent/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
            >
              <Plus className="size-4" />
              {lleno ? t('Has llegado al máximo de {maximo} atajos', { maximo }) : t('Nuevo atajo')}
            </button>
          </div>
        </ScrollArea>
      )}

      <div className="flex shrink-0 items-start gap-2 border-t px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        <span>{t('Funcionan con el menú cerrado. No saltan mientras escribes en el chat ni con la pausa abierta.')}</span>
      </div>

      <Modal
        viewId={editor ? editor.vista : null}
        onClose={() => setEditor(null)}
        className="max-w-[400px]"
      >
        {editor && (
          <Editor
            vista={editor.vista}
            borrador={editor.borrador}
            lista={estado.lista}
            teclaMenu={teclaMenu}
            onVista={vista => setEditor(e => (e ? { ...e, vista } : e))}
            onBorrador={cambio => setEditor(e => (e ? { ...e, borrador: { ...e.borrador, ...cambio } } : e))}
            onCancelar={() => setEditor(null)}
            onGuardar={guardar}
          />
        )}
      </Modal>
    </div>
  )
}

function FilaAtajo({
  atajo,
  apagado,
  pulsada,
  resaltada,
  borrando,
  onEditar,
  onBorrar,
}: {
  atajo: Atajo
  apagado: boolean
  pulsada: boolean
  resaltada: boolean
  borrando: boolean
  onEditar: () => void
  onBorrar: () => void
}) {
  const reduce = useReducedMotion()
  const comando = comandoPorId(atajo.comando)
  const Icono = comando ? ICONOS[comando.filtro] : AlertTriangle
  const resumen = comando ? resumenValores(comando, atajo.valores) : ''

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.15, ease: EASE_OUT } }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      className={cn(
        'group flex items-center gap-3 rounded-xl bg-card p-2 pr-1.5 ring-1 ring-foreground/10 transition-[box-shadow,background-color,opacity] duration-300',
        (pulsada || resaltada) && 'bg-accent ring-foreground/30',
        apagado && 'opacity-60'
      )}
    >
      <div className="flex w-[58px] shrink-0 justify-center">
        <Keycap pulsada={pulsada}>{etiquetaDeTecla(atajo.tecla, atajo.etiqueta)}</Keycap>
      </div>

      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13.5px] font-medium leading-tight', !comando && 'text-destructive')}>
          {comando ? t(comando.label) : t('Acción que ya no existe')}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Icono className="size-3 shrink-0" />
          <span className="shrink-0">{comando ? rotuloFiltro(comando.filtro) : t('Bórralo o edítalo')}</span>
          {resumen && (
            <>
              <span className="shrink-0 text-foreground/25">·</span>
              <span className="truncate text-foreground/80">{resumen}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" onClick={onEditar} aria-label={t('Editar')} title={t('Editar')}>
          <Pencil />
        </Button>
        <Button
          variant={borrando ? 'destructive' : 'ghost'}
          size={borrando ? 'sm' : 'icon-sm'}
          onClick={onBorrar}
          aria-label={borrando ? t('Pulsa otra vez para borrar') : t('Borrar')}
          title={borrando ? t('Pulsa otra vez para borrar') : t('Borrar')}
          className={cn(!borrando && 'text-muted-foreground hover:text-destructive')}
        >
          <Trash2 />
          {borrando && t('¿Borrar?')}
        </Button>
      </div>
    </motion.div>
  )
}

function Vacio({ onCrear }: { onCrear: (comando?: string) => void }) {
  const reduce = useReducedMotion()
  const [pulsada, setPulsada] = useState(false)

  useEffect(() => {
    if (reduce) return
    let soltar: ReturnType<typeof setTimeout> | undefined
    const id = setInterval(() => {
      setPulsada(true)
      soltar = setTimeout(() => setPulsada(false), 160)
    }, 2400)
    return () => {
      clearInterval(id)
      if (soltar) clearTimeout(soltar)
    }
  }, [reduce])

  const flotar = (retraso: number) =>
    reduce ? undefined : { y: [0, -4, 0], transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const, delay: retraso } }

  const sugerencias = SUGERENCIAS.map(comandoPorId).filter((c): c is Comando => !!c)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-8 py-6 text-center">
      <div className="relative h-[104px] w-[230px]" aria-hidden>
        <div className="absolute left-[18px] top-[40px] -rotate-[10deg]">
          <motion.div animate={flotar(0.3)}>
            <Keycap>F6</Keycap>
          </motion.div>
        </div>
        <div className="absolute left-1/2 top-[8px] -translate-x-1/2">
          <motion.div animate={flotar(0)}>
            <Keycap tamano="lg" pulsada={pulsada}>K</Keycap>
          </motion.div>
        </div>
        <div className="absolute right-[18px] top-[46px] rotate-[9deg]">
          <motion.div animate={flotar(0.8)}>
            <Keycap>7</Keycap>
          </motion.div>
        </div>
      </div>

      <div className="space-y-1.5">
        <h3 className="font-heading text-[17px] font-semibold tracking-tight">{t('Tus acciones, a una tecla')}</h3>
        <p className="mx-auto max-w-[310px] text-[13px] leading-snug text-muted-foreground">
          {t('Elige una acción del menú —el noclip, curarte, aparecer tu coche— y la tecla que quieras. Funciona con el menú cerrado.')}
        </p>
      </div>

      <Button onClick={() => onCrear()}>
        <Plus />
        {t('Crear mi primer atajo')}
      </Button>

      {sugerencias.length > 0 && (
        <div className="w-full space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{t('O empieza por')}</div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {sugerencias.map(c => {
              const Icono = ICONOS[c.filtro]
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onCrear(c.id)}
                  className="flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-[12px] font-medium ring-1 ring-foreground/10 transition-colors hover:bg-accent"
                >
                  <Icono className="size-3.5 text-muted-foreground" />
                  {t(c.label)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Cabecera({ paso, total, titulo, ayuda }: { paso: number; total: number; titulo: string; ayuda: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn('h-1 w-6 rounded-full transition-colors duration-300', i < paso ? 'bg-foreground' : 'bg-foreground/15')}
            />
          ))}
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">{t('Paso {paso} de {total}', { paso, total })}</span>
      </div>
      <div className="space-y-1">
        <h2 className="font-heading text-base font-medium">{titulo}</h2>
        <p className="text-[13px] leading-snug text-muted-foreground">{ayuda}</p>
      </div>
    </div>
  )
}

function Editor({
  vista,
  borrador,
  lista,
  teclaMenu,
  onVista,
  onBorrador,
  onCancelar,
  onGuardar,
}: {
  vista: Vista
  borrador: Borrador
  lista: Atajo[]
  teclaMenu: string | null
  onVista: (v: Vista) => void
  onBorrador: (cambio: Partial<Borrador>) => void
  onCancelar: () => void
  onGuardar: (b: Borrador) => void
}) {
  const comando = comandoPorId(borrador.comando)
  const conValores = comando?.tipo === 'form'
  const total = conValores ? 3 : 2

  if (vista === 'accion' || !comando) {
    return (
      <VistaAccion
        total={total}
        elegido={borrador.comando}
        lista={lista}
        onCancelar={onCancelar}
        onElegir={c => {
          const valores = c.id === borrador.comando ? borrador.valores : c.tipo === 'form' ? valoresIniciales(c) : {}
          onBorrador({ comando: c.id, valores })
          onVista(c.tipo === 'form' ? 'valores' : 'tecla')
        }}
      />
    )
  }

  if (vista === 'valores' && comando.tipo === 'form') {
    return (
      <VistaValores
        comando={comando}
        valores={borrador.valores}
        onValores={valores => onBorrador({ valores })}
        onAtras={() => onVista('accion')}
        onSiguiente={() => onVista('tecla')}
      />
    )
  }

  return (
    <VistaTecla
      paso={total}
      comando={comando}
      borrador={borrador}
      lista={lista}
      teclaMenu={teclaMenu}
      onTecla={tecla => onBorrador({ tecla })}
      onAtras={() => onVista(conValores ? 'valores' : 'accion')}
      onGuardar={() => onGuardar(borrador)}
    />
  )
}

function VistaAccion({
  total,
  elegido,
  lista,
  onElegir,
  onCancelar,
}: {
  total: number
  elegido: string | null
  lista: Atajo[]
  onElegir: (c: Comando) => void
  onCancelar: () => void
}) {
  const [busqueda, setBusqueda] = useState('')

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return FILTROS.filter(f => f.value !== 'todo').flatMap(f => {
      const comandos = COMANDOS.filter(c => c.filtro === f.value && (!q || t(c.label).toLowerCase().includes(q)))
      return comandos.length ? [{ filtro: f.value as Filtro, comandos }] : []
    })
  }, [busqueda])

  return (
    <div className="space-y-3">
      <Cabecera paso={1} total={total} titulo={t('¿Qué quieres tener a mano?')} ayuda={t('Elige la acción que hará la tecla.')} />

      <InputGroup className="h-9">
        <InputGroupInput
          autoFocus
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder={t('Buscar una acción…')}
          aria-label={t('Buscar una acción')}
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
      </InputGroup>

      <ScrollArea className="-mx-2 h-[300px]">
        <div className="space-y-3 px-2 pb-1">
          {grupos.map(g => {
            const Icono = ICONOS[g.filtro]
            return (
              <section key={g.filtro} className="space-y-0.5">
                <h3 className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  <Icono className="size-3" />
                  {rotuloFiltro(g.filtro)}
                </h3>
                {g.comandos.map(c => {
                  const marcado = c.id === elegido
                  const tecla = lista.find(a => a.comando === c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onElegir(c)}
                      className={cn(
                        'flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors hover:bg-accent',
                        marcado && 'bg-accent ring-1 ring-foreground/15'
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{t(c.label)}</span>
                      {c.tipo === 'form' && (
                        <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{t('Con opciones')}</span>
                      )}
                      {tecla && <Keycap tamano="sm">{etiquetaDeTecla(tecla.tecla, tecla.etiqueta)}</Keycap>}
                      {marcado ? (
                        <Check className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                      )}
                    </button>
                  )
                })}
              </section>
            )
          })}

          {grupos.length === 0 && (
            <p className="py-10 text-center text-[13px] text-muted-foreground">{t('Ninguna acción coincide.')}</p>
          )}
        </div>
      </ScrollArea>

      <div className="flex justify-end pt-1">
        <Button variant="ghost" onClick={onCancelar}>
          {t('Cancelar')}
        </Button>
      </div>
    </div>
  )
}

function VistaValores({
  comando,
  valores,
  onValores,
  onAtras,
  onSiguiente,
}: {
  comando: Extract<Comando, { tipo: 'form' }>
  valores: Record<string, Valor>
  onValores: (v: Record<string, Valor>) => void
  onAtras: () => void
  onSiguiente: () => void
}) {
  const [falta, setFalta] = useState<string | null>(null)

  const siguiente = () => {
    const r = montarCuerpo(comando, valores)
    if ('falta' in r) {
      setFalta(r.falta)
      return
    }
    onSiguiente()
  }

  const campoQueFalta = comando.campos.find(c => c.nombre === falta)

  return (
    <div className="space-y-3">
      <Cabecera
        paso={2}
        total={3}
        titulo={t(comando.label)}
        ayuda={t('Estos valores se usarán cada vez que pulses la tecla.')}
      />

      <div className="space-y-2.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <CamposDelComando
          comando={comando}
          valores={valores}
          falta={falta}
          onEnviar={siguiente}
          onCambio={(nombre, v) => {
            onValores({ ...valores, [nombre]: v })
            if (falta === nombre) setFalta(null)
          }}
        />
      </div>

      {campoQueFalta && (
        <p className="text-xs text-destructive">{t('Falta rellenar «{falta}».', { falta: t(campoQueFalta.label) })}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" onClick={onAtras}>
          <ArrowLeft />
          {t('Atrás')}
        </Button>
        <Button onClick={siguiente}>
          {t('Siguiente')}
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

type Nota = { tono: 'error' | 'aviso' | 'info' | 'ok'; texto: string }

function VistaTecla({
  paso,
  comando,
  borrador,
  lista,
  teclaMenu,
  onTecla,
  onAtras,
  onGuardar,
}: {
  paso: number
  comando: Comando
  borrador: Borrador
  lista: Atajo[]
  teclaMenu: string | null
  onTecla: (t: TeclaElegida) => void
  onAtras: () => void
  onGuardar: () => void
}) {
  const reduce = useReducedMotion()
  const [pulsando, setPulsando] = useState(false)
  const [rechazo, setRechazo] = useState<string | null>(null)
  const tecla = borrador.tecla

  const reservada = !!tecla && !!teclaMenu && tecla.etiqueta.toUpperCase() === teclaMenu.toUpperCase()
  const choque = tecla ? lista.find(a => a.tecla === tecla.code && a.id !== borrador.id) : undefined
  const valida = !!tecla && !reservada

  useEffect(() => {
    const abajo = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      const code = codigoDe(e)

      if ((code === 'Enter' || code === 'NumpadEnter') && valida) {
        onGuardar()
        return
      }

      const encontrada = teclaPorCodigo(code)
      if (!encontrada) {
        setRechazo(t(motivoTeclaNoValida(code)))
        return
      }
      setRechazo(null)
      setPulsando(true)
      setTimeout(() => setPulsando(false), 140)
      onTecla({ code: encontrada.code, etiqueta: etiquetaDe(e, code, encontrada.etiqueta), control: encontrada.control })
    }
    window.addEventListener('keydown', abajo, true)
    return () => window.removeEventListener('keydown', abajo, true)
  }, [valida, onGuardar, onTecla])

  const nota: Nota | null = rechazo
    ? { tono: 'error', texto: rechazo }
    : !tecla
      ? null
      : reservada
        ? { tono: 'error', texto: t('Es la tecla que abre el menú de VXCore.') }
        : choque
          ? {
              tono: 'aviso',
              texto: t('Ahora hace «{accion}». Pasará a este atajo.', {
                accion: t(comandoPorId(choque.comando)?.label ?? msg('otra acción')),
              }),
            }
          : teclaPorCodigo(tecla.code)?.uso
            ? { tono: 'info', texto: t(teclaPorCodigo(tecla.code)!.uso!) }
            : { tono: 'ok', texto: t('Lista para guardar.') }

  const resumen = resumenValores(comando, borrador.valores)

  return (
    <div className="space-y-4">
      <Cabecera
        paso={paso}
        total={paso}
        titulo={t('Pulsa la tecla')}
        ayuda={t('La que quieras usar para «{accion}».', { accion: t(comando.label) })}
      />

      <div className="flex flex-col items-center gap-4 py-2">
        <div className="relative grid place-items-center">
          {!tecla && !reduce && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-[18px] ring-2 ring-foreground/30"
              animate={{ scale: [1, 1.28], opacity: [0.7, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          <motion.div
            key={tecla ? `${tecla.code}-${tecla.etiqueta}` : 'vacia'}
            initial={reduce ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 24 }}
          >
            <Keycap tamano="lg" apagada={!tecla} pulsada={pulsando}>
              {tecla ? etiquetaDeTecla(tecla.code, tecla.etiqueta) : '?'}
            </Keycap>
          </motion.div>
        </div>

        <div className="flex min-h-[36px] w-full items-start justify-center" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={nota ? nota.texto : 'esperando'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              className={cn(
                'flex max-w-[320px] items-start gap-1.5 text-left text-[12.5px] leading-snug',
                !nota && 'animate-pulse text-muted-foreground',
                nota?.tono === 'error' && 'text-red-400',
                nota?.tono === 'aviso' && 'text-amber-300',
                nota?.tono === 'info' && 'text-muted-foreground',
                nota?.tono === 'ok' && 'text-emerald-400'
              )}
            >
              {nota?.tono === 'error' || nota?.tono === 'aviso' ? (
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
              ) : nota?.tono === 'ok' ? (
                <Check className="mt-px size-3.5 shrink-0" />
              ) : nota ? (
                <Info className="mt-px size-3.5 shrink-0" />
              ) : null}
              <span>{nota ? nota.texto : t('Esperando una tecla…')}</span>
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
        <Keycap tamano="sm" apagada={!tecla}>
          {tecla ? etiquetaDeTecla(tecla.code, tecla.etiqueta) : '?'}
        </Keycap>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{t(comando.label)}</div>
          {resumen && <div className="truncate text-[11.5px] text-muted-foreground">{resumen}</div>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onAtras}>
          <ArrowLeft />
          {t('Atrás')}
        </Button>
        <Button onClick={onGuardar} disabled={!valida}>
          <Check />
          {t('Guardar atajo')}
        </Button>
      </div>
    </div>
  )
}
