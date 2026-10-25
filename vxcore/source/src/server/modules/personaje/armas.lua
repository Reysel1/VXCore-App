VX.peticion('darArma', function(src, datos)
    local arma = VX.recortar(datos.arma):upper()
    if not arma:match('^WEAPON_[%w_]+$') then
        return { ok = false, mensaje = VX.t('Ese nombre de arma no es válido.') }
    end

    local dada, motivo = VX.Bridge.darArma(src, arma)
    if dada == nil then return { ok = true, porInventario = false } end
    if not dada then return { ok = false, mensaje = motivo } end

    VX.registrar(src, VX.t('se dio {arma}', { arma = arma }))
    return { ok = true, porInventario = true }
end, { nivel = 'admin' })
