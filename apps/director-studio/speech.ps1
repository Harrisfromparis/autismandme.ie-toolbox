param([string]$Manifest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$episode = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
try {
  foreach ($line in $episode.shots) {
    if ($line.dialogue -and $episode.speech) {
      if ($line.voice) { $synth.SelectVoice($line.voice) }
      $synth.Rate = [int]$episode.voiceRate
      $synth.SetOutputToWaveFile($line.wav, $format)
      $synth.Speak([string]$line.dialogue)
      $synth.SetOutputToNull()
    }
  }
} finally { $synth.Dispose() }
