import { Permissions, webMethod } from "wix-web-module";
import { secrets } from "wix-secrets-backend.v2";
import { elevate } from "wix-auth";
import { fetch } from "wix-fetch";

const getSecretValue = elevate(secrets.getSecretValue);
const ALLOWED_PROGRAM = "LC_ENGLISH_2027";
const ALLOWED_COURSE = "lc-english-2027-macbeth";

function assertPayload(payload) {
  if (!payload || payload.program !== ALLOWED_PROGRAM || payload.courseId !== ALLOWED_COURSE) {
    throw new Error("This programme or course is not available.");
  }
  if (typeof payload.mastery !== "number" || payload.mastery < 0 || payload.mastery > 1) {
    throw new Error("Mastery must be between 0 and 1.");
  }
  if (typeof payload.cognitiveLoad !== "number" || payload.cognitiveLoad < 0 || payload.cognitiveLoad > 1) {
    throw new Error("Cognitive load must be between 0 and 1.");
  }
}

async function readSecret(name) {
  const result = await getSecretValue(name);
  if (!result?.value) throw new Error(`Missing Wix secret: ${name}`);
  return result.value;
}

export const getAdaptiveDecision = webMethod(Permissions.SiteMember, async (payload) => {
  assertPayload(payload);
  const [serviceUrl, apiKey] = await Promise.all([
    readSecret("ILEARN_SERVICE_URL"),
    readSecret("ILEARN_SERVICE_API_KEY"),
  ]);
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/api/v1/adaptive/decision`, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "X-iLEARN-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.detail || "The adaptive lesson service failed.");
  return body;
});

export const checkTeachBack = webMethod(Permissions.SiteMember, async (payload) => {
  assertPayload(payload);
  const [serviceUrl, apiKey] = await Promise.all([
    readSecret("ILEARN_SERVICE_URL"),
    readSecret("ILEARN_SERVICE_API_KEY"),
  ]);
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/api/v1/teach-back`, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "X-iLEARN-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.detail || "The teach-back check failed.");
  return body;
});
