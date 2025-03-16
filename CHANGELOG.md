# Changelog
All notable changes to the Reactodia will be documented in this document.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]
#### 🚀 New Features
- Support round (elliptical-shaped) elements:
  * Allow element templates to set `shape: 'ellipse'` to correctly compute link geometry;
  * Change `ElementTemplate` to be an object with additional element template options, allow to return both `ElementTemplate` and `ElementTemplateComponent` from `elementTemplateResolver`;
  * Add built-in basic circle-shaped `RoundTemplate` with its `RoundEntity` template component;
  * Add `RenderingState.getElementShape()` method to compute shape information (including bounds) for the element.
- Support smooth-curved links:
  * Allow link templates to set `spline: 'smooth'` to have rounded joints and overall shape via cubic Bézier curves.

#### 💅 Polish
- Make `Canvas` a [focusable](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus) element to allow to handle keyboard events scoped to the graph:
  * Removing selected elements on `Delete` key press now happens only when `SelectionActionRemove` if displayed by the `Halo` or `Selection` canvas widgets and only if the canvas has the focus to avoid accidental element removal by the action from unrelated document parts.
  * Expose `keydown` and `keyup` events on `CanvasApi.events` to handle keyboard events scoped to the canvas.
  * Canvas is now auto-focused (without scroll) on certain actions such as removing selected elements, grouping or ungrouping entities or dismissing a dialog.
- Export built-in element templates and its components separately for easier customization:
  * Change `StandardTemplate` to a template object, expose its components as `StandardEntity` and `StandardEntityGroup`;
  * Change `ClassicTemplate` to a template object, expose its component as `ClassicEntity`.
- Improve default routing for self (feedback) links with a single user-defined variable to have a basic loop instead of a straight line.
- **[💥Breaking]** Replace explicit "commands" passing by common `WorkspaceContext.getCommandBus()`:
  * Remove all commands-like props from components, e.g. `commands`, `connectionMenuCommands`, `instancesSearchCommands`, `searchCommands`.
  * Triggering a command or listening for one from outside the component should be done by acquiring a commands object using `getCommandBus()` with the following built-in command bus topics: `ConnectionsMenuTopic`, `InstancesSearchTopic`, `UnifiedSearchTopic`, `VisualAuthoringTopic`.
  * **[🧪Experimental]** Custom command bus topics can be defined with `CommandBusTopic.define()`.
- Support `linkType` option for `SelectionActionEstablishLink` to create a relation of a specific type from that action by default.

