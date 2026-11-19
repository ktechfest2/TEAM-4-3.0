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

export interface DemoPerson {
  key: string;
  displayName: string;
  /** +234000… range; never assigned by Nigerian operators, never dialled by the dialer. */
  phone: string;
  roles: { kind: "verifier" | "official" | "supervisor"; ward: WardName; puCode?: string; affiliation?: string }[];
  subscriptions?: { puCode: string; needs: string[] }[];
}

export const DEMO_PEOPLE: DemoPerson[] = [
  { key: "v1", displayName: "Alhaji Musa (community leader)", phone: "+2340001000001", roles: [{ kind: "verifier", ward: "YABA/OJUELEGBA", affiliation: "community" }] },
  { key: "v2", displayName: "Mrs Adebayo (observer)", phone: "+2340001000002", roles: [{ kind: "verifier", ward: "YABA/OJUELEGBA", affiliation: "observer" }] },
  { key: "v3", displayName: "Pastor Okeke (faith leader)", phone: "+2340001000003", roles: [{ kind: "verifier", ward: "IGBAJA/STADIUM", affiliation: "faith" }] },
  { key: "v4", displayName: "Chinedu (party agent, Party A)", phone: "+2340001000004", roles: [{ kind: "verifier", ward: "IGBAJA/STADIUM", affiliation: "party_a" }] },
  { key: "v5", displayName: "Fatima (party agent, Party B)", phone: "+2340001000005", roles: [{ kind: "verifier", ward: "ADENIRAN/OGUNSANYA", affiliation: "party_b" }] },
  { key: "o1", displayName: "PO Bello", phone: "+2340002000001", roles: [{ kind: "official", ward: "IGBAJA/STADIUM", puCode: "LA-SUR-06-001" }] },
  { key: "o2", displayName: "PO Ogunleye", phone: "+2340002000002", roles: [{ kind: "official", ward: "ADENIRAN/OGUNSANYA", puCode: "LA-SUR-08-001" }] },
  { key: "s1", displayName: "Supervisor Eze (Stadium ward)", phone: "+2340003000001", roles: [{ kind: "supervisor", ward: "IGBAJA/STADIUM" }] },
  { key: "p1", displayName: "Mama Ronke", phone: "+2340004000001", roles: [], subscriptions: [{ puCode: "LA-SUR-05-001", needs: ["elderly", "mobility"] }] },
  { key: "p2", displayName: "Baba Sule", phone: "+2340004000002", roles: [], subscriptions: [{ puCode: "LA-SUR-05-001", needs: ["low_vision"] }] },
  { key: "p3", displayName: "Amaka", phone: "+2340004000003", roles: [], subscriptions: [{ puCode: "LA-SUR-05-001", needs: [] }] },
  { key: "p4", displayName: "Tunde", phone: "+2340004000004", roles: [], subscriptions: [{ puCode: "LA-SUR-06-001", needs: [] }] },
  { key: "p5", displayName: "Grace", phone: "+2340004000005", roles: [], subscriptions: [{ puCode: "LA-SUR-08-001", needs: ["hearing"] }] },
];

/**
 * Team phones (from DEMO_TEAM_PHONES) get real roles so live calls exercise every flow:
 *  team[0]: verifier (YABA/OJUELEGBA, community) + presiding officer of LA-SUR-05-001
 *  team[1]: verifier (YABA/OJUELEGBA, observer) + supervisor of YABA/OJUELEGBA + voter subscribed to LA-SUR-05-001
 */
export const TEAM_ASSIGNMENTS: Omit<DemoPerson, "phone" | "key">[] = [
  {
    displayName: "Team phone 1",
    roles: [
      { kind: "verifier", ward: "YABA/OJUELEGBA", affiliation: "community" },
      { kind: "official", ward: "YABA/OJUELEGBA", puCode: "LA-SUR-05-001" },
    ],
  },
  {
    displayName: "Team phone 2",
    roles: [
      { kind: "verifier", ward: "YABA/OJUELEGBA", affiliation: "observer" },
      { kind: "supervisor", ward: "YABA/OJUELEGBA" },
    ],
    subscriptions: [{ puCode: "LA-SUR-05-001", needs: [] }],
  },
];
