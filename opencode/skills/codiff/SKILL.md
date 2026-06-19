---
name: codiff
description: Author a narrative Codiff walkthrough JSON, then open it in Codiff or upload it and return a share URL. Use when the user writes "$codiff" or "/codiff", "$codiff share", "show me codiff", "open Codiff", "share a Codiff walkthrough", "generate a walkthrough link", or asks to review the current change as a guided narrative.
metadata:
  short-description: Generate, open, or share a Codiff walkthrough
---

# Codiff

Author a **narrative walkthrough** of the current change as a JSON document. Then either open
it in the Codiff desktop app or upload it and return an immutable web URL.

You write the JSON yourself because you already hold the conversation that produced the
change. Codiff owns the format and authoring guidance, so this skill only handles the handoff.

## Choose The Mode

- Use **share mode** when the request includes `share`, `upload`, `link`, `URL`, `web`, or
  browser wording, including `$codiff share`.
- Use **desktop mode** for plain `$codiff`, `/codiff`, "open Codiff", or "show me Codiff".
- In share mode, only pass `--open` when the user explicitly asks to open the resulting
  walkthrough in a browser. Otherwise return the URL without opening it.

## Workflow

1. **Get the current guidance from Codiff.** It explains the data model and prints the JSON
   schema:

   ```bash
   node scripts/open-codiff.mjs --guide
   ```

2. **Pick the change.** Default to the staged diff (`git diff --staged`). If the user named a
   target such as a commit, `HEAD`, a PR/MR, a range, or a path, use that. If nothing is
   staged, fall back to the working tree (`git diff`) and say so.

3. **Author the JSON** per the guide and write it to a unique temporary file outside the
   repository, such as `$TMPDIR/codiff-walkthrough-<id>.json`.

4. **Complete the selected handoff.**

   Desktop mode:

   ```bash
   node scripts/open-codiff.mjs --file /tmp/codiff-walkthrough-<id>.json /path/to/repository
   ```

   Share mode:

   ```bash
   node scripts/open-codiff.mjs --share --file /tmp/codiff-walkthrough-<id>.json /path/to/repository
   ```

   Share and open in the default browser:

   ```bash
   node scripts/open-codiff.mjs --share --open --file /tmp/codiff-walkthrough-<id>.json /path/to/repository
   ```

   Forward an explicit target after the flags:

   ```bash
   node scripts/open-codiff.mjs --share --file /tmp/codiff-walkthrough-<id>.json HEAD /path/to/repository
   node scripts/open-codiff.mjs --share --file /tmp/codiff-walkthrough-<id>.json mr 123 /path/to/repository
   ```

   The share command prints the final walkthrough URL to stdout. When the cached Cloudflare
   Access token is missing or unusable, Codiff automatically opens the system browser for
   authentication and resumes after sign-in. This authentication browser is independent of
   `--open`, which only controls whether the completed walkthrough is opened.

   **Agent integration:** Desktop launches link the most recent OpenCode session for the current
   project and run Codiff with the OpenCode backend. The launcher's `--share` path retains OpenCode
   as the authoring agent without attaching the conversation transcript. Codiff's managed
   `/codiff` command can use the OpenCode model selected in Codiff; direct `$codiff` skill mentions
   continue with the current session model.

   Codiff validates and repairs the document against the live diff, so anchors that drift
   are pinned to a real section rather than dropped.

Emit JSON only into the temporary file. In desktop mode, do not summarize the conversation
back to the user. In share mode, respond with the URL printed by the command.
