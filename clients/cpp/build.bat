@echo off
rem 构建 C++ 客户端（需在 VS x64 开发者命令提示符中运行，或由 build.ps1 自动定位）
rem 产物: license-client.exe

setlocal
where cl >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 cl.exe，请运行 build.ps1 或在 VS 开发者命令提示符中执行本脚本
  exit /b 1
)

cl /nologo /utf-8 /O2 /W3 /EHsc /std:c++17 ^
  main.cpp secure_transport.cpp crypto.cpp http.cpp ed25519\tweetnacl.c ^
  /I. /Ied25519 /Fe:license-client.exe ^
  /link bcrypt.lib winhttp.lib advapi32.lib
if errorlevel 1 exit /b 1

del /q license-client.obj secure_transport.obj crypto.obj http.obj tweetnacl.obj >nul 2>&1
echo [OK] 构建完成: license-client.exe
endlocal
