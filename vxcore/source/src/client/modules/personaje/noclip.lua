local Accion = VX.acciones('accion')

local CONTROLES = {
    delante = 32,
    detras = 33,
    izquierda = 34,
    derecha = 35,
    subir = 44,
    bajar = 46,
    menosVelocidad = 14,
    masVelocidad = 15,
    reiniciarVelocidad = 348,
    lento = 36,
    rapido = 21,
    muyRapido = 19,
    mirarX = 220,
    mirarY = 221,
    chat = 245,
}

local INCLINACION_MAXIMA = 89.0
local PASO_VELOCIDAD = 0.5
local VELOCIDAD_MINIMA = 0.5

local camara = nil
local entidad = nil
local enVehiculo = false
local alfa = 51
local velocidad = 1.0

local function textoVelocidad()
    local v = math.floor(velocidad * 10 + 0.5) / 10
    local entero = math.tointeger(v)
    return entero and ('×%d'):format(entero) or ('×%.1f'):format(v)
end

local function mostrarControles()
    VX.showControls('noclip', VX.t('Noclip · {textoVelocidad}', { textoVelocidad = textoVelocidad() }), {
        {
            keys = {
                { control = CONTROLES.delante, key = 'W' },
                { control = CONTROLES.izquierda, key = 'A' },
                { control = CONTROLES.detras, key = 'S' },
                { control = CONTROLES.derecha, key = 'D' },
            },
            label = VX.t('Moverse'),
        },
        {
            keys = { { control = CONTROLES.subir, key = 'Q' }, { control = CONTROLES.bajar, key = 'E' } },
            label = VX.t('Subir / Bajar'),
        },
        { key = VX.t('Rueda'), label = VX.t('Velocidad') },
        {
            keys = { { control = CONTROLES.rapido, key = 'Shift' }, { control = CONTROLES.muyRapido, key = 'Alt' } },
            label = VX.t('Más rápido'),
        },
        { control = CONTROLES.lento, key = 'Ctrl', label = VX.t('Lento') },
    })
end

local function enPrimeraPersona()
    if enVehiculo then return Config.Noclip.primeraPersonaVehiculo == true end
    return Config.Noclip.primeraPersona == true
end

local function crearCamara()
    local pos = GetEntityCoords(entidad)
    local rot = GetEntityRotation(entidad, 2)
    camara = CreateCameraWithParams('DEFAULT_SCRIPTED_CAMERA', pos.x, pos.y, pos.z, 0.0, 0.0, rot.z, 75.0, false, 2)
    SetCamActive(camara, true)
    RenderScriptCams(true, true, 1000, false, false)

    local primera = enPrimeraPersona()
    if enVehiculo then
        AttachCamToEntity(camara, entidad, 0.0, primera and 0.5 or -4.5, primera and 1.0 or 2.0, true)
    else
        AttachCamToEntity(camara, entidad, 0.0, primera and 0.0 or -2.0, primera and 1.0 or 0.5, true)
    end
end

local function destruirCamara()
    if not camara then return end
    SetGameplayCamRelativeHeading(0.0)
    RenderScriptCams(false, true, 500, true, true)
    SetCamActive(camara, false)
    DestroyCam(camara, true)
    camara = nil
end

local function girarCamara()
    local rot = GetCamRot(camara, 2)
    local inclinacion = rot.x + GetControlNormal(0, CONTROLES.mirarY) * -5.0
    inclinacion = VX.limitar(inclinacion, -INCLINACION_MAXIMA, INCLINACION_MAXIMA)
    local giro = rot.z + GetControlNormal(0, CONTROLES.mirarX) * -10.0

    SetCamRot(camara, inclinacion, rot.y, giro, 2)
    SetEntityHeading(entidad, giro % 360)
end

local function pulsado(grupo, control)
    return IsControlPressed(grupo, control) or IsDisabledControlPressed(grupo, control)
end

local function bloquearControles()
    HudWeaponWheelIgnoreSelection()
    DisableAllControlActions(0)
    DisableAllControlActions(1)
    DisableAllControlActions(2)
    EnableControlAction(0, CONTROLES.mirarX, true)
    EnableControlAction(0, CONTROLES.mirarY, true)
    EnableControlAction(0, CONTROLES.chat, true)
end

local function multiplicador()
    local rapido = tonumber(Config.Noclip.multiplicadorRapido) or 4.0
    if pulsado(0, CONTROLES.muyRapido) then return rapido end
    if pulsado(0, CONTROLES.rapido) then return rapido / 2 end
    if pulsado(0, CONTROLES.lento) then return 0.25 end
    return 1.0
end

local function ajustarVelocidad()
    local antes = velocidad
    local maxima = tonumber(Config.Noclip.velocidadMaxima) or 16.0

    if pulsado(2, CONTROLES.menosVelocidad) then
        velocidad = math.max(VELOCIDAD_MINIMA, velocidad - PASO_VELOCIDAD)
    elseif pulsado(2, CONTROLES.masVelocidad) then
        velocidad = math.min(maxima, velocidad + PASO_VELOCIDAD)
    elseif IsDisabledControlJustReleased(0, CONTROLES.reiniciarVelocidad) then
        velocidad = tonumber(Config.Noclip.velocidad) or 1.0
    end

    return velocidad ~= antes
end

