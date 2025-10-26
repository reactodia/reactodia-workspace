require('../styles/main.scss');

export { AbortScope, mapAbortedToNull, delay } from './coreUtils/async';
export { moveComparator, shallowArrayEqual } from './coreUtils/collections';
export { useColorScheme } from './coreUtils/colorScheme';
export {
    Listener, AnyListener, AnyEvent, PropertyChange,
    Events, EventTrigger, EventObserver, EventSource,
} from './coreUtils/events';
export {
    SyncStore, useEventStore, useFrameDebouncedStore, useObservedProperty,
    useSyncStore, useSyncStoreWithComparator,
} from './coreUtils/hooks';
export type { HotkeyString } from './coreUtils/hotkey';
export {
    LabelLanguageSelector, TranslatedProperty, TranslatedText, Translation, useTranslation,
} from './coreUtils/i18n';
export { KeyedObserver, KeyedSyncStore, useKeyedSyncStore } from './coreUtils/keyedObserver';
export { useWorker } from './coreUtils/workers';
export { Debouncer, animateInterval } from './coreUtils/scheduler';

export * from './data/dataProvider';
export * from './data/model';
export {
    MetadataProvider, MetadataCanConnect, MetadataCanModifyEntity, MetadataCanModifyRelation,
    MetadataEntityShape, MetadataRelationShape, MetadataPropertyShape, BaseMetadataProvider,
} from './data/metadataProvider';
export {
    ValidationProvider, ValidationEvent, ValidationResult, ValidatedElement, ValidatedLink,
    ValidationSeverity,
} from './data/validationProvider';
export {
    DiagramContextV1, PlaceholderEntityType, PlaceholderRelationType,
    TemplateProperties, PinnedProperties,
} from './data/schema';
export * from './data/composite/composite';
export {
    DecoratedDataProvider, DecoratedDataProviderOptions, DecoratedMethodName, delayProviderDecorator,
} from './data/decorated/decoratedDataProvider';
export { EmptyDataProvider } from './data/decorated/emptyDataProvider';
export {
    IndexedDbCachedProvider, IndexedDbCachedProviderOptions,
} from './data/indexedDb/indexedDbCachedProvider';
export { MemoryDataset, IndexQuadBy, indexedDataset } from './data/rdf/memoryDataset';
export * from './data/rdf/rdfDataProvider';
/**
 * Utility namespace to work with [RDF.js model](https://rdf.js.org/data-model-spec/).
 *
 * @category Core
 */
export * as Rdf from './data/rdf/rdfModel';
export * from './data/rdf/vocabulary';
export * from './data/sparql/sparqlDataProvider';
export * from './data/sparql/sparqlDataProviderSettings';

export * from './diagram/canvasApi';
export { type CanvasHotkey, useCanvasHotkey } from './diagram/canvasHotkey';
export {
    RestoreGeometry, setElementState, setElementExpanded, setLinkState,
    changeLinkTypeVisibility, restoreCapturedLinkGeometry, restoreViewport,
    placeElementsAroundTarget,
} from './diagram/commands';
export * from './diagram/customization';
export {
    Element, ElementEvents, ElementProps, ElementTemplateState,
    Link, LinkEvents, LinkProps, LinkTemplateState, LinkVertex,
    Cell, VoidElement, LinkTypeVisibility,
} from './diagram/elements';
export { ElementDecoration } from './diagram/elementLayer';
export {
    Rect, ShapeGeometry, Size, SizeProvider, Vector, boundsOf, calculateAveragePosition,
    computePolyline, computePolylineLength, findElementAtPoint, findNearestSegmentIndex,
    getContentFittingBox, getPointAlongPolyline, isPolylineEqual, pathFromPolyline,
} from './diagram/geometry';
export { CellsChangedEvent } from './diagram/graph';
export * from './diagram/history';
export {
    CalculatedLayout, LayoutGraph, LayoutState, LayoutNode, LayoutLink,
    LayoutTypeProvider, LayoutFunction,
    calculateLayout, applyLayout, uniformGrid, translateToPositiveQuadrant,
} from './diagram/layout';
export { DefaultLayouts, defineLayoutWorker } from './diagram/layoutDefault';
export {
    LinkPath, LinkPathProps,
    LinkLabel, LinkLabelProps,
    LinkVertices, LinkVerticesProps,
} from './diagram/linkLayer';
export { DefaultLinkRouter, DefaultLinkRouterOptions } from './diagram/linkRouter';
export { type DiagramModel, DiagramModelEvents, GraphStructure } from './diagram/model';
export {
    type PaperTransform, paneTopLeft, totalPaneSize,
    HtmlPaperLayer, type HtmlPaperLayerProps,
    SvgPaperLayer, type SvgPaperLayerProps,
} from './diagram/paper';
export { CanvasPlaceAt, type CanvasPlaceAtLayer } from './diagram/placeLayer';
export { RenderingState, RenderingStateEvents, RenderingLayer } from './diagram/renderingState';
export {
    type SharedCanvasState, SharedCanvasStateEvents, CellHighlighter,
    FindCanvasEvent, RenameLinkToLinkStateProvider,
} from './diagram/sharedCanvasState';
export { Spinner, SpinnerProps, HtmlSpinner } from './diagram/spinner';

