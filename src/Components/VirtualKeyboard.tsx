import { useState } from "react";
import type { CSSProperties } from "react";

const ALPHA_ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
    ['123', ' ', '✕'],
];

const NUM_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '/', ':', ';', '(', ')', '£', '&', '@', '"'],
    ['.', ',', '?', '!', "'", '⌫'],
    ['ABC', ' ', '✕'],
];

type Props = {
    value: string;
    onChange: (value: string) => void;
    onClose: () => void;
};

export const VirtualKeyboard = ({ value, onChange, onClose }: Props) => {
    const [shift, setShift] = useState(false);
    const [numMode, setNumMode] = useState(false);
    const [pressedKey, setPressedKey] = useState<string | null>(null);

    const rows = numMode ? NUM_ROWS : ALPHA_ROWS;

    const handleKey = (key: string) => {
        switch (key) {
            case '⌫': return onChange(value.slice(0, -1));
            case '✕': return onClose();
            case '⇧': return setShift(s => !s);
            case '123': return setNumMode(true);
            case 'ABC': return (() => { setNumMode(false); setShift(false); })();
            case ' ': return onChange(value + ' ');
            default: {
                const char = (!numMode && shift) ? key.toUpperCase() : key;
                onChange(value + char);
                if (shift) setShift(false);
            }
        }
    };

    return (
        <div style={styles.overlay}>
            {rows.map((row, ri) => (
                <div key={ri} style={styles.row}>
                    {row.map(key => {
                        const isSpace = key === ' ';
                        const isClose = key === '✕';
                        const isBackspace = key === '⌫';
                        const isShiftActive = key === '⇧' && shift;
                        const isModeSwitch = key === '123' || key === 'ABC';
                        const displayLabel = isSpace
                            ? 'space'
                            : (!numMode && !['⇧', '⌫', '✕'].includes(key) && shift)
                                ? key.toUpperCase()
                                : key;

                        return (
                            <button
                                key={`${ri}-${key}`}
                                type="button"
                                onPointerDown={(event) => {
                                    event.preventDefault();
                                    setPressedKey(`${ri}-${key}`);
                                    handleKey(key);
                                }}
                                onPointerUp={() => setPressedKey(null)}
                                onPointerLeave={() => setPressedKey(null)}
                                onPointerCancel={() => setPressedKey(null)}
                                style={{
                                    ...styles.key,
                                    ...(isSpace ? styles.spaceKey : {}),
                                    ...(isClose ? styles.closeKey : {}),
                                    ...((isBackspace || isModeSwitch) ? styles.wideKey : {}),
                                    ...(isShiftActive ? styles.shiftActive : {}),
                                    ...(pressedKey === `${ri}-${key}` ? styles.keyPressed : {}),
                                }}
                            >
                                {displayLabel}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

const styles: Record<string, CSSProperties> = {
    overlay: {
        width: '100%',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#d1d5db',
        padding: '8px 6px 14px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.18)',
    },
    row: {
        display: 'flex',
        justifyContent: 'center',
        gap: 5,
    },
    key: {
        minWidth: 0,
        flex: 1,
        maxWidth: 100,
        height: 'clamp(42px, 8vh, 76px)',
        padding: '0 8px',
        fontSize: 'clamp(16px, 3vw, 32px)',
        fontWeight: 500,
        fontFamily: 'Montserrat, Arial, sans-serif',
        background: '#ffffff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        boxShadow: '0 2px 0 #9ca3af',
        color: '#1a1a1a',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
    },
    keyPressed: {
        background: '#747474',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
    },
    wideKey: {
        flex: 1.5,
        maxWidth: 150,
        background: '#9ca3af',
        color: '#1a1a1a',
        fontSize: 'clamp(16px, 3vw, 32px)',
    },
    spaceKey: {
        flex: 1,
        maxWidth: 400,
    },
    closeKey: {
        flex: 1.5,
        maxWidth: 150,
        background: '#e53935',
        color: '#ffffff',
        boxShadow: '0 2px 0 #b71c1c',
    },
    shiftActive: {
        background: '#4CAF50',
        color: '#ffffff',
        boxShadow: '0 2px 0 #388e3c',
    },
};
