#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDisposableCheckServer } from "./server.js";

const BASE_URL =
  process.env.DISPOSABLE_CHECK_BASE_URL ??
  "https://disposablecheck.irensaltali.com/api";

const API_KEY = process.env.DISPOSABLE_CHECK_API_KEY ?? "";

async function main() {
  const server = createDisposableCheckServer({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `DisposableCheck MCP server running (base: ${BASE_URL}, key: ${API_KEY ? "set" : "not set"})`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
