VX.peticion('jugadores', function(src)
    local lista = {}
    for _, id in ipairs(GetPlayers()) do
        local numero = tonumber(id)
        lista[#lista + 1] = {
            id = numero,
            nombre = GetPlayerName(id),
            ping = GetPlayerPing(id),
            yo = numero == src,
        }
    end
    table.sort(lista, function(a, b) return a.id < b.id end)
    return { ok = true, jugadores = lista }
end, { seccion = 'players' })

local pendientes = {}

local function preguntarPosicion(src, objetivo, responder)
    local clave = ('%d:%d'):format(src, objetivo)
    pendientes[clave] = responder
    TriggerClientEvent('vxcore:dondeEstas', objetivo, src)

    SetTimeout(5000, function()
        local pendiente = pendientes[clave]
        if not pendiente then return end
        pendientes[clave] = nil
        pendiente({ ok = false, mensaje = VX.t('Ese jugador no ha dicho dónde está. Prueba otra vez.') })
    end)
end

RegisterNetEvent('vxcore:aquiEstoy', function(quienPregunta, x, y, z)
    local clave = ('%d:%d'):format(tonumber(quienPregunta) or 0, source)
    local responder = pendientes[clave]
    if not responder then return end
    pendientes[clave] = nil
    x, y, z = VX.coordenada(x), VX.coordenada(y), VX.coordenada(z)
    if not (x and y and z) then
        responder({ ok = false, mensaje = VX.t('Ese jugador no ha dicho dónde está. Prueba otra vez.') })
        return
    end
    responder({ ok = true, posicion = { x = x, y = y, z = z } })
end)

local ACCIONES = {}

ACCIONES.posicion = function(src, id, _, _, responder)
    local posicion = VX.posicionDe(id)
    if posicion then return { ok = true, posicion = posicion } end
    preguntarPosicion(src, id, responder)
end

ACCIONES.traer = function(src, id, nombre, datos)
    local destino = VX.posicionDe(src) or datos.posicion
    local x = type(destino) == 'table' and VX.coordenada(destino.x)
    local y = type(destino) == 'table' and VX.coordenada(destino.y)
    local z = type(destino) == 'table' and VX.coordenada(destino.z)
    if not (x and y and z) then
        return { ok = false, mensaje = VX.t('No se sabe dónde estás para traerlo.') }
    end
    VX.registrar(src, VX.t('trajo a {nombre}', { nombre = nombre }))
    TriggerClientEvent('vxcore:traido', id, x, y, z)
    return { ok = true, mensaje = VX.t('Has traído a {nombre}.', { nombre = nombre }) }
end

ACCIONES.curar = function(src, id, nombre)
    VX.registrar(src, VX.t('curó a {nombre}', { nombre = nombre }))
    TriggerClientEvent('vxcore:curado', id)
    return { ok = true, mensaje = VX.t('{nombre} curado.', { nombre = nombre }) }
end

ACCIONES.congelar = function(src, id, nombre, datos)
    local congelado = datos.valor == true
    VX.registrar(src, ('%s a %s'):format(congelado and VX.t('congeló') or VX.t('descongeló'), nombre))
    TriggerClientEvent('vxcore:congelado', id, congelado)
    return { ok = true, activo = congelado, mensaje = congelado and VX.t('{nombre} congelado.', { nombre = nombre }) or VX.t('{nombre} ya puede moverse.', { nombre = nombre }) }
end

ACCIONES.avisar = function(src, id, nombre, datos)
    local texto = VX.recortar(datos.mensaje):sub(1, 300)
    if texto == '' then return { ok = false, mensaje = VX.t('Escribe el aviso.') } end
    VX.registrar(src, VX.t('avisó a {nombre}: {texto}', { nombre = nombre, texto = texto }))
    VX.notify(id, { title = VX.t('Aviso de {nombreDe}', { nombreDe = VX.nombreDe(src) or 'staff' }), description = texto, type = 'warning', duration = 10000 })
    return { ok = true, mensaje = VX.t('Aviso enviado a {nombre}.', { nombre = nombre }) }
end

ACCIONES.echar = function(src, id, nombre, datos)
    if id == src then return { ok = false, mensaje = VX.t('No puedes expulsarte a ti mismo.') } end
    local motivo = VX.recortar(datos.motivo):sub(1, 200)
    if motivo == '' then motivo = VX.t('Sin motivo indicado') end
    VX.registrar(src, VX.t('expulsó a {nombre}: {motivo}', { nombre = nombre, motivo = motivo }))
    DropPlayer(tostring(id), VX.t('Expulsado por un administrador.\nMotivo: {motivo}', { motivo = motivo }))
    return { ok = true, mensaje = VX.t('{nombre} expulsado.', { nombre = nombre }) }
end

local SOBRE_OTROS = { echar = true, congelar = true, traer = true }

VX.peticion('jugador', function(src, datos, responder)
    local accion = ACCIONES[datos.accion]
    if not accion then
        return { ok = false, mensaje = VX.t('Acción desconocida: {accion}.', { accion = tostring(datos.accion) }) }
    end

    local id = tonumber(datos.id)
    local nombre = VX.nombreDe(id)
    if not nombre then return VX.jugadorNoEsta(datos.id) end
    if SOBRE_OTROS[datos.accion] and id ~= src and not VX.puedeActuarSobre(src, id) then
        return { ok = false, mensaje = VX.t('No puedes hacer eso a alguien con tu mismo rango o superior.') }
    end

    return accion(src, id, nombre, datos, responder)
end, { seccion = 'players' })

VX.peticion('identificadores', function(_, datos)
    local id = tonumber(datos.id)
    local nombre = VX.nombreDe(id)
    if not nombre then return VX.jugadorNoEsta(datos.id) end

    return {
        ok = true,
        info = { id = id, nombre = nombre, identificadores = VX.identidad(id) },
    }
end, { seccion = 'players' })
