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
     * Whether the dropdown should be rendering in the expanded state.
     */
    expanded: boolean;
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
     * Handler for clicks outside the dropdown DOM element.
     */
    onClickOutside?: () => void;
}

const CLASS_NAME = 'reactodia-dropdown';

/**
 * Utility component to display a controllable dropdown.
 *
 * @category Components
 */
export function Dropdown(props: DropdownProps) {
    const {className, expanded, toggle, onClickOutside, children} = props;
    const menuRef = React.useRef<HTMLElement | null>(null);

    React.useLayoutEffect(() => {
        if (onClickOutside && expanded) {
            const closeMenu = (e: PointerEvent) => {
                // Auto-close menu on clicks from outside
                if (e.target instanceof Node && !menuRef.current?.contains(e.target)) {
                    onClickOutside();
                }
            };
            document.body.addEventListener('pointerdown', closeMenu);
            return () => document.body.removeEventListener('pointerdown', closeMenu);
        }
    }, [onClickOutside, expanded]);

    return (
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
    const [expanded, setExpanded] = React.useState(false);
    const providedContext = React.useMemo(
        (): DropdownMenuContext => ({expanded, setExpanded}),
        [expanded, setExpanded]
    );
    const onClickOutside = React.useCallback(() => setExpanded(false), [setExpanded]);
    return (
        <DropdownMenuContext.Provider value={providedContext}>
            <Dropdown className={classnames(className, MENU_CLASS_NAME)}
                expanded={expanded}
                toggle={
                    <DropdownMenuToggleButton title={title} />
                }
                onClickOutside={onClickOutside}>
                <ul role='menu'
                    className={`${MENU_CLASS_NAME}__items`}>
                    {children}
                </ul>
            </Dropdown>
        </DropdownMenuContext.Provider>
    );
}

export interface DropdownMenuContext {
    expanded: boolean;
    setExpanded: (update: (value: boolean) => boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContext | null>(null);

export function useDropdownMenu(): DropdownMenuContext {
    const context = React.useContext(DropdownMenuContext);
    if (!context) {
        throw new Error('Missing Reactodia dropdown menu context');
    }
    return context;
}

function DropdownMenuToggleButton(props: { title?: string }) {
    const {title} = props;
    const {setExpanded} = useDropdownMenu();

    return (
        <button type='button'
            className={`${MENU_CLASS_NAME}__toggle reactodia-btn reactodia-btn-default`}
            title={title}
            onClick={() => setExpanded(value => !value)}
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
    const menuContext = useDropdownMenu();

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
 * React hook to check if a component is rendered inside a dropdown menu.
 *
 * @category Hooks
 * @see Dropdown
 */
export function useInsideDropdown(): boolean {
    const menuContext = React.useContext(DropdownMenuContext);
    return Boolean(menuContext);
}