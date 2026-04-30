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

interface ApiKeySelection {
  value?: string;
  source: "x-api-key" | "authorization-bearer" | "authorization-raw" | "env" | "none";
}

function getAuthorizationApiKey(request: Request): ApiKeySelection {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return { source: "none" };

  const trimmed = authorization.trim();
  if (trimmed.startsWith("dk_")) {
    return { value: trimmed, source: "authorization-raw" };
  }

  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return { source: "none" };
  }

  return { value: token, source: "authorization-bearer" };
}

function getApiKey(request: Request, env: Env): ApiKeySelection {
  const headerApiKey = request.headers.get("X-API-Key");
  if (headerApiKey) return { value: headerApiKey, source: "x-api-key" };

  const authorizationApiKey = getAuthorizationApiKey(request);
  if (authorizationApiKey.value) return authorizationApiKey;

  if (env.DISPOSABLE_CHECK_API_KEY) {
    return { value: env.DISPOSABLE_CHECK_API_KEY, source: "env" };
  }

  return { source: "none" };
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

    const apiKey = getApiKey(request, env);
    const authorization = request.headers.get("Authorization");

    console.log(
      JSON.stringify({
        event: "disposable_check_mcp_auth",
        method: request.method,
        path: url.pathname,
        hasAuthorization: Boolean(authorization),
        authorizationLooksBearer:
          authorization?.trim().toLowerCase().startsWith("bearer ") ?? false,
        authorizationLooksRawApiKey:
          authorization?.trim().startsWith("dk_") ?? false,
        hasXApiKey: request.headers.has("X-API-Key"),
        hasEnvApiKey: Boolean(env.DISPOSABLE_CHECK_API_KEY),
        selectedApiKeySource: apiKey.source,
        selectedHasApiKey: Boolean(apiKey.value),
        userAgent: request.headers.get("User-Agent") ?? undefined,
      })
    );

    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = createDisposableCheckServer({
      baseUrl: env.DISPOSABLE_CHECK_BASE_URL ?? DEFAULT_BASE_URL,
      apiKey: apiKey.value,
      apiKeySource: apiKey.source,
      apiFetch: env.DISPOSABLE_CHECK_API?.fetch.bind(env.DISPOSABLE_CHECK_API),
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return withCors(response);
  },
};
