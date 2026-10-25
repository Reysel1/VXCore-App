import type { Plugin } from 'vite'

type RGBA = [number, number, number, number]

function lineal(x: number) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}

function numero(valor: string, escalaPorcentaje = 1): number {
  const v = valor.trim()
  if (v === 'none') return 0
  if (v.endsWith('%')) return (parseFloat(v) / 100) * escalaPorcentaje
  if (v.endsWith('deg')) return parseFloat(v)
  return parseFloat(v)
}

function oklch(interior: string): RGBA | null {
  const [color, alfa] = interior.split('/')
  const partes = color.trim().split(/\s+/)
  if (partes.length !== 3) return null

  const L = numero(partes[0])
  const C = numero(partes[1], 0.4)
  const H = (numero(partes[2]) * Math.PI) / 180
  const a = C * Math.cos(H)
  const b = C * Math.sin(H)

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  const canal = (x: number) => Math.round(Math.min(1, Math.max(0, lineal(x))) * 255)
  return [
    canal(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    canal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    canal(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alfa === undefined ? 1 : Math.min(1, Math.max(0, numero(alfa))),
  ]
}

function hex(valor: string): RGBA | null {
  let h = valor.slice(1)
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('')
  if (h.length !== 6 && h.length !== 8) return null
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
}

function aTexto([r, g, b, a]: RGBA): string {
  const dos = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  const base = `#${dos(r)}${dos(g)}${dos(b)}`
  return a >= 1 ? base : `${base}${dos(a * 255)}`
}

function trocear(texto: string): string[] {
  const partes: string[] = []
  let nivel = 0
  let actual = ''
  for (const c of texto) {
    if (c === '(') nivel++
    if (c === ')') nivel--
    if (c === ',' && nivel === 0) {
      partes.push(actual.trim())
      actual = ''
    } else {
      actual += c
    }
  }
  partes.push(actual.trim())
  return partes
}

function* llamadas(css: string, nombre: string) {
  let desde = 0
  for (;;) {
    const inicio = css.indexOf(`${nombre}(`, desde)
    if (inicio < 0) return
    let nivel = 0
    let fin = inicio + nombre.length
    for (; fin < css.length; fin++) {
      if (css[fin] === '(') nivel++
      if (css[fin] === ')' && --nivel === 0) break
    }
    yield { inicio, fin: fin + 1, interior: css.slice(inicio + nombre.length + 1, fin) }
    desde = fin + 1
  }
}

function sustituir(css: string, nombre: string, calcular: (interior: string) => string | null): string {
  let salida = ''
  let ultimo = 0
  for (const { inicio, fin, interior } of llamadas(css, nombre)) {
    if (/[a-z-]/i.test(css[inicio - 1] ?? '')) continue
    const nuevo = calcular(interior)
    if (nuevo === null) continue
    salida += css.slice(ultimo, inicio) + nuevo
    ultimo = fin
  }
  return salida + css.slice(ultimo)
}

const NOMBRES: Record<string, RGBA> = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
}

function resolver(valor: string, variables: Map<string, string>, profundidad = 0): RGBA | null {
  const v = valor.trim()
  if (profundidad > 8) return null
  if (v.startsWith('#')) return hex(v)
  if (NOMBRES[v.toLowerCase()]) return NOMBRES[v.toLowerCase()]
  const variable = v.match(/^var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)$/)
  if (variable) {
    const definido = variables.get(variable[1]) ?? variable[2]
    return definido ? resolver(definido, variables, profundidad + 1) : null
  }
  return null
}

function mezclar(interior: string, variables: Map<string, string>): string | null {
  const [espacio, ...colores] = trocear(interior)
  if (!/^in\s/.test(espacio) || colores.length !== 2) return null

  const leer = (parte: string) => {
    const m = parte.match(/^(.*?)(?:\s+([\d.]+)%)?$/)
    return { color: resolver(m?.[1] ?? '', variables), p: m?.[2] !== undefined ? parseFloat(m[2]) : undefined }
  }
  const A = leer(colores[0])
  const B = leer(colores[1])
  if (!A.color || !B.color) return null

  let pa = A.p ?? (B.p !== undefined ? 100 - B.p : 50)
  let pb = B.p ?? 100 - pa
  const suma = pa + pb
  const multiplicador = suma < 100 ? suma / 100 : 1
  pa /= suma
  pb /= suma

  const alfa = A.color[3] * pa + B.color[3] * pb
  const canal = (i: number) => (alfa === 0 ? 0 : (A.color![i] * A.color![3] * pa + B.color![i] * B.color![3] * pb) / alfa)
  return aTexto([canal(0), canal(1), canal(2), alfa * multiplicador])
}

const PRUEBA_COLOR_MIX = '@supports (color:color-mix(in lab,red,red))'

function abrirSupports(css: string): string {
  let salida = ''
  let desde = 0
  for (;;) {
    const inicio = css.indexOf(PRUEBA_COLOR_MIX, desde)
    if (inicio < 0) return salida + css.slice(desde)
    const llave = css.indexOf('{', inicio)
    let nivel = 0
    let fin = llave
    for (; fin < css.length; fin++) {
      if (css[fin] === '{') nivel++
      if (css[fin] === '}' && --nivel === 0) break
    }
    const contenido = css.slice(llave + 1, fin)
    salida += css.slice(desde, inicio) + (contenido.includes('color-mix(') ? css.slice(inicio, fin + 1) : contenido)
    desde = fin + 1
  }
}

export function paraChromium103(css: string): string {
  let salida = sustituir(css, 'oklch', interior => {
    const color = oklch(interior)
    return color ? aTexto(color) : null
  })

  const variables = new Map<string, string>()
  for (const m of salida.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    if (!variables.has(m[1])) variables.set(m[1], m[2].trim())
  }

  for (let i = 0; i < 3; i++) {
    salida = sustituir(salida, 'color-mix', interior => (interior === 'in lab,red,red' ? null : mezclar(interior, variables)))
  }

  return abrirSupports(salida)
}

function sinSupportsDeColorMix(css: string): string {
  let salida = ''
  let desde = 0
  for (;;) {
    const inicio = css.indexOf(PRUEBA_COLOR_MIX, desde)
    if (inicio < 0) return salida + css.slice(desde)
    let nivel = 0
    let fin = css.indexOf('{', inicio)
    for (; fin < css.length; fin++) {
      if (css[fin] === '{') nivel++
      if (css[fin] === '}' && --nivel === 0) break
    }
    salida += css.slice(desde, inicio)
    desde = fin + 1
  }
}

export function incompatibles(css: string): string[] {
  const visible = sinSupportsDeColorMix(css)
  const restos: string[] = []
  for (const funcion of ['oklch', 'oklab', 'lch', 'lab', 'color-mix']) {
    for (const { inicio, interior } of llamadas(visible, funcion)) {
      if (/[a-z-]/i.test(visible[inicio - 1] ?? '')) continue
      restos.push(`${funcion}(${interior})`)
    }
  }
  return restos
}

export default function cef103(): Plugin {
  return {
    name: 'vxcore:cef-103',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const fichero of Object.values(bundle)) {
        if (fichero.type !== 'asset' || !fichero.fileName.endsWith('.css')) continue
        const css = paraChromium103(String(fichero.source))
        const restos = incompatibles(css)
        if (restos.length > 0) {
          this.error(
            `El CSS del menú usa colores que el navegador de FiveM (Chromium 103) no entiende:\n  ` +
              [...new Set(restos)].slice(0, 12).join('\n  ')
          )
        }
        fichero.source = css
      }
    },
  }
}
