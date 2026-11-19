/**
 * Demo geography for Surulere LGA, Lagos.
 * Ward names are the 12 real INEC wards (INEC ward list, 2022 scrape: github.com/dharmzeey/webscraping-electoral).
 * Ward codes and every polling unit below are DEMO records (is_demo = true): INEC's PU directory
 * is not publicly downloadable (locator is captcha-protected), so we do not pretend these are official.
 */
export const SURULERE_WARDS = [
  "ORILE",
  "AGUDA",
  "IJESHATEDO",
  "AKINHANMI/COLE",
  "YABA/OJUELEGBA",
  "IGBAJA/STADIUM",
  "SHITTA/OGUNLANA DRIVE",
  "ADENIRAN/OGUNSANYA",
  "IPONRI HOUSING ESTATE/ERIC MOORE",
  "COKER",
  "ITIRE",
  "IKATE",
] as const;

export type WardName = (typeof SURULERE_WARDS)[number];

export const wardCode = (i: number) => `LA-SUR-${String(i + 1).padStart(2, "0")}`;

export interface DemoPu {
  code: string;
  ward: WardName;
  name: string;
  address: string;
  landmark: string;
  lat: number;
  lng: number;
}

export const DEMO_PUS: DemoPu[] = [
  { code: "LA-SUR-05-001", ward: "YABA/OJUELEGBA", name: "Ojuelegba Primary School I", address: "Ojuelegba Road, Surulere", landmark: "Opposite Ojuelegba bus stop", lat: 6.5085, lng: 3.3672 },
  { code: "LA-SUR-05-002", ward: "YABA/OJUELEGBA", name: "Ojuelegba Primary School II", address: "Ojuelegba Road, Surulere", landmark: "Behind the motor park", lat: 6.5079, lng: 3.3665 },
  { code: "LA-SUR-05-003", ward: "YABA/OJUELEGBA", name: "St. Mary's Catholic School", address: "Ishaga Road, Surulere", landmark: "Beside the Total filling station", lat: 6.5061, lng: 3.3638 },
  { code: "LA-SUR-06-001", ward: "IGBAJA/STADIUM", name: "National Stadium Gate B", address: "Funsho Williams Avenue, Surulere", landmark: "Main stadium car park", lat: 6.4987, lng: 3.3651 },
  { code: "LA-SUR-06-002", ward: "IGBAJA/STADIUM", name: "Igbaja Community Hall", address: "Igbaja Street, Surulere", landmark: "Near Igbaja market", lat: 6.4962, lng: 3.3608 },
  { code: "LA-SUR-08-001", ward: "ADENIRAN/OGUNSANYA", name: "Adeniran Ogunsanya Junior School", address: "Adeniran Ogunsanya Street, Surulere", landmark: "Near the shopping mall", lat: 6.4925, lng: 3.3561 },
  { code: "LA-SUR-08-002", ward: "ADENIRAN/OGUNSANYA", name: "Bode Thomas Open Space", address: "Bode Thomas Street, Surulere", landmark: "By the roundabout", lat: 6.4878, lng: 3.3550 },
  { code: "LA-SUR-03-001", ward: "IJESHATEDO", name: "Ijeshatedo Grammar School", address: "Ijeshatedo Road, Surulere", landmark: "Opposite the police post", lat: 6.4985, lng: 3.3401 },
  { code: "LA-SUR-02-001", ward: "AGUDA", name: "Aguda Market Square", address: "Aguda Road, Surulere", landmark: "Front of the mosque", lat: 6.4932, lng: 3.3462 },
  { code: "LA-SUR-10-001", ward: "COKER", name: "Coker Primary School", address: "Coker Road, Orile", landmark: "Near Coker bus stop", lat: 6.4795, lng: 3.3461 },
];

/** Polling units the team's real phones are assigned to, in order (officials and voters share Ojuelegba so flows connect). */
export const OFFICIAL_PU_ORDER = ["LA-SUR-05-001", "LA-SUR-06-001", "LA-SUR-08-001", "LA-SUR-03-001"] as const;
export const VOTER_PU_ORDER = ["LA-SUR-05-001", "LA-SUR-05-001", "LA-SUR-06-001", "LA-SUR-08-001"] as const;
