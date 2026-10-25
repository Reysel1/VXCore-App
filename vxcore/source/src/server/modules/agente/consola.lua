local PROPIOS = {}

PROPIOS['vxcore:drop'] = function(datos)
    if not datos.source then return end
    DropPlayer(tostring(datos.source), tostring(datos.message or VX.t('Expulsado por el staff.')))
    print(('^1[VXCore]^7 Jugador %s expulsado del servidor.'):format(tostring(datos.source)))
end

PROPIOS['vxcore:notify'] = function(datos)
    local destino = tonumber(datos.source)
    if not destino then return end
    local texto = VX.recortar(datos.message)
    if texto == '' then texto = VX.t('Aviso del staff') end

    VX.notify(destino, {
        title = datos.title or 'VXCore',
        description = texto,
        type = datos.type or 'info',
        duration = datos.duration,
        sound = datos.sound == true,
    })
    print(('^2[VXCore]^7 Aviso enviado a %s: %s'):format(destino == -1 and 'todos' or ('el jugador ' .. destino), texto))
end

PROPIOS['vxcore:screen'] = function(datos)
    local objetivo, peticion = datos.source, datos.requestId

    local function contestar(cuerpo)
        cuerpo.requestId = peticion
        cuerpo.source = tonumber(objetivo)
        VX.pedirAlAgente('/api/server/screen-frame', 'POST', cuerpo)
    end

    if not objetivo or not peticion then
        print('^1[VXCore]^7 vxcore:screen necesita "source" y "requestId".')
        return
    end

    if GetResourceState('screenshot-basic') ~= 'started' then
        return contestar({ ok = false, error = 'SCREENSHOT_BASIC_MISSING' })
    end
    if not VX.nombreDe(objetivo) then
        return contestar({ ok = false, error = 'PLAYER_GONE' })
    end

    local bien, fallo = pcall(function()
        exports['screenshot-basic']:requestClientScreenshot(tostring(objetivo), {
            encoding = datos.encoding or 'jpg',
            quality = datos.quality or 0.6,
        }, function(error, imagen)
            if error or not imagen then
                return contestar({ ok = false, error = 'CAPTURE_FAILED' })
            end
            contestar({ ok = true, image = imagen })
        end)
    end)

    if not bien then
        print(('^1[VXCore]^7 No se pudo pedir la captura: %s'):format(tostring(fallo)))
        contestar({ ok = false, error = 'CAPTURE_FAILED' })
    end
end

local function jsonDeLaLinea(linea, argumentos)
    local crudo = linea and linea:match('^%s*%S+%s+%S+%s+(.+)$')
    if not crudo and argumentos[2] then crudo = table.concat(argumentos, ' ', 2) end
    if not crudo then return {} end

    local bien, leido = pcall(json.decode, crudo)
    if bien and type(leido) == 'table' then return leido end
    print(('^1[VXCore]^7 vxcore_event: el JSON no se puede leer: %s'):format(crudo))
    return {}
end

RegisterCommand('vxcore_event', function(src, argumentos, linea)
    if src ~= 0 then
        print('^1[VXCore]^7 vxcore_event sólo se admite desde la consola del servidor.')
        return
    end

    local evento = argumentos[1]
    if not evento then
        print('^3[VXCore]^7 Uso: vxcore_event <evento> <json>')
        return
    end

    local datos = jsonDeLaLinea(linea, argumentos)

    local propio = PROPIOS[evento]
    if propio then
        propio(datos)
        return
    end

    if datos.source ~= nil then
        TriggerClientEvent(evento, datos.source, datos)
    else
        TriggerEvent(evento, datos)
    end
    print(('^2[VXCore]^7 Evento %s disparado.'):format(evento))
end, true)
