local Accion = VX.acciones('accion')

Accion.curar = function()
    local ped = PlayerPedId()
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ClearPedBloodDamage(ped)
    return { ok = true, mensaje = VX.t('Salud al máximo.') }
end

Accion.blindaje = function()
    SetPedArmour(PlayerPedId(), 100)
    return { ok = true, mensaje = VX.t('Chaleco al 100 %.') }
end

function VX.revivir()
    local ped = PlayerPedId()
    local muerto = IsEntityDead(ped) or IsPedFatallyInjured(ped)

    if not VX.Bridge.revivir() and muerto then
        local c = GetEntityCoords(ped)
        NetworkResurrectLocalPlayer(c.x, c.y, c.z, GetEntityHeading(ped), true, false)
        ped = PlayerPedId()
        ClearPedTasksImmediately(ped)
    end

    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ClearPedBloodDamage(ped)
end

Accion.revivir = function()
    VX.revivir()
    return { ok = true, mensaje = VX.t('De vuelta en pie.') }
end

Accion.limpiar = function()
    local ped = PlayerPedId()
    ClearPedBloodDamage(ped)
    ClearPedWetness(ped)
    ClearPedEnvDirt(ped)
    ResetPedVisibleDamage(ped)
    return { ok = true, mensaje = VX.t('Ropa limpia.') }
end

Accion.invisible = function()
    VX.estado.invisible = not VX.estado.invisible
    SetEntityVisible(PlayerPedId(), not VX.estado.invisible and not VX.estado.noclip, false)
    return {
        ok = true,
        activo = VX.estado.invisible,
        mensaje = VX.estado.invisible and VX.t('Ahora eres invisible.') or VX.t('Vuelves a ser visible.'),
    }
end

Accion.invencible = function()
    VX.estado.invencible = not VX.estado.invencible
    SetEntityInvincible(PlayerPedId(), VX.estado.invencible or VX.estado.noclip)
    return {
        ok = true,
        activo = VX.estado.invencible,
        mensaje = VX.estado.invencible and VX.t('Godmode activado.') or VX.t('Godmode desactivado.'),
    }
end
