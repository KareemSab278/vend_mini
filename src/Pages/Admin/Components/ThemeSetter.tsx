/*
    this component will appear in the modal in admin.
    it will show a color selector for the admin to choose the theme colors.
    they will set the theme here and it will use the methods in theme.ts for save it for later.
*/

import { ColorPicker } from '@mantine/core';
import type {Theme} from '../../../Helpers/theme';
import {defaultTheme, ThemeStore} from '../../../Helpers/theme';
import { useState } from 'react';

const ThemeSetter = () => {
    const [theme, setTheme] = useState<Theme>(defaultTheme);

    const saveTheme = async () => await ThemeStore.setTheme(theme);
    const resetTheme = async () => {await ThemeStore.clearTheme(); setTheme(defaultTheme);}
    const getTheme = async () => await ThemeStore.getTheme().then(setTheme);


    return (
        <div>
            <ColorPicker size="xl" value={theme.primaryColor} onChange={(color) => setTheme({...theme, primaryColor: color})} />
        </div>
    );
};

export default ThemeSetter;