# Deploys the relay and points the page at it. Secrets are set separately by set-secrets.sh.
#   cd check-engine ; .\deploy.ps1
#   .\deploy.ps1 -Wrangler C:\path\to\node_modules\.bin\wrangler.cmd   (if npm install fails inside OneDrive)
param([string]$Wrangler = "")
$root = $PSScriptRoot
$cfgFile = "$root\worker\wrangler.jsonc"
# Pipeline input has to be passed on by hand: a function does not hand it to the program inside it.
function Invoke-Wr { param([Parameter(ValueFromRemainingArguments = $true)]$a)
  $in = @($input)
  if ($Wrangler) { if ($in.Count) { $in | & $Wrangler @a --config $cfgFile } else { & $Wrangler @a --config $cfgFile } }
  else { Push-Location "$root\worker"; if ($in.Count) { $in | npx wrangler @a } else { npx wrangler @a }; Pop-Location } }


Set-Location $root
node build.mjs
if ($LASTEXITCODE) { throw "build failed" }
Write-Host "Deploying the Worker..."
$out = (Invoke-Wr deploy 2>&1 | Out-String)
Write-Host $out
$m = [regex]::Match($out, 'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev')
if (-not $m.Success) { throw "Could not find the workers.dev URL in the deploy output. Check the output above." }
$url = $m.Value

# Secrets are set by set-secrets.sh (Git Bash). Piping them through PowerShell into wrangler.cmd set them empty.

# Point the page at the Worker.
$cfg = "// The relay address. deploy.ps1 rewrites this line after it deploys the Worker.`nwindow.RELAY = `"$url`";`n"
[IO.File]::WriteAllText("$root\docs\config.js", $cfg, (New-Object Text.UTF8Encoding $false))
Write-Host "`nWorker: $url"
Write-Host "First deploy, or passcodes changed? Run in Git Bash: bash set-secrets.sh"
