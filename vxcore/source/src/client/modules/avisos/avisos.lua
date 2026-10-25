local TIPOS = {
    success = 'success', error = 'error', warning = 'warning', info = 'info', inform = 'info',
}

local DURACION_MINIMA, DURACION_MAXIMA = 1000, 60000

local POSICION_OX_LIB = {
    ['top-center'] = 'top', ['bottom-center'] = 'bottom',
    ['top-left'] = 'top-left', ['top-right'] = 'top-right',
    ['bottom-left'] = 'bottom-left', ['bottom-right'] = 'bottom-right',
}

local COLOR_CHAT = {
    success = { 120, 220, 150 }, error = { 255, 120, 120 }, warning = { 255, 190, 60 }, info = { 200, 200, 200 },
}

local function texto(valor)
    local t = VX.recortar(valor)
    return t ~= '' and t or nil
end

local function normalizar(titulo, cuerpo, tipo, duracion)
    local sonido = false
    if type(titulo) == 'table' then
        local t = titulo
        titulo, cuerpo = t.titulo or t.title, t.texto or t.description or t.mensaje or t.message
        tipo, duracion = t.tipo or t.type, t.duracion or t.duration
        sonido = t.sonido == true or t.sound == true
    end

    local aviso = {
        titulo = texto(titulo),
        texto = texto(cuerpo),
        tipo = TIPOS[tostring(tipo or ''):lower()] or 'info',
        duracion = VX.limitar(math.floor(tonumber(duracion) or Config.Avisos.duracion), DURACION_MINIMA, DURACION_MAXIMA),
        sonido = sonido,
    }
    if not aviso.titulo and not aviso.texto then return nil end
    return aviso
end

local nuiListo = false
local enCola = {}

local function sonar()
    local volumen = tonumber(Config.Avisos.volumenSonido) or 0
    if volumen <= 0 or not nuiListo then return end
    SendNUIMessage({ action = 'sonido', volumen = VX.limitar(volumen, 0, 1) })
end

local function conVXCore(aviso)
    if not nuiListo then
        enCola[#enCola + 1] = aviso
        return
    end
    SendNUIMessage({ action = 'notificar', titulo = aviso.titulo, texto = aviso.texto, tipo = aviso.tipo, duracion = aviso.duracion })
end

local function conOxLib(aviso)
    TriggerEvent('ox_lib:notify', {
        title = aviso.titulo,
        description = aviso.texto,
        type = aviso.tipo == 'info' and 'inform' or aviso.tipo,
        duration = aviso.duracion,
        position = POSICION_OX_LIB[Config.Avisos.posicion],
    })
end

local function conChat(aviso)
    TriggerEvent('chat:addMessage', {
        color = COLOR_CHAT[aviso.tipo],
        args = { ('[%s]'):format(aviso.titulo or 'VXCore'), aviso.texto or '' },
    })
end

local avisadoSinOxLib = false

function VX.notify(...)
    local aviso = normalizar(...)
    if not aviso then return end
    if aviso.sonido then sonar() end

    local sistema = Config.Avisos.sistema
    if sistema == 'ox_lib' then
        if GetResourceState('ox_lib') == 'started' then return conOxLib(aviso) end
        if not avisadoSinOxLib then
            avisadoSinOxLib = true
            print('^3[VXCore]^7 Config.Avisos.sistema es «ox_lib» pero ox_lib no está en marcha: se usan los avisos de VXCore.')
        end
    elseif sistema == 'chat' then
        return conChat(aviso)
    end

    conVXCore(aviso)
end

exports('notify', VX.notify)

RegisterNetEvent('vxcore:notify', function(...)
    VX.notify(...)
end)

exports('notificar', VX.notify)
RegisterNetEvent('vxcore:notificar', function(...)
    VX.notify(...)
end)

VX.nui('avisos', function()
    if not nuiListo then
        nuiListo = true
        local pendientes = enCola
        enCola = {}
        SetTimeout(100, function()
            for _, aviso in ipairs(pendientes) do conVXCore(aviso) end
        end)
    end
    return { posicion = Config.Avisos.posicion, duracion = Config.Avisos.duracion }
end)
