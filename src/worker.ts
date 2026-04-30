import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createDisposableCheckServer } from "./server.js";

interface Env {
  DISPOSABLE_CHECK_BASE_URL?: string;
  DISPOSABLE_CHECK_API_KEY?: string;
  DISPOSABLE_CHECK_API?: {
    fetch: typeof fetch;
  };
}

const DEFAULT_BASE_URL = "https://disposablecheck.irensaltali.com/api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-API-Key, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return undefined;

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;

  return token;
}

function getApiKey(request: Request, env: Env): string | undefined {
  return (
    request.headers.get("X-API-Key") ??
    getBearerToken(request) ??
    env.DISPOSABLE_CHECK_API_KEY
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") {
      return withCors(
        Response.json(
          { error: "Not found", message: "DisposableCheck MCP endpoint is /mcp" },
          { status: 404 }
        )
      );
    }

    if (request.method !== "POST") {
      return withCors(
        Response.json(
          {
            error: "Method not allowed",
            message: "This MCP endpoint supports stateless Streamable HTTP over POST.",
          },
          {
            status: 405,
            headers: {
              Allow: "POST, OPTIONS",
            },
          }
        )
      );
    }

    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = createDisposableCheckServer({
      baseUrl: env.DISPOSABLE_CHECK_BASE_URL ?? DEFAULT_BASE_URL,
      apiKey: getApiKey(request, env),
      apiFetch: env.DISPOSABLE_CHECK_API?.fetch.bind(env.DISPOSABLE_CHECK_API),
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return withCors(response);
  },
};
