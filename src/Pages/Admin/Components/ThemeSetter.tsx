/*
    this component will appear in the modal in admin.
    it will show a color selector for the admin to choose the theme colors.
    they will set the theme here and it will use the methods in theme.ts for save it for later.
*/

import { Accordion, Checkbox, ColorPicker, Group, Modal, Slider, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { Theme } from '../../../Helpers/theme';
import { defaultTheme, hexToRgba, ThemeStore } from '../../../Helpers/theme';
import { PrimaryButton } from '../../../Components/Button';

interface ThemeModalProps {
    opened: boolean;
    onClose: () => void;
}

const colorOptions: { [key: string]: string } = {
    'grey': '#2e2e2e',
    'lightGrey': '#868e96',
    'red': '#fa5252',
    'pink': '#e64980',
    'purple': '#be4bdb',
    'violet': '#7950f2',
    'indigo': '#4c6ef5',
    'blue': '#228be6',
    'cyan': '#15aabf',
    'teal': '#12b886',
    'green': '#40c057',
    'lime': '#82c91e',
    'yellow': '#fab005',
    'orange': '#fd7e14'
};

const colorKeys: Array<keyof Theme> = ['backgroundColor', 'primaryColor', 'secondaryColor', 'textColor'];

const labelFor = (key: keyof Theme) => {
    switch (key) {
        case 'primaryColor': return 'Buttons';
        case 'secondaryColor': return 'Option Pills';
        case 'backgroundColor': return 'Background Color';
        case 'textColor': return 'Text Color';
        default: return String(key);
    }
};

const ResetPrompt = ({ opened, onConfirm, onCancel }: { opened: boolean; onConfirm: () => void; onCancel: () => void }) => (
    <Modal opened={opened} onClose={onCancel} title="Reset Theme" size="sm">
        <Stack>
            <Text>Are you sure you want to reset the theme to default?</Text>
            <Group style={{ justifyContent: 'center' }}>
                <PrimaryButton onClick={onCancel} title="Cancel" />
                <PrimaryButton onClick={onConfirm} title="Confirm" />
            </Group>
        </Stack>
    </Modal>
);

export const ThemeSetter = ({ opened, onClose }: ThemeModalProps) => {
    const [theme, setTheme] = useState<Theme>(defaultTheme);
    const [resetPromptOpen, setResetPromptOpen] = useState(false);

    useEffect(() => {
        ThemeStore.getTheme().then(setTheme);
    }, []);

    const saveTheme = async () => {await ThemeStore.setTheme(theme).then(onClose);}

    const resetTheme = async () => {
        await ThemeStore.clearTheme();
        setTheme(defaultTheme);
        onClose();
    };

    const updateColor = (key: keyof Theme, color: string) => {
        setTheme((prev) => ({ ...prev, [key]: color }));
    };

    return (
        <Modal opened={opened} onClose={onClose} title={"Theme Setter"} size="xl">
            <Stack>
                <Accordion defaultValue="">
                    {colorKeys.map((key) => (
                        <Accordion.Item key={key} value={key}>
                            <Accordion.Control>
                                <Group gap="sm">
                                    <div
                                        style={{
                                            width: 20,
                                            height: 20,
                                            borderRadius: 4,
                                            backgroundColor: theme[key] as string,
                                            border: '1px solid rgba(255,255,255,0.2)',
                                        }}
                                    />
                                    <Text size="sm" fw={500}>
                                        {labelFor(key)}
                                    </Text>
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <ColorPicker
                                    size="xl"
                                    format="hex"
                                    value={theme[key] as string}
                                    onChange={(color) => updateColor(key, color)}
                                    swatchesPerRow={5}
                                    swatches={[...Object.values(colorOptions)]}
                                    fullWidth
                                />
                                <Stack mt="md" gap="xs">
                                    <Text size="sm" fw={500}>Transparency</Text>
                                    <Slider
                                        value={theme.primaryOpacity * 100}
                                        onChange={(value) => setTheme((prev) => ({ ...prev, primaryOpacity: value / 100 }))}
                                        min={0}
                                        max={100}
                                        step={1}
                                        label={(value) => `${value}%`}
                                        marks={[
                                            { value: 0, label: '0%' },
                                            { value: 50, label: '50%' },
                                            { value: 100, label: '100%' },
                                        ]}
                                    />
                                    <div
                                        style={{
                                            marginTop: 25,
                                            padding: '0.75rem',
                                            borderRadius: 12,
                                            backgroundColor: hexToRgba(theme.primaryColor, theme.primaryOpacity),
                                            color: theme.textColor,
                                            textAlign: 'center',
                                        }}
                                    >
                                        Preview
                                    </div>
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    ))}
                </Accordion>
                <Checkbox
                    label="Grid layout for products"
                    checked={theme.products_layout === 'grid'}
                    onChange={(event) => {
                        const checked = event.target?.checked ?? event.currentTarget?.checked ?? false;
                        setTheme((prev) => ({
                            ...prev,
                            products_layout: checked ? 'grid' : 'list',
                        }));
                    }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px" }}>
                    <PrimaryButton onClick={saveTheme} title="Apply Theme" color='#00ff0071' />
                    <PrimaryButton onClick={onClose} title="Close" color='#ff000095' />
                    <PrimaryButton onClick={() => setResetPromptOpen(true)} title="Reset Theme" />
                </div>
            </Stack>
            <ResetPrompt
                opened={resetPromptOpen}
                onConfirm={() => {
                    resetTheme();
                    setResetPromptOpen(false);
                }}
                onCancel={() => setResetPromptOpen(false)}
            />
        </Modal>
    );
};
