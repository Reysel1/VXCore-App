RegisterNetEvent('vxcore:curado', function()
    VX.revivir()
    VX.notify('VXCore', VX.t('Un administrador te ha curado.'), 'success')
end)

RegisterNetEvent('vxcore:congelado', function(congelado)
    FreezeEntityPosition(PlayerPedId(), congelado == true)
    VX.notify('VXCore', congelado and VX.t('Un administrador te ha congelado.') or VX.t('Ya puedes moverte.'), congelado and 'warning' or 'info')
end)

RegisterNetEvent('vxcore:traido', function(x, y, z)
    VX.llevarA(x + 1.0, y, z, true)
    VX.notify('VXCore', VX.t('Un administrador te ha traído.'), 'info')
end)

RegisterNetEvent('vxcore:dondeEstas', function(quienPregunta)
    local c = GetEntityCoords(PlayerPedId())
    TriggerServerEvent('vxcore:aquiEstoy', quienPregunta, c.x, c.y, c.z)
end)
