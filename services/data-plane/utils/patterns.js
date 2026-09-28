// Value-level predicates shared by the profiler and the rule executor.

export const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}/,        // YYYY-MM-DD
  /^\d{2}\/\d{2}\/\d{4}/,      // MM/DD/YYYY or DD/MM/YYYY
  /^\d{2}\/\d{4}/,             // MM/YYYY
  /^\d{4}$/                    // YYYY (only if reasonable range)
];

export const NUMERIC_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const TAX_PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const CARD_DIGITS_RE = /^\d{13,19}$/;
export const PHONE_RE = /^\+?\d{7,15}$/;

// ISO 4217 active codes.
export const ISO_4217 = new Set(`AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD
CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL
HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD
MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR
SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND
VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL`.split(/\s+/));

export const isMissing = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export const isNumericValue = (v) => (typeof v === "number" ? Number.isFinite(v) : NUMERIC_RE.test(String(v).trim()));

export const isLikelyDate = (v) => {
  if (typeof v !== "string" || v.trim() === "") return false;
  if (!isNaN(v) && (v.length > 4 || Number(v) > 2100)) return false;
  return DATE_PATTERNS.some((p) => p.test(v)) && !isNaN(Date.parse(v));
};

export const stripSeparators = (v) => String(v).replace(/[\s\-()]/g, "");

export const luhnValid = (digits) => {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
};

export const isValidCardNumber = (v) => {
  const d = stripSeparators(v);
  return CARD_DIGITS_RE.test(d) && luhnValid(d);
};

// Format mask of a value: A=upper, a=lower, 9=digit, punctuation kept. Reveals
// structure (e.g. "AAAAA9999A") without revealing content.
export const shapeOf = (v, maxLen = 24) => {
  const s = String(v);
  const shape = s.slice(0, maxLen).replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/[0-9]/g, "9");
  return s.length > maxLen ? `${shape}…(${s.length})` : shape;
};
