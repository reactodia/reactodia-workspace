import '../styles/main.scss';

export { AbortScope, mapAbortedToNull, delay } from './coreUtils/async';
export { moveComparator, shallowArrayEqual } from './coreUtils/collections';
export { useColorScheme } from './coreUtils/colorScheme';
export {
    type Listener, type AnyListener, type AnyEvent, type PropertyChange,
    type Events, type EventTrigger, EventObserver, EventSource,
} from './coreUtils/events';
export {
    type SyncStore, useEventStore, useFrameDebouncedStore, useObservedProperty,
    useSyncStore, useSyncStoreWithComparator,
} from './coreUtils/hooks';
export type { HotkeyString } from './coreUtils/hotkey';
export {
    type LabelLanguageSelector, type TranslatedProperty, TranslatedText, type Translation,
    useTranslation,
} from './coreUtils/i18n';
export { KeyedObserver, type KeyedSyncStore, useKeyedSyncStore } from './coreUtils/keyedObserver';
export { useWorker } from './coreUtils/workers';
export { Debouncer, animateInterval } from './coreUtils/scheduler';

export * from './data/dataProvider';
export * from './data/model';
export {
    type MetadataProvider, type MetadataCreatedEntity, type MetadataCreatedRelation,
    type MetadataCanConnect, type MetadataCanModifyEntity, type MetadataCanModifyRelation,
    type MetadataEntityShape, type MetadataRelationShape, type MetadataPropertyShape,
    BaseMetadataProvider,
} from './data/metadataProvider';
export {
    type ValidationProvider,type  ValidationEvent, type ValidationResult, type ValidatedElement,
    type ValidatedLink, type ValidationSeverity,
} from './data/validationProvider';
export {
    DiagramContextV1, PlaceholderDataProperty, PlaceholderEntityType, PlaceholderRelationType,
    TemplateProperties, TemplateState, type TemplateProperty, type PinnedProperties,
    type AnnotationContent, type AnnotationTextStyle, type ColorVariant,
} from './data/schema';
export * from './data/composite/composite';
export {
    DecoratedDataProvider, type DecoratedDataProviderOptions, type DecoratedMethodName,
    delayProviderDecorator,
} from './data/decorated/decoratedDataProvider';
export { EmptyDataProvider } from './data/decorated/emptyDataProvider';
export {
    IndexedDbCachedProvider, type IndexedDbCachedProviderOptions,
} from './data/indexedDb/indexedDbCachedProvider';
export { type MemoryDataset, IndexQuadBy, indexedDataset } from './data/rdf/memoryDataset';
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
    Element, type ElementEvents, type ElementProps,
    Link, type LinkEvents, type LinkProps,
    type Cell, LinkVertex, VoidElement, type LinkTypeVisibility,
} from './diagram/elements';
export { ElementDecoration } from './diagram/elementLayer';
export {
    Rect, type ShapeGeometry, type Size, type SizeProvider, Vector,
    boundsOf, calculateAveragePosition,
    computePolyline, computePolylineLength, findElementAtPoint, findNearestSegmentIndex,
    getContentFittingBox, getPointAlongPolyline, isPolylineEqual, pathFromPolyline,
} from './diagram/geometry';
export { type CellsChangedEvent } from './diagram/graph';
export * from './diagram/history';
export {
    type CalculatedLayout, type LayoutGraph, type LayoutState, type LayoutNode, type LayoutLink,
    type LayoutTypeProvider, type LayoutFunction,
    calculateLayout, applyLayout, uniformGrid, translateToPositiveQuadrant,
} from './diagram/layout';
export { type DefaultLayouts, defineLayoutWorker } from './diagram/layoutDefault';
export {
    LinkPath, type LinkPathProps,
    LinkLabel, type LinkLabelProps,
    LinkVertices, type LinkVerticesProps,
} from './diagram/linkLayer';
export { DefaultLinkRouter, type DefaultLinkRouterOptions } from './diagram/linkRouter';
export { type DiagramModel, type DiagramModelEvents, type GraphStructure } from './diagram/model';
export {
    type PaperTransform, paneTopLeft, totalPaneSize,
    HtmlPaperLayer, type HtmlPaperLayerProps,
    SvgPaperLayer, type SvgPaperLayerProps,
} from './diagram/paper';
export { CanvasPlaceAt, type CanvasPlaceAtLayer } from './diagram/placeLayer';
export { type RenderingState, type RenderingStateEvents, RenderingLayer } from './diagram/renderingState';
export {
    type SharedCanvasState, type SharedCanvasStateEvents, type CellHighlighter,
    type FindCanvasEvent, RenameLinkToLinkStateProvider,
} from './diagram/sharedCanvasState';
export { Spinner, type SpinnerProps, HtmlSpinner } from './diagram/spinner';

