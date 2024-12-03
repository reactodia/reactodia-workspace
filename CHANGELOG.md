# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) 
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Latest]
### Added
- Introduce new search-centric default workspace layout with `UnifiedSearch`:
  * Add `UnifiedSearch` component to unify graph text lookup under a single entry point, with built-in adapters: `SearchSectionElementTypes` for `ClassTree`, `SearchSectionEntities` for `InstancesSearch`, `SearchSectionLinkTypes` for `LinksToolbox`;
  * **[Breaking]** Change `DefaultWorkspace` to use unified search, move non-menu toolbar items to the secondary toolbar and `ZoomControl` to the left side of the viewport;
  * Export previous workspace layout under `ClassicWorkspace` and `ClassicToolbar` components;
- Display "no results" in various cases in `ClassTree`, `InstancesSearch` and `LinksToolbox` components.
- Add ability to dock viewport canvas widgets to any side/corner without style overrides:
  * **[Breaking]** Add `dock` (required), `dockOffsetX`, `dockOffsetY` props to `Navigator`, `Toolbar` and `ZoomControl` widgets.
- Allow to track canvas viewport bounds on the page with `CanvasMetrics.getViewportPageRect()` and `CanvasEvents.resize`.
- **[Experimental]** Update metadata and validation provider contracts:
  * Rename providers to `MetadataProvider` and `ValidationProvider` for consistency;
  * Re-organize `MetadataProvider` contract to reduce slightly different variations to get similar metadata;
  * Support severity in validation result items (previously known as errors);
  * Ignore metadata and validation provider changes after mount;
  * Add separate method to toggle authoring mode: `EditorController.setAuthoringMode()`.
  * Update `AuthoringState` and `TemporaryState`: use separate event types for added, changed and removed events;
- **[Experimental]** Add `VisualAuthoring` canvas widget to configure and provide implementation for visual graph authoring:
  * Require `VisualAuthoring` widget in be in the canvas for visual graph authoring;
  * Move authoring-related methods from `OverlayController` to `EditorController.authoringCommands`.
- Allow to switch canvas pointer mode with `ZoomControl`:
  * Disabled by default, can be enabled via `showPointerModeToggle` option.
- Support overlay dialogs without target which displayed as blocking modal:
  * Expose `dialogType` option in `OverlayController.showDialog()` and `BuiltinDialogType` for built-in dialog types;
  * Add option to show dialog without a close button with `closable: false`.

### Changed
- Auto-collapse `Navigator` when there is not enough space in the canvas viewport.
- Change `LinkTypesToolbox` to only use links on the diagram instead of requesting connected links from a data provider.
- Display inline entity badges with its type style in `InstancesSearch` and `LinksToolbox`.
- Change cursor to "grabbed" style when panning the canvas.
- Improve default look for the overlay dialogs with a dedicated header with caption and close button:
  * Allow to disable dialog resize in one or both axes via `DialogStyleProps.resizableBy` prop;
  * Improve `ConnectionsMenu` and `FindOrCreateEntity` style and UX.
- Improve styles for `ToolbarLanguageSelector`: remove extra background and border.
- Separate `frame` debounce mode in `Debouncer`, allow to change timeout after creation.

### Fixed
- Links caching in `IndexedDbCachedProvider.links()` not working due to native `crypto.subtle` being available only in secure contexts (e.g. HTTPS).
- `OverlayController.startTask()` spinner not positioned at the center of the canvas horizontally.
- `ClassTree` becoming stuck at loading instead of displaying a error when initialization fails.
- `SparqlDataProvider` compatibility with Virtuoso:
  * Remove `?extractedLabel` from default text lookup pattern in `OwlRdfsSettings`;
  * Fix keeping un-parametrized variable for `filterOnlyLanguages` if the corresponding setting is not set.
- Avoid flicking selection when making a click on an already selected element when `Selection` widget is used.
- Ignored `disabled` option for `LinkAction`.
- Keep the size for properties stable in `StandardTemplate` to even when property labels are loaded.
- React warning for update after unmount in `EditLayer` > `LinkLayer`.

