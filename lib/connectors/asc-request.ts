const API = "https://api.appstoreconnect.apple.com/v1/";

export function ascUrl(path: string): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, API);
  if (url.origin !== new URL(API).origin || !url.pathname.startsWith("/v1/") || url.username || url.password) {
    throw new Error("App Store Connect rejected an unexpected API/pagination URL.");
  }
  return url;
}

function networkDetail(error: unknown): string {
  const failure = error as { name?: string; cause?: { code?: string } };
  const code = failure?.cause?.code;
  if (code === "EACCES" || code === "EPERM") return `${code}: network access denied by the environment; allow this read request outside the sandbox or check the firewall.`;
  if (failure?.name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT") return "timeout: check network reachability and retry read operations only.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `${code}: DNS resolution failed.`;
  if (code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" || code === "SELF_SIGNED_CERT_IN_CHAIN") return `${code}: check the trusted system CA/proxy configuration; keep TLS verification enabled.`;
  return "network connection failed; verify network access and proxy settings.";
}

/** No automatic retries: the same client is used for metadata writes. */
export async function requestAscJson<T>(path: string, token: string, init: RequestInit = {}, request: typeof fetch = fetch): Promise<T> {
  const url = ascUrl(path);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const timeout = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await request(url, { ...init, headers, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  } catch (error) {
    // Never print the token, URL query or arbitrary underlying error message.
    throw new Error(`App Store Connect ${init.method ?? "GET"} ${url.pathname}: ${networkDetail(error)}`);
  }
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const hint = response.status === 401 ? " Check API key, issuer and system clock." : response.status === 403 ? " Check the API key role and app access." : "";
    throw new Error(`App Store Connect API ${response.status} on ${url.pathname}.${hint}`);
  }
  try { return await response.json() as T; }
  catch { throw new Error(`App Store Connect returned invalid JSON on ${url.pathname}.`); }
}
