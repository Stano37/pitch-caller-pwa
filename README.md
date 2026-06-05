# Pitch Caller PWA

Static one-way catcher audio PWA for iPhone.

## Deploy

Host the contents of this folder on a static HTTPS host such as GitHub Pages, Cloudflare Pages, or Netlify. Open the hosted URL in Safari on the iPhone, use Share, then Add to Home Screen.

## Game-Day Check

Pair the Bluetooth earpiece to the coach phone, open the installed web app, tap Arm Audio, then Test. The app uses the phone's current audio route and does not select Bluetooth devices directly.

## Laptop Preview

You can double-click `index.html` for a quick desktop preview. The app will switch to file preview mode, which can play clips but cannot test service-worker offline caching. Use localhost or an HTTPS static host for the real PWA install/offline test.

## Audio Contract

Pitch/location clips live at:

```text
audio/{pitchId}-{zoneId}.m4a
```

The included clips cover Fastball, Changeup, and Curveball with Middle, Inside, Outside, High, and Low.