## [0.26.1] - 2024-11-26
### Fixed
- Bringing elements to front on selection (regression introduced at [0.25.0]).
- Avoid accidental text selection on click with Shift pressed when multiple elements are selected with `Selection` widget.
- Missing count badges in `ClassTree` which reappeared on requesting element type data (regression introduced at [0.25.0]).
- Element grouping incorrectly group links between different element pairs together due to `DiagramModel.findLink()` returning non-matching links.

## [0.26.0] - 2024-11-17
### Added
- Support incremental links loading from `DataProvider`:
  * **[Breaking]** Change `DataProvider.links()` contract to return links between two sets of elements to allow partial link requests;
  * Extend `SparqlDataProviderSettings.linksInfoQuery` to support partial link queries (with backwards compatibility fallback);
- Split `SparqlDataProvider` requests into chunks of configurable size (`chunkSize`):
  * Splitting `SparqlDataProvider.links()` requests requires to migrate to the new `linksInfoQuery` contract, see above;
- Links caching via perfect mirroring for `IndexedDdCachedProvider.links()`:
  * Enabled by default, can be disabled by setting `IndexedDdCachedProviderOptions.cacheLinks` to `false`;
- Cache missing results for applicable methods in `IndexedDbCachedProvider`:
  * Enabled by default, can be disabled by setting `IndexedDdCachedProviderOptions.cacheMissing` to `false`;
- JSDoc for almost all exported components, services, interfaces and functions.

### Changed
- **[Breaking]** Change `placeElementsAround()` function into `placeElementsAroundTarget()` command;
- **[Breaking]** Replace `LinkTemplateProps.typeIndex` with `markerSource` and `markerTarget` properties;
- **[Breaking]** Replace `EditableLabel` on the link template by a separate `RenameLinkProvider`;
- **[Breaking]** Replace `GenerateID.{forElement, forLink}` with static methods `Element.generateId()` and `Link.generateId()`;
- Increased IndexedDB database version in `IndexedDbCachedProvider`: previous caches will be discarded on upgrade when using the new version.

### Fixed
- Grouped entity width overflow when a label is too long in the `StandardTemplate`.
- Cached results from `IndexedDbCachedProvider.connectedLinkStats()` ignored `inexactCount` parameter.

### Removed
- Remove unused `LinkRedrawLevel` type with corresponding parameters;
- Deprecate `SemanticTypeStyles` and `OntologyLinkTemplates`;
- Deprecate `WorkspaceProps.onIriClick` handler and related `SharedCanvasState.onIriClick()` method;
- Deprecate `DataDiagramModel.requestLinksOfType()` which is replaced by `requestLinks()` method;

## [0.25.1] - 2024-08-31
### Fixed
- Fix missing default value for `zoomToFit` option in `WorkspaceContext.performLayout()`.

## [0.25.0] - 2024-08-31
### Added
- Add ability to group elements and links:
  * Add `EntityGroup` element type and `RelationGroup` link type and corresponding commands;
  * Add `DataDiagramModel.{group, ungroupAll, ungroupSome}` and `WorkspaceContext.{group, ungroupAll, ungroupSome}` methods to group and ungroup entities;
  * Auto-group relations when creating them using `DataDiagramModel.createLinks()` with ability to manually regroup via `DataDiagramModel.regroupLinks()`;
  * Add `SelectionActionGroup` to group/ungroup from `Halo` and `Selection`, update default actions and its dock placement;
  * Include `sourceIri` and `targetIri` when serializing `RelationLink` (required to restore entity groups).
- Support adding elements as group from `ConnectionMenu` and `InstancesSearch`.
- Add `OverlayController.startTask()` method to start foreground canvas tasks:
  * Display overlay task while computing graph layout via `WorkspaceContext.performLayout()`.
