import { buildDiscoveryPrompt, parseDiscoveryOutput } from './discovery.js';
import { ContractError } from './errors.js';
import { extractJson } from './json.js';
import { callModelChain } from './model-chain.js';
import { runWeeklyPipeline } from './pipeline.js';
import { composeWriterPrompt } from './prompt.js';
import { buildDossierPrompt, parseDossierOutput } from './research.js';
import { selectWeeklyTopics } from './selection.js';

function stageInvoker(invoke, stage, candidateId = null) {
  return (args) => invoke({ ...args, stage, candidateId });
}

export async function generateWeeklyEditorialPackage({
  weekKey,
  signals,
  recentTitles = [],
  experienceRegistry,
  usedMetaphors = [],
  prompts,
  modelChains,
  invoke,
  minScore,
  lengthRange,
}) {
  const discoveryPrompt = buildDiscoveryPrompt({ weekKey, signals, recentTitles });
  const discovery = await callModelChain({
    models: modelChains.discovery,
    invoke: stageInvoker(invoke, 'discovery'),
    prompt: discoveryPrompt,
    parse: (text) => parseDiscoveryOutput(extractJson(text), signals),
  });

  const selection = selectWeeklyTopics(discovery.parsed, { minScore });
  if (!selection.ready) {
    throw new ContractError('Discovery did not produce five eligible stream finalists', [
      ...selection.missingStreams,
    ]);
  }

  const candidates = discovery.parsed.map((candidate) => ({ ...candidate }));
  const draftsByCandidateId = {};
  const modelAudit = {
    discovery: { model: discovery.model, failedAttempts: discovery.attempts },
    research: {},
    writer: {},
  };

  for (const selected of selection.selected) {
    const candidateIndex = candidates.findIndex((candidate) => candidate.id === selected.candidate.id);
    const candidate = candidates[candidateIndex];
    const researchPrompt = buildDossierPrompt({ candidate, signals, experienceRegistry });
    const research = await callModelChain({
      models: modelChains.research,
      invoke: stageInvoker(invoke, 'research', candidate.id),
      prompt: researchPrompt,
      parse: (text) => parseDossierOutput(extractJson(text), candidate, experienceRegistry),
    });
    candidate.dossier = research.parsed;
    modelAudit.research[candidate.id] = {
      model: research.model,
      failedAttempts: research.attempts,
    };

    const writerPrompt = composeWriterPrompt({
      masterPrompt: prompts.master,
      universalPrompt: prompts.universal,
      writingOsPrompt: prompts.writingOs,
      candidate,
      dossier: candidate.dossier,
      experienceRegistry,
      experienceIds: candidate.dossier.experienceIds,
    });
    const writer = await callModelChain({
      models: modelChains.writer,
      invoke: stageInvoker(invoke, 'writer', candidate.id),
      prompt: writerPrompt,
      parse: extractJson,
    });
    if (writer.parsed.blocked) {
      throw new ContractError(`Writer blocked: ${candidate.id}`, [writer.parsed.reason ?? 'unknown']);
    }
    draftsByCandidateId[candidate.id] = writer.parsed;
    modelAudit.writer[candidate.id] = {
      model: writer.model,
      failedAttempts: writer.attempts,
    };
  }

  const result = runWeeklyPipeline({
    weekKey,
    candidates,
    draftsByCandidateId,
    experienceRegistry,
    usedMetaphors,
    minScore,
    lengthRange,
  });
  return { ...result, modelAudit };
}
