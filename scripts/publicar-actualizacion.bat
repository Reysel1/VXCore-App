@echo off
title VXCore - Publicar actualizacion
cd /d "%~dp0.."

echo ============================================================
echo  VXCore - Publicar actualizacion para todo el mundo
echo ============================================================
echo.
echo  Esto sube la ultima version YA construida (dist-desktop)
echo  al feed de GitHub Releases. La app instalada en cualquier
echo  maquina se actualizara sola la proxima vez que la abra.
echo.
echo  Si ademas quieres RECONSTRUIR la app primero (tarda unos
echo  minutos), usa en su lugar:   npm run desktop:release
echo.
echo ------------------------------------------------------------
node scripts/publish-updates.js
echo.
echo ------------------------------------------------------------
echo  Revisa el resultado de arriba: si el feed responde 200,
echo  las otras maquinas ya pueden actualizarse.
echo.
pause
