export function parseScript(script, characters = []) {
  const known = characters.map((c) => c.name.toLowerCase());
  const shots = [];
  let location = "The story begins";
  let notes = "";
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(INT\.|EXT\.|SCENE\s+\d|#{1,3}\s)/i.test(line)) {
      location = line.replace(/^#+\s*/, "");
      continue;
    }
    if (/^\[.*\]$/.test(line)) {
      notes = line.slice(1, -1);
      continue;
    }
    const match = line.match(/^([^:]{1,50}):\s*(.+)$/);
    const isSpeaker =
      match &&
      (known.includes(match[1].toLowerCase()) ||
        !/^(camera|action|shot|panel|background|music|sound|sfx|note|duration)$/i.test(
          match[1],
        ));
    if (isSpeaker)
      shots.push({
        speaker: match[1].trim(),
        dialogue: match[2],
        action: notes,
        scene: location,
      });
    else if (/^(action|camera|background|music|sound|sfx|note):/i.test(line))
      notes = [notes, line].filter(Boolean).join(" ");
    else
      shots.push({
        speaker: "Narrator",
        dialogue: line,
        action: notes,
        scene: location,
      });
    if (isSpeaker) notes = "";
  }
  return shots.map((s, i) => ({
    ...s,
    id: `shot-${i + 1}`,
    camera: ["wide", "medium", "close"][i % 3],
    duration: Math.max(3, Math.ceil(s.dialogue.split(/\s+/).length / 2.4) + 1),
    background: null,
  }));
}
export function parseStoryboard(text) {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^(?:panel|shot)\s*\d+\s*[:.\-]?\s*/i, ""));
}
export function planEpisode(project) {
  const shots = parseScript(project.script, project.characters);
  const panels = parseStoryboard(project.storyboard);
  return shots.map((shot, i) => ({
    ...shot,
    action: [panels[i] || "", shot.action].filter(Boolean).join(" — "),
    camera:
      project.style === "gentle"
        ? "wide"
        : project.style === "cinematic"
          ? i % 2
            ? "close"
            : "wide"
          : shot.camera,
  }));
}
export function estimateDuration(shots) {
  return shots.reduce((sum, s) => sum + Number(s.duration || 3), 0) + 3.5;
}
