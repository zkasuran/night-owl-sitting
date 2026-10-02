export function dollars(cents: number, opts: { cents?: boolean } = {}): string {
  const showCents = opts.cents ?? cents % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(cents / 100);
}

export function rate(cents: number): string {
  return `${dollars(cents)}/hr`;
}

export const HOLD_AMOUNT_CENTS = 2000;
export const HOLD_COPY = "$20 hold, released after the sit, keeps your spot.";
