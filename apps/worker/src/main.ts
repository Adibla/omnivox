import { createServer } from "node:http";
import { URL } from "node:url";
import { getWorkerDbPool } from "./queue/db";
import { startPipelineWorker } from "./queue/worker";

const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 4010);

function logInfo(event: string, payload: Record<string, unknown> = {}) {
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      at: new Date().toISOString(),
      event,
      payload,
    })}\n`,
  );
}

async function isReady() {
  try {
    await getWorkerDbPool().query("select 1");
    return true;
  } catch {
    return false;
  }
}

function createHealthServer() {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://localhost");

    if (method !== "GET") {
      response.writeHead(405, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
      return;
    }

    if (url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          service: "omnivox-worker",
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    if (url.pathname === "/ready") {
      const ready = await isReady();
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: ready,
          service: "omnivox-worker",
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "not_found" }));
  });
}

async function main() {
  const worker = startPipelineWorker();
  await worker.waitUntilReady();
  logInfo("worker.started");

  const healthServer = createHealthServer();
  healthServer.listen(HEALTH_PORT, () => {
    logInfo("worker.health.listening", { port: HEALTH_PORT });
  });
}

void main();
