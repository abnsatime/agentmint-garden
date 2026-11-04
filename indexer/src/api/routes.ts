import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "../db/client.js";
import {
  BadRequest,
  parseAddress,
  parseLimit,
  parsePositionCursor,
  parsePriceCursor,
  parseTokenCursor,
  parseTokenId,
} from "./params.js";
import { getToken, listActivity, listListings, listSales, listTokens } from "./repository.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/** Turns a BadRequest into a 400 that names the offending parameter. */
function guarding(handler: Handler): Handler {
  return async (request, reply) => {
    try {
      return await handler(request, reply);
    } catch (error) {
      if (error instanceof BadRequest) {
        reply.code(400);
        return { error: error.message, parameter: error.parameter };
      }
      throw error;
    }
  };
}

function query(request: FastifyRequest): Record<string, unknown> {
  return (request.query ?? {}) as Record<string, unknown>;
}

/**
 * Read endpoints. Everything is derived from the event tables, and every list is keyset
 * paginated: `next` carries the cursor for the following page, `null` means the end.
 */
export function registerApi(app: FastifyInstance, db: Database): void {
  app.get(
    "/tokens",
    guarding(async (request) => {
      const params = query(request);
      const limit = parseLimit(params.limit);
      const owner = parseAddress(params.owner);
      const before = parseTokenCursor(params.cursor);

      const items = await listTokens(db, { owner, limit, before });
      const last = items[items.length - 1];
      return { items, next: items.length === limit && last ? last.tokenId : null };
    }),
  );

  app.get(
    "/tokens/:tokenId",
    guarding(async (request, reply) => {
      const params = (request.params ?? {}) as { tokenId?: string };
      const tokenId = parseTokenId(params.tokenId);

      const detail = await getToken(db, tokenId);
      if (!detail) {
        reply.code(404);
        return { error: `token ${tokenId} is not indexed` };
      }
      return detail;
    }),
  );

  app.get(
    "/market/listings",
    guarding(async (request) => {
      const params = query(request);
      const limit = parseLimit(params.limit, { fallback: 100, max: 500 });
      const cursor = parsePriceCursor(params.cursor);

      const items = await listListings(db, { limit, cursor });
      const last = items[items.length - 1];
      return {
        items,
        next: items.length === limit && last ? `${last.priceWei}:${last.tokenId}` : null,
      };
    }),
  );

  app.get(
    "/market/sales",
    guarding(async (request) => {
      const params = query(request);
      const limit = parseLimit(params.limit);
      const cursor = parsePositionCursor(params.cursor);

      const items = await listSales(db, { limit, cursor });
      const last = items[items.length - 1];
      return {
        items,
        next:
          items.length === limit && last ? `${last.blockNumber}:${last.logIndex ?? 0}` : null,
      };
    }),
  );

  app.get(
    "/activity",
    guarding(async (request) => {
      const params = query(request);
      const owner = parseAddress(params.owner);
      if (!owner) throw new BadRequest("owner", "owner is required");

      const limit = parseLimit(params.limit);
      const cursor = parsePositionCursor(params.cursor);

      const items = await listActivity(db, { owner, limit, cursor });
      const last = items[items.length - 1];
      return {
        items,
        next: items.length === limit && last ? `${last.blockNumber}:${last.logIndex}` : null,
      };
    }),
  );
}
