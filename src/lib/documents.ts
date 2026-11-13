import "server-only";
import { extractRouted, type MediaType } from "@/lib/extract";
import { limitError } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";

const EXT: Record<MediaType, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 10 * 1024 * 1024;

// Stores the file, runs routed extraction and records the result for the signed-in user.
export async function processUpload(file: unknown) {
  if (!(file instanceof File) || !file.size) return { error: "missing file", httpStatus: 400 } as const;
  const mediaType = file.type as MediaType;
  if (!(mediaType in EXT)) return { error: `unsupported type ${file.type}`, httpStatus: 415 } as const;
  if (file.size > MAX_BYTES) return { error: "file too large (max 10 MB)", httpStatus: 413 } as const;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: "not signed in", httpStatus: 401 } as const;

  const { data: recent, error: recentError } = await supabase
    .from("documents")
    .select("created_at, cost_usd")
    .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
  if (recentError) return { error: recentError.message, httpStatus: 500 } as const;
  const limit = limitError(recent);
  if (limit) return { error: limit, httpStatus: 429 } as const;

  const id = crypto.randomUUID();
  const path = `${auth.claims.sub}/${id}.${EXT[mediaType]}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = await supabase.storage.from("documents").upload(path, bytes, { contentType: mediaType });
  if (upload.error) return { error: upload.error.message, httpStatus: 500 } as const;

  const result = await extractRouted(bytes.toString("base64"), mediaType);
  const { error } = await supabase.from("documents").insert({
    id,
    file_path: path,
    media_type: mediaType,
    status: result.status,
    review_reason: result.review_reason,
    extraction: result.invoice,
    issues: result.issues,
    attempts: result.attempts,
    cost_usd: result.costUsd,
  });
  // One JSON line per extraction: cost log readable in Vercel runtime logs.
  console.log(
    JSON.stringify({
      event: "extraction",
      user: auth.claims.sub,
      document: id,
      status: result.status,
      cost_usd: result.costUsd,
      attempts: result.attempts.map(({ model, costUsd, ms }) => ({ model, cost_usd: costUsd, ms })),
      saved: !error,
    }),
  );
  if (error) return { error: error.message, httpStatus: 500 } as const;
  return { id, ...result };
}
