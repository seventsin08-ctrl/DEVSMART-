# Put DevMart online (about 20 minutes)

You need three free accounts: **GitHub** (your code is already there), **Supabase** (the database and logins) and **Netlify** (the website). No coding is required.

> Keep one thing secret: the Supabase **service_role / secret key**. Never paste it anywhere except the Netlify setting named below.

---

## Part 1: Database (Supabase)

1. Go to <https://supabase.com>, create a free account and press **New project**.
   Name it `devmart`, choose a strong database password and save it somewhere safe. For **Region** pick **Southeast Asia (Singapore)**. Wait about two minutes.
2. Open **SQL Editor → New query**.
   In GitHub, open the file `supabase/setup.sql`, press **Copy raw file**, paste it into the editor and press **Run**.
   Supabase may show a yellow "destructive operations" warning. That is expected for this file: choose **Run this query**. You should see *Success*.
   Run it **once**, on the new empty project.
3. **Turn off public sign-up.** Authentication → Sign In / Providers → switch **off** "Allow new users to sign up". Nobody can then create accounts except you.
4. **Create your admin login.**
   - Authentication → Users → **Add user → Create new user**. Enter your email and a long password (12+ characters). Tick **Auto Confirm User**.
   - SQL Editor → New query, paste this (use your own email), press Run:
     ```sql
     insert into public.admin_roles (email, role) values ('you@example.com', 'owner');
     ```
5. **Copy three values** from Project Settings → **API** (or "API Keys"):
   - **Project URL**
   - **anon** (or *publishable*) key
   - **service_role** (or *secret*) key

---

## Part 2: Website (Netlify)

1. Go to <https://app.netlify.com>, sign up with GitHub, then **Add new site → Import an existing project → GitHub** and choose the `devsmart-` repository. Leave the build settings as they are; they come from the repo.
2. Open **Environment variables** (on the same screen, or later under *Site configuration*) and add:

   | Name | Value | Notes |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL | public |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key | public |
   | `SUPABASE_URL` | Project URL | same as above |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | tick **Contains secret values** |
   | `IP_HASH_SALT` | any long random text (30+ characters) | tick **Contains secret values** |

3. Press **Deploy**. After a minute or two you get an address like `https://something.netlify.app`. (The *Project name* at the top of the setup screen decides that address.)
4. Optional: `SITE_URL`. The site already builds tracking links from the address people visit, so you can skip this. Set it (for example `https://your-domain.com`, no slash at the end) only if you want links to always use one specific address, then redeploy.

---

## Part 3: First login and setup

1. Open `https://your-address/admin`, sign in, and scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or Authy). Type the 6-digit code. This two-step check is required for every admin sign-in.
2. **Payments → Payment methods**: edit GCash, Maya and Bank Transfer with your real account name and number, upload the QR code, and switch **Available to customers** on. Until you do, customers see no payment details.
3. **Branding Studio → Brand → Contact details**: add your email, phone, Facebook page, address and hours, then press **Publish**. Until you publish, visitors see the built-in default text.
4. **Portfolio**: the six starter projects are labelled *Concept*. Replace them with your real work, or hide them.
5. **Services** and **Pricing**: check the prices and descriptions.
6. **Test it like a customer.** Place an order at `/start-a-project`, save the tracking link, upload a test payment proof, then in the admin approve it and check that the receipt appears.
7. Read the **Privacy Policy** and **Terms** pages and the contract template (Admin → Contracts). They are starting templates. Have a lawyer check them before you collect real customer data.

---

## Optional, later

- **Your own domain:** Netlify → Domain management → *Add a domain* and follow the DNS steps.
- **Emails** (order confirmations, tracking links, payment decisions): create a <https://resend.com> account and verify your domain, then add `RESEND_API_KEY`, `EMAIL_FROM` (for example `DevMart <orders@your-domain.com>`) and `ADMIN_NOTIFY_EMAIL` in Netlify and redeploy. Without a verified domain Resend only delivers to your own address. Until emails are on, customers see their tracking link on screen once, so tell them to save it.
- **Spam protection:** a free Cloudflare Turnstile widget (`VITE_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).

---

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Netlify build fails with "Secrets scanning found secrets" | The repo already allows the public Supabase values. If it still happens, add the variable `SECRETS_SCAN_OMIT_KEYS` in Netlify with the value `VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY,SUPABASE_URL,SITE_URL`, do not tick "secret" on the two `VITE_` variables, and redeploy. |
| The Start a Project page says ordering is not connected | The two `VITE_` variables are missing or wrong. Fix them and redeploy (they are built into the site). |
| Submitting an order says the service is not configured | `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing in Netlify. Add it and redeploy. |
| `/admin` says "Incorrect email or password" | Check the password. The user must have been created with **Auto Confirm User** ticked. |
| `/admin` says "Access denied" | The email is not in the allowlist. Run the `insert into public.admin_roles ...` line from Part 1 step 4 with the same email. |
| You lost your authenticator | Supabase → Authentication → Users → open your user → remove the factor, then sign in again to set up a new one. |
| The site was fine, then stopped saving data | Free Supabase projects pause after a week with no activity. Open the Supabase dashboard and press **Restore project**. |

## Updating the website later

Any change pushed to the repository's deploy branch is built and published by Netlify automatically. Content changes (text, colours, services, prices, payment details) do not need a deploy: make them in the admin dashboard.
