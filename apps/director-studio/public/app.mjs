import { planEpisode, estimateDuration } from "./planner.mjs";
const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
let project = freshProject(),
  voices = [],
  selected = 0,
  tab = "create",
  timer,
  toastTimer,
  previewTimer,
  pollTimer,
  saveTimer,
  images = new Map(),
  dirty = false,
  lastResult = null,
  rendering = false;
function freshProject() {
  return {
    id: crypto.randomUUID(),
    title: "",
    series: "",
    characters: [],
    script: "",
    storyboard: "",
    style: "comedy",
    shots: [],
    speech: true,
    captions: true,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    resolution: "720",
    voiceRate: 0,
    narratorVoice: "Microsoft Zira Desktop",
    background: null,
    music: null,
    job: null,
  };
}
function toast(message, error = false) {
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 6000);
}
async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "The studio could not complete that request.");
  return data;
}
const post = (url, data) =>
  api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
function touch() {
  dirty = true;
  $("saveState").textContent = "Unsaved changes";
  if (lastResult)
    $("resultStale").textContent =
      "You have made changes since this render. Create the episode again to include them.";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => save(false).catch((e) => toast(e.message, true)),
    1800,
  );
}
function readFields() {
  for (const key of [
    "title",
    "series",
    "script",
    "storyboard",
    "resolution",
    "narratorVoice",
  ])
    project[key] = $(key).value;
  project.voiceRate = Number($("voiceRate").value);
  for (const key of ["speech", "captions", "reducedMotion"])
    project[key] = $(key).checked;
  return project;
}
async function save(notify = true) {
  readFields();
  const result = await post("/api/projects", project);
  project.id = result.id;
  dirty = false;
  $("saveState").textContent = "Saved on this computer";
  localStorage.setItem("director-last-project", project.id);
  await refreshProjects();
  if (notify) toast("Project saved.");
}
async function refreshProjects() {
  const list = await api("/api/projects");
  $("projectList").innerHTML =
    list
      .map(
        (p) =>
          `<button class="project-link" data-project="${escape(p.id)}" title="${escape(p.title || "Untitled episode")}">▧ &nbsp; ${escape(p.title || "Untitled episode")}</button>`,
      )
      .join("") || '<p class="project-link">Your episodes will appear here</p>';
  $("projectList")
    .querySelectorAll("[data-project]")
    .forEach((b) => (b.onclick = () => load(b.dataset.project)));
  $("openProject").innerHTML =
    '<option value="">Open episode…</option>' +
    list
      .map(
        (p) =>
          `<option value="${escape(p.id)}">${escape(p.title || "Untitled episode")}</option>`,
      )
      .join("");
}
$("openProject").onchange = (e) => {
  if (e.target.value)
    load(e.target.value).catch((error) => toast(error.message, true));
};
async function load(id) {
  if (dirty) await save(false);
  clearTimeout(pollTimer);
  rendering = false;
  project = await api("/api/projects/" + id);
  selected = 0;
  lastResult = null;
  $("resultPanel").classList.add("hidden");
  $("renderProgress").classList.add("hidden");
  $("emptyExport").classList.remove("hidden");
  hydrate();
  localStorage.setItem("director-last-project", id);
  if (project.job) poll(project.job);
  toast("Episode opened.");
}
function hydrate() {
  for (const key of [
    "title",
    "series",
    "script",
    "storyboard",
    "resolution",
    "narratorVoice",
    "voiceRate",
  ])
    $(key).value = project[key] ?? "";
  for (const key of ["speech", "captions", "reducedMotion"])
    $(key).checked = Boolean(project[key]);
  $("headerTitle").textContent = project.title || "Untitled episode";
  document
    .querySelectorAll("[data-style]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.style === project.style),
    );
  renderCharacters();
  renderShots();
  syncAssets();
  syncDirector();
  drawPreview();
}
function showTab(next) {
  stopPreview();
  tab = next;
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + next));
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === next));
  if (next === "storyboard") renderShots();
  if (next === "director") {
    syncDirector();
    drawPreview();
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
for (const key of [
  "title",
  "series",
  "script",
  "storyboard",
  "resolution",
  "narratorVoice",
  "voiceRate",
  "speech",
  "captions",
  "reducedMotion",
])
  $(key).addEventListener("input", () => {
    readFields();
    $("headerTitle").textContent = project.title || "Untitled episode";
    touch();
    if (key === "captions" || key === "reducedMotion") drawPreview();
  });
$("saveProject").onclick = () => save().catch((e) => toast(e.message, true));
$("newProject").onclick = async () => {
  if (dirty) await save(false);
  clearTimeout(pollTimer);
  rendering = false;
  project = freshProject();
  selected = 0;
  lastResult = null;
  hydrate();
  $("resultPanel").classList.add("hidden");
  $("renderProgress").classList.add("hidden");
  $("emptyExport").classList.remove("hidden");
  showTab("create");
};
document.querySelectorAll("[data-style]").forEach(
  (b) =>
    (b.onclick = () => {
      project.style = b.dataset.style;
      document
        .querySelectorAll("[data-style]")
        .forEach((x) => x.classList.toggle("selected", x === b));
      touch();
      drawPreview();
    }),
);
async function upload(file) {
  if (!file) return null;
  if (file.size > 15 * 1024 * 1024)
    throw Error("Please use files smaller than 15 MB.");
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return (await post("/api/assets", { name: file.name, data })).url;
}
async function addCharacters(files) {
  try {
    for (const file of files) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type))
        throw Error("Please use PNG, JPG or WebP character artwork.");
      if (project.characters.length >= 12)
        throw Error("This version supports up to 12 characters.");
      const image = await upload(file);
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      project.characters.push({
        id: crypto.randomUUID(),
        name,
        image,
        voice: voices.find((v) => v.includes("Zira")) || voices[0],
        mouth: false,
        mouthX: 0.5,
        mouthY: 0.38,
      });
    }
    renderCharacters();
    touch();
    toast(
      "Character artwork added. Give each character the same name used in your script.",
    );
  } catch (e) {
    toast(e.message, true);
  }
}
for (const id of ["charactersUpload", "dropUpload"])
  $(id).onchange = (e) => {
    addCharacters(e.target.files);
    e.target.value = "";
  };
