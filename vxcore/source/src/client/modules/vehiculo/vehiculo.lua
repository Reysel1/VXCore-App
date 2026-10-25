local Accion = VX.acciones('accion')
local Vehiculo = VX.acciones('vehiculo')

local function nombreDelModelo(hash, modelo)
    local etiqueta = GetLabelText(GetDisplayNameFromVehicleModel(hash))
    if etiqueta and etiqueta ~= '' and etiqueta ~= 'NULL' then return etiqueta end
    return modelo
end

VX.nui('spawnVehiculo', function(datos)
    local modelo = VX.recortar(datos.modelo):gsub('%s+', '')
    local hash = GetHashKey(modelo)

    if modelo == '' or not IsModelInCdimage(hash) or not IsModelAVehicle(hash) then
        return { ok = false, mensaje = VX.t('No existe ningún vehículo llamado «{modelo}».', { modelo = modelo }) }
    end
    if not VX.cargarModelo(hash) then
        return { ok = false, mensaje = VX.t('El modelo no ha terminado de cargar. Prueba otra vez.') }
    end

    local ped = PlayerPedId()

    local anterior = VX.vehiculoActual()
    if anterior and GetPedInVehicleSeat(anterior, -1) == ped then VX.borrar(anterior) end

    local c = GetEntityCoords(ped)
    local vehiculo = CreateVehicle(hash, c.x, c.y, c.z, GetEntityHeading(ped), true, false)
    SetModelAsNoLongerNeeded(hash)
    if vehiculo == 0 then
        return { ok = false, mensaje = VX.t('El juego no ha podido crear el vehículo aquí.') }
    end

    SetVehicleHasBeenOwnedByPlayer(vehiculo, true)
    SetVehicleNeedsToBeHotwired(vehiculo, false)
    SetVehicleOnGroundProperly(vehiculo)
    SetVehicleNumberPlateText(vehiculo, Config.Vehiculo.matricula)
    SetPedIntoVehicle(ped, vehiculo, -1)
    SetVehicleEngineOn(vehiculo, true, true, false)

    VX.Bridge.llenarDeposito(vehiculo)
    VX.Bridge.darLlaves(vehiculo)

    return { ok = true, mensaje = VX.t('Tienes un {nombreDelModelo}.', { nombreDelModelo = nombreDelModelo(hash, modelo) }) }
end)

Accion.reparar = function()
    local vehiculo = VX.vehiculoActual()
    if not vehiculo then return VX.sinVehiculo() end

    SetVehicleFixed(vehiculo)
    SetVehicleDeformationFixed(vehiculo)
    SetVehicleUndriveable(vehiculo, false)
    SetVehicleEngineHealth(vehiculo, 1000.0)
    SetVehicleBodyHealth(vehiculo, 1000.0)
    SetVehiclePetrolTankHealth(vehiculo, 1000.0)
    return { ok = true, mensaje = VX.t('Vehículo reparado.') }
end

Accion.repostar = function()
    local vehiculo = VX.vehiculoActual()
    if not vehiculo then return VX.sinVehiculo() end

    VX.Bridge.llenarDeposito(vehiculo)
    return { ok = true, mensaje = VX.t('Depósito lleno.') }
end

Accion['limpiar-vehiculo'] = function()
    local vehiculo = VX.vehiculoActual()
    if not vehiculo then return VX.sinVehiculo() end

    SetVehicleDirtLevel(vehiculo, 0.0)
    WashDecalsFromVehicle(vehiculo, 1.0)
    return { ok = true, mensaje = VX.t('Vehículo limpio.') }
end

Accion['borrar-vehiculo'] = function()
    local ped = PlayerPedId()
    local vehiculo = VX.vehiculoActual()

    if not vehiculo then
        local frente = GetOffsetFromEntityInWorldCoords(ped, 0.0, 4.0, 0.0)
        local rayo = StartShapeTestCapsule(frente.x, frente.y, frente.z, frente.x, frente.y, frente.z, 4.0, 10, ped, 7)
        local _, golpea, _, _, entidad = GetShapeTestResult(rayo)
        if golpea == 1 and IsEntityAVehicle(entidad) then vehiculo = entidad end
    end

    if not vehiculo then
        return { ok = false, mensaje = VX.t('No hay ningún vehículo aquí ni delante de ti.') }
    end
    if not VX.borrar(vehiculo) then
        return { ok = false, mensaje = VX.t('Ese vehículo es de otro jugador y no se ha podido borrar.') }
    end
    return { ok = true, mensaje = VX.t('Vehículo borrado.') }
end

Vehiculo.motor = function()
    local vehiculo = VX.vehiculoActual()
    if not vehiculo then return VX.sinVehiculo() end

    local encendido = GetIsVehicleEngineRunning(vehiculo)
    SetVehicleEngineOn(vehiculo, not encendido, false, true)
    return { ok = true, mensaje = encendido and VX.t('Motor apagado.') or VX.t('Motor encendido.') }
end

Vehiculo.cerraduras = function()
    local vehiculo = VX.vehiculoActual()
    if not vehiculo then return VX.sinVehiculo() end

    local cerrado = GetVehicleDoorLockStatus(vehiculo) == 2
    SetVehicleDoorsLocked(vehiculo, cerrado and 1 or 2)
    return { ok = true, mensaje = cerrado and VX.t('Vehículo abierto.') or VX.t('Vehículo cerrado.') }
end

local MEJORAS = { 11, 12, 13, 15, 16 }
local TURBO = 18

Vehiculo['motor-mejorado'] = function()
    local vehiculo = VX.vehiculoActual()
    if not vehiculo then return VX.sinVehiculo() end

    SetVehicleModKit(vehiculo, 0)
    for _, tipo in ipairs(MEJORAS) do
        local maximo = GetNumVehicleMods(vehiculo, tipo) - 1
        if maximo >= 0 then SetVehicleMod(vehiculo, tipo, maximo, false) end
    end
    ToggleVehicleMod(vehiculo, TURBO, true)
    return { ok = true, mensaje = VX.t('Motor, frenos, transmisión, suspensión, blindaje y turbo al máximo.') }
end

Vehiculo.color = function()
    local vehiculo = VX.vehiculoActual()
    if not vehiculo then return VX.sinVehiculo() end

    SetVehicleColours(vehiculo, math.random(0, 159), math.random(0, 159))
    return { ok = true, mensaje = VX.t('Color cambiado.') }
end

Vehiculo.matricula = function(datos)
    local vehiculo = VX.vehiculoActual()
    if not vehiculo then return VX.sinVehiculo() end

    local texto = VX.recortar(datos.texto):upper():sub(1, 8)
    if texto == '' then return { ok = false, mensaje = VX.t('Escribe la matrícula.') } end

    SetVehicleNumberPlateText(vehiculo, texto)
    return { ok = true, mensaje = VX.t('Matrícula puesta: {texto}.', { texto = texto }) }
end
