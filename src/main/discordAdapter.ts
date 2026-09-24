/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Patrosi73 and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChildProcess, spawn } from "child_process";
import { UtilityProcess, utilityProcess } from "electron";
import { existsSync } from "fs";
import { request } from "https";
import { join } from "path";
import {
    DEFAULT_FLUXER_ENDPOINTS,
    discoverFluxerInstance,
    type FluxerEndpoints,
    resolveInstanceOrigin
} from "shared/fluxerInstance";

import { DATA_DIR } from "./constants";
import { Settings } from "./settings";

const ADAPTER_BUNDLE_ENTRY = join(__dirname, "discordAdapter.js");
const ADAPTER_STUFF_DIR = join(__dirname, "..", "..", "discord-adapter-meme", "stuff");
const ADAPTER_CWD_CANDIDATES = [
    join(process.cwd(), "discord-adapter-meme"),
    join(__dirname, "..", "..", "discord-adapter-meme")
];
const ADAPTER_PORT = 3666;
const START_TIMEOUT = 30_000;
const ADAPTER_IPC_EVENT = "adapter:event";
const ADAPTER_EVENT_INVALID_TOKEN = "fluxer-invalid-token";
const ADAPTER_EVENT_READY = "adapter-ready";

type AdapterProcess = ChildProcess | UtilityProcess;
type AdapterInvalidTokenHandler = () => void;
type AdapterIpcMessage = {
    type?: string;
    event?: string;
};
type EnvValue = string | undefined;

let adapterProcess: AdapterProcess | undefined;
let startPromise: Promise<void> | undefined;
const invalidTokenHandlers = new Set<AdapterInvalidTokenHandler>();

type AdapterStatusHandler = (message: string) => void;

function emitAdapterInvalidToken() {
    for (const handler of invalidTokenHandlers) {
        try {
            handler();
        } catch (error) {
            console.error("[DiscordAdapter] Failed to handle invalid token event:", error);
        }
    }
}

export function onDiscordAdapterInvalidToken(handler: AdapterInvalidTokenHandler) {
    invalidTokenHandlers.add(handler);
    return () => invalidTokenHandlers.delete(handler);
}

const events = (processRef: AdapterProcess) => processRef as NodeJS.EventEmitter;

function attachAdapterMessageBridge(processRef: AdapterProcess, onReady: () => void) {
    events(processRef).on("message", (message: AdapterIpcMessage) => {
        if (message?.type !== ADAPTER_IPC_EVENT) return;
        if (message.event === ADAPTER_EVENT_INVALID_TOKEN) emitAdapterInvalidToken();
        if (message.event === ADAPTER_EVENT_READY) onReady();
    });
}

function resolveAdapterCwd() {
    return ADAPTER_CWD_CANDIDATES.find(path => existsSync(join(path, "src", "index.ts"))) ?? process.cwd();
}

