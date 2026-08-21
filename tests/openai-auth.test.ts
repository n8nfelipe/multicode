import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getOpenAIAuthStatus, loginWithOpenAI } from "../lib/openai-auth";

let directory: string;
let command: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "multicode-auth-"));
  command = path.join(directory, "opencode.sh");
  fs.writeFileSync(command, "#!/bin/sh\ncase \"$1 $2\" in\n  'auth list') printf '%s\\n' \"$FAKE_AUTH_LIST\"; exit \"${FAKE_AUTH_LIST_EXIT:-0}\" ;;\n  'auth login') printf '%s\\n' \"$FAKE_AUTH_LOGIN\"; exit \"${FAKE_AUTH_LOGIN_EXIT:-0}\" ;;\n  *) exit 0 ;;\nesac\n");
  fs.chmodSync(command, 0o755);
  vi.stubEnv("OPENCODE_BIN", command);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("getOpenAIAuthStatus", () => {
  it("detects an OAuth entry after removing terminal colors", async () => {
    vi.stubEnv("FAKE_AUTH_LIST", `${String.fromCharCode(27)}[32mOpenAI OAuth${String.fromCharCode(27)}[0m`);

    await expect(getOpenAIAuthStatus()).resolves.toEqual({ provider: "openai", authenticated: true, available: true });
  });

  it("reports an available CLI without an authenticated OpenAI entry", async () => {
    vi.stubEnv("FAKE_AUTH_LIST", "Anthropic api-key");

    await expect(getOpenAIAuthStatus()).resolves.toEqual({ provider: "openai", authenticated: false, available: true });
  });

  it("reports command failures and missing binaries", async () => {
    vi.stubEnv("FAKE_AUTH_LIST_EXIT", "2");
    vi.stubEnv("FAKE_AUTH_LIST", "failed");
    await expect(getOpenAIAuthStatus()).resolves.toMatchObject({ available: false, authenticated: false });

    vi.stubEnv("OPENCODE_BIN", path.join(directory, "missing"));
    await expect(getOpenAIAuthStatus()).resolves.toMatchObject({ available: false, message: expect.stringContaining("Comando") });
  });
});

describe("loginWithOpenAI", () => {
  it("logs in and verifies the resulting OAuth entry", async () => {
    vi.stubEnv("FAKE_AUTH_LOGIN", "browser opened");
    vi.stubEnv("FAKE_AUTH_LIST", "OpenAI OAuth");

    await expect(loginWithOpenAI()).resolves.toMatchObject({ authenticated: true, available: true });
  });

  it("rejects a failed login and an unverified login", async () => {
    vi.stubEnv("FAKE_AUTH_LOGIN_EXIT", "1");
    vi.stubEnv("FAKE_AUTH_LOGIN", "login failed");
    await expect(loginWithOpenAI()).rejects.toThrow();

    vi.stubEnv("FAKE_AUTH_LOGIN_EXIT", "0");
    vi.stubEnv("FAKE_AUTH_LIST", "No credentials");
    await expect(loginWithOpenAI()).rejects.toThrow();
  });
});
