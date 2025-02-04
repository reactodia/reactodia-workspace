import * as React from 'react';
import classnames from 'classnames';

import { Events } from '../../coreUtils/events';
import { useObservedProperty } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';
import { Debouncer } from '../../coreUtils/scheduler';

import { useCanvas } from '../../diagram/canvasApi';
import type { Rect, Size, Vector } from '../../diagram/geometry';

import { Dropdown } from '../utility/dropdown';
import { useSearchInputStore } from '../utility/searchInput';
import { getParentDockAlignment } from '../utility/viewportDock';
// TODO: move into widgets
import { DraggableHandle } from '../../workspace/draggableHandle';

import { UnifiedSearchSectionContext } from './searchSection';

/**
 * Props for {@link UnifiedSearch} component.
 *
 * @see {@link UnifiedSearch}
 */
export interface UnifiedSearchProps {
    /**
     * Available sections (providers) to search with.
     */
    sections: ReadonlyArray<UnifiedSearchSection>;
    /**
     * Event bus to listen commands for this component.
     */
    commands?: Events<UnifiedSearchCommands>;
    /**
     * Default (initial) width for the component, including
     * the search input and the dropdown.
     *
     * @default 300
     */
    defaultWidth?: number;
    /**
     * Default (initial) height for the component
     * when the dropdown is expanded.
     *
     * @default 350
     */
    defaultHeight?: number;
    /**
     * Minimum width for the dropdown when resized.
     *
     * @default 200
     */
    minWidth?: number;
    /**
     * Minimum height for the dropdown when resized.
     *
     * @default 150
     */
    minHeight?: number;
    /**
     * Offset from right side of the canvas viewport to limit max width.
     *
     * @default 20
     */
    offsetWithMaxWidth?: number;
    /**
     * Offset from bottom side of the canvas viewport to limit max width.
     *
     * @default 20
     */
    offsetWithMaxHeight?: number;
    /**
     * Placeholder text for the search input.
     *
     * @default "Search for..."
     */
    placeholder?: string;
}

/**
 * Section (provider) to search with in {@link UnifiedSearch}.
 *
 * @see {@link UnifiedSearchProps}
 */
export interface UnifiedSearchSection {
    /**
     * Unique section key (arbitrary string).
     */
    readonly key: string;
    /**
     * Section label to display in the search.
     */
    readonly label: string;
    /**
     * Component to provide and display search results.
     *
     * To access provided search context, use {@link useUnifiedSearchSection} hook.
     */
    readonly component: React.ReactNode;
}

/**
 * Events for {@link UnifiedSearch} event bus.
 *
 * @see {@link UnifiedSearch}
 */
export interface UnifiedSearchCommands {
    /**
     * Can be triggered to focus on the unified search input and switch to
     * the specified section if needed.
     */
    focus: {
        /**
         * Key of the section to activate.
         */
        readonly sectionKey?: string;
    };
}

interface SectionWithContext extends UnifiedSearchSection {
    readonly context: UnifiedSearchSectionContext;
}

const CLASS_NAME = 'reactodia-unified-search';

/**
 * Component to display a search input with a dropdown for results.
 *
 * One or many available search sections (providers) can be specified via
 * {@link UnifiedSearchProps.sections sections} prop.
 *
 * @category Components
 */
