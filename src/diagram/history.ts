import { EventSource, Events } from '../viewUtils/events';

export interface Command {
    readonly title?: string;
    readonly invoke: CommandAction;
}

/** @returns Inverse command */
export type CommandAction = () => Command;

export namespace Command {
    export function create(title: string, action: CommandAction): Command {
        return new SimpleCommand(title, action);
    }

    export function effect(title: string, body: () => void): Command {
        return new EffectCommand(title, body);
    }

    export function compound(title: string | undefined, commands: ReadonlyArray<Command>): Command {
        return new CompoundCommand(title, commands);
    }
}

class SimpleCommand implements Command {
    constructor(
        readonly title: string,
        readonly invoke: CommandAction
    ) {}
}

class EffectCommand implements Command {
    private readonly skip: Command;

    constructor(
        readonly title: string,
        private readonly body: () => void
    ) {
        this.skip = {
            title: 'Skipped effect: ' + title,
            invoke: () => this,
        };
    }

    invoke(): Command {
        const {body} = this;
        body();
        return this.skip;
    }
}

class CompoundCommand {
    constructor(
        readonly title: string | undefined,
        private readonly commands: ReadonlyArray<Command>
    ) {}

    invoke(): Command {
        const inverses: Command[] = [];
        for (const command of this.commands) {
            inverses.push(command.invoke());
        }
        inverses.reverse();
        return new CompoundCommand(this.title, inverses);
    }
}

export interface CommandHistoryEvents {
    historyChanged: { hasChanges: boolean };
}

export interface CommandHistory {
    readonly events: Events<CommandHistoryEvents>;
    readonly undoStack: ReadonlyArray<Command>;
    readonly redoStack: ReadonlyArray<Command>;
    reset(): void;
    undo(): void;
    redo(): void;
    execute(command: Command): void;
    registerToUndo(command: Command): void;
    startBatch(title?: string): CommandBatch;
}

export interface CommandBatch {
    readonly history: CommandHistory;
    store(): void;
    discard(): void;
}

interface InMemoryBatch extends CommandBatch {
    readonly _title: string | undefined;
    readonly _inverses: Command[];
}

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
            this.source.trigger('historyChanged', {hasChanges: this.hasChanges()});
        }
    }

    private topBatch(): InMemoryBatch | undefined {
        return this.batches.length === 0 ? undefined : this.batches[this.batches.length - 1];
    }

    startBatch(title?: string): CommandBatch {
        const batch: InMemoryBatch = {
            _title: title,
            _inverses: [],
            history: this,
            store: () => {
                if (this.batches.includes(batch)) {
                    console.warn('Failed to find batch to store (already stored or discarded?)', batch);
                }
                while (this.batches.length > 0) {
                    const other = this.batches.pop()!;
                    if (other !== batch) {
                        console.warn('Storing other unclosed batch on top', other);
                    }
                    if (other._inverses.length > 0) {
                        const commands = [...other._inverses].reverse();
                        this.registerToUndo(Command.compound(batch._title, commands));
                    }
                    if (other === batch) {
                        break;
                    }
                }
            },
            discard: () => {
                if (!this.batches.includes(batch)) {
                    console.warn('Failed to find batch to store (already stored or discarded?)');
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
