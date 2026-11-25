# Deploys the relay and sets its secrets. Never prints the API key, passcodes or admin token.
#   cd check-engine ; .\deploy.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location "$root\worker"
if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund | Out-Null }

$who = npx wrangler whoami 2>&1 | Out-String
if ($who -match "not authenticated") { throw "Run `npx wrangler login` first, then re-run this script." }

$key = [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY_ENTP', 'User')
if (-not $key) { throw "ANTHROPIC_API_KEY_ENTP is not set." }

Set-Location $root
node build.mjs
Set-Location "$root\worker"
Write-Host "Deploying the Worker..."
$out = npx wrangler deploy 2>&1 | Out-String
Write-Host $out
$m = [regex]::Match($out, 'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev')
if (-not $m.Success) { throw "Could not find the workers.dev URL in the deploy output. Check the output above." }
$url = $m.Value

Write-Host "Setting secrets (values are not shown)..."
$key.Trim() | npx wrangler secret put ANTHROPIC_API_KEY | Out-Null
(Get-Content "$root\_local\passcodes.txt" -Raw).Trim() | npx wrangler secret put PASSCODES | Out-Null
(Get-Content "$root\_local\admin-token.txt" -Raw).Trim() | npx wrangler secret put ADMIN_TOKEN | Out-Null
$key = $null
npx wrangler secret list

# Point the page at the Worker.
$cfg = "// The relay address. deploy.ps1 rewrites this line after it deploys the Worker.`nwindow.RELAY = `"$url`";`n"
[IO.File]::WriteAllText("$root\docs\config.js", $cfg, (New-Object Text.UTF8Encoding $false))
Write-Host "`nWorker: $url"