export function UnifiedSearch(props: UnifiedSearchProps) {
    const {
        sections,
        commands,
        defaultWidth = 300,
        defaultHeight = 350,
        minWidth = 200,
        minHeight = 150,
        offsetWithMaxWidth = 20,
        offsetWithMaxHeight = 20,
    } = props;

    const [expanded, setExpanded] = React.useState(false);
    const [activeSection, setActiveSection] = React.useState(ActiveSection.empty);

    const findDefaultSectionKey = (): string | undefined => {
        if (sections.some(section => section.key === activeSection.previousActive)) {
            return activeSection.previousActive;
        } else if (sections.length > 0) {
            return sections[0].key;
        } else {
            return undefined;
        }
    };

    const searchStore = useSearchInputStore({initialValue: ''});
    const searchTerm = useObservedProperty(
        searchStore.events, 'changeValue', () => searchStore.value
    );

    React.useEffect(() => {
        const onClearSearch = () => {
            setActiveSection(activeSection.deactivate());
            setExpanded(false);
        };
        searchStore.events.on('clearSearch', onClearSearch);
        return () => searchStore.events.off('clearSearch', onClearSearch);
    }, [searchStore, activeSection, setActiveSection, setExpanded]);

    const [panelSize, setPanelSize] = React.useState<Size>({
        width: defaultWidth,
        height: defaultHeight,
    });
    const maxSize = React.useRef<Size>({
        width: Infinity,
        height: Infinity,
    });
    const resizePanel = (size: Size) => {
        const nextSize: Size = {
            width: Math.max(size.width, minWidth),
            height: Math.max(size.height, minHeight),
        };
        if (!(panelSize.width === nextSize.width && panelSize.height === nextSize.height)) {
            setPanelSize(nextSize);
        }
    };
    const updateMaxSize = (nextMaxSize: Size) => {
        maxSize.current = nextMaxSize;
        if (panelSize.width > nextMaxSize.width || panelSize.height > nextMaxSize.height) {
            setPanelSize({...panelSize});
        }
    };
    const effectiveSize: Size = {
        width: Math.min(panelSize.width, maxSize.current.width),
        height: Math.min(panelSize.height, maxSize.current.height),
    };

    const sectionsWithContext = React.useMemo(
        (): readonly SectionWithContext[] => sections.map((section): SectionWithContext => ({
            ...section,
            context: {
                searchStore,
                isSectionActive: section.key === activeSection?.key,
                setSectionActive: (active, searchExtra) => {
                    if (active) {
                        setActiveSection(
                            activeSection.activate(section.key, searchExtra)
                        );
                        setExpanded(true);
                    } else {
                        setActiveSection(activeSection.deactivate());
                        setExpanded(false);
                    }
                },
            }
        })),
        [sections, searchStore, activeSection, setActiveSection, setExpanded]
    );

    const toggleInputRef = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => {
        if (commands) {
            const onFocus = ({sectionKey}: UnifiedSearchCommands['focus']): void => {
                if (sectionKey) {
                    if (sections.some(section => section.key === sectionKey)) {
                        setActiveSection(activeSection.activate(sectionKey));
                    } else {
                        console.warn(
                            `Unified search: cannot activate section that does not exists: ${sectionKey}`
                        );
                    }
                }
                toggleInputRef.current?.focus();
            };
            commands.on('focus', onFocus);
            return () => commands.off('focus', onFocus);
        }
    }, [commands, sections, activeSection, setExpanded, setActiveSection]);

    const hasSearchQuery = (
        searchTerm.length > 0 ||
        activeSection.getSearchExtra() !== undefined
    );

    const onClickOutside = React.useCallback(() => {
        if (!hasSearchQuery) {
            setExpanded(false);
        }
    }, [hasSearchQuery, setExpanded]);

    return (
        <Dropdown className={CLASS_NAME}
            expanded={expanded}
            onClickOutside={onClickOutside}
            toggle={
                <SearchToggle inputRef={toggleInputRef}
                    searchTerm={searchTerm}
                    setSearchTerm={value => searchStore.change({value, action: 'input'})}
                    onSubmit={() => {/*...*/}}
                    onClear={
                        hasSearchQuery
                            ? () => searchStore.change({value: '', action: 'clear'})
                            : undefined
                    }
                    expanded={expanded}
                    setExpanded={nextExpanded => {
                        if (nextExpanded) {
                            if (activeSection.key === undefined) {
                                const defaultSectionKey = findDefaultSectionKey();
                                if (defaultSectionKey) {
                                    setActiveSection(activeSection.activate(defaultSectionKey));
                                }
                            }
                        } else {
                            setActiveSection(activeSection.deactivate());
                        }
                        setExpanded(nextExpanded);
                    }}
                    minWidth={minWidth}
                    panelSize={effectiveSize}
                />
            }>
            <SearchContent sections={sectionsWithContext}
                activeSectionKey={activeSection.key}
                onActivateSection={key => setActiveSection(activeSection.switch(key))}
                size={effectiveSize}
                minSize={{width: minWidth, height: minHeight}}
                offsetForMaxSize={{x: offsetWithMaxWidth, y: offsetWithMaxHeight}}
                onResize={resizePanel}
                setMaxSize={updateMaxSize}
            />
        </Dropdown>
    );
}

