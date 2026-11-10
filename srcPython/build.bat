@echo off
rem Build cv.exe (one-file) from cv.spec and output it to ..\bin\ (external executables live in bin/, not in src/).
rem Then copy ..\bin\cv.exe to ..\src\cv.exe by hand (legacy-compat copy, rule R-BIN-07; must be byte-identical to bin\cv.exe).
rem Requires: pip install pyinstaller pywin32 (cv.py no longer needs the third-party docx2pdf package)
pushd "%~dp0"
python -m PyInstaller cv.spec --noconfirm --clean --distpath ..\bin
popd
pause
