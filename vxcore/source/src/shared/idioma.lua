VX = VX or {}

VX.IDIOMAS = { es = true, en = true, pt = true, fr = true, de = true }

local diccionarios = {}
local actual = 'es'

local function cargar(idioma)
    if idioma == 'es' or diccionarios[idioma] then return end
    local crudo = LoadResourceFile(GetCurrentResourceName(), ('source/locales/%s.json'):format(idioma))
    local bien, leido = pcall(json.decode, crudo or '')
    if not bien or type(leido) ~= 'table' then
        print(('^3[VXCore]^7 No se pudo leer el diccionario de «%s»: las frases saldrán en español.'):format(idioma))
        leido = {}
    end
    diccionarios[idioma] = leido
end

function VX.esIdioma(valor)
    return type(valor) == 'string' and VX.IDIOMAS[valor] == true
end

function VX.idiomaForzado()
    local fijo = type(Config.Idioma) == 'string' and Config.Idioma:lower() or 'auto'
    return VX.esIdioma(fijo) and fijo or nil
end

function VX.idioma()
    return actual
end

function VX.ponerIdioma(idioma)
    if not VX.esIdioma(idioma) then return false end
    cargar(idioma)
    if idioma == actual then return false end
    actual = idioma
    TriggerEvent('vxcore:idiomaCambiado', idioma)
    return true
end

function VX.t(texto, params)
    texto = tostring(texto)
    local dic = diccionarios[actual]
    local traducida = (dic and type(dic[texto]) == 'string') and dic[texto] or texto
    if params then
        traducida = traducida:gsub('{([%w_]+)}', function(nombre)
            local valor = params[nombre]
            if valor == nil then return nil end
            return tostring(valor)
        end)
    end
    return traducida
end

function VX.msg(texto)
    return texto
end

if VX.idiomaForzado() then VX.ponerIdioma(VX.idiomaForzado()) end
