import wixUsers from "wix-users";
import { getAdaptiveDecision, checkTeachBack } from "backend/adaptiveDecision.web";

const BASE = {
  program: "LC_ENGLISH_2027",
  courseId: "lc-english-2027-macbeth",
  sourceNodeId: "macbeth-act1-scene7",
};

let currentProfile = { mastery: 0.25, cognitiveLoad: 0.82, knowledgeGap: 0.8 };

$w.onReady(() => {
  $w("#supportedStartButton").onClick(() => loadProfile(0.25, 0.82, 0.8));
  $w("#buildingConfidenceButton").onClick(() => loadProfile(0.55, 0.38, 0.5));
  $w("#readyChallengeButton").onClick(() => loadProfile(0.82, 0.20, 0.2));
  $w("#teachBackButton").onClick(checkExplanation);
});

async function loadProfile(mastery, cognitiveLoad, knowledgeGap) {
  currentProfile = { mastery, cognitiveLoad, knowledgeGap };
  $w("#lessonStatusText").text = "Building your lesson…";
  try {
    const result = await getAdaptiveDecision({
      ...BASE,
      ...currentProfile,
      learnerId: wixUsers.currentUser.id,
      lastAnswer: "",
    });
    $w("#questionText").text = result.question;
    $w("#hintText").text = result.optionalHint;
    $w("#sourceText").text = result.citations.map((citation) => citation.excerpt).join(" … ");
    $w("#lessonStatusText").text = `${result.socraticState} · Layer ${result.difficultyLayer}`;
    applyAccessibleView(result.visibleBlocks);
  } catch (error) {
    $w("#lessonStatusText").text = "The lesson could not load. Please try again.";
    console.error(error);
  }
}

async function checkExplanation() {
  const explanation = $w("#teachBackInput").value.trim();
  if (!explanation) {
    $w("#teachBackFeedback").text = "Write a short explanation first.";
    return;
  }
  try {
    const result = await checkTeachBack({
      ...BASE,
      ...currentProfile,
      learnerId: wixUsers.currentUser.id,
      lastAnswer: explanation,
      explanation,
    });
    $w("#teachBackFeedback").text = `${Math.round(result.coverage * 100)}% concept coverage. ${result.feedback}`;
  } catch (error) {
    $w("#teachBackFeedback").text = "The explanation could not be checked. Please try again.";
    console.error(error);
  }
}

function applyAccessibleView(visibleBlocks) {
  const map = {
    flashcards: "#flashcardsSection",
    progress: "#progressSection",
    plan: "#planSection",
    knowledge_graph: "#knowledgeGraphSection",
  };
  Object.entries(map).forEach(([block, selector]) => {
    if (visibleBlocks.includes(block)) $w(selector).expand();
    else $w(selector).collapse();
  });
}
