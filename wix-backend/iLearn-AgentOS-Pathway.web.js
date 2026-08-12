import { Permissions, webMethod } from "wix-web-module";
import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";
import wixData from "wix-data";
import { currentMember } from "wix-members-backend";
import wixPricingPlansBackend, { orders } from "wix-pricing-plans-backend";

const HUGGING_FACE_URL = "https://router.huggingface.co/v1/chat/completions";
const OLLAMA_URL = "https://ollama.com/api/chat";
const OLLAMA_MODEL = "gpt-oss:20b";
const HUGGING_FACE_MODEL = "openai/gpt-oss-20b:fastest";
const OLLAMA_TIMEOUT_MS = 7000;
const HUGGING_FACE_TIMEOUT_MS = 4000;
const FREE_GENERATION_LIMIT = 20;
const MAX_OUTCOMES = 8;
const MAX_RESOURCES = 8;

const COLLECTIONS = {
  usage: "iLearnUsage",
  outcomes: "iLearnCurriculumOutcomes",
  resources: "iLearnResources",
  outcomeResourceMap: "iLearnOutcomeResourceMap",
  pathways: "LearningPathways",
  blocks: "PathwayBlocks",
  runs: "iLearnAgentRuns",
  approvals: "iLearnTeacherApprovals"
};

const UNLIMITED_PLAN_NAMES = new Set([
  "iLearn Monthly Unlimited",
  "iLearn Annual Unlimited"
]);

const APPROVAL_DECISIONS = new Set([
  "approve",
  "approve-with-edits",
  "request-changes",
  "reject"
]);

export const getGovernedPreLearningUsage = webMethod(
  Permissions.SiteMember,
  async () => getMemberAccess()
);

export const createGovernedPreLearningPathway = webMethod(
  Permissions.SiteMember,
  async (rawDetails) => {
    const access = await getMemberAccess();
    enforceUsage(access);

    const request = prepareRequest(rawDetails);
    validateRequest(request);

    const runId = createRunId();
    const pathwayId = `path_${runId}`;

    await saveRun({
      _id: runId,
      runId,
      status: "running",
      requestType: wantsMotion(request) ? "interactive-pathway" : "pathway",
      subject: request.subject,
      programme: request.programme,
      yearGroup: request.yearGroup,
      teacherId: access.memberId,
      learnerId: request.learnerId,
      request,
      agents: buildAgentPlan(request),
      outputs: {},
      quality: {},
      approvalRequired: true,
      approvalStatus: "pending"
    });

    try {
      const officialOutcomes = await loadAndValidateOutcomes(request);
      const resources = await retrieveApprovedResources(request, officialOutcomes);
      const grounded = {
        ...request,
        outcomes: officialOutcomes.map((outcome) => ({
          outcomeId: outcome.outcomeId,
          code: outcome.outcomeCode || outcome.outcomeId,
          description: outcome.officialOutcomeText,
          sourceUrl: outcome.officialSourceUrl
        })),
        resources
      };

      const generation = await generatePathway(grounded);
      const pathway = canonicaliseSources(generation.pathway, grounded.resources);
      const quality = auditPathway(pathway, grounded);
      const motionBrief = wantsMotion(request)
        ? buildMotionBrief(pathway, request)
        : null;

      if (quality.blockingIssues.length) {
        await saveRun({
          _id: runId,
          runId,
          status: "blocked",
          requestType: wantsMotion(request) ? "interactive-pathway" : "pathway",
          subject: request.subject,
          programme: request.programme,
          yearGroup: request.yearGroup,
          teacherId: access.memberId,
          learnerId: request.learnerId,
          request,
          agents: buildAgentPlan(request),
          outputs: {
            officialOutcomes,
            resources,
            pathwayDraft: pathway,
            motionBrief
          },
          quality,
          approvalRequired: true,
          approvalStatus: "blocked"
        });

        return {
          runId,
          status: "blocked",
          quality,
          warnings: quality.warnings,
          blockingIssues: quality.blockingIssues,
          usage: toPublicUsage(access)
        };
      }

      await persistDraft({
        pathwayId,
        runId,
        teacherId: access.memberId,
        request,
        grounded,
        pathway,
        generationMode: generation.generationMode
      });

      const approvalId = `approval_${runId}`;
      const runOutputs = {
        pathwayId,
        officialOutcomes: officialOutcomes.map(publicOutcome),
        resources: resources.map(publicResource),
        pathwayDraft: pathway,
        motionBrief,
        generationMode: generation.generationMode,
        generationNotice: generation.generationNotice
      };

      await Promise.all([
        saveRun({
          _id: runId,
          runId,
          status: "awaiting-approval",
          requestType: wantsMotion(request) ? "interactive-pathway" : "pathway",
          subject: request.subject,
          programme: request.programme,
          yearGroup: request.yearGroup,
          teacherId: access.memberId,
          learnerId: request.learnerId,
          request,
          agents: buildAgentPlan(request),
          outputs: runOutputs,
          quality,
          approvalRequired: true,
          approvalStatus: "pending"
        }),
        wixData.save(
          COLLECTIONS.approvals,
          {
            _id: approvalId,
            approvalId,
            runId,
            teacherId: access.memberId,
            status: "pending",
            decision: "",
            notes: "",
            proposedOutput: {
              pathwayId,
              pathway,
              resources: resources.map(publicResource),
              officialOutcomes: officialOutcomes.map(publicOutcome),
              motionBrief,
              quality,
              generationMode: generation.generationMode
            },
            approvedOutput: {},
            requestedChanges: [],
            decidedIso: ""
          },
          { suppressAuth: true }
        )
      ]);

      const usage = await countSuccessfulGeneration(access, pathwayId);

      return {
        runId,
        pathwayId,
        approvalId,
        status: "awaiting-approval",
        pathwayDraft: pathway,
        resources: resources.map(publicResource),
        officialOutcomes: officialOutcomes.map(publicOutcome),
        motionBrief,
        quality,
        generationMode: generation.generationMode,
        generationNotice: generation.generationNotice,
        usage
      };
    } catch (error) {
      await saveRun({
        _id: runId,
        runId,
        status: "blocked",
        requestType: wantsMotion(request) ? "interactive-pathway" : "pathway",
        subject: request.subject,
        programme: request.programme,
        yearGroup: request.yearGroup,
        teacherId: access.memberId,
        learnerId: request.learnerId,
        request,
        agents: buildAgentPlan(request),
        outputs: {},
        quality: {
          blockingIssues: [cleanText(error?.message || "Generation failed.", 500)],
          warnings: []
        },
        approvalRequired: true,
        approvalStatus: "blocked"
      });
      throw error;
    }
  }
);

