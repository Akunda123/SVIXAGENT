# fix-double-encoding.ps1
# 逆向修复"双重编码"损坏（不含任何非 ASCII 字面量，避免脚本自身被控制台编码坑掉）
#
# 伤害成因：原始 UTF-8 字节 B --(.NET cp936 解码)--> 字符串 S --(UTF-8 编码)--> 字节 B'
# 逆运算：  B' --(UTF-8 解码)--> S --(cp936 编码)--> B
# 校验：逆向结果必须是**合法 UTF-8**（用 throwOnInvalidBytes 的严格解码器判定），
#       并且关键汉字的**码点**必须出现（码点判断，ASCII 脚本也能查中文）。
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$full = [System.IO.Path]::GetFullPath($Path)
$bytes = [System.IO.File]::ReadAllBytes($full)
Write-Output ("IN  bytes={0}" -f $bytes.Length)

# 1) 当前文件按 UTF-8 解码得到乱码文本
$s = [System.Text.Encoding]::UTF8.GetString($bytes)

# 2) 用 cp936（与伤害时同一个 codec）编码回去
$gbk = [System.Text.Encoding]::GetEncoding(936)
try { $orig = $gbk.GetBytes($s) }
catch { Write-Output ("GBK_ENCODE_FAILED: " + $_.Exception.Message); exit 2 }
Write-Output ("MID bytes={0}" -f $orig.Length)

# 3) 严格 UTF-8 校验
$strict = New-Object System.Text.UTF8Encoding($false, $true)
try { $check = $strict.GetString($orig) }
catch { Write-Output ("REVERSE_NOT_VALID_UTF8: " + $_.Exception.Message); exit 2 }
Write-Output ("OUT bytes={0} chars={1} lines={2}" -f $orig.Length, $check.Length, ($check -split "`n").Count)

# 4) 码点级关键词校验（全 ASCII 脚本也能查中文）
$cps = @{
  'jia(0x67B6)' = 0x67B6; 'gou(0x6784)' = 0x6784   # 架构
  'kuai(0x5FEB)' = 0x5FEB; 'su(0x901F)' = 0x901F   # 快速
  'kai(0x5F00)' = 0x5F00; 'shi(0x59CB)' = 0x59CB   # 开始
  'qiao(0x6865)' = 0x6865                            # 桥
  'lua(0x004C)' = 0x004C
}
$missing = 0
foreach ($k in $cps.Keys | Sort-Object) {
  $has = $check.Contains([char]$cps[$k])
  if (-not $has) { $missing++ }
  Write-Output ("CP {0} present={1}" -f $k, $has)
}
$repl = $check.Contains([char]0xFFFD)
Write-Output ("U+FFFD present={0}" -f $repl)
Write-Output ("firstline='" + ($check -split "`n")[0].Trim() + "'")
Write-Output ("hasAsciiAKDAgent={0}" -f $check.Contains('AKDAgent'))

if ($missing -gt 0 -or $repl) {
  Write-Output 'VERIFY_FAILED (码点缺失或有替换字符) —— 不写回'
  exit 1
}

$out = $full + '.restored'
[System.IO.File]::WriteAllBytes($out, $orig)
Write-Output ("WROTE " + $out)
if ($Apply) {
  [System.IO.File]::WriteAllBytes($full, $orig)
  Write-Output ("APPLIED to " + $full)
}
exit 0
