globalThis.PITCH_CALLER_CONFIG = {
  version: "2026.06.06-v5",
  appName: "Pitch Caller",
  audioBasePath: "audio",
  audioExtension: "m4a",
  testCall: { pitchId: "fastball", zoneId: "middle" },
  pitches: [
    { id: "fastball", label: "Fastball", category: "fastball", requiresZone: true },
    { id: "changeup", label: "Changeup", category: "offSpeed", requiresZone: true },
    { id: "curveball", label: "Curveball", category: "offSpeed", requiresZone: true },
    { id: "pitchout", label: "Pitch Out", category: "pitchout", requiresZone: false, audioFile: "pitchout.m4a" }
  ],
  specialCalls: [
    { id: "first-third-arm", label: "First and Third: Arm", audioFile: "first-third-arm.m4a" },
    { id: "first-third-chest", label: "First and Third: Chest", audioFile: "first-third-chest.m4a" },
    { id: "mound-visit", label: "Mound Visit", audioFile: "mound-visit.m4a" },
    { id: "pick-off", label: "Pick Off", audioFile: "pick-off.m4a" },
    { id: "step-off", label: "Step Off", audioFile: "step-off.m4a" }
  ],
  resultGroups: [
    { id: "pitch", label: "Pitch" },
    { id: "terminal", label: "Terminal" },
    { id: "contact", label: "Contact" }
  ],
  results: [
    { id: "ball", label: "Ball", shortLabel: "Ball", group: "pitch", terminal: false, countsAsStrike: false, positive: false },
    { id: "called_strike", label: "Called Strike", shortLabel: "CS", group: "pitch", terminal: false, countsAsStrike: true, positive: true },
    { id: "swinging_strike", label: "Swinging Strike", shortLabel: "SS", group: "pitch", terminal: false, countsAsStrike: true, positive: true },
    { id: "foul", label: "Foul", shortLabel: "Foul", group: "pitch", terminal: false, countsAsStrike: true, positive: true },
    { id: "k_swinging", label: "K Swinging", shortLabel: "K-S", group: "terminal", terminal: true, terminalType: "k", countsAsStrike: true, positive: true },
    { id: "k_looking", label: "K Looking", shortLabel: "K-L", group: "terminal", terminal: true, terminalType: "k", countsAsStrike: true, positive: true },
    { id: "walk", label: "Walk", shortLabel: "BB", group: "terminal", terminal: true, terminalType: "walk", countsAsStrike: false, positive: false },
    { id: "hbp", label: "HBP", shortLabel: "HBP", group: "terminal", terminal: true, terminalType: "hbp", countsAsStrike: false, positive: false },
    { id: "ground_out", label: "Ground Out", shortLabel: "GO", group: "contact", terminal: true, terminalType: "ground", countsAsStrike: true, positive: true },
    { id: "ground_hit", label: "Ground Hit", shortLabel: "GH", group: "contact", terminal: true, terminalType: "ground", countsAsStrike: true, positive: false },
    { id: "fly_out", label: "Fly Out", shortLabel: "FO", group: "contact", terminal: true, terminalType: "fly", countsAsStrike: true, positive: true },
    { id: "fly_hit", label: "Fly Hit", shortLabel: "FH", group: "contact", terminal: true, terminalType: "fly", countsAsStrike: true, positive: false },
    { id: "line_out", label: "Line Out", shortLabel: "LO", group: "contact", terminal: true, terminalType: "line", countsAsStrike: true, positive: true },
    { id: "line_hit", label: "Line Hit", shortLabel: "LH", group: "contact", terminal: true, terminalType: "line", countsAsStrike: true, positive: false },
    { id: "pop_out", label: "Pop Out", shortLabel: "PO", group: "contact", terminal: true, terminalType: "fly", countsAsStrike: true, positive: true }
  ],
  zones: [
    { id: "middle", label: "Middle" },
    { id: "inside", label: "Inside" },
    { id: "outside", label: "Outside" },
    { id: "high", label: "High" },
    { id: "low", label: "Low" }
  ]
};
