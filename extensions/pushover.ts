import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const EXT_NAME = "pushover";
const PUSHOVER_API = "https://api.pushover.net/1/messages.json";
const DEFAULT_ENV_FILE = `${process.env.HOME}/.config/pi-notifications/pushover.env`;

export type Config = {
	enabled: boolean;
	token?: string;
	user?: string;
	title: string;
	message?: string;
	minSeconds: number;
	priority?: string;
	device?: string;
	sound?: string;
	url?: string;
	urlTitle?: string;
};

export function parseEnvFile(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	const env: Record<string, string> = {};
	const text = readFileSync(path, "utf8");
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		let value = match[2].trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		env[match[1]] = value;
	}
	return env;
}

function readSetting(env: Record<string, string>, key: string): string | undefined {
	return process.env[key] ?? env[key];
}

function boolSetting(value: string | undefined, defaultValue: boolean): boolean {
	if (value == null || value === "") return defaultValue;
	return !/^(0|false|no|off)$/i.test(value);
}

function numberSetting(value: string | undefined, defaultValue: number): number {
	if (value == null || value === "") return defaultValue;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function loadConfig(): Config {
	const envFile = process.env.PI_PUSHOVER_ENV_FILE ?? DEFAULT_ENV_FILE;
	const fileEnv = parseEnvFile(envFile);
	return {
		enabled: boolSetting(readSetting(fileEnv, "PI_PUSHOVER_ENABLED"), true),
		token: readSetting(fileEnv, "PUSHOVER_TOKEN"),
		user: readSetting(fileEnv, "PUSHOVER_USER"),
		title: readSetting(fileEnv, "PI_PUSHOVER_TITLE") ?? "Pi",
		message: readSetting(fileEnv, "PI_PUSHOVER_MESSAGE"),
		minSeconds: numberSetting(readSetting(fileEnv, "PI_PUSHOVER_MIN_SECONDS"), 0),
		priority: readSetting(fileEnv, "PI_PUSHOVER_PRIORITY"),
		device: readSetting(fileEnv, "PI_PUSHOVER_DEVICE"),
		sound: readSetting(fileEnv, "PI_PUSHOVER_SOUND"),
		url: readSetting(fileEnv, "PI_PUSHOVER_URL"),
		urlTitle: readSetting(fileEnv, "PI_PUSHOVER_URL_TITLE"),
	};
}

export function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;
	if (minutes < 60) return `${minutes}m ${rest}s`;
	const hours = Math.floor(minutes / 60);
	const minRest = minutes % 60;
	return `${hours}h ${minRest}m`;
}

export async function sendPushover(config: Config, message: string, signal?: AbortSignal): Promise<void> {
	if (!config.enabled) return;
	if (!config.token || !config.user) {
		throw new Error(`Pushover is missing PUSHOVER_TOKEN or PUSHOVER_USER. Configure ${DEFAULT_ENV_FILE} or environment variables.`);
	}

	const body = new URLSearchParams({
		token: config.token,
		user: config.user,
		title: config.title,
		message,
	});
	if (config.priority) body.set("priority", config.priority);
	if (config.device) body.set("device", config.device);
	if (config.sound) body.set("sound", config.sound);
	if (config.url) body.set("url", config.url);
	if (config.urlTitle) body.set("url_title", config.urlTitle);

	const response = await fetch(PUSHOVER_API, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body,
		signal,
	});

	if (!response.ok) {
		let detail = "";
		try {
			detail = await response.text();
		} catch {
			// ignore
		}
		throw new Error(`Pushover request failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
	}
}

export default function (pi: ExtensionAPI) {
	let startedAt = 0;

	pi.on("session_start", async (_event, ctx) => {
		const config = loadConfig();
		if (!config.enabled) {
			ctx.ui.setStatus(EXT_NAME, undefined);
			return;
		}
		if (config.token && config.user) {
			ctx.ui.setStatus(EXT_NAME, ctx.ui.theme.fg("dim", "pushover on"));
		} else {
			ctx.ui.setStatus(EXT_NAME, ctx.ui.theme.fg("dim", "pushover unconfigured"));
		}
	});

	pi.on("agent_start", async () => {
		startedAt = Date.now();
	});

	pi.on("agent_end", async (_event, ctx) => {
		const config = loadConfig();
		if (!config.enabled) return;
		if (!config.token || !config.user) return;

		const elapsedMs = startedAt ? Date.now() - startedAt : 0;
		const elapsedSeconds = elapsedMs / 1000;
		if (elapsedSeconds < config.minSeconds) return;

		const cwdName = basename(ctx.cwd || process.cwd());
		const sessionName = pi.getSessionName?.();
		const defaultMessage = `Finished in ${formatDuration(elapsedMs)}${sessionName ? ` — ${sessionName}` : ""} (${cwdName})`;
		try {
			await sendPushover(config, config.message ?? defaultMessage, ctx.signal);
		} catch (error) {
			ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
		}
	});

	pi.registerCommand("pushover-test", {
		description: "Send a test Pushover notification using PUSHOVER_TOKEN/PUSHOVER_USER",
		handler: async (args, ctx) => {
			const config = loadConfig();
			const message = args?.trim() || "Pi Pushover test";
			try {
				await sendPushover(config, message, ctx.signal);
				ctx.ui.notify("Pushover test sent", "success");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
