const NOTAS = [
  { frecuencia: 783.99, inicio: 0, duracion: 0.9 },
  { frecuencia: 1046.5, inicio: 0.09, duracion: 0.9 },
  { frecuencia: 1318.51, inicio: 0.18, duracion: 1.6 },
];

const PARCIALES = [
  { multiplo: 1, volumen: 1 },
  { multiplo: 2.01, volumen: 0.22 },
  { multiplo: 3.02, volumen: 0.06 },
];

export function reproducirSonidoAviso(volumen = 0.5): void {
  const nivel = Math.min(1, Math.max(0, Number.isFinite(volumen) ? volumen : 0.5));
  if (nivel === 0 || typeof window === "undefined") return;

  const Contexto =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Contexto) return;

  let ctx: AudioContext;
  try {
    ctx = new Contexto();
  } catch {
    return;
  }
  void ctx.resume?.().catch(() => {});

  const ahora = ctx.currentTime + 0.02;

  const salida = ctx.createGain();
  salida.gain.value = nivel * 0.32;
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = 5200;
  filtro.connect(salida);
  salida.connect(ctx.destination);

  const eco = ctx.createDelay(1);
  eco.delayTime.value = 0.16;
  const retorno = ctx.createGain();
  retorno.gain.value = 0.22;
  const mezclaEco = ctx.createGain();
  mezclaEco.gain.value = 0.3;
  eco.connect(retorno);
  retorno.connect(eco);
  eco.connect(mezclaEco);
  mezclaEco.connect(filtro);

  for (const nota of NOTAS) {
    const t = ahora + nota.inicio;
    for (const parcial of PARCIALES) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = nota.frecuencia * parcial.multiplo;

      const env = ctx.createGain();
      const caida = nota.duracion / Math.sqrt(parcial.multiplo);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(parcial.volumen, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t + caida);

      osc.connect(env);
      env.connect(filtro);
      env.connect(eco);
      osc.start(t);
      osc.stop(t + caida + 0.05);
    }
  }

  const total = Math.max(...NOTAS.map((n) => n.inicio + n.duracion)) + 1;
  window.setTimeout(() => void ctx.close?.().catch(() => {}), total * 1000);
}