class ActiveSection {
    static readonly empty = new ActiveSection(undefined, undefined, {});

    private constructor(
        readonly key: string | undefined,
        readonly previousActive: string | undefined,
        readonly searchExtras: { readonly [sectionKey: string]: object | undefined }
    ) {}

    getSearchExtra(): object | undefined {
        const {key, searchExtras} = this;
        if ((
            key !== undefined &&
            Object.prototype.hasOwnProperty.call(searchExtras, key)
        )) {
            return searchExtras[key];
        }
        return undefined;
    }

    activate(key: string, extra?: object): ActiveSection {
        if (this.key === key && this.getSearchExtra() === extra) {
            return this;
        }
        const previousActive = this.key === key ? this.previousActive : this.key;
        const searchExtras = {...this.searchExtras, [key]: extra};
        return new ActiveSection(key, previousActive, searchExtras);
    }

    deactivate(): ActiveSection {
        return new ActiveSection(undefined, this.key, this.searchExtras);
    }

    switch(key: string): ActiveSection {
        if (this.key === key) {
            return this;
        }
        return new ActiveSection(key, this.key, this.searchExtras);
    }
}

function SearchToggle(props: {
    inputRef: React.RefObject<HTMLInputElement>,
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    onSubmit: () => void;
    onClear?: () => void;
    expanded: boolean;
    setExpanded: (expanded: boolean) => void;
    minWidth: number;
    panelSize?: Size;
}) {
    const {
        inputRef, searchTerm, setSearchTerm, onSubmit, onClear, expanded, setExpanded,
        minWidth, panelSize,
    } = props;
    const t = useTranslation();

    return (
        <div className={classnames(`${CLASS_NAME}__toggle`)}
            style={{
                width: panelSize?.width,
            }}>
            <input ref={inputRef}
                type='text'
                className={`${CLASS_NAME}__search-input`}
                style={{minWidth}}
                placeholder={t.text('unified_search.input.placeholder')}
                name='reactodia-search'
                value={searchTerm}
                onClick={() => setExpanded(true)}
                onFocus={() => setExpanded(true)}
                onChange={e => setSearchTerm(e.currentTarget.value)}
                onKeyUp={e => {
                    switch (e.key) {
                        case 'Enter': {
                            if (searchTerm.length > 0) {
                                setExpanded(true);
                            }
                            onSubmit();
                            break;
                        }
                        case 'Escape': {
                            if (onClear) {
                                onClear();
                            } else {
                                setExpanded(false);
                            }
                            break;
                        }
                        default: {
                            setExpanded(true);
                            break;
                        }
                    }
                }}
            />
            {onClear ? (
                <button type='button'
                    title={t.text('unified_search.input_clear.title')}
                    className={`${CLASS_NAME}__clear-button`}
                    onClick={onClear}>
                </button>
            ) : expanded ? (
                <button type='button'
                    title={t.text('unified_search.input_collapse.title')}
                    className={`${CLASS_NAME}__collapse-button`}
                    onClick={() => setExpanded(false)}>
                </button>
            ) : (
                <div className={`${CLASS_NAME}__search-icon`}
                    onClick={() => inputRef.current?.focus()}
                />
            )}
        </div>
    );
}

interface SearchContentProps {
    sections: ReadonlyArray<SectionWithContext>;
    activeSectionKey: string | undefined;
    onActivateSection: (sectionKey: string) => void;
    size: Size;
    minSize: Size;
    offsetForMaxSize: Vector;
    onResize: (size: Size) => void;
    setMaxSize: (size: Size) => void;
}

