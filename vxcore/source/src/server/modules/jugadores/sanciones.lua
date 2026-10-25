VX.peticion('banear', function(src, datos, responder)
    local id = tonumber(datos.id)
    local nombre = VX.nombreDe(id)
    if not nombre then return VX.jugadorNoEsta(datos.id) end
    if id == src then return { ok = false, mensaje = VX.t('No puedes banearte a ti mismo.') } end
    if not VX.puedeActuarSobre(src, id) then
        return { ok = false, mensaje = VX.t('No puedes hacer eso a alguien con tu mismo rango o superior.') }
    end

    local minutos = tonumber(datos.minutos)
    if not minutos or minutos ~= minutos or minutos < 0 or minutos > 5256000 then
        return { ok = false, mensaje = VX.t('Elige la duración del ban.') }
    end

    local motivo = VX.recortar(datos.motivo):sub(1, 300)
    if motivo == '' then return { ok = false, mensaje = VX.t('Escribe el motivo del ban.') } end

    local cuerpo = VX.identidad(id)
    cuerpo.type = 'ban'
    cuerpo.playerName = nombre
    cuerpo.reason = motivo
    cuerpo.durationMinutes = math.floor(minutos)
    cuerpo.byName = ('%s (in-game)'):format(VX.nombreDe(src) or '?')

    VX.registrar(src, VX.t('baneó a {nombre} ({id}): {motivo}', { nombre = nombre, id = id, motivo = motivo }))

    VX.pedirAlAgente('/api/sanctions/in-game', 'POST', cuerpo, function(estado, respuesta)
        if estado ~= 200 then
            print(('^1[VXCore]^7 El agente no registró el ban de %s (HTTP %s).'):format(nombre, tostring(estado)))
            DropPlayer(tostring(id), VX.t('Baneado.\nMotivo: {motivo}', { motivo = motivo }))
            return responder({
                ok = false,
                mensaje = VX.t('{nombre} expulsado, pero el agente no ha guardado el ban: repítelo desde el panel.', { nombre = nombre }),
            })
        end

        DropPlayer(tostring(id), (respuesta and respuesta.message) or VX.t('Baneado.\nMotivo: {motivo}', { motivo = motivo }))
        responder({ ok = true, mensaje = VX.t('{nombre} baneado y registrado.', { nombre = nombre }) })
    end)
end, { seccion = 'sanctions' })
