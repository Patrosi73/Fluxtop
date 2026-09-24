const instanceSelect = document.getElementById("fluxer-instance");
const authSelect = document.getElementById("auth-method");
const customRow = document.getElementById("custom-instance");
const handoffRow = document.getElementById("handoff-login");
const tokenRow = document.getElementById("token-login");
const connectStatus = document.getElementById("connect-status");
const handoffStatus = document.getElementById("handoff-status");
const handoffCode = document.getElementById("handoff-code");
const formStatus = document.getElementById("form-status");
const tokenInput = document.getElementById("fluxer-token");
const showToken = document.getElementById("show-token");
const connectBtn = document.getElementById("connect-btn");
const customDomain = document.getElementById("custom-domain");
const submitBtn = document.getElementById("submit");

function setStatus(el, text = "", kind = "") {
    el.textContent = text;
    el.className = kind ? `status ${kind}` : "status";
}

function setConnectState(state, text) {
    connectBtn.classList.toggle("connect-ok", state === "ok");
    connectBtn.classList.toggle("connect-error", state === "error");
    setStatus(connectStatus, text, state === "idle" ? "" : state);
}

function connect() {
    console.info(
        "connect:" + JSON.stringify({ fluxerInstance: instanceSelect.value, fluxerCustomDomain: customDomain.value })
    );
}

function syncSections() {
    const isHandoff = authSelect.value === "handoff";
    customRow.hidden = instanceSelect.value !== "custom";
    handoffRow.hidden = !isHandoff;
    tokenRow.hidden = isHandoff;
}

instanceSelect.onchange = () => {
    tokenInput.value = "";
    console.info("handoff:cancel");
    setConnectState("idle");
    syncSections();
    if (instanceSelect.value !== "custom") connect();
};

authSelect.onchange = () => {
    console.info("handoff:cancel");
    setStatus(formStatus);
    syncSections();
};

if (showToken) {
    showToken.onchange = () => {
        tokenInput.type = showToken.checked ? "text" : "password";
    };
}

customDomain.oninput = () => setConnectState("idle");

connectBtn.onclick = () => {
    setStatus(formStatus);
    connect();
};

document.getElementById("handoff-start").onclick = () => console.info("handoff:start");
document.getElementById("handoff-open").onclick = () => console.info("handoff:open");

window.addEventListener("fluxtop-connect", ({ detail }) => {
    if (detail.kind !== instanceSelect.value) return;

    if (detail.type === "ok") setStatus(formStatus);

    if (instanceSelect.value !== "custom") {
        if (detail.type === "error") setStatus(formStatus, detail.message, "error");
        return;
    }

    if (detail.type === "connecting") setConnectState("idle", "Connecting…");
    else if (detail.type === "ok") setConnectState("ok", "Connected to " + detail.webapp);
    else setConnectState("error", detail.message);
});

window.addEventListener("fluxtop-handoff", ({ detail }) => {
    switch (detail.type) {
        case "starting":
            setStatus(handoffStatus, "Starting handoff…");
            break;
        case "pending":
            handoffCode.textContent = detail.displayCode;
            setStatus(handoffStatus, "Waiting for browser confirmation…");
            break;
        case "completed":
            tokenInput.value = detail.token;
            setStatus(handoffStatus, `Signed in. Click ${submitBtn.textContent}.`, "ok");
            break;
        case "idle":
            handoffCode.textContent = "--------";
            setStatus(handoffStatus);
            break;
        case "error":
            setStatus(handoffStatus, detail.message, "error");
            break;
    }
});

window.addEventListener("fluxtop-form", ({ detail }) => setStatus(formStatus, detail.message, "error"));

document.getElementById("cancel").onclick = () => console.info("cancel");
submitBtn.onclick = e => {
    e.preventDefault();
    setStatus(formStatus);
    console.info("form:" + JSON.stringify(Object.fromEntries(new FormData(document.querySelector("form")))));
};

const params = new URLSearchParams(location.search);
instanceSelect.value = params.get("instance") || "canary";
customDomain.value = params.get("domain") || "";
syncSections();
if (instanceSelect.value !== "custom" || customDomain.value) connect();
