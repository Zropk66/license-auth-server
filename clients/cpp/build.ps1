# 自动定位 MSVC 环境并构建 license-client.exe
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) { Write-Error "未找到 vswhere"; exit 1 }

$vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) { Write-Error "未找到含 C++ 工具链的 Visual Studio"; exit 1 }

$vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) { Write-Error "未找到 vcvars64.bat: $vcvars"; exit 1 }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$cmd = "`"$vcvars`" >nul && cl /nologo /utf-8 /O2 /W3 /EHsc /std:c++17 main.cpp secure_transport.cpp crypto.cpp http.cpp ed25519\tweetnacl.c /I. /Ied25519 /Fe:license-client.exe /link bcrypt.lib winhttp.lib advapi32.lib"
cmd /c $cmd
if ($LASTEXITCODE -ne 0) { Write-Error "编译失败"; exit 1 }

Remove-Item *.obj -ErrorAction SilentlyContinue
Write-Host "[OK] 构建完成: $here\license-client.exe"
