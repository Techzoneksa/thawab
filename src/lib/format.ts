// Number/currency/percentage formatters (Arabic locale). No demo data here.

// "ar-SA-u-nu-latn" = Arabic locale, Latin (Western) digits — never Arabic-Indic.
export const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 0 }).format(n) + " ر.س";
export const fmtNum = (n: number) => new Intl.NumberFormat("ar-SA-u-nu-latn").format(n);
export const fmtPct = (n: number) => `${n}%`;
