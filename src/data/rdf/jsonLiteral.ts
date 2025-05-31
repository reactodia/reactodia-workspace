import { chainHash, hashNumber, hashString } from '@reactodia/hashmap';
import type * as RdfJs from '@rdfjs/types';
import type { DataFactory, Literal, NamedNode } from './rdfModel';

const JSON_DATATYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON';

export class JsonLiteral implements Literal {
    private static DATATYPES = new WeakMap<DataFactory, NamedNode>();
    private static AS_JSON = new WeakMap<Literal, JsonLiteral | undefined>();

    /**
     * Raw JSON-serializable value.
     */
    readonly content: unknown;
    readonly datatype: NamedNode;

    private _value: string | undefined;

    private constructor(content: unknown, datatype: NamedNode, value?: string) {
        this.content = content;
        this.datatype = datatype;
        this._value = value;
    }

    static create(factory: DataFactory, content: unknown) {
        let datatype = JsonLiteral.DATATYPES.get(factory);
        if (!datatype) {
            datatype = factory.namedNode(JSON_DATATYPE);
            JsonLiteral.DATATYPES.set(factory, datatype);
        }
        return new JsonLiteral(prepareJsonContent(content), datatype);
    }

    static fromLiteral(literal: Literal): JsonLiteral | undefined {
        if (literal instanceof JsonLiteral) {
            return literal;
        } else if (literal.datatype.value === JSON_DATATYPE) {
            if (JsonLiteral.AS_JSON.has(literal)) {
                return JsonLiteral.AS_JSON.get(literal);
            }
            let result: JsonLiteral | undefined;
            try {
                const parsed = JSON.parse(literal.value);
                result = new JsonLiteral(parsed, literal.datatype, literal.value);
            } catch (err) {
                /* ignore */
            }
            JsonLiteral.AS_JSON.set(literal, result);
            return result;
        } else {
            return undefined;
        }
    }

    static equal(a: JsonLiteral, b: JsonLiteral): boolean {
        return equalJsonContent(a.content, b.content);
    }

    static hash(literal: JsonLiteral): number {
        return hashJsonContent(literal.content);
    }

    get termType(): 'Literal' {
        return 'Literal';
    }

    get language(): string {
        return '';
    }

    get value(): string {
        if (this._value === undefined) {
            this._value = JSON.stringify(this.content);
        }
        return this._value;
    }

    equals(other: RdfJs.Term | null | undefined): boolean {
        if (other === undefined || other === null) {
            return false;
        } else {
            return (
                other.termType === 'Literal' &&
                this.datatype.equals(other.datatype) &&
                this.language === other.language &&
                // Compare values last to avoid serializing content if possible
                this.value === other.value
            );
        }
    }
}

function prepareJsonContent(value: unknown): unknown {
    switch (typeof value) {
        case 'object': {
            if (value === null) {
                return null;
            } else if ('toJSON' in value && typeof value.toJSON === 'function') {
                return value.toJSON();
            } else if (Array.isArray(value)) {
                return Array.from(value, prepareJsonContent);
            } else {
                const prepared: Record<string, unknown> = {};
                for (const key in value) {
                    if (Object.prototype.hasOwnProperty.call(value, key)) {
                        const property = (value as typeof prepared)[key];
                        if (property !== undefined) {
                            prepared[key] = prepareJsonContent(property);
                        }
                    }
                }
                return prepared;
            }
        }
        case 'number': {
            return Number.isFinite(value) ? value : null;
        }
        case 'string':
        case 'boolean': {
            return value;
        }
        case 'bigint': {
            // Throw native BigInt serialization error
            return JSON.stringify(value);
        }
        case 'undefined': 
        default: {
            return null;
        }
    }
}

function equalJsonContent(a: unknown, b: unknown) {
    if (a === b) {
        return true;
    }
    switch (typeof a) {
        case 'object': {
            if (typeof b !== 'object') {
                return false;
            } else if (a === null) {
                return b === null;
            } else if (Array.isArray(a)) {
                if (!(Array.isArray(b) && a.length === b.length)) {
                    return false;
                }
                for (let i = 0; i < a.length; i++) {
                    if (!equalJsonContent(a[i], b[i])) {
                        return false;
                    }
                }
            } else {
                for (const key in a) {
                    const aValue = Object.prototype.hasOwnProperty.call(a, key)
                        ? (a as Record<string, unknown>)[key]
                        : undefined;
                    const bValue = Object.prototype.hasOwnProperty.call(b, key)
                        ? (b as Record<string, unknown>)[key]
                        : undefined;
                    if (!equalJsonContent(aValue, bValue)) {
                        return false;
                    }
                }
                for (const key in b) {
                    const bValue = Object.prototype.hasOwnProperty.call(b, key)
                        ? (b as Record<string, unknown>)[key]
                        : undefined;
                    const aValue = Object.prototype.hasOwnProperty.call(a, key)
                        ? (a as Record<string, unknown>)[key]
                        : undefined;
                    if (bValue !== undefined && aValue === undefined) {
                        return false;
                    }
                }
            }
            return true;
        }
        default: {
            return false;
        }
    }
}

function hashJsonContent(value: unknown): number {
    let hash = 0;
    switch (typeof value) {
        case 'object': {
            if (value === null) {
                hash = chainHash(hash, 1);
            } else if (Array.isArray(value)) {
                hash = chainHash(hash, 5);
                hash = chainHash(hash, value.length);
                for (const item of value) {
                    hash = chainHash(hash, hashJsonContent(item));
                }
            } else {
                hash = chainHash(hash, 6);
                let propertiesHash = 0;
                for (const key in value) {
                    if (Object.prototype.hasOwnProperty.call(value, key)) {
                        const property = (value as Record<string, unknown>)[key];
                        if (property !== undefined) {
                            propertiesHash ^= chainHash(hashString(key), hashJsonContent(property));
                        }
                    }
                }
                hash = chainHash(hash, propertiesHash);
            }
            break;
        }
        case 'boolean': {
            hash = chainHash(hash, 2);
            hash = chainHash(hash, value ? 1 : 0);
            break;
        }
        case 'number': {
            hash = chainHash(hash, 3);
            hash = chainHash(hash, hashNumber(value));
            break;
        }
        case 'string': {
            hash = chainHash(hash, 4);
            hash = chainHash(hash, hashString(value));
            break;
        }
    }
    return hash;
}
