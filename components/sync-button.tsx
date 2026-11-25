"use client";

import type { SourceType } from "@/lib/types";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function SyncButton({ sidebar = false, projectSlug, source, compact = false,backfillDays }: { sidebar?: boolean; projectSlug?: string; source?: SourceType; compact?: boolean;backfillDays?:number }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  async function startSync() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      window.dispatchEvent(new Event("openfindability:sync"));
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug, source,backfillDays }),
      });
      const payload = await response.json() as { error?: string; results?: Array<{ status: string }> };
      if (!response.ok && response.status !== 207) throw new Error(payload.error ?? "Sincronizzazione non riuscita.");
      const failures = payload.results?.filter((result) => result.status === "failed").length ?? 0;
      const partial = payload.results?.filter((result) => result.status === "partial").length ?? 0;
      const missing = payload.results?.filter((result) => result.status === "no_data").length ?? 0;
      setFeedback(failures || partial || missing
        ? `Sync terminata: ${failures} errori, ${partial} parziali, ${missing} senza nuovi dati. Controlla il registro.`
        : "Sync completata.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Errore di sincronizzazione.");
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event("openfindability:sync"));
    }
  }

  return (
    <div className={sidebar ? "w-full px-2" : "relative inline-flex flex-col gap-1"}>
      <button
        type="button"
        disabled={busy}
        onClick={startSync}
        className={sidebar
          ? "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-accent disabled:opacity-50"
          : compact ? "inline-flex size-9 items-center justify-center rounded-md border hover:bg-muted text-muted-foreground disabled:opacity-50" : "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        }
        aria-label={source?"Aggiorna fonte":projectSlug?"Aggiorna progetto":"Sincronizza tutti i progetti"}
        title={source?"Aggiorna fonte":projectSlug?"Aggiorna progetto":"Sincronizza tutti i progetti"}
      >
        <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
        {!compact&&<span>{busy ? "Sincronizzazione..." : source ? "Aggiorna fonte" : projectSlug ? "Aggiorna progetto" : "Sync manuale"}</span>}
      </button>
      {feedback && <p role="status" className={compact?"absolute right-0 top-full z-20 mt-1 w-64 rounded-md border bg-popover p-2 text-xs shadow":"mt-1 max-w-xs text-xs text-muted-foreground"}>{feedback}</p>}
    </div>
  );
}
