globalThis.PITCH_CALLER_CONFIG = {
  version: "2026.06.05-v3",
  appName: "Pitch Caller",
  audioBasePath: "audio",
  audioExtension: "m4a",
  testCall: { pitchId: "fastball", zoneId: "middle" },
  pitches: [
    { id: "fastball", label: "Fastball", category: "fastball" },
    { id: "changeup", label: "Changeup", category: "offSpeed" },
    { id: "curveball", label: "Curveball", category: "offSpeed" }
  ],
  results: [
    { id: "strike_looking", label: "Strike looking", shortLabel: "KL", type: "strike", positive: true },
    { id: "strike_swinging", label: "Strike swinging", shortLabel: "KS", type: "strike", positive: true },
    { id: "foul", label: "Foul", shortLabel: "Foul", type: "strike", positive: true },
    { id: "ball", label: "Ball", shortLabel: "Ball", type: "ball", positive: false },
    { id: "in_play_out", label: "In play out", shortLabel: "Out", type: "contact", positive: true },
    { id: "hit", label: "Hit", shortLabel: "Hit", type: "contact", positive: false },
    { id: "hbp", label: "HBP", shortLabel: "HBP", type: "ball", positive: false }
  ],
  zones: [
    { id: "middle", label: "Middle" },
    { id: "inside", label: "Inside" },
    { id: "outside", label: "Outside" },
    { id: "high", label: "High" },
    { id: "low", label: "Low" }
  ]
};
