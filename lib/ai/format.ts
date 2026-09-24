// Small models like to close with "If you want, I can…". The assistant can't
// act on those offers, so drop a trailing offer paragraph.
const OFFER = /\n+\s*(if you(?:'|’)?d? (?:want|like)|would you like|let me know|want me to|i can also)[^\n]*$/i;

export function stripTrailingOffer(text: string): string {
  const trimmed = text.trimEnd();
  const stripped = trimmed.replace(OFFER, "");
  return stripped.trim() ? stripped : trimmed;
}