export {
    AuthoringState, AuthoringEvent,
    AuthoredEntity, AuthoredEntityAdd, AuthoredEntityChange, AuthoredEntityDelete,
    AuthoredRelation, AuthoredRelationAdd, AuthoredRelationChange, AuthoredRelationDelete,
    TemporaryState,
} from './editor/authoringState';
export { BuiltinDialogType } from './editor/builtinDialogType';
export * from './editor/dataDiagramModel';
export {
    EntityElement, EntityElementEvents, EntityElementProps,
    EntityGroup, EntityGroupEvents, EntityGroupProps, EntityGroupItem,
    SerializedEntityElement, SerializedEntityGroup, SerializedEntityGroupItem,
    RelationLink, RelationLinkEvents, RelationLinkProps,
    RelationGroup, RelationGroupEvents, RelationGroupProps, RelationGroupItem,
    SerializedRelationLink, SerializedRelationGroup, SerializedRelationGroupItem,
    ElementType, ElementTypeEvents,
    LinkType, LinkTypeEvents,
    PropertyType, PropertyTypeEvents,
    changeEntityData, setEntityElementData, setEntityGroupItems, iterateEntitiesOf,
    changeRelationData, setRelationGroupItems, setRelationLinkData, iterateRelationsOf,
} from './editor/dataElements';
export {
    ChangeOperationsEvent, FetchOperation, FetchOperationFail,
    FetchOperationTargetType, FetchOperationTypeToTarget,
    FetchOperationElement, FetchOperationLink, FetchOperationElementType,
    FetchOperationLinkType, FetchOperationPropertyType,
} from './editor/dataFetcher';
export {
    type DataLocaleProvider, DefaultDataLocaleProvider, DefaultDataLocaleProviderOptions,
} from './editor/dataLocaleProvider';
export { EditorEvents, EditorController } from './editor/editorController';
export {
    subscribeElementTypes, subscribeLinkTypes, subscribePropertyTypes,
} from './editor/observedElement';
export {
    OverlayController, OverlayControllerEvents, OverlayTask,
} from './editor/overlayController';
export { ValidationState, ElementValidation, LinkValidation } from './editor/validation';
export { WithFetchStatus, WithFetchStatusProps } from './editor/withFetchStatus';

export type {
    FormInputSingleProps, FormInputMultiProps, FormInputMultiUpdater,
    FormInputOrDefaultResolver,
} from './forms/input/inputCommon';
export { FormInputList, type FormInputListProps } from './forms/input/formInputList';
export { FormInputText, type FormInputTextProps } from './forms/input/formInputText';

export {
    SerializedDiagram, SerializedLayout, SerializedLinkOptions,
    SerializedElement, SerializableElementCell, ElementFromJsonOptions,
    SerializedLink, SerializableLinkCell, LinkFromJsonOptions,
} from './editor/serializedDiagram';

export { ClassicTemplate, ClassicEntity, ClassicEntityProps } from './templates/classicTemplate';
export {
    DefaultLinkTemplate, DefaultLink, DefaultLinkProps,
} from './templates/defaultLinkTemplate';
export { GroupPaginator, GroupPaginatorProps } from './templates/groupPaginator';
export { RoundTemplate, RoundEntity, RoundEntityProps } from './templates/roundTemplate';
export {
    StandardTemplate, StandardEntity, StandardEntityProps,
    StandardEntityGroup, StandardEntityGroupProps,
} from './templates/standardTemplate';