local function mantener()
    local ped = PlayerPedId()
    local pos = GetEntityCoords(entidad)
    RequestCollisionAtCoord(pos.x, pos.y, pos.z)

    FreezeEntityPosition(entidad, true)
    SetEntityCollision(entidad, false, false)
    SetEntityVisible(entidad, false, false)
    SetEntityInvincible(entidad, true)
    SetEntityAlpha(entidad, alfa, false)
    if enVehiculo then
        SetEntityVisible(ped, false, false)
        SetEntityInvincible(ped, true)
        SetEntityAlpha(ped, alfa, false)
    end
    SetLocalPlayerVisibleLocally(true)

    SetEveryoneIgnorePlayer(PlayerId(), true)
    SetPoliceIgnorePlayer(PlayerId(), true)
end

local function volar()
    CreateThread(function()
        while VX.estado.noclip and camara do
            girarCamara()
            bloquearControles()
            if ajustarVelocidad() then mostrarControles() end

            local paso = velocidad * multiplicador() * GetFrameTime() * 60.0
            local inclinacion = GetCamRot(camara, 2).x / INCLINACION_MAXIMA
            local x, y, z = 0.0, 0.0, 0.0

            if pulsado(0, CONTROLES.delante) then
                y, z = 0.5 * paso, inclinacion * paso / 2
            elseif pulsado(0, CONTROLES.detras) then
                y, z = -0.5 * paso, -inclinacion * paso / 2
            end

            if pulsado(0, CONTROLES.izquierda) then
                x = -0.5 * paso
            elseif pulsado(0, CONTROLES.derecha) then
                x = 0.5 * paso
            end

            if pulsado(0, CONTROLES.subir) then
                z = z + 0.5 * paso
            elseif pulsado(0, CONTROLES.bajar) then
                z = z - 0.5 * paso
            end

            if x ~= 0.0 or y ~= 0.0 or z ~= 0.0 then
                local destino = GetOffsetFromEntityInWorldCoords(entidad, x, y, z)
                SetEntityCoordsNoOffset(entidad, destino.x, destino.y, destino.z, true, true, true)
            end

            mantener()
            Wait(0)
        end
    end)
end

local function alturaDelSuelo(pos)
    local rayo = StartExpensiveSynchronousShapeTestLosProbe(pos.x, pos.y, pos.z, pos.x, pos.y, pos.z - 1000.0, 1, entidad, 0)
    local _, golpe, punto = GetShapeTestResult(rayo)
    if golpe == 1 or golpe == true then return punto.z end

    local hay, z = GetGroundZFor_3dCoord(pos.x, pos.y, pos.z, false)
    if hay then return z end
    return nil
end

local function restaurar()
    local ped = PlayerPedId()

    if entidad and DoesEntityExist(entidad) then
        FreezeEntityPosition(entidad, false)
        SetEntityCollision(entidad, true, true)
        ResetEntityAlpha(entidad)
        if enVehiculo then
            SetEntityVisible(entidad, true, false)
            SetEntityInvincible(entidad, false)
            SetVehicleEngineOn(entidad, true, true, false)
        end
    end

    ResetEntityAlpha(ped)
    SetEntityVisible(ped, not VX.estado.invisible, false)
    SetEntityInvincible(ped, VX.estado.invencible)
    SetEveryoneIgnorePlayer(PlayerId(), false)
    SetPoliceIgnorePlayer(PlayerId(), false)
    SetUserRadioControlEnabled(true)
end

local function entrar()
    local ped = PlayerPedId()
    local vehiculo = VX.vehiculoActual()

    enVehiculo = vehiculo ~= nil and GetPedInVehicleSeat(vehiculo, -1) == ped
    entidad = enVehiculo and vehiculo or ped
    alfa = enPrimeraPersona() and 0 or 51
    velocidad = tonumber(Config.Noclip.velocidad) or 1.0

    if enVehiculo then
        SetVehicleEngineOn(entidad, false, true, true)
    else
        ClearPedTasksImmediately(ped)
    end

    FreezeEntityPosition(entidad, true)
    crearCamara()
    SetUserRadioControlEnabled(false)
    PlaySoundFromEntity(-1, 'SELECT', ped, 'HUD_LIQUOR_STORE_SOUNDSET', false, 0)
    mostrarControles()
    volar()
end

local function salir()
    local ped = PlayerPedId()

    if entidad and DoesEntityExist(entidad) then
        local pos = GetEntityCoords(entidad)
        local suelo = alturaDelSuelo(pos)
        if suelo then
            SetEntityCoordsNoOffset(entidad, pos.x, pos.y, suelo + 1.0, false, false, false)
            if enVehiculo then SetVehicleOnGroundProperly(entidad) end
        end
    end

    destruirCamara()
    restaurar()
    PlaySoundFromEntity(-1, 'CANCEL', ped, 'HUD_LIQUOR_STORE_SOUNDSET', false, 0)
    VX.hideControls('noclip')
    entidad = nil
end

Accion.noclip = function()
    if not VX.estado.noclip and VX.estado.espectando then
        return { ok = false, mensaje = VX.t('Deja de espectar antes de activar el noclip.') }
    end

    VX.estado.noclip = not VX.estado.noclip
    if VX.estado.noclip then entrar() else salir() end

    return {
        ok = true,
        activo = VX.estado.noclip,
        mensaje = VX.estado.noclip and VX.t('Noclip activado.') or VX.t('Noclip desactivado.'),
    }
end

AddEventHandler('onResourceStop', function(recurso)
    if recurso ~= GetCurrentResourceName() or not VX.estado.noclip then return end
    VX.estado.noclip = false
    destruirCamara()
    restaurar()
end)
