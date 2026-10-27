const API = "https://api.github.com";
export type ReleaseRunner = { repository: string; ref: string; workflow: string; token: string };
export type WorkflowRun = { id: number; html_url: string; status: string; conclusion: string | null; display_title: string };

export function validateRepository(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error("Expected GitHub owner/repository.");
  return value;
}

export function releaseRunnerFromEnv(): ReleaseRunner {
  const repository = validateRepository(process.env.OPENFINDABILITY_RELEASE_RUNNER_REPO ?? "");
  const token = process.env.OPENFINDABILITY_RELEASE_RUNNER_TOKEN?.trim();
  if (!token) throw new Error("OPENFINDABILITY_RELEASE_RUNNER_TOKEN is missing (Actions:write on private runner only).");
  return { repository, token, ref: process.env.OPENFINDABILITY_RELEASE_RUNNER_REF || "main", workflow: "release-ios.yml" };
}

export class GitHubActionsClient {
  constructor(private runner: ReleaseRunner, private request: typeof fetch = fetch) { validateRepository(runner.repository); }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(`${API}/repos/${this.runner.repository}${path}`, {
      ...init, signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${this.runner.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`GitHub Actions API ${response.status} (${init.method ?? "GET"} ${path}).`);
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }

  async assertPrivate(): Promise<void> {
    const repo = await this.call<{ private: boolean }>("");
    if (!repo.private) throw new Error("Release runner repository must be private.");
  }

  async dispatch(inputs: Record<string, string>): Promise<{ workflow_run_id?: number; run_url?: string; html_url?: string } | undefined> {
    // No retry: an ambiguous timeout may already have created a run.
    return this.call(`/actions/workflows/${this.runner.workflow}/dispatches`, {
      method: "POST", body: JSON.stringify({ ref: this.runner.ref, inputs, return_run_details: true }),
    });
  }

  async runs(): Promise<WorkflowRun[]> {
    const result = await this.call<{ workflow_runs: WorkflowRun[] }>(`/actions/workflows/${this.runner.workflow}/runs?event=workflow_dispatch&per_page=100`);
    return result.workflow_runs;
  }
}
