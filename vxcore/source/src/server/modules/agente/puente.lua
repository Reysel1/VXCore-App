local OPERACIONES = {
    sanciones = function(datos)
        local objetivo = tonumber(datos.id)
        if not VX.nombreDe(objetivo) then return nil end
        return '/api/sanctions/check', 'POST', VX.identidad(objetivo)
    end,

    resumen = function()
        return '/api/server/ingame-summary', 'GET', nil
    end,
}

VX.peticion('agente', function(src, peticion, responder)
    local construir = OPERACIONES[peticion.operacion]
    if not construir then
        print(('^1[VXCore]^7 %s pidió una operación del agente que no existe: %s'):format(tostring(src), tostring(peticion.operacion)))
        return { ok = false, error = 'OPERACION_DESCONOCIDA' }
    end

    local ruta, metodo, cuerpo = construir(type(peticion.datos) == 'table' and peticion.datos or {})
    if not ruta then
        return { ok = false, error = 'DATOS_INVALIDOS' }
    end

    VX.pedirAlAgente(ruta, metodo, cuerpo, function(estado, datos)
        if estado ~= 200 then return responder({ ok = false, error = 'AGENTE_NO_RESPONDE' }) end
        if not datos then return responder({ ok = false, error = 'RESPUESTA_ILEGIBLE' }) end
        responder({ ok = true, datos = datos })
    end)
end)
