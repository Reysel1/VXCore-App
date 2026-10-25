local Jugador = VX.acciones('jugador')

local function alServidor(accion)
    Jugador[accion] = function(datos, responder)
        VX.pedir('jugador', { accion = accion, id = datos.id, valor = datos.valor, mensaje = datos.mensaje, motivo = datos.motivo }, responder)
    end
end

alServidor('curar')
alServidor('congelar')
alServidor('avisar')
alServidor('echar')

VX.nui('jugadores', function(_, responder)
    VX.pedir('jugadores', {}, function(respuesta)
        if respuesta.ok then SendNUIMessage({ action = 'players', players = respuesta.jugadores }) end
        responder(respuesta)
    end)
end)

local function posicionDe(id, alSaber)
    VX.pedir('jugador', { accion = 'posicion', id = id }, alSaber)
end

Jugador.ir = function(datos, responder)
    posicionDe(datos.id, function(respuesta)
        if not respuesta.ok then return responder(respuesta) end
        local p = respuesta.posicion
        VX.llevarA(p.x + 1.0, p.y, p.z, true)
        responder({ ok = true, mensaje = VX.t('Estás a su lado.') })
    end)
end

Jugador.traer = function(datos, responder)
    local c = GetEntityCoords(PlayerPedId())
    VX.pedir('jugador', { accion = 'traer', id = datos.id, posicion = { x = c.x, y = c.y, z = c.z } }, responder)
end

local antesDeEspectar = nil

local function seguir(id)
    CreateThread(function()
        while VX.estado.espectando == id do
            local jugador = GetPlayerFromServerId(id)
            if jugador == -1 then
                VX.dejarDeEspectar()
                VX.notify('VXCore', VX.t('El jugador se ha ido; dejas de espectar.'), 'info')
                return
            end
            local c = GetEntityCoords(GetPlayerPed(jugador))
            SetEntityCoordsNoOffset(PlayerPedId(), c.x, c.y, c.z - 15.0, false, false, false)
            Wait(500)
        end
    end)
end

function VX.dejarDeEspectar()
    local ped = PlayerPedId()
    VX.estado.espectando = nil
    NetworkSetInSpectatorMode(false, ped)

    if antesDeEspectar then
        SetEntityCoordsNoOffset(ped, antesDeEspectar.x, antesDeEspectar.y, antesDeEspectar.z, false, false, false)
        antesDeEspectar = nil
    end
    FreezeEntityPosition(ped, false)
    SetEntityCollision(ped, true, true)
    SetEntityVisible(ped, not VX.estado.invisible and not VX.estado.noclip, false)
end

local function esperarA(id, ms)
    local limite = GetGameTimer() + ms
    while GetGameTimer() < limite do
        local jugador = GetPlayerFromServerId(id)
        if jugador ~= -1 and DoesEntityExist(GetPlayerPed(jugador)) then return GetPlayerPed(jugador) end
        Wait(100)
    end
    return nil
end

Jugador.espectar = function(datos, responder)
    local id = tonumber(datos.id)

    if VX.estado.espectando == id then
        VX.dejarDeEspectar()
        return { ok = true, activo = false, mensaje = VX.t('Dejas de espectar.') }
    end
    if VX.estado.noclip then
        return { ok = false, mensaje = VX.t('Sal del noclip antes de espectar.') }
    end
    if VX.estado.espectando then VX.dejarDeEspectar() end

    posicionDe(id, function(respuesta)
        if not respuesta.ok then return responder(respuesta) end

        local ped = PlayerPedId()
        antesDeEspectar = GetEntityCoords(ped)
        local p = respuesta.posicion

        SetEntityVisible(ped, false, false)
        SetEntityCollision(ped, false, false)
        FreezeEntityPosition(ped, true)
        RequestCollisionAtCoord(p.x, p.y, p.z)
        SetEntityCoordsNoOffset(ped, p.x, p.y, p.z - 15.0, false, false, false)

        local objetivo = esperarA(id, 3000)
        if not objetivo then
            VX.dejarDeEspectar()
            return responder({ ok = false, mensaje = VX.t('No se ha podido cargar a ese jugador para espectarlo.') })
        end

        NetworkSetInSpectatorMode(true, objetivo)
        VX.estado.espectando = id
        seguir(id)
        responder({ ok = true, activo = true, mensaje = VX.t('Espectando. Pulsa otra vez para salir.') })
    end)
end

VX.nui('identificadores', function(datos, responder)
    VX.pedir('identificadores', { id = datos.id }, function(respuesta)
        if respuesta.ok then SendNUIMessage({ action = 'ids', info = respuesta.info }) end
        responder(respuesta)
    end)
end)

VX.nui('banear', function(datos, responder)
    VX.pedir('banear', { id = datos.id, motivo = datos.motivo, minutos = datos.minutos }, responder, 15000)
end)
