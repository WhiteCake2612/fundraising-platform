// Minimal line-icon set (24px grid, stroked with currentColor).
const P = {
  card: 'M3 6h18v12H3z M3 10h18 M7 15h4',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  bag: 'M6 8h12l-1 12H7z M9 8a3 3 0 0 1 6 0',
  atom: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M4 12c0-2.5 3.6-4.5 8-4.5s8 2 8 4.5-3.6 4.5-8 4.5-8-2-8-4.5z M8 5.1c2.2-1.3 6.2 1 8.4 4.9s2.2 8.4 0 9.6-6.2-1-8.4-4.9-2.2-8.4 0-9.6z',
  leaf: 'M5 19c0-8 6-14 14-14 0 8-6 14-14 14z M5 19l7-7',
  factory: 'M3 20V10l5 3v-3l5 3V6h4v14z M3 20h18',
  truck: 'M3 7h11v9H3z M14 10h4l3 3v3h-7 M7 18.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M17 18.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  cap: 'M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5',
  sprout: 'M12 20v-8 M12 12c0-4-3-6-7-6 0 4 3 6 7 6z M12 10c0-3 2-5 6-5 0 3-2 5-6 5z',
  play: 'M4 5h16v14H4z M10 9l5 3-5 3z',
  building: 'M4 20V6l8-3v17 M12 9h8v11 M7 8h2 M7 12h2 M7 16h2 M15 12h2 M15 16h2 M3 20h18',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  target: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 12h.01',
  trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  cash: 'M3 7h18v10H3z M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M6 10v4 M18 10v4',
  percent: 'M5 19L19 5 M7 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 2',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3 3-5 6-5s6 2 6 5 M16 5.2a3 3 0 0 1 0 5.6 M21 20c0-2.5-1.5-4-4-4.5',
  pin: 'M12 21s-7-7.6-7-12a7 7 0 0 1 14 0c0 4.4-7 12-7 12z M12 9m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  tag: 'M3 12V3h9l9 9-9 9z M7.5 7.5h.01',
  calendar: 'M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  globe: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M3 12h18 M12 3c3 3.5 3 14.5 0 18 M12 3c-3 3.5-3 14.5 0 18',
  stairs: 'M3 20h5v-5h5v-5h5V5h3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  pen: 'M4 20h4L20 8l-4-4L4 16z M14 6l4 4',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  columns: 'M4 4h6v16H4z M14 4h6v16h-6z',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  down: 'M12 5v14 M6 13l6 6 6-6',
  external: 'M14 3h7v7 M21 3l-9 9 M19 14v6H4V5h6',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
};

export function Icon({ name, size = 16, stroke = 1.8, className, style, title }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name] || P.sparkle} />
    </svg>
  );
}

const SECTOR = {
  Fintech: 'card', Healthcare: 'pulse', 'Enterprise Software': 'grid', Consumer: 'bag', Deeptech: 'atom', Climate: 'leaf',
  Manufacturing: 'factory', Logistics: 'truck', Edtech: 'cap', Agritech: 'sprout', Media: 'play', 'Real Estate': 'building', Other: 'sparkle',
};
export const sectorIconName = (s) => SECTOR[s] || 'sparkle';
export const SectorIcon = ({ sector, ...p }) => <Icon name={sectorIconName(sector)} {...p} />;
