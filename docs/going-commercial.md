# What has to change before this can earn money

Everything the game runs on today is licensed, priced or permitted **on the
condition that nothing here makes money**. That is a deliberate, workable
position for a private league. It is not a position you can quietly grow out of:
the moment revenue appears — subscription, entry fee, advertising, and probably
even donations — several of these stop being permissions and start being
breaches.

This file is the list. Each entry says what is relied on, why revenue breaks it,
and what the alternative is.

> Not legal advice. Every licence claim below is quoted from a source that was
> read directly; the regulatory items are flagged as questions for a
> professional, not answered here.

---

## The one that decides the rest

**Neither data source owns the rights it licenses to you.**

jolpica-f1 continues Ergast, which derived its data from Formula 1. OpenF1
derives from F1's live timing. Both publish under CC BY-NC-SA 4.0, and both
offer to discuss commercial terms — but what either can grant is a licence to
*their compilation*, not to the underlying rights held by Formula One
Management.

So the question to put to them is not "what does a commercial licence cost". It
is **"on what basis can you license this commercially at all"**. The answer
determines whether the commercial route exists or whether only §3 and §4 below
remain.

---

## 1. Data — jolpica-f1

| | |
|---|---|
| **Licence** | CC BY-NC-SA 4.0 |
| **Supplies** | Calendar, race and sprint results, qualifying, championship standings |
| **Why it blocks** | The NC clause forbids use in anything earning money. SA means derived data carries the same licence onward. |

This is not a component, it is the game. Every price, tier, score and market
settles against it. There is no version of this app that keeps working without a
replacement.

**Alternatives**

- Written commercial licence — ask `admin@jolpi.ca`, and ask the rights question above first.
- Source the facts elsewhere (see §4).
- Stay non-commercial.

## 2. Data — OpenF1

| | |
|---|---|
| **Licence** | CC BY-NC-SA 4.0 |
| **Supplies** | Overtakes, pit-stop times, safety cars, driver portraits |
| **Why it blocks** | Same NC and SA clauses. |

The €9.90/month Sponsor tier buys higher rate limits and live-session access. It
is a fee for **access** and does not lift the NC clause — paying it is not a
commercial licence.

**Alternatives**

- Written commercial licence — enquire through openf1.org.
- **Switch it off**: `F1_OPENF1=off` withdraws the three markets it settles
  (most overtakes, fastest pit stop, safety car), scores overtakes as zero and
  falls back to initials in the picker. The game still works. See
  [`src/lib/f1/data-sources.ts`](../src/lib/f1/data-sources.ts).

## 3. Driver portraits

| | |
|---|---|
| **Source** | `media.formula1.com`, hotlinked (see `images.remotePatterns` in `next.config.ts`) |
| **Why it blocks** | Copyrighted photographs, used without permission, fetched from the rights holder's own CDN by your users' browsers. |

A more direct claim than anything in the data licences, and the only item here
that is arguably a problem *already* rather than only once money appears.
Hotlinking is also fragile: the pictures break whenever F1 changes a path.

**Alternatives**

- Remove them. The picker already falls back to initials on a team colour.
- Licensed imagery, negotiated per photo. Realistically out of reach at this scale.

## 4. Sourcing the facts yourself

Not a dependency — the fallback if §1 and §2 come back negative.

Individual facts (who finished where, how many points) are not themselves
copyrightable. What EU law protects is the **database**, through the *sui
generis* right, which restricts systematic extraction of substantial parts. The
daily ingest job does exactly that, so the route is not "keep scraping and stop
crediting" — it is a different source or manual entry, roughly 23 weekends a
year.

Whether that stands up is a question for a lawyer. It is recorded here so the
option is not forgotten, not because it is known to be safe.

## 5. Hosting — Vercel

| | |
|---|---|
| **Tier** | Hobby (free) |
| **Why it blocks** | The Hobby tier's terms are for non-commercial use. |

**Alternatives**

- Vercel Pro, roughly $20/month.
- Container hosting — Railway, Render, Fly — which just run `next start`, around $5/month.
- A VPS (Hetzner ≈ €4/month) with Docker and a reverse proxy; TLS, updates and backups become yours.

Nothing in this codebase is Vercel-specific: the runtime dependencies are
`next`, `react`, `react-dom`, `@supabase/*` and `zod`. Moving hosts is a
configuration change, not a rewrite.

## 6. Hosting — Supabase

Commercial use is permitted on the free plan, so this is an operational limit
rather than a licensing one: free projects pause after a period of inactivity
and the database and storage quotas are small. A paid game cannot sit on a tier
that pauses itself. Check the current limits when the time comes — they move.

## 7. The name

"F1" and "FORMULA 1" are registered trademarks of Formula One Licensing BV, and
Formula 1 operates its own official Fantasy game.

A free fan project trading under that name is a risk people routinely take. A
paid one, competing directly with the rights holder's own product, is a
different proposition. The non-affiliation notice in the footer helps the first
case and does nothing for the second.

**Alternative:** a name of its own. Far cheaper to change now — a repo, a
database and a few bookmarks — than after anyone has paid for anything.

## 8. Betting with real money

What keeps the current betting harmless is one fact: stakes and payouts are cost
cap. No money enters and none leaves, so nobody is wagering anything of value.

Charge for entry, or pay out anything convertible, and that fact no longer
holds. The answer then depends on German gambling law, not on anything in this
codebase.

**Worth an hour of specialist advice *before* building a payment flow.** If the
answer is unfavourable, the fix is to keep the paid tier and the betting apart —
an architectural decision, and much cheaper to make early.

## 9. Impressum and privacy policy

Neither exists. For a private, invitation-only league with no money involved, the
Impressum duty is hard to construct and GDPR's household exemption plausibly
covers it.

Both of those defences disappear the moment this is a commercial offering. An
Impressum (§5 DDG) and a GDPR privacy notice become plainly mandatory, and they
carry a real name and address — so they cannot be generated, only written.

---

## Summary

| # | Item | Blocks revenue | Has a workable alternative |
|---|---|---|---|
| 1 | jolpica-f1 licence | Yes | Only by licence or replacement |
| 2 | OpenF1 licence | Yes | Yes — switch it off |
| 3 | Driver portraits | Yes (and arguably now) | Yes — remove them |
| 5 | Vercel Hobby tier | Yes | Yes — paid tier or move |
| 6 | Supabase free tier | Operational only | Yes — paid tier |
| 7 | The name | Yes | Yes — rename |
| 8 | Betting + money | Regulatory question | Yes — separate the two |
| 9 | Impressum / privacy | Yes | Yes — write them |

Item 1 is the one to resolve first. Everything else on this list has an
alternative that costs money or effort; item 1 may have no alternative at all,
and there is no point paying for any of the others until it is answered.
