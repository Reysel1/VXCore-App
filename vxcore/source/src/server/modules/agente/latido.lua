local INTERVALO_NORMAL = 5000
local INTERVALO_SIN_AGENTE = 15000

local function listaDeJugadores()
    local lista = {}
    for _, id in ipairs(GetPlayers()) do
        local identidad = VX.identidad(id)
        local tokens = identidad.tokens
        identidad.tokens = nil

        lista[#lista + 1] = {
            source = tonumber(id),
            name = GetPlayerName(id),
            ping = GetPlayerPing(id),
            identifiers = identidad,
            tokens = tokens,
        }
    end
    return lista
end

CreateThread(function()
    local espera = INTERVALO_NORMAL

    while true do
        Wait(espera)

        local jugadores = listaDeJugadores()
        VX.pedirAlAgente('/api/server/telemetry', 'POST', {
            players = #jugadores,
            maxClients = GetConvarInt('sv_maxclients', 32),
            resources = GetNumResources(),
            playersList = jugadores,
        }, function(estado)
            espera = (estado == 200) and INTERVALO_NORMAL or INTERVALO_SIN_AGENTE
        end)
    end
end)
