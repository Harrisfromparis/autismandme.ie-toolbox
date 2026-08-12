import wixData from "wix-data";
import { currentMember, authentication } from "wix-members-frontend";
import wixLocationFrontend from "wix-location-frontend";
import {
  createGovernedPreLearningPathway,
  getGovernedPreLearningUsage
} from "backend/iLearn-AgentOS-Pathway.web";

const OUTCOMES = "iLearnCurriculumOutcomes";
const MAX_SELECTED_OUTCOMES = 5;
const selectedOutcomes = new Map();

$w.onReady(async function () {
  setupNavigation();
  setupOutcomeRepeater();
  setupSearch();
  setupGenerateButton();
  await Promise.all([loadOutcomes(), refreshAccessStatus()]);
});

function setupNavigation() {
  onClick("#programmeNextButton", () => changeState("classState"));
  onClick("#classBackButton", () => changeState("programmeState"));
  onClick("#classNextButton", () => changeState("aimState"));
  onClick("#aimBackButton", () => changeState("classState"));
  onClick("#aimNextButton", () => changeState("outcomesState"));
  onClick("#outcomesBackButton", () => changeState("aimState"));
  onClick("#outcomesNextButton", () => changeState("formatsState"));
  onClick("#formatsBackButton", () => changeState("outcomesState"));
  onClick("#formatsNextButton", () => {
    showReviewInformation();
    changeState("reviewState");
  });
  onClick("#reviewBackButton", () => changeState("formatsState"));
}

function setupSearch() {
  try {
    $w("#outcomeSearchInput").onInput(() => {
      loadOutcomes($w("#outcomeSearchInput").value || "");
    });
  } catch (error) {
    console.warn("Outcome search input is not available.", error);
  }

  for (const selector of ["#programmeDropdown", "#yearGroupDropdown", "#levelDropdown"]) {
    try {
      $w(selector).onChange(() => {
        selectedOutcomes.clear();
        loadOutcomes($w("#outcomeSearchInput")?.value || "");
      });
    } catch (error) {
      // Optional filter control.
    }
  }
}

function setupGenerateButton() {
  onClick("#generatePathwayButton", generateGovernedPathway);
}

function setupOutcomeRepeater() {
  $w("#outcomeRepeater").onItemReady(($item, itemData) => {
    const outcomeId = itemData.outcomeId || itemData._id;
    const code = itemData.outcomeCode || itemData.outcomeId || "Outcome";
    const description = itemData.officialOutcomeText || "Outcome description unavailable.";

    $item("#outcomeCodeText").text = code;
    $item("#outcomeDescriptionText").text = description;
    $item("#outcomeCheckbox").label = "Select";
    $item("#outcomeCheckbox").checked = selectedOutcomes.has(outcomeId);

    $item("#outcomeCheckbox").onChange(() => {
      const checked = $item("#outcomeCheckbox").checked;
      if (checked) {
        if (selectedOutcomes.size >= MAX_SELECTED_OUTCOMES && !selectedOutcomes.has(outcomeId)) {
          $item("#outcomeCheckbox").checked = false;
          setStatus(`Choose up to ${MAX_SELECTED_OUTCOMES} outcomes.`);
          return;
        }
        selectedOutcomes.set(outcomeId, {
          id: itemData._id,
          outcomeId,
          code,
          description,
          strand: itemData.strand || "",
          cycle: itemData.cycle || "",
          yearGroup: itemData.yearGroup || "",
          level: itemData.level || ""
        });
      } else {
        selectedOutcomes.delete(outcomeId);
      }
    });
  });
}

