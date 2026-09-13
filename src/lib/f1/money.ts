/**
 * How money reads across the app.
 *
 * Every figure in this game — a driver's price, the cost cap, a bank balance, a
 * stake, a payout — is denominated in millions, the way F1 talks about budgets.
 * The app used to print the bare number: "5.0" beside a driver, "100" for the
 * cap, "12.5" in the bank. That asks the reader to remember a unit the screen
 * never states, and it makes a price and a points total look like the same kind
 * of thing when they are not.
 *
 * One function so the unit cannot drift between screens. Points, odds
 * multipliers and lap times are deliberately not money and must not use it.
 */
export function money(value: number, digits = 1): string {
  // The sign belongs outside the dollar sign: "-$4.0M", never "$-4.0M".
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(digits)}M`;
}