#### 🔧 Maintenance
- Extract `HashMap`, `HashSet` and hash-code generation utilities into separate package [`@reactodia/hashmap`](https://github.com/reactodia/hashmap).
- Extract Web Worker-related utilities into separate package [`@reactodia/worker-proxy`](https://github.com/reactodia/worker-proxy):
  * `@reactodia/worker-proxy/protocol` should be used instead of `@reactodia/workspace/worker-protocol` to define custom workers.
  * `useWorker()` hook now accepts any worker adhering to the `RefCountedWorker` interface from `@reactodia/worker-proxy`, e.g. created with `refCountedWorker()` function. 
- Replace `classnames` runtime dependency by `clsx`.
- Update runtime dependencies: `n3`, `@vscode/codicons`.
- Update dev-dependencies: Webpack + loaders, SASS, TypeScript, Vitest, ESLint.

## [0.28.1] - 2025-02-28
#### 🐛 Fixed
- Fix missing elements on load when rendering in React strict mode (regression in v0.28.0).

#### ⏱ Performance
- Improve performance of canvas scrolling and panning with mouse on large diagrams.

## [0.28.0] - 2025-02-26
#### 🚀 New Features
- Support i18n for the UI components:
  * Allow to provide custom bundles with translation strings and (optionally) disable the default one with `translations` and `useDefaultTranslation` properties for the `Workspace`;
  * Provide `i18n/i18n.schema.json` JSON schema to validate partial translation bundles.
- Basic design system and a built-in dark theme:
  * Define a basic design system with CSS custom properties for colors, fonts, borders, spacing and transitions;
  * Support base `border-radius` on inputs, buttons, panels, etc if provided via `--reactodia-border-radius-base`;
  * Change `StandardTemplate` to use a common CSS property for entity color:  `--reactodia-element-style-color` (previously was `--reactodia-standard-entity-color`);
  * Force specific color scheme (theme) via `colorSchema` property on `WorkspaceRoot` and `DefaultWorkspace` with default `auto` mode;
  * Expose `useColorScheme()` hook to observe current color scheme for the workspace.
  * Exporting the diagram (to SVG/PNG or printing it) always exports if the workspace is using the light theme.
- Ability to add, remove or modify property values in the "Edit entity" dialog:
  * **[🧪Experimental]** Change `MetadataApi.getElementTypeShape()` into `getElementShape()` with a more specific contract, add `getLiteralLanguages()`.

#### 🐛 Fixed
- Disallow selection of already present but grouped entities in `ConnectionsMenu` and place them again onto the canvas.
- Fix incorrect handling of a relation in the "Edit relation" dialog when reversing the its direction (e.g. a change from "Person isAuthorOf Book" to "Book isNamedAfter Person"), including validation against duplicate relations and the displayed direction.
- Fix error when trying to render a `ToolbarActionOpen` or `ToolbarActionSave` in the toolbar instead of a dropdown menu.
- Fix links having unresolved labels and no markers when importing the same diagram layout twice.

#### 💅 Polish
- Relax assignment compatibility for branded IRI types (`ElementIri`, `ElementTypeIri`, `LinkTypeIri`, `PropertyTypeIri`) to allow assignment from a raw `string` type but not between them.

#### 🔧 Maintenance
- Deprecate `DiagramModel.locale` usage: use `Translation` object to perform locale-specific formatting instead.
- Remove unused `raceAbortSignal()` function.

## [0.27.1] - 2025-01-25
#### 🐛 Fixed
- Auto-reset command history as the last step in `useLoadedWorkspace()`.
- Make diagram ready to use on mount without a required call to `createNewDiagram()` or `importLayout()` first (components which require a data provider may still wait for the explicit loading, e.g. `ClassTree`).
- Properly re-initialize `VisualAuthoring` on mount/unmount.
- Change default `ClassTree` minimum search term length to 2 as a workaround for performance issues on large element type trees.

## [0.27.0] - 2024-12-05
#### 🚀 New Features
- Introduce new search-centric default workspace layout with `UnifiedSearch`:
  * Add `UnifiedSearch` component to unify graph text lookup under a single entry point, with built-in adapters: `SearchSectionElementTypes` for `ClassTree`, `SearchSectionEntities` for `InstancesSearch`, `SearchSectionLinkTypes` for `LinksToolbox`;
  * **[💥Breaking]** Change `DefaultWorkspace` to use unified search, move non-menu toolbar items to the secondary toolbar and `ZoomControl` to the left side of the viewport;
  * Export previous workspace layout under `ClassicWorkspace` and `ClassicToolbar` components;
- Add ability to dock viewport canvas widgets to any side/corner without style overrides:
  * **[💥Breaking]** Add `dock` (required), `dockOffsetX`, `dockOffsetY` props to `Navigator`, `Toolbar` and `ZoomControl` widgets.
- Allow to switch canvas pointer mode with `ZoomControl`:
  * Disabled by default, can be enabled via `showPointerModeToggle` option.
- Support overlay dialogs without target which displayed as blocking modal:
  * Expose `dialogType` option in `OverlayController.showDialog()` and `BuiltinDialogType` for built-in dialog types;
  * Add option to show dialog without a close button with `closable: false`.

#### 🐛 Fixed
- Fix links caching in `IndexedDbCachedProvider.links()` not working due to native `crypto.subtle` being available only in secure contexts (e.g. HTTPS).
- Fix `OverlayController.startTask()` spinner not positioned at the center of the canvas horizontally.
- Fix `ClassTree` becoming stuck at loading instead of displaying a error when initialization fails.
- Partial fixes for `SparqlDataProvider` compatibility with Virtuoso:
  * Remove `?extractedLabel` from default text lookup pattern in `OwlRdfsSettings`;
  * Fix keeping un-parametrized variable for `filterOnlyLanguages` if the corresponding setting is not set.
- Avoid flicking selection when making a click on an already selected element when `Selection` widget is used.
- Fix ignored `disabled` option for `LinkAction`.
- Keep the size for properties stable in `StandardTemplate` to even when property labels are loaded.
- Fix `computeLayout()` considering hidden links for graph layout computation.
- Fix React warning for update after unmount in `EditLayer` > `LinkLayer`.

#### 💅 Polish
- Display "no results" in various cases in `ClassTree`, `InstancesSearch` and `LinksToolbox` components.
- Auto-collapse `Navigator` when there is not enough space in the canvas viewport.
- Change `LinkTypesToolbox` to only use links on the diagram instead of requesting connected links from a data provider.
- Display inline entity badges with its type style in `InstancesSearch` and `LinksToolbox`.
- Change cursor to "grabbed" style when panning the canvas.
- Improve default look for the overlay dialogs with a dedicated header with caption and close button:
  * Allow to disable dialog resize in one or both axes via `DialogStyleProps.resizableBy` prop;
  * Improve `ConnectionsMenu` and `FindOrCreateEntity` style and UX.
- Improve styles for `ToolbarLanguageSelector`: remove extra background and border.
- Allow to track canvas viewport bounds on the page with `CanvasMetrics.getViewportPageRect()` and `CanvasEvents.resize`.
- Separate `frame` debounce mode in `Debouncer`, allow to change timeout after creation.
- **[🧪Experimental]** Update metadata and validation provider contracts:
  * Rename providers to `MetadataProvider` and `ValidationProvider` for consistency;
  * Re-organize `MetadataProvider` contract to reduce slightly different variations to get similar metadata;
  * Support severity in validation result items (previously known as errors);
  * Ignore metadata and validation provider changes after mount;
  * Add separate method to toggle authoring mode: `EditorController.setAuthoringMode()`.
  * Update `AuthoringState` and `TemporaryState`: use separate event types for added, changed and removed events;
- **[🧪Experimental]** Add `VisualAuthoring` canvas widget to configure and provide implementation for visual graph authoring:
  * Require `VisualAuthoring` widget in be in the canvas for visual graph authoring;
  * Move authoring-related methods from `OverlayController` to `EditorController.authoringCommands`.

## [0.26.1] - 2024-11-26
#### 🐛 Fixed
- Fix bringing elements to front on selection (regression introduced at [0.25.0]).
- Avoid accidental text selection on click with Shift pressed when multiple elements are selected with `Selection` widget.
- Fix missing count badges in `ClassTree` which reappeared on requesting element type data (regression introduced at [0.25.0]).
- Fix element grouping incorrectly group links between different element pairs together due to `DiagramModel.findLink()` returning non-matching links.

## [0.26.0] - 2024-11-17
#### 🚀 New Features
- Support incremental links loading from `DataProvider`:
  * **[💥Breaking]** Change `DataProvider.links()` contract to return links between two sets of elements to allow partial link requests;
  * Extend `SparqlDataProviderSettings.linksInfoQuery` to support partial link queries (with backwards compatibility fallback);
- Support auto-split `SparqlDataProvider` requests into chunks of configurable size (`chunkSize`):
  * Splitting `SparqlDataProvider.links()` requests requires to migrate to the new `linksInfoQuery` contract, see above;
- Cache links via perfect mirroring for `IndexedDdCachedProvider.links()`:
  * Enabled by default, can be disabled by setting `IndexedDdCachedProviderOptions.cacheLinks` to `false`;
- Cache missing results for applicable methods in `IndexedDbCachedProvider`:
  * Enabled by default, can be disabled by setting `IndexedDdCachedProviderOptions.cacheMissing` to `false`;

#### 🐛 Fixed
- Grouped entity width overflow when a label is too long in the `StandardTemplate`.
- Fix cached results from `IndexedDbCachedProvider.connectedLinkStats()` ignored `inexactCount` parameter.

#### 💅 Polish
- **[💥Breaking]** Change `placeElementsAround()` function into `placeElementsAroundTarget()` command;
- **[💥Breaking]** Replace `LinkTemplateProps.typeIndex` with `markerSource` and `markerTarget` properties;
- **[💥Breaking]** Replace `EditableLabel` on the link template by a separate `RenameLinkProvider`;
- **[💥Breaking]** Replace `GenerateID.{forElement, forLink}` with static methods `Element.generateId()` and `Link.generateId()`;
- Add JSDoc for almost all exported components, services, interfaces and functions.

#### 🔧 Maintenance
- Increased IndexedDB database version in `IndexedDbCachedProvider`: previous caches will be discarded on upgrade when using the new version.
- Remove unused `LinkRedrawLevel` type with corresponding parameters;
- Deprecate `SemanticTypeStyles` and `OntologyLinkTemplates`;
- Deprecate `WorkspaceProps.onIriClick` handler and related `SharedCanvasState.onIriClick()` method;
- Deprecate `DataDiagramModel.requestLinksOfType()` which is replaced by `requestLinks()` method;

## [0.25.1] - 2024-08-31
#### 🐛 Fixed
- Fix missing default value for `zoomToFit` option in `WorkspaceContext.performLayout()`.

## [0.25.0] - 2024-08-31
#### 🚀 New Features
- Add ability to group elements and links:
  * Add `EntityGroup` element type and `RelationGroup` link type and corresponding commands;
  * Add `DataDiagramModel.{group, ungroupAll, ungroupSome}` and `WorkspaceContext.{group, ungroupAll, ungroupSome}` methods to group and ungroup entities;
  * Auto-group relations when creating them using `DataDiagramModel.createLinks()` with ability to manually regroup via `DataDiagramModel.regroupLinks()`;
  * Add `SelectionActionGroup` to group/ungroup from `Halo` and `Selection`, update default actions and its dock placement;
  * Include `sourceIri` and `targetIri` when serializing `RelationLink` (required to restore entity groups).
- Support adding elements as group from `ConnectionMenu` and `InstancesSearch`.
- Add `OverlayController.startTask()` method to start foreground canvas tasks:
  * Display overlay task while computing graph layout via `WorkspaceContext.performLayout()`.

#### 🐛 Fixed
- Fix `RenderingState.syncUpdate()` not updating element sizes when called from React-managed handlers due to batching;
- Store failed operation errors to display even when `WithFetchStatus` is re-mounted:
  * Add `DataDiagramModel.getOperationFailReason()` to check if latest fetch operation failed;
- Fix `WikidataSettings` for `SparqlDataProvider` to resolve property type labels;

#### 💅 Polish
- Allow to choose element template based on element itself in addition to its types in `CanvasProps.elementTemplateResolver`.
- Allow to fetch labels and property values only in specified languages in `SparqlDataProviderSettings` via `filterOnlyLanguages` setting.
- Allow to skip "zoom to fit" in `WorkspaceContext.performLayout()` by passing `zoomToFit: false`.
- Export `EmptyDataProvider` which implements `DataProvider` interface with no data.
- Change search results component in `ConnectionMenu` and `InstancesSearch` to select multiple items without holding Control/Meta;

#### 🔧 Maintenance
- **[💥Breaking]** Prepare to decouple basic diagram renderer from entity and relation graph:
  * Use separate `EntityElement` and `RelationLink` types for elements and links with data;
  * Rename `AsyncModel` -> `DataDiagramModel`;
  * Move methods related to element / link / property types from `DiagramModel` to `DataDiagramModel`, including locale formatting;
  * Move link type visibility state from `LinkType` to `DiagramModel` itself;
  * Change `TemplateProps` to have `element: Element` instead of `data: ElementModel` inside;
  * Inject additional type information to layout computation via `LayoutTypeProvider`;
  * Change `InstancesSearch` criteria to use primitive values instead of element and type references;
  * Remove `DataDiagramModel.createLink()` method: either `addLink()` or `createLinks()` should be used instead;
  * Move `EditorController.{selection, setSelection, bringElements}` to `DiagramModel`.
  * Rename `EditorController` methods to reflect new terminology (element and link -> entity and relation).
  * Rename commands to globally change entity graph: `setElementData()` -> `changeEntityData()` and `setLinkData()` -> `changeRelationData()`.
- **[💥Breaking]** Change `ElementType`, `LinkType` and `PropertyType` to store original data inside instead of unpacking it into label and other properties.
- **[💥Breaking]** Replace implicit element type and property subscriptions by explicit hook calls:
  * Extract `useSyncStore()` overload with equality comparator into separate function `useSyncStoreWithComparator()` for performance reasons;
  * Add `KeyedSyncStore` type and `useKeyedSyncStore()` hook mirroring built-in `SyncStore` / `useExternalSyncStore()` React hook but for multiple subscriptions via keys at the same time;
  * Add `subscribeElementTypes`, `subscribePropertyTypes` and `subscribeLinkTypes` keyed event stores;
- Replace `Element.temporary` property with separate `VoidElement` type;
- Replace `Link.layoutOnly` property by `TemplateProperties.LayoutOnly` link state property;
- Remove legacy grouping functionality: `WorkspaceProps.groupBy` option, `EmbeddedLayer` and `GroupTemplate` components, `Element.group` property and relevant events.

## [0.24.0] - 2024-03-27
#### 🚀 New Features
- Track and display fetching state for the graph data:
  * Expose `AsyncModel.operations` property and `AsyncModel.changeOperations` event to track active fetch operation;
  * Add `WithFetchStatus` component to decorate other component with fetch status on element or element/link/property type;
  * Update default templates to use `WithFetchStatus`;
- Support React component lifecycle for Link templates:
  * **[💥Breaking]** `LinkTemplate.render()` drastically changed to act as "render function" which returns React elements;
  * **[💥Breaking]** Changed `LinkTemplate.setLinkLabel()` into `EditableLinkLabel` object on the link template;
  * Expose `LinkPath`, `LinkLabel` and `LinkVertices` components as building blocks for custom link templates;
  * Extract existing link rendering into `DefaultLinkTemplate` and `DefaultLinkPathTemplate`;
- Support computing graph layout using web workers:
  * Make default diagram layout algorithm configurable via `defaultLayout` prop on `Workspace`;
  * Rename `layoutForcePadded` default layout function to `blockingDefaultLayout`;
  * Make `layoutFunction` and `canvas` parameters of WorkspaceContext.performLayout() optional;
  * Add `defineWorker()` and `useWorker()` to register and use shared ref-counted workers;
  * Export `worker-protocol` sub-module to ease creation of transparent worker proxies;
  * Export `layout.worker` sub-module (and `defineLayoutWorker()` helper) with default layout algorithms to be imported as a worker script;
  * **[💥Breaking]** Change `LayoutFunction` to be a pure function from `LayoutGraph` and `LayoutState` into `LayoutState`;
  * **[💥Breaking]** Change `layoutPaddedWith()` / `layoutBiasFreePaddedWith()` to allow async usage as `layoutPadded()` / `layoutPaddedBiasFree()`;

#### 🐛 Fixed
- Support React 18 `<StrictMode>` workspace loading:
  * Add `DiagramModel.discardLayout()` to be used for correct `useEffect()` cleanup;
  * Add `useLoadedWorkspace()` hook for easier and correct by default asynchronous workspace loading;
- Fix reloading/re-fetching class tree when importing a diagram with same data provider.
- Fix elements lagging behind when moving `Selection` box.
- Fix `SelectionActionEstablishLink` being displayed when authoring mode is not active.
- Fix missing inheritable CSS defaults for links in the exported diagrams.
- Fix shrinking buttons for link types in `ConnectionsMenu`.
- Clear `InstancesSearch` results when loading a diagram.

#### 💅 Polish
- Add `useWorkspace()` and `useCanvas()` hooks to access workspace and canvas context with proper error handling:
  * Getting these context objects directly via `useContext(WorkspaceContext)` and `useContext(CanvasContext)` is deprecated and will be subject to removal in the future release;
- Support `accept` attribute for HTML file input in `ToolbarActionOpen`.
- **[💥Breaking]** Make random-delay data provider decorator configurable and expose its factory under new name `makeDelayProviderDecorator()`.

#### 🔧 Maintenance
- **[💥Breaking]** Rename some functions and properties for consistency and documentation:
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

## [0.23.0] - 2023-12-11
#### 🚀 New Features
- Support customizable `Toolbar` widget with its actions decomposed into separate components:
  * Generic component for toolbar actions: `ToolbarAction`;
  * Default menu items: `ToolbarActionClearAll`, `ToolbarActionExport` (for PNG, SVG and print);
  * Default panel items: `ToolbarActionUndo`, `ToolbarActionRedo`, `ToolbarActionLayout`, `ToolbarLanguageSelector`;
  * Additional specialized actions: `ToolbarActionOpen`, `ToolbarActionSave`;
- Add `Selection` canvas widget with rectangular element selection to the default workspace;
- Made `Halo` and `Selection` widgets customizable via action components:
  * Generic component for element actions: `SelectionAction`;
  * Specialized actions: `SelectionActionRemove`, `SelectionActionZoomToFit`, `SelectionActionLayout`, `SelectionActionExpand`, `SelectionActionConnections`, `SelectionActionAddToFilter`, `SelectionActionAnchor`, `SelectionActionEstablishLink`;
- Support multi-navigation using `SelectionActionConnections` when multiple elements are selected.
- Made `HaloLink` widget customizable via action components:
  * Generic component for link actions: `LinkAction`;
  * Specialized actions: `LinkActionEdit`, `LinkActionDelete`, `LinkActionMoveEndpoint`, `LinkActionRename`;

#### 🐛 Fixed
- When establishing new link and selecting an existing entity to put on canvas and connect, it should not mark the entity as "new".
- Re-route links on link type visibility change.
- Perform zoom-to-fit after loading an existing diagram instead of just centering the content.
- Fixed unintended element move when interacting with nested element scrollbar.
- Reset history after creating a new diagram or importing existing layout.
- Fix text lookup query to use public full-text search service for `WikidataSettings`.

#### 💅 Polish
- Add selected link highlight to `HaloLink`:
  * Label highlight: displayed by default as underline;
  * Path highlight: unstyled by default, can be changed via CSS;
- Support customizable stroke and fill styles in `Navigator` and improve default colors.
- Exposed SVG and raster image export options in corresponding `CanvasApi` methods.
- Support for graceful close and clearing the cache in `IndexedDbCachedProvider`. 
- Added utility hooks for debounced event subscription: `useEventStore()`, `useFrameDebouncedStore()`, `useSyncStore()`.
- Add `inexactCount` parameter to `DataProvider.connectedLinkStats()` to allow to avoid computing full connected link type statistics where only existence of a link type is enough.
- **[💥Breaking]** Use synthetic type and label predicates in element query of `SparqlDataProvider`:
  * Use `urn:reactodia:sparql:{type, label}` instead of `rdf:type` and `rdfs:label` as marker predicates in `SparqlDataProviderSettings.elementInfoQuery` to distinguish them from properties with same predicates;
- Add custom "zoom-to-fit" icon instead of reusing a different one from Codicons.
- Improve accessibility attribute placement (including `role`, `aria-*`, `title`, `name`, etc).

#### ⏱ Performance
- Optimize link route updates via batching.

#### 🔧 Maintenance
- **[💥Breaking]** Split `DiagramView` type:
  * Remove public `model` property to get `DiagramModel` (accessible via both canvas or workspace context);
  * Move `language` property with setter and corresponding event into `DiagramModel`;
  * Move locale formatting methods under `DiagramModel.locale.*`;
  * Move `getTypeStyle()` into `WorkspaceContext` as `getElementTypeStyle()`;
  * Rename `DiagramView` -> `SharedCanvasState` and move under `RenderingState.shared`;
- **[💥Breaking]** Rename some functions and properties for consistency and documentation:
  * `DefaultToolbar` -> `Toolbar`;
  * `CanvasApi.exportPng()` -> `CanvasApi.exportRaster()`;
  * `OverlayController.showEditLinkLabelForm()` -> `OverlayController.showRenameLinkForm()`;
  * `visible` / `showLabel` properties on `RichLinkType` -> `visibility` property of string enum type.
- Removed deprecated `Dictionary` type (`Record<string, T>` can be used instead).
- Removed untyped `key` parameter from event listeners.
- Made private `EditorController.model` property (accessible via workspace context).

## [0.22.0] - 2023-11-24
#### 🚀 New Features
- Support resources represented by blank nodes in `RdfDataProvider` when `acceptBlankNodes` is enabled.
- Support native scroll and pan in `PaperArea` (e.g. using mouse wheel or touchpad scrolling).
- Support touch input: native pan scroll and custom pinch zoom:
  * Add new coordinate conversions to `CanvasMetrics`: `paperToPageCoords()` and `scrollablePaneToClientCoords()`;
  * Add `Vector.{add, subtract, scale}` functions;

#### 🐛 Fixed
- Fix ignored lookup direction `linkDirection` in `RdfDataProvider.lookup()`.
- Prevent creating loaded links from cluttering the command history.
- Prevent canvas scroll jumping on undo action after layout:
  * Add `restoreViewport()` command to undo/redo viewport state in similar cases;
- Fix diagram export/print to correctly embed CSS for pseudo-elements and SVG images.
- Display only property values in currently selected language if possible via `DiagramView.formatPropertyList()`.

#### 💅 Polish
- Use a dropdown menu to improve toolbar UI, make it more compact.

#### ⏱ Performance
- Optimize `ElementLayer` and `LinkLayer` rendering, reducing unnecessary React updates and DOM reflows:
  * **[💥Breaking]** Make `LinkStyle.renderLink()` explicitly depend only on link data and state for future optimizations;

#### 🔧 Maintenance
- Introduce `GraphStructure` as a read-only view for the `DiagramModel`:
  * Use `GraphStructure` in `LinkRouter`, `LinkStyle` and `ValidationApi`;
- **[💥Breaking]** Use consistent naming for diagram model data accessors:
  * Rename method `getLinkById()` -> `getLink()`;
  * Rename methods `getClass()` / `createClass()` -> `getElementType()` / `createElementType()`;
  * Remove unnecessary methods `linksOfType()`, `isSourceAndTargetVisible()`;
  * Rename classes `FatClassModel` / `FatLinkType` -> `RichElementType` / `RichLinkType`;

## [0.21.0] - 2023-11-21
#### 🐛 Fixed
- Fix element does not redraw on its removal in some cases.
- Avoid error when trying to change element type when dragging out of another in the authoring mode.
- Ensure that a link is never lost when dragging its source or target connector in the authoring mode.

#### 💅 Polish
- **[💥Breaking]** Make `DiagramModel.addLink()` consistent with `addElement()`:
  * `addLink` and `removeLink` use command history;
  * `addLink` will error on trying to add existing link, use `createLink()` for the previous behavior;

#### 🔧 Maintenance
- **[💥Breaking]** Expose `Element.links` only through `DiagramModel.getElementLinks()`.

## [0.20.0] - 2023-11-16
#### 🚀 New Features
- Fork the library as OSS project, see [previous CHANGELOG](https://github.com/metaphacts/ontodia/blob/master/CHANGELOG.md) if needed.
- Implement in-memory `CommandHistory` interface by default.
- Support fully customizable workspace structure with the following elements:
  * `Workspace` - only defines shared context for other components;
  * `WorkspaceRoot`, `WorkspaceLayoutRow`, `WorkspaceLayoutColumn`, `WorkspaceLayoutItem` - organizes components into resizable/collapsible sections;
  * `Canvas` -- displays the diagram and canvas widgets;
  * Canvas widgets: `DefaultToolbar`, `ConnectionsMenu`, `DropOnCanvas`, `Halo`, `HaloLink`, `Navigator`, `ZoomControl`;
  * Other components: `ClassTree`, `InstancesSearch`, `LinkToolbox`;

#### 🐛 Fixed
- Properly batch commands to history when placing elements from the Connections dialog.

#### 💅 Polish
- **[💥Breaking]** Many changes to code structure and small changes to the naming.
- CSS classes prefix changed to `reactodia-`.
- Reimplemented `RdfDataProvider` based on RDF/JS-compatible in-memory RDF store.
- Moved element property formatting from `ElementLayer` into element templates themselves.
- Changed link type visibility settings to affect only link rendering without removing them from the graph.
- Bundle subset of [Codicons](https://github.com/microsoft/vscode-codicons) for icons,
  removed dependency on the included Font Awesome on the host page.
- Moved default type style and link customizations into opt-in `SemanticTypeStyles` and `OntologyLinkTemplates`.

#### 🔧 Maintenance
- Enabled full `strict` TypeScript compiler mode with null checks.
- Migrated from legacy React Context to the modern one (`React.createContext()`).
- Use RDF/JS-compatible IRI and literal terms.
- Removed blank nodes discovery support from `SparqlDataProvider` (might be reimplemented in the future).

[Unreleased]: https://github.com/reactodia/reactodia-workspace/compare/v0.28.1...HEAD
[0.28.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.28.0...v0.28.1
[0.28.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.27.1...v0.28.0
[0.27.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.27.0...v0.27.1
[0.27.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.26.1...v0.27.0
[0.26.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.26.0...v0.26.1
[0.26.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.25.1...v0.26.0
[0.25.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.25.0...v0.25.1
[0.25.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.12.2...v0.20.0
