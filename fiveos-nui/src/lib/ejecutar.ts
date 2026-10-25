import { toClient } from '@/lib/fivem'
import { montarCuerpo, type Valor } from '@/components/admin/comando'
import type { Comando } from '@/data/comandos'
import type { Aviso } from '@/components/toaster'
import { t } from '@/i18n'

export async function ejecutarRuta(ruta: string, datos: Record<string, unknown>, aviso: Aviso) {
  const r = await toClient(ruta, datos)
  const fallo = !r || r.ok === false
  aviso(r?.mensaje || (fallo ? t('El juego no ha respondido.') : t('Hecho.')), fallo ? 'error' : 'success')
  return r
}

export async function ejecutarComando(
  comando: Comando,
  valores: Record<string, Valor> | undefined,
  {
    aviso,
    toggle,
  }: {
    aviso: Aviso
    toggle: (key: string) => Promise<{ ok?: boolean; mensaje?: string } | null>
  }
) {
  if (comando.tipo === 'boton') {
    if (comando.toggle) {
      const r = await toggle(comando.toggle)
      if (r?.mensaje) aviso(r.mensaje, r.ok === false ? 'error' : 'success')
      return r
    }
    return ejecutarRuta(comando.ruta, comando.datos ?? {}, aviso)
  }

  const montado = montarCuerpo(comando, valores ?? {})
  if ('falta' in montado) {
    aviso(t('Al atajo de «{comando}» le falta un dato. Edítalo en el menú.', { comando: t(comando.label) }), 'error')
    return null
  }
  return ejecutarRuta(comando.ruta, montado.cuerpo, aviso)
}
