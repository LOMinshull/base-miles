# Base Miles

A private cycling dashboard. It runs on your Mac and keeps your rides in your browser.

## Start it

Double-click `start.command`, or run:

    python3 ~/base-miles/server.py

Then open http://localhost:8642. Always use that address and the same browser, because your imported
rides are stored against it. If macOS blocks the first launch, right-click `start.command` and choose Open.

## On the web

The site also runs on GitHub Pages as plain static files. Only the code is published. Your rides stay in each
browser, so import your archive once on every device you use. Automatic Wahoo updates need `server.py`, so they
only work in the version started on your Mac.

## Add your rides

Go to **Your data** and drop in your Strava archive ZIP. Import a newer archive any time: rides already
imported are matched by start time and updated, not duplicated. Single FIT, GPX and TCX files also work.

## Get Wahoo rides automatically

1. Install Dropbox on this Mac and sign in.
2. In the Wahoo app, go to Profile, then Linked Accounts, connect Dropbox and turn on auto-share.
3. Start the site with `start.command`.

Dropbox syncs each finished ride to this Mac. While the page is open it checks every minute, and it catches
up whenever you open it. **Your data** shows the state of the link. The server looks in your Dropbox folder,
under `Apps` and then at the top level, for a folder with "wahoo" in its name. To point it somewhere else, set
`BASE_MILES_WAHOO_DIR` before starting. New rides are called "Wahoo ride" until a Strava archive names them.

## How the numbers work

- Normalised power: calculated from the ride file, which matches the Wahoo figure to within a few watts.
  Strava's Weighted Average Power runs lower, so it is only used for rides with no file.
- FTP: best 20 to 60 minute efforts in a rolling 120-day window, unless you set one under Zones.
- Max heart rate: third-highest ride peak, unless you set one under Zones.
- Fitness and fatigue: 42-day and 7-day weighted training load, from power, else heart rate, else duration.
- Aerobic efficiency: normalised power divided by average heart rate.
- Trend verdicts compare the last six months with the same six months a year earlier, and only call a
  change when it is larger than normal ride-to-ride variation.

Maps use OpenStreetMap and OpenTopoMap tiles, so the Routes tab needs an internet connection. The route builder
starts from your current location if you allow it, and sends your route points to BRouter for routing, and place searches go to Photon with the map's rough position, so nearby places
come first. Your rides are not sent.
