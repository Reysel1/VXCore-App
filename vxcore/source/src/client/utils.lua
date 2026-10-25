VX.estado = {
    noclip = false,
    invisible = false,
    invencible = false,
    espectando = nil,
    ultimaPosicion = nil,
}

function VX.nui(ruta, fn)
    RegisterNUICallback(ruta, function(datos, cb)
        local respondido = false
        local function responder(respuesta)
            if respondido then return end
            respondido = true
            cb(respuesta or { ok = true })
        end

        CreateThread(function()
            local bien, respuesta = pcall(fn, type(datos) == 'table' and datos or {}, responder)
            if not bien then
                print(('^1[VXCore]^7 Error en la ruta «%s» del menú: %s'):format(ruta, tostring(respuesta)))
                responder({ ok = false, mensaje = VX.t('Algo ha fallado. Mira la consola (F8).') })
            elseif respuesta ~= nil then
                responder(respuesta)
            end
        end)
    end)
end

local grupos = {}

function VX.acciones(ruta)
    if grupos[ruta] then return grupos[ruta] end

    local manejadores = {}
    grupos[ruta] = manejadores

    VX.nui(ruta, function(datos, responder)
        local fn = manejadores[tostring(datos.accion or '')]
        if not fn then
            return { ok = false, mensaje = VX.t('Acción desconocida: {accion}.', { accion = tostring(datos.accion) }) }
        end
        return fn(datos, responder)
    end)

    return manejadores
end

local pendientes = {}
local siguienteToken = 0

function VX.pedir(nombre, datos, alResponder, esperaMs)
    siguienteToken = siguienteToken + 1
    local token = siguienteToken
    pendientes[token] = alResponder

    TriggerServerEvent('vxcore:peticion:' .. nombre, token, datos or {})

    SetTimeout(esperaMs or 8000, function()
        local pendiente = pendientes[token]
        if not pendiente then return end
        pendientes[token] = nil
        pendiente({ ok = false, error = 'SIN_RESPUESTA', mensaje = VX.t('El servidor no ha respondido a tiempo.') })
    end)
end

RegisterNetEvent('vxcore:respuesta', function(token, respuesta)
    local alResponder = pendientes[token]
    if not alResponder then return end
    pendientes[token] = nil
    CreateThread(function()
        alResponder(respuesta or { ok = true })
    end)
end)

function VX.vehiculoActual()
    local vehiculo = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehiculo == 0 then return nil end
    return vehiculo
end

function VX.sinVehiculo()
    return { ok = false, mensaje = VX.t('No estás dentro de ningún vehículo.') }
end

function VX.cargarModelo(hash)
    if not IsModelInCdimage(hash) then return false end
    RequestModel(hash)
    local limite = GetGameTimer() + 5000
    while not HasModelLoaded(hash) and GetGameTimer() < limite do
        Wait(50)
    end
    return HasModelLoaded(hash)
end

function VX.pedirControl(entidad, esperaMs)
    if not NetworkGetEntityIsNetworked(entidad) then return true end
    NetworkRequestControlOfEntity(entidad)
    local limite = GetGameTimer() + (esperaMs or 1000)
    while not NetworkHasControlOfEntity(entidad) and GetGameTimer() < limite do
        Wait(0)
        NetworkRequestControlOfEntity(entidad)
    end
    return NetworkHasControlOfEntity(entidad)
end

function VX.borrar(entidad)
    if not entidad or not DoesEntityExist(entidad) then return false end
    VX.pedirControl(entidad)
    SetEntityAsMissionEntity(entidad, true, true)
    if IsEntityAVehicle(entidad) then
        DeleteVehicle(entidad)
    elseif IsEntityAPed(entidad) then
        DeletePed(entidad)
    else
        DeleteEntity(entidad)
    end
    return not DoesEntityExist(entidad)
end

local function fundido(hacia, ms)
    if hacia == 'negro' then DoScreenFadeOut(ms) else DoScreenFadeIn(ms) end
    local limite = GetGameTimer() + ms + 500
    while GetGameTimer() < limite do
        if (hacia == 'negro' and IsScreenFadedOut()) or (hacia ~= 'negro' and IsScreenFadedIn()) then return end
        Wait(0)
    end
end

function VX.llevarA(x, y, z, guardar)
    local ped = PlayerPedId()
    if guardar ~= false then VX.estado.ultimaPosicion = GetEntityCoords(ped) end

    local vehiculo = VX.vehiculoActual()
    local entidad = (vehiculo and GetPedInVehicleSeat(vehiculo, -1) == ped) and vehiculo or ped

    fundido('negro', 250)
    FreezeEntityPosition(entidad, true)

    local encontrado = true
    if z and z > 0.0 then
        RequestCollisionAtCoord(x, y, z)
        SetEntityCoordsNoOffset(entidad, x, y, z, false, false, false)
        local limite = GetGameTimer() + 2000
        while not HasCollisionLoadedAroundEntity(entidad) and GetGameTimer() < limite do Wait(0) end
    else
        encontrado = false
        local suelo = 0.0
        for altura = 0, 1000, 50 do
            SetEntityCoordsNoOffset(entidad, x, y, altura + 0.0, false, false, false)
            RequestCollisionAtCoord(x, y, altura + 0.0)
            local limite = GetGameTimer() + 250
            while not HasCollisionLoadedAroundEntity(entidad) and GetGameTimer() < limite do Wait(0) end

            encontrado, suelo = GetGroundZFor_3dCoord(x, y, altura + 0.0, false)
            if encontrado then break end
        end
        SetEntityCoordsNoOffset(entidad, x, y, (encontrado and suelo or 100.0) + 1.0, false, false, false)
    end

    FreezeEntityPosition(entidad, false)
    fundido('claro', 250)
    return encontrado
end
