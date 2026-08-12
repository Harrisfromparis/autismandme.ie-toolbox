import wixData from "wix-data";
import wixLocationFrontend from "wix-location-frontend";
import { currentMember } from "wix-members-frontend";
import {
  getGovernedPathwayRun,
  decideGovernedPathway
} from "backend/iLearn-AgentOS-Pathway.web";

const PATHWAYS = "LearningPathways";
const BLOCKS = "PathwayBlocks";
const RESOURCES = "iLearnResources";

let pathwayId = "";
let runId = "";
let run = null;
let pathway = null;

$w.onReady(async function () {
  pathwayId = String(wixLocationFrontend.query.pathwayId || "").trim();
  runId = String(wixLocationFrontend.query.runId || "").trim();

  wireBackButton();
  wireDecisionButtons();

  if (!pathwayId) {
    setText("#previewStatusText", "No pathway was selected.");
    return;
  }

  try {
    await requireSignedInTeacher();
    await loadPreview();
  } catch (error) {
    console.error("Could not load pathway preview.", error);
    setText("#previewStatusText", cleanError(error?.message || error));
    setDecisionEnabled(false);
  }
});

async function loadPreview() {
  const [pathwayRecord, blocksResult] = await Promise.all([
    wixData.get(PATHWAYS, pathwayId),
    wixData.query(BLOCKS).eq("pathwayId", pathwayId).ascending("blockOrder").limit(100).find()
  ]);

  pathway = pathwayRecord;
  if (!pathway) throw new Error("Pathway not found.");

  setText("#previewTitleText", pathway.title || "Untitled pathway");
  setText("#previewProgrammeText", pathway.programme || "");
  setText("#previewYearGroupText", pathway.yearGroup || "");
  setText("#previewAimText", pathway.learningAim || "");
  setText("#previewStatusText", humanStatus(pathway.status, pathway.approvalStatus));

  prepareBlocks(blocksResult.items || []);
  await prepareResources(blocksResult.items || []);

  if (runId) {
    run = await getGovernedPathwayRun(runId);
    renderGovernance(run);
  } else {
    // Old pathways remain viewable; only Agent OS drafts get the governed decision bar.
    setDecisionEnabled(false);
  }
}

function renderGovernance(currentRun) {
  const quality = currentRun?.quality || {};
  const blocking = Array.isArray(quality.blockingIssues) ? quality.blockingIssues : [];
  const warnings = Array.isArray(quality.warnings) ? quality.warnings : [];

  const qualityText = blocking.length
    ? `BLOCKED · ${blocking.join(" • ")}`
    : warnings.length
      ? `QA passed with notes · ${warnings.join(" • ")}`
      : "QA passed · curriculum, provenance and accessibility checks complete";

  setText("#qualityStatusText", qualityText);
  setText("#approvalStatusText", approvalLabel(currentRun));

  const resources = currentRun?.outputs?.resources || [];
  setText(
    "#sourceSummaryText",
    resources.length
      ? `${resources.length} approved source${resources.length === 1 ? "" : "s"} were selected by the Resource Agent."
          `.replace('"\n          ', '')
      : "No mapped external source was available; check the QA notes before approving."
  );

  const canDecide = currentRun.status === "awaiting-approval" || currentRun.status === "changes-requested";
  setDecisionEnabled(canDecide && blocking.length === 0);
}

function wireBackButton() {
  try {
    $w("#previewBackButton").onClick(() => wixLocationFrontend.to("/teacher-dashboard"));
  } catch (error) {
    console.warn("previewBackButton is unavailable.", error);
  }
}

function wireDecisionButtons() {
  wireButton("#approvePathwayButton", "approve");
  wireButton("#approveWithEditsButton", "approve-with-edits");
  wireButton("#requestChangesButton", "request-changes");
  wireButton("#rejectPathwayButton", "reject");
}

function wireButton(selector, decision) {
  try {
    $w(selector).onClick(async () => {
      await makeDecision(selector, decision);
    });
  } catch (error) {
    // The deploy README lists these four optional editor controls. Old previews still render without them.
  }
}

async function makeDecision(selector, decision) {
  if (!runId) {
    setText("#approvalStatusText", "This older pathway has no governed Agent Run.");
    return;
  }

  const button = safeElement(selector);
  if (button) {
    button.disable();
    button.label = decision === "approve" ? "Publishing…" : "Saving decision…";
  }

  try {
    const notes = safeValue("#approvalNotesInput").trim();
    const payload = {
      notes,
      requestedChanges: decision === "request-changes" && notes ? [notes] : []
    };

    if (decision === "approve-with-edits") {
      // Page-specific editing controls can populate this hidden/optional JSON field.
      const editJson = safeValue("#approvedPathwayJsonInput").trim();
      if (editJson) payload.pathway = JSON.parse(editJson);
    }

    const result = await decideGovernedPathway(runId, decision, payload);
    setText("#approvalStatusText", decisionResultText(result));
    setText("#previewStatusText", result?.status || decision);

    if (result?.status === "published") {
      setDecisionEnabled(false);
      if (button) button.label = "Published ✓";
    } else if (result?.status === "changes-requested") {
      setDecisionEnabled(false);
      if (button) button.label = "Changes requested ✓";
    } else if (result?.status === "rejected") {
      setDecisionEnabled(false);
      if (button) button.label = "Rejected";
    }

    run = await getGovernedPathwayRun(runId);
  } catch (error) {
    console.error("Could not save teacher decision.", error);
    setText("#approvalStatusText", cleanError(error?.message || error));
    if (button) button.label = "Try again";
  } finally {
    if (button && run?.status === "awaiting-approval") button.enable();
  }
}

