"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function SyncButton({ sidebar = false }: { sidebar?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  async function startSync() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
    }
  }

  return (
    <div className={sidebar ? "w-full px-2" : "inline-flex flex-col gap-1"}>
      <button
        type="button"
        disabled={busy}
        onClick={startSync}
        className={sidebar
          ? "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-accent disabled:opacity-50"
          : "inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        }
        title="Avvia sincronizzazione manuale (solo localhost)"
      >
        <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
        <span>{busy ? "Sincronizzazione..." : "Sync manuale"}</span>
      </button>
      {feedback && <p role="status" className="mt-1 max-w-xs text-xs text-muted-foreground">{feedback}</p>}
    </div>
  );
}
