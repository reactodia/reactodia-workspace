# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) 
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Latest]
### Added
- Support customizable `Toolbar` widget with its actions decomposed into separate components:
  * Generic component for toolbar actions: `ToolbarItem`;
  * Default menu items: `ToolbarActionClearAll`, `ToolbarActionExport` (for PNG, SVG and print);
  * Default panel items: `ToolbarActionUndo`, `ToolbarActionRedo`, `ToolbarActionLayout`;
- Added `Selection` canvas widget with rectangular element selection to the default workspace;
- Made `Halo` and `Selection` widgets customizable via action components:
  * Generic component for element actions: `SelectionAction`;
  * Specialized actions: `SelectionActionRemove`, `SelectionActionZoomToFit`, `SelectionActionLayout`, `SelectionActionExpand`, `SelectionActionConnections`, `SelectionActionAddToFilter`, `SelectionActionAnchor`, `SelectionActionEstablishLink`;
- Made `HaloLink` widget customizable via action components:
  * Generic component for link actions: `LinkAction`;
  * Specialized actions: `LinkActionEdit`, `LinkActionDelete`, `LinkActionMoveEndpoint`, `LinkActionRename`;
- Add selected link highlight to `HaloLink`:
  * Label highlight -- displayed by default as underline;
  * Path highlight -- unstyled by default, can be changed via CSS;
- Support customizable stroke and fill styles in `Navigator` and improve default colors;
- Exposed SVG and raster image export options in corresponding `CanvasApi` methods.
- Support for graceful close and clearing the cache in `IndexedDbCachedProvider`. 
- Added utility hooks for debounced event subscription: `useEventStore()`, `useFrameDebouncedStore()`, `useSyncStore()`.

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

[Latest]: https://github.com/reactodia/reactodia-workspace/compare/v0.22.0...HEAD
[0.22.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.12.2...v0.20.0
