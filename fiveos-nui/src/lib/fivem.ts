const RESOURCE = () =>
  typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'vxcore'

export const IS_FIVEM = typeof GetParentResourceName === 'function'

export interface ClientResponse {
  ok?: boolean
  mensaje?: string
  activo?: boolean
  [key: string]: unknown
}

export async function toClient<T = ClientResponse>(route: string, data: Record<string, unknown> = {}): Promise<T | null> {
  if (!IS_FIVEM) {
    const r = mockRoute(route, data)
    return ('mensaje' in r && r.ok === undefined ? { ok: true, ...r } : r) as T
  }
  try {
    const res = await fetch(`https://${RESOURCE()}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return await res.json().catch(() => null)
  } catch {
    return null
  }
}

export interface AgentResponse<T = unknown> {
  ok: boolean
  datos?: T
  error?: string
}

export async function toAgent<T = unknown>(
  operacion: string,
  datos: Record<string, unknown> = {}
): Promise<AgentResponse<T>> {
  if (!IS_FIVEM) return mockAgent(operacion, datos) as AgentResponse<T>

  const r = await toClient<AgentResponse<T>>('agente', { operacion, datos })
  return r ?? { ok: false, error: 'SIN_RESPUESTA' }
}

export interface ResumenAgente {
  success: boolean
  juego: {
    jugadores: number
    maximo: number
    recursos: number
    latido: number | null
    obsoleto: boolean
  }
  maquina: {
    cpu: number
    nucleos: number
    memoria: number
    memoriaGb: number
    memoriaTotalGb: number
    encendida: number
  } | null
  sanciones: { activas: number }
  version: string
}

function mockAgent(operacion: string, datos: Record<string, unknown>): AgentResponse {
  if (operacion === 'sanciones') {
    const conHistorial = Number(datos.id) === 3
    return {
      ok: true,
      datos: conHistorial
        ? { success: true, banned: true, message: 'Baneado por trampas · quedan 3 días' }
        : { success: true, banned: false },
    }
  }

  if (operacion === 'resumen') {
    const vaivén = (base: number, margen: number) => Math.round((base + (Math.random() - 0.5) * margen) * 10) / 10
    return {
      ok: true,
      datos: {
        success: true,
        juego: { jugadores: MOCK_PLAYERS.length, maximo: 64, recursos: 137, latido: 2, obsoleto: false },
        maquina: {
          cpu: vaivén(23, 8),
          nucleos: 8,
          memoria: vaivén(58, 4),
          memoriaGb: 9.3,
          memoriaTotalGb: 16,
          encendida: 96_400,
        },
        sanciones: { activas: 4 },
        version: 'preview',
      } satisfies ResumenAgente,
    }
  }

  return { ok: false, error: 'OPERACION_DESCONOCIDA' }
}

const TOGGLE_STATE: Record<string, boolean> = {}

const MOCK_PLAYERS = [
  { id: 1, nombre: 'Carlos García', ping: 34, yo: true },
  { id: 2, nombre: 'María López', ping: 51, yo: false },
  { id: 3, nombre: 'Pedro Sánchez', ping: 128, yo: false },
  { id: 4, nombre: 'Ana Martínez', ping: 62, yo: false },
  { id: 5, nombre: 'Luis Hernández', ping: 240, yo: false },
  { id: 6, nombre: 'Elena Rodríguez', ping: 45, yo: false },
  { id: 7, nombre: 'Roberto Blanco', ping: 88, yo: false },
  { id: 8, nombre: 'Lucía Moreno', ping: 39, yo: false },
]

const MOCK_CONTROLES_NOCLIP = {
  id: 'noclip',
  titulo: 'Noclip · ×1',
  teclas: [
    { teclas: ['W', 'A', 'S', 'D'], texto: 'Moverse' },
    { teclas: ['Q', 'E'], texto: 'Subir / Bajar' },
    { teclas: ['Rueda'], texto: 'Velocidad' },
    { teclas: ['LSHIFT', 'LMENU'], texto: 'Más rápido' },
    { teclas: ['LCONTROL'], texto: 'Lento' },
  ],
}

function delJuego(data: Record<string, unknown>, retraso = 90) {
  setTimeout(() => {
    window.dispatchEvent(new MessageEvent('message', { data }))
  }, retraso)
}

function mockRoute(route: string, data: Record<string, unknown>): ClientResponse {
  switch (route) {
    case 'accion': {
      const a = data.accion as string
      if (['noclip', 'invisible', 'invencible'].includes(a)) {
        TOGGLE_STATE[a] = !TOGGLE_STATE[a]
        if (a === 'noclip') {
          delJuego({ action: 'controles', grupos: TOGGLE_STATE.noclip ? [MOCK_CONTROLES_NOCLIP] : [] }, 60)
        }
        return { mensaje: `${a} ${TOGGLE_STATE[a] ? 'activado' : 'desactivado'}`, activo: TOGGLE_STATE[a] }
      }
      return { mensaje: `${a} ejecutado` }
    }
    case 'controles':
      return { ok: true, grupos: TOGGLE_STATE.noclip ? [MOCK_CONTROLES_NOCLIP] : [], posicion: 'bottom-right' }
    case 'jugadores':
      delJuego({ action: 'players', players: MOCK_PLAYERS }, 80)
      return { ok: true }
    case 'jugador': {
      const a = data.accion as string
      const quien = MOCK_PLAYERS.find(p => p.id === Number(data.id))?.nombre ?? `#${data.id}`
      if (a === 'congelar') {
        return { mensaje: data.valor ? `${quien} congelado.` : `${quien} descongelado.`, activo: !!data.valor }
      }
      if (a === 'espectar') {
        TOGGLE_STATE.espectar = !TOGGLE_STATE.espectar
        return {
          mensaje: TOGGLE_STATE.espectar ? 'Espectando. Púlsalo otra vez para salir.' : 'Dejas de espectar.',
          activo: TOGGLE_STATE.espectar,
        }
      }
      const TEXTOS: Record<string, string> = {
        ir: `Vas hacia ${quien}.`,
        traer: `Has traído a ${quien}.`,
        echar: `${quien} expulsado.`,
        avisar: `Aviso enviado a ${quien}.`,
        curar: `${quien} curado.`,
      }
      return { mensaje: TEXTOS[a] ?? `Jugador: ${a} (demo)` }
    }
    case 'identificadores': {
      const quien = MOCK_PLAYERS.find(p => p.id === Number(data.id))
      delJuego({
        action: 'ids',
        info: {
          id: data.id,
          nombre: quien?.nombre ?? 'Jugador',
          identificadores: {
            license: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
            discord: '198273645192837465',
            steam: '110000112345678',
            fivem: '4821903',
            ip: '84.123.45.6',
          },
        },
      })
      return { ok: true }
    }
    case 'spawnVehiculo':
      return { mensaje: `Vehículo "${data.modelo}" aparecido`, ok: true }
    case 'coordenadas':
      return { mensaje: `Teletransportado a ${data.x}, ${data.y}` }
    case 'sitio':
      return { mensaje: `Teletransportado: ${data.sitio}` }
    case 'donde':
      return {
        x: -269.41,
        y: -955.32,
        z: 31.22,
        h: 183.47,
        texto: '-269.41, -955.32, 31.22',
        completo: 'vector4(-269.41, -955.32, 31.22, 183.47)',
      }
    case 'vehiculo': {
      const a = data.accion as string
      if (a === 'matricula') return { mensaje: `Matrícula: ${data.texto}` }
      return { mensaje: `Vehículo: ${a}` }
    }
    case 'arma':
      return { mensaje: data.accion === 'dar' ? `Arma "${data.nombre}" dada` : 'Operación realizada' }
    case 'mundo':
      return { mensaje: data.hora !== undefined ? `Hora: ${data.hora}:00` : `Clima: ${data.clima}` }
    case 'anuncio':
      return { mensaje: `Anuncio enviado` }
    case 'limpiarZona':
      return { mensaje: `Zona de ${data.radio}m limpiada` }
    case 'banear': {
      const quien = MOCK_PLAYERS.find(p => p.id === Number(data.id))?.nombre ?? `#${data.id}`
      return { ok: true, mensaje: `${quien} baneado y registrado.` }
    }
    case 'estado':
      return TOGGLE_STATE
    case 'favoritos': {
      if (Array.isArray(data.guardar)) {
        try {
          localStorage.setItem('vxcore:favoritos', JSON.stringify(data.guardar))
        } catch {}
        return { ok: true }
      }
      try {
        const crudo = localStorage.getItem('vxcore:favoritos')
        return { lista: crudo ? JSON.parse(crudo) : [] }
      } catch {
        return { lista: [] }
      }
    }
    case 'atajos': {
      if (data.guardar && typeof data.guardar === 'object') {
        try {
          localStorage.setItem('vxcore:atajos', JSON.stringify(data.guardar))
        } catch {}
        return { ok: true }
      }
      let guardado: { activos?: boolean; lista?: unknown[] } = {}
      try {
        guardado = JSON.parse(localStorage.getItem('vxcore:atajos') || '{}')
      } catch {
        guardado = {}
      }
      return {
        activos: guardado.activos !== false,
        lista: Array.isArray(guardado.lista) ? guardado.lista : [],
        maximo: 12,
        teclaMenu: 'F5',
        permitidos: true,
      }
    }
    case 'consola':
      return { ok: true, mensaje: `Ejecutado: ${String(data.comando || '')}` }
    case 'avisos':
      return { posicion: 'top-center', duracion: 5000 }
    case 'close':
      return { ok: true }
    default:
      return { mensaje: `[Demo] ${route}` }
  }
}

declare function GetParentResourceName(): string
