/** Hand-drawn inline SVG icons (original). */

const svg = (body: string, vb = '0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const icons = {
  coin: svg(`<circle cx="32" cy="34" r="26" fill="#e0a21c"/><circle cx="32" cy="30" r="26" fill="#ffc533"/><circle cx="32" cy="30" r="19" fill="#ffd966"/><text x="32" y="40" font-size="28" font-weight="700" font-family="Fredoka,sans-serif" text-anchor="middle" fill="#c98a10">$</text>`),
  clock: svg(`<circle cx="32" cy="32" r="26" fill="#2fa39b"/><circle cx="32" cy="32" r="20" fill="#fff"/><path d="M32 18v15l9 6" stroke="#4a2e1a" stroke-width="5" fill="none" stroke-linecap="round"/>`),
  sound: svg(`<path d="M10 24h10l14-11v38L20 40H10z" fill="#4a2e1a"/><path d="M42 22a14 14 0 0 1 0 20M48 15a24 24 0 0 1 0 34" stroke="#4a2e1a" stroke-width="5" fill="none" stroke-linecap="round"/>`),
  mute: svg(`<path d="M10 24h10l14-11v38L20 40H10z" fill="#4a2e1a"/><path d="M42 24l14 16M56 24L42 40" stroke="#e85a4f" stroke-width="5" stroke-linecap="round"/>`),
  tester: svg(`<rect x="12" y="8" width="40" height="48" rx="9" fill="#ffcf33"/><rect x="12" y="50" width="40" height="6" rx="3" fill="#e0a21c"/><rect x="18" y="14" width="28" height="18" rx="4" fill="#16302a"/><text x="32" y="28" font-size="12" font-weight="700" font-family="Fredoka,sans-serif" text-anchor="middle" fill="#9fe7b5">12V</text><circle cx="24" cy="43" r="5" fill="#e85a4f"/><circle cx="40" cy="43" r="5" fill="#30333a"/>`),
  obd: svg(`<rect x="8" y="12" width="48" height="40" rx="10" fill="#2f6fd6"/><rect x="14" y="18" width="36" height="20" rx="4" fill="#dff1ff"/><path d="M18 30l6-6 5 4 6-7 6 5" stroke="#2f6fd6" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="22" y="42" width="20" height="5" rx="2.5" fill="#1f4fa6"/>`),
  listen: svg(`<path d="M22 44c0 6 4 10 9 10s7-4 7-8c0-6 8-8 8-20a14 14 0 0 0-28 0" stroke="#e85a4f" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M28 26a5 5 0 0 1 10 0c0 4-5 5-5 9" stroke="#e85a4f" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M50 18a20 20 0 0 1 4 12M8 30a20 20 0 0 1 4-12" stroke="#ffb199" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  lift: svg(`<rect x="8" y="10" width="7" height="46" rx="3" fill="#2f6fd6"/><rect x="49" y="10" width="7" height="46" rx="3" fill="#2f6fd6"/><path d="M18 30h28l-4-9H22z" fill="#ff7a45"/><circle cx="23" cy="31" r="4.5" fill="#30333a"/><circle cx="41" cy="31" r="4.5" fill="#30333a"/><path d="M15 38h34" stroke="#ffc533" stroke-width="4"/><path d="M32 54V44m-5 5 5-5 5 5" stroke="#4a2e1a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  bulb: svg(`<path d="M32 8a17 17 0 0 0-10 31c2 2 3 4 3 7h14c0-3 1-5 3-7A17 17 0 0 0 32 8z" fill="#ffd23f"/><rect x="25" y="49" width="14" height="5" rx="2" fill="#8b5cf6"/><rect x="27" y="55" width="10" height="4" rx="2" fill="#8b5cf6"/><path d="M27 27l5 6 5-6" stroke="#e0a21c" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  wrench: svg(`<path d="M44 8a12 12 0 0 0-11 16L12 45a5 5 0 0 0 7 7l21-21a12 12 0 0 0 16-11l-7 7-7-2-2-7z" fill="#fff"/>`),
  battery: svg(`<rect x="8" y="18" width="48" height="34" rx="6" fill="#283044"/><rect x="8" y="30" width="48" height="10" fill="#22c27a"/><rect x="14" y="12" width="9" height="7" rx="2" fill="#30333a"/><rect x="41" y="12" width="9" height="7" rx="2" fill="#e85a4f"/><path d="M14 24h8M42 24h8M46 20v8" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`),
  starter: svg(`<rect x="10" y="20" width="32" height="24" rx="10" fill="#8d949e"/><rect x="38" y="24" width="16" height="16" rx="4" fill="#5f6670"/><circle cx="54" cy="32" r="4" fill="#ffc533"/><path d="M16 26v12M22 26v12M28 26v12" stroke="#6d747e" stroke-width="3"/>`),
  plugs: svg(`<rect x="27" y="6" width="10" height="10" rx="2" fill="#8d949e"/><rect x="24" y="16" width="16" height="20" rx="4" fill="#f4f4f4"/><rect x="25" y="36" width="14" height="8" fill="#5f6670"/><rect x="28" y="44" width="8" height="10" fill="#8d949e"/><path d="M32 54v4h5" stroke="#5f6670" stroke-width="3" fill="none"/>`),
  alternator: svg(`<circle cx="32" cy="32" r="22" fill="#8d949e"/><circle cx="32" cy="32" r="14" fill="#5f6670"/><circle cx="32" cy="32" r="6" fill="#ffc533"/><path d="M32 10v8M32 46v8M10 32h8M46 32h8" stroke="#6d747e" stroke-width="4"/>`),
  check: svg(`<path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`, '0 0 24 24'),
  cross: svg(`<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>`, '0 0 24 24'),
  star: svg(`<path d="M32 5l8.5 17.5 19 2.7-13.8 13.3 3.3 19L32 48.5 15 57.5l3.3-19L4.5 25.2l19-2.7z" fill="#ffc533" stroke="#e0a21c" stroke-width="3" stroke-linejoin="round"/><path d="M24 22l8-14" stroke="#fff6c8" stroke-width="3" stroke-linecap="round" opacity=".8"/>`),
  starOff: svg(`<path d="M32 5l8.5 17.5 19 2.7-13.8 13.3 3.3 19L32 48.5 15 57.5l3.3-19L4.5 25.2l19-2.7z" fill="#eadcc8" stroke="#d8c6ac" stroke-width="3" stroke-linejoin="round"/>`),
  key: svg(`<circle cx="20" cy="32" r="12" fill="none" stroke="#fff" stroke-width="7"/><path d="M31 32h25M48 32v9M56 32v7" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`),
  tv: svg(`<rect x="6" y="14" width="52" height="36" rx="8" fill="#fff"/><path d="M27 24v16l13-8z" fill="#8b5cf6"/><path d="M22 6l10 8 10-8" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  arrow: svg(`<path d="M23 54L4 30h11V4h16v26h11z" fill="#ffc533" stroke="#4a2e1a" stroke-width="4" stroke-linejoin="round"/>`, '0 0 46 58'),
};

/** an original cartoon customer face */
export function avatar(hair: string, skin: string, shirt: string) {
  return svg(
    `<rect width="64" height="64" fill="#ffe7c6"/><path d="M8 64c2-14 12-20 24-20s22 6 24 20z" fill="${shirt}"/><circle cx="32" cy="30" r="16" fill="${skin}"/><path d="M15 30c0-12 8-18 17-18s17 6 17 18c-3-5-8-8-17-8s-14 3-17 8z" fill="${hair}"/><circle cx="18" cy="24" r="6" fill="${hair}"/><circle cx="46" cy="24" r="6" fill="${hair}"/><circle cx="26" cy="31" r="2.2" fill="#4a2e1a"/><circle cx="38" cy="31" r="2.2" fill="#4a2e1a"/><path d="M27 37q5 4 10 0" stroke="#4a2e1a" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="22" cy="36" r="3" fill="#ff9b8a" opacity=".5"/><circle cx="42" cy="36" r="3" fill="#ff9b8a" opacity=".5"/><circle cx="26" cy="31" r="5" fill="none" stroke="#7a5a40" stroke-width="1.5"/><circle cx="38" cy="31" r="5" fill="none" stroke="#7a5a40" stroke-width="1.5"/><path d="M31 31h2" stroke="#7a5a40" stroke-width="1.5"/>`,
  );
}
