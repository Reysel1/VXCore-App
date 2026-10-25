VX.nui('agente', function(datos, responder)
    if not datos.operacion then return { ok = false, error = 'FALTA_OPERACION' } end
    VX.pedir('agente', { operacion = datos.operacion, datos = datos.datos }, responder)
end)
