// Robin's text-back brain. Runs through the Lovable AI gateway (no external key).
// The model reads the parent's message, recognises the family, works out the night they
// want and picks ONLY from Robin's real open evenings that we hand it.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rate as fmtRate, dollars } from "@/lib/money";
import { CENTRAL_TZ, eveningLabel, eveningShort, weekdayLong } from "@/lib/time";
import {
  createBookingLinks,
  housekeeping,
  listFamilies,
  toPublicFamily,
  type EveningRow,
  type FamilyRow,
  type PublicFamily,
} from "@/lib/night-owl.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

export type InboundOption = {
  eveningId: string;
  token: string;
  label: string;
  short: string;
  startsAt: string;
  endsAt: string;
  kind: "fit" | "nearest";
};

export type InboundReply = {
  requestId: string;
  family: PublicFamily | null;
  senderName: string | null;
  desiredWindow: string;
  reply: string;
  options: InboundOption[];
  offerBackup: boolean;
  backupWeekend: string | null;
  robinStatus: string;
};

type Decision = {
  family_id: string | null;
  sender_name: string | null;
  desired_window: string;
  fit_evening_ids: string[];
  nearest_evening_id: string | null;
  offer_backup_list: boolean;
  backup_weekend_friday: string | null;
  reply: string;
};

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Deterministic hint: match a family by phone digits or family name before the model runs. */
function matchFamily(families: FamilyRow[], message: string, senderName?: string | null, senderPhone?: string | null) {
  const phone = digits(senderPhone);
  if (phone.length >= 7) {
    const hit = families.find((f) => digits(f.phone).endsWith(phone.slice(-7)));
    if (hit) return hit;
  }
  const hay = `${senderName ?? ""} ${message}`.toLowerCase();
  return (
    families.find((f) => hay.includes(f.family_name.toLowerCase())) ??
    families.find((f) => hay.includes((f.parent_name.split(" ")[0] ?? "").toLowerCase())) ??
    null
  );
}

async function robinStatusNow(): Promise<string> {
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("evenings")
    .select("starts_at, ends_at, status")
    .eq("status", "booked")
    .lte("starts_at", now)
    .gte("ends_at", now)
    .limit(1);
  if (data && data.length) return "mid-sit";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TZ, hour: "numeric", hour12: false }).format(new Date()),
  );
  if (hour >= 9 && hour < 15) return "in class";
  if (hour >= 23 || hour < 8) return "asleep";
  return "away from the phone";
}

