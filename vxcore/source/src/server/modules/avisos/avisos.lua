function VX.notify(destino, titulo, texto, tipo, duracion)
    local id = tonumber(destino)
    if not id then
        print(('^3[VXCore]^7 notify: destino no válido (%s); no se envía.'):format(tostring(destino)))
        return
    end

    local aviso = type(titulo) == 'table' and titulo
        or { title = titulo, description = texto, type = tipo, duration = duracion }
    TriggerClientEvent('vxcore:notify', id, aviso)
end

exports('notify', VX.notify)
exports('notificar', VX.notify)