export const getGovernedPathwayRun = webMethod(
  Permissions.SiteMember,
  async (runIdValue) => {
    const memberId = await requireMemberId();
    const run = await requireOwnedRun(runIdValue, memberId);
    return publicRun(run);
  }
);

export const listPendingPathwayApprovals = webMethod(
  Permissions.SiteMember,
  async () => {
    const memberId = await requireMemberId();
    const result = await wixData
      .query(COLLECTIONS.approvals)
      .eq("teacherId", memberId)
      .eq("status", "pending")
      .descending("_createdDate")
      .limit(50)
      .find({ suppressAuth: true, consistentRead: true });

    return result.items.map((item) => ({
      approvalId: item.approvalId,
      runId: item.runId,
      status: item.status,
      proposedOutput: item.proposedOutput,
      createdDate: item._createdDate
    }));
  }
);

export const decideGovernedPathway = webMethod(
  Permissions.SiteMember,
  async (runIdValue, decisionValue, payload = {}) => {
    const memberId = await requireMemberId();
    const run = await requireOwnedRun(runIdValue, memberId);
    const runId = run.runId;
    const decision = cleanText(decisionValue, 40);

    if (!APPROVAL_DECISIONS.has(decision)) {
      throw new Error("ILEARN_INVALID_APPROVAL_DECISION");
    }

    if (run.status !== "awaiting-approval" && run.status !== "changes-requested") {
      throw new Error("ILEARN_RUN_NOT_AWAITING_APPROVAL");
    }

    const pathwayId = cleanText(run.outputs?.pathwayId, 120);
    if (!pathwayId) throw new Error("ILEARN_PATHWAY_DRAFT_MISSING");

    const approvalId = `approval_${runId}`;
    const approval = await wixData.get(COLLECTIONS.approvals, approvalId, {
      suppressAuth: true
    });

    const notes = cleanText(payload?.notes, 1500);
    const requestedChanges = Array.isArray(payload?.requestedChanges)
      ? payload.requestedChanges.map((x) => cleanText(x, 500)).filter(Boolean).slice(0, 20)
      : notes && decision === "request-changes"
        ? [notes]
        : [];

    if (decision === "request-changes") {
      await updateApprovalAndRun({
        run,
        approval,
        decision,
        notes,
        requestedChanges,
        runStatus: "changes-requested",
        approvalStatus: "changes-requested"
      });
      return { runId, pathwayId, status: "changes-requested" };
    }

    if (decision === "reject") {
      await setPathwayStatus(pathwayId, memberId, "archived", {
        approvalStatus: "rejected"
      });
      await updateApprovalAndRun({
        run,
        approval,
        decision,
        notes,
        requestedChanges,
        runStatus: "rejected",
        approvalStatus: "rejected"
      });
      return { runId, pathwayId, status: "rejected" };
    }

    let approvedPathway = run.outputs?.pathwayDraft;
    if (decision === "approve-with-edits") {
      approvedPathway = normaliseTeacherEdits(
        payload?.pathway || approvedPathway,
        run.outputs?.resources || []
      );
      await replacePathwayBlocks(pathwayId, memberId, approvedPathway.blocks);
      await updatePathwayHeader(pathwayId, memberId, approvedPathway);
    }

    await setPathwayStatus(pathwayId, memberId, "published", {
      approvalStatus: "approved",
      approvedAt: new Date(),
      agentRunId: runId
    });

    await updateApprovalAndRun({
      run: {
        ...run,
        outputs: {
          ...(run.outputs || {}),
          approvedPathway
        }
      },
      approval,
      decision,
      notes,
      requestedChanges,
      runStatus: "approved",
      approvalStatus: "approved",
      approvedOutput: {
        pathwayId,
        pathway: approvedPathway
      }
    });

    return {
      runId,
      pathwayId,
      status: "published",
      decision,
      pathway: approvedPathway
    };
  }
);

