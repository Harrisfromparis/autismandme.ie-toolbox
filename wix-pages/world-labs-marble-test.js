import {
  startEducationalWorld,
  getEducationalWorldStatus
} from "backend/iLearn-WorldLabs.web";

const POLL_MS = 10000;
const MAX_POLLS = 48;

$w.onReady(() => {
  $w("#marbleStatusText").text = "Ready to create a private draft world.";
  $w("#marblePreviewImage").hide();
  $w("#marbleOpenButton").hide();
  $w("#marbleGenerateButton").onClick(generateWorld);
});

async function generateWorld() {
  setBusy(true);
  try {
    const started = await startEducationalWorld({
      programme: $w("#programmeDropdown").value,
      subject: $w("#subjectInput").value,
      yearGroup: $w("#yearGroupInput").value,
      topic: $w("#topicInput").value,
      learningAim: $w("#learningAimInput").value,
      model: "marble-1.0-draft"
    });
    $w("#marbleStatusText").text = "World generation started. This draft normally takes about 20 seconds.";
    await pollUntilDone(started.operationId);
  } catch (error) {
    $w("#marbleStatusText").text = error?.message || "The world could not be generated.";
  } finally {
    setBusy(false);
  }
}

async function pollUntilDone(operationId) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const result = await getEducationalWorldStatus(operationId);
    $w("#marbleStatusText").text = result.description || "Building the world…";
    if (result.done) {
      if (result.status !== "SUCCEEDED" || !result.world) {
        throw new Error(result.description || "World generation failed.");
      }
      showWorld(result.world);
      return;
    }
    await wait(POLL_MS);
  }
  throw new Error("The world is still processing. Try checking again shortly.");
}

function showWorld(world) {
  $w("#marbleStatusText").text = "Draft world ready. Review it before using it with learners.";
  if (world.thumbnailUrl) {
    $w("#marblePreviewImage").src = world.thumbnailUrl;
    $w("#marblePreviewImage").show();
  }
  if (world.marbleUrl) {
    $w("#marbleOpenButton").link = world.marbleUrl;
    $w("#marbleOpenButton").target = "_blank";
    $w("#marbleOpenButton").show();
  }
}

function setBusy(busy) {
  if (busy) $w("#marbleGenerateButton").disable();
  else $w("#marbleGenerateButton").enable();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