const zone = $("uploadZone");
zone.ondragover = (e) => {
  e.preventDefault();
  zone.classList.add("dragging");
};
zone.ondragleave = () => zone.classList.remove("dragging");
zone.ondrop = (e) => {
  e.preventDefault();
  zone.classList.remove("dragging");
  addCharacters(e.dataTransfer.files);
};
function voiceOptions(value) {
  return voices
    .map(
      (v) =>
        `<option value="${escape(v)}" ${v === value ? "selected" : ""}>${escape(v.replace("Microsoft ", "").replace(" Desktop", ""))}</option>`,
    )
    .join("");
}
function renderCharacters() {
  $("characterList").innerHTML = project.characters
    .map(
      (c) =>
        `<article class="character" data-character="${c.id}"><button class="remove" title="Remove character" aria-label="Remove ${escape(c.name)}">×</button><img src="${escape(c.image)}" alt="${escape(c.name)} artwork"><label>Character name<input data-field="name" value="${escape(c.name)}" maxlength="50"></label><label>Voice<select data-field="voice">${voiceOptions(c.voice)}</select></label><label class="check"><input type="checkbox" data-field="removeWhite" ${c.removeWhite ? "checked" : ""}> Remove near-white pixels</label><details><summary>Optional mouth animation</summary><p class="field-note">Adds an animated mouth at a position you set. Keep off to preserve your original drawing.</p><label class="check"><input type="checkbox" data-field="mouth" ${c.mouth ? "checked" : ""}> Enable authored mouth</label><label>Mouth across (%)<input data-field="mouthX" type="number" min="0" max="100" value="${Math.round(c.mouthX * 100)}"></label><label>Mouth down (%)<input data-field="mouthY" type="number" min="0" max="100" value="${Math.round(c.mouthY * 100)}"></label></details></article>`,
    )
    .join("");
  $("characterList")
    .querySelectorAll("[data-character]")
    .forEach((el) => {
      const c = project.characters.find((c) => c.id === el.dataset.character);
      el.querySelector(".remove").onclick = () => {
        project.characters = project.characters.filter((x) => x !== c);
        renderCharacters();
        touch();
      };
      el.querySelectorAll("[data-field]").forEach(
        (input) =>
          (input.oninput = () => {
            const key = input.dataset.field;
            c[key] =
              input.type === "checkbox"
                ? input.checked
                : key === "mouthX" || key === "mouthY"
                  ? Math.max(0, Math.min(1, Number(input.value) / 100))
                  : input.value;
            images.delete(c.image + "-processed");
            touch();
            drawPreview();
          }),
      );
    });
  $("posterCast").innerHTML = project.characters
    .slice(0, 2)
    .map((c) => `<img src="${escape(c.image)}" alt="${escape(c.name)}">`)
    .join("");
  document
    .querySelector(".poster")
    .classList.toggle("has-cast", project.characters.length > 0);
}
$("sampleScript").onclick = () => {
  const names = project.characters.map((c) => c.name);
  const a = names[0] || "Alex",
    b = names[1] || "Sam";
  $("title").value = "The mysterious envelope";
  $("series").value = project.series || "Autism & Me";
  $("script").value =
    `INT. THE NEWSROOM — MORNING\n\n[An unexpected envelope has arrived.]\n${a}: Someone has sent us a very important letter.\n${b}: Does it say who it is from?\n${a}: No. But they have used three stamps.\n${b}: That is either very important, or very bad at postage.\n${a}: Shall we open it?\n${b}: After tea. All mysteries are better after tea.`;
  $("storyboard").value =
    "Panel 1: Wide shot. The characters are in the newsroom.\nPanel 2: Close-up. A curious reaction.\nPanel 3: Medium shot of the speaker.\nPanel 4: Close-up for the punchline.\nPanel 5: Wide shot of both characters.\nPanel 6: Hold on the final line.";
  readFields();
  touch();
  toast(
    "Sample script added. Add your own character artwork to bring it to life.",
  );
};
$("makeStoryboard").onclick = async () => {
  readFields();
  if (!project.characters.length) {
    toast("Add at least one character image first.", true);
    return;
  }
  if (!project.script.trim()) {
    toast("Paste a script first.", true);
    $("script").focus();
    return;
  }
  if (
    project.shots.length &&
    !confirm(
      "Replace the current shot plan with a new plan from your script? Existing shot edits will be replaced.",
    )
  )
    return;
  project.shots = planEpisode(project).map((s) => {
    const a = s.action.toLowerCase();
    return {
      ...s,
      camera: /close[- ]?up/.test(a)
        ? "close"
        : /wide/.test(a)
          ? "wide"
          : /medium/.test(a)
            ? "medium"
            : s.camera,
      duration: /hold|pause/.test(a) ? s.duration + 1 : s.duration,
    };
  });
  selected = 0;
  touch();
  await save(false);
  showTab("storyboard");
  const unmatched = [
    ...new Set(
      project.shots
        .filter(
          (s) =>
            s.speaker !== "Narrator" &&
            !project.characters.some(
              (c) => c.name.toLowerCase() === s.speaker.toLowerCase(),
            ),
        )
        .map((s) => s.speaker),
    ),
  ];
  toast(
    unmatched.length
      ? "Shot plan created. Assign matching character names for: " +
          unmatched.join(", ")
      : "Your storyboard is ready. Check each shot before directing.",
  );
};
function renderShots() {
  const shots = project.shots || [];
  $("shotCount").textContent = shots.length;
  $("emptyStoryboard").classList.toggle("hidden", shots.length > 0);
  $("planSummary").classList.toggle("hidden", !shots.length);
  $("planSummary").textContent =
    `${shots.length} shots  ·  ${project.characters.length} characters  ·  About ${Math.ceil(estimateDuration(shots) / 60)} min before speech timing  ·  Cutout animation`;
  $("shotList").innerHTML = shots
    .map((s, i) => {
      const c =
        project.characters.find(
          (c) => c.name.toLowerCase() === s.speaker.toLowerCase(),
        ) || project.characters[0];
      return `<article class="shot" data-shot="${i}"><div class="shot-preview">${c ? `<img src="${escape(c.image)}" alt="${escape(c.name)}">` : ""}<span class="shot-index">SHOT ${String(i + 1).padStart(2, "0")}</span></div><div class="shot-fields"><div class="shot-title"><h3>${escape(s.scene)}</h3><div class="shot-actions"><button data-op="up" aria-label="Move shot up" ${i === 0 ? "disabled" : ""}>↑</button><button data-op="down" aria-label="Move shot down" ${i === shots.length - 1 ? "disabled" : ""}>↓</button><button data-op="remove" aria-label="Remove shot">×</button></div></div><div class="two-fields"><label>Speaker<input data-field="speaker" value="${escape(s.speaker)}" maxlength="50"></label><label>Seconds<input data-field="duration" type="number" min="1" max="120" value="${s.duration}"></label></div><label>Dialogue<textarea data-field="dialogue" rows="2">${escape(s.dialogue)}</textarea></label><label>Storyboard direction<textarea data-field="action" rows="2">${escape(s.action)}</textarea></label><div class="two-fields"><label>Framing<select data-field="camera"><option value="wide" ${s.camera === "wide" ? "selected" : ""}>Wide</option><option value="medium" ${s.camera === "medium" ? "selected" : ""}>Medium</option><option value="close" ${s.camera === "close" ? "selected" : ""}>Close-up</option></select></label><button class="text-button" data-op="direct">Direct this shot →</button></div></div></article>`;
    })
    .join("");
  $("shotList")
    .querySelectorAll("[data-shot]")
    .forEach((el) => {
      const i = Number(el.dataset.shot);
      el.querySelectorAll("[data-field]").forEach(
        (input) =>
          (input.oninput = () => {
            project.shots[i][input.dataset.field] =
              input.dataset.field === "duration"
                ? Math.max(1, Math.min(120, Number(input.value) || 1))
                : input.value;
            touch();
          }),
      );
      el.querySelectorAll("[data-op]").forEach(
        (b) =>
          (b.onclick = () => {
            if (b.dataset.op === "direct") {
              selected = i;
              showTab("director");
              return;
            }
            if (b.dataset.op === "remove") project.shots.splice(i, 1);
            else {
              const j = i + (b.dataset.op === "up" ? -1 : 1);
              [project.shots[i], project.shots[j]] = [
                project.shots[j],
                project.shots[i],
              ];
            }
            selected = Math.max(
              0,
              Math.min(selected, project.shots.length - 1),
            );
            renderShots();
            touch();
          }),
      );
    });
}
function syncDirector() {
  const s = project.shots[selected];
  $("currentShotLabel").textContent = s
    ? `Shot ${selected + 1} of ${project.shots.length} · ${s.speaker}`
    : "No shot selected";
  $("directorCamera").value = s?.camera || "wide";
  $("directorDuration").value = s?.duration || 4;
  $("directorAction").value = s?.action || "";
  $("renderEpisode").disabled = rendering || !project.shots.length;
  $("previewShot").disabled = !s;
  $("filmstrip").innerHTML = project.shots
    .map((s, i) => {
      const c =
        project.characters.find(
          (c) => c.name.toLowerCase() === s.speaker.toLowerCase(),
        ) || project.characters[0];
      return `<button class="film-shot ${i === selected ? "selected" : ""}" data-index="${i}">${c ? `<img src="${escape(c.image)}" alt="">` : ""}<span>${String(i + 1).padStart(2, "0")} · ${escape(s.speaker)}</span><span>${s.duration}s · ${escape(s.camera)}</span></button>`;
    })
    .join("");
  $("filmstrip")
    .querySelectorAll("[data-index]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          stopPreview();
          selected = Number(b.dataset.index);
          syncDirector();
          drawPreview();
        }),
    );
}
for (const [id, key] of [
  ["directorCamera", "camera"],
  ["directorDuration", "duration"],
  ["directorAction", "action"],
])
  $(id).oninput = () => {
    const s = project.shots[selected];
    if (!s) return;
    s[key] =
      key === "duration"
        ? Math.max(1, Math.min(120, Number($(id).value) || 1))
        : $(id).value;
    touch();
    drawPreview();
  };