async function loadAndValidateOutcomes(request) {
  const requested = request.outcomes.slice(0, MAX_OUTCOMES);
  const found = [];

  for (const value of requested) {
    const outcomeId = cleanText(value.outcomeId || value._id, 120);
    const outcomeCode = cleanText(value.code || value.outcomeCode, 80);
    let item = null;

    if (outcomeId) {
      try {
        item = await wixData.get(COLLECTIONS.outcomes, outcomeId, {
          suppressAuth: true
        });
      } catch (error) {
        item = null;
      }
    }

    if (!item && outcomeCode) {
      const result = await wixData
        .query(COLLECTIONS.outcomes)
        .eq("outcomeCode", outcomeCode)
        .eq("active", true)
        .limit(5)
        .find({ suppressAuth: true, consistentRead: true });
      item = result.items.find((candidate) =>
        curriculumRecordMatches(candidate, request)
      ) || null;
    }

    if (!item || item.active !== true) {
      throw new Error(`ILEARN_OUTCOME_NOT_FOUND: ${outcomeId || outcomeCode}`);
    }

    if (!curriculumRecordMatches(item, request)) {
      throw new Error(
        `ILEARN_CURRICULUM_MISMATCH: ${item.outcomeId || item._id} does not match ${request.programme}${request.yearGroup ? ` / ${request.yearGroup}` : ""}.`
      );
    }

    found.push(item);
  }

  if (!found.length) throw new Error("ILEARN_NO_VALID_OUTCOMES");
  return uniqueBy(found, (item) => item.outcomeId || item._id).slice(0, MAX_OUTCOMES);
}

async function retrieveApprovedResources(request, outcomes) {
  const scores = new Map();

  for (const preferred of request.resources) {
    const id = cleanText(preferred.resourceId || preferred._id, 120);
    if (id) scores.set(id, 100);
  }

  for (const outcome of outcomes) {
    const result = await wixData
      .query(COLLECTIONS.outcomeResourceMap)
      .eq("outcomeId", outcome.outcomeId || outcome._id)
      .eq("active", true)
      .eq("verified", true)
      .descending("matchStrength")
      .limit(12)
      .find({ suppressAuth: true, consistentRead: true });

    for (const mapping of result.items) {
      const id = cleanText(mapping.resourceId, 120);
      if (!id) continue;
      const score = Math.max(0, Number(mapping.matchStrength) || 0);
      scores.set(id, Math.max(scores.get(id) || 0, score));
    }
  }

  const rankedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);

  const results = [];
  for (const id of rankedIds) {
    const query = await wixData
      .query(COLLECTIONS.resources)
      .eq("resourceId", id)
      .eq("active", true)
      .eq("approved", true)
      .eq("reviewStatus", "Verified")
      .limit(1)
      .find({ suppressAuth: true, consistentRead: true });
    const resource = query.items[0];
    if (!resource) continue;
    if (!resourceMatchesRequest(resource, request)) continue;
    results.push({ ...resource, _rank: scores.get(id) || 0 });
  }

  return results
    .sort((a, b) => b._rank - a._rank)
    .slice(0, MAX_RESOURCES)
    .map((resource) => ({
      resourceId: resource.resourceId,
      title: cleanText(resource.title, 250),
      description: cleanText(resource.shortDescription || resource.description, 700),
      sourceUrl: cleanUrl(resource.sourceUrl),
      sourceOrganisation: cleanText(resource.sourceOrganisation, 180),
      resourceType: cleanText(resource.resourceType, 120),
      mediaType: cleanText(resource.mediaType, 120),
      accessibilityFeatures: cleanText(resource.accessibilityFeatures, 600),
      licence: cleanText(resource.licence, 300),
      examRelevance: cleanText(resource.examRelevance, 500),
      matchStrength: resource._rank
    }));
}

async function generatePathway(details) {
  try {
    const ollamaKey = await getSecret("OLLAMA_API_KEY");
    if (ollamaKey) {
      const result = await runWithTimeout(
        requestPathwayFromOllama(details, ollamaKey),
        OLLAMA_TIMEOUT_MS
      );
      if (result) {
        return {
          pathway: result,
          generationMode: "Ollama Cloud",
          generationNotice: "Generated from server-validated curriculum outcomes and approved resources."
        };
      }
    }
  } catch (error) {
    console.warn("Ollama unavailable; trying Hugging Face.", error);
  }

  try {
    const token = await getSecret("HUGGING_FACE_TOKEN");
    if (token) {
      const result = await runWithTimeout(
        requestPathwayFromHuggingFace(details, token),
        HUGGING_FACE_TIMEOUT_MS
      );
      if (result) {
        return {
          pathway: result,
          generationMode: "Hugging Face AI",
          generationNotice: "Generated from server-validated curriculum outcomes and approved resources."
        };
      }
    }
  } catch (error) {
    console.warn("Hugging Face unavailable; using reliable builder.", error);
  }

  return {
    pathway: buildReliablePathway(details),
    generationMode: "Reliable curriculum builder",
    generationNotice: "Cloud models were unavailable; iLEARN built the draft directly from validated curriculum and approved resources."
  };
}

