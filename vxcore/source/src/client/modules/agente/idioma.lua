local function alMenu(idioma)
    SendNUIMessage({ action = 'idioma', locale = idioma })
end

local function seguirAlServidor(idioma)
    if VX.idiomaForzado() then return end
    if VX.ponerIdioma(idioma) then alMenu(idioma) end
end

seguirAlServidor(GlobalState.vxcoreIdioma)

AddStateBagChangeHandler('vxcoreIdioma', 'global', function(_, _, valor)
    seguirAlServidor(valor)
end)

VX.nui('idioma', function()
    return { locale = VX.idioma() }
end)
