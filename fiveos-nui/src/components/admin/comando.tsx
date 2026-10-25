import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Expandible, FILA } from '@/components/admin/expandible'
import { Keycap } from '@/components/admin/tecla'
import { CampoCasilla, CampoDeslizador, CampoNumero, CampoSelect, CampoTexto } from '@/components/admin/campos'
import { FUENTES, type BotonExtra, type Campo, type ComandoBoton, type ComandoForm } from '@/data/comandos'
import { t } from '@/i18n'

function Estrella({ marcado, onAlternar }: { marcado: boolean; onAlternar: () => void }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={marcado ? t('Quitar de favoritos') : t('Marcar como favorito')}
      title={marcado ? t('Quitar de favoritos') : t('Marcar como favorito')}
      onClick={e => {
        e.stopPropagation()
        onAlternar()
      }}
      className="grid w-6 shrink-0 place-items-center"
    >
      <Star
        size={15}
        className={cn(
          'transition-colors',
          marcado ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40 hover:text-muted-foreground'
        )}
      />
    </span>
  )
}

function Etiqueta({
  children,
  marcado,
  onFavorito,
  tecla,
}: {
  children: string
  marcado: boolean
  onFavorito: () => void
  tecla?: string
}) {
  return (
    <>
      <Estrella marcado={marcado} onAlternar={onFavorito} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {tecla && (
        <span title={t('Atajo: {tecla}', { tecla })} className="shrink-0">
          <Keycap tamano="sm">{tecla}</Keycap>
        </span>
      )}
    </>
  )
}

export function FilaBoton({
  comando,
  activo,
  tecla,
  favorito,
  onFavorito,
  onEjecutar,
}: {
  comando: ComandoBoton
  activo: boolean
  tecla?: string
  favorito: boolean
  onFavorito: () => void
  onEjecutar: () => void
}) {
  return (
    <Button
      variant="ghost"
      onClick={onEjecutar}
      className={cn(
        FILA,
        'justify-start',
        activo && 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25 hover:bg-emerald-500/15 hover:text-emerald-300'
      )}
    >
      <Etiqueta marcado={favorito} onFavorito={onFavorito} tecla={tecla}>
        {t(comando.label)}
      </Etiqueta>
      {activo && (
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
          {t('Puesto')}
        </Badge>
      )}
    </Button>
  )
}

export type Valor = string | number | boolean

function valorInicial(campo: Campo): Valor {
  if (campo.tipo === 'casilla') return campo.porDefecto ?? false
  if (campo.tipo === 'numero' || campo.tipo === 'deslizador') return campo.porDefecto
  if (campo.tipo === 'select') return campo.porDefecto ?? ''
  return campo.porDefecto ?? ''
}

export function valoresIniciales(comando: ComandoForm): Record<string, Valor> {
  return Object.fromEntries(comando.campos.map(c => [c.nombre, valorInicial(c)]))
}

export function montarCuerpo(
  comando: ComandoForm,
  valores: Record<string, Valor>
): { cuerpo: Record<string, unknown> } | { falta: string | null } {
  const vacio = comando.campos.find(c => {
    if (!('requerido' in c) || !c.requerido) return false
    const v = valores[c.nombre]
    return v === '' || v === undefined || v === null
  })
  if (vacio) return { falta: vacio.nombre }

  const propios = comando.prepara ? comando.prepara(valores) : valores
  if (!propios) return { falta: comando.campos[0]?.nombre ?? null }

  return { cuerpo: { ...(comando.datos ?? {}), ...propios } }
}

export function CamposDelComando({
  comando,
  valores,
  onCambio,
  falta,
  onEnviar,
}: {
  comando: ComandoForm
  valores: Record<string, Valor>
  onCambio: (nombre: string, valor: Valor) => void
  falta: string | null
  onEnviar?: () => void
}) {
  return (
    <>
      {comando.campos.map(campo => {
        const invalido = falta === campo.nombre

        return (
          <div key={campo.nombre}>
            {campo.tipo === 'texto' && (
              <CampoTexto
                label={t(campo.label)}
                valor={String(valores[campo.nombre] ?? '')}
                onCambio={v => onCambio(campo.nombre, v)}
                placeholder={campo.placeholder && t(campo.placeholder)}
                maximo={campo.maximo}
                onEnviar={onEnviar}
                invalido={invalido}
              />
            )}
            {campo.tipo === 'select' && (
              <CampoSelect
                label={t(campo.label)}
                valor={String(valores[campo.nombre] ?? '')}
                onCambio={v => onCambio(campo.nombre, v)}
                opciones={FUENTES[campo.opciones]}
                libre={campo.libre}
                invalido={invalido}
              />
            )}
            {campo.tipo === 'numero' && (
              <CampoNumero
                label={t(campo.label)}
                valor={Number(valores[campo.nombre] ?? 0)}
                onCambio={v => onCambio(campo.nombre, v)}
                min={campo.min}
                max={campo.max}
                paso={campo.paso}
                invalido={invalido}
              />
            )}
            {campo.tipo === 'deslizador' && (
              <CampoDeslizador
                label={t(campo.label)}
                valor={Number(valores[campo.nombre] ?? 0)}
                onCambio={v => onCambio(campo.nombre, v)}
                min={campo.min}
                max={campo.max}
                paso={campo.paso}
                sufijo={campo.sufijo}
              />
            )}
            {campo.tipo === 'casilla' && (
              <CampoCasilla
                label={t(campo.label)}
                valor={Boolean(valores[campo.nombre])}
                onCambio={v => onCambio(campo.nombre, v)}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

export function FilaFormulario({
  comando,
  tecla,
  favorito,
  onFavorito,
  onEnviar,
  onExtra,
}: {
  comando: ComandoForm
  tecla?: string
  favorito: boolean
  onFavorito: () => void
  onEnviar: (cuerpo: Record<string, unknown>) => void
  onExtra: (boton: BotonExtra) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [valores, setValores] = useState<Record<string, Valor>>(() => valoresIniciales(comando))
  const [falta, setFalta] = useState<string | null>(null)

  const poner = (nombre: string, v: Valor) => {
    setValores(prev => ({ ...prev, [nombre]: v }))
    if (falta === nombre) setFalta(null)
  }

  const enviar = () => {
    const r = montarCuerpo(comando, valores)
    if ('falta' in r) {
      setFalta(r.falta)
      return
    }
    onEnviar(r.cuerpo)
  }

  return (
    <Expandible
      abierto={abierto}
      onAlternar={() => setAbierto(v => !v)}
      cabecera={
        <Etiqueta marcado={favorito} onFavorito={onFavorito} tecla={tecla}>
          {t(comando.label)}
        </Etiqueta>
      }
    >
      <CamposDelComando comando={comando} valores={valores} onCambio={poner} falta={falta} onEnviar={enviar} />

      {falta && <p className="text-xs text-destructive">{t('Falta rellenar «{falta}».', { falta })}</p>}

      <Separator />

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={enviar}>
          {comando.boton ? t(comando.boton) : t('Ejecutar')}
        </Button>
        {comando.extra?.map(b => (
          <Button
            key={b.label}
            size="sm"
            variant={b.color === 'rojo' ? 'destructive' : 'secondary'}
            onClick={() => onExtra(b)}
          >
            {t(b.label)}
          </Button>
        ))}
      </div>
    </Expandible>
  )
}