async function requestPathwayFromOllama(details, apiKey) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: pathwaySystemPrompt() },
        { role: "user", content: buildPathwayPrompt(details) }
      ],
      stream: false,
      format: "json",
      think: "low",
      options: { temperature: 0.1, num_predict: 1200 }
    })
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
  const data = await response.json();
  if (!data?.message?.content) throw new Error("Ollama returned no content.");
  return parseGeneratedPathway(data.message.content, details);
}

async function requestPathwayFromHuggingFace(details, token) {
  const response = await fetch(HUGGING_FACE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: HUGGING_FACE_MODEL,
      messages: [
        { role: "system", content: pathwaySystemPrompt() },
        { role: "user", content: buildPathwayPrompt(details) }
      ],
      temperature: 0.1,
      max_tokens: 1200,
      reasoning_effort: "low",
      response_format: { type: "json_object" }
    })
  });
  if (!response.ok) throw new Error(`Hugging Face returned ${response.status}.`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Hugging Face returned no content.");
  return parseGeneratedPathway(text, details);
}

function pathwaySystemPrompt() {
  return [
    "You are the iLEARN Pathway Agent for Irish secondary education.",
    "Content and pedagogy come first.",
    "Use only the server-validated curriculum outcomes and approved resources supplied.",
    "Never invent curriculum codes, quotations, sources, URLs or facts.",
    "Create a coherent pre-learning journey, not a pile of links.",
    "Preserve the learning goal while offering low-pressure, neuroinclusive ways to engage and respond.",
    "Return compact valid JSON only."
  ].join(" ");
}

function buildPathwayPrompt(details) {
  const outcomesText = details.outcomes
    .map((o, i) => `${i + 1}. ${o.code} (${o.outcomeId}): ${o.description}`)
    .join("\n");
  const resourcesText = details.resources.length
    ? details.resources.map((r, i) => [
        `${i + 1}. ${r.title}`,
        `Resource ID: ${r.resourceId}`,
        `Organisation: ${r.sourceOrganisation}`,
        `Type: ${r.resourceType} / ${r.mediaType}`,
        `Description: ${r.description}`,
        `Accessibility: ${r.accessibilityFeatures}`,
        `URL: ${r.sourceUrl}`
      ].join("\n")).join("\n\n")
    : "No approved external resource is mapped. Do not invent one.";

  return `
PROGRAMME: ${details.programme}
SUBJECT: ${details.subject}
YEAR GROUP: ${details.yearGroup || "Not supplied"}
LEVEL: ${details.level || "Not supplied"}
TOPIC: ${details.topic || "Not supplied"}
LEARNING AIM: ${details.learningAim}
OBJECTIVES: ${details.objectives}
FORMATS: ${details.formats.length ? details.formats.join(", ") : "Standard text"}

VALIDATED CURRICULUM OUTCOMES
${outcomesText}

APPROVED RESOURCES
${resourcesText}

Return exactly one JSON object with title, learningAim, estimatedMinutes and 8 or fewer blocks. Each block must contain order, blockType, heading, content and resourceIds. Use resourceIds only from the supplied list. Include learning aim, prior knowledge, clear explanation, glossary, worked example, knowledge check, reflection and sources when useful. Keep learner-facing language clear and respectful.`;
}

function parseGeneratedPathway(text, details) {
  const cleaned = String(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed?.title || !Array.isArray(parsed?.blocks) || !parsed.blocks.length) {
    throw new Error("The AI returned an incomplete pathway.");
  }
  return normalisePathway(parsed, details);
}

function normalisePathway(pathway, details) {
  const allowed = new Set(details.resources.map((r) => r.resourceId).filter(Boolean));
  const blocks = pathway.blocks.slice(0, 8).map((block, index) => ({
    order: index + 1,
    blockType: cleanText(block.blockType, 80) || defaultBlockType(index),
    heading: cleanText(block.heading, 200) || defaultHeading(index),
    content: cleanText(block.content, 2400),
    resourceIds: Array.isArray(block.resourceIds)
      ? block.resourceIds.map(String).filter((id) => allowed.has(id)).slice(0, 20)
      : []
  }));

  return {
    title: cleanText(pathway.title, 250) || buildReliableTitle(details),
    learningAim: details.learningAim,
    estimatedMinutes: clampNumber(pathway.estimatedMinutes, 5, 60, 15),
    blocks
  };
}

function normaliseTeacherEdits(pathway, resources) {
  const details = {
    learningAim: cleanText(pathway?.learningAim, 800),
    resources: Array.isArray(resources) ? resources : []
  };
  if (!pathway?.title || !Array.isArray(pathway?.blocks)) {
    throw new Error("ILEARN_INVALID_TEACHER_EDIT");
  }
  return normalisePathway(pathway, details);
}

