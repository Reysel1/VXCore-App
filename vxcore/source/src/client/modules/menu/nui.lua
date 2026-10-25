local abierto = false
local preguntando = false

local function ponerAbierto(valor)
    abierto = valor
    SetNuiFocus(abierto, abierto)
    SendNUIMessage({ action = 'toggle', open = abierto })
end

local function alternar()
    if VX.permitido then return ponerAbierto(not abierto) end

    if preguntando then return end
    preguntando = true
    TriggerServerEvent('vxcore:puedoAbrir', true)
    SetTimeout(10000, function() preguntando = false end)
end

function VX.alPermiso(puede, pedidoAlPulsar)
    if pedidoAlPulsar then
        preguntando = false
        if puede then
            ponerAbierto(true)
        else
            VX.notify('VXCore', VX.t('No tienes permiso para abrir el menú.'), 'error')
        end
    elseif not puede and abierto then
        ponerAbierto(false)
        VX.notify('VXCore', VX.t('Ya no tienes acceso al menú de VXCore.'), 'warning')
    end
end

RegisterCommand(Config.Menu.comando, alternar, false)
for _, alias in ipairs(Config.Menu.alias) do
    RegisterCommand(alias, alternar, false)
end
RegisterKeyMapping(Config.Menu.comando, VX.t('Abrir el menú de VXCore'), 'keyboard', Config.Menu.tecla)

VX.nui('close', function()
    abierto = false
    SetNuiFocus(false, false)
    return { ok = true }
end)

VX.nui('estado', function()
    return {
        noclip = VX.estado.noclip,
        invisible = VX.estado.invisible,
        invencible = VX.estado.invencible,
    }
end)

local CLAVE_FAVORITOS = 'vxcore:favoritos'

VX.nui('favoritos', function(datos)
    if type(datos.guardar) == 'table' then
        SetResourceKvp(CLAVE_FAVORITOS, json.encode(datos.guardar))
        return { ok = true }
    end

    local crudo = GetResourceKvpString(CLAVE_FAVORITOS)
    if not crudo or crudo == '' then return { lista = {} } end

    local bien, lista = pcall(json.decode, crudo)
    return { lista = (bien and type(lista) == 'table') and lista or {} }
end)
