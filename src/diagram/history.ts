import { EventSource, Events } from '../coreUtils/events';
import type { TranslationKey } from '../coreUtils/i18n';

/**
 * Represents an atomic change to the state tracked by the command history,
 * which could be performed and reverted later if needed.
 *
 * @category Core
 * @see {@link CommandHistory}
 */
export interface Command {
    /**
     * Command title to display in the UI.
     *
     * @deprecated Use {@link metadata} property with {@link CommandMetadata.title} instead.
     */
    readonly title?: string;
    /**
     * Command metadata for the UI presentation.
     */
    readonly metadata?: CommandMetadata;
    /**
     * Performs the command action.
     *
     * @returns Inverse command to reverse changes done by the action.
     */
    invoke(): Command;
}

/**
 * Defines additional metadata for a command to display it in the UI.
 *
 * @see Command
 */
export interface CommandMetadata {
    /**
     * Command title to display in the UI.
     */
    readonly title?: string;
    /**
     * Command title specified as a translation key.
     *
     * @see {@link Translation}
     */
    readonly titleKey?: TranslationKey;
}

/**
 * Command action which can be executed for its effect.
 *
 * @returns Inverse command
 */
export type CommandAction = () => Command;

/**
 * Utility functions to create commands of different kinds.
 *
 * @category Core
 */
export namespace Command {
    /**
     * Creates a basic reversible command.
     *
     * **Example**:
     * ```ts
     * function changeFoo(store: FooStore, foo: Foo): Command {
     *     return Command.create('Set foo', () => {
     *         const previous = store.foo;
     *         store.setFoo(foo);
     *         return changeFoo(store, previous);
     *     });
     * }
     * ```
     */
    export function create(
        metadataOrTitle: string | CommandMetadata,
        action: CommandAction
    ): Command {
        const metadata: CommandMetadata = typeof metadataOrTitle === 'string'
            ? {title: metadataOrTitle} : metadataOrTitle;
        return new SimpleCommand(metadata, action);
    }

    /**
     * Creates a command which only does its action in one direction,
     * i.e. performs an effect on the execution but skips it when being undone
     * or vice-versa.
     */
    export function effect(
        metadataOrTitle: string | CommandMetadata,
        body: () => void
    ): Command {
        const metadata: CommandMetadata = typeof metadataOrTitle === 'string'
            ? {title: metadataOrTitle} : metadataOrTitle;
        return new EffectCommand(metadata, body);
    }

    /**
     * Creates a command composed of multiple other commands.
     *
     * When executed, sub-commands in be executed in the same order,
     * and the inverse command will use a reversed order of the sub-command inverses.
     */
    export function compound(
        metadataOrTitle: CommandMetadata | string | undefined,
        commands: ReadonlyArray<Command>
    ): Command {
        const metadata: CommandMetadata | undefined = typeof metadataOrTitle === 'string'
            ? {title: metadataOrTitle} : metadataOrTitle;
        return new CompoundCommand(metadata ?? {}, commands);
    }
}

class SimpleCommand implements Command {
    constructor(
        readonly metadata: CommandMetadata,
        readonly invoke: CommandAction
    ) {}

    get title(): string | undefined {
        return this.metadata.title;
    }
}

class EffectCommand implements Command {
    private readonly skip: Command;

    constructor(
        readonly metadata: CommandMetadata,
        private readonly body: () => void
    ) {
        this.skip = new SkippedEffect(metadata, this);
    }

    get title(): string | undefined {
        return this.metadata.title;
    }

    invoke(): Command {
        const {body} = this;
        body();
        return this.skip;
    }
}

class SkippedEffect implements Command {
    constructor(
        readonly metadata: CommandMetadata,
        private readonly effect: EffectCommand
    ) {}

    get title(): string | undefined {
        return undefined;
    }

    invoke(): Command {
        return this.effect;
    }
}

class CompoundCommand {
    constructor(
        readonly metadata: CommandMetadata,
        private readonly commands: ReadonlyArray<Command>
    ) {}

    get title(): string | undefined {
        return this.metadata.title;
    }

    invoke(): Command {
        const inverses: Command[] = [];
        for (const command of this.commands) {
            inverses.push(command.invoke());
        }
        inverses.reverse();
        return new CompoundCommand(this.metadata, inverses);
    }
}

/**
 * Event data for {@link CommandHistory} events.
 *
 * @see {@link CommandHistory}
 */
export interface CommandHistoryEvents {
    /**
     * Triggered when command history changes after a command is executed,
     * undone, redone or the history is cleared.
     */
    historyChanged: CommandHistoryChangedEvent;
}

/**
 * Event data for command history changed event.
 */
export interface CommandHistoryChangedEvent {
    /**
     * `true` if there are any changes which could be reverted.
     */
    readonly hasChanges: boolean;
}

/**
 * Provides an undo/redo mechanism to the diagram model and components.
 *
 * To make it possible to undo/redo the changes, all state modifications
 * are organized in a form of atomic commands. These commands can be
 * combined into a command batch to be presented to user as a single
 * meaningful operation.
 *
 * @category Core
 */
