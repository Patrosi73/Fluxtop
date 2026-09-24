/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Patrosi73 and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type FluxerInstanceKind = "stable" | "canary" | "custom";

export interface FluxerEndpoints {
    api: string;
    api_client: string;
    api_public: string;
    gateway: string;
    media: string;
    static_cdn: string;
    webapp: string;
    marketing: string;
    admin: string;
    invite: string;
    gift: string;
}

export interface FluxerDiscoveryDocument {
    api_code_version?: number;
    endpoints: FluxerEndpoints;
    features?: Record<string, unknown>;
}

const FLUXER_PRESET_ORIGINS: Record<"stable" | "canary", string> = {
    stable: "https://web.fluxer.app",
    canary: "https://web.canary.fluxer.app"
};

export const DEFAULT_FLUXER_ENDPOINTS: FluxerEndpoints = {
    api: "https://web.canary.fluxer.app/api",
    api_client: "https://web.canary.fluxer.app/api",
    api_public: "https://api.canary.fluxer.app",
    gateway: "wss://gateway.fluxer.app",
    media: "https://fluxerusercontent.com",
    static_cdn: "https://fluxerstatic.com",
    webapp: "https://web.canary.fluxer.app",
    marketing: "https://canary.fluxer.app",
    admin: "https://admin.canary.fluxer.app",
    invite: "https://fluxer.gg",
    gift: "https://fluxer.gift"
};

export function normalizeFluxerOrigin(input: string): string {
    const value = input.trim();
    if (!value) throw new Error("Enter a Fluxer instance domain.");

    // no scheme means https, any scheme other than http(s) is rejected below
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Instance URL must use http or https.");
    }

    return url.origin;
}

async function fetchDiscovery(url: string): Promise<FluxerDiscoveryDocument | null> {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;

    // if this isn't valid JSON we ignore it entirely, it's probably a 404 page or something
    const body = await res.json().catch(() => null);
    if (typeof body?.endpoints?.api_client !== "string") return null;

    body.endpoints = Object.fromEntries(
        Object.entries(body.endpoints).map(([key, value]) => [
            key,
            typeof value === "string" ? value.replace(/\/+$/, "") : value
        ])
    );
    return body;
}

export async function discoverFluxerInstance(originInput: string): Promise<FluxerDiscoveryDocument> {
    const origin = normalizeFluxerOrigin(originInput);
    // even though the docs say to use /.well-known/fluxer, some instances only respond at /api/.well-known/fluxer
    // so we try both... and this may not even be enough! i love people not following the spec <3
    // unless I AM reading the spec wrong o.o
    for (const url of [`${origin}/.well-known/fluxer`, `${origin}/api/.well-known/fluxer`]) {
        const doc = await fetchDiscovery(url).catch(() => null);
        if (doc) return doc;
    }

    throw new Error(
        `Could not reach Fluxer discovery at ${origin}/.well-known/fluxer. Please check the instance URL and try again.`
    );
}

export function resolveInstanceOrigin(kind: FluxerInstanceKind, customHint?: string): string {
    if (kind === "custom") return normalizeFluxerOrigin(customHint ?? "");
    return FLUXER_PRESET_ORIGINS[kind];
}

export function clientApiBase(endpoints: FluxerEndpoints): string {
    const base = endpoints.api_client;
    return base.endsWith("/v1") ? base : `${base}/v1`;
}

export function desktopHandoffLoginUrl(endpoints: FluxerEndpoints): string {
    return `${endpoints.webapp}/login?desktop_handoff=1`;
}

export interface HandoffInitiateResponse {
    code: string;
    expires_at: string;
    poll_secret?: string;
}

export interface HandoffStatusResponse {
    status: "pending" | "completed" | "expired";
    token?: string | null;
}

async function handoffRequest<T>(
    endpoints: FluxerEndpoints,
    path: string,
    method: string,
    body: object | undefined,
    userAgent: string | undefined
): Promise<T> {
    const res = await fetch(`${clientApiBase(endpoints)}/auth/handoff/${path}`, {
        method,
        headers: {
            Accept: "application/json",
            Origin: endpoints.webapp,
            // fluxer only reads the device and browser info on the initiate request and never afterwards.
            // so if we don't send it now the device will show up as null forever lol
            ...(userAgent && { "User-Agent": userAgent }),
            ...(body && { "Content-Type": "application/json" })
        },
        body: body && JSON.stringify(body)
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Handoff ${path} failed (${res.status}): ${text || res.statusText}`);
    }

    return res.status === 204 ? (undefined as T) : res.json();
}

export function initiateDesktopHandoff(endpoints: FluxerEndpoints, userAgent?: string) {
    return handoffRequest<HandoffInitiateResponse>(endpoints, "initiate", "POST", undefined, userAgent);
}

// once again, we have to do some weird juggling because some instances don't use poll_secret :P
export function getDesktopHandoffStatus(
    endpoints: FluxerEndpoints,
    code: string,
    pollSecret?: string,
    userAgent?: string
) {
    return handoffRequest<HandoffStatusResponse>(
        endpoints,
        `${encodeURIComponent(code)}/status`,
        pollSecret ? "POST" : "GET",
        pollSecret ? { poll_secret: pollSecret } : undefined,
        userAgent
    );
}

export function cancelDesktopHandoff(endpoints: FluxerEndpoints, code: string, pollSecret: string, userAgent?: string) {
    return handoffRequest<void>(endpoints, encodeURIComponent(code), "DELETE", { poll_secret: pollSecret }, userAgent);
}

// and because i don't trust custom instances at all...
export function formatHandoffCode(code: string): string {
    const compact = code.replace(/-/g, "");
    return `${compact.slice(0, 6)}-${compact.slice(6)}`;
}
