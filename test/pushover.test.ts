import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatDuration, loadConfig, parseEnvFile, sendPushover, type Config } from "../extensions/pushover.ts";

const MANAGED_ENV_KEYS = [
	"PI_PUSHOVER_ENV_FILE",
	"PI_PUSHOVER_ENABLED",
	"PUSHOVER_TOKEN",
	"PUSHOVER_USER",
	"PI_PUSHOVER_TITLE",
	"PI_PUSHOVER_MESSAGE",
	"PI_PUSHOVER_MIN_SECONDS",
	"PI_PUSHOVER_PRIORITY",
	"PI_PUSHOVER_DEVICE",
	"PI_PUSHOVER_SOUND",
	"PI_PUSHOVER_URL",
	"PI_PUSHOVER_URL_TITLE",
];

function withCleanEnv(fn: () => void) {
	const previous = new Map<string, string | undefined>();
	for (const key of MANAGED_ENV_KEYS) {
		previous.set(key, process.env[key]);
		delete process.env[key];
	}
	try {
		fn();
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

function baseConfig(overrides: Partial<Config> = {}): Config {
	return {
		enabled: true,
		token: "token",
		user: "user",
		title: "Pi",
		minSeconds: 0,
		...overrides,
	};
}

test("parseEnvFile reads exports, quotes, comments, and blank lines", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-pushover-test-"));
	const envFile = join(dir, "pushover.env");
	writeFileSync(envFile, `
# comment
export PUSHOVER_TOKEN="token value"
PUSHOVER_USER='user value'
PI_PUSHOVER_ENABLED=0
PI_PUSHOVER_MIN_SECONDS=12
IGNORED LINE
`);

	assert.deepEqual(parseEnvFile(envFile), {
		PUSHOVER_TOKEN: "token value",
		PUSHOVER_USER: "user value",
		PI_PUSHOVER_ENABLED: "0",
		PI_PUSHOVER_MIN_SECONDS: "12",
	});
});

test("parseEnvFile returns empty object for missing files", () => {
	assert.deepEqual(parseEnvFile(join(tmpdir(), "definitely-missing-pushover.env")), {});
});

test("loadConfig reads file settings and lets process env override them", () => {
	withCleanEnv(() => {
		const dir = mkdtempSync(join(tmpdir(), "pi-pushover-test-"));
		const envFile = join(dir, "pushover.env");
		writeFileSync(envFile, `
export PUSHOVER_TOKEN="file-token"
export PUSHOVER_USER="file-user"
export PI_PUSHOVER_TITLE="File Title"
export PI_PUSHOVER_MIN_SECONDS=15
export PI_PUSHOVER_ENABLED=false
`);

		process.env.PI_PUSHOVER_ENV_FILE = envFile;
		process.env.PUSHOVER_TOKEN = "env-token";
		process.env.PI_PUSHOVER_ENABLED = "1";

		assert.deepEqual(loadConfig(), {
			enabled: true,
			token: "env-token",
			user: "file-user",
			title: "File Title",
			message: undefined,
			minSeconds: 15,
			priority: undefined,
			device: undefined,
			sound: undefined,
			url: undefined,
			urlTitle: undefined,
		});
	});
});

test("formatDuration formats seconds, minutes, and hours", () => {
	assert.equal(formatDuration(0), "0s");
	assert.equal(formatDuration(10_400), "10s");
	assert.equal(formatDuration(65_000), "1m 5s");
	assert.equal(formatDuration(3_700_000), "1h 1m");
});

test("sendPushover skips fetch when disabled", async () => {
	const previousFetch = globalThis.fetch;
	let called = false;
	globalThis.fetch = (async () => {
		called = true;
		throw new Error("should not fetch");
	}) as typeof fetch;
	try {
		await sendPushover(baseConfig({ enabled: false }), "ignored");
		assert.equal(called, false);
	} finally {
		globalThis.fetch = previousFetch;
	}
});

test("sendPushover requires token and user", async () => {
	await assert.rejects(
		() => sendPushover(baseConfig({ token: undefined }), "hello"),
		/PUSHOVER_TOKEN or PUSHOVER_USER/,
	);
	await assert.rejects(
		() => sendPushover(baseConfig({ user: undefined }), "hello"),
		/PUSHOVER_TOKEN or PUSHOVER_USER/,
	);
});

test("sendPushover posts expected Pushover payload", async () => {
	const previousFetch = globalThis.fetch;
	let captured: { url: string; init: RequestInit } | undefined;
	globalThis.fetch = (async (url, init) => {
		captured = { url: String(url), init: init ?? {} };
		return new Response(JSON.stringify({ status: 1 }), { status: 200 });
	}) as typeof fetch;
	try {
		await sendPushover(
			baseConfig({
				priority: "0",
				device: "iphone",
				sound: "pushover",
				url: "https://example.com",
				urlTitle: "Open",
			}),
			"Pi finished",
		);

		assert.equal(captured?.url, "https://api.pushover.net/1/messages.json");
		assert.equal(captured?.init.method, "POST");
		assert.equal((captured?.init.headers as Record<string, string>)["content-type"], "application/x-www-form-urlencoded");
		const body = captured?.init.body as URLSearchParams;
		assert.equal(body.get("token"), "token");
		assert.equal(body.get("user"), "user");
		assert.equal(body.get("title"), "Pi");
		assert.equal(body.get("message"), "Pi finished");
		assert.equal(body.get("priority"), "0");
		assert.equal(body.get("device"), "iphone");
		assert.equal(body.get("sound"), "pushover");
		assert.equal(body.get("url"), "https://example.com");
		assert.equal(body.get("url_title"), "Open");
	} finally {
		globalThis.fetch = previousFetch;
	}
});

test("sendPushover throws useful error for non-2xx responses", async () => {
	const previousFetch = globalThis.fetch;
	globalThis.fetch = (async () => new Response("bad token", { status: 400 })) as typeof fetch;
	try {
		await assert.rejects(() => sendPushover(baseConfig(), "hello"), /HTTP 400 bad token/);
	} finally {
		globalThis.fetch = previousFetch;
	}
});
