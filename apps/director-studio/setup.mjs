import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(fileURLToPath(import.meta.url));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
if (process.platform !== "win32") {
  console.error(
    "This first version uses Windows speech voices. Run it on Windows.",
  );
  process.exit(1);
}
const bundled = path.join(
  process.env.USERPROFILE || "",
  "\.cache\codex-runtimes\codex-primary-runtime\dependencies".slice(1),
);
const candidates = [
  arg("--python"),
  process.env.DIRECTOR_PYTHON,
  "python",
  path.join(bundled, "python", "python.exe"),
].filter(Boolean);
let python;
for (const candidate of candidates) {
  const check = spawnSync(
    candidate,
    ["-c", "import sys; print(sys.executable)"],
    { encoding: "utf8", windowsHide: true },
  );
  if (check.status === 0 && check.stdout.trim()) {
    python = check.stdout.trim();
    break;
  }
}
if (!python) {
  console.error(
    "Python 3.10+ is required. Install Python, then run this setup again.",
  );
  process.exit(1);
}
const packages = path.join(root, ".runtime", "packages");
mkdirSync(packages, { recursive: true });
let probe = spawnSync(
  python,
  [
    "-c",
    "import PIL, numpy, imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())",
  ],
  {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, PYTHONPATH: packages },
  },
);
if (probe.status !== 0) {
  console.log("Installing the image and video renderer dependencies…");
  const installed = spawnSync(
    python,
    [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "--target",
      packages,
      "-r",
      path.join(root, "requirements.txt"),
    ],
    { stdio: "inherit", windowsHide: true },
  );
  if (installed.status !== 0) process.exit(installed.status || 1);
  probe = spawnSync(
    python,
    [
      "-c",
      "import PIL, numpy, imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())",
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PYTHONPATH: packages },
    },
  );
}
if (probe.status !== 0) {
  console.error("Could not load the renderer dependencies.");
  process.exit(1);
}
const shells = [
  arg("--powershell"),
  process.env.DIRECTOR_POWERSHELL,
  "pwsh.exe",
  path.join(bundled, "native", "powershell", "pwsh.exe"),
].filter(Boolean);
let powershell;
for (const shell of shells) {
  const check = spawnSync(
    shell,
    [
      "-NoProfile",
      "-Command",
      "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; if($s.GetInstalledVoices().Count -lt 1){exit 2}; Write-Output 'ready'; $s.Dispose()",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (check.status === 0 && check.stdout.includes("ready")) {
    powershell = shell;
    break;
  }
}
if (!powershell) {
  console.error(
    "PowerShell 7 and a Windows speech voice are required. Install PowerShell 7 from Microsoft and run setup again.",
  );
  process.exit(1);
}
writeFileSync(
  path.join(root, "runtime.json"),
  JSON.stringify(
    {
      python,
      pythonPackages: packages,
      ffmpeg: probe.stdout.trim(),
      powershell,
    },
    null,
    2,
  ),
);
console.log(
  "Director Studio is configured. Run npm start in this folder, then open http://127.0.0.1:4317",
);
