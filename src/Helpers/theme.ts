/*
    this will hold the selected theme for the entire app.
    theme will hold these props:
        theme: {
            primaryColor: string,
            secondaryColor: string,
            backgroundColor: string,
            textColor: string
        }

    the theme will apply to the App screen and all of its styles.

    the theme is stored in local storage for persistence across app sessions.
*/

import { LS } from './LS';

export interface Theme {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
    primaryOpacity: number;
    products_layout: "grid" | "list";
}

export const defaultTheme: Theme = {
    primaryColor: '#8f8f8f',
    secondaryColor: '#1b2136',
    backgroundColor: '#1b2136',
    textColor: '#ffffff',
    primaryOpacity: 0.42,
    products_layout: "list",
};

export const hexToRgba = (hex: string, alpha: number) => {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', theme.primaryColor);
    root.style.setProperty('--theme-primary-rgb', hexToRgba(theme.primaryColor, theme.primaryOpacity));
    root.style.setProperty('--theme-secondary', theme.secondaryColor);
    root.style.setProperty('--theme-background', theme.backgroundColor);
    root.style.setProperty('--theme-text', theme.textColor);
    root.style.setProperty('--theme-products-layout', theme.products_layout);
    root.style.setProperty(
        '--theme-card-width',
        theme.products_layout === 'grid' ? 'calc(33.333% - 0.67rem)' : '90%'
    );
};

export const ThemeStore = {
    getTheme: async (): Promise<Theme> => {
        const saved = await LS.get('theme', defaultTheme);
        return {
            primaryColor: saved?.primaryColor ?? defaultTheme.primaryColor,
            secondaryColor: saved?.secondaryColor ?? defaultTheme.secondaryColor,
            backgroundColor: saved?.backgroundColor ?? defaultTheme.backgroundColor,
            textColor: saved?.textColor ?? defaultTheme.textColor,
            primaryOpacity: saved?.primaryOpacity ?? defaultTheme.primaryOpacity,
            products_layout: saved?.products_layout ?? defaultTheme.products_layout,
        };
    },
    setTheme: async (theme: Theme) => {
        await LS.save('theme', theme);
        applyTheme(theme);
    },
    clearTheme: async () => {
        await LS.remove('theme');
        applyTheme(defaultTheme);
    },
}


