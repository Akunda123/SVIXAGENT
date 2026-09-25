# dump-cp936.ps1  (ASCII only on purpose - no non-ASCII literals in this file)
# Exports the WINDOWS cp936 (GBK) decode table so Python can invert data that .NET encoded.
# Output format, one line per mapping:
#   <hex2><hex2>=<codepoint-hex>      e.g. E69E=93CB
# Invalid pairs decode to U+FFFD and are skipped.
param(
  [string]$Out = "cp936-table.txt"
)
$ErrorActionPreference = 'Stop'
$enc = [System.Text.Encoding]::GetEncoding(936)
$sb = New-Object System.Text.StringBuilder
$n = 0
# two-byte sequences
for ($hi = 0x81; $hi -le 0xFE; $hi++) {
  for ($lo = 0x40; $lo -le 0xFE; $lo++) {
    if ($lo -eq 0x7F) { continue }
    $pair = [byte[]]@($hi, $lo)
    $s = $enc.GetString($pair)
    if ($s.Length -ne 1) { continue }
    $cp = [int][char]$s[0]
    if ($cp -eq 0xFFFD) { continue }
    [void]$sb.Append(('{0:X2}{1:X2}={2:X4}' -f $hi, $lo, $cp)).Append("`n")
    $n++
  }
}
# single-byte sequences (0x00-0xFF) - only the ones that are not plain ASCII matter
for ($b = 0x80; $b -le 0xFF; $b++) {
  $s = $enc.GetString([byte[]]@($b))
  if ($s.Length -ne 1) { continue }
  $cp = [int][char]$s[0]
  if ($cp -eq 0xFFFD) { continue }
  [void]$sb.Append(('{0:X2}={1:X4}' -f $b, $cp)).Append("`n")
  $n++
}
$full = [System.IO.Path]::GetFullPath($Out)
[System.IO.File]::WriteAllText($full, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("wrote {0} mappings to {1}" -f $n, $full)
