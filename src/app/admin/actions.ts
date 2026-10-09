"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkActionRateLimit } from "@/lib/security/rateLimit";
import {
  ADMIN_COOKIE,
  authConfigurationProblem,
  checkPassword,
  createSessionToken,
  isAdmin,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { store } from "@/lib/db";
import { updateBooking } from "@/lib/booking";
import { createEscalation, resolveEscalation } from "@/lib/comms";
import { setLeadStatus, updateLead } from "@/lib/leads";
import { sendEmail } from "@/lib/email/send";
import { handleInboundEmail } from "@/lib/email/inbound";
import { createPaymentLink, stripeConfigured } from "@/lib/integrations/stripe";
import { runFollowUps } from "@/lib/followups";
import { eraseLead, runRetentionSweep } from "@/lib/retention";
import { generateAdCopy, type MarketingChannel } from "@/lib/marketing";
import { purgeSimulation, runSimulation } from "@/lib/agent/simulator";
import type {
  AddonPricing,
  BookingStatus,
  LeadSource,
  LeadStatus,
  PaymentStatus,
  PricingConfig,
  ServicePricing,
  ServiceType,
  Settings,
  ZonePricing,
} from "@/lib/types";

/**
 * Every mutation the dashboard can perform.
 *
 * All of these check the admin session first: a server action is a public
 * endpoint, so the check cannot be left to the page that renders the form.
 */

async function assertAdmin() {
  if (!(await isAdmin())) {
    throw new Error("Not authorised.");
  }
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function number(form: FormData, key: string, fallback = 0): number {
  const value = Number(text(form, key));
  return Number.isFinite(value) ? value : fallback;
}

function flag(form: FormData, key: string): boolean {
  return form.get(key) === "on" || form.get(key) === "true";
}

/* ------------------------------ session ------------------------------ */

export async function login(_previous: unknown, form: FormData) {
  // Throttle before checking anything. There is one password protecting the
  // whole dashboard, so an unlimited guessing rate is the weakest point in
  // the system regardless of how strong that password is.
  const requestHeaders = await headers();
  const attempt = checkActionRateLimit(
    requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("x-real-ip"),
    "login",
  );
  if (!attempt.allowed) {
    const minutes = Math.ceil(attempt.retryAfterSeconds / 60);
    return {
      error: `Too many sign-in attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`,
    };
  }

  // A deployment missing its password or session secret locks rather than
  // falling back to something guessable.
  const misconfigured = authConfigurationProblem();
  if (misconfigured) {
    return { error: misconfigured };
  }

  const password = text(form, "password");
  if (!checkPassword(password)) {
    return { error: "That password was not recognised." };
  }

  const token = createSessionToken();
  if (!token) {
    return { error: "Sessions cannot be signed on this deployment. Check ADMIN_SESSION_SECRET." };
  }

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/admin");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin");
}

/* -------------------------------- leads ------------------------------ */

export async function updateLeadStatusAction(form: FormData) {
  await assertAdmin();
  await setLeadStatus(text(form, "id"), text(form, "status") as LeadStatus);
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
}

export async function updateLeadFieldsAction(form: FormData) {
  await assertAdmin();
  await updateLead(text(form, "id"), {
    source: text(form, "source") as LeadSource,
    notes: text(form, "notes") || null,
  });
  revalidatePath("/admin/leads");
}

export async function deleteLeadAction(form: FormData) {
  await assertAdmin();
  await eraseLead(text(form, "id"));
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  redirect("/admin/leads");
}

export async function pauseFollowUpsAction(form: FormData) {
  await assertAdmin();
  const paused = flag(form, "paused");
  await updateLead(text(form, "id"), {
    followup_paused: paused,
    next_followup_at: paused ? null : new Date().toISOString(),
  });
  revalidatePath("/admin/leads");
}

/* ------------------------------ bookings ----------------------------- */

export async function updateBookingAction(form: FormData) {
  await assertAdmin();
  const patch: Record<string, unknown> = {};
  const status = text(form, "status");
  const payment = text(form, "payment_status");
  const price = text(form, "price");
  if (status) patch.status = status as BookingStatus;
  if (payment) patch.payment_status = payment as PaymentStatus;
  if (price) {
    patch.price = Number(price);
    patch.price_is_estimate = false;
  }
  await updateBooking(text(form, "id"), patch);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
}

export async function createPaymentLinkAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  const booking = await store.get("bookings", id);
  if (!booking) return;

  if (!stripeConfigured()) {
    await createEscalation({
      reason: "payment",
      summary: `Payment link requested but Stripe is not connected`,
      detail: `Booking ${booking.id} for ${booking.customer_name} on ${booking.date}. Connect Stripe, or invoice the client directly.`,
      booking_id: booking.id,
      lead_id: booking.lead_id,
    });
    revalidatePath("/admin/bookings");
    revalidatePath("/admin/escalations");
    return;
  }

  const link = await createPaymentLink(booking);
  if (link.url) {
    await updateBooking(booking.id, {
      payment_link: link.url,
      payment_status: "link_sent",
    });
  }
  revalidatePath("/admin/bookings");
}

/* ---------------------------- escalations ---------------------------- */

export async function approveDraftAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  const escalation = await store.get("escalations", id);
  if (!escalation || !escalation.draft_to) return;

  await sendEmail({
    to: text(form, "to") || escalation.draft_to,
    subject: text(form, "subject") || escalation.draft_subject || "Your enquiry",
    body: text(form, "body") || escalation.draft_body || "",
    lead_id: escalation.lead_id,
    template: "approved_reply",
  });
  await resolveEscalation(id);
  revalidatePath("/admin/escalations");
  revalidatePath("/admin");
}