- Allow to choose element template based on element itself in addition to its types in `CanvasProps.elementTemplateResolver`.
- Allow to fetch labels and property values only in specified languages in `SparqlDataProviderSettings` via `filterOnlyLanguages` setting.
- Allow to skip "zoom to fit" in `WorkspaceContext.performLayout()` by passing `zoomToFit: false`.
- Export `EmptyDataProvider` which implements `DataProvider` interface with no data.

### Changed
- **[Breaking]** Prepare to decouple basic diagram renderer from entity and relation graph:
  * Use separate `EntityElement` and `RelationLink` types for elements and links with data;
  * Rename `AsyncModel` -> `DataDiagramModel`;
  * Move methods related to element / link / property types from `DiagramModel` to `DataDiagramModel`, including locale formatting;
  * Move link type visibility state from `LinkType` to `DiagramModel` itself;
  * Change `TemplateProps` to have `element: Element` instead of `data: ElementModel` inside;
  * Inject additional type information to layout computation via `LayoutTypeProvider`;
  * Change `InstancesSearch` criteria to use primitive values instead of element and type references.
- **[Breaking]** Change `ElementType`, `LinkType` and `PropertyType` to store original data inside instead of unpacking it into label and other properties.
- **[Breaking]** Move `EditorController.{selection, setSelection, bringElements}` to `DiagramModel`.
- **[Breaking]** Rename `EditorController` methods to reflect new terminology (element and link -> entity and relation).
- **[Breaking]** Rename commands to globally change entity graph: `setElementData()` -> `changeEntityData()` and `setLinkData()` -> `changeRelationData()`.
- **[Breaking]** Replace implicit element type and property subscriptions by explicit hook calls:
  * Extract `useSyncStore()` overload with equality comparator into separate function `useSyncStoreWithComparator()` for performance reasons;
  * Add `KeyedSyncStore` type and `useKeyedSyncStore()` hook mirroring built-in `SyncStore` / `useExternalSyncStore()` React hook but for multiple subscriptions via keys at the same time;
  * Add `subscribeElementTypes`, `subscribePropertyTypes` and `subscribeLinkTypes` keyed event stores;
- Replace `Element.temporary` property with separate `VoidElement` type;
- Replace `Link.layoutOnly` property by `TemplateProperties.LayoutOnly` link state property;
- Change search results component in `ConnectionMenu` and `InstancesSearch` to select multiple items without holding Control/Meta;

### Fixed
- Fix `RenderingState.syncUpdate()` not updating element sizes when called from React-managed handlers due to batching;
- Store failed operation errors to display even when `WithFetchStatus` is re-mounted:
  * Add `DataDiagramModel.getOperationFailReason()` to check if latest fetch operation failed;
- Fix `WikidataSettings` for `SparqlDataProvider` to resolve property type labels;

### Removed
- Remove legacy grouping functionality: `WorkspaceProps.groupBy` option, `EmbeddedLayer` and `GroupTemplate` components, `Element.group` property and relevant events.
- **[Breaking]** Remove `DataDiagramModel.createLink()` method: either `addLink()` or `createLinks()` should be used instead;

## [0.24.0] - 2024-03-27
### Added
- Track and display fetching state for the graph data:
  * Expose `AsyncModel.operations` property and `AsyncModel.changeOperations` event to track active fetch operation;
  * Add `WithFetchStatus` component to decorate other component with fetch status on element or element/link/property type;
  * Update default templates to use `WithFetchStatus`;
- Support React component lifecycle for Link templates:
  * **[Breaking]** `LinkTemplate.render()` drastically changed to act as "render function" which returns React elements;
  * **[Breaking]** Changed `LinkTemplate.setLinkLabel()` into `EditableLinkLabel` object on the link template;
  * Expose `LinkPath`, `LinkLabel` and `LinkVertices` components as building blocks for custom link templates;
  * Extract existing link rendering into `DefaultLinkTemplate` and `DefaultLinkPathTemplate`;
