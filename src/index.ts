import { PluginContext } from "@lmstudio/sdk";
import { toolsProvider } from "./toolsProvider";
import { configSchematics } from "./config";

export {
    MinimalWebSearchTool,
    type SafeSearchSetting,
    type SearchContextSize,
    type WebSearchAction,
    type WebSearchExecutionOptions,
    type WebSearchToolConfig,
    type WebSearchToolSpec,
} from "./webSearch";

export async function main(context: PluginContext) {
    // Register the tools provider
    context.withConfigSchematics(configSchematics);
    context.withToolsProvider(toolsProvider);
}
