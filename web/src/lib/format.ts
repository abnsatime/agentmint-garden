export function shortAddress(address: string, size = 4) {
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}

/** Format a wei amount without going through floating point. */
export function formatAmount(value: bigint, decimals = 18) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
