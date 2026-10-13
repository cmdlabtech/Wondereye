import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { PinIcon, Wordmark } from "@/components/wordmark";

const DEFAULT_TITLE = "Wondereye · A globe of landmarks";
const PAGE_TITLE = "Privacy · Wondereye";
const CANONICAL = "https://wondereye.app/privacy";

const SECTIONS = [
  { id: "location", label: "Location" },
  { id: "notes", label: "Landmark notes" },
  { id: "voice", label: "Voice search" },
  { id: "feedback", label: "Feedback" },
  { id: "storage", label: "Storage and cache" },
  { id: "network", label: "Network domains" },
  { id: "contact", label: "Contact" },
] as const;

function setNamedMeta(selector: string, attr: "content", value: string): string | null {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) return null;
  const prev = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return prev;
}

export function PrivacyPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = PAGE_TITLE;
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevCanonical = link?.href ?? null;
    if (link) link.href = CANONICAL;
    const prevDescription = setNamedMeta(
      'meta[name="description"]',
      "content",
      "How Wondereye uses location, landmark requests, voice search, feedback, and storage.",
    );
    return () => {
      document.title = prevTitle || DEFAULT_TITLE;
      if (link && prevCanonical) link.href = prevCanonical;
      if (prevDescription != null) {
        setNamedMeta('meta[name="description"]', "content", prevDescription);
      }
    };
  }, []);

  return (
    <div className="relative z-40 min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Wordmark />
          <Link to="/" className="btn btn-ghost">
            Open the globe
          </Link>
        </div>
      </header>

      <main className="px-4 py-12 sm:px-6 sm:py-16">
        <article className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
          <p className="rise flex items-center gap-2.5 text-xs tracking-[0.2em] text-muted uppercase">
            <PinIcon className="h-3 text-primary" />
            Wondereye
          </p>
          <h1 className="rise rise-2 mt-5 text-5xl leading-[1.05] text-fg sm:text-6xl">Privacy</h1>
          <p className="rise rise-3 mt-5 text-base leading-relaxed text-muted sm:text-lg">
            Wondereye is a landmark guide for Even Realities G2 glasses, and a public globe of places at
            wondereye.app. CMDLAB LLC makes it. This page describes what that software does with information.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">13 October 2026</p>

          <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-2">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="place-chip hover:text-fg">
                {section.label}
              </a>
            ))}
          </nav>

          <section id="location" className="mt-12 scroll-mt-24 border-t border-border pt-10">
            <h2 className="text-3xl text-fg sm:text-4xl">Location</h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
              <p>
                The G2 glasses have no GPS. When location is on, the glasses app asks the Even Realities app on your
                phone for a position. The app declares a location permission for that, described as finding landmarks
                near your current position.
              </p>
              <p>
                A setting on the phone turns location on or off and is saved there as <Code>wondereye-geo</Code>. While
                it is off, the app does not request a new position. A successful fix is saved on the phone as{" "}
                <Code>wondereye-last-location</Code>: latitude, longitude, and the time. If a new fix fails, or location
                is off, the app uses that saved position. With no saved position, it uses a fixed point in Prague so a
                list can still load.
              </p>
              <p>
                The precise position stays on the phone for sorting distances and for the compass. The glasses app also
                sends latitude, longitude, a search radius, and a language code to the Wondereye API at{" "}
                <Ext href="https://api.wondereye.app">api.wondereye.app</Ext>. The API rounds those coordinates to three
                decimal places, about 110 meters, before it searches and before it writes a cache entry. The radius is
                the value saved on the phone as <Code>wondereye-radius</Code>, between 250 and 2,000 meters.
              </p>
              <p>
                The phone also asks OpenStreetMap Nominatim for a city, town, or village name. That request uses
                coordinates rounded to two decimal places, about 1.1 kilometers, plus the language the app is using, and
                goes to <Ext href="https://nominatim.openstreetmap.org">nominatim.openstreetmap.org</Ext>. The name is
                shown in the app. It is separate from the landmark lookup.
              </p>
              <p>
                A page address can include <Code>lat</Code> and <Code>lng</Code>. When those values are valid, the app
                uses them as the position. That path is there for the simulator.
              </p>
              <p>
                While the app is in front, the glasses report orientation. Wondereye uses that heading on the phone to
                highlight a landmark in the direction you are facing. Heading is left out of requests to the Wondereye
                API. Leaving the app pauses that reporting.
              </p>
              <p>
                The website globe does not ask the browser for your position. It loads a landmark list shipped with the
                site. On wondereye.app it also requests the public map from the API: place names, types, the coordinates
                of those places, and short notes. Search on the globe sends the text you type to Nominatim and uses the
                returned coordinates to move the map.
              </p>
            </div>
          </section>

          <section id="notes" className="mt-12 scroll-mt-24 border-t border-border pt-10">
            <h2 className="text-3xl text-fg sm:text-4xl">Landmark notes</h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
              <p>
                A lookup from the glasses is <Code>POST /api/landmarks</Code> on the Wondereye API, which runs as a
                Cloudflare Worker. The Worker asks English Wikipedia (GeoSearch) and OpenStreetMap (public Overpass)
                for nearby named places. When a place has a Wikidata id, it may also request a short English Wikidata
                description and pass that to the model as a hint for which place is meant. The hint is not the note you
                read.
              </p>
              <p>
                The Worker then sends those candidates to xAI, including the rounded coordinates, so Grok can write a
                short note. That call uses <Ext href="https://api.x.ai">api.x.ai</Ext>, the grok-4.3 model, and the chat
                completions interface. Up to five places come back. The note is text on the glasses, and the same
                English text can appear on the public globe.
              </p>
              <p>
                English notes can be saved for the public globe as the place name, type, the place&rsquo;s own
                coordinates, and the note. Notes in German, French, Spanish, Italian, Simplified Chinese, Japanese, and
                Korean are cached for the glasses and are left off that public map.
              </p>
              <p>
                A longer note is a separate <Code>POST /api/landmark-detail</Code>. The glasses app sends the place
                name and, when it already has them, the type, the place&rsquo;s coordinates, the distance from you in
                meters, the short note, a Wikipedia title, a Wikidata id, an OpenStreetMap description, a start date, an
                architect or artist, a city name, your unit choice, and the language. The Worker may fetch the English
                Wikidata label again, then asks xAI to write the longer text. That call uses the responses interface and
                grok-4.3, and it allows xAI to search grokipedia.com. The request sets <Code>store</Code> to false.
              </p>
              <p>
                Unit choice is saved on the phone as <Code>wondereye-units</Code> (imperial or metric). Language is
                saved as <Code>wondereye-lang</Code>, or taken from the Even Realities app or the phone when the setting
                is automatic. The languages the software supports are English, German, French, Spanish, Italian,
                Simplified Chinese, Japanese, and Korean.
              </p>
            </div>
          </section>

          <section id="voice" className="mt-12 scroll-mt-24 border-t border-border pt-10">
            <h2 className="text-3xl text-fg sm:text-4xl">Voice search</h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
              <p>
                Voice search uses the glasses microphone. The app declares that permission as{" "}
                <Code>g2-microphone</Code>, described as voice search for landmarks. Recording starts when you use voice
                search. It stops after a short silence, or at ten seconds. The app turns the recording into a WAV file
                and sends that file, plus the names of the landmarks already on screen, to <Code>POST /api/transcribe</Code>.
              </p>
              <p>
                The Worker forwards the audio to xAI speech-to-text at <Code>api.x.ai/v1/stt</Code>, model
                grok-voice-transcribe-2.0. It then sends the transcribed words and those landmark names to xAI chat so a
                name from the list can be chosen. The audio file is not written to the Wondereye cache. Files larger
                than 2 megabytes are refused. The Worker returns the matched name and the transcribed text to the app,
                and the result is text on the glasses display.
              </p>
            </div>
          </section>

          <section id="feedback" className="mt-12 scroll-mt-24 border-t border-border pt-10">
            <h2 className="text-3xl text-fg sm:text-4xl">Feedback</h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
              <p>
                The glasses settings page and the map on this website both include a feedback form. Cloudflare Turnstile
                runs before a message is accepted. The widget loads from{" "}
                <Ext href="https://challenges.cloudflare.com">challenges.cloudflare.com</Ext>. Inside the glasses app,
                the widget is shown in a frame on wondereye.app, because Turnstile requires a hostname. The Worker
                checks the token with Cloudflare, including that hostname.
              </p>
              <p>
                The form accepts a category (bug, idea, or other), an optional title, and a message. It rejects fields
                it does not know, so it has no email field. A hidden extra field, if filled in, is discarded. A repeat
                of the same message within about 24 hours is discarded.
              </p>
              <p>
                If the checks pass and feedback is enabled, the Worker creates a GitHub issue. The issue contains the
                category, whether the message came from the glasses settings page or the web map, the page path, the
                app version when the glasses app sent one, the browser user agent, and the message. The issue is written
                so that it does not include an email address or an IP address.
              </p>
              <p>
                The connecting IP is used for limits. For feedback, the Worker stores a hash of the IP with the caps
                written in the code (3 an hour and 10 a day for that hash, and 50 a day overall), plus a hash of the
                message for about 24 hours. The raw IP is included in the Turnstile check sent to Cloudflare. Landmark,
                longer-note, and transcription requests use the connecting IP for a short in-memory limit on the Worker
                (10 requests a minute). Those counters are not written into the landmark store.
              </p>
            </div>
          </section>

          <section id="storage" className="mt-12 scroll-mt-24 border-t border-border pt-10">
            <h2 className="text-3xl text-fg sm:text-4xl">Storage and cache</h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
              <p>On the phone, in the glasses app&rsquo;s page storage:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <Code>wondereye-last-location</Code>, <Code>wondereye-geo</Code>, <Code>wondereye-radius</Code>,{" "}
                  <Code>wondereye-units</Code>, and <Code>wondereye-lang</Code>, as described above.
                </li>
                <li>
                  A visit list in Even Hub storage under <Code>wondereye-history</Code>. Each entry is a landmark name,
                  type, short note, and time, up to 50 entries. The app reads and writes that list on the device and
                  shows it on the phone page.
                </li>
              </ul>
              <p>On the Worker, in Cloudflare KV:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Landmark responses for a rounded area, radius, and language, kept for 90 days.</li>
                <li>
                  Longer notes, kept for 90 days. The key can include the place name, rounded place coordinates, unit
                  system, and language.
                </li>
                <li>A short-term place record, kept for 90 days.</li>
                <li>
                  Public globe records with no expiration set in this code: place name, type, the place&rsquo;s
                  coordinates, and the English note.
                </li>
                <li>A combined copy of that public map, kept for about one hour.</li>
                <li>Feedback rate counters and duplicate-message markers, which expire on the timers above.</li>
              </ul>
              <p>
                The public map response asks browsers to keep it for 60 seconds and shared caches for five minutes. The
                website&rsquo;s own code does not create an account, set cookies, or use browser storage. The pages load
                fonts from fonts.googleapis.com and fonts.gstatic.com.
              </p>
            </div>
          </section>

          <section id="network" className="mt-12 scroll-mt-24 border-t border-border pt-10">
            <h2 className="text-3xl text-fg sm:text-4xl">Network domains</h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
              <p>The glasses app declares a network permission. The allowed origins in its app manifest are:</p>
              <ul className="rounded-xl bg-paper px-5 py-5 shadow-ring sm:px-7">
                <li className="border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
                  <Ext href="https://api.wondereye.app">https://api.wondereye.app</Ext>
                  <span className="mt-1 block text-sm">Landmark lookups, longer notes, voice transcription, and feedback.</span>
                </li>
                <li className="border-b border-border py-3 last:border-b-0">
                  <Ext href="https://nominatim.openstreetmap.org">https://nominatim.openstreetmap.org</Ext>
                  <span className="mt-1 block text-sm">City name from coordinates.</span>
                </li>
                <li className="border-b border-border py-3 last:border-b-0">
                  <Ext href="https://wondereye.app">https://wondereye.app</Ext>
                  <span className="mt-1 block text-sm">This site, including the Turnstile frame.</span>
                </li>
                <li className="border-b border-border py-3 last:border-b-0">
                  <Ext href="https://www.paypal.com">https://www.paypal.com</Ext>
                  <span className="mt-1 block text-sm">The donate link.</span>
                </li>
                <li className="py-3 last:pb-0">
                  <Ext href="https://challenges.cloudflare.com">https://challenges.cloudflare.com</Ext>
                  <span className="mt-1 block text-sm">Cloudflare Turnstile.</span>
                </li>
              </ul>
              <p>
                The Worker, when it handles those requests, also contacts api.x.ai, en.wikipedia.org, www.wikidata.org,
                overpass-api.de, and overpass.private.coffee. For coordinates in Switzerland it can also contact
                overpass.osm.ch. Feedback that passes the checks is sent to api.github.com. The Turnstile check is sent
                to challenges.cloudflare.com.
              </p>
            </div>
          </section>

          <section id="contact" className="mt-12 scroll-mt-24 border-t border-border pt-10">
            <h2 className="text-3xl text-fg sm:text-4xl">Contact</h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
              <p>CMDLAB LLC</p>
              <p>
                <a
                  href="mailto:contact@cmdlab.tech"
                  className="font-medium text-fg underline-offset-4 hover:underline"
                >
                  contact@cmdlab.tech
                </a>
              </p>
            </div>
          </section>
          </div>
        </article>
      </main>

      <footer className="border-t border-border bg-bg px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <PinIcon className="h-2.5 text-primary" />
            Wondereye &copy; 2026 CMDLAB LLC
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <a href="mailto:contact@cmdlab.tech" className="underline-offset-4 hover:text-fg hover:underline">
              contact@cmdlab.tech
            </a>
            <Link to="/" className="underline-offset-4 hover:text-fg hover:underline">
              Globe
            </Link>
            <Link to="/map" className="underline-offset-4 hover:text-fg hover:underline">
              Map
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <code className="rounded-sm bg-surface-2 px-1 py-0.5 text-[0.92em] text-fg">{children}</code>;
}

function Ext({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-fg underline-offset-4 hover:underline">
      {children}
    </a>
  );
}