export interface CommandHistory {
    /**
     * Events for the command history.
     */
    readonly events: Events<CommandHistoryEvents>;
    /**
     * Current stack of operation which could be undone (reverted).
     *
     * Latest executed (or redone) commands are put at the end of the stack.
     */
    readonly undoStack: ReadonlyArray<Command>;
    /**
     * Current stack of operation which could be redone (performed again after being undone).
     *
     * Latest undone commands are put at the end of the stack.
     */
    readonly redoStack: ReadonlyArray<Command>;
    /**
     * Clears undo and redo stacks of commands.
     */
    reset(): void;
    /**
     * Undoes (reverts) the latest executed command and puts it into redo stack.
     *
     * If undo stack is empty, does nothing.
     */
    undo(): void;
    /**
     * Redoes (performs again) the latest undone command.
     *
     * If redo stack is empty, does nothing.
     */
    redo(): void;
    /**
     * Executes the specified command and puts its inverse into undo stack.
     */
    execute(command: Command): void;
    /**
     * Puts the inverse command directly into undo stack.
     */
    registerToUndo(command: Command): void;
    /**
     * Starts a new command batch which will be active either stored or discarded.
     *
     * When a batch is active, all executed or registered to undo commands will be put
     * into the batch instead of the undo stack, so it could be undo as whole later.
     *
     * Starting a new batch when there is an active command batch already
     * causes the new batch to become nested, which allows to use operations creating
     * command batches as part of a larger operation having its own top-level batch.
     */
    startBatch(metadataOrTitle?: CommandMetadata | string): CommandBatch;
}

/**
 * Provide the means to store or discard command batch.
 *
 * @category Core
 * @see {@link CommandHistory.startBatch}
 */
export interface CommandBatch {
    /**
     * Command history which owns this batch.
     */
    readonly history: CommandHistory;
    /**
     * Stores the batch, combining the nested command sequence
     * into a single revertible command.
     */
    store(): void;
    /**
     * Discards the batch, throwing away all nested commands, so they cannot be undone.
     *
     * This is useful when performing state changes on temporary items to
     * avoid being able to revert it.
     */
    discard(): void;
}

interface InMemoryBatch extends CommandBatch {
    readonly _metadata: CommandMetadata;
    readonly _inverses: Command[];
}

/**
 * Implements command history which stores all commands in memory.
 *
 * @category Core
 */
export class InMemoryHistory implements CommandHistory {
    private readonly source = new EventSource<CommandHistoryEvents>();
    readonly events: Events<CommandHistoryEvents> = this.source;

    private readonly _undoStack: Command[] = [];
    private readonly _redoStack: Command[] = [];
    private readonly batches: InMemoryBatch[] = [];

    get undoStack(): ReadonlyArray<Command> {
        return this._undoStack;
    }

    get redoStack(): ReadonlyArray<Command> {
        return this._redoStack;
    }

    private hasChanges(): boolean {
        return this._undoStack.length > 0;
    }

    reset() {
        this._undoStack.length = 0;
        this._redoStack.length = 0;
        this.source.trigger('historyChanged', {hasChanges: this.hasChanges()});
    }

    undo() {
        const command = this._undoStack.pop();
        if (command) {
            const inverse = command.invoke();
            this._redoStack.push(inverse);
            this.source.trigger('historyChanged', {hasChanges: this.hasChanges()});
        }
    }

    redo() {
        const command = this._redoStack.pop();
        if (command) {
            const inverse = command.invoke();
            this._undoStack.push(inverse);
            this.source.trigger('historyChanged', {hasChanges: this.hasChanges()});
        }
    }

    execute(command: Command) {
        const inverse = command.invoke();
        this.registerToUndo(inverse);
    }

    registerToUndo(command: Command) {
        const batch = this.topBatch();
        if (batch) {
            batch._inverses.push(command);
        } else {
            this._undoStack.push(command);
            this._redoStack.length = 0;
            this.source.trigger('historyChanged', {hasChanges: this.hasChanges()});
        }
    }

    private topBatch(): InMemoryBatch | undefined {
        return this.batches.length === 0 ? undefined : this.batches[this.batches.length - 1];
    }

    startBatch(metadataOrTitle?: CommandMetadata): CommandBatch {
        const metadata: CommandMetadata | undefined = typeof metadataOrTitle === 'string'
            ? {title: metadataOrTitle} : metadataOrTitle;
        const batch: InMemoryBatch = {
            _metadata: metadata ?? {},
            _inverses: [],
            history: this,
            store: () => {
                if (!this.batches.includes(batch)) {
                    console.warn('Failed to find batch to store (already stored or discarded?)', batch);
                    return;
                }
                while (this.batches.length > 0) {
                    const other = this.batches.pop()!;
                    if (other !== batch) {
                        console.warn('Storing other unclosed batch on top', other);
                    }
                    if (other._inverses.length > 0) {
                        const commands = [...other._inverses].reverse();
                        this.registerToUndo(Command.compound(batch._metadata, commands));
                    }
                    if (other === batch) {
                        break;
                    }
                }
            },
            discard: () => {
                if (!this.batches.includes(batch)) {
                    console.warn('Failed to find batch to store (already stored or discarded?)');
                    return;
                }
                while (this.batches.length > 0) {
                    const other = this.batches.pop();
                    if (other !== batch) {
                        console.warn('Discarding other unclosed batch on top', other);
                    }
                    if (other === batch) {
                        break;
                    }
                }
            },
        };
        this.batches.push(batch);
        return batch;
    }
}
