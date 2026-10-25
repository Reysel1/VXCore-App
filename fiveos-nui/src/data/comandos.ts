import { ARMAS, CLIMAS, HORAS, SITIOS, VEHICULOS, type Opcion } from '@/data/opciones'
import { msg } from '@/i18n'

export type Filtro = 'personaje' | 'vehiculo' | 'utilidad' | 'servidor'

export const FILTROS: { label: string; value: Filtro | 'todo' }[] = [
  { label: msg('Todo'), value: 'todo' },
  { label: msg('Personaje'), value: 'personaje' },
  { label: msg('Vehículo'), value: 'vehiculo' },
  { label: msg('Utilidad'), value: 'utilidad' },
  { label: msg('Servidor'), value: 'servidor' },
]

export type FuenteOpciones = 'VEHICULOS' | 'ARMAS' | 'SITIOS' | 'CLIMAS' | 'HORAS'

export const FUENTES: Record<FuenteOpciones, Opcion[]> = {
  VEHICULOS,
  ARMAS,
  SITIOS,
  CLIMAS,
  HORAS,
}

export type Campo =
  | {
      tipo: 'select'
      nombre: string
      label: string
      opciones: FuenteOpciones
      requerido?: boolean
      libre?: boolean
      porDefecto?: string
    }
  | { tipo: 'texto'; nombre: string; label: string; placeholder?: string; porDefecto?: string; maximo?: number; requerido?: boolean }
  | { tipo: 'numero'; nombre: string; label: string; min: number; max: number; paso?: number; porDefecto: number }
  | { tipo: 'deslizador'; nombre: string; label: string; min: number; max: number; paso?: number; porDefecto: number; sufijo?: string }
  | { tipo: 'casilla'; nombre: string; label: string; porDefecto?: boolean }

export interface BotonExtra {
  label: string
  ruta: string
  datos?: Record<string, unknown>
  color?: 'azul' | 'rojo'
}

interface Comun {
  id: string
  label: string
  filtro: Filtro
}

export interface ComandoBoton extends Comun {
  tipo: 'boton'
  ruta: string
  datos?: Record<string, unknown>
  toggle?: string
  cierra?: boolean
}

export interface ComandoForm extends Comun {
  tipo: 'form'
  ruta: string
  campos: Campo[]
  datos?: Record<string, unknown>
  boton?: string
  extra?: BotonExtra[]
  prepara?: (valores: Record<string, unknown>) => Record<string, unknown> | null
}

export type Comando = ComandoBoton | ComandoForm

