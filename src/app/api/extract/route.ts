import { extractRouted, type MediaType } from "@/lib/extract";

const ALLOWED = new Set<string>(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "missing file" }, { status: 400 });
  if (!ALLOWED.has(file.type))
    return Response.json({ error: `unsupported type ${file.type}` }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "file too large (max 10 MB)" }, { status: 413 });

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  return Response.json(await extractRouted(data, file.type as MediaType));
}
