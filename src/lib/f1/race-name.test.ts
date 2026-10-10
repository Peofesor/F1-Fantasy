import { describe, expect, it } from "vitest";
import { shortRaceName } from "./race-name";

describe("shortRaceName", () => {
  it("abbreviates the part every race shares", () => {
    expect(shortRaceName("Emilia Romagna Grand Prix")).toBe("Emilia Romagna GP");
    expect(shortRaceName("Bahrain Grand Prix in Malaysia")).toBe("Bahrain GP in Malaysia");
  });

  it("leaves a name without it alone", () => {
    expect(shortRaceName("70th Anniversary")).toBe("70th Anniversary");
  });
});
