import { msg, t } from '@/i18n'

export interface TeclaAtajo {
  code: string
  etiqueta: string
  control: number
  uso?: string
}

const USO_ARMA = msg('En el juego también cambia de arma.')
const USO_AVION = msg('En el juego también se usa para pilotar aviones.')
const USO_RADIO = msg('En el juego también cambia la emisora del vehículo.')

const TECLAS: TeclaAtajo[] = [
  { code: 'F1', etiqueta: 'F1', control: 288 },
  { code: 'F2', etiqueta: 'F2', control: 289 },
  { code: 'F3', etiqueta: 'F3', control: 170 },
  { code: 'F5', etiqueta: 'F5', control: 166 },
  { code: 'F6', etiqueta: 'F6', control: 167 },
  { code: 'F7', etiqueta: 'F7', control: 168 },
  { code: 'F9', etiqueta: 'F9', control: 56 },
  { code: 'F10', etiqueta: 'F10', control: 57 },

  { code: 'Digit1', etiqueta: '1', control: 157, uso: USO_ARMA },
  { code: 'Digit2', etiqueta: '2', control: 158, uso: USO_ARMA },
  { code: 'Digit3', etiqueta: '3', control: 160, uso: USO_ARMA },
  { code: 'Digit4', etiqueta: '4', control: 164, uso: USO_ARMA },
  { code: 'Digit5', etiqueta: '5', control: 165, uso: USO_ARMA },
  { code: 'Digit6', etiqueta: '6', control: 159, uso: USO_ARMA },
  { code: 'Digit7', etiqueta: '7', control: 161, uso: USO_ARMA },
  { code: 'Digit8', etiqueta: '8', control: 162, uso: USO_ARMA },
  { code: 'Digit9', etiqueta: '9', control: 163, uso: USO_ARMA },

  { code: 'KeyB', etiqueta: 'B', control: 29 },
  { code: 'KeyG', etiqueta: 'G', control: 47 },
  { code: 'KeyH', etiqueta: 'H', control: 74, uso: msg('En el juego también enciende las luces del vehículo.') },
  { code: 'KeyK', etiqueta: 'K', control: 311 },
  { code: 'KeyL', etiqueta: 'L', control: 182 },
  { code: 'KeyM', etiqueta: 'M', control: 244 },
  { code: 'KeyU', etiqueta: 'U', control: 303 },
  { code: 'KeyX', etiqueta: 'X', control: 73 },
  { code: 'KeyY', etiqueta: 'Y', control: 246 },
  { code: 'KeyZ', etiqueta: 'Z', control: 20 },

  { code: 'Backquote', etiqueta: 'º', control: 243 },
  { code: 'Minus', etiqueta: '-', control: 84, uso: USO_RADIO },
  { code: 'Equal', etiqueta: '=', control: 83, uso: USO_RADIO },
  { code: 'Comma', etiqueta: ',', control: 82, uso: USO_RADIO },
  { code: 'Period', etiqueta: '.', control: 81, uso: USO_RADIO },

  { code: 'Insert', etiqueta: msg('Insert'), control: 121 },
  { code: 'Delete', etiqueta: msg('Supr'), control: 178 },
  { code: 'Home', etiqueta: msg('Inicio'), control: 213 },
  { code: 'PageUp', etiqueta: msg('Re Pág'), control: 10 },
  { code: 'PageDown', etiqueta: msg('Av Pág'), control: 11 },

  { code: 'ArrowUp', etiqueta: '↑', control: 172 },
  { code: 'ArrowDown', etiqueta: '↓', control: 173 },
  { code: 'ArrowLeft', etiqueta: '←', control: 174 },
  { code: 'ArrowRight', etiqueta: '→', control: 175 },

  { code: 'Numpad4', etiqueta: 'Num 4', control: 108, uso: USO_AVION },
  { code: 'Numpad6', etiqueta: 'Num 6', control: 107, uso: USO_AVION },
  { code: 'Numpad7', etiqueta: 'Num 7', control: 117, uso: USO_AVION },
  { code: 'Numpad9', etiqueta: 'Num 9', control: 118, uso: USO_AVION },
  { code: 'NumpadAdd', etiqueta: 'Num +', control: 96 },
  { code: 'NumpadSubtract', etiqueta: 'Num -', control: 97 },
]

const POR_CODIGO = new Map(TECLAS.map(tecla => [tecla.code, tecla]))

const NOMBRES_IGUALES = new Set([
  'Escape', 'Enter', 'Tab', 'CapsLock', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
])

const SIGNOS: Record<string, string> = {
  '-': 'Minus', '=': 'Equal', ',': 'Comma', '.': 'Period', '`': 'Backquote', 'º': 'Backquote', ' ': 'Space',
}

export function codigoDe(e: Pick<KeyboardEvent, 'code' | 'key' | 'keyCode'>): string {
  if (e.code) return e.code

  const k = e.keyCode
  if (k >= 112 && k <= 123) return `F${k - 111}`
  if (k >= 48 && k <= 57) return `Digit${k - 48}`
  if (k >= 65 && k <= 90) return `Key${String.fromCharCode(k)}`
  if (k >= 96 && k <= 105) return `Numpad${k - 96}`
  const porKeyCode: Record<number, string> = {
    107: 'NumpadAdd', 109: 'NumpadSubtract', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
    33: 'PageUp', 34: 'PageDown', 36: 'Home', 45: 'Insert', 46: 'Delete', 27: 'Escape', 13: 'Enter', 9: 'Tab',
    32: 'Space', 16: 'ShiftLeft', 17: 'ControlLeft', 18: 'AltLeft', 20: 'CapsLock',
    189: 'Minus', 187: 'Equal', 188: 'Comma', 190: 'Period', 192: 'Backquote',
  }
  if (porKeyCode[k]) return porKeyCode[k]

  const key = e.key ?? ''
  if (/^F([1-9]|1[0-2])$/.test(key)) return key
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`
  if (NOMBRES_IGUALES.has(key)) return key
  if (key === 'Shift' || key === 'Control' || key === 'Alt') return `${key}Left`
  return SIGNOS[key] ?? ''
}

export function teclaPorCodigo(code: string): TeclaAtajo | undefined {
  return POR_CODIGO.get(code)
}

const DE_TECLADO = /^Key[A-Z]$|^(Backquote|Minus|Equal|Comma|Period)$/

export const esDeTeclado = (code: string) => DE_TECLADO.test(code)

export function etiquetaDeTecla(code: string, guardada: string): string {
  const fila = POR_CODIGO.get(code)
  if (!fila || esDeTeclado(code)) return guardada
  return t(fila.etiqueta)
}

export function motivoTeclaNoValida(code: string): string {
  if (/^Key[WASD]$/.test(code) || code === 'Space' || code.startsWith('Shift') || code.startsWith('Control') || code.startsWith('Alt')) {
    return msg('Esa tecla ya mueve al personaje: el atajo saltaría cada vez que caminas.')
  }
  if (code === 'KeyT' || code === 'Enter' || code === 'NumpadEnter') return msg('Esa tecla es la del chat.')
  if (code === 'F8') return msg('F8 abre la consola de FiveM.')
  if (code === 'KeyP' || code === 'Escape') return msg('Esa tecla abre el menú de pausa.')
  if (code === 'KeyN' || code === 'CapsLock') return msg('Esa tecla se usa para hablar por voz.')
  if (/^Key[QERFCV]$/.test(code) || code === 'Tab') {
    return msg('Esa tecla ya hace algo importante en el juego (disparar, entrar al vehículo, la cámara…).')
  }
  return msg('Esa tecla no se puede usar para un atajo.')
}
