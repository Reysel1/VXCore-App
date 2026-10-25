VX.Bridge = VX.Bridge or {}

local function enMarcha(recurso)
    return GetResourceState(recurso) == 'started'
end

local function exportar(recurso, funcion, ...)
    local bien, fallo = pcall(function(...)
        return exports[recurso][funcion](exports[recurso], ...)
    end, ...)
    if not bien then
        print(('^3[VXCore]^7 %s:%s falló: %s'):format(recurso, funcion, tostring(fallo)))
    end
    return bien
end

local COMBUSTIBLE = { 'LegacyFuel', 'ps-fuel', 'cdn-fuel', 'lj-fuel' }

function VX.Bridge.llenarDeposito(vehiculo)
    SetVehicleFuelLevel(vehiculo, 100.0)

    if enMarcha('ox_fuel') then
        Entity(vehiculo).state:set('fuel', 100.0, true)
    end
    for _, recurso in ipairs(COMBUSTIBLE) do
        if enMarcha(recurso) then exportar(recurso, 'SetFuel', vehiculo, 100.0) end
    end
end

function VX.Bridge.darLlaves(vehiculo)
    if enMarcha('qb-vehiclekeys') then
        TriggerEvent('vehiclekeys:client:SetOwner', GetVehicleNumberPlateText(vehiculo))
    end
end

function VX.Bridge.revivir()
    if enMarcha('qb-ambulancejob') then
        TriggerEvent('hospital:client:Revive')
        return true
    end
    if enMarcha('esx_ambulancejob') then
        TriggerEvent('esx_ambulancejob:revive')
        return true
    end
    return false
end