function canonicaliseSources(pathway, resources) {
  const sourceText = resources.length
    ? resources.map((r) => `${r.title}${r.sourceUrl ? ` — ${r.sourceUrl}` : ""}`).join("\n")
    : "No external resource was selected. Use the teacher's authorised curriculum materials.";
  const blocks = pathway.blocks.map((block) =>
    block.blockType === "sourceList"
      ? { ...block, content: sourceText, resourceIds: resources.map((r) => r.resourceId) }
      : block
  );
  return { ...pathway, blocks };
}

function auditPathway(pathway, details) {
  const blockingIssues = [];
  const warnings = [];
  const allowed = new Set(details.resources.map((r) => r.resourceId));

  if (!pathway?.title || !pathway?.learningAim) blockingIssues.push("Pathway header is incomplete.");
  if (!Array.isArray(pathway?.blocks) || pathway.blocks.length < 3) {
    blockingIssues.push("Pathway does not contain enough learning stages.");
  }
  if (pathway.learningAim !== details.learningAim) {
    blockingIssues.push("Generated pathway changed the teacher's learning aim.");
  }
  for (const block of pathway.blocks || []) {
    if (!cleanText(block.content, 20)) blockingIssues.push(`Block ${block.order} has no content.`);
    for (const id of block.resourceIds || []) {
      if (!allowed.has(id)) blockingIssues.push(`Block ${block.order} referenced an unapproved resource ID.`);
    }
  }
  if (!details.resources.length) warnings.push("No verified mapped external resources were available; the draft relies on curriculum context and teacher materials.");

  return {
    passed: blockingIssues.length === 0,
    blockingIssues: uniqueStrings(blockingIssues),
    warnings: uniqueStrings(warnings),
    checks: {
      curriculumValidatedServerSide: true,
      approvedResourcesOnly: true,
      verifiedMappingsOnly: true,
      resourceIdsAllowlisted: true,
      learningAimPreserved: pathway.learningAim === details.learningAim,
      teacherApprovalRequired: true,
      autoPublishDisabled: true
    },
    recommendation: blockingIssues.length ? "blocked" : "ready-for-teacher-review"
  };
}

function buildMotionBrief(pathway, request) {
  return {
    sourceSkill: "oil-oil/oil-motion",
    providerLocked: false,
    purpose: "Use motion only to communicate learning state, focus, progress, feedback or authored atmosphere.",
    driver: "state",
    parameterSpace: "discrete",
    restState: "calm stable first frame with no required movement",
    keyStates: pathway.blocks.map((block, index) => ({
      id: `block-${block.order}`,
      at: pathway.blocks.length <= 1 ? 0 : index / (pathway.blocks.length - 1),
      description: `Focus state for ${block.heading}`
    })),
    semanticMotion: [
      "current learning stage becomes visually dominant",
      "completed state is communicated without relying on motion alone"
    ],
    geometricMotion: [
      "subtle position/scale easing for focus where it does not fake articulated motion"
    ],
    reducedMotion: "Use instant state changes, static focus cues and the same content order.",
    loadingFallback: "Show the complete first learning state immediately.",
    failureFallback: "Continue as an equivalent static or 2D pathway without losing the learning goal.",
    deviceBudget: cleanText(request.deviceBudget, 120) || "responsive-web",
    teacherApprovalRequired: true
  };
}

async function persistDraft({ pathwayId, runId, teacherId, request, grounded, pathway, generationMode }) {
  const parent = {
    _id: pathwayId,
    _owner: teacherId,
    pathwayId,
    teacherMemberId: teacherId,
    ownerMemberId: teacherId,
    title: pathway.title,
    subject: request.subject,
    programme: request.programme,
    yearGroup: request.yearGroup,
    level: request.level,
    topic: request.topic,
    learningAim: request.learningAim,
    objectives: request.objectives,
    outcomeIds: grounded.outcomes.map((o) => o.outcomeId),
    version: 1,
    status: "draft",
    approvalStatus: "pending",
    estimatedMinutes: pathway.estimatedMinutes,
    generationMode,
    experienceVersion: "agent-os-v1",
    agentRunId: runId,
    resourceFilterRequired: true,
    resourceFilterMode: "strict-programme-first",
    resourceFilterConfig: {
      subject: request.subject,
      programme: request.programme,
      yearGroup: request.yearGroup,
      approvedOnly: true,
      verifiedOnly: true,
      activeOnly: true,
      outcomeIds: grounded.outcomes.map((o) => o.outcomeId)
    }
  };

  await wixData.save(COLLECTIONS.pathways, parent, { suppressAuth: true });
  await replacePathwayBlocks(pathwayId, teacherId, pathway.blocks);
}

async function replacePathwayBlocks(pathwayId, teacherId, blocks) {
  const existing = await wixData
    .query(COLLECTIONS.blocks)
    .eq("pathwayId", pathwayId)
    .limit(100)
    .find({ suppressAuth: true, consistentRead: true });

  await Promise.all(existing.items.map((item) =>
    wixData.remove(COLLECTIONS.blocks, item._id, { suppressAuth: true })
  ));

  for (const block of blocks) {
    await wixData.insert(
      COLLECTIONS.blocks,
      {
        _id: createBlockId(pathwayId, block.order),
        _owner: teacherId,
        pathwayId,
        title: cleanText(block.heading, 200),
        heading: cleanText(block.heading, 200),
        blockOrder: Number(block.order) || 1,
        blockType: cleanText(block.blockType, 80),
        content: cleanText(block.content, 2400),
        resourceIDs: (block.resourceIds || []).join(", "),
        questionData: block.blockType === "knowledgeCheck" ? cleanText(block.content, 2400) : "",
        videoUrl: "",
        audioUrl: "",
        imageUrl: "",
        createdDate: new Date()
      },
      { suppressAuth: true }
    );
  }
}

