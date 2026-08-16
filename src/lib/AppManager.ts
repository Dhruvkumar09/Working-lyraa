import { NativeTools, type InstalledApp, type NativeResult } from '../native/bridge';

/**
 * Resolves the app names Dhruv actually says to packages that exist on the phone.
 *
 * The list comes from the launcher query in the manifest, so it only ever contains
 * apps with a launcher icon — exactly the set worth trying to open. It is cached
 * because enumerating and loading labels for a few hundred apps is not free, and
 * invalidated when an install could have happened.
 */

const ALIASES: Record<string, string[]> = {
  whatsapp: ['com.whatsapp', 'com.whatsapp.w4b'],
  instagram: ['com.instagram.android'],
  youtube: ['com.google.android.youtube'],
  chrome: ['com.android.chrome'],
  gmail: ['com.google.android.gm'],
  maps: ['com.google.android.apps.maps'],
  spotify: ['com.spotify.music'],
  telegram: ['org.telegram.messenger'],
  camera: ['com.google.android.GoogleCamera'],
  settings: ['com.android.settings'],
  playstore: ['com.android.vending'],
  'play store': ['com.android.vending'],
  photos: ['com.google.android.apps.photos'],
  netflix: ['com.netflix.mediaclient'],
  facebook: ['com.facebook.katana'],
  x: ['com.twitter.android'],
  twitter: ['com.twitter.android'],
  snapchat: ['com.snapchat.android'],
  paytm: ['net.one97.paytm'],
  phonepe: ['com.phonepe.app'],
  'google pay': ['com.google.android.apps.nbu.paisa.user'],
  gpay: ['com.google.android.apps.nbu.paisa.user'],
};

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export const AppManager = {
  cache: null as InstalledApp[] | null,

  async list(refresh = false): Promise<InstalledApp[]> {
    if (refresh || this.cache === null) {
      this.cache = await NativeTools.listApps();
    }
    return this.cache;
  },

  forget(): void {
    this.cache = null;
  },

  /**
   * Exact label wins, then a known alias, then a whole-word match, then a prefix.
   * Bare substrings are deliberately last: "app" should not open the first of a
   * hundred apps whose name happens to contain it.
   */
  async resolve(spoken: string): Promise<InstalledApp | null> {
    const wanted = normalise(spoken);
    if (!wanted) return null;

    const apps = await this.list();
    if (apps.length === 0) return null;

    const byPackage = new Map(apps.map((app) => [app.package, app]));
    const labelled = apps.map((app) => ({ app, label: normalise(app.label) }));

    const exact = labelled.find((entry) => entry.label === wanted);
    if (exact) return exact.app;

    for (const candidate of ALIASES[wanted] ?? []) {
      const hit = byPackage.get(candidate);
      if (hit) return hit;
    }

    const word = labelled.find((entry) => entry.label.split(' ').includes(wanted));
    if (word) return word.app;

    const prefix = labelled.find((entry) => entry.label.startsWith(wanted));
    if (prefix) return prefix.app;

    const contains = labelled.find((entry) => entry.label.includes(wanted));
    return contains ? contains.app : null;
  },

  /**
   * Resolves locally when the app list is available so the spoken error can name
   * the app, and otherwise lets the native side do its own matching.
   */
  async open(spoken: string): Promise<NativeResult & { label?: string }> {
    if (!NativeTools.available) return { ok: true };

    const match = await this.resolve(spoken);
    if (match) {
      const result = await NativeTools.openApp({ package: match.package });
      return { ...result, label: match.label };
    }

    const fallback = await NativeTools.openApp({ name: spoken });
    if (!fallback.ok) {
      // A fresh install would not be in the cache yet, so try once more.
      this.forget();
      const retry = await this.resolve(spoken);
      if (retry) {
        const result = await NativeTools.openApp({ package: retry.package });
        return { ...result, label: retry.label };
      }
      return { ok: false, error: `I could not find an app called ${spoken}` };
    }
    return fallback;
  },

  async isInstalled(spoken: string): Promise<boolean> {
    return (await this.resolve(spoken)) !== null;
  },
};
