import React, { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:5000/api/v1";
const DEV_FALLBACK_URL = "https://www.cashify.in/";
const CHAT_STORAGE_KEY = "webai.chatByWebsite.v1";
const MAX_MESSAGES_PER_SITE = 120;

const getHostname = (value) => {
    try {
        return new URL(value).hostname;
    } catch {
        return "Unknown site";
    }
};

const getBaseUrl = (value) => {
    try {
        return `${new URL(value).origin}/`;
    } catch {
        return value;
    }
};

const getSiteStorageKey = (value) => {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return "unknown-site";
    }
};

const normalizeStoredMessage = (message) => {
    if (!message || typeof message !== "object") return null;

    const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null;
    if (!role) return null;

    const text = typeof message.text === "string" ? message.text : "";
    const id = typeof message.id === "string" ? message.id : createId();
    const progress = typeof message.progress === "string" ? message.progress : "";
    const status = typeof message.status === "string" ? message.status : role === "assistant" ? "done" : undefined;
    const wasPdf = Boolean(message.wasPdf);
    const relevantLinks = Array.isArray(message.relevantLinks)
        ? message.relevantLinks.filter((item) => typeof item === "string").slice(0, 8)
        : [];

    return {
        id,
        role,
        text,
        progress,
        status,
        relevantLinks,
        wasPdf,
    };
};

const parseChatStore = (rawValue) => {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        return {};
    }

    return Object.entries(rawValue).reduce((acc, [siteKey, history]) => {
        if (!Array.isArray(history)) return acc;
        acc[siteKey] = history
            .map(normalizeStoredMessage)
            .filter(Boolean)
            .slice(-MAX_MESSAGES_PER_SITE);
        return acc;
    }, {});
};

const readChatStoreFromLocalStorage = () => {
    try {
        const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
        if (!raw) return {};
        return parseChatStore(JSON.parse(raw));
    } catch {
        return {};
    }
};

const writeChatStoreToLocalStorage = (store) => {
    try {
        window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(store));
    } catch {
        return;
    }
};

const readChatStoreFromChromeStorage = async () => {
    if (!(typeof window !== "undefined" && window.chrome?.storage?.local)) {
        return {};
    }

    try {
        const payload = await new Promise((resolve) => {
            window.chrome.storage.local.get([CHAT_STORAGE_KEY], (result) => {
                resolve(result?.[CHAT_STORAGE_KEY] ?? {});
            });
        });
        return parseChatStore(payload);
    } catch {
        return {};
    }
};

const writeChatStoreToChromeStorage = async (store) => {
    if (!(typeof window !== "undefined" && window.chrome?.storage?.local)) {
        return;
    }

    await new Promise((resolve) => {
        window.chrome.storage.local.set({ [CHAT_STORAGE_KEY]: store }, () => {
            resolve();
        });
    });
};

const createId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const phaseFromElapsed = (elapsedMs) => {
    if (elapsedMs < 2000) {
        return { label: "Scanning page layout ...", percent: 18 };
    }

    if (elapsedMs < 5000) {
        return { label: "Searching vector storage ...", percent: 52 };
    }

    if (elapsedMs < 7000) {
        return { label: "Generating AI summary ...", percent: 78 };
    }

    return { label: "Finalizing response ...", percent: 92 };
};

const parseSseBlock = (block) => {
    const lines = block.split("\n");
    let event = "message";
    const dataLines = [];

    for (const line of lines) {
        if (line.startsWith("event:")) {
            event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
        }
    }

    const dataText = dataLines.join("\n");
    if (!dataText) {
        return { event, data: null };
    }

    try {
        return { event, data: JSON.parse(dataText) };
    } catch {
        return { event, data: dataText };
    }
};

const getFriendlyFeedbackMessage = (rawMessage) => {
    const message = typeof rawMessage === "string" ? rawMessage.trim() : "";

    if (!message) {
        return "I couldn't complete that request right now. Please try again in a moment.";
    }

    const normalized = message.toLowerCase();

    if (normalized.includes("no info found") || normalized.includes("not found")) {
        return "I couldn't find enough information on this page yet. Try rephrasing the question or wait for the page map to finish.";
    }

    if (
        normalized.includes("timeout") ||
        normalized.includes("network") ||
        normalized.includes("fetch") ||
        normalized.includes("failed to fetch")
    ) {
        return "The request timed out while I was gathering the answer. Please try again.";
    }

    return "I hit a temporary issue while answering. Please try again in a moment.";
};