export {
    AnnotationElement, AnnotationLink,
    type SerializedAnnotationElement, type SerializedAnnotationLink,
} from './editor/annotationCells';
export {
    AuthoringState, type AuthoringEvent, type AuthoredEntity, type AuthoredRelation,
    type AuthoredEntityAdd, type AuthoredEntityChange, type AuthoredEntityDelete,
    type AuthoredRelationAdd, type AuthoredRelationChange, type AuthoredRelationDelete,
    TemporaryState,
} from './editor/authoringState';
export { BuiltinDialogType } from './editor/builtinDialogType';
export {
    type DataDiagramModel, type DataDiagramModelEvents, type DataGraphStructure,
    requestElementData, restoreLinksBetweenElements, type RequestLinksOptions,
} from './editor/dataDiagramModel';
export {
    EntityElement, type EntityElementEvents, type EntityElementProps,
    EntityGroup, type EntityGroupEvents, type EntityGroupProps, type EntityGroupItem,
    type SerializedEntityElement, type SerializedEntityGroup, type SerializedEntityGroupItem,
    RelationLink, type RelationLinkEvents, type RelationLinkProps,
    RelationGroup, type RelationGroupEvents, type RelationGroupProps, type RelationGroupItem,
    type SerializedRelationLink, type SerializedRelationGroup, type SerializedRelationGroupItem,
    ElementType, type ElementTypeEvents,
    LinkType, type LinkTypeEvents,
    PropertyType, type PropertyTypeEvents,
    changeEntityData, setEntityElementData, setEntityGroupItems, iterateEntitiesOf,
    changeRelationData, setRelationGroupItems, setRelationLinkData, iterateRelationsOf,
} from './editor/dataElements';
export {
    type ChangeOperationsEvent, type FetchOperation, type FetchOperationFail,
    type FetchOperationTargetType, type FetchOperationTypeToTarget,
    type FetchOperationElement, type FetchOperationLink, type FetchOperationElementType,
    type FetchOperationLinkType, type FetchOperationPropertyType,
} from './editor/dataFetcher';
export {
    type DataLocaleProvider, DefaultDataLocaleProvider, type DefaultDataLocaleProviderOptions,
} from './editor/dataLocaleProvider';
export { type EditorEvents, EditorController } from './editor/editorController';
export {
    subscribeElementTypes, subscribeLinkTypes, subscribePropertyTypes,
} from './editor/observedElement';
export {
    OverlayController, type OverlayControllerEvents, type OverlayTask,
} from './editor/overlayController';
export { ValidationState, type ElementValidation, type LinkValidation } from './editor/validation';
export { WithFetchStatus, type WithFetchStatusProps } from './editor/withFetchStatus';

export type {
    FormInputSingleProps, FormInputMultiProps, FormInputMultiUpdater,
    FormInputOrDefaultResolver,
} from './forms/input/inputCommon';
export { FormInputList, type FormInputListProps } from './forms/input/formInputList';
export { FormInputText, type FormInputTextProps } from './forms/input/formInputText';

export {
    type SerializedDiagram, type SerializedLayout, type SerializedLinkOptions,
    type SerializedElement, type SerializableElementCell, type ElementFromJsonOptions,
    type SerializedLink, type SerializableLinkCell, type LinkFromJsonOptions,
} from './editor/serializedDiagram';

export { BasicLink, type BasicLinkProps, LinkMarkerArrowhead } from './templates/basicLink';
export {
    ClassicTemplate, ClassicEntity, type ClassicEntityProps,
} from './templates/classicTemplate';
export { GroupPaginator, type GroupPaginatorProps } from './templates/groupPaginator';
export {
    NoteTemplate, NoteAnnotation, NoteEntity, NoteLinkTemplate, NoteLink,
} from './templates/noteAnnotation';
export { RoundTemplate, RoundEntity, type RoundEntityProps } from './templates/roundTemplate';
export {
    StandardTemplate, StandardEntity, type StandardEntityProps,
    StandardEntityGroup, type StandardEntityGroupProps,
} from './templates/standardElement';
export {
    StandardLinkTemplate, StandardRelation, type StandardRelationProps,
    DefaultLinkTemplate, DefaultLink, type DefaultLinkProps,
} from './templates/standardLink';