$("goDirector").onclick = () => showTab("director");
$("previousShot").onclick = () => {
  stopPreview();
  selected = Math.max(0, selected - 1);
  syncDirector();
  drawPreview();
};
$("nextShot").onclick = () => {
  stopPreview();
  selected = Math.min(project.shots.length - 1, selected + 1);
  syncDirector();
  drawPreview();
};
document.querySelectorAll("[data-direction]").forEach(
  (b) =>
    (b.onclick = () => {
      const s = project.shots[selected];
      if (!s) {
        toast("Create your storyboard first.", true);
        return;
      }
      const d = b.dataset.direction;
      if (d === "close" || d === "wide") s.camera = d;
      else
        s.duration = Math.max(
          1,
          Math.min(120, s.duration + (d === "slower" ? 2 : -1)),
        );
      $("directionFeedback").textContent =
        `Shot ${selected + 1} updated: ${s.camera === "close" ? "close-up" : s.camera + " shot"}, at least ${s.duration} seconds. Speech may extend it.`;
      syncDirector();
      touch();
      drawPreview();
    }),
);
async function getImage(url, removeWhite = false) {
  if (!url) return null;
  const key = url + (removeWhite ? "-processed" : "");
  if (images.has(key)) return images.get(key);
  const image = new Image();
  image.src = url;
  await image.decode();
  if (removeWhite) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const c = canvas.getContext("2d");
    c.drawImage(image, 0, 0);
    const pixels = c.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4)
      if (
        Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) > 238
      )
        pixels.data[i + 3] = 0;
    c.putImageData(pixels, 0, 0);
    images.set(key, canvas);
    return canvas;
  }
  images.set(key, image);
  return image;
}
let drawToken = 0;
async function drawPreview(time = 0) {
  const token = ++drawToken,
    canvas = $("stage"),
    ctx = canvas.getContext("2d"),
    s = project.shots[selected];
  const palette = {
    comedy: ["#1b233c", "#68407a", "#ffb86b"],
    cinematic: ["#071a2b", "#244a53", "#d3b784"],
    gentle: ["#263f4b", "#527b75", "#e5cd98"],
  }[project.style] || ["#1b233c", "#68407a", "#ffb86b"];
  const gradient = ctx.createLinearGradient(0, 0, 0, 720);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(1, palette[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1280, 720);
  if (!s) {
    ctx.fillStyle = "#e5d9ec";
    ctx.font = "32px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("Your story will come to life here.", 640, 360);
    return;
  }
  const bg = await getImage(s.background || project.background);
  if (token !== drawToken) return;
  if (bg) {
    const ratio = Math.max(1280 / bg.width, 720 / bg.height);
    ctx.drawImage(
      bg,
      (1280 - bg.width * ratio) / 2,
      (720 - bg.height * ratio) / 2,
      bg.width * ratio,
      bg.height * ratio,
    );
  } else {
    ctx.fillStyle = palette[0];
    ctx.beginPath();
    ctx.ellipse(640, 840, 850, 450, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const speaker = project.characters.find(
    (c) => c.name.toLowerCase() === s.speaker.toLowerCase(),
  );
  const cast = speaker
    ? [speaker, ...project.characters.filter((c) => c !== speaker).slice(0, 1)]
    : project.characters.slice(0, 2);
  for (let i = 0; i < cast.length; i++) {
    const c = cast[i],
      image = await getImage(c.image, c.removeWhite);
    if (token !== drawToken) return;
    let factor = Math.min(
      (1280 * 0.38) / image.width,
      (720 * 0.67) / image.height,
    );
    if (s.camera === "close") factor *= 1.33;
    else if (s.camera === "wide") factor *= 0.85;
    const w = image.width * factor,
      h = image.height * factor,
      x =
        1280 * (cast.length === 1 ? 0.5 : i === 0 ? 0.32 : 0.72) -
        w / 2 +
        (project.reducedMotion ? 0 : Math.sin(time * 0.8) * 14),
      y =
        720 * 0.83 -
        h +
        (project.reducedMotion ? 0 : Math.sin(time * 3.3 + i) * 4);
    ctx.fillStyle = "#0003";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, 720 * 0.835, w * 0.32, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(image, x, y, w, h);
    if (c.mouth && c === speaker && project.speech) {
      ctx.fillStyle = "#291b31";
      ctx.beginPath();
      ctx.ellipse(
        x + w * c.mouthX,
        y + h * c.mouthY,
        9,
        1.5 + Math.abs(Math.sin(time * 12)) * 3.5,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.textAlign = "left";
  ctx.font = "17px Segoe UI";
  ctx.fillStyle = "#0a0d1dbb";
  ctx.fillRect(25, 25, Math.min(900, ctx.measureText(s.scene).width + 35), 40);
  ctx.fillStyle = "#f5e8f0";
  ctx.fillText(s.scene, 42, 51);
  if (project.captions) {
    ctx.font = "bold 27px Segoe UI";
    const lines = [];
    let line = "";
    for (const word of s.dialogue.split(/\s+/)) {
      const a = (line + " " + word).trim();
      if (ctx.measureText(a).width > 1040 && line) {
        lines.push(line);
        line = word;
      } else line = a;
    }
    if (line) lines.push(line);
    const visible = lines.slice(0, 3);
    const height = visible.length * 36 + 50;
    ctx.fillStyle = "#070c19e8";
    ctx.beginPath();
    ctx.roundRect(76, 700 - height, 1128, height, 16);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = palette[2];
    ctx.font = "bold 14px Segoe UI";
    ctx.fillText(s.speaker.toUpperCase(), 640, 723 - height);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 27px Segoe UI";
    visible.forEach((line, i) =>
      ctx.fillText(line, 640, 757 - height + i * 36),
    );
  }
}
function stopPreview() {
  cancelAnimationFrame(previewTimer);
  speechSynthesis.cancel();
  $("previewShot").textContent = "▶ Preview with voice";
  $("previewShot").dataset.playing = "false";
}
$("previewShot").onclick = () => {
  const s = project.shots[selected];
  if (!s) return;
  if ($("previewShot").dataset.playing === "true") {
    stopPreview();
    $("previewShot").dataset.playing = "false";
    return;
  }
  $("previewShot").dataset.playing = "true";
  $("previewShot").textContent = "■ Stop preview";
  const started = performance.now();
  const animate = () => {
    drawPreview((performance.now() - started) / 1000);
    previewTimer = requestAnimationFrame(animate);
  };
  animate();
  if (project.speech) {
    const utterance = new SpeechSynthesisUtterance(s.dialogue);
    const c = project.characters.find(
      (c) => c.name.toLowerCase() === s.speaker.toLowerCase(),
    );
    const match = speechSynthesis
      .getVoices()
      .find((v) =>
        v.name.includes(
          (c?.voice || project.narratorVoice).replace(" Desktop", ""),
        ),
      );
    if (match) utterance.voice = match;
    utterance.rate = 1 + project.voiceRate * 0.08;
    utterance.onend = () => {
      stopPreview();
      $("previewShot").dataset.playing = "false";
    };
    speechSynthesis.speak(utterance);
  } else
    setTimeout(() => {
      stopPreview();
      $("previewShot").dataset.playing = "false";
    }, s.duration * 1000);
};
function syncAssets() {
  $("backgroundStatus").textContent = project.background
    ? "Custom background uploaded"
    : "Studio backdrop";
  $("musicStatus").textContent = project.music
    ? "Music uploaded · mixed quietly under dialogue"
    : "No music selected";
}
for (const [id, key] of [
  ["backgroundUpload", "background"],
  ["musicUpload", "music"],
  ["shotBackground", "shotBackground"],
])
  $(id).onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      const url = await upload(file);
      if (key === "shotBackground") {
        if (!project.shots[selected]) throw Error("Create a storyboard first.");
        project.shots[selected].background = url;
      } else project[key] = url;
      syncAssets();
      touch();
      drawPreview();
      toast("Production asset added.");
    } catch (error) {
      toast(error.message, true);
    } finally {
      e.target.value = "";
    }
  };
$("clearBackground").onclick = () => {
  project.background = null;
  syncAssets();
  touch();
  drawPreview();
};
$("clearMusic").onclick = () => {
  project.music = null;
  syncAssets();
  touch();
};
$("clearShotBackground").onclick = () => {
  if (project.shots[selected]) project.shots[selected].background = null;
  touch();
  drawPreview();
};
$("renderEpisode").onclick = async () => {
  try {
    readFields();
    if (project.characters.some((c) => !c.name.trim()))
      throw Error("Give every character a name.");
    if (
      new Set(project.characters.map((c) => c.name.toLowerCase())).size !==
      project.characters.length
    )
      throw Error("Each character needs a different name.");
    await save(false);
    stopPreview();
    $("resultPanel").classList.add("hidden");
    const { id } = await post("/api/render", project);
    project.job = id;
    await save(false);
    showTab("export");
    poll(id);
  } catch (e) {
    toast(e.message, true);
  }
};
function poll(id) {
  clearTimeout(pollTimer);
  rendering = true;
  syncDirector();
  $("renderProgress").classList.remove("hidden");
  $("emptyExport").classList.add("hidden");
  const check = async () => {
    try {
      const result = await api("/api/jobs/" + id);
      $("progressMessage").textContent = result.message;
      $("progressBar").value = result.progress;
      $("progressTitle").textContent = "Making your episode";
      if (result.status === "completed") {
        rendering = false;
        lastResult = result;
        $("renderProgress").classList.add("hidden");
        $("resultPanel").classList.remove("hidden");
        $("finishedVideo").src = result.video;
        $("downloadVideo").href = result.video;
        $("downloadSrt").href = result.subtitles;
        $("resultTitle").textContent = project.title || "Your episode";
        $("resultStale").textContent =
          "Built-in cutout animation · generated system voices. Your original artwork is preserved.";
        syncDirector();
        toast("Your finished episode is ready to play and download.");
        return;
      }
      if (result.status === "failed") {
        rendering = false;
        $("progressTitle").textContent = "Production needs attention";
        $("progressMessage").textContent = result.message;
        syncDirector();
        toast("Render failed: " + result.message, true);
        return;
      }
      pollTimer = setTimeout(check, 1200);
    } catch (e) {
      rendering = false;
      $("progressTitle").textContent = "Connection interrupted";
      $("progressMessage").textContent =
        "Keep the local server running, then reopen this episode to resume checking its render.";
      toast(e.message, true);
    }
  };
  check();
}
async function backup() {
  readFields();
  const urls = new Set(project.characters.map((c) => c.image));
  if (project.background) urls.add(project.background);
  if (project.music) urls.add(project.music);
  for (const s of project.shots) if (s.background) urls.add(s.background);
  const assets = {};
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw Error("An asset could not be backed up.");
    const blob = await response.blob();
    assets[url] = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  const data = {
    format: "director-studio-project",
    version: 1,
    project,
    assets,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download =
    (project.title || "director-episode").replace(/[^a-z0-9\- ]/gi, "") +
    ".director.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast("Portable project backup downloaded, including artwork.");
}
for (const id of ["downloadProject", "backupResult"])
  $(id).onclick = () => backup().catch((e) => toast(e.message, true));
$("importProject").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024)
      throw Error("The project backup is too large.");
    const data = JSON.parse(await file.text());
    if (
      data.format !== "director-studio-project" ||
      !Array.isArray(data.project?.characters) ||
      !Array.isArray(data.project?.shots)
    )
      throw Error("Choose a Director Studio project backup.");
    if (dirty) await save(false);
    const replacements = {};
    for (const [old, encoded] of Object.entries(data.assets || {}))
      replacements[old] = (await post("/api/assets", { data: encoded })).url;
    const p = data.project;
    for (const c of p.characters) {
      c.id = crypto.randomUUID();
      c.image = replacements[c.image] || c.image;
    }
    for (const s of p.shots)
      if (s.background)
        s.background = replacements[s.background] || s.background;
    p.background = replacements[p.background] || null;
    p.music = replacements[p.music] || null;
    p.id = crypto.randomUUID();
    p.job = null;
    project = { ...freshProject(), ...p };
    selected = 0;
    hydrate();
    await save(false);
    showTab("create");
    toast("Project restored with its character artwork.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    e.target.value = "";
  }
};
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
try {
  voices = await api("/api/voices");
  if (!Array.isArray(voices)) voices = [voices];
  $("narratorVoice").innerHTML = voiceOptions(project.narratorVoice);
  const last = localStorage.getItem("director-last-project");
  if (last) {
    try {
      project = await api("/api/projects/" + last);
    } catch {}
  }
  hydrate();
  await refreshProjects();
  if (project.job) poll(project.job);
} catch (error) {
  toast("The local studio server is unavailable: " + error.message, true);
}
