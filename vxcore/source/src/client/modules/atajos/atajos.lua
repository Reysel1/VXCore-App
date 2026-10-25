local CLAVE = 'vxcore:atajos'

local guardado = { activos = true, lista = {} }
local ultimaVez = {}

local function texto(valor, maximo)
    if type(valor) ~= 'string' then return nil end
    valor = VX.recortar(valor)
    if valor == '' or #valor > maximo then return nil end
    return valor
end

local function sanear(entrada)
    local limpio = { activos = true, lista = {} }
    if type(entrada) ~= 'table' then return limpio end
    limpio.activos = entrada.activos ~= false

    local vistas = {}
    for _, a in ipairs(type(entrada.lista) == 'table' and entrada.lista or {}) do
        if #limpio.lista >= Config.Atajos.maximo then break end

        local control = type(a) == 'table' and math.tointeger(a.control)
        local id = type(a) == 'table' and texto(a.id, 64)
        local comando = type(a) == 'table' and texto(a.comando, 64)
        local tecla = type(a) == 'table' and texto(a.tecla, 32)
        local etiqueta = type(a) == 'table' and texto(a.etiqueta, 16)

        if id and comando and tecla and etiqueta and control and control >= 0 and control <= 400 and not vistas[tecla] then
            vistas[tecla] = true

            local valores = nil
            if type(a.valores) == 'table' then
                valores = {}
                local cuantos = 0
                for nombre, valor in pairs(a.valores) do
                    local tipo = type(valor)
                    if type(nombre) == 'string' and #nombre <= 32 and cuantos < 10
                        and (tipo == 'number' or tipo == 'boolean' or (tipo == 'string' and #valor <= 128)) then
                        valores[nombre] = valor
                        cuantos = cuantos + 1
                    end
                end
            end

            limpio.lista[#limpio.lista + 1] = {
                id = id,
                comando = comando,
                tecla = tecla,
                etiqueta = etiqueta,
                control = control,
                valores = valores,
            }
        end
    end

    return limpio
end

local function leer()
    local crudo = GetResourceKvpString(CLAVE)
    if not crudo or crudo == '' then return sanear(nil) end
    local bien, datos = pcall(json.decode, crudo)
    return sanear(bien and datos or nil)
end

guardado = leer()

local function teclaDelMenu()
    local bien, boton = pcall(GetControlInstructionalButton, 0, joaat(Config.Menu.comando) | 0x80000000, true)
    if bien and type(boton) == 'string' then
        local nombre = boton:match('^t_(.+)$')
        if nombre and nombre ~= '' then return nombre end
    end
    return Config.Menu.tecla
end

VX.nui('atajos', function(datos)
    if type(datos.guardar) == 'table' then
        guardado = sanear(datos.guardar)
        SetResourceKvp(CLAVE, json.encode(guardado))
        return { ok = true }
    end

    return {
        activos = guardado.activos,
        lista = guardado.lista,
        maximo = Config.Atajos.maximo,
        teclaMenu = teclaDelMenu(),
        permitidos = Config.Atajos.activado ~= false,
    }
end)

local function sePuedeDisparar()
    if IsNuiFocused() then return false end
    if IsPauseMenuActive() then return false end
    if UpdateOnscreenKeyboard() == 0 then return false end
    return true
end

CreateThread(function()
    while true do
        local lista = guardado.lista
        if Config.Atajos.activado == false or not guardado.activos or #lista == 0 or not VX.permitido then
            Wait(500)
        else
            Wait(0)
            if sePuedeDisparar() then
                local ahora = GetGameTimer()
                for i = 1, #lista do
                    local atajo = lista[i]
                    if IsControlJustPressed(0, atajo.control) or IsDisabledControlJustPressed(0, atajo.control) then
                        if not ultimaVez[atajo.id] or ahora - ultimaVez[atajo.id] > 250 then
                            ultimaVez[atajo.id] = ahora
                            SendNUIMessage({ action = 'atajo', id = atajo.id })
                        end
                    end
                end
            end
        end
    end
end)
