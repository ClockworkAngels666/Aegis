/**
 * Main freight corridors between the EU, the intermediary countries and Russia, drawn on the
 * corridor map. Paths are schematic waypoint lines ([longitude, latitude]) along the real
 * shipping lanes, rail lines and road crossings, not observed shipments.
 */

export type CorridorMode = "sea" | "rail" | "road" | "air";
export type Leg = "inbound" | "onward" | "restricted";

/** Line colours by leg, shared by the flat map and the globe. */
export const LEG_COLOR = { inbound: "#2a78d6", onward: "#d03b3b", restricted: "#8f959e" } as const;

export interface Corridor {
  id: string;
  name: string;
  mode: CorridorMode;
  leg: Leg;
  /** Intermediary ISO2 codes this corridor serves. */
  serves: string[];
  note: string;
  path: [number, number][];
  /** Named stops shown when the corridor is active. */
  stops: [string, number, number][];
}

type P = [number, number];
const HAMBURG: P = [9.99, 53.55];
const NUREMBERG: P = [11.08, 49.45];
const MOSCOW: P = [37.62, 55.75];
const EU_TO_GIBRALTAR: P[] = [HAMBURG, [8.5, 54.0], [4.0, 53.2], [1.5, 51.0], [-2.5, 49.9], [-6.0, 48.5],
  [-9.5, 44.5], [-10.0, 38.5], [-9.2, 36.6], [-5.6, 35.95]];
const MED_TO_SUEZ: P[] = [[-2.5, 36.2], [5.0, 37.6], [11.8, 37.0], [18.0, 35.5], [25.0, 34.4], [32.3, 31.6],
  [32.4, 30.5], [32.8, 28.5], [36.0, 24.0], [40.0, 18.5], [43.3, 12.6], [47.5, 12.4]];
const TO_HORMUZ: P[] = [[54.0, 13.5], [59.5, 20.0], [58.5, 24.5], [56.4, 26.5], [55.03, 25.02]];
const DANUBE_RAIL: P[] = [NUREMBERG, [16.37, 48.21], [19.04, 47.5], [21.3, 46.18], [26.1, 44.43]];
const VOLGA_TO_MOSCOW: P[] = [[48.03, 46.35], [44.5, 48.7], [39.2, 51.66], MOSCOW];
const URALS_TO_MOSCOW: P[] = [[61.4, 55.16], [55.97, 54.74], [50.1, 53.2], [45.0, 53.2], MOSCOW];

