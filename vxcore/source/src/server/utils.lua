local function resolverAgente()
    local actual = GetConvar('vxcore_agent_url', '')
    if actual ~= '' then return actual end

    local antiguo = GetConvar('fiveos_agent_url', '')
    if antiguo ~= '' then return antiguo end

    return 'http://localhost:4000'
end

VX.agente = resolverAgente()

local CABECERAS = { ['Content-Type'] = 'application/json' }
local CLAVE = GetConvar('vxcore_agent_key', '')
if CLAVE ~= '' then CABECERAS['X-VXCore-Key'] = CLAVE end

function VX.pedirAlAgente(ruta, metodo, cuerpo, alResponder)
    PerformHttpRequest(VX.agente .. ruta, function(estado, respuesta)
        if not alResponder then return end
        local datos = nil
        if respuesta and respuesta ~= '' then
            local bien, leido = pcall(json.decode, respuesta)
            if bien and type(leido) == 'table' then datos = leido end
        end
        alResponder(estado, datos)
    end, metodo or 'GET', cuerpo and json.encode(cuerpo) or '', CABECERAS)
end

VX.NIVELES = { moderator = 1, admin = 2, owner = 3 }

VX.rangoPanel = {}

function VX.rangoDe(src)
    src = tonumber(src)
    if not src or src <= 0 then return 0 end
    if IsPlayerAceAllowed(src, Config.Menu.permiso) then return 4 end
    local rango = VX.rangoPanel[src]
    return rango and (VX.NIVELES[rango.nivel] or 0) or 0
end

function VX.puedeActuarSobre(src, objetivo)
    return VX.rangoDe(src) > VX.rangoDe(objetivo)
end

function VX.coordenada(valor)
    local n = tonumber(valor)
    if not n or n ~= n or math.abs(n) > 100000 then return nil end
    return n + 0.0
end

function VX.autorizado(src, requisito)
    src = tonumber(src)
    if not src or src <= 0 then return false end
    if IsPlayerAceAllowed(src, Config.Menu.permiso) then return true end

    local rango = VX.rangoPanel[src]
    if not rango then return false end

    requisito = requisito or {}
    if (VX.NIVELES[rango.nivel] or 0) < (VX.NIVELES[requisito.nivel or 'moderator'] or 1) then return false end

    if requisito.seccion and type(rango.secciones) == 'table' then
        for _, seccion in ipairs(rango.secciones) do
            if seccion == requisito.seccion then return true end
        end
        return false
    end
    return true
end

function VX.nombreDe(id)
    id = tonumber(id)
    if not id then return nil end
    local nombre = GetPlayerName(id)
    if not nombre or nombre == '' then return nil end
    return nombre
end

function VX.identidad(src)
    local identidad = { tokens = {} }

    for _, bruto in ipairs(GetPlayerIdentifiers(src)) do
        local tipo, valor = bruto:match('^(%w+):(.+)$')
        if tipo and valor then identidad[tipo] = valor end
    end

    if GetNumPlayerTokens and GetPlayerToken then
        for i = 0, (GetNumPlayerTokens(src) or 0) - 1 do
            local token = GetPlayerToken(src, i)
            if token and token ~= '' then
                identidad.tokens[#identidad.tokens + 1] = token
            end
        end
    end

    return identidad
end

function VX.posicionDe(id)
    local ped = GetPlayerPed(id)
    if not ped or ped == 0 then return nil end
    local c = GetEntityCoords(ped)
    if not c or (c.x == 0.0 and c.y == 0.0 and c.z == 0.0) then return nil end
    return { x = c.x, y = c.y, z = c.z }
end

function VX.registrar(src, texto)
    local quien = VX.nombreDe(src) or ('#' .. tostring(src))
    print(('^3[VXCore]^7 %s (%s): %s'):format(quien, tostring(src), texto))
end

function VX.peticion(nombre, fn, requisito)
    RegisterNetEvent('vxcore:peticion:' .. nombre, function(token, datos)
        local src = source
        local respondido = false

        local function responder(respuesta)
            if respondido then return end
            respondido = true
            TriggerClientEvent('vxcore:respuesta', src, token, respuesta or { ok = true })
        end

        if not VX.autorizado(src, requisito) then
            VX.registrar(src, VX.t('INTENTO SIN PERMISO: {nombre}', { nombre = nombre }))
            local mensaje = VX.autorizado(src)
                and VX.t('Tu rango en VXCore no permite hacer esto.')
                or VX.t('No tienes permiso para usar el menú de VXCore.')
            responder({ ok = false, error = 'SIN_PERMISO', mensaje = mensaje })
            return
        end

        local bien, respuesta = pcall(fn, src, type(datos) == 'table' and datos or {}, responder)
        if not bien then
            print(('^1[VXCore]^7 Error atendiendo «%s»: %s'):format(nombre, tostring(respuesta)))
            responder({ ok = false, error = 'ERROR_INTERNO', mensaje = VX.t('Algo ha fallado en el servidor. Mira su consola.') })
        elseif respuesta ~= nil then
            responder(respuesta)
        end
    end)
end

function VX.jugadorNoEsta(id)
    return { ok = false, mensaje = VX.t('No hay nadie conectado con el id {id}.', { id = tostring(id) }) }
end