- Support computing graph layout using web workers:
  * Make default diagram layout algorithm configurable via `defaultLayout` prop on `Workspace`;
  * Rename `layoutForcePadded` default layout function to `blockingDefaultLayout`;
  * Make `layoutFunction` and `canvas` parameters of WorkspaceContext.performLayout() optional;
  * Add `defineWorker()` and `useWorker()` to register and use shared ref-counted workers;
  * Export `worker-protocol` sub-module to ease creation of transparent worker proxies;
  * Export `layout.worker` sub-module (and `defineLayoutWorker()` helper) with default layout algorithms to be imported as a worker script;
  * **[Breaking]** Change `LayoutFunction` to be a pure function from `LayoutGraph` and `LayoutState` into `LayoutState`;
  * **[Breaking]** Change `layoutPaddedWith()` / `layoutBiasFreePaddedWith()` to allow async usage as `layoutPadded()` / `layoutPaddedBiasFree()`;
- Add `useWorkspace()` and `useCanvas()` hooks to access workspace and canvas context with proper error handling:
  * Getting these context objects directly via `useContext(WorkspaceContext)` and `useContext(CanvasContext)` is deprecated and will be subject to removal in the future release;
- Support `accept` attribute for HTML file input in `ToolbarActionOpen`.

### Changed
- **[Breaking]** Make random-delay data provider decorator configurable and expose its factory under new name `makeDelayProviderDecorator()`.
- **[Breaking]** Rename some functions and properties for consistency and documentation:
  * `WorkspaceContext.overlayController` -> `overlay`;
  * `sameLink()` -> `equalLinks()`;
  * `ElementType` -> `ElementTypeModel` and `RichElementType` -> `ElementType`;
  * `LinkType` -> `LinkTypeModel` and `RichLinkType` -> `LinkType`;
  * `PropertyType` -> `PropertyTypeModel` and `RichProperty` -> `PropertyType`;
  * `DiagramModelEvents.classEvent` -> `elementTypeEvent`;
  * `DiagramModel.{getProperty, createProperty}` -> `{getPropertyType, createPropertyType}`;
  * `LinkTypeOptions` -> `SerializedLinkOptions`;
  * `{LayoutData, LayoutElement, LayoutLink}` -> `{SerializedLayout, SerializedLayoutElement, SerializedLayoutLink}`;
  * `makeLayoutData()` -> `makeSerializedLayout()`;

### Fixed
- Support React 18 `<StrictMode>` workspace loading:
  * Add `DiagramModel.discardLayout()` to be used for correct `useEffect()` cleanup;
  * Add `useLoadedWorkspace()` hook for easier and correct by default asynchronous workspace loading;
- Fix reloading/re-fetching class tree when importing a diagram with same data provider.
- Fix elements lagging behind when moving `Selection` box.
- Fix `SelectionActionEstablishLink` being displayed when authoring mode is not active.
- Fix missing inheritable CSS defaults for links in the exported diagrams.
- Fix shrinking buttons for link types in `ConnectionsMenu`.
- Clear `InstancesSearch` results when loading a diagram.

## [0.23.0] - 2023-12-11
### Added
- Support customizable `Toolbar` widget with its actions decomposed into separate components:
  * Generic component for toolbar actions: `ToolbarAction`;
  * Default menu items: `ToolbarActionClearAll`, `ToolbarActionExport` (for PNG, SVG and print);
  * Default panel items: `ToolbarActionUndo`, `ToolbarActionRedo`, `ToolbarActionLayout`, `ToolbarLanguageSelector`;
  * Additional specialized actions: `ToolbarActionOpen`, `ToolbarActionSave`;
- Added `Selection` canvas widget with rectangular element selection to the default workspace;
- Made `Halo` and `Selection` widgets customizable via action components:
  * Generic component for element actions: `SelectionAction`;
  * Specialized actions: `SelectionActionRemove`, `SelectionActionZoomToFit`, `SelectionActionLayout`, `SelectionActionExpand`, `SelectionActionConnections`, `SelectionActionAddToFilter`, `SelectionActionAnchor`, `SelectionActionEstablishLink`;
