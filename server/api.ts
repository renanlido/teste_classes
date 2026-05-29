import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Lane } from "../src/domain/lane/Lane.js";
import type { LaneController } from "../src/LaneController.js";
import type { EventBus } from "../src/integrations/EventBus.js";
import type { SseHub } from "./sse.js";
import type { FlowEvent } from "../src/domain/lane/events.js";

export interface ApiContext {
  laneId: string;
  controller: LaneController;
  lane: Lane;
  hub: SseHub;
  bus: EventBus;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createApiServer(ctx: ApiContext): Server {
  return createServer(async (req, res) => {
    const url = req.url ?? "";
    try {
      if (req.method === "GET" && url === "/api/snapshot") {
        sendJson(res, 200, ctx.lane.snapshot());
        return;
      }
      if (req.method === "GET" && url === "/api/stream") {
        ctx.hub.add(res);
        return;
      }
      if (req.method === "POST" && url === "/api/command") {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw) as { event: FlowEvent };
        ctx.bus.publish("command.received", { laneId: ctx.laneId, event: parsed.event });
        await ctx.controller.command(ctx.laneId, parsed.event);
        res.writeHead(204).end();
        return;
      }
      res.writeHead(404).end();
    } catch (e) {
      sendJson(res, 400, { error: e instanceof Error ? e.message : "bad request" });
    }
  });
}
