local function concederPermisos()
    local permiso = Config.Menu.permiso
    local recurso = GetCurrentResourceName()

    for _, grupo in ipairs(Config.Menu.grupos) do
        ExecuteCommand(('add_ace %s %s allow'):format(grupo, permiso))
    end

    local primero = Config.Menu.grupos[1]
    if primero and not IsPrincipalAceAllowed(primero, permiso) then
        print(('^1[VXCore]^7 No se ha podido conceder %s a %s. Añade al server.cfg: ^3add_ace resource.%s command allow^7'):format(permiso, primero, recurso))
    end
end

AddEventHandler('onResourceStart', function(recurso)
    if recurso ~= GetCurrentResourceName() then return end

    concederPermisos()
    print(('^2[VXCore]^7 Recurso in-game listo. Agente: %s · Permiso del menú: %s'):format(VX.agente, Config.Menu.permiso))
end)
