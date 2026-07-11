import { describe, expect, it } from "vitest";
import { parseDiagramSemanticTree } from "../lib/diagram-semantic-tree";

describe("diagram semantic tree", () => {
  it("parses mindmap indentation into expandable branches", () => {
    const tree = parseDiagramSemanticTree(`
mindmap
  Temi principali
    Prodotto
      Ricerca
      Diagrammi
    Go to market
      Pricing
`);

    expect(tree[0]?.label).toBe("Temi principali");
    expect(tree[0]?.children[0]?.label).toBe("Prodotto");
    expect(tree[0]?.children[0]?.children.map((node) => node.label)).toEqual(["Ricerca", "Diagrammi"]);
  });

  it("parses flowchart edges into a navigable path", () => {
    const tree = parseDiagramSemanticTree(`
flowchart TD
  A[Brief] --> B[Temi]
  B --> C[Azioni]
`);

    expect(tree[0]?.label).toBe("Brief");
    expect(tree[0]?.children[0]?.label).toBe("Temi");
    expect(tree[0]?.children[0]?.children[0]?.label).toBe("Azioni");
  });
});
