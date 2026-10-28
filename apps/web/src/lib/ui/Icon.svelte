<script lang="ts">
  let { name, size = 16 }: { name: string; size?: number } = $props();
  /** 16×16 stroke icons, drawn to match the UI library's line weight. */
  const P: Record<string, string> = {
    search: 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM11 11l3.5 3.5',
    globe: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM1.5 8h13M8 1.5c1.8 1.8 2.7 4 2.7 6.5S9.8 12.7 8 14.5C6.2 12.7 5.3 10.5 5.3 8S6.2 3.3 8 1.5Z',
    mail: 'M2 3.5h12v9H2zM2.5 4l5.5 4.5L13.5 4',
    shield: 'M8 1.5 2.5 3.5v4c0 3.2 2.3 5.6 5.5 7 3.2-1.4 5.5-3.8 5.5-7v-4L8 1.5ZM5.8 8l1.6 1.6L10.5 6.3',
    bolt: 'M9 1.5 3 9h4.5L7 14.5 13 7H8.5L9 1.5Z',
    sparkle: 'M8 1.5 9.4 6 14 7.5 9.4 9 8 13.5 6.6 9 2 7.5 6.6 6 8 1.5ZM13 11.5v3M11.5 13h3',
    wp: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM3 5.5l3 8M5.5 5.5H11M8.7 6l-2 7M13 6c-.5 3-2 5.5-3.6 7.5',
    code: 'm5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9.2 3 6.8 13',
    network: 'M8 2.5v3M8 10.5v3M3 8h3M10 8h3M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM2 8a1 1 0 1 0 0 .01M14 8a1 1 0 1 0 0 .01',
    layers: 'M8 2 1.5 5.5 8 9l6.5-3.5L8 2ZM1.5 8.5 8 12l6.5-3.5M1.5 11 8 14.5 14.5 11',
    puzzle: 'M6 2.5h3v2a1 1 0 1 0 2 0v-2h2.5v3h-2a1 1 0 1 0 0 2h2v3.5H10v-2a1 1 0 1 0-2 0v2H2.5V9h2a1 1 0 1 0 0-2h-2V4.5H6v-2Z',
    lock: 'M3.5 7h9v6.5h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2',
    eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    tree: 'M8 2v4M3.5 9.5V8h9v1.5M8 6v2M3.5 9.5v4M12.5 9.5v4M8 8v5.5',
    list: 'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
    ban: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM3.4 3.4l9.2 9.2',
    key: 'M10 6a3 3 0 1 1 0 .01M7.5 8 2 13.5V14h2v-1.5h1.5V11H7l1-1',
    check: 'm3 8.5 3.2 3.2L13 4.5',
    alert: 'M8 2 1.8 13h12.4L8 2ZM8 6.5v3M8 11.5v.01',
    info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.3v4M8 5v.01',
    arrow: 'M3 8h10M9 4l4 4-4 4',
    sun: 'M8 10.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6ZM8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1',
    moon: 'M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5Z',
    copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
    external: 'M9 2.5h4.5V7M13.5 2.5 7 9M12 9.5v4H2.5V4H6.5',
    download: 'M8 2v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11',
    refresh: 'M13.5 8A5.5 5.5 0 1 1 11.8 4M13.5 2.5v3h-3',
    chevron: 'm4 6 4 4 4-4',
    mark: 'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8 9.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5'
  };
</script>

<svg class="eui-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={P[name] ?? P.info} /></svg>