async function loadOutcomes(searchText = "") {
  try {
    const cleanSearch = String(searchText || "").trim();
    let query = wixData.query(OUTCOMES).eq("active", true);

    const subject = "English";
    query = query.eq("subject", subject);

    const programme = safeValue("#programmeDropdown");
    if (programme) {
      const cycle = programmeToCycle(programme);
      if (cycle) query = query.contains("cycle", cycle);
    }

    const yearGroup = safeValue("#yearGroupDropdown");
    if (yearGroup) query = query.contains("yearGroup", yearGroup);

    const level = safeValue("#levelDropdown");
    if (level && !/^common$/i.test(level)) query = query.contains("level", level);

    if (cleanSearch) {
      const base = wixData.query(OUTCOMES).eq("active", true).eq("subject", subject);
      query = base.contains("officialOutcomeText", cleanSearch)
        .or(base.contains("outcomeCode", cleanSearch))
        .or(base.contains("outcomeId", cleanSearch))
        .or(base.contains("strand", cleanSearch));
    }

    const result = await query.ascending("outcomeCode").limit(100).find();
    $w("#outcomeRepeater").data = result.items;
  } catch (error) {
    console.error("Could not load curriculum outcomes.", error);
    $w("#outcomeRepeater").data = [];
    setStatus("Curriculum outcomes could not be loaded.");
  }
}

async function generateGovernedPathway() {
  const button = $w("#generatePathwayButton");
  button.disable();
  button.label = "Checking curriculum…";

  try {
    const member = await currentMember.getMember();
    if (!member?._id) {
      button.label = "Sign in to continue";
      await authentication.promptLogin();
      return;
    }

    const access = await getGovernedPreLearningUsage();
    showAccessStatus(access);
    if (access?.subscriptionRequired) {
      button.label = "Choose a plan";
      wixLocationFrontend.to("/plans-pricing");
      return;
    }

    const details = collectDetails();
    validateDetails(details);

    button.label = "Agents are preparing your draft…";
    setStatus("Checking curriculum, hunting approved resources and assembling the pathway…");

    const result = await createGovernedPreLearningPathway(details);
    showAccessStatus(result?.usage || access);

    if (result?.status === "blocked") {
      button.label = "Teacher review needed";
      const issues = Array.isArray(result.blockingIssues) ? result.blockingIssues : [];
      setStatus(issues.length ? `Blocked: ${issues.join(" • ")}` : "Quality checks blocked this draft.");
      return;
    }

    if (!result?.pathwayId || !result?.runId) {
      throw new Error("The governed workflow returned no draft pathway.");
    }

    button.label = "Draft ready for review ✓";
    setStatus("Draft created. Sources and QA are ready for your decision.");
    wixLocationFrontend.to(
      `/pathway-preview?pathwayId=${encodeURIComponent(result.pathwayId)}&runId=${encodeURIComponent(result.runId)}`
    );
  } catch (error) {
    console.error("Could not create governed pathway.", error);
    const message = String(error?.message || error || "Generation failed.");
    if (message.includes("ILEARN_SUBSCRIPTION_REQUIRED")) {
      button.label = "Choose a plan";
      wixLocationFrontend.to("/plans-pricing");
      return;
    }
    button.label = "Try Again";
    setStatus(cleanError(message));
  } finally {
    button.enable();
  }
}

function collectDetails() {
  const formats = getSelectedFormats();
  return {
    subject: "English",
    programme: safeValue("#programmeDropdown"),
    yearGroup: safeValue("#yearGroupDropdown"),
    level: safeValue("#levelDropdown"),
    topic: String(safeValue("#learningAimInput") || "").trim(),
    learningAim: String(safeValue("#learningAimInput") || "").trim(),
    objectives: String(safeValue("#objectivesInput") || "").trim(),
    outcomes: Array.from(selectedOutcomes.values()).map((outcome) => ({
      outcomeId: outcome.outcomeId,
      code: outcome.code,
      description: outcome.description
    })),
    formats,
    interactiveOrImmersive: formats.some((format) => /interactive|immersive|3d|animation/i.test(format))
  };
}

