# Política de seguridad

## Versiones con soporte

Solo la última versión publicada recibe parches de seguridad. La app de escritorio se actualiza sola.

| Versión | Soporte |
| ------- | ------- |
| Última release | Sí |
| Anteriores | No |

## Informar de una vulnerabilidad

No abras un issue público. Usa el aviso privado de GitHub: pestaña **Security → Report a vulnerability** de este repositorio.

Incluye, si puedes:

- Qué parte afecta: panel, agente, app de escritorio o recurso in-game.
- Pasos para reproducirlo y qué acceso hace falta (sin sesión, moderador, admin…).
- Si requiere el acceso remoto encendido o funciona también en local.

Recibirás respuesta en un plazo de 7 días. Si se confirma, el arreglo sale en una release y se te menciona en las notas, salvo que prefieras lo contrario.

## Alcance

El agente lanza procesos, lee y escribe ficheros y guarda credenciales de MySQL, Discord y proveedores de IA. Se trata con prioridad máxima cualquier fallo que permita, sin ser el dueño del panel:

- ejecutar programas o comandos en la máquina del agente,
- leer o escribir ficheros fuera de los servidores dados de alta,
- obtener una sesión con más nivel del concedido,
- leer la consola o los datos del servidor por el acceso remoto sin sesión.

## Modelo de confianza

- **Dueño**: la cuenta de Discord que vinculó el panel desde la propia máquina. Control total.
- **Admin**: puede editar y arrancar recursos del servidor. Un recurso de FiveM puede ejecutar código en la máquina, así que da este nivel solo a personas de total confianza.
- **Moderador**: jugadores, sanciones y consulta.

Por defecto el agente solo escucha en `127.0.0.1`. Si lo expones con `HOST=0.0.0.0`, hazlo detrás de HTTPS y con el inicio de sesión de Discord obligatorio.

## Medidas automáticas

- [CodeQL](.github/workflows/codeql.yml) analiza cada push y pull request.
- [Dependabot](.github/dependabot.yml) revisa dependencias y acciones cada semana.
- [OpenSSF Scorecard](.github/workflows/scorecard.yml) evalúa las prácticas del repositorio.
- Las releases incluyen sumas SHA-256 y una atestación de procedencia (`gh attestation verify`).
