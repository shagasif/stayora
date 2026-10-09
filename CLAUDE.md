# CLAUDE.md — Stayora

Stayora is an original hotel booking site (inspired by booking platforms, not a copy of any). Static front end + Supabase back end.

## Stack
- Plain HTML, CSS, JavaScript. No build step.
- `@supabase/supabase-js` v2 loaded from jsDelivr (UMD).
- Hash router (`#/`, `#/results`, `#/hotel/:id`, `#/book`, `#/confirmation/:ref`, `#/lookup`).
- Deploys as a static folder (Netlify publish dir: `.`).

## Structure
```
index.html          shell: header, <main id="app">, footer
css/styles.css      tokens + all styles
js/config.js        SUPABASE_URL / SUPABASE_ANON_KEY (public anon key only)
js/app.js           router, views, validation, Supabase calls
supabase/schema.sql tables, RLS, functions, demo seed data
README.md           setup and deploy steps
```

## Data model
`hotels`, `room_types`, `guests`, `bookings` (status: pending | confirmed | cancelled).
- Browser can only SELECT `hotels` and `room_types`.
- `guests` and `bookings` have RLS on with NO policies: no direct access.
- All booking access goes through three SECURITY DEFINER functions:
  `search_hotels`, `create_booking`, `get_booking` (lookup needs reference + email).

## Rules
1. Accuracy: never invent facts, numbers, or claims. Seed hotels are fictional demo data and must stay labelled as such.
2. Originality: no Booking.com/Hotels.com/Expedia assets, copy, or layouts.
3. Never put a `service_role` key in the front end. Only the anon key belongs in `config.js`.
4. Escape every dynamic string with `esc()` before inserting into HTML.
5. Validate on the client (friendly) AND in SQL (authoritative).
6. Copy: sentence case, plain verbs, errors say what happened and how to fix it.
7. UX: visible focus, labels on all inputs, 44px minimum touch targets, no horizontal scroll at 360px.

## Verify before saying "done"
- `node --check js/app.js`
- Run `supabase/schema.sql`, set `config.js`, then: search, open hotel, book, confirm a row in `bookings`.
- Try: past date, check-out before check-in, too many guests, bad email, double-booking the last room.

## Offline demo mode
If Supabase is not configured or unreachable, `app.js` switches to built-in demo hotels (same ids as seed data) and simulates bookings in sessionStorage. No on-screen notice is shown. SQL rule errors (code P0001) are real and never trigger the fallback.

## Colour palette
Original dark teal-blue `--brand` / `--ink` `#14262e` (primary buttons with white text, nav, footer, dark offer block, selected dates), hover `--brand-d` `#244553`; gold `--sun` `#d4af37` (accents, offer block, rewards button, focus rings; dark text on it), hover `--sun-d` `#c29d28`; stars `--star`; text `--text` `#1a1a1a`; page `--bg` `#f3f1ef`; borders `--line` `#e2dcd6`. Success green `--ok` and error red `--coral` are functional colours. No gradients.

## Motion
Staged hero entrance, parallax hero photo (`--pbg`) and text (`--ptx`), scroll-reveal (`.pend` pauses an element's entrance animation until it is on screen), floating gift (`data-speed` parallax via the `translate` property). All of it is off for `prefers-reduced-motion`.

## Guests, rooms, dates
URL params: `in`, `out`, `g` (adults + children), `c` (children), `r` (rooms), `p` (pets 0/1), `f` (flexible days: 1, 2, 3 or 7). Availability counts rooms, not bookings (`sum(bookings.rooms)`). Pets are stored with the booking but do not filter hotels (no pet-policy data). The rewards card buttons open an "accounts coming soon" popup; no auth exists.

## Accounts
Header buttons (`#auth`) and the rewards card open a right-side drawer (`openAuth`, built on `mountModal` with `cls:'drawer'`). Sign in / register use `sb.auth`; the signed-in view lists `my_bookings()`. Tables: `profiles` (trigger on `auth.users`), `bookings.user_id` set by `create_booking` from `auth.uid()`. Without a database connection the drawer opens but submitting says accounts aren't available.

## Usability-test mode
With no database connection, Register / Sign in create and check test accounts in this browser (`localStorage`: `stayora_users`, `stayora_session`; passwords salted + SHA-256 hashed), and demo bookings persist in `localStorage` (`stayora_demo_bookings`). With a database connection Supabase Auth is used, falling back to local accounts only on a network failure. Destinations: 16 cities (10 in Pakistan) grouped by country in the dropdown, with "All of Pakistan". The date picker colours ONE date at a time (check-in picker, then check-out picker).

## Password reset
"Forgot password?" sits under the Sign in button. With a database connection it calls `sb.auth.resetPasswordForEmail` (a real email); coming back from the email fires `PASSWORD_RECOVERY`, which opens the "Set a new password" form (`updateUser`). Without a database the same screens appear but no email is sent. After sign in, register or a password reset the drawer closes and the user is taken to the main page (`#/`).

## Pakistan place photos
Keys `lahore`, `isb`, `hunza` in `PH` use Wikimedia Commons files (`wm:` prefix, loaded via `Special:FilePath?width=500|960|1280`) as the cover of the Lahore, Islamabad and Hunza hotels. Credit them in the footer; check each file page for the exact licence terms before going live. Only freely licensed photos are used.

## Reward display
After sign in the rewards card (home) shows the reward type, "Member Deal: 10% off selected stays" (`REWARD`), instead of the Sign in / Register buttons, and the account drawer shows the same chip. It is display only: prices are not discounted yet. Every Pakistani hotel has a "Large Family Room" (sleeps 6) so a search for a bigger party in Pakistan still returns stays.

## Any party size
`searchStays` tries the requested number of rooms and then 2, 3, ... up to 5 rooms (never more than the adults) and keeps, for each room type, the smallest number that fits the group and is available (`room.need`). Cards, the hotel page and Reserve use `need` for prices and the `r` URL parameter. No SQL change: it only calls `search_hotels` with different `p_rooms`.

## Bookings in the account panel
Clicking a booking in "Your bookings" closes the panel and opens `#/lookup?ref=…&email=…` (the Find my booking page, form pre-filled).

## Pakistan photos supplied by the owner
`images/<place>.jpg` (keys `myKarachi`, `myLahore`, `myIslamabad`, `myHunza`, `mySkardu`, `myMurree`, `mySwat`, `myPeshawar`, `myMultan`, `myGwadar`) are the cover photo and first gallery image of each Pakistani hotel; `images/pakistan.jpg` (`myPakistan`) is the image on the "Pakistan" trending card. For Lahore, Islamabad and Hunza the earlier Wikimedia photo is still the second gallery image; its footer credit was removed at the owner's request (Wikimedia's licences ask for credit, so credit it elsewhere or drop those photos). Multan, Hunza and Karachi were cropped from tall or framed originals.