function validateDetails(details) {
  if (!details.programme) throw new Error("Please select a programme.");
  if (!details.yearGroup) throw new Error("Please select a year group.");
  if (!details.level) throw new Error("Please select a level.");
  if (!details.learningAim) throw new Error("Please enter a learning aim.");
  if (!details.objectives) throw new Error("Please enter learning objectives.");
  if (!details.outcomes.length) throw new Error("Please select at least one curriculum outcome.");
  if (!details.formats.length) throw new Error("Please select at least one learning format.");
}

function getSelectedFormats() {
  const formats = [];
  const options = [
    ["#standardTextCheckbox", "Standard text"],
    ["#simplifiedTextCheckbox", "Simplified text"],
    ["#audioCheckbox", "Audio"],
    ["#videoCheckbox", "Video"],
    ["#visualSupportsCheckbox", "Visual supports"],
    ["#vocabularyCheckbox", "Key vocabulary"],
    ["#exampleCheckbox", "Worked example"],
    ["#quizCheckbox", "Knowledge check"],
    ["#reflectionCheckbox", "Reflection question"],
    ["#interactiveCheckbox", "Interactive"],
    ["#immersiveCheckbox", "Immersive 3D"]
  ];
  for (const [selector, label] of options) {
    try {
      if ($w(selector).checked) formats.push(label);
    } catch (error) {
      // Optional control not present on this page version.
    }
  }
  return formats;
}

function showReviewInformation() {
  setText("#reviewProgrammeText", safeValue("#programmeDropdown") || "Not selected");
  setText("#reviewYearGroupText", safeValue("#yearGroupDropdown") || "Not selected");
  setText("#reviewLevelText", safeValue("#levelDropdown") || "Not selected");
  setText("#reviewAimText", safeValue("#learningAimInput") || "Not entered");
  setText("#reviewObjectivesText", safeValue("#objectivesInput") || "Not entered");
  const outcomes = Array.from(selectedOutcomes.values()).map((item) => item.code);
  setText("#reviewOutcomesText", outcomes.length ? outcomes.join(", ") : "No outcomes selected");
  const formats = getSelectedFormats();
  setText("#reviewFormatsText", formats.length ? formats.join(", ") : "No formats selected");
}

async function refreshAccessStatus() {
  try {
    const member = await currentMember.getMember();
    if (!member?._id) {
      showAccessStatus({ loggedIn: false, remaining: 20, limit: 20 });
      return;
    }
    showAccessStatus(await getGovernedPreLearningUsage());
  } catch (error) {
    console.warn("Could not load usage status.", error);
  }
}

function showAccessStatus(access = {}) {
  if (access.isUnlimited) {
    setText("#generationStatusText", `${access.planName || "Unlimited"} · unlimited generations`);
    return;
  }
  if (access.loggedIn === false) {
    setText("#generationStatusText", "Sign in for 20 free generations.");
    return;
  }
  const remaining = Number.isFinite(access.remaining) ? access.remaining : 20;
  setText("#generationStatusText", `${remaining} of ${access.limit || 20} free generations remaining`);
}

function programmeToCycle(programme) {
  const value = String(programme || "").toLowerCase();
  if (value.includes("junior")) return "Junior Cycle";
  if (value.includes("transition")) return "Transition Year";
  if (value.includes("leaving") || value.includes("senior")) return "Senior Cycle";
  return "";
}

function changeState(state) {
  $w("#pathwayMultiStateBox").changeState(state);
}

function onClick(selector, handler) {
  try { $w(selector).onClick(handler); } catch (error) { console.warn(`${selector} is unavailable.`, error); }
}

function setText(selector, value) {
  try { $w(selector).text = String(value || ""); } catch (error) { /* optional */ }
}

function setStatus(value) {
  setText("#generationStatusText", value);
}

function safeValue(selector) {
  try { return $w(selector).value || ""; } catch (error) { return ""; }
}

function cleanError(message) {
  return String(message || "")
    .replace(/^.*ILEARN_[A-Z_]+:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .slice(0, 500);
}
