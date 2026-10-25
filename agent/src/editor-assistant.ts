import fs from 'fs';
import path from 'path';
import type { AgentToolDef } from './agent-tools';
import type { ChatMessage } from './ai';
import { EDITABLE_EXTENSIONS, resolveInsideResource, resolveResourceDir, scanResourcesOnDisk } from './disk-resources';
import { tr } from './idioma';

export function buildEditorSystemPrompt(ctx: {
  resource?: string;
  framework?: string;
  database?: string;
  name?: string;
  files?: string[];
  activeFile?: string;
  currentCode?: string;
  withTools?: boolean;
  soloPlan?: boolean;
}): string {
  return [
    'Eres un asistente experto en desarrollo de recursos para FiveM (FXServer) y Lua, integrado en el panel VXCore.',
    'Trabajas sobre el servidor real del usuario: lo que ves es lo que hay en disco, no un ejemplo.',
    'Responde en el idioma en que te escriba el usuario (normalmente español).',
    '',
    '== Servidor ==',
    `Nombre: ${ctx.name || 'desconocido'}`,
    `Framework: ${ctx.framework || 'desconocido'}`,
    `Base de datos: ${ctx.database || 'desconocida'}`,
    `Recurso abierto: ${ctx.resource || 'desconocido'}`,
    '',
    '== Ficheros ==',
    Array.isArray(ctx.files) && ctx.files.length > 0
      ? `Ficheros del recurso: ${ctx.files.slice(0, 80).join(', ')}`
      : 'No se ha podido listar el contenido del recurso.',
    ctx.activeFile ? `El usuario está editando: ${ctx.activeFile}` : '',
    ctx.currentCode ? `Contenido actual de ese fichero:\n\n\`\`\`lua\n${ctx.currentCode}\n\`\`\`` : '',
    '',
    '== Reglas del oficio (FiveM actual) ==',
    '- Lua 5.4 y fxmanifest.lua con fx_version (preferible cerulean o superior).',
    '- Usa ox_lib (lib.callback, lib.callback.await, oxmysql) cuando el servidor lo tenga; si no',
    '  aparece en el contexto, usa la API nativa y dilo.',
    '- Prefiere callbacks a exports cuando cruces cliente↔servidor y evita cadenas largas de eventos',
    '  si no son necesarias.',
    '- Nunca bloquees el hilo principal: para trabajo pesado usa Citizen.CreateThread/CreateThread y',
    '  para esperas de red callbacks o Promises, no Citizen.Wait en bucle.',
    '- Respeta el scope: client scripts corren en el cliente y server scripts en el servidor; no mezcles',
    '  APIs de un lado en el otro.',
    '- Escrow/obfuscación: no intentes descifrar ni modificar scripts protegidos.',
    '- server.cfg: convars con `set`, recursos con `ensure` y la conexión de oxmysql con',
    '  `set mysql_connection_string` (formato user=..;database=..;host=..;password=..).',
    '- Cambios mínimos y seguros: no reescribas un fichero entero por un ajuste pequeño salvo que el',
    '  usuario pida una refactorización.',
    '',
    ctx.withTools ? '== Herramientas ==' : '',
    ctx.withTools
      ? 'Tienes herramientas para mirar el servidor de verdad. Úsalas antes de suponer nada:'
      : '',
    ctx.withTools
      ? '- `listar_ficheros` y `leer_fichero`: el recurso tiene más ficheros que el que está abierto,'
      : '',
    ctx.withTools
      ? '  y la lógica suele repartirse entre cliente, servidor y fxmanifest. Léelos antes de responder.'
      : '',
    ctx.withTools
      ? '- `buscar_en_recursos`: para saber quién dispara o escucha un evento, o quién usa un export.'
      : '',
    ctx.withTools ? '- `plan`: sólo en tareas de varios pasos, antes de empezar.' : '',
    ctx.withTools
      ? '- `preguntar`: cuando la decisión sea del usuario y no tuya (qué camino prefiere, si borrar algo).'
      : '',
    ctx.withTools
      ? '  No la uses para lo que puedes averiguar leyendo: preguntar lo que está en un fichero molesta.'
      : '',
    ctx.withTools
      ? '- `proponer_cambio`: una llamada por fichero, con el contenido COMPLETO ya modificado.'
      : '',
    ctx.withTools
      ? 'La propuesta NO se aplica: la aprueba el usuario en el panel. No digas que ya está hecho.'
      : '',
    ctx.withTools ? '' : '',
    ctx.soloPlan ? '== MODO PLAN ==' : '',
    ctx.soloPlan
      ? 'El usuario quiere ENTENDER el cambio antes de que lo toques. En este turno:'
      : '',
    ctx.soloPlan ? '- Investiga con las herramientas de lectura todo lo que haga falta.' : '',
    ctx.soloPlan
      ? '- Declara los pasos con `plan`, concretos: qué fichero y qué se cambia en él.'
      : '',
    ctx.soloPlan
      ? '- NO propongas cambios. No tienes `proponer_cambio` en este turno, y no es un olvido.'
      : '',
    ctx.soloPlan
      ? '- Termina diciendo qué harías y qué dudas te quedan. El usuario aprobará (o no) y entonces lo harás.'
      : '',
    ctx.soloPlan ? '' : '',
    '== Formato de la respuesta ==',
    ctx.withTools
      ? 'Para cambiar ficheros usa `proponer_cambio`, nunca bloques de código en el texto: el panel'
      : 'Cuando propongas cambios en un fichero, devuelve su contenido COMPLETO en un único bloque',
    ctx.withTools
      ? 'enseña un diff con la propuesta, y pegar el fichero entero en la respuesta lo duplica.'
      : 'de código cuya etiqueta sea el lenguaje y la ruta relativa, así: \`\`\`lua:server/main.lua',
    'Explica en una o dos frases qué cambiaste y por qué.',
    'No inventes exports ni eventos de recursos que no aparezcan en el contexto: si necesitas algo',
    ctx.withTools
      ? 'que no está, búscalo con las herramientas; y si sigue sin aparecer, dilo en lugar de suponerlo.'
      : 'que no está, dilo en lugar de suponerlo.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildAiMessages(history: unknown, message: string, images?: string[]): ChatMessage[] {
  return [
    ...(Array.isArray(history) ? history.slice(-10) : []),
    { role: 'user' as const, content: message, images: Array.isArray(images) ? images : undefined },
  ];
}

export function buildEditorTools(ctx: {
  serverDataPath?: string;
  resource?: string;
  onProposal: (proposal: { file: string; newCode: string; summary?: string }) => void;
  onPlan: (steps: string[]) => void;
  onQuestion: (question: { pregunta: string; opciones: string[]; cabecera?: string }) => void;
}): AgentToolDef[] {
  const { serverDataPath, resource } = ctx;

  const dirFor = (name?: string): string => {
    if (!serverDataPath) throw new Error(tr('No sé dónde está el servidor en disco.'));
    const target = (name as string) || resource;
    if (!target) throw new Error(tr('No hay ningún recurso abierto.'));
    const dir = resolveResourceDir(serverDataPath, String(target));
    if (!dir) {
      const pista =
        resource && String(target) !== resource
          ? ` El recurso que tiene abierto el usuario se llama "${resource}".`
          : '';
      throw new Error(tr('El recurso "{target}" no existe en este servidor.{pista}', { target, pista }));
    }
    return dir;
  };

  const listFiles = (dir: string, limit = 400): string[] => {
    const out: string[] = [];
    const walk = (current: string, base = '', depth = 0) => {
      if (depth > 8 || out.length >= limit) return;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path.join(current, entry.name), rel, depth + 1);
        else if (out.length < limit) out.push(rel);
      }
    };
    walk(dir);
    return out;
  };

  return [
    {
      name: 'listar_ficheros',
      description:
        tr('Lista los ficheros de un recurso del servidor. Úsalo antes de suponer qué ficheros existen.'),
      schema: {
        type: 'object',
        properties: {
          recurso: {
            type: 'string',
            description: tr('Nombre del recurso. Si se omite, el que tiene abierto el usuario.'),
          },
        },
      },
      run: ({ recurso }) => {
        const dir = dirFor(recurso as string | undefined);
        const files = listFiles(dir);
        return files.length ? files.join('\n') : 'El recurso no tiene ficheros.';
      },
    },
    {
      name: 'leer_fichero',
      description:
        tr('Devuelve el contenido de un fichero del recurso. La ruta es relativa a la carpeta del recurso, por ejemplo "server/main.lua".'),
      schema: {
        type: 'object',
        properties: {
          ruta: { type: 'string', description: tr('Ruta relativa dentro del recurso.') },
          recurso: { type: 'string', description: tr('Recurso. Por defecto, el abierto.') },
        },
        required: ['ruta'],
      },
      run: ({ ruta, recurso }) => {
        const dir = dirFor(recurso as string | undefined);
        const target = resolveInsideResource(dir, String(ruta));
        if (!target) throw new Error(tr('Esa ruta se sale de la carpeta del recurso.'));
        if (!fs.existsSync(target)) throw new Error(tr('No existe {ruta} en el recurso.', { ruta: String(ruta) }));
        if (fs.statSync(target).isDirectory()) throw new Error(tr('{ruta} es una carpeta.', { ruta: String(ruta) }));
        return fs.readFileSync(target, 'utf-8');
      },
    },
    {
      name: 'buscar_en_recursos',
      description:
        tr('Busca un texto (nombre de evento, export, función) en los ficheros de código del servidor y devuelve fichero, línea y contenido. Es la forma de saber quién dispara o escucha algo.'),
      schema: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: tr('Lo que se busca. No es una expresión regular.') },
          recurso: {
            type: 'string',
            description: tr('Limita la búsqueda a un recurso. Sin esto busca en todos.'),
          },
        },
        required: ['texto'],
      },
      run: ({ texto, recurso }) => {
        if (!serverDataPath) throw new Error(tr('No sé dónde está el servidor en disco.'));
        const needle = String(texto).toLowerCase();
        if (needle.length < 2) throw new Error(tr('Busca algo un poco más largo.'));

        const roots = recurso
          ? [{ name: String(recurso), path: dirFor(String(recurso)) }]
          : scanResourcesOnDisk(path.join(serverDataPath, 'resources'));

        const hits: string[] = [];
        const MAX_HITS = 80;

        for (const root of roots) {
          if (hits.length >= MAX_HITS) break;
          for (const rel of listFiles(root.path, 300)) {
            if (hits.length >= MAX_HITS) break;
            if (!EDITABLE_EXTENSIONS.has(path.extname(rel).toLowerCase())) continue;
            const full = path.join(root.path, rel);
            try {
              if (fs.statSync(full).size > 2_000_000) continue;
              const lines = fs.readFileSync(full, 'utf-8').split(/\r?\n/);
              lines.forEach((line, index) => {
                if (hits.length >= MAX_HITS) return;
                if (line.toLowerCase().includes(needle)) {
                  hits.push(`${root.name}/${rel}:${index + 1}: ${line.trim().slice(0, 200)}`);
                }
              });
            } catch {}
          }
        }

        return hits.length
          ? hits.join('\n')
          : `Ningún fichero contiene "${texto}".`;
      },
    },
    {
      name: 'plan',
      description:
        tr('Declara los pasos que vas a seguir ANTES de tocar nada, para que el usuario vea el alcance. Úsalo sólo en tareas de varios pasos.'),
      schema: {
        type: 'object',
        properties: {
          pasos: {
            type: 'array',
            items: { type: 'string' },
            description: tr('Los pasos, en orden y en una frase cada uno.'),
          },
        },
        required: ['pasos'],
      },
      run: ({ pasos }) => {
        const steps = Array.isArray(pasos) ? pasos.map(String).slice(0, 12) : [];
        if (steps.length === 0) throw new Error(tr('El plan está vacío.'));
        ctx.onPlan(steps);
        return `Plan anotado (${steps.length} pasos). Sigue adelante.`;
      },
    },
    {
      name: 'preguntar',
      description:
        tr('Pregunta al usuario cuando una decisión es SUYA y no tuya: qué framework usar, si borrar algo, cuál de dos caminos prefiere. No la uses para lo que puedes averiguar leyendo ficheros.'),
      schema: {
        type: 'object',
        properties: {
          pregunta: { type: 'string', description: tr('La pregunta, en una frase y terminada en interrogación.') },
          opciones: {
            type: 'array',
            items: { type: 'string' },
            description: tr('Entre 2 y 4 respuestas posibles, cortas y excluyentes.'),
          },
          cabecera: { type: 'string', description: tr('Dos o tres palabras que resuman de qué va.') },
        },
        required: ['pregunta', 'opciones'],
      },
      run: ({ pregunta, opciones, cabecera }) => {
        const texto = String(pregunta || '').trim();
        const lista = Array.isArray(opciones)
          ? opciones.map(String).map((o) => o.trim()).filter(Boolean).slice(0, 4)
          : [];

        if (!texto) throw new Error(tr('La pregunta está vacía.'));
        if (lista.length < 2) throw new Error(tr('Hacen falta al menos dos opciones.'));

        ctx.onQuestion({ pregunta: texto, opciones: lista, cabecera: cabecera ? String(cabecera) : undefined });

        return (
          'Pregunta enviada al usuario. TERMINA EL TURNO AHORA, sin llamar a más herramientas ' +
          'y sin suponer la respuesta: llegará en el siguiente mensaje.'
        );
      },
    },
    {
      name: 'proponer_cambio',
      description:
        tr('Propone el contenido COMPLETO y nuevo de un fichero. No lo escribe: el usuario ve el diff y decide. Usa una llamada por fichero.'),
      schema: {
        type: 'object',
        properties: {
          ruta: { type: 'string', description: tr('Ruta relativa dentro del recurso.') },
          contenido: { type: 'string', description: tr('El fichero entero, ya modificado.') },
          resumen: { type: 'string', description: tr('Una frase: qué cambia y por qué.') },
        },
        required: ['ruta', 'contenido'],
      },
      run: ({ ruta, contenido, resumen }) => {
        const file = String(ruta);
        if (resource && serverDataPath) {
          const dir = resolveResourceDir(serverDataPath, resource);
          if (dir && !resolveInsideResource(dir, file)) {
            throw new Error(tr('Esa ruta se sale de la carpeta del recurso.'));
          }
        }
        ctx.onProposal({ file, newCode: String(contenido), summary: resumen ? String(resumen) : undefined });
        return `Propuesta registrada para ${file}. El usuario la revisará en el panel; no des por hecho que está aplicada.`;
      },
    },
  ];
}