export { DraggableHandle, type DraggableHandleProps } from './widgets/utility/draggableHandle';
export {
    DropdownMenu, type DropdownMenuProps, DropdownMenuItem, type DropdownMenuItemProps,
} from './widgets/utility/dropdown';
export {
    ListElementView, type ListElementViewProps, highlightSubstring, startDragElements,
} from './widgets/utility/listElementView';
export {
    ProgressBar, type ProgressBarProps, type ProgressState,
} from './widgets/utility/progressBar';
export {
    type SearchInputStore, type SearchInputStoreEvents, type SearchInputStoreChangeValueEvent,
    type UseSearchInputStoreOptions, useSearchInputStore,
} from './widgets/utility/searchInput';
export { SearchResults, type SearchResultsProps } from './widgets/utility/searchResults';
export {
    ViewportDock, type ViewportDockProps, type DockDirection,
} from './widgets/utility/viewportDock';
export { ClassTree, type ClassTreeProps } from './widgets/classTree';
export {
    Canvas, type CanvasProps, type TypedElementResolver, type TypedLinkResolver,
} from './widgets/canvas';
export {
    ConnectionsMenu, type ConnectionsMenuProps, type ConnectionsMenuCommands,
    type PropertySuggestionHandler, type PropertySuggestionParams, type PropertyScore,
} from './widgets/connectionsMenu';
export type { DialogStyleProps } from './widgets/dialog';
export {
    DropOnCanvas, type DropOnCanvasProps, type DropOnCanvasItem, type DropItemElement,
    defaultGetDroppedOnCanvasItems,
} from './widgets/dropOnCanvas';
export { Halo, type HaloProps } from './widgets/halo';
export { HaloLink, type HaloLinkProps } from './widgets/haloLink';
export {
    InstancesSearch, type InstancesSearchProps, type InstancesSearchCommands,
} from './widgets/instancesSearch';
export {
    type LinkActionContext, useLinkActionContext,
    LinkAction, type LinkActionProps, type LinkActionStyleProps,
    LinkActionSpinner, type LinkActionSpinnerProps,
    LinkActionEdit, type LinkActionEditProps,
    LinkActionDelete, type LinkActionDeleteProps,
    LinkActionMoveEndpoint, type LinkActionMoveEndpointProps,
    LinkActionRename, type LinkActionRenameProps,
} from './widgets/linkAction';
export { LinkTypesToolbox, type LinkTypesToolboxProps } from './widgets/linksToolbox';
export { Navigator, type NavigatorProps } from './widgets/navigator';
export { Selection, type SelectionProps } from './widgets/selection';
export {
    SelectionAction, type SelectionActionProps, type SelectionActionStyleProps,
    SelectionActionSpinner, type SelectionActionSpinnerProps,
    SelectionActionRemove, type SelectionActionRemoveProps,
    SelectionActionZoomToFit, type SelectionActionZoomToFitProps,
    SelectionActionLayout, type SelectionActionLayoutProps,
    SelectionActionExpand, type SelectionActionExpandProps,
    SelectionActionAnchor, type SelectionActionAnchorProps,
    SelectionActionConnections, type SelectionActionConnectionsProps,
    SelectionActionAddToFilter, type SelectionActionAddToFilterProps,
    SelectionActionGroup, type SelectionActionGroupProps,
    SelectionActionEstablishLink, type SelectionActionEstablishLinkProps,
} from './widgets/selectionAction';
export { Toolbar,type  ToolbarProps } from './widgets/toolbar';
export {
    ToolbarAction, type ToolbarActionProps, type ToolbarActionStyleProps,
    ToolbarActionOpen, type ToolbarActionOpenProps,
    ToolbarActionSave, type ToolbarActionSaveProps,
    ToolbarActionClearAll, type ToolbarActionClearAllProps,
    ToolbarActionExport, type ToolbarActionExportProps,
    ToolbarActionUndo, type ToolbarActionUndoProps,
    ToolbarActionRedo, type ToolbarActionRedoProps,
    ToolbarActionLayout, type ToolbarActionLayoutProps,
    ToolbarLanguageSelector, type ToolbarLanguageSelectorProps, type WorkspaceLanguage,
} from './widgets/toolbarAction';
export {
    UnifiedSearch, type UnifiedSearchProps, type UnifiedSearchCommands, type UnifiedSearchSection,
    type UnifiedSearchSectionProvidedContext, useUnifiedSearchSection,
    SearchSectionElementTypes,
    SearchSectionEntities,
    SearchSectionLinkTypes,
} from './widgets/unifiedSearch';
export {
    VisualAuthoring, type VisualAuthoringProps, type VisualAuthoringCommands,
    type AuthoredEntityContext, useAuthoredEntity,
    type PropertyEditor, type PropertyEditorOptions,
    type DragEditOperation, type DragEditConnect, type DragEditMoveEndpoint,
} from './widgets/visualAuthoring';
export { ZoomControl, type ZoomControlProps } from './widgets/zoomControl';

export {
    ClassicWorkspace, type ClassicWorkspaceProps,
    ClassicToolbar, type ClassicToolbarProps,
} from './workspace/classicWorkspace';
export { DefaultWorkspace, type DefaultWorkspaceProps } from './workspace/defaultWorkspace';
export {
    Workspace, type WorkspaceProps, DefaultRenameLinkProvider,
    type LoadedWorkspace, type LoadedWorkspaceParams, useLoadedWorkspace,
} from './workspace/workspace';
export {
    WorkspaceContext, WorkspaceEventKey, type WorkspacePerformLayoutParams,
    type WorkspaceGroupParams, type WorkspaceUngroupAllParams, type WorkspaceUngroupSomeParams,
    type ProcessedTypeStyle, useWorkspace,
} from './workspace/workspaceContext';
export {
    CommandBusTopic,
    ConnectionsMenuTopic, InstancesSearchTopic, UnifiedSearchTopic, VisualAuthoringTopic,
} from './workspace/commandBusTopic';
export * from './workspace/workspaceLayout';
export { WorkspaceRoot, type WorkspaceRootProps } from './workspace/workspaceRoot';
