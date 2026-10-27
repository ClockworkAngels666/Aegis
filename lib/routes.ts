export type Mode = "sea" | "land" | "air";

/**
 * Typical freight mode for each leg, used only for the illustration:
 * EU -> intermediary, then intermediary -> Russia.
 * Central Asia and the Caucasus are reached by road and rail; Gulf and East Asian
 * hubs by sea; Dubai and Belgrade keep direct flights to Moscow.
 */
export const ROUTE_MODES: Record<string, { first: Mode; onward: Mode }> = {
  KZ: { first: "land", onward: "land" },
  KG: { first: "land", onward: "land" },
  AM: { first: "land", onward: "land" },
  GE: { first: "land", onward: "land" },
  UZ: { first: "land", onward: "land" },
  TJ: { first: "land", onward: "land" },
  AZ: { first: "land", onward: "land" },
  RS: { first: "land", onward: "air" },
  TR: { first: "sea", onward: "sea" },
  AE: { first: "sea", onward: "air" },
  CN: { first: "sea", onward: "land" },
  HK: { first: "sea", onward: "land" },
};

export const MODE_LABEL: Record<Mode, string> = { sea: "sea freight", land: "road & rail", air: "air cargo" };
