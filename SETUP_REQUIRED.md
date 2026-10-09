# What you need to set up

This is the only file that needs action from you. Everything else is built and
working.

Each item below is an account only you can open, because it needs your
business identity, your email address, your phone number or your bank details.
Once you have each key, paste it into the file called `.env.local` in the
project folder (copy `.env.example` to create it) next to the name shown in
bold.

**The system already runs without any of these.** Nothing is broken while you
work through the list — messages are recorded instead of sent, and the
dashboard shows you exactly which connections are live. Work down the list in
order; you can stop at any point and come back.

---

## Before anything goes online

### 1. Set the dashboard password — 2 minutes, free

There is no account to create. Open `.env.local` and set:

- **`ADMIN_PASSWORD`** — a password of your choosing for the dashboard.
- **`ADMIN_SESSION_SECRET`** — a long random string; mash the keyboard, 40+
  characters.

**Why it matters:** until you do this, the dashboard opens with the
development password `merry-admin`, which is printed on the login screen.
Do not put the site online before changing it.

---

## To go live properly

### 2. Supabase — 15 minutes, free tier

**Why:** your permanent database. Without it, enquiries are stored in a file
on whichever computer is running the site, which will not survive being hosted
online.

1. Sign up at supabase.com and create a project (choose the London region).
2. Open the SQL editor, paste in the contents of `supabase/schema.sql`, run it.
3. Go to Project Settings → API and copy two values.

- **`SUPABASE_URL`** — the project URL.
- **`SUPABASE_SERVICE_ROLE_KEY`** — the `service_role` key. Keep this secret;
  it is never sent to anyone's browser.

*Free tier limits:* 500 MB of database and 50,000 monthly active users — years
of headroom at your volumes. A paused project on the free tier can be woken up;
projects pause after a week of complete inactivity.

### 3. Vercel — 15 minutes, free tier

**Why:** where the website actually lives.

1. Sign up at vercel.com with your GitHub account.
2. Push this project to a GitHub repository, then "Import Project" in Vercel.
3. In the project's Settings → Environment Variables, add every value from your
   `.env.local`.
4. Set **`NEXT_PUBLIC_SITE_URL`** to your live address.

*Free tier limits:* 100 GB of bandwidth a month. A cleaning company's website
will not come close.

### 4. Anthropic — 10 minutes, pay-as-you-go

**Why:** the intelligent website assistant. Without it the assistant still
works, but follows a fixed script rather than conversing naturally.

1. Sign up at console.anthropic.com.
2. Add a small amount of credit (£5 will last a long time at your volumes).
3. Create an API key.

- **`ANTHROPIC_API_KEY`** — the key beginning `sk-ant-`.

*Cost:* there is no free tier. Typical enquiry conversations cost a few pence
each. Set a monthly spending limit in the console — £10 is a sensible start.

### 5. Resend — 20 minutes, free tier

**Why:** sending quotes, follow-ups and booking confirmations from your own
domain. Without it, messages are written into each customer's history in the
dashboard but not delivered.

