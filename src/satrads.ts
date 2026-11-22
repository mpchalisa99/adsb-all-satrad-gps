export interface SatradItem {
  id: string;         // Short code (e.g. TKT, TPI, TMK)
  idLabel: string;    // Full designator (e.g. SATRAD 211, SATRAD 213, SATRAD 243)
  name: string;       // Geographic location name
  lat: number;        // Decimal Latitude
  lng: number;        // Decimal Longitude
  dmsLat: string;     // Original S/N DMS representation
  dmsLng: string;     // Original E/W DMS representation
  sector: "KOSEK IV (JAKARTA)" | "KOSEK II" | "KOSEK I" | "KOSEK IV (BIAK)";
}

export const SATRADS: SatradItem[] = [
  // --- KOSEK IV (JAKARTA/JAWA) Sector ---
  {
    id: "TKT",
    idLabel: "SATRAD 211",
    name: "Tanjung Kait",
    lat: -6.011667,
    lng: 106.535556,
    dmsLat: "S 06° 00' 42\"",
    dmsLng: "E 106° 32' 08\"",
    sector: "KOSEK IV (JAKARTA)"
  },
  {
    id: "TPI",
    idLabel: "SATRAD 213",
    name: "Tanjung Pinang",
    lat: 1.116667,
    lng: 104.450833,
    dmsLat: "N 001° 07' 013\"",
    dmsLng: "E 104° 27' 003\"",
    sector: "KOSEK IV (JAKARTA)"
  },
  {
    id: "TGA",
    idLabel: "SATRAD 214",
    name: "Tegal",
    lat: -6.868611,
    lng: 109.347222,
    dmsLat: "S 06° 52' 07\"",
    dmsLng: "E 109° 20' 50\"",
    sector: "KOSEK IV (JAKARTA)"
  },
  {
    id: "CGT",
    idLabel: "SATRAD 215",
    name: "Congot",
    lat: -7.900000,
    lng: 110.050000,
    dmsLat: "S 7°54'00\"",
    dmsLng: "E 110° 3'00\"",
    sector: "KOSEK IV (JAKARTA)"
  },
  {
    id: "CBL",
    idLabel: "SATRAD 216",
    name: "Cibalong",
    lat: -7.386997,
    lng: 106.503111,
    dmsLat: "S 07° 23' 13.19''",
    dmsLng: "E 106° 30' 11.2''",
    sector: "KOSEK IV (JAKARTA)"
  },

  // --- KOSEK II Sector ---
  {
    id: "NLI",
    idLabel: "SATRAD 221",
    name: "Ngliyep",
    lat: -8.351667,
    lng: 122.430556,
    dmsLat: "S 8° 21’ 06”",
    dmsLng: "E 122° 25’ 50”",
    sector: "KOSEK II"
  },
  {
    id: "PLO",
    idLabel: "SATRAD 222",
    name: "Ploso",
    lat: -7.377085,
    lng: 112.222264,
    dmsLat: "S 7° 22' 37.507.278\"",
    dmsLng: "E 112° 13' 20.148.755\"",
    sector: "KOSEK II"
  },
  {
    id: "Bpp",
    idLabel: "SATRAD 223",
    name: "Balikpapan",
    lat: -1.261667,
    lng: 116.865000,
    dmsLat: "S 1° 15' 42\"",
    dmsLng: "E 116° 51' 54\"",
    sector: "KOSEK II"
  },
  {
    id: "KWD",
    idLabel: "SATRAD 224",
    name: "Kwandang",
    lat: 0.924222,
    lng: 123.001722,
    dmsLat: "N 00° 55' 27.2\"",
    dmsLng: "E 123° 00' 06.2\"",
    sector: "KOSEK II"
  },
  {
    id: "TRK",
    idLabel: "SATRAD 225",
    name: "Tarakan",
    lat: 3.292608,
    lng: 117.633622,
    dmsLat: "N 03° 17' 33.39\"",
    dmsLng: "W 117° 38' 01.04\"",
    sector: "KOSEK II"
  },
  {
    id: "BRN",
    idLabel: "SATRAD 226",
    name: "Buraen",
    lat: -10.296685,
    lng: 123.856130,
    dmsLat: "S 10° 17' 48.0666\"",
    dmsLng: "E 123° 51' 22.068\"",
    sector: "KOSEK II"
  },

  // --- KOSEK I Sector ---
  {
    id: "Lse",
    idLabel: "SATRAD 231",
    name: "Lhokseumawe",
    lat: 5.110583,
    lng: 97.155917,
    dmsLat: "N 05° 06' 635\"",
    dmsLng: "E 097° 09' 355\"",
    sector: "KOSEK I"
  },
  {
    id: "DMI",
    idLabel: "SATRAD 232",
    name: "Dumai",
    lat: -1.569833,
    lng: 101.372444,
    dmsLat: "S 1° 34' 11.4\"",
    dmsLng: "E 101° 22' 20.8\"",
    sector: "KOSEK I"
  },
  {
    id: "SAB",
    idLabel: "SATRAD 233",
    name: "Sabang",
    lat: 5.887528,
    lng: 95.228361,
    dmsLat: "N 05⁰ 53' 15.1\"",
    dmsLng: "E 095⁰ 13' 42.1\"",
    sector: "KOSEK I"
  },
  {
    id: "SBG",
    idLabel: "SATRAD 234",
    name: "Sibolga",
    lat: 1.909444,
    lng: 98.617778,
    dmsLat: "N 1° 54’ 34\"",
    dmsLng: "E 98° 37’ 04\"",
    sector: "KOSEK I"
  },

  // --- KOSEK IV (BIAK) Sector ---
  {
    id: "Tjw",
    idLabel: "SATRAD 242",
    name: "Tanjung Waropen",
    lat: -2.739500,
    lng: 136.384111,
    dmsLat: "S 02° 44′ 22.2″",
    dmsLng: "E 136° 23′ 2.8″",
    sector: "KOSEK IV (BIAK)"
  },
  {
    id: "TMK",
    idLabel: "SATRAD 243",
    name: "Timika",
    lat: -4.610833,
    lng: 136.860833,
    dmsLat: "S 4° 36' 39\"",
    dmsLng: "E 136° 51' 39\"",
    sector: "KOSEK IV (BIAK)"
  },
  {
    id: "Mre",
    idLabel: "SATRAD 244",
    name: "Merauke",
    lat: -8.545833,
    lng: 140.453361,
    dmsLat: "S 008° 32' 45\"",
    dmsLng: "E 140° 27' 12.1\"",
    sector: "KOSEK IV (BIAK)"
  },
  {
    id: "SMI",
    idLabel: "SATRAD 245",
    name: "Saumlaki",
    lat: -7.910278,
    lng: 131.332500,
    dmsLat: "S 07° 54' 37\"",
    dmsLng: "E 131° 19' 57\"",
    sector: "KOSEK IV (BIAK)"
  }
];
