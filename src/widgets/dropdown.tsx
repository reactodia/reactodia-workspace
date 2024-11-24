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
     * Component to display as a toggle for the dropdown.
     */
    toggle: React.ReactNode;
    /**
     * Content to display when the dropdown is expanded.
     *
     * @see DropdownItem
     */
    children: React.ReactNode;
    /**
     * Whether to auto-close the dropdown when clicked outside its DOM element.
     *
     * @default false
     */
    closeOnOutsideClick?: boolean;
}

export interface DropdownContext {
    setExpanded: (update: (value: boolean) => boolean) => void;
}
export const DropdownContext = React.createContext<DropdownContext | null>(null);

const CLASS_NAME = 'reactodia-dropdown';

/**
 * Utility component to display a custom dropdown element.
 *
 * @category Components
 */
export function Dropdown(props: DropdownProps) {
    const {className, toggle, closeOnOutsideClick, children} = props;
    const menuRef = React.useRef<HTMLElement | null>(null);
    const [expanded, setExpanded] = React.useState(false);
    const providedContext = React.useMemo(
        (): DropdownContext => ({setExpanded}),
        [setExpanded]
    );

    React.useLayoutEffect(() => {
        if (closeOnOutsideClick && expanded) {
            const closeMenu = (e: MouseEvent) => {
                // Auto-close menu on clicks from outside
                if (e.target instanceof Node && !menuRef.current?.contains(e.target)) {
                    setExpanded(false);
                }
            };
            document.body.addEventListener('click', closeMenu);
            return () => document.body.removeEventListener('click', closeMenu);
        }
    }, [closeOnOutsideClick, expanded]);

    return (
        <DropdownContext.Provider value={providedContext}>
            <nav ref={menuRef}
                className={classnames(
                    className,
                    CLASS_NAME,
                    expanded ? `${CLASS_NAME}--expanded` : `${CLASS_NAME}--collapsed`
                )}>
                {toggle}
                <div className={`${CLASS_NAME}__content`}>
                    {children}
                </div>
            </nav>
        </DropdownContext.Provider>
    );
}

/**
 * Props for `DropdownMenu` component.
 *
 * @see DropdownMenu
 */
export interface DropdownMenuProps {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Title for the toggle menu button.
     */
    title?: string;
    /**
     * `DropdownMenuItem` list items for the dropdown menu.
     *
     * @see DropdownItem
     */
    children: React.ReactNode;
}

const MENU_CLASS_NAME = 'reactodia-dropdown-menu';

/**
 * Utility component to display a dropdown menu with a list of items.
 *
 * @category Components
 */
export function DropdownMenu(props: DropdownMenuProps) {
    const {className, title, children} = props;

    return (
        <Dropdown className={classnames(className, MENU_CLASS_NAME)}
            toggle={
                <DropdownMenuToggleButton title={title} />
            }
            closeOnOutsideClick={true}>
            <ul role='menu'
                className={`${MENU_CLASS_NAME}__items`}>
                {children}
            </ul>
        </Dropdown>
    );
}

function DropdownMenuToggleButton(props: { title?: string }) {
    const {title} = props;
    const dropdownContext = React.useContext(DropdownContext);

    return (
        <button type='button'
            className={`${MENU_CLASS_NAME}__toggle reactodia-btn reactodia-btn-default`}
            title={title}
            onClick={() => dropdownContext?.setExpanded(value => !value)}
        />
    );
}

/**
 * Props for `DropdownMenuItem` component.
 *
 * @see DropdownMenuItem
 */
export interface DropdownMenuItemProps {
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

const ITEM_CLASS_NAME = 'reactodia-dropdown-menu-item';

/**
 * Utility component to display a single dropdown menu item.
 *
 * @category Components
 */
export function DropdownMenuItem(props: DropdownMenuItemProps) {
    const {className, title, disabled, onSelect, children} = props;
    const menuContext = React.useContext(DropdownContext);

    const wrappedOnClick = React.useCallback(() => {
        menuContext?.setExpanded(() => false);
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
 * React hook to check if a component is rendered inside a dropdown.
 *
 * @category Hooks
 * @see Dropdown
 */
export function useInsideDropdown(): boolean {
    const menuContext = React.useContext(DropdownContext);
    return Boolean(menuContext);
}
