import { describe, expect, it } from "vitest";
import { allocationSentence, gifteeLabel, groupByGiftee } from "./giftees";
import type { BudgetRollup, Giftee, ShoppingItem } from "../types";

const rollup: BudgetRollup = {
  amount: null,
  spent: "0.00",
  remaining: null,
  bought_count: 0,
  total_count: 0,
  unpriced_count: 0,
  allocated: "0.00",
  unallocated: null,
  target: null,
  allocation_count: 0,
};

function giftee(overrides: Partial<Giftee>): Giftee {
  return {
    key: "owner:1",
    kind: "owner",
    name: "Jane",
    keeper: null,
    list_count: 1,
    budget: rollup,
    ...overrides,
  };
}

function item(overrides: Partial<ShoppingItem>): ShoppingItem {
  return {
    claim_id: 100,
    gift_id: 20,
    name: "Skillet",
    description: null,
    url: null,
    price: null,
    list_id: 10,
    list_name: "Jane's Wishlist",
    giftee_key: "owner:1",
    purchased_at: null,
    amount_paid: null,
    ...overrides,
  };
}

describe("groupByGiftee", () => {
  it("makes one group per giftee in array order, empty ones included", () => {
    const groups = groupByGiftee(
      [giftee({ key: "owner:2", name: "Zed" }), giftee({ key: "owner:1", name: "Jane" })],
      [item({ claim_id: 1, giftee_key: "owner:1" })],
    );

    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ["owner:2", 0],
      ["owner:1", 1],
    ]);
  });

  it("keeps items in the order they arrived within a group", () => {
    const groups = groupByGiftee(
      [giftee({ key: "owner:1" })],
      [item({ claim_id: 3 }), item({ claim_id: 1 }), item({ claim_id: 2 })],
    );

    expect(groups[0].items.map((i) => i.claim_id)).toEqual([3, 1, 2]);
  });

  // A section that claims to hold everything must never quietly lose a row.
  it("never drops an item whose key matches no giftee", () => {
    const groups = groupByGiftee(
      [giftee({ key: "owner:1" })],
      [item({ claim_id: 1, giftee_key: "owner:1" }), item({ claim_id: 2, giftee_key: "owner:9" })],
    );

    expect(groups.map((g) => g.key)).toEqual(["owner:1", "owner:9"]);
    expect(groups[1].giftee).toBeNull();
    expect(groups[1].items.map((i) => i.claim_id)).toEqual([2]);
  });
});

describe("gifteeLabel", () => {
  it("is the bare name when it is unique", () => {
    const all = [giftee({ key: "owner:1", name: "Jane" }), giftee({ key: "owner:2", name: "Tom" })];

    expect(gifteeLabel(all[0], all)).toBe("Jane");
  });

  it("adds the keeper when two giftees share a name, in the words the app already uses", () => {
    const all = [
      giftee({ key: "absent:1:QmV0aA", kind: "absent", name: "Beth", keeper: "Tom" }),
      giftee({ key: "absent:2:QmV0aA", kind: "absent", name: "beth", keeper: "Jane" }),
      giftee({ key: "person:3", kind: "person", name: "Beth", keeper: "Gran" }),
    ];

    expect(gifteeLabel(all[0], all)).toBe("Beth · kept by Tom");
    expect(gifteeLabel(all[1], all)).toBe("beth · kept by Jane");
    expect(gifteeLabel(all[2], all)).toBe("Beth · Gran's account");
  });

  // Two owners with one name have nothing truthful to add.
  it("leaves two owners with the same name identical", () => {
    const all = [giftee({ key: "owner:1", name: "Tom" }), giftee({ key: "owner:2", name: "Tom" })];

    expect(gifteeLabel(all[0], all)).toBe("Tom");
    expect(gifteeLabel(all[1], all)).toBe("Tom");
  });
});

describe("allocationSentence", () => {
  it("counts people, singular and plural", () => {
    expect(allocationSentence(1)).toBe("budget is the sum of 1 person's budget");
    expect(allocationSentence(3)).toBe("budget is the sum of 3 people's budgets");
  });
});
