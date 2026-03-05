$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node .\setup.mjs $args