export { DraggableHandle, DraggableHandleProps } from './widgets/utility/draggableHandle';
export {
    DropdownMenu, DropdownMenuProps, DropdownMenuItem, DropdownMenuItemProps,
} from './widgets/utility/dropdown';
export {
    ListElementView, ListElementViewProps, highlightSubstring, startDragElements,
} from './widgets/utility/listElementView';
export { ProgressBar, ProgressBarProps, ProgressState } from './widgets/utility/progressBar';
export {
    SearchInputStore, SearchInputStoreEvents, SearchInputStoreChangeValueEvent,
    UseSearchInputStoreOptions, useSearchInputStore,
} from './widgets/utility/searchInput';
export { SearchResults, SearchResultsProps } from './widgets/utility/searchResults';
export {
    ViewportDock, ViewportDockProps, DockDirection,
} from './widgets/utility/viewportDock';
export { ClassTree, ClassTreeProps } from './widgets/classTree';
export { Canvas, CanvasProps, TypedElementResolver } from './widgets/canvas';
export {
    ConnectionsMenu, ConnectionsMenuProps, ConnectionsMenuCommands,
    PropertySuggestionHandler, PropertySuggestionParams, PropertyScore,
} from './widgets/connectionsMenu';
export type { DialogStyleProps } from './widgets/dialog';
export { DropOnCanvas, DropOnCanvasProps } from './widgets/dropOnCanvas';
export { Halo, HaloProps } from './widgets/halo';
export { HaloLink, HaloLinkProps } from './widgets/haloLink';
export {
    InstancesSearch, InstancesSearchProps, InstancesSearchCommands,
} from './widgets/instancesSearch';
export {
    type LinkActionContext, useLinkActionContext,
    LinkAction, LinkActionProps, LinkActionStyleProps,
    LinkActionSpinner, LinkActionSpinnerProps,
    LinkActionEdit, LinkActionEditProps,
    LinkActionDelete, LinkActionDeleteProps,
    LinkActionMoveEndpoint, LinkActionMoveEndpointProps,
    LinkActionRename, LinkActionRenameProps,
} from './widgets/linkAction';
export { LinkTypesToolbox, LinkTypesToolboxProps } from './widgets/linksToolbox';
export { Navigator, NavigatorProps } from './widgets/navigator';
export { Selection, SelectionProps } from './widgets/selection';
export {
    SelectionAction, SelectionActionProps, SelectionActionStyleProps,
    SelectionActionSpinner, SelectionActionSpinnerProps,
    SelectionActionRemove, SelectionActionRemoveProps,
    SelectionActionZoomToFit, SelectionActionZoomToFitProps,
    SelectionActionLayout, SelectionActionLayoutProps,
    SelectionActionExpand, SelectionActionExpandProps,
    SelectionActionAnchor, SelectionActionAnchorProps,
    SelectionActionConnections, SelectionActionConnectionsProps,
    SelectionActionAddToFilter, SelectionActionAddToFilterProps,
    SelectionActionGroup, SelectionActionGroupProps,
    SelectionActionEstablishLink, SelectionActionEstablishLinkProps,
} from './widgets/selectionAction';
export { Toolbar, ToolbarProps } from './widgets/toolbar';
export {
    ToolbarAction, ToolbarActionProps, ToolbarActionStyleProps,
    ToolbarActionOpen, ToolbarActionOpenProps,
    ToolbarActionSave, ToolbarActionSaveProps,
    ToolbarActionClearAll, ToolbarActionClearAllProps,
    ToolbarActionExport, ToolbarActionExportProps,
    ToolbarActionUndo, ToolbarActionUndoProps,
    ToolbarActionRedo, ToolbarActionRedoProps,
    ToolbarActionLayout, ToolbarActionLayoutProps,
    ToolbarLanguageSelector, ToolbarLanguageSelectorProps, WorkspaceLanguage,
} from './widgets/toolbarAction';
export {
    UnifiedSearch, UnifiedSearchProps, UnifiedSearchCommands, UnifiedSearchSection,
    UnifiedSearchSectionProvidedContext, useUnifiedSearchSection,
    SearchSectionElementTypes,
    SearchSectionEntities,
    SearchSectionLinkTypes,
} from './widgets/unifiedSearch';
export {
    VisualAuthoring, VisualAuthoringProps, VisualAuthoringCommands,
    AuthoredEntityContext, useAuthoredEntity,
    PropertyEditor, PropertyEditorOptions,
    DragEditOperation, DragEditConnect, DragEditMoveEndpoint,
} from './widgets/visualAuthoring';
export { ZoomControl, ZoomControlProps } from './widgets/zoomControl';

export {
    ClassicWorkspace, ClassicWorkspaceProps,
    ClassicToolbar, ClassicToolbarProps,
} from './workspace/classicWorkspace';
export { DefaultWorkspace, DefaultWorkspaceProps } from './workspace/defaultWorkspace';
export {
    Workspace, WorkspaceProps, LoadedWorkspace, LoadedWorkspaceParams, useLoadedWorkspace,
} from './workspace/workspace';
export {
    WorkspaceContext, WorkspaceEventKey, WorkspacePerformLayoutParams,
    WorkspaceGroupParams, WorkspaceUngroupAllParams, WorkspaceUngroupSomeParams,
    ProcessedTypeStyle, useWorkspace,
} from './workspace/workspaceContext';
export {
    CommandBusTopic,
    ConnectionsMenuTopic, InstancesSearchTopic, UnifiedSearchTopic, VisualAuthoringTopic,
} from './workspace/commandBusTopic';
export * from './workspace/workspaceLayout';
export { WorkspaceRoot, WorkspaceRootProps } from './workspace/workspaceRoot';
