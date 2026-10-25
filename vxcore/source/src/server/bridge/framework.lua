VX.Bridge = VX.Bridge or {}

local function enMarcha(recurso)
    return GetResourceState(recurso) == 'started'
end

local function exportar(recurso, funcion, ...)
    local bien, resultado = pcall(function(...)
        return exports[recurso][funcion](exports[recurso], ...)
    end, ...)
    if not bien then
        print(('^3[VXCore]^7 %s:%s falló: %s'):format(recurso, funcion, tostring(resultado)))
        return false
    end
    return true, resultado
end

function VX.Bridge.ponerHora(hora)
    if enMarcha('qb-weathersync') then
        return (exportar('qb-weathersync', 'setTime', hora, 0))
    end
    return false
end

function VX.Bridge.ponerClima(clima)
    if enMarcha('qb-weathersync') then
        return (exportar('qb-weathersync', 'setWeather', clima))
    end
    return false
end

function VX.Bridge.darArma(src, arma)
    if enMarcha('ox_inventory') then
        local bien, dado = exportar('ox_inventory', 'AddItem', src, arma, 1)
        if bien and dado then return true end
        return false, 'El inventario no ha aceptado el arma (¿no existe como objeto, o no te cabe?).'
    end

    if enMarcha('qb-core') then
        local bien, QBCore = exportar('qb-core', 'GetCoreObject')
        local objeto = arma:lower()
        if bien and QBCore and QBCore.Shared and QBCore.Shared.Items and QBCore.Shared.Items[objeto] then
            local jugador = QBCore.Functions.GetPlayer(src)
            if jugador and jugador.Functions.AddItem(objeto, 1) then
                TriggerClientEvent('inventory:client:ItemBox', src, QBCore.Shared.Items[objeto], 'add')
                return true
            end
            return false, 'El inventario no ha aceptado el arma (¿no te cabe?).'
        end
    end

    return nil
end
