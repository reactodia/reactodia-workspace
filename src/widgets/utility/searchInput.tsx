import * as React from 'react';
import classnames from 'classnames';

import { Events, EventSource, PropertyChange } from '../../coreUtils/events';
import { useObservedProperty } from '../../coreUtils/hooks';
import { useTranslation } from '../../coreUtils/i18n';
import { Debouncer } from '../../coreUtils/scheduler';

export interface SearchInputProps {
    className?: string;
    inputProps?: React.HTMLProps<HTMLInputElement>;
    store: SearchInputStore;
    children?: React.ReactNode;
}

const CLASS_NAME = 'reactodia-search-input';

export function SearchInput(props: SearchInputProps) {
    const {
        className, inputProps = {}, store, children,
    } = props;

    const t = useTranslation();
    const term = useObservedProperty(store.events, 'changeValue', () => store.value);
    const mode = useObservedProperty(store.events, 'changeMode', () => store.mode);

    return (
        <div className={classnames(CLASS_NAME, className)}>
            <input {...inputProps}
                type={inputProps.type ?? 'text'}
                className={classnames(
                    `${CLASS_NAME}__input`,
                    'reactodia-form-control',
                    inputProps.className,
                )}
                placeholder={inputProps.placeholder ?? t.text('search_defaults.input.placeholder')}
                value={term}
                onChange={e => store.change({value: e.currentTarget.value, action: 'input'})}
                onKeyUp={e => {
                    if (e.key === 'Enter') {
                        store.change({value: store.value, action: 'submit'});
                    }
                }}
            />
            {store.value ? (
                <div className={`${CLASS_NAME}__clear-container`}>
                    <button type='button'
                        className={`${CLASS_NAME}__clear`}
                        title={t.text('search_defaults.input_clear.title')}
                        onClick={() => store.change({value: '', action: 'clear'})}>
                        <span aria-hidden='true'></span>
                    </button>
                </div>
            ) : null}
            {mode === 'explicit' ? (
                <button type='button'
                    title={t.text('search_defaults.input_submit.title')}
                    className={classnames(`${CLASS_NAME}__submit`, 'reactodia-btn', 'reactodia-btn-default')}
                    onClick={() => store.change({value: store.value, action: 'submit'})}>
                </button>
            ) : null}
            {children}
        </div>
    );
}

/**
 * Options for {@link useSearchInputStore} hook.
 *
 * @see {@link useSearchInputStore}
 */
export interface UseSearchInputStoreOptions<T> {
    /**
     * Initial value for the search state.
     */
    initialValue: T;
    /**
     * Submit timeout after input to submit the value for the search:
     *  - `(number)`: debounce time in milliseconds;
     *  - `immediate`: submit immediately after input;
     *  - `explicit`: submit only on explicit action.
     *
     * @default "immediate"
     */
    submitTimeout?: number | 'immediate' | 'explicit';
    /**
     * Validates whether the search value can be submitted,
     * e.g. the search term is at least some characters long.
     */
    allowSubmit?: (value: T) => boolean;
}

/**
 * Represents the state store for an abstract search input component.
 *
 * @see {@link useSearchInputStore}
 */
export interface SearchInputStore<T = string> {
    /**
     * Events for the search store.
     */
    readonly events: Events<SearchInputStoreEvents<T>>;
    /**
     * Current submit mode for the `input` value changes in the store:
     *  - `debounce`: submit after debounce timeout;
     *  - `immediate`: submit immediately after input;
     *  - `explicit`: submit only on explicit `submit` action.
     */
    get mode(): 'debounce' | 'immediate' | 'explicit';
    /**
     * Current search query value.
     */
    get value(): T;
    /**
     * Changes the search query value with specified intent (action).
     */
    change(params: {
        /**
         * New search query value.
         */
        value: T;
        /**
         * Change intent (action):
         *  - `input`: potentially transient change to the query value,
         *    likely to be superseded by another;
         *  - `submit`: explicit request to perform the search immediately;
         *  - `clear`: explicit or implicit request to clear the search query
         *    e.g. via specific button or if a new value is not allowed to
         *    be submitted.
         */
        action: 'input' | 'submit' | 'clear';
    }): void;
}

/**
 * Events date for {@link SearchInputStore} events.
 *
 * @see {@link SearchInputStore}
 */
