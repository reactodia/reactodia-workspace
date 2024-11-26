export class CircularBuffer {
    private buffer: Uint8Array;
    private _length = 0;
    private start = 0;
    private end = 0;

    constructor(initialSize = 16) {
        this.buffer = new Uint8Array(initialSize ?? 16);
    }

    get length(): number {
        return this._length;
    }

    ensureFreeCapacity(count: number): void {
        const requiredSize = this.length + count;
        const oldSize = this.buffer.length;
        if (requiredSize > oldSize) {
            const power = Math.ceil(Math.log2(requiredSize));
            const nextSize = Math.max(Math.pow(2, power), 16);
            const nextBuffer = new Uint8Array(nextSize);
            nextBuffer.set(this.buffer);
            this.buffer = nextBuffer;
            if (this.length > 0 && this.end <= this.start) {
                const nextStart = this.start + (nextSize - oldSize);
                this.buffer.copyWithin(nextStart, this.start, oldSize - this.start);
                this.start = nextStart;
            }
        }
    }

    private advanceStart(count: number): number {
        const freeToRead = freeAfterOffset(this.start, this.end, this.buffer.length);
        const readCount = Math.min(freeToRead, count);
        this.start += readCount;
        this._length -= readCount;
        if (this.start === this.buffer.length) {
            this.start = 0;
        }
        return readCount;
    }

    private advanceEnd(count: number): number {
        const freeToWrite = freeAfterOffset(this.end, this.start, this.buffer.length);
        const writeCount = Math.min(freeToWrite, count);
        this.end += writeCount;
        this._length += writeCount;
        if (this.end === this.buffer.length) {
            this.end = 0;
        }
        return writeCount;
    }

    *peekBytes(count = this.length): Iterable<Uint8Array> {
        if (count < 0 || count > this.length) {
            throw new Error('CircularBuffer: invalid byte count to peek');
        }
        let total = count;
        let peekOffset = this.start;
        while (total > 0) {
            const spanCount = freeAfterOffset(peekOffset, this.end, this.buffer.length);
            const readCount = Math.min(spanCount, total);
            yield this.buffer.subarray(peekOffset, peekOffset + readCount);
            total -= readCount;
            peekOffset += readCount;
            if (peekOffset >= this.buffer.length) {
                peekOffset = 0;
            }
        }
    }

    readBytes(count: number): Uint8Array {
        if (count < 0 || count > this.length) {
            throw new Error('CircularBuffer: invalid byte count to read');
        }
        const result = new Uint8Array(count);
        let resultOffset = 0;
        let totalToRead = count;
        while (totalToRead > 0) {
            const readOffset = this.start;
            const readCount = this.advanceStart(totalToRead);
            result.set(this.buffer.subarray(readOffset, readOffset + readCount), resultOffset);
            resultOffset += readCount;
            totalToRead -= readCount;
        }
        return result;
    }

    writeBytes(bytes: Uint8Array, count = bytes.length): void {
        if (count < 0 || count > bytes.length) {
            throw new Error('CircularBuffer: invalid offset and/or count to write bytes');
        }
        this.ensureFreeCapacity(count);
        let totalToWrite = count;
        while (totalToWrite > 0) {
            const writeOffset = this.end;
            const writeCount = this.advanceEnd(totalToWrite);
            this.buffer.set(bytes.subarray(0, writeCount), writeOffset);
            totalToWrite -= writeCount;
        }
    }

    readInt32(): number {
        if (this._length < 4) {
            throw new Error('CircularBuffer: not enough length to read Int32');
        }

        const b3 = this.buffer[this.start] << 24;
        this.advanceStart(1);

        const b2 = this.buffer[this.start] << 16;
        this.advanceStart(1);

        const b1 = this.buffer[this.start] << 8;
        this.advanceStart(1);

        const b0 = this.buffer[this.start];
        this.advanceStart(1);

        return b3 | b2 | b1 | b0;
    }

    writeInt32(value: number) {
        this.ensureFreeCapacity(4);

        this.buffer[this.end] = value >> 24 & 0xFF;
        this.advanceEnd(1);

        this.buffer[this.end] = value >> 16 & 0xFF;
        this.advanceEnd(1);

        this.buffer[this.end] = value >> 8 & 0xFF;
        this.advanceEnd(1);

        this.buffer[this.end] = value & 0xFF;
        this.advanceEnd(1);
    }
}

function freeAfterOffset(offset: number, another: number, length: number): number {
    return offset < another ? another - offset : length - offset;
}
