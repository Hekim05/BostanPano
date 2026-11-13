@echo off
cd /d "%~dp0"
echo Bostan Pano - Firebase yukleme basliyor...
call firebase deploy --only firestore,functions --force > deploy-log.txt 2>&1
type deploy-log.txt
echo.
echo BITTI. Bu pencereyi kapatabilirsiniz.
pause
