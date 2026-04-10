import { SearchContextSize } from "./webSearch";

export interface SearchResult {
    title: string;
    url: string;
    snippet?: string;
}

export function parseDuckDuckGoResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    const anchorRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(html)) !== null) {
        const href = decodeDuckDuckGoUrl(match[1]);
        const title = stripHtml(match[2]);
        if (!href || !title) {
            continue;
        }

        const snippet = extractSnippetAround(html, match.index);
        if (!results.some((result) => result.url === href)) {
            results.push({ title, url: href, snippet });
        }
    }

    return results;
}

export function decodeDuckDuckGoUrl(rawHref: string): string | null {
    try {
        const url = new URL(rawHref, "https://duckduckgo.com");
        const redirected = url.searchParams.get("uddg");
        return redirected ? decodeURIComponent(redirected) : url.toString();
    } catch {
        return null;
    }
}

export function extractSnippetAround(html: string, startIndex: number): string | undefined {
    const slice = html.slice(startIndex, startIndex + 1200);
    const match = slice.match(/<a[^>]*result__a[\s\S]*?<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
        ?? slice.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const snippet = match?.[1] ? stripHtml(match[1]) : undefined;
    return snippet || undefined;
}

export function findPatternMatches(content: string, pattern: string): string[] {
    const matches = new Set<string>();
    const regex = buildSearchRegex(pattern);

    if (regex) {
        for (const match of content.matchAll(regex)) {
            const index = match.index ?? 0;
            matches.add(extractMatchContext(content, index, match[0].length));
            if (matches.size >= 20) {
                break;
            }
        }
        return [...matches];
    }

    const lowerContent = content.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    let fromIndex = 0;
    while (matches.size < 20) {
        const index = lowerContent.indexOf(lowerPattern, fromIndex);
        if (index === -1) {
            break;
        }
        matches.add(extractMatchContext(content, index, pattern.length));
        fromIndex = index + pattern.length;
    }

    return [...matches];
}

export function buildSearchRegex(pattern: string): RegExp | null {
    try {
        return new RegExp(pattern, "gi");
    } catch {
        return null;
    }
}

export function extractMatchContext(content: string, start: number, matchLength: number): string {
    const contextStart = Math.max(0, start - 80);
    const contextEnd = Math.min(content.length, start + matchLength + 80);
    return content.slice(contextStart, contextEnd).trim();
}

export function extractTitle(html: string): string | undefined {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return title ? stripHtml(title) : undefined;
}

export function extractTextFromDocument(document: string): string {
    return stripHtml(
        document
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, " "),
    );
}

export function stripHtml(input: string): string {
    return decodeHtmlEntities(
        input
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
    );
}

export function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

export function truncateText(content: string, maxLength: number): string {
    return content.length <= maxLength
        ? content
        : `${content.slice(0, maxLength).trim()}...`;
}

export function resolveContentLimit(contextSize: SearchContextSize | undefined): number {
    switch (contextSize) {
        case "low":
            return 1_500;
        case "high":
            return 12_000;
        case "medium":
        default:
            return 6_000;
    }
}

export function resolvePageSize(pageSize: number | undefined, contextSize: SearchContextSize | undefined): number {
    if (pageSize) {
        return Math.max(1, Math.min(pageSize, 10));
    }

    switch (contextSize) {
        case "low":
            return 3;
        case "high":
            return 9;
        case "medium":
        default:
            return 6;
    }
}

export function applyDomainFilters(query: string, allowedDomains: string[]): string {
    if (allowedDomains.length === 0) {
        return query;
    }

    return `${query} (${allowedDomains.map((domain) => `site:${domain}`).join(" OR ")})`;
}

export function assertAllowedUrl(url: string, allowedDomains?: string[]) {
    if (!isAllowedUrl(url, normalizeDomains(allowedDomains))) {
        throw new Error("URL is outside the configured allowed domains");
    }
}

export async function fetchPage(url: string, allowedDomains: string[] | undefined, signal?: AbortSignal) {
    assertAllowedUrl(url, allowedDomains);

    const response = await fetch(url, {
        headers: spoofHeaders({ accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7" }),
        signal,
    });
    if (!response.ok) {
        throw new Error(`Page request failed: ${response.status} ${response.statusText}`);
    }

    const rawContent = await response.text();
    return {
        title: extractTitle(rawContent),
        content: extractTextFromDocument(rawContent),
    };
}

export function isAllowedUrl(url: string, allowedDomains: string[]): boolean {
    if (allowedDomains.length === 0) {
        return true;
    }

    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch {
        return false;
    }
}

export function normalizeDomains(domains?: string[]): string[] {
    return (domains ?? [])
        .map((domain) => domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
        .filter(Boolean);
}

export function resolveDuckDuckGoRegion(country?: string): string {
    const regionMap: Record<string, string> = {
        AT: "at-de",
        AU: "au-en",
        CA: "ca-en",
        DE: "de-de",
        ES: "es-es",
        FR: "fr-fr",
        GB: "uk-en",
        IN: "in-en",
        IT: "it-it",
        JP: "jp-jp",
        NL: "nl-nl",
        UK: "uk-en",
        US: "us-en",
    };

    return regionMap[country?.trim().toUpperCase() ?? ""] ?? "wt-wt";
}

export function hasAnyValue(value: Record<string, string | undefined>): boolean {
    return Object.values(value).some((field) => Boolean(field?.trim()));
}

export function spoofHeaders({ accept }: { accept?: string } = {}) {
    return {
        "User-Agent": spoofedUserAgents[Math.floor(Math.random() * spoofedUserAgents.length)],
        Accept: accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://duckduckgo.com/",
        Origin: "https://duckduckgo.com",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
    };
}

const spoofedUserAgents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
];
