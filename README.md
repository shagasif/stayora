# Stayora

1. Create a project at supabase.com.
2. SQL Editor: paste and run `supabase/schema.sql` (creates tables, security, functions, demo hotels).
3. Project Settings > API: copy the Project URL and the `anon` public key into `js/config.js`. Never use the `service_role` key here.
4. Run locally: `npx serve .` and open the printed URL.
5. Deploy: push to GitHub, then in Netlify choose "Import from Git" with no build command and publish directory `.` (or drag the folder onto Netlify Drop).

Demo hotels are fictional. Replace the rows in `hotels` and `room_types` with real data when you have it.

## Updating an existing Supabase project
If you ran an earlier `schema.sql`, run the new one again in the SQL Editor. It adds `rooms`, `children` and `pets` to `bookings` and replaces the three functions (rooms, children and pets need the new versions). Your hotels and bookings are kept.

## Accounts (Sign in / Register)
Accounts use Supabase Auth. In the dashboard, Authentication > Providers > Email must be on (it is by default). If "Confirm email" is on, new users get a confirmation email before they can sign in. Each sign-up creates a row in `profiles` automatically, and bookings made while signed in are linked to the user (`bookings.user_id`). Guests can still book without an account.

## Re-running schema.sql
It is safe to run again. It adds new hotels (now 16 cities, 10 in Pakistan), removes unused duplicate demo room types left by older versions, and prevents new duplicates.

## Password reset emails
In Supabase: Authentication > URL Configuration, set the Site URL to your live address and add it (and `http://localhost:3000`) to Redirect URLs. Supabase's built-in email sender has a low hourly limit and may only deliver to your own team's addresses, so for real visitors add your own SMTP under Authentication > Emails (SMTP settings).

## Easy sign up and sign in
By default Supabase makes new users confirm their email before they can sign in. To let people register and sign in straight away, open Authentication > Sign In / Providers > Email in the Supabase dashboard and turn "Confirm email" off. The site already handles this: after registering it signs the person in and opens the main page. (Password reset emails still need working email delivery, see "Password reset emails" above.)
