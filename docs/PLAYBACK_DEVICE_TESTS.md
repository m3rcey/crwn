# Playback: the phone checks

Desktop Chrome and phone-sized Chrome (touch, throttled to 4G) are measured automatically by
[scripts/probe-playback.mjs](../scripts/probe-playback.mjs). What a script cannot reach is a real
phone: the lock screen, another app in front, and the installed home-screen app. This page is
those checks. About 10 minutes per phone.

**Setup.** Open an artist page with at least three songs you can play (`thecrwn.app/m3rcey`).
Turn on Settings > Safari > Advanced > Web Inspector if you want to read timings from a Mac,
but you do not need it: every row below is judged by ear and eye.

**The latency target is 200 ms**: the reference was 6 frames, and 6 frames at 30 fps is 200 ms.
By ear: a gap you can count ("one...") is too long; a gap that sounds like the end of one song
and the start of the next with nothing between is in budget.

## Run on each of these

| Platform | How to open CRWN |
|---|---|
| iPhone, Safari | the browser |
| iPhone, home-screen app | Share > Add to Home Screen, then open it from the icon |
| Android, Chrome | the browser |
| Android, installed app | Chrome menu > Install app (or Add to Home screen), then open the icon |

## The checks

| # | Do this | It should |
|---|---|---|
| 1 | Tap song 1 | start within about a second the first time (it comes over the network) |
| 2 | Let song 1 reach its last 10 seconds (drag the bar), keep listening | go straight into song 2 with no audible gap |
| 3 | Tap song 2 again to pause, then tap song 3 | song 3 starts; song 2 never comes back |
| 4 | While playing: Home, another artist, Community, Profile | the same song keeps playing, never restarts |
| 5 | Lock the phone while a song plays | keep playing |
| 6 | With the phone locked, wait for the song to end (drag near the end first) | the next song starts on its own |
| 7 | On the lock screen: pause, play, next, previous, drag the progress bar | each works; title and artwork are the current song |
| 8 | Switch to another app (not a music app) for a minute, come back | the song kept going; the bar and title in CRWN match what you hear |
| 9 | Tap three different songs quickly | only the last one tapped plays |
| 10 | Turn on Airplane mode mid-song, wait past the end, turn it off | the player shows it is stopped or waiting, and works again on the next tap (no frozen screen) |

## What is the phone, not CRWN

These are platform rules, measured or documented, not bugs to chase:

- **Another app taking the audio** (a call, Spotify, a video with sound) pauses CRWN. iOS and
  Android do not hand audio back to a web page on their own; press play.
- **iPhone, row 6.** iOS runs the page's "song ended" handler with the screen locked and lets the
  same player start the next song. A bug in iOS 17.2.1 to 17.4 blocked exactly that and was fixed in
  17.5 (WebKit bug 261554). On those versions row 6 fails and nothing in a web page can fix it.
- **iPhone home-screen app.** Background audio for installed web apps has changed between iOS
  versions. If row 5 or 6 fails ONLY in the home-screen app and passes in Safari, that is iOS.
- **Right after a deploy.** The next tap in an open CRWN tab reloads the page (see TODO: Skew
  Protection). The song resumes where it was; on an iPhone it may come back paused at that spot and
  wait for one tap on play, because Safari does not let a freshly loaded page start sound by itself.
- **Lock-screen buttons.** CRWN shows previous/next track, not 10-second skips, on purpose: iOS
  shows one or the other, and a music queue needs the track buttons.

If a row fails outside those, tell Claude the row number, the phone, and the iOS/Android version.
