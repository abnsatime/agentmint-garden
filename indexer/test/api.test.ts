import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import { gardenMints, marketEvents, nftTransfers, syncCursors } from "../src/db/schema.js";
import { buildServer } from "../src/server/app.js";
import { commitWindow } from "../src/sync/writer.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

const OWNER = "0xF040275C3e38Cb018C491BC8A5A5437D86178A67";
const OTHER = "0x9d37af653d523ddBcA1113ED44AC7590b0986020";
const ZERO = "0x0000000000000000000000000000000000000000";
const AT = new Date("2026-11-04T00:00:00.000Z");

function mint(tokenId: bigint, block: bigint) {
  return {
    tokenId,
    minter: OWNER,
    freeMint: true,
    pricePaidWei: "0",
    blockNumber: block,
    logIndex: 0,
    txHash: `0x${tokenId.toString(16).padStart(4, "0")}`,
    blockTime: AT,
  };
}

function transfer(tokenId: bigint, from: string, to: string, block: bigint, logIndex = 1) {
  return {
    tokenId,
    fromAddress: from,
    toAddress: to,
    blockNumber: block,
    logIndex,
    txHash: `0x${block.toString(16).padStart(8, "0")}`,
    blockTime: AT,
  };
}

function market(
  kind: string,
  tokenId: bigint,
  seller: string,
  block: bigint,
  priceWei: string | null,
  buyer: string | null = null,
) {
  return {
    kind,
    tokenId,
    seller,
    buyer,
    priceWei,
    blockNumber: block,
    logIndex: 0,
    txHash: `0x${block.toString(16).padStart(8, "0")}`,
    blockTime: AT,
  };
}