export const COMANDOS: Comando[] = [
  { id: 'curar', label: msg('Curarte'), tipo: 'boton', filtro: 'personaje', ruta: 'accion', datos: { accion: 'curar' } },
  { id: 'blindaje', label: msg('Ponerte el chaleco'), tipo: 'boton', filtro: 'personaje', ruta: 'accion', datos: { accion: 'blindaje' } },
  { id: 'revivir', label: msg('Revivirte'), tipo: 'boton', filtro: 'personaje', ruta: 'accion', datos: { accion: 'revivir' } },
  { id: 'limpiar', label: msg('Limpiarte la ropa'), tipo: 'boton', filtro: 'personaje', ruta: 'accion', datos: { accion: 'limpiar' } },
  {
    id: 'dar-arma',
    label: msg('Darte un arma'),
    tipo: 'form',
    filtro: 'personaje',
    ruta: 'arma',
    datos: { accion: 'dar' },
    campos: [{ tipo: 'select', nombre: 'nombre', label: msg('Arma'), opciones: 'ARMAS', requerido: true, libre: true }],
    boton: msg('Dármela'),
  },
  { id: 'municion', label: msg('Munición al máximo'), tipo: 'boton', filtro: 'personaje', ruta: 'arma', datos: { accion: 'municion' } },
  { id: 'quitar-armas', label: msg('Quitarte todas las armas'), tipo: 'boton', filtro: 'personaje', ruta: 'arma', datos: { accion: 'quitar' } },

  { id: 'noclip', label: 'NoClip', tipo: 'boton', filtro: 'utilidad', ruta: 'accion', datos: { accion: 'noclip' }, toggle: 'noclip', cierra: true },
  { id: 'invisible', label: msg('Invisible'), tipo: 'boton', filtro: 'utilidad', ruta: 'accion', datos: { accion: 'invisible' }, toggle: 'invisible' },
  { id: 'invencible', label: msg('Godmode'), tipo: 'boton', filtro: 'utilidad', ruta: 'accion', datos: { accion: 'invencible' }, toggle: 'invencible' },
  { id: 'marcador', label: msg('Ir al marcador del mapa'), tipo: 'boton', filtro: 'utilidad', ruta: 'accion', datos: { accion: 'marcador' } },
  { id: 'volver', label: msg('Volver donde estabas'), tipo: 'boton', filtro: 'utilidad', ruta: 'accion', datos: { accion: 'volver' } },
  {
    id: 'tp-sitio',
    label: msg('Teletransporte a un sitio'),
    tipo: 'form',
    filtro: 'utilidad',
    ruta: 'sitio',
    campos: [{ tipo: 'select', nombre: 'sitio', label: msg('Sitio'), opciones: 'SITIOS', requerido: true }],
    boton: msg('Llévame'),
  },
  {
    id: 'tp-coords',
    label: msg('Teletransporte a unas coordenadas'),
    tipo: 'form',
    filtro: 'utilidad',
    ruta: 'coordenadas',
    campos: [
      { tipo: 'texto', nombre: 'crudas', label: msg('Coordenadas'), placeholder: '-269.4, -955.3, 31.2', requerido: true },
    ],
    boton: msg('Llévame'),
    prepara: valores => {
      const crudas = String(valores.crudas ?? '').replace(/vector[234]/gi, '')
      const numeros = crudas.match(/-?\d+(\.\d+)?/g)
      if (!numeros || numeros.length < 2) return null
      return { x: numeros[0], y: numeros[1], z: numeros[2] }
    },
  },

  {
    id: 'spawn',
    label: msg('Aparecer un vehículo'),
    tipo: 'form',
    filtro: 'vehiculo',
    ruta: 'spawnVehiculo',
    campos: [{ tipo: 'select', nombre: 'modelo', label: msg('Vehículo'), opciones: 'VEHICULOS', requerido: true, libre: true }],
    boton: msg('Aparecer'),
    extra: [{ label: msg('Borrar el de ahora'), ruta: 'accion', datos: { accion: 'borrar-vehiculo' }, color: 'rojo' }],
  },
  { id: 'reparar', label: msg('Reparar el vehículo'), tipo: 'boton', filtro: 'vehiculo', ruta: 'accion', datos: { accion: 'reparar' } },
  { id: 'repostar', label: msg('Llenar el depósito'), tipo: 'boton', filtro: 'vehiculo', ruta: 'accion', datos: { accion: 'repostar' } },
  { id: 'limpiar-vehiculo', label: msg('Limpiar el vehículo'), tipo: 'boton', filtro: 'vehiculo', ruta: 'accion', datos: { accion: 'limpiar-vehiculo' } },
  { id: 'motor', label: msg('Encender o apagar el motor'), tipo: 'boton', filtro: 'vehiculo', ruta: 'vehiculo', datos: { accion: 'motor' } },
  { id: 'cerraduras', label: msg('Abrir o cerrar el vehículo'), tipo: 'boton', filtro: 'vehiculo', ruta: 'vehiculo', datos: { accion: 'cerraduras' } },
  { id: 'tunear', label: msg('Tunear al máximo'), tipo: 'boton', filtro: 'vehiculo', ruta: 'vehiculo', datos: { accion: 'motor-mejorado' } },
  { id: 'color', label: msg('Cambiar el color al azar'), tipo: 'boton', filtro: 'vehiculo', ruta: 'vehiculo', datos: { accion: 'color' } },
  {
    id: 'matricula',
    label: msg('Poner la matrícula'),
    tipo: 'form',
    filtro: 'vehiculo',
    ruta: 'vehiculo',
    datos: { accion: 'matricula' },
    campos: [{ tipo: 'texto', nombre: 'texto', label: msg('Matrícula'), placeholder: 'VXCORE', maximo: 8, requerido: true }],
    boton: msg('Ponerla'),
  },
  { id: 'borrar-vehiculo', label: msg('Borrar el vehículo'), tipo: 'boton', filtro: 'vehiculo', ruta: 'accion', datos: { accion: 'borrar-vehiculo' } },

  {
    id: 'hora',
    label: msg('Cambiar la hora'),
    tipo: 'form',
    filtro: 'servidor',
    ruta: 'mundo',
    campos: [{ tipo: 'select', nombre: 'hora', label: msg('Hora'), opciones: 'HORAS', requerido: true, porDefecto: '12' }],
    boton: msg('Ponerla'),
  },
  {
    id: 'clima',
    label: msg('Cambiar el clima'),
    tipo: 'form',
    filtro: 'servidor',
    ruta: 'mundo',
    campos: [{ tipo: 'select', nombre: 'clima', label: msg('Clima'), opciones: 'CLIMAS', requerido: true, porDefecto: 'EXTRASUNNY' }],
    boton: msg('Ponerlo'),
  },
  {
    id: 'anuncio',
    label: msg('Anunciar algo a todo el servidor'),
    tipo: 'form',
    filtro: 'servidor',
    ruta: 'anuncio',
    campos: [{ tipo: 'texto', nombre: 'mensaje', label: msg('Anuncio'), placeholder: msg('Reinicio en 5 minutos…'), requerido: true }],
    boton: msg('Anunciar'),
  },
  {
    id: 'limpiar-zona',
    label: msg('Limpiar la zona'),
    tipo: 'form',
    filtro: 'servidor',
    ruta: 'limpiarZona',
    campos: [{ tipo: 'deslizador', nombre: 'radio', label: msg('Radio'), min: 25, max: 500, paso: 25, porDefecto: 100, sufijo: ' m' }],
    boton: msg('Limpiar'),
  },
  {
    id: 'consola',
    label: msg('Ejecutar un comando del servidor'),
    tipo: 'form',
    filtro: 'servidor',
    ruta: 'consola',
    campos: [{ tipo: 'texto', nombre: 'comando', label: msg('Comando'), placeholder: msg('restart vxcore'), requerido: true }],
    boton: msg('Ejecutar'),
    extra: [{ label: 'refresh', ruta: 'consola', datos: { comando: 'refresh' }, color: 'azul' }],
  },
]