async function updatePathwayHeader(pathwayId, teacherId, pathway) {
  const item = await wixData.get(COLLECTIONS.pathways, pathwayId, { suppressAuth: true });
  if (!item || String(item.teacherMemberId || item.ownerMemberId || "") !== teacherId) {
    throw new Error("ILEARN_PATHWAY_ACCESS_DENIED");
  }
  await wixData.update(
    COLLECTIONS.pathways,
    {
      ...item,
      title: cleanText(pathway.title, 250),
      learningAim: cleanText(pathway.learningAim, 800),
      estimatedMinutes: clampNumber(pathway.estimatedMinutes, 5, 60, item.estimatedMinutes || 15)
    },
    { suppressAuth: true }
  );
}

async function setPathwayStatus(pathwayId, memberId, status, extra = {}) {
  const item = await wixData.get(COLLECTIONS.pathways, pathwayId, { suppressAuth: true });
  if (!item || String(item.teacherMemberId || item.ownerMemberId || "") !== memberId) {
    throw new Error("ILEARN_PATHWAY_ACCESS_DENIED");
  }
  await wixData.update(
    COLLECTIONS.pathways,
    { ...item, status, ...extra },
    { suppressAuth: true }
  );
}

async function updateApprovalAndRun({ run, approval, decision, notes, requestedChanges, runStatus, approvalStatus, approvedOutput = {} }) {
  const decidedIso = new Date().toISOString();
  await Promise.all([
    wixData.update(
      COLLECTIONS.approvals,
      {
        ...approval,
        status: approvalStatus,
        decision,
        notes,
        requestedChanges,
        approvedOutput,
        decidedIso
      },
      { suppressAuth: true }
    ),
    saveRun({
      ...run,
      status: runStatus,
      approvalStatus,
      outputs: run.outputs || {},
      quality: run.quality || {},
      approvalRequired: true
    })
  ]);
}

async function saveRun(item) {
  return wixData.save(COLLECTIONS.runs, item, { suppressAuth: true });
}

async function requireOwnedRun(runIdValue, memberId) {
  const runId = cleanId(runIdValue, 120);
  if (!runId) throw new Error("ILEARN_RUN_ID_REQUIRED");
  const run = await wixData.get(COLLECTIONS.runs, runId, { suppressAuth: true });
  if (!run || String(run.teacherId || "") !== memberId) {
    throw new Error("ILEARN_RUN_ACCESS_DENIED");
  }
  return run;
}

function publicRun(run) {
  return {
    runId: run.runId,
    status: run.status,
    subject: run.subject,
    programme: run.programme,
    yearGroup: run.yearGroup,
    request: run.request,
    agents: run.agents,
    outputs: run.outputs,
    quality: run.quality,
    approvalRequired: run.approvalRequired,
    approvalStatus: run.approvalStatus,
    createdDate: run._createdDate,
    updatedDate: run._updatedDate
  };
}

function prepareRequest(details = {}) {
  return {
    subject: cleanText(details.subject, 120) || "English",
    programme: cleanText(details.programme, 160),
    yearGroup: cleanText(details.yearGroup, 100),
    level: cleanText(details.level, 100),
    topic: cleanText(details.topic, 250),
    learningAim: cleanText(details.learningAim, 800),
    objectives: cleanText(details.objectives, 1400),
    outcomes: Array.isArray(details.outcomes) ? details.outcomes.slice(0, MAX_OUTCOMES) : [],
    formats: Array.isArray(details.formats)
      ? details.formats.map((x) => cleanText(x, 100)).filter(Boolean).slice(0, 12)
      : [],
    resources: Array.isArray(details.resources) ? details.resources.slice(0, MAX_RESOURCES) : [],
    learnerId: cleanId(details.learnerId, 120),
    interactiveOrImmersive: Boolean(details.interactiveOrImmersive),
    deviceBudget: cleanText(details.deviceBudget, 120)
  };
}

function validateRequest(request) {
  if (!request.programme) throw new Error("ILEARN_PROGRAMME_REQUIRED");
  if (!request.subject) throw new Error("ILEARN_SUBJECT_REQUIRED");
  if (!request.learningAim) throw new Error("ILEARN_LEARNING_AIM_REQUIRED");
  if (!request.objectives) throw new Error("ILEARN_OBJECTIVES_REQUIRED");
  if (!request.outcomes.length) throw new Error("ILEARN_CURRICULUM_OUTCOME_REQUIRED");
}

