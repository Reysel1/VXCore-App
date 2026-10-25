VX = VX or {}

function VX.recortar(valor)
    if valor == nil then return '' end
    return (tostring(valor):match('^%s*(.-)%s*$'))
end

function VX.limitar(n, minimo, maximo)
    if n < minimo then return minimo end
    if n > maximo then return maximo end
    return n
end

local function esLista(tabla)
    return type(tabla) == 'table' and tabla[1] ~= nil
end

local POR_DEFECTO = {
    Idioma = 'auto',
    Menu = {
        comando = 'vxcore',
        alias = { 'fiveos' },
        tecla = 'F5',
        permiso = 'vxcore.menu',
        grupos = { 'group.admin', 'group.superadmin' },
        staffDelPanel = true,
    },
    Atajos = {
        activado = true,
        maximo = 12,
    },
    Noclip = {
        velocidad = 1.0,
        velocidadMaxima = 16.0,
        multiplicadorRapido = 4.0,
        primeraPersona = true,
        primeraPersonaVehiculo = false,
    },
    Vehiculo = {
        matricula = 'VXCORE',
    },
    Avisos = {
        sistema = 'vxcore',
        posicion = 'top-center',
        duracion = 5000,
        volumenSonido = 0.5,
    },
    Controles = {
        posicion = 'bottom-right',
    },
    Consola = {
        permitidos = { '^refresh$', '^restart [%w_%-]+$', '^ensure [%w_%-]+$', '^stop [%w_%-]+$' },
    },
}

local function completar(destino, base)
    for clave, valor in pairs(base) do
        if destino[clave] == nil then
            destino[clave] = valor
        elseif type(valor) == 'table' and type(destino[clave]) == 'table' and not esLista(valor) then
            completar(destino[clave], valor)
        end
    end
end

Config = Config or {}
completar(Config, POR_DEFECTO)
