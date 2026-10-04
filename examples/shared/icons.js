// Line icons shared by the demos, drawn on a 24 × 24 grid in the current text colour.

const PATHS = {
    logo: '<circle cx="12" cy="12" r="8.5"/><path d="M7.6 10.4a4.8 4.8 0 0 1 2.8-2.8"/><circle cx="15.2" cy="15.2" r="1" fill="currentColor" stroke="none"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M19.5 14.6A7.9 7.9 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"/>',
    auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
    left: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
    right: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    down: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    play: '<path d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.8-6.2a.8.8 0 0 0 0-1.4L9.2 5.1a.8.8 0 0 0-1.2.7z" fill="currentColor"/>',
    pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
    previous: '<path d="M17.5 6.6v10.8a.6.6 0 0 1-.9.5L9 12.5a.6.6 0 0 1 0-1L16.6 6a.6.6 0 0 1 .9.5z" fill="currentColor"/><path d="M6.5 6v12"/>',
    next: '<path d="M6.5 6.6v10.8a.6.6 0 0 0 .9.5l7.6-5.4a.6.6 0 0 0 0-1L7.4 6a.6.6 0 0 0-.9.5z" fill="currentColor"/><path d="M17.5 6v12"/>',
    pointer: '<path d="m5 4 5.6 15.2 2.3-6.3 6.3-2.3z"/>',
    bolt: '<path d="M13 2.5 4.8 13.2h6.4l-1 8.3 8.2-10.7H12z"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',
    upload: '<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>',
    external: '<path d="M7 17 17 7M9 7h8v8"/>',
    book: '<path d="M12 6.8C10.2 5.3 7.4 4.8 4 5.2v12.6c3.4-.4 6.2.1 8 1.6 1.8-1.5 4.6-2 8-1.6V5.2c-3.4-.4-6.2.1-8 1.6zM12 6.8v12.6"/>',
    bell: '<path d="M6 10.5a6 6 0 0 1 12 0c0 4.8 2 6.2 2 6.2H4s2-1.4 2-6.2zM10 20a2.1 2.1 0 0 0 4 0"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    move: '<path d="M12 3v18M3 12h18M9.5 5.5 12 3l2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5"/>',
    sparkle: '<path d="m12 3.5 1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z"/><path d="M19 16.5v4M17 18.5h4"/>',
    layers: '<path d="m12 3.5 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    drop: '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5M12 16.8v.2"/>',
    shapes: '<rect x="3.5" y="3.5" width="8" height="8" rx="2"/><circle cx="16.5" cy="16.5" r="4"/><path d="M16.5 3.5l4 7h-8z"/>'
};

/** The markup of the icon `name`: an inline SVG element of class "icon". */
export function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + (PATHS[name] ?? "") + "</svg>";
}
