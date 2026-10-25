Config = {}

Config.Idioma = 'auto'

Config.Menu = {
    comando = 'vxcore',
    alias = { 'fiveos' },

    tecla = 'F5',

    permiso = 'vxcore.menu',
    grupos = { 'group.admin', 'group.superadmin' },

    staffDelPanel = true,
}

Config.Atajos = {
    activado = true,

    maximo = 12,
}

Config.Noclip = {
    velocidad = 1.0,
    velocidadMaxima = 16.0,
    multiplicadorRapido = 4.0,
    primeraPersona = true,
    primeraPersonaVehiculo = false,
}

Config.Vehiculo = {
    matricula = 'VXCORE',
}

Config.Avisos = {
    sistema = 'vxcore',

    posicion = 'top-center',

    duracion = 5000,

    volumenSonido = 0.5,
}

Config.Controles = {
    posicion = 'bottom-right',
}

Config.Consola = {
    permitidos = {
        '^refresh$',
        '^restart [%w_%-]+$',
        '^ensure [%w_%-]+$',
        '^stop [%w_%-]+$',
    },
}
