import * as React from 'react';

import {
    LabelLanguageSelector, type TranslationBundle, TranslationContext,
} from '../coreUtils/i18n';

import { MetadataProvider } from '../data/metadataProvider';
import { TemplateProperties } from '../data/schema';
import { ValidationProvider } from '../data/validationProvider';

import { TypeStyleResolver, RenameLinkProvider } from '../diagram/customization';
import { Element } from '../diagram/elements';
import { CommandHistory, InMemoryHistory } from '../diagram/history';
import { LayoutFunction } from '../diagram/layout';
import { DefaultTranslation, DefaultTranslationBundle } from '../diagram/locale';

import { EntityElement } from '../editor/dataElements';
import {
    type DialogSettingsProvider, DefaultDialogSettingsProvider,
} from '../editor/overlayController';

import { WorkspaceContext, WorkspaceEventKey } from './workspaceContext';
import {
    TrackedWorkspaceContext, WorkspaceProvider, createWorkspace,
} from './workspaceProvider';

/**
 * Props for {@link Workspace} component.
 *
 * @see {@link Workspace}
 */
export interface WorkspaceProps {
    /**
     * Overrides default command history implementation.
     *
     * By default, {@link InMemoryHistory} instance is used.
     */
    history?: CommandHistory;
    /**
     * Allows to customize how colors and icons are assigned to elements based
     * on its types.
     *
     * By default, the colors are assigned deterministically based on total
     * hash of type strings.
     *
     * For non-{@link EntityElement entity} elements, the {@link Element.elementState}
     * is checked for {@link TemplateProperties.ColorVariant} template state property
     * instead.
     */
    typeStyleResolver?: TypeStyleResolver;
    /**
     * Provides defaults and persists changes to {@link OverlayDialog overlay dialog} properties.
     *
     * By default, {@link DefaultDialogSettingsProvider} instance is used.
     */
    dialogSettingsProvider?: DialogSettingsProvider;
    /**
     * Provides an strategy to visually edit graph data.
     * 
     * If provided, switches editor into the graph authoring mode.
     */
    metadataProvider?: MetadataProvider;
    /**
     * Provides a strategy to validate changes to the data in the graph authoring mode.
     */
    validationProvider?: ValidationProvider;
    /**
     * Provides a strategy to rename diagram links (change labels).
     *
     * By default, {@link DefaultRenameLinkProvider} instance is used.
     *
     * If specified as `null`, the default provider would not be used.
     */
    renameLinkProvider?: RenameLinkProvider | null;
    /**
     * Additional translation bundles for UI text strings in the workspace
     * in order from higher to lower priority.
     *
     * @default []
     * @see {@link useDefaultTranslation}
     */
    translations?: ReadonlyArray<Partial<TranslationBundle>>;
    /**
     * If set, disables translation fallback which (with default `en` language).
     *
     * @default true
     * @see {@link translations}
     */
    useDefaultTranslation?: boolean;
    /**
     * Overrides how a single label gets selected from multiple of them based on target language.
     */
    selectLabelLanguage?: LabelLanguageSelector;
    /**
     * Initial language to display the graph data with.
     */
    defaultLanguage?: string;
    /**
     * Default function to compute diagram layout.
     *
     * It is recommended to get layout function from a background worker,
     * e.g. with {@link defineDefaultLayouts} and {@link useWorker}.
     *
     * In cases when a worker is not available, it is possible to import and
     * use {@link blockingDefaultLayout} as a synchronous fallback.
     */
    defaultLayout: LayoutFunction;
    /**
     * Handler for a well-known workspace event.
     */
    onWorkspaceEvent?: (key: WorkspaceEventKey) => void;
    /**
     * Component children.
     */
    children: React.ReactNode;
}

/**
 * Top-level component which establishes workspace context, which stores
 * graph data and provides means to display and interact with the diagram.
 *
 * For more control over workspace lifecycle {@link WorkspaceProvider}
 * with {@link createWorkspace} can be used instead.
 *
 * @category Components
 */
export class Workspace extends React.Component<WorkspaceProps> {
    private readonly _workspace: TrackedWorkspaceContext;

    /** @hidden */
    static contextType = TranslationContext;
    /** @hidden */
    declare context: React.ContextType<typeof TranslationContext>;

    /** @hidden */
    constructor(props: WorkspaceProps, context: unknown) {
        super(props, context);

        const {
            history,
            dialogSettingsProvider,
            metadataProvider,
            validationProvider,
            renameLinkProvider,
            typeStyleResolver,
            selectLabelLanguage,
            translations = [],
            useDefaultTranslation = true,
            defaultLanguage,
            defaultLayout,
            onWorkspaceEvent,
        } = this.props;

        let bundles = translations;
        if (useDefaultTranslation) {
            bundles = [...translations, DefaultTranslationBundle];
        }
        this._workspace = createWorkspace({
            translation: this.context ?? new DefaultTranslation({
                bundles,
                selectLabel: selectLabelLanguage,
            }),
            history,
            dialogSettingsProvider,
            metadataProvider,
            validationProvider,
            renameLinkProvider,
            typeStyleResolver,
            defaultLanguage,
            defaultLayout,
            onWorkspaceEvent,
        });
    }

    /**
     * Returns top-level workspace context.
     */
    getContext(): WorkspaceContext {
        return this._workspace;
    }

    /** @hidden */
    render() {
        const {children} = this.props;
        return (
            <WorkspaceProvider workspace={this._workspace}>
                {children}
            </WorkspaceProvider>
        );
    }
}
