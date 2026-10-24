import http from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rename,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 4317);
const runtime = JSON.parse(
  await readFile(path.join(ROOT, "runtime.json"), "utf8"),
);
for (const dir of ["assets", "projects", "jobs"])
  await mkdir(path.join(DATA, dir), { recursive: true });
// A stopped local encoder cannot resume halfway through a raw-frame stream.
for (const id of await readdir(path.join(DATA, "jobs"))) {
  try {
    const file = path.join(DATA, "jobs", id, "status.json");
    const state = JSON.parse(await readFile(file, "utf8"));
    if (state.status === "running" || state.status === "queued")
      await writeFile(
        file,
        JSON.stringify({
          status: "failed",
          progress: 0,
          message:
            "The studio stopped before this render finished. Open Director Mode and create the episode again.",
        }),
      );
  } catch {}
}
let activeJob = null;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".srt": "application/x-subrip",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
function run(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, ...options });
    let stdout = "",
      stderr = "";
    child.stdout?.on("data", (x) => (stdout += x));
    child.stderr?.on("data", (x) => (stderr += x));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(stderr.slice(-3500) || `Process exited ${code}`)),
    );
  });
}
function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let size = 0,
    chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 80 * 1024 * 1024) throw new Error("Upload exceeds 80 MB.");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
