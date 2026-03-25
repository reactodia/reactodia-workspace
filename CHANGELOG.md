# Changelog
All notable changes to the Reactodia will be documented in this document.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

## [0.34.0] - 2026-03-25
#### 🚀 New Features
- Support proper graph manipulation on touchscreen devices:
  * Allow to move and resize elements on touchscreen;
  * Allow to manipulate link vertices on touchscreen (only in Firefox for now due to [bug](https://gsap.com/community/forums/topic/15870-svg-draggable-chrome-android-problems/));
  * Allow to select multiple elements with `Selection` with touch when `CanvasApi.pointerMode` is `selection`;
  * Allow to establish new links with `SelectionActionEstablishLink` on touchscreen;
  * Allow to move link source or target with `LinkActionMoveEndpoint` on touchscreen;
  * Make `ZoomOptions.requireCtrl` default to `false` to zoom without holding `Ctrl` i.e. like on a map.
  * Enable `showPointerModeToggle` on `ZoomControl` by default (can be disabled by passing `false`).
- **[💥Breaking]** Extend and make optional built-in property editing form support:
  * Extract property editor inputs into separate entry point `@reactodia/workspace/forms` to be able to use external forms implementation without always bundling the built-in one;
  * Provide `InputText`, `InputList` and `InputSelect` basic form inputs;
  * Provide `InputFile` form input with `MemoryFileUploader` implementation for `FileUploadProvider` interface;
  * `VisualAuthoring` now requires `propertyEditor` prop with changed contract, which have to return an editor component in all cases.
  * `DefaultPropertyEditor` in combination with imported inputs provides default (built-in) property editing experience, but custom editors can be implemented with `EntityEditor` and `RelationEditor` "provider" components.
- Allow to customize how resource anchors and asset URLs (e.g. images or downloadable files) are resolved via `DataLocaleProvider.{prepareAnchor, resolveAssetUrl}`:
  * Resolve anchors and image thumbnail URLs in `StandardEntity`, `ClassicEntity` and `SelectionActionAnchor`;
  * Add `useResolvedAssetUrl()` helper hook to simplify resolving asset URLs from components;
- Support conditionally rendering `WorkspaceLayout*` child components by passing `null` instead of a child to remove it:
  * Allow to hide left and right panels in `ClassicWorkspace` by passing `null` to the corresponding props;
  * Allow to provide `className` and `style` to `WorkspaceLayout*` components.
- Add `Translation.textOptional()` to support common translation string defaults with ability to provide separate string for each case:
  * Use `search_defaults.input.placeholder` for a search input field;
  * Use `visual_authoring.dialog.apply.{label, text}` for an "Apply" button in `VisualAuthoring` dialogs.
- Allow to customize default dialog sizes for built-in dialogs and persist user-changed sizes with `dialogSettingsProvider` prop on `Workspace`:
  * Default provider persists user-changed dialog sizes in-memory based on `dialogType`.

#### 💅 Polish
- Expose `useAsync()` utility hook to simplify data loading from via a single Promise-returning task.
- Expose `useProvidedEntities()` utility hook to have a simple way to load non-canvas entities with cache from a `DataProvider`.
- Provide `onlySelected` property to link templates the same way as for element templates.
- Allow to configure whether `ClassTree` and `SearchSectionElementTypes` tree items should be draggable.
- Allow to configure `SparqlDataProvider.lookup()` via `lookupQuery` and `filterInnerPrelude` settings.

#### 🔧 Maintenance
- Preparations to extract generic scrollable paper component `Paper` from diagram-specific state and logic:
  * Replace `reactodia-paper-area` CSS class by `reactodia-canvas-area` and `reactodia-paper`.
  * Deprecate `CanvasMetrics.area` in favor of `CanvasMetrics.pane`.
- Remove `AbortScope` utility class (can be trivially replaced by the built-in [`AbortSignal.any()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static) function).

## [0.33.0] - 2026-03-16
#### 🚀 New Features
- Allow to open "Edit entity" dialog from `VisualAuthoring` for an entity not present on the canvas (e.g. to edit related or well-known entities).
- Extends metadata support for editing an entity or relation properties:
  * Allow to order properties with `MetadataPropertyShape.order`;
  * Allow to specify default value with `MetadataValueShape.defaultValue`;
  * Provide `source` and `target` entities to `MetadataProvider.getRelationShape()`.

#### 🐛 Fixed
- Fix stale rendering (i.e. missing links after moving an endpoint until an element move) due to the lost scheduled layer updates.
- Fix unable to scroll inside canvas components and templates when `requireCtrl` in `zoomOptions` is set `false`.
- Disallow moving relation source or target to another entity in authoring mode if the relation after move already exists on the canvas.
- Disable changing an entity IRI in a form when `MetadataProvider.canModifyEntity()` disallows it.
- Move link vertices together with source and target elements if both are selected in `Selection` component.
- Re-validate entities and links with `ValidationProvider` when added or removed via undo/redo.
- Fix marking `AnnotationLink` with `TemplateProperties.LayoutOnly` when importing a diagram layout.

#### 💅 Polish
- Remove superfluous "Type" fields from the default "Edit entity" dialog.
- Provide `translation` and current `language` to `ValidationProvider.validate()` method.
- Allow to specify related property IRI when returning a validation item for a relation from `ValidationProvider`.
- Display language selector in `FormInputText` only when shape `datatype` is `rdf:langString` or `uniqueLang` is set to either `true` or `false` (the selector will be hidden by default when `datatype` is `xsd:string`).
- Deprecate getting `Translation` instance from `WorkspaceContext`: use `useTranslation()` hook instead to be able to subscribe to translation bundle changes in the future.

## [0.32.0] - 2026-03-10
#### 🐛 Fixed
- Avoid marking grouped relation as "layout only" when importing a diagram (only grouped relation links themselves).
- Fix being unable to pan the canvas in Firefox when an graph element with a scrollbar inside was present.
- Fix a freeze when opening a class tree in authoring mode when `MetadataProvider.filterConstructibleTypes()` returns without any delay.
- Fix calling `MetadataProvider.canConnect()` with only source and without target when dragging over an element to establish a new link.
- Fix `flushSync was called from inside a lifecycle method` React warning when calling `centerTo()`, `centerContent()`, `zoomToFit()` on `CanvasApi` from a lifecycle method.
- Fix labels not loading for element and link type selectors in `VisualAuthoring` dialogs unless already preloaded from the diagram.
- Use default property editor for entities or relations when `VisualAuthoring.propertyEditor` returns `undefined`.
- Fix `prepareLabels` option for `SparqlDataProvider` to be applied for `knownElementTypes()`, `knownLinkTypes()`, `elementTypes()`, `linkTypes()`, `propertyTypes()` and `elements`.
- Fix `SparqlDataProvider.elements()` to always return entities with sorted types.

#### 💅 Polish
- Allow to set `className` and `style` on workspace root when using `DefaultWorkspace` or `ClassicWorkspace`.
- Allow to customize link label style separately for each property type in `StandardRelation`.
- Allow to customize relation property editor with the built-in relation type selector `RelationTypeSelector`.
- Export `LinkMarkerCircle` and `LinkMarkerDiamond` built-in link marker styles in addition to existing `LinkMarkerArrowhead`:
  * Built-in link markers now use `context-stroke` as `stroke`/`fill` value to match link path color.
- Provide `translation` and current `language` to `createEntity()` and `createRelation()` methods of `MetadataProvider`.
- Add `RdfDataProvider.clear()` to clear all added graphs to the provider.
- Add `datatypePredicates` option for `RdfDataProvider` to explicitly place connected `NamedNode` property values into entity/relation properties as if they were literals.
- Add `originProperty` option to `CompositeDataProvider` and `origin` to `DataProviderDefinition` to attach information about source provider for an entity or relation as a property value:
  * `DataProviderDefinition.origin` replaces previous non-configurable `name` prop (which is marked as deprecated now).
- Add `any` option for `ToolbarActionSave` property `mode` to be able to save when either diagram or authoring state has changes.
- Increase default maximum fallback size when exporting a raster image to 8192x8192 px as it well supported in the current browsers.

## [0.31.2] - 2025-11-28
#### 🐛 Fixed
- Fix `AnnotationSupport` not unsubscribing from `AnnotationTopic` at unmount which causes two annotations to be created from `SelectionActionAnnotate` in React development mode.
- Fix undo/redo history not working after panning or pinch-zoom gesture on touch devices.
- Fix keyboard hotkeys for selection actions not working after focusing on search input then clicking back on the selection box.

## [0.31.1] - 2025-11-18
#### 🐛 Fixed
- Fix incorrect canvas viewport position when `zoomToFit()` or similar operation is called immediately after element position changes;
- Omit properties without values in `StandardEntity`, `StandardRelation` and `ClassicEntity`.

## [0.31.0] - 2025-11-15
#### 🚀 New Features
- Simplify canvas widgets placement at one or multiple layers:
  * Canvas children are always assumed to be viewport widgets;
  * Add `CanvasPlaceAt` component to render its children at specified non-viewport canvas layer instead;
  * Support new placement layers: `underlay` layer to place components under all canvas content, `overLinkGeometry` layer to place components above link geometry (connections) but under link labels;
  * **[💥Breaking]** Remove `defineCanvasWidget()` and `SharedCanvasState.setCanvasWidget()` (use `CanvasPlaceAt` to display components at canvas layers instead).
- Support to import and export diagram layout with custom element and link cell types (derived from `Element` or `Link`):
  * Introduce an optional contract for `Element` or `Link`-derived cell types to be serializable: `SerializableElementCell` and `SerializableLinkCell`;
  * When implemented, the corresponding cell types can be exported and later imported with the diagram;
  * `DataDiagramModel.importLayout()` will accept known cell types via `elementCellTypes` and `linkCellTypes` to import.
- Support diagram-only annotations:
  * Add `AnnotationElement` and `AnnotationLink` elements and links which exports and imports with the diagram but does not exists in the data graph;
  * Rendered by default with new built-in templates `NoteTemplate` and `NoteLinkTemplate` which use `NoteAnnotation`, `NoteEntity` and `NoteLink` template components;
  * Add `AnnotationSupport` canvas widget which enables annotations in the UI (can be configured or disabled via `annotations` prop on `DefaultWorkspace` and `ClassicWorkspace`);
  * Support annotation elements in `SelectionActionEstablishLink` and new `SelectionActionAnnotate` components;
  * Support annotation links in `LinkActionDelete`, `LinkActionMoveEndpoint` components.
  * Add `DefaultRenameLinkProvider` and use it by default to allow to change annotation link labels.
- Support user-resizable element templates with `ElementSize` template state property:
  * Resizable elements display "box with handles" in the `Halo` to change the size;
  * Changed element sizes are captured and restored by `RestoreGeometry` command.
- Allow to customize link template separately for each link instead of only based on its link type IRI in `linkTemplateResolver` for `Canvas`.
- Allow to configure `DropOnCanvas` to allow only some drop events and provide items to place on the canvas.
- Support keyboard hotkeys for `LinkAction` components to act on a currently selected link.

#### 🐛 Fixed
- Fix link rendering lagging behind when moving elements.
- Fix `RdfDataProvider.links()` returning empty results when called with `linkTypeIds` parameter.
- Fix `HaloLink` and visual authoring link path highlight being rendered on top on elements by placing it onto `overLinkGeometry` widget layer instead.
- Fix `HaloLink` link path highlighting not updating on link re-route.
- Fix element template state not being restored when ungrouping entities.
- Fix missing element decorations after re-importing the same diagram.
- Fix `DraggableHandle` to avoid using stale `onDragHandle` and `onEndDragHandle` prop values.
- Fix being able to execute disabled `SelectionAction` via keyboard hotkey.
- Fix throwing an error while trying to access `CanvasApi.metrics` members before the `Canvas` is fully mounted.

#### ⏱ Performance
- **[💥Breaking]** Canvas widgets are not automatically updated when parent canvas is rendered to reduce unnecessary re-renders, and now require explicit subscriptions:
  * Subscribe to canvas `changeTransform` event when using `CanvasApi.metrics` to convert between coordinates;
  * Subscribe to canvas `resize` event to track viewport size;
  * Subscribe to `changeCells` event from `DiagramModel` to track graph content changes.
- Add `TemplateProps.onlySelected` flag to use in the element templates to track if the element is the only one selected without performance penalty.
- Avoid per-layer frame delay when processing canvas layer updates without calling `RenderingState.syncUpdate()`:
  * Add `useLayerDebouncedStore()` hook as more flexible way to debounce and update with the canvas layer.
- Avoid eager link type creation for relation links, only create and fetch them on first render.

#### 💅 Polish
- **[💥Breaking]** Use typed `TemplateState` for `Element.elementState` and `Link.linkState` to avoid accidental type mismatch.
- Make dialogs fill the available viewport when the viewport width is small:
  * This is controlled by new CSS property `--reactodia-dialog-viewport-breakpoint-s` with default value `600px` which makes dialog fill the viewport if the available width is less or equal to that value.
- Allow to override base z-index level for workspace components with a set z-index value via `--reactodia-z-index-base` CSS property;
- Make `Halo` margin configurable via CSS property `--reactodia-selection-single-box-margin`.
- Highlight link path in `HaloLink` with `--reactodia-selection-link-color` color by default.
- Add `changeTransform` event to `CanvasApi.events` which triggers on `CanvasApi.metrics.getTransform()` changes, i.e. when coordinate mapping changes due to scale or canvas size is re-adjusted.
- Add `DiagramModel.cellsVersion` property which updates on every element or link addition/removal/reordering to be able to subscribe to `changeCells` event with `useSyncStore()` hook.
- Deprecate `canvasWidgets` prop on `DefaultWorkspace` and `ClassicWorkspace` in favor of passing widgets directly as children.
- Mark placeholder entity data with `PlaceholderDataProperty` property key to distinguish not-loaded-yet elements with `EntityElement.isPlaceholderData()`:
  * Add `DataDiagramModel.requestData()` as a convenient method to load all placeholder entities at once.
- Move expanded element state from distinct property on `Element` to be stored in `Element.elementState` with `TemplateProperties.Expanded` property:
  * All existing properties, methods and commands works as before but use element template state as storage for expanded state;
  * `changeExpanded` event is removed from element events, use `changeElementState` event instead;
  * When exporting the diagram the expanded state is serialized only with `elementState` while using `isExpanded` property when importing the diagram for backward compatibility.
- Introduce `ElementTemplate.supports` property for templates to tell its capabilities such as ability to expand/collapse or resized by user.
- Use consistent naming for standard element and link templates:
  * Deprecate `DefaultLinkTemplate` and `DefaultLink` and alias them to `StandardLinkTemplate` and `StandardRelation`;
  * Change CSS class for standard element template from `reactodia-standard-template` to `reactodia-standard-element`;
  * Change CSS class for default link template from `reactodia-default-link` to `reactodia-standard-link`;
  * Change translation groups from `standard_template` / `default_link_template` to `standard_element` / `standard_link`.
- Move "expand/collapse on double click" global element behavior to `StandardEntity` and `ClassicEntity` implementation only.
- Change `MetadataProvider.{createEntity, createRelation}` to return result object with initial template state in addition to the data to customize the created cells (i.e. new elements can be expanded or collapsed).
- Add `EditorController.applyAuthoringChanges()` method to apply current authoring changes to the diagram (i.e. change entity data, delete relations, etc) and reset the change state to be empty.
- Deprecate and hide by default "Edit" and "Delete" action buttons in `StandardEntity` expanded state (can be re-enabled by setting `showActions` prop to `true`).
- Deprecate `WorkpaceContext.{group, ungroupAll, ungroupSome}` methods in favor of free functions `groupEntities()`, `ungroupAllEntities()`, `ungroupSomeEntities()`.

#### 🔧 Maintenance
- Use Vite to build the library instead of Webpack to reduce build time by 70% and produced bundle size by 38%.
- Update Vitest to v4.
- Use small subset of [carbon design icons](https://github.com/carbon-design-system/carbon-icons) for various buttons.

## [0.30.1] - 2025-06-27
#### 🐛 Fixed
- Fix `BaseMetadataProvider` not delegating `canModifyRelation` method from object passed in its constructor.
- Make `CanvasApi.{exportSvg, exportRaster}` export images referenced in CSS stylesheets or inline styles from `mask` (`mask-image`) or `background` (`background-image`) CSS properties.
- Fix incomplete styles for exported canvas due to non-captured custom CSS property values in Chromium-based browsers.
- Fix issues when setting a mutable selection array, e.g. `model.setSelection(model.elements)`.
- Fix moving elements with `Selection` does not adding an undo command to the history.

#### ⏱ Performance
- Avoid unnecessary component updates in `Halo` and `HaloLink` when multiple elements are selected.

#### 💅 Polish
- Expose `contentPadding` option for `CanvasApi.{exportSvg, exportRaster}` methods to configure padding for the exported diagram.

## [0.30.0] - 2025-06-15
#### 🚀 New Features
- Support authoring relation properties:
  * Add `MetadataProvider.getRelationShape()` interface method to get editor metadata for relation properties, and allow to return `canEdit: true` from `MetadataProvider.canModifyRelation()` to display relation properties editor;
- Display "edit" and "delete" inline entity actions:
  * Add option `inlineEntityActions` (defaults to `true`) for `VisualAuthoring` to display entity actions inline at the top of each entity;
  * Improve the style for "cancel" (discard) action on entities and relations to make it consistent with other inline actions.
- Add `ElementDecoration` component to display additional decorations over canvas elements either from the template itself or from outside the element:
  * Element decorations are not included in the computed element bounds but are exported with the canvas unless explicitly marked with `data-reactodia-no-export` attribute (as with other canvas elements).
- Support keyboard hotkeys for the focused canvas:
  * Allow to specify arbitrary hotkeys to `ToolbarAction` and `SelectionAction` components, export `useCanvasHotkey()` hook to bind hotkey from any canvas widget;
  * Add default hotkeys for components: `Selection` (`Ctrl+A`: select all), `ToolbarActionUndo` (`Ctrl+Z`), `ToolbarActionRedo` (`Ctrl+Shift+Z`), `SelectionActionRemove` (`Delete`, same as before), `SelectionActionGroup` (`G`).
- **[💥Breaking]** Use separate HTML paper layer to display `LinkLabel` components instead of an SVG canvas, which allows to use CSS for layout, backgrounds and improves rendering performance:
  * `textClass`, `textStyle`, `rectClass` and `rectStyle` are replaced by `className` and `style` props;
  * CSS should use HTML styling properties instead of SVG variants, e.g. `color` and `background-color` instead of `stroke` and `fill`;
  * Label content should be placed directly as children to the component instead of using `content` prop.
- Select entity label and image using `DataLocaleProvider` based on its properties:
  * **[💥Breaking]** Remove `ElementModel.{label, image}` properties and instead use `DataDiagramModel.locale` methods to select them based on `ElementModel.properties` instead;
  * Allow to override data locale provider (default is `DefaultDataLocaleProvider`) by passing `locale` option to `model.importLayout()` or `model.createNewDiagram()`;

#### 🐛 Fixed
- Always display validation state for an entities and relations in case when the target does not have any authoring changes.
- Display elliptical authoring state overlays for elliptically-shaped entity elements.
- Use provided `duration` in `CanvasApi.animateGraph()` for element transitions without the need to override the styles.
- Trigger `keydown`, `keyup`, `scroll` and `contextMenu` canvas events only from a non-widget layer.
- Fix marking existing relation as new or changed after moving its source or target to its original source or target.

#### ⏱ Performance
- Optimize diagram loading time by avoiding unnecessary updates and separating a measuring element sizes step from applying the sizes to the rendering state.

#### 💅 Polish
- Export `BaseMetadataProvider` as a stable base to instantiate or extend when implementing custom metadata providers.
- Re-use and un-deprecate `model.locale` formatting object with `DataLocaleProvider` interface type:
  * Deprecate `Translation.formatIri()` in favor of `locale.formatIri()`;
  * Replace other deprecated methods of `locale` with: `selectEntityLabel()`, `selectEntityImageUrl()`, `formatEntityLabel()`, `formatEntityTypeList()`;
- Provide gradual customization options for the built-in entity and relation property editor:
  * Expose ability to customize property input in authoring forms with `inputResolver` option for `VisualAuthoring` component;
  * Export built-in inputs `FormInputList` and `FormInputText`, as well as `FormInputSingleProps` and `FormInputMultiProps` props interfaces to implement custom property inputs.
- **[💥Breaking]** Rename the following constants for consistency in naming style:
  * `DIAGRAM_CONTEXT_URL_V1` -> `DiagramContextV1`,
  * `PLACEHOLDER_ELEMENT_TYPE` -> `PlaceholderEntityType`,
  * `PLACEHOLDER_LINK_TYPE` -> `PlaceholderRelationType`;
- Support the ability to expand up the `Dropdown`, `DropdownMenu` and `Toolbar` by setting `direction` to `"up"` e.g. for docking the toolbar to the bottom of the viewport.
- Allow to return `iconMonochrome: true` for a type style to automatically apply dark theme filter for the icon.
- Support optional dependency list in `useEventStore()` to re-subscribe to store if needed.

#### 🔧 Maintenance
- Make library compatible with [React v19](https://react.dev/blog/2024/12/05/react-19), while continuing support for v17 and v18.
- Increase `IndexedDbCachedProvider.DB_VERSION` to 4 due to `ElementModel` changes.
- Remove deprecated `LocaleFormatter`, `DataGraphLocaleFormatter` and `FormattedProperty` types.
- Simplify the exported canvas SVG by using a single `<foreignObject>` to hold the whole element layer instead of a separate one for each canvas element.

## [0.29.1] - 2025-03-25
#### 🐛 Fixed
- Fix "max update exceeded in `componentDidUpdate()`" error that can be triggered in `InstancesSearch` in some cases.

## [0.29.0] - 2025-03-24
#### 🚀 New Features
- Support round (elliptical-shaped) elements:
  * Allow element templates to set `shape: 'ellipse'` to correctly compute link geometry;
  * Change `ElementTemplate` to be an object with additional element template options, allow to return both `ElementTemplate` and `ElementTemplateComponent` from `elementTemplateResolver`;
  * Add built-in basic circle-shaped `RoundTemplate` with its `RoundEntity` template component;
  * Add `RenderingState.getElementShape()` method to compute shape information (including bounds) for the element.
- Support smooth-curved links:
  * Allow link templates to set `spline: 'smooth'` to have rounded joints and overall shape via cubic Bézier curves;
  * Render links as smooth-curved by default unless a `spline: 'straight'` is set in the link template.
- Allow to dock a dialog to any side of a target with `dock` property with a configurable `dockMargin`.

#### 🐛 Fixed
- Fix search section activation race in `UnifiedSearch` which causes to sometimes open the first section instead of the specified one in `focus` command.
- Auto-focus on search input field in `UnifiedSearch` on `focus` command.
- Use `--reactodia-viewport-dock-margin` instead of a hard-coded value to compute max size for a dialog without target.

#### 💅 Polish
- Use "rounded" look by default by setting default `--reactodia-border-radius-base` to a non-zero value (it can be unset as before if desired to have a more "rectangular" UI styling).
- Make `Canvas` a [focusable](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus) element to allow to handle keyboard events scoped to the graph:
  * Removing selected elements on `Delete` key press now happens only when `SelectionActionRemove` if displayed by the `Halo` or `Selection` canvas widgets and only if the canvas has the focus to avoid accidental element removal by the action from unrelated document parts.
  * Expose `keydown` and `keyup` events on `CanvasApi.events` to handle keyboard events scoped to the canvas.
  * Canvas is now auto-focused (without scroll) on certain actions such as removing selected elements, grouping or ungrouping entities or dismissing a dialog.
- Export built-in templates and its components separately for easier customization:
  * Change `StandardTemplate` to a template object, expose its components as `StandardEntity` and `StandardEntityGroup`;
  * Change `ClassicTemplate` to a template object, expose its component as `ClassicEntity`;
  * Rename `DefaultLinkPathTemplate` to `DefaultLink`.
- Improve default routing for self (feedback) links with a single user-defined variable to have a basic loop instead of a straight line.
- Reduce the size of the main package bundle by moving fallback synchronous (blocking) layout into the separate entry point `/layout-sync`:
  * **[💥Breaking]** Make `defaultLayout` a required prop for a `Workspace`: if a bundled synchronous fallback (`blockingDefaultLayout()`) was used by default, now it is necessary to import it manually from `/layout-sync`;
  * The recommended layout algorithm usage is as before via Web Workers with `defineLayoutWorker()` and `useWorker()`.
- **[💥Breaking]** Replace explicit "commands" passing by common `WorkspaceContext.getCommandBus()`:
  * Remove all commands-like props from components, e.g. `commands`, `connectionMenuCommands`, `instancesSearchCommands`, `searchCommands`.
  * Triggering a command or listening for one from outside the component should be done by acquiring a commands object using `getCommandBus()` with the following built-in command bus topics: `ConnectionsMenuTopic`, `InstancesSearchTopic`, `UnifiedSearchTopic`, `VisualAuthoringTopic`.
  * **[🧪Experimental]** Custom command bus topics can be defined with `CommandBusTopic.define()`.
- Support `linkType` option for `SelectionActionEstablishLink` to create a relation of a specific type from that action by default.

#### 🔧 Maintenance
- Move deprecated type styles and link templates into separate entry point `@reactodia/workspace/legacy-styles`, including `SemanticTypeStyles`, `makeOntologyLinkTemplates(Reactodia)` (factory) and `makeLinkStyleShowIri(Reactodia)` factory.
- Remove deprecated `WorkspaceProps.onIriClick()` and corresponding events and trigger method on `SharedCanvasState`.
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

[Unreleased]: https://github.com/reactodia/reactodia-workspace/compare/v0.34.0...HEAD
[0.34.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.33.0...v0.34.0
[0.33.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.32.0...v0.33.0
[0.32.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.31.2...v0.32.0
[0.31.2]: https://github.com/reactodia/reactodia-workspace/compare/v0.31.1...v0.31.2
[0.31.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.31.0...v0.31.1
[0.31.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.30.1...v0.31.0
[0.30.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.30.0...v0.30.1
[0.30.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.29.1...v0.30.0
[0.29.1]: https://github.com/reactodia/reactodia-workspace/compare/v0.29.0...v0.29.1
[0.29.0]: https://github.com/reactodia/reactodia-workspace/compare/v0.28.1...v0.29.0
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
