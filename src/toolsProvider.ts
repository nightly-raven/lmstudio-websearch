import { rawFunctionTool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { configSchematics, resolveSearchRequestDefaults, resolveWebSearchToolConfig } from "./config";
import { MinimalWebSearchTool } from "./webSearch";

const TIME_BETWEEN_REQUESTS_MS = 2_000;
let lastRequestTimestamp = 0;

const webSearchParameters = z.object({
    query: z.string().optional(),
    queries: z.array(z.string()).min(1).max(5).optional(),
    pageSize: z.number().int().min(1).max(10).optional(),
    page: z.number().int().min(1).max(100).optional(),
    safeSearch: z.enum(["strict", "moderate", "off"]).optional(),
}).strict();

const openPageParameters = z.object({
    url: z.url(),
}).strict();

const findInPageParameters = z.object({
    url: z.url(),
    pattern: z.string(),
}).strict();

const todayParameters = z.object({}).strict();

export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
    const webSearchTool = rawFunctionTool({
        name: "search",
        description: [
            "Search the live web for relevant pages.",
            "Use this tool for search queries only.",
            "Provide either `query` or `queries`.",
        ].join(" "),
        parametersJsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
                query: {
                    type: "string",
                    description: "Single search query.",
                },
                queries: {
                    type: "array",
                    description: "Optional batch of search queries.",
                    minItems: 1,
                    maxItems: 5,
                    items: { type: "string" },
                },
                pageSize: {
                    type: "integer",
                    minimum: 1,
                    maximum: 10,
                    description: "Optional override for the number of search results to return.",
                },
                page: {
                    type: "integer",
                    minimum: 1,
                    maximum: 100,
                    description: "Optional search results page number.",
                },
                safeSearch: {
                    type: "string",
                    enum: ["strict", "moderate", "off"],
                    description: "Optional safe-search override.",
                },
            },
        },
        implementation: (rawParams, ctx) => executeSearchToolCall(rawParams, ctx, ctl),
    });

    const openPageTool = rawFunctionTool({
        name: "read",
        description: "Open a web page and extract readable text content from it.",
        parametersJsonSchema: {
            type: "object",
            additionalProperties: false,
            required: ["url"],
            properties: {
                url: {
                    type: "string",
                    format: "uri",
                    description: "URL to open.",
                },
            },
        },
        implementation: (rawParams, ctx) => executeOpenPageToolCall(rawParams, ctx, ctl),
    });

    const findInPageTool = rawFunctionTool({
        name: "find_in_page",
        description: "Open a web page and find text or regex-style matches inside it.",
        parametersJsonSchema: {
            type: "object",
            additionalProperties: false,
            required: ["url", "pattern"],
            properties: {
                url: {
                    type: "string",
                    format: "uri",
                    description: "URL to inspect.",
                },
                pattern: {
                    type: "string",
                    description: "Pattern to find in the page.",
                },
            },
        },
        implementation: (rawParams, ctx) => executeFindInPageToolCall(rawParams, ctx, ctl),
    });

    const todayTool = rawFunctionTool({
        name: "today",
        description: "Returns today's date and time.",
        parametersJsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {},
        },
        implementation: (rawParams, ctx) => executeTodayToolCall(rawParams, ctx),
    });

    return [webSearchTool, openPageTool, findInPageTool, todayTool];
}

async function executeSearchToolCall(
    rawParams: Record<string, unknown>,
    { status, warn, signal }: ToolCallRuntime,
    ctl: ToolsProviderController,
) {
    const parsedParams = webSearchParameters.safeParse(rawParams);
    if (!parsedParams.success) {
        return `Error: Failed to parse arguments for tool "search": ${parsedParams.error.message}`;
    }

    status("Preparing search request...");
    await waitIfNeeded();

    try {
        const pluginConfig = ctl.getPluginConfig(configSchematics);
        const defaults = resolveSearchRequestDefaults(pluginConfig);
        const webSearch = new MinimalWebSearchTool(resolveWebSearchToolConfig(pluginConfig));

        const result = await webSearch.executeSearch(
            {
                type: "search",
                query: parsedParams.data.query,
                queries: parsedParams.data.queries,
            },
            {
                signal,
                pageSize: parsedParams.data.pageSize ?? defaults.pageSize,
                page: parsedParams.data.page,
                safeSearch: parsedParams.data.safeSearch ?? defaults.safeSearch,
            },
        );

        status("Completed search request.");
        return result;
    } catch (error) {
        return handleExecutionError(error, "search", warn);
    }
}

async function executeOpenPageToolCall(
    rawParams: Record<string, unknown>,
    { status, warn, signal }: ToolCallRuntime,
    ctl: ToolsProviderController,
) {
    const parsedParams = openPageParameters.safeParse(rawParams);
    if (!parsedParams.success) {
        return `Error: Failed to parse arguments for tool "read": ${parsedParams.error.message}`;
    }

    status("Preparing read request...");
    await waitIfNeeded();

    try {
        const pluginConfig = ctl.getPluginConfig(configSchematics);
        const webSearch = new MinimalWebSearchTool(resolveWebSearchToolConfig(pluginConfig));
        const result = await webSearch.executeSearch(
            {
                type: "read",
                url: parsedParams.data.url,
            },
            { signal },
        );

        status("Completed read request.");
        return result;
    } catch (error) {
        return handleExecutionError(error, "read", warn);
    }
}

async function executeFindInPageToolCall(
    rawParams: Record<string, unknown>,
    { status, warn, signal }: ToolCallRuntime,
    ctl: ToolsProviderController,
) {
    const parsedParams = findInPageParameters.safeParse(rawParams);
    if (!parsedParams.success) {
        return `Error: Failed to parse arguments for tool "find_in_page": ${parsedParams.error.message}`;
    }

    status("Preparing find_in_page request...");
    await waitIfNeeded();

    try {
        const pluginConfig = ctl.getPluginConfig(configSchematics);
        const webSearch = new MinimalWebSearchTool(resolveWebSearchToolConfig(pluginConfig));
        const result = await webSearch.executeSearch(
            {
                type: "find_in_page",
                url: parsedParams.data.url,
                pattern: parsedParams.data.pattern,
            },
            { signal },
        );

        status("Completed find_in_page request.");
        return result;
    } catch (error) {
        return handleExecutionError(error, "find_in_page", warn);
    }
}

async function executeTodayToolCall(
    rawParams: Record<string, unknown>,
    { status }: ToolCallRuntime,
) {
    const parsedParams = todayParameters.safeParse(rawParams);
    if (!parsedParams.success) {
        return `Error: Failed to parse arguments for tool "today": ${parsedParams.error.message}`;
    }

    status("Getting today's date...");
    const now = new Date();
    return `Today is ${now.toLocaleDateString()} ${now.toLocaleTimeString()}.`;
}

function handleExecutionError(
    error: unknown,
    operation: "search" | "read" | "find_in_page",
    warn: (text: string) => void,
) {
    if (error instanceof DOMException && error.name === "AbortError") {
        return `${operation} request aborted by user.`;
    }

    const message = error instanceof Error ? error.message : String(error);
    warn(message);
    return `Error: ${message}`;
}

async function waitIfNeeded() {
    const timestamp = Date.now();
    const difference = timestamp - lastRequestTimestamp;
    lastRequestTimestamp = timestamp;

    if (difference < TIME_BETWEEN_REQUESTS_MS) {
        await new Promise((resolve) => setTimeout(resolve, TIME_BETWEEN_REQUESTS_MS - difference));
    }
}

type ToolCallRuntime = {
    status: (text: string) => void;
    warn: (text: string) => void;
    signal: AbortSignal;
};
