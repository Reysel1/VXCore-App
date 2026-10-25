local ACTIVA = GetConvarInt('fiveos_whitelist', 1) ~= 0
local ESPERA_MAXIMA = math.max(1500, GetConvarInt('fiveos_whitelist_timeout', 8000))
local RECUERDO_MS = 10 * 60 * 1000

local MOTIVOS = {
    sin_discord = 'no tiene Discord vinculado',
    no_en_gremio = 'no está en el Discord de la whitelist',
    sin_rol = 'no tiene ningún rol de whitelist',
    sin_bot = 'la whitelist está activa sin token de bot (configúrala en el panel)',
    sin_roles = 'la whitelist está activa sin roles elegidos (configúrala en el panel)',
    bot_sin_acceso = 'el bot no está en el Discord de la whitelist (invítalo desde el panel)',
    error_comprobando = 'no se pudo comprobar con Discord',
}

local politica = { estricta = false, mensaje = VX.t('No tienes acceso a este servidor.') }
local FORZADA = GetConvar('fiveos_whitelist_failsafe', ''):lower()

local agenteVivo = true

local function cierraSiFalla()
    if FORZADA == 'closed' then return true end
    if FORZADA == 'open' then return false end
    return politica.estricta
end

CreateThread(function()
    while true do
        VX.pedirAlAgente('/api/discord/whitelist/policy', 'GET', nil, function(estado, datos)
            agenteVivo = estado == 200 and datos ~= nil
            if datos then
                politica.estricta = datos.strict == true
                politica.mensaje = datos.message or politica.mensaje
            end
        end)
        Wait(60000)
    end
end)

local recuerdo, recordados = {}, 0

local function recordar(discordId)
    if not discordId then return end
    if recuerdo[discordId] == nil then recordados = recordados + 1 end
    recuerdo[discordId] = GetGameTimer() + RECUERDO_MS
    if recordados > 1000 then recuerdo, recordados = {}, 0 end
end

local function olvidar(discordId)
    if not discordId or recuerdo[discordId] == nil then return end
    recuerdo[discordId] = nil
    recordados = recordados - 1
end

local function pasoHacePoco(discordId)
    local caduca = discordId and recuerdo[discordId]
    if not caduca then return false end
    if GetGameTimer() > caduca then
        recuerdo[discordId] = nil
        recordados = recordados - 1
        return false
    end
    return true
end

local secuencia = 0

local function avisarAlPanel(evento, nombre, clave)
    VX.pedirAlAgente('/api/server/connecting', 'POST', { event = evento, name = nombre, key = clave })
end

AddEventHandler('playerConnecting', function(nombre, _, deferrals)
    local src = source
    deferrals.defer()
    Wait(0)

    if not ACTIVA then
        deferrals.done()
        return
    end

    nombre = nombre or 'Jugador'
    local identidad = VX.identidad(src)
    local discordId = identidad.discord
    local terminado = false

    secuencia = secuencia + 1
    local clave = ('%s|%s'):format(tostring(src), secuencia)
    avisarAlPanel('start', nombre, clave)

    local function terminar(motivo)
        if terminado then return end
        terminado = true
        avisarAlPanel('end', nombre, clave)

        if motivo then
            print(('^1[VXCore]^7 Conexión rechazada: %s'):format(nombre))
            deferrals.done(motivo)
        else
            deferrals.done()
        end
    end

    local function sinComprobar(que)
        if cierraSiFalla() then
            print(('^1[VXCore]^7 Whitelist: %s; entrada BLOQUEADA (modo estricto).'):format(que))
            terminar(politica.mensaje)
        else
            print(('^3[VXCore]^7 Whitelist: %s; se permite la entrada.'):format(que))
            terminar()
        end
    end

    if not agenteVivo then
        sinComprobar('el agente no responde')
        return
    end

    local function comprobarWhitelist()
        deferrals.update(VX.t('Comprobando tu acceso...'))
        VX.pedirAlAgente('/api/discord/whitelist/check', 'POST', { discordId = discordId }, function(estado, datos)
            if terminado then return end
            if estado ~= 200 then return sinComprobar('el agente no respondió') end
            if not datos then return sinComprobar('respuesta ilegible del agente') end

            if datos.allowed then
                recordar(discordId)
                terminar()
            else
                local motivo = MOTIVOS[datos.reason] or tostring(datos.reason or VX.t('motivo desconocido'))
                print(('^1[VXCore]^7 Whitelist: %s rechazado (%s).'):format(nombre, motivo))
                terminar(datos.message or politica.mensaje)
            end
        end)
    end

    deferrals.update(VX.t('Comprobando sanciones...'))
    VX.pedirAlAgente('/api/sanctions/check', 'POST', identidad, function(estado, datos)
        if terminado then return end

        if estado == 200 and datos and datos.banned then
            olvidar(discordId)
            terminar(datos.message or VX.t('Estás baneado de este servidor.'))
            return
        end

        if estado ~= 200 then
            print('^3[VXCore]^7 El agente no respondió a las sanciones; se continúa.')
        end

        if pasoHacePoco(discordId) then
            terminar()
            return
        end

        comprobarWhitelist()
    end)

    SetTimeout(ESPERA_MAXIMA, function()
        if not terminado then sinComprobar('las comprobaciones tardaron demasiado') end
    end)
end)
