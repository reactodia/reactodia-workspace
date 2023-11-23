import * as React from 'react';
import classnames from 'classnames';

export interface HamburgerMenuProps {
    className?: string;
    title?: string;
    children: React.ReactNode;
}

const CLASS_NAME = 'reactodia-hamburger-menu';

interface HamburgerMenuContext {
    closeMenu: () => void;
}
const HamburgerMenuContext = React.createContext<HamburgerMenuContext | null>(null);

export function HamburgerMenu(props: HamburgerMenuProps) {
    const {className, title, children} = props;
    const menuRef = React.useRef<HTMLElement | null>(null);
    const [expanded, setExpanded] = React.useState(false);
    const providedContext = React.useMemo((): HamburgerMenuContext => ({
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
        <HamburgerMenuContext.Provider value={providedContext}>
            <nav ref={menuRef}
                className={classnames(
                    className,
                    CLASS_NAME,
                    expanded ? `${CLASS_NAME}--expanded` : `${CLASS_NAME}--collapsed`
                )}
                title={title}>
                <button type='button'
                    className={`${CLASS_NAME}__toggle reactodia-btn reactodia-btn-default`}
                    onClick={() => setExpanded(value => !value)}
                />
                <ul role='menu'
                    className={`${CLASS_NAME}__items`}>
                    {children}
                </ul>
            </nav>
        </HamburgerMenuContext.Provider>
    );
}

export interface HamburgerMenuItemProps {
    className?: string;
    title?: string;
    disabled?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
}

const ITEM_CLASS_NAME = 'reactodia-hamburger-menu-item';

export function HamburgerMenuItem(props: HamburgerMenuItemProps) {
    const {className, title, disabled, onClick, children} = props;
    const menuContext = React.useContext(HamburgerMenuContext);

    const wrappedOnClick = React.useCallback(() => {
        menuContext?.closeMenu();
        onClick?.();
    }, [onClick, menuContext]);

    return (
        <li role='menuitem'
            className={classnames(
                className,
                ITEM_CLASS_NAME,
                disabled ? `${ITEM_CLASS_NAME}--disabled` : undefined
            )}
            title={title}
            onClick={disabled ? undefined : wrappedOnClick}>
            {children}
        </li>
    );
}
