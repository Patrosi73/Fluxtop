/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Patrosi73 and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "renderer/settings";

import { addPatch } from "./shared";

const OFFICIAL_WEBAPPS = ["https://web.fluxer.app", "https://web.canary.fluxer.app"];

function getWebapps() {
    const { fluxerInstance, fluxerEndpoints } = Settings.store;
    const urls = fluxerInstance === "custom" ? [] : [...OFFICIAL_WEBAPPS];
    if (fluxerEndpoints?.webapp) urls.push(fluxerEndpoints.webapp);

    const webapps = new Map<string, { protocol: string; host: string; prefix: string; base: string }>();
    for (const value of urls) {
        try {
            const { protocol, host, pathname } = new URL(value);
            const prefix = pathname.replace(/\/+$/, "");
            const base = `${protocol}//${host}${prefix}`;
            webapps.set(base, { protocol, host, prefix, base });
        } catch {}
    }
    return [...webapps.values()];
}

const webapps = getWebapps();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

addPatch({
    patches: [
        // a clicked link only opens in the app when it's on a discord host or on the page's own host (localhost in our case).
        // fluxer's links are neither, so we patch the check to include our hosts
        {
            find: "skipExtensionCheck:void 0,analyticsLocations:[]",
            replacement: {
                match: /(let\{host:\i,hostname:\i,pathname:\i,search:\i,hash:\i\}=)(\i\.\i\.toURLSafe\(\i\))(?=\?\?\{\})/,
                replace: "$1$self.toLocalUrl($2)"
            }
        },
        // the `#channel > message` bubbles come from two regexes with hardcoded https discord hosts.
        // we patch them to include our hosts
        {
            find: "^/guild-stages/",
            replacement: {
                match: /(["`])\^(https:\/\/\(\?:\(\?:canary\\\\\.\|ptb\\\\\.\)\?discord\(\?:app\)\?\.com\|staging\\\\\.discord\\\\\.co\))(?=\/channels\/)/g,
                replace: "$1^(?:$2|$1+$self.webappPattern+$1)"
            }
        },
        // the invite/template generator only finds the host in a value with a path (<host>/invite) when
        // it starts with `//`. the same value also builds invite links, where that `//` would turn it into `https:////<host>/invite` and break the link,
        // so the adapter sends it without one and it gets added only here
        {
            find: "return{host:null,pathPrefix:null}",
            replacement: {
                match: /(if\((\i)\.indexOf\("\/"\)>=0\)\{let \i=\(0,\i\.parse\)\()\2(?=,void 0,!0\))/,
                replace: "$1$self.withLeadingSlashes($2)"
            }
        }
    ],

    toLocalUrl(url: URL | null) {
        if (url == null) return url;
        for (const { protocol, host, prefix } of webapps) {
            if (url.protocol !== protocol || url.host !== host) continue;
            if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) continue;

            return new URL((url.pathname.slice(prefix.length) || "/") + url.search + url.hash, location.origin);
        }

        return url;
    },

    webappPattern: webapps.map(({ base }) => escapeRegex(base)).join("|") || "(?!)",

    withLeadingSlashes(value: string) {
        return /^([a-z][a-z\d+.-]*:)?\/\//i.test(value) ? value : `//${value}`;
    }
});