const safeId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const atomic = async (file, value) => {
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
};
function assetPath(url) {
  if (
    !url ||
    !/^\/media\/assets\/[a-f0-9-]+\.(png|jpg|webp|mp3|wav)$/.test(url)
  )
    return null;
  return path.join(DATA, url.replace("/media/", ""));
}
async function render(id, project) {
  const dir = path.join(DATA, "jobs", id);
  const statusFile = path.join(dir, "status.json");
  try {
    await atomic(statusFile, {
      status: "running",
      progress: 3,
      message: "Preparing character artwork and dialogue",
    });
    const shots = project.shots.map((s, i) => {
      const character = project.characters.find(
        (c) => c.name.toLowerCase() === s.speaker.toLowerCase(),
      );
      return {
        ...s,
        wav: path.join(dir, `line-${i}.wav`),
        voice:
          character?.voice || project.narratorVoice || "Microsoft Zira Desktop",
        background: assetPath(s.background || project.background),
      };
    });
    const manifest = {
      ...project,
      shots,
      characters: project.characters.map((c) => ({
        ...c,
        file: assetPath(c.image),
      })),
      music: assetPath(project.music),
      directory: dir,
      ffmpeg: runtime.ffmpeg,
    };
    const manifestFile = path.join(dir, "manifest.json");
    await atomic(manifestFile, manifest);
    await run(runtime.powershell || "pwsh.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(ROOT, "speech.ps1"),
      "-Manifest",
      manifestFile,
    ]);
    await atomic(statusFile, {
      status: "running",
      progress: 12,
      message: "Rendering movement, cameras and captions",
    });
    await run(runtime.python, [path.join(ROOT, "render.py"), manifestFile], {
      env: { ...process.env, PYTHONPATH: runtime.pythonPackages || "" },
    });
    await atomic(statusFile, {
      status: "completed",
      progress: 100,
      message: "Your episode is ready",
      video: `/media/jobs/${id}/episode.mp4`,
      subtitles: `/media/jobs/${id}/captions.srt`,
      project: `/media/jobs/${id}/project.json`,
    });
    await atomic(path.join(dir, "project.json"), project);
  } catch (error) {
    await atomic(statusFile, {
      status: "failed",
      progress: 0,
      message: error.message,
    });
  } finally {
    activeJob = null;
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const route = url.pathname;
    const host = req.headers.host;
    if (![`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(host)) {
      send(res, 403, { error: "Local access only" });
      return;
    }
    if (
      req.method === "POST" &&
      req.headers.origin &&
      !["http://localhost:" + PORT, "http://127.0.0.1:" + PORT].includes(
        req.headers.origin,
      )
    ) {
      send(res, 403, { error: "Origin not allowed" });
      return;
    }
    if (route === "/api/health") {
      send(res, 200, { ok: true, renderer: "cutout", speech: true, activeJob });
      return;
    }
    if (route === "/api/voices") {
      const result = await run(runtime.powershell || "pwsh.exe", [
        "-NoProfile",
        "-Command",
        "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $v = New-Object System.Speech.Synthesis.SpeechSynthesizer; @($v.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }) | ConvertTo-Json -Compress; $v.Dispose()",
      ]);
      send(res, 200, result.trim() ? JSON.parse(result) : []);
      return;
    }
    if (route === "/api/assets" && req.method === "POST") {
      const input = await body(req);
      const buffer = Buffer.from(input.data || "", "base64");
      let extension;
      if (
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        extension = "png";
      else if (buffer[0] === 255 && buffer[1] === 216) extension = "jpg";
      else if (
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
      )
        extension = "webp";
      else if (
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WAVE"
      )
        extension = "wav";
      else if (
        buffer.toString("ascii", 0, 3) === "ID3" ||
        (buffer[0] === 255 && (buffer[1] & 224) === 224)
      )
        extension = "mp3";
      else throw new Error("Use PNG, JPG or WebP images, or MP3/WAV audio.");
      const filename = randomUUID() + "." + extension;
      await writeFile(path.join(DATA, "assets", filename), buffer);
      send(res, 201, { url: "/media/assets/" + filename });
      return;
    }
    if (route === "/api/projects" && req.method === "GET") {
      const names = await readdir(path.join(DATA, "projects"));
      const projects = [];
      for (const name of names.filter((x) => x.endsWith(".json"))) {
        const p = JSON.parse(await readFile(path.join(DATA, "projects", name)));
        projects.push({ id: p.id, title: p.title, updated: p.updated });
      }
      send(
        res,
        200,
        projects.sort((a, b) => b.updated.localeCompare(a.updated)),
      );
      return;
    }
    if (route === "/api/projects" && req.method === "POST") {
      const project = await body(req);
      if (!safeId(project.id)) project.id = randomUUID();
      project.updated = new Date().toISOString();
      await atomic(path.join(DATA, "projects", project.id + ".json"), project);
      send(res, 200, { id: project.id, updated: project.updated });
      return;
    }
    if (route.startsWith("/api/projects/") && req.method === "GET") {
      const id = route.split("/").pop();
      if (!safeId(id)) throw new Error("Invalid project");
      send(
        res,
        200,
        JSON.parse(await readFile(path.join(DATA, "projects", id + ".json"))),
      );
      return;
    }
    if (route === "/api/render" && req.method === "POST") {
      if (activeJob) {
        send(res, 409, {
          error: "An episode is already rendering. Wait for it to finish.",
        });
        return;
      }
      const p = await body(req);
      if (!Array.isArray(p.shots) || !p.shots.length || p.shots.length > 300)
        throw new Error("Create a shot plan with 1–300 shots first.");
      if (!Array.isArray(p.characters) || !p.characters.length)
        throw new Error("Add at least one character.");
      for (const s of p.shots) {
        if (
          typeof s.dialogue !== "string" ||
          s.dialogue.length > 5000 ||
          !Number.isFinite(Number(s.duration)) ||
          s.duration < 1 ||
          s.duration > 120
        )
          throw new Error(
            "Each shot needs valid text and a duration between 1 and 120 seconds.",
          );
      }
      if (p.shots.reduce((n, s) => n + Number(s.duration), 0) > 1800)
        throw new Error("This version supports episodes up to 30 minutes.");
      p.voiceRate = Math.max(-5, Math.min(5, Number(p.voiceRate) || 0));
      p.resolution = p.resolution === "1080" ? "1080" : "720";
      const id = randomUUID();
      await mkdir(path.join(DATA, "jobs", id));
      activeJob = id;
      await atomic(path.join(DATA, "jobs", id, "status.json"), {
        status: "queued",
        progress: 0,
        message: "Queued",
      });
      void render(id, p);
      send(res, 202, { id });
      return;
    }
    if (route.startsWith("/api/jobs/")) {
      const id = route.split("/").pop();
      if (!safeId(id)) throw new Error("Invalid job");
      send(
        res,
        200,
        JSON.parse(await readFile(path.join(DATA, "jobs", id, "status.json"))),
      );
      return;
    }
    if (req.method !== "GET") {
      send(res, 405, { error: "Method not allowed" });
      return;
    }
    let file;
    if (route.startsWith("/media/")) {
      const relative = decodeURIComponent(route.slice(7));
      if (
        !/^(assets\/[a-f0-9-]+\.(png|jpg|webp|mp3|wav)|jobs\/[a-f0-9-]+\/(episode\.mp4|captions\.srt|project\.json))$/.test(
          relative,
        )
      ) {
        send(res, 404, { error: "Not found" });
        return;
      }
      file = path.join(DATA, relative);
    } else {
      const rel =
        route === "/" ? "index.html" : decodeURIComponent(route.slice(1));
      file = path.resolve(PUBLIC, rel);
      if (!file.startsWith(PUBLIC + path.sep)) {
        send(res, 404, { error: "Not found" });
        return;
      }
    }
    const info = await stat(file);
    let start = 0,
      end = info.size - 1,
      status = 200;
    const range = req.headers.range;
    if (range) {
      const m = range.match(/^bytes=(\d+)-(\d*)$/);
      if (m) {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), end) : end;
        if (start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${info.size}` });
          res.end();
          return;
        }
        status = 206;
      }
    }
    const headers = {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    };
    if (status === 206)
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    res.writeHead(status, headers);
    const { createReadStream } = await import("node:fs");
    createReadStream(file, { start, end }).pipe(res);
  } catch (error) {
    send(res, error.code === "ENOENT" ? 404 : 400, {
      error: error.code === "ENOENT" ? "Not found" : error.message,
    });
  }
});
server.listen(PORT, "127.0.0.1", () =>
  console.log(`Director Studio is ready at http://127.0.0.1:${PORT}`),
);
