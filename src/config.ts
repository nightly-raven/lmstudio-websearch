import { createConfigSchematics, InferParsedConfig } from "@lmstudio/sdk";
import type { SafeSearchSetting, SearchContextSize, WebSearchToolConfig } from "./webSearch";

export const configSchematics = createConfigSchematics()
    .field(
        "contextSize",
        "select",
        {
            displayName: "Search Context Size",
            subtitle: "Controls default search breadth and page extraction size",
            options: [
                { value: "low", displayName: "Low" },
                { value: "medium", displayName: "Medium" },
                { value: "high", displayName: "High" },
            ],
        },
        "medium",
    )
    .field(
        "allowedDomains",
        "stringArray",
        {
            displayName: "Allowed Domains",
            subtitle: "Optional hostname allowlist for search results and page fetches",
            maxNumItems: 25,
        },
        [],
    )
    .field(
        "locationCountry",
        "string",
        {
            displayName: "Location Country",
            placeholder: "US",
            maxLength: 32,
        },
        "",
    )
    .field(
        "locationRegion",
        "string",
        {
            displayName: "Location Region",
            placeholder: "CA",
            maxLength: 64,
        },
        "",
    )
    .field(
        "locationCity",
        "string",
        {
            displayName: "Location City",
            placeholder: "San Francisco",
            maxLength: 64,
        },
        "",
    )
    .field(
        "locationTimezone",
        "string",
        {
            displayName: "Location Timezone",
            placeholder: "America/Los_Angeles",
            maxLength: 64,
        },
        "",
    )
    .field(
        "pageSize",
        "numeric",
        {
            displayName: "Search Results Per Page",
            subtitle: "Between 1 and 10, 0 = use context-size defaults",
            min: 0,
            max: 10,
            int: true,
            slider: {
                step: 1,
                min: 1,
                max: 10,
            },
        },
        0,
    )
    .field(
        "safeSearch",
        "select",
        {
            displayName: "Safe Search",
            options: [
                { value: "strict", displayName: "Strict" },
                { value: "moderate", displayName: "Moderate" },
                { value: "off", displayName: "Off" },
                { value: "auto", displayName: "Auto" },
            ],
        },
        "auto",
    )
    .build();

export type WebSearchPluginConfig = InferParsedConfig<typeof configSchematics>;

export function resolveWebSearchToolConfig(config: WebSearchPluginConfig): WebSearchToolConfig {
    const location = {
        country: normalizeString(config.get("locationCountry")),
        region: normalizeString(config.get("locationRegion")),
        city: normalizeString(config.get("locationCity")),
        timezone: normalizeString(config.get("locationTimezone")),
    };

    return {
        context_size: config.get("contextSize") as SearchContextSize,
        allowed_domains: normalizeDomains(config.get("allowedDomains")),
        location: hasAnyLocationValue(location) ? location : undefined,
    };
}

export function resolveSearchRequestDefaults(config: WebSearchPluginConfig): {
    pageSize?: number;
    safeSearch?: SafeSearchSetting;
} {
    return {
        pageSize: config.get("pageSize") > 0 ? config.get("pageSize") : undefined,
        safeSearch: config.get("safeSearch") === "auto"
            ? undefined
            : config.get("safeSearch") as SafeSearchSetting,
    };
}

function normalizeDomains(domains: string[]): string[] {
    return domains
        .map((domain) => domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
        .filter(Boolean);
}

function normalizeString(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function hasAnyLocationValue(location: Record<string, string | undefined>): boolean {
    return Object.values(location).some(Boolean);
}
