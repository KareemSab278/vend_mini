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
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
}

const defaultTheme: Theme = {
    // should hold the current theme colors that the app is using right now.
    // like purple and stuff or i set it to just grey and apply it initially...
};

export const Theme = {
    getTheme: async (): Promise<Theme> => await LS.get('theme', defaultTheme),
    setTheme: async (theme: Theme) => await LS.save('theme', theme),
    clearTheme: async () => await LS.remove('theme'),
}


