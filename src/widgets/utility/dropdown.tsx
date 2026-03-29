import cx from 'clsx';
import * as React from 'react';

/**
 * Props for {@link Dropdown} component.
 *
 * @see {@link Dropdown}
 */
export interface DropdownProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Dropdown expand direction.
     *
     * @default "down"
     */
    direction?: 'down' | 'up';
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
     * @see {@link DropdownItem}
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
    const {
        className, direction = 'down', expanded, toggle, onClickOutside, children,
        ...otherProps
    } = props;
    const menuRef = React.useRef<HTMLDivElement | null>(null);

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
        <div {...otherProps}
            ref={menuRef}
            className={cx(
                className,
                CLASS_NAME,
                direction === 'down' ? `${CLASS_NAME}--down` : `${CLASS_NAME}--up`,
                expanded ? `${CLASS_NAME}--expanded` : `${CLASS_NAME}--collapsed`
            )}>
            {direction === 'down' ? toggle : null}
            <div className={`${CLASS_NAME}__content`} aria-hidden={!expanded}>
                {children}
            </div>
            {direction === 'up' ? toggle : null}
        </div>
    );
}

/**
 * Props for {@link DropdownMenu} component.
 *
 * @see {@link DropdownMenu}
 */
export interface DropdownMenuProps extends React.HTMLAttributes<HTMLElement> {
    /**
     * Additional CSS class for the component.
     */
    className?: string;
    /**
     * Dropdown menu expand direction.
     *
     * @default "down"
     */
    direction?: 'down' | 'up';
    /**
     * Title for the toggle menu button.
     */
    title?: string;
    /**
     * {@link DropdownMenuItem} list items for the dropdown menu.
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
    const {className, direction, title, children, ...otherProps} = props;
    const [expanded, setExpanded] = React.useState(false);
    const providedContext = React.useMemo(
        (): DropdownMenuContext => ({expanded, setExpanded}),
        [expanded, setExpanded]
    );
    const onClickOutside = React.useCallback(() => setExpanded(false), [setExpanded]);
    return (
        <DropdownMenuContext.Provider value={providedContext}>
            <Dropdown {...otherProps}
                className={cx(className, MENU_CLASS_NAME)}
                aria-haspopup='menu'
                direction={direction}
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
    const {expanded, setExpanded} = useDropdownMenu();

    return (
        <button type='button'
            className={cx(
                `${MENU_CLASS_NAME}__toggle`,
                'reactodia-btn',
                'reactodia-btn-default',
                expanded ? 'active' : undefined
            )}
            title={title}
            onClick={() => setExpanded(value => !value)}
        />
    );
}

/**
 * Props for {@link DropdownMenuItem} component.
 *
 * @see {@link DropdownMenuItem}
 */
export interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLElement> {
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
    const {className, title, disabled, onSelect, children, ...otherProps} = props;
    const menuContext = useDropdownMenu();

    const wrappedOnClick = React.useCallback(() => {
        menuContext?.setExpanded(() => false);
        onSelect?.();
    }, [onSelect, menuContext]);

    return (
        <li {...otherProps}
            role='menuitem'
            className={cx(
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
 * @see {@link DropdownMenu}
 */
export function useInsideDropdown(): boolean {
    const menuContext = React.useContext(DropdownMenuContext);
    return Boolean(menuContext);
}
