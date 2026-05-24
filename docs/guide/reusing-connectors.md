# Reusing the APIs in other repositories

OpenFindability currently uses two external data sources:

```txt
Google Search Console API
Umami API
```

The reusable code lives in:

```txt
lib/connectors/gsc.ts
lib/connectors/umami.ts
lib/sync.ts
lib/types.ts
```

## Recommended reuse pattern

For another repo, do not copy `.env`, `data/`, `secrets/` or private reports.

Copy only:

```txt
lib/connectors/gsc.ts
lib/connectors/umami.ts
lib/dates.ts
lib/id.ts
lib/types.ts
```

Then adapt the output storage to that repo.

## Required env vars

Google Search Console:

```env
GOOGLE_SERVICE_ACCOUNT_FILE=./secrets/google/search-console-service-account.json
```

or:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={...}
```

Umami:

```env
UMAMI_BASE_URL=https://api.umami.is/v1
UMAMI_API_KEY=your-api-key
```

## Google Search Console requirements

The service account must be added as a user in Search Console for every property you want to query.

Example properties:

```txt
sc-domain:example.com
https://www.example.com/
```

Use a domain property when you want subdomains included.

Use URL-prefix properties when you need tighter alignment with analytics tools.

## Umami requirements

You need the Umami website ID for each tracked site.

If one GSC domain property includes multiple subdomains, prefer separate Umami website IDs:

```txt
example.com
app.example.com
blog.example.com
```

This avoids comparing a broad GSC domain property with a narrow analytics property.

## Minimal script shape

```ts
import "dotenv/config";
import { syncGscProject } from "./lib/connectors/gsc";
import { syncUmamiProject } from "./lib/connectors/umami";

const project = {
  id: "project_example",
  name: "Example",
  slug: "example",
  type: "web" as const,
  websiteUrl: "https://example.com",
  gscProperty: "sc-domain:example.com",
  umamiWebsiteId: "your-umami-website-id",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const gsc = await syncGscProject(project, "2026-04-24", "2026-05-22");
const umami = await syncUmamiProject(project, "2026-05-22");

console.log(gsc.result);
console.log(umami.result);
```

## Notes

- Keep secrets under `secrets/`.
- Ignore runtime data and reports.
- Preserve raw API payloads when storing imports.
- Keep GSC page metrics separate from query metrics.
- When comparing GSC and Umami, always verify whether both sources cover the same domain/subdomain surface.
