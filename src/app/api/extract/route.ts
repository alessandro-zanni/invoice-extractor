import { processUpload } from "@/lib/documents";

export async function POST(req: Request) {
  const result = await processUpload((await req.formData()).get("file"));
  return "error" in result ? Response.json({ error: result.error }, { status: result.httpStatus }) : Response.json(result);
}
