local function alServidor(ruta)
    VX.nui(ruta, function(datos, responder)
        VX.pedir(ruta, datos, responder)
    end)
end

alServidor('mundo')
alServidor('anuncio')
alServidor('consola')

RegisterNetEvent('vxcore:aplicarMundo', function(tipo, valor)
    if tipo == 'hora' then
        NetworkOverrideClockTime(tonumber(valor) or 12, 0, 0)
    elseif tipo == 'clima' then
        local clima = tostring(valor)
        SetWeatherTypeOverTime(clima, 5.0)
        SetTimeout(5500, function() SetWeatherTypePersist(clima) end)
    end
end)

local function quitables(centro, radio)
    local miPed = PlayerPedId()
    local miVehiculo = VX.vehiculoActual()
    local lista = {}

    for _, vehiculo in ipairs(GetGamePool('CVehicle')) do
        if vehiculo ~= miVehiculo and #(GetEntityCoords(vehiculo) - centro) <= radio then
            local conductor = GetPedInVehicleSeat(vehiculo, -1)
            if conductor == 0 or not IsPedAPlayer(conductor) then
                lista[#lista + 1] = vehiculo
            end
        end
    end

    for _, ped in ipairs(GetGamePool('CPed')) do
        if ped ~= miPed and not IsPedAPlayer(ped) and #(GetEntityCoords(ped) - centro) <= radio then
            lista[#lista + 1] = ped
        end
    end

    return lista
end

VX.nui('limpiarZona', function(datos)
    local radio = VX.limitar(tonumber(datos.radio) or 100.0, 5.0, 1000.0)
    local lista = quitables(GetEntityCoords(PlayerPedId()), radio)

    for _, entidad in ipairs(lista) do NetworkRequestControlOfEntity(entidad) end
    Wait(500)

    local vehiculos, peatones = 0, 0
    for _, entidad in ipairs(lista) do
        local esVehiculo = IsEntityAVehicle(entidad)
        if VX.borrar(entidad) then
            if esVehiculo then vehiculos = vehiculos + 1 else peatones = peatones + 1 end
        end
    end

    return {
        ok = true,
        mensaje = VX.t('Borrados {vehiculos} vehículos y {peatones} peatones en {floor} m.', { vehiculos = vehiculos, peatones = peatones, floor = math.floor(radio) }),
    }
end)
