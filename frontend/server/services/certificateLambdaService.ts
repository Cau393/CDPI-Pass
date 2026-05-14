import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const RETRY_INTERVAL_MS = 5_000;
const MAX_RETRY_MS = 45_000;

function isLambdaColdStartError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: string }).name) : "";
  const msg = err instanceof Error ? err.message : String(err);
  return (
    name === "CodeArtifactUserPendingException" ||
    /Lambda is initializing/i.test(msg)
  );
}

function buildLambdaClient(): LambdaClient {
  const region = process.env.AWS_REGION || "sa-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    return new LambdaClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return new LambdaClient({ region });
}

export interface GenerateCertificateLambdaRequest {
  templateS3Url: string;
  nomeCompleto: string;
  userId: string;
  eventId: string;
  outputBucket: string;
}

/**
 * Synchronously invokes the configured certificate Lambda (RequestResponse).
 * Retries on cold-start (CodeArtifactUserPendingException) every 5 s for up to 45 s.
 * Expects a Python-style API Gateway shape: { statusCode, body: JSON string with pdfUrl }.
 */
export async function invokeGenerateCertificatePdf(
  request: GenerateCertificateLambdaRequest,
): Promise<string> {
  const arn = process.env.AWS_LAMBDA_ARN?.trim();
  if (!arn) {
    throw new Error("AWS_LAMBDA_ARN is not configured");
  }

  const client = buildLambdaClient();
  const cmd = new InvokeCommand({
    FunctionName: arn,
    InvocationType: "RequestResponse",
    Payload: JSON.stringify(request),
  });

  const deadline = Date.now() + MAX_RETRY_MS;
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      const out = await client.send(cmd);

      if (out.FunctionError) {
        const errPayload = out.Payload ? Buffer.from(out.Payload).toString("utf-8") : "";
        throw new Error(`Lambda execution error (${out.FunctionError}): ${errPayload.slice(0, 2000)}`);
      }

      const raw = out.Payload ? Buffer.from(out.Payload).toString("utf-8") : "";
      if (!raw) {
        throw new Error("Lambda returned an empty payload");
      }

      let outer: { statusCode?: number; body?: string | Record<string, unknown>; pdfUrl?: string };
      try {
        outer = JSON.parse(raw) as typeof outer;
      } catch {
        throw new Error(`Invalid Lambda payload JSON: ${raw.slice(0, 500)}`);
      }

      let inner: { pdfUrl?: string; error?: string; message?: string } | undefined;

      if (typeof outer.body === "string") {
        try {
          inner = JSON.parse(outer.body) as typeof inner;
        } catch {
          throw new Error(`Lambda body is not JSON: ${outer.body.slice(0, 500)}`);
        }
      } else if (outer.body && typeof outer.body === "object") {
        inner = outer.body as typeof inner;
      }

      const pdfUrl =
        inner?.pdfUrl ??
        (typeof outer.pdfUrl === "string" ? outer.pdfUrl : undefined);

      const statusCode = outer.statusCode ?? 200;
      if (statusCode !== 200 || !pdfUrl) {
        const detail =
          inner?.error ??
          inner?.message ??
          (typeof outer.body === "string" ? outer.body : JSON.stringify(outer));
        throw new Error(`Certificate Lambda failed (status ${statusCode}): ${detail.slice(0, 1500)}`);
      }

      return pdfUrl;
    } catch (err) {
      if (isLambdaColdStartError(err) && Date.now() < deadline) {
        console.log(`Lambda cold-start (attempt ${attempt}), retrying in ${RETRY_INTERVAL_MS / 1000}s…`);
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
        continue;
      }
      throw err;
    }
  }
}
