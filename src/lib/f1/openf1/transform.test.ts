import { describe, expect, it } from "vitest";
import {
  countOvertakesByDriver,
  excludePitDrivenOvertakes,
  findSessionForRaceDate,
  hadSafetyCar,
  linkDriverNumbers,
  toSafetyCarEvents,
} from "./transform";
import type { Overtake, PitStop } from "../types";
import type { JolpicaRaceResult } from "../jolpica/schemas";

const RACE_START = new Date("2026-09-06T13:00:00Z");

function at(secondsIn: number): Date {
  return new Date(RACE_START.getTime() + secondsIn * 1000);
}

function overtake(
  overtakingDriverNumber: number,
  overtakenDriverNumber: number,
  secondsIn: number,
): Overtake {
  return {
    overtakingDriverNumber,
    overtakenDriverNumber,
    at: at(secondsIn),
    position: 5,
  };
}

function pitStop(
  driverNumber: number,
  secondsIn: number,
  pitLaneSeconds: number,
): PitStop {
  return {
    driverId: null,
    driverNumber,
    lap: 10,
    at: at(secondsIn),
    pitLaneSeconds,
  };
}

describe("excludePitDrivenOvertakes", () => {
  it("keeps passes made nowhere near a pit stop", () => {
    const overtakes = [overtake(4, 16, 600)];
    const stops = [pitStop(16, 2000, 30)];
    expect(excludePitDrivenOvertakes(overtakes, stops)).toHaveLength(1);
  });

  it("drops a position change while the overtaken car was pitting", () => {
    const overtakes = [overtake(4, 16, 2010)];
    const stops = [pitStop(16, 2000, 30)];
    expect(excludePitDrivenOvertakes(overtakes, stops)).toHaveLength(0);
  });

  it("applies the window symmetrically around the recorded stop", () => {
    // OpenF1 does not document whether a pit record's date is entry or exit,
    // so a pass just before the timestamp must be excluded too.
    const stops = [pitStop(16, 2000, 30)];
    expect(excludePitDrivenOvertakes([overtake(4, 16, 1980)], stops)).toHaveLength(
      0,
    );
  });

  it("does not let a red-flag stop wipe out the whole race", () => {
    // A suspension records a ~30 minute pit-lane time. Used raw as an exclusion
    // window that would discard every genuine pass for 30 minutes either side,
    // so the window is capped.
    const stops = [pitStop(16, 2000, 1846.2)];
    const genuinePass = overtake(4, 16, 2600); // 10 minutes later
    expect(excludePitDrivenOvertakes([genuinePass], stops)).toHaveLength(1);
  });

  it("only excludes passes on the car that actually pitted", () => {
    const stops = [pitStop(16, 2000, 30)];
    // Car 4 overtook car 81, while car 16 happened to be pitting.
    expect(excludePitDrivenOvertakes([overtake(4, 81, 2005)], stops)).toHaveLength(
      1,
    );
  });

  it("keeps a pass when the stop carries no timestamp", () => {
    // jolpica-sourced stops have no usable instant, so they cannot justify
    // excluding anything.
    const stops: PitStop[] = [
      { driverId: "leclerc", driverNumber: 16, lap: 10, at: null, pitLaneSeconds: 30 },
    ];
    expect(excludePitDrivenOvertakes([overtake(4, 16, 2000)], stops)).toHaveLength(
      1,
    );
  });
});

describe("countOvertakesByDriver", () => {
  it("counts passes made, not passes suffered", () => {
    const counts = countOvertakesByDriver([
      overtake(4, 16, 100),
      overtake(4, 81, 200),
      overtake(16, 81, 300),
    ]);
    expect(counts.get(4)).toBe(2);
    expect(counts.get(16)).toBe(1);
    expect(counts.get(81)).toBeUndefined();
  });
});

describe("toSafetyCarEvents", () => {
  const message = (msg: string, category = "SafetyCar") => ({
    session_key: 11361,
    date: "2026-09-06T13:06:49+00:00",
    category,
    message: msg,
    lap_number: 3,
  });

  it("distinguishes a virtual safety car from a full one", () => {
    const events = toSafetyCarEvents([
      message("SAFETY CAR DEPLOYED"),
      message("VIRTUAL SAFETY CAR DEPLOYED"),
    ]);
    expect(events[0].virtual).toBe(false);
    expect(events[1].virtual).toBe(true);
  });

  it("ignores unrelated race control categories", () => {
    expect(toSafetyCarEvents([message("BLUE FLAG", "Flag")])).toHaveLength(0);
  });

  it("reports whether the race saw a safety car at all", () => {
    expect(hadSafetyCar(toSafetyCarEvents([message("SAFETY CAR DEPLOYED")]))).toBe(
      true,
    );
    expect(
      hadSafetyCar(toSafetyCarEvents([message("SAFETY CAR IN THIS LAP")])),
    ).toBe(false);
  });
});

describe("findSessionForRaceDate", () => {
  const session = (date_start: string, location: string) => ({ date_start, location });

  it("matches a session starting the same day", () => {
    const found = findSessionForRaceDate(
      [session("2026-09-06T13:00:00+00:00", "Monza")],
      "2026-09-06",
    );
    expect(found?.location).toBe("Monza");
  });

  it("matches a night race that starts after midnight UTC", () => {
    // Las Vegas 2024: jolpica files it under 2024-11-23 (local date) while the
    // session starts 2024-11-24T06:00Z. Exact date matching misses it entirely.
    const found = findSessionForRaceDate(
      [session("2024-11-24T06:00:00+00:00", "Las Vegas")],
      "2024-11-23",
    );
    expect(found?.location).toBe("Las Vegas");
  });

  it("does not match an unrelated event a week away", () => {
    expect(
      findSessionForRaceDate([session("2026-09-13T13:00:00+00:00", "Baku")], "2026-09-06"),
    ).toBeNull();
  });

  it("picks the closest session when several are in range", () => {
    const found = findSessionForRaceDate(
      [
        session("2026-09-07T18:00:00+00:00", "Later"),
        session("2026-09-06T13:00:00+00:00", "Closer"),
      ],
      "2026-09-06",
    );
    expect(found?.location).toBe("Closer");
  });

  it("returns null for an unparseable date", () => {
    expect(findSessionForRaceDate([session("2026-09-06T13:00:00+00:00", "Monza")], "")).toBeNull();
  });
});

describe("linkDriverNumbers", () => {
  it("maps car numbers onto jolpica driver ids", () => {
    const results = [
      {
        number: "12",
        Driver: { driverId: "antonelli" },
      },
      {
        number: "3",
        Driver: { driverId: "max_verstappen" },
      },
    ] as JolpicaRaceResult[];

    const map = linkDriverNumbers(results);
    expect(map.get(12)).toBe("antonelli");
    expect(map.get(3)).toBe("max_verstappen");
  });
});
