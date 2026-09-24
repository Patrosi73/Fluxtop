/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, shell } from "electron";
import { BrowserWindow } from "electron/main";
import { copyFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { SplashProps } from "shared/browserWinProperties";
import {
    cancelDesktopHandoff,
    desktopHandoffLoginUrl,
    discoverFluxerInstance,
    type FluxerEndpoints,
    type FluxerInstanceKind,
    formatHandoffCode,
    getDesktopHandoffStatus,
    initiateDesktopHandoff,
    resolveInstanceOrigin
} from "shared/fluxerInstance";
import { sleep } from "shared/utils/sleep";

import { autoStart } from "./autoStart";
import { DATA_DIR } from "./constants";
import { createWindows } from "./mainWindow";
import { Settings, State } from "./settings";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { loadView } from "./vesktopStatic";

interface FirstLaunchFormData {
    fluxerToken?: string;
    minimizeToTray?: "on";
    autoStart?: "on";
    importSettings?: "on";
}

type SessionState = {
    kind: FluxerInstanceKind;
    origin?: string;
    endpoints: FluxerEndpoints | null;
    connecting?: Promise<void>;
    handoff?: AbortController;
};

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function pushToView(win: BrowserWindow, event: string, payload: unknown) {
    if (win.isDestroyed()) return;
    const script = `window.dispatchEvent(new CustomEvent(${JSON.stringify(event)}, { detail: ${JSON.stringify(payload)} }));`;
    win.webContents.executeJavaScript(script).catch(() => {});
}

function connectFluxerSession(win: BrowserWindow, session: SessionState, kind: FluxerInstanceKind, domain?: string) {
    Object.assign(session, { kind, origin: undefined, endpoints: null });
    pushToView(win, "fluxtop-connect", { type: "connecting", kind });

    const connecting = (async () => {
        const origin = resolveInstanceOrigin(kind, domain);
        return { origin, ...(await discoverFluxerInstance(origin)) };
    })().then(
        ({ origin, endpoints }) => {
            if (session.connecting !== connecting) return;
            Object.assign(session, { origin, endpoints });
            pushToView(win, "fluxtop-connect", { type: "ok", kind, webapp: endpoints.webapp });
        },
        error => {
            if (session.connecting !== connecting) return;
            pushToView(win, "fluxtop-connect", { type: "error", kind, message: errorMessage(error) });
        }
    );

    session.connecting = connecting;
    return connecting;
}

async function connectedEndpoints(win: BrowserWindow, session: SessionState) {
    await session.connecting;
    if (!session.endpoints && session.kind !== "custom") {
        await connectFluxerSession(win, session, session.kind);
    }
    if (!session.endpoints) throw new Error("Connect to your Fluxer instance first.");
    return session.endpoints;
}

function applyFluxerInstanceSettings({ kind, origin }: SessionState, endpoints: FluxerEndpoints) {
    Settings.store.fluxerEndpoints = endpoints;
    Settings.store.fluxerCustomDomain = kind === "custom" ? origin : undefined;
    Settings.store.fluxerInstance = kind;
    Settings.store.discordBranch = kind === "stable" ? "stable" : "canary";
}

function stopHandoff(session: SessionState) {
    session.handoff?.abort();
    session.handoff = undefined;
}

async function startHandoff(win: BrowserWindow, session: SessionState) {
    stopHandoff(session);
    const { signal } = (session.handoff = new AbortController());
    const userAgent = app.userAgentFallback;

    let endpoints: FluxerEndpoints;
    let code: string;
    let pollSecret: string | undefined;
    try {
        endpoints = await connectedEndpoints(win, session);
        if (signal.aborted) return;

        pushToView(win, "fluxtop-handoff", { type: "starting" });
        ({ code, poll_secret: pollSecret } = await initiateDesktopHandoff(endpoints, userAgent));
    } catch (error) {
        if (!signal.aborted) pushToView(win, "fluxtop-handoff", { type: "error", message: errorMessage(error) });
        return;
    }

    const cancel = () => {
        if (pollSecret) cancelDesktopHandoff(endpoints, code, pollSecret, userAgent).catch(() => {});
    };
    if (signal.aborted) return cancel();
    signal.addEventListener("abort", cancel);

    pushToView(win, "fluxtop-handoff", { type: "pending", displayCode: formatHandoffCode(code) });

    try {
        while (true) {
            await sleep(2000);
            if (signal.aborted) return;

            try {
                const status = await getDesktopHandoffStatus(endpoints, code, pollSecret, userAgent);
                if (signal.aborted) return;

                if (status.status === "completed" && status.token) {
                    pushToView(win, "fluxtop-handoff", { type: "completed", token: status.token });
                    return;
                }

                if (status.status === "expired") {
                    pushToView(win, "fluxtop-handoff", {
                        type: "error",
                        message: "Handoff code expired. Start again to get a new code."
                    });
                    return;
                }
            } catch (error) {
                console.error("[Handoff] status poll failed:", error);
                // I got IP banned on accident while testing yo
                if (errorMessage(error).includes("INVALID_HANDOFF_CODE")) {
                    pushToView(win, "fluxtop-handoff", {
                        type: "error",
                        message:
                            "Something has gone wrong with the handoff code (possible IP ban). Start again to get a new code. If you face this again, try waiting 15 minutes or use token login."
                    });
                    return;
                }
            }
        }
    } finally {
        signal.removeEventListener("abort", cancel);
    }
}

function attachFluxerSetupHandlers(
    win: BrowserWindow,
    session: SessionState,
    onSubmit: (data: FirstLaunchFormData, token: string) => void,
    onCancel: () => void
) {
    win.webContents.on("console-message", async (_e, _l, msg) => {
        if (msg === "cancel") return onCancel();

        if (msg.startsWith("form:")) {
            try {
                const data: FirstLaunchFormData = JSON.parse(msg.slice(5));
                const endpoints = await connectedEndpoints(win, session);
                const token = data.fluxerToken?.trim();
                if (!token) throw new Error("Sign in with desktop handoff or paste a token before continuing.");

                applyFluxerInstanceSettings(session, endpoints);
                onSubmit(data, token);
            } catch (error) {
                pushToView(win, "fluxtop-form", { type: "error", message: errorMessage(error) });
            }
            return;
        }

        if (msg.startsWith("connect:")) {
            const { fluxerInstance, fluxerCustomDomain } = JSON.parse(msg.slice(8));
            return connectFluxerSession(win, session, fluxerInstance, fluxerCustomDomain);
        }

        if (msg === "handoff:start") return startHandoff(win, session);

        if (msg === "handoff:cancel") {
            stopHandoff(session);
            pushToView(win, "fluxtop-handoff", { type: "idle" });
            return;
        }

        if (msg === "handoff:open") {
            try {
                await shell.openExternal(desktopHandoffLoginUrl(await connectedEndpoints(win, session)));
            } catch (error) {
                pushToView(win, "fluxtop-handoff", { type: "error", message: errorMessage(error) });
            }
        }
    });

    win.on("closed", () => stopHandoff(session));
}

export function createFirstLaunchTour() {
    const win = new BrowserWindow({
        ...SplashProps,
        transparent: false,
        frame: true,
        autoHideMenuBar: true,
        height: 720,
        width: 640
    });

    const session: SessionState = { kind: "canary", endpoints: null };

    makeLinksOpenExternally(win);
    loadView(win, "first-launch.html");

    attachFluxerSetupHandlers(
        win,
        session,
        (data, token) => {
            State.store.firstLaunch = false;
            Settings.store.minimizeToTray = !!data.minimizeToTray;
            Settings.store.arRPC = false;
            Settings.store.fluxerToken = token;

            if (data.autoStart) autoStart.enable();

            if (data.importSettings) {
                const from = join(app.getPath("userData"), "..", "Vencord", "settings");
                const to = join(DATA_DIR, "settings");
                try {
                    const files = readdirSync(from);
                    mkdirSync(to, { recursive: true });

                    for (const file of files) {
                        copyFileSync(join(from, file), join(to, file));
                    }
                } catch (e) {
                    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
                        console.log("No Vencord settings found to import.");
                    } else {
                        console.error("Failed to import Vencord settings:", e);
                    }
                }
            }

            win.close();

            void createWindows();
        },
        () => app.exit()
    );
}

export function createFluxerTokenRefreshWindow(
    onSubmit: (token: string) => void,
    onClose?: (dismissed: boolean) => void,
    parent?: BrowserWindow
) {
    const win = new BrowserWindow({
        ...SplashProps,
        parent,
        modal: !!parent,
        transparent: false,
        frame: true,
        autoHideMenuBar: true,
        height: 680,
        width: 640,
        resizable: true
    });

    const kind = Settings.store.fluxerInstance ?? "canary";
    const session: SessionState = { kind, endpoints: null };

    let submitted = false;

    makeLinksOpenExternally(win);
    loadView(
        win,
        "fluxer-token-refresh.html",
        new URLSearchParams({ instance: kind, domain: Settings.store.fluxerCustomDomain ?? "" })
    );

    attachFluxerSetupHandlers(
        win,
        session,
        (_data, token) => {
            submitted = true;
            onSubmit(token);
            win.close();
        },
        () => win.close()
    );

    win.on("closed", () => onClose?.(!submitted));

    return win;
}
