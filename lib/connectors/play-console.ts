import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { createId } from "@/lib/id";
import type { AppReview, MetricSnapshot, Project, SyncResult } from "@/lib/types";

export async function syncPlayConsoleProject(
  project: Project,
  startDate: string,
): Promise<{
  result: SyncResult;
  snapshots: MetricSnapshot[];
  reviews: AppReview[];
}> {
  if (!project.playConsolePackageName) {
    return skipped(project.id, "Project has no Play Console package name.");
  }

  const auth = await getAndroidAuth();
  if (!auth) {
    return skipped(project.id, "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE is not configured.");
  }

  const publisher = google.androidpublisher({ version: "v3", auth });
  const packageName = project.playConsolePackageName;
  const createdAt = new Date().toISOString();
  const startMs = new Date(startDate).getTime() / 1000;

  const reviews: AppReview[] = [];
  let pageToken: string | undefined;
  let done = false;

  do {
    const response = await publisher.reviews.list({
      packageName,
      maxResults: 100,
      ...(pageToken && { pageToken }),
    });

    const batch = response.data.reviews ?? [];

    for (const review of batch) {
      const userComment = review.comments?.[0]?.userComment;
      if (!userComment) continue;

      const lastModifiedSec = Number(userComment.lastModified?.seconds ?? 0);
      if (lastModifiedSec < startMs) {
        done = true;
        break;
      }

      const date = new Date(lastModifiedSec * 1000).toISOString().split("T")[0];

      reviews.push({
        id: createId("review"),
        projectId: project.id,
        reviewId: review.reviewId ?? createId("review"),
        date,
        rating: userComment.starRating ?? 0,
        text: userComment.text ?? undefined,
        language: userComment.reviewerLanguage ?? undefined,
        appVersionName: userComment.appVersionName ?? undefined,
        thumbsUp: userComment.thumbsUpCount ?? 0,
        rawJson: review,
        createdAt,
      });
    }

    pageToken = done || !response.data.tokenPagination?.nextPageToken
      ? undefined
      : response.data.tokenPagination.nextPageToken;
  } while (pageToken && !done);

  // One snapshot per day aggregating reviews for that day
  const byDate = new Map<string, number[]>();
  for (const review of reviews) {
    const ratings = byDate.get(review.date) ?? [];
    ratings.push(review.rating);
    byDate.set(review.date, ratings);
  }

  const snapshots: MetricSnapshot[] = Array.from(byDate.entries()).map(([date, ratings]) => ({
    id: createId("metric"),
    projectId: project.id,
    source: "play_console" as const,
    date,
    avgRating: parseFloat((ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(2)),
    totalReviews: ratings.length,
    createdAt,
  }));

  return {
    result: {
      source: "play_console",
      projectId: project.id,
      status: "success",
      message: `Imported ${reviews.length} Play Console reviews since ${startDate}.`,
      inserted: {
        snapshots: snapshots.length,
        queries: 0,
        pages: 0,
        reviews: reviews.length,
      },
    },
    snapshots,
    reviews,
  };
}

async function getAndroidAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();

  if (!json && !file) {
    return null;
  }

  const credentials = JSON.parse(json || (await readFile(file as string, "utf8")));

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "play_console" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0, reviews: 0 },
    },
    snapshots: [] as MetricSnapshot[],
    reviews: [] as AppReview[],
  };
}
