import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inferTurnId, parseLatestTurn } from "../src/transcript.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MiniMax Codex transcript projection", () => {
  it("converts the latest prompt, generation, tool call, and tool result", async () => {
    const root = join(tmpdir(), `langfuse-minimax-${Date.now()}-${Math.random()}`);
    roots.push(root);
    await mkdir(root, { recursive: true });
    const compatible = join(root, "session.compatible.jsonl");
    const codex = join(root, "session.codex.jsonl");
    await writeFile(
      codex,
      [
        { type: "session_meta", timestamp: "2026-01-01T00:00:00.000Z", payload: { id: "s" } },
        {
          type: "response_item",
          timestamp: "2026-01-01T00:00:01.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "fix it" }],
          },
        },
        {
          type: "response_item",
          timestamp: "2026-01-01T00:00:02.000Z",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "I will inspect the file." }],
          },
        },
        {
          type: "response_item",
          timestamp: "2026-01-01T00:00:03.000Z",
          payload: {
            type: "function_call",
            name: "shell",
            call_id: "c1",
            arguments: '{"command":"pwd"}',
          },
        },
        {
          type: "response_item",
          timestamp: "2026-01-01T00:00:04.000Z",
          payload: { type: "function_call_output", call_id: "c1", output: "/tmp" },
        },
        {
          type: "response_item",
          timestamp: "2026-01-01T00:00:05.000Z",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Done." }],
          },
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    await writeFile(compatible, "");

    const parsed = await parseLatestTurn(compatible, {
      turn_id: "t1",
      last_assistant_message: "Done.",
    });
    expect(parsed.userInput).toBe("fix it");
    expect(parsed.finalOutput).toBe("Done.");
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.steps[0]?.toolCalls[0]?.name).toBe("shell");
    expect(parsed.steps[0]?.toolCalls[0]?.output).toBe("/tmp");
    expect(inferTurnId({ turn_id: "t1" }, parsed)).toBe("t1");
  });
});
