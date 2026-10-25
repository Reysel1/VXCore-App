local grupos = {}
local orden = {}

local function etiquetaDe(control, porDefecto)
    if type(control) == 'number' then
        local ok, boton = pcall(GetControlInstructionalButton, 0, control, true)
        if ok and type(boton) == 'string' then
            local nombre = boton:match('^t_(.+)$')
            if nombre and nombre ~= '' then return nombre end
        end
    end
    return VX.recortar(porDefecto) ~= '' and VX.recortar(porDefecto) or '?'
end

local function fila(entrada)
    if type(entrada) ~= 'table' then return nil end

    local teclas = {}
    local lista = entrada.keys or entrada.teclas
    if type(lista) == 'table' then
        for _, t in ipairs(lista) do
            if type(t) == 'table' then
                teclas[#teclas + 1] = etiquetaDe(t.control, t.key or t.tecla)
            elseif t ~= nil then
                teclas[#teclas + 1] = etiquetaDe(nil, t)
            end
        end
    else
        teclas[1] = etiquetaDe(entrada.control, entrada.key or entrada.tecla)
    end

    local texto = VX.recortar(entrada.label or entrada.texto)
    if #teclas == 0 or texto == '' then return nil end
    return { teclas = teclas, texto = texto }
end

local function lista()
    local salida = {}
    for _, id in ipairs(orden) do
        local g = grupos[id]
        if g then salida[#salida + 1] = { id = id, titulo = g.titulo, teclas = g.teclas } end
    end
    return salida
end

local function enviar()
    SendNUIMessage({ action = 'controles', grupos = lista() })
end

function VX.showControls(id, titulo, teclas)
    id = VX.recortar(id)
    if id == '' or type(teclas) ~= 'table' then
        print('^3[VXCore]^7 showControls necesita un id y una lista de teclas.')
        return
    end

    local filas = {}
    for _, entrada in ipairs(teclas) do
        local f = fila(entrada)
        if f then filas[#filas + 1] = f end
    end
    if #filas == 0 then return VX.hideControls(id) end

    if not grupos[id] then orden[#orden + 1] = id end
    grupos[id] = {
        titulo = VX.recortar(titulo) ~= '' and VX.recortar(titulo) or nil,
        teclas = filas,
        dueno = GetInvokingResource(),
    }
    enviar()
end

function VX.hideControls(id)
    if id == nil then
        grupos, orden = {}, {}
    else
        id = VX.recortar(id)
        if not grupos[id] then return end
        grupos[id] = nil
        for i, actual in ipairs(orden) do
            if actual == id then
                table.remove(orden, i)
                break
            end
        end
    end
    enviar()
end

exports('showControls', VX.showControls)
exports('hideControls', VX.hideControls)
exports('mostrarControles', VX.showControls)
exports('ocultarControles', VX.hideControls)

VX.nui('controles', function()
    return { grupos = lista(), posicion = Config.Controles.posicion }
end)

AddEventHandler('onClientResourceStop', function(recurso)
    local quitados = false
    for id, g in pairs(grupos) do
        if g.dueno == recurso then
            grupos[id] = nil
            quitados = true
        end
    end
    if not quitados then return end

    local quedan = {}
    for _, id in ipairs(orden) do
        if grupos[id] then quedan[#quedan + 1] = id end
    end
    orden = quedan
    enviar()
end)
