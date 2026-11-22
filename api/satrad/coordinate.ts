// Vercel Serverless Function: POST /api/satrad/coordinate

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { lat, lng, name, id } = req.body || {};

  if (id === "ALL") {
    return res.status(200).json({
      success: true,
      satrad: {
        id: "ALL",
        name: "Jaringan Operasi Nasional",
        lat: -2.0,
        lng: 118.0
      }
    });
  }

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ success: false, error: "Koordinat lat/lng tidak valid." });
  }

  return res.status(200).json({
    success: true,
    satrad: {
      id: id || "SATRAD 215",
      name: name || "Congot",
      lat,
      lng
    }
  });
}
