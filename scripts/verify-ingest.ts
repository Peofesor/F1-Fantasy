/**
 * End-to-end check against live upstream data.
 *
 * Fetches one real race weekend from both APIs, runs it through the transforms,
 * and prints the facts the game's bet markets settle on. This is a smoke test
 * against production data rather than a unit test — run it manually when
 * upstream behaviour is in question.
 *
 *   npx tsx scripts/verify-ingest.ts [season] [round]
 */

import * as jolpica from "../src/lib/f1/jolpica/client";
import * as openf1 from "../src/lib/f1/openf1/client";
import {
  fastestPitStop,
  lapOneLeader,
  toLapTimings,
  toPitStops,
  toQualifyingEntries,
  toRaceResults,
} from "../src/lib/f1/jolpica/transform";
import {
  countOvertakesByDriver,
  excludePitDrivenOvertakes,
  hadSafetyCar,
  linkDriverNumbers,
  toOpenF1PitStops,
  toOvertakes,
  toSafetyCarEvents,
} from "../src/lib/f1/openf1/transform";

const season = Number(process.argv[2] ?? 2026);
const round = Number(process.argv[3] ?? 13);

function heading(text: string): void {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

async function main(): Promise<void> {
  console.log(`Verifying ingestion for ${season} round ${round}`);

  const [qualifyingRaw, resultsRaw, pitStopsRaw, lapOneRaw] = [
    await jolpica.getQualifying(season, round),
    await jolpica.getRaceResults(season, round),
    await jolpica.getPitStops(season, round),
    await jolpica.getLap(season, round, 1),
  ];

  const race = resultsRaw?.MRData.RaceTable.Races[0];
  if (!race?.Results) {
    console.log("No race results published for this round yet.");
    return;
  }

  heading(`${race.raceName} — ${race.date}`);

  const results = toRaceResults(race.Results);
  const winner = results.find((entry) => entry.position === 1);
  console.log(`Winner:              ${winner?.driverId} (${winner?.constructorId})`);
  console.log(
    `Classified finishers: ${results.filter((r) => r.classification === "finished" || r.classification === "lapped").length} of ${results.length}`,
  );
  const retirements = results.filter((r) => r.classification === "retired");
  console.log(
    `Retirements:         ${retirements.length}${retirements.length ? ` (${retirements.map((r) => r.driverId).join(", ")})` : ""}`,
  );
  const dsq = results.filter((r) => r.classification === "disqualified");
  if (dsq.length) console.log(`Disqualified:        ${dsq.map((r) => r.driverId).join(", ")}`);

  const qualifying = qualifyingRaw?.MRData.RaceTable.Races[0]?.QualifyingResults;
  if (qualifying) {
    const entries = toQualifyingEntries(qualifying);
    heading("Qualifying");
    console.log(`Pole:                ${entries.find((e) => e.position === 1)?.driverId}`);
    console.log(
      `Reached Q3:          ${entries.filter((e) => e.highestSessionReached === "Q3").length} drivers`,
    );
    console.log(
      `Eliminated in Q1:    ${entries.filter((e) => e.highestSessionReached === "Q1").length} drivers`,
    );
    const noTime = entries.filter((e) => e.setNoTime);
    console.log(`Set no time:         ${noTime.length ? noTime.map((e) => e.driverId).join(", ") : "none"}`);
  }

  const lapOne = lapOneRaw?.MRData.RaceTable.Races[0]?.Laps;
  if (lapOne) {
    heading("Bet markets — jolpica sourced");
    console.log(`Leader after lap 1:  ${lapOneLeader(toLapTimings(lapOne))}`);
  }

  const pitStops = pitStopsRaw?.MRData.RaceTable.Races[0]?.PitStops;
  if (pitStops) {
    const stops = toPitStops(pitStops);
    const fastest = fastestPitStop(stops);
    console.log(
      `Fastest pit lane:    ${fastest?.driverId} at ${fastest?.pitLaneSeconds.toFixed(3)}s (of ${stops.length} stops)`,
    );
    const suspended = stops.filter((s) => s.pitLaneSeconds > 120);
    if (suspended.length) {
      console.log(
        `  note: ${suspended.length} stops exceed 2 minutes — race suspension, excluded by taking the minimum`,
      );
    }
  }

  // OpenF1 has no round numbers, so the race session is located by country and
  // then matched on date to disambiguate countries hosting two events.
  heading("Bet markets — OpenF1 sourced");
  const sessions = await openf1.getRaceSessions(season, race.Circuit.Location.country);
  const session = sessions.find((s) => s.date_start.startsWith(race.date));

  if (!session) {
    console.log(`No OpenF1 race session found for ${race.Circuit.Location.country} on ${race.date}.`);
    return;
  }
  console.log(`Session:             ${session.session_key} (${session.location})`);

  const safetyCar = toSafetyCarEvents(await openf1.getSafetyCarMessages(session.session_key));
  console.log(`Safety car deployed: ${hadSafetyCar(safetyCar) ? "yes" : "no"}`);
  for (const event of safetyCar) {
    console.log(`  lap ${event.lap}: ${event.message}${event.virtual ? " (virtual)" : ""}`);
  }

  const rawOvertakes = toOvertakes(await openf1.getOvertakes(session.session_key));
  const openF1Stops = toOpenF1PitStops(await openf1.getPitStops(session.session_key));
  const onTrack = excludePitDrivenOvertakes(rawOvertakes, openF1Stops);

  console.log(
    `Overtakes:           ${rawOvertakes.length} raw → ${onTrack.length} on-track (${rawOvertakes.length - onTrack.length} pit-driven, filtered)`,
  );

  const numberToDriver = linkDriverNumbers(race.Results);
  const counts = [...countOvertakesByDriver(onTrack).entries()]
    .map(([number, count]) => ({ driver: numberToDriver.get(number) ?? `#${number}`, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  console.log("Most overtakes (house definition):");
  for (const { driver, count } of counts) {
    console.log(`  ${String(count).padStart(3)}  ${driver}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
