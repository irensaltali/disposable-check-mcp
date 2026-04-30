import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { z } from "zod";

export interface DisposableCheckConfig {
  baseUrl: string;
  apiKey?: string;
  apiFetch?: typeof fetch;
}

async function apiRequest<T>(
  config: DisposableCheckConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }

  const apiFetch = config.apiFetch ?? fetch;
  const response = await apiFetch(url, { ...options, headers });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `API returned non-JSON response ${response.status}: ${text.slice(0, 120)}`
    );
  }

  if (!response.ok) {
    const err = body as { error?: string; code?: string };
    throw new Error(
      `API error ${response.status}: ${err.error ?? JSON.stringify(body)}`
    );
  }

  return body as T;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
  };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

interface MxRecord {
  exchange: string;
  priority: number;
}

interface ReacherResult {
  is_reachable: "safe" | "risky" | "invalid" | "unknown";
  misc: { is_disposable: boolean; is_role_account: boolean };
  mx: { accepts_mail: boolean; records: MxRecord[] };
  smtp: {
    can_connect_smtp: boolean;
    has_full_inbox: boolean;
    is_catch_all: boolean;
    is_deliverable: boolean;
    is_disabled: boolean;
  };
  syntax: { is_valid_syntax: boolean; username: string; domain: string };
}

interface CheckEmailResponse {
  email: string;
  domain: string;
  is_disposable: boolean;
  is_valid_format: boolean;
  checked_at: string;
  reacher: ReacherResult | null;
}

interface KeyInfoResponse {
  exists: boolean;
  daily_limit: number;
  requests_today: number;
  created_at: string;
}

interface StatsResponse {
  total_emails_checked: number;
  total_disposable_domains: number;
  community_reports: number;
}

interface ReportDomainResponse {
  success: boolean;
  message: string;
}

export function createDisposableCheckServer(config: DisposableCheckConfig) {
  const server = new McpServer(
    {
      name: "disposable-check",
      version: "1.0.0",
    },
    {
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    }
  );

  server.registerTool(
    "check_email",
    {
      description:
        "Check whether an email address belongs to a known disposable / temporary email provider. " +
        "Returns is_disposable, format validity, and optionally deep MX/SMTP verification results.",
      inputSchema: {
        email: z
          .string()
          .describe("The email address to check, e.g. user@tempmail.com"),
        check_reachable: z
          .boolean()
          .optional()
          .describe(
            "When true, performs a live MX + SMTP probe for deeper verification (adds ~1-3 s latency). " +
              "Use sparingly; counts toward your daily quota."
          ),
      },
    },
    async ({ email, check_reachable }) => {
      const params = new URLSearchParams({ email });
      if (check_reachable) params.set("check_reachable", "true");

      const result = await apiRequest<CheckEmailResponse>(
        config,
        `/v1/check?${params.toString()}`
      );

      const verdict = result.is_disposable
        ? "DISPOSABLE - this domain is a known temporary/throwaway email provider."
        : "NOT DISPOSABLE - this domain is not on the blocklist.";

      const formatLine = result.is_valid_format
        ? "Format: valid"
        : "Format: INVALID (malformed email address)";

      let reacherSummary = "";
      if (result.reacher) {
        const r = result.reacher;
        reacherSummary = [
          "",
          "-- Deep verification (Reacher) --",
          `Reachability:   ${r.is_reachable}`,
          `Accepts mail:   ${r.mx.accepts_mail}`,
          `Deliverable:    ${r.smtp.is_deliverable}`,
          `Catch-all:      ${r.smtp.is_catch_all}`,
          `Role account:   ${r.misc.is_role_account}`,
          `Reacher disp.:  ${r.misc.is_disposable}`,
        ].join("\n");
      }

      const summary = [
        `Email:   ${result.email}`,
        `Domain:  ${result.domain}`,
        verdict,
        formatLine,
        `Checked: ${result.checked_at}`,
        reacherSummary,
        "",
        "-- Raw JSON --",
        formatJson(result),
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
      };
    }
  );

  server.registerTool(
    "get_key_info",
    {
      description:
        "Retrieve usage information for a DisposableCheck API key by the email address it was registered with.",
      inputSchema: {
        email: z
          .string()
          .describe("The email address associated with the API key"),
      },
    },
    async ({ email }) => {
      const result = await apiRequest<KeyInfoResponse>(
        config,
        `/v1/keys/${encodeURIComponent(email)}`
      );

      const remaining = result.daily_limit - result.requests_today;
      const usedPercent = Math.round(
        (result.requests_today / result.daily_limit) * 100
      );

      const text = [
        `Email:          ${email}`,
        `Daily limit:    ${result.daily_limit.toLocaleString()}`,
        `Used today:     ${result.requests_today.toLocaleString()} (${usedPercent}%)`,
        `Remaining:      ${remaining.toLocaleString()}`,
        `Key created:    ${result.created_at}`,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );

  server.registerTool(
    "get_stats",
    {
      description:
        "Get DisposableCheck platform statistics: total checks, tracked disposable domains, and community reports.",
      inputSchema: {},
    },
    async () => {
      const result = await apiRequest<StatsResponse>(config, "/v1/stats");

      const text = [
        `Total emails checked:       ${result.total_emails_checked.toLocaleString()}`,
        `Disposable domains tracked: ${result.total_disposable_domains.toLocaleString()}`,
        `Community reports:          ${result.community_reports.toLocaleString()}`,
        "",
        "Raw JSON:",
        formatJson(result),
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );

  server.registerTool(
    "report_domain",
    {
      description:
        "Report a domain that should be classified as disposable. Reports are reviewed by admins.",
      inputSchema: {
        domain: z
          .string()
          .min(3)
          .max(253)
          .regex(
            /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i,
            "Invalid domain format"
          )
          .describe("Domain to report, e.g. tempmail.example"),
        reason: z
          .string()
          .optional()
          .describe("Optional context explaining why this domain is disposable"),
      },
    },
    async ({ domain, reason }) => {
      const result = await apiRequest<ReportDomainResponse>(
        config,
        "/v1/report",
        jsonBody({ domain, reason })
      );

      return {
        content: [{ type: "text", text: result.message }],
      };
    }
  );

  return server;
}