- Support multi-navigation using `SelectionActionConnections` when multiple elements are selected.
- Made `HaloLink` widget customizable via action components:
  * Generic component for link actions: `LinkAction`;
  * Specialized actions: `LinkActionEdit`, `LinkActionDelete`, `LinkActionMoveEndpoint`, `LinkActionRename`;
- Add selected link highlight to `HaloLink`:
  * Label highlight -- displayed by default as underline;
  * Path highlight -- unstyled by default, can be changed via CSS;
- Support customizable stroke and fill styles in `Navigator` and improve default colors.
- Exposed SVG and raster image export options in corresponding `CanvasApi` methods.
- Support for graceful close and clearing the cache in `IndexedDbCachedProvider`. 
- Added utility hooks for debounced event subscription: `useEventStore()`, `useFrameDebouncedStore()`, `useSyncStore()`.
- Add `inexactCount` parameter to `DataProvider.connectedLinkStats()` to allow to avoid computing full connected link type statistics where only existence of a link type is enough.

### Changed
- **[Breaking]** Split `DiagramView` type:
  * Removed public `model` property to get `DiagramModel` (accessible via both canvas or workspace context);
  * Moved `language` property with setter and corresponding event into `DiagramModel`;
  * Moved locale formatting methods under `DiagramModel.locale.*`;
  * Moved `getTypeStyle()` into `WorkspaceContext` as `getElementTypeStyle()`;
  * Renamed `DiagramView` -> `SharedCanvasState` and move under `RenderingState.shared`;
- **[Breaking]** Renamed `DefaultToolbar` -> `Toolbar` component.
- **[Breaking]** Renamed `CanvasApi.exportPng()` -> `CanvasApi.exportRaster()`.
- **[Breaking]** Renamed `OverlayController.showEditLinkLabelForm()` -> `OverlayController.showRenameLinkForm()`.
- **[Breaking]** Replaced `visible` / `showLabel` properties on `RichLinkType` by `visibility` property of string enum type.
- Optimized link route updates via batching.
- Added custom "zoom-to-fit" icon instead of reusing a different one from Codicons.
- Improved accessibility attribute placement (including `role`, `aria-*`, `title`, `name`, etc).

### Fixed
- **[Breaking]** Use synthetic type and label predicates in element query of `SparqlDataProvider`:
  * Use `urn:reactodia:sparql:{type, label}` instead of `rdf:type` and `rdfs:label` as marker predicates in `SparqlDataProviderSettings.elementInfoQuery` to distinguish them from properties with same predicates;
- When establishing new link and selecting an existing entity to put on canvas and connect, it should not mark the entity as "new".
- Re-route links on link type visibility change.
- Perform zoom-to-fit after loading an existing diagram instead of just centering the content.
- Fixed unintended element move when interacting with nested element scrollbar.
- Reset history after creating a new diagram or importing existing layout.
- Fix text lookup query to use public full-text search service for `WikidataSettings`.

### Removed
- Removed deprecated `Dictionary` type (`Record<string, T>` can be used instead).
- Removed untyped `key` parameter from event listeners.
- Made private `EditorController.model` property (accessible via workspace context).

## [0.22.0] - 2023-11-24
### Added
- Support resources represented by blank nodes in `RdfDataProvider` when `acceptBlankNodes` is enabled.
- Support native scroll and pan in `PaperArea` (e.g. using mouse wheel or touchpad scrolling).
- Support touch input: native pan scroll and custom pinch zoom:
  * Add new coordinate conversions to `CanvasMetrics`: `paperToPageCoords()` and `scrollablePaneToClientCoords()`;
  * Add `Vector.{add, subtract, scale}` functions;
- Create dropdown menu to improve toolbar UI, make it more compact.

### Changed
- **[Breaking]** Introduce `GraphStructure` as a read-only view for the `DiagramModel`:
  * Use `GraphStructure` in `LinkRouter`, `LinkStyle` and `ValidationApi`;
