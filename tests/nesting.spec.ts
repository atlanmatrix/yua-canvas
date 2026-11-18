import { test, expect } from "@playwright/test";

test("explicit legacy parents survive partial overlap and blank groups survive migration", async ({
  page,
}) => {
  await page.goto("/");
  const migrated = await page.evaluate(async () => {
    const { importBoard } = await import("/src/storage.ts");
    return importBoard(
      JSON.stringify({
        version: 1,
        groups: [
          {
            id: "p",
            name: "父组",
            bounds: { x: 0, y: 0, width: 400, height: 300 },
          },
          {
            id: "c",
            name: "子组",
            parent: "p",
            bounds: { x: 300, y: 50, width: 400, height: 300 },
          },
          { id: "empty", name: "空组", parent: "c" },
        ],
        cards: [
          {
            id: "file",
            kind: "text",
            x: 350,
            y: 120,
            title: "",
            text: "保留内容",
            color: "#ffffff",
            group: "c",
          },
        ],
      }),
    );
  });
  expect(migrated.cards.map((c) => c.id)).toEqual(["p"]);
  const child = migrated.cards[0].canvas!.cards.find((c) => c.id === "c")!;
  expect(child.canvas!.cards).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "file", x: 50, y: 70, text: "保留内容" }),
      expect.objectContaining({
        id: "empty",
        canvas: expect.objectContaining({ cards: [] }),
      }),
    ]),
  );
});

test("equal legacy frames remain siblings, including when a card reuses a group ID", async ({
  page,
}) => {
  await page.goto("/");
  const data = await page.evaluate(async () => {
    const { importBoard, exportBoard } = await import("/src/storage.ts");
    const bounds = { x: 0, y: 0, width: 400, height: 400 };
    const board = await importBoard(
      JSON.stringify({
        version: 1,
        groups: [
          { id: "a", name: "甲", bounds },
          { id: "b", name: "乙", bounds },
        ],
        cards: [
          {
            id: "a",
            group: "a",
            kind: "text",
            title: "",
            text: "a",
            x: 40,
            y: 60,
          },
          {
            id: "b",
            group: "b",
            kind: "text",
            title: "",
            text: "b",
            x: 40,
            y: 60,
          },
        ],
        connections: [
          {
            id: "ab",
            from: { card: "a", side: "e" },
            to: { card: "b", side: "w" },
          },
        ],
      }),
    );
    return importBoard(await exportBoard(board));
  });
  expect(data.groups).toEqual([]);
  expect(data.cards.map((c) => c.canvas?.cards[0].id)).toEqual(["a", "b"]);
  expect(data.connections![0].from.card).toBe(data.cards[0].id);
  expect(data.connections![0].to.card).toBe(data.cards[1].id);
});
