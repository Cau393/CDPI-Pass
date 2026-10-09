import { test, expect } from "@playwright/test";
import { cleanupTracked, cfg, createEvent, scalar, sql } from "../support/db";
import { createAccount, makeUser } from "../support/ui";

test.skip(cfg.mode !== "local", "writes test rows; local mode only");

/**
 * Staging regression: a pre-existing event's counter ended below its seeded value because the teardown
 * subtracted one per paid order, but SQL-seeded paid orders (the Excel specs) never increment it.
 * The counter must come back to at most its value at setup, whatever mix of orders the run made.
 */
test("teardown restores a pre-existing event's counter to its setup value, not below", async () => {
  const ev = await createEvent("presencialPaid", { titleSuffix: "counter" }); // stands in for a pre-existing event
  const buyer = makeUser("ctr");
  await createAccount(buyer);
  const userId = (await scalar<string>(`SELECT id FROM users WHERE lower(email)=lower($1)`, [buyer.email]))!;
  const paid = (n: number) =>
    sql(
      `INSERT INTO orders (user_id,event_id,payment_method,amount,status) SELECT $1,$2,'free','0','paid' FROM generate_series(1,$3)`,
      [userId, ev.id, n],
    );
  const counter = () => scalar<number>(`SELECT current_attendees FROM events WHERE id=$1`, [ev.id]);
  const scope = { events: [], emails: [buyer.email.toLowerCase()], courtesyCodes: [], counters: { [ev.id]: 5 } };

  // Case A: paid orders inserted by SQL only (counter untouched, like the Excel specs): stays 5, not 3.
  await sql(`UPDATE events SET current_attendees=5 WHERE id=$1`, [ev.id]);
  await paid(2);
  expect(await cleanupTracked(scope)).toEqual([]);
  expect(await counter()).toBe(5);

  // Case B: the app incremented for two orders of the run (counter 7): back to 5.
  await sql(`UPDATE events SET current_attendees=7 WHERE id=$1`, [ev.id]);
  await createAccount(makeUser("ctr2")); // unrelated row, must survive
  const user2 = makeUser("ctr3");
  await createAccount(user2);
  const user2Id = (await scalar<string>(`SELECT id FROM users WHERE lower(email)=lower($1)`, [user2.email]))!;
  await sql(`INSERT INTO orders (user_id,event_id,payment_method,amount,status) SELECT $1,$2,'free','0','paid' FROM generate_series(1,2)`, [user2Id, ev.id]);
  expect(await cleanupTracked({ ...scope, emails: [user2.email.toLowerCase()] })).toEqual([]);
  expect(await counter()).toBe(5);

  // Case C: the counter was lower than the snapshot (someone else's change): never raised.
  await sql(`UPDATE events SET current_attendees=4 WHERE id=$1`, [ev.id]);
  expect(await cleanupTracked(scope)).toEqual([]);
  expect(await counter()).toBe(4);
  // the event itself and the unrelated account were not touched
  expect(await scalar(`SELECT count(*) FROM events WHERE id=$1`, [ev.id])).toBe("1");
});
