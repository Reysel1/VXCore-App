fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'vxcore'
author 'VXCore'
description 'Menú in-game de VXCore y conexión con su agente'
version '2.1.0'

shared_scripts {
    'config.lua',
    'source/src/shared/utils.lua',
    'source/src/shared/idioma.lua',
}

client_scripts {
    'source/src/client/utils.lua',
    'source/src/client/modules/agente/idioma.lua',
    'source/src/client/bridge/framework.lua',
    'source/src/client/init.lua',
    'source/src/client/modules/avisos/avisos.lua',
    'source/src/client/modules/controles/controles.lua',
    'source/src/client/modules/menu/nui.lua',
    'source/src/client/modules/atajos/atajos.lua',
    'source/src/client/modules/personaje/salud.lua',
    'source/src/client/modules/personaje/noclip.lua',
    'source/src/client/modules/personaje/armas.lua',
    'source/src/client/modules/teleport/teleport.lua',
    'source/src/client/modules/vehiculo/vehiculo.lua',
    'source/src/client/modules/mundo/mundo.lua',
    'source/src/client/modules/jugadores/jugadores.lua',
    'source/src/client/modules/jugadores/objetivo.lua',
    'source/src/client/modules/agente/puente.lua',
}

server_scripts {
    'source/src/server/utils.lua',
    'source/src/server/modules/agente/idioma.lua',
    'source/src/server/bridge/framework.lua',
    'source/src/server/init.lua',
    'source/src/server/modules/avisos/avisos.lua',
    'source/src/server/modules/permisos/permisos.lua',
    'source/src/server/modules/agente/latido.lua',
    'source/src/server/modules/agente/whitelist.lua',
    'source/src/server/modules/agente/consola.lua',
    'source/src/server/modules/agente/puente.lua',
    'source/src/server/modules/jugadores/jugadores.lua',
    'source/src/server/modules/jugadores/sanciones.lua',
    'source/src/server/modules/mundo/mundo.lua',
    'source/src/server/modules/personaje/armas.lua',
}

ui_page 'source/nui/assets/index.html'

files {
    'source/nui/assets/**',
    'source/locales/*.json',
}
