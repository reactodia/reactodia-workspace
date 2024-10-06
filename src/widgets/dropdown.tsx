import * as React from 'react';
import classnames from 'classnames';

/**
 * Props for `Dropdown` component.
 *
 * @see Dropdown
 */
export interface DropdownProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Title for the toggle menu button.
     */
    title?: string;
    /**
     * `DropdownItem` list items for the dropdown menu.
     *
     * @see DropdownItem
     */
    children: React.ReactNode;
}

const CLASS_NAME = 'reactodia-dropdown';

interface DropdownContext {
    closeMenu: () => void;
}
const DropdownContext = React.createContext<DropdownContext | null>(null);

/**
 * Utility component to display a dropdown menu with a list of items.
 *
 * @category Components
 */
export function Dropdown(props: DropdownProps) {
    const {className, title, children} = props;
    const menuRef = React.useRef<HTMLElement | null>(null);
    const [expanded, setExpanded] = React.useState(false);
    const providedContext = React.useMemo((): DropdownContext => ({
        closeMenu: () => setExpanded(false),
    }), [setExpanded]);

    React.useLayoutEffect(() => {
        if (expanded) {
            const closeMenu = (e: MouseEvent) => {
                // Auto-close menu on clicks from outside
                if (e.target instanceof Node && !menuRef.current?.contains(e.target)) {
                    setExpanded(false);
                }
            };
            document.body.addEventListener('click', closeMenu);
            return () => document.body.removeEventListener('click', closeMenu);
        }
    }, [expanded]);

    return (
        <DropdownContext.Provider value={providedContext}>
            <nav ref={menuRef}
                className={classnames(
                    className,
                    CLASS_NAME,
                    expanded ? `${CLASS_NAME}--expanded` : `${CLASS_NAME}--collapsed`
                )}>
                <button type='button'
                    className={`${CLASS_NAME}__toggle reactodia-btn reactodia-btn-default`}
                    title={title}
                    onClick={() => setExpanded(value => !value)}
                />
                <ul role='menu'
                    className={`${CLASS_NAME}__items`}>
                    {children}
                </ul>
            </nav>
        </DropdownContext.Provider>
    );
}

/**
 * Props for `DropdownItem` component.
 *
 * @see DropdownItem
 */
export interface DropdownItemProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Title for the list item.
     */
    title?: string;
    /**
     * Whether the menu item is disabled for selection.
     *
     * @default false
     */
    disabled?: boolean;
    /**
     * Handler for the menu item selection.
     */
    onSelect?: () => void;
    /**
     * Menu item content.
     */
    children: React.ReactNode;
}

const ITEM_CLASS_NAME = 'reactodia-dropdown-item';

/**
 * Utility component to display a single dropdown menu item.
 *
 * @category Components
 */
export function DropdownItem(props: DropdownItemProps) {
    const {className, title, disabled, onSelect, children} = props;
    const menuContext = React.useContext(DropdownContext);

    const wrappedOnClick = React.useCallback(() => {
        menuContext?.closeMenu();
        onSelect?.();
    }, [onSelect, menuContext]);

    return (
        <li role='menuitem'
            className={classnames(
                className,
                ITEM_CLASS_NAME,
                disabled ? `${ITEM_CLASS_NAME}--disabled` : undefined,
                'reactodia-btn reactodia-btn-default'
            )}
            title={title}
            onClick={disabled ? undefined : wrappedOnClick}>
            {children}
        </li>
    );
}

/**
 * React hook to check if a component is rendered inside a dropdown menu.
 *
 * @category Hooks
 * @see Dropdown
 */
export function useInsideDropdown(): boolean {
    const menuContext = React.useContext(DropdownContext);
    return Boolean(menuContext);
}