export interface SearchInputStoreEvents<T> {
    /**
     * Triggered on {@link SearchInputStore.value} property change.
     */
    changeValue: SearchInputStoreChangeValueEvent<T>;
    /**
     * Triggered on {@link SearchInputStore.mode} property change.
     */
    changeMode: PropertyChange<SearchInputStore<T>, SearchInputStore['mode']>;
    /**
     * Triggered on a request to perform the search, either after debounce
     * timeout since last value change with `input` action or explicit
     * `submit` value change.
     */
    executeSearch: {
        /**
         * Event source (search input store).
         */
        readonly source: SearchInputStore<T>;
        /**
         * Current search query value.
         */
        readonly value: T;
    };
    /**
     * Triggered on a request to clear the search query, either after
     * value change with `clear` action or when submitted value does
     * not pass the validation.
     */
    clearSearch: {
        /**
         * Event source (search input store).
         */
        readonly source: SearchInputStore<T>;
        /**
         * Current search query value.
         */
        readonly value: T;
    };
}

/**
 * Event data for search query value change event.
 */
export interface SearchInputStoreChangeValueEvent<T> extends PropertyChange<SearchInputStore<T>, T> {
    /**
     * Search query value change intent (action).
     *
     * @see {@link SearchInputStore.change}
     */
    readonly action: 'input' | 'submit' | 'clear';
}

/**
 * React hook to create a search input state store with debounce support.
 *
 * **Experimental**: this feature are likely to change in the future.
 *
 * @returns stable {@link SearchInputStore} instance which will not change on re-renders
 *
 * @category Hooks
 */
export function useSearchInputStore<T = string>(
    params: UseSearchInputStoreOptions<T>
): SearchInputStore<T> {
    const {initialValue, submitTimeout = 'immediate', allowSubmit} = params;
    const [state] = React.useState(() => new StatefulSearchInputStore(initialValue));
    React.useEffect(() => {
        state.setDebounceTimeout(submitTimeout);
        state.setAllowSubmit(allowSubmit);
    });
    return state;
}

class StatefulSearchInputStore<T> implements SearchInputStore<T> {
    readonly events = new EventSource<SearchInputStoreEvents<T>>();

    private _value: T;
    private _mode: 'debounce' | 'immediate' | 'explicit' = 'debounce';
    private debouncer = new Debouncer(0);
    private allowSubmit: ((value: T) => boolean) | undefined;

    constructor(initialValue: T) {
        this._value = initialValue;
    }

    get mode(): 'debounce' | 'immediate' | 'explicit' {
        return this._mode;
    }

    get value(): T {
        return this._value;
    }

    setDebounceTimeout(timeout: number | 'immediate' | 'explicit'): void {
        switch (timeout) {
            case 'immediate':
            case 'explicit': {
                this.debouncer.setTimeout(0);
                this._mode = timeout;
                break;
            }
            default: {
                this.debouncer.setTimeout(timeout);
                this._mode = 'debounce';
                break;
            }
        }
    }

    setAllowSubmit(allowSubmit: ((value: T) => boolean) | undefined): void {
        this.allowSubmit = allowSubmit;
    }

    change(params: {
        value: T;
        action: 'input' | 'submit' | 'clear';
    }): void {
        const {value, action} = params;
        this.debouncer.dispose();
        if (!(value === this._value && action === 'input')) {
            const previous = this._value;
            this._value = value;
            this.events.trigger('changeValue', {source: this, previous, action});
        }
        switch (action) {
            case 'input': {
                if (this._mode !== 'explicit') {
                    this.trySubmit(value, {
                        debounce: this._mode === 'debounce',
                    });
                }
                break;
            }
            case 'submit': {
                this.trySubmit(value, {debounce: false});
                break;
            }
            case 'clear': {
                this.events.trigger('clearSearch', {source: this, value});
                break;
            }
        }
    }

    private trySubmit(value: T, options: { debounce: boolean }): void {
        if (!this.allowSubmit || this.allowSubmit(value)) {
            if (options.debounce) {
                this.debouncer.call(() =>
                    this.events.trigger('executeSearch', {source: this, value})
                );
            } else {
                this.events.trigger('executeSearch', {source: this, value});
            }
        } else {
            this.events.trigger('clearSearch', {source: this, value});
        }
    }
}
