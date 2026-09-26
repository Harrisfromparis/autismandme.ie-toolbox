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
let suggestedOutcomes = [];

$w.onReady(async function () {
  setupNavigation();
  setupOutcomeRepeater();
  setupSearch();
  setupGenerateButton();
  await Promise.all([loadSubjectChoices(), refreshAccessStatus()]);
  await loadOutcomes();
});

function setupNavigation() {
  onClick("#programmeNextButton", () => changeState("classState"));
  onClick("#classBackButton", () => changeState("programmeState"));
  onClick("#classNextButton", () => changeState("aimState"));
  onClick("#aimBackButton", () => changeState("classState"));
  onClick("#aimNextButton", () => {
    showReviewInformation();
    changeState("reviewState");
  });
  onClick("#outcomesBackButton", () => changeState("aimState"));
  onClick("#outcomesNextButton", () => changeState("formatsState"));
  onClick("#formatsBackButton", () => changeState("outcomesState"));
  onClick("#formatsNextButton", () => {
    showReviewInformation();
    changeState("reviewState");
  });
  onClick("#reviewBackButton", () => changeState("aimState"));
}

function setupSearch() {
  try {
    $w("#outcomeSearchInput").onInput(() => {
      loadOutcomes($w("#outcomeSearchInput").value || "");
    });
  } catch (error) {
    console.warn("Outcome search input is not available.", error);
  }

  for (const selector of ["#subjectDropdown", "#programmeDropdown", "#yearGroupDropdown", "#levelDropdown"]) {
    try {
      $w(selector).onChange(() => {
        selectedOutcomes.clear();
        loadOutcomes($w("#outcomeSearchInput")?.value || "");
      });
    } catch (error) {
      // Optional filter control.
    }
  }
  try {
    $w("#topicDropdown").onChange(() => loadOutcomes());
  } catch (error) {
    // Optional quick topic dropdown, configured in Wix Editor.
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

    const subject = safeValue("#subjectDropdown") || "English";
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
    try {
      const topics = [...new Set(result.items.map((item) => String(item.topic || item.strand || "").trim()).filter(Boolean))];
      const dropdown = $w("#topicDropdown");
      const current = dropdown.value;
      dropdown.options = topics.map((value) => ({ label: value, value }));
      if (topics.includes(current)) dropdown.value = current;
    } catch (error) {
      // The quick topic dropdown is optional until added in Wix Editor.
    }
    const topic = safeValue("#topicDropdown") || safeValue("#learningAimInput");
    const terms = String(topic).toLowerCase().match(/[a-z]{4,}/g) || [];
    suggestedOutcomes = result.items
      .map((item) => ({ item, score: terms.filter((term) => `${item.officialOutcomeText || ""} ${item.strand || ""}`.toLowerCase().includes(term)).length }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ item }) => item);
    setText("#suggestedOutcomesText", suggestedOutcomes.length
      ? `Suggested outcomes: ${suggestedOutcomes.map((item) => item.outcomeCode || item.outcomeId).join(", ")}. Confirm on the draft.`
      : "Outcomes will be matched from the official curriculum when you generate.");
  } catch (error) {
    console.error("Could not load curriculum outcomes.", error);
    $w("#outcomeRepeater").data = [];
    setStatus("Curriculum outcomes could not be loaded.");
  }
}

async function loadSubjectChoices() {
  try {
    const subjects = new Set();
    for (let page = 0; page < 5; page += 1) {
      const result = await wixData.query(OUTCOMES).eq("active", true)
        .skip(page * 100).limit(100).find();
      result.items.forEach((item) => { if (item.subject) subjects.add(String(item.subject)); });
      if (result.items.length < 100) break;
    }
    const dropdown = $w("#subjectDropdown");
    const current = dropdown.value;
    dropdown.options = [...subjects].sort().map((value) => ({ label: value, value }));
    if (subjects.has(current)) dropdown.value = current;
  } catch (error) {
    // Existing English-only page remains usable without the optional dropdown.
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
    if (message.includes("ILEARN_OUTCOME_MATCH_REQUIRED")) {
      changeState("outcomesState");
      setStatus("Choose an official outcome for this topic, then continue to Generate.");
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
    subject: safeValue("#subjectDropdown") || "English",
    programme: safeValue("#programmeDropdown"),
    yearGroup: safeValue("#yearGroupDropdown"),
    level: safeValue("#levelDropdown"),
    topic: String(safeValue("#topicDropdown") || safeValue("#learningAimInput") || "").trim(),
    learningAim: String(safeValue("#learningAimInput") || safeValue("#topicDropdown") || "").trim(),
    objectives: String(safeValue("#objectivesInput") || "").trim(),
    planningNotes: String(safeValue("#planningNotesInput") || "").trim(),
    udl: {
      representation: formats.filter((format) => /text|audio|video|visual|vocabulary|example/i.test(format)),
      expression: ["words", "voice", "visual response"],
      engagement: ["choice of entry point", "low-pressure independent start"],
      reducedMotion: false
    },
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
  if (!details.learningAim) throw new Error("Please enter a learning aim.");
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
  setText("#reviewObjectivesText", safeValue("#objectivesInput") || "Suggested automatically from the learning aim");
  const outcomes = Array.from(selectedOutcomes.values()).map((item) => item.code);
  setText("#reviewOutcomesText", outcomes.length ? outcomes.join(", ") : "Matched from official outcomes; check in the draft");
  const formats = getSelectedFormats();
  setText("#reviewFormatsText", formats.length ? formats.join(", ") : "Accessible formats selected automatically");
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
