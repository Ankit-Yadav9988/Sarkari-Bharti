import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

/**
 * A progress bar across the top of the page during a client-side navigation.
 *
 * Every page in this app is server-rendered (`getServerSideProps`), so clicking
 * a job does not render anything locally: Next.js asks the server for that
 * page's props, waits, and only then swaps the view. On a warm CDN that is fast
 * enough to be invisible. On a cold Render backend it is seconds, and until now
 * *nothing on screen changed at all* during that time -- no spinner, no
 * greying, not even the browser's own loading indicator, because a client-side
 * navigation is not a document load.
 *
 * So the page looked broken and people clicked again, which starts a second
 * navigation and makes it slower. This does not make the fetch faster; it makes
 * the wait legible, which is the difference between "slow" and "broken".
 *
 * Deliberately not a dependency. NProgress is ~4 kB plus its own stylesheet for
 * behaviour that is one effect and one div, and it ships a jQuery-era global.
 */

/* Below this, a navigation is over before the eye registers a change, and
   showing a bar would read as a flicker. Roughly the threshold at which people
   start perceiving a delay rather than an instant response. */
const SHOW_AFTER_MS = 150;

/* How long the finished bar stays at 100% before fading. Long enough to read as
   completion rather than as the bar vanishing mid-way. */
const FADE_MS = 400;

export default function RouteProgress() {
  const router = useRouter();
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const timers = useRef([]);

  useEffect(() => {
    const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

    const start = (_url, { shallow } = {}) => {
      // A shallow navigation changes the query string without refetching props,
      // so there is nothing to wait for and a bar would be a lie.
      if (shallow) return;
      clearTimers();
      timers.current.push(setTimeout(() => setPhase('running'), SHOW_AFTER_MS));
    };

    const finish = () => {
      clearTimers();
      // If the bar never appeared, go straight back to idle rather than
      // flashing a completed bar for a navigation nobody saw start.
      setPhase(previous => (previous === 'running' ? 'done' : 'idle'));
      timers.current.push(setTimeout(() => setPhase('idle'), FADE_MS));
    };

    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', finish);
    // Covers both a failed navigation and a cancelled one (the second click).
    router.events.on('routeChangeError', finish);
    return () => {
      clearTimers();
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', finish);
      router.events.off('routeChangeError', finish);
    };
  }, [router.events]);

  if (phase === 'idle') return null;

  return (
    <div
      className={`route-progress route-progress--${phase}`}
      /* Announced rather than silent: a screen-reader user gets no visual cue
         at all, and "Loading page" once is the whole message. aria-live on the
         wrapper rather than role="progressbar" because there is no meaningful
         percentage to report -- the width is an easing curve, not a measurement
         of how much of the response has arrived. */
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading page</span>
    </div>
  );
}
