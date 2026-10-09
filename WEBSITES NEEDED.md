# Websites and subscriptions needed

Everything Merry Cleaners needs to sign up for, what each one actually does,
what to pick, and what it costs.

**Prices checked September 2026.** They change — treat them as close, not
exact, and confirm on the day you sign up. Where a service bills in US
dollars, the sterling figure is approximate.

---

## The short answer

| | Monthly | Yearly |
| --- | --- | --- |
| **Minimum to run the business properly** | **about £22** | **about £320** |
| Realistic once the AI assistant is busy | about £30 – £40 | about £400 – £500 |
| Plus card fees | 1.5% + 20p per payment taken | — |

Everything else on this list is genuinely free, or optional advertising spend
you control.

---

## 1. Essential before you go live

These five are what stand between the site working and the business running on
it properly.

| # | Service | What it does for you | Where to sign up | Plan to choose | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | **Vercel** | Hosts the website. Keeps it online 24/7 so it works whether your computer is on or off. | vercel.com | **Pro** | $20/mo (~£16) |
| 2 | **Supabase** | Your database. Stores every enquiry, booking and message permanently. | supabase.com | **Free** to start, **Pro** later | £0, then $25/mo |
| 3 | **Anthropic** | Powers the AI assistant that answers questions and quotes on your site. | console.anthropic.com | Pay as you go | ~£5 – £15/mo |
| 4 | **Resend** | Sends your quotes, follow-ups and booking confirmations from your own address. | resend.com | **Free** | £0 |
| 5 | **ICO registration** | Legally required for any UK business holding customer records. Not optional. | ico.org.uk/registration | **Tier 1** (small business) | £52/yr |

### Why Vercel costs money when I said it was free

Vercel's free plan is for personal projects, not businesses. It has been
perfect for building and testing, and it is fine while your partner reviews
the site. But once merrycleaners.co.uk points at it and it is taking real
enquiries, their terms require the Pro plan. Budget for it from launch day.

Pro also lifts the scheduled-jobs limit, which removes the need for the
separate scheduler in section 2.

### Why Supabase can stay free for a while

The free plan gives you 500 MB of database — several years of enquiries for a
business your size. Two things eventually push you to Pro: daily backups,
and the guarantee that the database never pauses. **Move to Pro once you are
taking bookings you could not bear to lose** — realistically month three or
four, not day one.

### What Anthropic actually costs

There is no subscription. You load credit and it draws down as customers use
the assistant. A typical enquiry conversation is a few pence.

- Put **$5 (~£4) on to start** and set a **$20 monthly cap** in the console
- 200 enquiry conversations a month lands around £8 – £12
- If it is ever cheaper to turn the AI off, the site still quotes and books —
  the assistant just follows a fixed script instead

---

## 2. Free, but you must still set them up

These cost nothing and are not optional in practice.

| # | Service | What it does for you | Where to sign up | Plan | Cost |
| --- | --- | --- | --- | --- | --- |
| 6 | **GitHub** | Stores the code safely and deploys updates to the site automatically. | github.com | **Free** | £0 |
| 7 | **cron-job.org** | Triggers your 5-minute lead follow-ups and the weekly data clean-up. | cron-job.org | **Free** | £0 |
| 8 | **Google Business Profile** | Your listing on Google Maps and local search. The single strongest free source of cleaning enquiries. | business.google.com | **Free** | £0 |
| 9 | **Cloudflare** | Optional. Forwards email sent to your address into the system so replies get drafted for you. | cloudflare.com | **Free** | £0 |

**Note on number 7:** if you take Vercel Pro (number 1), its built-in
scheduler can do this job and you can skip cron-job.org entirely. Keep it as
the fallback if you stay on a free host.

---

## 3. When you start taking money and messages

Add these when you are ready, not before. Nothing breaks without them.

| # | Service | What it does for you | Where to sign up | Plan | Cost |
| --- | --- | --- | --- | --- | --- |
| 10 | **Stripe** | Takes card payment online. Sends the customer a payment link automatically when they book. | stripe.com | **Standard** | No monthly fee. **1.5% + 20p** per UK card payment |
| 11 | **WhatsApp Business (Meta)** | Messages leads who give a phone number but no email, where they actually reply. | business.facebook.com | **Cloud API, free tier** | £0 for service replies |

**Stripe in plain terms:** a £300 end of tenancy clean costs you £4.70 in
fees. You only pay when you get paid. There is no reason to delay signing up
beyond the time it takes.

**WhatsApp in plain terms:** free as long as the customer messages you first
and you reply within 24 hours, which covers everything this system does. Meta
only charges for marketing messages you send unprompted, and the system never
sends those. The catch is time, not money: business verification takes Meta a
few days.

---

## 4. Already yours — just keep paying for it

| # | Service | What it does for you | Where | Cost |
| --- | --- | --- | --- | --- |
| 12 | **merrycleaners.co.uk** | Your domain name. You already own it — it just needs pointing at the new site. | Wherever you registered it | ~£10 – £15/yr |
| 13 | **Business email** | Receiving mail at admin@merrycleaners.co.uk. You already have this. | Existing provider | Already paid |

If your email is a basic forwarding address and you want something more
robust, **Google Workspace Business Starter** is £5.20 per user per month at
workspace.google.com. Worth it for a growing business, not urgent.

---

## 5. Optional — growth, not plumbing

Not subscriptions. Money you choose to spend to win work.

| # | Service | What it does for you | Where | Suggested start |
| --- | --- | --- | --- | --- |
| 14 | **Google Ads** | Puts you at the top for searches like "end of tenancy cleaning Clapham". | ads.google.com | £10 – £15/day, one campaign, watch for a month |
| 15 | **Checkatrade / Yell** | Paid directory listings. | checkatrade.com / yell.com | Only if the dashboard shows they convert |

**Before spending a penny here:** the dashboard records which channel every
lead came from. Run any campaign for a month, then look at Marketing in your
dashboard. It will tell you what each channel actually returned. Do not renew
a directory listing on a hunch.

---

## Suggested order

1. **ICO registration** — legally required, do it first, it takes 15 minutes
2. **Anthropic** — £4 of credit, makes the assistant properly conversational
3. **Resend** — free, makes your emails actually arrive
4. **Vercel Pro** — the day you point your domain at the new site
5. **Stripe** — as soon as you want to stop chasing invoices
6. **Google Business Profile** — free, and the best-value hour you will spend
7. **Supabase Pro** — around month three, when losing the data would hurt
8. **WhatsApp** — last, because Meta's verification is slow

---

## What you are actually buying

For roughly **£22 a month**, a business that currently answers enquiries by
hand gets:

- A website that quotes and books on its own, at any hour
- Every enquiry captured, with the channel it came from
- Automatic follow-up on leads that go quiet
- Emails drafted for approval instead of written from scratch
- A record of every conversation, in one place
- Data handled to UK GDPR standards

The realistic alternative — an agency-built site plus a booking system plus a
CRM — is a four-figure build and £100+ a month in subscriptions.
