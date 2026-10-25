VX.permitido = false

CreateThread(function()
    Wait(3000)
    TriggerServerEvent('vxcore:puedoAbrir')
end)

RegisterNetEvent('vxcore:permiso', function(puede, abrir)
    VX.permitido = puede == true
    if VX.alPermiso then VX.alPermiso(VX.permitido, abrir == true) end
end)

AddEventHandler('onResourceStop', function(recurso)
    if recurso ~= GetCurrentResourceName() then return end

    if VX.estado.espectando and VX.dejarDeEspectar then VX.dejarDeEspectar() end

    local ped = PlayerPedId()
    SetEntityVisible(ped, true, false)
    SetEntityCollision(ped, true, true)
    SetEntityInvincible(ped, false)
    FreezeEntityPosition(ped, false)
    SetNuiFocus(false, false)
end)
