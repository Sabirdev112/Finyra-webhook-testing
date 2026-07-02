import http from "node:http";
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 3456);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const VERIFY_SIGNATURE = (process.env.VERIFY_SIGNATURE ?? "true") !== "false";
const WEBHOOK_PATH = "/webhooks/finyra";

function log(section, payload) {
  const time = new Date().toISOString();
  console.log(`\n[${time}] ${section}`);
  console.log(JSON.stringify(payload, null, 2));
}

function verifyFinyraSignature({ rawBody, timestamp, signatureHeader, secret }) {
  if (!secret) {
    return { ok: false, reason: "WEBHOOK_SECRET is not set in .env" };
  }

  if (!timestamp || !signatureHeader) {
    return { ok: false, reason: "Missing Finyra-Webhook-Timestamp or Finyra-Webhook-Signature" };
  }

  const received = String(signatureHeader).startsWith("v1=")
    ? String(signatureHeader).slice(3)
    : String(signatureHeader);

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex"),
    );
    return valid ? { ok: true } : { ok: false, reason: "Signature mismatch" };
  } catch {
    return { ok: false, reason: "Invalid signature format" };
  }
}

function readRawBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "finyra-webhook-test",
      webhookPath: WEBHOOK_PATH,
      verifySignature: VERIFY_SIGNATURE,
      secretConfigured: Boolean(WEBHOOK_SECRET),
    });
  }

  if (req.method === "POST" && req.url === WEBHOOK_PATH) {
    const rawBody = await readRawBody(req);
    const webhookId = req.headers["finyra-webhook-id"];
    const timestamp = req.headers["finyra-webhook-timestamp"];
    const signature = req.headers["finyra-webhook-signature"];

    let parsedBody = null;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = { _parseError: "Body is not valid JSON", rawPreview: rawBody.slice(0, 200) };
    }

    let verification = { ok: true, skipped: true };
    if (VERIFY_SIGNATURE) {
      verification = verifyFinyraSignature({
        rawBody,
        timestamp,
        signatureHeader: signature,
        secret: WEBHOOK_SECRET,
      });
    }

    log("WEBHOOK RECEIVED", {
      path: WEBHOOK_PATH,
      webhookId,
      timestamp,
      signaturePresent: Boolean(signature),
      verification,
      headers: {
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"],
      },
      body: parsedBody,
    });

    if (!verification.ok && !verification.skipped) {
      return sendJson(res, 401, {
        ok: false,
        error: verification.reason,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      received: true,
      eventId: parsedBody?.id ?? webhookId ?? null,
      eventType: parsedBody?.type ?? null,
    });
  }

  sendJson(res, 404, {
    ok: false,
    error: "Not found",
    hint: `POST ${WEBHOOK_PATH} or GET /health`,
  });
});

server.listen(PORT, () => {
  console.log("Finyra webhook test server running");
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Webhook: http://localhost:${PORT}${WEBHOOK_PATH}`);
  console.log(`  Verify signatures: ${VERIFY_SIGNATURE}`);
  console.log(`  Secret configured: ${Boolean(WEBHOOK_SECRET)}`);
  if (!WEBHOOK_SECRET) {
    console.log("\n  Copy .env.example to .env and set WEBHOOK_SECRET=whsec_...");
  }
  console.log("\nRegister the webhook URL in Partner dashboard -> Webhooks, then Send test.");
});