1. Sign up at resend.com.
2. Add the domain `merrycleaners.co.uk` and add the DNS records it gives you
   (this is done wherever your domain is registered; it is the fiddliest step
   on this list, and Resend's screen walks you through it).
3. Create an API key.

- **`RESEND_API_KEY`** — the key beginning `re_`.
- **`EMAIL_FROM`** — e.g. `Merry Cleaners <hello@merrycleaners.co.uk>`. It must
  be on the domain you verified.

*Free tier limits:* 3,000 emails a month, 100 a day. You will reach several
hundred enquiries a month before that matters.

### 6. A scheduler for follow-ups — 10 minutes, free

**Why:** the five-minute thank-you message needs something to trigger it.
Vercel's free plan only runs scheduled jobs once a day.

1. Choose a password-like string and set **`CRON_SECRET`** in your environment
   variables (both locally and in Vercel).
2. Sign up at cron-job.org (free).
3. Create a job that requests
   `https://your-site.com/api/cron/followups?secret=YOUR_CRON_SECRET`
   every 5 minutes.
4. Create a second job for
   `https://your-site.com/api/cron/retention?secret=YOUR_CRON_SECRET`, weekly,
   using **POST** — this is the one that deletes old records for data
   protection.

---

## When you are ready to take money and messages

### 7. Stripe — 30 minutes, free to open

**Why:** taking card payment online. Until it is connected, bookings still
work and are simply marked unpaid, with a reminder in your escalations inbox
to invoice the client yourself.

1. Sign up at stripe.com and complete business verification (you will need
   company details and a bank account).
2. Copy the secret key from the Developers → API keys screen.

- **`STRIPE_SECRET_KEY`** — starts `sk_live_` (or `sk_test_` while testing).

*Cost:* no monthly fee. 1.5% + 20p per UK card transaction.

### 8. WhatsApp Business Cloud API — 1–2 hours, free tier

**Why:** following up leads who give a phone number but no email, and
messaging clients where they actually reply. This is the longest item on the
list because Meta verifies your business.

1. Create a Meta Business account at business.facebook.com.
2. In developers.facebook.com, create an app and add the WhatsApp product.
3. Complete Business Verification (Meta will ask for documents proving the
   business exists — allow a few days for their review).
4. Add and verify a phone number that is **not** already on the WhatsApp app.

- **`WHATSAPP_PHONE_NUMBER_ID`** — from the WhatsApp → API Setup screen.
- **`WHATSAPP_ACCESS_TOKEN`** — generate a permanent token via a System User in
  Business Settings; the temporary one expires after 24 hours.

*Free tier:* service conversations (a customer messages you first, and you
reply within 24 hours) are free with no cap. Business-initiated marketing
messages are charged — the system does not send those.

### 9. Receiving email into the system — optional, free

**Why:** so emails to `admin@merrycleaners.co.uk` are automatically sorted and
drafted for your approval. Skip this until the rest is comfortable.

Set up forwarding to `https://your-site.com/api/email/inbound` using a free
inbound parser such as Cloudflare Email Routing. Set
**`EMAIL_WEBHOOK_SECRET`** and have the forwarder send it as an
`x-webhook-secret` header.

In the meantime you can paste any email into Settings → "Try the email
handling" and the system will categorise it and draft a reply exactly as it
would in production.

---

## Not a technical task, but do not skip it

### 10. Register with the ICO — 15 minutes, £52 a year

Any UK business holding customer records must register with the Information
Commissioner's Office. Do it at ico.org.uk. Then add your registration number
to the privacy notice at `src/app/(site)/privacy/page.tsx`.

### 11. Check the two pieces of placeholder content

1. **Prices.** Open the dashboard → Pricing. The starting figures are
   reasonable London market rates, but they are not *your* rates. Review every
   number before the site goes online.
2. **Testimonials.** The three quotations on the homepage are representative
   placeholders, not real clients. Replace them in
   `src/lib/content.ts` with genuine reviews you have permission to publish.

---

## Quick reference

| # | Account | Time | Cost | Without it |
| --- | --- | --- | --- | --- |
| 1 | Dashboard password | 2 min | Free | Default password in use |
| 2 | Supabase | 15 min | Free | Data not durable when hosted |
| 3 | Vercel | 15 min | Free | Site not online |
| 4 | Anthropic | 10 min | ~£5 credit | Assistant follows a fixed script |
| 5 | Resend | 20 min | Free | Emails logged, not delivered |
| 6 | cron-job.org | 10 min | Free | Follow-ups only run once a day |
| 7 | Stripe | 30 min | Per transaction | Bookings marked unpaid; invoice manually |
| 8 | WhatsApp (Meta) | 1–2 hrs | Free tier | WhatsApp messages logged, not sent |
| 9 | Inbound email | 20 min | Free | Paste emails in manually |
| 10 | ICO registration | 15 min | £52/year | Not legally compliant |