- **[Breaking]** Use consistent naming for diagram model data accessors:
  * Rename method `getLinkById()` -> `getLink()`;
  * Rename methods `getClass()` / `createClass()` -> `getElementType()` / `createElementType()`;
  * Remove unnecessary methods `linksOfType()`, `isSourceAndTargetVisible()`;
  * Rename classes `FatClassModel` / `FatLinkType` -> `RichElementType` / `RichLinkType`;
- Optimize `ElementLayer` and `LinkLayer` rendering, reducing unnecessary React updates and DOM reflows:
  * **[Breaking]** Make `LinkStyle.renderLink()` explicitly depend only on link data and state for future optimizations;

### Fixed
- Ignored lookup direction `linkDirection` in `RdfDataProvider.lookup()`.
- Prevent creating loaded links from cluttering the command history.
- Prevent canvas scroll jumping on undo action after layout:
  * Add `restoreViewport()` command to undo/redo viewport state in similar cases;
- Fix diagram export/print to correctly embed CSS for pseudo-elements and SVG images.
- Display only property values in currently selected language if possible via `DiagramView.formatPropertyList()`.

## [0.21.0] - 2023-11-21
### Changed
- **[Breaking]** Expose `Element.links` only through `DiagramModel.getElementLinks()`.
- **[Breaking]** Make `DiagramModel.addLink()` consistent with `addElement()`:
  * `addLink` and `removeLink` use command history;
  * `addLink` will error on trying to add existing link, use `createLink()` for the previous behavior;

### Fixed
- Element does not redraw on its removal in some cases.
- Avoid error when trying to change element type when dragging out of another in the authoring mode.
- Link is never lost when dragging its source or target connector in the authoring mode.

## [0.20.0] - 2023-11-16
### Added
- Forked library as OSS project, see [previous CHANGELOG](https://github.com/metaphacts/ontodia/blob/master/CHANGELOG.md) if needed.
- Implemented in-memory `CommandHistory` interface by default.
- Support fully customizable workspace structure with the following elements:
  * `Workspace` - only defines shared context for other components;
  * `WorkspaceRoot`, `WorkspaceLayoutRow`, `WorkspaceLayoutColumn`, `WorkspaceLayoutItem` - organizes components into resizable/collapsible sections;
  * `Canvas` -- displays the diagram and canvas widgets;
  * Canvas widgets: `DefaultToolbar`, `ConnectionsMenu`, `DropOnCanvas`, `Halo`, `HaloLink`, `Navigator`, `ZoomControl`;
  * Other components: `ClassTree`, `InstancesSearch`, `LinkToolbox`;

### Changed
- Many changes to code structure and small changes to the naming.
- CSS classes prefix changed to `reactodia-`.
- Enabled full `strict` TypeScript compiler mode with null checks.
- Migrated from legacy React Context to the modern one (`React.createContext()`).
- Use RDF/JS-compatible IRI and literal terms.
- Reimplemented `RdfDataProvider` based on RDF/JS-compatible in-memory RDF store.
- Moved element property formatting from `ElementLayer` into element templates themselves.
- Changed link type visibility settings to affect only link rendering without removing them from the graph.
- Bundle subset of [Codicons](https://github.com/microsoft/vscode-codicons) for icons,
  removed dependency on the included Font Awesome on the host page.
- Moved default type style and link customizations into opt-in `SemanticTypeStyles` and `OntologyLinkTemplates`.

### Fixed
- Properly batch commands to history when placing elements from the Connections dialog.

### Removed
- Removed blank nodes discovery support from `SparqlDataProvider` (might be reimplemented in the future).

[Latest]: https://github.com/reactodia/reactodia-workspace/compare/v0.26.1...HEAD
[0.26.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.26.0...v0.26.1
[0.26.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.25.1...v0.26.0
[0.25.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.25.0...v0.25.1
[0.25.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.12.2...v0.20.0