export async function answerInbound(args: {
  message: string;
  senderName?: string | null | undefined;
  senderPhone?: string | null | undefined;
  channel: "inbound" | "web";
  familyId?: string | null | undefined;
}): Promise<InboundReply> {
  await housekeeping();
  const now = new Date();
  const families = await listFamilies();
  const { data: eveningRows } = await supabaseAdmin
    .from("evenings")
    .select("*")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + 35 * 86_400_000).toISOString())
    .order("starts_at");
  const evenings: EveningRow[] = eveningRows ?? [];
  const openEvenings = evenings.filter((e) => e.status === "open");

  const hinted = args.familyId
    ? families.find((f) => f.id === args.familyId) ?? null
    : matchFamily(families, args.message, args.senderName, args.senderPhone);
  const status = await robinStatusNow();

  const nowLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  const system = `You are the text-back assistant for Robin, a solo babysitter in Austin who runs Night Owl Sitting Co. Robin is currently ${status} and cannot answer, so you reply on Robin's behalf in Robin's own voice: warm, brief, specific, a little playful, never corporate. First person as Robin. No emojis. No exclamation-mark pileups. Two to four short sentences.

Hard rules:
- Only offer evenings from the OPEN list below. Never invent availability. Never offer a booked evening.
- Work out which evening(s) the parent means from their words ("this Saturday", "next Friday", "a night in two weeks", a date). "This weekend" means the nearest upcoming Friday/Saturday. Today is ${nowLabel} Central time.
- If one or more OPEN evenings fit what they asked, list them as fit_evening_ids (soonest first) and say the parent can tap a night to book it; the app adds the buttons.
- If nothing fits, set fit_evening_ids to [] and pick the nearest OPEN evening to what they wanted as nearest_evening_id, and set offer_backup_list true with backup_weekend_friday = the Friday (YYYY-MM-DD) of the weekend they actually wanted, so they can join the backup list in case it frees up.
- If the family is recognised, use the parent's first name and their known rate naturally when relevant; mention a kid by name only if it fits. Do not mention the address or phone.
- If the sender is not a known family, be kind, say Robin sits for a small circle of repeat families but is glad to hear from them, still offer open evenings if any, and ask them to leave a name and number.
- Mention the $20 hold only in passing if at all ("$20 hold, released after the sit").
- Do not say you are an AI. Do not promise anything not on the calendar.`;

  const familyLines = families
    .map(
      (f) =>
        `- id=${f.id} | ${f.family_name} family | parent ${f.parent_name} | phone ${f.phone} | ${f.kids_summary} | ${fmtRate(f.default_rate_cents)} | notes: ${f.notes}`,
    )
    .join("\n");
  const eveningLines = evenings
    .map(
      (e) =>
        `- id=${e.id} | ${eveningLabel(e.starts_at, e.ends_at)} Central | ${e.status === "open" ? "OPEN" : "BOOKED"}`,
    )
    .join("\n");

  const user = `Families Robin sits for:
${familyLines}

Robin's calendar for the next five weeks (Central time):
${eveningLines}

Deterministic match hint: ${hinted ? `${hinted.family_name} family (id=${hinted.id})` : "no match by name or phone"}.
Sender name given: ${args.senderName || "(none)"}. Sender phone given: ${args.senderPhone || "(none)"}.

Incoming message:
"""${args.message.trim()}"""`;

  const tool = {
    type: "function",
    function: {
      name: "compose_reply",
      description: "Decide who is texting, which evening they want, and write Robin's reply.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          family_id: { type: ["string", "null"], description: "Matched family id or null" },
          sender_name: { type: ["string", "null"], description: "Best guess at the sender's name" },
          desired_window: { type: "string", description: "Short human summary of what they asked for, e.g. 'this Saturday night'" },
          fit_evening_ids: { type: "array", items: { type: "string" }, description: "OPEN evening ids that fit, soonest first, max 3" },
          nearest_evening_id: { type: ["string", "null"], description: "Nearest OPEN evening when nothing fits, else null" },
          offer_backup_list: { type: "boolean" },
          backup_weekend_friday: { type: ["string", "null"], description: "YYYY-MM-DD Friday of the weekend they wanted, when offering the backup list" },
          reply: { type: "string", description: "Robin's reply text, 2–4 short sentences, no links" },
        },
        required: [
          "family_id",
          "sender_name",
          "desired_window",
          "fit_evening_ids",
          "nearest_evening_id",
          "offer_backup_list",
          "backup_weekend_friday",
          "reply",
        ],
      },
    },
  };

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  let decision: Decision | null = null;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "compose_reply" } },
        temperature: 0.5,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[ai] gateway ${res.status}: ${body}`);
      if (res.status === 429) throw new Error("Robin's text-back is catching its breath (rate limit). Try again in a moment.");
      if (res.status === 402) throw new Error("The AI workspace is out of credits. Top up to keep text-back running.");
      throw new Error(`AI gateway error ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const msg = json.choices?.[0]?.message;
    const raw = msg?.tool_calls?.[0]?.function?.arguments ?? msg?.content ?? "";
    decision = parseDecision(raw);
  } catch (err) {
    console.error("[ai] falling back to deterministic reply:", err);
  }

  const openIds = new Set(openEvenings.map((e) => e.id));
  const family = decision?.family_id ? families.find((f) => f.id === decision!.family_id) ?? hinted : hinted;
  let fitIds = (decision?.fit_evening_ids ?? []).filter((id) => openIds.has(id)).slice(0, 3);
  let nearestId = decision?.nearest_evening_id && openIds.has(decision.nearest_evening_id) ? decision.nearest_evening_id : null;
  if (!decision) {
    // Deterministic fallback: soonest open evenings.
    fitIds = openEvenings.slice(0, 2).map((e) => e.id);
  }
  if (!fitIds.length && !nearestId && openEvenings.length) nearestId = openEvenings[0]?.id ?? null;

  const offerBackup = Boolean(decision?.offer_backup_list) || (!fitIds.length && !!decision);
  const backupWeekend = decision?.backup_weekend_friday ?? null;
  const desiredWindow = decision?.desired_window || "a date night";
  const reply = decision?.reply?.trim() || fallbackReply(family, fitIds, nearestId, evenings);

  // Persist the request, then mint one-tap links (only if we know the family).
  const { data: request, error } = await supabaseAdmin
    .from("requests")
    .insert({
      family_id: family?.id ?? null,
      message: args.message.trim(),
      desired_window: desiredWindow,
      channel: args.channel,
      sender_name: args.senderName?.trim() || decision?.sender_name || null,
      sender_phone: args.senderPhone?.trim() || null,
      reply_text: reply,
      matched_evening_ids: [...fitIds, ...(nearestId ? [nearestId] : [])],
      answered_while_unavailable: args.channel === "inbound",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const optionIds = [...fitIds, ...(nearestId && !fitIds.includes(nearestId) ? [nearestId] : [])];
  const links = family
    ? await createBookingLinks({ familyId: family.id, eveningIds: optionIds, requestId: request.id, source: "inbound" })
    : [];
  const byEvening = new Map(links.map((l) => [l.eveningId, l.token]));
  const options: InboundOption[] = optionIds
    .map((id) => evenings.find((e) => e.id === id))
    .filter((e): e is EveningRow => Boolean(e))
    .map((e) => ({
      eveningId: e.id,
      token: byEvening.get(e.id) ?? "",
      label: eveningLabel(e.starts_at, e.ends_at),
      short: eveningShort(e.starts_at),
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      kind: fitIds.includes(e.id) ? "fit" : "nearest",
    }));

  return {
    requestId: request.id,
    family: family ? toPublicFamily(family) : null,
    senderName: args.senderName?.trim() || decision?.sender_name || null,
    desiredWindow,
    reply,
    options,
    offerBackup,
    backupWeekend,
    robinStatus: status,
  };
}

function parseDecision(raw: string): Decision | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    const obj = JSON.parse(cleaned) as Partial<Decision>;
    if (typeof obj.reply !== "string") return null;
    return {
      family_id: typeof obj.family_id === "string" && obj.family_id ? obj.family_id : null,
      sender_name: typeof obj.sender_name === "string" ? obj.sender_name : null,
      desired_window: typeof obj.desired_window === "string" ? obj.desired_window : "",
      fit_evening_ids: Array.isArray(obj.fit_evening_ids) ? obj.fit_evening_ids.filter((x): x is string => typeof x === "string") : [],
      nearest_evening_id: typeof obj.nearest_evening_id === "string" && obj.nearest_evening_id ? obj.nearest_evening_id : null,
      offer_backup_list: Boolean(obj.offer_backup_list),
      backup_weekend_friday: typeof obj.backup_weekend_friday === "string" && obj.backup_weekend_friday ? obj.backup_weekend_friday : null,
      reply: obj.reply,
    };
  } catch {
    return null;
  }
}

function fallbackReply(family: FamilyRow | null, fitIds: string[], nearestId: string | null, evenings: EveningRow[]): string {
  const name = family ? family.parent_name.split(" ")[0] : "there";
  const fits = fitIds.map((id) => evenings.find((e) => e.id === id)).filter(Boolean) as EveningRow[];
  if (fits.length) {
    const list = fits.map((e) => `${weekdayLong(e.starts_at)} the ${eveningShort(e.starts_at).split(" ").pop()}`).join(" or ");
    return `Hi ${name}, I'm mid-sit so this is my auto-reply, but my calendar is live. I've got ${list} open, 6 to 11. Tap one and you're covered; the ${dollars(2000)} hold is released after the sit.`;
  }
  const near = nearestId ? evenings.find((e) => e.id === nearestId) : null;
  return near
    ? `Hi ${name}, I'm tied up right now but I checked the calendar and the night you asked about is taken. The nearest open one is ${eveningLabel(near.starts_at, near.ends_at)}. Tap to grab it, or join the backup list and you'll get first dibs if the other night frees up.`
    : `Hi ${name}, I'm tied up right now and the next few weekends are full. Join the backup list and you'll get a one-tap link the moment a night frees up.`;
}
