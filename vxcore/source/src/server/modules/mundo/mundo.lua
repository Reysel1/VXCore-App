local CLIMAS = {
    EXTRASUNNY = true, CLEAR = true, NEUTRAL = true, SMOG = true, FOGGY = true,
    OVERCAST = true, CLOUDS = true, CLEARING = true, RAIN = true, THUNDER = true,
    SNOW = true, BLIZZARD = true, SNOWLIGHT = true, XMAS = true, HALLOWEEN = true,
}

VX.peticion('mundo', function(src, datos)
    if datos.hora ~= nil then
        local hora = VX.limitar(math.floor(tonumber(datos.hora) or 12), 0, 23)
        if not VX.Bridge.ponerHora(hora) then
            TriggerClientEvent('vxcore:aplicarMundo', -1, 'hora', hora)
        end
        VX.registrar(src, ('puso la hora a las %02d:00'):format(hora))
        return { ok = true, mensaje = ('Son las %02d:00 para todo el servidor.'):format(hora) }
    end

    if datos.clima ~= nil then
        local clima = VX.recortar(datos.clima):upper()
        if not CLIMAS[clima] then return { ok = false, mensaje = VX.t('El juego no tiene ningún clima «{clima}».', { clima = clima }) } end
        if not VX.Bridge.ponerClima(clima) then
            TriggerClientEvent('vxcore:aplicarMundo', -1, 'clima', clima)
        end
        VX.registrar(src, VX.t('puso el clima {clima}', { clima = clima }))
        return { ok = true, mensaje = VX.t('Clima cambiado para todo el servidor.') }
    end

    return { ok = false, mensaje = VX.t('Elige una hora o un clima.') }
end, { nivel = 'admin' })

VX.peticion('anuncio', function(src, datos)
    local texto = VX.recortar(datos.mensaje):sub(1, 400)
    if texto == '' then return { ok = false, mensaje = VX.t('Escribe el anuncio.') } end
    VX.registrar(src, VX.t('anunció: {texto}', { texto = texto }))
    VX.notify(-1, { title = VX.t('Anuncio'), description = texto, type = 'info', duration = 10000 })
    return { ok = true, mensaje = VX.t('Anuncio enviado a todo el servidor.') }
end, { nivel = 'admin' })

VX.peticion('consola', function(src, datos)
    local comando = VX.recortar(datos.comando):gsub('%s+', ' ')
    if comando == '' then return { ok = false, mensaje = VX.t('Escribe un comando.') } end

    local permitido = false
    for _, patron in ipairs(Config.Consola.permitidos) do
        if comando:match(patron) then
            permitido = true
            break
        end
    end
    if not permitido then
        return { ok = false, mensaje = VX.t('Ese comando no está permitido desde el menú.') }
    end

    VX.registrar(src, VX.t('ejecutó en consola: {comando}', { comando = comando }))
    ExecuteCommand(comando)
    return { ok = true, mensaje = VX.t('Ejecutado: {comando}', { comando = comando }) }
end, { nivel = 'admin', seccion = 'console' })