function SearchContent(props: SearchContentProps) {
    const {
        sections, activeSectionKey, onActivateSection,
        size, minSize, offsetForMaxSize, onResize, setMaxSize,
    } = props;

    const {canvas} = useCanvas();
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const panelBounds = React.useRef<{
        readonly bounds: Rect;
        readonly centeredByX: boolean;
        readonly centerOffsetX: number;
    }>();

    const updatePanelBounds = () => {
        if (!panelRef.current) {
            return;
        }
        const {x: rawX, y: rawY, width, height} = panelRef.current.getBoundingClientRect();
        const x = rawX + window.scrollX;
        const y = rawY + window.scrollY;
        const [alignmentX] = getParentDockAlignment(panelRef.current);
        const viewport = canvas.metrics.getViewportPageRect();
        panelBounds.current = {
            bounds: {x, y, width, height},
            // A workaround to have correct resizing behavior when the element
            // is aligned to the center without sacrificing performance to avoid
            // reading target bounds on every resize (causing a costly reflow)
            centeredByX: alignmentX === 'center',
            centerOffsetX: Math.max(
                x * 2 + width - viewport.x * 2 - viewport.width, 0
            ),
        };
    };

    useViewportResizeHandler(() => {
        if (!panelBounds.current) {
            updatePanelBounds();
        }

        if (panelBounds.current) {
            const {bounds, centeredByX, centerOffsetX} = panelBounds.current;
            const viewport = canvas.metrics.getViewportPageRect();
            const viewportRight = viewport.x + viewport.width;
            const viewportBottom = viewport.y + viewport.height;

            let proposedWidth: number;
            if (centeredByX) {
                proposedWidth = viewport.width - centerOffsetX - offsetForMaxSize.x;
            } else {
                proposedWidth = viewportRight - bounds.x - offsetForMaxSize.x;
            }
            const maxWidth = Math.max(proposedWidth, minSize.width);
            const maxHeight = Math.max(
                viewportBottom - bounds.y - offsetForMaxSize.y,
                minSize.height
            );

            setMaxSize({width: maxWidth, height: maxHeight});
        }
    });
    
    const onDrag = (e: MouseEvent, dx: number, dy: number) => {
        if (panelBounds.current) {
            const {bounds, centeredByX} = panelBounds.current;
            onResize({
                width: bounds.width + dx * (centeredByX ? 2 : 1),
                height: bounds.height + dy,
            });
        }
    };

    return (
        <div ref={panelRef}
            className={`${CLASS_NAME}__panel`}
            style={{
                width: size.width,
                height: size.height,
            }}>
            <div className={`${CLASS_NAME}__section-tabs`}>
                {sections.map(section => (
                    <button key={section.key}
                        className={classnames(
                            `${CLASS_NAME}__section-tab`,
                            'reactodia-btn-default',
                            section.key === activeSectionKey ? 'active' : undefined,
                        )}
                        onClick={() => onActivateSection(section.key)}>
                        {section.label}
                    </button>
                ))}
            </div>
            {sections.map(section => (
                <UnifiedSearchSectionContext.Provider key={section.key}
                    value={section.context}>
                    <div
                        className={classnames(
                            `${CLASS_NAME}__section`,
                            section.context.isSectionActive
                                ? `${CLASS_NAME}__section--active` : undefined
                        )}>
                        {section.component}
                    </div>
                </UnifiedSearchSectionContext.Provider>
            ))}
            <DraggableHandle axis='y'
                className={`${CLASS_NAME}__bottom-handle`}
                onBeginDragHandle={updatePanelBounds}
                onDragHandle={onDrag}>
            </DraggableHandle>
            <DraggableHandle axis='x'
                className={`${CLASS_NAME}__right-handle`}
                onBeginDragHandle={updatePanelBounds}
                onDragHandle={onDrag}>
            </DraggableHandle>
            <DraggableHandle axis='all'
                className={`${CLASS_NAME}__corner-handle`}
                onBeginDragHandle={updatePanelBounds}
                onDragHandle={onDrag}>
            </DraggableHandle>
        </div>
    );
}

function useViewportResizeHandler(handler: () => void) {
    const {canvas} = useCanvas();

    const sizeCheckerRef = React.useRef<() => void>();
    React.useLayoutEffect(() => {
        sizeCheckerRef.current = handler;
    });

    React.useLayoutEffect(() => {
        const debouncer = new Debouncer();
        const onViewportResize = () => {
            const sizeChecker = sizeCheckerRef.current;
            if (sizeChecker) {
                debouncer.call(sizeChecker);
            }
        };
        canvas.events.on('resize', onViewportResize);
        sizeCheckerRef.current?.();
        return () => {
            debouncer.dispose();
            canvas.events.off('resize', onViewportResize);
        };
    }, []);
}