function prepareBlocks(items) {
  const repeater = firstElement(["#pathwayBlocksRepeater", "#learningBlocksRepeater", "#blocksRepeater"]);
  if (!repeater || typeof repeater.onItemReady !== "function") return;

  repeater.onItemReady(($item, itemData) => {
    setItemText($item, ["#blockHeadingText", "#learningBlockHeadingText", "#blockTitleText"], itemData.heading || itemData.title || `Block ${itemData.blockOrder || ""}`);
    setItemText($item, ["#blockContentText", "#learningBlockContentText", "#blockBodyText"], itemData.content || "");
    setItemText($item, ["#blockTypeText", "#learningBlockTypeText"], itemData.blockType || "");
  });
  repeater.data = items;
}

async function prepareResources(blocks) {
  const ids = [...new Set(
    blocks.flatMap((block) => String(block.resourceIDs || "").split(",").map((x) => x.trim()).filter(Boolean))
  )];
  if (!ids.length) return;

  const records = [];
  for (const id of ids.slice(0, 20)) {
    const result = await wixData.query(RESOURCES).eq("resourceId", id).eq("active", true).eq("approved", true).limit(1).find();
    if (result.items[0]) records.push(result.items[0]);
  }

  const repeater = firstElement(["#supportingResourcesRepeater", "#resourcesRepeater", "#resourceRepeater"]);
  if (!repeater || typeof repeater.onItemReady !== "function") return;

  repeater.onItemReady(($item, itemData) => {
    setItemText($item, ["#resourceTitleText", "#supportingResourceTitleText"], itemData.title || "Resource");
    setItemText($item, ["#resourceTypeText", "#supportingResourceTypeText"], [itemData.resourceType, itemData.mediaType].filter(Boolean).join(" · "));
    setItemText($item, ["#resourceSourceText", "#supportingResourceSourceText"], itemData.sourceOrganisation || "");
    setItemText($item, ["#resourceAccessibilityText", "#supportingResourceAccessibilityText"], itemData.accessibilityFeatures || "");
    for (const selector of ["#openResourceButton", "#resourceOpenButton"]) {
      try {
        $item(selector).onClick(() => {
          if (itemData.sourceUrl) wixLocationFrontend.to(itemData.sourceUrl);
        });
      } catch (error) {
        // optional button id
      }
    }
  });
  repeater.data = records;
}

function setDecisionEnabled(enabled) {
  for (const selector of ["#approvePathwayButton", "#approveWithEditsButton", "#requestChangesButton", "#rejectPathwayButton"]) {
    try {
      if (enabled) $w(selector).enable(); else $w(selector).disable();
    } catch (error) {
      // optional control
    }
  }
}

async function requireSignedInTeacher() {
  const member = await currentMember.getMember();
  if (!member?._id) throw new Error("Sign in as the teacher who owns this pathway.");
  return member;
}

function approvalLabel(currentRun) {
  if (!currentRun) return "";
  if (currentRun.status === "awaiting-approval") return "Teacher decision required";
  if (currentRun.status === "approved") return "Approved and published";
  if (currentRun.status === "changes-requested") return "Changes requested";
  if (currentRun.status === "rejected") return "Rejected";
  if (currentRun.status === "blocked") return "Blocked by QA";
  return currentRun.status || "";
}

function decisionResultText(result) {
  if (result?.status === "published") return "Approved by teacher · pathway published";
  if (result?.status === "changes-requested") return "Returned for changes · not published";
  if (result?.status === "rejected") return "Rejected by teacher · archived";
  return result?.status || "Decision saved";
}

function humanStatus(status, approvalStatus) {
  if (approvalStatus === "pending" || status === "draft") return "Draft · awaiting teacher review";
  if (status === "published") return "Published";
  if (status === "archived") return "Archived";
  return String(status || "Draft");
}

function firstElement(selectors) {
  for (const selector of selectors) {
    try { return $w(selector); } catch (error) { /* keep looking */ }
  }
  return null;
}

function safeElement(selector) {
  try { return $w(selector); } catch (error) { return null; }
}

function safeValue(selector) {
  try { return String($w(selector).value || ""); } catch (error) { return ""; }
}

function setText(selector, value) {
  try { $w(selector).text = String(value || ""); } catch (error) { /* optional */ }
}

function setItemText($item, selectors, value) {
  for (const selector of selectors) {
    try {
      $item(selector).text = String(value || "");
      return;
    } catch (error) {
      // Try next legacy/current id.
    }
  }
}

function cleanError(message) {
  return String(message || "")
    .replace(/^.*ILEARN_[A-Z_]+:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .slice(0, 600);
}
