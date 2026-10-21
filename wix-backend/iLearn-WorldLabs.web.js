import { Permissions, webMethod } from "wix-web-module";
import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";
import { currentMember } from "wix-members-backend";

const WORLD_LABS_API = "https://api.worldlabs.ai/marble/v1";
const DEFAULT_MODEL = "marble-1.0-draft";
const ALLOWED_MODELS = new Set([
  "marble-1.0-draft",
  "marble-1.1",
  "marble-1.1-plus"
]);

/**
 * Starts a private Marble generation. The teacher must explicitly request this;
 * pathway creation never spends World Labs credits automatically.
 */
export const startEducationalWorld = webMethod(
  Permissions.SiteMember,
  async (rawBrief) => {
    const member = await requireMember();
    const brief = prepareBrief(rawBrief);
    const apiKey = await requireApiKey();

    const response = await fetch(`${WORLD_LABS_API}/worlds:generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "WLT-Api-Key": apiKey
      },
      body: JSON.stringify({
        display_name: brief.displayName,
        model: brief.model,
        tags: ["ilearn", "education", brief.programmeTag],
        permission: {
          public: false,
          allow_id_access: false,
          allowed_readers: [],
          allowed_writers: []
        },
        world_prompt: {
          type: "text",
          disable_recaption: false,
          text_prompt: buildWorldPrompt(brief)
        }
      })
    });

    const data = await readWorldLabsResponse(response, "start world generation");
    if (!data?.operation_id) throw new Error("World Labs returned no operation ID.");

    return {
      operationId: data.operation_id,
      done: Boolean(data.done),
      status: data.metadata?.progress?.status || "QUEUED",
      description: data.metadata?.progress?.description || "World generation queued",
      requestedBy: member._id,
      model: brief.model,
      estimatedCredits: brief.model === "marble-1.0-draft" ? 230 : 1580
    };
  }
);

/** Polls a generation and returns only the public-safe world fields needed by iLEARN. */
export const getEducationalWorldStatus = webMethod(
  Permissions.SiteMember,
  async (operationId) => {
    await requireMember();
    const safeOperationId = validateId(operationId, "operation ID");
    const apiKey = await requireApiKey();
    const response = await fetch(
      `${WORLD_LABS_API}/operations/${encodeURIComponent(safeOperationId)}`,
      { headers: { "WLT-Api-Key": apiKey } }
    );
    const data = await readWorldLabsResponse(response, "check world generation");

    if (data.error) {
      return {
        operationId: safeOperationId,
        done: true,
        status: "FAILED",
        description: data.error.message || "World generation failed."
      };
    }

    const world = data.done ? toSafeWorld(data.response) : null;
    return {
      operationId: safeOperationId,
      done: Boolean(data.done),
      status: data.metadata?.progress?.status || (data.done ? "SUCCEEDED" : "IN_PROGRESS"),
      description: data.metadata?.progress?.description || "World generation in progress",
      progress: data.metadata?.progress?.percentage || null,
      world
    };
  }
);

function prepareBrief(raw = {}) {
  const programme = cleanText(raw.programme, 80) || "Irish secondary education";
  const subject = cleanText(raw.subject, 80) || "English";
  const yearGroup = cleanText(raw.yearGroup, 60) || "secondary school";
  const topic = cleanText(raw.topic, 180);
  const learningAim = cleanText(raw.learningAim || raw.teacherIntent, 500);
  if (!topic) throw new Error("Add a topic before generating a world.");
  if (!learningAim) throw new Error("Add the intended learning before generating a world.");

  const requestedModel = cleanText(raw.model, 40) || DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(requestedModel)) throw new Error("Unsupported Marble model.");

  return {
    programme,
    subject,
    yearGroup,
    topic,
    learningAim,
    model: requestedModel,
    displayName: cleanText(raw.displayName, 64) || `iLEARN · ${topic}`.slice(0, 64),
    programmeTag: programme.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "secondary"
  };
}

function buildWorldPrompt(brief) {
  return [
    `Create a realistic, coherent, navigable educational environment for ${brief.programme}, ${brief.subject}, ${brief.yearGroup}.`,
    `Topic: ${brief.topic}.`,
    `Learning purpose: ${brief.learningAim}.`,
    "Design one clear walking route with three visually distinct stopping areas: orientation, exploration, and reflection.",
    "Keep the main route wide, level, uncluttered, and readable. Include calm lighting, strong visual landmarks, predictable sight lines, and quiet pause spaces.",
    "Do not include written labels, floating text, UI, crowds, hazards, weapons, frightening imagery, flashing lights, or sensory overload.",
    "Leave open floor space at each stop so iLEARN can add accessible symbols, task markers, and an avatar navigation layer later.",
    "Use historically and culturally appropriate architecture where the topic calls for it. Do not invent factual displays or quotations."
  ].join(" ");
}

function toSafeWorld(world) {
  if (!world) return null;
  const id = world.id || world.world_id || "";
  return {
    id,
    displayName: world.display_name || "iLEARN world",
    marbleUrl: world.world_marble_url || (id ? `https://marble.worldlabs.ai/world/${id}` : ""),
    caption: world.assets?.caption || "",
    thumbnailUrl: world.assets?.thumbnail_url || "",
    panoramaUrl: world.assets?.imagery?.pano_url || "",
    colliderMeshUrl: world.assets?.mesh?.collider_mesh_url || "",
    splat100kUrl: world.assets?.splats?.spz_urls?.["100k"] || "",
    splat500kUrl: world.assets?.splats?.spz_urls?.["500k"] || ""
  };
}

async function requireMember() {
  const member = await currentMember.getMember();
  if (!member?._id) throw new Error("Sign in to generate an educational world.");
  return member;
}

async function requireApiKey() {
  const apiKey = await getSecret("WORLD_LABS_API_KEY");
  if (!apiKey) throw new Error("WORLD_LABS_API_KEY is not configured.");
  return apiKey;
}

async function readWorldLabsResponse(response, action) {
  let data = {};
  try {
    data = await response.json();
  } catch (_) {
    // Use the status-specific error below when the provider returned no JSON.
  }
  if (response.ok) return data;
  if (response.status === 402) throw new Error("World Labs API credits are insufficient.");
  if (response.status === 429) throw new Error("World Labs is busy. Wait a minute and try again.");
  throw new Error(data?.detail || data?.message || `Could not ${action} (${response.status}).`);
}

function validateId(value, label) {
  const clean = String(value || "").trim();
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(clean)) throw new Error(`Invalid ${label}.`);
  return clean;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
