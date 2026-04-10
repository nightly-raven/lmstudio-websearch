const test = require("node:test");
const assert = require("node:assert/strict");

const { MinimalWebSearchTool } = require("../dist/webSearch.js");
const { toolsProvider } = require("../dist/toolsProvider.js");

const originalFetch = global.fetch;

test.afterEach(() => {
    global.fetch = originalFetch;
});

test("getToolSpec returns a live search spec", () => {
    const tool = new MinimalWebSearchTool({
        context_size: "high",
        allowed_domains: ["example.com"],
        location: {
            country: "US",
            city: "New York",
            timezone: "America/New_York",
        },
    });

    assert.deepEqual(tool.getToolSpec(), {
        type: "search",
        external_web_access: true,
        filters: {
            allowed_domains: ["example.com"],
        },
        user_location: {
            type: "approximate",
            country: "US",
            city: "New York",
            timezone: "America/New_York",
        },
        search_context_size: "high",
        search_content_types: ["text"],
    });
});

test("search parses DuckDuckGo HTML results", async () => {
    global.fetch = async () => new Response(`
        <html>
          <body>
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fsingleton">Singleton in Flutter</a>
            <div class="result__snippet">A simple singleton example in Flutter.</div>
          </body>
        </html>
    `, { status: 200 });

    const tool = new MinimalWebSearchTool({
        allowed_domains: ["example.com"],
    });

    const result = await tool.executeSearch({
        type: "search",
        query: "singleton pattern in flutter",
    }, {
        pageSize: 5,
    });

    assert.equal(result.action, "search");
    assert.equal(result.results.length, 1);
    assert.deepEqual(result.results[0].results[0], {
        title: "Singleton in Flutter",
        url: "https://example.com/singleton",
        snippet: "A simple singleton example in Flutter.",
    });
});

test("find_in_page searches full extracted page content", async () => {
    const content = "<html><head><title>Doc</title></head><body>"
        + `${"prefix ".repeat(900)}agent development kit suffix`
        + "</body></html>";

    global.fetch = async () => new Response(content, { status: 200 });

    const tool = new MinimalWebSearchTool();
    const result = await tool.executeSearch({
        type: "find_in_page",
        url: "https://example.com/doc",
        pattern: "agent development kit",
    });

    assert.equal(result.action, "find_in_page");
    assert.equal(result.count, 1);
    assert.match(result.matches[0], /agent development kit/i);
});

test("toolsProvider registers concrete LM Studio tools", async () => {
    global.fetch = async () => new Response(`
        <html><body>Agent Development Kit and singleton guidance.</body></html>
    `, { status: 200 });

    const ctl = createFakeController();
    const tools = await toolsProvider(ctl);

    assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        ["find_in_page", "read", "search", "today"],
    );

    const webSearchTool = tools.find((tool) => tool.name === "search");
    assert.ok(webSearchTool, "search tool should exist");

    const result = await webSearchTool.implementation({
        query: "agent development kit",
    }, createToolContext());

    assert.equal(result.action, "search");
    assert.equal(result.results.length, 1);
});

test("search accepts plain search calls without a type field", async () => {
    global.fetch = async () => new Response(`
        <html>
          <body>
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpolars">Polars batching</a>
            <div class="result__snippet">Batch size and memory notes.</div>
          </body>
        </html>
    `, { status: 200 });

    const ctl = createFakeController();
    const tools = await toolsProvider(ctl);

    const webSearchTool = tools.find((tool) => tool.name === "search");
    assert.ok(webSearchTool, "search tool should exist");

    const result = await webSearchTool.implementation({
        queries: [
            "polars lazyframe collect batch size low memory",
            "polars streaming read gcs batch size",
        ],
    }, createToolContext());

    assert.equal(result.action, "search");
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].results[0].title, "Polars batching");
});

test("today tool returns a date string", async () => {
    const ctl = createFakeController();
    const tools = await toolsProvider(ctl);
    const todayTool = tools.find((tool) => tool.name === "today");
    assert.ok(todayTool, "today tool should exist");

    const result = await todayTool.implementation({}, createToolContext());
    assert.match(result, /Today is/);
});

function createFakeController() {
    const values = new Map([
        ["contextSize", "medium"],
        ["allowedDomains", []],
        ["locationCountry", ""],
        ["locationRegion", ""],
        ["locationCity", ""],
        ["locationTimezone", ""],
        ["pageSize", 0],
        ["safeSearch", "auto"],
    ]);

    return {
        getPluginConfig() {
            return {
                get(key) {
                    return values.get(key);
                },
            };
        },
    };
}

function createToolContext() {
    return {
        status() { },
        warn() { },
        signal: new AbortController().signal,
    };
}
