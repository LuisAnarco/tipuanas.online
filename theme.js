/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: theme.js
 * DESCRIÇÃO: Identidade visual "canopy + bloom" (canvas de Design) aplicada ao
 *            site inteiro. Carregar logo DEPOIS do script do Tailwind (CDN).
 *            As paletas que o código já usa passam a apontar para a marca:
 *              emerald/teal/green/blue/indigo/violet/purple → canopy (copa)
 *              amber/yellow/orange                         → bloom (floração)
 *              red/rose                                    → tijolo
 *              slate/gray                                  → ink + papel
 *            Assim nenhuma tela perde função: só muda a aparência.
 *            Tokens de texto sobre fundo claro: mel-texto #8A5A17 (amber-700),
 *            tijolo-texto #9A4726 (red-600/700), ink-soft #5B6154 (slate-500),
 *            ink-mute #6E7166 (slate-400, placeholder/legenda).
 * ==============================================================================
 */
(function () {
    const canopy = {
        50: '#F1F5EE', 100: '#E3ECDF', 200: '#C8D9C4', 300: '#A2BE9E', 400: '#6F9474',
        500: '#436B49', 600: '#35573B', 700: '#26402C', 800: '#1F3324', 900: '#172719', 950: '#101B11'
    };
    const bloom = {
        50: '#FDF6E9', 100: '#FBEACB', 200: '#F7D79B', 300: '#F4C46C', 400: '#F2B653',
        500: '#F0A93A', 600: '#DA9527', 700: '#8A5A17', 800: '#6E4712', 900: '#54360E', 950: '#3A250A'
    };
    const tijolo = {
        50: '#F8EDE8', 100: '#F1D8CD', 200: '#E6B8A4', 300: '#D69478', 400: '#C8764F',
        500: '#B65C36', 600: '#9A4726', 700: '#7F3A1F', 800: '#652E19', 900: '#4C2313', 950: '#33180D'
    };
    const ink = {
        50: '#F7F4EA', 100: '#EFEAD9', 200: '#DDD8C4', 300: '#C9C3AD', 400: '#6E7166',
        500: '#5B6154', 600: '#4B5145', 700: '#3A4036', 800: '#2C3128', 900: '#23281F', 950: '#171A14'
    };

    window.TIPUANAS_THEME = { canopy, bloom, tijolo, ink };
    window.tailwind = window.tailwind || {};
    window.tailwind.config = {
        theme: {
            extend: {
                colors: {
                    emerald: canopy, teal: canopy, green: canopy, blue: canopy, sky: canopy,
                    indigo: canopy, violet: canopy, purple: canopy,
                    amber: bloom, yellow: bloom, orange: bloom,
                    red: tijolo, rose: tijolo,
                    slate: ink, gray: ink,
                    canopy, bloom, tijolo, ink,
                    paper: { DEFAULT: '#F7F4EA', dim: '#EFEAD9', line: '#DDD8C4' }
                },
                fontFamily: {
                    sans: ['Karla', 'system-ui', 'sans-serif'],
                    display: ['"Bricolage Grotesque"', 'Karla', 'sans-serif']
                }
            }
        }
    };

    // Fontes da marca (Google Fonts)
    if (!document.querySelector('link[data-theme-fonts]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.dataset.themeFonts = '1';
        link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Karla:wght@400;500;600;700;800&display=swap';
        document.head.appendChild(link);
    }

    // Regras que valem para todas as telas (canvas: "Regras que não se negociam")
    const style = document.createElement('style');
    style.dataset.theme = 'tipuanas';
    style.textContent = `
        body { font-family: 'Karla', system-ui, sans-serif !important; font-variant-numeric: tabular-nums; }
        h1, h2, h3, .font-display { font-family: 'Bricolage Grotesque', 'Karla', sans-serif; letter-spacing: -0.01em; }
        /* Texto nunca abaixo de 12px */
        .text-\\[9px\\], .text-\\[10px\\], .text-\\[11px\\] { font-size: 12px !important; line-height: 1.35 !important; }
        input::placeholder, textarea::placeholder { color: #6E7166; }
        :focus-visible { outline: 2px solid #26402C; outline-offset: 2px; }
    `;
    document.head.appendChild(style);
})();
