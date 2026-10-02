// Transport for Lovable's managed email. Activated once a verified sender domain
// sets LOVABLE_EMAIL_FROM; until then `attemptDelivery` never reaches this file.
export async function sendManagedEmail(args: {
  to: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const from = process.env["LOVABLE_EMAIL_FROM"];
  const endpoint = process.env["LOVABLE_EMAIL_ENDPOINT"];
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!from || !endpoint || !apiKey) {
    throw new Error("Managed email is not configured yet");
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Robin at Night Owl Sitting <${from}>`,
      to: [{ email: args.to, name: args.toName }],
      subject: args.subject,
      text: args.text,
      html: args.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email provider refused the message [${res.status}]: ${body}`);
  }
}
