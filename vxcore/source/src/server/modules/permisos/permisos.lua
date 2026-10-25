local REFRESCO_MS = 5 * 60 * 1000

local function consultarPanel(src, alTerminar)
    if not Config.Menu.staffDelPanel then
        VX.rangoPanel[src] = nil
        return alTerminar()
    end

    local discord = VX.identidad(src).discord
    if not discord then
        VX.rangoPanel[src] = nil
        return alTerminar()
    end

    VX.pedirAlAgente('/api/staff/in-game-access', 'POST', { discord = discord }, function(estado, datos)
        if estado == 200 and datos then
            if datos.allowed and VX.NIVELES[datos.level] then
                VX.rangoPanel[src] = { nivel = datos.level, secciones = datos.sections }
            else
                VX.rangoPanel[src] = nil
            end
        end
        alTerminar()
    end)
end

local ultimaConsulta = {}

RegisterNetEvent('vxcore:puedoAbrir', function(abrir)
    local src = source
    local ahora = GetGameTimer()
    if ultimaConsulta[src] and ahora - ultimaConsulta[src] < 2000 then return end
    ultimaConsulta[src] = ahora
    consultarPanel(src, function()
        local puede = VX.autorizado(src)
        local rango = VX.rangoPanel[src]
        if puede and rango and not IsPlayerAceAllowed(src, Config.Menu.permiso) then
            print(('^2[VXCore]^7 %s entra al menú con su rango del panel (%s).'):format(VX.nombreDe(src) or src, rango.nivel))
        end
        TriggerClientEvent('vxcore:permiso', src, puede, abrir == true)
    end)
end)

AddEventHandler('playerDropped', function()
    VX.rangoPanel[source] = nil
    ultimaConsulta[source] = nil
end)

CreateThread(function()
    while true do
        Wait(REFRESCO_MS)
        for src in pairs(VX.rangoPanel) do
            consultarPanel(src, function()
                if not VX.autorizado(src) then
                    TriggerClientEvent('vxcore:permiso', src, false, false)
                end
            end)
        end
    end
end)