const createAssistantMessage = (id) => ({
    id,
    role: "assistant",
    text: "",
    progress: "",
    status: "streaming",
    relevantLinks: [],
    wasPdf: false,
});

const createUserMessage = (id, text) => ({
    id,
    role: "user",
    text,
});

const MessageList = React.memo(function MessageList({ messages }) {
    return (
        <div className="message-list">
            {messages.map((message) => (
                <div
                    key={message.id}
                    className={`message-row ${message.role === "user" ? "user" : "assistant"}`}
                >
                    <div className={`message-bubble ${message.role}`}>
                        {message.role === "assistant" && message.progress ? (
                            <div className="message-progress">{message.progress}</div>
                        ) : null}

                        <div className="message-text">
                            {message.text || (message.role === "assistant" ? "Working ..." : "")}
                        </div>

                        {message.role === "assistant" && message.status === "streaming" && !message.text ? (
                            <div className="inline-skeleton">
                                <span />
                                <span />
                                <span />
                            </div>
                        ) : null}

                        {Array.isArray(message.relevantLinks) && message.relevantLinks.length > 0 ? (
                            <div className="links-block">
                                <div className="links-title">Relevant links</div>
                                <div className="links-list">
                                    {message.relevantLinks.map((url, index) => (
                                        <a
                                            key={`${url}-${index}`}
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="link-item"
                                        >
                                            <span className="link-icon">{message.wasPdf ? "PDF" : "LINK"}</span>
                                            <span>{url}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ))}
        </div>
    );
});

export default function App() {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeUrl, setActiveUrl] = useState("");
    const [activeSiteKey, setActiveSiteKey] = useState("");
    const [chatReady, setChatReady] = useState(false);
    const [siteStatus, setSiteStatus] = useState({
        state: "idle",
        title: "Waiting for a page",
        subtitle: "Open any website and the extension will map it immediately.",
    });
    const [tracker, setTracker] = useState({
        scope: "idle",
        startedAt: 0,
        text: "Ready",
        percent: 100,
    });
    const scrollRef = useRef(null);
    const loadingRef = useRef(false);
    const persistTimersRef = useRef({ local: null, chrome: null });

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        let cancelled = false;

        if (typeof window !== "undefined" && window.chrome?.tabs) {
            window.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (cancelled) return;
                setActiveUrl(tabs[0]?.url || DEV_FALLBACK_URL);
            });
        } else {
            setActiveUrl(DEV_FALLBACK_URL);
        }

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!activeUrl) return undefined;

        const controller = new AbortController();
        const baseUrl = getBaseUrl(activeUrl);

        setSiteStatus({
            state: "warming",
            title: "Preparing site map",
            subtitle: getHostname(activeUrl),
        });

        if (!loadingRef.current) {
            setTracker({
                scope: "warmup",
                startedAt: Date.now(),
                text: "Scanning page layout ...",
                percent: 18,
            });
        }

        (async () => {
            try {
                const response = await fetch(`${API_BASE}/site/warmup`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        websiteUrl: activeUrl,
                        currentPageUrl: activeUrl,
                        baseUrl,
                    }),
                    signal: controller.signal,
                });

                const payload = await response.json();

                if (controller.signal.aborted) return;

                if (payload.status === "ready") {
                    setSiteStatus({
                        state: "ready",
                        title: "Site map ready",
                        subtitle: getHostname(activeUrl),
                    });

                    if (!loadingRef.current) {
                        setTracker({
                            scope: "idle",
                            startedAt: 0,
                            text: "Ready",
                            percent: 100,
                        });
                    }
                } else {
                    setSiteStatus({
                        state: "warming",
                        title: payload.message || "Mapping website in background",
                        subtitle: getHostname(activeUrl),
                    });
                }
            } catch {
                if (!controller.signal.aborted) {
                    setSiteStatus({
                        state: "offline",
                        title: "Backend warmup unavailable",
                        subtitle: "The extension can still ask questions when the API is back.",
                    });
                }
            }
        })();

        return () => controller.abort();
    }, [activeUrl]);

    useEffect(() => {
        if (!activeUrl) return undefined;

        let cancelled = false;
        const siteKey = getSiteStorageKey(activeUrl);

        setActiveSiteKey(siteKey);
        setChatReady(false);

        (async () => {
            const localStore = readChatStoreFromLocalStorage();
            const chromeStore = await readChatStoreFromChromeStorage();
            const mergedStore = {
                ...localStore,
                ...chromeStore,
            };

            if (cancelled) return;

            setMessages(Array.isArray(mergedStore[siteKey]) ? mergedStore[siteKey] : []);
            setChatReady(true);

            writeChatStoreToLocalStorage(mergedStore);
        })();

        return () => {
            cancelled = true;
        };
    }, [activeUrl]);

    useEffect(() => {
        if (!chatReady || !activeSiteKey) return;

        const normalizedMessages = messages
            .map(normalizeStoredMessage)
            .filter(Boolean)
            .slice(-MAX_MESSAGES_PER_SITE);
        const hasStreamingMessage = messages.some(
            (message) => message.role === "assistant" && message.status === "streaming",
        );
        const timers = persistTimersRef.current;

        if (timers.local) {
            window.clearTimeout(timers.local);
        }

        if (timers.chrome) {
            window.clearTimeout(timers.chrome);
        }

        const persistToLocalStorage = () => {
            const localStore = readChatStoreFromLocalStorage();
            const nextStore = {
                ...localStore,
                [activeSiteKey]: normalizedMessages,
            };

            writeChatStoreToLocalStorage(nextStore);
            return nextStore;
        };

        if (hasStreamingMessage) {
            timers.local = window.setTimeout(() => {
                persistToLocalStorage();
            }, 800);

            return () => {
                if (timers.local) {
                    window.clearTimeout(timers.local);
                }

                if (timers.chrome) {
                    window.clearTimeout(timers.chrome);
                }
            };
        }

        const nextStore = persistToLocalStorage();

        timers.chrome = window.setTimeout(() => {
            void writeChatStoreToChromeStorage(nextStore);
        }, 800);

        return () => {
            if (timers.local) {
                window.clearTimeout(timers.local);
            }

            if (timers.chrome) {
                window.clearTimeout(timers.chrome);
            }
        };
    }, [messages, activeSiteKey, chatReady]);

    useEffect(() => {
        if (tracker.scope === "idle" || !tracker.startedAt) return undefined;

        const timer = window.setInterval(() => {
            setTracker((current) => {
                if (current.scope === "idle" || !current.startedAt) return current;

                const next = phaseFromElapsed(Date.now() - current.startedAt);
                return {
                    ...current,
                    text: next.label,
                    percent: next.percent,
                };
            });
        }, 800);

        return () => window.clearInterval(timer);
    }, [tracker.scope, tracker.startedAt]);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages]);

    const updateMessage = (id, updater) => {
        setMessages((previous) =>
            previous.map((message) => (message.id === id ? updater(message) : message)),
        );
    };

    const handleSend = async (event) => {
        event.preventDefault();

        const question = input.trim();
        if (!question || loading) return;

        const currentUrl = activeUrl || DEV_FALLBACK_URL;
        const baseUrl = getBaseUrl(currentUrl);
        const userId = createId();
        const assistantId = createId();

        setInput("");
        setMessages((previous) => [
            ...previous,
            createUserMessage(userId, question),
            createAssistantMessage(assistantId),
        ]);
        setLoading(true);
        setTracker({
            scope: "query",
            startedAt: Date.now(),
            text: "Scanning page layout ...",
            percent: 18,
        });

        try {
            const response = await fetch(`${API_BASE}/query/stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                },
                body: JSON.stringify({
                    question,
                    websiteUrl: currentUrl,
                    currentPageUrl: currentUrl,
                    baseUrl,
                }),
            });

            if (!response.ok) {
                throw new Error(`Request failed with ${response.status}`);
            }

            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("application/json")) {
                const payload = await response.json();
                updateMessage(assistantId, (message) => ({
                    ...message,
                    text: payload.answer || "No answer available.",
                    relevantLinks: payload.relevantLinks || [],
                    wasPdf: payload.wasPdf || false,
                    status: "done",
                }));
            } else if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    let boundaryIndex = buffer.indexOf("\n\n");
                    while (boundaryIndex !== -1) {
                        const block = buffer.slice(0, boundaryIndex).trim();
                        buffer = buffer.slice(boundaryIndex + 2);
                        boundaryIndex = buffer.indexOf("\n\n");

                        if (!block) continue;

                        const { event: eventType, data } = parseSseBlock(block);

                        if (eventType === "stage" && data && typeof data === "object") {
                            const stageText = data.message || "Working ...";
                            const stagePercent = typeof data.percent === "number" ? data.percent : undefined;

                            setTracker((current) => ({
                                ...current,
                                text: stageText,
                                percent: stagePercent ?? current.percent,
                            }));

                            updateMessage(assistantId, (message) => ({
                                ...message,
                                progress: stageText,
                            }));
                        }

                        if (eventType === "answer_chunk" && data && typeof data === "object") {
                            const chunk = typeof data.chunk === "string" ? data.chunk : "";
                            if (!chunk) continue;

                            updateMessage(assistantId, (message) => ({
                                ...message,
                                text: `${message.text}${chunk}`,
                            }));
                        }

                        if (eventType === "result" && data && typeof data === "object") {
                            updateMessage(assistantId, (message) => ({
                                ...message,
                                text:
                                    typeof data.answer === "string" && data.answer.trim()
                                        ? data.answer
                                        : message.text || "No answer available.",
                                relevantLinks: Array.isArray(data.relevantLinks)
                                    ? data.relevantLinks
                                    : message.relevantLinks,
                                wasPdf: Boolean(data.wasPdf),
                                status: "done",
                            }));
                        }

                        if (eventType === "error") {
                            const errorText =
                                data && typeof data === "object" && typeof data.message === "string"
                                    ? data.message
                                    : "Backend error";
                            throw new Error(getFriendlyFeedbackMessage(errorText));
                        }
                    }
                }
            }
        } catch (error) {
            updateMessage(assistantId, (message) => ({
                ...message,
                text:
                    error instanceof Error
                        ? getFriendlyFeedbackMessage(error.message)
                        : "I couldn't complete that request right now. Please try again in a moment.",
                status: "error",
            }));
        } finally {
            setLoading(false);
            setTracker({
                scope: "idle",
                startedAt: 0,
                text: "Ready",
                percent: 100,
            });
        }
    };

    const currentTrackerLabel =
        tracker.scope === "idle"
            ? siteStatus.title
            : tracker.text || "Working ...";

    const isSkeletonVisible = messages.length === 0 && (siteStatus.state === "warming" || loading);

    return (
        <div className="popup-shell">
            <div className="shell-orb shell-orb-left" />
            <div className="shell-orb shell-orb-right" />

            <div className="shell-frame">
                <header className="topbar glass-panel">
                    <div>
                        <div className="brand-row">
                            <div className="brand-mark">W</div>
                            <div>
                                <div className="brand-kicker">Web.AI</div>
                                <div className="brand-title">Site-aware assistant</div>
                            </div>
                        </div>
                    </div>

                    <div className={`status-pill ${siteStatus.state}`}>
                        <span className="status-dot" />
                        <span>{siteStatus.state === "offline" ? "Offline" : currentTrackerLabel}</span>
                    </div>
                </header>

                <section className="hero glass-panel">
                    <a
                        className="site-chip"
                        href={activeUrl || DEV_FALLBACK_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {getHostname(activeUrl || DEV_FALLBACK_URL)}
                    </a>

                    <div className="hero-meta">
                        <div className="hero-mini-track" aria-label="Progress bar">
                            <span style={{ width: `${tracker.percent}%` }} />
                        </div>
                    </div>
                </section>

                <main className="conversation glass-panel">
                    {messages.length === 0 && !isSkeletonVisible && (
                        <div className="empty-state">
                            <div className="empty-icon">◌</div>
                            <div className="empty-title">Ask about this page</div>
                            <div className="empty-text">
                                The extension maps the site as soon as it opens, then queues your
                                question if the mapping is still running.
                            </div>
                        </div>
                    )}

                    {isSkeletonVisible && (
                        <div className="skeleton-stack">
                            <div className="skeleton-card">
                                <div className="skeleton-line wide" />
                                <div className="skeleton-line medium" />
                                <div className="skeleton-line small" />
                            </div>
                            <div className="skeleton-card alt">
                                <div className="skeleton-line wide" />
                                <div className="skeleton-line medium" />
                                <div className="skeleton-line small" />
                            </div>
                        </div>
                    )}

                    <MessageList messages={messages} />

                    <div ref={scrollRef} />
                </main>

                <footer className="composer glass-panel">
                    <form onSubmit={handleSend} className="composer-form">
                        <input
                            type="text"
                            autoFocus
                            className="composer-input"
                            placeholder="Ask anything about this site..."
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            disabled={loading}
                        />
                        <button type="submit" className="composer-button" disabled={loading || !input.trim()}>
                            {loading ? "Working" : "Ask"}
                        </button>
                    </form>
                </footer>
            </div>
        </div>
    );
}