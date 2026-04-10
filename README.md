# LM Studio Web Search Plugin

A TypeScript-based web search plugin for [LM Studio](https://lmstudio.ai/). This plugin enables local LLMs to access the live web, read page content, and perform pattern matching within web pages.

<p> <a href="https://ko-fi.com/nightlyraven" target="_blank"> <img src="https://ko-fi.com/img/githubbutton_sm.svg"/> </a> </p>

## Features

- **Live Web Search**: Query the web using DuckDuckGo (no API key required).
- **Page Reading**: Extract clean, readable text from any URL.
- **In-Page Search**: Find specific text or regex-style patterns within a web page.
- **Domain Filtering**: Restrict searches and page reads to specific allowed domains.
- **Configurable Context**: Adjust the amount of data returned to the model (low, medium, or high).
- **Today's Date**: Get the current local date and time.
- **Privacy Focused**: Operates locally as an LM Studio plugin.

## Tools Included

The plugin registers four main tools with LM Studio:

1.  **`search`**: Performs web searches. Supports single queries or batches of up to 5 queries.
2.  **`read`**: Opens a URL and extracts its text content, automatically stripping HTML tags, scripts, and styles.
3.  **`find_in_page`**: Searches for a specific pattern (string or regex) within a given URL and returns the surrounding context.
4.  **`today`**: Returns the current local date and time.

## Configuration

You can configure the following settings in LM Studio:

- **Search Context Size**: Controls the default search breadth and page extraction size (`low`, `medium`, `high`).
- **Allowed Domains**: An optional allowlist of domains for search results and page fetches.
- **Location Settings**: Set your country, region, city, and timezone to improve search relevance.
- **Search Results Per Page**: Customize the number of results returned (1-10).
- **Safe Search**: Set the safety level for search results (`strict`, `moderate`, `off`).

## Installation & Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [LM Studio](https://lmstudio.ai/) installed

### Setup

1.  Clone this repository to your local machine.
2.  Install dependencies:
    ```bash
    npm install
    ```

### Development Commands

- **Run in Development Mode**:
  ```bash
  npm run dev
  ```
  This uses `lms dev` to load the plugin into LM Studio for testing.

- **Build the Plugin**:
  ```bash
  npm run build
  ```
  Compiles the TypeScript source code into the `dist` directory.

- **Run Tests**:
  ```bash
  npm test
  ```
  Executes the test suite using the Node.js test runner.

## Technical Details

- **SDK**: Built with `@lmstudio/sdk` v1.5.0.
- **Language**: TypeScript.
- **Search Engine**: Utilizes DuckDuckGo's HTML interface with randomized User-Agents and rate limiting (2 seconds between requests) to ensure reliability.

## License

[MIT](LICENSE)
