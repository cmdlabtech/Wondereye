# Wondereye Privacy

The public page is the site route `/privacy` (`packages/web/src/components/privacy-page.tsx`). This file is the same policy in Markdown. CMDLAB LLC operates Wondereye. Contact: contact@cmdlab.tech.

Effective date: October 29, 2026

## Location

The G2 glasses have no GPS. When location is on, the glasses app asks the Even Realities app on the phone for a position. A phone setting (`wondereye-geo`) turns location on or off. A successful fix is saved on the phone as `wondereye-last-location`. If a new fix fails, or location is off, the app uses that saved position. With no saved position, it uses a fixed point in Prague so a list can still load.

The glasses app sends latitude, longitude, a search radius, a language code, and an anonymous explorer label in the body of `POST /api/landmarks`. The request address does not include the coordinates. The API rounds coordinates to three decimal places, about 110 meters, before it searches and before it writes a cache entry. The radius (`wondereye-radius`) is between 250 and 2,000 meters.

The phone asks OpenStreetMap Nominatim for a city, town, or village name, using coordinates rounded to two decimal places, about 1.1 kilometers. Those rounded coordinates are part of the Nominatim request address.

A page address can include `lat` and `lng`. When those values are valid, the app uses them as the position. That path is there for the simulator.

Heading from the glasses is used on the phone and is left out of requests to the Wondereye API.

The website globe does not ask the browser for your position. On wondereye.app it requests the public map. Search on the globe sends the text you type to Nominatim.

## Landmark notes

The Worker asks English Wikipedia (GeoSearch) and public Overpass for nearby places. The Wikipedia request includes the rounded coordinates in its address. The Overpass request sends them in the request body. A Wikidata id may be used as a hint for which place is meant.

Short notes are written by xAI (grok-4.3, chat completions), including the rounded coordinates. That call does not set `store`. English notes can be saved on the public globe. Other supported languages are cached for the glasses and left off that map.

A longer note is `POST /api/landmark-detail`. The app sends place details, including the place's coordinates and the distance from you, in the request body. The Worker asks xAI (grok-4.3, responses, search limited to grokipedia.com) and sets `store` to false.

xAI may keep API requests and responses for up to 30 days for abuse monitoring. xAI says it deletes them after that period, and that it does not use API inputs or outputs to train its models without explicit permission. Setting `store` to false does not change that retention. The same retention applies to short notes, longer notes, and voice transcription.

## Voice search

Voice search records from the glasses microphone, stops after a short silence or at ten seconds, and sends a WAV file plus the on-screen landmark names in the body of `POST /api/transcribe`. The Worker forwards the audio to xAI speech-to-text (`api.x.ai/v1/stt`, grok-voice-transcribe-2.0), then asks xAI to match the words to a name. The audio file is not written to the Wondereye cache. Files larger than 2 megabytes are refused. `store: false` is not set on this call.

## Feedback

Cloudflare Turnstile runs before a message is accepted. The form takes a category (bug, idea, or other), an optional title, and a message. It has no email field. A repeat of the same message within about 24 hours is discarded.

If the checks pass and feedback is enabled, the Worker creates a GitHub issue. A dry-run setting may accept the message without creating that issue. The issue does not include an email address or an IP address.

For feedback, the Worker stores a hash of the IP (3 an hour and 10 a day for that hash, and 50 a day overall) and a hash of the message for about 24 hours. It does not store the raw IP in that cache. The raw IP is included in the Turnstile check sent to Cloudflare. Other API requests use the IP for an in-memory limit of 10 requests a minute.

## Donations

Donations use the PayPal hosted donate button. Card and bank details are entered on PayPal's form. Wondereye does not receive the card or bank number through that button.

PayPal may share information with the receiving account so it can complete the payment. PayPal's privacy statement says that information may include username, profile photo, first and last name, email address, city, and phone number, according to account settings. The amount is part of the transaction. A logged-in donor can choose whether to share a mailing address. A note may be included only if the donor adds one. We use what we receive for donation records and, if the donor wants a reply and we have a way to reach them, to say thank you. PayPal's privacy statement covers what PayPal does with the data.

## Storage and cache

On the phone: location, radius, units, and language settings; the anonymous explorer id (`wondereye.explorerId`), from which only an `Explorer #NNNN` label is sent; and a visit list in Even Hub storage (`wondereye-history`, up to 50 entries). We do not receive that history. It is stored on the phone and deleted when the app is uninstalled. It may also be copied off the phone. Even Realities may record that you installed and used Wondereye, under its own terms.

When you are first to add a place, the explorer label and the date are saved with the public map record. The map shows the label. The label is not your name, your Even Realities account, or a device serial number.

On the Worker, in Cloudflare KV: landmark responses, longer notes, and short-term place records are kept for 90 days. Public globe records have no expiration set in this code. A combined copy of the public map is kept for about one hour. Feedback counters expire on the timers above.

The public map response asks browsers to keep it for 60 seconds and shared caches for five minutes. The website's own code does not create an account, set cookies, or use browser storage.

## Server logs

Workers Logs is on for the API. Cloudflare keeps those request logs for up to 7 days. The logs include the visitor's IP address, the user agent, the full request address and path, and an approximate location derived from the IP address (country, region, city, postal code, latitude and longitude, time zone, and network provider).

Coordinates and audio are sent in the request body. The request address does not include them. These logs include that address and do not include the request body. The approximate location in the log comes from the IP address, not from the glasses position. The Worker's own log lines record errors and do not record coordinates or the audio file. On a speech-to-text failure, a log line may include the text of xAI's error.

## Cookies and fonts

The website sets no cookies of its own. Cloudflare may set short-lived security cookies, such as `__cf_bm` or `cf_clearance`, when the relevant protection is on. Cloudflare describes those cookies as strictly necessary.

The public website loads fonts from Google Fonts. The glasses app does not. Loading those fonts sends the visitor's IP address to Google, with the font address and ordinary request headers such as browser type and referring page. Google states that the Google Fonts API does not set cookies for this and does not use the request to profile you or to target ads.

## Network domains

The glasses app's allowed origins are `https://api.wondereye.app`, `https://nominatim.openstreetmap.org`, `https://wondereye.app`, `https://www.paypal.com`, and `https://challenges.cloudflare.com`.

The Worker also contacts api.x.ai, en.wikipedia.org, www.wikidata.org, overpass-api.de, overpass.private.coffee, and, for coordinates in Switzerland, overpass.osm.ch. Feedback that passes the checks is sent to api.github.com. The public website also loads fonts.googleapis.com and fonts.gstatic.com.

## Contact

CMDLAB LLC
contact@cmdlab.tech
