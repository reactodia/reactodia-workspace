# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) 
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Latest]

## [0.20.0]
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

[Latest]: https://github.com/AlexeyMz/reactodia-workspace/compare/v0.20.0...HEAD
[0.20.0]: https://github.com/AlexeyMz/reactodia-workspace/compare/v0.12.0...v0.20.0
