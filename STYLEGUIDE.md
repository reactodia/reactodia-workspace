# Code style recommendations

* Pay attention to ESLint warnings.

* Module files and directories should be named in `camelCase`; if module has single important entity like
class or function then this file should be named after it:
```ts
// src/foo/bar/someFeature.ts

export class SomeFeature {
    ...
}

export function someFunction(feature: SomeFeature) {
    ...
}
```

* Avoid `default` exports if possible as they assign a new name to the imported symbol which makes renames trickier when refactoring.

* Inline interface declarations and module imports block should have spaces inside braces,
object literals should not:
```ts
import { SomeFeature, someFunction } from '../bar/someFeature';

const point: { x: number; y: number; } = {x: 42, y: 10};

export { point };
```

* Don't use parenthesis around lambda function with a single parameter:
```ts
items.map(item => ...)
```

* Use `const` keyword to declare variable by default instead of `let` if you are not intended to modify it.

* Declare imports from libraries first, then imports from project other than current module directory,
then modules from current directory:
```ts
import * as React 'react';
import classnames from 'classnames';

import { SomeFeature } from '../bar/someFeature';

import { Engine } from './core';
import { transformEngine } from './utilities';
```
