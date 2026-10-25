export async function copiar(texto: string): Promise<boolean> {
  if (!texto) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {}

  try {
    const caja = document.createElement('textarea')
    caja.value = texto
    caja.setAttribute('readonly', '')
    caja.style.position = 'fixed'
    caja.style.top = '-1000px'
    caja.style.opacity = '0'
    document.body.appendChild(caja)
    caja.select()
    const bien = document.execCommand('copy')
    document.body.removeChild(caja)
    return bien
  } catch {
    return false
  }
}
