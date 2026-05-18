const { spawn } = require('node:child_process');
const { existsSync, promises: fs } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const CODEX_TIMEOUT_MS = 45_000;
const CODEX_MODEL = 'gpt-5.3-codex-spark';
const CODEX_REASONING_EFFORT = 'high';
const MAX_TOTAL_PATCH_CHARS = 160_000;
const MAX_SECTION_PATCH_CHARS = 4_000;

const walkthroughSchema = {
  additionalProperties: false,
  properties: {
    groups: {
      items: {
        additionalProperties: false,
        properties: {
          files: {
            items: {
              additionalProperties: false,
              properties: {
                action: { enum: ['review', 'scan', 'skim'], type: 'string' },
                context: { type: 'string' },
                impact: { enum: ['wide', 'contained', 'mechanical'], type: 'string' },
                path: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['path', 'reason', 'context', 'action', 'impact'],
              type: 'object',
            },
            type: 'array',
          },
          reason: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['title', 'reason', 'files'],
        type: 'object',
      },
      type: 'array',
    },
    summary: {
      additionalProperties: false,
      properties: {
        focus: { type: 'string' },
        skim: { type: 'string' },
      },
      required: ['focus', 'skim'],
      type: 'object',
    },
    version: { const: 1, type: 'number' },
  },
  required: ['version', 'summary', 'groups'],
  type: 'object',
};

const getCodexCommand = () => {
  if (process.env.CODIFF_CODEX_PATH) {
    return process.env.CODIFF_CODEX_PATH;
  }

  for (const path of ['/opt/homebrew/bin/codex', '/usr/local/bin/codex']) {
    if (existsSync(path)) {
      return path;
    }
  }

  return 'codex';
};

const oneLine = (value, fallback = '') =>
  (typeof value === 'string' ? value : fallback).replace(/\s+/g, ' ').trim();

const truncate = (value, maxLength) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[truncated]`;
};

const cleanText = (value, fallback = '') =>
  oneLine(value, fallback).replace(/\s*\.{3}\[truncated]$/i, '');

const normalizeEnum = (value, allowed, fallback) => (allowed.has(value) ? value : fallback);

const buildPatchExcerpt = (section, remainingBudget) => {
  const summary = section.summary?.reason ? `Summary: ${section.summary.reason}\n` : '';
  const patch = section.patch || '';
  const maxLength = Math.max(
    0,
    Math.min(MAX_SECTION_PATCH_CHARS, remainingBudget - summary.length),
  );

  if (maxLength === 0) {
    return summary || '[patch omitted: budget exhausted]';
  }

  return `${summary}${truncate(patch, maxLength)}`;
};

const buildPromptInput = (state) => {
  let remainingPatchBudget = MAX_TOTAL_PATCH_CHARS;

  return {
    files: state.files.map((file) => ({
      oldPath: file.oldPath,
      path: file.path,
      sections: file.sections.map((section) => {
        const patchExcerpt = buildPatchExcerpt(section, remainingPatchBudget);
        remainingPatchBudget = Math.max(0, remainingPatchBudget - patchExcerpt.length);

        return {
          binary: section.binary,
          kind: section.kind,
          loadState: section.loadState,
          patchExcerpt,
          summary: section.summary?.reason,
        };
      }),
      status: file.status,
    })),
    generatedAt: state.generatedAt,
    root: state.root,
    source: state.source,
  };
};

const buildPrompt = (state) => `You are helping Codiff order a code review.

Return a high-leverage review walkthrough order, not review findings.
Do not inspect the repository or run shell commands; use only the digest below.
Your job is to help a human reviewer spend attention where architectural judgment matters and avoid blocking work on low-value changes.
Use every provided path exactly once.
Order files from highest review leverage to lowest.
High leverage: architecture boundaries, public APIs, exported types, schemas, IPC, routing, persistence, auth/security, shared state, cross-cutting utilities, build/runtime behavior, files likely to affect multiple call sites, and tests that define important behavior or show how a new API is meant to be used.
Medium leverage: feature implementation, contained behavior changes, local tests that clarify intent, and relevant config.
Low leverage: leaf UI details, isolated tests/fixtures, docs, generated files, snapshots, lockfiles, formatting-only or mechanical churn.
Rank by reviewability, not file type. A test may come before implementation when it is the clearest behavioral contract, usage example, or entry point for understanding the change. Do not always put tests first or last.
Group files by review strategy, not by directory.
Use group titles that tell the reviewer how to spend attention, such as "Review carefully", "Trace the data flow", "Verify behavior with tests", "Scan contained changes", or "Low value / skim".
Avoid generic group titles like "Frontend files", "Tests", "Miscellaneous", or "Other changed files".
For each file:
- reason: why this file is in this position, max 140 characters.
- context: what the reviewer should pay attention to, max 180 characters.
- action: "review", "scan", or "skim".
- impact: "wide", "contained", or "mechanical".
Set impact to "wide" only when the file appears to affect multiple features, contracts, boundaries, shared behavior, review order, or a test that explains a shared contract. Use it sparingly; if uncertain, choose "contained".
Set impact to "contained" when the change appears limited to one feature, leaf component, local behavior, or focused test.
Set impact to "mechanical" when the reviewer likely should skim unless they own that area.
Do not mark every file "wide"; a useful walkthrough separates broad blast-radius files from contained or mechanical files.
The summary must be exactly two short sentences split into focus and skim: focus says where review matters most, skim says what can be skimmed.
Do not invent bugs.
Do not produce review comments.
Do not say "looks good".
Do not nitpick syntax, naming, style, formatting, or local cleanup unless it affects review leverage.
Do not mention files that were not provided.
Return JSON only.

Repository change digest:
${JSON.stringify(buildPromptInput(state), null, 2)}
`;

const parseJSONMessage = (message) => {
  try {
    return JSON.parse(message);
  } catch {
    const match = message.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Codex did not return JSON.');
    }

    return JSON.parse(match[0]);
  }
};

const normalizeWalkthrough = (input, files) => {
  const pathSet = new Set(files.map((file) => file.path));
  const seen = new Set();
  const groups = [];
  const actions = new Set(['review', 'scan', 'skim']);
  const impacts = new Set(['wide', 'contained', 'mechanical']);

  for (const group of Array.isArray(input?.groups) ? input.groups : []) {
    const nextFiles = [];

    for (const file of Array.isArray(group?.files) ? group.files : []) {
      const path = oneLine(file?.path);
      if (!pathSet.has(path) || seen.has(path)) {
        continue;
      }

      seen.add(path);
      nextFiles.push({
        action: normalizeEnum(file?.action, actions, 'scan'),
        context: cleanText(file?.context, 'Check the review-relevant context for this file.'),
        impact: normalizeEnum(file?.impact, impacts, 'contained'),
        path,
        reason: cleanText(file?.reason, 'Review this file in this part of the change.'),
      });
    }

    if (nextFiles.length > 0) {
      groups.push({
        files: nextFiles,
        reason: cleanText(group?.reason, 'These files are related.'),
        title: cleanText(group?.title, 'Walkthrough'),
      });
    }
  }

  const missingFiles = files
    .filter((file) => !seen.has(file.path))
    .map((file) => ({
      action: 'scan',
      context: 'Codex did not place this file; scan it after the ranked walkthrough.',
      impact: 'contained',
      path: file.path,
      reason: 'Review after the primary walkthrough; Codex did not place this file.',
    }));

  if (missingFiles.length > 0) {
    groups.push({
      files: missingFiles,
      reason: 'Files not included in the Codex walkthrough response.',
      title: 'Other changed files',
    });
  }

  if (groups.length === 0 && files.length > 0) {
    throw new Error('Codex did not return any changed files.');
  }

  return {
    groups,
    summary: {
      focus: cleanText(input?.summary?.focus, 'Review the highest-leverage files first.'),
      skim: cleanText(
        input?.summary?.skim,
        'Skim low-value or mechanical files after core review.',
      ),
    },
    version: 1,
  };
};

const runCodex = async (repoRoot, prompt) => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'codiff-walkthrough-'));
  const outputPath = join(directory, 'walkthrough.json');
  const schemaPath = join(directory, 'schema.json');
  await fs.writeFile(schemaPath, JSON.stringify(walkthroughSchema), 'utf8');

  return await new Promise((resolve, reject) => {
    let stderr = '';
    let stdinError = null;
    let stdout = '';
    let finished = false;

    const child = spawn(
      getCodexCommand(),
      [
        'exec',
        '-m',
        CODEX_MODEL,
        '-c',
        `model_reasoning_effort="${CODEX_REASONING_EFFORT}"`,
        '--cd',
        repoRoot,
        '--sandbox',
        'read-only',
        '--ephemeral',
        '--ignore-rules',
        '--color',
        'never',
        '--output-schema',
        schemaPath,
        '--output-last-message',
        outputPath,
        '-',
      ],
      {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        child.kill('SIGTERM');
        reject(new Error('Codex walkthrough timed out.'));
      }
    }, CODEX_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdin.on('error', (error) => {
      stdinError = error;
    });
    child.on('error', (error) => {
      finished = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', async (code) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(
          new Error(
            oneLine(stderr || stdout || stdinError?.message, `Codex exited with code ${code}.`),
          ),
        );
        return;
      }

      try {
        const message = await fs.readFile(outputPath, 'utf8');
        resolve(message);
      } catch {
        resolve(stdout);
      }
    });

    child.stdin.end(prompt, () => {});
  }).finally(() => fs.rm(directory, { force: true, recursive: true }).catch(() => {}));
};

const readWalkthrough = async (state) => {
  if (state.files.length === 0) {
    return {
      status: 'ready',
      walkthrough: {
        groups: [],
        summary: {
          focus: 'No changed files.',
          skim: 'Nothing to skim.',
        },
        version: 1,
      },
    };
  }

  try {
    const response = await runCodex(state.root, buildPrompt(state));
    const parsed = parseJSONMessage(response);

    return {
      status: 'ready',
      walkthrough: normalizeWalkthrough(parsed, state.files),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        reason:
          'Codex is not installed locally. Install and use Codex, then try Walkthrough again.',
        status: 'unavailable',
      };
    }

    return {
      reason: error instanceof Error ? error.message : String(error),
      status: 'unavailable',
    };
  }
};

module.exports = {
  buildPrompt,
  normalizeWalkthrough,
  readWalkthrough,
  walkthroughSchema,
};