describeDb("read api", () => {
  const { db, pool } = createDb(databaseUrl as string);
  const app = buildServer({
    health: async () => {
      throw new Error("not used in these tests");
    },
    api: { db },
    logLevel: "silent",
  });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  beforeEach(async () => {
    await db.delete(gardenMints);
    await db.delete(nftTransfers);
    await db.delete(marketEvents);
    await db.delete(syncCursors);

    // Tokens 1-5 minted by OWNER; 1 sold to OTHER, 2 moved to OTHER, 4 and 5 still listed.
    await commitWindow(db, {
      chainId: 97,
      stream: "garden",
      lastBlock: 500n,
      events: {
        mints: [mint(1n, 100n), mint(2n, 101n), mint(3n, 102n), mint(4n, 103n), mint(5n, 104n)],
        transfers: [
          transfer(1n, ZERO, OWNER, 100n),
          transfer(2n, ZERO, OWNER, 101n),
          transfer(3n, ZERO, OWNER, 102n),
          transfer(4n, ZERO, OWNER, 103n),
          transfer(5n, ZERO, OWNER, 104n),
          transfer(1n, OWNER, OTHER, 300n),
          transfer(2n, OWNER, OTHER, 400n),
        ],
        market: [],
      },
    });

    await commitWindow(db, {
      chainId: 97,
      stream: "market",
      lastBlock: 500n,
      events: {
        mints: [],
        transfers: [],
        market: [
          market("listed", 1n, OWNER, 200n, "1000"),
          market("sold", 1n, OWNER, 300n, "1000", OTHER),
          market("listed", 2n, OWNER, 210n, "2000"),
          market("listed", 3n, OWNER, 220n, "500"),
          market("cancelled", 3n, OWNER, 230n, null),
          market("listed", 4n, OWNER, 240n, "700"),
          market("listed", 5n, OWNER, 250n, "600"),
        ],
      },
    });
  });

  afterAll(async () => {
    await db.delete(gardenMints);
    await db.delete(nftTransfers);
    await db.delete(marketEvents);
    await db.delete(syncCursors);
    await app.close();
    await pool.end();
  });

  async function get(url: string) {
    const response = await app.inject({ method: "GET", url });
    return { status: response.statusCode, body: response.json() as Record<string, unknown> };
  }

  describe("GET /tokens", () => {
    it("lists every token newest first with its current owner", async () => {
      const { status, body } = await get("/tokens");
      expect(status).toBe(200);

      const items = body.items as Array<{ tokenId: string; owner: string }>;
      expect(items.map((item) => item.tokenId)).toEqual(["5", "4", "3", "2", "1"]);
      expect(items.find((item) => item.tokenId === "1")?.owner).toBe(OTHER);
      expect(items.find((item) => item.tokenId === "5")?.owner).toBe(OWNER);
    });

    it("includes the mint", async () => {
      const { body } = await get("/tokens?limit=1");
      const items = body.items as Array<Record<string, unknown>>;
      expect(items[0]).toMatchObject({ tokenId: "5", mintedBy: OWNER, freeMint: true });
      expect(items[0]?.mintedAt).toBe(AT.toISOString());
    });

    it("filters by owner", async () => {
      const { body } = await get(`/tokens?owner=${OTHER.toLowerCase()}`);
      const ids = (body.items as Array<{ tokenId: string }>).map((item) => item.tokenId);
      expect(ids).toEqual(["2", "1"]);
    });

    it("paginates with the cursor", async () => {
      const first = await get("/tokens?limit=2");
      const firstIds = (first.body.items as Array<{ tokenId: string }>).map((item) => item.tokenId);
      expect(firstIds).toEqual(["5", "4"]);
      expect(first.body.next).toBe("4");

      const second = await get(`/tokens?limit=2&cursor=${first.body.next}`);
      const secondIds = (second.body.items as Array<{ tokenId: string }>).map((item) => item.tokenId);
      expect(secondIds).toEqual(["3", "2"]);
    });

    it("rejects a bad limit", async () => {
      const { status, body } = await get("/tokens?limit=0");
      expect(status).toBe(400);
      expect(body.parameter).toBe("limit");
    });

    it("rejects a bad owner", async () => {
      const { status } = await get("/tokens?owner=0x1234");
      expect(status).toBe(400);
    });
  });

  describe("GET /tokens/:tokenId", () => {
    it("returns the token with its history and no listing once sold", async () => {
      const { status, body } = await get("/tokens/1");
      expect(status).toBe(200);

      expect(body).toMatchObject({ tokenId: "1", owner: OTHER });
      expect(body.mint).toMatchObject({ minter: OWNER, freeMint: true });
      expect((body.transfers as unknown[]).length).toBe(2);
      // The newest market event for token 1 is the sale, so it is not listed any more.
      expect(body.listing).toBeNull();
    });

    it("shows a live listing while the seller still owns the token", async () => {
      const { body } = await get("/tokens/4");
      expect(body.listing).toMatchObject({ seller: OWNER, priceWei: "700", live: true });
    });

    it("marks a stale listing as not live", async () => {
      const { body } = await get("/tokens/2");
      expect(body.listing).toMatchObject({ seller: OWNER, live: false });
    });

    it("has no listing for a cancelled one", async () => {
      const { body } = await get("/tokens/3");
      expect(body.listing).toBeNull();
    });

    it("answers 404 for an unknown token", async () => {
      const { status, body } = await get("/tokens/999");
      expect(status).toBe(404);
      expect(String(body.error)).toContain("999");
    });

    it("rejects a non-numeric id", async () => {
      const { status } = await get("/tokens/abc");
      expect(status).toBe(400);
    });
  });

  describe("GET /market/listings", () => {
    it("returns live listings only, cheapest first", async () => {
      const { status, body } = await get("/market/listings");
      expect(status).toBe(200);

      const items = body.items as Array<{ tokenId: string; priceWei: string }>;
      // 1 sold, 2 moved away (stale), 3 cancelled.
      expect(items.map((item) => item.tokenId)).toEqual(["5", "4"]);
      expect(items.map((item) => item.priceWei)).toEqual(["600", "700"]);
    });

    it("paginates by price", async () => {
      const first = await get("/market/listings?limit=1");
      expect((first.body.items as Array<{ tokenId: string }>)[0]?.tokenId).toBe("5");
      expect(first.body.next).toBe("600:5");

      const second = await get(`/market/listings?limit=1&cursor=${first.body.next}`);
      expect((second.body.items as Array<{ tokenId: string }>)[0]?.tokenId).toBe("4");
    });

    it("rejects a malformed cursor", async () => {
      const { status } = await get("/market/listings?cursor=600");
      expect(status).toBe(400);
    });
  });

  describe("GET /market/sales", () => {
    it("returns sales newest first", async () => {
      const { status, body } = await get("/market/sales");
      expect(status).toBe(200);

      const items = body.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        tokenId: "1",
        seller: OWNER,
        buyer: OTHER,
        priceWei: "1000",
        blockNumber: "300",
      });
    });
  });

  describe("GET /activity", () => {
    it("returns transfers in and out, newest first", async () => {
      const { status, body } = await get(`/activity?owner=${OWNER}`);
      expect(status).toBe(200);

      const items = body.items as Array<{ direction: string; tokenId: string }>;
      expect(items[0]).toMatchObject({ direction: "out", tokenId: "2" });
      expect(items[1]).toMatchObject({ direction: "out", tokenId: "1" });
      expect(items.some((item) => item.direction === "in")).toBe(true);
    });

    it("paginates with a position cursor", async () => {
      const first = await get(`/activity?owner=${OWNER}&limit=2`);
      expect((first.body.items as unknown[]).length).toBe(2);
      // The cursor is the position of the last row returned, so the next page continues below it.
      expect(first.body.next).toBe("300:1");

      const second = await get(`/activity?owner=${OWNER}&limit=2&cursor=${first.body.next}`);
      const items = second.body.items as Array<{ blockNumber: string }>;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => Number(item.blockNumber) <= 300)).toBe(true);
    });

    it("requires an owner", async () => {
      const { status, body } = await get("/activity");
      expect(status).toBe(400);
      expect(body.parameter).toBe("owner");
    });
  });
});