export const CORRIDORS: Corridor[] = [
  // ---------------------------------------------------------------- EU -> intermediary
  {
    id: "suez-gulf", name: "Suez Canal sea route", mode: "sea", leg: "inbound", serves: ["AE"],
    note: "Container shipping from North Sea ports through the Mediterranean and Red Sea to Jebel Ali.",
    path: [...EU_TO_GIBRALTAR, ...MED_TO_SUEZ, ...TO_HORMUZ],
    stops: [["Suez Canal", 32.4, 30.5], ["Jebel Ali", 55.03, 25.02]],
  },
  {
    id: "cape", name: "Cape of Good Hope diversion", mode: "sea", leg: "inbound", serves: ["AE"],
    note: "The long way round Africa, used by many carriers since the Red Sea attacks of late 2023.",
    path: [...EU_TO_GIBRALTAR.slice(0, 8), [-15.5, 28.5], [-19.0, 14.5], [-12.0, 4.0], [0.0, -3.0], [7.0, -12.0],
      [11.0, -22.0], [18.4, -35.0], [26.0, -36.0], [45.0, -28.0], [55.0, -18.0], [60.0, -5.0], [62.0, 8.0],
      [61.0, 20.0], [58.5, 24.5], [56.4, 26.5], [55.03, 25.02]],
    stops: [["↓ via the Cape of Good Hope", -6.0, -1.5]],
  },
  {
    id: "suez-asia", name: "Suez–Malacca sea route", mode: "sea", leg: "inbound", serves: ["CN", "HK"],
    note: "Container shipping through Suez, the Indian Ocean and the Strait of Malacca to Hong Kong and Shanghai.",
    path: [...EU_TO_GIBRALTAR, ...MED_TO_SUEZ, [55.0, 11.0], [65.0, 9.0], [77.0, 6.0], [81.0, 5.3], [88.0, 6.0],
      [96.0, 6.0], [100.5, 3.0], [104.0, 1.2], [108.5, 8.5], [112.0, 15.0], [114.2, 22.2], [119.5, 24.5],
      [122.0, 31.0]],
    stops: [["Singapore", 103.8, 1.35], ["Hong Kong", 114.2, 22.3], ["Shanghai", 121.5, 31.2]],
  },
  {
    id: "med-turkey", name: "Mediterranean sea route", mode: "sea", leg: "inbound", serves: ["TR"],
    note: "Short-sea shipping to Turkish ports through the Aegean and the Dardanelles.",
    path: [...EU_TO_GIBRALTAR, [-2.5, 36.2], [5.0, 37.6], [11.8, 37.0], [18.0, 35.5], [22.5, 36.0], [25.3, 37.6],
      [25.8, 39.5], [26.4, 40.15], [28.0, 40.7], [28.98, 41.0]],
    stops: [["Istanbul", 28.98, 41.01]],
  },
  {
    id: "balkan-road", name: "Balkan road corridor", mode: "road", leg: "inbound", serves: ["RS", "TR"],
    note: "Trucks via Austria, Hungary, Serbia and Bulgaria to Türkiye.",
    path: [NUREMBERG, [16.37, 48.21], [19.04, 47.5], [20.46, 44.79], [21.9, 43.32], [23.32, 42.7], [26.56, 41.68],
      [28.98, 41.01]],
    stops: [["Vienna", 16.37, 48.21], ["Belgrade", 20.46, 44.79], ["Istanbul", 28.98, 41.01]],
  },
  {
    id: "middle-corridor", name: "Middle Corridor (Trans-Caspian route)", mode: "rail", leg: "inbound",
    serves: ["GE", "AZ", "KZ", "KG", "UZ", "TJ", "AM"],
    note: "Rail with Black Sea and Caspian ferries via Georgia and Azerbaijan; volumes surged after 2022.",
    path: [...DANUBE_RAIL, [28.65, 44.17], [33.0, 43.6], [38.0, 42.9], [41.67, 42.15], [44.79, 41.72], [46.36, 40.68],
      [49.87, 40.41], [50.6, 41.8], [51.2, 43.65], [55.2, 45.3], [65.5, 44.85], [69.6, 42.3], [74.6, 42.87],
      [76.9, 43.25]],
    stops: [["Constanța", 28.65, 44.17], ["Poti", 41.67, 42.15], ["Baku", 49.87, 40.41], ["Aktau", 51.2, 43.65],
      ["Almaty", 76.9, 43.25]],
  },
  {
    id: "uz-tj-rail", name: "Rail to Tashkent and Dushanbe", mode: "rail", leg: "inbound", serves: ["UZ", "TJ"],
    note: "Branch from southern Kazakhstan into Uzbekistan and Tajikistan.",
    path: [[69.6, 42.3], [69.24, 41.31], [66.96, 39.65], [68.78, 38.56]],
    stops: [["Tashkent", 69.24, 41.31], ["Dushanbe", 68.78, 38.56]],
  },
  {
    id: "turkey-caucasus", name: "Black Sea coast road", mode: "road", leg: "inbound", serves: ["GE", "AM", "AZ"],
    note: "Trucks from Istanbul along Türkiye's Black Sea coast to the Sarp crossing and Tbilisi.",
    path: [[28.98, 41.01], [32.0, 41.2], [36.33, 41.29], [39.72, 41.0], [41.56, 41.52], [44.79, 41.72]],
    stops: [["Sarp crossing", 41.56, 41.52], ["Tbilisi", 44.79, 41.72]],
  },
  {
    id: "yerevan-road", name: "Georgia–Armenia road", mode: "road", leg: "inbound", serves: ["AM"],
    note: "Landlocked Armenia is reached by road through Georgia.",
    path: [[44.79, 41.72], [44.65, 41.1], [44.51, 40.18]],
    stops: [["Yerevan", 44.51, 40.18]],
  },
  {
    id: "northern", name: "Northern route via Belarus and Russia", mode: "rail", leg: "restricted",
    serves: ["KZ", "KG", "UZ", "TJ"],
    note: "The pre-2022 overland route. EU sanctions now restrict transit through Russia for these goods, "
      + "which pushed trade onto the Middle Corridor.",
    path: [[13.4, 52.52], [21.01, 52.23], [23.69, 52.1], [27.56, 53.9], [32.05, 54.78], MOSCOW, [50.1, 53.2],
      [55.1, 51.77], [57.2, 50.28], [64.0, 50.6], [71.43, 51.13]],
    stops: [["Brest–Terespol", 23.69, 52.1]],
  },

  // ---------------------------------------------------------------- intermediary -> Russia
  {
    id: "eaeu-north", name: "EAEU internal border", mode: "rail", leg: "onward", serves: ["KZ", "KG"],
    note: "No customs controls inside the Eurasian Economic Union: goods cleared in Kazakhstan or "
      + "Kyrgyzstan can move on to Russia unchecked.",
    path: [[76.9, 43.25], [74.98, 46.85], [71.43, 51.13], [69.15, 54.87], [65.34, 55.44], ...URALS_TO_MOSCOW],
    stops: [["Astana", 71.43, 51.13], ["Petropavl", 69.15, 54.87], ["Moscow", ...MOSCOW]],
  },
  {
    id: "west-kz", name: "Rail through western Kazakhstan", mode: "rail", leg: "onward", serves: ["UZ", "TJ"],
    note: "Central Asian rail freight crosses Kazakhstan (EAEU) to Orenburg and Samara.",
    path: [[69.24, 41.31], [69.6, 42.3], [65.5, 44.85], [57.2, 50.28], [55.1, 51.77], [50.1, 53.2], [45.0, 53.2], MOSCOW],
    stops: [["Orenburg", 55.1, 51.77], ["Moscow", ...MOSCOW]],
  },
  {
    id: "upper-lars", name: "Upper Lars crossing", mode: "road", leg: "onward", serves: ["GE", "AM"],
    note: "The only operating road crossing between Georgia and Russia; long truck queues since 2022.",
    path: [[44.51, 40.18], [44.79, 41.72], [44.63, 42.74], [44.68, 43.03], [39.72, 47.23], [39.2, 51.66], MOSCOW],
    stops: [["Upper Lars", 44.63, 42.74], ["Rostov-on-Don", 39.72, 47.23], ["Moscow", ...MOSCOW]],
  },
  {
    id: "caspian-coast", name: "Caspian coast road", mode: "road", leg: "onward", serves: ["AZ"],
    note: "Road from Baku through Dagestan to Astrakhan and the Volga.",
    path: [[49.87, 40.41], [48.29, 42.06], [47.5, 42.98], ...VOLGA_TO_MOSCOW],
    stops: [["Derbent", 48.29, 42.06], ["Astrakhan", 48.03, 46.35], ["Moscow", ...MOSCOW]],
  },
  {
    id: "instc", name: "North–South corridor via Iran", mode: "sea", leg: "onward", serves: ["AE"],
    note: "Shipping to Bandar Abbas, Iranian rail to the Caspian and on to Astrakhan; expanded by Russia and Iran since 2022.",
    path: [[55.03, 25.02], [56.0, 26.3], [56.27, 27.18], [54.37, 31.9], [51.39, 35.69], [49.47, 37.47], [50.8, 40.5],
      [50.5, 43.5], [49.6, 45.4], ...VOLGA_TO_MOSCOW],
    stops: [["Bandar Abbas", 56.27, 27.18], ["Tehran", 51.39, 35.69], ["Astrakhan", 48.03, 46.35], ["Moscow", ...MOSCOW]],
  },
  {
    id: "gulf-air", name: "Dubai–Moscow air cargo", mode: "air", leg: "onward", serves: ["AE"],
    note: "Frequent direct flights continue; the UAE does not apply EU sanctions.",
    path: [[55.36, 25.25], MOSCOW], stops: [],
  },
  {
    id: "black-sea", name: "Black Sea to Novorossiysk", mode: "sea", leg: "onward", serves: ["TR"],
    note: "Turkish ports ship across the Black Sea to Russian ports.",
    path: [[28.98, 41.01], [29.1, 41.25], [32.0, 42.6], [35.5, 43.6], [37.77, 44.72], [38.98, 45.04], [39.72, 47.23],
      [39.2, 51.66], MOSCOW],
    stops: [["Novorossiysk", 37.77, 44.72], ["Moscow", ...MOSCOW]],
  },
  {
    id: "china-rail", name: "Manzhouli–Zabaikalsk and Trans-Siberian", mode: "rail", leg: "onward",
    serves: ["CN", "HK"],
    note: "The main China–Russia rail crossing, then the Trans-Siberian railway west to Moscow.",
    path: [[121.47, 31.23], [116.4, 39.9], [118.9, 42.26], [119.7, 49.2], [117.43, 49.6], [113.5, 52.03],
      [107.6, 51.83], [104.3, 52.29], [92.87, 56.01], [82.92, 55.03], [73.37, 54.99], ...URALS_TO_MOSCOW],
    stops: [["Manzhouli", 117.43, 49.6], ["Novosibirsk", 82.92, 55.03], ["Moscow", ...MOSCOW]],
  },
  {
    id: "hk-mainland", name: "Hong Kong to mainland China", mode: "road", leg: "onward", serves: ["HK"],
    note: "Re-exports trucked into mainland China before the rail leg to Russia.",
    path: [[114.17, 22.32], [113.26, 23.13], [114.3, 30.6], [116.4, 39.9]],
    stops: [["Hong Kong", 114.17, 22.32], ["Beijing", 116.4, 39.9]],
  },
  {
    id: "belgrade-air", name: "Belgrade–Moscow flights", mode: "air", leg: "onward", serves: ["RS"],
    note: "Serbia keeps direct flights to Moscow and has not aligned with EU sanctions.",
    path: [[20.46, 44.79], MOSCOW], stops: [["Belgrade", 20.46, 44.79], ["Moscow", ...MOSCOW]],
  },
];