export async function resolveEscalationAction(form: FormData) {
  await assertAdmin();
  await resolveEscalation(text(form, "id"));
  revalidatePath("/admin/escalations");
  revalidatePath("/admin");
}

/* ------------------------------ pricing ------------------------------ */

export async function savePricingAction(form: FormData) {
  await assertAdmin();
  const current = await store.getPricing();

  const services: ServicePricing[] = current.services.map((service) => ({
    ...service,
    // Published price lists first: these are the figures that actually reach
    // a customer for any service that has them.
    tiers: service.tiers.map((tier) => ({
      ...tier,
      price_by_bedrooms: tier.price_by_bedrooms.map((row) => ({
        ...row,
        price: number(
          form,
          `${service.service_type}_${tier.key}_${row.bedrooms}_price`,
          row.price,
        ),
      })),
    })),
    base_price: number(form, `${service.service_type}_base_price`, service.base_price),
    per_bedroom: number(form, `${service.service_type}_per_bedroom`, service.per_bedroom),
    per_1000_sqft: number(
      form,
      `${service.service_type}_per_1000_sqft`,
      service.per_1000_sqft,
    ),
    minimum_price: number(
      form,
      `${service.service_type}_minimum_price`,
      service.minimum_price,
    ),
    range_spread: number(form, `${service.service_type}_range_spread`, service.range_spread),
    base_hours: number(form, `${service.service_type}_base_hours`, service.base_hours),
    hours_per_unit: number(
      form,
      `${service.service_type}_hours_per_unit`,
      service.hours_per_unit,
    ),
  }));

  const addons: AddonPricing[] = current.addons.map((addon) => ({
    ...addon,
    amount: number(form, `addon_${addon.key}_amount`, addon.amount),
  }));

  const zones: ZonePricing[] = current.zones.map((zone) => ({
    ...zone,
    multiplier: number(form, `zone_${zone.key}_multiplier`, zone.multiplier),
    prefixes: (text(form, `zone_${zone.key}_prefixes`) || zone.prefixes.join(","))
      .split(",")
      .map((prefix) => prefix.trim().toUpperCase())
      .filter(Boolean),
  }));

  const approved = flag(form, "approved");
  const pricing: PricingConfig = {
    ...current,
    approved,
    approved_at: approved
      ? (current.approved ? current.approved_at : new Date().toISOString())
      : null,
    approved_by: approved ? "owner" : null,
    services,
    addons,
    zones,
    default_zone_multiplier: number(
      form,
      "default_zone_multiplier",
      current.default_zone_multiplier,
    ),
    vat_note: text(form, "vat_note") || current.vat_note,
    updated_at: new Date().toISOString(),
  };

  await store.savePricing(pricing);
  revalidatePath("/admin/pricing");
  revalidatePath("/quote");
}

/* ------------------------------ settings ----------------------------- */

export async function saveSettingsAction(form: FormData) {
  await assertAdmin();
  const current = await store.getSettings();
  const settings: Settings = {
    ...current,
    email_auto_send: flag(form, "email_auto_send"),
    followup_1_minutes: number(form, "followup_1_minutes", current.followup_1_minutes),
    followup_2_hours: number(form, "followup_2_hours", current.followup_2_hours),
    capacity_per_slot: Math.max(
      1,
      number(form, "capacity_per_slot", current.capacity_per_slot),
    ),
    retention_months: Math.max(
      1,
      number(form, "retention_months", current.retention_months),
    ),
    business_hours: text(form, "business_hours") || current.business_hours,
    updated_at: new Date().toISOString(),
  };
  await store.saveSettings(settings);
  revalidatePath("/admin/settings");
}

/* ------------------------------- tools ------------------------------- */

export async function runFollowUpsAction() {
  await assertAdmin();
  await runFollowUps();
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
}

export async function runRetentionAction() {
  await assertAdmin();
  await runRetentionSweep();
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/settings");
}

export async function simulateInboundEmailAction(form: FormData) {
  await assertAdmin();
  await handleInboundEmail({
    from: text(form, "from") || "prospect@example.com",
    from_name: text(form, "from_name") || null,
    subject: text(form, "subject") || "Enquiry",
    body: text(form, "body") || "",
  });
  revalidatePath("/admin/escalations");
  revalidatePath("/admin");
}

export async function generateCopyAction(form: FormData) {
  await assertAdmin();
  await generateAdCopy({
    channel: (text(form, "channel") || "google_ads") as MarketingChannel,
    service_type: (text(form, "service_type") || null) as ServiceType | null,
    audience: text(form, "audience") || "Estate and letting agents in London",
    notes: text(form, "notes"),
  });
  revalidatePath("/admin/marketing");
}

/* ------------------------------ mock mode ---------------------------- */

/** Keeps the last run in memory so its records can be removed afterwards. */
let lastSimulation: Awaited<ReturnType<typeof runSimulation>> = null;

export async function runSimulationAction(form: FormData) {
  await assertAdmin();
  const scenario = text(form, "scenario");
  lastSimulation = await runSimulation(scenario);
  revalidatePath("/admin/simulator");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/escalations");
  revalidatePath("/admin");
  redirect(`/admin/simulator?ran=${encodeURIComponent(scenario)}`);
}

export async function purgeSimulationAction() {
  await assertAdmin();
  if (lastSimulation) {
    await purgeSimulation(lastSimulation);
    lastSimulation = null;
  }
  revalidatePath("/admin/simulator");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/escalations");
  revalidatePath("/admin");
  redirect("/admin/simulator");
}

export async function resetDemoDataAction() {
  await assertAdmin();
  await store.reset();
  revalidatePath("/admin", "layout");
}
