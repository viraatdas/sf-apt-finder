import type { ScrapeProgressEvent } from "./types";

export function formatScrapeProgress(event: ScrapeProgressEvent): string {
  if (event.type === "start") return `starting ${event.city} scrape across ${event.sourceCount} sources`;
  if (event.type === "source:start") return `[${event.source}] starting`;
  if (event.type === "source:done") return `[${event.source}] done raw=${event.raw} ms=${event.ms}`;
  if (event.type === "source:error") return `[${event.source}] error ms=${event.ms}: ${event.error}`;
  if (event.type === "ingest:start") return `ingest starting raw=${event.raw}`;
  if (event.type === "ingest:done") {
    return `ingest done merged=${event.totalMerged} new=${event.newCount} updated=${event.updatedCount} unavailable=${event.unavailableCount}`;
  }
  return `done ${event.city} raw=${event.totalRaw} merged=${event.totalMerged} new=${event.newCount} updated=${event.updatedCount} unavailable=${event.unavailableCount}`;
}
