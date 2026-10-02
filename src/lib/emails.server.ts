// Email outbox for Night Owl Sitting.
// Every message the app writes is stored in `emails` with its full rendered body so
// the sitter can see exactly what went out. Delivery goes through Lovable's managed
// email once a sender domain is verified; until then rows stay `queued` and are
// visible in the sitter dashboard outbox.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { dollars, rate as fmtRate } from "@/lib/money";
import { clock, eveningLabel, monthDayLong, weekdayLong } from "@/lib/time";

type EmailKind = Database["public"]["Enums"]["email_kind"];

export type EmailDraft = {
  kind: EmailKind;
  toEmail: string;
  toName: string;
  subject: string;
  heading: string;
  lines: string[];
  cta?: { label: string; url: string };
  aside?: string;
  familyId?: string | null;
  bookingId?: string | null;
  offerId?: string | null;
  scheduledFor?: Date;
};

const BRAND = "Night Owl Sitting Co.";
const SIGN_OFF = "— Robin";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmail(d: EmailDraft): { text: string; html: string } {
  const text = [
    BRAND,
    "",
    d.heading,
    "",
    ...d.lines,
    ...(d.cta ? ["", `${d.cta.label}: ${d.cta.url}`] : []),
    ...(d.aside ? ["", d.aside] : []),
    "",
    SIGN_OFF,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0E1220;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#EDEEF2;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-family:Georgia,'Iowan Old Style',serif;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#E8B24C;margin-bottom:18px;">${escapeHtml(BRAND)}</div>
    <div style="background:#171B2B;border:1px solid #262B3D;border-radius:20px;padding:28px 26px;box-shadow:0 18px 40px -20px rgba(0,0,0,.6);">
      <h1 style="font-family:Georgia,'Iowan Old Style',serif;font-weight:500;font-size:26px;line-height:1.2;margin:0 0 16px;color:#EDEEF2;">${escapeHtml(d.heading)}</h1>
      ${d.lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#EDEEF2;">${escapeHtml(l)}</p>`).join("")}
      ${
        d.cta
          ? `<p style="margin:22px 0 6px;"><a href="${escapeHtml(d.cta.url)}" style="display:inline-block;background:#E8B24C;color:#161A1E;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px;">${escapeHtml(d.cta.label)}</a></p>`
          : ""
      }
      ${d.aside ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#9AA0B0;">${escapeHtml(d.aside)}</p>` : ""}
      <p style="margin:22px 0 0;font-size:15px;color:#EDEEF2;">${escapeHtml(SIGN_OFF)}</p>
    </div>
    <p style="margin:18px 4px 0;font-size:12px;color:#9AA0B0;">Night Owl Sitting Co. · Austin, TX · Robin sits Friday and Saturday nights.</p>
  </div>
</body></html>`;
  return { text, html };
}

/** Write the email to the outbox and attempt delivery if it's due now. */
export async function sendEmail(d: EmailDraft) {
  const { text, html } = renderEmail(d);
  const scheduledFor = d.scheduledFor ?? new Date();
  const { data, error } = await supabaseAdmin
    .from("emails")
    .insert({
      kind: d.kind,
      to_email: d.toEmail,
      to_name: d.toName,
      subject: d.subject,
      text_body: text,
      html_body: html,
      family_id: d.familyId ?? null,
      booking_id: d.bookingId ?? null,
      offer_id: d.offerId ?? null,
      scheduled_for: scheduledFor.toISOString(),
      status: "queued",
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not write email: ${error.message}`);
  if (scheduledFor.getTime() <= Date.now()) {
    await attemptDelivery(data.id);
  }
  return data;
}

/**
 * Delivery adapter. Lovable's managed email requires a verified sender domain;
 * until one is configured the message stays queued (visible in the outbox) and
 * is retried by the daily job. Nothing is marked sent unless it really went out.
 */
export async function attemptDelivery(emailId: string): Promise<"sent" | "queued" | "failed"> {
  const { data: row } = await supabaseAdmin.from("emails").select("*").eq("id", emailId).single();
  if (!row || row.status !== "queued") return row?.status === "sent" ? "sent" : "queued";

  const senderReady = Boolean(process.env["LOVABLE_EMAIL_FROM"]);
  if (!senderReady) {
    // Leave queued; the outbox shows "waiting on sender domain".
    return "queued";
  }

  try {
    const { sendManagedEmail } = await import("./email-transport.server");
    await sendManagedEmail({
      to: row.to_email,
      toName: row.to_name,
      subject: row.subject,
      text: row.text_body,
      html: row.html_body,
    });
    await supabaseAdmin
      .from("emails")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
      .eq("id", emailId);
    return "sent";
  } catch (err) {
    await supabaseAdmin
      .from("emails")
      .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .eq("id", emailId);
    return "failed";
  }
}

export async function dispatchDueEmails(): Promise<{ attempted: number; sent: number }> {
  const { data: due } = await supabaseAdmin
    .from("emails")
    .select("id")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .limit(50);
  let sent = 0;
  for (const e of due ?? []) {
    if ((await attemptDelivery(e.id)) === "sent") sent += 1;
  }
  return { attempted: due?.length ?? 0, sent };
}

// ---------- Drafts ----------

type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type EveningRow = Database["public"]["Tables"]["evenings"]["Row"];
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

export function confirmationDraft(args: {
  family: FamilyRow;
  evening: EveningRow;
  booking: BookingRow;
  manageUrl: string;
  refill?: boolean;
}): EmailDraft {
  const { family, evening, booking, manageUrl, refill } = args;
  const day = weekdayLong(evening.starts_at);
  return {
    kind: refill ? "refill_confirmed" : "confirmation",
    toEmail: family.email,
    toName: family.parent_name,
    subject: refill
      ? `You got the ${day}, ${firstName(family.parent_name)}`
      : `You're covered for ${day}, ${firstName(family.parent_name)}`,
    heading: refill ? `The ${day} is yours.` : `You're covered. Go have your night.`,
    lines: [
      `${family.family_name} family · ${eveningLabel(evening.starts_at, evening.ends_at)} Central`,
      `Robin will be at ${family.address} at ${clock(evening.starts_at)}.`,
      `Rate: ${fmtRate(booking.rate_cents)}.`,
      `Your ${dollars(booking.hold_amount_cents)} hold is released after the sit. It's only kept if you cancel inside 24 hours of the start time.`,
    ],
    cta: { label: "See or change this booking", url: manageUrl },
    aside: "Reply to this email or text Robin if anything about the night changes.",
    familyId: family.id,
    bookingId: booking.id,
  };
}

export function reminderDraft(args: {
  family: FamilyRow;
  evening: EveningRow;
  booking: BookingRow;
  manageUrl: string;
  scheduledFor: Date;
}): EmailDraft {
  const { family, evening, booking, manageUrl, scheduledFor } = args;
  return {
    kind: "reminder",
    toEmail: family.email,
    toName: family.parent_name,
    subject: `Tonight: Robin at ${clock(evening.starts_at)}`,
    heading: `Tonight's the night, ${firstName(family.parent_name)}.`,
    lines: [
      `Robin arrives at ${family.address} at ${clock(evening.starts_at)} and stays until ${clock(evening.ends_at)}.`,
      `${fmtRate(booking.rate_cents)} · your ${dollars(booking.hold_amount_cents)} hold is released after the sit.`,
      "Leave a note on the counter with anything new: bedtimes, allergies, the wifi.",
    ],
    cta: { label: "See tonight's details", url: manageUrl },
    familyId: family.id,
    bookingId: booking.id,
    scheduledFor,
  };
}

export function cancellationDraft(args: {
  family: FamilyRow;
  evening: EveningRow;
  booking: BookingRow;
  late: boolean;
}): EmailDraft {
  const { family, evening, booking, late } = args;
  const day = weekdayLong(evening.starts_at);
  return {
    kind: "cancellation",
    toEmail: family.email,
    toName: family.parent_name,
    subject: late ? `Your ${day} is cancelled` : `Your ${day} is cancelled, hold released`,
    heading: `Your ${day} sit is cancelled.`,
    lines: [
      `${family.family_name} family · ${eveningLabel(evening.starts_at, evening.ends_at)} Central`,
      late
        ? `Because it was inside the 24-hour window, the ${dollars(booking.hold_amount_cents)} hold is kept this time. Robin's evening is now offered to the backup list.`
        : `Since it was more than 24 hours out, your ${dollars(booking.hold_amount_cents)} hold has been released.`,
      "Hope to see the kids again soon.",
    ],
    familyId: family.id,
    bookingId: booking.id,
  };
}

export function backupOfferDraft(args: {
  family: FamilyRow;
  evening: EveningRow;
  claimUrl: string;
  expiresAt: Date;
  offerId: string;
}): EmailDraft {
  const { family, evening, claimUrl, expiresAt, offerId } = args;
  const day = weekdayLong(evening.starts_at);
  return {
    kind: "backup_offer",
    toEmail: family.email,
    toName: family.parent_name,
    subject: `A ${day} just opened up — want it?`,
    heading: `${firstName(family.parent_name)}, the ${day} you wanted just freed up.`,
    lines: [
      `${eveningLabel(evening.starts_at, evening.ends_at)} Central, ${monthDayLong(evening.starts_at)}.`,
      `It's yours until ${clock(expiresAt)}. Tap below and Robin is booked at your usual ${fmtRate(family.default_rate_cents)} with the card on file.`,
      "After that it goes to the next family on the list.",
    ],
    cta: { label: "Claim this night", url: claimUrl },
    aside: "$20 hold, released after the sit, keeps your spot.",
    familyId: family.id,
    offerId,
  };
}

export function holdReleasedDraft(args: {
  family: FamilyRow;
  evening: EveningRow;
  booking: BookingRow;
}): EmailDraft {
  const { family, evening, booking } = args;
  return {
    kind: "hold_released",
    toEmail: family.email,
    toName: family.parent_name,
    subject: "Thanks for tonight — hold released",
    heading: `Thanks for tonight, ${firstName(family.parent_name)}.`,
    lines: [
      `The ${weekdayLong(evening.starts_at)} sit is done and your ${dollars(booking.hold_amount_cents)} hold has been released.`,
      "Book the next one any time. Robin's calendar is always current.",
    ],
    familyId: family.id,
    bookingId: booking.id,
  };
}