function sanitizeEnv(env: Record<string, EnvValue>) {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string") {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

function pingAdapter() {
    return new Promise<boolean>(resolve => {
        const req = request(
            {
                host: "localhost",
                port: ADAPTER_PORT,
                path: "/",
                method: "GET",
                rejectUnauthorized: false
            },
            res => {
                res.resume();
                resolve(true);
            }
        );

        req.on("error", () => resolve(false));
        req.end();
    });
}

function waitForProcessExit(processRef: AdapterProcess) {
    return new Promise<void>(resolve => events(processRef).once("exit", () => resolve()));
}

function attachAndWaitForReady(processRef: AdapterProcess, timeoutMs: number) {
    return new Promise<boolean>(resolve => {
        const finish = (ok: boolean) => {
            clearTimeout(timer);
            resolve(ok);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);

        attachAdapterMessageBridge(processRef, () => finish(true));
        events(processRef).once("exit", () => finish(false));
    });
}

function listenToAdapterLogs(onStatus?: AdapterStatusHandler) {
    if (!adapterProcess) return;

    const handleLine = (rawLine: string, isError = false) => {
        const line = rawLine.trim();
        if (!line) return;

        const log = isError ? console.error : console.log;
        log("[DiscordAdapter]", line);

        if (line.includes("Initializing ClientLoader")) onStatus?.("Starting backend: preparing client...");
        else if (line.includes("Fetching Discord app HTML"))
            onStatus?.("Starting backend: downloading Discord client HTML...");
        else if (line.includes("Failed to fetch Discord app HTML")) onStatus?.("Backend: using local HTML fallback...");
        else if (line.includes("Loading SSL certificates")) onStatus?.("Starting backend: loading certificates...");
        else if (line.includes("Adapter server running")) onStatus?.("Backend HTTP server is online.");
        else if (line.includes("Gateway")) onStatus?.("Starting backend: initializing gateway...");
    };

    const consume = (chunk: Buffer, isError = false) => {
        for (const line of chunk.toString().split(/\r?\n/g)) {
            handleLine(line, isError);
        }
    };

    const stdout = adapterProcess.stdout as NodeJS.ReadableStream | null | undefined;
    const stderr = adapterProcess.stderr as NodeJS.ReadableStream | null | undefined;

    stdout?.on("data", (chunk: Buffer | string) => consume(Buffer.from(chunk)));
    stderr?.on("data", (chunk: Buffer | string) => consume(Buffer.from(chunk), true));
}

async function syncFluxerEndpointsFromDiscovery(onStatus?: AdapterStatusHandler): Promise<FluxerEndpoints> {
    const cached = Settings.store.fluxerEndpoints ?? DEFAULT_FLUXER_ENDPOINTS;
    const kind = Settings.store.fluxerInstance ?? "canary";

    try {
        const origin = resolveInstanceOrigin(kind, Settings.store.fluxerCustomDomain);

        onStatus?.(`Syncing Fluxer endpoints from ${origin}...`);
        const { endpoints } = await discoverFluxerInstance(origin);
        Settings.store.fluxerEndpoints = endpoints;
        console.log(`[DiscordAdapter] Synced Fluxer endpoints from ${origin}`);
        return endpoints;
    } catch (error) {
        console.warn("[DiscordAdapter] Failed to sync Fluxer discovery; using cached endpoints.", error);
        onStatus?.("Using cached Fluxer endpoints (discovery sync failed).");
        return cached;
    }
}

export async function startDiscordAdapter(onStatus?: AdapterStatusHandler) {
    if (startPromise) return startPromise;

    startPromise = (async () => {
        if (await pingAdapter()) {
            onStatus?.("Backend is already running.");
            return;
        }

        const fluxerEndpoints = await syncFluxerEndpointsFromDiscovery(onStatus);
        const releaseChannel = Settings.store.fluxerInstance === "canary" ? "canary" : "stable";

        onStatus?.("Starting backend adapter...");
        let child: AdapterProcess;
        const adapterEnv = sanitizeEnv({
            ...process.env,
            PORT: String(ADAPTER_PORT),
            VENCORD_USER_DATA_DIR: DATA_DIR,
            ADAPTER_STUFF_DIR: existsSync(ADAPTER_STUFF_DIR) ? ADAPTER_STUFF_DIR : undefined,
            FLUXER_RELEASE_CHANNEL: releaseChannel,
            FLUXER_ENDPOINTS: JSON.stringify(fluxerEndpoints)
        });

        if (existsSync(ADAPTER_BUNDLE_ENTRY)) {
            child = utilityProcess.fork(ADAPTER_BUNDLE_ENTRY, [], {
                cwd: DATA_DIR,
                env: adapterEnv,
                stdio: "pipe"
            });
        } else {
            const adapterCwd = resolveAdapterCwd();
            const adapterEntry = join(adapterCwd, "src", "index.ts");
            if (!existsSync(adapterEntry)) {
                throw new Error(
                    `Discord adapter entry missing at ${adapterEntry} (and bundle missing at ${ADAPTER_BUNDLE_ENTRY})`
                );
            }

            child = spawn(process.execPath, ["--experimental-strip-types", adapterEntry], {
                cwd: adapterCwd,
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe", "ipc"],
                env: {
                    ...adapterEnv,
                    ELECTRON_RUN_AS_NODE: "1"
                }
            });
        }

        adapterProcess = child;

        listenToAdapterLogs(onStatus);

        events(child).once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
            adapterProcess = undefined;
            if (signal || code) {
                console.error(`[DiscordAdapter] exited unexpectedly (code=${code}, signal=${signal})`);
            }
        });

        const isReady = await attachAndWaitForReady(child, START_TIMEOUT);
        if (!isReady) {
            throw new Error("Discord adapter did not become ready in time");
        }

        onStatus?.("Backend started.");
    })().finally(() => {
        startPromise = undefined;
    });

    return startPromise;
}

export async function stopDiscordAdapter() {
    if (!adapterProcess) return;

    const child = adapterProcess;
    adapterProcess = undefined;
    const exitPromise = waitForProcessExit(child);

    try {
        child.kill();
    } catch (error) {
        console.warn("[DiscordAdapter] Failed to stop adapter process cleanly:", error);
        return;
    }

    await exitPromise;
}

export async function restartDiscordAdapter(onStatus?: AdapterStatusHandler) {
    await stopDiscordAdapter();
    await startDiscordAdapter(onStatus);
}
