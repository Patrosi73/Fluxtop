/*

 * Vesktop, a desktop app aiming to give you a snappier Discord Experience

 * Copyright (c) 2026 Vendicated and Vesktop contributors


 * SPDX-License-Identifier: GPL-3.0-or-later

 */


import { ChildProcess, spawn } from "child_process";
import { UtilityProcess, utilityProcess } from "electron";
import { existsSync } from "fs";
import { request } from "https";
import { join } from "path";

import { DATA_DIR } from "./constants";

const ADAPTER_BUNDLE_ENTRY = join(__dirname, "discordAdapter.js");
const ADAPTER_CWD_CANDIDATES = [
    join(process.cwd(), "discord-adapter-meme"),
    join(__dirname, "..", "..", "discord-adapter-meme")
];
const ADAPTER_STUFF_CANDIDATES = [
    join(process.cwd(), "discord-adapter-meme", "stuff"),
    join(__dirname, "..", "..", "discord-adapter-meme", "stuff")
];
const ADAPTER_PORT = 3666;
const START_TIMEOUT = 30_000;
const START_POLL_INTERVAL = 500;
const ADAPTER_IPC_EVENT = "adapter:event";
const ADAPTER_EVENT_INVALID_TOKEN = "fluxer-invalid-token";

type AdapterProcess = ChildProcess | UtilityProcess;
type AdapterInvalidTokenHandler = () => void;
type AdapterIpcMessage = {
    type?: string;
    event?: string;
};

let adapterProcess: AdapterProcess | undefined;
let startPromise: Promise<void> | undefined;
let adapterManagedByVesktop = false;
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

function attachAdapterMessageBridge(processRef: AdapterProcess) {
    const onMessage = (message: AdapterIpcMessage) => {
        if (message?.type !== ADAPTER_IPC_EVENT) return;
        if (message?.event === ADAPTER_EVENT_INVALID_TOKEN) {
            emitAdapterInvalidToken();
        }
    };

    (processRef as any).on?.("message", onMessage);
}

function resolveAdapterCwd() {
    return ADAPTER_CWD_CANDIDATES.find(path => existsSync(join(path, "stuff", "index.html"))) ?? process.cwd();
}

function resolveAdapterStuffDir() {
    return ADAPTER_STUFF_CANDIDATES.find(path => existsSync(join(path, "index.html")));
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

function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function waitForAdapterReady(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (await pingAdapter()) return true;
        await sleep(START_POLL_INTERVAL);
    }

    return false;
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

        if (line.includes("Fluxer closed (4004: Invalid token)")) {
            emitAdapterInvalidToken();
        }
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

export async function startDiscordAdapter(onStatus?: AdapterStatusHandler) {
    if (startPromise) return startPromise;

    startPromise = (async () => {
        if (await pingAdapter()) {
            onStatus?.("Backend is already running.");
            return;
        }

        onStatus?.("Starting backend adapter...");
        let child: AdapterProcess;
        const adapterStuffDir = resolveAdapterStuffDir();
        const adapterEnv = {
            ...process.env,
            PORT: String(ADAPTER_PORT),
            ADAPTER_STUFF_DIR: adapterStuffDir,
            VENCORD_USER_DATA_DIR: DATA_DIR
        };

        if (existsSync(ADAPTER_BUNDLE_ENTRY)) {
            child = utilityProcess.fork(ADAPTER_BUNDLE_ENTRY, [], {
                cwd: process.cwd(),
                env: adapterEnv
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
        adapterManagedByVesktop = true;

        listenToAdapterLogs(onStatus);
        attachAdapterMessageBridge(child);

        (child as any).once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
            adapterProcess = undefined;
            if (signal || code) {
                console.error(`[DiscordAdapter] exited unexpectedly (code=${code}, signal=${signal})`);
            }
        });

        const isReady = await waitForAdapterReady(START_TIMEOUT);
        if (!isReady) {
            throw new Error("Discord adapter did not become ready in time");
        }

        onStatus?.("Backend started.");
    })().finally(() => {
        startPromise = undefined;
    });

    return startPromise;
}

export function stopDiscordAdapter() {
    if (!adapterManagedByVesktop || !adapterProcess) return;

    try {
        adapterProcess.kill();
    } catch (error) {
        console.warn("[DiscordAdapter] Failed to stop adapter process cleanly:", error);
    }

    adapterProcess = undefined;
    adapterManagedByVesktop = false;
}
