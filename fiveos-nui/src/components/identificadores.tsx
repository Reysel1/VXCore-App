import { Copy, Fingerprint } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { copiar } from '@/lib/copiar'
import type { Aviso } from '@/components/toaster'
import { t, msg } from '@/i18n'

export interface Identificadores {
  id: number
  nombre: string
  identificadores: Record<string, string>
}

const ETIQUETAS: Record<string, string> = {
  license: msg('Licencia (Rockstar)'),
  license2: msg('Licencia 2'),
  steam: 'Steam',
  discord: 'Discord',
  fivem: 'FiveM',
  xbl: msg('Xbox Live'),
  live: msg('Microsoft'),
  ip: 'IP',
}

export function FichaIdentificadores({
  info,
  onCerrar,
  aviso,
}: {
  info: Identificadores | null
  onCerrar: () => void
  aviso: Aviso
}) {
  const filas = info
    ? Object.entries(info.identificadores).filter(([clave, valor]) => clave !== 'tokens' && !!valor)
    : []

  const copiarFila = async (etiqueta: string, valor: string) => {
    const bien = await copiar(valor)
    aviso(bien ? t('{etiqueta} copiado.', { etiqueta }) : t('No se ha podido copiar.'), bien ? 'success' : 'error')
  }

  return (
    <Modal viewId={info ? `ids-${info.id}` : null} onClose={onCerrar} className="max-w-md">
      {info && (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Fingerprint className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-heading text-base font-medium">{info.nombre}</div>
              <div className="text-xs text-muted-foreground">{t('Jugador #{id}', { id: info.id })}</div>
            </div>
          </div>

          {filas.length === 0 ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              {t('Este jugador no trae ningún identificador. Sin al menos uno, una sanción no podría aplicarse a nadie.')}
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg ring-1 ring-foreground/10">
              {filas.map(([clave, valor]) => {
                const etiqueta = ETIQUETAS[clave] ? t(ETIQUETAS[clave]) : clave
                return (
                  <li key={clave} className="flex items-center gap-2 bg-card py-1.5 pr-1.5 pl-3">
                    <span className="w-[108px] shrink-0 text-xs text-muted-foreground">{etiqueta}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{valor}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title={t('Copiar {etiqueta}', { etiqueta })}
                      aria-label={t('Copiar {etiqueta}', { etiqueta })}
                      onClick={() => void copiarFila(etiqueta, valor)}
                    >
                      <Copy />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex justify-end pt-1">
            <Button variant="outline" onClick={onCerrar}>
              {t('Cerrar')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
