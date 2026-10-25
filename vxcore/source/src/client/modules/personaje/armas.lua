local Arma = VX.acciones('arma')

local function nombreDeArma(texto)
    local nombre = VX.recortar(texto):upper():gsub('%s+', '')
    if nombre == '' then return nil end
    if not nombre:match('^WEAPON_') then nombre = 'WEAPON_' .. nombre end
    return nombre
end

Arma.dar = function(datos, responder)
    local arma = nombreDeArma(datos.nombre)
    if not arma then return { ok = false, mensaje = VX.t('Elige o escribe un arma.') } end

    local hash = GetHashKey(arma)
    if not IsWeaponValid(hash) then
        return { ok = false, mensaje = VX.t('No existe ningún arma llamada «{arma}».', { arma = arma }) }
    end

    VX.pedir('darArma', { arma = arma }, function(respuesta)
        if not respuesta.ok then return responder(respuesta) end

        local etiqueta = arma:gsub('^WEAPON_', '')
        if respuesta.porInventario then
            return responder({ ok = true, mensaje = VX.t('{etiqueta} añadida a tu inventario.', { etiqueta = etiqueta }) })
        end

        GiveWeaponToPed(PlayerPedId(), hash, 250, false, true)
        responder({ ok = true, mensaje = VX.t('Tienes una {etiqueta}.', { etiqueta = etiqueta }) })
    end)
end

Arma.municion = function()
    local ped = PlayerPedId()
    local arma = GetSelectedPedWeapon(ped)
    if arma == GetHashKey('WEAPON_UNARMED') then
        return { ok = false, mensaje = VX.t('No llevas ningún arma en la mano.') }
    end
    local _, maxima = GetMaxAmmo(ped, arma)
    SetPedAmmo(ped, arma, (maxima and maxima > 0) and maxima or 9999)
    return { ok = true, mensaje = VX.t('Munición al máximo.') }
end

Arma.quitar = function()
    RemoveAllPedWeapons(PlayerPedId(), true)
    return { ok = true, mensaje = VX.t('Te has quedado sin armas.') }
end