function curriculumRecordMatches(record, request) {
  if (record.active !== true) return false;
  if (request.subject && String(record.subject || "").toLowerCase() !== request.subject.toLowerCase()) return false;
  if (!cycleMatches(record.cycle, request.programme)) return false;
  if (request.yearGroup && record.yearGroup && !pipeFieldIncludes(record.yearGroup, request.yearGroup)) return false;
  return true;
}

function resourceMatchesRequest(resource, request) {
  if (resource.active !== true || resource.approved !== true || String(resource.reviewStatus || "") !== "Verified") return false;
  if (request.subject && resource.subject && String(resource.subject).toLowerCase() !== request.subject.toLowerCase()) return false;
  if (!cycleMatches(resource.cycle, request.programme)) return false;
  if (request.yearGroup && resource.yearGroup && !pipeFieldIncludes(resource.yearGroup, request.yearGroup)) return false;
  return true;
}

function cycleMatches(recordCycleValue, programmeValue) {
  const record = String(recordCycleValue || "").toLowerCase();
  const programme = String(programmeValue || "").toLowerCase();
  if (!record || !programme) return true;
  if (programme.includes("junior")) return record.includes("junior");
  if (programme.includes("applied") || programme.includes("lca")) {
    return record.includes("applied") || record.includes("lca") || record.includes("senior");
  }
  if (programme.includes("leaving") || programme.includes("senior")) {
    return record.includes("senior") || record.includes("leaving");
  }
  return true;
}

function pipeFieldIncludes(value, wanted) {
  const target = String(wanted || "").trim().toLowerCase();
  return String(value || "")
    .split("|")
    .map((x) => x.trim().toLowerCase())
    .includes(target);
}

function wantsMotion(request) {
  return request.interactiveOrImmersive || request.formats.some((format) => /interactive|immersive|3d|animation/i.test(format));
}

function buildAgentPlan(request) {
  return [
    "curriculum",
    "resource",
    "pathway",
    "accessibility",
    ...(wantsMotion(request) ? ["motion"] : []),
    "quality",
    "approval"
  ];
}

function buildReliablePathway(details) {
  const outcomeCodes = details.outcomes.map((o) => o.code).join(", ");
  const outcomeSummary = details.outcomes.map((o) => `${o.code}: ${o.description}`).join("\n");
  const resourceIds = details.resources.map((r) => r.resourceId).filter(Boolean);
  const sources = details.resources.length
    ? details.resources.map((r) => `${r.title}${r.sourceUrl ? ` — ${r.sourceUrl}` : ""}`).join("\n")
    : "No external resource was selected. Use the teacher's authorised curriculum materials.";

  return {
    title: buildReliableTitle(details),
    learningAim: details.learningAim,
    estimatedMinutes: 15,
    blocks: [
      { order: 1, blockType: "learningAim", heading: "What you are learning", content: details.learningAim, resourceIds: [] },
      { order: 2, blockType: "priorKnowledge", heading: "What you may already know", content: "What do you already know about this topic? You may answer with words, examples, a drawing or a short voice note.", resourceIds: [] },
      { order: 3, blockType: "explain", heading: "Clear explanation", content: `${details.objectives}\n\nCurriculum focus:\n${outcomeSummary}`, resourceIds },
      { order: 4, blockType: "glossary", heading: "Important words", content: "Identify five important words from this lesson and explain each one in clear language.", resourceIds: [] },
      { order: 5, blockType: "example", heading: "Worked example", content: "Use one authorised class example. Identify a clear choice or feature, explain what it does, and connect it to the learning aim.", resourceIds },
      { order: 6, blockType: "knowledgeCheck", heading: "Quick check", content: `1. What is the learning aim?\nAnswer: ${details.learningAim}\n\n2. Which curriculum outcomes are being practised?\nAnswer: ${outcomeCodes}\n\n3. What evidence will show your understanding?\nAnswer: A clear response supported by the authorised lesson material.`, resourceIds: [] },
      { order: 7, blockType: "reflection", heading: "Your question or opinion", content: "What is one question, idea or opinion you would like to bring to class?", resourceIds: [] },
      { order: 8, blockType: "sourceList", heading: "Sources", content: sources, resourceIds }
    ]
  };
}

function buildReliableTitle(details) {
  return cleanText(`${details.programme}: ${details.learningAim}`, 180);
}

function defaultBlockType(index) {
  return ["learningAim", "priorKnowledge", "explain", "glossary", "example", "knowledgeCheck", "reflection", "sourceList"][index] || "learningBlock";
}

function defaultHeading(index) {
  return ["What you are learning", "What you may already know", "Clear explanation", "Important words", "Worked example", "Quick check", "Your question or opinion", "Sources"][index] || "Learning block";
}

async function getMemberAccess() {
  const member = await currentMember.getMember();
  if (!member?._id) throw new Error("ILEARN_LOGIN_REQUIRED: Sign in to receive 20 free generations.");
  const subscription = await getUnlimitedSubscription();
  const usageRecord = await getUsageRecord(member._id);
  const successfulUses = Math.max(0, Number(usageRecord?.successfulUses) || 0);
  return {
    loggedIn: true,
    memberId: member._id,
    isUnlimited: subscription.isUnlimited,
    planName: subscription.planName,
    successfulUses,
    used: successfulUses,
    remaining: subscription.isUnlimited ? null : Math.max(0, FREE_GENERATION_LIMIT - successfulUses),
    limit: FREE_GENERATION_LIMIT,
    subscriptionRequired: !subscription.isUnlimited && successfulUses >= FREE_GENERATION_LIMIT
  };
}