/** Marker positions (capitals or main hubs) for country flags. */
export const MARKERS: Record<string, { at: [number, number]; offset?: [number, number] }> = {
  KZ: { at: [67.0, 48.3] }, KG: { at: [74.6, 42.87], offset: [6, 6] }, AM: { at: [44.51, 40.18], offset: [-10, 8] },
  GE: { at: [44.79, 41.72], offset: [-4, -10] }, UZ: { at: [64.6, 41.4] }, TJ: { at: [71.0, 38.7] },
  AZ: { at: [49.87, 40.41], offset: [8, 4] }, TR: { at: [32.86, 39.93] }, AE: { at: [54.4, 24.0] },
  CN: { at: [104.0, 35.0] }, HK: { at: [114.17, 22.32], offset: [8, 6] }, RS: { at: [20.46, 44.79], offset: [-8, 4] },
  RU: { at: [37.62, 55.75] }, BY: { at: [27.56, 53.9] },
  DE: { at: [10.45, 51.17] }, FR: { at: [2.35, 46.8] }, IT: { at: [12.5, 42.8] }, NL: { at: [5.3, 52.2] },
  PL: { at: [19.4, 52.1] }, AT: { at: [14.5, 47.6] }, CZ: { at: [15.4, 49.8] }, EU27_2020: { at: [4.35, 50.85] },
};

export const INTERMEDIARY_CODES = ["KZ", "KG", "AM", "GE", "UZ", "TJ", "AZ", "TR", "AE", "CN", "HK", "RS"];

/** ISO 3166-1 numeric ids (as used by world-atlas) for country shading. */
export const NUMERIC: Record<string, string> = {
  DE: "276", FR: "250", IT: "380", NL: "528", PL: "616", AT: "040", CZ: "203", KZ: "398", KG: "417", AM: "051",
  GE: "268", UZ: "860", TJ: "762", AZ: "031", TR: "792", AE: "784", CN: "156", HK: "344", RS: "688", RU: "643",
  BY: "112",
};
export const EU27_NUMERIC = ["040", "056", "100", "191", "196", "203", "208", "233", "246", "250", "276", "300",
  "348", "372", "380", "428", "440", "442", "470", "528", "616", "620", "642", "703", "705", "724", "752"];
