import { useRef, useState, type ComponentProps } from "react";
import { VirtualKeyboard } from "./VirtualKeyboard";

type Props = Omit<ComponentProps<"input">, "value" | "onChange"> & {
    value: string;
    onValueChange: (value: string) => void;
};

export const KeyboardInput = ({
    value,
    onValueChange,
    onFocus,
    onBlur,
    ...inputProps
}: Props) => {
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <>
            <input
                {...inputProps}
                ref={inputRef}
                value={value}
                onChange={(event) => onValueChange(event.currentTarget.value)}
                onFocus={(event) => {
                    setKeyboardOpen(true);
                    onFocus?.(event);
                }}
                onBlur={(event) => {
                    setKeyboardOpen(false);
                    onBlur?.(event);
                }}
            />
            {keyboardOpen && (
                <VirtualKeyboard
                    value={value}
                    onChange={onValueChange}
                    onClose={() => {
                        setKeyboardOpen(false);
                        inputRef.current?.blur();
                    }}
                />
            )}
        </>
    );
};
