$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:9009'

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null,
    $Token = $null
  )

  $uri = "$base$Path"
  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }

  try {
    if ($null -ne $Body) {
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 10)
    } else {
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
    }

    return [pscustomobject]@{ status = 200; body = $resp; ok = $true }
  }
  catch {
    $status = 0
    $raw = ''

    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    try { $raw = $_.ErrorDetails.Message } catch {}

    $parsed = $null
    if ($raw) {
      try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $raw }
    }

    return [pscustomobject]@{ status = $status; body = $parsed; ok = $false }
  }
}

$ts = [int][double]::Parse((Get-Date -UFormat %s))
$pass = 'E2ePass@123'
$adminEmail = "e2e.admin.$ts@example.com"
$student1Email = "e2e.student1.$ts@example.com"
$student2Email = "e2e.student2.$ts@example.com"

$results = New-Object System.Collections.Generic.List[object]
function Add-Result {
  param($name, $ok, $detail)
  $results.Add([pscustomobject]@{ test = $name; ok = $ok; detail = $detail }) | Out-Null
}

# Signup users
$null = Invoke-Api -Method POST -Path '/api/auth/signup' -Body @{ name = 'E2E Admin'; email = $adminEmail; password = $pass; role = 'admin' }
$null = Invoke-Api -Method POST -Path '/api/auth/signup' -Body @{ name = 'E2E Student1'; email = $student1Email; password = $pass; role = 'student' }
$null = Invoke-Api -Method POST -Path '/api/auth/signup' -Body @{ name = 'E2E Student2'; email = $student2Email; password = $pass; role = 'student' }

$adminLogin = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{ email = $adminEmail; password = $pass }
$student1Login = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{ email = $student1Email; password = $pass }
$student2Login = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{ email = $student2Email; password = $pass }

if (-not ($adminLogin.ok -and $student1Login.ok -and $student2Login.ok)) {
  throw 'Login failed for seeded E2E users'
}

$adminToken = $adminLogin.body.token
$student1Token = $student1Login.body.token
$student2Token = $student2Login.body.token
$student1Id = $student1Login.body.user.id
$student2Id = $student2Login.body.user.id

$now = Get-Date
# Use a far-future slot to avoid overlap conflicts while still allowing lock/unlock.
$eventGraceStart = (Get-Date '2032-01-01T10:00:00Z').ToString('o')
$eventGraceEnd = (Get-Date '2032-01-01T12:00:00Z').ToString('o')

$eventGrace = Invoke-Api -Method POST -Path '/api/admin/events' -Token $adminToken -Body @{ title = "E2E Grace Event $ts"; description = 'E2E'; startAt = $eventGraceStart; endAt = $eventGraceEnd }
if (-not $eventGrace.ok) {
  throw "Event creation failed. grace=$($eventGrace.status)"
}

$eventGraceId = $eventGrace.body.event.id

# Find an event that started well before grace window but is still active.
$allEvents = Invoke-Api -Method GET -Path '/api/admin/events?scope=all' -Token $adminToken
$eventExpiredId = $null
if ($allEvents.ok -and $allEvents.body.events) {
  $candidate = $allEvents.body.events | Where-Object {
    (Get-Date $_.startAt) -lt $now.AddMinutes(-25) -and (Get-Date $_.endAt) -gt $now
  } | Select-Object -First 1
  if ($candidate) {
    $eventExpiredId = $candidate.id
  }
}

$problemA = Invoke-Api -Method POST -Path '/api/admin/problems' -Token $adminToken -Body @{
  title = "E2E Problem A $ts"
  statement = 'Print 42'
  expectedOutput = '42'
  difficulty = 'easy'
  totalPoints = 100
  passingThreshold = 100
  isCompetitive = $true
  isActive = $true
  eventIds = @($eventGraceId)
  testCases = @(@{ name = 't1'; input = ''; expectedOutput = '42'; isHidden = $false; order = 0; weight = 1; timeLimitSeconds = 2; memoryLimitKb = 131072 })
}

$problemB = Invoke-Api -Method POST -Path '/api/admin/problems' -Token $adminToken -Body @{
  title = "E2E Problem B $ts"
  statement = 'Print 7'
  expectedOutput = '7'
  difficulty = 'easy'
  totalPoints = 100
  passingThreshold = 100
  isCompetitive = $true
  isActive = $true
  eventIds = @($eventGraceId)
  testCases = @(@{ name = 't1'; input = ''; expectedOutput = '7'; isHidden = $false; order = 0; weight = 1; timeLimitSeconds = 2; memoryLimitKb = 131072 })
}

if (-not ($problemA.ok -and $problemB.ok)) {
  throw "Problem creation failed. A=$($problemA.status) B=$($problemB.status)"
}

$problemAId = $problemA.body.problem.id
$problemBId = $problemB.body.problem.id

# Register attendance
$null = Invoke-Api -Method PUT -Path "/api/admin/events/$eventGraceId/attendance" -Token $adminToken -Body @{ userId = $student1Id; status = 'registered' }
$null = Invoke-Api -Method PUT -Path "/api/admin/events/$eventGraceId/attendance" -Token $adminToken -Body @{ userId = $student2Id; status = 'registered' }