async function requireMemberId() {
  const member = await currentMember.getMember();
  if (!member?._id) throw new Error("ILEARN_LOGIN_REQUIRED");
  return member._id;
}

function enforceUsage(access) {
  if (!access.isUnlimited && access.successfulUses >= FREE_GENERATION_LIMIT) {
    throw new Error("ILEARN_SUBSCRIPTION_REQUIRED: Your 20 free generations have been used. Choose the monthly or annual plan to continue.");
  }
}

async function getUnlimitedSubscription() {
  try {
    const [memberOrders, publicPlans] = await Promise.all([
      orders.listCurrentMemberOrders(),
      wixPricingPlansBackend.listPublicPlans()
    ]);
    const publicPlanItems = normaliseListResult(publicPlans, ["plans", "items"]);
    const memberOrderItems = normaliseListResult(memberOrders, ["orders", "items"]);
    const planNamesById = new Map(publicPlanItems.map((plan) => [String(plan._id || plan.id || ""), String(plan.name || "")]));
    const activeOrder = memberOrderItems.find((order) => {
      const status = String(order.status || "").toUpperCase();
      const planId = String(order.planId || "");
      const planName = planNamesById.get(planId) || String(order.planName || order.plan?.name || "");
      return ["ACTIVE", "PENDING_CANCELLATION"].includes(status) && UNLIMITED_PLAN_NAMES.has(planName);
    });
    if (!activeOrder) return { isUnlimited: false, planName: "" };
    return {
      isUnlimited: true,
      planName: planNamesById.get(String(activeOrder.planId || "")) || String(activeOrder.planName || activeOrder.plan?.name || "iLearn Unlimited")
    };
  } catch (error) {
    console.warn("Pricing plan check failed.", error);
    return { isUnlimited: false, planName: "" };
  }
}

function normaliseListResult(value, possibleKeys) {
  if (Array.isArray(value)) return value;
  for (const key of possibleKeys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

async function getUsageRecord(memberId) {
  try {
    return await wixData.get(COLLECTIONS.usage, usageRecordId(memberId), { suppressAuth: true });
  } catch (error) {
    return null;
  }
}

async function countSuccessfulGeneration(access, pathwayId) {
  if (access.isUnlimited) return toPublicUsage(access);
  const next = Math.min(FREE_GENERATION_LIMIT, access.successfulUses + 1);
  const existing = await getUsageRecord(access.memberId);
  await wixData.save(
    COLLECTIONS.usage,
    {
      ...(existing || {}),
      _id: usageRecordId(access.memberId),
      title: `iLearn usage — ${access.memberId}`,
      identityKey: access.memberId,
      successfulUses: next,
      identityType: "member",
      memberId: access.memberId,
      lastUsedDate: new Date(),
      lastPathwayId: pathwayId
    },
    { suppressAuth: true }
  );
  return {
    loggedIn: true,
    isUnlimited: false,
    planName: "",
    successfulUses: next,
    used: next,
    remaining: Math.max(0, FREE_GENERATION_LIMIT - next),
    limit: FREE_GENERATION_LIMIT,
    subscriptionRequired: next >= FREE_GENERATION_LIMIT
  };
}

function toPublicUsage(access) {
  return {
    loggedIn: true,
    isUnlimited: access.isUnlimited,
    planName: access.planName,
    successfulUses: access.successfulUses,
    used: access.successfulUses,
    remaining: access.remaining,
    limit: access.limit,
    subscriptionRequired: access.subscriptionRequired
  };
}

function usageRecordId(memberId) {
  return `member_${cleanId(memberId, 100)}`;
}

function publicOutcome(item) {
  return {
    outcomeId: item.outcomeId || item._id,
    outcomeCode: item.outcomeCode,
    title: item.title,
    officialOutcomeText: item.officialOutcomeText,
    officialSourceUrl: item.officialSourceUrl,
    cycle: item.cycle,
    yearGroup: item.yearGroup,
    level: item.level
  };
}

function publicResource(item) {
  return {
    resourceId: item.resourceId,
    title: item.title,
    description: item.description,
    sourceUrl: item.sourceUrl,
    sourceOrganisation: item.sourceOrganisation,
    resourceType: item.resourceType,
    mediaType: item.mediaType,
    accessibilityFeatures: item.accessibilityFeatures,
    licence: item.licence,
    examRelevance: item.examRelevance,
    matchStrength: item.matchStrength
  };
}

function runWithTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`AI request exceeded ${timeoutMs}ms.`)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function createRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createBlockId(pathwayId, order) {
  return cleanId(`${pathwayId}_b${String(order).padStart(2, "0")}`, 120);
}

function cleanId(value, max = 120) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, max);
}

function cleanText(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanUrl(value) {
  const url = cleanText(value, 1000);
  return url.startsWith("https://") || url.startsWith("http://") ? url : "";
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}
