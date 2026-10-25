local Accion = VX.acciones('accion')

local SITIOS = {
    comisaria  = { nombre = VX.msg('la comisaría de Mission Row'), x = 425.1, y = -979.5, z = 30.7 },
    hospital   = { nombre = VX.msg('el hospital Pillbox'), x = 295.8, y = -1446.9, z = 29.9 },
    aeropuerto = { nombre = VX.msg('el aeropuerto'), x = -1037.7, y = -2737.6, z = 20.2 },
    puerto     = { nombre = VX.msg('el puerto'), x = 1208.9, y = -3116.5, z = 5.5 },
    montana    = { nombre = VX.msg('el monte Chiliad'), x = 501.9, y = 5604.5, z = 797.9 },
    cayo       = { nombre = VX.msg('Cayo Perico'), x = 4840.6, y = -5174.4, z = 2.5 },
}

Accion.marcador = function()
    local blip = GetFirstBlipInfoId(8)
    if not DoesBlipExist(blip) then
        return { ok = false, mensaje = VX.t('No hay ningún marcador puesto en el mapa.') }
    end
    local destino = GetBlipInfoIdCoord(blip)
    VX.llevarA(destino.x, destino.y, nil, true)
    return { ok = true, mensaje = VX.t('Estás en el marcador.') }
end

Accion.volver = function()
    local anterior = VX.estado.ultimaPosicion
    if not anterior then
        return { ok = false, mensaje = VX.t('Todavía no te has teletransportado a ningún sitio.') }
    end
    VX.llevarA(anterior.x, anterior.y, anterior.z, false)
    VX.estado.ultimaPosicion = nil
    return { ok = true, mensaje = VX.t('De vuelta donde estabas.') }
end

VX.nui('sitio', function(datos)
    local sitio = SITIOS[tostring(datos.sitio or '')]
    if not sitio then return { ok = false, mensaje = VX.t('Ese sitio no está en la lista.') } end
    VX.llevarA(sitio.x, sitio.y, sitio.z, true)
    return { ok = true, mensaje = VX.t('Estás en {nombre}.', { nombre = VX.t(sitio.nombre) }) }
end)

VX.nui('coordenadas', function(datos)
    local x, y, z = tonumber(datos.x), tonumber(datos.y), tonumber(datos.z)
    if not x or not y then
        return { ok = false, mensaje = VX.t('Hacen falta al menos X e Y.') }
    end
    VX.llevarA(x, y, z, true)
    return { ok = true, mensaje = ('Estás en %.1f, %.1f.'):format(x, y) }
end)

VX.nui('donde', function()
    local ped = PlayerPedId()
    local c = GetEntityCoords(ped)
    return { ok = true, x = c.x, y = c.y, z = c.z, h = GetEntityHeading(ped) }
end)