# 1) lock success
$lock1 = Invoke-Api -Method POST -Path "/api/events/$eventGraceId/problems/my-selection" -Token $student1Token -Body @{ problemId = $problemAId }
Add-Result 'Student lock success' ($lock1.ok) ("status=$($lock1.status)")

# 2) submit locked problem success
$submitOk = Invoke-Api -Method POST -Path '/api/submissions' -Token $student1Token -Body @{ userId = $student1Id; problemId = $problemAId; eventId = $eventGraceId; language = 'javascript'; language_id = 63; sourceCode = 'console.log("42")'; input = '' }
Add-Result 'Submit locked problem accepted by API' (($submitOk.status -eq 200) -or ($submitOk.status -eq 201)) ("status=$($submitOk.status)")

# 3) mismatch reject
$submitMismatch = Invoke-Api -Method POST -Path '/api/submissions' -Token $student1Token -Body @{ userId = $student1Id; problemId = $problemBId; eventId = $eventGraceId; language = 'javascript'; language_id = 63; sourceCode = 'console.log("7")'; input = '' }
Add-Result 'Submit mismatched locked problem rejected' ($submitMismatch.status -eq 409) ("status=$($submitMismatch.status)")

# 4) no lock reject
$submitNoLock = Invoke-Api -Method POST -Path '/api/submissions' -Token $student2Token -Body @{ userId = $student2Id; problemId = $problemAId; eventId = $eventGraceId; language = 'javascript'; language_id = 63; sourceCode = 'console.log("42")'; input = '' }
Add-Result 'Submit without lock rejected' ($submitNoLock.status -eq 409) ("status=$($submitNoLock.status)")

# 5) unlock within grace
$null = Invoke-Api -Method POST -Path "/api/events/$eventGraceId/problems/my-selection" -Token $student2Token -Body @{ problemId = $problemAId }
$unlockGrace = Invoke-Api -Method DELETE -Path "/api/events/$eventGraceId/problems/my-selection" -Token $student2Token
Add-Result 'Student unlock within grace succeeds' ($unlockGrace.ok) ("status=$($unlockGrace.status)")

# 6) unlock after grace blocked
if ($eventExpiredId) {
  # Ensure the selected event has at least one linked problem by extending Problem A mapping.
  $patchProblem = Invoke-Api -Method PUT -Path "/api/admin/problems/$problemAId" -Token $adminToken -Body @{
    title = "E2E Problem A $ts"
    statement = 'Print 42'
    expectedOutput = '42'
    difficulty = 'easy'
    totalPoints = 100
    passingThreshold = 100
    isCompetitive = $true
    isActive = $true
    eventIds = @($eventGraceId, $eventExpiredId)
    testCases = @(@{ name = 't1'; input = ''; expectedOutput = '42'; isHidden = $false; order = 0; weight = 1; timeLimitSeconds = 2; memoryLimitKb = 131072 })
  }

  $null = Invoke-Api -Method PUT -Path "/api/admin/events/$eventExpiredId/attendance" -Token $adminToken -Body @{ userId = $student2Id; status = 'registered' }
  $lockExpired = Invoke-Api -Method POST -Path "/api/events/$eventExpiredId/problems/my-selection" -Token $student2Token -Body @{ problemId = $problemAId }
  $unlockExpired = Invoke-Api -Method DELETE -Path "/api/events/$eventExpiredId/problems/my-selection" -Token $student2Token
  Add-Result 'Student unlock after grace blocked' ($lockExpired.ok -and ($unlockExpired.status -eq 403)) ("lock=$($lockExpired.status), unlock=$($unlockExpired.status)")
}
else {
  Add-Result 'Student unlock after grace blocked' $false 'No active old-start event found to validate grace-expiry'
}

# 7) admin list + unlock
$adminList = Invoke-Api -Method GET -Path "/api/admin/events/$eventGraceId/problem-selections?page=1&limit=20" -Token $adminToken
$listOk = $adminList.ok -and (($adminList.body.total -as [int]) -ge 1)
Add-Result 'Admin list event selections works' $listOk ("status=$($adminList.status), total=$($adminList.body.total)")

$adminUnlock = Invoke-Api -Method PUT -Path "/api/admin/events/$eventGraceId/problem-selections/$student1Id/unlock" -Token $adminToken -Body @{ reason = 'E2E admin override' }
Add-Result 'Admin unlock selection succeeds' ($adminUnlock.ok) ("status=$($adminUnlock.status)")

$passCount = ($results | Where-Object { $_.ok }).Count
$failCount = ($results | Where-Object { -not $_.ok }).Count

Write-Output '=== E2E Problem Lock Flow Results ==='
$results | ForEach-Object {
  $mark = if ($_.ok) { 'PASS' } else { 'FAIL' }
  Write-Output ("[$mark] $($_.test) ($($_.detail))")
}
Write-Output "Summary: PASS=$passCount FAIL=$failCount"

if ($failCount -gt 0) { exit 2 }
