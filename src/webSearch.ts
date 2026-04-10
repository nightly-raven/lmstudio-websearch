import {
    applyDomainFilters,
    fetchPage,
    findPatternMatches,
    hasAnyValue,
    isAllowedUrl,
    normalizeDomains,
    parseDuckDuckGoResults,
    resolveContentLimit,
    resolveDuckDuckGoRegion,
    resolvePageSize,
    SearchResult,
    spoofHeaders,
    truncateText,
} from "./utils";

export type SearchContextSize = "low" | "medium" | "high";
export type SafeSearchSetting = "strict" | "moderate" | "off";

export type WebSearchAction =
    | { type: "search"; query?: string; queries?: Array<string> }
    | { type: "read"; url?: string }
    | { type: "find_in_page"; url?: string; pattern?: string }
    | { type: "other" };

export interface WebSearchToolConfig {
    context_size?: SearchContextSize;
    allowed_domains?: string[];
    location?: {
        country?: string;
        region?: string;
        city?: string;
        timezone?: string;
    };
}

export interface WebSearchToolSpec {
    type: "search";
    external_web_access: boolean;
    filters?: {
        allowed_domains?: string[];
    };
    user_location?: {
        type: "approximate";
        country?: string;
        region?: string;
        city?: string;
        timezone?: string;
    };
    search_context_size?: SearchContextSize;
    search_content_types?: string[];
}

export interface WebSearchExecutionOptions {
    signal?: AbortSignal;
    pageSize?: number;
    page?: number;
    safeSearch?: SafeSearchSetting;
}

export class MinimalWebSearchTool {
    constructor(private readonly config: WebSearchToolConfig = {}) { }

    getToolSpec(): WebSearchToolSpec {
        return {
            type: "search",
            external_web_access: true,
            filters: this.config.allowed_domains?.length
                ? { allowed_domains: this.config.allowed_domains }
                : undefined,
            user_location: this.config.location && hasAnyValue(this.config.location)
                ? {
                    type: "approximate",
                    ...this.config.location,
                }
                : undefined,
            search_context_size: this.config.context_size,
            search_content_types: ["text"],
        };
    }

    async executeSearch(action: WebSearchAction, options: WebSearchExecutionOptions = {}): Promise<any> {
        switch (action.type) {
            case "search":
                return this.performSearch(action, options);
            case "read":
                return this.readPage(action.url, options);
            case "find_in_page":
                return this.findInPage(action.url, action.pattern, options);
            default:
                throw new Error(`Unsupported action type: ${action.type}`);
        }
    }

    private async performSearch(
        action: Extract<WebSearchAction, { type: "search" }>,
        options: WebSearchExecutionOptions,
    ): Promise<any> {
        const searchQueries = action.queries?.length
            ? action.queries
            : action.query
                ? [action.query]
                : [];

        if (searchQueries.length === 0) {
            throw new Error("At least one query is required for search actions");
        }

        const results = await Promise.all(
            searchQueries.map(async (query) => ({
                query,
                results: await this.searchWeb(query, options),
            })),
        );

        return {
            action: "search",
            query: action.query,
            queries: action.queries,
            results,
            tool_spec: this.getToolSpec(),
        };
    }

    private async searchWeb(query: string, options: WebSearchExecutionOptions): Promise<SearchResult[]> {
        const allowedDomains = normalizeDomains(this.config.allowed_domains);
        const pageSize = resolvePageSize(options.pageSize, this.config.context_size);
        const page = options.page ?? 1;
        const url = new URL("https://duckduckgo.com/html/");

        url.searchParams.set("q", applyDomainFilters(query, allowedDomains));
        url.searchParams.set("kl", resolveDuckDuckGoRegion(this.config.location?.country));

        if (options.safeSearch && options.safeSearch !== "moderate") {
            url.searchParams.set("p", options.safeSearch === "strict" ? "-1" : "1");
        }
        if (page > 1) {
            url.searchParams.set("s", String(pageSize * (page - 1)));
        }

        const response = await fetch(url, {
            headers: spoofHeaders(),
            signal: options.signal,
        });
        if (!response.ok) {
            throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        const parsedResults = parseDuckDuckGoResults(html)
            .filter((result) => isAllowedUrl(result.url, allowedDomains))
            .slice(0, pageSize);

        return parsedResults;
    }

    private async readPage(url?: string, options: WebSearchExecutionOptions = {}): Promise<any> {
        if (!url) {
            throw new Error("URL is required for read actions");
        }
        const page = await fetchPage(url, this.config.allowed_domains, options.signal);

        return {
            action: "read",
            url,
            title: page.title,
            content: truncateText(page.content, resolveContentLimit(this.config.context_size)),
            status: "completed",
        };
    }

    private async findInPage(
        url?: string,
        pattern?: string,
        options: WebSearchExecutionOptions = {},
    ): Promise<any> {
        if (!url || !pattern) {
            throw new Error("URL and pattern are required for find_in_page actions");
        }

        const page = await fetchPage(url, this.config.allowed_domains, options.signal);
        const matches = findPatternMatches(page.content, pattern);

        return {
            action: "find_in_page",
            url,
            pattern,
            matches,
            count: matches.length,
        };
    }
}
