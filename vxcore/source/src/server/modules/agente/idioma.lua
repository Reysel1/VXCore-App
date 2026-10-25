local CLAVE = 'vxcore:idioma'

local function aplicar(idioma, guardar)
    if not VX.esIdioma(idioma) then return end
    VX.ponerIdioma(idioma)
    GlobalState.vxcoreIdioma = idioma
    if guardar then SetResourceKvp(CLAVE, idioma) end
end

local forzado = VX.idiomaForzado()

if forzado then
    aplicar(forzado, false)
else
    aplicar(GetResourceKvpString(CLAVE) or 'es', false)

    CreateThread(function()
        Wait(2000)
        VX.pedirAlAgente('/api/locale', 'GET', nil, function(estado, datos)
            if estado ~= 200 or not datos or not datos.chosen then return end
            aplicar(datos.locale, true)
            print(('^2[VXCore]^7 Idioma: %s'):format(VX.idioma()))
        end)
    end)
end

AddEventHandler('vxcore:idioma', function(datos)
    if type(datos) ~= 'table' or not VX.esIdioma(datos.locale) then return end
    if VX.idiomaForzado() then
        print(('^3[VXCore]^7 El panel ha cambiado el idioma a «%s», pero config.lua lo fija en «%s».')
            :format(datos.locale, VX.idiomaForzado()))
        return
    end
    aplicar(datos.locale, true)
    print(('^2[VXCore]^7 Idioma cambiado a %s.'):format(datos.locale))
end)
